import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, date, foreignKey, index, integer, numeric, pgEnum,
  pgTable, primaryKey, text, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { eventTime, mutableColumns, positiveRevision } from "./common";

export const sectionLifecycle = pgEnum("section_lifecycle", ["planned", "active", "completed"]);
export const statusCategory = pgEnum("status_category", ["backlog", "ready", "in_progress", "in_review", "done", "canceled"]);
export const taskPriority = pgEnum("task_priority", ["none", "low", "medium", "high", "urgent"]);
export const propertyType = pgEnum("property_type", ["text", "number", "date", "checkbox", "select", "multi_select", "url"]);
const owner = () => text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" });
const position = () => bigint("position", { mode: "bigint" }).default(sql`1024`).notNull();

export const projects = pgTable("projects", {
  ...mutableColumns(), ownerId: owner(), name: text("name").notNull(), prefix: text("prefix").notNull(),
  description: text("description").default("").notNull(), nextTaskNumber: integer("next_task_number").default(1).notNull(),
  archivedAt: eventTime("archived_at"),
}, (t) => [
  unique("projects_owner_id").on(t.ownerId, t.id), unique("projects_owner_prefix").on(t.ownerId, t.prefix),
  check("projects_prefix_format", sql`${t.prefix} ~ '^[A-Z][A-Z0-9]{1,9}$'`),
  check("projects_counter_positive", sql`${t.nextTaskNumber} > 0`), positiveRevision("projects", t.revision),
  index("projects_owner_archive").on(t.ownerId, t.archivedAt),
  index("projects_search").using("gin", sql`to_tsvector('simple', ${t.name} || ' ' || ${t.description})`),
]);

