import "server-only";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { buildWorkspaceExport, ExportLimitError, exportColumns, exportTables, maxExportBytes, maxExportRows, type ExportRecords } from "@/lib/recovery/export-format";
import { assertHumanOwner, AccessError, type Actor } from "@/server/auth/access";
import type { Database } from "@/server/db";
import { backgroundJobs, exports } from "@/server/db/schema";
import { createExportStorage, type ExportStorage } from "@/server/integrations/export-storage";
import { enqueueJob, JobDeferred } from "@/server/jobs";

const zip = promisify(gzip);
const publicColumns = { id: exports.id, status: exports.status, requestedAt: exports.requestedAt, completedAt: exports.completedAt, expiresAt: exports.expiresAt, failureSummary: exports.failureSummary };
const expired = <T extends { status: string; expiresAt: Date }>(row: T) => ({ ...row, status: row.expiresAt.getTime() <= Date.now() ? "expired" : row.status });
export function createExportService(db: Database, storage: () => ExportStorage = createExportStorage) {
  return {
    async request(actor: Actor, raw: unknown) {
      assertHumanOwner(actor);
      const { idempotencyKey: id } = z.strictObject({ idempotencyKey: z.uuid() }).parse(raw);
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`exports:${actor.ownerId}`}, 0))`);
        const [prior] = await tx.select(publicColumns).from(exports).where(and(eq(exports.ownerId, actor.ownerId), eq(exports.id, id)));
        if (prior) return expired(prior);
        const active = await tx.select({ id: exports.id }).from(exports).where(and(eq(exports.ownerId, actor.ownerId), sql`${exports.status} in ('pending','running') and ${exports.expiresAt} > now() and not exists (select 1 from background_jobs j where j.payload->>'exportId' = ${exports.id}::text and j.state = 'failed')`)).limit(1);
        if (active.length) throw new AccessError("conflict", "An export is already in progress. Refresh its status.");
        const outputObjectKey = `exports/${id}/workspace.json.gz`;
        const [row] = await tx.insert(exports).values({ id, ownerId: actor.ownerId, outputObjectKey }).returning(publicColumns);
        await enqueueJob(tx, { ownerId: actor.ownerId, kind: "export", deduplicationKey: `export:${id}:snapshot`, payload: { exportId: id, phase: "snapshot" } });
        await enqueueJob(tx, { ownerId: actor.ownerId, kind: "export_cleanup", deduplicationKey: `export-expired:${id}`, payload: { exportId: id, objectKey: outputObjectKey }, availableAt: new Date(row.expiresAt.getTime() + 60_000) });
        return row;
      });
    },
    async list(actor: Actor, raw: unknown) {
      assertHumanOwner(actor);
      const input = z.strictObject({ cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(raw);
      const rows = await db.select({ ...publicColumns, failed: sql<boolean>`exists (select 1 from background_jobs j where j.owner_id = ${actor.ownerId} and j.payload->>'exportId' = ${exports.id}::text and j.kind = 'export' and j.state = 'failed')` }).from(exports).where(and(eq(exports.ownerId, actor.ownerId), input.cursor ? sql`(${exports.requestedAt}, ${exports.id}) < (select requested_at, id from exports where id = ${input.cursor} and owner_id = ${actor.ownerId})` : undefined)).orderBy(desc(exports.requestedAt), desc(exports.id)).limit(input.limit + 1);
      return { items: rows.slice(0, input.limit).map(({ failed, ...row }) => expired(failed && ["pending", "running"].includes(row.status) ? { ...row, status: "failed", failureSummary: "Export failed. Check integration health, then request a new export." } : row)), nextCursor: rows.length > input.limit ? rows[input.limit - 1].id : null, hasMore: rows.length > input.limit };
    },
    async download(actor: Actor, raw: unknown) {
      assertHumanOwner(actor);
      const { id } = z.strictObject({ id: z.uuid() }).parse(raw);
      const [row] = await db.select({ status: exports.status, expiresAt: exports.expiresAt, outputObjectKey: exports.outputObjectKey }).from(exports).where(and(eq(exports.id, id), eq(exports.ownerId, actor.ownerId)));
      if (!row) throw new AccessError("not_found", "Export was not found.");
      const expiresIn = Math.min(300, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000));
      if (row.status !== "ready" || !row.outputObjectKey || expiresIn < 1) throw new AccessError("conflict", "This export is unavailable or expired. Request a new export.");
      return { url: await storage().download(row.outputObjectKey, expiresIn), expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
    },
  };
}

type Job = typeof backgroundJobs.$inferSelect;
export async function generateExport(db: Database, job: Job, signal: AbortSignal, storage: () => ExportStorage = createExportStorage) {
  const input = z.strictObject({ exportId: z.uuid(), phase: z.enum(["snapshot", "build"]) }).parse(job.payload);
  const live = sql`${exports.id} = ${input.exportId} and ${exports.ownerId} = ${job.ownerId} and ${exports.expiresAt} > now() and ${exports.status} in ('pending','running') and exists (select 1 from background_jobs j where j.id = ${job.id} and j.lease_token = ${job.leaseToken}::uuid and j.lease_expires_at > now())`;
  if (input.phase === "snapshot") {
    try { await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '2500ms'`);
      const [row] = await tx.select().from(exports).where(live).for("update");
      if (!row || row.snapshot) return;
      const records = {} as ExportRecords;
      let bytes = 0, count = 0;
      for (const table of exportTables) {
        signal.throwIfAborted();
        const columns = sql.join(exportColumns[table].split(" ").map((name) => sql.identifier(name)), sql`, `);
        const ownerColumn = sql.identifier(table === "user_preferences" ? "user_id" : "owner_id");
        const selection = sql`select ${columns} from ${sql.identifier(table)} where ${ownerColumn} = ${job.ownerId} limit ${maxExportRows - count + 1}`;
        const stats = await tx.execute(sql`select count(*)::int as count, coalesce(sum(octet_length(row_to_json(r)::text)),0)::bigint as bytes from (${selection}) r`);
        count += Number(stats.rows[0].count); bytes += Number(stats.rows[0].bytes);
        if (count > maxExportRows || bytes > maxExportBytes) throw new ExportLimitError("Workspace exceeds export limits. Use the independent backup for full recovery.");
        records[table] = (await tx.execute(selection)).rows;
      }
      const snapshot = buildWorkspaceExport(job.ownerId, records, new Date().toISOString());
      signal.throwIfAborted();
      await tx.update(exports).set({ status: "running", snapshot, updatedAt: new Date(), revision: sql`${exports.revision} + 1` }).where(live);
      await enqueueJob(tx, { ownerId: job.ownerId, kind: "export", deduplicationKey: `export:${input.exportId}:build`, payload: { exportId: input.exportId, phase: "build" } });
    }, { isolationLevel: "repeatable read" }); }
    catch (error) {
      if (!(error instanceof ExportLimitError)) throw error;
      await db.update(exports).set({ status: "failed", snapshot: null, failureSummary: "Workspace exceeds the 64 MiB / 200,000-record export limit. Use the independent backup for full recovery.", updatedAt: new Date() }).where(live);
    }
    return;
  }
  const [row] = await db.select().from(exports).where(live);
  if (!row?.snapshot || !row.outputObjectKey) return;
  const data = await zip(Buffer.from(JSON.stringify(row.snapshot)));
  signal.throwIfAborted();
  await storage().put(row.outputObjectKey, data, signal);
  signal.throwIfAborted();
  await db.update(exports).set({ status: "ready", snapshot: null, completedAt: new Date(), updatedAt: new Date(), revision: sql`${exports.revision} + 1` }).where(live);
}

export async function cleanupExport(db: Database, ownerId: string, raw: unknown, signal: AbortSignal, storage: () => ExportStorage = createExportStorage) {
  const input = z.strictObject({ exportId: z.uuid(), objectKey: z.string().nullable() }).parse(raw);
  if (input.objectKey !== `exports/${input.exportId}/workspace.json.gz`) throw new Error("Invalid export cleanup key.");
  const [row] = await db.select().from(exports).where(and(eq(exports.id, input.exportId), eq(exports.ownerId, ownerId)));
  if (!row || row.outputObjectKey !== input.objectKey) return;
  if (row.expiresAt.getTime() + 60_000 > Date.now()) throw new JobDeferred(new Date(row.expiresAt.getTime() + 60_000));
  await storage().remove(input.objectKey, signal);
  await db.update(exports).set({ status: "expired", snapshot: null, outputObjectKey: null, updatedAt: new Date(), revision: sql`${exports.revision} + 1` }).where(and(eq(exports.id, row.id), eq(exports.ownerId, ownerId)));
}
