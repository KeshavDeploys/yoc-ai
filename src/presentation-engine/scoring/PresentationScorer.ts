import type {
  PresentationSessionSummary,
} from "../aggregation/SessionAggregator";


/*
 * ==========================================
 * CATEGORY SCORES
 * ==========================================
 */

export interface PresentationCategoryScores {
  cameraEngagement: number;

  posture: number;

  facialExpressiveness: number;

  headStability: number;

  framing: number;

  visualQuality: number;

  presenceStability: number;
}


/*
 * ==========================================
 * PERFORMANCE LEVEL
 * ==========================================
 */

export type PresentationPerformanceLevel =
  | "excellent"
  | "good"
  | "average"
  | "needs_improvement";


/*
 * ==========================================
 * SCORE RESULT
 * ==========================================
 */

export interface PresentationScoreResult {
  overallScore: number;

  scoreOutOf10: number;

  performanceLevel:
    PresentationPerformanceLevel;

  categories:
    PresentationCategoryScores;

  strengths: string[];

  improvements: string[];

  summary:
    PresentationSessionSummary;

  reliable: boolean;

  reliabilityReason:
    string | null;
}


/*
 * ==========================================
 * OPTIONS
 * ==========================================
 */

export interface PresentationScorerOptions {
  minimumFaceSamples?: number;

  minimumHeadSamples?: number;

  minimumPoseSamples?: number;
}


/*
 * ==========================================
 * SCORER
 * ==========================================
 */

export class PresentationScorer {
  private readonly minimumFaceSamples:
    number;

  private readonly minimumHeadSamples:
    number;

  private readonly minimumPoseSamples:
    number;


  constructor(
    options:
      PresentationScorerOptions = {},
  ) {
    /*
     * Face runs around 12 FPS.
     * Pose runs around 4 FPS.
     *
     * These thresholds mainly prevent a
     * very short accidental session from
     * producing a convincing-looking score.
     */

    this.minimumFaceSamples =
      options.minimumFaceSamples ??
      60;

    this.minimumHeadSamples =
      options.minimumHeadSamples ??
      30;

    this.minimumPoseSamples =
      options.minimumPoseSamples ??
      20;
  }


  /*
   * ==========================================
   * SCORE SESSION
   * ==========================================
   */

  score(
    summary:
      PresentationSessionSummary,
  ): PresentationScoreResult {
    const categories =
      this.calculateCategories(
        summary,
      );


    /*
     * ========================================
     * FINAL WEIGHTS
     * ========================================
     *
     * Camera Engagement       20%
     * Posture                 15%
     * Facial Expressiveness   10%
     * Head Stability          15%
     * Framing                 15%
     * Visual Quality          10%
     * Presence Stability      15%
     *
     * Total                   100%
     */

    const overallScore =
      this.round(
        categories.cameraEngagement *
          0.20 +

        categories.posture *
          0.15 +

        categories.facialExpressiveness *
          0.10 +

        categories.headStability *
          0.15 +

        categories.framing *
          0.15 +

        categories.visualQuality *
          0.10 +

        categories.presenceStability *
          0.15,
      );


    const reliability =
      this.getReliability(
        summary,
      );


    const performanceLevel =
      this.getPerformanceLevel(
        overallScore,
        summary,
        categories,
      );


    return {
      overallScore,

      scoreOutOf10:
        this.round(
          overallScore / 10,
          1,
        ),

      performanceLevel,

      categories,

      strengths:
        this.createStrengths(
          summary,
          categories,
        ),

      improvements:
        this.createImprovements(
          summary,
          categories,
        ),

      summary: {
        ...summary,
      },

      reliable:
        reliability.reliable,

      reliabilityReason:
        reliability.reason,
    };
  }


  /*
   * ==========================================
   * CATEGORY SCORES
   * ==========================================
   */

