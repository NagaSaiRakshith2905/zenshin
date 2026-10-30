import { noteDocument, type NoteDocument, type NoteState } from "@/lib/contracts/notes";
export type Draft = { ownerId: string; kind: NoteState["kind"]; targetId: string; baseRevision: number; content: NoteDocument; savedAt: number };
export type DraftStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
const prefix = (owner: string) => `zenshin:note-draft:${encodeURIComponent(owner)}:`;
export const draftKey = (draft: Pick<Draft, "ownerId" | "kind" | "targetId" | "baseRevision">) => `${prefix(draft.ownerId)}${draft.kind}:${draft.targetId}:${draft.baseRevision}`;
export function browserDraftStorage(): DraftStorage | undefined { try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; } }
export function ownerDraftKeys(storage: DraftStorage | undefined, ownerId: string) {
  if (!storage) return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(prefix(ownerId))) keys.push(key); }
    return keys;
  } catch { return []; }
}
export function readDraft(storage: DraftStorage | undefined, note: NoteState): Draft | undefined {
  try {
    const drafts = ownerDraftKeys(storage, note.ownerId).flatMap((key) => {
      try { const value = JSON.parse(storage!.getItem(key) ?? "null") as Draft; if (value.ownerId !== note.ownerId || value.kind !== note.kind || value.targetId !== note.targetId || !Number.isInteger(value.baseRevision) || value.baseRevision < 0 || !Number.isFinite(value.savedAt)) return []; return [{ ...value, content: noteDocument.parse(value.content) }]; } catch { return []; }
    });
    return drafts.sort((a, b) => b.savedAt - a.savedAt)[0];
  } catch { return undefined; }
}
export type NoteSnapshot = { content: NoteDocument; revision: number; status: "saved" | "unsaved" | "saving" | "failed" | "conflict" | "recovery"; error: string; localSaved: boolean; recovery?: Draft; current?: NoteState };
type Save = (content: NoteDocument, revision: number, key: string) => Promise<NoteState>;
export class NoteSession {
  private snapshot: NoteSnapshot;
  private listeners = new Set<() => void>();
  private saved: string;
  private timer?: ReturnType<typeof setTimeout>;
  private inflight?: Promise<void>;
  private attempt?: { content: NoteDocument; revision: number; key: string };
  private paused = false;
  private server: NoteState;
  constructor(readonly initial: NoteState, private save: Save, private storage = browserDraftStorage()) {
    this.server = initial; this.saved = JSON.stringify(initial.content);
    const recovery = readDraft(storage, initial);
    this.snapshot = { content: initial.content, revision: initial.revision, status: recovery ? "recovery" : "saved", error: "", localSaved: Boolean(recovery), recovery };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private emit(next: Partial<NoteSnapshot>) { this.snapshot = { ...this.snapshot, ...next }; this.listeners.forEach((listener) => listener()); }
  get dirty() { return JSON.stringify(this.snapshot.content) !== this.saved; }
  private removeDrafts() { try { for (const key of ownerDraftKeys(this.storage, this.initial.ownerId)) if (key.startsWith(`${prefix(this.initial.ownerId)}${this.initial.kind}:${this.initial.targetId}:`)) this.storage?.removeItem(key); } catch { /* A blocked store must not discard the live editor. */ } }
  private persist() {
    if (this.paused) return;
    try {
      const content = noteDocument.parse(this.snapshot.content);
      if (!this.storage) throw new Error("Local storage is unavailable.");
      const draft: Draft = { ownerId: this.initial.ownerId, kind: this.initial.kind, targetId: this.initial.targetId, baseRevision: this.snapshot.revision, content, savedAt: Date.now() };
      this.storage.setItem(draftKey(draft), JSON.stringify(draft));
      // Write the new base before clearing obsolete keys.
      for (const key of ownerDraftKeys(this.storage, this.initial.ownerId)) if (key !== draftKey(draft) && key.startsWith(`${prefix(draft.ownerId)}${draft.kind}:${draft.targetId}:`)) this.storage.removeItem(key);
      this.emit({ localSaved: true });
    } catch { this.emit({ localSaved: false }); }
  }
  edit = (content: NoteDocument) => {
    try { content = noteDocument.parse(content); }
    catch (e) { clearTimeout(this.timer); this.emit({ content, status: "failed", error: e instanceof Error ? e.message : "Invalid note.", localSaved: false }); return; }
    const blocked = ["conflict", "failed", "recovery"].includes(this.snapshot.status);
    if (!blocked && !this.inflight && !this.attempt && JSON.stringify(content) === this.saved) {
      clearTimeout(this.timer); this.removeDrafts(); this.emit({ content, status: "saved", error: "", localSaved: false }); return;
    }
    this.emit({ content, ...(blocked ? {} : { status: "unsaved", error: "" }) });
    this.persist(); clearTimeout(this.timer);
    if (!blocked && !this.paused) this.timer = setTimeout(() => void this.flush(), 800);
  };
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.inflight) return this.inflight;
    // An edit that lands mid-save can leave "unsaved" with nothing left to send.
    if (!this.paused && !this.dirty && !this.attempt && this.snapshot.status === "unsaved") { this.removeDrafts(); this.emit({ status: "saved", localSaved: false }); return Promise.resolve(); }
    if (this.paused || (!this.dirty && !this.attempt) || ["conflict", "recovery", "failed"].includes(this.snapshot.status)) return Promise.resolve();
    this.inflight = this.perform().finally(() => { this.inflight = undefined; if (this.dirty && this.snapshot.status === "unsaved" && !this.paused) this.timer = setTimeout(() => void this.flush(), 0); });
    return this.inflight;
  };
  private async perform() {
    this.emit({ status: "saving", error: "" });
    try {
      if (!this.attempt) this.attempt = { content: noteDocument.parse(this.snapshot.content), revision: this.snapshot.revision, key: crypto.randomUUID() };
      const attempt = this.attempt;
      const result = await this.save(attempt.content, attempt.revision, attempt.key);
      this.server = result; this.saved = JSON.stringify(attempt.content); this.attempt = undefined;
      const dirty = this.dirty;
      this.emit({ revision: result.revision, status: dirty ? "unsaved" : "saved", current: undefined });
      if (dirty) this.persist(); else { this.removeDrafts(); this.emit({ localSaved: false }); }
    } catch (e) {
      const error = e as { code?: string; message?: string; details?: { current?: NoteState } };
      this.emit({ status: error.code === "conflict" ? "conflict" : "failed", error: error.message ?? "The save could not be confirmed. Retry the same request.", current: error.details?.current });
      this.persist();
    }
  }
  retry = () => { if (this.snapshot.status === "conflict") return Promise.resolve(); this.emit({ status: "unsaved", error: "" }); return this.flush(); };
  retryLatest = () => {
    const current = this.snapshot.current;
    if (!current) return;
    this.server = current; this.saved = JSON.stringify(current.content); this.attempt = undefined;
    this.emit({ revision: current.revision, status: "unsaved", current: undefined, error: "" }); this.persist(); void this.flush();
  };
  discard = (current?: NoteState) => { if (this.inflight) return; if (current) this.server = current; this.attempt = undefined; this.saved = JSON.stringify(this.server.content); this.removeDrafts(); this.emit({ content: this.server.content, revision: this.server.revision, status: "saved", recovery: undefined, current: undefined, error: "", localSaved: false }); };
  recover = () => {
    const draft = this.snapshot.recovery; if (!draft) return;
    const conflict = draft.baseRevision !== this.server.revision;
    this.emit({ content: draft.content, revision: draft.baseRevision, status: conflict ? "conflict" : "unsaved", recovery: undefined, current: conflict ? this.server : undefined, error: conflict ? "This draft is based on an older revision. Compare it with the saved note before retrying." : "" });
    if (!conflict) void this.flush();
  };
  receive = (current: NoteState) => {
    if (this.inflight || this.dirty || ["recovery", "conflict", "failed"].includes(this.snapshot.status) || current.revision <= this.server.revision) return;
    this.server = current; this.saved = JSON.stringify(current.content); this.emit({ content: current.content, revision: current.revision, status: "saved" });
  };
  pause = () => { this.paused = true; clearTimeout(this.timer); };
  resume = () => { this.paused = false; if (this.dirty && this.snapshot.status === "unsaved") void this.flush(); };
}
const sessions = new Map<string, NoteSession>();
export function noteSession(note: NoteState, save: Save) { const key = `${note.ownerId}:${note.kind}:${note.targetId}`; let session = sessions.get(key); if (!session) { session = new NoteSession(note, save); sessions.set(key, session); } return session; }
export const activeNotes = (ownerId: string) => [...sessions.values()].filter((s) => s.initial.ownerId === ownerId);
export function discardOwnerDrafts(ownerId: string) { for (const session of activeNotes(ownerId)) { session.pause(); session.discard(); } const storage = browserDraftStorage(); try { for (const key of ownerDraftKeys(storage, ownerId)) storage?.removeItem(key); } catch { /* Sign-out still completes when storage is blocked. */ } }
export const hasOwnerDrafts = (ownerId: string) => activeNotes(ownerId).some((s) => s.dirty || s.getSnapshot().recovery) || ownerDraftKeys(browserDraftStorage(), ownerId).length > 0;
