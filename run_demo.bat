@echo off
echo ====================================================
echo Starting GridNexus Frontend-Only Demo Mode
echo ====================================================
echo.
echo This mode bypasses the backend and Docker containers.
echo It serves mocked API data for a seamless UI demo.
echo.
echo Starting Vite dev server...
cd command-center
set VITE_DEMO_MODE=true
npm run dev -- --port 5174
