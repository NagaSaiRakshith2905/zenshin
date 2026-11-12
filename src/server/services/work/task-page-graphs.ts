import "server-only";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/server/db";
import { buildGraph } from "./graph";
import { query, rows } from "./store";

/** Called only with the authorized page, inside its repeatable-read transaction.
 * Batch across projects; fetch selected tasks, their children, prerequisites and
 * parents needed for archive/reference rules. Never use this projection to write.
 */
export async function loadTaskPageGraphs(db: DatabaseExecutor, ownerId: string, page: { id: string; projectId: string }[]) {
  if (!page.length) return [];
  const ids = sql.join(page.map((t) => sql`${t.id}::uuid`), sql`, `);
  const projects = sql.join([...new Set(page.map((t) => t.projectId))].map((id) => sql`${id}::uuid`), sql`, `);
  const scope = sql`owner_id = ${ownerId} and project_id in (${projects})`;
  const selectedOrPrerequisite = sql`id in (${ids}) or id in (select prerequisite_task_id from task_dependencies where ${scope} and task_id in (${ids}))`;
  const projectRows = await rows(db, "projects", sql`owner_id = ${ownerId} and id in (${projects})`);
  const sections = await rows(db, "sections", scope);
  const statuses = await rows(db, "task_statuses", scope);
  const tasks = await rows(db, "tasks", sql`${scope} and (${selectedOrPrerequisite} or parent_task_id in (${ids}) or id in (select parent_task_id from tasks where ${scope} and (${selectedOrPrerequisite})))`);
  const edges = await query<{ projectId: string; taskId: string; prerequisiteTaskId: string }>(db, sql`select project_id, task_id, prerequisite_task_id from task_dependencies where ${scope} and (task_id in (${ids}) or prerequisite_task_id in (${ids}))`);
  return projectRows.map((project) => buildGraph(project, {
    sections: sections.filter((s) => s.projectId === project.id), statuses: statuses.filter((s) => s.projectId === project.id),
    tasks: tasks.filter((t) => t.projectId === project.id), edges: edges.filter((e) => e.projectId === project.id),
  }));
}
