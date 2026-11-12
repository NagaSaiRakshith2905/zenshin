# UI/UX audit remediation — Zenshin

Implemented on 1 November 2026 against the existing working tree. All 28 numbered findings in the [audit](UI-UX-AUDIT-2026-11-01.md) have corresponding source changes. Runtime acceptance is partial; the evidence column distinguishes checks performed from checks still needed.

## Changes and evidence

| Finding | Implemented change | Evidence / remaining check |
| --- | --- | --- |
| F01 — Settings breakpoint | Settings stays vertical until `md`, matching sidebar sizing. | Chrome fixture inspected at 700px. Full boundary matrix is in the acceptance script, not yet run. |
| F02 — Search scrolling | Search uses the constrained `work-view` and inner scroll structure. | Source review; long-result wheel/touch/keyboard acceptance remains pending. |
| F03 — Filter placement | Radix portal, viewport collision handling, bounded height and end alignment on Search. | Desktop and 390px fixture checks passed. Complete width/zoom matrix remains pending. |
| F04 — Ignored property edits | Busy fieldset, disabled triggers and portal options, saving announcement; inline property creation/editing also blocks conflicting requests. | SSR assertions verify lockout. Delayed-save browser acceptance was added but not run. |
| F05 — Pill contrast | Shared pill text now uses the theme foreground on a neutral muted surface. Arbitrary label colors appear only in decorative dots. | Token/source review. Full rendered contrast sweep remains pending. |
| F06 — Status glyphs | Stronger backlog/canceled glyph contrast; canceled includes a diagonal mark. | Source review. Full rendered surface/state contrast sweep remains pending. |
| F07 — Single-letter shortcut | Create now uses Alt+Shift+N, with a visible hint; editing/modal exclusions remain. | Source review; keyboard acceptance added. |
| F08 — Property names | Triggers include field context and visible value; custom inputs and option lists have contextual names. | SSR assertions pass. Screen-reader check remains pending. |
| F09 — Property focus | Enter/Escape restore the value trigger; saves defer focus until the disabled control becomes available. Pointer blur does not steal focus. | Source review. Live save/error/conflict focus checks remain pending. |
| F10 — Date grid | Required row ownership, one tabbable date, arrow/Home/End/Page navigation. | SSR structure and date navigation unit tests pass. Assistive-technology check remains pending. |
| F11 — Touch targets | Coarse-pointer and mobile rules enlarge custom controls, nested navigation, date buttons and checkbox hit areas. Custom editable fields use 16px text. | Source review and 390px fixture inspection. Real-device/zoom target sweep remains pending. |
| F12 — Mobile calendar | Selectable dates with task counts, followed by readable selected-day task cards and properties. | Selected a day containing three tasks at 390px; cards were readable and remained within the viewport. |
| F13 — Filter reflow | Labels wrap and footer explanation/actions reflow while the form body scrolls independently. | 390px fixture check passed with Reset, Cancel and Apply reachable. |
| F14 — Sort dismissal | Sort participates in the shared `work-menu` dismissal behavior. | Source review; keyboard/outside-click acceptance remains pending. |
| F15 — Failed text saves | Title/description keep the attempted draft until success, with edit/retry/discard recovery and captured revision. | Source review. Transport/conflict simulation in a running app remains pending. |
| F16 — Form drafts | Owner-scoped in-memory drafts cover entity, definition, move, blocking, preference and credential forms; successful saves or explicit discard clear them. | Draft-store unit tests pass; a task title survived close/reopen in Chrome. Other forms/error paths need runtime acceptance. |
| F17 — Secret reveal | Unacknowledged reveal state lives in the workspace parent until acknowledgment, rather than the credentials panel. | Source review; fake credential fixture and acceptance checks added. No real credential was created. |
| F18 — Attachment rows | Mobile rows wrap filename/metadata above actions, keeping recovery controls reachable. | Source review. Long-file-name and transfer-state device checks remain pending. |
| F19 — Search recovery | Loading/result announcements, active filter group context, Clear filters and Reset search actions. | Filter-state tests pass. Spoken announcements and long-result runtime checks remain pending. |
| F20 — Archive states | Separate initial loading, error and empty states; archived task query; wording distinguishes loaded matches from a complete empty archive. | Source review. Slow/paginated archive acceptance remains pending. |
| F21 — Timezone | Shared workspace timezone and timestamp helpers cover calendar/date-picker Today, task activity, notes, exports and integrations. | Date/timezone unit tests pass, including day boundaries. Cross-screen preference-change acceptance remains pending. |
| F22 — Validation | Server issue paths reach named fields; `aria-invalid`/descriptions, focused linked form summaries, preserved values, and no blind validation Retry. Work, preference, credential and GitHub form paths are connected. Outside-form summaries use plain text rather than dead links. | Field-mapping, SSR association and HTTP error serialization tests pass. Multi-error keyboard checks remain pending. |
| F23 — Empty My work | First-use, filtered emptiness and existing-project emptiness now offer the appropriate project/task/filter recovery. | Source review and filter helper tests. Runtime empty-state matrix remains pending. |
| F24 — Board titles | Full wrapping titles with due dates in normal flow, avoiding truncation and overlap. | Source review. Long-title/zoom board acceptance remains pending. |
| F25 — Client bundle | Explicit allowed-icon imports replace the Lucide namespace; rich note editor loads lazily behind Suspense. | Paired production builds and manifest-based chunk measurement completed; see below. |
| F26 — Visual consistency | Status/priority pills use the accepted neutral system; custom labels retain decorative color cues and status names remain explicit. | Source review and dark-theme fixture inspection. Full light/dark state review remains pending. |
| F27 — Settings URLs | Section/project selection uses query parameters, preserves task/view context and supports normal router navigation and GitHub setup return. | URL helper tests pass; fixture URL changes observed. Real Next.js Back/Forward/deep-link acceptance remains pending. |
| F28 — Note focus | Inline editor has a visible inset focus boundary and mobile text avoids input zoom. | Source review. Keyboard, high-contrast and real-device checks remain pending. |

