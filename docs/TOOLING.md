# Selected tooling

Selected on 2026-10-29 from stable registry releases and their declared peer dependencies. Exact direct versions are pinned in `package.json`; `pnpm-lock.yaml` locks the complete graph. Node `26.9.0` matches the local runtime and is recorded in `.nvmrc` and `engines`; pnpm `12.6.0` is pinned in `packageManager` and `engines`.

Next.js `16.4.3` and React/React DOM `19.3.1` are the current stable framework pair. ESLint `9.39.5` and TypeScript `6.0.3` are the newest mutually compatible stable majors for the selected Next ESLint plugins: their published peer ranges exclude ESLint 10 and TypeScript 7. The registry marks ESLint 9 deprecated in favor of 10, but the current React/import/accessibility plugins still require 9; no peer override is used. Revisit as upstream support changes.

shadcn CLI `4.23.0` initialized preset `bcivVQBO` using Radix Nova, zinc, lucide and translucent menus. Only Button, Empty and Skeleton are installed. The preset font setup uses local Fontsource CSS/assets rather than a build-time Google Fonts request. This provides the initial global typography; the application shell, preference handling and screens remain Phase 7.

| Dependency | Version | Use |
| --- | --- | --- |
| `@fontsource/ibm-plex-mono` | `5.3.0` | Runtime/build assets |
| `@fontsource/ibm-plex-sans` | `5.3.0` | Runtime/build assets |
| `class-variance-authority` | `0.7.1` | Runtime/build assets |
| `cn` | `0.5.0` | Runtime/build assets |
| `lucide-react` | `1.62.0` | Runtime/build assets |
| `next` | `16.4.3` | Runtime/build assets |
| `radix-ui` | `1.8.1` | Runtime/build assets |
| `react` | `19.3.1` | Runtime/build assets |
| `react-dom` | `19.3.1` | Runtime/build assets |
| `server-only` | `0.0.1` | Runtime/build assets |
| `tw-animate-css` | `1.4.0` | Runtime/build assets |
| `zod` | `4.6.7` | Runtime/build assets |
| `@tailwindcss/postcss` | `4.3.3` | Development/build tooling |
| `@types/node` | `26.6.6` | Development/build tooling |
| `@types/react` | `19.3.0` | Development/build tooling |
| `@types/react-dom` | `19.3.0` | Development/build tooling |
| `eslint` | `9.39.5` | Development/build tooling |
| `eslint-config-next` | `16.4.3` | Development/build tooling |
| `postcss` | `8.5.32` | Development/build tooling |
| `shadcn` | `4.23.0` | Development/build tooling |
| `tailwindcss` | `4.3.3` | Development/build tooling |
| `typescript` | `6.0.3` | Development/build tooling |
| `vite` | `8.3.5` | Development/build tooling |
| `vitest` | `5.0.5` | Development/build tooling |

No pg/Drizzle, Better Auth/API-key, TanStack Query, Tiptap, GitHub/R2, or MCP dependency is installed before its slice begins. Zod is already used for runtime environment/log boundary validation. The auth schema will be generated from the actual selected plugin versions in Phase 2.

pnpm configuration enforces exact saves, engine compatibility and strict peers. The reviewed `unrs-resolver` native-binding postinstall is explicitly allowed. The just-published Node types release is explicitly listed in pnpm’s minimum-release-age exception; all versions remain pinned. There is one package manifest and one lockfile.

CI actions are pinned to full release commit SHAs in `.github/workflows/ci.yml`: checkout 7.0.1, setup-node 7.1.0 and pnpm/action-setup 6.1.0. CI uses `.nvmrc`, the package-manager pin and pnpm store caching. No remote or deployment is configured.

References consulted: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [shadcn Next.js setup](https://ui.shadcn.com/docs/installation/next), [Tailwind Next.js setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [setup-node](https://github.com/actions/setup-node), [checkout](https://github.com/actions/checkout), [pnpm action](https://github.com/pnpm/action-setup). Installed Next.js documentation under `node_modules/next/dist/docs/` was also used for instrumentation, request-time metadata and the `retry` error-boundary prop.
