@echo off
rem Double-click: tauri dev (Vite + Rust, hot reload). Ctrl+C stops it.
call "%~dp0_manager.bat" dev
exit /b %ERRORLEVEL%
