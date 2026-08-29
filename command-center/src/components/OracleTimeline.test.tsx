/**
 * command-center/src/components/OracleTimeline.test.tsx
 * ─────────────────────────────────────────────────────
 * Unit tests for the OracleTimeline component.
 *
 * Uses fetch mocking (vi.spyOn) so no live broker is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OracleTimeline } from "./OracleTimeline";

const MOCK_SIGNAL = {
  id: "sig-001",
  signalData: JSON.stringify({
    signal: "DEMAND_SURGE_SOON",
    confidence: 0.85,
    reasoning: "Heatwave detected – demand spike imminent.",
    source: "rag_pipeline:weather_connector",
  }),
  createdAt: new Date().toISOString(),
};

describe("OracleTimeline", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ signals: [MOCK_SIGNAL] }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading message initially", () => {
    render(<OracleTimeline brokerUrl="http://mock" pollIntervalMs={99999} />);
    expect(screen.getByText(/Loading oracle signals/i)).toBeInTheDocument();
  });

  it("renders a signal after fetch completes", async () => {
    render(<OracleTimeline brokerUrl="http://mock" pollIntervalMs={99999} />);

    await waitFor(() => {
      expect(screen.getByText("DEMAND_SURGE_SOON")).toBeInTheDocument();
    });

    expect(screen.getByText(/Heatwave detected/i)).toBeInTheDocument();
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });

  it("shows source attribution", async () => {
    render(<OracleTimeline brokerUrl="http://mock" pollIntervalMs={99999} />);
    await waitFor(() => {
      expect(screen.getByText(/rag_pipeline:weather_connector/i)).toBeInTheDocument();
    });
  });

  it("shows error message on fetch failure", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    render(<OracleTimeline brokerUrl="http://mock" pollIntervalMs={99999} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("shows 'No oracle signals yet' when list is empty", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ signals: [] }),
    } as Response);

    render(<OracleTimeline brokerUrl="http://mock" pollIntervalMs={99999} />);

    await waitFor(() => {
      expect(screen.getByText(/No oracle signals yet/i)).toBeInTheDocument();
    });
  });

  it("renders confidence progressbar with correct value", async () => {
    render(<OracleTimeline brokerUrl="http://mock" pollIntervalMs={99999} />);

    await waitFor(() => {
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "85");
    });
  });
});
