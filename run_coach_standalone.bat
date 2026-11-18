@echo off
title Kerala AI English Coach Statue (Standalone - No Python Required)
cd /d "%~dp0"

echo ================================================================
echo    Starting Kerala AI English Coach Statue (Standalone)
echo ================================================================

REM 0. If Python is installed, use launcher.py for neural MP3 voice (/api/tts), CORS proxy, and persistent config.json
where python >nul 2>nul
if %errorlevel%==0 (
    echo [+] Python detected - launching full Kiosk Server with Neural Indian English TTS...
    python launcher.py
    pause
    exit /b 0
)

REM 1. Fallback when Python is not installed: Set Windows power state to ALWAYS AWAKE using native Win32 API via PowerShell
start /b powershell -NoProfile -Command ^
  "$sig = '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'; " ^
  "$type = Add-Type -MemberDefinition $sig -Name 'WinPower' -Namespace 'Win32' -PassThru; " ^
  "Write-Host '[+] Keeping Windows awake 24/7...'; " ^
  "while($true) { [void]$type::SetThreadExecutionState(0x80000003); Start-Sleep -Seconds 60 }"

REM 2. Locate Microsoft Edge or Chrome
set "BROWSER_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER_EXE%" set "BROWSER_EXE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER_EXE%" set "BROWSER_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER_EXE%" set "BROWSER_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER_EXE%" set "BROWSER_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

set "TARGET_HTML=%~dp0web\index.html"
if not exist "%TARGET_HTML%" set "TARGET_HTML=%~dp0index.html"

echo [+] Launching English Coach Desktop Window...

if exist "%BROWSER_EXE%" (
    start "" "%BROWSER_EXE%" --app="file:///%TARGET_HTML%" --start-maximized --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required
) else (
    start "" "file:///%TARGET_HTML%"
)

echo.
echo ================================================================
echo  [OK] English Coach Statue is now ACTIVE!
echo  - Speak to the statue in English through the microphone.
echo  - Statue will answer aloud and provide spoken & visual coaching.
echo  - Windows PC will NOT sleep or turn off screen.
echo ================================================================
pause
