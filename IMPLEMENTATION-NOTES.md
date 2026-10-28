# Implementation notes

## Phase 0 leftovers — 2026-10-29

The implementation request confirms the governing specification/defaults for this work. Inspected the existing workspace and preserved the planning/design files in place; there was no repository or applicable local AGENTS.md. Added `.gitignore`, pinned the local Node 26.9.0/pnpm 12.6.0 toolchain and compatible stable dependencies, and documented selections in `docs/TOOLING.md`. Added `.env.example` and `docs/ENVIRONMENT.md` covering server-only/browser-safe settings and outstanding deployment inputs.

**Blocked:** `git init -b main` failed with `.git: Operation not permitted`. The active workspace permits reading but not writing `.git`, and escalation is unavailable. No repository, branch, remote, or commit was created. The requested initial `Planning package` commit and final `Phase 1: Scaffold application and checks` commit therefore remain outstanding. Source-control task remains unticked; repository permissions must change before either commit can be made.

## Phase 1 — Application foundation — 2026-10-29

Built the root Next.js App Router scaffold with strict TypeScript, Tailwind 4, shadcn preset `bcivVQBO` (Radix Nova), initial zinc/derived tokens, local IBM Plex fonts, ESM and `@/*` aliases. Established the documented source directories without feature implementations. Installed the supplied favicon/app/manifest/OG assets and a verbatim-path `currentColor` Logo component; app name and theme are Zenshin / #18181B. Added error/loading/global-error boundaries, Node startup environment validation and safe request-ID/error logging.

Added pinned, cached CI configuration and typecheck/lint/build/unit-test scripts. Wrote Vitest tests for configuration, log redaction, database URL isolation and brand preservation, plus fresh environment fixtures and an integration-project guard. `docs/TESTING.md` documents isolated local PostgreSQL databases and Phase 2 provisioning/cleanup responsibilities. Migration command names exist but deliberately fail without database access until Phase 2 implements Drizzle/schema/migrations; they remain explicitly proposed. No database/auth/editor/provider/MCP packages were installed ahead of their slices.

Decisions: selected ESLint 9.39.5 and TypeScript 6.0.3 because current Next ESLint plugin peers exclude the newest majors; peer dependencies resolve without overrides. Fonts are served locally from Fontsource. Only Phase 1 app origin/environment are mandatory now; provider settings become mandatory in their slices. Canonical metadata resolves at request time so builds do not require deployment settings or secrets. Next's current `retry` boundary API is used.

Checks actually run: production build, typecheck and lint passed; final build had no warnings. No unit/integration tests, plan Verification checklist, provider smoke checks, database commands, deployment or CI run was performed. Verification remains deferred by instruction and all Verification boxes remain unticked.

Outstanding inputs: immutable owner GitHub ID, OAuth/App registrations, provider accounts/credentials, regions, domain registration, independent backup destination/runner and operational alert destinations. None blocks this scaffold. No governing-document conflict was found. Phase 1 code/tasks are complete; source-control completion remains blocked as above.
