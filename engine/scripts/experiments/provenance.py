"""
engine/scripts/experiments/provenance.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prompt 10 — Experiment Provenance and Manifest System

Every experiment run must generate an immutable manifest capturing:
  - git commit hash and dirty-tree status
  - Python version, package versions, OS
  - Seed, configuration, algorithm, network/dataset
  - Output file hashes (SHA-256)
  - Runtime and status

USAGE
━━━━━
from scripts.experiments.provenance import ExperimentManifest

with ExperimentManifest("my_experiment", config={"seed": 42}) as manifest:
    # ... run experiment ...
    manifest.add_output("results.csv")
    manifest.set_status("COMPLETED")
# → Saves manifest.json in the run directory

CLI:
    python -m scripts.experiments.provenance validate --run-dir results/runs/my_run
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _git_commit() -> str:
    """Return current git commit hash, or 'UNKNOWN' if not in a git repo."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def _git_dirty() -> bool:
    """Return True if the working tree has uncommitted changes."""
    try:
        result = subprocess.run(
            ["git", "diff", "--quiet", "HEAD"],
            capture_output=True, timeout=5
        )
        return result.returncode != 0
    except Exception:
        return True  # Assume dirty when uncertain


def _package_versions() -> dict[str, str]:
    """Return versions of key research packages."""
    packages = [
        "torch", "numpy", "scipy", "networkx", "pandas",
        "pettingzoo", "fastapi", "pandapower", "cvxpy",
    ]
    versions = {}
    for pkg in packages:
        try:
            import importlib.metadata
            versions[pkg] = importlib.metadata.version(pkg)
        except Exception:
            versions[pkg] = "NOT_INSTALLED"
    return versions


def _sha256(path: str | Path) -> str:
    """Return SHA-256 hex digest of a file, or 'FILE_NOT_FOUND' if missing."""
    p = Path(path)
    if not p.exists():
        return "FILE_NOT_FOUND"
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ─── Manifest dataclass ───────────────────────────────────────────────────────


@dataclass
class ExperimentManifest:
    """Immutable experiment provenance record.

    Attributes
    ----------
    experiment_name   Human-readable experiment identifier.
    run_id            UUID for this specific run.
    utc_timestamp     ISO 8601 timestamp at run start.
    git_commit        Git commit hash.
    git_dirty         True if working tree had uncommitted changes.
    python_version    Python version string.
    os_info           OS name and version.
    package_versions  Key package versions.
    seed              Random seed used (if applicable).
    config            Algorithm / environment configuration dict.
    algorithm         Algorithm name.
    network           Grid network / dataset identifier.
    output_files      List of output file paths relative to run_dir.
    output_hashes     SHA-256 hash per output file.
    runtime_s         Total runtime in seconds.
    status            One of: RUNNING, COMPLETED, FAILED, CRASHED.
    error_message     Error details if status is FAILED or CRASHED.
    run_dir           Absolute path to the unique run directory.
    """

    experiment_name: str
    run_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    utc_timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    git_commit: str = field(default_factory=_git_commit)
    git_dirty: bool = field(default_factory=_git_dirty)
    python_version: str = field(default_factory=lambda: sys.version)
    os_info: str = field(default_factory=lambda: platform.platform())
    package_versions: dict[str, str] = field(default_factory=_package_versions)
    seed: int | None = None
    config: dict[str, Any] = field(default_factory=dict)
    algorithm: str = "UNKNOWN"
    network: str = "UNKNOWN"
    output_files: list[str] = field(default_factory=list)
    output_hashes: dict[str, str] = field(default_factory=dict)
    runtime_s: float = 0.0
    status: str = "RUNNING"
    error_message: str | None = None
    run_dir: str = ""

    # Runtime internals (not serialized)
    _start_time: float = field(default_factory=time.perf_counter, repr=False)

    def __post_init__(self) -> None:
        if not self.run_dir:
            # Create unique run directory alongside this script
            base = Path(os.getcwd()) / "results" / "runs"
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            self.run_dir = str(base / f"{self.experiment_name}_{ts}_{self.run_id[:8]}")
        Path(self.run_dir).mkdir(parents=True, exist_ok=True)

    # ── Context manager API ────────────────────────────────────────────────────

    def __enter__(self) -> "ExperimentManifest":
        self._start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.runtime_s = time.perf_counter() - self._start_time
        if exc_type is not None:
            self.status = "CRASHED"
            self.error_message = f"{exc_type.__name__}: {exc_val}"
        self.save()
        return False  # Do not suppress exceptions

    # ── Mutation API ───────────────────────────────────────────────────────────

    def add_output(self, path: str | Path) -> None:
        """Register an output file and record its SHA-256 hash."""
        p = Path(path)
        rel = str(p)
        if rel not in self.output_files:
            self.output_files.append(rel)
        self.output_hashes[rel] = _sha256(p)

    def set_status(self, status: str, error: str | None = None) -> None:
        """Set the status. Allowed: RUNNING, COMPLETED, FAILED."""
        allowed = {"RUNNING", "COMPLETED", "FAILED", "CRASHED"}
        if status not in allowed:
            raise ValueError(f"Invalid status '{status}'. Allowed: {allowed}")
        self.status = status
        if error:
            self.error_message = error

    def save(self) -> Path:
        """Write the manifest to <run_dir>/manifest.json.

        Raw result files must not be overwritten silently — each run has its
        own unique directory so prior runs are preserved.
        """
        p = Path(self.run_dir) / "manifest.json"
        data = {k: v for k, v in asdict(self).items() if not k.startswith("_")}
        # _start_time is not in dataclass fields after field() default
        data.pop("_start_time", None)
        with open(p, "w") as f:
            json.dump(data, f, indent=2)
        return p


