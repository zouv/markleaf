@echo off
rem Double-click: install frontend dependencies (npm ci / npm install).
call "%~dp0_manager.bat" setup
exit /b %ERRORLEVEL%
