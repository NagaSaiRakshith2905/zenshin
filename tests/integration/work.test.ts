import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type HumanActor, type AgentActor } from "../../src/server/auth/access";
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { createNoteReader } from "../../src/server/services/work/notes";
import { createWorkService, createWorkReader } from "../../src/server/services/work";
import { createTestDatabase } from "../support/postgres";

describe("transactional work services (deferred execution)", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let service: ReturnType<typeof createWorkService>;
  const fixture = createFixtureData("development", "work-services");
  const owner: HumanActor = { kind: "human", ownerId: fixture.owner.id, credentialId: null, projectIds: null, scopes: actionScopes };
  beforeAll(async () => {
    database = await createTestDatabase();
    await insertFixtureData(database.db, fixture);
    service = createWorkService(database.db);
  }, 30_000);
  afterAll(async () => { await database?.dispose(); });
  const create = async (title: string) => await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, title }, randomUUID()) as { id: string; revision: number; number: number };

  it("changes only unused property types and removes obsolete options", async () => {
    const projectId = fixture.projects[0].id!;
    const property = await service.execute(owner, "create_property", { projectId, name: "Type change test", type: "select", icon: "Star" }, randomUUID()) as { id: string; revision: number; icon: string };
    expect(property.icon).toBe("Star");
    await service.execute(owner, "create_option", { definitionId: property.id, name: "Choice" }, randomUUID());
    const changed = await service.execute(owner, "update_property", { id: property.id, expectedRevision: property.revision, type: "text", icon: null }, randomUUID()) as { revision: number; icon: null };
    expect(changed.icon).toBeNull();
    expect((await database.pool.query("select count(*)::int as count from property_options where definition_id = $1", [property.id])).rows[0].count).toBe(0);
    const task = await create("Property type guard");
    await service.execute(owner, "set_task_properties", { id: task.id, expectedRevision: task.revision, values: { [property.id]: "used" } }, randomUUID());
    await expect(service.execute(owner, "update_property", { id: property.id, expectedRevision: changed.revision, type: "number" }, randomUUID())).rejects.toMatchObject({ code: "validation_error", message: "Clear its values to change the type." });
    expect(await createWorkReader(database.db).get(owner, "properties", property.id)).toMatchObject({ type: "text", hasValues: true, icon: null });
  });
  it("replays actor-bound retries without duplicate state/activity and rejects changed input", async () => {
    const key = randomUUID();
    const input = { projectId: fixture.projects[0].id, title: "Retry exactly once" };
    const [first, second] = await Promise.all([service.execute(owner, "create_task", input, randomUUID(), key), service.execute(owner, "create_task", input, randomUUID(), key)]);
    expect(first).toEqual(second);
    await expect(service.execute(owner, "create_task", { ...input, title: "Different" }, randomUUID(), key)).rejects.toMatchObject({ code: "idempotency_conflict" });
    const receipt = first as { id: string };
    expect((await database.pool.query("select count(*)::int as count from activities where task_id = $1", [receipt.id])).rows[0].count).toBe(1);
  });
  it("rejects stale writes with authorized current state", async () => {
    const task = await create("Revision guard");
    await service.execute(owner, "update_task", { id: task.id, expectedRevision: 1, title: "New version" }, randomUUID());
    await expect(service.execute(owner, "update_task", { id: task.id, expectedRevision: 1, title: "Stale" }, randomUUID())).rejects.toMatchObject({ code: "conflict", details: { currentRevision: 2, current: { title: "New version" } } });
  });
  it("serializes conflicting dependency edits so only one direction commits", async () => {
    const a = await create("Cycle A"), b = await create("Cycle B");
    const results = await Promise.allSettled([
      service.execute(owner, "add_dependency", { id: a.id, expectedRevision: 1, prerequisiteTaskId: b.id }, randomUUID()),
      service.execute(owner, "add_dependency", { id: b.id, expectedRevision: 1, prerequisiteTaskId: a.id }, randomUUID()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "dependency_cycle" } });
  });
  it("requires an atomic choice before parent completion and leaves canceled subtasks canceled", async () => {
    const parent = await create("Parent completion");
    const child = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, title: "Open child", parentTaskId: parent.id }, randomUUID()) as { id: string };
    const canceled = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, title: "Canceled child", parentTaskId: parent.id, statusId: fixture.statuses[5].id }, randomUUID()) as { id: string };
    const transition = { id: parent.id, expectedRevision: 1, statusId: fixture.statuses[4].id };
    await expect(service.execute(owner, "transition_task", transition, randomUUID())).rejects.toMatchObject({ code: "decision_required" });
    expect((await database.pool.query("select revision from tasks where id = $1", [parent.id])).rows[0].revision).toBe(1);
    await service.execute(owner, "transition_task", { ...transition, completionAction: "complete_all" }, randomUUID());
    const result = await database.pool.query("select id, status_id from tasks where id = any($1::uuid[])", [[child.id, canceled.id]]);
    expect(result.rows.find((r) => r.id === child.id).status_id).toBe(fixture.statuses[4].id);
    expect(result.rows.find((r) => r.id === canceled.id).status_id).toBe(fixture.statuses[5].id);
  });
  it("rolls back creation beneath a completed ancestor until reopening is acknowledged", async () => {
    const input = { projectId: fixture.projects[0].id, sectionId: fixture.sections[3].id, title: "Reopen ancestor" };
    await expect(service.execute(owner, "create_task", input, randomUUID())).rejects.toMatchObject({ code: "decision_required" });
    await service.execute(owner, "create_task", { ...input, reopenCompletedAncestors: true }, randomUUID());
    expect((await database.pool.query("select lifecycle from sections where id = $1", [input.sectionId])).rows[0].lifecycle).toBe("active");
  });
  it("does not disclose or mutate ungranted projects through list/detail/write paths", async () => {
    const actor: AgentActor = { kind: "agent", ownerId: fixture.owner.id, credentialId: randomUUID(), projectIds: [fixture.projects[1].id!], scopes: ["read"] };
    const reader = createWorkReader(database.db);
    await expect(reader.get(actor, "tasks", fixture.tasks[0].id!)).rejects.toMatchObject({ code: "not_found" });
    await expect(reader.list(actor, "tasks", { projectId: fixture.projects[0].id })).rejects.toMatchObject({ code: "not_found" });
    await expect(service.execute(actor, "create_task", { projectId: fixture.projects[1].id, title: "Denied" }, randomUUID())).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.execute(actor, "create_project", { name: "Denied", prefix: "DENY" }, randomUUID())).rejects.toMatchObject({ code: "forbidden" });
  });
  it("allocates unique monotonically increasing references under concurrent creates", async () => {
    const tasks = await Promise.all(Array.from({ length: 8 }, (_, i) => create(`Concurrent ${i}`)));
    expect(new Set(tasks.map((t) => t.number)).size).toBe(8);
  });
  it("rejects depth-four moves across an entire subtree", async () => {
    await expect(service.execute(owner, "move_section", { id: fixture.sections[0].id, expectedRevision: 1, parentSectionId: fixture.sections[2].id }, randomUUID())).rejects.toMatchObject({ code: "hierarchy_limit" });
    await expect(service.execute(owner, "create_section", { projectId: fixture.projects[0].id, name: "Fourth level", parentSectionId: fixture.sections[2].id }, randomUUID())).rejects.toMatchObject({ code: "hierarchy_limit" });
  });
  it("warns before archiving a prerequisite, then derives blocking without changing status", async () => {
    const prerequisite = await create("Archive prerequisite"), dependent = await create("Archive dependent");
    await service.execute(owner, "transition_task", { id: prerequisite.id, expectedRevision: 1, statusId: fixture.statuses[4].id }, randomUUID());
    await service.execute(owner, "add_dependency", { id: dependent.id, expectedRevision: 1, prerequisiteTaskId: prerequisite.id }, randomUUID());
    const input = { id: prerequisite.id, kind: "task", expectedRevision: 2 };
    await expect(service.execute(owner, "archive_item", input, randomUUID())).rejects.toMatchObject({ code: "decision_required" });
    await service.execute(owner, "archive_item", { ...input, acknowledgeDependentIds: [dependent.id] }, randomUUID());
    expect(await createWorkReader(database.db).get(owner, "tasks", dependent.id)).toMatchObject({ blocked: true, category: "backlog", dependencyBlockers: [prerequisite.id] });
    await expect(service.execute(owner, "delete_item", { id: prerequisite.id, kind: "task", expectedRevision: 3, confirmation: { name: "Archive prerequisite", taskCount: 1, sectionCount: 0, fileCount: 0 } }, randomUUID())).rejects.toMatchObject({ code: "validation_error" });
  });
  it("keeps deletion receipts usable after the target disappears", async () => {
    const task = await create("Delete receipt");
    await service.execute(owner, "archive_item", { id: task.id, kind: "task", expectedRevision: 1 }, randomUUID());
    const key = randomUUID();
    const input = { id: task.id, kind: "task", expectedRevision: 2, confirmation: { name: "Delete receipt", sectionCount: 0, taskCount: 1, fileCount: 0 } };
    const result = await service.execute(owner, "delete_item", input, randomUUID(), key);
    expect(await service.execute(owner, "delete_item", input, randomUUID(), key)).toEqual(result);
    await expect(createWorkReader(database.db).get(owner, "tasks", task.id, true)).rejects.toMatchObject({ code: "not_found" });
  });

  it("allows three section levels and serializes conflicting moves", async () => {
    const section = async (name: string, parentSectionId: string | null = null) => await service.execute(owner, "create_section", { projectId: fixture.projects[0].id, name, parentSectionId }, randomUUID()) as { id: string };
    const root = await section("Tree root"), child = await section("Tree child", root.id), leaf = await section("Tree leaf", child.id);
    await expect(createWorkReader(database.db).get(owner, "sections", leaf.id)).resolves.toMatchObject({ breadcrumbs: [{ id: root.id }, { id: child.id }] });
    await expect(service.execute(owner, "move_section", { id: root.id, expectedRevision: 1, parentSectionId: leaf.id }, randomUUID())).rejects.toMatchObject({ code: "hierarchy_limit" });
    const a = await section("Move A"), b = await section("Move B");
    const results = await Promise.allSettled([service.execute(owner, "move_section", { id: a.id, expectedRevision: 1, parentSectionId: b.id }, randomUUID()), service.execute(owner, "move_section", { id: b.id, expectedRevision: 1, parentSectionId: a.id }, randomUUID())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "hierarchy_limit" } });
  });
  it("requires same-category remapping and preserves required workflow categories and default", async () => {
    const projectId = fixture.projects[1].id!;
    const original = fixture.statuses[6];
    const replacement = await service.execute(owner, "create_status", { projectId, name: "Another backlog", category: "backlog" }, randomUUID()) as { id: string };
    const task = await service.execute(owner, "create_task", { projectId, title: "Status remapping" }, randomUUID()) as { id: string };
    const remove = { id: original.id, expectedRevision: 1 };
    await expect(service.execute(owner, "delete_status", remove, randomUUID())).rejects.toMatchObject({ code: "decision_required" });
    await expect(service.execute(owner, "delete_status", { ...remove, replacementStatusId: fixture.statuses[7].id }, randomUUID())).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.execute(owner, "update_status", { id: original.id, expectedRevision: 1, isDefault: false }, randomUUID())).rejects.toMatchObject({ code: "validation_error" });
    await service.execute(owner, "delete_status", { ...remove, replacementStatusId: replacement.id }, randomUUID());
    const reader = createWorkReader(database.db);
    expect(await reader.get(owner, "tasks", task.id)).toMatchObject({ statusId: replacement.id, revision: 2 });
    expect(await reader.get(owner, "statuses", replacement.id)).toMatchObject({ isDefault: true, category: "backlog" });
    await expect(service.execute(owner, "delete_status", { id: replacement.id, expectedRevision: 2 }, randomUUID())).rejects.toMatchObject({ code: "validation_error" });
    await expect(service.execute(owner, "delete_status", { id: fixture.statuses[7].id, expectedRevision: 1 }, randomUUID())).rejects.toMatchObject({ code: "validation_error" });
  });
  it("preserves project ownership and task references across edits and moves", async () => {
    const project = await service.execute(owner, "create_project", { name: "Stable project", prefix: "STABLE" }, randomUUID()) as { id: string; revision: number };
    const section = await service.execute(owner, "create_section", { projectId: project.id, name: "Destination" }, randomUUID()) as { id: string };
    const parent = await service.execute(owner, "create_task", { projectId: project.id, title: "Stable parent" }, randomUUID()) as { id: string; reference: string };
    const child = await service.execute(owner, "create_task", { projectId: project.id, title: "Stable child", parentTaskId: parent.id }, randomUUID()) as { id: string; reference: string };
    await service.execute(owner, "update_project", { id: project.id, expectedRevision: project.revision, name: "Renamed" }, randomUUID());
    await expect(service.execute(owner, "update_project", { id: project.id, expectedRevision: 2, prefix: "CHANGED" }, randomUUID())).rejects.toBeDefined();
    await service.execute(owner, "update_task", { id: parent.id, expectedRevision: 1, title: "Renamed task" }, randomUUID());
    await service.execute(owner, "move_task", { id: parent.id, expectedRevision: 2, sectionId: section.id, parentTaskId: null }, randomUUID());
    const reader = createWorkReader(database.db);
    expect(await reader.get(owner, "projects", project.id)).toMatchObject({ ownerId: owner.ownerId, prefix: "STABLE" });
    expect(await reader.resolveTask(owner, parent.reference)).toMatchObject({ id: parent.id, ownerId: owner.ownerId, projectId: project.id, sectionId: section.id });
    expect(await reader.resolveTask(owner, child.reference)).toMatchObject({ id: child.id, ownerId: owner.ownerId, projectId: project.id, sectionId: section.id, parentTaskId: parent.id });
  });
  it("serializes conflicting task nesting edits and rejects subtasks of subtasks", async () => {
    const parent = await create("Nesting parent"), middle = await create("Nesting middle"), child = await create("Nesting child");
    const move = (id: string, parentTaskId: string) => service.execute(owner, "move_task", { id, expectedRevision: 1, sectionId: null, parentTaskId }, randomUUID());
    const results = await Promise.allSettled([move(middle.id, parent.id), move(child.id, middle.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "validation_error" } });
    const sub = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, title: "Nested subtask", parentTaskId: parent.id }, randomUUID()) as { id: string };
    await expect(service.execute(owner, "create_task", { projectId: fixture.projects[0].id, title: "Too deep", parentTaskId: sub.id }, randomUUID())).rejects.toMatchObject({ code: "validation_error" });
  });
  it("counts only active leaf work and distinguishes empty and all-canceled sections", async () => {
    const section = await service.execute(owner, "create_section", { projectId: fixture.projects[0].id, name: "Progress" }, randomUUID()) as { id: string };
    const reader = createWorkReader(database.db);
    const progress = async () => (await reader.get(owner, "sections", section.id) as unknown as { progress: unknown }).progress;
    expect(await progress()).toEqual({ done: 0, total: 0, state: "no_tasks", unresolvedParents: 0 });
    const parent = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, sectionId: section.id, title: "Progress parent" }, randomUUID()) as { id: string };
    const canceled = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, sectionId: section.id, parentTaskId: parent.id, title: "Canceled leaf", statusId: fixture.statuses[5].id }, randomUUID()) as { id: string };
    expect(await progress()).toEqual({ done: 0, total: 0, state: "no_active_tasks", unresolvedParents: 1 });
    const done = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, sectionId: section.id, parentTaskId: parent.id, title: "Done leaf", statusId: fixture.statuses[4].id }, randomUUID()) as { id: string };
    expect(await progress()).toEqual({ done: 1, total: 1, state: "active", unresolvedParents: 1 });
    await service.execute(owner, "archive_item", { id: done.id, kind: "task", expectedRevision: 1 }, randomUUID());
    expect(await progress()).toEqual({ done: 0, total: 0, state: "no_active_tasks", unresolvedParents: 1 });
    expect(await reader.get(owner, "tasks", canceled.id)).toMatchObject({ category: "canceled" });
  });
  it("only treats active Done prerequisites as satisfied", async () => {
    const prerequisite = await create("Blocking state"), dependent = await create("Blocked state");
    await service.execute(owner, "add_dependency", { id: dependent.id, expectedRevision: 1, prerequisiteTaskId: prerequisite.id }, randomUUID());
    const reader = createWorkReader(database.db);
    const blocked = async (value: boolean) => expect(await reader.get(owner, "tasks", dependent.id)).toMatchObject({ blocked: value, dependencyBlockers: value ? [prerequisite.id] : [] });
    await blocked(true);
    await service.execute(owner, "transition_task", { id: prerequisite.id, expectedRevision: 1, statusId: fixture.statuses[5].id }, randomUUID());
    await blocked(true);
    await service.execute(owner, "transition_task", { id: prerequisite.id, expectedRevision: 2, statusId: fixture.statuses[4].id }, randomUUID());
    await blocked(false);
    await service.execute(owner, "archive_item", { id: prerequisite.id, kind: "task", expectedRevision: 3, acknowledgeDependentIds: [dependent.id] }, randomUUID());
    await blocked(true);
    await service.execute(owner, "restore_item", { id: prerequisite.id, kind: "task", expectedRevision: 4 }, randomUUID());
    await blocked(false);
  });
  it("uses the owner's Kolkata date boundary and excludes terminal and archived tasks from overdue", async () => {
    const task = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, title: "Date boundary", dueDate: "2026-10-29" }, randomUUID()) as { id: string };
    const reader = createWorkReader(database.db);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-29T18:29:59Z"));
      expect(await reader.get(owner, "tasks", task.id)).toMatchObject({ overdue: false });
      vi.setSystemTime(new Date("2026-10-29T18:30:00Z"));
      expect(await reader.get(owner, "tasks", task.id)).toMatchObject({ overdue: true });
      await service.execute(owner, "transition_task", { id: task.id, expectedRevision: 1, statusId: fixture.statuses[4].id }, randomUUID());
      expect(await reader.get(owner, "tasks", task.id)).toMatchObject({ overdue: false });
      await service.execute(owner, "transition_task", { id: task.id, expectedRevision: 2, statusId: fixture.statuses[5].id }, randomUUID());
      expect(await reader.get(owner, "tasks", task.id)).toMatchObject({ overdue: false });
      await service.execute(owner, "transition_task", { id: task.id, expectedRevision: 3, statusId: fixture.statuses[0].id }, randomUUID());
      await service.execute(owner, "archive_item", { id: task.id, kind: "task", expectedRevision: 4 }, randomUUID());
      expect(await reader.get(owner, "tasks", task.id, true)).toMatchObject({ overdue: false });
    } finally { vi.useRealTimers(); }
  });
  it("restores only selected archive markers and requires explicit archive and exact deletion confirmation", async () => {
    const section = await service.execute(owner, "create_section", { projectId: fixture.projects[0].id, name: "Lifecycle section" }, randomUUID()) as { id: string };
    const task = await service.execute(owner, "create_task", { projectId: fixture.projects[0].id, sectionId: section.id, title: "Lifecycle task" }, randomUUID()) as { id: string };
    const reader = createWorkReader(database.db);
    const attachmentId = randomUUID(), objectKey = `test/${attachmentId}`;
    await database.pool.query("insert into attachments (id, owner_id, task_id, original_name, declared_media_type, declared_size, object_key, upload_expires_at, actor_kind, actor_user_id) values ($1, $2, $3, 'proof.txt', 'text/plain', 1, $4, now(), 'human', $2)", [attachmentId, owner.ownerId, task.id, objectKey]);
    await expect(service.execute(owner, "delete_item", { id: section.id, kind: "section", expectedRevision: 1 }, randomUUID())).rejects.toMatchObject({ code: "validation_error" });
    await service.execute(owner, "archive_item", { id: task.id, kind: "task", expectedRevision: 1 }, randomUUID());
    await service.execute(owner, "archive_item", { id: section.id, kind: "section", expectedRevision: 1 }, randomUUID());
    expect(await service.execute(owner, "restore_item", { id: task.id, kind: "task", expectedRevision: 2 }, randomUUID())).toMatchObject({ effectiveArchived: true, archivedAncestors: [{ id: section.id, kind: "section" }] });
    await service.execute(owner, "archive_item", { id: task.id, kind: "task", expectedRevision: 3 }, randomUUID());
    await service.execute(owner, "restore_item", { id: section.id, kind: "section", expectedRevision: 2 }, randomUUID());
    expect(await reader.get(owner, "tasks", task.id, true)).toMatchObject({ effectiveArchived: true });
    await service.execute(owner, "archive_item", { id: section.id, kind: "section", expectedRevision: 3 }, randomUUID());
    const input = { id: section.id, kind: "section", expectedRevision: 4 };
    const confirmation = { name: "Lifecycle section", sectionCount: 1, taskCount: 1, fileCount: 1 };
    await expect(service.execute(owner, "delete_item", input, randomUUID())).rejects.toMatchObject({ code: "decision_required", details: { confirmation } });
    await expect(service.execute(owner, "delete_item", { ...input, confirmation: { ...confirmation, taskCount: 0 } }, randomUUID())).rejects.toMatchObject({ code: "decision_required" });
    const agent: AgentActor = { kind: "agent", ownerId: owner.ownerId, credentialId: randomUUID(), projectIds: [fixture.projects[0].id!], scopes: actionScopes };
    await expect(service.execute(agent, "delete_item", { ...input, confirmation }, randomUUID())).rejects.toMatchObject({ code: "forbidden" });
    await service.execute(owner, "delete_item", { ...input, confirmation }, randomUUID());
    await expect(reader.get(owner, "tasks", task.id, true)).rejects.toMatchObject({ code: "not_found" });
    expect((await database.pool.query("select id from attachments where id = $1", [attachmentId])).rowCount).toBe(0);
    expect((await database.pool.query("select state, payload from background_jobs where deduplication_key = $1", [`attachment-delete:${attachmentId}`])).rows).toEqual([{ state: "pending", payload: { objectKey, attachmentId } }]);
  });

  it("preserves concurrent note appends, rejects stale updates, and restores history as a new revision", async () => {
    const task = await create("Note history");
    const target = { kind: "task", id: task.id } as const;
    const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    await service.execute(owner, "update_note", { ...target, expectedRevision: 0, content: doc("original") }, randomUUID());
    await Promise.all(["first append", "second append"].map((text) => service.execute(owner, "append_note", { ...target, content: doc(text) }, randomUUID(), randomUUID())));
    const reader = createNoteReader(database.db);
    const current = await reader(owner, target) as { revision: number; content: unknown };
    expect(current.revision).toBe(3);
    expect(JSON.stringify(current.content)).toContain("first append");
    expect(JSON.stringify(current.content)).toContain("second append");
    await expect(service.execute(owner, "update_note", { ...target, expectedRevision: 1, content: doc("stale") }, randomUUID())).rejects.toMatchObject({ code: "conflict" });
    const restored = await service.execute(owner, "restore_note", { ...target, expectedRevision: 3, sourceRevision: 1 }, randomUUID()) as { revision: number; content: unknown };
    expect(restored).toMatchObject({ revision: 4, content: doc("original") });
    const agent: AgentActor = { kind: "agent", ownerId: owner.ownerId, credentialId: randomUUID(), projectIds: [fixture.projects[0].id!], scopes: ["read", "write"] };
    await expect(service.execute(agent, "restore_note", { ...target, expectedRevision: 4, sourceRevision: 1 }, randomUUID())).rejects.toMatchObject({ code: "forbidden" });
  });
  it("searches note text and returns filtered counts before pagination", async () => {
    const task = await create("Unique searchable task");
    await service.execute(owner, "update_note", { kind: "task", id: task.id, expectedRevision: 0, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "zygomorphic searchable note" }] }] } }, randomUUID());
    const reader = createWorkReader(database.db);
    const page = await reader.list(owner, "tasks", { projectId: fixture.projects[0].id, q: "zygomorphic", limit: 1 }) as unknown as { items: { id: string }[]; total: number; statusCounts: Record<string, number> };
    expect(page.items.map((item) => item.id)).toEqual([task.id]); expect(page.total).toBe(1);
    expect(Object.values(page.statusCounts).reduce((sum, count) => sum + count, 0)).toBe(1);
    const search = await reader.list(owner, "search", { q: "zygomorphic" }) as { items: { id: string }[] };
    expect(search.items.map((item) => item.id)).toContain(task.id);
  });

});
