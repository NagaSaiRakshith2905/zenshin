# UI/UX audit — Zenshin

Date: 1 November 2026. Scope: the current working tree, including pre-existing uncommitted changes.

Implementation follow-up: [fixes and verification](UI-UX-REMEDIATION-2026-11-01.md). This audit preserves the findings and evidence available before implementation.

## Assessment

The existing workspace direction is appropriate for a personal development tracker: restrained surfaces, readable rows, stable task references, persistent location context, and explicit domain decisions. The main work is to make that system reliable across screen sizes, keyboard use, slow saves, and recovery states.

This audit records **28 findings: 7 P1, 17 P2, and 4 P3**. The first fixes should address the settings breakpoint conflict, full-page search scrolling, filter placement, silently ignored property edits, and contrast. No P0 issue was established.

**This is a source-based audit, not completed visual or accessibility certification.** All seven page routes, workspace layouts, feature UI modules, and 13 shared UI primitive files were reviewed. Three existing reference images were visually inspected; they are design mockups, not evidence of the current application rendering.

### Evidence and limits

- Read the invoked ui-ux-pro-max skill, its web quick reference, relevant search results, the existing design specification, implementation notes for the workspace UI, and the bundled Next.js accessibility guide. Checked the installed shadcn variant definitions where primitive behavior was ambiguous.
- Starting the isolated fixture preview failed with `listen EPERM` on `127.0.0.1:5173`, both normally and with elevation. No automatic approval rejection was returned; the process itself could not listen.
- The fixture client bundle built successfully. A temporary offline-file variant was also attempted. Chrome showed a blank preview and an HTTP-origin startup compatibility error; the fallback did not yield usable application evidence. That failure is not reported as a production application bug.
- No authenticated application screen was successfully exercised in this audit. No browser acceptance tests, screen-reader tests, device tests, real uploads, provider commands, or production performance measurements passed as part of this work.
- Contrast figures below are calculations from declared CSS tokens, including sRGB pill mixes and alpha composition. They are not screenshot sampling or a full component/state contrast sweep.
- No application implementation, existing tests, dependencies, database, credentials, or real workspace records were changed. Environment files were not read. Redis was not used or added to tests.

Priority: **P1** = fix before release because a core flow or accessibility requirement is affected; **P2** = material usability or interaction inconsistency; **P3** = polish, discoverability, or a measurement follow-up. “Source defect” means the implementation establishes the issue; its exact visual manifestation still needs browser verification. “Risk” means the source identifies a plausible problem that requires reproduction before being treated as a confirmed runtime failure.

## Screen coverage

Every row below received source review. Live rendering remains unverified for every row.

