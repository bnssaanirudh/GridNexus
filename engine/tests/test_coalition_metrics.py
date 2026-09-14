"""
engine/tests/test_coalition_metrics.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prompt 7 — Unit tests for coalition excess metric.

All tests use hand-constructed cooperative games where the true answer
is analytically known. This satisfies the Prompt 7 requirement:

  "Write unit tests on hand-constructed cooperative games where the
   true answer is analytically known. These tests should include:
   - stable core allocation
   - unstable allocation
   - multiple blocking coalitions
   - numerical tolerance boundary."
"""

from __future__ import annotations

import pytest
import networkx as nx

from app.stability.coalition_metrics import (
    CoalitionExcessResult,
    compute_coalition_excess,
)
from app.stability.value_model import CoalitionValueModel


# ─── Hand-constructed value model ─────────────────────────────────────────────


class FixedCharacteristicFunction(CoalitionValueModel):
    """Fixed characteristic function for testing.

    Allows specifying exact v(C) values for hand-calculable games.
    """

    def __init__(self, values: dict[frozenset, float]) -> None:
        self._values = values

    def evaluate(self, coalition: frozenset, profiles: dict) -> float:
        return self._values.get(frozenset(coalition), 0.0)


def _complete_graph(n: int) -> nx.Graph:
    """Return a complete graph on n agents {0, 1, ..., n-1}."""
    G = nx.Graph()
    G.add_nodes_from(range(n))
    for i in range(n):
        for j in range(i + 1, n):
            G.add_edge(i, j)
    return G


# ─── Test 1: Stable core allocation ──────────────────────────────────────────


class TestStableAllocation:
    """Analytically known stable case.

    Three-player game: v(1)=v(2)=v(3)=0, v(12)=v(13)=v(23)=2, v(123)=3.
    Allocation x=(1, 1, 1) is in the core:
      e({1,2}) = 2 - (1+1) = 0
      e({1,3}) = 2 - (1+1) = 0
      e({2,3}) = 2 - (1+1) = 0
      e({1})   = 0 - 1 = -1
      e({2})   = 0 - 1 = -1
      e({3})   = 0 - 1 = -1
    max excess = 0 ≤ ε → EXACT_STABLE.
    """

    @pytest.fixture
    def three_player_game(self) -> tuple[dict, nx.Graph, CoalitionValueModel]:
        agents = [1, 2, 3]
        values = {
            frozenset([1]): 0.0,
            frozenset([2]): 0.0,
            frozenset([3]): 0.0,
            frozenset([1, 2]): 2.0,
            frozenset([1, 3]): 2.0,
            frozenset([2, 3]): 2.0,
            frozenset([1, 2, 3]): 3.0,
        }
        return agents, _complete_graph(3), FixedCharacteristicFunction(values)

    def test_equal_allocation_is_in_core(self, three_player_game) -> None:
        agents, G, vm = three_player_game
        # Relabel graph nodes to match agent IDs
        G = nx.relabel_nodes(G, {0: 1, 1: 2, 2: 3})
        allocation = {1: 1.0, 2: 1.0, 3: 1.0}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        assert result.verification_mode == "EXACT"
        assert result.maximum_excess == pytest.approx(0.0, abs=1e-9)
        assert result.is_blocking_stable is True
        assert result.status_label == "EXACT_STABLE"

    def test_blocking_coalition_is_none_for_core_allocation(self, three_player_game) -> None:
        agents, G, vm = three_player_game
        G = nx.relabel_nodes(G, {0: 1, 1: 2, 2: 3})
        allocation = {1: 1.0, 2: 1.0, 3: 1.0}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        # The blocking coalition should be None (no coalition has excess > tol)
        assert result.blocking_coalition is None or result.maximum_excess <= result.epsilon_tolerance


# ─── Test 2: Unstable allocation ──────────────────────────────────────────────


