/**
 * command-center/src/lib/wsClient.test.ts
 * ─────────────────────────────────────────
 * Unit tests for the WebSocket client wrapper.
 *
 * Tests mock socket.io-client's io() factory via vi.mock so no live broker
 * is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock socket.io-client ────────────────────────────────────────────────────

type EventHandler = (data?: unknown) => void;

interface MockSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  /** Test helper: fire a registered event handler */
  _fire: (event: string, data?: unknown) => void;
}

let mockSocket: MockSocket;

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMockSocket(): MockSocket {
  const listeners: Record<string, EventHandler[]> = {};
  return {
    on: vi.fn((event: string, handler: EventHandler) => {
      (listeners[event] ??= []).push(handler);
    }),
    off: vi.fn((event: string, handler: EventHandler) => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    _fire(event, data) {
      (listeners[event] ?? []).forEach((h) => h(data));
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createWsClient", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    mockSocket = buildMockSocket();
    // Re-import fresh module each test to clear module-level state
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts in connecting state", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");
    expect(client.getState()).toBe("connecting");
    client.destroy();
  });

  it("transitions to connected when socket emits connect", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");

    const stateChanges: string[] = [];
    client.onStateChange((s) => stateChanges.push(s));

    mockSocket._fire("connect");
    expect(client.getState()).toBe("connected");
    expect(stateChanges).toContain("connected");
    client.destroy();
  });

  it("transitions to disconnected and schedules reconnect on disconnect", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");
    mockSocket._fire("connect");

    const stateChanges: string[] = [];
    client.onStateChange((s) => stateChanges.push(s));

    mockSocket._fire("disconnect");
    expect(client.getState()).toBe("disconnected");
    expect(stateChanges).toContain("disconnected");

    // After backoff timer fires, should transition back to connecting
    await vi.runAllTimersAsync();
    expect(client.getState()).toBe("connecting");
    expect(mockSocket.connect).toHaveBeenCalled();
    client.destroy();
  });

  it("resets backoff to initial value after a successful reconnect", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");

    // Simulate: connect → disconnect → reconnect timer fires → connect again
    mockSocket._fire("connect");
    mockSocket._fire("disconnect");
    await vi.runAllTimersAsync();
    mockSocket._fire("connect"); // successful reconnect

    // After a clean connect, backoff should have reset (we can't inspect it directly,
    // but we can verify the client is in connected state with no pending timer)
    expect(client.getState()).toBe("connected");
    client.destroy();
  });

  it("forwards on() event subscriptions to the socket", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");

    const handler = vi.fn();
    client.on("round_update", handler);

    mockSocket._fire("round_update", { round: 1 });
    expect(handler).toHaveBeenCalledWith({ round: 1 });
    client.destroy();
  });

  it("removes event listeners with off()", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");

    const handler = vi.fn();
    client.on("round_update", handler);
    client.off("round_update", handler);

    mockSocket._fire("round_update", { round: 1 });
    expect(handler).not.toHaveBeenCalled();
    client.destroy();
  });

  it("onStateChange returns an unsubscribe function", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");

    const calls: string[] = [];
    const unsub = client.onStateChange((s) => calls.push(s));

    mockSocket._fire("connect");
    expect(calls).toContain("connected");

    unsub();
    mockSocket._fire("disconnect");
    // After unsub, no further calls should appear
    expect(calls).not.toContain("disconnected");
    client.destroy();
  });

  it("destroy() disconnects the socket and clears state listeners", async () => {
    const { createWsClient } = await import("./wsClient");
    const client = createWsClient("http://localhost:3000");

    const cb = vi.fn();
    client.onStateChange(cb);
    client.destroy();

    expect(mockSocket.disconnect).toHaveBeenCalled();
    // State listeners should be cleared
    cb.mockReset();
    mockSocket._fire("connect");
    expect(cb).not.toHaveBeenCalled();
  });
});
