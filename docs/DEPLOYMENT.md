# GridNexus Deployment & Secrets Management Guide

This document defines the production packaging, containerization, deployment procedures, and secrets-management architecture for the GridNexus Virtual Power Plant platform.

---

## 1. Containerization Architecture

All GridNexus services are packaged as **multi-stage, production-grade Docker images** optimized for security, minimal footprint, and zero credential leakage.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MULTI-STAGE BUILD PATTERN                        │
├──────────────────────────────────────┬──────────────────────────────────────┤
│           STAGE 1: BUILDER           │           STAGE 2: RUNTIME           │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Full build dependencies & compilers │ • Minimal base OS (slim / alpine)    │
│ • Package managers (Poetry / npm)    │ • Non-root user (UID 10001 / 1000)   │
│ • Compiles TypeScript / virtualenvs  │ • ONLY production runtime artifacts  │
│ • Discarded after build step         │ • Zero secrets, build tools, or dev  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### Security & Hardening Standards
- **Non-Root Execution**:
  - `engine`: Runs as `gridnexus` (UID `10001`, GID `10001`).
  - `broker`: Runs as `node` (UID `1000`, GID `1000`).
  - `command-center`: Runs as `nginx` (UID `101`, GID `101`).
- **Base Images**: `python:3.11-slim`, `node:20-alpine`, `nginx:1.27-alpine-slim`.
- **Zero Secrets in Layers**: `.dockerignore` strictly excludes `.env*`, `*.local`, `node_modules`, `.venv`, and temporary caches from entering the Docker build context.

---

## 2. Secrets Management Architecture

### Threat Model & Policy
1. **Never Bake Secrets**: Under no circumstances may credentials, tokens, or private keys be placed in `Dockerfile` commands, build arguments, or committed Git files.
2. **Runtime Injection**: All secrets must be injected at container runtime via environment variables or volume mounts backed by a secure key-management service (KMS).

### Secrets Inventory

| Secret Variable | Description | Target Services |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string with password | `broker`, `engine` |
| `POSTGRES_PASSWORD` | PostgreSQL database administrator password | `postgres`, `broker` |
| `REDIS_URL` | Redis connection URI with authentication | `broker`, `broker-worker`, `engine` |
| `JWT_SECRET` | 64-character cryptographic signing secret | `broker`, `engine` |
| `LLM_API_KEY` | Upstream LLM provider API token (OpenAI/Anthropic) | `engine` |

---

## 3. Production Kubernetes Deployment

### Manifest Inventory (`deploy/k8s/`)

```
deploy/k8s/
├── namespace.yaml          # Dedicated 'gridnexus' namespace
├── secret.template.yaml    # Secret template documentation (no real secrets)
├── configmap.yaml          # Non-sensitive cluster configuration
├── postgres.yaml           # StatefulSet + Service + PersistentVolumeClaim
├── redis.yaml              # Deployment + Service for BullMQ
├── engine.yaml             # Layer 1 Deployment (2 replicas) + ClusterIP
├── broker.yaml             # Layer 2 Deployment + BullMQ Worker + ClusterIP
└── command-center.yaml     # Layer 3 Deployment (2 replicas) + NodePort
```

### Step 1: Create Namespace and Secrets

Generate a real Kubernetes secret from command line or KMS without committing the file:
```bash
kubectl apply -f deploy/k8s/namespace.yaml

kubectl create secret generic gridnexus-secrets \
  --namespace=gridnexus \
  --from-literal=DATABASE_URL='postgresql://gridnexus:<SECURE_PASSWORD>@postgres:5432/gridnexus' \
  --from-literal=POSTGRES_USER='gridnexus' \
  --from-literal=POSTGRES_PASSWORD='<SECURE_PASSWORD>' \
  --from-literal=POSTGRES_DB='gridnexus' \
  --from-literal=REDIS_URL='redis://redis:6379/0' \
  --from-literal=JWT_SECRET='$(openssl rand -hex 32)' \
  --from-literal=LLM_API_KEY='<YOUR_API_KEY>'
```

### Step 2: Apply ConfigMap & Infrastructure

```bash
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/postgres.yaml
kubectl apply -f deploy/k8s/redis.yaml
```

### Step 3: Deploy Application Services

```bash
kubectl apply -f deploy/k8s/engine.yaml
kubectl apply -f deploy/k8s/broker.yaml
kubectl apply -f deploy/k8s/command-center.yaml
```

### Step 4: Verify Rollout & Probes

```bash
kubectl rollout status deployment/engine -n gridnexus
kubectl rollout status deployment/broker -n gridnexus
kubectl rollout status deployment/command-center -n gridnexus
kubectl get pods -n gridnexus
```

---

## 4. Production Docker Compose Deployment

For single-host production or staging environments, use the production compose override:

```bash
# Validate production configuration
docker compose -f docker-compose.yml -f docker-compose.prod.yml config

# Start production stack in background
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Production Resource Allocations

| Service | CPU Limit | Memory Limit | CPU Reservation | Memory Reservation |
| :--- | :--- | :--- | :--- | :--- |
| `engine` | 4.0 cores | 4096 MB | 1.0 core | 1024 MB |
| `broker` | 2.0 cores | 2048 MB | 0.5 core | 512 MB |
| `broker-worker` | 2.0 cores | 2048 MB | 0.5 core | 512 MB |
| `postgres` | 2.0 cores | 2048 MB | 0.5 core | 512 MB |
| `redis` | 1.0 core | 1024 MB | 0.2 core | 256 MB |
| `command-center`| 1.0 core | 512 MB | 0.1 core | 128 MB |

---

## 5. Health & Readiness Probes Specification

### Liveness Probes
- **Engine**: `GET http://localhost:8000/health` &rarr; Returns `{"status": "ok"}` (200 OK) confirming the FastAPI event loop is running.
- **Broker**: `GET http://localhost:3000/health` &rarr; Returns `{"status": "ok"}` (200 OK) confirming the Express server is accepting requests.
- **Command Center**: `GET http://localhost:5173/healthz` &rarr; Returns HTTP 200 from Nginx.

### Readiness Probes
- **Engine Readiness (`GET /ready`)**:
  - Probes live PostgreSQL database connectivity (`SELECT 1`).
  - Probes live Redis connectivity (`PING`).
  - Returns `HTTP 200 {"status": "ok", "db": "up", "redis": "up"}` if all backing dependencies are operational.
  - Returns `HTTP 503 {"status": "error", "db": "down", ...}` if any dependency is unreachable, immediately removing the Pod from the load-balancer service pool.

---

## 6. Verification & Security Audit Commands

### 1. Verify No Secrets in Image Layers
```bash
docker history --no-trunc gridnexus/engine:latest
docker history --no-trunc gridnexus/broker:latest
docker history --no-trunc gridnexus/command-center:latest
```
Ensure no output contains passwords, API keys, or `.env` contents.

### 2. Validate Compose Configuration
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

### 3. Verify Non-Root User Execution
```bash
docker run --rm gridnexus/engine:latest id
# Expected output: uid=10001(gridnexus) gid=10001(gridnexus)

docker run --rm gridnexus/broker:latest id
# Expected output: uid=1000(node) gid=1000(node)
```
