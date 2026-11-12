import { describe, expect, it } from "vitest";
import { addMonths, monthGrid, moveDate } from "./date-picker";

describe("date picker math", () => {
  it("clamps month moves to the last day instead of overflowing", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("moves to week boundaries and adjacent days without changing date semantics", () => {
    expect(moveDate("2026-11-04", "Home")).toBe("2026-11-01");
    expect(moveDate("2026-11-04", "End")).toBe("2026-11-07");
    expect(moveDate("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(moveDate("2026-01-31", "PageDown")).toBe("2026-02-28");
    expect(moveDate("2026-11-04", "Tab")).toBeUndefined();
  });
  it("builds six Sunday-first weeks around the month", () => {
    const grid = monthGrid("2026-10-29");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-27");
    expect(grid).toContain("2026-10-01");
    expect(grid).toContain("2026-10-31");
  });
});
