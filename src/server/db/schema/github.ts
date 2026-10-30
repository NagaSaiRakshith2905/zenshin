import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.generated";
import { eventTime, mutableColumns, positiveRevision } from "./common";
import { projects, statusCategory, tasks, taskStatuses } from "./work";

export const githubItemType = pgEnum("github_item_type", ["issue", "pr"]);
export const githubRuleKind = pgEnum("github_rule_kind", ["pr_open", "all_prs_merged"]);
const owner = () => text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" });
const externalId = (name: string) => bigint(name, { mode: "bigint" });

export const githubInstallations = pgTable("github_installations", {
  ...mutableColumns(), ownerId: owner(), installationId: externalId("installation_id").notNull().unique(),
  requestLeaseToken: uuid("request_lease_token"), requestLeaseExpiresAt: eventTime("request_lease_expires_at"), nextRequestAt: eventTime("next_request_at").defaultNow().notNull(),
  accountId: externalId("account_id").notNull(), accountName: text("account_name").notNull(), status: text("status").default("active").notNull(),
}, (t) => [
  unique("github_installations_scope_id").on(t.ownerId, t.id),
  check("github_installations_status", sql`${t.status} IN ('active', 'suspended', 'removed', 'unavailable')`),
  positiveRevision("github_installations", t.revision),
]);

export const githubRepositories = pgTable("github_repositories", {
  ...mutableColumns(), ownerId: owner(), installationId: uuid("installation_id").notNull(), githubRepositoryId: externalId("github_repository_id").notNull().unique(),
  name: text("name").notNull(), ownerName: text("owner_name").notNull(), defaultBranch: text("default_branch"), availability: text("availability").default("available").notNull(),
}, (t) => [
  unique("github_repositories_scope_id").on(t.ownerId, t.id),
  foreignKey({ name: "github_repositories_installation", columns: [t.ownerId, t.installationId], foreignColumns: [githubInstallations.ownerId, githubInstallations.id] }),
  check("github_repositories_availability", sql`${t.availability} IN ('available', 'unavailable', 'removed')`),
  positiveRevision("github_repositories", t.revision), index("github_repositories_installation_lookup").on(t.installationId),
]);

