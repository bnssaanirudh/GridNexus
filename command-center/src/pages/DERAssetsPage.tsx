/** command-center/src/pages/DERAssetsPage.tsx */
import { useState, useEffect } from "react";
import { apiGet, BROKER_URL } from "../lib/apiClient";
import { normalizeDers, type DerDto as DER } from "../lib/apiContracts";

const DER_TYPE_ICON: Record<string, string> = { SOLAR: "☀", WIND: "💨", BATTERY: "🔋", EV: "🚗", FLEXIBLE_LOAD: "⚡", OTHER: "◈" };

export default function DERAssetsPage() {
  const [ders, setDers] = useState<DER[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<unknown>(BROKER_URL, "/api/ders").then(normalizeDers).then(setDers).catch(e => setError(String(e))).finally(() => setLoading(false));
  }, []);

  const byType = ders.reduce<Record<string, DER[]>>((acc, d) => ({ ...acc, [d.type]: [...(acc[d.type] ?? []), d] }), {});

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">DER Assets</h1>
        <div className="page-subtitle">Distributed Energy Resources registered on the platform</div>
      </div>

      {!loading && !error && (
        <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
          {Object.entries(byType).map(([type, list]) => (
            <div key={type} className="badge badge--neutral">
              {DER_TYPE_ICON[type] ?? "◈"} {type} ({list.length})
            </div>
          ))}
          {ders.length > 0 && <div className="badge badge--info">Total: {ders.length}</div>}
        </div>
      )}

      {loading && <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>{[...Array(6)].map((_,i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: "var(--radius-md)" }} />)}</div>}
      {error && <div className="error-state"><div className="error-icon">⬡</div><div className="error-title">DER data unavailable</div><div className="error-desc">{error}</div></div>}
      {!loading && !error && ders.length === 0 && <div className="empty-state"><div className="empty-icon">⬡</div><div className="empty-title">No DER assets registered</div><div className="empty-desc">Register DERs via the database seeder or admin API.</div></div>}

      {!loading && ders.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">All DERs ({ders.length})</span></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Microgrid</th>
                <th>Rated kW</th>
                <th>Min kW</th>
                <th>Max kW</th>
                <th>Efficiency</th>
                <th>Capacity kWh</th>
              </tr>
            </thead>
            <tbody>
              {ders.map(d => (
                <tr key={d.id}>
                  <td className="text-primary">{DER_TYPE_ICON[d.type] ?? "◈"} {d.type}</td>
                  <td className="font-mono">{d.microgridId ? `${d.microgridId.slice(0, 8)}…` : "—"}</td>
                  <td className="text-primary">{d.ratedPowerKw ?? "—"}</td>
                  <td>{d.minPowerKw ?? "—"}</td>
                  <td>{d.maxPowerKw ?? "—"}</td>
                  <td>
                    <div className="conf-bar-wrap">
                      <div className="conf-bar-track"><div className="conf-bar-fill conf-bar-fill--high" style={{ width: `${(d.efficiency ?? 0) * 100}%` }} /></div>
                      <div className="conf-label">{d.efficiency == null ? "—" : `${(d.efficiency * 100).toFixed(0)}%`}</div>
                    </div>
                  </td>
                  <td>{d.energyCapacityKwh ?? <span style={{ color: "var(--fg-muted)" }}>N/A</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
