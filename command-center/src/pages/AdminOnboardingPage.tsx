/**
 * command-center/src/pages/AdminOnboardingPage.tsx
 * ──────────────────────────────────────────────────
 * Admin DER Onboarding Console (Phase 10 / Prompt 10.1).
 *
 * Provides governance oversight for reviewing, verifying, approving,
 * rejecting, and suspending DER owner onboarding applications.
 *
 * Strict Invariants:
 * - Requires ADMIN or GRID_OPERATOR role for mutations.
 * - Confirmation required for destructive actions (suspension, rejection).
 * - NO manual trading controls.
 * - Inspects only verified private technical telemetry necessary for grid interconnection.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../lib/auth";
import {
  listOnboardingApplications,
  getOnboardingApplication,
  approveOnboarding,
  rejectOnboarding,
  suspendOnboarding,
  triggerProvisioning,
  type OnboardingApplication,
} from "../lib/adminOnboardingApi";

export default function AdminOnboardingPage(): React.ReactElement {
  const { user } = useAuth();
  const isAdminOrOperator = user?.role === "ADMIN" || user?.role === "GRID_OPERATOR";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Applications list & filters
  const [applications, setApplications] = useState<OnboardingApplication[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Selected application inspection modal / drawer
  const [selectedApp, setSelectedApp] = useState<OnboardingApplication | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action dialogs
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | "SUSPEND" | "PROVISION" | null>(null);
  const [actionReason, setActionReason] = useState<string>("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const filter = statusFilter === "ALL" ? undefined : statusFilter;
      const data = await listOnboardingApplications(filter, 1, 100);
      setApplications(data);
    } catch (err: unknown) {
      console.error("[AdminOnboarding] Error fetching applications:", err);
      setError((err as Error).message || "Failed to load onboarding applications.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  // Inspect application details
  const handleInspect = async (id: string) => {
    try {
      setDetailLoading(true);
      const app = await getOnboardingApplication(id);
      setSelectedApp(app);
    } catch (err: unknown) {
      alert(`Failed to load details: ${(err as Error).message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  // Execute review action
  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !actionType) return;

    setActionSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (actionType === "APPROVE") {
        await approveOnboarding(selectedApp.id, actionReason || "Administrative approval");
        setSuccessMsg(`Application for ${selectedApp.siteName || selectedApp.id} approved.`);
      } else if (actionType === "REJECT") {
        if (!actionReason.trim()) {
          throw new Error("A rejection reason is mandatory.");
        }
        await rejectOnboarding(selectedApp.id, actionReason);
        setSuccessMsg(`Application for ${selectedApp.siteName || selectedApp.id} rejected.`);
      } else if (actionType === "SUSPEND") {
        if (!actionReason.trim()) {
          throw new Error("A suspension reason is mandatory.");
        }
        await suspendOnboarding(selectedApp.id, actionReason);
        setSuccessMsg(`Asset ${selectedApp.siteName || selectedApp.id} has been suspended.`);
      } else if (actionType === "PROVISION") {
        await triggerProvisioning(selectedApp.id);
        setSuccessMsg(`Microgrid, DER, and Agent provisioned for ${selectedApp.siteName || selectedApp.id}.`);
      }

      setActionType(null);
      setActionReason("");
      // Refresh current inspect details and list
      await handleInspect(selectedApp.id);
      await fetchApplications();
    } catch (err: unknown) {
      setError((err as Error).message || "Action failed.");
    } finally {
      setActionSubmitting(false);
    }
  };

  // Filter applications by search query
  const filteredApps = applications.filter((app) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (app.siteName && app.siteName.toLowerCase().includes(query)) ||
      (app.location && app.location.toLowerCase().includes(query)) ||
      (app.user?.email && app.user.email.toLowerCase().includes(query)) ||
      (app.user?.username && app.user.username.toLowerCase().includes(query)) ||
      (app.derType && app.derType.toLowerCase().includes(query)) ||
      app.id.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
      case "MICROGRID_PROVISIONED":
      case "AGENT_PROVISIONED":
        return <span className="badge badge-success">{status}</span>;
      case "APPROVED":
        return <span className="badge badge-primary">APPROVED</span>;
      case "PENDING_VERIFICATION":
        return <span className="badge badge-warning">PENDING VERIFICATION</span>;
      case "REJECTED":
        return <span className="badge badge-danger">REJECTED</span>;
      case "SUSPENDED":
        return (
          <span className="badge badge-danger" style={{ background: "rgba(220, 38, 38, 0.2)" }}>
            SUSPENDED
          </span>
        );
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "var(--space-6)",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "var(--fg-primary)" }}>
            🛡 Admin DER Onboarding Console
          </h1>
          <p style={{ margin: "var(--space-1) 0 0 0", color: "var(--fg-muted)", fontSize: "14px" }}>
            Review, verify, approve, and provision distributed energy resource owners into the grid.
          </p>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <span className="badge badge-neutral" style={{ fontSize: "12px" }}>
            Role: <strong>{user?.role || "VIEWER"}</strong>
          </span>
          <button className="btn btn-secondary btn-sm" onClick={fetchApplications} disabled={loading}>
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* ── Alerts & Warnings ────────────────────────────────────────────── */}
      {!isAdminOrOperator && (
        <div
          className="badge badge-warning"
          style={{
            width: "100%",
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
            display: "block",
            textAlign: "left",
          }}
        >
          ℹ <strong>Read-Only Governance Access:</strong> You are logged in as {user?.role || "VIEWER"}. Approvals, rejections, suspensions, and provisioning require ADMIN or GRID_OPERATOR privileges.
        </div>
      )}

      {error && (
        <div
          className="badge badge-danger"
          style={{
            width: "100%",
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
            display: "block",
            textAlign: "left",
          }}
        >
          ✕ {error}
        </div>
      )}

      {successMsg && (
        <div
          className="badge badge-success"
          style={{
            width: "100%",
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
            display: "block",
            textAlign: "left",
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* ── Filter Controls ──────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: "var(--space-4)",
          marginBottom: "var(--space-5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {["ALL", "PENDING_VERIFICATION", "APPROVED", "ACTIVE", "REJECTED", "SUSPENDED"].map((st) => (
            <button
              key={st}
              className={`btn btn-sm ${statusFilter === st ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStatusFilter(st)}
            >
              {st.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div style={{ minWidth: "260px" }}>
          <input
            type="search"
            placeholder="Search site, owner, email, DER type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--border-medium)",
              borderRadius: "var(--radius-sm)",
              fontSize: "13px",
            }}
            aria-label="Filter applications"
          />
        </div>
      </div>

      {/* ── Applications Table ───────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "var(--space-6)" }}>
        <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--border-light)" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
            Applications ({filteredApps.length})
          </h2>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-light)", textAlign: "left" }}>
                <th style={{ padding: "var(--space-3) var(--space-4)" }}>Site / Facility</th>
                <th style={{ padding: "var(--space-3) var(--space-4)" }}>Owner Account</th>
                <th style={{ padding: "var(--space-3) var(--space-4)" }}>DER Type</th>
                <th style={{ padding: "var(--space-3) var(--space-4)" }}>Status</th>
                <th style={{ padding: "var(--space-3) var(--space-4)" }}>Submitted</th>
                <th style={{ padding: "var(--space-3) var(--space-4)", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--fg-muted)" }}>
                    Loading onboarding applications...
                  </td>
                </tr>
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--fg-muted)" }}>
                    No onboarding applications match current filter.
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr
                    key={app.id}
                    style={{
                      borderBottom: "1px solid var(--border-light)",
                      background: selectedApp?.id === app.id ? "rgba(30, 90, 200, 0.04)" : undefined,
                    }}
                  >
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                      <div style={{ fontWeight: 600, color: "var(--fg-primary)" }}>
                        {app.siteName || "Unnamed Site"}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--fg-muted)" }}>
                        {app.location || "No location specified"} • ID: {app.id.slice(0, 8)}
                      </div>
                    </td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                      <div style={{ fontWeight: 500 }}>{app.user?.username || "—"}</div>
                      <div style={{ fontSize: "11px", color: "var(--fg-muted)" }}>{app.user?.email || "—"}</div>
                    </td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                      <span className="badge badge-neutral">{app.derType || "UNKNOWN"}</span>
                    </td>
                    <td style={{ padding: "var(--space-3) var(--space-4)" }}>
                      {getStatusBadge(app.status)}
                    </td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", color: "var(--fg-muted)", fontSize: "12px" }}>
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "var(--space-3) var(--space-4)", textAlign: "right" }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleInspect(app.id)}
                        aria-label={`Inspect application ${app.siteName || app.id}`}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Inspection Details Drawer / Modal ────────────────────────────── */}
      {selectedApp && (
        <div className="card" style={{ padding: "var(--space-6)", marginBottom: "var(--space-6)" }} aria-label="Inspection Detail">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-4)" }}>
            <div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                  Application Details: {selectedApp.siteName || selectedApp.id}
                </h3>
                {getStatusBadge(selectedApp.status)}
              </div>
              <p style={{ margin: "var(--space-1) 0 0 0", color: "var(--fg-muted)", fontSize: "13px" }}>
                Submitted by {selectedApp.user?.username} ({selectedApp.user?.email}) on {new Date(selectedApp.createdAt).toLocaleString()}
              </p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedApp(null)}>
              Close
            </button>
          </div>

          {detailLoading ? (
            <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--fg-muted)" }}>
              Decrypting verified operational telemetry...
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--space-5)" }}>
              {/* Public Metadata */}
              <div style={{ padding: "var(--space-4)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                <h4 style={{ margin: "0 0 var(--space-3) 0", fontSize: "14px", fontWeight: 600 }}>
                  Public Site & Asset Specification
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "13px" }}>
                  <div>Facility Name: <strong>{selectedApp.siteName || "N/A"}</strong></div>
                  <div>Grid Interconnection Location: <strong>{selectedApp.location || "N/A"}</strong></div>
                  <div>DER Technology: <strong>{selectedApp.derType || "N/A"}</strong></div>
                  <div>Application UUID: <code style={{ fontSize: "11px" }}>{selectedApp.id}</code></div>
                </div>
              </div>

              {/* Private Operational Telemetry (Decrypted for Admin) */}
              <div
                style={{
                  padding: "var(--space-4)",
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px dashed var(--border-medium)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
                  <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
                    Verified Operational Telemetry (Encrypted Storage)
                  </h4>
                  <span className="badge badge-primary" style={{ fontSize: "10px" }}>AES-256-GCM</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "13px" }}>
                  <div>
                    Nameplate Generation Capacity:{" "}
                    <strong>{selectedApp.capacityKw !== undefined && selectedApp.capacityKw !== null ? `${selectedApp.capacityKw} kW` : "Protected / Unprovided"}</strong>
                  </div>
                  <div>
                    Battery Storage Capacity:{" "}
                    <strong>{selectedApp.batteryCapacityKwh !== undefined && selectedApp.batteryCapacityKwh !== null ? `${selectedApp.batteryCapacityKwh} kWh` : "No Storage"}</strong>
                  </div>
                  <div>
                    Levelized Generation Cost:{" "}
                    <strong>{selectedApp.generationCost !== undefined && selectedApp.generationCost !== null ? `$${selectedApp.generationCost}/kWh` : "Confidential"}</strong>
                  </div>
                </div>
              </div>

              {/* Provisioning Status & Results */}
              <div style={{ padding: "var(--space-4)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                <h4 style={{ margin: "0 0 var(--space-3) 0", fontSize: "14px", fontWeight: 600 }}>
                  Provisioned Infrastructure Artifacts
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "13px" }}>
                  <div>
                    Microgrid ID:{" "}
                    {selectedApp.microgridId ? (
                      <code style={{ fontSize: "11px" }}>{selectedApp.microgridId}</code>
                    ) : (
                      <span style={{ color: "var(--fg-muted)" }}>Not provisioned</span>
                    )}
                  </div>
                  <div>
                    DER Asset ID:{" "}
                    {selectedApp.derId ? (
                      <code style={{ fontSize: "11px" }}>{selectedApp.derId}</code>
                    ) : (
                      <span style={{ color: "var(--fg-muted)" }}>Not provisioned</span>
                    )}
                  </div>
                  <div>
                    AI Agent ID:{" "}
                    {selectedApp.agentId ? (
                      <code style={{ fontSize: "11px" }}>{selectedApp.agentId}</code>
                    ) : (
                      <span style={{ color: "var(--fg-muted)" }}>Not provisioned</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Audit Trail & Review Metadata */}
              <div style={{ padding: "var(--space-4)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                <h4 style={{ margin: "0 0 var(--space-3) 0", fontSize: "14px", fontWeight: 600 }}>
                  Audit Review Metadata
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", fontSize: "13px" }}>
                  <div>
                    Reviewed By:{" "}
                    <strong>{selectedApp.reviewedBy || "Pending Review"}</strong>
                  </div>
                  <div>
                    Reviewed At:{" "}
                    <strong>{selectedApp.reviewedAt ? new Date(selectedApp.reviewedAt).toLocaleString() : "—"}</strong>
                  </div>
                  <div>
                    Review Justification:{" "}
                    <span style={{ color: selectedApp.reason ? "var(--fg-primary)" : "var(--fg-muted)" }}>
                      {selectedApp.reason || "None recorded"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Button Bar */}
          {isAdminOrOperator && (
            <div
              style={{
                marginTop: "var(--space-6)",
                paddingTop: "var(--space-4)",
                borderTop: "1px solid var(--border-light)",
                display: "flex",
                gap: "var(--space-3)",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {selectedApp.status === "PENDING_VERIFICATION" && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setActionType("APPROVE");
                      setActionReason("Site and interconnection standards verified.");
                    }}
                  >
                    ✓ Approve Application
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      setActionType("REJECT");
                      setActionReason("");
                    }}
                  >
                    ✕ Reject Application
                  </button>
                </>
              )}

              {selectedApp.status === "APPROVED" && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setActionType("PROVISION");
                    setActionReason("Transactional asset & agent provisioning");
                  }}
                >
                  ⚡ Provision Microgrid, DER & Agent
                </button>
              )}

              {["APPROVED", "MICROGRID_PROVISIONED", "AGENT_PROVISIONED", "ACTIVE"].includes(selectedApp.status) && (
                <button
                  className="btn btn-danger"
                  style={{ background: "var(--accent-danger)", color: "#fff" }}
                  onClick={() => {
                    setActionType("SUSPEND");
                    setActionReason("");
                  }}
                >
                  ⊘ Suspend Grid Interconnection
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Confirmation / Reason Modal ──────────────────────────────────── */}
      {actionType && selectedApp && (
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
          aria-labelledby="action-modal-title"
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "500px",
              padding: "var(--space-6)",
              background: "var(--bg-white)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <h3 id="action-modal-title" style={{ margin: "0 0 var(--space-3) 0", fontSize: "18px", fontWeight: 700 }}>
              {actionType === "APPROVE" && "Approve Onboarding Application"}
              {actionType === "REJECT" && "Reject Onboarding Application"}
              {actionType === "SUSPEND" && "Confirm Asset Suspension"}
              {actionType === "PROVISION" && "Confirm Transactional Provisioning"}
            </h3>

            <p style={{ fontSize: "13px", color: "var(--fg-muted)", margin: "0 0 var(--space-4) 0" }}>
              {actionType === "SUSPEND"
                ? "WARNING: Suspension immediately revokes market access and disables autonomous agent negotiation for this DER owner."
                : actionType === "REJECT"
                ? "Rejection archives this application. A recorded justification is mandatory for audit compliance."
                : actionType === "PROVISION"
                ? "This will atomically provision a Microgrid, DER, AI Agent, and physical Bus interconnection mapping in a single database transaction."
                : "Approving certifies this facility meets grid code and safety regulations for autonomous market participation."}
            </p>

            <form onSubmit={handleExecuteAction}>
              {(actionType === "REJECT" || actionType === "SUSPEND" || actionType === "APPROVE") && (
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <label
                    htmlFor="action-reason-input"
                    style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "var(--space-1)" }}
                  >
                    Administrative Justification / Reason {actionType !== "APPROVE" && "*"}
                  </label>
                  <textarea
                    id="action-reason-input"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    required={actionType === "REJECT" || actionType === "SUSPEND"}
                    placeholder="Enter audit rationale for this decision..."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "var(--space-2) var(--space-3)",
                      border: "1px solid var(--border-medium)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "13px",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setActionType(null);
                    setActionReason("");
                  }}
                  disabled={actionSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${actionType === "REJECT" || actionType === "SUSPEND" ? "btn-danger" : "btn-primary"}`}
                  disabled={actionSubmitting}
                >
                  {actionSubmitting ? "Processing..." : `Confirm ${actionType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
