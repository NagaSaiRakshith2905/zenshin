# Zenshin

Status: Phases 1–3 are built: application foundation, database model, owner authentication, scoped agent credentials and preference settings. Remaining features and all runtime verification are deferred to later phases. Source-control work is handled by the orchestrator; see [implementation notes](IMPLEMENTATION-NOTES.md).

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

Before starting the server, fill the application/database and Phase 3 auth settings in the ignored `.env.local`. `OWNER_GITHUB_ID` must be the owner's immutable positive numeric GitHub ID. Register `http://localhost:3000/api/auth/callback/github` in the separate login OAuth app. Runtime also needs the migrations applied to the intended isolated application database; migration application has not been performed during implementation. The app runs at `http://localhost:3000` and redirects unauthenticated visitors to GitHub sign-in. The existing `docs/` and `design/` folders remain in place.

See [selected versions](docs/TOOLING.md), [environment reference](docs/ENVIRONMENT.md), [database commands](docs/DATABASE.md), and [commands/test isolation](docs/TESTING.md). The application uses ESM, strict TypeScript, the `@/*` → `src/*` alias and the documented source layout. Runtime configuration is validated at Node server startup; production builds need no provider secrets. Production launch still requires the remaining phases and delivery gates.

`pnpm typecheck`, `pnpm lint` and `pnpm build` catch implementation mistakes. Tests, migration application, provider checks and plan Verification checklists remain deferred by instruction. Auth/Drizzle generation works offline; the migration runner requires an explicit `DATABASE_MIGRATION_URL` and never runs at startup.

Phases 4–6 domain services and HTTP adapters are implemented, pending verification. See [domain service usage and routes](docs/DOMAIN-SERVICES.md). The core planning/task website UI follows in Phase 7. No checks were run for these phases by request.
