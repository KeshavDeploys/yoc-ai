import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { isPresentationAiResponse, type PresentationAiPayload } from "../../../../presentation-engine/reporting/SessionReportSerializer";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

const SYSTEM_INSTRUCTION = `You are the AI presentation coach for YOC.ai.

Analyze the supplied presentation-analysis JSON. The supplied numerical scores and measurements are authoritative.

DO NOT recalculate, change, validate, override, or invent scores. Do not claim to have seen video. Do not infer medical, psychological, or personality conditions. Do not discuss blink count/rate, hips, or unsupported metrics. Do not recommend exaggerated facial expressions.

DO explain what the supplied scores mean, identify evidence-based strengths and improvements, choose one highest-priority category, and provide practical interview coaching. Treat visualQuality as a visual-usability proxy only. Return ONLY valid JSON matching the requested response structure.`;

function isPresentationAiPayload(value: unknown): value is PresentationAiPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.schemaVersion === "1.1.0" &&
    v.task === "analyze_interview_presentation" &&
    v.instructionsVersion === "1.0" &&
    typeof v.overall === "object" && v.overall !== null &&
    typeof v.categories === "object" && v.categories !== null &&
    typeof v.session === "object" && v.session !== null &&
    typeof v.existingSignals === "object" && v.existingSignals !== null;
}

function buildPrompt(payload: PresentationAiPayload): string {
  return `Analyze this YOC.ai presentation session.

Treat every supplied score and metric as authoritative. Do not recalculate or modify them.

Return ONLY this JSON shape:
{
  "schemaVersion": "1.0",
  "summary": "string",
  "strengths": ["string"],
  "improvements": ["string"],
  "priority": "camera_engagement | posture | facial_expressiveness | head_stability | framing | visual_quality | presence_stability | none",
  "coaching": ["string"]
}

Use 2-4 strengths, 1-4 improvements, exactly one priority, and 2-4 practical coaching actions. Never invent unsupported observations. If facial expressiveness is low, describe limited facial movement/variation and recommend natural variation, not forced smiling. If framing is weak, recommend camera positioning/framing. If camera engagement is weak, discuss looking away/head orientation only when supported.

SOURCE JSON:
${JSON.stringify(payload, null, 2)}`;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 500 });
    }

    const body: unknown = await request.json();
    if (!isPresentationAiPayload(body)) {
      return NextResponse.json({ error: "Invalid PresentationAiPayload." }, { status: 400 });
    }

    if (!body.overall.reliable) {
      return NextResponse.json({ error: "Presentation session is not reliable enough for AI analysis." }, { status: 422 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(body),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            schemaVersion: { type: "string", enum: ["1.0"] },
            summary: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            priority: { type: "string", enum: ["camera_engagement", "posture", "facial_expressiveness", "head_stability", "framing", "visual_quality", "presence_stability", "none"] },
            coaching: { type: "array", items: { type: "string" } },
          },
          required: ["schemaVersion", "summary", "strengths", "improvements", "priority", "coaching"],
        },
      },
    });

    const text = response.text?.trim();
    if (!text) return NextResponse.json({ error: "Gemini returned an empty response." }, { status: 502 });

    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { return NextResponse.json({ error: "Gemini returned invalid JSON." }, { status: 502 }); }

    if (!isPresentationAiResponse(parsed)) {
      return NextResponse.json({ error: "Gemini response failed YOC.ai schema validation." }, { status: 502 });
    }

    return NextResponse.json({ success: true, model: GEMINI_MODEL, analysis: parsed });
  } catch (error) {
    console.error("Presentation AI analysis failed:", error);
    return NextResponse.json({ error: "Presentation AI analysis failed." }, { status: 500 });
  }
}