# Instala o worker Python de download de documentos (Windows).
# Uso: npm run doc-downloader:install
#
# IMPORTANTE: Este servico e SEPARADO da IA Gemini (auditoria OCR / chat).
# - doc-downloader Python = baixar SPED/documentos fiscais com certificado A1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$DocDir = Join-Path $Root "doc_downloader"
$Venv = Join-Path $DocDir ".venv"
$Py = Join-Path $Venv "Scripts\python.exe"

function Test-RealPython {
    param([string]$Cmd = "python")
    try {
        $path = (Get-Command $Cmd -ErrorAction Stop).Source
        if ($path -like "*WindowsApps*") { return $null }
        $ver = & $Cmd --version 2>&1
        if ($ver -match "Python 3\.(1[0-9]|[2-9][0-9])") {
            return $Cmd
        }
    } catch { }
    return $null
}

function Install-PythonViaWinget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        return $false
    }
    Write-Host "[doc-downloader] Instalando Python 3.12 via winget (pode pedir confirmacao)..." -ForegroundColor Yellow
    winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
    return $LASTEXITCODE -eq 0
}

Write-Host "[doc-downloader] Verificando Python 3.10+..."
$pythonCmd = Test-RealPython "python"
if (-not $pythonCmd) { $pythonCmd = Test-RealPython "python3" }

if (-not $pythonCmd) {
    Write-Host ""
    Write-Host "Python real nao encontrado (atalho da Microsoft Store nao serve)." -ForegroundColor Red
    Write-Host "Tentando instalar automaticamente..." -ForegroundColor Yellow

    if (Install-PythonViaWinget) {
        Start-Sleep -Seconds 3
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")
        $pythonCmd = Test-RealPython "python"
    }
}

if (-not $pythonCmd) {
    Write-Host ""
    Write-Host "Instale Python manualmente:" -ForegroundColor Yellow
    Write-Host "  1. https://www.python.org/downloads/" -ForegroundColor Cyan
    Write-Host "  2. Marque 'Add python.exe to PATH'" -ForegroundColor Cyan
    Write-Host "  3. Rode novamente: npm run doc-downloader:install" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Gemini AI NAO substitui Python para download de documentos." -ForegroundColor DarkGray
    exit 1
}

Write-Host "[doc-downloader] Usando: $pythonCmd"
Set-Location $DocDir

if (-not (Test-Path $Venv)) {
    Write-Host "[doc-downloader] Criando ambiente virtual..."
    & $pythonCmd -m venv .venv
}

Write-Host "[doc-downloader] Instalando dependencias..."
& $Py -m pip install --upgrade pip --quiet
& $Py -m pip install -r requirements.txt

Write-Host ""
Write-Host "[doc-downloader] Pronto! Servico em http://127.0.0.1:8766" -ForegroundColor Green
Write-Host "  npm run dev              -> sobe tudo (Vite + API + Python)"
Write-Host "  npm run doc-downloader   -> sobe so o worker Python"
Write-Host ""
Write-Host "Download de SPED/documentos: Python nativo (certificado A1)." -ForegroundColor Cyan
Write-Host "IA: Gemini free tier (aba Config. IA)." -ForegroundColor DarkGray
