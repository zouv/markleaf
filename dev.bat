@echo off
rem Double-click: tauri dev (Vite + Rust, hot reload). Ctrl+C stops it.
rem A running app instance is force-closed before the build starts.
call "%~dp0_manager.bat" dev
exit /b %ERRORLEVEL%
