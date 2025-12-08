# EventEditModalV2 useEffect 审计报告

## 问题总结
- **总计 21 个 useEffect**，导致性能问题和维护困难
- 多个 useEffect 依赖 `refreshCounter`，导致连锁反应
- Layer 2 auto-save 触发 `eventsUpdated` 事件，导致编辑器崩溃

## useEffect 清单（按行号）

### 1. 行 253：加载所有事件（EventTree）
```tsx
React.useEffect(() => {
  const loadEvents = async () => {
    const events = await EventService.getAllEvents();
    setAllEvents(events);
  };
  if (isOpen) loadEvents();
}, [isOpen]);
```
**用途**: EventTree 组件需要所有事件数据  
**状态**: ✅ **保留**（EventTree 必需）

---

### 2. 行 265：订阅 TagService 更新
```tsx
React.useEffect(() => {
  const handleTagsUpdate = () => {
    const updatedTags = TagService.getTags();
    setAvailableTags(updatedTags);
  };
  TagService.addListener(handleTagsUpdate);
  return () => TagService.removeListener(handleTagsUpdate);
}, []);
```
**用途**: 当标签在 TagManager 中被修改时，更新 availableTags  
**状态**: ✅ **保留**（标签管理必需）

---

### 3. 行 444：处理 emoji shortcut（旧版）
```tsx
React.useEffect(() => {
  if (!isOpen || !formData.tags.length) return;
  const firstTag = TagService.getTagById(formData.tags[0]);
  if (firstTag?.emojiShortcut && !extractFirstEmoji(formData.title)) {
    // 自动添加 emoji...
  }
}, [isOpen, formData.tags, formData.title]);
```
**用途**: 自动添加标签 emoji 到标题  
**状态**: ❌ **已废弃**（emoji 逻辑已移至其他地方）  
**建议**: 🗑️ **删除**

---

### 4. 行 481：捕获初始快照（Layer 3）
```tsx
React.useEffect(() => {
  if (isOpen && formData && !initialSnapshotRef.current) {
    initialSnapshotRef.current = JSON.parse(JSON.stringify(formData));
  }
  if (!isOpen) {
    initialSnapshotRef.current = null;
  }
}, [isOpen, formData]);
```
**用途**: Layer 3 - 取消回滚功能  
**状态**: ✅ **保留**（取消按钮必需）

---

### 5. 行 498：Layer 2 Auto-save
```tsx
React.useEffect(() => {
  if (!isOpen || !formData.id || formData.id.startsWith('event-')) return;
  if (!initialSnapshotRef.current) return;
  
  const autoSaveTimer = setTimeout(async () => {
    // 静默自动保存...
  }, 5000);
  
  return () => clearTimeout(autoSaveTimer);
}, [isOpen, formData.id, formData.title, formData.tags, ...]);
```
**用途**: Layer 2 - 5秒自动保存  
**状态**: ✅ **保留**（数据保护必需）  
**问题**: ⚠️ **触发 eventsUpdated 导致编辑器崩溃**  
**修复**: ✅ 已添加 `isAutoSavingRef` 阻止刷新

---

### 6. 行 586：同步 EventTree 关联关系
```tsx
React.useEffect(() => {
  if (!event) return;
  setFormData(prev => ({
    ...prev,
    childEventIds: event.childEventIds,
    linkedEventIds: event.linkedEventIds,
    backlinks: event.backlinks,
  }));
}, [event?.id, JSON.stringify(event?.childEventIds), ...]);
```
**用途**: 从 event prop 同步 EventTree 数据到 formData  
**状态**: ✅ **保留**（EventTree 必需）

---

### 7. 行 616：同步 formData.syncMode → sourceSyncMode
```tsx
React.useEffect(() => {
  setSourceSyncMode(formData.syncMode);
}, [formData.syncMode]);
```
**用途**: 同步计划页签的 syncMode  
**状态**: ⚠️ **可简化**  
**建议**: 💡 **改为 useMemo 或直接读取 formData.syncMode**

---

### 8. 行 629：同步 formData.subEventConfig.syncMode → syncSyncMode
```tsx
React.useEffect(() => {
  setSyncSyncMode(formData.subEventConfig?.syncMode || 'bidirectional-private');
}, [formData.subEventConfig?.syncMode]);
```
**用途**: 同步同步页签的 syncMode  
**状态**: ⚠️ **可简化**  
**建议**: 💡 **改为 useMemo 或直接读取 formData.subEventConfig.syncMode**

---

### 9. 行 676：同步 subEventConfig.calendarIds → syncCalendarIds
```tsx
React.useEffect(() => {
  setSyncCalendarIds(formData.subEventConfig?.calendarIds || []);
}, [formData.subEventConfig?.calendarIds]);
```
**用途**: 同步同步页签的 calendarIds  
**状态**: ⚠️ **可简化**  
**建议**: 💡 **改为 useMemo 或直接读取 formData.subEventConfig.calendarIds**

---

