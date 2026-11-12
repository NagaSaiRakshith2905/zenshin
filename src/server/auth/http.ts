import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db";
import { getAuthEnv, getServerEnv } from "@/server/env";
import { scheduleJobs } from "@/server/jobs/schedule";
import { createRequestContext } from "@/server/request-context";
import { createSettingsService } from "@/server/services/settings";
import { AccessError, type HumanActor } from "./access";
import { authenticateOwner } from "./actors";

export function assertBrowserOrigin(request: Request) {
  if (request.headers.get("origin") !== getServerEnv().APP_ORIGIN
    || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AccessError("forbidden", "Use the Zenshin browser application for this action.");
  }
}

export async function readSettingsBody(request: Request, limit = 32_768) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new AccessError("validation_error", "Send a JSON request.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError("validation_error", "A request body is required.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      throw new AccessError("validation_error", "The request is too large.");
    }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new AccessError("validation_error", "Send valid JSON."); }
}

export async function ownerSettingsRoute(request: Request,
  operation: (service: ReturnType<typeof createSettingsService>, actor: HumanActor) => Promise<unknown>, status = 200) {
  const context = createRequestContext();
  const headers = { "Cache-Control": "no-store, private", "X-Request-ID": context.requestId };
  try {
    const actor = await authenticateOwner(request.headers);
    scheduleJobs(actor.ownerId);
    if (!["GET", "HEAD"].includes(request.method)) assertBrowserOrigin(request);
    const result = await operation(createSettingsService(getDatabase(), getAuthEnv()), actor);
    return Response.json(result ?? { success: true }, { status, headers });
  } catch (error) {
    if (error instanceof AccessError) {
      const statuses = { unauthenticated: 401, forbidden: 403, validation_error: 400, conflict: 409, not_found: 404, rate_limited: 429 };
      return Response.json({ error: { code: error.code, message: error.message, requestId: context.requestId } }, { status: statuses[error.code], headers });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: { code: "validation_error", message: "Check the settings fields and try again.", fields: error.issues.map(({ path, message }) => ({ path, message })), requestId: context.requestId } }, { status: 400, headers });
    }
    context.logError("internal_error");
    return Response.json({ error: { code: "internal_error", message: "Could not save or load settings. Try again.", requestId: context.requestId } }, { status: 500, headers });
  }
}
