# Isolated Phase 7 component preview

Run `pnpm exec vite --config tests/ui/vite.config.ts` and open the printed loopback URL. This mounts the actual workspace, task views and settings components with in-memory fixtures and Next navigation shims. All fetches are intercepted inside this preview; it never connects to PostgreSQL or performs real sign-in. It adds no production route or authentication bypass. Reloading resets fixtures.

Use it for layout, keyboard, focus, create/edit, property editing and decision-dialog checks. The mock validates request bodies with the production Zod contracts but is deliberately not a second domain service: it simulates a few interactions and does not prove hierarchy, deletion, authorization, provider behavior or transaction correctness. Those still require the isolated integration suites.

Responsive checks performed: desktop 1440×900 (inline 560px task panel), normal-width overlay, mobile 390×844 (navigation drawer and full-screen task details). Browser interactions exercised task editing, custom property creation/editing, parent completion decisions, task close/focus restoration and project navigation.

Phase 11 adds synthetic ready/pending/failed attachment rows on the first task, note data and a ready-file link picker. Retry verification and removal mutate only in-memory fixtures; this preview never uploads/downloads real storage bytes and does not prove CORS, signature validation or provider behavior. Mobile filename/action wrapping, verification feedback, note selection and removal confirmation are covered by fixture interactions.

Phases 12–13 add synthetic connected-repository, installation, issue-browser and current-head PR/check rows. They let the real settings/task components render without contacting GitHub. GitHub commands only acknowledge fixture requests; they do not prove imports, automation or refresh. Browser QA for this addition remains pending in the restricted session.
