import "server-only";
import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseStorageEnv } from "@/server/env";

export type ExportStorage = {
  put(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<void>;
  download(key: string, expiresIn: number): Promise<string>;
  remove(key: string, signal: AbortSignal): Promise<void>;
};
export function createExportStorage(env = parseStorageEnv(process.env)): ExportStorage {
  const client = new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 2 });
  const Bucket = env.R2_BUCKET;
  return {
    async put(Key, Body, signal) {
      const sha256 = createHash("sha256").update(Body).digest("hex");
      try {
        await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentLength: Body.byteLength, ContentType: "application/gzip", IfNoneMatch: "*", Metadata: { sha256 } }), { abortSignal: signal });
      } catch (error) {
        if (!(error && typeof error === "object" && "$metadata" in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 412)) throw error;
        const existing = await client.send(new HeadObjectCommand({ Bucket, Key }), { abortSignal: signal });
        if (existing.Metadata?.sha256 !== sha256 || existing.ContentLength !== Body.byteLength) throw new Error("Export object conflict.");
      }
    },
    download: (Key, expiresIn) => getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseContentType: "application/gzip", ResponseContentDisposition: 'attachment; filename="zenshin-workspace.json.gz"' }), { expiresIn }),
    async remove(Key, signal) { await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: signal }); },
  };
}