export const sections = pgTable("sections", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(),
  parentSectionId: uuid("parent_section_id"),
  name: text("name").notNull(), description: text("description").default("").notNull(),
  lifecycle: sectionLifecycle("lifecycle").default("planned").notNull(), targetDate: date("target_date"),
  position: position(), archivedAt: eventTime("archived_at"),
}, (t) => [
  unique("sections_owner_id").on(t.ownerId, t.id), unique("sections_scope_id").on(t.ownerId, t.projectId, t.id),
  foreignKey({ name: "sections_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "sections_parent_scope", columns: [t.ownerId, t.projectId, t.parentSectionId], foreignColumns: [t.ownerId, t.projectId, t.id] }).onDelete("cascade"),
  check("sections_not_self", sql`${t.parentSectionId} IS DISTINCT FROM ${t.id}`), positiveRevision("sections", t.revision),
  index("sections_parent_position").on(t.projectId, t.parentSectionId, t.position),
  index("sections_search").using("gin", sql`to_tsvector('simple', ${t.name} || ' ' || ${t.description})`),
]);

export const taskStatuses = pgTable("task_statuses", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(), name: text("name").notNull(),
  category: statusCategory("category").notNull(), position: position(), isDefault: boolean("is_default").default(false).notNull(),
}, (t) => [
  unique("task_statuses_scope_id").on(t.ownerId, t.projectId, t.id),
  unique("task_statuses_scope_category").on(t.ownerId, t.projectId, t.id, t.category),
  foreignKey({ name: "task_statuses_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  uniqueIndex("task_statuses_one_default").on(t.projectId).where(sql`${t.isDefault}`),
  check("task_statuses_default_backlog", sql`NOT ${t.isDefault} OR ${t.category} = 'backlog'`),
  positiveRevision("task_statuses", t.revision), index("task_statuses_category").on(t.projectId, t.category, t.position),
]);

export const tasks = pgTable("tasks", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(), sectionId: uuid("section_id"),
  parentTaskId: uuid("parent_task_id"),
  number: integer("number").notNull(), title: text("title").notNull(), description: text("description").default("").notNull(),
  statusId: uuid("status_id").notNull(), priority: taskPriority("priority").default("none").notNull(), dueDate: date("due_date"),
  manualBlockedReason: text("manual_blocked_reason"), position: position(), archivedAt: eventTime("archived_at"),
}, (t) => [
  unique("tasks_owner_id").on(t.ownerId, t.id), unique("tasks_scope_id").on(t.ownerId, t.projectId, t.id),
  unique("tasks_project_number").on(t.projectId, t.number),
  foreignKey({ name: "tasks_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "tasks_section", columns: [t.ownerId, t.projectId, t.sectionId], foreignColumns: [sections.ownerId, sections.projectId, sections.id] }).onDelete("cascade"),
  foreignKey({ name: "tasks_parent_scope", columns: [t.ownerId, t.projectId, t.parentTaskId], foreignColumns: [t.ownerId, t.projectId, t.id] }).onDelete("cascade"),
  foreignKey({ name: "tasks_status", columns: [t.ownerId, t.projectId, t.statusId], foreignColumns: [taskStatuses.ownerId, taskStatuses.projectId, taskStatuses.id] }),
  check("tasks_number_positive", sql`${t.number} > 0`), check("tasks_not_self", sql`${t.parentTaskId} IS DISTINCT FROM ${t.id}`),
  positiveRevision("tasks", t.revision), index("tasks_location_position").on(t.projectId, t.sectionId, t.parentTaskId, t.position),
  index("tasks_parent_position").on(t.parentTaskId, t.position), index("tasks_status").on(t.projectId, t.statusId),
  index("tasks_due_date").on(t.ownerId, t.dueDate), index("tasks_updated").on(t.ownerId, t.updatedAt, t.id),
  index("tasks_search").using("gin", sql`to_tsvector('simple', ${t.title} || ' ' || ${t.description})`),
]);

export const labels = pgTable("labels", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(),
  name: text("name").notNull(), normalizedName: text("normalized_name").notNull(), color: text("color").notNull(),
}, (t) => [
  unique("labels_scope_id").on(t.ownerId, t.projectId, t.id), unique("labels_project_name").on(t.projectId, t.normalizedName),
  check("labels_normalized_nonblank", sql`length(btrim(${t.normalizedName})) > 0`),
  foreignKey({ name: "labels_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  positiveRevision("labels", t.revision),
]);

export const taskLabels = pgTable("task_labels", {
  ownerId: owner(), projectId: uuid("project_id").notNull(), taskId: uuid("task_id").notNull(), labelId: uuid("label_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.labelId] }),
  foreignKey({ name: "task_labels_task", columns: [t.ownerId, t.projectId, t.taskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "task_labels_label", columns: [t.ownerId, t.projectId, t.labelId], foreignColumns: [labels.ownerId, labels.projectId, labels.id] }).onDelete("cascade"),
  index("task_labels_reverse").on(t.labelId, t.taskId),
]);

export const taskDependencies = pgTable("task_dependencies", {
  ownerId: owner(), projectId: uuid("project_id").notNull(), taskId: uuid("task_id").notNull(), prerequisiteTaskId: uuid("prerequisite_task_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.prerequisiteTaskId] }), check("task_dependencies_not_self", sql`${t.taskId} <> ${t.prerequisiteTaskId}`),
  foreignKey({ name: "task_dependencies_task", columns: [t.ownerId, t.projectId, t.taskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "task_dependencies_prerequisite", columns: [t.ownerId, t.projectId, t.prerequisiteTaskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }),
  index("task_dependencies_reverse").on(t.prerequisiteTaskId, t.taskId),
]);

export const propertyDefinitions = pgTable("property_definitions", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(), name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(), type: propertyType("type").notNull(), position: position(),
}, (t) => [
  unique("property_definitions_scope_id").on(t.ownerId, t.projectId, t.id),
  unique("property_definitions_project_name").on(t.projectId, t.normalizedName),
  check("property_definitions_name_nonblank", sql`length(btrim(${t.normalizedName})) > 0`),
  foreignKey({ name: "property_definitions_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  positiveRevision("property_definitions", t.revision), index("property_definitions_order").on(t.projectId, t.position),
]);

export const propertyOptions = pgTable("property_options", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(), definitionId: uuid("definition_id").notNull(),
  name: text("name").notNull(), normalizedName: text("normalized_name").notNull(), position: position(),
}, (t) => [
  unique("property_options_scope_id").on(t.ownerId, t.projectId, t.definitionId, t.id),
  unique("property_options_definition_name").on(t.definitionId, t.normalizedName),
  check("property_options_name_nonblank", sql`length(btrim(${t.normalizedName})) > 0`),
  foreignKey({ name: "property_options_definition", columns: [t.ownerId, t.projectId, t.definitionId], foreignColumns: [propertyDefinitions.ownerId, propertyDefinitions.projectId, propertyDefinitions.id] }).onDelete("cascade"),
  positiveRevision("property_options", t.revision), index("property_options_order").on(t.definitionId, t.position),
]);

export const taskPropertyValues = pgTable("task_property_values", {
  ownerId: owner(), projectId: uuid("project_id").notNull(), taskId: uuid("task_id").notNull(), definitionId: uuid("definition_id").notNull(),
  valueText: text("value_text"), valueNumber: numeric("value_number"), valueDate: date("value_date"), valueBool: boolean("value_bool"), optionId: uuid("option_id"),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.definitionId] }),
  check("task_property_values_one_value", sql`num_nonnulls(${t.valueText}, ${t.valueNumber}, ${t.valueDate}, ${t.valueBool}, ${t.optionId}) = 1`),
  foreignKey({ name: "task_property_values_task", columns: [t.ownerId, t.projectId, t.taskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "task_property_values_definition", columns: [t.ownerId, t.projectId, t.definitionId], foreignColumns: [propertyDefinitions.ownerId, propertyDefinitions.projectId, propertyDefinitions.id] }).onDelete("cascade"),
  foreignKey({ name: "task_property_values_option", columns: [t.ownerId, t.projectId, t.definitionId, t.optionId], foreignColumns: [propertyOptions.ownerId, propertyOptions.projectId, propertyOptions.definitionId, propertyOptions.id] }).onDelete("cascade"),
  index("task_property_values_number").on(t.definitionId, t.valueNumber), index("task_property_values_date").on(t.definitionId, t.valueDate),
  index("task_property_values_option").on(t.definitionId, t.optionId),
  index("task_property_values_search").using("gin", sql`to_tsvector('simple', coalesce(${t.valueText}, ''))`),
]);

export const taskPropertyOptionValues = pgTable("task_property_option_values", {
  ownerId: owner(), projectId: uuid("project_id").notNull(), taskId: uuid("task_id").notNull(), definitionId: uuid("definition_id").notNull(), optionId: uuid("option_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.optionId] }),
  foreignKey({ name: "task_property_option_values_task", columns: [t.ownerId, t.projectId, t.taskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "task_property_option_values_option", columns: [t.ownerId, t.projectId, t.definitionId, t.optionId], foreignColumns: [propertyOptions.ownerId, propertyOptions.projectId, propertyOptions.definitionId, propertyOptions.id] }).onDelete("cascade"),
  index("task_property_option_values_filter").on(t.definitionId, t.optionId),
]);
