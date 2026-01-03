# EventHub & TimeHub 架构文档

**版本**: v2.18.8  
**创建日期**: 2025-12-17  
**维护者**: GitHub Copilot  
**状态**: ✅ 已实现  
**配套文档**: [EventService Architecture](./EVENTSERVICE_ARCHITECTURE.md)

---

## 维护更新（2026-01-01：设计与实践对齐当前代码）

本仓库在持续演进中，EventHub/TimeHub 的“现实实现”已从早期的“全量数组快照 + 时间范围缓存”收敛为：

- **EventHub（当前实现）**：以 `eventId → Event` 的**单事件缓存**为核心；提供同步 `getSnapshot()`（缓存未命中返回 `null` 并后台预加载）与异步 `getSnapshotAsync()`（强一致读）。
- **TimeHub（当前实现）**：以 `eventId → TimeGetResult` 的**单事件时间快照**为核心；负责 `timeSpec → start/end/allDay` 的规范化与写入；通过 `eventsUpdated` 做增量同步。
- **列表/聚合视图（实践）**：TimeLog 等页面优先使用 `EventService.getTimelineEvents/getEventsByRange` 做范围加载；UI 通过 `eventsUpdated` 或 `useEventHubSnapshot/useEventHubQuery` 做订阅驱动刷新。

> 说明：本文件后半部分包含早期设计稿/示意代码，其中部分表述（例如“全量快照/日期范围缓存”）与当前实现不再完全一致；请以本节与仓库源码为准。

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

**EventHub**（单事件缓存）:
- 📦 **内存快照管理**: 维护 `eventId → Event` 的内存副本（返回副本，避免外部修改）
- 🚦 **并发去重**: 缓存未命中时使用 in-flight 去重，避免同一事件并发冷加载
- 🔔 **订阅-发布**: EventService 在 `dispatchEventUpdate` 时会调用 `EventHub.notify('event-*', event)`（主要用于内部协作；UI 列表刷新优先走 `eventsUpdated` + hooks）
- ⏱️ **时间字段代理**: 将时间写入代理给 TimeHub

**TimeHub**（单事件时间快照）:
- 🕒 **时间数据规范化**: `timeSpec` 是时间唯一真相源；`startTime/endTime/isAllDay` 为派生字段
- 📦 **时间快照**: 维护 `eventId → TimeGetResult`，供 UI 同步读取
- 🔔 **按事件订阅**: `subscribe(eventId, cb)` 通知该事件时间变更
- 🔗 **EventService 集成**: 监听 `eventsUpdated`，优先使用 `detail.event` 增量更新缓存

### 架构原则

**双缓存架构**:
```
EventService（持久化层，唯一真相源）
  ├─ window.dispatchEvent('eventsUpdated', detail)  → UI/hooks
  └─ EventHub.notify('event-*', detail.event)       → 内部订阅者（如同步管理器）

EventHub：eventId → Event（单事件缓存）
TimeHub：eventId → TimeGetResult（单事件时间快照，监听 eventsUpdated）

UI：通过 hooks 订阅 eventsUpdated / TimeHub
```

**分工原则**:
- EventService: 数据规范化 + 持久化（唯一真相源）
- EventHub: 单事件缓存 + 同步/异步读边界
- TimeHub: 单事件时间快照 + 时间规范化

---

## EventHub 架构

### 1. 核心数据结构

```typescript
class EventHubClass {
  private cache: Map<string, { event: Event; lastModified: number }> = new Map();
  private inFlightLoads: Map<string, Promise<Event | null>> = new Map();
  private subscribers: Map<string, Array<(data: any) => void>> = new Map();
}

export const EventHub = new EventHubClass();
```

### 2. 初始化流程

```typescript
// ✅ 当前实现：EventHub 无需显式 initialize。
// - 读取/预加载都是按 eventId 懒触发（getSnapshot / getSnapshotAsync / prefetch）。
// - 增量更新通知由 EventService.dispatchEventUpdate 驱动：
//   - window.dispatchEvent(new CustomEvent('eventsUpdated', { detail }))：给 UI/hooks
//   - EventHub.notify('event-created|event-updated|event-deleted', event)：给内部订阅者
```

### 3. 快照管理

#### 3.1 获取快照

```typescript
// ✅ 同步快照：只读缓存。缓存未命中返回 null，并后台预加载。
getSnapshot(eventId: string): Event | null

// ✅ 强一致读：缓存未命中会冷加载并返回事件
async getSnapshotAsync(eventId: string): Promise<Event | null>

// ✅ 预加载：不关心返回值（hover/打开 modal 等场景）
async prefetch(eventId: string): Promise<void>
```

