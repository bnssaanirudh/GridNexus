import asyncio
import time
import httpx
from collections import Counter
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.main import app

async def run_load_test(total_requests: int = 1000, concurrency: int = 100):
    print(f"Starting Load Benchmark: {total_requests} requests at concurrency {concurrency}...")
    
    # 3-agent coalition payload
    payload = {
        "coalition": ["opsd_1", "opsd_2", "opsd_3"],
        "profiles": {
            "opsd_1": {"role": "SELLER", "generation_cost": 10.0, "available_capacity": 50.0},
            "opsd_2": {"role": "SELLER", "generation_cost": 12.0, "available_capacity": 40.0},
            "opsd_3": {"role": "BUYER", "energy_value": 20.0, "demand": 80.0},
        }
    }

    async def worker(client, num_reqs):
        latencies = []
        status_codes = []
        for _ in range(num_reqs):
            t0 = time.perf_counter()
            resp = await client.post("/stability/verify", json=payload)
            t1 = time.perf_counter()
            latencies.append(t1 - t0)
            status_codes.append(resp.status_code)
        return latencies, status_codes

    # Using ASGITransport allows testing the FastAPI application directly in-memory,
    # capturing the exact async overhead and throughput capabilities without network latency.
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        reqs_per_worker = total_requests // concurrency
        tasks = [worker(client, reqs_per_worker) for _ in range(concurrency)]
        
        t_start = time.perf_counter()
        results = await asyncio.gather(*tasks)
        t_end = time.perf_counter()

    all_latencies = []
    all_status = []
    for lats, stats in results:
        all_latencies.extend(lats)
        all_status.extend(stats)

    total_time = t_end - t_start
    throughput = len(all_latencies) / total_time
    avg_latency = (sum(all_latencies) / len(all_latencies)) * 1000

    print("=" * 40)
    print("      SCALABILITY BENCHMARK REPORT      ")
    print("=" * 40)
    print(f"Total Requests: {len(all_latencies)}")
    print(f"Concurrency:    {concurrency} workers")
    print(f"Total Time:     {total_time:.2f}s")
    print(f"Throughput:     {throughput:.2f} req/sec")
    print(f"Avg Latency:    {avg_latency:.2f} ms")
    print(f"Status Codes:   {dict(Counter(all_status))}")
    print("=" * 40)

if __name__ == "__main__":
    asyncio.run(run_load_test(total_requests=1000, concurrency=50))
