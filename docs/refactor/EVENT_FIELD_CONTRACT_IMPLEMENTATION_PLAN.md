# Event Field Contract 实施计划

> 基于 `docs/architecture/EVENT_FIELD_CONTRACT_EXECUTABLE_ARCHITECTURE.md` (SSOT Contract)  
> 当前实际架构：`src/types.ts` Event interface  
> 目标：小步迭代，每步可测试可提交

---

## 🚨 需要用户决策的事项

### 决策点 1: 多日历同步架构 (Phase 4.3)

**当前架构**:
- 本地 1 个 event → 远程 N 个 event (不同日历)
- 存储: `syncedPlanCalendars: Array<{calendarId, remoteEventId}>`

**冲突**:
- SSOT Contract 只定义了单个 `externalId`
- 无法存储多个 remoteEventId

**选项 A: 保留多日历同步** (推荐)
- ✅ 保留现有功能
- ✅ 用户体验不变
- ❌ 需要修改 Contract，添加 `externalMappings` 字段
- 工作量: +2h (Contract 更新 + 文档说明)

**选项 B: 简化为单日历同步**
- ✅ 完全符合 Contract
- ❌ Breaking Change: 多日历数据丢失
- ❌ 用户需要手动删除远程重复事件
- 工作量: +4h (数据迁移 + 用户通知)

**建议**: 选项 A，理由：
1. 多日历同步是现有功能，不应退化
2. Contract 可以扩展，添加 `externalMappings` 不违反设计原则
3. 避免 Breaking Change

**待确认**: 请用户选择选项 A 或 B

---

### 决策点 2: SQLite Schema 变更 (Phase 5.4)

**问题**: `events` 表有 `color` 列，需要删除

**选项 A: 直接删除列**
- ✅ 干净彻底
- ❌ SQLite 不支持 DROP COLUMN (需要重建表)
- 工作量: +1h (重建表 + 数据迁移)

**选项 B: 标记为废弃，不删除**
- ✅ 安全
- ❌ 留下技术债务
- 工作量: 0h

**建议**: 选项 A，在 Phase 5.4 执行表重建

**待确认**: 请用户确认是否同意重建表

---

## 📊 现状审计

### ✅ 已符合 Contract 的字段

#### A. Identity & Classification
- ✅ `id`: string
- ✅ `deletedAt`: string | null
- ⚠️ `source`: 'local' | 'outlook' | 'google' | 'icloud'（需扩展为命名空间格式）

#### B. Content
- ✅ `title`: EventTitle (fullTitle/colorTitle/simpleTitle)
- ✅ `eventlog`: string | EventLog
- ✅ `description`: string

#### C. Time Intent & Fields
- ✅ `startTime`: string | undefined
- ✅ `endTime`: string | undefined
- ✅ `isAllDay`: boolean | undefined
- ✅ `timeSpec`: TimeSpec
- ✅ `displayHint`: string | null
- ✅ `isFuzzyDate`: boolean
- ✅ `timeFieldState`: [number, number, number, number]
- ✅ `isFuzzyTime`: boolean
- ✅ `fuzzyTimeName`: string

#### D. Task/Plan Semantics
- ✅ `checkType`: CheckType ('none' | 'once' | 'recurring')
- ✅ `checked`: string[]
- ✅ `unchecked`: string[]
- ✅ `recurringConfig`: RecurringConfig
- ✅ `dueDateTime`: string

#### E. Context & Metadata
- ✅ `tags`: string[]
- ✅ `location`: string | LocationObject
- ✅ `organizer`: Contact
- ✅ `attendees`: Contact[]
- ✅ `reminder`: number

#### F. Sync Fields
- ✅ `externalId`: string
- ✅ `syncStatus`: SyncStatusType
- ✅ `syncMode`: string
- ✅ `calendarIds`: string[]
- ✅ `todoListIds`: string[]
- ✅ `lastSyncTime`: string

#### G. Structure
- ✅ `parentEventId`: string
- ✅ `position`: number
- ✅ `linkedEventIds`: string[]
- ✅ `backlinks`: string[]

#### H. Meta Fields
- ✅ `createdAt`: string
- ✅ `updatedAt`: string
- ✅ `localVersion`: number

#### I. Snapshot & Diagnostics
- ✅ `lastNonBlankAt`: string
- ✅ `bestSnapshot`: EventSnapshot

#### J. Temp ID Tracking
- ✅ `_isTempId`: boolean
- ✅ `_originalTempId`: string

---

### ❌ 违反 Contract 的字段（需要删除/迁移）

#### 1. 废弃的分类 flags（Legacy）
根据 Contract Section 6.1，这些字段**必须删除**：

```typescript
// ❌ 必须删除
isTimer?: boolean;
isTimeLog?: boolean;
isOutsideApp?: boolean;
isDeadline?: boolean;
isTask?: boolean;
isPlan?: boolean;
isTimeCalendar?: boolean;
isNote?: boolean;

// 替代方案：使用 source + facet 推导
// - Task 能力：checkType !== 'none'
// - Calendar 能力：startTime && endTime
// - Plan 页面纳入：checkType !== 'none'
// - TimeLog 创建来源：source='local:timelog'
// - Library 笔记：source='local:library'
```

