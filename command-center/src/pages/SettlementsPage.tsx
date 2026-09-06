import { useState, useEffect } from "react";
import { apiGet, BROKER_URL } from "../lib/apiClient";
import { normalizeSettlements, type SettlementDto as Settlement } from "../lib/apiContracts";
import { useAuth } from "../lib/auth";

const STATUS_CLASS: Record<string, string> = { COMMITTED: "badge--committed", PROVISIONAL: "badge--provisional", VERIFYING: "badge--info", COMMITTING: "badge--info", FAILED: "badge--failed" };

const shortId = (value?: string) => value ? value.slice(0, 8) + "…" : "—";
const formatNumber = (value: number | undefined, digits: number) => value == null ? "—" : value.toFixed(digits);
const formatDate = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : "—";
export default function SettlementsPage() {
  const { user } = useAuth();
  const isDerOwner = user?.role?.toUpperCase() === "DER_OWNER";
  const endpoint = isDerOwner ? "/api/me/settlements?limit=50" : "/api/settlements?limit=50";

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async (initial = false) => {
      try {
        const payload = await apiGet<unknown>(BROKER_URL, endpoint, { signal: controller.signal });
        setSettlements(normalizeSettlements(payload));
        setError(null);
      } catch (error) {
        if (!controller.signal.aborted && initial) setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (initial && !controller.signal.aborted) setLoading(false);
      }
    };
    void load(true);
    const id = window.setInterval(() => void load(), 15000);
    return () => { controller.abort(); window.clearInterval(id); };
  }, [endpoint]);

  const totalKwh = settlements.filter(s => s.status === "COMMITTED").reduce((acc, s) => acc + (s.energyKwh ?? 0), 0);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">{isDerOwner ? "My Settlements" : "Settlements"}</h1>
          <div className="page-subtitle">
            {isDerOwner
              ? "Energy settlements committed for your microgrid"
              : "Idempotent energy trade settlements with audit linkage"}
          </div>
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
                  <td className="font-mono">{shortId(s.sellerMicrogridId)}</td>
                  <td className="font-mono">{shortId(s.buyerMicrogridId)}</td>
                  <td className="text-primary">{formatNumber(s.energyKwh, 3)}</td>
                  <td className="text-primary">{formatNumber(s.pricePerKwh, 4)}</td>
                  <td>{s.currency ?? "—"}</td>
                  <td className="font-mono">{formatDate(s.deliveryStart ?? s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
