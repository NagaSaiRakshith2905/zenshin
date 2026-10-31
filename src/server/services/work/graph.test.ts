import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type AgentActor, type HumanActor } from "@/server/auth/access";
import { assertArchiveChange, type Graph } from "./graph";

const agent: AgentActor = { kind: "agent", ownerId: "owner", credentialId: "credential", scopes: ["write"], projectIds: ["project"] };
const tasks = [{ id: "source", title: "Source", archived: false, terminal: false }, { id: "dependent", title: "Dependent", archived: false, terminal: false }];
const graph = {
  project: { id: "project", ownerId: "owner" }, edges: [{ taskId: "dependent", prerequisiteTaskId: "source" }],
  task: (id: string) => tasks.find((t) => t.id === id)!, archived: (task: typeof tasks[number]) => task.archived,
  terminal: (task: typeof tasks[number]) => task.terminal,
} as unknown as Graph;

it("requires archive scope for implicit archive and restore, including creates", () => {
  for (const [before, after] of [[false, true], [true, false]]) {
    expect(() => assertArchiveChange(agent, graph, before, after)).toThrow(expect.objectContaining({ code: "forbidden" }));
  }
  expect(() => assertArchiveChange(agent, graph, false, false)).not.toThrow();
  expect(() => assertArchiveChange(agent, graph, true, true)).not.toThrow();
});
it("requires explicit dependent acknowledgment before an archive-changing move", () => {
  const actor: AgentActor = { ...agent, scopes: ["write", "archive"] };
  expect(() => assertArchiveChange(actor, graph, false, true, ["source"])).toThrow(expect.objectContaining({ code: "decision_required", details: { options: ["acknowledge_dependents"], affected: [{ id: "dependent", title: "Dependent" }] } }));
  expect(() => assertArchiveChange(actor, graph, false, true, ["source"], ["dependent"])).not.toThrow();
  expect(() => assertArchiveChange(actor, graph, false, true, ["source", "dependent"])).not.toThrow();
  expect(() => assertArchiveChange(actor, graph, true, false, ["source"])).not.toThrow();
});
it("keeps owner moves subject to dependent decisions", () => {
  const owner: HumanActor = { kind: "human", ownerId: "owner", credentialId: null, scopes: actionScopes, projectIds: null };
  expect(() => assertArchiveChange(owner, graph, false, true, ["source"])).toThrow(expect.objectContaining({ code: "decision_required" }));
});
