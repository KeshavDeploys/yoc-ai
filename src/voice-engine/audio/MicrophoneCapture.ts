export type MicrophoneChunk = {
  data: string;
  mimeType: string;
};

export class MicrophoneCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;

  private stopped = false;
  private started = false;

  async start(
    onChunk: (chunk: MicrophoneChunk) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    if (this.started || this.stopped) {
      throw new Error("Create a new microphone capture for each connection.");
    }

    this.started = true;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Microphone capture requires localhost or HTTPS in a supported browser.",
      );
    }

    try {
      const context = new AudioContext();
      this.context = context;

      // Start from the Connect button's user interaction.
      await context.resume();

      if (this.stopped) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Permission may resolve after the user cancels.
      if (this.stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;

      for (const track of stream.getAudioTracks()) {
        track.onended = () => {
          if (!this.stopped) {
            onError(new Error("Microphone disconnected or permission revoked."));
          }
        };
      }

      await context.audioWorklet.addModule(
        "/audio/microphone-processor.js",
      );

      if (this.stopped) return;

      const worklet = new AudioWorkletNode(
        context,
        "yoc-microphone",
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        },
      );

      this.worklet = worklet;

      worklet.onprocessorerror = () => {
        if (!this.stopped) {
          onError(new Error("Microphone audio processing failed."));
        }
      };

      worklet.port.onmessage = (
        event: MessageEvent<Float32Array>,
      ) => {
        if (this.stopped) return;

        try {
          const samples = event.data;
          const bytes = new Uint8Array(samples.length * 2);
          const view = new DataView(bytes.buffer);

          for (let index = 0; index < samples.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, samples[index]));

            const pcm = Math.round(
              sample < 0 ? sample * 32768 : sample * 32767,
            );

            view.setInt16(index * 2, pcm, true);
          }

          let binary = "";

          for (let index = 0; index < bytes.length; index += 1) {
            binary += String.fromCharCode(bytes[index]);
          }

          onChunk({
            data: btoa(binary),
            mimeType: `audio/pcm;rate=${context.sampleRate}`,
          });
        } catch (error) {
          onError(
            error instanceof Error
              ? error
              : new Error("Could not send microphone audio."),
          );
        }
      };

      this.source = context.createMediaStreamSource(stream);
      this.source.connect(worklet);

      // Keeps processing active. The worklet outputs silence.
      worklet.connect(context.destination);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;

    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.onprocessorerror = null;
      this.worklet.port.close();
      this.worklet.disconnect();
      this.worklet = null;
    }

    this.source?.disconnect();
    this.source = null;

    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    this.stream = null;

    const context = this.context;
    this.context = null;

    if (context && context.state !== "closed") {
      await context.close();
    }
  }
}