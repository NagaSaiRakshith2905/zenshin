import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { commands, wireValue, type Command } from "@/lib/contracts/work";
import { assertHumanOwner, assertProjectScope, type Actor, type Scope } from "@/server/auth/access";
import type { Database, DatabaseExecutor } from "@/server/db";
import { activities, idempotencyRecords } from "@/server/db/schema";
import { query, rows, type Rows, type Table } from "./store";

export class DomainError extends Error {
  constructor(public code: "not_found" | "validation_error" | "conflict" | "decision_required" | "dependency_cycle" | "hierarchy_limit" | "idempotency_conflict" | "upload_rejected" | "integration_unavailable", message: string, public details: Record<string, unknown> = {}) { super(message); }
}
export function invalid(message: string, details: Record<string, unknown> = {}): never { throw new DomainError("validation_error", message, details); }
export function decision(message: string, details: Record<string, unknown>): never { throw new DomainError("decision_required", message, details); }
export async function owned<K extends Table>(db: DatabaseExecutor, actor: Actor, table: K, id: string): Promise<Rows[K]> {
  const [row] = await rows(db, table, sql`id = ${id} and owner_id = ${actor.ownerId}`);
  if (!row || (actor.kind !== "human" && !actor.projectIds.includes(table === "projects" ? row.id : (row as { projectId: string }).projectId))) throw new DomainError("not_found", "The requested item was not found.");
  return row;
}
export function checkRevision(row: { revision: number }, expected: number) {
  if (row.revision !== expected) throw new DomainError("conflict", "This item changed. Read the current version before retrying.", { current: wireValue(row), currentRevision: row.revision });
}
export async function projectLock(db: DatabaseExecutor, actor: Actor, projectId: string, scope: Scope) {
  await db.execute(sql`select id from projects where id = ${projectId} and owner_id = ${actor.ownerId} for update`);
  const project = await owned(db, actor, "projects", projectId);
  assertProjectScope(actor, project.ownerId, project.id, scope);
  return project;
}
export function attribution(actor: Actor) {
  return { actorKind: actor.kind, actorUserId: actor.kind === "human" ? actor.ownerId : null, actorCredentialId: actor.credentialId };
}
export async function activity(db: DatabaseExecutor, actor: Actor, projectId: string, requestId: string, action: string, changedFields: Record<string, unknown>, target?: { sectionId?: string; taskId?: string }) {
  await db.insert(activities).values({ ownerId: actor.ownerId, projectId, ...attribution(actor), requestId, action, changedFields: wireValue(changedFields), ...target });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export async function mutation(db: Database, actor: Actor, operation: Command, raw: unknown, requestId: string, key: string | undefined,
  work: (tx: DatabaseExecutor, input: Record<string, unknown>) => Promise<{ value: unknown; projectId: string }>,
  authorize: (tx: DatabaseExecutor, input: Record<string, unknown>, replayProjectId?: string) => Promise<void>) {
  const input = commands[operation].parse(raw);
  return atomicMutation(db, actor, operation, input, requestId, key, work, authorize);
}
export async function atomicMutation(db: Database, actor: Actor, operation: string, input: Record<string, unknown>, requestId: string, key: string | undefined,
  work: (tx: DatabaseExecutor, input: Record<string, unknown>) => Promise<{ value: unknown; projectId: string }>,
  authorize: (tx: DatabaseExecutor, input: Record<string, unknown>, replayProjectId?: string) => Promise<void>) {
  void requestId;
  const identity = actor.kind === "agent" ? actor.credentialId : actor.kind === "system" ? actor.job : actor.ownerId;
  const fingerprint = createHash("sha256").update(canonical(input)).digest("hex");
  return db.transaction(async (tx) => {
    const where = sql`owner_id = ${actor.ownerId} and actor_kind = ${actor.kind} and actor_identity = ${identity} and operation = ${operation} and key = ${key ?? ""}`;
    let previous: { requestFingerprint: string; result: { value: unknown; projectId: string } } | undefined;
    if (key !== undefined) {
      z.string().min(1).max(200).parse(key);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${[actor.ownerId, actor.kind, identity, operation, key].join(":")}, 0))`);
      await tx.execute(sql`delete from idempotency_records where ${where} and expires_at <= now()`);
      [previous] = await query<{ requestFingerprint: string; result: { value: unknown; projectId: string } }>(tx, sql`select request_fingerprint, result from idempotency_records where ${where}`);
    }
    // Access is rechecked even when replaying, including deletion receipts and changed grants.
    await authorize(tx, input, previous?.result.projectId);
    if (previous) {
      if (previous.requestFingerprint !== fingerprint) throw new DomainError("idempotency_conflict", "Use the original input with this retry key.");
      return previous.result.value;
    }
    const result = wireValue(await work(tx, input));
    if (key !== undefined) await tx.insert(idempotencyRecords).values({ ownerId: actor.ownerId, ...attribution(actor), actorIdentity: identity, operation, key, requestFingerprint: fingerprint, result });
    return result.value;
  });
}
export const ownerOnly = (actor: Actor) => assertHumanOwner(actor);
