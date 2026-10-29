import { describe, expect, it, vi } from "vitest";
import { WorkError } from "@/features/work/api";
import type { Attachment, UploadInstructions } from "@/lib/contracts/attachments";
import { attachmentLink, uploadAttachment, type UploadAttempt } from "./upload";

const pending: Attachment = { id: "11111111-1111-4111-8111-111111111111", revision: 1, originalName: "hello.txt", state: "pending", declaredSize: 5, declaredMediaType: "text/plain", actualSize: null, detectedMediaType: null, uploadExpiresAt: new Date(Date.now() + 600_000).toISOString(), failureSummary: null, createdAt: new Date().toISOString(), verifiedAt: null };
const instructions: UploadInstructions = { attachment: pending, upload: { method: "PUT", url: "https://storage.invalid/upload", headers: { "Content-Type": "text/plain", "If-None-Match": "*" }, expiresAt: pending.uploadExpiresAt } };
const attempt = (): UploadAttempt => ({ file: new File(["hello"], "hello.txt", { type: "text/plain" }), key: "same-retry-key", target: { kind: "task", id: pending.id } });
const ready = { ...pending, state: "ready" as const };
it("uses a stable authorized application link instead of embedding an expiring signed URL in notes", () => {
  expect(attachmentLink(pending.id, "https://example.invalid")).toBe(`https://example.invalid/api/v1/attachments/${pending.id}/download?redirect=true`);
});
describe("direct attachment uploads", () => {
  it("retries a lost begin response with the original actor-bound key", async () => {
    const current = attempt(); const status = vi.fn();
    const request = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(instructions).mockResolvedValueOnce(ready);
    const put = vi.fn().mockResolvedValue(undefined);
    await expect(uploadAttachment(current, status, request, put)).rejects.toThrow("lost response");
    await expect(uploadAttachment(current, status, request, put)).resolves.toEqual(ready);
    expect(request.mock.calls[0][3]).toBe("same-retry-key");
    expect(request.mock.calls[1][3]).toBe("same-retry-key");
    expect(put).toHaveBeenCalledWith(current.file, instructions.upload, expect.any(Function));
    expect(status).toHaveBeenLastCalledWith("verifying", 100);
  });
  it("finalizes after an ambiguous PUT response and keeps the same attachment on retry", async () => {
    const current = attempt();
    const request = vi.fn().mockResolvedValueOnce(instructions).mockRejectedValueOnce(new WorkError("storage unavailable", "integration_unavailable")).mockResolvedValueOnce(ready);
    const put = vi.fn().mockRejectedValue(new Error("lost PUT response"));
    await expect(uploadAttachment(current, vi.fn(), request, put)).rejects.toThrow("storage unavailable");
    await expect(uploadAttachment(current, vi.fn(), request, put)).resolves.toEqual(ready);
    expect(request.mock.calls.map((args) => args[0])).toEqual(["attachments", `attachments/${pending.id}/finalize`, `attachments/${pending.id}/finalize`]);
  });
  it("tries finalization without reusing expired upload URLs", async () => {
    const current = attempt(); current.instructions = { ...instructions, upload: { ...instructions.upload!, expiresAt: new Date(0).toISOString() } };
    const request = vi.fn().mockResolvedValue(ready); const put = vi.fn();
    await uploadAttachment(current, vi.fn(), request, put);
    expect(put).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(`attachments/${pending.id}/finalize`, "POST", {});
  });
});
