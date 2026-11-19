@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem ============================================================
rem  MarkLeaf - package: dist/dev + dist/release
rem  A running app instance is listed; only closed after an explicit Y.
rem  Pure cmd entry; Node handles build, zip, SHA256 and publish.
rem  Mirrors: sh manager.sh package
rem ============================================================

set "PM=npm"

where node >nul 2>&1
if errorlevel 1 goto :NoNode
where %PM% >nul 2>&1
if errorlevel 1 goto :NoPm
where cargo >nul 2>&1
if errorlevel 1 goto :NoCargo

pushd "%~dp0"
if errorlevel 1 goto :Fail

echo ============================================================
echo  Package ^|  dist\dev + dist\release ^(first build is slow^)
echo ============================================================
call node "%~dp0scripts\package.mjs" --pm %PM% %*
set "RC=%ERRORLEVEL%"
popd
if "%RC%"=="2" goto :Cancelled
if not "%RC%"=="0" goto :Fail

echo.
echo [SUCCESS] Package finished: dist\dev + dist\release
exit /b 0

:Cancelled
echo.
echo [INFO] Package cancelled; the running app was left alone.
if not "%MARKLEAF_NO_PAUSE%"=="1" pause
exit /b 2

:NoNode
echo [ERROR] Node.js 20.19+ or 22.12+ is required. Add node to PATH.
goto :Fail
:NoPm
echo [ERROR] npm is required. Install Node.js (which includes npm) first.
goto :Fail
:NoCargo
echo [ERROR] Rust toolchain is required. Install via https://rustup.rs
goto :Fail

:Fail
echo.
echo [FAILED] Package failed.
if not "%MARKLEAF_NO_PAUSE%"=="1" pause
exit /b 1
