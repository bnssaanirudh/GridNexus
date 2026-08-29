/**
 * command-center/src/pages/NegotiationFeedPage.tsx
 * ─────────────────────────────────────────────────
 * Live negotiation events via WebSocket with pipeline step timeline.
 */

import { useState, useEffect, useRef } from "react";
import { createWsClient, type ConnectionState } from "../lib/wsClient";
import type { NegotiationEvent } from "../lib/wsClient";

const BROKER_URL = (import.meta as any).env?.VITE_BROKER_URL ?? "http://localhost:3000";

const PIPELINE_STAGES = [
  "ORACLE_SIGNAL", "BELIEF_UPDATE", "LLM_PROPOSAL", "SCHEMA_VALIDATION",
  "ECONOMIC_VALIDATION", "RESOURCE_CHECK", "DQN_SAFETY", "STABILITY_CHECK",
  "GRID_CERTIFICATION", "SETTLEMENT_COMMITTED",
];

function PipelineTimeline({ events }: { events: NegotiationEvent[] }) {
  const completedTypes = new Set(events.map(e => e.type));

  return (
    <div className="timeline">
      {PIPELINE_STAGES.map((stage, i) => {
        const ev = events.find(e => e.type === stage);
        const isCurrent = !completedTypes.has(stage) && i > 0 && completedTypes.has(PIPELINE_STAGES[i - 1]);
        const status = ev
          ? (ev.data?.status === "failed" || ev.data?.error ? "fail" : "pass")
          : isCurrent ? "pending" : completedTypes.size === 0 ? "pending" : "pending";

        return (
          <div key={stage} className="timeline-item">
            <div className="timeline-step">
              <div className={`timeline-step-dot timeline-step-dot--${status}`} />
              {i < PIPELINE_STAGES.length - 1 && <div className="timeline-step-line" />}
            </div>
            <div className="timeline-body">
              <div className="timeline-stage-name">{stage.replace(/_/g, " ")}</div>
              {ev?.data && (
                <div className="timeline-stage-detail">
                  {JSON.stringify(ev.data).slice(0, 120)}
                </div>
              )}
            </div>
            {ev && (
              <div>
                <span className={`badge ${status === "pass" ? "badge--live" : "badge--error"}`}>
                  {status === "pass" ? "✓" : "✗"}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NegotiationFeedPage() {
  const wsClientRef = useRef(createWsClient(BROKER_URL));
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [eventsByNeg, setEventsByNeg] = useState<Record<string, NegotiationEvent[]>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const client = wsClientRef.current;
    const unsub = client.onStateChange(setConnState);
    const unsubEv = client.onEvent((ev: NegotiationEvent) => {
      setEventsByNeg(prev => {
        const negId = ev.negotiationId ?? "unknown";
        return { ...prev, [negId]: [...(prev[negId] ?? []), ev] };
      });
    });
    return () => { unsub(); unsubEv(); client.destroy(); };
  }, []);

  const negIds = Object.keys(eventsByNeg).sort().reverse();

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Negotiations</h1>
          <div className="page-subtitle">Live negotiation pipeline events via WebSocket</div>
        </div>
        <div className={`conn-badge conn-badge--${connState}`}>
          <span className="conn-dot" />
          {connState === "connected" ? "WS Connected" : connState === "connecting" ? "Connecting…" : "Disconnected"}
        </div>
      </div>

      {negIds.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⇄</div>
          <div className="empty-title">No negotiations yet</div>
          <div className="empty-desc">Events will appear here in real-time once negotiations start.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "var(--space-4)" }}>
          {/* Negotiation list */}
          <div className="card">
            <div className="card-header"><span className="card-title">Active ({negIds.length})</span></div>
            <div>
              {negIds.map(id => {
                const evts = eventsByNeg[id];
                const lastEvt = evts[evts.length - 1];
                const isCommitted = evts.some(e => e.type === "SETTLEMENT_COMMITTED");
                return (
                  <button
                    key={id}
                    className="nav-item"
                    style={{ borderRadius: 0, width: "100%", borderLeft: selected === id ? "2px solid var(--brand-blue)" : "2px solid transparent" }}
                    onClick={() => setSelected(id)}
                  >
                    <div style={{ width: "100%" }}>
                      <div style={{ fontSize: "12px", color: "var(--fg-primary)", fontWeight: 600, marginBottom: "2px" }}>{id.slice(0, 12)}…</div>
                      <div style={{ fontSize: "11px", color: "var(--fg-muted)", display: "flex", justifyContent: "space-between" }}>
                        <span>{evts.length} events</span>
                        <span className={`badge badge--${isCommitted ? "committed" : "info"}`} style={{ padding: "1px 6px", fontSize: "10px" }}>
                          {isCommitted ? "COMMITTED" : lastEvt?.type?.slice(0, 10) ?? "ACTIVE"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pipeline detail */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                {selected ? `Pipeline — ${selected.slice(0, 16)}…` : "Select a negotiation"}
              </span>
            </div>
            <div className="card-body">
              {selected
                ? <PipelineTimeline events={eventsByNeg[selected] ?? []} />
                : (
                  <div className="empty-state">
                    <div className="empty-icon">⇄</div>
                    <div className="empty-desc">Click a negotiation to view its pipeline.</div>
                  </div>
                )
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
