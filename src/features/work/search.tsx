"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCollection } from "./api";
import { taskParams } from "./filter-state";
import { Filters } from "./filters";
import { LoadMore, LoadingRows, QueryError } from "./primitives";
type Hit = { id: string; kind: "project" | "section" | "task"; projectId: string; title: string; reference: string | null; snippet: string; effectiveArchived: boolean };
export function SearchView() {
  const search = useSearchParams(), router = useRouter(), path = usePathname();
  const [text, setText] = useState(search.get("q") ?? "");
  const result = useCollection<Hit>("search", taskParams(new URLSearchParams(search.toString())), Boolean(search.get("q")));
  return <div className="work-view-scroll"><h1 className="work-title">Search</h1><form className="my-5 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const next = new URLSearchParams(search.toString()); if (text.trim()) next.set("q", text.trim()); else next.delete("q"); router.replace(`${path}?${next}`); }}><Input aria-label="Search projects, sections and tasks" value={text} onChange={(e) => setText(e.target.value)} /><Button>Search</Button><Filters /></form><QueryError error={result.error} retry={result.refetch} retained={Boolean(result.data)} />{result.isPending && search.get("q") ? <LoadingRows /> : result.items.map((hit) => <article className="definition-row" key={`${hit.kind}:${hit.id}`}><Link className="font-medium hover:underline" href={hit.kind === "project" ? `/projects/${hit.id}` : hit.kind === "section" ? `/projects/${hit.projectId}/sections/${hit.id}` : `/tasks/${hit.id}`}>{hit.reference ? `${hit.reference}: ` : ""}{hit.title}</Link><p className="text-xs text-muted-foreground">{hit.kind}{hit.effectiveArchived ? " · Archived" : ""}</p><p className="text-sm text-muted-foreground">{hit.snippet.split(/(⟦[^⟧]*⟧)/g).map((part, i) => part.startsWith("⟦") && part.endsWith("⟧") ? <mark key={i}>{part.slice(1, -1)}</mark> : part)}</p></article>)}<LoadMore query={result} />{!search.get("q") && <p className="text-muted-foreground">Search titles, descriptions, notes, labels, text properties and task references.</p>}{search.get("q") && !result.isPending && !result.error && result.items.length === 0 && <p>No results. Try another search or change the filters.</p>}</div>;
}
