import { describe, expect, it, vi } from "vitest";
import { environmentFixture } from "../../tests/support/fixtures";

vi.mock("server-only", () => ({}));
import { parseServerEnv } from "./env";

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