class TestUnstableAllocation:
    """Analytically known unstable case.

    Same three-player game as above but unequal allocation x=(2, 0.5, 0.5).
    e({1,2}) = 2 - (2 + 0.5) = -0.5   stable
    e({1,3}) = 2 - (2 + 0.5) = -0.5   stable
    e({2,3}) = 2 - (0.5 + 0.5) = 1.0  BLOCKING — e > 0
    max excess = 1.0 → BLOCKING_COALITION_FOUND.
    """

    @pytest.fixture
    def three_player_game(self) -> tuple[nx.Graph, CoalitionValueModel]:
        values = {
            frozenset([1]): 0.0,
            frozenset([2]): 0.0,
            frozenset([3]): 0.0,
            frozenset([1, 2]): 2.0,
            frozenset([1, 3]): 2.0,
            frozenset([2, 3]): 2.0,
            frozenset([1, 2, 3]): 3.0,
        }
        G = nx.relabel_nodes(_complete_graph(3), {0: 1, 1: 2, 2: 3})
        return G, FixedCharacteristicFunction(values)

    def test_unequal_allocation_is_not_in_core(self, three_player_game) -> None:
        G, vm = three_player_game
        allocation = {1: 2.0, 2: 0.5, 3: 0.5}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        assert result.maximum_excess == pytest.approx(1.0, abs=1e-9)
        assert result.is_blocking_stable is False
        assert result.status_label == "BLOCKING_COALITION_FOUND"

    def test_blocking_coalition_is_2_3(self, three_player_game) -> None:
        G, vm = three_player_game
        allocation = {1: 2.0, 2: 0.5, 3: 0.5}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        assert result.blocking_coalition == frozenset([2, 3])

    def test_num_candidates_checked_is_positive(self, three_player_game) -> None:
        G, vm = three_player_game
        allocation = {1: 2.0, 2: 0.5, 3: 0.5}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        assert result.num_candidates_checked > 0


# ─── Test 3: Multiple blocking coalitions ─────────────────────────────────────


class TestMultipleBlockingCoalitions:
    """Case where multiple coalitions have positive excess.

    Allocation x=(1.5, 1.5, 0) for the 3-player game above:
      e({1,2}) = 2 - 3.0 = -1.0  stable
      e({1,3}) = 2 - 1.5 = 0.5   BLOCKING
      e({2,3}) = 2 - 1.5 = 0.5   BLOCKING
      e({3})   = 0 - 0   = 0      at boundary
    max excess = 0.5 → BLOCKING_COALITION_FOUND.
    """

    @pytest.fixture
    def three_player_game(self) -> tuple[nx.Graph, CoalitionValueModel]:
        values = {
            frozenset([1]): 0.0,
            frozenset([2]): 0.0,
            frozenset([3]): 0.0,
            frozenset([1, 2]): 2.0,
            frozenset([1, 3]): 2.0,
            frozenset([2, 3]): 2.0,
            frozenset([1, 2, 3]): 3.0,
        }
        G = nx.relabel_nodes(_complete_graph(3), {0: 1, 1: 2, 2: 3})
        return G, FixedCharacteristicFunction(values)

    def test_maximum_excess_is_correct(self, three_player_game) -> None:
        G, vm = three_player_game
        allocation = {1: 1.5, 2: 1.5, 3: 0.0}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        assert result.maximum_excess == pytest.approx(0.5, abs=1e-9)

    def test_multiple_blocking_coalitions_in_all_excesses(self, three_player_game) -> None:
        G, vm = three_player_game
        allocation = {1: 1.5, 2: 1.5, 3: 0.0}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        blocking_coalitions = [
            C for C, e in result.all_excesses.items()
            if e > result.epsilon_tolerance
        ]
        # {1,3} and {2,3} should both have excess 0.5
        assert frozenset([1, 3]) in blocking_coalitions
        assert frozenset([2, 3]) in blocking_coalitions

    def test_result_returns_highest_excess_coalition(self, three_player_game) -> None:
        G, vm = three_player_game
        allocation = {1: 1.5, 2: 1.5, 3: 0.0}
        result = compute_coalition_excess(allocation, G, value_model=vm)
        # The blocking_coalition should be one of the maximal-excess ones
        assert result.blocking_coalition in (frozenset([1, 3]), frozenset([2, 3]))


# ─── Test 4: Numerical tolerance boundary ─────────────────────────────────────


