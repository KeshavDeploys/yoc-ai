import {
  CameraManager,
} from "./camera/CameraManager";

import {
  FaceLandmarkerManager,
} from "./mediapipe/face/FaceLandmarkerManager";

import {
  PoseLandmarkerManager,
} from "./mediapipe/pose/PoseLandmarkerManager";

import {
  FacePipeline,
  type FacePipelineUpdate,
} from "./pipelines/FacePipeline";

import {
  PosePipeline,
  type PosePipelineUpdate,
} from "./pipelines/PosePipeline";

import {
  CalibrationManager,
} from "./calibration/CalibrationManager";

import {
  HeadMovementAnalyzer,
} from "./features/head/HeadMovementAnalyzer";

import {
  UpperBodyAnalyzer,
} from "./features/upper-body/UpperBodyAnalyzer";

import {
  SessionAggregator,
} from "./aggregation/SessionAggregator";

import {
  PresentationScorer,
  type PresentationScoreResult,
} from "./scoring/PresentationScorer";

import {
  buildPresentationSessionReport,
  buildPresentationAiPayload,
  type PresentationSessionReport,
  type PresentationAiPayload,
} from "./reporting/SessionReportSerializer";

import {
  EngineState,
} from "./state/EngineState";

import type {
  PresentationEngineDiagnostics,
  PresentationEngineOverlay,
  PresentationEngineStatus,
} from "./types";


const FACE_TARGET_FPS = 12;

const POSE_TARGET_FPS = 4;

const CALIBRATION_TARGET_SAMPLES = 30;


export type {
  PresentationEngineDiagnostics,
  PresentationEngineOverlay,
} from "./types";

export type {
  PresentationScoreResult,
} from "./scoring/PresentationScorer";


export interface PresentationEngineOptions {
  onDiagnostics?: (
    diagnostics:
      PresentationEngineDiagnostics,
  ) => void;

  onOverlay?: (
    overlay:
      PresentationEngineOverlay,
  ) => void;
}


export class PresentationEngine {
  /*
   * ==========================================
   * CAMERA
   * ==========================================
   */

  private camera:
    | CameraManager
    | null = null;


  /*
   * ==========================================
   * MEDIAPIPE MODELS
   * ==========================================
   */

  private faceLandmarker:
    | FaceLandmarkerManager
    | null = null;

  private poseLandmarker:
    | PoseLandmarkerManager
    | null = null;


  /*
   * ==========================================
   * PIPELINES
   * ==========================================
   */

  private facePipeline:
    | FacePipeline
    | null = null;

  private posePipeline:
    | PosePipeline
    | null = null;


  /*
   * ==========================================
   * CALIBRATION
   * ==========================================
   */

  private readonly calibration =
    new CalibrationManager({
      targetSamples:
        CALIBRATION_TARGET_SAMPLES,
    });


  /*
   * ==========================================
   * HEAD ANALYSIS
   * ==========================================
   */

  private readonly headMovement =
    new HeadMovementAnalyzer();


  /*
   * ==========================================
   * UPPER BODY ANALYSIS
   * ==========================================
   */

  private readonly upperBody =
    new UpperBodyAnalyzer();


  /*
   * ==========================================
   * SESSION ANALYSIS
   * ==========================================
   */

  private readonly sessionAggregator =
    new SessionAggregator();

  private readonly presentationScorer =
    new PresentationScorer();

  private lastSessionResult:
    PresentationScoreResult | null =
      null;

  private lastSessionReport:
    PresentationSessionReport | null =
      null;

  private lastAiPayload:
    PresentationAiPayload | null =
      null;


  /*
   * ==========================================
   * ENGINE STATE
   * ==========================================
   */

  private readonly state =
    new EngineState({
      faceTargetFps:
        FACE_TARGET_FPS,

      poseTargetFps:
        POSE_TARGET_FPS,

      calibrationTargetSamples:
        CALIBRATION_TARGET_SAMPLES,
    });


  private initialized =
    false;

  private running =
    false;


  /*
   * ==========================================
   * CALLBACKS
   * ==========================================
   */

  private readonly onDiagnostics?:
    PresentationEngineOptions[
      "onDiagnostics"
    ];

  private readonly onOverlay?:
    PresentationEngineOptions[
      "onOverlay"
    ];


  constructor(
    options:
      PresentationEngineOptions = {},
  ) {
    this.onDiagnostics =
      options.onDiagnostics;

    this.onOverlay =
      options.onOverlay;
  }


