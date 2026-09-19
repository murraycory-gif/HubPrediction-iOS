@echo off
setlocal
cd /d "%~dp0hub-prediction"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not on PATH. Install Node 20+, then open this file again.
  pause
  exit /b 1
)

echo.
echo Building OUR phone tunnel. No Tailscale. No account. No monthly fee.
echo.

call node desk-tunnel.mjs
if errorlevel 1 (
  echo desk-tunnel failed.
  pause
  exit /b 1
)

echo.
echo 1. Install WireGuard on this PC (free, no sign-in):
echo    https://www.wireguard.com/install/
echo 2. WireGuard → Import tunnel from file →
echo    %~dp0.secrets\wireguard\hub-desk-server.conf
echo    then Activate.
echo 3. Router: forward UDP 51820 to this PC. Do NOT forward 8080.
echo 4. If endpoint.txt is empty, put your home public IPv4 on one line
echo    in %~dp0.secrets\wireguard\endpoint.txt and run this bat again.
echo 5. AirDrop hub-desk-phone.conf / hub-desk-ipad.conf / hub-desk-other-pc.conf
echo    WireGuard on the device → Add → Create from file → Activate.
echo 6. On the device open http://10.77.0.1:8080
echo    Leave the desk window open on this PC.
echo.

netsh advfirewall firewall add rule name="HUB Predictions tunnel 51820" dir=in action=allow protocol=udp localport=51820 >nul 2>&1
netsh advfirewall firewall add rule name="HUB Predictions 8080" dir=in action=allow protocol=tcp localport=8080 >nul 2>&1

echo Configs:
echo   %~dp0.secrets\wireguard
echo.
pause
endlocal
