@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0coredesk.ps1" %*
exit /b %ERRORLEVEL%
