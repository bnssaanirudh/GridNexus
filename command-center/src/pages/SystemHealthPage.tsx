/** command-center/src/pages/SystemHealthPage.tsx */
import { useState, useEffect } from "react";
import { apiGet, BROKER_URL, ENGINE_URL } from "../lib/apiClient";

interface ServiceCheck { name: string; url: string; endpoint: string; }

const SERVICES: ServiceCheck[] = [
  { name: "Broker", url: BROKER_URL, endpoint: "/ready" },
  { name: "Engine", url: ENGINE_URL, endpoint: "/ready" },
];

type ServiceStatus = "checking" | "healthy" | "degraded" | "unreachable";

interface ServiceState { name: string; status: ServiceStatus; latencyMs?: number; detail?: Record<string, unknown>; }

async function checkService(svc: ServiceCheck): Promise<ServiceState> {
  const start = Date.now();
  try {
    const data = await apiGet<Record<string, unknown>>(svc.url, svc.endpoint, { timeoutMs: 4000, auth: false });
    const latencyMs = Date.now() - start;
    return { name: svc.name, status: "healthy", latencyMs, detail: data };
  } catch {
    return { name: svc.name, status: "unreachable", latencyMs: Date.now() - start };
  }
}

function StatusIcon({ status }: { status: ServiceStatus }) {
  const cfg: Record<ServiceStatus, { cls: string; icon: string }> = {
    healthy:    { cls: "badge--live",    icon: "● Healthy" },
    degraded:   { cls: "badge--synthetic", icon: "● Degraded" },
    unreachable:{ cls: "badge--error",   icon: "● Unreachable" },
    checking:   { cls: "badge--neutral", icon: "● Checking" },
  };
  const c = cfg[status];
  return <div className={`badge ${c.cls}`}>{c.icon}</div>;
}

export default function SystemHealthPage() {
  const [states, setStates] = useState<ServiceState[]>(
    SERVICES.map(s => ({ name: s.name, status: "checking" }))
  );

  const runChecks = async () => {
    const results = await Promise.all(SERVICES.map(checkService));
    setStates(results);
  };

  useEffect(() => {
    runChecks();
    const id = setInterval(runChecks, 30000);
    return () => clearInterval(id);
  }, []);

  const runtimeMode = import.meta.env?.VITE_GRIDNEXUS_MODE ?? "simulation";
  const isSimulation = runtimeMode === "simulation";

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">System Health & Diagnostics</h1>
          <div className="page-subtitle">Service readiness probes and connectivity checks — runtime environment diagnostics and data classification</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={runChecks}>Refresh</button>
      </div>

      {/* Runtime Environment Diagnostics */}
      <div className="card" style={{ marginBottom: "var(--space-6)" }}>
        <div className="card-header">
          <span className="card-title">Environment Diagnostics</span>
          <span className={`badge ${isSimulation ? "badge--synthetic" : "badge--live"}`}>
            {isSimulation ? "SIMULATION MODE" : "PRODUCTION MODE"}
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
            <div>
              <div className="metric-label">Runtime Mode</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color: "var(--fg-primary)", marginTop: "4px" }}>
                {runtimeMode.toUpperCase()}
              </div>
              <div style={{ fontSize: "12px", color: "var(--fg-muted)", marginTop: "4px" }}>
                {isSimulation
                  ? "Relaxed IAM & hardware checks for demonstration and integration tests."
                  : "Strict IAM, HSM wallet signatures, and live physical constraints enforced."}
              </div>
            </div>
            <div>
              <div className="metric-label">Operational Data Classification</div>
              <div style={{ fontSize: "12px", color: "var(--fg-secondary)", marginTop: "4px", lineHeight: 1.5 }}>
                <span className="badge badge--live" style={{ marginRight: "6px" }}>REAL / OPERATIONAL</span>
                Cryptographic audit hash chains, Postgres relational ledger, RBAC tokens.
              </div>
              <div style={{ fontSize: "12px", color: "var(--fg-secondary)", marginTop: "6px", lineHeight: 1.5 }}>
                <span className="badge badge--synthetic" style={{ marginRight: "6px" }}>SIMULATION</span>
                DER physical asset power curves, synthetic solar/wind generation profiles.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
        {states.map(svc => (
          <div key={svc.name} className="card card--pinned">
            <div className="card-header">
              <span className="card-title">{svc.name} Service Probe</span>
              <StatusIcon status={svc.status} />
            </div>
            <div className="card-body">
              <div style={{ display: "flex", gap: "var(--space-4)" }}>
                <div>
                  <div className="metric-label">Readiness Latency</div>
                  <div className="metric-value" style={{ fontSize: "20px" }}>
                    {svc.latencyMs != null
                      ? <>{svc.latencyMs}<span className="metric-unit">ms</span></>
                      : <span className="metric-value--nodata">NO DATA</span>
                    }
                  </div>
                </div>
              </div>
              {svc.detail && Object.keys(svc.detail).length > 0 && (
                <pre style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-muted)", marginTop: "var(--space-3)", background: "var(--bg-deep)", padding: "var(--space-2)", borderRadius: "var(--radius-sm)", overflow: "auto", maxHeight: "100px" }}>
                  {JSON.stringify(svc.detail, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
