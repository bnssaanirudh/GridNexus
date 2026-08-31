/** Runtime-safe adapters for the API shapes currently supported by GridNexus. */

export class ContractError extends Error {
  constructor(resource: string) {
    super(`The ${resource} service returned an unsupported response shape.`);
    this.name = "ContractError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function collection(payload: unknown, key: string, resource: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  const wrapped = record(payload)?.[key];
  if (Array.isArray(wrapped)) return wrapped;
  throw new ContractError(resource);
}

export interface OracleSignalDto {
  id: string;
  signalData: unknown;
  createdAt: string;
  beliefUpdates?: Array<{ id: string; posterior: number; confidence: number; hypothesis?: string; decisionSource: string }>;
  ragContext?: Array<{ sourceType: string; sourceName?: string; synthetic?: boolean; trustScore?: number }>;
}

export function normalizeOracleSignals(payload: unknown): OracleSignalDto[] {
  return collection(payload, "signals", "oracle signals").flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    const signalData = item.signalData ?? {
      type: item.type,
      severity: item.severity,
      message: item.message,
      synthetic: item.synthetic,
    };
    return [{
      id: stringValue(item.id, `signal-${index + 1}`),
      signalData,
      createdAt: stringValue(item.createdAt ?? item.timestamp),
      beliefUpdates: Array.isArray(item.beliefUpdates) ? item.beliefUpdates as OracleSignalDto["beliefUpdates"] : undefined,
      ragContext: Array.isArray(item.ragContext) ? item.ragContext as OracleSignalDto["ragContext"] : undefined,
    }];
  });
}

export interface CoalitionDto {
  id: string;
  name?: string;
  members: string[];
  memberCount: number;
  value?: number;
  epsilon?: number;
  stability?: number;
  currency?: string;
  status?: string;
}

export function normalizeCoalitions(payload: unknown): CoalitionDto[] {
  return collection(payload, "coalitions", "coalitions").flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    const members = Array.isArray(item.members)
      ? item.members.map((member) => stringValue(record(member)?.id ?? member)).filter(Boolean)
      : [];
    return [{
      id: stringValue(item.id, `coalition-${index + 1}`),
      name: stringValue(item.name) || undefined,
      members,
      memberCount: finiteNumber(item.memberCount ?? item.members) ?? members.length,
      value: finiteNumber(item.value),
      epsilon: finiteNumber(item.epsilon),
      stability: finiteNumber(item.stability),
      currency: stringValue(item.currency) || undefined,
      status: stringValue(item.status) || undefined,
    }];
  });
}

export interface SettlementDto {
  id: string;
  status: string;
  sellerMicrogridId?: string;
  buyerMicrogridId?: string;
  energyKwh?: number;
  pricePerKwh?: number;
  amount?: number;
  currency?: string;
  deliveryStart?: string;
  createdAt?: string;
}

export function normalizeSettlements(payload: unknown): SettlementDto[] {
  return collection(payload, "settlements", "settlements").flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    return [{
      id: stringValue(item.id, `settlement-${index + 1}`),
      status: stringValue(item.status, "UNKNOWN"),
      sellerMicrogridId: stringValue(item.sellerMicrogridId ?? item.seller) || undefined,
      buyerMicrogridId: stringValue(item.buyerMicrogridId ?? item.buyer) || undefined,
      energyKwh: finiteNumber(item.energyKwh),
      pricePerKwh: finiteNumber(item.pricePerKwh),
      amount: finiteNumber(item.amount),
      currency: stringValue(item.currency) || undefined,
      deliveryStart: stringValue(item.deliveryStart) || undefined,
      createdAt: stringValue(item.createdAt ?? item.timestamp) || undefined,
    }];
  });
}

export interface AuditEventDto {
  id: string;
  sequence: number;
  eventType: string;
  negotiationId?: string;
  actorId?: string;
  previousHash: string;
  eventHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
  verifiable: boolean;
}

