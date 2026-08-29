"""engine/app/rag/resilience.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
External Data Connector Resilience.

Provides:
  - ``retry_with_backoff``  : tenacity-based retry decorator (exponential + jitter).
  - ``CircuitBreaker``      : trips after N consecutive failures, half-opens after cooldown.
  - ``ResilientConnector``  : wraps a BaseConnector with retry + circuit-breaker + stale-cache.

Design assumptions (recorded in docs/ASSUMPTIONS.md §):
  - A "failure" is any exception raised by ``BaseConnector.fetch_signals``.
  - The circuit breaker is per-connector instance, not shared across the process.
  - Stale cache entries are surfaced via ``stale=True`` in the returned ``CachedSignal``
    objects and the Oracle MUST down-weight them (see inference.py §stale-weight).
  - Rate limiter state is stored in-process (not Redis) for simplicity; a production
    deployment should use a Redis token-bucket so multiple replicas share the quota.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from functools import wraps
from typing import Any, Callable, List, TypeVar

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
    RetryError,
)

from app.rag.connectors import BaseConnector, RawDocument
from app.rag.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


# ─── Stale-flagged signal wrapper ─────────────────────────────────────────────


@dataclass
class CachedSignal:
    """A (possibly stale) signal from the cache or a fresh fetch.

    Attributes
    ----------
    documents:
        The list of RawDocument objects returned by the connector.
    stale:
        True if the documents were served from last-known-good cache due to
        a circuit-open condition; False for fresh data.
    fetched_at:
        Unix timestamp when the documents were either fetched or read from cache.
    """

    documents: List[RawDocument]
    stale: bool = False
    fetched_at: float = field(default_factory=time.time)


# ─── Circuit breaker ──────────────────────────────────────────────────────────


class CircuitState(Enum):
    CLOSED = auto()    # Normal operation
    OPEN = auto()      # Tripped – fast-fail, serve stale cache
    HALF_OPEN = auto() # One probe allowed after cooldown


class CircuitBreaker:
    """Trip-after-N-failures circuit breaker with configurable cooldown.

    Parameters
    ----------
    failure_threshold:
        Number of consecutive failures before the circuit trips.
    cooldown_seconds:
        Seconds to wait in OPEN state before allowing a half-open probe.
    connector_name:
        Human-readable name for log messages.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        cooldown_seconds: float = 60.0,
        connector_name: str = "connector",
    ) -> None:
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.connector_name = connector_name

        self._state = CircuitState.CLOSED
        self._consecutive_failures = 0
        self._opened_at: float | None = None
        self._lock = threading.Lock()

    @property
    def state(self) -> CircuitState:
        with self._lock:
            return self._effective_state()

    def _effective_state(self) -> CircuitState:
        """Check whether we should auto-transition OPEN → HALF_OPEN."""
        if self._state == CircuitState.OPEN and self._opened_at is not None:
            elapsed = time.monotonic() - self._opened_at
            if elapsed >= self.cooldown_seconds:
                logger.info(
                    "[CircuitBreaker:%s] Cooldown elapsed (%.1fs); entering HALF_OPEN",
                    self.connector_name,
                    elapsed,
                )
                self._state = CircuitState.HALF_OPEN
        return self._state

    def record_success(self) -> None:
        """Reset failure counter and close the circuit."""
        with self._lock:
            prev = self._state
            self._consecutive_failures = 0
            self._state = CircuitState.CLOSED
            self._opened_at = None
            if prev != CircuitState.CLOSED:
                logger.info(
                    "[CircuitBreaker:%s] Circuit CLOSED after successful probe.",
                    self.connector_name,
                )

    def record_failure(self) -> None:
        """Increment failure counter and open the circuit if threshold is reached."""
        with self._lock:
            self._consecutive_failures += 1
            if self._state in (CircuitState.CLOSED, CircuitState.HALF_OPEN):
                if self._consecutive_failures >= self.failure_threshold:
                    self._state = CircuitState.OPEN
                    self._opened_at = time.monotonic()
                    logger.warning(
                        "[CircuitBreaker:%s] Circuit OPEN after %d consecutive failures.",
                        self.connector_name,
                        self._consecutive_failures,
                    )

    def is_open(self) -> bool:
        """Return True if the circuit is currently OPEN (fast-fail mode)."""
        return self.state == CircuitState.OPEN


# ─── Retry decorator ──────────────────────────────────────────────────────────


def retry_with_backoff(
    max_attempts: int = 3,
    min_wait: float = 1.0,
    max_wait: float = 30.0,
) -> Callable[[F], F]:
    """Return a tenacity retry decorator with exponential backoff + jitter.

    Parameters
    ----------
    max_attempts:
        Total attempts before raising ``RetryError``.
    min_wait:
        Minimum wait in seconds between retries.
    max_wait:
        Maximum wait in seconds between retries.
    """
    return retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1.5, min=min_wait, max=max_wait),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )


# ─── Resilient connector ──────────────────────────────────────────────────────


class ResilientConnector:
    """Wraps a ``BaseConnector`` with retry, circuit breaker, and stale-cache fallback.

    Parameters
    ----------
    inner:
        The underlying connector (WeatherConnector, GridLoadConnector, etc.).
    circuit_breaker:
        Pre-configured CircuitBreaker instance.
    rate_limiter:
        Pre-configured RateLimiter instance.
    max_retry_attempts:
        Number of attempts per call before giving up and checking stale cache.
    """

    def __init__(
        self,
        inner: BaseConnector,
        circuit_breaker: CircuitBreaker,
        rate_limiter: RateLimiter,
        max_retry_attempts: int = 3,
    ) -> None:
        self._inner = inner
        self._cb = circuit_breaker
        self._rl = rate_limiter
        self._max_attempts = max_retry_attempts
        self._last_good_cache: CachedSignal | None = None

    def fetch(self, **kwargs: Any) -> CachedSignal:
        """Fetch signals with retry, circuit-breaker, and stale-cache semantics.

        Returns a ``CachedSignal`` where ``stale=True`` indicates the data
        was served from the last-known-good cache due to a circuit-open or
        repeated failure condition.
        """
        # Fast-fail if circuit is OPEN
        if self._cb.is_open():
            logger.warning(
                "[ResilientConnector] Circuit is OPEN for %s; serving stale cache.",
                self._cb.connector_name,
            )
            return self._stale_or_raise()

        # Apply rate limiting (raises if quota is exceeded)
        self._rl.acquire()

        # Attempt fetch with retries
        @retry_with_backoff(max_attempts=self._max_attempts)
        def _do_fetch() -> List[RawDocument]:
            return self._inner.fetch(**kwargs)

        try:
            docs = _do_fetch()
            self._inner.validate(docs)
            self._cb.record_success()
            result = CachedSignal(documents=docs, stale=False)
            self._last_good_cache = result
            return result
        except (RetryError, Exception) as exc:
            self._cb.record_failure()
            logger.error(
                "[ResilientConnector] All retries failed for %s: %s",
                self._cb.connector_name,
                exc,
            )
            return self._stale_or_raise()

    def _stale_or_raise(self) -> CachedSignal:
        """Return last-known-good cache with stale flag, or raise if no cache exists."""
        if self._last_good_cache is not None:
            return CachedSignal(
                documents=self._last_good_cache.documents,
                stale=True,
                fetched_at=self._last_good_cache.fetched_at,
            )
        raise Exception(
            f"EXTERNAL_CONTEXT_UNAVAILABLE: No cached data available for {self._cb.connector_name} and circuit is open."
        )
