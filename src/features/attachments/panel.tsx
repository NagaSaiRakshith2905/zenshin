"use client";
import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { attachmentAccept, type Attachment, type AttachmentTarget } from "@/lib/contracts/attachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useCollection, workRequest, WorkError } from "@/features/work/api";
import { Group, LoadMore, LoadingRows, QueryError } from "@/features/work/primitives";
import { attachmentLink, uploadAttachment, type UploadAttempt } from "./upload";

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
  return <Group title="Attachments" count={files.items.length}><div className="flex flex-col gap-3 p-4">
    <Field><FieldLabel htmlFor={inputId}><Paperclip className="size-4" aria-hidden="true" />Add file</FieldLabel><Input id={inputId} type="file" accept={attachmentAccept} disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file) return;
      attempt.current = { file, target: { kind, id }, key: crypto.randomUUID() }; void transfer();
    }} /><FieldDescription>Images, PDF and UTF-8 text. Maximum 20 MB per file.</FieldDescription></Field>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}{retryable && <Button variant="outline" size="sm" disabled={busy} onClick={() => void transfer()}>Retry upload</Button>}</AlertDescription></Alert>}
    <QueryError error={files.error} retry={files.refetch} retained={Boolean(files.data)} />
    {files.isPending ? <LoadingRows /> : files.items.length === 0 ? <p className="text-sm text-muted-foreground">No attachments yet.</p> : <ul className="flex flex-col gap-3">{files.items.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 basis-full"><p className="break-words text-sm font-medium">{file.originalName}</p><p className="text-xs text-muted-foreground">{((file.actualSize ?? file.declaredSize) / 1_000_000).toFixed(2)} MB{file.failureSummary && ` · ${file.failureSummary}`}</p></div>
      <Badge variant={file.state === "ready" ? "secondary" : "outline"}>{file.state}</Badge>
      {file.state === "ready" ? <><Button asChild variant="outline" size="sm"><a href={attachmentLink(file.id, "")}>Download</a></Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { void navigator.clipboard.writeText(attachmentLink(file.id, window.location.origin)).then(() => setStatus("Link copied. Paste it into a note."), () => setError("Could not copy the link. Use the note link picker.")); }}>Copy note link</Button></> : file.state !== "failed" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void command(file)}>Retry verification</Button>}
      {file.state === "failed" && <Button variant="outline" size="sm" disabled={busy} onClick={() => document.getElementById(inputId)?.click()}>Retry with file</Button>}
      <Button variant="ghost" size="sm" disabled={busy} onClick={(event) => { removeTrigger.current = event.currentTarget; setRemoving(file); }}>Remove</Button>
    </li>)}</ul>}<LoadMore query={files} />
    <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}><AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); removeTrigger.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>Remove attachment?</AlertDialogTitle><AlertDialogDescription>Permanently remove {removing?.originalName}. Existing note links will stop working. Backups may retain the file for 30 days.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep file</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (removing) void command(removing, true); setRemoving(null); }}>Remove file</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></Group>;
}
