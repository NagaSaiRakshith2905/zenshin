import { ownerSettingsRoute, readSettingsBody } from "@/server/auth/http";

export const runtime = "nodejs";
export const PATCH = (request: Request, context: RouteContext<"/api/v1/settings/credentials/[id]">) => ownerSettingsRoute(request, async (service, actor) =>
  service.updateCredential(actor, (await context.params).id, await readSettingsBody(request)));
