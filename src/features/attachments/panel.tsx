"use client";
import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Link2, Upload, X } from "lucide-react";
import { attachmentAccept, type Attachment, type AttachmentTarget } from "@/lib/contracts/attachments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCollection, workRequest, WorkError } from "@/features/work/api";
import { LoadMore, LoadingRows, QueryError } from "@/features/work/primitives";
import { attachmentLink, uploadAttachment, type UploadAttempt } from "./upload";

function fileSize(bytes: number) { return bytes < 1000 ? `${bytes} B` : bytes < 1_000_000 ? `${Math.round(bytes / 1000)} KB` : `${Number((bytes / 1_000_000).toFixed(1))} MB`; }

export function AttachmentPanel({ kind, id }: AttachmentTarget) {
  const inputId = useId(); const client = useQueryClient();
  const files = useCollection<Attachment>("attachments", { kind, id });
  const attempt = useRef<UploadAttempt | null>(null);
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState(""); const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["work"] });
  const transfer = async () => {
    if (!attempt.current) return;
    setBusy(true); setError(""); setRetryable(false); setStatus("Preparing upload…");
    try {
      await uploadAttachment(attempt.current, (stage, progress) => setStatus(stage === "verifying" ? "Verifying file…" : `Uploading ${progress}%`));
      attempt.current = null; setStatus("File ready.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Retry or remove the upload."); setRetryable(!(e instanceof WorkError && e.code === "upload_rejected")); setStatus("Upload needs attention."); }
    finally { setBusy(false); await refresh(); }
  };
  const command = async (file: Attachment, remove = false) => {
    setBusy(true); setError("");
    try {
      await workRequest(`attachments/${file.id}/${remove ? "remove" : "finalize"}`, "POST", remove ? { expectedRevision: file.revision } : {}, crypto.randomUUID());
      if (remove && attempt.current?.instructions?.attachment.id === file.id) { attempt.current = null; setRetryable(false); }
      setStatus(remove ? "File removed. Backups may retain it for 30 days." : "File ready.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update this file."); }
    finally { setBusy(false); await refresh(); }
  };
  return <div className="relative"><input className="sr-only" id={inputId} type="file" tabIndex={-1} aria-hidden="true" accept={attachmentAccept} disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file) return;
      attempt.current = { file, target: { kind, id }, key: crypto.randomUUID() }; void transfer();
    }} /><Button className="absolute right-2 top-[11px] z-10 max-md:top-0.5 max-md:size-11" variant="ghost" size="icon-sm" aria-label="Upload file" title="Images, PDF and UTF-8 text. Maximum 20 MB per file." disabled={busy} onClick={() => document.getElementById(inputId)?.click()}><Upload /></Button>
    <details className="work-group" open><summary style={{ paddingRight: 48 }}><span>Attachments</span>{!files.hasNextPage && <span className="text-muted-foreground">{files.items.length}</span>}<ChevronDown aria-hidden="true" /></summary><div className="work-group-body"><div className="flex flex-col gap-2 p-3">
    {status && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}{retryable && <Button variant="outline" size="sm" className="max-md:min-h-11" disabled={busy} onClick={() => void transfer()}>Retry upload</Button>}</AlertDescription></Alert>}
    <QueryError error={files.error} retry={files.refetch} retained={Boolean(files.data)} />
    {files.isPending ? <LoadingRows /> : files.items.length === 0 ? <p className="text-sm text-muted-foreground">No attachments yet.</p> : <ul>{files.items.map((file) => <li key={file.id} className="flex items-center gap-2 border-b py-1 last:border-0">
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{file.originalName}</p>{file.failureSummary && <p className="text-xs text-muted-foreground">{file.failureSummary}</p>}</div>
      <span className="text-xs text-muted-foreground">{fileSize(file.actualSize ?? file.declaredSize)}</span>
      {file.state !== "ready" && <Badge variant="outline">{file.state === "failed" ? "Failed" : "Pending"}</Badge>}
      {file.state === "ready" ? <><Button asChild variant="ghost" size="icon-sm" className="max-md:size-11"><a href={attachmentLink(file.id, "")} aria-label={`Download ${file.originalName}`}><Download /></a></Button><Button variant="ghost" size="icon-sm" className="max-md:size-11" aria-label="Copy note link" disabled={busy} onClick={() => { void navigator.clipboard.writeText(attachmentLink(file.id, window.location.origin)).then(() => setStatus("Link copied. Paste it into a note."), () => setError("Could not copy the link. Use the note link picker.")); }}><Link2 /></Button></> : file.state !== "failed" && <Button variant="outline" size="sm" className="max-md:min-h-11" disabled={busy} onClick={() => void command(file)}>Retry verification</Button>}
      {file.state === "failed" && <Button variant="outline" size="sm" className="max-md:min-h-11" disabled={busy} onClick={() => document.getElementById(inputId)?.click()}>Retry</Button>}
      <Button variant="ghost" size="icon-sm" className="max-md:size-11" aria-label={`Remove ${file.originalName}`} disabled={busy} onClick={(event) => { removeTrigger.current = event.currentTarget; setRemoving(file); }}><X /></Button>
    </li>)}</ul>}<LoadMore query={files} />
    <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}><AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); removeTrigger.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>Remove attachment?</AlertDialogTitle><AlertDialogDescription>Permanently remove {removing?.originalName}. Existing note links will stop working. Backups may retain the file for 30 days.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep file</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (removing) void command(removing, true); setRemoving(null); }}>Remove file</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></div></details></div>;
}
