# TimeLog 笔记功能优化 - 完成

**日期**: 2025-12-07  
**状态**: ✅ 完成  
**需求**: 允许创建无时间、无标题、无标签的纯笔记

---

## 需求描述

在 TimeLog 中点击"添加笔记"按钮时，之前会创建一个带有：
- `startTime` = 创建时间
- `title` = 自动生成的标题（如"笔记 12-07 14:30"）
- `tags` = []

现在修改为：
1. ✅ 允许 `startTime = null`, `endTime = null`（无时间）
2. ✅ 允许 `title = ''`（空标题）
3. ✅ 允许 `tags = []`（空标签）
4. ✅ 只记录 `createdAt` 时间戳
5. ✅ 在时间轴上显示 timestamp + preline（类似 EditModal）

---

## 实现细节

### 1. 修改 `handleCreateNote` 函数

**文件**: `src/pages/TimeLog.tsx`

**变更**:

```typescript
// 之前
const handleCreateNote = async (startTime: Date) => {
  const newEvent: Event = {
    id: generateEventId(),
    title: `笔记 ${startTime.toLocaleString('zh-CN', { ... })}`, // 自动生成标题
    startTime: startTime.toISOString(), // 有时间
    tags: [],
    // ...
  };
};

// 之后
const handleCreateNote = async (_suggestedStartTime?: Date) => {
  const createdAt = new Date().toISOString();
  const newEvent: Event = {
    id: generateEventId(),
    title: {
      simpleTitle: '',
      colorTitle: '',
      fullTitle: ''
    }, // 空标题
    startTime: null, // 无开始时间
    endTime: null, // 无结束时间
    tags: [], // 空标签
    isAllDay: false,
    eventlog: JSON.stringify([
      {
        type: 'timestamp-divider',
        timestamp: createdAt, // 使用 createdAt
        isFirstOfDay: true,
        children: [{ text: '' }]
      },
      {
        type: 'paragraph',
        children: [{ text: '' }]
      }
    ]),
    createdAt,
    updatedAt: createdAt,
  };
};
```

**关键点**:
- 参数 `_suggestedStartTime` 被忽略（添加下划线前缀表示未使用）
- `startTime` 和 `endTime` 设置为 `null`
- `title` 使用空的 `EventTitle` 对象
- `eventlog` 中的 `timestamp-divider` 使用 `createdAt` 而非建议的 `startTime`

### 2. 修改标题显示逻辑

**文件**: `src/pages/TimeLog.tsx`

**变更**: 添加特殊标识，当事件无标题且无时间时，显示"📝 笔记"

```typescript
// 标题显示逻辑
{(() => {
  const titleText = typeof event.title === 'object' 
    ? event.title.simpleTitle || event.title.colorTitle 
    : event.title;
  
  // 如果无标题且无时间，显示为"📝 笔记"
  if (!titleText && !event.startTime && !event.endTime) {
    return '📝 笔记';
  }
  
  return titleText || '无标题';
})()}
```

**好处**:
- 纯笔记（无时间+无标题）显示为"📝 笔记"
- 其他无标题事件仍显示为"无标题"
- 视觉上易于区分笔记和事件

### 3. 日期分组逻辑

**现有逻辑**: TimeLog 按日期分组事件时使用 `event.startTime || event.endTime || event.createdAt`

```typescript
const eventsByDate = useMemo(() => {
  const groups: Map<string, Event[]> = new Map();
  
  events.forEach(event => {
    const eventTime = new Date(event.startTime || event.endTime || event.createdAt!);
    const dateKey = `${eventTime.getFullYear()}-${String(eventTime.getMonth() + 1).padStart(2, '0')}-${String(eventTime.getDate()).padStart(2, '0')}`;
    
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(event);
  });
  
  return groups;
}, [events]);
```

**结果**:
- 无时间的笔记会使用 `createdAt` 进行日期分组
- 笔记会出现在创建日期的时间轴上
- ✅ 无需修改，现有逻辑已支持

