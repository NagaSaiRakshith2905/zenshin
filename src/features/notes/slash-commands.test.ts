import { describe, expect, it } from "vitest";
import { filterSlashCommands } from "./slash-commands";

describe("slash commands", () => {
  it("matches command and word prefixes case-insensitively", () => {
    expect(filterSlashCommands("HEad")).toEqual(["Heading 1", "Heading 2", "Heading 3"]);
    expect(filterSlashCommands("list")).toEqual(["Bulleted list", "Numbered list", "To-do list"]);
    expect(filterSlashCommands("divider")).toEqual([]);
    expect(filterSlashCommands("eading")).toEqual([]);
  });
  it("matches aliases", () => {
    for (const [query, expected] of [["h1", "Heading 1"], ["todo", "To-do list"], ["check", "To-do list"], ["code", "Code block"], ["file", "Attachment"], ["attach", "Attachment"]]) {
      expect(filterSlashCommands(query)).toContain(expected);
    }
  });
});
