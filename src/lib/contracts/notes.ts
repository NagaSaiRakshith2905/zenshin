import { z } from "zod";
export type NoteMark = { type: "bold" | "italic" | "strike" | "code" | "link"; attrs?: { href: string; target?: string | null; rel?: string | null; class?: null } };
export type NoteNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: NoteMark[]; content?: NoteNode[] };
export type NoteDocument = NoteNode & { type: "doc"; content: NoteNode[] };
export const emptyNote = (): NoteDocument => ({ type: "doc", content: [{ type: "paragraph" }] });
export function safeNoteLink(value: string) {
  if (/[\u0000-\u0020\u007f]/.test(value)) return false;
  try { const url = new URL(value); return ["https:", "http:", "mailto:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
const mark = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("link"), attrs: z.strictObject({ href: z.string().max(2048).refine(safeNoteLink, "Use an absolute http, https or mailto link."), target: z.enum(["_blank", "_self"]).nullable().optional(), rel: z.string().max(100).nullable().optional(), class: z.null().optional() }) }),
  ...["bold", "italic", "strike", "code"].map((type) => z.strictObject({ type: z.literal(type) })),
]);
const inline = new Set(["text", "hardBreak"]);
const blocks = new Set(["paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "taskList"]);
export function validateNote(value: unknown): NoteDocument {
  if (new TextEncoder().encode(JSON.stringify(value) ?? "").byteLength > 1_048_576) throw new Error("Notes are limited to 1 MiB of structured content.");
  let count = 0;
  const visit = (raw: unknown, depth: number, parent?: string): NoteNode => {
    if (++count > 10000 || depth > 32) throw new Error("The note has too many nodes or nested levels.");
    const node = z.strictObject({ type: z.string(), text: z.string().optional(), attrs: z.record(z.string(), z.unknown()).optional(), marks: z.array(mark).max(5).optional(), content: z.array(z.unknown()).optional() }).parse(raw);
    const children = node.content ?? [];
    if (node.type === "text") {
      if (!node.text || node.content || node.attrs || (parent === "codeBlock" && node.marks?.length)) throw new Error("Invalid text node.");
    } else {
      if (node.text !== undefined || node.marks?.length) throw new Error("Only text supports formatting marks.");
      const childTypes = children.map((c) => (c as { type?: string } | null)?.type ?? "");
      const all = (types: Set<string>) => childTypes.every((t) => types.has(t));
      if (["paragraph", "heading"].includes(node.type)) { if (!all(inline)) throw new Error("Paragraphs and headings contain inline content only."); }
      else if (node.type === "doc" || node.type === "blockquote") { if (!children.length || !all(blocks)) throw new Error("Documents and quotes need supported blocks."); }
      else if (node.type === "codeBlock") { if (!childTypes.every((t) => t === "text")) throw new Error("Code blocks contain plain text only."); }
      else if (["bulletList", "orderedList", "taskList"].includes(node.type)) { if (!children.length || !childTypes.every((t) => t === (node.type === "taskList" ? "taskItem" : "listItem"))) throw new Error("Invalid list structure."); }
      else if (["listItem", "taskItem"].includes(node.type)) { if (childTypes[0] !== "paragraph" || !all(blocks)) throw new Error("List items start with a paragraph."); }
      else if (node.type === "hardBreak") { if (children.length) throw new Error("Invalid line break."); }
      else throw new Error("This note contains an unsupported node.");
    }
    let attrs: Record<string, unknown> | undefined;
    if (node.type === "heading") attrs = z.strictObject({ level: z.number().int().min(1).max(3) }).parse(node.attrs);
    else if (node.type === "orderedList") attrs = z.strictObject({ start: z.number().int().min(1).max(1_000_000).default(1), type: z.null().optional() }).parse(node.attrs ?? {});
    else if (node.type === "taskItem") attrs = z.strictObject({ checked: z.boolean() }).parse(node.attrs);
    else if (node.type === "codeBlock") attrs = z.strictObject({ language: z.string().regex(/^[\w+-]{1,40}$/).nullable().optional() }).parse(node.attrs ?? {});
    else if (node.attrs && Object.keys(node.attrs).length) throw new Error("Unsupported note attributes.");
    return { type: node.type, ...(node.text === undefined ? {} : { text: node.text }), ...(attrs ? { attrs } : {}), ...(node.marks?.length ? { marks: node.marks as NoteMark[] } : {}), ...(node.content ? { content: children.map((c) => visit(c, depth + 1, node.type)) } : {}) };
  };
  const doc = visit(value, 0);
  if (doc.type !== "doc") throw new Error("A note must be a document.");
  return doc as NoteDocument;
}
export const noteDocument = z.unknown().transform((value, ctx) => { try { return validateNote(value); } catch (e) { ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "Invalid note." }); return z.NEVER; } });
export const noteTarget = z.strictObject({ kind: z.enum(["project", "section", "task"]), id: z.uuid() });
export const noteUpdate = noteTarget.extend({ expectedRevision: z.number().int().nonnegative(), content: noteDocument });
export const noteAppend = noteTarget.extend({ content: noteDocument });
export const noteRestore = noteTarget.extend({ expectedRevision: z.number().int().positive(), sourceRevision: z.number().int().positive() });
export function notePlainText(node: NoteNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(notePlainText).join(["doc", "blockquote", "bulletList", "orderedList", "taskList", "listItem", "taskItem"].includes(node.type) ? "\n" : "");
}
const escapeMd = (s: string) => s.replace(/([\\`*_[\]<>!#|])/g, "\\$1");
export function noteMarkdown(node: NoteNode): string {
  if (node.type === "text") {
    let text = escapeMd(node.text ?? "");
    for (const mark of node.marks ?? []) {
      if (mark.type === "code") { const raw = node.text ?? ""; const fence = "`".repeat(Math.max(0, ...(raw.match(/`+/g) ?? []).map((s) => s.length)) + 1); text = `${fence} ${raw} ${fence}`; }
      if (mark.type === "bold") text = `**${text}**`;
      if (mark.type === "italic") text = `*${text}*`;
      if (mark.type === "strike") text = `~~${text}~~`;
      if (mark.type === "link" && mark.attrs && safeNoteLink(mark.attrs.href)) text = `[${text}](<${mark.attrs.href.replaceAll(">", "%3E").replaceAll("<", "%3C")}>)`;
    }
    return text;
  }
  if (node.type === "hardBreak") return "  \n";
  const children = node.content ?? [];
  if (node.type === "codeBlock") { const raw = notePlainText(node); const fence = "`".repeat(Math.max(2, ...(raw.match(/`+/g) ?? []).map((s) => s.length)) + 1); return `${fence}${node.attrs?.language ?? ""}\n${raw}\n${fence}`; }
  if (node.type === "heading") return `${"#".repeat(Number(node.attrs?.level))} ${children.map(noteMarkdown).join("")}`;
  if (node.type === "blockquote") return children.map(noteMarkdown).join("\n\n").split("\n").map((line) => `> ${line}`).join("\n");
  if (["bulletList", "orderedList", "taskList"].includes(node.type)) return children.map((item, i) => { const prefix = node.type === "orderedList" ? `${Number(node.attrs?.start ?? 1) + i}. ` : node.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}] ` : "- "; return prefix + noteMarkdown(item).replaceAll("\n", `\n${" ".repeat(prefix.length)}`); }).join("\n");
  return children.map(noteMarkdown).join(["doc", "listItem", "taskItem"].includes(node.type) ? "\n\n" : "");
}
export type NoteState = { id: string | null; ownerId: string; kind: "project" | "section" | "task"; targetId: string; revision: number; content: NoteDocument; updatedAt: string | null };
