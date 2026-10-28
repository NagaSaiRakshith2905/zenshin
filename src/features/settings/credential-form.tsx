"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createCredentialSchema, updateCredentialSchema, type CredentialSettings, type CredentialSummary } from "@/lib/contracts/settings";
import { settingsRequest } from "./api";

export function CredentialForm({ projects, credential, onClose, onSaved }: {
  projects: CredentialSettings["projects"]; credential?: CredentialSummary;
  onClose: () => void; onSaved: (created?: { id: string; secret: string; displayName: string }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [neverExpires, setNeverExpires] = useState(false);
  const [selected, setSelected] = useState(credential?.projectIds ?? []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const policy = { displayName: form.get("displayName"), projectIds: selected, preset: form.get("preset"), archive: form.has("archive"), complete: form.has("complete") };
    const parsed = credential ? updateCredentialSchema.safeParse({ ...policy, expectedRevision: credential.revision })
      : createCredentialSchema.safeParse({ ...policy, expiresInDays: neverExpires ? null : Number(form.get("expiresInDays")) });
    if (!parsed.success) { setError("Enter a name, select at least one project, and choose a valid expiry."); return; }
    setPending(true);
    setError("");
    try {
      if (credential) {
        await settingsRequest(`credentials/${credential.id}`, "PATCH", parsed.data);
        onSaved();
      } else {
        // Keep secrets out of query/mutation caches and browser storage.
        const result = await settingsRequest<{ id: string; secret: string }>("credentials", "POST", parsed.data);
        onSaved({ ...result, displayName: String(policy.displayName).trim() });
      }
    } catch (error) { setError((error as Error).message); }
    finally { setPending(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onInteractOutside={(event) => { if (pending) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{credential ? "Edit credential" : "Create agent key"}</DialogTitle><DialogDescription>Grant access to selected projects. Archive and completion are independent permissions.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={pending}>
        <FieldGroup>
          <Field><FieldLabel htmlFor="credential-name">Name</FieldLabel><Input autoComplete="off" id="credential-name" name="displayName" defaultValue={credential?.displayName} placeholder="desktop-agent" required maxLength={120} /></Field>
          <FieldSet><FieldLegend>Projects</FieldLegend><FieldDescription>Only these projects are accessible. New projects are never added automatically.</FieldDescription>
            <FieldGroup className="max-h-40 overflow-y-auto">
              {projects.map((project) => <Field key={project.id} orientation="horizontal"><Checkbox id={`grant-${project.id}`} checked={selected.includes(project.id)} onCheckedChange={(checked) => setSelected((ids) => checked === true ? [...ids, project.id] : ids.filter((id) => id !== project.id))} /><FieldLabel htmlFor={`grant-${project.id}`}>{project.name}{project.archived ? " (archived)" : ""}</FieldLabel></Field>)}
              {projects.length === 0 && <p className="text-sm text-muted-foreground">Create a project before creating an agent key.</p>}
            </FieldGroup>
          </FieldSet>
          <Field><FieldLabel htmlFor="credential-preset">Preset</FieldLabel><NativeSelect id="credential-preset" name="preset" className="w-full" defaultValue={credential?.scopes.includes("write") ? "contributor" : "read_only"}><NativeSelectOption value="read_only">Read only</NativeSelectOption><NativeSelectOption value="contributor">Contributor</NativeSelectOption></NativeSelect><FieldDescription>Read only grants read access. Contributor also allows creating and updating work and uploading files.</FieldDescription></Field>
          <FieldSet><FieldLegend>Additional permissions</FieldLegend><FieldGroup>
            <Field orientation="horizontal"><Checkbox id="credential-archive" name="archive" defaultChecked={credential?.scopes.includes("archive")} /><FieldLabel htmlFor="credential-archive">Allow archiving sections and tasks</FieldLabel></Field>
            <Field orientation="horizontal"><Checkbox id="credential-complete" name="complete" defaultChecked={credential?.scopes.includes("complete")} /><FieldLabel htmlFor="credential-complete">Allow completing work</FieldLabel></Field>
          </FieldGroup><FieldDescription>Agents cannot create projects or keys, manage settings, export, or permanently delete work.</FieldDescription></FieldSet>
          {!credential && <FieldSet><FieldLegend>Expiry</FieldLegend><Field><FieldLabel htmlFor="credential-expiry">Expires after (days)</FieldLabel><Input id="credential-expiry" name="expiresInDays" type="number" min={1} max={3650} defaultValue={90} required={!neverExpires} disabled={neverExpires} /></Field><Field orientation="horizontal"><Checkbox id="never-expires" checked={neverExpires} onCheckedChange={(value) => setNeverExpires(value === true)} /><FieldLabel htmlFor="never-expires">No expiry</FieldLabel></Field></FieldSet>}
        </FieldGroup>
        {error && <p role="alert" className="text-sm text-muted-foreground">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={pending || projects.length === 0}>{pending ? "Saving…" : credential ? "Save changes" : "Create key"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
