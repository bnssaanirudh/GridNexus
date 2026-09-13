/**
 * command-center/src/App.test.tsx
 * ────────────────────────────────
 * Routed command-center smoke tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock socket.io-client so App's createWsClient() doesn't connect ──────────
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

import App from "./App";

describe("App routed command center", () => {
  beforeEach(() => {
    localStorage.setItem("gn_token", "mock.jwt.token");
    localStorage.setItem("gn_user", JSON.stringify({ id: "demo-user", username: "Guest Demo", email: "guest@gridnexus.test", role: "demo" }));
    window.history.pushState({}, "", "/dashboard");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        signals: [],
        nodes: [],
        edges: [],
        summary: {
          totalTradedKwh: 100,
          totalVolumeUsd: 15,
          avgPricePerKwh: 0.15,
          stabilityPassRatePct: 95,
          avgStabilityMargin: 10,
          totalStabilityChecks: 20,
          totalOracleBroadcasts: 5,
        },
      }),
    } as Response);
  });

  it("renders the GridNexus brand and authenticated dashboard", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /GridNexus Home/i })).toBeInTheDocument();
    });
  });

  it("renders the persisted overview and navigation", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /System Overview/i })).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: /Dashboard navigation/i })).toBeInTheDocument();
    });
  });

  it("opens the detailed workflow route", async () => {
    render(<App />);

    const geoTab = screen.getByRole("link", { name: /System Workflow/i });
    fireEvent.click(geoTab);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /GridNexus system trace/i })).toBeInTheDocument();
    });
  });

  it("opens the system health route", async () => {
    render(<App />);

    const powerBiTab = screen.getByRole("link", { name: /System Health/i });
    fireEvent.click(powerBiTab);

    await waitFor(() => {
      expect(screen.getByText(/Service readiness probes and connectivity checks/i)).toBeInTheDocument();
    });
  });

  it("shows WebSocket connection state on the negotiation route", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: /^Negotiations$/i }));
    await waitFor(() => {
      expect(screen.getByText(/WS Connected|Connecting|Disconnected/i)).toBeInTheDocument();
    });
  });
});
