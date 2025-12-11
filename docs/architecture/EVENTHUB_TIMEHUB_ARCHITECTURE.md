# EventHub & TimeHub 统一架构文档

> **文档版本**: v2.17  
> **创建时间**: 2025-11-06  
> **最后更新**: 2025-12-09  
> **关联模块**: EventHub, TimeHub, EventService, EventHistoryService, TimeParsingService, PlanManager, UpcomingEventsPanel, EventEditModal V2, ActionBasedSyncManager, syncRouter  
> **文档类型**: 核心架构文档
> **新增关联**: EventTitle 三层架构、EventHistoryService 时间快照查询、Snapshot 功能优化、checkType 与 checkbox 关联、父-子事件单一配置架构（subEventConfig）、**syncMode 同步控制（已实现）**、**EventService 生命周期管理（HMR 修复）**、**null 时间字段支持与 createdAt fallback（v2.15.3）**、**EventTree 统一字段架构（v2.16）**、**TitleSlate IME 优化（v2.17）**、**SyncMode 历史数据迁移（v2.17）**

---

## 🔧 v2.17 TitleSlate IME 优化 & SyncMode 历史数据迁移 (2025-12-09)

### 核心变更

#### 1. TitleSlate 中文 IME 输入优化 ✅

**背景**: 用户反馈中文输入法（IME）使用时出现光标偏移 -3 字符、失焦等问题  
**根本原因**: `renderLeaf` 中的 emoji 过滤逻辑修改了 `leaf.text`，破坏了 Slate 的 DOM ↔ AST 映射关系  
**解决方案**: 将 emoji 过滤逻辑从渲染层移至数据层，保证 Slate 内部状态一致性

**架构修复**:

```typescript
// ❌ 旧代码 - 在 renderLeaf 中修改 leaf.text（破坏 Slate 映射）
const renderLeaf = useCallback((props: RenderLeafProps) => {
  let text = props.leaf.text;
  // 🔥 问题：修改 leaf.text 导致 DOM 与 AST 不一致
  text = text.replace(/emoji_regex/g, ''); 
  return <span {...props.attributes}>{text}</span>;
}, []);

// ✅ 新代码 - 在数据层过滤 emoji（不影响 Slate 内部状态）
const titleContent = useMemo(() => {
  if (!value || value.length === 0) return value;
  
  const emojiRegex = /^(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])+\s*/u;
  
  return value.map(node => {
    if (node.type === 'paragraph' && node.children) {
      return {
        ...node,
        children: node.children.map((child: any) => {
          if (child.text) {
            return { ...child, text: child.text.replace(emojiRegex, '') };
          }
          return child;
        })
      };
    }
    return node;
  });
}, [value]);

// renderLeaf 不再修改文本
const renderLeaf = useCallback((props: RenderLeafProps) => {
  return <span {...props.attributes}>{props.children}</span>;
}, []);
```

**Emoji 正则升级**:
```typescript
// 🆕 完整 Unicode 范围，覆盖所有 emoji（包括 🐙、🎉、❤️ 等）
const emojiRegex = /^(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])+\s*/u;
```

**关键改进**:
- ✅ **IME 兼容**: 输入法期间不修改 DOM，光标位置稳定
- ✅ **数据层处理**: emoji 过滤在 `useMemo` 中完成，不影响 Slate 内部状态
- ✅ **完整 Emoji 支持**: 正则覆盖所有 Unicode emoji 范围
- ✅ **用户体验提升**: 中文输入流畅无卡顿，光标不会跳动或偏移

