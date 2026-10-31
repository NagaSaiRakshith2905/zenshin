import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/actors", () => ({ authenticateAgent: vi.fn() }));
vi.mock("@/server/jobs/schedule", () => ({ scheduleJobs: vi.fn() }));
vi.mock("@/server/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@/server/services/work", async (original) => ({ ...await original<object>(), createWorkReader: vi.fn(), createWorkService: vi.fn() }));
vi.mock("@/server/services/work/notes", async (original) => ({ ...await original<object>(), createNoteReader: vi.fn() }));
vi.mock("@/server/services/attachments", () => ({ createAttachmentService: vi.fn() }));
vi.mock("@/server/services/github", () => ({ createGithubService: vi.fn() }));
import { AccessError, type AgentActor } from "@/server/auth/access";
import { authenticateAgent } from "@/server/auth/actors";
import { scheduleJobs } from "@/server/jobs/schedule";
import { GithubError } from "@/server/integrations/github";
import { createAttachmentService } from "@/server/services/attachments";
import { createGithubService } from "@/server/services/github";
import { createWorkReader, createWorkService } from "@/server/services/work";
import { createNoteReader } from "@/server/services/work/notes";
import { DomainError } from "@/server/services/work/foundation";
import { mcpRoute } from "./http";

const id = "11111111-1111-4111-8111-111111111111";
const actor: AgentActor = { kind: "agent", ownerId: "github:987654321", credentialId: id, projectIds: [id], scopes: ["read", "write", "upload"] };
const work = { execute: vi.fn(), commands: {} };
const reader = { list: vi.fn(), get: vi.fn(), resolveTask: vi.fn() };
const attachments = { list: vi.fn(), begin: vi.fn(), finalize: vi.fn(), download: vi.fn(), remove: vi.fn() };
const github = { repositories: vi.fn(), issues: vi.fn(), taskLinks: vi.fn(), importIssue: vi.fn(), link: vi.fn(), unlink: vi.fn() };
const note = vi.fn();
function request(method: string, params?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${"a".repeat(40)}`, ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }) });
}
async function rpc(method: string, params?: unknown, headers?: Record<string, string>) {
  const response = await mcpRoute(request(method, params, headers));
  const text = await response.text();
  const body = response.headers.get("content-type")?.includes("text/event-stream") ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: "))!.slice(6)) : JSON.parse(text);
  return { response, body };
}
const call = (name: string, args = {}) => rpc("tools/call", { name, arguments: args });
beforeEach(() => {
  vi.stubEnv("APP_ENV", "development"); vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.mocked(authenticateAgent).mockResolvedValue(actor);
  vi.mocked(createWorkService).mockReturnValue(work as unknown as ReturnType<typeof createWorkService>);
  vi.mocked(createWorkReader).mockReturnValue(reader);
  vi.mocked(createNoteReader).mockReturnValue(note);
  vi.mocked(createAttachmentService).mockReturnValue(attachments);
  vi.mocked(createGithubService).mockReturnValue(github as unknown as ReturnType<typeof createGithubService>);
  reader.list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  reader.get.mockResolvedValue({ id, revision: 2 }); reader.resolveTask.mockResolvedValue({ id, reference: "TRACK-42" });
  work.execute.mockResolvedValue({ id, revision: 3, position: 1024n });
  note.mockResolvedValue({ revision: 2, content: { type: "doc", content: [{ type: "paragraph" }] } });
  attachments.list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  attachments.finalize.mockResolvedValue({ id, state: "ready" });
  attachments.download.mockResolvedValue({ url: "https://storage.invalid/signed", expiresAt: "2026-10-30T12:00:00Z" });
  github.taskLinks.mockResolvedValue({ items: [{ id, freshness: "Refreshing", jobId: id }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated stateless MCP HTTP", () => {
  it("requires an agent on discovery even when a browser cookie is present", async () => {
    vi.mocked(authenticateAgent).mockRejectedValueOnce(new AccessError("unauthenticated", "Supply an agent bearer credential."));
    const response = await mcpRoute(new Request("http://localhost:3000/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "session=owner" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
    const body = await response.json();
    expect(response.status).toBe(401); expect(body.error.code).toBe("unauthenticated");
    expect(vi.mocked(authenticateAgent).mock.calls[0][0].has("authorization")).toBe(false);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="zenshin"');
    expect(response.headers.get("www-authenticate")).not.toContain("resource_metadata");
    expect(reader.list).not.toHaveBeenCalled(); expect(scheduleJobs).not.toHaveBeenCalled();
  });
  it("rejects foreign Origin and Host before tool discovery", async () => {
    for (const headers of [{ Origin: "https://evil.invalid" }, { Host: "evil.invalid" }] as Record<string, string>[]) {
      expect((await rpc("tools/list", undefined, headers)).response.status).toBe(403);
    }
    expect(authenticateAgent).not.toHaveBeenCalled();
  });
  it("rechecks the key on every request, including revoked and throttled requests", async () => {
    expect((await rpc("tools/list")).response.status).toBe(200);
    vi.mocked(authenticateAgent).mockRejectedValueOnce(new AccessError("unauthenticated", "Replace this credential."));
    expect((await rpc("tools/list")).response.status).toBe(401);
    vi.mocked(authenticateAgent).mockRejectedValueOnce(new AccessError("rate_limited", "Wait."));
    const limited = await rpc("tools/list");
    expect(limited.response.status).toBe(429); expect(limited.response.headers.get("retry-after")).toBe("60");
    expect(authenticateAgent).toHaveBeenCalledTimes(3);
  });
  it("discovers every canonical tool with object schemas and no owner-only or universal tool", async () => {
    const { body, response } = await rpc("tools/list");
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toHaveLength(38);
    expect(names).toEqual(expect.arrayContaining(["list_projects", "get_project", "list_sections", "get_section", "create_section", "update_section", "move_section", "list_tasks", "get_task", "create_task", "update_task", "move_task", "convert_task", "transition_task", "list_labels", "set_task_labels", "list_properties", "set_task_properties", "add_dependency", "remove_dependency", "get_note", "update_note", "append_note", "list_attachments", "get_attachment_download", "begin_attachment_upload", "finalize_attachment_upload", "archive_item", "restore_item", "list_repositories", "list_github_issues", "link_github_item", "unlink_github_item", "import_github_issue", "refresh_github", "search", "list_activity"]));
    expect(names).not.toEqual(expect.arrayContaining(["delete_item"]));
    expect(names.some((name: string) => /execute|credential|export|delete|create_project/.test(name))).toBe(false);
    for (const tool of body.result.tools) expect(tool.inputSchema.type).toBe("object");
    expect(response.headers.has("mcp-session-id")).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(scheduleJobs).toHaveBeenCalledWith(actor.ownerId);
    expect(reader.list).not.toHaveBeenCalled(); expect(JSON.stringify(body)).not.toContain(actor.ownerId);
  });
  it("supports legacy initialization without allocating a session and rejects GET/DELETE", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "compatibility-test", version: "1" } });
    expect(init.body.result.serverInfo.name).toBe("zenshin"); expect(init.response.headers.has("mcp-session-id")).toBe(false);
    for (const method of ["GET", "DELETE"]) {
      const response = await mcpRoute(new Request("http://localhost:3000/api/mcp", { method }));
      expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("POST");
    }
  });
  it("serves current stateless discovery and calls with per-request metadata", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
    const headers = { "MCP-Protocol-Version": "2026-07-28", "MCP-Method": "server/discover" };
    const discovered = await rpc("server/discover", { _meta: meta }, headers);
    expect(discovered.body.error).toBeUndefined();
    expect(discovered.body.result).toBeTruthy();
    const called = await rpc("tools/call", { _meta: meta, name: "list_projects", arguments: {} }, { ...headers, "MCP-Method": "tools/call", "MCP-Name": "list_projects" });
    expect(called.body.error).toBeUndefined();
    expect(reader.list).toHaveBeenCalledWith(actor, "projects", expect.objectContaining({ limit: 50 }));
    expect(called.response.headers.has("mcp-session-id")).toBe(false);
  });
  it("validates bounded input and prevents hidden fields/status changes/owner-only actions", async () => {
    for (const [name, args] of [
      ["list_tasks", { limit: 101 }], ["create_task", { projectId: id, title: "Bad", ownerId: id }],
      ["update_task", { id, expectedRevision: 1, statusId: id }], ["archive_item", { kind: "project", id, expectedRevision: 1 }],
      ["begin_attachment_upload", { kind: "task", id, originalName: "x.txt", declaredMediaType: "text/plain", declaredSize: 1 }],
      ["delete_item", { kind: "task", id, expectedRevision: 1 }],
    ] as [string, Record<string, unknown>][]) {
      const { body } = await call(name, args); expect(Boolean(body.error || body.result?.isError)).toBe(true);
    }
    expect(work.execute).not.toHaveBeenCalled(); expect(attachments.begin).not.toHaveBeenCalled();
    const invalid = await call("update_task", { id, expectedRevision: 0 });
    expect(invalid.body.result.structuredContent.error).toMatchObject({ code: "validation_error", fields: expect.any(Array) });
  });
  it("routes revisions/idempotency directly to services and serializes bigint", async () => {
    const args = { id, expectedRevision: 2, title: "Changed", idempotencyKey: "same-key" };
    const { body } = await call("update_task", args);
    expect(work.execute).toHaveBeenCalledWith(actor, "update_task", { id, expectedRevision: 2, title: "Changed" }, expect.any(String), "same-key");
    expect(body.result.structuredContent.data).toMatchObject({ revision: 3, position: "1024" });
    expect(body.result.structuredContent.requestId).toBeTruthy();
    await call("convert_task", { id, expectedRevision: 2, sectionId: null, parentTaskId: null });
    expect(work.execute).toHaveBeenLastCalledWith(actor, "move_task", expect.objectContaining({ id, parentTaskId: null }), expect.any(String), undefined);
  });
  it("preserves structured conflicts and decision-required choices without retrying", async () => {
    for (const code of ["conflict", "decision_required", "idempotency_conflict", "not_found"] as const) {
      work.execute.mockRejectedValueOnce(new DomainError(code, "Read before retrying.", { currentRevision: 4, options: ["keep_open", "complete_all"] }));
      const { body } = await call("transition_task", { id, expectedRevision: 2, statusId: id });
      expect(body.result.isError).toBe(true);
      expect(body.result.structuredContent.error).toMatchObject({ code, details: { currentRevision: 4, options: ["keep_open", "complete_all"] }, requestId: expect.any(String) });
    }
    expect(work.execute).toHaveBeenCalledTimes(4);
  });
  it("passes full task filters, resolves references and requests GitHub freshness", async () => {
    await call("list_tasks", { projectId: id, categories: ["ready"], propertyFilters: [{ definitionId: id, op: "checked", value: true }], limit: 10 });
    expect(reader.list).toHaveBeenCalledWith(actor, "tasks", expect.objectContaining({ categories: ["ready"], limit: 10, propertyFilters: [{ definitionId: id, op: "checked", value: true }] }));
    const { body } = await call("get_task", { reference: "TRACK-42", includeArchived: true, includeGithub: true });
    expect(reader.resolveTask).toHaveBeenCalledWith(actor, "TRACK-42", true);
    expect(body.result.structuredContent.data.github.items[0].freshness).toBe("Refreshing");
  });
  it("supports atomic note append and direct upload instructions/finalization/download", async () => {
    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Progress" }] }] };
    await call("append_note", { kind: "task", id, content, idempotencyKey: "append-once" });
    expect(work.execute).toHaveBeenCalledWith(actor, "append_note", { kind: "task", id, content }, expect.any(String), "append-once");
    const instructions = { upload: { method: "PUT", url: "https://storage.invalid/signed", headers: { "If-None-Match": "*", "Content-Type": "text/plain", "Content-Length": "1" } } };
    attachments.begin.mockResolvedValueOnce(instructions);
    const uploaded = await call("begin_attachment_upload", { kind: "task", id, originalName: "x.txt", declaredMediaType: "text/plain", declaredSize: 1, idempotencyKey: "upload-once" });
    expect(uploaded.body.result.structuredContent.data).toEqual(instructions);
    await call("finalize_attachment_upload", { id }); expect(attachments.finalize).toHaveBeenCalledWith(actor, { id }, expect.any(String));
    await call("get_attachment_download", { id }); expect(attachments.download).toHaveBeenCalledWith(actor, { id });
  });
  it("returns safe provider/rate-limit failures and suppresses unexpected error details", async () => {
    github.issues.mockRejectedValueOnce(new GithubError(429, new Date("2026-10-30T12:00:00Z")));
    const limited = await call("list_github_issues", { projectId: id, repositoryId: id });
    expect(limited.body.result.structuredContent.error).toMatchObject({ code: "rate_limited", details: { retryAt: "2026-10-30T12:00:00.000Z" } });
    github.issues.mockRejectedValueOnce(new GithubError(503));
    expect((await call("list_github_issues", { projectId: id, repositoryId: id })).body.result.structuredContent.error.code).toBe("integration_unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    work.execute.mockRejectedValueOnce(new Error("database password=private-value SQL=private-note"));
    const failed = await call("update_task", { id, expectedRevision: 1, title: "Next" });
    expect(failed.body.result.structuredContent.error.code).toBe("internal_error");
    expect(JSON.stringify(failed.body)).not.toContain("private-value"); expect(JSON.stringify(log.mock.calls)).not.toContain("private-note");
  });
  it("rejects oversized bodies before service construction", async () => {
    const { response } = await rpc("tools/call", { name: "append_note", arguments: { content: "x".repeat(1_200_001) } });
    expect(response.status).toBe(413); expect(createWorkService).not.toHaveBeenCalled();
  });
});
