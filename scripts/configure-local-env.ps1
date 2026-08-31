param(
  [ValidateSet("simulation", "production")]
  [string]$Mode = "simulation"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$brokerEnv = Join-Path $repoRoot "broker/.env"
$engineEnv = Join-Path $repoRoot "engine/.env"

function New-Secret {
  return [Convert]::ToHexString(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  ).ToLowerInvariant()
}

function Set-DotEnvValue {
  param([string]$Path, [string]$Name, [string]$Value)

  $lines = if (Test-Path -LiteralPath $Path) {
    [Collections.Generic.List[string]](Get-Content -LiteralPath $Path)
  } else {
    [Collections.Generic.List[string]]::new()
  }

  $updated = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match "^$([regex]::Escape($Name))=") {
      $lines[$index] = "$Name=$Value"
      $updated = $true
      break
    }
  }
  if (-not $updated) { $lines.Add("$Name=$Value") }

  [IO.File]::WriteAllLines($Path, $lines, [Text.UTF8Encoding]::new($false))
}

$userJwtSecret = New-Secret
$agentJwtSecret = New-Secret

Set-DotEnvValue -Path $brokerEnv -Name "JWT_SECRET" -Value $userJwtSecret
Set-DotEnvValue -Path $engineEnv -Name "JWT_SECRET_KEY" -Value $userJwtSecret
Set-DotEnvValue -Path $brokerEnv -Name "ENGINE_JWT_SECRET" -Value $agentJwtSecret
Set-DotEnvValue -Path $engineEnv -Name "ENGINE_JWT_SECRET" -Value $agentJwtSecret
Set-DotEnvValue -Path $brokerEnv -Name "GRIDNEXUS_MODE" -Value $Mode
Set-DotEnvValue -Path $engineEnv -Name "GRIDNEXUS_MODE" -Value $Mode
Set-DotEnvValue -Path $brokerEnv -Name "CORS_ORIGINS" -Value "http://localhost:5173,http://127.0.0.1:5173"
Set-DotEnvValue -Path $engineEnv -Name "CORS_ORIGINS" -Value "http://localhost:5173,http://127.0.0.1:5173"

Write-Host "GridNexus local authentication and CORS settings are synchronized ($Mode mode)."
Write-Host "Signing key values were generated locally and were not printed."
