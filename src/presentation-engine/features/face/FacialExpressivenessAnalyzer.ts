import type {
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

/*
 * ==========================================
 * METRICS
 * ==========================================
 */

export interface FacialExpressivenessMetrics {
  /*
   * Final session/live expressiveness score.
   *
   * 0   = very little observable facial variation
   * 100 = natural and noticeable facial variation
   */
  expressivenessScore: number;

  /*
   * Movement of the mouth region.
   */
  mouthMovementScore: number;

  /*
   * Movement around the eyebrow region.
   */
  browMovementScore: number;

  /*
   * Overall normalized facial variation.
   */
  facialVariationScore: number;

  /*
   * Number of valid face samples processed.
   */
  sampleCount: number;
}


/*
 * ==========================================
 * INTERNAL SAMPLE
 * ==========================================
 */

interface FacialSample {
  mouthOpen: number;

  mouthWidth: number;

  leftBrowHeight: number;

  rightBrowHeight: number;

  faceWidth: number;

  faceHeight: number;
}


/*
 * ==========================================
 * LANDMARKS
 * ==========================================
 *
 * MediaPipe Face Mesh indices.
 *
 * These landmarks are deliberately limited
 * to observable movement around the mouth
 * and eyebrows.
 */


/*
 * Mouth:
 *
 * 61  = left mouth corner
 * 291 = right mouth corner
 * 13  = upper inner lip
 * 14  = lower inner lip
 */

const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;
const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;


/*
 * Eyes / brows:
 *
 * 70  = left eyebrow region
 * 107 = left eyebrow region
 * 300 = right eyebrow region
 * 336 = right eyebrow region
 *
 * These are used relative to the eye region
 * rather than as absolute pixel coordinates.
 */

const LEFT_BROW = 70;
const RIGHT_BROW = 300;

const LEFT_EYE_REFERENCE = 159;
const RIGHT_EYE_REFERENCE = 386;


/*
 * Face bounding-box reference landmarks.
 *
 * We use the complete landmark set to
 * normalize movement against face size.
 */


/*
 * ==========================================
 * ANALYZER
 * ==========================================
 */

export class FacialExpressivenessAnalyzer {
  private readonly windowSize: number;

  private samples: FacialSample[] = [];

  private totalSamples = 0;


  constructor(
    options: {
      windowSize?: number;
    } = {},
  ) {
    /*
     * Face pipeline runs around 12 FPS.
     *
     * 120 samples ≈ 10 seconds.
     *
     * This gives us enough temporal context
     * without retaining the entire interview
     * landmark history.
     */
    this.windowSize =
      options.windowSize ?? 120;
  }


  /*
   * ==========================================
   * PROCESS
   * ==========================================
   */

  process(
    landmarks:
      NormalizedLandmark[] | null,
  ): FacialExpressivenessMetrics | null {
    if (
      !landmarks ||
      landmarks.length < 468
    ) {
      return null;
    }


    const sample =
      this.createSample(
        landmarks,
      );


    if (!sample) {
      return null;
    }


    this.totalSamples += 1;


    this.samples.push(
      sample,
    );


    if (
      this.samples.length >
      this.windowSize
    ) {
      this.samples.shift();
    }


    return this.calculateMetrics();
  }


  /*
   * ==========================================
   * SAMPLE CREATION
   * ==========================================
   */

  private createSample(
    landmarks:
      NormalizedLandmark[],
  ): FacialSample | null {
    const mouthLeft =
      landmarks[MOUTH_LEFT];

    const mouthRight =
      landmarks[MOUTH_RIGHT];

    const mouthTop =
      landmarks[MOUTH_TOP];

    const mouthBottom =
      landmarks[MOUTH_BOTTOM];

    const leftBrow =
      landmarks[LEFT_BROW];

    const rightBrow =
      landmarks[RIGHT_BROW];

    const leftEye =
      landmarks[LEFT_EYE_REFERENCE];

    const rightEye =
      landmarks[RIGHT_EYE_REFERENCE];


    if (
      !mouthLeft ||
      !mouthRight ||
      !mouthTop ||
      !mouthBottom ||
      !leftBrow ||
      !rightBrow ||
      !leftEye ||
      !rightEye
    ) {
      return null;
    }


    /*
     * ========================================
     * FACE BOUNDS
     * ========================================
     */

    let minX = 1;
    let maxX = 0;

    let minY = 1;
    let maxY = 0;


    for (
      const landmark of landmarks
    ) {
      minX =
        Math.min(
          minX,
          landmark.x,
        );

      maxX =
        Math.max(
          maxX,
          landmark.x,
        );

      minY =
        Math.min(
          minY,
          landmark.y,
        );

      maxY =
        Math.max(
          maxY,
          landmark.y,
        );
    }


    const faceWidth =
      maxX - minX;

    const faceHeight =
      maxY - minY;


    if (
      faceWidth <= 0.000001 ||
      faceHeight <= 0.000001
    ) {
      return null;
    }


    /*
     * ========================================
     * MOUTH
     * ========================================
     */

    const mouthWidth =
      this.distance(
        mouthLeft,
        mouthRight,
      ) /
      faceWidth;


    const mouthOpen =
      this.distance(
        mouthTop,
        mouthBottom,
      ) /
      faceHeight;


    /*
     * ========================================
     * BROWS
     * ========================================
     *
     * Brow position is normalized against
     * the corresponding eye reference.
     *
     * This avoids raw camera-resolution
     * dependence.
     */

    const leftBrowHeight =
      (
        leftEye.y -
        leftBrow.y
      ) /
      faceHeight;


    const rightBrowHeight =
      (
        rightEye.y -
        rightBrow.y
      ) /
      faceHeight;


    return {
      mouthOpen,

      mouthWidth,

      leftBrowHeight,

      rightBrowHeight,

      faceWidth,

      faceHeight,
    };
  }


  /*
   * ==========================================
   * METRICS
   * ==========================================
   */

  private calculateMetrics():
    FacialExpressivenessMetrics {
    if (
      this.samples.length < 2
    ) {
      return {
        expressivenessScore: 50,

        mouthMovementScore: 50,

        browMovementScore: 50,

        facialVariationScore: 50,

        sampleCount:
          this.totalSamples,
      };
    }


    /*
     * ========================================
     * MOUTH MOVEMENT
     * ========================================
     */

    const mouthOpenVariation =
      this.calculateVariation(
        this.samples.map(
          (sample) =>
            sample.mouthOpen,
        ),
      );


    const mouthWidthVariation =
      this.calculateVariation(
        this.samples.map(
          (sample) =>
            sample.mouthWidth,
        ),
      );


    /*
     * Mouth movement receives slightly
     * more importance because speaking
     * naturally produces mouth variation.
     */

    const mouthMovement =
      (
        this.normalizeVariation(
          mouthOpenVariation,
          0.002,
          0.12,
        ) *
        0.65
      ) +
      (
        this.normalizeVariation(
          mouthWidthVariation,
          0.001,
          0.08,
        ) *
        0.35
      );


    /*
     * ========================================
     * BROW MOVEMENT
     * ========================================
     */

    const leftBrowVariation =
      this.calculateVariation(
        this.samples.map(
          (sample) =>
            sample.leftBrowHeight,
        ),
      );


    const rightBrowVariation =
      this.calculateVariation(
        this.samples.map(
          (sample) =>
            sample.rightBrowHeight,
        ),
      );


    const browVariation =
      (
        leftBrowVariation +
        rightBrowVariation
      ) / 2;


    const browMovement =
      this.normalizeVariation(
        browVariation,
        0.001,
        0.06,
      );


    /*
     * ========================================
     * COMBINED FACIAL VARIATION
     * ========================================
     */

    const facialVariation =
      (
        mouthMovement *
        0.70
      ) +
      (
        browMovement *
        0.30
      );


    /*
     * ========================================
     * FINAL SCORE
     * ========================================
     *
     * We don't want a completely neutral
     * face to become an automatic failure.
     *
     * Therefore the score has a baseline.
     *
     * 50 = limited observable variation
     * 75 = healthy variation
     * 90+ = strong natural variation
     */

    const expressivenessScore =
      this.clamp(
        35 +
        facialVariation *
          65,
        0,
        100,
      );


    return {
      expressivenessScore:
        this.round(
          expressivenessScore,
        ),

      mouthMovementScore:
        this.round(
          mouthMovement *
            100,
        ),

      browMovementScore:
        this.round(
          browMovement *
            100,
        ),

      facialVariationScore:
        this.round(
          facialVariation *
            100,
        ),

      sampleCount:
        this.totalSamples,
    };
  }


  /*
   * ==========================================
   * VARIATION
   * ==========================================
   *
   * Mean absolute frame-to-frame movement.
   *
   * This intentionally measures variation
   * rather than trying to classify emotion.
   */

  private calculateVariation(
    values: number[],
  ): number {
    if (
      values.length < 2
    ) {
      return 0;
    }


    let totalMovement = 0;


    for (
      let index = 1;
      index < values.length;
      index += 1
    ) {
      totalMovement +=
        Math.abs(
          values[index] -
          values[index - 1],
        );
    }


    return (
      totalMovement /
      (values.length - 1)
    );
  }


  /*
   * ==========================================
   * NORMALIZATION
   * ==========================================
   */

  private normalizeVariation(
    value: number,
    minimum: number,
    maximum: number,
  ): number {
    if (
      maximum <= minimum
    ) {
      return 0;
    }


    return this.clamp(
      (
        value -
        minimum
      ) /
      (
        maximum -
        minimum
      ),
      0,
      1,
    );
  }


  /*
   * ==========================================
   * RESET
   * ==========================================
   */

  reset(): void {
    this.samples = [];

    this.totalSamples = 0;
  }


  /*
   * ==========================================
   * UTIL
   * ==========================================
   */

  private distance(
    a: NormalizedLandmark,
    b: NormalizedLandmark,
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


  private round(
    value: number,
    decimals = 1,
  ): number {
    const factor =
      10 ** decimals;


    return (
      Math.round(
        value *
        factor,
      ) /
      factor
    );
  }
}