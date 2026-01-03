# ReMarkable → 4DNote 改名方案

> **创建日期**: 2025-12-02  
> **维护者**: GitHub Copilot  
> **状态**: 📋 待执行

---

## 📊 执行概览

| 指标 | 数量 |
|------|------|
| 影响文件总数 | ~200+ |
| 需要重命名的文件 | 0 (主要是内容替换) |
| 需要更新的代码文件 | ~50 |
| 需要更新的文档文件 | ~150 |
| localStorage 键名 | 15 |
| 数据库名称 | 3 |
| Electron 配置 | 2 |
| 预计执行时间 | 2-3 小时 |

---

## 🎯 改名目标

### 品牌变更
- **旧名称**: ReMarkable
- **新名称**: 4DNote
- **原因**: 避免与 reMarkable 品牌侵权

### 保留项
- ✅ Git 仓库名称 (暂不改，避免链接失效)
- ✅ 现有用户数据 (通过数据库迁移保留)
- ✅ 功能和架构 (不影响代码逻辑)

---

## 📁 影响范围分析

### 1. 核心配置文件 (最高优先级)

#### package.json (根目录)
```json
{
  "name": "remarkable" → "4dnote",
  "description": "ReMarkable v1.3 - 智能时间管理..." → "4DNote v1.3 - 智能时间管理..."
}
```

#### electron/package.json
```json
{
  "name": "remarkable-desktop" → "4dnote-desktop",
  "description": "ReMarkable Desktop Application..." → "4DNote Desktop Application...",
  "build": {
    "appId": "com.remarkable.desktop" → "com.4dnote.desktop",
    "productName": "ReMarkable" → "4DNote",
    "publisherName": "ReMarkable Team" → "4DNote Team",
    "nsis": {
      "shortcutName": "ReMarkable" → "4DNote"
    }
  }
}
```

#### index.html
```html
<title>ReMarkable</title> → <title>4DNote</title>
```

---

### 2. 存储键名 (高优先级)

**影响**: localStorage、IndexedDB、SQLite 数据库

| 旧键名 | 新键名 | 位置 | 影响 |
|--------|--------|------|------|
| `remarkable-events` | （已废弃，不再使用） | localStorage | EventService |
| `remarkable-settings` | `4dnote-settings` | localStorage | App.tsx |
| `remarkable-global-timer` | `4dnote-global-timer` | localStorage | App.tsx |
| `remarkable-outlook-authenticated` | `4dnote-outlook-authenticated` | localStorage | App.tsx |
| `remarkable-storage-version` | `4dnote-storage-version` | localStorage | constants/storage.ts |
| `remarkable-sync-action-queue` | `4dnote-sync-action-queue` | localStorage | ActionBasedSyncManager |
| `remarkable_event_history` | `4dnote_event_history` | localStorage | EventService |
| `remarkable_migration_completed` | `4dnote_migration_completed` | localStorage | dataMigration.ts |
| `remarkable-versions` | `4dnote-versions` | IndexedDB | TimeLog PRD |
| `ReMarkableDB` | `4DNoteDB` | IndexedDB | IndexedDBService.ts |
| `remarkable.db` | `4dnote.db` | SQLite | SQLiteService.ts |
| `remarkable-desktop` | `4dnote-desktop` | Electron | main.js |

**⚠️ 数据迁移策略**: 
- 创建迁移脚本，自动检测旧键名并复制到新键名
- 保留旧数据 30 天后自动清理
- 提供手动导出/导入功能

---

### 3. 代码文件 (中优先级)

#### 需要更新的文件列表

**核心组件 (50 处)**:
- `src/App.tsx` - 15 处 (remarkableSource, ReMarkableCache, localStorage 键)
- `src/components/EventEditModal/EventEditModalV2.tsx` - 12 处 (remarkableSource, logo, 显示名称)
- `src/components/PlanManager.tsx` - 6 处 (remarkableSource 字段)
- `src/services/EventService.ts` - 4 处 (BroadcastChannel 名称, remarkableSource)
- `src/services/ActionBasedSyncManager.ts` - 多处 (sync queue 键名)
- `src/services/storage/IndexedDBService.ts` - 1 处 (DB_NAME)
- `src/services/storage/SQLiteService.ts` - 2 处 (数据库文件名)
- `src/utils/dataMigration.ts` - 2 处 (migration 键名)

**关键字段**:
- `remarkableSource?: boolean` → `4dnoteSource?: boolean` (Event 接口)
- `remarkableUserId?: string` → `4dnoteUserId?: string` (存储架构)

