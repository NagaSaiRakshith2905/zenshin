import { Extension } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node, ResolvedPos } from "@tiptap/pm/model";

// Notion-style hints: typed blocks always name themselves; plain lines hint only at the caret.
export function blockHint(node: Node, $pos: ResolvedPos, depth: number, atCaret: boolean) {
  if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
  if (node.type.name === "codeBlock") return "Code";
  for (let d = depth - 1; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === "taskItem") return "To-do";
    if (name === "listItem") return "List";
    if (name === "blockquote") return "Empty quote";
  }
  return atCaret ? "Type '/' for commands" : null;
}

export const BlockPlaceholders = Extension.create({
  name: "blockPlaceholders",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({
      props: {
        decorations: ({ doc, selection }) => {
          if (!editor.isEditable) return null;
          const decorations: Decoration[] = [];
          doc.descendants((node, pos) => {
            if (!node.isTextblock) return true;
            if (node.content.size === 0) {
              const $pos = doc.resolve(pos + 1);
              const atCaret = editor.isFocused && selection.empty && selection.$from.parent === node || doc.childCount === 1 && doc.firstChild === node;
              const hint = blockHint(node, $pos, $pos.depth, atCaret);
              if (hint) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "note-placeholder", "data-placeholder": hint }));
            }
            return false;
          });
          return DecorationSet.create(doc, decorations);
        },
      },
    })];
  },
});
