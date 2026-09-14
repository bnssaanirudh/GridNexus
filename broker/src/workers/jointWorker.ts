import { Worker, Job } from "bullmq";
import axios from "axios";
import { connection, qPrefix } from "../queues/index.js";
import dotenv from "dotenv";

dotenv.config();

const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:8000";

export const jointWorker = new Worker(
  `${qPrefix}joint-jobs`,
  async (job: Job) => {
    try {
      const payload = {
        negotiation_id: job.data.negotiationId,
        stability_request: {
          coalition: job.data.coalition,
          profiles: job.data.profiles,
          allocation_mechanism: "least_core",
        },
        nodes: job.data.nodes,
        lines: job.data.lines
      };
      
      const response = await axios.post(`${ENGINE_URL}/oracle/joint-verify`, payload);
      const data = response.data;
      
      if (!data.passed) {
         return {
            certId: data.grid_certificate ? data.grid_certificate.resultHash : null,
            isFeasible: data.grid_certificate ? data.grid_certificate.feasible : false,
            isStable: data.stability_response.isStable,
            margin: data.stability_response.margin,
            violatingDeviation: data.stability_response.deviating_coalition ? JSON.stringify(data.stability_response.deviating_coalition) : null
         };
      }
      
      return {
          certId: data.grid_certificate.resultHash,
          isFeasible: true,
          isStable: true,
          margin: data.stability_response.margin
      };
    } catch (err: any) {
      console.error(`[JointWorker] Error verifying joint certificate: ${err.message}`);
      throw err;
    }
  },
  { connection }
);