#### 2. 废弃的分类字段
```typescript
// ❌ 必须删除
type?: 'todo' | 'task' | 'event';
category?: string;
fourDNoteSource?: boolean;
```

#### 3. 废弃的 Plan 字段
```typescript
// ❌ 必须删除
content?: string;      // 已废弃，使用 title.fullTitle
emoji?: string;        // 迁移到 title.fullTitle（Slate JSON第一个text node开头）
color?: string;        // 迁移到 title.fullTitle（Slate JSON标记节点的color属性）
notes?: string;        // 已废弃，使用 eventlog（已迁移完成，只需删除类型定义）
isCompleted?: boolean; // 替换为 checkType + checked 推导
mode?: 'title' | 'eventlog'; // UI-only，不应在 Event（FloatingToolbar内部状态）
```

**emoji/color 迁移说明**:
- **当前使用**: `event.emoji` 在 DetailTab.tsx, App.tsx 中用于 Timer 显示
- **目标**: 全部改为从 `title.fullTitle` (Slate JSON) 中提取
- **已有工具**: DetailTab.tsx 已有 `extractFirstEmoji()` 函数（L1977）
- **迁移影响**: 8个文件（App.tsx, DetailTab.tsx, EventEditModalV2.tsx等）
- **color**: 只在4处使用，全部改为从标签颜色或默认值读取

#### 4. 废弃的 Sync 字段
```typescript
// ❌ 必须删除
lastLocalChange?: string;          // 使用 updatedAt
timerSessionId?: string;           // ✅ 保留（只读审计字段，Timer系统写入，EventService只读）
syncedPlanEventId?: string | null;  // @deprecated（删除，使用 syncedPlanCalendars）
syncedActualEventId?: string | null; // @deprecated（删除，使用 syncedActualCalendars）
syncedOutlookEventId?: string | null; // @deprecated（已废弃，删除）

// ⚠️ 保留（需要重新审视，但不在本次删除范围）
subEventConfig?: { calendarIds, syncMode };  // ✅ 保留（父事件模板配置，EVENTEDITMODAL_V2_PRD.md核心机制）
hasCustomSyncConfig?: boolean;               // ✅ 保留（手动子事件继承判断，ActionBasedSyncManager需要）

// 🔄 迁移方案（多日历同步）
syncedPlanCalendars?: Array<{calendarId, remoteEventId}>;  
syncedActualCalendars?: Array<{calendarId, remoteEventId}>;
// → 迁移到统一的 externalId 结构（Phase 4.3）

// 🔄 迁移方案（同步配置统一）
planSyncConfig?: PlanSyncConfig;    // → 迁移到 calendarIds + syncMode（Phase 4.4）
actualSyncConfig?: ActualSyncConfig; // → 迁移到 subEventConfig.syncMode（Phase 4.4）
```

**timerSessionId 保留理由**:
- **用途**: Timer系统在创建Timer事件时写入，用于关联Timer会话
- **读取**: EventService只读，用于审计和调试
- **影响**: 仅2处引用（types.ts定义 + holidays/types.ts副本）
- **结论**: 只读审计字段，符合Contract原则，保留

**subEventConfig 保留理由**:
- **核心机制**: EVENTEDITMODAL_V2_PRD.md L119-122定义的父事件模板系统
- **用途**: 父事件存储子事件默认配置（calendarIds + syncMode）
- **场景**: 父事件无子事件时配置持久化，创建子事件时继承
- **影响**: DetailTab.tsx, EventEditModalV2.tsx, App.tsx 核心逻辑
- **结论**: 架构设计核心，必须保留

**hasCustomSyncConfig 保留理由**:
- **用途**: 标记手动子事件是否自定义了同步配置
- **场景**: 父事件更新配置时，只更新未自定义的子事件（DetailTab L1552）
- **影响**: EventEditModalV2.tsx L1386, DetailTab.tsx L1454-1555
- **结论**: 继承机制必需，保留

---

### ⚠️ 需要扩展的字段

#### 1. `source` 字段
**当前**：`'local' | 'outlook' | 'google' | 'icloud'`  
**Contract 要求**：命名空间格式

```typescript
// 需要扩展为：
type EventSource = 
  | 'local:plan'
  | 'local:timecalendar'
  | 'local:timelog'
  | 'local:library'
  | 'local:workspace'
  | 'local:sky'
  | 'local:event_edit'
  | 'local:ai_chat_card'
  | 'local:ai_inline'
  | 'outlook:calendar'
  | 'outlook:todo'
  | 'google:calendar'
  | 'icloud:calendar';
```

#### 2. 缺失的 AI 对话字段
Contract Section 8.4 要求的 AI 卡片字段：

```typescript
// ❌ 缺失，需要添加
conversationType?: 'sprout' | 'root';    // AI 对话类型
hostEventId?: string;                     // AI 卡片必须挂载的宿主事件
aiMetadata?: {                            // AI 元数据
  model?: string;
  prompt?: string;
  generatedAt?: string;
};
```

