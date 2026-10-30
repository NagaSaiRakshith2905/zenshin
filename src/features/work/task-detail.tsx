"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, X, Link2, Unlink, History, Paperclip } from "lucide-react";
import { NoteEditor } from "@/features/notes/editor";
import { AttachmentPanel } from "@/features/attachments/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useCollection, useEntity } from "./api";
import { ActionFeedback, useAction } from "./action";
import { ArchiveBadge, EntityActions, NewTaskButton } from "./editors";
import { Group, LoadingRows, LoadMore, QueryError, ProgressLine, SelectField, TextField } from "./primitives";
import { TaskList } from "./task-list";
import { withoutTask } from "./model";
import { TaskProperties } from "./task-properties";
import type { Activity, Project, Task } from "./types";

const subscribeWide = (fn: () => void) => { const media = window.matchMedia("(min-width: 1440px)"); media.addEventListener("change", fn); return () => media.removeEventListener("change", fn); };
export function TaskPanel({ id }: { id: string }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1440px)").matches, () => false);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => { if (wide) panelRef.current?.focus({ preventScroll: true }); }, [wide, id]);
  const close = () => router.replace(withoutTask(pathname, search.toString()), { scroll: false });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target as Element).closest?.(".inline-edit") && !document.querySelector('[role="dialog"],[role="alertdialog"]')) { router.replace(withoutTask(pathname, window.location.search), { scroll: false }); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); requestAnimationFrame(() => { if (!new URLSearchParams(window.location.search).has("task")) document.querySelector<HTMLAnchorElement>(`[data-task-link="${id}"]`)?.focus({ preventScroll: true }); }); };
  }, [id, pathname, router]);
  if (wide) return <aside ref={panelRef} tabIndex={-1} className="work-task-panel" aria-label="Task details"><TaskDetail id={id} close={close} /></aside>;
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="task-drawer" showCloseButton={false} onEscapeKeyDown={(e) => { if ((e.target as Element).closest?.(".inline-edit")) e.preventDefault(); }} onCloseAutoFocus={(e) => { e.preventDefault(); document.querySelector<HTMLAnchorElement>(`[data-task-link="${id}"]`)?.focus({ preventScroll: true }); }}><DialogHeader className="sr-only"><DialogTitle>Task details</DialogTitle><DialogDescription>Edit this task, its properties and relationships.</DialogDescription></DialogHeader><TaskDetail id={id} close={close} /></DialogContent></Dialog>;
}
export function TaskDetail({ id, close, fullPage = false }: { id: string; close?: () => void; fullPage?: boolean }) {
  const router = useRouter();
  const query = useEntity<Task>("tasks", id);
  const task = query.data;
  const [dialog, setDialog] = useState<"Dependencies and blocking" | "Activity" | "Attachments" | null>(null);
  return <div className="task-detail"><div className="task-detail-toolbar"><span className="work-reference">{task?.reference ?? "Task"}</span><div className="ml-auto flex gap-1">{!fullPage && <Button asChild variant="ghost" size="icon-sm"><Link aria-label="Open task as full page" href={`/tasks/${id}`}><ArrowUpRight /></Link></Button>}{task && <EntityActions kind="task" row={task} extraItems={([["Dependencies and blocking", Link2], ["Activity", History], ["Attachments", Paperclip]] as const).map(([label, icon]) => ({ label, icon, onSelect: () => setDialog(label) }))} afterDelete={close ?? (() => router.push(`/projects/${task.projectId}/tasks`))} />}{close && <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close task"><X /></Button>}</div></div><QueryError error={query.error} retry={query.refetch} retained={Boolean(task)} />{query.isPending ? <LoadingRows /> : task && <TaskContent key={id} task={task} fullPage={fullPage} dialog={dialog} closeDialog={() => setDialog(null)} />}</div>;
}
function TaskContent({ task, fullPage, dialog, closeDialog }: { task: Task; fullPage: boolean; dialog: "Dependencies and blocking" | "Activity" | "Attachments" | null; closeDialog: () => void }) {
  const project = useEntity<Project>("projects", task.projectId);
  const [reasonEditor, setReasonEditor] = useState(false);
  const children = useCollection<Task>("tasks", { projectId: task.projectId, parentTaskId: task.id }, !task.parentTaskId);
  const activity = useCollection<Activity>("activity", { projectId: task.projectId, taskId: task.id });
  return <div className={fullPage ? "task-content task-content-full" : "task-content"}>
    <nav className="work-breadcrumb" aria-label="Task location"><Link href={`/projects/${task.projectId}`}>{project.data?.name ?? task.projectName ?? "Project"}</Link>{task.breadcrumbs.map((b) => <Link key={b.id} href={`/projects/${task.projectId}/sections/${b.id}`}>{b.name}</Link>)}</nav>
    {task.parentTaskId && <RelatedTask id={task.parentTaskId} prefix="Subtask of" />}
    <InlineText task={task} field="title" /><ArchiveBadge row={task} />
    <InlineText task={task} field="description" />
    {task.blocked && <Badge className="self-start" variant="outline">Blocked</Badge>}<TaskProperties task={task} />
    <NoteEditor kind="task" id={task.id} variant="inline" />
    {!task.parentTaskId && <Group title="Subtasks" count={task.progress?.total}><ProgressLine value={task.progress} /><QueryError error={children.error} retry={children.refetch} retained={Boolean(children.data)} />{children.isPending ? <LoadingRows /> : <TaskList tasks={children.items} standalone />}<LoadMore query={children} /><div className="p-3"><NewTaskButton parentTask={task} projectId={task.projectId} /></div></Group>}
    {dialog && <Dialog open onOpenChange={(open) => { if (!open) closeDialog(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{dialog}</DialogTitle><DialogDescription className="sr-only">Manage {dialog.toLowerCase()} for this task.</DialogDescription></DialogHeader>{dialog === "Dependencies and blocking" ? <div className="flex flex-col gap-3 p-3">{task.blocked && <Badge variant="outline">Blocked</Badge>}<p className="text-muted-foreground">{task.manualBlockedReason ?? "No manual blocking reason."}</p><Button className="self-start" variant="outline" size="sm" onClick={() => setReasonEditor(true)}>Edit blocking reason</Button><Dependencies task={task} />{task.dependentTaskIds.length > 0 && <><p className="font-medium">Required by</p>{task.dependentTaskIds.map((id) => <RelatedTask key={id} id={id} />)}</>}</div> : dialog === "Activity" ? <div className="flex flex-col gap-4 p-4"><QueryError error={activity.error} retry={activity.refetch} retained={Boolean(activity.data)} />{activity.isPending ? <LoadingRows /> : activity.items.length === 0 ? <p className="text-muted-foreground">No activity yet.</p> : <ol className="flex flex-col gap-4">{activity.items.map((a) => <li key={a.id}><p><span className="font-medium">{a.actorKind === "agent" ? "Agent credential" : a.actorKind === "system" ? "System" : "You"}</span> {a.action.replaceAll("_", " ")}{a.changedFields?.fields?.length ? ` (${a.changedFields.fields.join(", ")})` : ""}</p>{a.changedFields?.reason && <p>{a.changedFields.reason}</p>}<time className="text-xs text-muted-foreground" dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString()}</time></li>)}</ol>}<LoadMore query={activity} /></div> : <AttachmentPanel kind="task" id={task.id} />}</DialogContent></Dialog>}
    {reasonEditor && <ReasonEditor task={task} close={() => setReasonEditor(false)} />}
  </div>;
}
function ReasonEditor({ task, close }: { task: Task; close: () => void }) {
  const [base] = useState(task.revision); const [reason, setReason] = useState(task.manualBlockedReason ?? ""); const action = useAction();
  return <Dialog open onOpenChange={(open) => { if (!open && !action.pending) close(); }}><DialogContent><DialogHeader><DialogTitle>Blocking reason</DialogTitle><DialogDescription>Dependencies are tracked separately. Blocking does not prevent starting work.</DialogDescription></DialogHeader><form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void action.run(`tasks/${task.id}`, { expectedRevision: base, manualBlockedReason: reason.trim() || null }, close); }}><TextField label="Reason" multiline value={reason} onChange={(e) => setReason(e.target.value)} /><ActionFeedback action={action} /><DialogFooter><Button disabled={action.pending}>Save reason</Button></DialogFooter></form></DialogContent></Dialog>;
}
function RelatedTask({ id, prefix }: { id: string; prefix?: string }) { const query = useEntity<Task>("tasks", id); return query.data ? <Link className="work-related-link" href={`/tasks/${id}`}>{prefix && `${prefix} `}{query.data.reference}: {query.data.title}{query.data.effectiveArchived && " (archived)"}</Link> : <QueryError error={query.error} retry={query.refetch} />; }
function Dependencies({ task }: { task: Task }) {
  const action = useAction(); const [candidate, setCandidate] = useState("");
  const tasks = useCollection<Task>("tasks", { projectId: task.projectId, includeArchived: true });
  return <><p className="font-medium">Prerequisites</p>{task.prerequisiteTaskIds.length === 0 && <p className="text-muted-foreground">No prerequisites.</p>}{task.prerequisiteTaskIds.map((id) => <div className="flex items-center gap-2" key={id}><Link2 className="size-4 shrink-0" aria-hidden="true" /><RelatedTask id={id} /><Button className="ml-auto" variant="ghost" size="icon-sm" aria-label="Remove prerequisite" disabled={action.pending} onClick={() => void action.run(`tasks/${task.id}/remove-dependency`, { expectedRevision: task.revision, prerequisiteTaskId: id })}><Unlink /></Button></div>)}<SelectField label="Add prerequisite" value={candidate} onChange={(e) => setCandidate(e.target.value)}><option value="">Choose a task</option>{tasks.items.filter((t) => t.id !== task.id && t.id !== task.parentTaskId && t.parentTaskId !== task.id && !task.prerequisiteTaskIds.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.reference}: {t.title}{t.effectiveArchived ? " (archived)" : ""}</option>)}</SelectField><LoadMore query={tasks} /><QueryError error={tasks.error} retry={tasks.refetch} /><Button className="self-start" variant="outline" size="sm" disabled={!candidate || action.pending} onClick={() => void action.run(`tasks/${task.id}/add-dependency`, { expectedRevision: task.revision, prerequisiteTaskId: candidate }, () => setCandidate(""))}>Add prerequisite</Button><ActionFeedback action={action} /></>;
}

