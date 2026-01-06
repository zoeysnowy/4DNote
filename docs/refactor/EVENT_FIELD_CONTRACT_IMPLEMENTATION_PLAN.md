# Event Field Contract 实施计划

> 基于 `docs/architecture/EVENT_FIELD_CONTRACT_EXECUTABLE_ARCHITECTURE.md` (SSOT Contract)  
> 当前实际架构：`src/types.ts` Event interface  
> 目标：小步迭代，每步可测试可提交

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
emoji?: string;        // 迁移到其他系统（UI-only）
color?: string;        // 迁移到其他系统（UI-only）
notes?: string;        // 已废弃，使用 eventlog
isCompleted?: boolean; // 替换为 checkType + checked 推导
mode?: 'title' | 'eventlog'; // UI-only，不应在 Event
```

#### 4. 废弃的 Sync 字段
```typescript
// ❌ 必须删除
lastLocalChange?: string;          // 使用 updatedAt
timerSessionId?: string;           // 不应在 Event（Timer 自己管理）
subEventConfig?: { ... };          // 复杂，待评估
hasCustomSyncConfig?: boolean;     // 待评估
syncedPlanCalendars?: Array<...>;  // 待评估
syncedActualCalendars?: Array<...>; // 待评估
syncedPlanEventId?: string | null;  // @deprecated
syncedActualEventId?: string | null; // @deprecated
syncedOutlookEventId?: string | null; // @deprecated
planSyncConfig?: PlanSyncConfig;    // 待评估
actualSyncConfig?: ActualSyncConfig; // 待评估
```

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

#### Step 4.1: 评估 syncMode 统一
**当前**: `syncMode`, `planSyncConfig.mode`, `actualSyncConfig.mode`  
**Contract**: 只保留 `syncMode`

**调研文件**:
- `src/services/sync/ActionBasedSyncManager.ts`
- `src/features/EventEditModal/components/SyncTargetPicker.tsx`

**决策**: 待评估（可能需要 Breaking Change）

---

#### Step 4.2: 删除 @deprecated 字段
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

#### Step 5.3: 删除 emoji, color, notes, mode
**文件**: `src/types.ts`

```typescript
// ❌ 删除以下字段：
emoji?: string;
color?: string;
notes?: string;
mode?: 'title' | 'eventlog';
```

**迁移**: emoji/color 移到 UI state 或 tag 系统

**提交**: `refactor(plan): 删除废弃的 Plan UI 字段 (Contract Phase 5.3)`

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
- [ ] Step 4.1: 评估 syncMode 统一
- [ ] Step 4.2: 删除 @deprecated 字段

### Phase 5: Plan 字段清理
- [ ] Step 5.1: 迁移 content
- [ ] Step 5.2: 迁移 isCompleted
- [ ] Step 5.3: 删除 emoji/color/notes/mode

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
3. **syncMode 统一**: 可能需要 Breaking Change

### 低风险项
1. **添加 AI 字段**: 向后兼容，不影响现有功能
2. **Timeline Anchor**: 纯函数，易于测试
3. **删除 @deprecated 字段**: 已标记废弃，影响较小

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

| Phase | 预估工时 | 依赖 |
|-------|---------|------|
| Phase 1 | 8h | 无 |
| Phase 2 | 4h | Phase 1 |
| Phase 3 | 3h | 无 |
| Phase 4 | 6h | Phase 2 |
| Phase 5 | 3h | Phase 1 |
| Phase 6 | 2h | 无 |
| Phase 7 | 2h | All |

**总计**: ~28 工时（约 3.5 个工作日）

---

## 📚 参考文档

- SSOT Contract: `docs/architecture/EVENT_FIELD_CONTRACT_EXECUTABLE_ARCHITECTURE.md`
- 当前 Types: `src/types.ts`
- EventService: `src/services/EventService.ts`
- Sync Manager: `src/services/sync/ActionBasedSyncManager.ts`
