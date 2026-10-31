import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/actors", () => ({ authenticateOwner: vi.fn() }));
vi.mock("@/server/jobs/schedule", () => ({ scheduleJobs: vi.fn() }));
vi.mock("@/server/db", () => ({ getDatabase: () => ({}) }));
vi.mock("./exports", () => ({ createExportService: vi.fn() }));
import { authenticateOwner } from "@/server/auth/actors";
import { AccessError, actionScopes } from "@/server/auth/access";
import { createExportService } from "./exports";
import { exportRoute } from "./exports-http";
const service = { request: vi.fn(), list: vi.fn(), download: vi.fn() };
beforeEach(() => {
  vi.stubEnv("APP_ENV", "development"); vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.mocked(authenticateOwner).mockResolvedValue({ kind: "human", ownerId: "github:42", credentialId: null, scopes: actionScopes, projectIds: null });
  vi.mocked(createExportService).mockReturnValue(service); service.list.mockResolvedValue({ items: [] }); service.request.mockResolvedValue({ status: "pending" });
});
afterEach(() => vi.unstubAllEnvs());
it("denies agent export list/request/download before service access", async () => {
  for (const [method, id] of [["GET", undefined], ["POST", undefined], ["GET", "file"]]) {
    vi.mocked(authenticateOwner).mockRejectedValueOnce(new AccessError("forbidden", "An owner browser session is required."));
    const response = await exportRoute(new Request("http://localhost:3000/api/v1/settings/exports", { method }), id);
    expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toContain("no-store");
  }
  expect(createExportService).not.toHaveBeenCalled();
});
it("requires same-origin requests for export creation and returns asynchronous status", async () => {
  const request = (origin: string) => new Request("http://localhost:3000/api/v1/settings/exports", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ idempotencyKey: "key" }) });
  expect((await exportRoute(request("https://other.invalid"))).status).toBe(403);
  expect(service.request).not.toHaveBeenCalled(); expect((await exportRoute(request("http://localhost:3000"))).status).toBe(202);
});
it("never returns signed URLs on denied/expired downloads or exposes provider failures", async () => {
  service.download.mockRejectedValueOnce(new AccessError("conflict", "Expired."));
  const request = new Request("http://localhost:3000/api/v1/settings/exports/file/download");
  const denied = await exportRoute(request, "file"); expect(denied.status).toBe(409); expect(await denied.text()).not.toContain("url");
  vi.spyOn(console, "error").mockImplementation(() => {}); service.download.mockRejectedValueOnce(new Error("secret-provider-value"));
  const failed = await exportRoute(request, "file"); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("secret-provider-value");
});