---

## 🎯 实施 TODO（分步执行）

### Phase 1: 清理 Legacy 分类 Flags（高优先级）

#### Step 1.1: 添加 facet 推导工具函数
**文件**: `src/utils/eventFacets.ts` (新建)

```typescript
/**
 * Event Facet 推导函数
 * 根据 Contract Section 6.1 实现
 */

export function hasTaskFacet(event: Event): boolean {
  return event.checkType !== 'none' && event.checkType !== undefined;
}

export function hasCalendarFacet(event: Event): boolean {
  return !!(event.startTime && event.endTime);
}

export function shouldShowInPlan(event: Event): boolean {
  return hasTaskFacet(event);
}

export function shouldShowInTimeCalendar(event: Event): boolean {
  // Contract: 本地创建且有 calendar block，或外部同步
  if (hasCalendarFacet(event)) {
    return event.source?.startsWith('local:') || event.source?.startsWith('outlook:') || false;
  }
  // 或者 Task Bar（checkType 存在但无时间段）
  return hasTaskFacet(event) && !hasCalendarFacet(event);
}

export function isLocalCreation(event: Event): boolean {
  return event.source?.startsWith('local:') || event.source === 'local' || false;
}

export function isExternalSync(event: Event): boolean {
  return event.source?.startsWith('outlook:') || 
         event.source?.startsWith('google:') ||
         event.source === 'outlook' ||
         event.source === 'google' ||
         false;
}

export function getCreationSource(event: Event): string {
  // 向后兼容
  if (event.source === 'local') return 'local:unknown';
  if (event.source === 'outlook') return 'outlook:calendar';
  return event.source || 'local:unknown';
}
```

**提交**: `feat(utils): 添加 Event Facet 推导函数 (Contract Phase 1.1)`

---

#### Step 1.2: 替换 Plan 页面的 isPlan 判断
**文件**: `src/features/Plan/helpers/planManagerFilters.ts`

**查找**: `event.isPlan`  
**替换为**: `hasTaskFacet(event)`

**影响文件**:
- `src/features/Plan/components/PlanManager.tsx`
- `src/features/Plan/helpers/planManagerFilters.ts`

**测试**:
```bash
# 测试 Plan 页面筛选逻辑
npm run test:unit -- planManagerFilters.test.ts
```

**提交**: `refactor(plan): 用 facet 推导替换 isPlan 字段 (Contract Phase 1.2)`

---

#### Step 1.3: 替换 TimeCalendar 页面的分类判断
**文件**: `src/features/TimeCalendar/utils/calendarUtils.ts`

**查找**: `event.isTimeCalendar`, `event.isTask`  
**替换为**: `shouldShowInTimeCalendar(event)`

**影响文件**:
- `src/features/TimeCalendar/components/TimeCalendarView.tsx`
- `src/utils/calendarUtils.ts`

**测试**:
```bash
npm run test:unit -- calendarUtils.test.ts
```

**提交**: `refactor(timecalendar): 用 facet 推导替换分类 flags (Contract Phase 1.3)`

---

#### Step 1.4: 替换 EventService 中的分类判断
**文件**: `src/services/EventService.ts`

**查找**: `isTask`, `isPlan`, `isTimeCalendar` 的所有使用  
**替换为**: facet 函数

**影响范围**:
- `normalizeEvent()`: 移除 `isTask/isPlan` 写入逻辑
- `createEvent()`: 移除自动设置 `isPlan` 逻辑

**测试**:
```bash
npm run test:unit -- EventService.test.ts
```

**提交**: `refactor(service): EventService 移除分类 flags 依赖 (Contract Phase 1.4)`

---

#### Step 1.5: 替换 Sync 逻辑中的分类判断
**文件**: `src/services/sync/ActionBasedSyncManager.ts`

**查找**: `isTask`, `isPlan` 判断  
**替换为**: `hasTaskFacet(event)` 或 `source` 判断

**提交**: `refactor(sync): Sync 移除分类 flags 依赖 (Contract Phase 1.5)`

---

#### Step 1.6: 从 types.ts 删除分类 flags
**文件**: `src/types.ts`

```typescript
// ❌ 删除以下字段：
isTimer?: boolean;
isTimeLog?: boolean;
isOutsideApp?: boolean;
isDeadline?: boolean;
isTask?: boolean;
isPlan?: boolean;
isTimeCalendar?: boolean;
isNote?: boolean;
type?: 'todo' | 'task' | 'event';
category?: string;
```

**测试**:
```bash
# 全局编译检查
npm run build
# 全局测试
npm run test
```

**提交**: `refactor(types): 删除废弃的分类 flags (Contract Phase 1.6)`

---

### Phase 2: 扩展 source 字段为命名空间格式

#### Step 2.1: 更新 source 类型定义
**文件**: `src/types.ts`

