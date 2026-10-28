import { ownerSettingsRoute, readSettingsBody } from "@/server/auth/http";

export const runtime = "nodejs";
export const POST = (request: Request, context: RouteContext<"/api/v1/settings/credentials/[id]/revoke">) => ownerSettingsRoute(request, async (service, actor) =>
  service.revokeCredential(actor, (await context.params).id, await readSettingsBody(request)));
