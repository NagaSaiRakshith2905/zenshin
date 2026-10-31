import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { backupDatabaseUrl, backupManifestSchema, hash, objectKey, program } from "./common";
import { backupClients, boundedBody, createBackupStore, type BackupStore, type Receipt } from "./store";
import { exportTables, type ExportTable } from "../../src/lib/recovery/export-format";

export type ReadyFile = { id: string; object_key: string; actual_size: number; detected_media_type: string };
export async function copyReadyFiles(files: ReadyFile[], store: Pick<BackupStore, "head" | "protect" | "put">, read: (key: string) => Promise<Buffer>, until: Date) {
  const attachments = [];
  for (const file of files) {
    objectKey.parse(file.object_key);
    if (!Number.isSafeInteger(Number(file.actual_size)) || Number(file.actual_size) < 0 || Number(file.actual_size) > 20_000_000) throw new Error("Invalid ready attachment size.");
    const key = `objects/${hash(file.object_key)}`;
    const previous = await store.head(key);
    let receipt: Receipt;
    if (previous && previous.versionId && /^[a-f0-9]{64}$/.test(previous.sha256) && previous.size === Number(file.actual_size)) {
      receipt = { key, versionId: previous.versionId, size: previous.size, sha256: previous.sha256 };
      await store.protect(receipt, until);
    } else {
      const bytes = await read(file.object_key);
      if (bytes.byteLength !== Number(file.actual_size)) throw new Error("Attachment copy size mismatch.");
      receipt = await store.put(key, bytes, until);
    }
    attachments.push({ ...receipt, id: file.id, objectKey: file.object_key, mediaType: file.detected_media_type });
  }
  return attachments;
}
export async function runBackup(env = process.env) {
  const config = backupClients(env), store = createBackupStore(config);
  await store.verifyConfiguration();
  const source = config.r2();
  const connectionString = backupDatabaseUrl(env.BACKUP_DATABASE_URL);
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 15000 });
  const folder = await mkdtemp(join(tmpdir(), "zenshin-backup-"));
  const snapshotId = randomUUID(); const retainUntil = new Date(Date.now() + 30 * 86400_000);
  try {
    const client = await pool.connect();
    let capturedAt: string, postgresMajor: number, files: ReadyFile[];
    const counts = {} as Record<ExportTable, number>;
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await client.query("select pg_export_snapshot() as snapshot, current_timestamp as captured_at, current_setting('server_version_num')::int as version");
      const row = result.rows[0]; capturedAt = row.captured_at.toISOString(); postgresMajor = Math.floor(row.version / 10000);
      const installed = /(\d+)\./.exec(await program("pg_dump", ["--version"]));
      if (!installed || Number(installed[1]) < postgresMajor) throw new Error("pg_dump is older than the source PostgreSQL major version.");
      files = (await client.query("select id, object_key, actual_size, detected_media_type from attachments where state = 'ready' order by id")).rows;
      for (const table of exportTables) counts[table] = Number((await client.query(`select count(*) from "${table}"`)).rows[0].count);
      await program("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--snapshot=${row.snapshot}`, `--file=${join(folder, "database.dump")}`], { PGDATABASE: connectionString, PGCONNECT_TIMEOUT: "15" });
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    const attachments = await copyReadyFiles(files, store, async (key) => {
      const object = await source.client.send(new GetObjectCommand({ Bucket: source.bucket, Key: key }));
      return boundedBody(object.Body, 20_000_000);
    }, retainUntil);
    const database = await store.put(`snapshots/${snapshotId}/database.dump`, join(folder, "database.dump"), retainUntil, true);
    const manifest = backupManifestSchema.parse({ schemaVersion: 1, snapshotId, capturedAt, completedAt: new Date().toISOString(), retainUntil: retainUntil.toISOString(), postgresMajor, sourceBucket: source.bucket, counts, database, attachments });
    const manifestReceipt = await store.put(`snapshots/${snapshotId}/manifest.json`, JSON.stringify(manifest), retainUntil);
    // Publishing this pointer is the final step; incomplete snapshots never advance recoverable age.
    await store.put("latest-attempt.json", JSON.stringify({ status: "succeeded", at: new Date().toISOString(), snapshotId }), retainUntil);
    await store.put("latest.json", JSON.stringify({ ...manifestReceipt, capturedAt, completedAt: manifest.completedAt }), retainUntil);
    console.info(JSON.stringify({ event: "backup.complete", snapshotId, attachments: attachments.length, capturedAt }));
    return manifest;
  } finally { await pool.end(); await rm(folder, { recursive: true, force: true }); }
}
