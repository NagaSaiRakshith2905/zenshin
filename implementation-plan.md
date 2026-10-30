# Detailed implementation plan

Status: implementation in progress. Phases 0–9 are complete and verified against disposable local PostgreSQL. Phase 10 job infrastructure and Phase 11 application code are implemented; Phase 11 provisioning and real R2 acceptance remain open. Phases 12–13 application code is implemented; PostgreSQL verification, GitHub App provisioning and staging acceptance remain open. Phases 14–16 remain. No provider infrastructure has been provisioned by this plan.

## 1. Purpose and governing documents

Build the complete agreed V1: a private, authenticated project development workspace with nested planning, task execution, notes, attachments, GitHub integration, and scoped MCP access for local agents.

Use these documents together:

- [Product specification](docs/SPECIFICATION.md): behavior, scope, edge cases, and implementation defaults.
- [Glossary](GLOSSARY.md): canonical vocabulary used in code and UI.
- [Decision record](DECISIONS.md): accepted product choices.
- [Schema](docs/SCHEMA.md): entities, relationships, constraints, indexes.
- [Architecture](docs/ARCHITECTURE.md): boundaries, authentication, providers, jobs, recovery.
- [MCP/API contract](docs/MCP-API.md): operations, actors, scopes, errors, retries.
- [Design](docs/DESIGN.md): screen structure, tokens, interactions, accessibility.
- [Delivery criteria](docs/DELIVERY.md): cross-cutting acceptance and launch gates.

This plan adds execution detail without changing agreed scope. A conflict must be resolved in the governing documents before implementing contradictory behavior. Explicit specification defaults remain part of final review. Actual account identifiers, secrets, domain, regions, and compatible dependency versions are supplied during implementation.

### Working rules

- Build one Next.js application, with shared domain services for browser/API/MCP.
- Implement and verify one vertical slice at a time; do not build a second rules engine inside MCP or UI components.
- Commit reviewed Drizzle migrations; never depend on runtime schema pushes.
- Use real PostgreSQL integration tests for transactions, relationships, and concurrency. Use mocked external services for reproducible failure tests and isolated staging resources for real-provider smoke checks.
- Add meaningful tests with each risky behavior, rather than postponing verification until release. Do not test styling through brittle implementation snapshots.
- Keep all V1 essentials. Build phases are sequencing, not permission to drop features.
- No new microservices, Redis, search service, OAuth MCP server, collaboration platform, or notification product is required.
- Protect credentials in environment/secret stores. Examples contain placeholders only.

## 2. Execution sequence and dependencies

| Phase | Deliverable | Prerequisites |
| --- | --- | --- |
| 0 | Repository baseline and configuration inventory | Specification confirmation |
| 1 | Application foundation and CI | 0 |
| 2 | Database schema and migration foundation | 1 |
| 3 | Owner authentication, actors, and scoped credentials | 2 |
| 4 | Shared contracts, transaction helpers, activity, idempotency | 3 |
| 5 | Projects, workflows, and nested sections | 4 |
| 6 | Tasks, subtasks, dependencies, archive/delete rules | 5 |
| 7 | Application shell, core views, and task editing | 6 |
| 8 | Notes, autosave, revisions, and draft recovery | 7 |
| 9 | Search, filters, ordering, and board behavior | 8 |
| 10 | Durable jobs and integration health | 4; complete before 11–15 |
| 11 | Private R2 attachments | 7, 10 |
| 12 | GitHub installation, linking, import, and reconciliation | 6, 8, 10 |
| 13 | Opt-in GitHub workflow automation | 12 |
| 14 | MCP tools and real-client compatibility | 9, 11, 13 |
| 15 | Exports, independent backups, and tested restore | 10–14 |
| 16 | Accessibility, performance, production release | All preceding phases |

Recommended working order follows the table, introducing Phase 10's minimal job primitives earlier when a feature needs them. Auth boundaries and domain invariants must exist before exposing mutation routes or agent tools. Parallel work is optional after shared contracts stabilize; this plan does not require delegation.

## 3. Phase 0 — Establish the implementation baseline

**Status: ✅ Complete (2026-10-29).** All tasks done; Verification items deferred until all phases are built.

### Tasks

