import { noteDocument, safeNoteLink, type NoteDocument, type NoteNode, type NoteMark } from "@/lib/contracts/notes";

function inline(text: string): NoteNode[] {
  const pattern = /(!?\[([^\]]*)\]\(([^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*)/g;
  const nodes: NoteNode[] = []; let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > start) nodes.push({ type: "text", text: text.slice(start, match.index) });
    const [, raw, label, href, code, bold, strike, italic] = match;
    let value = raw; let mark: NoteMark | undefined;
    if (label !== undefined) { value = label || href; if (!raw.startsWith("!") && safeNoteLink(href) && href.length <= 2048) mark = { type: "link", attrs: { href } }; }
    else { value = code ?? bold ?? strike ?? italic; mark = { type: code ? "code" : bold ? "bold" : strike ? "strike" : "italic" }; }
    if (value) nodes.push({ type: "text", text: value, ...(mark ? { marks: [mark] } : {}) });
    start = match.index! + raw.length;
  }
  if (start < text.length) nodes.push({ type: "text", text: text.slice(start) });
  return nodes;
}
// Unsupported HTML, tables and nested Markdown remain literal text; images never fetch bytes.
export function githubMarkdown(markdown: string): NoteDocument {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n"); const blocks: NoteNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i++]; if (!line.trim()) continue;
    const fence = /^\s*(`{3,}|~{3,})([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = []; while (i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ type: "codeBlock", attrs: { language: fence[2].slice(0, 40) || null }, ...(code.length && code.join("\n") ? { content: [{ type: "text", text: code.join("\n") }] } : {}) }); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { blocks.push({ type: "heading", attrs: { level: Math.min(3, heading[1].length) }, content: inline(heading[2]) }); continue; }
    if (/^>\s?/.test(line)) { blocks.push({ type: "blockquote", content: [{ type: "paragraph", content: inline(line.replace(/^>\s?/, "")) }] }); continue; }
    const list = /^(?:[-*+] |\d+\. )(.+)$/.exec(line);
    if (list) {
      const ordered = /^\d/.test(line); const task = !ordered && /^\[[ xX]\] /.test(list[1]); const type = task ? "taskList" : ordered ? "orderedList" : "bulletList";
      const item: NoteNode = { type: task ? "taskItem" : "listItem", ...(task ? { attrs: { checked: /^\[[xX]\]/.test(list[1]) } } : {}), content: [{ type: "paragraph", content: inline(task ? list[1].slice(4) : list[1]) }] };
      const previous = blocks.at(-1); if (previous?.type === type) previous.content!.push(item);
      else blocks.push({ type, ...(ordered ? { attrs: { start: Number(/^\d+/.exec(line)![0]) } } : {}), content: [item] });
      continue;
    }
    blocks.push({ type: "paragraph", content: inline(line) });
  }
  return noteDocument.parse({ type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] });
}
