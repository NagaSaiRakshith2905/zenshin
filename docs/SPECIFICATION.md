# Product specification and flows

Status: ready for final shared-understanding review. See ../DECISIONS.md for accepted interview answers and the Implementation defaults section below for proposed details.

## Outcome

A private development workspace for one owner: capture future features, organize projects into nested plans, choose next work, track execution, and let local agents operate on the same data. V1 is a complete personal workflow rather than a multi-user product.

Stack: Next.js App Router, TypeScript, Better Auth, Neon PostgreSQL, Drizzle ORM, shadcn/ui, Tailwind CSS. Vercel hosts the application; Cloudflare R2 stores private attachments. GitHub is the human sign-in provider and, through a separate GitHub App, the repository integration.

## Scope

Included: projects; three levels of sections; tasks with one subtask level; descriptions and rich-text notes at all three entity levels; note history; workflow customization; labels; custom task properties; priority; dates; dependencies; manual blocking; activity; list/board views; search/filtering; private attachments; GitHub issue import and PR/check visibility; opt-in PR transitions; scoped agent MCP; responsive light/dark UI; owner export; tested recovery.

Deferred: teams, invitations, billing, assignees, recurring tasks, reminders, time tracking, estimates, offline operation, real-time document collaboration, full Notion block databases (custom properties on sections/projects, relation/formula/rollup/person property types, and grouping boards by a property are deferred as well), note tables, comments, attachment-content search, task moves between projects, GitHub write operations/bidirectional synchronization, OAuth-based MCP discovery/login.

## Organization and lifecycle

- Projects contain root tasks and/or sections. A section may contain both tasks and child sections.
- Section depth is at most three, counting the top section as level one. Moves must preserve this across the whole subtree.
- Feature and Version are organizational meanings of Section, not separate schema entities. Names such as Version 1.0 → Authentication are valid.
- Sections have Planned, Active, Completed lifecycle values. Archive is separate. Projects have no extra lifecycle in V1; archive removes a project from active use.
- Task status belongs to its project's workflow and maps to Backlog, Ready, In progress, In review, Done, or Canceled. All six categories remain available.
- Default new task status is Backlog and default priority is None. A task can be created directly in another permitted status.
- Subtasks are full tasks. They share their parent's project/section and move with it, but keep independent status, priority, labels, notes, dependencies, and due dates.
- A task with subtasks cannot be converted into a subtask until its subtasks are moved/promoted. Promotion/demotion preserves UUID, task reference, and history.
- Parent completion with unfinished subtasks offers Complete all or Keep parent open. Canceled subtasks are already resolved and remain Canceled. Complete all marks remaining nonterminal subtasks Done atomically.
- Parent status never changes automatically just because subtasks change. Section lifecycle does not automatically follow progress.
- Adding or reopening unfinished work inside a completed section or descendant requires explicit reopening of the affected completed ancestors. UI shows the full affected list; MCP uses decision_required. No partial change precedes that choice.

## Custom properties

- A project can define custom properties for its tasks, in addition to the built-in fields (status, priority, due date, labels, blocked reason). Subtasks use their project's definitions like any other task.
- Property types: Text (plain, up to 2,000 characters), Number, Date (calendar date), Checkbox, Select (one option), Multi-select, and URL (http/https only).
- A definition has a name (up to 40 characters, unique within the project after normalization), a type, an order, and for Select/Multi-select an ordered list of options (up to 50, unique names). A project can have up to 30 definitions.
- The type is fixed once a property is created. Renaming the property, reordering properties, and adding, renaming or reordering options keep existing values.
- Deleting a property, or an option that tasks use, requires a confirmation that names how many tasks lose the value. The values are then removed. Archived tasks count too.
- The owner manages definitions. The task panel's Add property menu lists this project's properties the task has no value for and offers New property (name + type), which creates a definition for the whole project. Agents can read definitions and set or clear values on existing properties, but cannot create, change or delete definitions.
- The task panel shows built-in fields first, then custom properties that have a value, in definition order. A property without a value stays hidden on that task until it's added through Add property. Clearing a value hides the property again.
- Value changes are task edits: they use the task's revision check, record activity, and survive moves within the project. Archive and restore leave values unchanged.
- Converting a task to or from a subtask keeps its values.

## Progress, dates, and blocked work

