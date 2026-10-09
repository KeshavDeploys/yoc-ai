export type GateEvents = { start: () => void; audio: (frame: Float32Array) => void; end: () => void };

// Silero probabilities decide whether to open the stream; RMS alone is never used as speech detection.
export class SpeechGate {
  private buffer: Float32Array[] = [];
  private evidence = 0;
  private silence = 0;
  active = false;
  constructor(private events: GateEvents) {}
  reset() {
    const wasActive = this.active;
    this.active = false;
    this.buffer = [];
    this.evidence = this.silence = 0;
    if (wasActive) this.events.end();
  }
  frame(frame: Float32Array, probability: number, aiSpeaking: boolean, enabled: boolean, held: boolean, pushToTalk: boolean) {
    if (!enabled || (pushToTalk && !held)) { this.reset(); return; }
    const ms = frame.length / 16;
    if (this.active) {
      this.events.audio(frame);
      if (pushToTalk) return;
      this.silence = probability >= 0.45 ? 0 : this.silence + ms;
      if (this.silence >= 1200) this.reset();
      return;
    }
    this.buffer.push(frame.slice());
    while (this.buffer.length > Math.ceil(640 / ms)) this.buffer.shift();
    this.evidence = probability >= (aiSpeaking ? 0.9 : 0.8) ? this.evidence + ms : Math.max(0, this.evidence - ms * 2);
    if (!pushToTalk && this.evidence < (aiSpeaking ? 384 : 256)) return;
    this.active = true;
    this.events.start();
    for (const buffered of this.buffer) this.events.audio(buffered);
    this.buffer = [];
  }
}