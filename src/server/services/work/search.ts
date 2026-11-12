import "server-only";
import { sql } from "drizzle-orm";
import type { TaskQuery } from "@/lib/contracts/task-query";
import { assertProjectScope, type Actor } from "@/server/auth/access";
import type { DatabaseExecutor } from "@/server/db";
import { invalid, owned } from "./foundation";
import { query } from "./store";
import { listSql, taskBase, taskConditions } from "./task-query";
export type SearchHit = { id: string; kind: "project" | "section" | "task"; projectId: string; title: string; reference: string | null; snippet: string; effectiveArchived: boolean };
export async function searchPage(db: DatabaseExecutor, actor: Actor, input: TaskQuery) {
  if (input.projectId) { const project = await owned(db, actor, "projects", input.projectId); assertProjectScope(actor, actor.ownerId, project.id, "read"); }
  const { condition } = await taskConditions(db, input);
  const term = sql`websearch_to_tsquery('simple',${input.q})`;
  const projects = input.projectId ? [input.projectId] : input.projectIds;
  const sections = input.sectionId ? [input.sectionId] : input.sectionIds;
  const projectScope = projects.length ? sql`p.id::text in (${listSql(projects)})` : sql`true`;
  const archive = input.archiveState ?? (input.includeArchived ? "all" : "active");
  const visible = (expr: import("drizzle-orm").SQL) => archive === "all" ? sql`true` : sql`${expr} = ${archive === "archived"}`;
  const headline = (value: import("drizzle-orm").SQL) => input.q ? sql`ts_headline('simple', ${value}, ${term}, 'StartSel=⟦, StopSel=⟧, MaxWords=24, MinWords=8')` : sql`left(${value},180)`;
  const taskOnly = Boolean(input.categories.length || input.statusIds.length || input.labelIds.length || input.priorities.length || input.propertyFilters.length || input.dueFrom || input.dueTo || input.overdue !== undefined || input.blocked !== undefined || input.readyOnly || input.taskType !== "all" || input.linkedGithub);
  const cte = sql`${taskBase(actor, projects)}, hits as (
    select p.id, 'project'::text as kind, p.id as project_id, p.name as title, null::text as reference, p.archived_at is not null as effective_archived
    from permitted_projects p left join notes n on n.project_id=p.id
    where ${input.entityTypes.includes("project") && !taskOnly && !sections.length ? sql`true` : sql`false`} and ${projectScope} and ${visible(sql`(p.archived_at is not null)`)}
      and ${input.q ? sql`(to_tsvector('simple',p.name || ' ' || p.description) @@ ${term} or to_tsvector('simple',coalesce(n.plain_text,'')) @@ ${term} or p.prefix ilike ${input.q})` : sql`true`}
    union all
    select s.id, 'section', s.project_id, s.name, null, (p.archived_at is not null or s.effective_archived)
    from section_tree s join permitted_projects p on p.id=s.project_id left join notes n on n.section_id=s.id
    where ${input.entityTypes.includes("section") && !taskOnly ? sql`true` : sql`false`} and ${projectScope} and ${visible(sql`(p.archived_at is not null or s.effective_archived)`)}
      and ${sections.length ? input.includeDescendants ? sql`s.ancestor_ids && array[${listSql(sections)}]::uuid[]` : sql`s.id::text in (${listSql(sections)})` : sql`true`}
      and ${input.q ? sql`(to_tsvector('simple',s.name || ' ' || s.description) @@ ${term} or to_tsvector('simple',coalesce(n.plain_text,'')) @@ ${term})` : sql`true`}
    union all
    select t.id, 'task', t.project_id, t.title, t.project_prefix || '-' || t.number, t.effective_archived
    from visible t where ${input.entityTypes.includes("task") ? sql`true` : sql`false`} and ${condition}
  ), ranked as (select *, row_number() over(order by kind, title, id) as ordinal from hits)`;
  let cursorKind: string | undefined, cursorId: string | undefined;
  if (input.cursor) {
    [cursorKind, cursorId] = input.cursor.split(":");
    if (!cursorId || !["project", "section", "task"].includes(cursorKind)) invalid("Use the cursor returned by search.");
    const [cursor] = await query(db, sql`${cte} select id from ranked where kind=${cursorKind} and id=${cursorId}::uuid`);
    if (!cursor) invalid("This cursor is no longer available. Restart the search.");
  }
  // Materialize the bounded page before loading text for note/property snippets.
  // Counts/cursor validation reuse lightweight hits without rendering every match.
  const source = sql`case r.kind
    when 'project' then (select p.description || ' ' || coalesce(n.plain_text,'') from projects p left join notes n on n.project_id=p.id where p.id=r.id and p.owner_id=${actor.ownerId})
    when 'section' then (select s.description || ' ' || coalesce(n.plain_text,'') from sections s left join notes n on n.section_id=s.id where s.id=r.id and s.owner_id=${actor.ownerId})
    else (select t.description || ' ' || coalesce(n.plain_text,'') || ' ' || coalesce((select string_agg(v.value_text,' ') from task_property_values v join property_definitions d on d.id=v.definition_id where v.task_id=t.id and d.type='text'),'') from tasks t left join notes n on n.task_id=t.id where t.id=r.id and t.owner_id=${actor.ownerId}) end`;
  const result = await query<SearchHit>(db, sql`${cte}, page as materialized (select * from ranked where ordinal > ${cursorId ? sql`(select ordinal from ranked where kind=${cursorKind} and id=${cursorId}::uuid)` : sql`0`} order by ordinal limit ${input.limit + 1}) select r.id,r.kind,r.project_id,r.title,r.reference,${headline(source)} as snippet,r.effective_archived from page r order by r.ordinal`);
  const [count] = await query<{ total: number }>(db, sql`${cte} select count(*)::int as total from hits`);
  const items = result.slice(0, input.limit), last = items.at(-1);
  return { items, total: count.total, hasMore: result.length > input.limit, nextCursor: result.length > input.limit && last ? `${last.kind}:${last.id}` : null };
}
