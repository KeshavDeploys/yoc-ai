export interface CameraInfo {
  width: number;
  height: number;
  frameRate?: number;
  deviceId?: string;
  facingMode?: string;
}

export class CameraManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  /**
   * Requests camera access and attaches the stream
   * to the supplied <video> element.
   */
  async start(videoElement: HTMLVideoElement): Promise<CameraInfo> {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error("Camera access is not supported by this browser.");
    }

    // Prevent multiple camera streams if start() is accidentally called twice.
    this.stop();

    const constraints: MediaStreamConstraints = {
      audio: false,

      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: { ideal: "user" },
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      this.videoElement = videoElement;
      this.videoElement.srcObject = this.stream;

      // Important for mobile/Safari behavior.
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      await this.waitForMetadata(this.videoElement);
      await this.videoElement.play();

      return this.getCameraInfo();
    } catch (error) {
      // Make sure partially-created resources are cleaned up.
      this.stop();

      if (error instanceof DOMException) {
        switch (error.name) {
          case "NotAllowedError":
            throw new Error("Camera permission was denied.");

          case "NotFoundError":
            throw new Error("No camera was found.");

          case "NotReadableError":
            throw new Error(
              "The camera could not be started. It may already be in use.",
            );

          case "OverconstrainedError":
            throw new Error(
              "The requested camera configuration is not available.",
            );

          case "SecurityError":
            throw new Error(
              "Camera access was blocked because of browser security restrictions.",
            );
        }
      }

      throw error;
    }
  }

  /**
   * Returns the settings the browser actually negotiated.
   *
   * These may differ from our ideal 1280x720 @ 30 FPS request.
   */
  getCameraInfo(): CameraInfo {
    if (!this.stream || !this.videoElement) {
      throw new Error("Camera is not running.");
    }

    const track = this.stream.getVideoTracks()[0];

    if (!track) {
      throw new Error("No active video track was found.");
    }

    const settings = track.getSettings();

    return {
      width: this.videoElement.videoWidth || settings.width || 0,
      height: this.videoElement.videoHeight || settings.height || 0,
      frameRate: settings.frameRate,
      deviceId: settings.deviceId,
      facingMode: settings.facingMode,
    };
  }

  /**
   * Completely releases the webcam.
   */
  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }

      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  isRunning(): boolean {
    return this.stream !== null;
  }

  private waitForMetadata(video: HTMLVideoElement): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const handleLoadedMetadata = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error("Failed to load camera video metadata."));
      };

      const cleanup = () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("error", handleError);
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("error", handleError);
    });
  }
}