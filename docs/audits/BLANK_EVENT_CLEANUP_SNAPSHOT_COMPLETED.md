# 空白事件清理与 Snapshot 管理优化完成报告

**优化时间**: 2025-12-25  
**参考文档**: docs/audits/空白事件清理 & Placeholder 生命周期规范（含 History_Snapshot 策略，给 Copilot 的实施文档）.md  
**优化目标**: 实现智能空白事件清理，区分"从未非空"和"曾经非空"的事件，减少 EventHistory 噪音

---

## 一、优化概述

根据空白事件清理规范文档，完成了以下核心功能：

### ✅ 完成清单

| 任务 | 状态 | 文件 |
|------|------|------|
| 实现 isBlankCanonical 和 contentScore 函数 | ✅ 完成 | src/utils/eventContentSemantics.ts |
| 添加 lastNonBlankAt 和 bestSnapshot 字段 | ✅ 完成 | src/types.ts |
| 在 updateEvent 中维护元数据 | ✅ 完成 | src/services/EventService.ts |
| 优化 deleteEvent 的 history 写入逻辑 | ✅ 完成 | src/services/EventService.ts |
| 实现 cleanupBlankEvents 批量清理接口 | ✅ 完成 | src/services/EventService.ts |
| 实现 logDeleteWithSnapshot 方法 | ✅ 完成 | src/services/EventHistoryService.ts |

---

## 二、核心文件修改

### 1. src/utils/eventContentSemantics.ts（新增文件）

**文件职责**: 事件内容语义分析工具

**核心函数**:

#### (1) isBlankCanonical - 空白事件判定

```typescript
export function isBlankCanonical(event: Event): boolean {
  // 1. 检查 title（支持多种格式）
  // 2. 检查 eventLog（使用语义文本而非 HTML 结构）
  // 3. 检查 tags
  // 4. 检查 location
  // 5. 检查时间字段（timeSpec, startTime, endTime, isAllDay）
  // 6. 检查任务字段（isTask, isCompleted, priority, dueDateTime）
  
  return true; // 所有字段都为空
}
```

**特点**:
- ✅ Allowlist 策略（只检查对用户有意义的字段）
- ✅ 不检查元数据（id, createdAt, updatedAt 等）
- ✅ 不检查系统字段（syncStatus, source 等）
- ✅ 不检查临时字段（_isTempId, _originalTempId 等）

#### (2) extractTextFromEventLog - 提取纯文本

```typescript
export function extractTextFromEventLog(eventLog: string | EventLog | undefined): string {
  // 支持新旧格式：
  // - 旧格式：HTML 字符串 → 移除 HTML 标签
  // - 新格式：EventLog 对象 → 优先使用 plainText，降级到 slateJson 解析
  
  return text.trim();
}
```

**特点**:
- ✅ 兼容 EventLog 对象和 HTML 字符串
- ✅ 从 Slate JSON 中正确提取文本
- ✅ 避免 HTML 标签干扰判断

#### (3) contentScore - 内容丰富度评分

```typescript
export function contentScore(event: Event): number {
  let score = 0;
  
  // 评分规则（稳定，不要随意修改）：
  // - title 存在：+10
  // - eventLog 文本长度 > 0：+5
  // - eventLog 文本长度 > 50：+5
  // - eventLog 文本长度 > 200：+10
  // - tags 数量（最多10个）：每个 +2
  // - 有时间信息：+4
  // - 有地点：+2
  // - 是任务：+1
  // - 任务已完成：+1
  
  return score;
}
```

**用途**:
- 选择"最富有状态"的快照（best snapshot）
- 评估事件的重要程度

#### (4) EventSnapshot 接口和相关函数

