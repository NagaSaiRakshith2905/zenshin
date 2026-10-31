import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type AgentActor, type HumanActor } from "../../src/server/auth/access";
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { exports, backgroundJobs } from "../../src/server/db/schema";
import { createExportService, generateExport, cleanupExport } from "../../src/server/services/exports";
import type { ExportStorage } from "../../src/server/integrations/export-storage";
import { claimJob, runJobs } from "../../src/server/jobs";
import { parseWorkspaceExport, exportTables } from "../../src/lib/recovery/export-format";
import { restorePortableRows, verifyDatabase } from "../../scripts/recovery/restore";
import { createTestDatabase } from "../support/postgres";

describe("owner-only durable exports and portable recovery", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const fixture = createFixtureData("development", "exports");
  const owner: HumanActor = { kind: "human", ownerId: fixture.owner.id, credentialId: null, scopes: actionScopes, projectIds: null };
  const bytes = new Map<string, Uint8Array>();
  const storage: ExportStorage = { put: vi.fn(async (key, body) => { bytes.set(key, body); }), download: vi.fn(async (key) => `https://storage.invalid/${key}?private`), remove: vi.fn(async (key) => { bytes.delete(key); }) };
  const service = () => createExportService(database.db, () => storage);
  const handlers = () => ({ export: (job: typeof backgroundJobs.$inferSelect, signal: AbortSignal) => generateExport(database.db, job, signal, () => storage) });
  const batch = () => runJobs(database.db, owner.ownerId, handlers(), { batch: 1, timeMs: 5000 });
  beforeAll(async () => { database = await createTestDatabase(); await insertFixtureData(database.db, fixture); }, 30_000);
  afterAll(async () => { await database?.dispose(); });

  it("denies agent access even with every scope, including export download", async () => {
    const agent: AgentActor = { kind: "agent", ownerId: owner.ownerId, credentialId: randomUUID(), scopes: actionScopes, projectIds: fixture.projects.map((p) => p.id!) };
    await expect(service().request(agent, { idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().list(agent, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().download(agent, { id: randomUUID() })).rejects.toMatchObject({ code: "forbidden" });
  });
  it("deduplicates requests, limits active exports, captures consistent data and excludes credentials", async () => {
    const id = randomUUID();
    const [a, b] = await Promise.all([service().request(owner, { idempotencyKey: id }), service().request(owner, { idempotencyKey: id })]);
    expect(a.id).toBe(b.id); expect(a.id).toBe(id);
    await expect(service().request(owner, { idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "conflict" });
    await expect(service().download(owner, { id })).rejects.toMatchObject({ code: "conflict" });
    await batch();
    const [captured] = await database.db.select().from(exports).where(eq(exports.id, id));
    expect(captured.status).toBe("running"); expect(captured.snapshot).toBeTruthy();
    await database.pool.query("update projects set name = 'Changed after snapshot' where id = $1", [fixture.projects[0].id]);
    await batch();
    const [ready] = await database.db.select().from(exports).where(eq(exports.id, id));
    expect(ready.status).toBe("ready"); expect(ready.snapshot).toBeNull();
    const data = parseWorkspaceExport(JSON.parse(gunzipSync(bytes.get(ready.outputObjectKey!)!).toString()));
    expect(data.records.projects[0].name).not.toBe("Changed after snapshot");
    expect(data.records.tasks).toHaveLength(fixture.tasks.length);
    expect(Object.keys(data.records)).toEqual(exportTables);
    expect(data.records).not.toHaveProperty("apikey"); expect(data.records).not.toHaveProperty("account");
    expect(await service().download(owner, { id })).toHaveProperty("url");
    await expect(service().download({ ...owner, ownerId: "another-owner" }, { id })).rejects.toMatchObject({ code: "not_found" });
    expect((await service().list(owner, { limit: 1 })).items[0]).not.toHaveProperty("outputObjectKey");
    expect((await service().list(owner, { limit: 1 })).items[0]).not.toHaveProperty("snapshot");

    const target = await createTestDatabase();
    try {
      const client = await target.pool.connect();
      try {
        await restorePortableRows(client, data);
        await verifyDatabase(client, Object.fromEntries(exportTables.map((table) => [table, data.records[table].length])), []);
        expect((await client.query("select number, parent_task_id from tasks order by number")).rows).toHaveLength(fixture.tasks.length);
        await expect(restorePortableRows(client, data)).rejects.toThrow("contains data");
      } finally { client.release(); }
    } finally { await target.dispose(); }
  });
  it("retains snapshots for retry and refuses publication by an obsolete lease", async () => {
    const row = await service().request(owner, { idempotencyKey: randomUUID() });
    await batch();
    const job = await claimJob(database.db, owner.ownerId); expect(job?.payload.phase).toBe("build");
    await database.db.update(backgroundJobs).set({ leaseToken: randomUUID() }).where(eq(backgroundJobs.id, job!.id));
    const calls = vi.mocked(storage.put).mock.calls.length;
    await generateExport(database.db, job!, AbortSignal.timeout(5000), () => storage);
    expect(vi.mocked(storage.put)).toHaveBeenCalledTimes(calls);
    await database.pool.query("update background_jobs set state='pending', lease_token=null, lease_expires_at=null, available_at=now() where id=$1", [job!.id]);
    vi.mocked(storage.put).mockRejectedValueOnce(new Error("Temporary storage failure"));
    await batch();
    expect((await database.db.select().from(exports).where(eq(exports.id, row.id)))[0].snapshot).toBeTruthy();
    await database.pool.query("update background_jobs set available_at=now() where id=$1", [job!.id]);
    await batch();
    expect((await database.db.select().from(exports).where(eq(exports.id, row.id)))[0].status).toBe("ready");
  });
  it("denies expired downloads immediately and removes artifacts and snapshots after the lease margin", async () => {
    const rows = await database.db.select().from(exports);
    for (const row of rows) {
      await database.db.update(exports).set({ expiresAt: new Date(Date.now() - 120_000) }).where(eq(exports.id, row.id));
      await expect(service().download(owner, { id: row.id })).rejects.toMatchObject({ code: "conflict" });
      await cleanupExport(database.db, owner.ownerId, { exportId: row.id, objectKey: row.outputObjectKey }, AbortSignal.timeout(5000), () => storage);
      expect(bytes.has(row.outputObjectKey!)).toBe(false);
      expect((await database.db.select().from(exports).where(eq(exports.id, row.id)))[0]).toMatchObject({ status: "expired", outputObjectKey: null, snapshot: null });
    }
  });
});
