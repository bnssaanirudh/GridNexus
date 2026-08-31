"""Reader for the India Spectral Typical Meteorological Year (TMY) HDF5 file."""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path

try:
    import h5py
except ImportError:  # pragma: no cover - exercised only with an incomplete install
    h5py = None


class IndiaSpectralTMYError(RuntimeError):
    """Raised when the configured India spectral TMY cannot provide a sample."""


@dataclass(frozen=True)
class IndiaTMYSample:
    hour_of_year: int
    latitude: float
    longitude: float
    source_latitude: float
    source_longitude: float
    elevation_m: float
    timezone_offset_hours: float
    tmy_year: int
    air_temperature_c: float
    global_horizontal_irradiance_w_m2: float
    diffuse_horizontal_irradiance_w_m2: float
    direct_normal_irradiance_w_m2: float
    wind_speed_m_s: float
    precipitable_water_cm: float
    spectral_wavelength_nm: int
    spectral_ghi_w_m2_nm: float
    spectral_dni_w_m2_nm: float

    @property
    def diffuse_fraction(self) -> float:
        if self.global_horizontal_irradiance_w_m2 <= 0:
            return 0.0
        return min(1.0, self.diffuse_horizontal_irradiance_w_m2 / self.global_horizontal_irradiance_w_m2)


class IndiaSpectralTMYDataset:
    """Read one nearest-location TMY sample at a time from the HDF5 source."""

    SOURCE_NAME = "India Spectral Typical Meteorological Year"
    HOURS_PER_YEAR = 8760

    def __init__(self, h5_path: str | os.PathLike[str] | None = None):
        configured_path = h5_path or os.getenv("INDIA_SPECTRAL_TMY_PATH", "")
        if configured_path:
            self.path = Path(configured_path).expanduser()
        else:
            repository_root = Path(__file__).resolve().parents[3]
            candidate = repository_root / "india_spectral_tmy.h5"
            self.path = candidate if candidate.is_file() else None

    @property
    def available(self) -> bool:
        return h5py is not None and self.path is not None and self.path.is_file()

    def _require_available(self) -> Path:
        if h5py is None:
            raise IndiaSpectralTMYError("h5py is required to read India spectral TMY data.")
        if not self.available:
            raise IndiaSpectralTMYError(
                "India spectral TMY is unavailable. Set INDIA_SPECTRAL_TMY_PATH to india_spectral_tmy.h5."
            )
        assert self.path is not None
        return self.path

    @staticmethod
    def _scaled_value(file: "h5py.File", name: str, hour: int, location: int) -> float:
        dataset = file[name]
        return float(dataset[hour, location]) * float(dataset.attrs.get("scale_factor", 1.0))

    @staticmethod
    def _nearest_location(coordinates: object, latitude: float, longitude: float) -> int:
        # Equirectangular distance is accurate enough for selecting one of 117
        # grid points and avoids an additional geospatial dependency.
        latitude_scale = math.cos(math.radians(latitude))
        return min(
            range(len(coordinates)),
            key=lambda index: (float(coordinates[index][0]) - latitude) ** 2
            + ((float(coordinates[index][1]) - longitude) * latitude_scale) ** 2,
        )

    def sample(
        self,
        hour_of_year: int,
        latitude: float,
        longitude: float,
        spectral_wavelength_nm: int = 550,
    ) -> IndiaTMYSample:
        """Return an hourly TMY sample from the nearest available India grid point."""
        if not 0 <= hour_of_year < self.HOURS_PER_YEAR:
            raise IndiaSpectralTMYError("hour_of_year must be between 0 and 8759.")
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise IndiaSpectralTMYError("latitude/longitude are outside their valid ranges.")
        if spectral_wavelength_nm < 300 or spectral_wavelength_nm > 1800 or spectral_wavelength_nm % 10:
            raise IndiaSpectralTMYError("spectral_wavelength_nm must be a 10 nm band from 300 to 1800.")

        with h5py.File(self._require_available(), "r") as file:
            dni_band = f"DNI_{spectral_wavelength_nm}"
            ghi_band = f"GHI_{spectral_wavelength_nm}"
            if dni_band not in file or ghi_band not in file:
                raise IndiaSpectralTMYError(f"TMY file does not contain the {spectral_wavelength_nm} nm band.")
            location = self._nearest_location(file["coordinates"], latitude, longitude)
            meta = file["meta"][location]
            return IndiaTMYSample(
                hour_of_year=hour_of_year,
                latitude=latitude,
                longitude=longitude,
                source_latitude=float(file["coordinates"][location][0]),
                source_longitude=float(file["coordinates"][location][1]),
                elevation_m=float(meta["elevation"]),
                timezone_offset_hours=float(meta["timezone"]),
                tmy_year=int(file["tmy_year"][hour_of_year, location]),
                air_temperature_c=self._scaled_value(file, "AT", hour_of_year, location),
                global_horizontal_irradiance_w_m2=self._scaled_value(file, "GLHOR", hour_of_year, location),
                diffuse_horizontal_irradiance_w_m2=self._scaled_value(file, "DIFF", hour_of_year, location),
                direct_normal_irradiance_w_m2=self._scaled_value(file, "NIP", hour_of_year, location),
                wind_speed_m_s=self._scaled_value(file, "WS", hour_of_year, location),
                precipitable_water_cm=self._scaled_value(file, "PW", hour_of_year, location),
                spectral_wavelength_nm=spectral_wavelength_nm,
                spectral_ghi_w_m2_nm=self._scaled_value(file, ghi_band, hour_of_year, location),
                spectral_dni_w_m2_nm=self._scaled_value(file, dni_band, hour_of_year, location),
            )

    def metadata(self) -> dict[str, object]:
        with h5py.File(self._require_available(), "r") as file:
            return {
                "source_name": self.SOURCE_NAME,
                "hours_per_year": self.HOURS_PER_YEAR,
                "location_count": int(file["coordinates"].shape[0]),
                "coordinate_order": "latitude, longitude",
                "spectral_wavelength_range_nm": [300, 1800],
                "spectral_wavelength_step_nm": 10,
                "fields": ["AT", "DIFF", "GLHOR", "NIP", "PW", "WS", "tmy_year"],
            }
