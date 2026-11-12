import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { actionScopes, type HumanActor } from "../src/server/auth/access";
import { createFixtureData, insertFixtureData } from "../src/server/db/fixtures";
import { createWorkReader } from "../src/server/services/work/read";
import { createTestDatabase } from "../tests/support/postgres";
import { recordReads } from "../tests/support/query-recorder";
import type { Page } from "../src/features/work/types";

// Uses the integration harness: an isolated local zenshin_test_* URL, a newly
// migrated random database, and cleanup in finally. Never loads environment files.
async function main() {
  const database = await createTestDatabase();
  try {
    console.info("Loading disposable 50-project / 10,000-task / 50,000-activity fixture…");
    const data = createFixtureData("performance", "performance-check");
    await insertFixtureData(database.db, data);
    const { rows: [counts] } = await database.pool.query("select (select count(*)::int from projects) as projects, (select count(*)::int from tasks) as tasks, (select count(*)::int from activities) as activities");
    assert.deepEqual(counts, { projects: 50, tasks: 10000, activities: 50000 });
    await database.pool.query("ANALYZE");
    const actor: HumanActor = { kind: "human", ownerId: data.owner.id, credentialId: null, projectIds: null, scopes: actionScopes };
    const reader = createWorkReader(database.db);
    const reads = recordReads(database.pool);
    const cases = [
      { name: "global-tasks", resource: "tasks", input: { limit: 50 } },
      { name: "project-tasks", resource: "tasks", input: { projectId: data.projects[0].id, limit: 50 } },
      { name: "my-work", resource: "my-work", input: { limit: 50 } },
      { name: "note-search", resource: "search", input: { q: "fixture context", entityTypes: ["task"], limit: 50 } },
      { name: "property-search", resource: "search", input: { q: "Searchable planning", entityTypes: ["task"], limit: 50 } },
    ] as const;
    const results = [];
    const statements = new Map<string, (typeof reads.queries)[number]>();
    const thresholdMs = 500, samples = 20;
    for (const test of cases) {
      const run = async () => {
        reads.reset();
        const start = performance.now();
        const page = await reader.list(actor, test.resource, test.input) as Page<{ id: string; projectId: string }>;
        const ms = performance.now() - start;
        assert.equal(page.items.length, 50, `${test.name}: fixture/page mismatch`);
        if (test.name === "global-tasks") {
          assert.equal(new Set(page.items.map((t) => t.projectId)).size, 50);
          assert.ok(reads.queries.length <= 12, "Global task page exceeded its fixed read budget.");
        }
        for (const query of reads.queries) statements.set(query.text, query);
        return { ms, queries: reads.queries.length };
      };
      const firstMeasuredCallMs = (await run()).ms;
      const timings: number[] = [];
      let maxReadQueries = 0;
      for (let i = 0; i < samples; i++) {
        const result = await run();
        timings.push(result.ms);
        maxReadQueries = Math.max(maxReadQueries, result.queries);
      }
      timings.sort((a, b) => a - b);
      const p95Ms = timings[Math.ceil(samples * 0.95) - 1];
      results.push({ name: test.name, firstMeasuredCallMs, p50Ms: timings[Math.ceil(samples * 0.5) - 1], p95Ms, maxReadQueries, passed: p95Ms < thresholdMs });
      console.info(`${test.name}: warm p95 ${p95Ms.toFixed(1)} ms; max ${maxReadQueries} read queries`);
    }
    // Explain the actual parameterized reads, including hydration and counts.
    // Values are synthetic fixture data; credentials are never written to reports.
    const plans = [];
    for (const { text, values } of statements.values()) {
      const result = await database.pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, values);
      plans.push({ statement: text, plan: result.rows[0]["QUERY PLAN"] });
    }
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/performance.json", JSON.stringify({
      measuredAt: new Date().toISOString(), dataset: counts, samples, thresholdMs,
      scope: "Local shared-service reads, no provider calls. First measured call follows seeding/ANALYZE; deployed cold starts and regional p95 remain separate acceptance gates.",
      results, plans,
    }, null, 2));
    assert.ok(results.every((r) => r.passed), "Warm local p95 exceeded 500 ms; inspect test-results/performance.json.");
  } finally { await database.dispose(); }
}
main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Performance check could not finish. Verify isolated local PostgreSQL access. No successful measurement is claimed.");
  process.exitCode = 1;
});
