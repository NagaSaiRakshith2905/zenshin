import "server-only";
import { sql } from "drizzle-orm";
import { assertProjectScope } from "@/server/auth/access";
import { attachments, backgroundJobs } from "@/server/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { checkRevision, decision, invalid, ownerOnly } from "./foundation";
import type { Graph } from "./graph";
import { patch, type Rows } from "./store";
import type { Handlers } from "./types";
import { cleanupMarginMs } from "@/lib/contracts/attachments";

function subtree(g: Graph, kind: "project" | "section" | "task", id: string) {
  const target = kind === "project" ? g.project : kind === "section" ? g.section(id) : g.task(id);
  const sectionIds = kind === "project" ? g.sections.map((s) => s.id) : kind === "section" ? g.sectionIds(id) : [];
  const taskIds = g.tasks.filter((t) => kind === "project" || (kind === "section" && t.sectionId && sectionIds.includes(t.sectionId)) || (kind === "task" && (t.id === id || t.parentTaskId === id))).map((t) => t.id);
  return { target, sectionIds, taskIds };
}
export const lifecycle: Pick<Handlers, "archive_item" | "restore_item" | "delete_item"> = {
  async archive_item({ db, actor, graph: g }, input) {
    if (input.kind === "project") ownerOnly(actor);
    else assertProjectScope(actor, actor.ownerId, g.project.id, "archive");
    const { target, taskIds } = subtree(g, input.kind, input.id); checkRevision(target, input.expectedRevision);
    const dependentIds = [...new Set(g.edges.filter((e) => taskIds.includes(e.prerequisiteTaskId) && !taskIds.includes(e.taskId)).map((e) => e.taskId))].filter((id) => { const t = g.task(id); return !g.archived(t) && !g.terminal(t); });
    if (!target.archivedAt && dependentIds.some((id) => !input.acknowledgeDependentIds.includes(id))) decision("Archiving this work will affect active dependents.", { options: ["acknowledge_dependents"], affected: dependentIds.map((id) => ({ id, title: g.task(id).title })) });
    const table = input.kind === "project" ? "projects" : input.kind === "section" ? "sections" : "tasks";
    return patch(db, table, target, { archivedAt: new Date() });
  },
  async restore_item({ db, actor, graph: g }, input) {
    if (input.kind === "project") ownerOnly(actor);
    else assertProjectScope(actor, actor.ownerId, g.project.id, "archive");
    const { target } = subtree(g, input.kind, input.id); checkRevision(target, input.expectedRevision);
    const table = input.kind === "project" ? "projects" : input.kind === "section" ? "sections" : "tasks";
    const restored = await patch(db, table, target, { archivedAt: null });
    const sectionId = input.kind === "section" ? (target as Rows["sections"]).parentSectionId : input.kind === "task" ? (target as Rows["tasks"]).sectionId : null;
    const archivedAncestors = g.ancestors(sectionId).filter((s) => s.archivedAt).map((s) => ({ id: s.id, kind: "section" }));
    if (input.kind !== "project" && g.project.archivedAt) archivedAncestors.push({ id: g.project.id, kind: "project" });
    if (input.kind === "task") {
      const parent = (target as Rows["tasks"]).parentTaskId;
      if (parent && g.task(parent).archivedAt) archivedAncestors.push({ id: parent, kind: "task" });
    }
    return { ...restored, effectiveArchived: archivedAncestors.length > 0, archivedAncestors };
  },
  async delete_item({ db, actor, graph: g }, input) {
    ownerOnly(actor);
    const { target, taskIds, sectionIds } = subtree(g, input.kind, input.id); checkRevision(target, input.expectedRevision);
    if (!target.archivedAt) invalid("Archive this item explicitly before permanently deleting it.");
    const external = g.edges.filter((e) => taskIds.includes(e.prerequisiteTaskId) && !taskIds.includes(e.taskId));
    if (external.length) invalid("Remove surviving external dependencies before deleting this subtree.", { dependentIds: [...new Set(external.map((e) => e.taskId))] });
    const files = await db.select().from(attachments).where(and(eq(attachments.ownerId, actor.ownerId), or(input.kind === "project" ? eq(attachments.projectId, g.project.id) : undefined, sectionIds.length ? inArray(attachments.sectionId, sectionIds) : undefined, taskIds.length ? inArray(attachments.taskId, taskIds) : undefined)));
    const expected = { name: "title" in target ? target.title : target.name, sectionCount: sectionIds.length, taskCount: taskIds.length, fileCount: files.length };
    if (!input.confirmation || Object.entries(expected).some(([k, v]) => input.confirmation![k as keyof typeof expected] !== v)) decision("Confirm the exact subtree and files to permanently delete. Backups may retain data for 30 days.", { confirmation: expected, backupRetentionDays: 30 });
    // Object keys outlive the cascading database records in independently retryable jobs.
    if (files.length) await db.insert(backgroundJobs).values(files.map((file) => ({ ownerId: actor.ownerId, kind: "attachment_cleanup", deduplicationKey: `attachment-delete:${file.id}`, payload: { objectKey: file.objectKey, attachmentId: file.id }, availableAt: new Date(Math.max(Date.now(), file.uploadExpiresAt.getTime() + cleanupMarginMs)) }))).onConflictDoNothing();
    if (taskIds.length) await db.execute(sql`delete from task_dependencies where task_id in (${sql.join(taskIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
    const table = input.kind === "project" ? "projects" : input.kind === "section" ? "sections" : "tasks";
    await db.execute(sql`delete from ${sql.identifier(table)} where id = ${target.id} and owner_id = ${actor.ownerId}`);
    return { id: target.id, deleted: true, ...expected };
  },
};