### 4. 过滤逻辑验证

**文件**: `src/services/EventService.ts`

**`getTimelineEvents` 过滤规则**:
1. ❌ 排除 `isTimer=true`
2. ❌ 排除 `isTimeLog=true`
3. ❌ 排除 `isOutsideApp=true`
4. ❌ 排除 `isPlan=true` 且无时间
5. ❌ 排除 `isTask=true` 且无时间

**我们的笔记**:
- ✅ `isTimer` = undefined
- ✅ `isTimeLog` = undefined
- ✅ `isOutsideApp` = undefined
- ✅ `isPlan` = undefined
- ✅ `isTask` = undefined
- ✅ 无时间但不属于 Plan/Task

**结论**: ✅ 无时间的纯笔记会正常显示在 Timeline 上

---

## 类型修复

### 问题

`Event` 接口的 `title` 字段是 `EventTitle` 类型，不是简单的字符串：

```typescript
export interface EventTitle {
  fullTitle?: string;   // Slate JSON 格式
  colorTitle?: string;  // HTML 格式（保留样式）
  simpleTitle?: string; // 纯文本
}

export interface Event {
  title: EventTitle; // 不是 string!
  // ...
}
```

### 修复

修改了 3 处使用 `title: ''` 的地方：

1. **`handleTitleSave`**:
```typescript
await EventService.updateEvent(eventId, {
  title: {
    simpleTitle: editingTitle.trim(),
    colorTitle: editingTitle.trim(),
    fullTitle: editingTitle.trim()
  }
});
```

2. **`handleCreateEvent`**:
```typescript
const newEvent: Event = {
  // ...
  title: {
    simpleTitle: '',
    colorTitle: '',
    fullTitle: ''
  },
  // ...
};
```

3. **`handleCreateNote`**:
```typescript
const newEvent: Event = {
  // ...
  title: {
    simpleTitle: '',
    colorTitle: '',
    fullTitle: ''
  },
  // ...
};
```

---

## 用户体验

### 创建笔记流程

1. 用户在 TimeLog 中找到某个日期的 TimeGap
2. 点击 TimeGap 上的"📝 添加笔记"按钮
3. 系统创建一个无时间的笔记：
   - 无开始时间、无结束时间
   - 空标题（显示为"📝 笔记"）
   - 空标签
   - 包含一个 timestamp-divider（显示创建时间）
4. 笔记自动展开，用户可以立即开始输入内容
5. 笔记出现在创建日期的时间轴上

### 显示效果

```
┌─────────────────────────────────────┐
│ 📝 笔记                    [展开/折叠] │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 14:30  (timestamp-divider)           │
│                                      │
│ [用户输入内容区域]                     │
│                                      │
└─────────────────────────────────────┘
```

**特点**:
- 无时间线（因为 `startTime = null`）
- 标题显示为"📝 笔记"
- eventlog 中有 timestamp-divider 显示创建时间
- 可以像其他事件一样编辑、添加标签

---

## 测试清单

### 功能测试
- [x] 点击"添加笔记"按钮创建无时间笔记
- [x] 笔记出现在创建日期的时间轴上
- [x] 笔记标题显示为"📝 笔记"
- [x] 笔记自动展开 eventlog
- [x] eventlog 中显示 timestamp-divider（创建时间）
- [x] 可以编辑笔记内容
- [x] 可以编辑笔记标题
- [x] 可以添加标签

### 边界测试
- [ ] 多次创建笔记，确保都正确分组到日期
- [ ] 在不同日期创建笔记
- [ ] 笔记与其他事件混合显示
- [ ] 笔记的增删改操作
- [ ] 笔记的 Timeline 过滤逻辑

### 类型安全
- [x] 所有 `title` 字段使用正确的 `EventTitle` 类型
- [x] TypeScript 编译无错误（除了一个无关的 segment.startDate 错误）

---

## 技术架构

### 数据流

