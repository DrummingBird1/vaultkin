@echo off
title SecureVault Launcher
cd /d "%~dp0"

echo.
echo  =====================================
echo   SecureVault - Launcher
echo  =====================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found on PATH.
    echo         Install Node 20+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_V=%%v
echo [OK]    Node %NODE_V%
echo.

if not exist "node_modules\" (
    echo [INFO]  Installing dependencies for the first time...
    echo         This downloads ~150 MB and may take 1-3 minutes.
    echo.
    call npm install --no-audit --no-fund --loglevel=warn
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. See output above.
        pause
        exit /b 1
    )
    echo.
    echo [OK]    Dependencies installed.
    echo.
)

echo [INFO]  Starting SecureVault ^(Electron + Vite^)...
echo         An Electron window will open in 10-30 seconds.
echo         Keep this window open. Press Ctrl+C here to stop.
echo.

call npm run electron:dev

echo.
echo [INFO]  SecureVault stopped.
pause
