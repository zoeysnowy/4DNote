@echo off
echo ========================================
echo   4DNote 快速启动
echo ========================================
echo.

echo [1/2] 设置环境变量...
set NODE_OPTIONS=--max-old-space-size=4096
set TSC_COMPILE_ON_ERROR=true
set GENERATE_SOURCEMAP=false
set SKIP_PREFLIGHT_CHECK=true
echo   ✓ 内存限制: 4GB
echo   ✓ 跳过类型检查
echo   ✓ 禁用 source maps
echo.

echo [2/2] 启动 React 开发服务器...
npm start
