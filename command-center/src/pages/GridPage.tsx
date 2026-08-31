/**
 * command-center/src/pages/GridPage.tsx
 * ──────────────────────────────────────
 * Interactive grid topology from real DB topology.
 * Shows buses as nodes, lines as edges with utilization coloring.
 */

import { useState, useEffect, useRef } from "react";
import { apiGet, BROKER_URL } from "../lib/apiClient";
import { normalizeTopology } from "../lib/apiContracts";

interface Bus { id: string; externalCode?: string; voltageLevelKv: number; latitude?: number; longitude?: number; }
interface Line { id: string; fromBusId: string; toBusId: string; thermalLimitKw: number; resistance: number; reactance: number; active: boolean; utilization?: number; }
interface Topology { buses: Bus[]; lines: Line[]; topologyVersion?: number; }

function utilizationClass(util?: number): string {
  if (util == null) return "topo-edge--normal";
  if (util > 100) return "topo-edge--overload";
  if (util > 85) return "topo-edge--high";
  if (util > 65) return "topo-edge--warning";
  return "topo-edge--normal";
}

function utilizationBadge(util?: number) {
  if (util == null) return <span className="badge badge--neutral">N/A</span>;
  if (util > 100) return <span className="badge badge--error">{util.toFixed(1)}% OVERLOAD</span>;
  if (util > 85)  return <span className="badge badge--error">{util.toFixed(1)}%</span>;
  if (util > 65)  return <span className="badge badge--synthetic">{util.toFixed(1)}%</span>;
  return <span className="badge badge--live">{util.toFixed(1)}%</span>;
}

export default function GridPage() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Line | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    apiGet<unknown>(BROKER_URL, "/api/topology")
      .then(normalizeTopology)
      .then((data) => setTopology(data as Topology))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Lay out buses in a circle for display if no lat/lon
  const busPositions = (() => {
    if (!topology) return new Map<string, { x: number; y: number }>();
    const map = new Map<string, { x: number; y: number }>();
    const { buses } = topology;
    buses.forEach((bus, i) => {
      if (bus.latitude && bus.longitude) {
        // Normalize to SVG space
        const lats = buses.filter(b => b.latitude).map(b => b.latitude!);
        const lngs = buses.filter(b => b.longitude).map(b => b.longitude!);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        map.set(bus.id, {
          x: 40 + ((Number(bus.longitude) - minLng) / (maxLng - minLng + 0.001)) * 520,
          y: 40 + (1 - (Number(bus.latitude) - minLat) / (maxLat - minLat + 0.001)) * 280,
        });
      } else {
        const angle = (i / buses.length) * 2 * Math.PI;
        map.set(bus.id, { x: 300 + Math.cos(angle) * 200, y: 180 + Math.sin(angle) * 140 });
      }
    });
    return map;
  })();

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Grid Topology</h1>
          <div className="page-subtitle">Physical network — buses and line utilization</div>
        </div>
        {topology?.topologyVersion != null && (
          <div className="badge badge--neutral">Topology v{topology.topologyVersion}</div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "var(--space-4)", marginBottom: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
        <span className="text-label">Line loading:</span>
        {[["< 65%", "badge--live"], ["> 65%", "badge--synthetic"], ["> 85%", "badge--error"], ["> 100%", "badge--error"]].map(([label, cls]) => (
          <div key={label} className={`badge ${cls}`}>{label}</div>
        ))}
      </div>

      {loading && (
        <div className="card" style={{ height: "400px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="skeleton" style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />
        </div>
      )}

      {error && (
        <div className="error-state">
          <div className="error-icon">⟁</div>
          <div className="error-title">Grid topology unavailable</div>
          <div className="error-desc">{error} — seed network data via the database seeder or API.</div>
        </div>
      )}

      {!loading && !error && topology && topology.buses.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⟁</div>
          <div className="empty-title">No network topology loaded</div>
          <div className="empty-desc">Seed Bus and Line records via the Prisma seed script or API.</div>
        </div>
      )}

      {!loading && topology && topology.buses.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "var(--space-4)" }}>
          {/* SVG topology */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="card-header">
              <span className="card-title">Network ({topology.buses.length} buses, {topology.lines.length} lines)</span>
            </div>
            <svg
              ref={svgRef}
              viewBox="0 0 600 360"
              style={{ width: "100%", background: "var(--bg-deep)" }}
              role="img"
              aria-label="Grid topology diagram"
            >
              {/* Lines */}
              {topology.lines.filter(l => l.active).map(line => {
                const from = busPositions.get(line.fromBusId);
                const to = busPositions.get(line.toBusId);
                if (!from || !to) return null;
                return (
                  <line
                    key={line.id}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    className={`topo-edge ${utilizationClass(line.utilization)}`}
                    strokeWidth={2}
                    onClick={() => setSelected(selected?.id === line.id ? null : line)}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
              {/* Buses */}
              {topology.buses.map(bus => {
                const pos = busPositions.get(bus.id);
                if (!pos) return null;
                return (
                  <g key={bus.id}>
                    <circle
                      cx={pos.x} cy={pos.y} r={8}
                      className="topo-node topo-node--active"
                      aria-label={`Bus ${bus.externalCode ?? bus.id.slice(0, 6)}`}
                    />
                    <text
                      x={pos.x} y={pos.y - 12}
                      textAnchor="middle"
                      style={{ fontSize: "9px", fill: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      {bus.externalCode ?? bus.id.slice(0, 6)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Detail panel */}
          <div className="card">
            <div className="card-header"><span className="card-title">Line Detail</span></div>
            <div className="card-body">
              {selected ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <div>
                    <div className="metric-label">Line ID</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--fg-primary)", marginTop: "4px" }}>{selected.id.slice(0, 16)}…</div>
                  </div>
                  <div>
                    <div className="metric-label">Thermal Limit</div>
                    <div className="metric-value" style={{ fontSize: "20px" }}>{selected.thermalLimitKw} <span className="metric-unit">kW</span></div>
                  </div>
                  <div>
                    <div className="metric-label">Loading</div>
                    <div style={{ marginTop: "4px" }}>{utilizationBadge(selected.utilization)}</div>
                  </div>
                  <div>
                    <div className="metric-label">R / X</div>
                    <div style={{ fontSize: "13px", color: "var(--fg-secondary)", marginTop: "4px" }}>
                      {selected.resistance} Ω / {selected.reactance} Ω
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">⟁</div>
                  <div className="empty-desc">Click a line in the diagram to inspect its parameters.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
