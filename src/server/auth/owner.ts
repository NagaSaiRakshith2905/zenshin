import "server-only";
import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/server/db";
import { account } from "@/server/db/schema";

// A stable primary key also prevents two concurrent first callbacks provisioning two owners.
export const ownerUserId = (githubId: string) => `github:${githubId}`;

export function isOwnerProfile(source: { method: string; oauth?: { providerId: string; profile?: Record<string, unknown> } }, githubId: string) {
  const id = source.oauth?.profile?.id;
  return source.method === "oauth" && source.oauth?.providerId === "github"
    && (typeof id === "string" || (typeof id === "number" && Number.isSafeInteger(id)))
    && String(id) === githubId;
}

export async function hasOwnerBinding(db: DatabaseExecutor, userId: string, githubId: string) {
  if (userId !== ownerUserId(githubId)) return false;
  const [binding] = await db.select({ id: account.id }).from(account).where(and(
    eq(account.userId, userId), eq(account.providerId, "github"), eq(account.accountId, githubId),
  )).limit(1);
  return Boolean(binding);
}
