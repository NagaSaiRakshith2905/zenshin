import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/server/db";
import { githubInstallations, githubItems, githubRepositories, githubWebhookDeliveries } from "@/server/db/schema";
import { enqueueJob } from "@/server/jobs";
import { verifyWebhook } from "@/server/integrations/github";
import { parseGithubEnv } from "@/server/env";
import { enqueueRefresh } from "./refresh";

const webhook = z.object({ installation: z.object({ id: z.number().int().positive().safe() }).optional(), repository: z.object({ id: z.number().int().positive().safe() }).optional(), issue: z.object({ number: z.number().int().positive() }).optional(), pull_request: z.object({ number: z.number().int().positive() }).optional(), action: z.string().optional() });
export async function receiveGithubWebhook(db: Database, body: string, signature: string | null, deliveryId: string | null, eventType: string | null, secret = parseGithubEnv(process.env).GITHUB_APP_WEBHOOK_SECRET) {
  if (!verifyWebhook(body, signature, secret)) return new Response("Invalid signature", { status: 401 });
  if (!deliveryId || !z.uuid().safeParse(deliveryId).success || !eventType || !/^[a-z_]{1,80}$/.test(eventType)) return new Response("Invalid delivery headers", { status: 400 });
  const parsed = webhook.safeParse(JSON.parse(body));
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  if (!parsed.data.installation) return new Response(null, { status: 202 });
  const [installation] = await db.select().from(githubInstallations).where(eq(githubInstallations.installationId, BigInt(parsed.data.installation.id)));
  if (!installation) return new Response(null, { status: 202 });
  await db.transaction(async (tx) => {
    const [delivery] = await tx.insert(githubWebhookDeliveries).values({ ownerId: installation.ownerId, deliveryId, eventType }).onConflictDoNothing().returning();
    if (!delivery) return;
    if (eventType === "installation" && ["deleted", "suspend"].includes(parsed.data.action ?? "")) {
      await tx.update(githubInstallations).set({ status: parsed.data.action === "deleted" ? "removed" : "suspended", updatedAt: new Date(), revision: sql`${githubInstallations.revision} + 1` }).where(eq(githubInstallations.id, installation.id));
      await tx.update(githubRepositories).set({ availability: "unavailable", updatedAt: new Date() }).where(eq(githubRepositories.installationId, installation.id));
    }
    await enqueueJob(tx, { ownerId: installation.ownerId, kind: "github_sync", deduplicationKey: `github-delivery:${deliveryId}`, payload: { deliveryId, eventType, installationId: installation.id, repositoryExternalId: parsed.data.repository?.id.toString() ?? null, number: parsed.data.issue?.number ?? parsed.data.pull_request?.number ?? null, action: parsed.data.action ?? null, cursor: null } });
  });
  return new Response(null, { status: 202 });
}
export async function expandGithubDelivery(db: Database, ownerId: string, raw: Record<string, unknown>) {
  const input = z.object({ deliveryId: z.uuid(), eventType: z.string(), installationId: z.uuid(), repositoryExternalId: z.string().nullable(), number: z.number().nullable(), action: z.string().nullable(), cursor: z.string().nullable() }).parse(raw);
  const [installation] = await db.select().from(githubInstallations).where(and(eq(githubInstallations.id, input.installationId), eq(githubInstallations.ownerId, ownerId)));
  if (!installation) return;
  // Payloads are only refresh hints. Authoritative installation discovery updates access status.
  const items = await db.select({ id: githubItems.id }).from(githubItems).innerJoin(githubRepositories, eq(githubRepositories.id, githubItems.repositoryId)).where(and(eq(githubItems.ownerId, ownerId), eq(githubRepositories.installationId, input.installationId), input.repositoryExternalId ? eq(githubRepositories.githubRepositoryId, BigInt(input.repositoryExternalId)) : undefined, input.number ? eq(githubItems.number, input.number) : undefined, input.cursor ? sql`${githubItems.id} > ${input.cursor}::uuid` : undefined)).orderBy(githubItems.id).limit(100);
  for (const item of items) await enqueueRefresh(db, ownerId, item.id, true);
  if (items.length === 100) {
    const cursor = items.at(-1)!.id;
    await enqueueJob(db, { ownerId, kind: "github_sync", deduplicationKey: `github-delivery:${input.deliveryId}:${cursor}`, payload: { ...input, cursor } });
  } else await db.update(githubWebhookDeliveries).set({ state: "processed", processedAt: new Date(), lastError: null }).where(and(eq(githubWebhookDeliveries.deliveryId, input.deliveryId), eq(githubWebhookDeliveries.ownerId, ownerId)));
}
