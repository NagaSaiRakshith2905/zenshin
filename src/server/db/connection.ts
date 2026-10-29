import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export function parseDatabaseUrl(value: string | undefined, name = "DATABASE_URL") {
  let url: URL | undefined;
  try { url = new URL(value ?? ""); } catch { /* Never echo credentials. */ }
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname === "/" || !url.pathname) {
    throw new Error(`Set a valid server-only ${name}.`);
  }
  // Preserve pg 8's certificate and hostname verification as SSL aliases change.
  if (url.searchParams.get("uselibpqcompat") !== "true" && ["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.href;
}

// Construct lazily at the server entry point; importing schema never opens a connection.
export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString: parseDatabaseUrl(connectionString), max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000 });
  return { db: drizzle(pool, { schema }), pool };
}
export type Database = ReturnType<typeof createDatabase>["db"];
export type DatabaseExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
