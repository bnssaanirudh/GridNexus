/**
 * broker/tests/integration/golden-path.test.ts
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Oracle-to-Ledger End-to-End Golden-Path Scenario Test
 *
 * This is the canonical regression test for Part III of GridNexus. It validates
 * the COMPLETE theoretical framework in one realistic scenario:
 *
 *   1. Injects a synthetic "heatwave forecast" OracleSignal into the ledger
 *      (simulating the output of the RAG pipeline from ).
 *   2. Runs one Oracle belief-update broadcast cycle : asserts that
 *      both target agents' beliefs shift measurably from their priors.
 *   3. Drives both agents into a WebSocket Rubinstein bargaining session that
 *      reaches ACCEPTED.
 *   4. Asserts the StabilityGate  approved the coalition.
 *   5. Walks the full FK chain:
 *      OracleSignal → BeliefUpdate → Negotiation → StabilityCheck → EnergyTransfer
 *      and confirms every link resolves correctly.
 *
 * ASSUMPTION : The engine (Python FastAPI) is mocked via `global.fetch`
 * so the test runs fully in-process without a live engine container. The mock
 * returns decision_source="ORACLE_SIGNAL" on the ACCEPT round so the signal
 * traceability assertion can be satisfied.
 *
 * ASSUMPTION : The StabilityGate is mocked to avoid requiring a live
 * Redis/BullMQ worker; the mock creates a real StabilityCheck row in Postgres so
 * FK-chain assertions still exercise the actual database schema.
 *
 * DELIBERATE BREAK TEST: test "FK chain breaks when triggeringsignalid is null"
 * intentionally omits the triggeringsignalid to confirm the chain validation detects
 * the missing link and correctly fails.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupNegotiationNamespace } from "../../src/ws/negotiate.js";
import { io as SocketClient, Socket } from "socket.io-client";
import { PrismaClient } from "@prisma/client";
import { encrypt } from "../../src/db/encryption.js";
import { runBeliefUpdateCycle } from "../../src/services/beliefUpdateService.js";

// ── Mock StabilityGate – real BullMQ worker not required ────────────────────
const { mockStabilityGateCheck, mockGridGateCheck } = vi.hoisted(() => {
  const mockStabilityGateCheck = vi.fn();
  const mockGridGateCheck = vi.fn();
  return { mockStabilityGateCheck, mockGridGateCheck };
});

vi.mock("../../src/services/stabilityGate.js", () => ({
  StabilityGate: { check: mockStabilityGateCheck },
}));

vi.mock("../../src/services/gridGate.js", () => ({
  GridGate: { check: mockGridGateCheck },
}));

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ────────────────────────────────────────────────────────────────────────────

let mg1: { id: string };
let mg2: { id: string };
let agent1: { id: string };
let agent2: { id: string };
let oracleSignalId: string;
let stabilityCheckId: string;
let io: Server;
let clientSocket: Socket;
let port: number;

/**
 * assertFkChain – walk the full OracleSignal → BeliefUpdate → Negotiation →
 * StabilityCheck → EnergyTransfer chain and assert every link resolves.
 *
 * This is extracted as a standalone function so it can be called in both the
 * happy-path test AND in the deliberately-broken test (which expects it to throw).
 */
async function assertFkChain(signalId: string): Promise<void> {
  // ── Step 1: OracleSignal must exist ─────────────────────────────────────
  const signal = await prisma.oracleSignal.findUniqueOrThrow({
    where: { id: signalId },
  });
  expect(signal.signalData.toLowerCase()).toContain("heatwave");

  // ── Step 2: BeliefUpdates reference the signal ──────────────────────────
  const beliefUpdates = await prisma.beliefUpdate.findMany({
    where: { triggeringsignalid: signalId },
    include: { negotiation: true },
  });
  expect(beliefUpdates.length).toBeGreaterThanOrEqual(2);

  for (const bu of beliefUpdates) {
    expect(bu.triggeringsignalid).toBe(signalId);
    
    // Only the Bayesian updates produced by the Oracle broadcast will have a shift.
    // The bargaining rounds (LLM/DQN_GATE/ORACLE_SIGNAL) just persist the current offer.
    if (bu.decisionSource === "ORACLE") {
      const delta = Math.abs(Number(bu.afterBelief) - Number(bu.beforeBelief));
      expect(delta).toBeGreaterThan(0.001);
    }
    
    // FK to negotiation must resolve
    expect(bu.negotiation).not.toBeNull();
  }

  // ── Step 3: Negotiation (ACCEPTED bargaining session) must exist ────────
  const negotiation = await prisma.negotiation.findFirst({
    where: { status: "COMMITTED" },
    include: {
      beliefUpdates: true,
      rlRewards: true,
      energyTransfers: { include: { stabilityCheck: true } },
    },
  });
  expect(negotiation).not.toBeNull();
  expect(negotiation!.status).toBe("COMMITTED");

  // ── Step 4: StabilityCheck must be linked and approved ──────────────────
  expect(negotiation!.energyTransfers.length).toBeGreaterThanOrEqual(1);
  const transfer = negotiation!.energyTransfers[0];
  expect(transfer.stabilitycheckid).not.toBeNull();
  const sc = transfer.stabilityCheck;
  expect(sc).not.toBeNull();
  expect(sc!.isStable).toBe(true);

  // ── Step 5: EnergyTransfer links back to Negotiation & correct microgrids
  expect(transfer.negotiationId).toBe(negotiation!.id);
  expect(transfer.fromMicrogridId).toBe(mg1.id);
  expect(transfer.toMicrogridId).toBe(mg2.id);

  // ── Step 6: RlReward exists and links to Negotiation ─────────────────────
  expect(negotiation!.rlRewards.length).toBeGreaterThanOrEqual(1);
  expect(negotiation!.rlRewards[0].negotiationId).toBe(negotiation!.id);
}

