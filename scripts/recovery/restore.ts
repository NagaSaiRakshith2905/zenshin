import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { exportColumns, exportTables, type WorkspaceExport } from "../../src/lib/recovery/export-format";
import { hash, objectKey, program, restoreDatabaseUrl, type BackupManifest } from "./common";
import { boundedBody } from "./store";

export async function emptyDatabase(client: PoolClient, migrated: boolean) {
  const tables = (await client.query("select schemaname, tablename from pg_tables where schemaname not in ('pg_catalog','information_schema') and schemaname not like 'pg_toast%' ")).rows as { schemaname: string; tablename: string }[];
  if (!migrated && tables.length) throw new Error("Restore target must be a new empty database.");
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  for (const table of tables) {
    if (table.schemaname === "drizzle" && table.tablename === "__drizzle_migrations") continue;
    if ((await client.query(`select 1 from ${quote(table.schemaname)}.${quote(table.tablename)} limit 1`)).rows.length) throw new Error("Restore target contains data. Nothing was overwritten.");
  }
}
export function recoveredRows(table: keyof typeof exportColumns, rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const result = { ...row };
    if ("actor_kind" in result) { result.actor_kind = "system"; result.actor_user_id = null; result.actor_credential_id = null; }
    if (table === "project_github_rules") result.enabled = false;
    if (table === "github_installations") result.status = "unavailable";
    if (table === "attachments" && result.state !== "ready") { result.state = "failed"; result.failure_summary = "Upload interrupted before recovery."; }
    return result;
  });
}
export async function restorePortableRows(client: PoolClient, data: WorkspaceExport) {
  await client.query("BEGIN");
  try {
    await emptyDatabase(client, true);
    await client.query('insert into "user" (id,name,email,email_verified) values ($1,$2,$3,false)', [data.ownerId, "Recovered owner", `${hash(data.ownerId).slice(0,24)}@recovery.invalid`]);
    const owner = /^github:([1-9]\d*)$/.exec(data.ownerId);
    if (owner) await client.query("insert into account (id,account_id,provider_id,user_id) values ($1,$2,'github',$3)", [`recovered:${data.ownerId}`, owner[1], data.ownerId]);
    for (const table of exportTables) {
      const rows = recoveredRows(table, data.records[table]);
      if (!rows.length) continue;
      const columns = exportColumns[table].split(" ").map((name) => `"${name}"`).join(",");
      await client.query(`insert into "${table}" (${columns}) select ${columns} from jsonb_populate_recordset(null::"${table}", $1::jsonb)`, [JSON.stringify(rows)]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}
export async function verifyDatabase(client: PoolClient, counts: Record<string, number>, attachments: { id: string; objectKey: string; size: number }[]) {
  for (const table of exportTables) {
    if (Number((await client.query(`select count(*) from "${table}"`)).rows[0].count) !== counts[table]) throw new Error("Restored domain row count mismatch.");
  }
  const ready = (await client.query("select id, object_key, actual_size from attachments where state='ready'")).rows;
  if (ready.length !== attachments.length || ready.some((row) => !attachments.some((file) => file.id === row.id && file.objectKey === row.object_key && file.size === Number(row.actual_size)))) throw new Error("Restored attachment manifest mismatch.");
  const tree = await client.query("with recursive tree as (select id, parent_section_id, array[id] as path, false as cycle from sections union all select s.id,s.parent_section_id, t.path || s.id, s.id = any(t.path) from tree t join sections s on s.id=t.parent_section_id where not t.cycle and cardinality(t.path) <= 4) select 1 from tree where cycle or cardinality(path)>3 limit 1");
  const nested = await client.query("select 1 from tasks t join tasks p on p.id=t.parent_task_id where p.parent_task_id is not null or p.section_id is distinct from t.section_id limit 1");
  if (tree.rows.length || nested.rows.length) throw new Error("Restored hierarchy validation failed.");
}
export async function restoreFileBytes(files: { objectKey: string; size: number; sha256: string; mediaType: string }[], folder: string, env: NodeJS.ProcessEnv) {
  if (!files.length) return;
  const bucket = z.string().regex(/^zenshin-restore-[a-z0-9-]+$/).parse(env.RESTORE_R2_BUCKET);
  if (bucket === env.BACKUP_R2_BUCKET) throw new Error("Restore bucket must differ from the source bucket.");
  const endpoint = z.string().regex(/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/).parse(env.RESTORE_R2_ENDPOINT);
  const client = new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId: z.string().min(1).parse(env.RESTORE_R2_ACCESS_KEY_ID), secretAccessKey: z.string().min(1).parse(env.RESTORE_R2_SECRET_ACCESS_KEY) }, requestChecksumCalculation: "WHEN_REQUIRED", maxAttempts: 2 });
  for (const file of files) {
    objectKey.parse(file.objectKey);
    const bytes = await readFile(join(folder, `${hash(file.objectKey)}.bin`));
    if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw new Error("Recovery file checksum mismatch.");
    try { await client.send(new PutObjectCommand({ Bucket: bucket, Key: file.objectKey, Body: bytes, ContentLength: bytes.length, ContentType: file.mediaType, IfNoneMatch: "*" })); }
    catch (error) { if (!(error && typeof error === "object" && "$metadata" in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 412)) throw error; }
    const actual = await client.send(new GetObjectCommand({ Bucket: bucket, Key: file.objectKey }));
    if (hash(await boundedBody(actual.Body, 20_000_000)) !== file.sha256) throw new Error("Restored R2 bytes failed verification.");
  }
}
export async function scrubRestoredCredentials(client: PoolClient) {
  await client.query("BEGIN");
  try {
    await client.query('delete from session; delete from verification; delete from apikey; delete from rate_limit; delete from agent_project_grants; update agent_credentials set revoked_at=now(), api_key_id=null; update account set access_token=null, refresh_token=null, id_token=null, password=null, access_token_expires_at=null, refresh_token_expires_at=null');
    await client.query("delete from background_jobs; update exports set status='expired', snapshot=null, output_object_key=null; delete from idempotency_records; delete from github_webhook_deliveries; update project_github_rules set enabled=false; update github_installations set status='unavailable', request_lease_token=null, request_lease_expires_at=null; update attachments set state='failed', failure_summary='Upload interrupted before recovery.' where state <> 'ready'");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}
export async function applyBackupRestore(manifest: BackupManifest, folder: string, env = process.env) {
  const connectionString = restoreDatabaseUrl(env.RESTORE_DATABASE_URL);
  if (env.RESTORE_R2_BUCKET === manifest.sourceBucket) throw new Error("Restore bucket must differ from the original source.");
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await emptyDatabase(client, false);
    const installed = /(\d+)\./.exec(await program("pg_restore", ["--version"]));
    if (!installed || Number(installed[1]) < manifest.postgresMajor) throw new Error("pg_restore is older than the dump's PostgreSQL major version.");
    await restoreFileBytes(manifest.attachments, join(folder, "files"), env);
    const target = new URL(connectionString);
    await program("pg_restore", ["--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", `--dbname=${decodeURIComponent(target.pathname.slice(1))}`, join(folder, "database.dump")], {
      PGHOST: target.hostname.replace(/^\[|\]$/g, ""), PGPORT: target.port || "5432", PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGCONNECT_TIMEOUT: "15",
    });
    await scrubRestoredCredentials(client);
    await verifyDatabase(client, manifest.counts, manifest.attachments);
  } finally { client.release(); await pool.end(); }
}
export async function extractPortableExport(data: WorkspaceExport, folder: string) {
  await mkdir(folder, { mode: 0o700 });
  await mkdir(join(folder, "notes"), { mode: 0o700 });
  await writeFile(join(folder, "workspace.json"), JSON.stringify(data, null, 2), { flag: "wx", mode: 0o600 });
  for (const [id, markdown] of Object.entries(data.markdownNotes)) await writeFile(join(folder, "notes", `${z.uuid().parse(id)}.md`), markdown, { flag: "wx", mode: 0o600 });
  for (const table of exportTables) await writeFile(join(folder, `${table}.json`), JSON.stringify(data.records[table], null, 2), { flag: "wx", mode: 0o600 });
}
