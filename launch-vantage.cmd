@echo off
rem Entry point for the VANTAGE desktop shortcut.
rem Starts the dev server hidden in the background if it is not already running,
rem opens the app in a chromeless "app" window, and waits for that window to
rem close so it can shut the server back down automatically (only if this
rem script is the one that started it -- if the server was already running,
rem some other window may still depend on it, so it's left alone).
rem NOTE: keep this file ASCII-only -- non-ASCII text here has previously
rem corrupted cmd.exe's batch parsing on this Shift-JIS locale system.
setlocal

set "PROJECT_DIR=C:\Users\atsua\projects\stock-news-app"
set "NODE_DIR=%PROJECT_DIR%\.nodejs\node-v22.14.0-win-x64"
set "APP_URL=http://localhost:3000"
set "APP_PROFILE=%TEMP%\vantage-app-profile"
set "PATH=%NODE_DIR%;%PATH%"

set "WE_STARTED_SERVER=0"

powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto openbrowser

set "WE_STARTED_SERVER=1"
echo Starting VANTAGE server, please wait...
rem Fully hidden launch (no console window at all, not even minimized in the
rem taskbar) via a PowerShell Start-Process with -WindowStyle Hidden on the
rem child cmd.exe too.
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c cd /d \"%PROJECT_DIR%\" && npm run dev' -WindowStyle Hidden"

:waitloop
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if errorlevel 1 goto waitloop

:openbrowser
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

rem --user-data-dir gives this window its own dedicated browser process instead
rem of handing off to an already-running Chrome/Edge instance (which is Chrome's
rem normal single-instance behavior). Without it, "start /wait" below would
rem return immediately -- the launched .exe hands off to the existing instance
rem and exits right away, even though the app window stays open elsewhere.
rem With it, "start /wait" reliably blocks for exactly as long as this window
rem is open, so closing it is what lets this script continue below.
if exist "%CHROME%" (
  start "" /wait "%CHROME%" --app=%APP_URL% --user-data-dir="%APP_PROFILE%"
) else if exist "%EDGE%" (
  start "" /wait "%EDGE%" --app=%APP_URL% --user-data-dir="%APP_PROFILE%"
) else (
  start "" %APP_URL%
  goto end
)

rem The app window has been closed. Shut the server down too, but only if this
rem script is the one that started it (see stop-vantage.cmd for a manual option).
if "%WE_STARTED_SERVER%"=="1" (
  echo Closing VANTAGE server...
  powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
)

:end
endlocal
