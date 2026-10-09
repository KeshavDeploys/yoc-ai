import type {
  CameraInfo,
} from "../camera/CameraManager";

import type {
  HeadPose,
} from "../features/head/types";

import type {
  HeadMovementMetrics,
} from "../features/head/HeadMovementAnalyzer";

import type {
  FaceVisibilityMetrics,
} from "../features/face/FaceVisibilityAnalyzer";

import type {
  BlinkMetrics,
} from "../features/face/BlinkAnalyzer";

import type {
  UpperBodyMetrics,
} from "../features/upper-body/UpperBodyAnalyzer";

import type {
  CalibrationState,
} from "../calibration/CalibrationManager";

import type {
  FacePipelineUpdate,
} from "../pipelines/FacePipeline";

import type {
  PosePipelineUpdate,
} from "../pipelines/PosePipeline";

import type {
  PresentationEngineDiagnostics,
  PresentationEngineStatus,
} from "../types/diagnostics";

import type {
  PresentationEngineOverlay,
} from "../types/overlay";


export interface EngineStateOptions {
  faceTargetFps: number;

  poseTargetFps: number;

  calibrationTargetSamples?: number;
}


export class EngineState {
  private diagnostics:
    PresentationEngineDiagnostics;


  private overlay:
    PresentationEngineOverlay = {
      faceLandmarks: [],
      poseLandmarks: [],
    };


  constructor(
    options:
      EngineStateOptions,
  ) {
    this.diagnostics =
      this.createInitialDiagnostics(
        options,
      );
  }


  /*
   * ==========================================
   * STATUS
   * ==========================================
   */

  setStatus(
    status:
      PresentationEngineStatus,
  ): void {
    this.diagnostics.status =
      status;
  }


  /*
   * ==========================================
   * CAMERA
   * ==========================================
   */

  setCamera(
    camera:
      CameraInfo | null,
  ): void {
    this.diagnostics.camera =
      camera
        ? {
            ...camera,
          }
        : null;
  }


  /*
   * ==========================================
   * MODELS
   * ==========================================
   */

  setFaceModelReady(
    ready: boolean,
  ): void {
    this.diagnostics
      .face
      .modelReady =
      ready;
  }


  setPoseModelReady(
    ready: boolean,
  ): void {
    this.diagnostics
      .pose
      .modelReady =
      ready;
  }


  /*
   * ==========================================
   * FACE PIPELINE
   * ==========================================
   */

  applyFaceUpdate(
    update:
      FacePipelineUpdate,
  ): void {
    const face =
      update.diagnostics;


    this.diagnostics.face.detected =
      face.detected;


    this.diagnostics.face.targetFps =
      face.targetFps;


    this.diagnostics.face.actualFps =
      face.actualFps;


    this.diagnostics.face.latencyMs =
      face.latencyMs;


    this.diagnostics
      .face
      .averageLatencyMs =
      face.averageLatencyMs;


    this.diagnostics
      .face
      .processedFrames =
      face.processedFrames;


    /*
     * Raw head orientation.
     */

    this.diagnostics.headPose =
      face.headPose
        ? {
            ...face.headPose,
          }
        : null;


    /*
     * Face visibility/framing.
     */

    this.diagnostics.faceVisibility =
      face.faceVisibility
        ? {
            ...face.faceVisibility,
          }
        : null;


    /*
     * Blink analysis.
     */

    this.diagnostics.blink =
      face.blink
        ? {
            ...face.blink,
          }
        : null;


    /*
     * Facial expressiveness.
     */

    this.diagnostics.facialExpressiveness =
      face.facialExpressiveness
        ? {
            ...face.facialExpressiveness,
          }
        : null;


    /*
     * Debug overlay.
     */

    this.overlay.faceLandmarks =
      update.landmarks;
  }


  /*
   * ==========================================
   * POSE PIPELINE
   * ==========================================
   */

  applyPoseUpdate(
    update:
      PosePipelineUpdate,
  ): void {
    const pose =
      update.diagnostics;


    this.diagnostics.pose.detected =
      pose.detected;


    this.diagnostics.pose.targetFps =
      pose.targetFps;


    this.diagnostics.pose.actualFps =
      pose.actualFps;


    this.diagnostics.pose.latencyMs =
      pose.latencyMs;


    this.diagnostics
      .pose
      .averageLatencyMs =
      pose.averageLatencyMs;


    this.diagnostics
      .pose
      .processedFrames =
      pose.processedFrames;


    /*
     * Upper-body / posture analysis.
     */

    this.diagnostics.upperBody =
      pose.upperBody
        ? {
            ...pose.upperBody,
          }
        : null;


    /*
     * Debug overlay.
     */

    this.overlay.poseLandmarks =
      update.landmarks;
  }


  /*
   * ==========================================
   * HEAD
   * ==========================================
   */

  setHeadPose(
    headPose:
      HeadPose | null,
  ): void {
    this.diagnostics.headPose =
      headPose
        ? {
            ...headPose,
          }
        : null;
  }


  setHeadMovement(
    headMovement:
      HeadMovementMetrics | null,
  ): void {
    this.diagnostics.headMovement =
      headMovement
        ? {
            ...headMovement,
          }
        : null;
  }


  /*
   * ==========================================
   * FACE VISIBILITY
   * ==========================================
   */

  setFaceVisibility(
    faceVisibility:
      FaceVisibilityMetrics | null,
  ): void {
    this.diagnostics.faceVisibility =
      faceVisibility
        ? {
            ...faceVisibility,
          }
        : null;
  }


  /*
   * ==========================================
   * BLINK
   * ==========================================
   */

