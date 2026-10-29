import { describe, expect, it } from "vitest";
import { emptyNote, noteDocument, noteMarkdown, safeNoteLink } from "./notes";
describe("note document boundaries", () => {
  it("rejects unsafe links, unsupported nodes and malformed structure", () => {
    expect(safeNoteLink("javascript:alert(1)")).toBe(false);
    expect(safeNoteLink("https://example.com")).toBe(true);
    expect(noteDocument.safeParse({ type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/x" } }] }).success).toBe(false);
    expect(noteDocument.safeParse({ type: "doc", content: [{ type: "text", text: "invalid" }] }).success).toBe(false);
  });
  it("derives markdown without interpreting raw HTML", () => {
    expect(noteDocument.parse(emptyNote()).type).toBe("doc");
    expect(noteMarkdown({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<script>" }] }] })).toContain("\\<script\\>");
  });
});
