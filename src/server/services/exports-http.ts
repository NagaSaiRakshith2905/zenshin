import "server-only";
import { z } from "zod";
import { AccessError } from "@/server/auth/access";
import { authenticateOwner } from "@/server/auth/actors";
import { assertBrowserOrigin, readSettingsBody } from "@/server/auth/http";
import { getDatabase } from "@/server/db";
import { scheduleJobs } from "@/server/jobs/schedule";
import { createRequestContext } from "@/server/request-context";
import { createExportService } from "./exports";

export async function exportRoute(request: Request, id?: string) {
  const context = createRequestContext();
  const headers = { "Cache-Control": "no-store, private", "X-Request-ID": context.requestId, "Referrer-Policy": "no-referrer" };
  try {
    const actor = await authenticateOwner(request.headers);
    scheduleJobs(actor.ownerId);
    const service = createExportService(getDatabase());
    if (request.method === "GET") return Response.json(id ? await service.download(actor, { id }) : await service.list(actor, Object.fromEntries(new URL(request.url).searchParams)), { headers });
    if (request.method === "POST" && !id) {
      assertBrowserOrigin(request);
      return Response.json(await service.request(actor, await readSettingsBody(request)), { status: 202, headers });
    }
    return new Response(null, { status: 405, headers });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { code: error.code, message: error.message, requestId: context.requestId } }, { status: { unauthenticated: 401, forbidden: 403, conflict: 409, not_found: 404, validation_error: 422, rate_limited: 429 }[error.code], headers });
    if (error instanceof z.ZodError) return Response.json({ error: { code: "validation_error", message: "Check the export request fields.", requestId: context.requestId } }, { status: 422, headers });
    context.logError("internal_error");
    return Response.json({ error: { code: "integration_unavailable", message: "Could not prepare or download the export. Retry the same request or check integration health.", requestId: context.requestId } }, { status: 503, headers });
  }
}
