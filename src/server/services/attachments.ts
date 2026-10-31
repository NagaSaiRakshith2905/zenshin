import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { noteTarget } from "@/lib/contracts/notes";
import { beginAttachment, attachmentId, attachmentMediaType, cleanupMarginMs, maxConcurrentUploads, uploadLifetimeSeconds, downloadLifetimeSeconds, type AttachmentTarget, type Attachment, type UploadInstructions } from "@/lib/contracts/attachments";
import { wireValue } from "@/lib/contracts/work";
import { assertHumanOwner, assertProjectScope, type Actor, type Scope } from "@/server/auth/access";
import type { Database, DatabaseExecutor } from "@/server/db";
import { attachments } from "@/server/db/schema";
import { getAttachmentStorage, type AttachmentStorage } from "@/server/integrations/r2";
import { inspectAttachment, verifyAttachmentMetadata, UploadRejected } from "@/server/integrations/attachment-content";
import { enqueueJob } from "@/server/jobs";
import { activity, atomicMutation, attribution, DomainError, owned, projectLock } from "./work/foundation";

type Row = typeof attachments.$inferSelect;
const targetOf = (row: Row): AttachmentTarget => ({ kind: row.taskId ? "task" : row.sectionId ? "section" : "project", id: row.taskId ?? row.sectionId ?? row.projectId! });
const column = (kind: AttachmentTarget["kind"]) => kind === "task" ? attachments.taskId : kind === "section" ? attachments.sectionId : attachments.projectId;
function publicAttachment(row: Row): Attachment {
  return wireValue({ id: row.id, revision: row.revision, originalName: row.originalName, state: row.state, declaredSize: row.declaredSize,
    declaredMediaType: row.declaredMediaType, actualSize: row.actualSize, detectedMediaType: row.detectedMediaType,
    uploadExpiresAt: row.uploadExpiresAt.toISOString(), failureSummary: row.failureSummary, createdAt: row.createdAt.toISOString(), verifiedAt: row.verifiedAt?.toISOString() ?? null });
}
async function authorize(db: DatabaseExecutor, actor: Actor, target: AttachmentTarget, scope: Scope, lock = false) {
  const table = target.kind === "task" ? "tasks" : target.kind === "section" ? "sections" : "projects";
  let row = await owned(db, actor, table, target.id);
  const projectId = "projectId" in row ? row.projectId : row.id;
  if (lock) { await projectLock(db, actor, projectId, scope); row = await owned(db, actor, table, target.id); }
  assertProjectScope(actor, row.ownerId, projectId, scope);
  return projectId;
}
async function find(db: DatabaseExecutor, actor: Actor, id: string, scope: Scope, lock = false) {
  const [row] = await db.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.ownerId, actor.ownerId)));
  if (!row) throw new DomainError("not_found", "The attachment was not found.");
  const target = targetOf(row);
  const projectId = await authorize(db, actor, target, scope, lock);
  if (!lock) return { row, target, projectId };
  const [current] = await db.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.ownerId, actor.ownerId)));
  if (!current) throw new DomainError("not_found", "The attachment was removed.");
  return { row: current, target, projectId };
}
export const attachmentCleanupAt = (expiresAt: Date) => new Date(Math.max(Date.now(), expiresAt.getTime() + cleanupMarginMs));
async function enqueueCleanup(db: DatabaseExecutor, row: Row, reason: string) {
  await enqueueJob(db, { ownerId: row.ownerId, kind: "attachment_cleanup", deduplicationKey: `attachment-${reason}:${row.id}`,
    payload: { objectKey: row.objectKey, attachmentId: row.id }, availableAt: attachmentCleanupAt(row.uploadExpiresAt) });
}
const providerUnavailable = () => new DomainError("integration_unavailable", "File storage is unavailable. Retry this operation.");
export function createAttachmentService(db: Database, storage: () => AttachmentStorage = getAttachmentStorage) {
  return {
    async begin(actor: Actor, raw: unknown, requestId: string, key: string): Promise<UploadInstructions> {
      z.string().min(1).max(200).parse(key);
      const input = beginAttachment.parse(raw);
      const receipt = await atomicMutation(db, actor, "begin_attachment_upload", input, requestId, key, async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`attachment-uploads:${actor.ownerId}`}, 0))`);
        const projectId = await authorize(tx, actor, input, "upload", true);
        const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(attachments).where(and(eq(attachments.ownerId, actor.ownerId), inArray(attachments.state, ["pending", "verifying"]), gt(attachments.uploadExpiresAt, new Date())));
        if (count.value >= maxConcurrentUploads) throw new DomainError("validation_error", "Too many uploads are in progress. Finish or remove an upload and retry.");
        const id = randomUUID();
        const [row] = await tx.insert(attachments).values({ id, ownerId: actor.ownerId,
          [input.kind === "task" ? "taskId" : input.kind === "section" ? "sectionId" : "projectId"]: input.id,
          originalName: input.originalName, declaredMediaType: input.declaredMediaType, declaredSize: input.declaredSize,
          objectKey: `attachments/${id}/${randomUUID()}`, uploadExpiresAt: new Date(Date.now() + uploadLifetimeSeconds * 1000), ...attribution(actor) }).returning();
        await activity(tx, actor, projectId, requestId, "attachment_upload_started", { attachmentId: row.id }, input.kind === "project" ? undefined : { [input.kind === "task" ? "taskId" : "sectionId"]: input.id });
        return { value: { id: row.id }, projectId };
      }, async (tx) => { await authorize(tx, actor, input, "upload"); }) as { id: string };
      const { row } = await find(db, actor, receipt.id, "upload");
      if (row.state !== "pending" || row.uploadExpiresAt.getTime() <= Date.now()) return { attachment: publicAttachment(row), upload: null };
      try {
        const signed = await storage().signUpload(row.objectKey, row.declaredMediaType, row.declaredSize, row.uploadExpiresAt);
        return { attachment: publicAttachment(row), upload: { method: "PUT", ...signed, expiresAt: row.uploadExpiresAt.toISOString() } };
      } catch { throw providerUnavailable(); }
    },
    async list(actor: Actor, raw: unknown) {
      const input = noteTarget.extend({ cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(raw);
      await authorize(db, actor, input, "read");
      // UUID cursor is paired with its authorized target's timestamp for stable pagination.
      let cursor: Row | undefined;
      if (input.cursor) {
        [cursor] = await db.select().from(attachments).where(and(eq(attachments.id, input.cursor), eq(attachments.ownerId, actor.ownerId), eq(column(input.kind), input.id)));
        if (!cursor) throw new DomainError("validation_error", "The attachment cursor is no longer available. Reload the list.");
      }
      const rows = await db.select().from(attachments).where(and(eq(attachments.ownerId, actor.ownerId), eq(column(input.kind), input.id), cursor ? or(lt(attachments.createdAt, cursor.createdAt), and(eq(attachments.createdAt, cursor.createdAt), lt(attachments.id, cursor.id))) : undefined))
        .orderBy(desc(attachments.createdAt), desc(attachments.id)).limit(input.limit + 1);
      return { items: rows.slice(0, input.limit).map(publicAttachment), nextCursor: rows.length > input.limit ? rows[input.limit - 1].id : null, hasMore: rows.length > input.limit };
    },
    async finalize(actor: Actor, raw: unknown, requestId: string): Promise<Attachment> {
      const { id } = attachmentId.parse(raw);
      const claimed = await db.transaction(async (tx) => {
        const context = await find(tx, actor, id, "upload", true);
        const { row } = context;
        if (row.state === "ready" || row.state === "failed") return { ...context, verify: false };
        if (row.state === "verifying" && row.updatedAt.getTime() > Date.now() - 60_000) throw new DomainError("conflict", "This attachment is being verified. Retry shortly.");
        const [updated] = await tx.update(attachments).set({ state: "verifying", updatedAt: new Date(), revision: row.revision + 1 }).where(eq(attachments.id, id)).returning();
        return { ...context, row: updated, verify: true };
      });
      if (!claimed.verify) {
        if (claimed.row.state === "failed") throw new DomainError("upload_rejected", claimed.row.failureSummary ?? "The upload failed.");
        return publicAttachment(claimed.row);
      }
      const { row, projectId, target } = claimed;
      let detectedMediaType: string | undefined; let actualSize: number | undefined; let failure: string | undefined;
      try {
        if (row.uploadExpiresAt.getTime() + cleanupMarginMs <= Date.now()) throw new UploadRejected("The upload expired. Select the file again to start a new upload.");
        const signal = AbortSignal.timeout(20_000);
        const adapter = storage();
        const head = await adapter.head(row.objectKey, signal);
        if (!head && row.uploadExpiresAt.getTime() > Date.now()) throw new DomainError("conflict", "The file has not arrived yet. Retry the upload.");
        if (!head) throw new UploadRejected("The uploaded object is missing. Select the file again to retry.");
        verifyAttachmentMetadata(row, head);
        const type = attachmentMediaType(row.originalName);
        const bytes = await adapter.inspect(row.objectKey, head, type.startsWith("text/") || type === "application/json", signal);
        detectedMediaType = inspectAttachment(row.originalName, bytes, head.size);
        actualSize = head.size;
      } catch (error) {
        if (error instanceof UploadRejected) failure = error.message;
        else {
          await db.update(attachments).set({ state: "pending", updatedAt: new Date(), revision: row.revision + 1 }).where(and(eq(attachments.id, id), eq(attachments.revision, row.revision), eq(attachments.state, "verifying")));
          throw error instanceof DomainError ? error : providerUnavailable();
        }
      }
      const result = await db.transaction(async (tx) => {
        // Recheck authorization and fence expired verifiers/removal after the provider calls.
        await projectLock(tx, actor, projectId, "upload");
        await authorize(tx, actor, target, "upload");
        const [updated] = await tx.update(attachments).set({ state: failure ? "failed" : "ready", failureSummary: failure ?? null,
          detectedMediaType: detectedMediaType ?? null, actualSize: actualSize ?? null, verifiedAt: failure ? null : new Date(), updatedAt: new Date(), revision: row.revision + 1 })
          .where(and(eq(attachments.id, id), eq(attachments.ownerId, actor.ownerId), eq(attachments.state, "verifying"), eq(attachments.revision, row.revision))).returning();
        if (!updated) throw new DomainError("conflict", "The attachment changed or was removed. Reload before retrying.");
        if (failure) await enqueueCleanup(tx, updated, "failed");
        await activity(tx, actor, projectId, requestId, failure ? "attachment_upload_failed" : "attachment_ready", { attachmentId: id }, target.kind === "project" ? undefined : { [target.kind === "task" ? "taskId" : "sectionId"]: target.id });
        return publicAttachment(updated);
      });
      if (failure) throw new DomainError("upload_rejected", failure, { attachment: result });
      return result;
    },
    async download(actor: Actor, raw: unknown) {
      const { id } = attachmentId.parse(raw);
      const { row } = await find(db, actor, id, "read");
      if (row.state !== "ready") throw new DomainError("conflict", "Only verified, ready attachments can be downloaded.");
      try { return { url: await storage().signDownload(row.objectKey, row.originalName, row.detectedMediaType!), expiresAt: new Date(Date.now() + downloadLifetimeSeconds * 1000).toISOString() }; }
      catch { throw providerUnavailable(); }
    },
    async remove(actor: Actor, raw: unknown, requestId: string, key: string) {
      assertHumanOwner(actor);
      const input = attachmentId.extend({ expectedRevision: z.number().int().positive() }).parse(raw);
      return atomicMutation(db, actor, "remove_attachment", input, requestId, key, async (tx) => {
        const { row, projectId, target } = await find(tx, actor, input.id, "write", true);
        if (row.revision !== input.expectedRevision) throw new DomainError("conflict", "The attachment changed. Reload before removing it.", { current: publicAttachment(row) });
        await enqueueCleanup(tx, row, "delete");
        await tx.delete(attachments).where(eq(attachments.id, row.id));
        await activity(tx, actor, projectId, requestId, "attachment_removed", { attachmentId: row.id }, target.kind === "project" ? undefined : { [target.kind === "task" ? "taskId" : "sectionId"]: target.id });
        return { value: { id: row.id, deleted: true }, projectId };
      }, async (tx, _input, replayProjectId) => {
        if (replayProjectId) await owned(tx, actor, "projects", replayProjectId);
        else await find(tx, actor, input.id, "write");
      });
    },
  };
}

export async function cleanupAttachment(db: Database, ownerId: string, raw: unknown, signal: AbortSignal, storage: AttachmentStorage = getAttachmentStorage()) {
  const input = z.strictObject({ attachmentId: z.uuid(), objectKey: z.string().min(1) }).parse(raw);
  // The payload comes only from durable server jobs and outlives deleted target rows.
  const [row] = await db.select().from(attachments).where(and(eq(attachments.id, input.attachmentId), eq(attachments.ownerId, ownerId)));
  if (row && (row.objectKey !== input.objectKey || row.state === "ready")) return;
  if (row && row.uploadExpiresAt.getTime() + cleanupMarginMs > Date.now()) throw new Error("Upload cleanup is not due");
  if (row) {
    // Fence any stale finalizer before deleting provider bytes.
    const fenced = await db.update(attachments).set({ state: "failed", failureSummary: row.failureSummary ?? "The upload expired. Select the file again to retry.", updatedAt: new Date(), revision: sql`${attachments.revision} + 1` })
      .where(and(eq(attachments.id, row.id), eq(attachments.ownerId, ownerId), sql`${attachments.state} <> 'ready'`)).returning({ id: attachments.id });
    if (!fenced.length) return;
  }
  await storage.delete(input.objectKey, signal);
}
