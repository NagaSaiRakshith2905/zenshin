# Interface and interaction specification

Status: accepted visual direction with proposed implementation tokens. This is an application workspace; no landing page or marketing dashboard is required.

## Principles

Make the next piece of work easy to find. Preserve project/section context while editing. Use rows and hierarchy for work. Wrap groups of rows in a collapsible card-inside-card: a muted outer card holds the header, and a white inner card holds the rows. Board columns use the same treatment, with each task as its own inner card. Prefer readable task titles, stable references, and clear state over decorative metrics.

Mockups: [design/ui-mockups](../design/ui-mockups/README.md).

Use the shared vocabulary exactly: Project, Section, Task, Subtask, Status, Note, Priority, Due date, Target date, Archive, My work. A feature/version remains a section in navigation and forms. Do not label task states differently between browser and MCP.

## Layout

```text
┌──────────────────┬──────────────────────────────────────┐
│ My work          │ Project / Section     Search   New task│
│ Search           ├──────────────────────────────────────┤
│                  │ List  Board     Filters   Sort        │
│ Projects         ├────────────────────────┬─────────────┤
│ ▾ Tracker        │ Task reference / title │ Task detail │
│   Overview       │ Status / priority     │ Description │
│   All tasks      │ Due / labels / links  │ Properties  │
│   ▾ Version 1.0  │                       │ Note        │
│     Auth         │ Grouped task rows     │ Subtasks    │
│     MCP          │                       │ Dependencies│
│                  │                       │ Files / PRs │
│ Settings         │                       │ Activity    │
└──────────────────┴────────────────────────┴─────────────┘
```

- Desktop expanded sidebar: 248 px. Header: 56 px. Content padding: 24 px, reduced to 16 px on small screens.
- Task rows: 40 px default desktop height, growing with wrapped titles rather than clipping essential text. Detail panel: 560 px where space permits; switch to overlay/full-page before compressing the task list unusably.
- Suggested breakpoints: sidebar/panel inline at >=1440 px; panel overlays at 1024–1439 px; collapsible navigation and full-screen task detail below 1024 px. At mobile widths below 768 px, use >=44 px touch controls and simplified row metadata.
- Opening a task updates the URL, supports browser Back, and preserves list filters/scroll position. Provide Open full page for long notes and deep links.
- Nested sections use indentation/disclosure, not increasingly narrow nested cards. Section depth limit is explained when attempting an invalid move.
- Desktop uses the shadcn Sidebar inset variant: the content area is a rounded surface beside the sidebar.
- Each collapsible group header has its chevron at the right edge, and the whole header toggles the group. In lists, a parent task with subtasks shows an expand/collapse chevron at the left of its row. Tasks without subtasks reserve the same space so rows stay aligned. Only the title links to the task, so the chevron can be clicked without opening it.

## Design tokens

The palette is monochrome and neutral. Tokens come from the shadcn preset `bcivVQBO` (Nova style, zinc base and theme, IBM Plex Sans, lucide icons, 0.625rem radius, subtle translucent menus). Apply it with `npx shadcn@latest init --preset bcivVQBO` when scaffolding. Values below are the preset's zinc tokens (oklch), with the overrides noted; validate contrast on real components before launch:

| Token | Light | Dark |
| --- | --- | --- |
| Background | oklch(1 0 0) | oklch(0.141 0.005 285.823) |
| Foreground | oklch(0.141 0.005 285.823) | oklch(0.985 0 0) |
| Primary | oklch(0.21 0.006 285.885) | oklch(0.92 0.004 286.32) |
| Muted / accent | oklch(0.967 0.001 286.375) | oklch(0.274 0.006 286.033) |
| Muted foreground | oklch(0.5 0.016 285.938)\* | oklch(0.72 0.015 286.067)\* |
| Border | oklch(0.92 0.004 286.32) | oklch(1 0 0 / 10%) |
| Sidebar | oklch(0.985 0 0) | oklch(0.17 0.005 285.823)\* |

\* Darkened (light) or brightened (dark) from the preset so small secondary text passes WCAG AA on muted surfaces. The mockups' `ui.css` holds the derived surface tokens for groups, selected rows and menus.

- No brand accent hue. Emphasis comes from the primary (near-black in light, near-white in dark). The only other colour is the dialog ring below.
- Font: self-hosted IBM Plex Sans, weights 400/500/600. IBM Plex Mono for code and references only. Body 14 px/20 px; note body 15 px/24 px; screen title 22 px/30 px; group headings 13 px/18 px. No all-caps metadata styling.
- Spacing scale: 4, 8, 12, 16, 24, 32 px. Radius follows the preset: controls 7–8 px, inner cards 10 px, outer cards and the content surface 14 px, dialogs 20 px.
- Borders communicate containment. Group cards use a 1 px ring plus a faint shadow; stronger shadows are reserved for floating menus and dialogs. No gradient decoration, large metric card grid, or animated page-entry sequence.
- Dialogs (Command, Dialog, AlertDialog, mobile Drawer) have a 4 px translucent ring (`#FFFFFF1A`) over a frosted, blurred surface. A 45% black overlay with an 8 px backdrop blur sits behind them. Menus use the preset's translucent style.
- Status is monochrome: the glyph's shape carries the state, next to a visible label. Backlog dashed circle; Ready empty circle; In progress half-filled; In review three-quarter filled; Done filled; Canceled faint circle. Never convey state through hue.
- A selected row uses a darker background than its outer card, a 3 px primary bar on its left edge, and a semibold title.
- Callouts (Alert) use a subtle border, not a solid dark outline.
- Motion: quick 120–180 ms feedback for menus/panel changes, respecting reduced motion. No spring/gesture dependency for essential actions.

