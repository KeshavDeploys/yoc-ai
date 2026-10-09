/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness mocks module boundaries. */
/* eslint-disable @typescript-eslint/no-this-alias -- Tests retain fake audio instances. */
// Deterministic tests: no API calls, browser, microphone, or credentials required.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { InterviewController } = require("../src/voice-engine/interview/InterviewController.ts");
const { SpeechGate } = require("../src/voice-engine/audio/SpeechGate.ts");
const { validateFeedback } = require("../src/voice-engine/interview/Feedback.ts");
let passed = 0;
function test(name, run) { run(); console.log(`PASS ${name}`); passed++; }
const profile = { role: "Engineer", experience: "3 years", technologies: "AWS" };
const questions = ["First?", "Second?", "Third?", "Fourth?", "Fifth?"];
function prepared() { const c = new InterviewController(); c.prepare(profile, questions); return c; }
test("Five answers finish exactly five slots", () => {
  const c = prepared();
  for (let i = 1; i <= 5; i++) c.change({ action: "answer", questionId: `q${i}`, answer: "A substantive answer" });
  assert.equal(c.ending, true); assert.equal(c.questions.filter(q => q.status === "answered").length, 5);
  assert.throws(() => c.change({ action: "skip", questionId: "q5" }));
});
test("Silence and duplicate/stale advancement are rejected", () => {
  const c = prepared(); assert.throws(() => c.change({ action: "answer", questionId: "q1", answer: " " }));
  c.change({ action: "skip", questionId: "q1" });
  assert.throws(() => c.change({ action: "answer", questionId: "q1", answer: "old" }));
  assert.equal(c.current.id, "q2");
});
test("Only two total, repeat, clarification and pause semantics", () => {
  const c = prepared(); c.change({ action: "resize", total: 2 });
  c.change({ action: "repeat", questionId: "q1" }); c.change({ action: "clarify", questionId: "q1" });
  c.change({ action: "pause" }); assert.throws(() => c.change({ action: "answer", questionId: "q1", answer: "test" }));
  c.change({ action: "resume" }); c.change({ action: "skip", questionId: "q1" });
  c.change({ action: "answer", questionId: "q2", answer: "answer" }); assert.equal(c.ending, true);
});
test("Additional questions extend the bank; last waits for the added questions", () => {
  const c = prepared(); c.change({ action: "answer", questionId: "q1", answer: "answer" });
  c.change({ action: "add", additional: 2 }); assert.equal(c.total, 7);
  c.change({ action: "last", questionId: "q2" }); assert.equal(c.current, null);
  c.append(["Sixth?", "Seventh?"]); assert.equal(c.current.id, "q7");
  assert.equal(c.questions[5].status, "skipped"); assert.equal(c.questions[6].status, "pending");
});
test("Resize before profile and early end remain valid", () => {
  const c = new InterviewController(); c.change({ action: "resize", total: 2 });
  c.prepare(profile, questions); assert.equal(c.total, 2);
  c.change({ action: "end" }); assert.equal(c.questions[0].status, "pending");
});
test("Invalid totals and ambiguous resize have no state changes", () => {
  const c = prepared();
  for (const total of [0, -1, 13, 1.2, "2", NaN]) assert.throws(() => c.change({ action: "resize", total }));
  assert.throws(() => c.change({ action: "resize", total: 2, additional: 2 })); assert.equal(c.total, 5);
});
test("Last before profile is remembered, with intervening questions skipped", () => {
  const c = new InterviewController(); c.change({ action: "last" });
  assert.deepEqual(c.deferred, ["last"]); assert.equal(c.current, null);
  c.prepare(profile, questions); assert.equal(c.current.id, "q5");
  assert.equal(c.questions.filter(q => q.status === "skipped").length, 4);
});
test("Deferred last resolves against a later reduced total", () => {
  const c = new InterviewController(); c.change({ action: "last" }); c.change({ action: "resize", total: 2 });
  c.prepare(profile, questions); assert.equal(c.current.id, "q2"); assert.equal(c.total, 2);
});
test("Compound skip plus resize commits together, independent of supplied order", () => {
  const c = prepared(); c.changeBatch([{ action: "skip", questionId: "q1" }, { action: "resize", total: 2 }]);
  assert.equal(c.total, 2); assert.equal(c.current.id, "q2"); assert.equal(c.questions[0].status, "skipped");
});
test("Invalid compound command rolls back every change", () => {
  const c = prepared(); const before = c.snapshot();
  assert.throws(() => c.changeBatch([{ action: "resize", total: 2 }, { action: "skip", questionId: "q9" }]));
  assert.deepEqual(c.snapshot(), before);
  assert.throws(() => c.changeBatch([{ action: "resize", total: 2 }, { action: "answer", questionId: "q1", answer: "" }]));
  assert.deepEqual(c.snapshot(), before);
});
test("Wait remains paused when preparation completes; explicit resume preserves current", () => {
  const c = new InterviewController(); c.change({ action: "pause" }); c.prepare(profile, questions);
  assert.equal(c.paused, true); assert.equal(c.index, 0);
  c.change({ action: "resume" }); assert.equal(c.current.id, "q1");
});
test("Not enough time rejects extra questions without modifying total", () => {
  const c = prepared(); assert.throws(() => c.change({ action: "add", additional: 2 }, 90)); assert.equal(c.total, 5);
});
test("End before profile overrides queued navigation, even in compound request", () => {
  const c = new InterviewController(); c.change({ action: "last" });
  c.changeBatch([{ action: "resize", total: 2 }, { action: "end" }]);
  assert.equal(c.ending, true); assert.deepEqual(c.deferred, []); assert.equal(c.current, null);
});
test("Two total includes previously answered questions", () => {
  const c = prepared(); c.change({ action: "answer", questionId: "q1", answer: "one" });
  c.change({ action: "answer", questionId: "q2", answer: "two" }); c.change({ action: "resize", total: 2 });
  assert.equal(c.ending, true); assert.equal(c.questions.filter(q => q.status === "answered").length, 2);
});
test("Feedback excludes skipped questions, rejects bad scores, computes exact mean", () => {
  const c = prepared(); c.change({ action: "answer", questionId: "q1", answer: "IAM policies" });
  c.change({ action: "skip", questionId: "q2" });
  const a = { questionId: "q1", accuracy: 8, clarity: 6, depth: 8, assumptions: 6, strength: "Correct scope", improvement: "Discuss edge cases" };
  assert.equal(validateFeedback({ summary: "Summary", assessments: [a] }, c.questions).overallScore, 7);
  assert.throws(() => validateFeedback({ summary: "Summary", assessments: [{ ...a, accuracy: 11 }] }, c.questions));
  assert.throws(() => validateFeedback({ summary: "Summary", assessments: [{ ...a, questionId: "q2" }] }, c.questions));
  assert.equal(validateFeedback({ summary: "Insufficient evidence", assessments: [] }, []).overallScore, null);
});
test("Noise and brief spikes send zero audio; confirmed speech retains buffered onset", () => {
  let starts = 0, frames = 0, ends = 0;
  const gate = new SpeechGate({ start: () => starts++, audio: () => frames++, end: () => ends++ });
  const frame = new Float32Array(512);
  for (let i = 0; i < 100; i++) gate.frame(frame, i === 50 ? 0.99 : 0.1, false, true, false, false);
  assert.equal(starts, 0); assert.equal(frames, 0);
  for (let i = 0; i < 8; i++) gate.frame(frame, 0.95, false, true, false, false);
  assert.equal(starts, 1); assert.ok(frames >= 8);
  for (let i = 0; i < 38; i++) gate.frame(frame, 0.1, false, true, false, false);
  assert.equal(ends, 1); assert.equal(gate.active, false);
});
test("Interruptions require stronger evidence; mute and hold-to-talk gates work", () => {
  let starts = 0, ends = 0;
  const gate = new SpeechGate({ start: () => starts++, audio: () => {}, end: () => ends++ });
  const frame = new Float32Array(512);
  for (let i = 0; i < 30; i++) gate.frame(frame, 0.85, true, true, false, false);
  assert.equal(starts, 0);
  for (let i = 0; i < 12; i++) gate.frame(frame, 0.99, true, true, false, false);
  assert.equal(starts, 1); gate.frame(frame, 1, false, false, false, false); assert.equal(ends, 1);
  gate.frame(frame, 1, false, true, false, true); assert.equal(starts, 1);
  gate.frame(frame, 0, false, true, true, true); assert.equal(starts, 2);
  gate.frame(frame, 0, false, true, false, true); assert.equal(ends, 2);
});

