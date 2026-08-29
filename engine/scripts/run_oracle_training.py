"""Script to run the 400-episode Oracle training and save artifacts.

Usage:
    python scripts/run_oracle_training.py
"""
import sys
import logging
import numpy as np
from pathlib import Path

# Ensure engine package is importable when run from repo root
sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    force=True,
)
logger = logging.getLogger(__name__)

from app.oracle.oracle_trainer import (  # noqa: E402
    OracleTrainerConfig,
    train_oracle,
    save_training_artifacts,
)

if __name__ == "__main__":
    art_dir = Path("artifacts/oracle")
    cfg = OracleTrainerConfig(
        n_episodes=400,
        steps_per_episode=10,
        seed=42,
        artifact_dir=str(art_dir),
    )

    logger.info("Starting 400-episode Oracle training...")
    actor, metrics = train_oracle(cfg)
    logger.info("Training complete. Saving artifacts to %s", art_dir)
    save_training_artifacts(actor, metrics, art_dir)

    # Print acceptance-criteria summary
    first50 = [m.mean_pooled_capacity_kwh for m in metrics[:50]]
    last50  = [m.mean_pooled_capacity_kwh for m in metrics[-50:]]
    fv_f50  = [m.fairness_violation_rate   for m in metrics[:50]]
    fv_l50  = [m.fairness_violation_rate   for m in metrics[-50:]]
    rd_f50  = [m.total_reward              for m in metrics[:50]]
    rd_l50  = [m.total_reward              for m in metrics[-50:]]

    print("\n=== 400-Episode Training Summary ===")
    print(f"Pooled capacity  -- first-50 avg: {np.mean(first50):7.2f} kWh "
          f"  last-50 avg: {np.mean(last50):7.2f} kWh "
          f"  delta: {np.mean(last50)-np.mean(first50):+.2f} kWh")
    print(f"Fairness viol    -- first-50 avg: {np.mean(fv_f50):.4f} "
          f"  last-50 avg: {np.mean(fv_l50):.4f}")
    print(f"Total reward     -- first-50 avg: {np.mean(rd_f50):.4f} "
          f"  last-50 avg: {np.mean(rd_l50):.4f}")
    print(f"\nArtifact files:")
    for f in sorted(art_dir.glob("*")):
        print(f"  {f.name}  ({f.stat().st_size:,} bytes)")
    print("Done.")
