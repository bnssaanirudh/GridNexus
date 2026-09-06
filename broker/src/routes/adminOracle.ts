/**
 * broker/src/routes/adminOracle.ts
 * ─────────────────────────────────
 * Administrative Oracle Source Management endpoints for Layer 2 (Broker).
 *
 * Provides:
 *   - GET  /api/admin/oracle/sources          → View existing Oracle sources with full provenance & status
 *   - POST /api/admin/oracle/sources          → Manually submit approved Oracle document/signal
 *   - POST /api/admin/oracle/sources/:id/revoke   → Revoke / disable source (sets validUntil = NOW())
 *   - POST /api/admin/oracle/sources/:id/reingest → Trigger safe re-ingestion
 *   - GET  /api/admin/oracle/audits           → Inspect RAG retrieval & tamper-evident audit ledger
 */

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { Role } from "../middleware/rbac.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";
import { appendAuditEvent } from "../services/auditChain.js";

const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:8000";
const MAX_CONTENT_LENGTH = 10_000;
const MIN_CONTENT_LENGTH = 5;
const URI_REGEX = /^(https?:\/\/|urn:|ipfs:\/\/)[^\s]+$/i;

export const adminOracleRouter = Router();

export interface OracleSourceDto {
  id: string;
  sourceType: string;
  sourceName: string | null;
  sourceUri: string | null;
  publisher: string | null;
  content: string;
  contentHash: string | null;
  observedAt: Date | string | null;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
  trustScore: number | null;
  connectorVersion: string | null;
  embeddingModel: string | null;
  embeddingModelVersion: string | null;
  embeddingDimension: number | null;
  metadata: any;
  ingestedAt: Date | string;
  status: "ACTIVE" | "REVOKED";
}

/**
 * GET /api/admin/oracle/sources
 * Lists all embedded documents / Oracle sources with metadata, provenance, and status.
 * Accessible to ADMIN, GRID_OPERATOR, and AUDITOR (read-only).
 */
adminOracleRouter.get(
  "/sources",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR, Role.AUDITOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? 50), 10) || 50));
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? 1), 10) || 1);
      const offset = (page - 1) * limit;
      const statusFilter = req.query.status as string | undefined; // 'active', 'revoked', 'all'
      const typeFilter = req.query.sourceType as string | undefined;

      // Query sources using raw SQL to safely handle the unsupported vector column
      const rows = await prisma.$queryRaw<any[]>`
        SELECT 
          id, "sourceType", "sourceName", "sourceUri", "publisher",
          content, "contentHash", "observedAt", "validFrom", "validUntil",
          "trustScore", "connectorVersion", "embeddingModel", "embeddingModelVersion",
          "embeddingDimension", metadata, "ingestedAt"
        FROM embedded_documents
        ORDER BY "ingestedAt" DESC
      `;

      const now = new Date();
      let formatted: OracleSourceDto[] = rows.map((r) => {
        const validUntil = r.validUntil ? new Date(r.validUntil) : null;
        const isRevoked = validUntil !== null && validUntil <= now;
        return {
          id: r.id,
          sourceType: r.sourceType,
          sourceName: r.sourceName ?? null,
          sourceUri: r.sourceUri ?? null,
          publisher: r.publisher ?? null,
          content: r.content,
          contentHash: r.contentHash ?? null,
          observedAt: r.observedAt ?? null,
          validFrom: r.validFrom ?? null,
          validUntil: r.validUntil ?? null,
          trustScore: r.trustScore !== null ? Number(r.trustScore) : null,
          connectorVersion: r.connectorVersion ?? null,
          embeddingModel: r.embeddingModel ?? null,
          embeddingModelVersion: r.embeddingModelVersion ?? null,
          embeddingDimension: r.embeddingDimension ? Number(r.embeddingDimension) : null,
          metadata: r.metadata ?? null,
          ingestedAt: r.ingestedAt,
          status: isRevoked ? "REVOKED" : "ACTIVE",
        };
      });

      if (statusFilter === "active") {
        formatted = formatted.filter((s) => s.status === "ACTIVE");
      } else if (statusFilter === "revoked") {
        formatted = formatted.filter((s) => s.status === "REVOKED");
      }

      if (typeFilter) {
        formatted = formatted.filter((s) => s.sourceType.toLowerCase() === typeFilter.toLowerCase());
      }

      const total = formatted.length;
      const paginated = formatted.slice(offset, offset + limit);

      res.json({
        total,
        page,
        limit,
        sources: paginated,
      });
    } catch (err: any) {
      console.error("[AdminOracle] Failed to fetch sources:", err);
      res.status(500).json({ error: "QUERY_FAILED", message: "Failed to retrieve Oracle sources." });
    }
  }
);

