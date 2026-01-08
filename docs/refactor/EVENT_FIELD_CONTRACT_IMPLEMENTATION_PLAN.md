# Event Field Contract 实施计划

> 基于 `docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md` (SSOT Contract)  
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

**✅ 已确认**: 用户选择选项 A - 保留数组，修改 Contract

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

**✅ 已确认**: 用户同意重建表删除 color 列

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

**硬契约（必须遵守）**：
- `source` 决定“渲染/入口/呈现形态”（例如 `local:ai_chat_card` vs `local:ai_inline`）。
- `conversationType` 决定“对话生命周期/升级逻辑”（例如 `sprout → root`）。
- 两者**互不替代**：禁止用 `source` 推断 `conversationType`，也禁止用 `conversationType` 覆盖/推断 `source`。

```typescript
// ❌ 缺失，需要添加
// conversationType = 对话阶段维度（sprout/root）
// 呈现形态（chat card / inline）使用 source 区分：local:ai_chat_card / local:ai_inline
conversationType?: 'sprout' | 'root' | 'unknown';
hostEventId?: string;                     // AI 卡片必须挂载的宿主事件
aiMetadata?: Record<string, unknown>;     // AI 元数据（实现侧可逐步收敛 schema）
```

---

## 🎯 实施 TODO（分步执行）

### Phase 1: 清理 Legacy 分类 Flags（高优先级）

#### Step 1.1: 添加 facet 推导工具函数 ✅
**文件**: `src/utils/eventFacets.ts` (新建)

**状态**: ✅ 已完成 (commit 166b798)

**提交**: `feat(utils): 添加 Event Facet 推导函数 (Contract Phase 1.1)`

---

#### Step 1.2: 替换 planManagerFilters.ts 的筛选逻辑
**文件**: `src/features/Plan/helpers/planManagerFilters.ts`

**影响范围**: 1个文件，3处修改
- L31: `event.isPlan === true` → `shouldShowInPlan(event)`
- L33: `event.isTimeCalendar === true` → `shouldShowInTimeCalendar(event)`

**测试**: 手动测试 Plan 页面筛选

**提交**: `refactor(plan): planManagerFilters 用 facet 推导替换 flags (Phase 1.2)`

---

#### Step 1.3: 替换 PlanManager.tsx 的分类判断（分批处理）

**Step 1.3a: 移除创建事件时的 isPlan/isTimeCalendar 赋值**
**文件**: `src/features/Plan/components/PlanManager.tsx`

**影响范围**: 4处修改
- L1476: 删除 `isPlan: true`
- L1478: 删除 `isTimeCalendar: false`
- L2318: 删除 `isPlan: true`
- L2320: 删除 `isTimeCalendar: false`
- L2724: 删除 `isPlan: true`
- L2726: 删除 `isTimeCalendar: false`

**测试**: 手动测试创建事件

**提交**: `refactor(plan): 移除 PlanManager 创建事件的 flag 赋值 (Phase 1.3a)`

---

**Step 1.3b: 替换 PlanManager.tsx 的筛选判断**
**文件**: `src/features/Plan/components/PlanManager.tsx`

**影响范围**: 5处修改
- L311: `isPlan: e.isPlan` → 删除（使用 facet 推导）
- L469: `e.isPlan && !e.checkType` → `shouldShowInPlan(e) && !e.checkType`
- L625: `event.isPlan === true` → `shouldShowInPlan(event)`
- L627: `event.isTimeCalendar === true` → `shouldShowInTimeCalendar(event)`
- L668: `event.isTimeCalendar && isExpired` → `shouldShowInTimeCalendar(event) && isExpired`
- L669: `event.isPlan === true || ...` → `shouldShowInPlan(event) || ...`
- L702: `isPlan: updatedEvent.isPlan` → 删除
- L704: `isTimeCalendar: updatedEvent.isTimeCalendar` → 删除

**测试**: 手动测试 Plan 页面完整流程

**提交**: `refactor(plan): PlanManager 筛选逻辑用 facet 推导 (Phase 1.3b)`

---

#### Step 1.4: 替换 App.tsx 的分类判断
**文件**: `src/App.tsx`

