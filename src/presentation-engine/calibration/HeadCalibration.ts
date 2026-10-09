export interface HeadOrientation {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface HeadCalibrationBaseline {
  yaw: number;
  pitch: number;
  roll: number;

  sampleCount: number;
  calibratedAt: number;
}

export interface CalibratedHeadOrientation {
  raw: HeadOrientation;

  yaw: number;
  pitch: number;
  roll: number;
}

export class HeadCalibration {
  private yawSamples: number[] = [];
  private pitchSamples: number[] = [];
  private rollSamples: number[] = [];

  private baseline: HeadCalibrationBaseline | null = null;

  private readonly minimumSamples: number;

  constructor(minimumSamples = 24) {
    this.minimumSamples = minimumSamples;
  }

  /**
   * Add one valid head-orientation sample.
   *
   * Only call this while:
   * - a face is detected
   * - head orientation is valid
   * - calibration is currently active
   */
  addSample(orientation: HeadOrientation): void {
    if (!this.isValidOrientation(orientation)) {
      return;
    }

    this.yawSamples.push(orientation.yaw);
    this.pitchSamples.push(orientation.pitch);
    this.rollSamples.push(orientation.roll);
  }

  /**
   * Finish calibration and calculate the candidate's
   * neutral head orientation.
   *
   * Median is intentionally used instead of mean because
   * it is more resistant to occasional noisy frames.
   */
  finalize(): HeadCalibrationBaseline {
    const sampleCount = this.yawSamples.length;

    if (sampleCount < this.minimumSamples) {
      throw new Error(
        `Not enough calibration samples. ` +
          `Received ${sampleCount}, need at least ${this.minimumSamples}.`,
      );
    }

    const baseline: HeadCalibrationBaseline = {
      yaw: this.median(this.yawSamples),
      pitch: this.median(this.pitchSamples),
      roll: this.median(this.rollSamples),

      sampleCount,

      calibratedAt: Date.now(),
    };

    this.baseline = baseline;

    return { ...baseline };
  }

  /**
   * Convert raw camera-relative orientation into
   * candidate-relative orientation.
   *
   * Example:
   *
   * baseline yaw = 4°
   * current yaw  = 10°
   *
   * corrected yaw = 6°
   */
  apply(
    orientation: HeadOrientation,
  ): CalibratedHeadOrientation {
    if (!this.baseline) {
      throw new Error(
        "Head calibration has not been completed.",
      );
    }

    return {
      raw: {
        ...orientation,
      },

      yaw:
        orientation.yaw -
        this.baseline.yaw,

      pitch:
        orientation.pitch -
        this.baseline.pitch,

      roll:
        orientation.roll -
        this.baseline.roll,
    };
  }

  /**
   * Clear all calibration state.
   *
   * Called when starting a completely new interview/session.
   */
  reset(): void {
    this.yawSamples = [];
    this.pitchSamples = [];
    this.rollSamples = [];

    this.baseline = null;
  }

  getBaseline(): HeadCalibrationBaseline | null {
    if (!this.baseline) {
      return null;
    }

    return {
      ...this.baseline,
    };
  }

  getSampleCount(): number {
    return this.yawSamples.length;
  }

  getMinimumSamples(): number {
    return this.minimumSamples;
  }

  isCalibrated(): boolean {
    return this.baseline !== null;
  }

  private isValidOrientation(
    orientation: HeadOrientation,
  ): boolean {
    return (
      Number.isFinite(orientation.yaw) &&
      Number.isFinite(orientation.pitch) &&
      Number.isFinite(orientation.roll)
    );
  }

  private median(values: number[]): number {
    if (values.length === 0) {
      throw new Error(
        "Cannot calculate median of an empty sample set.",
      );
    }

    const sorted = [...values].sort(
      (a, b) => a - b,
    );

    const middle = Math.floor(
      sorted.length / 2,
    );

    if (sorted.length % 2 === 0) {
      return (
        (sorted[middle - 1] +
          sorted[middle]) /
        2
      );
    }

    return sorted[middle];
  }
}