"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { activeNotes } from "./drafts";
const NoteOwner = createContext("");
export const useNoteOwner = () => useContext(NoteOwner);
export function NoteEnvironment({ ownerId, children }: { ownerId: string; children: ReactNode }) {
  const router = useRouter(); const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (activeNotes(ownerId).some((s) => s.dirty)) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.href === location.href || !activeNotes(ownerId).some((s) => s.dirty)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void (async () => {
        for (const session of activeNotes(ownerId)) { await session.flush(); if (session.getSnapshot().status === "unsaved") await session.flush(); }
        if (activeNotes(ownerId).some((s) => s.dirty)) setLeaving(url.pathname + url.search + url.hash);
        else router.push(url.pathname + url.search + url.hash);
      })();
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [ownerId, router]);
  const local = activeNotes(ownerId).filter((s) => s.dirty).every((s) => s.getSnapshot().localSaved);
  return <NoteOwner.Provider value={ownerId}>{children}<Dialog open={Boolean(leaving)} onOpenChange={(open) => { if (!open) setLeaving(null); }}><DialogContent><DialogHeader><DialogTitle>Note changes are not saved yet</DialogTitle><DialogDescription>{local ? "Your attempted edits are stored in this browser. Reopen the note to retry saving them." : "Some edits could not be stored locally. Stay here to copy or save them before leaving."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setLeaving(null)}>Stay here</Button><Button onClick={() => { if (leaving) router.push(leaving); setLeaving(null); }}>{local ? "Leave with local draft" : "Leave without recovery"}</Button></DialogFooter></DialogContent></Dialog></NoteOwner.Provider>;
}
