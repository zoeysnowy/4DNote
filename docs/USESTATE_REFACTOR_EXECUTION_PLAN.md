# useState → useReducer 批量替换执行计划

## ⚠️ 重要提示

这是一个**大规模重构**，涉及：
- PlanSlate: ~50处setter调用
- PlanManager: ~100处setter调用

建议**分步验证**，避免一次性引入过多变更。

---

## PlanSlate 替换清单

### 1. Mention Picker 打开场景（成组变化 → 原子操作）

#### 场景1: 时间解析成功，打开日期选择器
**位置**: Line 1385-1393

**Before** (5个setState):
```typescript
setMentionText(text);
setMentionInitialStart(startTime);
setMentionInitialEnd(endTime);
setShowMentionPicker(true);
// mentionAnchorRef已设置
```

**After** (1个action):
```typescript
sessionActions.openMention('time', mentionAnchorRef.current!, startTime, endTime);
```

#### 场景2: 时间解析失败，打开搜索菜单
**位置**: Line 1402-1407

**Before** (4个setState):
```typescript
setMentionType('search');
setSearchQuery(text);
setShowMentionPicker(false);
setShowSearchMenu(true);
```

**After** (1个action):
```typescript
sessionActions.openSearch(text);
```

#### 场景3: 空输入（只有@），打开搜索菜单
**位置**: Line 1428-1432

**Before** (同场景2):
```typescript
setMentionType('search');
setSearchQuery('');
setShowMentionPicker(false);
setShowSearchMenu(true);
```

**After**:
```typescript
sessionActions.openSearch('');
```

### 2. Mention Picker 关闭场景

#### 场景1: 时间解析失败（else分支）
**位置**: Line 1394

**Before**:
```typescript
setShowMentionPicker(false);
```

**After**:
```typescript
sessionActions.closeMention();
```

#### 场景2: 没有检测到@
**位置**: Line 1453-1454

**Before**:
```typescript
setShowMentionPicker(false);
setShowSearchMenu(false);
```

**After**:
```typescript
sessionActions.closeMention();
sessionActions.closeSearch();
```

#### 场景3: 不在文本节点
**位置**: Line 1459-1460

**Before** (同场景2):
```typescript
setShowMentionPicker(false);
setShowSearchMenu(false);
```

**After**:
```typescript
sessionActions.closeMention();
sessionActions.closeSearch();
```

### 3. handleDateSelect 回调

**位置**: 需要grep搜索

**Before**:
```typescript
setShowMentionPicker(false);
```

**After**:
```typescript
sessionActions.closeMention();
```

### 4. UnifiedMentionMenu props

**位置**: 组件渲染部分

**Before**:
```tsx
<UnifiedMentionMenu
  open={showSearchMenu}
  query={searchQuery}
  onClose={() => {
    setShowSearchMenu(false);
    setMentionType(null);
  }}
  // ...
/>
```

**After**:
```tsx
<UnifiedMentionMenu
  open={session.search.isOpen}
  query={session.search.query}
  onClose={() => sessionActions.closeSearch()}
  // ...
/>
```

### 5. UnifiedDateTimePicker props

**位置**: 组件渲染部分

**Before**:
```tsx
<UnifiedDateTimePicker
  open={showMentionPicker}
  anchorEl={mentionAnchorRef.current}
  initialStart={mentionInitialStart}
  initialEnd={mentionInitialEnd}
  onClose={() => setShowMentionPicker(false)}
  // ...
/>
```

**After**:
```tsx
<UnifiedDateTimePicker
  open={session.mention.isOpen}
  anchorEl={session.mention.anchor}
  initialStart={session.mention.initialStart}
  initialEnd={session.mention.initialEnd}
  onClose={() => sessionActions.closeMention()}
  // ...
/>
```

---

## 🧪 测试验证清单

### Mention功能测试
1. ✅ 输入 `@明天` → 打开日期选择器
2. ✅ 输入 `@xyz` → 打开搜索菜单
3. ✅ 输入 `@` → 打开空搜索菜单
4. ✅ 删除 `@` → 关闭所有菜单
5. ✅ 选择日期 → 关闭选择器 + 插入DateMention
6. ✅ 在搜索菜单选择事件 → 关闭菜单 + 插入EventMention

### 回归测试
1. ✅ Tab/Shift+Tab 缩进功能正常
2. ✅ Enter键创建新行正常
3. ✅ 复制粘贴保留格式
4. ✅ 实时保存不丢数据

---

## 📊 估算影响

### 代码行数变更
- PlanSlate: -50行（减少重复的多个setState调用）
- PlanManager: -100行
- 新增Hooks: +500行（usePlanSlateSession + usePlanManagerSession）
- 新增文档: +300行

### 性能影响
- ✅ 减少重渲染：多个setState合并为1个dispatch
- ✅ 避免闭包陷阱：reducer状态始终最新
- ⚠️ 可能需要优化：reducer内部状态展开（已使用...spread，性能OK）

---

## 🚀 执行顺序

### Phase 1: PlanSlate重构 ✅ READY
1. ✅ Hook已创建
2. ✅ 导入已添加
3. ✅ useState已替换为reducer
4. ⏳ **下一步**: 批量替换setter调用

### Phase 2: PlanManager重构 ⏳ PENDING
1. 等待PlanSlate测试通过
2. 重复相同流程

### Phase 3: 验收 ⏳ PENDING
1. 手动测试所有功能
2. 观察控制台无错误
3. 创建git commit

---

## 💡 回滚策略

如果重构后出现问题：
1. `git stash` 保存当前修改
2. `git checkout HEAD~1` 回退到重构前
3. 对比diff，定位问题代码
4. 修复后重新apply

---

## ❓ 需要你的决定

**选项A**: 继续执行批量替换（推荐）
- 我会逐步替换所有setter调用
- 每批替换后暂停，等待你测试
- 你可以随时喊停

**选项B**: 先暂停，你手动测试Hook
- 你可以先在少量位置手动测试新Hook
- 确认无问题后再批量替换

**选项C**: 放弃重构，保留现状
- Hook代码保留（不启用）
- 作为备选方案供未来使用

---

请告诉我你的选择：A / B / C？
