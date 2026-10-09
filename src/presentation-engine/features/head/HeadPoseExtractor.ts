import type { Matrix } from "@mediapipe/tasks-vision";

import type { HeadPose } from "./types";

const RADIANS_TO_DEGREES = 180 / Math.PI;

export class HeadPoseExtractor {
  /**
   * Convert MediaPipe's facial transformation matrix
   * into raw yaw / pitch / roll measurements.
   *
   * IMPORTANT:
   * These are raw measurements.
   *
   * No:
   * - calibration
   * - smoothing
   * - scoring
   * - interview judgement
   *
   * happens here.
   */
  extract(
    matrix: Matrix | undefined,
  ): HeadPose | null {
    if (!matrix) {
      return null;
    }

    const data = matrix.data;

    if (!data || data.length < 16) {
      return null;
    }

    /*
     * MediaPipe facial transformation matrix:
     *
     * | r00 r01 r02 tx |
     * | r10 r11 r12 ty |
     * | r20 r21 r22 tz |
     * |  0   0   0  1 |
     *
     * Matrix data is stored column-major.
     */

    const r00 = data[0];
    const r10 = data[1];
    const r20 = data[2];

    const r21 = data[6];
    const r22 = data[10];

    /*
     * Extract Euler angles.
     */

    const pitchRadians = Math.atan2(
      r21,
      r22,
    );

    const yawRadians = Math.atan2(
      -r20,
      Math.sqrt(
        r00 * r00 +
          r10 * r10,
      ),
    );

    const rollRadians = Math.atan2(
      r10,
      r00,
    );

    return {
      yaw:
        yawRadians *
        RADIANS_TO_DEGREES,

      pitch:
        pitchRadians *
        RADIANS_TO_DEGREES,

      roll:
        rollRadians *
        RADIANS_TO_DEGREES,
    };
  }
}