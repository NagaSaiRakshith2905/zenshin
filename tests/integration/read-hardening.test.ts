import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actionScopes, type HumanActor, type AgentActor } from "../../src/server/auth/access";
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { createWorkReader } from "../../src/server/services/work/read";
import { createTestDatabase } from "../support/postgres";
import { recordReads } from "../support/query-recorder";
import type { Page, Task } from "../../src/features/work/types";
import type { SearchHit } from "../../src/server/services/work/search";
type CountedPage<T> = Page<T> & { total: number };
const canonical = (task: Omit<Task, "projectName">) => ({
  ...task, labelIds: task.labelIds.toSorted(), prerequisiteTaskIds: task.prerequisiteTaskIds.toSorted(),
  dependentTaskIds: task.dependentTaskIds.toSorted(), dependencyBlockers: task.dependencyBlockers.toSorted(),
  properties: Object.fromEntries(Object.entries(task.properties).map(([key, value]) => [key, Array.isArray(value) ? value.toSorted() : value])),
});

describe("bounded task and search reads", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const data = createFixtureData("development", "read-hardening");
  const other = createFixtureData("development", "read-hardening-other");
  const owner: HumanActor = { kind: "human", ownerId: data.owner.id, credentialId: null, projectIds: null, scopes: actionScopes };
  let reader: ReturnType<typeof createWorkReader>;
  beforeAll(async () => {
    database = await createTestDatabase();
    await insertFixtureData(database.db, data);
    await insertFixtureData(database.db, other);
    reader = createWorkReader(database.db);
  }, 30_000);
  afterAll(async () => { await database?.dispose(); });

  it("preserves full task metadata across page boundaries without per-project queries", async () => {
    const reads = recordReads(database.pool);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      reads.reset();
      const page = await reader.list(owner, "tasks", { limit: 7, archiveState: "all", cursor }) as CountedPage<Task & { projectName: string }>;
      expect(reads.queries.length).toBeLessThanOrEqual(13); // 12 reads + cursor validation
      expect(page.total).toBe(32);
      for (const item of page.items) {
        ids.push(item.id);
        const { projectName, ...model } = item;
        expect(projectName).toBe(data.projects.find((p) => p.id === item.projectId)!.name);
        expect(canonical(model)).toEqual(canonical(await reader.get(owner, "tasks", item.id, true) as unknown as Task));
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(ids).size).toBe(data.tasks.length);
    expect(ids).not.toContain(other.tasks[0].id);
  });

  it("does not load task graphs for metadata or activity lists", async () => {
    const reads = recordReads(database.pool);
    for (const resource of ["statuses", "labels", "options", "activity"] as const) {
      reads.reset();
      await reader.list(owner, resource, { projectId: data.projects[0].id });
      expect(reads.queries.length).toBe(2);
    }
  });

  it("keeps agent grants in task pages, search bodies, totals and cursor validation", async () => {
    const projectId = data.projects[0].id!;
    const agent: AgentActor = { ...owner, kind: "agent", credentialId: data.tasks[0].id!, projectIds: [projectId], scopes: ["read"] };
    const page = await reader.list(agent, "tasks", { archiveState: "all" }) as CountedPage<Task>;
    expect(page.total).toBe(16);
    expect(page.items.every((t) => t.projectId === projectId)).toBe(true);
    const search = await reader.list(agent, "search", { q: "fixture context", limit: 1 }) as CountedPage<SearchHit>;
    expect(search.total).toBe(3);
    expect(search.items[0].snippet).toMatch(/⟦(fixture|context)⟧/);
    const next = await reader.list(agent, "search", { q: "fixture context", limit: 1, cursor: search.nextCursor }) as CountedPage<SearchHit>;
    expect(next.items[0].id).not.toBe(search.items[0].id);
    expect(next.items[0].projectId).toBe(projectId);
    await expect(reader.list(agent, "search", { q: "fixture context", cursor: `project:${data.projects[1].id}` })).rejects.toMatchObject({ code: "validation_error" });
    await expect(reader.list(agent, "tasks", { projectId: data.projects[1].id })).rejects.toMatchObject({ code: "not_found" });
  });

  it("renders note/property headlines only in the bounded page query", async () => {
    const reads = recordReads(database.pool);
    const page = await reader.list(owner, "search", { q: "Searchable planning", entityTypes: ["task"], limit: 1 }) as CountedPage<SearchHit>;
    expect(page.total).toBe(2);
    expect(page.items[0].snippet).toContain("⟦Searchable⟧");
    expect(reads.queries.filter((q) => q.text.includes("ts_headline"))).toHaveLength(1);
    expect(reads.queries.find((q) => q.text.includes("ts_headline"))!.text).toContain("page as materialized");
    expect(page.hasMore).toBe(true);
  });
});
