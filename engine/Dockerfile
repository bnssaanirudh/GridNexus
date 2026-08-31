# ==============================================================================
# GridNexus Layer 1: Engine – Multi-Stage Production Dockerfile
# Python 3.11, FastAPI, PyTorch, PettingZoo, NetworkX
# ==============================================================================

# ── Stage 1: Build & Dependency Installation ──────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build prerequisites
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the lockfile first so dependency layers are deterministic and cacheable.
COPY pyproject.toml poetry.lock ./

# Export exact versions from poetry.lock. PyTorch is deliberately installed from
# the CPU index; CUDA-only transitive packages are excluded from this service.
RUN python3 -m venv /app/.venv && \
    /app/.venv/bin/pip install --no-cache-dir poetry==2.1.4 poetry-plugin-export==1.9.0 && \
    /app/.venv/bin/poetry check --lock && \
    /app/.venv/bin/poetry export --only main --without-hashes --format requirements.txt --output requirements.lock.txt && \
    sed -i '/^torch==/d; /^cuda-/d; /^nvidia-/d' requirements.lock.txt && \
    /app/.venv/bin/pip install --no-cache-dir torch==2.4.0 --index-url https://download.pytorch.org/whl/cpu && \
    /app/.venv/bin/pip install --no-cache-dir -r requirements.lock.txt

RUN find /app/.venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# ── Stage 2: Minimal Production Runtime ────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Install runtime shared libraries (libgomp for PyTorch, curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged system user
RUN groupadd -g 10001 gridnexus && \
    useradd -u 10001 -g gridnexus -s /bin/sh -m gridnexus

# Copy virtualenv and application code from builder
COPY --from=builder --chown=gridnexus:gridnexus /app/.venv /app/.venv
COPY --chown=gridnexus:gridnexus . /app/

# Environment configuration
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Run as unprivileged non-root user
USER gridnexus

# Liveness probe on port 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
