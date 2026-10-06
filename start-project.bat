@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
set "APP_URL=http://127.0.0.1:4200/"

where npm >nul 2>&1
if errorlevel 1 (
    echo npm was not found. Install Node.js and try again.
    pause
    exit /b 1
)

where curl.exe >nul 2>&1
if errorlevel 1 (
    echo curl.exe was not found. Install a current Windows version and try again.
    pause
    exit /b 1
)

if not exist "%PROJECT_DIR%node_modules\.bin\ng.cmd" (
    echo Dependencies are missing. Run npm ci in this folder first.
    pause
    exit /b 1
)

rem Reuse an already running development server when possible.
call :wait_for_server 1
if not errorlevel 1 goto open_browser

echo Starting Angular development server...
start "Syllogimous v4" cmd /k "cd /d ""%PROJECT_DIR%"" && npm start -- --host 127.0.0.1 --port 4200"

call :wait_for_server 60
if errorlevel 1 (
    echo The development server did not become ready within 60 seconds.
    echo Check the Syllogimous v4 terminal window for details.
    pause
    exit /b 1
)

:open_browser
echo Opening %APP_URL%
start "" "%APP_URL%"
exit /b 0

:wait_for_server
set "WAIT_SECONDS=%~1"
for /l %%I in (1,1,%WAIT_SECONDS%) do (
    curl.exe --silent --fail --max-time 2 "%APP_URL%" >nul 2>&1
    if not errorlevel 1 exit /b 0
    if %%I LSS %WAIT_SECONDS% powershell -NoProfile -Command "Start-Sleep -Seconds 1" >nul 2>&1
)
exit /b 1
