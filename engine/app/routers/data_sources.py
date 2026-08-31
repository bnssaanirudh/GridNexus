"""Authenticated-by-deployment data access for locally mounted research datasets."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.data.india_spectral_tmy import IndiaSpectralTMYDataset, IndiaSpectralTMYError
from app.data.opsd_household import OPSDHouseholdDataError, OPSDHouseholdDataset


router = APIRouter(prefix="/data", tags=["Research data"])
household_dataset = OPSDHouseholdDataset()
india_tmy_dataset = IndiaSpectralTMYDataset()


class HouseholdLoadResponse(BaseModel):
    timestamp: str
    interval_minutes: int
    aggregate_kwh: float
    aggregate_kw: float
    profile_kwh: dict[str, float | None]
    observed_profiles: list[str]
    missing_profiles: list[str]
    source_name: str
    source_version: str
    synthetic: bool = False


class IndiaTMYResponse(BaseModel):
    hour_of_year: int
    requested_latitude: float
    requested_longitude: float
    source_latitude: float
    source_longitude: float
    elevation_m: float
    timezone_offset_hours: float
    tmy_year: int
    air_temperature_c: float
    global_horizontal_irradiance_w_m2: float
    diffuse_horizontal_irradiance_w_m2: float
    direct_normal_irradiance_w_m2: float
    diffuse_fraction: float
    wind_speed_m_s: float
    precipitable_water_cm: float
    spectral_wavelength_nm: int
    spectral_ghi_w_m2_nm: float
    spectral_dni_w_m2_nm: float
    synthetic: bool = False


def _data_error(exc: RuntimeError, available: bool) -> HTTPException:
    return HTTPException(status_code=422 if available else 503, detail=str(exc))


@router.get("/household-load", response_model=HouseholdLoadResponse)
def get_household_load(timestamp: str, profiles: Optional[str] = None) -> HouseholdLoadResponse:
    """Return measured OPSD grid imports for a whole-hour UTC timestamp."""
    selected = [value.strip() for value in profiles.split(",") if value.strip()] if profiles else None
    try:
        sample = household_dataset.load_at(timestamp, selected)
    except OPSDHouseholdDataError as exc:
        raise _data_error(exc, household_dataset.available) from exc
    return HouseholdLoadResponse(
        timestamp=sample.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
        interval_minutes=sample.interval_minutes,
        aggregate_kwh=sample.aggregate_kwh,
        aggregate_kw=sample.aggregate_kw,
        profile_kwh=sample.profile_kwh,
        observed_profiles=sample.observed_profiles,
        missing_profiles=sample.missing_profiles,
        source_name=household_dataset.SOURCE_NAME,
        source_version=household_dataset.SOURCE_VERSION,
    )


@router.get("/india-tmy", response_model=IndiaTMYResponse)
def get_india_tmy(
    hour_of_year: int,
    latitude: float,
    longitude: float,
    spectral_wavelength_nm: int = 550,
) -> IndiaTMYResponse:
    """Return the nearest-grid-point India TMY solar and weather observation."""
    try:
        sample = india_tmy_dataset.sample(hour_of_year, latitude, longitude, spectral_wavelength_nm)
    except IndiaSpectralTMYError as exc:
        raise _data_error(exc, india_tmy_dataset.available) from exc
    return IndiaTMYResponse(
        hour_of_year=sample.hour_of_year,
        requested_latitude=sample.latitude,
        requested_longitude=sample.longitude,
        source_latitude=sample.source_latitude,
        source_longitude=sample.source_longitude,
        elevation_m=sample.elevation_m,
        timezone_offset_hours=sample.timezone_offset_hours,
        tmy_year=sample.tmy_year,
        air_temperature_c=sample.air_temperature_c,
        global_horizontal_irradiance_w_m2=sample.global_horizontal_irradiance_w_m2,
        diffuse_horizontal_irradiance_w_m2=sample.diffuse_horizontal_irradiance_w_m2,
        direct_normal_irradiance_w_m2=sample.direct_normal_irradiance_w_m2,
        diffuse_fraction=sample.diffuse_fraction,
        wind_speed_m_s=sample.wind_speed_m_s,
        precipitable_water_cm=sample.precipitable_water_cm,
        spectral_wavelength_nm=sample.spectral_wavelength_nm,
        spectral_ghi_w_m2_nm=sample.spectral_ghi_w_m2_nm,
        spectral_dni_w_m2_nm=sample.spectral_dni_w_m2_nm,
    )


@router.get("/metadata")
def get_data_source_metadata() -> dict[str, object]:
    """Return only source capabilities and provenance, not raw profile data."""
    response: dict[str, object] = {}
    for name, source in (("opsd_household", household_dataset), ("india_spectral_tmy", india_tmy_dataset)):
        try:
            response[name] = {"available": source.available, "metadata": source.metadata()}
        except RuntimeError as exc:
            response[name] = {"available": False, "error": str(exc)}
    return response
