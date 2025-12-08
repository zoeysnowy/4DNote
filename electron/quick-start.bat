@echo off
REM ========================================
REM 4DNote 快速启动（跳过端口检查）
REM ========================================

echo.
echo 🚀 快速启动模式
echo.

REM 直接启动，不检查端口
cd ..
start /B cmd /c "npm start"
cd electron

echo ⏳ 等待 React 服务器...
npx wait-on http://localhost:3000 -t 120000

echo 🖥️  启动 Electron...
npm run electron
