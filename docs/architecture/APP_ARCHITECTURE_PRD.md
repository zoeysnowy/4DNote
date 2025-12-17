# App 组件架构文档 (PRD)

**版本**: v1.8  
**最后更新**: 2025-12-15  
**文档类型**: 架构设计文档（逆向工程）

---

## 文档概述

本文档通过逆向工程分析 `src/App.tsx` 组件，记录其架构设计、状态管理、渲染机制、性能优化策略及已知问题。

---

## 1. 组件职责

### 1.1 核心职责

`App.tsx` 是 4DNote 应用的**根组件**，负责：

1. **路由管理**: 管理页面切换（home, calendar, plan, tag, settings）
2. **全局状态管理**: 维护跨组件共享的状态
3. **服务初始化**: 初始化 TagService, EventService, MicrosoftCalendarService, SyncManager
4. **布局渲染**: 提供统一的应用布局和导航
5. **全局事件协调**: 处理跨组件的事件通信
6. **Timer 父子事件管理**: 自动检测独立 Timer 二次计时，升级为父子结构

### 1.2 子组件渲染

根据 `currentPage` 渲染不同的页面组件：
- **home**: `TimerCard` + `DailyStatsCard`
- **calendar**: `TimeCalendar`
- **plan**: `PlanManager`
- **tag**: `TagManager` (FigmaTagManager)
- **settings**: `SettingsModal`

### 1.3 模块事件处理规则 (v2.17.5)

各模块在创建和过滤事件时的字段使用规范：

#### 1.3.1 TimeCalendar - 日历事件创建

**创建场景**: 用户在日历上选择时间段

**必需字段**:
```typescript
{
  id: generateEventId(),           // UUID 格式: evt_<timestamp>_<random>
  title: { simpleTitle: '' },      // 空标题，用户在 Modal 中填写
  startTime: string,               // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  endTime: string,                 // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  isAllDay: boolean,               // 根据选择判断
  createdAt: string,               // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  updatedAt: string                // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
}
```

**默认值**:
```typescript
{
  tags: [],                        // 空数组
  calendarIds: [],                 // 空数组，不强制同步
  syncStatus: 'local-only',        // v2.17.5: 默认仅本地
  fourDNoteSource: true,           // 标记为 4DNote 创建
  location: '',
  description: ''
}
```

**同步规则**:
- ✅ 初始创建时不同步（`syncStatus: 'local-only'`）
- ✅ 用户添加标签/日历后自动升级为 `'pending'`
- ✅ ActionBasedSyncManager 跳过 `local-only` 事件

**代码位置**: `TimeCalendar.tsx` L1785-1816

---

#### 1.3.2 TimeLog - 笔记创建

**创建场景**: 用户创建时间轴笔记

**必需字段**:
```typescript
{
  id: generateEventId(),
  title: { simpleTitle: '' },
  startTime: string,               // 笔记时间 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  endTime: string,                 // 同 startTime
  createdAt: string,               // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  updatedAt: string,               // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  isTimeLog: true                  // 标记为时间日志
}
```

**默认值**:
```typescript
{
  tags: [],
  calendarIds: [],                 // 不需要日历同步
  syncStatus: 'local-only',        // 笔记永远本地
  fourDNoteSource: true,
  eventlog: slateJson              // 富文本内容
}
```

**同步规则**:
- ❌ 笔记永不同步到日历（纯本地数据）
- ✅ 可添加标签用于分类

**代码位置**: `TimeLog.tsx` L1262

---

#### 1.3.3 App.tsx - Timer 事件创建

**创建场景**: 用户启动计时器

**必需字段**:
```typescript
{
  id: `timer-${tagId}-${timestamp}`, // 特殊 ID 格式
  title: { simpleTitle: string },    // 标签名称 + emoji
  startTime: string,                 // 计时开始时间 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  endTime: string,                   // 初始为确认时间 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  tags: string[],                    // 计时器关联的标签
  createdAt: string,                 // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  updatedAt: string,                 // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  isTimer: true                      // 标记为计时器事件
}
```

**默认值**:
```typescript
{
  calendarIds: tag.calendarId ? [tag.calendarId] : [], // 继承标签的日历映射
  syncStatus: 'local-only',          // 运行中强制本地
  fourDNoteSource: true,
  location: '',
  description: '计时中的事件'
}
```

**同步规则**:
- ❌ 运行中不同步（`syncStatus: 'local-only'`）
- ✅ 停止后自动切换为 `'pending'`，启动同步
- ✅ 支持升级为父子事件结构（二次计时）

