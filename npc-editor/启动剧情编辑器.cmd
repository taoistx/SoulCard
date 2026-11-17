@echo off
setlocal
title Dialogue Editor - keep this window open

pushd "%~dp0.."
if errorlevel 1 goto project_missing

set "EDITOR_PYTHON="
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; assert sys.version_info >= (3, 10)" >nul 2>nul
  if not errorlevel 1 set "EDITOR_PYTHON=py -3"
)
if defined EDITOR_PYTHON goto launch

python -c "import sys; assert sys.version_info >= (3, 10)" >nul 2>nul
if not errorlevel 1 set "EDITOR_PYTHON=python"
if defined EDITOR_PYTHON goto launch

python3 -c "import sys; assert sys.version_info >= (3, 10)" >nul 2>nul
if not errorlevel 1 set "EDITOR_PYTHON=python3"
if defined EDITOR_PYTHON goto launch

echo Python 3.10 or newer was not found. Install Python and run this file again.
popd
pause
exit /b 1

:launch
echo Starting the dialogue editor with JSON read/write support.
echo A new local port will be selected. Use the browser page opened by this window.
echo Keep this window open while editing. Press Ctrl+C to stop the server.
echo.
%EDITOR_PYTHON% -u "%~dp0server.py" --port 0 --open
set "EDITOR_EXIT=%ERRORLEVEL%"
popd
if "%EDITOR_EXIT%"=="0" exit /b 0
echo.
echo The dialogue editor could not start. See the error above.
pause
exit /b %EDITOR_EXIT%

:project_missing
echo The project folder could not be opened: "%~dp0.."
pause
exit /b 1