- [x] Confirm the specification package, including explicitly proposed implementation defaults.
- [x] Inspect the workspace again for new files, repository instructions, and user changes before scaffolding. Preserve existing work.
- [x] Establish source control and an appropriate working branch if none exists; do not overwrite another checkout or create a remote without authorization.
- [x] Choose the product name, initial domain strategy, and package manager. Use one lockfile. (Zenshin, zenshin.app, pnpm; see DECISIONS.md. Domain registration still pending.)
- [x] Record required deployment inputs without committing their values: immutable owner GitHub ID, provider accounts, regions, app registrations, backup destination, operational alert destination.
- [x] Review mutually compatible stable package releases at implementation time; record the selected Node version and dependency versions in manifests/tooling.
- [x] Create an environment-variable reference with server-only versus browser-safe variables and an example file containing no secrets.

### Configuration inventory

| Area | Required configuration |
| --- | --- |
| Application | Public origin, environment name, Node runtime |
| Database | Application pooled URL; separate migration/backup connection where needed |
| Better Auth | Secret, canonical auth URL, GitHub OAuth client ID/secret, owner identity |
| GitHub App | App ID, private key, webhook secret, installation callback configuration |
| R2 | Account endpoint, bucket, narrowly scoped credentials, approved CORS origins |
| Jobs | Execution limits (no cron) |
| Recovery | Independent destination, separate credentials, retention, backup runner and age alerts |
| Observability | Error/log provider configuration and owner alert destination |

**Exit gate:** selected tooling and a documented configuration inventory; no actual secret in tracked files. Unavailable provider inputs block their own integration phase, not independent core work.

## 4. Phase 1 — Scaffold the application and checks

**Status: ✅ Complete (2026-10-29).** All tasks done; Verification items deferred until all phases are built.

### Tasks

- [x] Create Next.js App Router with TypeScript, Tailwind, and shadcn/ui using current compatible setup instructions.
- [x] Configure the Node runtime and one consistent module/path-alias convention.
- [x] Establish the source layout described in ARCHITECTURE.md: app, components, features, server/auth, server/services, server/db, server/integrations, server/jobs, server/mcp, lib/contracts.
- [x] Add the PostgreSQL/Drizzle driver, Better Auth and API-key plugin, boundary validation, client server-state library, rich-text editor, integration SDKs, and MCP dependencies when their slices begin. Avoid unused packages.
- [x] Add server-side environment validation that fails clearly when a required setting is missing. Keep build-time and runtime requirements distinct where the hosting platform requires it.
- [x] Set up typecheck, lint, test, migration-generation/application, and production-build scripts. Document that these commands are proposed until implemented.
- [x] Set up CI with dependency caching, typecheck, lint, targeted tests, and build. External integration secrets are not required for ordinary mocked tests.
- [x] Add a test database strategy and isolated fixtures. Tests cannot use production URLs.
- [x] Add base error/loading boundaries and a safe request-ID/logging helper.
- [x] Install the Zenshin logo assets from design/brand/ (favicon.svg/.ico, apple icon, manifest icons, Open Graph image, in-app `currentColor` logo component) at the locations listed in design/brand/README.md. Use these files rather than redrawing or regenerating icons; set the app name to Zenshin and theme colour #18181B in the manifest and metadata.

**Target artifacts:** package manifest/lockfile, app skeleton, environment example/reference, CI workflow, test configuration, initial global styles.

**Exit gate:** the empty application runs locally and its production build, typecheck, and lint pass. CI can reproduce the result.

## 5. Phase 2 — Implement the database model

**Status: ✅ Complete (2026-10-29).** Tasks and verification done; migrations applied and seed loaded on disposable PostgreSQL 18.6.

### Tasks

- [x] Translate SCHEMA.md into Drizzle definitions with clear modules for identity, organization/work, notes/activity, files, GitHub, and operations.
- [x] Generate Better Auth/plugin tables using the chosen versions. Verify generated identifiers and adapter mappings instead of hand-inventing authentication columns.
- [x] Add UTC event timestamps, calendar-date fields, integer revisions, UUID IDs, and foreign-key/index conventions.
- [x] Add unique project prefixes, project-local task numbers, label normalization, dependency pairs, task-label pairs, property definition/option uniqueness and per-task value uniqueness, note targets, and import provenance constraints.
- [x] Enforce same-owner/same-project references using composite constraints where practical. Document transactional validations for graph/depth rules that cannot be expressed as simple checks.
- [x] Enforce exactly one note/attachment target and at most one note per target. Index target lookups.
- [x] Add note revisions, job leases/deduplication, credential grants, GitHub rule targets, automation evaluation markers, sync state, exports, and idempotency records.
- [x] Define delete behavior deliberately for provenance, note revisions, activity references, jobs, and files; external-object deletion must remain retryable after local deletion.
- [x] Create the initial reviewed migrations and a deterministic development seed containing representative projects, nested sections, workflows, tasks/subtasks, and boundary cases.
- [x] Add a fixture generator for the larger performance dataset without treating it as production seed data.

