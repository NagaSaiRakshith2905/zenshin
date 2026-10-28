# Agreed product decisions

This is the consolidated planning record, not authorization to begin implementation. Headings preserve interview rounds; later clarifications are incorporated into earlier summaries where relevant.

## Purpose and scope

- Private dashboard for planning future features, choosing next work, tracking development, and sharing task context with local agents.
- Personal use initially; record ownership without introducing teams, invitations, roles, or billing.
- V1 includes search, filters, priorities, optional due dates, dependencies, private attachments, GitHub integration, responsive UI, and MCP access.
- Hosting: Vercel Pro. Stack requested: Next.js, Better Auth, Neon PostgreSQL, Drizzle ORM, shadcn/ui, and Tailwind CSS. Integration architecture is specified in docs/ARCHITECTURE.md; compatible exact package versions lock during scaffolding.
- Package manager: pnpm (single `pnpm-lock.yaml`). Product name: Zenshin (前進, "moving forward"); preferred domain zenshin.app, pending registration and trademark checks.
- Logo: brush-stroke ensō, design/brand/zenshin-logo.svg (single path, `currentColor`); generated favicon/app-icon/OG assets in design/brand/ are installed in Phase 1. Uses the project zinc palette only: foreground on background in-app; primary-foreground on primary for the app icon/favicon. No brand accent colour.

## Organization and work

- Projects contain tasks directly and/or sections.
- Sections contain both tasks and child sections; V1 UI supports three section levels.
- Features and versions are purposes given to sections, not separate entity types.
- Sections have descriptions, notes, and lifecycle values Planned, Active, Completed; archiving is separate.
- Tasks have one level of subtasks. Subtasks have the same tracking capabilities as tasks.
- Default task categories: Backlog, Ready, In progress, In review, Done, Canceled.
- Project-specific status names map to those categories.
- Blocked is a condition, not a workflow status.
- Dependencies may cross sections within one project and warn without preventing work.
- Completing a parent with unfinished subtasks requires an explicit choice: Complete all or Keep parent open.

## Context and interface

- Projects, sections, and tasks each have a short description and one editable rich-text note.
- Notes support headings, lists, checkboxes, links, and code blocks. Full block editing and tables are deferred.
- Activity history is separate from notes.
- My work is the cross-project home, highlighting overdue, ready, and in-progress tasks.
- Project sidebar, list and board views, and a task detail panel.
- Compact, calm visual direction with light and dark themes.

## Integrations and access

- GitHub login through Better Auth, restricted to the owner's identity.
- GitHub repository permissions are separate from login.
- Multiple repositories per project, task links to issues and pull requests, live GitHub status, and explicit issue import.
- Bidirectional issue/task synchronization is deferred. Automatic task transitions are opt-in.
- Private attachments on projects, sections, and tasks, focused on images, PDFs, and small text files, with a 20 MB per-file limit. Agents may attach files.
- Agent credentials support selected-project access, revocation, expiration, and explicit permission scopes.
- Agents may read, create, and update work, with recorded attribution. Archiving is the normal removal mechanism.
- Agents submit implementation work to In review by default. Marking work Done requires an explicit completion permission.

## Deferred scope

- Teams, invitations, billing, full Notion-style block editor, note tables, and bidirectional GitHub synchronization. (Task custom properties are in scope since round 7.)
- Recurring tasks, notifications, time tracking, and offline use are outside the agreed V1 essentials.

## Detailed behavior (round 3)

- Task priorities: None, Low, Medium, High, Urgent.
- Due dates are calendar dates in the configured timezone, initially Asia/Kolkata. Sections have optional target dates. Start dates, reminders, and estimates are deferred.
- Section lifecycle is manual; task progress counts eligible leaves across descendants, excludes canceled/archived work, and shows No tasks when empty. Parents do not add a second progress unit.
- Adding unfinished work to a completed section prompts reopening.
- Subtasks inherit their parent's project/section, but priorities and due dates are independent. Moving a parent moves its subtasks.
- Parent completion with unfinished subtasks offers Complete all or Keep parent open.
- Tasks can be converted between standalone tasks and subtasks, subject to the single nesting level.
- Only Done and not effectively archived satisfies a dependency. Canceled/archived prerequisites need explicit resolution. Reject cycles. Manual blocked reasons are supported; blocking does not prevent status changes.
- GitHub issue import copies title/body once, preserves the external link, and deduplicates within the project. Subsequent GitHub edits do not overwrite task content.
- Opt-in GitHub automation: a linked PR opening moves Ready to In progress; all linked PRs merged moves In progress to In review. Automation never marks work Done.
- Stale writes are rejected, preserving attempted content for retry. Rich-text notes autosave with visible saving/saved/conflict states. Agents can append note content. Real-time collaborative editing is deferred.
- Archive hides an item and its descendants from active views without changing statuses. Archived work is available via explicit filters and is restorable.
- Only the human owner may permanently delete archived items, with confirmation. Agents cannot permanently delete.
- Section views default to direct tasks, with Include child sections available. Project All tasks spans sections.
- Board supports status dragging; lists support manual order within a section. Explicit sorts override manual ordering. Columns follow the project's statuses.

