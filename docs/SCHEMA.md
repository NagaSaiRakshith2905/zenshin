# Schema proposal

Status: ready for shared-understanding review. Vocabulary and accepted behavior are defined in ../GLOSSARY.md and ../DECISIONS.md. This document proposes a relational model; no migrations or application code have been created.

## Conventions

- PostgreSQL UUID primary keys for application entities. Better Auth tables use identifiers compatible with its generated schema.
- UTC timestamptz for events; date for task due dates and section target dates.
- Mutable records have created_at, updated_at, and an integer revision for optimistic concurrency.
- Ownership is explicit. Domain relations must remain within the same owner and project; enforce using composite foreign keys where possible and transactional validation where necessary.
- Archiving is separate from lifecycle/status. Effective archival includes archived ancestors; restoring an ancestor does not restore descendants that were independently archived.
- Stable task references combine an immutable project prefix and a transactionally allocated project-local integer. UUIDs remain canonical API identifiers.

## Identity and preferences

| Table | Main fields and purpose |
| --- | --- |
| Better Auth generated tables | User, session, provider account, verification, API key, and any required plugin tables. Generate from the selected package versions; do not manually invent their required columns. |
| user_preferences | user_id, timezone, theme, default task view. |
| agent_credentials | api_key_id, owner_id, display_name, allowed action scopes. The key plugin owns hashed secrets, expiry, verification, and revocation. |
| agent_project_grants | credential_id, project_id; explicit per-project access. |

## Project organization

| Table | Main fields and purpose |
| --- | --- |
| projects | owner_id, name, prefix, description, next_task_number, archived_at; unique (owner_id, prefix). |
| sections | owner_id, project_id, parent_section_id nullable, name, description, lifecycle, target_date nullable, position, archived_at. |
| task_statuses | project_id, name, category, position, is_default. Category is Backlog, Ready, In progress, In review, Done, or Canceled. |
| tasks | owner_id, project_id, section_id nullable, parent_task_id nullable, number, title, description, status_id, priority, due_date nullable, manual_blocked_reason nullable, position, archived_at. |
| labels | project_id, name, color; unique normalized name within a project. |
| task_labels | project_id, task_id, label_id; unique task-label association. |
| task_dependencies | project_id, task_id, prerequisite_task_id; unique pair. |
| property_definitions | project_id, name, normalized_name, type (text/number/date/checkbox/select/multi_select/url), position, revision; unique (project_id, normalized_name); at most 30 per project. Type is immutable. |
| property_options | project_id, definition_id, name, position; unique (definition_id, normalized name); at most 50 per definition; only for select/multi_select definitions. |
| task_property_values | project_id, task_id, definition_id, value_text, value_number numeric, value_date date, value_bool, option_id nullable; unique (task_id, definition_id). Exactly the column matching the definition's type is set. A cleared value deletes the row. |
| task_property_option_values | project_id, task_id, definition_id, option_id; unique (task_id, option_id). Multi-select selections. |

Important constraints:

- A section tree cannot contain a cycle or exceed three section levels. Validate moves against the deepest descendant, not just the moved section.
- A subtask has exactly one parent; a parent task cannot itself be a subtask. A subtask's section matches its parent's, including when both are at project root.
- A dependency cannot reference itself or cross projects. Reject cycles across dependency edges and prohibit dependencies between a parent and its own subtask.
- At most one project default status; it must be in Backlog. Every task's status belongs to its project.
- Never infer workflow meaning from a customizable display name; use the stable category.
- Property values and options belong to the task's project. Validate the value against the definition type in the service (text length, finite number, http/https URL, option belongs to the definition). Setting values bumps the task revision and writes activity in the same transaction. Deleting a definition or option cascades to its values after the confirmed service call.
- A prerequisite satisfies a dependency only when it is Done and not effectively archived. Archiving even a Done prerequisite requires explicit resolution for surviving active dependents.
- Serialize structural/dependency validation within the affected project to prevent concurrent writes from introducing cycles. Status changes and activity writes commit together.
- Default list ordering uses gapped bigint positions; periodically rebalance within the affected scope. Explicit sorts do not mutate manual positions.
- Root task order is within its project or section; subtask order is within its parent. Board columns use the same underlying order. Disable ambiguous cross-section ordering in aggregated views; a status drag retains location and appends within the local scope.

## Written context and activity

| Table | Main fields and purpose |
| --- | --- |
| notes | owner_id; exactly one of project_id, section_id, task_id; structured rich-text content, extracted plain text, revision. At most one note per target. |
| note_revisions | note_id, revision number, canonical content, actor identity, saved_at; unique (note_id, revision), retain latest 20. Restore appends a new revision. |
| activities | owner_id, project_id, optional section_id/task_id, actor_kind, actor_user_id, actor_credential_id nullable, action, changed-field summary, request_id, created_at. |
| idempotency_records | actor identity, operation key, request fingerprint, result reference, expiry. Prevent duplicate retried writes where supported. |

