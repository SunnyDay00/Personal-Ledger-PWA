@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-ios-github.ps1" %*
exit /b %ERRORLEVEL%