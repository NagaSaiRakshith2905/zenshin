import { authenticateActor } from "@/server/auth/actors";
import { assertHumanOwner, AccessError } from "@/server/auth/access";
import { getServerEnv } from "@/server/env";
export const runtime = "nodejs";
// GitHub's setup redirect is a navigation hint; never trust installation_id as authorization.
export async function GET(request: Request) {
  const origin = getServerEnv().APP_ORIGIN;
  try {
    const actor = await authenticateActor(request.headers); assertHumanOwner(actor);
    return Response.redirect(`${origin}/?github=setup`, 303);
  } catch (error) {
    if (error instanceof AccessError) return Response.redirect(`${origin}/sign-in`, 303);
    return new Response("GitHub setup unavailable", { status: 503 });
  }
}