### 10. 行 688：加载父事件（依赖 refreshCounter）
```tsx
React.useEffect(() => {
  const loadParent = async () => {
    if (!event?.parentEventId) return;
    const parent = await EventService.getEventById(event.parentEventId);
    setParentEvent(parent);
  };
  loadParent();
}, [event?.id, event?.parentEventId, refreshCounter]);
```
**用途**: 子事件模式 - 加载父事件数据  
**状态**: ⚠️ **依赖 refreshCounter**  
**问题**: ⚠️ **refreshCounter 变化导致重新加载**  
**建议**: 🔧 **移除 refreshCounter 依赖**

---

### 11. 行 710：加载子事件（依赖 refreshCounter）
```tsx
React.useEffect(() => {
  const loadChildren = async () => {
    const targetId = event?.parentEventId || event?.id;
    if (!targetId) return;
    const parent = await EventService.getEventById(targetId);
    const children = await EventService.getEventsByIds(parent?.childEventIds || []);
    setChildEvents(children);
  };
  loadChildren();
}, [event?.id, refreshCounter]);
```
**用途**: 父事件模式 - 加载子事件列表  
**状态**: ⚠️ **依赖 refreshCounter**  
**问题**: ⚠️ **refreshCounter 变化导致重新加载**  
**建议**: 🔧 **移除 refreshCounter 依赖**

---

### 12. 行 770：监听 eventsUpdated 事件
```tsx
React.useEffect(() => {
  const handleEventsUpdated = (e: any) => {
    if (isAutoSavingRef.current) return;
    if (updatedEventId === event?.id || updatedEventId === event?.parentEventId) {
      setRefreshCounter(prev => prev + 1); // 🚫 已禁用
    }
  };
  window.addEventListener('eventsUpdated', handleEventsUpdated);
  return () => window.removeEventListener('eventsUpdated', handleEventsUpdated);
}, [event?.id, event?.parentEventId]);
```
**用途**: 监听其他标签页的事件更新  
**状态**: ⚠️ **已禁用 setRefreshCounter**  
**建议**: 🗑️ **完全删除**（auto-save 不应触发刷新）

---

### 13. 行 798：日志输出（子事件/父事件模式）
```tsx
React.useEffect(() => {
  if (parentEvent) {
    console.log('🔗 子事件模式 - 显示父事件数据:', ...);
  } else if (childEvents.length > 0) {
    console.log('🔗 父事件模式 - 显示子事件列表:', ...);
  }
}, [childEvents, parentEvent, event?.id]);
```
**用途**: 调试日志  
**状态**: ⚠️ **仅调试用途**  
**建议**: 🗑️ **生产环境删除**

---

### 14. 行 1578：全局 Timer 监听器
```tsx
useEffect(() => {
  const handleGlobalTimerUpdate = () => {
    setGlobalTimer(prev => ({ ...prev }));
  };
  window.addEventListener('globalTimerUpdate', handleGlobalTimerUpdate);
  return () => window.removeEventListener('globalTimerUpdate', handleGlobalTimerUpdate);
}, []);
```
**用途**: Timer 功能 - 监听全局 Timer 更新  
**状态**: ✅ **保留**（Timer 必需）

---

### 15-21. 行 1688-1849：多个小型 useEffect
这些 useEffect 主要用于：
- 同步表单字段
- 更新 UI 状态
- 处理特定逻辑

**建议**: 📊 **需要逐个审查**

---

## 清理建议总结

### 🗑️ 可以删除的 useEffect（5个）
1. **行 444**: emoji shortcut（已废弃）
2. **行 770**: eventsUpdated 监听器（已禁用 setRefreshCounter）
3. **行 798**: 调试日志（生产环境不需要）

### 🔧 需要修复的 useEffect（5个）
1. **行 616, 629, 676**: 改为 useMemo 或直接读取（避免额外状态）
2. **行 688, 710**: 移除 refreshCounter 依赖

### ✅ 保留的 useEffect（11个）
- Layer 2 auto-save
- EventTree 加载
- TagService 监听
- 初始快照捕获
- EventTree 关联同步
- Timer 监听
- 等等...

---

## 立即行动计划

### Phase 1: 紧急修复（当前 Slate 错误）
✅ **已完成**：
1. 添加 `isAutoSavingRef` 阻止 auto-save 触发刷新
2. 禁用 `setRefreshCounter(prev => prev + 1)`

### Phase 2: 清理冗余（性能优化）
⏳ **待执行**：
1. 删除 emoji shortcut useEffect（行 444）
2. 删除 eventsUpdated 监听器（行 770）
3. 删除调试日志 useEffect（行 798）
4. 将 sourceSyncMode/syncSyncMode/syncCalendarIds 改为 useMemo

### Phase 3: 架构重构（长期优化）
📋 **计划**：
1. 将多个小型 useEffect 合并为逻辑组
2. 使用 useReducer 统一管理 formData 更新
3. 考虑使用 Context 避免 prop drilling

---

## 当前状态
- ✅ Slate DOM 错误已修复
- ⚠️ 仍有 21 个 useEffect 需要清理
- 🎯 建议先删除 3-5 个明显冗余的 useEffect
