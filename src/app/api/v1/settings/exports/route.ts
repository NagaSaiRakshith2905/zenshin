import { exportRoute } from "@/server/services/exports-http";
export const runtime = "nodejs";
export const GET = (request: Request) => exportRoute(request);
export const POST = (request: Request) => exportRoute(request);
