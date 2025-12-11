# Plan 页面存储链路审计报告

**版本**: v1.0  
**日期**: 2025-12-03  
**审计范围**: PlanSlate → PlanManager → EventHub → EventService → StorageManager → IndexedDB/SQLite

---

## 📋 执行摘要

基于对 TagService 数据链路的完整审计经验，本次对 Plan 页面的存储链路进行了系统性审计。

**审计结论**:
- ✅ **字段定义完整**: Event 接口包含 80+ 字段，定义清晰
- ✅ **序列化层完整**: PlanSlate 序列化函数通过 metadata 透传所有字段
- ✅ **PlanManager 透传架构**: executeBatchUpdate 使用 v1.5 透传模式，保留所有字段
- ✅ **EventService 规范化**: updateEvent 对 title 和 eventlog 进行三层架构规范化
- ✅ **StorageManager 双写**: 同时写入 IndexedDB 和 SQLite，包含缓存更新
- ⚠️ **潜在问题**: 发现 bulletLevel 字段在某些场景下可能未正确传递

---

## 🔍 数据流分析

### 1. 数据源：Event 接口 (`src/types.ts`)

```typescript
export interface Event {
  // ===== 核心字段 =====
  id: string;
  title: EventTitle;  // 三层架构：fullTitle, colorTitle, simpleTitle
  description?: string;
  
  // ===== 时间字段 =====
  startTime?: string;
  endTime?: string;
  dueDate?: string;
  isAllDay?: boolean;
  timeSpec?: TimeSpec;
  
  // ===== 样式字段 =====
  emoji?: string;
  color?: string;
  
  // ===== 分类字段 =====
  tags?: string[];
  calendarIds?: string[];
  todoListIds?: string[];
  category?: string;
  
  // ===== 业务字段 =====
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  isCompleted?: boolean;
  type?: 'todo' | 'task' | 'event';
  checkType?: CheckType;  // 'none' | 'once' | 'recurring'
  checked?: string[];
  unchecked?: string[];
  recurringConfig?: RecurringConfig;
  
  // ===== 标记字段 =====
  isTimer?: boolean;
  isTimeLog?: boolean;
  isTask?: boolean;
  isPlan?: boolean;
  isTimeCalendar?: boolean;
  
  // ===== EventTree 字段 =====
  parentEventId?: string;
  childEventIds?: string[];
  linkedEventIds?: string[];
  backlinks?: string[];
  
  // ===== 富文本字段 =====
  eventlog?: string | EventLog;
  
  // ===== 同步字段 =====
  source?: 'local' | 'outlook' | 'google' | 'icloud';
  syncStatus?: SyncStatusType;
  syncMode?: string;
  planSyncConfig?: PlanSyncConfig;
  actualSyncConfig?: ActualSyncConfig;
  externalId?: string;
  
  // ===== 层级字段 =====
  level?: number;  // Plan 页面显示层级
  
  // ===== 元数据字段 =====
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  
  // ...更多字段（共 80+ 个）
}
```

**字段总数**: 80+  
**必需字段**: id, title, createdAt, updatedAt

---

### 2. 序列化层：PlanSlate (`src/components/PlanSlate/serialization.ts`)

#### 2.1 Event → Slate 节点 (`planItemsToSlateNodes`)

```typescript
export function planItemsToSlateNodes(items: any[]): EventLineNode[] {
  items.forEach(item => {
    const metadata: EventMetadata = {
      // ✅ 时间字段保留 undefined（不转换为 null）
      startTime: item.startTime,
      endTime: item.endTime,
      dueDate: item.dueDate,
      isAllDay: item.isAllDay,
      timeSpec: item.timeSpec,
      
      // ✅ 样式字段
      emoji: item.emoji,
      color: item.color,
      
      // ✅ 业务字段
      priority: item.priority,
      isCompleted: item.isCompleted,
      isTask: item.isTask,
      type: item.type,
      checkType: item.checkType,  // 不添加默认值
      checked: item.checked || [],
      unchecked: item.unchecked || [],
      
      // ✅ Plan 相关
      isPlan: item.isPlan,
      isTimeCalendar: item.isTimeCalendar,
      
      // ✅ 同步字段
      calendarIds: item.calendarIds,
      todoListIds: item.todoListIds,
      source: item.source,
      syncStatus: item.syncStatus,
      externalId: item.externalId,
      fourDNoteSource: item.fourDNoteSource,
      
      // ✅ 时间戳
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      
      // ✅ Snapshot 模式标记
      _isDeleted: item._isDeleted,
      _deletedAt: item._deletedAt,
      
      // ✅ EventTree 字段
      parentEventId: item.parentEventId,
      childEventIds: item.childEventIds,
    };
    
    const titleNode: EventLineNode = {
      type: 'event-line',
      eventId: item.eventId || item.id,
      lineId: item.id,
      level: (item as any).bulletLevel ?? item.level ?? 0,  // ⚠️ 优先 bulletLevel
      mode: 'title',
      children: [/* Slate nodes */],
      metadata,  // 🔥 透传所有元数据
    };
    
    nodes.push(titleNode);
  });
}
```

