import { attachmentMediaType, beginAttachment, type AttachmentTarget, type Attachment, type UploadInstructions } from "@/lib/contracts/attachments";
import { workRequest, WorkError } from "@/features/work/api";

export type UploadAttempt = { file: File; target: AttachmentTarget; key: string; instructions?: UploadInstructions };
export function attachmentLink(id: string, origin: string) { return `${origin}/api/v1/attachments/${id}/download?redirect=true`; }
export function putAttachment(file: File, upload: NonNullable<UploadInstructions["upload"]>, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    xhr.timeout = 120_000;
    for (const [key, value] of Object.entries(upload.headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      // A lost successful PUT response is safe to retry: the conditional write returns 412.
      if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 412) resolve();
      else reject(new Error("File transfer failed. Retry to check whether the upload arrived."));
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error("File transfer was interrupted. Keep this page open and retry."));
    xhr.send(file);
  });
}
export async function uploadAttachment(attempt: UploadAttempt, status: (stage: "uploading" | "verifying", progress: number) => void,
  request = workRequest, put = putAttachment): Promise<Attachment> {
  const parsed = beginAttachment.safeParse({ ...attempt.target, originalName: attempt.file.name, declaredSize: attempt.file.size, declaredMediaType: attachmentMediaType(attempt.file.name) ?? "" });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const input = parsed.data;
  attempt.instructions ??= await request<UploadInstructions>("attachments", "POST", input, attempt.key);
  const { attachment, upload } = attempt.instructions;
  if (attachment.state === "ready") return attachment;
  if (attachment.state === "failed") throw new Error("This upload failed verification. Remove it and select the file again.");
  let putError: unknown;
  if (upload && new Date(upload.expiresAt).getTime() > Date.now()) {
    status("uploading", 0);
    // A transfer error can mean only its response was lost; finalization remains authoritative.
    try { await put(attempt.file, upload, (progress) => status("uploading", progress)); } catch (error) { putError = error; }
  }
  status("verifying", 100);
  try { return await request<Attachment>(`attachments/${attachment.id}/finalize`, "POST", {}); }
  catch (error) { if (putError && !(error instanceof WorkError && error.code === "upload_rejected")) throw putError; throw error; }
}