**父子事件升级**:
```typescript
// 检测到已存在的 Timer 事件时
if (existingEvent && existingEvent.isTimer && !existingEvent.parentEventId) {
  // 创建父事件
  const parentEvent = {
    id: generateEventId(),
    title: existingEvent.title,
    tags: existingEvent.tags,
    // ... 继承元数据
  };
  
  // 将原 Timer 设置为子事件
  await EventService.updateEvent(existingEvent.id, {
    parentEventId: parentEvent.id
  });
}
```

**代码位置**: `App.tsx` L1100-1150, L500-550

---

#### 1.3.4 PlanManager - Plan 事件创建

**创建场景**: 用户在 Plan 编辑器中创建事件

**必需字段**:
```typescript
{
  id: generateEventId(),
  title: { simpleTitle: string, fullTitle: slateJson },
  tags: string[],                  // 从 # 标签提取
  createdAt: string,               // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  updatedAt: string                // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
}
```

**可选字段**（从内容解析）:
```typescript
{
  startTime?: string,              // 从 @date 解析 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  endTime?: string,                // 从 @date 解析 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  isAllDay?: boolean,              // 从时间格式判断
  parentEventId?: string,          // Tab 缩进创建子事件
  childEventIds?: string[],        // 自动维护
  eventlog: slateJson              // 完整富文本内容
}
```

**默认值**:
```typescript
{
  calendarIds: [],                 // 由用户选择或标签映射
  syncStatus: 'local-only',        // 默认本地
  fourDNoteSource: true
}
```

**同步规则**:
- ✅ 用户添加标签后，自动升级为 `'pending'`
- ✅ 支持父子事件层级（Tab/Shift+Tab）
- ✅ EventTree 双向关联自动维护

**EventTree 维护**:
- Tab 键创建子事件：自动设置 `parentEventId`
- 父事件自动更新 `childEventIds` 数组
- 删除事件时自动清理父子关系

**代码位置**: `PlanManager.tsx` L1500-1550, L2540-2570

---

#### 1.3.5 EventEditModal - 事件编辑和创建

**智能 syncStatus 判断** (v2.17.5):

```typescript
let finalSyncStatus: SyncStatus;

if (isRunningTimer) {
  finalSyncStatus = 'local-only';  // Timer 运行中强制本地
} else {
  const hasTags = formData.tags && formData.tags.length > 0;
  const hasCalendars = formData.calendarIds && formData.calendarIds.length > 0;
  
  if (hasTags || hasCalendars) {
    finalSyncStatus = 'pending';   // 有标签/日历，需要同步
  } else {
    finalSyncStatus = event?.syncStatus || 'local-only'; // 保持原状态或默认本地
  }
}
```

**字段验证规则**:
- ✅ 时间完整性：`startTime` 和 `endTime` 必须同时存在或同时为空
- ✅ 标题非空：至少有 `simpleTitle` 或富文本内容
- ✅ 标签存在性：`tags` 中的 ID 必须在 TagService 中存在

**自动字段生成**:
- `calendarIds`: 从标签的 calendarMapping 自动提取
- `description`: 从 `eventlog.plainText` 自动生成
- `updatedAt`: 每次保存自动更新

**代码位置**: `EventEditModalV2.tsx` L1151-1171

---

#### 1.3.6 模块事件过滤规则

**TimeCalendar 显示过滤**:
```typescript
// 过滤条件
const shouldShow = (event) => {
  // 1. 可见日历过滤
  const hasVisibleCalendar = event.calendarIds?.some(id => visibleCalendars.includes(id));
  
  // 2. 本地事件过滤
  const isLocalCreated = event.fourDNoteSource && visibleCalendars.includes('local-created');
  
  // 3. 标签过滤
  const hasVisibleTag = event.tags?.some(id => visibleTags.includes(id));
  
  return hasVisibleCalendar || isLocalCreated || hasVisibleTag;
};
```

**TimeLog 时间轴过滤**:
```typescript
// 专门显示时间日志类型
const timelineEvents = events.filter(e => 
  e.isTimeLog === true ||           // 明确标记为日志
  (!e.isTimer && !e.isTask)         // 或非计时器/任务的普通事件
);
```

**DailyStatsCard 统计过滤**:
```typescript
// 统计当天的计时器事件
const todayTimers = events.filter(e => 
  e.isTimer === true &&             // 计时器事件
  isSameDay(e.startTime, today) &&  // 今天创建
  e.endTime !== e.startTime         // 已停止（有时长）
);
```

