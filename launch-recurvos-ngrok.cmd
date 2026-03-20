@echo off
setlocal

set "API_PORT=7001"
set "WEB_PORT=5173"
set "NGROK_PATH=C:\tools\ngrok.exe"
set "MODE=%~1"

if /I "%MODE%"=="" set "MODE=all"

if not exist "%NGROK_PATH%" (
    echo ngrok.exe was not found at %NGROK_PATH%
    exit /b 1
)

if /I not "%MODE%"=="api" if /I not "%MODE%"=="web" if /I not "%MODE%"=="all" (
    echo Usage: launch-recurvos-ngrok.cmd [api^|web^|all]
    exit /b 1
)

if /I "%MODE%"=="api" goto :start_api
if /I "%MODE%"=="web" goto :start_web

taskkill /FI "WINDOWTITLE eq Recurvos Ngrok API" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Recurvos Ngrok Web" /T /F >nul 2>nul

start "Recurvos Ngrok API" cmd /k "cd /d C:\tools && ngrok.exe http %API_PORT%"
start "Recurvos Ngrok Web" cmd /k "cd /d C:\tools && ngrok.exe http %WEB_PORT%"

echo Started ngrok for API and Web.
echo API local target: http://localhost:%API_PORT%
echo Web local target: http://localhost:%WEB_PORT%
echo.
echo Copy the public HTTPS URLs from the ngrok windows or dashboard.
echo Use the API tunnel for Billplz webhook:
echo   {API_NGROK_URL}/api/webhooks/billplz
goto :eof

:start_api
taskkill /FI "WINDOWTITLE eq Recurvos Ngrok API" /T /F >nul 2>nul
start "Recurvos Ngrok API" cmd /k "cd /d C:\tools && ngrok.exe http %API_PORT%"
echo Started ngrok for API only.
echo Local target: http://localhost:%API_PORT%
echo Billplz webhook: {API_NGROK_URL}/api/webhooks/billplz
goto :eof

:start_web
taskkill /FI "WINDOWTITLE eq Recurvos Ngrok Web" /T /F >nul 2>nul
start "Recurvos Ngrok Web" cmd /k "cd /d C:\tools && ngrok.exe http %WEB_PORT%"
echo Started ngrok for Web only.
echo Local target: http://localhost:%WEB_PORT%
