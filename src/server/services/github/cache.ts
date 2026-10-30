import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/server/db";
import { githubItems } from "@/server/db/schema";
import type { RemoteItem } from "@/server/integrations/github";
import { DomainError } from "../work/foundation";
export function remoteValues(ownerId: string, repositoryId: string, type: "issue" | "pr", remote: RemoteItem) {
  if (remote.number < 1 || (type === "issue" && remote.pull_request !== undefined) || (type === "pr" && !remote.head)) throw new DomainError("validation_error", "Choose the matching GitHub item type.");
  return { ownerId, repositoryId, githubItemId: BigInt(remote.id), type, number: remote.number, url: remote.html_url, title: remote.title, state: remote.state, isDraft: remote.draft ?? false, isMerged: Boolean(remote.merged || remote.merged_at), headSha: remote.head?.sha ?? null, remoteCreatedAt: new Date(remote.created_at), remoteUpdatedAt: new Date(remote.updated_at), openedAt: new Date(remote.created_at), mergedAt: remote.merged_at ? new Date(remote.merged_at) : null, syncedAt: new Date(), availability: "available" };
}
export async function cacheItem(db: DatabaseExecutor, ownerId: string, repositoryId: string, type: "issue" | "pr", remote: RemoteItem) {
  const values = remoteValues(ownerId, repositoryId, type, remote);
  await db.insert(githubItems).values(values).onConflictDoUpdate({ target: [githubItems.repositoryId, githubItems.number], set: { ...values, openedAt: sql`case when ${githubItems.state} = 'closed' and ${values.state} = 'open' then ${values.remoteUpdatedAt}::timestamptz else ${githubItems.openedAt} end`, readyAt: sql`case when ${githubItems.isDraft} and not ${values.isDraft} and ${values.state} = 'open' then ${values.remoteUpdatedAt}::timestamptz else ${githubItems.readyAt} end`, revision: sql`${githubItems.revision} + 1`, updatedAt: new Date() }, setWhere: and(eq(githubItems.ownerId, ownerId), eq(githubItems.githubItemId, values.githubItemId), eq(githubItems.type, type), sql`${githubItems.remoteUpdatedAt} < ${values.remoteUpdatedAt}`) });
  const [item] = await db.select().from(githubItems).where(and(eq(githubItems.ownerId, ownerId), eq(githubItems.repositoryId, repositoryId), eq(githubItems.number, remote.number)));
  if (!item || item.type !== type || item.githubItemId !== values.githubItemId) throw new DomainError("conflict", "The GitHub item identity changed. Refresh before retrying.");
  return item;
}
