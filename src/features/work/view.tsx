"use client";
import { Filters } from "./filters";
import { useContext } from "react";
import { DefaultTaskView } from "./view-preference";
import { TaskBoard } from "./board";
import { taskParams } from "./filter-state";
import { NoteEditor } from "@/features/notes/editor";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCollection, useEntity } from "./api";
import { ArchiveBadge, EntityActions, NewTaskButton, useEditor } from "./editors";
import { CheckField, EmptyWork, Group, LoadMore, LoadingRows, ProgressLine, QueryError, SelectField } from "./primitives";
import { TaskList } from "./task-list";
import { TaskDetail, TaskPanel } from "./task-detail";
import { groupLabels, workGroup } from "./model";
import type { Project, Section, Task } from "./types";
export function WorkView({ mode = "my-work", projectId, sectionId }: { mode?: "my-work" | "overview" | "tasks" | "section"; projectId?: string; sectionId?: string }) {
  const search = useSearchParams(); const router = useRouter(); const pathname = usePathname();
  const selectedTask = search.get("task"); const edit = useEditor();
  const includeDescendants = search.get("descendants") === "true";
  const includeArchived = search.get("archived") === "true";
  const defaultView = useContext(DefaultTaskView);
  const board = (search.get("view") ?? defaultView) === "board" && mode !== "my-work";
  const includeSubtasks = search.get("subtasks") === "true";
  const sort = ["manual", "updated", "due_date", "priority", "property"].includes(search.get("sort") ?? "") ? search.get("sort")! : "manual";
  const project = useEntity<Project>("projects", projectId);
  const section = useEntity<Section>("sections", sectionId);
  const sections = useCollection<Section>("sections", { projectId, includeArchived }, Boolean(projectId));
  const tasks = useCollection<Task>(mode === "my-work" ? "my-work" : "tasks", { ...taskParams(new URLSearchParams(search.toString()), { projectId, sectionId }), ...(board ? { excludeSubtasks: !includeSubtasks } : {}) }, mode === "my-work" || Boolean(projectId));
  const setParam = (key: string, value: string) => { const params = new URLSearchParams(search.toString()); params.set(key, value); router.replace(`${pathname}?${params}`, { scroll: false }); };
  const current = mode === "section" ? section.data : project.data;
  const title = mode === "my-work" ? "My work" : mode === "tasks" ? "All tasks" : current?.name;
  return <div className="work-view"><div className="work-view-scroll"><div className="work-screen-heading"><div className="flex min-w-0 flex-1 flex-col gap-2"><h1 className="work-title">{title ?? "Loading…"}</h1>{mode === "my-work" && <p className="text-muted-foreground">Your next work, across every active project.</p>}{current && <ArchiveBadge row={current} />}</div>{current && mode !== "tasks" && <EntityActions kind={mode === "section" ? "section" : "project"} row={current} afterDelete={() => router.push("/")} />}</div>
    <QueryError error={project.error ?? section.error} retry={() => { void project.refetch(); void section.refetch(); }} retained={Boolean(current)} />
    {current && mode !== "tasks" && <div className="mb-6 flex flex-col gap-4">{current.description && <p className="max-w-3xl whitespace-pre-wrap text-muted-foreground">{current.description}</p>}{"lifecycle" in current && <div className="flex flex-wrap gap-3"><Badge variant="outline">{current.lifecycle[0].toUpperCase() + current.lifecycle.slice(1)}</Badge>{current.targetDate && <span className="text-muted-foreground">Target {current.targetDate}</span>}</div>}<ProgressLine value={current.progress} /><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => edit({ kind: "section", projectId, parentSectionId: sectionId })}><Plus data-icon="inline-start" />New section</Button>{mode === "overview" && <Button asChild size="sm" variant="outline"><Link href={`/projects/${projectId}/tasks`}>All tasks</Link></Button>}<Button size="sm" variant="ghost" onClick={() => edit({ kind: mode === "section" ? "section" : "project", row: current })}>Edit {mode === "section" ? "section plan" : "project"}</Button></div></div>}
    {current && mode !== "tasks" && <NoteEditor key={current.id} kind={mode === "section" ? "section" : "project"} id={current.id} />}
    {projectId && mode !== "tasks" && <><QueryError error={sections.error} retry={sections.refetch} retained={Boolean(sections.data)} />{sections.isPending ? <LoadingRows /> : <SectionPlan sections={sections.items} parentId={sectionId ?? null} projectId={projectId} />}<LoadMore query={sections} /></>}
    {<div className="work-list-toolbar"><Filters projectId={projectId} />{mode !== "my-work" && <><Button variant="outline" size="sm" onClick={() => setParam("view", board ? "list" : "board")}>{board ? "List view" : "Board view"}</Button>{board && <CheckField label="Include subtasks" checked={includeSubtasks} onChange={(e) => setParam("subtasks", String(e.target.checked))} />}{mode === "section" && <CheckField label="Include child sections" checked={includeDescendants} onChange={(e) => setParam("descendants", String(e.target.checked))} />}<CheckField label="Include archived" checked={includeArchived} onChange={(e) => setParam("archived", String(e.target.checked))} /><SelectField label="Sort tasks" value={sort} onChange={(e) => setParam("sort", e.target.value)}><option value="manual">Manual order</option><option value="due_date">Due date</option><option value="priority">Priority</option><option value="updated">Recently updated</option>{sort === "property" && <option value="property">Selected property</option>}</SelectField></>}</div>}
    <QueryError error={tasks.error} retry={tasks.refetch} retained={Boolean(tasks.data)} />
    {tasks.isPending ? <LoadingRows /> : mode === "my-work" ? <>{Object.entries(groupLabels).map(([key, label]) => { const matching = tasks.items.filter((t) => workGroup(t) === key); const total = tasks.groupCounts?.[key] ?? matching.length; return <Group key={key} title={label} count={total}><TaskList tasks={matching} standalone />{matching.length === 0 && <p className="p-4 text-sm text-muted-foreground">{total > 0 ? "Load more work below to see this group." : `No ${label.toLowerCase()} tasks.`}</p>}</Group>; })}</> : board && projectId ? <TaskBoard tasks={tasks.items} projectId={projectId} hasMore={tasks.hasNextPage} statusCounts={tasks.statusCounts} /> : tasks.items.length > 0 ? <Group title={mode === "overview" ? "Project tasks" : "Tasks"}><TaskList tasks={tasks.items} /></Group> : !tasks.error && <EmptyWork title="No tasks in this view" description={includeArchived ? "Capture a task or choose another section." : "Add your first task, or include archived work."}><NewTaskButton projectId={projectId} sectionId={sectionId} /></EmptyWork>}
    <LoadMore query={tasks} />{mode === "my-work" && !tasks.isPending && !tasks.error && tasks.items.length === 0 && <EmptyWork title="Your next step starts here" description="Create a project, then capture a task in Ready or In progress. Backlog tasks stay in their project."><Button onClick={() => edit({ kind: "project" })}><Plus data-icon="inline-start" />Create project</Button></EmptyWork>}
  </div>{selectedTask && <TaskPanel key={selectedTask} id={selectedTask} />}</div>;
}
function SectionPlan({ sections, parentId, projectId }: { sections: Section[]; parentId: string | null; projectId: string }) {
  const direct = sections.filter((s) => s.parentSectionId === parentId);
  if (!direct.length) return null;
  return <Group title={parentId ? "Child sections" : "Project plan"} count={direct.length}><div>{direct.map((s) => <div className="section-plan-row" key={s.id}><CornerDownRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><Link className="font-medium hover:underline" href={`/projects/${projectId}/sections/${s.id}`}>{s.name}</Link><ProgressLine value={s.progress} /></div><Badge variant="outline">{s.lifecycle[0].toUpperCase() + s.lifecycle.slice(1)}</Badge>{s.targetDate && <span className="work-row-date">{s.targetDate}</span>}<EntityActions kind="section" row={s} /></div>)}</div></Group>;
}
export function FullTaskView({ id }: { id: string }) { return <div className="full-task-view"><TaskDetail id={id} fullPage /></div>; }