### Verification

- [x] Apply all migrations to an empty PostgreSQL database and inspect constraints/indexes.
- [x] Verify invalid foreign-project relationships and duplicate unique values fail.
- [x] Verify the generated auth schema works with the configured adapter.
- [x] Establish a migration-upgrade test path for future revisions; do not promise destructive down-migrations as the rollback strategy.

**Exit gate:** reproducible clean database creation, working seed, and documented distinction between SQL constraints and service-enforced invariants.

## 6. Phase 3 — Authentication, ownership, and agent credentials

**Status: ✅ Tasks complete (2026-10-29).** Verification passes with mocked GitHub OAuth; two items wait on files (Phase 11) and export (Phase 15). Real GitHub sign-in needs the owner ID and OAuth app.

### Tasks

- [x] Configure GitHub-only Better Auth login and secure session handling.
- [x] Implement controlled provisioning against the immutable owner GitHub account ID, then close implicit public registration.
- [x] Protect application pages and service entry points. Preserve supported OAuth callbacks without weakening general origin/CSRF checks.
- [x] Store owner preferences: timezone initially Asia/Kolkata, system theme, default view.
- [x] Define the actor type: human, agent, system; owner ID; credential ID; action scopes; explicit project grants.
- [x] Implement API-key verification independently from browser sessions. A valid key must never produce full owner authority.
- [x] Implement owner-only key creation, one-time secret display, project-grant selection, presets, optional archive/complete permission, expiry, revocation, and management metadata.
- [x] Set Read only to read; Contributor to read/write/upload. Default expiry is 90 days. No all-future-project grant or agent key creation.
- [x] Ensure authorization does not depend on mutable user-supplied actor labels or permission metadata.
- [x] Add settings UI and server routes for credentials/preferences, with secret-redacted logging.

### Verification

- [x] Owner sign-in works and a different GitHub identity cannot provision/access the dashboard.
- [x] Expired/revoked keys fail on the next authenticated request.
- [x] Credential grants isolate projects on reads, counts, search, files, and mutations. (Including Phase 11 file list/upload/finalize/download denial tests against disposable PostgreSQL with mocked storage.)
- [ ] Agent credentials cannot reach owner-only configuration/export/delete operations. (Configuration/delete covered; export arrives in Phase 15.)

**Exit gate:** browser ownership and agent permissions are enforced at the server, with tested denial paths and no credential leakage.

## 7. Phase 4 — Shared service and contract foundation

**Status: ✅ Complete (2026-10-29).** Tasks and verification done against disposable PostgreSQL 18.6: 37 integration + 85 unit tests, typecheck, lint and Webpack build pass.

### Tasks

- [x] Implement Zod input/output contracts, stable enums, calendar-date validation, pagination, sorting, and common error types.
- [x] Define service signatures receiving an actor and validated input. Separate provider adapters from business rules.
- [x] Implement authorization helpers and scoped query helpers used by all transports.
- [x] Implement revision-checked writes and conflict results that preserve enough authorized current context for a deliberate retry.
- [x] Implement request-scoped transactions and a per-project structural guard for tree/dependency mutations.
- [x] Write activity in the same transaction as the successful mutation. Record human/credential/system attribution and changed-field summaries, without secrets/full binary content.
- [x] Implement actor-bound idempotency records, input fingerprints, prior-result lookup, conflicts, and default 24-hour expiry.
- [x] Define decision_required responses for parent completion, completed-ancestor reopening, and archives affecting active dependents.
- [x] Implement common API error mapping and request IDs. Keep business errors consistent between HTTP and later MCP adapters.

**Exit gate:** a representative mutation proves atomic state/activity/idempotency behavior; stale writes, missing permissions, and changed-input retries fail deterministically.

## 8. Phase 5 — Projects, workflows, and sections

**Status: ✅ Complete (2026-10-29).** Tasks and verification done against disposable PostgreSQL 18.6: 37 integration + 85 unit tests, typecheck, lint and Webpack build pass.

### Tasks

