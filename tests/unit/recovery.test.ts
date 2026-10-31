import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { buildWorkspaceExport, exportColumns, exportTables, parseWorkspaceExport, type ExportRecords } from "../../src/lib/recovery/export-format";
import * as schema from "../../src/server/db/schema";
import { assessBackupAge, backupDatabaseUrl, backupManifestSchema, hash, restoreDatabaseUrl } from "../../scripts/recovery/common";
import { copyReadyFiles } from "../../scripts/recovery/backup";
import { monitorBackups, sendBackupAlert } from "../../scripts/recovery/monitor";
import { extractPortableExport, recoveredRows } from "../../scripts/recovery/restore";
import { boundedBody, type BackupStore } from "../../scripts/recovery/store";
import * as common from "../../scripts/recovery/common";

const ownerId = "github:42", projectId = randomUUID(), taskId = randomUUID(), noteId = randomUUID();
function records() {
  const data = Object.fromEntries(exportTables.map((table) => [table, []])) as unknown as ExportRecords;
  data.projects = [{ id: projectId, owner_id: ownerId, prefix: "TEST", name: "Recovery" }];
  data.tasks = [{ id: taskId, owner_id: ownerId, project_id: projectId, number: 42, parent_task_id: null }];
  data.notes = [{ id: noteId, owner_id: ownerId, task_id: taskId, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Saved progress" }] }] } }];
  return data;
}
const folders: string[] = [];
afterEach(async () => { for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });

it("exports only explicitly reviewed domain columns, never auth/keys/jobs", () => {
  const tables = Object.values(schema).filter((value) => { try { return getTableName(value as never); } catch { return false; } });
  for (const table of exportTables) {
    const definition = tables.find((value) => getTableName(value as never) === table);
    expect(definition, table).toBeDefined();
    const columns = Object.values(getTableColumns(definition as never)).map((column) => (column as { name: string }).name);
    for (const column of exportColumns[table].split(" ")) expect(columns, `${table}.${column}`).toContain(column);
  }
  expect(exportTables.some((name) => /session|account$|apikey|credentials|jobs|sync_state|webhook/.test(name))).toBe(false);
  const data = records(); data.projects[0].access_token = "private";
  expect(() => buildWorkspaceExport(ownerId, data, new Date().toISOString())).toThrow("Unexpected export column");
});
it("rejects cross-owner rows, partial tables and unsupported versions", () => {
  const data = records(); data.tasks[0].owner_id = "someone-else";
  expect(() => buildWorkspaceExport(ownerId, data, new Date().toISOString())).toThrow("owner mismatch");
  const complete = buildWorkspaceExport(ownerId, records(), new Date().toISOString());
  expect(() => parseWorkspaceExport({ ...complete, schemaVersion: 2 })).toThrow();
  expect(() => parseWorkspaceExport({ ...complete, records: { projects: [] } })).toThrow();
});
it("rejects invalid hierarchy and dependency cycles before portable recovery", () => {
  const data = records(), otherId = randomUUID();
  data.tasks.push({ id: otherId, owner_id: ownerId, project_id: projectId, number: 43 });
  data.task_dependencies = [{ owner_id: ownerId, project_id: projectId, task_id: taskId, prerequisite_task_id: otherId }, { owner_id: ownerId, project_id: projectId, task_id: otherId, prerequisite_task_id: taskId }];
  expect(() => buildWorkspaceExport(ownerId, data, new Date().toISOString())).toThrow("dependency cycle");
  data.task_dependencies = []; data.tasks[0].parent_task_id = otherId; data.tasks[1].parent_task_id = taskId;
  expect(() => buildWorkspaceExport(ownerId, data, new Date().toISOString())).toThrow("subtask hierarchy");
});
it("roundtrips task references, relationships, canonical notes and extracted Markdown", async () => {
  const data = parseWorkspaceExport(JSON.parse(JSON.stringify(buildWorkspaceExport(ownerId, records(), new Date().toISOString()))));
  expect(data.taskReferences[taskId]).toBe("TEST-42"); expect(data.records.tasks[0].project_id).toBe(projectId);
  const parent = await mkdtemp(join(tmpdir(), "zenshin-export-test-")); folders.push(parent);
  const folder = join(parent, "recovered"); await extractPortableExport(data, folder);
  expect(await readFile(join(folder, "notes", `${noteId}.md`), "utf8")).toBe("Saved progress");
  expect(JSON.parse(await readFile(join(folder, "workspace.json"), "utf8")).records.notes[0].content).toEqual(data.records.notes[0].content);
  await expect(extractPortableExport(data, folder)).rejects.toThrow();
});
it("rejects dangerous restore targets and pooled/override backup connections", () => {
  expect(restoreDatabaseUrl("postgresql://test@localhost/zenshin_restore_drill")).toContain("zenshin_restore_drill");
  for (const value of ["postgresql://owner@remote/zenshin_restore_drill", "postgresql://owner@localhost/production", "postgresql://owner@localhost/zenshin_restore_drill?host=remote"]) expect(() => restoreDatabaseUrl(value)).toThrow();
  expect(() => backupDatabaseUrl("postgresql://owner@ep-test-pooler.neon.tech/db")).toThrow();
  expect(() => backupDatabaseUrl("postgresql://owner@localhost/db?service=production")).toThrow();
});
it("preserves attribution in exports while normalizing restored actors and disabling automation", () => {
  expect(recoveredRows("activities", [{ actor_kind: "agent", actor_user_id: null, actor_credential_id: "old-key", action: "update_task" }])[0]).toMatchObject({ actor_kind: "system", actor_credential_id: null });
  expect(recoveredRows("project_github_rules", [{ enabled: true }])[0].enabled).toBe(false);
  expect(recoveredRows("github_installations", [{ status: "active" }])[0].status).toBe("unavailable");
  expect(recoveredRows("attachments", [{ state: "pending" }, { state: "ready" }]).map((r) => r.state)).toEqual(["failed", "ready"]);
});
it("copies only missing immutable files, extends reused version retention and rejects missing/short data", async () => {
  const object_key = `attachments/${randomUUID()}/${randomUUID()}`, until = new Date(Date.now() + 30 * 86400_000);
  const files = [{ id: randomUUID(), object_key, actual_size: 5, detected_media_type: "text/plain" }];
  const store = { head: vi.fn().mockResolvedValue(null), protect: vi.fn(), put: vi.fn(async (key, bytes) => ({ key, versionId: "v1", size: bytes.length, sha256: hash(bytes) })) };
  const read = vi.fn().mockResolvedValue(Buffer.from("hello"));
  const result = await copyReadyFiles(files, store, read, until);
  expect(result[0]).toMatchObject({ objectKey: object_key, size: 5, sha256: hash("hello"), versionId: "v1" });
  store.head.mockResolvedValue({ ...result[0], retainUntil: new Date(0) }); read.mockClear();
  await copyReadyFiles(files, store, read, until); expect(read).not.toHaveBeenCalled(); expect(store.protect).toHaveBeenCalledWith(expect.objectContaining({ versionId: "v1" }), until);
  store.head.mockResolvedValue(null); read.mockResolvedValue(Buffer.from("shorter"));
  await expect(copyReadyFiles(files, store, read, until)).rejects.toThrow("size mismatch");
  read.mockRejectedValue(new Error("Source gone")); await expect(copyReadyFiles(files, store, read, until)).rejects.toThrow("Source gone");
});
it("bounds streamed reads and tears down oversized provider bodies", async () => {
  const destroy = vi.fn();
  const body = { async *[Symbol.asyncIterator]() { yield Buffer.alloc(10); yield Buffer.alloc(10); }, destroy };
  await expect(boundedBody(body, 15)).rejects.toThrow("byte limit"); expect(destroy).toHaveBeenCalledOnce();
});
it("keeps healthy backups quiet and alerts for 18h/24h age, missing manifests and failures", async () => {
  const now = Date.parse("2026-10-30T12:00:00Z"), alert = vi.fn();
  expect(assessBackupAge("2026-10-30T10:00:00Z", now).state).toBe("healthy");
  expect(assessBackupAge("2026-10-29T18:00:00Z", now).state).toBe("warning");
  expect(assessBackupAge("2026-10-29T12:00:00Z", now).state).toBe("breached");
  expect(assessBackupAge("2026-11-01T12:00:00Z", now).state).toBe("missing");
  const capturedAt = "2026-10-30T10:00:00.000Z", completedAt = "2026-10-30T10:01:00.000Z";
  const snapshotId = randomUUID();
  const receipt = { key: `snapshots/${snapshotId}/database.dump`, versionId: "v1", size: 5, sha256: hash("hello") };
  const manifest = backupManifestSchema.parse({ schemaVersion: 1, snapshotId, capturedAt, completedAt, retainUntil: "2026-11-29T12:00:00.000Z", postgresMajor: 18, sourceBucket: "source", counts: Object.fromEntries(exportTables.map((table) => [table, 0])), database: receipt, attachments: [] });
  const bytes = Buffer.from(JSON.stringify(manifest));
  let attemptFailed = false;
  const get = vi.fn(async (key: string) => key === "latest.json" ? Buffer.from(JSON.stringify({ key: "manifest", versionId: "v1", size: bytes.length, sha256: hash(bytes), capturedAt, completedAt })) : key === "manifest" ? bytes : Buffer.from(JSON.stringify({ status: attemptFailed ? "failed" : "succeeded", at: attemptFailed ? "2026-10-30T11:00:00.000Z" : completedAt })));
  await monitorBackups({ get } as Pick<BackupStore, "get">, alert, now); expect(alert).not.toHaveBeenCalled();
  attemptFailed = true;
  await monitorBackups({ get } as Pick<BackupStore, "get">, alert, now); expect(alert).toHaveBeenCalledOnce();
  attemptFailed = false; alert.mockClear();
  await monitorBackups({ get } as Pick<BackupStore, "get">, alert, now + 24 * 3600_000); expect(alert).toHaveBeenCalledOnce();
  alert.mockClear(); get.mockRejectedValue(new Error("Unavailable"));
  const missing = await monitorBackups({ get } as Pick<BackupStore, "get">, alert, now); expect(missing.state).toBe("missing"); expect(alert).toHaveBeenCalledOnce();
});
it("builds an owner email alert without passing secrets on the command line", async () => {
  const run = vi.spyOn(common, "program").mockResolvedValue("");
  await sendBackupAlert("Backup failed", "Check backup age.", { NODE_ENV: "test", BACKUP_ALERT_FROM_EMAIL: "alerts@example.test", BACKUP_ALERT_EMAIL: "owner@example.test", BACKUP_S3_REGION: "ap-south-1", BACKUP_S3_ACCESS_KEY_ID: "synthetic", BACKUP_S3_SECRET_ACCESS_KEY: "synthetic-secret" });
  expect(run).toHaveBeenCalledWith("aws", expect.not.arrayContaining(["synthetic-secret"]), expect.any(Object), expect.stringContaining('"ToAddresses":["owner@example.test"]'));
});
