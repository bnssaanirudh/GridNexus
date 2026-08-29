/**
 * command-center/src/pages/OverviewPage.tsx
 * ──────────────────────────────────────────
 * Real-time overview dashboard with KPI grid and negotiation feed.
 * No hardcoded values — all data must come from API or show NO DATA.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const BROKER_URL = (import.meta as any).env?.VITE_BROKER_URL ?? "http://localhost:3000";

interface HealthData {
  status?: string;
  mode?: string;
  dbConnected?: boolean;
  redisConnected?: boolean;
  engineReachable?: boolean;
  uptime?: number;
}

interface Metric {
  label: string;
  key: string;
  unit?: string;
}

const KPI_METRICS: Metric[] = [
  { label: "Active Negotiations", key: "activeNegotiations" },
  { label: "Energy Traded Today", key: "energyTradedKwh", unit: "kWh" },
  { label: "Avg Price", key: "avgPricePerKwh", unit: "/kWh" },
  { label: "Committed Settlements", key: "committedSettlements" },
  { label: "Grid Certificate Pass Rate", key: "gridPassRate", unit: "%" },
  { label: "Coalition Stability", key: "coalitionStability", unit: "%" },
  { label: "Oracle Signals", key: "oracleSignals" },
  { label: "Failed Negotiations", key: "failedNegotiations" },
];

function MetricCard({ label, value, unit }: { label: string; value?: string | number | null; unit?: string }) {
  const hasData = value !== null && value !== undefined && value !== "";
  return (
    <div className="metric-card card--pinned" style={{ background: "var(--bg-card)", border: "none" }}>
      <div className="metric-label">{label}</div>
      {hasData ? (
        <div className="metric-value">
          {String(value)}
          {unit && <span className="metric-unit"> {unit}</span>}
        </div>
      ) : (
        <div className="metric-value metric-value--nodata">NO DATA</div>
      )}
    </div>
  );
}

function SkeletonMetric() {
  return (
    <div className="metric-card" style={{ background: "var(--bg-card)", border: "none", gap: "var(--space-3)" }}>
      <div className="skeleton skeleton-text-sm" />
      <div className="skeleton skeleton-value" />
    </div>
  );
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, metricsRes] = await Promise.allSettled([
          fetch(`${BROKER_URL}/health`).then(r => r.json()),
          fetch(`${BROKER_URL}/api/metrics/overview`).then(r => r.json()),
        ]);

        if (healthRes.status === "fulfilled") setHealth(healthRes.value);
        if (metricsRes.status === "fulfilled") setMetrics(metricsRes.value);
      } catch {
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, []);

  const getValue = (key: string) => metrics?.[key] as string | number | null | undefined;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
        <div className="page-subtitle">Live platform metrics and system status</div>
      </div>

      {/* Health row */}
      <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        {health ? (
          <>
            <div className={`badge ${health.dbConnected ? "badge--live" : "badge--error"}`}>
              <span className="badge-dot" />DB {health.dbConnected ? "Connected" : "Disconnected"}
            </div>
            <div className={`badge ${health.redisConnected ? "badge--live" : "badge--error"}`}>
              <span className="badge-dot" />Redis {health.redisConnected ? "Connected" : "Disconnected"}
            </div>
            <div className={`badge ${health.engineReachable ? "badge--live" : "badge--error"}`}>
              <span className="badge-dot" />Engine {health.engineReachable ? "Reachable" : "Unreachable"}
            </div>
            <div className="badge badge--neutral">
              Mode: {health.mode ?? "unknown"}
            </div>
          </>
        ) : loading ? (
          <div className="skeleton skeleton-badge" />
        ) : (
          <div className="badge badge--error">Health check unavailable</div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid" aria-label="Key performance indicators">
        {loading
          ? KPI_METRICS.map(m => <SkeletonMetric key={m.key} />)
          : KPI_METRICS.map(m => (
              <MetricCard
                key={m.key}
                label={m.label}
                value={getValue(m.key)}
                unit={m.unit}
              />
            ))
        }
      </div>

      {error && (
        <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
          <div className="error-state">
            <div className="error-icon">⚠</div>
            <div className="error-title">Data unavailable</div>
            <div className="error-desc">{error} The backend may be starting up or unreachable.</div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-4)", marginTop: "var(--space-6)" }}>
        {[
          { icon: "⇄", title: "Negotiations", desc: "View active and recent negotiations", path: "/dashboard/negotiations" },
          { icon: "⟁", title: "Grid Topology", desc: "Inspect network and line utilization", path: "/dashboard/grid" },
          { icon: "⌁", title: "Audit Chain", desc: "Verify cryptographic event chain", path: "/dashboard/audit" },
          { icon: "◉", title: "Oracle", desc: "Current signal and RAG provenance", path: "/dashboard/oracle" },
        ].map(item => (
          <button
            key={item.path}
            className="card"
            onClick={() => navigate(item.path)}
            style={{
              padding: "var(--space-5)",
              textAlign: "left",
              cursor: "pointer",
              background: "var(--bg-card)",
              border: "1px solid var(--border-dim)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              position: "relative",
              transition: "background 0.2s ease, border-color 0.2s ease",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-card-hover)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-card)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-dim)";
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, width: "6px", height: "6px", background: "var(--brand-blue)", opacity: 0.5 }} />
            <div style={{ fontSize: "20px", marginBottom: "var(--space-2)" }} aria-hidden="true">{item.icon}</div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg-primary)" }}>{item.title}</div>
            <div style={{ fontSize: "12px", color: "var(--fg-secondary)" }}>{item.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
