import type {
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import {
  FrameScheduler,
} from "../scheduler/FrameScheduler";

import {
  FaceLandmarkerManager,
} from "../mediapipe/face/FaceLandmarkerManager";

import {
  HeadPoseExtractor,
} from "../features/head/HeadPoseExtractor";

import type {
  HeadPose,
} from "../features/head/types";

import {
  FaceVisibilityAnalyzer,
  type FaceVisibilityMetrics,
} from "../features/face/FaceVisibilityAnalyzer";

import {
  BlinkAnalyzer,
  type BlinkMetrics,
} from "../features/face/BlinkAnalyzer";

import {
  FacialExpressivenessAnalyzer,
  type FacialExpressivenessMetrics,
} from "../features/face/FacialExpressivenessAnalyzer";


export interface FacePipelineDiagnostics {
  detected: boolean;

  targetFps: number;
  actualFps: number;

  latencyMs: number;
  averageLatencyMs: number;

  processedFrames: number;

  headPose:
    HeadPose | null;

  faceVisibility:
    FaceVisibilityMetrics | null;

  blink:
    BlinkMetrics | null;

  facialExpressiveness:
    FacialExpressivenessMetrics | null;
}


export interface FacePipelineUpdate {
  diagnostics:
    FacePipelineDiagnostics;

  landmarks:
    NormalizedLandmark[][];
}


export interface FacePipelineOptions {
  targetFps?: number;

  onUpdate?: (
    update:
      FacePipelineUpdate,
  ) => void;
}


interface RuntimeMetrics {
  framesInWindow: number;

  windowStartedAtMs: number;

  latencySumMs: number;

  latencySamples: number;
}


export class FacePipeline {
  private readonly landmarker:
    FaceLandmarkerManager;


  /*
   * ==========================================
   * ANALYZERS
   * ==========================================
   */

  private readonly headPoseExtractor =
    new HeadPoseExtractor();


  private readonly faceVisibilityAnalyzer =
    new FaceVisibilityAnalyzer();


  private readonly blinkAnalyzer =
    new BlinkAnalyzer();


  private readonly facialExpressivenessAnalyzer =
    new FacialExpressivenessAnalyzer();


  /*
   * ==========================================
   * CONFIGURATION
   * ==========================================
   */

  private readonly targetFps:
    number;


  private readonly onUpdate?:
    FacePipelineOptions["onUpdate"];


  /*
   * ==========================================
   * RUNTIME
   * ==========================================
   */

  private scheduler:
    | FrameScheduler
    | null = null;


  private running =
    false;


  private latestLandmarks:
    NormalizedLandmark[][] = [];


  private diagnostics:
    FacePipelineDiagnostics;


  private metrics:
    RuntimeMetrics | null = null;


  constructor(
    landmarker:
      FaceLandmarkerManager,

    options:
      FacePipelineOptions = {},
  ) {
    this.landmarker =
      landmarker;


    this.targetFps =
      options.targetFps ??
      12;


    this.onUpdate =
      options.onUpdate;


    this.diagnostics =
      this.createInitialDiagnostics();
  }


  /*
   * ==========================================
   * START
   * ==========================================
   */

  start(
    video:
      HTMLVideoElement,
  ): void {
    if (this.running) {
      return;
    }


    if (
      !this.landmarker.isInitialized()
    ) {
      throw new Error(
        "Cannot start FacePipeline because FaceLandmarkerManager is not initialized.",
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
         * A callback may already have been
         * queued when stop() occurs.
         */
        if (!this.running) {
          return;
        }


        /*
         * ==================================
         * MEDIAPIPE INFERENCE
         * ==================================
         */

        const detection =
          this.landmarker.detect(
            video,
            frame.timestamp,
          );


        const faces =
          detection.result
            .faceLandmarks;


        this.latestLandmarks =
          faces;


        /*
         * YOC.ai currently analyzes
         * one interview candidate.
         */

        const primaryFace =
          faces[0] ??
          null;


        /*
         * ==================================
         * HEAD ORIENTATION
         * ==================================
         */

        const transformationMatrix =
          detection.result
            .facialTransformationMatrixes?.[0];


        const headPose =
          this.headPoseExtractor.extract(
            transformationMatrix,
          );


        /*
         * ==================================
         * FACE VISIBILITY
         * ==================================
         *
         * Process every scheduled frame,
         * including frames where MediaPipe
         * cannot find a face.
         *
         * This makes visibility percentage
         * meaningful across the session.
         */

        const faceVisibility =
          this.faceVisibilityAnalyzer.process(
            primaryFace,
          );


        /*
         * ==================================
         * EYE TELEMETRY
         * ==================================
         *
         * Blink frequency/count is not
         * tracked.
         *
         * The analyzer provides:
         *
         * - left eye openness
         * - right eye openness
         * - average eye openness
         * - eyes closed state
         * - sample count
         */

        let blink:
          BlinkMetrics | null =
          this.diagnostics.blink;


        if (primaryFace) {
          const blinkUpdate =
            this.blinkAnalyzer.process(
              primaryFace,
            );


          if (blinkUpdate) {
            blink =
              blinkUpdate;
          }
        }


        /*
         * ==================================
         * FACIAL EXPRESSIVENESS
         * ==================================
         *
         * Measures temporal facial
         * movement/variation.
         *
         * It does NOT classify emotion.
         *
         * It does NOT evaluate whether an
         * expression is positive/negative.
         */

        let facialExpressiveness:
          FacialExpressivenessMetrics | null =
          this.diagnostics
            .facialExpressiveness;


        if (primaryFace) {
          const expressivenessUpdate =
            this.facialExpressivenessAnalyzer.process(
              primaryFace,
            );


          if (
            expressivenessUpdate
          ) {
            facialExpressiveness =
              expressivenessUpdate;
          }
        }


        /*
         * ==================================
         * DIAGNOSTICS
         * ==================================
         */

        this.diagnostics.detected =
          detection.faceDetected;


        this.diagnostics.latencyMs =
          detection.inferenceLatencyMs;


        this.diagnostics.processedFrames +=
          1;


        this.diagnostics.headPose =
          headPose;


        this.diagnostics.faceVisibility =
          faceVisibility;


        this.diagnostics.blink =
          blink;


        this.diagnostics.facialExpressiveness =
          facialExpressiveness;


        /*
         * ==================================
         * FPS + LATENCY
         * ==================================
         */

        this.updateRuntimeMetrics(
          detection.inferenceLatencyMs,
        );


        /*
         * ==================================
         * EVENT
         * ==================================
         */

        this.emitUpdate();
      },
    );
  }


  /*
   * ==========================================
   * STOP
   * ==========================================
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


    /*
     * Clear instantaneous state.
     *
     * Session-level aggregation is handled
     * separately by SessionAggregator.
     */

    this.diagnostics.detected =
      false;


    this.diagnostics.headPose =
      null;


    if (
      this.diagnostics.faceVisibility
    ) {
      this.diagnostics.faceVisibility = {
        ...this.diagnostics
          .faceVisibility,

        visible:
          false,

        framing:
          "not-visible",
      };
    }


    if (
      this.diagnostics.blink
    ) {
      this.diagnostics.blink = {
        ...this.diagnostics.blink,

        eyesClosed:
          false,
      };
    }


    /*
     * Expressiveness is instantaneous
     * analyzer state, so clear it when
     * the pipeline stops.
     *
     * SessionAggregator retains the
     * session-level result separately.
     */

    this.diagnostics
      .facialExpressiveness =
      null;


    this.emitUpdate();
  }


  /*
   * ==========================================
   * RESET
   * ==========================================
   */

  reset(): void {
    this.latestLandmarks =
      [];


    this.faceVisibilityAnalyzer.reset();


    this.blinkAnalyzer.reset();


    this.facialExpressivenessAnalyzer.reset();


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
    FacePipelineDiagnostics {
    return {
      ...this.diagnostics,


      headPose:
        this.diagnostics.headPose
          ? {
              ...this.diagnostics
                .headPose,
            }
          : null,


      faceVisibility:
        this.diagnostics
          .faceVisibility
          ? {
              ...this.diagnostics
                .faceVisibility,
            }
          : null,


      blink:
        this.diagnostics.blink
          ? {
              ...this.diagnostics
                .blink,
            }
          : null,


      facialExpressiveness:
        this.diagnostics
          .facialExpressiveness
          ? {
              ...this.diagnostics
                .facialExpressiveness,
            }
          : null,
    };
  }


  getLandmarks():
    NormalizedLandmark[][] {
    return [
      ...this.latestLandmarks,
    ];
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
      framesInWindow:
        0,

      windowStartedAtMs:
        performance.now(),

      latencySumMs:
        0,

      latencySamples:
        0,
    };
  }


  private updateRuntimeMetrics(
    latencyMs:
      number,
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
        ? (
            metrics.latencySumMs /
            metrics.latencySamples
          )
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

      landmarks: [
        ...this.latestLandmarks,
      ],
    });
  }


  /*
   * ==========================================
   * INITIAL STATE
   * ==========================================
   */

  private createInitialDiagnostics():
    FacePipelineDiagnostics {
    return {
      detected:
        false,

      targetFps:
        this.targetFps,

      actualFps:
        0,

      latencyMs:
        0,

      averageLatencyMs:
        0,

      processedFrames:
        0,

      headPose:
        null,

      faceVisibility:
        null,

      blink:
        null,

      facialExpressiveness:
        null,
    };
  }
}