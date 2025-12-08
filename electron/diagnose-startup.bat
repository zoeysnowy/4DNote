@echo off
setlocal enabledelayedexpansion

REM ========================================
REM 4DNote 启动性能诊断工具
REM ========================================

echo.
echo ╔═══════════════════════════════════════════╗
echo ║  4DNote 启动性能诊断                      ║
echo ╚═══════════════════════════════════════════╝
echo.

REM 获取开始时间
set start_time=%time%
echo ⏱️  开始时间: %start_time%
echo.

REM 步骤 1: 检查端口
echo [步骤 1/5] 检查端口 3000...
set step1_start=%time%
netstat -ano | findstr :3000 > nul
if %errorlevel% equ 0 (
    echo   ⚠️  端口 3000 已被占用
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        echo   正在终止进程 PID: %%a
        taskkill /F /PID %%a 2>nul
    )
    timeout /t 2 /nobreak > nul
) else (
    echo   ✅ 端口可用
)
set step1_end=%time%
echo   用时: [测量中]
echo.

REM 步骤 2: 检查 node_modules
echo [步骤 2/5] 检查依赖...
set step2_start=%time%
if not exist "..\node_modules" (
    echo   ❌ node_modules 不存在，需要运行 npm install
    exit /b 1
)
if not exist "node_modules" (
    echo   ❌ electron/node_modules 不存在，需要运行 npm install
    exit /b 1
)
echo   ✅ 依赖已安装
set step2_end=%time%
echo.

REM 步骤 3: 启动 React 开发服务器
echo [步骤 3/5] 启动 React 开发服务器...
set step3_start=%time%
cd ..
start /B cmd /c "npm start 2>&1 | findstr /C:\"Compiled\" /C:\"Failed\" > ..\electron\react-start.log"
echo   🚀 React 服务器启动中（后台）...
cd electron
echo.

REM 步骤 4: 等待服务器就绪
echo [步骤 4/5] 等待服务器响应 http://localhost:3000...
set step4_start=%time%
set wait_count=0
:wait_loop
set /a wait_count+=1
if %wait_count% gtr 60 (
    echo   ❌ 等待超时 ^(60秒^)
    echo.
    echo 💡 调试建议:
    echo    1. 检查 React 日志: type react-start.log
    echo    2. 手动启动: npm start
    echo    3. 检查防火墙/杀毒软件
    exit /b 1
)

curl -s http://localhost:3000 > nul 2>&1
if %errorlevel% neq 0 (
    echo   ⏳ 等待中... ^(%wait_count% 秒^)
    timeout /t 1 /nobreak > nul
    goto wait_loop
)
echo   ✅ React 服务器就绪
set step4_end=%time%
echo   等待用时: %wait_count% 秒
echo.

REM 步骤 5: 启动 Electron
echo [步骤 5/5] 启动 Electron 应用...
set step5_start=%time%
echo   🖥️  Electron 启动中...
call npm run electron
set step5_end=%time%
echo.

REM 计算总用时
set end_time=%time%
echo.
echo ╔═══════════════════════════════════════════╗
echo ║  性能统计                                 ║
echo ╚═══════════════════════════════════════════╝
echo.
echo 开始时间: %start_time%
echo 结束时间: %end_time%
echo.
echo 💡 优化建议:
echo    1. 如果 React 编译慢，考虑减少 TypeScript 检查
echo    2. 使用 SSD 存储项目
echo    3. 关闭不必要的文件监听工具
echo    4. 增加 Node.js 内存: set NODE_OPTIONS=--max-old-space-size=4096
echo.

pause
