import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { isProduction, getGridNexusMode } from "../src/config.js";
import { stabilityWorker } from "../src/worker.js";
import { oracleBroadcastWorker } from "../src/workers/oracleBroadcastWorker.js";

// Mock bullmq to avoid redis connections
vi.mock("bullmq", () => {
  return {
    Worker: class {
      processFn: Function;
      constructor(name: string, processFn: Function) {
        this.processFn = processFn;
      }
      on() {}
      close() {}
    },
    Queue: class {
      add() {}
      close() {}
    },
    QueueEvents: class {
      close() {}
    }
  };
});

// Mock ioredis
vi.mock("ioredis", () => {
  return {
    default: class {
      on() {}
      quit() {}
    }
  };
});

// Mock prisma and fetch
vi.mock("@prisma/client", () => {
  const mockPrisma = {
    oracleSignal: {
      create: vi.fn().mockRejectedValue(new Error("DB Down")),
    },
    beliefUpdate: {
      findFirst: vi.fn().mockRejectedValue(new Error("DB Down")),
    },
    $disconnect: vi.fn(),
  };
  return {
    PrismaClient: class {
      constructor() {
        return mockPrisma;
      }
    }
  };
});

describe("Production Safety Requirements", () => {
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.GRIDNEXUS_MODE;
  });

  afterAll(() => {
    process.env.GRIDNEXUS_MODE = originalEnv;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockRejectedValue(new Error("Engine Down"));
  });

  it("should fail closed in production mode when engine is down (stability check)", async () => {
    process.env.GRIDNEXUS_MODE = "production";
    
    await expect(async () => {
      // Direct call to worker processor
      const processor = (stabilityWorker as any).processFn;
      await processor({ data: { coalition: ["A", "B"] } } as any);
    }).rejects.toThrow(/Engine verification failed|Engine Down/);
  });

  it("should fall back to mock (simulation mode) when engine is down (stability check)", async () => {
    process.env.GRIDNEXUS_MODE = "simulation";
    
    // Direct call to worker processor
    const processor = (stabilityWorker as any).processFn;
    const result = await processor({ data: { coalition: ["A", "B"] } } as any);
    
    expect(result.isStable).toBe(true);
    expect(result.margin).toBe(12.5);
  });

  it("should fail closed in production when oracle engine is down", async () => {
    process.env.GRIDNEXUS_MODE = "production";

    await expect(async () => {
      const processor = (oracleBroadcastWorker as any).processFn;
      await processor({ id: "1", data: { scheduledAt: Date.now() } } as any);
    }).rejects.toThrow(/Oracle engine unreachable in production mode|Engine Down/);
  });

  it("should block oracle persistence if DB is down in production", async () => {
    process.env.GRIDNEXUS_MODE = "production";
    
    // Mock fetch to succeed so it hits the DB step
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        signal: "HOLD",
        action_id: 1,
        confidence: 0.8,
        broadcast_text: "Test",
        action_probs: {}
      })
    });

    await expect(async () => {
      const processor = (oracleBroadcastWorker as any).processFn;
      await processor({ id: "1", data: { scheduledAt: Date.now() } } as any);
    }).rejects.toThrow(/Oracle signal persistence failed in production|DB Down/);
  });
  
  it("should use mock in simulation mode when oracle engine is down", async () => {
    process.env.GRIDNEXUS_MODE = "simulation";

    const processor = (oracleBroadcastWorker as any).processFn;
    const result = await processor({ id: "1", data: { scheduledAt: Date.now() } } as any);
    
    expect(result.signal).toBe("HOLD");
    expect(result.confidence).toBe(0.5);
  });
});
