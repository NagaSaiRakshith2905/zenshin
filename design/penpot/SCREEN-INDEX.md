# Screen index

## 02 Access and planning

- **A01** Owner sign-in — Controlled provisioning; no public registration.
- **A02** My work / first visit — After sign-in; no sample tasks are inserted.
- **A03** Create project — Prefix: 2–10 uppercase letters/digits; starts with a letter; unique.
- **A04** Project overview — Progress excludes canceled / archived leaves; overview owns its own note.
- **A05** Create section — Invalid nesting explains the depth limit and leaves the form intact.
- **A06** Section / direct tasks — Direct tasks by default; subtree inclusion is explicit and shareable.
- **A07** Section / plan — Lifecycle changes are explicit; completing tasks does not complete a section.
- **A08** Edit project — Archive is a separate labeled action in the project menu.

## 03 Work and execution

- **E01** My work — Non-overlapping groups: overdue first, then status. Blocked work stays visible.
- **E02** All tasks / list — Filters and view selection remain in URL state; sorting does not rewrite ranks.
- **E03** All tasks / board — Column order follows workflow. Drag changes status; menu alternative remains available.
- **E04** Task detail / side panel — Desktop ≥1440 inline; 1024–1439 overlay. Back restores the list state.
- **E05** Task / full page — Open full page for long notes and stable deep links. Activity and integrations continue below.
- **E06** Create task — Optional properties: due date, labels, description, parent task. C opens outside editors.
- **E07** Task / links, files and activity — An integration outage preserves local task content and shows cached freshness.
- **E08** Move / organize task — Move carries subtasks; cannot move between projects or add a third task level.

## 04 Search notes and files

- **C01** Global search — Title, description, note text, reference and labels; no attachment-content search.
- **C02** Filters and sort — Ready to work = Ready with no manual or dependency blocker.
- **C03** Search / no results — Empty results retain query and current filter context.
- **C04** Note history / preview — Project, section and task notes share the same history pattern.
- **C05** Attachments / transfer states — Attachments belong to project / section / task; notes link only ready files.
- **C06** Note editor / long document — Formatting stays within the supported structured note schema.

## 05 Settings and integrations

- **S01** Settings / general — Light and dark share the same hierarchy; explicit theme override persists.
- **S02** Project workflow — Custom labels map to canonical categories used by browser and MCP.
- **S03** Project labels — Label names max 40 characters; search includes label names.
- **S04** Repositories and PR rules — Read-only GitHub App. Rules never mark Done or regress task status.
- **S05** Import GitHub issue — Copies title and body once; provenance and per-project deduplication survive unlinking.
- **S06** Agent credentials — Secrets are shown once; revoke cuts access. No OAuth MCP discovery in V1.
- **S07** Create agent credential — Next: show secret once with Copy and explicit storage instruction.
- **S08** Credential / shown once — Wireframe contains no real secret. Creation must verify explicit grants.
- **S09** Integration health and exports — Exports are owner-only. Restore operations require tested operational recovery.

## 06 Recovery and safeguards

- **R01** Complete parent task — Keep parent open is the cancel choice. Transition remaining nonterminal subtasks atomically.
- **R02** Reopen completed sections — No work is added until all affected completed ancestors are explicitly reopened.
- **R03** Archive work — Archive is reversible. It leaves statuses, notes and dependency links intact.
- **R05** Permanently delete archived work — Remove external dependencies first; owner only. Backup retention can last 30 days.
- **R04** Archived work / restore — Archive state is independent from status and section lifecycle.
- **R06** Note conflict / compare — Applies to autosave conflicts and recovered drafts; retain attempted edits on failure.
- **R07** Task controls / dependency validation — Manual and computed blocking are independent. Canceled / archived prerequisites need resolution.
- **R08** Sign out / draft recovery — Never silently replace a newer server note with a recovered draft.

## 07 Mobile

- **M01** Mobile / My work — 390 × 844 viewport shown at actual size.
- **M02** Mobile / navigation — 390 × 844 viewport shown at actual size.
- **M03** Mobile / task detail — 390 × 844 viewport shown at actual size.
- **M04** Mobile / create task — 390 × 844 viewport shown at actual size.
- **M05** Mobile / section and board — 390 × 844 viewport shown at actual size.
- **M06** Mobile / note and files — 390 × 844 viewport shown at actual size.

