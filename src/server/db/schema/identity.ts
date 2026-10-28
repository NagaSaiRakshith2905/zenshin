import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { apikey, user } from "./auth.generated";
import { eventTime, mutableColumns, positiveRevision } from "./common";
import { projects } from "./work";

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  timezone: text("timezone").default("Asia/Kolkata").notNull(), theme: text("theme").default("system").notNull(),
  defaultTaskView: text("default_task_view").default("list").notNull(),
  createdAt: eventTime("created_at").defaultNow().notNull(), updatedAt: eventTime("updated_at").defaultNow().notNull(),
  revision: mutableColumns().revision,
}, (t) => [
  check("user_preferences_theme", sql`${t.theme} IN ('system', 'light', 'dark')`),
  check("user_preferences_view", sql`${t.defaultTaskView} IN ('list', 'board')`), positiveRevision("user_preferences", t.revision),
]);

export const agentCredentials = pgTable("agent_credentials", {
  ...mutableColumns(), apiKeyId: text("api_key_id").unique().references(() => apikey.id, { onDelete: "set null" }),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(), scopes: text("scopes").array().notNull(),
  // Non-secret history survives the plugin's automatic expired-key cleanup.
  expiresAt: eventTime("expires_at"), revokedAt: eventTime("revoked_at"), lastUsedAt: eventTime("last_used_at"),
}, (t) => [
  unique("agent_credentials_owner_id").on(t.ownerId, t.id), positiveRevision("agent_credentials", t.revision),
  check("agent_credentials_scopes", sql`${t.scopes} <@ ARRAY['read', 'write', 'upload', 'archive', 'complete']::text[] AND cardinality(${t.scopes}) > 0`),
  index("agent_credentials_owner").on(t.ownerId),
]);

export const agentProjectGrants = pgTable("agent_project_grants", {
  ownerId: text("owner_id").notNull(), credentialId: uuid("credential_id").notNull(), projectId: uuid("project_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.credentialId, t.projectId] }),
  foreignKey({ name: "agent_project_grants_credential", columns: [t.ownerId, t.credentialId], foreignColumns: [agentCredentials.ownerId, agentCredentials.id] }).onDelete("cascade"),
  foreignKey({ name: "agent_project_grants_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  index("agent_project_grants_project_lookup").on(t.projectId, t.credentialId),
]);
