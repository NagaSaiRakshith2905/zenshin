import { ownerSettingsRoute, readSettingsBody } from "@/server/auth/http";

export const runtime = "nodejs";
export const GET = (request: Request) => ownerSettingsRoute(request, (service, actor) => service.preferences(actor));
export const PATCH = (request: Request) => ownerSettingsRoute(request, async (service, actor) => service.updatePreferences(actor, await readSettingsBody(request)));
