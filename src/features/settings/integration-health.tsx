"use client";
import { useTimezone } from "@/features/settings/timezone";
import { formatTimestamp } from "@/lib/dates";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { settingsRequest } from "./api";

type Health = { jobs: { id: string; kind: string; state: string; attempts: number; maxAttempts: number; availableAt: string; lastError: string | null }[]; sync: { resource: string; lastSuccessAt: string | null; nextAttemptAt: string; attempts: number; hasError: boolean }[] };
export function IntegrationHealth() {
  const timezone = useTimezone();
  const query = useQuery({ queryKey: ["integration-health"], queryFn: () => settingsRequest<Health>("integration-health") });
  return <div className="space-y-4"><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh</Button>
    {query.isPending && <p>Loading integration health…</p>}{query.isError && <p role="alert">Could not load integration health. Try Refresh.</p>}
    {query.data && <><h3 className="font-medium">Background jobs</h3>{query.data.jobs.length === 0 ? <p>No jobs yet.</p> : <ul className="space-y-3">{query.data.jobs.map((job) => <li key={job.id} className="rounded border p-3 text-sm"><p>{job.kind.replaceAll("_", " ")} · {job.state} · attempt {job.attempts}/{job.maxAttempts}</p>{job.lastError && <p>{job.lastError}</p>}{job.state === "pending" && <p>Next attempt: {formatTimestamp(job.availableAt, timezone)}</p>}</li>)}</ul>}
    <h3 className="font-medium">GitHub sync</h3>{query.data.sync.length === 0 ? <p>No sync activity yet.</p> : <ul className="space-y-3">{query.data.sync.map((item, i) => <li key={i} className="rounded border p-3 text-sm"><p>{item.resource} · Last success: {item.lastSuccessAt ? formatTimestamp(item.lastSuccessAt, timezone) : "Never"}</p>{item.hasError && <p>Sync failed. Next attempt: {formatTimestamp(item.nextAttemptAt, timezone)} ({item.attempts} attempts)</p>}</li>)}</ul>}</>}
  </div>;
}
