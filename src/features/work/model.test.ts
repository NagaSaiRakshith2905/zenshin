import { describe, expect, it } from "vitest";
import { taskHref, withoutTask, workGroup } from "./model";

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
