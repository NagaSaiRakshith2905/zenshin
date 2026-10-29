# Delivery plan and verification

Status: build plan only. Implementation begins after shared-understanding confirmation.

For the detailed execution checklist, phase dependencies, target artifacts, and completion gates, use [implementation-plan.md](../implementation-plan.md).

## Build sequence

1. Foundation: lock compatible dependencies, scaffold Next.js/TypeScript/shadcn/Tailwind, establish lint/typecheck/build CI, database migrations, environment validation, and separate preview/production resources.
2. Identity: GitHub owner provisioning and closed registration, session protection, owner settings, Better Auth API-key plugin, actors/scopes/project grants, audit attribution.
3. Core domain: projects/prefix counters, sections/tree moves, workflows, tasks/subtasks, labels/custom properties/priorities/dates, dependencies/manual blocking, archive/restore/deletion rules, revisioned transactional services.
4. Working UI: My work, project/section views, list/board/detail routing, filtering/search, ordering, responsive navigation, keyboard controls, light/dark themes.
5. Written context: structured notes, autosave/conflicts/local drafts, 20 revisions, owner restore, safe rendering and search extraction.
6. Files: private R2 upload/finalize/download, format/size checks, pending cleanup, retryable deletion, mobile and agent transfer path.
7. GitHub: selected-repository App installation, links/import/deduplication, cached check state, signed webhooks, minute reconciliation/manual refresh, opt-in safe transitions, unavailable/error states.
8. MCP: expose existing shared services through bounded tools, presets/expiry/revocation UI, client setup examples, Codex and Claude Code compatibility tests. Do not implement business rules a second time here.
9. Recovery and release: exports, seven-day Neon recovery configuration, independent database/files backup, age monitoring, full restore drill, production smoke test and rollback procedure.

Stages are implementation order, not reductions in V1 scope. V1 is complete only when all accepted features pass their gates.

## Meaningful automated checks

### Domain integration tests against PostgreSQL

- Depth-three section trees work; cycles/depth-four moves fail, including concurrent conflicting moves.
- Same-project dependency DAG works; self/cyclic/cross-project/parent-descendant dependencies fail, including concurrent edge writes.
- Subtasks retain references and tracking fields during promotion/demotion/location moves. Invalid second nesting and mismatched locations fail.
- Parent completion choices and completed-ancestor reopening are atomic; canceled subtasks stay canceled.
- Leaf progress excludes canceled/archived work, does not double-count parents, and reports unresolved parents. Empty/all-canceled displays differ.
- Custom status labels do not change category meaning. Removing a populated status requires remap; every category remains available.
- Revisions reject stale writes, including agent-vs-browser races. Idempotent retries do not duplicate tasks, imports, transitions, or note appends.
- Archive visibility follows ancestors; restore preserves independent descendant archives. External dependents block permanent deletion.
- Every task reference is unique under concurrent creation and never reused.

### Authorization and integration tests

- Non-owner sign-in/provisioning attempts fail. No owner browser permissions leak through a bearer API key.
- Read only cannot mutate; Contributor cannot complete/archive without opt-ins, create projects/keys, restore note history, or permanently delete.
- All list/search/count/download/export branches enforce ownership/project grants; revoked/expired keys fail promptly.
- Malformed note nodes/unsafe links and oversized documents fail validation. Local conflict recovery does not overwrite newer server content.
- Pending upload is not downloadable. Wrong actual size/type/ownership fails finalize. Expired/reused uploads cannot replace accepted bytes. Cleanup/deletion retries are safe.
- Webhook signature and delivery deduplication work; minute/manual/webhook reconciliation converges without duplicate activity or stale overwrites.
- Import deduplicates per project and filters PRs out of the issues feed. Missing installation/repository access preserves local task data.
- Unlinking/archiving imported work does not allow duplicate import; permanent deletion allows a deliberate fresh import. Enabling a rule/linking an existing PR establishes a no-transition baseline; returning to Ready does not replay a processed PR event.
- Automation handles multiple PRs, draft/closed-unmerged/unavailable states, custom target statuses, user status races, and disabled rules; never auto-Done.
- Rate-limit/retry handling respects GitHub headers and preserves cached data.
- Exports omit authentication secrets, include relationship IDs and note representations, and expire as configured.

Use mocked external APIs for deterministic failure cases plus a staging smoke test for real GitHub/R2 integrations. Do not run destructive integration cases against production.

## End-to-end acceptance flows

1. Owner logs in, creates a project/sections, captures a future feature, adds root tasks/subtasks, labels/prioritizes/dates them, adds a custom property from the task panel and filters by it, and finds work using filters/search.
2. Owner plans dependencies, sees blocked/overdue behavior in the correct timezone, works via list/board, and completes a parent with an explicit choice.
3. Notes autosave; interruption restores a local draft; stale writes retain attempted text; owner restores one of the last 20 revisions.
4. Browser/mobile uploads an allowed file and downloads it privately. Agent performs the same direct-transfer flow without binary MCP payloads.
5. Personal and organization repositories connect where authorized. Import/link PR/check data refreshes while viewed (stale-on-read) and manually; failure shows freshness rather than data loss.
6. Each required MCP client completes the acceptance scenario in MCP-API.md. Revocation, scoped access, and completion denial are demonstrated.
7. Archive/restore and blocked permanent deletion work through the UI; deletion cleans external files via durable retries.
8. Keyboard-only navigation, mobile touch flows, dark/light themes, zoom, reduced motion, and screen-reader labels work on principal screens.
9. Export is downloadable and contains usable data. Restore a database snapshot plus matching attachment copies into isolated resources and verify task graph, notes, files, and references.

## Performance and reliability targets

Implementation targets to validate, not guarantees claimed before measurement:

- Exercise a representative fixture of 50 projects, 10,000 tasks, and 50,000 activity entries; lists/search remain paginated and do not fetch all notes into memory.
- Warm indexed task-list/search reads target p95 below 500 ms server time in the deployed region, excluding external APIs. UI remains interactive during background sync; measure cold-start behavior separately.
- GitHub reconciliation runs on webhooks, stale-on-read and manual refresh, with freshness/error indicators under rate limits or provider failures.
- Complete recoverable backup age stays <=24 hours. Alerts fire before/at breach; recovery is proven against isolated infrastructure before launch.
- No missing required check, known cross-project data exposure, destructive data-loss bug, or broken required MCP client at launch.

## Launch configuration checklist

- Product name/domain and immutable owner GitHub account ID supplied securely.
- Vercel Pro, Neon paid recovery configuration, private R2 bucket, independent backup destination and runner provisioned.
- Database migrations reviewed/applied; preview credentials and resources isolated.
- OAuth callbacks/owner provisioning tested; public signup closed. GitHub App permissions/installations/webhook secret verified.
- R2 CORS, presigning/conditional upload, file allowlist, cleanup, and download disposition verified.
- After-request job processing verified (no cron); jobs observable and retry bounded. GitHub App access limits documented for organizations.
- Backup encryption, independent credentials, 30-day retention, age alerts, and full restore drill verified. Record measured recovery duration.
- Logs/redaction, error monitoring, integration health, and operational owner alerts configured.
- Typecheck, lint, targeted tests, production build, E2E gates, and production smoke check pass.
- Deploy/forward-fix/rollback procedures documented; no automatic destructive schema push at runtime.

## Explicit unresolved deployment inputs

These do not change the agreed product model: final product name/domain; actual GitHub/cloud identities; provider billing accounts; secret values; physical regions; compatible dependency versions; measured recovery duration. Collect them when implementation/provisioning needs them, never in committed planning documents.
