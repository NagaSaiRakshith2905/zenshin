import "server-only";
import { sql } from "drizzle-orm";
import { decodeTaskQuery } from "@/lib/contracts/task-query";
import { taskPage } from "./task-query";
import { searchPage } from "./search";
import { id, listInput, wireValue } from "@/lib/contracts/work";
import { assertProjectScope, type Actor } from "@/server/auth/access";
import type { Database, DatabaseExecutor } from "@/server/db";
import { DomainError, invalid, owned } from "./foundation";
import { loadGraph, type Graph } from "./graph";
import { query, rows, type Rows } from "./store";
import { loadTaskPageGraphs } from "./task-page-graphs";

export type Resource = "projects" | "sections" | "tasks" | "statuses" | "labels" | "properties" | "options" | "activity" | "my-work" | "notes" | "search";
export const resources: Resource[] = ["projects", "sections", "tasks", "statuses", "labels", "properties", "options", "activity", "my-work", "notes", "search"];
function page<T extends { id: string }>(items: T[], cursor: string | undefined, limit: number) {
  const start = cursor ? items.findIndex((item) => item.id === cursor) + 1 : 0;
  if (cursor && !start) invalid("This cursor is no longer available. Restart the list.");
  const selected = items.slice(start, start + limit);
  const hasMore = start + limit < items.length;
  return { items: selected, nextCursor: hasMore ? selected.at(-1)!.id : null, hasMore };
}
const byPosition = (a: { position: bigint; id: string }, b: { position: bigint; id: string }) => BigInt(a.position) < BigInt(b.position) ? -1 : BigInt(a.position) > BigInt(b.position) ? 1 : a.id.localeCompare(b.id);
async function relations(db: DatabaseExecutor, projectIds: string[], taskIds: string[]) {
  if (!taskIds.length) return { labels: [], values: [], multiple: [] };
  const ids = sql.join(taskIds.map((id) => sql`${id}::uuid`), sql`, `);
  const projects = sql.join(projectIds.map((id) => sql`${id}::uuid`), sql`, `);
  return {
    labels: await query<{ taskId: string; labelId: string }>(db, sql`select task_id, label_id from task_labels where project_id in (${projects}) and task_id in (${ids})`),
    values: await query<{ taskId: string; definitionId: string; valueText: string | null; valueNumber: string | null; valueDate: string | null; valueBool: boolean | null; optionId: string | null }>(db, sql`select * from task_property_values where project_id in (${projects}) and task_id in (${ids})`),
    multiple: await query<{ taskId: string; definitionId: string; optionId: string }>(db, sql`select task_id, definition_id, option_id from task_property_option_values where project_id in (${projects}) and task_id in (${ids})`),
  };
}
async function taskModelContext(db: DatabaseExecutor, ownerId: string, projectIds: string[], taskIds: string[]) {
  const [preferences] = await query<{ timezone: string }>(db, sql`select timezone from user_preferences where user_id = ${ownerId}`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: preferences?.timezone ?? "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const today = ["year", "month", "day"].map((type) => parts.find((p) => p.type === type)!.value).join("-");
  return { today, related: await relations(db, projectIds, taskIds) };
}
async function taskModels(db: DatabaseExecutor, g: Graph, tasks: Rows["tasks"][], context?: Awaited<ReturnType<typeof taskModelContext>>) {
  const { today, related } = context ?? await taskModelContext(db, g.project.ownerId, [g.project.id], tasks.map((t) => t.id));
  return tasks.map((t) => {
    const dependencyBlockers = g.blockers(t);
    const properties: Record<string, unknown> = {};
    for (const value of related.values.filter((v) => v.taskId === t.id)) properties[value.definitionId] = value.valueText ?? (value.valueNumber === null ? null : Number(value.valueNumber)) ?? value.valueDate ?? value.valueBool ?? value.optionId;
    for (const value of related.multiple.filter((v) => v.taskId === t.id)) properties[value.definitionId] = [...(properties[value.definitionId] as string[] | undefined ?? []), value.optionId];
    return { ...t, parentReference: t.parentTaskId ? `${g.project.prefix}-${g.task(t.parentTaskId).number}` : null, reference: `${g.project.prefix}-${t.number}`, category: g.status(t.statusId).category, statusName: g.status(t.statusId).name, effectiveArchived: g.archived(t), overdue: Boolean(t.dueDate && t.dueDate < today && !g.terminal(t) && !g.archived(t)), blocked: !g.terminal(t) && Boolean(t.manualBlockedReason || dependencyBlockers.length), dependencyBlockers, prerequisiteTaskIds: g.edges.filter((e) => e.taskId === t.id).map((e) => e.prerequisiteTaskId), dependentTaskIds: g.edges.filter((e) => e.prerequisiteTaskId === t.id).map((e) => e.taskId), labelIds: related.labels.filter((l) => l.taskId === t.id).map((l) => l.labelId), properties, breadcrumbs: g.ancestors(t.sectionId).reverse().map(({ id, name }) => ({ id, name })), ...(g.tasks.some((c) => c.parentTaskId === t.id) ? { progress: g.progress(g.tasks.filter((c) => c.parentTaskId === t.id)) } : {}) };
  });
}
export function createWorkReader(db: Database) {
  const list = async (actor: Actor, resource: Resource, raw: unknown) => {
    if (["tasks", "my-work", "search"].includes(resource)) {
      const input = decodeTaskQuery(raw as Record<string, unknown>);
      return db.transaction(async (tx) => {
        if (resource === "search") return wireValue(await searchPage(tx, actor, input));
        const result = await taskPage(tx, actor, input, resource === "my-work");
        if (!result.items.length) return wireValue(result);
        const graphs = await loadTaskPageGraphs(tx, actor.ownerId, result.items);
        const context = await taskModelContext(tx, actor.ownerId, graphs.map((g) => g.project.id), result.items.map((t) => t.id));
        const models = new Map<string, Awaited<ReturnType<typeof taskModels>>[number] & { projectName: string }>();
        for (const graph of graphs) {
          const selected = result.items.filter((t) => t.projectId === graph.project.id).map((t) => graph.task(t.id));
          for (const model of await taskModels(tx, graph, selected, context)) models.set(model.id, { ...model, projectName: graph.project.name });
        }
        return wireValue({ ...result, items: result.items.map((t) => models.get(t.id)!) });
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    }
    const input = listInput.parse(raw);
    // Repeatable read keeps hierarchy, relationships and rows from one coherent snapshot.
    return db.transaction(async (tx) => {
      if (resource === "projects") {
        if (actor.kind !== "human" && !actor.scopes.includes("read")) assertProjectScope(actor, actor.ownerId, "", "read");
        const permitted = actor.kind === "human" ? sql`true` : actor.projectIds.length ? sql`id in (${sql.join(actor.projectIds.map((p) => sql`${p}::uuid`), sql`, `)})` : sql`false`;
        const projects = await rows(tx, "projects", sql`owner_id = ${actor.ownerId} and ${permitted} ${input.includeArchived ? sql`` : sql`and archived_at is null`} order by created_at, id`);
        return wireValue(page(projects, input.cursor, input.limit));
      }
      if (!input.projectId) invalid("Select a project for this list.");
      const project = await owned(tx, actor, "projects", input.projectId);
      assertProjectScope(actor, project.ownerId, project.id, "read");
      if (resource === "sections") {
        const g = await loadGraph(tx, project);
        return wireValue(page(g.sections.filter((s) => input.includeArchived || !(s.archivedAt || g.sectionArchived(s.parentSectionId))).sort(byPosition).map((s) => ({ ...s, effectiveArchived: Boolean(s.archivedAt || g.sectionArchived(s.parentSectionId)), breadcrumbs: g.ancestors(s.parentSectionId).reverse().map(({ id, name }) => ({ id, name })), progress: g.progress(g.tasks.filter((t) => t.sectionId && g.sectionIds(s.id).includes(t.sectionId))) })), input.cursor, input.limit));
      }
      if (resource === "statuses") return wireValue(page((await rows(tx, "task_statuses", sql`owner_id = ${actor.ownerId} and project_id = ${project.id}`)).sort(byPosition), input.cursor, input.limit));
      if (resource === "activity") {
        const result = await query<{ id: string }>(tx, sql`select * from activities where owner_id = ${actor.ownerId} and project_id = ${project.id} ${input.taskId ? sql`and task_id = ${input.taskId}` : sql``} ${input.cursor ? sql`and (created_at, id) < (select created_at, id from activities where id = ${input.cursor} and owner_id = ${actor.ownerId} and project_id = ${project.id})` : sql``} order by created_at desc, id desc limit ${input.limit + 1}`);
        const items = result.slice(0, input.limit);
        return wireValue({ items, nextCursor: result.length > input.limit ? items.at(-1)!.id : null, hasMore: result.length > input.limit });
      }
      const table = resource === "labels" ? "labels" : resource === "options" ? "property_options" : "property_definitions";
      const values = await rows(tx, table, sql`owner_id = ${actor.ownerId} and project_id = ${project.id}`);
      const sorted = values.sort((a, b) => "position" in a && "position" in b ? byPosition(a as { position: bigint; id: string }, b as { position: bigint; id: string }) : a.id.localeCompare(b.id));
      const result = page(sorted, input.cursor, input.limit);
      if (resource === "properties") {
        const options = await rows(tx, "property_options", sql`project_id = ${project.id} and owner_id = ${actor.ownerId}`);
        const used = await query<{ definitionId: string }>(tx, sql`select definition_id from task_property_values where project_id = ${project.id} union select definition_id from task_property_option_values where project_id = ${project.id}`);
        return wireValue({ ...result, items: result.items.map((definition) => ({ ...definition, hasValues: used.some((v) => v.definitionId === definition.id), options: options.filter((o) => o.definitionId === definition.id).sort(byPosition) })) });
      }
      return wireValue(result);
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  };
  return {
    list,
    async get(actor: Actor, resource: Resource, targetId: string, includeArchived = false) {
      id.parse(targetId);
      return db.transaction(async (tx) => {
        const table = resource === "projects" || resource === "sections" || resource === "tasks" ? resource : resource === "statuses" ? "task_statuses" : resource === "labels" ? "labels" : resource === "properties" ? "property_definitions" : resource === "options" ? "property_options" : null;
        if (!table) invalid("Read activity through its project list.");
        const target = await owned(tx, actor, table, targetId);
        const project = table === "projects" ? target as Rows["projects"] : await owned(tx, actor, "projects", (target as { projectId: string }).projectId);
        assertProjectScope(actor, project.ownerId, project.id, "read");
        const g = await loadGraph(tx, project);
        const effectiveArchived = table === "tasks" ? g.archived(target as Rows["tasks"]) : table === "sections" ? Boolean((target as Rows["sections"]).archivedAt || g.sectionArchived((target as Rows["sections"]).parentSectionId)) : Boolean(project.archivedAt);
        if (effectiveArchived && !includeArchived) throw new DomainError("not_found", "This item is archived. Include archived work to read it.");
        if (table === "tasks") return wireValue((await taskModels(tx, g, [target as Rows["tasks"]]))[0]);
        if (table === "projects") return wireValue({ ...target, effectiveArchived, progress: g.progress(g.tasks), sectionCount: g.sections.length, taskCount: g.tasks.length });
        if (table === "sections") return wireValue({ ...target, effectiveArchived, breadcrumbs: g.ancestors((target as Rows["sections"]).parentSectionId).reverse().map(({ id, name }) => ({ id, name })), progress: g.progress(g.tasks.filter((t) => t.sectionId && g.sectionIds(target.id).includes(t.sectionId))) });
        if (table === "property_definitions") { const used = await query<{ definitionId: string }>(tx, sql`select definition_id from task_property_values where definition_id = ${target.id} union select definition_id from task_property_option_values where definition_id = ${target.id}`); return wireValue({ ...target, hasValues: used.length > 0, options: (await rows(tx, "property_options", sql`definition_id = ${target.id}`)).sort(byPosition) }); }
        return wireValue(target);
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async resolveTask(actor: Actor, reference: string, includeArchived = false) {
      const match = /^([A-Z][A-Z0-9]{1,9})-([1-9]\d*)$/.exec(reference);
      if (!match) invalid("Use a task reference such as TRACK-42.");
      const [project] = await rows(db, "projects", sql`owner_id = ${actor.ownerId} and prefix = ${match[1]}`);
      if (!project || (actor.kind !== "human" && !actor.projectIds.includes(project.id))) throw new DomainError("not_found", "Task was not found.");
      assertProjectScope(actor, project.ownerId, project.id, "read");
      const [task] = await rows(db, "tasks", sql`project_id = ${project.id} and number = ${Number(match[2])}`);
      if (!task) throw new DomainError("not_found", "Task was not found.");
      return this.get(actor, "tasks", task.id, includeArchived);
    },
  };
}
