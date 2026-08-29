"""engine/app/rag/rate_limiter.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Per-connector token-bucket rate limiter.

ASSUMPTION (§): Documented API quotas used for each connector:
  - Weather   : 60 calls/minute (OpenWeatherMap free tier).
  - GridLoad  : 120 calls/minute (typical ISO/RTO data feeds).
  - Regulatory: 30 calls/minute (conservative; static docs don't need more).

State is stored in-process. In a multi-replica deployment, a Redis-backed
token bucket should be used instead (noted as TODO in production roadmap).
"""

from __future__ import annotations

import threading
import time


class RateLimiter:
    """Thread-safe token-bucket rate limiter.

    Parameters
    ----------
    calls_per_second:
        Maximum sustained call rate (fractional calls allowed, e.g. 1.0/s).
    burst:
        Maximum token accumulation (allows short bursts above the sustained rate).
    connector_name:
        Human-readable identifier for log messages and error text.
    """

    def __init__(
        self,
        calls_per_second: float,
        burst: int = 5,
        connector_name: str = "connector",
    ) -> None:
        self.calls_per_second = calls_per_second
        self.burst = burst
        self.connector_name = connector_name

        self._tokens: float = float(burst)
        self._last_refill: float = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        """Add tokens proportional to elapsed time since last call."""
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.burst, self._tokens + elapsed * self.calls_per_second)
        self._last_refill = now

    def acquire(self) -> None:
        """Acquire one token, blocking briefly or raising if quota is exhausted.

        Raises
        ------
        RuntimeError
            If no tokens are available (call exceeded quota).
        """
        with self._lock:
            self._refill()
            if self._tokens >= 1.0:
                self._tokens -= 1.0
            else:
                raise RuntimeError(
                    f"Rate limit exceeded for {self.connector_name}: "
                    f"quota is {self.calls_per_second:.2f} calls/s "
                    f"(current tokens: {self._tokens:.3f})"
                )

    @classmethod
    def for_weather(cls) -> "RateLimiter":
        """Preconfigured limiter for the Weather API (60 req/min = 1 req/s)."""
        return cls(calls_per_second=1.0, burst=5, connector_name="weather")

    @classmethod
    def for_grid_load(cls) -> "RateLimiter":
        """Preconfigured limiter for the GridLoad API (120 req/min = 2 req/s)."""
        return cls(calls_per_second=2.0, burst=10, connector_name="grid_load")

    @classmethod
    def for_regulatory(cls) -> "RateLimiter":
        """Preconfigured limiter for the Regulatory API (30 req/min = 0.5 req/s)."""
        return cls(calls_per_second=0.5, burst=3, connector_name="regulatory")
