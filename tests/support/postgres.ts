import { fileURLToPath } from "node:url";
import { requireTestDatabaseUrl, testDatabaseName } from "./database";

export async function createTestDatabase() {
  // Validate before loading pg or creating a connection. The admin DB is test-only too.
  const adminUrl = requireTestDatabaseUrl(process.env);
  const { Pool } = await import("pg");
  const { createDatabase } = await import("../../src/server/db/connection");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const name = testDatabaseName();
  const target = new URL(adminUrl);
  target.pathname = `/${name}`;
  const connectionString = requireTestDatabaseUrl({ ...process.env, TEST_DATABASE_URL: target.href });
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  const connection = createDatabase(connectionString);
  let created = false;
  const migrateLatest = () => migrate(connection.db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  async function dispose() {
    // DROP ... WITH (FORCE) can race closing sockets; ignore only that admin-shutdown error.
    connection.pool.on("error", (error: Error & { code?: string }) => { if (error.code !== "57P01") throw error; });
    try {
      await connection.pool.end();
      // name is generated internally, never caller-supplied SQL.
      if (created) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    } finally { await admin.end(); }
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await migrateLatest();
    return { ...connection, connectionString, migrateLatest, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
