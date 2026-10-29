import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type HumanActor, type AgentActor } from "../../src/server/auth/access";
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { attachments, backgroundJobs, agentCredentials } from "../../src/server/db/schema";
import { cleanupMarginMs } from "../../src/lib/contracts/attachments";
import type { AttachmentStorage, ObjectMetadata } from "../../src/server/integrations/r2";
import { createAttachmentService, cleanupAttachment } from "../../src/server/services/attachments";
import { createWorkService } from "../../src/server/services/work";
import { jobHandlers } from "../../src/server/jobs/handlers";
import { createTestDatabase } from "../support/postgres";

describe("private attachment lifecycle", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const fixture = createFixtureData("development", "attachments");
  const owner: HumanActor = { kind: "human", ownerId: fixture.owner.id, credentialId: null, projectIds: null, scopes: actionScopes };
  const projectId = fixture.projects[0].id!;
  const target = { kind: "task", id: fixture.tasks[0].id! };
  const objects = new Map<string, { bytes: Buffer; head: ObjectMetadata }>();
  const storage: AttachmentStorage = {
    signUpload: vi.fn(async (key, type) => ({ url: `https://storage.invalid/${key}`, headers: { "Content-Type": type, "If-None-Match": "*" } })),
    head: vi.fn(async (key) => objects.get(key)?.head ?? null),
    inspect: vi.fn(async (key) => objects.get(key)!.bytes),
    signDownload: vi.fn(async (key) => `https://storage.invalid/${key}?signed=download`),
    delete: vi.fn(async (key) => { objects.delete(key); }),
  };
  const service = () => createAttachmentService(database.db, () => storage);
  const input = (extra = {}) => ({ ...target, originalName: "hello.txt", declaredSize: 5, declaredMediaType: "text/plain", ...extra });
  const begin = (extra = {}) => service().begin(owner, input(extra), randomUUID(), randomUUID());
  const row = async (id: string) => (await database.db.select().from(attachments).where(eq(attachments.id, id)))[0];
  async function put(id: string, text = "hello", head: Partial<ObjectMetadata> = {}) {
    const file = await row(id); const bytes = Buffer.from(text);
    objects.set(file.objectKey, { bytes, head: { size: bytes.length, mediaType: file.declaredMediaType, etag: '"immutable"', ...head } });
  }
  beforeAll(async () => { database = await createTestDatabase(); await insertFixtureData(database.db, fixture); }, 30_000);
  afterAll(async () => { await database?.dispose(); });
  it("replays initiation once, detects changed retries, verifies actual bytes and finalizes idempotently", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([service().begin(owner, input(), "start", key), service().begin(owner, input(), "retry", key)]);
    expect(a.attachment.id).toBe(b.attachment.id);
    expect(a.upload?.headers["If-None-Match"]).toBe("*");
    expect(a).not.toHaveProperty("objectKey");
    await expect(service().begin(owner, input({ originalName: "other.txt" }), "retry", key)).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(service().download(owner, { id: a.attachment.id })).rejects.toMatchObject({ code: "conflict" });
    await put(a.attachment.id);
    const ready = await service().finalize(owner, { id: a.attachment.id }, "finalize");
    expect(ready).toMatchObject({ state: "ready", actualSize: 5, detectedMediaType: "text/plain" });
    expect(await service().finalize(owner, { id: ready.id }, "repeat")).toEqual(ready);
    expect((await service().download(owner, { id: ready.id })).url).toContain("signed=download");
    const activities = await database.pool.query("select action from activities where changed_fields->>'attachmentId' = $1", [ready.id]);
    expect(activities.rows.map((r) => r.action).sort()).toEqual(["attachment_ready", "attachment_upload_started"]);
  });
  it("supports project, section and task placement with bounded target-only pagination", async () => {
    for (const place of [{ kind: "project", id: projectId }, { kind: "section", id: fixture.sections[0].id! }]) {
      const started = await begin(place);
      const list = await service().list(owner, place);
      expect(list.items.map((file) => file.id)).toContain(started.attachment.id);
    }
    const list = await service().list(owner, { ...target, limit: 1 });
    expect(list.items).toHaveLength(1);
    const next = await begin();
    const paged = await service().list(owner, { ...target, limit: 1 });
    expect(paged.items[0].id).toBe(next.attachment.id);
    expect(paged.nextCursor).toBe(next.attachment.id);
    expect((await service().list(owner, { ...target, cursor: paged.nextCursor })).items.map((file) => file.id)).not.toContain(next.attachment.id);
  });
  it("isolates grants and read/upload scopes and denies agent removal", async () => {
    const [credential] = await database.db.insert(agentCredentials).values({ ownerId: owner.ownerId, displayName: "Files", scopes: ["read", "upload"] }).returning();
    const actor: AgentActor = { kind: "agent", ownerId: owner.ownerId, credentialId: credential.id, projectIds: [projectId], scopes: ["read", "upload"] };
    const allowed = await service().begin(actor, input(), "agent-upload", randomUUID());
    await put(allowed.attachment.id);
    const ready = await service().finalize(actor, { id: allowed.attachment.id }, "agent-finalize");
    await expect(service().download(actor, { id: ready.id })).resolves.toHaveProperty("url");
    const denied = { ...actor, projectIds: [fixture.projects[1].id!] };
    for (const action of [() => service().list(denied, target), () => service().download(denied, { id: ready.id }), () => service().finalize(denied, { id: ready.id }, "denied"), () => service().begin(denied, input(), "denied", randomUUID())]) await expect(action()).rejects.toMatchObject({ code: "not_found" });
    await expect(service().begin({ ...actor, scopes: ["read"] }, input(), "denied", randomUUID())).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().download({ ...actor, scopes: ["upload"] }, { id: ready.id })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().remove(actor, { id: ready.id, expectedRevision: ready.revision }, "denied", randomUUID())).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().list({ ...owner, ownerId: "another-owner" }, target)).rejects.toMatchObject({ code: "not_found" });
  });
  it.each(["oversize", "size", "mime", "binary", "missing", "expired"])("rejects %s uploads and durably defers cleanup past reusable URL expiry", async (kind) => {
    const started = await begin(); const id = started.attachment.id;
    await put(id, kind === "binary" ? "a\0bcd" : "hello", kind === "oversize" ? { size: 20_000_001 } : kind === "size" ? { size: 4 } : kind === "mime" ? { mediaType: "text/html" } : {});
    if (kind === "missing") { objects.delete((await row(id)).objectKey); await database.db.update(attachments).set({ uploadExpiresAt: new Date(Date.now() - 1000) }).where(eq(attachments.id, id)); }
    if (kind === "expired") await database.db.update(attachments).set({ uploadExpiresAt: new Date(Date.now() - cleanupMarginMs - 1) }).where(eq(attachments.id, id));
    await expect(service().finalize(owner, { id }, "reject")).rejects.toMatchObject({ code: "upload_rejected" });
    expect(await row(id)).toMatchObject({ state: "failed", verifiedAt: null });
    await expect(service().download(owner, { id })).rejects.toMatchObject({ code: "conflict" });
    const [job] = await database.db.select().from(backgroundJobs).where(eq(backgroundJobs.deduplicationKey, `attachment-failed:${id}`));
    expect(job.payload).toMatchObject({ attachmentId: id });
    if (kind !== "expired" && kind !== "missing") expect(job.availableAt.getTime()).toBeGreaterThan(Date.now() + cleanupMarginMs);
    await expect(service().finalize(owner, { id }, "reject-retry")).rejects.toMatchObject({ code: "upload_rejected" });
  });
  it("keeps a missing upload pending until its URL expires", async () => {
    const started = await begin(); const id = started.attachment.id;
    await expect(service().finalize(owner, { id }, "missing")).rejects.toMatchObject({ code: "conflict", message: "The file has not arrived yet. Retry the upload." });
    expect((await row(id)).state).toBe("pending");
    await put(id); expect((await service().finalize(owner, { id }, "retry")).state).toBe("ready");
  });
  it("retains a retryable state after a provider outage", async () => {
    const started = await begin(); await put(started.attachment.id);
    const failing = createAttachmentService(database.db, () => ({ ...storage, head: async () => { throw new Error("secret-provider-error"); } }));
    await expect(failing.finalize(owner, { id: started.attachment.id }, "unavailable")).rejects.toMatchObject({ code: "integration_unavailable", message: "File storage is unavailable. Retry this operation." });
    expect((await row(started.attachment.id)).state).toBe("pending");
    expect((await service().finalize(owner, { id: started.attachment.id }, "retry")).state).toBe("ready");
  });
  it("reclaims an interrupted verifier and rejects overlapping finalization", async () => {
    const started = await begin(); const id = started.attachment.id; await put(id);
    await database.db.update(attachments).set({ state: "verifying", updatedAt: new Date() }).where(eq(attachments.id, id));
    await expect(service().finalize(owner, { id }, "overlap")).rejects.toMatchObject({ code: "conflict" });
    await database.db.update(attachments).set({ updatedAt: new Date(Date.now() - 61_000) }).where(eq(attachments.id, id));
    expect((await service().finalize(owner, { id }, "reclaim")).state).toBe("ready");
  });
  it("holds no database locks during storage inspection and fences removal against finalization", async () => {
    const started = await begin(); const id = started.attachment.id; await put(id);
    let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const slow = createAttachmentService(database.db, () => ({ ...storage, head: async (key, signal) => { entered(); await gate; return storage.head(key, signal); } }));
    const finalized = slow.finalize(owner, { id }, "slow");
    const outcome = finalized.catch((error) => error);
    await waiting;
    const current = await row(id);
    const key = randomUUID();
    try {
      const receipt = await service().remove(owner, { id, expectedRevision: current.revision }, "remove", key);
      expect(receipt).toMatchObject({ deleted: true });
      expect(await service().remove(owner, { id, expectedRevision: current.revision }, "retry-remove", key)).toEqual(receipt);
    } finally { release(); }
    expect(await outcome).toMatchObject({ code: "conflict" });
    expect(await row(id)).toBeUndefined();
  });
  it("retains cleanup jobs when storage fails and deletes expired bytes idempotently", async () => {
    const started = await begin(); const id = started.attachment.id; await put(id);
    const expires = new Date(Date.now() - cleanupMarginMs - 1000);
    await database.db.update(attachments).set({ uploadExpiresAt: expires }).where(eq(attachments.id, id));
    const current = await row(id); const payload = { attachmentId: id, objectKey: current.objectKey };
    await expect(cleanupAttachment(database.db, owner.ownerId, payload, AbortSignal.timeout(1000), { ...storage, delete: async () => { throw new Error("outage"); } })).rejects.toThrow("outage");
    expect((await row(id)).state).toBe("failed");
    expect(objects.has(current.objectKey)).toBe(true);
    await cleanupAttachment(database.db, owner.ownerId, payload, AbortSignal.timeout(1000), storage);
    await cleanupAttachment(database.db, owner.ownerId, payload, AbortSignal.timeout(1000), storage);
    expect(objects.has(current.objectKey)).toBe(false);
    // Maintenance also recovers abandoned verifying states, using only persisted records.
    const stale = await begin();
    await database.db.update(attachments).set({ state: "verifying", uploadExpiresAt: expires }).where(eq(attachments.id, stale.attachment.id));
    const job = (await database.db.select().from(backgroundJobs).limit(1))[0];
    await jobHandlers(database.db).maintenance({ ...job, ownerId: owner.ownerId }, AbortSignal.timeout(1000));
    expect(await database.db.select().from(backgroundJobs).where(eq(backgroundJobs.deduplicationKey, `attachment-expired:${stale.attachment.id}`))).toHaveLength(1);
  });
  it("queues file deletion before target cascades and never deletes ready files during abandoned-upload cleanup", async () => {
    const work = createWorkService(database.db);
    const task = await work.execute(owner, "create_task", { projectId, title: "Delete with files" }, "create") as { id: string; revision: number };
    const started = await begin({ id: task.id }); const id = started.attachment.id; await put(id);
    const ready = await service().finalize(owner, { id }, "ready");
    const current = await row(id);
    await cleanupAttachment(database.db, owner.ownerId, { attachmentId: id, objectKey: current.objectKey }, AbortSignal.timeout(1000), storage);
    expect(objects.has(current.objectKey)).toBe(true);
    expect(ready.state).toBe("ready");
    const archived = await work.execute(owner, "archive_item", { kind: "task", id: task.id, expectedRevision: task.revision }, "archive") as { revision: number };
    await work.execute(owner, "delete_item", { kind: "task", id: task.id, expectedRevision: archived.revision, confirmation: { name: "Delete with files", taskCount: 1, sectionCount: 0, fileCount: 1 } }, "delete");
    expect(await row(id)).toBeUndefined();
    const [job] = await database.db.select().from(backgroundJobs).where(and(eq(backgroundJobs.ownerId, owner.ownerId), eq(backgroundJobs.deduplicationKey, `attachment-delete:${id}`)));
    expect(job.payload).toMatchObject({ objectKey: current.objectKey });
    expect(job.availableAt.getTime()).toBeGreaterThan(Date.now() + cleanupMarginMs);
  });
  it("caps concurrent unexpired uploads across projects and permits replay", async () => {
    await database.db.update(attachments).set({ uploadExpiresAt: new Date(0) }).where(eq(attachments.ownerId, owner.ownerId));
    const key = randomUUID(); const first = await service().begin(owner, input(), "first", key);
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => begin(i % 2 ? { kind: "project", id: projectId } : {})));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(19);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await service().begin(owner, input(), "replay", key)).attachment.id).toBe(first.attachment.id);
    await expect(begin()).rejects.toMatchObject({ code: "validation_error" });
    await database.db.update(attachments).set({ state: "failed" }).where(eq(attachments.id, first.attachment.id));
    await expect(begin()).resolves.toHaveProperty("upload");
  });
});
