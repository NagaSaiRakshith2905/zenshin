"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEntity } from "./api";
import { taskHref } from "./model";
import { StatusGlyph } from "./primitives";
import type { Task } from "./types";
export function TaskLink({ task, context = false }: { task: Task; context?: boolean }) {
  const pathname = usePathname(); const search = useSearchParams();
  return <Link data-task-link={task.id} className={cn("work-task-title", context && "text-muted-foreground")} href={taskHref(pathname, search.toString(), task.id)} scroll={false}><span className="work-reference">{task.reference}</span><span className="min-w-0 break-words">{task.parentReference && <span className="text-muted-foreground">{task.parentReference} › </span>}{task.title}</span></Link>;
}
export function TaskRow({ task, standalone = false, context = false, subtasks = [] }: { task: Task; standalone?: boolean; context?: boolean; subtasks?: Task[] }) {
  const [expanded, setExpanded] = useState(true);
  const selected = useSearchParams().get("task") === task.id;
  const hasChildren = !standalone && subtasks.length > 0;
  return <><div className={cn("work-task-row", selected && "is-selected", task.parentTaskId && "is-subtask")}>
    <StatusGlyph category={task.category} /><TaskLink task={task} context={context} />
    {task.blocked && <Badge variant="secondary"><Ban aria-hidden="true" />Blocked</Badge>}
    {task.projectName && <span className="work-row-project text-muted-foreground">{task.projectName}</span>}
    {task.priority !== "none" && <Badge className="work-row-priority" variant={task.priority === "urgent" ? "default" : "outline"}>{task.priority[0].toUpperCase() + task.priority.slice(1)}</Badge>}
    {!standalone && (hasChildren ? <Button variant="ghost" size="icon-sm" className="max-md:size-11" aria-label={`${expanded ? "Collapse" : "Expand"} subtasks for ${task.reference}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown /> : <ChevronRight />}</Button> : <span className="size-7 shrink-0 max-md:size-11" aria-hidden="true" />)}
    <span className={cn("work-row-date", task.overdue && "is-overdue")}>{task.dueDate ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${task.dueDate}T00:00:00Z`)) : "—"}</span>
  </div>{hasChildren && expanded && <div className="work-subtasks">{subtasks.map((child) => <TaskRow key={child.id} task={child} standalone />)}</div>}</>;
}
function ContextParent({ parentId, children }: { parentId: string; children: Task[] }) {
  const query = useEntity<Task>("tasks", parentId);
  return <>{query.data && <TaskRow task={query.data} standalone context />}{children.map((task) => <TaskRow key={task.id} task={task} standalone />)}</>;
}
export function TaskList({ tasks, standalone = false }: { tasks: Task[]; standalone?: boolean }) {
  if (standalone) return <div>{tasks.map((task) => <TaskRow key={task.id} task={task} standalone />)}</div>;
  const ids = new Set(tasks.map((t) => t.id));
  const orphans = [...new Set(tasks.filter((t) => t.parentTaskId && !ids.has(t.parentTaskId)).map((t) => t.parentTaskId!))];
  return <div>{tasks.filter((t) => !t.parentTaskId).map((task) => <TaskRow key={task.id} task={task} subtasks={tasks.filter((child) => child.parentTaskId === task.id)} />)}{orphans.map((id) => <ContextParent key={id} parentId={id}>{tasks.filter((t) => t.parentTaskId === id)}</ContextParent>)}</div>;
}
