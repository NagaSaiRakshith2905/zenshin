import { createHmac, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type AgentActor, type HumanActor } from "../../src/server/auth/access";
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { activities, backgroundJobs, githubAutomationEvaluations, githubCheckSummaries, githubInstallations, githubIssueImports, githubItems, githubRepositories, githubSyncState, githubWebhookDeliveries, tasks, taskGithubLinks } from "../../src/server/db/schema";
import { GithubError, type GithubProvider, type RemoteItem } from "../../src/server/integrations/github";
import { createGithubService } from "../../src/server/services/github";
import { enqueueRefresh, reconcileGithub } from "../../src/server/services/github/refresh";
import { receiveGithubWebhook, expandGithubDelivery } from "../../src/server/services/github/webhook";
import { createWorkReader, createWorkService } from "../../src/server/services/work";
import { JobDeferred, enqueueJob, runJobs } from "../../src/server/jobs";
import { createTestDatabase } from "../support/postgres";

describe("GitHub connections, snapshot imports and replay-safe automation", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const fixture = createFixtureData("development", "github");
  const owner: HumanActor = { kind: "human", ownerId: fixture.owner.id, credentialId: null, projectIds: null, scopes: actionScopes };
  const projectId = fixture.projects[0].id!;
  let installationId: string; let repositoryId: string; let nextNumber = 100;
  const remote = new Map<number, RemoteItem>();
  const api: GithubProvider = {
    installations: vi.fn(async () => [{ id: 700, account: { id: 701, login: "owner" }, suspended_at: null, permissions: { metadata: "read", issues: "read", pull_requests: "read", checks: "read", statuses: "read" } }]),
    repositories: vi.fn(async () => ({ repositories: [{ id: 702, name: "repo", owner: { login: "owner" }, default_branch: "main" }], total_count: 1 })),
    repository: vi.fn(async () => ({ id: 702, name: "repo", owner: { login: "owner" }, default_branch: "main" })),
    issues: vi.fn(async () => [...remote.values()]),
    item: vi.fn(async (_id, _owner, _repo, _type, number) => { const item = remote.get(number); if (!item) throw new GithubError(404); return { data: structuredClone(item), etag: `"${item.updated_at}"`, lastModified: null }; }),
    checks: vi.fn(async () => ({ checks: [{ name: "CI", status: "completed", conclusion: "success" }], statuses: [], state: "success", complete: true })),
  };
  const service = () => createGithubService(database.db, api);
  const work = () => createWorkService(database.db);
  const signal = () => AbortSignal.timeout(10000);
  const status = (category: string) => fixture.statuses.find((s) => s.projectId === projectId && s.category === category)!;
  const fetchTask = async (id: string) => (await database.db.select().from(tasks).where(eq(tasks.id, id)))[0];
  async function task(category = "ready") { return await work().execute(owner, "create_task", { projectId, title: "GitHub task", statusId: status(category).id }, randomUUID()) as { id: string; revision: number }; }
  async function link(taskId: string, type: "issue" | "pr" = "pr", extra: Partial<RemoteItem> = {}) {
    const number = nextNumber++; const date = "2026-01-01T00:00:00Z";
    remote.set(number, { id: 10000 + number, number, title: `Remote ${number}`, body: "# Snapshot\n\n**body**", html_url: `https://github.com/owner/repo/${type === "pr" ? "pull" : "issues"}/${number}`, state: "open", created_at: date, updated_at: date, ...(type === "pr" ? { draft: true, merged: false, merged_at: null, head: { sha: "a".repeat(40) } } : {}), ...extra });
    await service().link(owner, { projectId, repositoryId, taskId, number, type, expectedRevision: (await fetchTask(taskId)).revision }, randomUUID(), randomUUID());
    const [item] = await database.db.select().from(githubItems).where(and(eq(githubItems.repositoryId, repositoryId), eq(githubItems.number, number)));
    return { item, number };
  }
  async function refresh(itemId: string) {
    await database.db.update(githubInstallations).set({ nextRequestAt: new Date(0) }).where(eq(githubInstallations.id, installationId));
    await reconcileGithub(database.db, owner.ownerId, { itemId }, signal(), api);
  }
  async function rule(kind: "pr_open" | "all_prs_merged", enabled = true, targetStatusId = status(kind === "pr_open" ? "in_progress" : "in_review").id!) {
    const current = (await service().rules(owner, { projectId })).items.find((r) => r.ruleKind === kind);
    return service().saveRule(owner, { projectId, ruleKind: kind, enabled, targetStatusId, expectedRevision: current?.revision ?? 0 }, randomUUID());
  }
  beforeAll(async () => {
    database = await createTestDatabase(); await insertFixtureData(database.db, fixture);
    installationId = (await service().installations(owner, 1)).items[0].id;
    repositoryId = (await service().discoverRepositories(owner, { installationId, page: 1 })).items[0].id;
    await service().connect(owner, { projectId, repositoryId, connected: true }, randomUUID());
  });
  afterAll(async () => { await database?.dispose(); });

  it("denies management to agents and scopes provider reads/mutations before any request", async () => {
    const agent: AgentActor = { kind: "agent", ownerId: owner.ownerId, credentialId: randomUUID(), projectIds: [], scopes: ["read", "write"] };
    const calls = vi.mocked(api.item).mock.calls.length;
    await expect(service().installations(agent, 1)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().discoverRepositories(agent, { installationId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().rules(agent, { projectId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service().issues(agent, { projectId, repositoryId })).rejects.toMatchObject({ code: "not_found" });
    await expect(service().importIssue(agent, { projectId, repositoryId, number: 1 }, randomUUID())).rejects.toMatchObject({ code: "not_found" });
    expect(vi.mocked(api.item).mock.calls.length).toBe(calls);
  });
  it("excludes PRs from browsed issues while retaining the combined feed's pagination", async () => {
    const t = await task(); const { number } = await link(t.id, "issue"); const issue = remote.get(number)!;
    vi.mocked(api.issues).mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ ...issue, number: i + 1, pull_request: {} })));
    expect(await service().issues(owner, { projectId, repositoryId, page: 3 })).toEqual({ items: [], nextPage: 4 });
  });
  it("imports once, replays offline, keeps its snapshot/provenance after refresh/unlink/archive, and frees it on deletion", async () => {
    const t = await task(); const { item, number } = await link(t.id, "issue");
    const key = randomUUID(); const input = { projectId, repositoryId, number };
    const imported = await service().importIssue(owner, input, "import", key) as { id: string; title: string; revision: number; reference: string };
    vi.mocked(api.item).mockRejectedValueOnce(new GithubError(503));
    expect(await service().importIssue(owner, input, "replay", key)).toMatchObject({ id: imported.id });
    vi.mocked(api.item).mockReset().mockImplementation(async (_id, _o, _r, _t, n) => ({ data: structuredClone(remote.get(n)!), etag: null, lastModified: null }));
    remote.set(number, { ...remote.get(number)!, title: "Changed upstream", body: "Changed body", updated_at: new Date().toISOString() }); await refresh(item.id);
    expect((await fetchTask(imported.id)).title).toBe(imported.title);
    const note = await database.db.execute(sql`select plain_text from notes where task_id = ${imported.id}`); expect(note.rows[0].plain_text).toContain("body");
    const [association] = await database.db.select().from(taskGithubLinks).where(eq(taskGithubLinks.taskId, imported.id));
    await service().unlink(owner, { taskId: imported.id, linkId: association.id, expectedRevision: imported.revision }, "unlink");
    await work().execute(owner, "archive_item", { kind: "task", id: imported.id, expectedRevision: (await fetchTask(imported.id)).revision }, "archive");
    await expect(service().importIssue(owner, input, "duplicate")).rejects.toMatchObject({ code: "duplicate_import", details: { taskId: imported.id, reference: imported.reference } });
    await work().execute(owner, "delete_item", { kind: "task", id: imported.id, expectedRevision: (await fetchTask(imported.id)).revision, confirmation: { name: imported.title, sectionCount: 0, taskCount: 1, fileCount: 0 } }, "delete");
    expect(await database.db.select().from(githubIssueImports).where(eq(githubIssueImports.taskId, imported.id))).toHaveLength(0);
    const fresh = await service().importIssue(owner, input, "fresh") as { id: string }; expect(fresh.id).not.toBe(imported.id);
  });
  it("defaults rules off and links historical PRs without moving tasks", async () => {
    const t = await task(); await link(t.id, "pr", { draft: false });
    expect((await fetchTask(t.id)).statusId).toBe(status("ready").id);
    await rule("pr_open");
    const rows = await database.db.select().from(githubItems).where(eq(githubItems.type, "pr")); for (const item of rows) await refresh(item.id);
    expect((await fetchTask(t.id)).statusId).toBe(status("ready").id);
  });
  it("transitions draft-to-ready once, records system attribution, and cannot replay after returning to Ready", async () => {
    await rule("pr_open"); const t = await task(); const { item, number } = await link(t.id);
    remote.set(number, { ...remote.get(number)!, draft: false, updated_at: new Date(Date.now() + 1000).toISOString() });
    await refresh(item.id); expect((await fetchTask(t.id)).statusId).toBe(status("in_progress").id);
    await work().execute(owner, "transition_task", { id: t.id, expectedRevision: (await fetchTask(t.id)).revision, statusId: status("ready").id }, "human");
    await refresh(item.id); expect((await fetchTask(t.id)).statusId).toBe(status("ready").id);
    const changes = await database.db.select().from(activities).where(and(eq(activities.taskId, t.id), eq(activities.action, "github_automation")));
    expect(changes).toHaveLength(1); expect(changes[0].actorKind).toBe("system");
  });
  it("handles a newly observed non-draft PR opening after a closed-link baseline", async () => {
    await rule("pr_open"); const t = await task(); const { item, number } = await link(t.id, "pr", { state: "closed", draft: false });
    remote.set(number, { ...remote.get(number)!, state: "open", updated_at: new Date(Date.now() + 2000).toISOString() });
    await refresh(item.id); expect((await fetchTask(t.id)).statusId).toBe(status("in_progress").id);
  });
  it("records no-op events when a task is outside Ready", async () => {
    await rule("pr_open"); const t = await task("backlog"); const { item, number } = await link(t.id);
    remote.set(number, { ...remote.get(number)!, draft: false, updated_at: new Date(Date.now() + 2000).toISOString() });
    await refresh(item.id);
    expect(await database.db.select().from(githubAutomationEvaluations).where(and(eq(githubAutomationEvaluations.taskId, t.id), eq(githubAutomationEvaluations.outcome, "no_op")))).toHaveLength(1);
    await work().execute(owner, "transition_task", { id: t.id, expectedRevision: (await fetchTask(t.id)).revision, statusId: status("ready").id }, "ready");
    await refresh(item.id); expect((await fetchTask(t.id)).statusId).toBe(status("ready").id);
  });
  it("rechecks the current task status/revision after a provider response and leaves relatives untouched", async () => {
    await rule("pr_open"); const parent = await task();
    const child = await work().execute(owner, "create_task", { projectId, title: "Child", parentTaskId: parent.id, statusId: status("ready").id }, "child") as { id: string };
    const { item, number } = await link(child.id);
    let resolve!: () => void; const waiting = new Promise<void>((r) => { resolve = r; }); let entered!: () => void; const started = new Promise<void>((r) => { entered = r; });
    vi.mocked(api.item).mockImplementationOnce(async () => { entered(); await waiting; return { data: { ...remote.get(number)!, draft: false, updated_at: new Date(Date.now() + 3000).toISOString() }, etag: null, lastModified: null }; });
    const pending = refresh(item.id); await started;
    await work().execute(owner, "transition_task", { id: child.id, expectedRevision: (await fetchTask(child.id)).revision, statusId: status("backlog").id }, "race");
    resolve(); await pending;
    expect((await fetchTask(child.id)).statusId).toBe(status("backlog").id);
    expect((await fetchTask(parent.id)).statusId).toBe(status("ready").id);
  });
  it("requires every linked PR merged and verified, then moves only the task to the selected custom In review status", async () => {
    const custom = await work().execute(owner, "create_status", { projectId, category: "in_review", name: "QA review" }, "status") as { id: string };
    await rule("all_prs_merged", true, custom.id); const t = await task("in_progress"); const a = await link(t.id); const b = await link(t.id);
    remote.set(a.number, { ...remote.get(a.number)!, draft: false, state: "closed", merged: true, merged_at: new Date(Date.now() + 3000).toISOString(), updated_at: new Date(Date.now() + 3000).toISOString() });
    await refresh(a.item.id); expect((await fetchTask(t.id)).statusId).toBe(status("in_progress").id);
    remote.set(b.number, { ...remote.get(b.number)!, draft: false, state: "closed", merged: true, merged_at: new Date(Date.now() + 4000).toISOString(), updated_at: new Date(Date.now() + 4000).toISOString() });
    await refresh(b.item.id); expect((await fetchTask(t.id)).statusId).toBe(custom.id);
    const summaries = await database.db.select().from(githubCheckSummaries).where(eq(githubCheckSummaries.repositoryId, repositoryId)); expect(summaries.some((s) => s.headSha === "a".repeat(40))).toBe(true);
  });
  it("rejects incompatible rule targets and agent rule configuration", async () => {
    await expect(rule("pr_open", true, status("done").id)).rejects.toMatchObject({ code: "validation_error" });
    const agent: AgentActor = { kind: "agent", ownerId: owner.ownerId, credentialId: randomUUID(), projectIds: [projectId], scopes: actionScopes };
    await expect(service().saveRule(agent, { projectId, ruleKind: "pr_open", enabled: true, targetStatusId: status("in_progress").id, expectedRevision: 1 }, "forbidden")).rejects.toMatchObject({ code: "forbidden" });
  });
  it("coalesces concurrent stale/manual refreshes in the shared read service", async () => {
    const t = await task(); const { item } = await link(t.id);
    await database.db.update(githubItems).set({ syncedAt: new Date(0) }).where(eq(githubItems.id, item.id));
    const results = await Promise.all([service().taskLinks(owner, { taskId: t.id }), service().taskLinks(owner, { taskId: t.id }, true), service().taskLinks(owner, { taskId: t.id })]);
    expect(new Set(results.map((r) => r.items[0].jobId)).size).toBe(1); expect(results[0].items[0].freshness).toBe("Refreshing");
  });
  it("retains local/cache data on rate limits and cannot bypass installation backoff", async () => {
    const t = await task(); const { item } = await link(t.id); const retryAt = new Date(Date.now() + 120000);
    vi.mocked(api.repository).mockRejectedValueOnce(new GithubError(429, retryAt));
    await expect(refresh(item.id)).rejects.toBeInstanceOf(JobDeferred);
    expect((await fetchTask(t.id)).title).toBe("GitHub task");
    const [cached] = await database.db.select().from(githubItems).where(eq(githubItems.id, item.id)); expect(cached.title).toBe(item.title);
    const [sync] = await database.db.select().from(githubSyncState).where(eq(githubSyncState.resource, `item:${item.id}`)); expect(sync.nextAttemptAt).toEqual(retryAt);
    const job = await enqueueRefresh(database.db, owner.ownerId, item.id, true); expect(job!.availableAt.getTime()).toBeGreaterThanOrEqual(retryAt.getTime());
    await database.db.update(githubInstallations).set({ nextRequestAt: new Date(0) }).where(eq(githubInstallations.id, installationId));
  });
  it("does not overwrite a newer cache revision with an in-flight old response", async () => {
    const t = await task(); const { item, number } = await link(t.id);
    let resolve!: () => void; const waiting = new Promise<void>((r) => { resolve = r; }); let started!: () => void; const entered = new Promise<void>((r) => { started = r; });
    vi.mocked(api.item).mockImplementationOnce(async () => { started(); await waiting; return { data: { ...remote.get(number)!, title: "Old response" }, etag: "old", lastModified: null }; });
    const refreshing = refresh(item.id); await entered;
    await database.db.update(githubItems).set({ title: "New response", revision: item.revision + 1 }).where(eq(githubItems.id, item.id)); resolve(); await refreshing;
    const [cached] = await database.db.select().from(githubItems).where(eq(githubItems.id, item.id)); expect(cached.title).toBe("New response");
  });
  it("marks missing items and lost repository access separately without deleting task content", async () => {
    const t = await task(); const first = await link(t.id); remote.delete(first.number);
    vi.mocked(api.item).mockRejectedValueOnce(new GithubError(404)); await refresh(first.item.id);
    expect((await service().taskLinks(owner, { taskId: t.id })).items[0].availability).toBe("deleted");
    const second = await link(t.id); vi.mocked(api.repository).mockRejectedValueOnce(new GithubError(404)); await expect(refresh(second.item.id)).rejects.toBeInstanceOf(GithubError);
    expect((await fetchTask(t.id)).title).toBe("GitHub task");
    const [repo] = await database.db.select().from(githubRepositories).where(eq(githubRepositories.id, repositoryId)); expect(repo.availability).toBe("unavailable");
    await database.db.update(githubInstallations).set({ nextRequestAt: new Date(0) }).where(eq(githubInstallations.id, installationId));
  });
  it("authenticates webhook bytes, deduplicates and durably fans out refresh hints", async () => {
    const delivery = randomUUID(); const body = JSON.stringify({ installation: { id: 700 }, repository: { id: 702 }, action: "edited" }); const secret = "test-secret".repeat(4);
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect((await receiveGithubWebhook(database.db, body, "sha256=bad", delivery, "issues", secret)).status).toBe(401);
    for (let i = 0; i < 2; i++) expect((await receiveGithubWebhook(database.db, body, signature, delivery, "issues", secret)).status).toBe(202);
    const jobs = await database.db.select().from(backgroundJobs).where(eq(backgroundJobs.deduplicationKey, `github-delivery:${delivery}`)); expect(jobs).toHaveLength(1);
    await expandGithubDelivery(database.db, owner.ownerId, jobs[0].payload);
    const [saved] = await database.db.select().from(githubWebhookDeliveries).where(eq(githubWebhookDeliveries.deliveryId, delivery)); expect(saved.state).toBe("processed");
  });
  it("defers provider waits without consuming retry attempts", async () => {
    const job = await enqueueJob(database.db, { ownerId: owner.ownerId, kind: "github_sync", deduplicationKey: randomUUID(), payload: { deferredTest: true } });
    // Isolate the runner from previously enqueued refresh hints in this suite.
    await database.db.update(backgroundJobs).set({ availableAt: new Date(Date.now() + 3600000) }).where(sql`id <> ${job.id} and state = 'pending'`);
    const later = new Date(Date.now() + 300000);
    await runJobs(database.db, owner.ownerId, { github_sync: async () => { throw new JobDeferred(later); } }, { batch: 1, timeMs: 1000 });
    const [saved] = await database.db.select().from(backgroundJobs).where(eq(backgroundJobs.id, job.id)); expect(saved).toMatchObject({ state: "pending", attempts: 0, availableAt: later });
  });
  it("normal local task reads remain usable after provider errors", async () => {
    const t = await task(); expect(await createWorkReader(database.db).get(owner, "tasks", t.id)).toMatchObject({ id: t.id, title: "GitHub task" });
  });
});
