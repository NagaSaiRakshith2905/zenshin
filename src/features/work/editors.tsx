"use client";
import { createContext, useContext, useRef, useCallback, useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, ArchiveRestore, MoveRight, Trash2, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { priorities } from "@/lib/contracts/work";
import { useCollection } from "./api";
import { ActionFeedback, useAction } from "./action";
import { TextField, SelectField, QueryError, LoadMore } from "./primitives";
import type { Entity, EntityKind, Project, Section, Task, Status } from "./types";
import { entityName } from "./types";

type EditorRequest = { kind: EntityKind; row?: Entity; projectId?: string; sectionId?: string; parentTask?: Task; parentSectionId?: string };
const EditorContext = createContext<(request: EditorRequest) => void>(() => {});
export const useEditor = () => useContext(EditorContext);
export function EditorProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<EditorRequest | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openEditor = useCallback((next: EditorRequest) => { returnFocus.current = document.activeElement as HTMLElement; setRequest(next); }, []);
  const closeEditor = () => { setRequest(null); requestAnimationFrame(() => returnFocus.current?.focus({ preventScroll: true })); };
  return <EditorContext.Provider value={openEditor}>{children}{request && <EntityEditor key={`${request.kind}-${request.row?.id ?? "new"}`} request={request} close={closeEditor} />}</EditorContext.Provider>;
}
function EntityEditor({ request, close }: { request: EditorRequest; close: () => void }) {
  const { kind, row } = request;
  const [baseRevision] = useState(row?.revision);
  const action = useAction(); const router = useRouter();
  const [name, setName] = useState(row ? entityName(row) : "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [prefix, setPrefix] = useState("");
  const [selectedProject, setProject] = useState(request.projectId ?? (row && "projectId" in row ? row.projectId : ""));
  const projects = useCollection<Project>("projects", {}, kind !== "project");
  const projectId = selectedProject || projects.items[0]?.id || "";
  const [sectionId, setSection] = useState(request.parentTask?.sectionId ?? request.sectionId ?? (row && "sectionId" in row ? row.sectionId : "") ?? "");
  const [parentSectionId, setParentSection] = useState(request.parentSectionId ?? "");
  const sections = useCollection<Section>("sections", { projectId }, !row && kind !== "project" && Boolean(projectId));
  const statuses = useCollection<Status>("statuses", { projectId }, kind === "task" && !row && Boolean(projectId));
  const [statusId, setStatus] = useState("");
  const [priority, setPriority] = useState(row && "priority" in row ? row.priority : "none");
  const [date, setDate] = useState(row && "dueDate" in row ? row.dueDate ?? "" : row && "targetDate" in row ? row.targetDate ?? "" : "");
  const [lifecycle, setLifecycle] = useState(row && "lifecycle" in row ? row.lifecycle : "planned");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const input: Record<string, unknown> = { [kind === "task" ? "title" : "name"]: name, description };
    if (row) input.expectedRevision = baseRevision;
    if (kind === "project" && !row) input.prefix = prefix;
    if (kind !== "project" && !row) input.projectId = projectId;
    if (kind === "section") Object.assign(input, { lifecycle, targetDate: date || null, ...(!row ? { parentSectionId: parentSectionId || null } : {}) });
    if (kind === "task") Object.assign(input, { priority, dueDate: date || null, ...(!row ? { sectionId: sectionId || null, parentTaskId: request.parentTask?.id ?? null, statusId: statusId || statuses.items.find((s) => s.isDefault)?.id } : {}) });
    const resource = kind === "project" ? "projects" : kind === "section" ? "sections" : "tasks";
    await action.run(`${resource}${row ? `/${row.id}` : ""}`, input, (result) => { close(); if (kind === "project" && !row) router.push(`/projects/${(result as Project).id}`); });
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !action.pending) close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{row ? "Edit" : "New"} {request.parentTask ? "subtask" : kind}</DialogTitle><DialogDescription>{request.parentTask ? `Add work under ${request.parentTask.reference}: ${request.parentTask.title}` : row ? "Save changes to this item." : "Capture work with a clear name. You can add more detail later."}</DialogDescription></DialogHeader>
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5"><FieldGroup>
      {kind !== "project" && !row && <><SelectField label="Project" value={projectId} disabled={Boolean(request.parentTask)} required onChange={(e) => { setProject(e.target.value); setSection(""); setStatus(""); setParentSection(""); }}><option value="" disabled>Select a project</option>{projects.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField><LoadMore query={projects} /><QueryError error={projects.error} retry={projects.refetch} /></>}
      <TextField label={kind === "task" ? "Title" : "Name"} autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
      {kind === "project" && !row && <TextField label="Task prefix (2–10 uppercase letters or digits)" placeholder="ZEN" pattern="[A-Z][A-Z0-9]{1,9}" required value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} />}
      <TextField label="Description" multiline value={description} onChange={(e) => setDescription(e.target.value)} />
      {kind === "section" && <>{!row && <SelectField label="Parent section" value={parentSectionId} onChange={(e) => setParentSection(e.target.value)}><option value="">Project root</option>{sections.items.map((s) => <option key={s.id} value={s.id}>{s.breadcrumbs?.map((b) => b.name).concat(s.name).join(" / ")}</option>)}</SelectField>}<SelectField label="Lifecycle" value={lifecycle} onChange={(e) => setLifecycle(e.target.value as Section["lifecycle"])}>{["planned", "active", "completed"].map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}</SelectField><TextField label="Target date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></>}
      {kind === "task" && <div className="task-form-properties">{!row && <><SelectField label="Section" value={sectionId} disabled={Boolean(request.parentTask)} onChange={(e) => setSection(e.target.value)}><option value="">Project root</option>{sections.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField><LoadMore query={sections} /><SelectField label="Status" value={statusId || statuses.items.find((s) => s.isDefault)?.id || ""} onChange={(e) => setStatus(e.target.value)}>{statuses.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField><LoadMore query={statuses} /></>}<SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>{priorities.map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}</SelectField><TextField label="Due date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
    </FieldGroup><QueryError error={sections.error ?? statuses.error} retry={() => { void sections.refetch(); void statuses.refetch(); }} /><ActionFeedback action={action} /><DialogFooter><Button type="button" variant="outline" disabled={action.pending} onClick={close}>Cancel</Button><Button disabled={action.pending || (kind !== "project" && !projectId)}>{action.pending ? "Saving…" : row ? "Save changes" : `Create ${request.parentTask ? "subtask" : kind}`}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}
export function EntityActions({ kind, row, afterDelete }: { kind: EntityKind; row: Entity; afterDelete?: () => void }) {
  const edit = useEditor();
  const action = useAction();
  const [moving, setMoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [archiveRevision, setArchiveRevision] = useState(row.revision);
  const resource = kind === "project" ? "projects" : kind === "section" ? "sections" : "tasks";
  return <><details className="work-menu"><summary aria-label={`Actions for ${entityName(row)}`}><Ellipsis aria-hidden="true" /></summary><div className="work-menu-items"><Button variant="ghost" onClick={() => edit({ kind, row })}><Pencil data-icon="inline-start" />Edit {kind}</Button>{kind !== "project" && <Button variant="ghost" onClick={() => setMoving(true)}><MoveRight data-icon="inline-start" />Move / reorder</Button>}{row.archivedAt ? <><Button variant="ghost" disabled={action.pending} onClick={() => void action.run(`${resource}/${row.id}/restore`, { expectedRevision: row.revision })}><ArchiveRestore data-icon="inline-start" />Restore</Button><Button variant="ghost" disabled={action.pending} onClick={() => void action.run(`${resource}/${row.id}/delete`, { expectedRevision: row.revision }, afterDelete)}><Trash2 data-icon="inline-start" />Delete permanently</Button></> : <Button variant="ghost" onClick={() => { setArchiveRevision(row.revision); setConfirming(true); }}><Archive data-icon="inline-start" />Archive {kind}</Button>}</div></details>{!confirming && <ActionFeedback action={action} />}
    {confirming && <Dialog open onOpenChange={(open) => { if (!open && !action.pending) setConfirming(false); }}><DialogContent><DialogHeader><DialogTitle>Archive “{entityName(row)}”?</DialogTitle><DialogDescription>This hides this {kind} and its descendants from active views. You can restore them in Archived work.</DialogDescription></DialogHeader><ActionFeedback action={action} /><DialogFooter><Button variant="outline" onClick={() => setConfirming(false)} disabled={action.pending}>Cancel</Button><Button disabled={action.pending} onClick={() => void action.run(`${resource}/${row.id}/archive`, { expectedRevision: archiveRevision }, () => setConfirming(false))}>Archive</Button></DialogFooter></DialogContent></Dialog>}
    {moving && <MoveDialog kind={kind as "section" | "task"} row={row as Section | Task} close={() => setMoving(false)} />}
  </>;
}
function MoveDialog({ kind, row, close }: { kind: "section" | "task"; row: Section | Task; close: () => void }) {
  const [baseRevision] = useState(row.revision);
  const action = useAction();
  const sections = useCollection<Section>("sections", { projectId: row.projectId });
  const tasks = useCollection<Task>("tasks", { projectId: row.projectId }, kind === "task");
  const [sectionId, setSection] = useState("sectionId" in row ? row.sectionId ?? "" : row.parentSectionId ?? "");
  const [parentId, setParent] = useState("parentTaskId" in row ? row.parentTaskId ?? "" : "");
  const [beforeId, setBefore] = useState("");
  const siblings = kind === "task" ? tasks.items.filter((t) => t.id !== row.id && t.sectionId === (sectionId || null) && t.parentTaskId === (parentId || null)) : sections.items.filter((s) => s.id !== row.id && s.parentSectionId === (sectionId || null));
  return <Dialog open onOpenChange={(open) => { if (!open && !action.pending) close(); }}><DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-lg"><DialogHeader><DialogTitle>Move “{entityName(row)}”</DialogTitle><DialogDescription>{kind === "task" ? "Subtasks move with their parent. Choose a parent to convert this task into a subtask." : "A section and its descendants must fit within three levels."}</DialogDescription></DialogHeader><form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void action.run(`${kind === "task" ? "tasks" : "sections"}/${row.id}/move`, { expectedRevision: baseRevision, ...(kind === "task" ? { sectionId: sectionId || null, parentTaskId: parentId || null } : { parentSectionId: sectionId || null }), beforeId: beforeId || null }, close); }}><FieldGroup><SelectField label={kind === "task" ? "Section" : "Parent section"} value={sectionId} onChange={(e) => { setSection(e.target.value); setParent(""); setBefore(""); }}><option value="">Project root</option>{sections.items.filter((s) => s.id !== row.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField><LoadMore query={sections} />{kind === "task" && <><SelectField label="Parent task" value={parentId} onChange={(e) => { setParent(e.target.value); setBefore(""); }}><option value="">No parent (standalone task)</option>{tasks.items.filter((t) => !t.parentTaskId && t.id !== row.id && t.sectionId === (sectionId || null)).map((t) => <option key={t.id} value={t.id}>{t.reference}: {t.title}</option>)}</SelectField><LoadMore query={tasks} /></>}<SelectField label="Position" value={beforeId} onChange={(e) => setBefore(e.target.value)}><option value="">At the end</option>{siblings.map((s) => <option key={s.id} value={s.id}>Before {entityName(s)}</option>)}</SelectField></FieldGroup><QueryError error={sections.error ?? tasks.error} retry={() => { void sections.refetch(); void tasks.refetch(); }} /><ActionFeedback action={action} /><DialogFooter><Button variant="outline" type="button" onClick={close}>Cancel</Button><Button disabled={action.pending}>Move</Button></DialogFooter></form></DialogContent></Dialog>;
}
export function NewTaskButton({ projectId, sectionId, parentTask }: { projectId?: string; sectionId?: string; parentTask?: Task }) { const edit = useEditor(); return <Button onClick={() => edit({ kind: "task", projectId, sectionId, parentTask })}><Plus data-icon="inline-start" />{parentTask ? "Add subtask" : "New task"}</Button>; }
export function ArchiveBadge({ row }: { row: Entity }) { return (row.archivedAt || ("effectiveArchived" in row && row.effectiveArchived)) ? <Badge variant="outline">Archived</Badge> : null; }
