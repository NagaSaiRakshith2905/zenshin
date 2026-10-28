import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, type DatabaseExecutor } from "@/server/db";
import { account, agentCredentials, agentProjectGrants, apikey } from "@/server/db/schema";
import { getAuthEnv } from "@/server/env";
import { getAuth } from ".";
import { AccessError, actionScopes, type AgentActor, type HumanActor } from "./access";
import { hasOwnerBinding, ownerUserId } from "./owner";

const scopesSchema = z.array(z.enum(["read", "write", "upload", "archive", "complete"])).min(1);

export async function authenticateOwner(headers: Headers): Promise<HumanActor> {
  // Never fall back from an agent/ambiguous request to an ambient browser cookie.
  if (headers.has("authorization") || headers.has("x-api-key")) throw new AccessError("forbidden", "An owner browser session is required.");
  const session = await getAuth().api.getSession({ headers });
  if (!session) throw new AccessError("unauthenticated", "Sign in to continue.");
  if (!await hasOwnerBinding(getDatabase(), session.user.id, getAuthEnv().OWNER_GITHUB_ID)) {
    throw new AccessError("forbidden", "This account cannot access Zenshin.");
  }
  return Object.freeze({ kind: "human", ownerId: session.user.id, credentialId: null, scopes: actionScopes, projectIds: null });
}

export async function loadAgentActor(db: DatabaseExecutor, keyId: string, githubId: string): Promise<AgentActor> {
  const now = new Date();
  const rows = await db.select({
    id: agentCredentials.id, ownerId: agentCredentials.ownerId, scopes: agentCredentials.scopes,
    projectId: agentProjectGrants.projectId,
  }).from(agentCredentials)
    .innerJoin(apikey, and(eq(apikey.id, agentCredentials.apiKeyId), eq(apikey.referenceId, agentCredentials.ownerId)))
    .innerJoin(account, and(eq(account.userId, agentCredentials.ownerId), eq(account.providerId, "github"), eq(account.accountId, githubId)))
    .leftJoin(agentProjectGrants, eq(agentProjectGrants.credentialId, agentCredentials.id))
    .where(and(eq(apikey.id, keyId), eq(agentCredentials.ownerId, ownerUserId(githubId)),
      eq(apikey.enabled, true), or(isNull(apikey.expiresAt), gt(apikey.expiresAt, now)), isNull(agentCredentials.revokedAt)));
  const record = rows[0];
  const scopes = scopesSchema.safeParse(record?.scopes);
  if (!record || !scopes.success) throw new AccessError("unauthenticated", "Replace this agent credential.");
  return Object.freeze({ kind: "agent", ownerId: record.ownerId, credentialId: record.id,
    scopes: Object.freeze(scopes.data), projectIds: Object.freeze([...new Set(rows.flatMap((row) => row.projectId ? [row.projectId] : []))]),
  });
}

export async function authenticateAgent(headers: Headers): Promise<AgentActor> {
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(headers.get("authorization") ?? "");
  if (!match) throw new AccessError("unauthenticated", "Supply an agent bearer credential.");
  const result = await getAuth().api.verifyApiKey({ body: { key: match[1] } });
  if (result.error?.code === "RATE_LIMITED") throw new AccessError("rate_limited", "Wait before retrying this credential.");
  if (!result.valid || !result.key) throw new AccessError("unauthenticated", "Replace this agent credential.");
  const db = getDatabase();
  const actor = await loadAgentActor(db, result.key.id, getAuthEnv().OWNER_GITHUB_ID);
  await db.update(agentCredentials).set({ lastUsedAt: new Date() }).where(eq(agentCredentials.id, actor.credentialId));
  return actor;
}

// Presence of Authorization selects agent authentication even if the token is invalid.
export const authenticateActor = (headers: Headers) => headers.has("authorization")
  ? authenticateAgent(headers) : authenticateOwner(headers);
