# GridNexus Reproducibility Package

This directory contains the artifacts and instructions necessary to fully reproduce the experiments in the GridNexus manuscript.

## 1. Environment Setup

We recommend using Docker to ensure dependency consistency (particularly with `numpy` and `pandapower` versions).

### Docker Instructions
```bash
docker build -t gridnexus .
docker run -it gridnexus /bin/bash
```

### Local Setup
If running locally, ensure you use the exact lockfile:
```bash
pip install -r requirements.txt
# Critical dependency: pandapower==3.5.4 with compatible numpy
```

## 2. Generating Scenarios

To generate the factorial test scenarios used across the experiments:
```bash
python engine/scripts/experiments/scenario_generator.py --all
```
This generates the agent distributions, topologies, and loads stored in `results/manifests/`.

## 3. Running the Benchmark Suite

We provide a streamlined CLI to run the full end-to-end evaluation.

**Quick Smoke Test** (Verifies pipeline execution without long simulation times)
```bash
export PYTHONPATH="engine"
python engine/gridnexus_cli.py reproduce --quick
```

**Full Paper Reproduction** (Takes ~10-15 hours depending on compute)
```bash
export PYTHONPATH="engine"
python engine/gridnexus_cli.py reproduce --full
```

## 4. Generated Artifacts

Upon completion of the full suite, the following files will be populated in `results/`:
- `ablation_study.csv`
- `sybil_sweep.csv`
- `collusion_sweep.csv`
- `misreporting_sweep.csv`
- `scalability_sweep.csv`
- `patent_technical_effect.csv`

## 5. Known Limitations
- The current AC verification benchmark scales to 1000 agents; running beyond this requires distributed solvers not included in this package.
- The `CS-SafeMAPPO` agent checkpoints included here are pre-trained for 1M steps. Fine-tuning from scratch requires an external GPU cluster.
