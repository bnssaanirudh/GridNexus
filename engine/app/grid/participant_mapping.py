"""
engine/app/grid/participant_mapping.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prompt 5 — Participant → DER → Bus Electrical Binding

Implements a rigorous mapping from market participant IDs to physical
Distributed Energy Resources (DERs) and electrical bus injection vectors.

DESIGN CONTRACT
───────────────
Every market trade that passes through GridNexus must produce physically
meaningful electrical injections before grid verification is run.

Flow:
    seller/buyer participant_id
    → resolve DER record(s)
    → compute active power injection delta (kW)
    → reactive power delta (kVAR) where applicable
    → assign to bus_id
    → return BusInjection(bus_id, delta_p_kw, delta_q_kvar)

VALIDATION RULES (Prompt 5 requirements)
─────────────────────────────────────────
- Nonexistent DER       → raises DERResolutionError
- Nonexistent bus       → raises BusResolutionError
- Duplicate mapping     → raises DuplicateDERMappingError
- Stale telemetry       → raises StaleTelemetryError
- Unavailable DER       → raises DERUnavailableError
- Power beyond limits   → raises PowerLimitExceededError
- Storage SOC violation → raises SOCViolationError
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Literal


# ─── Domain errors ────────────────────────────────────────────────────────────


class ParticipantMappingError(Exception):
    """Base class for all mapping errors."""


class DERResolutionError(ParticipantMappingError):
    """Raised when a participant_id cannot be mapped to any DER."""


class BusResolutionError(ParticipantMappingError):
    """Raised when a DER cannot be mapped to a bus_id in the network model."""


class DuplicateDERMappingError(ParticipantMappingError):
    """Raised when a participant maps to multiple DERs without a declared aggregation policy."""


class StaleTelemetryError(ParticipantMappingError):
    """Raised when the telemetry timestamp on a DER record exceeds freshness_window_s."""


class DERUnavailableError(ParticipantMappingError):
    """Raised when the DER availability flag is False or scheduled maintenance."""


class PowerLimitExceededError(ParticipantMappingError):
    """Raised when requested kW exceeds DER's active P limit."""


class SOCViolationError(ParticipantMappingError):
    """Raised when requested dispatch would take a storage DER outside SOC bounds."""


# ─── Data models ──────────────────────────────────────────────────────────────


@dataclass
class DERRecord:
    """Physical specification of a single Distributed Energy Resource.

    Attributes
    ----------
    der_id          Unique DER identifier.
    participant_id  Owner participant.
    bus_id          Bus to which this DER is electrically connected.
    resource_type   One of: SOLAR_PV, WIND, BATTERY, CHP, LOAD, EV.
    p_max_kw        Maximum active power output (kW). Positive = injection.
    p_min_kw        Minimum active power output (kW). Can be negative for loads.
    q_max_kvar      Maximum reactive power injection (kVAR).
    q_min_kvar      Minimum reactive power injection (kVAR).
    soc             Current state-of-charge [0, 1]. Only meaningful for BATTERY / EV.
    soc_min         Minimum allowed SOC fraction [0, 1].
    soc_max         Maximum allowed SOC fraction [0, 1].
    capacity_kwh    Energy capacity (kWh). Only meaningful for storage resources.
    available       True when the DER is online and dispatchable.
    telemetry_ts    Unix timestamp of the last telemetry update.
    """

    der_id: str
    participant_id: str
    bus_id: str
    resource_type: Literal["SOLAR_PV", "WIND", "BATTERY", "CHP", "LOAD", "EV"]
    p_max_kw: float
    p_min_kw: float = 0.0
    q_max_kvar: float = 0.0
    q_min_kvar: float = 0.0
    soc: float = 1.0
    soc_min: float = 0.0
    soc_max: float = 1.0
    capacity_kwh: float = 0.0
    available: bool = True
    telemetry_ts: float = field(default_factory=time.time)


@dataclass
class BusInjection:
    """Physical power injection at a specific electrical bus.

    Produced by resolving a trade proposal through DER mapping.

    Attributes
    ----------
    bus_id          Electrical bus identifier.
    delta_p_kw      Change in active power injection at the bus (kW).
                    Positive = additional generation / export from this bus.
                    Negative = additional load / import at this bus.
    delta_q_kvar    Change in reactive power injection (kVAR). Zero for DC studies.
    der_id          DER that produced this injection.
    participant_id  Participant who owns the DER.
    resource_type   Type of the DER resource.
    """

    bus_id: str
    delta_p_kw: float
    delta_q_kvar: float
    der_id: str
    participant_id: str
    resource_type: str


