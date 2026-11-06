@echo off
rem Double-click: run all tests (tsc + node:test + cargo test).
call "%~dp0_manager.bat" test
exit /b %ERRORLEVEL%
