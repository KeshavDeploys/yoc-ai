export class VoicePlayer {
  private context: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private next = 0;
  private disposed = false;
  constructor(private changed: () => void) {}
  get playing() { return this.sources.size > 0; }
  async initialize() {
    this.context = new AudioContext();
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("Click Start again to enable browser audio.");
  }
  play(data: string, mime: string) {
    const context = this.context;
    if (this.disposed || !context) return;
    if (context.state !== "running") throw new Error("Audio suspended. Stop and reconnect from a button click.");
    const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
    if (rate < 8000 || rate > 96000) throw new Error("Unsupported output audio rate.");
    const raw = atob(data);
    if (!raw.length) return;
    if (raw.length % 2) throw new Error("Invalid PCM chunk.");
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const audio = context.createBuffer(1, bytes.length / 2, rate);
    const samples = audio.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    if (this.next - context.currentTime > 30) throw new Error("Playback queue exceeded 30 seconds.");
    const source = context.createBufferSource();
    source.buffer = audio;
    source.connect(context.destination);
    const start = Math.max(context.currentTime + 0.02, this.next);
    this.next = start + audio.duration;
    this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); this.changed(); };
    source.start(start);
    this.changed();
  }
  stop() {
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect();
    }
    this.sources.clear(); this.next = this.context?.currentTime ?? 0; this.changed();
  }
  async dispose() {
    this.disposed = true; this.stop();
    const context = this.context; this.context = null;
    if (context && context.state !== "closed") await context.close();
  }
}