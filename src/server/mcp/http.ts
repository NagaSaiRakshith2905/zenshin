import "server-only";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { AccessError } from "@/server/auth/access";
import { authenticateAgent } from "@/server/auth/actors";
import { getDatabase } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { scheduleJobs } from "@/server/jobs/schedule";
import { createRequestContext } from "@/server/request-context";
import { mcpError } from "./errors";
import { createMcpServices, createZenshinMcpServer } from "./server";

export async function mcpRoute(request: Request) {
  const context = createRequestContext();
  const headers = new Headers({ "Cache-Control": "no-store, private", "X-Request-ID": context.requestId, "Referrer-Policy": "no-referrer" });
  try {
    const origin = getServerEnv().APP_ORIGIN;
    if (new URL(request.url).origin !== origin || (request.headers.has("host") && request.headers.get("host") !== new URL(origin).host)
      || (request.headers.has("origin") && request.headers.get("origin") !== origin)) {
      throw new AccessError("forbidden", "Use the configured MCP server origin.");
    }
    const actor = await authenticateAgent(request.headers);
    if (request.method !== "POST") {
      headers.set("Allow", "POST");
      return new Response(null, { status: 405, headers });
    }
    scheduleJobs(actor.ownerId);
    // The SDK factory and actor are request-local: no sessions or permission cache.
    const handler = createMcpHandler(() => createZenshinMcpServer(actor, createMcpServices(getDatabase()), context), {
      legacy: "stateless", maxSubscriptions: 0, maxRequestBodySize: 1_200_000,
      onerror: () => context.logError("internal_error", actor.credentialId),
    });
    const response = await handler.fetch(request);
    for (const [key, value] of headers) response.headers.set(key, value);
    return response;
  } catch (error) {
    const result = mcpError(error, context);
    const status = error instanceof AccessError ? ({ unauthenticated: 401, forbidden: 403, rate_limited: 429, validation_error: 422, conflict: 409, not_found: 404 }[error.code]) : 500;
    if (status === 401) headers.set("WWW-Authenticate", 'Bearer realm="zenshin"');
    if (status === 429) headers.set("Retry-After", "60");
    return Response.json(result, { status, headers });
  }
}