- [x] Implement owner-only project creation/update/archive, unique immutable prefixes, and transactionally allocated task counters.
- [x] Initialize each project's six default workflow categories/statuses and one Backlog default status.
- [x] Implement owner-only status rename/order/add/remove, category preservation, mandatory replacement of populated removed statuses, and at least one status per category.
- [x] Implement project-specific label definitions and safe removal of associations when a label is removed.
- [x] Implement owner-only custom property definitions: the seven types, immutable type, rename/reorder, select options, the 30-definition and 50-option limits, and confirmed deletion of a property or a used option that names the affected task count.
- [x] Implement section creation/update/move with root/child ordering, descriptions, lifecycle, target dates, and archive markers.
- [x] Validate a moved subtree's deepest descendant against the three-level cap and reject cycles under the structural guard.
- [x] Implement completed-ancestor discovery and explicit atomic reopening when adding/reopening unfinished work.
- [x] Implement project/section read models containing breadcrumb/tree context and paginated work summaries.
- [x] Implement section lifecycle transitions with complete permission for agents setting Completed; owner-only project configuration remains separate.

### Verification

- [x] Three section levels succeed; invalid/cyclic/depth-four moves and concurrent conflicting moves fail.
- [x] Workflow configuration cannot strand a task or remove a required category/default.
- [x] References/prefixes and project ownership stay stable across edits.

**Exit gate:** project planning and nested organization work through shared services before building a complex UI around them.

## 9. Phase 6 — Tasks, subtasks, dependencies, and lifecycle

**Status: ✅ Complete (2026-10-29).** Tasks and verification done against disposable PostgreSQL 18.6: 37 integration + 85 unit tests, typecheck, lint and Webpack build pass.

### Tasks

- [x] Implement task create/read/update and explicit transitions using the project workflow, revision checks, stable references, priority, due date, labels, custom property values (type-validated, revisioned, with activity), and blocked reason.
- [x] Implement root/section task locations and one subtask level. Validate parent location on creation, move, promotion, and demotion.
- [x] Move subtasks with their parent without rewriting their references or independent tracking fields.
- [x] Prevent demotion of a task with its own subtasks until children are moved/promoted.
- [x] Implement Complete all or Keep parent open atomically; leave canceled subtasks canceled; require complete permission for Done/bulk completion.
- [x] Implement dependencies, reverse-dependency lookup, cycle prevention, same-project restriction, and parent/subtask dependency prohibition.
- [x] Derive blocking from unresolved dependencies plus a manual reason. Only Done and not effectively archived satisfies a prerequisite. Do not prohibit starting blocked work.
- [x] Implement leaf-only progress and unresolved-parent counts with empty/all-canceled states.
- [x] Implement overdue evaluation in the owner's calendar timezone, excluding terminal/archived work.
- [x] Implement effective archive across project/section/task ancestors, explicit dependent warnings, restore preserving independent archive markers, and owner-only permanent deletion of archived subtrees.
- [x] Prevent deletion while surviving external tasks depend on the deletion set. Queue required file cleanup durably rather than abandoning object keys after database deletion.
- [x] Implement manual gapped ordering and bounded rebalance within the correct local scope.

### Verification

- [x] Concurrent creates allocate unique never-reused references.
- [x] Concurrent relationship edits cannot create a cycle or invalid nesting.
- [x] Completion/reopening/archiving needing a choice never produces a partial mutation.
- [x] Progress, canceled/archived prerequisites, date boundaries, restoration, and deletion match the specification.

**Exit gate:** core domain regression checks pass against PostgreSQL, including browser/agent-equivalent authorization and concurrency cases.

## 10. Phase 7 — Application shell and core screens

**Status: ✅ Complete (2026-10-29).** Tasks and verification done against disposable PostgreSQL 18.6: 37 integration + 85 unit tests, typecheck, lint and Webpack build pass.

### Tasks

- [x] Implement self-hosted IBM Plex Sans/Mono, light/dark CSS tokens from shadcn preset `bcivVQBO` plus the derived tokens in design/ui-mockups/ui.css, system-theme default, focus styles, and layout primitives.
- [x] Build the 248 px sidebar, expandable project/section navigation, breadcrumbs, compact header, and responsive navigation alternatives.
- [x] Build My work with non-overlapping, collapsible Overdue/In progress/In review/Ready groups, blocked badges, and task creation.
- [x] Build project Overview/All tasks and section planning/task screens, including lifecycle, target date, progress, and descendant-scope toggle.
- [x] Build reusable task rows and property editors, subtasks, dependency selection, blocked reason, and activity feed.
- [x] Build the 560 px task detail panel, full-page route, shareable URLs, browser Back handling, focus restoration, and preserved list state.
- [x] Implement create/edit/move/archive/restore/delete dialogs and explicit completion/reopening choices, naming affected work.
- [x] Build owner settings as a dialog with its own sidebar, covering workflows/labels/properties and archived-work navigation.
- [x] Build custom property display and editors in the task panel and full page, plus the Add property menu (unset properties and New property).
- [x] Add empty/loading/error states with retry paths; never replace retained task data with an integration error screen.

