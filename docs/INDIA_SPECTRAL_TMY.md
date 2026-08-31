# India spectral TMY data

GridNexus reads `india_spectral_tmy.h5` through
`engine/app/data/india_spectral_tmy.py`. The file contains a typical year of
hourly data (8,760 rows) at 117 India locations, with coordinates ordered as
latitude, longitude.

The reader selects the nearest grid point for a requested latitude/longitude
and applies each HDF5 dataset's `scale_factor` before returning values. It
provides air temperature, global/diffuse horizontal irradiance, direct normal
irradiance, wind speed, precipitable water, representative source year, and a
selected 10 nm spectral band (300–1800 nm).

Set `INDIA_SPECTRAL_TMY_PATH` to the `.h5` file. In the Docker stack this is
mounted read-only at `/data/india_spectral_tmy.h5`. `INDIA_TMY_LATITUDE` and
`INDIA_TMY_LONGITUDE` choose the location used by the RL environment; the
defaults are India's geographic centre and are intentionally configurable.

The RL environment now derives the Oracle's temperature and diffuse-fraction
cloud proxy from one sampled TMY hour when the file is available. This replaces
the prior independent random temperature/cloud inputs while retaining the old
simulation fallback when the dataset is absent.
