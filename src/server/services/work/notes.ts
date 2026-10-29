import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { emptyNote, noteDocument, noteMarkdown, notePlainText, noteTarget, type NoteDocument, type NoteState } from "@/lib/contracts/notes";
import { wireValue } from "@/lib/contracts/work";
import { assertHumanOwner, assertProjectScope, type Actor } from "@/server/auth/access";
import type { Database, DatabaseExecutor } from "@/server/db";
import { notes, noteRevisions } from "@/server/db/schema";
import { attribution, checkRevision, DomainError, owned } from "./foundation";
import type { Context, Handlers } from "./types";

type Target = { kind: "project" | "section" | "task"; id: string };
const column = (kind: Target["kind"]) => kind === "project" ? notes.projectId : kind === "section" ? notes.sectionId : notes.taskId;
async function find(db: DatabaseExecutor, actor: Actor, target: Target) {
  const [note] = await db.select().from(notes).where(and(eq(notes.ownerId, actor.ownerId), eq(column(target.kind), target.id)));
  return note;
}
function state(actor: Actor, target: Target, note?: typeof notes.$inferSelect): NoteState {
  return wireValue({ id: note?.id ?? null, ownerId: actor.ownerId, kind: target.kind, targetId: target.id, revision: note?.revision ?? 0, content: note ? noteDocument.parse(note.content) : emptyNote(), updatedAt: note?.updatedAt.toISOString() ?? null });
}
async function save(context: Context, target: Target, content: NoteDocument, expectedRevision?: number, force = false) {
  const { db, actor } = context;
  const existing = await find(db, actor, target);
  if (expectedRevision !== undefined && (existing?.revision ?? 0) !== expectedRevision) throw new DomainError("conflict", "The note changed. Your attempted content has been retained.", { currentRevision: existing?.revision ?? 0, current: state(actor, target, existing) });
  if (!force && existing && JSON.stringify(existing.content) === JSON.stringify(content)) return { ...state(actor, target, existing), changed: false };
  let row: typeof notes.$inferSelect;
  const values = { content: content as unknown as Record<string, unknown>, plainText: notePlainText(content), updatedAt: new Date() };
  if (existing) [row] = await db.update(notes).set({ ...values, revision: existing.revision + 1 }).where(eq(notes.id, existing.id)).returning();
  else [row] = await db.insert(notes).values({ ownerId: actor.ownerId, ...values, [target.kind === "project" ? "projectId" : target.kind === "section" ? "sectionId" : "taskId"]: target.id }).returning();
  await db.insert(noteRevisions).values({ ownerId: actor.ownerId, noteId: row.id, revision: row.revision, content: row.content, ...attribution(actor) });
  await db.execute(sql`delete from note_revisions where note_id = ${row.id} and revision not in (select revision from note_revisions where note_id = ${row.id} order by revision desc limit 20)`);
  return { ...state(actor, target, row), changed: true };
}
export const noteHandlers: Pick<Handlers, "update_note" | "append_note" | "restore_note"> = {
  async update_note(context, input) { return save(context, input, input.content, input.expectedRevision); },
  async append_note(context, input) {
    const current = await find(context.db, context.actor, input);
    const content = noteDocument.parse({ type: "doc", content: [...(current ? noteDocument.parse(current.content).content : []), ...input.content.content] });
    return save(context, input, content);
  },
  async restore_note(context, input) {
    assertHumanOwner(context.actor);
    const current = await find(context.db, context.actor, input);
    if (!current) throw new DomainError("not_found", "This note does not exist yet.");
    checkRevision(current, input.expectedRevision);
    const [source] = await context.db.select().from(noteRevisions).where(and(eq(noteRevisions.noteId, current.id), eq(noteRevisions.revision, input.sourceRevision), eq(noteRevisions.ownerId, context.actor.ownerId)));
    if (!source) throw new DomainError("not_found", "This revision is no longer retained.");
    return save(context, input, noteDocument.parse(source.content), input.expectedRevision, true);
  },
};
export function createNoteReader(db: Database) {
  return async (actor: Actor, raw: unknown, history = false, sourceRevision?: number) => {
    const target = noteTarget.parse(raw);
    if (history) assertHumanOwner(actor);
    return db.transaction(async (tx) => {
      const row = await owned(tx, actor, target.kind === "project" ? "projects" : target.kind === "section" ? "sections" : "tasks", target.id);
      const projectId = "projectId" in row ? row.projectId : row.id;
      assertProjectScope(actor, actor.ownerId, projectId, "read");
      const note = await find(tx, actor, target);
      if (!history) return state(actor, target, note);
      if (!note) return { items: [] };
      if (sourceRevision !== undefined) {
        const [revision] = await tx.select().from(noteRevisions).where(and(eq(noteRevisions.noteId, note.id), eq(noteRevisions.revision, sourceRevision), eq(noteRevisions.ownerId, actor.ownerId)));
        if (!revision) throw new DomainError("not_found", "This revision is no longer retained.");
        const content = noteDocument.parse(revision.content);
        return wireValue({ revision: revision.revision, savedAt: revision.savedAt, content, markdown: noteMarkdown(content) });
      }
      const revisions = await tx.select({ revision: noteRevisions.revision, savedAt: noteRevisions.savedAt, actorKind: noteRevisions.actorKind }).from(noteRevisions).where(and(eq(noteRevisions.noteId, note.id), eq(noteRevisions.ownerId, actor.ownerId))).orderBy(desc(noteRevisions.revision)).limit(20);
      return wireValue({ items: revisions });
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  };
}
