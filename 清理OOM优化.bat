@echo off
chcp 65001 >nul
echo ========================================
echo VS Code OOM 优化清理脚本
echo ========================================
echo.

echo [1/5] 清理 .history 文件夹（当前大小约 156MB）...
if exist ".history" (
    rd /s /q ".history"
    mkdir ".history"
    echo ✓ .history 已清理
) else (
    echo ! .history 文件夹不存在
)
echo.

echo [2/5] 清理 OOM 日志文件夹（当前大小约 278MB）...
if exist ".vscode\_oom_logs_capture" (
    rd /s /q ".vscode\_oom_logs_capture"
    echo ✓ OOM 日志已清理
) else (
    echo ! OOM 日志文件夹不存在
)
echo.

echo [3/5] 清理 vitest_verbose.txt...
if exist "vitest_verbose.txt" (
    del /f /q "vitest_verbose.txt"
    echo ✓ vitest_verbose.txt 已删除
) else (
    echo ! vitest_verbose.txt 不存在
)
echo.

echo [4/5] 清理 vendor 中的备份文件夹...
if exist "vendor\_tui.calendar_full_backup_20260103_133100" (
    rd /s /q "vendor\_tui.calendar_full_backup_20260103_133100"
    echo ✓ TUI Calendar 备份已清理
) else (
    echo ! TUI Calendar 备份不存在
)
echo.

echo [5/5] 清理 TypeScript 缓存...
if exist "node_modules\.cache" (
    rd /s /q "node_modules\.cache"
    echo ✓ TypeScript 缓存已清理
) else (
    echo ! TypeScript 缓存不存在
)
echo.

echo ========================================
echo 清理完成！建议重启 VS Code
echo 预计释放空间: ~450MB
echo ========================================
pause
