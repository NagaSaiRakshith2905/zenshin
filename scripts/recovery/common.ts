import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { z } from "zod";
import { exportTables } from "../../src/lib/recovery/export-format";

export const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export async function fileHash(path: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}
export const objectKey = z.string().regex(/^attachments\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const objectReceipt = z.strictObject({ key: z.string().min(1), versionId: z.string().min(1), size: z.number().int().nonnegative(), sha256: digest });
export const backupManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), snapshotId: z.uuid(), capturedAt: z.iso.datetime(), completedAt: z.iso.datetime(), retainUntil: z.iso.datetime(),
  postgresMajor: z.number().int().positive(), sourceBucket: z.string().min(1),
  counts: z.record(z.enum(exportTables), z.number().int().nonnegative()),
  database: objectReceipt.extend({ size: z.number().int().min(1).max(2 * 1024 ** 3) }),
  attachments: z.array(objectReceipt.extend({ id: z.uuid(), objectKey, size: z.number().int().min(0).max(20_000_000), mediaType: z.string().max(100) })).max(200_000),
}).superRefine((value, ctx) => {
  if (value.database.key !== `snapshots/${value.snapshotId}/database.dump` || value.attachments.some((file) => file.key !== `objects/${hash(file.objectKey)}`)) ctx.addIssue({ code: "custom", message: "Backup object keys do not match the manifest." });
  if (new Set(value.attachments.map((file) => file.id)).size !== value.attachments.length || new Set(value.attachments.map((file) => file.objectKey)).size !== value.attachments.length) ctx.addIssue({ code: "custom", message: "Duplicate backup attachments." });
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export function restoreDatabaseUrl(value: string | undefined) {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new Error("Set RESTORE_DATABASE_URL to an isolated local zenshin_restore_* database."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/^\/zenshin_restore_[a-z0-9_]+$/.test(url.pathname) || url.search || url.hash) throw new Error("Restore requires an isolated local zenshin_restore_* database without connection overrides.");
  return url.href;
}
export function backupDatabaseUrl(value: string | undefined) {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new Error("Set BACKUP_DATABASE_URL to an unpooled PostgreSQL connection."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hostname.includes("-pooler") || url.pathname === "/" || url.hash || [...url.searchParams.keys()].some((key) => key !== "sslmode")) throw new Error("Backup requires an unpooled PostgreSQL connection without connection overrides.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.searchParams.set("sslmode", "verify-full");
  return url.href;
}
export function program(command: string, args: string[], env: Record<string, string | undefined> = {}, input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { env: { PATH: process.env.PATH, LANG: "C", ...env, NODE_ENV: process.env.NODE_ENV ?? "production" }, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { if (output.length < 65536) output += String(chunk); });
    child.stderr.resume();
    child.on("error", () => reject(new Error(`${command} could not start.`)));
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} failed. Inspect runner configuration; credentials and database output are suppressed.`)));
    child.stdin.on("error", () => {}); child.stdin.end(input);
  });
}
export function assessBackupAge(capturedAt: string | undefined, now = Date.now()) {
  const time = Date.parse(capturedAt ?? "");
  if (!Number.isFinite(time) || time > now + 300_000) return { state: "missing" as const, ageHours: null };
  const ageHours = Math.max(0, (now - time) / 3600_000);
  return { state: ageHours >= 24 ? "breached" as const : ageHours >= 18 ? "warning" as const : "healthy" as const, ageHours };
}
