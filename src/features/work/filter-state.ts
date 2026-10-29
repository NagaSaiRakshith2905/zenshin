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
