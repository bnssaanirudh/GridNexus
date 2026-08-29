/** command-center/src/pages/SettlementsPage.tsx */
import { useState, useEffect } from "react";
const BROKER_URL = (import.meta as any).env?.VITE_BROKER_URL ?? "http://localhost:3000";

interface Settlement { id: string; idempotencyKey: string; negotiationId: string; sellerMicrogridId: string; buyerMicrogridId: string; energyKwh: number; pricePerKwh: number; currency: string; status: string; deliveryStart: string; deliveryEnd: string; createdAt: string; }

const STATUS_CLASS: Record<string, string> = { COMMITTED: "badge--committed", PROVISIONAL: "badge--provisional", VERIFYING: "badge--info", COMMITTING: "badge--info", FAILED: "badge--failed" };

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BROKER_URL}/api/settlements?limit=50`).then(r => r.json()).then(setSettlements).catch(e => setError(String(e))).finally(() => setLoading(false));
    const id = setInterval(() => fetch(`${BROKER_URL}/api/settlements?limit=50`).then(r => r.json()).then(setSettlements).catch(() => {}), 15000);
    return () => clearInterval(id);
  }, []);

  const totalKwh = settlements.filter(s => s.status === "COMMITTED").reduce((acc, s) => acc + Number(s.energyKwh), 0);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Settlements</h1>
          <div className="page-subtitle">Idempotent energy trade settlements with audit linkage</div>
        </div>
        {!loading && settlements.length > 0 && (
          <div className="metric-card" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)", borderRadius: "var(--radius-md)", padding: "var(--space-4)" }}>
            <div className="metric-label">Total Committed</div>
            <div className="metric-value" style={{ fontSize: "20px" }}>{totalKwh.toFixed(2)} <span className="metric-unit">kWh</span></div>
          </div>
        )}
      </div>

      {loading && <div className="skeleton" style={{ height: 300, borderRadius: "var(--radius-md)" }} />}
      {error && <div className="error-state"><div className="error-icon">▣</div><div className="error-title">Settlements unavailable</div><div className="error-desc">{error}</div></div>}
      {!loading && !error && settlements.length === 0 && <div className="empty-state"><div className="empty-icon">▣</div><div className="empty-title">No settlements yet</div><div className="empty-desc">Settlements are created once a negotiation commits.</div></div>}

      {!loading && settlements.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">All Settlements ({settlements.length})</span></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Seller</th>
                <th>Buyer</th>
                <th>Energy kWh</th>
                <th>Price/kWh</th>
                <th>Currency</th>
                <th>Delivery Start</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map(s => (
                <tr key={s.id}>
                  <td className="font-mono">{s.id.slice(0, 8)}…</td>
                  <td><div className={`badge ${STATUS_CLASS[s.status] ?? "badge--neutral"}`}>{s.status}</div></td>
                  <td className="font-mono">{s.sellerMicrogridId.slice(0, 8)}…</td>
                  <td className="font-mono">{s.buyerMicrogridId.slice(0, 8)}…</td>
                  <td className="text-primary">{Number(s.energyKwh).toFixed(3)}</td>
                  <td className="text-primary">{Number(s.pricePerKwh).toFixed(4)}</td>
                  <td>{s.currency}</td>
                  <td className="font-mono">{new Date(s.deliveryStart).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
