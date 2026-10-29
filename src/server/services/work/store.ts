import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/server/db";
import type * as schema from "@/server/db/schema";

export type Rows = {
  projects: typeof schema.projects.$inferSelect;
  sections: typeof schema.sections.$inferSelect;
  tasks: typeof schema.tasks.$inferSelect;
  task_statuses: typeof schema.taskStatuses.$inferSelect;
  labels: typeof schema.labels.$inferSelect;
  property_definitions: typeof schema.propertyDefinitions.$inferSelect;
  property_options: typeof schema.propertyOptions.$inferSelect;
};
export type Table = keyof Rows;
const snake = (name: string) => name.replace(/[A-Z]/g, (v) => `_${v.toLowerCase()}`);
function camel(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
}
export async function query<T>(db: DatabaseExecutor, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows.map((r) => camel(r)) as T[];
}
export async function rows<K extends Table>(db: DatabaseExecutor, table: K, where: SQL): Promise<Rows[K][]> {
  return query<Rows[K]>(db, sql`select * from ${sql.identifier(table)} where ${where}`);
}
export async function insert<K extends Table>(db: DatabaseExecutor, table: K, data: Partial<Rows[K]>): Promise<Rows[K]> {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const [row] = await query<Rows[K]>(db, sql`insert into ${sql.identifier(table)} (${sql.join(entries.map(([k]) => sql.identifier(snake(k))), sql`, `)}) values (${sql.join(entries.map(([, v]) => sql`${v}`), sql`, `)}) returning *`);
  return row;
}
export async function patch<K extends Table>(db: DatabaseExecutor, table: K, row: Rows[K], data: Partial<Rows[K]>) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const [updated] = await query<Rows[K]>(db, sql`update ${sql.identifier(table)} set ${sql.join([...entries.map(([k, v]) => sql`${sql.identifier(snake(k))} = ${v}`), sql`revision = revision + 1`, sql`updated_at = now()`], sql`, `)} where id = ${row.id} and owner_id = ${row.ownerId} and revision = ${row.revision} returning *`);
  if (!updated) throw new Error("A project lock was bypassed during mutation.");
  return updated;
}
