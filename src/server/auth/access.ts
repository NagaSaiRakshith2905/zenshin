import "server-only";

export const actionScopes = Object.freeze(["read", "write", "upload", "archive", "complete"] as const);
export type Scope = typeof actionScopes[number];
// Only the human owner has owner-wide project access; agents always carry explicit IDs.
export type HumanActor = Readonly<{ kind: "human"; ownerId: string; credentialId: null; scopes: readonly Scope[]; projectIds: null }>;
export type AgentActor = Readonly<{
  kind: "agent"; ownerId: string; credentialId: string;
  scopes: readonly Scope[]; projectIds: readonly string[];
}>;
export type SystemActor = Readonly<{
  kind: "system"; ownerId: string; credentialId: null;
  job: "github_reconcile" | "attachment_cleanup" | "export";
  scopes: readonly Scope[]; projectIds: readonly string[];
}>;
export type Actor = HumanActor | AgentActor | SystemActor;

export class AccessError extends Error {
  constructor(public code: "unauthenticated" | "forbidden" | "validation_error" | "conflict" | "not_found" | "rate_limited", message: string) {
    super(message);
  }
}

export function assertHumanOwner(actor: Actor): asserts actor is HumanActor {
  if (actor.kind !== "human") throw new AccessError("forbidden", "An owner browser session is required.");
}

// Every future service must use this with its owner-scoped target, including counts/search/downloads.
export function assertProjectScope(actor: Actor, ownerId: string, projectId: string, scope: Scope) {
  if (actor.ownerId !== ownerId || (actor.kind !== "human"
    && (!actor.projectIds.includes(projectId) || !actor.scopes.includes(scope)))) {
    throw new AccessError("forbidden", "This operation is not permitted.");
  }
}
