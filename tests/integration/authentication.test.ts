import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
vi.mock("server-only", () => ({}));
import { createOwnerAuth } from "../../src/server/auth/config";
import { loadAgentActor } from "../../src/server/auth/actors";
import { actionScopes, assertProjectScope, type HumanActor } from "../../src/server/auth/access";
import { agentCredentials, apikey, projects, user } from "../../src/server/db/schema";
import { createSettingsService } from "../../src/server/services/settings";
import { authEnvironment, githubCallback, mockGithub } from "../support/auth";
import { createTestDatabase } from "../support/postgres";

describe("owner authentication and credential lifecycle", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const owner: HumanActor = { kind: "human", ownerId: "github:42", credentialId: null, scopes: actionScopes, projectIds: null };
  beforeAll(async () => { database = await createTestDatabase(); }, 30_000);
  beforeEach(async () => { await database.pool.query('TRUNCATE TABLE "user", "apikey", "rate_limit" CASCADE'); });
  afterEach(() => { vi.unstubAllGlobals(); });
  afterAll(async () => { await database?.dispose(); });

  async function provision() {
    mockGithub({ id: 42, email: "owner@example.invalid", login: "owner" });
    const auth = createOwnerAuth(database.db, authEnvironment);
    const callback = await githubCallback(auth);
    expect(new URL(callback.response.headers.get("location")!, authEnvironment.APP_ORIGIN).href).toBe(`${authEnvironment.APP_ORIGIN}/`);
    const session = await auth.api.getSession({ headers: callback.headers });
    expect(session?.user.id).toBe(owner.ownerId);
    return { auth, sessionHeaders: callback.headers, service: createSettingsService(database.db, authEnvironment) };
  }
  async function setupCredential() {
    const provisioned = await provision();
    const [first, second] = await database.db.insert(projects).values([
      { ownerId: owner.ownerId, name: "First", prefix: "FIRST" },
      { ownerId: owner.ownerId, name: "Second", prefix: "SECOND" },
    ]).returning();
    const created = await provisioned.service.createCredential(owner, { displayName: "desktop-agent", preset: "contributor", projectIds: [first.id] });
    const [record] = await database.db.select().from(agentCredentials).where(eq(agentCredentials.id, created.id));
    return { ...provisioned, first, second, created, keyId: record.apiKeyId! };
  }

  it("cannot provision a different GitHub ID even with an explicit signup request", async () => {
    mockGithub({ id: 43, email: "owner@example.invalid", login: "owner" });
    const result = await githubCallback(createOwnerAuth(database.db, authEnvironment));
    expect(result.response.headers.get("location")).toContain("error=");
    expect(await database.db.select().from(user)).toEqual([]);
  });

  it("requires explicit first provisioning, then signs in the same immutable identity after a rename", async () => {
    mockGithub({ id: 42, email: "owner@example.invalid", login: "owner" });
    const auth = createOwnerAuth(database.db, authEnvironment);
    const implicit = await githubCallback(auth, false);
    expect(implicit.response.headers.get("location")).toContain("error=");
    expect(await database.db.select().from(user)).toEqual([]);
    const { service } = await provision();
    expect(await service.preferences(owner)).toEqual({ timezone: "Asia/Kolkata", theme: "system", defaultTaskView: "list", revision: 1 });
    mockGithub({ id: 42, email: "renamed@example.invalid", login: "renamed-owner" });
    const again = await githubCallback(auth, false);
    expect((await auth.api.getSession({ headers: again.headers }))?.user.id).toBe(owner.ownerId);
    expect(await database.db.select().from(user)).toHaveLength(1);
    mockGithub({ id: 43, email: "owner@example.invalid", login: "owner" });
    expect((await githubCallback(auth)).response.headers.get("location")).toContain("error=");
    expect(await database.db.select().from(user)).toHaveLength(1);
  });

  it("stores only a protected key, defaults to 90 days, and never treats a key as a browser session", async () => {
    const { auth, service, created, keyId, first, second } = await setupCredential();
    const [stored] = await database.db.select().from(apikey).where(eq(apikey.id, keyId));
    expect(stored.key).not.toBe(created.secret);
    expect(stored.expiresAt!.getTime() - stored.createdAt.getTime()).toBeCloseTo(90 * 24 * 60 * 60 * 1000, -3);
    const verified = await auth.api.verifyApiKey({ body: { key: created.secret } });
    expect(verified.valid).toBe(true);
    const actor = await loadAgentActor(database.db, keyId, "42");
    expect(actor.scopes).toEqual(["read", "write", "upload"]);
    expect(() => assertProjectScope(actor, owner.ownerId, second.id, "read")).toThrow("not permitted");
    expect(() => assertProjectScope(actor, owner.ownerId, first.id, "complete")).toThrow("not permitted");
    for (const headers of [new Headers({ "x-api-key": created.secret }), new Headers({ authorization: `Bearer ${created.secret}` })]) {
      expect(await auth.api.getSession({ headers })).toBeNull();
    }
    await expect(service.createCredential(actor, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.preferences(actor)).rejects.toMatchObject({ code: "forbidden" });
    const list = await service.credentials(owner);
    expect(JSON.stringify(list)).not.toContain(created.secret);
    expect(JSON.stringify(list)).not.toContain(stored.key);
  });

  it("can provision at most one owner under concurrent first callbacks", async () => {
    mockGithub({ id: 42, email: "owner@example.invalid", login: "owner" });
    const auth = createOwnerAuth(database.db, authEnvironment);
    await Promise.all([githubCallback(auth), githubCallback(auth)]);
    expect(await database.db.select().from(user)).toHaveLength(1);
    const bindings = await database.pool.query('SELECT account_id FROM "account" WHERE provider_id = $1', ["github"]);
    expect(bindings.rows).toEqual([{ account_id: "42" }]);
  });

  it("reloads edited grants/scopes and ignores arbitrary plugin permission metadata", async () => {
    const { auth, service, created, keyId, first, second } = await setupCredential();
    await auth.api.updateApiKey({ body: { userId: owner.ownerId, keyId, metadata: { kind: "human", projectIds: [first.id, second.id] }, permissions: { admin: ["all"] } } });
    let actor = await loadAgentActor(database.db, keyId, "42");
    expect(actor.kind).toBe("agent");
    expect(actor.projectIds).toEqual([first.id]);
    await service.updateCredential(owner, created.id, { displayName: "renamed", preset: "read_only", complete: true, projectIds: [second.id], expectedRevision: 1 });
    actor = await loadAgentActor(database.db, keyId, "42");
    expect(actor.scopes).toEqual(["read", "complete"]);
    expect(actor.projectIds).toEqual([second.id]);
    expect(() => assertProjectScope(actor, owner.ownerId, first.id, "read")).toThrow("not permitted");
    await expect(service.updateCredential(owner, created.id, { displayName: "stale", preset: "read_only", projectIds: [first.id], expectedRevision: 1 })).rejects.toMatchObject({ code: "conflict" });
    expect((await loadAgentActor(database.db, keyId, "42")).projectIds).toEqual([second.id]);
  });

  it("rejects revoked/expired keys on the next request and retains non-secret management history", async () => {
    const { auth, service, created, keyId, first } = await setupCredential();
    await service.revokeCredential(owner, created.id, { expectedRevision: 1 });
    expect((await auth.api.verifyApiKey({ body: { key: created.secret } })).valid).toBe(false);
    await expect(loadAgentActor(database.db, keyId, "42")).rejects.toMatchObject({ code: "unauthenticated" });
    expect((await service.credentials(owner)).credentials[0].status).toBe("revoked");
    const noExpiry = await service.createCredential(owner, { displayName: "no-expiry", preset: "read_only", projectIds: [first.id], expiresInDays: null });
    const [record] = await database.db.select().from(agentCredentials).where(eq(agentCredentials.id, noExpiry.id));
    const [key] = await database.db.select().from(apikey).where(eq(apikey.id, record.apiKeyId!));
    expect(key.expiresAt).toBeNull();
    const past = new Date(Date.now() - 1000);
    await database.db.update(apikey).set({ expiresAt: past }).where(eq(apikey.id, key.id));
    await database.db.update(agentCredentials).set({ expiresAt: past }).where(eq(agentCredentials.id, record.id));
    expect((await auth.api.verifyApiKey({ body: { key: noExpiry.secret } })).valid).toBe(false);
    await expect(loadAgentActor(database.db, key.id, "42")).rejects.toMatchObject({ code: "unauthenticated" });
    await auth.api.deleteAllExpiredApiKeys();
    const expired = (await service.credentials(owner)).credentials.find((c) => c.id === record.id);
    expect(expired?.status).toBe("expired");
    expect(expired?.expiresAt).toBe(past.toISOString());
  });

  it("guards service ownership, invalid grants, and stale preference writes", async () => {
    const { service } = await provision();
    await expect(service.preferences({ ...owner, ownerId: "foreign-owner" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.createCredential(owner, { displayName: "bad-grant", preset: "read_only", projectIds: ["aa444502-cd9a-4ed1-bd34-c9ee07071656"] })).rejects.toMatchObject({ code: "validation_error" });
    expect(await database.db.select().from(apikey)).toEqual([]);
    await service.updatePreferences(owner, { timezone: "Europe/London", theme: "dark", defaultTaskView: "board", expectedRevision: 1 });
    await expect(service.updatePreferences(owner, { timezone: "Asia/Kolkata", theme: "light", defaultTaskView: "list", expectedRevision: 1 })).rejects.toMatchObject({ code: "conflict" });
    expect(await service.preferences(owner)).toEqual({ timezone: "Europe/London", theme: "dark", defaultTaskView: "board", revision: 2 });
  });
});