**BroadcastChannel**:
```typescript
// src/services/EventService.ts
broadcastChannel = new BroadcastChannel('remarkable-events');
// →
broadcastChannel = new BroadcastChannel('4dnote-eventhub');
```

---

### 4. 文档文件 (低优先级)

**影响文档** (~150 个文件):
- `README.md` - 应用描述
- `docs/PRD/*.md` - 产品需求文档 (Figma 链接、示例代码)
- `docs/architecture/*.md` - 架构文档 (存储架构、云端规划)
- `docs/fixes/*.md` - 修复文档
- `*.md` 报告和诊断文档

**文档更新策略**:
- 全局替换 "ReMarkable" → "4DNote"
- 保留 Figma 链接 (外部资源)
- 保留代码示例中的 localStorage 键名注释 (标注为"旧版")

---

### 5. 资源文件 (中优先级)

#### LOGO 和图标
```
src/assets/icons/LOGO.svg → 需要设计新 LOGO
electron/assets/icon.ico → Windows 图标
electron/assets/icon.icns → macOS 图标
electron/assets/icon.png → Linux 图标
```

#### 用户界面显示
- EventEditModalV2.tsx 来源显示: `ReMarkable计时` → `4DNote计时`
- EventEditModalV2.tsx 来源显示: `ReMarkable计划` → `4DNote计划`
- EventEditModalV2.tsx 来源显示: `ReMarkable` → `4DNote`

---

### 6. Electron 特定配置

#### main.js
```javascript
// 数据库路径
const userDataPath = app.getPath('userData'); 
// C:\Users\<User>\AppData\Roaming\remarkable-desktop
// →
// C:\Users\<User>\AppData\Roaming\4dnote-desktop
```

#### 修复脚本
```powershell
# fix-corrupted-database.ps1
$userDataPath = "$env:APPDATA\remarkable-desktop"
# →
$userDataPath = "$env:APPDATA\4dnote-desktop"
```

---

## 🛠️ 执行计划

### Phase 1: 准备阶段 (1 小时)

#### ✅ 1.1 备份
```powershell
# 创建完整备份
$backupDir = "C:\Users\Zoey\ReMarkable_Backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item -Path "C:\Users\Zoey\ReMarkable" -Destination $backupDir -Recurse
Write-Host "备份完成: $backupDir"
```

#### ✅ 1.2 创建数据迁移脚本
创建 `scripts/migrate-storage-keys.js`:
```javascript
/**
 * ReMarkable → 4DNote 存储键名迁移脚本
 * 运行环境: 浏览器控制台
 */
(function migrateStorageKeys() {
  const migrations = [
    // 事件 key 已废弃：事件数据不再存于 localStorage 全量数组
    { old: 'remarkable-settings', new: '4dnote-settings' },
    { old: 'remarkable-global-timer', new: '4dnote-global-timer' },
    { old: 'remarkable-outlook-authenticated', new: '4dnote-outlook-authenticated' },
    { old: 'remarkable-storage-version', new: '4dnote-storage-version' },
    { old: 'remarkable-sync-action-queue', new: '4dnote-sync-action-queue' },
    { old: 'remarkable_event_history', new: '4dnote_event_history' },
    { old: 'remarkable_migration_completed', new: '4dnote_migration_completed' },
  ];

  let migrated = 0;
  
  migrations.forEach(({ old, new: newKey }) => {
    const data = localStorage.getItem(old);
    if (data) {
      localStorage.setItem(newKey, data);
      migrated++;
      console.log(`✅ Migrated: ${old} → ${newKey}`);
    }
  });

  console.log(`\n🎉 Migration complete! ${migrated}/${migrations.length} keys migrated.`);
  console.log('ℹ️  Old keys will be removed in 30 days.');
})();
```

#### ✅ 1.3 创建批量替换脚本
创建 `scripts/rename-to-4dnote.ps1` (见下节)

---

### Phase 2: 核心代码更新 (30 分钟)

#### 2.1 更新 package.json (2 文件)
```powershell
# 根目录 package.json
(Get-Content package.json) `
  -replace '"name": "remarkable"', '"name": "4dnote"' `
  -replace 'ReMarkable v\d+\.\d+', '4DNote v$1' |
Set-Content package.json

# electron/package.json
(Get-Content electron\package.json) `
  -replace '"name": "remarkable-desktop"', '"name": "4dnote-desktop"' `
  -replace 'ReMarkable Desktop', '4DNote Desktop' `
  -replace 'com\.remarkable\.', 'com.4dnote.' `
  -replace 'ReMarkable Team', '4DNote Team' `
  -replace '"shortcutName": "ReMarkable"', '"shortcutName": "4DNote"' |
