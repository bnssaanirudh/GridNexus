@echo off
echo ====================================================
echo GridNexus v1.0 Research Reproducibility Suite
echo ====================================================
echo.
echo Running Load Scalability Benchmarks...
cd engine
python scripts/experiments/load_benchmark.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Load Benchmark Failed.
    exit /b %ERRORLEVEL%
)
echo.
echo Running Chaos Resilience Tests...
python -m pytest tests/test_chaos_resilience.py --no-cov
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Chaos Tests Failed.
    exit /b %ERRORLEVEL%
)
echo.
echo Running Hardware-in-the-Loop Gateway Tests...
python -m pytest tests/test_hil_gateway.py --no-cov
if %ERRORLEVEL% neq 0 (
    echo [ERROR] HIL Tests Failed.
    exit /b %ERRORLEVEL%
)
echo.
echo Running Patent Technical Effect Ablation Study...
python -m scripts.experiments.patent_technical_effect
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Patent Technical Effect Study Failed.
    exit /b %ERRORLEVEL%
)
echo.
echo ====================================================
echo SUCCESS! All v1.0 research claims reproduced.
echo Patent evidence saved to engine/artifacts/patent_technical_effect_evidence.csv
echo ====================================================
cd ..