**Exit gate:** the owner can complete the core planning/execution flow using the website on desktop and mobile, with no note/file/GitHub placeholder presented as a working feature.

## 11. Phase 8 — Notes and editing recovery

**Status: ✅ Complete (2026-10-29).** Tasks and verification done against disposable PostgreSQL 18.6: 37 integration + 85 unit tests, typecheck, lint and Webpack build pass.

### Tasks

- [x] Configure a client-only Tiptap editor with structured JSON storage and the permitted formatting nodes/attributes.
- [x] Implement server-side document/size/link validation; derive plain text for search and Markdown for export.
- [x] Add compact toolbar, Markdown typing shortcuts, code-language selection, and keyboard-accessible controls.
- [x] Implement approximately 800 ms idle autosave with Saving/Saved/Failed/Conflict feedback and revision-aware persistence.
- [x] Preserve attempted content after rejected saves. Offer compare/retry/discard; do not use silent last-write-wins.
- [x] Implement device-local draft recovery keyed by owner/note/base revision, navigation safeguards, and explicit handling on sign-out.
- [x] Store the latest 20 persisted content revisions, with owner preview/restore; restoration creates a new revision.
- [x] Implement atomic note append for agents without replacing a stale document; record activity and idempotency.
- [x] Render supported nodes safely, including imported Markdown, without treating editor schema validation as a blanket XSS guarantee.

**Exit gate:** interruption and concurrent editing preserve user work, invalid documents are rejected, and history restoration is owner-only and non-destructive to revision ordering.

## 12. Phase 9 — Search, filters, list/board behavior

**Status: ✅ Complete (2026-10-29).** Tasks and verification done against disposable PostgreSQL 18.6: 37 integration + 85 unit tests, typecheck, lint and Webpack build pass.

### Tasks

- [x] Implement PostgreSQL full-text search over titles/descriptions/note text/Text property values, task-reference lookup, and normalized label matching.
- [x] Implement custom property filters (empty/not empty, options, checkbox, ranges, contains) and sorts by Number/Date/Select with empty values last, with the same results in the UI and MCP.
- [x] Apply ownership/project grants and effective-archive visibility before results/counts/pagination.
- [x] Implement the agreed filters with AND across groups and OR within multi-selection groups.
- [x] Encode filters, sorting, view, archive inclusion, and descendant scope in URLs.
- [x] Implement cursor pagination, default 50/max 100; avoid loading every note/task into the browser.
- [x] Implement list subtask grouping and contextual parents for matching subtasks without inflating result counts.
- [x] Implement board columns by project statuses, default parent/standalone cards, Include subtasks, and subtask progress.
- [x] Implement status dragging through the transition service; preserve location, local ordering, required choices, and permission checks.
- [x] Disable ambiguous cross-section manual reorder in aggregated views. Explicit sort does not mutate manual ranks.
- [x] Implement Cmd/Ctrl+K search, C new task outside inputs, Escape close, and menu/keyboard alternatives to dragging.

**Exit gate:** list, board, search, and My work produce consistent data and permissions, including blocked/archived/subtask edge cases and URL restoration.

## 13. Phase 10 — Durable jobs and integration health

### Tasks

- [x] Implement database-backed job enqueue/deduplication, claim leases, bounded batches, retries, next-attempt times, and terminal failure state.
- [x] Ensure external calls occur outside open domain transactions. Store enough state to resume after process failure.
- [x] Run due jobs after app/MCP requests via Next.js `after()` in small time-boxed batches (no cron, no internal cron endpoint), plus per-kind handlers for GitHub sync, file cleanup/deletion, exports, and maintenance. Screens awaiting a job advance it on each refetch or Refresh.
- [x] Make overlapping triggers safe, recover expired leases, and prevent multiple workers processing the same claimed job.
- [x] Configure execution limits from actual hosting limits with safety margins, rather than unlimited batches.
- [x] Add structured logging and owner-visible integration health/retry information without creating an unsolicited task-notification system.
- [x] Add retention cleanup for expired idempotency records, webhook delivery data where appropriate, and temporary export/upload artifacts.

**Exit gate:** process interruption, retry, duplicate enqueue, and overlapping invocation tests pass. No business work relies on an in-memory queue or detached post-response promise.

## 14. Phase 11 — Cloudflare R2 attachments

**Status: application implementation complete (2026-10-29); provider acceptance pending.** See [R2 setup and acceptance](docs/R2.md). No real buckets, credentials or CORS settings were provisioned.

### Tasks

