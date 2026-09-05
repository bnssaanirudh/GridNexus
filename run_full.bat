@echo off
echo ====================================================
echo Starting GridNexus Full System Mode
echo ====================================================
echo.
echo This mode runs the complete system including the Python engine,
echo Node.js broker, React frontend, and databases using Docker Compose.
echo.
echo Setting up environment files...
if not exist "engine\.env" copy "engine\.env.example" "engine\.env"
if not exist "broker\.env" copy "broker\.env.example" "broker\.env"
echo Starting Docker Compose...
docker compose up -d --build
echo.
echo Containers are starting up! Access the dashboard at http://localhost:5173
pause
