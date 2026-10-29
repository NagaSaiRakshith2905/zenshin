"use client";
import { DefaultTaskView } from "@/features/work/view-preference";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, UserRound, Archive, Folder, List, Tags, SlidersHorizontal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Preferences } from "@/lib/contracts/settings";
import { cn } from "@/lib/utils";
import { NoteEnvironment, useNoteOwner } from "@/features/notes/environment";
import { activeNotes, hasOwnerDrafts, discardOwnerDrafts } from "@/features/notes/drafts";
import { Button } from "@/components/ui/button";
import { EditorProvider } from "@/features/work/editors";
import { WorkShell } from "@/features/work/shell";
import { ArchivedWork, ProjectSettings, type ProjectSettingsSection } from "@/features/work/project-settings";
import { useCollection, useEntity } from "@/features/work/api";
import { SelectField, LoadMore, QueryError } from "@/features/work/primitives";
import type { Project, Task } from "@/features/work/types";
import { settingsRequest } from "./api";
import { authClient } from "./auth-client";
import { CredentialsPanel } from "./credentials";
import { PreferencesPanel } from "./preferences";
type SettingsSection = "preferences" | "credentials" | "archived" | ProjectSettingsSection;
const sectionNames = { preferences: "Preferences", credentials: "Agent credentials", archived: "Archived work", general: "General", statuses: "Workflow", labels: "Labels", properties: "Properties" };
function WorkspaceContent({ children, initialPreferences }: { children: ReactNode; initialPreferences: Preferences }) {
  const client = useQueryClient();
  const ownerId = useNoteOwner();
  const [signOutChoice, setSignOutChoice] = useState(false);
  const { data: preferences } = useQuery({ queryKey: ["preferences"], queryFn: () => settingsRequest<Preferences>("preferences"), initialData: initialPreferences });
  const [open, setOpen] = useState(false); const [section, setSection] = useState<SettingsSection>("preferences");
  const [signingOut, setSigningOut] = useState(false); const [error, setError] = useState("");
  const path = usePathname(); const search = useSearchParams(); const [selectedProject, setSelectedProject] = useState("");
  const activeTaskId = /^\/tasks\/([^/]+)/.exec(path)?.[1] ?? search.get("task") ?? undefined;
  const activeTask = useEntity<Task>("tasks", activeTaskId);
  const projects = useCollection<Project>("projects", { includeArchived: true }, open);
  const projectId = selectedProject || /^\/projects\/([^/]+)/.exec(path)?.[1] || activeTask.data?.projectId || projects.items[0]?.id || "";
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", preferences.theme === "dark" || (preferences.theme === "system" && media.matches));
    apply(); media.addEventListener("change", apply); return () => media.removeEventListener("change", apply);
  }, [preferences.theme]);
  async function signOut(discardDrafts = false) {
    activeNotes(ownerId).forEach((s) => s.pause());
    setSigningOut(true); setError("");
    try { await Promise.all(activeNotes(ownerId).map((session) => session.flush())); const result = await authClient.signOut(); if (result.error) throw new Error(); if (discardDrafts) discardOwnerDrafts(ownerId); client.clear(); window.location.replace("/sign-in"); }
    catch { activeNotes(ownerId).forEach((s) => s.resume()); setSigningOut(false); setError("Could not sign out. Try again."); }
  }
  const draftRecoveryUnavailable = activeNotes(ownerId).some((session) => session.dirty && !session.getSnapshot().localSaved);
  const navButton = (id: SettingsSection, Icon: typeof Folder) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} className={cn("settings-nav", section === id && "bg-accent font-medium")} onClick={() => setSection(id)}><Icon aria-hidden="true" />{sectionNames[id]}</button>;
  return <>

    {error && <Alert><AlertDescription>{error}</AlertDescription></Alert>}
    <DefaultTaskView.Provider value={preferences.defaultTaskView}><WorkShell settings={() => { setSelectedProject(""); setOpen(true); }} signOut={() => { if (hasOwnerDrafts(ownerId)) setSignOutChoice(true); else void signOut(); }} signingOut={signingOut}>{children}</WorkShell></DefaultTaskView.Provider>
    <Dialog open={signOutChoice} onOpenChange={(next) => { if (!signingOut) setSignOutChoice(next); }}><DialogContent><DialogHeader><DialogTitle>Sign out with local note drafts?</DialogTitle><DialogDescription>{draftRecoveryUnavailable ? "Some edits could not be stored locally. Cancel and copy or save them before signing out, or discard them explicitly." : "Local drafts belong to this browser. Keep them for your next sign-in, or explicitly discard them."}</DialogDescription></DialogHeader>{error && <p role="alert">{error}</p>}<DialogFooter><Button variant="outline" disabled={signingOut} onClick={() => setSignOutChoice(false)}>Cancel</Button><Button variant="outline" disabled={signingOut || draftRecoveryUnavailable} onClick={() => void signOut(false)}>Keep drafts and sign out</Button><Button disabled={signingOut} onClick={() => void signOut(true)}>Discard drafts and sign out</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="settings-dialog flex h-[min(720px,92dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px] sm:flex-row">
      <nav aria-label="Settings sections" className="settings-sidebar"><p className="px-3 py-2 text-xs font-medium text-muted-foreground">Workspace</p><div className="settings-section-links">{navButton("preferences", UserRound)}{navButton("credentials", KeyRound)}{navButton("archived", Archive)}</div><div className="mt-3 p-2"><SelectField label="Project settings" value={projectId} onChange={(e) => setSelectedProject(e.target.value)}><option disabled value="">Select project</option>{projects.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField><LoadMore query={projects} /><QueryError error={projects.error} retry={projects.refetch} /></div>{projectId && <div className="settings-section-links">{navButton("general", Folder)}{navButton("statuses", List)}{navButton("labels", Tags)}{navButton("properties", SlidersHorizontal)}</div>}</nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col"><DialogHeader className="min-h-[56px] justify-center border-b px-6 py-4 pr-12"><DialogTitle>{sectionNames[section]}</DialogTitle><DialogDescription className="sr-only">Manage workspace preferences, scoped access and project configuration.</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{section === "preferences" ? <PreferencesPanel /> : section === "credentials" ? <CredentialsPanel timezone={preferences.timezone} /> : section === "archived" ? <ArchivedWork onNavigate={() => setOpen(false)} /> : projectId ? <ProjectSettings key={`${projectId}-${section}`} projectId={projectId} section={section} /> : <p>Create a project to configure its workflow.</p>}</div></div>
    </DialogContent></Dialog>
  </>;
}
export function WorkspaceAccess({ children, preferences, ownerId }: { children: ReactNode; preferences: Preferences; ownerId: string }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}><NoteEnvironment ownerId={ownerId}><EditorProvider><WorkspaceContent initialPreferences={preferences}>{children}</WorkspaceContent></EditorProvider></NoteEnvironment></QueryClientProvider>;
}
