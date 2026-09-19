@echo off
cd /d "%~dp0"
if "%HUB_DESK_START%"=="1" goto :run

setlocal
echo.
echo === HUB Predictions - pull latest and start the desk ===
echo The only address is http://127.0.0.1:8080
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo Git is not on PATH. Install Git for Windows, then open this file again.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not on PATH. Install Node 20+, then open this file again.
  pause
  exit /b 1
)

set BRANCH=%~1
if "%BRANCH%"=="" (
  if exist desk-branch.txt (
    set /p BRANCH=<desk-branch.txt
  )
)
if "%BRANCH%"=="" set BRANCH=cursor/host-kalshi-creds-be4f

echo Fetching origin %BRANCH%...
git fetch origin +%BRANCH%:refs/remotes/origin/%BRANCH%
if errorlevel 1 (
  git fetch origin %BRANCH%
)
if errorlevel 1 (
  echo git fetch failed.
  pause
  exit /b 1
)

echo Checking out %BRANCH%...
git checkout -B %BRANCH% FETCH_HEAD
if errorlevel 1 (
  echo Could not checkout %BRANCH%. If I gave you a new branch name, run:
  echo   update-desk.bat cursor/new-name-be4f
  pause
  exit /b 1
)
git reset --hard FETCH_HEAD
if errorlevel 1 (
  echo git reset failed.
  pause
  exit /b 1
)

echo.
echo Now on:
git log -1 --oneline
echo.
echo Restarting with the files just pulled...
endlocal
set HUB_DESK_START=1
call "%~f0" %*
exit /b %ERRORLEVEL%

:run
setlocal
cd /d "%~dp0hub-prediction"
call npm.cmd install --no-fund --no-audit
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo Desk host starting. Leave THIS window open.
echo Open http://127.0.0.1:8080  - that is the only desk URL. Refresh is safe.
echo If Chrome says refused, this window is closed. Double-click start-desk.bat.
echo Off home Wi-Fi: our tunnel. Double-click start-tunnel.bat once, then
echo on the phone open http://10.77.0.1:8080
echo.
echo Taking 8080 back if an old desk window is still holding it...
call "%~dp0free-desk-ports.bat"

:loop
call npm.cmd run dev
echo Desk host exited - restarting in 2 seconds...
timeout /t 2 /nobreak >nul
goto loop
