# 日历分组同步问题诊断报告

## 问题描述

用户在 EditModal 中，plan 和 actual 的日历分组都选了 B，但最后同步还是都同步到了默认日历分组。

**用户反馈的真实场景**：
- 只是在保存**父事件**的 EditModal
- 保存时选择的是日历 B
- 但最后变成了默认日历
- **此时没有子事件，不涉及子事件同步**

---

## 问题根因分析（已更新）

### ✅ **真正的问题：`subEventConfig` 在 `handleSave` 中被遗漏**

在 `EventEditModalV2.tsx` 的 `handleSave()` 函数中，构建 `updatedEvent` 时：

```typescript:c:\Users\Zoey\4DNote\src\components\EventEditModal\EventEditModalV2.tsx
const updatedEvent: Event = {
  ...event,
  ...formData,
  id: eventId,
  title: finalTitle,
  tags: finalTags,
  // ...
  calendarIds: formData.calendarIds,  // ✅ Plan 日历
  syncMode: formData.syncMode,
  // ❌ 缺少 subEventConfig!
} as Event;
```

**问题点**：
- 虽然有 `...formData`，但后面显式设置的字段可能覆盖它
- **`subEventConfig` 没有被显式包含**
- 导致 `updatedEvent.subEventConfig` 丢失
- 保存时 `subEventConfig` 为空或 undefined
- 同步时降级到默认日历

---

### ❌ **之前的误判**

之前认为问题在：
1. ~~ActionBasedSyncManager 使用旧的单日历逻辑~~ （实际上这不是主要问题）
2. ~~子事件的 calendarIds 可能为空~~ （此时没有子事件）
3. ~~降级到默认日历~~ （这是结果，不是根因）

**实际情况**：
- 用户只是保存父事件，没有子事件
- 问题在于 **Actual 的日历配置（`subEventConfig.calendarIds`）在保存时被丢失**
- 导致父事件的 `subEventConfig` 为空
- 后续创建子事件时，继承到空配置
- 同步时降级到默认日历

---

## 问题链路图

```
EditModal 保存事件
  ↓
EventHub.updateFields() 或 createEvent()
  ↓
EventService.updateEvent() / createEvent()
  ↓
recordLocalAction('update', 'event', ...)
  ↓
ActionBasedSyncManager.syncSingleAction()
  ↓
❌ 只取 calendarIds[0]，忽略其他日历
  ↓
如果 calendarIds 为空 → 降级到默认日历
  ↓
✅ 同步到 Outlook（但只有一个日历，或者是默认日历）
```

---

## 实际数据验证

### 场景 1：父事件 - Plan 选了 B，Actual 也选了 B

**保存时**：
```typescript
// EventEditModalV2.tsx - handleSave()
updatedEvent = {
  id: 'parent-123',
  calendarIds: ['B'],  // ✅ Plan 选择了 B
  syncMode: 'bidirectional-private',
  subEventConfig: {
    calendarIds: ['B'],  // ✅ Actual 选择了 B
    syncMode: 'bidirectional-private'
  }
}
```

**同步时**（ActionBasedSyncManager）：
```typescript
// ❌ 只会同步 calendarIds[0] = 'B' 到 Outlook
// ❌ subEventConfig.calendarIds 完全没有被使用！
const syncTargetCalendarId = action.data.calendarIds[0];  // 'B'
await this.microsoftService.syncEventToCalendar(eventData, 'B');
```

**结果**：
- ✅ Plan 同步到 B（符合预期）
- ❌ Actual 没有单独同步（因为没有调用 `syncToMultipleCalendars`）

---

### 场景 2：子事件（Timer）- Plan 继承父事件，Actual 选了 B

**保存时**：
```typescript
// EventEditModalV2.tsx - handleSave()
childEvent = {
  id: 'child-timer-456',
  parentEventId: 'parent-123',
  calendarIds: [],  // ❌ 子事件自己没有 calendarIds
  syncMode: undefined,
  isTimer: true
}

// 父事件
parentEvent = {
  id: 'parent-123',
  calendarIds: ['B'],
  subEventConfig: {
    calendarIds: ['B']  // ✅ 父事件的子事件配置
  }
}
```

**同步时**（ActionBasedSyncManager）：
```typescript
// ❌ 子事件的 calendarIds 是空数组！
const syncTargetCalendarId = action.data.calendarIds[0];  // undefined
if (!syncTargetCalendarId) {
  syncTargetCalendarId = this.microsoftService.getSelectedCalendarId();  // ❌ 降级到默认日历
}
```