test("Reopen only the previous answer, retain evidence, pause until resume", () => {
  const c = prepared(); c.change({ action: "answer", questionId: "q1", answer: "Original evidence" });
  assert.throws(() => c.change({ action: "reopen", questionId: "q5" }));
  assert.equal(c.current.id, "q2");
  c.change({ action: "reopen", questionId: "q1" });
  assert.equal(c.current.id, "q1"); assert.equal(c.paused, true);
  assert.equal(c.questions[0].answer, "Original evidence");
  assert.throws(() => c.change({ action: "answer", questionId: "q1", answer: "Too early" }));
  c.changeBatch([{ action: "resume" }, { action: "answer", questionId: "q1", answer: "Original plus continuation" }]);
  assert.equal(c.current.id, "q2"); assert.equal(c.questions.filter(q => q.status === "answered").length, 1);
});

// Fake only browser/audio/transport boundaries; execute the real engine and controller.
const sdk = require("@google/genai");
let transport, player, mic, sessions = [];
class FakePlayer {
  playing = false;
  constructor(changed) { this.changed = changed; player = this; }
  async initialize() {} play() { this.playing = true; this.changed(); }
  stop() { this.playing = false; this.changed(); } async dispose() { this.stop(); }
}
class FakeMic {
  constructor(events) { this.events = events; mic = this; }
  async initialize() {} enable(v) { this.enabled = v; } setMode() {} hold() {}
  async dispose() { this.enabled = false; }
}
class FakeAI {
  live = { connect: async ({ callbacks }) => {
    transport = callbacks;
    const session = { input: [], tools: [], content: [], closed: false,
      sendRealtimeInput(v) { this.input.push(v); }, sendToolResponse(v) { this.tools.push(v); },
      sendClientContent(v) { this.content.push(v); }, close() { this.closed = true; } };
    sessions.push(session); queueMicrotask(() => callbacks.onmessage({ setupComplete: {} })); return session;
  } };
}
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === "@google/genai") return { ...sdk, GoogleGenAI: FakeAI };
  if (name.endsWith("/SpeechMicrophone")) return { SpeechMicrophone: FakeMic };
  if (name.endsWith("/VoicePlayer")) return { VoicePlayer: FakePlayer };
  return originalLoad.call(this, name, ...args);
};
global.fetch = async url => ({ ok: true, json: async () => url.endsWith("questions") ? { questions } : { token: "TEST_SECRET", model: "test-model" } });
const { VoiceEngine } = require("../src/voice-engine/realtime/VoiceEngine.ts");
async function main() {
  let view;
  const e = new VoiceEngine(v => { view = v; }); await e.start();
  assert.equal(view.status, "connected");
  await e.tool({ id: "prepare", name: "prepare_interview", args: profile });
  await new Promise(resolve => setImmediate(resolve));
  mic.events.start(); transport.onmessage({ serverContent: { inputTranscription: { text: "Repeat that please." } } }); mic.events.end();
  await e.tool({ id: "repeat1", name: "control_interview", args: { action: "repeat", questionId: "q1" } });
  mic.events.start(); transport.onmessage({ serverContent: { inputTranscription: { text: "My answer about IAM." } } }); mic.events.end();
  await e.tool({ id: "answer1", name: "control_interview", args: { action: "answer", questionId: "q1" } });
  await e.tool({ id: "answer1", name: "control_interview", args: { action: "answer", questionId: "q1" } });
  assert.equal(view.interview.index, 1);
  assert.equal(view.interview.questions[0].answer, "My answer about IAM.");
  transport.onmessage({ serverContent: { inputTranscription: { text: " More detail." } } });
  assert.equal(view.interview.questions[0].answer, "My answer about IAM. More detail.");
  console.log("PASS engine attaches original answer and deduplicates tool replay"); passed++;
  transport.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: "TEST_HANDLE" } });
  await e.resume("test renewal"); assert.equal(view.status, "connected"); assert.equal(view.interview.index, 1);
  assert.equal(sessions.length, 2); assert.equal(sessions[1].content.length, 0);
  console.log("PASS renewal preserves state without replaying greeting or input"); passed++;
  await e.tool({ id: "finish", name: "control_interview", args: { action: "end" } });
  transport.onmessage({ serverContent: { turnComplete: true } }); assert.equal(view.status, "ending");
  await e.tool({ id: "feedback", name: "save_feedback", args: { summary: "Good foundation", assessments: [
    { questionId: "q1", accuracy: 8, clarity: 6, depth: 8, assumptions: 6, strength: "Explained IAM", improvement: "Expand edge cases" },
  ] } });
  assert.equal(view.feedback.overallScore, 7);
  transport.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "AA==", mimeType: "audio/pcm;rate=24000" } }] }, outputTranscription: { text: "Goodbye." }, turnComplete: true } });
  assert.equal(view.status, "ending"); assert.equal(mic.enabled, false);
  player.stop(); assert.equal(view.status, "ended"); assert.equal(sessions[1].closed, true);
  assert.equal(e.export().includes("TEST_SECRET"), false); assert.equal(e.export().includes("TEST_HANDLE"), false);
  console.log("PASS goodbye drains before disconnect; export excludes credentials and resume handle"); passed++;
  const timed = new VoiceEngine(v => { view = v; }); await timed.start();
  timed.startedAt = Date.now() - 570000; timed.tick(); assert.equal(view.status, "ending");
  timed.startedAt = Date.now() - 600000; timed.tick(); assert.equal(view.status, "ended");
  console.log("PASS ten-minute hard stop reserves closing time"); passed++;
  const cancel = new VoiceEngine(v => { view = v; }); await cancel.start();
  transport.onmessage({ toolCallCancellation: { ids: ["cancelled"] } });
  await cancel.tool({ id: "cancelled", name: "control_interview", args: { action: "end" } });
  assert.equal(view.status, "connected"); cancel.stop();
  console.log("PASS cancelled tool cannot end the interview"); passed++;
  const immediateFetch = global.fetch;
  let releaseQuestions;
  global.fetch = async (url, options) => url.endsWith("questions") ? new Promise(resolve => { releaseQuestions = () => resolve({ ok: true, json: async () => ({ questions }) }); }) : immediateFetch(url, options);
  const background = new VoiceEngine(v => { view = v; }); await background.start();
  await background.tool({ id: "saved-last", name: "control_interview", args: { changes: [{ action: "last" }] } });
  await background.tool({ id: "prepare-background", name: "prepare_interview", args: profile });
  assert.equal(view.preparation, "loading"); assert.deepEqual(view.interview.deferred, ["last"]);
  await background.tool({ id: "wait-background", name: "control_interview", args: { changes: [{ action: "pause" }] } });
  releaseQuestions(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.interview.current.id, "q5"); assert.equal(view.interview.paused, true);
  background.lastActivityAt = 0; const countBefore = sessions.at(-1).content.length; background.announceQuestions();
  assert.equal(sessions.at(-1).content.length, countBefore);
  await background.tool({ id: "resume-background", name: "control_interview", args: { changes: [{ action: "resume" }] } });
  background.lastActivityAt = 0; background.announceQuestions();
  assert.equal(sessions.at(-1).content.length, countBefore); // no duplicate question after resume tool
  background.stop();
  console.log("PASS background preparation allows pause; deferred last survives; no readiness speech while paused or duplicate on resume"); passed++;
  const endingJob = new VoiceEngine(v => { view = v; }); await endingJob.start();
  await endingJob.tool({ id: "prepare-ending", name: "prepare_interview", args: profile });
  assert.equal(view.preparation, "loading");
  await endingJob.tool({ id: "end-pending", name: "control_interview", args: { changes: [{ action: "end" }], immediate: true } });
  assert.equal(view.status, "ended"); releaseQuestions(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.interview.questions.length, 0); assert.equal(view.status, "ended");
  console.log("PASS end executes during pending generation; late question result cannot restart interview"); passed++;
  global.fetch = immediateFetch;
  const hold = new VoiceEngine(v => { view = v; }); await hold.start();
  await hold.tool({ id: "hold-prepare", name: "prepare_interview", args: profile });
  await new Promise(resolve => setImmediate(resolve));
  const say = text => { mic.events.start(); transport.onmessage({ serverContent: { inputTranscription: { text } } }); mic.events.end(); };
  say("IAM limits access.");
  await hold.tool({ id: "hold-answer", name: "control_interview", args: { changes: [{ action: "answer", questionId: "q1" }] } });
  say("First let me finish. Audit logs also matter.");
  await hold.tool({ id: "hold-reopen", name: "control_interview", args: { changes: [{ action: "reopen", questionId: "q1" }], includesAnswer: true } });
  assert.equal(view.interview.current.id, "q1"); assert.equal(view.interview.paused, true);
  hold.responseDueAt = Date.now() - 30000; hold.lastActivityAt = 0;
  const beforeHold = sessions.at(-1).content.length; hold.recoverQuietTurn();
  assert.equal(sessions.at(-1).content.length, beforeHold);
  say("Okay sure we can continue.");
  await hold.tool({ id: "hold-resume", name: "control_interview", args: { changes: [{ action: "resume" }, { action: "answer", questionId: "q1" }] } });
  assert.equal(view.interview.current.id, "q2");
  assert.match(view.interview.questions[0].answer, /Audit logs/);
  assert.doesNotMatch(view.interview.questions[0].answer, /we can continue/);
  assert.equal(view.interview.questions.filter(q => q.status === "answered").length, 1);
  console.log("PASS interrupted previous answer keeps continuation; continue acknowledgement is not evidence; paused silence stays quiet"); passed++;
  say("An answer the connection did not respond to.");
  hold.responseDueAt = Date.now() - 11000; hold.lastActivityAt = 0;
  const beforeRecovery = sessions.at(-1).content.length;
  hold.recoverQuietTurn(); hold.recoverQuietTurn();
  assert.equal(sessions.at(-1).content.length, beforeRecovery + 1);
  assert.equal(hold.controller.current.id, "q2");
  hold.responseDueAt = Date.now() - 21000; hold.recoverQuietTurn(); hold.emit();
  assert.match(view.recoveryNotice, /not replied/); assert.equal(view.interview.index, 1);
  hold.stop();
  console.log("PASS stalled response gets one recovery request then visible fallback without advancing"); passed++;
  console.log(`${passed} voice checks passed. Real microphone/API acceptance still required.`);
}
main().catch(error => { console.error(error); process.exit(1); }).finally(() => { Module._load = originalLoad; });