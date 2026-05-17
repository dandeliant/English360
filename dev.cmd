@echo off
REM English 360 — one-click dev launcher.
REM
REM Double-click this file to:
REM   1) point Node at the Windows certificate bundle (works around Avast
REM      HTTPS scanning that otherwise breaks npm fetches),
REM   2) start the Astro dev server,
REM   3) open http://localhost:4321/ in your default browser.
REM
REM Close this console window (or press Ctrl+C twice) to stop the server.

setlocal
cd /d "%~dp0"

set "NODE_EXTRA_CA_CERTS=%USERPROFILE%\.node-ca-bundle.pem"
title English 360 - dev

echo.
echo ==========================================
echo   English 360 - dev launcher
echo ==========================================
echo   Folder:    %CD%
if exist "%NODE_EXTRA_CA_CERTS%" (
  echo   CA bundle: %NODE_EXTRA_CA_CERTS%
) else (
  echo   CA bundle: NOT FOUND - npm may fail behind Avast
)
echo   URL:       http://localhost:4321/
echo.
echo   Browser will open in ~4 seconds.
echo   Close this window to stop the server.
echo ==========================================
echo.

REM Open the browser in the background after Astro has time to bind to port 4321.
REM PowerShell handles the delay + URL launch more cleanly than nested cmd quoting.
start /b "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:4321/'"

REM Run the dev server in the foreground. Logs stream into this window.
call npm run dev

echo.
echo === Dev server stopped. ===
pause
endlocal
