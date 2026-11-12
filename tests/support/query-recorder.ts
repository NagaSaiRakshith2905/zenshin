import type { Pool, PoolClient } from "pg";

/** Real Postgres instrumentation for disposable tests/benchmarks; no SQL substitution. */
export function recordReads(pool: Pool) {
  const clients = new WeakSet<PoolClient>();
  const queries: { text: string; values: unknown[] }[] = [];
  pool.on("acquire", (client) => {
    if (clients.has(client)) return;
    clients.add(client);
    client.query = new Proxy(client.query, {
      apply(target, receiver, args) {
        const input = args[0];
        const text = typeof input === "string" ? input : input?.text;
        if (typeof text === "string" && /^\s*(select|with)\b/i.test(text)) {
          queries.push({ text, values: Array.isArray(args[1]) ? args[1] : input?.values ?? [] });
        }
        return Reflect.apply(target, receiver, args);
      },
    });
  });
  return { queries, reset: () => { queries.length = 0; } };
}
