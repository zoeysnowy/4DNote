@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   启动腾讯混元 RAG 测试环境
echo ========================================
echo.

cd /d "%~dp0ai-proxy"

echo [1/2] 启动代理服务器...
start "Hunyuan Proxy" cmd /k "npm start"

timeout /t 3 /nobreak >nul

cd ..

echo [2/2] 准备运行 RAG 测试...
echo.
echo ✅ 代理服务器已在新窗口启动
echo.
echo 📝 使用方法:
echo    npm run rag-hunyuan "你的查询"
echo.
echo 示例:
echo    npm run rag-hunyuan "今天早上做了什么？"
echo    npm run rag-hunyuan "健身相关的活动"
echo.
pause
