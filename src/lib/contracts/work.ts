import { propertyIcons } from "./property-icons";
import { z } from "zod";
import { noteUpdate, noteAppend, noteRestore } from "./notes";

export const categories = ["backlog", "ready", "in_progress", "in_review", "done", "canceled"] as const;
export const priorities = ["none", "low", "medium", "high", "urgent"] as const;
export const propertyTypes = ["text", "number", "date", "checkbox", "select", "multi_select", "url"] as const;
export const calendarDate = z.iso.date();
export const id = z.uuid();
export const revision = z.number().int().positive();
export const name = (max: number) => z.string().trim().min(1).refine((s) => [...s].length <= max, `Use at most ${max} characters.`);
// Zod 4 applies .default() even under .optional(), so updates use the bare schemas to leave omitted fields untouched.
const descriptionText = z.string().refine((s) => [...s].length <= 2000);
export const description = descriptionText.default("");
export const normalizeName = (s: string) => s.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const choices = { reopenCompletedAncestors: z.boolean().default(false) };
const edit = { id, expectedRevision: revision };
const scope = { projectId: id };
const position = z.string().regex(/^-?\d{1,18}$/);
const taskFields = { title: name(240), description, priority: z.enum(priorities).default("none"), dueDate: calendarDate.nullable().default(null), manualBlockedReason: name(1000).nullable().default(null) };
export const commands = {
  update_note: noteUpdate, append_note: noteAppend, restore_note: noteRestore,
  create_project: z.strictObject({ name: name(120), prefix: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), description }),
  update_project: z.strictObject({ ...edit, name: name(120).optional(), description: descriptionText.optional() }),
  create_section: z.strictObject({ ...scope, name: name(120), description, parentSectionId: id.nullable().default(null), targetDate: calendarDate.nullable().default(null), lifecycle: z.enum(["planned", "active", "completed"]).default("planned"), ...choices }),
  update_section: z.strictObject({ ...edit, name: name(120).optional(), description: descriptionText.optional(), targetDate: calendarDate.nullable().optional(), lifecycle: z.enum(["planned", "active", "completed"]).optional(), ...choices }),
  move_section: z.strictObject({ ...edit, parentSectionId: id.nullable(), beforeId: id.nullable().default(null), ...choices }),
  create_task: z.strictObject({ ...scope, ...taskFields, sectionId: id.nullable().default(null), parentTaskId: id.nullable().default(null), statusId: id.optional(), ...choices }),
  update_task: z.strictObject({ ...edit, title: taskFields.title.optional(), description: descriptionText.optional(), priority: z.enum(priorities).optional(), dueDate: calendarDate.nullable().optional(), manualBlockedReason: name(1000).nullable().optional() }),
  transition_task: z.strictObject({ ...edit, statusId: id, completionAction: z.enum(["complete_all", "keep_open"]).optional(), reason: name(1000).optional(), ...choices }),
  move_task: z.strictObject({ ...edit, sectionId: id.nullable(), parentTaskId: id.nullable(), beforeId: id.nullable().default(null), ...choices }),
  set_task_labels: z.strictObject({ ...edit, labelIds: z.array(id).max(100).refine((v) => new Set(v).size === v.length) }),
  set_task_properties: z.strictObject({ ...edit, values: z.record(id, z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.array(id).max(50), z.null()])).refine((v) => Object.keys(v).length <= 30) }),
  add_dependency: z.strictObject({ ...edit, prerequisiteTaskId: id }),
  remove_dependency: z.strictObject({ ...edit, prerequisiteTaskId: id }),
  archive_item: z.strictObject({ ...edit, kind: z.enum(["project", "section", "task"]), acknowledgeDependentIds: z.array(id).max(10000).default([]) }),
  restore_item: z.strictObject({ ...edit, kind: z.enum(["project", "section", "task"]) }),
  delete_item: z.strictObject({ ...edit, kind: z.enum(["project", "section", "task"]), confirmation: z.strictObject({ name: z.string(), sectionCount: z.number().int().nonnegative(), taskCount: z.number().int().nonnegative(), fileCount: z.number().int().nonnegative() }).optional() }),
  create_status: z.strictObject({ ...scope, name: name(40), category: z.enum(categories) }),
  update_status: z.strictObject({ ...edit, name: name(40).optional(), position: position.optional(), isDefault: z.boolean().optional() }),
  delete_status: z.strictObject({ ...edit, replacementStatusId: id.optional() }),
  create_label: z.strictObject({ ...scope, name: name(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  update_label: z.strictObject({ ...edit, name: name(40).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  delete_label: z.strictObject(edit),
  create_property: z.strictObject({ ...scope, name: name(40), type: z.enum(propertyTypes), icon: z.enum(propertyIcons).nullable().optional() }),
  update_property: z.strictObject({ ...edit, name: name(40).optional(), position: position.optional(), type: z.enum(propertyTypes).optional(), icon: z.enum(propertyIcons).nullable().optional() }),
  delete_property: z.strictObject({ ...edit, confirmedAffectedTaskCount: z.number().int().nonnegative().optional() }),
  create_option: z.strictObject({ definitionId: id, name: name(40) }),
  update_option: z.strictObject({ ...edit, name: name(40).optional(), position: position.optional() }),
  delete_option: z.strictObject({ ...edit, confirmedAffectedTaskCount: z.number().int().nonnegative().optional() }),
} as const;
export type Command = keyof typeof commands;
export const mutationEnvelope = z.strictObject({ input: z.unknown(), idempotencyKey: z.string().min(1).max(200).optional() });
const queryBoolean = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
export const listInput = z.strictObject({ projectId: id.optional(), sectionId: id.optional(), parentTaskId: id.optional(), taskId: id.optional(), includeDescendants: queryBoolean.default(false), includeArchived: queryBoolean.default(false), cursor: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(50), sort: z.enum(["manual", "updated", "due_date", "priority"]).default("manual") });
export const wireValue = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_, v: unknown) => typeof v === "bigint" ? v.toString() : v)) as T;

export const errorCodes = ["unauthenticated", "forbidden", "not_found", "validation_error", "conflict", "decision_required", "dependency_cycle", "hierarchy_limit", "idempotency_conflict", "rate_limited", "internal_error"] as const;
export const domainErrorOutput = z.object({ error: z.object({ code: z.enum(errorCodes), message: z.string(), requestId: z.string(), details: z.record(z.string(), z.unknown()).optional(), fields: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })).optional() }) });
export const mutableOutput = z.object({ id, revision, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export const taskOutput = mutableOutput.extend({ projectId: id, title: z.string(), reference: z.string(), effectiveArchived: z.boolean(), overdue: z.boolean(), blocked: z.boolean(), properties: z.record(id, z.unknown()) });
export const paginationOutput = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item).max(100), nextCursor: id.nullable(), hasMore: z.boolean() });
