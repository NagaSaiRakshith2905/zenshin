# MCP and API contract

Status: proposed contract implementing accepted scope. Names below are canonical targets for implementation, not claims that endpoints already exist.

## Actors and permission presets

Every operation receives a server-constructed actor: owner user ID, kind human/agent/system, credential ID when applicable, project grants, and scopes. Browser owner sessions have full owner privileges. GitHub/cron system actors can perform only their explicitly defined jobs.

| Scope | Capability |
| --- | --- |
| read | Read/search permitted projects, tasks, sections, current notes, activity, repositories, links, and authorized attachments. |
| write | Create/update/move sections and tasks, update/append notes, apply existing labels, set/clear values of existing custom properties, manage dependencies, link/import GitHub items, request refresh, transition nonterminal work and send In review. |
| upload | Initiate and finalize attachment uploads on permitted targets. |
| archive | Archive/restore permitted sections/tasks after explicit required choices. |
| complete | Mark tasks Done, Complete all subtasks, and mark sections Completed. Requires write as well. |

Read only preset: read. Contributor preset: read + write + upload. Archive and complete are explicit independent opt-ins. Canceled is a normal write outcome, with an explicit transition reason captured in activity when supplied. Agent credentials cannot archive projects.

Owner-only: project creation/configuration/archive/deletion; workflow, label and custom property definitions; note history restoration; credential management; GitHub installation/repository connections and automation settings; exports; permanent deletion of any item. Agent tools never bypass these restrictions, including through bulk operations or parent changes.

Default key expiry is 90 days, owner configurable; project grants are explicit. No implicit all-future-project access or ability to mint credentials. Grant changes and revocation affect the next request. A key's display label identifies its agent/client in activity but is not trusted user-supplied attribution on each request.

## Transport and clients

- Remote endpoint: `https://<domain>/api/mcp`, Streamable HTTP, stateless requests, explicit Authorization bearer key. No legacy SSE endpoint.
- Compatibility gate: current Codex and Claude Code versions available at implementation, using environment-backed secrets. Provide tested local configuration samples in their respective documented formats.
- Do not include actual tokens in repository config or examples. Do not advertise OAuth resource metadata without implementing the corresponding authorization server.
- Protocol errors follow MCP; tool/business errors return structured content with stable codes and a concise human message. Permission checks apply to resources and tools alike.

## Common data contracts

- Entity IDs: UUIDs. Display task_reference separately, such as TRACK-42. APIs accept UUIDs for writes; a resolve/read helper can accept a task reference.
- Mutation input: target ID, expected_revision when editing existing mutable content, fields or explicit transition parameters, optional idempotency_key. Create operations also accept an idempotency key.
- Responses include IDs, references, current revision, updated_at, and relevant computed fields. Request full note/relationships explicitly rather than embedding every note in list results.
- Lists: cursor + limit (50 default, max 100), filters, sort. Response: items, next_cursor, has_more. Filter and sorting semantics match the browser.
- Dates: ISO calendar date strings, e.g. 2026-11-15. Event timestamps: ISO UTC instants. Timezone comes from owner preferences.
- Archived items require include_archived=true and normal authorization. Effective archive is reflected explicitly.
- Tool input cannot set owner_id, actor identity, arbitrary permission metadata, raw SQL, R2 object keys, or trusted GitHub state.

## Tool surface

