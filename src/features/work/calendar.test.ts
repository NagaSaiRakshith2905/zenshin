import { describe, expect, it } from "vitest";
import { dateKey, groupByDue, monthGrid, readShown } from "./calendar";

describe("task calendar", () => {
  it("builds Sunday-first local dates across month and year boundaries", () => {
    const days = monthGrid(new Date(2024, 1, 15));
    expect(days).toHaveLength(35);
    expect(dateKey(days[0])).toBe("2024-01-28");
    expect(dateKey(days[32])).toBe("2024-02-29");
    expect(dateKey(days[34])).toBe("2024-03-02");
    expect(dateKey(monthGrid(new Date(2023, 0, 1))[0])).toBe("2023-01-01");
  });
  it("groups date-only values without shifting them and keeps undated tasks", () => {
    const tasks = [{ dueDate: "2024-02-29", id: 1 }, { dueDate: null, id: 2 }, { dueDate: "2024-02-29", id: 3 }];
    const groups = groupByDue(tasks);
    expect(groups.get("2024-02-29")).toEqual([tasks[0], tasks[2]]);
    expect(groups.get("")).toEqual([tasks[1]]);
  });
  it("reads saved visible properties and falls back to labels", () => {
    expect(readShown('["priority","p1"]')).toEqual(["priority", "p1"]);
    expect(readShown(null)).toEqual(["labels"]);
    expect(readShown("{bad")).toEqual(["labels"]);
    expect(readShown("[1]")).toEqual(["labels"]);
  });
});
