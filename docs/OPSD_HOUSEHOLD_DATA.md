# OPSD household load data

GridNexus can use the supplied Open Power System Data Household Data package
through `engine/app/data/opsd_household.py`. It reads the hourly CSV
`household_data_60min_singleindex.csv` and returns only `*_grid_import`
measurements, preserving missing data as missing rather than inventing a zero
load.

Set `OPSD_HOUSEHOLD_DATA_PATH` to the absolute path of the hourly CSV when
running the engine. The adapter defaults to the six residential aggregate
import profiles; callers can explicitly select other `*_grid_import` columns
when an experiment requires industrial profiles.

The values are interval energy in kWh. Because the chosen file has a 60-minute
resolution, each value has the same numeric magnitude as the interval-average
power in kW. This must not be assumed if the adapter is later extended to the
15- or 1-minute files.

Source: Open Power System Data (2020), *Data Package Household Data*, version
2020-04-15. License: CC-BY-4.0.
