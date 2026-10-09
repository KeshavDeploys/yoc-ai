"use client";
import { useEffect, useRef, useState } from "react";
import { VoiceEngine, type View } from "@/voice-engine/realtime/VoiceEngine";

const buttonStyle = { padding: "12px 18px", borderRadius: 10, border: "1px solid #605378", cursor: "pointer", background: "#292037", color: "#fff" };
const panelStyle = { padding: 20, borderRadius: 14, border: "1px solid #393347", background: "#15121e", marginTop: 20 };
export default function VoiceEngineDebugPage() {
  const engine = useRef<VoiceEngine | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [pushToTalk, setPushToTalk] = useState(false);
  useEffect(() => () => {
    const old = engine.current; engine.current = null; old?.stop();
  }, []);
  const active = !!view && ["connecting", "connected", "reconnecting", "ending"].includes(view.status);
  const connected = view?.status === "connected";
  function start() {
    if (active) return;
    const current = new VoiceEngine(next => { if (engine.current === current) setView(next); });
    engine.current = current;
    current.setMode(pushToTalk);
    void current.start();
  }
  function download() {
    if (!engine.current) return;
    const url = URL.createObjectURL(new Blob([engine.current.export()], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `yocai-voice-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const remaining = view?.remaining ?? 600;
  const latestCandidate = view?.turns.filter(t => t.speaker === "candidate" && t.text).at(-1);
  const latestAI = view?.turns.filter(t => t.speaker === "yocai" && t.text).at(-1);
  return <main style={{ minHeight: "100vh", background: "#09090f", color: "#f4efff", padding: "40px 20px", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 1000, margin: "auto" }}>
      <p style={{ color: "#c4b5fd" }}>YOC.ai / VOICE ENGINE</p>
      <h1 style={{ fontSize: 32, margin: "12px 0" }}>Your technical interview</h1>
      <p style={{ color: "#bcb5c9", lineHeight: 1.7 }}>Use headphones. Start, allow the microphone, and introduce your role, experience and technologies.
        You can ask to skip, repeat, shorten, pause, or end the interview.</p>
      <div style={panelStyle}>
        <p role="status">Status: <strong>{view?.status.toUpperCase() ?? "IDLE"}</strong> · {view?.model || "Not connected"}</p>
        <p>Time remaining: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} ·
          Question slots: {view?.interview.total ?? 5} · Answered: {view?.interview.questions.filter(q => q.status === "answered").length ?? 0}</p>
        {view?.preparation === "loading" && <p role="status" style={{ color: "#c4b5fd" }}>
          Preparing your questions · {view.preparationSeconds}s. You can still speak, change the plan, or end the interview.
        </p>}
        {view?.preparation === "error" && <p role="alert">Question preparation failed. Say “retry preparing my questions” or end the interview.</p>}
        {view?.recoveryNotice && <p role="status">{view.recoveryNotice}</p>}
        {view?.interview.paused && <p role="status">Take your time. Say “we can continue” when ready. The timer continues.</p>}
        {!!view?.interview.deferred.length && <p>Saved requests: {view.interview.deferred.join(", ")}. These will apply when questions are ready.</p>}
        <p>Microphone: {connected && !view?.muted ? "Listening locally" : "Not streaming"} ·
          {view?.candidateSpeaking ? " Sending speech" : " Speech gate closed"} · {view?.aiSpeaking ? "AI speaking" : "AI quiet"}</p>
        <label>Speech probability <progress max={1} value={view?.speechProbability ?? 0} style={{ marginLeft: 12 }} /></label>
        <p style={{ color: "#bcb5c9", fontSize: 13 }}>This measures speech likelihood, not speaker identity or transcription confidence.</p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
        <button style={buttonStyle} disabled={active} onClick={start}>Start interview</button>
        <button style={buttonStyle} disabled={!connected} onClick={() => engine.current?.mute(!view?.muted)}>{view?.muted ? "Unmute" : "Mute"}</button>
        <button style={buttonStyle} disabled={!connected} onClick={() => engine.current?.finishInterview()}>Finish + feedback</button>
        <button style={buttonStyle} disabled={!active} onClick={() => engine.current?.stop("Stopped by candidate.")}>Disconnect now</button>
        <button style={buttonStyle} disabled={!view} onClick={download}>Export transcript</button>
      </div>
      <div style={panelStyle}>
        <label><input type="checkbox" checked={pushToTalk} onChange={event => {
          setPushToTalk(event.target.checked); engine.current?.setMode(event.target.checked);
        }} /> Hold-to-talk mode (use when background speech is present)</label>
        {pushToTalk && <button style={{ ...buttonStyle, marginLeft: 14, touchAction: "none" }} disabled={!connected || view?.muted}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); engine.current?.hold(true); }}
          onPointerUp={() => engine.current?.hold(false)} onPointerCancel={() => engine.current?.hold(false)}
          onLostPointerCapture={() => engine.current?.hold(false)} onBlur={() => engine.current?.hold(false)}
          onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); engine.current?.hold(true); } }}
          onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); engine.current?.hold(false); } }}>
          Hold to speak / interrupt
        </button>}
      </div>
      <div style={panelStyle}><p style={{ color: "#86efac" }}>Your current caption</p>
        <p aria-live="polite" style={{ fontSize: 20, lineHeight: 1.6 }}>{latestCandidate?.text || "Your speech will appear here."}</p></div>
      <div style={panelStyle}><p style={{ color: "#c4b5fd" }}>YOCAI current caption {latestAI?.status === "interrupted" ? "· interrupted" : ""}</p>
        <p aria-live="polite" style={{ fontSize: 20, lineHeight: 1.6 }}>{latestAI?.text || "The interviewer will speak here."}</p></div>
      <details style={panelStyle}><summary>Question state</summary>
        <p>{view?.interview.paused ? "Paused — timer continues." : ""}</p>
        <ol>{view?.interview.questions.slice(0, view.interview.total).map(q => <li key={q.id} style={{ marginTop: 10 }}>
          <strong>{q.status}</strong> — {q.text}
        </li>)}</ol>
      </details>
      <details style={panelStyle}><summary>Full transcript (original recognition text)</summary>
        {view?.turns.filter(t => t.text).map(t => <div key={t.id} style={{ borderBottom: "1px solid #393347", padding: "12px 0" }}>
          <strong>{t.speaker === "candidate" ? "You" : "YOCAI"}</strong> · {t.status} · {t.id}
          <p style={{ whiteSpace: "pre-wrap" }}>{t.text}</p>
        </div>)}
      </details>
      {view?.feedback && <section style={panelStyle}>
        <h2 style={{ fontSize: 24 }}>Interview feedback</h2>
        <p style={{ fontSize: 20 }}>{view.feedback.overallScore === null ? "Not enough evidence to assign a score." : `Score: ${view.feedback.overallScore} / 10`}</p>
        <p>{view.feedback.summary}</p>
        <p style={{ color: "#bcb5c9", fontSize: 13 }}>{view.feedback.label} Scored answers: {view.feedback.scoredAnswers} of {view.feedback.answered} answered.</p>
        {view.feedback.assessments.map(a => <div key={a.questionId} style={{ marginTop: 16 }}>
          <strong>{a.questionId.toUpperCase()}</strong>
          <p>Accuracy: {a.accuracy ?? "N/A"} · Clarity: {a.clarity ?? "N/A"} · Depth: {a.depth ?? "N/A"} · Assumptions: {a.assumptions ?? "N/A"}</p>
          <p>Strength: {a.strength}</p><p>Improve: {a.improvement}</p>
        </div>)}
      </section>}
      <pre role="log" style={{ ...panelStyle, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 300, overflowY: "auto", lineHeight: 1.7 }}>
        {view?.logs.join("\n") || "Ready. No microphone audio is sent before the connection is ready."}
      </pre>
    </section>
  </main>;
}