**影响范围**: 4处修改
- L505: 删除 `isTimeCalendar: true`（Timer创建逻辑）
- L902: `existingEvent?.isPlan ? {...}` → 使用 facet 判断
- L913: `isPlan: existingEvent?.isPlan` → 删除
- L1404: `isPlan: true` → 删除

**测试**: 手动测试 Timer 创建和更新

**提交**: `refactor(app): App.tsx 移除分类 flags (Phase 1.4)`

---

#### Step 1.5: 替换其他页面的分类判断
**文件**: 
- `src/pages/Event/DetailTab.tsx`
- `src/features/Event/components/EventEditModal/EventEditModalV2.tsx`
- `src/features/TimeLog/pages/TimeLogPage.tsx`
- `src/features/Dashboard/components/UpcomingEventsPanel.tsx`

**影响范围**: 
- DetailTab.tsx: 3处 (L1762, L1767)
- EventEditModalV2.tsx: 2处 (L1688, L1693)
- TimeLogPage.tsx: 2处 (L1061, L1970, L1971)
- UpcomingEventsPanel.tsx: 1处 (L74)

**策略**: 
- `evt.isPlan` → `shouldShowInPlan(evt)`
- `evt.isTimeCalendar` → `shouldShowInTimeCalendar(evt)`
- 删除创建时赋值的 `isPlan/isTimeCalendar`

**测试**: 各页面手动测试

**提交**: `refactor(pages): 各页面移除 isPlan/isTimeCalendar flags (Phase 1.5)`

---

#### Step 1.6: 替换 Service 层的分类判断
**文件**: 
- `src/services/EventService.ts`
- `src/services/MicrosoftCalendarService.ts`
- `src/services/search/UnifiedSearchIndex.ts`

**影响范围**: 
- EventService.ts: 1处 (L3453)
- MicrosoftCalendarService.ts: 2处 (L1592, L1817) - 删除 `isTimeCalendar: true`
- UnifiedSearchIndex.ts: 1处 (L602) - 用 facet 判断

**测试**: 测试同步功能

**提交**: `refactor(services): Service 层移除分类 flags (Phase 1.6)`

---

#### Step 1.7: 从 types.ts 删除分类 flags（最后一步）
**文件**: `src/types.ts`

**删除字段（本阶段已完成）**:
```typescript
// ❌ 已删除以下字段（Legacy 分类 flags）：
isTask?: boolean;
isPlan?: boolean;
isTimeCalendar?: boolean;
```

**说明**: 以上字段属于 Legacy 分类 flags，按 SSOT Contract 必须删除；后续所有语义判断必须改为 facet 推导（主要基于 `checkType !== 'none'`）。

**待评估（仍存在于类型/代码中）**:
- `isTimer/isTimeLog/isOutsideApp/isDeadline/isNote`：如果这些字段继续作为“系统轨迹/子事件”判定标记，需要在 Contract/Plan 中明确其 Owner、适用范围与是否允许长期保留；否则应纳入后续清理。
- `type/category`：目前仍有向后兼容/历史代码依赖，若要严格落地 Contract，需要配套迁移与逐步收敛策略。

**✅ 已明确（写入 SSOT）**：系统轨迹/附属事件（subordinate）的判定口径
- **唯一判定入口**：`EventService.isSubordinateEvent(event)`（或 `isSystemProgressSubEvent`）
- **规则顺序（必须一致）**：
  1) `timerSessionId` 存在 → subordinate（Timer 系统写入审计字段，最强信号）
  2) `source === 'local:timelog'` → subordinate（TimeLog/Timer/OutsideApp 统一归入 timelog 入口）
- **禁止**：用 `parentEventId` 推断 subordinate（结构关系≠创建者）
- **Legacy flags（仅兼容输入）**：`isTimer/isTimeLog/isOutsideApp` 必须清理掉（停止依赖 → 迁移/回填 → 从 types/storage/mapping 删除）

