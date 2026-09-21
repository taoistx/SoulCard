@echo off
setlocal

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Please install Python or start this folder with another static server.
  pause
  exit /b 1
)

python demo-server.py

endlocal
