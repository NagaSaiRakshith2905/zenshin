export const categoryLabels = { backlog: "Backlog", ready: "Ready", in_progress: "In progress", in_review: "In review", done: "Done", canceled: "Canceled" };
export const groupLabels = { overdue: "Overdue", in_progress: "In progress", in_review: "In review", ready: "Ready" };
export function workGroup(task: { category: string; overdue: boolean; effectiveArchived: boolean }): keyof typeof groupLabels | null {
  if (task.effectiveArchived || ["done", "canceled"].includes(task.category)) return null;
  if (task.overdue) return "overdue";
  return task.category === "in_progress" || task.category === "in_review" || task.category === "ready" ? task.category : null;
}
export function taskHref(pathname: string, search: string, id: string) {
  const params = new URLSearchParams(search); params.set("task", id);
  return `${pathname}?${params}`;
}
export function withoutTask(pathname: string, search: string) {
  const params = new URLSearchParams(search); params.delete("task");
  return `${pathname}${params.size ? `?${params}` : ""}`;
}
export function isEditing(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox],[role=combobox],[role=dialog],[role=alertdialog]"));
}
type Row = Record<string, unknown>;
/** The instant cache change for a mutation, or null when only the server can work it out. */
export function optimisticChange(sub: string | undefined, input: Row, findStatus: (id: string) => Row | undefined): ((row: Row) => Row) | null {
  switch (sub) {
    case undefined: return () => input;
    case "transition": { const status = findStatus(input.statusId as string); return () => ({ statusId: input.statusId, ...(status ? { category: status.category, statusName: status.name } : {}) }); }
    case "labels": return () => ({ labelIds: input.labelIds });
    case "properties": return (row) => ({ properties: Object.fromEntries(Object.entries({ ...row.properties as Row, ...input.values as Row }).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length))) });
    case "add-dependency": return (row) => ({ prerequisiteTaskIds: [...row.prerequisiteTaskIds as string[] ?? [], input.prerequisiteTaskId] });
    case "remove-dependency": return (row) => ({ prerequisiteTaskIds: (row.prerequisiteTaskIds as string[] ?? []).filter((id) => id !== input.prerequisiteTaskId) });
    default: return null;
  }
}