  /*
   * ==========================================
   * INITIALIZE
   * ==========================================
   */

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }


    this.setStatus(
      "initializing",
    );


    try {
      const face =
        new FaceLandmarkerManager();

      const pose =
        new PoseLandmarkerManager();


      await Promise.all([
        face.initialize(),
        pose.initialize(),
      ]);


      this.faceLandmarker =
        face;

      this.poseLandmarker =
        pose;


      this.facePipeline =
        new FacePipeline(
          face,
          {
            targetFps:
              FACE_TARGET_FPS,

            onUpdate:
              (update) => {
                this.handleFaceUpdate(
                  update,
                );
              },
          },
        );


      this.posePipeline =
        new PosePipeline(
          pose,
          {
            targetFps:
              POSE_TARGET_FPS,

            onUpdate:
              (update) => {
                this.handlePoseUpdate(
                  update,
                );
              },
          },
        );


      this.initialized =
        true;


      this.state.setFaceModelReady(
        true,
      );

      this.state.setPoseModelReady(
        true,
      );


      this.setStatus(
        "ready",
      );
    } catch (error) {
      this.setStatus(
        "error",
      );

      this.disposeModels();

      throw error;
    }
  }


  /*
   * ==========================================
   * START
   * ==========================================
   */

  async start(
    video: HTMLVideoElement,
  ): Promise<void> {
    if (this.running) {
      return;
    }


    if (!this.initialized) {
      await this.initialize();
    }


    if (
      !this.facePipeline ||
      !this.posePipeline
    ) {
      throw new Error(
        "PresentationEngine pipelines are unavailable.",
      );
    }


    try {
      const camera =
        new CameraManager();


      const cameraInfo =
        await camera.start(
          video,
        );


      this.camera =
        camera;


      /*
       * ----------------------------------------
       * RESET PREVIOUS SESSION
       * ----------------------------------------
       */

      this.state.resetSession();

      this.facePipeline.reset();

      this.posePipeline.reset();

      this.calibration.reset();

      this.headMovement.reset();

      this.upperBody.reset();

      this.sessionAggregator.reset();

      this.lastSessionResult =
        null;

      this.lastSessionReport =
        null;

      this.lastAiPayload =
        null;


      /*
       * ----------------------------------------
       * START CALIBRATION
       * ----------------------------------------
       */

      this.calibration.start();

      this.state.setCalibration(
        this.calibration.getState(),
      );


      /*
       * Explicitly clear analysed values
       * before the new session starts.
       */

      this.state.setHeadMovement(
        null,
      );

      this.state.setUpperBody(
        null,
      );


      /*
       * ----------------------------------------
       * CAMERA STATE
       * ----------------------------------------
       */

      this.state.setCamera(
        cameraInfo,
      );


      /*
       * ----------------------------------------
       * START SESSION AGGREGATION
       * ----------------------------------------
       */

      this.sessionAggregator.start();


      /*
       * Engine must be running before
       * pipeline callbacks begin.
       */

      this.running =
        true;


      this.setStatus(
        "running",
      );


      /*
       * ----------------------------------------
       * START PIPELINES
       * ----------------------------------------
       */

      this.facePipeline.start(
        video,
      );

      this.posePipeline.start(
        video,
      );
    } catch (error) {
      this.running =
        false;


      this.facePipeline?.stop();

      this.posePipeline?.stop();


      this.calibration.reset();

      this.headMovement.reset();

      this.upperBody.reset();

      this.sessionAggregator.reset();

      this.lastSessionResult =
        null;

      this.lastSessionReport =
        null;

      this.lastAiPayload =
        null;


      this.state.setCalibration(
        this.calibration.getState(),
      );

      this.state.setHeadMovement(
        null,
      );

      this.state.setUpperBody(
        null,
      );


      this.camera?.stop();

      this.camera =
        null;


      this.state.setCamera(
        null,
      );


      this.setStatus(
        "error",
      );


      throw error;
    }
  }


  /*
   * ==========================================
   * STOP
   * ==========================================
   */

  stop():
    PresentationEngineDiagnostics {
    /*
     * Disable callbacks first.
     */

    this.stopPipelines();


    /*
     * ----------------------------------------
     * FINAL SESSION SUMMARY + SCORE
     * ----------------------------------------
     *
     * The analyser values already stored in
     * EngineState remain available while the
     * final session summary is generated.
     */

    const summary =
      this.sessionAggregator.stop();


    this.lastSessionResult =
      this.presentationScorer.score(
        summary,
      );

    this.lastSessionReport =
      buildPresentationSessionReport(
        this.lastSessionResult,
      );

    this.lastAiPayload =
      buildPresentationAiPayload(
        this.lastSessionResult,
      );


    /*
     * ----------------------------------------
     * CAMERA
     * ----------------------------------------
     */

    this.camera?.stop();

    this.camera =
      null;


    this.state.setCamera(
      null,
    );


    /*
     * ----------------------------------------
     * CLEAR LIVE-ONLY VISUAL STATE
     * ----------------------------------------
     */

    this.state.clearOverlay();

    this.state.setHeadPose(
      null,
    );


    /*
     * Preserve:
     *
     * - calibration
     * - head movement
     * - upper-body metrics
     *
     * so the debug/final report can inspect
     * the last valid session state.
     */

    this.state.setCalibration(
      this.calibration.getState(),
    );


    this.emitOverlay();


    this.setStatus(
      "stopped",
    );


    return this.getDiagnostics();
  }


  /*
   * ==========================================
   * DISPOSE
   * ==========================================
   */

  dispose(): void {
    this.stopPipelines();


    this.camera?.stop();

    this.camera =
      null;


    this.disposeModels();


    this.calibration.reset();

    this.headMovement.reset();

    this.upperBody.reset();

    this.sessionAggregator.reset();


    this.lastSessionResult =
      null;

    this.lastSessionReport =
      null;

    this.lastAiPayload =
      null;


    this.state.resetSession();


    this.state.setCalibration(
      this.calibration.getState(),
    );

    this.state.setHeadMovement(
      null,
    );

    this.state.setUpperBody(
      null,
    );


    this.state.setFaceModelReady(
      false,
    );

    this.state.setPoseModelReady(
      false,
    );


    this.state.setStatus(
      "idle",
    );


    this.initialized =
      false;

    this.running =
      false;


    this.emitOverlay();

    this.emitDiagnostics();
  }


  /*
   * ==========================================
   * PUBLIC STATE
   * ==========================================
   */

  getDiagnostics():
    PresentationEngineDiagnostics {
    return this.state.getDiagnostics();
  }


  /*
   * Returns the final scored result after
   * stop() has completed.
   *
   * While a session is running this returns
   * null because the final score has not yet
   * been generated.
   */

  getSessionResult():
    PresentationScoreResult | null {
    if (!this.lastSessionResult) {
      return null;
    }


    return {
      ...this.lastSessionResult,

      categories: {
        ...this.lastSessionResult
          .categories,
      },

      strengths: [
        ...this.lastSessionResult
          .strengths,
      ],

      improvements: [
        ...this.lastSessionResult
          .improvements,
      ],

      summary: {
        ...this.lastSessionResult
          .summary,
      },
    };
  }


  /*
   * ==========================================
   * SESSION REPORT
   * ==========================================
   *
   * Full structured report generated from the
   * finalized session score.
   */
  getSessionReport():
    PresentationSessionReport | null {
    if (!this.lastSessionReport) {
      return null;
    }

    return {
      ...this.lastSessionReport,

      session: {
        ...this.lastSessionReport.session,
      },

      overall: {
        ...this.lastSessionReport.overall,
      },

      categoryWeights: {
        ...this.lastSessionReport.categoryWeights,
      },

      categories: {
        cameraEngagement: {
          ...this.lastSessionReport.categories.cameraEngagement,
        },

        posture: {
          ...this.lastSessionReport.categories.posture,
        },

        facialExpressiveness: {
          ...this.lastSessionReport.categories.facialExpressiveness,
        },

        headStability: {
          ...this.lastSessionReport.categories.headStability,
        },

        framing: {
          ...this.lastSessionReport.categories.framing,
        },

        visualQuality: {
          ...this.lastSessionReport.categories.visualQuality,
        },

        presenceStability: {
          ...this.lastSessionReport.categories.presenceStability,
        },
      },

      samples: {
        ...this.lastSessionReport.samples,
      },

      strengths: [
        ...this.lastSessionReport.strengths,
      ],

      improvements: [
        ...this.lastSessionReport.improvements,
      ],
    };
  }


  /*
   * ==========================================
   * AI PAYLOAD
   * ==========================================
   *
   * Compact representation intended for the
   * future lightweight AI feedback layer.
   */
  getAiPayload():
    PresentationAiPayload | null {
    if (!this.lastAiPayload) {
      return null;
    }

    return {
      ...this.lastAiPayload,

      overall: {
        ...this.lastAiPayload.overall,
      },

      categories: {
        cameraEngagement: {
          ...this.lastAiPayload.categories.cameraEngagement,
        },

        posture: {
          ...this.lastAiPayload.categories.posture,
        },

        facialExpressiveness: {
          ...this.lastAiPayload.categories.facialExpressiveness,
        },

        headStability: {
          ...this.lastAiPayload.categories.headStability,
        },

        framing: {
          ...this.lastAiPayload.categories.framing,
        },

        visualQuality: {
          ...this.lastAiPayload.categories.visualQuality,
        },

        presenceStability: {
          ...this.lastAiPayload.categories.presenceStability,
        },
      },

      session: {
        ...this.lastAiPayload.session,
      },

      existingSignals: {
        strengths: [
          ...this.lastAiPayload.existingSignals.strengths,
        ],

        improvements: [
          ...this.lastAiPayload.existingSignals.improvements,
        ],
      },
    };
  }


  isInitialized(): boolean {
    return this.initialized;
  }


  isRunning(): boolean {
    return this.running;
  }


  /*
   * ==========================================
   * FACE UPDATE
   * ==========================================
   */

  private handleFaceUpdate(
    update: FacePipelineUpdate,
  ): void {
    if (!this.running) {
      return;
    }


    /*
     * ----------------------------------------
     * RAW FACE PIPELINE STATE
     * ----------------------------------------
     */

    this.state.applyFaceUpdate(
      update,
    );


    /*
     * ----------------------------------------
     * HEAD CALIBRATION
     * ----------------------------------------
     */

    const headPose =
      update.diagnostics.headPose;


    if (
      update.diagnostics.detected &&
      headPose
    ) {
      const calibrated =
        this.calibration
          .processHeadSample({
            yaw:
              headPose.yaw,

            pitch:
              headPose.pitch,

            roll:
              headPose.roll,
          });


      /*
       * --------------------------------------
       * CALIBRATED HEAD MOVEMENT
       * --------------------------------------
       */

      if (calibrated) {
        const movement =
          this.headMovement.process(
            calibrated,
          );


        this.state.setHeadMovement(
          movement,
        );
      }
    }


    /*
     * Keep current calibration state visible
     * to diagnostics/UI.
     */

    this.state.setCalibration(
      this.calibration.getState(),
    );


    /*
     * ----------------------------------------
     * SESSION AGGREGATION
     * ----------------------------------------
     *
     * Ingest only AFTER all face/head state
     * updates for this frame have completed.
     */

    this.ingestCurrentState();


    this.emitOverlay();

    this.emitDiagnostics();
  }


  /*
   * ==========================================
   * POSE UPDATE
   * ==========================================
   */

  private handlePoseUpdate(
    update: PosePipelineUpdate,
  ): void {
    if (!this.running) {
      return;
    }


    /*
     * ----------------------------------------
     * RAW POSE PIPELINE STATE
     * ----------------------------------------
     */

    this.state.applyPoseUpdate(
      update,
    );


    /*
     * ----------------------------------------
     * UPPER BODY ANALYSIS
     * ----------------------------------------
     *
     * PosePipeline returns:
     *
     * NormalizedLandmark[][]
     *
     * We currently analyse the first detected
     * person because YOC.ai interviews are
     * single-person sessions.
     */

    const poseLandmarks =
      update.landmarks[0] ?? null;


    if (
      update.diagnostics.detected &&
      poseLandmarks
    ) {
      const upperBodyMetrics =
        this.upperBody.process(
          poseLandmarks,
        );


      this.state.setUpperBody(
        upperBodyMetrics,
      );
    } else {
      /*
       * No person in the current pose frame.
       *
       * Clear the live upper-body reading.
       * Historical/session values already
       * collected by SessionAggregator remain
       * separate from this live state.
       */

      this.state.setUpperBody(
        null,
      );
    }


    /*
     * ----------------------------------------
     * SESSION AGGREGATION
     * ----------------------------------------
     *
     * IMPORTANT:
     *
     * UpperBodyAnalyzer MUST run before this.
     * Otherwise SessionAggregator receives a
     * pose frame with upperBody = null.
     */

    this.ingestCurrentState();


    this.emitOverlay();

    this.emitDiagnostics();
  }


  /*
   * ==========================================
   * SESSION AGGREGATION
   * ==========================================
   */

  private ingestCurrentState(): void {
    const diagnostics =
      this.state.getDiagnostics();


    this.sessionAggregator.ingest(
      diagnostics,
    );
  }


  /*
   * ==========================================
   * PIPELINES
   * ==========================================
   */

  private stopPipelines(): void {
    /*
     * Disable callbacks before stopping
     * schedulers.
     */

    this.running =
      false;


    this.facePipeline?.stop();

    this.posePipeline?.stop();
  }


  /*
   * ==========================================
   * MODELS
   * ==========================================
   */

  private disposeModels(): void {
    this.facePipeline?.stop();

    this.posePipeline?.stop();


    this.facePipeline =
      null;

    this.posePipeline =
      null;


    this.faceLandmarker?.close();

    this.poseLandmarker?.close();


    this.faceLandmarker =
      null;

    this.poseLandmarker =
      null;


    this.initialized =
      false;


    this.state.setFaceModelReady(
      false,
    );

    this.state.setPoseModelReady(
      false,
    );
  }


  /*
   * ==========================================
   * EVENTS
   * ==========================================
   */

  private emitOverlay(): void {
    this.onOverlay?.(
      this.state.getOverlay(),
    );
  }


  private emitDiagnostics(): void {
    this.onDiagnostics?.(
      this.state.getDiagnostics(),
    );
  }


  private setStatus(
    status:
      PresentationEngineStatus,
  ): void {
    this.state.setStatus(
      status,
    );


    this.emitDiagnostics();
  }
}