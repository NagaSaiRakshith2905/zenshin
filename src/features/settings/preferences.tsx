"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { updatePreferencesSchema, type Preferences } from "@/lib/contracts/settings";
import { settingsRequest } from "./api";

function PreferencesForm({ preferences, message, setMessage }: { preferences: Preferences; message: string; setMessage: (value: string) => void }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [invalidTimezone, setInvalidTimezone] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = updatePreferencesSchema.safeParse({ timezone: form.get("timezone"), theme: form.get("theme"), defaultTaskView: form.get("defaultTaskView"), expectedRevision: preferences.revision });
    if (!parsed.success) { setInvalidTimezone(true); setMessage("Choose a valid IANA timezone and preference values."); return; }
    setInvalidTimezone(false);
    setPending(true);
    setMessage("");
    try {
      const saved = await settingsRequest<Preferences>("preferences", "PATCH", parsed.data);
      queryClient.setQueryData(["preferences"], saved);
      setMessage("Preferences saved.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setPending(false); }
  }
  return <form onSubmit={save} className="flex max-w-md flex-col gap-6">
    <FieldGroup>
      <Field data-invalid={invalidTimezone}><FieldLabel htmlFor="timezone">Timezone</FieldLabel><Input id="timezone" name="timezone" defaultValue={preferences.timezone} required maxLength={100} aria-invalid={invalidTimezone} aria-describedby="timezone-help" /><FieldDescription id="timezone-help">Use an IANA timezone, such as Asia/Kolkata. Due dates become overdue in this timezone.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="theme">Theme</FieldLabel><NativeSelect id="theme" name="theme" defaultValue={preferences.theme} className="w-full"><NativeSelectOption value="system">System</NativeSelectOption><NativeSelectOption value="light">Light</NativeSelectOption><NativeSelectOption value="dark">Dark</NativeSelectOption></NativeSelect></Field>
      <Field><FieldLabel htmlFor="default-view">Default view</FieldLabel><NativeSelect id="default-view" name="defaultTaskView" defaultValue={preferences.defaultTaskView} className="w-full"><NativeSelectOption value="list">List</NativeSelectOption><NativeSelectOption value="board">Board</NativeSelectOption></NativeSelect><FieldDescription>Used when a task view has no selection in its URL.</FieldDescription></Field>
    </FieldGroup>
    <div className="flex flex-wrap items-center gap-3"><Button disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button><p role="status" className="text-sm text-muted-foreground">{message}</p></div>
    <Button type="button" variant="ghost" className="self-start" onClick={() => void queryClient.invalidateQueries({ queryKey: ["preferences"] })}>Reload saved preferences</Button>
  </form>;
}

export function PreferencesPanel() {
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["preferences"], queryFn: () => settingsRequest<Preferences>("preferences") });
  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <div role="alert">Could not load preferences. <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>;
  return <PreferencesForm key={query.data.revision} preferences={query.data} message={message} setMessage={setMessage} />;
}
