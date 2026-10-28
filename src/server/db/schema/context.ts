import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { actorKind, eventTime, mutableColumns, positiveRevision } from "./common";
import { agentCredentials } from "./identity";
import { projects, sections, tasks } from "./work";

export const notes = pgTable("notes", {
  ...mutableColumns(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  projectId: uuid("project_id"), sectionId: uuid("section_id"), taskId: uuid("task_id"),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(), plainText: text("plain_text").default("").notNull(),
}, (t) => [
  unique("notes_owner_id").on(t.ownerId, t.id),
  check("notes_one_target", sql`num_nonnulls(${t.projectId}, ${t.sectionId}, ${t.taskId}) = 1`),
  uniqueIndex("notes_project_target").on(t.projectId).where(sql`${t.projectId} IS NOT NULL`),
  uniqueIndex("notes_section_target").on(t.sectionId).where(sql`${t.sectionId} IS NOT NULL`),
  uniqueIndex("notes_task_target").on(t.taskId).where(sql`${t.taskId} IS NOT NULL`),
  foreignKey({ name: "notes_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "notes_section", columns: [t.ownerId, t.sectionId], foreignColumns: [sections.ownerId, sections.id] }).onDelete("cascade"),
  foreignKey({ name: "notes_task", columns: [t.ownerId, t.taskId], foreignColumns: [tasks.ownerId, tasks.id] }).onDelete("cascade"),
  positiveRevision("notes", t.revision), index("notes_search").using("gin", sql`to_tsvector('simple', ${t.plainText})`),
]);

export const noteRevisions = pgTable("note_revisions", {
  id: uuid("id").defaultRandom().primaryKey(), ownerId: text("owner_id").notNull(), noteId: uuid("note_id").notNull(),
  revision: integer("revision").notNull(), content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  actorKind: actorKind("actor_kind").notNull(), actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  actorCredentialId: uuid("actor_credential_id"), savedAt: eventTime("saved_at").defaultNow().notNull(),
}, (t) => [
  unique("note_revisions_note_revision").on(t.noteId, t.revision), positiveRevision("note_revisions", t.revision),
  foreignKey({ name: "note_revisions_note", columns: [t.ownerId, t.noteId], foreignColumns: [notes.ownerId, notes.id] }).onDelete("cascade"),
  foreignKey({ name: "note_revisions_credential", columns: [t.ownerId, t.actorCredentialId], foreignColumns: [agentCredentials.ownerId, agentCredentials.id] }),
  check("note_revisions_actor", sql`(${t.actorKind} = 'agent' AND ${t.actorCredentialId} IS NOT NULL) OR (${t.actorKind} = 'human' AND ${t.actorUserId} = ${t.ownerId} AND ${t.actorUserId} IS NOT NULL AND ${t.actorCredentialId} IS NULL) OR (${t.actorKind} = 'system' AND ${t.actorCredentialId} IS NULL)`),
]);

export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(), ownerId: text("owner_id").notNull(), projectId: uuid("project_id").notNull(),
  // Logical target IDs survive section/task deletion; services validate them on insert.
  sectionId: uuid("section_id"), taskId: uuid("task_id"), actorKind: actorKind("actor_kind").notNull(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }), actorCredentialId: uuid("actor_credential_id"),
  action: text("action").notNull(), changedFields: jsonb("changed_fields").$type<Record<string, unknown>>().notNull(),
  requestId: text("request_id").notNull(), createdAt: eventTime("created_at").defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: "activities_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "activities_credential", columns: [t.ownerId, t.actorCredentialId], foreignColumns: [agentCredentials.ownerId, agentCredentials.id] }),
  check("activities_actor", sql`(${t.actorKind} = 'agent' AND ${t.actorCredentialId} IS NOT NULL) OR (${t.actorKind} = 'human' AND ${t.actorUserId} = ${t.ownerId} AND ${t.actorUserId} IS NOT NULL AND ${t.actorCredentialId} IS NULL) OR (${t.actorKind} = 'system' AND ${t.actorCredentialId} IS NULL)`),
  index("activities_project_time").on(t.projectId, t.createdAt, t.id), index("activities_task_time").on(t.taskId, t.createdAt, t.id),
  index("activities_section_time").on(t.sectionId, t.createdAt, t.id), index("activities_credential").on(t.actorCredentialId),
]);
