import type {
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";


export interface BlinkMetrics {
  leftEyeOpenness: number;

  rightEyeOpenness: number;

  averageEyeOpenness: number;

  eyesClosed: boolean;

  sampleCount: number;
}


type EyeState =
  | "open"
  | "closed";


interface EyeIndices {
  outer: number;

  inner: number;

  upper1: number;

  upper2: number;

  lower1: number;

  lower2: number;
}


/*
 * MediaPipe Face Mesh landmark indices.
 */
const LEFT_EYE: EyeIndices = {
  outer: 33,

  inner: 133,

  upper1: 159,

  upper2: 160,

  lower1: 145,

  lower2: 144,
};


const RIGHT_EYE: EyeIndices = {
  outer: 362,

  inner: 263,

  upper1: 386,

  upper2: 385,

  lower1: 374,

  lower2: 380,
};


export class BlinkAnalyzer {
  private readonly closedThreshold =
    0.18;


  private readonly openThreshold =
    0.22;


  /*
   * Require multiple closed samples so a
   * noisy landmark frame cannot immediately
   * mark the eyes as closed.
   *
   * At ~12 FPS, 2 frames ≈ 167 ms.
   */
  private readonly minimumClosedSamples =
    2;


  private eyeState:
    EyeState = "open";


  private consecutiveClosedSamples =
    0;


  private sampleCount =
    0;


  /*
   * ==========================================
   * PROCESS
   * ==========================================
   */

  process(
    landmarks:
      NormalizedLandmark[],
  ): BlinkMetrics | null {
    if (
      landmarks.length < 468
    ) {
      return null;
    }


    this.sampleCount +=
      1;


    /*
     * ========================================
     * EYE OPENNESS
     * ========================================
     */

    const left =
      this.calculateEyeOpenness(
        landmarks,
        LEFT_EYE,
      );


    const right =
      this.calculateEyeOpenness(
        landmarks,
        RIGHT_EYE,
      );


    const average =
      (left + right) / 2;


    /*
     * ========================================
     * EYE STATE
     * ========================================
     *
     * We intentionally keep eye-state
     * detection while removing blink
     * frequency tracking.
     *
     * YOC.ai does not treat natural blinking
     * as presentation quality.
     *
     * Eyes Closed remains useful telemetry
     * for detecting sustained eye closure,
     * poor visibility, or potentially
     * unusable visual samples.
     *
     * Hysteresis uses separate close/open
     * thresholds to prevent rapid state
     * oscillation near one threshold.
     */

    if (
      this.eyeState === "open"
    ) {
      if (
        average <
        this.closedThreshold
      ) {
        this.consecutiveClosedSamples +=
          1;


        if (
          this.consecutiveClosedSamples >=
          this.minimumClosedSamples
        ) {
          this.eyeState =
            "closed";
        }
      } else {
        this.consecutiveClosedSamples =
          0;
      }
    } else {
      if (
        average >
        this.openThreshold
      ) {
        this.eyeState =
          "open";


        this.consecutiveClosedSamples =
          0;
      }
    }


    return {
      leftEyeOpenness:
        left,

      rightEyeOpenness:
        right,

      averageEyeOpenness:
        average,

      eyesClosed:
        this.eyeState ===
        "closed",

      sampleCount:
        this.sampleCount,
    };
  }


  /*
   * ==========================================
   * RESET
   * ==========================================
   */

  reset(): void {
    this.eyeState =
      "open";


    this.consecutiveClosedSamples =
      0;


    this.sampleCount =
      0;
  }


  /*
   * ==========================================
   * EYE OPENNESS
   * ==========================================
   */

  private calculateEyeOpenness(
    landmarks:
      NormalizedLandmark[],
    eye:
      EyeIndices,
  ): number {
    const outer =
      landmarks[eye.outer];


    const inner =
      landmarks[eye.inner];


    const upper1 =
      landmarks[eye.upper1];


    const upper2 =
      landmarks[eye.upper2];


    const lower1 =
      landmarks[eye.lower1];


    const lower2 =
      landmarks[eye.lower2];


    const horizontal =
      this.distance(
        outer,
        inner,
      );


    if (
      horizontal <=
      0.000001
    ) {
      return 0;
    }


    const vertical1 =
      this.distance(
        upper1,
        lower1,
      );


    const vertical2 =
      this.distance(
        upper2,
        lower2,
      );


    const vertical =
      (
        vertical1 +
        vertical2
      ) / 2;


    return (
      vertical /
      horizontal
    );
  }


  /*
   * ==========================================
   * UTIL
   * ==========================================
   */

  private distance(
    a:
      NormalizedLandmark,
    b:
      NormalizedLandmark,
  ): number {
    const dx =
      a.x - b.x;


    const dy =
      a.y - b.y;


    return Math.sqrt(
      dx * dx +
      dy * dy,
    );
  }
}