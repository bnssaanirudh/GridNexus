"""
load-tests/negotiation-load.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GridNexus Locust fallback load test.

Provides identical 200-concurrent-agent simulation using Locust when k6
is not available in the CI environment.

ASSUMPTION : Locust is installed via `pip install locust`. The
k6 script is the primary tool; this is a documented fallback. Both produce
p50/p95/p99 latency data.

Usage:
    locust -f load-tests/negotiation-load.py \
           --host http://localhost:3000 \
           --users 200 \
           --spawn-rate 20 \
           --run-time 120s \
           --headless \
           --csv load-tests/results/locust
"""

from __future__ import annotations

import json
import random
import time
from locust import HttpUser, task, between, events
from locust.runners import MasterRunner


class MicrogridAgentUser(HttpUser):
    """
    Simulates a single microgrid agent participating in GridNexus.

    Each VU represents one agent executing the full negotiation loop:
      1. Check broker health (liveness)
      2. Poll oracle signals (grid state)
      3. Fetch analytics (simulate negotiation round state)
      4. Fetch topology (simulate stability awareness)
    """

    wait_time = between(0.1, 0.5)  # Inter-round think time

    def on_start(self) -> None:
        """Called once when a simulated user starts."""
        self.agent_id = f"load-agent-{id(self)}"

    @task(1)
    def health_check(self) -> None:
        """Broker liveness probe – always fast."""
        with self.client.get("/health", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Health check failed: {resp.status_code}")

    @task(3)
    def oracle_signal_poll(self) -> None:
        """Agent polling oracle for grid conditions."""
        with self.client.get("/api/oracle-signals", name="/api/oracle-signals", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Oracle signals failed: {resp.status_code}")
            else:
                resp.success()

    @task(5)
    def negotiation_round(self) -> None:
        """Simulates one negotiation round via analytics endpoint."""
        with self.client.get("/api/analytics", name="/api/analytics [negotiation round]", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Analytics endpoint failed: {resp.status_code}")
            else:
                try:
                    body = resp.json()
                    if "summary" not in body:
                        resp.failure("Response missing 'summary' field")
                    else:
                        resp.success()
                except json.JSONDecodeError:
                    resp.failure("Non-JSON response from /api/analytics")

    @task(4)
    def stability_check(self) -> None:
        """Agent checking planar graph topology (Stability Gate)."""
        with self.client.get("/api/topology", name="/api/topology [stability]", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Topology endpoint failed: {resp.status_code}")
            else:
                try:
                    body = resp.json()
                    if "nodes" not in body or not isinstance(body["nodes"], list):
                        resp.failure("Topology response missing nodes")
                    else:
                        resp.success()
                except json.JSONDecodeError:
                    resp.failure("Non-JSON response from /api/topology")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs) -> None:
    """Print p50/p95/p99 summary to stdout on completion."""
    stats = environment.stats
    print("\n" + "=" * 60)
    print("GridNexus Load Test – Latency Summary")
    print("=" * 60)
    for name, entry in stats.entries.items():
        p50  = entry.get_response_time_percentile(0.50) or 0
        p95  = entry.get_response_time_percentile(0.95) or 0
        p99  = entry.get_response_time_percentile(0.99) or 0
        print(f"  {name}: p50={p50:.0f}ms  p95={p95:.0f}ms  p99={p99:.0f}ms")
    total = stats.total
    print(f"\nTotal requests: {total.num_requests}")
    print(f"Failures:       {total.num_failures}")
    print(f"Failure rate:   {total.fail_ratio*100:.2f}%")
    p99_total = total.get_response_time_percentile(0.99) or 0
    result = "✅ PASS" if p99_total < 2000 and total.fail_ratio < 0.01 else "❌ FAIL"
    print(f"\np99 overall: {p99_total:.0f}ms  →  {result}")
    print("=" * 60)
