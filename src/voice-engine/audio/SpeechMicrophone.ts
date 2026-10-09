import type { MicVAD } from "@ricky0123/vad-web";
import { SpeechGate } from "./SpeechGate";

export class SpeechMicrophone {
  private vad: MicVAD | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private disposed = false;
  private enabled = false;
  private gate: SpeechGate | null = null;
  private held = false;
  private initializing: Promise<void> | null = null;
  pushToTalk = false;
  constructor(private events: {
    start: () => void; audio: (data: string) => void; end: () => void;
    meter: (probability: number) => void; error: (error: Error) => void; aiSpeaking: () => boolean;
  }) {}
  async initialize() {
    this.initializing = this.initializeResources();
    return this.initializing;
  }
  private async initializeResources() {
    this.context = new AudioContext();
    await this.context.resume();
    if (this.disposed) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false,
    }, video: false });
    if (this.disposed) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    stream.getAudioTracks().forEach(t => {
      t.onended = () => { if (!this.disposed) this.events.error(new Error("Microphone disconnected.")); };
    });
    const { MicVAD } = await import("@ricky0123/vad-web");
    if (this.disposed) return;
    this.gate = new SpeechGate({
      start: this.events.start, end: this.events.end,
      audio: frame => {
        const bytes = new Uint8Array(frame.length * 2);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < frame.length; i++) {
          const n = Math.max(-1, Math.min(1, frame[i]));
          view.setInt16(i * 2, Math.round(n * (n < 0 ? 32768 : 32767)), true);
        }
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        this.events.audio(btoa(binary));
      },
    });
    const vad = await MicVAD.new({ model: "v5", startOnLoad: false, processorType: "AudioWorklet",
      ortConfig: ort => { ort.env.wasm.numThreads = 1; },
      audioContext: this.context!, baseAssetPath: "/voice-vad/", onnxWASMBasePath: "/voice-vad/",
      getStream: async () => stream,
      onFrameProcessed: (probs, frame) => {
        if (this.disposed) return;
        try {
          this.events.meter(probs.isSpeech);
          this.gate?.frame(frame, probs.isSpeech, this.events.aiSpeaking(), this.enabled, this.held, this.pushToTalk);
        } catch (error) { this.events.error(error instanceof Error ? error : new Error("Audio processing failed.")); }
      },
    });
    this.vad = vad;
    // Finish attaching VAD before destroying it: vad-web 0.0.30 cannot destroy an unstarted instance.
    // A concurrent dispose stops microphone tracks immediately and waits for this setup to settle.
    await vad.start();
    if (vad.errored || !vad.listening) throw new Error(vad.errored || "Speech detector did not start.");
  }
  enable(value: boolean) {
    this.enabled = value;
    if (!value) this.gate?.reset();
    this.stream?.getAudioTracks().forEach(t => { t.enabled = value; });
  }
  hold(value: boolean) { this.held = value; if (!value && this.pushToTalk) this.gate?.reset(); }
  setMode(pushToTalk: boolean) { this.gate?.reset(); this.pushToTalk = pushToTalk; this.held = false; }
  async dispose() {
    this.disposed = true;
    this.enabled = false;
    this.gate?.reset();
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    await this.initializing?.catch(() => {});
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    this.stream = null;
    const vad = this.vad; this.vad = null;
    const context = this.context; this.context = null;
    try { await vad?.destroy(); }
    finally { if (context && context.state !== "closed") await context.close(); }
  }
}