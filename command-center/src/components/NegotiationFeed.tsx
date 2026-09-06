/**
 * command-center/src/components/NegotiationFeed.tsx
 * ──────────────────────────────────────────────────
 * Live Negotiation Feed Component.
 *
 * Subscribes to the broker's /negotiate Socket.IO namespace and renders
 * round-by-round events in real time without any manual refresh.
 *
 * Events handled:
 *   round_update        – fired each bargaining round with agent/surplus info
 *   negotiation_complete – final outcome (ACCEPTED / REJECTED / MAX_ROUNDS_REACHED)
 *   belief_update_pending – oracle gate deferral notice
 *
 * ASSUMPTION : The broker emits a `round_update` event at the start
 * of each Rubinstein round. The negotiate.ts handler currently logs to stdout;
 * a parallel `socket.to(negId).emit('round_update', …)` call is added so the
 * command-center receives it. If the broker is not running, the component shows
 * a disconnected state and retries with exponential backoff.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { WsClient, ConnectionState } from "../lib/wsClient";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RoundEvent {
  type: "round";
  negotiationId: string;
  round: number;
  activeAgent: string;
  discountedSurplus: number;
  timestamp: Date;
}

export interface CompleteEvent {
  type: "complete";
  negotiationId: string;
  status: "ACCEPTED" | "REJECTED" | "MAX_ROUNDS_REACHED";
  finalRound: number;
  timestamp: Date;
}

export interface DeferralEvent {
  type: "deferral";
  agentId: string;
  message: string;
  timestamp: Date;
}

export type FeedEvent = RoundEvent | CompleteEvent | DeferralEvent;

// ── Component ─────────────────────────────────────────────────────────────────

interface NegotiationFeedProps {
  /** Injected WsClient – allows mocking in tests. */
  wsClient: WsClient;
  /** Maximum events to keep in the list. Older ones scroll off. Default: 100. */
  maxEvents?: number;
}

/**
 * Live negotiation event feed.
 *
 * Displays a scrolling log of real-time negotiation events streamed from the
 * broker's /negotiate WebSocket namespace.
 */
export function NegotiationFeed({ wsClient, maxEvents = 100 }: NegotiationFeedProps): JSX.Element {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connState, setConnState] = useState<ConnectionState>(wsClient.getState());
  const scrollRef = useRef<HTMLDivElement>(null);

  const addEvent = useCallback(
    (ev: FeedEvent) => {
      setEvents((prev) => {
        const next = [...prev, ev];
        return next.length > maxEvents ? next.slice(next.length - maxEvents) : next;
      });
    },
    [maxEvents],
  );

  useEffect(() => {
    // Subscribe to connection-state changes
    const unsubState = wsClient.onStateChange(setConnState);

    // round_update: emitted by broker each Rubinstein round
    const onRound = (data: Record<string, unknown>) => {
      addEvent({
        type: "round",
        negotiationId: (data.negotiationId as string) ?? "?",
        round: (data.round as number) ?? 0,
        activeAgent: (data.activeAgent as string) ?? (data.agentId as string) ?? "?",
        discountedSurplus: (data.discountedSurplus as number) ?? 0,
        timestamp: new Date(),
      });
    };

    // negotiation_complete: emitted once bargaining finishes
    const onComplete = (data: Record<string, unknown>) => {
      addEvent({
        type: "complete",
        negotiationId: (data.negotiationId as string) ?? "?",
        status: (data.status as "ACCEPTED" | "REJECTED" | "MAX_ROUNDS_REACHED") ?? "REJECTED",
        finalRound: (data.finalRound as number) ?? 0,
        timestamp: new Date(),
      });
    };

    // belief_update_pending: oracle gate deferral
    const onDeferral = (data: Record<string, unknown>) => {
      addEvent({
        type: "deferral",
        agentId: (data.agentId as string) ?? "?",
        message: (data.message as string) ?? "Belief update pending",
        timestamp: new Date(),
      });
    };

    wsClient.on("round_update", onRound);
    wsClient.on("negotiation_complete", onComplete);
    wsClient.on("belief_update_pending", onDeferral);

    return () => {
      wsClient.off("round_update", onRound);
      wsClient.off("negotiation_complete", onComplete);
      wsClient.off("belief_update_pending", onDeferral);
      unsubState();
    };
  }, [wsClient, addEvent]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <section className="panel" aria-label="Live Negotiation Feed">
      <header className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon" aria-hidden="true">⚡</span>
          Negotiation Feed
        </h2>
        <span
          className={`conn-badge conn-${connState}`}
          aria-live="polite"
          aria-label={`WebSocket: ${connState}`}
        >
          <span className="conn-dot" aria-hidden="true" />
          {connState}
        </span>
      </header>

      <div
        className="feed-scroll"
        ref={scrollRef}
        role="log"
        aria-label="Negotiation events"
        aria-live="polite"
      >
        {events.length === 0 ? (
          <p className="feed-empty">Waiting for negotiation events…</p>
        ) : (
          events.map((ev, i) => <FeedRow key={i} event={ev} />)
        )}
      </div>
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FeedRow({ event }: { event: FeedEvent }): JSX.Element {
  const ts = event.timestamp.toLocaleTimeString("en-US", { hour12: false });

  if (event.type === "round") {
    return (
      <div className="feed-row feed-round" role="listitem">
        <span className="feed-ts" aria-label="Time">{ts}</span>
        <span className="feed-badge badge-round">R{event.round}</span>
        <span className="feed-label">
          Agent <code className="agent-id">{event.activeAgent.slice(0, 8)}…</code>
          &nbsp;→ <strong>{event.discountedSurplus.toFixed(2)} kWh</strong>
        </span>
      </div>
    );
  }

  if (event.type === "complete") {
    const cls = event.status === "ACCEPTED" ? "badge-accepted" : "badge-rejected";
    return (
      <div className="feed-row feed-complete" role="listitem">
        <span className="feed-ts">{ts}</span>
        <span className={`feed-badge ${cls}`}>{event.status}</span>
        <span className="feed-label">
          Negotiation <code className="agent-id">{event.negotiationId.slice(0, 8)}…</code>
          &nbsp;after {event.finalRound} rounds
        </span>
      </div>
    );
  }

  // deferral
  return (
    <div className="feed-row feed-deferral" role="listitem">
      <span className="feed-ts">{ts}</span>
      <span className="feed-badge badge-deferral">DEFERRED</span>
      <span className="feed-label">{event.message}</span>
    </div>
  );
}