**与 EventTitle 架构集成**:
- TitleSlate 编辑器内部使用 Slate JSON 格式（对应 `fullTitle`）
- 失焦保存时转换为 `simpleTitle` 字符串，传递给 EventService
- EventService.normalizeTitle() 自动生成 `colorTitle` 和 `fullTitle`
- 详见下文 [8.1.1 EventTitle 三层架构](#811-eventtitle-三层架构v214)

#### 2. SyncMode 历史数据迁移 & 架构修复 ✅

**背景**: 用户修改 Outlook 事件标题后，远程同步时本地修改被覆盖  
**根本原因**: 
1. 旧代码将 Outlook 事件默认设为 `syncMode: 'receive-only'`（只接收远程更新）
2. `convertRemoteEventToLocal` 创建事件时未设置 `syncMode` 字段（`undefined`）
3. EventService 读取 `undefined`，ActionBasedSyncManager 使用 fallback 逻辑默认 `receive-only`
4. 本地修改无法推送到远程，远程同步时覆盖本地标题

**解决方案**:

1. **新事件默认值修复** (ActionBasedSyncManager.ts Line 4689):
```typescript
// ✅ 所有 Outlook 事件默认 bidirectional-private（用户可修改）
const partialEvent = {
  // ...其他字段
  syncMode: 'bidirectional-private'  // 🔥 关键修复：明确设置默认值
};
```

2. **运行时自动升级** (ActionBasedSyncManager.ts Line 2360):
```typescript
// 🔧 同步时检测并自动升级旧事件
if (localEvent.syncMode === 'receive-only' || !localEvent.syncMode) {
  console.log(`🔧 [Migration] 自动升级 syncMode: ${localEvent.id} receive-only → bidirectional-private`);
  await storageManager.updateEvent(localEvent.id, {
    syncMode: 'bidirectional-private'
  });
  localEvent.syncMode = 'bidirectional-private';
}

// 读取 syncMode（使用升级后的值）
const syncMode = localEvent.syncMode || 'bidirectional-private';
```

3. **批量迁移脚本** (scripts/fix-outlook-syncmode.js):
```javascript
// 一次性修复所有历史事件
(async function fixOutlookSyncMode() {
  const storageManager = window.storageManagerInstance;
  const result = await storageManager.queryEvents({ filters: {}, limit: 10000 });
  
  const outlookEvents = result.items.filter(e => 
    e.id.startsWith('outlook-') || 
    e.source === 'outlook' ||
    e.calendarIds?.some(cid => cid.startsWith('outlook-'))
  );
  
  const needsFixEvents = outlookEvents.filter(e => 
    e.syncMode !== 'bidirectional-private'
  );
  
  // 批量更新：43 个事件从 receive-only → bidirectional-private
  for (const event of needsFixEvents) {
    await storageManager.updateEvent(event.id, {
      syncMode: 'bidirectional-private'
    });
  }
})();
```

**迁移结果**:
- ✅ **1083 个 Outlook 事件**: 全部统一为 `bidirectional-private` 模式
- ✅ **本地修改保留**: 用户修改标题后不再被远程覆盖
- ✅ **双向同步**: 本地修改推送到 Outlook，远程修改也同步到本地

**syncMode 架构完整性**:
```typescript
// Event 接口
interface Event {
  syncMode?: 'receive-only' | 'send-only' | 'bidirectional' | 'bidirectional-private' | 'send-only-private';
}

// 同步控制逻辑
// 1. syncRouter.ts - 阻止 receive-only 事件推送到远程
if (event.syncMode === 'receive-only') {
  return null; // 不推送
}

// 2. ActionBasedSyncManager.ts - 阻止 send-only 事件接收远程更新
if (event.syncMode === 'send-only' && titleChanged) {
  updates.title = undefined; // 不更新本地标题
}

// 3. EventEditModalV2.tsx - syncMode 修改后立即保存
const handleSyncModeChange = useCallback(async (newMode: string) => {
  setFormData(prev => ({ ...prev, syncMode: newMode }));
  
  // 🔥 立即保存到数据库，防止状态不一致
  await EventService.updateEvent(event.id, {
    syncMode: newMode
  });
}, [event.id]);
```

**关键改进**:
- ✅ **架构修复**: 所有 Outlook 事件创建时明确设置 syncMode
- ✅ **自动迁移**: 运行时检测并自动升级旧事件，无需手动操作
- ✅ **批量工具**: 提供迁移脚本快速修复历史数据
- ✅ **即时保存**: UI 修改 syncMode 后立即持久化，防止状态不一致
- ✅ **用户控制**: 默认双向同步，用户可根据需要修改为其他模式

---

## 🌳 v2.16 EventTree 统一字段架构 (2025-12-01)

### 核心变更

**背景**: 旧架构使用 `timerLogs` 字段存储 Timer 子事件，未来扩展需要 `userSubTaskIds`、`outsideAppEventIds` 等多个字段，导致字段碎片化  
**解决方案**: 统一使用 `childEventIds` 字段管理所有类型的子事件，通过类型标记（`isTimer`、`isPlan`、`isOutsideApp` 等）区分  
**状态**: ✅ 已完成实现，包含自动维护逻辑、辅助查询方法、数据迁移脚本

### 架构改进

#### 1. 统一字段结构

```typescript
interface Event {
  // 🔗 父子关联（统一字段）
  parentEventId?: string;      // 指向父事件 ID
  childEventIds?: string[];    // 所有子事件 ID（不区分类型）
  
  // 🏷️ 事件类型标记（用于过滤和显示逻辑）
  isTimer?: boolean;           // Timer 计时记录（附属事件）
  isTimeLog?: boolean;         // 时间日志（附属事件）
  isOutsideApp?: boolean;      // 外部应用同步事件（附属事件）
  isPlan?: boolean;            // 用户计划事件
  isTask?: boolean;            // 任务类型
}
```

**旧字段废弃**:
- ❌ `timerLogs?: string[]` - 已迁移到 `childEventIds`
- ❌ `userSubTaskIds?: string[]` - 从未实现，直接使用 `childEventIds`
- ❌ `outsideAppEventIds?: string[]` - 从未实现，直接使用 `childEventIds`

#### 2. 自动维护双向关联

**EventService 自动维护逻辑**:

```typescript
// createEvent: 创建子事件时自动更新父事件
if (finalEvent.parentEventId) {
  const parent = existingEvents.find(e => e.id === finalEvent.parentEventId);
  if (parent) {
    if (!parent.childEventIds) parent.childEventIds = [];
    if (!parent.childEventIds.includes(finalEvent.id)) {
      parent.childEventIds.push(finalEvent.id);
    }
  }
}

// updateEvent: 检测 parentEventId 变化，同步更新双向关联
if (updates.parentEventId !== oldEvent.parentEventId) {
  // 从旧父事件移除
  if (oldEvent.parentEventId) {
    oldParent.childEventIds = oldParent.childEventIds.filter(id => id !== eventId);
  }
  // 添加到新父事件
  if (updates.parentEventId) {
    newParent.childEventIds.push(eventId);
  }
}

// deleteEvent: 清理父子关联
if (event.parentEventId) {
  parent.childEventIds = parent.childEventIds.filter(id => id !== eventId);
}
// 删除父事件时清理所有子事件的 parentEventId
if (event.childEventIds) {
  event.childEventIds.forEach(childId => {
    delete getEventById(childId).parentEventId;
  });
}
```

#### 3. 辅助查询方法

**EventService 新增方法**:

```typescript
// 类型判断
EventService.getEventType(event)           // 返回类型描述字符串
EventService.isSubordinateEvent(event)     // 判断是否为附属事件
EventService.isUserSubEvent(event)         // 判断是否为用户子事件

// 查询方法
EventService.getChildEvents(parentId)      // 获取所有子事件
EventService.getSubordinateEvents(parentId)// 仅附属事件（Timer/TimeLog/OutsideApp）
EventService.getUserSubTasks(parentId)     // 仅用户子事件

// 树结构操作
EventService.getEventTree(rootId)          // 递归获取整个事件树
EventService.getTotalDuration(parentId)    // 计算总时长
EventService.getEventDepth(eventId)        // 获取层级深度
EventService.getRootEvent(eventId)         // 获取根事件
```

**使用示例**:
```typescript
// ❌ 旧代码
const childEvents = (parent.timerLogs || [])
  .map(id => EventService.getEventById(id))
  .filter(e => e !== null);

// ✅ 新代码
const childEvents = EventService.getChildEvents(parent.id);

// 按类型过滤
const timers = EventService.getSubordinateEvents(parent.id);
const userTasks = EventService.getUserSubTasks(parent.id);
```

#### 4. 事件类型区分

**附属事件 vs 用户子事件**:

| 类型 | 标识字段 | Plan 页面显示 | 有 Plan 状态 | 说明 |
|------|----------|--------------|-------------|------|
| **用户子任务** | `isPlan=true, parentEventId=存在` | ✅ 显示 | ✅ 有 | 用户主动创建，有完整生命周期 |
| **Timer 子事件** | `isTimer=true, parentEventId=存在` | ❌ 隐藏 | ❌ **仅 Actual** | 系统自动生成的计时记录 |
| **时间日志** | `isTimeLog=true` | ❌ 隐藏 | ❌ **仅 Actual** | 系统自动记录的活动轨迹 |
| **外部应用数据** | `isOutsideApp=true` | ❌ 隐藏 | ❌ **仅 Actual** | 外部应用同步的数据 |

**关键区分点**:
- **附属事件**: 只记录 Actual 数据（实际发生时间），不能被预先计划
- **用户子事件**: 有完整的 Plan 状态（计划时间 + 实际时间）

#### 5. 前端组件适配

**EventEditModalV2**:
```typescript
// ❌ 旧代码
const childEvents = (latestEvent.timerLogs || [])
  .map(id => EventService.getEventById(id))
  .filter(e => e !== null);

// ✅ 新代码
const childEvents = EventService.getChildEvents(latestEvent.id);
```

**PlanManager**:
```typescript
// ❌ 旧代码
if (event.isTimer === true || 
    event.isOutsideApp === true || 
    event.isTimeLog === true) {
  return false; // 隐藏系统事件
}

// ✅ 新代码
if (EventService.isSubordinateEvent(event)) {
  return false;
}
```

#### 6. 数据迁移

**迁移脚本**: `scripts/migrate-timerlogs-to-childeventids.js`

**功能**:
- ✅ 自动合并 `timerLogs` 和 `childEventIds`（去重）
- ✅ 删除旧的 `timerLogs` 字段
- ✅ 验证数据完整性（孤立子事件、无效引用）
- ✅ 详细的迁移报告

**数据修复脚本**: `scripts/fix-eventtree-integrity.js`

**功能**:
- ✅ 清理孤立子事件的 `parentEventId`
- ✅ 移除无效的子事件引用
- ✅ 验证双向关联一致性

### 核心优势

1. **单一数据源**: 所有子事件统一存储在 `childEventIds`
2. **自动维护**: 创建/更新/删除时自动同步双向关联
3. **类型灵活**: 通过标记区分，按需过滤
4. **易于扩展**: 添加新类型只需加标记，无需新字段
5. **查询高效**: O(1) 获取子事件列表，内存过滤

### 相关文档

- [EVENTTREE_UNIFIED_DESIGN.md](../architecture/EVENTTREE_UNIFIED_DESIGN.md) - 完整设计文档
- [EVENTTREE_INTEGRITY_DIAGNOSIS.md](../diagnosis/EVENTTREE_INTEGRITY_DIAGNOSIS.md) - 诊断报告
- [EVENTTREE_UNIFIED_IMPLEMENTATION_REPORT.md](../implementation/EVENTTREE_UNIFIED_IMPLEMENTATION_REPORT.md) - 实施报告

---

## 🎉 v2.15.3 null 时间字段支持与 createdAt Fallback (2025-11-29)

### 核心变更

**背景**: Task-type 事件（无时间的待办事项）使用 `startTime: null` 和 `endTime: null`，部分模块未正确处理 null 值导致崩溃  
**解决方案**: 全局审查并修复所有时间字段访问，使用 `createdAt` 作为 fallback 用于事件定位和排序  
**状态**: ✅ 已完成 Critical 和 High Priority 修复（详见 [NULL_TIME_FIELD_AUDIT_REPORT.md](../audits/NULL_TIME_FIELD_AUDIT_REPORT.md)）

### 架构改进

#### 1. null 时间字段规范

**时间字段类型定义**:
```typescript
interface Event {
  startTime?: string | null;  // ✅ 使用 null（不是 undefined）
  endTime?: string | null;    // ✅ 使用 null（不是 undefined）
  createdAt: string;          // 必需字段，用于 fallback
}
```

**为什么使用 null？**
- `JSON.stringify()` 会保留 `null` 但忽略 `undefined`
- `null` 表示"明确没有时间"，`undefined` 表示"未定义"
- 与 SQL NULL 语义一致

#### 2. createdAt Fallback 策略

**Task-type 事件定位规则**:
```typescript
// ✅ 优先级：startTime > endTime > createdAt
const effectiveTime = event.startTime || event.endTime || event.createdAt;

// ✅ 用于排序
events.sort((a, b) => {
  const timeA = new Date(
    (a.startTime != null && a.startTime !== '') ? a.startTime : a.createdAt
  ).getTime();
  const timeB = new Date(
    (b.startTime != null && b.startTime !== '') ? b.startTime : b.createdAt
  ).getTime();
  return timeB - timeA;
});
```

**应用场景**:
- **TimeCalendar 视图**: Task 按创建时间定位在时间线上
- **联系人搜索**: 无时间事件按创建时间排序显示
- **事件过滤**: 范围查询使用 createdAt 作为备选

#### 3. 核心修复列表

**Critical P0 修复**:
1. **EventService.getEventsByRange()** (L256-268)
   - 添加 null 检查和 createdAt fallback
   - 修复 TimeCalendar 视图崩溃问题

2. **EventService.getRecentEventsByContact()** (L2230-2231)
   - 使用 `!= null` 显式检查替代 `||` 运算符
   - 修复联系人搜索功能

**High P1 修复**:
3. **PlanManager.tsx** (L498, L603, L629)
   - TimeCalendar 过期检测添加空字符串检查
   - 事件通知逻辑添加显式 null 检查

4. **serialization.ts** (L498-499, L511-512)
   - 统一使用 `null` 替代 `undefined`
   - 符合 TIME_PICKER_AND_DISPLAY_PRD 规范

#### 4. null 检查最佳实践

```typescript
// ✅ 推荐：明确的 null/undefined 检查
if (event.startTime != null && event.startTime !== '') {
  const time = new Date(event.startTime);
  // ... 安全操作
}

// ⚠️ 可接受：truthy 检查（仅当 100% 确定不会有空字符串）
if (event.startTime) {
  const time = new Date(event.startTime);
}

// ❌ 错误：直接访问
const time = new Date(event.startTime);  // 可能导致 Invalid Date
```

**详细文档**: [NULL_TIME_FIELD_AUDIT_REPORT.md](../audits/NULL_TIME_FIELD_AUDIT_REPORT.md)

---

## 🎉 v2.15 父-子事件单一配置架构 (2025-11-27)

### 核心变更

**背景**: 旧架构使用 `planSyncConfig` 和 `actualSyncConfig` 双配置（Plan vs Actual 范式），导致父事件无子事件时"实际进展"配置无处保存
**解决方案**: 单一配置架构 - 每个事件使用 `calendarIds + syncMode`，父事件使用 `subEventConfig` 存储子事件配置模板
**状态**: ✅ 已完成实现，EventEditModalV2 已集成

### 架构改进

#### 1. 单一配置结构

```typescript
interface Event {
  // 每个事件独立的同步配置
  calendarIds?: string[];  // 同步目标日历 ID 列表
  syncMode?: string;       // 同步模式
  
  // 父事件专用：子事件配置模板
  subEventConfig?: {
    calendarIds?: string[];
    syncMode?: string;
  };
}
```

#### 2. 父-子事件清晰分离

**父事件（ParentEvent）**:
- `calendarIds/syncMode`: 父事件自己的同步配置（计划安排）
- `subEventConfig`: 子事件配置模板（实际进展），用于批量更新和新建继承

**子事件配置继承规则**:

1. **系统性子事件**（Timer、外部应用自动生成）:
   - ✅ **严格继承** `parentEvent.subEventConfig`
   - ✅ **用户可以修改**：但 EventEditModal 中修改的是父事件的 `subEventConfig`（非子事件自己的配置）
   - 📌 原因：自动生成的子事件应始终跟随父事件配置，批量更新时同步

2. **手动子事件**（用户在 PlanManager/TimeCalendar 手动创建）:
   - ✅ **默认继承** `parentEvent.subEventConfig`（创建时）
   - ✅ **可独立修改**：EventEditModal 修改的是子事件自己的 `calendarIds/syncMode`
   - 📌 原因：用户创建的子事件可能需要不同的同步策略

**子事件（ChildEvent/Timer）**:
- `calendarIds/syncMode`: 子事件自己的同步配置（实际进展）
- 创建时从父事件的 `subEventConfig` 继承（而非直接从父事件的 `calendarIds/syncMode`）
- 是否持续跟随父事件取决于子事件类型（系统性 vs 手动）

#### 2.1 syncMode 同步控制（✅ v2.15.1 已实现）

**syncMode 取值**:
- `receive-only`: 仅接收远端更新，不推送本地修改到远端
- `send-only`: 仅推送本地修改到远端，不接收远端更新
- `send-only-private`: 推送到远端（标记为私密），不接收远端更新
- `bidirectional`: 双向同步（默认模式）
- `bidirectional-private`: 双向同步（标记为私密）

**实现位置**:
1. **syncRouter.ts** (`determineSyncTarget`): 检查 `syncMode === 'receive-only'` 时阻止本地→远端推送
2. **ActionBasedSyncManager.ts** (`applyRemoteActionToLocal`): 检查 `syncMode === 'send-only'` 时阻止远端→本地更新

#### 3. EventEditModal V2 集成

**中区（计划安排）**:
- 父模式：编辑 `mainEvent.calendarIds/syncMode`
- 子模式：编辑 `parentEvent.calendarIds/syncMode`（计划字段同步到父）

**下区（实际进展）**:
- 父模式：编辑 `subEventConfig` + 批量更新现有**系统性子事件**（`isTimer=true`）
- 子模式（系统性）：编辑 `parentEvent.subEventConfig`（修改父事件配置，触发批量更新）
- 子模式（手动）：编辑 `mainEvent.calendarIds/syncMode`（子事件自己的配置）

> **⚠️ 批量更新策略（已实现 ✅）**:
> - **系统子事件**（isTimer/isTimeLog/isOutsideApp）：始终批量更新
> - **手动子事件** + 已自定义配置（`hasCustomSyncConfig=true`）：跳过更新，保持独立
> - **手动子事件** + 默认继承（`hasCustomSyncConfig=false/undefined`）：批量更新配置
> 
> **💡 EditModal 修改逻辑（已实现 ✅）**:
> 
> **1. 系统性子事件**（isTimer/isTimeLog/isOutsideApp）：
> - **读取**: 显示父事件的 `subEventConfig.calendarIds/syncMode`
> - **保存**: 修改父事件的 `subEventConfig`，并批量同步到所有系统性子事件
> - **实现**: EventEditModalV2.tsx 行 444-460 (初始化)，行 627-652 (syncMode)，行 968-1010 (保存逻辑)
> 
> **2. 手动子事件**（PlanManager/TimeCalendar 创建）：
> - **创建时**: 从 `parent.subEventConfig` 继承配置（`hasCustomSyncConfig=undefined`）
> - **读取**: 显示子事件自己的 `calendarIds/syncMode`（如为空则从 `parent.subEventConfig` 读取）
> - **保存**: 修改子事件自己的配置，设置 `hasCustomSyncConfig=true`
> - **父事件更新时**:
>   - `hasCustomSyncConfig=true`: 保持独立，不更新
>   - `hasCustomSyncConfig=false/undefined`: 跟随父事件更新
> - **实现**: EventEditModalV2.tsx 同一逻辑分支 + 行 1040-1070 (批量更新区分)

#### 4. 核心优势

- ✅ 父事件无子事件时，`subEventConfig` 始终可保存
- ✅ 架构清晰：父事件配置是父事件的，子事件配置是子事件的
- ✅ 简化逻辑：移除双配置结构，单一配置 + 模板机制
- ✅ 模板继承：创建子事件时自动继承父事件配置
- ✅ 批量更新：父事件更新"实际进展"配置时，同步更新所有子事件

### 迁移指南

```typescript
// ❌ 旧架构 (v2.0.3)
event.planSyncConfig = {
  mode: 'bidirectional',
  targetCalendars: ['outlook-work']
};
event.actualSyncConfig = {
  mode: 'send-only',
  targetCalendars: ['outlook-work']
};

// ✅ 新架构 (v2.15)
// 父事件
event.calendarIds = ['outlook-work'];
event.syncMode = 'bidirectional';
event.subEventConfig = {
  calendarIds: ['outlook-work'],
  syncMode: 'send-only'
};

// 子事件
childEvent.calendarIds = ['outlook-work'];
childEvent.syncMode = 'send-only';
```

---

## 🔥 v2.15.3 EventService 中枢化架构 (2025-11-29)

### 核心变更

**背景**: EventLog 重构后，远程同步的事件缺少 eventlog 字段，导致 EventEditModal 显示空白  
**根本原因**: `convertFromCalendarEvent` 自己处理数据转换，绕过了 EventService 的规范化机制  
**解决方案**: 建立 EventService 作为唯一数据中枢，所有数据转换统一由 normalizeEvent 处理

### 架构改进

#### 1. 数据流中枢化

**旧架构问题** ❌:
```
Outlook API → convertFromCalendarEvent (自己转换 title/eventlog)
                        ↓
               EventService.createEvent()
                        ↓
                  localStorage

问题：数据转换逻辑分散，绕过 normalizeTitle/normalizeEventLog
```

**新架构** ✅:
```
Outlook API → convertFromCalendarEvent (只映射字段，返回字符串)
                        ↓
           返回 Partial<Event> { title: "字符串", description: "字符串" }
                        ↓
               EventService.createEvent()
                        ↓
               normalizeEvent() 统一处理:
                 - normalizeTitle("字符串") → EventTitle 对象
                 - normalizeEventLog(description) → EventLog 对象
                        ↓
          完整 Event { title: EventTitle, eventlog: EventLog }
                        ↓
                  localStorage
```

#### 2. 增强 normalizeTitle - 支持字符串输入

```typescript
// 🆕 支持远程同步场景的字符串输入
private static normalizeTitle(titleInput: any): EventTitle {
  // 情况0: 简单字符串
  if (typeof titleInput === 'string') {
    return {
      simpleTitle: titleInput,
      colorTitle: undefined,  // 后续自动生成
      fullTitle: undefined
    };
  }
  
  // 情况-1: 空值
  if (!titleInput) {
    return { simpleTitle: '(无标题)' };
  }
  
  // 现有逻辑: EventTitle 对象...
}
```

#### 3. 增强 normalizeEventLog - 自动从 description 生成

```typescript
private static normalizeEventLog(eventlogInput: any): EventLog {
  // 🆕 支持从纯文本 description 生成 EventLog
  if (typeof eventlogInput === 'string' && eventlogInput.trim()) {
    return this.convertSlateJsonToEventLog(JSON.stringify([{
      type: 'paragraph',
      children: [{ text: eventlogInput }]
    }]));
  }
  
  // 现有逻辑...
}
```

#### 4. 简化 convertFromCalendarEvent - 只做字段映射

```typescript
// 🔥 移除复杂转换，返回 Partial<Event>
export function convertFromCalendarEvent(
  calendarEvent: any, 
  originalEvent?: Event
): Partial<Event> {
  return {
    title: calendarEvent.title || '(无标题)',  // ✅ 字符串
    description: calendarEvent.body || '',      // ✅ 字符串
    // ❌ 不再自己创建 eventlog，交给 EventService
  };
}
```

### 优势总结

| 方面 | 旧架构 | 新架构 |
|------|-------|-------|
| **数据转换** | 分散各模块 | 统一 EventService |
| **远程同步** | 手动创建 EventLog | 自动生成 |
| **代码冗余** | 多处重复 | 单一入口 |
| **数据一致性** | 容易不一致 | 完全一致 |

---

## 🔧 v2.15.2 EventService 生命周期管理 (2025-11-27)

### 问题背景

**现象**: 开发环境热重载（HMR）后，EventService 无法同步事件到 Outlook
**根因**: HMR 导致 EventService 模块重新加载，内部 `syncManagerInstance` 变量重置为 `null`
**影响**: `hasSyncManager: false`，导致同步代码块不执行

### 技术分析

#### 1. 模块级变量的生命周期问题

```typescript
// EventService.ts - 模块级变量
let syncManagerInstance: any = null;  // ❌ HMR 时会重置为 null

export class EventService {
  static initialize(syncManager: any) {
    syncManagerInstance = syncManager;  // ✅ 初始化时赋值
  }
  
  static async updateEvent(eventId: string, updates: Partial<Event>) {
    // ...
    if (!skipSync && syncManagerInstance && ...) {  // ❌ HMR 后 syncManagerInstance 为 null
      await syncManagerInstance.recordLocalAction(...);
    }
  }
}
```

#### 2. App.tsx 的初始化时机

**旧逻辑**（有问题）:
```typescript
useEffect(() => {
  if (currentAuthState && !syncManager) {
    // 只在首次创建时初始化 EventService
    const newSyncManager = new ActionBasedSyncManager(microsoftService);
    setSyncManager(newSyncManager);
    EventService.initialize(newSyncManager);
  } else if (syncManager) {
    // ❌ syncManager 存在时不做任何事
    console.log('🔍 [App] syncManager 已存在，跳过初始化');
  }
}, [microsoftService, lastAuthState]);  // ❌ 依赖数组不包含 syncManager
```

**问题**:
1. HMR 触发 EventService 模块重新加载 → `syncManagerInstance` 重置为 `null`
2. App.tsx 的 `syncManager` state 仍存在（React state 不受 HMR 影响）
3. useEffect 因为 `syncManager` 存在而不执行 `EventService.initialize()`
4. 导致 EventService 永久丢失 syncManager 引用

### 解决方案

**核心思路**: 每次 useEffect 运行时，如果 `syncManager` 存在，**重新初始化 EventService**

```typescript
// App.tsx L1318-1363
useEffect(() => {
  const currentAuthState = microsoftService?.isSignedIn() || false;
  
  if (currentAuthState && !syncManager) {
    // 首次创建 syncManager
    console.log('🔍 [App] 开始创建 ActionBasedSyncManager...');
    const newSyncManager = new ActionBasedSyncManager(microsoftService);
    setSyncManager(newSyncManager);
    EventService.initialize(newSyncManager);
    newSyncManager.start();
  } else if (syncManager) {
    // 🔧 [HMR FIX] syncManager 存在时，重新初始化 EventService
    // 防止 HMR 导致 EventService 丢失 syncManager 引用
    console.log('🔍 [App] syncManager 已存在，重新初始化 EventService...');
    EventService.initialize(syncManager);
    console.log('✅ [App] EventService 重新初始化完成');
  }
}, [microsoftService, lastAuthState]);
```

### 性能评估

| 指标 | 评估 | 说明 |
|------|------|------|
| **操作开销** | ✅ 极低 | `EventService.initialize()` 只是变量赋值（`syncManagerInstance = syncManager`） |
| **运行频率** | ✅ 极低 | useEffect 仅在登录/登出或页面加载时运行，正常使用中几乎不触发 |
| **内存影响** | ✅ 无 | 不创建新对象，只是更新引用 |
| **可靠性** | ✅ 大幅提升 | 确保 EventService 始终持有有效的 syncManager 引用 |
| **开发体验** | ✅ 改善 | 解决 HMR 导致的同步失效问题 |

### 验证日志

**修复前**:
```
🔍 [EventService] Sync condition check: {
  eventId: 'local-xxx',
  skipSync: false,
  hasSyncManager: false,  // ❌ syncManager 丢失
  syncStatus: 'synced',
  willEnterSyncBlock: false
}
```

**修复后**:
```
🔍 [App] syncManager 已存在，重新初始化 EventService...
✅ [App] EventService 重新初始化完成

🔍 [EventService] Sync condition check: {
  eventId: 'local-xxx',
  skipSync: false,
  hasSyncManager: true,  // ✅ syncManager 恢复
  syncStatus: 'synced',
  willEnterSyncBlock: true
}

🔍 [ActionBasedSyncManager UPDATE] action.data 检查: { hasDescription: true, ... }
✅ 已更新1个事件到Outlook
```

### 相关文件

- `src/App.tsx` L1318-1363: syncManager 初始化逻辑
- `src/services/EventService.ts` L25-45: `initialize()` 方法和 `syncManagerInstance` 变量
- `src/services/EventService.ts` L809-850: 同步条件检查和执行

---

## 🎉 v2.14 EventTitle 三层架构重构 (2025-11-25)

### 核心变更

**背景**: 不同组件对标题格式需求不同（富文本 vs 纯文本），旧架构使用 `title: string` 导致信息丢失和场景混乱
**解决方案**: 将 `title` 从 `string` 改为 `EventTitle` 对象，包含三个层级：fullTitle (Slate JSON)、colorTitle (HTML)、simpleTitle (纯文本)
**状态**: ✅ 已完成全量迁移

### 架构改进

#### 1. 类型定义 - EventTitle 接口

```typescript
interface EventTitle {
  fullTitle?: string;    // Slate JSON 富文本（PlanSlate）
  colorTitle?: string;   // HTML 富文本（UpcomingPanel/EditModal）
  simpleTitle?: string;  // 纯文本（TimeCalendar/搜索/同步）
}

// Event.title 从 string 变为 EventTitle 对象
interface Event {
  title: EventTitle;  // ✅ v2.14
  // ❌ 废弃字段已移除: simpleTitle, fullTitle
}
```

#### 2. 自动转换机制 - EventService.normalizeTitle()

**🔥 核心原则**: **所有 title 字段的转换统一由 EventService.normalizeTitle() 处理**

```typescript
// EventService.ts
private static normalizeTitle(titleInput: Partial<EventTitle>): EventTitle {
  // 场景1: fullTitle only → 生成 colorTitle + simpleTitle
  if (fullTitle && !colorTitle && !simpleTitle) {
    return {
      fullTitle,
      colorTitle: fullTitleToColorTitle(fullTitle),
      simpleTitle: colorTitleToSimpleTitle(colorTitle)
    };
  }
  
  // 场景2: colorTitle only → 生成 simpleTitle + fullTitle
  // 场景3: simpleTitle only → 生成 colorTitle + fullTitle
  // 场景4: 多个字段存在 → 直接返回
}

// 自动调用时机：
// 1. EventService.createEvent() - 创建时自动转换
// 2. EventService.updateEvent() - 更新时自动转换
// 3. EventHub.createEvent() → 调用 EventService.createEvent()
// 4. EventHub.updateFields() → 调用 EventService.updateEvent()
```

**✅ 组件层面规范**:
- EventEditModalV2: 传递 `{ simpleTitle: finalTitle }` 或 `{ colorTitle: finalTitle }`
- PlanManager: 传递 `{ simpleTitle: plainText }`
- AIDemo: 传递 `{ simpleTitle: editedTitle }`
- TimeCalendar: 使用 `convertFromCalendarEvent()` 自动创建 EventTitle 对象

**❌ 禁止行为**:
- 不要在组件中直接传递字符串给 `title` 字段
- 不要在 EventHub/TimeHub 层做 title 转换
- 不要绕过 EventService 直接操作 localStorage

#### 3. 标题字段完整数据流

```mermaid
graph TB
    A[组件层] --> B{传递 title}
    B -->|EventEditModalV2| C["{simpleTitle: finalTitle}"]
    B -->|PlanManager| D["{simpleTitle: plainText}"]
    B -->|AIDemo| E["{simpleTitle: editedTitle}"]
    B -->|TimeCalendar| F["convertFromCalendarEvent()"]
    
    C --> G[EventHub.updateFields]
    D --> G
    E --> H[EventHub.createEvent]
    F --> H
    
    G --> I[EventService.updateEvent]
    H --> J[EventService.createEvent]
    
    I --> K[normalizeTitle]
    J --> K
    
    K --> L{检查字段}
    L -->|只有 simpleTitle| M[生成 colorTitle + fullTitle]
    L -->|只有 colorTitle| N[生成 simpleTitle + fullTitle]
    L -->|只有 fullTitle| O[生成 colorTitle + simpleTitle]
    L -->|多个字段存在| P[保持原样]
    
    M --> Q[完整的 EventTitle 对象]
    N --> Q
    O --> Q
    P --> Q
    
    Q --> R[存储到 localStorage]
    Q --> S[更新 EventHub 缓存]
    Q --> T[触发 eventsUpdated 事件]
```

**关键点**:
1. **组件层**: 只需传递一个 title 字段（simpleTitle/colorTitle/fullTitle）
2. **EventHub 层**: 透传给 EventService，不做转换
3. **EventService 层**: 自动调用 normalizeTitle() 填充缺失字段
4. **存储层**: 保存完整的 EventTitle 对象

#### 4. 外部同步处理（Outlook/Google Calendar）

```typescript
// ActionBasedSyncManager.ts - 同步到外部服务时提取 simpleTitle
const outlookEventData = {
  subject: action.data.title?.simpleTitle || '(无标题)',  // ✅ 提取纯文本
  // ... 其他字段
};

// MicrosoftCalendarService.ts - 同步时同样提取 simpleTitle
const eventData = {
  subject: event.title?.simpleTitle || '(无标题)',
  // ... 其他字段
};
```

**原因**: 外部 API 不支持富文本，只能接受纯文本字符串

#### 5. 组件适配完成

| 组件 | 使用字段 | 变更内容 |
|-----|---------|---------|
| PlanSlate | `fullTitle` | ✅ 读写 title.fullTitle |
| UpcomingEventsPanel | `colorTitle` | ✅ 显示 title.colorTitle |
| EventEditModalV2 | `colorTitle` | ✅ 表单读写 colorTitle |
| PlanManager | `simpleTitle` | ✅ 搜索/日志用 simpleTitle |
| TimeCalendar | `simpleTitle` | ✅ 周/日视图用 simpleTitle |
| Timer 模块 | `simpleTitle` | ✅ App.tsx 全部转换 |

#### 4. 性能优化

- **自动转换**: addEvent/updateEvent 自动调用 normalizeTitle()
- **按需读取**: 组件只读取需要的层级
- **避免重复**: 转换函数缓存结果

### 迁移影响

**✅ 完成的修改** (12个文件):
1. types.ts - EventTitle 定义
2. EventService.ts - 转换函数 + normalizeTitle()
3. PlanManager.tsx - 所有 title 操作改为 simpleTitle
4. PlanSlate/serialization.ts - 序列化层
5. UpcomingEventsPanel.tsx - 显示 colorTitle
6. EventEditModalV2.tsx - 表单读写 colorTitle
7. App.tsx - Timer title 赋值改为对象
8. TimeCalendar.tsx - Timer 前缀检查
9. calendarUtils.ts - 字符串操作
10. ActionBasedSyncManager.ts - 冲突标记
11. StatusLineContainer.tsx - 日志输出
12. upcomingEventsHelper.ts - 过滤逻辑

**🔥 破坏性变更**:
- `Event.title` 从 `string` 变为 `EventTitle` 对象
- 移除废弃字段 `simpleTitle`, `fullTitle`
- 所有 `event.title.substring()` 改为 `event.title?.simpleTitle?.substring()`

---

## 🎉 v1.7 EventHistoryService 时间快照增强 (2025-11-23)

### 新增核心功能

**背景**: Snapshot 功能需要高效查询"截止某时间点存在的事件"和"时间范围内的操作摘要"
**解决方案**: 在 EventHistoryService 添加专用查询方法，提升性能并简化上层逻辑
**状态**: ✅ 已实现并集成到 PlanManager

### 核心改进

#### 1. 时间点快照查询 - `getExistingEventsAtTime()`
```typescript
// EventHistoryService.ts - 查询截止某时间点还存在的事件
class EventHistoryService {
  /**
   * 查询截止指定时间点还存在的所有事件
   * @param timestamp 时间点（ISO字符串或格式化字符串）
   * @returns 在该时间点存在的事件ID集合
   */
  static getExistingEventsAtTime(timestamp: string): Set<string> {
    const targetTime = parseLocalTimeString(timestamp);
    const allLogs = this.getAllLogs();
    
    const existingEvents = new Set<string>();
    
    // 遍历所有历史记录，构建截止时间点的事件状态
    allLogs.forEach(log => {
      const logTime = parseLocalTimeString(log.timestamp);
      
      // 只处理时间点之前的记录
      if (logTime <= targetTime) {
        if (log.operation === 'create') {
          existingEvents.add(log.eventId);
        } else if (log.operation === 'delete') {
          existingEvents.delete(log.eventId);
        }
        // update 操作不影响存在性
      }
    });
    
    return existingEvents;
  }
}
```

**应用场景**:
- ✅ Snapshot 模式：过滤"在范围结束时还存在"的事件
- ✅ 时间旅行：查看任意历史时刻的待办列表状态
- ✅ 回顾功能：统计某时间段完成/删除了哪些事项

**性能优化**:
- 一次遍历所有日志，构建状态快照
- 返回 Set 结构，O(1) 查找复杂度
- 避免多次重复查询历史记录

#### 2. 操作摘要查询 - `getEventOperationsSummary()`
```typescript
/**
 * 获取时间范围内的事件操作摘要（用于 Snapshot 功能）
 * @returns 包含 created/updated/completed/deleted 事件列表的对象
 */
static getEventOperationsSummary(startTime: string, endTime: string): {
  created: EventChangeLog[];
  updated: EventChangeLog[];
  completed: EventChangeLog[];
  deleted: EventChangeLog[];
  missed: EventChangeLog[];
} {
  const logs = this.queryHistory({ startTime, endTime });
  
  const created = logs.filter(l => l.operation === 'create');
  const deleted = logs.filter(l => l.operation === 'delete');
  
  // updated: 有实质性变更的 update 操作（排除 completed）
  const updated = logs.filter(l => 
    l.operation === 'update' && 
    !l.changes?.some(c => 
      c.field === 'isCompleted' || 
      c.field === 'checked' || 
      c.field === 'unchecked'
    )
  );
  
  // completed: 标记为完成的操作
  const completed = logs.filter(l => 
    l.operation === 'update' && 
    l.changes?.some(c => 
      (c.field === 'isCompleted' && c.newValue === true) ||
      (c.field === 'checked' && Array.isArray(c.newValue) && c.newValue.length > 0)
    )
  );
  
  return { created, updated, completed, deleted, missed: [] };
}
```

**应用场景**:
- ✅ Snapshot 统计面板：一次查询获取所有分类数据
- ✅ 周报/月报：自动统计某时间段的工作量
- ✅ 数据可视化：为图表提供结构化数据源

**性能提升**:
- **原方案**: 5次 filter 遍历 → `O(5n)`
- **新方案**: 1次查询 + 分类 → `O(n)`
- **减少查询**: 从多次 `getChangesByTimeRange()` 到一次调用

#### 3. 批量状态查询 - `getEventStatusesInRange()`
```typescript
/**
 * 批量获取事件在时间范围内的状态
 * @returns Map<eventId, EventChangeLog[]> 每个事件在该时间范围内的历史记录
 */
static getEventStatusesInRange(
  eventIds: string[], 
  startTime: string, 
  endTime: string
): Map<string, EventChangeLog[]> {
  const logs = this.queryHistory({ startTime, endTime });
  const statusMap = new Map<string, EventChangeLog[]>();
  
  // 初始化所有事件的空数组
  eventIds.forEach(id => statusMap.set(id, []));
  
  // 按事件ID分组
  logs.forEach(log => {
    if (statusMap.has(log.eventId)) {
      statusMap.get(log.eventId)!.push(log);
    }
  });
  
  return statusMap;
}
```

**应用场景**:
- ✅ 状态竖线渲染：一次查询获取所有事件的状态
- ✅ 批量状态计算：避免 N 次独立查询
- ✅ 性能优化：从 `O(n²)` 降至 `O(n)`

**性能对比**:
```
旧方案（N个事件独立查询）:
  for (event in events) {
    queryHistory({ eventId: event.id, startTime, endTime }) // N次查询
  }
  时间复杂度: O(N * M), M=历史记录总数

新方案（一次批量查询）:
  queryHistory({ startTime, endTime })  // 1次查询
  Map分组                                // O(N)
  时间复杂度: O(M + N)
  
实际测试:
  20个事件，1000条历史记录
  旧方案: ~280ms
  新方案: ~15ms
  性能提升: 18.7x
```

### PlanManager 集成优化

#### Snapshot 模式重构
```typescript
// PlanManager.tsx - 使用新的 EventHistoryService API
const editorItems = useMemo(() => {
  if (!dateRange) return filteredItems;
  
  const endTime = formatTimeForStorage(dateRange.end);
  
  // 1️⃣ 查询范围结束时还存在的事件（一次调用）
  const existingAtRangeEnd = EventHistoryService.getExistingEventsAtTime(endTime);
  
  let allItems = filteredItems.filter(item => existingAtRangeEnd.has(item.id));
  
  // 2️⃣ 查询范围内的删除操作（一次调用）
  const deleteOpsInRange = EventHistoryService.queryHistory({
    operations: ['delete'],
    startTime: formatTimeForStorage(dateRange.start),
    endTime
  });
  
  // 添加 ghost events（带删除线和 DEL 标记）
  deleteOpsInRange.forEach(log => {
    allItems.push({ ...log.before, _isDeleted: true, _deletedAt: log.timestamp });
  });
  
  return allItems;
}, [dateRange, filteredItems]);
```

#### Snapshot 统计简化
```typescript
// 原方案：手动过滤 + 多次遍历
const result = {
  created: snapshot.filter(log => log.operation === 'create').length,
  updated: snapshot.filter(log => log.operation === 'update').length,
  completed: snapshot.filter(log => /* 复杂判断 */).length,
  deleted: snapshot.filter(log => log.operation === 'delete').length,
};

// 新方案：直接调用结构化 API
const summary = EventHistoryService.getEventOperationsSummary(startTime, endTime);
const result = {
  created: summary.created.length,
  updated: summary.updated.length,
  completed: summary.completed.length,
  deleted: summary.deleted.length,
  details: [...summary.created, ...summary.updated, ...summary.completed, ...summary.deleted]
};
```

### 架构优势

#### 职责分离
- **EventHistoryService**: 负责历史数据查询和时间快照逻辑
- **PlanManager**: 负责 UI 展示和用户交互
- **解耦**: 其他组件可复用 EventHistoryService 的查询能力

#### 性能提升
| 功能 | 旧方案 | 新方案 | 提升 |
|------|--------|--------|------|
| 时间点快照 | 遍历 filteredItems + 查询所有删除 | 一次遍历历史记录 | 2x |
| 操作摘要 | 5次 filter | 1次查询 + 分类 | 3x |
| 批量状态 | N次独立查询 | 1次查询 + Map分组 | 18x |

#### 可扩展性
```typescript
// 未来可轻松添加更多时间快照功能
EventHistoryService.getEventsCreatedBetween(start, end)
EventHistoryService.getEventsCompletedInWeek(weekNumber)
EventHistoryService.getActivityHeatmap(year, month)
```

---

## 🎉 v1.6 ID分配与时间系统优化 (2025-11-19)

### 最新优化

**问题**: 新建事件时间插入失败，TimeHub与EventService的ID映射不同步
**解决方案**: 实现统一ID管理和即时状态同步机制
**状态**: ✅ 已优化并完成测试

### 核心改进

#### 1. TimeHub与EventService的统一ID查找
```typescript
// TimeHub.ts - 增强的ID解析机制
class TimeHub {
  static setEventTime(eventId: string, timeData: TimeData) {
    // 🔍 统一ID查找：支持 items 和 pendingEmptyItems
    let targetEvent = EventService.getEventById(eventId);
    
    // 如果在EventService中找不到，检查PlanManager的pending状态
    if (!targetEvent) {
      const planManagerState = this.getPlanManagerState();
      targetEvent = planManagerState?.pendingEmptyItems?.get(eventId);
    }
    
    if (targetEvent) {
      // 更新TimeHub和EventService
      this.updateTimeSnapshot(eventId, timeData);
      EventService.updateEvent(eventId, {
        startTime: timeData.start,
        endTime: timeData.end,
        isAllDay: timeData.isAllDay
      });
    }
  }
  
  // 新增：获取PlanManager状态的通信接口
  private static getPlanManagerState() {
    return (window as any).__planManagerState;
  }
}
```

#### 2. EventService的增强查找逻辑
```typescript
// EventService.ts - 支持多源查找
static getEventById(eventId: string): Event | null {
  // 优先在正式事件中查找
  let event = this.events.get(eventId);
  
  if (!event) {
    // 检查PlanManager的pendingEmptyItems
    const planState = (window as any).__planManagerState;
    event = planState?.pendingEmptyItems?.get(eventId);
  }
  
  return event || null;
}
```

---

## 🎉 v1.5 循环更新防护增强 (2025-11-19)

### 重大更新

**问题**: EventService 双向数据绑定导致无限循环更新，影响整个应用性能
**解决方案**: 实现全链路循环防护机制，确保数据流稳定性
**状态**: ✅ 已修复并通过测试验证

### 新增功能

#### 1. 更新源追踪系统
```typescript
// EventService.ts - 新增循环防护机制
class EventService {
  private static updateSequence = 0;
  private static pendingLocalUpdates = new Map<string, number>();
  private static tabId = `tab-${Date.now()}-${Math.random().toString(36)}`;
  
  // 生成唯一更新ID
  static generateUpdateId(): number {
    return ++this.updateSequence;
  }
  
  // 检测本地更新（防止接收自己发出的广播）
  static isLocalUpdate(eventId: string, updateId: number): boolean {
    const pendingId = this.pendingLocalUpdates.get(eventId);
    return pendingId === updateId;
  }
  
  // 循环更新检测
  static isCircularUpdate(eventId: string, originInfo?: any): boolean {
    return this.isLocalUpdate(eventId, originInfo?.updateId);
  }
}
```

#### 2. 跨Tab通信优化
```typescript
// BroadcastChannel 增强过滤机制
this.broadcastChannel.addEventListener('message', (event) => {
  const { eventId, tabId: senderTabId, originInfo } = event.data;
  
  // 🔧 不处理自己发送的消息
  if (senderTabId === this.tabId) {
    console.log('[EventService] 跳过自己发送的广播消息');
    return;
  }
  
  // 处理来自其他Tab的消息
  this.handleExternalUpdate(eventId, originInfo);
});
```

#### 3. 测试事件保护
```typescript
// 防止测试基础设施被意外清理
const isTestEvent = (event: Event): boolean => {
  return event.source?.includes('test') || 
         event.id?.includes('test') || 
         event.id?.includes('console') ||
         event.id?.includes('perf-test');
};
```

### 性能优化

#### EventService层面优化
- **localStorage写入**: 从平均50ms优化至8-10ms
- **事件检索**: 增加内存缓存，提升90%查询速度
- **批量操作**: 支持20个事件387ms批量创建
- **内存管理**: 减少不必要的对象创建和GC压力

#### TimeHub集成优化
- **时间字段同步**: 消除重复计算和无效更新
- **订阅机制**: 优化事件监听器，减少内存泄漏风险
- **缓存策略**: 智能缓存时间计算结果

### 调试工具

#### 开发者控制台
```javascript
// EventService 调试工具
EventService.getDebugInfo();          // 获取调试信息
EventService.clearCache();            // 清除缓存
EventService.validateIntegrity();     // 数据完整性检查

// 循环更新监控
EventService.startCircularMonitor();  // 开始监控
EventService.getCircularStats();      // 获取统计信息
EventService.exportEventHistory();    // 导出事件历史
```

---

## 📋 目录

1. [架构概述](#1-架构概述)
2. [EventHub - 事件状态管理中心](#2-eventhub---事件状态管理中心)
3. [TimeHub - 时间意图管理中心](#3-timehub---时间意图管理中心)
4. [集成模式](#4-集成模式)
5. [数据流向](#5-数据流向)
6. [最佳实践](#6-最佳实践)
7. [常见问题](#7-常见问题)

---

## 1. 架构概述

### 1.1 设计理念

**EventHub** 和 **TimeHub** 是 4DNote 应用的两个核心状态管理中心，共同实现了**单一数据源（Single Source of Truth）**原则：

- **EventHub**: 管理事件的**所有非时间字段**（标题、标签、描述、优先级、组织者、参会人等）
- **TimeHub**: 管理事件的**时间字段和时间意图**（start/end/allDay/TimeSpec）

> **注意**: 组织者（organizer）和参会人（attendees）字段由 EventHub 管理，这些字段主要用于与 Microsoft Outlook 同步，支持会议协作场景。详见 [EventEditModal PRD](../PRD/EVENTEDITMODAL_MODULE_PRD.md#event-数据结构)。

### 1.2 版本更新历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| **v1.0** | 2025-11-06 | 初始版本，定义 EventHub/TimeHub 职责 |
| **v1.1** | 2025-11-06 | 添加 EventEditModal v2 新字段支持（emoji, isTimeCalendar, 任务关联字段） |
| **v1.2** | 2025-11-14 | 🔥 移除 displayHint 存储依赖，时间显示完全基于动态计算 |
| **v1.3** | 2025-11-14 | 🆕 支持 undefined 时间字段，完善自然语言处理链路文档 |
| **v1.4** | 2025-11-16 | 🆕 添加 Timer 父子事件自动升级机制（parentEventId, timerLogs） |
| **v1.5** | 2025-11-19 | 🎉 循环更新防护机制，性能优化，测试基础设施保护 |
| **v2.15** | 2025-11-27 | 🆕 父-子事件单一配置架构（calendarIds + syncMode + subEventConfig） |
| **v2.15.1** | 2025-11-27 | 🆕 syncMode 同步控制实现（receive-only/send-only/bidirectional） |
| **v2.15.2** | 2025-11-27 | 🔧 EventService 生命周期管理（修复 HMR 导致 syncManager 引用丢失） |

### 1.2 架构图

```mermaid
graph TB
    subgraph "UI Layer"
        A1[PlanManager]
        A2[TimeCalendar]
        A3[EventEditModal]
        A4[TimerCard]
    end
    
    subgraph "State Management Layer"
        B1[EventHub]
        B2[TimeHub]
    end
    
    subgraph "Service Layer"
        C1[EventService]
        C2[TimeParsingService]
    end
    
    subgraph "Storage Layer"
        D1[localStorage Events]
    end
    
    A1 --> B1
    A1 --> B2
    A2 --> B1
    A2 --> B2
    A3 --> B1
    A3 --> B2
    A4 --> B1
    A4 --> B2
    
    B1 --> C1
    B2 --> C1
    B2 --> C2
    
    C1 --> D1
    
    style B1 fill:#f9f,stroke:#333,stroke-width:3px
    style B2 fill:#9ff,stroke:#333,stroke-width:3px
```

### 1.3 职责划分

| 组件 | 职责 | 数据类型 | 代码位置 |
|------|------|----------|----------|
| **EventHub** | 事件状态管理、增量更新、缓存、**时间字段透传到 TimeHub**（便捷封装） | Event (非时间字段) | `src/services/EventHub.ts` |
| **TimeHub** | 时间意图管理、TimeSpec 存储、订阅通知、**支持 undefined 时间** | TimeSpec, start/end | `src/services/TimeHub.ts` |
| **EventService** | 事件 CRUD 统一入口、持久化 | Event (完整) | `src/services/EventService.ts` |
| **parseNaturalLanguage** | 自然语言解析（词典匹配） | rawText → ParseResult | `src/utils/naturalLanguageTimeDictionary.ts` |
| **formatRelativeDate** | 动态计算相对时间显示 | Date → 相对时间字符串 | `src/utils/relativeDateFormatter.ts` |

### 1.4 完整数据链路

#### 用户输入时间 → 持久化
```
DateMention/UnifiedPicker/EditModal
  ↓
TimeHub.setEventTime(eventId, { start, end, allDay })
  ↓
EventService.updateEvent(eventId, { startTime, endTime, isAllDay, timeSpec })
  ↓
localStorage 持久化
  ↓
TimeHub.cache.set() + TimeHub.emit()
  ↓
所有订阅者 (useEventTime) 收到通知并重新渲染
```

#### 初始加载 → 显示
```
PlanManager/TimeCalendar 初始化
  ↓
EventService.getAllEvents() (从 localStorage 读取)
  ↓
planItemsToSlateNodes(items) (转换为 Slate 节点)
  ↓
Slate 编辑器渲染
```

#### 显示时间 (实时订阅)
```
PlanItemTimeDisplay/DateMentionElement 渲染
  ↓
useEventTime(eventId)
  ↓
TimeHub.getSnapshot(eventId)
  ↓
有缓存? 返回缓存
  ↓
无缓存? EventService.getEventById() → 加载到缓存 → 返回
```

#### Slate 编辑保存 → 持久化
```
用户编辑内容并失焦
  ↓
Slate onBlur → flushPendingChanges()
  ↓
slateNodesToPlanItems()
  ↓
TimeHub.getSnapshot(eventId) (读取最新时间)
  ↓
返回 { startTime, endTime }
  ↓
PlanManager.executeBatchUpdate()
  ↓
直接使用 updatedItem (包含从 TimeHub 来的时间)
  ↓
EventService.updateEvent() (保存完整数据)
  ↓
TimeHub 收到 eventsUpdated 事件 → 更新缓存
```

#### 关键原则

**时间的唯一来源: TimeHub**
- ✅ 所有时间**写入**都通过 `TimeHub.setEventTime()`
- ✅ 所有时间**读取**都通过 `TimeHub.getSnapshot()`
- ✅ 所有组件**显示**都通过 `useEventTime(eventId)`

**EventService 的角色**:
- 只负责持久化到 localStorage
- 不直接读取用于显示,只在 TimeHub 缓存未命中时作为数据源
- TimeHub 内部调用 EventService 来持久化和加载

**数据流向**:
```
输入 → TimeHub → EventService(持久化) → TimeHub 缓存 → 显示
      ↑                                          ↓
      └──────── 缓存未命中时从 EventService 加载 ──┘
```

---

## 2. EventHub - 事件状态管理中心

### 2.1 核心概念

**EventHub** 是事件的**内存快照管理器**，提供：
- ✅ **快照缓存**: 避免频繁读取 localStorage
- ✅ **增量更新**: 只更新变化的字段，避免覆盖
- ✅ **全局通知**: 通过 `eventUpdated` 事件通知 UI

### 2.2 核心 API

#### 2.2.1 getSnapshot - 获取事件快照

```typescript
EventHub.getSnapshot(eventId: string): Event | null
```

**用途**: 获取事件的最新状态（从缓存或 EventService）

**示例**:
```typescript
const event = EventHub.getSnapshot('event-123');
if (event) {
  console.log('当前标题:', event.title);
  console.log('当前标签:', event.tags);
}
```

**特性**:
- 优先从内存缓存读取（快速）
- 缓存未命中时从 EventService 冷加载
- 返回副本，防止外部修改

#### 2.2.2 updateFields - 增量更新

```typescript
EventHub.updateFields(
  eventId: string,
  updates: Partial<Event>,
  options?: { skipSync?: boolean; source?: string }
): Promise<Result>
```

**用途**: 只更新指定字段，避免覆盖其他字段

**示例**:
```typescript
// ✅ 正确：只更新标题和标签（传递 EventTitle 对象）
await EventHub.updateFields('event-123', {
  title: { simpleTitle: '新标题' },  // ✅ EventTitle 对象
  tags: ['tag1', 'tag2']
}, { source: 'PlanManager' });

// ❌ 错误：传递字符串给 title
await EventHub.updateFields('event-123', {
  title: '新标题',  // ❌ 应该是 EventTitle 对象
  tags: ['tag1', 'tag2']
});

// ❌ 错误：覆盖整个对象
const event = EventHub.getSnapshot('event-123');
event.title = { simpleTitle: '新标题' };
await EventService.updateEvent('event-123', event); // 会覆盖 description 等字段！
```

**特性**:
- 自动合并当前快照
- 记录字段变化（调试用）
- 更新缓存 + 持久化到 EventService
- 发出 `eventUpdated` 全局事件

#### 2.2.3 setEventTime - 时间字段便捷方法（内部调用 TimeHub）

```typescript
EventHub.setEventTime(
  eventId: string,
  timeInput: {
    start?: string | Date | undefined;
    end?: string | Date | undefined;
    kind?: TimeKind;
    allDay?: boolean;
    source?: TimeSource;
  },
  options?: { skipSync?: boolean }
): Promise<Result>
```

**用途**: **便捷封装**，内部直接调用 `TimeHub.setEventTime()`

**⚠️ 重要**: EventHub **不直接处理时间字段**，只是透传到 TimeHub

**⚠️ 不推荐使用**: 应该直接调用 `TimeHub.setEventTime()`，职责更明确

**示例**:
```typescript
// ✅ 推荐: 直接调用 TimeHub
await TimeHub.setEventTime('event-123', {
  start: '2025-11-06 09:00:00',
  end: '2025-11-06 10:00:00',
  kind: 'range',
  source: 'picker'
});
```

#### 2.2.4 createEvent - 创建事件

```typescript
EventHub.createEvent(event: Event, options?: { skipSync?: boolean }): Promise<Result>
```

**用途**: 创建新事件并缓存

#### 2.2.5 deleteEvent - 删除事件

```typescript
EventHub.deleteEvent(eventId: string, options?: { skipSync?: boolean }): Promise<Result>
```

**用途**: 删除事件并清除缓存

#### 2.2.6 invalidate - 清除缓存

```typescript
EventHub.invalidate(eventId: string): void
EventHub.invalidateAll(): void
```

**用途**: 强制下次 `getSnapshot` 从 EventService 重新加载

---

## 3. TimeHub - 时间意图管理中心

### 3.1 核心概念

**TimeHub** 是时间字段的**单一数据源**，管理：
- ✅ **TimeSpec**: 用户的原始时间意图（如 "下周"、"明天9点"）
- ✅ **标准化时间**: start/end 的 ISO 字符串
- ✅ **订阅机制**: React Hook 订阅时间变化

### 3.2 TimeSpec 数据结构

```typescript
interface TimeSpec {
  kind: 'fixed' | 'range' | 'all-day' | 'deadline' | 'window' | 'fuzzy';
  source: 'picker' | 'parser' | 'timer' | 'import' | 'system';
  rawText?: string;           // 原始输入（如 "下周"）
  policy?: TimePolicy;        // 时间策略（weekStart, defaultTimeOfDay 等）
  start?: string;             // 标准化开始时间
  end?: string;               // 标准化结束时间
  allDay?: boolean;           // 是否全天
  resolved?: { start, end };  // 解析后的具体时间
  window?: { start, end, label }; // 窗口类型的边界
}
```

### 3.3 核心 API

#### 3.3.1 getSnapshot - 获取时间快照

```typescript
TimeHub.getSnapshot(eventId: string): TimeGetResult
```

**返回值**:
```typescript
interface TimeGetResult {
  timeSpec?: TimeSpec;
  start?: string;
  end?: string;
}
```

**示例**:
```typescript
const timeData = TimeHub.getSnapshot('event-123');
console.log('开始时间:', timeData.start);
console.log('结束时间:', timeData.end);
console.log('原始输入:', timeData.timeSpec?.rawText);
```

#### 3.3.2 setEventTime - 设置时间

```typescript
TimeHub.setEventTime(
  eventId: string,
  input: SetEventTimeInput,
  options?: { skipSync?: boolean }
): Promise<Result>
```

**输入参数**:
```typescript
interface SetEventTimeInput {
  start?: string | Date | null;  // ✅ 使用 null 清除时间（JSON 兼容）
  end?: string | Date | null;    // ✅ 使用 null 清除时间（JSON 兼容）
  kind?: TimeKind;
  allDay?: boolean;
  source?: TimeSource;
  policy?: Partial<TimePolicy>;
  rawText?: string;
  timeSpec?: TimeSpec;  // 直接替换 TimeSpec
}
```

**⚠️ 重要变更 (v1.8 - 2025-11-25)**: 
- 时间清除统一使用 `null` 而非 `undefined`
- **原因**: `JSON.stringify()` 会忽略 `undefined`，导致字段无法清除
- **影响**: 所有调用 `setEventTime` 的代码需更新
- **详见**: [UNDEFINED_VS_NULL_TIME_FIELDS_FIX.md](../fixes/UNDEFINED_VS_NULL_TIME_FIELDS_FIX.md)

**示例**:
```typescript
// 方式 1: 直接设置时间
await TimeHub.setEventTime('event-123', {
  start: '2025-11-06 09:00:00',  // ✅ 使用空格分隔符
  end: '2025-11-06 10:00:00',
  kind: 'range',
  source: 'picker'
});

// 方式 2: 清除时间（支持 Task 类型）
await TimeHub.setEventTime('event-123', {
  start: null,  // ✅ 使用 null（v1.8 变更）
  end: null,    // ✅ 使用 null（v1.8 变更）
  source: 'user'
});

// ❌ 错误：使用 undefined 会导致字段无法清除
await TimeHub.setEventTime('event-123', {
  start: '2025-11-24 10:00:00',
  end: undefined,  // ❌ JSON 序列化后丢失，旧值无法清除
  source: 'picker'
});

// 方式 3: 解析自然语言
await TimeHub.setFuzzy('event-123', '下周一早上9点');
```

#### 3.3.3 setFuzzy - 自然语言解析

```typescript
TimeHub.setFuzzy(
  eventId: string,
  rawText: string,
  options?: { policy?: Partial<TimePolicy> }
): Promise<Result>
```

**用途**: 解析自然语言时间（如 "下周"、"明天9点"）

**示例**:
```typescript
await TimeHub.setFuzzy('event-123', '下周一到周五');
// → 自动解析为 window: { start: '2025-11-11', end: '2025-11-15' }
```

#### 3.3.4 subscribe - 订阅时间变化

```typescript
TimeHub.subscribe(eventId: string, callback: () => void): () => void
```

**用途**: 监听某个事件的时间变化

**示例**:
```typescript
const unsubscribe = TimeHub.subscribe('event-123', () => {
  console.log('事件时间已更新');
  const newTime = TimeHub.getSnapshot('event-123');
  updateUI(newTime);
});

// 取消订阅
unsubscribe();
```

#### 3.3.5 setTimerWindow - Timer 专用更新

```typescript
TimeHub.setTimerWindow(
  eventId: string,
  input: { start: Date; end: Date }
): Promise<Result>
```

**用途**: Timer 运行中更新时间窗口，跳过外部同步

---

## 4. 集成模式

### 4.1 React Hook: useEventTime

**代码位置**: `src/hooks/useEventTime.ts`

**用途**: 在 React 组件中订阅事件时间

**示例**:
```typescript
function EventTimeDisplay({ eventId }: { eventId: string }) {
  const { start, end, timeSpec, setEventTime } = useEventTime(eventId);
  
  return (
    <div>
      <p>开始: {start}</p>
      <p>结束: {end}</p>
      <p>原始输入: {timeSpec?.rawText}</p>
      
      <button onClick={() => setEventTime({
        start: '2025-11-06 14:00:00',  // ✅ 空格分隔符
        end: '2025-11-06 15:00:00'
      })}>
        更新时间
      </button>
    </div>
  );
}
```

**特性**:
- 使用 `useSyncExternalStore` 实现
- 自动订阅/取消订阅
- eventId 为空时返回冻结的空快照

### 4.2 组件集成最佳实践

#### 4.2.1 PlanManager 集成

```typescript
// ✅ 推荐：使用 TimeHub 订阅
const EventTimeComponent = ({ itemId }: { itemId: string }) => {
  const eventTime = useEventTime(itemId);
  
  return (
    <span>
      {eventTime.start ? formatTime(eventTime.start) : 'No time'}
    </span>
  );
};

// ✅ 更新时间通过 TimeHub
await TimeHub.setEventTime(itemId, {
  start: newStart,
  end: newEnd
});

// ✅ 更新非时间字段通过 EventHub
await EventHub.updateFields(itemId, {
  title: newTitle,
  tags: newTags
});
```

#### 4.2.2 FloatingToolbar 集成

```typescript
<HeadlessFloatingToolbar
  eventId={itemId}
  useTimeHub={true}  // ✅ 启用 TimeHub
  onTimeApplied={(eventId, { start, end }) => {
    // TimeHub 已自动更新，这里只更新 UI
    console.log('时间已更新:', start, end);
    
    // ⚠️ 不要再调用 syncToUnifiedTimeline
    // 因为 TimeHub 已经更新了 Event 的时间字段
  }}
/>
```

#### 4.2.3 EventEditModal 集成

```typescript
const handleSave = async (updatedEvent: Event) => {
  // ✅ 增量更新非时间字段
  await EventHub.updateFields(eventId, {
    title: updatedEvent.title,
    description: updatedEvent.description,
    tags: updatedEvent.tags,
    priority: updatedEvent.priority
  });
  
  // ✅ 更新时间字段
  await TimeHub.setEventTime(eventId, {
    start: updatedEvent.startTime,
    end: updatedEvent.endTime,
    allDay: updatedEvent.isAllDay,
    source: 'picker'
  });

#### 4.2.4 DateMentionElement 集成 (v2.9) 🆕

**用途**: Slate 编辑器中的 DateMention 元素，支持实时过期检测和悬浮卡片显示

**代码位置**: `src/components/Slate/elements/DateMentionElement.tsx`

**集成模式**:
```typescript
// ✅ 订阅 TimeHub 实时时间
const eventTime = useEventTime(eventId);

// ✅ 实时过期检测
const isOutdated = useMemo(() => {
  if (!eventTime.start || !dateMentionElement.date) return false;
  const hubTime = new Date(eventTime.start);
  const mentionTime = new Date(dateMentionElement.date);
  return hubTime.getTime() !== mentionTime.getTime();
}, [eventTime.start, dateMentionElement.date]);

// ✅ 计算时间差（用于悬浮卡片显示）
const timeDiff = useMemo(() => {
  if (!isOutdated || !eventTime.start || !dateMentionElement.date) return null;
  const hubTime = new Date(eventTime.start);
  const mentionTime = new Date(dateMentionElement.date);
  // 注意：hubTime 在前，mentionTime 在后
  return calculateTimeDiff(hubTime, mentionTime);
}, [isOutdated, eventTime.start, dateMentionElement.date]);

// ✅ 更新到当前时间（同步到 TimeHub）
const handleUpdateToCurrentTime = useCallback(() => {
  const hubTime = new Date(eventTime.start);
  const displayText = formatRelativeTimeDisplay(
    eventTime.start,
    eventTime.end || eventTime.start,
    eventTime.allDay || false
  );
  
  // 更新 Slate 节点
  Transforms.setNodes(editor, {
    date: hubTime.toISOString(),
    displayText,
  }, { at: path });
  
  setIsPopoverVisible(false);
}, [eventTime, editor, path]);
```

**核心特性**:
1. **实时订阅**: 通过 `useEventTime(eventId)` 订阅 TimeHub，自动响应时间变化
2. **过期检测**: 比较 DateMention 节点时间与 TimeHub 时间，检测不一致
3. **悬浮卡片**: 使用 Tippy.js 显示详细时间差和操作按钮（取消/删除/更新）
4. **时间同步**: 点击"更新"按钮将 DateMention 同步到 TimeHub 最新时间

**显示逻辑**:
```typescript
// 优先使用 TimeHub 数据（实时）
const displayText = useMemo(() => {
  if (eventTime.start) {
    return formatRelativeTimeDisplay(
      eventTime.start,
      eventTime.end || eventTime.start,
      eventTime.allDay || false
    );
  }
  // 回退到节点自带数据
  return dateMentionElement.displayText || 
         formatRelativeDate(new Date(dateMentionElement.date));
}, [eventTime, dateMentionElement]);
```

**样式状态**:
- **正常**: 绿色背景（TimeHub 与 DateMention 时间一致）
- **过期**: 红色背景 + ⚠️ 图标（TimeHub 时间已变更）
- **被删除**: 橙色背景 + 🔶 图标（TimeHub 无时间数据）

**详细文档**: [DATEMENTION_V2.9_UPDATE.md](../features/DATEMENTION_V2.9_UPDATE.md) | [SLATE_EDITOR_PRD.md](../PRD/SLATE_EDITOR_PRD.md#datemention-过期检测与悬浮卡片-v29-)
};
```

---

## 5. 数据流向

### 5.0 🆕 v1.3 自然语言完整处理链路

**核心设计**: 从用户输入自然语言到最终显示，完全不依赖存储的 `displayHint`，实现动态计算。

#### 5.0.1 完整数据流图

```mermaid
graph TB
    subgraph "输入阶段"
        A1[用户输入: 下周三中午12点] --> A2[UnifiedDateTimePicker]
        A2 --> A3[handleSearchBlur]
    end
    
    subgraph "解析阶段"
        A3 --> B1[parseNaturalLanguage 词典]
        B1 --> B2{匹配成功?}
        B2 -->|是| B3[ParseResult]
        B2 -->|否| B4[chrono.zh Fallback]
        B4 --> B3
    end
    
    subgraph "UI 状态阶段"
        B3 --> C1[设置 selectedDates]
        B3 --> C2[设置 startTime/endTime]
        B3 --> C3[设置 fuzzyTimeName]
    end
    
    subgraph "写入阶段"
        C1 --> D1[用户点击确定]
        C2 --> D1
        C3 --> D1
        D1 --> D2[TimeHub.setEventTime]
        D2 --> D3["保存 startTime: 2025-11-20 12:00:00"]
        D2 --> D4["保存 timeFieldState: [12, 0, null, null]"]
        D2 --> D5["保存 isFuzzyTime: false"]
        D3 --> D6[EventService 持久化]
        D4 --> D6
        D5 --> D6
    end
    
    subgraph "显示阶段"
        D6 --> E1[PlanManager 读取 Event]
        E1 --> E2["获取 startTime: 2025-11-20 12:00:00"]
        E2 --> E3[formatRelativeDate 动态计算]
        E3 --> E4["显示: 下周三 12:00"]
        E4 --> E5[时间流逝...]
        E5 --> E6[formatRelativeDate 重新计算]
        E6 --> E7["显示: 昨天 12:00"]
    end
    
    style B1 fill:#90EE90
    style D2 fill:#87CEEB
    style E3 fill:#FFD700
    style E6 fill:#FFD700
```

#### 5.0.2 自然语言输入 → 解析

```typescript
// 步骤 1: 用户在 UnifiedDateTimePicker 输入 "下周三中午12点"
const handleSearchBlur = () => {
  const customParsed = parseNaturalLanguage(searchInput);
  // customParsed = {
  //   matched: true,
  //   pointInTime: { date: dayjs('2025-11-20'), displayHint: '下周三' },
  //   timePeriod: { startHour: 12, startMinute: 0, name: '中午12点' }
  // }
}
```

**parseNaturalLanguage 匹配逻辑**:
```typescript
// 文件：src/utils/naturalLanguageTimeDictionary.ts
export function parseNaturalLanguage(input: string): ParseResult {
  // 1. 优先匹配精确时间点（如"下周三"）
  for (const [pointKey, pointFunc] of POINT_IN_TIME_DICTIONARY) {
    if (input.includes(pointKey)) {
      const pointInTime = pointFunc(new Date());
      return { pointInTime, matched: true };
    }
  }
  
  // 2. 匹配日期范围（如"周末"）
  for (const [dateKey, dateFunc] of DATE_RANGE_DICTIONARY) {
    if (input.includes(dateKey)) {
      const dateRange = dateFunc(new Date());
      
      // 3. 检查是否包含时间段（如"中午12点"）
      for (const [timeKey, timePeriod] of TIME_PERIOD_DICTIONARY) {
        if (input.includes(timeKey)) {
          return { dateRange, timePeriod, matched: true };
        }
      }
      
      return { dateRange, matched: true };
    }
  }
  
  // 4. Fallback: chrono.zh 解析
  return { matched: false };
}
```

#### 5.0.3 解析结果 → UI 状态

```typescript
// 步骤 2: 设置 Picker 内部状态
if (customParsed.pointInTime) {
  setSelectedDates({
    start: dayjs('2025-11-20'),  // ✅ 只存储日期
    end: dayjs('2025-11-20')
  });
  // ❌ 不设置 displayHint（移除存储）
}

if (customParsed.timePeriod) {
  setStartTime({ hour: 12, minute: 0 });  // ✅ 只存储时间值
  setEndTime(null);  // 精确开始时间，无结束时间
  setFuzzyTimeName('中午12点');  // UI 显示用
}
```

#### 5.0.4 UI 状态 → TimeHub 写入

```typescript
// 步骤 3: 用户点击"确定"，写入 TimeHub
const handleApply = async () => {
  const startDateTime = selectedDates.start
    .hour(startTime.hour)
    .minute(startTime.minute);
  
  const startIso = startDateTime.format('YYYY-MM-DD HH:mm:ss');
  // → '2025-11-20 12:00:00'
  
  await TimeHub.setEventTime(eventId, {
    start: startIso,
    end: startIso,  // 精确开始时间，end = start
    kind: 'fixed',
    source: 'picker',
    isFuzzyTime: false,  // ✅ 中午12点是精确时间
    timeFieldState: [12, 0, null, null],  // ✅ 只有开始时间
    // ❌ 不再传递 displayHint
  });
};
```

#### 5.0.5 TimeHub → Event 持久化

```typescript
// 步骤 4: TimeHub 内部处理
TimeHub.setEventTime(eventId, input) {
  // 1. 更新 Event 对象
  const event = {
    ...existingEvent,
    startTime: '2025-11-20 12:00:00',  // ✅ 绝对时间
    endTime: '2025-11-20 12:00:00',
    timeFieldState: [12, 0, null, null],  // ✅ 时间字段状态
    isFuzzyTime: false,
    // ❌ 不存储 displayHint
  };
  
  // 2. 调用 EventService 持久化
  await EventService.updateEvent(eventId, event);
  
  // 3. 触发事件通知
  window.dispatchEvent(new CustomEvent('eventsUpdated'));
  window.dispatchEvent(new CustomEvent('timeChanged', { detail: { eventId } }));
}
```

#### 5.0.6 Event → 动态显示

```typescript
// 步骤 5: PlanManager 显示时动态计算
// 文件：src/utils/relativeDateFormatter.ts
function formatRelativeTimeDisplay(event: Event): string {
  if (!event.startTime) return '';
  
  const startDate = parseLocalTimeString(event.startTime);
  const today = new Date();
  
  // ✅ 动态计算相对日期
  const relativeDate = formatRelativeDate(startDate, today);
  // → "下周三"（如果今天是 2025-11-13）
  // → "昨天"（如果今天是 2025-11-21）
  
  // ✅ 从 timeFieldState 读取时间
  const [startHour, startMinute] = event.timeFieldState || [null, null];
  
  if (startHour !== null && startMinute !== null) {
    return `${relativeDate} ${startHour}:${String(startMinute).padStart(2, '0')}`;
    // → "下周三 12:00"
  }
  
  return relativeDate;
}
```

**formatRelativeDate 动态计算逻辑**:
```typescript
function formatRelativeDate(targetDate: Date, today: Date = new Date()): string {
  const daysDiff = calculateDaysDiff(targetDate, today);
  
  // ✅ 动态计算，随时间变化
  if (daysDiff === 0) return "今天";
  if (daysDiff === 1) return "明天";
  if (daysDiff === -1) return "昨天";
  if (daysDiff === 2) return "后天";
  if (daysDiff === -2) return "前天";
  
  // 本周/下周判断
  const targetWeek = getWeekNumber(targetDate);
  const todayWeek = getWeekNumber(today);
  
  if (targetWeek === todayWeek) {
    return `本周${getWeekdayName(targetDate)}`;  // "本周三"
  } else if (targetWeek === todayWeek + 1) {
    return `下周${getWeekdayName(targetDate)}`;  // "下周三"
  } else if (targetWeek === todayWeek - 1) {
    return `上周${getWeekdayName(targetDate)}`;  // "上周三"
  }
  
  // 更远的日期显示绝对日期
  return formatAbsoluteDate(targetDate);  // "11月20日"
}
```

#### 5.0.7 核心优势总结

| 阶段 | 旧架构（v2.8.1） | 新架构（v1.3） |
|------|-----------------|---------------|
| **解析** | parseNaturalLanguage → ParseResult | ✅ 同左 |
| **UI 状态** | 生成 displayHint = "下周三中午12点" | ✅ 只存储 selectedDates + startTime |
| **写入** | 保存 displayHint 到数据库 | ❌ 不保存 displayHint |
| **存储** | `{ displayHint: "下周三中午12点", startTime: "2025-11-20 12:00:00" }` | ✅ `{ startTime: "2025-11-20 12:00:00", timeFieldState: [12, 0, null, null] }` |
| **显示** | 直接返回 displayHint | ✅ formatRelativeDate 动态计算 |
| **时间变化** | 永远显示 "下周三" | ✅ 自动变成 "昨天" |
| **远程同步** | ❌ 无 displayHint，无法显示 | ✅ 只需要 startTime，完美支持 |

### 5.0 🆕 v2.8.2 新架构：动态时间显示

**核心变更**: 移除 `displayHint` 字段的存储和传递，时间显示完全基于动态计算。

#### 5.0.1 旧架构（v2.8.1 及之前）的问题

❌ **问题 1: displayHint 存储在数据库**
```typescript
// ❌ 旧流程：Picker 生成 displayHint 并保存
自然语言输入 → 词典解析 → Picker 拼接 displayHint 
→ TimeHub.setEventTime({ displayHint: "下周三下午1点" }) 
→ 保存到 Event 数据库
```

❌ **问题 2: 远程同步事件无法显示**
- 远程同步的 Event **没有** displayHint 字段
- 导致远程事件无法显示友好的相对时间
- 只能显示原始的 "2025-11-20 13:00:00"

❌ **问题 3: 时间显示不会自动更新**
- displayHint = "下周三" 保存后永远是 "下周三"
- 即使过了一周，仍显示 "下周三" 而非 "上周三"

#### 5.0.2 新架构（v2.8.2）解决方案

✅ **写入路径**（用户输入）:
```typescript
自然语言输入 → 词典解析 → TimeHub.setEventTime()
→ 只保存 startTime/endTime + timeFieldState
→ Event 数据库

// 示例：输入 "下周三下午1点"
TimeHub.setEventTime(eventId, {
  start: "2025-11-20 13:00:00",  // ✅ 只存储绝对时间
  end: "2025-11-20 13:00:00",
  isFuzzyTime: false,            // ✅ 时间类型标记
  timeFieldState: [13, 0, null, null]  // ✅ 时间字段状态
  // ❌ 不再保存 displayHint
});
```

✅ **读取路径**（显示时）:
```typescript
Event (startTime/endTime) → formatRelativeTimeDisplay()
→ 动态调用 formatRelativeDate(startTime, now) 
→ 实时计算相对时间
→ PlanManager 显示 "下周三 13:00"

// 示例：显示逻辑
function formatRelativeDate(targetDate: Date, today: Date = new Date()): string {
  const daysDiff = calculateDaysDiff(targetDate, today);
  
  if (daysDiff === 0) return "今天";      // ✅ 动态计算
  if (daysDiff === 1) return "明天";      // ✅ 随时间变化
  if (daysDiff === -1) return "昨天";     // ✅ 自动更新
  
  // ... 更多逻辑，详见 relativeDateFormatter.ts
}
```

✅ **核心优势**:
1. **远程同步完美支持**: 只要有 startTime/endTime，就能自动显示相对时间
2. **时间显示自动更新**: "下周三" → 过了之后自动变成 "上周三"
3. **架构统一**: 所有事件（本地/远程）显示逻辑一致
4. **无存储依赖**: 不依赖可能不存在的 displayHint 字段

✅ **数据流对比**:
```mermaid
graph LR
    subgraph "v2.8.2 新架构 ✅"
        A1[自然语言] --> B1[词典解析]
        B1 --> C1[TimeHub.setEventTime]
        C1 --> D1["只保存 startTime/endTime"]
        D1 --> E1[Event 数据库]
        E1 --> F1[formatRelativeDate]
        F1 --> G1["动态计算相对时间"]
        G1 --> H1[PlanManager 显示]
    end
    
    subgraph "v2.8.1 旧架构 ❌"
        A2[自然语言] --> B2[词典解析]
        B2 --> C2[Picker 拼接]
        C2 --> D2["保存 displayHint"]
        D2 --> E2[Event 数据库]
        E2 --> F2[formatRelativeDate]
        F2 --> G2["直接返回 displayHint"]
        G2 --> H2[PlanManager 显示]
    end
    
    style A1 fill:#90EE90
    style G1 fill:#90EE90
    style D2 fill:#FFB6C6
    style G2 fill:#FFB6C6
```

### 5.1 创建事件流程

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant EH as EventHub
    participant TH as TimeHub
    participant ES as EventService
    participant LS as localStorage
    
    UI->>EH: createEvent(newEvent)
    EH->>ES: createEvent(newEvent)
    ES->>LS: 保存到 localStorage
    ES->>UI: 触发 eventsUpdated
    
    UI->>TH: setEventTime(eventId, { start, end })
    TH->>ES: updateEvent(eventId, { startTime, endTime, timeSpec })
    ES->>LS: 更新 localStorage
    ES->>UI: 触发 eventsUpdated
    TH->>UI: 触发 timeChanged
```

### 5.2 更新事件流程

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant EH as EventHub
    participant TH as TimeHub
    participant ES as EventService
    
    UI->>EH: updateFields(eventId, { title, tags })
    EH->>EH: 合并当前快照
    EH->>ES: updateEvent(eventId, mergedEvent)
    ES->>UI: 触发 eventsUpdated
    
    UI->>TH: setEventTime(eventId, { start, end })
    TH->>TH: 创建 TimeSpec
    TH->>ES: updateEvent(eventId, { startTime, endTime, timeSpec })
    ES->>UI: 触发 eventsUpdated + timeChanged
```

### 5.3 订阅机制

```mermaid
graph LR
    A[useEventTime Hook] --> B[TimeHub.subscribe]
    B --> C[存储 callback]
    D[TimeHub.setEventTime] --> E[更新 EventService]
    E --> F[触发 eventsUpdated]
    F --> G[调用所有 callbacks]
    G --> A
    A --> H[组件重新渲染]
```

---

## 6. 最佳实践

### 6.1 何时使用 EventHub vs EventService

| 场景 | 使用 | 原因 |
|------|------|------|
| **增量更新部分字段** | EventHub.updateFields | 避免覆盖其他字段 |
| **批量更新多个字段** | EventHub.updateFields | 一次性更新，性能更好 |
| **查询最新状态** | EventHub.getSnapshot | 优先使用缓存，快速 |
| **创建新事件** | EventHub.createEvent | 自动缓存 |
| **删除事件** | EventHub.deleteEvent | 自动清除缓存 |
| **需要跳过同步** | EventService 直接调用 | 提供 skipSync 参数 |

### 6.2 何时使用 TimeHub

| 场景 | 使用 | 原因 |
|------|------|------|
| **设置时间字段** | TimeHub.setEventTime | 保留时间意图，支持 undefined |
| **清除时间字段** | TimeHub.setEventTime({ start: undefined }) | 支持 Task 类型无时间事件 |
| **解析自然语言** | TimeHub.setFuzzy | 自动创建 TimeSpec |
| **订阅时间变化** | TimeHub.subscribe 或 useEventTime | 响应式更新 |
| **Timer 更新** | TimeHub.setTimerWindow | 跳过外部同步 |
| **获取时间快照** | TimeHub.getSnapshot | 获取 TimeSpec |

### 6.3 如何正确使用 title 字段（v2.14+）

#### ✅ 正确使用方式

**场景 1: 创建新事件**
```typescript
// ✅ 只传一个字段，EventService 自动生成其他字段
await EventHub.createEvent({
  id: 'event-123',
  title: { simpleTitle: '会议' },  // 自动生成 colorTitle 和 fullTitle
  // ... 其他字段
});
```

**场景 2: 更新标题**
```typescript
// ✅ 增量更新 title
await EventHub.updateFields('event-123', {
  title: { simpleTitle: '更新后的标题' }
});

// ✅ 或者更新富文本标题
await EventHub.updateFields('event-123', {
  title: { colorTitle: '<span>🔥 重要会议</span>' }
});
```

**场景 3: 读取标题**
```typescript
// ✅ 根据场景选择合适的字段
const event = EventHub.getSnapshot('event-123');

// 纯文本场景（搜索、同步、日志）
console.log(event.title?.simpleTitle);

// 富文本显示（UpcomingPanel）
console.log(event.title?.colorTitle);

// Slate 编辑器
console.log(event.title?.fullTitle);
```

#### ❌ 错误使用方式

```typescript
// ❌ 错误 1: 传递字符串
await EventHub.updateFields('event-123', {
  title: '新标题'  // ❌ 应该是 { simpleTitle: '新标题' }
});

// ❌ 错误 2: 手动转换
const colorTitle = simpleToColorTitle(simpleTitle);  // ❌ 不需要手动转换
const fullTitle = colorToFullTitle(colorTitle);      // ❌ EventService 会自动处理

// ❌ 错误 3: 直接访问不存在的字段
console.log(event.title.substring());  // ❌ title 是对象，不是字符串
```

### 6.4 避免常见错误

#### ❌ 错误 1: 直接修改 getSnapshot 返回值

```typescript
// ❌ 错误
const event = EventHub.getSnapshot('event-123');
event.title = { simpleTitle: '新标题' };
await EventService.updateEvent('event-123', event);
```

**问题**: 没有通过 EventHub 更新，缓存不一致

**✅ 正确**:
```typescript
await EventHub.updateFields('event-123', {
  title: { simpleTitle: '新标题' }  // ✅ 传递 EventTitle 对象
});
```

#### ❌ 错误 2: 覆盖整个事件对象

```typescript
// ❌ 错误
const updatedEvent = {
  ...existingEvent,
  title: '新标题'  // ❌ 应该是 EventTitle 对象
  // description 可能被覆盖为 undefined！
};
await EventService.updateEvent('event-123', updatedEvent);
```

**✅ 正确**:
```typescript
await EventHub.updateFields('event-123', {
  title: { simpleTitle: '新标题' }  // ✅ EventTitle 对象
  // 其他字段保持不变
  // EventService.normalizeTitle() 会自动生成 colorTitle 和 fullTitle
});
```

#### ❌ 错误 3: 时间更新后再调用 syncToUnifiedTimeline

```typescript
// ❌ 错误
await TimeHub.setEventTime(eventId, { start, end });
syncToUnifiedTimeline(item); // ⚠️ 会覆盖 TimeHub 刚写入的时间！
```

**✅ 正确**:
```typescript
await TimeHub.setEventTime(eventId, { start, end });
// 时间已更新，无需再同步
```

#### ❌ 错误 4: 不使用 TimeHub 直接更新时间

```typescript
// ❌ 错误
await EventService.updateEvent(eventId, {
  startTime: newStart,
  endTime: newEnd
  // timeSpec 丢失了！
});
```

**✅ 正确**:
```typescript
await TimeHub.setEventTime(eventId, {
  start: newStart,
  end: newEnd,
  source: 'picker'
  // 自动创建/更新 timeSpec
});
```

#### ❌ 错误 5: 尝试创建 clearEventTime() 方法

```typescript
// ❌ 错误：多余的封装
class EventHub {
  async clearEventTime(eventId: string) {
    await TimeHub.clearEventTime(eventId);  // ← 不需要
  }
}
```

**✅ 正确**:
```typescript
// 直接使用 TimeHub.setEventTime 支持 undefined
await TimeHub.setEventTime(eventId, {
  start: undefined,
  end: undefined,
  source: 'user'
});
```

**原因**: 
- `setEventTime` 已支持 `undefined`，无需单独的清除方法
- 保持 API 简洁，一个功能一个方法

---

## 6.7 Checkbox 状态同步机制 (v2.14.1 新增)

### 核心原理

**问题**: 用户点击 checkbox 后，UI 不立即更新，需要刷新页面
**根本原因**: 
1. eventsUpdated 监听器未同步 `checked`/`unchecked` 数组到 Slate metadata
2. React.memo 比较函数使用 EventService 而非 Slate metadata

**解决方案**: 建立 EventService → eventsUpdated → Slate metadata → React 的完整同步链路

### 数据流设计

```
┌──────────────────────────────────────────────────────────────┐
│  User Interaction                                            │
└──────────────────┬───────────────────────────────────────────┘
                   │ onClick checkbox
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  EventLinePrefix Component                                   │
│  - 读取 element.metadata.checked/unchecked                   │
│  - 计算 isCompleted = lastChecked > lastUnchecked            │
│  - onChange: EventService.checkIn/uncheck()                  │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  EventService (localStorage)                                 │
│  - checked: [timestamp1, timestamp2, ...]                    │
│  - unchecked: [timestamp3, timestamp4, ...]                  │
│  - 触发 window.dispatchEvent('eventsUpdated')                │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  PlanSlate (eventsUpdated listener)                 │
│  1. EventService.getEventById(eventId)                       │
│  2. Transforms.setNodes({ metadata: { checked, unchecked }}) │
│  3. setValue([...editor.children]) - 强制重新渲染            │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  React.memo Comparison (EventLinePrefix)                     │
│  - 比较 metadata.checked.length                              │
│  - 比较 metadata.unchecked.length                            │
│  - 如果不同 → 触发重新渲染                                   │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  EventLinePrefix Re-render                                   │
│  - 重新计算 isCompleted                                      │
│  - ✅ Checkbox 显示最新状态                                  │
└──────────────────────────────────────────────────────────────┘
```

### 关键实现

#### 1. eventsUpdated 监听器同步数组

**位置**: `PlanSlate.tsx` L850-867

```typescript
const handleEventUpdated = (e: any) => {
  const { eventId } = e.detail || {};
  const updatedEvent = EventService.getEventById(eventId);
  
  // 构建新的 metadata
  const newMetadata = {
    // ...其他字段
    checked: updatedEvent.checked,     // ✅ 关键：同步 checked 数组
    unchecked: updatedEvent.unchecked, // ✅ 关键：同步 unchecked 数组
  };
  
  // 更新 Slate
  Transforms.setNodes(editor, { metadata: newMetadata }, { at: [index] });
  
  // ✅ 强制重新渲染
  skipNextOnChangeRef.current = true;
  setValue([...editor.children]);
};
```

#### 2. EventLinePrefix 状态计算

**位置**: `EventLinePrefix.tsx` L26-35

```typescript
const EventLinePrefixComponent = ({ element }) => {
  const metadata = element.metadata || {};
  
  // ✅ 完全基于 Slate metadata 计算状态
  const lastChecked = metadata.checked?.[metadata.checked.length - 1];
  const lastUnchecked = metadata.unchecked?.[metadata.unchecked.length - 1];
  const isCompleted = lastChecked && (!lastUnchecked || lastChecked > lastUnchecked);
  
  return (
    <input
      type="checkbox"
      checked={!!isCompleted}
      onChange={(e) => {
        // ✅ 只调用 EventService，不操作 Slate
        if (e.target.checked) {
          EventService.checkIn(element.eventId);
        } else {
          EventService.uncheck(element.eventId);
        }
      }}
    />
  );
};
```

#### 3. React.memo 比较函数

**位置**: `EventLinePrefix.tsx` L158-170

```typescript
export const EventLinePrefix = React.memo(
  EventLinePrefixComponent,
  (prevProps, nextProps) => {
    const prevMetadata = prevProps.element.metadata || {};
    const nextMetadata = nextProps.element.metadata || {};
    
    // ✅ 比较 Slate metadata，而不是 EventService
    const prevCheckedCount = prevMetadata.checked?.length || 0;
    const nextCheckedCount = nextMetadata.checked?.length || 0;
    const prevUncheckedCount = prevMetadata.unchecked?.length || 0;
    const nextUncheckedCount = nextMetadata.unchecked?.length || 0;
    
    // 如果数组长度变化 → 返回 false → 重新渲染
    return (
      prevCheckedCount === nextCheckedCount &&
      prevUncheckedCount === nextUncheckedCount &&
      // ...其他字段比较
    );
  }
);
```

### 设计原则

1. **单一数据源**: EventService (localStorage) 是唯一真实来源
2. **事件驱动**: 使用 eventsUpdated 事件广播状态变化
3. **Slate 作为缓存**: metadata 缓存 EventService 数据
4. **避免直接操作**: 组件不直接调用 Transforms，依赖事件流同步
5. **React.memo 优化**: 基于 metadata 比较，避免不必要的重新渲染

### 常见陷阱

❌ **错误做法**:
```typescript
// 在 onChange 中直接操作 Slate
Transforms.setNodes(editor, {
  metadata: { ...metadata, checked: [...metadata.checked, Date.now()] }
});
// 问题：触发 Slate onChange → 可能导致循环更新
```

❌ **错误做法**:
```typescript
// React.memo 比较 EventService 状态
const prevChecked = EventService.getCheckInStatus(prevProps.element.eventId).isChecked;
const nextChecked = EventService.getCheckInStatus(nextProps.element.eventId).isChecked;
return prevChecked === nextChecked;
// 问题：EventService 立即更新，prev 和 next 相同 → 不重新渲染
```

✅ **正确做法**:
```typescript
// 组件只调用 EventService
EventService.checkIn(eventId);
// EventService 触发 eventsUpdated
// PlanSlate 监听器同步到 Slate
// React.memo 检测 metadata 变化
// 组件自动重新渲染
```

### 扩展性

此机制可扩展到其他字段：
- `tags`: 标签数组同步
- `attendees`: 参与者数组同步
- `attachments`: 附件数组同步

只需：
1. 在 eventsUpdated 监听器中添加字段
2. 在 React.memo 比较函数中添加字段
3. 在组件中读取 `element.metadata.字段名`

---

## 7. 常见问题

### 7.1 Q: EventHub 和 TimeHub 的缓存会过期吗？

**A**: 
- **EventHub**: 缓存永不过期，除非调用 `invalidate()`。依赖 `eventsUpdated` 事件保持同步。
- **TimeHub**: 缓存永不过期，除非调用 `cache.delete()`。依赖 `eventsUpdated` 事件保持同步。

### 7.2 Q: 为什么需要两个 Hub？

**A**: 职责分离：
- **EventHub**: 处理事件的**数据层面**（CRUD、缓存、增量更新）
- **TimeHub**: 处理时间的**意图层面**（TimeSpec、自然语言、窗口解析）

### 7.3 Q: Timer 事件为什么需要特殊处理？

**A**: Timer 运行中频繁更新时间（每30秒），需要：
- 使用 `local-only` syncStatus 避免频繁同步
- 使用 `setTimerWindow` 跳过外部同步
- Timer 停止后再同步到 Outlook

### 7.4 Q: 如何调试 EventHub/TimeHub？

**A**: 
```typescript
// 查看 EventHub 缓存
console.log(EventHub.getSnapshot('event-123'));

// 查看 TimeHub 快照
console.log(TimeHub.getSnapshot('event-123'));

// 监听更新事件
window.addEventListener('eventUpdated', (e: any) => {
  console.log('事件更新:', e.detail);
});

window.addEventListener('timeChanged', (e: any) => {
  console.log('时间更新:', e.detail);
});
```

### 7.5 Q: TimeSpec 的 policy 如何工作？

**A**: 
```typescript
// 默认策略 (src/config/time.config.ts)
export const defaultTimePolicy: TimePolicy = {
  weekStart: 1,  // 周一作为每周第一天
  windowResolution: 'snap-to-start',
  defaultTimeOfDay: '09:00'
};

// 组件可以覆盖策略
await TimeHub.setFuzzy('event-123', '下周', {
  policy: {
    weekStart: 0  // 临时使用周日作为每周第一天
  }
});
```

### 7.6 Q: 如何清除事件的时间字段？

**A**: 
```typescript
// ✅ 直接通过 TimeHub
await TimeHub.setEventTime('event-123', {
  start: undefined,
  end: undefined,
  source: 'user'
});

// ❌ 不需要: 单独的 clearEventTime() 方法
```

**使用场景**: 
- Task 类型事件可以没有时间（待办事项）
- 用户删除了时间选择
- 从 Calendar 事件转换为 Task 事件

### 7.7 Q: 自然语言解析的优先级是什么？

**A**: 
```typescript
// 解析优先级（从高到低）:
1. 自定义词典 - 精确时间点（如"下周三"、"月底"、"eom"）
2. 自定义词典 - 日期范围（如"周末"、"下周"）
3. 自定义词典 - 时间段（如"上午"、"中午12点"）
4. chrono.zh - Fallback 通用解析

// 词条匹配规则：按长度从长到短排序，优先匹配更具体的词条
// 例如："下周五"优先于"下周"
```

### 7.8 Q: 为什么不存储 displayHint？

**A**: 
**问题**:
1. ❌ 远程同步的事件没有 displayHint，无法显示友好时间
2. ❌ displayHint = "下周三" 永远是"下周三"，不会自动更新
3. ❌ 增加存储字段，数据冗余

**解决方案**:
1. ✅ 只存储 `startTime`/`endTime`（绝对时间）
2. ✅ 显示时调用 `formatRelativeDate()` 动态计算
3. ✅ 时间流逝后自动更新显示（"下周三" → "昨天"）
4. ✅ 远程同步事件完美支持（只需要 startTime 即可）

---

## 8. Event 类型字段完整定义

### 8.1 核心字段

```typescript
interface Event {
  // ========== 基础标识 ==========
  id: string;                      // 事件唯一标识
  
  // 🆕 v2.14: 标题三层架构（支持富文本、格式化、纯文本）
  title: EventTitle;               // 事件标题（对象类型，包含三个层级）
  
  description?: string;            // 事件描述（HTML 格式）
  emoji?: string;                  // 🆕 v1.1：事件 Emoji 图标
  
  // ========== EventTitle 三层架构（v2.14） ==========
  // 详见下文 8.1.1 EventTitle 三层架构
  
  // ========== 时间字段（由 TimeHub 管理） ==========
  // ⚠️ 重要：时间格式统一为 'YYYY-MM-DD HH:mm:ss'（空格分隔符）
  // ❌ 禁止：不允许使用 ISO 8601 的 'T' 分隔符（如 '2025-11-06T14:00:00'）
  // 原因：数据会同步到 Outlook，ISO 格式会被误认为 UTC 时间，造成时区偏移
  // 详见：TIME_ARCHITECTURE.md 和 src/utils/timeUtils.ts
  startTime?: string;              // 开始时间（'YYYY-MM-DD HH:mm:ss' 格式，本地时间）
  endTime?: string;                // 结束时间（'YYYY-MM-DD HH:mm:ss' 格式，本地时间）
  dueDate?: string;                // 截止日期（'YYYY-MM-DD HH:mm:ss' 格式）
  isAllDay?: boolean;              // 是否全天事件
  timeSpec?: TimeSpec;             // 时间意图对象（TimeHub 专用）
  
  // ========== 分类与标签 ==========
  tags?: string[];                 // 标签 ID 数组
  calendarId?: string;             // 所属日历 ID
  priority?: number;               // 优先级（1-5）
  
  // ========== 协作字段（EventHub 管理） ==========
  organizer?: Contact;             // 组织者
  attendees?: Contact[];           // 参会人列表
  location?: string;               // 地点
  
  // ========== 来源标识（标记创建页面） ==========
  remarkableSource?: boolean;      // 是否由 ReMarkable 创建
  microsoftEventId?: string;       // Outlook 事件 ID
  
  // 【页面来源标记】互斥，只能有一个为 true
  isPlan?: boolean;                // PlanManager 页面创建
  isTimeCalendar?: boolean;        // TimeCalendar 日历区域创建
  isTimer?: boolean;               // Timer 计时器页面创建
  
  // 【事件标记】可与页面来源组合使用
  isDeadline?: boolean;            // 截止日期事件标记
  
  // ========== 任务模式（EventEditModal v2） ==========
  // 【事件类型】影响时间字段要求
  isTask?: boolean;                // 🆕 v1.1：任务类型（true=Task可无时间，false/undefined=Calendar事件必须有时间）
  isCompleted?: boolean;           // 🆕 v1.1：任务是否已完成
  
  // ========== 任务关联（EventEditModal v2） ==========
  parentTaskId?: string;           // 🆕 v1.1：父任务 ID
  childTaskCount?: number;         // 🆕 v1.1：子任务总数
  childTaskCompletedCount?: number; // 🆕 v1.1：已完成子任务数量
  
  // ========== Timer 父子事件关联（v1.4） ==========
  parentEventId?: string;          // 🆕 v1.4：父事件 ID（用于 Timer 子事件关联）
  timerLogs?: string[];            // 🆕 v1.4：计时日志（子 Timer 事件 ID 列表）
  
  // ========== 日历同步配置（v2.15） ==========
  // 🆕 v2.15: 单一配置架构（每个事件独立配置）
  calendarIds?: string[];          // 同步目标日历 ID 列表
  syncMode?: string;               // 同步模式: 'receive-only' | 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private'
  
  // 🆕 v2.15: 父事件专用 - 子事件配置模板
  subEventConfig?: {
    calendarIds?: string[];        // 子事件默认日历配置
    syncMode?: string;             // 子事件默认同步模式
  };
  
  syncedEventId?: string | null;   // 同步到远程日历的事件 ID
  
  // ========== 元数据 ==========
  createdAt?: string;              // 创建时间
  updatedAt?: string;              // 更新时间
  syncStatus?: 'synced' | 'pending' | 'error' | 'local-only'; // 同步状态
}
```

### 8.1.1 EventTitle 三层架构（v2.14）

#### 📋 接口定义

```typescript
/**
 * 事件标题三层架构
 * 自动转换支持：EventService.normalizeTitle() 自动填充缺失层级
 */
interface EventTitle {
  fullTitle?: string;    // Slate JSON 富文本（完整版，包含标签、@人员、格式）
  colorTitle?: string;   // Slate JSON 富文本（简化版，移除 tag/dateMention 元素，保留文本格式）
  simpleTitle?: string;  // 纯文本（用于搜索、同步、日志）
}
```

#### 🎯 设计原理

**问题背景**：
- PlanSlate 需要完整 Slate JSON（标签、元素）
- TimeLog/UpcomingPanel/EditModal 需要可编辑的 Slate JSON（但不需要 tag/dateMention）
- TimeCalendar/搜索/同步 只需要纯文本
- 旧架构混用 `title: string` 导致信息丢失

**解决方案**：三层架构 + 自动转换
1. **fullTitle** (Slate JSON 完整版) - 最完整的数据源，包含所有元素
2. **colorTitle** (Slate JSON 简化版) - 中间层，移除元素节点，保留文本格式
3. **simpleTitle** (纯文本) - 最简化版本

#### 🔄 自动转换机制

EventService 提供自动转换函数：

```typescript
class EventService {
  // 向下降级：fullTitle → colorTitle → simpleTitle
  private static fullTitleToColorTitle(fullTitle: string): string {
    // 解析 Slate JSON，移除 tag/dateMention 元素节点，保留文本和格式（bold/color等）
    // 返回简化的 Slate JSON
  }
  
  private static colorTitleToSimpleTitle(colorTitle: string): string {
    // 解析 Slate JSON，提取所有文本节点，返回纯文本
  }
  
  // 向上升级：simpleTitle → fullTitle (基础 Slate JSON)
  private static simpleTitleToFullTitle(simpleTitle: string): string {
    // 创建简单的 Slate paragraph 节点
  }
  
  // 🔥 核心：自动填充缺失层级
  private static normalizeTitle(titleInput: Partial<EventTitle>): EventTitle {
    // 场景1: 只有 fullTitle → 生成 colorTitle + simpleTitle
    // 场景2: 只有 colorTitle → 生成 simpleTitle + fullTitle
    // 场景3: 只有 simpleTitle → 生成 colorTitle + fullTitle
    // 场景4: 有多个字段 → 填充缺失的
  }
}
```

#### 📊 使用场景映射

| 组件/场景 | 使用字段 | 原因 | 示例 |
|---------|---------|------|------|
| **PlanSlate** | `fullTitle` | 需要完整 Slate JSON（标签、元素） | 保存/读取带标签的标题 |
| **TimeLog** | `fullTitle` | 可编辑的 Slate JSON | 编辑带格式的标题 |
| **UpcomingEventsPanel** | `colorTitle` | 显示 Slate JSON（无元素） | 红色加粗标题（无标签） |
| **EventEditModal** | `colorTitle` | 可编辑的富文本（无标签） | 用户输入带颜色标题 |
| **Timer 模块** | `simpleTitle` | 简单文本显示 | "[专注中] 写文档" |
| **TimeCalendar** | `simpleTitle` | 周/日视图纯文本 | "团队会议" |
| **Outlook 同步** | `simpleTitle` | 远程日历不支持 HTML | "团队会议" |
| **搜索功能** | `simpleTitle` | 全文搜索用纯文本 | 搜索"会议" |
| **日志输出** | `simpleTitle` | console.log 可读性 | 显示前20字符 |

#### 💡 使用示例

```typescript
// ✅ PlanSlate 保存
slateNodeToPlanItem(node) {
  return {
    title: {
      fullTitle: slateToHtml(node),  // 保存完整 Slate JSON
      colorTitle: undefined,          // EventService 自动生成
      simpleTitle: undefined          // EventService 自动生成
    }
  };
}

// ✅ EventService 自动填充
EventService.addEvent({
  title: { 
    fullTitle: '[{"type":"paragraph","children":[{"text":"红色标题","color":"#ff0000"}]}]'
  }
});
// → normalizeTitle() 自动生成:
// {
//   fullTitle: '[{"type":"paragraph","children":[{"text":"红色标题","color":"#ff0000"}]}]',
//   colorTitle: '[{"type":"paragraph","children":[{"text":"红色标题","color":"#ff0000"}]}]',
//   simpleTitle: '红色标题'
// }

// ✅ UpcomingPanel 显示（使用 Slate 编辑器只读模式）
<LogSlate
  mode="title"
  value={event.title?.colorTitle || ''}
  readOnly
/>

// ✅ 搜索过滤
items.filter(item => 
  item.title?.simpleTitle?.toLowerCase().includes(query)
)

// ✅ TimeCalendar 显示
<span>{event.title?.simpleTitle}</span>
```

#### ⚠️ 迁移注意事项

**旧代码模式**（❌ 已废弃）：
```typescript
event.title = "纯文本标题";  // ❌ 类型错误
event.simpleTitle = "...";    // ❌ 字段已移除
event.fullTitle = "...";      // ❌ 字段已移除
```

**新代码模式**（✅ 推荐）：
```typescript
// 创建事件：提供任意一层，其他层自动生成
event.title = { 
  simpleTitle: "标题",
  fullTitle: undefined,
  colorTitle: undefined
};

// 读取事件：根据场景选择合适的层级
const displayTitle = event.title?.colorTitle || event.title?.simpleTitle || '';
const searchText = event.title?.simpleTitle || '';
const slateJson = event.title?.fullTitle || '';
```

#### 🔍 调试技巧

EventService 在转换时输出日志：
```typescript
console.log('[EventService] normalizeTitle - 场景1: 仅 fullTitle');
console.log('[EventService] normalizeTitle - 生成 colorTitle:', colorTitle);
console.log('[EventService] normalizeTitle - 生成 simpleTitle:', simpleTitle);
```

---

### 8.2 新增字段详解（v1.1）

#### 🔖 字段分类层级

事件对象中的布尔标记字段分为三个层级：

**1. 页面来源标记**（互斥，只能有一个为 `true`）：
- `isPlan` - PlanManager 页面创建
- `isTimeCalendar` - TimeCalendar 日历区域创建
- `isTimer` - Timer 计时器页面创建

**2. 事件类型**（影响时间字段要求）：
- `isTask` - 任务类型（`true` = Task 可无时间，`false/undefined` = Calendar 事件必须有时间）

**3. 事件标记**（可与任何页面来源/事件类型组合）：
- `isDeadline` - 截止日期事件标记
- `isCompleted` - 任务完成状态

**字段组合示例**：
```typescript
// ✅ 合法组合：PlanManager 创建的截止日期任务
{
  isPlan: true,         // 页面来源：PlanManager
  isTask: true,         // 事件类型：Task
  isDeadline: true,     // 事件标记：有截止日期
  isCompleted: false,   // 事件标记：未完成
}

// ❌ 非法组合：不能同时有多个页面来源
{
  isPlan: true,
  isTimeCalendar: true,  // ❌ 错误！页面来源互斥
}
```

---

#### 8.2.1 emoji - 事件图标

```typescript
emoji?: string;  // 如 "🎯"、"📝"
```

**用途**: 显示在 EventEditModal v2 顶部左侧的大图标

**显示优先级**:
1. `event.emoji`（用户手动选择）
2. `event.tags[0].emoji`（首个标签的 emoji）
3. 默认图标 `'📝'`

**关联文档**: [EventEditModal v2 PRD § 1.1](../PRD/EVENTEDITMODAL_V2_PRD.md#11-emoji大图标)

---

#### 8.2.2 isPlan - PlanManager 页面来源

```typescript
isPlan?: boolean;
```

**用途**: 标识事件是否从 **PlanManager** 页面创建

**页面来源层级**:
```typescript
// 页面来源标记（互斥，只能有一个为 true）
isPlan?: boolean;           // PlanManager 页面
isTimeCalendar?: boolean;   // TimeCalendar 日历区域
isTimer?: boolean;          // Timer 计时器页面
```

**使用场景**:
```typescript
// 判断创建来源
function getEventSource(event: Event): string {
  if (event.isPlan) return 'PlanManager';
  if (event.isTimeCalendar) return 'TimeCalendar';
  if (event.isTimer) return 'Timer';
  return 'Unknown';
}
```

---

#### 8.2.3 isTimeCalendar - TimeCalendar 页面来源

```typescript
isTimeCalendar?: boolean;
```

**用途**: 区分事件的创建来源，决定是否显示"计划安排"section

**显示条件**:
```typescript
// EventEditModal v2 的【中 Section】显示条件
function shouldShowPlanSection(event: Event): boolean {
  // 只要不是 TimeCalendar 日历区域直接创建的，就显示
  return event.isTimeCalendar !== true;
}
```

**关联文档**: [EventEditModal v2 PRD § 2](../PRD/EVENTEDITMODAL_V2_PRD.md#中-section---计划安排条件显示)

---

#### 8.2.4 isTimer - Timer 页面来源

```typescript
isTimer?: boolean;
```

**用途**: 标识事件是否从 **Timer** 页面创建（计时器事件）

**特性**:
- 计时器事件通常有时间跟踪需求
- 与其他页面来源字段互斥
- 可能需要特殊的时间显示逻辑

**使用场景**:
```typescript
// 判断是否需要计时器特殊处理
function needsTimerTracking(event: Event): boolean {
  return event.isTimer === true;
}

// 计时器事件创建
const timerEvent: Event = {
  id: generateId(),
  title: '番茄钟计时',
  isTimer: true,          // ✅ Timer 页面来源
  isPlan: false,
  isTimeCalendar: false,
  startTime: '2024-01-15 14:00:00',
  endTime: '2024-01-15 14:25:00',  // 25分钟番茄钟
};
```

---

#### 8.2.5 isDeadline - 截止日期标记

```typescript
isDeadline?: boolean;
```

**用途**: 标识事件是否为**截止日期事件**

**特性**:
- 可与任何页面来源字段组合使用（不互斥）
- 影响事件的显示和提醒逻辑
- 通常配合 `dueDate` 字段使用

**使用场景**:
```typescript
// 截止日期事件创建
const deadlineEvent: Event = {
  id: generateId(),
  title: '项目交付',
  isDeadline: true,       // ✅ 截止日期标记
  isPlan: true,           // 可以组合使用
  dueDate: '2024-12-31 23:59:59',
  startTime: undefined,   // 截止日期可以没有开始时间
  endTime: '2024-12-31 23:59:59',
};

// 判断是否需要截止日期提醒
function needsDeadlineReminder(event: Event): boolean {
  return event.isDeadline === true && !!event.dueDate;
}
```

---

#### 8.2.6 isTask - 任务类型标识（影响时间字段要求）

```typescript
isTask?: boolean;
```

**用途**: 标记事件是否为任务类型，决定时间字段是否必需

**时间字段规则**:
- `isTask = true`: **Task 任务**，startTime/endTime 可以为 `undefined`（支持无时间任务，如待办事项）
- `isTask = false` 或 `undefined`: **Calendar 事件**，startTime/endTime 必须有值（同步到 Outlook Calendar）

**使用场景**:
```typescript
// 判断是否需要时间验证
function validateEventTime(event: Event): boolean {
  if (event.isTask === true) {
    // 任务类型：时间可选
    return true;
  }
  
  // Calendar 事件：必须有时间
  return !!(event.startTime && event.endTime);
}

// 同步判断
function shouldSyncToCalendar(event: Event): boolean {
  // 只有 Calendar 事件（非 Task）且有时间才同步到 Outlook Calendar
  return event.isTask !== true && !!(event.startTime || event.endTime);
}

function shouldSyncToTodoList(event: Event): boolean {
  // Task 类型同步到 Microsoft To Do List
  return event.isTask === true;
}
```

**关联文档**: [EventEditModal v2 PRD § 1.4](../PRD/EVENTEDITMODAL_V2_PRD.md#14-任务勾选框条件显示)

---

#### 8.2.4 isCompleted - 任务完成状态

```typescript
isCompleted?: boolean;
```

**用途**: 
- 在 Plan 页面列表中显示为已完成（带 ✓ icon）
- EventEditModal v2 的【Plan提示区域】勾选框绑定此字段

**更新时机**:
```typescript
// 用户勾选 Plan 提示区域的 checkbox
const handleCompletedChange = async (isCompleted: boolean) => {
  await EventHub.updateFields(eventId, { isCompleted });
  
  // 更新父任务的统计数据
  await updateParentTaskStats(eventId);
};
```

**关联文档**: [EventEditModal v2 PRD § 4.1](../PRD/EVENTEDITMODAL_V2_PRD.md#41-创建时间--ddl-倒计时)

---

#### 8.2.5 parentTaskId - 父任务关联

```typescript
parentTaskId?: string;
```

**用途**: 建立任务层级关系，支持多层嵌套

**显示示例**:
```tsx
// EventEditModal v2【关联区域】
<div onClick={() => jumpToTask(event.parentTaskId)}>
  🔗 上级任务：{parentEvent.title}
  ，同级任务已完成{event.childTaskCompletedCount}/{event.childTaskCount}
  ，点击查看和修改任务群
</div>
```

**关联文档**: [EventEditModal v2 PRD § 5.1](../PRD/EVENTEDITMODAL_V2_PRD.md#51-上级任务)

---

#### 8.2.6 childEventIds - 子事件统一管理（v2.16）

```typescript
childEventIds?: string[];  // 所有子事件 ID（统一字段）
```

**用途**: 统一管理所有类型的子事件（Timer 记录、时间日志、外部应用数据、用户子任务）

**旧字段废弃**:
- ❌ `timerLogs?: string[]` - 已于 v2.16 废弃，迁移到 `childEventIds`
- ❌ `userSubTaskIds?: string[]` - 从未实现，直接使用 `childEventIds`
- ❌ `outsideAppEventIds?: string[]` - 从未实现，直接使用 `childEventIds`

**自动维护**: EventService 在 createEvent/updateEvent/deleteEvent 时自动同步双向关联

**查询方法**:
```typescript
// 获取所有子事件
const children = EventService.getChildEvents(parentId);

// 按类型过滤
const timers = EventService.getSubordinateEvents(parentId);  // Timer/TimeLog/OutsideApp
const userTasks = EventService.getUserSubTasks(parentId);     // 用户创建的子事件

// 类型判断
const isSystemEvent = EventService.isSubordinateEvent(event); // 是否为系统附属事件
```

**使用示例**:
```typescript
// ❌ 旧代码（v2.15 及以前）
const childEvents = (parent.timerLogs || [])
  .map(id => EventService.getEventById(id))
  .filter(e => e !== null);

// ✅ 新代码（v2.16+）
const childEvents = EventService.getChildEvents(parent.id);
```

**完整文档**: 详见 [v2.16 EventTree 统一字段架构](#-v216-eventtree-统一字段架构-2025-12-01)

---

#### 8.2.7 childTaskCount & childTaskCompletedCount - 子任务统计

```typescript
childTaskCount?: number;         // 子任务总数
childTaskCompletedCount?: number; // 已完成子任务数量
```

**用途**: 显示任务进度（如 "5/7"），支持多层嵌套累加

**更新逻辑**:
```typescript
/**
 * 递归向上更新所有父任务的子任务统计
 * 当子任务的 isCompleted 状态变化时调用
 */
export async function updateParentTaskStats(childEventId: string): Promise<void> {
  const childEvent = await EventService.getEventById(childEventId);
  if (!childEvent || !childEvent.parentTaskId) return;
  
  // 递归向上更新所有父任务
  let currentParentId = childEvent.parentTaskId;
  
  while (currentParentId) {
    const parentEvent = await EventService.getEventById(currentParentId);
    if (!parentEvent) break;
    
    // 查询所有子事件（v2.16+ 使用统一字段）
    const childEvents = EventService.getChildEvents(currentParentId);
    
    // 计算统计数据
    const childTaskCount = childEvents.length;
    const childTaskCompletedCount = childEvents.filter(e => e.isCompleted).length;
    
    // 更新父任务
    await EventHub.updateFields(currentParentId, {
      childTaskCount,
      childTaskCompletedCount,
    });
    
    // 继续向上递归
    currentParentId = parentEvent.parentTaskId;
  }
}
```

**使用示例**:
```typescript
// 当任务完成状态变化时
const handleTaskCompleted = async (eventId: string, isCompleted: boolean) => {
  // 1. 更新自身状态
  await EventHub.updateFields(eventId, { isCompleted });
  
  // 2. 递归更新所有父任务的统计数据
  await updateParentTaskStats(eventId);
  
  // 3. 触发 UI 更新
  EventHub.emit('taskCompletedChanged', { eventId, isCompleted });
};
```

**关联文档**: [EventEditModal v2 PRD § 5.1](../PRD/EVENTEDITMODAL_V2_PRD.md#51-上级任务)

---

### 8.3 字段管理职责划分

| 字段类型 | 管理者 | 更新方式 |
|---------|--------|----------|
| **时间字段** (startTime, endTime, timeSpec) | **TimeHub** | `TimeHub.setEventTime()` |
| **非时间字段** (title, tags, description, emoji, etc.) | **EventHub** | `EventHub.updateFields()` |
| **任务统计** (childTaskCount, childTaskCompletedCount) | **EventHub** | `updateParentTaskStats()` 自动计算 |
| **协作字段** (organizer, attendees) | **EventHub** | `EventHub.updateFields()` |
| **🆕 签到字段** (checked[], unchecked[]) | **EventService** | `EventService.checkIn()` / `EventService.uncheck()` |

---

### 8.4 🆕 日历同步配置字段（v2.15 - 父子事件单一配置架构）

#### 8.4.1 架构设计理念

**问题背景**:
- ❌ 旧架构使用 `planSyncConfig` 和 `actualSyncConfig` 双配置（Plan vs Actual 范式）
- ❌ 父事件没有子事件时，"实际进展"配置无处保存
- ❌ 配置复杂度高，容易混淆计划和实际的概念

**v2.15 解决方案**:
- ✅ 每个事件使用单一配置：`calendarIds` + `syncMode`
- ✅ 父事件使用 `subEventConfig` 存储子事件配置模板
- ✅ 架构清晰：父事件配置是父事件的，子事件配置是子事件的

#### 8.4.2 calendarIds - 同步目标日历列表

```typescript
calendarIds?: string[];  // 同步目标日历 ID 列表
```

**用途**: 指定事件同步到哪些外部日历（Outlook/Google/iCloud）

**特性**:
- 支持多选日历（可同时同步到多个日历）
- ActionBasedSyncManager 使用此字段决定同步目标
- 标签映射仅用于智能勾选建议，不影响同步逻辑

**使用场景**:
```typescript
// 父事件：计划安排同步配置
const parentEvent = {
  id: 'parent-123',
  calendarIds: ['outlook-work', 'google-personal'],
  syncMode: 'bidirectional'
};

// 子事件：实际进展同步配置
const childEvent = {
  id: 'child-456',
  parentEventId: 'parent-123',
  calendarIds: ['outlook-work'],  // 继承自父的 subEventConfig
  syncMode: 'send-only'
};
```

#### 8.4.3 syncMode - 同步模式

```typescript
syncMode?: string;  
// 'receive-only' | 'send-only' | 'send-only-private' | 'bidirectional' | 'bidirectional-private'
```

**用途**: 指定与外部日历的同步方向和隐私级别

**模式说明**:
- `receive-only`: 只接收外部更新（导入外部日历事件）
- `send-only`: 只发送到外部（单向导出，会邀请参会人）
- `send-only-private`: 只发送（仅自己），参会人作为文本添加到描述
- `bidirectional`: 双向同步（会邀请参会人）
- `bidirectional-private`: 双向同步（仅自己），参会人作为文本添加到描述

**Private 模式机制**:
```typescript
// 普通模式
{
  attendees: ['alice@company.com'],
  description: '讨论项目进展'
}

// Private 模式
{
  attendees: [],  // 不邀请参会人
  description: '📧 参与者：alice@company.com\n\n讨论项目进展'  // 参会人作为文本
}
```

#### 8.4.4 subEventConfig - 子事件配置模板（父事件专用）

```typescript
subEventConfig?: {
  calendarIds?: string[];  // 子事件默认日历配置
  syncMode?: string;       // 子事件默认同步模式
};
```

**用途**: 父事件存储子事件的默认配置，解决无子事件时"实际进展"配置无法保存的问题

**特性**:
- 仅父事件（有 `timerLogs` 字段的事件）使用
- 创建新子事件时，子事件的 `calendarIds` 和 `syncMode` 继承自此模板
- 在 EventEditModal V2 的"实际进展"区域编辑时，父模式更新此字段

**数据流**:
```typescript
// 1. 父事件编辑"实际进展"配置
parentEvent.subEventConfig = {
  calendarIds: ['outlook-work'],
  syncMode: 'send-only'
};

// 2. 创建子事件时继承配置
const childEvent = {
  parentEventId: parentEvent.id,
  calendarIds: parentEvent.subEventConfig.calendarIds,  // 继承
  syncMode: parentEvent.subEventConfig.syncMode          // 继承
};

// 3. 父事件更新"实际进展"配置时，批量更新现有子事件
if (parentEvent.timerLogs && parentEvent.timerLogs.length > 0) {
  for (const childId of parentEvent.timerLogs) {
    await EventHub.updateFields(childId, {
      calendarIds: newCalendarIds,
      syncMode: newSyncMode
    });
  }
}
```

#### 8.4.5 EventEditModal V2 中的使用逻辑

**中区（计划安排）**:
```typescript
// 父模式：编辑父事件自己的配置
if (isParentMode) {
  // 显示和编辑 mainEvent 的 calendarIds/syncMode
  await EventHub.updateFields(event.id, {
    calendarIds: newCalendarIds,
    syncMode: newSyncMode
  });
} else {
  // 子模式：同步计划字段到父事件
  await EventHub.updateFields(event.parentEventId, {
    calendarIds: newCalendarIds,
    syncMode: newSyncMode
  });
}
```

**下区（实际进展）**:
```typescript
// 父模式：编辑 subEventConfig 模板 + 批量更新子事件
if (isParentMode) {
  await EventHub.updateFields(event.id, {
    subEventConfig: {
      calendarIds: newCalendarIds,
      syncMode: newSyncMode
    }
  });
  
  // 批量更新现有子事件
  for (const childId of event.timerLogs || []) {
    await EventHub.updateFields(childId, {
      calendarIds: newCalendarIds,
      syncMode: newSyncMode
    });
  }
} else {
  // 子模式：编辑子事件自己的配置
  await EventHub.updateFields(event.id, {
    calendarIds: newCalendarIds,
    syncMode: newSyncMode
  });
}
```

#### 8.4.6 与旧架构的对比

| 旧架构 (v2.0.3) | 新架构 (v2.15) |
|----------------|----------------|
| `planSyncConfig: { mode, targetCalendars }` | `calendarIds + syncMode`（父事件自己的） |
| `actualSyncConfig: { mode, targetCalendars }` | `subEventConfig`（父事件专用模板） |
| 父事件无子事件时无法保存实际配置 | ✅ `subEventConfig` 始终可保存 |
| 计划 vs 实际范式（容易混淆） | ✅ 父 vs 子范式（清晰明确） |
| 双配置结构复杂 | ✅ 单一配置 + 模板机制 |

**迁移指南**:
```typescript
// ❌ 旧代码
event.planSyncConfig = {
  mode: 'bidirectional',
  targetCalendars: ['outlook-work']
};
event.actualSyncConfig = {
  mode: 'send-only',
  targetCalendars: ['outlook-work']
};

// ✅ 新代码
// 父事件
event.calendarIds = ['outlook-work'];
event.syncMode = 'bidirectional';
event.subEventConfig = {
  calendarIds: ['outlook-work'],
  syncMode: 'send-only'
};

// 子事件
childEvent.calendarIds = ['outlook-work'];
childEvent.syncMode = 'send-only';
```

---

### 8.5 🆕 签到功能字段（v1.7）

#### 8.4.1 checked - 签到时间戳数组

```typescript
checked?: string[];  // 签到时间戳数组（ISO格式）
```

**用途**: 记录用户每次签到的精确时间戳

**特性**:
- 支持多次签到，累积记录历史
- 时间戳采用ISO格式存储
- 用于任务管理和定时打卡场景
- 与EventHistoryService集成，支持历史查询

**使用场景**:
```typescript
// 任务完成签到
const result = EventService.checkIn('event-123');
if (result.success) {
  // 签到成功，时间戳已记录到 event.checked[]
  const status = EventService.getCheckInStatus('event-123');
  console.log(`签到成功，总签到次数: ${status.checkInCount}`);
}
```

---

#### 8.4.2 unchecked - 取消签到时间戳数组

```typescript
unchecked?: string[];  // 取消签到时间戳数组（ISO格式）
```

**用途**: 记录用户每次取消签到的精确时间戳

**特性**:
- 支持撤销错误签到
- 与checked[]字段配合判断当前签到状态
- 所有操作都通过EventHistoryService记录

**签到状态判断逻辑**:
```typescript
// 获取签到状态
const status = EventService.getCheckInStatus(eventId);

// 判断逻辑：比较最后的签到和取消签到时间
// 如果最后签到时间更晚 → isChecked = true
// 如果最后取消签到时间更晚 → isChecked = false
// 如果都没有操作记录 → isChecked = false
```

---

#### 8.4.3 checkType - 签到类型（v2.8 新增 2025-11-24）

```typescript
checkType?: 'none' | 'once' | 'recurring';
```

**用途**: 定义事件的签到类型和频率

**取值说明**:
- `'none'`: 无需签到（默认，不显示 checkbox）
- `'once'`: 单次签到任务（显示 checkbox，完成一次即可）
- `'recurring'`: 循环签到任务（显示 checkbox，按循环配置重复签到）

**使用场景**:
```typescript
// 单次任务
event.checkType = 'once';

// 每周签到任务
event.checkType = 'recurring';
event.recurringConfig = {
  type: 'weekly',
  weekDays: [1, 3, 5],  // 周一、周三、周五
  startDate: '2025-11-24'
};
```

---

#### 8.4.4 recurringConfig - 循环签到配置（v2.8 新增 2025-11-24）

```typescript
interface RecurringConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  weekDays?: number[];      // 每周哪几天（0-6，0=周日）
  monthDays?: number[];     // 每月哪几天（1-31）
  intervalDays?: number;    // 间隔天数（自定义）
  startDate?: string;       // 循环开始日期
  endDate?: string;         // 循环结束日期（可选）
}

recurringConfig?: RecurringConfig;  // 当 checkType='recurring' 时有效
```

**用途**: 定义循环签到任务的具体规则

**配置示例**:
```typescript
// 每天签到
{
  type: 'daily',
  startDate: '2025-11-24',
  endDate: '2025-12-24'  // 持续一个月
}

// 每周一签到
{
  type: 'weekly',
  weekDays: [1],
  startDate: '2025-11-24'
}

// 每月1号和15号签到
{
  type: 'monthly',
  monthDays: [1, 15]
}

// 每3天签到一次
{
  type: 'custom',
  intervalDays: 3,
  startDate: '2025-11-24'
}
```

---

#### 8.4.5 签到功能与UI集成

**统一的 Checkbox 显示判断**:

所有组件使用统一的辅助函数判断是否显示 checkbox：

```typescript
// src/utils/eventHelpers.ts
export function shouldShowCheckbox(event: { checkType?: CheckType }): boolean {
  return event.checkType !== undefined && event.checkType !== 'none';
}
```

**核心规则**:
- `checkType === 'once'` → ✅ 显示 checkbox（单次签到）
- `checkType === 'recurring'` → ✅ 显示 checkbox（循环签到）
- `checkType === 'none'` 或 `undefined` → ❌ 不显示 checkbox

**应用位置**（所有位置统一使用此判断）:
- ✅ **PlanManager** - Plan 页面的事件列表
- ✅ **TimeCalendar** - 日历视图的事件
- ✅ **UpcomingEvents** - 即将到来面板
- ✅ **EventEditModal** - 事件编辑弹窗
- ✅ **Homepage Timer** - 首页计时器面板

**EventLinePrefix组件集成**:
```typescript
import { shouldShowCheckbox, isEventChecked } from '../../utils/eventHelpers';

// 判断是否显示 checkbox
if (shouldShowCheckbox(event)) {
  return (
    <input
      type="checkbox"
      checked={isEventChecked(event)}
      onChange={(e) => {
        const isChecked = e.target.checked;
        
        // 更新任务完成状态
        onSave(element.eventId, { isCompleted: isChecked });
        
        // 记录签到操作
        if (isChecked) {
          EventService.checkIn(element.eventId);
        } else {
          EventService.uncheck(element.eventId);
        }
      }}
    />
  );
}
```

**EventService 签到状态查询增强**:
```typescript
// 查询签到状态（包含新增字段）
const status = EventService.getCheckInStatus(eventId);
// 返回：
// {
//   isChecked: boolean,
//   checkInCount: number,
//   uncheckCount: number,
//   lastCheckIn?: string,
//   lastUncheck?: string,
//   checkType: 'none' | 'once' | 'recurring',     // 🆕 新增
//   recurringConfig?: RecurringConfig              // 🆕 新增
// }
```

**状态线显示集成**:
- 签到的事件显示**绿色Done状态线**
- 取消签到且过期的事件显示**橙色Missed状态线**
- 通过EventHistoryService查询历史记录计算状态

---

#### 8.4.6 checkType 字段在数据流中的实现（v1.8 2025-11-25）

**1. Slate 序列化支持**

`checkType` 字段已集成到 PlanSlate 的序列化流程中：

```typescript
// src/components/PlanSlate/serialization.ts

// 1. Event → Slate Node（提取元数据）
export function planItemToSlateNode(item: any): EventLineNode {
  return {
    type: 'event-line',
    eventId: item.id,
    lineId: generateLineId(),
    level: 0,
    mode: 'title',
    metadata: {
      // ...其他字段
      checkType: item.checkType || 'once', // 🆕 默认有checkbox
    },
    children: [/* ... */]
  };
}

// 2. Slate Node → Event（重建事件）
export function slateNodeToPlanItem(node: EventLineNode): Event {
  const metadata = node.metadata || {};
  return {
    id: node.eventId,
    // ...其他字段
    checkType: metadata.checkType || 'once', // 🆕 默认有checkbox
  };
}
```

**默认值规则**:
- Plan 页面创建的事件默认 `checkType='once'`（显示 checkbox）
- FloatingBar 的 add_task 按钮可以切换 `'once'` ↔ `'none'`
- EventEditModalV2 的 recurring 按钮可以设置为 `'recurring'`

**2. EventLinePrefix 组件**

根据 `checkType` 字段决定是否显示 checkbox：

```typescript
// src/components/PlanSlate/EventLinePrefix.tsx
const EventLinePrefixComponent: React.FC<EventLinePrefixProps> = ({ element, onSave }) => {
  const metadata = element.metadata || {};
  const checkType = metadata.checkType;
  const showCheckbox = checkType === 'once' || checkType === 'recurring';
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {/* 根据 checkType 决定是否显示 checkbox */}
      {showCheckbox && (
        <input
          type="checkbox"
          checked={isCompleted}
          onChange={(e) => {
            const isChecked = e.target.checked;
            if (isChecked) {
              EventService.checkIn(element.eventId);
            } else {
              EventService.uncheck(element.eventId);
            }
            onSave(element.eventId, {});
          }}
        />
      )}
      {/* Emoji */}
      {emoji && <span>{emoji}</span>}
    </div>
  );
};
```

**3. PlanManager 同步逻辑**

`syncToUnifiedTimeline` 中为事件添加 `checkType` 字段：

```typescript
// src/components/PlanManager.tsx
const event: Event = {
  id: item.id,
  title: extractedTitle,
  // ...其他字段
  checkType: item.checkType || 'once', // 🆕 Plan事件默认有checkbox
  remarkableSource: true,
};
```

**4. UpcomingEventsPanel 过滤逻辑**

三步过滤公式：`checkType + 时间范围 - 系统事件`

```typescript
// src/utils/upcomingEventsHelper.ts
export function filterEventsByTimeRange(
  events: Event[],
  timeFilter: TimeFilter,
  customStart?: Date,
  customEnd?: Date
): Event[] {
  const { start, end } = getTimeRangeBounds(timeFilter, customStart, customEnd);
  
  return events.filter(event => {
    // 步骤 1: checkType 过滤（必须有有效的 checkType 且不为 'none'）
    if (!event.checkType || event.checkType === 'none') {
      return false;
    }
    
    // 步骤 2: 时间范围过滤
    const inRange = isEventInRange(event, start, end);
    if (!inRange) {
      return false;
    }
    
    // 步骤 3: 排除系统事件（使用严格比较 === true）
    if (event.isTimer === true || 
        event.isOutsideApp === true || 
        event.isTimeLog === true) {
      return false;
    }
    
    return true;
  });
}
```

**过滤逻辑说明**:
1. **checkType 过滤**: 只显示有 checkbox 的事件（`'once'` 或 `'recurring'`）
2. **时间范围**: 必须在选定的时间范围内
3. **系统事件**: 排除 Timer/TimeLog/OutsideApp 等系统生成的事件

**注意**: 过滤顺序非常重要，必须按上述三步顺序执行，不能合并为并行条件。

---

#### 8.4.7 checkType 字段与 category 字段的区别

**checkType** (业务字段):
- 用途：控制事件是否显示 checkbox
- 取值：`'none'` | `'once'` | `'recurring'`
- 影响：UI 显示、Panel 过滤逻辑

**category** (技术字段):
- 用途：TUI Calendar 内部分类
- 取值：`'milestone'` | `'task'` | `'allday'` | `'time'`
- 影响：日历组件渲染逻辑（仅 TUI Calendar 内部使用）

**历史问题**:
- 旧版本代码曾将 `category: 'ongoing'` 用于业务标记（已废弃）
- 2025-11-25 清理了 ActionBasedSyncManager 和 MicrosoftCalendarService 中的硬编码 `category: 'ongoing'`
- EventTag 接口中删除了业务类 category 字段，只保留 Event 中的技术类 category

---

## 9. 任务关联功能实现指南

### 9.1 任务层级结构

```mermaid
graph TD
    A[项目 A] --> B[子任务 1]
    A --> C[子任务 2]
    A --> D[子任务 3]
    B --> E[孙任务 1-1]
    B --> F[孙任务 1-2]
    
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#bbf,stroke:#333
    style C fill:#bbf,stroke:#333
    style D fill:#bbf,stroke:#333
    style E fill:#ddf,stroke:#333
    style F fill:#ddf,stroke:#333
```

### 9.2 统计数据更新流程

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant EventHub
    participant UpdateService
    participant EventService
    
    User->>UI: 勾选"任务完成" checkbox
    UI->>EventHub: updateFields(eventId, { isCompleted: true })
    EventHub->>EventService: 更新 localStorage
    EventHub->>UpdateService: updateParentTaskStats(eventId)
    
    loop 递归向上
        UpdateService->>EventService: 查询父任务的所有子任务
        UpdateService->>UpdateService: 计算 childTaskCount & childTaskCompletedCount
        UpdateService->>EventHub: updateFields(parentId, { stats })
        UpdateService->>UpdateService: 获取祖父任务 ID
    end
    
    UpdateService->>UI: 触发 taskCompletedChanged 事件
    UI->>UI: 刷新 Plan 列表
```

### 9.3 EventService 新增方法

需要在 `src/services/EventService.ts` 中添加以下方法：

```typescript
/**
 * 根据父任务 ID 查询所有子任务
 */
export function getEventsByParentId(parentTaskId: string): Event[] {
  const allEvents = getAllEvents();
  return allEvents.filter(event => event.parentTaskId === parentTaskId);
}

/**
 * 检查是否存在子任务
 */
export function hasChildTasks(eventId: string): boolean {
  const childTasks = getEventsByParentId(eventId);
  return childTasks.length > 0;
}

/**
 * 🆕 事件签到功能 - 记录签到时间戳
 */
static checkIn(eventId: string): { success: boolean; error?: string } {
  try {
    const event = this.getEventById(eventId);
    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    const timestamp = new Date().toISOString();

    // 初始化checked数组（如果不存在）
    if (!event.checked) {
      event.checked = [];
    }

    // 添加签到时间戳
    event.checked.push(timestamp);
    event.updatedAt = timestamp;

    // 保存到localStorage
    this.saveEvent(event);

    // 记录事件历史
    EventHistoryService.logCheckin(eventId, event.title || 'Untitled Event', { 
      action: 'check-in', 
      timestamp 
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 🆕 取消事件签到 - 记录取消签到时间戳
 */
static uncheck(eventId: string): { success: boolean; error?: string } {
  try {
    const event = this.getEventById(eventId);
    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    const timestamp = new Date().toISOString();

    // 初始化unchecked数组（如果不存在）
    if (!event.unchecked) {
      event.unchecked = [];
    }

    // 添加取消签到时间戳
    event.unchecked.push(timestamp);
    event.updatedAt = timestamp;

    // 保存到localStorage
    this.saveEvent(event);

    // 记录事件历史
    EventHistoryService.logCheckin(eventId, event.title || 'Untitled Event', { 
      action: 'uncheck', 
      timestamp 
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 🆕 获取事件的签到状态
 */
static getCheckInStatus(eventId: string): { 
  isChecked: boolean; 
  lastCheckIn?: string; 
  lastUncheck?: string;
  checkInCount: number;
  uncheckCount: number;
} {
  const event = this.getEventById(eventId);
  if (!event) {
    return { isChecked: false, checkInCount: 0, uncheckCount: 0 };
  }

  const checked = event.checked || [];
  const unchecked = event.unchecked || [];
  
  // 获取最后的操作时间戳来判断当前状态
  const lastCheckIn = checked.length > 0 ? checked[checked.length - 1] : undefined;
  const lastUncheck = unchecked.length > 0 ? unchecked[unchecked.length - 1] : undefined;
  
  // 如果都没有操作，默认未签到
  if (!lastCheckIn && !lastUncheck) {
    return { 
      isChecked: false, 
      checkInCount: checked.length, 
      uncheckCount: unchecked.length 
    };
  }
  
  // 比较最后的签到和取消签到时间
  const isChecked = lastCheckIn && (!lastUncheck || lastCheckIn > lastUncheck);

  return {
    isChecked,
    lastCheckIn,
    lastUncheck,
    checkInCount: checked.length,
    uncheckCount: unchecked.length
  };
}
```

### 9.4 最佳实践

#### ✅ 创建子任务时自动关联

```typescript
// 创建子任务
const newChildTask: Event = {
  id: generateId(),
  title: '子任务标题',
  parentTaskId: parentEvent.id,  // ✅ 设置父任务 ID
  isPlan: true,
  isTask: true,
  // ... 其他字段
};

await EventHub.createEvent(newChildTask);

// ✅ 更新父任务的 childTaskCount
await updateParentTaskStats(newChildTask.id);
```

#### ✅ 事件签到集成到checkbox

```typescript
// EventLinePrefix.tsx - 集成签到到复选框
<input
  type="checkbox"
  checked={isCompleted}
  onChange={(e) => {
    e.stopPropagation();
    const isChecked = e.target.checked;
    
    // 更新 isCompleted 状态
    onSave(element.eventId, { isCompleted: isChecked });
    
    // ✅ 同时处理签到逻辑
    if (isChecked) {
      EventService.checkIn(element.eventId);
    } else {
      EventService.uncheck(element.eventId);
    }
  }}
/>
```

#### ✅ 签到状态在状态线中的显示

```typescript
// PlanManager.tsx - 状态线计算
const getEventStatus = (eventId: string) => {
  // ... 其他状态逻辑
  
  case 'checkin':
    // ✅ 检查是签到还是取消签到
    if (latestAction.metadata?.action === 'check-in') {
      return 'done';  // 绿色状态线
    } else if (latestAction.metadata?.action === 'uncheck') {
      const event = EventService.getEventById(eventId);
      if (event && event.startTime) {
        const eventTime = new Date(event.startTime);
        const now = new Date();
        if (eventTime < now) {
          return 'missed'; // 橙色 - 过期但取消了签到
        }
      }
      return 'updated'; // 蓝色 - 还没到时间或没有时间设置
    }
    return 'done';
};
```

#### ✅ 删除子任务时更新统计

```typescript
// 删除子任务
await EventHub.deleteEvent(childTaskId);

// ✅ 更新父任务统计
if (childEvent.parentTaskId) {
  await updateParentTaskStats(childEvent.parentTaskId);
}
```

#### ✅ 显示任务进度

```typescript
function renderTaskProgress(event: Event): ReactNode {
  if (!event.childTaskCount || event.childTaskCount === 0) {
    return null;
  }
  
  const progress = event.childTaskCompletedCount || 0;
  const total = event.childTaskCount;
  const percentage = Math.round((progress / total) * 100);
  
  return (
    <div className="task-progress">
      <span className="progress-text">{progress}/{total}</span>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
```

---

## 📚 相关文档

- [TIME_ARCHITECTURE.md](../TIME_ARCHITECTURE.md) - 统一时间架构
- [EventHub-Migration-Guide.md](../../_archive/legacy-docs/reports/EventHub-Migration-Guide.md) - EventHub 迁移指南
- [SYNC_MECHANISM_PRD.md](./SYNC_MECHANISM_PRD.md) - 同步机制文档
- [EventEditModal v2 PRD](../PRD/EVENTEDITMODAL_V2_PRD.md) - EventEditModal v2 产品需求文档（包含新增字段的详细说明）
- [TIMER_MODULE_PRD.md](../PRD/TIMER_MODULE_PRD.md) - Timer 模块文档
- [TimeLog_&_Description_PRD.md](../PRD/TimeLog_&_Description_PRD.md) - EventHistoryService 和签到功能完整实现
- [PLANMANAGER_MODULE_PRD.md](../PRD/PLANMANAGER_MODULE_PRD.md) - 状态线和签到功能集成
- [naturalLanguageTimeDictionary.ts](../../src/utils/naturalLanguageTimeDictionary.ts) - 自然语言解析词典
- [relativeDateFormatter.ts](../../src/utils/relativeDateFormatter.ts) - 相对时间动态显示

---

---

## 🔧 v1.8 EventLog 保存架构优化 (2025-11-29)

### 问题背景

**原架构问题**：
- 前端组件（EventEditModalV2）手动构建 EventLog 对象
- 代码重复：每个编辑位置都需要重复转换逻辑
- 维护困难：转换逻辑分散在多处
- 容易出错：开发者可能忘记转换某些字段
- **UI 层格式判断**: PlanSlate、EventEditModal 等组件需要判断 eventlog 是字符串还是对象

### 解决方案：EventService 作为唯一标准化层

#### 核心原则

1. **EventService 是唯一的数据标准化层**
   - 所有组件传递原始格式（Slate JSON 字符串、HTML、纯文本）
   - EventService 自动检测格式并转换为标准 EventLog 对象
   - UI 组件读取时直接使用标准化后的数据

2. **支持 5 种输入格式**
   - EventLog 对象（已标准化）→ 直接返回
   - undefined/null → 返回空 EventLog
   - Slate JSON 字符串 → 自动转换
   - HTML 字符串 → 反向识别后转换
   - 纯文本字符串 → 转换为单段落

3. **HTML 反向识别机制**
   - 从 Outlook 返回的 HTML 中识别 App 元素（Tag、DateMention 等）
   - 精确匹配（data-* 属性）+ 模糊匹配（正则模式）
   - 保留富文本格式（bold、italic、color 等）

#### 1. normalizeEventLog() - 核心标准化方法

**位置**: `src/services/EventService.ts` (L1391-1448)

```typescript
/**
 * 标准化 eventlog 字段
 * 将各种格式的 eventlog 输入统一转换为 EventLog 对象
 */
private static normalizeEventLog(eventlogInput: any): EventLog {
  // 情况1: 已经是 EventLog 对象
  if (typeof eventlogInput === 'object' && eventlogInput !== null && 'slateJson' in eventlogInput) {
    console.log('[EventService] eventlog 已是标准对象');
    return eventlogInput as EventLog;
  }
  
  // 情况2: undefined 或 null
  if (eventlogInput === undefined || eventlogInput === null) {
    console.log('[EventService] eventlog 为空，返回空对象');
    return this.convertSlateJsonToEventLog('[]');
  }
  
  // 情况3-5: 字符串格式（需要判断类型）
  if (typeof eventlogInput === 'string') {
    const trimmed = eventlogInput.trim();
    
    // 空字符串
    if (!trimmed) {
      return this.convertSlateJsonToEventLog('[]');
    }
    
    // Slate JSON 字符串（以 [ 开头）
    if (trimmed.startsWith('[')) {
      console.log('[EventService] 检测到 Slate JSON 字符串');
      return this.convertSlateJsonToEventLog(eventlogInput);
    }
    
    // HTML 字符串（包含标签）
    if (trimmed.startsWith('<') || trimmed.includes('<p>') || trimmed.includes('<div>')) {
      console.log('[EventService] 检测到 HTML 字符串，进行反向识别');
      // 使用反向识别将 HTML 转换为 Slate JSON
      const slateJson = this.htmlToSlateJsonWithRecognition(eventlogInput);
      return this.convertSlateJsonToEventLog(slateJson);
    }
    
    // 纯文本字符串
    console.log('[EventService] 检测到纯文本，转换为单段落');
    const slateJson = JSON.stringify([{
      type: 'paragraph',
      children: [{ text: eventlogInput }]
    }]);
    return this.convertSlateJsonToEventLog(slateJson);
  }
  
  // 未知格式 - 降级为空
  console.warn('[EventService] 未知 eventlog 格式:', typeof eventlogInput);
  return this.convertSlateJsonToEventLog('[]');
}

/**
 * 将 Slate JSON 字符串转换为完整的 EventLog 对象
 */
private static convertSlateJsonToEventLog(slateJson: string): EventLog {
  try {
    const slateNodes = jsonToSlateNodes(slateJson);
    const htmlDescription = slateNodesToHtml(slateNodes);
    const plainTextDescription = htmlDescription.replace(/<[^>]*>/g, '');
    
    return {
      slateJson: slateJson,
      html: htmlDescription,
      plainText: plainTextDescription,
      attachments: [],
      versions: [],
      syncState: {
        status: 'pending',
        contentHash: this.hashContent(slateJson),
      },
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
    };
  } catch (error) {
    console.error('[EventService] convertSlateJsonToEventLog 失败:', error);
    // 降级返回空对象
    return {
      slateJson: '[]',
      html: '',
      plainText: '',
      attachments: [],
      versions: [],
      syncState: { status: 'pending' },
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
    };
  }
}
```

#### 2. htmlToSlateJsonWithRecognition() - HTML 反向识别

**位置**: `src/services/EventService.ts` (L1488-1518)

**功能**: 从 Outlook 返回的 HTML 中识别 App 元素

```typescript
/**
 * HTML 转换为 Slate JSON（含反向识别）
 * 从 Outlook 返回的 HTML 中识别出 App 元素（Tag、DateMention 等）
 */
private static htmlToSlateJsonWithRecognition(html: string): string {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const slateNodes: any[] = [];
    
    // 遍历 HTML 节点并转换
    this.parseHtmlNode(tempDiv, slateNodes);
    
    // 确保至少有一个段落
    if (slateNodes.length === 0) {
      slateNodes.push({
        type: 'paragraph',
        children: [{ text: '' }]
      });
    }
    
    return JSON.stringify(slateNodes);
  } catch (error) {
    console.error('[EventService] htmlToSlateJsonWithRecognition 失败:', error);
    return '[]';
  }
}
```

**识别策略**:
1. **精确匹配**（优先）
   - 检查 `data-tag-id`、`data-tag-name` → TagNode
   - 检查 `data-type="dateMention"`、`data-start-date` → DateMentionNode

2. **模糊匹配**（降级）
   - 文本模式 `@工作` → TagNode
   - 文本模式 `11/29 10:00` → DateMentionNode
   - 文本模式 `今天下午3点` → DateMentionNode

#### 3. 反向识别辅助函数

**recognizeTagNodeByPattern()** - Tag 节点模糊匹配
```typescript
/**
 * 使用正则模式识别 TagNode
 * 支持: "@工作", "💼 @工作", "📅 @会议"
 */
private static recognizeTagNodeByPattern(text: string): Array<{ index: number; length: number; node: any }> {
  const matches: Array<{ index: number; length: number; node: any }> = [];
  const tagPattern = /((?:[\p{Emoji}]\s*)?@[\w\u4e00-\u9fa5]+)/gu;
  
  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const emojiMatch = fullMatch.match(/^([\p{Emoji}])\s*@(.+)$/u);
    const tagEmoji = emojiMatch ? emojiMatch[1] : undefined;
    const tagName = emojiMatch ? emojiMatch[2] : fullMatch.replace('@', '');
    
    matches.push({
      index: match.index,
      length: fullMatch.length,
      node: {
        type: 'tag',
        tagId: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tagName: tagName,
        tagEmoji: tagEmoji,
        children: [{ text: '' }]
      }
    });
  }
  
  return matches;
}
```

**recognizeDateMentionByPattern()** - DateMention 节点模糊匹配
```typescript
/**
 * 使用正则模式识别 DateMentionNode
 * 支持 3 种格式:
 *   1. "11/29 10:00" or "11/29 10:00 - 12:00"
 *   2. "2025-11-29 10:00"
 *   3. "今天下午3点"
 */
private static recognizeDateMentionByPattern(text: string): Array<{ index: number; length: number; node: any }> {
  const matches: Array<{ index: number; length: number; node: any }> = [];
  
  const patterns = [
    /(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?)/g,
    /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?:\s*-\s*\d{2}:\d{2})?)/g,
    /(今天|明天|后天|下周[一二三四五六日])(?:\s*(上午|下午|晚上))?(?:\s*(\d{1,2})点)?/g,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const startDate = this.parseSimpleDate(fullMatch);
      
      if (startDate) {
        matches.push({
          index: match.index,
          length: fullMatch.length,
          node: {
            type: 'dateMention',
            startDate: startDate,
            originalText: fullMatch,
            isOutdated: false,
            children: [{ text: '' }]
          }
        });
      }
    }
  }
  
  return matches;
}
```

#### 4. getEventById() 调用标准化

**位置**: `src/services/EventService.ts` (L175-194)

```typescript
/**
 * 根据ID获取事件
 * 🔧 性能优化：只规范化目标事件的 title 和 eventlog，避免全量处理
 */
static getEventById(eventId: string): Event | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.EVENTS);
    if (!saved) return null;
    
    const events: Event[] = JSON.parse(saved);
    const event = events.find(e => e.id === eventId);
    
    if (!event) return null;
    
    // ✅ 规范化 title 和 eventlog
    return {
      ...event,
      title: this.normalizeTitle(event.title),
      eventlog: this.normalizeEventLog(event.eventlog)  // ✅ 自动标准化
    };
  } catch (error) {
    eventLogger.error('❌ [EventService] Failed to get event by ID:', error);
    return null;
  }
}
```

#### 5. 前端组件简化

```typescript
// EventEditModalV2.tsx - 只传递 Slate JSON 字符串
const handleTimelogChange = (slateJson: string) => {
  // ✅ 简化：只保存 Slate JSON 字符串
  setFormData({
    ...formData,
    eventlog: slateJson,  // EventService 会自动转换
  });
};

const handleSave = async () => {
  // ✅ 只传递 Slate JSON 字符串
  const updatedEvent: Event = {
    ...formData,
    eventlog: currentEventlog,  // Slate JSON 字符串
  };
  
  // EventHub/EventService 会自动转换为 EventLog 对象
  await EventHub.updateFields(eventId, updatedEvent);
};
```

```typescript
// ActionBasedSyncManager.tsx - 统一传递 Slate JSON 字符串
const outlookDescription = outlookEvent.body?.content || '';

// ✅ 简化：只传递 Slate JSON 字符串，让 EventService 自动转换
const slateJson = htmlToSlateJson(outlookDescription);

await EventService.updateEvent(eventId, {
  eventlog: slateJson,  // EventService 会自动识别并转换
});
```

#### 3. Timer 保存逻辑修复

**问题**：App.tsx 的 Timer 自动保存直接操作 localStorage，绕过 EventService

**修复**：
```typescript
// App.tsx - handleTimerEditSave
// ❌ 之前：直接操作 localStorage
existingEvents[eventIndex] = {
  ...existingEvents[eventIndex],
  description: updatedEvent.description,
  // eventlog 被忽略！
};

// ✅ 修复后：使用 EventService
await EventService.updateEvent(globalTimer.eventId, {
  description: updatedEvent.description,
  eventlog: updatedEvent.eventlog,  // EventService 会自动转换
  location: updatedEvent.location,
  title: updatedEvent.title,
}, {
  skipSync: true,
  source: 'timer-edit'
});
```

**30秒自动保存**：
```typescript
// saveTimerEvent() - 保留用户编辑的 eventlog
const timerEvent: Event = {
  id: timerEventId,
  startTime: formatTimeForStorage(startTime),
  endTime: formatTimeForStorage(endTime),
  eventlog: existingEvent?.eventlog,  // ✅ 保留，不覆盖
  // ...
};
```

### 架构优势

✅ **单一职责**：EventService 统一负责数据转换  
✅ **代码简洁**：前端组件只需传递 Slate JSON  
✅ **易于维护**：转换逻辑集中在一处  
✅ **向后兼容**：支持多种输入格式（EventLog 对象、Slate JSON、旧格式）  
✅ **防止数据丢失**：Timer 自动保存不会覆盖用户编辑的 eventlog  
✅ **反向识别**：从 Outlook HTML 中识别 App 元素（Tag、DateMention）  
✅ **格式统一**：UI 层无需判断 eventlog 是字符串还是对象

### 完整数据流向

#### 流程1: 内部编辑 → 外部同步

```
用户输入 (ModalSlate)
  ↓ onChange (Slate JSON 字符串)
EventEditModalV2.handleTimelogChange(slateJson: string)
  ↓
formData.eventlog = slateJson  // ✅ 字符串
  ↓
handleSave() → EventHub.updateFields()
  ↓
EventService.updateEvent(eventId, { eventlog: slateJson })
  ↓ 
EventService.normalizeEventLog(slateJson)
  ├─ 检测格式: Slate JSON 字符串
  ├─ convertSlateJsonToEventLog()
  │   ├─ jsonToSlateNodes(slateJson)
  │   ├─ slateNodesToHtml(nodes)
  │   └─ 构建 EventLog 对象 { slateJson, html, plainText, ... }
  └─ 返回 EventLog 对象
  ↓
localStorage 持久化 (EventLog 对象格式)
  ↓
ActionBasedSyncManager 读取 eventlog.html
  ↓
Outlook API (body.content = html)
```

#### 流程2: 外部同步 → 内部识别

```
Outlook 事件更新 (body.content = HTML)
  ↓
ActionBasedSyncManager.handleIncomingUpdate()
  ↓
htmlToSlateJson(outlookHtml)  // 基础转换
  ↓
EventService.updateEvent(eventId, { eventlog: slateJson })
  ↓
EventService.normalizeEventLog(slateJson)
  ├─ 检测格式: HTML 字符串（如果包含标签）
  ├─ htmlToSlateJsonWithRecognition(html)
  │   ├─ parseHtmlNode() - 递归解析
  │   ├─ recognizeByDataAttributes() - 精确匹配
  │   │   ├─ data-tag-id → TagNode
  │   │   └─ data-type="dateMention" → DateMentionNode
  │   └─ recognizeInlineElements() - 模糊匹配
  │       ├─ recognizeTagNodeByPattern() - "@工作"
  │       └─ recognizeDateMentionByPattern() - "11/29 10:00"
  ├─ convertSlateJsonToEventLog()
  └─ 返回 EventLog 对象（含识别的元素）
  ↓
localStorage 持久化
  ↓
EventHub.emit('eventsUpdated')
  ↓
前端组件重新渲染（显示 Tag、DateMention）
```

#### 流程3: 读取时标准化

```
PlanManager.loadEvents()
  ↓
EventService.getEventById(eventId)
  ↓
从 localStorage 读取原始数据
  ├─ 可能是 EventLog 对象（新数据）
  ├─ 可能是 Slate JSON 字符串（中间状态）
  └─ 可能是 HTML 字符串（旧数据）
  ↓
EventService.normalizeEventLog(event.eventlog)
  ├─ 自动检测格式
  ├─ 统一转换为 EventLog 对象
  └─ 返回标准化数据
  ↓
PlanManager 直接使用 eventlog.slateJson
  ↓
ModalSlate 渲染（无需格式判断）
```

---

### 已知限制与改进方向

#### 1. 简化的日期解析

**当前**: 使用简化版 `parseSimpleDate()`  
**问题**: 只支持 3 种基本格式  
**解决方案**: 集成 TimeHub 的 `parseNaturalLanguageDate()`

```typescript
// TODO: 替换为 TimeHub 解析
const parsedDate = TimeHub.parseNaturalLanguageDate(dateText);
```

#### 2. Tag 创建逻辑

**当前**: 模糊匹配时创建临时 ID  
**问题**: 无法关联到现有标签  
**解决方案**: 注入 TagService 或使用事件总线

```typescript
// TODO: 查询现有标签
const existingTag = TagService.findTagByName(tagName);
if (existingTag) {
  return existingTag.id;
}
```

#### 3. ElementsMetadata 辅助字段（P1 优先级）

**目标**: 提升反向识别速度和准确性

```typescript
interface EventLog {
  slateJson: string;
  html: string;
  plainText: string;
  elementsMetadata?: {  // 🆕 辅助字段
    tags: Array<{ tagId: string; tagName: string; textPattern: string; position: { start: number; end: number } }>;
    dateMentions: Array<{ startDate: string; textPattern: string; position: { start: number; end: number } }>;
    totalElements: number;
    lastUpdated: string;
  };
  // ...
}
```

**使用场景**:
- 保存时生成 ElementsMetadata
- Outlook 回传时使用 textPattern 快速匹配（O(n) vs O(n*m)）
- 降级到正则匹配（失败时）

---

## 🔧 v1.9 EventLog 与 Description 字段转换机制详解 (2025-11-29)

### 核心架构概览

**背景问题**：
- `eventlog` 字段：存储富文本内容（Slate JSON），支持版本历史、附件等复杂功能
- `description` 字段：传统文本字段，用于 Outlook/Google Calendar 同步
- 两者需要保持同步，但格式和用途不同
- **v1.8 新增**: HTML 反向识别机制，自动从 Outlook HTML 中恢复 App 元素

**设计目标**：
1. ✅ 单一数据源：`eventlog` 为主，`description` 为同步用派生字段
2. ✅ 自动转换：组件层无需关心格式转换，EventService 统一处理
3. ✅ 双向同步：内部编辑 → 外部同步，外部更新 → 内部同步
4. ✅ 数据完整性：保留 eventlog 的元数据（attachments、versions、syncState）
5. ✅ 反向识别：从 Outlook HTML 中识别并恢复 Tag、DateMention 等元素

### 1. 数据结构定义

#### EventLog 对象（完整结构）
```typescript
interface EventLog {
  // ===== 内容字段（三种格式） =====
  slateJson: string;                  // Slate JSON 格式（主数据源，用户编辑）
  html: string;                       // HTML 格式（渲染用，Outlook 同步）
  plainText: string;                  // 纯文本（搜索用，性能优化）
  
  // ===== 元数据字段 =====
  attachments?: Attachment[];         // 附件列表
  versions?: EventLogVersion[];       // 版本历史
  syncState?: {                       // 同步状态
    status: 'pending' | 'synced' | 'conflict';
    contentHash: string;              // 内容哈希（检测冲突）
    lastSyncTime?: string;
  };
  
  // ===== 时间戳 =====
  createdAt: string;                  // 创建时间
  updatedAt: string;                  // 最后更新时间
}
```

#### Event 接口中的相关字段
```typescript
interface Event {
  // ... 其他字段
  
  eventlog?: EventLog | string;       // ✅ 支持多种格式输入（自动标准化）
  description?: string;               // ⚠️ 仅用于外部同步，不推荐直接修改
  notes?: string;                     // 📝 旧版字段，向后兼容
}
```

### 2. 转换机制详解（基于 v1.8 实现）

#### 核心方法概览

| 方法名 | 功能 | 输入 | 输出 |
|--------|------|------|------|
| `normalizeEventLog()` | 统一标准化入口 | 5种格式 | EventLog 对象 |
| `convertSlateJsonToEventLog()` | Slate JSON → EventLog | 字符串 | EventLog 对象 |
| `htmlToSlateJsonWithRecognition()` | HTML → Slate JSON | HTML 字符串 | Slate JSON 字符串 |
| `parseHtmlNode()` | 递归解析 HTML | DOM Node | Slate 节点数组 |
| `recognizeByDataAttributes()` | 精确匹配 | HTMLElement | TagNode/DateMentionNode |
| `recognizeInlineElements()` | 模糊匹配 | 文本字符串 | 混合节点数组 |
| `recognizeTagNodeByPattern()` | Tag 模式识别 | 文本字符串 | 匹配结果数组 |
| `recognizeDateMentionByPattern()` | DateMention 模式识别 | 文本字符串 | 匹配结果数组 |

详细实现请参考 **v1.8 EventLog 保存架构优化** 章节。

#### 2.1 输入格式自动检测与转换（normalizeEventLog）

**位置**: `src/services/EventService.ts` (L1391-1448)

```typescript
/**
 * 标准化 eventlog 字段 - 支持 5 种输入格式
 */
private static normalizeEventLog(eventlogInput: any): EventLog {
  // ========== 场景1: 已经是 EventLog 对象 ==========
  if (typeof eventlogInput === 'object' && eventlogInput !== null && 'slateJson' in eventlogInput) {
    console.log('[EventService] eventlog 已是标准对象');
    return eventlogInput as EventLog;
  }
  
  // ========== 场景2: undefined 或 null ==========
  if (eventlogInput === undefined || eventlogInput === null) {
    console.log('[EventService] eventlog 为空，返回空对象');
    return this.convertSlateJsonToEventLog('[]');
  }
  
  // ========== 场景3-5: 字符串格式（需要判断类型）==========
  if (typeof eventlogInput === 'string') {
    const trimmed = eventlogInput.trim();
    
    // 空字符串
    if (!trimmed) {
      return this.convertSlateJsonToEventLog('[]');
    }
    
    // 场景3: Slate JSON 字符串（以 [ 开头）
    if (trimmed.startsWith('[')) {
      console.log('[EventService] 检测到 Slate JSON 字符串');
      return this.convertSlateJsonToEventLog(eventlogInput);
    }
    
    // 场景4: HTML 字符串（包含标签）→ 反向识别
    if (trimmed.startsWith('<') || trimmed.includes('<p>') || trimmed.includes('<div>')) {
      console.log('[EventService] 检测到 HTML 字符串，进行反向识别');
      // ✅ 使用反向识别将 HTML 转换为 Slate JSON
      const slateJson = this.htmlToSlateJsonWithRecognition(eventlogInput);
      return this.convertSlateJsonToEventLog(slateJson);
    }
    
    // 场景5: 纯文本字符串
    console.log('[EventService] 检测到纯文本，转换为单段落');
    const slateJson = JSON.stringify([{
      type: 'paragraph',
      children: [{ text: eventlogInput }]
    }]);
    return this.convertSlateJsonToEventLog(slateJson);
  }
  
  // 未知格式 - 降级为空
  console.warn('[EventService] 未知 eventlog 格式:', typeof eventlogInput);
  return this.convertSlateJsonToEventLog('[]');
}
```

**convertSlateJsonToEventLog()** - Slate JSON → EventLog 对象
```typescript
/**
 * 将 Slate JSON 字符串转换为完整的 EventLog 对象
 */
private static convertSlateJsonToEventLog(slateJson: string): EventLog {
  try {
    const slateNodes = jsonToSlateNodes(slateJson);
    const htmlDescription = slateNodesToHtml(slateNodes);
    const plainTextDescription = htmlDescription.replace(/<[^>]*>/g, '');
    
    return {
      slateJson: slateJson,
      html: htmlDescription,
      plainText: plainTextDescription,
      attachments: [],
      versions: [],
      syncState: {
        status: 'pending',
        contentHash: this.hashContent(slateJson),
      },
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
    };
  } catch (error) {
    console.error('[EventService] convertSlateJsonToEventLog 失败:', error);
    // 降级返回空对象
    return {
      slateJson: '[]',
      html: '',
      plainText: '',
      attachments: [],
      versions: [],
      syncState: { status: 'pending' },
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
    };
  }
}
```

**htmlToSlateJsonWithRecognition()** - HTML → Slate JSON（含反向识别）
```typescript
/**
 * HTML 转换为 Slate JSON（含反向识别）
 * 从 Outlook 返回的 HTML 中识别出 App 元素（Tag、DateMention 等）
 */
private static htmlToSlateJsonWithRecognition(html: string): string {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const slateNodes: any[] = [];
    
    // 遍历 HTML 节点并转换
    this.parseHtmlNode(tempDiv, slateNodes);
    
    // 确保至少有一个段落
    if (slateNodes.length === 0) {
      slateNodes.push({
        type: 'paragraph',
        children: [{ text: '' }]
      });
    }
    
    return JSON.stringify(slateNodes);
  } catch (error) {
    console.error('[EventService] htmlToSlateJsonWithRecognition 失败:', error);
    return '[]';
  }
}

/**
 * 递归解析 HTML 节点
 * 处理块级元素、格式化元素、data-* 属性识别、文本模式匹配
 */
private static parseHtmlNode(node: Node, slateNodes: any[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (text.trim()) {
      // 检查文本中是否包含 Tag 或 DateMention 模式
      const fragments = this.recognizeInlineElements(text);
      slateNodes.push(...fragments);
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement;
    
    // 1. 精确匹配：检查 data-* 属性
    const recognizedNode = this.recognizeByDataAttributes(element);
    if (recognizedNode) {
      slateNodes.push(recognizedNode);
      return;
    }
    
    // 2. 块级元素：段落、列表等
    if (element.tagName === 'P' || element.tagName === 'DIV') {
      const paragraphChildren: any[] = [];
      element.childNodes.forEach(child => {
        this.parseHtmlNode(child, paragraphChildren);
      });
      
      if (paragraphChildren.length > 0) {
        slateNodes.push({
          type: 'paragraph',
          children: paragraphChildren
        });
      }
      return;
    }
    
    // 3. 格式化元素：bold, italic, underline 等
    if (['STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN'].includes(element.tagName)) {
      const marks: any = {};
      
      if (element.tagName === 'STRONG' || element.tagName === 'B') marks.bold = true;
      if (element.tagName === 'EM' || element.tagName === 'I') marks.italic = true;
      if (element.tagName === 'U') marks.underline = true;
      if (element.tagName === 'S') marks.strikethrough = true;
      
      // 提取颜色
      const style = element.getAttribute('style');
      if (style) {
        const colorMatch = style.match(/color:\s*([^;]+)/);
        const bgColorMatch = style.match(/background-color:\s*([^;]+)/);
        if (colorMatch) marks.color = colorMatch[1].trim();
        if (bgColorMatch) marks.backgroundColor = bgColorMatch[1].trim();
      }
      
      // 递归处理子节点
      element.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          slateNodes.push({ text: child.textContent || '', ...marks });
        } else {
          this.parseHtmlNode(child, slateNodes);
        }
      });
      return;
    }
    
    // 4. 其他元素：递归处理子节点
    element.childNodes.forEach(child => {
      this.parseHtmlNode(child, slateNodes);
    });
  }
}
```

**recognizeByDataAttributes()** - 精确匹配（data-* 属性）
```typescript
/**
 * 通过 data-* 属性精确识别元素
 */
private static recognizeByDataAttributes(element: HTMLElement): any | null {
  // TagNode 识别
  if (element.hasAttribute('data-tag-id')) {
    return {
      type: 'tag',
      tagId: element.getAttribute('data-tag-id') || '',
      tagName: element.getAttribute('data-tag-name') || '',
      tagColor: element.getAttribute('data-tag-color') || undefined,
      tagEmoji: element.getAttribute('data-tag-emoji') || undefined,
      mentionOnly: element.hasAttribute('data-mention-only'),
      children: [{ text: '' }]
    };
  }
  
  // DateMentionNode 识别
  if (element.getAttribute('data-type') === 'dateMention' || element.hasAttribute('data-start-date')) {
    const startDate = element.getAttribute('data-start-date');
    if (startDate) {
      return {
        type: 'dateMention',
        startDate: startDate,
        endDate: element.getAttribute('data-end-date') || undefined,
        eventId: element.getAttribute('data-event-id') || undefined,
        originalText: element.getAttribute('data-original-text') || undefined,
        isOutdated: element.getAttribute('data-is-outdated') === 'true',
        children: [{ text: '' }]
      };
    }
  }
  
  return null;
}
```

**recognizeInlineElements()** - 模糊匹配（正则模式）
```typescript
/**
 * 识别文本中的内联元素（Tag、DateMention）
 * 使用正则模式进行模糊匹配
 */
private static recognizeInlineElements(text: string): any[] {
  const fragments: any[] = [];
  let lastIndex = 0;
  
  // 1. 尝试识别 TagNode
  const tagMatches = this.recognizeTagNodeByPattern(text);
  
  // 2. 尝试识别 DateMentionNode
  const dateMatches = this.recognizeDateMentionByPattern(text);
  
  // 合并所有匹配结果并排序
  const allMatches = [...tagMatches, ...dateMatches].sort((a, b) => a.index - b.index);
  
  // 构建最终的 fragments
  for (const match of allMatches) {
    // 添加匹配前的纯文本
    if (match.index > lastIndex) {
      fragments.push({ text: text.slice(lastIndex, match.index) });
    }
    
    // 添加识别的节点
    fragments.push(match.node);
    
    lastIndex = match.index + match.length;
  }
  
  // 添加剩余的文本
  if (lastIndex < text.length) {
    fragments.push({ text: text.slice(lastIndex) });
  }
  
  // 如果没有匹配任何元素，返回整个文本
  if (fragments.length === 0) {
    fragments.push({ text: text });
  }
  
  return fragments;
}
```

#### 2.2 外部同步转换（ActionBasedSyncManager）

**发送到 Outlook**:
```typescript
// ActionBasedSyncManager.ts - 发送到 Outlook
private async executeCreateAction(action: SyncAction) {
  const event = action.data;
  
  // 🔥 从 eventlog 提取 description（优先）
  let descriptionForSync = '';
  
  if (event.eventlog && typeof event.eventlog === 'object') {
    // EventLog 对象 → 提取 html（含 data-* 属性）
    descriptionForSync = event.eventlog.html || '';
  } else if (typeof event.eventlog === 'string') {
    // Slate JSON 字符串 → 先转换为 HTML
    const slateNodes = jsonToSlateNodes(event.eventlog);
    descriptionForSync = slateNodesToHtml(slateNodes);
  } else if (event.description) {
    // 降级方案：使用 description 字段
    descriptionForSync = event.description;
  }
  
  // 构建 Outlook 事件数据
  const outlookEventData = {
    subject: event.title?.simpleTitle || '(无标题)',
    body: {
      contentType: 'HTML',
      content: descriptionForSync || ' ',  // Outlook 要求至少一个空格
    },
    // ... 其他字段
  };
  
  // 发送到 Outlook API
  await this.microsoftService.createEvent(outlookEventData);
}
```

**从 Outlook 接收更新**:
```typescript
// ActionBasedSyncManager.ts - 从 Outlook 接收更新
private async handleIncomingUpdate(outlookEvent: OutlookEvent) {
  const localEvent = EventService.getEventById(outlookEvent.localId);
  
  // Outlook description 变化 → 同步到本地 eventlog
  const outlookDescription = outlookEvent.body?.content || '';
  
  // ✅ 简化：只传递 Slate JSON 字符串，让 EventService 自动转换
  const slateJson = htmlToSlateJson(outlookDescription);
  
  await EventService.updateEvent(localEvent.id, {
    eventlog: slateJson,  // EventService 会自动识别并转换
  });
  
  // EventService.normalizeEventLog() 内部流程：
  // 1. 检测格式：HTML 字符串
  // 2. 调用 htmlToSlateJsonWithRecognition(outlookDescription)
  //    - 精确匹配 data-* 属性 → TagNode/DateMentionNode
  //    - 模糊匹配文本模式 → "@工作", "11/29 10:00"
  // 3. 转换为 EventLog 对象（含识别的元素）
  // 4. 保存到 localStorage
}
```

### 3. 完整转换机制总览

#### 3.1 输入格式处理矩阵

| 输入格式 | 检测条件 | 处理方法 | 输出 |
|---------|---------|---------|------|
| **EventLog 对象** | `typeof === 'object' && 'slateJson' in input` | 直接返回 | EventLog 对象 |
| **undefined/null** | `input === undefined \|\| input === null` | 返回空对象 | `{ slateJson: '[]', ... }` |
| **Slate JSON 字符串** | `typeof === 'string' && startsWith('[')` | `convertSlateJsonToEventLog()` | EventLog 对象 |
| **HTML 字符串** | `typeof === 'string' && (startsWith('<') \|\| includes('<p>'))` | `htmlToSlateJsonWithRecognition()` | EventLog 对象（含识别元素） |
| **纯文本** | `typeof === 'string' && 其他` | 转换为单段落 Slate JSON | EventLog 对象 |

#### 3.2 识别策略优先级

| 元素类型 | 精确匹配（data-* 属性） | 模糊匹配（正则模式） | 降级处理 |
|---------|---------------------|------------------|---------|
| **TagNode** | `data-tag-id`, `data-tag-name` | `/@工作/`, `/💼 @工作/` | 创建临时 Tag |
| **DateMentionNode** | `data-type="dateMention"`, `data-start-date` | `/11\/29 10:00/`, `/今天下午3点/` | 降级为纯文本 |
| **TextNode (格式化)** | `style="color: red"` | `<strong>`, `<em>`, `<u>` | 保留格式标记 |
| **ParagraphNode** | - | `<p>`, `<div>` | 自动包裹 |

#### 3.3 数据流向图

**流向1: 内部编辑 → Outlook 同步**
```
用户输入 (ModalSlate)
  ↓ onChange (Slate JSON 字符串)
EventEditModalV2.handleSave()
  ↓
EventHub.updateFields({ eventlog: slateJson })
  ↓
EventService.updateEvent()
  ↓
normalizeEventLog(slateJson)
  ├─ 检测格式: Slate JSON 字符串
  ├─ convertSlateJsonToEventLog()
  │   ├─ jsonToSlateNodes()
  │   ├─ slateNodesToHtml() → 生成含 data-* 属性的 HTML
  │   └─ 构建 EventLog 对象 { slateJson, html, plainText }
  └─ 返回 EventLog 对象
  ↓
localStorage 持久化
  ↓
ActionBasedSyncManager.executeCreateAction()
  ↓
提取 eventlog.html（含 data-* 属性）
  ↓
Outlook API (body.content = html)
```

**流向2: Outlook 更新 → 内部识别**
```
Outlook 事件更新 (body.content = HTML)
  ↓ 用户在 Outlook 编辑（丢失 data-* 属性）
ActionBasedSyncManager.handleIncomingUpdate()
  ↓
htmlToSlateJson(outlookHtml)  // 基础转换
  ↓
EventService.updateEvent({ eventlog: slateJson })
  ↓
normalizeEventLog(slateJson)
  ├─ 检测格式: HTML 字符串
  ├─ htmlToSlateJsonWithRecognition(html)
  │   ├─ parseHtmlNode() - 递归解析
  │   ├─ recognizeByDataAttributes() - 精确匹配
  │   │   ├─ data-tag-id → TagNode
  │   │   └─ data-type="dateMention" → DateMentionNode
  │   └─ recognizeInlineElements() - 模糊匹配
  │       ├─ recognizeTagNodeByPattern() - "@工作" → TagNode
  │       ├─ recognizeDateMentionByPattern() - "11/29 10:00" → DateMentionNode
  │       └─ 格式化文本 - <strong> → { text: '...', bold: true }
  ├─ convertSlateJsonToEventLog()
  └─ 返回 EventLog 对象（含识别的元素）
  ↓
localStorage 持久化
  ↓
EventHub.emit('eventsUpdated')
  ↓
前端重新渲染（显示恢复的 Tag、DateMention）
```

**流向3: 读取时标准化**
```
PlanManager.loadEvents()
  ↓
EventService.getEventById(eventId)
  ↓
从 localStorage 读取原始数据
  ├─ 可能是 EventLog 对象（新数据）
  ├─ 可能是 Slate JSON 字符串（中间状态）
  ├─ 可能是 HTML 字符串（旧数据/Outlook 同步）
  └─ 可能是纯文本（最旧数据）
  ↓
normalizeEventLog(event.eventlog)
  ├─ 自动检测格式
  ├─ 统一转换为 EventLog 对象
  └─ 返回标准化数据
  ↓
PlanManager 直接使用 eventlog.slateJson
  ↓
ModalSlate 渲染（无需格式判断）
```

### 4. 实现状态

#### 已实现功能 ✅

| 功能 | 位置 | 状态 |
|------|------|------|
| `normalizeEventLog()` | EventService.ts (L1391-1448) | ✅ 已实现 |
| `convertSlateJsonToEventLog()` | EventService.ts (L1450-1486) | ✅ 已实现 |
| `htmlToSlateJsonWithRecognition()` | EventService.ts (L1488-1518) | ✅ 已实现 |
| `parseHtmlNode()` | EventService.ts (L1520-1593) | ✅ 已实现 |
| `recognizeByDataAttributes()` | EventService.ts (L1558-1593) | ✅ 已实现 |
| `recognizeInlineElements()` | EventService.ts (L1595-1633) | ✅ 已实现 |
| `recognizeTagNodeByPattern()` | EventService.ts (L1635-1668) | ✅ 已实现 |
| `recognizeDateMentionByPattern()` | EventService.ts (L1670-1721) | ✅ 已实现 |
| `parseSimpleDate()` | EventService.ts (L1723-1763) | ✅ 已实现 |
| `getEventById()` 标准化调用 | EventService.ts (L194) | ✅ 已实现 |

#### 待优化项 🔄

| 优先级 | 功能 | 描述 |
|--------|------|------|
| **P0** | 集成测试 | 在实际应用中验证所有场景 |
| **P1** | 集成 TimeHub | 替换 `parseSimpleDate()` 为完整日期解析 |
| **P1** | 集成 TagService | 查询现有标签而非创建临时 ID |
| **P1** | ElementsMetadata | 辅助字段提升识别速度（10x） |
| **P2** | 单元测试 | 完整的测试覆盖 |
| **P2** | 性能监控 | 识别速度和准确率统计 |
| **P3** | Bullet List 识别 | 支持多级列表反向识别 |
| **P3** | Nested Event 识别 | 支持 eventlog 中的嵌套事件 |

### 5. 测试指南

#### 5.1 测试文件

**位置**: `test-eventlog-normalization.html`

**测试用例**:
1. EventLog 对象输入（已标准化）
2. undefined 输入
3. Slate JSON 字符串输入
4. HTML 字符串输入（无 data-* 属性）
5. 纯文本输入
6. HTML 含 Tag（data-* 属性）
7. HTML 含 DateMention（data-* 属性）
8. 文本含 Tag 模式（模糊匹配）
9. 文本含 DateMention 模式（模糊匹配）

#### 5.2 运行测试

```bash
# 1. 启动应用
npm run dev

# 2. 在浏览器中打开
http://localhost:5173/test-eventlog-normalization.html

# 3. 点击"运行所有测试"
```

#### 5.3 手动测试场景

**场景1: 内部编辑 → Outlook 同步 → 编辑 → 回传**
```
1. 在 EventEditModal 中添加 Tag (@工作) 和 DateMention (11/29 10:00)
2. 保存事件
3. 检查 localStorage 中 eventlog 是否包含完整 EventLog 对象
4. 触发同步到 Outlook
5. 在 Outlook 中编辑内容（丢失 data-* 属性）
6. 触发同步回 App
7. 检查 Tag 和 DateMention 是否被正确识别并恢复
```

**场景2: Outlook 创建 → 同步到 App**
```
1. 在 Outlook 中创建事件，内容包含 "@工作" 和 "11/29 10:00"
2. 触发同步到 App
3. 检查 eventlog 是否包含 TagNode 和 DateMentionNode
4. 在 PlanSlate 中查看是否正确显示
```

**场景3: 旧数据迁移**
```
1. 在 localStorage 中手动创建旧格式数据（纯字符串 eventlog）
2. 使用 getEventById() 读取
3. 检查是否自动转换为 EventLog 对象
4. 验证数据完整性
```

### 6. 关键转换场景示例

#### 场景1：用户在 EventEditModalV2 编辑内容
```typescript
// ✅ 前端只传递 Slate JSON
const handleSave = async () => {
  await EventHub.updateFields(eventId, {
    eventlog: currentSlateJson,  // 字符串
  });
};

// EventService 自动转换为：
{
  eventlog: {
    slateJson: currentSlateJson,
    html: "<p>转换后的 HTML</p>",
    plainText: "转换后的纯文本",
    // ... 其他元数据
  },
  description: "<p>转换后的 HTML</p>",  // 自动同步
}
```

#### 场景2：Outlook 更新事件描述
```typescript
// Outlook 推送更新
const outlookUpdate = {
  id: 'outlook-123',
  body: { content: '<p>用户在 Outlook 修改的内容</p>' }
};

// ActionBasedSyncManager 处理
await EventService.updateEvent(localEventId, {
  description: outlookUpdate.body.content,
  // ⚠️ 未传递 eventlog，触发反向同步
});

// EventService 内部自动：
{
  eventlog: {
    slateJson: htmlToSlateJson('<p>用户在 Outlook 修改的内容</p>'),
    html: '<p>用户在 Outlook 修改的内容</p>',
    plainText: '用户在 Outlook 修改的内容',
    attachments: [...],  // ✅ 保留原有附件
    versions: [...],     // ✅ 保留版本历史
  },
  description: '<p>用户在 Outlook 修改的内容</p>',
}
```

#### 场景3：Timer 自动保存（30秒）
```typescript
// App.tsx - saveTimerEvent
const timerEvent: Event = {
  id: timerEventId,
  startTime: formatTimeForStorage(startTime),
  endTime: formatTimeForStorage(endTime),
  eventlog: existingEvent?.eventlog,  // ✅ 保留用户编辑的 eventlog
  // ⚠️ 不传递 description，避免覆盖
};

await EventService.updateEvent(timerEventId, timerEvent, {
  skipSync: true,
  source: 'timer-auto-save'
});
```

#### 场景4：外部创建事件（无 eventlog）
```typescript
// Outlook 创建新事件
const newOutlookEvent = {
  subject: '新会议',
  body: { content: '<p>会议议程</p>' }
};

// MicrosoftCalendarService 转换为本地事件
const localEvent: Event = {
  id: generateId(),
  title: { simpleTitle: '新会议' },
  description: '<p>会议议程</p>',
  // ⚠️ 未传递 eventlog
};

await EventService.createEvent(localEvent);

// EventService 内部自动创建 eventlog：
{
  eventlog: {
    slateJson: htmlToSlateJson('<p>会议议程</p>'),
    html: '<p>会议议程</p>',
    plainText: '会议议程',
    createdAt: '2025-11-25T10:00:00',
    updatedAt: '2025-11-25T10:00:00',
  }
}
```

### 5. 最佳实践与注意事项

#### ✅ 推荐做法

1. **前端组件只传递 Slate JSON 字符串**
   ```typescript
   // ✅ 正确
   EventHub.updateFields(eventId, {
     eventlog: slateJsonString
   });
   
   // ❌ 错误（不需要手动构建 EventLog 对象）
   EventHub.updateFields(eventId, {
     eventlog: {
       slateJson: slateJsonString,
       html: manuallyConvertedHtml,  // EventService 会自动转换
       // ...
     }
   });
   ```

2. **外部同步只更新 description，让 EventService 处理 eventlog**
   ```typescript
   // ✅ 正确
   await EventService.updateEvent(eventId, {
     description: outlookBodyContent,
     // eventlog 会自动反向同步
   });
   
   // ❌ 错误（手动构建可能丢失元数据）
   await EventService.updateEvent(eventId, {
     description: outlookBodyContent,
     eventlog: {
       slateJson: manuallyConvert(outlookBodyContent),  // 丢失 attachments、versions
       html: outlookBodyContent,
     }
   });
   ```

3. **Timer 自动保存保留 eventlog，不覆盖**
   ```typescript
   // ✅ 正确
   const timerEvent = {
     id: eventId,
     startTime: newStartTime,
     eventlog: existingEvent?.eventlog,  // 保留
   };
   
   // ❌ 错误（会覆盖用户编辑的内容）
   const timerEvent = {
     id: eventId,
     startTime: newStartTime,
     description: '',  // 不要传递空值
   };
   ```

#### ⚠️ 常见陷阱

1. **陷阱1：直接修改 description 导致 eventlog 不一致**
   ```typescript
   // ❌ 错误示例
   await EventService.updateEvent(eventId, {
     description: newContent,  // 修改了 description
     // 但没有同步 eventlog，导致不一致
   });
   
   // ✅ 正确做法：只更新 eventlog
   await EventService.updateEvent(eventId, {
     eventlog: newSlateJson,  // description 会自动同步
   });
   ```

2. **陷阱2：外部同步覆盖 eventlog 元数据**
   ```typescript
   // ❌ 错误：直接赋值会丢失 attachments、versions
   updates.eventlog = {
     slateJson: newContent,
     html: newHtml,
     // 丢失了 attachments、versions、syncState
   };
   
   // ✅ 正确：保留原有元数据
   updates.eventlog = {
     ...originalEvent.eventlog,  // 保留元数据
     slateJson: newContent,
     html: newHtml,
     plainText: newPlainText,
     updatedAt: now(),
   };
   ```

3. **陷阱3：Outlook 同步时发送 EventLog 对象**
   ```typescript
   // ❌ 错误：Outlook API 无法反序列化对象
   outlookEvent.body.content = event.eventlog;  // 对象
   
   // ✅ 正确：提取 html 字符串
   outlookEvent.body.content = event.eventlog?.html || '';
   ```

### 6. 性能与兼容性

#### 性能优化
- ✅ **按需转换**：只在更新时转换，不在读取时重复转换
- ✅ **缓存哈希**：使用 contentHash 检测内容变化，避免不必要的同步
- ✅ **批量处理**：多次更新合并为一次持久化操作

#### 向后兼容
- ✅ **支持旧版 `notes` 字段**：自动迁移到 `description`
- ✅ **支持纯 HTML 输入**：自动转换为 EventLog 对象
- ✅ **支持纯字符串 eventlog**：兼容旧版本数据

#### 错误处理
```typescript
// EventService.updateEvent - 错误处理示例
try {
  const slateNodes = jsonToSlateNodes(updates.eventlog);
  // ... 转换逻辑
} catch (error) {
  console.error('[EventService] Slate JSON 解析失败，降级为纯文本', error);
  // 降级方案：保留原始字符串
  updates.eventlog = {
    content: updates.eventlog as string,
    descriptionHtml: updates.eventlog as string,
    descriptionPlainText: stripHtmlTags(updates.eventlog as string),
    // ...
  };
}
```

### 7. ActionBasedSyncManager 集成规范 (v1.10)

#### 7.1 架构原则

**核心规则**: **所有事件更新必须通过 EventService 执行，禁止直接操作 localStorage**

**架构违规示例** ❌:
```typescript
// ❌ 错误：绕过 EventService 直接操作 localStorage
const events = this.getLocalEvents();
events[index] = updatedEvent;
this.saveLocalEvents(events, false);

// ❌ 错误：手动触发 eventsUpdated
window.dispatchEvent(new CustomEvent('eventsUpdated', { detail: { eventId } }));
```

**正确架构实现** ✅:
```typescript
// ✅ 正确：通过 EventService 更新事件
await EventService.updateEvent(eventId, updates, skipSync, { 
  source: 'external-sync',
  originComponent: 'ActionBasedSyncManager'
});

// ✅ EventService 自动完成:
//    1. localStorage 持久化
//    2. 触发 eventsUpdated (每个更新 1 次)
//    3. 通知所有订阅组件
```

#### 7.2 变化检测机制

**问题**: 无变化检测导致 1016 个 eventsUpdated/20秒，造成性能问题

**解决方案**: 在更新前比较远程与本地数据

```typescript
// ✅ 实现示例 (ActionBasedSyncManager.syncPendingRemoteActions)
for (const action of updateActions) {
  const eventId = action.entityId;
  const existingEvent = EventService.getEventById(eventId);
  
  // 🔧 比较关键字段
  const remoteTitle = action.data.subject || '';
  const localTitle = existingEvent.title?.simpleTitle || existingEvent.title || '';
  const titleChanged = remoteTitle !== localTitle;
  
  const remoteStart = this.safeFormatDateTime(action.data.start?.dateTime);
  const remoteEnd = this.safeFormatDateTime(action.data.end?.dateTime);
  const timeChanged = remoteStart !== existingEvent.startTime || remoteEnd !== existingEvent.endTime;
  
  const cleanDescription = this.processEventDescription(htmlContent, 'outlook', 'sync', action.data);
  const descriptionChanged = cleanDescription !== existingEvent.description;
  
  // ⏭️ 跳过无变化的更新
  if (!titleChanged && !timeChanged && !descriptionChanged) {
    console.log(`⏭️ [Sync] 跳过无变化: ${eventId.slice(-8)}`);
    skippedCount++;
    continue;
  }
  
  // 🔄 有变化才执行更新
  console.log(`🔄 [Sync] 变化 ${eventId.slice(-8)}:`, {
    title: titleChanged ? `"${localTitle}" → "${remoteTitle}"` : '-',
    time: timeChanged ? `${existingEvent.startTime} → ${remoteStart}` : '-',
    desc: descriptionChanged ? `${existingEvent.description?.length || 0} → ${cleanDescription?.length || 0} chars` : '-'
  });
  
  await EventService.updateEvent(eventId, updates, true, { source: 'external-sync' });
  successCount++;
}

console.log(`✅ [SyncRemote] Completed: ${successCount} updated, ${skippedCount} skipped, ${failCount} failed`);
```

#### 7.3 性能指标

**优化前**:
- 1016 个 eventsUpdated / 20秒
- 1016 次 localStorage 写入
- 所有组件接收 1016 次无效通知

**优化后**:
- 0-2 个 eventsUpdated / 20秒 (99.8% ↓)
- 0-2 次 localStorage 写入
- 首次同步后几乎无 CPU 占用

**测试结果**:
```
首次同步: ✅ [SyncRemote] Completed: 1015 updated, 0 skipped, 0 failed
后续同步: ✅ [SyncRemote] Completed: 0 updated, 186 skipped, 0 failed
```

#### 7.4 影响范围

所有订阅 `eventsUpdated` 的组件自动受益:
- ✅ TimeCalendar: 减少日历重渲染
- ✅ PlanManager: 减少缓存清理和过滤计算
- ✅ PlanSlate: 减少 Slate 节点操作
- ✅ UpcomingEventsPanel: 减少无效状态更新

#### 7.5 关键要点

1. **EventService 是唯一入口**: 所有 CRUD 操作必须通过 EventService
2. **变化检测优先**: 比较后再决定是否更新
3. **skipSync=true**: 外部同步调用 EventService 时必须设置 skipSync，避免循环同步
4. **统计日志**: 记录 `updated/skipped/failed` 便于性能分析
5. **create/delete 例外**: 批量创建/删除可保留原有逻辑（不需要变化检测）

#### 7.6 相关文档

- **ACTIONBASEDSYNCMANAGER_PRD.md v1.5**: 架构合规性修复详细说明
- **SYNC_ARCHITECTURE_FIX_TEST.md**: 测试指南和验证步骤

---

### 8. 测试验证

#### 测试场景清单
- [ ] 用户在 EventEditModalV2 编辑 eventlog → 自动同步到 Outlook
- [ ] Outlook 更新 description → eventlog 反向同步（保留元数据）
- [ ] Timer 30秒自动保存 → 不覆盖用户编辑的 eventlog
- [ ] Timer 手动编辑保存 → 正确更新 eventlog
- [ ] 外部创建事件（无 eventlog） → 自动创建 EventLog 对象
- [ ] Slate JSON 解析失败 → 降级为纯文本（不崩溃）
- [ ] 添加附件/版本 → 元数据正确保留
- [ ] ActionBasedSyncManager 同步 → 通过 EventService 更新（无架构违规）
- [ ] 无变化同步 → 跳过更新（0 updated, N skipped）
- [ ] 有变化同步 → 正确更新（M updated, N skipped）

---

### 9. 关键 Bug 修复记录 (2025-12-09)

#### 9.1 ActionBasedSyncManager 未初始化服务调用 ❌→✅

**问题**: 代码中使用 `this.eventService.updateEvent()` 但 `eventService` 从未在构造函数中初始化  
**错误信息**: `TypeError: Cannot read properties of undefined (reading 'updateEvent')`  
**影响**: To Do 任务同步失败，所有 Calendar → To Do 迁移场景和创建新 To Do 任务场景都会报错

**修复位置**:
- `src/services/ActionBasedSyncManager.ts:2751` - Calendar → To Do 迁移场景
- `src/services/ActionBasedSyncManager.ts:3354` - Calendar → To Do 迁移场景  
- `src/services/ActionBasedSyncManager.ts:3390` - 创建新 To Do 任务场景

**解决方案**:
```typescript
// ❌ 旧代码 - 使用未初始化的实例属性
await this.eventService.updateEvent(localEvent.id, {
  calendarIds: localEvent.calendarIds.filter(id => id !== fromCalendarId)
});

// ✅ 新代码 - 使用静态方法
await EventService.updateEvent(localEvent.id, {
  calendarIds: localEvent.calendarIds.filter(id => id !== fromCalendarId)
});
```

**根本原因**: 
- EventService 是静态类（类似单例模式），所有方法都是 `static`
- 构造函数中只初始化了 `this.microsoftService = microsoftService`（L106）
- 从未初始化 `this.eventService`，导致 `this.eventService.updateEvent()` 调用时报 `undefined` 错误
- 代码中其他地方都正确使用了静态方法 `EventService.xxx()`，只有这 3 处错误使用实例调用

**架构设计原则**:
- ✅ EventService/TagService/TimeHub/EventHub/StorageManager 都是静态类，永远使用 `ClassName.method()` 调用
- ✅ microsoftService 是实例类，在构造函数中初始化，使用 `this.microsoftService.method()` 调用
- ❌ 绝不应该将静态类作为实例属性使用（如 `this.eventService`）

---

#### 9.2 PlanManager 丢失 EventTree 字段 ❌→✅

**问题**: 分级事件（一级标题 → 二级标题 → 三级标题）页面刷新后父子关系丢失，全部变成独立根事件  
**症状**: 
- UI 创建时正确（bulletLevel 0, 1, 2），parentEventId 正确设置
- 页面刷新后：所有 bulletLevel 变成 0，所有 parentEventId 变成 null
- 数据库中没有保存 parentEventId 和 childEventIds 字段

**根本原因**:
`PlanManager.executeBatchUpdate` 函数创建 eventItem 对象时使用了展开运算符，但后续显式字段赋值覆盖了 EventTree 相关字段：

```typescript
// ❌ 旧代码 - EventTree 字段被覆盖丢失
const eventItem: Event = {
  ...(existingItem || {}),
  ...updatedItem,
  id: updatedItem.id,
  title: updatedItem.title,
  // ... 其他 20+ 个显式字段赋值
  // ⚠️ parentEventId 和 childEventIds 没有显式保留，被后续字段覆盖
};

// 🔍 问题分析：
// 1. { ...existingItem, ...updatedItem } 包含了 parentEventId
// 2. 但后续显式赋值 20+ 个字段时，JS 对象字面量后定义的属性覆盖前面的
// 3. 如果显式字段列表中没有 parentEventId，则展开运算符中的值被丢弃
```

**解决方案**:
```typescript
// ✅ 新代码 - 显式保留 EventTree 字段
const eventItem: Event = {
  ...(existingItem || {}),
  ...updatedItem,
  id: updatedItem.id,
  title: updatedItem.title,
  // ... 其他字段 ...
  
  // 🔥 [FIX] 显式保留 EventTree 字段（优先使用 updatedItem，fallback 到 existingItem）
  parentEventId: updatedItem.parentEventId ?? existingItem?.parentEventId,
  childEventIds: updatedItem.childEventIds ?? existingItem?.childEventIds,
};
```

**修复位置**: `src/components/PlanManager.tsx:1210-1237`

**数据流验证**:
1. ✅ **Tab 键创建子事件**: PlanSlate 正确设置 `event.metadata.parentEventId` (L2700-2715)
2. ✅ **序列化读取**: `serializeLine` 从 `metadata.parentEventId` 读取到 `event.parentEventId` (L427)
3. ✅ **保存持久化**: PlanManager 显式保留 `parentEventId` 和 `childEventIds` 到数据库 (L1235-1236)
4. ✅ **页面刷新**: 从数据库加载事件，EventTree 字段完整保留

**EventTree 架构完整性**:
- EventTree 使用 `parentEventId` 和 `childEventIds` 表示父子关系（v2.16 统一字段架构）
- EventService 自动维护双向关联：创建/更新/删除子事件时自动更新父事件的 childEventIds
- PlanManager 必须在保存时显式保留这些字段，确保数据完整性

---

#### 9.3 PlanSlate Tab 键使用临时 ID 作为 parentEventId ❌→✅

**问题**: Tab 键创建子事件时，parentEventId 使用上一行的临时 ID (line-xxx)，而不是真实 ID  
**错误信息**: `⚠️ [EventService] 父事件不存在: {parentId: 'line-1765286724173-0.14171832823437325', childId: 'event_xxx'}`  
**影响**: 子事件创建失败，父子关系无法建立，EventService.getChildEvents() 查询为空

**根本原因**:
Tab 键保存逻辑按顺序保存事件：
1. 先保存上一行（父事件），从临时 ID (line-xxx) 获得真实 ID (event_xxx)
2. 将映射关系存入 `idMapping[line-xxx] = event_xxx`
3. 但创建子事件时直接使用 `previousEventId` (还是 line-xxx)，而不是从 idMapping 读取真实 ID

```typescript
// ❌ 旧代码 - 使用临时 ID 作为 parentEventId
const previousEventId = previousLine.event.id; // line-1765286724173-0.xxx
const isPreviousTempId = previousEventId.startsWith('line-');

// 🔥 问题：这里 previousEventId 还是临时 ID
await createEventWithParent({
  ...eventToSave,
  metadata: {
    ...eventToSave.metadata,
    parentEventId: previousEventId // ⚠️ line-xxx，而不是 event_xxx
  }
});
```

**解决方案**:
```typescript
// ✅ 新代码 - 从 idMapping 获取真实 ID
let resolvedParentId = previousEventId;
if (isCurrentEvent && isPreviousTempId) {
  // 上一行已经保存，从 idMapping 获取真实 ID
  resolvedParentId = idMapping[previousEventId] || previousEventId;
  console.log(`🔍 [Tab] 解析父事件 ID: ${previousEventId} → ${resolvedParentId}`);
}

await createEventWithParent({
  ...eventToSave,
  metadata: {
    ...eventToSave.metadata,
    parentEventId: resolvedParentId // ✅ event_xxx
  }
});
```

**修复位置**: `src/components/PlanSlate/PlanSlate.tsx:2783-2810`

**保存顺序说明**:
```typescript
// Tab 键保存流程：
// 1. 检测上一行是临时 ID，需要先保存
if (isPreviousTempId) {
  const savedId = await saveEventToService(previousLine.event);
  idMapping[previousEventId] = savedId; // ✅ 保存映射关系
}

// 2. 解析父事件真实 ID
const resolvedParentId = idMapping[previousEventId] || previousEventId;

// 3. 创建子事件，使用真实 ID
await createEventWithParent({
  metadata: { parentEventId: resolvedParentId }
});
```

**EventService 验证逻辑**:
```typescript
// EventService.createEvent 中的父事件检查
if (finalEvent.parentEventId) {
  const parent = existingEvents.find(e => e.id === finalEvent.parentEventId);
  if (!parent) {
    console.warn(`⚠️ [EventService] 父事件不存在: ${finalEvent.parentEventId}`);
    // ❌ 旧代码：使用 line-xxx 无法找到父事件
    // ✅ 新代码：使用 event_xxx 正确建立父子关系
  }
}
```

---

#### 9.4 全局架构安全检查 ✅

**检查范围**: 整个代码库所有类似模式

**检查结果**:
- ✅ `this.eventService` - 0 matches（已全部修复）
- ✅ `this.*Service` - 仅 `this.microsoftService`（构造函数正确初始化）
- ✅ `EventService.` - 所有调用都是正确的静态方法
- ✅ `new EventService(` - 0 matches（正确，静态类不应实例化）
- ✅ `new (TagService|TimeHub|EventHub)` - 0 matches（正确）
- ✅ `await this.*.(create|update|delete|get)` - 仅 `this.microsoftService.*`（正确）

**结论**: ✅ 代码库中不存在类似问题，所有静态服务调用符合架构规范

---

#### 9.5 开发者指南：避免类似 Bug

**关键原则**:

1. **静态服务类永远使用静态方法**:
   ```typescript
   // ✅ 正确
   await EventService.updateEvent(id, updates);
   await TagService.getAllTags();
   await TimeHub.getSnapshot(eventId);
   
   // ❌ 错误
   await this.eventService.updateEvent(id, updates);
   const service = new EventService(); // 静态类不应实例化
   ```

2. **展开运算符后的显式字段赋值要保留关键字段**:
   ```typescript
   // ❌ 错误 - EventTree 字段被丢弃
   const eventItem = {
     ...existingItem,
     ...updatedItem,
     id: updatedItem.id,
     title: updatedItem.title
     // ⚠️ parentEventId 丢失
   };
   
   // ✅ 正确 - 显式保留 EventTree 字段
   const eventItem = {
     ...existingItem,
     ...updatedItem,
     id: updatedItem.id,
     title: updatedItem.title,
     parentEventId: updatedItem.parentEventId ?? existingItem?.parentEventId,
     childEventIds: updatedItem.childEventIds ?? existingItem?.childEventIds
   };
   ```

3. **使用临时 ID 创建关联关系前先解析真实 ID**:
   ```typescript
   // ❌ 错误 - 使用临时 ID
   const parentId = previousEvent.id; // line-xxx
   await createChild({ parentEventId: parentId });
   
   // ✅ 正确 - 解析真实 ID
   let parentId = previousEvent.id;
   if (parentId.startsWith('line-')) {
     parentId = idMapping[parentId] || parentId;
   }
   await createChild({ parentEventId: parentId });
   ```

4. **构造函数中初始化的实例属性才能用 `this.xxx` 调用**:
   ```typescript
   class ActionBasedSyncManager {
     private microsoftService: MicrosoftService; // ✅ 实例属性
     
     constructor(microsoftService: MicrosoftService) {
       this.microsoftService = microsoftService; // ✅ 显式初始化
     }
     
     async someMethod() {
       // ✅ 正确 - microsoftService 已初始化
       await this.microsoftService.getEvents();
       
       // ✅ 正确 - EventService 是静态类
       await EventService.updateEvent(id, updates);
     }
   }
   ```

**架构层次**:
```
┌─────────────────────────────────────┐
│   UI 层 (EventEditModal/PlanSlate) │
├─────────────────────────────────────┤
│  状态管理层 (EventHub/TimeHub)      │ ← 静态类，使用 ClassName.method()
├─────────────────────────────────────┤
│  持久化层 (EventService)            │ ← 静态类，使用 ClassName.method()
├─────────────────────────────────────┤
│  存储抽象层 (StorageManager)        │ ← 单例类，使用 storageManagerInstance
├─────────────────────────────────────┤
│  同步管理层 (ActionBasedSyncManager)│ ← 实例类，在构造函数中初始化依赖
│  ├── microsoftService (实例)       │
│  └── 静态服务 (EventService/TagService) │
└─────────────────────────────────────┘
```

**测试清单**:
- [ ] 所有静态服务调用使用 `ClassName.method()` 格式
- [ ] 构造函数中初始化所有 `this.xxx` 实例属性
- [ ] 展开运算符后显式赋值时保留关键字段（parentEventId/childEventIds）
- [ ] 使用临时 ID 创建关联前从 idMapping 解析真实 ID
- [ ] 父子关系创建时验证父事件存在（EventService 会自动检查）

---

**文档版本**: v1.11  
**最后更新**: 2025-12-09  
**维护者**: GitHub Copilot  
**变更记录**:
- v1.0 (2025-11-06): 初始版本
- v1.1 (2025-11-06): 添加 EventEditModal v2 新增字段及任务关联功能实现指南
- v1.2 (2025-11-14): 移除 displayHint 存储依赖，时间显示完全基于动态计算
- v1.3 (2025-11-14): **支持 undefined 时间字段**，完善自然语言处理链路文档
- v1.4-v1.6 (2025-11-19): 循环更新防护、ID分配与时间系统优化
- v1.7 (2025-11-20): **新增事件签到功能**，完整的时间戳记录、EventHistoryService集成和状态线显示
- v1.8 (2025-11-24): **EventLog 保存架构优化**，统一由 EventService 负责 Slate JSON → EventLog 对象转换，修复 Timer eventlog 保存问题
- v1.9 (2025-11-25): **EventLog 与 Description 字段转换机制详解**，包含完整的双向同步逻辑、数据流向图、最佳实践和测试清单
- v1.10 (2025-11-28): **ActionBasedSyncManager 架构合规性修复**，所有事件更新必须通过 EventService 执行，禁止直接操作 localStorage
- v1.11 (2025-12-09): **关键 Bug 修复记录**，包含 ActionBasedSyncManager 未初始化服务调用、PlanManager EventTree 字段丢失、PlanSlate Tab 键临时 ID 问题的完整分析和解决方案
