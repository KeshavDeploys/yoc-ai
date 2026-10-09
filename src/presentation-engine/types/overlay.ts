import type {
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";


export interface PresentationEngineOverlay {
  faceLandmarks:
    NormalizedLandmark[][];

  poseLandmarks:
    NormalizedLandmark[][];
}