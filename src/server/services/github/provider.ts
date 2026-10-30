import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db";
import { githubInstallations } from "@/server/db/schema";
import { createGithubProvider, GithubError, type GithubProvider } from "@/server/integrations/github";
import { DomainError } from "../work/foundation";

export async function installationRequest<T>(db: Database, ownerId: string, installationId: string, provider: GithubProvider | undefined, work: (provider: GithubProvider, externalId: string, signal: AbortSignal) => Promise<T>, signal = AbortSignal.timeout(15_000)) {
  const token = randomUUID();
  const [installation] = await db.update(githubInstallations).set({ requestLeaseToken: token, requestLeaseExpiresAt: new Date(Date.now() + 25_000) })
    .where(and(eq(githubInstallations.id, installationId), eq(githubInstallations.ownerId, ownerId), eq(githubInstallations.status, "active"), sql`next_request_at <= now() and (request_lease_expires_at is null or request_lease_expires_at <= now())`)).returning();
  if (!installation) {
    const [current] = await db.select().from(githubInstallations).where(and(eq(githubInstallations.id, installationId), eq(githubInstallations.ownerId, ownerId)));
    const retryAt = new Date(Math.max(Date.now() + 2000, current?.nextRequestAt.getTime() ?? 0, current?.requestLeaseExpiresAt?.getTime() ?? 0));
    throw new DomainError("integration_unavailable", "GitHub is busy, unavailable or rate limited. Retry later.", { retryAt: retryAt.toISOString() });
  }
  let next = new Date();
  let api: GithubProvider | undefined;
  try { api = provider ?? createGithubProvider(); return await work(api, installation.installationId.toString(), signal); }
  catch (error) {
    next = error instanceof GithubError && error.retryAt ? error.retryAt : new Date(Date.now() + 1000 * (1 + Math.random()));
    throw error;
  } finally {
    if (api?.blockedUntil && api.blockedUntil > next) next = api.blockedUntil;
    await db.update(githubInstallations).set({ requestLeaseToken: null, requestLeaseExpiresAt: null, nextRequestAt: next }).where(and(eq(githubInstallations.id, installationId), eq(githubInstallations.requestLeaseToken, token)));
  }
}