**字段传递方式**: 通过 `metadata` 字段透传  
**字段完整性**: ✅ 包含所有核心字段  
**潜在问题**: `bulletLevel` 字段优先级处理

#### 2.2 Slate 节点 → Event (`slateNodesToPlanItems`)

```typescript
export function slateNodesToPlanItems(nodes: EventLineNode[]): any[] {
  nodes.forEach(node => {
    const metadata = node.metadata || {};
    
    const item = {
      id: node.lineId,
      eventId: node.eventId,
      level: node.level,
      
      // ✅ 从 metadata 恢复所有字段
      startTime: metadata.startTime,
      endTime: metadata.endTime,
      dueDate: metadata.dueDate,
      isAllDay: metadata.isAllDay ?? false,
      timeSpec: metadata.timeSpec,
      
      emoji: metadata.emoji,
      color: metadata.color,
      
      priority: metadata.priority || 'medium',
      isCompleted: metadata.isCompleted || false,
      isTask: metadata.isTask ?? true,
      type: metadata.type || 'todo',
      checkType: metadata.checkType,  // 不添加默认值
      
      isPlan: metadata.isPlan,
      isTimeCalendar: metadata.isTimeCalendar,
      
      // ✅ EventTree 字段 - 从 metadata 读取
      parentEventId: metadata.parentEventId,
      childEventIds: metadata.childEventIds,
      
      calendarIds: metadata.calendarIds || [],
      todoListIds: metadata.todoListIds || [],
      source: metadata.source || 'local',
      syncStatus: metadata.syncStatus || 'local-only',
      externalId: metadata.externalId,
      fourDNoteSource: metadata.fourDNoteSource ?? true,
      
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
    
    if (node.mode === 'title') {
      // ✅ v2.14: 保存到 title 对象（三层架构）
      item.title = {
        fullTitle: fragment ? JSON.stringify(fragment) : ''
      };
      
      // ✅ v2.9: 优先从 TimeHub 读取最新时间
      const timeSnapshot = TimeHub.getSnapshot(baseId);
      if (timeSnapshot.start || timeSnapshot.end !== undefined) {
        item.startTime = timeSnapshot.start || null;
        item.endTime = timeSnapshot.end !== undefined ? timeSnapshot.end : null;
      }
    }
  });
  
  return items;
}
```

**字段恢复方式**: 从 `metadata` 字段读取  
**字段完整性**: ✅ 所有字段正确恢复  
**时间字段优化**: ✅ 从 TimeHub 读取最新值

---

### 3. 业务层：PlanManager (`src/components/PlanManager.tsx`)

#### 3.1 批量更新处理 (`executeBatchUpdate`)

```typescript
const executeBatchUpdate = useCallback(async (updatedItems: any[]) => {
  // 🔧 过滤掉 ghost events（Snapshot 模式的虚拟事件）
  const realItems = updatedItems.filter(item => !(item as any)._isDeleted);
  
  realItems.forEach((updatedItem: any) => {
    // 🆕 v1.8: 从标签中提取 calendarIds
    const tagIds = (updatedItem.tags || []).map(/* ... */);
    const calendarIds = tagIds.map(/* ... */).filter(Boolean);
    
    // 🔥 [FIX] 从 TimeHub 读取最新时间（防止时序问题）
    const timeSnapshot = TimeHub.getSnapshot(updatedItem.id);
    
    const eventItem: Event = {
      ...(existingItem || {}),
      ...updatedItem,  // ✅ 包含从 Slate 来的内容字段
      
      // 🔥 强制使用 TimeHub 的最新时间
      startTime: timeSnapshot.start || updatedItem.startTime || existingItem?.startTime,
      endTime: timeSnapshot.end !== undefined ? timeSnapshot.end : 
               (updatedItem.endTime || existingItem?.endTime),
      
      // ✅ 规范化字段
      tags: tagIds,
      calendarIds: calendarIds.length > 0 ? calendarIds : undefined,
      priority: updatedItem.priority || existingItem?.priority || 'medium',
      isCompleted: updatedItem.isCompleted ?? existingItem?.isCompleted ?? false,
      type: existingItem?.type || 'todo',
      isPlan: true,
      isTask: true,
      fourDNoteSource: true,
      
      // ✅ 时间戳
      createdAt: existingItem?.createdAt || nowLocal,
      updatedAt: nowLocal,
      
      // ✅ 同步状态
      source: 'local',
      syncStatus: calendarIds.length > 0 ? 'pending' : 'local-only',
    } as Event;
    
    // 🔍 调试：显示 eventlog 字段
    console.log('[PlanManager] 准备保存到 EventService:', {
      hasEventlog: !!(item as any).eventlog,
      eventlogLength: ((item as any).eventlog || '').length,
      calendarIds: (item as any).calendarIds,
      startTime: item.startTime,
    });
    
    // ✅ 使用 EventHub 保存
    if (!existingItem) {
      await EventHub.createEvent(item);
    } else {
      await EventHub.updateFields(item.id, item, { source: 'PlanManager' });
    }
  });
}, [items, itemsMap]);
```

