import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { normalizeName } from "@/lib/contracts/work";
import type { TaskQuery } from "@/lib/contracts/task-query";
import { assertProjectScope, type Actor } from "@/server/auth/access";
import type { DatabaseExecutor } from "@/server/db";
import { DomainError, invalid } from "./foundation";
import { query, rows } from "./store";
export const listSql = (values: readonly string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);
const conjunction = (values: SQL[]) => sql.join(values.map((v) => sql`(${v})`), sql` and `);
const literalLike = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
export function allowedProjects(actor: Actor) {
  if (actor.kind !== "human" && !actor.scopes.includes("read")) assertProjectScope(actor, actor.ownerId, "", "read");
  return sql`p.owner_id = ${actor.ownerId} and ${actor.kind === "human" ? sql`true` : actor.projectIds.length ? sql`p.id::text in (${listSql(actor.projectIds)})` : sql`false`}`;
}
export function taskBase(actor: Actor, projectIds: readonly string[] = []) {
  const projectScope = projectIds.length ? sql`and p.id in (${sql.join(projectIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  return sql`with recursive permitted_projects as (select p.* from projects p where ${allowedProjects(actor)} ${projectScope}), section_tree as (
    select s.*, s.archived_at is not null as effective_archived, array[s.id] as ancestor_ids from sections s join permitted_projects p on p.id=s.project_id where s.parent_section_id is null
    union all select s.*, (s.archived_at is not null or parent.effective_archived), parent.ancestor_ids || s.id from sections s join section_tree parent on parent.id=s.parent_section_id
  ), base as (
    select t.*, p.prefix as project_prefix, p.name as project_name, st.category, st.name as status_name,
      (p.archived_at is not null or t.archived_at is not null or coalesce(s.effective_archived,false) or pt.archived_at is not null) as effective_archived,
      st.category not in ('done','canceled') and t.due_date < (now() at time zone coalesce(pref.timezone,'Asia/Kolkata'))::date as date_overdue,
      st.category not in ('done','canceled') and (t.manual_blocked_reason is not null or exists (
        select 1 from task_dependencies d join tasks pre on pre.id=d.prerequisite_task_id join task_statuses ps on ps.id=pre.status_id
        left join section_tree pre_section on pre_section.id=pre.section_id left join tasks pre_parent on pre_parent.id=pre.parent_task_id
        where d.task_id=t.id and (ps.category <> 'done' or pre.archived_at is not null or p.archived_at is not null or coalesce(pre_section.effective_archived,false) or pre_parent.archived_at is not null)
      )) as blocked,
      coalesce(s.ancestor_ids,array[]::uuid[]) as section_ancestors,
      exists(select 1 from tasks child where child.parent_task_id=t.id) as has_children
    from tasks t join permitted_projects p on p.id=t.project_id join task_statuses st on st.id=t.status_id
    left join section_tree s on s.id=t.section_id left join tasks pt on pt.id=t.parent_task_id left join user_preferences pref on pref.user_id=t.owner_id
  ), visible as (select *, coalesce(date_overdue,false) and not effective_archived as overdue from base)`;
}
export function taskSearch(q: string) {
  if (!q) return sql`true`;
  const term = sql`websearch_to_tsquery('simple', ${q})`;
  return sql`(to_tsvector('simple', t.title || ' ' || t.description) @@ ${term}
    or upper(t.project_prefix || '-' || t.number) = ${q.toUpperCase()}
    or exists(select 1 from notes n where n.task_id=t.id and to_tsvector('simple',n.plain_text) @@ ${term})
    or exists(select 1 from task_property_values pv join property_definitions pd on pd.id=pv.definition_id where pv.task_id=t.id and pd.type='text' and to_tsvector('simple',coalesce(pv.value_text,'')) @@ ${term})
    or exists(select 1 from task_labels tl join labels l on l.id=tl.label_id where tl.task_id=t.id and l.normalized_name like ${literalLike(normalizeName(q))}))`;
}
export async function taskConditions(db: DatabaseExecutor, input: TaskQuery, myWork = false) {
  const terms: SQL[] = [];
  const projects = input.projectId ? [input.projectId] : input.projectIds;
  if (projects.length) terms.push(sql`t.project_id::text in (${listSql(projects)})`);
  const sections = input.sectionId ? [input.sectionId] : input.sectionIds;
  if (sections.length) terms.push(input.includeDescendants ? sql`t.section_ancestors && array[${listSql(sections)}]::uuid[]` : sql`t.section_id::text in (${listSql(sections)})`);
  if (input.parentTaskId) terms.push(sql`t.parent_task_id = ${input.parentTaskId}`);
  const archive = myWork ? "active" : input.archiveState ?? (input.includeArchived ? "all" : "active");
  if (archive !== "all") terms.push(sql`t.effective_archived = ${archive === "archived"}`);
  for (const [values, column] of [[input.categories, sql`t.category::text`], [input.statusIds, sql`t.status_id::text`], [input.labelIds, null], [input.priorities, sql`t.priority::text`]] as const) {
    if (values.length) terms.push(column ? sql`${column} in (${listSql(values)})` : sql`exists(select 1 from task_labels tl where tl.task_id=t.id and tl.label_id::text in (${listSql(values)}))`);
  }
  if (input.dueFrom) terms.push(sql`t.due_date >= ${input.dueFrom}`);
  if (input.dueTo) terms.push(sql`t.due_date <= ${input.dueTo}`);
  if (input.overdue !== undefined) terms.push(sql`t.overdue = ${input.overdue}`);
  if (input.blocked !== undefined) terms.push(sql`t.blocked = ${input.blocked}`);
  if (input.readyOnly) terms.push(sql`t.category='ready' and not t.blocked`);
  if (input.excludeSubtasks || input.taskType === "parent" || input.taskType === "standalone") terms.push(sql`t.parent_task_id is null`);
  if (input.taskType === "subtask") terms.push(sql`t.parent_task_id is not null`);
  if (input.taskType === "parent") terms.push(sql`t.has_children`);
  if (input.taskType === "standalone") terms.push(sql`not t.has_children`);
  if (input.linkedGithub) {
    const linked = sql`exists(select 1 from task_github_links gl join github_items gi on gi.id=gl.github_item_id where gl.task_id=t.id ${["issue", "pr"].includes(input.linkedGithub) ? sql`and gi.type = ${input.linkedGithub}` : sql``})`;
    terms.push(input.linkedGithub === "none" ? sql`not ${linked}` : linked);
  }
  terms.push(taskSearch(input.q));
  if (myWork) terms.push(sql`t.category not in ('done','canceled') and (t.overdue or t.category in ('in_progress','in_review','ready'))`);
  const definitions = input.projectId && (input.propertyFilters.length || input.sort === "property") ? await rows(db, "property_definitions", sql`project_id = ${input.projectId}`) : [];
  const options = input.projectId && input.propertyFilters.some((f) => f.op === "options") ? await rows(db, "property_options", sql`project_id = ${input.projectId}`) : [];
  for (const filter of input.propertyFilters) {
    const definition = definitions.find((d) => d.id === filter.definitionId);
    if (!definition) invalid("Choose a property defined in this project.");
    const scalar = sql`select 1 from task_property_values v where v.task_id=t.id and v.definition_id=${definition.id}`;
    const multi = sql`select 1 from task_property_option_values v where v.task_id=t.id and v.definition_id=${definition.id}`;
    if (filter.op === "empty" || filter.op === "not_empty") {
      const exists = sql`(exists(${scalar}) or exists(${multi}))`;
      terms.push(filter.op === "empty" ? sql`not ${exists}` : exists); continue;
    }
    if (filter.op === "options") {
      if (!["select", "multi_select"].includes(definition.type) || filter.value.some((id) => !options.some((o) => o.id === id && o.definitionId === definition.id))) invalid("Choose valid options for this select property.");
      terms.push(sql`(exists(${scalar} and v.option_id::text in (${listSql(filter.value)})) or exists(${multi} and v.option_id::text in (${listSql(filter.value)})))`); continue;
    }
    let predicate: SQL;
    if (filter.op === "contains" && ["text", "url"].includes(definition.type)) predicate = sql`v.value_text ilike ${literalLike(filter.value)}`;
    else if (filter.op === "checked" && definition.type === "checkbox") predicate = sql`v.value_bool = ${filter.value}`;
    else if (filter.op === "number_range" && definition.type === "number") predicate = conjunction([...(filter.min === undefined ? [] : [sql`v.value_number >= ${filter.min}`]), ...(filter.max === undefined ? [] : [sql`v.value_number <= ${filter.max}`])]);
    else if (filter.op === "date_range" && definition.type === "date") predicate = conjunction([...(filter.min === undefined ? [] : [sql`v.value_date >= ${filter.min}`]), ...(filter.max === undefined ? [] : [sql`v.value_date <= ${filter.max}`])]);
    else invalid("The filter does not match the property type.");
    terms.push(sql`exists(${scalar} and ${predicate})`);
  }
  let order: SQL = sql`t.position asc`;
  if (input.sort === "updated") order = sql`t.updated_at desc`;
  if (input.sort === "due_date") order = sql`t.due_date ${input.sortDirection === "desc" ? sql`desc` : sql`asc`} nulls last`;
  if (input.sort === "priority") order = sql`case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end asc`;
  if (input.sort === "property") {
    const definition = definitions.find((d) => d.id === input.sortPropertyId);
    if (!definition || !["number", "date", "select"].includes(definition.type)) invalid("Sort by a Number, Date or Select property in this project.");
    const value = definition.type === "number" ? sql`v.value_number` : definition.type === "date" ? sql`v.value_date` : sql`(select o.position from property_options o where o.id=v.option_id)`;
    order = sql`(select ${value} from task_property_values v where v.task_id=t.id and v.definition_id=${definition.id}) ${input.sortDirection === "desc" ? sql`desc` : sql`asc`} nulls last`;
  }
  if (myWork) order = sql`case when t.overdue then 0 when t.category='in_progress' then 1 when t.category='in_review' then 2 else 3 end, ${order}`;
  return { condition: conjunction(terms), order: sql`${order}, t.project_prefix asc, t.number asc, t.id asc` };
}
export async function taskPage(db: DatabaseExecutor, actor: Actor, input: TaskQuery, myWork = false) {
  if (input.cursor?.includes(":")) invalid("Use a task-list cursor for this list.");
  // Validate property metadata only after authorization for the chosen project.
  if (input.projectId) {
    const permitted = await query<{ id: string }>(db, sql`select p.id from projects p where p.id=${input.projectId} and ${allowedProjects(actor)}`);
    if (!permitted.length) throw new DomainError("not_found", "Project was not found.");
  }
  const { condition, order } = await taskConditions(db, input, myWork);
  const cte = sql`${taskBase(actor, input.projectId ? [input.projectId] : input.projectIds)}, matching as (select * from visible t where ${condition}), ranked as (select t.*, row_number() over(order by ${order}) as ordinal from matching t)`;
  if (input.cursor) { const [cursor] = await query<{ id: string }>(db, sql`${cte} select id from ranked where id=${input.cursor}`); if (!cursor) invalid("This cursor is no longer available. Restart the list."); }
  const items = await query<{ id: string; projectId: string }>(db, sql`${cte} select * from ranked where ordinal > ${input.cursor ? sql`(select ordinal from ranked where id=${input.cursor})` : sql`0`} order by ordinal limit ${input.limit + 1}`);
  const [count] = await query<{ total: number }>(db, sql`${cte} select count(*)::int as total from matching`);
  const groups = myWork ? await query<{ name: string; count: number }>(db, sql`${cte} select case when overdue then 'overdue' else category::text end as name, count(*)::int as count from matching group by 1`) : [];
  const statuses = !myWork ? await query<{ id: string; count: number }>(db, sql`${cte} select status_id as id, count(*)::int as count from matching group by status_id`) : [];
  const selected = items.slice(0, input.limit);
  return { items: selected, total: count.total, nextCursor: items.length > input.limit ? selected.at(-1)!.id : null, hasMore: items.length > input.limit, ...(myWork ? { groupCounts: Object.fromEntries(groups.map((g) => [g.name, g.count])) } : { statusCounts: Object.fromEntries(statuses.map((s) => [s.id, s.count])) }) };
}
