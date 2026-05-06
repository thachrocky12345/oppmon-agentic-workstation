@echo off
echo === Backend Configuration Replacement Script ===
echo Replaces: 136.34.106.116 -^> 192.168.1.241
echo Replaces: 8778 -^> 8889
echo.

cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0replace-backend-config.ps1"

echo.
pause