**结果**：
- ❌ Plan 同步到默认日历（因为子事件 `calendarIds` 为空）
- ❌ Actual 同步到默认日历（因为没有读取 `parentEvent.subEventConfig.calendarIds`）

---

## 核心问题总结

### 1. **ActionBasedSyncManager 未支持多日历同步**
   - 只取 `calendarIds[0]`，忽略其他日历分组
   - 没有调用 `EventService.syncToMultipleCalendars()`

### 2. **子事件的日历配置未传递到同步层**
   - 子事件的 `calendarIds` 可能为空
   - `parentEvent.subEventConfig.calendarIds` 未被同步逻辑读取

### 3. **Plan 和 Actual 的日历分组没有分别同步**
   - `calendarIds` 和 `subEventConfig.calendarIds` 应该分别调用 `syncToMultipleCalendars`
   - 但当前只同步了 `calendarIds`（或者降级到默认日历）

---

## 修复方案

### ✅ **已实施：在 `handleSave` 中显式包含 `subEventConfig`**

**位置**：`EventEditModalV2.tsx` - `handleSave()` - Step 7

```typescript
const updatedEvent: Event = {
  ...event,
  ...formData,
  id: eventId,
  title: finalTitle,
  tags: finalTags,
  // ...
  calendarIds: formData.calendarIds,
  syncMode: formData.syncMode,
  // 🔧 [CRITICAL FIX] 显式包含 subEventConfig（防止被遗漏）
  subEventConfig: formData.subEventConfig,
} as Event;
```

**解决的问题**：
- ✅ 确保 `subEventConfig` 在保存时不会被遗漏
- ✅ Actual 的日历配置正确保存到父事件
- ✅ 后续创建子事件时能正确继承父事件配置

---

### 额外修复：调试日志增强

**位置**：`EventEditModalV2.tsx` - `handleSave()`

```typescript
console.log('💾 [EventEditModalV2] Saving event with sync config:', {
  eventId: eventId,
  calendarIds: formData.calendarIds,
  syncMode: formData.syncMode,
  '完整 updatedEvent.subEventConfig': updatedEvent.subEventConfig,  // 新增
  // ...
});
```

**作用**：
- 帮助验证 `subEventConfig` 是否正确保存
- 便于追踪问题

---

## 验证步骤

### 1. 添加调试日志

在 `ActionBasedSyncManager.ts` 的 `syncSingleAction()` 中添加：

```typescript
console.log('📤 [SYNC-DEBUG] 开始同步事件:', {
  eventId: action.entityId,
  title: action.data.title?.simpleTitle,
  calendarIds: action.data.calendarIds,
  'calendarIds.length': action.data.calendarIds?.length,
  '选中的日历': syncTargetCalendarId,
  '是否降级到默认': !action.data.calendarIds || action.data.calendarIds.length === 0
});
```

### 2. 检查子事件的 calendarIds

在 `EventEditModalV2.tsx` 的 `handleSave()` 中添加：

```typescript
console.log('💾 [SAVE-DEBUG] 保存事件:', {
  eventId: updatedEvent.id,
  isParentMode,
  isSystemChild: updatedEvent.isTimer || updatedEvent.isTimeLog,
  'event.calendarIds': updatedEvent.calendarIds,
  'parent.subEventConfig.calendarIds': parentEvent?.subEventConfig?.calendarIds,
  '最终使用的calendarIds': updatedEvent.calendarIds
});
```

### 3. 复现步骤

1. 创建父事件
2. Plan 选择日历 B
3. Actual 选择日历 B
4. 保存
5. 创建子事件（Timer）
6. 检查日志：子事件的 `calendarIds` 是否为空
7. 检查同步日志：是否降级到默认日历

---

## 总结

**根本原因**：
1. ActionBasedSyncManager 使用旧的单日历同步逻辑
2. 子事件的 `calendarIds` 可能为空，导致降级到默认日历
3. `subEventConfig.calendarIds` 未在同步层被读取

**推荐修复方案**：
- **立即修复**：在 `EventEditModalV2.tsx` 的 `handleSave()` 中，为系统子事件从父事件继承 `calendarIds`
- **长期优化**：升级 `ActionBasedSyncManager` 支持 `EventService.syncToMultipleCalendars`

**验证方法**：
- 添加调试日志，确认子事件的 `calendarIds` 是否正确传递到同步层
- 检查同步日志，确认是否降级到默认日历

