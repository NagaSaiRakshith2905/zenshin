import { describe, expect, it, vi } from "vitest";
import { environmentFixture } from "../../tests/support/fixtures";

vi.mock("server-only", () => ({}));
import { parseAuthEnv, parseServerEnv } from "./env";

describe("server environment", () => {
  it("names missing settings without exposing received values", () => {
    expect(() => parseServerEnv({})).toThrow("APP_ENV, APP_ORIGIN");
    expect(() => parseServerEnv({ APP_ENV: "private-value", APP_ORIGIN: "private-value" }))
      .not.toThrow(/private-value/);
    expect(() => parseServerEnv({ APP_ENV: "private-value", APP_ORIGIN: "private-value" }))
      .toThrow("Invalid server environment");
  });

  it("accepts a development origin and excludes unrelated secrets", () => {
    expect(parseServerEnv(environmentFixture({ BETTER_AUTH_SECRET: "test-only-placeholder" })))
      .toEqual({ APP_ENV: "development", APP_ORIGIN: "http://localhost:3000" });
  });

  it.each(["production", "preview"])("requires HTTPS in %s", (APP_ENV) => {
    expect(() => parseServerEnv(environmentFixture({ APP_ENV }))).toThrow("APP_ORIGIN");
    expect(parseServerEnv({ APP_ENV, APP_ORIGIN: "https://example.invalid/" }).APP_ORIGIN)
      .toBe("https://example.invalid");
  });

  it.each([
    "not-a-url", "file:///private/data", "https://user:password@example.invalid",
    "https://example.invalid/path", "https://example.invalid/?token=private", "https://example.invalid/#private",
  ])("rejects an unsafe origin without echoing it", (APP_ORIGIN) => {
    let message = "";
    try { parseServerEnv(environmentFixture({ APP_ORIGIN })); }
    catch (error) { message = (error as Error).message; }
    expect(message).toContain("APP_ORIGIN");
    expect(message).not.toContain(APP_ORIGIN);
  });
});

describe("authentication environment", () => {
  const valid = () => environmentFixture({
    BETTER_AUTH_SECRET: "test-only-auth-signing-value-0000000000",
    BETTER_AUTH_URL: "http://localhost:3000", GITHUB_OAUTH_CLIENT_ID: "test-client",
    GITHUB_OAUTH_CLIENT_SECRET: "test-only-oauth-value", OWNER_GITHUB_ID: "42",
  });
  it("requires positive decimal immutable owner IDs", () => {
    expect(parseAuthEnv(valid()).OWNER_GITHUB_ID).toBe("42");
    for (const id of [undefined, "", "owner-login", "0", "-42", "42.5", "042", " 42"]) {
      expect(() => parseAuthEnv({ ...valid(), OWNER_GITHUB_ID: id })).toThrow("OWNER_GITHUB_ID");
    }
  });
  it("requires canonical matching origins and non-placeholder credentials without echoing secrets", () => {
    expect(() => parseAuthEnv({ ...valid(), BETTER_AUTH_URL: "http://other.invalid" })).toThrow("BETTER_AUTH_URL");
    expect(() => parseAuthEnv({ ...valid(), BETTER_AUTH_SECRET: "private" })).not.toThrow(/: private/);
    expect(() => parseAuthEnv({ ...valid(), BETTER_AUTH_SECRET: "change-me-placeholder-value-0000000000" })).toThrow("BETTER_AUTH_SECRET");
    expect(() => parseAuthEnv({ ...valid(), GITHUB_OAUTH_CLIENT_SECRET: "" })).toThrow("GITHUB_OAUTH_CLIENT_SECRET");
  });
});
