# Phase 16 hardening and release

Status (2026-10-31): local implementation in progress; release is **not accepted**. Interaction fixes, batched task-page hydration, bounded search headlines, regression scenarios and a local performance runner are implemented. Database execution, current browser QA, measured regional performance, provider/client acceptance, recovery evidence and deployment remain open. No staging environment exists.

## Repeatable local checks

Run typecheck, lint, unit tests, the recovery self-check and a production build using the pinned toolchain in `package.json`. Run `pnpm test:integration` with `NODE_ENV=test`, `APP_ENV=development` and an isolated local `TEST_DATABASE_URL` named `zenshin_test_*`. The harness creates, migrates and drops a separate random database; it never migrates the application database. Keep credentials in your environment.

`TEST_DATABASE_URL` set in your environment, run:

```sh
pnpm perf:check
```

This uses the same guarded disposable-database harness, seeds 50 projects / 10,000 tasks / 50,000 activities, runs ANALYZE and takes 20 warm samples each for global/project lists, My Work, note search and text-property search. It checks the global page spans all 50 projects with no more than 12 read statements. It records p50/p95, first measured call, read counts and EXPLAIN ANALYZE/BUFFERS JSON for the actual parameterized queries in `test-results/performance.json`. Exit is nonzero for a warm p95 >=500 ms, fixture mismatch or failed setup. No environment files or provider APIs are loaded. Query-plan reports contain only synthetic fixture data; connection strings and parameter values are omitted.

First measured call follows fixture loading and is **not a deployment cold-start measurement**. A local pass does not establish deployed-region latency. Record preview first-request latency and warm server timings separately, with region, commit, dataset, sample count and provider time excluded. Inspect query plans for scans/materialization, row counts, buffer reads and time spent in ranking/counts. The current implementation still computes ordered counts per request and reads child/prerequisite context needed for graph rules; the benchmark must establish whether further work is needed.

The Application checks workflow can be dispatched manually with `performance=true` to run this benchmark against its isolated PostgreSQL service after integration tests. Its report and plans are printed to the job log, including on a threshold failure. Attach that log/report and commit SHA to release evidence. Normal push/PR checks keep their existing scope.

## Interaction acceptance

```sh
pnpm ui:preview
# In another terminal, with playwright-cli installed:
playwright-cli open http://127.0.0.1:5173
playwright-cli run-code --filename=tests/ui/acceptance.js
playwright-cli close
```

The script refuses a page without the isolated preview marker. It checks filter focus/return, title heading semantics and Space activation, editor shortcut isolation, Escape/close focus, touch-accessible search close, Back/query text, mobile navigation and horizontal overflow. These use the real components with synthetic API responses. They do not prove Next.js scroll restoration, authentication, transactions or providers.

Before acceptance, also exercise the signed-in preview at desktop, 390px and 320px widths, 200% text zoom, light/dark themes and reduced motion. Use keyboard only through capture, filters, task properties, menus, dependencies, completion decisions, note editing and settings. Verify focus returns to the initiating control after dialogs, errors announce status and no single-character shortcut fires in editable/composing input. Check contrast and principal flows with an actual screen reader. Change board status through the task property picker without dragging. Check long titles/filenames, note conflict recovery and actual upload/download on touch devices. Record browser/OS, results and defects; the fixture script alone does not close this gate.

## Reliability evidence

The existing job, GitHub, attachment, note, export and work-service suites cover provider failures/rate-limit deferrals, retries/exhaustion, lease interruption/fencing, stale revisions and transactional contention. Run **all** integration suites, then rehearse real provider timeouts/access loss and after-request draining in preview. Correlate failures using request/job IDs; inspect logs and error monitoring for credentials, provider bodies and note contents. Verify cached/local work remains available and the operator sees actionable freshness/error state. A unit-test pass alone does not establish these operational properties.

## Deployment, rollback and forward fix

1. Record the candidate and last verified deployment SHAs, migration journal and review evidence. Phase 16 adds no migration; its read/UI changes use the same schema and stored values as `9487a9e`. That is a code compatibility observation, not a staging rollback rehearsal. Phase 15 migration `0008_export_snapshot.sql` still needs application before export code runs against a real environment.
2. Verify preview/production isolation using [Environment](ENVIRONMENT.md), [GitHub](GITHUB.md), [R2](R2.md), [MCP](MCP.md) and [Recovery](RECOVERY.md). Verify OAuth callbacks, immutable owner identity, separate installations/buckets/credentials, allowed origins and operational alert destinations. Never copy production secrets or user data into fixtures.
3. Apply reviewed compatible additive migrations through the migration runner before deploying compatible code. Do not run destructive schema push at startup. Confirm the rollback version can read post-migration rows and continue every pending job kind/payload. If it cannot, prepare a forward fix instead of rolling back blindly.
4. Run local/CI checks and the full [delivery acceptance flows](DELIVERY.md#end-to-end-acceptance-flows), including both required real MCP clients. Deploy preview and record first-request and warm timings. Rehearse a safe code rollback and forward redeploy with representative pending jobs; verify no duplicate side effects, lost writes or stale workers overwriting current work.
5. With the release approved and configured, deploy production and smoke-test owner sign-in, scoped-key denial, task mutation, notes, private upload/download, GitHub freshness, after-request job processing and owner exports. Verify request/job correlation and alerts. Record evidence and timestamp per flow.
6. If smoke fails, select the last verified schema/job-compatible application deployment in the hosting provider and repeat the smoke checks. Preserve the database and file objects. If compatibility is uncertain, deploy a reviewed forward fix; retain request/job IDs and minimize further changes while investigating. Do not reverse migrations or restore an old database merely to undo a code deployment.
7. Use the isolated full database-plus-files recovery procedure only for a recovery incident or drill. Require complete backup age <=24 hours, verified retained file versions, seven-day Neon history, working alerts and measured restore evidence before launch. A portable export extraction self-check is not full recovery evidence.

Release stays open until every configuration/check in [Delivery](DELIVERY.md#launch-configuration-checklist) has an owner, timestamp and evidence. Record defects and unverified gates explicitly; do not infer acceptance from implemented code or installed client versions.
