import { Fragment, type ReactNode } from "react";
import { noteDocument, safeNoteLink, type NoteNode } from "@/lib/contracts/notes";
export function SafeNote({ content }: { content: unknown }) {
  const result = noteDocument.safeParse(content);
  if (!result.success) return <p role="alert">This note contains unsupported content.</p>;
  const render = (node: NoteNode, key: number): ReactNode => {
    const children = node.content?.map(render);
    if (node.type === "text") {
      let text: ReactNode = node.text;
      for (const [i, mark] of (node.marks ?? []).entries()) {
        if (mark.type === "bold") text = <strong key={i}>{text}</strong>;
        if (mark.type === "italic") text = <em key={i}>{text}</em>;
        if (mark.type === "strike") text = <s key={i}>{text}</s>;
        if (mark.type === "code") text = <code key={i}>{text}</code>;
        if (mark.type === "link" && mark.attrs && safeNoteLink(mark.attrs.href)) text = <a key={i} href={mark.attrs.href} target="_blank" rel="noopener noreferrer nofollow">{text}</a>;
      }
      return <Fragment key={key}>{text}</Fragment>;
    }
    switch (node.type) {
      case "paragraph": return <p key={key}>{children}<br hidden={Boolean(node.content?.length)} /></p>;
      case "heading": return node.attrs?.level === 1 ? <h2 key={key}>{children}</h2> : node.attrs?.level === 2 ? <h3 key={key}>{children}</h3> : <h4 key={key}>{children}</h4>;
      case "blockquote": return <blockquote key={key}>{children}</blockquote>;
      case "codeBlock": return <pre key={key}><code>{children}</code></pre>;
      case "bulletList": return <ul key={key}>{children}</ul>;
      case "orderedList": return <ol key={key} start={Number(node.attrs?.start ?? 1)}>{children}</ol>;
      case "taskList": return <ul key={key} data-type="taskList">{children}</ul>;
      case "taskItem": return <li key={key} data-type="taskItem"><span role="img" aria-label={node.attrs?.checked ? "Checked" : "Unchecked"}>{node.attrs?.checked ? "☑" : "☐"}</span><div>{children}</div></li>;
      case "listItem": return <li key={key}>{children}</li>;
      case "hardBreak": return <br key={key} />;
      default: return <Fragment key={key}>{children}</Fragment>;
    }
  };
  return <div className="note-prose">{result.data.content.map(render)}</div>;
}