```typescript
// 修改前：
source?: 'local' | 'outlook' | 'google' | 'icloud';

// 修改后：
source?: EventSource;

// 新增类型定义：
export type EventSource = 
  | 'local:plan'
  | 'local:timecalendar'
  | 'local:timelog'
  | 'local:library'
  | 'local:workspace'
  | 'local:sky'
  | 'local:event_edit'
  | 'local:ai_chat_card'
  | 'local:ai_inline'
  | 'outlook:calendar'
  | 'outlook:todo'
  | 'google:calendar'
  | 'icloud:calendar'
  | 'local'      // 向后兼容
  | 'outlook'    // 向后兼容
  | 'google'     // 向后兼容
  | 'icloud';    // 向后兼容
```

**提交**: `feat(types): 扩展 source 为命名空间格式 (Contract Phase 2.1)`

---

#### Step 2.2: 迁移现有数据
**文件**: `src/utils/migrations/migrateSourceField.ts` (新建)

```typescript
/**
 * 迁移 source 字段到命名空间格式
 * 
 * 规则：
 * - 'local' → 'local:unknown'（无法推断具体页面）
 * - 'outlook' → 'outlook:calendar'（向后兼容）
 * - isPlan=true → 'local:plan'（如果 source='local'）
 * - isTimeCalendar=true → 'local:timecalendar'（如果 source='local'）
 */
export function migrateEventSource(event: Event): Event {
  if (!event.source || event.source.includes(':')) {
    return event; // 已经是新格式或未设置
  }
  
  let newSource: EventSource;
  
  if (event.source === 'outlook') {
    newSource = 'outlook:calendar';
  } else if (event.source === 'google') {
    newSource = 'google:calendar';
  } else if (event.source === 'icloud') {
    newSource = 'icloud:calendar';
  } else if (event.source === 'local') {
    // 尝试推断具体页面
    if (event.isPlan) {
      newSource = 'local:plan';
    } else if (event.isTimeCalendar) {
      newSource = 'local:timecalendar';
    } else if (event.isTimeLog) {
      newSource = 'local:timelog';
    } else if (event.isNote) {
      newSource = 'local:library';
    } else {
      newSource = 'local:event_edit'; // 默认
    }
  } else {
    newSource = 'local:unknown';
  }
  
  return { ...event, source: newSource };
}
```

**执行迁移**:
```typescript
// src/services/EventService.ts
async initializeEvents() {
  const events = await this.storage.getAllEvents();
  const migrated = events.map(migrateEventSource);
  await this.storage.bulkUpdate(migrated);
}
```

**提交**: `feat(migration): 迁移 source 字段到命名空间格式 (Contract Phase 2.2)`

---

#### Step 2.3: 更新创建逻辑
**文件**: `src/services/EventService.ts`

```typescript
// Plan 页面创建
async createPlanEvent(data: Partial<Event>): Promise<Event> {
  return this.createEvent({
    ...data,
    source: 'local:plan',
    checkType: data.checkType || 'once', // Plan 默认 Task
  });
}

// TimeCalendar 页面创建
async createTimeCalendarEvent(data: Partial<Event>): Promise<Event> {
  return this.createEvent({
    ...data,
    source: 'local:timecalendar',
  });
}

// EventEditModal 创建
async createEvent(data: Partial<Event>): Promise<Event> {
  return this.createEvent({
    ...data,
    source: data.source || 'local:event_edit',
  });
}
```

**提交**: `refactor(service): 创建时设置 source 命名空间 (Contract Phase 2.3)`

---

### Phase 3: 添加 AI 对话字段

#### Step 3.1: 添加 AI 对话字段定义
**文件**: `src/types.ts`

```typescript
export interface Event {
  // ... 现有字段

  // 🆕 AI 对话卡片字段 (Contract Section 8.4)
  conversationType?: 'sprout' | 'root';    // AI 对话类型
  hostEventId?: string;                     // AI 卡片必须挂载的宿主事件
  aiMetadata?: {
    model?: string;                         // AI 模型
    prompt?: string;                        // 用户 prompt
    generatedAt?: string;                   // 生成时间（本地格式）
    tokenUsage?: {
      prompt: number;
      completion: number;
      total: number;
    };
  };
}
```

**提交**: `feat(types): 添加 AI 对话卡片字段 (Contract Phase 3.1)`

---

#### Step 3.2: 实现 AI 卡片创建逻辑
**文件**: `src/services/ai/AIConversationService.ts` (新建)

```typescript
export class AIConversationService {
  async createSprout(hostEventId: string, prompt: string): Promise<Event> {
    const sprout = await this.eventService.createEvent({
      source: 'local:ai_chat_card',
      conversationType: 'sprout',
      hostEventId,
      aiMetadata: {
        prompt,
        generatedAt: formatTimeForStorage(new Date()),
      },
      parentEventId: hostEventId, // Level 1: 挂载为子事件
    });
    
    return sprout;
  }
  
  async upgradeToRoot(sproutId: string): Promise<Event> {
    const sprout = await this.eventService.getEvent(sproutId);
    if (!sprout || sprout.conversationType !== 'sprout') {
      throw new Error('Invalid sprout');
    }
    
    // 转换为 Root
    return this.eventService.updateEvent(sproutId, {
      conversationType: 'root',
      parentEventId: undefined, // Level 2: 独立事件
    });
  }
}
```