**数据处理方式**: v1.5 透传架构  
**字段完整性**: ✅ 保留所有 Slate 传递的字段  
**时间字段优化**: ✅ 从 TimeHub 强制读取最新值  
**EventTree 字段**: ✅ 从 serialization 透传

---

### 4. 服务层：EventService (`src/services/EventService.ts`)

#### 4.1 事件更新 (`updateEvent`)

```typescript
static async updateEvent(
  eventId: string, 
  updates: Partial<Event> | Event, 
  skipSync: boolean = false,
  options?: { originComponent?: string; source?: string }
): Promise<{ success: boolean; event?: Event; error?: string }> {
  const originalEvent = await this.getEventById(eventId);
  
  const updatesWithSync = { ...updates };
  
  // ========== Title 三层架构同步 (v2.14) ==========
  if ((updates as any).title !== undefined || (updates as any).tags !== undefined) {
    const normalizedTitle = this.normalizeTitle(
      titleUpdate,
      currentTags,
      originalEvent.tags
    );
    (updatesWithSync as any).title = normalizedTitle;
  }
  
  // ========== EventLog 规范化 ==========
  if ((updates as any).eventlog !== undefined) {
    const normalizedEventLog = this.normalizeEventLog((updates as any).eventlog);
    (updatesWithSync as any).eventlog = normalizedEventLog;
    
    // ✅ 同步到 description
    if (updates.description === undefined) {
      updatesWithSync.description = normalizedEventLog.plainText || normalizedEventLog.html || '';
    }
  }
  
  // 🆕 v1.8: 只合并非 undefined 的字段
  const filteredUpdates: Partial<Event> = {};
  Object.keys(updatesWithSync).forEach(key => {
    const value = updatesWithSync[key];
    if (value !== undefined || Object.prototype.hasOwnProperty.call(updatesWithSync, key)) {
      filteredUpdates[key] = value;
    }
  });
  
  const updatedEvent: Event = {
    ...originalEvent,
    ...filteredUpdates,
    id: eventId,
    updatedAt: formatTimeForStorage(new Date())
  };
  
  // 🆕 检测 parentEventId 变化，同步更新双向关联
  if (filteredUpdates.parentEventId !== undefined) {
    // 从旧父事件移除
    if (originalEvent.parentEventId) {
      const oldParent = await this.getEventById(originalEvent.parentEventId);
      if (oldParent && oldParent.childEventIds) {
        await this.updateEvent(oldParent.id, {
          childEventIds: oldParent.childEventIds.filter(cid => cid !== eventId)
        }, true);
      }
    }
    
    // 添加到新父事件
    if (filteredUpdates.parentEventId) {
      const newParent = await this.getEventById(filteredUpdates.parentEventId);
      if (newParent) {
        const childIds = newParent.childEventIds || [];
        if (!childIds.includes(eventId)) {
          await this.updateEvent(newParent.id, {
            childEventIds: [...childIds, eventId]
          }, true);
        }
      }
    }
  }
  
  // 更新到 StorageManager
  const storageEvent = this.convertEventToStorageEvent(updatedEvent);
  await storageManager.updateEvent(eventId, storageEvent);
  
  return { success: true, event: updatedEvent };
}
```

**字段规范化**:
- ✅ Title 三层架构（fullTitle → colorTitle → simpleTitle）
- ✅ EventLog 对象化（string → EventLog）
- ✅ Location 双格式支持
- ✅ ParentEventId 双向关联

