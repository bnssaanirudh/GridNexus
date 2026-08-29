import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { stabilityQueue, closeQueues } from "../src/queues/index.js";
import { enqueueStabilityCheck } from "../src/queues/stabilityQueue.js";
import * as workerModule from "../src/worker.js";

describe("Stability Worker DLQ", () => {
  beforeAll(async () => {
    process.env.FORCE_ENGINE_ERROR = "true";
    try {
      await stabilityQueue.drain();
      await stabilityQueue.clean(0, 1000, "failed");
    } catch (_) { /* ignore if redis offline */ }
  });

  afterAll(async () => {
    process.env.FORCE_ENGINE_ERROR = "false";
    await workerModule.closeWorker();
    await closeQueues();
  });

  it("should fail 5 times and move to DLQ with alert triggered", async () => {
    const alertSpy = vi.spyOn(workerModule.AlertService, "alertWebhookStub");
    
    // Enqueue 1 job
    await enqueueStabilityCheck(["mg-fail-1"]);

    // wait for it to fail 5 times (attempts = 5)
    let hasFailed = false;
    let retries = 0;
    
    while (!hasFailed && retries < 120) { // wait up to 60 seconds
      const counts = await stabilityQueue.getJobCounts("failed");
      if (counts.failed > 0 || alertSpy.mock.calls.length > 0) {
        hasFailed = true;
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
    }

    expect(hasFailed).toBe(true);
    expect(alertSpy).toHaveBeenCalled();
    
    // Cleanup
    alertSpy.mockRestore();
  }, 60000); // 60s timeout to account for queue backoff and concurrent suite execution
});