  private calculateCategories(
    summary:
      PresentationSessionSummary,
  ): PresentationCategoryScores {
    /*
     * ========================================
     * FINAL 7-CATEGORY MODEL
     * ========================================
     *
     * Camera Engagement       20%
     * Posture                 15%
     * Facial Expressiveness   10%
     * Head Stability          15%
     * Framing                 15%
     * Visual Quality          10%
     * Presence Stability      15%
     *
     * Total                   100%
     *
     * Blink count/rate are intentionally
     * excluded because natural blinking is
     * not presentation quality.
     */


    /*
     * ========================================
     * CAMERA ENGAGEMENT
     * ========================================
     *
     * Answers:
     * "Was the candidate oriented toward
     *  the camera/interviewer?"
     *
     * 70% head centered
     * 30% looking-away avoidance
     *
     * Face visibility is NOT used here.
     * Framing owns camera positioning.
     */

    const lookingAwayAvoidance =
      this.clamp(
        100 -
          summary.lookingAwayPercent *
            2,
        0,
        100,
      );


    const cameraEngagement =
      this.round(
        this.clamp(
          summary.headCenteredPercent *
            0.70 +

          lookingAwayAvoidance *
            0.30,

          0,
          100,
        ),
      );


    /*
     * ========================================
     * POSTURE
     * ========================================
     *
     * Shoulder/upper-body only.
     * No hips are used.
     *
     * 75% good shoulder posture
     * 25% upper-body centered
     */

    const posture =
      this.round(
        this.clamp(
          summary.goodPosturePercent *
            0.75 +

          summary.bodyCenteredPercent *
            0.25,

          0,
          100,
        ),
      );


    /*
     * ========================================
     * FACIAL EXPRESSIVENESS
     * ========================================
     *
     * Direct temporal facial movement score.
     * No emotion classification.
     * No blink scoring.
     */

    const facialExpressiveness =
      this.round(
        this.clamp(
          summary.facialExpressivenessScore,
          0,
          100,
        ),
      );


    /*
     * ========================================
     * HEAD STABILITY
     * ========================================
     *
     * Measures unnecessary head movement.
     *
     * Engagement = where the head is facing.
     * Stability = how much the head moves.
     */

    const headStability =
      this.round(
        this.clamp(
          summary.headStabilityScore,
          0,
          100,
        ),
      );


    /*
     * ========================================
     * FRAMING
     * ========================================
     *
     * Measures whether the face is positioned
     * appropriately inside the camera frame.
     *
     * 70% good framing
     * 30% centered face
     */

    const framing =
      this.round(
        this.clamp(
          summary.goodFramingPercent *
            0.70 +

          summary.centeredFacePercent *
            0.30,

          0,
          100,
        ),
      );


    /*
     * ========================================
     * VISUAL QUALITY
     * ========================================
     *
     * The current engine does NOT yet have a
     * dedicated image-quality analyzer for
     * lighting, sharpness, exposure, resolution,
     * or color quality.
     *
     * Therefore this is explicitly a visual
     * usability proxy:
     *
     * 70% face visibility
     * 30% good framing
     *
     * It should not be interpreted as a true
     * camera/image-quality measurement until
     * a dedicated visual-quality analyzer exists.
     */

    const visualQuality =
      this.round(
        this.clamp(
          summary.faceVisibilityPercent *
            0.70 +

          summary.goodFramingPercent *
            0.30,

          0,
          100,
        ),
      );


    /*
     * ========================================
     * PRESENCE STABILITY
     * ========================================
     *
     * Measures steady physical presence using
     * shoulder/upper-body movement stability.
     *
     * Body centering is intentionally NOT added
     * here because it already belongs to Posture.
     *
     * This prevents double-penalizing the same
     * positioning behavior.
     */

    const presenceStability =
      this.round(
        this.clamp(
          summary.bodyStabilityScore,
          0,
          100,
        ),
      );


    return {
      cameraEngagement,

      posture,

      facialExpressiveness,

      headStability,

      framing,

      visualQuality,

      presenceStability,
    };
  }


  /*
   * ==========================================
   * PERFORMANCE LEVEL
   * ==========================================
   */

