/** command-center/src/pages/ExperimentsPage.tsx */
export default function ExperimentsPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Experiments</h1>
        <div className="page-subtitle">Research benchmark results — run via <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", background: "var(--bg-raised)", padding: "2px 6px", borderRadius: "var(--radius-sm)" }}>make research-benchmark</code></div>
      </div>
      <div className="empty-state" style={{ marginTop: "var(--space-8)" }}>
        <div className="empty-icon">⊗</div>
        <div className="empty-title">No experiment results loaded</div>
        <div className="empty-desc">
          Run <strong style={{ color: "var(--fg-primary)" }}>make research-benchmark</strong> to generate results.
          Results are loaded from <code style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>experiments/results/</code>.
          This page will never display fabricated benchmark numbers.
        </div>
      </div>
      <div className="card" style={{ marginTop: "var(--space-6)" }}>
        <div className="card-header"><span className="card-title">Available Scenarios</span></div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "var(--space-3)" }}>
            {["normal", "high_demand", "high_renewable", "forecast_error", "grid_congestion", "der_outage", "line_outage", "market_shock", "storm", "adversary"].map(s => (
              <div key={s} className="badge badge--neutral" style={{ padding: "var(--space-2) var(--space-3)", fontSize: "12px" }}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
