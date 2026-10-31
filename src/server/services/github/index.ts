import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { githubImportInput, githubLinkInput, githubPage, githubProject, githubRepository, githubRepositoryList, githubRuleInput } from "@/lib/contracts/github";
import { commands, wireValue } from "@/lib/contracts/work";
import { notePlainText } from "@/lib/contracts/notes";
import { assertHumanOwner, assertProjectScope, type Actor } from "@/server/auth/access";
import type { Database, DatabaseExecutor } from "@/server/db";
import { githubCheckSummaries, githubInstallations, githubIssueImports, githubItems, githubRepositories, githubSyncState, projectGithubRules, projectRepositories, taskGithubLinks } from "@/server/db/schema";
import { createGithubProvider, type GithubProvider } from "@/server/integrations/github";
import { githubMarkdown } from "@/server/integrations/github/markdown";
import { parseGithubEnv } from "@/server/env";
import { activity, atomicMutation, checkRevision, DomainError, invalid, owned, projectLock } from "../work/foundation";
import { loadGraph } from "../work/graph";
import { patch, query } from "../work/store";
import { taskHandlers } from "../work/tasks";
import { noteHandlers } from "../work/notes";
import { baselineTask } from "./automation";
import { cacheItem } from "./cache";
import { enqueueRefresh } from "./refresh";
import { installationRequest } from "./provider";

