CREATE TYPE "public"."actor_kind" AS ENUM('human', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('text', 'number', 'date', 'checkbox', 'select', 'multi_select', 'url');--> statement-breakpoint
CREATE TYPE "public"."section_lifecycle" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."status_category" AS ENUM('backlog', 'ready', 'in_progress', 'in_review', 'done', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('none', 'low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."attachment_state" AS ENUM('pending', 'verifying', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."github_item_type" AS ENUM('issue', 'pr');--> statement-breakpoint
CREATE TYPE "public"."github_rule_kind" AS ENUM('pr_open', 'all_prs_merged');--> statement-breakpoint
CREATE TYPE "public"."export_state" AS ENUM('pending', 'running', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"api_key_id" text,
	"owner_id" text NOT NULL,
	"display_name" text NOT NULL,
	"scopes" text[] NOT NULL,
	CONSTRAINT "agent_credentials_api_key_id_unique" UNIQUE("api_key_id"),
	CONSTRAINT "agent_credentials_owner_id" UNIQUE("owner_id","id"),
	CONSTRAINT "agent_credentials_revision_positive" CHECK ("agent_credentials"."revision" > 0),
	CONSTRAINT "agent_credentials_scopes" CHECK ("agent_credentials"."scopes" <@ ARRAY['read', 'write', 'upload', 'archive', 'complete']::text[] AND cardinality("agent_credentials"."scopes") > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_project_grants" (
	"owner_id" text NOT NULL,
	"credential_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "agent_project_grants_credential_id_project_id_pk" PRIMARY KEY("credential_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"default_task_view" text DEFAULT 'list' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "user_preferences_theme" CHECK ("user_preferences"."theme" IN ('system', 'light', 'dark')),
	CONSTRAINT "user_preferences_view" CHECK ("user_preferences"."default_task_view" IN ('list', 'board')),
	CONSTRAINT "user_preferences_revision_positive" CHECK ("user_preferences"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "labels_scope_id" UNIQUE("owner_id","project_id","id"),
	CONSTRAINT "labels_project_name" UNIQUE("project_id","normalized_name"),
	CONSTRAINT "labels_normalized_nonblank" CHECK (length(btrim("labels"."normalized_name")) > 0),
	CONSTRAINT "labels_revision_positive" CHECK ("labels"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"next_task_number" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "projects_owner_id" UNIQUE("owner_id","id"),
	CONSTRAINT "projects_owner_prefix" UNIQUE("owner_id","prefix"),
	CONSTRAINT "projects_prefix_format" CHECK ("projects"."prefix" ~ '^[A-Z][A-Z0-9]{1,9}$'),
	CONSTRAINT "projects_counter_positive" CHECK ("projects"."next_task_number" > 0),
	CONSTRAINT "projects_revision_positive" CHECK ("projects"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "property_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"type" "property_type" NOT NULL,
	"position" bigint DEFAULT 1024 NOT NULL,
	CONSTRAINT "property_definitions_scope_id" UNIQUE("owner_id","project_id","id"),
	CONSTRAINT "property_definitions_project_name" UNIQUE("project_id","normalized_name"),
	CONSTRAINT "property_definitions_name_nonblank" CHECK (length(btrim("property_definitions"."normalized_name")) > 0),
	CONSTRAINT "property_definitions_revision_positive" CHECK ("property_definitions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "property_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"position" bigint DEFAULT 1024 NOT NULL,
	CONSTRAINT "property_options_scope_id" UNIQUE("owner_id","project_id","definition_id","id"),
	CONSTRAINT "property_options_definition_name" UNIQUE("definition_id","normalized_name"),
	CONSTRAINT "property_options_name_nonblank" CHECK (length(btrim("property_options"."normalized_name")) > 0),
	CONSTRAINT "property_options_revision_positive" CHECK ("property_options"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_section_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"lifecycle" "section_lifecycle" DEFAULT 'planned' NOT NULL,
	"target_date" date,
	"position" bigint DEFAULT 1024 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "sections_owner_id" UNIQUE("owner_id","id"),
	CONSTRAINT "sections_scope_id" UNIQUE("owner_id","project_id","id"),
	CONSTRAINT "sections_not_self" CHECK ("sections"."parent_section_id" IS DISTINCT FROM "sections"."id"),
	CONSTRAINT "sections_revision_positive" CHECK ("sections"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"prerequisite_task_id" uuid NOT NULL,
	CONSTRAINT "task_dependencies_task_id_prerequisite_task_id_pk" PRIMARY KEY("task_id","prerequisite_task_id"),
	CONSTRAINT "task_dependencies_not_self" CHECK ("task_dependencies"."task_id" <> "task_dependencies"."prerequisite_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "task_labels_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "task_property_option_values" (
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	CONSTRAINT "task_property_option_values_task_id_option_id_pk" PRIMARY KEY("task_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "task_property_values" (
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"value_text" text,
	"value_number" numeric,
	"value_date" date,
	"value_bool" boolean,
	"option_id" uuid,
	CONSTRAINT "task_property_values_task_id_definition_id_pk" PRIMARY KEY("task_id","definition_id"),
	CONSTRAINT "task_property_values_one_value" CHECK (num_nonnulls("task_property_values"."value_text", "task_property_values"."value_number", "task_property_values"."value_date", "task_property_values"."value_bool", "task_property_values"."option_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "task_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "status_category" NOT NULL,
	"position" bigint DEFAULT 1024 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "task_statuses_scope_id" UNIQUE("owner_id","project_id","id"),
	CONSTRAINT "task_statuses_scope_category" UNIQUE("owner_id","project_id","id","category"),
	CONSTRAINT "task_statuses_default_backlog" CHECK (NOT "task_statuses"."is_default" OR "task_statuses"."category" = 'backlog'),
	CONSTRAINT "task_statuses_revision_positive" CHECK ("task_statuses"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"section_id" uuid,
	"parent_task_id" uuid,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status_id" uuid NOT NULL,
	"priority" "task_priority" DEFAULT 'none' NOT NULL,
	"due_date" date,
	"manual_blocked_reason" text,
	"position" bigint DEFAULT 1024 NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tasks_owner_id" UNIQUE("owner_id","id"),
	CONSTRAINT "tasks_scope_id" UNIQUE("owner_id","project_id","id"),
	CONSTRAINT "tasks_project_number" UNIQUE("project_id","number"),
	CONSTRAINT "tasks_number_positive" CHECK ("tasks"."number" > 0),
	CONSTRAINT "tasks_not_self" CHECK ("tasks"."parent_task_id" IS DISTINCT FROM "tasks"."id"),
	CONSTRAINT "tasks_revision_positive" CHECK ("tasks"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"section_id" uuid,
	"task_id" uuid,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" text,
	"actor_credential_id" uuid,
	"action" text NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_actor" CHECK (("activities"."actor_kind" = 'agent' AND "activities"."actor_credential_id" IS NOT NULL) OR ("activities"."actor_kind" = 'human' AND "activities"."actor_user_id" = "activities"."owner_id" AND "activities"."actor_user_id" IS NOT NULL AND "activities"."actor_credential_id" IS NULL) OR ("activities"."actor_kind" = 'system' AND "activities"."actor_credential_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "note_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"note_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" jsonb NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" text,
	"actor_credential_id" uuid,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_revisions_note_revision" UNIQUE("note_id","revision"),
	CONSTRAINT "note_revisions_revision_positive" CHECK ("note_revisions"."revision" > 0),
	CONSTRAINT "note_revisions_actor" CHECK (("note_revisions"."actor_kind" = 'agent' AND "note_revisions"."actor_credential_id" IS NOT NULL) OR ("note_revisions"."actor_kind" = 'human' AND "note_revisions"."actor_user_id" = "note_revisions"."owner_id" AND "note_revisions"."actor_user_id" IS NOT NULL AND "note_revisions"."actor_credential_id" IS NULL) OR ("note_revisions"."actor_kind" = 'system' AND "note_revisions"."actor_credential_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid,
	"section_id" uuid,
	"task_id" uuid,
	"content" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	CONSTRAINT "notes_owner_id" UNIQUE("owner_id","id"),
	CONSTRAINT "notes_one_target" CHECK (num_nonnulls("notes"."project_id", "notes"."section_id", "notes"."task_id") = 1),
	CONSTRAINT "notes_revision_positive" CHECK ("notes"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid,
	"section_id" uuid,
	"task_id" uuid,
	"original_name" text NOT NULL,
	"declared_media_type" text NOT NULL,
	"declared_size" bigint NOT NULL,
	"detected_media_type" text,
	"actual_size" bigint,
	"object_key" text NOT NULL,
	"state" "attachment_state" DEFAULT 'pending' NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"failure_summary" text,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" text,
	"actor_credential_id" uuid,
	CONSTRAINT "attachments_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "attachments_one_target" CHECK (num_nonnulls("attachments"."project_id", "attachments"."section_id", "attachments"."task_id") = 1),
	CONSTRAINT "attachments_declared_size" CHECK ("attachments"."declared_size" BETWEEN 0 AND 20000000),
	CONSTRAINT "attachments_actual_size" CHECK ("attachments"."actual_size" IS NULL OR "attachments"."actual_size" >= 0),
	CONSTRAINT "attachments_ready_metadata" CHECK ("attachments"."state" <> 'ready' OR ("attachments"."verified_at" IS NOT NULL AND "attachments"."detected_media_type" IS NOT NULL AND "attachments"."actual_size" IS NOT NULL AND "attachments"."actual_size" <= 20000000)),
	CONSTRAINT "attachments_actor" CHECK (("attachments"."actor_kind" = 'agent' AND "attachments"."actor_credential_id" IS NOT NULL) OR ("attachments"."actor_kind" = 'human' AND "attachments"."actor_user_id" = "attachments"."owner_id" AND "attachments"."actor_user_id" IS NOT NULL AND "attachments"."actor_credential_id" IS NULL) OR ("attachments"."actor_kind" = 'system' AND "attachments"."actor_credential_id" IS NULL)),
	CONSTRAINT "attachments_revision_positive" CHECK ("attachments"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "github_automation_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"event_fingerprint" text NOT NULL,
	"baseline_remote_states" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"resulting_task_revision" integer NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_automation_evaluations_event" UNIQUE("task_id","rule_id","event_fingerprint"),
	CONSTRAINT "github_automation_evaluations_revision" CHECK ("github_automation_evaluations"."resulting_task_revision" > 0),
	CONSTRAINT "github_automation_evaluations_outcome" CHECK ("github_automation_evaluations"."outcome" IN ('baseline', 'transitioned', 'no_op'))
);
--> statement-breakpoint
CREATE TABLE "github_check_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"repository_id" uuid NOT NULL,
	"head_sha" text NOT NULL,
	"summary" jsonb NOT NULL,
	"remote_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_check_summaries_repository_sha" UNIQUE("repository_id","head_sha"),
	CONSTRAINT "github_check_summaries_revision_positive" CHECK ("github_check_summaries"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"account_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "github_installations_installation_id_unique" UNIQUE("installation_id"),
	CONSTRAINT "github_installations_scope_id" UNIQUE("owner_id","id"),
	CONSTRAINT "github_installations_status" CHECK ("github_installations"."status" IN ('active', 'suspended', 'removed', 'unavailable')),
	CONSTRAINT "github_installations_revision_positive" CHECK ("github_installations"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "github_issue_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"github_item_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_issue_imports_project_item" UNIQUE("project_id","github_item_id")
);
--> statement-breakpoint
CREATE TABLE "github_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"repository_id" uuid NOT NULL,
	"github_item_id" bigint NOT NULL,
	"type" "github_item_type" NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"is_merged" boolean DEFAULT false NOT NULL,
	"head_sha" text,
	"remote_created_at" timestamp with time zone NOT NULL,
	"remote_updated_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"availability" text DEFAULT 'available' NOT NULL,
	CONSTRAINT "github_items_owner_id" UNIQUE("owner_id","id"),
	CONSTRAINT "github_items_repository_id" UNIQUE("owner_id","repository_id","id"),
	CONSTRAINT "github_items_external_id" UNIQUE("type","github_item_id"),
	CONSTRAINT "github_items_repository_number" UNIQUE("repository_id","number"),
	CONSTRAINT "github_items_number_positive" CHECK ("github_items"."number" > 0),
	CONSTRAINT "github_items_state" CHECK ("github_items"."state" IN ('open', 'closed')),
	CONSTRAINT "github_items_availability" CHECK ("github_items"."availability" IN ('available', 'unavailable', 'deleted')),
	CONSTRAINT "github_items_revision_positive" CHECK ("github_items"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"name" text NOT NULL,
	"owner_name" text NOT NULL,
	"default_branch" text,
	"availability" text DEFAULT 'available' NOT NULL,
	CONSTRAINT "github_repositories_github_repository_id_unique" UNIQUE("github_repository_id"),
	CONSTRAINT "github_repositories_scope_id" UNIQUE("owner_id","id"),
	CONSTRAINT "github_repositories_availability" CHECK ("github_repositories"."availability" IN ('available', 'unavailable', 'removed')),
	CONSTRAINT "github_repositories_revision_positive" CHECK ("github_repositories"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "github_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"repository_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_success_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "github_sync_state_resource" UNIQUE("repository_id","resource"),
	CONSTRAINT "github_sync_state_attempts" CHECK ("github_sync_state"."attempts" >= 0),
	CONSTRAINT "github_sync_state_revision_positive" CHECK ("github_sync_state"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "github_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "github_webhook_deliveries_delivery_id_unique" UNIQUE("delivery_id"),
	CONSTRAINT "github_webhook_deliveries_state" CHECK ("github_webhook_deliveries"."state" IN ('pending', 'processed', 'failed')),
	CONSTRAINT "github_webhook_deliveries_revision_positive" CHECK ("github_webhook_deliveries"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_github_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"rule_kind" "github_rule_kind" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"target_status_id" uuid NOT NULL,
	"target_category" "status_category" NOT NULL,
	"enabled_at" timestamp with time zone,
	CONSTRAINT "project_github_rules_scope_id" UNIQUE("owner_id","project_id","id"),
	CONSTRAINT "project_github_rules_project_kind" UNIQUE("project_id","rule_kind"),
	CONSTRAINT "project_github_rules_target" CHECK (("project_github_rules"."rule_kind" = 'pr_open' AND "project_github_rules"."target_category" = 'in_progress') OR ("project_github_rules"."rule_kind" = 'all_prs_merged' AND "project_github_rules"."target_category" = 'in_review')),
	CONSTRAINT "project_github_rules_enabled_at" CHECK (NOT "project_github_rules"."enabled" OR "project_github_rules"."enabled_at" IS NOT NULL),
	CONSTRAINT "project_github_rules_revision_positive" CHECK ("project_github_rules"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_repositories" (
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	CONSTRAINT "project_repositories_project_id_repository_id_pk" PRIMARY KEY("project_id","repository_id"),
	CONSTRAINT "project_repositories_scope" UNIQUE("owner_id","project_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "task_github_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"github_item_id" uuid NOT NULL,
	"origin" text NOT NULL,
	CONSTRAINT "task_github_links_task_item" UNIQUE("task_id","github_item_id"),
	CONSTRAINT "task_github_links_origin" CHECK ("task_github_links"."origin" IN ('manual', 'import')),
	CONSTRAINT "task_github_links_revision_positive" CHECK ("task_github_links"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" "job_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"lease_token" uuid,
	"last_error" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "background_jobs_deduplication_key_unique" UNIQUE("deduplication_key"),
	CONSTRAINT "background_jobs_attempts" CHECK ("background_jobs"."attempts" >= 0 AND "background_jobs"."max_attempts" > 0),
	CONSTRAINT "background_jobs_lease" CHECK (("background_jobs"."state" = 'running' AND "background_jobs"."lease_token" IS NOT NULL AND "background_jobs"."lease_expires_at" IS NOT NULL) OR ("background_jobs"."state" <> 'running' AND "background_jobs"."lease_token" IS NULL AND "background_jobs"."lease_expires_at" IS NULL)),
	CONSTRAINT "background_jobs_revision_positive" CHECK ("background_jobs"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"status" "export_state" DEFAULT 'pending' NOT NULL,
	"output_object_key" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	"failure_summary" text,
	CONSTRAINT "exports_output_object_key_unique" UNIQUE("output_object_key"),
	CONSTRAINT "exports_ready_output" CHECK ("exports"."status" <> 'ready' OR ("exports"."output_object_key" IS NOT NULL AND "exports"."completed_at" IS NOT NULL)),
	CONSTRAINT "exports_revision_positive" CHECK ("exports"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" text,
	"actor_credential_id" uuid,
	"actor_identity" text NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	CONSTRAINT "idempotency_records_actor_operation_key" UNIQUE("owner_id","actor_kind","actor_identity","operation","key"),
	CONSTRAINT "idempotency_records_actor" CHECK (("idempotency_records"."actor_kind" = 'human' AND "idempotency_records"."actor_user_id" IS NOT NULL AND "idempotency_records"."actor_user_id" = "idempotency_records"."owner_id" AND "idempotency_records"."actor_identity" = "idempotency_records"."actor_user_id" AND "idempotency_records"."actor_credential_id" IS NULL) OR ("idempotency_records"."actor_kind" = 'agent' AND "idempotency_records"."actor_credential_id" IS NOT NULL AND "idempotency_records"."actor_identity" = "idempotency_records"."actor_credential_id"::text) OR ("idempotency_records"."actor_kind" = 'system' AND "idempotency_records"."actor_identity" <> '' AND "idempotency_records"."actor_credential_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_api_key_id_apikey_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_grants" ADD CONSTRAINT "agent_project_grants_credential" FOREIGN KEY ("owner_id","credential_id") REFERENCES "public"."agent_credentials"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_grants" ADD CONSTRAINT "agent_project_grants_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_definitions" ADD CONSTRAINT "property_definitions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_definitions" ADD CONSTRAINT "property_definitions_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_options" ADD CONSTRAINT "property_options_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_options" ADD CONSTRAINT "property_options_definition" FOREIGN KEY ("owner_id","project_id","definition_id") REFERENCES "public"."property_definitions"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_parent_scope" FOREIGN KEY ("owner_id","project_id","parent_section_id") REFERENCES "public"."sections"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task" FOREIGN KEY ("owner_id","project_id","task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_prerequisite" FOREIGN KEY ("owner_id","project_id","prerequisite_task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task" FOREIGN KEY ("owner_id","project_id","task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label" FOREIGN KEY ("owner_id","project_id","label_id") REFERENCES "public"."labels"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_property_option_values" ADD CONSTRAINT "task_property_option_values_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_property_option_values" ADD CONSTRAINT "task_property_option_values_task" FOREIGN KEY ("owner_id","project_id","task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_property_option_values" ADD CONSTRAINT "task_property_option_values_option" FOREIGN KEY ("owner_id","project_id","definition_id","option_id") REFERENCES "public"."property_options"("owner_id","project_id","definition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_property_values" ADD CONSTRAINT "task_property_values_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_property_values" ADD CONSTRAINT "task_property_values_task" FOREIGN KEY ("owner_id","project_id","task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_property_values" ADD CONSTRAINT "task_property_values_definition" FOREIGN KEY ("owner_id","project_id","definition_id") REFERENCES "public"."property_definitions"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_property_values" ADD CONSTRAINT "task_property_values_option" FOREIGN KEY ("owner_id","project_id","definition_id","option_id") REFERENCES "public"."property_options"("owner_id","project_id","definition_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section" FOREIGN KEY ("owner_id","project_id","section_id") REFERENCES "public"."sections"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_scope" FOREIGN KEY ("owner_id","project_id","parent_task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status" FOREIGN KEY ("owner_id","project_id","status_id") REFERENCES "public"."task_statuses"("owner_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_credential" FOREIGN KEY ("owner_id","actor_credential_id") REFERENCES "public"."agent_credentials"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note" FOREIGN KEY ("owner_id","note_id") REFERENCES "public"."notes"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_credential" FOREIGN KEY ("owner_id","actor_credential_id") REFERENCES "public"."agent_credentials"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_section" FOREIGN KEY ("owner_id","section_id") REFERENCES "public"."sections"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_task" FOREIGN KEY ("owner_id","task_id") REFERENCES "public"."tasks"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_section" FOREIGN KEY ("owner_id","section_id") REFERENCES "public"."sections"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task" FOREIGN KEY ("owner_id","task_id") REFERENCES "public"."tasks"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_credential" FOREIGN KEY ("owner_id","actor_credential_id") REFERENCES "public"."agent_credentials"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_automation_evaluations" ADD CONSTRAINT "github_automation_evaluations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_automation_evaluations" ADD CONSTRAINT "github_automation_evaluations_task" FOREIGN KEY ("owner_id","project_id","task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_automation_evaluations" ADD CONSTRAINT "github_automation_evaluations_rule" FOREIGN KEY ("owner_id","project_id","rule_id") REFERENCES "public"."project_github_rules"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_check_summaries" ADD CONSTRAINT "github_check_summaries_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_check_summaries" ADD CONSTRAINT "github_check_summaries_repository" FOREIGN KEY ("owner_id","repository_id") REFERENCES "public"."github_repositories"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_issue_imports" ADD CONSTRAINT "github_issue_imports_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_issue_imports" ADD CONSTRAINT "github_issue_imports_task" FOREIGN KEY ("owner_id","project_id","task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_issue_imports" ADD CONSTRAINT "github_issue_imports_item" FOREIGN KEY ("owner_id","github_item_id") REFERENCES "public"."github_items"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_items" ADD CONSTRAINT "github_items_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_items" ADD CONSTRAINT "github_items_repository" FOREIGN KEY ("owner_id","repository_id") REFERENCES "public"."github_repositories"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installation" FOREIGN KEY ("owner_id","installation_id") REFERENCES "public"."github_installations"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_sync_state" ADD CONSTRAINT "github_sync_state_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_sync_state" ADD CONSTRAINT "github_sync_state_repository" FOREIGN KEY ("owner_id","repository_id") REFERENCES "public"."github_repositories"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_webhook_deliveries" ADD CONSTRAINT "github_webhook_deliveries_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_github_rules" ADD CONSTRAINT "project_github_rules_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_github_rules" ADD CONSTRAINT "project_github_rules_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_github_rules" ADD CONSTRAINT "project_github_rules_status" FOREIGN KEY ("owner_id","project_id","target_status_id","target_category") REFERENCES "public"."task_statuses"("owner_id","project_id","id","category") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_project" FOREIGN KEY ("owner_id","project_id") REFERENCES "public"."projects"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_repository" FOREIGN KEY ("owner_id","repository_id") REFERENCES "public"."github_repositories"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_github_links" ADD CONSTRAINT "task_github_links_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_github_links" ADD CONSTRAINT "task_github_links_task" FOREIGN KEY ("owner_id","project_id","task_id") REFERENCES "public"."tasks"("owner_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_github_links" ADD CONSTRAINT "task_github_links_item" FOREIGN KEY ("owner_id","repository_id","github_item_id") REFERENCES "public"."github_items"("owner_id","repository_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_credential" FOREIGN KEY ("owner_id","actor_credential_id") REFERENCES "public"."agent_credentials"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_configId_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_referenceId_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "agent_credentials_owner" ON "agent_credentials" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "agent_project_grants_project_lookup" ON "agent_project_grants" USING btree ("project_id","credential_id");--> statement-breakpoint
CREATE INDEX "projects_owner_archive" ON "projects" USING btree ("owner_id","archived_at");--> statement-breakpoint
CREATE INDEX "projects_search" ON "projects" USING gin (to_tsvector('simple', "name" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "property_definitions_order" ON "property_definitions" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "property_options_order" ON "property_options" USING btree ("definition_id","position");--> statement-breakpoint
CREATE INDEX "sections_parent_position" ON "sections" USING btree ("project_id","parent_section_id","position");--> statement-breakpoint
CREATE INDEX "sections_search" ON "sections" USING gin (to_tsvector('simple', "name" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "task_dependencies_reverse" ON "task_dependencies" USING btree ("prerequisite_task_id","task_id");--> statement-breakpoint
CREATE INDEX "task_labels_reverse" ON "task_labels" USING btree ("label_id","task_id");--> statement-breakpoint
CREATE INDEX "task_property_option_values_filter" ON "task_property_option_values" USING btree ("definition_id","option_id");--> statement-breakpoint
CREATE INDEX "task_property_values_number" ON "task_property_values" USING btree ("definition_id","value_number");--> statement-breakpoint
CREATE INDEX "task_property_values_date" ON "task_property_values" USING btree ("definition_id","value_date");--> statement-breakpoint
CREATE INDEX "task_property_values_option" ON "task_property_values" USING btree ("definition_id","option_id");--> statement-breakpoint
CREATE INDEX "task_property_values_search" ON "task_property_values" USING gin (to_tsvector('simple', coalesce("value_text", '')));--> statement-breakpoint
CREATE UNIQUE INDEX "task_statuses_one_default" ON "task_statuses" USING btree ("project_id") WHERE "task_statuses"."is_default";--> statement-breakpoint
CREATE INDEX "task_statuses_category" ON "task_statuses" USING btree ("project_id","category","position");--> statement-breakpoint
CREATE INDEX "tasks_location_position" ON "tasks" USING btree ("project_id","section_id","parent_task_id","position");--> statement-breakpoint
CREATE INDEX "tasks_parent_position" ON "tasks" USING btree ("parent_task_id","position");--> statement-breakpoint
CREATE INDEX "tasks_status" ON "tasks" USING btree ("project_id","status_id");--> statement-breakpoint
CREATE INDEX "tasks_due_date" ON "tasks" USING btree ("owner_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_updated" ON "tasks" USING btree ("owner_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "tasks_search" ON "tasks" USING gin (to_tsvector('simple', "title" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "activities_project_time" ON "activities" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "activities_task_time" ON "activities" USING btree ("task_id","created_at","id");--> statement-breakpoint
CREATE INDEX "activities_section_time" ON "activities" USING btree ("section_id","created_at","id");--> statement-breakpoint
CREATE INDEX "activities_credential" ON "activities" USING btree ("actor_credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_project_target" ON "notes" USING btree ("project_id") WHERE "notes"."project_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_section_target" ON "notes" USING btree ("section_id") WHERE "notes"."section_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_task_target" ON "notes" USING btree ("task_id") WHERE "notes"."task_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notes_search" ON "notes" USING gin (to_tsvector('simple', "plain_text"));--> statement-breakpoint
CREATE INDEX "attachments_project_state" ON "attachments" USING btree ("project_id","state");--> statement-breakpoint
CREATE INDEX "attachments_section_state" ON "attachments" USING btree ("section_id","state");--> statement-breakpoint
CREATE INDEX "attachments_task_state" ON "attachments" USING btree ("task_id","state");--> statement-breakpoint
CREATE INDEX "attachments_expired_uploads" ON "attachments" USING btree ("state","upload_expires_at");--> statement-breakpoint
CREATE INDEX "github_automation_evaluations_rule_lookup" ON "github_automation_evaluations" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "github_issue_imports_task_lookup" ON "github_issue_imports" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "github_items_synced" ON "github_items" USING btree ("synced_at");--> statement-breakpoint
CREATE INDEX "github_repositories_installation_lookup" ON "github_repositories" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "github_sync_state_next_attempt" ON "github_sync_state" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "github_webhook_deliveries_pending" ON "github_webhook_deliveries" USING btree ("state","received_at");--> statement-breakpoint
CREATE INDEX "project_repositories_reverse" ON "project_repositories" USING btree ("repository_id","project_id");--> statement-breakpoint
CREATE INDEX "task_github_links_item_lookup" ON "task_github_links" USING btree ("github_item_id","task_id");--> statement-breakpoint
CREATE INDEX "background_jobs_claim" ON "background_jobs" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "background_jobs_expired_lease" ON "background_jobs" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "background_jobs_owner" ON "background_jobs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "exports_owner_requested" ON "exports" USING btree ("owner_id","requested_at");--> statement-breakpoint
CREATE INDEX "exports_expiry" ON "exports" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_records_expiry" ON "idempotency_records" USING btree ("expires_at");