function InlineText({ task, field }: { task: Task; field: "title" | "description" }) {
  const action = useAction();
  const value = task[field] ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const title = field === "title";
  const commit = () => { const next = draft?.trim() ?? ""; setDraft(null); if (draft === null || next === value.trim() || (title && !next)) return; void action.run(`tasks/${task.id}`, { expectedRevision: task.revision, [field]: title ? next : next || null }); };
  if (draft !== null) return <><textarea autoFocus aria-label={title ? "Task title" : "Task description"} rows={1} className={title ? "work-title inline-edit" : "inline-edit inline-edit-description"} value={draft} placeholder={title ? "Task title" : "Add a description…"} onFocus={(e) => e.currentTarget.setSelectionRange(draft.length, draft.length)} onChange={(e) => setDraft(title ? e.target.value.replace(/\n/g, " ") : e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDraft(null); } else if (e.key === "Enter" && (title || e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur(); } }} /><ActionFeedback action={action} /></>;
  return <>{title ? <h1 className="work-title inline-edit-view" tabIndex={0} role="button" aria-label={`Edit title: ${value}`} onClick={() => setDraft(value)} onKeyDown={(e) => { if (e.key === "Enter") setDraft(value); }}>{value}</h1> : <p className={`inline-edit-view whitespace-pre-wrap ${value ? "text-muted-foreground" : "text-muted-foreground/70"}`} tabIndex={0} role="button" aria-label={value ? "Edit description" : "Add description"} onClick={() => setDraft(value)} onKeyDown={(e) => { if (e.key === "Enter") setDraft(value); }}>{value || "Add a description…"}</p>}<ActionFeedback action={action} /></>;
}
