@echo off
rem Entry point for the VANTAGE desktop shortcut.
rem Starts the dev server in the background if it is not already running,
rem then opens the app in a chromeless "app" window.
rem NOTE: keep this file ASCII-only -- non-ASCII text here has previously
rem corrupted cmd.exe's batch parsing on this Shift-JIS locale system.
setlocal

set "PROJECT_DIR=C:\Users\atsua\projects\stock-news-app"
set "NODE_DIR=%PROJECT_DIR%\.nodejs\node-v22.14.0-win-x64"
set "APP_URL=http://localhost:3000"
set "PATH=%NODE_DIR%;%PATH%"

powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto openbrowser

echo Starting VANTAGE server, please wait...
start "VANTAGE Server" /min cmd /k "cd /d "%PROJECT_DIR%" && npm run dev"

:waitloop
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if errorlevel 1 goto waitloop

:openbrowser
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if exist "%CHROME%" (
  start "" "%CHROME%" --app=%APP_URL%
) else if exist "%EDGE%" (
  start "" "%EDGE%" --app=%APP_URL%
) else (
  start "" %APP_URL%
)

endlocal