- Progress counts non-archived, non-canceled leaf tasks only. Done leaves / eligible leaves is the fraction. An empty section shows No tasks; a section containing only canceled leaves shows No active tasks, rather than 100%.
- Parent tasks do not add a second progress unit. Surface unresolved parents separately, including when their leaves are all finished.
- Sections include descendant sections in progress. A parent's progress uses its own immediate subtasks, which are leaves under the one-level limit.
- Priorities are None, Low, Medium, High, Urgent. Section target dates and task due dates are optional calendar dates, not instants.
- Initially use Asia/Kolkata; the owner can change the display/overdue timezone. A task becomes overdue after its due date ends in that timezone, unless Done/Canceled or effectively archived.
- Dependencies stay inside one project. Only Done and not effectively archived satisfies a prerequisite. Canceled or archived prerequisites require explicit resolution; archiving a Done prerequisite does not preserve its satisfied condition.
- Reject self-dependencies and graph cycles. Also reject dependencies between a parent and its own subtask to avoid contradictory completion expectations.
- Manual blocking has an editable reason. Computed dependency blocking and manual blocking are independent; clearing one does not clear the other.
- Blocking is advisory and never silently replaces status or prohibits starting work. Terminal tasks keep their links for history but do not show an active blocked badge.

## Views and navigation

- My work: Overdue, In progress, In review, and Ready groups across active projects; include subtasks. Backlog remains reachable through filters/search and project navigation. Group membership is non-overlapping: overdue first, then remaining tasks by category.
- Ready to work means Ready category with no manual/dependency blocker. Blocked tasks remain visible in ordinary views.
- Project Overview: description, note, active/planned sections, compact progress and upcoming dates. All tasks: tasks across every section, plus root tasks.
- Section view: direct tasks by default; Include child sections includes the subtree. The section plan/note and child section navigation remain available.
- List view groups subtasks under parents by default. When filters select a subtask but not its parent, show a nonmatching parent as context, not as an additional matching result.
- Board defaults to standalone/parent cards. Include subtasks adds separate subtask cards with their parent reference. Columns follow configured status order.
- Manual ordering applies to a single section/root task list and to siblings under one parent. Board columns use that same underlying order; a status drag retains location and appends within the task's local ordering scope. Do not allow ambiguous cross-section reordering in aggregated views.
- Explicit sorting by priority, due date, or updated time replaces display order without rewriting manual ranks. Include None priorities and missing dates last; break ties by stable task reference.
- List/board selection, filters, archive inclusion, subtree inclusion, and sort are shareable URL state; theme and default view are owner preferences.

## Search and filters

Search titles, short descriptions, note text, task references, label names, and custom Text property values. Scope by project/section or search globally. Exclude archived descendants unless explicitly included. Search does not expose hidden data through counts or snippets.

Filters: project, section/subtree, workflow category/status, label, priority, due date/overdue, blocked, archive state, parent/subtask, linked GitHub item, and custom properties. Combine filter groups with AND; multiple selections within one group use OR. Custom property filters work within one project: is empty / is not empty for every type; option selection for Select and Multi-select; checked/unchecked for Checkbox; ranges for Number and Date; contains for Text and URL. Explicit sort is also available by a Number, Date or Select property (option order), with empty values last. Backlog is a status category, not an invented section.

## Notes and files

- Each project/section/task has one note and one short plain-text description. Supported note nodes: paragraphs, headings, bold/italic/strike, links, lists, checklists, quotes, inline code, fenced code blocks with language. No arbitrary HTML or scripts.
- Autosave uses optimistic concurrency; preserve attempted edits on failure. Every successful persisted content change creates a note revision; retain the latest 20 content revisions. Activity remains separate.
- Local draft recovery is device/browser-specific, not offline synchronization. Do not silently overwrite a newer server revision with a recovered draft. Clear local drafts after confirmed save or explicit discard, and on owner sign-out offer to discard remaining local drafts.
- Owner may preview and restore retained revisions. Restoration is a new revision. Agents may read current notes, append, or update with revision checks, but cannot restore history.
- Attachments are private, allowed on projects/sections/tasks, and limited to 20 MB per file. Ready files can be linked from notes without creating an additional ownership model.
- Failed/pending uploads show retry/remove actions and never appear as successful files. Downloads require authorization followed by a five-minute signed URL.

## GitHub behavior

