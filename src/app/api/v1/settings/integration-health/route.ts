import { desc, eq, sql } from "drizzle-orm";
import { ownerSettingsRoute } from "@/server/auth/http";
import { getDatabase } from "@/server/db";
import { backgroundJobs, githubSyncState } from "@/server/db/schema";

export const runtime = "nodejs";
export const GET = (request: Request) => ownerSettingsRoute(request, async (_service, actor) => {
  const db = getDatabase();
  const jobs = await db.select({ id: backgroundJobs.id, kind: backgroundJobs.kind, state: backgroundJobs.state, attempts: backgroundJobs.attempts, maxAttempts: backgroundJobs.maxAttempts, availableAt: backgroundJobs.availableAt, lastError: backgroundJobs.lastError, updatedAt: backgroundJobs.updatedAt }).from(backgroundJobs).where(eq(backgroundJobs.ownerId, actor.ownerId)).orderBy(desc(backgroundJobs.updatedAt)).limit(100);
  const sync = await db.select({ resource: githubSyncState.resource, lastSuccessAt: githubSyncState.lastSuccessAt, nextAttemptAt: githubSyncState.nextAttemptAt, attempts: githubSyncState.attempts, hasError: sql<boolean>`${githubSyncState.lastError} IS NOT NULL` }).from(githubSyncState).where(eq(githubSyncState.ownerId, actor.ownerId)).limit(100);
  return { jobs, sync };
});