async function repositoryFor(db: DatabaseExecutor, actor: Actor, projectId: string, repositoryId: string, scope: "read" | "write") {
  const project = await owned(db, actor, "projects", projectId); assertProjectScope(actor, actor.ownerId, project.id, scope);
  const [row] = await db.select({ repository: githubRepositories, installation: githubInstallations }).from(projectRepositories)
    .innerJoin(githubRepositories, eq(githubRepositories.id, projectRepositories.repositoryId)).innerJoin(githubInstallations, eq(githubInstallations.id, githubRepositories.installationId))
    .where(and(eq(projectRepositories.ownerId, actor.ownerId), eq(projectRepositories.projectId, projectId), eq(projectRepositories.repositoryId, repositoryId)));
  if (!row) throw new DomainError("not_found", "Connected repository was not found.");
  if (scope === "write" && row.installation.status !== "active") throw new DomainError("integration_unavailable", "GitHub installation is unavailable. Verify access first.");
  return row;
}
export function createGithubService(db: Database, provider?: GithubProvider) {
  const external = async <T>(actor: Actor, projectId: string, repositoryId: string, scope: "read" | "write", run: (api: GithubProvider, id: string, owner: string, name: string, signal: AbortSignal) => Promise<T>) => {
    const { repository, installation } = await repositoryFor(db, actor, projectId, repositoryId, scope);
    if (installation.status !== "active") throw new DomainError("integration_unavailable", "GitHub installation requires approval or has lost access.");
    return installationRequest(db, actor.ownerId, installation.id, provider, (api, id, signal) => run(api, id, repository.ownerName, repository.name, signal));
  };
  return {
    async installations(actor: Actor, raw: unknown) {
      assertHumanOwner(actor); const page = githubPage.parse(raw);
      const items = await (provider ?? createGithubProvider()).installations(page, AbortSignal.timeout(15_000));
      for (const item of items) {
        if (["metadata", "issues", "pull_requests", "checks", "statuses"].some((name) => item.permissions[name] !== "read") || Object.entries(item.permissions).some(([name, permission]) => permission !== "read" || !["metadata", "issues", "pull_requests", "checks", "statuses"].includes(name))) invalid("Configure the GitHub App with only the documented read permissions.");
        await db.insert(githubInstallations).values({ ownerId: actor.ownerId, installationId: BigInt(item.id), accountId: BigInt(item.account.id), accountName: item.account.login, status: item.suspended_at ? "suspended" : "active" }).onConflictDoUpdate({ target: githubInstallations.installationId, set: { accountName: item.account.login, status: item.suspended_at ? "suspended" : "active", revision: sql`${githubInstallations.revision} + 1`, updatedAt: new Date() }, setWhere: eq(githubInstallations.ownerId, actor.ownerId) });
      }
      const saved = await db.select().from(githubInstallations).where(eq(githubInstallations.ownerId, actor.ownerId));
      return wireValue({ items: saved, nextPage: items.length === 100 ? page + 1 : null, installUrl: provider ? null : `https://github.com/apps/${parseGithubEnv(process.env).GITHUB_APP_SLUG}/installations/new` });
    },
    async discoverRepositories(actor: Actor, raw: unknown) {
      assertHumanOwner(actor); const input = z.strictObject({ installationId: z.uuid(), page: githubPage }).parse(raw);
      const result = await installationRequest(db, actor.ownerId, input.installationId, provider, (api, id, signal) => api.repositories(id, input.page, signal));
      for (const repo of result.repositories) await db.insert(githubRepositories).values({ ownerId: actor.ownerId, installationId: input.installationId, githubRepositoryId: BigInt(repo.id), name: repo.name, ownerName: repo.owner.login, defaultBranch: repo.default_branch }).onConflictDoUpdate({ target: githubRepositories.githubRepositoryId, set: { installationId: input.installationId, name: repo.name, ownerName: repo.owner.login, defaultBranch: repo.default_branch, availability: "available", updatedAt: new Date(), revision: sql`${githubRepositories.revision} + 1` }, setWhere: eq(githubRepositories.ownerId, actor.ownerId) });
      const ids = result.repositories.map((r) => BigInt(r.id));
      return wireValue({ items: ids.length ? await db.select().from(githubRepositories).where(and(eq(githubRepositories.ownerId, actor.ownerId), sql`${githubRepositories.githubRepositoryId} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)) : [], nextPage: input.page * 100 < result.total_count ? input.page + 1 : null });
    },
    async repositories(actor: Actor, raw: unknown) {
      const { projectId, cursor, limit } = githubRepositoryList.parse(raw); const project = await owned(db, actor, "projects", projectId); assertProjectScope(actor, actor.ownerId, projectId, "read");
      void project;
      const items = await db.select({ id: githubRepositories.id, name: githubRepositories.name, ownerName: githubRepositories.ownerName, availability: githubRepositories.availability, installationStatus: githubInstallations.status }).from(projectRepositories).innerJoin(githubRepositories, eq(githubRepositories.id, projectRepositories.repositoryId)).innerJoin(githubInstallations, eq(githubInstallations.id, githubRepositories.installationId)).where(and(eq(projectRepositories.ownerId, actor.ownerId), eq(projectRepositories.projectId, projectId), cursor ? sql`${githubRepositories.id} > ${cursor}::uuid` : undefined)).orderBy(githubRepositories.id).limit(limit + 1);
      return wireValue({ items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null, hasMore: items.length > limit });
    },
    async connect(actor: Actor, raw: unknown, requestId: string, key?: string) {
      assertHumanOwner(actor); const input = githubRepository.extend({ connected: z.boolean() }).parse(raw);
      return atomicMutation(db, actor, "github_connect", input, requestId, key, async (tx) => {
        const [repo] = await tx.select().from(githubRepositories).where(and(eq(githubRepositories.id, input.repositoryId), eq(githubRepositories.ownerId, actor.ownerId)));
        if (!repo) throw new DomainError("not_found", "Repository was not found. Load installation repositories first.");
        if (input.connected) {
          const [installation] = await tx.select().from(githubInstallations).where(eq(githubInstallations.id, repo.installationId));
          if (repo.availability !== "available" || installation?.status !== "active") throw new DomainError("integration_unavailable", "Verify repository access through the installation before connecting.");
        }
        if (input.connected) await tx.insert(projectRepositories).values({ ownerId: actor.ownerId, projectId: input.projectId, repositoryId: repo.id }).onConflictDoNothing();
        else await tx.delete(projectRepositories).where(and(eq(projectRepositories.projectId, input.projectId), eq(projectRepositories.repositoryId, repo.id)));
        const linkedTasks = await query<{ id: string; revision: number }>(tx, sql`select distinct t.id, t.revision from tasks t join task_github_links l on l.task_id = t.id where l.project_id = ${input.projectId} and l.repository_id = ${repo.id}`);
        for (const task of linkedTasks) await baselineTask(tx, actor.ownerId, input.projectId, task);
        await activity(tx, actor, input.projectId, requestId, "github_connection", { repositoryId: repo.id, connected: input.connected });
        return { value: { connected: input.connected }, projectId: input.projectId };
      }, async (tx) => { assertHumanOwner(actor); await projectLock(tx, actor, input.projectId, "write"); });
    },
    async issues(actor: Actor, raw: unknown) {
      const input = githubRepository.extend({ page: githubPage }).parse(raw);
      const items = await external(actor, input.projectId, input.repositoryId, "read", (api, id, owner, name, signal) => api.issues(id, owner, name, input.page, signal));
      // GitHub paginates the combined issues/PR feed. Keep advancing even on an all-PR page.
      return { items: items.filter((item) => item.pull_request === undefined).map((item) => ({ number: item.number, title: item.title, state: item.state, url: item.html_url })), nextPage: items.length === 100 ? input.page + 1 : null };
    },
    async importIssue(actor: Actor, raw: unknown, requestId: string, key?: string) {
      const input = githubImportInput.parse(raw);
      await repositoryFor(db, actor, input.projectId, input.repositoryId, "write");
      // Authorize and replay before any provider work, so completed retries also work offline.
      const replay = await receipt(db, actor, "github_import", input, requestId, key);
      if (replay.found) return replay.value;
      const result = await external(actor, input.projectId, input.repositoryId, "write", (api, id, owner, name, signal) => api.item(id, owner, name, "issue", input.number, {}, signal));
      if (!result.data) throw new DomainError("integration_unavailable", "GitHub issue did not return content.");
      const remote = result.data; const content = githubMarkdown(remote.body ?? "");
      return atomicMutation(db, actor, "github_import", input, requestId, key, async (tx) => {
        await repositoryFor(tx, actor, input.projectId, input.repositoryId, "write");
        const item = await cacheItem(tx, actor.ownerId, input.repositoryId, "issue", remote);
        const [previous] = await tx.select().from(githubIssueImports).where(and(eq(githubIssueImports.projectId, input.projectId), eq(githubIssueImports.githubItemId, item.id)));
        if (previous) {
          const existing = await owned(tx, actor, "tasks", previous.taskId);
          const project = await owned(tx, actor, "projects", input.projectId);
          throw new DomainError("duplicate_import", "This issue was already imported. Open or restore the existing task.", { taskId: existing.id, reference: `${project.prefix}-${existing.number}` });
        }
        const graph = await loadGraph(tx, await owned(tx, actor, "projects", input.projectId));
        const context = { db: tx, actor, graph, requestId };
        const task = await taskHandlers.create_task(context, commands.create_task.parse({ projectId: input.projectId, sectionId: input.sectionId, statusId: input.statusId, title: remote.title, reopenCompletedAncestors: input.reopenCompletedAncestors })) as { id: string; revision: number };
        await noteHandlers.update_note(context, { kind: "task", id: task.id, content, expectedRevision: 0 });
        await tx.insert(githubIssueImports).values({ ownerId: actor.ownerId, projectId: input.projectId, githubItemId: item.id, taskId: task.id });
        await tx.insert(taskGithubLinks).values({ ownerId: actor.ownerId, projectId: input.projectId, taskId: task.id, repositoryId: input.repositoryId, githubItemId: item.id, origin: "import" });
        await activity(tx, actor, input.projectId, requestId, "github_import", { githubItemId: item.id, fields: ["title", "note"], importedCharacters: notePlainText(content).length }, { taskId: task.id });
        return { value: { ...task, reference: `${graph.project.prefix}-${graph.project.nextTaskNumber}` }, projectId: input.projectId };
      }, async (tx) => { await projectLock(tx, actor, input.projectId, "write"); });
    },
    async link(actor: Actor, raw: unknown, requestId: string, key?: string) {
      const input = githubLinkInput.parse(raw);
      const task = await owned(db, actor, "tasks", input.taskId); if (task.projectId !== input.projectId) invalid("Choose a task in this project.");
      await repositoryFor(db, actor, input.projectId, input.repositoryId, "write");
      const replay = await receipt(db, actor, "github_link", input, requestId, key); if (replay.found) return replay.value;
      const result = await external(actor, input.projectId, input.repositoryId, "write", (api, id, owner, name, signal) => api.item(id, owner, name, input.type, input.number, {}, signal));
      if (!result.data) throw new DomainError("integration_unavailable", "GitHub item was not returned.");
      return atomicMutation(db, actor, "github_link", input, requestId, key, async (tx) => {
        await repositoryFor(tx, actor, input.projectId, input.repositoryId, "write");
        const current = await owned(tx, actor, "tasks", input.taskId); checkRevision(current, input.expectedRevision);
        const item = await cacheItem(tx, actor.ownerId, input.repositoryId, input.type, result.data!);
        const [link] = await tx.insert(taskGithubLinks).values({ ownerId: actor.ownerId, projectId: input.projectId, taskId: current.id, repositoryId: input.repositoryId, githubItemId: item.id, origin: "manual" }).onConflictDoNothing().returning();
        const updated = link ? await patch(tx, "tasks", current, {}) : current;
        if (link) { await baselineTask(tx, actor.ownerId, input.projectId, updated); await activity(tx, actor, input.projectId, requestId, "github_link", { githubItemId: item.id }, { taskId: current.id }); }
        return { value: updated, projectId: input.projectId };
      }, async (tx) => { await projectLock(tx, actor, input.projectId, "write"); });
    },
    async unlink(actor: Actor, raw: unknown, requestId: string, key?: string) {
      const input = z.strictObject({ taskId: z.uuid(), linkId: z.uuid(), expectedRevision: z.number().int().positive() }).parse(raw);
      const task = await owned(db, actor, "tasks", input.taskId);
      return atomicMutation(db, actor, "github_unlink", input, requestId, key, async (tx) => {
        const current = await owned(tx, actor, "tasks", input.taskId); checkRevision(current, input.expectedRevision);
        const [removed] = await tx.delete(taskGithubLinks).where(and(eq(taskGithubLinks.id, input.linkId), eq(taskGithubLinks.taskId, current.id), eq(taskGithubLinks.ownerId, actor.ownerId))).returning();
        const updated = removed ? await patch(tx, "tasks", current, {}) : current;
        if (removed) { await baselineTask(tx, actor.ownerId, current.projectId, updated); await activity(tx, actor, current.projectId, requestId, "github_unlink", { githubItemId: removed.githubItemId }, { taskId: current.id }); }
        return { value: updated, projectId: current.projectId };
      }, async (tx) => { await projectLock(tx, actor, task.projectId, "write"); });
    },
    async taskLinks(actor: Actor, raw: unknown, force = false) {
      const { taskId } = z.strictObject({ taskId: z.uuid() }).parse(raw); const task = await owned(db, actor, "tasks", taskId);
      assertProjectScope(actor, actor.ownerId, task.projectId, force ? "write" : "read");
      const linked = await db.select({ link: taskGithubLinks, item: githubItems, repository: githubRepositories, installationStatus: githubInstallations.status, checks: githubCheckSummaries.summary, checksSyncedAt: githubCheckSummaries.syncedAt, error: githubSyncState.lastError, connected: projectRepositories.projectId }).from(taskGithubLinks)
        .innerJoin(githubItems, eq(githubItems.id, taskGithubLinks.githubItemId)).innerJoin(githubRepositories, eq(githubRepositories.id, githubItems.repositoryId)).innerJoin(githubInstallations, eq(githubInstallations.id, githubRepositories.installationId))
        .leftJoin(projectRepositories, and(eq(projectRepositories.projectId, taskGithubLinks.projectId), eq(projectRepositories.repositoryId, taskGithubLinks.repositoryId)))
        .leftJoin(githubCheckSummaries, and(eq(githubCheckSummaries.repositoryId, githubItems.repositoryId), eq(githubCheckSummaries.headSha, githubItems.headSha)))
        .leftJoin(githubSyncState, and(eq(githubSyncState.repositoryId, githubItems.repositoryId), sql`${githubSyncState.resource} = 'item:' || ${githubItems.id}::text`))
        .where(and(eq(taskGithubLinks.taskId, taskId), eq(taskGithubLinks.ownerId, actor.ownerId))).orderBy(taskGithubLinks.createdAt);
      const items = [];
      for (const row of linked) {
        const job = row.connected ? await enqueueRefresh(db, actor.ownerId, row.item.id, force) : null;
        const freshness = !row.connected || row.installationStatus !== "active" || row.repository.availability !== "available" || row.item.availability !== "available" ? "Connection unavailable" : job ? "Refreshing" : row.error || !row.item.syncedAt || row.item.syncedAt.getTime() < Date.now() - 60_000 ? "Stale" : "Last refreshed";
        items.push({ ...row.item, linkId: row.link.id, repository: `${row.repository.ownerName}/${row.repository.name}`, checks: row.checks, checksSyncedAt: row.checksSyncedAt, error: row.error, freshness, jobId: job?.id ?? null });
      }
      return wireValue({ items });
    },
    async rules(actor: Actor, raw: unknown) {
      assertHumanOwner(actor); const { projectId } = githubProject.parse(raw); await owned(db, actor, "projects", projectId);
      return wireValue({ items: await db.select().from(projectGithubRules).where(and(eq(projectGithubRules.ownerId, actor.ownerId), eq(projectGithubRules.projectId, projectId))) });
    },
    async saveRule(actor: Actor, raw: unknown, requestId: string, key?: string) {
      assertHumanOwner(actor); const input = githubRuleInput.parse(raw);
      return atomicMutation(db, actor, "github_rule", input, requestId, key, async (tx) => {
        const status = await owned(tx, actor, "task_statuses", input.targetStatusId);
        const category = input.ruleKind === "pr_open" ? "in_progress" : "in_review";
        if (status.projectId !== input.projectId || status.category !== category) invalid(`Choose a target status in ${category.replaceAll("_", " ")}.`);
        const [current] = await tx.select().from(projectGithubRules).where(and(eq(projectGithubRules.projectId, input.projectId), eq(projectGithubRules.ruleKind, input.ruleKind)));
        if ((current?.revision ?? 0) !== input.expectedRevision) throw new DomainError("conflict", "Rule settings changed. Reload before retrying.");
        const values = { enabled: input.enabled, targetStatusId: status.id, targetCategory: category as "in_progress" | "in_review", enabledAt: input.enabled ? new Date() : null };
        const [rule] = current ? await tx.update(projectGithubRules).set({ ...values, revision: current.revision + 1, updatedAt: new Date() }).where(eq(projectGithubRules.id, current.id)).returning() : await tx.insert(projectGithubRules).values({ ownerId: actor.ownerId, projectId: input.projectId, ruleKind: input.ruleKind, ...values }).returning();
        if (rule.enabled) {
          const tasks = await query<{ id: string; revision: number }>(tx, sql`select distinct t.id, t.revision from tasks t join task_github_links l on l.task_id = t.id where t.project_id = ${input.projectId}`);
          for (const task of tasks) await baselineTask(tx, actor.ownerId, input.projectId, task, rule.id);
        }
        await activity(tx, actor, input.projectId, requestId, "github_rule", { ruleKind: rule.ruleKind, enabled: rule.enabled, targetStatusId: rule.targetStatusId });
        return { value: rule, projectId: input.projectId };
      }, async (tx) => { assertHumanOwner(actor); await projectLock(tx, actor, input.projectId, "write"); });
    },
  };
}
// Probe through the same fingerprint/grant logic; throwing rolls back an absent receipt.
const absent = Symbol("absent");
async function receipt(db: Database, actor: Actor, operation: string, input: Record<string, unknown> & { projectId: string }, requestId: string, key?: string): Promise<{ found: boolean; value?: unknown }> {
  if (!key) return { found: false };
  try {
    const value = await atomicMutation(db, actor, operation, input, requestId, key, async () => { throw absent; }, async (tx) => { const project = await owned(tx, actor, "projects", input.projectId); assertProjectScope(actor, actor.ownerId, project.id, "write"); });
    return { found: true, value };
  } catch (error) { if (error === absent) return { found: false }; throw error; }
}
