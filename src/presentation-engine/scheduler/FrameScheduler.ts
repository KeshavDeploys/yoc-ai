export interface FrameSchedulerOptions {
  targetFps?: number;
}

export interface ScheduledFrame {
  timestamp: number;
  mediaTime: number;
  frameNumber: number;
}

type FrameCallback = (
  frame: ScheduledFrame,
) => void | Promise<void>;

export class FrameScheduler {
  private readonly targetFps: number;
  private readonly minimumIntervalMs: number;

  private running = false;
  private processing = false;

  private lastAnalysisTime = 0;
  private frameNumber = 0;

  private video: HTMLVideoElement | null = null;
  private callback: FrameCallback | null = null;

  private videoFrameHandle: number | null = null;
  private animationFrameHandle: number | null = null;

  constructor(options: FrameSchedulerOptions = {}) {
    this.targetFps = options.targetFps ?? 12;

    if (this.targetFps <= 0) {
      throw new Error(
        "FrameScheduler target FPS must be greater than 0.",
      );
    }

    this.minimumIntervalMs = 1000 / this.targetFps;
  }

  /**
   * Starts scheduling frames from the supplied video element.
   */
  start(
    video: HTMLVideoElement,
    callback: FrameCallback,
  ): void {
    if (this.running) {
      return;
    }

    this.video = video;
    this.callback = callback;

    this.running = true;
    this.processing = false;

    this.lastAnalysisTime = 0;
    this.frameNumber = 0;

    this.scheduleNextFrame();
  }

  /**
   * Stops all scheduling and releases references.
   */
  stop(): void {
    this.running = false;
    this.processing = false;

    if (
      this.videoFrameHandle !== null &&
      this.video &&
      typeof this.video.cancelVideoFrameCallback === "function"
    ) {
      this.video.cancelVideoFrameCallback(
        this.videoFrameHandle,
      );
    }

    if (this.animationFrameHandle !== null) {
      cancelAnimationFrame(
        this.animationFrameHandle,
      );
    }

    this.videoFrameHandle = null;
    this.animationFrameHandle = null;

    this.video = null;
    this.callback = null;

    this.lastAnalysisTime = 0;
    this.frameNumber = 0;
  }

  /**
   * Returns whether the scheduler is currently active.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Returns the configured analysis target FPS.
   */
  getTargetFps(): number {
    return this.targetFps;
  }

  /**
   * Chooses the best available browser scheduling mechanism.
   */
  private scheduleNextFrame(): void {
    if (!this.running || !this.video) {
      return;
    }

    /*
     * Preferred path:
     *
     * requestVideoFrameCallback runs when a new video
     * frame is presented by the browser.
     */
    if (
      typeof this.video.requestVideoFrameCallback ===
      "function"
    ) {
      this.videoFrameHandle =
        this.video.requestVideoFrameCallback(
          this.handleVideoFrame,
        );

      return;
    }

    /*
     * Fallback:
     *
     * requestAnimationFrame is available across the
     * browsers we are targeting.
     */
    this.animationFrameHandle =
      requestAnimationFrame(
        this.handleAnimationFrame,
      );
  }

  /**
   * Called when the browser presents a video frame.
   */
  private handleVideoFrame = (
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata,
  ): void => {
    this.videoFrameHandle = null;

    this.processFrame(
      now,
      metadata.mediaTime,
    );

    this.scheduleNextFrame();
  };

  /**
   * Fallback callback for browsers/environments without
   * requestVideoFrameCallback.
   */
  private handleAnimationFrame = (
    now: DOMHighResTimeStamp,
  ): void => {
    this.animationFrameHandle = null;

    const mediaTime =
      this.video?.currentTime ?? 0;

    this.processFrame(
      now,
      mediaTime,
    );

    this.scheduleNextFrame();
  };

  /**
   * Determines whether the current frame should actually
   * be sent to the analysis pipeline.
   */
  private processFrame(
    now: number,
    mediaTime: number,
  ): void {
    if (
      !this.running ||
      !this.callback ||
      this.processing
    ) {
      return;
    }

    const elapsed =
      now - this.lastAnalysisTime;

    /*
     * Camera may produce ~30 FPS while analysis only
     * needs ~12 FPS.
     *
     * Frames arriving too early are intentionally dropped.
     */
    if (
      this.lastAnalysisTime !== 0 &&
      elapsed < this.minimumIntervalMs
    ) {
      return;
    }

    /*
     * Advance according to our desired schedule rather
     * than simply assigning `now`.
     *
     * This prevents small timing delays from accumulating
     * and gradually lowering the effective analysis FPS.
     */
    if (this.lastAnalysisTime === 0) {
      this.lastAnalysisTime = now;
    } else {
      this.lastAnalysisTime +=
        this.minimumIntervalMs;

      /*
       * If the tab/browser/device stalled for a significant
       * amount of time, reset timing instead of trying to
       * catch up old frames.
       */
      if (
        now - this.lastAnalysisTime >
        this.minimumIntervalMs
      ) {
        this.lastAnalysisTime = now;
      }
    }

    this.frameNumber += 1;

    const frame: ScheduledFrame = {
      timestamp: now,
      mediaTime,
      frameNumber: this.frameNumber,
    };

    this.processing = true;

    /*
     * Promise.resolve allows both synchronous and
     * asynchronous analysis callbacks.
     *
     * Later this callback will run MediaPipe inference.
     */
    Promise.resolve(
      this.callback(frame),
    )
      .catch((error) => {
        console.error(
          "[FrameScheduler] Frame processing failed:",
          error,
        );
      })
      .finally(() => {
        this.processing = false;
      });
  }
}