Set-Content electron\package.json
```

#### 2.2 更新存储常量
```typescript
// src/constants/storage.ts
export const STORAGE_KEYS = {
  SETTINGS: '4dnote-settings', // remarkable-settings
  GLOBAL_TIMER: '4dnote-global-timer', // remarkable-global-timer
  // ...
} as const;

export const DB_NAME = '4DNoteDB'; // ReMarkableDB
```

#### 2.3 更新类型定义
```typescript
// src/types.ts
export interface Event {
  // ...
  fourDNoteSource?: boolean; // remarkableSource
}

// src/services/storage/types.ts
export interface StorageEvent {
  // ...
  fourDnoteUserId?: string; // remarkableUserId
}
```

#### 2.4 更新核心服务
批量替换:
- `remarkableSource` → `fourDNoteSource`
- `remarkable-events` →（已废弃，不再使用）
- `ReMarkableDB` → `4DNoteDB`
- `remarkable.db` → `4dnote.db`

---

### Phase 3: 用户界面更新 (20 分钟)

#### 3.1 更新显示文本
```typescript
// src/components/EventEditModal/EventEditModalV2.tsx

// Line 1102, 1141, 1145
return { emoji: null, name: '4DNote', icon: logo, color: '#3b82f6' };

// Line 1131
return { emoji: '⏱️', name: '4DNote计时', icon: null, color: '#f59e0b' };

// Line 1136
return { emoji: '✅', name: '4DNote计划', icon: null, color: '#10b981' };
```

#### 3.2 更新 HTML 标题
```html
<!-- public/index.html -->
<title>4DNote</title>
```

#### 3.3 更新 README
```markdown
# 4DNote v1.3+ 🎯

**智能时间管理与日历同步工具**

4DNote 是一个现代化的时间管理应用...
```

---

### Phase 4: 文档批量更新 (30 分钟)

使用 PowerShell 批量替换:

```powershell
# 更新所有 Markdown 文档
Get-ChildItem -Path . -Recurse -Include *.md |
ForEach-Object {
  (Get-Content $_.FullName) `
    -replace 'ReMarkable', '4DNote' `
    -replace 'remarkable', '4dnote' |
  Set-Content $_.FullName -Encoding UTF8
}

# 排除 Git 历史记录
Get-ChildItem -Path . -Recurse -Include *.md -Exclude .git |
ForEach-Object {
  Write-Host "Updated: $($_.Name)"
}
```

---

### Phase 5: Electron 配置更新 (20 分钟)

#### 5.1 更新 main.js
```javascript
// electron/main.js
// 无需修改 (app.getName() 自动读取 package.json)
```

#### 5.2 更新修复脚本
```powershell
# fix-corrupted-database.ps1
$userDataPath = "$env:APPDATA\4dnote-desktop"
Write-Host "UserData Path: $userDataPath`n" -ForegroundColor Yellow
```

#### 5.3 更新数据库路径 (自动)
```javascript
// electron/main.js
const userDataPath = app.getPath('userData');
// Windows: C:\Users\<User>\AppData\Roaming\4dnote-desktop
// macOS: ~/Library/Application Support/4dnote-desktop
```

---

### Phase 6: 测试与验证 (40 分钟)

#### ✅ 6.1 代码层面测试
```powershell
# 检查是否还有残留的 ReMarkable
Select-String -Path .\src\*.tsx,.\src\*.ts -Pattern "ReMarkable|remarkable" -Exclude "node_modules","_archive"
```

#### ✅ 6.2 功能测试清单
- [ ] 应用启动正常
- [ ] localStorage 数据迁移成功
- [ ] IndexedDB 数据迁移成功
- [ ] SQLite 数据库创建成功
- [ ] 计时器功能正常
- [ ] 标签管理正常
- [ ] 日历同步正常
- [ ] Plan 模块正常
- [ ] EventEditModal 显示正确
- [ ] Electron 打包正常

#### ✅ 6.3 数据完整性验证
```javascript
// 浏览器控制台
console.table(Object.keys(localStorage).filter(k => k.includes('4dnote')));
// Events count: 事件数据不再存于 localStorage 全量数组
```

---

## 📜 批量替换脚本

创建 `scripts/rename-to-4dnote.ps1`:

```powershell
# ReMarkable → 4DNote 批量改名脚本
# 使用方法: .\scripts\rename-to-4dnote.ps1

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   ReMarkable → 4DNote 改名工具" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. 备份
Write-Host "1️⃣  创建备份..." -ForegroundColor Yellow
$backupDir = "C:\Users\Zoey\ReMarkable_Backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item -Path "C:\Users\Zoey\ReMarkable" -Destination $backupDir -Recurse
Write-Host "   ✅ 备份完成: $backupDir`n" -ForegroundColor Green

