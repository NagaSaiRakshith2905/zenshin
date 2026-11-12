# Zenshin

Status (2026-10-31): Phases 0–9 have recorded local verification. Application code through Phase 15 (including MCP and owner exports) and independent backup/recovery tooling are implemented on main; outstanding migration application, database/browser checks, provider setup, live-client acceptance and a full restore drill remain open. Phase 16 is in progress with interaction/performance fixes and repeatable checks; measured performance and release acceptance remain open. See the [phase status list](implementation-plan.md#2-execution-sequence-and-dependencies), [MCP setup](docs/MCP.md), [Recovery runbook](docs/RECOVERY.md) and [implementation notes](IMPLEMENTATION-NOTES.md).

Start with [the product specification](docs/SPECIFICATION.md). It connects the accepted decisions to implementation and acceptance criteria.

| Document | Purpose |
| --- | --- |
| [Glossary](GLOSSARY.md) | Canonical product vocabulary. |
| [Decision record](DECISIONS.md) | Choices accepted during the interview. |
| [Product specification and flows](docs/SPECIFICATION.md) | Scope, rules, screens, edge cases, implementation defaults. |
| [Schema](docs/SCHEMA.md) | Entities, fields, relations, constraints, indexes, and concurrency. |
| [Architecture](docs/ARCHITECTURE.md) | Authentication, shared services, hosting, GitHub, R2, exports, recovery. |
| [MCP and API contract](docs/MCP-API.md) | Agent tools, permissions, errors, retries, compatibility. |
| [Design direction](docs/DESIGN.md) | Navigation, layouts, tokens, interaction, accessibility. |
| [Release hardening and rollback](docs/RELEASE.md) | Local/performance checks, browser acceptance, release evidence and rollback/forward-fix procedure. |
| [Delivery and verification](docs/DELIVERY.md) | Build order, acceptance gates, launch operations. |
| [Detailed implementation plan](implementation-plan.md) | Phase-by-phase tasks, dependencies, target artifacts, verification, and completion gates. |

The decision record is authoritative for accepted product scope. The glossary is authoritative for terminology. The specification gives deterministic interpretations of those decisions. Explicit implementation defaults are proposals included in the final review, not claims that the user separately selected each technical detail.

Deployment account IDs, credentials, regions and provider provisioning remain inputs to later phases. They do not reopen product architecture decisions. The product name is Zenshin, the preferred domain is zenshin.app (registration pending), and compatible package versions are now pinned and recorded in [TOOLING.md](docs/TOOLING.md).

## Local development

Use Node `26.9.0` from `.nvmrc` and pnpm `12.6.0` from `packageManager`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Before starting the server, fill the application/database and Phase 3 auth settings in the ignored `.env.local`. `OWNER_GITHUB_ID` must be the owner's immutable positive numeric GitHub ID. Register `http://localhost:3000/api/auth/callback/github` in the separate login OAuth app. Run `pnpm db:migrate` against the intended isolated application database using its unpooled `DATABASE_MIGRATION_URL` before the first `pnpm dev`; otherwise sign-in fails because the auth tables do not exist. The app runs at `http://localhost:3000` and redirects unauthenticated visitors to GitHub sign-in. The existing `docs/` and `design/` folders remain in place.

See [selected versions](docs/TOOLING.md), [environment reference](docs/ENVIRONMENT.md), [database commands](docs/DATABASE.md), and [commands/test isolation](docs/TESTING.md). The application uses ESM, strict TypeScript, the `@/*` → `src/*` alias and the documented source layout. Runtime configuration is validated at Node server startup; production builds need no provider secrets. Production launch still requires the remaining phases and delivery gates.

`pnpm typecheck`, `pnpm lint` and `pnpm build` catch implementation mistakes. The database-free unit suite runs locally; isolated database and provider checks require their respective test environments. Auth/Drizzle generation works offline; the migration runner requires an explicit `DATABASE_MIGRATION_URL` and never runs at startup.

Domain services, HTTP adapters and the planning/task UI are implemented; see [domain service usage](docs/DOMAIN-SERVICES.md) and [workspace UI notes](docs/WORKSPACE-UI.md). Provider setup and acceptance are tracked in [R2 setup](docs/R2.md) and [GitHub setup](docs/GITHUB.md). The latest 141 unit tests, typecheck and lint pass; the Webpack production build passes from a temporary source copy. The new GitHub PostgreSQL scenarios and browser checks remain pending because local access was blocked; real sign-in and live provider acceptance are also pending.
