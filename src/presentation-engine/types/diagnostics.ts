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
  FacialExpressivenessMetrics,
} from "../features/face/FacialExpressivenessAnalyzer";

import type {
  UpperBodyMetrics,
} from "../features/upper-body/UpperBodyAnalyzer";

import type {
  CalibrationState,
} from "../calibration/CalibrationManager";


export type PresentationEngineStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "running"
  | "stopped"
  | "error";


export interface PipelineDiagnostics {
  modelReady: boolean;

  detected: boolean;

  targetFps: number;

  actualFps: number;

  latencyMs: number;

  averageLatencyMs: number;

  processedFrames: number;
}


export interface PresentationEngineDiagnostics {
  status:
    PresentationEngineStatus;


  camera:
    CameraInfo | null;


  face:
    PipelineDiagnostics;


  pose:
    PipelineDiagnostics;


  /*
   * Raw MediaPipe-derived
   * head orientation.
   */
  headPose:
    HeadPose | null;


  /*
   * Session-specific neutral
   * head baseline.
   */
  calibration:
    CalibrationState;


  /*
   * Presentation behaviour
   * derived from calibrated
   * head orientation.
   */
  headMovement:
    HeadMovementMetrics | null;


  /*
   * Face presence and
   * camera framing.
   */
  faceVisibility:
    FaceVisibilityMetrics | null;


  /*
   * Eye telemetry.
   *
   * Natural blinking is NOT scored.
   */
  blink:
    BlinkMetrics | null;


  /*
   * Temporal facial movement used
   * for Facial Expressiveness.
   *
   * This does not classify emotion.
   */
  facialExpressiveness:
    FacialExpressivenessMetrics | null;


  /*
   * Upper-body / posture
   * analysis derived from
   * MediaPipe Pose.
   *
   * Current YOC.ai posture analysis
   * remains limited to the shoulders
   * and upper body.
   */
  upperBody:
    UpperBodyMetrics | null;
}