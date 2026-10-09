import type {
  CalibratedHeadOrientation,
} from "../../calibration/HeadCalibration";


export type HeadDirection =
  | "center"
  | "left"
  | "right"
  | "up"
  | "down";


export type HeadMovementLevel =
  | "low"
  | "moderate"
  | "high";


export interface HeadMovementMetrics {
  direction: HeadDirection;

  centered: boolean;

  lookingAway: boolean;

  movementLevel: HeadMovementLevel;

  stabilityScore: number;

  centeredPercent: number;

  lookingAwayPercent: number;

  sampleCount: number;
}


export interface HeadMovementAnalyzerOptions {
  /*
   * Deviation from the calibrated neutral
   * position that is still considered centered.
   */
  centerYawThreshold?: number;
  centerPitchThreshold?: number;

  /*
   * Stronger deviation used to classify the
   * candidate as looking away.
   */
  awayYawThreshold?: number;
  awayPitchThreshold?: number;

  /*
   * Number of recent samples used for movement
   * / stability analysis.
   *
   * At ~12 FPS, 36 samples ≈ 3 seconds.
   */
  movementWindowSize?: number;
}


interface MovementSample {
  yaw: number;
  pitch: number;
  roll: number;
}


export class HeadMovementAnalyzer {
  private readonly centerYawThreshold: number;
  private readonly centerPitchThreshold: number;

  private readonly awayYawThreshold: number;
  private readonly awayPitchThreshold: number;

  private readonly movementWindowSize: number;


  private samples: MovementSample[] = [];

  private totalSamples = 0;

  private centeredSamples = 0;

  private lookingAwaySamples = 0;


  constructor(
    options: HeadMovementAnalyzerOptions = {},
  ) {
    this.centerYawThreshold =
      options.centerYawThreshold ?? 10;

    this.centerPitchThreshold =
      options.centerPitchThreshold ?? 8;

    this.awayYawThreshold =
      options.awayYawThreshold ?? 20;

    this.awayPitchThreshold =
      options.awayPitchThreshold ?? 15;

    this.movementWindowSize =
      options.movementWindowSize ?? 36;
  }


  /*
   * ==========================================
   * PROCESS SAMPLE
   * ==========================================
   */

  process(
    orientation: CalibratedHeadOrientation,
  ): HeadMovementMetrics {
    const sample: MovementSample = {
      yaw: orientation.yaw,
      pitch: orientation.pitch,
      roll: orientation.roll,
    };


    this.samples.push(sample);

    if (
      this.samples.length >
      this.movementWindowSize
    ) {
      this.samples.shift();
    }


    this.totalSamples += 1;


    const centered =
      Math.abs(sample.yaw) <=
        this.centerYawThreshold &&
      Math.abs(sample.pitch) <=
        this.centerPitchThreshold;


    if (centered) {
      this.centeredSamples += 1;
    }


    const lookingAway =
      Math.abs(sample.yaw) >=
        this.awayYawThreshold ||
      Math.abs(sample.pitch) >=
        this.awayPitchThreshold;


    if (lookingAway) {
      this.lookingAwaySamples += 1;
    }


    return {
      direction:
        this.getDirection(sample),

      centered,

      lookingAway,

      movementLevel:
        this.getMovementLevel(),

      stabilityScore:
        this.getStabilityScore(),

      centeredPercent:
        this.getCenteredPercent(),

      lookingAwayPercent:
        this.getLookingAwayPercent(),

      sampleCount:
        this.totalSamples,
    };
  }


  /*
   * ==========================================
   * DIRECTION
   * ==========================================
   */

  private getDirection(
    sample: MovementSample,
  ): HeadDirection {
    if (
      Math.abs(sample.yaw) <=
        this.centerYawThreshold &&
      Math.abs(sample.pitch) <=
        this.centerPitchThreshold
    ) {
      return "center";
    }


    /*
     * Whichever axis has the stronger
     * normalized deviation wins.
     */

    const yawStrength =
      Math.abs(sample.yaw) /
      this.centerYawThreshold;

    const pitchStrength =
      Math.abs(sample.pitch) /
      this.centerPitchThreshold;


    if (
      yawStrength >=
      pitchStrength
    ) {
      return sample.yaw < 0
        ? "left"
        : "right";
    }


    return sample.pitch < 0
      ? "up"
      : "down";
  }


  /*
   * ==========================================
   * MOVEMENT
   * ==========================================
   */

  private getMovementLevel():
    HeadMovementLevel {
    const averageMovement =
      this.getAverageFrameMovement();


    if (averageMovement < 1.5) {
      return "low";
    }


    if (averageMovement < 4) {
      return "moderate";
    }


    return "high";
  }


  /*
   * Measures average angular change between
   * consecutive samples.
   */
  private getAverageFrameMovement(): number {
    if (
      this.samples.length < 2
    ) {
      return 0;
    }


    let movementSum = 0;


    for (
      let index = 1;
      index < this.samples.length;
      index += 1
    ) {
      const previous =
        this.samples[index - 1];

      const current =
        this.samples[index];


      const yawDelta =
        current.yaw -
        previous.yaw;

      const pitchDelta =
        current.pitch -
        previous.pitch;

      const rollDelta =
        current.roll -
        previous.roll;


      /*
       * Euclidean angular distance.
       */
      movementSum +=
        Math.sqrt(
          yawDelta * yawDelta +
          pitchDelta * pitchDelta +
          rollDelta * rollDelta,
        );
    }


    return (
      movementSum /
      (this.samples.length - 1)
    );
  }


  /*
   * ==========================================
   * STABILITY
   * ==========================================
   */

  private getStabilityScore(): number {
    const movement =
      this.getAverageFrameMovement();


    /*
     * 0° average movement => 100
     *
     * 8°+ average movement between samples
     * => effectively unstable.
     */

    const score =
      100 -
      movement * 12.5;


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

  private getCenteredPercent(): number {
    if (
      this.totalSamples === 0
    ) {
      return 0;
    }


    return (
      this.centeredSamples /
      this.totalSamples
    ) * 100;
  }


  private getLookingAwayPercent(): number {
    if (
      this.totalSamples === 0
    ) {
      return 0;
    }


    return (
      this.lookingAwaySamples /
      this.totalSamples
    ) * 100;
  }


  /*
   * ==========================================
   * RESET
   * ==========================================
   */

  reset(): void {
    this.samples = [];

    this.totalSamples = 0;

    this.centeredSamples = 0;

    this.lookingAwaySamples = 0;
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
      Math.max(value, min),
      max,
    );
  }
}