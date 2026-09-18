@echo off
setlocal

cd /d "%~dp0.."

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Please install Python or start this project with another static server.
  pause
  exit /b 1
)

start "NPC Editor Static Server - close this window to stop" /D "%CD%" python -m http.server 8000 --bind 127.0.0.1
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8000/npc-editor/index.html"

endlocal
