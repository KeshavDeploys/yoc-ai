import type {
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";


export type PostureQuality =
  | "good"
  | "leaning"
  | "slouched"
  | "uncertain";


export interface UpperBodyMetrics {
  posture: PostureQuality;

  shouldersVisible: boolean;

  /*
   * Absolute angle of the shoulder line.
   *
   * 0° = approximately level shoulders.
   */
  shoulderTiltDegrees: number;

  /*
   * Kept for compatibility with the current
   * diagnostics/session interfaces.
   *
   * IMPORTANT:
   * YOC.ai no longer uses hips, so this value
   * represents horizontal shoulder-center
   * displacement from the camera center.
   *
   * It is NOT shoulder-vs-hip torso lean.
   */
  torsoLean: number;

  centered: boolean;

  stabilityScore: number;

  goodPosturePercent: number;

  sampleCount: number;
}


export interface UpperBodyAnalyzerOptions {
  /*
   * Maximum shoulder-line angle still
   * considered naturally balanced.
   */
  shoulderTiltThreshold?: number;

  /*
   * Maximum horizontal displacement of the
   * shoulder midpoint from camera center.
   *
   * Kept under the old option name so we do
   * not break existing construction code.
   */
  torsoLeanThreshold?: number;

  /*
   * Number of recent pose samples used for
   * shoulder movement stability.
   *
   * At ~4 FPS:
   * 20 samples ~= 5 seconds.
   */
  stabilityWindowSize?: number;
}


interface BodySample {
  shoulderCenterX: number;

  shoulderCenterY: number;

  shoulderTiltDegrees: number;
}


/*
 * MediaPipe Pose:
 *
 * 11 = left shoulder
 * 12 = right shoulder
 *
 * No hip landmarks are used anywhere in
 * this analyzer.
 */
const LEFT_SHOULDER = 11;

const RIGHT_SHOULDER = 12;


export class UpperBodyAnalyzer {
  private readonly shoulderTiltThreshold:
    number;

  private readonly centerOffsetThreshold:
    number;

  private readonly stabilityWindowSize:
    number;


  private samples:
    BodySample[] = [];


  private totalSamples =
    0;

  private goodPostureSamples =
    0;


  constructor(
    options:
      UpperBodyAnalyzerOptions = {},
  ) {
    /*
     * Webcam perspective and natural shoulder
     * asymmetry can create several degrees of
     * apparent tilt even with normal posture.
     */
    this.shoulderTiltThreshold =
      options.shoulderTiltThreshold ??
      12;


    /*
     * Shoulder midpoint may move naturally
     * while speaking.
     *
     * 0.18 means roughly +/-18% of normalized
     * image width from the center.
     */
    this.centerOffsetThreshold =
      options.torsoLeanThreshold ??
      0.18;


    this.stabilityWindowSize =
      options.stabilityWindowSize ??
      20;
  }


  /*
   * ==========================================
   * PROCESS
   * ==========================================
   */

  process(
    landmarks:
      NormalizedLandmark[] | null,
  ): UpperBodyMetrics | null {
    /*
     * We only require landmarks through
     * RIGHT_SHOULDER.
     *
     * Hips are intentionally irrelevant.
     */
    if (
      !landmarks ||
      landmarks.length <=
        RIGHT_SHOULDER
    ) {
      return null;
    }


    const leftShoulder =
      landmarks[LEFT_SHOULDER];

    const rightShoulder =
      landmarks[RIGHT_SHOULDER];


    if (
      !leftShoulder ||
      !rightShoulder
    ) {
      return null;
    }


    /*
     * ========================================
     * SHOULDER VISIBILITY
     * ========================================
     */

    const shouldersVisible =
      this.isVisible(
        leftShoulder,
      ) &&
      this.isVisible(
        rightShoulder,
      );


    if (!shouldersVisible) {
      return null;
    }


    /*
     * ========================================
     * SHOULDER CENTER
     * ========================================
     */

    const shoulderCenterX =
      (
        leftShoulder.x +
        rightShoulder.x
      ) / 2;


    const shoulderCenterY =
      (
        leftShoulder.y +
        rightShoulder.y
      ) / 2;


    /*
     * ========================================
     * SHOULDER ALIGNMENT
     * ========================================
     *
     * We calculate the absolute angle between
     * the two shoulders.
     *
     * Using absolute dx/dy prevents mirrored
     * video / landmark ordering from producing
     * an angle near 180°.
     */

    const shoulderDx =
      Math.abs(
        rightShoulder.x -
        leftShoulder.x,
      );


    const shoulderDy =
      Math.abs(
        rightShoulder.y -
        leftShoulder.y,
      );


    const shoulderTiltDegrees =
      shoulderDx > 0.000001
        ? Math.atan2(
            shoulderDy,
            shoulderDx,
          ) *
          (180 / Math.PI)
        : 90;


    /*
     * ========================================
     * CAMERA-CENTER OFFSET
     * ========================================
     *
     * Previously this field represented:
     *
     * shoulderCenterX - hipCenterX
     *
     * Hips are no longer used.
     *
     * For interface compatibility we expose
     * shoulder-center offset through the
     * existing torsoLean field.
     */

    const centerOffset =
      shoulderCenterX -
      0.5;


    /*
     * ========================================
     * CENTERED
     * ========================================
     */

    const centered =
      Math.abs(
        centerOffset,
      ) <=
      this.centerOffsetThreshold;


    /*
     * ========================================
     * POSTURE CLASSIFICATION
     * ========================================
     */

    const posture =
      this.classifyPosture(
        shoulderTiltDegrees,
        centerOffset,
      );


    /*
     * ========================================
     * SESSION COUNTERS
     * ========================================
     */

    this.totalSamples +=
      1;


    if (
      posture === "good"
    ) {
      this.goodPostureSamples +=
        1;
    }


    /*
     * ========================================
     * STABILITY WINDOW
     * ========================================
     */

    this.samples.push({
      shoulderCenterX,

      shoulderCenterY,

      shoulderTiltDegrees,
    });


    if (
      this.samples.length >
      this.stabilityWindowSize
    ) {
      this.samples.shift();
    }


    /*
     * ========================================
     * RESULT
     * ========================================
     */

    return {
      posture,

      shouldersVisible,

      shoulderTiltDegrees,

      /*
       * Compatibility field.
       *
       * This is shoulder-center offset now,
       * NOT hip-derived torso lean.
       */
      torsoLean:
        centerOffset,

      centered,

      stabilityScore:
        this.getStabilityScore(),

      goodPosturePercent:
        this.getGoodPosturePercent(),

      sampleCount:
        this.totalSamples,
    };
  }


  /*
   * ==========================================
   * POSTURE CLASSIFICATION
   * ==========================================
   */

  private classifyPosture(
    shoulderTiltDegrees: number,
    centerOffset: number,
  ): PostureQuality {
    /*
     * Candidate significantly displaced from
     * the expected interview camera region.
     *
     * We call this "leaning" for compatibility
     * with the existing public type.
     */

    if (
      Math.abs(
        centerOffset,
      ) >
      this.centerOffsetThreshold
    ) {
      return "leaning";
    }


    /*
     * Shoulder imbalance.
     *
     * NOTE:
     * A shoulders-only webcam model cannot
     * reliably diagnose spinal slouch.
     *
     * "slouched" is retained only because it
     * already exists in the current type/UI.
     */

    if (
      shoulderTiltDegrees >
      this.shoulderTiltThreshold
    ) {
      return "slouched";
    }


    return "good";
  }


  /*
   * ==========================================
   * STABILITY
   * ==========================================
   */

  private getStabilityScore():
    number {
    if (
      this.samples.length < 2
    ) {
      return 100;
    }


    let movementSum =
      0;


    for (
      let index = 1;
      index < this.samples.length;
      index += 1
    ) {
      const previous =
        this.samples[
          index - 1
        ];

      const current =
        this.samples[
          index
        ];


      const dx =
        current.shoulderCenterX -
        previous.shoulderCenterX;


      const dy =
        current.shoulderCenterY -
        previous.shoulderCenterY;


      movementSum +=
        Math.sqrt(
          dx * dx +
          dy * dy,
        );
    }


    const averageMovement =
      movementSum /
      (
        this.samples.length -
        1
      );


    /*
     * MediaPipe coordinates are normalized.
     *
     * Tiny natural movement should remain
     * highly stable while sustained larger
     * shoulder movement reduces the score.
     */

    const score =
      100 -
      averageMovement *
        1000;


    return this.clamp(
      score,
      0,
      100,
    );
  }


  /*
   * ==========================================
   * SESSION METRICS
   * ==========================================
   */

  private getGoodPosturePercent():
    number {
    if (
      this.totalSamples === 0
    ) {
      return 0;
    }


    return (
      this.goodPostureSamples /
      this.totalSamples
    ) *
      100;
  }


  /*
   * ==========================================
   * VISIBILITY
   * ==========================================
   */

  private isVisible(
    landmark:
      NormalizedLandmark,
  ): boolean {
    /*
     * MediaPipe visibility can be undefined.
     * Undefined should not automatically make
     * a valid landmark unusable.
     */

    if (
      landmark.visibility ===
      undefined
    ) {
      return true;
    }


    return (
      landmark.visibility >=
      0.5
    );
  }


  /*
   * ==========================================
   * RESET
   * ==========================================
   */

  reset(): void {
    this.samples =
      [];

    this.totalSamples =
      0;

    this.goodPostureSamples =
      0;
  }


  /*
   * ==========================================
   * UTIL
   * ==========================================
   */

  private clamp(
    value: number,
    min: number,
    max: number,
  ): number {
    return Math.min(
      Math.max(
        value,
        min,
      ),
      max,
    );
  }
}