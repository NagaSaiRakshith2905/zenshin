import { describe, expect, it } from "vitest";
import { calendarDate, commands, listInput, normalizeName } from "./work";

describe("domain input boundaries", () => {
  it("rejects impossible dates, implicit authority and invalid property icons", () => {
    expect(calendarDate.safeParse("2026-02-29").success).toBe(false);
    expect(calendarDate.parse("2028-02-29")).toBe("2028-02-29");
    expect(commands.create_project.safeParse({ name: "Project", prefix: "PR", ownerId: "forged" }).success).toBe(false);
    expect(commands.update_property.safeParse({ id: "00000000-0000-4000-8000-000000000001", expectedRevision: 1, type: "number", icon: "invalid" }).success).toBe(false);
    expect(commands.update_property.safeParse({ id: "00000000-0000-4000-8000-000000000001", expectedRevision: 1, type: "number", icon: null }).success).toBe(true);
  });
  it("keeps false archive flags false and bounds list sizes", () => {
    expect(listInput.parse({ includeArchived: "false" }).includeArchived).toBe(false);
    expect(listInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(normalizeName("  Ｆoo\t BAR ")).toBe("foo bar");
  });
});

it("leaves omitted fields out of updates", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(commands.update_task.parse({ id, expectedRevision: 1, priority: "high" })).toEqual({ id, expectedRevision: 1, priority: "high" });
  expect(commands.update_section.parse({ id, expectedRevision: 1, name: "x" })).not.toHaveProperty("description");
});
