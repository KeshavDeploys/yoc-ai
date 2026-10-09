class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Approximately 40 milliseconds per chunk.
    this.chunkSize = Math.round(sampleRate * 0.04);
    this.samples = new Float32Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const channels = inputs[0];

    if (!channels || channels.length === 0) {
      return true;
    }

    const frameCount = channels[0].length;

    for (let frame = 0; frame < frameCount; frame += 1) {
      let sample = 0;

      // Mix available input channels to mono.
      for (let channel = 0; channel < channels.length; channel += 1) {
        sample += channels[channel][frame];
      }

      this.samples[this.offset] = sample / channels.length;
      this.offset += 1;

      if (this.offset === this.chunkSize) {
        const chunk = this.samples;

        this.port.postMessage(chunk, [chunk.buffer]);

        this.samples = new Float32Array(this.chunkSize);
        this.offset = 0;
      }
    }

    // Output remains silent; microphone monitoring is disabled.
    return true;
  }
}

registerProcessor("yoc-microphone", MicrophoneProcessor);