/**
 * command-center/src/pages/CoalitionsPage.tsx
 */
import { useState, useEffect } from "react";

const BROKER_URL = (import.meta as any).env?.VITE_BROKER_URL ?? "http://localhost:3000";

interface Coalition {
  id: string;
  members: string[];
  value: number;
  epsilon?: number;
  currency?: string;
  status?: string;
}

function CoalitionCard({ c }: { c: Coalition }) {
  return (
    <div className="card card--pinned" style={{ marginBottom: "var(--space-4)" }}>
      <div className="card-header">
        <span className="card-title">Coalition {c.id.slice(0, 8)}</span>
        <div className={`badge ${c.status === "COMMITTED" ? "badge--committed" : "badge--live"}`}>
          {c.status ?? "Active"}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div>
            <div className="metric-label">Coalition Value v(C)</div>
            <div className="metric-value" style={{ fontSize: "22px" }}>
              {c.value != null ? c.value.toFixed(2) : <span className="metric-value--nodata">NO DATA</span>}
              {c.value != null && <span className="metric-unit"> {c.currency ?? "USD"}</span>}
            </div>
          </div>
          <div>
            <div className="metric-label">Least-Core epsilon</div>
            <div className="metric-value" style={{ fontSize: "22px" }}>
              {c.epsilon != null ? c.epsilon.toFixed(4) : <span className="metric-value--nodata">NO DATA</span>}
            </div>
          </div>
        </div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <div className="metric-label" style={{ marginBottom: "var(--space-2)" }}>
            Members ({c.members?.length ?? 0})
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {(c.members ?? []).map((m) => (
              <span key={m} className="badge badge--neutral">{m.slice(0, 8)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoalitionsPage() {
  const [coalitions, setCoalitions] = useState<Coalition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BROKER_URL}/api/coalitions`)
      .then((r) => r.json())
      .then(setCoalitions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    const id = setInterval(() => {
      fetch(`${BROKER_URL}/api/coalitions`)
        .then((r) => r.json())
        .then(setCoalitions)
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Coalitions</h1>
        <div className="page-subtitle">
          Network-aware VPP coalition stability and value allocation
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card" style={{ padding: "var(--space-5)" }}>
              <div className="skeleton" style={{ height: 24, marginBottom: "var(--space-3)" }} />
              <div className="skeleton skeleton-text" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="error-state">
          <div className="error-icon">◎</div>
          <div className="error-title">Coalition data unavailable</div>
          <div className="error-desc">{error}</div>
        </div>
      )}

      {!loading && !error && coalitions.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">◎</div>
          <div className="empty-title">No coalitions formed yet</div>
          <div className="empty-desc">
            Coalitions form during negotiation rounds and appear here when stable.
          </div>
        </div>
      )}

      {coalitions.map((c) => (
        <CoalitionCard key={c.id} c={c} />
      ))}
    </div>
  );
}
