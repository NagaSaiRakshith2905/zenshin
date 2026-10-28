"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Settings2, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Preferences } from "@/lib/contracts/settings";
import { cn } from "@/lib/utils";
import { settingsRequest } from "./api";
import { authClient } from "./auth-client";
import { CredentialsPanel } from "./credentials";
import { PreferencesPanel } from "./preferences";

function WorkspaceContent({ children, initialPreferences }: { children: ReactNode; initialPreferences: Preferences }) {
  const client = useQueryClient();
  const { data: preferences } = useQuery({ queryKey: ["preferences"], queryFn: () => settingsRequest<Preferences>("preferences"), initialData: initialPreferences });
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"preferences" | "credentials">("preferences");
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", preferences.theme === "dark" || (preferences.theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme]);
  async function signOut() {
    setSigningOut(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      client.clear();
      window.location.replace("/sign-in");
    } catch { setSigningOut(false); setError("Could not sign out. Try again."); }
  }
  return <div className="min-h-dvh bg-sidebar p-2">
    <script dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.toggle('dark',${JSON.stringify(preferences.theme)}==='dark'||(${JSON.stringify(preferences.theme)}==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));` }} />
    <div className="min-h-[calc(100dvh-1rem)] rounded-[14px] border bg-background">
      <header className="flex h-14 items-center gap-3 border-b px-4 sm:px-6"><Logo className="size-6" /><span className="font-medium">Zenshin</span>
        <div className="ml-auto flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="ghost"><Settings2 data-icon="inline-start" />Settings</Button></DialogTrigger>
            <DialogContent className="settings-dialog flex h-[min(620px,90dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[900px] sm:flex-row">
              <nav aria-label="Settings sections" className="flex shrink-0 flex-col gap-1 border-b bg-muted/70 p-3 sm:w-[212px] sm:border-r sm:border-b-0">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground">Workspace</p>
                <div className="flex flex-wrap gap-1 sm:flex-col">
                  <button type="button" aria-current={section === "preferences" ? "page" : undefined} className={cn("settings-nav", section === "preferences" && "bg-accent font-medium")} onClick={() => setSection("preferences")}><UserRound aria-hidden="true" />Preferences</button>
                  <button type="button" aria-current={section === "credentials" ? "page" : undefined} className={cn("settings-nav", section === "credentials" && "bg-accent font-medium")} onClick={() => setSection("credentials")}><KeyRound aria-hidden="true" />Agent credentials</button>
                </div>
              </nav>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <DialogHeader className="min-h-[52px] justify-center border-b px-6 pr-12 py-4"><DialogTitle>{section === "preferences" ? "Preferences" : "Agent credentials"}</DialogTitle><DialogDescription className="sr-only">Manage your workspace preferences and scoped agent access.</DialogDescription></DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{section === "preferences" ? <PreferencesPanel /> : <CredentialsPanel timezone={preferences.timezone} />}</div>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" onClick={() => void signOut()} disabled={signingOut}><LogOut data-icon="inline-start" />{signingOut ? "Signing out…" : "Sign out"}</Button>
        </div>
      </header>
      {error && <Alert><AlertDescription>{error}</AlertDescription></Alert>}
      {children}
    </div>
  </div>;
}

export function WorkspaceAccess({ children, preferences }: { children: ReactNode; preferences: Preferences }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={client}><WorkspaceContent initialPreferences={preferences}>{children}</WorkspaceContent></QueryClientProvider>;
}