## Architecture and integration decisions (round 4)

- Shared business rules serve the website and remote MCP endpoint in one Next.js application.
- Section progress counts leaf tasks only, excluding canceled leaves. Unfinished parents are shown separately even if all subtasks are finished.
- Project-specific labels; tasks can have multiple labels. Unique project prefixes with sequential task references; subtasks have their own references. References survive section moves. Cross-project moves are deferred.
- Remote MCP with explicitly configured bearer API keys; OAuth MCP login is deferred. Required initial clients are Codex and Claude Code.
- Default agent credential expiry is 90 days, configurable by the owner. Read only and Contributor presets, separate opt-ins for archiving and completion.
- Contributor credentials may create sections/tasks within selected projects. Project creation, credential management, GitHub integration management, and permanent deletion are owner-only.
- GitHub repositories may belong to the owner's personal account or organizations. Refresh tracked GitHub data every minute and provide manual refresh; retain signed webhooks for prompt updates. Bounded cron/reconciliation mechanics are specified in docs/ARCHITECTURE.md.
- Private attachment storage: Cloudflare R2, replacing the proposed Vercel Blob.
- No user-imposed cost or availability cap; explain infrastructure tradeoffs rather than optimizing for free-tier limits.
- Target recovery point: at most 24 hours of data loss, using the independent database/files backup approach in docs/ARCHITECTURE.md. Actual configuration and a full restore must be verified before launch.
- Owner-only portable export: structured data, Markdown notes, attachment manifest. Search includes titles, descriptions, note text, labels, and task references; archived items require explicit inclusion. Uploaded-file contents are not indexed in V1.
- Mobile supports navigation, search, task creation/editing, notes, and status changes, with menu alternatives to dragging.

## Final behavior and design decisions (round 5)

- Archived prerequisites do not satisfy dependencies. Warn before archiving; block permanent deletion while surviving tasks depend on the deleted subtree.
- Fixed workflow categories each retain at least one status. Owners may rename/reorder/add statuses within categories. Removing a populated status requires remapping its tasks. Workflow and label configuration are owner-only; agents may apply existing labels.
- MCP actions needing a choice return decision_required without partial changes. Retrying requires explicit parameters and sufficient scopes. Bulk completion requires complete permission.
- Boards show standalone/parent tasks by default with subtask progress; Include subtasks exposes individual subtasks. My work includes subtasks and blocked work; Ready to work excludes blocked tasks.
- Required MCP compatibility targets: Codex and Claude Code, using environment-backed bearer keys.
- R2 download links last five minutes; possession permits access until expiry.
- Recovery: seven-day Neon history plus encrypted independent database snapshots and attachment copies, retained for 30 days; test a full restore before launch.
- Notes: compact rich-text toolbar, Markdown-style typing shortcuts, language-selectable code blocks, local draft recovery, last 20 saved note revisions. Restoring a note creates a new revision; owner-only restoration.
- Desktop: 248 px sidebar, compact header, 40 px task rows, 560 px task detail panel with full-page option. Mobile uses larger touch targets.
- Typography: IBM Plex Sans for UI; IBM Plex Mono for task references/code. System theme default with explicit light/dark override. (Palette and status styling superseded in round 6.)
- Keyboard shortcuts for search/task creation, visible focus, reduced-motion support.

## UI design review (round 6, 2026-10-28)

- Visual system: shadcn preset `bcivVQBO` (Nova, zinc, IBM Plex Sans, lucide). Monochrome neutral palette with no blue accent. Workflow status is shown by glyph shape plus label, not colour.
- Lists and board columns use collapsible card-inside-card groups. The collapse chevron sits at the right edge of the group header. Parent tasks have an expand/collapse chevron for their subtasks.
- Dialogs use a 4 px translucent ring (`#FFFFFF1A`) over a frosted surface, on a blurred black overlay. This applies to every dialog and to the mobile drawer.
- Settings is a dialog with its own sidebar, not a separate page.
- Mockups for every V1 screen, plus dark versions of Project overview, Section and Task, live in design/ui-mockups. Details are in docs/DESIGN.md.

## Custom properties (round 7, 2026-10-29)

- V1 adds Notion-style custom properties on tasks and subtasks, defined per project. Types: Text, Number, Date, Checkbox, Select, Multi-select, URL. Proposed limits: 30 per project, 50 options each.
- The owner creates properties, either from the task panel's Add property menu or from Settings → Properties. Agents only set or clear values of existing properties.
- Properties can be filtered, sorted (Number, Date and Select) and searched (Text), are included in exports and record activity.
- Still deferred: properties on sections/projects, relation/formula/rollup/person types, and grouping boards by a property.

## Specification review

The documents in docs/ consolidate accepted behavior and explicitly identify implementation defaults. The final shared-understanding confirmation is still required before application implementation starts.
