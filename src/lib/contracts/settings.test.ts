import { describe, expect, it } from "vitest";
import { createCredentialSchema, credentialScopes, preferenceValuesSchema } from "./settings";

describe("settings contracts", () => {
  const policy = { displayName: " desktop-agent ", preset: "contributor", projectIds: ["bb444502-cd9a-4ed1-bd34-c9ee07071656"] };
  it("defaults to 90 days and expands only the requested preset and opt-ins", () => {
    const contributor = createCredentialSchema.parse(policy);
    expect(contributor.displayName).toBe("desktop-agent");
    expect(contributor.expiresInDays).toBe(90);
    expect(credentialScopes(contributor)).toEqual(["read", "write", "upload"]);
    expect(credentialScopes(createCredentialSchema.parse({ ...policy, preset: "read_only" }))).toEqual(["read"]);
    expect(credentialScopes(createCredentialSchema.parse({ ...policy, archive: true, complete: true }))).toEqual(["read", "write", "upload", "archive", "complete"]);
    expect(createCredentialSchema.parse({ ...policy, expiresInDays: null }).expiresInDays).toBeNull();
  });
  it("rejects implicit/all-future access and client-supplied authority", () => {
    for (const input of [{ ...policy, projectIds: [] }, { ...policy, projectIds: ["*"] }, { ...policy, projectIds: [...policy.projectIds, ...policy.projectIds] }, { ...policy, expiresInDays: 0 }, { ...policy, scopes: ["owner"] }, { ...policy, metadata: { admin: true } }, { ...policy, ownerId: "foreign-owner" }, { ...policy, displayName: "  " }]) {
      expect(createCredentialSchema.safeParse(input).success).toBe(false);
    }
  });
  it("validates timezone/theme/view rather than accepting arbitrary values", () => {
    const defaults = { timezone: "Asia/Kolkata", theme: "system", defaultTaskView: "list" };
    expect(preferenceValuesSchema.safeParse(defaults).success).toBe(true);
    for (const values of [{ timezone: "unknown" }, { timezone: "+05:30" }, { theme: "auto" }, { defaultTaskView: "table" }]) {
      expect(preferenceValuesSchema.safeParse({ ...defaults, ...values }).success).toBe(false);
    }
  });
});