```typescript
export interface EventSnapshot {
  eventId: string;
  capturedAt: string; // ISO 8601 时间戳
  title?: any;
  tags?: string[];
  eventLog?: EventLog;
  timeSpec?: any;
  // ... 其他用户内容字段
  score: number; // contentScore 评分
}

// 创建快照
export function createSnapshot(event: Event): EventSnapshot;

// 选择最佳快照（比较 score，score 相同时选更新的）
export function chooseBestSnapshot(
  a: EventSnapshot | undefined,
  b: EventSnapshot | undefined
): EventSnapshot | undefined;

// 从快照重建事件（用于恢复）
export function restoreFromSnapshot(snapshot: EventSnapshot): Partial<Event>;
```

---

### 2. src/types.ts - Event 接口扩展

添加了两个新字段：

```typescript
export interface Event {
  // ... 其他字段
  
  // 🆕 v3.1: 空白事件清理与 Snapshot 管理
  /**
   * 最后一次非空白状态的时间戳
   * - undefined: 从未有过实质内容（创建后一直为空）
   * - ISO 8601 字符串: 最后一次有实质内容的时间
   */
  lastNonBlankAt?: string;
  
  /**
   * "最富有状态"的快照（Best Snapshot）
   * 记录事件历史上内容最丰富的状态（按 contentScore 评分）
   */
  bestSnapshot?: import('./utils/eventContentSemantics').EventSnapshot;
}
```

**用途**:
- `lastNonBlankAt`: 判断事件是否曾经有过实质内容
- `bestSnapshot`: 删除时记录最佳状态，而非空状态

---

### 3. src/services/EventService.ts - 维护逻辑

#### (1) updateEvent 中维护 lastNonBlankAt 和 bestSnapshot

**插入位置**: Line ~1200（在 normalizeEvent 之后，logUpdate 之前）

```typescript
// 🆕 v3.1: 维护 lastNonBlankAt 和 bestSnapshot（空白事件清理支持）
const { isBlankCanonical, contentScore, createSnapshot, chooseBestSnapshot } = 
  await import('../utils/eventContentSemantics');

const isCurrentlyBlank = isBlankCanonical(normalizedEvent);

// 如果事件当前非空，更新 lastNonBlankAt
if (!isCurrentlyBlank) {
  normalizedEvent.lastNonBlankAt = formatTimeForStorage(new Date());
  
  // 计算当前快照的评分
  const currentSnapshot = createSnapshot(normalizedEvent);
  
  // 与 bestSnapshot 比较，选择最佳版本
  const existingBest = originalEvent.bestSnapshot;
  const newBest = chooseBestSnapshot(existingBest, currentSnapshot);
  
  // 只有在评分提升时才更新 bestSnapshot（避免频繁写入）
  if (!existingBest || (newBest && newBest.score > (existingBest.score || 0))) {
    normalizedEvent.bestSnapshot = newBest;
    eventLogger.log('📸 [Snapshot] Updated bestSnapshot:', {
      eventId: eventId.slice(-8),
      oldScore: existingBest?.score || 0,
      newScore: newBest?.score || 0
    });
  }
}
// 如果事件变为空白，保留原有的 lastNonBlankAt 和 bestSnapshot（不覆盖）
else {
  if (originalEvent.lastNonBlankAt) {
    normalizedEvent.lastNonBlankAt = originalEvent.lastNonBlankAt;
  }
  if (originalEvent.bestSnapshot) {
    normalizedEvent.bestSnapshot = originalEvent.bestSnapshot;
  }
}
```

**维护规则**:
- ✅ 事件非空时：更新 `lastNonBlankAt`，并根据评分更新 `bestSnapshot`
- ✅ 事件变空时：保留原有值（不覆盖历史记录）
- ✅ 只在评分提升时更新 `bestSnapshot`（避免频繁写入）

#### (2) deleteEvent 中智能写入 history

**修改位置**: Line ~1590-1630

