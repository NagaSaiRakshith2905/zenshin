import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isOwnerProfile, ownerUserId } from "./owner";

describe("immutable owner identity", () => {
  const source = (profile: Record<string, unknown>) => ({ method: "oauth", oauth: { providerId: "github", profile } });
  it("uses the provider's account ID, independent of mutable login/email", () => {
    expect(isOwnerProfile(source({ id: 42, login: "renamed", email: "changed@example.invalid" }), "42")).toBe(true);
    expect(isOwnerProfile(source({ id: "42" }), "42")).toBe(true);
    expect(ownerUserId("42")).toBe("github:42");
  });
  it.each([{}, { id: 43, login: "owner", email: "owner@example.invalid" }, { id: "042" }, { id: 42.5 }, { id: Number.MAX_SAFE_INTEGER + 1 }, { id: { toString: () => "42" } }])("rejects untrusted identity %o", (profile) => {
    expect(isOwnerProfile(source(profile), "42")).toBe(false);
  });
  it("rejects another provider, a non-OAuth method, or absent provider context", () => {
    expect(isOwnerProfile({ method: "oauth", oauth: { providerId: "google", profile: { id: 42 } } }, "42")).toBe(false);
    expect(isOwnerProfile({ ...source({ id: 42 }), method: "email-password" }, "42")).toBe(false);
    expect(isOwnerProfile({ method: "oauth" }, "42")).toBe(false);
  });
});
