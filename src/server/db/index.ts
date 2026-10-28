import "server-only";
import { createDatabase, parseDatabaseUrl } from "./connection";
export { createDatabase, parseDatabaseUrl, type Database, type DatabaseExecutor } from "./connection";

let connection: ReturnType<typeof createDatabase> | undefined;
export function getDatabase() {
  connection ??= createDatabase(parseDatabaseUrl(process.env.DATABASE_URL));
  return connection.db;
}