- [ ] Provision isolated private development/preview/production storage and narrowly scoped server credentials.
- [ ] Configure application-origin CORS and the exact signed upload headers.
- [x] Implement upload initiation: authorize target, validate extension/type/declared size, create pending metadata, generate immutable object key.
- [x] Issue ten-minute presigned conditional PUT instructions and upload bytes directly from browser/local agent to R2.
- [x] Implement authenticated idempotent finalization using actual object metadata/content inspection. Enforce the 20,000,000-byte cap and allowed image/PDF/UTF-8 text types.
- [x] Enforce pending → verifying → ready/failed; pending/failed files cannot be downloaded as successful attachments.
- [ ] Prevent URL reuse from replacing verified bytes through the signed conditional write strategy; verify this against real staging R2 behavior.
- [x] Implement authorized five-minute GET links and safe filename/content disposition; keep the bucket nonpublic.
- [x] Build progress/retry/failure/removal UI, task/project/section placement, and links from notes.
- [x] Implement expired-pending cleanup after upload expiry, failed-object cleanup, and durable deletion on permanent removal.

The conditional-write strategy is implemented and tests assert that `content-type` and `if-none-match` are signed. The combined implementation/live-verification checkbox remains open until actual staging R2 overwrite tests pass.

### Verification

- [ ] Authorized desktop/mobile uploads work; agent upload instructions work without binary MCP content.
- [ ] Oversize/wrong-format objects, missing objects, unauthorized targets, expired URLs, and overwritten-object attempts are handled safely.
- [ ] Temporary oversized bytes are rejected/cleaned at finalization; do not claim the presigned PUT imposes an S3 POST size policy.

**Local evidence:** 109 unit tests pass; 55 disposable PostgreSQL integration tests passed before two audit cases were added (the updated integration suite awaits an available test database); typecheck, lint and Webpack production build pass. The attachment suite covers grants/scopes, initiation retries, finalization, invalid/missing/oversized files, transient failures, stale verifiers, deletion races and cleanup. Desktop/mobile fixture checks cover display, retry verification, note picker and removal confirmation. Live transfers, CORS, expired signed URLs and conditional overwrite behavior remain unverified.

**Exit gate:** ready attachment metadata agrees with actual private bytes; download access and cleanup are demonstrably correct.

## 15. Phase 12 — GitHub installation, import, and refresh

**Status: Application code implemented (2026-10-30); acceptance pending.** See [GitHub setup and acceptance](docs/GITHUB.md).

### Tasks

- [ ] Register/configure the separate GitHub App with only agreed read permissions and selected repository access.
- [x] Implement owner-only installation/repository connection for personal and authorized organization accounts; handle organization approval restrictions.
- [x] Persist installation/repository stable IDs, installation status, and project associations; keep login OAuth credentials separate.
- [x] Implement paginated issue browsing, excluding pull requests from the issue feed.
- [x] Implement explicit issue import with selected section/status, supported Markdown conversion, snapshot semantics, and independent provenance unique per project/issue.
- [x] Preserve provenance after unlink/archive; permanent task deletion frees the mapping for a deliberate fresh import/reference.
- [x] Implement task issue/PR links, read models, head-SHA check/status summaries, and lost-access/deleted-item states.
- [x] Implement signed webhook receipt, delivery-ID deduplication, durable enqueue, and prompt acknowledgement.
- [x] Implement reconciliation shared by webhooks, stale-on-read refresh, and manual Refresh, with conditional requests, stale-result protection, bounded per-installation requests, backoff, and rate-limit header handling.
- [x] Put refresh-if-stale (older than 60 seconds) in the shared service so page loads, refetches and MCP reads all trigger it. No polling by default: screens refetch on load, navigation and tab focus (TanStack Query defaults), plus manual Refresh. A slow `refetchInterval` may be added later to specific screens if live watching proves necessary. Query import candidates on demand instead of scanning all account issues.
- [x] Add Last refreshed/Refreshing/Stale/Connection unavailable UI. Refresh requests coalesce and cannot bypass GitHub limits.

**Exit gate:** personal/organization staging repositories import/link correctly; a missed webhook is repaired by the next stale read; provider failure retains usable local data; duplicate imports and stale overwrites fail.

## 16. Phase 13 — GitHub automation

**Status: Application code implemented (2026-10-30); acceptance pending.** See [GitHub setup and acceptance](docs/GITHUB.md).

### Tasks