```typescript
// 🆕 v3.1: 智能 EventHistory 记录（区分从未非空 vs 曾经非空）
const shouldWriteHistory = await this.shouldWriteHistoryOnDelete(deletedEvent, {
  reason: 'user-delete',
  source: 'user'
});

if (shouldWriteHistory) {
  // 曾经有过实质内容：记录 delete history（带 bestSnapshot）
  const { chooseBestSnapshot, createSnapshot } = 
    await import('../utils/eventContentSemantics');
  
  // 使用 bestSnapshot（如果有），否则使用当前状态
  const bestSnapshot = deletedEvent.bestSnapshot || createSnapshot(deletedEvent);
  
  EventHistoryService.logDeleteWithSnapshot(deletedEvent, bestSnapshot, 'user-edit');
  
  eventLogger.log('📸 [Snapshot] Recorded delete history with bestSnapshot:', {
    eventId: eventId.slice(-8),
    snapshotScore: bestSnapshot.score,
    lastNonBlankAt: deletedEvent.lastNonBlankAt
  });
} else {
  // 从未有过实质内容：不写 history（减少噪音）
  eventLogger.log('⏭️ [Snapshot] Skipped history for never-blank event:', {
    eventId: eventId.slice(-8),
    reason: 'lastNonBlankAt not set'
  });
}
```

**决策逻辑**:
- ✅ `lastNonBlankAt` 存在 → 曾经非空 → 写 history（带 bestSnapshot）
- ✅ `lastNonBlankAt` 不存在 → 从未非空 → 不写 history
- ✅ 池化占位事件（`_isPlaceholder`）→ 不写 history

#### (3) shouldWriteHistoryOnDelete - 判断是否写入 history

**新增方法**: Line ~2105

```typescript
/**
 * 判断删除事件时是否应该写入 EventHistory
 * 
 * 规则：
 * 1. 从未有过实质内容的空白事件（lastNonBlankAt 不存在）：不写 history
 * 2. 曾经有过实质内容的事件（lastNonBlankAt 存在）：写 history
 * 3. 池化占位事件（_isPlaceholder）：不写 history
 */
private static async shouldWriteHistoryOnDelete(
  event: Event,
  opts: { reason: string; source: string }
): Promise<boolean> {
  // 池化占位事件：不写 history
  if ((event as any)._isPlaceholder) {
    return false;
  }
  
  // 从未有过实质内容：不写 history
  if (!event.lastNonBlankAt) {
    return false;
  }
  
  // 其他情况：写 history
  return true;
}
```

#### (4) cleanupBlankEvents - 批量清理接口

**新增方法**: Line ~1990

```typescript
/**
 * 🆕 v3.1: 批量清理空白事件
 * 
 * 用途：
 * - PlanManager 在提交点批量清理空行
 * - Tag/TimeLog 页面的空白事件清理
 * - 定期维护任务
 * 
 * 清理规则：
 * - 只删除通过 isBlankCanonical 判定的空白事件
 * - 从未非空的事件：不写 history
 * - 曾经非空的事件：写 history（带 bestSnapshot）
 */
static async cleanupBlankEvents(eventIds: string[]): Promise<{
  deletedIds: string[];
  skippedIds: string[];
  errors: string[];
}> {
  const { isBlankCanonical } = await import('../utils/eventContentSemantics');
  
  // 逐个检查
  for (const eventId of eventIds) {
    const event = await this.getEventById(eventId);
    
    // 检查是否为空白事件
    if (!isBlankCanonical(event)) {
      skippedIds.push(eventId);
      continue;
    }
    
    // 删除空白事件（自动应用 shouldWriteHistoryOnDelete 规则）
    await this.deleteEvent(eventId, false);
    deletedIds.push(eventId);
  }
  
  return { deletedIds, skippedIds, errors };
}
```

**特点**:
- ✅ 批量处理（减少单次调用开销）
- ✅ 智能跳过非空事件
- ✅ 自动应用 history 写入规则
- ✅ 详细的结果统计（deleted, skipped, errors）

---

### 4. src/services/EventHistoryService.ts - 新增 logDeleteWithSnapshot

**新增方法**: Line ~290

