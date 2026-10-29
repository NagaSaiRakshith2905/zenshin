import "server-only";
import { z } from "zod";
import { mutationEnvelope, type Command } from "@/lib/contracts/work";
import { AccessError } from "@/server/auth/access";
import { authenticateActor } from "@/server/auth/actors";
import { assertBrowserOrigin, readSettingsBody } from "@/server/auth/http";
import { getDatabase } from "@/server/db";
import { scheduleJobs } from "@/server/jobs/schedule";
import { createRequestContext } from "@/server/request-context";
import { createWorkService, createWorkReader, DomainError } from ".";
import { createNoteReader } from "./notes";
import { createAttachmentService } from "../attachments";
import { resources, type Resource } from "./read";

const creates: Partial<Record<Resource, Command>> = { projects: "create_project", sections: "create_section", tasks: "create_task", statuses: "create_status", labels: "create_label", properties: "create_property", options: "create_option" };
const updates: Partial<Record<Resource, Command>> = { projects: "update_project", sections: "update_section", tasks: "update_task", statuses: "update_status", labels: "update_label", properties: "update_property", options: "update_option" };
const actions: Partial<Record<Resource, Record<string, Command>>> = {
  projects: { archive: "archive_item", restore: "restore_item", delete: "delete_item" },
  sections: { move: "move_section", archive: "archive_item", restore: "restore_item", delete: "delete_item" },
  tasks: { move: "move_task", convert: "move_task", transition: "transition_task", labels: "set_task_labels", properties: "set_task_properties", "add-dependency": "add_dependency", "remove-dependency": "remove_dependency", archive: "archive_item", restore: "restore_item", delete: "delete_item" },
  statuses: { delete: "delete_status" }, labels: { delete: "delete_label" }, properties: { delete: "delete_property" }, options: { delete: "delete_option" },
};
export async function workRoute(request: Request, path: string[]) {
  const context = createRequestContext();
  const headers = { "Cache-Control": "no-store, private", "X-Request-ID": context.requestId };
  const noteDownload = request.method === "GET" && path.length === 3 && path[0] === "attachments" && path[2] === "download" && new URL(request.url).searchParams.get("redirect") === "true";
  try {
    const actor = await authenticateActor(request.headers);
    scheduleJobs(actor.ownerId);
    const [resourceName, targetId, action] = path;
    if (resourceName === "attachments") {
      if (path.length > 3) throw new DomainError("not_found", "Route was not found.");
      const service = createAttachmentService(getDatabase());
      if (targetId) z.uuid().parse(targetId);
      if (request.method === "GET") {
        if (!targetId && !action) return Response.json(await service.list(actor, Object.fromEntries(new URL(request.url).searchParams)), { headers });
        if (targetId && action === "download") {
          const result = await service.download(actor, { id: targetId });
          return new URL(request.url).searchParams.get("redirect") === "true"
            ? new Response(null, { status: 302, headers: { ...headers, Location: result.url, "Referrer-Policy": "no-referrer" } })
            : Response.json(result, { headers });
        }
      }
      if (actor.kind === "human") assertBrowserOrigin(request);
      if (request.method === "POST" && ((!targetId && !action) || (targetId && ["finalize", "remove"].includes(action)))) {
        const envelope = mutationEnvelope.parse(await readSettingsBody(request));
        const input = z.record(z.string(), z.unknown()).parse(envelope.input);
        const key = request.headers.get("idempotency-key") ?? envelope.idempotencyKey;
        const result = !targetId ? await service.begin(actor, input, context.requestId, z.string().min(1).parse(key))
          : action === "finalize" ? await service.finalize(actor, { id: targetId }, context.requestId)
            : await service.remove(actor, { ...input, id: targetId }, context.requestId, z.string().min(1).parse(key));
        return Response.json(result, { status: !targetId ? 201 : 200, headers });
      }
      throw new DomainError("not_found", "Route was not found.");
    }
    if (!resources.includes(resourceName as Resource) || path.length > 4) return Response.json({ error: { code: "not_found", message: "Route was not found.", requestId: context.requestId } }, { status: 404, headers });
    const resource = resourceName as Resource;
    const db = getDatabase();
    if (resourceName === "notes") {
      if (!targetId) throw new DomainError("validation_error", "Select a note target.");
      z.uuid().parse(targetId);
      const kind = z.enum(["project", "section", "task"]).parse(new URL(request.url).searchParams.get("kind"));
      if (request.method === "GET") {
        if (action && action !== "history") throw new DomainError("not_found", "Route was not found.");
        const source = path[3] === undefined ? undefined : z.coerce.number().int().positive().parse(path[3]);
        return Response.json(await createNoteReader(db)(actor, { kind, id: targetId }, action === "history", source), { headers });
      }
      if (actor.kind === "human") assertBrowserOrigin(request);
      const operation = request.method === "PATCH" && !action ? "update_note" : request.method === "POST" && action === "append" ? "append_note" : request.method === "POST" && action === "restore" ? "restore_note" : null;
      if (!operation) throw new DomainError("not_found", "Route was not found.");
      const envelope = mutationEnvelope.parse(await readSettingsBody(request, 1_100_000));
      const input = z.record(z.string(), z.unknown()).parse(envelope.input);
      return Response.json(await createWorkService(db).execute(actor, operation, { ...input, id: targetId, kind }, context.requestId, request.headers.get("idempotency-key") ?? envelope.idempotencyKey), { headers });
    }
    if (path.length > 3) throw new DomainError("not_found", "Route was not found.");
    if (request.method === "GET") {
      const url = new URL(request.url);
      const reader = createWorkReader(db);
      if (action) throw new DomainError("not_found", "Route was not found.");
      const params: Record<string, string | boolean> = Object.fromEntries(url.searchParams);
      for (const key of ["includeArchived", "includeDescendants"]) if (key in params) params[key] = z.enum(["true", "false"]).parse(params[key]) === "true";
      const result = targetId ? await reader.get(actor, resource, targetId, params.includeArchived === true) : await reader.list(actor, resource, params);
      return Response.json(result, { headers });
    }
    if (actor.kind === "human") assertBrowserOrigin(request);
    const operation = request.method === "PATCH" && targetId && !action ? updates[resource] : request.method === "POST" ? targetId && action ? actions[resource]?.[action] : !targetId ? creates[resource] : undefined : undefined;
    if (!operation) return Response.json({ error: { code: "not_found", message: "Route was not found.", requestId: context.requestId } }, { status: 404, headers });
    if (targetId) z.uuid().parse(targetId);
    const envelope = mutationEnvelope.parse(await readSettingsBody(request));
    const input = z.record(z.string(), z.unknown()).parse(envelope.input);
    if (targetId) input.id = targetId;
    if (["archive_item", "restore_item", "delete_item"].includes(operation)) input.kind = resource === "projects" ? "project" : resource === "sections" ? "section" : "task";
    const key = request.headers.get("idempotency-key") ?? envelope.idempotencyKey;
    const result = await createWorkService(db).execute(actor, operation, input, context.requestId, key);
    return Response.json(result, { status: operation.startsWith("create_") ? 201 : 200, headers });
  } catch (error) {
    if (error instanceof DomainError || error instanceof AccessError) {
      const statuses: Record<string, number> = { unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409, decision_required: 409, idempotency_conflict: 409, validation_error: 422, dependency_cycle: 422, hierarchy_limit: 422, rate_limited: 429, upload_rejected: 422, integration_unavailable: 503 };
      if (noteDownload && error.code === "unauthenticated") return new Response(null, { status: 302, headers: { ...headers, Location: "/sign-in", "Referrer-Policy": "no-referrer" } });
      if (noteDownload && ["conflict", "not_found", "forbidden"].includes(error.code)) return new Response('<!doctype html><html lang="en"><title>Attachment unavailable</title><body><p>This attachment is unavailable.</p><a href="/">Back to Zenshin</a></body></html>', { status: statuses[error.code], headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "no-referrer" } });
      return Response.json({ error: { code: error.code, message: error.message, ...(error instanceof DomainError ? { details: error.details } : {}), requestId: context.requestId } }, { status: statuses[error.code] ?? 500, headers });
    }
    if (error instanceof z.ZodError) return Response.json({ error: { code: "validation_error", message: "Check the request fields.", fields: error.issues.map(({ path, message }) => ({ path, message })), requestId: context.requestId } }, { status: 422, headers });
    // pg errors may contain SQL values. Return stable messages without logging the error object.
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    if (["23505", "23503", "23514", "40001", "40P01"].includes(String(code))) return Response.json({ error: { code: "conflict", message: "This change conflicts with existing data. Reload before retrying.", requestId: context.requestId } }, { status: 409, headers });
    context.logError("internal_error");
    return Response.json({ error: { code: "internal_error", message: "Could not complete this operation. Retry with the same idempotency key.", requestId: context.requestId } }, { status: 500, headers });
  }
}
