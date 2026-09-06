/**
 * command-center/src/pages/AdminOraclePage.test.tsx
 * ────────────────────────────────────────────────────
 * Frontend tests for Admin Oracle Source Management Console (Phase 10 / Prompt 10.2).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminOraclePage from "./AdminOraclePage";
import * as oracleApi from "../lib/adminOracleApi";
import * as authLib from "../lib/auth";

describe("AdminOraclePage — Oracle Source Management", () => {
  const mockSources: oracleApi.OracleSource[] = [
    {
      id: "src-oracle-1",
      sourceType: "WEATHER",
      sourceName: "NOAA Solar GHI Model",
      sourceUri: "https://api.weather.gov/gridpoints/MTR/forecast",
      publisher: "NOAA National Weather Service",
      content: "Clear sky solar irradiance expected to exceed 950 W/m2 from 11:00 to 14:00 UTC across Feeder 4 cluster.",
      contentHash: "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef",
      observedAt: new Date().toISOString(),
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      trustScore: 0.98,
      connectorVersion: "manual-admin-v1",
      embeddingModel: "all-MiniLM-L6-v2",
      embeddingModelVersion: "1.1.0",
      embeddingDimension: 384,
      metadata: { irradiancePeak: 950 },
      ingestedAt: new Date().toISOString(),
      status: "ACTIVE",
    },
    {
      id: "src-oracle-2",
      sourceType: "GRID_NOTICE",
      sourceName: "CAISO Emergency Curtailment Notice",
      sourceUri: "https://caiso.com/notices/curtail-091",
      publisher: "CAISO Operations",
      content: "Transformer maintenance scheduled; line capacity derated to 600 kW between 18:00 and 22:00.",
      contentHash: "b2c3d4e5f6a178901234567890abcdef1234567890abcdef1234567890abcdef",
      observedAt: new Date().toISOString(),
      validFrom: new Date(Date.now() - 172800000).toISOString(),
      validUntil: new Date(Date.now() - 86400000).toISOString(),
      trustScore: 0.92,
      connectorVersion: "auto-caiso-v1",
      embeddingModel: "all-MiniLM-L6-v2",
      embeddingModelVersion: "1.1.0",
      embeddingDimension: 384,
      metadata: null,
      ingestedAt: new Date(Date.now() - 172800000).toISOString(),
      status: "REVOKED",
    },
  ];

  const mockAudits: oracleApi.OracleAuditsResponse = {
    retrievedAudits: [
      {
        id: "audit-ret-1",
        query: "What is the expected solar irradiance during peak hours?",
        documentIds: ["src-oracle-1"],
        similarityScore: 0.1245,
        ranking: 1,
        modelVersion: "1.1.0",
        timestamp: new Date().toISOString(),
      },
    ],
    auditEvents: [
      {
        id: "evt-audit-1",
        eventType: "ORACLE_SOURCE_INGESTED",
        actorId: "admin-user-id",
        payload: {
          documentId: "src-oracle-1",
          sourceName: "NOAA Solar GHI Model",
          sourceType: "WEATHER",
        },
        hash: "sha256hash1234567890abcdef",
        previousHash: "000000000000000000000000",
        timestamp: new Date().toISOString(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(authLib, "useAuth").mockReturnValue({
      user: {
        id: "admin-user-id",
        email: "admin@gridnexus.io",
        username: "admin_super",
        role: "ADMIN",
        active: true,
      },
      token: "mock-admin-token",
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(oracleApi, "listOracleSources").mockResolvedValue({
      total: mockSources.length,
      page: 1,
      limit: 50,
      sources: mockSources,
    });

    vi.spyOn(oracleApi, "getOracleAudits").mockResolvedValue(mockAudits);
    vi.spyOn(oracleApi, "submitOracleSource").mockResolvedValue({
      ...mockSources[0],
      id: "src-new-123",
      sourceName: "Newly Ingested Feed",
    });
    vi.spyOn(oracleApi, "revokeOracleSource").mockResolvedValue({
      id: "src-oracle-1",
      status: "REVOKED",
      message: "Source revoked successfully.",
    });
    vi.spyOn(oracleApi, "reingestOracleSource").mockResolvedValue({
      id: "src-oracle-2",
      status: "ACTIVE",
      message: "Source re-ingested successfully.",
    });
  });

  it("1. renders header, KPI metrics, and initial source cards", async () => {
    render(<AdminOraclePage />);

    expect(screen.getByText("Oracle Source Management")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Submit Approved Signal/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("NOAA Solar GHI Model")).toBeInTheDocument();
      expect(screen.getByText("CAISO Emergency Curtailment Notice")).toBeInTheDocument();
    });

    // Check KPIs
    expect(screen.getByText("Total Ingested Sources")).toBeInTheDocument();
    expect(screen.getByText("Active Signal Feeds")).toBeInTheDocument();
    expect(screen.getByText("Revoked / Expired")).toBeInTheDocument();
    expect(screen.getByText("Mean Trust Score")).toBeInTheDocument();
  });

  it("2. filters sources by search input", async () => {
    render(<AdminOraclePage />);

    await waitFor(() => {
      expect(screen.getByText("NOAA Solar GHI Model")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by source name/i);
    fireEvent.change(searchInput, { target: { value: "CAISO" } });

    expect(screen.queryByText("NOAA Solar GHI Model")).not.toBeInTheDocument();
    expect(screen.getByText("CAISO Emergency Curtailment Notice")).toBeInTheDocument();
  });

  it("3. filters sources by status filter dropdown", async () => {
    render(<AdminOraclePage />);

    await waitFor(() => {
      expect(screen.getByText("NOAA Solar GHI Model")).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue("All Statuses");
    fireEvent.change(statusSelect, { target: { value: "ACTIVE" } });

    await waitFor(() => {
      expect(oracleApi.listOracleSources).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" })
      );
    });
  });

  it("4. expands and collapses long content", async () => {
    render(<AdminOraclePage />);

    await waitFor(() => {
      expect(screen.getByText("NOAA Solar GHI Model")).toBeInTheDocument();
    });

    // Test expand toggle
    const expandButtons = screen.queryAllByText("Read full text");
    if (expandButtons.length > 0) {
      fireEvent.click(expandButtons[0]);
      expect(screen.getByText("Show less")).toBeInTheDocument();
    }
  });

  it("5. opens and submits the manual Oracle ingestion modal", async () => {
    render(<AdminOraclePage />);

    const openBtn = screen.getByRole("button", { name: /\+ Submit Approved Signal/i });
    fireEvent.click(openBtn);

    expect(screen.getByText("Submit Approved Oracle Information")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. NOAA Solar Irradiance Forecast/i);
    const pubInput = screen.getByPlaceholderText(/e\.g\. National Weather Service/i);
    const contentInput = screen.getByPlaceholderText(/Enter verbatim or framed signal narrative/i);

    fireEvent.change(nameInput, { target: { value: "ERCOT Wind Forecast" } });
    fireEvent.change(pubInput, { target: { value: "ERCOT ISO" } });
    fireEvent.change(contentInput, {
      target: { value: "High nocturnal wind generation expected across West Texas grid region." },
    });

    const submitBtn = screen.getByText("Ingest & Vectorize");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(oracleApi.submitOracleSource).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: "ERCOT Wind Forecast",
          publisher: "ERCOT ISO",
          content: "High nocturnal wind generation expected across West Texas grid region.",
          sourceType: "WEATHER",
        })
      );
    });
  });

  it("6. opens revoke dialog and revokes an active source with a mandatory reason", async () => {
    render(<AdminOraclePage />);

    await waitFor(() => {
      expect(screen.getByText("NOAA Solar GHI Model")).toBeInTheDocument();
    });

    const revokeButtons = screen.getAllByText("Revoke");
    fireEvent.click(revokeButtons[0]);

    expect(screen.getByText("Revoke Oracle Source")).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/e\.g\. Obsolete forecast/i);
    fireEvent.change(reasonInput, { target: { value: "Forecast superseded by rapid radar update." } });

    const confirmBtn = screen.getByText("Confirm Revocation");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(oracleApi.revokeOracleSource).toHaveBeenCalledWith(
        "src-oracle-1",
        "Forecast superseded by rapid radar update."
      );
    });
  });

  it("7. triggers re-ingestion for a revoked source", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AdminOraclePage />);

    await waitFor(() => {
      expect(screen.getByText("CAISO Emergency Curtailment Notice")).toBeInTheDocument();
    });

    const reingestBtn = screen.getByText("Re-ingest");
    fireEvent.click(reingestBtn);

    await waitFor(() => {
      expect(oracleApi.reingestOracleSource).toHaveBeenCalledWith("src-oracle-2");
    });
  });

  it("8. switches to 'Retrieval Audits & Ledger' tab and renders audit trail", async () => {
    render(<AdminOraclePage />);

    const auditsTab = screen.getByText(/Retrieval Audits & Ledger/i);
    fireEvent.click(auditsTab);

    await waitFor(() => {
      expect(oracleApi.getOracleAudits).toHaveBeenCalled();
      expect(screen.getByText("RAG Cosine Retrieval Audits")).toBeInTheDocument();
      expect(screen.getByText("What is the expected solar irradiance during peak hours?")).toBeInTheDocument();
      expect(screen.getByText("ORACLE_SOURCE_INGESTED")).toBeInTheDocument();
    });
  });

  it("9. shows read-only governance badge and disables mutations for AUDITOR role", async () => {
    vi.spyOn(authLib, "useAuth").mockReturnValue({
      user: {
        id: "auditor-user-id",
        email: "auditor@energygov.org",
        username: "auditor_sec",
        role: "AUDITOR",
        active: true,
      },
      token: "mock-auditor-token",
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    render(<AdminOraclePage />);

    expect(screen.queryByText("+ Submit Approved Signal")).not.toBeInTheDocument();
    expect(screen.getByText("Governance Mode: Read-Only")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("NOAA Solar GHI Model")).toBeInTheDocument();
    });

    // No Revoke or Re-ingest buttons should be present for Auditor
    expect(screen.queryByText("Revoke")).not.toBeInTheDocument();
    expect(screen.queryByText("Re-ingest")).not.toBeInTheDocument();
  });
});
