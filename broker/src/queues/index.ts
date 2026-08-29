import { Queue } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";

// Shared Redis connection for BullMQ
export const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Job Payload Types
export interface StabilityJobPayload {
  coalition: string[];
  profiles?: Record<string, any>;
  allocationMechanism?: string;
}

export interface PersuasionJobPayload {
  agentId: string;
  targetBelief: number;
}

export interface QreCalibrationJobPayload {
  historyIds: string[];
}

export interface GridJobPayload {
  negotiationId: string;
  nodes: any[];
  lines: any[];
}

// Instantiate queues
export const stabilityQueue = new Queue<StabilityJobPayload>("stability-jobs", { connection });
export const persuasionQueue = new Queue<PersuasionJobPayload>("persuasion-jobs", { connection });
export const qreCalibrationQueue = new Queue<QreCalibrationJobPayload>("qre-calibration-jobs", { connection });
export const gridQueue = new Queue<GridJobPayload>("grid-jobs", { connection });

export async function closeQueues() {
  try {
    await stabilityQueue.close();
    await persuasionQueue.close();
    await qreCalibrationQueue.close();
    await gridQueue.close();
    await connection.quit();
  } catch (_) { /* ignore */ }
}
