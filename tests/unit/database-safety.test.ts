import { describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../support/database";
import { environmentFixture } from "../support/fixtures";

describe("database test isolation", () => {
  it("creates independent fixtures with dedicated local database names", () => {
    const first = environmentFixture();
    const second = environmentFixture();
    expect(first.TEST_DATABASE_URL).not.toBe(second.TEST_DATABASE_URL);
    expect(requireTestDatabaseUrl(first)).toBe(first.TEST_DATABASE_URL);
  });

  it.each([
    undefined, "invalid-private-value", "postgresql://test:test@db.example.invalid/zenshin_test_suite",
    "postgresql://test:test@localhost/zenshin", "https://localhost/zenshin_test_suite",
    "postgresql://test:test@localhost/zenshin_test_suite?host=db.example.invalid",
    "postgresql://test:test@localhost/zenshin_test_suite#private",
  ])("refuses unsafe test URLs", (TEST_DATABASE_URL) => {
    expect(() => requireTestDatabaseUrl(environmentFixture({ TEST_DATABASE_URL }))).toThrow();
  });

  it.each(["DATABASE_URL", "DATABASE_MIGRATION_URL", "BACKUP_DATABASE_URL"])
    ("rejects reuse of %s even with different credentials and a local host alias", (key) => {
      const fixture = environmentFixture();
      const shared = new URL(fixture.TEST_DATABASE_URL);
      shared.hostname = "localhost";
      shared.password = "different-placeholder";
      expect(() => requireTestDatabaseUrl({ ...fixture, [key]: shared.href })).toThrow(`separate from ${key}`);
    });

  it.each([
    { NODE_ENV: "production" }, { NODE_ENV: "development" },
    { APP_ENV: "production" }, { APP_ENV: "preview" },
  ])("refuses execution in a non-test deployment", (override) => {
    expect(() => requireTestDatabaseUrl(environmentFixture(override))).toThrow("NODE_ENV=test");
  });
});
