@echo off
setlocal enabledelayedexpansion

REM VS Code OOM diagnosis launcher
REM - Disables all extensions
REM - Uses isolated user-data + extensions dirs (won't touch your normal VS Code profile)
REM - Disables GPU acceleration (common renderer crash/OOM trigger)

set ROOT=%~dp0
set USER_DATA=%ROOT%.vscode\_oom_test_user_data
set EXT_DIR=%ROOT%.vscode\_oom_test_extensions

if not exist "%USER_DATA%" mkdir "%USER_DATA%" >nul 2>nul
if not exist "%EXT_DIR%" mkdir "%EXT_DIR%" >nul 2>nul

echo Launching VS Code in OOM safe mode...
echo Workspace: %ROOT%
echo User data: %USER_DATA%
echo Extensions: %EXT_DIR%
echo Flags: --disable-extensions --disable-gpu
echo.

code "%ROOT%" --user-data-dir "%USER_DATA%" --extensions-dir "%EXT_DIR%" --disable-extensions --disable-gpu --log trace

endlocal