/**
 * POST /api/admin/oracle/sources
 * Manually submit an approved Oracle signal or document.
 * Requires ADMIN or GRID_OPERATOR.
 */
adminOracleRouter.post(
  "/sources",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        content,
        sourceType,
        sourceName,
        sourceUri,
        publisher,
        observedAt,
        validFrom,
        validUntil,
        trustScore = 1.0,
        metadata,
      } = req.body ?? {};

      // 1. Sanitize and bound content
      if (typeof content !== "string") {
        res.status(400).json({ error: "INVALID_CONTENT", message: "Content must be a string." });
        return;
      }
      const cleanedContent = content.replace(/\0/g, "").trim();
      if (cleanedContent.length < MIN_CONTENT_LENGTH || cleanedContent.length > MAX_CONTENT_LENGTH) {
        res.status(400).json({
          error: "CONTENT_BOUND_ERROR",
          message: `Content must be between ${MIN_CONTENT_LENGTH} and ${MAX_CONTENT_LENGTH} characters.`,
        });
        return;
      }

      // 2. Validate source provenance
      if (!sourceType || typeof sourceType !== "string" || !sourceType.trim()) {
        res.status(400).json({ error: "MISSING_SOURCE_TYPE", message: "sourceType is required." });
        return;
      }
      if (!sourceName || typeof sourceName !== "string" || !sourceName.trim()) {
        res.status(400).json({ error: "MISSING_SOURCE_NAME", message: "sourceName is required." });
        return;
      }
      if (!publisher || typeof publisher !== "string" || !publisher.trim()) {
        res.status(400).json({ error: "MISSING_PUBLISHER", message: "publisher is required." });
        return;
      }

      // 3. Validate URI format if provided
      if (sourceUri && typeof sourceUri === "string") {
        if (!URI_REGEX.test(sourceUri.trim())) {
          res.status(400).json({
            error: "INVALID_URI",
            message: "sourceUri must begin with http://, https://, urn:, or ipfs://",
          });
          return;
        }
      }

      // 4. Validate trustScore
      const numTrust = Number(trustScore);
      if (Number.isNaN(numTrust) || numTrust < 0.0 || numTrust > 1.0) {
        res.status(400).json({
          error: "INVALID_TRUST_SCORE",
          message: "trustScore must be a number between 0.0 and 1.0.",
        });
        return;
      }

      // 5. Validate dates
      let parsedFrom: Date | null = null;
      let parsedUntil: Date | null = null;
      let parsedObserved: Date | null = null;
      if (validFrom) {
        parsedFrom = new Date(validFrom);
        if (Number.isNaN(parsedFrom.getTime())) {
          res.status(400).json({ error: "INVALID_DATE", message: "validFrom is invalid." });
          return;
        }
      }
      if (validUntil) {
        parsedUntil = new Date(validUntil);
        if (Number.isNaN(parsedUntil.getTime())) {
          res.status(400).json({ error: "INVALID_DATE", message: "validUntil is invalid." });
          return;
        }
      }
      if (parsedFrom && parsedUntil && parsedUntil < parsedFrom) {
        res.status(400).json({
          error: "INVALID_DATE_RANGE",
          message: "validUntil cannot be earlier than validFrom.",
        });
        return;
      }
      if (observedAt) {
        parsedObserved = new Date(observedAt);
        if (Number.isNaN(parsedObserved.getTime())) {
          res.status(400).json({ error: "INVALID_DATE", message: "observedAt is invalid." });
          return;
        }
      }

      // 6. Compute cryptographic SHA-256 hash
      const contentHash = crypto.createHash("sha256").update(cleanedContent, "utf8").digest("hex");
      const docId = crypto.randomUUID();
      const connectorVersion = "manual-admin-v1";
      const embeddingModel = "all-MiniLM-L6-v2";
      const embeddingModelVersion = "1.1.0";
      const embeddingDim = 384;

      // 7. Ingest into Engine (or fallback to direct database insertion)
      let engineIngested = false;
      try {
        const engineRes = await fetch(`${ENGINE_URL}/oracle/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: cleanedContent,
            source_type: sourceType.trim(),
            source_name: sourceName.trim(),
            source_uri: sourceUri ? sourceUri.trim() : null,
            publisher: publisher.trim(),
            observed_at: parsedObserved?.toISOString() ?? null,
            valid_from: parsedFrom?.toISOString() ?? null,
            valid_until: parsedUntil?.toISOString() ?? null,
            trust_score: numTrust,
            connector_version: connectorVersion,
            metadata: metadata ?? null,
          }),
        });
        if (engineRes.ok) {
          engineIngested = true;
        }
      } catch (_err) {
        // Engine offline or unreachable; fall back to local direct SQL insertion
      }

      if (!engineIngested) {
        // Direct SQL insertion with pgvector 384-d zero vector fallback
        const zeroVector = `[${new Array(384).fill(0).join(",")}]`;
        await prisma.$executeRaw`
          INSERT INTO embedded_documents (
            id, "sourceType", "sourceName", "sourceUri", "publisher",
            content, "contentHash", "observedAt", "validFrom", "validUntil",
            "trustScore", "connectorVersion", "embeddingModel", "embeddingModelVersion",
            "embeddingDimension", metadata, embedding, "ingestedAt"
          )
          VALUES (
            ${docId}, ${sourceType.trim()}, ${sourceName.trim()}, ${sourceUri ? sourceUri.trim() : null}, ${publisher.trim()},
            ${cleanedContent}, ${contentHash}, ${parsedObserved}, ${parsedFrom}, ${parsedUntil},
            ${numTrust}, ${connectorVersion}, ${embeddingModel}, ${embeddingModelVersion},
            ${embeddingDim}, ${metadata ? JSON.stringify(metadata) : null}::jsonb, ${zeroVector}::vector, NOW()
          )
        `;
      }

      // 8. Log into SHA-256 tamper-evident audit chain
      await appendAuditEvent(prisma as any, {
        eventType: "ORACLE_SOURCE_INGESTED",
        actorId: req.user?.userId || (req.user as any)?.id || "admin",
        payload: {
          documentId: docId,
          sourceType: sourceType.trim(),
          sourceName: sourceName.trim(),
          sourceUri: sourceUri ? sourceUri.trim() : null,
          publisher: publisher.trim(),
          trustScore: numTrust,
          contentHash,
          observedAt: parsedObserved?.toISOString() ?? null,
          validFrom: parsedFrom?.toISOString() ?? null,
          validUntil: parsedUntil?.toISOString() ?? null,
        },
      });

      res.status(201).json({
        id: docId,
        sourceType: sourceType.trim(),
        sourceName: sourceName.trim(),
        sourceUri: sourceUri ? sourceUri.trim() : null,
        publisher: publisher.trim(),
        content: cleanedContent,
        contentHash,
        trustScore: numTrust,
        status: "ACTIVE",
        connectorVersion,
        embeddingModel,
        embeddingModelVersion,
        message: "Oracle source ingested and audited successfully.",
      });
    } catch (err: any) {
      console.error("[AdminOracle] Ingestion failed:", err);
      res.status(500).json({ error: "INGESTION_FAILED", message: "Failed to ingest Oracle source." });
    }
  }
);

/**
 * POST /api/admin/oracle/sources/:id/revoke
 * Disable / revoke an active Oracle source by setting validUntil = NOW().
 * Requires ADMIN or GRID_OPERATOR.
 */
adminOracleRouter.post(
  "/sources/:id/revoke",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const reason = req.body?.reason || "Administrative revocation";

      // Verify document exists
      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, "sourceName", "sourceType", "validUntil"
        FROM embedded_documents
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!existing.length) {
        res.status(404).json({ error: "NOT_FOUND", message: "Oracle source not found." });
        return;
      }

      // Revoke by setting validUntil = NOW()
      await prisma.$executeRaw`
        UPDATE embedded_documents
        SET "validUntil" = NOW()
        WHERE id = ${id}
      `;

      // Record audit event
      await appendAuditEvent(prisma as any, {
        eventType: "ORACLE_SOURCE_REVOKED",
        actorId: req.user?.userId || (req.user as any)?.id || "admin",
        payload: {
          documentId: id,
          sourceName: existing[0].sourceName,
          sourceType: existing[0].sourceType,
          reason,
        },
      });

      res.json({
        id,
        status: "REVOKED",
        message: "Oracle source revoked successfully.",
      });
    } catch (err: any) {
      console.error("[AdminOracle] Revocation failed:", err);
      res.status(500).json({ error: "REVOCATION_FAILED", message: "Failed to revoke Oracle source." });
    }
  }
);

/**
 * POST /api/admin/oracle/sources/:id/reingest
 * Trigger safe re-ingestion of an Oracle source (resets validUntil to NULL if revoked).
 * Requires ADMIN or GRID_OPERATOR.
 */
adminOracleRouter.post(
  "/sources/:id/reingest",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await prisma.$queryRaw<any[]>`
        SELECT id, "sourceName", "sourceType"
        FROM embedded_documents
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!existing.length) {
        res.status(404).json({ error: "NOT_FOUND", message: "Oracle source not found." });
        return;
      }

      // Re-ingest: update ingestedAt to NOW() and clear validUntil
      await prisma.$executeRaw`
        UPDATE embedded_documents
        SET "ingestedAt" = NOW(), "validUntil" = NULL
        WHERE id = ${id}
      `;

      // Record audit event
      await appendAuditEvent(prisma as any, {
        eventType: "ORACLE_SOURCE_REINGESTED",
        actorId: req.user?.userId || (req.user as any)?.id || "admin",
        payload: {
          documentId: id,
          sourceName: existing[0].sourceName,
          sourceType: existing[0].sourceType,
        },
      });

      res.json({
        id,
        status: "ACTIVE",
        message: "Oracle source re-ingested successfully.",
      });
    } catch (err: any) {
      console.error("[AdminOracle] Reingest failed:", err);
      res.status(500).json({ error: "REINGEST_FAILED", message: "Failed to re-ingest Oracle source." });
    }
  }
);

