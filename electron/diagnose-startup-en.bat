@echo off
setlocal enabledelayedexpansion

REM ========================================
REM 4DNote Startup Performance Diagnostics
REM ========================================

echo.
echo ============================================
echo   4DNote Startup Diagnostics
echo ============================================
echo.

REM Get start time
set start_time=%time%
echo Start time: %start_time%
echo.

REM Step 1: Check port 3000
echo [Step 1/5] Checking port 3000...
set step1_start=%time%
netstat -ano | findstr :3000 > nul
if %errorlevel% equ 0 (
    echo   WARNING: Port 3000 is occupied
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        echo   Terminating process PID: %%a
        taskkill /F /PID %%a 2>nul
    )
    timeout /t 2 /nobreak > nul
) else (
    echo   OK: Port available
)
set step1_end=%time%
echo   Duration: [measuring...]
echo.

REM Step 2: Check node_modules
echo [Step 2/5] Checking dependencies...
set step2_start=%time%
if not exist "..\node_modules" (
    echo   ERROR: node_modules not found, need to run npm install
    exit /b 1
)
if not exist "node_modules" (
    echo   ERROR: electron/node_modules not found, need to run npm install
    exit /b 1
)
echo   OK: Dependencies installed
set step2_end=%time%
echo.

REM Step 3: Start React dev server
echo [Step 3/5] Starting React dev server...
set step3_start=%time%
cd ..
start /B cmd /c "npm start 2>&1 | findstr /C:\"Compiled\" /C:\"Failed\" > electron\react-start.log"
echo   React server starting in background...
cd electron
echo.

REM Step 4: Wait for server ready
echo [Step 4/5] Waiting for server at http://localhost:3000...
set step4_start=%time%
set wait_count=0
:wait_loop
set /a wait_count+=1
if %wait_count% gtr 120 (
    echo   ERROR: Timeout waiting for server ^(120 seconds^)
    echo.
    echo Debugging tips:
    echo    1. Check React logs: type react-start.log
    echo    2. Start manually: npm start
    echo    3. Check firewall/antivirus
    exit /b 1
)

curl -s http://localhost:3000 > nul 2>&1
if %errorlevel% neq 0 (
    echo   Waiting... ^(%wait_count% seconds^)
    timeout /t 1 /nobreak > nul
    goto wait_loop
)
echo   OK: React server ready
set step4_end=%time%
echo   Wait time: %wait_count% seconds
echo.

REM Step 5: Start Electron
echo [Step 5/5] Starting Electron app...
set step5_start=%time%
echo   Electron starting...
call npm run electron
set step5_end=%time%
echo.

REM Calculate total time
set end_time=%time%
echo.
echo ============================================
echo   Performance Summary
echo ============================================
echo.
echo Start time: %start_time%
echo End time: %end_time%
echo.
echo React wait time: %wait_count% seconds
echo.
echo Optimization tips:
echo    1. If React compile is slow, reduce TypeScript checks
echo    2. Use SSD for project storage
echo    3. Close unnecessary file watchers
echo    4. Increase Node.js memory: set NODE_OPTIONS=--max-old-space-size=4096
echo.

pause
