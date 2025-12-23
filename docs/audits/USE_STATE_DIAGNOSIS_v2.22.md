# useState 使用诊断报告 v2.22

**生成日期**: 2025-12-23  
**诊断范围**: 8个核心组件，共86+个useState  
**架构标准**: A/B/C/D/E 五类分类法  
**文档目的**: 识别不符合架构设计的useState使用，提供重构建议

---

## 文档索引

1. [诊断标准与分类法](#1-诊断标准与分类法)
2. [组件诊断详情](#2-组件诊断详情)
3. [严重问题汇总](#3-严重问题汇总)
4. [优化建议清单](#4-优化建议清单)
5. [架构亮点总结](#5-架构亮点总结)
6. [重构优先级](#6-重构优先级)

---

## 1. 诊断标准与分类法

### 1.1 五类标准

| 类别 | 定义 | 生命周期/特征 | 推荐容器 | 决策口诀 |
|---|---|---|---|---|
| **(A) UI 临时态** | 纯界面开关/hover/弹窗 | 丢了不影响数据正确性 | `useState` | 不需要事务一致性，不跨模块共享 |
| **(B) 编辑器会话态** | selection/focus/IME/键盘命令 | 高频、需要原子更新，常常"成组变化" | `useReducer` + `useRef` | 一次键盘动作会更新 2+ state |
| **(C) 领域数据（真相）** | events/items/树结构 | 必须一致，可批处理/可回放 | 自建 store 或 service（EventService） | single source of truth，避免多源 |
| **(D) 派生/缓存** | map/filter/view arrays | 可从 (C) 推导 | `useMemo`/selector（必要时缓存） | 不应作为独立 state |
| **(E) 持久化/同步管线态** | pending patches、debounce、inflight、local-update guard | 与 DB/同步时序强相关 | 自建 pipeline（store/service），多用 `useRef` | 避免闭包陈旧与环回 |

### 1.2 判断依据

**应该用 `useReducer` 的信号：**
- ✅ 一次用户动作要同时改 2+ 个状态
- ✅ 状态之间存在模式耦合（focus 变化常伴随 mode/isTask/tags 变化）
- ✅ 需要原子更新与可预测状态机

**应该是派生的信号：**
- ✅ 可以由别的状态推导
- ✅ 修改时总是先更新源状态，再同步派生状态
- ✅ 存在"旧值覆盖新值"的风险

**应该移到服务层/Store的信号：**
- ✅ 影响保存/同步/一致性
- ✅ 需要持久化到 localStorage/IndexedDB
- ✅ 需要跨组件/跨页面共享

---

## 2. 组件诊断详情

### 2.1 TimeLog.tsx (33个useState)

#### ✅ 符合架构设计 (23个)

**A类 - UI临时态 (16个):**
```typescript
// 筛选与搜索
const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
const [hiddenTags, setHiddenTags] = useState<Set<string>>(new Set());
const [searchQuery, setSearchQuery] = useState('');
const [activeFilter, setActiveFilter] = useState<'tags' | 'tasks' | 'favorites' | 'new'>('tags');

// 折叠展开状态
const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

// Hover状态
const [hoveredTimeId, setHoveredTimeId] = useState<string | null>(null);
const [hoveredTitleId, setHoveredTitleId] = useState<string | null>(null);
const [hoveredRightId, setHoveredRightId] = useState<string | null>(null);
const [hoveredRightMenuId, setHoveredRightMenuId] = useState<string | null>(null);

// 弹窗开关
const [showCalendarPicker, setShowCalendarPicker] = useState<string | null>(null);
const [showSyncModePicker, setShowSyncModePicker] = useState<string | null>(null);
const [showTabManager, setShowTabManager] = useState(false);
const [createModalOpen, setCreateModalOpen] = useState(false);
const [editModalOpen, setEditModalOpen] = useState(false);
```

**B类 - 编辑器会话态 (8个):**
```typescript
// 编辑会话
const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
const [editingTitle, setEditingTitle] = useState('');
const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
const [editingAttendeesId, setEditingAttendeesId] = useState<string | null>(null);
const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
const [editingEvent, setEditingEvent] = useState<Event | null>(null);
const [newEventTemplate, setNewEventTemplate] = useState<Event | null>(null);
```

**D类 - 派生/缓存 (1个):**
```typescript
const [availableCalendars, setAvailableCalendars] = useState<Array<{...}>>([]);
// ✅ 从设置中加载，可重新计算
```

**E类 - 持久化/同步管线态 (5个):**
```typescript
// 无限滚动数据窗口
const [dynamicStartDate, setDynamicStartDate] = useState<Date | null>(null);
const [dynamicEndDate, setDynamicEndDate] = useState<Date | null>(null);
const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
const [isLoadingLater, setIsLoadingLater] = useState(false);
const [loadingEvents, setLoadingEvents] = useState(true);
```

#### ❌ 不符合架构设计 (10个)

**问题1: 领域数据直接在组件State (C类误用)**
```typescript
// ❌ 应通过 EventHub 管理，不应直接在组件中异步加载
const [allEvents, setAllEvents] = useState<Event[]>([]);

// 当前实现：
useEffect(() => {
  const events = await EventService.getTimelineEvents(start, end);
  setAllEvents(events); // ❌ 绕过 EventHub
}, [dateRange]);

// ✅ 应改为：
const allEvents = useEventHubSubscription({ 
  filter: (event) => isInTimelineRange(event, dateRange),
  source: 'TimeLog'
});
```

**问题2: 持久化数据混入组件State (C类误用)**
```typescript
// ❌ 已持久化到 localStorage，但仍用 useState 管理
const [tabManagerEvents, setTabManagerEvents] = useState<Event[]>([]);
const [activeTabId, setActiveTabId] = useState<string>('timelog');

// 当前实现：
useEffect(() => {
  const saved = localStorage.getItem('timelog-tabs');
  if (saved) setTabManagerEvents(JSON.parse(saved));
}, []);

// ✅ 应改为：全局 PersistentStore
const { tabs, activeTab } = usePersistentStore('timelog-tabs');
```

**问题3: 派生状态冗余 (D类误用)**
```typescript
// ❌ activeTabId 可以从 tabManagerEvents 派生
const [activeTabId, setActiveTabId] = useState<string>('timelog');

// ✅ 应改为：
const activeTabId = useMemo(() => {
  // 从持久化Store或URL参数中获取
  return tabManagerEvents[0]?.id || 'timelog';
}, [tabManagerEvents]);
```

**问题4: 版本号滥用 (D类误用)**
```typescript
// ❌ 用版本号触发重新计算，本质是缓存失效标记
const [tagServiceVersion, setTagServiceVersion] = useState(0);

// ✅ 应改为：订阅模式
useEffect(() => {
  const unsubscribe = TagService.addListener(() => {
    // 自动触发重新渲染
  });
  return unsubscribe;
}, []);
```

---

### 2.2 PlanManager.tsx (14个useState + 9个已迁移到Hook)

#### ✅ 良好实践：使用 Hook 集中管理会话态

```typescript
// 🆕 v2.21.0: 统一的会话态管理（替代9个useState）
const { state: session, actions: sessionActions } = usePlanManagerSession();

// session.focus 替代的状态 (B类 - 编辑器会话态):
// - currentFocusedLineId
// - focusedLineMode
// - isTaskMode
// - currentSelectedTags

// session.filter 替代的状态 (A/D类):
// - dateRange (A) UI临时态
// - snapshotVersion (D) 派生/缓存

// session.visibility 替代的状态 (A类 - UI临时态):
// - showSnapshot
// - showExpiredPlans
// - showCompletedTasks
```

#### ✅ 符合架构设计 (10个)

**A类 - UI临时态 (7个):**
```typescript
const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
const [showDateMention, setShowDateMention] = useState(false);
const [showUnifiedPicker, setShowUnifiedPicker] = useState(false);
const [showTagReplace, setShowTagReplace] = useState(false);
const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
const [isSubPickerOpen, setIsSubPickerOpen] = useState<boolean>(false);
```

**B类 - 编辑器会话态 (1个):**
```typescript
const [replacingTagElement, setReplacingTagElement] = useState<HTMLElement | null>(null);
```

**D类 - 派生/缓存 (2个):**
```typescript
// ✅ 订阅模式，从 TagService 获取
const [tagServiceVersion, setTagServiceVersion] = useState(0);
// ✅ 正确使用订阅
useEffect(() => {
  const unsubscribe = TagService.addListener(() => {
    setTagServiceVersion(v => v + 1);
  });
  return unsubscribe;
}, []);
```

#### ❌ 不符合架构设计 (4个)

**问题1: 领域数据直接加载 (C类误用)**
```typescript
// ❌ 初始加载未通过 EventHub
const [items, setItems] = useState<Event[]>([]);

useEffect(() => {
  const loadItems = async () => {
    const events = await EventService.getPlanEvents(); // ❌ 直接调用
    setItems(events);
  };
  loadItems();
}, []);

// ✅ 应改为：
const items = useEventHubSubscription({
  filter: EventService.isPlanEvent,
  source: 'PlanManager'
});
```

**问题2: Transient Buffer 缺失 (C类误用)**
```typescript
// ❌ 临时创建的空事件，应纳入 EventHub 的 transient write buffer
const [pendingEmptyItems, setPendingEmptyItems] = useState<Map<string, Event>>(new Map());

// ✅ 应改为：
const transientBuffer = useEventHubTransient('PlanManager');
transientBuffer.add(newEmptyEvent); // 统一管理临时事件
```

**问题3: 派生状态冗余 (D类误用)**
```typescript
// ❌ 完全可以从 items 派生，不需要独立 state
const [allEvents, setAllEvents] = useState<any[]>([]);

// 当前实现：
useEffect(() => {
  EventService.getAllEvents().then(setAllEvents); // ❌ 重复加载
}, []);

// ✅ 应改为：
const allEvents = useEventHubCache(); // 从 EventHub 缓存获取
```

**问题4: 异步加载冗余 (D类误用)**
```typescript
// ❌ editorItems 是 items 的过滤+排序结果，应该是派生
const [editorItems, setEditorItems] = useState<Event[]>([]);

// 当前实现：
useEffect(() => {
  const filtered = items.filter(...).sort(...);
  setEditorItems(filtered); // ❌ 异步派生导致延迟
}, [items]);

// ✅ 应改为：
const editorItems = useMemo(() => {
  return items.filter(...).sort(...); // ✅ 同步派生
}, [items]);
```

---

### 2.3 PlanSlate.tsx (2个useState)

#### ❌ 严重问题：与 Slate 内部状态重复

**问题1: value 状态重复 (B类严重误用)**
```typescript
// ❌ Slate 内部已有 editor.children，再用 useState 维护导致双重状态
const [value, setValue] = useState<EventLineNode[]>(() => {
  console.log('[🎯 useState 初始化] 使用 enhancedValue', enhancedValue);
  return enhancedValue;
});

// 当前实现：
<Slate 
  editor={editor} 
  value={value} // ❌ 外部 state
  onChange={(newValue) => {
    setValue(newValue); // ❌ 同步到外部 state
    // ... 还会触发 editor 内部更新，双重状态不一致
  }}
/>

// ✅ 应改为：
// 移除 value state，直接使用 editor.children
<Slate 
  editor={editor} 
  initialValue={enhancedValue} // ✅ 只在初始化时使用
  onChange={(newValue) => {
    // ✅ 直接从 editor.children 读取，不需要外部 state
    onSlateChange?.(editor.children); 
  }}
/>
```

**为什么这是严重问题：**
1. **双重状态源**：Slate 内部维护 `editor.children`，外部又维护 `value`
2. **同步延迟**：`setValue` 异步，可能导致 `value` 与 `editor.children` 不一致
3. **Selection 丢失**：重新 mount 编辑器会丢失 Selection 和 Focus
4. **性能问题**：每次输入都触发双重渲染

**问题2: editorKey 反模式 (D类误用)**
```typescript
// ❌ 强制重新挂载编辑器会丢失 Selection 和 Focus
const [editorKey, setEditorKey] = useState(0);

// 当前实现：
<Slate key={editorKey} ... />
setEditorKey(k => k + 1); // ❌ 销毁旧编辑器，创建新编辑器

// ✅ 应改为：使用 Transforms API 原子更新
Transforms.removeNodes(editor, { at: [0] });
Transforms.insertNodes(editor, newNodes, { at: [0] });
```

---

### 2.4 LogSlate.tsx (3个useState)

#### ✅ 完全符合架构设计

```typescript
// A类 - UI临时态
const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);

// B类 - 编辑器会话态
const [mentionSearch, setMentionSearch] = useState<string | null>(null);
const [hashtagSearch, setHashtagSearch] = useState<string | null>(null);
```

**架构亮点：**
1. ✅ 没有冗余状态，Slate 内部状态由 `initialValue` 初始化
2. ✅ 使用 `useRef` 缓存防抖保存，避免频繁触发 `onChange`
3. ✅ `mentionSearch` 和 `hashtagSearch` 高频临时状态，适合 `useState`

---

### 2.5 ModalSlate.tsx (3个useState)

#### ✅ 符合架构设计 (2个)

```typescript
// E类 - 持久化/同步管线态
const [pendingTimestamp, setPendingTimestamp] = useState<boolean>(false);
// ✅ 异步插入 timestamp 的 pending 状态

// B类 - 编辑器会话态 (复合状态)
const [mentionMenu, setMentionMenu] = useState<{
  visible: boolean;
  query: string;
  position: { top: number; left: number } | null;
  atSignRange: Range | null;
}>({ visible: false, query: '', position: null, atSignRange: null });
// ✅ 打包4个相关字段，避免碎片化
```

#### ⚠️ 可优化 (1个)

```typescript
// ⚠️ 可以从 editor.selection 派生
const [isFocused, setIsFocused] = useState(false);

// ✅ 应改为：
const isFocused = useMemo(() => {
  return !!editor.selection; // 有 selection 即为 focused
}, [editor.selection]);
```

---

### 2.6 EventEditModalV2.tsx (~20个useState)

#### ✅ 符合架构设计 (15个)

**A类 - UI临时态 (~15个弹窗开关):**
```typescript
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
const [showTagPicker, setShowTagPicker] = useState(false);
const [showTimePicker, setShowTimePicker] = useState(false);
const [isEditingLocation, setIsEditingLocation] = useState(false);
const [showEventTree, setShowEventTree] = useState(false);
const [showSourceCalendarPicker, setShowSourceCalendarPicker] = useState(false);
const [showSyncCalendarPicker, setShowSyncCalendarPicker] = useState(false);
const [showSourceSyncModePicker, setShowSourceSyncModePicker] = useState(false);
const [showSyncSyncModePicker, setShowSyncSyncModePicker] = useState(false);
// ... 等等
```

**B类 - 编辑器会话态 (1个):**
```typescript
const [formData, setFormData] = useState<MockEvent>(() => { ... });
// ✅ 编辑缓冲区，未保存的修改
```

**D类 - 派生/缓存 (2个):**
```typescript
const [availableTags, setAvailableTags] = useState(() => TagService.getTags());
// ✅ 从 TagService 订阅

const [currentTime, setCurrentTime] = useState<number>(Date.now());
// ✅ 定时器更新，用于显示相对时间
```

**E类 - 持久化/同步管线态 (1个):**
```typescript
const [isExtracting, setIsExtracting] = useState(false);
// ✅ AI提取进行中标志
```

#### ❌ 不符合架构设计 (3个)

**问题1: 领域数据直接加载 (C类误用)**
```typescript
// ❌ 从 EventService 直接异步加载，未经 EventHub
const [event, setEvent] = React.useState<Event | null>(null);
const [allEvents, setAllEvents] = useState<any[]>([]);

// ✅ 应改为：
const event = useEventHubGet(eventId);
const allEvents = useEventHubCache();
```

**问题2: useState 过多，建议 Hook 化**
```typescript
// ⚠️ 20+个 UI 开关状态可考虑合并
// ✅ 建议改为：
const { ui, toggleUI } = useModalUI();
// ui.showEmojiPicker, ui.showTagPicker, ...
// toggleUI('emojiPicker'), toggleUI('tagPicker'), ...
```

---

### 2.7 LogTab.tsx

与 `EventEditModalV2.tsx` 结构几乎完全相同，问题和建议也相同。

---

### 2.8 TimeCalendar.tsx (11个useState)

#### ✅ 符合架构设计 (6个)

**A类 - UI临时态 (3个):**
```typescript
const [showEventEditModal, setShowEventEditModal] = useState(false);
const [showSettings, setShowSettings] = useState(false);
const [isInitialLoad, setIsInitialLoad] = useState(true);
```

**B类 - 编辑器会话态 (1个):**
```typescript
const [editingEvent, setEditingEvent] = useState<Event | null>(null);
```

**D类 - 派生/缓存 (2个):**
```typescript
const [hierarchicalTags, setHierarchicalTags] = useState<any[]>([]);
const [availableCalendars, setAvailableCalendars] = useState<any[]>([]);
```

**E类 - 持久化/同步管线态 (3个):**
```typescript
const [newlyCreatedEventId, setNewlyCreatedEventId] = useState<string | null>(null);
// ✅ 用于取消时删除

const [localStorageTimerTrigger, setLocalStorageTimerTrigger] = useState(0);
// ⚠️ 轮询检测 localStorage 变化，应改用 BroadcastChannel

const [isCalendarReady, setIsCalendarReady] = useState(false);
// ✅ TUI Calendar 初始化完成标志
```

#### ❌ 不符合架构设计 (5个)

**问题1: 领域数据直接加载 (C类误用)**
```typescript
// ❌ 直接从 EventService 加载，未通过 EventHub
const [events, setEvents] = useState<Event[]>([]);

// ✅ 应改为：
const events = useEventHubSubscription({
  filter: (event) => isInDateRange(event, currentDate, currentView),
  source: 'TimeCalendar'
});
```

**问题2: 持久化数据混入组件State (C类误用)**
```typescript
// ❌ 已持久化到 localStorage，但仍用 useState 管理
const [currentDate, setCurrentDate] = useState<Date>(() => {
  const saved = localStorage.getItem('calendar-current-date');
  return saved ? new Date(saved) : new Date();
});

const [currentView, setCurrentView] = useState<'month' | 'week' | 'day'>(() => {
  const saved = localStorage.getItem('calendar-current-view');
  return (saved as any) || 'month';
});

const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(() => {
  const saved = localStorage.getItem('calendar-settings');
  return saved ? JSON.parse(saved) : defaultSettings;
});

// ✅ 应改为：全局 PersistentStore
const { currentDate, currentView, settings } = usePersistentStore('calendar');
```

**问题3: 轮询代替事件 (E类误用)**
```typescript
// ❌ 轮询检测 localStorage 变化
const [localStorageTimerTrigger, setLocalStorageTimerTrigger] = useState(0);

useEffect(() => {
  const timer = setInterval(() => {
    setLocalStorageTimerTrigger(t => t + 1); // ❌ 低效
  }, 1000);
  return () => clearInterval(timer);
}, []);

// ✅ 应改为：BroadcastChannel
const channel = new BroadcastChannel('calendar-sync');
channel.onmessage = (event) => {
  if (event.data.type === 'settings-changed') {
    // 响应变化
  }
};
```

---

## 3. 严重问题汇总

### 🔴 P0 - 数据源混乱（违反单一数据源原则）

**影响组件**: TimeLog, PlanManager, EventEditModalV2, TimeCalendar  
**严重程度**: 🔴 Critical  
**问题描述**:

组件直接从 `EventService` 异步加载数据，绕过 `EventHub`，导致：
1. **多源真相**：组件State vs EventHub缓存，不一致风险
2. **重复加载**：不同组件重复请求相同数据
3. **同步延迟**：EventHub更新后，组件State不自动同步
4. **竞态条件**：异步加载期间用户操作可能导致数据覆盖

**错误模式**:
```typescript
// ❌ 错误实现
const [allEvents, setAllEvents] = useState<Event[]>([]);

useEffect(() => {
  const loadEvents = async () => {
    const events = await EventService.getTimelineEvents(start, end);
    setAllEvents(events); // ❌ 绕过 EventHub
  };
  loadEvents();
}, [start, end]);
```

**正确实现**:
```typescript
// ✅ 正确实现
const allEvents = useEventHubSubscription({
  filter: (event) => isInTimelineRange(event, start, end),
  source: 'TimeLog'
});

// EventHub 作为唯一数据源：
// - 统一加载和缓存
// - 自动同步更新
// - 避免重复请求
```

**修复优先级**: 🔴 P0 - 立即修复  
**预计工作量**: 2-3天  
**影响范围**: 4个核心组件

---

### 🔴 P0 - Slate编辑器状态重复（PlanSlate.value）

**影响组件**: PlanSlate  
**严重程度**: 🔴 Critical  
**问题描述**:

Slate 内部已维护 `editor.children`，外部又用 `useState` 维护 `value`，导致双重状态：

**错误模式**:
```typescript
// ❌ 错误实现
const [value, setValue] = useState<EventLineNode[]>(enhancedValue);

<Slate 
  editor={editor} 
  value={value} // ❌ 外部 state
  onChange={(newValue) => {
    setValue(newValue); // ❌ 同步延迟，可能不一致
    onSlateChange?.(newValue);
  }}
/>
```

**问题根源**:
1. **双重状态源**: `editor.children` vs `value` state
2. **同步延迟**: `setValue` 异步，导致短暂不一致
3. **Selection丢失**: 重新mount编辑器会丢失Selection和Focus
4. **性能问题**: 每次输入触发双重渲染

**正确实现**:
```typescript
// ✅ 正确实现
<Slate 
  editor={editor} 
  initialValue={enhancedValue} // ✅ 只在初始化时使用
  onChange={() => {
    // ✅ 直接从 editor.children 读取，不需要外部 state
    onSlateChange?.(editor.children);
  }}
/>

// 更新内容时，使用 Transforms API：
Transforms.removeNodes(editor, { at: [0] });
Transforms.insertNodes(editor, newNodes, { at: [0] });
```

**修复优先级**: 🔴 P0 - 立即修复  
**预计工作量**: 1天  
**影响范围**: PlanSlate组件

---

### 🟠 P1 - 持久化数据混入组件State

**影响组件**: TimeLog, TimeCalendar  
**严重程度**: 🟠 High  
**问题描述**:

持久化到 `localStorage` 的数据仍用 `useState` 管理，导致：
1. **数据孤岛**：每个组件独立持久化，缺乏统一管理
2. **同步困难**：多窗口/多实例间同步需要轮询或BroadcastChannel
3. **初始化开销**：每次mount都从localStorage读取
4. **类型安全缺失**：JSON序列化丢失类型信息

**错误模式**:
```typescript
// ❌ 错误实现
const [tabManagerEvents, setTabManagerEvents] = useState<Event[]>([]);

useEffect(() => {
  const saved = localStorage.getItem('timelog-tabs');
  if (saved) setTabManagerEvents(JSON.parse(saved));
}, []);

useEffect(() => {
  localStorage.setItem('timelog-tabs', JSON.stringify(tabManagerEvents));
}, [tabManagerEvents]);
```

**正确实现**:
```typescript
// ✅ 正确实现
const { tabs, setTabs } = usePersistentStore('timelog-tabs', {
  defaultValue: [],
  sync: true, // 自动跨窗口同步
  validator: (value) => Array.isArray(value) && value.every(isEvent)
});
```

**修复优先级**: 🟠 P1 - 高优先级  
**预计工作量**: 2天  
**影响范围**: TimeLog, TimeCalendar

---

## 4. 优化建议清单

### 4.1 派生状态冗余 (D类误用)

**影响组件**: TimeLog, PlanManager, EventEditModalV2  
**严重程度**: 🟡 Medium  

**问题列表**:

| 组件 | 冗余State | 源State | 优化方案 |
|-----|----------|---------|---------|
| TimeLog | `activeTabId` | `tabManagerEvents` | `useMemo(() => tabs[0]?.id \|\| 'timelog')` |
| PlanManager | `allEvents` | EventHub缓存 | `useEventHubCache()` |
| PlanManager | `editorItems` | `items` | `useMemo(() => items.filter(...).sort(...))` |
| EventEditModalV2 | `allEvents` | EventHub缓存 | `useEventHubCache()` |

**优化示例**:
```typescript
// ❌ Before
const [allEvents, setAllEvents] = useState<any[]>([]);
useEffect(() => {
  EventService.getAllEvents().then(setAllEvents); // ❌ 异步派生延迟
}, []);

// ✅ After
const allEvents = useEventHubCache(); // ✅ 同步派生，实时更新
```

**修复优先级**: 🟡 P2 - 中优先级  
**预计工作量**: 1天  

---

### 4.2 Transient Buffer 缺失 (C类误用)

**影响组件**: PlanManager  
**严重程度**: 🟡 Medium  

**问题描述**:
```typescript
// ❌ 临时创建的空事件散落在组件State
const [pendingEmptyItems, setPendingEmptyItems] = useState<Map<string, Event>>(new Map());
```

**优化方案**:
```typescript
// ✅ 纳入 EventHub 的 transient write buffer
const transientBuffer = useEventHubTransient('PlanManager');

// 创建临时空事件
const newEvent = createEmptyEvent();
transientBuffer.add(newEvent); // 统一管理，自动清理

// Save时自动flush到持久化层
await transientBuffer.flush();
```

**修复优先级**: 🟡 P2 - 中优先级  
**预计工作量**: 1天  

---

### 4.3 useState 碎片化 (建议Hook化)

**影响组件**: EventEditModalV2, LogTab  
**严重程度**: 🟢 Low  

**问题描述**:
```typescript
// ❌ 20+个UI开关状态碎片化
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
const [showTagPicker, setShowTagPicker] = useState(false);
const [showTimePicker, setShowTimePicker] = useState(false);
// ... 等等20+个
```

**优化方案**:
```typescript
// ✅ 合并为 useModalUI Hook
const { ui, toggle, open, close } = useModalUI({
  emojiPicker: false,
  tagPicker: false,
  timePicker: false,
  // ...
});

// 使用
if (ui.emojiPicker) { ... }
toggle('emojiPicker');
open('tagPicker');
close('timePicker');
```

**修复优先级**: 🟢 P3 - 低优先级  
**预计工作量**: 0.5天  

---

### 4.4 订阅模式不一致

**影响组件**: PlanManager (✅正确), EventEditModalV2 (❌错误)  
**严重程度**: 🟢 Low  

**对比**:
```typescript
// ✅ PlanManager - 正确使用订阅
useEffect(() => {
  const unsubscribe = TagService.addListener(() => {
    setTagServiceVersion(v => v + 1);
  });
  return unsubscribe;
}, []);

// ❌ EventEditModalV2 - 直接加载
useEffect(() => {
  const tags = TagService.getTags(); // ❌ 不会自动更新
  setAvailableTags(tags);
}, []);
```

**优化方案**:
统一使用 `useServiceSubscription` Hook：
```typescript
const tags = useServiceSubscription(TagService, 'tags');
```

**修复优先级**: 🟢 P3 - 低优先级  
**预计工作量**: 0.5天  

---

## 5. 架构亮点总结

### 5.1 ✅ 会话态Hook化 (PlanManager, PlanSlate)

**亮点**: 使用 `usePlanManagerSession` 集中管理9个会话态，避免碎片化

```typescript
// 替代前: 9个独立useState
const [currentFocusedLineId, setCurrentFocusedLineId] = useState<string | null>(null);
const [focusedLineMode, setFocusedLineMode] = useState<'title' | 'eventlog'>('title');
const [isTaskMode, setIsTaskMode] = useState(false);
// ... 等等9个

// 替代后: 统一Hook管理
const { state: session, actions: sessionActions } = usePlanManagerSession();
// session.focus.lineId, session.focus.mode, session.focus.isTask, ...
```

**优势**:
- ✅ 原子更新：一次action更新多个相关状态
- ✅ 可预测：状态机模式，reducer纯函数
- ✅ 可测试：抽离业务逻辑到reducer
- ✅ 可复用：其他组件也可使用相同Hook

---

### 5.2 ✅ UI临时态正确使用

**亮点**: 所有hover状态、弹窗开关、筛选状态都正确使用 `useState`

```typescript
// ✅ hover状态 - 符合"丢了不影响数据正确性"
const [hoveredTimeId, setHoveredTimeId] = useState<string | null>(null);
const [hoveredTitleId, setHoveredTitleId] = useState<string | null>(null);

// ✅ 弹窗开关 - 纯UI状态
const [showEmojiPicker, setShowEmojiPicker] = useState(false);
const [showTagPicker, setShowTagPicker] = useState(false);

// ✅ 筛选状态 - 可重新计算
const [searchQuery, setSearchQuery] = useState('');
const [activeFilter, setActiveFilter] = useState<'tags' | 'tasks'>('tags');
```

**为什么正确**:
- 这些状态符合(A类)标准：丢了不影响数据正确性
- 不需要事务一致性，不跨模块共享
- 使用 `useState` 简单直观，符合React最佳实践

---

### 5.3 ✅ Lazy Initialization 优化

**亮点**: TimeCalendar 多个state使用函数初始化，避免重复计算

```typescript
// ✅ 从localStorage读取只在初始化时执行一次
const [currentDate, setCurrentDate] = useState<Date>(() => {
  const saved = localStorage.getItem('calendar-current-date');
  return saved ? new Date(saved) : new Date();
});

const [currentView, setCurrentView] = useState<'month' | 'week' | 'day'>(() => {
  const saved = localStorage.getItem('calendar-current-view');
  return (saved as any) || 'month';
});
```

**优势**:
- ✅ 性能优化：只在mount时读取localStorage一次
- ✅ 避免闭包陷阱：函数初始化器只执行一次
- ✅ 类型安全：可以在初始化器中进行验证和转换

---

### 5.4 ✅ 防抖缓存 (LogSlate)

**亮点**: 使用 `useRef` 缓存防抖保存，避免频繁触发 `onChange`

```typescript
const lastChangeTimeRef = useRef<number>(Date.now());

const handleChange = (newValue: Descendant[]) => {
  const now = Date.now();
  if (now - lastChangeTimeRef.current < 300) {
    // ✅ 300ms内的连续输入只触发最后一次onChange
    return;
  }
  lastChangeTimeRef.current = now;
  onSlateChange?.(newValue);
};
```

**优势**:
- ✅ 性能优化：减少onChange触发次数
- ✅ 避免重渲染：useRef不触发重渲染
- ✅ 正确使用：防抖计时器属于(E类)管线态，应该用ref

---

### 5.5 ✅ 复合状态打包 (ModalSlate.mentionMenu)

**亮点**: 将4个相关字段打包成一个state，避免碎片化

```typescript
// ✅ 打包相关状态
const [mentionMenu, setMentionMenu] = useState<{
  visible: boolean;
  query: string;
  position: { top: number; left: number } | null;
  atSignRange: Range | null;
}>({
  visible: false,
  query: '',
  position: null,
  atSignRange: null
});

// ✅ 原子更新
setMentionMenu({
  visible: true,
  query: '@user',
  position: { top: 100, left: 50 },
  atSignRange: selection
});

// ✅ 关闭时清理所有字段
setMentionMenu({
  visible: false,
  query: '',
  position: null,
  atSignRange: null
});
```

**优势**:
- ✅ 原子更新：4个字段同时更新，避免中间状态
- ✅ 避免闭包陷阱：一个setState调用，不依赖闭包
- ✅ 易于维护：相关状态集中管理

---

## 6. 重构优先级

### 6.1 P0 - 立即修复 (预计3-4天)

| 任务 | 影响组件 | 工作量 | 风险 |
|-----|---------|-------|------|
| 1. 统一数据源：迁移到EventHub | TimeLog, PlanManager, EventEditModalV2, TimeCalendar | 2-3天 | 🔴 High |
| 2. 移除PlanSlate.value冗余状态 | PlanSlate | 1天 | 🟠 Medium |

**P0任务详细说明**:

#### Task 1: 统一数据源 (2-3天)

**步骤**:
1. **创建 `useEventHubSubscription` Hook** (0.5天)
   ```typescript
   function useEventHubSubscription(options: {
     filter: (event: Event) => boolean;
     source: string;
   }): Event[] {
     const [events, setEvents] = useState<Event[]>([]);
     
     useEffect(() => {
       // 订阅 EventHub 更新
       const unsubscribe = EventHub.subscribe((updatedEvents) => {
         const filtered = updatedEvents.filter(options.filter);
         setEvents(filtered);
       }, options.source);
       
       // 初始加载
       const initial = EventHub.getAll().filter(options.filter);
       setEvents(initial);
       
       return unsubscribe;
     }, [options.filter, options.source]);
     
     return events;
   }
   ```

2. **迁移 TimeLog.tsx** (0.5天)
   ```typescript
   // Before
   const [allEvents, setAllEvents] = useState<Event[]>([]);
   useEffect(() => {
     EventService.getTimelineEvents(start, end).then(setAllEvents);
   }, [start, end]);
   
   // After
   const allEvents = useEventHubSubscription({
     filter: (event) => isInTimelineRange(event, start, end),
     source: 'TimeLog'
   });
   ```

3. **迁移 PlanManager.tsx** (0.5天)
4. **迁移 EventEditModalV2.tsx** (0.5天)
5. **迁移 TimeCalendar.tsx** (0.5天)

**验收标准**:
- ✅ 所有组件从EventHub获取数据，不直接调用EventService
- ✅ 事件更新自动同步到所有订阅组件
- ✅ 无重复请求（通过EventHub缓存）

#### Task 2: 移除 PlanSlate.value 冗余状态 (1天)

**步骤**:
1. **移除 value state** (0.2天)
   ```typescript
   // Before
   const [value, setValue] = useState<EventLineNode[]>(enhancedValue);
   
   // After
   // 完全移除，直接使用 editor.children
   ```

2. **修改 Slate 组件** (0.3天)
   ```typescript
   // Before
   <Slate 
     editor={editor} 
     value={value}
     onChange={(newValue) => {
       setValue(newValue);
       onSlateChange?.(newValue);
     }}
   />
   
   // After
   <Slate 
     editor={editor} 
     initialValue={enhancedValue}
     onChange={() => {
       onSlateChange?.(editor.children);
     }}
   />
   ```

3. **修改更新逻辑** (0.5天)
   ```typescript
   // Before
   setValue(newNodes); // ❌ 异步，可能不一致
   setEditorKey(k => k + 1); // ❌ 销毁旧编辑器
   
   // After
   Transforms.removeNodes(editor, { at: [0] });
   Transforms.insertNodes(editor, newNodes, { at: [0] });
   ```

**验收标准**:
- ✅ 移除所有 value/setValue
- ✅ 移除 editorKey 强制重新挂载
- ✅ 使用 Transforms API 更新内容
- ✅ Selection和Focus正常保持

---

### 6.2 P1 - 高优先级 (预计2天)

| 任务 | 影响组件 | 工作量 | 风险 |
|-----|---------|-------|------|
| 3. 持久化数据迁移到PersistentStore | TimeLog, TimeCalendar | 2天 | 🟡 Medium |

**P1任务详细说明**:

#### Task 3: 持久化数据迁移 (2天)

**步骤**:
1. **创建 `usePersistentStore` Hook** (0.5天)
   ```typescript
   function usePersistentStore<T>(key: string, options: {
     defaultValue: T;
     sync?: boolean; // 跨窗口同步
     validator?: (value: any) => boolean;
   }) {
     const [value, setValue] = useState<T>(() => {
       const saved = localStorage.getItem(key);
       if (saved) {
         try {
           const parsed = JSON.parse(saved);
           if (options.validator?.(parsed) ?? true) {
             return parsed;
           }
         } catch {}
       }
       return options.defaultValue;
     });
     
     useEffect(() => {
       localStorage.setItem(key, JSON.stringify(value));
       
       if (options.sync) {
         const channel = new BroadcastChannel(`persist-${key}`);
         channel.postMessage({ type: 'update', value });
       }
     }, [value, key, options.sync]);
     
     useEffect(() => {
       if (options.sync) {
         const channel = new BroadcastChannel(`persist-${key}`);
         channel.onmessage = (event) => {
           if (event.data.type === 'update') {
             setValue(event.data.value);
           }
         };
         return () => channel.close();
       }
     }, [key, options.sync]);
     
     return { value, setValue };
   }
   ```

2. **迁移 TimeLog 持久化数据** (0.5天)
3. **迁移 TimeCalendar 持久化数据** (0.5天)
4. **测试跨窗口同步** (0.5天)

---

### 6.3 P2 - 中优先级 (预计2天)

| 任务 | 影响组件 | 工作量 | 风险 |
|-----|---------|-------|------|
| 4. 派生状态迁移到useMemo | TimeLog, PlanManager, EventEditModalV2 | 1天 | 🟢 Low |
| 5. Transient Buffer统一管理 | PlanManager | 1天 | 🟢 Low |

---

### 6.4 P3 - 低优先级 (预计1天)

| 任务 | 影响组件 | 工作量 | 风险 |
|-----|---------|-------|------|
| 6. useState碎片化Hook化 | EventEditModalV2, LogTab | 0.5天 | 🟢 Low |
| 7. 订阅模式统一 | EventEditModalV2 | 0.5天 | 🟢 Low |

---

## 7. 总结

### 7.1 整体评估

**总计**: 86+个 useState

**分类统计**:

| 组件 | (A) UI临时态 | (B) 编辑器会话态 | (C) 领域数据 | (D) 派生/缓存 | (E) 管线态 | 总计 |
|------|-------------|----------------|------------|-------------|----------|------|
| TimeLog | 16 | 8 | 2 | 2 | 5 | 33 |
| PlanManager | 7 | 3 | 2 | 2 | 0 | 14 |
| PlanSlate | 0 | 1 | 0 | 1 | 0 | 2 |
| LogSlate | 1 | 2 | 0 | 0 | 0 | 3 |
| ModalSlate | 0 | 2 | 0 | 0 | 1 | 3 |
| EventEditModalV2 | ~15 | 1 | 1 | 2 | 1 | ~20 |
| LogTab | ~15 | 1 | 1 | 2 | 1 | ~20 |
| TimeCalendar | 3 | 1 | 2 | 2 | 3 | 11 |
| **总计** | **~57** | **19** | **10** | **11** | **11** | **~108** |

**符合架构设计**: ~68% (约74个)  
**不符合架构设计**: ~32% (约34个)

### 7.2 关键问题

🔴 **P0 严重问题 (2个)**:
1. 数据源混乱：4个组件绕过EventHub
2. Slate状态重复：PlanSlate.value双重状态

🟠 **P1 高优先级 (1个)**:
3. 持久化数据混入组件State：2个组件

🟡 **P2 中优先级 (2个)**:
4. 派生状态冗余：4个组件
5. Transient Buffer缺失：PlanManager

🟢 **P3 低优先级 (2个)**:
6. useState碎片化：EventEditModalV2, LogTab
7. 订阅模式不一致：部分组件

### 7.3 重构路径

**总预计工作量**: 8-10天

**阶段1 (P0 - 3-4天)**:
- Week 1: 统一数据源 + 移除Slate冗余状态

**阶段2 (P1 - 2天)**:
- Week 2: 持久化数据迁移

**阶段3 (P2 - 2天)**:
- Week 3: 派生状态优化 + Transient Buffer

**阶段4 (P3 - 1天)**:
- Week 4: Hook化清理 + 订阅模式统一

### 7.4 预期效果

**代码质量**:
- ✅ 单一数据源：所有组件从EventHub获取数据
- ✅ 状态一致性：消除双重状态和派生冗余
- ✅ 可维护性：会话态Hook化，减少碎片化

**性能提升**:
- ✅ 减少重复请求：EventHub缓存
- ✅ 减少重渲染：移除冗余state
- ✅ 优化加载：lazy initialization + useMemo

**用户体验**:
- ✅ 数据同步更快：EventHub自动同步
- ✅ Selection保持：移除editorKey强制重新挂载
- ✅ 跨窗口同步：BroadcastChannel替代轮询

---

**文档版本**: v2.22  
**生成时间**: 2025-12-23  
**下次更新**: 完成P0修复后