# ─── Validator ────────────────────────────────────────────────────────────────


class ManifestValidationError(Exception):
    """Raised when a manifest fails validation."""


def validate_manifest(run_dir: str | Path) -> dict[str, Any]:
    """Validate a completed experiment manifest.

    Checks:
    - manifest.json exists and is valid JSON
    - Required fields are present
    - Status is not RUNNING
    - Seeds are recorded
    - Commit hash is not UNKNOWN (warn only)
    - Output files exist
    - SHA-256 hashes match recorded values

    Returns
    -------
    dict with keys:
        valid: bool
        errors: list[str]
        warnings: list[str]
        manifest: dict
    """
    run_dir = Path(run_dir)
    errors: list[str] = []
    warnings: list[str] = []

    # 1. manifest.json must exist
    manifest_path = run_dir / "manifest.json"
    if not manifest_path.exists():
        return {
            "valid": False,
            "errors": [f"manifest.json not found in {run_dir}"],
            "warnings": [],
            "manifest": {},
        }

    with open(manifest_path) as f:
        try:
            m = json.load(f)
        except json.JSONDecodeError as e:
            return {
                "valid": False,
                "errors": [f"manifest.json is invalid JSON: {e}"],
                "warnings": [],
                "manifest": {},
            }

    # 2. Required metadata fields
    required = [
        "experiment_name", "run_id", "utc_timestamp", "git_commit",
        "python_version", "seed", "config", "algorithm", "status",
        "output_files",
    ]
    for field_name in required:
        if field_name not in m:
            errors.append(f"Required field missing: {field_name}")

    # 3. Status must not be RUNNING
    status = m.get("status", "")
    if status == "RUNNING":
        errors.append("Manifest status is still RUNNING — experiment may not have completed.")

    # 4. Seed recorded
    if m.get("seed") is None:
        warnings.append("seed is None — experiments should record the seed used.")

    # 5. Commit hash known
    if m.get("git_commit") == "UNKNOWN":
        warnings.append("git_commit is UNKNOWN — results may not be reproducible from a clean checkout.")

    # 6. Git dirty
    if m.get("git_dirty") is True:
        warnings.append("git_dirty=True — working tree had uncommitted changes when experiment ran.")

    # 7. Output files exist and hashes match
    output_files = m.get("output_files", [])
    output_hashes = m.get("output_hashes", {})

    for rel_path in output_files:
        # Try both absolute and relative to run_dir
        candidate = run_dir / rel_path
        if not candidate.exists() and not Path(rel_path).exists():
            errors.append(f"Output file not found: {rel_path}")
            continue

        actual_path = candidate if candidate.exists() else Path(rel_path)
        recorded_hash = output_hashes.get(rel_path, "")
        if not recorded_hash:
            warnings.append(f"No hash recorded for output: {rel_path}")
        else:
            actual_hash = _sha256(actual_path)
            if actual_hash != recorded_hash:
                errors.append(
                    f"Hash mismatch for {rel_path}: "
                    f"recorded={recorded_hash[:16]}… actual={actual_hash[:16]}…"
                )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "manifest": m,
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="GridNexus experiment provenance tool")
    sub = parser.add_subparsers(dest="command")

    val_parser = sub.add_parser("validate", help="Validate a manifest")
    val_parser.add_argument("--run-dir", required=True, help="Path to run directory")

    args = parser.parse_args()

    if args.command == "validate":
        result = validate_manifest(args.run_dir)
        print(f"VALID: {result['valid']}")
        if result["errors"]:
            print("\nERRORS:")
            for e in result["errors"]:
                print(f"  ✗ {e}")
        if result["warnings"]:
            print("\nWARNINGS:")
            for w in result["warnings"]:
                print(f"  ⚠ {w}")
        sys.exit(0 if result["valid"] else 1)
    else:
        parser.print_help()
