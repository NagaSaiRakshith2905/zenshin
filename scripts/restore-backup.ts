import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
import { backupManifestSchema, hash, objectReceipt } from "./recovery/common";
import { backupClients, createBackupStore } from "./recovery/store";
import { applyBackupRestore } from "./recovery/restore";

const started = Date.now();
try {
  const args = process.argv.slice(2), id = args[0], folder = args[1] ? resolve(args[1]) : "";
  if (!id || !folder || args.some((v, i) => i > 1 && v !== "--apply")) throw new Error("Usage: backup:restore <snapshot UUID | latest> <new output directory> [--apply]");
  const store = createBackupStore(backupClients(process.env));
  let manifest;
  if (id === "latest") {
    const pointer = objectReceipt.passthrough().parse(JSON.parse((await store.get("latest.json", undefined, 16384)).toString()));
    const bytes = await store.get(pointer.key, pointer.versionId);
    if (hash(bytes) !== pointer.sha256 || bytes.length !== pointer.size) throw new Error("Manifest checksum mismatch.");
    manifest = backupManifestSchema.parse(JSON.parse(bytes.toString()));
  } else {
    manifest = backupManifestSchema.parse(JSON.parse((await store.get(`snapshots/${z.uuid().parse(id)}/manifest.json`)).toString()));
    if (manifest.snapshotId !== id) throw new Error("Snapshot identity mismatch.");
  }
  await mkdir(folder, { mode: 0o700 }); await mkdir(join(folder, "files"), { mode: 0o700 });
  await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
  await store.downloadFile(manifest.database, join(folder, "database.dump"));
  for (const file of manifest.attachments) await store.downloadFile(file, join(folder, "files", `${hash(file.objectKey)}.bin`));
  if (args.includes("--apply")) await applyBackupRestore(manifest, folder);
  const report = { snapshotId: manifest.snapshotId, checkedAt: new Date().toISOString(), durationMs: Date.now() - started, files: manifest.attachments.length, restored: args.includes("--apply") };
  await writeFile(join(folder, "restore-report.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.info(JSON.stringify({ event: "backup.restore_checked", ...report }));
} catch { console.error(JSON.stringify({ event: "backup.restore_failed", message: "Restore failed. Use a new isolated target/directory; verify checksums, credentials and runner configuration. No production target is accepted." })); process.exitCode = 1; }
