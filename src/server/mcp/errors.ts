import "server-only";
import { z } from "zod";
import { AccessError } from "@/server/auth/access";
import { GithubError } from "@/server/integrations/github";
import { createRequestContext } from "@/server/request-context";
import { DomainError } from "@/server/services/work/foundation";

export function mcpError(error: unknown, context: ReturnType<typeof createRequestContext>) {
  let code = "internal_error", message = "Could not complete this operation. Retry with the same idempotency key.";
  let details: Record<string, unknown> | undefined;
  let fields: { path: PropertyKey[]; message: string }[] | undefined;
  if (error instanceof DomainError || error instanceof AccessError) {
    code = error.code; message = error.message;
    if (error instanceof DomainError) details = error.details;
    if (code === "rate_limited") details = { retryAfterSeconds: 60 };
  } else if (error instanceof z.ZodError) {
    code = "validation_error"; message = "Check the tool arguments.";
    fields = error.issues.map(({ path, message }) => ({ path, message }));
  } else if (error instanceof GithubError) {
    code = error.retryAt || error.status === 429 ? "rate_limited" : "integration_unavailable";
    message = code === "rate_limited" ? "GitHub is rate limited. Wait before retrying." : "GitHub connection unavailable. Check installation access and approval.";
    details = { retryAt: error.retryAt?.toISOString() ?? null };
  } else if (error instanceof Error && error.message.startsWith("Invalid server environment:")) {
    code = "integration_unavailable"; message = "Required server configuration is unavailable. Contact the owner.";
  } else {
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : error;
    const pgCode = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    if (["23505", "23503", "23514", "40001", "40P01"].includes(String(pgCode))) {
      code = "conflict"; message = "This change conflicts with existing data. Read the current version before retrying.";
    } else context.logError("internal_error");
  }
  return { error: { code, message, requestId: context.requestId, ...(details ? { details } : {}), ...(fields ? { fields } : {}) } };
}