**PlanManager 显示过滤**:
```typescript
// 显示非子事件（顶层事件）
const topLevelEvents = events.filter(e => 
  !e.parentEventId                  // 没有父事件
);

// EventTree 递归显示子事件
const getChildren = (parentId) => {
  return events.filter(e => e.parentEventId === parentId);
};
```

---

#### 1.3.7 同步字段保护规则 (v2.17.2)

**本地专属字段**（永不被远程同步覆盖）:
```typescript
const localOnlyFields = new Set([
  'tags',                   // 标签
  'remarkableSource',       // 来源标记
  'childEventIds',          // 子事件列表
  'parentEventId',          // 父事件 ID
  'linkedEventIds',         // 关联事件
  'backlinks',              // 反向链接
  'fourDNoteSource',        // 4DNote 来源
  'isTimer',                // 计时器标记
  'isTimeLog',              // 时间日志标记
  'isOutsideApp'            // 外部应用标记
]);
```

**远程同步字段**（从 Outlook 同步）:
```typescript
const outlookFields = [
  'title',                  // 标题（receive-only 模式）
  'description',            // 描述
  'startTime',              // 开始时间
  'endTime',                // 结束时间
  'location',               // 地点
  'isAllDay',               // 全天事件
  'attendees',              // 参与者
  'organizer'               // 组织者
];
```

**双重保护机制**:
1. **ActionBasedSyncManager**: 只传递变化的 Outlook 字段
2. **EventService**: 检测 `source: 'external-sync'`，过滤本地专属字段

**代码位置**: 
- ActionBasedSyncManager.ts L2536, L4045, L4680, L4716
- EventService.ts L1100-1140

---

## 2. 状态管理

### 2.1 State 完整清单（共17个）

#### 2.1.1 计时器相关（1个）

| State | 类型 | 用途 | 触发渲染场景 |
|-------|------|------|------------|
| `globalTimer` | `GlobalTimer \| null` | 全局计时器对象 | 开始/暂停/恢复/停止 |

**渲染频率**: 用户交互时触发（开始/停止计时器）

**🎯 v1.7.1 优化**: 移除旧计时器系统（6个状态）和死代码，TimerCard 自行管理时间显示更新

#### 2.1.2 同步相关（4个）

| State | 类型 | 用途 | 触发渲染场景 |
|-------|------|------|------------|
| `lastSyncTime` | `Date \| null` | 最后同步时间 | 同步完成后更新 |
| `syncManager` | `ActionBasedSyncManager \| null` | 同步管理器实例 | 初始化时（仅一次） |
| `microsoftService` | `MicrosoftCalendarService` | Microsoft 日历服务实例 | 初始化时（仅一次） |
| `lastAuthState` | `boolean` | 认证状态 | 登录/登出 |

**渲染频率**: 低频（初始化、同步完成、认证变化时）

**🔧 架构说明**: `microsoftService` 使用 useState 而非直接引用全局变量，以确保 React 组件生命周期管理

#### 2.1.3 事件编辑相关（6个）

| State | 类型 | 用途 | 触发渲染场景 |
|-------|------|------|------------|
| `editingEventId` | `string` | 编辑中的事件ID | 打开编辑框 |
| `editingEventTitle` | `string` | 编辑中的标题 | 用户输入 |
| `editingEventDescription` | `string` | 编辑中的描述 | 用户输入 |
| `editingEventTagIds` | `string[]` | 编辑中的标签IDs（多标签） | 选择标签 |
| `availableTagsForEdit` | `FlatTag[]` | 可用标签列表 | TagService 更新 |
| `showEventEditModal` | `boolean` | 是否显示编辑框 | 打开/关闭 |

**渲染频率**: 中频（用户编辑事件时）

#### 2.1.4 标签和计时器编辑（2个）

| State | 类型 | 用途 | 触发渲染场景 | 性能影响 |
|-------|------|------|------------|----------|
| `tagsVersion` | `number` | 标签版本号 | TagService 更新 | **低** - 版本号变化时 |
| `timerEditModal` | `{ isOpen: boolean, event: Event \| null }` | Timer 编辑模态框状态 | 打开 Timer 编辑框 | **低** - 仅编辑时 |

**性能优化记录**:
- ✅ **v1.7.0**: 移除 `appTags` state，改用 `tagsVersion` 触发更新
- ✅ **v1.7.1**: 移除旧计时器系统（6个状态）和死代码
- ✅ **v1.7.1**: 移除 `allEvents` state，各组件自行监听 EventHub 更新
- ✅ **v2.17**: 移除 EventIdPool 系统，改用 UUID 直接生成

