"""Adapter for the Open Power System Data household-load package.

The source files contain interval *energy* in kWh. The project uses the
hourly export because it is compact enough for service use and its kWh values
are numerically equal to average kW over each 60-minute interval.
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable


DEFAULT_RESIDENTIAL_PROFILES = (
    "DE_KN_residential1_grid_import",
    "DE_KN_residential2_grid_import",
    "DE_KN_residential3_grid_import",
    "DE_KN_residential4_grid_import",
    "DE_KN_residential5_grid_import",
    "DE_KN_residential6_grid_import",
)


class OPSDHouseholdDataError(RuntimeError):
    """Raised when the configured OPSD package cannot supply a load sample."""


@dataclass(frozen=True)
class HouseholdLoadSample:
    """Measured grid-import energy for a set of household profiles."""

    timestamp: datetime
    interval_minutes: int
    profile_kwh: dict[str, float | None]

    @property
    def observed_profiles(self) -> list[str]:
        return [name for name, value in self.profile_kwh.items() if value is not None]

    @property
    def missing_profiles(self) -> list[str]:
        return [name for name, value in self.profile_kwh.items() if value is None]

    @property
    def aggregate_kwh(self) -> float:
        return sum(value for value in self.profile_kwh.values() if value is not None)

    @property
    def aggregate_kw(self) -> float:
        return self.aggregate_kwh * 60 / self.interval_minutes


class OPSDHouseholdDataset:
    """Read household grid imports without loading the full CSV into RAM."""

    SOURCE_NAME = "Open Power System Data Household Data"
    SOURCE_VERSION = "2020-04-15"
    INTERVAL_MINUTES = 60

    def __init__(self, csv_path: str | os.PathLike[str] | None = None):
        configured_path = csv_path or os.getenv("OPSD_HOUSEHOLD_DATA_PATH", "")
        self.path = Path(configured_path).expanduser() if configured_path else None

    @property
    def available(self) -> bool:
        return self.path is not None and self.path.is_file()

    def _require_available(self) -> Path:
        if not self.available:
            raise OPSDHouseholdDataError(
                "OPSD household data is unavailable. Set OPSD_HOUSEHOLD_DATA_PATH to "
                "household_data_60min_singleindex.csv."
            )
        assert self.path is not None
        return self.path

    @lru_cache(maxsize=1)
    def fieldnames(self) -> tuple[str, ...]:
        with self._require_available().open("r", encoding="utf-8", newline="") as handle:
            header = next(csv.reader(handle), None)
        if not header or "utc_timestamp" not in header:
            raise OPSDHouseholdDataError("OPSD household CSV has no utc_timestamp column.")
        return tuple(header)

    def available_grid_import_profiles(self) -> list[str]:
        return [name for name in self.fieldnames() if name.endswith("_grid_import")]

    def default_profiles(self) -> tuple[str, ...]:
        available = set(self.fieldnames())
        defaults = tuple(name for name in DEFAULT_RESIDENTIAL_PROFILES if name in available)
        if not defaults:
            raise OPSDHouseholdDataError("OPSD household CSV has no residential grid-import profiles.")
        return defaults

    @staticmethod
    def _normalise_timestamp(timestamp: str | datetime) -> tuple[str, datetime]:
        if isinstance(timestamp, datetime):
            parsed = timestamp
        else:
            try:
                parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError as exc:
                raise OPSDHouseholdDataError(
                    "timestamp must be ISO-8601 UTC, e.g. 2015-01-01T00:00:00Z."
                ) from exc
        if parsed.tzinfo is None:
            raise OPSDHouseholdDataError("timestamp must include a UTC offset or Z suffix.")
        original_utc = parsed.astimezone(timezone.utc)
        utc_time = original_utc.replace(minute=0, second=0, microsecond=0)
        if original_utc != utc_time:
            raise OPSDHouseholdDataError("the hourly OPSD dataset only accepts whole-hour timestamps.")
        return utc_time.strftime("%Y-%m-%dT%H:%M:%SZ"), utc_time

    def _validated_profiles(self, profiles: Iterable[str] | None) -> tuple[str, ...]:
        selected = tuple(profiles) if profiles is not None else self.default_profiles()
        if not selected:
            raise OPSDHouseholdDataError("at least one grid-import profile must be requested.")
        unknown = sorted(set(selected) - set(self.available_grid_import_profiles()))
        if unknown:
            raise OPSDHouseholdDataError(
                "unknown or non-grid-import OPSD profile(s): " + ", ".join(unknown)
            )
        return selected

    @lru_cache(maxsize=256)
    def _row_at(self, normalized_timestamp: str) -> dict[str, str] | None:
        with self._require_available().open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row.get("utc_timestamp") == normalized_timestamp:
                    return row
        return None

    def load_at(
        self, timestamp: str | datetime, profiles: Iterable[str] | None = None
    ) -> HouseholdLoadSample:
        """Return one measured interval, retaining missing values as ``None``."""
        normalized_timestamp, utc_time = self._normalise_timestamp(timestamp)
        selected = self._validated_profiles(profiles)
        row = self._row_at(normalized_timestamp)
        if row is None:
            raise OPSDHouseholdDataError(f"no OPSD household record exists for {normalized_timestamp}.")
        values: dict[str, float | None] = {}
        for profile in selected:
            raw_value = (row.get(profile) or "").strip()
            try:
                values[profile] = float(raw_value) if raw_value else None
            except ValueError as exc:
                raise OPSDHouseholdDataError(
                    f"invalid numeric value for {profile} at {normalized_timestamp}."
                ) from exc
        return HouseholdLoadSample(utc_time, self.INTERVAL_MINUTES, values)

    def metadata(self) -> dict[str, object]:
        path = self._require_available()
        return {
            "source_name": self.SOURCE_NAME,
            "source_version": self.SOURCE_VERSION,
            "path": str(path),
            "interval_minutes": self.INTERVAL_MINUTES,
            "available_grid_import_profiles": self.available_grid_import_profiles(),
            "default_profiles": list(self.default_profiles()),
            "license": "CC-BY-4.0",
            "attribution": "Open Power System Data. 2020. Data Package Household Data. Version 2020-04-15.",
        }
