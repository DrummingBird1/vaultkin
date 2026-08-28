# SecureVault launcher (Windows PowerShell)
#
# Usage:
#   .\launch.ps1               # Electron dev mode (default)
#   .\launch.ps1 -Web          # Web-only dev server (no Electron)
#   .\launch.ps1 -Build        # Production build, then run the built Electron app
#
# If PowerShell blocks the script: right-click -> Properties -> Unblock,
# or run once:  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

[CmdletBinding()]
param(
  [switch]$Web,
  [switch]$Build
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Write-Section($text) {
  Write-Host ""
  Write-Host "  $text" -ForegroundColor Cyan
  Write-Host ("  " + ("-" * $text.Length)) -ForegroundColor DarkCyan
  Write-Host ""
}

Write-Section "SecureVault launcher"

# --- Check Node.js ---
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "[ERROR] Node.js not found on PATH." -ForegroundColor Red
  Write-Host "        Install Node 20+ from https://nodejs.org/ and retry." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}

$nodeVersion = (node -v) -replace '^v', ''
$nodeMajor   = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 20) {
  Write-Host "[WARN]  Node $nodeVersion detected; SecureVault expects 20+." -ForegroundColor Yellow
}
Write-Host "[OK]    Node $nodeVersion" -ForegroundColor Green

# --- Install dependencies on first run ---
if (-not (Test-Path "node_modules")) {
  Write-Host "[INFO]  node_modules missing - running 'npm install'..." -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"; exit 1
  }
}
Write-Host "[OK]    Dependencies installed" -ForegroundColor Green

# --- Launch ---
if ($Build) {
  Write-Section "Building production Electron app"
  npm run electron:build
  if ($LASTEXITCODE -ne 0) { Read-Host "Press Enter to exit"; exit 1 }
  $built = Get-ChildItem -Path "release" -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($built) {
    Write-Host "[OK]    Built: $($built.FullName)" -ForegroundColor Green
    Start-Process $built.FullName
  } else {
    Write-Host "[WARN]  Build succeeded but no .exe found in /release. Check electron-builder output." -ForegroundColor Yellow
  }
} elseif ($Web) {
  Write-Section "Starting Vite dev server"
  Write-Host "[INFO]  http://localhost:5173" -ForegroundColor Cyan
  npm run dev
} else {
  Write-Section "Starting Electron + Vite"
  Write-Host "[INFO]  Close the Electron window or press Ctrl+C here to stop." -ForegroundColor Cyan
  try {
    npm run electron:dev
  } catch {
    Write-Host "[WARN]  electron:dev failed - falling back to web mode." -ForegroundColor Yellow
    npm run dev
  }
}
