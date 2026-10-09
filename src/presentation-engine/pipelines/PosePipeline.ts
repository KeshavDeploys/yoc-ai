import type {
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import {
  FrameScheduler,
} from "../scheduler/FrameScheduler";

import {
  PoseLandmarkerManager,
} from "../mediapipe/pose/PoseLandmarkerManager";

import {
  UpperBodyAnalyzer,
  type UpperBodyMetrics,
} from "../features/upper-body/UpperBodyAnalyzer";


export interface PosePipelineDiagnostics {
  detected: boolean;

  targetFps: number;
  actualFps: number;

  latencyMs: number;
  averageLatencyMs: number;

  processedFrames: number;

  /*
   * Presentation/posture analysis derived
   * from pose landmarks.
   */
  upperBody: UpperBodyMetrics | null;
}


export interface PosePipelineUpdate {
  diagnostics: PosePipelineDiagnostics;

  landmarks: NormalizedLandmark[][];
}


export interface PosePipelineOptions {
  targetFps?: number;

  onUpdate?: (
    update: PosePipelineUpdate,
  ) => void;
}


interface RuntimeMetrics {
  framesInWindow: number;

  windowStartedAtMs: number;

  latencySumMs: number;

  latencySamples: number;
}


export class PosePipeline {
  private readonly landmarker:
    PoseLandmarkerManager;


  /*
   * ==========================================
   * ANALYZERS
   * ==========================================
   */

  private readonly upperBodyAnalyzer =
    new UpperBodyAnalyzer();


  private readonly targetFps: number;

  private readonly onUpdate?:
    PosePipelineOptions["onUpdate"];


  private scheduler:
    | FrameScheduler
    | null = null;


  private running = false;


  private latestLandmarks:
    NormalizedLandmark[][] = [];


  private diagnostics:
    PosePipelineDiagnostics;


  private metrics:
    RuntimeMetrics | null = null;


  constructor(
    landmarker: PoseLandmarkerManager,
    options: PosePipelineOptions = {},
  ) {
    this.landmarker =
      landmarker;

    this.targetFps =
      options.targetFps ?? 4;

    this.onUpdate =
      options.onUpdate;

    this.diagnostics =
      this.createInitialDiagnostics();
  }


  /**
   * Start pose inference.
   *
   * PoseLandmarkerManager must already
   * be initialized.
   */
  start(
    video: HTMLVideoElement,
  ): void {
    if (this.running) {
      return;
    }


    if (
      !this.landmarker.isInitialized()
    ) {
      throw new Error(
        "Cannot start PosePipeline because PoseLandmarkerManager is not initialized.",
      );
    }


    this.reset();


    const scheduler =
      new FrameScheduler({
        targetFps:
          this.targetFps,
      });


    this.scheduler =
      scheduler;


    this.metrics =
      this.createRuntimeMetrics();


    this.running =
      true;


    scheduler.start(
      video,

      (frame) => {
        /*
         * A callback may already be queued
         * when stop() occurs.
         */
        if (!this.running) {
          return;
        }


        const detection =
          this.landmarker.detect(
            video,
            frame.timestamp,
          );


        /*
         * ==================================
         * LANDMARKS
         * ==================================
         */

        this.latestLandmarks =
          detection.result.landmarks;


        /*
         * ==================================
         * UPPER BODY ANALYSIS
         * ==================================
         *
         * YOC.ai currently analyzes one
         * interview candidate, therefore
         * landmarks[0] is the candidate.
         */

        const candidateLandmarks =
          this.latestLandmarks[0] ??
          null;


        const upperBody =
          this.upperBodyAnalyzer.process(
            candidateLandmarks,
          );


        /*
         * ==================================
         * DIAGNOSTICS
         * ==================================
         */

        this.diagnostics.detected =
          detection.poseDetected;


        this.diagnostics.latencyMs =
          detection.inferenceLatencyMs;


        this.diagnostics.processedFrames +=
          1;


        this.diagnostics.upperBody =
          upperBody;


        /*
         * ==================================
         * FPS + LATENCY WINDOW
         * ==================================
         */

        this.updateRuntimeMetrics(
          detection.inferenceLatencyMs,
        );


        /*
         * Emit newest pose + presentation
         * analysis state.
         */
        this.emitUpdate();
      },
    );
  }


  /**
   * Stop pose inference.
   *
   * Does NOT close the MediaPipe model.
   */
  stop(): void {
    this.running =
      false;


    this.scheduler?.stop();


    this.scheduler =
      null;


    this.metrics =
      null;


    this.latestLandmarks =
      [];


    this.diagnostics.detected =
      false;


    /*
     * Current instantaneous posture should
     * disappear when the pipeline stops.
     *
     * Session aggregation will later preserve
     * the final interview metrics separately.
     */
    this.diagnostics.upperBody =
      null;


    this.emitUpdate();
  }


  /**
   * Reset all per-session state.
   */
  reset(): void {
    this.latestLandmarks =
      [];


    this.upperBodyAnalyzer.reset();


    this.diagnostics =
      this.createInitialDiagnostics();


    this.metrics =
      null;
  }


  /*
   * ==========================================
   * PUBLIC STATE
   * ==========================================
   */

  getDiagnostics():
    PosePipelineDiagnostics {
    return {
      ...this.diagnostics,

      upperBody:
        this.diagnostics.upperBody
          ? {
              ...this.diagnostics
                .upperBody,
            }
          : null,
    };
  }


  getLandmarks():
    NormalizedLandmark[][] {
    return this.latestLandmarks;
  }


  isRunning(): boolean {
    return this.running;
  }


  /*
   * ==========================================
   * RUNTIME METRICS
   * ==========================================
   */

  private createRuntimeMetrics():
    RuntimeMetrics {
    return {
      framesInWindow: 0,

      windowStartedAtMs:
        performance.now(),

      latencySumMs: 0,

      latencySamples: 0,
    };
  }


  private updateRuntimeMetrics(
    latencyMs: number,
  ): void {
    const metrics =
      this.metrics;


    if (!metrics) {
      return;
    }


    metrics.framesInWindow +=
      1;


    metrics.latencySumMs +=
      latencyMs;


    metrics.latencySamples +=
      1;


    const now =
      performance.now();


    const elapsed =
      now -
      metrics.windowStartedAtMs;


    if (elapsed < 1000) {
      return;
    }


    const fps =
      (
        metrics.framesInWindow *
        1000
      ) /
      elapsed;


    const averageLatencyMs =
      metrics.latencySamples > 0
        ? metrics.latencySumMs /
          metrics.latencySamples
        : 0;


    this.diagnostics.actualFps =
      fps;


    this.diagnostics.averageLatencyMs =
      averageLatencyMs;


    metrics.framesInWindow =
      0;


    metrics.latencySumMs =
      0;


    metrics.latencySamples =
      0;


    metrics.windowStartedAtMs =
      now;
  }


  /*
   * ==========================================
   * EVENTS
   * ==========================================
   */

  private emitUpdate(): void {
    this.onUpdate?.({
      diagnostics:
        this.getDiagnostics(),

      landmarks:
        this.latestLandmarks,
    });
  }


  /*
   * ==========================================
   * INITIAL STATE
   * ==========================================
   */

  private createInitialDiagnostics():
    PosePipelineDiagnostics {
    return {
      detected: false,

      targetFps:
        this.targetFps,

      actualFps: 0,

      latencyMs: 0,

      averageLatencyMs: 0,

      processedFrames: 0,

      upperBody: null,
    };
  }
}