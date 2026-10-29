import "server-only";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { downloadLifetimeSeconds, maxAttachmentBytes } from "@/lib/contracts/attachments";
import { parseStorageEnv } from "@/server/env";
import { attachmentDisposition } from "./attachment-content";

export type ObjectMetadata = { size: number; mediaType: string; etag: string; encoding?: string };
export type AttachmentStorage = {
  signUpload(key: string, mediaType: string, expiresAt: Date): Promise<{ url: string; headers: Record<string, string> }>;
  head(key: string, signal: AbortSignal): Promise<ObjectMetadata | null>;
  inspect(key: string, metadata: ObjectMetadata, text: boolean, signal: AbortSignal): Promise<Uint8Array>;
  signDownload(key: string, name: string, mediaType: string): Promise<string>;
  delete(key: string, signal: AbortSignal): Promise<void>;
};
export function createR2Storage(env = parseStorageEnv(process.env)): AttachmentStorage {
  const client = new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 2 });
  const Bucket = env.R2_BUCKET;
  return {
    async signUpload(Key, ContentType, expiresAt) {
      const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      if (expiresIn < 1) throw new Error("Upload instructions expired");
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType, IfNoneMatch: "*" }), {
        expiresIn, signableHeaders: new Set(["content-type", "if-none-match"]),
      });
      return { url, headers: { "Content-Type": ContentType, "If-None-Match": "*" } };
    },
    async head(Key, signal) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket, Key }), { abortSignal: signal });
        if (!result.ETag) throw new Error("Object metadata is incomplete");
        return { size: result.ContentLength ?? -1, mediaType: result.ContentType ?? "", etag: result.ETag, encoding: result.ContentEncoding };
      } catch (error) {
        if (error && typeof error === "object" && "$metadata" in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404) return null;
        throw error;
      }
    },
    async inspect(Key, metadata, text, signal) {
      const limit = text ? metadata.size : Math.min(metadata.size, 4096);
      if (metadata.size > maxAttachmentBytes || limit < 0) throw new Error("Object exceeds inspection limit");
      if (limit === 0) return new Uint8Array();
      const result = await client.send(new GetObjectCommand({ Bucket, Key, IfMatch: metadata.etag, Range: `bytes=0-${limit - 1}` }), { abortSignal: signal });
      if (!result.Body) throw new Error("Object body is unavailable");
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          size += chunk.length;
          if (size > limit || signal.aborted) throw new Error("Object inspection exceeded its bounds");
          chunks.push(chunk);
        }
      } finally {
        if ("destroy" in result.Body && typeof result.Body.destroy === "function") result.Body.destroy();
      }
      if (size !== limit) throw new Error("Incomplete object inspection");
      return Buffer.concat(chunks, size);
    },
    async signDownload(Key, name, mediaType) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseContentDisposition: attachmentDisposition(name), ResponseContentType: mediaType, ResponseCacheControl: "private, no-store" }), { expiresIn: downloadLifetimeSeconds });
    },
    async delete(Key, signal) { await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: signal }); },
  };
}
// Construct on first provider use so core pages and tests do not need R2 credentials.
let storage: AttachmentStorage | undefined;
export const getAttachmentStorage = () => storage ??= createR2Storage();
