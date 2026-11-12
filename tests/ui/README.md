# Isolated Phase 7 component preview

Run `pnpm exec vite --config tests/ui/vite.config.ts` and open the printed loopback URL. This mounts the actual workspace, task views and settings components with in-memory fixtures and Next navigation shims. All fetches are intercepted inside this preview; it never connects to PostgreSQL or performs real sign-in. It adds no production route or authentication bypass. Reloading resets fixtures.

Use it for layout, keyboard, focus, create/edit, property editing and decision-dialog checks. The mock validates request bodies with the production Zod contracts but is deliberately not a second domain service: it simulates a few interactions and does not prove hierarchy, deletion, authorization, provider behavior or transaction correctness. Those still require the isolated integration suites.

Responsive checks performed: desktop 1440×900 (inline 560px task panel), normal-width overlay, mobile 390×844 (navigation drawer and full-screen task details). Browser interactions exercised task editing, custom property creation/editing, parent completion decisions, task close/focus restoration and project navigation.

Phase 11 adds synthetic ready/pending/failed attachment rows on the first task, note data and a ready-file link picker. Retry verification and removal mutate only in-memory fixtures; this preview never uploads/downloads real storage bytes and does not prove CORS, signature validation or provider behavior. Mobile filename/action wrapping, verification feedback, note selection and removal confirmation are covered by fixture interactions.

Phases 12–13 add synthetic connected-repository, installation, issue-browser and current-head PR/check rows. They let the real settings/task components render without contacting GitHub. GitHub commands only acknowledge fixture requests; they do not prove imports, automation or refresh. Browser QA for this addition remains pending in the restricted session.

Phase 16 adds `pnpm ui:preview`, a writable test-output cache, rebased local font URLs, the actual search page and `acceptance.js`. With an approved installed `playwright-cli`, open the fixture URL and run `playwright-cli run-code --filename=tests/ui/acceptance.js`. The script checks editor/heading/focus, search Back text and mobile navigation/close/overflow; it requires the fixture marker before any interaction. Current execution is pending: this session denies localhost listening even after escalation, and the CLI/package registry is unavailable. Earlier responsive evidence above does not verify these new changes. See [release acceptance](../../docs/RELEASE.md) for remaining screen-reader, contrast, zoom, real scroll and provider checks.


## UI audit remediation — 1 November 2026

`acceptance.js` now also covers settings breakpoint boundaries (639, 640, 700, 767 and 768px), URL/history and preference drafts, an in-memory fake credential reveal across settings dismissal, the modifier-based create shortcut, task draft recovery, delayed property-save lockout, mobile filter placement and the selected-day calendar agenda. The credential string is a deliberately fake preview value; the fixture makes no real access grants.

The CLI acceptance script has **not been executed** in this session: the local server cannot bind its loopback port and `playwright-cli` is unavailable. These additions describe executable checks, not a passing browser-test result.

A fresh temporary offline build did render successfully in Chrome during implementation. Only that temporary build replaces authentication with a fixture stub and maps preview navigation to a URL fragment; none of those changes enters application source. Manual checks confirmed desktop filter placement and Escape focus return, task title draft recovery after closing/reopening, readable settings at 700px, contained filters with reachable footer controls at 390px, and readable selected-day calendar cards at 390px. This evidence does not verify real Next.js history, authentication, storage providers, screen readers, real-device touch, the full breakpoint matrix or every error/retry path.

See [remediation status](../../docs/UI-UX-REMEDIATION-2026-11-01.md) for all 28 findings, implementation locations, unit/build verification and remaining runtime checks.