**✅ 2026-01-08 实施记录（已完成）**
- **UI**：停止读取/写入 `event.isTimer`，改为只读派生：`event.id.startsWith('timer-') || isSystemProgressSubEvent(event)`
  - 影响文件：`src/features/Event/components/EventEditModal/hooks/useEventEditDraft.ts`、`src/features/Event/components/EventEditModal/EventEditModalV2.tsx`、`src/pages/Event/DetailTab.tsx`
- **Service**：停止依赖 `isTimer/isTimeLog/isOutsideApp` 做语义判断
  - `getTimelineEvents` 等过滤逻辑改用 SSOT（timer id 前缀 / `isSystemProgressSubEvent`）
  - `normalizeEvent`：不再写回 `isTimer`；本地 source 推断以 SSOT 为主，并允许 legacy flags 仅作为“输入兼容 hint”（read-only）
  - 同步保护字段：从 `localOnlyFields` 中移除 `isTimer/isTimeLog/isOutsideApp`
- **Types**：从 `src/types.ts` 的 `Event` 接口移除 `isTimer/isTimeLog/isOutsideApp`（仅保留注释说明 SSOT 替代口径）
- **Storage(SQLite)**：停止持久化 `is_timer`
  - 写入：`SQLiteService.createEvent/batchCreateEvents/updateEvent` 不再写 `is_timer`
  - 读取：`rowToEvent` 做 **读时升级**：`is_timer=1` → `source='local:timelog'`（不再返回 `isTimer` 字段）
- **Sync mapping**：`src/utils/outlookFieldMapping.ts` 的 `INTERNAL_ONLY_FIELDS` 移除 `isTimer`

**验证**：`npm run build` + `vitest --run`（13 files / 100 tests passed）

**测试**:
```bash
# 全局编译检查
npm run build
```

**提交**: `refactor(types): 删除废弃的分类 flags (Phase 1.7)`

---

#### Step 1.8: 清理 isTask 依赖（用 facet 推导替换）

**目标**: 彻底移除所有 `event.isTask` 的读/写依赖；UI/Service/Sync 路由均改为使用 `hasTaskFacet(event)` 或 `checkType !== 'none'`。

**替代口径**:
- Task facet: `hasTaskFacet(event)`（底层基于 `checkType !== 'none'`）
- “Task toggle”的持久化：写 `checkType`（例如 `'none'` vs `'once'`），禁止写 `isTask`

**影响范围（已覆盖的主要模块）**:
- `src/utils/syncRouter.ts`：sync target 判定
- `src/utils/eventValidation.ts` / `src/utils/calendarUtils.ts` / `src/utils/TimeResolver.ts`：时间/日历相关的 task 语义判断
- `src/services/sync/ActionBasedSyncManager.ts` / `src/services/EventService.ts` / `src/services/EventHistoryService.ts`
- `src/pages/Event/DetailTab.tsx`、`src/features/Event/components/EventEditModal/*`、`src/features/Calendar/TimeCalendar.tsx`
- `src/components/PlanSlate/PlanSlate.tsx`、`src/features/Plan/components/PlanManager.tsx`、`src/features/TimeLog/pages/TimeLogPage.tsx`

**测试**:
```bash
npm run build
```

**提交**: （待提交）

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
  // conversationType = 对话阶段维度（sprout/root）
  // 呈现形态（chat card / inline）使用 source 区分：local:ai_chat_card / local:ai_inline
  conversationType?: 'sprout' | 'root' | 'unknown';
  hostEventId?: string;                     // AI 卡片必须挂载的宿主事件
  aiMetadata?: Record<string, unknown>;     // AI 元数据（实现侧可逐步收敛 schema）
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

#### Step 4.3: 多日历同步迁移（syncedPlanCalendars/syncedActualCalendars → externalMappings）
**当前架构**:
```typescript
syncedPlanCalendars: Array<{ calendarId: string, remoteEventId: string }>
syncedActualCalendars: Array<{ calendarId: string, remoteEventId: string }>
```

**目标架构**（Contract Section 7.2 + 决策点 1 已确认）:
```typescript
externalMappings: Array<{ calendarId: string; remoteEventId: string; scope?: 'plan' | 'actual' }>
calendarIds: string[]  // 该事件「期望」同步到的日历ID（意图层）
syncMode: string       // 该事件的同步模式（意图层）
externalId?: string    // ⚠️ legacy/兼容字段：可作为 primary mapping 的冗余缓存，但不作为多日历 SSOT
```

