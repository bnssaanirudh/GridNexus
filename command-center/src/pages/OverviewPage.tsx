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
      <div style={{ position: "relative", marginBottom: "var(--space-8)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", minHeight: "160px", padding: "var(--space-6) var(--space-8)" }}>
        <img src="/assets/pexels-kindelmedia-9875676.jpg" alt="Dashboard Banner" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #091712 0%, rgba(9, 23, 18, 0.7) 40%, rgba(9, 23, 18, 0) 100%)", zIndex: 1 }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <h1 className="page-title" style={{ fontSize: "36px", marginBottom: "4px" }}>System Overview</h1>
          <div className="page-subtitle" style={{ fontSize: "16px", color: "var(--fg-secondary)" }}>Live platform metrics and real-time swarm intelligence status</div>
        </div>
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
          { icon: "⇄", title: "Negotiations", desc: "View active and recent negotiations", path: "/dashboard/negotiations", img: "/assets/pexels-china-yu-200611083-35454188.jpg" },
          { icon: "⟁", title: "Grid Topology", desc: "Inspect network and line utilization", path: "/dashboard/grid", img: "/assets/pexels-mohamed-b-2151113020-33661084.jpg" },
          { icon: "⌁", title: "Audit Chain", desc: "Verify cryptographic event chain", path: "/dashboard/audit", img: "/assets/pexels-oguzcobn-37824217.jpg" },
          { icon: "◉", title: "Oracle", desc: "Current signal and RAG provenance", path: "/dashboard/oracle", img: "/assets/pexels-kindelmedia-9800005.jpg" },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              padding: 0,
              textAlign: "left",
              cursor: "pointer",
              background: "var(--bg-card)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
              transition: "transform 0.3s ease, box-shadow 0.3s ease",
              boxShadow: "var(--shadow-sm)"
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
              (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
            }}
          >
            <div style={{ width: "100%", height: "100px", position: "relative" }}>
              <img src={item.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(17,41,33,0) 0%, #112921 100%)" }} />
            </div>
            <div style={{ padding: "0 var(--space-5) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <div style={{ fontSize: "20px", marginBottom: "var(--space-1)" }} aria-hidden="true">{item.icon}</div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--fg-primary)" }}>{item.title}</div>
              <div style={{ fontSize: "13px", color: "var(--fg-secondary)" }}>{item.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
