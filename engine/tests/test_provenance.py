"""
engine/tests/test_provenance.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tests for Prompt 10: Experiment Provenance and Manifest System.
"""

from __future__ import annotations

import json
import os
import time
import tempfile
from pathlib import Path

import pytest

# Adjust import path since scripts/ is not necessarily in sys.path during tests
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.experiments.provenance import (
    ExperimentManifest,
    validate_manifest,
    _sha256,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def tmp_run_dir(tmp_path: Path) -> Path:
    """A temporary directory for test run output."""
    d = tmp_path / "test_run"
    d.mkdir()
    return d


# ─── ManifestCreation ─────────────────────────────────────────────────────────


class TestManifestCreation:
    def test_manifest_saves_to_run_dir(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("test_exp", run_dir=str(tmp_run_dir))
        m.set_status("COMPLETED")
        saved = m.save()
        assert saved.exists()
        assert saved.name == "manifest.json"

    def test_manifest_contains_required_fields(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest(
            "test_exp", run_dir=str(tmp_run_dir),
            seed=42, algorithm="MAPPO", network="33-bus"
        )
        m.set_status("COMPLETED")
        m.save()
        with open(tmp_run_dir / "manifest.json") as f:
            data = json.load(f)
        required = ["experiment_name", "run_id", "utc_timestamp", "git_commit",
                    "python_version", "seed", "config", "algorithm", "status",
                    "output_files"]
        for field in required:
            assert field in data, f"Missing field: {field}"

    def test_seed_is_recorded(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("test_exp", run_dir=str(tmp_run_dir), seed=123)
        m.save()
        with open(tmp_run_dir / "manifest.json") as f:
            data = json.load(f)
        assert data["seed"] == 123

    def test_algorithm_recorded(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("test_exp", run_dir=str(tmp_run_dir), algorithm="CS-SafeMAPPO")
        m.save()
        with open(tmp_run_dir / "manifest.json") as f:
            data = json.load(f)
        assert data["algorithm"] == "CS-SafeMAPPO"

    def test_output_hash_recorded(self, tmp_run_dir: Path) -> None:
        output_file = tmp_run_dir / "results.csv"
        output_file.write_text("a,b\n1,2\n")
        m = ExperimentManifest("test_exp", run_dir=str(tmp_run_dir))
        m.add_output(str(output_file))
        m.set_status("COMPLETED")
        m.save()
        with open(tmp_run_dir / "manifest.json") as f:
            data = json.load(f)
        assert str(output_file) in data["output_hashes"]
        recorded_hash = data["output_hashes"][str(output_file)]
        assert recorded_hash == _sha256(output_file)

    def test_status_default_is_running(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("test_exp", run_dir=str(tmp_run_dir))
        assert m.status == "RUNNING"

    def test_invalid_status_raises(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("test_exp", run_dir=str(tmp_run_dir))
        with pytest.raises(ValueError, match="Invalid status"):
            m.set_status("SUCCESS")  # Not an allowed value


# ─── Context manager ──────────────────────────────────────────────────────────


class TestContextManager:
    def test_context_manager_saves_on_exit(self, tmp_run_dir: Path) -> None:
        with ExperimentManifest("ctx_test", run_dir=str(tmp_run_dir)) as m:
            m.set_status("COMPLETED")
        assert (tmp_run_dir / "manifest.json").exists()

    def test_context_manager_captures_crash(self, tmp_run_dir: Path) -> None:
        with pytest.raises(RuntimeError):
            with ExperimentManifest("crash_test", run_dir=str(tmp_run_dir)) as m:
                raise RuntimeError("Test crash")
        # Manifest should still be saved
        with open(tmp_run_dir / "manifest.json") as f:
            data = json.load(f)
        assert data["status"] == "CRASHED"
        assert "RuntimeError" in data["error_message"]

    def test_runtime_is_measured(self, tmp_run_dir: Path) -> None:
        with ExperimentManifest("timing_test", run_dir=str(tmp_run_dir)) as m:
            time.sleep(0.05)
            m.set_status("COMPLETED")
        with open(tmp_run_dir / "manifest.json") as f:
            data = json.load(f)
        assert data["runtime_s"] >= 0.05

    def test_each_run_gets_unique_directory(self, tmp_path: Path) -> None:
        """Unique run dirs ensure prior results are never silently overwritten."""
        dirs = set()
        for _ in range(3):
            m = ExperimentManifest("unique_dir_test")
            dirs.add(m.run_dir)
        assert len(dirs) == 3  # All unique


# ─── Validator ────────────────────────────────────────────────────────────────


class TestValidator:
    def test_valid_manifest_passes(self, tmp_run_dir: Path) -> None:
        output = tmp_run_dir / "results.csv"
        output.write_text("x,y\n1,2\n")
        m = ExperimentManifest(
            "valid_exp", run_dir=str(tmp_run_dir),
            seed=42, algorithm="MAPPO", network="33-bus"
        )
        m.add_output(str(output))
        m.set_status("COMPLETED")
        m.save()
        result = validate_manifest(tmp_run_dir)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_missing_manifest_fails(self, tmp_path: Path) -> None:
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        result = validate_manifest(empty_dir)
        assert result["valid"] is False
        assert any("manifest.json not found" in e for e in result["errors"])

    def test_running_status_fails(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("running_exp", run_dir=str(tmp_run_dir))
        # Don't set status to COMPLETED
        m.save()
        result = validate_manifest(tmp_run_dir)
        assert result["valid"] is False
        assert any("RUNNING" in e for e in result["errors"])

    def test_missing_output_file_fails(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("missing_output", run_dir=str(tmp_run_dir), seed=1)
        m.output_files.append("nonexistent_results.csv")
        m.output_hashes["nonexistent_results.csv"] = "abc123"
        m.set_status("COMPLETED")
        m.save()
        result = validate_manifest(tmp_run_dir)
        assert result["valid"] is False
        assert any("nonexistent_results.csv" in e for e in result["errors"])

    def test_hash_mismatch_fails(self, tmp_run_dir: Path) -> None:
        output = tmp_run_dir / "results.csv"
        output.write_text("original content")
        m = ExperimentManifest("hash_test", run_dir=str(tmp_run_dir), seed=1)
        m.add_output(str(output))
        m.set_status("COMPLETED")
        m.save()
        # Tamper with the output file AFTER saving manifest
        output.write_text("TAMPERED CONTENT")
        result = validate_manifest(tmp_run_dir)
        assert result["valid"] is False
        assert any("Hash mismatch" in e for e in result["errors"])

    def test_no_seed_produces_warning(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("no_seed_exp", run_dir=str(tmp_run_dir))
        m.set_status("COMPLETED")
        m.save()
        result = validate_manifest(tmp_run_dir)
        assert any("seed" in w.lower() for w in result["warnings"])

    def test_unknown_commit_produces_warning(self, tmp_run_dir: Path) -> None:
        m = ExperimentManifest("unknown_commit_exp", run_dir=str(tmp_run_dir), seed=1)
        m.git_commit = "UNKNOWN"
        m.set_status("COMPLETED")
        m.save()
        result = validate_manifest(tmp_run_dir)
        assert any("UNKNOWN" in w for w in result["warnings"])
