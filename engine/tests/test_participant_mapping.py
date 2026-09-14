"""
engine/tests/test_participant_mapping.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tests for Prompt 5: Participant → DER → Bus Electrical Binding.

All tests use hand-constructed, deterministic scenarios so results are
analytically verifiable without running a full power-flow solver.
"""

from __future__ import annotations

import time
import pytest

from app.grid.participant_mapping import (
    DERRecord,
    DERRegistry,
    BusResolutionError,
    DERResolutionError,
    DERUnavailableError,
    DuplicateDERMappingError,
    PowerLimitExceededError,
    SOCViolationError,
    StaleTelemetryError,
    apply_injections_to_network,
    resolve_trade_to_injections,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def registry() -> DERRegistry:
    """A fresh DERRegistry with two participants."""
    reg = DERRegistry()
    reg.register(
        DERRecord(
            der_id="der-solar-A",
            participant_id="p-A",
            bus_id="bus-1",
            resource_type="SOLAR_PV",
            p_max_kw=100.0,
            p_min_kw=0.0,
            telemetry_ts=time.time(),
        )
    )
    reg.register(
        DERRecord(
            der_id="der-load-B",
            participant_id="p-B",
            bus_id="bus-2",
            resource_type="LOAD",
            p_max_kw=0.0,
            p_min_kw=-80.0,  # Can consume up to 80 kW
            telemetry_ts=time.time(),
        )
    )
    return reg


@pytest.fixture
def battery_registry() -> DERRegistry:
    """Registry with a battery DER."""
    reg = DERRegistry()
    reg.register(
        DERRecord(
            der_id="der-bat-A",
            participant_id="p-bat",
            bus_id="bus-1",
            resource_type="BATTERY",
            p_max_kw=50.0,
            p_min_kw=-50.0,
            capacity_kwh=100.0,
            soc=0.5,          # 50% → 50 kWh stored
            soc_min=0.1,
            soc_max=0.9,
            telemetry_ts=time.time(),
        )
    )
    reg.register(
        DERRecord(
            der_id="der-load-C",
            participant_id="p-C",
            bus_id="bus-2",
            resource_type="LOAD",
            p_max_kw=0.0,
            p_min_kw=-40.0,
            telemetry_ts=time.time(),
        )
    )
    return reg


# ─── Happy path ───────────────────────────────────────────────────────────────


class TestHappyPath:
    def test_valid_trade_produces_injection_pair(self, registry: DERRegistry) -> None:
        result = resolve_trade_to_injections(
            seller_participant_id="p-A",
            buyer_participant_id="p-B",
            traded_kwh=50.0,
            registry=registry,
            known_bus_ids={"bus-1", "bus-2"},
        )
        assert result.traded_kwh == 50.0
        assert result.seller_injection.bus_id == "bus-1"
        assert result.buyer_injection.bus_id == "bus-2"

    def test_seller_injection_is_positive(self, registry: DERRegistry) -> None:
        """Seller injects power into the grid → positive delta_p."""
        result = resolve_trade_to_injections("p-A", "p-B", 30.0, registry)
        assert result.seller_injection.delta_p_kw > 0
        assert result.seller_injection.delta_p_kw == pytest.approx(30.0)

    def test_buyer_injection_is_negative(self, registry: DERRegistry) -> None:
        """Buyer draws power from the grid → negative delta_p."""
        result = resolve_trade_to_injections("p-A", "p-B", 30.0, registry)
        assert result.buyer_injection.delta_p_kw < 0
        assert result.buyer_injection.delta_p_kw == pytest.approx(-30.0)

    def test_participant_ids_preserved(self, registry: DERRegistry) -> None:
        result = resolve_trade_to_injections("p-A", "p-B", 10.0, registry)
        assert result.seller_injection.participant_id == "p-A"
        assert result.buyer_injection.participant_id == "p-B"

    def test_der_ids_resolved(self, registry: DERRegistry) -> None:
        result = resolve_trade_to_injections("p-A", "p-B", 10.0, registry)
        assert result.seller_injection.der_id == "der-solar-A"
        assert result.buyer_injection.der_id == "der-load-B"

    def test_apply_injections_to_network(self, registry: DERRegistry) -> None:
        result = resolve_trade_to_injections("p-A", "p-B", 40.0, registry)
        baseline_gen = {"bus-1": 20.0, "bus-2": 0.0}
        baseline_load = {"bus-1": 0.0, "bus-2": 10.0}
        new_gen, new_load = apply_injections_to_network(
            baseline_gen, baseline_load, [result.seller_injection, result.buyer_injection]
        )
        # Seller adds +40 to bus-1 generation
        assert new_gen["bus-1"] == pytest.approx(60.0)
        # Buyer adds +40 to bus-2 load
        assert new_load["bus-2"] == pytest.approx(50.0)


# ─── Nonexistent DER ──────────────────────────────────────────────────────────


class TestNonexistentDER:
    def test_unknown_seller_raises(self, registry: DERRegistry) -> None:
        with pytest.raises(DERResolutionError, match="no registered DERs"):
            resolve_trade_to_injections("unknown-seller", "p-B", 10.0, registry)

    def test_unknown_buyer_raises(self, registry: DERRegistry) -> None:
        with pytest.raises(DERResolutionError, match="no registered DERs"):
            resolve_trade_to_injections("p-A", "unknown-buyer", 10.0, registry)

    def test_get_der_unknown_raises(self, registry: DERRegistry) -> None:
        with pytest.raises(DERResolutionError, match="not found"):
            registry.get_der("does-not-exist")


# ─── Nonexistent bus ──────────────────────────────────────────────────────────


class TestNonexistentBus:
    def test_seller_wrong_bus_raises(self, registry: DERRegistry) -> None:
        with pytest.raises(BusResolutionError, match="bus-1"):
            resolve_trade_to_injections(
                "p-A", "p-B", 10.0, registry,
                known_bus_ids={"bus-99", "bus-2"},  # bus-1 not in network
            )

    def test_buyer_wrong_bus_raises(self, registry: DERRegistry) -> None:
        with pytest.raises(BusResolutionError, match="bus-2"):
            resolve_trade_to_injections(
                "p-A", "p-B", 10.0, registry,
                known_bus_ids={"bus-1", "bus-99"},  # bus-2 not in network
            )

    def test_no_known_bus_ids_skips_validation(self, registry: DERRegistry) -> None:
        """When known_bus_ids is None, bus validation is skipped (backward compat)."""
        result = resolve_trade_to_injections("p-A", "p-B", 10.0, registry, known_bus_ids=None)
        assert result.traded_kwh == 10.0


# ─── Duplicate mapping ────────────────────────────────────────────────────────


class TestDuplicateMapping:
    def test_duplicate_der_id_raises_on_register(self) -> None:
        reg = DERRegistry()
        der = DERRecord(
            der_id="dup", participant_id="p", bus_id="bus-1",
            resource_type="SOLAR_PV", p_max_kw=10.0, telemetry_ts=time.time(),
        )
        reg.register(der)
        with pytest.raises(DuplicateDERMappingError, match="already registered"):
            reg.register(der)

    def test_multiple_ders_per_participant_raises_without_aggregation(self) -> None:
        reg = DERRegistry(allow_aggregation=False)
        reg.register(DERRecord("d1", "p", "bus-1", "SOLAR_PV", 10.0, telemetry_ts=time.time()))
        reg.register(DERRecord("d2", "p", "bus-2", "WIND", 20.0, telemetry_ts=time.time()))
        with pytest.raises(DuplicateDERMappingError, match="maps to 2 DERs"):
            reg.resolve_participant("p")

    def test_multiple_ders_per_participant_allowed_with_aggregation(self) -> None:
        reg = DERRegistry(allow_aggregation=True)
        reg.register(DERRecord("d1", "p", "bus-1", "SOLAR_PV", 10.0, telemetry_ts=time.time()))
        reg.register(DERRecord("d2", "p", "bus-2", "WIND", 20.0, telemetry_ts=time.time()))
        ders = reg.resolve_participant("p")
        assert len(ders) == 2


# ─── Stale telemetry ──────────────────────────────────────────────────────────


class TestStaleTelemetry:
    def test_stale_seller_raises(self) -> None:
        reg = DERRegistry()
        reg.register(DERRecord(
            "der-old", "p-old", "bus-1", "SOLAR_PV", 100.0,
            telemetry_ts=time.time() - 600,  # 10 minutes old
        ))
        reg.register(DERRecord("der-fresh", "p-B", "bus-2", "LOAD", 0.0, p_min_kw=-50.0,
                               telemetry_ts=time.time()))
        with pytest.raises(StaleTelemetryError, match="600"):
            resolve_trade_to_injections("p-old", "p-B", 10.0, reg, freshness_window_s=300.0)


# ─── Unavailable DER ──────────────────────────────────────────────────────────


class TestDERUnavailable:
    def test_unavailable_seller_raises(self, registry: DERRegistry) -> None:
        reg = DERRegistry()
        reg.register(DERRecord(
            "der-offline", "p-offline", "bus-1", "SOLAR_PV", 100.0,
            available=False, telemetry_ts=time.time(),
        ))
        reg.register(DERRecord("der-load-B", "p-B", "bus-2", "LOAD", 0.0, p_min_kw=-80.0,
                               telemetry_ts=time.time()))
        with pytest.raises(DERUnavailableError, match="unavailable"):
            resolve_trade_to_injections("p-offline", "p-B", 10.0, reg)


# ─── Power beyond limits ──────────────────────────────────────────────────────


class TestPowerLimits:
    def test_seller_exceeds_p_max(self, registry: DERRegistry) -> None:
        with pytest.raises(PowerLimitExceededError, match="P_max"):
            resolve_trade_to_injections("p-A", "p-B", 150.0, registry)  # p_max=100

    def test_buyer_exceeds_consumption_limit(self, registry: DERRegistry) -> None:
        with pytest.raises(PowerLimitExceededError, match="P_min"):
            resolve_trade_to_injections("p-A", "p-B", 90.0, registry)  # buyer p_min=-80

    def test_zero_trade_is_valid(self, registry: DERRegistry) -> None:
        result = resolve_trade_to_injections("p-A", "p-B", 0.0, registry)
        assert result.traded_kwh == 0.0

    def test_negative_traded_kwh_raises(self, registry: DERRegistry) -> None:
        with pytest.raises(ValueError, match="non-negative"):
            resolve_trade_to_injections("p-A", "p-B", -5.0, registry)


# ─── Storage SOC violation ────────────────────────────────────────────────────


class TestSOCViolation:
    def test_discharge_beyond_soc_min_raises(self, battery_registry: DERRegistry) -> None:
        """Battery has 50 kWh. Discharging 50 kW for 1h would reach 0% SOC (below soc_min=10%)."""
        with pytest.raises(SOCViolationError, match="SOC"):
            resolve_trade_to_injections("p-bat", "p-C", 50.0, battery_registry)

    def test_discharge_within_soc_limits_succeeds(self, battery_registry: DERRegistry) -> None:
        """Discharging 30 kW for 1h → 50-30=20 kWh → SOC 20% ≥ soc_min 10%."""
        result = resolve_trade_to_injections("p-bat", "p-C", 30.0, battery_registry)
        assert result.seller_injection.delta_p_kw == pytest.approx(30.0)

    def test_charge_beyond_soc_max_raises(self, battery_registry: DERRegistry) -> None:
        """Charging at 50 kW for 1h → 50+50=100 kWh → SOC 100% > soc_max 90%."""
        # Make battery the buyer (charging scenario)
        reg = DERRegistry()
        reg.register(DERRecord(
            "der-bat-A", "p-bat", "bus-1", "BATTERY", 50.0, p_min_kw=-50.0,
            capacity_kwh=100.0, soc=0.5, soc_min=0.1, soc_max=0.9,
            telemetry_ts=time.time(),
        ))
        reg.register(DERRecord(
            "der-solar-X", "p-solar", "bus-2", "SOLAR_PV", 60.0,
            telemetry_ts=time.time(),
        ))
        # Seller sells 50 kW to battery → battery charges → SOC violation
        with pytest.raises((SOCViolationError, PowerLimitExceededError)):
            resolve_trade_to_injections("p-solar", "p-bat", 50.0, reg)
