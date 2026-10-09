export interface HeadPose {
  /**
   * Left/right head rotation in degrees.
   */
  yaw: number;

  /**
   * Up/down head rotation in degrees.
   */
  pitch: number;

  /**
   * Side-to-side head tilt in degrees.
   */
  roll: number;
}