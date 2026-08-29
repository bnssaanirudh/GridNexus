/**
 * broker/src/queues/integrityQueue.ts
 * ────────────────────────────────────
 * Integrity Check Queue
 * 
 * Configures a nightly BullMQ repeatable job to run the integrity checker.
 */

import { Queue, Worker, Job } from "bullmq";
import { connection } from "./index.js";
import { runIntegrityCheck } from "../jobs/integrityCheck.js";

export const integrityQueue = new Queue("integrity-jobs", { connection });

const INTEGRITY_JOB_KEY = "nightly-integrity-check";

/**
 * Schedules the integrity check to run every night at midnight.
 */
export async function scheduleIntegrityCheck(): Promise<void> {
  // Cron for midnight every day
  const cronPattern = process.env.INTEGRITY_CRON ?? "0 0 * * *";

  await integrityQueue.upsertJobScheduler(
    INTEGRITY_JOB_KEY,
    { pattern: cronPattern },
    {
      name: INTEGRITY_JOB_KEY,
      data: {}
    }
  );

  console.log(`[IntegrityQueue] Nightly integrity check scheduled with cron: ${cronPattern}`);
}

// Instantiate the worker to process the integrity jobs
export const integrityWorker = new Worker(
  "integrity-jobs",
  async (job: Job) => {
    console.log(`[IntegrityWorker] Running scheduled integrity check job ${job.id}`);
    const isIntact = await runIntegrityCheck();
    if (!isIntact) {
      throw new Error("Integrity check failed! Tampering detected in audit tables.");
    }
    return { success: true };
  },
  { connection }
);

integrityWorker.on("completed", (job) => {
  console.log(`[IntegrityWorker] Job ${job.id} completed successfully. Data is intact.`);
});

integrityWorker.on("failed", (job, err) => {
  console.error(`[IntegrityWorker] Job ${job?.id} failed: ${err.message}`);
});
