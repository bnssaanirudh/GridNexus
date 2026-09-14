import json
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.experiments.evidence_manifest import assert_publication_ready


def test_publication_ready_rejects_synthetic_evidence():
    test_dir = Path("tmp/evidence-manifest-test")
    test_dir.mkdir(parents=True, exist_ok=True)
    manifest = test_dir / "evidence_manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "artifacts": [
                    {
                        "name": "ablation_table",
                        "raw_result_file": "results/ablation_study.csv",
                        "script": "engine/scripts/experiments/run_ablation_study.py",
                        "config": "configs/ieee33.json",
                        "seed": 42,
                        "commit_hash": "abc123",
                        "synthetic": True,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="synthetic evidence"):
        assert_publication_ready(manifest)


def test_cli_tables_fails_fast_without_manifest():
    result = subprocess.run(
        [sys.executable, "gridnexus_cli.py", "reproduce", "--tables", "--evidence-manifest", "tmp/missing-manifest.json"],
        cwd=Path.cwd(),
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 1
    assert "Evidence manifest not found" in result.stdout
