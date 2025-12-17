# 日历分组同步问题测试指南

## 已实施的修复

### 1. 修复子事件从父事件继承 calendarIds

**位置**：`EventEditModalV2.tsx` - `handleSave()` - Step 9.5

**修复内容**：
```typescript
// 🔧 [BUG FIX] 如果子事件的 calendarIds 为空，从父事件的 subEventConfig 继承
const parentEvent = await EventService.getEventById(formData.parentEventId);
if ((!updatedEvent.calendarIds || updatedEvent.calendarIds.length === 0) && parentEvent?.subEventConfig?.calendarIds) {
  updatedEvent.calendarIds = parentEvent.subEventConfig.calendarIds;
  console.log('🔧 [EventEditModalV2] 系统子事件：从父事件继承 calendarIds:', updatedEvent.calendarIds);
}
```

**解决的问题**：
- ✅ 系统子事件（Timer/TimeLog）的 `calendarIds` 可能为空
- ✅ 从父事件的 `subEventConfig.calendarIds` 继承日历配置
- ✅ 确保子事件同步时有正确的日历分组

---

### 2. 增强调试日志

**位置**：
- `EventEditModalV2.tsx` - `handleSave()`
- `ActionBasedSyncManager.ts` - `syncSingleAction()`

**新增日志**：
```typescript
// EditModal 保存时
console.log('💾 [EventEditModalV2] Saving event with sync config:', {
  eventId,
  calendarIds,
  syncMode,
  isParentMode,
  isSystemChild,
  parentEventId,
  subEventConfig
});

// 同步管理器同步时
console.log('🔍 [SYNC] Using direct calendar ID from array:', {
  calendarIds,
  selectedCalendarId,
  eventId,
  eventTitle
});

console.warn('⚠️ [SYNC] No calendar ID at all (new event), using default calendar:', {
  eventId,
  eventTitle,
  'event.calendarIds',
  'defaultCalendarId',
  'event.tags'
});
```

---

## 测试场景

### 场景 1：父事件 - Plan 和 Actual 都选择日历 B

**测试步骤**：
1. 创建新事件（父事件）
2. 在 "计划安排" 中选择日历 B
3. 在 "实际进展" 中选择日历 B
4. 保存事件
5. 打开开发者工具查看日志

**预期结果**：
```
💾 [EventEditModalV2] Saving event with sync config: {
  eventId: "uuid-xxx",
  calendarIds: ["B"],          // ✅ Plan 选择了 B
  subEventConfig: {
    calendarIds: ["B"],        // ✅ Actual 选择了 B
    syncMode: "bidirectional-private"
  }
}

🔍 [SYNC] Using direct calendar ID from array: {
  calendarIds: ["B"],
  selectedCalendarId: "B",     // ✅ 同步到 B
  eventId: "uuid-xxx"
}
```

**检查点**：
- [ ] 日志中 `calendarIds: ["B"]` 正确
- [ ] 日志中 `subEventConfig.calendarIds: ["B"]` 正确
- [ ] 同步日志显示 `selectedCalendarId: "B"`
- [ ] 没有出现 "No calendar ID" 的警告

---

### 场景 2：系统子事件（Timer）继承父事件配置

**测试步骤**：
1. 使用场景 1 创建的父事件
2. 启动 Timer（创建系统子事件）
3. 编辑 Timer 事件
4. 保存（不修改日历配置）
5. 查看日志

**预期结果**：
```
💾 [EventEditModalV2] Saving event with sync config: {
  eventId: "timer-xxx",
  calendarIds: [],             // ❌ 子事件自己没有配置
  isParentMode: false,
  isSystemChild: true,         // ✅ 是系统子事件
  parentEventId: "uuid-xxx"
}

🔧 [EventEditModalV2] 系统子事件：从父事件继承 calendarIds: ["B"]  // ✅ 从父事件继承

🔍 [SYNC] Using direct calendar ID from array: {
  calendarIds: ["B"],          // ✅ 继承后的 calendarIds
  selectedCalendarId: "B",     // ✅ 同步到 B
  eventId: "timer-xxx"
}
```

**检查点**：
- [ ] 日志中显示 "从父事件继承 calendarIds"
- [ ] 继承后的 `calendarIds: ["B"]`
- [ ] 同步日志显示 `selectedCalendarId: "B"`
- [ ] 没有出现 "No calendar ID" 的警告

---

### 场景 3：验证降级到默认日历的情况（边界测试）

**测试步骤**：
1. 创建新事件，**不选择任何日历**
2. 保存事件
3. 查看日志

**预期结果**：
```
💾 [EventEditModalV2] Saving event with sync config: {
  eventId: "uuid-xxx",
  calendarIds: [],             // ❌ 没有选择日历
  subEventConfig: {
    calendarIds: []            // ❌ 没有选择日历
  }
}

⚠️ [SYNC] No calendar ID at all (new event), using default calendar: {
  eventId: "uuid-xxx",
  'event.calendarIds': [],
  'defaultCalendarId': "默认日历ID"  // ✅ 降级到默认日历
}
```