**提交**: `feat(ai): 实现 AI 对话卡片服务 (Contract Phase 3.2)`

---

### Phase 4: 清理废弃的 Sync 字段

#### Step 4.1: 删除 lastLocalChange 字段
**文件**: `src/types.ts`

**查找**: `lastLocalChange`  
**替换**: `updatedAt`

**影响范围**: 无引用（grep搜索结果为0）

**测试**: `npm run build`

**提交**: `refactor(types): 删除废弃的 lastLocalChange 字段 (Contract Phase 4.1)`

---

#### Step 4.2: 删除 @deprecated 字段（syncedPlanEventId/syncedActualEventId/syncedOutlookEventId）
**文件**: `src/types.ts`

```typescript
// ❌ 删除以下字段：
syncedPlanEventId?: string | null;
syncedActualEventId?: string | null;
syncedOutlookEventId?: string | null;
lastLocalChange?: string;
```

**迁移逻辑**:
```typescript
// 迁移到 externalId
if (event.syncedOutlookEventId && !event.externalId) {
  event.externalId = `outlook-${event.syncedOutlookEventId}`;
}
```

**提交**: `refactor(sync): 删除 deprecated sync 字段 (Contract Phase 4.2)`

---

#### Step 4.3: 多日历同步迁移（syncedPlanCalendars → externalId）
**当前架构**:
```typescript
syncedPlanCalendars: Array<{ calendarId: string, remoteEventId: string }>
syncedActualCalendars: Array<{ calendarId: string, remoteEventId: string }>
```

**目标架构**（Contract Section 7.2）:
```typescript
externalId: string  // 主日历的远程事件ID
calendarIds: string[]  // 所有同步的日历ID
```

**⚠️ 重大决策点 - 需要用户确认**:

**方案A: 保留多日历数组（推荐）**  
- **理由**: 本地1个event → 远程N个event的映射关系必须保存
- **场景**: 用户将同一事件同步到"工作日历"和"个人日历"
- **数据**: `syncedPlanCalendars: [{calendarId: 'work', remoteEventId: 'event-1'}, {calendarId: 'personal', remoteEventId: 'event-2'}]`
- **问题**: Contract只定义了单个externalId，无法存储多个remoteEventId
- **影响**: 如果删除，多日历同步功能将失效

**方案B: 简化为单日历同步**  
- **修改**: 限制每个event只能同步到1个日历
- **迁移**: 保留第一个日历的remoteEventId → externalId
- **数据丢失**: 其他日历的远程事件变成孤儿（无法更新/删除）
- **Breaking Change**: 用户需要手动删除远程重复事件

**🎯 建议**: 保留 `syncedPlanCalendars/syncedActualCalendars`，但重命名为 `externalMappings: Array<{calendarId, remoteEventId}>` 以符合Contract术语

**📋 调用链路分析** (如果删除会影响的代码):

**写入路径** (EventService.ts):
```
L5062: updates.syncedPlanCalendars = syncedCalendars;
       ↓
       存储本地事件对应的所有远程事件ID
```

**读取路径** (EventService.ts):
```
L4971: event.syncedPlanCalendars || []
       ↓
L5143: event.syncedPlanCalendars
       ↓
       判断远程事件是否属于本地事件
```

**同步路径** (ActionBasedSyncManager.ts):
```
L4186: e.syncedPlanCalendars?.some((cal) => ...)
       ↓
       查找本地事件对应的远程事件ID
       ↓
       决定是 UPDATE 还是 CREATE
```

**影响范围**: 如果删除，以下场景会失败:
1. 用户将同一事件同步到"工作日历"和"个人日历"
2. 修改事件后，只能更新第一个日历，其他日历变成孤儿事件
3. 删除事件后，只能删除第一个日历，其他日历残留

**提交**: `refactor(sync): 重命名多日历映射字段 (Contract Phase 4.3)` ← 等待用户决策

---

#### Step 4.4: 同步配置统一（planSyncConfig/actualSyncConfig → syncMode + calendarIds）
**当前架构**:
```typescript
planSyncConfig: {
  mode: 'bidirectional',
  targetCalendars: ['cal1', 'cal2'],
  privateMode: false
}
actualSyncConfig: {
  mode: 'send-only-private',
  targetCalendars: ['cal3']
}
```

**目标架构**（Contract Section 7.1）:
```typescript
calendarIds: ['cal1', 'cal2']  // 计划安排同步的日历
syncMode: 'bidirectional'       // 计划安排的同步模式
subEventConfig: {
  calendarIds: ['cal3'],        // 实际进展（子事件）同步的日历
  syncMode: 'send-only-private' // 实际进展的同步模式
}
```

**迁移步骤**:

