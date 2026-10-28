import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { getAuthEnv } = await import("@/server/env");
    const { parseDatabaseUrl } = await import("@/server/db/connection");
    getAuthEnv();
    parseDatabaseUrl(process.env.DATABASE_URL);
  }
}

export const onRequestError: Instrumentation.onRequestError = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { createRequestContext } = await import("@/server/request-context");
    // Raw errors, URLs, headers and bodies can contain private data.
    createRequestContext().logError("internal_error");
  }
};
