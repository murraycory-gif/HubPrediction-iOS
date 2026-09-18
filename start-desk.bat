@echo off
setlocal
cd /d "%~dp0hub-prediction"
echo Starting HUB Predictions. Open http://localhost:8080
echo Leave this window open. Soft FAIL grok.me.
call npm.cmd run dev
endlocal
