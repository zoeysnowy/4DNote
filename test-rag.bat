@echo off
chcp 65001 >nul

REM 读取 .env 文件
for /f "usebackq tokens=1,* delims==" %%a in ("ai-proxy\.env") do (
    if "%%a"=="HUNYUAN_SECRET_ID" set HUNYUAN_SECRET_ID=%%b
    if "%%a"=="HUNYUAN_SECRET_KEY" set HUNYUAN_SECRET_KEY=%%b
)

echo.
echo 🔍 RAG 搜索测试
echo ========================================
echo SecretId: %HUNYUAN_SECRET_ID:~0,10%...
echo SecretKey: %HUNYUAN_SECRET_KEY:~0,5%...
echo.

if "%1"=="" (
    echo ❌ 请提供查询内容
    echo.
    echo 用法: test-rag.bat "查询内容"
    echo.
    echo 示例:
    echo   test-rag.bat "今天早上做了什么？"
    echo   test-rag.bat "学习相关的记录"
    exit /b 1
)

node scripts\test-rag-hunyuan.js %*
