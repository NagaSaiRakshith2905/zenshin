import { z } from "zod";
import { assessBackupAge, backupManifestSchema, hash, objectReceipt, program } from "./common";
import { backupClients, createBackupStore, type BackupStore } from "./store";

export async function sendBackupAlert(subject: string, message: string, env = process.env) {
  const from = z.email().parse(env.BACKUP_ALERT_FROM_EMAIL), to = z.email().parse(env.BACKUP_ALERT_EMAIL);
  const input = { FromEmailAddress: from, Destination: { ToAddresses: [to] }, Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: message } } } } };
  await program("aws", ["sesv2", "send-email", "--region", z.string().min(1).parse(env.BACKUP_S3_REGION), "--cli-input-json", "file:///dev/stdin"], {
    AWS_ACCESS_KEY_ID: env.BACKUP_S3_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: env.BACKUP_S3_SECRET_ACCESS_KEY, AWS_EC2_METADATA_DISABLED: "true",
  }, JSON.stringify(input));
}
export async function monitorBackups(store: Pick<BackupStore, "get">, alert: (subject: string, message: string) => Promise<unknown>, now = Date.now()) {
  let capturedAt: string | undefined;
  let failed = false;
  try {
    const pointer = objectReceipt.extend({ capturedAt: z.iso.datetime(), completedAt: z.iso.datetime() }).parse(JSON.parse((await store.get("latest.json", undefined, 16384)).toString()));
    const bytes = await store.get(pointer.key, pointer.versionId, 32 * 1024 * 1024);
    if (bytes.byteLength !== pointer.size || hash(bytes) !== pointer.sha256) throw new Error("Backup manifest checksum mismatch.");
    const manifest = backupManifestSchema.parse(JSON.parse(bytes.toString())); capturedAt = manifest.capturedAt;
    if (manifest.completedAt !== pointer.completedAt || manifest.capturedAt !== pointer.capturedAt) throw new Error("Backup pointer mismatch.");
    try {
      const attempt = z.object({ status: z.enum(["failed", "succeeded"]), at: z.iso.datetime() }).parse(JSON.parse((await store.get("latest-attempt.json", undefined, 16384)).toString()));
      failed = attempt.status === "failed" && Date.parse(attempt.at) > Date.parse(manifest.completedAt);
    } catch { failed = true; }
  } catch { capturedAt = undefined; }
  const age = assessBackupAge(capturedAt, now);
  if (failed || age.state !== "healthy") await alert("Zenshin backup needs attention", `Latest complete database-plus-files backup: ${capturedAt ?? "unavailable"}. State: ${age.state}; age hours: ${age.ageHours?.toFixed(1) ?? "unknown"}. Latest attempt failed or could not be verified: ${failed}. Check the independent runner. No application content or credentials are included in this alert.`);
  return { ...age, failed };
}
export async function recordBackupFailure(env = process.env) {
  const store = createBackupStore(backupClients(env));
  await store.put("latest-attempt.json", JSON.stringify({ status: "failed", at: new Date().toISOString() }), new Date(Date.now() + 30 * 86400_000));
}
