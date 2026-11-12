"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { todayInTimezone } from "@/lib/dates";
import { useTimezone } from "@/features/settings/timezone";
import { Popover } from "radix-ui";
import { propertyIconComponents } from "./property-icon-components";
import { ChevronLeft, ChevronRight, CircleDashed, Eye, EyeOff, Flag, Tags } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { TaskLink } from "./task-list";
import { useCollection, useEntity } from "./api";
import { StatusGlyph } from "./primitives";
import { formatDate } from "./date-picker";
import { categoryLabels } from "./model";
import { categoryColors, icons, optionColor } from "./task-properties";
import type { Label, Property, Task } from "./types";

export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0); const count = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
export function groupByDue<T extends { dueDate: string | null }>(tasks: T[]) {
  const groups = new Map<string, T[]>(); for (const task of tasks) { const key = task.dueDate ?? ""; groups.set(key, [...(groups.get(key) ?? []), task]); } return groups;
}
function CalendarLabel({ id }: { id: string }) {
  const label = useEntity<Label>("labels", id).data;
  return label ? <span className="property-pill property-label-pill" style={{ "--label-color": label.color } as React.CSSProperties}>{label.name}</span> : null;
}
const priorityColors = { low: "gray", medium: "blue", high: "amber", urgent: "red" } as const;
export function readShown(raw: string | null) { try { const value: unknown = JSON.parse(raw ?? ""); return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : ["labels"]; } catch { return ["labels"]; } }
// shortcut: per-browser only, move to user_preferences if it must sync across devices.
const storageListeners = new Set<() => void>();
const subscribe = (listener: () => void) => { storageListeners.add(listener); return () => { storageListeners.delete(listener); }; };
export function useCalendarProperties(projectId?: string) {
  const key = `zenshin:calendar-props:${projectId}`;
  const raw = useSyncExternalStore(subscribe, () => { try { return window.localStorage.getItem(key); } catch { return null; } }, () => null);
  const shown = useMemo(() => readShown(raw), [raw]);
  return [shown, (next: string[]) => { try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage blocked: change is lost */ } storageListeners.forEach((listener) => listener()); }] as const;
}
function calendarFields(properties: Property[]) { return [{ key: "status", name: "Status", Icon: CircleDashed }, { key: "priority", name: "Priority", Icon: Flag }, { key: "labels", name: "Labels", Icon: Tags }, ...properties.map((p) => ({ key: p.id, name: p.name, Icon: p.icon ? propertyIconComponents[p.icon] : icons[p.type] }))]; }
export function CalendarVisibility({ projectId, shown, setShown }: { projectId: string; shown: string[]; setShown: (next: string[]) => void }) {
  const properties = useCollection<Property>("properties", { projectId }); const [filter, setFilter] = useState(""); const fields = calendarFields(properties.items);
  const match = fields.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())); const on = shown.flatMap((key) => match.filter((f) => f.key === key)); const off = match.filter((f) => !shown.includes(f.key));
  const row = (f: (typeof fields)[number], visible: boolean) => <div key={f.key} className="calendar-visibility-row"><f.Icon size={16} aria-hidden /><span className="min-w-0 flex-1 truncate">{f.name}</span><button type="button" aria-label={`${visible ? "Hide" : "Show"} ${f.name}`} aria-pressed={visible} className={visible ? undefined : "text-muted-foreground"} onClick={() => setShown(visible ? shown.filter((k) => k !== f.key) : [...shown, f.key])}>{visible ? <Eye size={16} /> : <EyeOff size={16} />}</button></div>;
  return <Popover.Root><Popover.Trigger asChild><button type="button" data-slot="button" data-size="icon-sm" aria-label="Property visibility" title="Property visibility" className={buttonVariants({ variant: "outline", size: "icon-sm" })}><Eye aria-hidden /></button></Popover.Trigger><Popover.Portal><Popover.Content className="property-popover calendar-visibility" sideOffset={4} align="end"><div className="calendar-visibility-title">Property visibility</div><input className="property-search" aria-label="Search for a property" placeholder="Search for a property…" value={filter} onChange={(e) => setFilter(e.target.value)} /><div className="calendar-visibility-group"><span>Shown in calendar</span>{on.length > 0 && <button type="button" onClick={() => setShown([])}>Hide all</button>}</div>{on.map((f) => row(f, true))}<div className="calendar-visibility-group"><span>Hidden in calendar</span>{off.length > 0 && <button type="button" onClick={() => setShown([...shown, ...fields.filter((f) => !shown.includes(f.key)).map((f) => f.key)])}>Show all</button>}</div>{off.map((f) => row(f, false))}</Popover.Content></Popover.Portal></Popover.Root>;
}
function CardProperty({ field, task, properties }: { field: string; task: Task; properties: Property[] }) {
  if (field === "labels") return task.labelIds.map((id) => <CalendarLabel key={id} id={id} />);
  if (field === "priority") return task.priority !== "none" && <span className={`property-pill property-color-${priorityColors[task.priority]}`}>{task.priority[0].toUpperCase() + task.priority.slice(1)}</span>;
  if (field === "status") return <span className={`property-pill property-status property-color-${categoryColors[task.category]}`}><span className="property-dot" />{task.statusName ?? categoryLabels[task.category]}</span>;
  const property = properties.find((p) => p.id === field); const value = task.properties[field];
  if (!property) return null;
  if (property.type === "checkbox") return <span className="calendar-check"><input type="checkbox" checked={Boolean(value)} readOnly tabIndex={-1} aria-hidden />{property.name}</span>;
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;
  if (property.type === "select" || property.type === "multi_select") return (Array.isArray(value) ? value : [String(value)]).map((id) => <span key={id} className={`property-pill property-color-${optionColor(id)}`}>{property.options.find((o) => o.id === id)?.name ?? id}</span>);
  return <span className="calendar-text">{property.type === "date" ? formatDate(String(value)) : String(value)}</span>;
}
export function TaskCalendar({ tasks, projectId, shown = ["labels"] }: { tasks: Task[]; projectId: string; shown?: string[] }) {
  const properties = useCollection<Property>("properties", { projectId }).items;
  const today = todayInTimezone(useTimezone());
  const [month, setMonth] = useState(() => new Date(`${today}T12:00:00`));
  const [selectedDay, setSelectedDay] = useState(today);
  const [expanded, setExpanded] = useState<string[]>([]);
  const groups = groupByDue(tasks); const undated = groups.get("") ?? [];
  const navigate = (next: Date) => { setMonth(next); setSelectedDay(dateKey(next)); };
  const card = (task: Task) => <div key={task.id} className="calendar-card"><div className="calendar-card-title"><StatusGlyph category={task.category} /><TaskLink task={task} /></div>{shown.length > 0 && <div className="calendar-props">{shown.map((field) => <CardProperty key={field} field={field} task={task} properties={properties} />)}</div>}</div>;
  return <section className="task-calendar" aria-label="Task calendar">
    <div className="calendar-toolbar"><h2 aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => navigate(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button><Button variant="ghost" size="sm" onClick={() => navigate(new Date(`${today}T12:00:00`))}>Today</Button><Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => navigate(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button></div></div>
    <div className="calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{monthGrid(month).map((day) => {
      const key = dateKey(day); const items = groups.get(key) ?? []; const open = expanded.includes(key);
      return <div key={key} className="calendar-day" data-outside={day.getMonth() !== month.getMonth() || undefined}>
        <time dateTime={key}>{day.getDate() === 1 && <span>{day.toLocaleDateString(undefined, { month: "short" })}</span>}<span className={key === today ? "calendar-today" : undefined}>{day.getDate()}</span></time>
        <button type="button" className="calendar-day-select" aria-label={`${formatDate(key)}: ${items.length} loaded tasks`} aria-pressed={key === selectedDay} aria-current={key === today ? "date" : undefined} onClick={() => { setSelectedDay(key); if (day.getMonth() !== month.getMonth()) setMonth(day); }}><span>{day.getDate()}</span>{items.length > 0 && <small>{items.length}</small>}</button>
        <div className="calendar-tasks">{(open ? items : items.slice(0, 3)).map(card)}{items.length > 3 && <button type="button" className="calendar-more" aria-expanded={open} onClick={() => setExpanded(open ? expanded.filter((value) => value !== key) : [...expanded, key])}>{open ? "Less" : `+${items.length - 3} more`}</button>}</div>
      </div>;
    })}</div>
    <div className="calendar-agenda" aria-label="Selected day tasks"><h3 aria-live="polite">{formatDate(selectedDay)}</h3>{(groups.get(selectedDay) ?? []).map(card)}{!groups.get(selectedDay)?.length && <p className="text-muted-foreground">No loaded tasks due on this day.</p>}</div>
    {undated.length > 0 && <div className="calendar-undated"><h3>No due date ({undated.length})</h3>{undated.map((task) => <TaskLink key={task.id} task={task} />)}</div>}
  </section>;
}
