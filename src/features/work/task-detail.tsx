"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, X, Plus, Link2, Unlink } from "lucide-react";
import { NoteEditor } from "@/features/notes/editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { useCollection, useEntity } from "./api";
import { ActionFeedback, useAction } from "./action";
import { ArchiveBadge, EntityActions, NewTaskButton, useEditor } from "./editors";
import { Group, LoadingRows, LoadMore, QueryError, ProgressLine, StatusGlyph, SelectField, TextField, CheckField } from "./primitives";
import { TaskList } from "./task-list";
import { withoutTask } from "./model";
import { DefinitionEditor } from "./project-settings";
import type { Activity, Label, Property, Project, Status, Task } from "./types";

const subscribeWide = (fn: () => void) => { const media = window.matchMedia("(min-width: 1440px)"); media.addEventListener("change", fn); return () => media.removeEventListener("change", fn); };
export function TaskPanel({ id }: { id: string }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1440px)").matches, () => false);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => { if (wide) panelRef.current?.focus({ preventScroll: true }); }, [wide, id]);
  const close = () => router.replace(withoutTask(pathname, search.toString()), { scroll: false });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="dialog"],[role="alertdialog"]')) { router.replace(withoutTask(pathname, window.location.search), { scroll: false }); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); requestAnimationFrame(() => { if (!new URLSearchParams(window.location.search).has("task")) document.querySelector<HTMLAnchorElement>(`[data-task-link="${id}"]`)?.focus({ preventScroll: true }); }); };
  }, [id, pathname, router]);
  if (wide) return <aside ref={panelRef} tabIndex={-1} className="work-task-panel" aria-label="Task details"><TaskDetail id={id} close={close} /></aside>;
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="task-drawer" showCloseButton={false} onCloseAutoFocus={(e) => { e.preventDefault(); document.querySelector<HTMLAnchorElement>(`[data-task-link="${id}"]`)?.focus({ preventScroll: true }); }}><DialogHeader className="sr-only"><DialogTitle>Task details</DialogTitle><DialogDescription>Edit this task, its properties and relationships.</DialogDescription></DialogHeader><TaskDetail id={id} close={close} /></DialogContent></Dialog>;
}
export function TaskDetail({ id, close, fullPage = false }: { id: string; close?: () => void; fullPage?: boolean }) {
  const router = useRouter();
  const query = useEntity<Task>("tasks", id);
  const task = query.data;
  return <div className="task-detail"><div className="task-detail-toolbar"><span className="work-reference">{task?.reference ?? "Task"}</span><div className="ml-auto flex gap-1">{!fullPage && <Button asChild variant="ghost" size="icon-sm"><Link aria-label="Open task as full page" href={`/tasks/${id}`}><ArrowUpRight /></Link></Button>}{task && <EntityActions kind="task" row={task} afterDelete={close ?? (() => router.push(`/projects/${task.projectId}/tasks`))} />}{close && <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close task"><X /></Button>}</div></div><QueryError error={query.error} retry={query.refetch} retained={Boolean(task)} />{query.isPending ? <LoadingRows /> : task && <TaskContent key={id} task={task} fullPage={fullPage} />}</div>;
}
function TaskContent({ task, fullPage }: { task: Task; fullPage: boolean }) {
  const edit = useEditor(); const action = useAction();
  const project = useEntity<Project>("projects", task.projectId);
  const statuses = useCollection<Status>("statuses", { projectId: task.projectId });
  const labels = useCollection<Label>("labels", { projectId: task.projectId });
  const properties = useCollection<Property>("properties", { projectId: task.projectId });
  const [property, setProperty] = useState<Property | null>(null);
  const [labelEditor, setLabelEditor] = useState(false);
  const [reasonEditor, setReasonEditor] = useState(false);
  const [newProperty, setNewProperty] = useState(false);
  const children = useCollection<Task>("tasks", { projectId: task.projectId, parentTaskId: task.id }, !task.parentTaskId);
  const activity = useCollection<Activity>("activity", { projectId: task.projectId, taskId: task.id });
  return <div className={fullPage ? "task-content task-content-full" : "task-content"}>
    <nav className="work-breadcrumb" aria-label="Task location"><Link href={`/projects/${task.projectId}`}>{project.data?.name ?? task.projectName ?? "Project"}</Link>{task.breadcrumbs.map((b) => <Link key={b.id} href={`/projects/${task.projectId}/sections/${b.id}`}>{b.name}</Link>)}</nav>
    {task.parentTaskId && <RelatedTask id={task.parentTaskId} prefix="Subtask of" />}
    <div className="flex items-start gap-2"><h1 className="work-title flex-1">{task.title}</h1><Button variant="ghost" size="sm" onClick={() => edit({ kind: "task", row: task })}>Edit</Button></div><ArchiveBadge row={task} />
    {task.description ? <p className="whitespace-pre-wrap text-muted-foreground">{task.description}</p> : <Button className="self-start" variant="ghost" size="sm" onClick={() => edit({ kind: "task", row: task })}>Add description</Button>}
    <div className="task-property-grid"><div className="flex items-center gap-2"><StatusGlyph category={task.category} /><SelectField label="Status" value={task.statusId} disabled={action.pending} onChange={(e) => void action.run(`tasks/${task.id}/transition`, { expectedRevision: task.revision, statusId: e.target.value })}>{!statuses.items.some((s) => s.id === task.statusId) && <option value={task.statusId}>{task.statusName ?? task.category.replaceAll("_", " ")}</option>}{statuses.items.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</SelectField></div><LoadMore query={statuses} /><div className="task-property"><span>Priority</span><Button variant="ghost" size="sm" onClick={() => edit({ kind: "task", row: task })}>{task.priority[0].toUpperCase() + task.priority.slice(1)}</Button></div><div className="task-property"><span>Due date</span><Button variant="ghost" size="sm" onClick={() => edit({ kind: "task", row: task })}>{task.dueDate ?? "Set date"}</Button></div><div className="task-property"><span>Labels</span><Button variant="ghost" size="sm" onClick={() => setLabelEditor(true)}>{task.labelIds.map((id) => labels.items.find((l) => l.id === id)?.name ?? "Label").join(", ") || "Add labels"}</Button></div>
    {properties.items.filter((p) => Object.hasOwn(task.properties, p.id)).map((p) => <div className="task-property" key={p.id}><span>{p.name}</span><Button variant="ghost" size="sm" onClick={() => setProperty(p)}>{propertyText(p, task.properties[p.id])}</Button></div>)}
    <details className="work-menu self-start"><summary><Plus aria-hidden="true" />Add property</summary><div className="work-menu-items">{properties.items.filter((p) => !Object.hasOwn(task.properties, p.id)).map((p) => <Button key={p.id} variant="ghost" onClick={() => setProperty(p)}>{p.name}</Button>)}<Button variant="ghost" onClick={() => setNewProperty(true)}><Plus data-icon="inline-start" />New property</Button></div></details></div>
    <LoadMore query={properties} /><QueryError error={statuses.error ?? labels.error ?? properties.error} retry={() => { void statuses.refetch(); void labels.refetch(); void properties.refetch(); }} /><ActionFeedback action={action} />
    <NoteEditor kind="task" id={task.id} />
    {!task.parentTaskId && <Group title="Subtasks" count={task.progress?.total}><ProgressLine value={task.progress} /><QueryError error={children.error} retry={children.refetch} retained={Boolean(children.data)} />{children.isPending ? <LoadingRows /> : <TaskList tasks={children.items} standalone />}<LoadMore query={children} /><div className="p-3"><NewTaskButton parentTask={task} projectId={task.projectId} /></div></Group>}
    <Group title="Dependencies and blocking"><div className="flex flex-col gap-3 p-3">{task.blocked && <Badge variant="outline">Blocked</Badge>}<p className="text-muted-foreground">{task.manualBlockedReason ?? "No manual blocking reason."}</p><Button className="self-start" variant="outline" size="sm" onClick={() => setReasonEditor(true)}>Edit blocking reason</Button><Dependencies task={task} />{task.dependentTaskIds.length > 0 && <><p className="font-medium">Required by</p>{task.dependentTaskIds.map((id) => <RelatedTask key={id} id={id} />)}</>}</div></Group>
    <Group title="Activity"><div className="flex flex-col gap-4 p-4"><QueryError error={activity.error} retry={activity.refetch} retained={Boolean(activity.data)} />{activity.isPending ? <LoadingRows /> : activity.items.length === 0 ? <p className="text-muted-foreground">No activity yet.</p> : <ol className="flex flex-col gap-4">{activity.items.map((a) => <li key={a.id}><p><span className="font-medium">{a.actorKind === "agent" ? "Agent credential" : a.actorKind === "system" ? "System" : "You"}</span> {a.action.replaceAll("_", " ")}{a.changedFields?.fields?.length ? ` (${a.changedFields.fields.join(", ")})` : ""}</p>{a.changedFields?.reason && <p>{a.changedFields.reason}</p>}<time className="text-xs text-muted-foreground" dateTime={a.createdAt}>{new Date(a.createdAt).toLocaleString()}</time></li>)}</ol>}<LoadMore query={activity} /></div></Group>
    {property && <PropertyValueEditor key={property.id} task={task} property={property} close={() => setProperty(null)} />}
    {labelEditor && <LabelsEditor task={task} close={() => setLabelEditor(false)} />}
    {reasonEditor && <ReasonEditor task={task} close={() => setReasonEditor(false)} />}
    {newProperty && <DefinitionEditor resource="properties" projectId={task.projectId} close={() => setNewProperty(false)} />}
  </div>;
}
function propertyText(property: Property, value: Task["properties"][string]) {
  if (Array.isArray(value)) return value.map((v) => property.options.find((o) => o.id === v)?.name ?? v).join(", ");
  if (property.type === "select") return property.options.find((o) => o.id === value)?.name ?? String(value);
  if (typeof value === "boolean") return value ? "Checked" : "Unchecked";
  return String(value);
}
function PropertyValueEditor({ task, property, close }: { task: Task; property: Property; close: () => void }) {
  const [base] = useState(task.revision); const action = useAction();
  const [value, setValue] = useState<Task["properties"][string]>(task.properties[property.id] ?? (property.type === "checkbox" ? false : property.type === "multi_select" ? [] : ""));
  const save = (next: unknown) => action.run(`tasks/${task.id}/properties`, { expectedRevision: base, values: { [property.id]: next } }, close);
  return <Dialog open onOpenChange={(open) => { if (!open && !action.pending) close(); }}><DialogContent><DialogHeader><DialogTitle>{property.name}</DialogTitle><DialogDescription>Update this task’s {property.type.replaceAll("_", " ")} value.</DialogDescription></DialogHeader><form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(property.type === "number" ? Number(value) : value); }}><FieldGroup>
    {property.type === "checkbox" ? <CheckField label={property.name} checked={Boolean(value)} onChange={(e) => setValue(e.target.checked)} /> : property.type === "multi_select" ? property.options.map((o) => <CheckField key={o.id} label={o.name} checked={Array.isArray(value) && value.includes(o.id)} onChange={(e) => setValue(e.target.checked ? [...(value as string[]), o.id] : (value as string[]).filter((v) => v !== o.id))} />) : property.type === "select" ? <SelectField label={property.name} required value={String(value)} onChange={(e) => setValue(e.target.value)}><option value="" disabled>Choose an option</option>{property.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectField> : <TextField label={property.name} required={property.type !== "text"} type={property.type === "number" ? "number" : property.type === "date" ? "date" : property.type === "url" ? "url" : "text"} step={property.type === "number" ? "any" : undefined} value={String(value)} onChange={(e) => setValue(e.target.value)} />}
    </FieldGroup><ActionFeedback action={action} /><DialogFooter><Button type="button" variant="outline" disabled={action.pending} onClick={() => void save(null)}>Clear value</Button><Button disabled={action.pending}>Save</Button></DialogFooter></form></DialogContent></Dialog>;
}
function LabelsEditor({ task, close }: { task: Task; close: () => void }) {
  const [base] = useState(task.revision); const [ids, setIds] = useState(task.labelIds); const action = useAction();
  const labels = useCollection<Label>("labels", { projectId: task.projectId });
  return <Dialog open onOpenChange={(open) => { if (!open && !action.pending) close(); }}><DialogContent><DialogHeader><DialogTitle>Task labels</DialogTitle><DialogDescription>Choose labels defined for this project.</DialogDescription></DialogHeader><FieldGroup>{labels.items.map((label) => <CheckField key={label.id} label={label.name} checked={ids.includes(label.id)} onChange={(e) => setIds(e.target.checked ? [...ids, label.id] : ids.filter((id) => id !== label.id))} />)}</FieldGroup><LoadMore query={labels} /><QueryError error={labels.error} retry={labels.refetch} /><ActionFeedback action={action} /><DialogFooter><Button disabled={action.pending || labels.isPending} onClick={() => void action.run(`tasks/${task.id}/labels`, { expectedRevision: base, labelIds: ids }, close)}>Save labels</Button></DialogFooter></DialogContent></Dialog>;
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