**关键实践**:
- UI 渲染路径需要同步语义时：用 `getSnapshot()`（允许短暂 `null`）
- 需要“读完即用”时：用 `getSnapshotAsync()`
- 避免把 `Promise` 当作对象塞进 state：同步与异步 API 分离

#### 3.2 增量更新

```typescript
// ✅ 当前实现：EventHub 不维护“全量数组快照”，而是维护 eventId -> Event 的单事件缓存。
// - updateFields()：写入 cache（乐观/即时），再持久化 EventService，并用结果刷新 cache
// - deleteEvent()：删除持久化数据前先清除 cache
// - 列表视图：通过 eventsUpdated + hooks 进行增量刷新
```

### 4. 字段更新（细粒度）

```typescript
async updateFields(
  eventId: string,
  updates: Partial<Event>,
  options?: { skipSync?: boolean; source?: string }
): Promise<{ success: boolean; event?: Event; error?: string }> {
  // 1) 从 EventService 读取最新 event（避免缓存过期）
  // 2) 合并 updates，写入 EventHub cache（即时响应）
  // 3) EventService.updateEvent() 持久化（normalize + eventsUpdated）
  // 4) 用持久化结果刷新 cache
}
```

### 5. 时间字段代理

```typescript
// ✅ 当前实现：EventHub 提供便捷 setEventTime（内部调用 TimeHub），并在完成后失效自身缓存
async setEventTime(
  eventId: string,
  input: { start?: string | Date; end?: string | Date; kind?: string; allDay?: boolean; source?: string },
  options?: { skipSync?: boolean }
): Promise<{ success: boolean; event?: Event; error?: string }>
```

### 6. 缓存失效

```typescript
// ✅ 当前实现：EventHub 只维护单事件 cache
invalidate(eventId: string): void
invalidateAll(): void
```

---

## TimeHub 架构

### 1. 核心数据结构

```typescript
class TimeHub {
  // 单事件时间快照缓存
  private cache = new Map<string, TimeGetResult>();

  // 单事件订阅者：eventId -> Set<cb>
  private listeners = new Map<string, Set<() => void>>();
}
```

### 2. 初始化流程

```typescript
// ✅ 当前实现：TimeHub 在首次调用（subscribe/getSnapshot/setEventTime）时懒初始化。
// 它监听 window 的 'eventsUpdated'，并按 eventId 做增量更新：
// - deleted：cache.delete(eventId)，并跳过 emit（避免不必要渲染）
// - detail.event：直接用 event 的 time 字段更新 cache 并 emit(eventId)
// - 缺少 detail.event：降级为 cache.delete(eventId) 并 emit(eventId)，促使下次重新读取
```

### 3. 时间视图查询

```typescript
// ✅ 同步读取该事件的时间快照（缓存未命中返回空快照并后台刷新）
getSnapshot(eventId: string): TimeGetResult

// ✅ 订阅单事件的时间变化
subscribe(eventId: string, cb: () => void): () => void
```

> 说明：TimeHub **不负责**“按日期范围查询事件列表”。范围列表查询请使用 `EventService.getEventsByRange/getTimelineEvents`。

### 4. 时间字段更新

```typescript
static async setEventTime(
  eventId: string,
  input: SetEventTimeInput,
  options?: { skipSync?: boolean }
): Promise<void> {
  // 1) 先更新 TimeHub 内存快照并 emit（UI 立即响应）
  // 2) 再持久化到 EventService（由 EventService 触发 eventsUpdated）
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

  // 3. ✅ 当前实现：TimeHub 会更新该 eventId 的快照并 emit(eventId)
  // （不会清空全局缓存，也不会 notify 全量订阅者）
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

  // 3. ✅ 当前实现：TimeHub 会更新该 eventId 的快照并 emit(eventId)
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
// ✅ 当前实现：TimeHub 的缓存以 eventId 为粒度。
// - 读取未命中：返回空快照并后台刷新
// - 收到 eventsUpdated：按 eventId 增量更新/失效 cache，并 emit(eventId)
// - 无公开的“全局 clearCache()”API
```

---

## 双 Hub 协作模式

### 1. 代理模式（EventHub → TimeHub）

```
UI 组件调用 EventHub.setEventTime()
  ↓
EventHub 代理给 TimeHub.setEventTime()
  ↓
TimeHub 先更新内存快照并 emit（UI 时间字段立即更新）
  ↓
TimeHub 持久化到 EventService（触发 eventsUpdated）
  ↓
EventHub.invalidate(eventId)（避免后续读到旧缓存）
  ↓
如需完整 Event：EventHub.getSnapshotAsync(eventId) 重新加载
```

