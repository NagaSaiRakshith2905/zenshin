import { describe, expect, it } from "vitest";
import { calendarDate, commands, listInput, normalizeName } from "./work";

describe("domain input boundaries", () => {
  it("rejects impossible dates, implicit authority and mutable property types", () => {
    expect(calendarDate.safeParse("2026-02-29").success).toBe(false);
    expect(calendarDate.parse("2028-02-29")).toBe("2028-02-29");
    expect(commands.create_project.safeParse({ name: "Project", prefix: "PR", ownerId: "forged" }).success).toBe(false);
    expect(commands.update_property.safeParse({ id: "00000000-0000-4000-8000-000000000001", expectedRevision: 1, type: "number" }).success).toBe(false);
  });
  it("keeps false archive flags false and bounds list sizes", () => {
    expect(listInput.parse({ includeArchived: "false" }).includeArchived).toBe(false);
    expect(listInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(normalizeName("  Ｆoo\t BAR ")).toBe("foo bar");
  });
});
