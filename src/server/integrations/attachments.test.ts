import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { beginAttachment, maxAttachmentBytes } from "@/lib/contracts/attachments";
import { parseStorageEnv } from "@/server/env";
import { createR2Storage } from "./r2";
import { attachmentDisposition, inspectAttachment, verifyAttachmentMetadata } from "./attachment-content";

const input = { kind: "task", id: "11111111-1111-4111-8111-111111111111", originalName: "hello.txt", declaredSize: 5, declaredMediaType: "text/plain" };
const storageEnv = { R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, R2_BUCKET: "test-files", R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret" };
describe("private attachment contracts and inspection", () => {
  it("accepts supported files and rejects paths, wrong extensions/types and oversized declarations", () => {
    expect(beginAttachment.parse(input)).toEqual(input);
    for (const patch of [{ originalName: "../secret.txt" }, { originalName: "a\r\n.txt" }, { originalName: "a.svg" }, { originalName: "a.html" }, { declaredMediaType: "image/png" }, { declaredSize: maxAttachmentBytes + 1 }]) {
      expect(beginAttachment.safeParse({ ...input, ...patch }).success).toBe(false);
    }
    expect(beginAttachment.safeParse({ ...input, originalName: "README.MD" }).success).toBe(true);
  });
  it("checks actual size, declared size, exact content type and encoded objects", () => {
    const head = { size: 5, mediaType: "text/plain" };
    expect(() => verifyAttachmentMetadata(input, head)).not.toThrow();
    for (const patch of [{ size: maxAttachmentBytes + 1 }, { size: -1 }, { size: 4 }, { mediaType: "text/html" }, { encoding: "gzip" }]) expect(() => verifyAttachmentMetadata(input, { ...head, ...patch })).toThrow();
  });
  it("checks all text bytes, UTF-8, control characters and JSON syntax", () => {
    const good = Buffer.from("前進 🌱\n");
    expect(inspectAttachment("a.md", good, good.length)).toBe("text/markdown");
    expect(() => inspectAttachment("a.txt", Buffer.from([0xc0, 0x80]), 2)).toThrow("UTF-8");
    expect(() => inspectAttachment("a.txt", Buffer.from("a\0b"), 3)).toThrow("binary");
    expect(() => inspectAttachment("a.txt", good, good.length + 1)).toThrow("complete");
    expect(() => inspectAttachment("a.json", Buffer.from("no"), 2)).toThrow("JSON");
    expect(inspectAttachment("a.json", Buffer.from("{}"), 2)).toBe("application/json");
    expect(inspectAttachment("empty.txt", Buffer.from(""), 0)).toBe("text/plain");
  });
  it("recognizes image/PDF signatures and rejects disguised active formats", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    expect(inspectAttachment("a.png", png, 40)).toBe("image/png");
    expect(inspectAttachment("a.jpg", Buffer.from([255, 216, 255, 224]), 40)).toBe("image/jpeg");
    expect(inspectAttachment("a.gif", Buffer.from("GIF89a1234567"), 13)).toBe("image/gif");
    const webp = Buffer.alloc(16); webp.write("RIFF"); webp.writeUInt32LE(8, 4); webp.write("WEBP", 8);
    expect(inspectAttachment("a.webp", webp, 16)).toBe("image/webp");
    expect(inspectAttachment("a.pdf", Buffer.from("%PDF-1.7\n"), 200)).toBe("application/pdf");
    expect(() => inspectAttachment("a.png", Buffer.from("<svg>"), 5)).toThrow("signature");
  });
  it("forces attachment disposition with escaped Unicode names and no header injection", () => {
    const disposition = attachmentDisposition('前進"\r\n/file.pdf');
    expect(disposition.startsWith('attachment; filename="')).toBe(true);
    expect(disposition).toContain("filename*=UTF-8''%E5%89%8D%E9%80%B2%22___file.pdf");
    expect(disposition).not.toMatch(/[\r\n]/);
  });
  it("validates storage configuration without echoing credentials or allowing arbitrary endpoints", () => {
    expect(parseStorageEnv(storageEnv)).toEqual(storageEnv);
    expect(() => parseStorageEnv({ ...storageEnv, R2_ENDPOINT: "https://private-secret.invalid" })).toThrow("R2_ENDPOINT");
    expect(() => parseStorageEnv({ ...storageEnv, R2_ENDPOINT: "https://private-secret.invalid" })).not.toThrow("private-secret");
  });
  it("signs the content type and immutable-write condition and limits both URL lifetimes", async () => {
    const storage = createR2Storage(storageEnv);
    const upload = await storage.signUpload("attachments/test/key", "text/plain", new Date(Date.now() + 600_000));
    const url = new URL(upload.url);
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(expect.arrayContaining(["host", "content-type", "if-none-match"]));
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(600);
    expect(upload.headers).toEqual({ "Content-Type": "text/plain", "If-None-Match": "*" });
    const download = new URL(await storage.signDownload("attachments/test/key", "a.txt", "text/plain"));
    expect(download.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(download.searchParams.get("response-content-disposition")).toContain("attachment;");
    expect(download.searchParams.get("response-content-type")).toBe("text/plain");
  });
});