### 2. 缓存同步（TimeHub → EventHub）

```
EventService.updateEvent() 完成
  ↓
dispatchEvent('eventsUpdated')
  ↓
  ├─ TimeHub 监听 → 增量更新/失效并 emit（按 eventId）
  └─ UI 列表订阅（useEventsUpdatedSubscription/useEventHubSnapshot）刷新视图

> 当前实现中，EventHub 本身不依赖 eventsUpdated 来“主动推送列表快照”。EventHub cache 是按需读取/失效/重新加载的。
```

### 3. 避免循环依赖

```typescript
// ❌ 错误：在 EventHub 的 create/update/delete 内主动 EventHub.notify()
// 可能与同步管理器/持久化通知形成闭环，导致重复同步或循环触发。

// ✅ 正确：由 EventService.dispatchEventUpdate 统一发出通知
// EventHub.* 只负责：更新 cache + 调用 EventService 持久化。
// EventService 持久化完成后：
// - window.dispatchEvent('eventsUpdated', detail) 给 UI/hooks
// - EventHub.notify('event-*', event) 给内部订阅者（如同步管理器）
// TimeHub 监听 eventsUpdated，并按 eventId 增量更新/失效自身 cache。
```

**关键约定**:
- EventHub 可以调用 TimeHub（代理）
- TimeHub 不直接调用 EventHub（通过事件通知）
- EventService 是唯一真相源（通过全局事件同步）

---

## 数据流

### 1. 读取流（单事件：EventHub）

```
UI 组件: EventHub.getSnapshot(eventId)
  ↓
EventHub: 缓存命中 → 返回 Event 副本
  └─ 缓存未命中 → 返回 null，并后台预加载

需要强一致读：UI 组件 await EventHub.getSnapshotAsync(eventId)
  ↓
EventHub: EventService.getEventById(eventId)
  ↓
EventHub: 写入 cache 并返回 Event
```

### 2. 读取流（列表/范围：实践推荐）

```
UI 组件: EventService.getTimelineEvents(start, end) / getEventsByRange(start, end)
  ↓
EventService: 范围查询（含缓存/去重/过滤）
  ↓
UI: 渲染列表
  ↓
增量刷新：监听 eventsUpdated（useEventsUpdatedSubscription / useEventHubSnapshot）
```

### 3. 写入流（增量更新：EventHub.updateFields）

```
UI 组件: EventHub.updateFields(eventId, updates)
  ↓
EventHub: 从 EventService 读取最新 event，合并 updates，更新自身 cache
  ↓
EventHub: 调用 EventService.updateEvent()（normalize + 持久化）
  ↓
EventService: dispatchEvent('eventsUpdated', { eventId, event? })
  ↓
UI 列表订阅（useEventsUpdatedSubscription/useEventHubSnapshot）刷新视图
  ↓
需要读取单事件时：EventHub.getSnapshot()/getSnapshotAsync()
```

### 3. 时间更新流（代理模式）

```
UI 组件: await TimeHub.setEventTime(eventId, input)
  ↓
TimeHub: 先更新内存快照并 emit（UI 即时响应）
  ↓
TimeHub: EventService.updateEvent() 持久化（normalize + 写入派生字段）
  ↓
EventService: dispatchEvent('eventsUpdated', { eventId, event? })
  ↓
TimeHub: 监听 → 增量更新/失效缓存并 emit
EventHub: 如需避免读到旧缓存，可 EventHub.invalidate(eventId) 并在下次读取时重新加载
```

---

## 订阅机制

### 0. React 集成（推荐实践）

- **列表快照（订阅驱动）**：使用 `useEventHubSnapshot({ enabled, autoLoad })`
  - 默认 `autoLoad=true` 适合多数页面
  - TimeLog 等性能敏感页面可 `autoLoad=false`，按需 `ensureLoaded()`
- **选择器视图**：使用 `useEventHubQuery(selector)`，在快照刷新时重算 selector
- **时间字段**：使用 `useEventTime(eventId)`，订阅单事件时间变更（TimeHub）
- **增量更新（已有列表时）**：使用 `useEventsUpdatedSubscription`，只合并/替换受影响的事件

> 实践示例：TimeLog 采用“范围查询 + eventsUpdated 增量合并”，并在事件更新后不再符合时间轴过滤条件时将其从列表移除，避免 stale。

### 1. EventHub 订阅

EventHub 提供一个轻量的订阅通道（按 eventType）：

```typescript
// eventType: 'event-created' | 'event-updated' | 'event-deleted'
const unsubscribe = EventHub.subscribe('event-updated', (data) => {
  // data 的 shape 取决于发布方；若需要“列表快照订阅”，请使用 useEventHubSnapshot/useEventHubQuery
});
```

