import {
  HeadCalibration,
  type HeadCalibrationBaseline,
  type CalibratedHeadOrientation,
  type HeadOrientation,
} from "./HeadCalibration";


export type CalibrationStatus =
  | "idle"
  | "calibrating"
  | "calibrated";


export interface CalibrationState {
  status: CalibrationStatus;

  sampleCount: number;

  targetSamples: number;

  progress: number;

  baseline:
    | HeadCalibrationBaseline
    | null;

  calibratedHead:
    | CalibratedHeadOrientation
    | null;
}


export interface CalibrationManagerOptions {
  targetSamples?: number;
}


export class CalibrationManager {
  private readonly targetSamples: number;

  private headCalibration: HeadCalibration;

  private status:
    CalibrationStatus = "idle";

  private calibratedHead:
    | CalibratedHeadOrientation
    | null = null;


  constructor(
    options:
      CalibrationManagerOptions = {},
  ) {
    /*
     * At ~12 FPS:
     *
     * 30 valid samples ≈ 2.5 seconds.
     *
     * IMPORTANT:
     * Missing/invalid face frames do not count.
     */
    this.targetSamples =
      options.targetSamples ?? 30;

    this.headCalibration =
      new HeadCalibration(
        this.targetSamples,
      );
  }


  /**
   * Begin a fresh calibration.
   */
  start(): void {
    this.headCalibration.reset();

    this.calibratedHead =
      null;

    this.status =
      "calibrating";
  }


  /**
   * Process one raw head-orientation sample.
   *
   * This method behaves differently depending
   * on calibration state:
   *
   * CALIBRATING
   *   → collect samples
   *
   * CALIBRATED
   *   → return baseline-corrected orientation
   */
  processHeadSample(
    orientation: HeadOrientation,
  ): CalibratedHeadOrientation | null {
    if (
      this.status === "idle"
    ) {
      return null;
    }


    /*
     * ----------------------------------
     * CALIBRATION COLLECTION
     * ----------------------------------
     */

    if (
      this.status ===
      "calibrating"
    ) {
      this.headCalibration.addSample(
        orientation,
      );


      /*
       * Once enough VALID samples have
       * been collected, establish baseline.
       */

      if (
        this.headCalibration.getSampleCount() >=
        this.targetSamples
      ) {
        this.headCalibration.finalize();

        this.status =
          "calibrated";


        /*
         * Apply the freshly-created baseline
         * to the current sample.
         *
         * This should normally produce values
         * close to zero.
         */

        this.calibratedHead =
          this.headCalibration.apply(
            orientation,
          );


        return this.cloneCalibratedHead(
          this.calibratedHead,
        );
      }


      return null;
    }


    /*
     * ----------------------------------
     * NORMAL SESSION PROCESSING
     * ----------------------------------
     */

    this.calibratedHead =
      this.headCalibration.apply(
        orientation,
      );


    return this.cloneCalibratedHead(
      this.calibratedHead,
    );
  }


  /**
   * Reset calibration completely.
   */
  reset(): void {
    this.headCalibration.reset();

    this.status =
      "idle";

    this.calibratedHead =
      null;
  }


  isCalibrating(): boolean {
    return (
      this.status ===
      "calibrating"
    );
  }


  isCalibrated(): boolean {
    return (
      this.status ===
      "calibrated"
    );
  }


  getStatus():
    CalibrationStatus {
    return this.status;
  }


  getSampleCount(): number {
    return this.headCalibration.getSampleCount();
  }


  getTargetSamples(): number {
    return this.targetSamples;
  }


  getProgress(): number {
    if (
      this.status ===
      "calibrated"
    ) {
      return 1;
    }


    const progress =
      this.headCalibration.getSampleCount() /
      this.targetSamples;


    return Math.min(
      Math.max(
        progress,
        0,
      ),
      1,
    );
  }


  getBaseline():
    HeadCalibrationBaseline | null {
    return this.headCalibration.getBaseline();
  }


  getCalibratedHead():
    CalibratedHeadOrientation | null {
    return this.cloneCalibratedHead(
      this.calibratedHead,
    );
  }


  /**
   * Snapshot used by PresentationEngine/debug UI.
   */
  getState():
    CalibrationState {
    return {
      status:
        this.status,

      sampleCount:
        this.getSampleCount(),

      targetSamples:
        this.targetSamples,

      progress:
        this.getProgress(),

      baseline:
        this.getBaseline(),

      calibratedHead:
        this.getCalibratedHead(),
    };
  }


  private cloneCalibratedHead(
    value:
      CalibratedHeadOrientation | null,
  ): CalibratedHeadOrientation | null {
    if (!value) {
      return null;
    }


    return {
      raw: {
        ...value.raw,
      },

      yaw:
        value.yaw,

      pitch:
        value.pitch,

      roll:
        value.roll,
    };
  }
}