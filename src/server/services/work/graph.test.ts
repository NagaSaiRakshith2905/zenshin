import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type AgentActor, type HumanActor } from "@/server/auth/access";
import { assertArchiveChange, buildGraph, type Graph } from "./graph";
import { createFixtureData } from "@/server/db/fixtures";
import type { Rows } from "./store";

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

it("preserves blocker, archive, breadcrumb and child-progress rules in a task-page projection", () => {
  const data = createFixtureData("development", "projected-graph");
  const project = data.projects[0] as Rows["projects"];
  const projectTasks = data.tasks.filter((t) => t.projectId === project.id) as Rows["tasks"][];
  const context = {
    sections: data.sections.filter((s) => s.projectId === project.id) as Rows["sections"][],
    statuses: data.statuses.filter((s) => s.projectId === project.id) as Rows["task_statuses"][],
    edges: data.dependencies.filter((e) => e.projectId === project.id),
  };
  const full = buildGraph(project, { ...context, tasks: projectTasks });
  // Page contains parent 1, child 2 and dependent 4. Child 3 and prerequisites
  // 8/10 are required context; unrelated tasks are deliberately absent.
  const projected = buildGraph(project, { ...context, tasks: projectTasks.filter((t) => [1, 2, 3, 4, 8, 10].includes(t.number)) });
  for (const number of [1, 2, 4]) {
    const task = projectTasks.find((t) => t.number === number)!;
    expect(projected.archived(task)).toBe(full.archived(task));
    expect(projected.blockers(task)).toEqual(full.blockers(task));
    expect(projected.ancestors(task.sectionId)).toEqual(full.ancestors(task.sectionId));
  }
  const parent = projectTasks.find((t) => t.number === 1)!;
  expect(projected.progress(projected.tasks.filter((t) => t.parentTaskId === parent.id))).toEqual({ done: 2, total: 2, state: "active", unresolvedParents: 0 });
  const dependent = projectTasks.find((t) => t.number === 4)!;
  expect(projected.blockers(dependent)).toHaveLength(2); // archived Done and canceled prerequisites
  expect(projected.ancestors(dependent.sectionId)).toHaveLength(3);
});
