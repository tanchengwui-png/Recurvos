@echo off
setlocal

set "ROOT=%~dp0"
set "API_PORTS=7001 5233 7100"
set "API_PROJECT=src\Recurvos.Api\Recurvos.Api.csproj"
set "ASPNETCORE_ENVIRONMENT=Development"

taskkill /FI "WINDOWTITLE eq Recurvos API" /T /F >nul 2>nul
for %%P in (%API_PORTS%) do (
    for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do taskkill /PID %%I /T /F >nul 2>nul
)

cd /d "%ROOT%"

echo Resetting Recurvos demo data...
dotnet run --project "%API_PROJECT%" --no-launch-profile -- --reset-demo-data
if errorlevel 1 exit /b 1

echo.
echo Fresh data is ready.
echo API project: %API_PROJECT%
echo Platform owner: owner@recurvo.com / Passw0rd!
echo Subscriber Basic: tanchengwui+basic@hotmail.com / Passw0rd!
echo Subscriber Growth: tanchengwui+growth@hotmail.com / Passw0rd!
echo Subscriber Premium: tanchengwui+premium@hotmail.com / Passw0rd!
