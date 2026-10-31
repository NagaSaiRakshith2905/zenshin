import { createReadStream, createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, PutObjectRetentionCommand, GetPublicAccessBlockCommand, GetBucketEncryptionCommand, GetBucketVersioningCommand, GetObjectLockConfigurationCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { fileHash, hash } from "./common";

const required = (env: NodeJS.ProcessEnv, key: string) => z.string().trim().min(1, `Set ${key}.`).parse(env[key]);
export function backupClients(env: NodeJS.ProcessEnv) {
  const Bucket = required(env, "BACKUP_S3_BUCKET"), region = required(env, "BACKUP_S3_REGION"), kms = required(env, "BACKUP_S3_KMS_KEY_ID");
  const credentials = { accessKeyId: required(env, "BACKUP_S3_ACCESS_KEY_ID"), secretAccessKey: required(env, "BACKUP_S3_SECRET_ACCESS_KEY") };
  const client = new S3Client({ region, credentials, maxAttempts: 3 });
  const r2 = () => {
    const endpoint = required(env, "BACKUP_R2_ENDPOINT");
    if (!/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com\/?$/.test(endpoint)) throw new Error("Invalid BACKUP_R2_ENDPOINT.");
    const sourceCredentials = { accessKeyId: required(env, "BACKUP_R2_ACCESS_KEY_ID"), secretAccessKey: required(env, "BACKUP_R2_SECRET_ACCESS_KEY") };
    if (sourceCredentials.accessKeyId === credentials.accessKeyId || sourceCredentials.secretAccessKey === credentials.secretAccessKey) throw new Error("Backup and source credentials must be independent.");
    return { client: new S3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: sourceCredentials, requestChecksumCalculation: "WHEN_REQUIRED", maxAttempts: 3 }), bucket: required(env, "BACKUP_R2_BUCKET") };
  };
  return { client, Bucket, region, kms, credentials, r2 };
}
export type Receipt = { key: string; versionId: string; size: number; sha256: string };
export type BackupStore = ReturnType<typeof createBackupStore>;
export function createBackupStore(config: ReturnType<typeof backupClients>) {
  const { client, Bucket, kms } = config;
  async function head(key: string, versionId?: string) {
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket, Key: key, VersionId: versionId, ChecksumMode: "ENABLED" }));
      return { key, versionId: result.VersionId ?? "", size: result.ContentLength ?? -1, sha256: result.ChecksumSHA256 ? Buffer.from(result.ChecksumSHA256, "base64").toString("hex") : "", retainUntil: result.ObjectLockRetainUntilDate, encryption: result.ServerSideEncryption, kms: result.SSEKMSKeyId };
    } catch (error) {
      if (error && typeof error === "object" && "$metadata" in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404) return null;
      throw error;
    }
  }
  async function verify(receipt: Receipt, until?: Date) {
    const result = await head(receipt.key, receipt.versionId);
    if (!result || result.size !== receipt.size || result.sha256 !== receipt.sha256 || !result.versionId || result.encryption !== "aws:kms" || result.kms !== kms || (until && (!result.retainUntil || result.retainUntil.getTime() < until.getTime()))) throw new Error("Backup object verification failed.");
  }
  async function put(key: string, body: Uint8Array | string, until: Date, file = false): Promise<Receipt> {
    const size = file ? (await stat(String(body))).size : Buffer.byteLength(body);
    if (size > 2 * 1024 ** 3) throw new Error("Backup object exceeds the 2 GiB runner bound.");
    const sha256 = file ? await fileHash(String(body)) : hash(body);
    const result = await client.send(new PutObjectCommand({ Bucket, Key: key, Body: file ? createReadStream(String(body)) : body, ContentLength: size,
      ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"), ServerSideEncryption: "aws:kms", SSEKMSKeyId: kms,
      ObjectLockMode: "COMPLIANCE", ObjectLockRetainUntilDate: until }));
    const receipt = { key, versionId: result.VersionId ?? "", size, sha256 };
    await verify(receipt, until); return receipt;
  }
  return {
    head, verify, put,
    async protect(receipt: Receipt, until: Date) {
      const existing = await head(receipt.key, receipt.versionId);
      if (!existing) throw new Error("Backup object is missing.");
      if (!existing.retainUntil || existing.retainUntil < until) await client.send(new PutObjectRetentionCommand({ Bucket, Key: receipt.key, VersionId: receipt.versionId, Retention: { Mode: "COMPLIANCE", RetainUntilDate: until } }));
      await verify(receipt, until);
    },
    async get(key: string, versionId?: string, max = 32 * 1024 * 1024) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key: key, VersionId: versionId }));
      return boundedBody(result.Body, max);
    },
    async downloadFile(receipt: Receipt, path: string) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key: receipt.key, VersionId: receipt.versionId }));
      if (!result.Body || !Number.isSafeInteger(receipt.size) || receipt.size > 2 * 1024 ** 3) throw new Error("Invalid backup object.");
      let bytes = 0; const digest = createHash("sha256");
      await pipeline(Readable.from(result.Body as AsyncIterable<Uint8Array>), new Transform({ transform(chunk, _encoding, done) {
        bytes += chunk.length; digest.update(chunk); done(bytes > receipt.size ? new Error("Backup object exceeds expected size.") : null, chunk);
      } }), createWriteStream(path, { flags: "wx", mode: 0o600 }));
      if (bytes !== receipt.size || digest.digest("hex") !== receipt.sha256) throw new Error("Backup object checksum mismatch.");
    },
    async verifyConfiguration() {
      const [block, encryption, versioning, locking] = await Promise.all([
        client.send(new GetPublicAccessBlockCommand({ Bucket })), client.send(new GetBucketEncryptionCommand({ Bucket })),
        client.send(new GetBucketVersioningCommand({ Bucket })), client.send(new GetObjectLockConfigurationCommand({ Bucket })),
      ]);
      const access = block.PublicAccessBlockConfiguration;
      if (!access || !access.BlockPublicAcls || !access.IgnorePublicAcls || !access.BlockPublicPolicy || !access.RestrictPublicBuckets || versioning.Status !== "Enabled" || locking.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled") throw new Error("Backup bucket must be private, versioned and Object Lock enabled.");
      const retention = locking.ObjectLockConfiguration.Rule?.DefaultRetention;
      if (retention?.Mode !== "COMPLIANCE" || ((retention.Days ?? 0) < 30 && (retention.Years ?? 0) < 1)) throw new Error("Backup bucket needs at least 30 days of default COMPLIANCE retention.");
      if (!encryption.ServerSideEncryptionConfiguration?.Rules?.some((rule) => rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm === "aws:kms" && rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID === kms)) throw new Error("Backup bucket KMS configuration does not match BACKUP_S3_KMS_KEY_ID (use the full key ARN).");
    },
  };
}
export async function boundedBody(body: unknown, max: number): Promise<Buffer> {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) throw new Error("Object body unavailable.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for await (const chunk of body as AsyncIterable<Uint8Array>) { size += chunk.length; if (size > max) throw new Error("Object exceeds byte limit."); chunks.push(chunk); }
  } finally { if ("destroy" in body && typeof body.destroy === "function") body.destroy(); }
  return Buffer.concat(chunks, size);
}