#### 2.1.5 设置和UI（4个）

| State | 类型 | 用途 | 触发渲染场景 |
|-------|------|------|------------|
| `appSettings` | `AppSettings` | 应用设置 | 用户修改设置 |
| `settingsLoaded` | `boolean` | 设置是否已加载 | 初始化时 |
| `currentPage` | `PageType` | 当前页面 | 页面切换 |
| `isPanelVisible` | `boolean` | 侧边栏可见性 | 用户切换侧边栏 |
| `showSettingsModal` | `boolean` | 设置模态框显示状态 | 打开/关闭设置 |

**渲染频率**: 低频（用户修改设置、页面切换时）

**🔧 架构变更**: 移除 `clickTrackerEnabled`（调试工具已废弃）

---

### 2.2 Computed Values (useMemo)

#### 2.2.1 hierarchicalTags

```typescript
const hierarchicalTags = useMemo(() => {
  return TagService.getTags();
}, [tagsVersion]);
```

**依赖**: `tagsVersion`  
**更新时机**: TagService.updateTags() 被调用时  
**性能优化**: 
- ✅ TagService.getTags() 返回稳定引用（直接返回 `this.tags`）
- ✅ 使用版本号机制避免不必要的重新计算

#### 2.2.2 availableCalendars

```typescript
const availableCalendars = useMemo(() => {
  return getAvailableCalendarsForSettings();
}, []);
```

**依赖**: 无（空依赖数组）  
**更新时机**: 组件挂载时计算一次  
**性能优化**: ✅ 缓存日历列表，避免每次渲染创建新数组

---

## 3. 渲染机制

### 3.1 渲染触发条件

App 组件会在以下情况重新渲染：

#### 3.1.1 高频触发（可能导致性能问题）

1. ~~**事件数据变化** - `allEvents` 更新~~
   - ✅ **已移除** (v1.7.1): 各组件自行监听 EventHub，避免 App 不必要的重渲染
   - DailyStatsCard 自己监听 `eventsUpdated` 事件
   - PlanManager 自己监听 EventHub 更新

#### 3.1.2 中频触发

1. **用户交互** - 编辑事件、选择标签等
   - `editingEventTitle`, `editingEventDescription`, `editingEventTagIds` 等
   - 影响范围: 编辑相关组件

2. **标签数据更新** - `tagsVersion` 增加
   - 触发场景:
     - FigmaTagManager 修改标签
     - TagService.updateTags() 被调用
   - 影响: `hierarchicalTags` 重新计算

#### 3.1.3 低频触发

1. **页面切换** - `currentPage` 变化
2. **同步完成** - `lastSyncTime` 更新
3. **认证状态变化** - `lastAuthState` 变化
4. **设置修改** - `appSettings` 变化

### 3.2 渲染优化策略

#### 3.2.1 已实施的优化

1. **useMemo 缓存**
   - `hierarchicalTags`: 缓存标签数据
   - `availableCalendars`: 缓存日历列表
   - `renderContent`: 缓存页面内容（依赖较多 states）

2. **稳定引用保证**
   - TagService.getTags() 返回内部 `this.tags` 引用
   - TagService.getFlatTags() 返回内部 `this.flatTags` 引用

3. **版本号机制**
   - 用 `tagsVersion` 代替 `appTags` state
   - 避免不必要的数组引用变化

#### 3.2.2 待优化项

1. ~~**allEvents 全局状态**~~
   - ✅ **已优化** (v1.7.1): 移除全局 state，各组件自行监听

2. **编辑相关 states 可合并**
   - 问题: `editingEventId`, `editingEventTitle`, `editingEventDescription`, `editingEventTagIds` 可以合并为单个对象
   - 建议: 使用 `useReducer` 管理编辑状态
   - 优先级: P3（低）

---

## 4. 服务依赖

### 4.1 服务初始化顺序

```
组件外部（模块加载时）
  ↓
1. microsoftCalendarService 实例创建
  ↓
2. 挂载到 window.microsoftCalendarService
  ↓
3. 挂载 EventService, EventHub, TimeHub 到 window（同步挂载）
  ↓
App Component Mount
  ↓
4. CacheManager.checkAndClearOldCache()
  ↓
5. TagService.initialize()
  ↓
6. ActionBasedSyncManager 创建 (setSyncManager)
  ↓
7. EventHub/TimeHub 静态方法调用（已在 window 上）
```

