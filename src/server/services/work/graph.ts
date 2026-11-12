import "server-only";
import { sql } from "drizzle-orm";
import { assertProjectScope, type Actor } from "@/server/auth/access";
import type { DatabaseExecutor } from "@/server/db";
import { activity, decision, DomainError, invalid } from "./foundation";
import { patch, query, rows, type Rows } from "./store";

export async function loadGraph(db: DatabaseExecutor, project: Rows["projects"]) {
  // Always load after the project row lock for structural writes.
  const sections = await rows(db, "sections", sql`project_id = ${project.id} and owner_id = ${project.ownerId}`);
  const tasks = await rows(db, "tasks", sql`project_id = ${project.id} and owner_id = ${project.ownerId}`);
  const statuses = await rows(db, "task_statuses", sql`project_id = ${project.id} and owner_id = ${project.ownerId}`);
  const edges = await query<{ taskId: string; prerequisiteTaskId: string }>(db, sql`select task_id, prerequisite_task_id from task_dependencies where project_id = ${project.id} and owner_id = ${project.ownerId}`);
  return buildGraph(project, { sections, tasks, statuses, edges });
}
/** Pure graph rules shared by complete write graphs and scoped read projections. */
export function buildGraph(project: Rows["projects"], { sections, tasks, statuses, edges }: {
  sections: Rows["sections"][]; tasks: Rows["tasks"][]; statuses: Rows["task_statuses"][];
  edges: { taskId: string; prerequisiteTaskId: string }[];
}) {
  const section = (id: string) => sections.find((r) => r.id === id) ?? invalid("Choose a section in this project.");
  const task = (id: string) => tasks.find((r) => r.id === id) ?? invalid("Choose a task in this project.");
  const status = (id: string) => statuses.find((r) => r.id === id) ?? invalid("Choose a status in this project.");
  const ancestors = (id: string | null) => {
    const result: Rows["sections"][] = [];
    while (id) {
      if (result.some((s) => s.id === id)) throw new DomainError("hierarchy_limit", "Section hierarchy contains a cycle.");
      const row = section(id); result.push(row); id = row.parentSectionId;
    }
    return result;
  };
  const sectionIds = (id: string) => sections.filter((s) => ancestors(s.id).some((a) => a.id === id)).map((s) => s.id);
  const sectionArchived = (id: string | null) => Boolean(project.archivedAt || ancestors(id).some((s) => s.archivedAt));
  const archived = (t: Rows["tasks"]) => Boolean(t.archivedAt || sectionArchived(t.sectionId) || (t.parentTaskId && task(t.parentTaskId).archivedAt));
  const terminal = (t: Rows["tasks"]) => ["done", "canceled"].includes(status(t.statusId).category);
  const blockers = (t: Rows["tasks"]) => edges.filter((e) => e.taskId === t.id).map((e) => task(e.prerequisiteTaskId)).filter((p) => status(p.statusId).category !== "done" || archived(p)).map((p) => p.id);
  const progress = (subset: Rows["tasks"][]) => {
    const visible = subset.filter((t) => !archived(t));
    const leaves = visible.filter((t) => !tasks.some((c) => c.parentTaskId === t.id));
    const eligible = leaves.filter((t) => status(t.statusId).category !== "canceled");
    return { done: eligible.filter((t) => status(t.statusId).category === "done").length, total: eligible.length, state: visible.length === 0 ? "no_tasks" : eligible.length === 0 ? "no_active_tasks" : "active", unresolvedParents: visible.filter((t) => tasks.some((c) => c.parentTaskId === t.id) && !terminal(t)).length };
  };
  return { project, sections, tasks, statuses, edges, section, task, status, ancestors, sectionIds, sectionArchived, archived, terminal, blockers, progress };
}
export type Graph = Awaited<ReturnType<typeof loadGraph>>;
export function assertArchiveDependents(g: Graph, taskIds: string[], acknowledgeDependentIds: string[]) {
  const dependentIds = [...new Set(g.edges.filter((e) => taskIds.includes(e.prerequisiteTaskId) && !taskIds.includes(e.taskId)).map((e) => e.taskId))].filter((id) => { const t = g.task(id); return !g.archived(t) && !g.terminal(t); });
  if (dependentIds.some((id) => !acknowledgeDependentIds.includes(id))) decision("Archiving this work will affect active dependents.", { options: ["acknowledge_dependents"], affected: dependentIds.map((id) => ({ id, title: g.task(id).title })) });
}
export function assertArchiveChange(actor: Actor, g: Graph, before: boolean, after: boolean, taskIds: string[] = [], acknowledgements: string[] = []) {
  if (before === after) return;
  assertProjectScope(actor, g.project.ownerId, g.project.id, "archive");
  if (after) assertArchiveDependents(g, taskIds, acknowledgements);
}
export function validateSectionMove(g: Graph, id: string, parent: string | null) {
  const descendants = g.sectionIds(id);
  if (parent && descendants.includes(parent)) throw new DomainError("hierarchy_limit", "A section cannot be moved into its own subtree.");
  const base = g.ancestors(parent).length;
  const height = Math.max(...descendants.map((child) => g.ancestors(child).findIndex((s) => s.id === id) + 1));
  if (base + height > 3) throw new DomainError("hierarchy_limit", "Sections support at most three levels.");
}
export function validateTaskLocation(g: Graph, t: { id?: string; sectionId: string | null; parentTaskId: string | null }) {
  if (t.sectionId) g.section(t.sectionId);
  if (!t.parentTaskId) return;
  const parent = g.task(t.parentTaskId);
  if (parent.id === t.id || parent.parentTaskId || parent.sectionId !== t.sectionId || g.tasks.some((c) => c.parentTaskId === t.id)) invalid("Subtasks need a top-level parent in the same section and cannot have children.");
  if (t.id && g.edges.some((e) => (e.taskId === t.id && e.prerequisiteTaskId === parent.id) || (e.taskId === parent.id && e.prerequisiteTaskId === t.id))) invalid("A parent and its subtask cannot depend on each other.");
}
export async function reopen(db: DatabaseExecutor, actor: Actor, g: Graph, sectionIds: (string | null)[], allow: boolean, requestId: string) {
  const completed = [...new Map(sectionIds.flatMap((id) => g.ancestors(id)).filter((s) => s.lifecycle === "completed").map((s) => [s.id, s])).values()];
  if (completed.length && !allow) decision("Reopen the completed ancestors to add unfinished work.", { options: ["reopen_completed_ancestors"], affected: completed.map(({ id, name, revision }) => ({ id, name, revision })) });
  for (const row of completed) {
    const next = await patch(db, "sections", row, { lifecycle: "active" });
    Object.assign(row, next);
    await activity(db, actor, g.project.id, requestId, "reopen_section", { lifecycle: { from: "completed", to: "active" } }, { sectionId: row.id });
  }
}
export function validateDependency(g: Graph, taskId: string, prerequisiteId: string) {
  const t = g.task(taskId), p = g.task(prerequisiteId);
  if (taskId === prerequisiteId || t.parentTaskId === p.id || p.parentTaskId === t.id) invalid("Dependencies cannot link a task to itself, its parent, or its subtask.");
  const visited = new Set<string>();
  const pending = [prerequisiteId];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === taskId) throw new DomainError("dependency_cycle", "This dependency would create a cycle.");
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...g.edges.filter((e) => e.taskId === id).map((e) => e.prerequisiteTaskId));
  }
}
export async function rank(db: DatabaseExecutor, table: "tasks" | "sections", siblings: (Rows["tasks"] | Rows["sections"])[], beforeId: string | null) {
  siblings.sort((a, b) => BigInt(a.position) < BigInt(b.position) ? -1 : BigInt(a.position) > BigInt(b.position) ? 1 : a.id.localeCompare(b.id));
  const index = beforeId ? siblings.findIndex((r) => r.id === beforeId) : siblings.length;
  if (index < 0) invalid("The ordering target must be in the same local scope.");
  const left = index ? BigInt(siblings[index - 1].position) : 0n;
  const right = index < siblings.length ? BigInt(siblings[index].position) : left + 2048n;
  if (right - left > 1n) return (left + right) / 2n;
  // Rebalance only this local sibling scope, preserving all content revisions.
  for (let i = 0; i < siblings.length; i++) {
    await db.execute(sql`update ${sql.identifier(table)} set position = ${BigInt((i + 1) * 1024)} where id = ${siblings[i].id}`);
    siblings[i].position = BigInt((i + 1) * 1024);
  }
  return index ? BigInt(index * 1024 + 512) : 512n;
}
