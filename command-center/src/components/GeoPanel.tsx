/**
 * command-center/src/components/GeoPanel.tsx
 * ──────────────────────────────────────────
 * R Shiny Geospatial Planar Graph Embed Panel.
 *
 * Provides a lazy-loadable panel that:
 * 1. Embeds the external R Shiny Leaflet app (running on port 3838 or VITE_SHINY_URL).
 * 2. Provides an interactive fallback SVG / Leaflet-style visualizer that polls
 *    the broker `/api/topology` endpoint directly if the R Shiny server is offline.
 * 3. Highlights real-time power line utilization and coalitional capacity pooling.
 *
 * ASSUMPTION : The R Shiny app is served on http://localhost:3838 by default.
 * When running in environments where R runtime is not installed, the fallback visualizer
 * automatically renders the identical live planar graph data.
 */

import { useState, useEffect, useCallback } from "react";

// --- Types ---
export interface TopologyNode {
  id: string;
  name: string;
  type: "solar" | "wind" | "battery";
  lat: number;
  lon: number;
  capacity: number;
  in_coalition: boolean;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  capacity_kw: number;
  utilization_kw: number;
  utilization_pct: number;
}

export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  timestamp: string;
}

interface GeoPanelProps {
  brokerUrl?: string;
  shinyUrl?: string;
  pollIntervalMs?: number;
}

const getHost = () => (typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "127.0.0.1");

