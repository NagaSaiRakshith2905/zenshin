# Core domain services (phases 4–6)

Implemented source, pending verification. No database schema change is required for these phases.

`src/server/services/work` owns domain behavior. `createWorkService(db).execute(actor, command, input, requestId, idempotencyKey?)` validates the command before opening a transaction. Actors must come from server authentication. `createWorkReader(db)` exposes scoped `list`, `get` and task-reference resolution. Future MCP adapters should call these services.

All existing-project mutations acquire the project's PostgreSQL row lock before reading the graph or changing structure. This serializes counters, hierarchy/dependency edits, configuration limits, deletion and revisions across browser and agent requests. Revision failures include authorized current data. Successful operations commit activity, related changes, cleanup jobs and an optional actor-bound retry receipt in the same transaction. Idempotency keys expire after 24 hours; changed normalized input returns `idempotency_conflict`. Replays recheck permissions; deletion receipts survive cascading target deletion. Project creation uses an owner advisory lock. No provider calls happen inside these transactions.

Read models use repeatable-read transactions and bounded responses (50 default, 100 maximum). They return task references, category, effective archive, overdue status in the owner's timezone, advisory blockers, labels/properties and breadcrumb context; project/section/parent progress counts leaf tasks and unresolved parents separately. Structural writes and computed reads currently load a project's graph without note bodies. Performance measurement and any needed SQL aggregate optimization remain deferred to the later performance phase. Global search, advanced filters and property sorting remain Phase 9.

## HTTP surface

`src/app/api/v1/[...work]/route.ts` is a thin adapter. Existing `/settings` and `/auth` routes remain separate. All routes authenticate browser sessions or explicit bearer credentials; browser writes require the canonical origin. Responses are private/no-store with a request ID. Agent scopes never grant owner-only configuration or permanent deletion.

- GET `/api/v1/{projects,sections,tasks,statuses,labels,properties,options,activity}` lists permitted records. All except projects require `projectId`.
- GET `/api/v1/{resource}/{uuid}` reads an item (activity uses its project list).
- POST `/api/v1/{resource}` creates projects, sections, tasks, statuses, labels, properties or options.
- PATCH `/api/v1/{resource}/{uuid}` updates mutable fields with `expectedRevision`.
- POST `/api/v1/sections/{uuid}/move` moves/reorders a section.
- POST `/api/v1/tasks/{uuid}/{move,convert,transition,labels,properties,add-dependency,remove-dependency}` performs explicit revisioned task commands.
- POST `/api/v1/{projects,sections,tasks}/{uuid}/{archive,restore,delete}` performs lifecycle commands.
- POST `/api/v1/{statuses,labels,properties,options}/{uuid}/delete` removes configuration with revision/required confirmation.

Lists accept `cursor`, `limit`, `includeArchived`. Task lists also accept `sectionId`, `includeDescendants` and `sort` (`manual`, `updated`, `due_date`, `priority`). Properties include their ordered options. Boolean query values must be `true` or `false`.

Mutation body:

```json
{
  "input": {
    "expectedRevision": 4,
    "statusId": "<uuid>",
    "completionAction": "complete_all"
  },
  "idempotencyKey": "<unique-request-id>"
}
```

The path supplies the target ID and lifecycle kind. `Idempotency-Key` may supply the retry key instead of the body. Create payloads contain `projectId` except project creation; options contain `definitionId`. Canonical TypeScript/Zod fields and supported commands live in `src/lib/contracts/work.ts`.

`decision_required` commits nothing and returns affected IDs/options or the exact confirmation payload to repeat. Completed ancestors need `reopenCompletedAncestors`; parent Done transitions with unfinished children need `completionAction` (`keep_open` or `complete_all`); archive warnings need `acknowledgeDependentIds`. Parent and subtask dependency edges are rejected, including when a move/conversion would introduce one. Canceled/archived prerequisites remain unresolved; blocking never prevents starting work.

Property/used-option deletion accepts `confirmedAffectedTaskCount`, counting archived work. Configuration deletions bump affected task revisions and record value/label removal activity. Status removal preserves category, remaps tasks and GitHub rule targets, retains every category, and preserves a Backlog default. Permanent deletion requires the selected target's own archive marker, rejects surviving dependents, and requires `confirmation` with `name`, `sectionCount`, `taskCount`, `fileCount`. Attachment object keys are copied into durable `attachment_cleanup` jobs before local cascading deletion. Phase 11 implements provider deletion through `cleanupAttachment` and the durable job runner.

## Deferred checks

The unit suite passes (78 tests in 14 files), including domain contract tests. Typecheck and lint pass after correcting the Drizzle read-only transaction option and fixture owner references. The auth-schema unit assertion now checks the adapter export/column mapping without requiring JavaScript and SQL table names to match. The production build passes with `pnpm exec next build --webpack`; default Turbopack is blocked by this environment’s local worker port restriction, including on the permission retry. The default build script is unchanged. Isolated PostgreSQL integration suites, real sign-in, database migration/application, provider checks, browser acceptance flows and implementation-plan Verification/exit-gate checklists remain deferred. These services are not a production-readiness claim; the application UI is implemented in Phase 7; see WORKSPACE-UI.md.

## Phase 7 read-model additions

GET `/api/v1/my-work` returns permitted active work in non-overlapping Overdue/In progress/In review/Ready groups, with counts and cursor pagination. Task reads include parent references and configured status names. Task lists accept `parentTaskId`; activity lists accept `taskId` within an authorized project. Permanent deletion may first omit `confirmation` to get a transactionally computed `decision_required` impact response; no deletion, cleanup job or retry receipt is committed until the exact confirmation is supplied.