| Screen or surface | Reviewed elements and states | Findings / follow-up |
| --- | --- | --- |
| `/sign-in` | Owner-only explanation, GitHub CTA, connecting, failure, first provisioning | Clear primary action and announced error. Verify OAuth return, owner denial, and narrow/landscape layout. |
| Shared workspace | Sidebar, nested project/section disclosures, breadcrumbs, skip link, search trigger, create shortcut, save indicator, sign-out/draft decision | F07, F11, F21, F25. Check navigation expansion after cross-project navigation and focus after closing the mobile drawer. |
| `/` — My work | Work-scope toggle, four task groups, counts, task rows, filtering, pagination, empty/loading/error | F03, F06, F11, F13, F23. Empty filtered work should offer filter recovery before project creation. |
| `/projects/[projectId]` | Heading, description, archive badge, progress, section plan, view toolbar, Note/Attachments actions | F03, F11, F13, F14. Notes and attachments are behind the actions menu; assess discoverability against the accepted design. |
| `/projects/[projectId]/tasks` | All-task list, sorting, layout selection, filters, empty state, pagination | F03, F06, F11, F14, F24. Check long project/task names and retained data after refresh failure. |
| `/projects/[projectId]/sections/[sectionId]` | Ancestor breadcrumbs, lifecycle, target date, progress, child-section inclusion, child plan | F03, F11, F13, F21. Child sections currently follow the task area; confirm this ordering supports planning. |
| Project/section board | Columns, counts, draggable cards, placeholder, save/rollback, pagination | F04, F05, F24, F25. A non-drag path exists through task detail; do not classify dragging as the only available status change. |
| Project/section calendar | Month navigation, Today, dated/undated tasks, disclosure, property visibility, stored choices | F05, F11, F12, F21. Check empty months, partial task pagination, and blocked browser storage. |
| Task panel and drawer | Inline panel at 1440px, modal below that, full-page link, close/Escape, restoration, query loading/error | F04, F08, F09, F15, F18. Verify focus while changing breakpoint with a task open. |
| `/tasks/[taskId]` | Title/description, built-in and custom properties, parent/location, note, subtasks, GitHub, dependencies, activity, attachments | F04–F12, F15, F18, F21, F28. Long notes and sticky toolbar need keyboard/zoom checks. |
| Task/project/section creation and editing | Location, title/name, prefix, description, status, priority, lifecycle, dates, save/cancel | F16, F22. Confirm delayed loading of projects/statuses and preservation after server validation. |
| Move/reorder and blocking dialogs | Parent/section/position, prerequisite picker, remove dependency, blocking reason | F11, F16, F22. Check ambiguous duplicate section names and pagination of selection options. |
| Decision/conflict/permanent delete | Affected names/counts, replacement status, complete-parent choice, latest revision retry | Structured confirmation exists. Verify initial safe focus, nested dialogs, long impact lists, and actual server rejection/retry. |
| Global search dialog | Debounce, grouped results, snippets, active descendant, arrows/Enter, close, filter handoff | F11, F24. Palette has async announcements and keyboard operation; keep these while changing its layout. |
| `/search` | Query form, URL query, filters, hits, snippets, load more, empty/error | F02, F03, F19. No successful runtime Back/scroll verification in this audit. |
| Settings container | Workspace/project navigation, project selector, section title, close, internal scrolling | F01, F16, F27. Especially inspect 640–767px. |
| Preferences | Timezone, theme, default layout, validation, save, reload | F21, F22. Good visible labels and an invalid timezone state; errors need a more direct relationship to the field. |
| Credentials / create / edit / revoke | Project grants, preset, independent permissions, expiry, secret display/copy, inactive keys, revoke confirmation | F11, F17, F22. Scope and one-time-secret explanations are useful; no key was created or revoked. |
| MCP setup | Client instructions, copy actions, failure fallback | Useful manual-copy fallback. Check long code at zoom and keyboard focus on the fallback. |
| Archived work | Project picker, own/inherited archive, links, restore/delete actions, pagination | F20. No false claim that archive recovery is absent: the surface exists under Settings. |
| Exports | Request, in-progress lockout, refresh, ready download, expiry, error/empty | F21. Check loading versus “No exports yet” on failure and a visible pending download state. |
| Integration health | Refresh, jobs, attempts, errors, next retry, GitHub sync timestamps | F21. Prefer readable provider/job labels and useful recovery actions over raw identifiers. |
| Project General / Workflow / Labels / Properties | Immutable prefix, definition editing/deleting, order controls, options, impact confirmation | F11, F16, F22, F26. Label colors are editable; they need contrast-safe rendering. |
| GitHub settings / import | Installation discovery, repository pages, connect/disconnect, rule forms, issue pages, import, existing-task recovery | F21. Installation “Load more” replaces the current page and offers no Previous control; verify return to earlier accounts, unavailable-installation explanations, and return from provider setup. |
| Task GitHub | Links, availability, freshness, refresh/check refresh, checks, unlink, repository/type/number form | F11, F21. Preserve local task access on provider failures; verify refresh wording with real latency. |
| Notes | Standard toolbar, inline editor, slash and bubble menus, link picker, upload feedback, history, recovery/compare/restore | F11, F16, F21, F28. History has no explicit loading presentation; exercise slow revision fetches. |
| Attachments | Ready/pending/failed rows, upload/verify progress, retry, copy/download, removal confirmation | F11, F18. Real transfer, signature/CORS, and removal focus after row disappearance remain untested. |
| Route loading/error/global error | Skeletons, announced status, heading, retry | Existing states are present and use the bundled Next.js `retry` contract. Verify real thrown errors and recovery in a running app. |

## P1 findings

### F01 — Settings content collapses between 640px and 767px

**Source defect.** The dialog changes to a horizontal layout at `sm` (640px), while the sidebar's mobile CSS remains active through 767px. In that interval, the sidebar has `width:100%` and `flex-shrink:0`; it consumes the dialog's width and leaves its content sibling no useful width. Settings can become unusable on small tablets and landscape phones.

Evidence: [workspace.tsx:60](/Users/nsr/projects/nsr-tracker/src/features/settings/workspace.tsx:60), [globals.css:339](/Users/nsr/projects/nsr-tracker/src/app/globals.css:339), [globals.css:348](/Users/nsr/projects/nsr-tracker/src/app/globals.css:348).

**Fix:** Use one breakpoint for dialog direction and sidebar sizing, for example a vertical layout until `md`. **Acceptance:** At 639, 640, 700, 767, and 768px, both navigation and every content form remain reachable without horizontal clipping.

### F02 — Full-page search has no bounded vertical scroll area

**Source defect; runtime clipping needs reproduction.** Search returns `.work-view-scroll` directly inside `.workspace-main`. Unlike `WorkView`, it has no height-constrained flex parent. `overflow:auto` on an auto-height block does not create the intended bounded scroller, while `.workspace-inset` clips overflowing descendants. A long result page can extend below the workspace with its later results and pagination inaccessible.