**⚠️ 重大决策点 - 需要用户确认**:

**方案A: 保留多日历数组（推荐）**  
- **理由**: 本地1个event → 远程N个event的映射关系必须保存
- **场景**: 用户将同一事件同步到"工作日历"和"个人日历"
- **数据**: `syncedPlanCalendars: [{calendarId: 'work', remoteEventId: 'event-1'}, {calendarId: 'personal', remoteEventId: 'event-2'}]`
- **问题（历史原因）**: 旧实现常依赖单个 `externalId`，无法表达多日历 remoteEventId；因此需要引入 `externalMappings`
- **影响**: 如果删除，多日历同步功能将失效

**方案B: 简化为单日历同步**  
- **修改**: 限制每个event只能同步到1个日历
- **迁移**: 保留第一个日历的remoteEventId → externalId
- **数据丢失**: 其他日历的远程事件变成孤儿（无法更新/删除）
- **Breaking Change**: 用户需要手动删除远程重复事件

**✅ 已确认方案**: 保留 `syncedPlanCalendars/syncedActualCalendars`，重命名为 `externalMappings: Array<{calendarId, remoteEventId}>` 以符合Contract术语

---

### ✅ SSOT：未来同步字段归属（字段所有权）

这段是“未来状态”的硬契约：后续重构与新功能只能依赖这里定义的数据来源。

#### 1) 意图层（User Intent / Configuration）—— SSOT
- `syncMode`: 用户希望该事件如何同步（receive-only/send-only/...）。
- `calendarIds`: 用户希望该事件同步到哪些日历（可为空数组）。
- `todoListIds`: 用户希望该事件同步到哪些 Microsoft To Do 列表（可为空数组）。
  - 这是“任务同步目标”的选择结果（面向 To Do）。
  - 与 `calendarIds` 互补：Task-like 事件通常走 To Do 路径；Calendar-like 事件走 Calendar 路径。
- `subEventConfig`: **仅父事件**的“系统性子事件（Timer/轨迹/实际进展链路）的默认同步配置模板”。
  - 只约束“系统性子事件”（例如 Timer 子事件）；不约束用户结构性创建的普通子事件。
  - 普通子事件的默认继承来源是父事件自身的 `syncMode/calendarIds`（也就是“计划安排”），而不是 `subEventConfig`。
  - 普通子事件允许用户自由配置：子事件的同步设置**不回写父事件**；父事件的更新也不应覆盖已手动配置（`hasCustomSyncConfig=true`）的后代。

#### 2) 状态层（Sync State / Remote Identity）—— SSOT
- `externalMappings`: 远程对象身份的唯一来源。
  - 用途：决定 `UPDATE` vs `CREATE`、以及“移除日历时要清理哪个 remoteEventId”。
  - 允许短暂与 `calendarIds` 不一致（同步进行中），但最终应收敛。

#### 3) 兼容层（Legacy）—— 非 SSOT
- `externalId`: 仅做兼容/过渡。
  - 建议：把它视为 `externalMappings` 的 primary mapping 冗余（可选），避免旧代码断裂。
- `syncedPlanCalendars/syncedActualCalendars`、`synced*EventId`、`planSyncConfig/actualSyncConfig`: 只允许读兼容与一次性迁移，最终删除。

---

### ✅ SSOT：未来同步数据流（Data Flow）

**写入（用户修改同步设置）**
1. UI 只写 `syncMode/calendarIds`（父事件额外写 `subEventConfig` 作为模板）。
2. `EventService` 负责 normalize 并持久化这些“意图层字段”。
3. `externalMappings` 不由 UI 直接写入，只能由 Sync 成功回写。

