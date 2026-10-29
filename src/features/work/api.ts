"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Page } from "./types";
export class WorkError extends Error {
  constructor(message: string, public code = "internal_error", public details: Record<string, unknown> = {}, public requestId?: string) { super(message); }
}
export async function workRequest<T>(path: string, method = "GET", input?: Record<string, unknown>, key?: string): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, { method, credentials: "same-origin", cache: "no-store", ...(input ? { headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify({ input }) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new WorkError(result.error?.message ?? "Could not complete the request. Try again.", result.error?.code, { ...result.error?.details, fields: result.error?.fields }, result.error?.requestId);
  return result as T;
}
export type Params = Record<string, string | boolean | undefined>;
export const queryString = (params: Params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
export function useCollection<T>(resource: string, params: Params = {}, enabled = true) {
  const query = useInfiniteQuery({ queryKey: ["work", resource, params], enabled, initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => workRequest<Page<T>>(`${resource}?${queryString({ ...params, cursor: pageParam })}`), getNextPageParam: (page) => page.nextCursor ?? undefined });
  return { ...query, items: query.data?.pages.flatMap((p) => p.items) ?? [], groupCounts: query.data?.pages[0]?.groupCounts, statusCounts: query.data?.pages[0]?.statusCounts };
}
export function useEntity<T>(resource: string, id?: string) {
  return useQuery({ queryKey: ["work", resource, id], queryFn: () => workRequest<T>(`${resource}/${id}?includeArchived=true`), enabled: Boolean(id) });
}
