/**
 * command-center/src/pages/AdminOraclePage.tsx
 * ──────────────────────────────────────────────
 * Admin Oracle Source Management Console (Phase 10 / Prompt 10.2).
 *
 * Allows Admins & Grid Operators to:
 * - View existing Oracle sources with provenance, trust scores, versions, and validity intervals.
 * - Manually submit verified & approved Oracle documents/signals into the RAG pipeline.
 * - Revoke/disable outdated or invalid sources with audited confirmation.
 * - Trigger safe re-ingestion.
 * - Inspect retrieval context audits and the SHA-256 tamper-evident audit trail.
 * - Read-only governance mode for AUDITOR role.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../lib/auth";
import {
  listOracleSources,
  submitOracleSource,
  revokeOracleSource,
  reingestOracleSource,
  getOracleAudits,
  type OracleSource,
  type RetrievedAuditItem,
  type AuditLedgerEvent,
} from "../lib/adminOracleApi";

export default function AdminOraclePage(): React.ReactElement {
  const { user } = useAuth();
  const isAdminOrOperator = user?.role === "ADMIN" || user?.role === "GRID_OPERATOR";

  // Tab navigation
  const [activeTab, setActiveTab] = useState<"SOURCES" | "AUDITS">("SOURCES");

  // Loading & notification state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sources state & filters
  const [sources, setSources] = useState<OracleSource[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Audit trail state
  const [retrievedAudits, setRetrievedAudits] = useState<RetrievedAuditItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditLedgerEvent[]>([]);
  const [auditsLoading, setAuditsLoading] = useState(false);

  // Ingestion Modal State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    content: "",
    sourceType: "WEATHER",
    sourceName: "",
    publisher: "",
    sourceUri: "",
    trustScore: 0.95,
    validFrom: "",
    validUntil: "",
    observedAt: "",
    metadataJson: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Revocation Modal State
  const [revokingSource, setRevokingSource] = useState<OracleSource | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);

  // Expanded content IDs
  const [expandedContentIds, setExpandedContentIds] = useState<Set<string>>(new Set());

  // Fetch Sources
  const fetchSources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listOracleSources({
        status: statusFilter === "ALL" ? undefined : statusFilter.toLowerCase(),
        sourceType: typeFilter === "ALL" ? undefined : typeFilter,
      });
      setSources(res.sources || []);
    } catch (err: unknown) {
      console.error("[AdminOracle] Error fetching sources:", err);
      setError((err as Error).message || "Failed to load Oracle sources.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  // Fetch Audits
  const fetchAudits = useCallback(async () => {
    try {
      setAuditsLoading(true);
      const res = await getOracleAudits();
      setRetrievedAudits(res.retrievedAudits || []);
      setAuditEvents(res.auditEvents || []);
    } catch (err: unknown) {
      console.error("[AdminOracle] Error fetching audits:", err);
      setError((err as Error).message || "Failed to load Oracle audits.");
    } finally {
      setAuditsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "SOURCES") {
      void fetchSources();
    } else {
      void fetchAudits();
    }
  }, [activeTab, fetchSources, fetchAudits]);

  // Client-side search filtering
  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return sources;
    const q = searchQuery.toLowerCase();
    return sources.filter(
      (s) =>
        s.sourceName?.toLowerCase().includes(q) ||
        s.sourceType?.toLowerCase().includes(q) ||
        s.publisher?.toLowerCase().includes(q) ||
        s.content?.toLowerCase().includes(q) ||
        s.sourceUri?.toLowerCase().includes(q)
    );
  }, [sources, searchQuery]);

  // KPIs
  const totalCount = sources.length;
  const activeCount = sources.filter((s) => s.status === "ACTIVE").length;
  const revokedCount = sources.filter((s) => s.status === "REVOKED").length;
  const avgTrust =
    totalCount > 0
      ? (
          sources.reduce((acc, s) => acc + (s.trustScore ?? 1.0), 0) /
          totalCount
        ).toFixed(2)
      : "1.00";

  // Handle Submit New Source
  const handleSubmitSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrOperator) {
      alert("Only ADMIN and GRID_OPERATOR roles may submit Oracle signals.");
      return;
    }

    if (!submitForm.content.trim()) {
      alert("Content is required.");
      return;
    }
    if (!submitForm.sourceName.trim()) {
      alert("Source Name is required.");
      return;
    }
    if (!submitForm.publisher.trim()) {
      alert("Publisher is required.");
      return;
    }

    let parsedMeta: Record<string, unknown> | null = null;
    if (submitForm.metadataJson.trim()) {
      try {
        parsedMeta = JSON.parse(submitForm.metadataJson.trim()) as Record<string, unknown>;
      } catch {
        alert("Metadata must be valid JSON.");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await submitOracleSource({
        content: submitForm.content.trim(),
        sourceType: submitForm.sourceType,
        sourceName: submitForm.sourceName.trim(),
        publisher: submitForm.publisher.trim(),
        sourceUri: submitForm.sourceUri.trim() || null,
        trustScore: Number(submitForm.trustScore),
        validFrom: submitForm.validFrom ? new Date(submitForm.validFrom).toISOString() : null,
        validUntil: submitForm.validUntil ? new Date(submitForm.validUntil).toISOString() : null,
        observedAt: submitForm.observedAt ? new Date(submitForm.observedAt).toISOString() : null,
        metadata: parsedMeta,
      });

      setSuccessMsg(`Oracle source '${submitForm.sourceName}' ingested and audited successfully.`);
      setShowSubmitModal(false);
      setSubmitForm({
        content: "",
        sourceType: "WEATHER",
        sourceName: "",
        publisher: "",
        sourceUri: "",
        trustScore: 0.95,
        validFrom: "",
        validUntil: "",
        observedAt: "",
        metadataJson: "",
      });
      await fetchSources();
    } catch (err: unknown) {
      console.error("[AdminOracle] Ingestion failed:", err);
      setError((err as Error).message || "Failed to submit Oracle source.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Revoke Source
  const handleRevokeConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingSource) return;

    setIsRevoking(true);
    setError(null);
    try {
      await revokeOracleSource(revokingSource.id, revokeReason.trim() || "Administrative revocation");
      setSuccessMsg(`Oracle source '${revokingSource.sourceName || revokingSource.id}' revoked successfully.`);
      setRevokingSource(null);
      setRevokeReason("");
      await fetchSources();
    } catch (err: unknown) {
      console.error("[AdminOracle] Revocation failed:", err);
      setError((err as Error).message || "Failed to revoke Oracle source.");
    } finally {
      setIsRevoking(false);
    }
  };

  // Handle Re-ingest Source
  const handleReingest = async (source: OracleSource) => {
    if (!isAdminOrOperator) return;
    if (!window.confirm(`Re-ingest and re-activate '${source.sourceName || source.id}'?`)) return;

    setError(null);
    try {
      await reingestOracleSource(source.id);
      setSuccessMsg(`Source '${source.sourceName || source.id}' re-ingested successfully.`);
      await fetchSources();
    } catch (err: unknown) {
      console.error("[AdminOracle] Re-ingest failed:", err);
      setError((err as Error).message || "Failed to re-ingest Oracle source.");
    }
  };

  const toggleExpandContent = (id: string) => {
    setExpandedContentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6" style={{ padding: "var(--space-6)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-4)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ fontSize: "1.8rem" }}>⚛</span>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Oracle Source Management
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0 0", fontSize: "0.95rem" }}>
            Administer exogenous signals, RAG embeddings (384-d pgvector), provenance metadata, and tamper-evident audit trails.
          </p>
        </div>

        {/* Action Button */}
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          {isAdminOrOperator ? (
            <button
              onClick={() => setShowSubmitModal(true)}
              style={{
                background: "var(--color-primary-600, #2563eb)",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "var(--radius-md, 6px)",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>+</span> Submit Approved Signal
            </button>
          ) : (
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                background: "var(--surface-sunken, #1e293b)",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm, 4px)",
              }}
            >
              Governance Mode: Read-Only
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--color-danger, #ef4444)",
            color: "var(--color-danger, #ef4444)",
            padding: "12px 16px",
            borderRadius: "var(--radius-md, 6px)",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--color-success, #10b981)",
            color: "var(--color-success, #10b981)",
            padding: "12px 16px",
            borderRadius: "var(--radius-md, 6px)",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        <div
          style={{
            background: "var(--surface-elevated, #0f172a)",
            border: "1px solid var(--border-subtle, #1e293b)",
            borderRadius: "var(--radius-lg, 8px)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600 }}>
            Total Ingested Sources
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{totalCount}</div>
        </div>
        <div
          style={{
            background: "var(--surface-elevated, #0f172a)",
            border: "1px solid var(--border-subtle, #1e293b)",
            borderRadius: "var(--radius-lg, 8px)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600 }}>
            Active Signal Feeds
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "4px", color: "var(--color-success, #10b981)" }}>
            {activeCount}
          </div>
        </div>
        <div
          style={{
            background: "var(--surface-elevated, #0f172a)",
            border: "1px solid var(--border-subtle, #1e293b)",
            borderRadius: "var(--radius-lg, 8px)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600 }}>
            Revoked / Expired
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "4px", color: "var(--color-warning, #f59e0b)" }}>
            {revokedCount}
          </div>
        </div>
        <div
          style={{
            background: "var(--surface-elevated, #0f172a)",
            border: "1px solid var(--border-subtle, #1e293b)",
            borderRadius: "var(--radius-lg, 8px)",
            padding: "var(--space-4)",
          }}
        >
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600 }}>
            Mean Trust Score
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "4px", color: "var(--color-primary-400, #60a5fa)" }}>
            {(Number(avgTrust) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--border-subtle, #1e293b)", display: "flex", gap: "var(--space-6)" }}>
        <button
          onClick={() => setActiveTab("SOURCES")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "SOURCES" ? "2px solid var(--color-primary-500, #3b82f6)" : "2px solid transparent",
            color: activeTab === "SOURCES" ? "var(--color-primary-400, #60a5fa)" : "var(--text-muted)",
            padding: "8px 4px",
            fontWeight: 600,
            fontSize: "0.95rem",
            cursor: "pointer",
          }}
        >
          Oracle Documents & Sources ({totalCount})
        </button>
        <button
          onClick={() => setActiveTab("AUDITS")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: activeTab === "AUDITS" ? "2px solid var(--color-primary-500, #3b82f6)" : "2px solid transparent",
            color: activeTab === "AUDITS" ? "var(--color-primary-400, #60a5fa)" : "var(--text-muted)",
            padding: "8px 4px",
            fontWeight: 600,
            fontSize: "0.95rem",
            cursor: "pointer",
          }}
        >
          Retrieval Audits & Ledger
        </button>
      </div>

      {/* TAB 1: SOURCES */}
      {activeTab === "SOURCES" && (
        <div className="space-y-4">
          {/* Controls / Filter Bar */}
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              alignItems: "center",
              flexWrap: "wrap",
              background: "var(--surface-elevated, #0f172a)",
              padding: "12px 16px",
              borderRadius: "var(--radius-md, 6px)",
              border: "1px solid var(--border-subtle, #1e293b)",
            }}
          >
            {/* Search Input */}
            <div style={{ flex: 1, minWidth: "200px" }}>
              <input
                type="text"
                placeholder="Search by source name, publisher, content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--surface-sunken, #1e293b)",
                  border: "1px solid var(--border-subtle, #334155)",
                  color: "#fff",
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm, 4px)",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            {/* Status Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  background: "var(--surface-sunken, #1e293b)",
                  border: "1px solid var(--border-subtle, #334155)",
                  color: "#fff",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm, 4px)",
                  fontSize: "0.85rem",
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="REVOKED">Revoked Only</option>
              </select>
            </div>

            {/* Type Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  background: "var(--surface-sunken, #1e293b)",
                  border: "1px solid var(--border-subtle, #334155)",
                  color: "#fff",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm, 4px)",
                  fontSize: "0.85rem",
                }}
              >
                <option value="ALL">All Types</option>
                <option value="WEATHER">WEATHER</option>
                <option value="GRID_NOTICE">GRID_NOTICE</option>
                <option value="REGULATORY">REGULATORY</option>
                <option value="PRICE_FEED">PRICE_FEED</option>
                <option value="OPERATIONAL">OPERATIONAL</option>
              </select>
            </div>

            <button
              onClick={() => fetchSources()}
              style={{
                background: "var(--surface-sunken, #1e293b)",
                border: "1px solid var(--border-subtle, #334155)",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: "var(--radius-sm, 4px)",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              ↻ Refresh
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Loading Oracle sources...
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredSources.length === 0 && (
            <div
              style={{
                background: "var(--surface-elevated, #0f172a)",
                border: "1px dashed var(--border-subtle, #334155)",
                borderRadius: "var(--radius-lg, 8px)",
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>◉</div>
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>No Oracle Sources Found</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "4px" }}>
                {searchQuery || statusFilter !== "ALL" || typeFilter !== "ALL"
                  ? "Try resetting your search filters."
                  : "Submit an approved Oracle signal or verify that the automated connectors are running."}
              </div>
            </div>
          )}

          {/* Sources List / Cards */}
          {!loading && filteredSources.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {filteredSources.map((source) => {
                const isExpanded = expandedContentIds.has(source.id);
                const isRevoked = source.status === "REVOKED";

                return (
                  <div
                    key={source.id}
                    style={{
                      background: "var(--surface-elevated, #0f172a)",
                      border: `1px solid ${isRevoked ? "rgba(239, 68, 68, 0.3)" : "var(--border-subtle, #1e293b)"}`,
                      borderRadius: "var(--radius-lg, 8px)",
                      padding: "var(--space-4)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-3)",
                    }}
                  >
                    {/* Header Row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              background: isRevoked ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)",
                              color: isRevoked ? "#ef4444" : "#10b981",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "4px",
                              textTransform: "uppercase",
                            }}
                          >
                            {source.status}
                          </span>
                          <span
                            style={{
                              background: "rgba(96, 165, 250, 0.15)",
                              color: "#60a5fa",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            {source.sourceType}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                            {source.sourceName || "Unnamed Oracle Source"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
                          Publisher: <strong style={{ color: "#e2e8f0" }}>{source.publisher || "Unknown"}</strong>
                          {source.sourceUri && (
                            <>
                              {" "}• URI:{" "}
                              <a
                                href={source.sourceUri}
                                target="_blank"
                                rel="noreferrer noopener"
                                style={{ color: "#38bdf8", textDecoration: "none" }}
                              >
                                {source.sourceUri}
                              </a>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Top Right Badges & Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            background: "var(--surface-sunken, #1e293b)",
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "0.8rem",
                          }}
                        >
                          <span style={{ color: "var(--text-muted)" }}>Trust: </span>
                          <strong style={{ color: (source.trustScore ?? 1) >= 0.8 ? "#10b981" : "#f59e0b" }}>
                            {((source.trustScore ?? 1) * 100).toFixed(0)}%
                          </strong>
                        </div>

                        {/* Admin Action Buttons */}
                        {isAdminOrOperator && (
                          <>
                            {!isRevoked ? (
                              <button
                                onClick={() => setRevokingSource(source)}
                                style={{
                                  background: "rgba(239, 68, 68, 0.15)",
                                  color: "#ef4444",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  padding: "4px 10px",
                                  borderRadius: "4px",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Revoke
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReingest(source)}
                                style={{
                                  background: "rgba(16, 185, 129, 0.15)",
                                  color: "#10b981",
                                  border: "1px solid rgba(16, 185, 129, 0.3)",
                                  padding: "4px 10px",
                                  borderRadius: "4px",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Re-ingest
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Content Box */}
                    <div
                      style={{
                        background: "var(--surface-sunken, #1e293b)",
                        padding: "10px 14px",
                        borderRadius: "6px",
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                        color: "#cbd5e1",
                      }}
                    >
                      {isExpanded || source.content.length <= 240
                        ? source.content
                        : `${source.content.slice(0, 240)}... `}
                      {source.content.length > 240 && (
                        <button
                          onClick={() => toggleExpandContent(source.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#60a5fa",
                            fontSize: "0.85rem",
                            cursor: "pointer",
                            padding: 0,
                            marginLeft: "4px",
                            fontWeight: 600,
                          }}
                        >
                          {isExpanded ? "Show less" : "Read full text"}
                        </button>
                      )}
                    </div>

                    {/* Metadata Footer Details */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--space-4)",
                        fontSize: "0.78rem",
                        color: "var(--text-muted)",
                        borderTop: "1px solid var(--border-subtle, #1e293b)",
                        paddingTop: "8px",
                      }}
                    >
                      <div>
                        <span>Observed: </span>
                        <strong style={{ color: "#94a3b8" }}>
                          {source.observedAt ? new Date(source.observedAt).toLocaleString() : "N/A"}
                        </strong>
                      </div>
                      <div>
                        <span>Validity: </span>
                        <strong style={{ color: "#94a3b8" }}>
                          {source.validFrom ? new Date(source.validFrom).toLocaleDateString() : "Instant"} →{" "}
                          {source.validUntil ? new Date(source.validUntil).toLocaleDateString() : "Perpetual"}
                        </strong>
                      </div>
                      <div>
                        <span>Model: </span>
                        <strong style={{ color: "#94a3b8" }}>
                          {source.embeddingModel || "all-MiniLM-L6-v2"} ({source.embeddingDimension || 384}-d)
                        </strong>
                      </div>
                      <div>
                        <span>Connector: </span>
                        <strong style={{ color: "#94a3b8" }}>{source.connectorVersion || "auto-v1"}</strong>
                      </div>
                      {source.contentHash && (
                        <div style={{ marginLeft: "auto", fontFamily: "monospace" }}>
                          <span>SHA-256: </span>
                          <span title={source.contentHash}>{source.contentHash.slice(0, 12)}...</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDITS */}
      {activeTab === "AUDITS" && (
        <div className="space-y-6">
          {auditsLoading && (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Loading audit trails...
            </div>
          )}

          {!auditsLoading && (
            <>
              {/* Section 1: RAG Retrieval Audits */}
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "8px" }}>
                  RAG Cosine Retrieval Audits
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "12px" }}>
                  Records every query executed by autonomous agents against the pgvector embedding space.
                </p>

                {retrievedAudits.length === 0 ? (
                  <div
                    style={{
                      background: "var(--surface-elevated, #0f172a)",
                      padding: "24px",
                      textAlign: "center",
                      borderRadius: "6px",
                      color: "var(--text-muted)",
                      fontSize: "0.9rem",
                    }}
                  >
                    No RAG retrieval queries recorded yet.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        background: "var(--surface-elevated, #0f172a)",
                        borderRadius: "6px",
                        fontSize: "0.85rem",
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-subtle, #1e293b)", textAlign: "left" }}>
                          <th style={{ padding: "10px" }}>Timestamp</th>
                          <th style={{ padding: "10px" }}>Query</th>
                          <th style={{ padding: "10px" }}>Matched Documents</th>
                          <th style={{ padding: "10px" }}>Similarity / Distance</th>
                          <th style={{ padding: "10px" }}>Model</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retrievedAudits.map((item) => (
                          <tr key={item.id} style={{ borderBottom: "1px solid var(--border-subtle, #1e293b)" }}>
                            <td style={{ padding: "10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                              {new Date(item.timestamp).toLocaleString()}
                            </td>
                            <td style={{ padding: "10px", fontWeight: 500, color: "#e2e8f0" }}>
                              {item.query}
                            </td>
                            <td style={{ padding: "10px" }}>
                              <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#94a3b8" }}>
                                {item.documentIds?.length || 0} doc(s)
                              </span>
                            </td>
                            <td style={{ padding: "10px", color: "#10b981", fontWeight: 600 }}>
                              {item.similarityScore !== null ? item.similarityScore.toFixed(4) : "N/A"}
                            </td>
                            <td style={{ padding: "10px", color: "var(--text-muted)" }}>
                              {item.modelVersion || "1.1.0"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 2: Tamper-Evident Ledger Audit Events */}
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "8px" }}>
                  SHA-256 Tamper-Evident Audit Ledger (Oracle Mutations)
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "12px" }}>
                  Cryptographically chained records of every manual ingestion, revocation, and re-activation.
                </p>

                {auditEvents.length === 0 ? (
                  <div
                    style={{
                      background: "var(--surface-elevated, #0f172a)",
                      padding: "24px",
                      textAlign: "center",
                      borderRadius: "6px",
                      color: "var(--text-muted)",
                      fontSize: "0.9rem",
                    }}
                  >
                    No manual Oracle mutations recorded in the audit ledger.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        background: "var(--surface-elevated, #0f172a)",
                        borderRadius: "6px",
                        fontSize: "0.85rem",
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-subtle, #1e293b)", textAlign: "left" }}>
                          <th style={{ padding: "10px" }}>Timestamp</th>
                          <th style={{ padding: "10px" }}>Event Type</th>
                          <th style={{ padding: "10px" }}>Actor</th>
                          <th style={{ padding: "10px" }}>Details</th>
                          <th style={{ padding: "10px" }}>Ledger Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditEvents.map((evt) => (
                          <tr key={evt.id} style={{ borderBottom: "1px solid var(--border-subtle, #1e293b)" }}>
                            <td style={{ padding: "10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                              {new Date(evt.timestamp).toLocaleString()}
                            </td>
                            <td style={{ padding: "10px" }}>
                              <span
                                style={{
                                  background:
                                    evt.eventType === "ORACLE_SOURCE_REVOKED"
                                      ? "rgba(239, 68, 68, 0.2)"
                                      : "rgba(16, 185, 129, 0.2)",
                                  color: evt.eventType === "ORACLE_SOURCE_REVOKED" ? "#ef4444" : "#10b981",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                  fontSize: "0.78rem",
                                }}
                              >
                                {evt.eventType}
                              </span>
                            </td>
                            <td style={{ padding: "10px", color: "#94a3b8" }}>{evt.actorId || "System"}</td>
                            <td style={{ padding: "10px", color: "#cbd5e1", maxWidth: "300px" }}>
                              {String(evt.payload?.sourceName || evt.payload?.documentId || evt.payload?.reason || "-")}
                            </td>
                            <td style={{ padding: "10px", fontFamily: "monospace", color: "#60a5fa" }} title={evt.hash}>
                              {evt.hash ? `${evt.hash.slice(0, 14)}...` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* MODAL 1: SUBMIT APPROVED SIGNAL */}
      {showSubmitModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "var(--surface-elevated, #0f172a)",
              border: "1px solid var(--border-subtle, #334155)",
              borderRadius: "var(--radius-lg, 8px)",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>
                Submit Approved Oracle Information
              </h2>
              <button
                onClick={() => setShowSubmitModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>

            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "20px" }}>
              Signal content will be cryptographically hashed (SHA-256), vectorized via sentence-transformers (384-d), and appended to the immutable audit ledger.
            </p>

            <form onSubmit={handleSubmitSource} className="space-y-4">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                    Source Type *
                  </label>
                  <select
                    value={submitForm.sourceType}
                    onChange={(e) => setSubmitForm({ ...submitForm, sourceType: e.target.value })}
                    style={{
                      width: "100%",
                      background: "var(--surface-sunken, #1e293b)",
                      border: "1px solid var(--border-subtle, #334155)",
                      color: "#fff",
                      padding: "8px 10px",
                      borderRadius: "4px",
                      fontSize: "0.9rem",
                    }}
                  >
                    <option value="WEATHER">WEATHER</option>
                    <option value="GRID_NOTICE">GRID_NOTICE</option>
                    <option value="REGULATORY">REGULATORY</option>
                    <option value="PRICE_FEED">PRICE_FEED</option>
                    <option value="OPERATIONAL">OPERATIONAL</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                    Source Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NOAA Solar Irradiance Forecast"
                    value={submitForm.sourceName}
                    onChange={(e) => setSubmitForm({ ...submitForm, sourceName: e.target.value })}
                    style={{
                      width: "100%",
                      background: "var(--surface-sunken, #1e293b)",
                      border: "1px solid var(--border-subtle, #334155)",
                      color: "#fff",
                      padding: "8px 10px",
                      borderRadius: "4px",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                    Publisher / Authority *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. National Weather Service"
                    value={submitForm.publisher}
                    onChange={(e) => setSubmitForm({ ...submitForm, publisher: e.target.value })}
                    style={{
                      width: "100%",
                      background: "var(--surface-sunken, #1e293b)",
                      border: "1px solid var(--border-subtle, #334155)",
                      color: "#fff",
                      padding: "8px 10px",
                      borderRadius: "4px",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                    Source URI (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="https://... or urn:..."
                    value={submitForm.sourceUri}
                    onChange={(e) => setSubmitForm({ ...submitForm, sourceUri: e.target.value })}
                    style={{
                      width: "100%",
                      background: "var(--surface-sunken, #1e293b)",
                      border: "1px solid var(--border-subtle, #334155)",
                      color: "#fff",
                      padding: "8px 10px",
                      borderRadius: "4px",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Signal Content *</label>
                  <span style={{ fontSize: "0.75rem", color: submitForm.content.length > 10000 ? "#ef4444" : "var(--text-muted)" }}>
                    {submitForm.content.length} / 10,000 characters
                  </span>
                </div>
                <textarea
                  required
                  rows={4}
                  placeholder="Enter verbatim or framed signal narrative for embedding and Bayesian updates..."
                  value={submitForm.content}
                  onChange={(e) => setSubmitForm({ ...submitForm, content: e.target.value })}
                  style={{
                    width: "100%",
                    background: "var(--surface-sunken, #1e293b)",
                    border: "1px solid var(--border-subtle, #334155)",
                    color: "#fff",
                    padding: "8px 10px",
                    borderRadius: "4px",
                    fontSize: "0.9rem",
                    resize: "vertical",
                  }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Trust Score</label>
                  <span style={{ fontSize: "0.85rem", color: "#10b981", fontWeight: 600 }}>
                    {(Number(submitForm.trustScore) * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={submitForm.trustScore}
                  onChange={(e) => setSubmitForm({ ...submitForm, trustScore: parseFloat(e.target.value) })}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                    Valid From (optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={submitForm.validFrom}
                    onChange={(e) => setSubmitForm({ ...submitForm, validFrom: e.target.value })}
                    style={{
                      width: "100%",
                      background: "var(--surface-sunken, #1e293b)",
                      border: "1px solid var(--border-subtle, #334155)",
                      color: "#fff",
                      padding: "6px 8px",
                      borderRadius: "4px",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                    Valid Until (optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={submitForm.validUntil}
                    onChange={(e) => setSubmitForm({ ...submitForm, validUntil: e.target.value })}
                    style={{
                      width: "100%",
                      background: "var(--surface-sunken, #1e293b)",
                      border: "1px solid var(--border-subtle, #334155)",
                      color: "#fff",
                      padding: "6px 8px",
                      borderRadius: "4px",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                  Metadata JSON (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder='{"solarGhi": 850, "tempC": 28.5}'
                  value={submitForm.metadataJson}
                  onChange={(e) => setSubmitForm({ ...submitForm, metadataJson: e.target.value })}
                  style={{
                    width: "100%",
                    background: "var(--surface-sunken, #1e293b)",
                    border: "1px solid var(--border-subtle, #334155)",
                    color: "#fff",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  style={{
                    background: "var(--surface-sunken, #1e293b)",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: "var(--color-primary-600, #2563eb)",
                    color: "#fff",
                    border: "none",
                    padding: "8px 18px",
                    borderRadius: "4px",
                    fontWeight: 600,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? "Ingesting..." : "Ingest & Vectorize"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM REVOCATION */}
      {revokingSource && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "var(--surface-elevated, #0f172a)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "var(--radius-lg, 8px)",
              maxWidth: "500px",
              width: "100%",
              padding: "24px",
            }}
          >
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 12px 0", color: "#ef4444" }}>
              Revoke Oracle Source
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Are you sure you want to revoke <strong>{revokingSource.sourceName || revokingSource.id}</strong>?
              This will set its validity expiration to immediately terminate, preventing autonomous agents from retrieving it during negotiations.
            </p>

            <form onSubmit={handleRevokeConfirm} style={{ marginTop: "16px" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                Revocation Reason *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Obsolete forecast replaced by newer model"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--surface-sunken, #1e293b)",
                  border: "1px solid var(--border-subtle, #334155)",
                  color: "#fff",
                  padding: "8px 10px",
                  borderRadius: "4px",
                  fontSize: "0.9rem",
                  marginBottom: "20px",
                }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setRevokingSource(null)}
                  style={{
                    background: "var(--surface-sunken, #1e293b)",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRevoking}
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    border: "none",
                    padding: "8px 18px",
                    borderRadius: "4px",
                    fontWeight: 600,
                    cursor: isRevoking ? "not-allowed" : "pointer",
                  }}
                >
                  {isRevoking ? "Revoking..." : "Confirm Revocation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
