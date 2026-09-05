# GridNexus Demo Script

> **Prompt 30 deliverable** – Reproducible clean-checkout walkthrough.
>
> This script walks a presenter through a complete GridNexus demo from
> a fresh clone to a live, observable multi-agent energy trading session.
> Every command is copy-paste ready.

---

## Prerequisites

| Requirement | Min Version | Install |
|-------------|-------------|---------|
| Docker Desktop | 24.x | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Docker Compose | v2.x | included with Docker Desktop |
| Git | 2.x | [git-scm.com](https://git-scm.com/) |
| 8 GB free RAM | — | — |
| 6 GB free disk | — | — |

> [!IMPORTANT]
> The Engine image pulls PyTorch CPU-only (~2 GB). First `docker compose up --build`
> takes **5–10 minutes** on a fast connection. Subsequent starts take ~30 seconds.

---

## Step 1: Clone & Navigate

```bash
git clone https://github.com/Meet9315/GridNexus.git
cd GridNexus
```

---

## Step 2: Configure Environment

```bash
# Copy the example env file (no secrets required for demo)
cp .env.example .env          # if present, otherwise defaults are built-in
```

> [!NOTE]
> All services default to localhost ports. No external API keys are required.
> The AI Oracle uses a local sentence-transformer model that is downloaded
> automatically on first run.

---

## Step 3: Start the Full Stack

```bash
docker compose up --build -d
```

Expected output (truncated):
```
[+] Building ...  ✔ engine built
[+] Building ...  ✔ broker built
[+] Building ...  ✔ command-center built
[+] Running 5/5
 ✔ Container gridnexus-postgres        Healthy
 ✔ Container gridnexus-redis           Healthy
 ✔ Container gridnexus-engine          Healthy
 ✔ Container gridnexus-broker          Healthy
 ✔ Container gridnexus-command-center  Healthy
```

**Wait for all 5 containers to be `Healthy`:**
```bash
# Poll until all healthy (or timeout after 5 minutes)
docker compose ps
```

---

## Step 4: Verify Services

```bash
# Broker health (Layer 2)
curl http://localhost:3000/health
# → {"status":"ok"}

# Engine health (Layer 1)
curl http://localhost:8000/health
# → {"status":"ok"}

# Command Center (Layer 3 UI)
open http://localhost:5173     # macOS
start http://localhost:5173    # Windows
xdg-open http://localhost:5173 # Linux
```

---

## Step 5: Run the Automated Test Suite (Optional Validation)

```bash
# Broker integration tests (requires running stack)
cd broker && npm test && cd ..

# Engine unit + stability tests
cd engine && poetry run pytest -q && cd ..
```

---

## Step 6: Observe the Oracle → Belief → Stability → Trade Loop

### 6a. Watch the Oracle Broadcast

The Oracle broadcasts grid conditions every 10 seconds. Watch it live:

```bash
docker compose logs broker -f | grep "oracle"
```

Expected:
```
gridnexus-broker | [Oracle] Broadcasting signal: SOLAR_SURGE → 6 subscribers
```

### 6b. Open the Command Center Dashboard

Navigate to **http://localhost:5173** in your browser.

You should see:
- 📊 **Oracle Timeline** – live signal feed updating every 10 s
- 🔋 **Agent Beliefs** – each microgrid's current negotiation belief
- 🌍 **Topology Map** – planar graph showing line utilization
- 💹 **Trade Log** – committed energy transfers with prices

### 6c. Trigger a Live Negotiation Session

Open a second terminal and run our deterministic simulator:

```bash
cd broker
npx tsx scripts/demo-negotiation.ts
```

Watch the Command Center dashboard — you will see:
1. Rounds appearing in the Trade Log
2. Stability margin updating in real time
3. If coalition is stable: `TRADE COMMITTED` appears in green

### 6d. Load Test (Optional – Requires k6)

```bash
# Install k6 if not already installed
# https://k6.io/docs/get-started/installation/

./scripts/run_load_test.sh
# Runs 200 concurrent agents for 60 seconds
# Results written to load-tests/results/LOAD_TEST_REPORT.md
```

---

## Step 7: Explore the API

All API docs are available via FastAPI's built-in Swagger UI:

- **Engine API**: http://localhost:8000/docs
- **Engine ReDoc**: http://localhost:8000/redoc
- **Broker REST endpoints**: http://localhost:3000/api/analytics, /api/oracle-signals, /api/topology

---

## Step 8: Stop the Stack

```bash
docker compose down
# To also remove volumes (DB data):
docker compose down -v
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│              Layer 3: Command Center (React/Vite)        │
│              http://localhost:5173                       │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + Socket.IO
┌──────────────────────▼──────────────────────────────────┐
│              Layer 2: Broker (Express + BullMQ)          │
│              http://localhost:3000                       │
│  • Rubinstein bargaining (WebSocket /negotiate)          │
│  • Oracle broadcast queue (Redis/BullMQ)                 │
│  • Integrity check scheduler                             │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────┐
│              Layer 1: Engine (FastAPI + PyTorch)         │
│              http://localhost:8000                       │
│  • Stability solver (Shapley / core / bankruptcy)        │
│  • DQN + MAPPO policy training                           │
│  • RAG-based oracle intelligence                         │
│  • Planar graph topology analysis                        │
└─────────────────────────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
      Postgres       Redis        pgvector
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `broker` keeps restarting | Check `docker compose logs broker`. Prisma DB migration may be pending. Run `docker compose exec broker npx prisma migrate deploy` |
| `engine` health=starting for >3 min | First run downloads ~2 GB model. Wait, or check `docker compose logs engine` |
| `command-center` returns 502 | Broker may not be fully up. Wait 30 s and refresh |
| Port 5432 conflict | Stop local Postgres: `brew services stop postgresql` or `sudo service postgresql stop` |
| Docker out of disk | Run `docker system prune -f` to free space |

---

## Key Files for Reviewers

| File | Purpose |
|------|---------|
| [`docker-compose.yml`](docker-compose.yml) | Service orchestration |
| [`broker/src/index.ts`](broker/src/index.ts) | Broker entry point |
| [`engine/app/main.py`](engine/app/main.py) | Engine entry point |
| [`engine/app/stability/`](engine/app/stability/) | Stability solver |
| [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) | Engineering decisions |
| [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) | Security audit |
| [`docs/LOAD_TEST.md`](docs/LOAD_TEST.md) | Load test methodology |
| [`load-tests/negotiation-load.js`](load-tests/negotiation-load.js) | k6 script |
