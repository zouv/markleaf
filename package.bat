@echo off
rem Double-click: build installers and copy them into dist/.
call "%~dp0_manager.bat" package
exit /b %ERRORLEVEL%
