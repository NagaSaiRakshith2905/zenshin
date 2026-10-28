import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  // Generate works offline. Migration credentials are validated by scripts/migrations.mjs.
  ...(process.env.DATABASE_MIGRATION_URL ? { dbCredentials: { url: process.env.DATABASE_MIGRATION_URL } } : {}),
  strict: true,
  verbose: true,
});