Evidence: [search.tsx:52](/Users/nsr/projects/nsr-tracker/src/features/work/search.tsx:52), [shell.tsx:44](/Users/nsr/projects/nsr-tracker/src/features/work/shell.tsx:44), [globals.css:199](/Users/nsr/projects/nsr-tracker/src/app/globals.css:199), [globals.css:208](/Users/nsr/projects/nsr-tracker/src/app/globals.css:208), [globals.css:231](/Users/nsr/projects/nsr-tracker/src/app/globals.css:231).

**Fix:** Give Search the same constrained view/scroll structure as other screens. **Acceptance:** With enough results to exceed two viewport heights, reach the last hit and Load more with wheel, touch, and keyboard at desktop and mobile widths.

### F03 — Search filters open beyond the viewport

**Source defect.** The search page places Filters after a flex-growing search form, near the right edge, but passes `align="start"`. The popup then anchors its left edge to that trigger and extends up to 960px to the right. It has no collision detection or portal placement. The workspace's clipping ancestor can hide most of the form.

Evidence: [search.tsx:52](/Users/nsr/projects/nsr-tracker/src/features/work/search.tsx:52), [filters.tsx:49](/Users/nsr/projects/nsr-tracker/src/features/work/filters.tsx:49).

**Fix:** Use the existing Radix positioning capability or constrain placement to the viewport; use a full-width small-screen presentation. **Acceptance:** All fields and Reset/Cancel/Apply remain visible and reachable at 320, 390, 768, 1024, and 1440px, including when the trigger is at either edge.

### F04 — Rapid property changes can be silently ignored

**Source defect.** `useAction.send` returns immediately when its busy ref is set. Task properties share one action instance, but their controls remain enabled during the request. A second label/multi-select/checkbox/property edit made before the first response can be dropped without feedback. This is especially noticeable on slow connections and conflicts with the UI's immediate-edit behavior.

Evidence: [action.tsx:30](/Users/nsr/projects/nsr-tracker/src/features/work/action.tsx:30), [task-properties.tsx:63](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:63), [task-properties.tsx:76](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:76). The board already has its own queue; this finding concerns the unqueued property controls.

**Fix:** Either queue/coalesce edits with reconciled revisions or clearly disable the affected controls until saving finishes. **Acceptance:** Under a delayed response, toggle two different values and edit two fields quickly; every accepted action must persist, or the UI must prevent the second action visibly.

### F05 — Amber pill text fails normal-text contrast in light mode

**Calculated from source.** The shared pill formula mixes 75% of `#d58a19` into the foreground and 18% into the background. With the declared light tokens, that produces approximately `#a26a16` on `#f7ead6`, **3.85:1**. Pill text is 10–13px, so it needs 4.5:1 rather than the large-text threshold. This affects High priority and In progress pills, plus amber custom options.

Evidence: [globals.css:296](/Users/nsr/projects/nsr-tracker/src/app/globals.css:296), [globals.css:300](/Users/nsr/projects/nsr-tracker/src/app/globals.css:300), [task-properties.tsx:14](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:14).

**Fix:** Define contrast-tested foreground/background token pairs per theme instead of deriving both from one mix percentage. Handle arbitrary label colors independently. **Acceptance:** Measure every palette pair in each rendered surface and interaction state; normal text must meet 4.5:1. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum).

### F06 — Backlog and canceled glyphs are too faint where they carry status

**Calculated from source.** On unselected task rows, the meaningful Backlog glyph is approximately **2.63:1** against the light group surface. Canceled is approximately **1.48:1** in light mode and **1.78:1** against the declared dark inner-group surface. Rows do not display the category name next to the glyph; its accessible name helps screen-reader users but does not solve low-vision perception.

Evidence: [globals.css:265](/Users/nsr/projects/nsr-tracker/src/app/globals.css:265), [globals.css:270](/Users/nsr/projects/nsr-tracker/src/app/globals.css:270), [task-list.tsx:23](/Users/nsr/projects/nsr-tracker/src/features/work/task-list.tsx:23), [primitives.tsx:14](/Users/nsr/projects/nsr-tracker/src/features/work/primitives.tsx:14).

