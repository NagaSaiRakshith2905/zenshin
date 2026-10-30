import { getDatabase } from "@/server/db";
import { scheduleJobs } from "@/server/jobs/schedule";
import { receiveGithubWebhook } from "@/server/services/github/webhook";
import { githubInstallations } from "@/server/db/schema";
import { eq } from "drizzle-orm";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader(); if (!reader) return new Response("Missing payload", { status: 400 });
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 2_097_152) { await reader.cancel(); return new Response("Payload too large", { status: 413 }); } chunks.push(value); }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const db = getDatabase();
    const response = await receiveGithubWebhook(db, body, request.headers.get("x-hub-signature-256"), request.headers.get("x-github-delivery"), request.headers.get("x-github-event"));
    if (response.status === 202) {
      const payload = JSON.parse(body);
      if (typeof payload.installation?.id === "number" && Number.isSafeInteger(payload.installation.id)) {
        const [installation] = await db.select({ ownerId: githubInstallations.ownerId }).from(githubInstallations).where(eq(githubInstallations.installationId, BigInt(payload.installation.id)));
        if (installation) scheduleJobs(installation.ownerId);
      }
    }
    return response;
  } catch (error) {
    return new Response(error instanceof SyntaxError || error instanceof TypeError ? "Invalid payload" : "Webhook unavailable; retry delivery", { status: error instanceof SyntaxError || error instanceof TypeError ? 400 : 503 });
  }
}
