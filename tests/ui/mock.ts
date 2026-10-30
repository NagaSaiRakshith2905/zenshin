// Isolated component-preview fixtures. No production auth bypass or database access.
import type { Attachment } from "../../src/lib/contracts/attachments";
import { commands } from "../../src/lib/contracts/work";
import type { Project, Section, Status, Task, Property, Label, Activity } from "../../src/features/work/types";
import { workGroup } from "../../src/features/work/model";
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-29T04:00:00.000Z";
const stamp = (n: number) => ({ id: fixtureId(n), revision: 1, createdAt: now, updatedAt: now, archivedAt: null });
const progress = { done: 2, total: 8, state: "active", unresolvedParents: 1 };
const projects: Project[] = [{ ...stamp(1), name: "Zenshin", prefix: "ZEN", description: "A quiet place to plan what comes next, and finish what matters.", progress }, { ...stamp(2), name: "Portfolio", prefix: "PF", description: "Selected work and writing.", progress }];
const statuses: Status[] = ["backlog", "ready", "in_progress", "in_review", "done", "canceled"].map((category, i) => ({ ...stamp(10 + i), projectId: fixtureId(1), name: ["Backlog", "Ready", "In progress", "In review", "Done", "Canceled"][i], category: category as Status["category"], position: String((i + 1) * 1024), isDefault: i === 0 }));
const sections: Section[] = [{ ...stamp(20), projectId: fixtureId(1), name: "Version 1.0", description: "Bring the planning and execution flows together.", parentSectionId: null, lifecycle: "active", targetDate: "2026-11-15", position: "1024", progress, breadcrumbs: [] }, { ...stamp(21), projectId: fixtureId(1), name: "Core workspace", description: "Make the daily workflow feel clear and connected.", parentSectionId: fixtureId(20), lifecycle: "active", targetDate: "2026-11-04", position: "1024", progress, breadcrumbs: [{ id: fixtureId(20), name: "Version 1.0" }] }, { ...stamp(22), projectId: fixtureId(1), name: "Future ideas", description: "Ideas worth coming back to.", parentSectionId: null, lifecycle: "planned", targetDate: null, position: "2048", progress, breadcrumbs: [] }];
const tasks: Task[] = ["Connect the task detail panel", "Preserve drafts when a revision changes", "Build the project navigation tree", "Make every status change explicit", "Polish the compact task rows", "Scope agent reads to their projects", "Write the first project case study", "Capture a future improvement"].map((title, i) => ({ ...stamp(30 + i), projectId: fixtureId(i === 6 ? 2 : 1), projectName: i === 6 ? "Portfolio" : "Zenshin", sectionId: i === 6 ? null : fixtureId(21), parentTaskId: i === 5 ? fixtureId(32) : null, reference: `${i === 6 ? "PF" : "ZEN"}-${i + 1}`, number: i + 1, title, description: i === 0 ? "Keep the list in place while the detail panel opens. Preserve the URL, scroll position and keyboard focus." : "Use the shared domain rules and keep the interaction clear.", statusId: fixtureId(10 + (i === 7 ? 0 : i < 3 ? 2 : i === 3 ? 3 : 1)), category: i === 7 ? "backlog" : i < 3 ? "in_progress" : i === 3 ? "in_review" : "ready", priority: i === 0 ? "high" : i === 2 ? "urgent" : "medium", dueDate: i === 0 ? "2026-10-28" : i < 4 ? "2026-11-02" : null, manualBlockedReason: i === 1 ? "Waiting for the conflict flow." : null, blocked: i === 1, overdue: i === 0, effectiveArchived: false, prerequisiteTaskIds: i === 1 ? [fixtureId(30)] : [], dependentTaskIds: i === 0 ? [fixtureId(31)] : [], dependencyBlockers: i === 1 ? [fixtureId(30)] : [], properties: i === 0 ? { [fixtureId(50)]: "Workspace" } : i === 1 ? { [fixtureId(50)]: "Workspace", [fixtureId(51)]: 3, [fixtureId(52)]: "2026-11-12", [fixtureId(53)]: true, [fixtureId(54)]: fixtureId(80), [fixtureId(55)]: [fixtureId(82)], [fixtureId(56)]: "https://example.com" } : {}, labelIds: i === 0 ? [fixtureId(60)] : [], breadcrumbs: i === 6 ? [] : [{ id: fixtureId(20), name: "Version 1.0" }, { id: fixtureId(21), name: "Core workspace" }], ...(i === 2 ? { progress: { ...progress, done: 0, total: 1 } } : {}) }));
const properties: Property[] = ([ ["Area", "text"], ["Estimate", "number"], ["Target", "date"], ["Reviewed", "checkbox"], ["Effort", "select"], ["Platforms", "multi_select"], ["Reference", "url"], ["Notes", "text"] ] as const).map(([name, type], i) => ({ ...stamp(50 + i), projectId: fixtureId(1), name, type, icon: null, hasValues: false, position: String((i + 1) * 1024), options: type === "select" || type === "multi_select" ? [0, 1].map((n) => ({ ...stamp((type === "select" ? 80 : 82) + n), definitionId: fixtureId(50 + i), name: type === "select" ? ["Small", "Large"][n] : ["Web", "Mobile"][n], position: String(n) })) : [] }));
const labels: Label[] = [{ ...stamp(60), projectId: fixtureId(1), name: "Frontend", color: "#71717A" }];
const activity: Activity[] = [{ id: fixtureId(70), taskId: fixtureId(30), actorKind: "human", actorCredentialId: null, action: "update_task", createdAt: now, changedFields: { fields: ["title", "description"] } }];
const previewFiles: (Attachment & { kind: string; targetId: string })[] = ["ready", "pending", "failed"].map((state, i) => ({ id: fixtureId(90 + i), revision: 1, originalName: ["Architecture notes.pdf", "Mobile screenshot.png", "Interrupted upload.txt"][i], state: state as Attachment["state"], declaredSize: 120000 + i * 1000, declaredMediaType: "application/pdf", actualSize: state === "ready" ? 120000 : null, detectedMediaType: state === "ready" ? "application/pdf" : null, uploadExpiresAt: new Date(Date.now() + 600000).toISOString(), failureSummary: state === "failed" ? "The uploaded object was missing. Select the file again to retry." : null, createdAt: now, verifiedAt: state === "ready" ? now : null, kind: "task", targetId: fixtureId(30) }));
const previewNotes = new Map<string, { revision: number; content: object }>();
type Item = { id: string; revision?: number; projectId?: string };
const collections: Record<string, Item[]> = { projects, sections, tasks, statuses, labels, properties, options: [], activity };
const createCommands = { projects: "create_project", sections: "create_section", tasks: "create_task", statuses: "create_status", labels: "create_label", properties: "create_property", options: "create_option" } as const;
const updateCommands = { projects: "update_project", sections: "update_section", tasks: "update_task", statuses: "update_status", labels: "update_label", properties: "update_property", options: "update_option" } as const;
export function installPreviewApi() {
  let preferences = { timezone: "Asia/Kolkata", theme: "system", defaultTaskView: "list", revision: 1 };
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.origin);
    const [, , , resource, id, action] = url.pathname.split("/");
    if (url.pathname === "/api/v1/settings/preferences") { if (init?.method === "PATCH") preferences = { ...preferences, ...JSON.parse(String(init.body)), revision: preferences.revision + 1 }; return Response.json(preferences); }
    if (url.pathname === "/api/v1/settings/credentials") return Response.json({ credentials: [], projects: projects.map((p) => ({ id: p.id, name: p.name, archived: false })) });
    const fail = (message: string, code = "validation_error", details = {}) => Response.json({ error: { message, code, details, requestId: "preview" } }, { status: 409 });
    if (resource === "attachments") {
      if (!id && init?.method === "POST") {
        const input = JSON.parse(String(init.body)).input;
        const file = { id: crypto.randomUUID(), revision: 1, originalName: input.originalName, state: "ready" as const, declaredSize: input.declaredSize, declaredMediaType: input.declaredMediaType, actualSize: input.declaredSize, detectedMediaType: input.declaredMediaType, uploadExpiresAt: now, failureSummary: null, createdAt: now, verifiedAt: now, kind: input.kind, targetId: input.id };
        previewFiles.push(file); return Response.json({ attachment: file, upload: null });
      }
      const file = previewFiles.find((file) => file.id === id);
      if (id && action === "remove") { const index = previewFiles.findIndex((file) => file.id === id); if (index >= 0) previewFiles.splice(index, 1); return Response.json({ id, deleted: true }); }
      if (id && action === "finalize" && file) { Object.assign(file, { state: "ready", revision: file.revision + 1, actualSize: file.declaredSize, detectedMediaType: file.declaredMediaType }); return Response.json(file); }
      if (!id) return Response.json({ items: previewFiles.filter((file) => file.kind === url.searchParams.get("kind") && file.targetId === url.searchParams.get("id")), nextCursor: null });
      return fail("This preview does not contact file storage.");
    }
    if (resource === "notes") {
      const key = `${url.searchParams.get("kind")}:${id}`;
      const note = previewNotes.get(key) ?? { revision: 0, content: { type: "doc", content: [{ type: "paragraph" }] } };
      if (init?.method === "PATCH") { const input = JSON.parse(String(init.body)).input; note.content = input.content; note.revision++; previewNotes.set(key, note); }
      if (action === "history") return Response.json({ items: [] });
      return Response.json({ ...note, id: fixtureId(99), ownerId: "preview-owner", kind: url.searchParams.get("kind"), targetId: id, updatedAt: now });
    }
    if (init?.method && init.method !== "GET") {
      const body = JSON.parse(String(init.body)).input as Record<string, unknown>;
      const item = collections[resource]?.find((r) => r.id === id);
      const command = action === "transition" ? "transition_task" : action === "archive" ? "archive_item" : action === "restore" ? "restore_item" : action === "delete" ? resource === "tasks" ? "delete_item" : resource === "properties" ? "delete_property" : resource === "statuses" ? "delete_status" : resource === "labels" ? "delete_label" : "delete_option" : action === "properties" ? "set_task_properties" : action === "labels" ? "set_task_labels" : action === "add-dependency" ? "add_dependency" : action === "remove-dependency" ? "remove_dependency" : action === "move" || action === "convert" ? resource === "tasks" ? "move_task" : "move_section" : id ? updateCommands[resource as keyof typeof updateCommands] : createCommands[resource as keyof typeof createCommands];
      const schema = commands[command as keyof typeof commands];
      if (!schema) return fail("Unsupported preview action.");
      const parsed = schema.safeParse({ ...body, ...(id ? { id } : {}), ...(["archive_item", "restore_item", "delete_item"].includes(command) ? { kind: resource === "projects" ? "project" : resource === "sections" ? "section" : "task" } : {}) });
      if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(" "));
      if (item && body.expectedRevision !== item.revision) return fail("This item changed. Review the current version.", "conflict", { current: item, currentRevision: item.revision });
      if (action === "transition" && id === fixtureId(32) && body.statusId === fixtureId(14) && !body.completionAction) return fail("Choose how to handle unfinished subtasks.", "decision_required", { options: ["keep_open", "complete_all"], affected: [{ id: fixtureId(35), title: tasks[5].title }] });
      if (action === "delete" && command === "delete_item" && !body.confirmation) return fail("Confirm the exact work to delete.", "decision_required", { confirmation: { name: tasks.find((t) => t.id === id)?.title, sectionCount: 0, taskCount: 1, fileCount: 0 } });
      if (item) {
        if (action === "delete") collections[resource].splice(collections[resource].indexOf(item), 1);
        else {
          if (action === "transition" && body.completionAction === "keep_open") return Response.json(item);
          const patch: Record<string, unknown> = { ...body, revision: (item.revision ?? 1) + 1 };
          if (action === "archive") Object.assign(patch, { archivedAt: now, effectiveArchived: true });
          if (action === "restore") Object.assign(patch, { archivedAt: null, effectiveArchived: false });
          if (action === "properties") { const values = { ...(item as Task).properties, ...body.values as object }; for (const key of Object.keys(values)) if (values[key] === null) delete values[key]; patch.properties = values; }
          if (body.statusId) { patch.category = statuses.find((s) => s.id === body.statusId)?.category; patch.statusName = statuses.find((s) => s.id === body.statusId)?.name; patch.overdue = false; }
          Object.assign(item, patch);
        }
        return Response.json(item);
      }
      if (resource === "tasks") { const template = tasks[7]; const created = { ...template, ...body, id: crypto.randomUUID(), revision: 1, reference: `ZEN-${tasks.length + 1}`, number: tasks.length + 1, category: statuses.find((s) => s.id === body.statusId)?.category ?? "backlog" }; tasks.push(created as Task); return Response.json(created); }
      const created = { ...stamp(100 + collections[resource].length), position: String((collections[resource].length + 1) * 1024), ...(resource === "properties" ? { options: [] } : {}), ...body }; collections[resource].push(created); return Response.json(created);
    }
    if (resource === "search") { const q = (url.searchParams.get("q") ?? "").toLowerCase(); const hits = [...tasks.map((t) => ({ id: t.id, kind: "task", projectId: t.projectId, title: t.title, reference: t.reference, snippet: t.description ?? "" })), ...sections.map((s) => ({ id: s.id, kind: "section", projectId: s.projectId, title: s.name, reference: null, snippet: s.description ?? "" })), ...projects.map((p) => ({ id: p.id, kind: "project", projectId: p.id, title: p.name, reference: null, snippet: "" }))].filter((h) => `${h.reference} ${h.title} ${h.snippet}`.toLowerCase().includes(q)).map((h) => ({ ...h, effectiveArchived: false, snippet: h.snippet.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), (m) => `⟦${m}⟧`) })); return Response.json({ items: hits, nextCursor: null }); }
    if (resource === "my-work") { const matching = tasks.filter((t) => workGroup(t)); return Response.json({ items: matching, nextCursor: null, hasMore: false, groupCounts: Object.fromEntries(["overdue", "in_progress", "in_review", "ready"].map((g) => [g, matching.filter((t) => workGroup(t) === g).length])) }); }
    if (id) { const value = collections[resource]?.find((r) => r.id === id); return value ? Response.json(value) : fail("Item was not found.", "not_found"); }
    const items = (collections[resource] ?? []).filter((item) => (!url.searchParams.get("projectId") || item.projectId === url.searchParams.get("projectId") || resource === "projects" || resource === "activity") && (!url.searchParams.get("parentTaskId") || (item as Task).parentTaskId === url.searchParams.get("parentTaskId")) && (!url.searchParams.get("taskId") || (item as Activity).taskId === url.searchParams.get("taskId")) && (!url.searchParams.get("sectionId") || (item as Task).sectionId === url.searchParams.get("sectionId")) && (url.searchParams.get("includeArchived") === "true" || !(item as Task).effectiveArchived));
    return Response.json({ items, nextCursor: null, hasMore: false });
  };
}
