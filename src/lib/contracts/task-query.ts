import { z } from "zod";
import { categories, priorities, calendarDate } from "./work";
const ids = z.array(z.uuid()).max(100);
const bool = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
export const propertyFilter = z.discriminatedUnion("op", [
  z.strictObject({ definitionId: z.uuid(), op: z.enum(["empty", "not_empty"]) }),
  z.strictObject({ definitionId: z.uuid(), op: z.literal("contains"), value: z.string().min(1).max(2000) }),
  z.strictObject({ definitionId: z.uuid(), op: z.literal("options"), value: ids.min(1) }),
  z.strictObject({ definitionId: z.uuid(), op: z.literal("checked"), value: z.boolean() }),
  z.strictObject({ definitionId: z.uuid(), op: z.literal("number_range"), min: z.number().finite().optional(), max: z.number().finite().optional() }).refine((v) => (v.min !== undefined || v.max !== undefined) && !(v.min !== undefined && v.max !== undefined && v.min > v.max)),
  z.strictObject({ definitionId: z.uuid(), op: z.literal("date_range"), min: calendarDate.optional(), max: calendarDate.optional() }).refine((v) => Boolean(v.min || v.max) && !(v.min && v.max && v.min > v.max)),
]);
export const taskQuerySchema = z.strictObject({
  projectId: z.uuid().optional(), projectIds: ids.default([]), sectionId: z.uuid().optional(), sectionIds: ids.default([]), parentTaskId: z.uuid().optional(),
  includeDescendants: bool.default(false), includeArchived: bool.default(false), archiveState: z.enum(["active", "archived", "all"]).optional(),
  cursor: z.union([z.uuid(), z.string().regex(/^(project|section|task):[0-9a-f-]{36}$/i)]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), q: z.string().trim().max(240).default(""),
  categories: z.array(z.enum(categories)).max(6).default([]), statusIds: ids.default([]), labelIds: ids.default([]), priorities: z.array(z.enum(priorities)).max(5).default([]),
  dueFrom: calendarDate.optional(), dueTo: calendarDate.optional(), overdue: bool.optional(), blocked: bool.optional(), readyOnly: bool.default(false),
  taskType: z.enum(["all", "parent", "subtask", "standalone"]).default("all"), linkedGithub: z.enum(["any", "none", "issue", "pr"]).optional(),
  propertyFilters: z.array(propertyFilter).max(30).default([]), sort: z.enum(["manual", "updated", "due_date", "priority", "property"]).default("manual"), sortPropertyId: z.uuid().optional(), sortDirection: z.enum(["asc", "desc"]).default("asc"),
  excludeSubtasks: bool.default(false), entityTypes: z.array(z.enum(["project", "section", "task"])).min(1).max(3).default(["project", "section", "task"]),
}).superRefine((v, ctx) => {
  if ((v.propertyFilters.length || v.sort === "property") && !v.projectId) ctx.addIssue({ code: "custom", path: ["projectId"], message: "Choose one project for property filters or sorting." });
  if (v.sort === "property" && !v.sortPropertyId) ctx.addIssue({ code: "custom", path: ["sortPropertyId"], message: "Choose a property to sort by." });
  if (v.dueFrom && v.dueTo && v.dueFrom > v.dueTo) ctx.addIssue({ code: "custom", path: ["dueTo"], message: "The end date must follow the start date." });
});
export type TaskQuery = z.infer<typeof taskQuerySchema>;
export function decodeTaskQuery(raw: Record<string, unknown>) {
  const value = { ...raw };
  for (const key of ["projectIds", "sectionIds", "categories", "statusIds", "labelIds", "priorities", "entityTypes"]) if (typeof value[key] === "string") value[key] = (value[key] as string).split(",").filter(Boolean);
  if (typeof value.propertyFilters === "string") { try { value.propertyFilters = JSON.parse(value.propertyFilters); } catch { throw new z.ZodError([{ code: "custom", path: ["propertyFilters"], message: "Invalid property filters." }]); } }
  return taskQuerySchema.parse(value);
}
