import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createExportStorage } from "./export-storage";

const env = { R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, R2_BUCKET: "test-exports", R2_ACCESS_KEY_ID: "synthetic", R2_SECRET_ACCESS_KEY: "synthetic-secret" };
it("uses immutable export writes and verifies existing bytes on a retry", async () => {
  const bytes = Buffer.from("compressed export"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const send = vi.spyOn(S3Client.prototype, "send").mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } }).mockResolvedValueOnce({ ContentLength: bytes.length, Metadata: { sha256 } } as never);
  const storage = createExportStorage(env);
  await storage.put("exports/test/workspace.json.gz", bytes, AbortSignal.timeout(1000));
  expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
  expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({ IfNoneMatch: "*", ContentLength: bytes.length, Metadata: { sha256 } });
  expect(send.mock.calls[1][0]).toBeInstanceOf(HeadObjectCommand);
  send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } }).mockResolvedValueOnce({ ContentLength: bytes.length, Metadata: { sha256: "different" } } as never);
  await expect(storage.put("exports/test/workspace.json.gz", bytes, AbortSignal.timeout(1000))).rejects.toThrow("conflict");
});
it("signs private downloads for no longer than the remaining export lifetime", async () => {
  const url = new URL(await createExportStorage(env).download("exports/test/workspace.json.gz", 17));
  expect(url.searchParams.get("X-Amz-Expires")).toBe("17");
  expect(url.searchParams.get("response-content-disposition")).toContain('attachment; filename="zenshin-workspace.json.gz"');
});
