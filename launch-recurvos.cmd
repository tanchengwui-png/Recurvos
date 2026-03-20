@echo off
setlocal

set "ROOT=%~dp0"
set "API_PORT=7001"
set "WEB_PORT=5173"
set "WHATSAPP_PORT=3011"

taskkill /FI "WINDOWTITLE eq Recurvos API" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Recurvos Web" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Recurvos WhatsApp Worker" /T /F >nul 2>nul

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%API_PORT% .*LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%WEB_PORT% .*LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%WHATSAPP_PORT% .*LISTENING"') do taskkill /PID %%P /T /F >nul 2>nul
start "Recurvos API" cmd /k "cd /d %ROOT% && dotnet run --project src\Recurvos.Api --urls http://localhost:%API_PORT%"
start "Recurvos Web" cmd /k "cd /d %ROOT%src\Recurvos.Web && npm.cmd run dev -- --host localhost --port %WEB_PORT%"
start "Recurvos WhatsApp Worker" cmd /k "cd /d %ROOT%src\Recurvos.WhatsAppWorker && set PORT=%WHATSAPP_PORT% && npm.cmd start"

echo API: http://localhost:%API_PORT%/swagger
echo Web: http://localhost:%WEB_PORT%
echo WhatsApp Worker: http://localhost:%WHATSAPP_PORT%/api/health
