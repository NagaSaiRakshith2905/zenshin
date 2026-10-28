# Checks and test isolation

Verification is deferred until all build phases are complete, per the implementation instruction. Phases 1–3 write test infrastructure, unit tests and PostgreSQL suites but do not execute them, provider checks or plan Verification checklists. Typecheck, lint and production build may run to catch implementation mistakes.

| Command | Status |
| --- | --- |
| `pnpm dev`, `pnpm build`, `pnpm start` | Implemented Next.js scripts. Runtime requires application/database/auth settings from ENVIRONMENT.md; build requires no provider secrets. |
| `pnpm typecheck` | Implemented: generate route types, then strict TypeScript checking. |
| `pnpm lint` | Implemented: ESLint with Next/TypeScript rules, zero warnings. Original design-source files are excluded. |
| `pnpm test`, `pnpm test:watch` | Implemented: Vitest unit project, no database or external credentials. Execution deferred. |
| `pnpm test:integration` | Guarded local PostgreSQL provisioning, migration and schema constraint suites implemented. Execution deferred. |
| `pnpm db:generate`, `pnpm db:migrate` | Implemented Drizzle Kit scripts; generation is offline, application requires `DATABASE_MIGRATION_URL`. No schema push command. |
| `pnpm db:auth:generate`, `pnpm db:seed`, `pnpm db:fixture:perf` | Implemented; see [DATABASE.md](DATABASE.md). Both generators ran; migration application and fixture loading did not. |

CI installs from the single frozen pnpm lockfile with dependency caching, then runs typecheck, lint, the unit project and production build. A separate job provisions a disposable PostgreSQL 18.6 service with a test-only administration database and runs the integration project. The workflow is prepared for future use; it has not been executed or published. It uses no provider secrets and never migrates an application/provider database.

## Unit tests and fixtures

Vitest runs in Node with `@/` resolving to `src/`. Tests of server-only modules mock only the `server-only` marker; production imports retain the boundary. Each test creates fresh values via `environmentFixture()` and spies are restored between tests. No `.env.local` or provider credentials are loaded. Use deterministic mocked providers when those adapters begin; never run a provider client from an ordinary unit test.

Current tests cover environment failure/redaction, HTTPS/origin validation, request log allowlisting, database safety and exact supplied brand assets/manifest metadata. They are written and typechecked, not yet executed.

Phase 3 adds unit suites for immutable GitHub identity, browser/key transport separation, strict preference/credential contracts, scope/project/owner denials, fixed public auth-route exposure, current-grant reloads and origin/streamed-body validation. `tests/support/auth.ts` supplies synthetic GitHub token/profile/email responses and OAuth state/cookie roundtrips; unexpected provider fetches fail. `tests/integration/authentication.test.ts` uses an isolated migrated database for first-owner provisioning (including concurrent callbacks), implicit signup denial, renamed-owner sign-in, key hashing/session isolation, presets/grant updates, permission-metadata rejection, default/no expiry, revocation, expired-key history and revision conflicts. Test values are synthetic; no real GitHub account or credential is used. All these tests remain unrun.

## PostgreSQL strategy for Phase 2 onward

Use a disposable local PostgreSQL instance, or a disposable PostgreSQL service in CI, with a test-only role. Production/preview URLs are forbidden. The Phase 1 guard deliberately accepts local hosts only; isolated remote staging/provider checks will have their own explicit runner in their integration phase.

Before importing a driver, `tests/support/integration-setup.ts` validates `TEST_DATABASE_URL`. Use `testDatabaseName()` to allocate a unique `zenshin_test_<UUID>` database per suite/run, provision it using test-only local administration, apply the committed migrations, and close pools/drop that database in `finally`/suite teardown. The target must never match `DATABASE_URL`, `DATABASE_MIGRATION_URL` or `BACKUP_DATABASE_URL`. The test role must have no access to application databases. Do not forward a production database onto localhost.

Phase 2 supplies `tests/support/postgres.ts`: the guarded URL initially points to an existing test-only local administration database (e.g. `zenshin_test_runner`), with a role allowed to create/drop databases on that disposable server. It creates a fresh `zenshin_test_<UUID>` database per suite, migrates it and exposes a pool, typed db, migration runner and `dispose()`. Always dispose in teardown; setup failure also closes/drops its own database. The initial suites exercise cross-project/owner FKs, uniqueness, note/file targets, property values, defaults, provenance, audit/deletion behavior, job leases and migration journal repeatability. Pure unit tests cover deterministic fixture scale/isolation and generated auth model/field mappings. They are written and typechecked, not executed.

Generate isolated owner/project graphs per test and clean them between cases. Transaction rollback alone is insufficient for concurrency tests using separate connections, so run those cases against their own database/fixture graph. Migrations run on the isolated database, never against a production or normal developer database. Future service phases add graph/concurrency behavior tests; SQL alone does not enforce graph/depth rules. See [DATABASE.md](DATABASE.md) for the SQL/service invariant split, fixture loading and forward migration-upgrade strategy.