> 实践建议：UI 列表的“刷新/快照订阅”优先走 `eventsUpdated` + hooks；EventHub 的 subscribe 更适合局部、显式的通知链路。

### 2. TimeHub 订阅

```typescript
// TimeHub 是“按 eventId 订阅”的：只在该事件时间字段变更时触发
const unsubscribe = TimeHub.subscribe(eventId, () => {
  // 典型用法：useSyncExternalStore 内部触发重取快照
});
```

### 3. 订阅机制差异

| 特性 | EventHub | TimeHub |
|------|----------|---------|
| 订阅内容 | 事件通知（按类型） | 单事件时间变更 |
| 粒度 | 全局（按类型） | 单事件（按 eventId） |
| 数据传递 | data 由发布方决定 | 通常不直接传新数据，UI 通过 getSnapshot/useEventTime 读取 |
| 使用场景 | 局部通知/内部协作 | 时间字段实时绑定 |

---

## 性能优化

### 1. 冷加载策略

```typescript
// EventHub: 同步 getSnapshot 只读缓存；缓存未命中返回 null，并后台预加载
const ev = EventHub.getSnapshot(eventId);
if (!ev) {
  // 需要强一致读时：await EventHub.getSnapshotAsync(eventId)
}
```

**优势**:
- 启动时不加载全量数据
- 减少初始化时间
- 只在需要时加载

### 2. 增量更新

```typescript
// ✅ 当前实现：按 eventId 更新缓存（不维护全量数组快照）
// - createEvent(): cache.set(event.id, event)
// - updateFields(): cache.set(eventId, mergedEvent)；持久化成功后用 result.event 刷新 cache
// - deleteEvent()/invalidate(): cache.delete(eventId)
```

**优势**:
- 避免全量查询
- 减少 IndexedDB 访问
- 提升响应速度

### 3. 缓存策略（当前实践）

- **单事件缓存**：EventHub/TimeHub 都是按 `eventId` 缓存
- **范围查询缓存**：由 EventService 的范围查询缓存负责（例如 5s TTL），避免重复 IndexedDB 查询
- **列表刷新**：通过 `eventsUpdated` 驱动（`useEventHubSnapshot/useEventHubQuery/useEventsUpdatedSubscription`）

### 4. 细粒度订阅（当前实践）

- **时间字段**：`useEventTime(eventId)`（TimeHub per-event subscribe）
- **事件详情**：可用 `EventHub.getSnapshot()` 同步读缓存，必要时 `getSnapshotAsync()` 强一致读

---

## 架构特点总结

### 1. 双缓存架构

```
EventHub: 单事件缓存（eventId -> Event）
TimeHub: 单事件时间快照（eventId -> TimeGetResult）

列表/范围视图：EventService.getTimelineEvents/getEventsByRange + hooks（订阅驱动刷新）
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
- EventHub 缓存以 eventId 为粒度（单事件快照），适合“事件详情/编辑态”的快速读写
- TimeHub 缓存以 eventId 为粒度（单事件时间快照），由 `eventsUpdated` 增量更新；缺少 detail 时会失效并在下次读取时重建
- TimeHub 通知后 UI 重新读取更可靠（避免传递不完整/过期数据）

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

> 注：EventService 的重构/优化记录已抽离，见 [EVENTSERVICE_REFACTOR_OPTIMIZATION_v2.18.8.md](./EVENTSERVICE_REFACTOR_OPTIMIZATION_v2.18.8.md)

---

## 总结

EventHub 和 TimeHub 构成 4DNote 的**双缓存架构**（单事件事件快照 + 单事件时间快照），通过 **eventsUpdated** 驱动的增量刷新与 hooks 订阅，实现高性能、低耦合的数据访问。

**核心优势**:
- ✅ 冷加载策略（按需加载）
- ✅ 增量更新（避免全量查询）
- ✅ 双缓存架构（单事件事件快照 + 单事件时间快照）
- ✅ 最终一致性（事件驱动同步：eventsUpdated）
- ✅ 时间标准化（TimeHub 统一处理 timeSpec → start/end/allDay）
- ✅ 细粒度订阅（TimeHub 按 eventId 订阅，减少重渲染）

**架构约定**:
1. EventService 是唯一真相源（规范化 + 持久化）
2. Hub 是缓存层（不做 normalize，不做范围查询业务逻辑）
3. EventHub 代理时间操作给 TimeHub（单向依赖）
4. UI 列表刷新优先走 `eventsUpdated` + hooks（避免自建全量快照）
5. 范围查询缓存/TTL 等策略归 EventService 管理（见配套文档）
