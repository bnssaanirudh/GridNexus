/**
 * command-center/src/components/HealthPanel.test.tsx
 * ────────────────────────────────────────────────────
 * Unit tests for the HealthPanel component.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HealthPanel } from "./HealthPanel";

/** Helper: make a fetch mock that returns a given status from a given URL. */
function mockFetch(responses: Record<string, { ok: boolean; body: unknown }>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = input.toString();
    for (const [pattern, resp] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return {
          ok: resp.ok,
          json: async () => resp.body,
        } as Response;
      }
    }
    throw new Error(`Unmocked URL: ${url}`);
  });
}

describe("HealthPanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders 'Engine' and 'Broker' service cards", () => {
    mockFetch({});
    render(<HealthPanel engineUrl="http://engine" brokerUrl="http://broker" pollIntervalMs={99999} />);
    expect(screen.getByText("Engine")).toBeInTheDocument();
    expect(screen.getByText("Broker")).toBeInTheDocument();
  });

  it("shows UP badge when all probes return { status: 'ok' }", async () => {
    mockFetch({
      "engine": { ok: true, body: { status: "ok" } },
      "broker": { ok: true, body: { status: "ok" } },
    });

    render(<HealthPanel engineUrl="http://engine" brokerUrl="http://broker" pollIntervalMs={99999} />);

    await waitFor(() => {
      const upBadges = screen.getAllByText("UP");
      expect(upBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows DEGRADED badge when engine health returns HTTP error (non-ok)", async () => {
    // probe() returns "degraded" on HTTP non-200; "down" is reserved for network-level failures.
    mockFetch({
      "engine": { ok: false, body: {} },
      "broker": { ok: true, body: { status: "ok" } },
    });

    render(<HealthPanel engineUrl="http://engine" brokerUrl="http://broker" pollIntervalMs={99999} />);

    await waitFor(() => {
      expect(screen.getByText("DEGRADED")).toBeInTheDocument();
    });
  });

  it("shows DOWN badge when fetch throws (service unreachable)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    render(<HealthPanel engineUrl="http://engine" brokerUrl="http://broker" pollIntervalMs={99999} />);

    await waitFor(() => {
      const downBadges = screen.getAllByText("DOWN");
      expect(downBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows DEGRADED when response is ok but status != 'ok'", async () => {
    mockFetch({
      "engine": { ok: true, body: { status: "degraded" } },
      "broker": { ok: true, body: { status: "ok" } },
    });

    render(<HealthPanel engineUrl="http://engine" brokerUrl="http://broker" pollIntervalMs={99999} />);

    await waitFor(() => {
      expect(screen.getByText("DEGRADED")).toBeInTheDocument();
    });
  });

  it("Refresh button triggers a re-check", async () => {
    const fetchSpy = mockFetch({
      "engine": { ok: true, body: { status: "ok" } },
      "broker": { ok: true, body: { status: "ok" } },
    });

    render(<HealthPanel engineUrl="http://engine" brokerUrl="http://broker" pollIntervalMs={99999} />);

    await waitFor(() => screen.getAllByText("UP").length >= 2);

    const btn = screen.getByRole("button", { name: /refresh/i });
    btn.click();

    await waitFor(() => {
      // At least 2 batches of 3 probes each
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(6);
    });
  });
});
