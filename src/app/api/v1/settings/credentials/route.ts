import { ownerSettingsRoute, readSettingsBody } from "@/server/auth/http";

export const runtime = "nodejs";
export const GET = (request: Request) => ownerSettingsRoute(request, (service, actor) => service.credentials(actor));
export const POST = (request: Request) => ownerSettingsRoute(request, async (service, actor) => service.createCredential(actor, await readSettingsBody(request)), 201);