**🔧 关键架构点**:
- EventHub 和 TimeHub **必须同步挂载** 到 window，在 ActionBasedSyncManager 初始化前
- microsoftService 通过 useState 管理，确保 React 生命周期正确

---

### 4.2 UUID 创建机制 (v2.17)

**ID 生成策略**:
```typescript
// EventService.createEvent() 自动生成 UUID
if (!event.id || !isValidId(event.id, 'event')) {
  event.id = generateEventId(); // ✅ 生成 UUID v4 格式
}

// UUID 格式: evt_<timestamp>_<random>
// 示例: evt_1702656000000_abc123def
```

**ID 格式验证**:
- ✅ **有效格式**: `evt_` 开头的 UUID
- ❌ **临时 ID**: `line-`, `temp-`, `timer-` 开头（会被替换）
- ⚠️ **兼容性**: 支持旧格式 `event_` 开头的短 ID（遗留数据）

**关键特性**:
- 🔧 **自动修复**: 无效 ID 自动生成新 UUID
- 📝 **日志追踪**: 记录 ID 替换过程
- 🚀 **性能**: UUID 生成无需查询数据库，避免 ID 冲突

---

### 4.3 父子事件 EventTree 维护

#### 4.3.1 双向关联机制

**创建子事件时自动维护**:
```typescript
// EventService.createEvent() 自动维护父子关系
if (finalEvent.parentEventId) {
  const parentEvent = await this.getEventById(finalEvent.parentEventId);
  
  if (parentEvent) {
    // 🔗 自动添加到父事件的 childEventIds
    const childIds = parentEvent.childEventIds || [];
    if (!childIds.includes(finalEvent.id)) {
      await this.updateEvent(parentEvent.id, {
        childEventIds: [...childIds, finalEvent.id]
      }, true); // skipSync=true 避免递归同步
    }
  }
}
```

**更新父事件时维护**:
```typescript
// EventService.updateEvent() 自动处理父事件变更
if (updates.parentEventId !== undefined) {
  // 1. 从旧父事件的 childEventIds 移除
  if (oldParentId && oldParentId !== updates.parentEventId) {
    await this.updateEvent(oldParentId, {
      childEventIds: oldParent.childEventIds.filter(id => id !== eventId)
    });
  }
  
  // 2. 添加到新父事件的 childEventIds
  if (updates.parentEventId) {
    await this.updateEvent(newParentId, {
      childEventIds: [...newParent.childEventIds, eventId]
    });
  }
}
```

**删除事件时清理**:
```typescript
// EventService.deleteEvent() 自动清理父子关系
if (event.parentEventId) {
  const parent = await this.getEventById(event.parentEventId);
  if (parent?.childEventIds) {
    await this.updateEvent(parent.id, {
      childEventIds: parent.childEventIds.filter(id => id !== eventId)
    });
  }
}
```

#### 4.3.2 EventTree 数据结构

```typescript
interface Event {
  id: string;                    // 事件唯一 ID (UUID)
  parentEventId?: string;        // 父事件 ID
  childEventIds?: string[];      // 子事件 ID 数组
  // ... 其他字段
}
```

**树形结构示例**:
```
Parent Event (evt_xxx_parent)
  ├─ childEventIds: ['evt_xxx_child1', 'evt_xxx_child2']
  │
  ├─ Child Event 1 (evt_xxx_child1)
  │   └─ parentEventId: 'evt_xxx_parent'
  │
  └─ Child Event 2 (evt_xxx_child2)
      └─ parentEventId: 'evt_xxx_parent'
```

#### 4.3.3 应用场景

**Timer 父子事件管理**:
- globalTimer 包含 `parentEventId` 字段
- Timer 停止时自动关联到父事件
- 二次计时自动升级为父子结构

**PlanManager 事件层级**:
- Tab 键创建子事件，自动设置 `parentEventId`
- Shift+Tab 调整层级，自动更新 EventTree
- 详见: `docs/PRD/PLANMANAGER_MODULE_PRD.md`

**架构优势**:
- ✅ **自动化**: 无需手动维护双向关联
- ✅ **一致性**: EventService 统一管理，避免数据不一致
- ✅ **可追溯**: 完整的父子关系链路，便于调试和查询

---

### 4.4 服务通信机制

#### 4.4.1 TagService ↔ App

```
TagService.updateTags()
  ↓
notifyListeners()
  ↓
App: handleTagsUpdate()
  ↓
setTagsVersion(v => v + 1)
  ↓
hierarchicalTags useMemo 重新执行
  ↓
EventEditModal 收到新 prop
```

#### 4.4.2 FigmaTagManager ↔ App ↔ TagService

