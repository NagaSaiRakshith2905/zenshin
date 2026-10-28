# Checks and test isolation

Verification is deferred until all build phases are complete, per the implementation instruction. Phase 1 writes test infrastructure and unit tests but does not execute them, database integration suites, provider checks or plan Verification checklists. Typecheck, lint and production build may run to catch implementation mistakes.

| Command | Status |
| --- | --- |
| `pnpm dev`, `pnpm build`, `pnpm start` | Implemented Next.js scripts. Runtime requires the two Phase 1 environment settings; build requires no provider secrets. |
| `pnpm typecheck` | Implemented: generate route types, then strict TypeScript checking. |
| `pnpm lint` | Implemented: ESLint with Next/TypeScript rules, zero warnings. Original design-source files are excluded. |
| `pnpm test`, `pnpm test:watch` | Implemented: Vitest unit project, no database or external credentials. Execution deferred. |
| `pnpm test:integration` | Project/guard configured, no database suites yet; first suites arrive in Phase 2. Execution deferred. |
| `pnpm db:generate`, `pnpm db:migrate` | Proposed until Phase 2 supplies Drizzle schema/tooling/migrations. Current scripts fail explicitly without contacting a database. No schema push command. |

CI installs from the single frozen pnpm lockfile with dependency caching, then runs typecheck, lint, the unit project and production build. The workflow is prepared for future use; it has not been executed or published. It uses no provider secrets and has no deployment/migration step. Add database integration CI only with the Phase 2 database slice.

## Unit tests and fixtures

Vitest runs in Node with `@/` resolving to `src/`. Tests of server-only modules mock only the `server-only` marker; production imports retain the boundary. Each test creates fresh values via `environmentFixture()` and spies are restored between tests. No `.env.local` or provider credentials are loaded. Use deterministic mocked providers when those adapters begin; never run a provider client from an ordinary unit test.

Current tests cover environment failure/redaction, HTTPS/origin validation, request log allowlisting, database safety and exact supplied brand assets/manifest metadata. They are written and typechecked, not yet executed.

## PostgreSQL strategy for Phase 2 onward

Use a disposable local PostgreSQL instance, or a disposable PostgreSQL service in CI, with a test-only role. Production/preview URLs are forbidden. The Phase 1 guard deliberately accepts local hosts only; isolated remote staging/provider checks will have their own explicit runner in their integration phase.

Before importing a driver, `tests/support/integration-setup.ts` validates `TEST_DATABASE_URL`. Use `testDatabaseName()` to allocate a unique `zenshin_test_<UUID>` database per suite/run, provision it using test-only local administration, apply the committed migrations, and close pools/drop that database in `finally`/suite teardown. The target must never match `DATABASE_URL`, `DATABASE_MIGRATION_URL` or `BACKUP_DATABASE_URL`. The test role must have no access to application databases. Do not forward a production database onto localhost.

Phase 2 supplies connection/provisioning/teardown code and domain fixture factories alongside the real schema and pg driver; these are intentionally absent now. Generate isolated owner/project graphs per test and clean them between cases. Transaction rollback alone is insufficient for concurrency tests using separate connections, so run those cases against their own database/fixture graph. Migrations run on the isolated database, never against a production or normal developer database. No auth/plugin tables are invented in this phase.
