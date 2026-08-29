/**
 * command-center/src/components/OracleTimeline.tsx
 * ──────────────────────────────────────────────────
 * Oracle Signal Timeline Component.
 *
 * Polls GET /api/oracle-signals on the broker every 30 s and renders the
 * most recent Oracle broadcast signals in reverse-chronological order.
 *
 * ASSUMPTION : The broker exposes GET /api/oracle-signals (added in
 * this prompt) returning { signals: OracleSignal[] }.  Each signal has an id,
 * signalData (JSON string), and createdAt timestamp.
 */

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OracleSignalRow {
  id: string;
  signalData: string;
  createdAt: string;
}

interface ParsedSignal {
  signal?: string;
  confidence?: number;
  reasoning?: string;
  source?: string;
  synthetic?: boolean;
  freshness?: string;
  documentProvenance?: string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

interface OracleTimelineProps {
  /** Broker base URL. Overridable for tests. */
  brokerUrl?: string;
  /** Poll interval in ms. Default 30 000. */
  pollIntervalMs?: number;
  /** Maximum signals to show. Default 20. */
  limit?: number;
}

/**
 * Oracle signal timeline — polls the broker for recent Oracle broadcasts and
 * renders them in a chronological timeline with confidence bars and provenance badges.
 */
const getHost = () => (typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "127.0.0.1");

export function OracleTimeline({
  brokerUrl = (import.meta as Record<string, any>).env?.VITE_BROKER_URL ?? `http://${getHost()}:3000`,
  pollIntervalMs = 5000,
  limit = 20,
}: OracleTimelineProps): JSX.Element {
  const [signals, setSignals] = useState<OracleSignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch(`${brokerUrl}/api/oracle-signals`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { signals: OracleSignalRow[] };
      setSignals(data.signals.slice(0, limit));
      setError(null);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [brokerUrl, limit]);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchSignals, pollIntervalMs]);

  return (
    <section className="panel" aria-label="Oracle Signal Timeline">
      <header className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon" aria-hidden="true">🔮</span>
          Oracle Timeline
        </h2>
        {lastFetch && (
          <span className="panel-meta" aria-label="Last updated">
            Updated {lastFetch.toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}
      </header>

      {loading && <p className="feed-empty">Loading oracle signals…</p>}
      {error && (
        <p className="panel-error" role="alert">
          ⚠ {error}
        </p>
      )}

      {!loading && !error && signals.length === 0 && (
        <p className="feed-empty">No oracle signals yet.</p>
      )}

      <ol className="timeline" aria-label="Oracle broadcasts">
        {signals.map((sig) => {
          let parsed: ParsedSignal = {};
          try { parsed = JSON.parse(sig.signalData); } catch { /* raw */ }
          const conf = parsed.confidence ?? 0;
          const label = parsed.signal ?? "UNKNOWN";
          const ts = new Date(sig.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });

          return (
            <li key={sig.id} className="timeline-item">
              <div className="timeline-marker" aria-hidden="true" />
              <div className="timeline-body">
                <div className="timeline-row">
                  <span className="timeline-signal">{label}</span>
                  <span className="timeline-ts">{ts}</span>
                </div>
                
                <div className="timeline-badges" style={{ display: 'flex', gap: '8px', margin: '4px 0', fontSize: '0.8rem' }}>
                  {parsed.synthetic !== undefined && (
                    <span style={{ 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      backgroundColor: parsed.synthetic ? '#ffebee' : '#e8f5e9',
                      color: parsed.synthetic ? '#c62828' : '#2e7d32',
                      fontWeight: 'bold'
                    }}>
                      {parsed.synthetic ? 'SYNTHETIC' : 'LIVE'}
                    </span>
                  )}
                  {parsed.freshness && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e3f2fd', color: '#1565c0' }}>
                      ⏱ {parsed.freshness}
                    </span>
                  )}
                  {parsed.source && (
                    <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f3e5f5', color: '#6a1b9a' }}>
                      📄 {parsed.source}
                    </span>
                  )}
                </div>

                {parsed.reasoning && (
                  <p className="timeline-reasoning">{parsed.reasoning}</p>
                )}
                
                <div className="conf-bar-wrap" aria-label={`Confidence: ${(conf * 100).toFixed(0)}%`}>
                  <div
                    className="conf-bar"
                    style={{ width: `${(conf * 100).toFixed(1)}%` }}
                    role="progressbar"
                    aria-valuenow={conf * 100}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                  <span className="conf-label">{(conf * 100).toFixed(0)}%</span>
                </div>
                
                {parsed.documentProvenance && parsed.documentProvenance.length > 0 && (
                  <div className="timeline-provenance" style={{ marginTop: '8px', fontSize: '0.75rem', color: '#666' }}>
                    <strong>RAG Provenance:</strong>
                    <ul style={{ paddingLeft: '16px', margin: '4px 0' }}>
                      {parsed.documentProvenance.map((doc, idx) => <li key={idx}>{doc}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