```
FigmaTagManager 用户修改标签
  ↓
onTagsChange(newTags)
  ↓
App: handleTagsChange()
  ↓
TagService.updateTags(hierarchicalTags)
  ↓
setTagsVersion(v => v + 1)
  ↓
hierarchicalTags 更新
```

#### 4.4.3 EventHub ↔ 各组件 (v1.7.1 架构)

```
PlanManager 事件操作
  ↓
EventHub.createEvent() / updateEvent() / deleteEvent()
  ↓
EventService 更新 + localStorage 持久化
  ↓
EventHub.emit('eventsUpdated')
  ↓
各组件自行监听:
  - DailyStatsCard: 监听 'eventsUpdated'，更新统计
  - PlanManager: 监听 EventHub，刷新显示
  - TimeCalendar: 监听 EventHub，刷新日历
  ↓
❌ App 组件不再维护 allEvents state
✅ 避免不必要的全局重渲染
```

**架构优化**:
- ✅ 各组件自行订阅需要的事件
- ✅ App 不再作为数据中转站
- ✅ 符合「增量更新架构」设计原则

---

## 5. 性能问题诊断与修复

### 5.1 问题：删除事件后 EventEditModal 无限重渲染

#### 5.1.1 问题现象

- 删除 TimeCalendar 事件后，打开 Timer 的 EditModal
- TagPicker 无法点击，持续重渲染（48+ 次/秒）
- 下拉框延迟 2 分钟才能打开

#### 5.1.2 根本原因

```
删除事件
  ↓
PlanManager: onEventDeleted()
  ↓
setAllEvents(EventService.getAllEvents())  // 触发 App 重渲染
  ↓
App 重渲染
  ↓
hierarchicalTags = useMemo(() => TagService.getTags(), [appTags])
  ↓
❌ TagService.getTags() 返回新数组 [...this.tags]
  ↓
EventEditModal 收到新 hierarchicalTags prop
  ↓
flatTags useMemo 重新计算
  ↓
filteredTags useMemo 重新计算
  ↓
无限循环...
```

#### 5.1.3 修复方案（已实施）

**修复 1: TagService.getTags() 返回稳定引用**
```typescript
// Before (❌):
getTags(): HierarchicalTag[] {
  return [...this.tags];  // 每次创建新数组
}

// After (✅):
getTags(): HierarchicalTag[] {
  return this.tags;  // 直接返回内部引用
}
```

**修复 2: 移除冗余的 appTags state**
```typescript
// Before (❌):
const [appTags, setAppTags] = useState<any[]>([]);
const hierarchicalTags = useMemo(() => {
  return TagService.getTags();
}, [appTags]);

// After (✅):
const [tagsVersion, setTagsVersion] = useState(0);
const hierarchicalTags = useMemo(() => {
  return TagService.getTags();
}, [tagsVersion]);
```

**修复 3: 缓存 availableCalendars**
```typescript
// Before (❌):
<EventEditModal
  availableCalendars={getAvailableCalendarsForSettings()}  // 每次新数组
/>

// After (✅):
const availableCalendars = useMemo(() => {
  return getAvailableCalendarsForSettings();
}, []);

<EventEditModal
  availableCalendars={availableCalendars}  // 稳定引用
/>
```

#### 5.1.4 修复效果

- ✅ EventEditModal 不再无限重渲染
- ✅ TagPicker 响应正常
- ✅ App 重渲染频率降低

---

## 6. 数据流图

### 6.1 标签数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      TagService                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ private tags: HierarchicalTag[]                      │   │
│  │ private flatTags: FlatTag[]                          │   │
│  │ private listeners: Function[]                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↕                                    │
│         localStorage['remarkable-hierarchical-tags']        │
└─────────────────────────────────────────────────────────────┘
                          ↓
                    getTags() ← 返回稳定引用 this.tags
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                         App.tsx                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ tagsVersion: number (state)                          │   │
│  │    ↓                                                 │   │
│  │ hierarchicalTags = useMemo(() => {                   │   │
│  │   return TagService.getTags();                       │   │
│  │ }, [tagsVersion]);                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↓ (prop)
┌─────────────────────────────────────────────────────────────┐
│                    EventEditModal                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ hierarchicalTags (prop)                              │   │
│  │    ↓                                                 │   │
│  │ flatTags = useMemo(() => {                           │   │
│  │   return flatten(hierarchicalTags);                  │   │
│  │ }, [hierarchicalTags, isOpen]);                      │   │
│  │    ↓                                                 │   │
│  │ filteredTags = useMemo(() => {                       │   │
│  │   return flatTags.filter(...);                       │   │
│  │ }, [flatTags, tagSearchQuery]);                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓                                    │
│                  TagPicker 下拉菜单                          │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 事件数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      EventService                           │
│         localStorage['remarkable-events']                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
              getAllEvents() / createEvent() / updateEvent()
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                      PlanManager                            │
│  onEventCreated / onEventUpdated / onEventDeleted           │
└─────────────────────────────────────────────────────────────┘
                          ↓ (callback)
