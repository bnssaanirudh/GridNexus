import csv

import pytest

from app.data.opsd_household import OPSDHouseholdDataError, OPSDHouseholdDataset


@pytest.fixture
def opsd_csv(tmp_path):
    path = tmp_path / "household_data_60min_singleindex.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "utc_timestamp",
                "DE_KN_residential1_grid_import",
                "DE_KN_residential2_grid_import",
                "DE_KN_residential1_pv",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "utc_timestamp": "2015-01-01T00:00:00Z",
                "DE_KN_residential1_grid_import": "1.25",
                "DE_KN_residential2_grid_import": "",
                "DE_KN_residential1_pv": "0.5",
            }
        )
    return path


def test_reads_hourly_grid_import_and_preserves_missing_values(opsd_csv):
    sample = OPSDHouseholdDataset(opsd_csv).load_at("2015-01-01T00:00:00Z")

    assert sample.aggregate_kwh == pytest.approx(1.25)
    assert sample.aggregate_kw == pytest.approx(1.25)
    assert sample.profile_kwh["DE_KN_residential1_grid_import"] == pytest.approx(1.25)
    assert sample.profile_kwh["DE_KN_residential2_grid_import"] is None
    assert sample.missing_profiles == ["DE_KN_residential2_grid_import"]


def test_rejects_non_hourly_timestamps_and_non_import_columns(opsd_csv):
    dataset = OPSDHouseholdDataset(opsd_csv)

    with pytest.raises(OPSDHouseholdDataError, match="whole-hour"):
        dataset.load_at("2015-01-01T00:30:00Z")
    with pytest.raises(OPSDHouseholdDataError, match="non-grid-import"):
        dataset.load_at("2015-01-01T00:00:00Z", ["DE_KN_residential1_pv"])