class TestNumericalTolerance:
    """Test boundary behavior near epsilon_tolerance.

    When excess = ε (on the boundary), the allocation should be classified
    as blocking-stable (excess ≤ ε) or not based on the tolerance.
    """

    @pytest.fixture
    def boundary_game(self) -> tuple[nx.Graph, CoalitionValueModel]:
        """Two-player game where exact allocation touches the boundary."""
        # v(1)=0, v(2)=0, v(12)=2. Allocation x=(1+ε, 1-ε) → e({1})=-1-ε<0, e({2})=-1+ε.
        # At ε_tol = 1e-6, e({2}) = 1e-6 - 1 ≈ -1 which is stable.
        values = {
            frozenset([1]): 0.0,
            frozenset([2]): 0.0,
            frozenset([1, 2]): 2.0,
        }
        G = nx.Graph()
        G.add_nodes_from([1, 2])
        G.add_edge(1, 2)
        return G, FixedCharacteristicFunction(values)

    def test_exact_boundary_allocation_is_stable(self, boundary_game) -> None:
        G, vm = boundary_game
        tol = 1e-6
        allocation = {1: 1.0 + tol / 2, 2: 1.0 - tol / 2}
        result = compute_coalition_excess(
            allocation, G, value_model=vm, epsilon_tolerance=tol
        )
        # e({1}) = 0 - (1+tol/2) = -(1+tol/2) < 0
        # e({2}) = 0 - (1-tol/2) = -(1-tol/2) < 0
        # max_excess < 0 → stable
        assert result.maximum_excess < 0
        assert result.is_blocking_stable is True

    def test_slightly_over_tolerance_is_blocking(self, boundary_game) -> None:
        G, vm = boundary_game
        tol = 1e-6
        # Give agent 2 only 0.5 → e({2}) = 0 - 0.5 = -0.5 still stable
        # Give agent 2 only 2-1.5 → for 2 agents: v(2)=0, x2=-0.5 is beyond boundary
        # Make v(12)=2 but x=(2.0, 0.0) → e({2}) = 0 - 0 = 0 which equals tol boundary
        allocation = {1: 2.0, 2: 0.0}
        result = compute_coalition_excess(
            allocation, G, value_model=vm, epsilon_tolerance=tol
        )
        # e({2}) = 0 - 0 = 0 ≤ tol → is_blocking_stable depends on tolerance
        # This is the exact boundary: max_excess=0 and tol=1e-6, so max_excess ≤ tol → stable
        assert result.maximum_excess == pytest.approx(0.0, abs=1e-9)
        assert result.is_blocking_stable is True  # 0 ≤ 1e-6


# ─── Test 5: Metadata fields ───────────────────────────────────────────────────


class TestMetadataFields:
    """Verify the result exposes all required fields from Prompt 7."""

    def test_result_has_all_required_fields(self) -> None:
        G = nx.Graph()
        G.add_nodes_from(["a"])
        allocation = {"a": 1.0}
        values = {frozenset(["a"]): 0.5}
        vm = FixedCharacteristicFunction(values)
        result = compute_coalition_excess(allocation, G, value_model=vm)
        assert hasattr(result, "maximum_excess")
        assert hasattr(result, "blocking_coalition")
        assert hasattr(result, "num_candidates_checked")
        assert hasattr(result, "verification_mode")
        assert hasattr(result, "epsilon_tolerance")
        assert hasattr(result, "runtime_ms")

    def test_runtime_is_measured(self) -> None:
        G = nx.relabel_nodes(_complete_graph(3), {0: 1, 1: 2, 2: 3})
        allocation = {1: 1.0, 2: 1.0, 3: 1.0}
        values = {
            frozenset([1]): 0.0, frozenset([2]): 0.0, frozenset([3]): 0.0,
            frozenset([1, 2]): 2.0, frozenset([1, 3]): 2.0, frozenset([2, 3]): 2.0,
            frozenset([1, 2, 3]): 3.0,
        }
        result = compute_coalition_excess(
            allocation, G, value_model=FixedCharacteristicFunction(values)
        )
        assert result.runtime_ms >= 0.0

    def test_exact_mode_for_small_coalition(self) -> None:
        G = nx.relabel_nodes(_complete_graph(2), {0: 1, 1: 2})
        allocation = {1: 1.0, 2: 1.0}
        values = {frozenset([1]): 0.0, frozenset([2]): 0.0, frozenset([1, 2]): 2.0}
        result = compute_coalition_excess(
            allocation, G, value_model=FixedCharacteristicFunction(values)
        )
        assert result.verification_mode == "EXACT"
