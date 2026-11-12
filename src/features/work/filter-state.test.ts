import { describe, expect, it } from "vitest";
import { decodeTaskQuery } from "@/lib/contracts/task-query";
import { activeFilterLabels, applyFilters, clearTaskFilters, filterValues, taskParams } from "./filter-state";
describe("task filter URLs", () => {
  it("clears search filters without losing layout, task or settings location", () => {
    const input = new URLSearchParams("q=panel&categories=ready&archived=true&view=board&task=t1&settings=preferences");
    expect(clearTaskFilters(input, true).toString()).toBe("view=board&task=t1&settings=preferences&q=panel");
    expect(activeFilterLabels(input)).toEqual(["Workflow categories", "Archived work"]);
    expect(activeFilterLabels(new URLSearchParams("readyOnly=false&taskType=all&archiveState=active"))).toEqual([]);
  });
  it("preserves view and descendant scope while replacing and clearing filters", () => {
    const params = applyFilters(new URLSearchParams("view=board&descendants=true&dueFrom=2026-01-01"), { dueFrom: "", categories: "ready,in_progress" });
    expect(params.has("dueFrom")).toBe(false);
    expect(filterValues(params)).toEqual({ categories: "ready,in_progress" });
    expect(decodeTaskQuery(taskParams(params))).toMatchObject({ categories: ["ready", "in_progress"], includeDescendants: true });
  });
});
