import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { GithubItemState, GithubRuleKind } from "@/lib/contracts/github";
import type { DatabaseExecutor } from "@/server/db";
import { githubAutomationEvaluations as evaluations, githubInstallations, githubItems, githubRepositories, projectGithubRules, projectRepositories, taskGithubLinks } from "@/server/db/schema";
import type { Actor } from "@/server/auth/access";
import { activity } from "../work/foundation";
import { loadGraph } from "../work/graph";
import { patch, type Rows } from "../work/store";

type PR = GithubItemState & { syncedAt: Date | null };
type BaselinePR = { id: string; updatedAt: string; state?: string; isDraft: boolean; isMerged: boolean };
const openTime = (pr: PR) => new Date(Math.max(pr.readyAt?.getTime() ?? 0, pr.openedAt?.getTime() ?? 0));
export function automationEvents(kind: GithubRuleKind, prs: PR[], baselineAt: Date, now = new Date(), baselineStates: BaselinePR[] = []) {
  const verified = (pr: PR) => pr.availability === "available" && pr.syncedAt !== null && pr.syncedAt.getTime() >= now.getTime() - 60_000;
  if (kind === "pr_open") return prs.filter((pr) => {
    const previous = baselineStates.find((item) => item.id === pr.id);
    const alreadyOpen = previous && !previous.isDraft && !previous.isMerged && previous.state === "open" && openTime(pr).getTime() <= Date.parse(previous.updatedAt);
    return verified(pr) && pr.state === "open" && !pr.isDraft && !pr.isMerged && openTime(pr).getTime() > baselineAt.getTime() && !alreadyOpen;
  }).map((pr) => `open:${pr.id}:${openTime(pr).toISOString()}`);
  if (!prs.length || !prs.every((pr) => verified(pr) && pr.isMerged && !pr.isDraft && pr.mergedAt)) return [];
  if (!prs.some((pr) => pr.mergedAt!.getTime() > baselineAt.getTime() && !baselineStates.find((item) => item.id === pr.id)?.isMerged)) return [];
  return [`merged:${prs.map((pr) => `${pr.id}:${pr.mergedAt!.toISOString()}`).sort().join(",")}`];
}
async function linkedPRs(db: DatabaseExecutor, taskId: string): Promise<PR[]> {
  const linked = await db.select({ item: githubItems, repository: githubRepositories, connected: projectRepositories.projectId, installationStatus: githubInstallations.status }).from(taskGithubLinks)
    .innerJoin(githubItems, eq(githubItems.id, taskGithubLinks.githubItemId))
    .innerJoin(githubRepositories, eq(githubRepositories.id, githubItems.repositoryId))
    .innerJoin(githubInstallations, eq(githubInstallations.id, githubRepositories.installationId))
    .leftJoin(projectRepositories, and(eq(projectRepositories.projectId, taskGithubLinks.projectId), eq(projectRepositories.repositoryId, taskGithubLinks.repositoryId)))
    .where(and(eq(taskGithubLinks.taskId, taskId), eq(githubItems.type, "pr")));
  return linked.map(({ item, repository, connected, installationStatus }) => ({ ...item, availability: connected && installationStatus === "active" && repository.availability === "available" ? item.availability : "unavailable" }));
}
// Caller holds the project guard, shared with task/status/link edits and reconciliation.
export async function baselineTask(db: DatabaseExecutor, ownerId: string, projectId: string, task: { id: string; revision: number }, ruleId?: string) {
  const rules = await db.select().from(projectGithubRules).where(and(eq(projectGithubRules.projectId, projectId), eq(projectGithubRules.enabled, true), ruleId ? eq(projectGithubRules.id, ruleId) : undefined));
  const prs = await linkedPRs(db, task.id);
  for (const rule of rules) await db.insert(evaluations).values({ ownerId, projectId, taskId: task.id, ruleId: rule.id, eventFingerprint: `baseline:${randomUUID()}`, baselineRemoteStates: { items: prs.map((pr) => ({ id: pr.id, updatedAt: pr.remoteUpdatedAt.toISOString(), state: pr.state, isDraft: pr.isDraft, isMerged: pr.isMerged })) }, outcome: "baseline", resultingTaskRevision: task.revision });
}
export async function evaluateProject(db: DatabaseExecutor, project: Rows["projects"], taskIds: string[], requestId: string) {
  const graph = await loadGraph(db, project);
  const actor: Actor = { kind: "system", ownerId: project.ownerId, credentialId: null, job: "github_reconcile", projectIds: [project.id], scopes: ["read", "write"] };
  const rules = await db.select().from(projectGithubRules).where(and(eq(projectGithubRules.projectId, project.id), eq(projectGithubRules.enabled, true)));
  for (const taskId of taskIds) {
    const task = graph.tasks.find((row) => row.id === taskId); if (!task) continue;
    const prs = await linkedPRs(db, taskId);
    for (const rule of rules) {
      const [baseline] = await db.select().from(evaluations).where(and(eq(evaluations.taskId, taskId), eq(evaluations.ruleId, rule.id), eq(evaluations.outcome, "baseline"))).orderBy(desc(evaluations.evaluatedAt), desc(evaluations.id)).limit(1);
      if (!baseline) { await baselineTask(db, project.ownerId, project.id, task, rule.id); continue; }
      for (const event of automationEvents(rule.ruleKind, prs, baseline.evaluatedAt, new Date(), (baseline.baselineRemoteStates.items ?? []) as BaselinePR[])) {
        const fingerprint = `${baseline.id}:${event}`;
        const [seen] = await db.select({ id: evaluations.id }).from(evaluations).where(and(eq(evaluations.taskId, taskId), eq(evaluations.ruleId, rule.id), eq(evaluations.eventFingerprint, fingerprint)));
        if (seen) continue;
        const source = rule.ruleKind === "pr_open" ? "ready" : "in_progress";
        const category = rule.ruleKind === "pr_open" ? "in_progress" : "in_review";
        const target = graph.statuses.find((s) => s.id === rule.targetStatusId && s.category === category);
        const transition = target && graph.status(task.statusId).category === source && !graph.archived(task) && !graph.ancestors(task.sectionId).some((s) => s.lifecycle === "completed");
        if (transition) {
          const from = task.statusId;
          Object.assign(task, await patch(db, "tasks", task, { statusId: target.id }));
          await activity(db, actor, project.id, requestId, "github_automation", { ruleKind: rule.ruleKind, statusId: { from, to: target.id }, resultRevision: task.revision }, { taskId });
        }
        await db.insert(evaluations).values({ ownerId: project.ownerId, projectId: project.id, taskId, ruleId: rule.id, eventFingerprint: fingerprint, baselineRemoteStates: { baselineId: baseline.id }, outcome: transition ? "transitioned" : "no_op", resultingTaskRevision: task.revision }).onConflictDoNothing();
      }
    }
  }
}
