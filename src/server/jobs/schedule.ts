import "server-only";
import { after } from "next/server";
import { getDatabase } from "@/server/db";
import { enqueueJob, runJobs } from "./index";
import { jobHandlers } from "./handlers";

export function scheduleJobs(ownerId: string) {
  after(async () => {
    try {
      const db = getDatabase();
      const hour = new Date().toISOString().slice(0, 13);
      await enqueueJob(db, { ownerId, kind: "maintenance", deduplicationKey: `maintenance:${ownerId}:${hour}`, payload: {} });
      await runJobs(db, ownerId, jobHandlers(db));
    } catch {
      console.error(JSON.stringify({ event: "job.runner_failed" }));
    }
  });
}