  setBlink(
    blink:
      BlinkMetrics | null,
  ): void {
    this.diagnostics.blink =
      blink
        ? {
            ...blink,
          }
        : null;
  }


  /*
   * ==========================================
   * UPPER BODY
   * ==========================================
   */

  setUpperBody(
    upperBody:
      UpperBodyMetrics | null,
  ): void {
    this.diagnostics.upperBody =
      upperBody
        ? {
            ...upperBody,
          }
        : null;
  }


  /*
   * ==========================================
   * CALIBRATION
   * ==========================================
   */

  setCalibration(
    calibration:
      CalibrationState,
  ): void {
    this.diagnostics.calibration =
      this.cloneCalibration(
        calibration,
      );
  }


  /*
   * ==========================================
   * SESSION RESET
   * ==========================================
   */

  resetSession(): void {
    this.diagnostics.camera =
      null;


    /*
     * Face runtime.
     */

    this.diagnostics.face.detected =
      false;

    this.diagnostics.face.actualFps =
      0;

    this.diagnostics.face.latencyMs =
      0;

    this.diagnostics
      .face
      .averageLatencyMs =
      0;

    this.diagnostics
      .face
      .processedFrames =
      0;


    /*
     * Pose runtime.
     */

    this.diagnostics.pose.detected =
      false;

    this.diagnostics.pose.actualFps =
      0;

    this.diagnostics.pose.latencyMs =
      0;

    this.diagnostics
      .pose
      .averageLatencyMs =
      0;

    this.diagnostics
      .pose
      .processedFrames =
      0;


    /*
     * Presentation analysis.
     */

    this.diagnostics.headPose =
      null;


    this.diagnostics.headMovement =
      null;


    this.diagnostics.faceVisibility =
      null;


    this.diagnostics.blink =
      null;


    this.diagnostics.facialExpressiveness =
      null;


    this.diagnostics.upperBody =
      null;


    /*
     * Calibration.
     */

    this.diagnostics.calibration = {
      status: "idle",

      sampleCount: 0,

      targetSamples:
        this.diagnostics
          .calibration
          .targetSamples,

      progress: 0,

      baseline: null,

      calibratedHead: null,
    };


    this.clearOverlay();
  }


  /*
   * ==========================================
   * OVERLAY
   * ==========================================
   */

  clearOverlay(): void {
    this.overlay = {
      faceLandmarks: [],
      poseLandmarks: [],
    };
  }


  getOverlay():
    PresentationEngineOverlay {
    return {
      faceLandmarks: [
        ...this.overlay
          .faceLandmarks,
      ],

      poseLandmarks: [
        ...this.overlay
          .poseLandmarks,
      ],
    };
  }


  /*
   * ==========================================
   * DIAGNOSTICS
   * ==========================================
   */

  getDiagnostics():
    PresentationEngineDiagnostics {
    return {
      ...this.diagnostics,


      camera:
        this.diagnostics.camera
          ? {
              ...this.diagnostics
                .camera,
            }
          : null,


      face: {
        ...this.diagnostics.face,
      },


      pose: {
        ...this.diagnostics.pose,
      },


      headPose:
        this.diagnostics.headPose
          ? {
              ...this.diagnostics
                .headPose,
            }
          : null,


      calibration:
        this.cloneCalibration(
          this.diagnostics
            .calibration,
        ),


      headMovement:
        this.diagnostics
          .headMovement
          ? {
              ...this.diagnostics
                .headMovement,
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
        this.diagnostics.facialExpressiveness
          ? {
              ...this.diagnostics
                .facialExpressiveness,
            }
          : null,


      upperBody:
        this.diagnostics.upperBody
          ? {
              ...this.diagnostics
                .upperBody,
            }
          : null,
    };
  }


  /*
   * ==========================================
   * CALIBRATION COPY
   * ==========================================
   */

  private cloneCalibration(
    calibration:
      CalibrationState,
  ): CalibrationState {
    return {
      status:
        calibration.status,


      sampleCount:
        calibration.sampleCount,


      targetSamples:
        calibration.targetSamples,


      progress:
        calibration.progress,


      baseline:
        calibration.baseline
          ? {
              ...calibration.baseline,
            }
          : null,


      calibratedHead:
        calibration.calibratedHead
          ? {
              raw: {
                ...calibration
                  .calibratedHead
                  .raw,
              },

              yaw:
                calibration
                  .calibratedHead
                  .yaw,

              pitch:
                calibration
                  .calibratedHead
                  .pitch,

              roll:
                calibration
                  .calibratedHead
                  .roll,
            }
          : null,
    };
  }


  /*
   * ==========================================
   * INITIAL STATE
   * ==========================================
   */

  private createInitialDiagnostics(
    options:
      EngineStateOptions,
  ): PresentationEngineDiagnostics {
    return {
      status: "idle",


      camera: null,


      face: {
        modelReady: false,

        detected: false,

        targetFps:
          options.faceTargetFps,

        actualFps: 0,

        latencyMs: 0,

        averageLatencyMs: 0,

        processedFrames: 0,
      },


      pose: {
        modelReady: false,

        detected: false,

        targetFps:
          options.poseTargetFps,

        actualFps: 0,

        latencyMs: 0,

        averageLatencyMs: 0,

        processedFrames: 0,
      },


      headPose: null,


      calibration: {
        status: "idle",

        sampleCount: 0,

        targetSamples:
          options
            .calibrationTargetSamples ??
          30,

        progress: 0,

        baseline: null,

        calibratedHead: null,
      },


      headMovement: null,


      faceVisibility: null,


      blink: null,


      facialExpressiveness: null,


      upperBody: null,
    };
  }
}