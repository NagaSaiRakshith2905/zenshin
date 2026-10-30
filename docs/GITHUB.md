# GitHub App setup and acceptance

Phases 12–13 implement the application paths. No GitHub App, installation, organization approval or secret has been provisioned by this work. Live acceptance remains required.

## Register a separate App

Use an App owned and controlled by the workspace owner, separate from the human-login OAuth App. Install it only on selected repositories in the owner's personal account or authorized organizations. Organization administrators can require approval; wait for that approval rather than broadening access.

Request repository **read-only** permissions for Metadata, Issues, Pull requests, Checks and Commit statuses. Do not grant contents, administration or any write permission. Installation discovery rejects unexpected/write permissions. Subscribe to Issues, Pull request, Check run, Check suite, Status, Repository, Installation and Installation repositories events. Disable user authorization during installation; this integration uses installation tokens, not the login OAuth token.

Configure these server-only variables separately per environment:

| Variable | Meaning |
| --- | --- |
| `GITHUB_APP_ID` | Positive decimal App ID. |
| `GITHUB_APP_SLUG` | App slug used to build the installation link. |
| `GITHUB_APP_PRIVATE_KEY` | PEM private key; literal `\n` escapes are accepted. |
| `GITHUB_APP_WEBHOOK_SECRET` | At least 32 characters; match the App's webhook secret. |

Set the webhook URL to `${APP_ORIGIN}/api/github/webhook`, enable SSL verification, and set the setup URL to `${APP_ORIGIN}/api/github/setup`. The setup route requires an owner browser session and opens GitHub settings. Its `installation_id` query value never grants access or changes connections. Installation discovery verifies installations through the App API. No additional OAuth callback/client secret is used for this App. `GITHUB_APP_CALLBACK_URL`, if retained in an operator inventory, refers to this setup URL and is not read by the runtime.

Apply migration `0007_overjoyed_black_cat.sql` through the normal reviewed migration runner. It adds an installation request lease and durable rate-limit deadline; it does not change existing task data. Runtime never applies migrations.

## Owner workflow

1. Open Settings → select a project → GitHub → Load installations. Install the App if needed, then load again after organization approval.
2. Select an active installation, page through its accessible repositories and Connect the desired repositories. Projects can share repositories.
3. Browse issues on demand and choose an import section and status (root/Backlog by default). Import copies the title and converts the body into a supported rich-text note. Unsupported HTML/tables/nested Markdown remain text; remote images are never fetched. Task-title and note size limits still apply.
4. Link an issue/PR by connected repository, type and number in task details. Unlinking does not remove import provenance. An archived import offers its existing task; permanent deletion frees the mapping.
5. Enable each automation rule separately and select a compatible target status. Defaults are disabled. Saving an enabled rule, changing links or reconnecting establishes a baseline. Historical opens/merges do not move tasks.

The PR-open rule moves only Ready → In progress on a new non-draft open or an observed draft-to-ready event. The merged rule moves only In progress → In review when every linked PR has recent verified, non-draft merged state and at least one merge is after the baseline. Closed-unmerged, missing, inaccessible and stale data block that rule. Archived tasks and tasks under completed sections do not transition. No-op events are persisted, so moving a task back cannot replay them. Parent/subtask statuses remain independent; no rule marks Done.

## Refresh and failure behavior

The shared task-link read service enqueues/coalesces refresh when cached item data is over 60 seconds old. It returns cached state immediately with Last refreshed, Refreshing, Stale or Connection unavailable. The GitHub query refetches on mount, navigation and tab focus; there is no timer/polling/cron. Manual Refresh enqueues the same jobs; Check refresh reads their latest cached result and advances after-request work. A missed webhook is repaired on the next stale read, not by an unattended minute sweep.

Webhooks verify the exact body with HMAC-SHA256 before parsing, persist delivery IDs and durable refresh hints atomically, and return 202. Bodies over 2 MiB are rejected; oversized/missed deliveries are repaired on read. Fan-out is bounded to 100 tracked items per job. Webhook payloads are hints, never trusted issue/PR state. Signed installation deletion/suspension immediately disables access; reload installations to verify reactivation.

