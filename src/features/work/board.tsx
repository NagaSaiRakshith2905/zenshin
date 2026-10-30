"use client";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useCollection } from "./api";
import { ActionFeedback, useAction } from "./action";
import { TaskLink } from "./task-list";
import { LoadMore, LoadingRows, ProgressLine, QueryError, StatusGlyph } from "./primitives";
import type { Status, Task } from "./types";
export function TaskBoard({ tasks, projectId, hasMore, statusCounts }: { tasks: Task[]; projectId: string; hasMore: boolean; statusCounts?: Record<string, number> }) {
  const statuses = useCollection<Status>("statuses", { projectId }); const action = useAction();
  const [dragged, setDragged] = useState<Task | null>(null); const [over, setOver] = useState<string | null>(null); const [slotHeight, setSlotHeight] = useState(0);
  // Optimistic moves: the card shows its latest target at once. Saves run one at a time; a drop made while one is saving
  // replaces any queued target, so only the latest status is sent next (an in-flight request can't be un-sent server-side).
  const [wanted, setWanted] = useState<Record<string, string>>({});
  const queue = useRef<Record<string, string>>({}); const saved = useRef<Record<string, { statusId: string; revision: Task["revision"] }>>({}); const saving = useRef(false);
  const tasksRef = useRef(tasks); tasksRef.current = tasks;
  useEffect(() => { if (saving.current) return; for (const t of tasks) if (queue.current[t.id] === t.statusId) { delete queue.current[t.id]; delete saved.current[t.id]; } setWanted({ ...queue.current }); }, [tasks]);
  async function drain() {
    if (saving.current) return; saving.current = true;
    for (;;) {
      const next = Object.entries(queue.current).map(([id, statusId]) => { const t = tasksRef.current.find((x) => x.id === id); const base = saved.current[id] ?? (t && { statusId: t.statusId, revision: t.revision }); return base && base.statusId !== statusId ? { id, statusId, revision: base.revision } : null; }).find(Boolean);
      if (!next) break;
      const result = await action.run(`tasks/${next.id}/transition`, { expectedRevision: next.revision, statusId: next.statusId }) as { revision?: Task["revision"] } | undefined;
      if (result?.revision !== undefined) saved.current[next.id] = { statusId: next.statusId, revision: result.revision };
      else { delete queue.current[next.id]; delete saved.current[next.id]; setWanted({ ...queue.current }); } // failed: roll back to server state
    }
    saving.current = false;
  }
  const transition = (task: Task, statusId: string) => { if ((queue.current[task.id] ?? task.statusId) === statusId) return; queue.current[task.id] = statusId; setWanted({ ...queue.current }); void drain(); };
  const statusOf = (task: Task) => wanted[task.id] ?? task.statusId;
  const countOf = (id: string, shown: number) => { const base = statusCounts?.[id]; if (base === undefined) return shown; return tasks.reduce((n, t) => n + (statusOf(t) === id ? 1 : 0) - (t.statusId === id ? 1 : 0), base); };
  return <><QueryError error={statuses.error} retry={statuses.refetch} retained={Boolean(statuses.data)} /><ActionFeedback action={action} quiet />{statuses.isPending ? <LoadingRows /> : <div className="task-board" role="region" aria-label="Task board" tabIndex={0}>{statuses.items.map((status) => { const cards = tasks.filter((t) => statusOf(t) === status.id && !(t.id in wanted)).concat(tasks.filter((t) => t.id in wanted && wanted[t.id] === status.id)); /* server appends moved tasks last */ return <section className="board-column" key={status.id} aria-label={status.name} onDragEnter={() => { if (dragged) setOver(status.id); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => o === status.id ? null : o); }} onDragOver={(e) => { if (dragged) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (dragged) transition(dragged, status.id); setDragged(null); setOver(null); }}><h2 className="board-column-heading"><StatusGlyph category={status.category} /><span>{status.name}</span><span className="ml-auto text-muted-foreground">{countOf(status.id, cards.length)}</span></h2><div className="flex flex-col gap-3">{cards.map((task) => <article key={task.id} className="board-card" data-placeholder={dragged?.id === task.id ? "" : undefined} draggable onDragStart={(e) => { const card = e.currentTarget, box = card.getBoundingClientRect(); setSlotHeight(box.height); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.setDragImage(card, e.clientX - box.left, e.clientY - box.top); requestAnimationFrame(() => setDragged(task)); }} onDragEnd={() => { setDragged(null); setOver(null); }}><TaskLink task={task} />{task.dueDate && <time className="board-card-due" dateTime={task.dueDate}>{new Date(`${task.dueDate}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>}{task.progress && <ProgressLine value={task.progress} />}{(task.priority !== "none" || task.blocked) && <div className="board-card-footer">{task.priority !== "none" && <span className={`property-pill property-color-${{ low: "gray", medium: "blue", high: "amber", urgent: "red" }[task.priority]}`}>{task.priority[0].toUpperCase() + task.priority.slice(1)}</span>}{task.blocked && <Badge variant="outline">Blocked</Badge>}</div>}</article>)}{dragged && over === status.id && statusOf(dragged) !== status.id && <div className="board-slot" style={{ height: slotHeight }} aria-hidden="true" />}{!cards.length && !(dragged && over === status.id) && <p className="p-3 text-sm text-muted-foreground">{hasMore && (statusCounts?.[status.id] ?? 1) > 0 ? "Load more tasks to see cards in this status." : "No matching tasks."}</p>}</div></section>; })}</div>}<LoadMore query={statuses} /></>;
}
