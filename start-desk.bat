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
  call npm.cmd install --no-fund --no-audit
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo HUB Predictions: http://127.0.0.1:8080
echo Leave THIS window open. That is the only desk URL. Refresh is safe.
echo.
echo Off home Wi-Fi: our tunnel. Double-click start-tunnel.bat once.
echo After WireGuard is Active on the phone open http://10.77.0.1:8080
echo Soft FAIL Tailscale / paid relay / router-forward of 8080.
netsh advfirewall firewall add rule name="HUB Predictions 8080" dir=in action=allow protocol=tcp localport=8080 >nul 2>&1
echo.
echo Taking 8080 back if an old desk window is still holding it...
call "%~dp0free-desk-ports.bat"

:loop
call npm.cmd run dev
echo Desk host exited - restarting in 2 seconds...
timeout /t 2 /nobreak >nul
goto loop
