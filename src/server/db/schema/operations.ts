import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { actorKind, eventTime, mutableColumns, positiveRevision } from "./common";
import { agentCredentials } from "./identity";

export const jobState = pgEnum("job_state", ["pending", "running", "succeeded", "failed"]);
export const exportState = pgEnum("export_state", ["pending", "running", "ready", "failed", "expired"]);
export const backgroundJobs = pgTable("background_jobs", {
  ...mutableColumns(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(), deduplicationKey: text("deduplication_key").notNull().unique(),
  // Payload holds immutable external object keys/IDs, never a cascading domain FK.
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(), state: jobState("state").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(), maxAttempts: integer("max_attempts").default(10).notNull(),
  availableAt: eventTime("available_at").defaultNow().notNull(), leaseExpiresAt: eventTime("lease_expires_at"),
  leaseToken: uuid("lease_token"), lastError: text("last_error"), completedAt: eventTime("completed_at"),
}, (t) => [
  check("background_jobs_attempts", sql`${t.attempts} >= 0 AND ${t.maxAttempts} > 0`),
  check("background_jobs_lease", sql`(${t.state} = 'running' AND ${t.leaseToken} IS NOT NULL AND ${t.leaseExpiresAt} IS NOT NULL) OR (${t.state} <> 'running' AND ${t.leaseToken} IS NULL AND ${t.leaseExpiresAt} IS NULL)`),
  positiveRevision("background_jobs", t.revision), index("background_jobs_claim").on(t.state, t.availableAt),
  index("background_jobs_expired_lease").on(t.state, t.leaseExpiresAt), index("background_jobs_owner").on(t.ownerId),
]);

export const exports = pgTable("exports", {
  ...mutableColumns(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  status: exportState("status").default("pending").notNull(), outputObjectKey: text("output_object_key").unique(),
  requestedAt: eventTime("requested_at").defaultNow().notNull(), completedAt: eventTime("completed_at"),
  expiresAt: eventTime("expires_at").notNull().default(sql`now() + interval '24 hours'`), failureSummary: text("failure_summary"),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
}, (t) => [
  check("exports_ready_output", sql`${t.status} <> 'ready' OR (${t.outputObjectKey} IS NOT NULL AND ${t.completedAt} IS NOT NULL)`),
  positiveRevision("exports", t.revision), index("exports_owner_requested").on(t.ownerId, t.requestedAt), index("exports_expiry").on(t.expiresAt),
]);

export const idempotencyRecords = pgTable("idempotency_records", {
  id: uuid("id").defaultRandom().primaryKey(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  actorKind: actorKind("actor_kind").notNull(), actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
  actorCredentialId: uuid("actor_credential_id"), actorIdentity: text("actor_identity").notNull(),
  operation: text("operation").notNull(), key: text("key").notNull(), requestFingerprint: text("request_fingerprint").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(), createdAt: eventTime("created_at").defaultNow().notNull(),
  expiresAt: eventTime("expires_at").default(sql`now() + interval '24 hours'`).notNull(),
}, (t) => [
  unique("idempotency_records_actor_operation_key").on(t.ownerId, t.actorKind, t.actorIdentity, t.operation, t.key),
  foreignKey({ name: "idempotency_records_credential", columns: [t.ownerId, t.actorCredentialId], foreignColumns: [agentCredentials.ownerId, agentCredentials.id] }),
  check("idempotency_records_actor", sql`(${t.actorKind} = 'human' AND ${t.actorUserId} IS NOT NULL AND ${t.actorUserId} = ${t.ownerId} AND ${t.actorIdentity} = ${t.actorUserId} AND ${t.actorCredentialId} IS NULL) OR (${t.actorKind} = 'agent' AND ${t.actorCredentialId} IS NOT NULL AND ${t.actorIdentity} = ${t.actorCredentialId}::text) OR (${t.actorKind} = 'system' AND ${t.actorIdentity} <> '' AND ${t.actorCredentialId} IS NULL)`),
  index("idempotency_records_expiry").on(t.expiresAt),
]);
