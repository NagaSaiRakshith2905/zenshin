import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ APP_ORIGIN: "https://example.invalid" }), getAuthEnv: () => ({}) }));
vi.mock("./actors", () => ({ authenticateOwner: vi.fn(async () => ({ kind: "human", ownerId: "owner" })) }));
vi.mock("@/server/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@/server/jobs/schedule", () => ({ scheduleJobs: vi.fn() }));
vi.mock("@/server/services/settings", () => ({ createSettingsService: () => ({}) }));
import { assertBrowserOrigin, ownerSettingsRoute, readSettingsBody } from "./http";

describe("browser settings request boundary", () => {
  it.each([{}, { origin: "https://foreign.invalid" }, { origin: "null" }, { origin: "https://example.invalid", "sec-fetch-site": "cross-site" }])("rejects missing/foreign origins", (headers) => {
    expect(() => assertBrowserOrigin(new Request("https://example.invalid", { headers: headers as HeadersInit }))).toThrow("browser application");
  });
  it("returns field locations and messages without echoing submitted values", async () => {
    const response = await ownerSettingsRoute(new Request("https://example.invalid", { method: "PATCH", headers: { origin: "https://example.invalid" } }), async () => {
      return z.object({ timezone: z.string().refine(() => false, "Choose a valid timezone.") }).parse({ timezone: "private-value" });
    });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.fields).toEqual([{ path: ["timezone"], message: "Choose a valid timezone." }]);
    expect(JSON.stringify(body)).not.toContain("private-value");
  });
  it("accepts the exact canonical origin", () => {
    expect(() => assertBrowserOrigin(new Request("https://example.invalid", { headers: { origin: "https://example.invalid", "sec-fetch-site": "same-origin" } }))).not.toThrow();
  });
  it("limits actual streamed bytes and requires JSON", async () => {
    const request = (body: string, type = "application/json") => new Request("https://example.invalid", { method: "POST", headers: { "content-type": type }, body });
    await expect(readSettingsBody(request('{"theme":"dark"}'))).resolves.toEqual({ theme: "dark" });
    await expect(readSettingsBody(request("{}", "text/plain"))).rejects.toMatchObject({ code: "validation_error" });
    await expect(readSettingsBody(request("not-json"))).rejects.toMatchObject({ code: "validation_error" });
    await expect(readSettingsBody(request("x".repeat(32_769)))).rejects.toThrow("too large");
  });
});
