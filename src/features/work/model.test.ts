import { describe, expect, it } from "vitest";
import { optimisticChange, taskHref, withoutTask, workGroup } from "./model";

describe("workspace navigation and grouping", () => {
  it("puts overdue first without counting the same task twice", () => {
    expect(workGroup({ category: "in_progress", overdue: true, effectiveArchived: false })).toBe("overdue");
    expect(workGroup({ category: "in_review", overdue: false, effectiveArchived: false })).toBe("in_review");
    expect(workGroup({ category: "ready", overdue: false, effectiveArchived: false })).toBe("ready");
    expect(workGroup({ category: "backlog", overdue: false, effectiveArchived: false })).toBeNull();
    expect(workGroup({ category: "done", overdue: true, effectiveArchived: false })).toBeNull();
    expect(workGroup({ category: "ready", overdue: true, effectiveArchived: true })).toBeNull();
  });
  it("retains list scope and sorting when opening and closing task URLs", () => {
    const href = taskHref("/projects/example/tasks", "sort=due_date&descendants=true&archived=true", "task-id");
    expect(href).toBe("/projects/example/tasks?sort=due_date&descendants=true&archived=true&task=task-id");
    expect(withoutTask("/projects/example/tasks", href.split("?")[1])).toBe("/projects/example/tasks?sort=due_date&descendants=true&archived=true");
    expect(withoutTask("/", "task=task-id")).toBe("/");
  });
});

describe("optimisticChange", () => {
  const row = { properties: { a: "x", b: 2 }, prerequisiteTaskIds: ["p1"] };
  it("patches plain fields as given", () => { expect(optimisticChange(undefined, { priority: "high" }, () => undefined)!(row)).toEqual({ priority: "high" }); });
  it("carries the status category for transitions", () => { expect(optimisticChange("transition", { statusId: "s" }, () => ({ category: "done", name: "Done" }))!(row)).toEqual({ statusId: "s", category: "done", statusName: "Done" }); });
  it("merges property values and drops cleared ones", () => { expect(optimisticChange("properties", { values: { a: null, c: true } }, () => undefined)!(row)).toEqual({ properties: { b: 2, c: true } }); });
  it("adds and removes prerequisites", () => {
    expect(optimisticChange("add-dependency", { prerequisiteTaskId: "p2" }, () => undefined)!(row)).toEqual({ prerequisiteTaskIds: ["p1", "p2"] });
    expect(optimisticChange("remove-dependency", { prerequisiteTaskId: "p1" }, () => undefined)!(row)).toEqual({ prerequisiteTaskIds: [] });
  });
  it("leaves unknown actions to the server", () => { expect(optimisticChange("move", {}, () => undefined)).toBeNull(); });
});
