import { describe, expect, it } from "vitest";
import { parseDatabaseUrl } from "../../src/server/db/connection";

describe("database SSL configuration", () => {
  it.each(["prefer", "require", "verify-ca"])("preserves full verification for sslmode=%s", (mode) => {
    const url = new URL(parseDatabaseUrl(`postgresql://localhost/zenshin_dev?sslmode=${mode}&application_name=zenshin`));
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("application_name")).toBe("zenshin");
  });

  it.each(["disable", "verify-full", "no-verify"])("preserves explicit sslmode=%s", (mode) => {
    const value = `postgresql://localhost/zenshin_dev?sslmode=${mode}`;
    expect(parseDatabaseUrl(value)).toBe(value);
  });

  it("preserves explicit libpq compatibility and local connections without SSL options", () => {
    const libpq = "postgresql://localhost/zenshin_dev?sslmode=require&uselibpqcompat=true";
    expect(parseDatabaseUrl(libpq)).toBe(libpq);
    expect(parseDatabaseUrl("postgresql://localhost/zenshin_dev")).toBe("postgresql://localhost/zenshin_dev");
  });
});