- One project can connect to several repositories; a repository may be linked to several projects. Installation access is limited to authorized personal/organization repositories.
- Explicit issue import copies the issue title/body once. Store its origin/link and prevent duplicate imports per project, even after the imported task is archived; offer Open existing or Restore instead.
- Import provenance survives unlinking the visible GitHub association. Permanent deletion of the imported task removes its deduplication mapping; a later deliberate import gets a new task/reference.
- Imported issues land in the user-selected section and status, defaulting to project root/Backlog. Convert issue Markdown to supported rich-text nodes without fetching remote images.
- Linking a PR/issue does not overwrite local content or change workflow by itself. Issue state is displayed separately; closing an issue does not complete a task.
- Display PR state, draft status, merge status, check summary, last refresh, and unavailable/stale errors. The website and MCP never commit code, merge PRs, or edit GitHub issues in V1.
- Each project opts into PR-open and all-PRs-merged rules separately. Default disabled.
- A new non-draft PR opening may move Ready → In progress. All linked PRs merged may move In progress → In review, requiring at least one linked PR and verified states for every linked PR. Closed-unmerged is not merged; unavailable data prevents transition. Never regress or mark Done.
- Rules act on the linked task only, not its parent/children. If a category has several statuses, the owner selects the rule's target status. Draft-to-ready can trigger the PR-open rule once.
- Linking an already-open/merged PR or enabling a rule establishes a baseline without retroactive transitions. Persist processed remote-event fingerprints, including no-op evaluations, so returning a task to Ready does not replay an old PR opening. All-merged evaluation identifies the linked PR set plus merge states and requires a qualifying merge after the baseline.
- Refresh tracked GitHub data on demand: webhooks for prompt updates, visible screens poll Zenshin every few seconds, the server refreshes from GitHub when cached data is over a minute old, plus manual refresh. No scheduled cron. Import browsing fetches issues on demand instead of mirroring entire accounts.

## Archive and deletion

- Archive is reversible and does not alter statuses, dependencies, or note content. Effective archive includes archived project/section/parent ancestors.
- Restore clears only the selected item's own archive marker; independently archived descendants remain archived. If an ancestor is archived, explain that restoring it is also necessary for visibility.
- Warn about active dependent tasks before archive and allow explicit continuation, including when archiving a Done prerequisite would make them blocked. Do not silently remove dependency links.
- Owner-only permanent deletion requires an archived target and a confirmation that names the affected subtree and files. Block while tasks outside the deletion set depend on that set.
- Remove cross-links owned exclusively by the deleted set. File deletion uses durable retries; hide deleted data immediately even if physical cleanup is pending.
- Backups may retain deleted data for the agreed 30-day recovery window; deletion UI explains this. Active records must not be resurrected accidentally by a normal restore action.

## Key flows

1. First access: controlled owner provisioning → GitHub login → My work empty state → Create project → enter name/prefix/description → create sections or capture first task.
2. Planning: create Planned section → add note/target date → nest sections if useful → capture Backlog tasks → prioritize/label/depend → move selected work Ready.
3. Execution: choose Ready to work → open task → set In progress → edit note/subtasks → attach files/link PR → send In review → owner validates and marks Done.
4. Agent: owner creates project-scoped key → configure local client → agent reads context → writes with current revision/idempotency key → sends In review → activity identifies the key/agent.
5. File: select target → authorize pending upload → direct R2 transfer → authenticated finalize/verify → display ready attachment → authorized short-lived download.
6. GitHub: install read-only App on selected repositories → connect repositories to project → link/import → webhook or minute refresh → idempotent reconciliation → optional transition → activity entry.
7. Failure: stale write → retain draft → show current server version/differences → user/agent retries deliberately; never use silent last-write-wins.

## Implementation defaults included in this review

These are concrete engineering proposals rather than additional interview answers:

- Immutable project prefix: 2–10 uppercase letters/digits, starting with a letter, unique per owner. Display names can change. Task numbers never get reused, including after deletion.
- Name/title limits: project/section 120 characters, task 240; descriptions 2,000; label 40; blocked reason 1,000; note document 1 MiB serialized. Validate Unicode-aware lengths and reject blank titles.
- Upload allowlist: PNG, JPEG, WebP, GIF, PDF, UTF-8 TXT/Markdown/CSV/JSON/log files. Exclude HTML/SVG, executables, archives, video, and arbitrary remote URL imports in V1. Define 20 MB as 20,000,000 bytes.
- Lists use cursor pagination, default 50/max 100. Browser may load more; agent responses stay bounded. Bulk mutations cap at 100 items and validate all before commit.
- Keyboard shortcuts: Cmd/Ctrl+K search, C new task outside editable controls, Escape close panel/dialog. No shortcut intercepts text entry.
- Next.js Node runtime; transaction-capable pg driver; PostgreSQL full-text search; Tiptap-compatible structured JSON notes; Zod boundary validation; TanStack Query for client server-state coordination. Exact compatible dependency versions lock during scaffolding.
- R2 presigned upload expiry 10 minutes; download expiry five minutes; pending upload cleanup after expiry plus a safety interval. Credentials default to 90 days.
- After accepting this package, operational configuration can proceed without reopening product choices: product name/domain, real account IDs, cloud regions near each other, secrets, GitHub App registration, and package lockfile.