# 2. 更新 package.json
Write-Host "2️⃣  更新 package.json..." -ForegroundColor Yellow
$files = @(
  ".\package.json",
  ".\electron\package.json"
)

foreach ($file in $files) {
  (Get-Content $file -Raw) `
    -replace '"name":\s*"remarkable(-desktop)?"', '"name": "4dnote$1"' `
    -replace 'ReMarkable', '4DNote' `
    -replace 'remarkable', '4dnote' `
    -replace 'com\.remarkable\.', 'com.4dnote.' |
  Set-Content $file -NoNewline
  Write-Host "   ✅ 已更新: $file" -ForegroundColor Green
}

# 3. 更新代码文件
Write-Host "`n3️⃣  更新代码文件..." -ForegroundColor Yellow
$codeFiles = Get-ChildItem -Path .\src -Recurse -Include *.ts,*.tsx -Exclude node_modules

$replacements = @{
  'remarkableSource' = 'fourDNoteSource'
  'remarkableUserId' = 'fourDnoteUserId'
  # 事件 key 已废弃：事件数据不再存于 localStorage 全量数组
  'remarkable-settings' = '4dnote-settings'
  'remarkable-global-timer' = '4dnote-global-timer'
  'remarkable-outlook-authenticated' = '4dnote-outlook-authenticated'
  'remarkable-storage-version' = '4dnote-storage-version'
  'remarkable-sync-action-queue' = '4dnote-sync-action-queue'
  'remarkable_event_history' = '4dnote_event_history'
  'remarkable_migration_completed' = '4dnote_migration_completed'
  'ReMarkableDB' = '4DNoteDB'
  'remarkable\.db' = '4dnote.db'
  'remarkable-desktop' = '4dnote-desktop'
  "'ReMarkable'" = "'4DNote'"
  '"ReMarkable"' = '"4DNote"'
  'ReMarkable计时' = '4DNote计时'
  'ReMarkable计划' = '4DNote计划'
  'ReMarkable联系人' = '4DNote联系人'
}

foreach ($file in $codeFiles) {
  $content = Get-Content $file.FullName -Raw
  $modified = $false
  
  foreach ($old in $replacements.Keys) {
    $new = $replacements[$old]
    if ($content -match $old) {
      $content = $content -replace $old, $new
      $modified = $true
    }
  }
  
  if ($modified) {
    Set-Content $file.FullName $content -NoNewline
    Write-Host "   ✅ 已更新: $($file.Name)" -ForegroundColor Green
  }
}

# 4. 更新 HTML
Write-Host "`n4️⃣  更新 HTML 文件..." -ForegroundColor Yellow
$htmlFiles = @(
  ".\public\index.html",
  ".\index.html"
)

