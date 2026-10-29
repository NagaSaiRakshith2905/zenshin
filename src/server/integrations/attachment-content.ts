import { attachmentMediaType, maxAttachmentBytes } from "@/lib/contracts/attachments";

export class UploadRejected extends Error {}
export function verifyAttachmentMetadata(input: { declaredSize: number; declaredMediaType: string }, head: { size: number; mediaType: string; encoding?: string }) {
  if (!Number.isSafeInteger(head.size) || head.size < 0 || head.size > maxAttachmentBytes) throw new UploadRejected("The actual file exceeds the 20 MB limit.");
  if (head.size !== input.declaredSize) throw new UploadRejected("The actual file size does not match the declared size.");
  if (head.mediaType !== input.declaredMediaType || head.encoding) throw new UploadRejected("The object media type or encoding does not match the upload instructions.");
}
export function inspectAttachment(name: string, bytes: Uint8Array, actualSize: number) {
  const type = attachmentMediaType(name);
  const starts = (signature: number[]) => signature.every((value, i) => bytes[i] === value);
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
  if (type === "image/png" && starts([137, 80, 78, 71, 13, 10, 26, 10]) && ascii(12, 16) === "IHDR") return type;
  if (type === "image/jpeg" && starts([255, 216, 255])) return type;
  if (type === "image/gif" && ["GIF87a", "GIF89a"].includes(ascii(0, 6)) && actualSize >= 13) return type;
  if (type === "image/webp" && bytes.length >= 16 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" && Buffer.from(bytes).readUInt32LE(4) === actualSize - 8) return type;
  if (type === "application/pdf" && /^%PDF-[12]\.\d/.test(ascii(0, 8))) return type;
  if (type?.startsWith("text/") || type === "application/json") {
    if (bytes.length !== actualSize) throw new UploadRejected("The complete text file could not be inspected.");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new UploadRejected("Text attachments must contain valid UTF-8."); }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw new UploadRejected("The file contains binary control characters.");
    if (type === "application/json") { try { JSON.parse(text); } catch { throw new UploadRejected("The file does not contain valid JSON."); } }
    return type;
  }
  throw new UploadRejected("The file signature does not match its allowed type.");
}
export function attachmentDisposition(name: string) {
  const safe = name.replace(/[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, "_");
  const fallback = safe.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
