"use client";
import { useState } from "react";
import { ListFilter } from "lucide-react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { categories, priorities } from "@/lib/contracts/work";
import { decodeTaskQuery, propertyFilter, type TaskQuery } from "@/lib/contracts/task-query";
import { useCollection } from "./api";
import { categoryLabels } from "./model";
import { CheckField, LoadMore, QueryError, SelectField, TextField } from "./primitives";
import { applyFilters, filterValues, splitValues } from "./filter-state";
import type { Project, Property, Section, Status, Label } from "./types";
export function Filters({ projectId }: { projectId?: string }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}><ListFilter data-icon="inline-start" />Filters</Button>{open && <FilterEditor projectId={projectId} close={() => setOpen(false)} />}</>;
}
function FilterEditor({ projectId, close }: { projectId?: string; close: () => void }) {
  const search = useSearchParams(), router = useRouter(), path = usePathname();
  const [values, setValues] = useState(() => filterValues(new URLSearchParams(search.toString())));
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
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Filter tasks</DialogTitle><DialogDescription>Groups combine with AND. Multiple choices within a group combine with OR. Filters and sorting are saved in the URL.</DialogDescription></DialogHeader><form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); try { decodeTaskQuery({ ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")), ...(projectId ? { projectId } : {}) }); const params = applyFilters(new URLSearchParams(search.toString()), values); router.replace(`${path}?${params}`, { scroll: false }); close(); } catch (e) { setError(e instanceof Error ? e.message : "Check the filters."); } }}><FieldGroup>
    <TextField label="Search text or task reference" value={values.q ?? ""} onChange={(e) => set("q", e.target.value)} />
    <SelectField label="Project" value={selectedProject} disabled={Boolean(projectId)} onChange={(e) => setValues((v) => ({ ...v, projectId: e.target.value, projectIds: "", sectionIds: "", statusIds: "", labelIds: "", propertyFilters: "[]", sort: v.sort === "property" ? "manual" : v.sort, sortPropertyId: "" }))}><option value="">All permitted projects</option>{projects.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField><LoadMore query={projects} />
    <FilterGroup title="Workflow category">{categories.map((c) => <CheckField key={c} label={categoryLabels[c]} checked={splitValues(values.categories).includes(c)} onChange={(e) => toggle("categories", c, e.target.checked)} />)}</FilterGroup>
    <FilterGroup title="Priority">{priorities.map((p) => <CheckField key={p} label={p[0].toUpperCase() + p.slice(1)} checked={splitValues(values.priorities).includes(p)} onChange={(e) => toggle("priorities", p, e.target.checked)} />)}</FilterGroup>
    {selectedProject && <><FilterGroup title="Sections">{sections.items.map((s) => <CheckField key={s.id} label={s.name} checked={splitValues(values.sectionIds).includes(s.id)} onChange={(e) => toggle("sectionIds", s.id, e.target.checked)} />)}<LoadMore query={sections} /></FilterGroup><FilterGroup title="Statuses">{statuses.items.map((s) => <CheckField key={s.id} label={s.name} checked={splitValues(values.statusIds).includes(s.id)} onChange={(e) => toggle("statusIds", s.id, e.target.checked)} />)}<LoadMore query={statuses} /></FilterGroup><FilterGroup title="Labels">{labels.items.map((l) => <CheckField key={l.id} label={l.name} checked={splitValues(values.labelIds).includes(l.id)} onChange={(e) => toggle("labelIds", l.id, e.target.checked)} />)}<LoadMore query={labels} /></FilterGroup></>}
    <TextField label="Due from" type="date" value={values.dueFrom ?? ""} onChange={(e) => set("dueFrom", e.target.value)} /><TextField label="Due through" type="date" value={values.dueTo ?? ""} onChange={(e) => set("dueTo", e.target.value)} />
    {[{ key: "overdue", label: "Overdue" }, { key: "blocked", label: "Blocked" }].map(({ key, label }) => <SelectField key={key} label={label} value={values[key] ?? ""} onChange={(e) => set(key, e.target.value)}><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></SelectField>)}
    <CheckField label="Ready to work (Ready and no blockers)" checked={values.readyOnly === "true"} onChange={(e) => set("readyOnly", String(e.target.checked))} />
    <SelectField label="Task type" value={values.taskType ?? "all"} onChange={(e) => set("taskType", e.target.value)}><option value="all">All tasks</option><option value="standalone">Standalone tasks</option><option value="parent">Parents with subtasks</option><option value="subtask">Subtasks</option></SelectField>
    <SelectField label="GitHub link" value={values.linkedGithub ?? ""} onChange={(e) => set("linkedGithub", e.target.value)}><option value="">Any link state</option><option value="any">Has a link</option><option value="none">No links</option><option value="issue">Linked issue</option><option value="pr">Linked pull request</option></SelectField>
    <SelectField label="Archive state" value={values.archiveState ?? "active"} onChange={(e) => set("archiveState", e.target.value)}><option value="active">Active work</option><option value="archived">Effectively archived</option><option value="all">Active and archived</option></SelectField>
    {selectedProject && <><SelectField label="Sort by property" value={values.sort === "property" ? values.sortPropertyId ?? "" : ""} onChange={(e) => setValues((v) => ({ ...v, sort: e.target.value ? "property" : "manual", sortPropertyId: e.target.value }))}><option value="">Use task sort</option>{properties.items.filter((p) => ["number", "date", "select"].includes(p.type)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField>{values.sort === "property" && <SelectField label="Property sort direction" value={values.sortDirection ?? "asc"} onChange={(e) => set("sortDirection", e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></SelectField>}</>}
    {selectedProject && <FilterGroup title="Custom properties">{properties.items.map((p) => <PropertyFilter key={p.id} property={p} filter={propertyFilters.find((f) => f.definitionId === p.id)} change={(value) => setProperty(p.id, value)} />)}<LoadMore query={properties} /></FilterGroup>}
  </FieldGroup><QueryError error={projects.error ?? sections.error ?? statuses.error ?? labels.error ?? properties.error} retry={() => { void projects.refetch(); if (selectedProject) { void sections.refetch(); void statuses.refetch(); void labels.refetch(); void properties.refetch(); } }} />{error && <p role="alert" className="whitespace-pre-wrap text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => { setValues({}); setError(""); }}>Reset filters</Button><Button>Apply filters</Button></DialogFooter></form></DialogContent></Dialog>;
}
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) { return <FieldSet><FieldLegend>{title}</FieldLegend><div className="flex flex-wrap gap-4">{children}</div></FieldSet>; }
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