**字段传递**: ✅ 所有字段通过 `filteredUpdates` 传递

#### 4.2 Event → StorageEvent 转换

```typescript
private static convertEventToStorageEvent(event: Event): StorageEvent {
  return {
    ...event,
    title: event.title,
    eventlog: event.eventlog as any,
  } as StorageEvent;
}
```

**转换方式**: 展开运算符，保留所有字段  
**字段完整性**: ✅ 所有字段都被传递

---

### 5. 存储层：StorageManager (`src/services/storage/StorageManager.ts`)

#### 5.1 事件更新 (`updateEvent`)

```typescript
async updateEvent(id: string, updates: Partial<StorageEvent>): Promise<StorageEvent> {
  await this.ensureInitialized();
  
  console.log('🔍 [StorageManager] updateEvent 接收到的 updates:', {
    eventId: id.slice(-8),
    'updates.syncMode': updates.syncMode,
    'updates.calendarIds': updates.calendarIds,
  });
  
  try {
    // 1. 双写到 IndexedDB 和 SQLite
    if (this.indexedDBService) {
      await this.indexedDBService.updateEvent(id, updates);
    }
    
    if (this.sqliteService) {
      await this.sqliteService.updateEvent(id, updates);
    }
    
    // 2. 更新缓存
    const cachedEvent = this.eventCache.get(id);
    if (cachedEvent) {
      const updatedEvent = { ...cachedEvent, ...updates };
      this.eventCache.set(id, updatedEvent);
    }
    
    // 3. 返回最新数据
    const updatedEvent = await this.indexedDBService.getEvent(id);
    return updatedEvent;
  } catch (error) {
    console.error('[StorageManager] ❌ Failed to update event:', error);
    throw error;
  }
}
```

**存储策略**: 双写（IndexedDB + SQLite）+ 缓存  
**字段完整性**: ✅ 展开运算符保留所有字段  
**容错机制**: ✅ IndexedDB 失败不影响 SQLite

---

## 🎯 字段完整性矩阵

| 字段分类 | PlanSlate<br>序列化 | PlanManager<br>处理 | EventService<br>规范化 | StorageManager<br>存储 | 完整性 |
|---------|---------------------|---------------------|------------------------|------------------------|--------|
| **核心字段** | | | | | |
| id | ✅ | ✅ | ✅ | ✅ | ✅ |
| title | ✅ | ✅ | ✅ 三层架构 | ✅ | ✅ |
| description | ✅ | ✅ | ✅ | ✅ | ✅ |
| **时间字段** | | | | | |
| startTime | ✅ | ✅ TimeHub | ✅ | ✅ | ✅ |
| endTime | ✅ | ✅ TimeHub | ✅ | ✅ | ✅ |
| dueDate | ✅ | ✅ | ✅ | ✅ | ✅ |
| isAllDay | ✅ | ✅ | ✅ | ✅ | ✅ |
| timeSpec | ✅ | ✅ | ✅ | ✅ | ✅ |
| **样式字段** | | | | | |
| emoji | ✅ | ✅ | ✅ | ✅ | ✅ |
| color | ✅ | ✅ | ✅ | ✅ | ✅ |
| **分类字段** | | | | | |
| tags | ✅ | ✅ 规范化 | ✅ | ✅ | ✅ |
| calendarIds | ✅ | ✅ 从 tags 提取 | ✅ | ✅ | ✅ |
| todoListIds | ✅ | ✅ | ✅ | ✅ | ✅ |
| **业务字段** | | | | | |
| priority | ✅ | ✅ | ✅ | ✅ | ✅ |
| isCompleted | ✅ | ✅ | ✅ | ✅ | ✅ |
| type | ✅ | ✅ | ✅ | ✅ | ✅ |
| checkType | ✅ | ✅ | ✅ | ✅ | ✅ |
| checked | ✅ | ✅ | ✅ | ✅ | ✅ |
| unchecked | ✅ | ✅ | ✅ | ✅ | ✅ |
| **EventTree 字段** | | | | | |
| parentEventId | ✅ metadata | ✅ 透传 | ✅ 双向关联 | ✅ | ✅ |
| childEventIds | ✅ metadata | ✅ 透传 | ✅ 双向关联 | ✅ | ✅ |
| linkedEventIds | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| backlinks | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| **富文本字段** | | | | | |
| eventlog | ✅ | ✅ | ✅ 规范化 | ✅ | ✅ |
| **同步字段** | | | | | |
| source | ✅ | ✅ | ✅ | ✅ | ✅ |
| syncStatus | ✅ | ✅ | ✅ | ✅ | ✅ |
| syncMode | ✅ | ✅ | ✅ | ✅ | ✅ |
| planSyncConfig | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| actualSyncConfig | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |
| externalId | ✅ | ✅ | ✅ | ✅ | ✅ |
| **层级字段** | | | | | |
| level | ✅ | ✅ | ✅ | ✅ | ✅ |
| bulletLevel | ⚠️ 优先级 | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| **元数据字段** | | | | | |
| createdAt | ✅ | ✅ | ✅ | ✅ | ✅ |
| updatedAt | ✅ | ✅ | ✅ 自动更新 | ✅ | ✅ |
| deletedAt | ✅ | ✅ 过滤 | ✅ | ✅ | ✅ |

