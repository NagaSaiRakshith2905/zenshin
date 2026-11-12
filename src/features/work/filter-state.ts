import type { Params } from "./api";
const filterKeys = ["q", "projectId", "projectIds", "sectionIds", "categories", "statusIds", "labelIds", "priorities", "dueFrom", "dueTo", "overdue", "blocked", "readyOnly", "taskType", "linkedGithub", "propertyFilters", "sort", "sortPropertyId", "sortDirection", "archiveState", "entityTypes"] as const;
export function filterValues(search: URLSearchParams): Record<string, string> { return Object.fromEntries(filterKeys.flatMap((key) => search.has(key) ? [[key, search.get(key)!]] : [])); }
export function taskParams(search: URLSearchParams, context: { projectId?: string; sectionId?: string } = {}): Params {
  return { ...filterValues(search), ...(context.projectId ? { projectId: context.projectId } : {}), ...(context.sectionId ? { sectionId: context.sectionId } : {}), includeDescendants: search.get("descendants") === "true", includeArchived: search.get("archived") === "true" };
}
export function applyFilters(search: URLSearchParams, values: Record<string, string>) {
  const next = new URLSearchParams(search);
  for (const key of filterKeys) { next.delete(key); if (values[key] !== undefined && values[key] !== "") next.set(key, values[key]); }
  return next;
}
export function splitValues(value?: string) { return value?.split(",").filter(Boolean) ?? []; }

export function clearTaskFilters(search: URLSearchParams, keepQuery = false) {
  const next = applyFilters(search, keepQuery && search.get("q") ? { q: search.get("q")! } : {});
  for (const key of ["descendants", "archived", "subtasks"]) next.delete(key);
  return next;
}
const filterNames: Record<string, string> = { projectId: "Project", projectIds: "Projects", sectionIds: "Sections", categories: "Workflow categories", statusIds: "Statuses", labelIds: "Labels", priorities: "Priorities", dueFrom: "Due from", dueTo: "Due through", overdue: "Overdue", blocked: "Blocked", readyOnly: "Ready to work", taskType: "Task type", linkedGithub: "GitHub links", propertyFilters: "Custom properties", archiveState: "Archive state", entityTypes: "Result types", descendants: "Child sections", archived: "Archived work", subtasks: "Subtasks" };
export function activeFilterLabels(search: URLSearchParams) {
  return Object.entries(filterNames).filter(([key]) => {
    const value = search.get(key);
    if (!value || value === "[]" || (key === "archiveState" && value === "active") || (key === "taskType" && value === "all")) return false;
    return !["readyOnly", "descendants", "archived", "subtasks"].includes(key) || value === "true";
  }).map(([, label]) => label);
}
