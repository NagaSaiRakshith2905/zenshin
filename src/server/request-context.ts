import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const errorCodeSchema = z.enum(["internal_error", "configuration_error", "authentication_error"]);

export function createRequestContext() {
  const requestId = randomUUID();
  return {
    requestId,
    logError(code: z.infer<typeof errorCodeSchema>, credentialId?: string) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "request.failed",
        requestId,
        code: errorCodeSchema.parse(code),
        credentialId: z.uuid().safeParse(credentialId).data,
      }));
    },
  };
}
