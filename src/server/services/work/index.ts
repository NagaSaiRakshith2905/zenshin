import "server-only";
import { sql } from "drizzle-orm";
import { categories, commands, type Command } from "@/lib/contracts/work";
import { assertProjectScope, type Actor } from "@/server/auth/access";
import type { Database, DatabaseExecutor } from "@/server/db";
import { activity, mutation, owned, ownerOnly, projectLock } from "./foundation";
import { loadGraph } from "./graph";
import { noteHandlers } from "./notes";
import { lifecycle } from "./lifecycle";
import { configuration, planning } from "./planning";
import { insert, type Table, type Rows } from "./store";
import { taskHandlers } from "./tasks";
import type { Context, Handlers } from "./types";
export { DomainError } from "./foundation";
export { createWorkReader } from "./read";

const ownerCommands = new Set<Command>(["create_project", "update_project", "create_status", "update_status", "delete_status", "create_label", "update_label", "delete_label", "create_property", "update_property", "delete_property", "create_option", "update_option", "delete_option", "delete_item", "restore_note"]);
const targetTables: Partial<Record<Command, Table>> = {
  update_project: "projects", update_section: "sections", move_section: "sections", update_task: "tasks", transition_task: "tasks", move_task: "tasks", set_task_labels: "tasks", set_task_properties: "tasks", add_dependency: "tasks", remove_dependency: "tasks", update_status: "task_statuses", delete_status: "task_statuses", update_label: "labels", delete_label: "labels", update_property: "property_definitions", delete_property: "property_definitions", update_option: "property_options", delete_option: "property_options", create_option: "property_definitions",
};
const handlers: Handlers = {
  ...planning, ...configuration, ...taskHandlers, ...lifecycle, ...noteHandlers,
  async create_project({ db, actor }, input) {
    ownerOnly(actor);
    const project = await insert(db, "projects", { ownerId: actor.ownerId, name: input.name, prefix: input.prefix, description: input.description });
    const names = ["Backlog", "Ready", "In progress", "In review", "Done", "Canceled"];
    for (let i = 0; i < categories.length; i++) await insert(db, "task_statuses", { ownerId: actor.ownerId, projectId: project.id, name: names[i], category: categories[i], isDefault: i === 0, position: BigInt((i + 1) * 1024) });
    return project;
  },
};
export function createWorkService(db: Database) {
  return {
    async execute(actor: Actor, operation: Command, raw: unknown, requestId: string, idempotencyKey?: string) {
      let project: Rows["projects"] | undefined;
      const authorize = async (tx: DatabaseExecutor, input: Record<string, unknown>, replayProjectId?: string) => {
        if (ownerCommands.has(operation) || (input.kind === "project" && ["archive_item", "restore_item", "delete_item"].includes(operation))) ownerOnly(actor);
        if (operation === "create_project") {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`projects:${actor.ownerId}`}, 0))`);
          return;
        }
        if (replayProjectId && operation === "delete_item") {
          // Deletion receipts remain usable after the target/project has gone away.
          ownerOnly(actor);
          return;
        }
        let projectId = replayProjectId ?? input.projectId as string | undefined;
        const table = targetTables[operation] ?? (input.kind === "project" ? "projects" : input.kind === "section" ? "sections" : "tasks");
        if (!projectId) {
          const target = await owned(tx, actor, table, (operation === "create_option" ? input.definitionId : input.id) as string);
          projectId = table === "projects" ? target.id : (target as { projectId: string }).projectId;
        }
        const scope = operation === "archive_item" || operation === "restore_item" ? "archive" : "write";
        project = await projectLock(tx, actor, projectId, scope);
        // Complete is additional to write; archive/restore has its own independent scope.
        if (input.lifecycle === "completed") assertProjectScope(actor, actor.ownerId, projectId, "complete");
        if (operation === "transition_task" || operation === "create_task") {
          if (input.statusId) {
            const status = await owned(tx, actor, "task_statuses", input.statusId as string);
            if (status.category === "done") assertProjectScope(actor, actor.ownerId, projectId, "complete");
          }
        }
      };
      return mutation(db, actor, operation, raw, requestId, idempotencyKey, async (tx, input) => {
        const graph = project ? await loadGraph(tx, project) : undefined;
        const context = { db: tx, actor, graph, requestId } as Context;
        const result = await handlers[operation](context, input as never);
        const resultRecord = result as Record<string, unknown>;
        if (graph && typeof resultRecord.number === "number") resultRecord.reference = `${graph.project.prefix}-${resultRecord.number}`;
        const projectId = project?.id ?? resultRecord.id as string;
        // Project deletion cascades project activity; retain its owner-bound idempotency receipt.
        if (resultRecord.changed !== false && !(operation === "delete_item" && input.kind === "project") && !(operation === "transition_task" && input.completionAction === "keep_open" && resultRecord.revision === graph?.task(input.id as string).revision)) {
          const table = targetTables[operation];
          const target = input.kind === "section" ? { sectionId: input.id as string } : input.kind === "task" ? { taskId: input.id as string } : operation.includes("section") ? { sectionId: (input.id ?? resultRecord.id) as string } : table === "tasks" || operation === "create_task" ? { taskId: (input.id ?? resultRecord.id) as string } : undefined;
          const fields = Object.keys(input).filter((key) => !["expectedRevision", "id", "projectId", "reopenCompletedAncestors"].includes(key));
          await activity(tx, actor, projectId, requestId, operation, { fields, ...(input.reason ? { reason: input.reason } : {}), ...(operation === "set_task_properties" ? { definitionIds: Object.keys(input.values as object) } : {}), resultRevision: resultRecord.revision ?? null }, target);
        }
        return { value: result, projectId };
      }, authorize);
    },
    commands,
  };
}