export const projectRepositories = pgTable("project_repositories", {
  ownerId: owner(), projectId: uuid("project_id").notNull(), repositoryId: uuid("repository_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.repositoryId] }), unique("project_repositories_scope").on(t.ownerId, t.projectId, t.repositoryId),
  foreignKey({ name: "project_repositories_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "project_repositories_repository", columns: [t.ownerId, t.repositoryId], foreignColumns: [githubRepositories.ownerId, githubRepositories.id] }),
  index("project_repositories_reverse").on(t.repositoryId, t.projectId),
]);

export const githubItems = pgTable("github_items", {
  ...mutableColumns(), ownerId: owner(), repositoryId: uuid("repository_id").notNull(), githubItemId: externalId("github_item_id").notNull(),
  type: githubItemType("type").notNull(), number: integer("number").notNull(), url: text("url").notNull(),
  title: text("title").notNull(), state: text("state").notNull(), isDraft: boolean("is_draft").default(false).notNull(),
  isMerged: boolean("is_merged").default(false).notNull(), headSha: text("head_sha"),
  remoteCreatedAt: eventTime("remote_created_at").notNull(), remoteUpdatedAt: eventTime("remote_updated_at").notNull(),
  openedAt: eventTime("opened_at"), readyAt: eventTime("ready_at"), mergedAt: eventTime("merged_at"), syncedAt: eventTime("synced_at"),
  availability: text("availability").default("available").notNull(),
}, (t) => [
  unique("github_items_owner_id").on(t.ownerId, t.id), unique("github_items_repository_id").on(t.ownerId, t.repositoryId, t.id),
  unique("github_items_external_id").on(t.type, t.githubItemId), unique("github_items_repository_number").on(t.repositoryId, t.number),
  foreignKey({ name: "github_items_repository", columns: [t.ownerId, t.repositoryId], foreignColumns: [githubRepositories.ownerId, githubRepositories.id] }),
  check("github_items_number_positive", sql`${t.number} > 0`), check("github_items_state", sql`${t.state} IN ('open', 'closed')`),
  check("github_items_availability", sql`${t.availability} IN ('available', 'unavailable', 'deleted')`), positiveRevision("github_items", t.revision),
  index("github_items_synced").on(t.syncedAt),
]);

export const taskGithubLinks = pgTable("task_github_links", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(), taskId: uuid("task_id").notNull(),
  repositoryId: uuid("repository_id").notNull(), githubItemId: uuid("github_item_id").notNull(), origin: text("origin").notNull(),
}, (t) => [
  unique("task_github_links_task_item").on(t.taskId, t.githubItemId),
  foreignKey({ name: "task_github_links_task", columns: [t.ownerId, t.projectId, t.taskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "task_github_links_item", columns: [t.ownerId, t.repositoryId, t.githubItemId], foreignColumns: [githubItems.ownerId, githubItems.repositoryId, githubItems.id] }),
  check("task_github_links_origin", sql`${t.origin} IN ('manual', 'import')`), positiveRevision("task_github_links", t.revision),
  index("task_github_links_item_lookup").on(t.githubItemId, t.taskId),
]);

export const githubIssueImports = pgTable("github_issue_imports", {
  id: uuid("id").defaultRandom().primaryKey(), ownerId: owner(), projectId: uuid("project_id").notNull(),
  githubItemId: uuid("github_item_id").notNull(), taskId: uuid("task_id").notNull(), importedAt: eventTime("imported_at").defaultNow().notNull(),
}, (t) => [
  unique("github_issue_imports_project_item").on(t.projectId, t.githubItemId),
  foreignKey({ name: "github_issue_imports_task", columns: [t.ownerId, t.projectId, t.taskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "github_issue_imports_item", columns: [t.ownerId, t.githubItemId], foreignColumns: [githubItems.ownerId, githubItems.id] }),
  index("github_issue_imports_task_lookup").on(t.taskId),
]);

export const githubCheckSummaries = pgTable("github_check_summaries", {
  ...mutableColumns(), ownerId: owner(), repositoryId: uuid("repository_id").notNull(), headSha: text("head_sha").notNull(),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull(), remoteUpdatedAt: eventTime("remote_updated_at"), syncedAt: eventTime("synced_at").notNull(),
}, (t) => [
  unique("github_check_summaries_repository_sha").on(t.repositoryId, t.headSha),
  foreignKey({ name: "github_check_summaries_repository", columns: [t.ownerId, t.repositoryId], foreignColumns: [githubRepositories.ownerId, githubRepositories.id] }).onDelete("cascade"),
  positiveRevision("github_check_summaries", t.revision),
]);

export const projectGithubRules = pgTable("project_github_rules", {
  ...mutableColumns(), ownerId: owner(), projectId: uuid("project_id").notNull(), ruleKind: githubRuleKind("rule_kind").notNull(),
  enabled: boolean("enabled").default(false).notNull(), targetStatusId: uuid("target_status_id").notNull(),
  targetCategory: statusCategory("target_category").notNull(), enabledAt: eventTime("enabled_at"),
}, (t) => [
  unique("project_github_rules_scope_id").on(t.ownerId, t.projectId, t.id), unique("project_github_rules_project_kind").on(t.projectId, t.ruleKind),
  foreignKey({ name: "project_github_rules_project", columns: [t.ownerId, t.projectId], foreignColumns: [projects.ownerId, projects.id] }).onDelete("cascade"),
  foreignKey({ name: "project_github_rules_status", columns: [t.ownerId, t.projectId, t.targetStatusId, t.targetCategory], foreignColumns: [taskStatuses.ownerId, taskStatuses.projectId, taskStatuses.id, taskStatuses.category] }),
  check("project_github_rules_target", sql`(${t.ruleKind} = 'pr_open' AND ${t.targetCategory} = 'in_progress') OR (${t.ruleKind} = 'all_prs_merged' AND ${t.targetCategory} = 'in_review')`),
  check("project_github_rules_enabled_at", sql`NOT ${t.enabled} OR ${t.enabledAt} IS NOT NULL`), positiveRevision("project_github_rules", t.revision),
]);

export const githubAutomationEvaluations = pgTable("github_automation_evaluations", {
  id: uuid("id").defaultRandom().primaryKey(), ownerId: owner(), projectId: uuid("project_id").notNull(), taskId: uuid("task_id").notNull(), ruleId: uuid("rule_id").notNull(),
  eventFingerprint: text("event_fingerprint").notNull(), baselineRemoteStates: jsonb("baseline_remote_states").$type<Record<string, unknown>>().notNull(),
  outcome: text("outcome").notNull(), resultingTaskRevision: integer("resulting_task_revision").notNull(), evaluatedAt: eventTime("evaluated_at").defaultNow().notNull(),
}, (t) => [
  unique("github_automation_evaluations_event").on(t.taskId, t.ruleId, t.eventFingerprint),
  foreignKey({ name: "github_automation_evaluations_task", columns: [t.ownerId, t.projectId, t.taskId], foreignColumns: [tasks.ownerId, tasks.projectId, tasks.id] }).onDelete("cascade"),
  foreignKey({ name: "github_automation_evaluations_rule", columns: [t.ownerId, t.projectId, t.ruleId], foreignColumns: [projectGithubRules.ownerId, projectGithubRules.projectId, projectGithubRules.id] }).onDelete("cascade"),
  check("github_automation_evaluations_revision", sql`${t.resultingTaskRevision} > 0`),
  check("github_automation_evaluations_outcome", sql`${t.outcome} IN ('baseline', 'transitioned', 'no_op')`), index("github_automation_evaluations_rule_lookup").on(t.ruleId),
]);

export const githubSyncState = pgTable("github_sync_state", {
  ...mutableColumns(), ownerId: owner(), repositoryId: uuid("repository_id").notNull(), resource: text("resource").notNull(),
  etag: text("etag"), lastModified: text("last_modified"), lastSuccessAt: eventTime("last_success_at"),
  nextAttemptAt: eventTime("next_attempt_at").defaultNow().notNull(), attempts: integer("attempts").default(0).notNull(), lastError: text("last_error"),
}, (t) => [
  unique("github_sync_state_resource").on(t.repositoryId, t.resource),
  foreignKey({ name: "github_sync_state_repository", columns: [t.ownerId, t.repositoryId], foreignColumns: [githubRepositories.ownerId, githubRepositories.id] }).onDelete("cascade"),
  check("github_sync_state_attempts", sql`${t.attempts} >= 0`), positiveRevision("github_sync_state", t.revision), index("github_sync_state_next_attempt").on(t.nextAttemptAt),
]);

export const githubWebhookDeliveries = pgTable("github_webhook_deliveries", {
  ...mutableColumns(), ownerId: owner(), deliveryId: text("delivery_id").notNull().unique(), eventType: text("event_type").notNull(),
  state: text("state").default("pending").notNull(), receivedAt: eventTime("received_at").defaultNow().notNull(), processedAt: eventTime("processed_at"), lastError: text("last_error"),
}, (t) => [
  check("github_webhook_deliveries_state", sql`${t.state} IN ('pending', 'processed', 'failed')`),
  positiveRevision("github_webhook_deliveries", t.revision), index("github_webhook_deliveries_pending").on(t.state, t.receivedAt),
]);