- [x] Implement owner-only opt-in rule settings, separate enablement per rule, compatible selected target statuses, and default-disabled behavior.
- [x] On link/rule enable, establish a baseline without replaying historical open/merged events.
- [x] Persist event fingerprints and no-op evaluations so repeated refreshes or returning a task to Ready cannot replay an old event.
- [x] Apply new non-draft PR-open/draft-to-ready events only to Ready → In progress.
- [x] Apply all-linked-PRs-merged only to In progress → In review, with at least one PR, verified data for every PR, and a qualifying merge after baseline.
- [x] Treat draft, closed-unmerged, missing, or unavailable PR states explicitly. Do not auto-Done, regress statuses, or propagate to parent/subtasks.
- [x] Recheck task revision/status within the transition transaction; record system attribution and avoid duplicated activity.

**Verification pending:** PostgreSQL integration cases cover replay, races, multiple PRs and custom targets, but this session could not access the local PostgreSQL/Docker socket. Unit checks pass; staging acceptance is open.

**Exit gate:** replay/race/multiple-PR/custom-status tests pass; linking an old PR has no surprise status effect.

## 17. Phase 14 — MCP implementation and client setup

### Tasks

- [ ] Expose stateless Streamable HTTP at /api/mcp using compatible SDK/handler versions.
- [ ] Authenticate explicit bearer keys and create the restricted actor on each request; do not accept an owner session as an agent shortcut.
- [ ] Register every tool in MCP-API.md with bounded schemas, clear descriptions, stable result fields, pagination, and expected revisions.
- [ ] Route tools directly to existing services; no duplicate authorization, graph, completion, upload, or automation rules.
- [ ] Implement structured conflict/decision_required/rate-limit/integration errors, safe missing-target responses, and idempotency behavior.
- [ ] Ensure all indirect mutations enforce scopes: Done through create/update/bulk/status paths requires complete; archive through subtree changes requires archive; owner-only actions remain unavailable.
- [ ] Support attachment initiation/finalization/download instructions, note append, GitHub browsing/import/linking/refresh, search, and activity.
- [ ] Add owner key settings copy/configuration examples for Codex and Claude Code with environment-backed secrets and the real deployment URL supplied only in user configuration.
- [ ] Validate discovery and representative calls from both clients in staging; do not advertise OAuth metadata or legacy SSE that is not implemented.
- [ ] Document key rotation, revocation, expiry, grant changes, tool limits, and retry guidance.

### Real-client acceptance

- [ ] Read a granted project and identify Ready work.
- [ ] Read task/section/parent context and create/update a task or subtask.
- [ ] Append a note, upload an attachment directly, and link a PR.
- [ ] Send work In review; deny Done without completion permission.
- [ ] Deny another project, owner-only management, and permanent deletion.
- [ ] Revoke the key and observe failure on the next call.

**Exit gate:** both required clients pass the agreed scenario against shared production-shaped services, including permission denials and decision-required retries.

## 18. Phase 15 — Exports, backups, and restoration

### Tasks

- [ ] Implement owner-only asynchronous exports: versioned structured JSON (including property definitions, options and values), canonical note JSON, Markdown notes, relationship IDs/task references, and attachment manifest.
- [ ] Exclude sessions, API keys, OAuth/provider tokens, private app keys, and operational secrets.
- [ ] Generate exports as bounded durable work; store privately, provide authorized download, and expire after the proposed 24 hours.
- [ ] Configure/verify Neon seven-day history on the actual paid environment.
- [ ] Configure the separate-provider encrypted backup destination, independent credentials, nonpublic access, and 30-day retention.
- [ ] Implement a twice-daily backup runner with compatible pg_dump tooling/unpooled access and incremental copying of ready R2 objects.
- [ ] Build snapshot manifests and verify every referenced immutable attachment has a recoverable backup copy before marking a backup complete.
- [ ] Retain source-deleted bytes for the recovery window and explain this in permanent-deletion UI.
- [ ] Monitor the last fully recoverable backup age, backup failures, and approaching/breached 24-hour RPO. Test the owner alert path.
- [ ] Write and execute an isolated restore runbook: database, matching attachment bytes, configuration, object-key references, credential rotation, and post-restore checks.
- [ ] Exercise a documented export recovery script; do not add a V1 import UI.
- [ ] Record measured recovery time, a launch restore result, and a quarterly restore-drill schedule in operations documentation.

**Exit gate:** a complete isolated restore demonstrably recovers projects, trees, dependencies, notes/revisions, task references, and private files. A scheduled backup alone is insufficient evidence.

## 19. Phase 16 — Hardening and release

### Accessibility and interaction

