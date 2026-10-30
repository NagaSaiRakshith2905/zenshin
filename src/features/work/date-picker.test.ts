import { describe, expect, it } from "vitest";
import { addMonths, monthGrid } from "./date-picker";

describe("date picker math", () => {
  it("clamps month moves to the last day instead of overflowing", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("builds six Sunday-first weeks around the month", () => {
    const grid = monthGrid("2026-10-29");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-09-27");
    expect(grid).toContain("2026-10-01");
    expect(grid).toContain("2026-10-31");
  });
});