  private getPerformanceLevel(
    overallScore: number,

    summary:
      PresentationSessionSummary,

    categories:
      PresentationCategoryScores,
  ): PresentationPerformanceLevel {
    /*
     * Severe issues override a high average.
     * This prevents one strong category from
     * hiding a major presentation problem.
     */

    const severeLookingAway =
      summary.lookingAwayPercent >=
      35;


    const severeHeadStability =
      categories.headStability <
      45;


    const severePresenceStability =
      categories.presenceStability <
      45;


    const severeFraming =
      categories.framing <
      40;


    const severeFacialExpressiveness =
      categories.facialExpressiveness <
      25;


    if (
      severeLookingAway ||
      severeHeadStability ||
      severePresenceStability ||
      severeFraming ||
      severeFacialExpressiveness
    ) {
      return "needs_improvement";
    }


    /*
     * ========================================
     * EXCELLENT
     * ========================================
     *
     * High overall score plus consistently
     * strong behavior across the important
     * presentation dimensions.
     */

    if (
      overallScore >=
        85 &&

      categories.cameraEngagement >=
        80 &&

      categories.posture >=
        80 &&

      categories.headStability >=
        80 &&

      categories.framing >=
        80 &&

      categories.facialExpressiveness >=
        70 &&

      categories.visualQuality >=
        80 &&

      categories.presenceStability >=
        80 &&

      summary.lookingAwayPercent <=
        10
    ) {
      return "excellent";
    }


    /*
     * ========================================
     * GOOD
     * ========================================
     */

    if (
      overallScore >=
        70 &&

      categories.cameraEngagement >=
        65 &&

      categories.posture >=
        65 &&

      categories.headStability >=
        65 &&

      categories.framing >=
        65 &&

      categories.facialExpressiveness >=
        50 &&

      categories.visualQuality >=
        65 &&

      categories.presenceStability >=
        65 &&

      summary.lookingAwayPercent <=
        20
    ) {
      return "good";
    }


    /*
     * ========================================
     * AVERAGE
     * ========================================
     */

    if (
      overallScore >=
      55
    ) {
      return "average";
    }


    return "needs_improvement";
  }


  /*
   * ==========================================
   * STRENGTHS
   * ==========================================
   */

  private createStrengths(
    summary:
      PresentationSessionSummary,

    categories:
      PresentationCategoryScores,
  ): string[] {
    const strengths:
      string[] = [];


    if (
      summary.faceVisibilityPercent >=
      95
    ) {
      strengths.push(
        "You remained clearly visible for almost the entire session.",
      );
    }


    if (
      summary.goodFramingPercent >=
      85
    ) {
      strengths.push(
        "Your camera framing stayed consistent throughout the session.",
      );
    }


    if (
      summary.lookingAwayPercent <=
        8 &&
      summary.headSamples > 0
    ) {
      strengths.push(
        "You kept your head orientation focused for most of the session.",
      );
    }


    if (
      categories.facialExpressiveness >=
      80
    ) {
      strengths.push(
        "Your facial movement showed natural variation while presenting.",
      );
    }


    if (
      summary.goodPosturePercent >=
      80
    ) {
      strengths.push(
        "You maintained good upper-body posture for most of the session.",
      );
    }


    if (
      categories.presenceStability >=
      85
    ) {
      strengths.push(
        "Your physical presence remained stable and composed.",
      );
    }


    if (
      strengths.length === 0
    ) {
      strengths.push(
        "You completed the camera session with enough presentation data for analysis.",
      );
    }


    return strengths.slice(
      0,
      4,
    );
  }


  /*
   * ==========================================
   * IMPROVEMENTS
   * ==========================================
   */

