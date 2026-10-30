import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyNote, type NoteDocument, type NoteState } from "@/lib/contracts/notes";
import { NoteSession, readDraft, type DraftStorage } from "./drafts";

function storage(): DraftStorage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
}
const initial: NoteState = { id: null, ownerId: "owner", kind: "task", targetId: "target", revision: 0, content: emptyNote(), updatedAt: null };
const content = (text: string): NoteDocument => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
afterEach(() => vi.useRealTimers());
describe("note recovery", () => {
  it("settles to saved when an unchanged edit lands during a save", async () => {
    let complete!: (note: NoteState) => void;
    const session = new NoteSession(initial, () => new Promise((resolve) => { complete = resolve; }), storage());
    session.edit(content("a")); const flushing = session.flush(); session.edit(content("a"));
    complete({ ...initial, revision: 2, content: content("a") }); await flushing; await session.flush();
    expect(session.getSnapshot().status).toBe("saved");
  });
  it("does not mark unchanged empty content as unsaved", () => {
    const store = storage(); const save = vi.fn(); const session = new NoteSession(initial, save, store);
    session.edit(emptyNote()); expect(session.getSnapshot().status).toBe("saved"); expect(store.length).toBe(0); expect(save).not.toHaveBeenCalled();
  });
  it("keeps newer edits during a save and uses the returned revision", async () => {
    vi.useFakeTimers(); const store = storage();
    let complete!: (note: NoteState) => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<NoteState>((resolve) => { complete = resolve; })).mockImplementationOnce(async (doc: NoteDocument) => ({ ...initial, content: doc, revision: 2 }));
    const session = new NoteSession(initial, save, store);
    session.edit(content("first")); const saving = session.flush(); session.edit(content("second"));
    complete({ ...initial, content: content("first"), revision: 1 }); await saving;
    expect(readDraft(store, initial)?.content).toEqual(content("second"));
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenLastCalledWith(content("second"), 1, expect.any(String));
    expect(session.getSnapshot().status).toBe("saved"); expect(store.length).toBe(0);
  });
  it("retains a rejected save and retries the same idempotency key", async () => {
    const store = storage(); const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(async (doc: NoteDocument) => ({ ...initial, content: doc, revision: 1 }));
    const session = new NoteSession(initial, save, store); session.edit(content("draft")); await session.flush();
    expect(session.getSnapshot().status).toBe("failed"); expect(readDraft(store, initial)?.content).toEqual(content("draft"));
    await session.retry(); expect(save.mock.calls[0][2]).toBe(save.mock.calls[1][2]); expect(store.length).toBe(0);
  });
  it("recovers an older local draft as a conflict without overwriting the server", () => {
    const store = storage(); const old = new NoteSession(initial, vi.fn(), store); old.edit(content("local")); old.pause();
    const save = vi.fn(); const current = { ...initial, revision: 2, content: content("remote") }; const recovered = new NoteSession(current, save, store);
    recovered.recover(); expect(recovered.getSnapshot()).toMatchObject({ status: "conflict", content: content("local"), current }); expect(save).not.toHaveBeenCalled();
  });
});
