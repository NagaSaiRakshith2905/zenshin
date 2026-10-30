import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DatabaseExecutor } from "@/server/db";
import { backgroundJobs, githubCheckSummaries, githubInstallations, githubItems, githubRepositories, githubSyncState } from "@/server/db/schema";
import { enqueueJob, JobDeferred } from "@/server/jobs";
import { GithubError, type GithubProvider } from "@/server/integrations/github";
import { projectLock, DomainError } from "../work/foundation";
import { query } from "../work/store";
import { evaluateProject } from "./automation";
import { remoteValues } from "./cache";
import { installationRequest } from "./provider";

type Item = typeof githubItems.$inferSelect;
export async function enqueueRefresh(db: Database, ownerId: string, itemId: string, force = false) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`github-refresh:${itemId}`}, 0))`);
    const [item] = await tx.select().from(githubItems).where(and(eq(githubItems.ownerId, ownerId), eq(githubItems.id, itemId)));
    if (!item) return null;
    const [existing] = await tx.select().from(backgroundJobs).where(and(eq(backgroundJobs.ownerId, ownerId), eq(backgroundJobs.kind, "github_sync"), sql`payload->>'itemId' = ${itemId} and state in ('pending', 'running')`)).limit(1);
    if (existing) return existing;
    if (!force && item.syncedAt && item.syncedAt.getTime() > Date.now() - 60_000) return null;
    const [sync] = await tx.select().from(githubSyncState).where(and(eq(githubSyncState.repositoryId, item.repositoryId), eq(githubSyncState.resource, `item:${itemId}`)));
    const [repository] = await tx.select().from(githubRepositories).where(eq(githubRepositories.id, item.repositoryId));
    const [installation] = await tx.select().from(githubInstallations).where(eq(githubInstallations.id, repository.installationId));
    return enqueueJob(tx, { ownerId, kind: "github_sync", deduplicationKey: `github:${itemId}:${randomUUID()}`, payload: { itemId }, availableAt: new Date(Math.max(Date.now(), sync?.nextAttemptAt.getTime() ?? 0, installation.nextRequestAt.getTime())) });
  });
}
async function recordSync(db: DatabaseExecutor, item: Item, values: Partial<typeof githubSyncState.$inferInsert>) {
  await db.insert(githubSyncState).values({ ownerId: item.ownerId, repositoryId: item.repositoryId, resource: `item:${item.id}`, ...values }).onConflictDoUpdate({ target: [githubSyncState.repositoryId, githubSyncState.resource], set: { ...values, updatedAt: new Date(), revision: sql`${githubSyncState.revision} + 1` } });
}
export async function reconcileGithub(db: Database, ownerId: string, payload: Record<string, unknown>, signal: AbortSignal, provider?: GithubProvider) {
  const { itemId } = z.object({ itemId: z.uuid() }).parse(payload);
  const [item] = await db.select().from(githubItems).where(and(eq(githubItems.id, itemId), eq(githubItems.ownerId, ownerId)));
  if (!item) return;
  const [repository] = await db.select().from(githubRepositories).where(eq(githubRepositories.id, item.repositoryId));
  const [sync] = await db.select().from(githubSyncState).where(and(eq(githubSyncState.repositoryId, item.repositoryId), eq(githubSyncState.resource, `item:${itemId}`)));
  if (sync && sync.nextAttemptAt.getTime() > Date.now()) throw new JobDeferred(sync.nextAttemptAt);
  try {
    await installationRequest(db, ownerId, repository.installationId, provider, async (api, id, requestSignal) => {
      // Repository verification distinguishes a deleted item from loss of repository access.
      const remoteRepo = await api.repository(id, repository.ownerName, repository.name, requestSignal);
      if (BigInt(remoteRepo.id) !== repository.githubRepositoryId) throw new GithubError(404);
      let result;
      try { result = await api.item(id, remoteRepo.owner.login, remoteRepo.name, item.type, item.number, { etag: sync?.etag, lastModified: sync?.lastModified }, requestSignal); }
      catch (error) {
        if (error instanceof GithubError && [404, 410].includes(error.status)) {
          await db.transaction(async (tx) => {
            const [updated] = await tx.update(githubItems).set({ availability: "deleted", syncedAt: new Date(), revision: item.revision + 1 }).where(and(eq(githubItems.id, item.id), eq(githubItems.revision, item.revision))).returning();
            if (updated) await recordSync(tx, updated, { lastSuccessAt: new Date(), nextAttemptAt: new Date(), lastError: "GitHub item deleted.", etag: null, lastModified: null });
          });
          return;
        }
        throw error;
      }
      const values = result.data ? remoteValues(ownerId, item.repositoryId, item.type, result.data) : null;
      if (values && (values.githubItemId !== item.githubItemId || values.number !== item.number)) throw new DomainError("conflict", "GitHub item identity changed.");
      // Checks are keyed to the returned head, never to a previous PR head.
      const sha = values?.headSha ?? item.headSha;
      const checks = item.type === "pr" && sha ? await api.checks(id, remoteRepo.owner.login, remoteRepo.name, sha, requestSignal) : null;
      requestSignal.throwIfAborted();
      await db.transaction(async (tx) => {
        const linked = await query<{ projectId: string; taskId: string }>(tx, sql`select project_id, task_id from task_github_links where github_item_id = ${itemId} order by project_id, task_id`);
        const projects = new Map();
        for (const projectId of [...new Set(linked.map((l) => l.projectId))].sort()) {
          const actor = { kind: "system" as const, ownerId, credentialId: null, job: "github_reconcile" as const, projectIds: [projectId], scopes: ["read", "write"] as const };
          projects.set(projectId, await projectLock(tx, actor, projectId, "write"));
        }
        const [currentInstallation] = await query<{ status: string }>(tx, sql`select status from github_installations where id = ${repository.installationId} and owner_id = ${ownerId} for share`);
        if (currentInstallation?.status !== "active") return;
        const changed = values && values.remoteUpdatedAt.getTime() < item.remoteUpdatedAt.getTime();
        if (changed) return;
        const [updated] = await tx.update(githubItems).set({ ...(values ?? {}), ...(values ? { openedAt: item.state === "closed" && values.state === "open" ? values.remoteUpdatedAt : item.openedAt } : {}), ...(values && item.isDraft && !values.isDraft && values.state === "open" ? { readyAt: values.remoteUpdatedAt } : {}), availability: "available", syncedAt: new Date(), revision: item.revision + 1, updatedAt: new Date() }).where(and(eq(githubItems.id, itemId), eq(githubItems.revision, item.revision))).returning();
        if (!updated) return;
        await tx.update(githubRepositories).set({ name: remoteRepo.name, ownerName: remoteRepo.owner.login, availability: "available", updatedAt: new Date() }).where(eq(githubRepositories.id, repository.id));
        if (checks && sha) await tx.insert(githubCheckSummaries).values({ ownerId, repositoryId: repository.id, headSha: sha, summary: checks, syncedAt: new Date() }).onConflictDoUpdate({ target: [githubCheckSummaries.repositoryId, githubCheckSummaries.headSha], set: { summary: checks, syncedAt: new Date(), revision: sql`${githubCheckSummaries.revision} + 1` } });
        await recordSync(tx, updated, { etag: result.etag ?? sync?.etag, lastModified: result.lastModified ?? sync?.lastModified, lastSuccessAt: new Date(), nextAttemptAt: new Date(), attempts: 0, lastError: null });
        for (const [projectId, project] of projects) await evaluateProject(tx, project, linked.filter((l) => l.projectId === projectId).map((l) => l.taskId), `github:${itemId}:${updated.revision}`);
      });
    }, signal);
  } catch (error) {
    if (error instanceof DomainError && error.details.retryAt) throw new JobDeferred(new Date(error.details.retryAt as string));
    const unavailable = error instanceof GithubError && [401, 403, 404, 410].includes(error.status) && !error.retryAt;
    const delay = error instanceof GithubError && error.retryAt ? error.retryAt : new Date(Date.now() + Math.min(3600_000, 1000 * 2 ** Math.min((sync?.attempts ?? 0) + 1, 12)) * (0.5 + Math.random()));
    await recordSync(db, item, { attempts: (sync?.attempts ?? 0) + 1, nextAttemptAt: delay, lastError: unavailable ? "GitHub connection unavailable." : "GitHub refresh failed; retry scheduled." });
    if (unavailable) {
      await db.update(githubItems).set({ availability: "unavailable" }).where(and(eq(githubItems.id, itemId), eq(githubItems.revision, item.revision)));
      await db.update(githubRepositories).set({ availability: "unavailable" }).where(eq(githubRepositories.id, repository.id));
    }
    if (error instanceof GithubError && error.retryAt) throw new JobDeferred(error.retryAt);
    throw error;
  }
}
