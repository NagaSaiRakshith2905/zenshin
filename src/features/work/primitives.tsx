"use client";
import { useId, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Category, Progress } from "./types";
import { categoryLabels } from "./model";
export function StatusGlyph({ category }: { category: Category }) { return <span className={cn("status-glyph", `status-${category}`)} aria-label={categoryLabels[category]} role="img" />; }
export function TextField({ label, multiline, ...props }: ComponentProps<typeof Input> & { label: string; multiline?: boolean }) {
  const id = useId();
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel>{multiline ? <textarea id={id} className="work-textarea" {...props as ComponentProps<"textarea">} /> : <Input id={id} {...props} />}</Field>;
}
export function SelectField({ label, children, ...props }: ComponentProps<typeof NativeSelect> & { label: string }) {
  const id = useId(); return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><NativeSelect id={id} {...props}>{children}</NativeSelect></Field>;
}
export function CheckField({ label, ...props }: ComponentProps<"input"> & { label: string }) { const id = useId(); return <Field orientation="horizontal"><input className="size-4 accent-current" id={id} type="checkbox" {...props} /><FieldLabel htmlFor={id}>{label}</FieldLabel></Field>; }
export function LoadingRows() { return <div aria-label="Loading work" className="flex flex-col gap-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>; }
export function QueryError({ error, retry, retained = false }: { error: Error | null; retry: () => unknown; retained?: boolean }) {
  if (!error) return null;
  return <Alert><AlertDescription>{retained ? "Could not refresh. Showing the last loaded data. " : ""}{error.message}<Button size="sm" variant="outline" onClick={() => void retry()}><RefreshCw data-icon="inline-start" />Retry</Button></AlertDescription></Alert>;
}
export function EmptyWork({ title, description, children }: { title: string; description: string; children?: ReactNode }) { return <Empty className="min-h-52"><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{children}</Empty>; }
export function ProgressLine({ value }: { value?: Progress }) {
  if (!value) return null;
  return <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{value.state === "no_tasks" ? "No tasks" : value.state === "no_active_tasks" ? "No active tasks" : `${value.done} of ${value.total} leaf tasks done`}</span>{value.total > 0 && <progress className="work-progress" value={value.done} max={value.total} aria-label="Task progress" />}{value.unresolvedParents > 0 && <span>{value.unresolvedParents} unresolved {value.unresolvedParents === 1 ? "parent" : "parents"}</span>}</div>;
}
export function Group({ title, count, children, defaultOpen = true }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean }) { return <details className="work-group" open={defaultOpen}><summary><span>{title}</span>{count !== undefined && <span className="text-muted-foreground">{count}</span>}<ChevronDown aria-hidden="true" /></summary><div className="work-group-body">{children}</div></details>; }
export function LoadMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) { return query.hasNextPage ? <Button className="my-3" variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading…" : "Load more"}</Button> : null; }
