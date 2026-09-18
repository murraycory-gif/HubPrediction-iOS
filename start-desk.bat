@echo off
setlocal
cd /d "%~dp0hub-prediction"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not on PATH. Install Node 20+, then open this file again.
  pause
  exit /b 1
)

if not exist "node_modules\vite" (
  echo Installing desk packages...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting HUB Predictions on http://localhost:8080
echo Leave THIS window open. Refreshing Chrome cannot start the desk.
echo When you see Local: http://localhost:8080 open that URL and press Ctrl+Shift+R.
echo.

call npm.cmd run dev
if errorlevel 1 (
  echo.
  echo Desk stopped. If Chrome says localhost refused to connect, run this file again.
  echo If port 8080 is already in use, Ctrl+C the other npm window first.
  pause
)
endlocal
