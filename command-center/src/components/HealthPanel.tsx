/**
 * command-center/src/components/HealthPanel.tsx
 * ──────────────────────────────────────────────
 * System Health Panel Component.
 *
 * Polls /health and /ready on both the Engine (port 8000) and Broker (port 3000)
 * every 15 seconds and renders clear UP / DOWN / DEGRADED states with animated
 * status indicators.
 *
 * ASSUMPTION : Engine exposes GET /health and GET /ready at :8000.
 * Broker exposes GET /health at :3000 (GET /ready added in this prompt for
 * symmetry – the broker uses /health for both liveness and readiness).
 */

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ServiceState = "up" | "down" | "degraded" | "loading";

export interface ServiceStatus {
  name: string;
  layer: string;
  liveness: ServiceState;
  readiness: ServiceState;
  lastChecked: Date | null;
  detail: string;
}

// ── Fetch helper ───────────────────────────────────────────────────────────────

async function probe(url: string): Promise<ServiceState> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return "degraded";
    const body = await res.json() as { status?: string };
    return body.status === "ok" ? "up" : "degraded";
  } catch {
    return "down";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface HealthPanelProps {
  engineUrl?: string;
  brokerUrl?: string;
  /** Poll interval in ms. Default 15 000. */
  pollIntervalMs?: number;
}

/**
 * System health panel — polls both services and renders status chips.
 */
const getHost = () => (typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "127.0.0.1");

export function HealthPanel({
  brokerUrl = (import.meta as Record<string, any>).env?.VITE_BROKER_URL ?? `http://${getHost()}:3000`,
  engineUrl = (import.meta as Record<string, any>).env?.VITE_ENGINE_URL ?? `http://${getHost()}:8000`,
  pollIntervalMs = 5000,
}: HealthPanelProps): JSX.Element {
  const initialStatus = (name: string, layer: string): ServiceStatus => ({
    name,
    layer,
    liveness: "loading",
    readiness: "loading",
    lastChecked: null,
    detail: "",
  });

  const [statuses, setStatuses] = useState<ServiceStatus[]>([
    initialStatus("Engine", "Layer 1 – AI & Math Core"),
    initialStatus("Broker", "Layer 2 – State Broker"),
  ]);

  const checkHealth = useCallback(async () => {
    const [engineLive, engineReady, brokerLive] = await Promise.all([
      probe(`${engineUrl}/health`),
      probe(`${engineUrl}/ready`),
      probe(`${brokerUrl}/health`),
    ]);

    // Broker has no /ready endpoint distinct from /health
    const brokerReady = brokerLive;

    const now = new Date();

    setStatuses([
      {
        name: "Engine",
        layer: "Layer 1 – AI & Math Core",
        liveness: engineLive,
        readiness: engineReady,
        lastChecked: now,
        detail: engineLive === "up" ? "FastAPI / LangChain / DQN" : "Service unreachable",
      },
      {
        name: "Broker",
        layer: "Layer 2 – State Broker",
        liveness: brokerLive,
        readiness: brokerReady,
        lastChecked: now,
        detail: brokerLive === "up" ? "Express / Socket.IO / BullMQ" : "Service unreachable",
      },
    ]);
  }, [engineUrl, brokerUrl]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, pollIntervalMs);
    return () => clearInterval(interval);
  }, [checkHealth, pollIntervalMs]);

  return (
    <section className="panel" aria-label="System Health">
      <header className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon" aria-hidden="true">🩺</span>
          System Health
        </h2>
        <button
          className="refresh-btn"
          onClick={checkHealth}
          aria-label="Refresh health status"
        >
          ↺ Refresh
        </button>
      </header>

      <div className="health-grid">
        {statuses.map((svc) => (
          <ServiceCard key={svc.name} status={svc} />
        ))}
      </div>
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ServiceCard({ status }: { status: ServiceStatus }): JSX.Element {
  const overall: ServiceState =
    status.liveness === "down" || status.readiness === "down"
      ? "down"
      : status.liveness === "degraded" || status.readiness === "degraded"
      ? "degraded"
      : status.liveness === "loading"
      ? "loading"
      : "up";

  const stateLabel = overall === "up" ? "UP" : overall === "down" ? "DOWN" : overall === "degraded" ? "DEGRADED" : "…";
  const ts = status.lastChecked
    ? status.lastChecked.toLocaleTimeString("en-US", { hour12: false })
    : "checking…";

  return (
    <article
      className={`health-card health-${overall}`}
      aria-label={`${status.name}: ${stateLabel}`}
    >
      <div className="health-card-header">
        <span className={`health-dot health-dot-${overall}`} aria-hidden="true" />
        <div>
          <strong className="health-name">{status.name}</strong>
          <span className="health-layer">{status.layer}</span>
        </div>
        <span className={`health-badge health-badge-${overall}`}>{stateLabel}</span>
      </div>
      <div className="health-probes">
        <ProbeChip label="Liveness" state={status.liveness} />
        <ProbeChip label="Readiness" state={status.readiness} />
      </div>
      <div className="health-footer">
        <span className="health-detail">{status.detail}</span>
        <span className="health-ts">as of {ts}</span>
      </div>
    </article>
  );
}

function ProbeChip({ label, state }: { label: string; state: ServiceState }): JSX.Element {
  const icons: Record<ServiceState, string> = {
    up: "✓",
    down: "✗",
    degraded: "⚠",
    loading: "…",
  };
  return (
    <span className={`probe-chip probe-${state}`} aria-label={`${label}: ${state}`}>
      {icons[state]} {label}
    </span>
  );
}