**Fix:** Strengthen semantic glyph strokes to at least 3:1, retaining shape differences; optionally add visible status text in the relevant presentation. **Acceptance:** Check every category against normal, hovered, selected, and dark row surfaces. Decorative glyphs beside equivalent visible text can be treated differently. See [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

### F07 — The global single-character create shortcut cannot be disabled

**Source defect against the character-shortcut requirement.** An unmodified `c` opens task creation from ordinary page focus. Editing and modal targets are excluded, but there is no switch, remapping option, or restriction to a particular focused component. Speech input can unintentionally activate it.

Evidence: [shell.tsx:39](/Users/nsr/projects/nsr-tracker/src/features/work/shell.tsx:39), [model.ts:16](/Users/nsr/projects/nsr-tracker/src/features/work/model.ts:16).

**Fix:** Add a non-character modifier, or allow disabling/remapping the shortcut. Preserve the visible New task button. **Acceptance:** Ordinary character input outside editable fields cannot trigger creation when single-key shortcuts are disabled. See [W3C character-key shortcut guidance](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html).

## P2 findings

### F08 — Property controls lose their field context or current value in accessible names

`InlineValue` renders a button named only by its value, often “Empty”; its adjacent property name is not associated through a label. Conversely, `PropertyPopover` sets `aria-label` to “Status”, “Priority”, or a property name, overriding the visible selected value in its accessible name. Repeated generic “Options” listbox names add ambiguity.

Evidence: [task-properties.tsx:22](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:22), [task-properties.tsx:27](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:27), [task-properties.tsx:34](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:34), [task-properties.tsx:44](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:44).

**Fix/acceptance:** Associate each visible field name with its control and expose the current value, for example “Estimate: Empty” and “Status: In progress”. Verify with a screen reader and its control list.

### F09 — Custom-property text editors do not restore keyboard focus

The text/number/URL editor replaces its input with a button on blur, Enter, or Escape without restoring focus to that button. Keyboard users can lose their position when the focused input is removed. The task-title editor already has a restoration pattern.

Evidence: [task-properties.tsx:39](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:39), [task-detail.tsx:77](/Users/nsr/projects/nsr-tracker/src/features/work/task-detail.tsx:77).

**Fix/acceptance:** Restore focus after keyboard commit/cancel, while preserving the destination of a deliberate pointer blur. Tab from a completed edit should continue from the property just edited.

### F10 — Date-picker grid omits required row structure

The `role="grid"` owns column headers and gridcells directly, without `role="row"` containers. Arrow movement exists, but the declared semantic structure is incomplete; Home/End navigation is also absent.

Evidence: [date-picker.tsx:37](/Users/nsr/projects/nsr-tracker/src/features/work/date-picker.tsx:37), [date-picker.tsx:45](/Users/nsr/projects/nsr-tracker/src/features/work/date-picker.tsx:45).

**Fix/acceptance:** Use a valid calendar grid with row ownership and predictable keyboard movement. Confirm selected day, today, month changes, and full date announcements in a screen reader. See the [WAI-ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).

### F11 — Touch sizing is inconsistent across custom controls

The 44px rules mostly target `data-slot="button"` and selected classes. Custom property values/options/toggles, date controls, layout tabs, filter chips, visibility controls, and some disclosure headers remain compact. Examples include 26px date navigation, 32px date cells, and 28px chips. Coarse-pointer rules do not include all of these. Also inspect alert-dialog actions: their final slot is `alert-dialog-action`/`alert-dialog-cancel`, so the generic button-slot sizing rule may not reach them.

Evidence: [globals.css:293](/Users/nsr/projects/nsr-tracker/src/app/globals.css:293), [globals.css:316](/Users/nsr/projects/nsr-tracker/src/app/globals.css:316), [globals.css:453](/Users/nsr/projects/nsr-tracker/src/app/globals.css:453), [globals.css:509](/Users/nsr/projects/nsr-tracker/src/app/globals.css:509), [alert-dialog.tsx:160](/Users/nsr/projects/nsr-tracker/src/components/ui/alert-dialog.tsx:160).

**Fix/acceptance:** Apply the project's 44px mobile target policy to custom controls, or provide suitable expanded hit areas. A seven-column date picker may need to grow. Measure actual hitboxes on touch hardware. **44px is the project usability target; WCAG 2.2 AA uses 24px with exceptions, so compact controls are not automatically AA failures.** See [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

### F12 — Mobile calendar shrinks essential task content to 10px

Seven columns remain on mobile, with 10px task titles, very narrow cells, truncation, and hidden properties. At 390px, gutters leave roughly 51px per day before cell/card padding. This prioritizes preserving the desktop grid over reading and selecting work.

Evidence: [globals.css:471](/Users/nsr/projects/nsr-tracker/src/app/globals.css:471), [globals.css:503](/Users/nsr/projects/nsr-tracker/src/app/globals.css:503).

**Fix/acceptance:** Offer a mobile agenda/day list or a compact month selector with a readable selected-day list. Verify long titles, multiple tasks, and enlarged text without requiring precision taps.

### F13 — Filter footer and long labels have no small-screen reflow strategy

The footer holds an explanation and three non-wrapping buttons in one row; the action group cannot shrink. Filter groups force labels onto one line in two columns. Narrow widths, zoom, or long custom names can overflow inside a popup that hides overflow.

Evidence: [filters.tsx:66](/Users/nsr/projects/nsr-tracker/src/features/work/filters.tsx:66), [filters.tsx:69](/Users/nsr/projects/nsr-tracker/src/features/work/filters.tsx:69).

**Fix/acceptance:** Stack footer help and actions at narrow widths, allow labels to wrap, and use one column when necessary. Verify 320px and 200% text with long section/property names. This is a source layout risk pending rendering.

### F14 — Sort menu misses the shared dismissal behavior

Sort uses `<details className="relative">`, while outside-click and Escape handling only select `details.work-menu`. Choosing an item closes Sort, but clicking elsewhere or pressing Escape does not receive the same behavior as entity actions.

Evidence: [view.tsx:46](/Users/nsr/projects/nsr-tracker/src/features/work/view.tsx:46), [shell.tsx:25](/Users/nsr/projects/nsr-tracker/src/features/work/shell.tsx:25).

**Fix/acceptance:** Use a shared menu/disclosure implementation. Sort should close with Escape and an outside click, restore focus appropriately, and stay within the viewport.

### F15 — Failed title/description saves hide the attempted text

`InlineText.commit` clears the local draft before the request completes. On failure, the optimistic change is invalidated and the read view can revert to server text. The retry mechanism retains the attempted payload while mounted, so the attempt is not necessarily irretrievable, but users cannot edit that attempted text in place and may think it vanished.

Evidence: [task-detail.tsx:79](/Users/nsr/projects/nsr-tracker/src/features/work/task-detail.tsx:79), [action.tsx:59](/Users/nsr/projects/nsr-tracker/src/features/work/action.tsx:59).

**Fix/acceptance:** Keep the attempted text visible/editable until success, or show a local failed-edit state with Retry/Discard. Under network failure and revision conflict, verify the exact attempted text stays available for correction and copying.

### F16 — Unsaved dialog forms can be dismissed without preserving edits

Entity, definition, move, blocking, preference, and credential forms keep unsaved values in component state or uncontrolled inputs. Many allow Escape/outside dismissal when not pending, and settings section changes unmount forms. The note draft mechanism does not cover these forms.

Evidence: [editors.tsx:55](/Users/nsr/projects/nsr-tracker/src/features/work/editors.tsx:55), [project-settings.tsx:49](/Users/nsr/projects/nsr-tracker/src/features/work/project-settings.tsx:49), [workspace.tsx:54](/Users/nsr/projects/nsr-tracker/src/features/settings/workspace.tsx:54), [credential-form.tsx:41](/Users/nsr/projects/nsr-tracker/src/features/settings/credential-form.tsx:41).

**Fix/acceptance:** Preserve substantial drafts across accidental dismissal or guard dirty-form dismissal consistently. Do not add friction to untouched forms. Verify a typed multi-paragraph description and changed grants survive accidental Escape/outside navigation or require deliberate discard.

### F17 — A newly created secret disappears before storage acknowledgment

The created secret lives only in `CredentialsPanel` state. Closing settings or navigating to another settings section unmounts the panel and loses the secret even if “I've stored it” was never clicked. The next visit cannot reveal it again, forcing revocation and recreation.

Evidence: [credentials.tsx:17](/Users/nsr/projects/nsr-tracker/src/features/settings/credentials.tsx:17), [credentials.tsx:51](/Users/nsr/projects/nsr-tracker/src/features/settings/credentials.tsx:51), [workspace.tsx:62](/Users/nsr/projects/nsr-tracker/src/features/settings/workspace.tsx:62).

**Fix/acceptance:** Retain the one-time reveal in an appropriate in-memory parent scope until acknowledged, or explicitly handle dismissal. Do not put secrets in persistent storage or query caches. Verify closing/reopening and section switching without creating real credentials during UI QA.

### F18 — Attachment rows can crowd filenames and recovery actions

Ready/pending/failed rows use a single non-wrapping flex row containing the filename, size, state, and multiple controls. The filename can shrink, but Retry verification and other controls reserve width; narrow panels can leave very little readable filename space. This is a rendering risk, not a measured overflow failure.

Evidence: [attachments/panel.tsx:52](/Users/nsr/projects/nsr-tracker/src/features/attachments/panel.tsx:52).

**Fix/acceptance:** Let metadata/actions occupy a second row on small screens. At 320/390px, verify long filenames and every state, including readable verification and remove controls. After removal, focus should move to a surviving control rather than the removed trigger.

### F19 — Full-page search lacks the palette's result feedback and clear-filter recovery

The palette has a polite search status; the full search page does not announce loading/result counts or its empty result. Its empty copy suggests changing filters but offers no immediate clear/reset action or visible applied-filter summary outside the filter popup.

Evidence: [search.tsx:35](/Users/nsr/projects/nsr-tracker/src/features/work/search.tsx:35), [search.tsx:52](/Users/nsr/projects/nsr-tracker/src/features/work/search.tsx:52).

**Fix/acceptance:** Reuse contextual result announcements, show the active query/filter context, and offer Clear filters/Reset search. Verify a zero-hit filtered query and dynamic result changes without moving focus away from the input.

### F20 — Archived work can look blank while loading or when no archive matches

Only the projects query gets a loading skeleton in the archive surface. Sections/tasks are filtered client-side after fetching active and archived work, without a loading presentation or a definitive “No archived work in this project” state. Users can see an empty area or repeatedly load pages with no archive matches.

Evidence: [project-settings.tsx:51](/Users/nsr/projects/nsr-tracker/src/features/work/project-settings.tsx:51).

**Fix/acceptance:** Distinguish loading, no archived matches yet in loaded pages, and confirmed empty archive. Prefer the existing server archive filter where its semantics fit. Verify an active-only project, an archived project, inherited archive, delayed responses, and matches after the first page.

### F21 — Timestamps and “today” do not consistently use the saved timezone

Credentials explicitly format with the preference timezone, while activity, note history/recovery, exports, integration health, and GitHub freshness use browser-local `toLocaleString()`. Calendar and date-picker “today” also use browser-local dates. When browser and workspace zones differ, visible dates and the server's overdue state can disagree around midnight.

Evidence: [credentials.tsx:34](/Users/nsr/projects/nsr-tracker/src/features/settings/credentials.tsx:34), [task-detail.tsx:57](/Users/nsr/projects/nsr-tracker/src/features/work/task-detail.tsx:57), [calendar.tsx:15](/Users/nsr/projects/nsr-tracker/src/features/work/calendar.tsx:15), [date-picker.tsx:14](/Users/nsr/projects/nsr-tracker/src/features/work/date-picker.tsx:14), [exports.tsx:28](/Users/nsr/projects/nsr-tracker/src/features/settings/exports.tsx:28).

**Fix/acceptance:** Use one explicit timezone policy for instants and “today”, preserving date-only values as dates. Test different browser/workspace zones on either side of midnight, and identify the zone where needed.

### F22 — Server validation is summarized without field-level recovery

Work errors list field paths in a shared alert, credential validation gives a broad sentence, and preference validation flags timezone for any schema failure. Most affected inputs do not receive their server error through `aria-invalid`/`aria-describedby`, and multi-error forms lack linked error targets. Native required/pattern validation is present; this finding concerns richer/server validation.

Evidence: [action.tsx:82](/Users/nsr/projects/nsr-tracker/src/features/work/action.tsx:82), [primitives.tsx:15](/Users/nsr/projects/nsr-tracker/src/features/work/primitives.tsx:15), [credential-form.tsx:26](/Users/nsr/projects/nsr-tracker/src/features/settings/credential-form.tsx:26), [preferences.tsx:20](/Users/nsr/projects/nsr-tracker/src/features/settings/preferences.tsx:20).

**Fix/acceptance:** Map known validation paths to the relevant field with plain-language errors. For multiple errors, provide a focused linked summary after submit. Keep existing values and reserve Retry for errors that can actually succeed without correcting input.

### F23 — Filtered My work emptiness recommends creating another project

When My work returns zero tasks, its generic empty state says to create a project, including when the workspace already has projects and the current filters simply exclude all work. This misdiagnoses the situation and hides the shortest recovery path.

Evidence: [view.tsx:51](/Users/nsr/projects/nsr-tracker/src/features/work/view.tsx:51).

**Fix/acceptance:** Separate first-use emptiness from filtered emptiness. With an existing project and a zero-match priority/date filter, show Clear filters or a contextual New task action; reserve Create project for a workspace that needs one.

### F24 — Board titles truncate without a preview disclosure

Board cards force the title to one line with ellipsis and provide no title tooltip or expandable preview. The full title remains in the DOM and can be reached by opening the task; the problem is quick visual comparison of similar long tasks. Calendar and command results also truncate, so inspect those separately in their context.

Evidence: [globals.css:391](/Users/nsr/projects/nsr-tracker/src/app/globals.css:391), [board.tsx:32](/Users/nsr/projects/nsr-tracker/src/features/work/board.tsx:32).

**Fix/acceptance:** Allow a useful number of wrapped lines or provide an accessible preview on pointer and keyboard focus. Distinguish two tasks with the same first 40 characters without opening both.

## P3 findings

### F25 — Heavy client modules and dynamic icon lookup need production measurement

`WorkView` imports board, calendar, task detail, note editor, and attachment UI; the workspace settings module imports its full settings feature set. `import * as Lucide` with runtime indexing can retain a large icon set. These are credible bundle risks, but this audit did not establish a production size, INP, or load-time regression. The temporary fixture bundle deliberately combined chunks, so its size is not production evidence.

Evidence: [view.tsx:3](/Users/nsr/projects/nsr-tracker/src/features/work/view.tsx:3), [workspace.tsx:2](/Users/nsr/projects/nsr-tracker/src/features/settings/workspace.tsx:2), [task-properties.tsx:4](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:4), [calendar.tsx:4](/Users/nsr/projects/nsr-tracker/src/features/work/calendar.tsx:4).

**Next step:** Inspect a production route bundle and measure the first My work load, task opening, and settings opening. If justified, load heavy optional surfaces on demand and use an explicit registry for the allowed property icons. Do not add memoization/virtualization without evidence of a bottleneck.

### F26 — Status and priority presentation has drifted from the accepted visual system

The accepted design specifies neutral, shape-led status treatment. Rows still use monochrome glyphs and neutral priority badges, while property/board/calendar pills introduce six hues. The same priority therefore changes visual meaning between layouts. Arbitrary label colors also share a mix formula with no contrast guard.

Evidence: [DESIGN.md](/Users/nsr/projects/nsr-tracker/docs/DESIGN.md), [task-list.tsx:25](/Users/nsr/projects/nsr-tracker/src/features/work/task-list.tsx:25), [task-properties.tsx:14](/Users/nsr/projects/nsr-tracker/src/features/work/task-properties.tsx:14), [globals.css:300](/Users/nsr/projects/nsr-tracker/src/app/globals.css:300).

**Next step:** Reconcile the intended system explicitly, then use consistent shared status/priority presentations. Preserve text and shapes regardless of hue. Keep the approved 14px dense desktop typography; a blanket change to 16px desktop body text would ignore this product's existing design decisions.

### F27 — Settings sections cannot be linked or restored through normal navigation

Settings open/section/project selection live in component state, apart from the initial GitHub setup special case. Reloading or sharing a location cannot reopen the selected settings surface, and browser Back does not represent settings-section navigation. This makes troubleshooting instructions and returning to a specific project setting harder.

Evidence: [workspace.tsx:35](/Users/nsr/projects/nsr-tracker/src/features/settings/workspace.tsx:35), [workspace.tsx:37](/Users/nsr/projects/nsr-tracker/src/features/settings/workspace.tsx:37).

**Next step:** Encode an appropriate settings section/project in the URL while keeping the dialog presentation, if this is a supported product behavior. Verify reload, Back, and close preserve the underlying work context.

### F28 — Inline notes remove the editor's focus boundary

The standard note editor has an inset focus indicator, but the inline variant removes its border and overrides the focus box-shadow to none. A text caret can still indicate focus, so this alone does **not** establish a WCAG failure. The large blank inline editing region nevertheless has weak focus and editing affordance, especially before text is entered. Custom inline/property inputs and the search palette also use sub-16px font sizes on mobile; check actual iOS focus zoom.

Evidence: [globals.css:362](/Users/nsr/projects/nsr-tracker/src/app/globals.css:362), [globals.css:441](/Users/nsr/projects/nsr-tracker/src/app/globals.css:441), [globals.css:443](/Users/nsr/projects/nsr-tracker/src/app/globals.css:443), [notes/editor.tsx:106](/Users/nsr/projects/nsr-tracker/src/features/notes/editor.tsx:106).

**Next step:** Give the focused inline editor a quiet, persistent boundary or background treatment without adding idle visual noise. Verify Tab focus, empty-editor entry, selection formatting, reduced motion, and mobile keyboard/zoom behavior.

## Shared component review

These are source observations, not browser-tested passes.

| Component file | Existing strengths | Follow-up |
| --- | --- | --- |
| `button.tsx` | Variants, focus styles, disabled styling, Radix slot composition | Verify rendered hitboxes, especially slot overrides. Audit custom raw buttons against the same interaction standard. |
| `input.tsx` | Visible focus, invalid/disabled states, mobile 16px text | Most product forms do not wire field-specific server errors. Custom editors bypass these protections. |
| `native-select.tsx` | Native keyboard behavior, focus styling, decorative chevron hidden | Mobile font size and long selected options need device checks. Verify widths where wrapper defaults to content size. |
| `checkbox.tsx` | Native accessibility through Radix, enlarged pseudo hit area, focus style | Verify actual target bounds and label interaction. Its `data-checked` classes are valid here: imported shadcn variants support Radix `data-state`. |
| `dialog.tsx` | Radix modal behavior, named close control, focus capture/restoration hooks | F01. Check nested dialogs, missing/disconnected return targets, dirty dismissal, and viewport height with keyboard open. |
| `alert-dialog.tsx` | Action/cancel composition and modal structure | Check final slot hitbox rules and initial safe focus; confirmation flows exist and should be preserved. |
| `field.tsx` | Group, label, description, fieldset, legend, error building blocks | Use the available `FieldError`/described-by wiring in feature forms. |
| `label.tsx` | Native label association through Radix | Keep `htmlFor` and IDs unique in nested/parallel forms. |
| `badge.tsx` | Compact semantic variants | Fixed height and no wrapping need long-label/zoom checks. Do not use color as the sole state cue. |
| `alert.tsx` | Default alert role and description slots | Error alerts are present; avoid mounting many identical query errors at once. Keep messages actionable. |
| `empty.tsx` | Reusable title/description/action composition | Correct message selection depends on screen context: F19, F20, F23. |
| `skeleton.tsx` | Reusable loading shape; reduced motion overridden globally | `LoadingRows` has a label but no live status/busy semantics. Consider a shared announced loading state without duplicate announcements. |
| `separator.tsx` | Decorative default and orientation support | No specific source defect identified. |
| `brand/logo.tsx` | Vector asset, theme-compatible `currentColor`, decorative hiding | Preserve brand artwork. Verify small-size legibility; do not interpret SVG path complexity as a measured performance bug. |

All 13 files under `src/components/ui` were reviewed, including `field.tsx`; the brand logo was reviewed additionally. Higher-level shared controls reviewed include `Group`, `ProgressLine`, `StatusGlyph`, `QueryError`, `LoadMore`, `OfflineToast`, task rows/links, property popovers/choices, date picker, filters, and action/decision feedback.

## Contrast calculation snapshot

Figures are approximate and rounded for reporting. Recheck computed colors in the actual browser; passing values near a threshold need care.

| Pair | Light ratio | Dark ratio | Interpretation |
| --- | ---: | ---: | --- |
| Muted foreground / background | 6.02:1 | 8.00:1 | Declared base tokens exceed 4.5:1. |
| Muted foreground / inner group | 6.02:1 | 6.71:1 | Base secondary text is not the main contrast problem. |
| Gray pill text / pill background | 4.96:1 | 6.22:1 | Passes for this declared mix. |
| Blue pill text / pill background | 4.93:1 | 6.08:1 | Passes for this declared mix. |
| Amber pill text / pill background | **3.85:1** | 7.28:1 | Light normal text falls below 4.5:1. |
| Purple pill text / pill background | 5.30:1 | 5.76:1 | Passes for this declared mix. |
| Green pill text / pill background | 4.54:1 | 6.50:1 | Light value is close to the threshold. |
| Red pill text / pill background | 5.08:1 | 5.74:1 | Passes for this declared mix. |
| Backlog glyph / inner group | **2.63:1** | 6.35:1 | Light meaningful glyph falls below 3:1. |
| Canceled glyph / inner group | **1.48:1** | **1.78:1** | Meaningful glyph falls below 3:1 in both themes. |

Not covered by these calculations: arbitrary user label colors, selected/hovered/disabled states, all focus rings, translucent popup composition, native browser controls, and forced-colors mode. No contrast score or compliance percentage is assigned.

## Remediation sequence

1. **Restore core reachability:** F01–F03, then reproduce at the exact breakpoint boundaries and verify scroll/placement under zoom.
2. **Make accepted input reliable:** F04, F09, F15–F17, F22. Test slow responses, validation, conflict, cancel, and accidental navigation together.
3. **Repair accessibility and mobile operation:** F05–F13, then verify keyboard, screen reader, text zoom, and touch on actual rendered controls.
4. **Improve recovery and scanability:** F14, F18–F24, then reconcile presentation and measure performance before optional optimization, F25–F28.

## Browser acceptance still required

Use the existing isolated fixture preview for reversible UI interactions, with no Redis configuration or client in tests. Use signed-in staging separately for real Next navigation, authorization, provider, and storage behavior.

| Dimension | Required checks |
| --- | --- |
| Widths | 320, 375/390, 639, 640, 700, 767, 768, 1023, 1024, 1439, 1440px; landscape phone and short desktop window. |
| Text/reflow | 200% text enlargement; 400% browser zoom / 320px equivalent for relevant content; long unbroken names, duplicate names, long references, file names, and translated-length labels. |
| Input | Keyboard only, touch/coarse pointer, mouse. Date grid, listbox, menus, nested modals, task close, and create/edit focus restoration. |
| Accessibility | VoiceOver or NVDA names/values/order; asynchronous loading/results/save/error announcements; actual computed contrast; forced colors; reduced motion; focus not hidden by sticky UI. |
| Appearance | Light, dark, system changes; all status categories; empty, populated, selected, hovered, focused, disabled, busy, error, offline, retained stale data. |
| Editing | Delayed responses; rapid multi-value/property edits; failed title/description save; concurrent revision; cancel/escape/outside click; note recovery and local-storage failure. |
| Navigation | Real browser Back/Forward, query persistence, opening/closing tasks without losing scroll, cross-project navigation, settings close and reload behavior. |
| Data scale | Long search result sets, paginated hierarchies, board status pagination, archive matches beyond page one, many custom properties/options, long notes/history. |
| Providers | Owner sign-in denial/retry, GitHub installation/repository discovery and revoked access, refresh latency, import duplicate, real file transfer/removal, export completion/download. |

The existing `tests/ui/acceptance.js` is a useful partial starting point. It does not cover this entire matrix and was not executed successfully in this audit. No “all screens passed” claim is warranted until the outstanding runtime checks are completed.
