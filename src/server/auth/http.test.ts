import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ getServerEnv: () => ({ APP_ORIGIN: "https://example.invalid" }) }));
import { assertBrowserOrigin, readSettingsBody } from "./http";

describe("browser settings request boundary", () => {
  it.each([{}, { origin: "https://foreign.invalid" }, { origin: "null" }, { origin: "https://example.invalid", "sec-fetch-site": "cross-site" }])("rejects missing/foreign origins", (headers) => {
    expect(() => assertBrowserOrigin(new Request("https://example.invalid", { headers: headers as HeadersInit }))).toThrow("browser application");
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