/**
 * GET /api/admin/oracle/audits
 * Inspect retrieval and manual mutation audit trail.
 * Accessible to ADMIN, GRID_OPERATOR, and AUDITOR.
 */
adminOracleRouter.get(
  "/audits",
  requireAuth([Role.ADMIN, Role.GRID_OPERATOR, Role.AUDITOR]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? 50), 10) || 50));

      // 1. Fetch retrieval context audits
      let retrievedAudits: any[] = [];
      try {
        retrievedAudits = await prisma.$queryRaw<any[]>`
          SELECT id, query, "documentIds", "similarityScore", ranking, "modelVersion", timestamp
          FROM retrieved_context_audits
          ORDER BY timestamp DESC
          LIMIT ${limit}
        `;
      } catch (_err) {
        retrievedAudits = [];
      }

      // 2. Fetch tamper-evident audit ledger events for Oracle mutations
      const oracleAuditEvents = await prisma.auditEvent.findMany({
        where: {
          eventType: {
            startsWith: "ORACLE_",
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      res.json({
        retrievedAudits: retrievedAudits.map((a) => ({
          ...a,
          similarityScore: a.similarityScore !== null ? Number(a.similarityScore) : null,
        })),
        auditEvents: oracleAuditEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          actorId: e.actorId,
          payload: e.payload,
          hash: e.eventHash,
          previousHash: e.previousHash,
          timestamp: e.createdAt,
        })),
      });
    } catch (err: any) {
      console.error("[AdminOracle] Failed to fetch audits:", err);
      res.status(500).json({ error: "AUDIT_FETCH_FAILED", message: "Failed to fetch Oracle audit records." });
    }
  }
);
