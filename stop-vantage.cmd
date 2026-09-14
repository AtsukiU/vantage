@echo off
rem Stops the VANTAGE server started by launch-vantage.cmd. Needed because that
rem launcher now runs the server fully hidden (no window to close manually).
rem NOTE: keep this file ASCII-only -- see launch-vantage.cmd for why.
setlocal

echo Stopping VANTAGE server (port 3000)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo Done.

endlocal
