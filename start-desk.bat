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
echo HUB Predictions host stays on http://127.0.0.1:8080
echo Leave THIS window open. Refresh is safe.
echo A tab on 18080 now redirects to 8080. Do not use Vite's inner port.
echo.
echo Off home Wi-Fi: install Tailscale on this PC and on the phone / iPad
echo using the same account. Then open the Tailscale URL printed below.
where tailscale >nul 2>&1
if not errorlevel 1 (
  echo Tailscale desk URL:
  for /f %%I in ('tailscale ip -4') do echo   http://%%I:8080
) else (
  echo Tailscale is not installed yet. See UPDATE-HUB.txt — phone away from home.
)
netsh advfirewall firewall add rule name="HUB Predictions 8080" dir=in action=allow protocol=tcp localport=8080 >nul 2>&1
echo.

:loop
call npm.cmd run dev
echo Desk host exited — restarting in 2 seconds...
timeout /t 2 /nobreak >nul
goto loop
