import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/connection";
import type { Handlers } from "./index";
import { cleanupAttachment } from "@/server/services/attachments";

import { reconcileGithub } from "@/server/services/github/refresh";
import { expandGithubDelivery } from "@/server/services/github/webhook";

export function jobHandlers(db: Database): Handlers {
  const unavailable = async () => { throw new Error("Integration not yet implemented"); };
  return {
    github_sync: (job, signal) => job.payload.deliveryId ? expandGithubDelivery(db, job.ownerId, job.payload) : reconcileGithub(db, job.ownerId, job.payload, signal),
    attachment_cleanup: (job, signal) => cleanupAttachment(db, job.ownerId, job.payload, signal),
    export: unavailable,
    export_cleanup: unavailable,
    maintenance: async (job) => {
      await db.execute(sql`DELETE FROM idempotency_records WHERE id IN (SELECT id FROM idempotency_records WHERE owner_id = ${job.ownerId} AND expires_at < now() LIMIT 100)`);
      await db.execute(sql`DELETE FROM github_webhook_deliveries WHERE id IN (SELECT id FROM github_webhook_deliveries WHERE owner_id = ${job.ownerId} AND state = 'processed' AND processed_at < now() - interval '30 days' LIMIT 100)`);
      await db.execute(sql`INSERT INTO background_jobs (owner_id, kind, deduplication_key, payload)
        SELECT owner_id, 'attachment_cleanup', 'attachment-expired:' || id, jsonb_build_object('objectKey', object_key, 'attachmentId', id)
        FROM attachments WHERE owner_id = ${job.ownerId} AND state IN ('pending', 'verifying', 'failed') AND upload_expires_at < now() - interval '1 hour' AND NOT EXISTS (SELECT 1 FROM background_jobs j WHERE j.deduplication_key = 'attachment-expired:' || attachments.id) LIMIT 100 ON CONFLICT DO NOTHING`);
      await db.execute(sql`INSERT INTO background_jobs (owner_id, kind, deduplication_key, payload)
        SELECT owner_id, 'export_cleanup', 'export-expired:' || id, jsonb_build_object('objectKey', output_object_key, 'exportId', id)
        FROM exports WHERE owner_id = ${job.ownerId} AND output_object_key IS NOT NULL AND expires_at < now() AND NOT EXISTS (SELECT 1 FROM background_jobs j WHERE j.deduplication_key = 'export-expired:' || exports.id) LIMIT 100 ON CONFLICT DO NOTHING`);
    },
  };
}
