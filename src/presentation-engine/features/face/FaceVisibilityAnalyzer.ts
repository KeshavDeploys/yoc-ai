import type {
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";


export type FaceFraming =
  | "good"
  | "too-close"
  | "too-far"
  | "off-center"
  | "not-visible";


export interface FaceVisibilityMetrics {
  visible: boolean;

  visibilityPercent: number;

  framing: FaceFraming;

  centered: boolean;

  faceWidthRatio: number;

  faceHeightRatio: number;

  centerX: number;

  centerY: number;

  sampleCount: number;

  visibleSamples: number;
}


export class FaceVisibilityAnalyzer {
  private totalSamples = 0;

  private visibleSamples = 0;


  process(
    landmarks:
      NormalizedLandmark[] | null,
  ): FaceVisibilityMetrics {
    this.totalSamples += 1;


    if (
      !landmarks ||
      landmarks.length === 0
    ) {
      return this.createMissingMetrics();
    }


    this.visibleSamples += 1;


    let minX = 1;
    let maxX = 0;

    let minY = 1;
    let maxY = 0;


    for (const landmark of landmarks) {
      minX = Math.min(
        minX,
        landmark.x,
      );

      maxX = Math.max(
        maxX,
        landmark.x,
      );

      minY = Math.min(
        minY,
        landmark.y,
      );

      maxY = Math.max(
        maxY,
        landmark.y,
      );
    }


    const faceWidthRatio =
      maxX - minX;

    const faceHeightRatio =
      maxY - minY;


    const centerX =
      (minX + maxX) / 2;

    const centerY =
      (minY + maxY) / 2;


    /*
     * Generous interview framing zone.
     *
     * We deliberately avoid requiring the
     * face to sit at the mathematical center.
     */
    const centered =
      centerX >= 0.30 &&
      centerX <= 0.70 &&
      centerY >= 0.25 &&
      centerY <= 0.70;


    const framing =
      this.classifyFraming(
        centered,
        faceWidthRatio,
        faceHeightRatio,
      );


    return {
      visible: true,

      visibilityPercent:
        this.getVisibilityPercent(),

      framing,

      centered,

      faceWidthRatio,

      faceHeightRatio,

      centerX,

      centerY,

      sampleCount:
        this.totalSamples,

      visibleSamples:
        this.visibleSamples,
    };
  }


  reset(): void {
    this.totalSamples = 0;

    this.visibleSamples = 0;
  }


  private classifyFraming(
    centered: boolean,
    width: number,
    height: number,
  ): FaceFraming {
    /*
     * These are intentionally broad MVP
     * thresholds and should later be tuned
     * using real interview recordings.
     */

    if (
      width > 0.55 ||
      height > 0.75
    ) {
      return "too-close";
    }


    if (
      width < 0.12 ||
      height < 0.18
    ) {
      return "too-far";
    }


    if (!centered) {
      return "off-center";
    }


    return "good";
  }


  private getVisibilityPercent(): number {
    if (
      this.totalSamples === 0
    ) {
      return 0;
    }


    return (
      this.visibleSamples /
      this.totalSamples
    ) * 100;
  }


  private createMissingMetrics():
    FaceVisibilityMetrics {
    return {
      visible: false,

      visibilityPercent:
        this.getVisibilityPercent(),

      framing: "not-visible",

      centered: false,

      faceWidthRatio: 0,

      faceHeightRatio: 0,

      centerX: 0,

      centerY: 0,

      sampleCount:
        this.totalSamples,

      visibleSamples:
        this.visibleSamples,
    };
  }
}