import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buildWorkspaceExport, exportTables, type ExportRecords } from "../../src/lib/recovery/export-format";
import { program } from "./common";

const started = Date.now(), folder = await mkdtemp(join(tmpdir(), "zenshin-recovery-check-"));
try {
  const records = Object.fromEntries(exportTables.map((name) => [name, []])) as unknown as ExportRecords;
  const ownerId = "github:42", projectId = randomUUID(), sectionId = randomUUID(), taskId = randomUUID(), childId = randomUUID(), noteId = randomUUID();
  records.projects = [{ id: projectId, owner_id: ownerId, name: "Recovery fixture", prefix: "CHECK" }];
  records.sections = [{ id: sectionId, owner_id: ownerId, project_id: projectId, parent_section_id: null, name: "Version 1" }];
  records.tasks = [{ id: taskId, owner_id: ownerId, project_id: projectId, section_id: sectionId, parent_task_id: null, number: 1 }, { id: childId, owner_id: ownerId, project_id: projectId, section_id: sectionId, parent_task_id: taskId, number: 2 }];
  records.notes = [{ id: noteId, owner_id: ownerId, task_id: childId, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Recover this progress" }] }] } }];
  records.property_definitions = [{ id: randomUUID(), owner_id: ownerId, project_id: projectId, name: "Estimate", type: "number" }];
  const data = buildWorkspaceExport(ownerId, records, new Date().toISOString());
  const file = join(folder, "workspace.json.gz"), output = join(folder, "recovered");
  await writeFile(file, gzipSync(JSON.stringify(data)), { mode: 0o600 });
  await program(process.execPath, ["--import", "tsx", "scripts/recover-export.ts", file, output]);
  const restored = JSON.parse(await readFile(join(output, "workspace.json"), "utf8"));
  assert.equal(restored.taskReferences[childId], "CHECK-2");
  assert.equal(restored.records.tasks[1].parent_task_id, taskId);
  assert.deepEqual(restored.records.notes[0].content, records.notes[0].content);
  assert.equal(await readFile(join(output, "notes", `${noteId}.md`), "utf8"), "Recover this progress");
  assert.equal(restored.records.property_definitions[0].name, "Estimate");
  console.info(JSON.stringify({ event: "recovery.self_check_passed", mode: "portable-export-extraction", durationMs: Date.now() - started, databaseRestoreVerified: false }));
} finally { await rm(folder, { recursive: true, force: true }); }
