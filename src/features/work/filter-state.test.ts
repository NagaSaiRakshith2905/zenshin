import { describe, expect, it } from "vitest";
import { decodeTaskQuery } from "@/lib/contracts/task-query";
import { applyFilters, filterValues, taskParams } from "./filter-state";
describe("task filter URLs", () => {
  it("preserves view and descendant scope while replacing and clearing filters", () => {
    const params = applyFilters(new URLSearchParams("view=board&descendants=true&dueFrom=2026-01-01"), { dueFrom: "", categories: "ready,in_progress" });
    expect(params.has("dueFrom")).toBe(false);
    expect(filterValues(params)).toEqual({ categories: "ready,in_progress" });
    expect(decodeTaskQuery(taskParams(params))).toMatchObject({ categories: ["ready", "in_progress"], includeDescendants: true });
  });
});
