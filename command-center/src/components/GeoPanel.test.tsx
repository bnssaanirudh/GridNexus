/**
 * command-center/src/components/GeoPanel.test.tsx
 * ──────────────────────────────────────────────
 * Unit tests for the GeoPanel component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { GeoPanel } from "./GeoPanel";

const MOCK_TOPOLOGY = {
  nodes: [
    { id: "mg-1", name: "Solar Array Alpha", type: "solar", lat: 37.77, lon: -122.41, capacity: 500, in_coalition: true },
    { id: "mg-3", name: "Battery Hub Gamma", type: "battery", lat: 37.76, lon: -122.42, capacity: 600, in_coalition: true },
  ],
  edges: [
    { id: "line-1-3", from: "mg-1", to: "mg-3", capacity_kw: 400, utilization_kw: 180, utilization_pct: 45.0 },
  ],
  timestamp: new Date().toISOString(),
};

describe("GeoPanel ", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_TOPOLOGY,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders panel header and default R Shiny iframe view", () => {
    render(<GeoPanel brokerUrl="http://mock" shinyUrl="http://mock:3838" pollIntervalMs={99999} />);
    expect(screen.getByText(/Geospatial Planar Graph/i)).toBeInTheDocument();
    expect(screen.getByTitle(/R Shiny Geospatial Planar Graph/i)).toBeInTheDocument();
  });

  it("calculates and displays aggregated power flow and capacity metrics", async () => {
    render(<GeoPanel brokerUrl="http://mock" shinyUrl="http://mock:3838" pollIntervalMs={99999} />);

    await waitFor(() => {
      expect(screen.getByText("180.0 kW")).toBeInTheDocument();
      expect(screen.getByText("45.0%")).toBeInTheDocument();
      expect(screen.getByText("1100 kWh")).toBeInTheDocument();
    });
  });

  it("toggles to native interactive planar visualizer on button click", async () => {
    render(<GeoPanel brokerUrl="http://mock" shinyUrl="http://mock:3838" pollIntervalMs={99999} />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle between R Shiny iframe and native planar visualizer/i });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /Interactive Planar Graph/i })).toBeInTheDocument();
      expect(screen.getByText("Solar Array Alpha")).toBeInTheDocument();
    });
  });
});
