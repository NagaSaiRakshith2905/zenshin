# Isolated Phase 7 component preview

Run `pnpm exec vite --config tests/ui/vite.config.ts` and open the printed loopback URL. This mounts the actual workspace, task views and settings components with in-memory fixtures and Next navigation shims. All fetches are intercepted inside this preview; it never connects to PostgreSQL or performs real sign-in. It adds no production route or authentication bypass. Reloading resets fixtures.

Use it for layout, keyboard, focus, create/edit, property editing and decision-dialog checks. The mock validates request bodies with the production Zod contracts but is deliberately not a second domain service: it simulates a few interactions and does not prove hierarchy, deletion, authorization, provider behavior or transaction correctness. Those still require the isolated integration suites.

Responsive checks performed: desktop 1440×900 (inline 560px task panel), normal-width overlay, mobile 390×844 (navigation drawer and full-screen task details). Browser interactions exercised task editing, custom property creation/editing, parent completion decisions, task close/focus restoration and project navigation.