foreach ($file in $htmlFiles) {
  if (Test-Path $file) {
    (Get-Content $file -Raw) `
      -replace '<title>ReMarkable</title>', '<title>4DNote</title>' |
    Set-Content $file -NoNewline
    Write-Host "   ✅ 已更新: $file" -ForegroundColor Green
  }
}

# 5. 更新文档 (可选)
Write-Host "`n5️⃣  更新文档文件 (可选)..." -ForegroundColor Yellow
$updateDocs = Read-Host "是否更新文档文件？(y/N)"

if ($updateDocs -eq 'y') {
  $docFiles = Get-ChildItem -Path . -Recurse -Include *.md -Exclude node_modules,_archive,.git
  
  foreach ($file in $docFiles) {
    (Get-Content $file.FullName -Raw) `
      -replace 'ReMarkable', '4DNote' `
      -replace 'remarkable', '4dnote' |
    Set-Content $file.FullName -NoNewline
  }
  
  Write-Host "   ✅ 已更新 $($docFiles.Count) 个文档文件" -ForegroundColor Green
} else {
  Write-Host "   ⏭️  跳过文档更新" -ForegroundColor Gray
}

# 6. 更新 Electron 修复脚本
Write-Host "`n6️⃣  更新 Electron 修复脚本..." -ForegroundColor Yellow
$psFiles = Get-ChildItem -Path . -Recurse -Include *.ps1 -Exclude scripts

foreach ($file in $psFiles) {
  (Get-Content $file.FullName -Raw) `
    -replace 'remarkable-desktop', '4dnote-desktop' `
    -replace 'remarkable\.db', '4dnote.db' |
  Set-Content $file.FullName -NoNewline
  Write-Host "   ✅ 已更新: $($file.Name)" -ForegroundColor Green
}

# 完成
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   改名完成！🎉" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "⚠️  下一步操作:" -ForegroundColor Yellow
Write-Host "   1. 运行应用测试功能: npm run e" -ForegroundColor Gray
Write-Host "   2. 运行数据迁移脚本 (浏览器控制台): scripts/migrate-storage-keys.js" -ForegroundColor Gray
Write-Host "   3. 验证数据完整性" -ForegroundColor Gray
Write-Host "   4. 提交 Git: git add . && git commit -m 'chore: rebrand to 4DNote'" -ForegroundColor Gray
Write-Host "`n✅ 备份位置: $backupDir`n" -ForegroundColor Green
```

---

## ⚠️ 风险评估与缓解

### 高风险项

#### 1. 数据丢失风险
**风险**: 存储键名变更导致用户数据丢失  
**缓解**:
- ✅ 创建完整备份
- ✅ 数据迁移脚本 (保留旧键 30 天)
- ✅ 提供手动导出/导入功能

#### 2. Electron 路径变更
**风险**: `remarkable-desktop` → `4dnote-desktop` 导致配置丢失  
**缓解**:
- ✅ 首次启动时自动检测旧路径
- ✅ 提示用户迁移数据
- ✅ 保留旧路径 30 天

### 中风险项

#### 3. Git 历史记录
**风险**: 仓库名称变更导致链接失效  
**缓解**:
- ✅ 暂不改 GitHub 仓库名 (保持 ReMarkable)
- ✅ 只改代码和用户界面

#### 4. 第三方集成
**风险**: Figma 链接、外部文档失效  
**缓解**:
- ✅ 保留 Figma 设计稿链接
- ✅ 文档中标注 "(原 ReMarkable)"

---

## 📋 执行检查清单

### 执行前 (Pre-flight Checklist)

- [ ] 已阅读完整改名方案
- [ ] 已创建完整备份
- [ ] 已测试备份脚本
- [ ] 已创建数据迁移脚本
- [ ] 已创建批量替换脚本
- [ ] 已通知团队成员

### 执行中 (In-progress Checklist)

- [ ] Phase 1: 备份完成
- [ ] Phase 2: 核心代码更新完成
- [ ] Phase 3: 用户界面更新完成
- [ ] Phase 4: 文档批量更新完成
- [ ] Phase 5: Electron 配置更新完成

### 执行后 (Post-execution Checklist)

- [ ] 应用启动测试通过
- [ ] 数据迁移测试通过
- [ ] 功能测试通过 (计时器、标签、同步)
- [ ] Electron 打包测试通过
- [ ] 文档检查 (无残留 ReMarkable)
- [ ] Git 提交
- [ ] 发布新版本

---

## 🔄 回滚计划

如果改名后发现问题，可以快速回滚:

```powershell
# 1. 恢复备份
$backupDir = "C:\Users\Zoey\ReMarkable_Backup_20251202_XXXXXX" # 替换为实际备份路径
Remove-Item -Path "C:\Users\Zoey\ReMarkable" -Recurse -Force
Copy-Item -Path $backupDir -Destination "C:\Users\Zoey\ReMarkable" -Recurse
Write-Host "✅ 已回滚到备份版本"

# 2. 恢复 localStorage
# 在浏览器控制台运行:
Object.keys(localStorage).filter(k => k.includes('4dnote')).forEach(k => {
  const oldKey = k.replace('4dnote', 'remarkable');
  const data = localStorage.getItem(k);
  localStorage.setItem(oldKey, data);
  console.log(`✅ Rolled back: ${k} → ${oldKey}`);
});

# 3. 重启应用
npm run e
```

---

## 📞 联系方式

**执行负责人**: GitHub Copilot  
**问题反馈**: 请在执行前后记录问题  
**紧急回滚**: 使用上述回滚计划

---

**最后更新**: 2025-12-02  
**文档版本**: v1.0  
**执行状态**: 📋 待执行
