import "server-only";
import { sql } from "drizzle-orm";
import { normalizeName } from "@/lib/contracts/work";
import { assertProjectScope } from "@/server/auth/access";
import { activity, checkRevision, decision, DomainError, invalid, owned, ownerOnly } from "./foundation";
import { rank, reopen, validateSectionMove } from "./graph";
import { insert, patch, query, rows } from "./store";
import type { Handlers, Context } from "./types";

export const planning: Pick<Handlers, "update_project" | "create_section" | "update_section" | "move_section"> = {
  async update_project({ db, actor, graph: g }, input) {
    ownerOnly(actor); checkRevision(g.project, input.expectedRevision);
    return patch(db, "projects", g.project, { name: input.name, description: input.description });
  },
  async create_section({ db, actor, graph: g, requestId }, input) {
    if (g.ancestors(input.parentSectionId).length >= 3) throw new DomainError("hierarchy_limit", "Sections support at most three levels.");
    if (input.lifecycle === "completed") assertProjectScope(actor, g.project.ownerId, g.project.id, "complete");
    else await reopen(db, actor, g, [input.parentSectionId], input.reopenCompletedAncestors, requestId);
    return insert(db, "sections", { ownerId: actor.ownerId, projectId: g.project.id, name: input.name, description: input.description, parentSectionId: input.parentSectionId, targetDate: input.targetDate, lifecycle: input.lifecycle, position: await rank(db, "sections", g.sections.filter((s) => s.parentSectionId === input.parentSectionId), null) });
  },
  async update_section({ db, actor, graph: g, requestId }, input) {
    const row = g.section(input.id); checkRevision(row, input.expectedRevision);
    if (input.lifecycle === "completed") assertProjectScope(actor, actor.ownerId, g.project.id, "complete");
    if (input.lifecycle && input.lifecycle !== "completed") await reopen(db, actor, g, [row.parentSectionId], input.reopenCompletedAncestors, requestId);
    return patch(db, "sections", row, { name: input.name, description: input.description, lifecycle: input.lifecycle, targetDate: input.targetDate });
  },
  async move_section({ db, actor, graph: g, requestId }, input) {
    const row = g.section(input.id); checkRevision(row, input.expectedRevision);
    validateSectionMove(g, row.id, input.parentSectionId);
    const subtree = g.sectionIds(row.id);
    const unfinished = g.sections.some((s) => subtree.includes(s.id) && s.lifecycle !== "completed") || g.tasks.some((t) => t.sectionId && subtree.includes(t.sectionId) && !g.terminal(t));
    if (unfinished) await reopen(db, actor, g, [input.parentSectionId], input.reopenCompletedAncestors, requestId);
    return patch(db, "sections", row, { parentSectionId: input.parentSectionId, position: await rank(db, "sections", g.sections.filter((s) => s.id !== row.id && s.parentSectionId === input.parentSectionId), input.beforeId) });
  },
};
async function affectedCount({ db, graph: g }: Context, definitionId: string, optionId?: string) {
  const [result] = await query<{ count: number }>(db, sql`select count(distinct task_id)::int as count from (
    select task_id from task_property_values where project_id = ${g.project.id} and definition_id = ${definitionId} ${optionId ? sql`and option_id = ${optionId}` : sql``}
    union select task_id from task_property_option_values where project_id = ${g.project.id} and definition_id = ${definitionId} ${optionId ? sql`and option_id = ${optionId}` : sql``}
  ) used`);
  return result.count;
}
async function reviseAffected(context: Context, condition: import("drizzle-orm").SQL, action: string, definitionId: string) {
  const { db, actor, graph: g, requestId } = context;
  const affected = await rows(db, "tasks", sql`project_id = ${g.project.id} and id in (${condition})`);
  for (const task of affected) {
    await patch(db, "tasks", task, {});
    await activity(db, actor, g.project.id, requestId, action, { definitionId }, { taskId: task.id });
  }
}
export const configuration: Pick<Handlers, "create_status" | "update_status" | "delete_status" | "create_label" | "update_label" | "delete_label" | "create_property" | "update_property" | "delete_property" | "create_option" | "update_option" | "delete_option"> = {
  async create_status({ db, actor, graph: g }, input) {
    ownerOnly(actor);
    return insert(db, "task_statuses", { ownerId: actor.ownerId, projectId: g.project.id, name: input.name, category: input.category, position: g.statuses.reduce((n, s) => BigInt(s.position) > n ? BigInt(s.position) : n, 0n) + 1024n });
  },
  async update_status({ db, actor, graph: g }, input) {
    ownerOnly(actor); const row = g.status(input.id); checkRevision(row, input.expectedRevision);
    if (input.isDefault === false && row.isDefault) invalid("Choose another Backlog default before changing the default status.");
    if (input.isDefault) {
      if (row.category !== "backlog") invalid("The default status must be Backlog.");
      for (const other of g.statuses.filter((s) => s.isDefault && s.id !== row.id)) await patch(db, "task_statuses", other, { isDefault: false });
    }
    return patch(db, "task_statuses", row, { name: input.name, position: input.position === undefined ? undefined : BigInt(input.position), isDefault: input.isDefault });
  },
  async delete_status({ db, actor, graph: g, requestId }, input) {
    ownerOnly(actor); const row = g.status(input.id); checkRevision(row, input.expectedRevision);
    if (g.statuses.filter((s) => s.category === row.category).length <= 1) invalid("Keep at least one status in every category.");
    const using = g.tasks.filter((t) => t.statusId === row.id);
    const rules = await query<{ id: string }>(db, sql`select id from project_github_rules where project_id = ${g.project.id} and target_status_id = ${row.id}`);
    const replacement = input.replacementStatusId ? g.status(input.replacementStatusId) : undefined;
    if ((using.length || row.isDefault || rules.length) && !replacement) decision("Choose a replacement status.", { options: g.statuses.filter((s) => s.category === row.category && s.id !== row.id), affectedTaskCount: using.length });
    // Category preservation avoids implicit completion/reopening through configuration.
    if (replacement && (replacement.id === row.id || replacement.category !== row.category)) invalid("Choose another status in the same category.");
    for (const task of using) {
      await patch(db, "tasks", task, { statusId: replacement!.id });
      await activity(db, actor, g.project.id, requestId, "remap_task_status", { statusId: { from: row.id, to: replacement!.id } }, { taskId: task.id });
    }
    // Rule targets must remain valid even when no tasks currently use the status.
    if (replacement) await db.execute(sql`update project_github_rules set target_status_id = ${replacement.id}, revision = revision + 1, updated_at = now() where project_id = ${g.project.id} and target_status_id = ${row.id}`);
    await db.execute(sql`delete from task_statuses where id = ${row.id}`);
    if (row.isDefault) await patch(db, "task_statuses", replacement!, { isDefault: true });
    return { id: row.id, deleted: true };
  },
  async create_label({ db, actor, graph: g }, input) {
    ownerOnly(actor); return insert(db, "labels", { ownerId: actor.ownerId, projectId: g.project.id, name: input.name, normalizedName: normalizeName(input.name), color: input.color });
  },
  async update_label({ db, actor }, input) {
    ownerOnly(actor); const row = await owned(db, actor, "labels", input.id); checkRevision(row, input.expectedRevision);
    return patch(db, "labels", row, { name: input.name, normalizedName: input.name === undefined ? undefined : normalizeName(input.name), color: input.color });
  },
  async delete_label(context, input) {
    const { db, actor } = context; ownerOnly(actor); const row = await owned(db, actor, "labels", input.id); checkRevision(row, input.expectedRevision);
    await reviseAffected(context, sql`select task_id from task_labels where label_id = ${row.id}`, "remove_deleted_label", row.id);
    await db.execute(sql`delete from labels where id = ${row.id}`); return { id: row.id, deleted: true };
  },
  async create_property({ db, actor, graph: g }, input) {
    ownerOnly(actor); const definitions = await rows(db, "property_definitions", sql`project_id = ${g.project.id}`);
    if (definitions.length >= 30) invalid("A project supports at most 30 custom properties.");
    return insert(db, "property_definitions", { ownerId: actor.ownerId, projectId: g.project.id, name: input.name, normalizedName: normalizeName(input.name), type: input.type, icon: input.icon, position: definitions.reduce((n, d) => BigInt(d.position) > n ? BigInt(d.position) : n, 0n) + 1024n });
  },
  async update_property(context, input) {
    const { db, actor } = context;
    ownerOnly(actor); const row = await owned(db, actor, "property_definitions", input.id); checkRevision(row, input.expectedRevision);
    if (input.type && input.type !== row.type) {
      if (await affectedCount(context, row.id)) invalid("Clear its values to change the type.");
      if (["select", "multi_select"].includes(row.type)) await db.execute(sql`delete from property_options where definition_id = ${row.id}`);
    }
    return patch(db, "property_definitions", row, { name: input.name, normalizedName: input.name === undefined ? undefined : normalizeName(input.name), type: input.type, icon: input.icon, position: input.position === undefined ? undefined : BigInt(input.position) });
  },
  async delete_property(context, input) {
    const { db, actor } = context; ownerOnly(actor);
    const row = await owned(db, actor, "property_definitions", input.id); checkRevision(row, input.expectedRevision);
    const count = await affectedCount(context, row.id);
    if (input.confirmedAffectedTaskCount !== count) decision("Confirm how many tasks lose this property, including archived tasks.", { affectedTaskCount: count, name: row.name });
    await reviseAffected(context, sql`select task_id from task_property_values where definition_id = ${row.id} union select task_id from task_property_option_values where definition_id = ${row.id}`, "remove_deleted_property", row.id);
    await db.execute(sql`delete from property_definitions where id = ${row.id}`); return { id: row.id, deleted: true, affectedTaskCount: count };
  },
  async create_option({ db, actor, graph: g }, input) {
    ownerOnly(actor); const definition = await owned(db, actor, "property_definitions", input.definitionId);
    if (!["select", "multi_select"].includes(definition.type)) invalid("Only select properties have options.");
    const options = await rows(db, "property_options", sql`definition_id = ${definition.id}`);
    if (options.length >= 50) invalid("A property supports at most 50 options.");
    return insert(db, "property_options", { ownerId: actor.ownerId, projectId: g.project.id, definitionId: definition.id, name: input.name, normalizedName: normalizeName(input.name), position: options.reduce((n, o) => BigInt(o.position) > n ? BigInt(o.position) : n, 0n) + 1024n });
  },
  async update_option({ db, actor }, input) {
    ownerOnly(actor); const row = await owned(db, actor, "property_options", input.id); checkRevision(row, input.expectedRevision);
    return patch(db, "property_options", row, { name: input.name, normalizedName: input.name === undefined ? undefined : normalizeName(input.name), position: input.position === undefined ? undefined : BigInt(input.position) });
  },
  async delete_option(context, input) {
    const { db, actor } = context; ownerOnly(actor);
    const row = await owned(db, actor, "property_options", input.id); checkRevision(row, input.expectedRevision);
    const count = await affectedCount(context, row.definitionId, row.id);
    if (count && input.confirmedAffectedTaskCount !== count) decision("Confirm how many tasks lose this option, including archived tasks.", { affectedTaskCount: count, name: row.name });
    await reviseAffected(context, sql`select task_id from task_property_values where option_id = ${row.id} union select task_id from task_property_option_values where option_id = ${row.id}`, "remove_deleted_option", row.definitionId);
    await db.execute(sql`delete from property_options where id = ${row.id}`); return { id: row.id, deleted: true, affectedTaskCount: count };
  },
};
