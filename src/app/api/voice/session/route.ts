import { GoogleGenAI } from "@google/genai";
import { liveConfig, INTERVIEW_SECONDS } from "@/voice-engine/config";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  // Keep the existing dev-only boundary until authentication/rate limits are added.
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Public voice access is not configured yet." }, { status: 403, headers });
  try {
    const body = await request.json().catch(() => ({}));
    const handle = typeof body.handle === "string" ? body.handle : undefined;
    if (handle && handle.length > 20000) return Response.json({ error: "Invalid resume handle." }, { status: 400, headers });
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_LIVE_MODEL;
    if (!apiKey || !model) return Response.json({ error: "Set GEMINI_API_KEY and GEMINI_LIVE_MODEL, then restart." }, { status: 500, headers });
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta", timeout: 20000 } });
    const token = await ai.authTokens.create({ config: {
      uses: 1, expireTime: new Date(Date.now() + 15 * 60000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60000).toISOString(),
      liveConnectConstraints: { model, config: liveConfig(handle) },
    } });
    if (!token.name) throw new Error("Missing token");
    return Response.json({ token: token.name, model, interviewDurationSeconds: INTERVIEW_SECONDS }, { headers });
  } catch {
    return Response.json({ error: "Could not create voice session. Check model access, quota, and server configuration." }, { status: 502, headers });
  }
}