import { GoogleGenAI, type Session, type LiveServerMessage, type FunctionCall } from "@google/genai";
import { liveConfig, INTERVIEW_SECONDS } from "../config";
import { InterviewController, type Change, type Profile } from "../interview/InterviewController";
import { SpeechMicrophone } from "../audio/SpeechMicrophone";
import { VoicePlayer } from "../audio/VoicePlayer";
import { validateFeedback, type Feedback } from "../interview/Feedback";

export type Turn = { id: string; speaker: "candidate" | "yocai"; text: string; at: number;
  questionId: string | null; controlOnly?: boolean; status: "partial" | "complete" | "interrupted" };
export type View = {
  status: "idle" | "connecting" | "connected" | "reconnecting" | "ending" | "ended" | "error";
  model: string; remaining: number; muted: boolean; pushToTalk: boolean;
  speechProbability: number; candidateSpeaking: boolean; aiSpeaking: boolean;
  interview: ReturnType<InterviewController["snapshot"]>; turns: Turn[]; logs: string[];
  feedback: Feedback | null; preparation: "idle" | "loading" | "ready" | "error"; preparationSeconds: number; recoveryNotice: string | null;
};
export class VoiceEngine {
  private controller = new InterviewController();
  private session: Session | null = null;
  private abort = new AbortController();
  private player: VoicePlayer;
  private microphone: SpeechMicrophone;
  private stopped = false;
  private started = false;
  private epoch = 0;
  private handle: string | undefined;
  private reconnecting = false;
  private reconnectCount = 0;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private endingAt = 0;
  private finalTurnDone = false;
  private finalAudioSeen = false;
  private inputTurn: Turn | null = null;
  private outputTurn: Turn | null = null;
  private sequence = 0;
  private generating = false;
  private toolsBusy = 0;
  private serial: Promise<void> = Promise.resolve();
  private questionJob: AbortController | null = null;
  private jobVersion = 0;
  private preparationAt = 0;
  private notifyQuestions = false;
  private lastActivityAt = 0;
  private responseDueAt = 0;
  private recoverySent = false;
  private mutationKeys = new Set<string>();
  private cancelledCalls = new Set<string>();
  private results = new Map<string, Record<string, unknown>>();
  private raw: { at: number; event: string; data: unknown }[] = [];
  private lastMeter = 0;
  private renewalDue = 0;
  private cancelSetup: (() => void) | null = null;
  private state: View = { status: "idle", model: "", remaining: INTERVIEW_SECONDS, muted: false,
    pushToTalk: false, speechProbability: 0, candidateSpeaking: false, aiSpeaking: false,
    interview: this.controller.snapshot(), turns: [], logs: [], feedback: null, preparation: "idle", preparationSeconds: 0, recoveryNotice: null };

