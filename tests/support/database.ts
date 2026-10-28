import { randomUUID } from "node:crypto";

export function testDatabaseName() {
  return `zenshin_test_${randomUUID().replaceAll("-", "")}`;
}

export function requireTestDatabaseUrl(env: Record<string, string | undefined>) {
  if (env.NODE_ENV !== "test" || env.APP_ENV === "production" || env.APP_ENV === "preview") {
    throw new Error("Database tests require NODE_ENV=test outside preview/production.");
  }

  let url: URL;
  try {
    url = new URL(env.TEST_DATABASE_URL ?? "");
  } catch {
    throw new Error("Set TEST_DATABASE_URL to an isolated local zenshin_test_* PostgreSQL database.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/^\/zenshin_test_[a-z0-9_]+$/.test(url.pathname)
    || url.search || url.hash) {
    // No query parameters: libpq host/service overrides must not redirect tests.
    throw new Error("Database tests only accept local PostgreSQL URLs with a zenshin_test_* database and no query parameters.");
  }

  for (const key of ["DATABASE_URL", "DATABASE_MIGRATION_URL", "BACKUP_DATABASE_URL"]) {
    if (!env[key]) continue;
    let other: URL;
    try {
      other = new URL(env[key]);
    } catch {
      throw new Error(`Cannot establish test isolation: ${key} is invalid.`);
    }
    const localHosts = ["localhost", "127.0.0.1", "[::1]"];
    const sameHost = other.hostname === url.hostname || localHosts.includes(other.hostname);
    if (sameHost && (other.port || "5432") === (url.port || "5432") && other.pathname === url.pathname) {
      throw new Error(`TEST_DATABASE_URL must be separate from ${key}.`);
    }
  }
  return url.href;
}
