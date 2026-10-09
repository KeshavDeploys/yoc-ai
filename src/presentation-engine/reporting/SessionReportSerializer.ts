import type {
  PresentationScoreResult,
} from "../scoring/PresentationScorer";

export const PRESENTATION_REPORT_VERSION =
  "1.1.0";

export interface PresentationCategoryWeights {
  cameraEngagement: number;
  posture: number;
  facialExpressiveness: number;
  headStability: number;
  framing: number;
  visualQuality: number;
  presenceStability: number;
}

export const PRESENTATION_CATEGORY_WEIGHTS:
  PresentationCategoryWeights = {
    cameraEngagement: 0.20,
    posture: 0.15,
    facialExpressiveness: 0.10,
    headStability: 0.15,
    framing: 0.15,
    visualQuality: 0.10,
    presenceStability: 0.15,
  };

export interface PresentationSessionReport {
  schemaVersion: string;

  session: {
    durationMs: number;
    durationSeconds: number;
    reliable: boolean;
    reliabilityReason: string | null;
  };

  overall: {
    score: number;
    scoreOutOf10: number;
    performanceLevel:
      PresentationScoreResult["performanceLevel"];
  };

  categoryWeights: PresentationCategoryWeights;

  categories: {
    cameraEngagement: {
      score: number;
      headCenteredPercent: number;
      lookingAwayPercent: number;
    };

    posture: {
      score: number;
      goodPosturePercent: number;
      bodyCenteredPercent: number;
      bodyStabilityScore: number;
      basis: "shoulders_only";
    };

    facialExpressiveness: {
      score: number;
      analyzerScore: number;
    };

    headStability: {
      score: number;
      headStabilityScore: number;
      headCenteredPercent: number;
      lookingAwayPercent: number;
    };

    framing: {
      score: number;
      goodFramingPercent: number;
      centeredFacePercent: number;
    };

    visualQuality: {
      score: number;
      faceVisibilityPercent: number;
      goodFramingPercent: number;
      measurementType: "visual_usability_proxy";
    };

    presenceStability: {
      score: number;
      bodyStabilityScore: number;
      basis: "shoulders_only";
    };
  };

  samples: {
    face: number;
    head: number;
    pose: number;
  };

  strengths: string[];
  improvements: string[];
}

export interface PresentationAiPayload {
  schemaVersion: string;

  task: "analyze_interview_presentation";

  instructionsVersion: "1.0";

  overall: {
    score: number;
    scoreOutOf10: number;
    performanceLevel:
      PresentationScoreResult["performanceLevel"];
    reliable: boolean;
  };

  categories: {
    cameraEngagement: {
      score: number;
      headCenteredPercent: number;
      lookingAwayPercent: number;
    };

    posture: {
      score: number;
      goodPosturePercent: number;
      bodyCenteredPercent: number;
    };

    facialExpressiveness: {
      score: number;
    };

    headStability: {
      score: number;
      headCenteredPercent: number;
      lookingAwayPercent: number;
    };

    framing: {
      score: number;
      goodFramingPercent: number;
      centeredFacePercent: number;
    };

    visualQuality: {
      score: number;
      faceVisibilityPercent: number;
      goodFramingPercent: number;
      measurementType: "visual_usability_proxy";
    };

    presenceStability: {
      score: number;
      bodyStabilityScore: number;
    };
  };

  session: {
    durationSeconds: number;
    faceSamples: number;
    headSamples: number;
    poseSamples: number;
  };

  existingSignals: {
    strengths: string[];
    improvements: string[];
  };
}

export type PresentationAiPriority =
  | "camera_engagement"
  | "posture"
  | "facial_expressiveness"
  | "head_stability"
  | "framing"
  | "visual_quality"
  | "presence_stability"
  | "none";

export interface PresentationAiResponse {
  schemaVersion: "1.0";
  summary: string;
  strengths: string[];
  improvements: string[];
  priority: PresentationAiPriority;
  coaching: string[];
}

export function isPresentationAiResponse(
  value: unknown,
): value is PresentationAiResponse {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate =
    value as Record<string, unknown>;

  return (
    candidate.schemaVersion === "1.0" &&
    typeof candidate.summary === "string" &&
    isStringArray(candidate.strengths) &&
    isStringArray(candidate.improvements) &&
    isStringArray(candidate.coaching) &&
    isPresentationAiPriority(candidate.priority)
  );
}

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string",
    )
  );
}

function isPresentationAiPriority(
  value: unknown,
): value is PresentationAiPriority {
  return (
    value === "camera_engagement" ||
    value === "posture" ||
    value === "facial_expressiveness" ||
    value === "head_stability" ||
    value === "framing" ||
    value === "visual_quality" ||
    value === "presence_stability" ||
    value === "none"
  );
}