- [ ] Verify keyboard-only principal flows, visible focus, dialog focus management, screen-reader labels/status announcements, reduced motion, text zoom, and light/dark contrast.
- [ ] Verify mobile touch targets, menus replacing required dragging, uploads, note editing, status changes, and long-title layouts.
- [ ] Check that browser Back/deep links preserve context, filters, and list scroll; no shortcut captures ordinary typing.

### Performance and reliability

- [ ] Test the agreed representative dataset: 50 projects, 10,000 tasks, 50,000 activity records.
- [ ] Measure warm indexed list/search p95 against the target below 500 ms server time, excluding provider APIs; record cold-start behavior separately.
- [ ] Inspect slow-query plans and remove N+1/full-note-fetch patterns before adding caching infrastructure.
- [ ] Test provider timeouts, rate limits, database contention, job interruption, retry exhaustion, and stale-write races.
- [ ] Verify logs and alerts contain actionable request/job IDs without secrets or note contents.

### Release

- [ ] Apply reviewed backward-compatible production migrations before compatible code deploys; never run destructive schema push on app startup.
- [ ] Verify preview/production resources, app callbacks, GitHub installations, R2 origins, and secrets are isolated.
- [ ] Run typecheck, lint, targeted automated tests, production build, full critical E2E flows, and both MCP acceptance scenarios.
- [ ] Deploy and smoke-test owner login, task mutation, notes, file upload/download, GitHub freshness, after-request job processing, and exports.
- [ ] Verify backup age/restore evidence and operational alert destination before declaring launch complete.
- [ ] Record code rollback compatibility and forward-fix procedures; rehearse a safe application rollback in staging.
- [ ] Complete the launch checklist in DELIVERY.md and update the planning index with actual runbooks/setup references.

**Exit gate:** all agreed V1 capabilities are usable, required checks pass, and there is no known authorization bypass, destructive data-loss bug, broken required MCP client, or unverified complete recovery path.

## 20. Suggested reviewable implementation slices

Use small coherent changes; this is a sequencing suggestion, not a requirement to create a remote PR for every row.

| Slice | Review focus |
| --- | --- |
| Foundation + CI | Reproducibility, environment boundaries |
| Auth schema + owner login | Closed registration, secure sessions |
| Actors + credentials | Scope/grant denial paths, secret handling |
| Service primitives | Atomicity, revisions, attribution, retries |
| Projects + sections + workflows | Tree rules, status customization |
| Tasks + subtasks | Location, references, completion choices |
| Dependencies + archive/delete | Concurrent graph safety and preservation |
| Shell + core screens | End-to-end usability and vocabulary |
| Notes | Safe editing, conflict/history recovery |
| Search + boards | Consistent scoped queries and ordering |
| Jobs + R2 | Durable external work and actual-byte validation |
| GitHub read/import/sync | Provenance, rate limits, freshness |
| GitHub automation | Baselines, replay safety, state races |
| MCP | Shared services and real-client behavior |
| Export + recovery | Secret exclusion and full restore evidence |
| Release hardening | Accessibility, measured performance, operations |

## 21. Progress tracking and completion evidence

At the end of each phase, record:

1. Completed checklist items and relevant files/migrations.
2. Tests/checks run and their actual results.
3. Screens or client flows manually exercised where relevant.
4. Outstanding defects and blocked external configuration.
5. Any proposed deviation, with the corresponding specification/decision update before implementing it.

Do not mark an integration complete based only on mocks, or recovery complete based only on a timer. Capture actual staging provider/client/restore evidence for their acceptance gates. Do not invent dates or effort estimates before implementation capacity and provider setup are known.

## 22. Definition of complete V1

- [ ] Personal GitHub login is closed to other users.
- [ ] Projects, nested sections, tasks/subtasks, workflows, labels, custom properties, priorities, dates, dependencies, blocking, archive/restore, and safe owner deletion work.
- [ ] Planning future features and finding/executing next work are usable in the agreed responsive interface.
- [ ] Notes save safely, recover interrupted drafts, and retain/restore 20 saved revisions.
- [ ] Private R2 files work from browser and agents with verified upload limits and authorized downloads.
- [ ] Personal/organization GitHub repositories link/import safely; tracked state refreshes while viewed and manually; opt-in rules are replay-safe.
- [ ] Codex and Claude Code use scoped, expiring, revocable keys and cannot exceed their grants.
- [ ] Search/filter/list/board behavior is consistent across UI/API/MCP, without archived or unauthorized data leakage.
- [ ] Owner exports are usable and secret-free; database-plus-files recovery is tested against the agreed retention/RPO target.
- [ ] Automated checks, real integration/client tests, accessibility review, performance measurements, production smoke test, and operations handoff are complete.