export function GeoPanel(props: GeoPanelProps): JSX.Element {
  const runtimeEnv = (import.meta as Record<string, any>).env;
  const brokerUrl = props.brokerUrl ?? runtimeEnv?.VITE_BROKER_URL ?? `http://${getHost()}:3000`;
  const shinyUrl = props.shinyUrl ?? runtimeEnv?.VITE_SHINY_URL ?? `http://${getHost()}:3838`;
  const pollIntervalMs = props.pollIntervalMs ?? 3000;
  const hasExplicitShinyUrl = Boolean(props.shinyUrl || runtimeEnv?.VITE_SHINY_URL);
  const [useIframe, setUseIframe] = useState<boolean>(hasExplicitShinyUrl);
  const [iframeError, setIframeError] = useState<boolean>(false);
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);

  // Poll topology data from broker
  const fetchTopology = useCallback(async () => {
    try {
      const res = await fetch(`${brokerUrl}/api/topology`);
      if (res.ok) {
        const data = (await res.json()) as TopologyData;
        setTopology(data);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, [brokerUrl]);

  useEffect(() => {
    fetchTopology();
    const timer = setInterval(fetchTopology, pollIntervalMs);
    return () => clearInterval(timer);
  }, [fetchTopology, pollIntervalMs]);

  // If iframe fails to load or user toggles, show native embedded visualizer
  const toggleViewMode = () => {
    setUseIframe(!useIframe);
  };

  const totalTransferKw = topology?.edges.reduce((s, e) => s + e.utilization_kw, 0) ?? 0;
  const maxUtilizationPct = topology?.edges.length
    ? Math.max(...topology.edges.map((e) => e.utilization_pct))
    : 0;
  const pooledCapacityKwh = topology?.nodes
    .filter((n) => n.in_coalition)
    .reduce((s, n) => s + n.capacity, 0) ?? 0;

  return (
    <section className="panel panel-wide" aria-label="Geospatial Planar Graph Panel">
      <header className="panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h2 className="panel-title">
            <span className="panel-icon" aria-hidden="true">🗺</span>
            Geospatial Planar Graph (R Shiny Embed)
          </h2>
          <span className="badge-live" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
            ● 3s Live Utilization Refresh
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            type="button"
            className="refresh-btn"
            onClick={toggleViewMode}
            aria-label="Toggle between R Shiny iframe and native planar visualizer"
          >
            {useIframe ? "Switch to Interactive Native View" : "Switch to R Shiny Iframe"}
          </button>
          <span className="panel-meta">
            {topology?.timestamp ? `Updated ${new Date(topology.timestamp).toLocaleTimeString()}` : ""}
          </span>
        </div>
      </header>

      {/* Metric Cards */}
      <div className="map-stats" style={{ marginBottom: "12px" }}>
        <div className="map-stat">
          <span className="map-stat-value">{totalTransferKw.toFixed(1)} kW</span>
          <span className="map-stat-label">Total Power Flow</span>
        </div>
        <div className="map-stat">
          <span
            className="map-stat-value"
            style={{ color: maxUtilizationPct > 80 ? "#EF4444" : maxUtilizationPct > 50 ? "#F5A623" : "#2AA9FF" }}
          >
            {maxUtilizationPct.toFixed(1)}%
          </span>
          <span className="map-stat-label">Max Line Utilization</span>
        </div>
        <div className="map-stat">
          <span className="map-stat-value">{pooledCapacityKwh} kWh</span>
          <span className="map-stat-label">Pooled VPP Capacity</span>
        </div>
        <div className="map-stat">
          <span className="map-stat-value" style={{ color: "#22C55E" }}>
            {topology?.nodes.filter((n) => n.in_coalition).length ?? 0} / {topology?.nodes.length ?? 0}
          </span>
          <span className="map-stat-label">Active Coalitions</span>
        </div>
      </div>

      {/* Main View: Iframe or Native Fallback Visualizer */}
      {useIframe && !iframeError ? (
        <div className="shiny-iframe-container" style={{ position: "relative", minHeight: "480px" }}>
          <iframe
            src={shinyUrl}
            title="GridNexus R Shiny Geospatial Planar Graph"
            style={{
              width: "100%",
              height: "480px",
              border: "1px solid rgba(42, 169, 255, 0.2)",
              borderRadius: "8px",
              background: "#1a1c1e",
            }}
            onError={() => setIframeError(true)}
            loading="lazy"
          />
          <div style={{ marginTop: "6px", fontSize: "0.72rem", color: "#9AA0A6", display: "flex", justifyContent: "space-between" }}>
            <span>Target: <code>{shinyUrl}</code> (R Shiny / Leaflet)</span>
            <span>If R server is offline, click 'Switch to Interactive Native View' above.</span>
          </div>
        </div>
      ) : (
        <NativePlanarVisualizer
          topology={topology}
          loading={loading}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />
      )}
    </section>
  );
}

// --- Native Interactive Planar Graph Component (Fallback / Standalone) ---
function NativePlanarVisualizer({
  topology,
  loading,
  selectedNode,
  onSelectNode,
}: {
  topology: TopologyData | null;
  loading: boolean;
  selectedNode: TopologyNode | null;
  onSelectNode: (n: TopologyNode | null) => void;
}): JSX.Element {
  if (loading && !topology) {
    return <div className="feed-empty">Loading planar graph data…</div>;
  }

  const nodes = topology?.nodes ?? [];
  const edges = topology?.edges ?? [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Scale geographic coords to SVG viewBox (600 x 400)
  const lons = nodes.map((n) => n.lon);
  const lats = nodes.map((n) => n.lat);
  const minLon = Math.min(...lons, -122.45);
  const maxLon = Math.max(...lons, -122.39);
  const minLat = Math.min(...lats, 37.74);
  const maxLat = Math.max(...lats, 37.80);

  const getX = (lon: number) => 60 + ((lon - minLon) / (maxLon - minLon || 1)) * 480;
  const getY = (lat: number) => 340 - ((lat - minLat) / (maxLat - minLat || 1)) * 280;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "12px" }}>
      <div className="map-container" style={{ position: "relative" }}>
        <svg viewBox="0 0 600 400" className="coalition-svg" role="img" aria-label="Interactive Planar Graph">
          <defs>
            <filter id="glow-active">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Edges (Transmission Lines) */}
          {edges.map((e) => {
            const from = nodeMap.get(e.from);
            const to = nodeMap.get(e.to);
            if (!from || !to) return null;

            const x1 = getX(from.lon);
            const y1 = getY(from.lat);
            const x2 = getX(to.lon);
            const y2 = getY(to.lat);

            const isHigh = e.utilization_pct > 80;
            const isMedium = e.utilization_pct >= 50;
            const isIdle = e.utilization_kw === 0;

            const color = isIdle ? "#4A4E54" : isHigh ? "#EF4444" : isMedium ? "#F5A623" : "#22C55E";
            const strokeWidth = isIdle ? 1.5 : isHigh ? 4.5 : isMedium ? 3.5 : 2.5;

            return (
              <g key={e.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isIdle ? "4 4" : undefined}
                  opacity={isIdle ? 0.4 : 0.9}
                  filter={!isIdle ? "url(#glow-active)" : undefined}
                />
                {/* Edge Label on hover / line center */}
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 6}
                  fill="#9AA0A6"
                  fontSize="9"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {e.utilization_kw > 0 ? `${e.utilization_kw}kW (${e.utilization_pct}%)` : ""}
                </text>
              </g>
            );
          })}

          {/* Nodes (Microgrids) */}
          {nodes.map((n) => {
            const cx = getX(n.lon);
            const cy = getY(n.lat);
            const r = 16 + (n.capacity / 600) * 12;
            const isSelected = selectedNode?.id === n.id;

            return (
              <g
                key={n.id}
                onClick={() => onSelectNode(n)}
                style={{ cursor: "pointer" }}
                aria-label={`${n.name} (${n.capacity} kWh)`}
              >
                {n.in_coalition && (
                  <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="#2AA9FF" strokeWidth="1.5" opacity="0.4" />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={n.in_coalition ? "rgba(42, 169, 255, 0.25)" : "rgba(43, 47, 51, 0.85)"}
                  stroke={isSelected ? "#F5A623" : n.in_coalition ? "#2AA9FF" : "#6B7280"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text x={cx} y={cy - 2} textAnchor="middle" fontSize="13" fill="#E8EAED">
                  {n.type === "solar" ? "☀" : n.type === "wind" ? "🌬" : "🔋"}
                </text>
                <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#2AA9FF" fontFamily="monospace">
                  {n.capacity}k
                </text>
                <text x={cx} y={cy + r + 12} textAnchor="middle" fontSize="10" fill="#E8EAED" fontWeight="500">
                  {n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node & Edge Inspector Side Card */}
      <div className="panel-box" style={{ background: "rgba(35,38,41,0.6)" }}>
        <h4 style={{ margin: "0 0 10px 0", color: "#2AA9FF", fontSize: "0.85rem" }}>
          Microgrid Inspector
        </h4>
        {selectedNode ? (
          <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div><strong>{selectedNode.name}</strong> (<code>{selectedNode.id}</code>)</div>
            <div>Type: <span style={{ textTransform: "capitalize" }}>{selectedNode.type}</span></div>
            <div>Battery Capacity: <strong>{selectedNode.capacity} kWh</strong></div>
            <div>
              Status:{" "}
              <span style={{ color: selectedNode.in_coalition ? "#22C55E" : "#9AA0A6", fontWeight: "600" }}>
                {selectedNode.in_coalition ? "Active VPP Coalition" : "Standby"}
              </span>
            </div>
            <div>Coordinates: <code>{selectedNode.lat.toFixed(4)}, {selectedNode.lon.toFixed(4)}</code></div>
            <button
              type="button"
              className="refresh-btn"
              style={{ marginTop: "10px", width: "100%" }}
              onClick={() => onSelectNode(null)}
            >
              Clear Selection
            </button>
          </div>
        ) : (
          <p style={{ fontSize: "0.75rem", color: "#9AA0A6" }}>
            Click on any microgrid node in the planar graph to inspect its private capacity tier and connected lines.
          </p>
        )}

        <hr style={{ borderColor: "rgba(42, 169, 255, 0.15)", margin: "14px 0" }} />
        <h4 style={{ margin: "0 0 8px 0", color: "#2AA9FF", fontSize: "0.8rem" }}>
          Active Power Lines ({edges.filter((e) => e.utilization_kw > 0).length})
        </h4>
        <div style={{ maxHeight: "150px", overflowY: "auto", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "4px" }}>
          {edges.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span><code>{e.from}</code> &rarr; <code>{e.to}</code></span>
              <span style={{ fontFamily: "monospace", color: e.utilization_pct > 80 ? "#EF4444" : e.utilization_pct > 50 ? "#F5A623" : "#22C55E" }}>
                {e.utilization_kw}kW ({e.utilization_pct}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GeoPanel;
