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

# Copy dependency specifications
COPY pyproject.toml ./

# Install CPU PyTorch and production dependencies directly (strictly avoids 8GB+ CUDA packages)
RUN python3 -m venv /app/.venv && \
    /app/.venv/bin/pip install --no-cache-dir torch==2.4.0 --index-url https://download.pytorch.org/whl/cpu && \
    /app/.venv/bin/python -c "import tomllib; data = tomllib.load(open('pyproject.toml', 'rb'))['tool']['poetry']['dependencies']; lines = [f'{k}=={v}' if isinstance(v, str) and not v.startswith('^') and not v.startswith('>') and not v.startswith('<') else (f'{k}{v}' if isinstance(v, str) and (v.startswith('>=') or v.startswith('<')) else f'{k}') for k, v in data.items() if k != 'python']; open('requirements.txt', 'w').write('\n'.join(lines))" && \
    /app/.venv/bin/pip install --no-cache-dir -r requirements.txt && \
    find /app/.venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

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
