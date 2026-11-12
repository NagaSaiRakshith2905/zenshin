"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { TextField, SelectField } from "@/features/work/primitives";
import { ValidationForm, useFieldValidation, validationIssues, type FieldIssue } from "@/features/work/validation";
import { useDraftState, useClearFormDraft } from "@/features/work/form-drafts";
import { createCredentialSchema, updateCredentialSchema, type CredentialSettings, type CredentialSummary } from "@/lib/contracts/settings";
import { settingsRequest } from "./api";

function ProjectGrants({ projects, selected, change }: { projects: CredentialSettings["projects"]; selected: string[]; change: (ids: string[]) => void }) {
  const validation = useFieldValidation("projectIds");
  return <FieldSet data-field="projectIds" aria-describedby={validation.error ? `${validation.id}-error` : undefined}><FieldLegend>Projects</FieldLegend><FieldDescription>Only these projects are accessible. New projects are never added automatically.</FieldDescription><FieldGroup className="max-h-40 overflow-y-auto">
    {projects.map((project) => <Field key={project.id} orientation="horizontal"><Checkbox id={`grant-${project.id}`} checked={selected.includes(project.id)} aria-invalid={Boolean(validation.error)} aria-describedby={validation.error ? `${validation.id}-error` : undefined} onCheckedChange={(checked) => change(checked === true ? [...selected, project.id] : selected.filter((id) => id !== project.id))} /><FieldLabel htmlFor={`grant-${project.id}`}>{project.name}{project.archived ? " (archived)" : ""}</FieldLabel></Field>)}
    {projects.length === 0 && <p className="text-sm text-muted-foreground">Create a project before creating an agent key.</p>}
  </FieldGroup>{validation.error && <FieldError id={`${validation.id}-error`}>{validation.error}</FieldError>}</FieldSet>;
}
export function CredentialForm({ projects, credential, onClose, onSaved }: {
  projects: CredentialSettings["projects"]; credential?: CredentialSummary;
  onClose: () => void; onSaved: (created?: { id: string; secret: string; displayName: string }) => void;
}) {
  const key = `credential:${credential?.id ?? "new"}`; const clearDraft = useClearFormDraft(key);
  const [name, setName] = useDraftState(`${key}:name`, credential?.displayName ?? "");
  const [selected, setSelected] = useDraftState(`${key}:projects`, credential?.projectIds ?? []);
  const [preset, setPreset] = useDraftState(`${key}:preset`, credential?.scopes.includes("write") ? "contributor" : "read_only");
  const [archive, setArchive] = useDraftState(`${key}:archive`, credential?.scopes.includes("archive") ?? false);
  const [complete, setComplete] = useDraftState(`${key}:complete`, credential?.scopes.includes("complete") ?? false);
  const [neverExpires, setNeverExpires] = useDraftState(`${key}:never-expires`, false);
  const [days, setDays] = useDraftState(`${key}:days`, "90");
  const [revision] = useDraftState(`${key}:revision`, credential?.revision);
  const [pending, setPending] = useState(false); const [error, setError] = useState<Error | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const policy = { displayName: name, projectIds: selected, preset, archive, complete };
    const parsed = credential ? updateCredentialSchema.safeParse({ ...policy, expectedRevision: revision }) : createCredentialSchema.safeParse({ ...policy, expiresInDays: neverExpires ? null : Number(days) });
    if (!parsed.success) { setIssues(parsed.error.issues); return; }
    setPending(true); setError(null); setIssues([]);
    try {
      if (credential) { await settingsRequest(`credentials/${credential.id}`, "PATCH", parsed.data); clearDraft(); onSaved(); }
      else {
        const result = await settingsRequest<{ id: string; secret: string }>("credentials", "POST", parsed.data);
        clearDraft(); onSaved({ ...result, displayName: name.trim() });
      }
    } catch (e) { setError(e as Error); }
    finally { setPending(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onInteractOutside={(event) => { if (pending) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>{credential ? "Edit credential" : "Create agent key"}</DialogTitle><DialogDescription>Grant access to selected projects. Closing keeps unfinished changes in the current session.</DialogDescription></DialogHeader>
    <ValidationForm error={error} issues={issues.length ? issues : validationIssues(error)} onSubmit={submit} className="flex flex-col gap-6" aria-busy={pending}>
      <FieldGroup>
        <TextField label="Name" name="displayName" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="desktop-agent" required maxLength={120} />
        <ProjectGrants projects={projects} selected={selected} change={setSelected} />
        <SelectField label="Preset" name="preset" value={preset} onChange={(e) => setPreset(e.target.value)}><option value="read_only">Read only</option><option value="contributor">Contributor</option></SelectField>
        <FieldDescription>Read only grants read access. Contributor also allows creating and updating work and uploading files.</FieldDescription>
        <FieldSet><FieldLegend>Additional permissions</FieldLegend><FieldGroup>
          <Field orientation="horizontal"><Checkbox id="credential-archive" name="archive" checked={archive} onCheckedChange={(value) => setArchive(value === true)} /><FieldLabel htmlFor="credential-archive">Allow archiving sections and tasks</FieldLabel></Field>
          <Field orientation="horizontal"><Checkbox id="credential-complete" name="complete" checked={complete} onCheckedChange={(value) => setComplete(value === true)} /><FieldLabel htmlFor="credential-complete">Allow completing work</FieldLabel></Field>
        </FieldGroup><FieldDescription>Agents cannot create projects or keys, manage settings, export, or permanently delete work.</FieldDescription></FieldSet>
        {!credential && <FieldSet><FieldLegend>Expiry</FieldLegend><TextField label="Expires after (days)" name="expiresInDays" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} required={!neverExpires} disabled={neverExpires} /><Field orientation="horizontal"><Checkbox id="never-expires" checked={neverExpires} onCheckedChange={(value) => setNeverExpires(value === true)} /><FieldLabel htmlFor="never-expires">No expiry</FieldLabel></Field></FieldSet>}
      </FieldGroup>
      {error && !validationIssues(error).length && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => { clearDraft(); onClose(); }}>Discard draft</Button><Button disabled={pending || projects.length === 0}>{pending ? "Saving…" : credential ? "Save changes" : "Create key"}</Button></div>
    </ValidationForm>
  </DialogContent></Dialog>;
}
