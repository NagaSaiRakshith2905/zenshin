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
  return target instanceof HTMLElement && Boolean(target.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog]"));
}
