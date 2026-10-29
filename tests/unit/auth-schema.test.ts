import { getAuthTables } from "better-auth/db";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { auth } from "../../scripts/auth-schema.config";
import * as generated from "../../src/server/db/schema/auth.generated";

// This compares model/field identifiers from the actual configured core + plugin,
// not a second handwritten list of authentication columns.
describe("generated Better Auth adapter mapping", () => {
  it("contains each configured model and field with compatible identifiers/types", () => {
    const tables = generated as unknown as Record<string, PgTable>;
    for (const [key, model] of Object.entries(getAuthTables(auth.options))) {
      const table = tables[model.modelName ?? key];
      expect(table, key).toBeDefined();
      const config = getTableConfig(table);
      const columns = table as unknown as Record<string, { getSQLType(): string; name: string }>;
      // The adapter resolves schema exports; SQL names may use snake_case.
      expect(config.columns).toContain(columns.id);
      for (const [field, attribute] of Object.entries(model.fields)) {
        const column = columns[attribute.fieldName ?? field];
        expect(column, `${key}.${field}`).toBeDefined();
        if (attribute.type === "date") expect(column.getSQLType()).toBe("timestamp with time zone");
      }
      expect(columns.id.getSQLType()).toBe("text");
    }
  });
});
