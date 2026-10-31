import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/server/db/connection";
import { maxExportBytes, parseWorkspaceExport, exportTables } from "../src/lib/recovery/export-format";
import { backupManifestSchema, restoreDatabaseUrl } from "./recovery/common";
import { emptyDatabase, extractPortableExport, restoreFileBytes, restorePortableRows, verifyDatabase } from "./recovery/restore";

try {
  const args = process.argv.slice(2), file = args[0], folder = args[1] ? resolve(args[1]) : "";
  if (!file || !folder || args.some((v, i) => i > 1 && v !== "--apply")) throw new Error("Usage: export:recover <workspace.json[.gz]> <new output directory> [--apply]");
  const bytes = await readFile(resolve(file));
  if (bytes.length > maxExportBytes) throw new Error("Export exceeds byte limit.");
  const data = parseWorkspaceExport(JSON.parse((file.endsWith(".gz") ? gunzipSync(bytes, { maxOutputLength: maxExportBytes }) : bytes).toString()));
  await extractPortableExport(data, folder);
  if (args.includes("--apply")) {
    const connectionString = restoreDatabaseUrl(process.env.RESTORE_DATABASE_URL);
    const ready = data.records.attachments.filter((row) => row.state === "ready");
    if (ready.length) {
      const sourceFolder = process.env.RECOVERY_ATTACHMENT_DIR;
      if (!sourceFolder) throw new Error("Ready files require RECOVERY_ATTACHMENT_DIR containing a checked backup manifest and files.");
      const manifest = backupManifestSchema.parse(JSON.parse(await readFile(join(sourceFolder, "manifest.json"), "utf8")));
      if (process.env.RESTORE_R2_BUCKET === manifest.sourceBucket) throw new Error("Restore bucket must differ from the original source.");
      const files = ready.map((row) => {
        const file = manifest.attachments.find((item) => item.id === row.id && item.objectKey === row.object_key && item.size === Number(row.actual_size));
        if (!file) throw new Error("Export file is missing from the checked backup."); return file;
      });
      await restoreFileBytes(files, join(sourceFolder, "files"), process.env);
    }
    const connection = createDatabase(connectionString);
    try {
      const preflight = await connection.pool.connect();
      try { await emptyDatabase(preflight, true); } finally { preflight.release(); }
      await migrate(connection.db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
      const client = await connection.pool.connect();
      try {
        await restorePortableRows(client, data);
        await verifyDatabase(client, Object.fromEntries(exportTables.map((table) => [table, data.records[table].length])), ready.map((row) => ({ id: String(row.id), objectKey: String(row.object_key), size: Number(row.actual_size) })));
      } finally { client.release(); }
    } finally { await connection.pool.end(); }
  }
  console.info(JSON.stringify({ event: "export.recovered", applied: args.includes("--apply"), notes: data.records.notes.length, tasks: data.records.tasks.length }));
} catch { console.error(JSON.stringify({ event: "export.recovery_failed", message: "Export recovery failed. Check schema version, complete file manifest, limits and the isolated local restore target. Partial or secret-bearing exports are rejected." })); process.exitCode = 1; }