**检查点**：
- [ ] 出现警告 "No calendar ID at all"
- [ ] 显示降级到默认日历的 ID
- [ ] 事件成功同步到默认日历

---

## 诊断清单

### 如果问题仍然存在，检查以下内容：

#### 1. 检查事件的 calendarIds

```javascript
// 在浏览器控制台运行
const EventService = require('./services/EventService').EventService;
const event = await EventService.getEventById('你的事件ID');
console.log({
  id: event.id,
  title: event.title,
  calendarIds: event.calendarIds,
  subEventConfig: event.subEventConfig,
  parentEventId: event.parentEventId
});
```

#### 2. 检查父事件的 subEventConfig

```javascript
const parentEvent = await EventService.getEventById('父事件ID');
console.log({
  id: parentEvent.id,
  title: parentEvent.title,
  calendarIds: parentEvent.calendarIds,
  subEventConfig: parentEvent.subEventConfig,
  childEventIds: parentEvent.childEventIds
});
```

#### 3. 检查同步队列

```javascript
// 查看待同步的操作
const syncManager = window.syncManager;  // 或者从全局获取
const queue = syncManager.actionQueue.filter(a => !a.synchronized);
console.table(queue.map(a => ({
  type: a.type,
  entityId: a.entityId,
  calendarIds: a.data?.calendarIds,
  timestamp: a.timestamp
})));
```

---

## 已知限制

### 1. 仅支持单日历同步

**当前行为**：
- `ActionBasedSyncManager` 只会取 `calendarIds[0]`（第一个日历）
- 多选日历时，只同步到第一个日历

**示例**：
```typescript
calendarIds: ["B", "C"]  // 用户选择了 B 和 C
// ❌ 实际只同步到 B（第一个）
```

**未来优化**：
- 升级到 `EventService.syncToMultipleCalendars` 支持多日历同步
- 分别管理 `syncedPlanCalendars` 和 `syncedActualCalendars`

### 2. Plan 和 Actual 未分离同步

**当前行为**：
- 只同步 `calendarIds`（Plan 配置）
- `subEventConfig.calendarIds`（Actual 配置）未单独同步

**示例**：
```typescript
calendarIds: ["B"]              // Plan 日历
subEventConfig.calendarIds: ["C"]  // Actual 日历
// ❌ 实际只同步 Plan 的日历 B
```

**未来优化**：
- 分别调用 `syncToMultipleCalendars` 同步 Plan 和 Actual
- 支持 `syncType: 'plan' | 'actual'` 参数

---

## 回归测试

完成修复后，运行以下回归测试确保没有破坏现有功能：

### 测试 1：普通事件创建和同步
- [ ] 创建事件，选择日历 A，保存
- [ ] 检查是否同步到日历 A
- [ ] 检查日志无警告

### 测试 2：标签自动映射日历
- [ ] 创建事件，添加有日历映射的标签
- [ ] 检查是否自动选择对应日历
- [ ] 保存后检查是否同步到正确日历

### 测试 3：Timer 事件创建
- [ ] 启动 Timer
- [ ] 检查 Timer 事件是否继承父事件配置
- [ ] 检查是否同步到正确日历

### 测试 4：父子事件配置同步
- [ ] 修改父事件的 Actual 日历配置
- [ ] 检查子事件是否自动更新
- [ ] 检查日志显示批量更新

---

## 报告问题

如果测试失败，请提供以下信息：

1. **测试场景编号**
2. **完整的控制台日志**（包含 `💾 [EventEditModalV2]` 和 `🔍 [SYNC]` 的日志）
3. **事件数据**（使用上面的诊断清单检查）
4. **同步队列状态**
5. **预期行为 vs 实际行为**

---

## 快速检查命令

在浏览器控制台运行以下命令快速检查：

```javascript
// 1. 检查最近创建的事件
(async () => {
  const EventService = (await import('./services/EventService')).EventService;
  const events = await EventService.getAllEvents();
  const recent = events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  console.table(recent.map(e => ({
    id: e.id.slice(-8),
    title: e.title?.simpleTitle?.slice(0, 20),
    calendarIds: e.calendarIds?.join(','),
    'subEventConfig.calendarIds': e.subEventConfig?.calendarIds?.join(','),
    isTimer: e.isTimer,
    parentEventId: e.parentEventId?.slice(-8)
  })));
})();

// 2. 检查同步队列
console.table(window.syncManager?.actionQueue.filter(a => !a.synchronized).map(a => ({
  type: a.type,
  entityId: a.entityId.slice(-8),
  calendarIds: a.data?.calendarIds?.join(','),
  timestamp: new Date(a.timestamp).toLocaleString()
})));
```