1. **创建迁移函数**: `src/utils/migrations/migrateSyncConfig.ts`
```typescript
export function migrateSyncConfig(event: Event): Event {
  const updates: Partial<Event> = {};
  
  // 1. 迁移 planSyncConfig → calendarIds + syncMode
  if (event.planSyncConfig) {
    updates.calendarIds = event.planSyncConfig.targetCalendars || [];
    updates.syncMode = event.planSyncConfig.mode || 'bidirectional';
  }
  
  // 2. 迁移 actualSyncConfig → subEventConfig
  if (event.actualSyncConfig) {
    updates.subEventConfig = {
      calendarIds: event.actualSyncConfig.targetCalendars || [],
      syncMode: event.actualSyncConfig.mode || 'bidirectional-private'
    };
  } else if (event.planSyncConfig) {
    // actualSyncConfig=null 表示继承 planSyncConfig
    updates.subEventConfig = {
      calendarIds: event.planSyncConfig.targetCalendars || [],
      syncMode: event.planSyncConfig.mode || 'bidirectional'
    };
  }
  
  return { ...event, ...updates };
}
```

2. **执行迁移**: EventService.ts `initializeEvents()`
```typescript
const events = await this.storage.getAllEvents();
const migrated = events.map(migrateSyncConfig);
await this.storage.bulkUpdate(migrated);
```

3. **更新同步逻辑**: ActionBasedSyncManager.ts
```typescript
// 修改前：
const planConfig = event.planSyncConfig;
const actualConfig = event.actualSyncConfig;

// 修改后：
const planConfig = {
  mode: event.syncMode,
  targetCalendars: event.calendarIds
};
const actualConfig = event.subEventConfig ? {
  mode: event.subEventConfig.syncMode,
  targetCalendars: event.subEventConfig.calendarIds
} : null;
```

4. **删除类型定义**: `src/types.ts`
```typescript
// ❌ 删除
export interface PlanSyncConfig { ... }
export interface ActualSyncConfig { ... }
planSyncConfig?: PlanSyncConfig;
actualSyncConfig?: ActualSyncConfig;
```

**影响文件**:
- `src/utils/calendarSyncUtils.ts` (getEffectivePlanSyncConfig等函数)
- `src/services/sync/ActionBasedSyncManager.ts` (L3005-3030保护字段)
- `src/services/EventService.ts` (L1344-1351同步配置日志)
- `docs/PRD/EVENTEDITMODAL_V2_PRD.md` (文档更新)

**测试策略**:
1. **数据迁移测试**: 验证所有旧配置正确转换
2. **同步功能测试**: Plan/Actual分别同步到不同日历
3. **继承测试**: actualSyncConfig=null时正确继承planSyncConfig

**提交**: `refactor(sync): 统一同步配置到 syncMode + calendarIds (Contract Phase 4.4)`

---

### Phase 5: 删除废弃的 Plan 字段

#### Step 5.1: 迁移 content → title.fullTitle
**查找**: `event.content`  
**替换**: `event.title.fullTitle`

**影响文件**:
- `src/features/Plan/components/PlanManager.tsx`

**提交**: `refactor(plan): 迁移 content 到 title.fullTitle (Contract Phase 5.1)`

---

#### Step 5.2: 迁移 isCompleted → checkType 推导
**查找**: `event.isCompleted`  
**替换**: 
```typescript
function isCompleted(event: Event): boolean {
  if (!event.checked || event.checked.length === 0) return false;
  if (!event.unchecked || event.unchecked.length === 0) return true;
  
  const lastChecked = event.checked[event.checked.length - 1];
  const lastUnchecked = event.unchecked[event.unchecked.length - 1];
  return lastChecked > lastUnchecked;
}
```

**提交**: `refactor(plan): 用 checked/unchecked 替换 isCompleted (Contract Phase 5.2)`

---

#### Step 5.3: 迁移 emoji 到 title.fullTitle
**文件**: `src/App.tsx`, `src/pages/Event/DetailTab.tsx`, `src/features/Event/components/EventEditModal/EventEditModalV2.tsx`

**当前使用**:
```typescript
// App.tsx L500, L879: Timer创建时设置emoji
emoji: existingEvent.emoji || eventEmoji,

// DetailTab.tsx L1603: 保存后更新全局Timer
emoji: updatedEvent.emoji,
```

**迁移方案**:
```typescript
// 1. 使用已有的 extractFirstEmoji() 函数
const emoji = extractFirstEmoji(event.title);

// 2. Timer创建时：emoji写入title.fullTitle的第一个text node
const titleNodes = [{
  type: 'paragraph',
  children: [{ text: `${emoji} ${eventTitle}` }]
}];

// 3. 读取emoji：从title.fullTitle提取
const eventEmoji = extractFirstEmoji(event.title) || '⏱️'; // fallback
```

**影响文件**（8个）:
- `src/App.tsx`: Timer创建逻辑（L500, L590, L879等）
- `src/pages/Event/DetailTab.tsx`: emoji显示和保存（L1603）
- `src/features/Event/components/EventEditModal/EventEditModalV2.tsx`: L1530
- `src/components/PlanSlate/PlanSlate.tsx`: L1111
- `src/features/Dashboard/components/UpcomingEventsPanel.tsx`: 显示逻辑

**测试**:
```bash
npm run test:unit -- extractFirstEmoji.test.ts
```

**提交**: `refactor(event): 迁移 emoji 到 title.fullTitle (Contract Phase 5.3a)`

---