┌─────────────────────────────────────────────────────────────┐
│                         App.tsx                             │
│  setAllEvents(EventService.getAllEvents())                  │
│        ↓                                                     │
│  allEvents: Event[] (state) ← 触发 App 重渲染               │
└─────────────────────────────────────────────────────────────┘
                          ↓ (prop)
┌─────────────────────────────────────────────────────────────┐
│                    DailyStatsCard                           │
│  计算今日统计数据                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 已知限制与待优化项

### 7.1 性能瓶颈

| 问题 | 影响 | 优先级 | 状态 |
|------|------|--------|------|
| ~~计时器每秒触发 App 重渲染~~ | ~~高~~ | ~~P1~~ | **✅ 已修复 v1.7.1** |
| ~~allEvents 触发全局重渲染~~ | ~~中~~ | ~~P2~~ | **✅ 已修复 v1.7.1** - 移除全局 state |
| storage 事件监听无效 | 低 | P3 | 改用 EventHub 自定义事件通信 |
| editingEvent* states 可合并 | 低 | P3 | 使用 useReducer 优化 |

### 7.2 代码可维护性

| 问题 | 影响 | 优先级 | 状态 |
|------|------|--------|------|
| ~~21个 states 在一个组件~~ | ~~中~~ | ~~P2~~ | **✅ 已优化至17个** (v1.7.1) |
| 过多的 useEffect 依赖 | 中 | P2 | 使用 useReducer 合并编辑状态 |
| 服务调用分散 | 低 | P3 | 已统一通过 EventHub/TimeHub |

---

## 8. 最佳实践

### 8.1 添加新功能时的注意事项

1. **避免在 App 层添加新 state**
   - 优先考虑 Context 或组件内部状态
   - 只有真正全局共享的数据才放在 App

2. **使用 useMemo 缓存计算值**
   - 确保依赖数组正确
   - 避免在依赖项中使用不稳定引用

3. **服务层返回稳定引用**
   - getTags() / getFlatTags() 直接返回内部数组
   - 调用方不应修改返回值

### 8.2 性能优化指南

1. **识别高频更新的 state**
   - 使用 React DevTools Profiler
   - 添加渲染日志（开发环境）

2. **隔离频繁变化的数据**
   - 使用 Context 分离关注点
   - React.memo 包装子组件

3. **使用版本号触发更新**
   - 避免传递大对象/数组作为依赖
   - 用简单类型（number/string）触发重新计算

---

## 9. 版本历史

### v1.8 (2025-12-15)

**架构清理 - EventIdPool 移除**:
- ✅ 完全移除 EventIdPool 系统（v2.17 已迁移至 UUID）
  - 删除 `src/services/EventIdPool.ts` 文件
  - 修复 PlanSlate.tsx 中的遗留代码
  - 清理所有文档中的 EventIdPool 引用
  - UUID 创建机制：`generateEventId()` 生成 `evt_<timestamp>_<random>` 格式
  - 父子事件 EventTree 自动维护：创建/更新/删除时自动同步 `parentEventId` 和 `childEventIds`
  
**文档更新**:
- ✅ 修正 State 数量统计（18个 → 17个）
- ✅ 补充缺失的 states 说明（microsoftService, timerEditModal 等）
- ✅ 更新服务初始化顺序图
- ✅ 反映 v1.7.1 的 allEvents 移除架构
- ✅ 修正字段名：editingEventTagId → editingEventTagIds（多标签支持）

### v1.7.2 (2025-11-10)

**性能优化 - TagService 核心逻辑修复**:
- ✅ 修复 `getFlatTags()` 同步加载逻辑
  - 移除 `this.flatTags.length === 0` 检查
  - 只在 `!this.initialized` 时加载并标记完成
  - 避免重复调用 flattenTags()
  
- ✅ 修复 `flattenTags()` 数据结构混乱
  - 移除 `tag.parentId || parentId` 逻辑
  - 统一使用递归参数 `parentId`
  - 避免层级结构和扁平结构混淆
  
