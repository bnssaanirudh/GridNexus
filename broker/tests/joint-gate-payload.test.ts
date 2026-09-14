import { describe, expect, it } from "vitest";
import { buildJointGatePayload } from "../src/services/jointGatePayload.js";

describe("joint gate payload construction", () => {
  it("uses buyer maximumPreferredBuyPrice as energy_value and never reuses generation cost", () => {
    const payload = buildJointGatePayload({
      negotiationId: "neg-1",
      agentIds: ["seller-1", "buyer-1"],
      currentRequestedKwh: 12,
      intervalMinutes: 60,
      agents: [
        {
          id: "seller-1",
          type: "SELLER",
          microgridId: "mg-seller",
          hiddenGenerationCost: 0.07,
          maximumPreferredBuyPrice: null,
          ders: [{ ratedPowerKw: 40 }],
        },
        {
          id: "buyer-1",
          type: "BUYER",
          microgridId: "mg-buyer",
          hiddenGenerationCost: 0.03,
          maximumPreferredBuyPrice: 0.18,
          ders: [{ ratedPowerKw: 20 }],
        },
      ],
      buses: [
        { id: "bus-seller", voltageLevelKv: 11, microgridIds: ["mg-seller"] },
        { id: "bus-buyer", voltageLevelKv: 11, microgridIds: ["mg-buyer"] },
      ],
      lines: [
        {
          id: "line-1",
          fromBusId: "bus-seller",
          toBusId: "bus-buyer",
          resistance: 0.01,
          reactance: 0.02,
          thermalLimitKw: 100,
        },
      ],
    });

    expect(payload.profiles["buyer-1"]).toEqual({
      type: "buyer",
      energy_value: 0.18,
      demand: 12,
      outside_option: 0.0,
    });
  });

  it("rejects buyer agents with no explicit maximumPreferredBuyPrice", () => {
    expect(() =>
      buildJointGatePayload({
        negotiationId: "neg-2",
        agentIds: ["seller-1", "buyer-1"],
        currentRequestedKwh: 12,
        intervalMinutes: 60,
        agents: [
          {
            id: "seller-1",
            type: "SELLER",
            microgridId: "mg-seller",
            hiddenGenerationCost: 0.07,
            maximumPreferredBuyPrice: null,
            ders: [{ ratedPowerKw: 40 }],
          },
          {
            id: "buyer-1",
            type: "BUYER",
            microgridId: "mg-buyer",
            hiddenGenerationCost: 0.03,
            maximumPreferredBuyPrice: null,
            ders: [{ ratedPowerKw: 20 }],
          },
        ],
        buses: [
          { id: "bus-seller", voltageLevelKv: 11, microgridIds: ["mg-seller"] },
          { id: "bus-buyer", voltageLevelKv: 11, microgridIds: ["mg-buyer"] },
        ],
        lines: [],
      })
    ).toThrow("Buyer buyer-1 has no maximumPreferredBuyPrice trading preference");
  });
});