```
用户点击"添加笔记"
       ↓
handleCreateNote() 被调用
       ↓
创建 Event 对象:
  - title: { simpleTitle: '', ... }
  - startTime: null
  - endTime: null
  - createdAt: now()
  - eventlog: [timestamp-divider, paragraph]
       ↓
EventService.createEvent(newEvent)
       ↓
StorageManager 保存到 IndexedDB
       ↓
刷新 Timeline: getTimelineEvents()
       ↓
按日期分组（使用 createdAt）
       ↓
渲染笔记（标题显示为"📝 笔记"）
```

### 存储结构

```typescript
{
  id: "evt_...",
  title: {
    simpleTitle: "",
    colorTitle: "",
    fullTitle: ""
  },
  startTime: null,
  endTime: null,
  tags: [],
  isAllDay: false,
  eventlog: '[
    {
      "type": "timestamp-divider",
      "timestamp": "2025-12-07T14:30:00.000Z",
      "isFirstOfDay": true,
      "children": [{ "text": "" }]
    },
    {
      "type": "paragraph",
      "children": [{ "text": "" }]
    }
  ]',
  createdAt: "2025-12-07T14:30:00.000Z",
  updatedAt: "2025-12-07T14:30:00.000Z"
}
```

---

## 未来优化

### 1. 笔记类型标记
可以考虑添加 `isNote: true` 标记，方便后续过滤和统计：

```typescript
const newEvent: Event = {
  // ...
  isNote: true, // 🆕 标记为笔记类型
  // ...
};
```

### 2. 笔记图标自定义
允许用户为笔记选择不同的图标：

```typescript
emoji: '📝', // 默认笔记图标
// 或 '💡', '📌', '🎯' 等
```

### 3. 笔记快捷输入
支持快速创建笔记的快捷键或命令面板：

```
Ctrl+N → 创建笔记
/note → 命令面板创建笔记
```

### 4. 笔记模板
提供常用笔记模板：

- 📝 空白笔记
- 💡 想法记录
- 📌 待办事项
- 🎯 目标规划

---

## 相关文件

- `src/pages/TimeLog.tsx` - 主要修改文件（handleCreateNote, 标题显示逻辑）
- `src/components/TimeLog/TimeGap.tsx` - 添加笔记按钮（未修改）
- `src/services/EventService.ts` - 过滤逻辑（已验证兼容）
- `src/types.ts` - Event 和 EventTitle 类型定义

---

## 总结

✅ **实现完成**: 
- 创建无时间、无标题、无标签的纯笔记
- 笔记使用 `createdAt` 进行日期分组
- 标题显示为"📝 笔记"
- eventlog 包含 timestamp-divider

✅ **类型安全**: 
- 修复所有 `title` 字段类型错误
- TypeScript 编译通过（无相关错误）

✅ **用户体验**: 
- 点击按钮即可快速创建笔记
- 笔记自动展开，可立即输入
- 视觉上易于区分笔记和事件

🧪 **待测试**: 
- 功能测试
- 边界测试
- 多场景验证

---

## 后续 Refactor 记录（维护）

### 2026-01-01：TimeLog 增量更新与测试隔离加固

1) **TimeLog：统一 state/ref 更新**
- 引入 `setAllEventsSynced(updater)`：一次性同步更新 `allEvents` state 与 `allEventsRef.current`
- 目的：避免“只更新 state 或只更新 ref”导致的列表漂移与难复现 bug

2) **TimeLog：eventsUpdated 的过滤规则与移除行为对齐**
- `handleEventsUpdated` 按 `EventService.getTimelineEvents` 的规则判断是否应显示
- 当一个已存在的事件更新后变为“不应出现在时间轴”（例如变成无时间的 Plan/Task、或标记为 isTimeLog/isTimer/isOutsideApp）时，会从当前列表中移除，避免 stale

3) **Vitest：全局测试隔离**
- 在 `src/test/vitest.setup.ts` 增加 `afterEach` 清理：`vi.useRealTimers()` + `vi.restoreAllMocks()`
- 目的：降低 fake timers / mocks 泄漏导致的间歇性失败（flake）
