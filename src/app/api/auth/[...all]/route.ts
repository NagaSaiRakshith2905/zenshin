import { getAuth } from "@/server/auth";
import { isPublicAuthRoute } from "@/server/auth/public-routes";
import { createRequestContext } from "@/server/request-context";

export const runtime = "nodejs";
async function handle(request: Request) {
  const path = new URL(request.url).pathname.slice("/api/auth".length);
  if (!isPublicAuthRoute(request.method, path)) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const response = await getAuth().handler(request);
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch {
    createRequestContext().logError("authentication_error");
    return Response.json({ error: "authentication_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = handle;
export const POST = handle;