export function normalizeAuditEvents(payload: unknown): AuditEventDto[] {
  return collection(payload, "events", "audit events").flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    const eventHash = stringValue(item.eventHash ?? item.hash);
    const previousHash = stringValue(item.previousHash);
    const eventPayload = record(item.payload) ?? {};
    return [{
      id: stringValue(item.id, `event-${index + 1}`),
      sequence: finiteNumber(item.sequence) ?? index,
      eventType: stringValue(item.eventType ?? item.type, "UNKNOWN_EVENT"),
      negotiationId: stringValue(item.negotiationId) || undefined,
      actorId: stringValue(item.actorId) || undefined,
      previousHash,
      eventHash,
      payload: eventPayload,
      createdAt: stringValue(item.createdAt ?? item.timestamp),
      verifiable: /^[a-f0-9]{64}$/i.test(eventHash) && (previousHash === "0" || /^[a-f0-9]{64}$/i.test(previousHash)),
    }];
  });
}

export interface DerDto {
  id: string;
  microgridId?: string;
  type: string;
  ratedPowerKw?: number;
  maxPowerKw?: number;
  minPowerKw?: number;
  efficiency?: number;
  energyCapacityKwh?: number;
  location?: string;
  status?: string;
}

export function normalizeDers(payload: unknown): DerDto[] {
  return collection(payload, "ders", "DER assets").flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    return [{
      id: stringValue(item.id, `der-${index + 1}`),
      microgridId: stringValue(item.microgridId) || undefined,
      type: stringValue(item.type, "OTHER").toUpperCase(),
      ratedPowerKw: finiteNumber(item.ratedPowerKw ?? item.capacity),
      maxPowerKw: finiteNumber(item.maxPowerKw),
      minPowerKw: finiteNumber(item.minPowerKw),
      efficiency: finiteNumber(item.efficiency),
      energyCapacityKwh: finiteNumber(item.energyCapacityKwh),
      location: stringValue(item.location) || undefined,
      status: stringValue(item.status) || undefined,
    }];
  });
}

export interface BusDto { id: string; externalCode?: string; voltageLevelKv?: number; latitude?: number; longitude?: number }
export interface LineDto { id: string; fromBusId: string; toBusId: string; thermalLimitKw?: number; resistance?: number; reactance?: number; active: boolean; utilization?: number }
export interface TopologyDto { buses: BusDto[]; lines: LineDto[]; topologyVersion?: number }

export function normalizeTopology(payload: unknown): TopologyDto {
  const root = record(payload);
  if (!root) throw new ContractError("topology");
  const rawBuses = Array.isArray(root.buses) ? root.buses : Array.isArray(root.nodes) ? root.nodes : null;
  const rawLines = Array.isArray(root.lines) ? root.lines : Array.isArray(root.links) ? root.links : null;
  if (!rawBuses || !rawLines) throw new ContractError("topology");

  const buses = rawBuses.flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    return [{
      id: stringValue(item.id, `bus-${index + 1}`),
      externalCode: stringValue(item.externalCode ?? item.label) || undefined,
      voltageLevelKv: finiteNumber(item.voltageLevelKv),
      latitude: finiteNumber(item.latitude),
      longitude: finiteNumber(item.longitude),
    }];
  });
  const lines = rawLines.flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    const source = record(item.source)?.id ?? item.source;
    const target = record(item.target)?.id ?? item.target;
    const fromBusId = stringValue(item.fromBusId ?? item.from ?? source);
    const toBusId = stringValue(item.toBusId ?? item.to ?? target);
    if (!fromBusId || !toBusId) return [];
    return [{
      id: stringValue(item.id, `line-${index + 1}`),
      fromBusId,
      toBusId,
      thermalLimitKw: finiteNumber(item.thermalLimitKw ?? item.capacity),
      resistance: finiteNumber(item.resistance),
      reactance: finiteNumber(item.reactance),
      active: item.active !== false,
      utilization: finiteNumber(item.utilization ?? item.utilizationPct ?? item.utilization_pct),
    }];
  });
  return { buses, lines, topologyVersion: finiteNumber(root.topologyVersion) };
}