## Screens

### My work

Left-aligned title and New task. Group overdue, in-progress, in-review, and ready work with counts. Show project/reference, title, status, due date, priority, and blocked indicator. Keep blocked work visible. Ready to work is an explicit filter. Future ideas are captured through Backlog or Planned sections, not mixed into a made-up urgency score.

### Project overview

Project title/description, editable note, compact progress, planned/active section list and target dates, repositories with freshness. Actions: New section, New task, Edit project, Archive. Links to All tasks and project settings. Empty state says Create a section or Add your first task.

### Section

Breadcrumb, title/description, lifecycle, target date, calculated progress, and unresolved-parent indicator. Note is available in a Plan area without burying task access. List child sections above/directly beside the task workspace. Toggle Include child sections explicitly; distinguish task scope from note ownership.

### Task detail

Header: reference, editable title, status, overflow actions. Content order: description; compact properties (built-in fields, then custom properties that have a value, then a quiet Add property button whose menu lists unset properties and New property); note; subtasks; dependencies/blocking; attachments; GitHub links/checks; activity. Allow collapsing secondary groups. Show parent breadcrumb for a subtask.

Changing status is a direct menu action, not a large form submission. Parent completion/reopening dialogs name all affected work. Done does not imply PR merged, and PR merged does not imply Done.

### Search

Cmd/Ctrl+K opens global search; keyboard navigation and Enter open results. Group results by project/section/task and show snippets with matched text. Filter controls remain usable outside the command menu for complex queries. Empty results show current filters and a clear reset action.

### Settings

Settings open in a dialog over the current screen, not as a page. The dialog has its own small sidebar with two groups: Workspace (Preferences, Agent credentials, Archived work, Exports, Integration health) and the current project (General, Workflow, Labels, Properties, Repositories & rules). Properties lists definitions with type and option editors. Deleting a property or a used option names the number of affected tasks. Confirmations raised from settings, such as permanent delete, stack as an AlertDialog above it. Owner settings: theme/timezone, project prefix read-only after creation, workflows, label definitions, connected repositories and rules, agent credentials, archived work, exports, and integration health. Key creation presents project grants, preset, optional archive/complete permissions, and expiry. Secret is shown once with a copy action and explicit storage instruction.

## Editing and feedback

- Create dialogs start with only essential fields; task title is required, location/status prefilled from current context. Additional properties remain available.
- Notes autosave after approximately 800 ms idle, with Saving/Saved/Failed/Conflict feedback. Flush before intentional navigation when possible, but preserve local draft if interrupted.
- Show non-destructive optimistic updates only where rollback is clear. Conflicts and bulk transitions wait for authoritative confirmation rather than pretending success.
- Errors name the problem and next action: This task changed elsewhere. Review the latest version. Preserve attempted text and offer compare/retry/discard.
- Empty states are actionable; unavailable integrations do not replace local task content with a full-screen error. Loading skeletons preserve layout; refresh retains cached GitHub data with a freshness label.
- Dragging has menu/keyboard alternatives: Change status, Move to section, Move up/down. Aggregated lists disable ambiguous manual reorder and explain why.
- Deletion confirmation states subtree/file impact, dependency blockers, and backup-retention implication. Archive remains a separate labeled action.

## Accessibility and mobile

Target WCAG 2.2 AA: visible focus, semantic tables/lists/dialogs, accessible names, sufficient contrast, focus trapping/restoration for modal surfaces, and announced async save/error state. Test keyboard-only operation and a screen reader on principal flows.

Mobile supports creation, editing, notes, attachments, filters, and status changes. Board can scroll horizontally but every board action also exists in list/detail menus. Respect safe areas, text zoom, touch sizes, long task titles, and reduced motion. Theme defaults to system and persists an explicit override.

## Frontend implementation choices

Use shadcn/ui primitives as accessible building blocks, initialised from preset `bcivVQBO`. Add the derived tokens (group surfaces, selected row, dialog ring) as extra CSS variables in the project's global stylesheet. Use a client-only rich-text editor with canonical structured JSON and server-side schema/URL validation. Tiptap's Next.js configuration must avoid hydration issues; paid collaboration infrastructure is unnecessary.

Sources: [shadcn Next.js](https://ui.shadcn.com/docs/installation/next), [Tailwind Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Tiptap Next.js](https://tiptap.dev/docs/editor/getting-started/install/nextjs), [Tiptap JSON persistence](https://tiptap.dev/docs/guides/output-json-html).
