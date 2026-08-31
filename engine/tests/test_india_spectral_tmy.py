import h5py
import numpy as np
import pytest

from app.data.india_spectral_tmy import IndiaSpectralTMYDataset, IndiaSpectralTMYError


@pytest.fixture
def tmy_file(tmp_path):
    path = tmp_path / "india_spectral_tmy.h5"
    with h5py.File(path, "w") as file:
        file.create_dataset("coordinates", data=np.array([[10.0, 78.0], [20.0, 77.0]]))
        file.create_dataset(
            "meta",
            data=np.array([(10.0, 78.0, 100.0, 5.5), (20.0, 77.0, 200.0, 5.5)], dtype=[("latitude", "f8"), ("longitude", "f8"), ("elevation", "f8"), ("timezone", "f8")]),
        )
        file.create_dataset("tmy_year", data=np.full((8760, 2), 2010, dtype="i2"))
        for name, value, scale in (("AT", 2956, 0.01), ("DIFF", 28300, 0.01), ("GLHOR", 78200, 0.01), ("NIP", 59600, 0.01), ("WS", 300, 0.01), ("PW", 426, 0.01), ("DNI_550", 9924, 0.0001), ("GHI_550", 12186, 0.0001)):
            dataset = file.create_dataset(name, data=np.full((8760, 2), value, dtype="i4"))
            dataset.attrs["scale_factor"] = scale
    return path


def test_reads_scaled_nearest_location_tmy_sample(tmy_file):
    sample = IndiaSpectralTMYDataset(tmy_file).sample(12, 10.1, 78.1)

    assert sample.source_latitude == pytest.approx(10.0)
    assert sample.air_temperature_c == pytest.approx(29.56)
    assert sample.global_horizontal_irradiance_w_m2 == pytest.approx(782.0)
    assert sample.spectral_ghi_w_m2_nm == pytest.approx(1.2186)
    assert sample.diffuse_fraction == pytest.approx(283 / 782)


def test_rejects_invalid_tmy_query(tmy_file):
    dataset = IndiaSpectralTMYDataset(tmy_file)
    with pytest.raises(IndiaSpectralTMYError, match="hour_of_year"):
        dataset.sample(8760, 10, 78)
    with pytest.raises(IndiaSpectralTMYError, match="10 nm"):
        dataset.sample(12, 10, 78, 555)
