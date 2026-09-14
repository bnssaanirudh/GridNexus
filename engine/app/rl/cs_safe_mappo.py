from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.rl.mappo_trainer import MAPPOConfig, MAPPOTrainer


@dataclass
class CSSafeMAPPOConfig(MAPPOConfig):
    """Configuration for coalition-stability constrained SafeMAPPO."""

    physical_cost_limit: float = 0.05
    coalition_instability_limit: float = 0.05

    def __post_init__(self) -> None:
        self.safe_mode = True
        self.cost_limit = self.physical_cost_limit + self.coalition_instability_limit


class CSSafeMAPPOTrainer(MAPPOTrainer):
    """MAPPO trainer with explicit physical and coalition-stability constraints."""

    algorithm_name = "CS-SafeMAPPO"

    def __init__(self, cfg: CSSafeMAPPOConfig) -> None:
        cfg.safe_mode = True
        cfg.cost_limit = cfg.physical_cost_limit + cfg.coalition_instability_limit
        super().__init__(cfg)
        self.constraint_metrics: list[dict[str, float]] = []

    def _run_episode(self, episode: int) -> dict[str, float]:
        metrics = super()._run_episode(episode)
        totals = {"physical_violation": 0.0, "coalition_instability": 0.0}
        count = 0

        for physical_costs, stability_costs in zip(
            self.buffer.physical_costs, self.buffer.stability_costs, strict=False
        ):
            for agent_id, physical_cost in physical_costs.items():
                totals["physical_violation"] += physical_cost
                totals["coalition_instability"] += stability_costs.get(agent_id, 0.0)
                count += 1

        denominator = max(count, 1)
        physical = totals["physical_violation"] / denominator
        coalition = totals["coalition_instability"] / denominator
        self.constraint_metrics.append(
            {
                "episode": float(episode),
                "mean_physical_violation": physical,
                "mean_coalition_instability": coalition,
                "mean_total_constraint_cost": physical + coalition,
            }
        )
        metrics.update(self.constraint_metrics[-1])
        return metrics

    def save(self, artifact_dir: Path) -> None:
        super().save(artifact_dir)
        if not self.constraint_metrics:
            return

        import csv

        csv_path = artifact_dir / "constraint_metrics.csv"
        with csv_path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=self.constraint_metrics[0].keys())
            writer.writeheader()
            writer.writerows(self.constraint_metrics)
