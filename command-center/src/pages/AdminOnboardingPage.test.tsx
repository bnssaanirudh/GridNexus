/**
 * command-center/src/pages/AdminOnboardingPage.test.tsx
 * ────────────────────────────────────────────────────────
 * Frontend tests for Admin DER Onboarding Console (Phase 10 / Prompt 10.1).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminOnboardingPage from "./AdminOnboardingPage";
import * as adminApi from "../lib/adminOnboardingApi";
import * as authLib from "../lib/auth";

describe("AdminOnboardingPage — DER Onboarding Console", () => {
  const mockApplications: adminApi.OnboardingApplication[] = [
    {
      id: "onboard-app-100",
      userId: "user-owner-1",
      user: {
        id: "user-owner-1",
        email: "solar_owner_1@example.com",
        username: "solar_owner_1",
        role: "DER_OWNER",
      },
      status: "PENDING_VERIFICATION",
      siteName: "Highland Solar Park",
      location: "Grid Feeder #4, 11kV Substation",
      derType: "SOLAR_BATTERY",
      capacityKw: 150.0,
      batteryCapacityKwh: 300.0,
      generationCost: 0.045,
      hasPrivateInfo: true,
      reviewedBy: null,
      reviewedAt: null,
      reason: null,
      microgridId: null,
      agentId: null,
      derId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "onboard-app-200",
      userId: "user-owner-2",
      user: {
        id: "user-owner-2",
        email: "commercial_hub@example.com",
        username: "commercial_hub",
        role: "DER_OWNER",
      },
      status: "APPROVED",
      siteName: "Metro Commercial Microgrid",
      location: "Feeder #12",
      derType: "COMMERCIAL_STORAGE",
      capacityKw: 200.0,
      batteryCapacityKwh: 400.0,
      generationCost: 0.055,
      hasPrivateInfo: true,
      reviewedBy: "admin-uuid",
      reviewedAt: new Date().toISOString(),
      reason: "Verified connection",
      microgridId: "mg-metro-200",
      agentId: "agent-metro-200",
      derId: "der-metro-200",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authLib, "useAuth").mockReturnValue({
      user: { id: "admin-1", username: "admin_super", email: "admin@gridnexus.local", role: "ADMIN" },
      token: "mock-token",
      authenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    vi.spyOn(adminApi, "listOnboardingApplications").mockResolvedValue(mockApplications);
    vi.spyOn(adminApi, "getOnboardingApplication").mockImplementation(async (id) => {
      const found = mockApplications.find((a) => a.id === id);
      if (!found) throw new Error("Application not found");
      return found;
    });
    vi.spyOn(adminApi, "approveOnboarding").mockResolvedValue({
      message: "Approved",
      status: "APPROVED",
      onboarding: { ...mockApplications[0], status: "APPROVED" },
    });
    vi.spyOn(adminApi, "rejectOnboarding").mockResolvedValue({
      message: "Rejected",
      status: "REJECTED",
      onboarding: { ...mockApplications[0], status: "REJECTED" },
    });
    vi.spyOn(adminApi, "suspendOnboarding").mockResolvedValue({
      message: "Suspended",
      status: "SUSPENDED",
      onboarding: { ...mockApplications[1], status: "SUSPENDED" },
    });
    vi.spyOn(adminApi, "triggerProvisioning").mockResolvedValue({
      message: "Provisioned successfully",
      status: "ACTIVE",
      provisioning: {
        microgridId: "mg-provisioned-100",
        derId: "der-provisioned-100",
        agentId: "agent-provisioned-100",
        busId: "bus-blr-01",
      },
    });
  });

  it("1. renders page title and lists pending and approved applications", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Admin DER Onboarding Console/i })).toBeInTheDocument();
      expect(screen.getByText("Highland Solar Park")).toBeInTheDocument();
      expect(screen.getByText("Metro Commercial Microgrid")).toBeInTheDocument();
      expect(screen.getAllByText("PENDING VERIFICATION").length).toBeGreaterThan(0);
      expect(screen.getAllByText("APPROVED").length).toBeGreaterThan(0);
    });
  });

  it("2. inspects public and verified private telemetry for verification", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText("Highland Solar Park")).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole("button", { name: /Inspect application/i });
    fireEvent.click(inspectBtns[0]);

    await waitFor(() => {
      expect(screen.getByLabelText("Inspection Detail")).toBeInTheDocument();
    });

    const detailCard = screen.getByLabelText("Inspection Detail");
    expect(detailCard).toHaveTextContent("Highland Solar Park");
    expect(detailCard).toHaveTextContent("Grid Feeder #4, 11kV Substation");
    expect(detailCard).toHaveTextContent("150 kW");
    expect(detailCard).toHaveTextContent("300 kWh");
    expect(detailCard).toHaveTextContent("$0.045/kWh");
  });

  it("3. allows approving a pending application", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText("Highland Solar Park")).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole("button", { name: /Inspect application/i });
    fireEvent.click(inspectBtns[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Approve Application/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Approve Application/i }));

    expect(screen.getByText(/Approve Onboarding Application/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /Confirm APPROVE/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.approveOnboarding).toHaveBeenCalledWith(
        "onboard-app-100",
        expect.stringContaining("verified")
      );
    });
  });

  it("4. requires a recorded reason when rejecting an application", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText("Highland Solar Park")).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole("button", { name: /Inspect application/i });
    fireEvent.click(inspectBtns[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Reject Application/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Reject Application/i }));

    expect(screen.getByText(/Reject Onboarding Application/i)).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/Administrative Justification \/ Reason/i);
    fireEvent.change(reasonInput, { target: { value: "Incompatible voltage level at connection bus" } });

    const confirmBtn = screen.getByRole("button", { name: /Confirm REJECT/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.rejectOnboarding).toHaveBeenCalledWith(
        "onboard-app-100",
        "Incompatible voltage level at connection bus"
      );
    });
  });

  it("5. requires confirmation modal with reason for suspension (destructive action)", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText("Metro Commercial Microgrid")).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole("button", { name: /Inspect application/i });
    fireEvent.click(inspectBtns[1]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Suspend Grid Interconnection/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Suspend Grid Interconnection/i }));

    expect(screen.getByText(/Confirm Asset Suspension/i)).toBeInTheDocument();
    expect(screen.getByText(/WARNING: Suspension immediately revokes market access/i)).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/Administrative Justification \/ Reason/i);
    fireEvent.change(reasonInput, { target: { value: "Maintenance breach" } });

    const confirmBtn = screen.getByRole("button", { name: /Confirm SUSPEND/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.suspendOnboarding).toHaveBeenCalledWith(
        "onboard-app-200",
        "Maintenance breach"
      );
    });
  });

  it("6. triggers transactional provisioning for approved applications", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText("Metro Commercial Microgrid")).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole("button", { name: /Inspect application/i });
    fireEvent.click(inspectBtns[1]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Provision Microgrid, DER & Agent/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Provision Microgrid, DER & Agent/i }));

    const confirmBtn = screen.getByRole("button", { name: /Confirm PROVISION/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(adminApi.triggerProvisioning).toHaveBeenCalledWith("onboard-app-200");
    });
  });

  it("7. displays provisioned infrastructure artifacts (Microgrid, DER, Agent)", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText("Metro Commercial Microgrid")).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole("button", { name: /Inspect application/i });
    fireEvent.click(inspectBtns[1]);

    await waitFor(() => {
      expect(screen.getByText("mg-metro-200")).toBeInTheDocument();
      expect(screen.getByText("der-metro-200")).toBeInTheDocument();
      expect(screen.getByText("agent-metro-200")).toBeInTheDocument();
    });
  });

  it("8. PROHIBITION INVARIANT: verifies NO direct trading buttons exist on admin onboarding page", async () => {
    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Admin DER Onboarding Console/i })).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    const buttonTexts = buttons.map((b) => b.textContent?.trim().toUpperCase());

    expect(buttonTexts).not.toContain("BUY");
    expect(buttonTexts).not.toContain("SELL");
    expect(buttonTexts).not.toContain("TRADE");
    expect(buttonTexts).not.toContain("COUNTER-OFFER");
  });

  it("9. STRICT RBAC: warns viewer role and disables mutation buttons", async () => {
    vi.spyOn(authLib, "useAuth").mockReturnValue({
      user: { id: "viewer-1", username: "viewer_user", email: "viewer@gridnexus.local", role: "VIEWER" },
      token: "mock-token",
      authenticated: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    });

    render(<AdminOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Read-Only Governance Access/i)).toBeInTheDocument();
    });

    const inspectBtns = screen.getAllByRole("button", { name: /Inspect application/i });
    fireEvent.click(inspectBtns[0]);

    await waitFor(() => {
      expect(screen.getByLabelText("Inspection Detail")).toBeInTheDocument();
    });

    // Mutation buttons must NOT be rendered for VIEWER
    expect(screen.queryByRole("button", { name: /Approve Application/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reject Application/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suspend Grid Interconnection/i })).not.toBeInTheDocument();
  });
});
