export interface JointGatePayloadAgent {
  id: string;
  type: string;
  microgridId: string;
  hiddenGenerationCost: number;
  maximumPreferredBuyPrice: number | null;
  ders: Array<{ ratedPowerKw: number }>;
}

export interface JointGatePayloadBus {
  id: string;
  voltageLevelKv: number;
  microgridIds: string[];
}

export interface JointGatePayloadLine {
  id: string;
  fromBusId: string;
  toBusId: string;
  resistance: number;
  reactance: number;
  thermalLimitKw: number;
}

export interface BuildJointGatePayloadInput {
  negotiationId: string;
  agentIds: string[];
  currentRequestedKwh: number;
  intervalMinutes: number;
  agents: JointGatePayloadAgent[];
  buses: JointGatePayloadBus[];
  lines: JointGatePayloadLine[];
}

export interface JointGatePayload {
  negotiationId: string;
  coalition: string[];
  profiles: Record<string, unknown>;
  nodes: Array<{
    id: string;
    voltage_level_kv: number;
    is_slack: boolean;
    p_load_kw: number;
    p_gen_kw: number;
  }>;
  lines: Array<{
    id: string;
    from_node: string;
    to_node: string;
    r_ohms: number;
    x_ohms: number;
    thermal_limit_kw: number;
  }>;
}

function sumRatedPower(agent: JointGatePayloadAgent): number {
  return agent.ders.reduce((total, der) => total + der.ratedPowerKw, 0);
}

function assertFinitePositive(value: number | null, message: string): number {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
  return value;
}

export function buildJointGatePayload(input: BuildJointGatePayloadInput): JointGatePayload {
  const coalition: string[] = [];
  const profiles: Record<string, unknown> = {};
  const sellerCapacities = new Map<string, number>();
  const buyerCapacities = new Map<string, number>();

  let totalSellerCapacity = 0;
  let totalBuyerCapacity = 0;

  for (const agent of input.agents) {
    coalition.push(agent.id);
    const capacity = sumRatedPower(agent);
    const type = agent.type.toUpperCase();

    if (type === "SELLER") {
      sellerCapacities.set(agent.microgridId, capacity);
      totalSellerCapacity += capacity;
      profiles[agent.id] = {
        type: "seller",
        generation_cost: agent.hiddenGenerationCost,
        available_capacity: capacity,
        outside_option: 0.0,
      };
    } else {
      const energyValue = assertFinitePositive(
        agent.maximumPreferredBuyPrice,
        `Buyer ${agent.id} has no maximumPreferredBuyPrice trading preference`
      );
      buyerCapacities.set(agent.microgridId, capacity);
      totalBuyerCapacity += capacity;
      profiles[agent.id] = {
        type: "buyer",
        energy_value: energyValue,
        demand: input.currentRequestedKwh,
        outside_option: 0.0,
      };
    }
  }

  const powerKw = input.currentRequestedKwh / (input.intervalMinutes / 60.0);
  const nodes = input.buses.map((bus, index) => {
    let p_gen_kw = 0;
    let p_load_kw = 0;

    for (const microgridId of bus.microgridIds) {
      if (sellerCapacities.has(microgridId) && totalSellerCapacity > 0) {
        p_gen_kw += powerKw * (sellerCapacities.get(microgridId)! / totalSellerCapacity);
      }
      if (buyerCapacities.has(microgridId) && totalBuyerCapacity > 0) {
        p_load_kw += powerKw * (buyerCapacities.get(microgridId)! / totalBuyerCapacity);
      }
    }

    return {
      id: bus.id,
      voltage_level_kv: bus.voltageLevelKv,
      is_slack: index === 0,
      p_load_kw,
      p_gen_kw,
    };
  });

  const lines = input.lines.map((line) => ({
    id: line.id,
    from_node: line.fromBusId,
    to_node: line.toBusId,
    r_ohms: line.resistance,
    x_ohms: line.reactance,
    thermal_limit_kw: line.thermalLimitKw,
  }));

  return {
    negotiationId: input.negotiationId,
    coalition,
    profiles,
    nodes,
    lines,
  };
}
