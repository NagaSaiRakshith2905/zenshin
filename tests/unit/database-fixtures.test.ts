import { describe, expect, it } from "vitest";
import { createFixtureData, fixtureId } from "../../src/server/db/fixtures";
import { requireFixtureDatabase } from "../../scripts/fixture-database";
import { parseDatabaseUrl } from "../../src/server/db/connection";

describe("database fixtures", () => {
  it("is deterministic and namespaces independent graphs", () => {
    expect(createFixtureData("development")).toEqual(createFixtureData("development"));
    expect(fixtureId("a")).not.toBe(fixtureId("b"));
    expect(fixtureId("a")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createFixtureData("development", "a").projects[0].id).not.toBe(createFixtureData("development", "b").projects[0].id);
  });
  it("has the agreed performance scale and complete local relationships", () => {
    const data = createFixtureData("performance");
    expect([data.projects.length, data.tasks.length, data.activities.length]).toEqual([50, 10000, 50000]);
    expect(new Set(data.tasks.map((task) => task.id)).size).toBe(10000);
    for (const project of data.projects) {
      const tasks = data.tasks.filter((task) => task.projectId === project.id);
      expect(Math.max(...tasks.map((task) => task.number))).toBe(project.nextTaskNumber! - 1);
      expect(data.statuses.filter((status) => status.projectId === project.id && status.isDefault)).toHaveLength(1);
    }
    const tasks = new Map(data.tasks.map((task) => [task.id, task]));
    for (const task of data.tasks) if (task.parentTaskId) {
      const parent = tasks.get(task.parentTaskId)!;
      expect(parent.parentTaskId).toBeNull();
      expect([parent.ownerId, parent.projectId, parent.sectionId]).toEqual([task.ownerId, task.projectId, task.sectionId]);
    }
  });
  it("refuses seed writes outside separate named local development/performance databases", () => {
    const env = { APP_ENV: "development", DATABASE_URL: "postgresql://localhost/zenshin_dev" };
    expect(requireFixtureDatabase(env, "development")).toBe(env.DATABASE_URL);
    expect(() => requireFixtureDatabase(env, "performance")).toThrow("zenshin_perf");
    for (const DATABASE_URL of ["postgresql://remote.invalid/zenshin_dev", "postgresql://localhost/production", "postgresql://localhost/zenshin_dev?host=remote.invalid"]) {
      expect(() => requireFixtureDatabase({ ...env, DATABASE_URL }, "development")).toThrow();
    }
    expect(() => requireFixtureDatabase({ ...env, APP_ENV: "production" }, "development")).toThrow();
    expect(() => parseDatabaseUrl("private-secret")).toThrow("DATABASE_URL");
    expect(() => parseDatabaseUrl("private-secret")).not.toThrow(/private-secret/);
  });
});
