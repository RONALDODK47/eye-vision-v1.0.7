# Auto: sobe Docker + Postgres/MinIO apos reboot (WSL/VM Platform)
$ErrorActionPreference = "Continue"
$log = Join-Path $PSScriptRoot "after-reboot-setup.log"
function Log($m) { $line = "$(Get-Date -Format o) $m"; Add-Content -Path $log -Value $line -Encoding UTF8; Write-Host $line }

Log "=== after-reboot-setup start ==="
$env:Path = "C:\Program Files\Docker\Docker\resources\bin;" + [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Garantir features
try {
  dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
  dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
  Log "DISM features ok"
} catch { Log "DISM: $_" }

# Iniciar Docker Desktop
$dd = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dd) {
  Start-Process $dd
  Log "Docker Desktop launched"
} else {
  Log "Docker Desktop.exe nao encontrado"
}

# Esperar engine
$ok = $false
for ($i = 1; $i -le 90; $i++) {
  Start-Sleep -Seconds 5
  $out = & docker info 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0 -and $out -match "Server Version") {
    Log "Docker engine ready (attempt $i)"
    $ok = $true
    break
  }
  if ($i % 6 -eq 0) { Log "Aguardando Docker engine... ($i/90)" }
}

if (-not $ok) {
  Log "FALHA: Docker engine nao ficou pronto. Verifique BIOS/virtualizacao."
  exit 1
}

Set-Location "c:\Users\ronaldo.silva\Desktop\EYE-VISION-SOFTWARE-LEVE"
Log "docker compose up..."
& npm run storage:up 2>&1 | Tee-Object -FilePath $log -Append
Log "migrate..."
& npm run storage:migrate 2>&1 | Tee-Object -FilePath $log -Append
Log "=== after-reboot-setup done ==="
