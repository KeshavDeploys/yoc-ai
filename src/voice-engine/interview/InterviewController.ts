export type Profile = { role: string; experience: string; technologies: string };
export type Question = { id: string; text: string; status: "pending" | "answered" | "skipped"; answer: string };
export type Action = "answer" | "skip" | "last" | "resize" | "add" | "repeat" | "clarify" | "pause" | "resume" | "reopen" | "end";
export type Change = { action: Action; questionId?: string; total?: number; additional?: number; answer?: string };
const ACTIONS: Action[] = ["answer", "skip", "last", "resize", "add", "repeat", "clarify", "pause", "resume", "reopen", "end"];
export const MAX_QUESTIONS = 12;
export const FEEDBACK_RESERVE_SECONDS = 45;

export class InterviewController {
  profile: Profile | null = null;
  questions: Question[] = [];
  total = 5;
  index = 0;
  paused = false;
  ending = false;
  // Intents survive profile collection and generation; "last" resolves against the latest total.
  deferred: Action[] = [];
  get current() { return !this.ending && !this.deferred.length && this.index < this.total ? this.questions[this.index] ?? null : null; }
  get missing() { return Math.max(0, this.total - this.questions.length); }
  snapshot() {
    return structuredClone({ profile: this.profile, total: this.total, index: this.index, current: this.current,
      questions: this.questions, paused: this.paused, ending: this.ending, deferred: this.deferred,
      waitingForQuestions: !this.ending && (!this.questions.length || !!this.deferred.length || !this.current), missing: this.missing });
  }
  setProfile(profile: Profile) {
    if (this.ending) throw new Error("Interview is ending.");
    if (this.profile && JSON.stringify(this.profile) !== JSON.stringify(profile)) throw new Error("Profile is already set for this interview. Start a new session to change it.");
    this.profile = structuredClone(profile);
  }
  prepare(profile: Profile, texts: string[]) { this.setProfile(profile); return this.append(texts); }
  append(texts: string[]) {
    if (this.ending) return this.snapshot();
    if (!Array.isArray(texts) || !texts.length || texts.some(t => typeof t !== "string" || !t.trim())) throw new Error("Invalid questions.");
    const existing = new Set(this.questions.map(q => q.text.trim().toLowerCase()));
    for (const text of texts) { const key = text.trim().toLowerCase(); if (existing.has(key)) throw new Error("Duplicate question."); existing.add(key); }
    for (const text of texts.slice(0, MAX_QUESTIONS - this.questions.length)) {
      this.questions.push({ id: `q${this.questions.length + 1}`, text: text.trim(), status: "pending", answer: "" });
    }
    this.resolveDeferred();
    return this.snapshot();
  }
  change(change: Change, remaining = 600) { return this.changeBatch([change], remaining); }
  changeBatch(changes: Change[], remaining = 600) {
    if (this.ending) throw new Error("Interview is already ending.");
    if (!Array.isArray(changes) || !changes.length || changes.length > 4 || changes.some(c => !c || !ACTIONS.includes(c.action))) throw new Error("Use one to four valid actions.");
    // End is terminal and takes precedence over navigation, even in a compound request.
    if (changes.some(c => c.action === "end")) { this.ending = true; this.deferred = []; return this.snapshot(); }
    const draft = new InterviewController();
    Object.assign(draft, structuredClone({ profile: this.profile, questions: this.questions, total: this.total,
      index: this.index, paused: this.paused, ending: this.ending, deferred: this.deferred }));
    const counts = changes.filter(c => c.action === "resize" || c.action === "add");
    if (counts.length > 1) throw new Error("Clarify the intended question count; use only one count change.");
    if (changes.filter(c => ["answer", "skip", "last", "reopen"].includes(c.action)).length > 1) throw new Error("Use one navigation action per request.");
    const originalCurrent = this.current;
    for (const c of changes) {
      if (["answer", "skip", "last", "repeat", "clarify"].includes(c.action) && originalCurrent && c.questionId !== originalCurrent.id) throw new Error(`Current question is ${originalCurrent.id}; stale action rejected.`);
    }
    // Atomic: any validation failure leaves the original state untouched.
    for (const c of [...counts, ...changes.filter(c => !counts.includes(c))]) draft.apply(c, remaining);
    draft.resolveDeferred();
    if (draft.index >= draft.total) { draft.ending = true; draft.deferred = []; }
    Object.assign(this, draft);
    return this.snapshot();
  }
  private apply(c: Change, remaining: number) {
    if (c.action === "resize" || c.action === "add") {
      if (c.action === "resize" && c.additional !== undefined) throw new Error("Use add for additional questions and resize for total questions.");
      const target = c.action === "add" ? this.total + (c.additional ?? NaN) : c.total;
      if (c.action === "add" && (!Number.isInteger(c.additional) || c.additional! < 1)) throw new Error("Additional questions must be a positive integer.");
      if (!Number.isInteger(target) || target! < 1 || target! > MAX_QUESTIONS) throw new Error(`Choose a total from 1 to ${MAX_QUESTIONS}.`);
      if (target! > this.total) {
        // Budget is a planning estimate, not a promise that every answer fits into 45 seconds.
        const estimatedSlots = Math.floor(Math.max(0, remaining - FEEDBACK_RESERVE_SECONDS) / 45);
        const maximumTotal = Math.min(MAX_QUESTIONS, this.index + estimatedSlots);
        if (target! > maximumTotal) throw new Error(`Not enough time for that increase. Current total stays ${this.total}; estimated maximum total now is ${Math.max(this.index, maximumTotal)}.`);
      }
      this.total = target!; return;
    }
    if (c.action === "reopen") {
      const previous = this.questions[this.index - 1];
      if (this.deferred.length || !previous || previous.status !== "answered" || c.questionId !== previous.id)
        throw new Error("Only the immediately previous answered question can be reopened.");
      previous.status = "pending"; this.index--; this.paused = true; return;
    }
    if (c.action === "pause") { this.paused = true; return; }
    if (c.action === "resume") { this.paused = false; return; }
    if (this.index >= this.total) return;
    if (c.action === "answer") {
      if (this.paused) throw new Error("Candidate asked for thinking time. Resume before accepting an answer.");
      const q = this.current;
      if (!q) throw new Error("No question has been presented yet.");
      if (!c.answer?.trim()) throw new Error("Cannot count silence as an answer.");
      q.status = "answered"; q.answer = c.answer; this.index++; return;
    }
    if (c.action === "repeat" || c.action === "clarify") {
      if (!this.current) throw new Error("No current question yet. Clarify whether the candidate means the profile request.");
      return;
    }
    if (c.action === "skip" || c.action === "last") {
      this.paused = false;
      if (c.action === "last") this.deferred = ["last"]; // Latest last request supersedes earlier pending navigation.
      else { if (this.deferred.length >= MAX_QUESTIONS) throw new Error("Too many deferred skips."); this.deferred.push("skip"); }
    }
  }
  private resolveDeferred() {
    while (this.deferred.length && this.index < this.total) {
      const action = this.deferred[0];
      if (action === "last") {
        if (this.questions.length < this.total) return;
        while (this.index < this.total - 1) { this.questions[this.index].status = "skipped"; this.index++; }
      } else {
        if (!this.questions[this.index]) return;
        this.questions[this.index].status = "skipped"; this.index++;
      }
      this.deferred.shift();
    }
    if (this.index >= this.total) { this.ending = true; this.deferred = []; }
  }
}