"use client";
import { useTimezone } from "@/features/settings/timezone";
import { formatTimestamp } from "@/lib/dates";
import { useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { settingsRequest } from "./api";

type ExportRow = { id: string; status: string; requestedAt: string; completedAt: string | null; expiresAt: string; failureSummary: string | null };
type ExportPage = { items: ExportRow[]; nextCursor: string | null };
export function ExportsPanel() {
  const timezone = useTimezone();
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const attempt = useRef<string | null>(null);
  const query = useInfiniteQuery({ queryKey: ["exports"], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => settingsRequest<ExportPage>(`exports${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (page) => page.nextCursor ?? undefined, refetchOnWindowFocus: true });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return <div className="flex flex-col gap-4">
    <p>Export all projects, archived work, relationships, properties, notes and file metadata as versioned JSON with Markdown notes. Attachment bytes are listed in a manifest and require an independent backup.</p>
    <p className="text-sm text-muted-foreground">Exports expire 24 hours after request. Work advances while you use the workspace or refresh this list.</p>
    <div className="flex flex-wrap gap-2"><Button disabled={pending || rows.some((r) => ["pending", "running"].includes(r.status))} onClick={async () => {
      if (pending) return; setPending(true); setError(""); attempt.current ??= crypto.randomUUID();
      try { await settingsRequest("exports", "POST", { idempotencyKey: attempt.current }); attempt.current = null; await query.refetch(); }
      catch (e) { setError((e as Error).message); } finally { setPending(false); }
    }}>{pending ? "Requesting…" : "Create export"}</Button><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh</Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {query.isPending && <p>Loading exports…</p>}{query.isError && <p role="alert">Could not load exports. Try Refresh.</p>}
    {!query.isPending && !query.isError && rows.length === 0 && <p>No exports yet.</p>}
    <ul className="flex flex-col gap-3">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3"><div className="min-w-0 flex-1"><p className="text-sm">{formatTimestamp(row.requestedAt, timezone)} · {row.status}</p><p className="text-xs text-muted-foreground">Expires {formatTimestamp(row.expiresAt, timezone)}</p>{row.failureSummary && <p role="status" className="text-sm">{row.failureSummary}</p>}</div>{row.status === "ready" && <Button variant="outline" size="sm" onClick={async () => {
      setError(""); try { const result = await settingsRequest<{ url: string }>(`exports/${row.id}/download`); window.location.assign(result.url); }
      catch (e) { setError((e as Error).message); void query.refetch(); }
    }}>Download JSON</Button>}</li>)}</ul>
    {query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more</Button>}
  </div>;
}
