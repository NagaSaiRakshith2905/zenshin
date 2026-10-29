import { z } from "zod";
import { noteTarget } from "./notes";

export const maxAttachmentBytes = 20_000_000;
export const uploadLifetimeSeconds = 600;
export const downloadLifetimeSeconds = 300;
export const cleanupMarginMs = 60 * 60 * 1000;
export const attachmentTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", markdown: "text/markdown",
  csv: "text/csv", json: "application/json", log: "text/plain",
};
export const attachmentAccept = Object.keys(attachmentTypes).map((ext) => `.${ext}`).join(",");
export function attachmentMediaType(name: string) { return attachmentTypes[name.split(".").at(-1)?.toLowerCase() ?? ""]; }
export const beginAttachment = noteTarget.extend({
  originalName: z.string().trim().min(1).max(240).refine((name) => name.isWellFormed() && !/[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(name), "Use a filename without paths or control characters."),
  declaredMediaType: z.string().max(100),
  declaredSize: z.number().int().min(0).max(maxAttachmentBytes),
}).superRefine((input, ctx) => {
  const type = attachmentMediaType(input.originalName);
  if (!type || (type !== input.declaredMediaType && !(type.startsWith("text/") && input.declaredMediaType === "text/plain"))) {
    ctx.addIssue({ code: "custom", path: ["declaredMediaType"], message: "Choose a supported image, PDF or UTF-8 text file with a matching extension and media type." });
  }
});
export const attachmentId = z.strictObject({ id: z.uuid() });
export type AttachmentTarget = z.infer<typeof noteTarget>;
export type Attachment = {
  id: string; revision: number; originalName: string; state: "pending" | "verifying" | "ready" | "failed";
  declaredSize: number; declaredMediaType: string; actualSize: number | null; detectedMediaType: string | null;
  uploadExpiresAt: string; failureSummary: string | null; createdAt: string; verifiedAt: string | null;
};
export type UploadInstructions = { attachment: Attachment; upload: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string } | null };
