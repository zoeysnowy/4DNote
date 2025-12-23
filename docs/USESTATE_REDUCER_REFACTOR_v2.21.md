# useState重构为useReducer - v2.21.0

## 重构目标

根据GPT-5.2的架构建议，将PlanSlate和PlanManager中的会话态useState迁移到useReducer，消除"多个useState成组变化"导致的一致性问题。

## 重构原则

### 状态分类（5类）

| 类别 | 定义 | 推荐容器 | 处理依据 |
|---|---|---|---|
| (A) UI临时态 | 纯界面开关/hover/弹窗 | 继续 useState | 丢了不影响数据正确性 |
| (B) 编辑器会话态 | selection/focus/IME/键盘命令 | useReducer + useRef | 一次动作更新2+state |
| (C) 领域数据（真相） | events/items/树结构 | 自建store/service | single source of truth |
| (D) 派生/缓存 | map/filter/view arrays | useMemo/selector | 可从(C)推导 |
| (E) 持久化/同步管线态 | pending patches、debounce | 自建pipeline | 避免闭包陈旧 |

### 决策口诀
- **一次动作改2+状态** → 放reducer (B)
- **可由别的状态推导** → 不要state (D)
- **影响保存/同步** → 放服务层 (C/E)
- **丢了不影响正确性** → 留useState (A)

## PlanSlate重构

### 创建：usePlanSlateSession Hook

**位置**: `src/components/PlanSlate/hooks/usePlanSlateSession.ts`

**管理状态**:
```typescript
interface PlanSlateSessionState {
  mention: MentionSession;    // showMentionPicker + mentionText + mentionType + initial dates
  search: SearchSession;      // showSearchMenu + searchQuery
  cursorIntent: CursorIntent; // 键盘操作后的光标恢复意图
  flushRequest: FlushRequest; // 保存请求（高优先级 vs debounce）
}
```

### 替换映射表

#### 原useState → Reducer状态

| 原useState | 新状态路径 | 说明 |
|---|---|---|
| `showMentionPicker` | `session.mention.isOpen` | |
| `mentionText` | `session.mention.query` | |
| `mentionType` | `session.mention.type` | |
| `mentionInitialStart` | `session.mention.initialStart` | |
| `mentionInitialEnd` | `session.mention.initialEnd` | |
| `searchQuery` | `session.search.query` | |
| `showSearchMenu` | `session.search.isOpen` | |
| `mentionAnchorRef.current` | `session.mention.anchor` | ⚠️ 保留ref作为向后兼容 |

#### 原setter → Reducer actions

| 原setter | 新action方法 | 说明 |
|---|---|---|
| `setShowMentionPicker(true)` + 多个set | `sessionActions.openMention(type, anchor, dates)` | 🔥 原子更新 |
| `setShowMentionPicker(false)` | `sessionActions.closeMention()` | 自动清理所有字段 |
| `setMentionText(text)` | `sessionActions.updateMentionQuery(text)` | |
| `setSearchQuery(q)` | `sessionActions.updateSearchQuery(q)` | |
| `setShowSearchMenu(true/false)` | `sessionActions.openSearch()` / `closeSearch()` | |

### 替换示例

**Before**:
```typescript
// ❌ 成组变化，容易遗漏某个字段
setShowMentionPicker(true);
setMentionType('time');
setMentionText('');
setMentionInitialStart(new Date());
mentionAnchorRef.current = anchorEl;
```

**After**:
```typescript
// ✅ 原子更新，一次action完成
sessionActions.openMention('time', anchorEl, new Date(), undefined);
```

## PlanManager重构

### 创建：usePlanManagerSession Hook

**位置**: `src/components/hooks/usePlanManagerSession.ts`

**管理状态**:
```typescript
interface PlanManagerSessionState {
  focus: FocusState;        // lineId + mode + isTask + selectedTags
  filter: FilterState;      // dateRange + activeFilter + hiddenTags + searchQuery
  snapshotVersion: number;  // 强制snapshot重算的版本号
}
```

### 替换映射表

#### 原useState → Reducer状态

| 原useState | 新状态路径 | 说明 |
|---|---|---|
| `currentFocusedLineId` | `session.focus.lineId` | |
| `currentFocusedMode` | `session.focus.mode` | |
| `currentIsTask` | `session.focus.isTask` | |
| `currentSelectedTags` | `session.focus.selectedTags` | |
| `dateRange` | `session.filter.dateRange` | |
| `activeFilter` | `session.filter.activeFilter` | |
| `hiddenTags` | `session.filter.hiddenTags` | |
| `searchQuery` | `session.filter.searchQuery` | |
| `snapshotVersion` | `session.snapshotVersion` | |

#### 原setter → Reducer actions

