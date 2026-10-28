# Zenshin

Status: Phase 1 application foundation is built. Feature implementation and verification remain in later phases. Local Git initialization/commits are blocked by this workspace's `.git` write restriction; see [implementation notes](IMPLEMENTATION-NOTES.md).

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

The placeholder page runs at `http://localhost:3000`. Only `APP_ENV` and `APP_ORIGIN` are required for this phase; provider fields stay empty. The existing `docs/` and `design/` folders remain in place.

See [selected versions](docs/TOOLING.md), [environment reference](docs/ENVIRONMENT.md), and [commands/test isolation](docs/TESTING.md). The scaffold uses ESM, strict TypeScript, the `@/*` → `src/*` alias and the documented source layout. Runtime configuration is validated at Node server startup; production builds need no provider secrets. Do not deploy this scaffold as a usable private workspace before the authentication phase.

`pnpm typecheck`, `pnpm lint` and `pnpm build` catch implementation mistakes. Tests and plan Verification checklists remain deferred by instruction. Migration scripts currently fail explicitly and are proposed until the Phase 2 database slice is implemented.
