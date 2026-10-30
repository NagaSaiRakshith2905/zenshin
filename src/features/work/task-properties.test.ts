import { describe, expect, it } from "vitest";
import { categories } from "@/lib/contracts/work";
import { categoryColors, categoryGroup, defaultPropertyName, formatValue, optionColor } from "./task-properties";

describe("task property helpers", () => {
  it("maps every status category to a color and group", () => {
    expect(categories.map((c) => [categoryColors[c], categoryGroup(c)])).toEqual([["gray", "To-do"], ["blue", "To-do"], ["amber", "In progress"], ["purple", "In progress"], ["green", "Complete"], ["gray", "Complete"]]);
  });
  it("uses the first available normalized default name", () => {
    expect(defaultPropertyName("text", [{ name: "TEXT 1" }, { name: "Text 3" }])).toBe("Text 2");
    expect(defaultPropertyName("multi_select", [])).toBe("Multi-select 1");
  });
  it("uses stable option colors and formats empty and populated values", () => {
    expect(optionColor("option-1")).toBe(optionColor("option-1"));
    expect(formatValue([])).toBe("Empty");
    expect(formatValue(false)).toBe("false");
    expect(formatValue(["one", "two"])).toBe("one, two");
  });
});
