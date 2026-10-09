export class AudioPlayer {
  private context: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private disposed = false;

  async initialize(): Promise<void> {
    if (this.disposed) {
      throw new Error("Audio player has already been disposed.");
    }

    if (!this.context) {
      this.context = new AudioContext();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    if (this.context.state !== "running") {
      throw new Error(
        "Browser audio is paused. Click Connect again to enable playback.",
      );
    }
  }

  playChunk(
    base64Audio: string,
    mimeType = "audio/pcm;rate=24000",
  ): void {
    const context = this.context;

    if (this.disposed || !context) return;

    if (context.state !== "running") {
      throw new Error("Audio playback is suspended by the browser.");
    }

    const sampleRateMatch = mimeType.match(/rate=(\d+)/);
    const sampleRate = sampleRateMatch
      ? Number(sampleRateMatch[1])
      : 24_000;

    if (
      !Number.isFinite(sampleRate) ||
      sampleRate < 8_000 ||
      sampleRate > 96_000
    ) {
      throw new Error("Unsupported audio sample rate.");
    }

    const binary = atob(base64Audio);

    if (binary.length === 0) return;

    if (binary.length % 2 !== 0) {
      throw new Error("Received an invalid PCM audio chunk.");
    }

    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const view = new DataView(bytes.buffer);
    const sampleCount = bytes.length / 2;

    const buffer = context.createBuffer(
      1,
      sampleCount,
      sampleRate,
    );

    const channel = buffer.getChannelData(0);

    for (let index = 0; index < sampleCount; index += 1) {
      // Gemini audio is signed 16-bit little-endian PCM.
      channel[index] = view.getInt16(index * 2, true) / 32768;
    }

    if (this.nextStartTime - context.currentTime > 30) {
      this.stop();
      throw new Error("Audio playback queue exceeded 30 seconds.");
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startTime = Math.max(
      context.currentTime + 0.02,
      this.nextStartTime,
    );

    this.nextStartTime = startTime + buffer.duration;
    this.sources.add(source);

    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };

    source.start(startTime);
  }

  stop(): void {
    for (const source of this.sources) {
      source.onended = null;

      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }

      source.disconnect();
    }

    this.sources.clear();
    this.nextStartTime = this.context?.currentTime ?? 0;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stop();

    const context = this.context;
    this.context = null;

    if (context && context.state !== "closed") {
      await context.close();
    }
  }
}