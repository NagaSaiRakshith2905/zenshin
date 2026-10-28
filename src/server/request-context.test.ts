import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createRequestContext } from "./request-context";

describe("request logging", () => {
  it("keeps a generated request ID and excludes unapproved context", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const context = createRequestContext();
    const credentialId = "3aa89cb8-6a8a-4d63-b5db-7076e66a1fb4";
    Object.assign(context, { headers: { authorization: "private-value" }, note: "private-note" });
    context.logError("internal_error", credentialId);

    const line = output.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toEqual({
      timestamp: expect.any(String), level: "error", event: "request.failed",
      requestId: context.requestId, code: "internal_error", credentialId,
    });
    expect(line).not.toContain("private");
    expect(createRequestContext().requestId).not.toBe(context.requestId);
  });

  it("omits malformed credential IDs and log injection text", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    createRequestContext().logError("internal_error", "private\nforged-entry");
    expect(JSON.parse(output.mock.calls[0][0] as string)).not.toHaveProperty("credentialId");
    expect(output.mock.calls[0][0]).not.toContain("private");
  });
});
