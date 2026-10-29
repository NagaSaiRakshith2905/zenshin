import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("./api", () => ({
  useEntity: () => ({ data: undefined, error: null, isPending: false, refetch: vi.fn() }),
  useCollection: (resource: string) => ({ items: resource === "my-work" ? [{ id: "task-one", reference: "ZEN-1", title: "One overdue task", category: "in_progress", overdue: true, effectiveArchived: false, dueDate: "2026-10-28", priority: "high", parentTaskId: null, blocked: true }] : [], data: {}, error: null, isPending: false, refetch: vi.fn(), hasNextPage: false }),
}));
import { WorkView } from "./view";

describe("core workspace composition", () => {
  it("renders non-overlapping My work groups and useful task links without later-phase feature controls", () => {
    const html = renderToStaticMarkup(createElement(WorkView));
    expect(html.match(/One overdue task/g)).toHaveLength(1);
    expect(html).toContain('href="/?task=task-one"');
    for (const group of ["Overdue", "In progress", "In review", "Ready"]) expect(html).toContain(group);
    expect(html).toContain("Blocked");
    expect(html).not.toContain("Upload attachment");
    expect(html).not.toContain("Sync GitHub");
    expect(html).not.toContain("Autosave");
  });
});
