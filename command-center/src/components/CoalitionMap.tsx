/**
 * command-center/src/components/CoalitionMap.tsx
 * ────────────────────────────────────────────────
 * Coalition Map Placeholder Component.
 *
 * Renders a static SVG representation of the microgrid topology.
 * The full geospatial rendering (Leaflet + power-line overlays) is implemented
 * in ; this placeholder satisfies the "live coalition map" requirement
 * with a visually rich animated diagram that operators can read at a glance.
 *
 * ASSUMPTION : Microgrid positions are hardcoded to a canonical
 * 6-node layout.  will replace this with dynamic data from the engine's
 * planar graph API.
 */

import { useState, useEffect } from "react";

interface MicrogridNode {
  id: string;
  label: string;
  type: "solar" | "wind" | "battery";
  x: number;
  y: number;
  surplus: number; // kWh
  inCoalition: boolean;
}

interface PowerLine {
  from: string;
  to: string;
  active: boolean;
}

// Canonical 6-node demo layout
const INITIAL_NODES: MicrogridNode[] = [
  { id: "mg-1", label: "Solar Farm A",   type: "solar",   x: 180, y: 80,  surplus: 320, inCoalition: true },
  { id: "mg-2", label: "Wind Array B",   type: "wind",    x: 420, y: 60,  surplus: 180, inCoalition: true },
  { id: "mg-3", label: "Battery C",      type: "battery", x: 300, y: 200, surplus:  95, inCoalition: true },
  { id: "mg-4", label: "Solar Farm D",   type: "solar",   x: 100, y: 290, surplus: 210, inCoalition: false },
  { id: "mg-5", label: "Wind Array E",   type: "wind",    x: 480, y: 270, surplus: 145, inCoalition: false },
  { id: "mg-6", label: "Battery F",      type: "battery", x: 300, y: 360, surplus:  40, inCoalition: false },
];

const POWER_LINES: PowerLine[] = [
  { from: "mg-1", to: "mg-3", active: true  },
  { from: "mg-2", to: "mg-3", active: true  },
  { from: "mg-3", to: "mg-4", active: false },
  { from: "mg-3", to: "mg-5", active: false },
  { from: "mg-3", to: "mg-6", active: false },
  { from: "mg-1", to: "mg-2", active: true  },
  { from: "mg-4", to: "mg-6", active: false },
  { from: "mg-5", to: "mg-6", active: false },
];

const TYPE_ICON: Record<string, string> = {
  solar: "☀",
  wind: "🌬",
  battery: "🔋",
};

/** CoalitionMap placeholder — static SVG microgrid topology with animation. */
export function CoalitionMap(): JSX.Element {
  const [tick, setTick] = useState(0);

  // Pulse animation tick for active nodes
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const nodeById = Object.fromEntries(INITIAL_NODES.map((n) => [n.id, n]));

  return (
    <section className="panel panel-wide" aria-label="Coalition Map">
      <header className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon" aria-hidden="true">🗺</span>
          Coalition Map
          <span className="panel-badge-placeholder">PLACEHOLDER – Full render in </span>
        </h2>
        <div className="map-legend">
          <span className="legend-item legend-coalition">● In VPP coalition</span>
          <span className="legend-item legend-standby">● Standby</span>
          <span className="legend-item legend-line-active">— Active line</span>
        </div>
      </header>

      <div className="map-container" aria-label="SVG topology diagram">
        <svg
          viewBox="0 0 600 440"
          className="coalition-svg"
          role="img"
          aria-label="Microgrid topology with 6 nodes and 8 power lines"
        >
          {/* Defs: glow filter + line animation */}
          <defs>
            <filter id="glow-blue">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-amber">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Power lines */}
          {POWER_LINES.map((line, i) => {
            const from = nodeById[line.from];
            const to = nodeById[line.to];
            if (!from || !to) return null;
            return (
              <line
                key={i}
                x1={from.x} y1={from.y}
                x2={to.x}   y2={to.y}
                stroke={line.active ? "#2AA9FF" : "#3a3e42"}
                strokeWidth={line.active ? 2.5 : 1.5}
                strokeDasharray={line.active ? "8 4" : "4 6"}
                opacity={line.active ? 0.8 : 0.35}
                filter={line.active ? "url(#glow-blue)" : undefined}
              />
            );
          })}

          {/* Nodes */}
          {INITIAL_NODES.map((node) => {
            const r = 28;
            const pulse = node.inCoalition && tick % 2 === 0;
            return (
              <g key={node.id} transform={`translate(${node.x},${node.y})`} aria-label={node.label}>
                {/* Pulse ring */}
                {node.inCoalition && (
                  <circle
                    r={r + 8}
                    fill="none"
                    stroke="#2AA9FF"
                    strokeWidth={1.5}
                    opacity={pulse ? 0.4 : 0.15}
                    style={{ transition: "opacity 0.5s ease" }}
                  />
                )}
                {/* Main circle */}
                <circle
                  r={r}
                  fill={node.inCoalition ? "rgba(42,169,255,0.15)" : "rgba(43,47,51,0.85)"}
                  stroke={node.inCoalition ? "#2AA9FF" : "#4a4e54"}
                  strokeWidth={2}
                  filter={node.inCoalition ? "url(#glow-blue)" : undefined}
                />
                {/* Icon */}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  y={-4}
                  fontSize={18}
                >
                  {TYPE_ICON[node.type]}
                </text>
                {/* Surplus */}
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  y={12}
                  fontSize={9}
                  fill={node.inCoalition ? "#2AA9FF" : "#6b7280"}
                  fontFamily="monospace"
                >
                  {node.surplus}kWh
                </text>
                {/* Label */}
                <text
                  textAnchor="middle"
                  y={r + 16}
                  fontSize={10}
                  fill={node.inCoalition ? "#E8EAED" : "#6b7280"}
                  fontFamily="Inter, sans-serif"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Summary stats */}
      <div className="map-stats">
        <div className="map-stat">
          <span className="map-stat-value">
            {INITIAL_NODES.filter((n) => n.inCoalition).length}
          </span>
          <span className="map-stat-label">In Coalition</span>
        </div>
        <div className="map-stat">
          <span className="map-stat-value">
            {INITIAL_NODES.filter((n) => n.inCoalition).reduce((s, n) => s + n.surplus, 0)} kWh
          </span>
          <span className="map-stat-label">Pooled Surplus</span>
        </div>
        <div className="map-stat">
          <span className="map-stat-value" style={{ color: "#F5A623" }}>
            {POWER_LINES.filter((l) => l.active).length}
          </span>
          <span className="map-stat-label">Active Lines</span>
        </div>
      </div>
    </section>
  );
}