Installation requests are serialized with a 25-second database lease, outside domain transactions; provider calls honor cancellation. Item jobs check revision and remote update time before committing. Conditional ETags/Last-Modified markers share the same path for webhook/read/manual refresh. Primary reset and secondary Retry-After limits persist per installation. Rate-limit/lease deferrals do not consume job attempts. Ordinary failures use bounded exponential retry with jitter and retain cache/local content. The existing request runner defaults to 3 jobs/3 seconds; staging should measure provider latency within its configurable 5-second maximum.

PR checks/statuses are cached by exact head SHA. Each summary includes up to 100 check runs and 100 statuses and labels incomplete results; no successful summary from an old head is displayed for a new one. A verified repository plus item 404/410 is displayed as deleted; repository access failure is unavailable. GET redirects for repository renames are bounded and allowed only on `https://api.github.com`; tokens never follow an off-origin redirect. Reconciliation validates stable repository/item IDs before updating names and state.

## Verification before enabling in production

Local unit tests cover JWT/signature verification, conditional requests, quota headers, safe Markdown conversion and event eligibility. `tests/integration/github.test.ts` uses the guarded disposable PostgreSQL harness and a fake GitHub provider, with no Redis. Run it and all existing integration suites before applying the migration to an application database. This session could not reach the local database/Docker socket, so PostgreSQL results are pending.

On isolated personal and organization staging repositories, verify installation/approval/removal, repository pagination, issue-vs-PR browsing, snapshot import/deduplication, archived Open existing/restore, unlink/reimport after deletion, current-head checks, signed delivery replay and a missed webhook repaired by a read after 60 seconds. Exercise suspension/lost access, deleted issues, renamed repositories, 304 responses, rate-limit/backoff, concurrent manual refresh and stale-response protection. Enable each rule against custom statuses, link historical open/merged PRs, then test new opens, draft-to-ready, multiple merges, closed-unmerged/draft/unavailable states, manual status races and replay after returning to Ready. Verify system activity occurs exactly once.

References: [installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation), [JWT generation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app), [webhook signatures](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [App best practices and rate limits](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app).

## Shared service and HTTP entry points

`createGithubService(db, provider?)` is the common browser/API/future-MCP boundary; tests inject only the provider. Provider credentials/state cannot be supplied through transport inputs.

| Route under `/api/v1/github/` | Method/input | Access |
| --- | --- | --- |
| `installations` | GET `page` | Owner session; discover and persist App installations. |
| `discover-repositories` | GET `installationId`, `page` | Owner session; verify accessible repositories. |
| `repositories` | GET `projectId` | Project read; connected repository list. |
| `issues` | GET `projectId`, `repositoryId`, `page` | Project read; on-demand issue candidates and next page. |
| `links` | GET `taskId` | Project read; cached links/checks/freshness, enqueue if stale. |
| `rules` | GET `projectId` | Owner session; rule settings. |
| `connect` | POST `projectId`, `repositoryId`, `connected` | Owner session. |
| `import` | POST `projectId`, `repositoryId`, issue `number`, optional `sectionId`/`statusId`/`reopenCompletedAncestors` | Project write; Done also requires complete. |
| `link` | POST `projectId`, `repositoryId`, `taskId`, `type` (`issue`/`pr`), `number`, `expectedRevision` | Project write. |
| `unlink` | POST `taskId`, `linkId`, `expectedRevision` | Project write; provenance survives. |
| `rules` | POST `projectId`, `ruleKind`, `enabled`, `targetStatusId`, `expectedRevision` (0 for creation) | Owner session. |
| `refresh` | POST `taskId` | Project write; coalesced, rate-limited reconciliation. |

POST uses the existing `{ "input": { ... } }` envelope and requires `Idempotency-Key`. Browser writes require the canonical origin; bearer calls retain explicit credential scopes/project grants. Provider failures map to `integration_unavailable` with a safe retry deadline when known. Normal local task reads do not call GitHub; tracked GitHub reads use the shared `taskLinks` service.