- Notes are separate from short plain-text descriptions. Canonical stored format is validated rich-text JSON; proposed editor is Tiptap. Markdown and plain text are derived for export/search.
- Extract note plain text for search. Render only supported document nodes and safe link schemes.
- Activity contains enough change context for accountability without storing secrets or full uploaded-file contents.
- No separate comment entity or collaboratively edited document system in V1.

## Files

| Table | Main fields and purpose |
| --- | --- |
| attachments | owner_id; exactly one project_id/section_id/task_id; original_name, detected media type, actual_size, unique object_key, state, upload expiry, created_by_actor, verified_at. |

- State machine: pending upload → verifying → ready, or failed. Only ready objects can be downloaded or referenced as successful attachments.
- R2 stores private bytes; PostgreSQL stores authoritative ownership, target, readiness, and metadata.
- The server authorizes upload initiation and finalization, checks the actual object, and cleans expired pending objects.
- Permanent deletion must coordinate database and object deletion with retryable cleanup. Do not delete files merely because an ancestor was archived.

## GitHub

| Table | Main fields and purpose |
| --- | --- |
| github_installations | owner_id, installation_id, account_id, account_name, installation status. |
| github_repositories | installation_id, GitHub repository ID, name, owner name, default branch, availability. |
| project_repositories | project_id, repository_id. |
| github_items | repository_id, stable GitHub item ID, type issue/PR, number, URL, cached title/state, draft/merged state, head SHA, remote timestamps, synced_at. |
| task_github_links | project_id, task_id, github_item_id, link origin manual/import; unique task-item association. Removable visible links are independent of import provenance. |
| github_issue_imports | project_id, github_item_id, task_id, imported_at; unique (project_id, github_item_id). Import provenance survives unlinking and archiving; permanent task deletion removes this mapping, allowing a deliberate new import with a new task reference. |
| github_check_summaries | repository_id, head_sha, cached check/status summary, synced_at. |
| project_github_rules | project_id, rule_kind, enabled, target_status_id, enabled_at, revision; unique (project_id, rule_kind). Target category must match the rule. Default disabled. |
| github_automation_evaluations | task_id, rule_id, event_fingerprint, baseline remote states, outcome, resulting_task_revision, evaluated_at; unique (task_id, rule_id, event_fingerprint). Suppresses repeated PR-open/ready/merged-set events and records no-op evaluations. |
| github_sync_state | repository/resource identity, conditional request markers, last success, next attempt, retry/error state. |
| github_webhook_deliveries | unique GitHub delivery ID, event type, processing state, timestamps; deduplicates deliveries. |

- GitHub provider credentials used for login are separate from installation authorization.
- Store stable external IDs; names and URLs can change.
- Repository loss, removed installations, or deleted issues leave tasks usable and show the integration's unavailable state.
- Polling/manual refresh/webhooks share one idempotent reconciliation path. Old responses must not overwrite newer cached data.

## Operational work

| Table | Main fields and purpose |
| --- | --- |
| background_jobs | kind, unique deduplication key, minimal payload, state, attempts, available_at, lease expiry, last error. For bounded GitHub refresh, exports, cleanup, and retryable external work if required. |
| exports | owner_id, status, output object key, requested_at, completed_at, expires_at, failure summary. |

Keep operational tables proportional to actual asynchronous needs; use the existing database rather than adding a second queue datastore by default.

## Search and indexes

- PostgreSQL full-text search over titles, descriptions, extracted note text, and Text property values, scoped by ownership and project.
- Index task_property_values by (definition_id, value_number), (definition_id, value_date), (definition_id, option_id); index task_property_option_values by (definition_id, option_id) for filters and sorts.
- Exact/prefix lookup for task references and normalized label names.
- Index tasks by project/section/parent plus position, status/category lookup, due date, and updated_at; index both directions of dependencies.
- Index section parent traversal, note target uniqueness, attachment target/state, project repository membership, and next GitHub sync time.
- Apply archive/ancestor visibility before counting, pagination, or search results. Query semantics must be identical in UI and MCP.

## Finalized policy details

- Effectively archived prerequisites remain blockers even if their stored status is Done; prevent permanent deletion while surviving external tasks depend on the deletion set.
- Dependencies between parent/descendant tasks are prohibited. Progress counts non-canceled, non-archived leaves; unresolved parents surface separately.
- Completing a parent and reopening completed section ancestors require explicit atomic choices. MCP reports decision_required rather than partial writes.
- At least one status remains per fixed category; status deletion remaps tasks. Owner-only workflow/label configuration, agents may apply labels.
- Retain 20 saved note revisions; owner-only restore. Backup retention is 30 days and export artifacts expire after 24 hours by proposed default.
- See SPECIFICATION.md for permitted upload types and deterministic view/editing behavior; DESIGN.md for task detail navigation.
