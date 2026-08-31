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

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">System Health</h1>
          <div className="page-subtitle">Service readiness probes and connectivity checks</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={runChecks}>Refresh</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
        {states.map(svc => (
          <div key={svc.name} className="card card--pinned">
            <div className="card-header">
              <span className="card-title">{svc.name}</span>
              <StatusIcon status={svc.status} />
            </div>
            <div className="card-body">
              <div style={{ display: "flex", gap: "var(--space-4)" }}>
                <div>
                  <div className="metric-label">Latency</div>
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