```typescript
/**
 * 🆕 v3.1: 记录事件删除（带 best snapshot）
 * 用于空白事件清理场景：记录事件的"最富有状态"而非删除前的空状态
 * 
 * @param event 被删除的事件（当前状态）
 * @param snapshot 最佳快照（历史上最丰富的状态）
 * @param source 删除来源
 */
static logDeleteWithSnapshot(
  event: Event,
  snapshot: import('../utils/eventContentSemantics').EventSnapshot,
  source: string = 'user'
): EventChangeLog {
  const log: EventChangeLog = {
    id: this.generateLogId(),
    eventId: event.id,
    operation: 'delete',
    timestamp: formatTimeForStorage(new Date()),
    before: { ...event },
    source,
    // 🆕 附加 best snapshot（用于 Snapshot 附件模式展示）
    metadata: {
      bestSnapshot: snapshot,
      snapshotScore: snapshot.score,
      lastNonBlankAt: event.lastNonBlankAt,
      deletionContext: 'blank-cleanup'
    }
  };

  this.saveLog(log);
  historyLogger.log('🗑️📸 [Delete+Snapshot] 记录删除（含最佳快照）:', {
    title: event.title,
    snapshotScore: snapshot.score,
    capturedAt: snapshot.capturedAt
  });
  return log;
}
```

**优势**:
- ✅ 保留"最富有状态"而非空状态
- ✅ 支持 Snapshot 附件模式展示
- ✅ 包含 contentScore 评分信息
- ✅ 标记为 `blank-cleanup` 上下文

---

## 三、架构优势

### 1. 智能 History 记录

**Before**:
```
所有事件删除 → 一律写 EventHistory
    ↓
EventHistory 充满噪音（大量从未填写的空行被记录）
```

**After**:
```
删除事件 → 检查 lastNonBlankAt
    ↓
从未非空 → 不写 history（减少噪音）
曾经非空 → 写 history（带 bestSnapshot）
```

**收益**:
- ✅ 减少 EventHistory 噪音（从未填写的空行不再记录）
- ✅ 保留重要历史（曾经有内容的事件会被记录）
- ✅ 记录"巅峰时刻"而非"删除前的空状态"

---

### 2. Best Snapshot 策略

**概念**: 记录事件历史上"最富有状态"的快照，而非删除时的状态

**场景示例**:

```
时间线：
T1: 创建事件，填写标题和详细内容（score = 30）
    → bestSnapshot = { title, eventLog, score: 30 }

T2: 删除部分内容（score = 15）
    → bestSnapshot 保持 score=30（不降级）

T3: 删除所有内容，变为空白（score = 0）
    → bestSnapshot 仍保持 score=30

T4: 删除事件
    → EventHistory 记录 bestSnapshot（score=30）
    → 而不是当前状态（score=0）
```

**价值**:
- ✅ 保留事件的"巅峰时刻"
- ✅ 用户误删后可恢复最有价值的版本
- ✅ Snapshot 附件模式展示有意义的内容

---

### 3. 语义判断而非结构判断

**Before**:
```typescript
// 旧方式：基于 HTML 结构判断
function isEmptyEvent(event: Event): boolean {
  // 检查 slateJson 的 paragraph 数量
  // 检查 children 数量
  // 问题：HTML 标签可能让空内容看起来"非空"
}
```

**After**:
```typescript
// 新方式：基于语义文本判断
function isBlankCanonical(event: Event): boolean {
  const text = extractTextFromEventLog(event.eventlog);
  return text.trim().length === 0;
  // 只关心实际文本内容，不关心 HTML 结构
}
```

**优势**:
- ✅ 更准确的空白判定
- ✅ 不受 HTML 标签干扰
- ✅ 兼容新旧格式（EventLog 对象 / HTML 字符串）

---

## 四、使用示例

### 1. PlanManager 提交点清理

```typescript
// PlanManager.tsx
import { EventService } from '../services/EventService';

// 在提交点（blur/flush/navigate）批量清理空行
async function onCommitPoint() {
  const maybeBlankIds = session.maybeBlankIds; // 标记为"可能空白"的事件ID
  
  const result = await EventService.cleanupBlankEvents(maybeBlankIds);
  
  console.log('清理结果:', {
    deleted: result.deletedIds.length,
    skipped: result.skippedIds.length,
    errors: result.errors.length
  });
  
  // 对于被删除的事件，UI 替换为 placeholder row
  result.deletedIds.forEach(id => {
    replaceWithPlaceholder(id);
  });
}
```

