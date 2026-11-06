@echo off
rem Double-click: build the frontend into dist/.
call "%~dp0_manager.bat" build
exit /b %ERRORLEVEL%
