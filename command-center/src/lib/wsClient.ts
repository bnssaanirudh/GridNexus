/**
 * command-center/src/lib/wsClient.ts
 * ─────────────────────────────────────
 * WebSocket client with automatic reconnect & exponential backoff.
 */

import { io, type Socket } from "socket.io-client";
import { wsConfig } from "../theme/tokens";
import { BROKER_URL } from "./apiClient";
import { getToken } from "./auth";

export type ConnectionState = "connecting" | "connected" | "disconnected";
export type WsEventHandler<T = unknown> = (data: T) => void;

export interface NegotiationEvent {
  type: string;
  negotiationId?: string;
  data?: Record<string, unknown>;
  ts?: number;
}

export interface WsClient {
  on<T = unknown>(event: string, handler: WsEventHandler<T>): void;
  off<T = unknown>(event: string, handler: WsEventHandler<T>): void;
  onStateChange(cb: (state: ConnectionState) => void): () => void;
  onEvent(cb: (ev: NegotiationEvent) => void): () => void;
  getState(): ConnectionState;
  destroy(): void;
}

export function createWsClient(
  brokerUrl: string = BROKER_URL,
): WsClient {
  let state: ConnectionState = "connecting";
  let backoffMs: number = wsConfig.initialBackoffMs;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const stateListeners = new Set<(s: ConnectionState) => void>();
  const eventListeners = new Set<(ev: NegotiationEvent) => void>();

  function setState(next: ConnectionState): void {
    if (next === state) return;
    state = next;
    stateListeners.forEach((cb) => cb(next));
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  const socket: Socket = io(`${brokerUrl}/negotiate`, {
    reconnection: false,
    transports: ["websocket", "polling"],
    timeout: 5_000,
    auth: { token: getToken() ?? undefined },
  });

  // Forward all events to listeners
  const FORWARDED_EVENTS = [
    "status", "round_update", "negotiation_start", "negotiation_end",
    "negotiation_complete", "belief_update", "belief_update_pending",
    "oracle_signal", "stability_check", "grid_certificate", "settlement",
    "your_turn", "settlement_failed", "protocol_error", "grid_rejected", "stability_rejected",
    "ORACLE_SIGNAL", "BELIEF_UPDATE", "LLM_PROPOSAL", "SCHEMA_VALIDATION",
    "ECONOMIC_VALIDATION", "RESOURCE_CHECK", "DQN_SAFETY", "STABILITY_CHECK",
    "GRID_CERTIFICATION", "SETTLEMENT_COMMITTED",
  ];
  FORWARDED_EVENTS.forEach(evName => {
    socket.on(evName, (data: unknown) => {
      const ev: NegotiationEvent = {
        type: evName,
        negotiationId: (data as { negotiationId?: string })?.negotiationId,
        data: data as Record<string, unknown>,
        ts: Date.now(),
      };
      eventListeners.forEach(cb => cb(ev));
    });
  });

  function scheduleReconnect(): void {
    if (destroyed) return;
    clearReconnectTimer();
    setState("disconnected");
    const delay = Math.min(backoffMs, wsConfig.maxBackoffMs);
    reconnectTimer = setTimeout(() => {
      if (destroyed) return;
      setState("connecting");
      socket.connect();
      backoffMs = Math.min(backoffMs * wsConfig.backoffMultiplier, wsConfig.maxBackoffMs);
    }, delay);
  }

  socket.on("connect", () => { if (!destroyed) { backoffMs = wsConfig.initialBackoffMs; setState("connected"); } });
  socket.on("disconnect", () => scheduleReconnect());
  socket.on("connect_error", () => scheduleReconnect());

  return {
    on<T>(event: string, handler: WsEventHandler<T>): void {
      socket.on(event, handler as (...args: unknown[]) => void);
    },
    off<T>(event: string, handler: WsEventHandler<T>): void {
      socket.off(event, handler as (...args: unknown[]) => void);
    },
    onStateChange(cb: (s: ConnectionState) => void): () => void {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    onEvent(cb: (ev: NegotiationEvent) => void): () => void {
      eventListeners.add(cb);
      return () => eventListeners.delete(cb);
    },
    getState(): ConnectionState {
      return state;
    },
    destroy(): void {
      destroyed = true;
      clearReconnectTimer();
      (socket as Socket & { removeAllListeners?: () => void }).removeAllListeners?.();
      stateListeners.clear();
      eventListeners.clear();
      socket.disconnect();
    },
  };
}