@dataclass
class TradeInjectionPair:
    """Pair of bus injections produced from a bilateral trade.

    Attributes
    ----------
    seller_injection  Bus injection representing the seller's energy dispatch.
    buyer_injection   Bus injection representing the buyer's energy consumption.
    traded_kwh        Agreed energy quantity (kWh, non-negative).
    """

    seller_injection: BusInjection
    buyer_injection: BusInjection
    traded_kwh: float


# ─── DER Registry ─────────────────────────────────────────────────────────────


class DERRegistry:
    """In-memory registry of DER records, indexed by participant_id and der_id.

    In production this would be backed by the broker's database via the
    authenticated internal API contract (see docs/research/current_state_audit.md §P1-1).

    Raises
    ------
    DuplicateDERMappingError
        If a participant_id maps to multiple DERs and aggregation is not allowed.
    """

    def __init__(self, allow_aggregation: bool = False) -> None:
        self._by_participant: dict[str, list[DERRecord]] = {}
        self._by_der: dict[str, DERRecord] = {}
        self._allow_aggregation = allow_aggregation

    def register(self, record: DERRecord) -> None:
        """Register a DER record. Duplicate der_id is rejected."""
        if record.der_id in self._by_der:
            raise DuplicateDERMappingError(
                f"DER '{record.der_id}' already registered."
            )
        self._by_der[record.der_id] = record
        self._by_participant.setdefault(record.participant_id, []).append(record)

    def resolve_participant(self, participant_id: str) -> list[DERRecord]:
        """Return all DERs owned by participant_id.

        Raises DERResolutionError if the participant has no registered DERs.
        Raises DuplicateDERMappingError if multiple DERs exist and aggregation is disabled.
        """
        records = self._by_participant.get(participant_id)
        if not records:
            raise DERResolutionError(
                f"Participant '{participant_id}' has no registered DERs."
            )
        if len(records) > 1 and not self._allow_aggregation:
            raise DuplicateDERMappingError(
                f"Participant '{participant_id}' maps to {len(records)} DERs. "
                "Set allow_aggregation=True to permit aggregated dispatch."
            )
        return records

    def get_der(self, der_id: str) -> DERRecord:
        """Return the DERRecord for der_id.

        Raises DERResolutionError if not found.
        """
        der = self._by_der.get(der_id)
        if der is None:
            raise DERResolutionError(f"DER '{der_id}' not found in registry.")
        return der


# ─── Mapping logic ────────────────────────────────────────────────────────────


def _validate_der(
    der: DERRecord,
    requested_kw: float,
    freshness_window_s: float = 300.0,
) -> None:
    """Validate a DER record against the requested dispatch quantity.

    Parameters
    ----------
    der               DER record to validate.
    requested_kw      Requested active power (kW). Positive = dispatch/export.
    freshness_window_s
                      Maximum age of telemetry_ts before StaleTelemetryError.

    Raises
    ------
    StaleTelemetryError       Telemetry too old.
    DERUnavailableError       DER is offline.
    PowerLimitExceededError   |requested_kw| exceeds DER limits.
    SOCViolationError         Storage would leave SOC bounds.
    """
    now = time.time()
    age_s = now - der.telemetry_ts
    if age_s > freshness_window_s:
        raise StaleTelemetryError(
            f"DER '{der.der_id}' telemetry is {age_s:.0f}s old "
            f"(freshness window: {freshness_window_s}s)."
        )

    if not der.available:
        raise DERUnavailableError(
            f"DER '{der.der_id}' is marked unavailable."
        )

    if requested_kw > der.p_max_kw + 1e-6:
        raise PowerLimitExceededError(
            f"Requested {requested_kw:.2f} kW exceeds DER '{der.der_id}' "
            f"P_max={der.p_max_kw:.2f} kW."
        )
    if requested_kw < der.p_min_kw - 1e-6:
        raise PowerLimitExceededError(
            f"Requested {requested_kw:.2f} kW is below DER '{der.der_id}' "
            f"P_min={der.p_min_kw:.2f} kW."
        )

    # SOC check for storage resources
    if der.resource_type in ("BATTERY", "EV") and der.capacity_kwh > 0:
        # Positive requested_kw = discharge. Energy removed from storage.
        # Assume 1-hour dispatch period if not specified.
        soc_delta = -requested_kw / der.capacity_kwh  # fraction per hour
        new_soc = der.soc + soc_delta
        if new_soc < der.soc_min - 1e-6:
            raise SOCViolationError(
                f"Dispatch of {requested_kw:.2f} kW for 1h would take DER "
                f"'{der.der_id}' SOC to {new_soc:.3f} (minimum: {der.soc_min:.3f})."
            )
        if new_soc > der.soc_max + 1e-6:
            raise SOCViolationError(
                f"Charging {abs(requested_kw):.2f} kW for 1h would take DER "
                f"'{der.der_id}' SOC to {new_soc:.3f} (maximum: {der.soc_max:.3f})."
            )