Drafts and the unacknowledged credential reveal are memory-only. They survive component dismissal/navigation within the current signed-in workspace, not a page reload or sign-out. Credential secrets never enter persistent storage or query caches.

## Verification performed

- `pnpm lint` — passed, no warnings.
- `pnpm typecheck` — passed, including Next route type generation.
- `pnpm test` — 40 files, 189 tests passed. No Redis clients, connections, mocks or test environment variables were added.
- Production `next build --webpack` — passed in an isolated source copy using the installed dependencies and the repository configuration. The isolated copy excludes environment files. The original output directory could not be cleaned because of an existing filesystem permission error; it was left intact.
- `git diff --check` — passed.
- Chrome manual checks used the temporary offline component fixture described in [tests/ui/README.md](../tests/ui/README.md), not the authenticated production app. The fixture's auth/navigation compatibility shims stayed outside application source.

## Bundle measurement

The before/after builds use the same installed dependencies, build mode and repository configuration. The before copy restores the UI sources captured before this implementation; unrelated existing work remains in both copies.

Measurement sums the unique JavaScript chunks referenced by the workspace settings and work-view client entries in the workspace page's client-reference manifest. Gzip size is the sum of each referenced chunk compressed separately. Lazy editor chunks are excluded until requested. This is a reproducible chunk-size comparison, not a whole-page transfer or responsiveness measurement.

| Referenced workspace client chunks | Before | After |
| --- | ---: | ---: |
| Unique chunks | 14 | 10 |
| JavaScript bytes | 1,925,795 | 588,850 |
| Sum of gzipped chunk bytes | 574,335 | 198,590 |

The measured gzip total decreased **65.4%**. This does not establish LCP, INP or real network transfer improvements.

## Remaining release acceptance

Run the extended fixture acceptance script when loopback serving and the approved browser CLI are available. Then use a running authenticated app for real Next navigation, network failures, revision conflicts, provider/storage operations and session behavior. Complete keyboard/screen-reader, 200% zoom, light/dark contrast, real-device touch and the full width matrix before treating accessibility and visual acceptance as complete. The numbered source findings are implemented; these runtime checks are not represented as passed.
