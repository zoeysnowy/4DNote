@echo off
setlocal enabledelayedexpansion

REM Force a fresh VS Code process so flags like --user-data-dir actually take effect.
REM This will close ALL VS Code windows.

echo Closing VS Code (if running)...
taskkill /F /IM Code.exe >nul 2>nul
taskkill /F /IM "Code - Insiders.exe" >nul 2>nul

set ROOT=%~dp0
set USER_DATA=%ROOT%.vscode\_oom_test_user_data
set EXT_DIR=%ROOT%.vscode\_oom_test_extensions

if not exist "%USER_DATA%" mkdir "%USER_DATA%" >nul 2>nul
if not exist "%EXT_DIR%" mkdir "%EXT_DIR%" >nul 2>nul

echo.
echo Launching VS Code (isolated) for current workspace...
echo Workspace: %ROOT%
echo User data: %USER_DATA%
echo Extensions: %EXT_DIR%
echo Flags: --disable-extensions --disable-gpu --new-window --log trace
echo.

code "%ROOT%" --new-window --user-data-dir "%USER_DATA%" --extensions-dir "%EXT_DIR%" --disable-extensions --disable-gpu --log trace

endlocal
