Write-Host "===================================================="
Write-Host "Starting GridNexus Frontend-Only Demo Mode"
Write-Host "===================================================="
Write-Host ""
Write-Host "This mode bypasses the backend and Docker containers."
Write-Host "It serves mocked API data for a seamless UI demo."
Write-Host ""
Write-Host "Starting Vite dev server..."
cd command-center
$env:VITE_DEMO_MODE="true"
npm run dev