  constructor(private changed: (view: View) => void) {
    this.player = new VoicePlayer(() => {
      this.state.aiSpeaking = this.player.playing;
      this.emit(); this.maybeFinish();
    });
    this.microphone = new SpeechMicrophone({
      aiSpeaking: () => this.player.playing,
      meter: probability => {
        if (Date.now() - this.lastMeter < 200) return;
        this.lastMeter = Date.now(); this.state.speechProbability = probability; this.emit();
      },
      start: () => this.speechStart(),
      audio: data => {
        if (this.session && this.state.candidateSpeaking && !this.stopped) {
          this.session.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
        }
      },
      end: () => this.speechEnd(), error: error => this.fail(error.message),
    });
  }
  private emit() {
    this.state.interview = this.controller.snapshot();
    this.changed(structuredClone(this.state));
  }
  private log(text: string) {
    this.state.logs = [...this.state.logs.slice(-79), `${new Date().toLocaleTimeString()} — ${text}`]; this.emit();
  }
  private record(event: string, data: unknown) { this.raw.push({ at: Date.now(), event, data: structuredClone(data) }); }
  private turn(speaker: Turn["speaker"]) {
    const turn: Turn = { id: `t${++this.sequence}`, speaker, text: "", at: Date.now(),
      questionId: this.controller.current?.id ?? null, status: "partial" };
    this.state.turns.push(turn); return turn;
  }
  private speechStart() {
    if (!this.session || this.stopped || this.state.status !== "connected" || this.state.muted) return;
    this.lastActivityAt = Date.now();
    this.responseDueAt = 0; this.recoverySent = false; this.state.recoveryNotice = null;
    this.record("speechStart", {});
    this.inputTurn = this.turn("candidate");
    this.state.candidateSpeaking = true;
    if (this.generating || this.player.playing) {
      const interrupted = this.outputTurn ?? this.state.turns.filter(t => t.speaker === "yocai").at(-1);
      if (interrupted) interrupted.status = "interrupted";
      this.player.stop();
      this.log("Confirmed speech: interrupted AI playback.");
    }
    this.session.sendRealtimeInput({ activityStart: {} });
    this.emit();
  }
  private speechEnd() {
    if (!this.state.candidateSpeaking) return;
    this.state.candidateSpeaking = false;
    this.lastActivityAt = Date.now();
    this.responseDueAt = Date.now();
    this.record("speechEnd", {});
    if (this.inputTurn) this.inputTurn.status = "complete";
    if (!this.stopped) this.session?.sendRealtimeInput({ activityEnd: {} });
    this.emit();
  }
  async start() {
    if (this.started) return;
    this.started = true; this.state.status = "connecting"; this.emit();
    try {
      this.log("Loading speech detector. Allow microphone access.");
      await Promise.all([this.player.initialize(), this.microphone.initialize()]);
      if (this.stopped) return;
      // Begin the interview clock once connected, not while granting permission.
      await this.open();
      if (this.stopped) return;
      this.startedAt = Date.now();
      this.timer = setInterval(() => this.tick(), 250);
      this.state.status = "connected"; this.microphone.enable(true); this.emit();
      this.session!.sendClientContent({ turns: [{ role: "user", parts: [{ text:
        "Begin a new interview. Introduce yourself as YOCAI, explain five questions, and ask for my role, experience and technologies. Collect missing details conversationally." }] }], turnComplete: true });
    } catch (error) { this.fail(error instanceof Error ? error.message : "Could not start interview."); }
  }
  private async open(handle?: string) {
    const epoch = ++this.epoch;
    const timeout = AbortSignal.timeout(30000);
    const response = await fetch("/api/voice/session", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle }), signal: AbortSignal.any([timeout, this.abort.signal]) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Token request failed.");
    if (this.stopped || epoch !== this.epoch) return;
    if (typeof data.token !== "string" || typeof data.model !== "string") throw new Error("Invalid token response.");
    this.state.model = data.model;
    const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1beta" } });
    let setup = false;
    let connected: Session | null = null;
    await new Promise<void>((resolve, reject) => {
      const clearSetup = () => { clearTimeout(watchdog); this.cancelSetup = null; };
      const rejectSetup = (error: Error) => { clearSetup(); reject(error); };
      const watchdog = setTimeout(() => rejectSetup(new Error("Live setup timed out.")), 30000);
      this.cancelSetup = () => rejectSetup(new Error("Connection cancelled."));
      const finish = () => { if (setup && connected) { clearSetup(); resolve(); } };
      void ai.live.connect({ model: data.model, config: liveConfig(handle), callbacks: {
        onopen: () => {},
        onmessage: message => {
          if (this.stopped || epoch !== this.epoch) return;
          if (message.setupComplete) { setup = true; finish(); }
          try { this.message(message); } catch (error) { this.fail(error instanceof Error ? error.message : "Response processing failed."); }
        },
        onerror: event => {
          if (this.stopped || epoch !== this.epoch) return;
          if (!setup) rejectSetup(new Error(event.message || "Live connection error."));
          else this.fail(event.message || "Live connection error.");
        },
        onclose: event => {
          if (this.stopped || epoch !== this.epoch) return;
          if (!setup) rejectSetup(new Error(`Live setup closed (${event.code}). ${event.reason}`));
          else void this.resume(`Connection closed (${event.code}).`);
        },
      } }).then(session => {
        if (this.stopped || epoch !== this.epoch) { session.close(); clearSetup(); resolve(); return; }
        connected = session; this.session = session; finish();
      }).catch(rejectSetup);
    });
  }
  private message(message: LiveServerMessage) {
    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
      this.handle = message.sessionResumptionUpdate.newHandle;
    }
    if (message.toolCallCancellation) {
      for (const id of message.toolCallCancellation.ids ?? []) this.cancelledCalls.add(id);
    }
    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls ?? []) {
        this.toolsBusy++;
        this.serial = this.serial.then(() => this.tool(call)).catch(error => {
          this.fail(error instanceof Error ? error.message : "Interview action failed.");
        }).finally(() => { this.toolsBusy--; });
      }
    }
    const content = message.serverContent;
    if (content) this.lastActivityAt = Date.now();
    if (content?.interrupted) {
      if (this.outputTurn) this.outputTurn.status = "interrupted";
      this.outputTurn = null; this.generating = false; this.player.stop();
      this.record("interrupted", {});
    }
    const input = content?.inputTranscription?.text;
    if (input) {
      // Preserve received text verbatim; input/output streams have independent timing.
      this.record("inputTranscription", input);
      if (!this.inputTurn) this.inputTurn = this.turn("candidate");
      this.inputTurn.text += input;
      // A transcript fragment can arrive after the answer tool; refresh its stored original text.
      const answered = this.controller.questions.find(q => q.id === this.inputTurn?.questionId && q.status === "answered");
      if (answered) answered.answer = this.answerText(answered.id);
    }
    const output = content?.outputTranscription?.text;
    if (output) {
      this.responseDueAt = 0; this.state.recoveryNotice = null;
      this.record("outputTranscription", output);
      if (!this.outputTurn) this.outputTurn = this.turn("yocai");
      this.outputTurn.text += output;
    }
    if (!content?.interrupted && !this.state.candidateSpeaking) {
      for (const part of content?.modelTurn?.parts ?? []) {
        const audio = part.inlineData;
        if (audio?.data && audio.mimeType?.startsWith("audio/pcm")) {
          this.responseDueAt = 0; this.state.recoveryNotice = null;
          if (!this.generating) this.record("outputAudioStart", {});
          this.generating = true;
          if (this.endingAt && this.state.feedback) this.finalAudioSeen = true;
          this.player.play(audio.data, audio.mimeType);
        }
      }
    }
    if (content?.turnComplete) {
      this.generating = false;
      if (this.outputTurn && this.outputTurn.status !== "interrupted") this.outputTurn.status = "complete";
      this.outputTurn = null;
      if (this.controller.ending && this.endingAt && !content.interrupted) this.finalTurnDone = true;
      this.maybeFinish();
    }
    this.emit();
    if (message.goAway) {
      const seconds = Number.parseFloat(String(message.goAway.timeLeft ?? "30"));
      this.renewalDue = Date.now() + Math.max(1000, (Number.isFinite(seconds) ? seconds : 30) * 1000 - 3000);
      this.log("Connection renewal requested; waiting for a safe turn boundary.");
    }
  }
  private answerText(questionId: string) {
    return this.state.turns.filter(t => t.speaker === "candidate" && t.questionId === questionId && !t.controlOnly && t.text.trim())
      .map(t => t.text).join("\n");
  }
  private async tool(call: FunctionCall) {
    const id = call.id;
    if (!id || this.stopped || this.cancelledCalls.has(id)) return;
    if (this.results.has(id)) {
      this.session?.sendToolResponse({ functionResponses: [{ id, name: call.name, response: this.results.get(id)! }] });
      return;
    }
    let result: Record<string, unknown>;
    let immediate = false;
    try {
      const args = call.args ?? {};
      if (call.name === "prepare_interview") {
        const profile = { role: args.role, experience: args.experience, technologies: args.technologies };
        if (!Object.values(profile).every(v => typeof v === "string" && v.trim() && v.length <= 1000)) throw new Error("Collect the missing profile fields first.");
        this.controller.setProfile(profile as Profile);
        this.startQuestionJob();
        if (this.controller.current && !this.controller.paused) this.notifyQuestions = false;
        result = { state: this.controller.snapshot(), preparation: this.state.preparation,
          instruction: this.state.preparation === "loading" ?
            "Briefly acknowledge that you are preparing the questions, including any deferred request. Then listen. The application will notify you when ready; do not invent a question or poll this tool." : this.nextInstruction() };
      } else if (call.name === "control_interview") {
        const supplied: unknown = args.changes ?? [{ action: args.action, questionId: args.questionId, total: args.total, additional: args.additional }];
        if (!Array.isArray(supplied) || !supplied.length || supplied.length > 4 || supplied.some(c => !c || typeof c !== "object")) throw new Error("Provide one to four changes.");
        const changes = supplied.map(c => ({ ...c })) as Change[];
        const key = this.inputTurn ? `${this.inputTurn.id}:${JSON.stringify(changes)}` : `${id}`;
        if (this.mutationKeys.has(key)) {
          result = { state: this.controller.snapshot(), instruction: "That request has already been applied. Do not apply it again." };
        } else {
          if (this.inputTurn && args.includesAnswer !== true && changes.some(c => c.action === "resume") && changes.some(c => c.action === "answer"))
            this.inputTurn.controlOnly = true;
          for (const change of changes) {
            if (change.action === "answer") {
              if (this.state.candidateSpeaking) throw new Error("Candidate is still speaking. Wait.");
              change.answer = this.answerText(change.questionId ?? "");
              if (!change.answer.trim()) throw new Error("No transcribed answer yet. Wait or ask for repetition.");
            }
          }
          const state = this.controller.changeBatch(changes, this.state.remaining);
          this.mutationKeys.add(key);
          const reopened = changes.find(c => c.action === "reopen");
          if (reopened && this.inputTurn) this.inputTurn.questionId = reopened.questionId ?? null;
          this.responseDueAt = this.controller.paused ? 0 : Date.now();
          if (this.controller.current && !this.controller.paused && changes.some(c => ["answer", "resume", "repeat", "clarify", "skip", "last"].includes(c.action))) this.notifyQuestions = false;
          if (!changes.some(c => c.action === "answer") && this.inputTurn && args.includesAnswer !== true &&
              !this.controller.questions.some(q => q.id === this.inputTurn?.questionId && q.status === "answered")) this.inputTurn.controlOnly = true;
          if (!this.controller.ending && this.state.preparation !== "error") this.startQuestionJob();
          result = { state, preparation: this.state.preparation, instruction: this.nextInstruction(changes) };
        }
        immediate = changes.some(c => c.action === "end") && args.immediate === true;
      } else if (call.name === "save_feedback") {
        if (!this.controller.ending) throw new Error("End the interview before submitting final feedback.");
        this.state.feedback = validateFeedback(args, this.controller.questions);
        this.finalTurnDone = false; this.finalAudioSeen = false;
        result = { feedback: this.state.feedback, instruction: "Now briefly summarize this feedback, read the exact overallScore if not null, thank the candidate and say goodbye. Under 50 spoken words." };
      } else throw new Error("Unknown interview tool.");
    } catch (error) {
      result = { error: error instanceof Error ? error.message : "Action failed.", state: this.controller.snapshot() };
    }
    if (this.stopped || this.cancelledCalls.has(id)) return;
    result = structuredClone(result);
    this.results.set(id, result);
    this.record("tool", { name: call.name, args: call.args, result });
    if (this.controller.ending) this.beginEnding();
    this.session?.sendToolResponse({ functionResponses: [{ id, name: call.name, response: result }] });
    this.emit();
    if (immediate) this.stop("Immediate disconnection requested.");
  }
  private nextInstruction(changes: Change[] = []) {
    if (this.controller.ending) return "Call save_feedback using only answered questions, then summarize and say goodbye.";
    if (this.controller.paused) return "If the candidate has stopped speaking, briefly say Of course, go ahead. Then listen without advancing or repeating. Wait for their continuation or resume request.";
    if (!this.controller.profile) return "Confirm the saved request and collect only missing profile details. Do not reject the navigation request; it has been saved.";
    if (!this.controller.current) return "Acknowledge the saved request. Questions are being prepared; listen and wait for the application notification.";
    if (changes.some(c => c.action === "clarify")) return "Clarify the current question without giving away its answer or adding a new question.";
    if (changes.length && changes.every(c => c.action === "resize" || c.action === "add")) return "Briefly confirm the updated total and wait on the current question; do not repeat it unnecessarily.";
    return "Present only state.current.text naturally, then wait. No additional follow-up.";
  }
  private startQuestionJob() {
    if (this.stopped || this.controller.ending || !this.controller.profile || !this.controller.missing || this.questionJob) return;
    const controller = new AbortController();
    this.questionJob = controller;
    const version = ++this.jobVersion;
    const count = this.controller.missing;
    this.preparationAt = Date.now();
    this.state.preparation = "loading"; this.state.preparationSeconds = 0;
    this.record("questionRequestStarted", { count, job: version });
    this.log(`Preparing ${count} question${count === 1 ? "" : "s"}. Voice controls remain available.`);
    void (async () => {
      try {
        const response = await fetch("/api/voice/questions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...this.controller.profile, count, exclude: this.controller.questions.map(q => q.text) }),
          signal: AbortSignal.any([controller.signal, this.abort.signal, AbortSignal.timeout(22000)]),
        });
        const data = await response.json();
        if (this.stopped || this.controller.ending || version !== this.jobVersion) return;
        if (!response.ok) throw new Error(data.error ?? "Question preparation failed.");
        if (!Array.isArray(data.questions) || data.questions.length !== count) throw new Error("Question service returned an invalid count.");
        const wasWaiting = !this.controller.current;
        this.controller.append(data.questions);
        this.state.preparation = "ready";
        this.record("questionRequestFinished", { count, job: version, elapsedMs: Date.now() - this.preparationAt });
        this.notifyQuestions = this.notifyQuestions || wasWaiting;
        this.log("Questions ready; saved navigation applied.");
      } catch (error) {
        if (this.stopped || this.controller.ending || version !== this.jobVersion || controller.signal.aborted) return;
        this.state.preparation = "error";
        this.record("questionRequestFailed", { elapsedMs: Date.now() - this.preparationAt });
        this.notifyQuestions = true;
        this.log(error instanceof Error ? error.message : "Question preparation failed.");
      } finally {
        if (version === this.jobVersion) {
          this.questionJob = null;
          this.emit();
          // If the total increased while loading, fetch only the remaining missing questions.
          if (this.state.preparation === "ready" && this.controller.missing && !this.controller.ending) this.startQuestionJob();
          if (this.controller.ending && !this.endingAt) this.finishInterview();
        }
      }
    })();
  }
  private announceQuestions() {
    if (!this.notifyQuestions || this.questionJob || this.controller.paused || this.stopped || this.controller.ending ||
        this.state.status !== "connected" || this.state.candidateSpeaking || this.generating || this.player.playing || this.toolsBusy || Date.now() - this.lastActivityAt < 900) return;
    this.notifyQuestions = false;
    this.generating = true; this.responseDueAt = Date.now();
    const instruction = this.state.preparation === "error" ?
      "Question preparation failed. Briefly explain, then offer retry or end. Do not invent questions." : this.nextInstruction();
    this.session?.sendClientContent({ turns: [{ role: "user", parts: [{ text:
      `APPLICATION_EVENT (not candidate speech): ${JSON.stringify({ state: this.controller.snapshot(), instruction })}` }] }], turnComplete: true });
    this.record("questionsReadyNotification", {});
    this.lastActivityAt = Date.now();
  }
  private recoverQuietTurn() {
    if (!this.responseDueAt || this.stopped || this.controller.ending || this.controller.paused ||
        this.state.status !== "connected" || this.state.candidateSpeaking || this.player.playing || this.toolsBusy || this.questionJob) return;
    const elapsed = Date.now() - this.responseDueAt;
    if (elapsed < 10000 || Date.now() - this.lastActivityAt < 1500) return;
    if (this.recoverySent) {
      if (elapsed >= 20000) {
        this.state.recoveryNotice = "YOCAI has not replied. Try saying that again, or export the transcript and reconnect.";
        this.responseDueAt = 0;
        this.log("Voice response timeout. Interview position preserved; no automatic advancement.");
      }
      return;
    }
    this.recoverySent = true;
    this.state.recoveryNotice = "Checking the voice response… Your interview position is saved.";
    this.session?.sendClientContent({ turns: [{ role: "user", parts: [{ text:
      `APPLICATION_EVENT (not candidate speech): No usable reply followed the last speech turn. Briefly ask the candidate to finish or repeat if needed. Do not advance, infer an answer, or repeat a completed action. State: ${JSON.stringify(this.controller.snapshot())}`
    }] }], turnComplete: true });
    this.record("quietTurnRecovery", { questionId: this.controller.current?.id ?? null });
  }
  private beginEnding() {
    if (this.endingAt) return;
    this.questionJob?.abort(); this.questionJob = null; this.jobVersion++; this.notifyQuestions = false;
    this.responseDueAt = 0; this.state.recoveryNotice = null;
    if (this.state.preparation === "loading") this.state.preparation = "idle";
    this.endingAt = Date.now(); this.finalTurnDone = false; this.finalAudioSeen = false;
    this.state.status = "ending"; this.microphone.enable(false);
    this.log("Ending interview. Waiting for final feedback and playback.");
  }
  finishInterview() {
    if (this.stopped || this.endingAt || !this.session) return;
    if (!this.controller.ending) this.controller.change({ action: "end" }); this.player.stop(); this.beginEnding();
    try { this.session.sendClientContent({ turns: [{ role: "user", parts: [{ text:
      `The application has ended the interview. Call save_feedback, then briefly summarize its result and say goodbye. Authoritative state: ${JSON.stringify(this.controller.snapshot())}` }] }], turnComplete: true });
    } catch { this.fail("Could not request closing feedback. Transcript retained for export."); }
  }
  private tick() {
    if (this.stopped) return;
    this.state.remaining = Math.max(0, INTERVIEW_SECONDS - Math.floor((Date.now() - this.startedAt) / 1000));
    if (!this.state.remaining) { this.stop("Ten-minute limit reached."); return; }
    if (this.state.preparation === "loading") this.state.preparationSeconds = Math.floor((Date.now() - this.preparationAt) / 1000);
    try { this.announceQuestions(); this.recoverQuietTurn(); }
    catch { this.fail("Could not reach the voice connection. Transcript retained for export."); return; }
    if (this.state.remaining <= 45 && !this.controller.ending) this.finishInterview();
    if (this.endingAt && Date.now() - this.endingAt > 40000) this.stop("Final feedback window ended.");
    if (this.renewalDue && !this.reconnecting && !this.controller.ending &&
        ((!this.state.candidateSpeaking && !this.toolsBusy && !this.generating && !this.player.playing) || Date.now() >= this.renewalDue)) {
      this.renewalDue = 0;
      void this.resume("Renewing the Live connection.");
    }
    this.emit();
  }
  private maybeFinish() {
    if (!this.stopped && this.endingAt && this.finalAudioSeen && this.finalTurnDone && !this.player.playing) this.stop("Interview completed. Microphone and connection closed.");
  }
  private async resume(reason: string) {
    if (this.stopped || this.reconnecting) return;
    if (this.controller.ending) { this.stop("Connection ended during closing feedback."); return; }
    // Never silently replay an uncertain answer or in-flight mutating tool call.
    if (this.state.candidateSpeaking || this.toolsBusy || !this.handle || this.reconnectCount >= 2) {
      this.fail(`${reason} Safe resumption unavailable. Export the transcript and start a new session.`); return;
    }
    this.reconnecting = true; this.reconnectCount++;
    this.state.status = "reconnecting"; this.microphone.enable(false);
    if (this.outputTurn) this.outputTurn.status = "interrupted";
    this.outputTurn = null; this.player.stop(); this.generating = false;
    const old = this.session; this.session = null; this.epoch++; old?.close();
    this.log(`${reason} Resuming without replaying microphone audio…`);
    try {
      await this.open(this.handle);
      if (this.stopped) return;
      this.state.status = "connected"; this.microphone.enable(!this.state.muted);
      this.log("Connection resumed. If a sentence was cut off, ask YOCAI to repeat it.");
    } catch (error) { this.fail(error instanceof Error ? error.message : "Could not resume."); }
    finally { this.reconnecting = false; }
  }
  mute(value: boolean) {
    this.state.muted = value;
    this.microphone.enable(!value && this.state.status === "connected"); this.emit();
  }
  setMode(pushToTalk: boolean) { this.microphone.setMode(pushToTalk); this.state.pushToTalk = pushToTalk; this.emit(); }
  hold(value: boolean) { this.microphone.hold(value); }
  export() { return JSON.stringify({ version: 2, ...this.state, interview: this.controller.snapshot(), events: this.raw }, null, 2); }
  private fail(message: string) { if (!this.stopped) this.stop(message, true); }
  stop(message = "Disconnected.", error = false) {
    if (this.stopped) return;
    this.stopped = true; this.epoch++; this.abort.abort();
    this.questionJob?.abort(); this.questionJob = null; this.jobVersion++;
    if (this.timer) clearInterval(this.timer);
    this.cancelSetup?.();
    this.timer = null;
    this.state.status = error ? "error" : "ended";
    this.state.candidateSpeaking = false; this.state.aiSpeaking = false;
    const session = this.session; this.session = null;
    try { session?.close(); } catch {}
    void this.microphone.dispose().catch(() => {});
    void this.player.dispose().catch(() => {});
    this.log(message);
  }
}