"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { categories, priorities } from "@/lib/contracts/work";
import { decodeTaskQuery, propertyFilter, type TaskQuery } from "@/lib/contracts/task-query";
import { useCollection } from "./api";
import { categoryLabels } from "./model";
import { CheckField, LoadMore, QueryError, SelectField, TextField } from "./primitives";
import { applyFilters, filterValues, splitValues } from "./filter-state";
import type { Project, Property, Section, Status, Label } from "./types";
export type FilterOption = { key: string; label: string };
export function Filters({ projectId, options = [], align = "end" }: { projectId?: string; options?: FilterOption[]; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const search = useSearchParams();
  const active = Object.entries(filterValues(new URLSearchParams(search.toString()))).filter(([key, value]) => !["sort", "sortPropertyId", "sortDirection", "projectId"].includes(key) && value !== "" && value !== "[]" && !(key === "archiveState" && value === "active") && !(key === "taskType" && value === "all")).length + options.filter((o) => search.get(o.key) === "true").length;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div ref={ref} className="relative"><Button variant="outline" size="sm" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}><ListFilter data-icon="inline-start" />Filters{active > 0 && <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.7rem] leading-4 font-semibold text-primary-foreground tabular-nums" aria-label={`${active} active`}>{active}</span>}</Button>{open && <FilterEditor projectId={projectId} options={options} align={align} active={active} close={() => setOpen(false)} />}</div>;
}
function FilterEditor({ projectId, options, align, active, close }: { projectId?: string; options: FilterOption[]; align: "start" | "end"; active: number; close: () => void }) {
  const search = useSearchParams(), router = useRouter(), path = usePathname();
  const [values, setValues] = useState(() => filterValues(new URLSearchParams(search.toString())));
  const [flags, setFlags] = useState(() => Object.fromEntries(options.map((o) => [o.key, search.get(o.key) === "true"])));
  const [error, setError] = useState("");
  const selectedProject = projectId ?? values.projectId ?? "";
  const projects = useCollection<Project>("projects", { includeArchived: true });
  const sections = useCollection<Section>("sections", { projectId: selectedProject, includeArchived: true }, Boolean(selectedProject));
  const statuses = useCollection<Status>("statuses", { projectId: selectedProject }, Boolean(selectedProject));
  const labels = useCollection<Label>("labels", { projectId: selectedProject }, Boolean(selectedProject));
  const properties = useCollection<Property>("properties", { projectId: selectedProject }, Boolean(selectedProject));
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const toggle = (key: string, value: string, checked: boolean) => set(key, (checked ? [...splitValues(values[key]), value] : splitValues(values[key]).filter((v) => v !== value)).join(","));
  let propertyFilters: TaskQuery["propertyFilters"] = [];
  try { propertyFilters = JSON.parse(values.propertyFilters ?? "[]"); } catch { /* Invalid URL data remains editable rather than crashing the dialog. */ }
  const setProperty = (definitionId: string, value: Record<string, unknown> | null) => set("propertyFilters", JSON.stringify([...propertyFilters.filter((f) => f.definitionId !== definitionId), ...(value ? [{ definitionId, ...value }] : [])]));
  return <div role="dialog" aria-labelledby="filter-title" className={cn("filter-popover absolute top-full z-30 mt-2 flex max-h-[75dvh] w-[min(960px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border text-popover-foreground md:w-[min(960px,calc(100vw-296px))]", align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left")}><form className="flex min-h-0 flex-col" onSubmit={(event) => { event.preventDefault(); try { decodeTaskQuery({ ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")), ...(projectId ? { projectId } : {}) }); const params = applyFilters(new URLSearchParams(search.toString()), values); for (const o of options) { if (flags[o.key]) params.set(o.key, "true"); else params.delete(o.key); } router.replace(`${path}?${params}`, { scroll: false }); close(); } catch (e) { setError(e instanceof Error ? e.message : "Check the filters."); } }}><div className="flex items-baseline justify-between gap-4 border-b px-5 pt-4 pb-3"><h2 id="filter-title" className="text-[0.95rem] font-semibold tracking-tight">Filter tasks</h2>{active > 0 && <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{active} active</span>}</div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4"><div className="flex flex-col gap-5">{options.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm font-medium">Show</span>{options.map((o) => <button key={o.key} type="button" aria-pressed={flags[o.key]} onClick={() => setFlags((f) => ({ ...f, [o.key]: !f[o.key] }))} className="filter-chip"><Check aria-hidden="true" className="size-3.5" />{o.label}</button>)}</div>}<div className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x [&>*]:md:px-5 [&>*:first-child]:md:pl-0 [&>*:last-child]:md:pr-0">
    <Column title="Scope">    <TextField label="Search text or task reference" value={values.q ?? ""} onChange={(e) => set("q", e.target.value)} />
    <SelectField label="Project" value={selectedProject} disabled={Boolean(projectId)} onChange={(e) => setValues((v) => ({ ...v, projectId: e.target.value, projectIds: "", sectionIds: "", statusIds: "", labelIds: "", propertyFilters: "[]", sort: v.sort === "property" ? "manual" : v.sort, sortPropertyId: "" }))}><option value="">All permitted projects</option>{projects.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField><LoadMore query={projects} />
    <SelectField label="Task type" value={values.taskType ?? "all"} onChange={(e) => set("taskType", e.target.value)}><option value="all">All tasks</option><option value="standalone">Standalone tasks</option><option value="parent">Parents with subtasks</option><option value="subtask">Subtasks</option></SelectField><SelectField label="GitHub link" value={values.linkedGithub ?? ""} onChange={(e) => set("linkedGithub", e.target.value)}><option value="">Any link state</option><option value="any">Has a link</option><option value="none">No links</option><option value="issue">Linked issue</option><option value="pr">Linked pull request</option></SelectField><SelectField label="Archive state" value={values.archiveState ?? "active"} onChange={(e) => set("archiveState", e.target.value)}><option value="active">Active work</option><option value="archived">Effectively archived</option><option value="all">Active and archived</option></SelectField></Column>
    <Column title="Workflow"><FilterGroup title="Workflow category">{categories.map((c) => <CheckField key={c} label={categoryLabels[c]} checked={splitValues(values.categories).includes(c)} onChange={(e) => toggle("categories", c, e.target.checked)} />)}</FilterGroup>
    <FilterGroup title="Priority">{priorities.map((p) => <CheckField key={p} label={p[0].toUpperCase() + p.slice(1)} checked={splitValues(values.priorities).includes(p)} onChange={(e) => toggle("priorities", p, e.target.checked)} />)}</FilterGroup>
    {selectedProject && <>{sections.items.length > 0 && <FilterGroup title="Sections">{sections.items.map((s) => <CheckField key={s.id} label={s.name} checked={splitValues(values.sectionIds).includes(s.id)} onChange={(e) => toggle("sectionIds", s.id, e.target.checked)} />)}<LoadMore query={sections} /></FilterGroup>}{statuses.items.length > 0 && <FilterGroup title="Statuses">{statuses.items.map((s) => <CheckField key={s.id} label={s.name} checked={splitValues(values.statusIds).includes(s.id)} onChange={(e) => toggle("statusIds", s.id, e.target.checked)} />)}<LoadMore query={statuses} /></FilterGroup>}{labels.items.length > 0 && <FilterGroup title="Labels">{labels.items.map((l) => <CheckField key={l.id} label={l.name} checked={splitValues(values.labelIds).includes(l.id)} onChange={(e) => toggle("labelIds", l.id, e.target.checked)} />)}<LoadMore query={labels} /></FilterGroup>}</>}
    <CheckField label="Ready to work (Ready and no blockers)" checked={values.readyOnly === "true"} onChange={(e) => set("readyOnly", String(e.target.checked))} /></Column>
    <Column title="Dates, flags & sort"><TextField label="Due from" type="date" value={values.dueFrom ?? ""} onChange={(e) => set("dueFrom", e.target.value)} /><TextField label="Due through" type="date" value={values.dueTo ?? ""} onChange={(e) => set("dueTo", e.target.value)} />
    {[{ key: "overdue", label: "Overdue" }, { key: "blocked", label: "Blocked" }].map(({ key, label }) => <SelectField key={key} label={label} value={values[key] ?? ""} onChange={(e) => set(key, e.target.value)}><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></SelectField>)}
    
    
    
    
    {selectedProject && <><SelectField label="Sort by property" value={values.sort === "property" ? values.sortPropertyId ?? "" : ""} onChange={(e) => setValues((v) => ({ ...v, sort: e.target.value ? "property" : "manual", sortPropertyId: e.target.value }))}><option value="">Use task sort</option>{properties.items.filter((p) => ["number", "date", "select"].includes(p.type)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField>{values.sort === "property" && <SelectField label="Property sort direction" value={values.sortDirection ?? "asc"} onChange={(e) => set("sortDirection", e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></SelectField>}</>}</Column></div>
    {selectedProject && properties.items.length > 0 && <FilterGroup title="Custom properties">{properties.items.map((p) => <PropertyFilter key={p.id} property={p} filter={propertyFilters.find((f) => f.definitionId === p.id)} change={(value) => setProperty(p.id, value)} />)}<LoadMore query={properties} /></FilterGroup>}</div>
<QueryError error={projects.error ?? sections.error ?? statuses.error ?? labels.error ?? properties.error} retry={() => { void projects.refetch(); if (selectedProject) { void sections.refetch(); void statuses.refetch(); void labels.refetch(); void properties.refetch(); } }} />{error && <p role="alert" className="whitespace-pre-wrap text-destructive">{error}</p>}</div><div className="filter-popover-footer flex items-center justify-between gap-2 border-t px-5 py-3"><p className="text-xs text-muted-foreground">Every group must match. Within a group, any choice can match.</p><div className="flex shrink-0 gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => { setValues({}); setFlags(Object.fromEntries(options.map((o) => [o.key, false]))); setError(""); }}>Reset all</Button><Button type="button" variant="outline" size="sm" onClick={close}>Cancel</Button><Button size="sm">Apply filters</Button></div></div></form></div>;
}
function Column({ title, children }: { title: string; children: React.ReactNode }) { return <FieldGroup className="gap-4 [&_[data-slot=native-select-wrapper]]:w-full"><h3 className="text-sm font-semibold tracking-tight">{title}</h3>{children}</FieldGroup>; }
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) { return <FieldSet><FieldLegend>{title}</FieldLegend><div className="grid grid-cols-2 gap-x-4 gap-y-2.5 [&_label]:whitespace-nowrap">{children}</div></FieldSet>; }
function PropertyFilter({ property, filter, change }: { property: Property; filter?: TaskQuery["propertyFilters"][number]; change: (value: Record<string, unknown> | null) => void }) {
  const op = filter?.op ?? "";
  const specific = property.type === "checkbox" ? "checked" : ["select", "multi_select"].includes(property.type) ? "options" : property.type === "number" ? "number_range" : property.type === "date" ? "date_range" : "contains";
  return <div className="flex w-full flex-col gap-3 rounded-lg border p-3"><SelectField label={property.name} value={op} onChange={(e) => { const next = e.target.value; change(!next ? null : next === "empty" || next === "not_empty" ? { op: next } : next === "checked" ? { op: next, value: true } : next === "options" ? { op: next, value: [] } : next === "contains" ? { op: next, value: "" } : { op: next }); }}><option value="">No filter</option><option value="empty">Is empty</option><option value="not_empty">Is not empty</option><option value={specific}>{specific.replaceAll("_", " ")}</option></SelectField>
    {filter?.op === "contains" && <TextField label="Contains" value={filter.value} onChange={(e) => change({ ...filter, value: e.target.value })} />}
    {filter?.op === "checked" && <SelectField label="Checkbox value" value={String(filter.value)} onChange={(e) => change({ ...filter, value: e.target.value === "true" })}><option value="true">Checked</option><option value="false">Unchecked</option></SelectField>}
    {filter?.op === "options" && property.options.map((o) => <CheckField key={o.id} label={o.name} checked={filter.value.includes(o.id)} onChange={(e) => change({ ...filter, value: e.target.checked ? [...filter.value, o.id] : filter.value.filter((id) => id !== o.id) })} />)}
    {(filter?.op === "number_range" || filter?.op === "date_range") && <>{(["min", "max"] as const).map((key) => <TextField key={key} label={key === "min" ? "From" : "Through"} type={filter.op === "date_range" ? "date" : "number"} step={filter.op === "number_range" ? "any" : undefined} value={filter[key] ?? ""} onChange={(e) => { const next = { ...filter } as Record<string, unknown>; if (!e.target.value) delete next[key]; else next[key] = filter.op === "number_range" ? Number(e.target.value) : e.target.value; change(next); }} />)}</>}
  </div>;
}
export { propertyFilter };
