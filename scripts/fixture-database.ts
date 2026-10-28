import { parseDatabaseUrl, createDatabase } from "../src/server/db/connection";
import { createFixtureData, insertFixtureData } from "../src/server/db/fixtures";

export function requireFixtureDatabase(env: Record<string, string | undefined>, size: "development" | "performance") {
  if (env.APP_ENV !== "development" || env.NODE_ENV === "production" || env.NODE_ENV === "test") {
    throw new Error("Fixtures require APP_ENV=development outside production/test.");
  }
  const url = new URL(parseDatabaseUrl(env.DATABASE_URL));
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search || url.hash
    || url.pathname !== (size === "performance" ? "/zenshin_perf" : "/zenshin_dev")) {
    throw new Error(`Fixtures require an isolated local ${size === "performance" ? "zenshin_perf" : "zenshin_dev"} database without connection overrides.`);
  }
  return url.href;
}

export async function loadFixture(size: "development" | "performance") {
  const connectionString = requireFixtureDatabase(process.env, size);
  const { db, pool } = createDatabase(connectionString);
  try {
    await insertFixtureData(db, createFixtureData(size));
    console.info(size === "performance" ? "Loaded 50 projects, 10,000 tasks and 50,000 activities." : "Loaded deterministic development fixture (2 projects, 32 tasks).");
  } finally { await pool.end(); }
}
