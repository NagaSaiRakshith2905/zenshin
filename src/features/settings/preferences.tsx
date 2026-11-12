"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField, SelectField } from "@/features/work/primitives";
import { ValidationForm, validationIssues, type FieldIssue } from "@/features/work/validation";
import { useDraftState, useClearFormDraft } from "@/features/work/form-drafts";
import { updatePreferencesSchema, type Preferences } from "@/lib/contracts/settings";
import { settingsRequest } from "./api";

function PreferencesForm({ preferences, message, setMessage }: { preferences: Preferences; message: string; setMessage: (value: string) => void }) {
  const client = useQueryClient(); const clearDraft = useClearFormDraft("preferences");
  const [timezone, setTimezone] = useDraftState("preferences:timezone", preferences.timezone);
  const [theme, setTheme] = useDraftState("preferences:theme", preferences.theme);
  const [view, setView] = useDraftState("preferences:view", preferences.defaultTaskView);
  const [revision] = useDraftState("preferences:revision", preferences.revision);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<FieldIssue[]>([]); const [error, setError] = useState<Error | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updatePreferencesSchema.safeParse({ timezone, theme, defaultTaskView: view, expectedRevision: revision });
    if (!parsed.success) { setIssues(parsed.error.issues); return; }
    setIssues([]); setError(null); setPending(true); setMessage("");
    try {
      const saved = await settingsRequest<Preferences>("preferences", "PATCH", parsed.data);
      clearDraft(); client.setQueryData(["preferences"], saved); setMessage("Preferences saved.");
    } catch (e) { setError(e as Error); }
    finally { setPending(false); }
  }
  return <ValidationForm error={error} issues={issues.length ? issues : validationIssues(error)} onSubmit={save} className="flex max-w-md flex-col gap-6" aria-busy={pending}>
    <FieldGroup>
      <TextField label="Timezone" name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required maxLength={100} description="Use an IANA timezone, such as Asia/Kolkata. Dates and timestamps use this timezone." />
      <SelectField label="Theme" name="theme" value={theme} onChange={(e) => setTheme(e.target.value as Preferences["theme"])}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></SelectField>
      <SelectField label="Default view" name="defaultTaskView" value={view} onChange={(e) => setView(e.target.value as Preferences["defaultTaskView"])}><option value="list">List</option><option value="board">Board</option><option value="calendar">Calendar</option></SelectField>
    </FieldGroup>
    {error && !validationIssues(error).length && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button><p role="status" className="text-sm text-muted-foreground">{message}</p></div>
    <Button type="button" variant="ghost" className="self-start" disabled={pending} onClick={() => { setTimezone(preferences.timezone); setTheme(preferences.theme); setView(preferences.defaultTaskView); clearDraft(); setIssues([]); setError(null); void client.invalidateQueries({ queryKey: ["preferences"] }); }}>Discard draft and reload preferences</Button>
  </ValidationForm>;
}
export function PreferencesPanel() {
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["preferences"], queryFn: () => settingsRequest<Preferences>("preferences") });
  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <div role="alert">Could not load preferences. <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>;
  return <PreferencesForm key={query.data.revision} preferences={query.data} message={message} setMessage={setMessage} />;
}
