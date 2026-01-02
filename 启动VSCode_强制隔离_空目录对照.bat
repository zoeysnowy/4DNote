@echo off
setlocal enabledelayedexpansion

REM Control test: open an empty folder with isolated profile.
REM If this is stable but the workspace crashes, the repo/workspace load is the trigger.

echo Closing VS Code (if running)...
taskkill /F /IM Code.exe >nul 2>nul
taskkill /F /IM "Code - Insiders.exe" >nul 2>nul

set ROOT=%~dp0
set EMPTY=%ROOT%.vscode\_oom_empty_workspace
set USER_DATA=%ROOT%.vscode\_oom_test_user_data_empty
set EXT_DIR=%ROOT%.vscode\_oom_test_extensions_empty

if not exist "%EMPTY%" mkdir "%EMPTY%" >nul 2>nul
if not exist "%USER_DATA%" mkdir "%USER_DATA%" >nul 2>nul
if not exist "%EXT_DIR%" mkdir "%EXT_DIR%" >nul 2>nul

echo.
echo Launching VS Code (isolated) for EMPTY folder control...
echo Folder: %EMPTY%
echo User data: %USER_DATA%
echo Extensions: %EXT_DIR%
echo Flags: --disable-extensions --disable-gpu --new-window --log trace
echo.

code "%EMPTY%" --new-window --user-data-dir "%USER_DATA%" --extensions-dir "%EXT_DIR%" --disable-extensions --disable-gpu --log trace

endlocal
