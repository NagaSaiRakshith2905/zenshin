import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertHumanOwner, assertProjectScope, type AgentActor, type SystemActor } from "./access";
import { isPublicAuthRoute } from "./public-routes";

describe("actor policy", () => {
  const readOnly: AgentActor = { kind: "agent", ownerId: "owner", credentialId: "credential", scopes: ["read"], projectIds: ["project"] };
  it("isolates projects, owners and actions", () => {
    expect(() => assertProjectScope(readOnly, "owner", "project", "read")).not.toThrow();
    expect(() => assertProjectScope(readOnly, "other", "project", "read")).toThrow("not permitted");
    expect(() => assertProjectScope(readOnly, "owner", "other", "read")).toThrow("not permitted");
    for (const scope of ["write", "upload", "archive", "complete"] as const) {
      expect(() => assertProjectScope(readOnly, "owner", "project", scope)).toThrow("not permitted");
    }
  });
  it("never converts a fully scoped agent or a system job into the human owner", () => {
    const agent: AgentActor = { ...readOnly, scopes: ["read", "write", "upload", "archive", "complete"] };
    const system: SystemActor = { kind: "system", ownerId: "owner", credentialId: null, job: "github_reconcile", scopes: ["read", "write"], projectIds: ["project"] };
    expect(() => assertHumanOwner(agent)).toThrow("owner browser session");
    expect(() => assertHumanOwner(system)).toThrow("owner browser session");
    expect(() => assertProjectScope(system, "owner", "other", "read")).toThrow("not permitted");
  });
  it("does not expose built-in key management, account linking or signup routes", () => {
    for (const path of ["/api-key/create", "/api-key/update", "/api-key/delete", "/api-key/list", "/api-key/get", "/api-key/delete-all-expired-api-keys", "/link-social", "/sign-up/email", "/update-user", "/callback/google", "/callback/github/extra"]) {
      expect(isPublicAuthRoute("GET", path)).toBe(false);
      expect(isPublicAuthRoute("POST", path)).toBe(false);
    }
    expect(isPublicAuthRoute("GET", "/callback/github")).toBe(true);
    expect(isPublicAuthRoute("POST", "/callback/github")).toBe(true);
    expect(isPublicAuthRoute("POST", "/sign-in/social")).toBe(true);
    expect(isPublicAuthRoute("GET", "/sign-out")).toBe(false);
  });
});