### 2. 单个事件删除

```typescript
// 用户点击删除按钮
const result = await EventService.deleteEvent(eventId, false);

// EventService 内部会自动：
// 1. 检查 lastNonBlankAt
// 2. 决定是否写 history
// 3. 如果写 history，附带 bestSnapshot
```

### 3. 检查事件是否为空

```typescript
import { isBlankCanonical } from '../utils/eventContentSemantics';

const event = await EventService.getEventById(eventId);
const isBlank = isBlankCanonical(event);

if (isBlank) {
  console.log('这是一个空白事件');
} else {
  console.log('这个事件有实质内容');
}
```

### 4. 计算事件重要性

```typescript
import { contentScore } from '../utils/eventContentSemantics';

const event = await EventService.getEventById(eventId);
const score = contentScore(event);

console.log(`事件评分: ${score}`);
// score = 0: 完全空白
// score = 10-20: 只有标题
// score = 30+: 有详细内容
// score = 50+: 非常丰富
```

---

## 五、编译验证

| 文件 | 编译状态 | 错误数 | 备注 |
|------|---------|-------|------|
| eventContentSemantics.ts | ✅ 通过 | 0 | 新增文件 |
| types.ts | ✅ 通过 | 0 | 添加字段 |
| EventService.ts | ✅ 通过 | 0 | 核心逻辑修改 |
| EventHistoryService.ts | ✅ 通过 | 0 | 新增方法 |

**验证结论**: ✅ 所有修改文件编译通过，无新增错误

---

## 六、后续工作建议

### 1. PlanManager 集成（高优先级）

- [ ] 替换 `isEmptyEvent` 为 `isBlankCanonical`
- [ ] 在提交点调用 `cleanupBlankEvents`
- [ ] 停止"空白行也创建 event"，改用 UI-only placeholder

### 2. Tag/TimeLog 页面集成

- [ ] 添加空白事件清理逻辑
- [ ] 统一使用 `isBlankCanonical` 判断

### 3. EventHistory UI 展示

- [ ] 在历史记录中展示 `bestSnapshot`
- [ ] 添加"最佳状态"标签
- [ ] 支持从快照恢复事件

### 4. 定期维护任务

- [ ] 添加定期扫描空白事件的后台任务
- [ ] 清理长期未填写的空白事件（例如：创建超过7天仍为空）

### 5. 测试用例

- [ ] 测试从未非空的事件删除（不写 history）
- [ ] 测试曾经非空的事件删除（写 history + bestSnapshot）
- [ ] 测试 bestSnapshot 评分更新逻辑
- [ ] 测试批量清理 `cleanupBlankEvents`

---

## 七、总结

本次优化实现了智能空白事件清理机制：

**核心成果**:
- ✅ 区分"从未非空"和"曾经非空"的事件
- ✅ 减少 EventHistory 噪音（从未填写的空行不再记录）
- ✅ 保留重要历史（记录"最富有状态"而非空状态）
- ✅ 提供批量清理接口（`cleanupBlankEvents`）

**架构优势**:
- 语义判断替代结构判断
- Best Snapshot 策略记录"巅峰时刻"
- 智能 History 写入规则
- 统一的空白判定标准

**性能改进**:
- EventHistory 存储空间减少（减少噪音记录）
- 批量清理减少单次调用开销
- 只在评分提升时更新 bestSnapshot（避免频繁写入）

**用户体验**:
- 误删事件可恢复最佳版本
- 历史记录展示有意义的内容
- 减少无意义的历史噪音

---

**修复人**: GitHub Copilot  
**审核状态**: ✅ 编译通过，待集成测试  
**下一步**: PlanManager 集成 + EventHistory UI 展示