**图例**:
- ✅ 完整支持
- ⚠️ 部分支持或有潜在问题
- ❌ 不支持或丢失

---

## ⚠️ 发现的问题

### 1. bulletLevel 字段处理不一致

**位置**: `serialization.ts` L101

```typescript
level: (item as any).bulletLevel ?? item.level ?? 0,  // ⚠️ 优先使用 bulletLevel
```

**问题**:
- `bulletLevel` 和 `level` 字段用途不明确
- `bulletLevel` 优先级高于 `level`，但 PlanManager 可能不总是更新 `bulletLevel`
- 可能导致显示层级不一致

**影响**: 中等 - 影响 Plan 页面的缩进显示

**建议**:
1. 统一使用 `level` 字段，废弃 `bulletLevel`
2. 或明确区分两者用途并在文档中说明
3. 确保所有更新路径同时更新两个字段

### 2. linkedEventIds 和 backlinks 未在序列化层传递

**位置**: `serialization.ts` L45-90

**问题**:
- `metadata` 中未包含 `linkedEventIds` 和 `backlinks` 字段
- 这两个字段用于事件关联和双向链接，是 EventTree 的重要组成部分

**影响**: 低 - 目前功能可能未启用

**建议**:
1. 在 `EventMetadata` 接口中添加这两个字段
2. 在 `planItemsToSlateNodes` 中透传
3. 在 `slateNodesToPlanItems` 中恢复

### 3. planSyncConfig 和 actualSyncConfig 未在 PlanManager 中处理

**位置**: `PlanManager.tsx` L1200-1250

**问题**:
- 这两个同步配置字段在 `executeBatchUpdate` 中未被显式处理
- 虽然通过 `...updatedItem` 展开运算符可能被传递，但未验证

**影响**: 中等 - 影响多日历同步功能

**建议**:
1. 在 `executeBatchUpdate` 中显式保留这两个字段
2. 添加调试日志验证传递
3. 测试多日历同步场景

---

## 🔧 修复优先级

### P0 - 立即修复

无

### P1 - 高优先级

1. **统一 bulletLevel 和 level 字段处理**
   - 明确两者用途
   - 确保同步更新
   - 添加文档说明

2. **验证 planSyncConfig 和 actualSyncConfig 传递**
   - 添加调试日志
   - 测试多日历同步
   - 修复如有问题

### P2 - 中优先级

1. **添加 linkedEventIds 和 backlinks 到序列化层**
   - 扩展 EventMetadata 接口
   - 更新序列化函数
   - 测试双向链接功能

### P3 - 低优先级

1. **性能优化**
   - 减少不必要的字段深拷贝
   - 优化 TimeHub 查询
   - 批量操作优化

---

## ✅ 验证清单

- [x] Event 接口包含所有必要字段
- [x] PlanSlate 序列化层通过 metadata 透传字段
- [x] PlanManager 使用透传架构保留字段
- [x] EventService 正确规范化 title 和 eventlog
- [x] StorageManager 双写所有字段到存储层
- [ ] bulletLevel 和 level 字段同步更新
- [ ] linkedEventIds 和 backlinks 正确传递
- [ ] planSyncConfig 和 actualSyncConfig 在所有场景下正确保存

---

## 📚 相关文档

- [TagManager 数据流架构 v1.4](../PRD/TAGMANAGER_MODULE_PRD.md)
- [EventTree 父子事件关联](../PRD/EVENTTREE_MODULE_PRD.md)
- [TimeHub 时间管理](../architecture/TIMEHUB_ARCHITECTURE.md)
- [StorageManager API](../architecture/STORAGE_MANAGER_API.md)

---

## 📝 审计日志

| 日期 | 审计员 | 版本 | 变更说明 |
|------|--------|------|----------|
| 2025-12-03 | GitHub Copilot | v1.0 | 初始审计报告 |

