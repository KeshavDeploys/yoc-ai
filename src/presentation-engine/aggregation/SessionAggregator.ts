import type {
  PresentationEngineDiagnostics,
} from "../types/diagnostics";


/*
 * ==========================================
 * SESSION SUMMARY
 * ==========================================
 *
 * This is the session-level telemetry that
 * feeds the presentation scoring layer.
 *
 * Blink count and blink rate are intentionally
 * NOT included.
 *
 * Blinking is natural human behaviour and
 * should not be treated as presentation quality.
 */

export interface PresentationSessionSummary {
  durationMs: number;


  /*
   * ==========================================
   * FACE / FRAMING
   * ==========================================
   */

  faceVisibilityPercent: number;

  goodFramingPercent: number;

  centeredFacePercent: number;


  /*
   * ==========================================
   * HEAD BEHAVIOUR
   * ==========================================
   */

  headCenteredPercent: number;

  lookingAwayPercent: number;

  headStabilityScore: number;


  /*
   * ==========================================
   * FACIAL EXPRESSIVENESS
   * ==========================================
   */

  facialExpressivenessScore: number;


  /*
   * ==========================================
   * POSTURE
   * ==========================================
   *
   * Upper-body / shoulder-derived metrics.
   *
   * Hips are intentionally not required.
   */

  goodPosturePercent: number;

  bodyStabilityScore: number;

  bodyCenteredPercent: number;


  /*
   * ==========================================
   * SESSION SAMPLE COUNTS
   * ==========================================
   */

  faceSamples: number;

  headSamples: number;

  poseSamples: number;
}


/*
 * ==========================================
 * RUNNING TOTALS
 * ==========================================
 */

interface RunningTotals {
  /*
   * FACE
   */

  faceSamples: number;

  faceVisibleSamples: number;

  goodFramingSamples: number;

  centeredFaceSamples: number;


  /*
   * HEAD
   */

  headSamples: number;

  headCenteredSamples: number;

  lookingAwaySamples: number;

  headStabilitySum: number;


  /*
   * FACIAL EXPRESSIVENESS
   */

  facialExpressivenessSamples: number;

  facialExpressivenessSum: number;


  /*
   * POSE / UPPER BODY
   */

  poseSamples: number;

  goodPostureSamples: number;

  bodyCenteredSamples: number;

  bodyStabilitySum: number;
}


/*
 * ==========================================
 * SESSION AGGREGATOR
 * ==========================================
 */

export class SessionAggregator {
  private startedAtMs:
    number | null = null;


  private stoppedAtMs:
    number | null = null;


  private totals:
    RunningTotals =
      this.createTotals();


  /*
   * ==========================================
   * DUPLICATE PROTECTION
   * ==========================================
   *
   * PresentationEngine can emit diagnostics
   * from multiple pipeline updates.
   *
   * These counters make sure one pipeline
   * result is only aggregated once.
   */

  private lastFaceFrame = -1;

  private lastPoseFrame = -1;

  private lastHeadSampleCount = -1;


  /*
   * ==========================================
   * SESSION LIFECYCLE
   * ==========================================
   */

  start(
    timestampMs:
      number = performance.now(),
  ): void {
    this.reset();


    this.startedAtMs =
      timestampMs;
  }


  stop(
    timestampMs:
      number = performance.now(),
  ): PresentationSessionSummary {
    if (
      this.startedAtMs !== null
    ) {
      this.stoppedAtMs =
        timestampMs;
    }


    return this.getSummary(
      timestampMs,
    );
  }


  reset(): void {
    this.startedAtMs =
      null;


    this.stoppedAtMs =
      null;


    this.totals =
      this.createTotals();


    this.lastFaceFrame =
      -1;


    this.lastPoseFrame =
      -1;


    this.lastHeadSampleCount =
      -1;
  }


  /*
   * ==========================================
   * INGEST DIAGNOSTICS
   * ==========================================
   */

