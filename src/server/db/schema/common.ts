import { sql } from "drizzle-orm";
import { check, integer, pgEnum, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

export const actorKind = pgEnum("actor_kind", ["human", "agent", "system"]);
export const eventTime = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export function mutableColumns() {
  return {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: eventTime("created_at").defaultNow().notNull(),
    updatedAt: eventTime("updated_at").defaultNow().notNull(),
    revision: integer("revision").default(1).notNull(),
  };
}
export const positiveRevision = (name: string, column: AnyPgColumn) => check(`${name}_revision_positive`, sql`${column} > 0`);
