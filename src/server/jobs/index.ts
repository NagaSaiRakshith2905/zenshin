import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "@/server/db/connection";
import { backgroundJobs } from "@/server/db/schema";

export class JobDeferred extends Error {
  constructor(public availableAt: Date) { super("Job waiting for provider backoff."); }
}

type Job = typeof backgroundJobs.$inferSelect;
type Handler = (job: Job, signal: AbortSignal) => Promise<void>;
export type Handlers = Record<string, Handler>;

export async function enqueueJob(db: DatabaseExecutor, job: typeof backgroundJobs.$inferInsert) {
  const [inserted] = await db.insert(backgroundJobs).values(job).onConflictDoNothing({ target: backgroundJobs.deduplicationKey }).returning();
  if (inserted) return inserted;
  const [existing] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.deduplicationKey, job.deduplicationKey));
  if (!existing || existing.ownerId !== job.ownerId || existing.kind !== job.kind || !isDeepStrictEqual(existing.payload, job.payload)) throw new Error("Job deduplication key conflict");
  return existing;
}

export function jobLimits(env: Record<string, string | undefined>) {
  const value = (input: string | undefined, fallback: number, max: number) => {
    if (!input) return fallback;
    const parsed = Number(input);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new Error("Invalid job execution limits");
    return parsed;
  };
  return { batch: value(env.JOBS_BATCH_LIMIT, 3, 10), timeMs: value(env.JOBS_TIME_BUDGET_MS, 3000, 5000) };
}

// A lease exceeds the maximum batch budget. Handlers must honor the signal and make external effects idempotent.
const leaseMs = 30_000;
export async function claimJob(db: Database, ownerId: string) {
  const token = randomUUID();
  const result = await db.execute(sql`
    UPDATE background_jobs SET state = 'running', lease_token = ${token},
      lease_expires_at = now() + ${leaseMs} * interval '1 millisecond', attempts = attempts + 1,
      updated_at = now(), revision = revision + 1
    WHERE id = (SELECT id FROM background_jobs WHERE owner_id = ${ownerId} AND attempts < max_attempts
      AND ((state = 'pending' AND available_at <= now()) OR (state = 'running' AND lease_expires_at <= now()))
      ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id`);
  const id = result.rows[0]?.id as string | undefined;
  if (!id) return undefined;
  const [job] = await db.select().from(backgroundJobs).where(and(eq(backgroundJobs.id, id), eq(backgroundJobs.leaseToken, token)));
  return job;
}

export async function runJobs(db: Database, ownerId: string, handlers: Handlers, limits = jobLimits(process.env)) {
  const deadline = Date.now() + limits.timeMs;
  // A final interrupted attempt must become visible as terminal, not remain running forever.
  await db.execute(sql`UPDATE background_jobs SET state = 'failed', lease_token = NULL, lease_expires_at = NULL,
    last_error = 'Job interrupted; retry limit reached.', updated_at = now(), revision = revision + 1
    WHERE id IN (SELECT id FROM background_jobs WHERE owner_id = ${ownerId} AND state = 'running' AND lease_expires_at <= now() AND attempts >= max_attempts FOR UPDATE SKIP LOCKED LIMIT ${limits.batch})`);
  for (let i = 0; i < limits.batch && Date.now() < deadline; i++) {
    const job = await claimJob(db, ownerId);
    if (!job) break;
    const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error("Handler unavailable");
      await handler(job, signal);
      if (signal.aborted) throw new Error("Time budget exceeded");
      await db.update(backgroundJobs).set({ state: "succeeded", completedAt: new Date(), leaseToken: null, leaseExpiresAt: null, lastError: null, updatedAt: new Date(), revision: sql`${backgroundJobs.revision} + 1` }).where(and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.leaseToken, job.leaseToken!)));
      console.info(JSON.stringify({ event: "job.succeeded", jobId: job.id, kind: job.kind, attempts: job.attempts }));
    } catch (error) {
      if (error instanceof JobDeferred) {
        await db.update(backgroundJobs).set({ state: "pending", availableAt: error.availableAt, attempts: Math.max(0, job.attempts - 1), leaseToken: null, leaseExpiresAt: null, lastError: "Waiting for provider backoff.", updatedAt: new Date() }).where(and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.leaseToken, job.leaseToken!)));
        continue;
      }
      const terminal = job.attempts >= job.maxAttempts;
      const delay = Math.min(3600_000, 1000 * 2 ** Math.min(job.attempts, 12)) * (0.5 + Math.random() * 0.5);
      await db.update(backgroundJobs).set({ state: terminal ? "failed" : "pending", availableAt: new Date(Date.now() + delay), leaseToken: null, leaseExpiresAt: null, lastError: "Job failed; check integration configuration and retry.", updatedAt: new Date(), revision: sql`${backgroundJobs.revision} + 1` }).where(and(eq(backgroundJobs.id, job.id), eq(backgroundJobs.leaseToken, job.leaseToken!)));
      console.error(JSON.stringify({ event: "job.failed", jobId: job.id, kind: job.kind, attempts: job.attempts, terminal }));
    }
  }
}
