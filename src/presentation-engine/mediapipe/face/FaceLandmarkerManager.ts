import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

export interface FaceDetectionResult {
  faceDetected: boolean;
  faceCount: number;
  inferenceLatencyMs: number;
  result: FaceLandmarkerResult;
}

export class FaceLandmarkerManager {
  private landmarker: FaceLandmarker | null = null;

  private initialized = false;

  /*
   * MediaPipe VIDEO mode requires timestamps to be
   * strictly monotonically increasing.
   *
   * We therefore maintain our own last timestamp and
   * guarantee that every inference receives a newer one.
   */
  private lastTimestampMs = -1;

  /**
   * Initialize MediaPipe WASM and Face Landmarker.
   */
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
        await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
                "/models/face_landmarker.task",

              delegate: "GPU",
            },

            runningMode: "VIDEO",

            /*
             * YOC.ai analyzes one interview candidate.
             */
            numFaces: 1,

            minFaceDetectionConfidence: 0.5,

            minFacePresenceConfidence: 0.5,

            minTrackingConfidence: 0.5,

            /*
             * Not needed during Milestone 1.
             */
            outputFaceBlendshapes: false,

            outputFacialTransformationMatrixes:
              true,
          },
        );

      /*
       * Reset timestamp state whenever a new
       * MediaPipe graph is created.
       */
      this.lastTimestampMs = -1;

      this.initialized = true;

      console.log(
        "[FaceLandmarkerManager] Initialized",
      );
    } catch (error) {
      this.close();

      console.error(
        "[FaceLandmarkerManager] Initialization failed:",
        error,
      );

      throw error;
    }
  }

  /**
   * Run Face Landmarker inference on the
   * current video frame.
   */
  detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): FaceDetectionResult {
    if (
      !this.initialized ||
      !this.landmarker
    ) {
      throw new Error(
        "Face Landmarker has not been initialized.",
      );
    }

    /*
     * MediaPipe internally works with timestamp values
     * that must ALWAYS move forward.
     *
     * performance.now() is high-resolution, but internal
     * conversion/rounding can cause two timestamps to
     * effectively become identical.
     *
     * Convert to whole milliseconds and explicitly enforce
     * monotonic progression.
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

    const faceCount =
      result.faceLandmarks.length;

    return {
      faceDetected:
        faceCount > 0,

      faceCount,

      inferenceLatencyMs,

      result,
    };
  }

  /**
   * Release MediaPipe resources.
   */
  close(): void {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch (error) {
        console.warn(
          "[FaceLandmarkerManager] Error while closing:",
          error,
        );
      }

      this.landmarker = null;
    }

    this.initialized = false;

    /*
     * A future initialization creates a fresh graph,
     * so timestamp tracking must also start fresh.
     */
    this.lastTimestampMs = -1;

    console.log(
      "[FaceLandmarkerManager] Closed",
    );
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}