@echo off
echo ========================================
echo   4DNote Electron 完整启动
echo ========================================
echo.

echo [1/3] 设置环境变量...
set NODE_OPTIONS=--max-old-space-size=4096
set TSC_COMPILE_ON_ERROR=true
set GENERATE_SOURCEMAP=false
set SKIP_PREFLIGHT_CHECK=true
echo   ✓ 优化配置已设置
echo.

echo [2/3] 启动 React 服务器...
start "React Server" cmd /c "npm start"
echo   ⏳ 等待 React 编译...
timeout /t 30 /nobreak
echo.

echo [3/3] 启动 Electron...
cd electron
npm run electron
