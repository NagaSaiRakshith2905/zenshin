"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "@/components/brand/logo";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogHeader, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { workRequest, WorkError } from "./api";
import { ErrorSummary, useFormValidation, validationIssues } from "./validation";
import { optimisticChange } from "./model";

// Saves in flight across every useAction, for the one header indicator.
let saving = 0; const listeners = new Set<() => void>();
const setSaving = (delta: number) => { saving += delta; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function SavingIndicator() {
  const busy = useSyncExternalStore(subscribe, () => saving > 0, () => false);
  return <span role="status" className="saving-indicator" data-active={busy ? "" : undefined}>{busy && <><Logo className="saving-logo" /><span className="sr-only">Saving changes…</span></>}</span>;
}
const definitionResources = new Set(["statuses", "labels", "properties", "attachments"]);
type Attempt = { path: string; input: Record<string, unknown>; key: string; success?: (value: unknown) => void };
export function useAction() {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<WorkError | null>(null);
  const [notice, setNotice] = useState("");
  const attempt = useRef<Attempt | null>(null);
  const busy = useRef(false);
  async function send(next: Attempt) {
    if (busy.current) return;
    busy.current = true; setPending(true); setSaving(1); setError(null); setNotice(""); attempt.current = next;
    // Edits to one row show at once; the refetch below reconciles them, or rolls them back on failure.
    const [resource, id, sub] = next.path.split("/");
    const { expectedRevision, ...fields } = next.input;
    const findStatus = (statusId: string) => client.getQueriesData<{ pages: { items: Record<string, unknown>[] }[] }>({ queryKey: ["work", "statuses"] }).flatMap(([, d]) => d?.pages.flatMap((p) => p.items) ?? []).find((s) => s.id === statusId);
    const change = expectedRevision !== undefined && id && ["tasks", "sections", "projects"].includes(resource) ? optimisticChange(sub, fields, findStatus) : null;
    const patchCache = (update: (row: Record<string, unknown>) => Record<string, unknown>) => {
      const merge = (row: unknown) => row && typeof row === "object" && (row as { id?: string }).id === id ? { ...row, ...update(row as Record<string, unknown>) } : row;
      client.setQueriesData({ queryKey: ["work", resource] }, (data: unknown) => data && typeof data === "object" && "pages" in data
        ? { ...data, pages: (data as { pages: { items: unknown[] }[] }).pages.map((page) => ({ ...page, items: page.items.map(merge) })) } : merge(data));
    };
    if (change) { await client.cancelQueries({ queryKey: ["work", resource] }); patchCache(change); }
    try {
      const result = await workRequest(next.path, resource === "github" || (next.input.expectedRevision === undefined && !next.path.includes("/delete")) ? "POST" : next.path.split("/").length === 2 ? "PATCH" : "POST", next.input, next.key);
      // Adopt the new revision now so a quick follow-up edit isn't a false conflict.
      // Only trust a revision that belongs to this row; some actions return a different record.
      if (change && result && typeof result === "object" && "revision" in result && (result as { id?: string }).id === id) patchCache(() => ({ revision: (result as { revision: number }).revision }));
      // Refresh in the background; the save is confirmed by the response itself.
      // Item edits can't change workflow definitions or files, so those only go stale and reload when next used.
      const itemEdit = ["tasks", "sections", "projects"].includes(next.path.split("/")[0]) && !(resource === "tasks" && sub === "properties");
      void client.invalidateQueries({ queryKey: ["work"], predicate: (q) => !itemEdit || !definitionResources.has(q.queryKey[1] as string) });
      if (itemEdit) void client.invalidateQueries({ queryKey: ["work"], predicate: (q) => definitionResources.has(q.queryKey[1] as string), refetchType: "none" });
      void client.invalidateQueries({ queryKey: ["credentials"], refetchType: "none" });
      const ancestors = result && typeof result === "object" && "archivedAncestors" in result ? result.archivedAncestors : undefined;
      setNotice(Array.isArray(ancestors) && ancestors.length ? "Restored. Restore its archived ancestors too to make this work visible." : "Changes saved.");
      next.success?.(result);
      return result;
    } catch (e) {
      if (change) void client.invalidateQueries({ queryKey: ["work", resource] }); setError(e instanceof WorkError ? e : new WorkError("The response could not be confirmed. Retry the same request before making another change.", "transport_error")); }
    finally { busy.current = false; setPending(false); setSaving(-1); }
  }
  return { pending, error, notice, dismiss: () => setError(null), run(path: string, input: Record<string, unknown>, success?: (value: unknown) => void) {
    const same = attempt.current?.path === path && JSON.stringify(attempt.current.input) === JSON.stringify(input);
    return send({ path, input, success, key: same ? attempt.current!.key : crypto.randomUUID() });
  }, retry(extra: Record<string, unknown> = {}) {
    if (!attempt.current) return;
    return send({ ...attempt.current, input: { ...attempt.current.input, ...extra }, key: Object.keys(extra).length ? crypto.randomUUID() : attempt.current.key });
  } };
}
export type Action = ReturnType<typeof useAction>;
export function ActionFeedback({ action, quiet = false }: { action: Action; quiet?: boolean }) {
  const validation = useFormValidation();
  const [replacement, setReplacement] = useState("");
  const error = action.error;
  if (!error) return !quiet && (action.pending || action.notice) ? <p role="status" className="text-xs text-muted-foreground">{action.pending ? "Saving changes…" : action.notice}</p> : null;
  const details = error.details;
  const affected = (details.affected ?? []) as { id: string; name?: string; title?: string }[];
  const options = (details.options ?? []) as (string | { id: string; name: string })[];
  const confirmation = details.confirmation as Record<string, unknown> | undefined;
  const decision = error.code === "decision_required";
  const conflict = error.code === "conflict" && typeof details.currentRevision === "number";
  if (!decision && !conflict && validationIssues(error).length) return validation ? null : <ErrorSummary issues={validationIssues(error)} />;
  if (!decision && !conflict) return <Alert variant="destructive"><AlertDescription><span>{error.message}</span>{Array.isArray(details.fields) && <ul>{(details.fields as { path: (string | number)[]; message: string }[]).map((f, i) => <li key={i}>{f.path.join(".")}: {f.message}</li>)}</ul>}<Button variant="outline" size="sm" disabled={action.pending} onClick={() => void action.retry()}>Retry</Button></AlertDescription></Alert>;
  const confirm = () => {
    if (confirmation) return action.retry({ confirmation });
    if (typeof details.affectedTaskCount === "number" && !options.length) return action.retry({ confirmedAffectedTaskCount: details.affectedTaskCount });
    if (options.includes("reopen_completed_ancestors")) return action.retry({ reopenCompletedAncestors: true });
    if (options.includes("acknowledge_dependents")) return action.retry({ acknowledgeDependentIds: affected.map((a) => a.id) });
    if (options.some((o) => typeof o === "object")) return action.retry({ replacementStatusId: (options.some((o) => typeof o === "object" && o.id === replacement) ? replacement : (options[0] as { id: string }).id) });
    if (conflict) return action.retry({ expectedRevision: details.currentRevision });
  };
  return <AlertDialog open onOpenChange={(open) => { if (!open && !action.pending) action.dismiss(); }}><AlertDialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[role="alertdialog"] button')?.focus()); }}><AlertDialogHeader><AlertDialogTitle>{conflict ? "This item changed" : confirmation ? "Permanently delete work?" : "A choice is needed"}</AlertDialogTitle><AlertDialogDescription>{error.message}</AlertDialogDescription></AlertDialogHeader>
    {affected.length > 0 && <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">{affected.map((item) => <li key={item.id}>{item.name ?? item.title ?? item.id}</li>)}</ul>}
    {typeof details.affectedTaskCount === "number" && <p>{String(details.affectedTaskCount)} tasks lose {String(details.name ?? "this value")}, including archived tasks.</p>}
    {confirmation && <p>Delete “{String(confirmation.name)}”: {String(confirmation.sectionCount)} sections, {String(confirmation.taskCount)} tasks and {String(confirmation.fileCount)} files. Backups may retain this data for 30 days.</p>}
    {conflict && <><p>Your attempted changes are retained. Compare the current saved version before retrying.</p><pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(details.current, null, 2)}</pre></>}
    {options.some((o) => typeof o === "object") && <Field><FieldLabel htmlFor="replacement-status">Replacement status</FieldLabel><NativeSelect id="replacement-status" value={(options.some((o) => typeof o === "object" && o.id === replacement) ? replacement : (options[0] as { id: string }).id)} onChange={(e) => setReplacement(e.target.value)}>{options.map((o) => typeof o === "object" && <option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></Field>}
    <AlertDialogFooter><Button variant="outline" disabled={action.pending} onClick={action.dismiss}>Cancel</Button>{options.includes("complete_all") ? <><Button variant="outline" disabled={action.pending} onClick={() => void action.retry({ completionAction: "keep_open" })}>Keep parent open</Button><Button disabled={action.pending} onClick={() => void action.retry({ completionAction: "complete_all" })}>Complete all</Button></> : <Button disabled={action.pending} onClick={() => void confirm()}>{action.pending ? "Saving…" : confirmation ? "Delete permanently" : conflict ? "Retry with latest revision" : "Confirm"}</Button>}</AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