| 原setter | 新action方法 | 说明 |
|---|---|---|
| `setCurrentFocusedLineId(id)` + 3个set | `sessionActions.setFocus(id, {mode, isTask, tags})` | 🔥 原子更新 |
| `setDateRange(range)` | `sessionActions.setDateRange(range)` | 自动触发snapshotVersion++ |
| `setActiveFilter(f)` | `sessionActions.setActiveFilter(f)` | |
| `setHiddenTags(new Set([...hiddenTags, tag]))` | `sessionActions.toggleHiddenTag(tag)` | 自动toggle |
| `setSearchQuery(q)` | `sessionActions.setSearchQuery(q)` | |
| `setSnapshotVersion(v => v + 1)` | `sessionActions.incrementSnapshotVersion()` | |

### 保留的useState（UI临时态）

**PlanManager**: ✅ 继续使用useState
- `showEmojiPicker` - emoji面板开关
- `showDateMention` - 日期选择器开关
- `showUnifiedPicker` - 统一picker开关
- `showTagReplace` - 标签替换UI
- `replacingTagElement` - 正在替换的标签DOM
- `activePickerIndex` - 激活的picker索引

**PlanSlate**: ✅ 继续使用useState
- `value` - Slate编辑器内容（Slate自己管理）
- `editorKey` - 强制重渲染key

## 实施步骤

### Phase 1: 创建Hooks ✅ DONE
- [x] `usePlanSlateSession.ts`
- [x] `usePlanManagerSession.ts`

### Phase 2: PlanSlate迁移 🔄 IN PROGRESS
- [x] 导入usePlanSlateSession
- [x] 替换useState声明为reducer
- [ ] 批量替换所有setter调用（~50处）
- [ ] 更新MentionPicker/SearchMenu组件的props
- [ ] 测试@提及、搜索功能

### Phase 3: PlanManager迁移 ⏳ PENDING
- [ ] 导入usePlanManagerSession
- [ ] 替换useState声明
- [ ] 批量替换所有setter调用（~100处）
- [ ] 更新FloatingToolbar、ContentSelectionPanel的props
- [ ] 测试focus、filter、snapshot功能

### Phase 4: 文档与验收 ⏳ PENDING
- [ ] 更新CHANGELOG.md
- [ ] 创建迁移指南（为未来维护者）
- [ ] 验收测试：Tab/Shift+Tab + @提及 + 过滤器组合

## 验收标准

### 功能正确性
- ✅ Tab/Shift+Tab 缩进后光标位置正确
- ✅ @提及打开/关闭不遗留临时状态
- ✅ 切换过滤器时snapshot自动更新
- ✅ focus变化时mode/isTask/tags同步更新

### 代码质量
- ✅ 所有useState已分类（A/B/C/D/E）
- ✅ 会话态使用reducer，UI临时态保留useState
- ✅ reducer actions命名清晰（动词开头）
- ✅ 无闭包陈旧问题（reducer替代了ref hacks）

### 性能
- ✅ reducer避免了多次setState导致的重渲染
- ✅ 保留useMemo/useCallback优化

## 未来优化方向

### Step 2: 抽离EventTreeEngine（纯函数模块）
- `buildEventTree(events)` → `{sortedIds, bulletLevels, orphans}`
- `computeReparentEffect(eventsById, {movedId, newParentId})` → 子树bulletLevel更新建议
- 单元测试覆盖Tab/Shift+Tab规格

### Step 3: 建立PlanStore（统一领域数据）
- 真相源：`eventsById` + `view(sortedIds/bulletLevels)`
- 管线态：`pendingPatches/inflight/localUpdateGuards`
- React侧只订阅slice

### 何时需要Redux？
仅当出现以下场景：
- 多页面共享同一份领域数据
- 需要time-travel/审计定位同步冲突
- 复杂异步队列（重试/冲突解决/离线同步）

## Git Commit Message

```
refactor: migrate useState to useReducer for session state (v2.21.0)

 PlanSlate Session State Refactor:
- Created usePlanSlateSession hook
  * Mention session (8 useState → 1 reducer)
  * Search session
  * Cursor intent (future: keyboard command restoration)
  * Flush request policy

 PlanManager Session State Refactor:
- Created usePlanManagerSession hook
  * Focus state (lineId + mode + isTask + selectedTags)
  * Filter state (dateRange + activeFilter + hiddenTags + searchQuery)
  * Snapshot version auto-increment on filter change

 Benefits:
- Atomic updates for coupled states (no partial updates)
- Clearer state machine (mention open/close lifecycle)
- Reduced re-renders (1 dispatch vs 4 setState)
- Better maintainability (actions document intent)

 Architecture Notes:
- Follows GPT-5.2's state classification guidelines
- UI temp state stays in useState
- Session state migrates to useReducer
- Domain data will move to EventService (next phase)

 Testing:
- Mention picker open/close lifecycle
- Tab/Shift+Tab with cursor restoration
- Filter changes trigger snapshot update
```

## 参考文档

- `docs/audits/给 Copilot 的说明：为什么不需要 Redux，以及 useState 分组与自建 Store_Reducer 方案.md`
- `LEVEL_BULLETLEVEL_EXPLANATION.md` - 层级同步架构
