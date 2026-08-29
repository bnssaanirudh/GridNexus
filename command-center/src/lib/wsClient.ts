/**
 * command-center/src/lib/wsClient.ts
 * ─────────────────────────────────────
 * WebSocket client with automatic reconnect & exponential backoff.
 */

import { io, type Socket } from "socket.io-client";
import { wsConfig } from "../theme/tokens";

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

const getHost = () => (typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "127.0.0.1");

export function createWsClient(
  brokerUrl: string = (import.meta as Record<string, any>).env?.VITE_BROKER_URL ?? `http://${getHost()}:3000`,
): WsClient {
  let state: ConnectionState = "connecting";
  let backoffMs: number = wsConfig.initialBackoffMs;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
  });

  // Forward all events to listeners
  const FORWARDED_EVENTS = [
    "round_update", "negotiation_start", "negotiation_end", "belief_update",
    "oracle_signal", "stability_check", "grid_certificate", "settlement",
    "ORACLE_SIGNAL", "BELIEF_UPDATE", "LLM_PROPOSAL", "SCHEMA_VALIDATION",
    "ECONOMIC_VALIDATION", "RESOURCE_CHECK", "DQN_SAFETY", "STABILITY_CHECK",
    "GRID_CERTIFICATION", "SETTLEMENT_COMMITTED",
  ];
  FORWARDED_EVENTS.forEach(evName => {
    socket.on(evName, (data: unknown) => {
      const ev: NegotiationEvent = {
        type: evName,
        negotiationId: (data as any)?.negotiationId,
        data: data as Record<string, unknown>,
        ts: Date.now(),
      };
      eventListeners.forEach(cb => cb(ev));
    });
  });

  function scheduleReconnect(): void {
    clearReconnectTimer();
    setState("disconnected");
    const delay = Math.min(backoffMs, wsConfig.maxBackoffMs);
    reconnectTimer = setTimeout(() => {
      setState("connecting");
      socket.connect();
      backoffMs = Math.min(backoffMs * wsConfig.backoffMultiplier, wsConfig.maxBackoffMs);
    }, delay);
  }

  socket.on("connect", () => { backoffMs = wsConfig.initialBackoffMs; setState("connected"); });
  socket.on("disconnect", () => { scheduleReconnect(); });
  socket.on("connect_error", () => { scheduleReconnect(); });

  return {
    on<T>(event: string, handler: WsEventHandler<T>): void {
      socket.on(event, handler as any);
    },
    off<T>(event: string, handler: WsEventHandler<T>): void {
      socket.off(event, handler as any);
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
      clearReconnectTimer();
      stateListeners.clear();
      eventListeners.clear();
      socket.disconnect();
    },
  };
}
