import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { calendarDate } from "@/lib/contracts/work";
import { assertProjectScope } from "@/server/auth/access";
import { taskLabels, taskPropertyValues, taskPropertyOptionValues } from "@/server/db/schema";
import { activity, checkRevision, decision, invalid, owned } from "./foundation";
import { assertArchiveChange, rank, reopen, validateDependency, validateTaskLocation } from "./graph";
import { insert, patch, rows } from "./store";
import type { Handlers } from "./types";

export const taskHandlers: Pick<Handlers, "create_task" | "update_task" | "transition_task" | "move_task" | "add_dependency" | "remove_dependency" | "set_task_labels" | "set_task_properties"> = {
  async create_task({ db, actor, graph: g, requestId }, input) {
    validateTaskLocation(g, input);
    assertArchiveChange(actor, g, false, Boolean(g.sectionArchived(input.sectionId) || (input.parentTaskId && g.task(input.parentTaskId).archivedAt)));
    const status = input.statusId ? g.status(input.statusId) : g.statuses.find((s) => s.isDefault)!;
    if (!status) invalid("The project needs a default Backlog status.");
    if (status.category === "done") assertProjectScope(actor, actor.ownerId, g.project.id, "complete");
    if (!["done", "canceled"].includes(status.category)) await reopen(db, actor, g, [input.sectionId], input.reopenCompletedAncestors, requestId);
    // Increment under the project guard; deleted numbers are never reused.
    await db.execute(sql`update projects set next_task_number = next_task_number + 1 where id = ${g.project.id}`);
    const row = await insert(db, "tasks", { ownerId: actor.ownerId, projectId: g.project.id, number: g.project.nextTaskNumber, title: input.title, description: input.description, statusId: status.id, priority: input.priority, dueDate: input.dueDate, manualBlockedReason: input.manualBlockedReason, sectionId: input.sectionId, parentTaskId: input.parentTaskId, position: await rank(db, "tasks", g.tasks.filter((t) => t.sectionId === input.sectionId && t.parentTaskId === input.parentTaskId), null) });
    return { ...row, reference: `${g.project.prefix}-${row.number}` };
  },
  async update_task({ db, graph: g }, input) {
    const row = g.task(input.id); checkRevision(row, input.expectedRevision);
    return patch(db, "tasks", row, { title: input.title, description: input.description, priority: input.priority, dueDate: input.dueDate, manualBlockedReason: input.manualBlockedReason });
  },
  async transition_task({ db, actor, graph: g, requestId }, input) {
    const row = g.task(input.id); checkRevision(row, input.expectedRevision);
    const status = g.status(input.statusId);
    if (status.category === "done") {
      assertProjectScope(actor, actor.ownerId, g.project.id, "complete");
      const unfinished = g.tasks.filter((t) => t.parentTaskId === row.id && !g.terminal(t));
      if (unfinished.length && !input.completionAction) decision("Choose how to handle unfinished subtasks.", { options: ["keep_open", "complete_all"], affected: unfinished.map(({ id, title, revision }) => ({ id, title, revision })) });
      if (unfinished.length && input.completionAction === "keep_open") return row;
      for (const child of unfinished) {
        await patch(db, "tasks", child, { statusId: status.id });
        await activity(db, actor, g.project.id, requestId, "complete_subtask", { statusId: { from: child.statusId, to: status.id } }, { taskId: child.id });
      }
    } else if (!["done", "canceled"].includes(status.category)) {
      await reopen(db, actor, g, [row.sectionId], input.reopenCompletedAncestors, requestId);
    }
    return patch(db, "tasks", row, { statusId: status.id, position: await rank(db, "tasks", g.tasks.filter((t) => t.id !== row.id && t.sectionId === row.sectionId && t.parentTaskId === row.parentTaskId), null) });
  },
  async move_task({ db, actor, graph: g, requestId }, input) {
    const row = g.task(input.id); checkRevision(row, input.expectedRevision); validateTaskLocation(g, input);
    const children = g.tasks.filter((t) => t.parentTaskId === row.id);
    const archived = Boolean(row.archivedAt || g.sectionArchived(input.sectionId) || (input.parentTaskId && g.task(input.parentTaskId).archivedAt));
    assertArchiveChange(actor, g, g.archived(row), archived, [row.id, ...children.map((t) => t.id)], input.acknowledgeDependentIds);
    if (!g.terminal(row) || children.some((t) => !g.terminal(t))) await reopen(db, actor, g, [input.sectionId], input.reopenCompletedAncestors, requestId);
    for (const child of children) {
      await patch(db, "tasks", child, { sectionId: input.sectionId });
      await activity(db, actor, g.project.id, requestId, "move_subtask", { sectionId: { from: child.sectionId, to: input.sectionId } }, { taskId: child.id });
    }
    return patch(db, "tasks", row, { sectionId: input.sectionId, parentTaskId: input.parentTaskId, position: await rank(db, "tasks", g.tasks.filter((t) => t.id !== row.id && t.sectionId === input.sectionId && t.parentTaskId === input.parentTaskId), input.beforeId) });
  },
  async add_dependency({ db, graph: g }, input) {
    const row = g.task(input.id); checkRevision(row, input.expectedRevision); validateDependency(g, row.id, input.prerequisiteTaskId);
    await db.execute(sql`insert into task_dependencies (owner_id, project_id, task_id, prerequisite_task_id) values (${row.ownerId}, ${row.projectId}, ${row.id}, ${input.prerequisiteTaskId}) on conflict do nothing`);
    return patch(db, "tasks", row, {});
  },
  async remove_dependency({ db, graph: g }, input) {
    const row = g.task(input.id); checkRevision(row, input.expectedRevision); g.task(input.prerequisiteTaskId);
    await db.execute(sql`delete from task_dependencies where task_id = ${row.id} and prerequisite_task_id = ${input.prerequisiteTaskId}`);
    return patch(db, "tasks", row, {});
  },
  async set_task_labels({ db, graph: g }, input) {
    const row = g.task(input.id); checkRevision(row, input.expectedRevision);
    const labels = await rows(db, "labels", sql`project_id = ${g.project.id}`);
    if (input.labelIds.some((id) => !labels.some((l) => l.id === id))) invalid("Choose labels in this project.", { validChoices: labels });
    await db.execute(sql`delete from task_labels where task_id = ${row.id}`);
    if (input.labelIds.length) await db.insert(taskLabels).values(input.labelIds.map((labelId) => ({ ownerId: row.ownerId, projectId: row.projectId, taskId: row.id, labelId })));
    return patch(db, "tasks", row, {});
  },
  async set_task_properties({ db, actor, graph: g }, input) {
    const row = g.task(input.id); checkRevision(row, input.expectedRevision);
    for (const [definitionId, value] of Object.entries(input.values)) {
      const definition = await owned(db, actor, "property_definitions", definitionId);
      if (definition.projectId !== g.project.id) invalid("Choose properties in this project.");
      const options = await rows(db, "property_options", sql`definition_id = ${definition.id}`);
      const option = (v: unknown) => {
        if (typeof v !== "string" || !options.some((o) => o.id === v)) invalid("Choose an option from this property.", { definitionId, validChoices: options });
        return v as string;
      };
      const data: typeof taskPropertyValues.$inferInsert = { ownerId: row.ownerId, projectId: row.projectId, taskId: row.id, definitionId };
      let multiple: string[] = [];
      if (value !== null) switch (definition.type) {
        case "text": data.valueText = z.string().refine((s) => [...s].length <= 2000).parse(value); break;
        case "number": data.valueNumber = String(z.number().finite().parse(value)); break;
        case "date": data.valueDate = calendarDate.parse(value); break;
        case "checkbox": data.valueBool = z.boolean().parse(value); break;
        case "url": data.valueText = z.url({ protocol: /^https?$/ }).parse(value); break;
        case "select": data.optionId = option(value); break;
        case "multi_select": multiple = [...new Set(z.array(z.string()).max(50).parse(value).map(option))]; break;
      }
      await db.execute(sql`delete from task_property_values where task_id = ${row.id} and definition_id = ${definitionId}`);
      await db.execute(sql`delete from task_property_option_values where task_id = ${row.id} and definition_id = ${definitionId}`);
      if (value !== null && definition.type !== "multi_select") await db.insert(taskPropertyValues).values(data);
      if (multiple.length) await db.insert(taskPropertyOptionValues).values(multiple.map((optionId) => ({ ownerId: row.ownerId, projectId: row.projectId, taskId: row.id, definitionId, optionId })));
    }
    return patch(db, "tasks", row, {});
  },
};
