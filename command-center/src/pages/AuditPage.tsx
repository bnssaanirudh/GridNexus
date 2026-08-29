/**
 * command-center/src/pages/AuditPage.tsx
 * ────────────────────────────────────────
 * Cryptographic hash chain explorer.
 * Fetches audit events and allows online integrity verification.
 */

import { useState, useEffect } from "react";
import { computeEventHash } from "../lib/auditVerifier";

const BROKER_URL = (import.meta as any).env?.VITE_BROKER_URL ?? "http://localhost:3000";

interface AuditEvent {
  id: string;
  sequence: number;
  eventType: string;
  negotiationId?: string;
  actorId?: string;
  previousHash: string;
  eventHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

type VerifyStatus = "verified" | "broken" | "unknown" | "checking";

interface EventWithVerify extends AuditEvent {
  _verifyStatus: VerifyStatus;
}

function VerifyBadge({ status }: { status: VerifyStatus }) {
  if (status === "checking") return <div className="skeleton skeleton-badge" style={{ width: "64px", height: "20px" }} />;
  const cfg: Record<VerifyStatus, { cls: string; icon: string; label: string }> = {
    verified: { cls: "badge--live", icon: "✓", label: "Verified" },
    broken: { cls: "badge--error", icon: "✗", label: "Broken" },
    unknown: { cls: "badge--neutral", icon: "?", label: "Unknown" },
    checking: { cls: "badge--neutral", icon: "…", label: "Checking" },
  };
  const c = cfg[status];
  return <div className={`badge ${c.cls}`}>{c.icon} {c.label}</div>;
}

export default function AuditPage() {
  const [events, setEvents] = useState<EventWithVerify[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${BROKER_URL}/api/audit-events?limit=50`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: AuditEvent[] = await res.json();
        setEvents(data.map(e => ({ ...e, _verifyStatus: "unknown" })));
      } catch (err) {
        setError(`Could not load audit events: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const runVerification = async () => {
    setVerifying(true);
    const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
    const initialChecking: EventWithVerify[] = sorted.map(e => ({ ...e, _verifyStatus: "checking" as VerifyStatus }));
    setEvents(initialChecking);

    // Verify chain integrity sequentially
    const result: EventWithVerify[] = [];
    const minSeq = sorted[0]?.sequence ?? 0;
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      // Genesis check
      if (ev.sequence === minSeq) {
        result.push({ ...ev, _verifyStatus: ev.previousHash === "0" ? "verified" : "broken" });
        continue;
      }
      const prev = result.find(e => e.sequence === ev.sequence - 1);
      if (!prev) { result.push({ ...ev, _verifyStatus: "unknown" }); continue; }
      const expected = await computeEventHash(prev.eventHash, ev.payload, ev.eventType, ev.negotiationId, ev.actorId);
      result.push({ ...ev, _verifyStatus: expected === ev.eventHash ? "verified" : "broken" });
    }
    setEvents(result);
    setVerifying(false);
  };

  const brokenCount = events.filter(e => e._verifyStatus === "broken").length;
  const verifiedCount = events.filter(e => e._verifyStatus === "verified").length;

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Audit Chain</h1>
          <div className="page-subtitle">SHA-256 cryptographic event chain — append-only, deletion-protected</div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={runVerification}
          disabled={verifying || events.length === 0}
          aria-label="Verify chain integrity"
        >
          {verifying ? "Verifying…" : "Verify Chain"}
        </button>
      </div>

      {/* Summary */}
      {events.some(e => e._verifyStatus !== "unknown") && (
        <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
          <div className="badge badge--live">{verifiedCount} Verified</div>
          {brokenCount > 0 && <div className="badge badge--error">{brokenCount} Broken</div>}
          {brokenCount === 0 && verifiedCount > 0 && <div className="badge badge--live">Chain Intact</div>}
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: "var(--space-5)" }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr auto", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
              <div className="skeleton" style={{ height: "14px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                <div className="skeleton skeleton-text" />
                <div className="skeleton skeleton-text-sm" />
              </div>
              <div className="skeleton skeleton-badge" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="error-state">
          <div className="error-icon">⌁</div>
          <div className="error-title">Audit events unavailable</div>
          <div className="error-desc">{error}</div>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⌁</div>
          <div className="empty-title">No audit events yet</div>
          <div className="empty-desc">Events will appear here once negotiations begin.</div>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Event Chain ({events.length} events)</span>
            <span className="text-label">{events.length > 0 ? `Latest: #${events[0]?.sequence}` : ""}</span>
          </div>
          <div className="hash-chain">
            {events.map(ev => (
              <div key={ev.id} className="hash-event">
                <div className="hash-seq">#{ev.sequence}</div>
                <div className="hash-body">
                  <div className="hash-event-type">{ev.eventType}</div>
                  <div className="hash-value" title={ev.eventHash}>
                    hash: {ev.eventHash.slice(0, 8)}…{ev.eventHash.slice(-8)}
                  </div>
                  <div className="hash-value" style={{ marginTop: "2px" }} title={ev.previousHash}>
                    prev: {ev.previousHash === "0" ? "0 (genesis)" : `${ev.previousHash.slice(0, 8)}…`}
                  </div>
                  {ev.negotiationId && (
                    <div className="hash-value" style={{ marginTop: "2px", color: "var(--brand-blue)" }}>
                      neg: {ev.negotiationId.slice(0, 8)}…
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                    {new Date(ev.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <VerifyBadge status={ev._verifyStatus} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
