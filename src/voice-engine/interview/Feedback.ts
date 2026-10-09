import type { Question } from "./InterviewController";
export type Assessment = { questionId: string; accuracy: number | null; clarity: number | null;
  depth: number | null; assumptions: number | null; strength: string; improvement: string };
export type Feedback = { summary: string; assessments: Assessment[]; overallScore: number | null; scoredAnswers: number; answered: number; label: string };
export function validateFeedback(args: Record<string, unknown>, questions: Question[]): Feedback {
  if (typeof args.summary !== "string" || !args.summary.trim() || args.summary.length > 4000 || !Array.isArray(args.assessments)) throw new Error("Provide summary and assessments.");
  const answered = questions.filter(q => q.status === "answered");
  const expected = new Set(answered.map(q => q.id));
  if (args.assessments.length !== expected.size) throw new Error("Assess each answered question exactly once.");
  const means: number[] = [];
  const assessments = args.assessments.map((value: unknown): Assessment => {
    if (!value || typeof value !== "object") throw new Error("Invalid assessment.");
    const a = value as Record<string, unknown>;
    if (typeof a.questionId !== "string" || !expected.delete(a.questionId)) throw new Error("Unknown or duplicate question in feedback.");
    const scores = [a.accuracy, a.clarity, a.depth, a.assumptions];
    if (!scores.every(n => n === null) && !scores.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10)) throw new Error("Scores must all be null, or all be numbers from 0 to 10.");
    if (![a.strength, a.improvement].every(s => typeof s === "string" && s.trim() && s.length <= 2000)) throw new Error("Provide a strength and improvement.");
    if (scores[0] !== null) means.push((scores as number[]).reduce((sum, n) => sum + n, 0) / 4);
    return a as unknown as Assessment;
  });
  return { summary: args.summary, assessments, answered: answered.length, scoredAnswers: means.length,
    overallScore: means.length ? Math.round(means.reduce((a, b) => a + b, 0) / means.length * 10) / 10 : null,
    label: "Provisional AI coaching assessment of answered questions; not the visual presentation score." };
}