import { randomUUID } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { AgentActor } from "../../src/server/auth/access";
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { agentCredentials } from "../../src/server/db/schema";
import { createMcpServices, createZenshinMcpServer } from "../../src/server/mcp/server";
import { createTestDatabase } from "../support/postgres";

describe("MCP over shared PostgreSQL services", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let actor: AgentActor;
  const fixture = createFixtureData("development", "mcp");
  const projectId = fixture.projects[0].id!;
  const status = (category: string) => fixture.statuses.find((s) => s.projectId === projectId && s.category === category)!.id!;
  beforeAll(async () => {
    database = await createTestDatabase(); await insertFixtureData(database.db, fixture);
    const [credential] = await database.db.insert(agentCredentials).values({ ownerId: fixture.owner.id, displayName: "MCP integration", scopes: ["read", "write", "upload"] }).returning();
    actor = { kind: "agent", ownerId: fixture.owner.id, credentialId: credential.id, projectIds: [projectId], scopes: ["read", "write", "upload"] };
  }, 30_000);
  afterAll(async () => { await database?.dispose(); });
  async function call(name: string, args: Record<string, unknown>, principal = actor) {
    const handler = createMcpHandler(() => createZenshinMcpServer(principal, createMcpServices(database.db)));
    const response = await handler.fetch(new Request("http://localhost/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
    const text = await response.text();
    const body = response.headers.get("content-type")?.includes("text/event-stream") ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: "))!.slice(6)) : JSON.parse(text);
    return body.result;
  }
  async function create(title: string) {
    const result = await call("create_task", { projectId, title, statusId: status("ready"), idempotencyKey: randomUUID() });
    expect(result.isError).not.toBe(true); return result.structuredContent.data as { id: string; revision: number; reference: string };
  }
  it("finds granted Ready work and denies inaccessible context and aggregate reads", async () => {
    const projects = await call("list_projects", {});
    expect(projects.structuredContent.data.items.map((p: { id: string }) => p.id)).toEqual([projectId]);
    const task = await create("MCP ready work");
    const found = await call("list_tasks", { projectId, categories: ["ready"], q: "MCP ready work", limit: 1 });
    expect(found.structuredContent.data.items[0]).toMatchObject({ id: task.id, reference: task.reference, category: "ready" });
    for (const [tool, args] of [["get_project", { id: fixture.projects[1].id }], ["list_tasks", { projectId: fixture.projects[1].id }], ["list_repositories", { projectId: fixture.projects[1].id }]] as [string, Record<string, unknown>][]) {
      const denied = await call(tool, args); expect(denied.isError).toBe(true); expect(denied.structuredContent.error.code).toBe("not_found");
      expect(JSON.stringify(denied)).not.toContain(fixture.projects[1].name);
    }
  });
  it("creates subtasks, resolves context and appends once across retries with credential activity", async () => {
    const parent = await create("MCP parent");
    const child = await call("create_task", { projectId, parentTaskId: parent.id, title: "MCP child", idempotencyKey: randomUUID() });
    expect(child.isError).not.toBe(true);
    const context = await call("get_task", { reference: child.structuredContent.data.reference });
    expect(context.structuredContent.data).toMatchObject({ parentTaskId: parent.id, parentReference: parent.reference });
    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "MCP progress" }] }] };
    const input = { kind: "task", id: child.structuredContent.data.id, content, idempotencyKey: randomUUID() };
    const first = await call("append_note", input); const replay = await call("append_note", input);
    expect(replay.structuredContent.data).toEqual(first.structuredContent.data);
    expect((await call("get_note", { kind: "task", id: input.id })).structuredContent.data.content.content).toHaveLength(1);
    const activities = await database.pool.query("select actor_kind, actor_credential_id, action from activities where task_id = $1", [input.id]);
    expect(activities.rows).toEqual(expect.arrayContaining([expect.objectContaining({ action: "append_note", actor_kind: "agent", actor_credential_id: actor.credentialId })]));
    expect(activities.rows.filter((a) => a.action === "append_note")).toHaveLength(1);
  });
  it("sends work In review but denies Done via transition/create and completing sections", async () => {
    const task = await create("MCP review");
    const review = await call("transition_task", { id: task.id, expectedRevision: task.revision, statusId: status("in_review") });
    expect(review.isError).not.toBe(true);
    const attempts: [string, Record<string, unknown>][] = [
      ["transition_task", { id: task.id, expectedRevision: review.structuredContent.data.revision, statusId: status("done"), completionAction: "complete_all" }],
      ["create_task", { projectId, title: "Hidden completion", statusId: status("done") }],
      ["create_section", { projectId, name: "Hidden completion", lifecycle: "completed" }],
      ["archive_item", { kind: "task", id: task.id, expectedRevision: review.structuredContent.data.revision }],
    ];
    for (const [name, input] of attempts) expect((await call(name, input)).structuredContent.error.code).toBe("forbidden");
    expect((await call("get_task", { id: task.id })).structuredContent.data.category).toBe("in_review");
  });
  it("preserves conflict details, idempotency conflicts and atomic decision-required completion", async () => {
    const task = await create("MCP decisions");
    await call("create_task", { projectId, parentTaskId: task.id, title: "Open child" });
    const complete: AgentActor = { ...actor, scopes: [...actor.scopes, "complete"] };
    const input = { id: task.id, expectedRevision: task.revision, statusId: status("done"), idempotencyKey: randomUUID() };
    const decision = await call("transition_task", input, complete);
    expect(decision.structuredContent.error).toMatchObject({ code: "decision_required", details: { options: ["keep_open", "complete_all"] } });
    expect((await call("get_task", { id: task.id })).structuredContent.data.revision).toBe(task.revision);
    const done = await call("transition_task", { ...input, completionAction: "complete_all" }, complete);
    expect(done.isError).not.toBe(true);
    const conflict = await call("update_task", { id: task.id, expectedRevision: task.revision, title: "Stale" });
    expect(conflict.structuredContent.error).toMatchObject({ code: "conflict", details: { currentRevision: done.structuredContent.data.revision } });
    const retryKey = randomUUID(); const created = { projectId, title: "MCP retry", idempotencyKey: retryKey };
    const a = await call("create_task", created); const b = await call("create_task", created);
    expect(a.structuredContent.data.id).toBe(b.structuredContent.data.id);
    expect((await call("create_task", { ...created, title: "Changed retry" })).structuredContent.error.code).toBe("idempotency_conflict");
    expect((await call("get_task", { id: task.id }, { ...actor, projectIds: [] })).structuredContent.error.code).toBe("not_found");
  });
  it("enforces archive scope and dependent decisions through moves and creation under archives", async () => {
    const archivist: AgentActor = { ...actor, scopes: [...actor.scopes, "archive"] };
    const section = (await call("create_section", { projectId, name: "Archived destination" })).structuredContent.data;
    await call("archive_item", { kind: "section", id: section.id, expectedRevision: section.revision }, archivist);
    const source = await create("MCP moving prerequisite"), dependent = await create("MCP active dependent");
    await call("add_dependency", { id: dependent.id, expectedRevision: dependent.revision, prerequisiteTaskId: source.id });
    const input = { id: source.id, expectedRevision: source.revision, sectionId: section.id, parentTaskId: null };
    expect((await call("move_task", input)).structuredContent.error.code).toBe("forbidden");
    expect((await call("create_task", { projectId, sectionId: section.id, title: "Implicit archive" })).structuredContent.error.code).toBe("forbidden");
    expect((await call("create_section", { projectId, parentSectionId: section.id, name: "Implicit archive" })).structuredContent.error.code).toBe("forbidden");
    const decision = await call("move_task", input, archivist);
    expect(decision.structuredContent.error).toMatchObject({ code: "decision_required", details: { options: ["acknowledge_dependents"], affected: [{ id: dependent.id, title: "MCP active dependent" }] } });
    expect((await call("get_task", { id: source.id })).structuredContent.data.sectionId).toBeNull();
    const moved = await call("move_task", { ...input, acknowledgeDependentIds: [dependent.id] }, archivist);
    expect(moved.isError).not.toBe(true);
    expect((await call("convert_task", { ...input, expectedRevision: moved.structuredContent.data.revision, sectionId: null })).structuredContent.error.code).toBe("forbidden");
    const group = (await call("create_section", { projectId, name: "Moving subtree" })).structuredContent.data;
    expect((await call("move_section", { id: group.id, expectedRevision: group.revision, parentSectionId: section.id })).structuredContent.error.code).toBe("forbidden");
  });
});
