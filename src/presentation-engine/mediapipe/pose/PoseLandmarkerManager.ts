import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

export interface PoseDetectionResult {
  poseDetected: boolean;
  poseCount: number;
  inferenceLatencyMs: number;
  result: PoseLandmarkerResult;
}

export class PoseLandmarkerManager {
  private landmarker: PoseLandmarker | null = null;

  private initialized = false;

  /*
   * VIDEO mode requires strictly increasing timestamps.
   */
  private lastTimestampMs = -1;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const vision =
        await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.1/wasm",
        );

      this.landmarker =
        await PoseLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                "/models/pose_landmarker_lite.task",

              delegate: "GPU",
            },

            runningMode: "VIDEO",

            /*
             * One interview candidate.
             */
            numPoses: 1,

            minPoseDetectionConfidence: 0.5,

            minPosePresenceConfidence: 0.5,

            minTrackingConfidence: 0.5,

            /*
             * Segmentation isn't required for YOC.ai.
             * Disabling it avoids unnecessary work.
             */
            outputSegmentationMasks: false,
          },
        );

      this.lastTimestampMs = -1;

      this.initialized = true;

      console.log(
        "[PoseLandmarkerManager] Initialized",
      );
    } catch (error) {
      this.close();

      console.error(
        "[PoseLandmarkerManager] Initialization failed:",
        error,
      );

      throw error;
    }
  }

  detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): PoseDetectionResult {
    if (
      !this.initialized ||
      !this.landmarker
    ) {
      throw new Error(
        "Pose Landmarker has not been initialized.",
      );
    }

    /*
     * Protect MediaPipe from equal/backwards timestamps,
     * just like our Face Landmarker wrapper.
     */
    let safeTimestamp =
      Math.floor(timestampMs);

    if (
      safeTimestamp <=
      this.lastTimestampMs
    ) {
      safeTimestamp =
        this.lastTimestampMs + 1;
    }

    this.lastTimestampMs =
      safeTimestamp;

    const inferenceStart =
      performance.now();

    const result =
      this.landmarker.detectForVideo(
        video,
        safeTimestamp,
      );

    const inferenceEnd =
      performance.now();

    const inferenceLatencyMs =
      inferenceEnd -
      inferenceStart;

    const poseCount =
      result.landmarks.length;

    return {
      poseDetected:
        poseCount > 0,

      poseCount,

      inferenceLatencyMs,

      result,
    };
  }

  close(): void {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch (error) {
        console.warn(
          "[PoseLandmarkerManager] Error while closing:",
          error,
        );
      }

      this.landmarker = null;
    }

    this.initialized = false;

    this.lastTimestampMs = -1;

    console.log(
      "[PoseLandmarkerManager] Closed",
    );
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}