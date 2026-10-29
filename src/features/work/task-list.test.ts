import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "./types";
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("./api", () => ({ useEntity: () => ({ data: undefined }) }));
import { TaskList } from "./task-list";
const base = { id: "parent", reference: "ZEN-1", title: "Parent", category: "ready", priority: "none", parentTaskId: null, dueDate: null, blocked: false, progress: { done: 0, total: 2, state: "active", unresolvedParents: 0 } } as unknown as Task;
describe("filtered task grouping", () => {
  it("shows only the subtasks returned by the filtered page", () => {
    const child = { ...base, id: "child", reference: "ZEN-2", title: "Matching child", parentTaskId: "parent", progress: undefined };
    const html = renderToStaticMarkup(createElement(TaskList, { tasks: [base, child] }));
    expect(html).toContain("Matching child"); expect(html.match(/Matching child/g)).toHaveLength(1); expect(html).not.toContain("Unmatched child");
  });
});
