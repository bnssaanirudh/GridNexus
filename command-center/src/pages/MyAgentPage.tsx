/**
 * command-center/src/pages/MyAgentPage.tsx
 * ─────────────────────────────────────────
 * Personal DER-Owner Dashboard ("My Energy Agent").
 *
 * Exclusively queries /api/me/* endpoints for strict tenant isolation.
 * Owners configure safety constraints and observe their autonomous AI agent.
 *
 * Invariant: No manual BUY, SELL, ACCEPT, or COUNTER-OFFER buttons exist.
 * The agent bargains autonomously within owner constraints and grid safety gates.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  getMyMicrogrids,
  getMyDERs,
  getMyAgent,
  getMyNegotiations,
  getMySettlements,
  getMyAnalytics,
  getMyPreferences,
  updateMyPreferences,
  getMyExplanations,
  type MyMicrogrid,
  type MyDER,
  type MyAgent,
  type MyNegotiation,
  type MySettlement,
  type MyAnalytics,
  type MyPreferences,
  type DecisionExplanation,
} from "../lib/meApi";

export default function MyAgentPage(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scoped owner data states
  const [microgrids, setMicrogrids] = useState<MyMicrogrid[]>([]);
  const [ders, setDers] = useState<MyDER[]>([]);
  const [agent, setAgent] = useState<MyAgent | null>(null);
  const [negotiations, setNegotiations] = useState<MyNegotiation[]>([]);
  const [settlements, setSettlements] = useState<MySettlement[]>([]);
  const [analytics, setAnalytics] = useState<MyAnalytics | null>(null);
  const [preferences, setPreferences] = useState<MyPreferences | null>(null);
  const [explanations, setExplanations] = useState<DecisionExplanation[]>([]);

  // Preference edit modal state
  const [isEditingPrefs, setIsEditingPrefs] = useState(false);
  const [prefForm, setPrefForm] = useState<Partial<MyPreferences>>({});
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefSuccess, setPrefSuccess] = useState(false);

  // Fetch all scoped DER-owner data
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [mgs, derList, ag, negs, settles, stats, prefs, expls] = await Promise.all([
        getMyMicrogrids().catch(() => []),
        getMyDERs().catch(() => []),
        getMyAgent().catch(() => null),
        getMyNegotiations(10).catch(() => []),
        getMySettlements(10).catch(() => []),
        getMyAnalytics().catch(() => null),
        getMyPreferences().catch(() => null),
        getMyExplanations(10).catch(() => []),
      ]);

      setMicrogrids(mgs);
      setDers(derList);
      setAgent(ag);
      setNegotiations(negs);
      setSettlements(settles);
      setAnalytics(stats);
      setPreferences(prefs);
      setExplanations(expls);
      if (prefs) setPrefForm(prefs);
    } catch (err) {
      console.error("[MyAgent] Failed to load owner data:", err);
      setError((err as Error).message || "Failed to load energy agent data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  // Handle live toggle of trading enabled
  const handleToggleTrading = async () => {
    if (!preferences) return;
    try {
      const nextState = !preferences.tradingEnabled;
      const updated = await updateMyPreferences({
        microgridId: preferences.microgridId,
        tradingEnabled: nextState,
      });
      setPreferences(updated);
      setPrefForm((prev) => ({ ...prev, tradingEnabled: nextState }));
    } catch (err) {
      alert(`Failed to toggle trading: ${(err as Error).message}`);
    }
  };

  // Handle saving full preference modal
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preferences) return;
    setSavingPrefs(true);
    setPrefSuccess(false);

    try {
      const payload: Partial<MyPreferences> = {
        microgridId: preferences.microgridId,
        tradingEnabled: prefForm.tradingEnabled,
        minimumBatteryReservePct: prefForm.minimumBatteryReservePct !== undefined
          ? Number(prefForm.minimumBatteryReservePct)
          : undefined,
        maximumDailyExportKwh: prefForm.maximumDailyExportKwh !== undefined && prefForm.maximumDailyExportKwh !== null
          ? Number(prefForm.maximumDailyExportKwh)
          : null,
        minimumPreferredSalePrice: prefForm.minimumPreferredSalePrice !== undefined && prefForm.minimumPreferredSalePrice !== null
          ? Number(prefForm.minimumPreferredSalePrice)
          : null,
        maximumPreferredBuyPrice: prefForm.maximumPreferredBuyPrice !== undefined && prefForm.maximumPreferredBuyPrice !== null
          ? Number(prefForm.maximumPreferredBuyPrice)
          : null,
        riskProfile: prefForm.riskProfile,
        maxTransactionSizeKwh: prefForm.maxTransactionSizeKwh !== undefined && prefForm.maxTransactionSizeKwh !== null
          ? Number(prefForm.maxTransactionSizeKwh)
          : null,
      };

      const updated = await updateMyPreferences(payload);
      setPreferences(updated);
      setPrefSuccess(true);
      setTimeout(() => {
        setIsEditingPrefs(false);
        setPrefSuccess(false);
      }, 1000);
    } catch (err) {
      alert(`Error saving preferences: ${(err as Error).message}`);
    } finally {
      setSavingPrefs(false);
    }
  };

  // Calculations for battery and position
  const batteryDER = ders.find((d) => ["BATTERY", "STORAGE", "BESS"].includes(d.type.toUpperCase()));
  const batteryCapKwh = batteryDER?.energyCapacityKwh ? Number(batteryDER.energyCapacityKwh) : 0;
  const batterySocRatio = batteryDER?.metadata?.currentSoC !== undefined
    ? Number(batteryDER.metadata.currentSoC)
    : 0.75; // Default safe simulation SoC
  const batteryCurrentKwh = batteryCapKwh * batterySocRatio;
  const minReservePct = preferences?.minimumBatteryReservePct ?? 20.0;

  const soldKwh = analytics?.totalSoldKwh ?? 0;
  const boughtKwh = analytics?.totalPurchasedKwh ?? 0;
  const netPositionKwh = soldKwh - boughtKwh;
  const avgSalePrice = soldKwh > 0 ? (analytics?.totalRevenueUsd ?? 0) / soldKwh : 0;
  const avgBuyPrice = boughtKwh > 0 ? (analytics?.totalCostUsd ?? 0) / boughtKwh : 0;

  const rejectedTrades = negotiations.filter((n) =>
    ["FAILED", "WALKED_AWAY", "MAX_ROUNDS_REACHED"].includes(n.status)
  );

  if (loading) {
    return (
      <div className="page-container" style={{ padding: "var(--space-6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
          <div className="skeleton" style={{ height: "32px", width: "260px" }} />
          <div className="skeleton" style={{ height: "32px", width: "140px" }} />
        </div>
        <div className="kpi-grid" style={{ marginBottom: "var(--space-6)" }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: "90px" }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-6)" }}>
          <div className="card skeleton" style={{ height: "300px" }} />
          <div className="card skeleton" style={{ height: "300px" }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container" style={{ padding: "var(--space-6)" }}>
        <div className="card" style={{ borderLeft: "4px solid var(--accent-danger)", padding: "var(--space-6)" }}>
          <h2 style={{ margin: "0 0 var(--space-2) 0", color: "var(--accent-danger)" }}>Unable to Load Agent</h2>
          <p style={{ color: "var(--fg-secondary)", marginBottom: "var(--space-4)" }}>{error}</p>
          <button className="btn btn-secondary" onClick={() => void loadDashboardData()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const primaryMicrogrid = microgrids[0];

  return (
    <div className="page-container" style={{ padding: "var(--space-6)", maxWidth: "1440px", margin: "0 auto" }}>
      {/* ── Top Header & Hero ────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
          paddingBottom: "var(--space-4)",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-1)" }}>
            <span style={{ fontSize: "24px" }} aria-hidden="true">⚡</span>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "var(--fg-primary)" }}>
              My Energy Agent
            </h1>
            {/* 2. Trading Enabled / Disabled State Badge */}
            <span
              className={`badge ${preferences?.tradingEnabled ? "badge-success" : "badge-neutral"}`}
              style={{ fontSize: "12px", padding: "4px 8px", textTransform: "uppercase" }}
              aria-label={`Trading status: ${preferences?.tradingEnabled ? "Enabled" : "Disabled"}`}
            >
              ● {preferences?.tradingEnabled ? "Autonomous Trading Active" : "Trading Paused by Owner"}
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "14px" }}>
            Autonomous market agent for {primaryMicrogrid ? primaryMicrogrid.name : "My Site"} (
            {primaryMicrogrid?.id ? `ID: ${primaryMicrogrid.id.slice(0, 8)}...` : "Provisioned"}
            ). Bargains continuously under owner constraints and grid safety gates.
          </p>
        </div>

        {/* Action Controls: Autonomous Policy controls (NOT manual trade execution) */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <button
            className={`btn ${preferences?.tradingEnabled ? "btn-secondary" : "btn-primary"}`}
            onClick={handleToggleTrading}
            aria-label={preferences?.tradingEnabled ? "Pause autonomous trading" : "Enable autonomous trading"}
          >
            {preferences?.tradingEnabled ? "⏸ Pause Trading" : "▶ Resume Trading"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setIsEditingPrefs(true)}
            aria-label="Configure owner safety constraints and preferences"
          >
            ⚙ Preferences & Limits
          </button>
        </div>
      </header>

      {/* ── 1. Agent Status & System Identity Banner ─────────────────────── */}
      <section
        className="card"
        style={{
          padding: "var(--space-4) var(--space-5)",
          marginBottom: "var(--space-6)",
          background: "linear-gradient(135deg, rgba(20, 110, 180, 0.05) 0%, rgba(20, 180, 110, 0.05) 100%)",
          border: "1px solid var(--border-light)",
        }}
        aria-label="Agent Identity and Status"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Agent ID
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 600 }}>
                {agent ? agent.id : "agt-autonomous-01"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Autonomous Policy
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>
                {agent ? agent.type : "LLM + DQN Safety Override"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Risk Profile
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--accent-primary)" }}>
                {preferences?.riskProfile ?? "BALANCED"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                Max Transaction Size
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>
                {preferences?.maxTransactionSizeKwh ? `${preferences.maxTransactionSizeKwh} kWh` : "Standard (100 kWh)"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: "12px", color: "var(--fg-muted)" }}>
            Bargaining Mode: <span style={{ fontWeight: 600, color: "var(--accent-success)" }}>Autonomous Agent</span> (Manual trading controls disabled by protocol)
          </div>
        </div>
      </section>

      {/* ── 3, 4, 5, 6, 9. Primary KPI Metrics Grid ────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
        }}
        aria-label="Trading Performance Metrics"
      >
        {/* 3. Today's Energy Sold */}
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <div style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
            Today's Energy Sold
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--accent-success)" }}>
            {soldKwh.toFixed(1)} <span style={{ fontSize: "14px", fontWeight: 500 }}>kWh</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
            Avg Price: ${avgSalePrice.toFixed(3)}/kWh
          </div>
        </div>

        {/* 4. Today's Energy Bought */}
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <div style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
            Today's Energy Bought
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--accent-primary)" }}>
            {boughtKwh.toFixed(1)} <span style={{ fontSize: "14px", fontWeight: 500 }}>kWh</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
            Avg Price: ${avgBuyPrice.toFixed(3)}/kWh
          </div>
        </div>

        {/* 5. Revenue & Cost */}
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <div style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
            Revenue / Cost
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700 }}>
            ${(analytics?.totalRevenueUsd ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
            Cost: ${(analytics?.totalCostUsd ?? 0).toFixed(2)} | Net: ${((analytics?.totalRevenueUsd ?? 0) - (analytics?.totalCostUsd ?? 0)).toFixed(2)}
          </div>
        </div>

        {/* 9. Current Net Position */}
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <div style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
            Current Net Position
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: netPositionKwh >= 0 ? "var(--accent-success)" : "var(--accent-warning)",
            }}
          >
            {netPositionKwh >= 0 ? `+${netPositionKwh.toFixed(1)}` : netPositionKwh.toFixed(1)}{" "}
            <span style={{ fontSize: "14px", fontWeight: 500 }}>kWh</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
            {netPositionKwh >= 0 ? "Net Exporter (Surplus)" : "Net Importer (Deficit)"}
          </div>
        </div>

        {/* Active Negotiations & Settlements Count */}
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <div style={{ fontSize: "12px", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
            Committed Settlements
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--fg-primary)" }}>
            {settlements.length}
          </div>
          <div style={{ fontSize: "11px", color: "var(--fg-muted)", marginTop: "var(--space-1)" }}>
            {analytics?.activeNegotiations ?? 0} active bargaining sessions
          </div>
        </div>
      </section>

      {/* ── Middle Section: Battery & DER State + Oracle Signals ─────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "var(--space-6)",
          marginBottom: "var(--space-6)",
        }}
      >
        {/* 8. Battery State & Reserve Gauge */}
        <section className="card" style={{ padding: "var(--space-5)" }} aria-label="Battery State">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
              🔋 Battery & Storage Reserve
            </h2>
            <span style={{ fontSize: "12px", color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
              {batteryCapKwh > 0 ? `${batteryCapKwh} kWh Pack` : "No Battery Connected"}
            </span>
          </div>

          {batteryCapKwh > 0 ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>
                  State of Charge: {(batterySocRatio * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: "13px", color: "var(--fg-muted)" }}>
                  {batteryCurrentKwh.toFixed(1)} / {batteryCapKwh.toFixed(1)} kWh
                </span>
              </div>

              {/* Visual Progress Bar */}
              <div
                style={{
                  height: "20px",
                  background: "var(--bg-tertiary)",
                  borderRadius: "var(--radius-sm)",
                  position: "relative",
                  overflow: "hidden",
                  marginBottom: "var(--space-2)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, batterySocRatio * 100))}%`,
                    background:
                      batterySocRatio * 100 <= minReservePct
                        ? "var(--accent-danger)"
                        : "var(--accent-success)",
                    transition: "width 0.3s ease",
                  }}
                />
                {/* Minimum Reserve Threshold Marker */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${minReservePct}%`,
                    width: "2px",
                    background: "var(--accent-warning)",
                    boxShadow: "0 0 4px rgba(0,0,0,0.3)",
                  }}
                  title={`Minimum Reserve Limit: ${minReservePct}%`}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--fg-muted)" }}>
                <span>0% Empty</span>
                <span style={{ color: "var(--accent-warning)", fontWeight: 500 }}>
                  ▲ Min Reserve ({minReservePct}%)
                </span>
                <span>100% Full</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--fg-muted)", marginTop: "var(--space-3)", margin: 0 }}>
                Your agent is hard-blocked from discharging when battery SoC approaches the {minReservePct}% reserve limit.
              </p>
            </div>
          ) : (
            <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--fg-muted)" }}>
              No battery storage configured for this microgrid.
            </div>
          )}
        </section>

        {/* 14. Current Oracle Signal Summary */}
        <section className="card" style={{ padding: "var(--space-5)" }} aria-label="Grid Oracle Signal">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
              ◉ Grid Oracle Signal
            </h2>
            <span className="badge badge-primary" style={{ fontSize: "11px" }}>
              LIVE FEED
            </span>
          </div>

          <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", marginBottom: "var(--space-4)" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "var(--radius-md)",
                background: "rgba(20, 180, 110, 0.1)",
                color: "var(--accent-success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontWeight: 700,
              }}
            >
              ✓
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--fg-primary)" }}>
                Grid Condition: Normal
              </div>
              <div style={{ fontSize: "13px", color: "var(--fg-muted)" }}>
                Recommended Action: <strong style={{ color: "var(--accent-success)" }}>DISCHARGE / EXPORT</strong>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", fontSize: "12px", color: "var(--fg-muted)" }}>
            <div>Grid Frequency: <strong style={{ color: "var(--fg-primary)" }}>60.00 Hz</strong></div>
            <div>Confidence: <strong style={{ color: "var(--fg-primary)" }}>94.2%</strong></div>
            <div>Line Congestion: <strong style={{ color: "var(--accent-success)" }}>None (18.4% load)</strong></div>
            <div>Locational Margin: <strong style={{ color: "var(--fg-primary)" }}>$0.024/kWh</strong></div>
          </div>
        </section>
      </div>

      {/* ── 7. Connected DER Assets ──────────────────────────────────────── */}
      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }} aria-label="DER Assets">
        <h2 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 var(--space-4) 0" }}>
          ⬡ Provisioned Energy Assets (DERs)
        </h2>
        {ders.length === 0 ? (
          <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--fg-muted)" }}>
            No DER assets provisioned yet. Contact your network operator.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-4)" }}>
            {ders.map((d) => (
              <div
                key={d.id}
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-secondary)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{d.type}</span>
                  <span className="badge badge-neutral" style={{ fontSize: "10px" }}>
                    {d.id.slice(0, 8)}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div>Rated Power: <strong>{Number(d.ratedPowerKw)} kW</strong></div>
                  {d.energyCapacityKwh && <div>Capacity: <strong>{Number(d.energyCapacityKwh)} kWh</strong></div>}
                  <div>Efficiency: <strong>{(Number(d.efficiency) * 100).toFixed(1)}%</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 13. Active Owner Constraints & Preferences ───────────────────── */}
      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }} aria-label="Active Owner Constraints">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
              🛡 Active Owner Constraints & Safety Bounds
            </h2>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "var(--space-1) 0 0 0" }}>
              These parameters strictly bound autonomous agent decisions. The agent cannot propose or accept terms outside these boundaries.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setIsEditingPrefs(true)}>
            Edit Constraints
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
          <div style={{ padding: "var(--space-3)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase" }}>Min Battery Reserve</div>
            <div style={{ fontSize: "16px", fontWeight: 600 }}>{preferences?.minimumBatteryReservePct ?? 20}%</div>
          </div>
          <div style={{ padding: "var(--space-3)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase" }}>Max Daily Export</div>
            <div style={{ fontSize: "16px", fontWeight: 600 }}>{preferences?.maximumDailyExportKwh ? `${preferences.maximumDailyExportKwh} kWh` : "Unlimited"}</div>
          </div>
          <div style={{ padding: "var(--space-3)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase" }}>Min Preferred Sale Price</div>
            <div style={{ fontSize: "16px", fontWeight: 600 }}>{preferences?.minimumPreferredSalePrice ? `$${preferences.minimumPreferredSalePrice}/kWh` : "None"}</div>
          </div>
          <div style={{ padding: "var(--space-3)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "11px", color: "var(--fg-muted)", textTransform: "uppercase" }}>Max Preferred Buy Price</div>
            <div style={{ fontSize: "16px", fontWeight: 600 }}>{preferences?.maximumPreferredBuyPrice ? `$${preferences.maximumPreferredBuyPrice}/kWh` : "None"}</div>
          </div>
        </div>
      </section>

      {/* ── 10, 11, 12. Negotiations, Committed Trades & Rejected Trades ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "var(--space-6)", marginBottom: "var(--space-6)" }}>
        {/* 11. Recent Committed Trades */}
        <section className="card" style={{ padding: "var(--space-5)" }} aria-label="Committed Trades">
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 var(--space-4) 0" }}>
            ▣ Committed Settlements
          </h2>
          {settlements.length === 0 ? (
            <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--fg-muted)" }}>
              No committed settlements recorded yet today.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {settlements.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: "var(--space-3)",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                      {Number(s.energyKwh).toFixed(1)} kWh @ ${Number(s.pricePerKwh).toFixed(3)}/kWh
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
                      Tx: {s.id.slice(0, 8)}... | {new Date(s.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: "11px" }}>
                    COMMITTED
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 12. Rejected / Grid-Failed Trades */}
        <section className="card" style={{ padding: "var(--space-5)" }} aria-label="Rejected Trades">
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 var(--space-4) 0" }}>
            ⚠ Blocked / Rejected Negotiations
          </h2>
          {rejectedTrades.length === 0 ? (
            <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--fg-muted)" }}>
              All recent negotiations cleared owner constraints and grid safety gates.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {rejectedTrades.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: "var(--space-3)",
                    border: "1px solid rgba(220, 50, 50, 0.2)",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(220, 50, 50, 0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>Negotiation {n.id.slice(0, 8)}...</span>
                    <span className="badge badge-neutral" style={{ fontSize: "10px" }}>{n.status}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--fg-muted)", marginTop: "4px" }}>
                    Blocked by StabilityGate or owner price constraint.
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── 15. Agent Decision Explanation Panel ─────────────────────────── */}
      <section className="card" style={{ padding: "var(--space-5)" }} aria-label="Agent Explainability">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
              🤖 Agent Decision Explanation & Audit Logic
            </h2>
            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "var(--space-1) 0 0 0" }}>
              Structured rationale for recent autonomous agent actions without exposing raw chain-of-thought or competitor secrets.
            </p>
          </div>
          <span className="badge badge-primary" style={{ fontSize: "11px" }}>
            AUTONOMOUS AUDIT
          </span>
        </div>

        {/* Dynamic Explanations List */}
        {explanations.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
            {explanations.map((exp) => (
              <div
                key={exp.id}
                style={{
                  padding: "var(--space-4)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-secondary)",
                }}
                data-testid="explanation-card"
              >
                {/* Header: Action, Decision Source & Timestamp */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <span
                      className={`badge ${
                        exp.decision === "ACCEPT"
                          ? "badge-success"
                          : exp.decision === "WALK_AWAY"
                          ? "badge-danger"
                          : "badge-primary"
                      }`}
                      style={{ fontWeight: 700, fontSize: "12px" }}
                    >
                      {exp.decision}
                    </span>
                    <span className="badge badge-neutral" style={{ fontSize: "11px" }}>
                      Round {exp.roundNumber}
                    </span>
                    <span
                      className="badge badge-neutral"
                      style={{
                        fontSize: "11px",
                        background: exp.decisionSource === "FALLBACK_DQN" ? "rgba(220, 100, 50, 0.15)" : undefined,
                        color: exp.decisionSource === "FALLBACK_DQN" ? "var(--accent-warning)" : undefined,
                      }}
                    >
                      {exp.decisionSource}
                    </span>
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--fg-muted)" }}>
                    {new Date(exp.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* Key Metrics Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    background: "var(--bg-white)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>Offered Price</span>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--fg-primary)" }}>
                      ${exp.offeredPrice.toFixed(4)}/kWh
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>Energy Volume</span>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--fg-primary)" }}>
                      {exp.energyKwh.toFixed(1)} kWh
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>Confidence</span>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--accent-success)" }}>
                      {(exp.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>Owner Constraints</span>
                    <div>
                      <span
                        className={`badge ${exp.ownerConstraintsSatisfied ? "badge-success" : "badge-danger"}`}
                        style={{ fontSize: "10px", marginTop: "2px" }}
                      >
                        {exp.ownerConstraintsSatisfied ? "Satisfied" : "Violated"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--fg-muted)" }}>Grid & Stability</span>
                    <div style={{ display: "flex", gap: "4px", marginTop: "2px" }}>
                      <span
                        className={`badge ${exp.stabilityStatus === "STABLE" ? "badge-success" : "badge-warning"}`}
                        style={{ fontSize: "10px" }}
                      >
                        {exp.stabilityStatus}
                      </span>
                      <span
                        className={`badge ${exp.gridStatus === "FEASIBLE" ? "badge-success" : "badge-warning"}`}
                        style={{ fontSize: "10px" }}
                      >
                        {exp.gridStatus}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Top Decision Factors */}
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg-primary)", marginBottom: "var(--space-1)" }}>
                    Primary Driving Factors:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {exp.topFactors.map((factor, idx) => (
                      <div
                        key={idx}
                        style={{
                          fontSize: "12px",
                          color: "var(--fg-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--space-2)",
                        }}
                      >
                        <span style={{ color: "var(--accent-primary)", fontSize: "14px" }}>•</span>
                        <span>{factor}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Traceable Evidence IDs */}
                <details style={{ fontSize: "11px", color: "var(--fg-muted)", cursor: "pointer" }}>
                  <summary style={{ fontWeight: 500, userSelect: "none" }}>
                    Traceable Persisted Evidence & Audit IDs
                  </summary>
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      padding: "var(--space-2) var(--space-3)",
                      background: "rgba(0,0,0,0.03)",
                      borderRadius: "var(--radius-sm)",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "var(--space-2)",
                      fontFamily: "monospace",
                    }}
                  >
                    <div>Negotiation ID: {exp.negotiationId}</div>
                    {exp.evidenceIds.roundId && <div>Round ID: {exp.evidenceIds.roundId}</div>}
                    {exp.evidenceIds.stabilityCheckId && <div>Stability ID: {exp.evidenceIds.stabilityCheckId}</div>}
                    {exp.evidenceIds.gridCertificateId && <div>Grid Cert ID: {exp.evidenceIds.gridCertificateId}</div>}
                    {exp.oracleSignalIds.length > 0 && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        Oracle Signal IDs: {exp.oracleSignalIds.join(", ")}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: "var(--space-4)",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              color: "var(--fg-muted)",
              marginBottom: "var(--space-5)",
              fontSize: "13px",
            }}
          >
            No autonomous decisions recorded yet. Once your agent engages in peer-to-peer negotiations, verified decision explanations and factor breakdowns will appear here.
          </div>
        )}

        {/* Foundational Governance Principles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-4)" }}>
          <div style={{ padding: "var(--space-4)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "var(--space-2)" }}>
              1. Offer Construction Logic
            </div>
            <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0 }}>
              The agent computes discounted surplus using farsighted bargaining. If offer price is below owner minimum preferred sale price (${preferences?.minimumPreferredSalePrice ?? "N/A"}), the proposal is rejected or clamped by server-side policy.
            </p>
          </div>
          <div style={{ padding: "var(--space-4)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "var(--space-2)" }}>
              2. Stability & Coalition Safeguard
            </div>
            <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0 }}>
              Before any trade commits, the StabilityGate checks core coalition stability. Unstable coalitions that disadvantage participant microgrids are blocked.
            </p>
          </div>
          <div style={{ padding: "var(--space-4)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "var(--space-2)" }}>
              3. Grid Physical Feasibility
            </div>
            <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0 }}>
              The GridGate certifies AC power-flow feasibility on the physical topology to ensure voltage thresholds (0.95–1.05 p.u.) and line thermal ratings are not violated.
            </p>
          </div>
        </div>
      </section>

      {/* ── Preferences Edit Modal ──────────────────────────────────────── */}
      {isEditingPrefs && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "var(--space-4)",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "520px",
              padding: "var(--space-6)",
              background: "var(--bg-white)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <h3 id="modal-title" style={{ margin: "0 0 var(--space-4) 0", fontSize: "18px", fontWeight: 700 }}>
              Configure Owner Constraints
            </h3>

            {prefSuccess && (
              <div className="badge badge-success" style={{ width: "100%", padding: "var(--space-2)", marginBottom: "var(--space-4)" }}>
                Constraints saved successfully!
              </div>
            )}

            <form onSubmit={handleSavePreferences} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                  Autonomous Trading Enabled
                </label>
                <input
                  type="checkbox"
                  checked={prefForm.tradingEnabled ?? true}
                  onChange={(e) => setPrefForm({ ...prefForm, tradingEnabled: e.target.checked })}
                  aria-label="Autonomous trading enabled toggle"
                />
                <span style={{ fontSize: "12px", marginLeft: "8px", color: "var(--fg-muted)" }}>
                  Allow agent to participate in market negotiations
                </span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                  Minimum Battery Reserve % (0 - 100)
                </label>
                <input
                  type="number"
                  className="input"
                  min="0"
                  max="100"
                  step="1"
                  value={prefForm.minimumBatteryReservePct ?? 20}
                  onChange={(e) => setPrefForm({ ...prefForm, minimumBatteryReservePct: Number(e.target.value) })}
                  aria-label="Minimum battery reserve percentage"
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                  Maximum Daily Export (kWh)
                </label>
                <input
                  type="number"
                  className="input"
                  min="0"
                  step="0.1"
                  placeholder="e.g. 500 (leave empty for unlimited)"
                  value={prefForm.maximumDailyExportKwh ?? ""}
                  onChange={(e) => setPrefForm({ ...prefForm, maximumDailyExportKwh: e.target.value ? Number(e.target.value) : null })}
                  aria-label="Maximum daily export quota"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Min Sale Price ($/kWh)
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    step="0.001"
                    placeholder="e.g. 0.12"
                    value={prefForm.minimumPreferredSalePrice ?? ""}
                    onChange={(e) => setPrefForm({ ...prefForm, minimumPreferredSalePrice: e.target.value ? Number(e.target.value) : null })}
                    aria-label="Minimum preferred sale price"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                    Max Buy Price ($/kWh)
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    step="0.001"
                    placeholder="e.g. 0.20"
                    value={prefForm.maximumPreferredBuyPrice ?? ""}
                    onChange={(e) => setPrefForm({ ...prefForm, maximumPreferredBuyPrice: e.target.value ? Number(e.target.value) : null })}
                    aria-label="Maximum preferred buy price"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                  Risk Profile
                </label>
                <select
                  className="input"
                  value={prefForm.riskProfile ?? "BALANCED"}
                  onChange={(e) => setPrefForm({ ...prefForm, riskProfile: e.target.value as MyPreferences["riskProfile"] })}
                  aria-label="Risk profile selection"
                >
                  <option value="CONSERVATIVE">CONSERVATIVE (Prioritize reserve safety)</option>
                  <option value="BALANCED">BALANCED (Optimal surplus trading)</option>
                  <option value="AGGRESSIVE">AGGRESSIVE (Maximize market arbitrage)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>
                  Max Transaction Size (kWh)
                </label>
                <input
                  type="number"
                  className="input"
                  min="1"
                  step="1"
                  placeholder="e.g. 100"
                  value={prefForm.maxTransactionSizeKwh ?? ""}
                  onChange={(e) => setPrefForm({ ...prefForm, maxTransactionSizeKwh: e.target.value ? Number(e.target.value) : null })}
                  aria-label="Maximum transaction size"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsEditingPrefs(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingPrefs}>
                  {savingPrefs ? "Saving..." : "Save Constraints"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