| Tools | Scope and behavior |
| --- | --- |
| list_projects, get_project | read; return permitted projects and context only. |
| list_sections, get_section | read; include hierarchy/lifecycle and computed progress. |
| create_section, update_section, move_section | write; hierarchy limits, ancestor reopening choices, revisions. Completing needs complete. |
| list_tasks, get_task | read; filters, references, relations, blocked reasons and revisions. |
| create_task, update_task | write; status/parent/dependency-sensitive changes go through explicit service validation. Cannot bypass complete permission with a status field. |
| move_task, convert_task | write; same-project location moves; parent/subtask invariants. |
| transition_task | write; target status, expected_revision, optional completion/reopen choices; Done requires complete. |
| list_labels, set_task_labels | read / write; choose existing labels only, replace with revision checks. |
| list_properties, set_task_properties | read / write; list a project's definitions with types and options. Set or clear values by definition ID with expected_revision. The values must match the type: an option ID for Select, option IDs for Multi-select, an ISO date for Date, and so on. Unknown definitions or options return validation_error with the valid choices. get_task and list_tasks return values keyed by definition ID; list_tasks accepts the property filters and sorts from SPECIFICATION.md. |
| add_dependency, remove_dependency | write; validate same-project DAG and reject parent/descendant relationships. |
| get_note, update_note, append_note | read / write; bounded validated document JSON. Append is an atomic append operation; never replace the entire document with a stale copy. |
| list_attachments, get_attachment_download | read; download returns five-minute signed URL after target authorization. |
| begin_attachment_upload, finalize_attachment_upload | upload; returns presigned URL + exact required headers/instructions, then verifies actual bytes. |
| archive_item, restore_item | archive; sections/tasks only, explicit affected-item/dependency choices and revisions. |
| list_repositories, list_github_issues | read; connected accessible repositories; issue browsing is on demand and paginated. |
| link_github_item, unlink_github_item, import_github_issue | write; validate repository/project, prevent duplicate imports, no GitHub writes. |
| refresh_github | write; enqueue/coalesce authorized refresh, return job/current freshness state; rate limits still apply. |
| search, list_activity | read; ownership/project grants and archive semantics apply to results/counts. |

Tool discovery itself must not leak entity names or secret values. Expose only bounded read/write tools; no universal execute tool or arbitrary URL fetch.

## Decisions, conflicts, and idempotency

Stable domain error codes:

| Code | Meaning / expected response |
| --- | --- |
| unauthenticated | Missing/invalid/expired/revoked key; replace credentials. |
| forbidden | Valid actor lacks scope or owner-only capability. Do not disclose inaccessible entity details. |
| not_found | Missing or inaccessible target; use non-enumerating responses. |
| validation_error | Invalid fields/limits; return field paths and valid choices. |
| conflict | Revision mismatch; return current revision/allowed current data; reread and deliberately retry. |
| decision_required | No mutation committed; return required options and affected IDs. |
| dependency_cycle / hierarchy_limit | Invalid graph mutation; return safe relevant explanation. |
| duplicate_import | Existing task reference is returned if authorized; offer open/restore. |
| rate_limited | Return retry timing; never retry in a tight loop. |
| integration_unavailable | Local data remains usable; include freshness/retry state. |
| upload_rejected | Actual file failed verification; cleanup queued, not ready. |
| idempotency_conflict | Same key used with different input. |

Example parent transition:

```json
{
  "task_id": "<uuid>",
  "expected_revision": 7,
  "target_status_id": "<done-status-uuid>",
  "completion_action": "complete_all",
  "idempotency_key": "<unique-request-id>"
}
```

Without completion_action when unfinished subtasks exist, return decision_required with keep_open and complete_all. Do not transition the parent first. A key without complete cannot choose complete_all. A write-only key may choose In review instead.

Adding/reopening work beneath completed sections similarly returns affected completed ancestor IDs and requires reopen_completed_ancestors=true. The whole change commits atomically. Dependency-bearing archives require explicit acknowledgement of the listed active dependents.

External calls and uploads are not wrapped in an open database transaction. Use pending states and retryable jobs. On timeout, callers retry with the original idempotency key, not a new one.

## Browser/API routes

`/api/auth/*`: Better Auth routes. `/api/mcp`: agent-only MCP. `/api/github/webhook`: signed event receiver. `/api/internal/cron`: cron-secret authentication. Keep these separate from domain routing.

`/api/v1/projects`, `/sections`, `/tasks`, `/labels`, `/properties`, `/notes`, `/attachments`, `/github`, `/search`, `/activity`: typed domain adapters, scoped nested/ID routes as appropriate. GET reads; POST creates/commands; PATCH revisioned updates. Permanent deletion and management routes require an owner session, never a bearer agent key. Browser callers use protected sessions/origin checks; domain calls accepting keys construct the same restricted actor as MCP.

Use HTTP 401/403/404/409/422/429/503 consistently in API routes; MCP maps the same service errors into structured tool results. Return request IDs for support/debugging without exposing stack traces or secrets.

## Acceptance scenario

An authorized contributor connects from each required client, finds Ready work, reads parent/section context, creates a subtask, appends progress notes, uploads a small file directly to R2, links a PR, and moves the task In review. Activity shows the credential. Attempts to mark Done, read another ungranted project, create a key, or permanently delete fail. Revoking the key makes its next request fail.

Sources: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Better Auth API keys](https://better-auth.com/docs/plugins/api-key), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