  ingest(
    diagnostics:
      PresentationEngineDiagnostics,
  ): void {
    /*
     * Do not collect anything until a
     * session has explicitly started.
     */

    if (
      this.startedAtMs === null
    ) {
      return;
    }


    this.ingestFace(
      diagnostics,
    );


    this.ingestFacialExpressiveness(
      diagnostics,
    );


    this.ingestHead(
      diagnostics,
    );


    this.ingestPose(
      diagnostics,
    );


    /*
     * IMPORTANT:
     *
     * There is deliberately NO blink
     * aggregation here.
     *
     * Blink count and blink rate are not
     * session metrics anymore.
     */
  }


  /*
   * ==========================================
   * FACE
   * ==========================================
   */

  private ingestFace(
    diagnostics:
      PresentationEngineDiagnostics,
  ): void {
    const frame =
      diagnostics.face
        .processedFrames;


    /*
     * Ignore duplicate diagnostics.
     */

    if (
      frame ===
      this.lastFaceFrame
    ) {
      return;
    }


    this.lastFaceFrame =
      frame;


    const visibility =
      diagnostics.faceVisibility;


    if (!visibility) {
      return;
    }


    this.totals.faceSamples +=
      1;


    if (
      visibility.visible
    ) {
      this.totals
        .faceVisibleSamples +=
        1;
    }


    if (
      visibility.framing ===
      "good"
    ) {
      this.totals
        .goodFramingSamples +=
        1;
    }


    if (
      visibility.centered
    ) {
      this.totals
        .centeredFaceSamples +=
        1;
    }
  }


  /*
   * ==========================================
   * FACIAL EXPRESSIVENESS
   * ==========================================
   */

  private ingestFacialExpressiveness(
    diagnostics:
      PresentationEngineDiagnostics,
  ): void {
    const expressiveness =
      diagnostics.facialExpressiveness;


    if (!expressiveness) {
      return;
    }


    if (expressiveness.sampleCount <= 0) {
      return;
    }


    /*
     * The analyzer's sampleCount is cumulative.
     * Only add a new analyzer state once.
     */
    if (
      expressiveness.sampleCount <=
      this.totals.facialExpressivenessSamples
    ) {
      return;
    }


    this.totals.facialExpressivenessSamples =
      expressiveness.sampleCount;


    this.totals.facialExpressivenessSum +=
      expressiveness.expressivenessScore;
  }


  /*
   * ==========================================
   * HEAD
   * ==========================================
   */

  private ingestHead(
    diagnostics:
      PresentationEngineDiagnostics,
  ): void {
    const movement =
      diagnostics.headMovement;


    if (!movement) {
      return;
    }


    /*
     * HeadMovementAnalyzer maintains its
     * own cumulative sample count.
     *
     * Only aggregate a new sample when
     * that count changes.
     */

    if (
      movement.sampleCount ===
      this.lastHeadSampleCount
    ) {
      return;
    }


    this.lastHeadSampleCount =
      movement.sampleCount;


    this.totals.headSamples +=
      1;


    if (
      movement.centered
    ) {
      this.totals
        .headCenteredSamples +=
        1;
    }


    if (
      movement.lookingAway
    ) {
      this.totals
        .lookingAwaySamples +=
        1;
    }


    this.totals.headStabilitySum +=
      movement.stabilityScore;
  }


  /*
   * ==========================================
   * POSE / UPPER BODY
   * ==========================================
   */

  private ingestPose(
    diagnostics:
      PresentationEngineDiagnostics,
  ): void {
    const frame =
      diagnostics.pose
        .processedFrames;


    /*
     * Ignore duplicate pose diagnostics.
     */

    if (
      frame ===
      this.lastPoseFrame
    ) {
      return;
    }


    this.lastPoseFrame =
      frame;


    const upperBody =
      diagnostics.upperBody;


    if (!upperBody) {
      return;
    }


    this.totals.poseSamples +=
      1;


    /*
     * Only "good" posture contributes
     * to the positive posture percentage.
     *
     * Leaning / slouched / uncertain
     * therefore do not count as good.
     */

    if (
      upperBody.posture ===
      "good"
    ) {
      this.totals
        .goodPostureSamples +=
        1;
    }


    if (
      upperBody.centered
    ) {
      this.totals
        .bodyCenteredSamples +=
        1;
    }


    this.totals.bodyStabilitySum +=
      upperBody.stabilityScore;
  }