export function buildPresentationSessionReport(
  result: PresentationScoreResult,
): PresentationSessionReport {
  const summary = result.summary;

  return {
    schemaVersion:
      PRESENTATION_REPORT_VERSION,

    session: {
      durationMs:
        round(summary.durationMs, 2),

      durationSeconds:
        round(summary.durationMs / 1000, 2),

      reliable:
        result.reliable,

      reliabilityReason:
        result.reliabilityReason,
    },

    overall: {
      score:
        result.overallScore,

      scoreOutOf10:
        result.scoreOutOf10,

      performanceLevel:
        result.performanceLevel,
    },

    categoryWeights:
      PRESENTATION_CATEGORY_WEIGHTS,

    categories: {
      cameraEngagement: {
        score:
          result.categories.cameraEngagement,

        headCenteredPercent:
          round(summary.headCenteredPercent),

        lookingAwayPercent:
          round(summary.lookingAwayPercent),
      },

      posture: {
        score:
          result.categories.posture,

        goodPosturePercent:
          round(summary.goodPosturePercent),

        bodyCenteredPercent:
          round(summary.bodyCenteredPercent),

        bodyStabilityScore:
          round(summary.bodyStabilityScore),

        basis:
          "shoulders_only",
      },

      facialExpressiveness: {
        score:
          result.categories.facialExpressiveness,

        analyzerScore:
          round(
            summary.facialExpressivenessScore,
          ),
      },

      headStability: {
        score:
          result.categories.headStability,

        headStabilityScore:
          round(summary.headStabilityScore),

        headCenteredPercent:
          round(summary.headCenteredPercent),

        lookingAwayPercent:
          round(summary.lookingAwayPercent),
      },

      framing: {
        score:
          result.categories.framing,

        goodFramingPercent:
          round(summary.goodFramingPercent),

        centeredFacePercent:
          round(summary.centeredFacePercent),
      },

      visualQuality: {
        score:
          result.categories.visualQuality,

        faceVisibilityPercent:
          round(summary.faceVisibilityPercent),

        goodFramingPercent:
          round(summary.goodFramingPercent),

        measurementType:
          "visual_usability_proxy",
      },

      presenceStability: {
        score:
          result.categories.presenceStability,

        bodyStabilityScore:
          round(summary.bodyStabilityScore),

        basis:
          "shoulders_only",
      },
    },

    samples: {
      face:
        summary.faceSamples,

      head:
        summary.headSamples,

      pose:
        summary.poseSamples,
    },

    strengths: [
      ...result.strengths,
    ],

    improvements: [
      ...result.improvements,
    ],
  };
}

export function buildPresentationAiPayload(
  result: PresentationScoreResult,
): PresentationAiPayload {
  const summary = result.summary;

  return {
    schemaVersion:
      PRESENTATION_REPORT_VERSION,

    task:
      "analyze_interview_presentation",

    instructionsVersion:
      "1.0",

    overall: {
      score:
        result.overallScore,

      scoreOutOf10:
        result.scoreOutOf10,

      performanceLevel:
        result.performanceLevel,

      reliable:
        result.reliable,
    },

    categories: {
      cameraEngagement: {
        score:
          result.categories.cameraEngagement,

        headCenteredPercent:
          round(summary.headCenteredPercent),

        lookingAwayPercent:
          round(summary.lookingAwayPercent),
      },

      posture: {
        score:
          result.categories.posture,

        goodPosturePercent:
          round(summary.goodPosturePercent),

        bodyCenteredPercent:
          round(summary.bodyCenteredPercent),
      },

      facialExpressiveness: {
        score:
          result.categories.facialExpressiveness,
      },

      headStability: {
        score:
          result.categories.headStability,

        headCenteredPercent:
          round(summary.headCenteredPercent),

        lookingAwayPercent:
          round(summary.lookingAwayPercent),
      },

      framing: {
        score:
          result.categories.framing,

        goodFramingPercent:
          round(summary.goodFramingPercent),

        centeredFacePercent:
          round(summary.centeredFacePercent),
      },

      visualQuality: {
        score:
          result.categories.visualQuality,

        faceVisibilityPercent:
          round(summary.faceVisibilityPercent),

        goodFramingPercent:
          round(summary.goodFramingPercent),

        measurementType:
          "visual_usability_proxy",
      },

      presenceStability: {
        score:
          result.categories.presenceStability,

        bodyStabilityScore:
          round(summary.bodyStabilityScore),
      },
    },

    session: {
      durationSeconds:
        round(summary.durationMs / 1000),

      faceSamples:
        summary.faceSamples,

      headSamples:
        summary.headSamples,

      poseSamples:
        summary.poseSamples,
    },

    existingSignals: {
      strengths: [
        ...result.strengths,
      ],

      improvements: [
        ...result.improvements,
      ],
    },
  };
}

export function presentationReportToJson(
  result: PresentationScoreResult,
): string {
  return JSON.stringify(
    buildPresentationSessionReport(result),
    null,
    2,
  );
}

export function presentationAiPayloadToJson(
  result: PresentationScoreResult,
): string {
  return JSON.stringify(
    buildPresentationAiPayload(result),
    null,
    2,
  );
}

function round(
  value: number,
  decimals = 1,
): number {
  const factor =
    10 ** decimals;

  return (
    Math.round(value * factor) /
    factor
  );
}