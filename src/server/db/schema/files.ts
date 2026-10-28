import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { actorKind, eventTime, mutableColumns, positiveRevision } from "./common";
import { agentCredentials } from "./identity";
import { projects, sections, tasks } from "./work";

export const attachmentState = pgEnum("attachment_state", ["pending", "verifying", "ready", "failed"]);
export const attachments = pgTable("attachments", {
  ...mutableColumns(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  projectId: uuid("project_id"), sectionId: uuid("section_id"), taskId: uuid("task_id"), originalName: text("original_name").notNull(),
  declaredMediaType: text("declared_media_type").notNull(), declaredSize: bigint("declared_size", { mode: "number" }).notNull(),
  detectedMediaType: text("detected_media_type"), actualSize: bigint("actual_size", { mode: "number" }),
  objectKey: text("object_key").notNull().unique(), state: attachmentState("state").default("pending").notNull(),
  uploadExpiresAt: eventTime("upload_expires_at").notNull(), verifiedAt: eventTime("verified_at"), failureSummary: text("failure_summary"),
  actorKind: actorKind("actor_kind").notNull(), actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }), actorCredentialId: uuid("actor_credential_id"),
}, (t) => [
  check("attachments_one_target", sql`num_nonnulls(${t.projectId}, ${t.sectionId}, ${t.taskId}) = 1`),
  check("attachments_declared_size", sql`${t.declaredSize} BETWEEN 0 AND 20000000`),
  check("attachments_actual_size", sql`${t.actualSize} IS NULL OR ${t.actualSize} >= 0`),
  check("attachments_ready_metadata", sql`${t.state} <> 'ready' OR (${t.verifiedAt} IS NOT NULL AND ${t.detectedMediaType} IS NOT NULL AND ${t.actualSize} IS NOT NULL AND ${t.actualSize} <= 20000000)`),
  check("attachments_actor", sql`(${t.actorKind} = 'agent' AND ${t.actorCredentialId} IS NOT NULL) OR (${t.actorKind} = 'human' AND ${t.actorUserId} = ${t.ownerId} AND ${t.actorUserId} IS NOT NULL AND ${t.actorCredentialId} IS NULL) OR (${t.actorKind} = 'system' AND ${t.actorCredentialId} IS NULL)`),
  foreignKey({ name: "attachments_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "attachments_section", columns: [t.ownerId, t.sectionId], foreignColumns: [sections.ownerId, sections.id] }).onDelete("cascade"),
  foreignKey({ name: "attachments_task", columns: [t.ownerId, t.taskId], foreignColumns: [tasks.ownerId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "attachments_credential", columns: [t.ownerId, t.actorCredentialId], foreignColumns: [agentCredentials.ownerId, agentCredentials.id] }),
  positiveRevision("attachments", t.revision), index("attachments_project_state").on(t.projectId, t.state),
  index("attachments_section_state").on(t.sectionId, t.state), index("attachments_task_state").on(t.taskId, t.state),
  index("attachments_expired_uploads").on(t.state, t.uploadExpiresAt),
]);
