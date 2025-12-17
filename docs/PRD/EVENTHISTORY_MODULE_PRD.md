# EventHistoryService 模块 PRD

**版本**: v2.18.8  
**更新日期**: 2025-12-17  
**状态**: ✅ 已实现并优化

---

## 📋 目录

1. [模块概述](#模块概述)
2. [核心功能](#核心功能)
3. [架构设计](#架构设计)
4. [数据模型](#数据模型)
5. [API 接口](#api-接口)
6. [清理机制](#清理机制)
7. [性能优化](#性能优化)
8. [问题修复历史](#问题修复历史)

---

## 模块概述

### 功能定位

EventHistoryService 是 4DNote 的**事件变更历史追踪系统**，负责记录所有事件的生命周期操作，提供完整的审计日志和时间旅行功能。

### 核心职责

1. **📝 变更记录**: 追踪所有事件的 CRUD 操作
2. **🔍 历史查询**: 支持按事件ID、时间范围、操作类型查询
3. **📊 统计分析**: 提供历史记录统计和健康检查
4. **🧹 智能清理**: 自动清理脏数据，保留有意义的变更
5. **⏱️ 时间旅行**: 支持事件状态快照重建（规划中）

### 存储架构

**主存储**: IndexedDB (Web + Electron 通用)
- 容量: ~250MB
- 性能: 单次写入 < 1ms
- 迁移完成: 2025-12-06 (v3.1.0)

**备份存储**: SQLite (仅 Electron 环境)
- 容量: ~10GB
- 自动备份: 双写机制

**降级方案**: localStorage (仅用于迁移)
- 已废弃: 配额限制 5-10MB

---

## 核心功能

### 1. 操作记录

#### 支持的操作类型

```typescript
type ChangeOperation = 
  | 'create'      // 创建事件
  | 'update'      // 更新事件
  | 'delete'      // 删除事件
  | 'checkin'     // 签到
  | 'uncheck';    // 取消签到
```

#### 记录来源

```typescript
type ChangeSource = 
  | 'user-edit'           // 用户手动编辑
  | 'external-sync'       // Outlook 同步
  | 'system'              // 系统自动操作
  | 'import'              // 数据导入
  | 'backfill-from-timestamp'  // 历史补录
```

### 2. 变更检测

#### 智能比较策略

**标准字段**: 深度比较 (isDeepEqual)
```typescript
if (!isDeepEqual(oldValue, newValue)) {
  recordChange(field, oldValue, newValue);
}
```

**特殊处理字段**:

1. **tags**: 规范化后比较（排序 + 去重）
   ```typescript
   normalize(tags) → sort → unique → compare
   ```

2. **description**: 移除签名后比较核心内容
   ```typescript
   extractCoreContent(description) → compare
   // 签名格式: <!--4DNote-Signature:...-->
   ```

3. **eventlog**: 只比较文本内容，忽略 Block Timestamp 元数据
   ```typescript
   extractTextFromSlateNodes(eventlog) → compare
   ```

4. **title**: 深度比较对象结构
   ```typescript
   { simpleTitle, colorTitle, fullTitle } → compare
   ```

#### 忽略字段

自动更新的元数据字段不记录变更：
```typescript
const ignoredFields = [
  'updatedAt',      // 更新时间（自动生成）
  'localVersion',   // 本地版本号
  'lastLocalChange',// 最后本地变更时间
  'lastSyncTime',   // 最后同步时间
  'position',       // 排序位置（非业务字段）
  'createdAt'       // 创建时间（不应在 update 中变化）
];
```

### 3. 查询功能

#### 查询选项

```typescript
interface HistoryQueryOptions {
  eventIds?: string[];       // 事件ID列表
  operations?: ChangeOperation[]; // 操作类型过滤
  startTime?: string;        // 起始时间 (ISO 8601)
  endTime?: string;          // 结束时间
  source?: string;           // 来源过滤
  limit?: number;            // 限制数量（默认1000）
  offset?: number;           // 分页偏移
}
```

#### 查询示例

```typescript
// 查询单个事件的所有历史
const logs = await EventHistoryService.query({
  eventIds: ['evt-123'],
  limit: 100
});

// 查询最近1小时的 Outlook 同步记录
const syncLogs = await EventHistoryService.query({
  source: 'external-sync',
  startTime: new Date(Date.now() - 3600000).toISOString(),
  limit: 50
});
```

### 4. 统计分析

#### 基础统计

```typescript
interface HistoryStatistics {
  total: number;                    // 总记录数
  byOperation: {                    // 按操作类型分组
    create: number;
    update: number;
    delete: number;
    checkin: number;
    uncheck: number;
  };
  oldestTimestamp: string | null;   // 最早记录时间
  newestTimestamp: string | null;   // 最新记录时间
}
```

#### 健康检查

```typescript
interface HealthCheckResult {
  total: number;                    // 总记录数
  bySource: Record<string, number>; // 按来源分组
  oldestRecord: string;             // 最早记录
  newestRecord: string;             // 最新记录
  recommendCleanup: boolean;        // 是否建议清理
  estimatedCleanupCount: number;    // 预计可清理数量
}
```

---

## 架构设计

### 核心类结构

```typescript
export class EventHistoryService {
  // 🔧 初始化
  static async initialize(sm: StorageManager): Promise<void>
  
  // 📝 记录操作
  static logCreate(event: Event, source: string, customTimestamp?: Date): EventChangeLog
  static logUpdate(eventId: string, before: Event, after: Partial<Event>, source: string, customTimestamp?: Date): EventChangeLog | null
  static logDelete(event: Event, source: string): EventChangeLog
  
  // 🔍 查询
  static async query(options: HistoryQueryOptions): Promise<EventChangeLog[]>
  static async getEventHistory(eventId: string, limit?: number): Promise<EventChangeLog[]>
  static async getRecentHistory(limit?: number): Promise<EventChangeLog[]>
  
  // 📊 统计
  static async getBasicStatistics(): Promise<HistoryStatistics | null>
  static async healthCheck(): Promise<HealthCheckResult>
  
  // 🧹 清理
  static async autoCleanup(): Promise<number>
  static startPeriodicCleanup(): void
  
  // 🔧 内部方法
  private static extractChanges(before: Partial<Event>, after: Partial<Event>): ChangeDetail[]
  private static extractCoreContent(description: string): string
  private static extractTextFromEventLog(eventlog: any): string
  private static isDeepEqual(a: any, b: any): boolean
  private static isTitleEqual(a: any, b: any): boolean
  private static isTagsEqual(a: any, b: any): boolean
}
```

### 数据流

```
用户操作 / Outlook同步
    ↓
EventService.updateEvent()
    ↓
EventHistoryService.logUpdate()
    ↓
extractChanges() → 变更检测
    ↓
├─ 有变更 → saveLog() → IndexedDB + SQLite
└─ 无变更 → return null (不记录)
    ↓
定期清理 (每小时)
    ↓
autoCleanup() → 删除脏数据
```

---

## 数据模型

### EventChangeLog

```typescript
interface EventChangeLog {
  id: string;                         // 历史记录ID: log_{timestamp}_{random}
  eventId: string;                    // 关联的事件ID
  operation: ChangeOperation;         // 操作类型
  timestamp: string;                  // 操作时间 (ISO 8601)
  source: ChangeSource;               // 操作来源
  before?: Partial<Event>;            // 变更前快照
  after?: Partial<Event>;             // 变更后快照
  changes: ChangeDetail[];            // 变更详情列表
  userId?: string;                    // 操作用户ID（预留）
  metadata?: any;                     // 额外元数据
}
```

### ChangeDetail

```typescript
interface ChangeDetail {
  field: string;          // 字段名称
  oldValue: any;          // 旧值
  newValue: any;          // 新值
  displayName?: string;   // 字段显示名称（中文）
}
```

### IndexedDB Schema

**Object Store**: `event_history`

**索引**:
- `eventId` - 按事件ID查询
- `operation` - 按操作类型过滤
- `timestamp` - 按时间范围查询
- `source` - 按来源过滤

---

## API 接口

### 记录操作

#### logCreate()

```typescript
static logCreate(
  event: Event,
  source: string = 'user',
  customTimestamp?: Date
): EventChangeLog
```

**功能**: 记录事件创建

**参数**:
- `event`: 创建的事件对象
- `source`: 操作来源（默认 'user'）
- `customTimestamp`: 自定义时间戳（用于历史补录）

**返回**: EventChangeLog 对象

**示例**:
```typescript
const log = EventHistoryService.logCreate(newEvent, 'user-edit');
```

#### logUpdate()

```typescript
static logUpdate(
  eventId: string,
  before: Event,
  after: Partial<Event>,
  source: string = 'user',
  customTimestamp?: Date
): EventChangeLog | null
```

**功能**: 记录事件更新

**参数**:
- `eventId`: 事件ID
- `before`: 更新前的完整事件对象
- `after`: 更新的字段（部分对象）
- `source`: 操作来源
- `customTimestamp`: 自定义时间戳

**返回**: 
- EventChangeLog 对象（有变更时）
- `null`（无实质性变更时）

**关键逻辑**:
```typescript
// 只遍历 after 中存在的字段（v2.18.8 修复）
const allKeys = new Set(Object.keys(after));

// 无变更时不记录
if (changes.length === 0) {
  return null;
}
```

**示例**:
```typescript
const changeLog = EventHistoryService.logUpdate(
  eventId,
  originalEvent,
  { title: 'New Title', tags: ['updated'] },
  'external-sync'
);

if (changeLog) {
  console.log('记录了变更:', changeLog.changes);
} else {
  console.log('无实质性变更，跳过记录');
}
```

#### logDelete()

```typescript
static logDelete(
  event: Event,
  source: string = 'user'
): EventChangeLog
```

**功能**: 记录事件删除

**参数**:
- `event`: 被删除的事件对象
- `source`: 操作来源

**返回**: EventChangeLog 对象

### 查询接口

#### query()

```typescript
static async query(
  options: HistoryQueryOptions
): Promise<EventChangeLog[]>
```

**功能**: 灵活查询历史记录

**性能**: 使用 IndexedDB 索引加速

#### getEventHistory()

```typescript
static async getEventHistory(
  eventId: string,
  limit: number = 100
): Promise<EventChangeLog[]>
```

**功能**: 获取单个事件的历史记录

**排序**: 按时间倒序（最新的在前）

#### getRecentHistory()

```typescript
static async getRecentHistory(
  limit: number = 20
): Promise<EventChangeLog[]>
```

**功能**: 获取最近的历史记录（跨所有事件）

**用途**: 历史记录查看器、审计日志

---

## 清理机制

### 清理策略（v2.18.8）

#### 层级1: 删除脏数据

**判断条件**:
```typescript
const meaninglessLogs = allLogs.filter(log => {
  if (!log.changes || log.changes.length === 0) {
    return true; // 没有变更记录
  }
  
  const meaningfulChanges = log.changes.filter(change => {
    // updatedAt 变更不算有意义
    if (change.field === 'updatedAt') return false;
    
    // tags 从 undefined → [] 不算有意义
    if (change.field === 'tags' && 
        oldValue === undefined && 
        newValue === '[]') {
      return false;
    }
    
    // description 签名变更不算有意义
    if (change.field === 'description') {
      return extractCoreContent(oldValue) !== extractCoreContent(newValue);
    }
    
    return true;
  });
  
  return meaningfulChanges.length === 0;
});
```

**清理内容**:
- ❌ 没有 changes 记录的日志
- ❌ 只改了 `updatedAt` 的记录
- ❌ `tags: undefined → []` 的记录（强制默认值 bug）
- ❌ description 只有签名变化的记录

#### 层级2: 删除临时数据

```typescript
const backfillLogs = remainingLogs.filter(
  log => log.source === 'backfill-from-timestamp'
);
```

**清理内容**:
- ❌ 历史补录的临时记录

#### 保留策略

```typescript
// ✅ 保留所有有意义的变更（不限制数量）
const meaningfulLogs = remainingLogs.filter(log => 
  !meaninglessLogs.includes(log) && 
  !backfillLogs.includes(log)
);
```

### 触发时机

#### 1. 启动时清理

```typescript
setTimeout(async () => {
  const deleted = await EventHistoryService.autoCleanup();
  if (deleted > 0) {
    historyLogger.log(`🧹 初始清理: 删除 ${deleted} 条记录`);
  }
}, 2000); // 延迟2秒，避免阻塞应用启动
```

#### 2. 定期清理

```typescript
static startPeriodicCleanup(): void {
  const interval = 60 * 60 * 1000; // 每小时
  
  setInterval(async () => {
    const deleted = await this.autoCleanup();
    if (deleted > 0) {
      historyLogger.log(`🧹 定期清理: 删除 ${deleted} 条记录`);
    }
  }, interval);
}
```

#### 3. 手动清理

```typescript
const deleted = await EventHistoryService.autoCleanup();
console.log(`清理了 ${deleted} 条记录`);
```

### 清理效果

**数据规模**（650个事件）:
- 清理前: 3095 条记录（含大量脏数据）
- 清理后: ~600-800 条记录（纯有意义变更）
- 健康状态: 每个事件平均 1-2 条历史记录

---

## 性能优化

### 写入性能

- **单次写入**: < 1ms
- **批量写入**: 使用 Promise.all 并发
- **异步操作**: 不阻塞主线程

### 查询性能

- **索引加速**: eventId, timestamp, operation, source
- **分页支持**: limit + offset
- **内存管理**: 默认 limit=1000，防止大量数据加载

### 存储优化

- **增量快照**: before/after 只存储变更字段
- **JSON 压缩**: 自动序列化/反序列化
- **智能清理**: 自动删除脏数据，保持存储健康

---

## 问题修复历史

### v2.18.8 (2025-12-17)

#### 🐛 Bug: extractChanges 误判本地字段为删除

**问题描述**:
```typescript
// 之前的逻辑
const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

// 问题场景：
// before = { id: '123', tags: ['tag1'], title: 'Test' }
// after = { title: 'New Title' }  // Outlook 只传了 title
// 
// allKeys = ['id', 'tags', 'title']
// 遍历到 tags 时:
//   oldValue = ['tag1']
//   newValue = undefined
//   → 误判为删除！
```

**影响**:
- Outlook 同步每次都记录 `tags, attendees, checked, unchecked, description` 变更
- 历史记录爆炸：618 → 771 条（单次同步 +153 条）

**修复**:
```typescript
// 只遍历 after 中存在的字段
const allKeys = new Set(Object.keys(after));

// 修复后：
// after = { title: 'New Title' }
// allKeys = ['title']
// 只检查 title 是否变更 ✅
```

**日志示例**:
```typescript
// 修复前：
变更字段: description, tags, attendees, checked, unchecked

// 修复后：
⏭️ 无实质性变更，跳过记录
```

### v2.18.7 (2025-12-17)

#### 🔧 优化: 移除硬编码阈值

**之前**:
```typescript
const CLEANUP_THRESHOLD = 5000;  // 阈值太高
const TARGET_COUNT = 3000;
```

**修复后**:
```typescript
// 无条件清理脏数据（不需要阈值判断）
// 保留所有有意义的变更
```

### v2.18.2 (2025-12-06)

#### 🚀 Feature: 定期清理任务

**新增**:
- 启动时延迟清理（2秒后）
- 定期清理（每小时）
- 智能清理逻辑（三层策略）

### v3.1.0 (2025-12-06)

#### 🔄 架构: localStorage → IndexedDB 迁移

**变更**:
- 主存储: IndexedDB (~250MB)
- 备份存储: SQLite (~10GB)
- 保留天数: 30天 → 90天
- 最大记录数: 5,000 → 50,000+

**解决问题**:
- ❌ QuotaExceededError
- ❌ localStorage 5-10MB 限制

---

## 字段显示名称

```typescript
const FIELD_DISPLAY_NAMES = {
  title: '标题',
  description: '描述',
  startTime: '开始时间',
  endTime: '结束时间',
  isAllDay: '全天事件',
  location: '地点',
  tags: '标签',
  priority: '优先级',
  isCompleted: '完成状态',
  eventLog: '时间日志',
  simpleTitle: '简单标题',
  fullTitle: '富文本标题',
  dueDateTime: '截止日期/时间'
};
```

---

## 使用示例

### 初始化

```typescript
import { EventHistoryService } from './services/EventHistoryService';
import { storageManager } from './services/storage/StorageManager';

// 应用启动时初始化
await EventHistoryService.initialize(storageManager);
```

### 记录变更

```typescript
// EventService.updateEvent 中自动调用
const changeLog = EventHistoryService.logUpdate(
  eventId,
  originalEvent,
  updates,
  'external-sync'
);

if (changeLog) {
  // 有变更，更新 updatedAt
  updatedEvent.updatedAt = formatTimeForStorage(new Date());
} else {
  // 无变更，保持原 updatedAt
}
```

### 查询历史

```typescript
// 查询单个事件的历史
const logs = await EventHistoryService.getEventHistory('evt-123', 50);

// 查询最近20条记录
const recent = await EventHistoryService.getRecentHistory(20);

// 高级查询
const syncLogs = await EventHistoryService.query({
  source: 'external-sync',
  startTime: '2025-12-17T00:00:00Z',
  operations: ['update'],
  limit: 100
});
```

### 统计分析

```typescript
// 基础统计
const stats = await EventHistoryService.getBasicStatistics();
console.log(`总记录数: ${stats.total}`);
console.log(`Update 操作: ${stats.byOperation.update} 条`);

// 健康检查
const health = await EventHistoryService.healthCheck();
if (health.recommendCleanup) {
  console.log(`建议清理: 可删除 ${health.estimatedCleanupCount} 条记录`);
}
```

---

## 未来规划

### 时间旅行功能

```typescript
// 规划中：重建事件在某个时间点的状态
const eventAtTime = await EventHistoryService.reconstructEventAt(
  eventId,
  new Date('2025-12-01')
);
```

### 变更对比

```typescript
// 规划中：对比两个版本的差异
const diff = await EventHistoryService.compareVersions(
  eventId,
  versionA,
  versionB
);
```

### 批量操作追踪

```typescript
// 规划中：记录批量导入、批量更新等操作
EventHistoryService.logBatchOperation({
  operation: 'bulk-import',
  affectedEvents: eventIds,
  source: 'csv-import'
});
```

---

## 总结

EventHistoryService 是 4DNote 的核心审计系统，提供完整的事件变更追踪能力。通过智能的变更检测、高效的存储策略和自动清理机制，确保系统在保留完整历史记录的同时，保持高性能和低存储占用。

**核心优势**:
- ✅ 完整的变更追踪（CRUD + 签到）
- ✅ 智能变更检测（避免无意义记录）
- ✅ 高性能存储（IndexedDB + SQLite）
- ✅ 自动清理机制（保持数据健康）
- ✅ 灵活的查询接口（多维度过滤）

**最佳实践**:
1. 所有事件变更都通过 EventService 进行，自动记录历史
2. 定期检查历史统计，监控存储健康
3. 利用 source 字段区分操作来源，便于审计
4. 依赖自动清理机制，无需手动管理历史记录