**调和（SyncManager 对账）**
1. 计算目标集合：`calendarIds`。
2. 读取已实现集合：`externalMappings`。
3. 差分：
   - 目标有、mapping 无 → `CREATE`（成功后写回 mapping）。
   - mapping 有、内容变更 → `UPDATE`。
   - mapping 有、目标无 → 清理分支：
     - 仅当满足“owned-by-4DNote + 非 receive-only”才允许 `DELETE`；否则只移除 mapping。

**回写（远程结果写回本地）**
- CREATE：写入/更新 `externalMappings[{calendarId, remoteEventId}]`。
- UPDATE：不改 mapping（remote id 不应变化）。
- DELETE：移除对应 mapping。

**📋 调用链路分析**:

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

**⚠️ 安全风险与防护措施**:

**风险点**：移除日历时误删外部数据
- **场景**: 用户订阅了老板的日历（receive-only），然后取消订阅
- **错误行为**: 删除老板日历中的远程事件 ❌
- **正确行为**: 只移除本地映射，不删除远程事件 ✅

**防护措施**:
```typescript
// Phase 4.3 实现时必须包含的安全检查
function shouldDeleteRemoteEvent(event: Event, calendarId: string): boolean {
  // 规则 1: 外部同步事件，永远不删除远程
  if (event.source?.startsWith('outlook:') || 
      event.source?.startsWith('google:') ||
      event.source?.startsWith('icloud:')) {
    return false; // 🛡️ 保护外部数据
  }
  
  // 规则 2: receive-only 模式，永远不删除远程
  if (event.syncMode === 'receive-only') {
    return false; // 🛡️ 保护只读订阅
  }
  
  // 规则 3: 本地创建 + 有推送权限 = 可以删除
  return event.source?.startsWith('local:') && 
         (event.syncMode === 'send-only' ||
          event.syncMode === 'bidirectional' ||
          event.syncMode === 'send-only-private' ||
          event.syncMode === 'bidirectional-private');
}
```

**测试用例**（Phase 4.3 必须通过）:
- ✅ 本地事件 + bidirectional → 移除日历应删除远程
- ❌ Outlook事件 + receive-only → 移除日历不删除远程
- ❌ 本地事件 + receive-only → 移除日历不删除远程（可能是订阅了自己发布的日历）

**提交**: `refactor(sync): 重命名多日历映射字段为 externalMappings (Contract Phase 4.3)`

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

**✅ 已确认方案**: SQLite 表重建删除 color 列