def resolve_trade_to_injections(
    seller_participant_id: str,
    buyer_participant_id: str,
    traded_kwh: float,
    registry: DERRegistry,
    known_bus_ids: set[str] | None = None,
    freshness_window_s: float = 300.0,
) -> TradeInjectionPair:
    """Resolve a bilateral trade into physical bus injections.

    This is the primary entry point for the physical trade validation pipeline.

    Parameters
    ----------
    seller_participant_id
        ID of the energy seller.
    buyer_participant_id
        ID of the energy buyer.
    traded_kwh
        Agreed energy quantity (kWh ≥ 0). Treated as active power for 1-h intervals.
    registry
        DERRegistry containing DER records for all known participants.
    known_bus_ids
        Optional set of valid bus IDs from the network model. If provided,
        BusResolutionError is raised for any DER not connected to a known bus.
    freshness_window_s
        Maximum telemetry age in seconds before the mapping is rejected.

    Returns
    -------
    TradeInjectionPair
        Seller and buyer bus injections plus confirmed traded quantity.

    Raises
    ------
    DERResolutionError, BusResolutionError, StaleTelemetryError,
    DERUnavailableError, PowerLimitExceededError, SOCViolationError,
    DuplicateDERMappingError
    """
    if traded_kwh < 0:
        raise ValueError(f"traded_kwh must be non-negative, got {traded_kwh}.")

    # Resolve seller DER
    seller_ders = registry.resolve_participant(seller_participant_id)
    seller_der = seller_ders[0]  # Single DER or aggregated primary

    # Resolve buyer DER
    buyer_ders = registry.resolve_participant(buyer_participant_id)
    buyer_der = buyer_ders[0]

    # Validate bus membership
    if known_bus_ids is not None:
        if seller_der.bus_id not in known_bus_ids:
            raise BusResolutionError(
                f"Seller DER '{seller_der.der_id}' bus '{seller_der.bus_id}' "
                "is not in the network model."
            )
        if buyer_der.bus_id not in known_bus_ids:
            raise BusResolutionError(
                f"Buyer DER '{buyer_der.der_id}' bus '{buyer_der.bus_id}' "
                "is not in the network model."
            )

    # Validate dispatch quantities
    _validate_der(seller_der, traded_kwh, freshness_window_s)
    # Buyer consumes → negative injection from grid perspective
    # Use p_min for demand-side flexibility (load shifting), accept |traded_kwh|
    _validate_der(buyer_der, -traded_kwh, freshness_window_s)

    seller_injection = BusInjection(
        bus_id=seller_der.bus_id,
        delta_p_kw=+traded_kwh,    # Positive: seller injects into grid
        delta_q_kvar=0.0,
        der_id=seller_der.der_id,
        participant_id=seller_participant_id,
        resource_type=seller_der.resource_type,
    )
    buyer_injection = BusInjection(
        bus_id=buyer_der.bus_id,
        delta_p_kw=-traded_kwh,    # Negative: buyer draws from grid
        delta_q_kvar=0.0,
        der_id=buyer_der.der_id,
        participant_id=buyer_participant_id,
        resource_type=buyer_der.resource_type,
    )

    return TradeInjectionPair(
        seller_injection=seller_injection,
        buyer_injection=buyer_injection,
        traded_kwh=traded_kwh,
    )


def apply_injections_to_network(
    network_p_gen: dict[str, float],
    network_p_load: dict[str, float],
    injections: list[BusInjection],
) -> tuple[dict[str, float], dict[str, float]]:
    """Apply a list of BusInjection deltas to a baseline network state.

    Parameters
    ----------
    network_p_gen   Baseline generation per bus (kW), {bus_id: kW}.
    network_p_load  Baseline load per bus (kW), {bus_id: kW}.
    injections      List of BusInjection objects to apply.

    Returns
    -------
    (new_p_gen, new_p_load)
        Updated generation and load dictionaries after applying all injections.
    """
    new_gen = dict(network_p_gen)
    new_load = dict(network_p_load)

    for inj in injections:
        bid = inj.bus_id
        if inj.delta_p_kw >= 0:
            new_gen[bid] = new_gen.get(bid, 0.0) + inj.delta_p_kw
        else:
            new_load[bid] = new_load.get(bid, 0.0) + abs(inj.delta_p_kw)

    return new_gen, new_load
