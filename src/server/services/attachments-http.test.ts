import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/actors", () => ({ authenticateActor: vi.fn() }));
vi.mock("@/server/jobs/schedule", () => ({ scheduleJobs: vi.fn() }));
vi.mock("@/server/db", () => ({ getDatabase: () => ({}) }));
vi.mock("./attachments", () => ({ createAttachmentService: vi.fn() }));
import { authenticateActor } from "@/server/auth/actors";
import { actionScopes, AccessError, type HumanActor } from "@/server/auth/access";
import { createAttachmentService } from "./attachments";
import { DomainError } from "./work/foundation";
import { workRoute } from "./work/http";
const id = "11111111-1111-4111-8111-111111111111";
const owner: HumanActor = { kind: "human", ownerId: "owner", credentialId: null, projectIds: null, scopes: actionScopes };
const service = { begin: vi.fn(), list: vi.fn(), finalize: vi.fn(), download: vi.fn(), remove: vi.fn() };
beforeEach(() => {
  vi.stubEnv("APP_ENV", "development"); vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.mocked(authenticateActor).mockResolvedValue(owner);
  vi.mocked(createAttachmentService).mockReturnValue(service);
  service.list.mockResolvedValue({ items: [], nextCursor: null });
  service.download.mockResolvedValue({ url: "https://storage.invalid/signed", expiresAt: new Date().toISOString() });
});
afterEach(() => vi.unstubAllEnvs());
it("requires authentication before listing or downloading private files", async () => {
  vi.mocked(authenticateActor).mockRejectedValueOnce(new AccessError("unauthenticated", "Sign in."));
  const response = await workRoute(new Request("http://localhost:3000/api/v1/attachments"), ["attachments"]);
  expect(response.status).toBe(401); expect(service.list).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("requires browser origin and a retry key before initiating an upload", async () => {
  const request = (origin?: string, key?: string) => new Request("http://localhost:3000/api/v1/attachments", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify({ input: {} }) });
  expect((await workRoute(request("http://foreign.invalid", "key"), ["attachments"])).status).toBe(403);
  expect((await workRoute(request("http://localhost:3000"), ["attachments"])).status).toBe(422);
  expect(service.begin).not.toHaveBeenCalled();
});
it("returns download instructions by default and a private no-referrer redirect only when requested", async () => {
  const request = (query = "") => new Request(`http://localhost:3000/api/v1/attachments/${id}/download${query}`);
  const response = await workRoute(request(), ["attachments", id, "download"]);
  expect(response.status).toBe(200); expect((await response.json()).url).toBe("https://storage.invalid/signed");
  const redirect = await workRoute(request("?redirect=true"), ["attachments", id, "download"]);
  expect(redirect.status).toBe(302); expect(redirect.headers.get("location")).toBe("https://storage.invalid/signed");
  expect(redirect.headers.get("referrer-policy")).toBe("no-referrer");
  expect(redirect.headers.get("cache-control")).toContain("private");
});
it("keeps denied downloads from redirecting", async () => {
  service.download.mockRejectedValueOnce(new AccessError("forbidden", "Not permitted."));
  const response = await workRoute(new Request(`http://localhost:3000/api/v1/attachments/${id}/download?redirect=true`), ["attachments", id, "download"]);
  expect(response.status).toBe(403); expect(response.headers.has("location")).toBe(false);
});

it("renders stable-link errors for navigation while keeping API errors JSON", async () => {
  const request = (query = "") => new Request(`http://localhost:3000/api/v1/attachments/${id}/download${query}`);
  vi.mocked(authenticateActor).mockRejectedValueOnce(new AccessError("unauthenticated", "Sign in."));
  const signIn = await workRoute(request("?redirect=true"), ["attachments", id, "download"]);
  expect(signIn.status).toBe(302); expect(signIn.headers.get("location")).toBe("/sign-in");
  for (const code of ["conflict", "not_found", "forbidden"] as const) {
    service.download.mockRejectedValueOnce(new AccessError(code, "unavailable"));
    const response = await workRoute(request("?redirect=true"), ["attachments", id, "download"]);
    expect(response.headers.get("content-type")).toContain("text/html"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.text()).toContain('href="/"');
  }
  service.download.mockRejectedValueOnce(new DomainError("conflict", "unavailable"));
  const api = await workRoute(request(), ["attachments", id, "download"]); expect((await api.json()).error.code).toBe("conflict");
});
