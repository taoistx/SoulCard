@echo off
setlocal

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Please install Python or start this folder with another static server.
  pause
  exit /b 1
)

start "Demo Server - close this window to stop" /D "%CD%" python node-editor\server.py
powershell -NoProfile -Command "Start-Sleep -Seconds 1"
start "" "http://127.0.0.1:8765/index.html"

endlocal
