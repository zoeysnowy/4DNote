# EventHub & TimeHub 架构文档

**版本**: v2.18.8  
**创建日期**: 2025-12-17  
**维护者**: GitHub Copilot  
**状态**: ✅ 已实现  
**配套文档**: [EventService Architecture](./EVENTSERVICE_ARCHITECTURE.md)

---

## 📋 目录

1. [架构概述](#架构概述)
2. [EventHub 架构](#eventhub-架构)
3. [TimeHub 架构](#timehub-架构)
4. [双 Hub 协作模式](#双-hub-协作模式)
5. [数据流](#数据流)
6. [订阅机制](#订阅机制)
7. [性能优化](#性能优化)

---

## 架构概述

### 定位

EventHub 和 TimeHub 是 4DNote 的**内存缓存层**，负责事件数据的快速访问和增量更新。它们位于 EventService（持久化层）和 UI 组件之间。

### 核心职责

**EventHub**:
- 📦 **内存快照管理**: 维护所有事件的内存副本
- 🔄 **增量更新**: 监听 EventService 事件，增量更新缓存
- 🔔 **订阅-发布**: 通知 UI 组件数据变化
- ⏱️ **时间字段代理**: 将时间操作代理给 TimeHub

**TimeHub**:
- 📅 **时间视图管理**: 维护日期范围内的事件缓存
- 🕒 **时间数据规范化**: 统一处理 fuzzy time、timer window
- 🔔 **订阅-通知**: 通知 UI 组件时间数据变化
- 🔗 **EventService 集成**: 监听 `eventsUpdated` 事件自动更新缓存

### 架构原则

**双缓存架构**:
```
EventService (持久化层)
  ↓
  ├─ EventHub (全量内存快照)
  │   └─ 订阅: event-created, event-updated, event-deleted
  │
  └─ TimeHub (时间范围缓存)
      └─ 订阅: eventsUpdated (全局事件)
  ↓
UI 组件 (订阅 Hub 更新)
```

**分工原则**:
- EventService: 数据规范化 + 持久化（唯一真相源）
- EventHub: 全量缓存 + 快速查询
- TimeHub: 时间视图 + 时间规范化

---

## EventHub 架构

### 1. 核心数据结构

```typescript
class EventHub {
  // 内存快照（核心）
  private static snapshot: Event[] | null = null;
  
  // 快照订阅者
  private static snapshotSubscribers = new Set<(events: Event[]) => void>();
  
  // 字段订阅者（细粒度更新）
  private static fieldSubscribers = new Map<string, Set<(event: Event) => void>>();
  
  // 初始化状态
  private static initialized = false;
}
```

### 2. 初始化流程

```typescript
static async initialize(): Promise<void> {
  if (this.initialized) return;
  
  // 1. 订阅 EventService 事件
  this.setupEventListeners();
  
  // 2. 加载初始快照（冷加载）
  await this.refreshSnapshot();
  
  this.initialized = true;
}

private static setupEventListeners(): void {
  // 监听 EventService 的增量更新
  window.addEventListener('event-created', (e: CustomEvent) => {
    this.handleEventCreated(e.detail.event);
  });
  
  window.addEventListener('event-updated', (e: CustomEvent) => {
    this.handleEventUpdated(e.detail.event);
  });
  
  window.addEventListener('event-deleted', (e: CustomEvent) => {
    this.handleEventDeleted(e.detail.eventId);
  });
}
```

### 3. 快照管理

#### 3.1 获取快照

```typescript
static async getSnapshot(): Promise<Event[]> {
  if (!this.snapshot) {
    // 冷加载：首次访问时从 EventService 加载
    await this.refreshSnapshot();
  }
  
  return this.snapshot || [];
}

private static async refreshSnapshot(): Promise<void> {
  const events = await EventService.getAllEvents();
  this.snapshot = events;
  
  // 通知所有订阅者
  this.notifySnapshotSubscribers();
}
```

#### 3.2 增量更新

```typescript
private static handleEventCreated(event: Event): void {
  if (!this.snapshot) return;
  
  // 增量添加
  this.snapshot.push(event);
  
  // 通知订阅者
  this.notifySnapshotSubscribers();
}

private static handleEventUpdated(event: Event): void {
  if (!this.snapshot) return;
  
  // 增量更新（替换）
  const index = this.snapshot.findIndex(e => e.id === event.id);
  if (index !== -1) {
    this.snapshot[index] = event;
  } else {
    // 如果不存在，添加（兜底）
    this.snapshot.push(event);
  }
  
  // 通知订阅者
  this.notifySnapshotSubscribers();
  this.notifyFieldSubscribers(event.id, event);
}

private static handleEventDeleted(eventId: string): void {
  if (!this.snapshot) return;
  
  // 增量删除（软删除标记）
  const index = this.snapshot.findIndex(e => e.id === eventId);
  if (index !== -1) {
    const deletedEvent = { ...this.snapshot[index], isDeleted: true };
    this.snapshot[index] = deletedEvent;
  }
  
  // 通知订阅者
  this.notifySnapshotSubscribers();
}
```

### 4. 字段更新（细粒度）

```typescript
static async updateFields(
  eventId: string, 
  updates: Partial<Event>
): Promise<void> {
  // 1. 更新持久化层
  await EventService.updateEvent(eventId, updates);
  
  // 2. 更新本地缓存
  if (this.snapshot) {
    const index = this.snapshot.findIndex(e => e.id === eventId);
    if (index !== -1) {
      this.snapshot[index] = {
        ...this.snapshot[index],
        ...updates
      };
      
      // 通知细粒度订阅者
      this.notifyFieldSubscribers(eventId, this.snapshot[index]);
    }
  }
}
```

### 5. 时间字段代理

```typescript
static async setEventTime(
  eventId: string,
  timeType: 'start' | 'end',
  time: string | null
): Promise<void> {
  // 🔗 代理给 TimeHub（时间专属处理）
  await TimeHub.setEventTime(eventId, timeType, time);
  
  // ⚠️ 不直接更新 EventHub 缓存，等待 TimeHub 回调
}

static async setFuzzyTime(
  eventId: string,
  fuzzyTime: string
): Promise<void> {
  // 🔗 代理给 TimeHub
  await TimeHub.setFuzzy(eventId, fuzzyTime);
}

static async setTimerWindow(
  eventId: string,
  timerWindow: string
): Promise<void> {
  // 🔗 代理给 TimeHub
  await TimeHub.setTimerWindow(eventId, timerWindow);
}
```

### 6. 缓存失效

```typescript
static invalidate(): void {
  // 清空快照，下次访问时重新加载
  this.snapshot = null;
  
  // 通知订阅者
  this.notifySnapshotSubscribers();
}

static invalidateEvent(eventId: string): void {
  // 失效单个事件（从持久化层重新加载）
  EventService.getEventById(eventId).then(event => {
    if (event && this.snapshot) {
      const index = this.snapshot.findIndex(e => e.id === eventId);
      if (index !== -1) {
        this.snapshot[index] = event;
        this.notifySnapshotSubscribers();
        this.notifyFieldSubscribers(eventId, event);
      }
    }
  });
}
```

---

## TimeHub 架构

### 1. 核心数据结构

```typescript
class TimeHub {
  // 时间视图缓存（按日期范围）
  private static cache = new Map<string, {
    events: Event[];
    timestamp: number;
  }>();
  
  // 缓存订阅者
  private static subscribers = new Set<() => void>();
  
  // 初始化状态
  private static initialized = false;
}
```

### 2. 初始化流程

```typescript
static initialize(): void {
  if (this.initialized) return;
  
  // 监听 EventService 的全局事件
  window.addEventListener('eventsUpdated', () => {
    this.clearCache();
    this.notifySubscribers();
  });
  
  this.initialized = true;
}
```

### 3. 时间视图查询

```typescript
static async getSnapshot(
  startDate: string,
  endDate: string
): Promise<Event[]> {
  const cacheKey = `${startDate}_${endDate}`;
  const cached = this.cache.get(cacheKey);
  
  // 缓存命中（5 秒 TTL）
  if (cached && Date.now() - cached.timestamp < 5000) {
    return cached.events;
  }
  
  // 缓存未命中，从 EventService 查询
  const events = await EventService.getEventsByDateRange(startDate, endDate);
  
  // 更新缓存
  this.cache.set(cacheKey, {
    events,
    timestamp: Date.now()
  });
  
  return events;
}
```

### 4. 时间字段更新

```typescript
static async setEventTime(
  eventId: string,
  timeType: 'start' | 'end',
  time: string | null
): Promise<void> {
  const event = await EventService.getEventById(eventId);
  if (!event) return;
  
  // 1. 更新持久化层
  await EventService.updateEvent(eventId, {
    startTime: timeType === 'start' ? time : event.startTime,
    endTime: timeType === 'end' ? time : event.endTime
  });
  
  // 2. 清空缓存（触发重新查询）
  this.clearCache();
  
  // 3. 通知 EventHub 失效
  EventHub.invalidateEvent(eventId);
  
  // 4. 通知订阅者
  this.notifySubscribers();
}
```

### 5. Fuzzy Time 管理

```typescript
static async setFuzzy(
  eventId: string,
  fuzzyTime: string
): Promise<void> {
  // 1. 解析 fuzzy time
  const parsedTime = this.parseFuzzyTime(fuzzyTime);
  
  // 2. 更新持久化层
  await EventService.updateEvent(eventId, {
    fuzzyTime,
    startTime: parsedTime.startTime,
    endTime: parsedTime.endTime,
    isAllDay: parsedTime.isAllDay
  });
  
  // 3. 清空缓存
  this.clearCache();
  
  // 4. 通知订阅者
  this.notifySubscribers();
}

private static parseFuzzyTime(fuzzyTime: string): {
  startTime: string;
  endTime: string;
  isAllDay: boolean;
} {
  // 解析逻辑（依赖 TimeParsingService）
  // 示例：
  // "明天下午3点" → { startTime: "2025-12-18 15:00:00", endTime: null, isAllDay: false }
  // "这周五" → { startTime: "2025-12-20 00:00:00", endTime: "2025-12-20 23:59:59", isAllDay: true }
  
  return TimeParsingService.parse(fuzzyTime);
}
```

### 6. Timer Window 管理

```typescript
static async setTimerWindow(
  eventId: string,
  timerWindow: string
): Promise<void> {
  // 1. 解析 timer window
  const parsed = this.parseTimerWindow(timerWindow);
  
  // 2. 更新持久化层
  await EventService.updateEvent(eventId, {
    timerWindow,
    startTime: parsed.startTime,
    endTime: parsed.endTime
  });
  
  // 3. 清空缓存
  this.clearCache();
  
  // 4. 通知订阅者
  this.notifySubscribers();
}

private static parseTimerWindow(timerWindow: string): {
  startTime: string;
  endTime: string;
} {
  // 示例：
  // "2h30m" → { startTime: now, endTime: now + 2h30m }
  // "90分钟" → { startTime: now, endTime: now + 90min }
  
  const duration = this.parseDuration(timerWindow);
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + duration);
  
  return {
    startTime: formatTimeForStorage(startTime),
    endTime: formatTimeForStorage(endTime)
  };
}
```

### 7. 缓存管理

```typescript
static clearCache(): void {
  // 清空所有缓存
  this.cache.clear();
}

static clearCacheForEvent(eventId: string): void {
  // 清空与该事件相关的缓存（粗粒度，直接清空所有）
  this.clearCache();
}
```

---

## 双 Hub 协作模式

### 1. 代理模式（EventHub → TimeHub）

```
UI 组件调用 EventHub.setEventTime()
  ↓
EventHub 代理给 TimeHub.setEventTime()
  ↓
TimeHub 更新 EventService（持久化层）
  ↓
TimeHub 清空缓存
  ↓
TimeHub 通知 EventHub.invalidateEvent()
  ↓
EventHub 重新加载单个事件
  ↓
EventHub 通知 UI 组件更新
```

### 2. 缓存同步（TimeHub → EventHub）

```
EventService.updateEvent() 完成
  ↓
dispatchEvent('eventsUpdated')
  ↓
  ├─ TimeHub 监听 → 清空缓存
  └─ EventHub 监听 → 增量更新快照
  ↓
  ├─ TimeHub.notifySubscribers()
  └─ EventHub.notifySnapshotSubscribers()
  ↓
UI 组件收到通知，重新渲染
```

### 3. 避免循环依赖

```typescript
// ❌ 错误：循环依赖
EventHub.setEventTime() 
  → TimeHub.setEventTime() 
  → EventHub.invalidate() 
  → EventHub.refreshSnapshot() 
  → TimeHub.clearCache() 
  → 循环！

// ✅ 正确：单向依赖
EventHub.setEventTime() 
  → TimeHub.setEventTime() 
  → EventService.updateEvent() 
  → dispatchEvent('eventsUpdated')
  ↓
  ├─ EventHub 监听 → 增量更新
  └─ TimeHub 监听 → 清空缓存
```

**关键约定**:
- EventHub 可以调用 TimeHub（代理）
- TimeHub 不直接调用 EventHub（通过事件通知）
- EventService 是唯一真相源（通过全局事件同步）

---

## 数据流

### 1. 读取流（冷加载）

```
UI 组件: EventHub.getSnapshot()
  ↓
EventHub: 检查快照是否存在
  ↓
  ├─ 命中 → 直接返回快照
  └─ 未命中 → EventService.getAllEvents()
      ↓
      EventService: 查询 IndexedDB/SQLite
      ↓
      EventHub: 更新快照
      ↓
      返回快照
```

### 2. 写入流（增量更新）

```
UI 组件: EventHub.updateFields(eventId, updates)
  ↓
EventHub: 调用 EventService.updateEvent()
  ↓
EventService: normalizeEvent() + 持久化
  ↓
EventService: dispatchEvent('event-updated', { event })
  ↓
EventHub: 监听事件 → 增量更新快照
  ↓
EventHub: notifySnapshotSubscribers()
  ↓
UI 组件: 收到通知 → 重新渲染
```

### 3. 时间更新流（代理模式）

```
UI 组件: EventHub.setEventTime(eventId, 'start', time)
  ↓
EventHub: 代理给 TimeHub.setEventTime()
  ↓
TimeHub: EventService.updateEvent()
  ↓
EventService: normalizeEvent() + 持久化
  ↓
EventService: dispatchEvent('eventsUpdated')
  ↓
  ├─ TimeHub: 监听 → clearCache()
  └─ EventHub: 监听 → invalidateEvent(eventId)
  ↓
  ├─ TimeHub: notifySubscribers()
  └─ EventHub: notifySnapshotSubscribers()
  ↓
UI 组件: 收到通知 → 重新渲染
```

### 4. TimeHub 缓存管理流

```
UI 组件: TimeHub.getSnapshot(startDate, endDate)
  ↓
TimeHub: 检查缓存（cacheKey = startDate_endDate）
  ↓
  ├─ 命中（5 秒内）→ 直接返回缓存
  └─ 未命中 → EventService.getEventsByDateRange()
      ↓
      EventService: 查询日期范围内的事件
      ↓
      TimeHub: 更新缓存（TTL = 5s）
      ↓
      返回事件列表
```

---

## 订阅机制

### 1. EventHub 订阅

#### 1.1 快照订阅（全量更新）

```typescript
static subscribe(callback: (events: Event[]) => void): () => void {
  this.snapshotSubscribers.add(callback);
  
  // 返回取消订阅函数
  return () => {
    this.snapshotSubscribers.delete(callback);
  };
}

// 使用示例
useEffect(() => {
  const unsubscribe = EventHub.subscribe((events) => {
    setEvents(events);
  });
  
  return unsubscribe;
}, []);
```

#### 1.2 字段订阅（细粒度更新）

```typescript
static subscribeToField(
  eventId: string, 
  callback: (event: Event) => void
): () => void {
  if (!this.fieldSubscribers.has(eventId)) {
    this.fieldSubscribers.set(eventId, new Set());
  }
  
  this.fieldSubscribers.get(eventId)!.add(callback);
  
  return () => {
    this.fieldSubscribers.get(eventId)?.delete(callback);
  };
}

// 使用示例
useEffect(() => {
  const unsubscribe = EventHub.subscribeToField(eventId, (event) => {
    setEvent(event);
  });
  
  return unsubscribe;
}, [eventId]);
```

### 2. TimeHub 订阅

```typescript
static subscribe(callback: () => void): () => void {
  this.subscribers.add(callback);
  
  return () => {
    this.subscribers.delete(callback);
  };
}

// 使用示例
useEffect(() => {
  const unsubscribe = TimeHub.subscribe(() => {
    // 缓存失效，重新查询
    loadEvents();
  });
  
  return unsubscribe;
}, []);
```

### 3. 订阅机制差异

| 特性 | EventHub | TimeHub |
|------|----------|---------|
| 订阅内容 | 完整事件快照 | 缓存失效通知 |
| 粒度 | 全量 + 单事件 | 全局 |
| 数据传递 | 传递最新数据 | 不传递数据（只通知） |
| 使用场景 | 实时数据绑定 | 缓存失效重新查询 |

---

## 性能优化

### 1. 冷加载策略

```typescript
// EventHub: 按需加载快照
static async getSnapshot(): Promise<Event[]> {
  if (!this.snapshot) {
    // 首次访问时加载
    await this.refreshSnapshot();
  }
  return this.snapshot || [];
}
```

**优势**:
- 启动时不加载全量数据
- 减少初始化时间
- 只在需要时加载

### 2. 增量更新

```typescript
// EventHub: 增量更新快照（不重新加载全量）
private static handleEventUpdated(event: Event): void {
  if (!this.snapshot) return;
  
  const index = this.snapshot.findIndex(e => e.id === event.id);
  if (index !== -1) {
    this.snapshot[index] = event; // 只更新一条
  }
}
```

**优势**:
- 避免全量查询
- 减少 IndexedDB 访问
- 提升响应速度

### 3. 缓存 TTL

```typescript
// TimeHub: 5 秒 TTL 缓存
const cached = this.cache.get(cacheKey);
if (cached && Date.now() - cached.timestamp < 5000) {
  return cached.events; // 命中缓存
}
```

**优势**:
- 减少重复查询
- 平衡数据新鲜度和性能
- 适合时间视图频繁切换场景

### 4. 细粒度订阅

```typescript
// EventHub: 单事件订阅（避免全量重渲染）
static subscribeToField(eventId: string, callback: (event: Event) => void)
```

**优势**:
- 只更新关心的事件
- 减少 React 重渲染
- 适合单事件详情页

### 5. Timer 特殊处理

```typescript
// TimeHub: Timer 事件实时更新（跳过缓存）
static async getTimerEvents(): Promise<Event[]> {
  const events = await EventService.getAllEvents();
  return events.filter(e => e.isTimer && !e.isCompleted);
}
```

**特殊约定**:
- Timer 不使用缓存（需要实时倒计时）
- 每秒查询一次（性能可控，因为 Timer 数量少）

---

## 架构特点总结

### 1. 双缓存架构

```
EventHub: 全量快照（所有事件）
TimeHub: 时间视图（日期范围）
```

**优势**:
- EventHub 适合全局查询、标签过滤
- TimeHub 适合日历视图、时间线视图
- 分工明确，互不干扰

### 2. 最终一致性

```
EventService（真相源）
  ↓ 事件通知
  ├─ EventHub（增量更新快照）
  └─ TimeHub（清空缓存）
```

**特点**:
- EventService 是唯一真相源
- Hub 是缓存层（可能短暂不一致）
- 通过事件机制保证最终一致性

### 3. 避免循环依赖

```
EventHub ─代理→ TimeHub
  ↑              ↓
  └──事件通知──── EventService
```

**约定**:
- EventHub 可以调用 TimeHub（代理时间操作）
- TimeHub 不直接调用 EventHub（通过事件通知）
- 所有持久化通过 EventService

### 4. 时间标准化

```
TimeHub 负责所有时间相关处理：
- fuzzyTime 解析
- timerWindow 计算
- startTime/endTime 规范化
```

**优势**:
- 统一时间处理逻辑
- 避免 EventHub 污染
- 便于时间功能扩展

### 5. 订阅机制差异

```
EventHub: 传递数据（实时绑定）
TimeHub: 只通知（重新查询）
```

**设计原因**:
- EventHub 缓存稳定（全量快照）
- TimeHub 缓存易失效（时间范围变化）
- TimeHub 通知后重新查询更可靠

---

## 与 EventService 的边界

### EventService 职责（数据规范化层）

- ✅ 数据规范化（normalize*）
- ✅ 持久化管理（IndexedDB + SQLite）
- ✅ EventTree 管理（父子关系）
- ✅ 双向链接维护
- ✅ 历史记录集成
- ✅ 同步队列管理

### EventHub/TimeHub 职责（缓存层）

- ✅ 内存快照管理
- ✅ 增量更新
- ✅ 订阅-发布
- ✅ 时间视图缓存
- ❌ **不负责**数据规范化（由 EventService 统一处理）
- ❌ **不负责**持久化（只更新缓存）

### 数据流边界

```
UI 组件
  ↓ 写入
EventHub/TimeHub（缓存层）
  ↓ 代理
EventService（规范化 + 持久化）
  ↓ 事件通知
EventHub/TimeHub（增量更新缓存）
  ↓ 订阅通知
UI 组件（重新渲染）
```

**关键约定**:
1. 所有写入必须通过 EventService（唯一真相源）
2. Hub 只负责缓存和通知（不做业务逻辑）
3. 数据规范化统一在 EventService（normalize*）

---

## 文档维护指南

### 何时更新此文档？

**需要更新**:
- ✅ 修改 EventHub/TimeHub 缓存逻辑
- ✅ 修改订阅机制
- ✅ 修改双 Hub 协作模式
- ✅ 修改时间视图查询逻辑
- ✅ 添加新的 Hub 方法

**不需要更新**（更新 EventService 文档）:
- ❌ 修改数据规范化逻辑（normalize*）
- ❌ 修改 EventTree 管理
- ❌ 修改持久化逻辑
- ❌ 修改同步队列

### 配套文档

- **EventService Architecture**: [EVENTSERVICE_ARCHITECTURE.md](./EVENTSERVICE_ARCHITECTURE.md)
- **EventHistory Module PRD**: [EVENTHISTORY_MODULE_PRD.md](../PRD/EVENTHISTORY_MODULE_PRD.md)

---

## 总结

EventHub 和 TimeHub 构成 4DNote 的**双缓存架构**，通过**增量更新**和**订阅-发布**机制实现高性能的事件数据访问。

**核心优势**:
- ✅ 冷加载策略（按需加载）
- ✅ 增量更新（避免全量查询）
- ✅ 双缓存架构（全量 + 时间视图）
- ✅ 最终一致性（事件驱动同步）
- ✅ 时间标准化（TimeHub 统一处理）
- ✅ 细粒度订阅（减少重渲染）

**架构约定**:
1. EventService 是唯一真相源（持久化层）
2. Hub 是缓存层（不做业务逻辑）
3. EventHub 代理时间操作给 TimeHub（单向依赖）
4. 所有同步通过事件机制（避免循环依赖）
5. 缓存 TTL = 5 秒（平衡性能和新鲜度）
