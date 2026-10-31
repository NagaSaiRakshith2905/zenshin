import { exportRoute } from "@/server/services/exports-http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return exportRoute(request, (await context.params).id);
}