  /*
   * ==========================================
   * SUMMARY
   * ==========================================
   */

  getSummary(
    timestampMs:
      number = performance.now(),
  ): PresentationSessionSummary {
    const durationMs =
      this.getDuration(
        timestampMs,
      );


    return {
      durationMs,


      /*
       * ======================================
       * FACE
       * ======================================
       */

      faceVisibilityPercent:
        this.percent(
          this.totals
            .faceVisibleSamples,

          this.totals
            .faceSamples,
        ),


      goodFramingPercent:
        this.percent(
          this.totals
            .goodFramingSamples,

          this.totals
            .faceSamples,
        ),


      centeredFacePercent:
        this.percent(
          this.totals
            .centeredFaceSamples,

          this.totals
            .faceSamples,
        ),


      /*
       * ======================================
       * HEAD
       * ======================================
       */

      headCenteredPercent:
        this.percent(
          this.totals
            .headCenteredSamples,

          this.totals
            .headSamples,
        ),


      lookingAwayPercent:
        this.percent(
          this.totals
            .lookingAwaySamples,

          this.totals
            .headSamples,
        ),


      headStabilityScore:
        this.average(
          this.totals
            .headStabilitySum,

          this.totals
            .headSamples,
        ),


      /*
       * ======================================
       * FACIAL EXPRESSIVENESS
       * ======================================
       */

      facialExpressivenessScore:
        this.average(
          this.totals
            .facialExpressivenessSum,

          this.totals
            .facialExpressivenessSamples,
        ),


      /*
       * ======================================
       * POSTURE
       * ======================================
       *
       * Upper-body only.
       *
       * No hip data is used here.
       */

      goodPosturePercent:
        this.percent(
          this.totals
            .goodPostureSamples,

          this.totals
            .poseSamples,
        ),


      bodyStabilityScore:
        this.average(
          this.totals
            .bodyStabilitySum,

          this.totals
            .poseSamples,
        ),


      bodyCenteredPercent:
        this.percent(
          this.totals
            .bodyCenteredSamples,

          this.totals
            .poseSamples,
        ),


      /*
       * ======================================
       * SAMPLE COUNTS
       * ======================================
       */

      faceSamples:
        this.totals
          .faceSamples,


      headSamples:
        this.totals
          .headSamples,


      poseSamples:
        this.totals
          .poseSamples,
    };
  }


  /*
   * ==========================================
   * DURATION
   * ==========================================
   */

  private getDuration(
    timestampMs: number,
  ): number {
    if (
      this.startedAtMs ===
      null
    ) {
      return 0;
    }


    const end =
      this.stoppedAtMs ??
      timestampMs;


    return Math.max(
      end -
        this.startedAtMs,

      0,
    );
  }


  /*
   * ==========================================
   * HELPERS
   * ==========================================
   */

  private percent(
    value: number,

    total: number,
  ): number {
    if (
      total <= 0
    ) {
      return 0;
    }


    return this.clamp(
      (
        value /
        total
      ) * 100,

      0,

      100,
    );
  }


  private average(
    sum: number,

    count: number,
  ): number {
    if (
      count <= 0
    ) {
      return 0;
    }


    return this.clamp(
      sum /
        count,

      0,

      100,
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


  private createTotals():
    RunningTotals {
    return {
      /*
       * FACE
       */

      faceSamples: 0,

      faceVisibleSamples: 0,

      goodFramingSamples: 0,

      centeredFaceSamples: 0,


      /*
       * HEAD
       */

      headSamples: 0,

      headCenteredSamples: 0,

      lookingAwaySamples: 0,

      headStabilitySum: 0,


      /*
       * FACIAL EXPRESSIVENESS
       */

      facialExpressivenessSamples: 0,

      facialExpressivenessSum: 0,


      /*
       * POSE
       */

      poseSamples: 0,

      goodPostureSamples: 0,

      bodyCenteredSamples: 0,

      bodyStabilitySum: 0,
    };
  }
}
