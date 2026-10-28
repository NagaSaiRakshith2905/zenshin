import { spawnSync } from "node:child_process";

const command = process.argv[2];
if (!["generate", "migrate"].includes(command)) throw new Error("Expected generate or migrate.");
if (command === "migrate") {
  let url;
  try { url = new URL(process.env.DATABASE_MIGRATION_URL ?? ""); } catch { /* Report names only. */ }
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error("Set a valid server-only DATABASE_MIGRATION_URL. No database was contacted.");
  }
}
const child = spawnSync("pnpm", ["exec", "drizzle-kit", command], { stdio: "inherit", env: process.env });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
