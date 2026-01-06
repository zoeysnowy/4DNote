# 统计功能性能优化方案

## 问题分析

**当前问题**：
- StatsPanel 每次加载需要查询完整的 Event 对象（50+ 字段）
- 统计功能只需要5个字段：`id`, `tags`, `calendarIds`, `startTime`, `endTime`
- 查询1000个事件，传输数据量 > 500KB
- 实际需要的数据量 < 50KB（节省90%+）

**性能对比**：
```
当前方案：
查询 1000 个完整 Event 对象 → 1082ms (实测)
数据量：~500KB

优化方案：
查询 1000 个 EventTreeIndex 对象 → 预计 < 200ms
数据量：~50KB
性能提升：5倍+ 🚀
```

---

## 方案设计

### 1. 新增 `event_tree` ObjectStore

**Schema 定义**：
```typescript
interface EventTreeIndex {
  id: string;                    // 事件ID
  tags: string[];                // 标签ID列表
  calendarIds: string[];         // 日历ID列表
  startTime: string;             // 开始时间（YYYY-MM-DD HH:mm:ss）
  endTime: string;               // 结束时间
  source?: string;               // 来源（outlook/google/local）
  
  // 元数据
  updatedAt: string;             // 最后更新时间
}
```

**索引设计**：
```typescript
// 主键
keyPath: 'id'

// 索引
- 'startTime': 用于时间范围查询
- 'endTime': 用于时间范围查询
- 'tags': multiEntry: true, 用于标签过滤
- 'calendarIds': multiEntry: true, 用于日历过滤
```

---

### 2. 数据同步策略

**双写机制**（在 EventService CRUD 时自动维护）：

```typescript
// EventService.createEvent()
async createEvent(event: Event): Promise<Event> {
  // 1. 写入完整 Event
  const result = await storageManager.createEvent(event);
  
  // 2. 同步写入 EventTreeIndex（轻量级）
  await storageManager.createEventTreeIndex({
    id: result.id,
    tags: result.tags || [],
    calendarIds: result.calendarIds || [],
    startTime: result.startTime || '',
    endTime: result.endTime || '',
    source: result.source,
    updatedAt: new Date().toISOString()
  });
  
  return result;
}

// EventService.updateEvent()
async updateEvent(id: string, updates: Partial<Event>): Promise<Event> {
  // 1. 更新完整 Event
  const result = await storageManager.updateEvent(id, updates);
  
  // 2. 同步更新 EventTreeIndex（只更新变化的字段）
  const statsUpdates: Partial<EventTreeIndex> = {};
  if (updates.tags !== undefined) statsUpdates.tags = updates.tags;
  if (updates.calendarIds !== undefined) statsUpdates.calendarIds = updates.calendarIds;
  if (updates.startTime !== undefined) statsUpdates.startTime = updates.startTime;
  if (updates.endTime !== undefined) statsUpdates.endTime = updates.endTime;
  
  if (Object.keys(statsUpdates).length > 0) {
    statsUpdates.updatedAt = new Date().toISOString();
    await storageManager.updateEventTreeIndex(id, statsUpdates);
  }
  
  return result;
}

// EventService.deleteEvent()
async deleteEvent(id: string): Promise<void> {
  await storageManager.deleteEvent(id);
  await storageManager.deleteEventTreeIndex(id); // 同步删除
}
```

---

### 3. StatsPanel 优化

**修改前（查询完整 Event）**：
```typescript
const eventsData = await EventService.getEventsByDateRange(
  formatDate(startDate),
  formatDate(endDate)
);
// 返回 1000 个完整 Event 对象（500KB+）
```

**修改后（查询 EventTreeIndex）**：
```typescript
const statsData = await EventService.getEventTreeIndexByDateRange(
  formatDate(startDate),
  formatDate(endDate)
);
// 返回 1000 个 EventTreeIndex 对象（50KB）
// 性能提升 5 倍+ 🚀
```

---

### 4. 数据迁移

**一次性迁移**（应用启动时）：
```typescript
// src/services/storage/StorageManager.ts
async migrateToEventTreeIndex(): Promise<void> {
  const migrated = localStorage.getItem('4dnote-stats-migrated');
  if (migrated === 'true') return;
  
  console.log('[StorageManager] 🔄 开始迁移 event_tree...');
  
  // 查询所有事件（一次性）
  const allEvents = await this.queryEvents({ limit: 100000 });
  
  // 批量写入 EventTreeIndex
  const statsRecords = allEvents.items.map(event => ({
    id: event.id,
    tags: event.tags || [],
    calendarIds: event.calendarIds || [],
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    source: event.source,
    updatedAt: event.updatedAt || new Date().toISOString()
  }));
  
  await this.indexedDBService.bulkCreate('event_tree', statsRecords);
  
  localStorage.setItem('4dnote-stats-migrated', 'true');
  console.log(`[StorageManager] ✅ 迁移完成: ${statsRecords.length} 条记录`);
}
```

---

### 5. 实现步骤

**Phase 1: Schema 更新**（30分钟）
1. ✅ 修改 `IndexedDBService.ts` - 添加 `event_tree` objectStore
2. ✅ 更新 DB_VERSION（触发 onupgradeneeded）
3. ✅ 定义 `EventTreeIndex` interface

**Phase 2: CRUD 同步**（1小时）
1. ✅ StorageManager 新增 `createEventTreeIndex()`, `updateEventTreeIndex()`, `deleteEventTreeIndex()`
2. ✅ EventService 修改 CRUD 方法，双写 Event + EventTreeIndex
3. ✅ 添加 `getEventTreeIndexByDateRange()` 查询方法

**Phase 3: StatsPanel 优化**（30分钟）
1. ✅ 修改 `StatsPanel.tsx` - 使用 `getEventTreeIndexByDateRange()`
2. ✅ 移除不必要的字段访问
3. ✅ 性能测试验证

**Phase 4: 数据迁移**（15分钟）
1. ✅ 实现一次性迁移逻辑
2. ✅ 应用启动时自动执行
3. ✅ 测试验证完整性

**预计总时长**: 2.5 小时

---

## 性能收益

**查询性能**：
```
当前: 1082ms (1000 个完整 Event)
优化后: < 200ms (1000 个 EventTreeIndex)
提升: 5 倍+ 🚀
```

**网络传输**：
```
当前: ~500KB
优化后: ~50KB
节省: 90%
```

**内存占用**：
```
当前: ~2MB (React state)
优化后: ~200KB
节省: 90%
```

---

## 兼容性说明

1. **向后兼容**：旧版本数据通过一次性迁移自动转换
2. **渐进式升级**：`event_tree` 不存在时降级到查询完整 Event
3. **数据一致性**：CRUD 双写保证 Event ↔ EventTreeIndex 同步

---

## 未来扩展

### 可选优化（低优先级）

1. **增量同步**：
   - EventTreeIndex 添加 `syncStatus` 字段
   - 只同步变化的记录

2. **预聚合统计**：
   - 新增 `daily_stats` 表：每日预计算统计
   - 按天/周/月预聚合，查询时直接读取

3. **虚拟化渲染**：
   - 超过1000条记录时使用虚拟滚动
   - 减少 DOM 节点数量

---

## 总结

通过引入轻量级的 `event_tree` 表：
- ✅ 查询性能提升 5 倍+
- ✅ 数据传输减少 90%
- ✅ 内存占用减少 90%
- ✅ 实现简单，风险低
- ✅ 向后兼容，无需重构

**推荐立即实施！** 🚀
