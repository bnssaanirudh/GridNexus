import json
from pathlib import Path
from typing import Any


REQUIRED_FIELDS = {
    "name",
    "raw_result_file",
    "script",
    "config",
    "seed",
    "commit_hash",
    "synthetic",
}


def load_manifest(manifest_path: Path) -> dict[str, Any]:
    if not manifest_path.exists():
        raise FileNotFoundError(f"Evidence manifest not found: {manifest_path}")

    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)

    if not isinstance(manifest, dict) or not isinstance(manifest.get("artifacts"), list):
        raise ValueError("Evidence manifest must contain an artifacts list")

    return manifest


def assert_publication_ready(manifest_path: Path, project_root: Path | None = None) -> None:
    project_root = project_root or Path.cwd()
    manifest = load_manifest(manifest_path)

    for index, artifact in enumerate(manifest["artifacts"]):
        if not isinstance(artifact, dict):
            raise ValueError(f"Manifest artifact {index} must be an object")

        missing = REQUIRED_FIELDS - set(artifact)
        if missing:
            missing_fields = ", ".join(sorted(missing))
            raise ValueError(f"Manifest artifact {index} is missing fields: {missing_fields}")

        if artifact["synthetic"] is True:
            raise ValueError(f"Manifest artifact {artifact['name']} uses synthetic evidence")

        raw_result = project_root / str(artifact["raw_result_file"])
        if not raw_result.exists():
            raise FileNotFoundError(f"Raw result file not found: {raw_result}")
