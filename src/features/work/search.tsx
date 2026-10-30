"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Folder, Hash, ListChecks, ListFilter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCollection } from "./api";
import { taskParams } from "./filter-state";
import { Filters } from "./filters";
import { LoadMore, LoadingRows, QueryError } from "./primitives";
type Hit = { id: string; kind: "project" | "section" | "task"; projectId: string; title: string; reference: string | null; snippet: string; effectiveArchived: boolean };
const hitHref = (hit: Hit) => hit.kind === "project" ? `/projects/${hit.id}` : hit.kind === "section" ? `/projects/${hit.projectId}/sections/${hit.id}` : `/tasks/${hit.id}`;
const highlight = (snippet: string) => snippet.split(/(⟦[^⟧]*⟧)/g).map((part, i) => part.startsWith("⟦") && part.endsWith("⟧") ? <mark key={i}>{part.slice(1, -1)}</mark> : part);
const kinds = [["task", "Tasks"], ["section", "Sections"], ["project", "Projects"]] as const;
export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="search-dialog" showCloseButton={false}><DialogTitle className="sr-only">Search</DialogTitle><DialogDescription className="sr-only">Search titles, descriptions, notes, labels, text properties and task references.</DialogDescription>{open && <SearchPalette close={() => onOpenChange(false)} />}</DialogContent></Dialog>;
}
function SearchPalette({ close }: { close: () => void }) {
  const router = useRouter(); const listId = useId();
  const [text, setText] = useState(""); const [q, setQ] = useState(""); const [active, setActive] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQ(text.trim()); setActive(0); }, 150); return () => clearTimeout(timer); }, [text]);
  const result = useCollection<Hit>("search", { q }, Boolean(q));
  const hits = q ? kinds.flatMap(([kind]) => result.items.filter((hit) => hit.kind === kind)) : [];
  const open = (hit?: Hit) => { if (!hit) return; close(); router.push(hitHref(hit)); };
  useEffect(() => { document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, listId]);
  return <>
    <div className="search-input-row"><Search aria-hidden="true" /><input autoFocus role="combobox" aria-expanded={hits.length > 0} aria-controls={listId} aria-activedescendant={hits.length ? `${listId}-${active}` : undefined} aria-label="Search projects, sections and tasks" placeholder="Search tasks, sections and projects" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (hits.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length); }
      else if (e.key === "Enter") { e.preventDefault(); open(hits[active]); }
    }} /><kbd className="work-kbd">Esc</kbd></div>
    {q && <div className="search-scope"><span className="text-xs text-muted-foreground">Active work in every project</span><Button className="ml-auto" variant="ghost" size="sm" onClick={() => { close(); router.push(`/search?q=${encodeURIComponent(q)}`); }}><ListFilter data-icon="inline-start" />Open in filters</Button></div>}
    <div className="search-results" id={listId} role="listbox" aria-label="Search results">
      <QueryError error={result.error} retry={result.refetch} retained={Boolean(result.data)} />
      {!q ? <p className="search-hint">Search titles, descriptions, notes, labels, text properties and task references.</p> : result.isPending ? <LoadingRows /> : !result.error && hits.length === 0 ? <p className="search-hint">No results for “{q}”. Try another word or open the filters.</p> : kinds.map(([kind, label]) => { const group = hits.filter((hit) => hit.kind === kind); return group.length > 0 && <div key={kind} role="group" aria-label={label}><div className="search-group-label">{label}</div>{group.map((hit) => { const index = hits.indexOf(hit); return <div key={hit.id} id={`${listId}-${index}`} role="option" aria-selected={index === active} className="search-item" onMouseMove={() => setActive(index)} onClick={() => open(hit)}>{kind === "task" ? <ListChecks aria-hidden="true" /> : kind === "section" ? <Hash aria-hidden="true" /> : <Folder aria-hidden="true" />}<div className="min-w-0 flex-1"><div className="truncate">{hit.reference && <span className="work-reference mr-2">{hit.reference}</span>}{hit.title}{hit.effectiveArchived && <span className="text-muted-foreground"> · Archived</span>}</div>{hit.snippet && <div className="search-snippet">{highlight(hit.snippet)}</div>}</div></div>; })}</div>; })}
      {q && <LoadMore query={result} />}
    </div>
    <div className="search-footer"><span><kbd className="work-kbd">↑</kbd><kbd className="work-kbd">↓</kbd>Navigate</span><span><kbd className="work-kbd">↵</kbd>Open</span><span><kbd className="work-kbd">Esc</kbd>Close</span></div>
  </>;
}
export function SearchView() {
  const search = useSearchParams(), router = useRouter(), path = usePathname();
  const [text, setText] = useState(search.get("q") ?? "");
  const result = useCollection<Hit>("search", taskParams(new URLSearchParams(search.toString())), Boolean(search.get("q")));
  return <div className="work-view-scroll"><h1 className="work-title">Search</h1><form className="my-5 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const next = new URLSearchParams(search.toString()); if (text.trim()) next.set("q", text.trim()); else next.delete("q"); router.replace(`${path}?${next}`); }}><Input aria-label="Search projects, sections and tasks" value={text} onChange={(e) => setText(e.target.value)} /><Button>Search</Button><Filters align="start" /></form><QueryError error={result.error} retry={result.refetch} retained={Boolean(result.data)} />{result.isPending && search.get("q") ? <LoadingRows /> : result.items.map((hit) => <article className="definition-row" key={`${hit.kind}:${hit.id}`}><Link className="font-medium hover:underline" href={hitHref(hit)}>{hit.reference ? `${hit.reference}: ` : ""}{hit.title}</Link><p className="text-xs text-muted-foreground">{hit.kind}{hit.effectiveArchived ? " · Archived" : ""}</p><p className="text-sm text-muted-foreground">{highlight(hit.snippet)}</p></article>)}<LoadMore query={result} />{!search.get("q") && <p className="text-muted-foreground">Search titles, descriptions, notes, labels, text properties and task references.</p>}{search.get("q") && !result.isPending && !result.error && result.items.length === 0 && <p>No results. Try another search or change the filters.</p>}</div>;
}
