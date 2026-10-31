import { z } from "zod";
import { noteDocument, noteMarkdown } from "../contracts/notes";

const mutable = "id owner_id created_at updated_at revision";
const scoped = `${mutable} project_id`;
// Explicit column allowlists keep future auth/provider fields out of portable exports.
export const exportColumns = {
  projects: `${mutable} name prefix description next_task_number archived_at`,
  task_statuses: `${scoped} name category position is_default`,
  sections: `${scoped} parent_section_id name description lifecycle target_date position archived_at`,
  tasks: `${scoped} section_id parent_task_id number title description status_id priority due_date manual_blocked_reason position archived_at`,
  labels: `${scoped} name normalized_name color`,
  task_labels: "owner_id project_id task_id label_id",
  task_dependencies: "owner_id project_id task_id prerequisite_task_id",
  property_definitions: `${scoped} name normalized_name type icon position`,
  property_options: `${scoped} definition_id name normalized_name position`,
  task_property_values: "owner_id project_id task_id definition_id value_text value_number value_date value_bool option_id",
  task_property_option_values: "owner_id project_id task_id definition_id option_id",
  notes: `${mutable} project_id section_id task_id content plain_text`,
  note_revisions: "id owner_id note_id revision content actor_kind actor_user_id actor_credential_id saved_at",
  activities: "id owner_id project_id section_id task_id actor_kind actor_user_id actor_credential_id action changed_fields request_id created_at",
  attachments: `${mutable} project_id section_id task_id original_name declared_media_type declared_size detected_media_type actual_size object_key state upload_expires_at verified_at failure_summary actor_kind actor_user_id actor_credential_id`,
  github_installations: `${mutable} installation_id account_id account_name status`,
  github_repositories: `${mutable} installation_id github_repository_id name owner_name default_branch availability`,
  project_repositories: "owner_id project_id repository_id",
  github_items: `${mutable} repository_id github_item_id type number url title state is_draft is_merged head_sha remote_created_at remote_updated_at opened_at ready_at merged_at synced_at availability`,
  task_github_links: `${scoped} task_id repository_id github_item_id origin`,
  github_issue_imports: "id owner_id project_id github_item_id task_id imported_at",
  github_check_summaries: `${mutable} repository_id head_sha summary remote_updated_at synced_at`,
  project_github_rules: `${scoped} rule_kind enabled target_status_id target_category enabled_at`,
  github_automation_evaluations: "id owner_id project_id task_id rule_id event_fingerprint baseline_remote_states outcome resulting_task_revision evaluated_at",
  user_preferences: "user_id timezone theme default_task_view created_at updated_at revision",
} as const;
export type ExportTable = keyof typeof exportColumns;
export type ExportRecords = Record<ExportTable, Record<string, unknown>[]>;
export const exportTables = Object.keys(exportColumns) as ExportTable[];
export const maxExportBytes = 64 * 1024 * 1024;
export const maxExportRows = 200_000;
export class ExportLimitError extends Error {}
export const workspaceExportSchema = z.strictObject({
  schemaVersion: z.literal(1), ownerId: z.string().min(1).max(200), capturedAt: z.iso.datetime(),
  records: z.record(z.enum(exportTables), z.array(z.record(z.string(), z.unknown()))),
  taskReferences: z.record(z.uuid(), z.string()), markdownNotes: z.record(z.uuid(), z.string()),
});
export type WorkspaceExport = z.infer<typeof workspaceExportSchema>;

function validateStructure(records: ExportRecords) {
  const projects = new Map(records.projects.map((row) => [row.id, row]));
  const sections = new Map(records.sections.map((row) => [row.id, row]));
  const tasks = new Map(records.tasks.map((row) => [row.id, row]));
  if (projects.size !== records.projects.length || sections.size !== records.sections.length || tasks.size !== records.tasks.length) throw new Error("Duplicate exported entity IDs.");
  for (const section of sections.values()) {
    if (!projects.has(section.project_id)) throw new Error("Invalid exported project.");
    let parent = section, depth = 1;
    while (parent.parent_section_id != null) {
      const next = sections.get(parent.parent_section_id);
      if (++depth > 3 || !next || next.project_id !== section.project_id) throw new Error("Invalid exported section hierarchy.");
      parent = next;
    }
  }
  for (const task of tasks.values()) {
    if (!projects.has(task.project_id) || (task.section_id != null && sections.get(task.section_id)?.project_id !== task.project_id)) throw new Error("Invalid exported task location.");
    if (task.parent_task_id != null) {
      const parent = tasks.get(task.parent_task_id);
      if (!parent || parent.id === task.id || parent.parent_task_id != null || parent.project_id !== task.project_id || parent.section_id !== task.section_id) throw new Error("Invalid exported subtask hierarchy.");
    }
  }
  const degrees = new Map([...tasks.keys()].map((id) => [id, 0]));
  const edges = new Map<unknown, unknown[]>();
  for (const edge of records.task_dependencies) {
    const task = tasks.get(edge.task_id), prerequisite = tasks.get(edge.prerequisite_task_id);
    if (!task || !prerequisite || task.project_id !== prerequisite.project_id || task.parent_task_id === prerequisite.id || prerequisite.parent_task_id === task.id) throw new Error("Invalid exported dependency.");
    degrees.set(edge.task_id, degrees.get(edge.task_id)! + 1);
    const children = edges.get(edge.prerequisite_task_id) ?? [];
    children.push(edge.task_id); edges.set(edge.prerequisite_task_id, children);
  }
  const queue = [...degrees].filter(([, count]) => count === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) for (const id of edges.get(queue[i]) ?? []) { const next = degrees.get(id)! - 1; degrees.set(id, next); if (!next) queue.push(id); }
  if (queue.length !== tasks.size) throw new Error("Exported dependency cycle.");
}

export function buildWorkspaceExport(ownerId: string, records: ExportRecords, capturedAt: string): WorkspaceExport {
  let count = 0;
  for (const table of exportTables) {
    if (!Array.isArray(records[table])) throw new Error("Incomplete export table set.");
    const allowed = new Set(exportColumns[table].split(" "));
    count += records[table].length;
    for (const row of records[table]) {
      if (Object.keys(row).some((key) => !allowed.has(key))) throw new Error("Unexpected export column.");
      if (row[table === "user_preferences" ? "user_id" : "owner_id"] !== ownerId) throw new Error("Export owner mismatch.");
    }
  }
  if (count > maxExportRows) throw new ExportLimitError("Export exceeds the row limit.");
  validateStructure(records);
  const prefixes = new Map(records.projects.map((row) => [row.id, row.prefix]));
  const taskReferences = Object.fromEntries(records.tasks.map((row) => [String(row.id), `${prefixes.get(row.project_id)}-${row.number}`]));
  const markdownNotes = Object.fromEntries(records.notes.map((row) => [String(row.id), noteMarkdown(noteDocument.parse(row.content))]));
  for (const row of records.note_revisions) noteDocument.parse(row.content);
  const result = workspaceExportSchema.parse({ schemaVersion: 1, ownerId, capturedAt, records, taskReferences, markdownNotes });
  if (Buffer.byteLength(JSON.stringify(result)) > maxExportBytes) throw new ExportLimitError("Export exceeds the 64 MiB limit. Use the independent backup for full recovery.");
  return result;
}
export function parseWorkspaceExport(value: unknown) {
  const data = workspaceExportSchema.parse(value);
  // Rebuild derived views and check the allowlist/ownership rather than trusting input metadata.
  return buildWorkspaceExport(data.ownerId, data.records, data.capturedAt);
}
