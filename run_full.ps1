Write-Host "===================================================="
Write-Host "Starting GridNexus Full System Mode"
Write-Host "===================================================="
Write-Host ""
Write-Host "This mode runs the complete system including the Python engine,"
Write-Host "Node.js broker, React frontend, and databases using Docker Compose."
Write-Host ""
Write-Host "Setting up environment files..."
if (-not (Test-Path "engine/.env")) {
    Copy-Item "engine/.env.example" "engine/.env"
}
if (-not (Test-Path "broker/.env")) {
    Copy-Item "broker/.env.example" "broker/.env"
}
Write-Host "Starting Docker Compose..."
docker compose up -d --build
Write-Host ""
Write-Host "Containers are starting up! Access the dashboard at http://localhost:5173"
