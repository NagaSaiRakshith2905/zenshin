"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, KeyRound, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { CredentialSettings, CredentialSummary } from "@/lib/contracts/settings";
import { settingsRequest } from "./api";
import { CredentialForm } from "./credential-form";
import { McpSetup } from "./mcp-setup";

function Secret({ created, onDismiss }: { created: { secret: string; displayName: string }; onDismiss: () => void }) {
  const [copyMessage, setCopyMessage] = useState("");
  return <Alert role="status"><KeyRound /><AlertTitle>Key created: {created.displayName}</AlertTitle><AlertDescription className="flex flex-col gap-3">
    <p>Copy this secret now. It won’t be shown again.</p>
    <div className="flex gap-2"><Input aria-label="New agent secret" readOnly value={created.secret} className="font-mono" autoComplete="off" spellCheck={false} /><Button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(created.secret); setCopyMessage("Copied."); }
      catch { setCopyMessage("Copy failed. Select the secret and copy it manually."); }
    }}><Copy data-icon="inline-start" />Copy</Button></div>
    <p>Store it in your MCP client’s environment or a password manager. Lost it? Revoke the key and create a new one.</p>
    <div className="flex flex-wrap items-center justify-between gap-2"><span>{copyMessage}</span><Button variant="outline" onClick={onDismiss}>I’ve stored it</Button></div>
  </AlertDescription></Alert>;
}

function CredentialRow({ credential, projects, timezone, onEdit, onRevoke }: {
  credential: CredentialSummary; projects: CredentialSettings["projects"]; timezone: string;
  onEdit: () => void; onRevoke: () => void;
}) {
  const format = (date: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(date));
  return <li className="flex flex-wrap items-center gap-3 border-b p-3 last:border-0">
    <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div className="flex min-w-0 flex-1 flex-col gap-1"><p className="wrap-anywhere font-medium">{credential.displayName}</p>
      <p className="text-xs wrap-anywhere text-muted-foreground">{credential.projectIds.map((id) => projects.find((project) => project.id === id)?.name).filter(Boolean).join(", ") || "No remaining project grants"}</p>
      <div className="flex flex-wrap gap-1">{credential.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}</div>
      <p className="text-xs text-muted-foreground">Created {format(credential.createdAt)} · {credential.expiresAt ? `Expires ${format(credential.expiresAt)}` : "No expiry"}</p>
      <p className="text-xs text-muted-foreground">{credential.lastUsedAt ? `Last used ${format(credential.lastUsedAt)}` : "Never used"}{credential.status !== "active" ? ` · ${credential.status}` : ""}</p>
    </div>
    {credential.status === "active" && <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${credential.displayName}`}>Edit</Button><Button variant="outline" size="sm" onClick={onRevoke} aria-label={`Revoke ${credential.displayName}`}>Revoke</Button></div>}
  </li>;
}

export type CreatedCredential = { id: string; secret: string; displayName: string };
export function CredentialsPanel({ timezone, created, setCreated }: { timezone: string; created: CreatedCredential | null; setCreated: (value: CreatedCredential | null) => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["credentials"], queryFn: () => settingsRequest<CredentialSettings>("credentials") });
  const [form, setForm] = useState<"create" | CredentialSummary | null>(null);
  const [revoke, setRevoke] = useState<CredentialSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["credentials"] });
  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <div role="alert">Could not load credentials. <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>;
  const active = query.data.credentials.filter((c) => c.status === "active");
  const inactive = query.data.credentials.filter((c) => c.status !== "active");
  const row = (credential: CredentialSummary) => <CredentialRow key={credential.id} credential={credential} projects={query.data.projects} timezone={timezone} onEdit={() => setForm(credential)} onRevoke={() => setRevoke(credential)} />;
  return <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Scoped access for your local agents.</p><Button onClick={() => setForm("create")} disabled={Boolean(created)}><Plus data-icon="inline-start" />Create key</Button></div>
    {created && <Secret created={created} onDismiss={() => setCreated(null)} />}
    <McpSetup />
    {error && <Alert><AlertDescription>{error} <Button variant="ghost" onClick={() => void refresh()}>Reload credentials</Button></AlertDescription></Alert>}
    <section className="overflow-hidden rounded-[14px] border bg-muted p-1"><h3 className="flex gap-2 px-3 py-2 text-[13px] font-medium">Active keys <span className="text-muted-foreground">{active.length}</span></h3><ul className="rounded-[10px] bg-background">{active.map(row)}</ul>
      {active.length === 0 && <Empty><EmptyHeader><EmptyTitle>No active credentials</EmptyTitle><EmptyDescription>Select projects and permissions to give an agent access.</EmptyDescription></EmptyHeader></Empty>}
    </section>
    <details className="rounded-[14px] border bg-muted p-1"><summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-medium">Expired and revoked <span className="text-muted-foreground">{inactive.length}</span><ChevronDown className="ml-auto size-4" aria-hidden="true" /></summary><ul className="rounded-[10px] bg-background">{inactive.map(row)}</ul>{inactive.length === 0 && <p className="p-3 text-sm text-muted-foreground">No expired or revoked credentials.</p>}</details>
    {form && <CredentialForm projects={query.data.projects} credential={form === "create" ? undefined : form} onClose={() => setForm(null)} onSaved={(result) => { setForm(null); if (result) setCreated(result); void refresh(); }} />}
    <AlertDialog open={Boolean(revoke)} onOpenChange={(open) => { if (!open && !pending) setRevoke(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke {revoke?.displayName}?</AlertDialogTitle><AlertDialogDescription>The key will fail on its next authenticated request. You can create a replacement later.</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-muted-foreground">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={async (event) => {
        event.preventDefault();
        if (!revoke) return;
        setPending(true); setError("");
        try {
          await settingsRequest(`credentials/${revoke.id}/revoke`, "POST", { expectedRevision: revoke.revision });
          if (created?.id === revoke.id) setCreated(null);
          setRevoke(null); void refresh();
        } catch (error) { setError((error as Error).message); }
        finally { setPending(false); }
      }}>{pending ? "Revoking…" : "Revoke key"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
}
