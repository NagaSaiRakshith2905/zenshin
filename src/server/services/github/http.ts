import "server-only";
import { z } from "zod";
import type { Actor } from "@/server/auth/access";
import type { Database } from "@/server/db";
import { DomainError } from "../work/foundation";
import { GithubError } from "@/server/integrations/github";
import { mutationEnvelope } from "@/lib/contracts/work";
import { assertBrowserOrigin, readSettingsBody } from "@/server/auth/http";
import { createGithubService } from ".";
export async function githubRoute(db: Database, actor: Actor, request: Request, path: string[], requestId: string) {
  const service = createGithubService(db);
  const [resource] = path;
  if (path.length !== 1) throw new DomainError("not_found", "GitHub route was not found.");
  try {
    if (request.method === "GET") {
      const input = Object.fromEntries(new URL(request.url).searchParams);
      if (resource === "installations") return await service.installations(actor, input.page);
      if (resource === "discover-repositories") return await service.discoverRepositories(actor, input);
      if (resource === "repositories") return await service.repositories(actor, input);
      if (resource === "issues") return await service.issues(actor, input);
      if (resource === "links") return await service.taskLinks(actor, input);
      if (resource === "rules") return await service.rules(actor, input);
    }
    if (request.method === "POST") {
      if (actor.kind === "human") assertBrowserOrigin(request);
      const envelope = mutationEnvelope.parse(await readSettingsBody(request)); const input = z.record(z.string(), z.unknown()).parse(envelope.input);
      const key = z.string().min(1).max(200).parse(request.headers.get("idempotency-key") ?? envelope.idempotencyKey);
      if (resource === "connect") return await service.connect(actor, input, requestId, key);
      if (resource === "import") return await service.importIssue(actor, input, requestId, key);
      if (resource === "link") return await service.link(actor, input, requestId, key);
      if (resource === "unlink") return await service.unlink(actor, input, requestId, key);
      if (resource === "rules") return await service.saveRule(actor, input, requestId, key);
      if (resource === "refresh") return await service.taskLinks(actor, input, true);
    }
    throw new DomainError("not_found", "GitHub route was not found.");
  } catch (error) {
    if (error instanceof GithubError) throw new DomainError("integration_unavailable", error.retryAt ? "GitHub is rate limited. Retry after the indicated time." : "GitHub connection unavailable. Check installation access and approval.", { retryAt: error.retryAt?.toISOString() ?? null });
    if (error instanceof Error && error.message.startsWith("Invalid server environment:")) throw new DomainError("integration_unavailable", "Configure the GitHub App server settings. See docs/GITHUB.md.");
    throw error;
  }
}
