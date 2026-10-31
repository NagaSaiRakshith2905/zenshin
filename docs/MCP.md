# MCP setup and acceptance

Phase 14 application code is implemented. Local protocol tests cover current and legacy stateless clients; the PostgreSQL and real Codex/Claude Code staging acceptance gates remain open.

## Endpoint and authentication

Use the complete deployment URL ending in `/api/mcp`. POST serves Streamable HTTP through the official `@modelcontextprotocol/server` **2.4.0** built-in `createMcpHandler`. It supports the 2026-07-28 per-request protocol and stateless 2025-era initialization/calls from the same tool definition. Each HTTP request authenticates the bearer key and constructs a fresh restricted actor and server; there is no MCP session or permission cache. Authenticated GET/DELETE return 405. There is no legacy `/sse` endpoint, OAuth discovery, resource metadata, or OAuth login flow.

The SDK's native Web handler supplies the transport directly in the Next.js Node route, so a separate Vercel MCP wrapper is unnecessary. Origin and Host are checked against `APP_ORIGIN`. An Origin header is optional for command-line clients; a supplied foreign Origin is rejected. Responses are private/no-store and carry `X-Request-ID`. POST bodies are limited to 1,200,000 bytes. Authenticated requests schedule the same bounded durable jobs used by the browser.

Create a key in **Settings → Agent credentials**, selecting explicit projects. Contributor grants read/write/upload; complete and archive remain separate opt-ins. An owner cookie alone never authenticates MCP. New key secrets are shown once and never copied into the configuration examples.

## Client configuration

Settings provides separate **Copy Codex configuration** and **Copy Claude Code configuration** buttons. Each uses the current site's origin and an environment-variable reference, without embedding the key. Set `ZENSHIN_MCP_TOKEN` securely in the environment that launches your client. Do not paste keys into chat, shell history, tracked files or client configuration.

For Codex, merge this entry into your user `~/.codex/config.toml`, replacing only the example URL:

```toml
[mcp_servers.zenshin]
url = "https://your-deployment.example/api/mcp"
bearer_token_env_var = "ZENSHIN_MCP_TOKEN"
```

For Claude Code, merge this into your local `.mcp.json`, replacing only the example URL. Keep the `${ZENSHIN_MCP_TOKEN}` reference literal:

```json
{
  "mcpServers": {
    "zenshin": {
      "type": "http",
      "url": "https://your-deployment.example/api/mcp",
      "headers": {
        "Authorization": "Bearer ${ZENSHIN_MCP_TOKEN}"
      }
    }
  }
}
```

Restart the client after environment/configuration changes. Inspect its MCP status; for Claude Code use `/mcp`, and for Codex inspect the connected server/tools in the client. Do not run an MCP OAuth login for this explicit-key endpoint. Client binaries available during implementation were **codex-cli 0.163.0** and **Claude Code 2.1.304**; listing their versions is not evidence of staging interoperability.

