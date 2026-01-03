# VS Code OOM 优化指南

## 🔍 OOM 根因分析

根据诊断结果，发现以下主要问题：

### 1. **大型文件夹索引负担**
   - `node_modules/`: ~809MB（主项目）
   - `electron/node_modules/`: ~803MB  
   - `.history/`: ~157MB（2313个文件）
   - `.vscode/_oom_logs_capture/`: ~278MB（1639个文件）
   - `vendor/_tui.calendar_full_backup_20260103_133100/`: 备份文件
   - `.venv/`: ~66MB（Python虚拟环境）
   - `ai-proxy/node_modules/`: ~65MB

### 2. **Local History 扩展问题**
   - 扩展 `xyz.local-history` 默认启动激活（`activationEvent: '*'`）
   - 持续监控所有文件变化，产生大量历史记录
   - `.history` 文件夹已累积 2313 个文件（156MB）

### 3. **TypeScript 服务内存压力**
   - 索引多个 `node_modules` 文件夹
   - 虽然已设置 `maxTsServerMemory: 8192`，但索引范围过大

### 4. **其他扩展激活**
   - Python 扩展在搜索 `workspaceContains` 时超时
   - 多个扩展同时激活造成内存叠加

---

## ✅ 已完成的优化

### 配置文件优化（`.vscode/settings.json`）

已添加以下排除规则：

```jsonc
{
  // 文件监控排除
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/electron/node_modules/**": true,
    "**/ai-proxy/node_modules/**": true,
    "**/.history/**": true,
    "**/.venv/**": true,
    "**/vendor/**": true,
    "**/_archive/**": true,
    "**/.vscode/_oom_logs_capture/**": true,
    // ... 更多排除规则
  },
  
  // 搜索排除
  "search.exclude": {
    // 同上，并额外排除
    "**/vitest_verbose.txt": true
  },
  
  // 文件浏览器排除
  "files.exclude": {
    "**/node_modules": true,
    "**/.venv": true,
    "vendor": true,
    "_archive": true,
    "vitest_verbose.txt": true
  },
  
  // Local History 优化
  "local-history.enabled": false,  // 关键：禁用 Local History
  "local-history.maxDisplay": 10,
  "local-history.daysLimit": 7,
  
  // 其他性能优化
  "extensions.autoUpdate": false,
  "search.followSymlinks": false,
  "search.maintainFileSearchCache": false,
  "telemetry.telemetryLevel": "off"
}
```

---

## 🧹 清理操作

### 方法一：使用清理脚本（推荐）

运行根目录下的 `清理OOM优化.bat`，将自动清理：
- `.history/` 文件夹（~157MB）
- `.vscode/_oom_logs_capture/` OOM日志（~278MB）
- `vitest_verbose.txt` 大型测试日志
- `vendor/_tui.calendar_full_backup_20260103_133100/` 备份
- TypeScript 缓存

**预计释放空间：~450MB**

### 方法二：手动清理

```powershell
# 清理 Local History
Remove-Item -Path ".history" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path ".history" -Force

# 清理 OOM 日志
Remove-Item -Path ".vscode\_oom_logs_capture" -Recurse -Force -ErrorAction SilentlyContinue

# 清理测试日志
Remove-Item -Path "vitest_verbose.txt" -Force -ErrorAction SilentlyContinue

# 清理备份
Remove-Item -Path "vendor\_tui.calendar_full_backup_*" -Recurse -Force -ErrorAction SilentlyContinue
```

---

## 🚀 进一步优化建议

### 1. **禁用或卸载 Local History 扩展**
   
   如果不需要该功能，直接禁用扩展：
   ```
   扩展面板 → 搜索 "Local History" → 禁用
   ```

### 2. **配置 .gitignore**

   确保以下内容在 `.gitignore` 中：
   ```
   .history/
   .vscode/_oom_logs_capture/
   .vscode/_oom_test_user_data/
   .vscode/_oom_test_extensions/
   vitest_verbose.txt
   vendor/_tui.calendar_full_backup_*/
   ```

### 3. **TypeScript 项目引用优化**

   考虑在 `tsconfig.json` 中添加更精确的排除：
   ```json
   {
     "exclude": [
       "node_modules",
       "electron/node_modules",
       "ai-proxy",
       "vendor",
       "_archive",
       ".history",
       "build",
       "dist"
     ]
   }
   ```

### 4. **定期维护脚本**

   已有脚本可用：
   - `scripts/prune-local-history.ps1` - 清理历史记录（14天）
   - `scripts/prune-oom-logs.ps1` - 清理OOM日志（14天）

   建议设置定时任务每周运行一次。

### 5. **监控内存使用**

   使用 VS Code 命令：
   ```
   Ctrl+Shift+P → "Process Explorer"
   ```
   查看各扩展和服务的内存占用。

### 6. **考虑工作区拆分**

   如果项目持续增长，考虑：
   - 将 `electron/` 独立为单独工作区
   - 将 `ai-proxy/` 独立为单独工作区
   - 使用 VS Code 的 Multi-root Workspace 功能

---

## 📊 优化效果预期

| 项目 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| 索引文件数 | ~2300+ | ~100 | ↓95% |
| 监控文件夹 | ~1.7GB | ~500MB | ↓70% |
| 扩展激活 | Local History 持续运行 | 已禁用 | ✓ |
| 内存占用 | 频繁OOM | 预计稳定 | ✓ |

---

## ⚠️ 注意事项

1. **Local History 禁用后**：文件历史记录功能将不可用，建议使用 Git 进行版本控制
2. **清理前备份**：如果担心数据丢失，可先备份 `.history/` 文件夹
3. **重启 VS Code**：完成所有优化后，务必完全重启 VS Code

---

## 🔧 故障排查

如果优化后仍然出现 OOM：

1. **检查扩展列表**
   ```
   Ctrl+Shift+P → "Extensions: Show Installed Extensions"
   ```
   禁用不必要的扩展

2. **查看进程资源**
   ```
   Ctrl+Shift+P → "Developer: Open Process Explorer"
   ```
   找出内存占用最高的进程

3. **增加 Node.js 内存限制**
   
   在 VS Code 的 `argv.json` 中添加：
   ```json
   {
     "max-memory": "8192"
   }
   ```

4. **检查 Python 扩展**
   
   如果不需要 Python 开发，考虑禁用 `ms-python.python`

---

**最后更新：** 2026-01-03
