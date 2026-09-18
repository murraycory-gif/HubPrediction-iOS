@echo off
setlocal
cd /d "%~dp0"

echo.
echo === HUB Predictions — pull latest and start the desk ===
echo Stop any old npm run dev window first (Ctrl+C).
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
git fetch origin %BRANCH%
if errorlevel 1 (
  echo git fetch failed.
  pause
  exit /b 1
)

echo Checking out %BRANCH%...
git checkout -B %BRANCH% origin/%BRANCH%
if errorlevel 1 (
  echo Could not checkout %BRANCH%. If I gave you a new branch name, run:
  echo   update-desk.bat cursor/new-name-be4f
  pause
  exit /b 1
)

git pull origin %BRANCH%
if errorlevel 1 (
  echo git pull failed.
  pause
  exit /b 1
)

echo.
echo Now on:
git log -1 --oneline
echo.

cd /d "%~dp0hub-prediction"
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo Desk starting. On this PC open:
echo   http://localhost:8080
echo Hard-refresh the tab (Ctrl+Shift+R). Leave this window open.
echo.

call npm run dev
endlocal
