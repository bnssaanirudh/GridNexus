param([switch]$Build)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    foreach ($config in @('broker/.env', 'engine/.env')) {
        if (!(Test-Path $config)) { throw "Missing $config. Run scripts/configure-local-env.ps1 first." }
    }
    if ($Build) { docker compose up -d --build --wait --wait-timeout 180 }
    else { docker compose up -d --wait --wait-timeout 180 }
    if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Inspect docker compose logs.' }
    Write-Host 'GridNexus: http://localhost:5173'
    Write-Host 'Existing data preserved. Seeding is a separate, explicit operation.'
} finally { Pop-Location }