  private createImprovements(
    summary:
      PresentationSessionSummary,

    categories:
      PresentationCategoryScores,
  ): string[] {
    const improvements:
      string[] = [];


    /*
     * CAMERA ENGAGEMENT
     */

    if (
      categories.cameraEngagement <
      70
    ) {
      improvements.push(
        "Try to maintain a more consistent forward-facing orientation during your answers.",
      );
    }


    /*
     * FACE VISIBILITY
     */

    if (
      summary.faceVisibilityPercent <
      90
    ) {
      improvements.push(
        "Try to remain fully visible in the camera throughout your interview.",
      );
    }


    /*
     * FRAMING
     */

    if (
      summary.goodFramingPercent <
      75
    ) {
      improvements.push(
        "Adjust your camera position so your face remains consistently well framed.",
      );
    }


    /*
     * FACE CENTERING
     */

    if (
      summary.centeredFacePercent <
      70
    ) {
      improvements.push(
        "Try to keep yourself more consistently positioned within the central camera area.",
      );
    }


    /*
     * LOOKING AWAY
     */

    if (
      summary.lookingAwayPercent >
      15
    ) {
      improvements.push(
        "You looked away frequently; try to keep your head orientation more focused during answers.",
      );
    }


    /*
     * HEAD STABILITY
     */

    if (
      categories.headStability <
      70
    ) {
      improvements.push(
        "Reduce large or frequent head movements while speaking.",
      );
    }


    /*
     * FACIAL EXPRESSIVENESS
     */

    if (
      categories.facialExpressiveness <
      55
    ) {
      improvements.push(
        "Your facial movement was relatively limited; allow natural facial expression to accompany your answers.",
      );
    }


    /*
     * POSTURE
     */

    if (
      summary.goodPosturePercent <
      70
    ) {
      improvements.push(
        "Maintain a more upright and consistent upper-body posture.",
      );
    }


    /*
     * BODY CENTERING
     */

    if (
      summary.bodyCenteredPercent <
      70
    ) {
      improvements.push(
        "Keep your upper body more consistently centered in the camera.",
      );
    }


    /*
     * PRESENCE STABILITY
     */

    if (
      categories.presenceStability <
      70
    ) {
      improvements.push(
        "Try to reduce unnecessary upper-body movement to create a steadier presentation.",
      );
    }


    /*
     * STRONG INSTABILITY WARNING
     */

    if (
      categories.presenceStability <
      55
    ) {
      improvements.unshift(
        "Your presentation showed noticeable physical instability; focus on maintaining a steady, composed position while speaking.",
      );
    }


    /*
     * STRONG LOOKING-AWAY WARNING
     */

    if (
      summary.lookingAwayPercent >=
      30
    ) {
      improvements.unshift(
        "You frequently looked away from the camera; maintaining a more consistent forward orientation would improve your presentation.",
      );
    }


    /*
     * Blink count/rate are intentionally
     * absent.
     *
     * Natural blinking is not scored.
     */


    if (
      improvements.length === 0
    ) {
      improvements.push(
        "Your camera presentation was consistent; focus next on maintaining the same quality throughout longer answers.",
      );
    }


    /*
     * Remove duplicates while preserving
     * their original order.
     */

    return [
      ...new Set(
        improvements,
      ),
    ].slice(
      0,
      4,
    );
  }


  /*
   * ==========================================
   * RELIABILITY
   * ==========================================
   */

  private getReliability(
    summary:
      PresentationSessionSummary,
  ): {
    reliable: boolean;

    reason: string | null;
  } {
    if (
      summary.faceSamples <
      this.minimumFaceSamples
    ) {
      return {
        reliable: false,

        reason:
          "Not enough face-analysis samples were collected.",
      };
    }


    if (
      summary.headSamples <
      this.minimumHeadSamples
    ) {
      return {
        reliable: false,

        reason:
          "Not enough calibrated head-movement samples were collected.",
      };
    }


    if (
      summary.poseSamples <
      this.minimumPoseSamples
    ) {
      return {
        reliable: false,

        reason:
          "Not enough upper-body pose samples were collected.",
      };
    }


    return {
      reliable: true,

      reason: null,
    };
  }


  /*
   * ==========================================
   * UTIL
   * ==========================================
   */

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


  private round(
    value: number,

    decimals = 0,
  ): number {
    const factor =
      10 ** decimals;


    return (
      Math.round(
        value *
          factor,
      ) /
      factor
    );
  }
}