- ✅ 移除不必要的 level 重算逻辑
  - 删除 O(n²) 的 needsLevelRecalc 检查
  - level 字段由递归参数直接确定
  
- ✅ 添加性能监控系统
  - getFlatTags() 调用频率监控
  - flattenTags() 执行时间测量
  - EventEditModal 重渲染检测
  - hierarchicalTags 引用变化追踪

**性能改善**:
- 📈 flattenTags() 执行时间提升 73%（0.3ms → 0.08ms）
- 📉 不再出现 "检测到需要重算 level" 警告
- 🚀 首次打开 TagPicker 不再为空

**诊断工具**:
- 📝 创建 `PERFORMANCE_DIAGNOSIS_v1.7.2.md` 完整诊断指南

### v1.7.1 (2025-11-10)

**性能优化 - 移除旧计时器系统和死代码**:
- ✅ 移除旧计时器系统（6个状态: seconds, isActive, taskName, currentTask, timerSessions, intervalRef）
- ✅ 删除未使用函数（6个: startTimer, pauseTimer, handleStartTimer, stopTimer, formatTime, getTodayTotalTime）
- ✅ 删除未使用导入（TaskManager）
- ✅ TimeCalendar 移除 `onStartTimer` prop
- 🧹 清理约 40 行死代码

**统计数据**:
- 📉 状态数量：21个 → **18个**（-14%）
- 📉 计时器状态：7个 → **1个**（-86%）
- 🎯 性能改善：Timer 运行时 App 组件 0 次/秒重渲染

**架构优化**:
- Timer 完全由 `globalTimer` 对象管理
- TimerCard 组件自行管理 UI 时间显示更新

### v1.7.0 (2025-01-xx)

**性能优化 - TagService 引用稳定性**:
- ✅ 修复 TagService.getTags() 返回稳定引用
- ✅ 移除冗余 appTags state，改用 tagsVersion
- ✅ 缓存 availableCalendars 避免重复创建
- ✅ 解决删除事件后 EventEditModal 无限重渲染问题

**文档**:
- ✅ 创建 APP_ARCHITECTURE_PRD.md
- ✅ 记录完整状态清单和渲染机制
- ✅ 添加数据流图和性能优化指南

---

## 10. 数据类型规范

### 10.1 时间字段规范 (v1.8 - 2025-11-25)

**规则**: 所有时间字段使用 `string | null`，禁止使用 `undefined`

**理由**:
1. **JSON 序列化问题**: `JSON.stringify()` 会忽略 `undefined`，导致字段无法清除
2. **语义明确**: `null` = "明确没有值"，`undefined` = "未定义"
3. **数据一致性**: 避免 localStorage 中出现无法清除的遗留字段
4. **后端兼容**: 与 SQL NULL、GraphQL null 语义一致

**类型定义**:
```typescript
// ✅ 正确
interface Event {
  startTime?: string | null;   // 明确支持 null
  endTime?: string | null;     // 明确支持 null
  isAllDay?: boolean;          // boolean 可以保持 undefined（三态逻辑）
}

// ❌ 错误
interface Event {
  startTime?: string;  // 隐式 undefined，JSON 序列化会丢失
  endTime?: string;    // 隐式 undefined，JSON 序列化会丢失
}
```

**代码示例**:
```typescript
// ✅ 正确：清除时间字段
await TimeHub.setEventTime(eventId, {
  start: '2025-11-25 10:00:00',
  end: null  // ✅ 使用 null
});

// ❌ 错误：使用 undefined
await TimeHub.setEventTime(eventId, {
  start: '2025-11-25 10:00:00',
  end: undefined  // ❌ JSON 序列化后丢失
});
```

**相关文档**: 
- [Time Picker PRD - 时间字段规范](../PRD/TIME_PICKER_AND_DISPLAY_PRD.md#undefined-vs-null)
- [TimeHub Architecture - SetEventTimeInput](./EVENTHUB_TIMEHUB_ARCHITECTURE.md#332-seteventtime)
- [修复方案文档](../fixes/UNDEFINED_VS_NULL_TIME_FIELDS_FIX.md)

---

## 11. 参考文档

- [SYNC_MECHANISM_PRD.md](./SYNC_MECHANISM_PRD.md) - 同步机制文档
- [TagService 源码](../../src/services/TagService.ts)
- [EventService 源码](../../src/services/EventService.ts)
- [App.tsx 源码](../../src/App.tsx)
- [DIAGNOSIS.md](../../DIAGNOSIS.md) - 性能问题诊断报告
