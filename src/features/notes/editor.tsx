"use client";
import { useTimezone } from "@/features/settings/timezone";
import { formatTimestamp } from "@/lib/dates";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { BlockPlaceholders } from "./placeholders";
import { filterSlashCommands, type SlashCommand } from "./slash-commands";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, ListChecks, Quote, Link2, Undo, Redo, Type, Heading1, Heading2, Heading3, FileCode, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { noteDocument, safeNoteLink, type NoteDocument, type NoteState } from "@/lib/contracts/notes";
import { workRequest, useCollection } from "@/features/work/api";
import { TextField, LoadingRows, QueryError } from "@/features/work/primitives";
import { noteSession, type NoteSession } from "./drafts";
import { useNoteOwner } from "./environment";
import { SafeNote } from "./safe-note";
import { attachmentAccept, type Attachment, type AttachmentTarget } from "@/lib/contracts/attachments";
import { attachmentLink, uploadAttachment, type UploadAttempt } from "@/features/attachments/upload";
import { WorkError } from "@/features/work/api";

const slashPresentation: Record<SlashCommand, { icon: typeof Type; description: string }> = {
  "Text": { icon: Type, description: "Plain text paragraph" }, "Heading 1": { icon: Heading1, description: "Large heading" },
  "Heading 2": { icon: Heading2, description: "Medium heading" }, "Heading 3": { icon: Heading3, description: "Small heading" },
  "Bulleted list": { icon: List, description: "Create a bulleted list" }, "Numbered list": { icon: ListOrdered, description: "Create a numbered list" },
  "To-do list": { icon: ListChecks, description: "Track tasks with checkboxes" }, "Quote": { icon: Quote, description: "Highlight a quotation" },
  "Code block": { icon: FileCode, description: "Write a block of code" }, "Attachment": { icon: Paperclip, description: "Upload and link a file" },
};
// Client-only: importing the menus entry during SSR loads ProseMirror twice ("Duplicate use of selection JSON ID cell").
const BubbleMenu = lazy(() => import("@tiptap/react/menus").then((m) => ({ default: m.BubbleMenu })));
export function NoteEditor({ kind, id, variant = "standard" }: { kind: NoteState["kind"]; id: string; variant?: "standard" | "inline" }) {
  const owner = useNoteOwner();
  const query = useQuery({ queryKey: ["note", owner, kind, id], queryFn: () => workRequest<NoteState>(`notes/${id}?kind=${kind}`), enabled: Boolean(owner) });
  return <section className={`note-section ${variant === "inline" ? "note-section-inline" : ""}`} aria-label={kind === "section" ? "Section plan note" : `${kind} note`}><QueryError error={query.error} retry={query.refetch} retained={Boolean(query.data)} />{query.isPending ? <LoadingRows /> : query.data && <SessionEditor key={`${owner}-${kind}-${id}`} note={query.data} variant={variant} reload={async () => { const result = await query.refetch(); return result.isError ? undefined : result.data; }} />}</section>;
}
function SessionEditor({ note, reload, variant }: { note: NoteState; reload: () => Promise<NoteState | undefined>; variant: "standard" | "inline" }) {
  const timezone = useTimezone();
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
  return <div className="flex flex-col gap-3"><div className="note-heading">{variant === "standard" && <h2 className="font-medium">{note.kind === "section" ? "Plan" : "Note"}</h2>}<span role="status" className="text-xs text-muted-foreground">{{ saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", failed: "Save failed", conflict: "Conflict — edits retained", recovery: "Local draft available" }[snapshot.status]}</span><Button variant="ghost" size="sm" className="ml-auto" onClick={() => setHistory(true)}>History</Button></div>
    {snapshot.status === "recovery" && <Alert><AlertDescription>A local draft from {formatTimestamp(snapshot.recovery!.savedAt, timezone)} is available. It will not replace the saved note until you choose.<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setCompare(true)}>Compare draft</Button><Button size="sm" onClick={session.recover}>Recover draft</Button><Button variant="ghost" size="sm" onClick={() => session.discard()}>Discard draft</Button></div></AlertDescription></Alert>}
    <TiptapNote session={session} target={{ kind: note.kind, id: note.targetId }} variant={variant} />
    {snapshot.error && <Alert variant="destructive"><AlertDescription>{snapshot.error}<div className="flex flex-wrap gap-2">{snapshot.status === "conflict" ? <Button variant="outline" size="sm" onClick={() => setCompare(true)}>Compare versions</Button> : <Button variant="outline" size="sm" onClick={() => void session.retry()}>Retry original save</Button>}<Button variant="ghost" size="sm" onClick={() => void discard()}>Discard edits and reload</Button></div></AlertDescription></Alert>}
    {snapshot.status !== "saved" && snapshot.status !== "recovery" && <p className="text-xs text-muted-foreground">{snapshot.localSaved ? "Attempted edits are stored on this browser until saved." : "Local recovery is unavailable. Keep this tab open until the note is saved."}</p>}
    {compare && <Dialog open onOpenChange={setCompare}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Compare note versions</DialogTitle><DialogDescription>Review both versions. Retrying uses the current saved revision and keeps your attempted text.</DialogDescription></DialogHeader><div className="grid gap-5 sm:grid-cols-2"><div><h3 className="mb-3 font-medium">Saved version</h3><SafeNote content={snapshot.current?.content ?? note.content} /></div><div><h3 className="mb-3 font-medium">{snapshot.recovery ? "Local draft" : "Your attempted version"}</h3><SafeNote content={snapshot.recovery?.content ?? snapshot.content} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCompare(false)}>Close comparison</Button>{snapshot.status === "conflict" && <Button onClick={() => { session.retryLatest(); setCompare(false); }}>Retry my version with latest revision</Button>}</DialogFooter></DialogContent></Dialog>}
    {history && <NoteHistory note={note} revision={snapshot.revision} dirty={session.dirty} session={session} close={() => setHistory(false)} reload={reload} />}
  </div>;
}
function TiptapNote({ session, target, variant }: { session: NoteSession; target: AttachmentTarget; variant: "standard" | "inline" }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [linkOpen, setLinkOpen] = useState(false); const [href, setHref] = useState(""); const [linkError, setLinkError] = useState("");
  const [menu, setMenu] = useState<{ from: number; to: number; query: string; left: number; top: number; index: number } | null>(null);
  const menuRef = useRef(menu);
  const menuElement = useRef<HTMLDivElement>(null); const fileInput = useRef<HTMLInputElement>(null);
  const uploadAttempt = useRef<UploadAttempt | null>(null); const uploadPosition = useRef<number | null>(null);
  const pendingRange = useRef<{ from: number; to: number } | null>(null);
  const [uploadStatus, setUploadStatus] = useState(""); const [uploadError, setUploadError] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false); const [retryable, setRetryable] = useState(false);
  const client = useQueryClient();
  useEffect(() => { menuRef.current = menu; }, [menu]);
  const dismissed = useRef<number | null>(null);
  const updateMenu = (editor: Editor) => {
    if (variant !== "inline" || !editor.isEditable || !editor.state.selection.empty) { setMenu(null); return; }
    const { $from } = editor.state.selection;
    const match = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0").match(/(?:^| )\/([^\s/]*)$/);
    if (!match) { dismissed.current = null; setMenu(null); return; }
    const from = $from.pos - match[1].length - 1;
    if (dismissed.current === from) return;
    const rect = editor.view.coordsAtPos(from);
    setMenu((current) => ({ from, to: $from.pos, query: match[1], left: rect.left, top: rect.bottom, index: current?.from === from && current.query === match[1] ? current.index : 0 }));
  };
  const applyCommand = (editor: Editor, item: SlashCommand, range: { from: number; to: number }) => {
    if (item === "Attachment") { pendingRange.current = range; setMenu(null); fileInput.current?.click(); return; }
    const chain = editor.chain().focus().deleteRange(range);
    if (item === "Text") chain.setParagraph().run();
    else if (item.startsWith("Heading")) chain.setHeading({ level: Number(item.at(-1)) as 1 | 2 | 3 }).run();
    else if (item === "Bulleted list") chain.toggleBulletList().run();
    else if (item === "Numbered list") chain.toggleOrderedList().run();
    else if (item === "To-do list") chain.toggleTaskList().run();
    else if (item === "Quote") chain.toggleBlockquote().run();
    else chain.toggleCodeBlock().run();
    setMenu(null);
  };
  const attachments = useCollection<Attachment>("attachments", target, linkOpen);
  const editor = useEditor({ immediatelyRender: false, extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false, horizontalRule: false, link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], isAllowedUri: (url) => safeNoteLink(url), HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow", class: null } } }), TaskList, TaskItem.configure({ nested: true }), BlockPlaceholders], content: snapshot.content, editorProps: { handleKeyDown: (_view, event) => {
    const current = menuRef.current; if (!current || !editor) return false;
    const items = filterSlashCommands(current.query);
    if (event.key === "Tab") { dismissed.current = current.from; setMenu(null); return false; }
    if (event.key === "Escape") { dismissed.current = current.from; setMenu(null); return true; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { if (items.length) setMenu({ ...current, index: (current.index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length }); return true; }
    if (event.key === "Enter" && items[current.index]) { applyCommand(editor, items[current.index], current); return true; }
    return false;
  }, attributes: { class: "note-prose note-editable", role: "textbox", "aria-label": "Note content", "aria-multiline": "true" } }, onUpdate: ({ editor }) => { session.edit(editor.getJSON() as NoteDocument); updateMenu(editor); }, onSelectionUpdate: ({ editor }) => updateMenu(editor) });
  useEffect(() => {
    if (!editor) return;
    const mapPosition = ({ transaction }: { transaction: import("@tiptap/pm/state").Transaction }) => { if (uploadPosition.current !== null) uploadPosition.current = transaction.mapping.map(uploadPosition.current); };
    editor.on("transaction", mapPosition); return () => { editor.off("transaction", mapPosition); };
  }, [editor]);
  useEffect(() => {
    if (!menu || !editor) return;
    const close = (event: Event) => { if ((event.type === "scroll" && event.target !== menuElement.current) || !(event.target instanceof Node) || (!editor.view.dom.contains(event.target) && !menuElement.current?.contains(event.target))) { dismissed.current = menu.from; setMenu(null); } };
    const blur = () => { dismissed.current = menu.from; setMenu(null); };
    document.addEventListener("pointerdown", close); document.addEventListener("scroll", close, true); editor.view.dom.addEventListener("blur", blur);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("scroll", close, true); editor.view.dom.removeEventListener("blur", blur); };
  }, [editor, menu]);
  useLayoutEffect(() => {
    if (!menu || !menuElement.current) return;
    const element = menuElement.current; const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.left, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${menu.top + 4 + rect.height > window.innerHeight - 8 ? Math.max(8, menu.top - rect.height - 24) : menu.top + 4}px`;
    element.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [menu]);
  useEditorState({ editor, selector: ({ editor }) => editor?.state.selection.from + ":" + editor?.state.selection.to + ":" + JSON.stringify(editor?.getAttributes("codeBlock")) + ":" + editor?.state.doc.content.size + ":" + editor?.isActive("bold") + editor?.isActive("italic") + editor?.isActive("strike") });
  useEffect(() => { if (!editor) return; const current = noteDocument.safeParse(editor.getJSON()); if (current.success && JSON.stringify(current.data) !== JSON.stringify(snapshot.content)) editor.commands.setContent(snapshot.content, { emitUpdate: false }); }, [editor, snapshot.content]);
  useEffect(() => { editor?.setEditable(snapshot.status !== "recovery"); }, [editor, snapshot.status]);
  useEffect(() => { if (!editor) return; const element = editor.view.dom; if (menu) { element.setAttribute("aria-controls", "note-slash-menu"); if (filterSlashCommands(menu.query).length) element.setAttribute("aria-activedescendant", `note-command-${menu.index}`); else element.removeAttribute("aria-activedescendant"); } else { element.removeAttribute("aria-controls"); element.removeAttribute("aria-activedescendant"); } }, [editor, menu]);
  if (!editor) return <LoadingRows />;
  const transfer = async () => {
    const attempt = uploadAttempt.current; if (!attempt) return;
    setUploadBusy(true); setUploadError(""); setRetryable(false); setUploadStatus("Preparing upload…");
    try {
      const file = await uploadAttachment(attempt, (stage, progress) => setUploadStatus(stage === "verifying" ? "Verifying file…" : `Uploading ${progress}%`));
      const position = uploadPosition.current;
      if (position !== null && !editor.isDestroyed) editor.chain().insertContentAt(position, [{ type: "text", text: file.originalName, marks: [{ type: "link", attrs: { href: attachmentLink(file.id, window.location.origin) } }] }, { type: "text", text: " " }]).run();
      uploadAttempt.current = null; uploadPosition.current = null; setUploadStatus("File ready.");
    } catch (error) { setUploadError(error instanceof Error ? error.message : "Upload failed. Retry or select the file again."); setRetryable(!(error instanceof WorkError && error.code === "upload_rejected")); setUploadStatus("Upload needs attention."); }
    finally { setUploadBusy(false); void client.invalidateQueries({ queryKey: ["work"] }); }
  };
  // A chain runs its commands when built, so create it per action, never during render.
  const command = () => editor.chain().focus();
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
  return <div className={`note-editor ${variant === "inline" ? "note-editor-inline" : ""} ${editor.isEmpty ? "note-empty" : ""}`} >{variant === "standard" && <div className="note-toolbar" role="group" aria-label="Note formatting">{tools.map(({ label, icon: Icon, active, run }) => <Button key={label} type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} aria-pressed={active} disabled={snapshot.status === "recovery"} onClick={run}><Icon /></Button>)}<NativeSelect aria-label="Text style" value={editor.isActive("codeBlock") ? "code" : editor.isActive("heading") ? String(editor.getAttributes("heading").level) : "paragraph"} onChange={(e) => { const value = e.target.value; if (value === "code") command().toggleCodeBlock().run(); else if (value === "paragraph") command().setParagraph().run(); else command().setHeading({ level: Number(value) as 1 | 2 | 3 }).run(); }}><option value="paragraph">Paragraph</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="code">Code block</option></NativeSelect><Button variant="ghost" size="icon-sm" aria-label="Edit link" onClick={() => { setHref(editor.getAttributes("link").href ?? ""); setLinkOpen(true); }}><Link2 /></Button><Button variant="ghost" size="icon-sm" aria-label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo /></Button><Button variant="ghost" size="icon-sm" aria-label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo /></Button>{editor.isActive("codeBlock") && <NativeSelect aria-label="Code language" value={editor.getAttributes("codeBlock").language ?? ""} onChange={(e) => editor.chain().focus().updateAttributes("codeBlock", { language: e.target.value || null }).run()}>{["", "text", "typescript", "javascript", "python", "sql", "bash", "json", "css", "html"].map((lang) => <option key={lang} value={lang}>{lang || "Plain text"}</option>)}</NativeSelect>}</div>}
    {variant === "inline" && <Suspense fallback={null}><BubbleMenu editor={editor} className="note-bubble" role="group" aria-label="Note formatting">{tools.slice(0, 4).map(({ label, icon: Icon, active, run }) => <Button key={label} type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} aria-pressed={active} onMouseDown={(event) => event.preventDefault()} onClick={run}><Icon /></Button>)}<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit link" onMouseDown={(event) => event.preventDefault()} onClick={() => { setHref(editor.getAttributes("link").href ?? ""); setLinkOpen(true); }}><Link2 /></Button></BubbleMenu></Suspense>}
    <EditorContent editor={editor} />
    {variant === "inline" && <><input ref={fileInput} type="file" accept={attachmentAccept} className="sr-only" tabIndex={-1} aria-hidden="true" disabled={uploadBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file || !pendingRange.current) return; const range = pendingRange.current; pendingRange.current = null; editor.chain().deleteRange(range).run(); uploadPosition.current = range.from; uploadAttempt.current = { file, target, key: crypto.randomUUID() }; void transfer(); }} />{uploadStatus && <p role="status" className="text-xs text-muted-foreground">{uploadStatus}</p>}{uploadError && <p role="alert" className="text-sm text-destructive">{uploadError} {retryable && <Button type="button" variant="outline" size="sm" disabled={uploadBusy} onClick={() => void transfer()}>Retry upload</Button>}</p>}</>}
    {menu && <div ref={menuElement} className="note-slash-menu" role="listbox" aria-label="Slash commands" id="note-slash-menu" style={{ left: menu.left, top: menu.top + 4 }}>{filterSlashCommands(menu.query).length === 0 ? <span className="px-2 py-2 text-sm text-muted-foreground">No results</span> : filterSlashCommands(menu.query).map((item, index) => { const { icon: Icon, description } = slashPresentation[item]; return <button type="button" role="option" id={`note-command-${index}`} aria-selected={index === menu.index} key={item} onMouseEnter={() => setMenu((current) => current ? { ...current, index } : null)} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCommand(editor, item, menu)} disabled={item === "Attachment" && uploadBusy}><Icon className="size-4 shrink-0" /><span>{item}<span className="block text-xs text-muted-foreground">{description}</span></span></button>; })}</div>}
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}><DialogContent><DialogHeader><DialogTitle>Note link</DialogTitle><DialogDescription>Choose a ready attachment or use an absolute http, https or mailto link. Leave blank to remove the link.</DialogDescription></DialogHeader><form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (href && !safeNoteLink(href)) { setLinkError("Choose a safe, absolute link."); return; } if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); else editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkError(""); setLinkOpen(false); }}><NativeSelect aria-label="Link to attachment" value="" onChange={(event) => { if (event.target.value) setHref(attachmentLink(event.target.value, window.location.origin)); }}><option value="">Choose a ready attachment</option>{attachments.items.filter((file) => file.state === "ready").map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}</NativeSelect><QueryError error={attachments.error} retry={attachments.refetch} />{attachments.hasNextPage && <Button type="button" variant="outline" size="sm" disabled={attachments.isFetchingNextPage} onClick={() => void attachments.fetchNextPage()}>Load more attachments</Button>}<TextField label="Link URL" value={href} onChange={(e) => setHref(e.target.value)} />{linkError && <p role="alert">{linkError}</p>}<DialogFooter><Button>Save link</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
function NoteHistory({ note, revision, dirty, session, close, reload }: { note: NoteState; revision: number; dirty: boolean; session: NoteSession; close: () => void; reload: () => Promise<NoteState | undefined> }) {
  const timezone = useTimezone();
  const [selected, setSelected] = useState<number>(); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const path = `notes/${note.targetId}`;
  const history = useQuery({ queryKey: ["note-history", note.ownerId, note.kind, note.targetId, revision], queryFn: () => workRequest<{ items: { revision: number; savedAt: string; actorKind: string }[] }>(`${path}/history?kind=${note.kind}`) });
  const preview = useQuery({ queryKey: ["note-revision", note.ownerId, note.kind, note.targetId, selected], queryFn: () => workRequest<{ content: NoteDocument; revision: number }>(`${path}/history/${selected}?kind=${note.kind}`), enabled: selected !== undefined });
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Note history</DialogTitle><DialogDescription>Latest 20 content revisions. Restoring creates a new revision.</DialogDescription></DialogHeader>{(history.isPending || (selected !== undefined && preview.isPending)) && <LoadingRows />}<QueryError error={history.error ?? preview.error} retry={() => { void history.refetch(); void preview.refetch(); }} /><div className="flex flex-wrap gap-2">{history.data?.items.map((item) => <Button key={item.revision} size="sm" variant={selected === item.revision ? "default" : "outline"} onClick={() => setSelected(item.revision)}>Revision {item.revision} · {formatTimestamp(item.savedAt, timezone)}</Button>)}</div>{preview.data && <SafeNote content={preview.data.content} />}{dirty && <p role="status">Save or explicitly discard your attempted edits before restoring history.</p>}{error && <p role="alert">{error}</p>}<DialogFooter><Button variant="outline" onClick={close} disabled={pending}>Close</Button><Button disabled={pending || dirty || selected === undefined} onClick={() => { setPending(true); setError(""); void workRequest<NoteState>(`${path}/restore?kind=${note.kind}`, "POST", { expectedRevision: revision, sourceRevision: selected }, crypto.randomUUID()).then(async (result) => { session.receive(result); await reload(); close(); }).catch((e: Error) => setError(e.message)).finally(() => setPending(false)); }}>{pending ? "Restoring…" : "Restore as new revision"}</Button></DialogFooter></DialogContent></Dialog>;
}
