@echo off
title Vaultkin DEBUG
cd /d "%~dp0"

echo === Vaultkin diagnostics ===
echo.
echo Current directory:
cd
echo.
echo Node version:
node -v 2>nul || echo   [NOT INSTALLED]
echo.
echo npm version:
npm -v 2>nul || echo   [NOT INSTALLED]
echo.
echo package.json present:
if exist package.json (echo   yes) else (echo   NO - this is not a valid project root)
echo.
echo node_modules present:
if exist node_modules\ (echo   yes) else (echo   no - first run will need npm install)
echo.
echo === End diagnostics ===
echo.
echo Press any key to close...
pause >nul
