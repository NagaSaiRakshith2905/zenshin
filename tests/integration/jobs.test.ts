import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { backgroundJobs } from "../../src/server/db/schema";
import { claimJob, enqueueJob, runJobs } from "../../src/server/jobs";
import { createTestDatabase } from "../support/postgres";

describe("durable jobs", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const fixture = createFixtureData("development", "jobs");
  const limits = { batch: 1, timeMs: 3000 };
  const add = (kind: string, maxAttempts = 3) => enqueueJob(database.db, { ownerId: fixture.owner.id, kind, deduplicationKey: randomUUID(), payload: {}, maxAttempts });
  const get = async (id: string) => (await database.db.select().from(backgroundJobs).where(eq(backgroundJobs.id, id)))[0];
  beforeAll(async () => { database = await createTestDatabase(); await insertFixtureData(database.db, fixture); }, 30_000);
  afterAll(async () => { await database?.dispose(); });
  it("deduplicates concurrent enqueue and rejects a changed payload", async () => {
    const input = { ownerId: fixture.owner.id, kind: "test", deduplicationKey: randomUUID(), payload: { value: 1 } };
    const jobs = await Promise.all([enqueueJob(database.db, input), enqueueJob(database.db, input)]);
    expect(jobs[0].id).toBe(jobs[1].id);
    await expect(enqueueJob(database.db, { ...input, payload: { value: 2 } })).rejects.toThrow();
    await database.db.delete(backgroundJobs).where(eq(backgroundJobs.id, jobs[0].id));
  });
  it("retries with a future attempt and eventually fails", async () => {
    const job = await add("retry", 2);
    const handler = vi.fn(async () => { throw new Error("provider secret"); });
    await runJobs(database.db, fixture.owner.id, { retry: handler }, limits);
    const first = await get(job.id);
    expect(first).toMatchObject({ state: "pending", attempts: 1 });
    expect(first.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(first.lastError).not.toContain("provider secret");
    await database.db.update(backgroundJobs).set({ availableAt: new Date(0) }).where(eq(backgroundJobs.id, job.id));
    await runJobs(database.db, fixture.owner.id, { retry: handler }, limits);
    expect(await get(job.id)).toMatchObject({ state: "failed", attempts: 2 });
  });
  it("recovers an interrupted lease and fences its previous token", async () => {
    const job = await add("interrupted");
    const first = await claimJob(database.db, fixture.owner.id);
    expect(first?.id).toBe(job.id);
    await database.db.update(backgroundJobs).set({ leaseExpiresAt: new Date(0) }).where(eq(backgroundJobs.id, job.id));
    const second = await claimJob(database.db, fixture.owner.id);
    expect(second).toMatchObject({ id: job.id, attempts: 2 });
    expect(second?.leaseToken).not.toBe(first?.leaseToken);
    const stale = await database.db.update(backgroundJobs).set({ state: "succeeded", leaseToken: null, leaseExpiresAt: null }).where(eq(backgroundJobs.leaseToken, first!.leaseToken!)).returning();
    expect(stale).toHaveLength(0);
    await database.db.delete(backgroundJobs).where(eq(backgroundJobs.id, job.id));
  });
  it("does not process a claimed job in overlapping invocations", async () => {
    const job = await add("overlap");
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const handler = vi.fn(async () => { started(); await gate; });
    const first = runJobs(database.db, fixture.owner.id, { overlap: handler }, limits);
    await entered;
    await runJobs(database.db, fixture.owner.id, { overlap: handler }, limits);
    release(); await first;
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await get(job.id)).toMatchObject({ state: "succeeded", attempts: 1 });
  });
});
