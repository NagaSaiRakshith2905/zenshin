import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), verifyApiKey: vi.fn(), getDatabase: vi.fn(), hasOwnerBinding: vi.fn() }));
vi.mock(".", () => ({ getAuth: () => ({ api: { getSession: mocks.getSession, verifyApiKey: mocks.verifyApiKey } }) }));
vi.mock("@/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/env", () => ({ getAuthEnv: () => ({ OWNER_GITHUB_ID: "42" }) }));
vi.mock("./owner", () => ({ hasOwnerBinding: mocks.hasOwnerBinding, ownerUserId: (id: string) => `github:${id}` }));
import { authenticateActor, authenticateAgent, authenticateOwner, loadAgentActor } from "./actors";
import type { DatabaseExecutor } from "@/server/db";

describe("authentication transport separation", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("rejects bearer and API-key headers on owner endpoints, even with cookies", async () => {
    await expect(authenticateOwner(new Headers({ authorization: "Bearer arbitrary", cookie: "owner-session" }))).rejects.toMatchObject({ code: "forbidden" });
    await expect(authenticateOwner(new Headers({ "x-api-key": "arbitrary", cookie: "owner-session" }))).rejects.toMatchObject({ code: "forbidden" });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("does not fall back to ambient cookies when bearer verification fails", async () => {
    mocks.verifyApiKey.mockResolvedValue({ valid: false, key: null });
    await expect(authenticateActor(new Headers({ authorization: `Bearer ${"a".repeat(40)}`, cookie: "owner-session" }))).rejects.toMatchObject({ code: "unauthenticated" });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("does not accept a browser cookie as an agent key", async () => {
    await expect(authenticateAgent(new Headers({ cookie: "owner-session" }))).rejects.toMatchObject({ code: "unauthenticated" });
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });
  it("constructs a restricted agent even alongside an owner cookie and privileged plugin metadata", async () => {
    mocks.verifyApiKey.mockResolvedValue({ valid: true, error: null, key: { id: "plugin-key", metadata: { kind: "human", scopes: ["complete"], projectIds: ["all"] } } });
    const query = { from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), leftJoin: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ id: "credential", ownerId: "github:42", scopes: ["read"], projectId: "selected" }]) };
    const updated = vi.fn().mockResolvedValue(undefined);
    mocks.getDatabase.mockReturnValue({ select: () => query, update: () => ({ set: () => ({ where: updated }) }) });
    const actor = await authenticateActor(new Headers({ authorization: `Bearer ${"a".repeat(40)}`, cookie: "owner-session" }));
    expect(actor).toEqual({ kind: "agent", ownerId: "github:42", credentialId: "credential", scopes: ["read"], projectIds: ["selected"] });
    expect(updated).toHaveBeenCalledOnce();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it("distinguishes throttling from an invalid credential", async () => {
    mocks.verifyApiKey.mockResolvedValue({ valid: false, key: null, error: { code: "RATE_LIMITED" } });
    await expect(authenticateAgent(new Headers({ authorization: `Bearer ${"a".repeat(40)}` }))).rejects.toMatchObject({ code: "rate_limited" });
  });
  it("rechecks stored immutable identity for each browser authentication", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "github:42" } });
    mocks.hasOwnerBinding.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(authenticateOwner(new Headers())).resolves.toMatchObject({ kind: "human", credentialId: null });
    await expect(authenticateOwner(new Headers())).rejects.toMatchObject({ code: "forbidden" });
    expect(mocks.hasOwnerBinding).toHaveBeenCalledTimes(2);
  });
  it("takes authority from credential rows and reloads grants, never plugin metadata", async () => {
    const records = [{ id: "stable-credential", ownerId: "github:42", scopes: ["read"], projectId: "selected-project" }];
    const where = vi.fn().mockResolvedValueOnce(records).mockResolvedValueOnce([{ ...records[0], scopes: ["read", "write"], projectId: "changed-project" }]).mockResolvedValueOnce([]);
    const builder = { from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), leftJoin: vi.fn().mockReturnThis(), where };
    const db = { select: () => builder } as unknown as DatabaseExecutor;
    const first = await loadAgentActor(db, "plugin-key-id", "42");
    expect(first).toEqual({ kind: "agent", ownerId: "github:42", credentialId: "stable-credential", scopes: ["read"], projectIds: ["selected-project"] });
    expect(Object.isFrozen(first.scopes)).toBe(true);
    expect((await loadAgentActor(db, "plugin-key-id", "42")).projectIds).toEqual(["changed-project"]);
    await expect(loadAgentActor(db, "plugin-key-id", "42")).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
