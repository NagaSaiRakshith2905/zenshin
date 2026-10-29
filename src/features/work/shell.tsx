"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, Inbox, LogOut, PanelLeft, Plus, Settings2, Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCollection, useEntity } from "./api";
import { NewTaskButton, useEditor } from "./editors";
import { SearchDialog } from "./search";
import { isEditing } from "./model";
import { LoadMore, LoadingRows, QueryError } from "./primitives";
import type { Project, Section, Task } from "./types";
export function WorkShell({ children, settings, signOut, signingOut }: { children: ReactNode; settings: () => void; signOut: () => void; signingOut: boolean }) {
  const [mobile, setMobile] = useState(false); const [collapsed, setCollapsed] = useState(false); const [searching, setSearching] = useState(false);
  const path = usePathname(); const edit = useEditor();
  const projectId = /^\/projects\/([^/]+)/.exec(path)?.[1];
  const sectionId = /\/sections\/([^/]+)/.exec(path)?.[1];
  const taskId = /^\/tasks\/([^/]+)/.exec(path)?.[1];
  const project = useEntity<Project>("projects", projectId); const section = useEntity<Section>("sections", sectionId); const task = useEntity<Task>("tasks", taskId);
  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Element;
      document.querySelectorAll<HTMLDetailsElement>("details.work-menu[open]").forEach((menu) => { if (!menu.contains(target) || target.closest("button,a")) menu.open = false; });
    };
    const escapeMenu = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const menu = (event.target as Element).closest<HTMLDetailsElement>("details.work-menu[open]") ?? document.querySelector<HTMLDetailsElement>("details.work-menu[open]");
      if (menu) { menu.open = false; menu.querySelector<HTMLElement>("summary")?.focus(); event.preventDefault(); event.stopImmediatePropagation(); }
    };
    document.addEventListener("click", closeMenus);
    document.addEventListener("keydown", escapeMenu, true);
    return () => { document.removeEventListener("click", closeMenus); document.removeEventListener("keydown", escapeMenu, true); };
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearching((open) => !open); return; } if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditing(e.target)) { e.preventDefault(); edit({ kind: "task", projectId: projectId ?? task.data?.projectId, sectionId }); } };
    document.addEventListener("keydown", listener); return () => document.removeEventListener("keydown", listener);
  }, [edit, projectId, sectionId, task.data?.projectId]);
  const navigation = <Navigation search={() => { setMobile(false); setSearching(true); }} settings={() => { setMobile(false); settings(); }} signOut={signOut} signingOut={signingOut} navigate={() => setMobile(false)} />;
  return <div className={cn("workspace-frame", collapsed && "sidebar-collapsed")}><a className="work-skip" href="#main-content">Skip to content</a><aside className="workspace-sidebar" aria-label="Primary navigation">{navigation}</aside>
    <div className="workspace-inset"><header className="workspace-header"><Button variant="ghost" size="icon-sm" aria-label="Toggle navigation" onClick={() => { if (window.matchMedia("(max-width: 1023px)").matches) setMobile(true); else setCollapsed(!collapsed); }}><PanelLeft /></Button><span className="workspace-header-sep" aria-hidden="true" /><nav aria-label="Breadcrumb" className="work-breadcrumb"><Link href="/">My work</Link>{projectId && <Link href={`/projects/${projectId}`}>{project.data?.name ?? "Project"}</Link>}{sectionId && <>{section.data?.breadcrumbs.map((ancestor) => <Link key={ancestor.id} href={`/projects/${projectId}/sections/${ancestor.id}`}>{ancestor.name}</Link>)}<span>{section.data?.name ?? "Section"}</span></>}{path.endsWith("/tasks") && projectId && <span>All tasks</span>}{taskId && <span>{task.data?.reference ?? "Task"}</span>}</nav><button type="button" className="work-search-trigger" aria-keyshortcuts="Meta+K Control+K" onClick={() => setSearching(true)}><Search aria-hidden="true" />Search tasks<kbd className="work-kbd">⌘K</kbd></button><div><NewTaskButton projectId={projectId ?? task.data?.projectId} sectionId={sectionId} /></div></header><main id="main-content" tabIndex={-1} className="workspace-main">{children}</main></div>
    <Dialog open={mobile} onOpenChange={setMobile}><DialogContent className="mobile-navigation"><DialogHeader className="sr-only"><DialogTitle>Workspace navigation</DialogTitle><DialogDescription>Navigate your projects, sections and settings.</DialogDescription></DialogHeader>{navigation}</DialogContent></Dialog>
    <SearchDialog open={searching} onOpenChange={setSearching} />
  </div>;
}
function Navigation({ search, settings, signOut, signingOut, navigate }: { search: () => void; settings: () => void; signOut: () => void; signingOut: boolean; navigate: () => void }) {
  const projects = useCollection<Project>("projects"); const edit = useEditor(); const path = usePathname();
  return <div className="work-navigation"><Link className="work-brand" href="/" onClick={navigate}><Logo className="size-8" /><span><strong>Zenshin</strong><small>Personal workspace</small></span></Link><nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Projects and work"><Link href="/" onClick={navigate} className={cn("work-nav-link", path === "/" && "is-current")} aria-current={path === "/" ? "page" : undefined}><Inbox aria-hidden="true" />My work</Link><button type="button" onClick={search} className="work-nav-link" aria-keyshortcuts="Meta+K Control+K"><Search aria-hidden="true" />Search<kbd className="work-kbd">⌘K</kbd></button><div className="work-nav-label"><span>Projects</span><Button variant="ghost" size="icon-sm" aria-label="Create project" onClick={() => { navigate(); edit({ kind: "project" }); }}><Plus /></Button></div><QueryError error={projects.error} retry={projects.refetch} retained={Boolean(projects.data)} />{projects.isPending ? <LoadingRows /> : projects.items.map((p) => <ProjectNavigation key={p.id} project={p} navigate={navigate} />)}{!projects.isPending && !projects.error && projects.items.length === 0 && <Button className="mx-3" variant="outline" size="sm" onClick={() => { navigate(); edit({ kind: "project" }); }}>Create your first project</Button>}<LoadMore query={projects} /></nav><div className="work-navigation-footer"><button type="button" className="work-nav-link" onClick={settings}><Settings2 aria-hidden="true" />Settings</button><div className="flex items-center gap-2 p-2"><span className="work-avatar" aria-hidden="true">O</span><div className="min-w-0 flex-1"><div className="text-[13px] leading-[18px] font-medium">Owner</div><div className="text-xs text-muted-foreground">Signed in with GitHub</div></div><Button variant="ghost" size="icon-sm" aria-label={signingOut ? "Signing out…" : "Sign out"} title="Sign out" disabled={signingOut} onClick={signOut}><LogOut /></Button></div></div></div>;
}
function ProjectNavigation({ project, navigate }: { project: Project; navigate: () => void }) {
  const path = usePathname(); const [expanded, setExpanded] = useState(path.includes(project.id));
  const sections = useCollection<Section>("sections", { projectId: project.id }, expanded);
  const active = path.includes(project.id);
  const link = (href: string, label: string) => <Link href={href} onClick={navigate} className={cn("work-nav-link", path === href && "is-current")} aria-current={path === href ? "page" : undefined}>{label}</Link>;
  return <div><button className={cn("work-nav-link w-full", active && "font-medium")} type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><Folder aria-hidden="true" /><span className="truncate">{project.name}</span>{expanded ? <ChevronDown aria-hidden="true" className="ml-auto" /> : <ChevronRight aria-hidden="true" className="ml-auto" />}</button>{expanded && <div className="work-nav-nested">{link(`/projects/${project.id}`, "Overview")}{link(`/projects/${project.id}/tasks`, "All tasks")}<QueryError error={sections.error} retry={sections.refetch} retained={Boolean(sections.data)} />{sections.isPending ? <LoadingRows /> : <SectionNavigation items={sections.items} projectId={project.id} parentId={null} navigate={navigate} />}<LoadMore query={sections} /></div>}</div>;
}
function SectionNavigation({ items, parentId, projectId, navigate }: { items: Section[]; parentId: string | null; projectId: string; navigate: () => void }) {
  const path = usePathname();
  return <>{items.filter((s) => s.parentSectionId === parentId || (parentId === null && s.parentSectionId && !items.some((p) => p.id === s.parentSectionId))).map((s) => { const href = `/projects/${projectId}/sections/${s.id}`; const children = items.some((c) => c.parentSectionId === s.id); return <div key={s.id}>{children ? <details open={path === href || items.some((c) => c.breadcrumbs.some((b) => b.id === s.id) && path.endsWith(c.id))}><summary className="work-nav-disclosure">{s.name}</summary><div className="work-nav-nested"><Link className={cn("work-nav-link", path === href && "is-current")} href={href} onClick={navigate}>Section overview</Link><SectionNavigation items={items} parentId={s.id} projectId={projectId} navigate={navigate} /></div></details> : <Link className={cn("work-nav-link", path === href && "is-current")} aria-current={path === href ? "page" : undefined} href={href} onClick={navigate}>{s.name}</Link>}</div>; })}</>;
}