#### Step 5.4: 迁移 color 到标签系统
**文件**: `src/types.ts`, `src/services/storage/SQLiteService.ts`

**当前使用**（4处）:
```typescript
// DetailTab.tsx L1604: 保存后更新
color: updatedEvent.color,

// UpcomingEventsPanel.tsx L172: 显示颜色
const tagColor = primaryTag?.color || event.color || '#6b7280';

// SQLiteService.ts L749, L1136: 数据库存储
event.color || null,
```

**迁移方案**:
```typescript
// 1. 从第一个标签读取颜色
const eventColor = event.tags?.[0] 
  ? tagManager.getTag(event.tags[0])?.color 
  : '#6b7280'; // 默认灰色

// 2. 或者从title的Slate节点读取color属性
const titleNodes = JSON.parse(event.title);
const colorMark = titleNodes[0]?.children?.[0]?.color;
```

**数据库迁移**:
```sql
-- 删除 events 表的 color 列
ALTER TABLE events DROP COLUMN color;
```

**影响文件**（4个）:
- `src/pages/Event/DetailTab.tsx`: L1604
- `src/features/Dashboard/components/UpcomingEventsPanel.tsx`: L172
- `src/services/storage/SQLiteService.ts`: L749, L1136
- `src/features/Event/components/EventEditModal/EventEditModalV2.tsx`: L1530

**提交**: `refactor(event): 迁移 color 到标签系统 (Contract Phase 5.4)`

---

#### Step 5.5: 删除 notes 字段
**文件**: `src/types.ts`

**当前使用**: 仅1处（App.tsx L515: `notes: existingEvent.notes`）

**迁移**: 已废弃，使用 `eventlog` 字段

**步骤**:
1. 删除 App.tsx L515 的 `notes` 写入
2. 删除 `src/types.ts` 的 `notes?: string` 定义

**提交**: `refactor(event): 删除废弃的 notes 字段 (Contract Phase 5.5)`

---

#### Step 5.6: 删除 mode 字段
**文件**: `src/types.ts`

**当前使用**: 4处（全部为FloatingToolbar内部状态）
```typescript
// types.ts L447: Event接口定义
mode?: 'title' | 'eventlog';

// FloatingToolbar/types.ts L99, TagPicker.tsx L17: UI组件状态
editorMode?: 'title' | 'eventlog';
```

**迁移**: mode 是 UI-only 状态，不应存储在 Event 中

**步骤**:
1. 删除 Event 接口的 `mode` 字段
2. FloatingToolbar 组件内部使用 `editorMode` 状态（已实现）

**提交**: `refactor(event): 删除 UI-only 的 mode 字段 (Contract Phase 5.6)`

---

### Phase 6: 添加 resolveTimelineAnchor 实现

#### Step 6.1: 实现时间轴锚点函数
**文件**: `src/utils/timelineAnchor.ts` (新建)

```typescript
/**
 * Timeline Anchor 锚点解析
 * Contract Section 5.2
 */

export type TimelineScope = 'timelog' | 'library' | 'plan' | 'search' | 'timecalendar';

export function resolveTimelineAnchor(event: Event, scope: TimelineScope): string {
  // 优先级 1：Calendar block
  if (event.startTime) return event.startTime;
  
  // 优先级 2：时间意图
  if (event.timeSpec?.resolved) return event.timeSpec.resolved;
  
  // 优先级 3：截止时间（library 跳过）
  if (event.dueDateTime && scope !== 'library') {
    return event.dueDateTime;
  }
  
  // fallback：创建时间
  return event.createdAt;
}
```

**提交**: `feat(utils): 实现 resolveTimelineAnchor 函数 (Contract Phase 6.1)`

---

#### Step 6.2: TimeLog 使用 Timeline Anchor
**文件**: `src/features/TimeLog/pages/TimeLogPage.tsx`

**替换排序逻辑**:
```typescript
// 修改前：
events.sort((a, b) => (a.startTime || a.createdAt).localeCompare(b.startTime || b.createdAt));

// 修改后：
events.sort((a, b) => 
  resolveTimelineAnchor(a, 'timelog').localeCompare(resolveTimelineAnchor(b, 'timelog'))
);
```

**提交**: `refactor(timelog): 使用 Timeline Anchor 排序 (Contract Phase 6.2)`

---

### Phase 7: 最终验证与文档更新

#### Step 7.1: EventHistory 忽略字段更新
**文件**: `src/utils/eventHistory.ts`

```typescript
const HISTORY_IGNORED_FIELDS = new Set<keyof Event>([
  'updatedAt',
  'localVersion',
  'lastSyncTime',
  'lastNonBlankAt',      // 新增
  'syncStatus',          // 新增
  'externalId',          // 新增
  'position',
  'bestSnapshot',        // 新增
  'fourDNoteSource',
  '_isTempId',
  '_originalTempId',
]);
```

**提交**: `refactor(history): 更新忽略字段清单 (Contract Phase 7.1)`

---

#### Step 7.2: 更新 README 和迁移文档
**文件**: `docs/refactor/MIGRATION_GUIDE_CONTRACT_v1.md`