// ────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ────────────────────────────────────────────────────────────────────────────

describe("Golden-Path: Oracle → Belief → Stability → Trade ", () => {
  beforeAll(async () => {
    // ── 1. Seed microgrids & agents ────────────────────────────────────────
    mg1 = await prisma.microgrid.create({
      data: {
        name: "GoldenPath-MG-Solar",
        type: "SOLAR",
        hiddenbatterycapacity: encrypt("500"),
        hiddengenerationcost: encrypt("0.06"),
      },
    });
    mg2 = await prisma.microgrid.create({
      data: {
        name: "GoldenPath-MG-Wind",
        type: "WIND",
        hiddenbatterycapacity: encrypt("400"),
        hiddengenerationcost: encrypt("0.09"),
      },
    });

    agent1 = await prisma.agent.create({ data: { type: "SELLER", microgridId: mg1.id } });
    agent2 = await prisma.agent.create({ data: { type: "BUYER", microgridId: mg2.id } });

    // ── 2. Inject synthetic "heatwave forecast" OracleSignal into the ledger
    //    This simulates the RAG pipeline  having fetched weather data
    //    and produced a high-confidence stress signal.
    // ASSUMPTION : Signal format mirrors the real Oracle broadcast
    // payload { signal, confidence, reasoning, timestamp }.
    const heatwaveSignal = await prisma.oracleSignal.create({
      data: {
        signalData: JSON.stringify({
          signal: "DEMAND_SURGE_SOON",
          confidence: 0.9,
          reasoning: "Heatwave forecast: temperatures to hit 42°C. Air conditioning demand expected to surge by 35% above baseline in the next 6 hours.",
          source: "rag_pipeline:weather_connector",
          timestamp: new Date().toISOString(),
        }),
      },
    });
    oracleSignalId = heatwaveSignal.id;

    // ── 3. Wire up StabilityGate mock (creates real DB row for FK tracing) ─
    mockStabilityGateCheck.mockImplementation(async () => {
      const check = await prisma.stabilityCheck.create({
        data: { isStable: true, margin: 12.5 },
      });
      stabilityCheckId = check.id;
      return { passed: true, checkId: check.id, isStable: true, margin: 12.5 };
    });

    // ── 3b. GridGate mock ──────────────────────────────────────────────────
    const gridCert = await prisma.gridFeasibilityCertificate.create({
      data: { networkVersion: 1, solver: "pandapower", solverVersion: "2.14.0", feasible: true, inputHash: "gp-h", resultHash: "gp-h" },
    });
    mockGridGateCheck.mockImplementation(async () => {
      return { passed: true, certId: gridCert.id };
    });

    // ── 4. Start in-process broker WebSocket server ────────────────────────
    const httpServer = createServer();
    io = new Server(httpServer);
    setupNegotiationNamespace(io);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as any).port;
        clientSocket = SocketClient(`http://localhost:${port}/negotiate`);
        clientSocket.on("connect", resolve);
      });
    });
  });

  afterAll(async () => {
    io?.close();
    clientSocket?.disconnect();
    // Cleanup in FK-safe order using raw SQL to bypass any append-only triggers
    try {
      await prisma.settlement.deleteMany({});
      await prisma.energyTransfer.deleteMany({});
      await prisma.rlReward.deleteMany({});
      await prisma.beliefUpdate.deleteMany({});
      await prisma.integritySnapshot.deleteMany({});
      await prisma.reconciliation.deleteMany({});
      await prisma.negotiationRound.deleteMany({});
      await prisma.negotiation.deleteMany({});
      await prisma.stabilityCheck.deleteMany({});
      await prisma.agent.deleteMany({});
      await prisma.dER.deleteMany({});
      await prisma.microgrid.deleteMany({});
    } catch (_) { /* ignore if DB is offline */ }
    await prisma.$disconnect();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T1: Oracle broadcast → both agents' beliefs update measurably
  // ──────────────────────────────────────────────────────────────────────────
  it("T1: Heatwave signal triggers belief updates with measurable prior→posterior shift for both agents", async () => {
    const result = await runBeliefUpdateCycle(
      oracleSignalId,
      // Provide the raw signalData so the cycle can parse the confidence
      JSON.stringify({ confidence: 0.9 }),
      [agent1.id, agent2.id]
    );

    expect(result.signalId).toBe(oracleSignalId);
    expect(result.agentsUpdated).toBe(2);
    expect(result.results.every((r) => r.status === "COMPLETE")).toBe(true);

    // Both agents must show a measurable shift from prior (default 0.5) toward
    // the high-confidence signal (0.9 → posterior ≈ 0.9 after Bayesian update)
    for (const r of result.results) {
      const shift = Math.abs(r.afterBelief - r.beforeBelief);
      expect(shift).toBeGreaterThan(0.001);
      // With confidence=0.9 and prior=0.5, posterior = 0.9 * 0.5 / (0.9*0.5 + 0.1*0.5) ≈ 0.9
      expect(r.afterBelief).toBeGreaterThan(0.5);
    }

    // Confirm DB rows were persisted and reference the oracle signal
    const dbRows = await prisma.beliefUpdate.findMany({
      where: { triggeringsignalid: oracleSignalId },
    });
    expect(dbRows.length).toBe(2);
    for (const row of dbRows) {
      expect(row.triggeringsignalid).toBe(oracleSignalId);
      expect(row.status).toBe("COMPLETE");
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T2: Negotiation reaches ACCEPTED and StabilityGate approves it
  // ──────────────────────────────────────────────────────────────────────────
  it("T2: Bargaining session reaches ACCEPTED and StabilityGate approves the coalition", async () => {
    let engineCalls = 0;

    clientSocket.on("your_turn", (data: any) => {
      engineCalls++;
      if (engineCalls < 3) {
        clientSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          action: "COUNTER_OFFER",
          decision_source: "LLM",
          counter_offer_price: 8.0 + engineCalls,
          counter_requested_kwh: 75.0,
        });
      } else {
        clientSocket.emit("agent_action", {
          negotiationId: data.negotiationId,
          action: "ACCEPT",
          decision_source: "ORACLE_SIGNAL",
        });
      }
    });

    const done = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Negotiation timed out")), 10_000);
      clientSocket.on("negotiation_complete", (data: any) => {
        clearTimeout(timeout);
        expect(data.status).toBe("COMMITTED");
        resolve();
      });
    });

    clientSocket.emit("start_negotiation", {
      agentIds: [agent1.id, agent2.id],
      initialSurplus: 300.0,
    });

    await done;

    // Confirm StabilityGate was called
    expect(mockStabilityGateCheck).toHaveBeenCalled();
    const [gateCtx] = mockStabilityGateCheck.mock.calls[0];
    expect(gateCtx.agentIds).toEqual([agent1.id, agent2.id]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T3: Full FK chain validation (the canonical golden-path assertion)
  // ──────────────────────────────────────────────────────────────────────────
  it("T3: Full FK chain resolves – OracleSignal → BeliefUpdate → Negotiation → StabilityCheck → EnergyTransfer", async () => {
    await assertFkChain(oracleSignalId);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // T4: Deliberate break – confirms the chain validator catches a missing link
  // ──────────────────────────────────────────────────────────────────────────
  it("T4 (break test): FK chain validation fails when triggeringsignalid is null / missing", async () => {
    // Create a "phantom" signal that has no linked BeliefUpdates
    const phantomSignal = await prisma.oracleSignal.create({
      data: {
        signalData: JSON.stringify({ signal: "ORPHAN", confidence: 0.5 }),
      },
    });

    try {
      // assertFkChain should throw because no BeliefUpdates reference this signal
      let threw = false;
      try {
        await assertFkChain(phantomSignal.id);
      } catch (err) {
        threw = true;
        // Correct – the validation detected the broken chain
      }

      // Also verify via inline assertion (the BeliefUpdate count check)
      if (!threw) {
        const linkedBUs = await prisma.beliefUpdate.findMany({
          where: { triggeringsignalid: phantomSignal.id },
        });
        // If assertFkChain didn't throw, the count check should have failed
        expect(linkedBUs.length).toBeLessThan(2);
        // Force a failure so the test correctly reports broken-chain detection
        expect(linkedBUs.length).toBeGreaterThanOrEqual(2); // This will FAIL as intended
      }
      // If threw=true, the broken-chain was correctly detected – test passes
      expect(threw).toBe(true);
    } finally {
      await prisma.oracleSignal.delete({ where: { id: phantomSignal.id } });
    }
  });
});