Configuration formats follow [official Codex MCP documentation](https://developers.openai.com/codex/mcp) and [Claude Code MCP configuration/environment expansion](https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcpjson). The transport uses the [official SDK Web handler](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md).

## Tool contracts and limits

All 37 tools in [MCP-API.md](MCP-API.md) are registered, plus `list_statuses` so clients can discover project-specific status UUIDs and categories. No owner-only management, export, permanent deletion, shell, SQL or arbitrary-fetch tool is registered. Tool discovery contains static descriptions and schemas only.

Arguments/results use the existing shared contracts' **camelCase**: `projectId`, `expectedRevision`, `idempotencyKey`, `includeArchived`, `nextCursor`, `hasMore`. Mutations take their fields directly rather than inside the HTTP API's `input` envelope. Successful tool results contain `{data, requestId}` in `structuredContent` and as JSON text for clients that consume text. Business and argument-validation errors set `isError: true` and return `{error: {code, message, requestId, details?, fields?}}`. MCP method/envelope errors follow SDK protocol semantics.

- Lists default to 50 and cap at 100. Pass the returned `nextCursor` unchanged until `hasMore` is false. `list_github_issues` instead uses GitHub's 100-item page numbering and `nextPage`; continue even if a page has no issues because GitHub's feed also contains PRs.
- `list_tasks` and `search` use browser-equivalent filters and sorting, including property filters. `list_statuses`, `list_labels` and `list_properties` require `projectId`; property results include types/options.
- `get_task` accepts exactly one of `id` or `reference`. Read its parent, project and section IDs through the corresponding tools. `includeGithub: true` adds current links, cached state, freshness and reconciliation job IDs; it triggers the existing stale-on-read path. `refresh_github` requests/coalesces refresh with write scope.
- Use UUIDs for writes. Read the current task/section revision before changes. Notes have a separate revision; a new note starts at revision 0. `append_note` atomically appends to the latest content without requiring a stale note replacement.
- Canonical note content is a document, for example `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Progress update"}]}]}`. Existing validation permits supported rich-text blocks/marks only, at most 1 MiB, 10,000 nodes and 32 nested levels.
- `move_task` and `convert_task` share the same move service and require explicit `sectionId` and `parentTaskId` (null for root/standalone). Existing hierarchy, dependency and completed-ancestor rules apply.
- Creating Done work, transitioning Done or completing sections requires complete in addition to write. `update_task` cannot set status. Archive/restore tools accept tasks/sections only and require archive. Creation under an archived ancestor and moves/conversions that change effective archive also require archive; moves into archives require explicit acknowledgment of affected active dependents. The same shared checks apply to browser/API/GitHub import paths. Tool schemas reject actor/owner/scope metadata and unknown fields.
- `begin_attachment_upload` requires `idempotencyKey`, a supported filename/media type and a size no greater than 20,000,000 bytes. PUT file bytes directly to the returned signed URL before expiry, sending every returned header exactly (including content type/length and `If-None-Match: *`); then call `finalize_attachment_upload`. Finalize rejects invalid bytes. Download URLs last five minutes. Never send binary/base64 through MCP or share signed URLs.
- GitHub tools operate only on repositories connected to granted projects and never write to GitHub. Duplicate imports return `duplicate_import` with the authorized existing task ID/reference. Installation, repository connection and automation management remain browser-owner operations.

## Retry and credential lifecycle

Supply a distinct `idempotencyKey` for each intended mutation and retain it until the response is confirmed. Reuse the exact key and arguments after transport timeouts; append/create without a key can duplicate work. Receipts normally last 24 hours. Changed input with the same key returns `idempotency_conflict`.

For `conflict`, read current data and deliberately reconcile before retrying with the current revision and a new key. For `decision_required`, no mutation committed: review affected IDs/options, then explicitly choose `completionAction`, `reopenCompletedAncestors` or `acknowledgeDependentIds` as applicable. Permission checks still apply to the chosen action and retries.

Respect `rate_limited` retry timing. Authentication throttling returns HTTP 429, `Retry-After: 60` and structured timing; GitHub throttling includes `details.retryAt` when known. Provider failures return `integration_unavailable` while local data remains usable. Unexpected errors expose no SQL, stack traces or secret values. Record the request ID for diagnosis. Do not retry in a tight loop.

Keys expire in 90 days by default unless the owner changes expiry. For rotation: create a replacement, update the launch environment, restart/reconnect and verify it, then revoke the old key. Revocation, expiry and project/scope changes are rechecked on the next request, including discovery and initialization. A new project is never implicitly granted. Lost secrets require replacement; the server cannot display them again.

## Staging acceptance — still required

Use isolated staging database/R2/GitHub resources and a throwaway contributor key. Run the following independently in current Codex and Claude Code, recording exact versions, deployment URL and results without tokens or signed URLs:

1. Discover tools; list a granted project and its statuses; find Ready work with `list_tasks`.
2. Read task/project/section/parent context; create a subtask, update it using its revision, and replay the same create key without duplication.
3. Append a progress note; begin an allowed small upload, PUT its bytes directly, finalize and download it privately; link a staging PR.
4. Transition In review. Verify Done is denied through both `transition_task` and `create_task`, and completing sections is denied without complete scope. Verify archive is denied without archive scope.
5. Verify another project's reads/search/mutations fail without exposing its data. Confirm owner management, key creation, exports and permanent deletion are absent/unavailable.
6. With a separately enabled complete key, verify parent completion returns `decision_required` before any write, then succeeds only with an explicit choice. Exercise stale revisions and changed-input retry keys.
7. Change grants/scopes and confirm the next request reflects them. Revoke the key; the next discovery/call must return 401. Verify replacement/expiry behavior.

Local unit tests exercise both MCP protocol generations via Web Requests, bearer-only routing, discovery, validation, error mapping and representative service dispatch. `tests/integration/mcp.test.ts` uses the disposable PostgreSQL harness for real service permissions, context, attribution, revisions, decisions and idempotency; existing attachment/GitHub/auth suites cover their domain/provider-denial paths. No test uses Redis. Database execution, browser setup copy QA and real-provider/client staging checks must be recorded before closing Phase 14.
