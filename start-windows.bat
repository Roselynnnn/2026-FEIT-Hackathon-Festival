@echo off
setlocal
cd /d "%~dp0"

echo Starting Road Twin...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-windows.ps1"

if errorlevel 1 (
  echo.
  echo The website could not be started.
  echo Please copy the error above and send it to the project team.
  pause
)
