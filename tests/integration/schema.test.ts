import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureData, insertFixtureData } from "../../src/server/db/fixtures";
import { createTestDatabase } from "../support/postgres";

describe("committed PostgreSQL schema", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  const fixture = createFixtureData("development", "schema");
  beforeAll(async () => {
    database = await createTestDatabase();
    await insertFixtureData(database.db, fixture);
    await database.pool.query("INSERT INTO \"user\"(id,name,email) VALUES('foreign-owner','Other','other@example.invalid')");
  }, 30_000);
  afterAll(async () => { await database?.dispose(); });

  const reject = async (query: string, params: unknown[], code: string) => {
    await expect(database.pool.query(query, params)).rejects.toMatchObject({ code });
  };
  const task = () => fixture.tasks[3];
  const otherProject = () => fixture.projects[1];

  it("records migrations and supports the forward-upgrade runner without replaying data", async () => {
    const before = await database.pool.query("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations");
    await database.migrateLatest();
    expect((await database.pool.query("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations")).rows).toEqual(before.rows);
    expect((await database.pool.query("SELECT count(*)::int AS count FROM tasks")).rows[0].count).toBe(32);
  });

  it("rejects a foreign-project status and parent section", async () => {
    await reject("UPDATE tasks SET status_id = $1 WHERE id = $2", [fixture.statuses[6].id, task().id], "23503");
    await reject("UPDATE sections SET parent_section_id = $1 WHERE id = $2", [fixture.sections[7].id, fixture.sections[0].id], "23503");
  });

  it("rejects duplicate prefixes/numbers and normalized label/definition/option names", async () => {
    await reject("UPDATE projects SET prefix = $1 WHERE id = $2", [fixture.projects[0].prefix, otherProject().id], "23505");
    await reject("UPDATE tasks SET number = 1 WHERE id = $1", [task().id], "23505");
    const label = fixture.labels[0];
    await reject("INSERT INTO labels(owner_id, project_id, name, normalized_name, color) VALUES($1,$2,'FRONTEND','frontend','#71717A')", [label.ownerId, label.projectId], "23505");
    const definition = fixture.definitions[0];
    await reject("INSERT INTO property_definitions(owner_id, project_id, name, normalized_name, type) VALUES($1,$2,'Duplicate',$3,'text')", [definition.ownerId, definition.projectId, definition.normalizedName], "23505");
    const option = fixture.options[0];
    await reject("INSERT INTO property_options(owner_id, project_id, definition_id, name, normalized_name) VALUES($1,$2,$3,'Duplicate',$4)", [option.ownerId, option.projectId, option.definitionId, option.normalizedName], "23505");
  });

  it("rejects cross-project dependency/label/property references and wrong-definition options", async () => {
    const t = task();
    await reject("INSERT INTO task_dependencies(owner_id,project_id,task_id,prerequisite_task_id) VALUES($1,$2,$3,$4)", [t.ownerId, t.projectId, t.id, fixture.tasks[16].id], "23503");
    await reject("INSERT INTO task_labels(owner_id,project_id,task_id,label_id) VALUES($1,$2,$3,$4)", [t.ownerId, t.projectId, t.id, fixture.labels[1].id], "23503");
    await reject("INSERT INTO task_property_values(owner_id,project_id,task_id,definition_id,value_text) VALUES($1,$2,$3,$4,'bad')", [t.ownerId, t.projectId, t.id, fixture.definitions[7].id], "23503");
    await reject("UPDATE task_property_values SET option_id = $1 WHERE task_id = $2 AND option_id IS NOT NULL", [fixture.options[2].id, t.id], "23503");
    await reject("UPDATE task_property_values SET value_bool = true WHERE task_id = $1 AND value_text IS NOT NULL", [t.id], "23514");
  });

  it("rejects self/duplicate dependencies, duplicate label pairs, and a second/default non-Backlog status", async () => {
    const t = task();
    await reject("INSERT INTO task_dependencies(owner_id,project_id,task_id,prerequisite_task_id) VALUES($1,$2,$3,$3)", [t.ownerId, t.projectId, t.id], "23514");
    const edge = fixture.dependencies[0];
    await reject("INSERT INTO task_dependencies(owner_id,project_id,task_id,prerequisite_task_id) VALUES($1,$2,$3,$4)", [edge.ownerId, edge.projectId, edge.taskId, edge.prerequisiteTaskId], "23505");
    const label = fixture.taskLabels[0];
    await reject("INSERT INTO task_labels(owner_id,project_id,task_id,label_id) VALUES($1,$2,$3,$4)", [label.ownerId, label.projectId, label.taskId, label.labelId], "23505");
    await reject("UPDATE task_statuses SET is_default = true WHERE id = $1", [fixture.statuses[1].id], "23514");
    await reject("INSERT INTO task_statuses(owner_id,project_id,name,category,is_default) VALUES($1,$2,'Other backlog','backlog',true)", [t.ownerId, t.projectId], "23505");
  });

  it("requires one note/attachment target, one note per target, and the target owner", async () => {
    const t = task();
    await reject("INSERT INTO notes(owner_id,content) VALUES($1,'{}')", [t.ownerId], "23514");
    await reject("INSERT INTO notes(owner_id,project_id,task_id,content) VALUES($1,$2,$3,'{}')", [t.ownerId, t.projectId, t.id], "23514");
    await reject("INSERT INTO notes(owner_id,task_id,content) VALUES($1,$2,'{}')", [t.ownerId, t.id], "23505");
    await reject("INSERT INTO notes(owner_id,task_id,content) VALUES('foreign-owner',$1,'{}')", [fixture.tasks[4].id], "23503");
    await reject("INSERT INTO attachments(owner_id,original_name,declared_media_type,declared_size,object_key,upload_expires_at,actor_kind) VALUES($1,'a.txt','text/plain',1,$2,now(),'system')", [t.ownerId, randomUUID()], "23514");
  });

  it("keeps provenance after unlink, drops it on task deletion, and retains queued object cleanup", async () => {
    const t = fixture.tasks[14];
    const installationId = randomUUID(), repositoryId = randomUUID(), itemId = randomUUID();
    await database.pool.query("INSERT INTO github_installations(id,owner_id,installation_id,account_id,account_name) VALUES($1,$2,1,1,'fixture')", [installationId, t.ownerId]);
    await database.pool.query("INSERT INTO github_repositories(id,owner_id,installation_id,github_repository_id,name,owner_name) VALUES($1,$2,$3,1,'fixture','fixture')", [repositoryId, t.ownerId, installationId]);
    await database.pool.query("INSERT INTO github_items(id,owner_id,repository_id,github_item_id,type,number,url,title,state,remote_created_at,remote_updated_at) VALUES($1,$2,$3,1,'issue',1,'https://example.invalid/1','Issue','open',now(),now())", [itemId, t.ownerId, repositoryId]);
    await database.pool.query("INSERT INTO task_github_links(owner_id,project_id,task_id,repository_id,github_item_id,origin) VALUES($1,$2,$3,$4,$5,'import')", [t.ownerId, t.projectId, t.id, repositoryId, itemId]);
    await database.pool.query("INSERT INTO github_issue_imports(owner_id,project_id,task_id,github_item_id) VALUES($1,$2,$3,$4)", [t.ownerId, t.projectId, t.id, itemId]);
    await database.pool.query("DELETE FROM task_github_links WHERE task_id=$1", [t.id]);
    expect((await database.pool.query("SELECT * FROM github_issue_imports WHERE task_id=$1", [t.id])).rowCount).toBe(1);
    // The future deletion service enqueues this in the same transaction before deleting targets.
    await database.pool.query("INSERT INTO attachments(owner_id,task_id,original_name,declared_media_type,declared_size,object_key,upload_expires_at,actor_kind) VALUES($1,$2,'fixture.txt','text/plain',1,'fixture/deleted-file',now(),'system')", [t.ownerId, t.id]);
    await database.pool.query("INSERT INTO background_jobs(owner_id,kind,deduplication_key,payload) VALUES($1,'object.delete','fixture-cleanup','{\"object_key\":\"fixture/deleted-file\"}')", [t.ownerId]);
    await database.pool.query("DELETE FROM tasks WHERE id=$1", [t.id]);
    expect((await database.pool.query("SELECT * FROM github_issue_imports WHERE task_id=$1", [t.id])).rowCount).toBe(0);
    expect((await database.pool.query("SELECT payload FROM background_jobs WHERE deduplication_key='fixture-cleanup'")).rows[0].payload.object_key).toBe("fixture/deleted-file");
    expect((await database.pool.query("SELECT * FROM attachments WHERE task_id=$1", [t.id])).rowCount).toBe(0);
    expect((await database.pool.query("SELECT * FROM activities WHERE task_id=$1", [t.id])).rowCount).toBe(1);
  });

  it("rejects cross-owner credential grants and incomplete leases", async () => {
    const credentialId = randomUUID();
    await database.pool.query("INSERT INTO agent_credentials(id,owner_id,display_name,scopes) VALUES($1,'foreign-owner','Other',ARRAY['read'])", [credentialId]);
    await reject("INSERT INTO agent_project_grants(owner_id,credential_id,project_id) VALUES($1,$2,$3)", [fixture.owner.id, credentialId, task().projectId], "23503");
    await reject("INSERT INTO background_jobs(owner_id,kind,deduplication_key,payload,state) VALUES($1,'test','bad-lease','{}','running')", [fixture.owner.id], "23514");
  });

  it("deduplicates jobs and actor-bound idempotency results", async () => {
    const owner = fixture.owner.id;
    await database.pool.query("INSERT INTO background_jobs(owner_id,kind,deduplication_key,payload) VALUES($1,'test','dedupe','{}')", [owner]);
    await reject("INSERT INTO background_jobs(owner_id,kind,deduplication_key,payload) VALUES($1,'test','dedupe','{}')", [owner], "23505");
    const statement = "INSERT INTO idempotency_records(owner_id,actor_kind,actor_user_id,actor_identity,operation,key,request_fingerprint,result) VALUES($1,'human',$1,$1,'task.create','key','fingerprint','{}')";
    await database.pool.query(statement, [owner]);
    await reject(statement, [owner], "23505");
  });

  it("constrains GitHub rule target categories and note revision retention on deletion", async () => {
    const t = task();
    await reject("INSERT INTO project_github_rules(owner_id,project_id,rule_kind,target_status_id,target_category) VALUES($1,$2,'pr_open',$3,'in_progress')", [t.ownerId, t.projectId, fixture.statuses[1].id], "23503");
    await reject("INSERT INTO project_github_rules(owner_id,project_id,rule_kind,target_status_id,target_category) VALUES($1,$2,'pr_open',$3,'done')", [t.ownerId, t.projectId, fixture.statuses[4].id], "23514");
    const note = fixture.notes[2];
    await reject("INSERT INTO note_revisions(owner_id,note_id,revision,content,actor_kind,actor_user_id) VALUES($1,$2,1,'{}','human',$1)", [t.ownerId, note.id], "23505");
    await database.pool.query("DELETE FROM notes WHERE id=$1", [note.id]);
    expect((await database.pool.query("SELECT * FROM note_revisions WHERE note_id=$1", [note.id])).rowCount).toBe(0);
  });
});
