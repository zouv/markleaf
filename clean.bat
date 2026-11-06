@echo off
rem Double-click: clean build output (dist/, src-tauri/target/, .runtime/). Use "clean --all" to remove node_modules too.
call "%~dp0_manager.bat" clean
exit /b %ERRORLEVEL%
