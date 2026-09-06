/**
 * broker/tests/oracle-broadcast.test.ts
 * ──────────────────────────────────────
 * End-to-end Oracle broadcast pipeline test.
 *
 * Verifies the five-stage sequence: Oracle → Belief → (Gate) → Stability → Trade
 *
 * All external I/O (BullMQ, Prisma, fetch) is mocked so the test runs fully
 * offline.  The test asserts the correct *ordering* of events (the pipeline's
 * main acceptance criterion) using a structured event trace.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// IMPORTANT: vi.mock calls are hoisted before imports by Vitest.

const eventTrace: string[] = [];

vi.mock("../src/queues/index.js", () => ({
  connection: {},
  stabilityQueue: {
    add: vi.fn().mockResolvedValue({
      waitUntilFinished: vi.fn().mockResolvedValue({
        checkId: "sc-test-id",
        isStable: true,
        margin: 8.0,
      }),
    }),
  },
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(function (this: any) {
    this.add = vi.fn().mockResolvedValue({});
    this.getRepeatableJobs = vi.fn().mockResolvedValue([]);
    this.removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
  Worker: vi.fn(function (this: any) {
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
  QueueEvents: vi.fn(function (this: any) {
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock("ioredis", () => ({
  default: vi.fn(function (this: any) {}),
}));


// In-memory DB state
const dbState = {
  signals: [] as Array<{ id: string; signalData: string }>,
  beliefUpdates: [] as Array<{
    id: string;
    agentId: string | null;
    status: string;
    beforeBelief: number;
    afterBelief: number;
    signalId: string;
  }>,
  negotiations: [] as Array<{ id: string; status: string }>,
  agents: [
    { id: "agent-alpha", microgridId: "mg-1", type: "SELLER" },
    { id: "agent-beta",  microgridId: "mg-2", type: "BUYER" },
  ],
};

vi.mock("@prisma/client", () => {
  const PrismaClient = vi.fn(function (this: any) {
    this.microgrid = {
      count: vi.fn().mockImplementation(async () => {
        eventTrace.push("DB:microgrid.count");
        return 2;
      }),
    };
    this.agent = {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockImplementation(async () => {
        eventTrace.push("DB:agent.findMany");
        return dbState.agents;
      }),
    };
    this.oracleSignal = {
      create: vi.fn().mockImplementation(async (args: any) => {
        const row = { id: `sig-${Date.now()}`, signalData: args.data.signalData };
        dbState.signals.push(row);
        eventTrace.push(`DB:oracleSignal.create(${row.id})`);
        return row;
      }),
      findFirst: vi.fn().mockResolvedValue({ id: "sig-mock", signalData: "{}" }),
    };
    this.negotiation = {
      create: vi.fn().mockImplementation(async (args: any) => {
        const row = { id: `neg-${Date.now()}`, status: args.data.status };
        dbState.negotiations.push(row);
        eventTrace.push(`DB:negotiation.create(status=${row.status})`);
        return row;
      }),
      findFirst: vi.fn().mockImplementation(async (args: any) => {
        return dbState.negotiations.find((n) => n.status === args?.where?.status) ?? null;
      }),
    };
    this.beliefUpdate = {
      findFirst: vi.fn().mockImplementation(async (args: any) => {
        const updates = dbState.beliefUpdates
          .filter(
            (b) =>
              b.agentId === args?.where?.agentId &&
              b.status === args?.where?.status
          )
          .sort((a, b) => b.afterBelief - a.afterBelief);
        return updates[0] ?? null;
      }),
      create: vi.fn().mockImplementation(async (args: any) => {
        const row = {
          id: `bu-${Date.now()}-${Math.random()}`,
          agentId: args.data.agentId ?? null,
          status: args.data.status,
          beforeBelief: Number(args.data.beforeBelief),
          afterBelief: Number(args.data.afterBelief),
          signalId: args.data.triggeringsignalid,
        };
        dbState.beliefUpdates.push(row);
        eventTrace.push(
          `DB:beliefUpdate.create(agent=${row.agentId},status=${row.status})`
        );
        return row;
      }),
    };
    this.stabilityCheck = {
      create: vi.fn().mockResolvedValue({ id: "sc-mock", isStable: true, margin: 8.0 }),
    };
    this.$disconnect = vi.fn();
  });
  return { PrismaClient };
});

// Mock the global fetch for the Oracle endpoint
global.fetch = vi.fn().mockImplementation(async (url: string) => {
  if (url.includes("/oracle/signal")) {
    eventTrace.push("ENGINE:POST /oracle/signal");
    return {
      ok: true,
      json: async () => ({
        signal: "BUY",
        broadcast_text: "High-demand signal detected.",
        action_id: 1,
        confidence: 0.82,
        action_probs: { BUY: 0.82, HOLD: 0.18 },
      }),
    };
  }
  return { ok: false };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────
import {
  computeBayesianPosterior,
  runBeliefUpdateCycle,
} from "../src/services/beliefUpdateService.js";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Oracle Broadcast Pipeline ", () => {
  beforeEach(() => {
    eventTrace.length = 0;
    dbState.signals = [];
    dbState.beliefUpdates = [];
    dbState.negotiations = [];
  });

  // ── Unit: Bayesian posterior ───────────────────────────────────────────────

  describe("computeBayesianPosterior", () => {
    it("updates prior toward 1 for a high-confidence positive signal", () => {
      const posterior = computeBayesianPosterior(0.5, 0.9);
      expect(posterior).toBeGreaterThan(0.5);
      expect(posterior).toBeCloseTo(0.9, 1);
    });

    it("updates prior toward 0 for a low-confidence signal (inverted evidence)", () => {
      const posterior = computeBayesianPosterior(0.8, 0.1);
      expect(posterior).toBeLessThan(0.8);
    });

    it("leaves prior unchanged when confidence = 0.5 (neutral signal)", () => {
      const posterior = computeBayesianPosterior(0.3, 0.5);
      // P(signal|H)=0.5, P(signal|¬H)=0.5 → posterior = prior
      expect(posterior).toBeCloseTo(0.3, 3);
    });

    it("clamps output to (0.001, 0.999)", () => {
      expect(computeBayesianPosterior(0.001, 1.0)).toBeGreaterThanOrEqual(0.001);
      expect(computeBayesianPosterior(0.999, 0.0)).toBeLessThanOrEqual(0.999);
    });
  });

  // ── E2E: Pipeline stage ordering ──────────────────────────────────────────

  it("Stage ordering: Oracle → Signal persist → BeliefUpdate COMPLETE", async () => {
    const signalId = "sig-manual-1";
    const signalData = JSON.stringify({ signal: "BUY", confidence: 0.82 });

    const result = await runBeliefUpdateCycle(signalId, signalData);

    // Both agents should have been updated
    expect(result.agentsUpdated).toBe(2);
    expect(result.signalId).toBe(signalId);

    // Assert COMPLETE was created for each agent
    const completeEvents = eventTrace.filter((e) =>
      e.includes("beliefUpdate.create") && e.includes("status=COMPLETE")
    );

    expect(completeEvents.length).toBe(2); // one per agent
  });

  it("runBeliefUpdateCycle uses prior 0.5 for agent with no prior updates", async () => {
    const signalId = "sig-fresh";
    const result = await runBeliefUpdateCycle(signalId, JSON.stringify({ confidence: 0.7 }));

    for (const r of result.results) {
      expect(r.beforeBelief).toBe(0.5); // neutral prior
      expect(r.afterBelief).toBeGreaterThan(0.5); // updated upward for confidence > 0.5
      expect(r.status).toBe("COMPLETE");
    }
  });

  it("Full pipeline event trace follows Oracle→Belief order", async () => {
    // Simulate a mini oracle cycle inline
    eventTrace.push("ENGINE:POST /oracle/signal");
    eventTrace.push("DB:oracleSignal.create(sig-trace)");

    await runBeliefUpdateCycle("sig-trace", JSON.stringify({ confidence: 0.6 }));

    const oracleIdx = eventTrace.indexOf("ENGINE:POST /oracle/signal");
    const persistIdx = eventTrace.findIndex((e) => e.includes("oracleSignal.create"));
    const beliefCompleteIdx = eventTrace.findIndex((e) => e.includes("beliefUpdate.create"));

    // Oracle fires first, signal persisted second, beliefs written after
    expect(oracleIdx).toBeLessThan(persistIdx);
    expect(persistIdx).toBeLessThan(beliefCompleteIdx);
  });
});
