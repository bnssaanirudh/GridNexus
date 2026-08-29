/**
 * command-center/src/App.test.tsx
 * ────────────────────────────────
 *  & Smoke and Lazy-Loading tests for App component.
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

describe("App Dashboard & Lazy Embeds ( & 26)", () => {
  beforeEach(() => {
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

  it("renders the GridNexus brand name in the header", () => {
    render(<App />);
    expect(screen.getByText("GridNexus")).toBeInTheDocument();
  });

  it("renders core overview panels without blocking on lazy embeds", () => {
    render(<App />);
    // Core panels should all be present immediately in the DOM
    expect(screen.getByRole("region", { name: /coalition map/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /negotiation feed/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /oracle.*timeline/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /system health/i })).toBeInTheDocument();
  });

  it("switches to R Shiny Geospatial view and lazy loads GeoPanel", async () => {
    render(<App />);

    const geoTab = screen.getByRole("button", { name: /R Shiny Geospatial/i });
    fireEvent.click(geoTab);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /Geospatial Planar Graph Panel/i })).toBeInTheDocument();
    });
  });

  it("switches to Power BI Analytics view and lazy loads PowerBIPanel", async () => {
    render(<App />);

    const powerBiTab = screen.getByRole("button", { name: /Power BI Analytics/i });
    fireEvent.click(powerBiTab);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /Power BI Audit Analytics Panel/i })).toBeInTheDocument();
    });
  });

  it("shows WebSocket connection-state badge in the header", () => {
    render(<App />);
    const badge = screen.getByLabelText(/WebSocket status/i);
    expect(badge).toBeInTheDocument();
  });
});