记录：
- 删除的字段及替代方案
- source 字段迁移规则
- 破坏性变更清单
- 升级步骤

**提交**: `docs(refactor): 添加 Contract 迁移指南 (Contract Phase 7.2)`

---

## 📋 执行清单（Checklist）

### Phase 1: Legacy Flags 清理
- [ ] Step 1.1: 添加 facet 推导函数
- [ ] Step 1.2: 替换 Plan 页面判断
- [ ] Step 1.3: 替换 TimeCalendar 判断
- [ ] Step 1.4: 替换 EventService 判断
- [ ] Step 1.5: 替换 Sync 判断
- [ ] Step 1.6: 删除 types.ts 中的 flags

### Phase 2: source 字段扩展
- [ ] Step 2.1: 更新 source 类型定义
- [ ] Step 2.2: 数据迁移脚本
- [ ] Step 2.3: 更新创建逻辑

### Phase 3: AI 对话字段
- [ ] Step 3.1: 添加 AI 字段定义
- [ ] Step 3.2: 实现 AI 卡片服务

### Phase 4: Sync 字段清理
- [ ] Step 4.1: 删除 lastLocalChange
- [ ] Step 4.2: 删除 @deprecated 字段（syncedPlanEventId等）
- [ ] Step 4.3: 多日历同步迁移（⚠️ 需用户决策）
- [ ] Step 4.4: 同步配置统一（planSyncConfig → syncMode）

### Phase 5: Plan 字段清理
- [ ] Step 5.1: 迁移 content → title.fullTitle
- [ ] Step 5.2: 迁移 isCompleted → checkType推导
- [ ] Step 5.3: 迁移 emoji → title.fullTitle
- [ ] Step 5.4: 迁移 color → 标签系统
- [ ] Step 5.5: 删除 notes 字段
- [ ] Step 5.6: 删除 mode 字段

### Phase 6: Timeline Anchor
- [ ] Step 6.1: 实现 resolveTimelineAnchor
- [ ] Step 6.2: TimeLog 应用

### Phase 7: 验证
- [ ] Step 7.1: 更新 EventHistory 忽略字段
- [ ] Step 7.2: 更新文档

---

## ⚠️ 风险评估

### 高风险项
1. **删除 isPlan/isTask flags**: 影响面大，需要全局搜索替换
2. **source 字段迁移**: 需要数据库迁移，必须测试回滚方案
3. **🔴 CRITICAL - 多日历同步架构决策 (Phase 4.3)**: 
   - **影响**: 是否保留多日历同步功能
   - **Breaking Change**: 如果简化为单日历，已有多日历数据会丢失
   - **需要用户决策**: 保留数组 vs 简化为单字段
4. **planSyncConfig/actualSyncConfig 统一 (Phase 4.4)**: 
   - **影响**: 30+ 文件引用需要更新
   - **数据迁移**: 所有现有配置需要转换
   - **Breaking Change**: 旧代码依赖 PlanSyncConfig 接口

### 中风险项
1. **emoji/color 迁移 (Phase 5.3-5.4)**: 
   - **影响**: 8个文件，Timer/DetailTab 核心逻辑
   - **兼容性**: 需要保证现有emoji正确提取
   - **SQLite schema**: color字段需要删除列

### 低风险项
1. **添加 AI 字段**: 向后兼容，不影响现有功能
2. **Timeline Anchor**: 纯函数，易于测试
3. **删除 @deprecated 字段**: 已标记废弃，影响较小
4. **timerSessionId 保留**: 只读字段，无影响

---

## 🧪 测试策略

### 单元测试
- `eventFacets.test.ts`: facet 推导函数
- `timelineAnchor.test.ts`: 时间轴锚点
- `migrateSourceField.test.ts`: source 迁移逻辑

### 集成测试
- Plan 页面筛选
- TimeCalendar 显示逻辑
- Sync 路由判断

### E2E 测试
- 创建事件 → 检查 source
- Plan 页面 → 验证任务显示
- TimeLog → 验证排序正确

---

## 📅 预估时间

| Phase | 预估工时 | 依赖 | 备注 |
|-------|---------|------|------|
| Phase 1 | 8h | 无 | 清理Legacy Flags |
| Phase 2 | 4h | Phase 1 | source字段扩展 |
| Phase 3 | 3h | 无 | AI对话字段 |
| Phase 4 | 12h | Phase 2 | **重点**: 多日历同步+配置统一 |
| Phase 5 | 8h | Phase 1 | **细化**: emoji/color/notes/mode迁移 |
| Phase 6 | 2h | 无 | Timeline Anchor |
| Phase 7 | 2h | All | 验证和文档 |

**总计**: ~39 工时（约 5 个工作日）

**⚠️ Phase 4.3 需要用户决策**: 多日历同步是保留数组还是简化为单日历

---

## 📚 参考文档

- SSOT Contract: `docs/architecture/EVENT_FIELD_CONTRACT_EXECUTABLE_ARCHITECTURE.md`
- 当前 Types: `src/types.ts`
- EventService: `src/services/EventService.ts`
- Sync Manager: `src/services/sync/ActionBasedSyncManager.ts`
