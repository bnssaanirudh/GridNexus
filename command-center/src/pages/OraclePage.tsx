/** command-center/src/pages/OraclePage.tsx */
import { useState, useEffect } from "react";
const BROKER_URL = (import.meta as any).env?.VITE_BROKER_URL ?? "http://localhost:3000";

interface OracleSignal {
  id: string;
  signalData: string;
  createdAt: string;
  beliefUpdates?: Array<{ id: string; posterior: number; confidence: number; hypothesis?: string; decisionSource: string }>;
  ragContext?: Array<{ sourceType: string; sourceName?: string; synthetic?: boolean; trustScore?: number }>;
}

export default function OraclePage() {
  const [signals, setSignals] = useState<OracleSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BROKER_URL}/api/oracle/signals?limit=20`).then(r => r.json()).then(setSignals).catch(e => setError(String(e))).finally(() => setLoading(false));
    const id = setInterval(() => fetch(`${BROKER_URL}/api/oracle/signals?limit=20`).then(r => r.json()).then(setSignals).catch(() => {}), 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Oracle</h1>
        <div className="page-subtitle">REINFORCE-trained Oracle signals and RAG context provenance</div>
      </div>

      {loading && [...Array(3)].map((_,i) => (
        <div key={i} className="card" style={{ marginBottom: "var(--space-4)", padding: "var(--space-5)" }}>
          <div className="skeleton" style={{ height: 18, width: "60%", marginBottom: "var(--space-3)" }} />
          <div className="skeleton skeleton-text" />
        </div>
      ))}

      {error && <div className="error-state"><div className="error-icon">◉</div><div className="error-title">Oracle data unavailable</div><div className="error-desc">{error}</div></div>}
      {!loading && !error && signals.length === 0 && <div className="empty-state"><div className="empty-icon">◉</div><div className="empty-title">No Oracle signals yet</div><div className="empty-desc">Signals appear once the Oracle checkpoint is loaded and negotiations begin.</div></div>}

      {signals.map(sig => {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(sig.signalData); } catch {}
        const isSynthetic = (parsed as any)?.synthetic === true;

        return (
          <div key={sig.id} className="card card--pinned" style={{ marginBottom: "var(--space-4)" }}>
            <div className="card-header">
              <span className="card-title">{sig.id.slice(0, 12)}…</span>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <div className={`badge ${isSynthetic ? "badge--synthetic" : "badge--live"}`}>
                  <span className="badge-dot" />
                  {isSynthetic ? "SYNTHETIC" : "LIVE"}
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-muted)" }}>
                  {new Date(sig.createdAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="card-body">
              <pre style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-secondary)", background: "var(--bg-deep)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", overflow: "auto", maxHeight: "120px" }}>
                {JSON.stringify(parsed, null, 2)}
              </pre>

              {sig.beliefUpdates && sig.beliefUpdates.length > 0 && (
                <div style={{ marginTop: "var(--space-4)" }}>
                  <div className="text-label" style={{ marginBottom: "var(--space-2)" }}>Belief Updates</div>
                  {sig.beliefUpdates.map(bu => (
                    <div key={bu.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-2)" }}>
                      <div className="conf-bar-wrap" style={{ flex: 1 }}>
                        <div className="conf-bar-track">
                          <div
                            className={`conf-bar-fill ${bu.posterior > 0.7 ? "conf-bar-fill--high" : bu.posterior > 0.4 ? "" : "conf-bar-fill--warn"}`}
                            style={{ width: `${bu.posterior * 100}%` }}
                          />
                        </div>
                        <div className="conf-label">{(bu.posterior * 100).toFixed(0)}%</div>
                      </div>
                      <div className="badge badge--neutral" style={{ fontSize: "10px" }}>{bu.decisionSource}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
