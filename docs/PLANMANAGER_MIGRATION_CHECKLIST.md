# PlanManager useState迁移清单 (v2.21.0)

## 当前状态

✅ **已完成**：
- Hook创建：`usePlanManagerSession.ts`
- 导入添加：Line 42
- useState声明替换：Line 326-338 → Line 326-329

⏳ **待完成**：批量替换所有setter调用（~21处）

---

## 替换映射表

### Focus State（成组变化 → 原子操作）

#### 场景1: handleFocus - 聚焦行时更新多个状态
**位置**: Line 938-955

**Before** (4个setState):
```typescript
setCurrentFocusedLineId(lineId);
setCurrentFocusedMode(isDescriptionLine ? 'description' : 'title');
setCurrentIsTask(item.isTask || false);
```

**After** (1个action):
```typescript
sessionActions.setFocus(lineId, {
  mode: isDescriptionLine ? 'description' : 'title',
  isTask: item?.isTask || false
});
```

#### 场景2: PlanSlate onCurrentLineChange
**位置**: Line 2609-2653

**Before** (同场景1):
```typescript
setCurrentFocusedLineId(lineId);
setCurrentFocusedMode(isDescMode ? 'description' : 'title');
setCurrentIsTask(matchedItem.isTask || false);
```

**After**:
```typescript
sessionActions.setFocus(lineId, {
  mode: isDescMode ? 'description' : 'title',
  isTask: matchedItem?.isTask || false
});
```

### Tags State

#### 场景: PlanSlate onCurrentTagsChange
**位置**: Line 905, 892, 2885

**Before**:
```typescript
setCurrentSelectedTags(tagIds);
setCurrentSelectedTags([]);
```

**After**:
```typescript
sessionActions.updateFocusTags(tagIds);
sessionActions.updateFocusTags([]);
```

### Filter State

#### 场景1: ContentSelectionPanel callbacks
**位置**: Line 2515-2559

**Before**:
```typescript
setActiveFilter(filter);
setSearchQuery(query);
setDateRange({ start, end });
setHiddenTags(prev => { ... });
```

**After**:
```typescript
sessionActions.setActiveFilter(filter);
sessionActions.setSearchQuery(query);
sessionActions.setDateRange({ start, end });
sessionActions.toggleHiddenTag(tag);
```

### Snapshot Version

#### 场景: 外部事件触发快照更新
**位置**: Line 803, 808, 812

**Before**:
```typescript
setSnapshotVersion(v => v + 1);
```

**After**:
```typescript
sessionActions.incrementSnapshotVersion();
```

---

## 组件Props更新

### ContentSelectionPanel
**位置**: Line ~2400

**Before**:
```tsx
<ContentSelectionPanel
  activeFilter={activeFilter}
  onFilterChange={handleFilterChange}
  searchQuery={searchQuery}
  onSearchChange={handleSearchChange}
  dateRange={dateRange}
  onDateRangeChange={handleDateRangeChange}
  hiddenTags={hiddenTags}
  onToggleTag={handleToggleTag}
  // ...
/>
```

**After**:
```tsx
<ContentSelectionPanel
  activeFilter={session.filter.activeFilter}
  onFilterChange={(filter) => sessionActions.setActiveFilter(filter)}
  searchQuery={session.filter.searchQuery}
  onSearchChange={(query) => sessionActions.setSearchQuery(query)}
  dateRange={session.filter.dateRange}
  onDateRangeChange={(range) => sessionActions.setDateRange(range)}
  hiddenTags={session.filter.hiddenTags}
  onToggleTag={(tag) => sessionActions.toggleHiddenTag(tag)}
  // ...
/>
```

### FloatingToolbar
**位置**: Line ~2700

**Before**:
```tsx
currentTags={currentSelectedTags}
currentFocusedLineId={currentFocusedLineId}
currentFocusedMode={currentFocusedMode}
currentIsTask={currentIsTask}
```

**After**:
```tsx
currentTags={session.focus.selectedTags}
currentFocusedLineId={session.focus.lineId}
currentFocusedMode={session.focus.mode}
currentIsTask={session.focus.isTask}
```

### PlanSlate
**位置**: Line ~2800

**Before**:
```tsx
onCurrentLineChange={(lineId, tags, mode, isTask) => {
  setCurrentFocusedLineId(lineId);
  setCurrentFocusedMode(mode);
  setCurrentIsTask(isTask);
}}
onCurrentTagsChange={(tags) => {
  setCurrentSelectedTags(tags);
}}
```

**After**:
```tsx
onCurrentLineChange={(lineId, tags, mode, isTask) => {
  sessionActions.setFocus(lineId, { mode, isTask });
}}
onCurrentTagsChange={(tags) => {
  sessionActions.updateFocusTags(tags);
}}
```

---

## useEffect依赖更新

### 需要更新依赖数组的useEffect

#### Snapshot计算
**位置**: Line ~470

**Before**:
```typescript
}, [dateRange, items, snapshotVersion]);
```

**After**:
```typescript
}, [session.filter.dateRange, items, session.snapshotVersion]);
```

#### Filter应用
**位置**: Line ~520

**Before**:
```typescript
}, [items, activeFilter, hiddenTags, searchQuery, dateRange]);
```

**After**:
```typescript
}, [items, session.filter.activeFilter, session.filter.hiddenTags, session.filter.searchQuery, session.filter.dateRange]);
```

---

## 估算替换量

- **setState调用**: 21处
- **组件props**: 3个组件（ContentSelectionPanel, FloatingToolbar, PlanSlate）
- **useEffect依赖**: ~5处

---

## 建议执行顺序

1. ✅ **先提交PlanSlate重构**（已完成，功能独立）
2. **逐个场景替换PlanManager**：
   - Phase 1: Focus State（handleFocus + onCurrentLineChange）
   - Phase 2: Tags State（onCurrentTagsChange）
   - Phase 3: Filter State（ContentSelectionPanel callbacks）
   - Phase 4: Snapshot Version
   - Phase 5: 组件Props更新
   - Phase 6: useEffect依赖更新
3. **测试验证**

---

## 回滚点

如果PlanManager重构出现问题，可以：
1. 保留PlanSlate的重构（已稳定）
2. 回退PlanManager到本次commit之前
3. 逐步调试PlanManager的问题
