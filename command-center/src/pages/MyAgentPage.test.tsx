/**
 * command-center/src/pages/MyAgentPage.test.tsx
 * ───────────────────────────────────────────────
 * Tests for personal DER-owner dashboard ("My Energy Agent").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyAgentPage from "./MyAgentPage";
import * as meApi from "../lib/meApi";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

describe("MyAgentPage — Personal DER-Owner Dashboard", () => {
  const mockMicrogrids: meApi.MyMicrogrid[] = [
    {
      id: "mg-owner-1234",
      name: "Sunny Solar Site",
      type: "SOLAR_STORAGE",
      latitude: 37.7749,
      longitude: -122.4194,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      role: "OWNER",
    },
  ];

  const mockDers: meApi.MyDER[] = [
    {
      id: "der-solar-1",
      microgridId: "mg-owner-1234",
      type: "SOLAR_PV",
      ratedPowerKw: 45.0,
      energyCapacityKwh: null,
      minPowerKw: 0,
      maxPowerKw: 45.0,
      efficiency: 0.98,
      createdAt: new Date().toISOString(),
    },
    {
      id: "der-battery-1",
      microgridId: "mg-owner-1234",
      type: "BATTERY",
      ratedPowerKw: 30.0,
      energyCapacityKwh: 120.0,
      minPowerKw: 0,
      maxPowerKw: 30.0,
      efficiency: 0.92,
      metadata: { currentSoC: 0.65 },
      createdAt: new Date().toISOString(),
    },
  ];

  const mockAgent: meApi.MyAgent = {
    id: "agt-solar-owner-1",
    microgridId: "mg-owner-1234",
    type: "PRODUCER",
    qre_lambda: 0.85,
    microgridName: "Sunny Solar Site",
  };

  const mockAnalytics: meApi.MyAnalytics = {
    totalTradedKwh: 350.0,
    totalSoldKwh: 250.0,
    totalPurchasedKwh: 100.0,
    totalRevenueUsd: 37.5,
    totalCostUsd: 12.0,
    activeNegotiations: 2,
    committedSettlements: 5,
    derCount: 2,
    totalCapacityKw: 75.0,
    totalBatteryKwh: 120.0,
  };

  const mockPreferences: meApi.MyPreferences = {
    id: "pref-1",
    microgridId: "mg-owner-1234",
    tradingEnabled: true,
    minimumBatteryReservePct: 25.0,
    maximumDailyExportKwh: 500.0,
    minimumPreferredSalePrice: 12.0,
    maximumPreferredBuyPrice: 18.0,
    riskProfile: "BALANCED",
    maxTransactionSizeKwh: 80.0,
  };

  const mockSettlements: meApi.MySettlement[] = [
    {
      id: "settle-uuid-1",
      idempotencyKey: "neg-100-r2",
      negotiationId: "neg-100",
      sellerMicrogridId: "mg-owner-1234",
      buyerMicrogridId: "mg-buyer-5678",
      energyKwh: 50.0,
      pricePerKwh: 14.5,
      currency: "USD",
      deliveryStart: new Date().toISOString(),
      deliveryEnd: new Date().toISOString(),
      status: "COMMITTED",
      createdAt: new Date().toISOString(),
    },
  ];

  const mockNegotiations: meApi.MyNegotiation[] = [
    {
      id: "neg-100",
      status: "COMMITTED",
      sellerMicrogridId: "mg-owner-1234",
      buyerMicrogridId: "mg-buyer-5678",
      currency: "USD",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "neg-blocked-1",
      status: "FAILED",
      sellerMicrogridId: "mg-owner-1234",
      buyerMicrogridId: "mg-other-9999",
      currency: "USD",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockExplanations: meApi.DecisionExplanation[] = [
    {
      id: "exp-neg-100-r2",
      negotiationId: "neg-100",
      roundNumber: 2,
      decision: "ACCEPT",
      offeredPrice: 0.145,
      energyKwh: 50.0,
      confidence: 0.945,
      decisionSource: "LLM_AGENT",
      topFactors: [
        "Owner minimum price constraint ($12.0000/kWh) satisfied",
        "Battery reserve headroom preserved (65.0% SoC)",
        "Expected solar output active (45.0 kW rated)",
        "Coalition stability verified (margin: 8.50)",
      ],
      ownerConstraintsSatisfied: true,
      stabilityStatus: "STABLE",
      gridStatus: "FEASIBLE",
      oracleSignalIds: ["sig-oracle-1"],
      evidenceIds: {
        roundId: "rnd-100-2",
        stabilityCheckId: "sc-100",
        gridCertificateId: "cert-100",
        settlementId: "settle-uuid-1",
      },
      timestamp: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(meApi, "getMyMicrogrids").mockResolvedValue(mockMicrogrids);
    vi.spyOn(meApi, "getMyDERs").mockResolvedValue(mockDers);
    vi.spyOn(meApi, "getMyAgent").mockResolvedValue(mockAgent);
    vi.spyOn(meApi, "getMyAnalytics").mockResolvedValue(mockAnalytics);
    vi.spyOn(meApi, "getMyPreferences").mockResolvedValue(mockPreferences);
    vi.spyOn(meApi, "getMySettlements").mockResolvedValue(mockSettlements);
    vi.spyOn(meApi, "getMyNegotiations").mockResolvedValue(mockNegotiations);
    vi.spyOn(meApi, "getMyExplanations").mockResolvedValue(mockExplanations);
    vi.spyOn(meApi, "updateMyPreferences").mockImplementation(async (updates) => ({
      ...mockPreferences,
      ...updates,
    } as meApi.MyPreferences));
  });

  it("1. renders the personal dashboard title and agent status", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /My Energy Agent/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/Autonomous Trading Active/i)).toBeInTheDocument();
    expect(screen.getByText("agt-solar-owner-1")).toBeInTheDocument();
    expect(screen.getByText("Sunny Solar Site", { exact: false })).toBeInTheDocument();
  });

  it("2. displays trading KPI metrics: energy sold, bought, revenue, cost, net position", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByText("250.0")).toBeInTheDocument(); // Sold kWh
      expect(screen.getByText("100.0")).toBeInTheDocument(); // Bought kWh
      expect(screen.getByText("$37.50")).toBeInTheDocument(); // Revenue
      expect(screen.getByText(/\+150\.0/)).toBeInTheDocument(); // Net position
    });
  });

  it("3. displays battery reserve gauge and state of charge", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByText(/Battery & Storage Reserve/i)).toBeInTheDocument();
      expect(screen.getByText(/State of Charge: 65%/i)).toBeInTheDocument();
      expect(screen.getByText(/Min Reserve \(25%\)/i)).toBeInTheDocument();
    });
  });

  it("4. displays connected DER assets", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByText("SOLAR_PV")).toBeInTheDocument();
      expect(screen.getByText("BATTERY")).toBeInTheDocument();
      expect(screen.getByText(/45 kW/)).toBeInTheDocument();
    });
  });

  it("5. displays active owner safety constraints", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByText("25%")).toBeInTheDocument(); // Min reserve %
      expect(screen.getByText("500 kWh")).toBeInTheDocument(); // Max daily export
      expect(screen.getByText("$12/kWh")).toBeInTheDocument(); // Min sale price
      expect(screen.getByText("$18/kWh")).toBeInTheDocument(); // Max buy price
    });
  });

  it("6. displays committed settlements and blocked negotiations", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByText(/50\.0 kWh @ \$14\.500\/kWh/i)).toBeInTheDocument();
      expect(screen.getByText(/Blocked \/ Rejected Negotiations/i)).toBeInTheDocument();
      expect(screen.getByText(/Negotiation neg-bloc/i)).toBeInTheDocument();
    });
  });

  it("7. displays structured agent decision explanation panel", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByText(/Agent Decision Explanation & Audit Logic/i)).toBeInTheDocument();
      expect(screen.getByText(/Offer Construction Logic/i)).toBeInTheDocument();
      expect(screen.getByText(/Stability & Coalition Safeguard/i)).toBeInTheDocument();
      expect(screen.getByText(/Grid Physical Feasibility/i)).toBeInTheDocument();
    });
  });

  it("8. PROHIBITION INVARIANT: verifies NO manual BUY, SELL, ACCEPT, or COUNTER-OFFER buttons exist", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /My Energy Agent/i })).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    const buttonTexts = buttons.map((b) => b.textContent?.trim().toUpperCase());

    // Strict invariant: no human trading buttons
    expect(buttonTexts).not.toContain("BUY");
    expect(buttonTexts).not.toContain("SELL");
    expect(buttonTexts).not.toContain("ACCEPT");
    expect(buttonTexts).not.toContain("ACCEPT OFFER");
    expect(buttonTexts).not.toContain("COUNTER OFFER");
    expect(buttonTexts).not.toContain("COUNTER-OFFER");
  });

  it("9. allows pausing and resuming autonomous trading via toggle", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Pause autonomous trading/i })).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("button", { name: /Pause autonomous trading/i });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(meApi.updateMyPreferences).toHaveBeenCalledWith({
        microgridId: "mg-owner-1234",
        tradingEnabled: false,
      });
    });
  });

  it("10. allows updating owner safety constraints via modal", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Configure owner safety constraints/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Configure owner safety constraints/i }));

    expect(screen.getByText(/Configure Owner Constraints/i)).toBeInTheDocument();

    const minReserveInput = screen.getByLabelText(/Minimum battery reserve percentage/i);
    fireEvent.change(minReserveInput, { target: { value: "30" } });

    const submitBtn = screen.getByRole("button", { name: /Save Constraints/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(meApi.updateMyPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          microgridId: "mg-owner-1234",
          minimumBatteryReservePct: 30,
        })
      );
    });
  });

  it("11. displays structured autonomous agent decision explanation card with driving factors", async () => {
    render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByTestId("explanation-card")).toBeInTheDocument();
      expect(screen.getByText("$0.1450/kWh")).toBeInTheDocument();
      expect(screen.getByText("94.5%")).toBeInTheDocument();
      expect(screen.getByText(/Battery reserve headroom preserved/i)).toBeInTheDocument();
      expect(screen.getByText(/Coalition stability verified/i)).toBeInTheDocument();
      expect(screen.getByText(/Traceable Persisted Evidence/i)).toBeInTheDocument();
    });
  });

  it("12. PRIVACY GUARANTEE: ensures NO raw LLM chain-of-thought or competitor secrets are displayed", async () => {
    const { container } = render(<MyAgentPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /My Energy Agent/i })).toBeInTheDocument();
    });

    const textContent = container.textContent || "";
    expect(textContent).not.toContain("rawLlmOutput");
    expect(textContent).not.toContain("SECRET_CHAIN_OF_THOUGHT");
    expect(textContent).not.toContain("hiddenGenCost");
    expect(textContent).not.toContain("hiddenBattery");
  });
});

