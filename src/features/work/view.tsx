"use client";
import { ClearTaskFilters, Filters } from "./filters";
import { lazy, Suspense, useContext, useState } from "react";
import { DefaultTaskView } from "./view-preference";
import { TaskBoard } from "./board";
import { CalendarVisibility, TaskCalendar, useCalendarProperties } from "./calendar";
import { activeFilterLabels, taskParams } from "./filter-state";
const NoteEditor = lazy(() => import("@/features/notes/editor").then((module) => ({ default: module.NoteEditor })));
import { AttachmentPanel } from "@/features/attachments/panel";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUpDown, CalendarDays, Check, Columns3, CornerDownRight, List, Paperclip, Plus, StickyNote } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCollection, useEntity } from "./api";
import { ArchiveBadge, EntityActions, NewTaskButton, useEditor } from "./editors";
import { EmptyWork, Group, LoadMore, LoadingRows, ProgressLine, QueryError } from "./primitives";
import { TaskList } from "./task-list";
import { TaskDetail, TaskPanel } from "./task-detail";
import { groupLabels, workGroup } from "./model";
import type { Project, Section, Task } from "./types";
export function WorkView({ mode = "my-work", projectId, sectionId }: { mode?: "my-work" | "overview" | "tasks" | "section"; projectId?: string; sectionId?: string }) {
  const search = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const selectedTask = search.get("task"); const edit = useEditor();
  const [dialog, setDialog] = useState<"Note" | "Attachments" | null>(null);
  const projects = useCollection<Project>("projects", {}, mode === "my-work");
  const filtered = activeFilterLabels(new URLSearchParams(search.toString())).length > 0 || Boolean(search.get("q"));
  const includeArchived = search.get("archived") === "true";
  const defaultView = useContext(DefaultTaskView);
  const layout = search.get("view") ?? defaultView;
  const board = layout === "board" && mode !== "my-work";
  const [shownProperties, setShownProperties] = useCalendarProperties(projectId);
  const includeSubtasks = search.get("subtasks") === "true";
  const sort = ["manual", "updated", "due_date", "priority", "property"].includes(search.get("sort") ?? "") ? search.get("sort")! : "manual";
  const project = useEntity<Project>("projects", projectId);
  const section = useEntity<Section>("sections", sectionId);
  const sections = useCollection<Section>("sections", { projectId, includeArchived }, Boolean(projectId));
  const tasks = useCollection<Task>(mode === "my-work" ? "my-work" : "tasks", { ...taskParams(new URLSearchParams(search.toString()), { projectId, sectionId }), ...(board ? { excludeSubtasks: !includeSubtasks } : {}) }, mode === "my-work" || Boolean(projectId));
  const setParam = (key: string, value: string) => { const params = new URLSearchParams(search.toString()); params.set(key, value); router.replace(`${pathname}?${params}`, { scroll: false }); };
  const current = mode === "section" ? section.data : project.data;
  const title = mode === "my-work" ? "My work" : mode === "tasks" ? "All tasks" : current?.name;
  return <div className="work-view"><div className="work-view-scroll"><div className="work-screen-heading"><div className="flex min-w-0 flex-1 flex-col gap-2"><h1 className="work-title">{title ?? "Loading…"}</h1>{current && <ArchiveBadge row={current} />}</div>{mode === "my-work" && <div className="flex flex-wrap items-center justify-end gap-2"><div className="work-tabs" role="group" aria-label="Work scope">{[["false", "All active"], ["true", "Ready to work"]].map(([value, label]) => <button key={value} type="button" aria-pressed={(search.get("readyOnly") === "true" ? "true" : "false") === value} onClick={() => setParam("readyOnly", value)}>{label}</button>)}</div><Filters /></div>}{current && mode !== "tasks" && <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => edit({ kind: "section", projectId, parentSectionId: sectionId })}><Plus data-icon="inline-start" />New section</Button><EntityActions kind={mode === "section" ? "section" : "project"} row={current} extraItems={([["Note", StickyNote], ["Attachments", Paperclip]] as const).map(([label, icon]) => ({ label, icon, onSelect: () => setDialog(label) }))} afterDelete={() => router.push("/")} /></div>}</div>
    <QueryError error={project.error ?? section.error} retry={() => { void project.refetch(); void section.refetch(); }} retained={Boolean(current)} />
    {current && mode !== "tasks" && <div className="mb-6 flex flex-col gap-4">{current.description && <p className="max-w-3xl whitespace-pre-wrap text-muted-foreground">{current.description}</p>}{"lifecycle" in current && <div className="flex flex-wrap gap-3"><Badge variant="outline">{current.lifecycle[0].toUpperCase() + current.lifecycle.slice(1)}</Badge>{current.targetDate && <span className="text-muted-foreground">Target {current.targetDate}</span>}</div>}<ProgressLine value={current.progress} /></div>}
    {projectId && mode === "overview" && <><QueryError error={sections.error} retry={sections.refetch} retained={Boolean(sections.data)} />{sections.isPending ? <LoadingRows /> : <SectionPlan sections={sections.items} parentId={sectionId ?? null} projectId={projectId} />}<LoadMore query={sections} /></>}
    {mode !== "my-work" && <div className="work-list-toolbar">{<><div className="work-tabs" role="group" aria-label="Task layout">{([["board", "Board", Columns3], ["list", "List", List], ["calendar", "Calendar", CalendarDays]] as const).map(([value, label, Icon]) => <button key={value} type="button" className="inline-flex items-center gap-1.5" aria-pressed={value === (layout === "board" || layout === "calendar" ? layout : "list")} onClick={() => setParam("view", value)}><Icon className="size-3.5" aria-hidden="true" />{label}</button>)}</div><div className="ml-auto flex items-center gap-2">{layout === "calendar" && projectId && <CalendarVisibility projectId={projectId} shown={shownProperties} setShown={setShownProperties} />}<details className="work-menu"><summary aria-label="Sort tasks" title="Sort tasks" className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "list-none [&::-webkit-details-marker]:hidden")}><ArrowUpDown aria-hidden="true" /></summary><div className="work-menu-items">{([["manual", "Manual order"], ["due_date", "Due date"], ["priority", "Priority"], ["updated", "Recently updated"], ...(sort === "property" ? [["property", "Selected property"]] : [])] as const).map(([value, label]) => <Button key={value} variant="ghost" aria-pressed={sort === value} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setParam("sort", value); }}><Check data-icon="inline-start" className={sort === value ? "" : "invisible"} />{label}</Button>)}</div></details><Filters projectId={projectId} options={[...(board ? [{ key: "subtasks", label: "Subtasks" }] : []), ...(mode === "section" ? [{ key: "descendants", label: "Child sections" }] : []), { key: "archived", label: "Archived" }]} /></div></>}</div>}
    <QueryError error={tasks.error} retry={tasks.refetch} retained={Boolean(tasks.data)} />
    {tasks.isPending && (mode === "my-work" || layout !== "calendar") ? <LoadingRows /> : mode === "my-work" ? <>{Object.entries(groupLabels).map(([key, label]) => { const matching = tasks.items.filter((t) => workGroup(t) === key); const total = tasks.groupCounts?.[key] ?? matching.length; return <Group key={key} title={label} count={total}><TaskList tasks={matching} standalone />{matching.length === 0 && <p className="p-4 text-sm text-muted-foreground">{total > 0 ? "Load more work below to see this group." : `No ${label.toLowerCase()} tasks.`}</p>}</Group>; })}</> : layout === "calendar" && projectId ? <TaskCalendar tasks={tasks.items} projectId={projectId} shown={shownProperties} /> : board && projectId ? <TaskBoard tasks={tasks.items} projectId={projectId} hasMore={tasks.hasNextPage} statusCounts={tasks.statusCounts} /> : tasks.items.length > 0 ? <Group title={mode === "overview" ? "Project tasks" : "Tasks"}><TaskList tasks={tasks.items} /></Group> : !tasks.error && <EmptyWork title="No tasks in this view" description={includeArchived ? "Capture a task or choose another section." : "Add your first task, or include archived work."}><NewTaskButton projectId={projectId} sectionId={sectionId} /></EmptyWork>}
    <LoadMore query={tasks} />{current && dialog && <Dialog open onOpenChange={(open) => { if (!open) setDialog(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{dialog}</DialogTitle><DialogDescription className="sr-only">{dialog} for {current.name}.</DialogDescription></DialogHeader>{dialog === "Note" ? <Suspense fallback={<LoadingRows />}><NoteEditor key={current.id} kind={mode === "section" ? "section" : "project"} id={current.id} /></Suspense> : <AttachmentPanel key={`attachments-${current.id}`} kind={mode === "section" ? "section" : "project"} id={current.id} />}</DialogContent></Dialog>}
    {projectId && mode === "section" && <><QueryError error={sections.error} retry={sections.refetch} retained={Boolean(sections.data)} />{sections.isPending ? <LoadingRows /> : <SectionPlan sections={sections.items} parentId={sectionId ?? null} projectId={projectId} />}<LoadMore query={sections} /></>}
{mode === "my-work" && !tasks.isPending && !tasks.error && tasks.items.length === 0 && (projects.isPending ? <LoadingRows /> : projects.error && !projects.items.length ? <QueryError error={projects.error} retry={projects.refetch} /> : <EmptyWork title={filtered ? "No matching work" : projects.items.length ? "No active work yet" : "Your next step starts here"} description={filtered ? "Your current filters exclude all work. Clear them to see more tasks." : projects.items.length ? "Ready, In progress and In review tasks appear here. Open a project to review its backlog." : "Create a project, then capture your first task."}>{filtered ? <ClearTaskFilters /> : projects.items.length ? <NewTaskButton /> : <Button onClick={() => edit({ kind: "project" })}><Plus data-icon="inline-start" />Create project</Button>}</EmptyWork>)}
  </div>{selectedTask && <TaskPanel key={selectedTask} id={selectedTask} />}</div>;
}
function SectionPlan({ sections, parentId, projectId }: { sections: Section[]; parentId: string | null; projectId: string }) {
  const direct = sections.filter((s) => s.parentSectionId === parentId);
  if (!direct.length) return null;
  return <Group title={parentId ? "Child sections" : "Project plan"} count={direct.length}><div>{direct.map((s) => <div className="section-plan-row" key={s.id}><CornerDownRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><Link className="font-medium hover:underline" href={`/projects/${projectId}/sections/${s.id}`}>{s.name}</Link><ProgressLine value={s.progress} /></div><Badge variant="outline">{s.lifecycle[0].toUpperCase() + s.lifecycle.slice(1)}</Badge>{s.targetDate && <span className="work-row-date">{s.targetDate}</span>}<EntityActions kind="section" row={s} /></div>)}</div></Group>;
}
export function FullTaskView({ id }: { id: string }) { return <div className="full-task-view"><TaskDetail id={id} fullPage /></div>; }
