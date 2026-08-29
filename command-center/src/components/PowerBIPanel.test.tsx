/**
 * command-center/src/components/PowerBIPanel.test.tsx
 * ───────────────────────────────────────────────────
 * Unit tests for the PowerBIPanel component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PowerBIPanel } from "./PowerBIPanel";

const MOCK_ANALYTICS = {
  summary: {
    totalTradedKwh: 3450.5,
    totalVolumeUsd: 483.07,
    avgPricePerKwh: 0.14,
    stabilityPassRatePct: 96.5,
    avgStabilityMargin: 14.2,
    totalStabilityChecks: 60,
    totalOracleBroadcasts: 22,
  },
  oracleSignalsByType: {
    DEMAND_SURGE_SOON: 12,
    HEATWAVE_FORECAST: 10,
  },
  recentTransfersCount: 45,
  timestamp: new Date().toISOString(),
};

describe("PowerBIPanel ", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_ANALYTICS,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders DirectQuery audit analytics header and KPI cards", async () => {
    render(<PowerBIPanel brokerUrl="http://mock" pollIntervalMs={99999} />);
    await waitFor(() => {
      expect(screen.getByText(/3,450\.5 kWh/i)).toBeInTheDocument();
      expect(screen.getAllByText(/96\.5%/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders Stability Check & LP Verification metrics", async () => {
    render(<PowerBIPanel brokerUrl="http://mock" pollIntervalMs={99999} />);

    await waitFor(() => {
      expect(screen.getByText(/Coalition Stability Verification/i)).toBeInTheDocument();
      expect(screen.getByText(/Avg Surplus Margin:/i)).toBeInTheDocument();
    });
  });

  it("renders Power BI iframe embed when embedUrl is provided", () => {
    render(
      <PowerBIPanel
        brokerUrl="http://mock"
        embedUrl="https://app.powerbi.com/reportEmbed?reportId=mock"
        pollIntervalMs={99999}
      />
    );
    expect(screen.getByTitle(/Power BI Embedded Report/i)).toBeInTheDocument();
  });
});
