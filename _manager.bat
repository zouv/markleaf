@echo off
rem Shared entry for the double-click scripts: find Git Bash, cd to this folder, hand the action to manager.sh.
rem All logic lives in manager.sh. Usage: _manager.bat <action>
rem Env: MARKLEAF_NO_PAUSE=1 skips the final pause; MARKLEAF_BASH_EXE points at bash.exe.
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "BASH_EXE="
if defined MARKLEAF_BASH_EXE set "BASH_EXE=%MARKLEAF_BASH_EXE%"
rem Do not use bash from PATH: System32 may hold the WSL launcher instead of Git Bash.
if not defined BASH_EXE if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "BASH_EXE=%LocalAppData%\Programs\Git\bin\bash.exe"
if not defined BASH_EXE for /f "delims=" %%G in ('where git 2^>nul') do if exist "%%~dpG..\bin\bash.exe" if not defined BASH_EXE set "BASH_EXE=%%~dpG..\bin\bash.exe"
if defined BASH_EXE "%BASH_EXE%" manager.sh %*
set "RC=%ERRORLEVEL%"
if not defined BASH_EXE (
    echo [ERROR] Git Bash not found. Install Git for Windows, or set MARKLEAF_BASH_EXE to the path of bash.exe.
    set "RC=1"
)
if not "%MARKLEAF_NO_PAUSE%"=="1" pause
exit /b %RC%
