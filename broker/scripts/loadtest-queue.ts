import { enqueueStabilityCheck } from "../src/queues/stabilityQueue.js";
import { stabilityQueue } from "../src/queues/index.js";

async function runLoadTest() {
  console.log("Starting 500 job load test...");
  
  // Clear queue
  await stabilityQueue.drain();
  await stabilityQueue.clean(0, 1000, "completed");
  await stabilityQueue.clean(0, 1000, "failed");
  
  const JOBS_COUNT = 500;
  
  // Array to hold latencies
  const latencies: number[] = [];
  let isMeasuring = true;

  // Polling function to measure /health latency while enqueuing and processing
  const measureHealth = async () => {
    while (isMeasuring) {
      const start = Date.now();
      try {
        await fetch("http://localhost:3000/health");
      } catch (e) {
        // ignore
      }
      latencies.push(Date.now() - start);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  // Start measuring
  measureHealth();

  // Enqueue 500 jobs concurrently
  const promises = [];
  for (let i = 0; i < JOBS_COUNT; i++) {
    promises.push(enqueueStabilityCheck([`mg-${i}`]));
  }
  
  await Promise.all(promises);
  console.log("All 500 jobs enqueued.");

  // Wait for all to finish processing
  while (true) {
    const counts = await stabilityQueue.getJobCounts('completed', 'failed');
    if (counts.completed + counts.failed >= JOBS_COUNT) {
      console.log(`Processing complete. Completed: ${counts.completed}, Failed: ${counts.failed}`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  isMeasuring = false;

  // Calculate p50, p95, p99
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

  console.log("Health Check Latencies during burst:");
  console.log(`p50: ${p50}ms`);
  console.log(`p95: ${p95}ms`);
  console.log(`p99: ${p99}ms`);

  if (p99 >= 50) {
    console.warn("WARNING: p99 latency exceeds 50ms requirement!");
  } else {
    console.log("SUCCESS: p99 latency is strictly under 50ms.");
  }
  
  process.exit(0);
}

runLoadTest().catch(console.error);
