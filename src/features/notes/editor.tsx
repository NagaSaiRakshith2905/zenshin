"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, ListChecks, Quote, Link2, Undo, Redo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { noteDocument, safeNoteLink, type NoteDocument, type NoteState } from "@/lib/contracts/notes";
import { workRequest } from "@/features/work/api";
import { TextField, LoadingRows, QueryError } from "@/features/work/primitives";
import { noteSession, type NoteSession } from "./drafts";
import { useNoteOwner } from "./environment";
import { SafeNote } from "./safe-note";

export function NoteEditor({ kind, id }: { kind: NoteState["kind"]; id: string }) {
  const owner = useNoteOwner();
  const query = useQuery({ queryKey: ["note", owner, kind, id], queryFn: () => workRequest<NoteState>(`notes/${id}?kind=${kind}`), enabled: Boolean(owner) });
  return <section className="note-section" aria-label={kind === "section" ? "Section plan note" : `${kind} note`}><QueryError error={query.error} retry={query.refetch} retained={Boolean(query.data)} />{query.isPending ? <LoadingRows /> : query.data && <SessionEditor key={`${owner}-${kind}-${id}`} note={query.data} reload={async () => { const result = await query.refetch(); return result.isError ? undefined : result.data; }} />}</section>;
}
function SessionEditor({ note, reload }: { note: NoteState; reload: () => Promise<NoteState | undefined> }) {
  const client = useQueryClient();
  const [session] = useState(() => noteSession(note, async (content, revision, key) => {
    const result = await workRequest<NoteState>(`notes/${note.targetId}?kind=${note.kind}`, "PATCH", { content, expectedRevision: revision }, key);
    client.setQueryData(["note", note.ownerId, note.kind, note.targetId], result);
    void client.invalidateQueries({ queryKey: ["note-history", note.ownerId, note.kind, note.targetId] });
    void client.invalidateQueries({ queryKey: ["work"], refetchType: "none" });
    return result;
  }));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => { session.receive(note); }, [session, note]);
  const [history, setHistory] = useState(false); const [compare, setCompare] = useState(false);
  const discard = async () => { const latest = await reload(); if (latest) { session.receive(latest); session.discard(latest); } };
  return <div className="flex flex-col gap-3"><div className="note-heading"><h2 className="font-medium">{note.kind === "section" ? "Plan" : "Note"}</h2><span role="status" className="text-xs text-muted-foreground">{{ saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", failed: "Save failed", conflict: "Conflict — edits retained", recovery: "Local draft available" }[snapshot.status]}</span><Button variant="ghost" size="sm" className="ml-auto" onClick={() => setHistory(true)}>History</Button></div>
    {snapshot.status === "recovery" && <Alert><AlertDescription>A local draft from {new Date(snapshot.recovery!.savedAt).toLocaleString()} is available. It will not replace the saved note until you choose.<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setCompare(true)}>Compare draft</Button><Button size="sm" onClick={session.recover}>Recover draft</Button><Button variant="ghost" size="sm" onClick={() => session.discard()}>Discard draft</Button></div></AlertDescription></Alert>}
    <TiptapNote session={session} />
    {snapshot.error && <Alert variant="destructive"><AlertDescription>{snapshot.error}<div className="flex flex-wrap gap-2">{snapshot.status === "conflict" ? <Button variant="outline" size="sm" onClick={() => setCompare(true)}>Compare versions</Button> : <Button variant="outline" size="sm" onClick={() => void session.retry()}>Retry original save</Button>}<Button variant="ghost" size="sm" onClick={() => void discard()}>Discard edits and reload</Button></div></AlertDescription></Alert>}
    {snapshot.status !== "saved" && snapshot.status !== "recovery" && <p className="text-xs text-muted-foreground">{snapshot.localSaved ? "Attempted edits are stored on this browser until saved." : "Local recovery is unavailable. Keep this tab open until the note is saved."}</p>}
    {compare && <Dialog open onOpenChange={setCompare}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Compare note versions</DialogTitle><DialogDescription>Review both versions. Retrying uses the current saved revision and keeps your attempted text.</DialogDescription></DialogHeader><div className="grid gap-5 sm:grid-cols-2"><div><h3 className="mb-3 font-medium">Saved version</h3><SafeNote content={snapshot.current?.content ?? note.content} /></div><div><h3 className="mb-3 font-medium">{snapshot.recovery ? "Local draft" : "Your attempted version"}</h3><SafeNote content={snapshot.recovery?.content ?? snapshot.content} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCompare(false)}>Close comparison</Button>{snapshot.status === "conflict" && <Button onClick={() => { session.retryLatest(); setCompare(false); }}>Retry my version with latest revision</Button>}</DialogFooter></DialogContent></Dialog>}
    {history && <NoteHistory note={note} revision={snapshot.revision} dirty={session.dirty} session={session} close={() => setHistory(false)} reload={reload} />}
  </div>;
}
function TiptapNote({ session }: { session: NoteSession }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [linkOpen, setLinkOpen] = useState(false); const [href, setHref] = useState(""); const [linkError, setLinkError] = useState("");
  const editor = useEditor({ immediatelyRender: false, extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false, horizontalRule: false, link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], isAllowedUri: (url) => safeNoteLink(url), HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow", class: null } } }), TaskList, TaskItem.configure({ nested: true })], content: snapshot.content, editorProps: { attributes: { class: "note-prose note-editable", role: "textbox", "aria-label": "Note content", "aria-multiline": "true" } }, onUpdate: ({ editor }) => session.edit(editor.getJSON() as NoteDocument) });
  useEditorState({ editor, selector: ({ editor }) => editor?.state.selection.from + ":" + editor?.state.selection.to + ":" + JSON.stringify(editor?.getAttributes("codeBlock")) + ":" + editor?.state.doc.content.size + ":" + editor?.isActive("bold") + editor?.isActive("italic") + editor?.isActive("strike") });
  useEffect(() => { if (!editor) return; const current = noteDocument.safeParse(editor.getJSON()); if (current.success && JSON.stringify(current.data) !== JSON.stringify(snapshot.content)) editor.commands.setContent(snapshot.content, { emitUpdate: false }); }, [editor, snapshot.content]);
  useEffect(() => { editor?.setEditable(snapshot.status !== "recovery"); }, [editor, snapshot.status]);
  if (!editor) return <LoadingRows />;
  const command = editor.chain().focus();
  const tools = [
    { label: "Bold", icon: Bold, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Strike", icon: Strikethrough, active: editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
    { label: "Inline code", icon: Code, active: editor.isActive("code"), run: () => editor.chain().focus().toggleCode().run() },
    { label: "Bullet list", icon: List, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Checklist", icon: ListChecks, active: editor.isActive("taskList"), run: () => editor.chain().focus().toggleTaskList().run() },
    { label: "Quote", icon: Quote, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
  ];
  return <div className="note-editor"><div className="note-toolbar" role="group" aria-label="Note formatting">{tools.map(({ label, icon: Icon, active, run }) => <Button key={label} type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} aria-pressed={active} disabled={snapshot.status === "recovery"} onClick={run}><Icon /></Button>)}<NativeSelect aria-label="Text style" value={editor.isActive("codeBlock") ? "code" : editor.isActive("heading") ? String(editor.getAttributes("heading").level) : "paragraph"} onChange={(e) => { const value = e.target.value; if (value === "code") command.toggleCodeBlock().run(); else if (value === "paragraph") command.setParagraph().run(); else command.setHeading({ level: Number(value) as 1 | 2 | 3 }).run(); }}><option value="paragraph">Paragraph</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="code">Code block</option></NativeSelect><Button variant="ghost" size="icon-sm" aria-label="Edit link" onClick={() => { setHref(editor.getAttributes("link").href ?? ""); setLinkOpen(true); }}><Link2 /></Button><Button variant="ghost" size="icon-sm" aria-label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo /></Button><Button variant="ghost" size="icon-sm" aria-label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo /></Button>{editor.isActive("codeBlock") && <NativeSelect aria-label="Code language" value={editor.getAttributes("codeBlock").language ?? ""} onChange={(e) => editor.chain().focus().updateAttributes("codeBlock", { language: e.target.value || null }).run()}>{["", "text", "typescript", "javascript", "python", "sql", "bash", "json", "css", "html"].map((lang) => <option key={lang} value={lang}>{lang || "Plain text"}</option>)}</NativeSelect>}</div><EditorContent editor={editor} />
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}><DialogContent><DialogHeader><DialogTitle>Note link</DialogTitle><DialogDescription>Use an absolute http, https or mailto link. Leave blank to remove the link.</DialogDescription></DialogHeader><form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (href && !safeNoteLink(href)) { setLinkError("Choose a safe, absolute link."); return; } if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); else editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkError(""); setLinkOpen(false); }}><TextField label="Link URL" value={href} onChange={(e) => setHref(e.target.value)} />{linkError && <p role="alert">{linkError}</p>}<DialogFooter><Button>Save link</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
function NoteHistory({ note, revision, dirty, session, close, reload }: { note: NoteState; revision: number; dirty: boolean; session: NoteSession; close: () => void; reload: () => Promise<NoteState | undefined> }) {
  const [selected, setSelected] = useState<number>(); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const path = `notes/${note.targetId}`;
  const history = useQuery({ queryKey: ["note-history", note.ownerId, note.kind, note.targetId, revision], queryFn: () => workRequest<{ items: { revision: number; savedAt: string; actorKind: string }[] }>(`${path}/history?kind=${note.kind}`) });
  const preview = useQuery({ queryKey: ["note-revision", note.ownerId, note.kind, note.targetId, selected], queryFn: () => workRequest<{ content: NoteDocument; revision: number }>(`${path}/history/${selected}?kind=${note.kind}`), enabled: selected !== undefined });
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Note history</DialogTitle><DialogDescription>Latest 20 content revisions. Restoring creates a new revision.</DialogDescription></DialogHeader><QueryError error={history.error ?? preview.error} retry={() => { void history.refetch(); void preview.refetch(); }} /><div className="flex flex-wrap gap-2">{history.data?.items.map((item) => <Button key={item.revision} size="sm" variant={selected === item.revision ? "default" : "outline"} onClick={() => setSelected(item.revision)}>Revision {item.revision} · {new Date(item.savedAt).toLocaleString()}</Button>)}</div>{preview.data && <SafeNote content={preview.data.content} />}{dirty && <p role="status">Save or explicitly discard your attempted edits before restoring history.</p>}{error && <p role="alert">{error}</p>}<DialogFooter><Button variant="outline" onClick={close} disabled={pending}>Close</Button><Button disabled={pending || dirty || selected === undefined} onClick={() => { setPending(true); setError(""); void workRequest<NoteState>(`${path}/restore?kind=${note.kind}`, "POST", { expectedRevision: revision, sourceRevision: selected }, crypto.randomUUID()).then(async (result) => { session.receive(result); await reload(); close(); }).catch((e: Error) => setError(e.message)).finally(() => setPending(false)); }}>{pending ? "Restoring…" : "Restore as new revision"}</Button></DialogFooter></DialogContent></Dialog>;
}
