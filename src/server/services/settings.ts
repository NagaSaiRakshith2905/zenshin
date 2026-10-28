import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  createCredentialSchema, credentialIdSchema, credentialScopes, preferenceValuesSchema,
  revokeCredentialSchema, updateCredentialSchema, updatePreferencesSchema,
  type CredentialSettings, type CredentialSummary, type Preferences,
} from "@/lib/contracts/settings";
import { AccessError, assertHumanOwner, type Actor } from "@/server/auth/access";
import { createOwnerAuth } from "@/server/auth/config";
import { hasOwnerBinding } from "@/server/auth/owner";
import type { Database, DatabaseExecutor } from "@/server/db";
import { agentCredentials, agentProjectGrants, apikey, projects, userPreferences } from "@/server/db/schema";
import type { AuthEnv } from "@/server/env";

export function createSettingsService(db: Database, env: AuthEnv) {
  async function owner(actor: Actor) {
    assertHumanOwner(actor);
    if (!await hasOwnerBinding(db, actor.ownerId, env.OWNER_GITHUB_ID)) throw new AccessError("forbidden", "This account cannot access Zenshin.");
  }
  async function validateGrants(tx: DatabaseExecutor, ownerId: string, ids: string[]) {
    const found = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.ownerId, ownerId), inArray(projects.id, ids)));
    if (found.length !== ids.length) throw new AccessError("validation_error", "Select projects belonging to this account.");
  }
  async function preferences(actor: Actor): Promise<Preferences> {
    await owner(actor);
    await db.insert(userPreferences).values({ userId: actor.ownerId }).onConflictDoNothing();
    const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, actor.ownerId));
    return { ...preferenceValuesSchema.parse(row && { timezone: row.timezone, theme: row.theme, defaultTaskView: row.defaultTaskView }), revision: row.revision };
  }
  return {
    preferences,
    async updatePreferences(actor: Actor, input: unknown) {
      await owner(actor);
      const { expectedRevision, ...values } = updatePreferencesSchema.parse(input);
      const [row] = await db.update(userPreferences).set({ ...values, updatedAt: new Date(), revision: sql`${userPreferences.revision} + 1` })
        .where(and(eq(userPreferences.userId, actor.ownerId), eq(userPreferences.revision, expectedRevision))).returning();
      if (!row) throw new AccessError("conflict", "Preferences changed elsewhere. Reload settings and try again.");
      return { ...values, revision: row.revision } satisfies Preferences;
    },
    async credentials(actor: Actor): Promise<CredentialSettings> {
      await owner(actor);
      const records = await db.select({
        credential: agentCredentials, enabled: apikey.enabled, keyId: apikey.id, projectId: agentProjectGrants.projectId,
      }).from(agentCredentials).leftJoin(apikey, eq(agentCredentials.apiKeyId, apikey.id))
        .leftJoin(agentProjectGrants, eq(agentCredentials.id, agentProjectGrants.credentialId))
        .where(eq(agentCredentials.ownerId, actor.ownerId)).orderBy(agentCredentials.createdAt, agentCredentials.id);
      const summaries = new Map<string, CredentialSummary>();
      for (const { credential: c, enabled, keyId, projectId } of records) {
        let summary = summaries.get(c.id);
        if (!summary) {
          summary = { id: c.id, displayName: c.displayName, scopes: c.scopes, projectIds: [], revision: c.revision,
            createdAt: c.createdAt.toISOString(), expiresAt: c.expiresAt?.toISOString() ?? null, lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
            status: c.revokedAt ? "revoked" : c.expiresAt && c.expiresAt <= new Date() ? "expired" : !keyId || !enabled ? "revoked" : "active" };
          summaries.set(c.id, summary);
        }
        if (projectId) summary.projectIds.push(projectId);
      }
      const choices = await db.select({ id: projects.id, name: projects.name, archivedAt: projects.archivedAt }).from(projects)
        .where(eq(projects.ownerId, actor.ownerId)).orderBy(projects.name, projects.id);
      return { credentials: [...summaries.values()], projects: choices.map(({ archivedAt, ...p }) => ({ ...p, archived: Boolean(archivedAt) })) };
    },
    async createCredential(actor: Actor, input: unknown) {
      await owner(actor);
      const values = createCredentialSchema.parse(input);
      return db.transaction(async (tx) => {
        await validateGrants(tx, actor.ownerId, values.projectIds);
        const key = await createOwnerAuth(tx, env).api.createApiKey({ body: {
          userId: actor.ownerId, name: values.displayName,
          expiresIn: values.expiresInDays === null ? null : values.expiresInDays * 24 * 60 * 60,
        } });
        const [credential] = await tx.insert(agentCredentials).values({ ownerId: actor.ownerId, apiKeyId: key.id,
          displayName: values.displayName, scopes: credentialScopes(values), expiresAt: key.expiresAt }).returning({ id: agentCredentials.id });
        await tx.insert(agentProjectGrants).values(values.projectIds.map((projectId) => ({ ownerId: actor.ownerId, credentialId: credential.id, projectId })));
        // This is the only service response containing the plaintext key; never cache/log it.
        return { id: credential.id, secret: key.key };
      });
    },
    async updateCredential(actor: Actor, id: string, input: unknown) {
      await owner(actor);
      credentialIdSchema.parse(id);
      const values = updateCredentialSchema.parse(input);
      await db.transaction(async (tx) => {
        const [c] = await tx.select().from(agentCredentials).where(and(eq(agentCredentials.id, id), eq(agentCredentials.ownerId, actor.ownerId))).for("update");
        if (!c) throw new AccessError("not_found", "Credential not found.");
        if (c.revision !== values.expectedRevision) throw new AccessError("conflict", "Credential changed elsewhere. Reload settings and try again.");
        if (!c.apiKeyId || c.revokedAt || (c.expiresAt && c.expiresAt <= new Date())) throw new AccessError("validation_error", "Create a new key to replace this credential.");
        await validateGrants(tx, actor.ownerId, values.projectIds);
        await tx.update(agentCredentials).set({ displayName: values.displayName, scopes: credentialScopes(values), revision: c.revision + 1, updatedAt: new Date() }).where(eq(agentCredentials.id, id));
        await tx.delete(agentProjectGrants).where(eq(agentProjectGrants.credentialId, id));
        await tx.insert(agentProjectGrants).values(values.projectIds.map((projectId) => ({ ownerId: actor.ownerId, credentialId: id, projectId })));
      });
    },
    async revokeCredential(actor: Actor, id: string, input: unknown) {
      await owner(actor);
      credentialIdSchema.parse(id);
      const { expectedRevision } = revokeCredentialSchema.parse(input);
      await db.transaction(async (tx) => {
        const [c] = await tx.select().from(agentCredentials).where(and(eq(agentCredentials.id, id), eq(agentCredentials.ownerId, actor.ownerId))).for("update");
        if (!c) throw new AccessError("not_found", "Credential not found.");
        if (c.revision !== expectedRevision) throw new AccessError("conflict", "Credential changed elsewhere. Reload settings and try again.");
        if (c.revokedAt) return;
        if (c.apiKeyId) await createOwnerAuth(tx, env).api.updateApiKey({ body: { userId: actor.ownerId, keyId: c.apiKeyId, enabled: false } });
        await tx.update(agentCredentials).set({ revokedAt: new Date(), updatedAt: new Date(), revision: c.revision + 1 }).where(eq(agentCredentials.id, id));
      });
    },
  };
}
