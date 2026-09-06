/**
 * command-center/src/components/NegotiationFeed.test.tsx
 * ────────────────────────────────────────────────────────
 * Unit tests for the NegotiationFeed component.
 *
 * Tests use a mock WsClient so no live broker is required.
 */

import { describe, it, expect, vi, } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { NegotiationFeed } from "./NegotiationFeed";
import type { WsClient, ConnectionState, WsEventHandler } from "../lib/wsClient";

// ── Mock WsClient factory ─────────────────────────────────────────────────────

function createMockWsClient(initialState: ConnectionState = "connected"): {
  client: WsClient;
  emit: (event: string, data: unknown) => void;
  triggerStateChange: (s: ConnectionState) => void;
} {
  const handlers = new Map<string, Set<WsEventHandler>>();
  const stateListeners = new Set<(s: ConnectionState) => void>();
  let state = initialState;

  const client: WsClient = {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler as WsEventHandler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler as WsEventHandler);
    },
    onStateChange(cb) {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    getState() { return state; },
    destroy: vi.fn(),
  };

  return {
    client,
    emit(event, data) {
      handlers.get(event)?.forEach((h) => h(data));
    },
    triggerStateChange(next) {
      state = next;
      stateListeners.forEach((cb) => cb(next));
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NegotiationFeed", () => {
  it("renders empty state when no events have arrived", () => {
    const { client } = createMockWsClient();
    render(<NegotiationFeed wsClient={client} />);
    expect(screen.getByText(/Waiting for negotiation events/i)).toBeInTheDocument();
  });

  it("shows 'connected' badge when WS is connected", () => {
    const { client } = createMockWsClient("connected");
    render(<NegotiationFeed wsClient={client} />);
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("shows 'disconnected' badge when WS is disconnected", () => {
    const { client } = createMockWsClient("disconnected");
    render(<NegotiationFeed wsClient={client} />);
    expect(screen.getByText("disconnected")).toBeInTheDocument();
  });

  it("updates connection badge when state changes", async () => {
    const { client, triggerStateChange } = createMockWsClient("connecting");
    render(<NegotiationFeed wsClient={client} />);
    expect(screen.getByText("connecting")).toBeInTheDocument();

    await act(async () => triggerStateChange("connected"));
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("renders a round_update event as a feed row", async () => {
    const { client, emit } = createMockWsClient();
    render(<NegotiationFeed wsClient={client} />);

    await act(async () => {
      emit("round_update", {
        negotiationId: "neg-abc-123",
        round: 1,
        activeAgent: "agent-xyz-456",
        discountedSurplus: 200.5,
      });
    });

    expect(screen.getByText("R1")).toBeInTheDocument();
    expect(screen.getByText(/200\.50 kWh/)).toBeInTheDocument();
  });

  it("renders a negotiation_complete ACCEPTED event", async () => {
    const { client, emit } = createMockWsClient();
    render(<NegotiationFeed wsClient={client} />);

    await act(async () => {
      emit("negotiation_complete", {
        negotiationId: "neg-done-789",
        status: "ACCEPTED",
        finalRound: 3,
      });
    });

    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
    expect(screen.getByText(/after 3 rounds/i)).toBeInTheDocument();
  });

  it("renders a negotiation_complete REJECTED event", async () => {
    const { client, emit } = createMockWsClient();
    render(<NegotiationFeed wsClient={client} />);

    await act(async () => {
      emit("negotiation_complete", {
        negotiationId: "neg-done-000",
        status: "REJECTED",
        finalRound: 10,
      });
    });

    expect(screen.getByText("REJECTED")).toBeInTheDocument();
  });

  it("renders a belief_update_pending (deferral) event", async () => {
    const { client, emit } = createMockWsClient();
    render(<NegotiationFeed wsClient={client} />);

    await act(async () => {
      emit("belief_update_pending", {
        agentId: "agent-blocked",
        message: "Belief update in progress. Retry after update completes.",
      });
    });

    expect(screen.getByText("DEFERRED")).toBeInTheDocument();
    expect(screen.getByText(/Belief update in progress/i)).toBeInTheDocument();
  });

  it("accumulates multiple events in order", async () => {
    const { client, emit } = createMockWsClient();
    render(<NegotiationFeed wsClient={client} />);

    await act(async () => {
      emit("round_update", { negotiationId: "n1", round: 1, activeAgent: "a1", discountedSurplus: 100 });
      emit("round_update", { negotiationId: "n1", round: 2, activeAgent: "a2", discountedSurplus: 95 });
      emit("negotiation_complete", { negotiationId: "n1", status: "ACCEPTED", finalRound: 2 });
    });

    expect(screen.getByText("R1")).toBeInTheDocument();
    expect(screen.getByText("R2")).toBeInTheDocument();
    expect(screen.getByText("ACCEPTED")).toBeInTheDocument();
  });
});