**数据库迁移** (SQLite 不支持 DROP COLUMN，需重建表):
```typescript
// src/services/storage/SQLiteService.ts - runMigrations()
async rebuildEventsTableWithoutColor(): Promise<void> {
  // 1. 创建新表 (无 color 列)
  await this.db.exec(`
    CREATE TABLE events_new (
      id TEXT PRIMARY KEY,
      full_title TEXT,
      color_title TEXT,
      simple_title TEXT NOT NULL,
      -- ... 其他列 (无 color)
    );
  `);
  
  // 2. 复制数据 (排除 color)
  await this.db.exec(`
    INSERT INTO events_new 
    SELECT id, full_title, color_title, simple_title, ...
    FROM events;
  `);
  
  // 3. 删除旧表
  await this.db.exec('DROP TABLE events;');
  
  // 4. 重命名新表
  await this.db.exec('ALTER TABLE events_new RENAME TO events;');
  
  // 5. 重建索引
  await this.createIndexes();
}
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

### Phase 1: Legacy Flags 清理（细化版）
- [x] Step 1.1: 添加 facet 推导函数 ✅ commit 166b798
- [x] Step 1.2: planManagerFilters.ts 筛选逻辑 ✅ commit 6ae3eae
- [x] Step 1.3a: PlanManager 移除创建时 flag 赋值 ✅ commit 6af1770
- [x] Step 1.3b: PlanManager 筛选逻辑用 facet ✅ commit 04c2198
- [x] Step 1.4: App.tsx 移除分类 flags ✅ commit 5d85705
- [x] Step 1.5: 各页面移除 isPlan/isTimeCalendar ✅ commit 7061baa
- [x] Step 1.6: Service 层移除分类 flags ✅ commit b7e344f
- [x] Step 1.7: types.ts 删除 flags（包含 isTask）✅ commit 26a6395
- [ ] Step 1.8: 清理 isTask 依赖（用 facet 推导替换）（已完成，待提交）

---

## ✅ 审阅意见（Phase 1.1–1.8）

1) **与 SSOT Contract 的一致性**
- Contract 明确要求：分类/角色/视图纳入不得依赖 `isXxx`（包含 `isTask/isPlan/isTimeCalendar`），必须改用 `source + facet`（Task facet 以 `checkType !== 'none'` 为准）。
- 本计划中 Step 1.7 原先的“isTask 暂时保留”与 Contract 冲突；现已按 Contract 口径更正，并补充 Step 1.8 作为系统性清理步骤。

2) **行为等价性（Task vs Calendar）**
- 现有实现将“是否任务”的语义锚定到 `checkType`，并通过 `hasTaskFacet(event)` 派生；这符合 Contract 的 canonical/derived 分离。
- UI 侧若存在“任务开关”能力，必须通过写 `checkType` 表达（例如 `'none'` ↔ `'once'`），不得再写回 `isTask`。

3) **风险点（建议补充在后续步骤/迁移中显式处理）**
- **历史数据兼容风险**：若存量数据存在 `isTask=true` 但 `checkType='none'`（或缺失），“删除 isTask”会导致任务语义丢失。Contract 文档中已给出把 `isTask=true` 的事件补齐 `checkType` 的迁移示例；建议在后续增加一次性 migration/repair 路径（仅 migration 写入，正常业务路径禁止回写派生）。
- **计划文档一致性**：Phase 2.2 的 source 迁移示例仍引用 `event.isPlan/isTimeCalendar/isTimeLog/isNote`，而 Phase 1 已删除这些 flags；建议在执行 Phase 2 前先更新该迁移示例为“基于 source 现状 + facet/其它 SSOT 字段推导”。
- **遗留字段范围不一致**：本计划开头将多个 `isXxx` 与 `type/category` 视为“必须删除”；但当前 Phase 1 实际只完成了 `isTask/isPlan/isTimeCalendar` 的清理。建议后续把“允许长期保留的系统轨迹字段”和“必须迁移删除的 legacy 字段”分组写清楚，避免执行口径歧义。

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
- [ ] Step 4.3: 多日历同步迁移（✅ 已确认：保留数组，重命名为 externalMappings）
- [ ] Step 4.4: 同步配置统一（planSyncConfig → syncMode）

### Phase 5: Plan 字段清理
- [ ] Step 5.1: 迁移 content → title.fullTitle
- [ ] Step 5.2: 迁移 isCompleted → checkType推导
- [ ] Step 5.3: 迁移 emoji → title.fullTitle
- [ ] Step 5.4: 迁移 color → 标签系统（✅ 已确认：SQLite 表重建）
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

## 📅 预估时间（更新版）

| Phase | 预估工时 | 依赖 | 备注 |
|-------|---------|------|------|
| Phase 1.1 | ✅ 1h | 无 | ✅ 已完成：facet 推导函数 |
| Phase 1.2-1.7 | 12h | Phase 1.1 | **细化**：分批替换 20+ 文件，每批测试 |
| Phase 2 | 4h | Phase 1 | source字段扩展 |
| Phase 3 | 3h | 无 | AI对话字段 |
| Phase 4 | 12h | Phase 2 | **重点**: 多日历同步+配置统一 |
| Phase 5 | 8h | Phase 1 | **细化**: emoji/color/notes/mode迁移 |
| Phase 6 | 2h | 无 | Timeline Anchor |
| Phase 7 | 2h | All | 验证和文档 |

**总计**: ~44 工时（约 5.5 个工作日）

**⚠️ 风险提示**:
- Phase 1 影响 27 个文件，分 7 个小步骤逐步替换
- 每个小步骤完成后立即提交，确保可回滚
- Phase 4.3/5.4 需要数据库迁移，预留测试时间

---

## 📚 参考文档

- SSOT Contract: `docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md`
- 当前 Types: `src/types.ts`
- EventService: `src/services/EventService.ts`
- Sync Manager: `src/services/sync/ActionBasedSyncManager.ts`
