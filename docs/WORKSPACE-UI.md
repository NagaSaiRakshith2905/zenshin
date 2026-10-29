# Workspace UI — Phase 7

Phase 7 is implemented against the shared domain API. The real database/sign-in acceptance gate is pending.

## Routes and layout

- `/`: My work, with non-overlapping collapsible Overdue, In progress, In review and Ready groups. Counts are scoped server-side; pagination never silently drops later groups.
- `/projects/[projectId]`: project overview, description, leaf progress, section plan and task list.
- `/projects/[projectId]/tasks`: all project tasks with parent/subtask grouping.
- `/projects/[projectId]/sections/[sectionId]`: section plan, lifecycle, target date, child sections, progress and direct tasks. Include child sections explicitly changes the scope.
- `?task=[uuid]`: task panel over the current list. URL navigation preserves list parameters and scroll; browser Back closes the panel after a row opens it. Close also works on direct links. Focus returns to the originating row.
- `/tasks/[taskId]`: full-page detail for deep links and longer work.

The persistent shell uses the approved 248px sidebar, 56px header and rounded inset content surface. Task details are a 560px inline panel at 1440px and above, a right overlay on intermediate screens and full-screen below 1024px. Navigation has a mobile dialog and desktop collapse toggle. Local IBM Plex fonts, monochrome status shapes and derived zinc surface tokens remain the design foundation. Keyboard C creates a task outside editable controls/dialogs; Escape closes menus and panels. All async mutations wait for the server; stale-write dialogs retain drafts and show the current version before a deliberate retry.

## Editing and settings

Shared dialogs support project/section/task creation and editing, same-project moves, parent/subtask conversion, local reordering, archive/restore and permanent deletion. Completion, ancestor reopening, dependent warnings, replacement statuses and deletion impact use structured domain decisions. Confirmation shows affected names/counts. Retry keys remain stable for the same request and change after a deliberate decision or revision retry.

Task details expose status, priority, due date, labels, custom property values, subtasks, manual blocking, dependencies/reverse dependencies and paginated activity. Properties appear only when set; Add property lists unset definitions and offers New property for the whole project. All seven value types are supported; clearing a value removes it. Task and property editors keep the revision captured when editing began, so background refetches cannot silently rebase unsaved drafts.

Settings remain a dialog over the current screen. Workspace preferences and credentials are retained. Added archived-work navigation and project General, Workflow, Labels and Properties, including definition/option editing and ordering, immutable types/categories and affected-task confirmations. Restore explains when archived ancestors still hide the selected item. Destructive deletion requires an explicit own archive marker as enforced by the services.

Queries retain existing data when refresh fails and provide retries. List endpoints remain paginated with Load more controls, including project/section/configuration pickers. Loading skeletons and actionable empty states cover initial loading and empty projects. No note editor, upload, GitHub sync, search or board control is presented as a completed feature in Phase 7; those remain in their planned later phases.

## Checks and limitations

The unit suite passes: 78 tests in 14 files. Typecheck, lint and `pnpm exec next build --webpack` pass. The default Turbopack build remains subject to the previously recorded sandbox worker-port restriction; the package build script is unchanged.

The isolated preview in `tests/ui/` renders the actual client components using in-memory fetch fixtures and navigation shims. Desktop (1440×900), intermediate overlay and mobile (390×844) layouts were inspected; task editing, property creation/editing, completion choices, project navigation, focus restoration and light/dark appearance were exercised. This is UI evidence, not verification of PostgreSQL transactions or live authentication. No database, migrations, seeds, real sign-in, providers, deployment or production data was used.
