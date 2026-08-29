/**
 * command-center/src/lib/mockApi.ts
 * ─────────────────────────────────
 * Mocks API responses for the "Continue as Guest" demo mode.
 * Intercepts global fetch when the mock token is present.
 */

import { getToken } from "./auth";

const originalFetch = window.fetch;

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : (input as Request).url;
  
  // Only mock if we are using the demo mock token or if it's hitting our local backend ports
  const isDemo = getToken() === "mock.jwt.token";
  const isBackendCall = url.includes(":3000") || url.includes(":8000");

  if (isDemo && isBackendCall) {
    console.log(`[Demo Mode] Intercepted fetch to ${url}`);
    
    let mockData: any = {};

    if (url.includes("/health") || url.includes("/ready")) {
      mockData = { status: "ok", timestamp: new Date().toISOString() };
    } 
    else if (url.includes("/api/metrics/overview")) {
      mockData = {
        activeAgents: 256,
        dailyVolume: 42500,
        avgClearingPrice: 0.114,
        gridLoad: 72,
      };
    }
    else if (url.includes("/api/oracle/signals")) {
      mockData = [
        { id: "1", type: "HIGH_RENEWABLE", severity: "info", timestamp: new Date(Date.now() - 1000 * 60).toISOString(), message: "High solar output expected." },
        { id: "2", type: "PRICE_SPIKE", severity: "warning", timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), message: "Peak demand approaching." }
      ];
    }
    else if (url.includes("/api/coalitions")) {
      mockData = [
        { id: "c1", name: "North Substation", value: 1200, members: 45, stability: 0.92 },
        { id: "c2", name: "Downtown Commercial", value: 3400, members: 120, stability: 0.88 }
      ];
    }
    else if (url.includes("/api/topology")) {
      mockData = {
        nodes: [
          { id: "n1", type: "substation", label: "Main Station" },
          { id: "n2", type: "load", label: "Commercial Block" }
        ],
        links: [
          { source: "n1", target: "n2", capacity: 5000 }
        ]
      };
    }
    else if (url.includes("/api/ders")) {
      mockData = [
        { id: "der1", type: "solar", capacity: 50, location: "Zone A", status: "active" },
        { id: "der2", type: "battery", capacity: 100, location: "Zone B", status: "active" }
      ];
    }
    else if (url.includes("/api/settlements")) {
      mockData = [
        { id: "s1", amount: 45.2, buyer: "Agent A", seller: "Agent B", timestamp: new Date().toISOString() }
      ];
    }
    else if (url.includes("/api/audit-events")) {
      mockData = [
        { id: "evt1", type: "SETTLEMENT_COMMITTED", hash: "a3f9c2d1b...2c1d", verified: true, timestamp: new Date().toISOString() },
        { id: "evt2", type: "GRID_CERTIFIED", hash: "8e4b1a7d...9f3c", verified: true, timestamp: new Date(Date.now() - 10000).toISOString() }
      ];
    }
    else if (url.includes("/api/analytics")) {
      mockData = {
        totalTrades: 1250,
        volumeHistory: [100, 250, 400, 300, 500, 450, 600]
      };
    }
    else if (url.includes("/auth/")) {
      // Auth endpoints are mocked separately in lib/auth.ts, but if they reach here, return a mock user
      mockData = { id: "demo-user", username: "Guest Demo", email: "guest@gridnexus.test", role: "demo", access_token: "mock.jwt.token" };
    }

    // Simulate network delay
    await new Promise(r => setTimeout(r, 300));
    
    return new Response(JSON.stringify(mockData), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Fallback to real fetch for non-mock requests
  return originalFetch(input, init);
};

export {};
