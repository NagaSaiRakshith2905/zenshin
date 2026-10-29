import { workRoute } from "@/server/services/work/http";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ work: string[] }> };
async function handle(request: Request, context: RouteContext) {
  return workRoute(request, (await context.params).work);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
