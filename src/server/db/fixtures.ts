import { createHash } from "node:crypto";
import type { Database } from "./connection";
import * as s from "./schema";

export const fixtureTime = new Date("2026-10-29T00:00:00.000Z");
export function fixtureId(key: string) {
  const hex = createHash("sha256").update(`zenshin-fixture:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const stamp = { createdAt: fixtureTime, updatedAt: fixtureTime, revision: 1 };
const categories = s.statusCategory.enumValues;
const statusNames = ["Backlog", "Ready", "In progress", "In review", "Done", "Canceled"];
const richText = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** Pure deterministic data; no auth sessions, credentials, or provider calls. */
export function createFixtureData(size: "development" | "performance", namespace = size as string) {
  const projectCount = size === "performance" ? 50 : 2;
  const tasksPerProject = size === "performance" ? 200 : 16;
  const ownerId = `zenshin-fixture-${namespace}`;
  const id = (key: string) => fixtureId(`${namespace}:${key}`);
  const projects: (typeof s.projects.$inferInsert)[] = [];
  const statuses: (typeof s.taskStatuses.$inferInsert)[] = [];
  const sections: (typeof s.sections.$inferInsert)[] = [];
  const tasks: (typeof s.tasks.$inferInsert)[] = [];
  const labels: (typeof s.labels.$inferInsert)[] = [];
  const taskLabels: (typeof s.taskLabels.$inferInsert)[] = [];
  const dependencies: (typeof s.taskDependencies.$inferInsert)[] = [];
  const definitions: (typeof s.propertyDefinitions.$inferInsert)[] = [];
  const options: (typeof s.propertyOptions.$inferInsert)[] = [];
  const values: (typeof s.taskPropertyValues.$inferInsert)[] = [];
  const optionValues: (typeof s.taskPropertyOptionValues.$inferInsert)[] = [];
  const notes: (typeof s.notes.$inferInsert)[] = [];
  const noteRevisions: (typeof s.noteRevisions.$inferInsert)[] = [];
  const activities: (typeof s.activities.$inferInsert)[] = [];

  for (let p = 0; p < projectCount; p++) {
    const projectId = id(`project:${p}`);
    const sectionId = (n: number) => id(`project:${p}:section:${n}`);
    const taskId = (n: number) => id(`project:${p}:task:${n}`);
    projects.push({ ...stamp, id: projectId, ownerId, name: p === 0 ? "Zenshin" : `Project ${p + 1}`, prefix: `ZEN${p + 1}`, description: "Deterministic local fixture", nextTaskNumber: tasksPerProject + 1 });
    categories.forEach((category, c) => statuses.push({ ...stamp, id: id(`project:${p}:status:${c}`), ownerId, projectId, category, name: statusNames[c], isDefault: c === 0, position: BigInt((c + 1) * 1024) }));
    const names = ["Version 1.0", "Authentication", "Owner access", "Completed plan", "Archived plan", "Empty plan", "Canceled work"];
    names.forEach((name, n) => sections.push({ ...stamp, id: sectionId(n), ownerId, projectId, name, parentSectionId: n === 1 ? sectionId(0) : n === 2 ? sectionId(1) : null, lifecycle: n === 3 ? "completed" : n === 0 ? "active" : "planned", targetDate: n === 0 ? "2026-11-15" : null, position: BigInt((n + 1) * 1024), archivedAt: n === 4 ? fixtureTime : null }));
    // One subtask level, depth-three sections, project-root work, canceled/archived
    // prerequisites, independent archive markers and an unresolved parent with Done leaves.
    for (let n = 1; n <= tasksPerProject; n++) {
      const section = n <= 3 ? null : n <= 6 ? 2 : n === 7 ? 3 : n === 8 || n === 9 ? 4 : n === 10 ? 6 : 0;
      const category = n === 4 ? 1 : n === 2 || n === 3 || n === 7 || n === 8 || n === 9 ? 4 : n === 10 ? 5 : n % 6;
      tasks.push({ ...stamp, id: taskId(n), ownerId, projectId, number: n, title: n === 1 ? "Unresolved parent with finished leaves" : `Task ${n}: ${statusNames[category]}`, description: n === 4 ? "Unicode boundary: 前進 🌱" : "Fixture task", sectionId: section === null ? null : sectionId(section), parentTaskId: n === 2 || n === 3 ? taskId(1) : null, statusId: id(`project:${p}:status:${category}`), priority: s.taskPriority.enumValues[n % 5], dueDate: n % 4 === 0 ? "2026-10-28" : n % 4 === 1 ? "2026-10-29" : null, manualBlockedReason: n === 6 ? "Awaiting an owner decision" : null, position: BigInt(n * 1024), archivedAt: n === 9 ? fixtureTime : null });
      const activityCount = size === "performance" ? 5 : 1;
      for (let a = 0; a < activityCount; a++) activities.push({ id: id(`project:${p}:task:${n}:activity:${a}`), ownerId, projectId, taskId: taskId(n), actorKind: "human", actorUserId: ownerId, action: a === 0 ? "task.created" : "task.updated", changedFields: { title: `Fixture edit ${a + 1}` }, requestId: `fixture-${p}-${n}-${a}`, createdAt: new Date(fixtureTime.getTime() + (n * 5 + a) * 1000) });
    }
    for (const prerequisite of [8, 10]) dependencies.push({ ownerId, projectId, taskId: taskId(4), prerequisiteTaskId: taskId(prerequisite) });
    labels.push({ ...stamp, id: id(`project:${p}:label`), ownerId, projectId, name: "Frontend", normalizedName: "frontend", color: "#71717A" });
    taskLabels.push({ ownerId, projectId, taskId: taskId(4), labelId: id(`project:${p}:label`) });
    s.propertyType.enumValues.forEach((type, n) => {
      const definitionId = id(`project:${p}:property:${n}`);
      definitions.push({ ...stamp, id: definitionId, ownerId, projectId, name: `Property ${type}`, normalizedName: `property ${type}`, type, position: BigInt((n + 1) * 1024) });
      if (type === "select" || type === "multi_select") for (let o = 0; o < 2; o++) options.push({ ...stamp, id: id(`project:${p}:property:${n}:option:${o}`), ownerId, projectId, definitionId, name: `Option ${o + 1}`, normalizedName: `option ${o + 1}`, position: BigInt((o + 1) * 1024) });
      const base = { ownerId, projectId, taskId: taskId(4), definitionId };
      if (type === "multi_select") for (let o = 0; o < 2; o++) optionValues.push({ ...base, optionId: id(`project:${p}:property:${n}:option:${o}`) });
      else values.push({ ...base, ...(type === "text" ? { valueText: "Searchable planning context 前進" } : type === "url" ? { valueText: "https://example.invalid/context" } : type === "number" ? { valueNumber: "3.5" } : type === "date" ? { valueDate: "2026-11-15" } : type === "checkbox" ? { valueBool: false } : { optionId: id(`project:${p}:property:${n}:option:0`) }) });
    });
    for (const target of ["project", "section", "task"] as const) {
      const noteId = id(`project:${p}:note:${target}`);
      const plainText = `${target} note with fixture context`;
      const content = richText(plainText);
      notes.push({ ...stamp, id: noteId, ownerId, ...(target === "project" ? { projectId } : target === "section" ? { sectionId: sectionId(2) } : { taskId: taskId(4) }), content, plainText });
      noteRevisions.push({ id: id(`project:${p}:note:${target}:revision:1`), ownerId, noteId, revision: 1, content, actorKind: "human", actorUserId: ownerId, savedAt: fixtureTime });
    }
  }
  return { owner: { id: ownerId, name: "Local fixture owner", email: `${namespace}@example.invalid`, emailVerified: false, createdAt: fixtureTime, updatedAt: fixtureTime }, projects, statuses, sections, tasks, labels, taskLabels, dependencies, definitions, options, values, optionValues, notes, noteRevisions, activities };
}

export type FixtureData = ReturnType<typeof createFixtureData>;

export async function insertFixtureData(db: Database, data: FixtureData) {
  // Refuse collisions instead of truncating or overwriting a developer's edits.
  await db.transaction(async (tx) => {
    await tx.insert(s.user).values(data.owner);
    await tx.insert(s.userPreferences).values({ ...stamp, userId: data.owner.id });
    await tx.insert(s.projects).values(data.projects);
    await tx.insert(s.taskStatuses).values(data.statuses);
    await tx.insert(s.sections).values(data.sections);
    // Bound parameter counts for the 50k-activity performance fixture.
    for (let i = 0; i < data.tasks.length; i += 500) await tx.insert(s.tasks).values(data.tasks.slice(i, i + 500));
    await tx.insert(s.labels).values(data.labels);
    await tx.insert(s.taskLabels).values(data.taskLabels);
    await tx.insert(s.taskDependencies).values(data.dependencies);
    await tx.insert(s.propertyDefinitions).values(data.definitions);
    await tx.insert(s.propertyOptions).values(data.options);
    await tx.insert(s.taskPropertyValues).values(data.values);
    await tx.insert(s.taskPropertyOptionValues).values(data.optionValues);
    await tx.insert(s.notes).values(data.notes);
    await tx.insert(s.noteRevisions).values(data.noteRevisions);
    for (let i = 0; i < data.activities.length; i += 500) await tx.insert(s.activities).values(data.activities.slice(i, i + 500));
  });
}
