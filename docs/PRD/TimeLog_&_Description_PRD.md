# TimeLog 页面 & Event.eventlog 字段 PRD

> **版本**: v2.6
> **创建时间**: 2024-01-XX  
> **最后更新**: 2025-12-18
> **Figma 设计稿**: [TimeLog 页面设计](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=333-1178&m=dev)  
> **依赖模块**: EventService, PlanSlateEditor, TimeHub, EventHub  
> **关联文档**:
> - [EventEditModal v2 PRD](./EVENTEDITMODAL_V2_PRD.md)
> - [TIME_ARCHITECTURE.md](../TIME_ARCHITECTURE.md)
> - [SLATE_DEVELOPMENT_GUIDE.md](../SLATE_DEVELOPMENT_GUIDE.md)

---

## 🔄 v2.6 更新日志 (2025-12-18)

### 笔记事件（Note）完整功能设计 ✨

#### 1. 时间显示架构（已验证 ✅）

TimeLog 已完整支持四种时间显示模式（无需改动）：

| 场景 | 显示逻辑 | 代码位置 |
|------|---------|---------|
| **startTime & endTime** | 显示时间段 + 时长箭头 | L1862-1877 |
| **仅 startTime** | 显示单一开始时间 | L1878-1884 |
| **仅 endTime** | 显示单一结束时间 | L1885-1890 |
| **两者都无** | 显示 `createdAt`（笔记创建时间） | L1857-1861 |

**排序规则**（已验证 ✅）：
```typescript
// TimeLog.tsx L534-535
const timeA = a.startTime || a.endTime || a.createdAt || '';
const timeB = b.startTime || b.endTime || b.createdAt || '';
```

✅ **结论**：Note事件无需单独的时间显示逻辑，使用现有架构即可。

---

#### 2. 标题处理策略

##### 2.1 TimeLog 页面：动态标题行插入

**默认行为**：
- 无标题（`title.simpleTitle === ''`）→ 不显示标题行
- 用户看到的是 `eventlog` 内容直接展示（类似笔记本流式记录）

**标题行插入交互**：
1. **触发方式**：
   - 鼠标悬停在事件时间区域 → 显示幽灵菜单
   - 点击 `title_edit` 图标按钮（Assets/icon/title_edit.svg）

2. **插入行为**：
   - 在 `eventlog` 上方动态插入标题编辑行
   - 使用 `LogSlate` 组件（mode="title"）
   - 显示灰色 placeholder: "为笔记添加标题..."
   - 自动聚焦到标题输入框

3. **保存逻辑**：
   - 用户输入内容后失焦 → 保存到 `event.title`
   - 若用户未输入直接失焦 → 移除标题行，恢复无标题状态

4. **状态管理**：
```typescript
const [editingTitleEventId, setEditingTitleEventId] = useState<string | null>(null);

// 幽灵菜单点击处理
const handleInsertTitle = (eventId: string) => {
  setEditingTitleEventId(eventId);
};

// 渲染逻辑
{event.title?.simpleTitle || editingTitleEventId === event.id ? (
  <div className="event-title-row">
    <LogSlate
      mode="title"
      placeholder="为笔记添加标题..."
      value={event.title?.colorTitle || ''}
      autoFocus={editingTitleEventId === event.id}
      onBlur={(isEmpty) => {
        if (isEmpty) setEditingTitleEventId(null);
      }}
    />
  </div>
) : null}
```

**图标资源**：
- `Assets/icon/title_edit.svg` - 标题编辑按钮（幽灵菜单中）

##### 2.2 其他场景：虚拟标题生成

**适用场景**：
- EventEditModal（右侧面板）
- LogTab（标签页标题）
- TimeCalendar（日历格子显示）
- Outlook/外部同步（Subject字段）

**生成规则**：
```typescript
// EventService.ts 新增工具方法
static getVirtualTitle(event: Event, maxLength: number = 30): string {
  // 1. 优先使用真实标题
  if (event.title?.simpleTitle) {
    return event.title.simpleTitle;
  }
  
  // 2. 从 eventlog 提取纯文本
  const plainText = typeof event.eventlog === 'string'
    ? this.extractPlainTextFromEventlog(event.eventlog)
    : event.eventlog?.plainText || '';
  
  // 3. 清理格式并截取
  const virtualTitle = plainText
    .replace(/\n+/g, ' ')           // 换行转空格
    .replace(/\s+/g, ' ')           // 合并空格
    .slice(0, maxLength)
    .trim();
  
  return virtualTitle || '无内容笔记';
}

// 使用示例
const displayTitle = EventService.getVirtualTitle(event, 15); // "双击Alt召唤美桶..."
```

**显示效果**：
| 场景 | maxLength | 格式 |
|------|-----------|------|
| LogTab 标签 | 15字符 | "双击Alt召唤..." |
| TimeCalendar | 20字符 | "双击Alt召唤美桶、格式..." |
| Outlook Subject | 50字符 | "4DNote笔记 - 双击Alt召唤美桶、格式等..." |

---

#### 3. isNote 字段：重要笔记标记系统

##### 3.1 功能定义

**`isNote: boolean`** - 用户主动标记的重要笔记（类似收藏夹/书签功能）

**关键特性**：
- ❌ **非自动标记**：创建无标题事件不会自动设置 `isNote=true`
- ✅ **用户主动操作**：通过幽灵菜单的 NoteTree 图标手动切换
- ✅ **EventTree 打包**：标记后，整个事件树（父节点 + 子节点）统一标记
- ✅ **侧边栏快捷访问**：标记的笔记显示在"事件选择"菜单中
- ✅ **跨页面跳转**：任何页面点击侧边栏笔记 → 跳转到TimeLog + LogTab打开

##### 3.2 交互流程

**标记流程**：
1. 鼠标悬停在事件上 → 显示幽灵菜单
2. 点击 NoteTree 图标（Assets/icon/Notetree.svg）
3. 系统检测 EventTree 结构：
   - 查找父事件（`event.parentEventId`）
   - 查找所有子事件（`event.childEventIds`）
4. 批量更新：
   ```typescript
   // 示例：标记整个树
   const treeEvents = [parent, ...children, currentEvent];
   for (const evt of treeEvents) {
     await EventService.updateEvent(evt.id, { isNote: true }, false, {
       source: 'user-edit',
       originComponent: 'TimeLog'
     });
   }
   ```

**取消标记流程**：
1. 点击已标记笔记的 NoteTree 图标（图标状态为激活）
2. 弹出确认对话框：
   ```
   ┌────────────────────────────────────┐
   │ 移除笔记标记                        │
   ├────────────────────────────────────┤
   │ 此事件包含 3 个关联事件：           │
   │ • 父事件：Project Ace              │
   │ • 当前事件：准备演讲稿              │
   │ • 子事件：演讲PPT草稿               │
   │                                    │
   │ [仅移除本事件] [移除整个笔记树]     │
   └────────────────────────────────────┘
   ```
3. 用户选择：
   - **仅移除本事件**：只设置 `currentEvent.isNote = false`
   - **移除整个笔记树**：批量设置树中所有事件 `isNote = false`

##### 3.3 侧边栏显示

**位置**：左侧控制区 → "事件选择" 菜单下方

**UI 设计**：
```
┌──────────────────┐
│ 🔍 智能搜索       │
└──────────────────┘

┌──────────────────┐
│ 📅 日历选择器     │
└──────────────────┘

┌──────────────────┐
│ 🏷️ 标签/事件/收藏 │
│ #工作 37          │
│ #PRD交流 12       │
└──────────────────┘

┌──────────────────┐
│ 📝 重要笔记 (3)   │ ← 新增区域
├──────────────────┤
│ ┬ Project Ace    │ ← 树根事件（展开/折叠）
│ ├─ 准备演讲稿     │ ← 子事件1
│ └─ 演讲PPT草稿    │ ← 子事件2
│                  │
│ • 技术架构规划    │ ← 独立笔记（无树结构）
└──────────────────┘
```

**数据查询**：
```typescript
// 获取所有 isNote=true 的事件
const noteEvents = await EventService.getAllEvents()
  .then(events => events.filter(e => e.isNote === true));

// 按 EventTree 结构分组
const noteTrees = groupByEventTree(noteEvents);
```

##### 3.4 跨页面跳转逻辑

**触发场景**：
- 用户在任何页面（Plan/TimeCalendar/Timer）
- 点击侧边栏"重要笔记"中的某个事件

**跳转行为**：
1. **导航到 TimeLog 页面**：
   ```typescript
   navigate('/timelog');
   ```

2. **滚动到事件位置**：
   ```typescript
   // 等待 TimeLog 渲染完成
   setTimeout(() => {
     const eventElement = document.querySelector(`[data-event-id="${eventId}"]`);
     eventElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
   }, 300);
   ```

3. **以 LogTab 形式打开**：
   ```typescript
   // TimeLog 组件维护 LogTab 状态
   const [openLogTabs, setOpenLogTabs] = useState<Set<string>>(new Set());
   
   // 打开 LogTab
   setOpenLogTabs(prev => new Set([...prev, eventId]));
   ```

**LogTab 持久化**：
```typescript
// 使用 localStorage 记住用户打开的 LogTabs
useEffect(() => {
  const saved = localStorage.getItem('timelog_open_logtabs');
  if (saved) {
    setOpenLogTabs(new Set(JSON.parse(saved)));
  }
}, []);

useEffect(() => {
  localStorage.setItem('timelog_open_logtabs', JSON.stringify([...openLogTabs]));
}, [openLogTabs]);
```

**LogTab 关闭**：
```typescript
// 用户点击 LogTab 的关闭按钮（×）
const handleCloseLogTab = (eventId: string) => {
  setOpenLogTabs(prev => {
    const next = new Set(prev);
    next.delete(eventId);
    return next;
  });
};
```

**LogTab UI 示例**：
```
┌─────────────────────────────────────────────────┐
│ TimeLog 页面                                     │
├─────────────────────────────────────────────────┤
│ 已打开的笔记：                                    │
│ [准备演讲稿 ×] [技术架构规划 ×] [+ 新建笔记]      │
│                                                 │
│ ↓ 点击标签页切换内容，点击×关闭                    │
└─────────────────────────────────────────────────┘
```

##### 3.5 图标资源

- **Assets/icon/Notetree.svg** - NoteTree 标记按钮
  - 未激活状态：灰色边框
  - 激活状态（`isNote=true`）：紫色填充

---

#### 4. Note 事件 Outlook 同步策略

##### 4.1 问题背景

Note 类型事件（无标题、无时间的快速记录）在同步到 Outlook Calendar 时面临两个挑战：
1. **Outlook 要求**：Calendar 事件必须有 `subject` 和时间字段
2. **数据保护**：同步回来时不能污染本地的纯净 note 数据

##### 4.2 本地→远端同步（虚拟时间生成）

**触发条件**：
- 事件设置了 `calendarIds`（用户明确要求同步）
- 无 `startTime` 或 `endTime`（note 特征）

**虚拟时间规则**：
```typescript
// normalizeEvent() 中处理
if (event.calendarIds && event.calendarIds.length > 0) {
  // 检测是否为需要虚拟时间的 note
  if (!event.startTime && !event.endTime) {
    // 生成虚拟时间（仅用于同步）
    const createdDate = new Date(event.createdAt);
    event._syncStartTime = formatTimeForStorage(createdDate);  // 虚拟开始时间
    event._syncEndTime = formatTimeForStorage(
      new Date(createdDate.getTime() + 60 * 60 * 1000)  // +1小时
    );
    event._isVirtualTime = true;  // 标记为虚拟时间
  }
}
```

**虚拟标题处理**（已实现）：
```typescript
const subject = EventService.getVirtualTitle(event, 50) || '4DNote笔记';
```

**签名标记**：
在 description 签名中添加虚拟时间标记：
```
[内容...]

---
📝 笔记由 🔮 4DNote 创建于 2025-12-18 14:30:00  ← 注意"笔记"前缀
```

普通事件签名（对比）：
```
[内容...]

---
由 🔮 4DNote 创建于 2025-12-18 14:30:00
```

##### 4.3 远端→本地同步（虚拟时间过滤）

**识别逻辑**：
```typescript
// createEventFromRemoteSync() 中处理
const hasVirtualTimeMarker = event.description?.includes('� 笔记由');

if (hasVirtualTimeMarker) {
  // 检查本地原始事件是否无时间
  const localEvent = await EventService.getEventById(event.id);
  if (localEvent && !localEvent.startTime && !localEvent.endTime) {
    // 丢弃远端的虚拟时间，恢复本地原始状态
    delete event.startTime;
    delete event.endTime;
    
    console.log('🔧 [Sync] 检测到虚拟时间标记，已移除远端时间字段');
  }
}
```

**更新逻辑**：
```typescript
// updateEvent() 中处理（如需要）
if (updates.description && updates.description.includes('📝 笔记由')) {
  // 远端更新时保护本地时间字段
  const existingEvent = await EventService.getEventById(eventId);
  if (existingEvent && !existingEvent.startTime) {
    delete updates.startTime;  // 不接受远端的虚拟时间
    delete updates.endTime;
  }
}
```

##### 4.4 数据流示例

**场景1：本地 note 首次同步到 Outlook**
```
本地数据:
{
  id: "event_xxx",
  title: { simpleTitle: "" },
  startTime: null,
  endTime: null,
  createdAt: "2025-12-18 14:30:00",
  calendarIds: ["calendar_work"]
}

↓ normalizeEvent() 处理

同步数据:
{
  subject: "双击Alt召唤美桶...",  // 虚拟标题
  start: "2025-12-18T14:30:00",   // 虚拟开始时间
  end: "2025-12-18T15:30:00",     // 虚拟结束时间
  body: "[内容...]\n---\n📝 笔记由 🔮 4DNote 创建于 2025-12-18 14:30:00"
}

↓ 同步到 Outlook

Outlook Calendar:
显示为 14:30-15:30 的事件
```

**场景2：Outlook 编辑后同步回本地**
```
Outlook 数据:
{
  subject: "双击Alt召唤美桶...",
  start: "2025-12-18T14:30:00",
  end: "2025-12-18T15:30:00",     // Outlook 可能修改了时间
  body: "[用户在Outlook中修改的内容]\n---\n📝 笔记由 🔮 4DNote 创建于 2025-12-18 14:30:00"
}

↓ createEventFromRemoteSync() 处理

本地恢复:
{
  id: "event_xxx",
  title: { simpleTitle: "" },     // 不接受虚拟标题
  startTime: null,                // 不接受远端时间
  endTime: null,
  eventlog: "[用户在Outlook中修改的内容]",  // 接受内容更新
  updatedAt: "2025-12-18 15:45:00"
}
```

##### 4.5 特殊情况处理

**用户在本地添加真实时间**：
```typescript
// 用户点击幽灵菜单"设置时间"
await EventService.updateEvent(eventId, {
  startTime: "2025-12-19 10:00:00",
  endTime: "2025-12-19 11:00:00"
});

// normalizeEvent() 检测到真实时间
if (event.startTime && event.endTime) {
  // 移除虚拟时间标记
  delete event._isVirtualTime;
  // description 签名中不添加虚拟标记
}
```

**同步到 Microsoft To Do**：
```typescript
// note 事件不推荐同步到 To Do（日志性质）
if (event.todoListIds && !event.startTime) {
  console.warn('⚠️ [Sync] Note 事件不适合同步到 Microsoft To Do');
  // 用户可手动转换为 Task 后同步
}
```

##### 4.6 实现要点

1. **签名标记规范**：
   - 固定格式：`📝 笔记由 🔮 4DNote 创建于 ...`
   - 关键识别词：`📝 笔记由`
   - 位置：签名开头

2. **虚拟时间字段**：
   - `_isVirtualTime` - 内部标记（normalizeEvent 中使用，不存储）
   - `startTime` / `endTime` - 同步时使用虚拟值，本地保持 null

3. **向后兼容**：
   - 检测本地事件是否有 `startTime`，有则认为是用户添加的真实时间
   - 远端更新时保护本地真实时间不被虚拟时间覆盖

---

### 技术实现清单

#### 必需完成的功能

- [ ] **TimeLog 标题行插入**
  - [ ] 添加 `editingTitleEventId` 状态管理
  - [ ] 幽灵菜单添加 `title_edit` 按钮
  - [ ] 动态标题行渲染逻辑
  - [ ] 空标题失焦移除逻辑

- [ ] **虚拟标题生成**
  - [ ] `EventService.getVirtualTitle()` 方法
  - [ ] `extractPlainTextFromEventlog()` 工具函数
  - [ ] LogTab/TimeCalendar/Outlook 集成

- [ ] **isNote 标记系统**
  - [ ] `types.ts` 添加 `isNote?: boolean` 字段
  - [ ] 幽灵菜单添加 NoteTree 图标按钮
  - [ ] EventTree 批量标记逻辑
  - [ ] 取消标记确认对话框

- [ ] **侧边栏重要笔记**
  - [ ] 新增"重要笔记"区域UI
  - [ ] EventTree 分组显示逻辑
  - [ ] 点击跳转到 TimeLog + 滚动定位

- [ ] **LogTab 系统**
  - [ ] LogTab 状态管理（`openLogTabs`）
  - [ ] LogTab UI 组件（标签页 + 关闭按钮）
  - [ ] localStorage 持久化
  - [ ] 跨页面跳转集成

---

## 🔄 v2.5 更新日志 (2025-12-09)

### 压缩日期交互式展开功能 ✨

#### 功能描述
用户可以点击压缩日期范围中的任意日期按钮，将该日期展开为完整的时间轴日期段，并支持在该日期的任意时间点创建事件。

#### 交互流程

1. **初始状态**
   - 压缩日期段显示为横向日历格子
   - 每个日期显示为可点击的按钮（星期 + 日期）
   - 例：`三 10` `四 11` `五 12`

2. **点击展开**
   - 用户点击任意日期按钮（如"四 11"）
   - 该日期从压缩段中提取出来
   - 压缩段自动拆分为三部分：
     - **压缩段1**: 展开日期之前的日期（如 9-10日）+ 月份标题
     - **展开日期**: 完整的日期标题 + TimeGap（如"12月11日 | 周四"）
     - **压缩段2**: 展开日期之后的日期（如 12-31日）+ 月份标题

3. **TimeGap 交互**
   - 展开的日期显示完整时间轴（00:00 - 23:59）
   - 用户可以在任意时间点创建事件/笔记
   - 支持精准时间选择（鼠标悬停显示时间点）

#### 技术实现

**1. 日期格式化工具函数** (`src/utils/timeUtils.ts`)
```typescript
// 新增：格式化日期为 YYYY-MM-DD（本地时间，避免时区问题）
export const formatDateForStorage = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
```

**2. 展开日期状态管理** (`src/pages/TimeLog.tsx`)
```typescript
const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
```

**3. 压缩段智能拆分渲染**

月份标题 + 压缩段组合：
- 检查压缩段内是否有展开的日期
- 如果有展开，遍历所有日期，按展开状态分段：
  - **未展开的连续日期** → 压缩段（带月份标题）
  - **展开的日期** → 完整日期组件（带 TimeGap）
  - 确保每个压缩段都有自己的月份标题

**4. 时区问题修复**

- ❌ 禁止使用 `date.toISOString().split('T')[0]`
  - 原因：toISOString() 返回 UTC 时间，GMT+8 会导致日期减1
  - 例：`Thu Dec 11 2025 00:00:00 GMT+0800` → `2025-12-10`（错误）
  
- ✅ 使用 `formatDateForStorage(date)`
  - 直接读取本地时间组件（getFullYear/getMonth/getDate）
  - 例：`Thu Dec 11 2025 00:00:00 GMT+0800` → `2025-12-11`（正确）

**5. 渲染逻辑**

```typescript
// 检查是否有展开的日期
const hasExpandedDate = Array.from(expandedDates).some(expandedDateKey => {
  const currentDate = new Date(segment.startDate);
  while (currentDate <= segment.endDate) {
    if (formatDateForStorage(currentDate) === expandedDateKey) return true;
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return false;
});

if (hasExpandedDate) {
  // 遍历日期范围，按展开状态分段渲染
  let compressedStart: Date | null = null;
  
  for (let date = startDate; date <= endDate; date++) {
    if (expandedDates.has(formatDateForStorage(date))) {
      // 先渲染累积的压缩段（带月份标题）
      if (compressedStart) {
        renderCompressedRange(compressedStart, date - 1);
        compressedStart = null;
      }
      // 渲染展开的日期
      renderExpandedDate(date);
    } else {
      // 累积压缩段
      if (!compressedStart) compressedStart = date;
    }
  }
  
  // 渲染剩余的压缩段
  if (compressedStart) renderCompressedRange(compressedStart, endDate);
}
```

#### 视觉效果

展开前：
```
2025
12    三 10  四 11  五 12  六 13  ...  三 31
```

点击"四 11"后：
```
2025
12    三 10

12月11日 | 周四
├─ 00:00
├─ [TimeGap - 可创建事件]
└─ 23:59

2025
12    五 12  六 13  ...  三 31
```

#### 代码变更

- **src/utils/timeUtils.ts**
  - 新增 `formatDateForStorage()` 函数
  - 替换所有 `.toISOString().split('T')[0]` 为 TimeSpec 格式

- **src/pages/TimeLog.tsx**
  - 导入 `formatDateForStorage`
  - 新增 `expandedDates` 状态
  - CompressedDateRange 添加 `onDateClick` 回调
  - 月份标题 + 压缩段拆分渲染逻辑
  - 独立压缩段拆分渲染逻辑

- **src/components/TimeLog/CompressedDateRange.tsx**
  - 按钮添加 `onClick` 事件
  - 调用 `onDateClick?.(date)` 回调

- **src/utils/slateSerializer.ts** & **versionDiff.ts**
  - 修复 `lastEditedAt` 使用 `formatTimeForStorage` 替代 `.toISOString()`

#### 性能优化

- 展开日期不触发完整列表刷新
- 只更新局部渲染（React Fragment 拆分）
- Set 数据结构确保 O(1) 查找性能

---

## 🔄 v2.4 更新日志 (2025-12-08)

### 架构升级 ✨

1. **EventHub 统一事件更新架构** ✅
   - 所有保存处理器迁移到 `EventHub.updateFields()`
   - 统一的更新接口替代直接调用 `EventService.updateEvent()`
   - 带 `source` 标识符的更新溯源机制

2. **循环更新防护系统** ✅
   - `eventsUpdated` 监听器增加 `isLocalUpdate` 和 `originComponent` 检查
   - 自动跳过来自自身的更新事件，避免循环处理
   - 7 个 TimeLog source 标识符：titleSave、eventlogChange、tagsChange 等

3. **增量更新机制** ✅
   - 移除所有全量刷新调用（`getTimelineEvents()`）
   - 只更新变化的单个事件，不触发完整列表重建
   - 保持虚拟滚动位置和性能优化

4. **空标题保护** ✅
   - 防止 Slate 初始化时空 onChange 覆盖现有标题
   - 检查当前标题是否存在，拒绝空标题保存
   - 避免 Outlook 同步事件标题丢失

### UX 升级 ✨

5. **TimeGap 悬浮菜单优化** ✅
   - **触发区域扩大**: 从 2px 虚线扩大到 200px 宽触发区域
   - **稳定性提升**: `interactiveBorder: 300px` 允许鼠标在触发区和菜单间移动
   - **层级修复**: `zIndex: 999` + `appendTo: body` 确保显示在 sticky header 上方
   - **布局优化**: content 区域使用 `margin-left` 而非 `padding-left`，避免遮挡触发区
   - **精准时间选择**: 鼠标 Y 坐标追踪，实时显示对应时间点
   - **防抖机制**: 100ms 延迟隐藏，避免快速划过时闪烁

### 性能优化

- 减少不必要的数据库查询（取消全量刷新）
- 减少 UI 重渲染次数（增量更新单个事件）
- 保持虚拟滚动稳定性（不触发列表重建）
- Tippy 动画禁用，实现瞬间显示/隐藏

### 代码变更

- **src/pages/TimeLog.tsx**:
  - 所有 save handlers 迁移到 EventHub
  - eventsUpdated 监听器添加循环防护
  - 移除手动 setAllEvents 调用

- **src/components/TimeLog/TimeGap.tsx**:
  - 添加 `.time-gap-axis-trigger` 200px 宽触发区域
  - Tippy 配置: `interactiveBorder={300}`, `zIndex={999}`, `appendTo={body}`
  - 鼠标坐标追踪 + 时间计算
  - `isInMenu` 锁定机制防止时间显示抖动

- **src/components/TimeLog/TimeGap.css**:
  - `.time-gap-content` 使用 `margin-left: 40px`
  - 触发区域 z-index 调整
  - 悬浮菜单主题色 hover 效果

---

## 🔄 v2.3 更新日志 (2025-12-07)

### 新增功能

1. **Timeline 事件过滤系统** ✅
   - 新增 `EventService.getTimelineEvents()` 方法
   - 自动过滤附属事件（`isTimer`/`isTimeLog`/`isOutsideApp`）
   - 自动过滤无时间的 Plan 事件（`isPlan=true` 且无时间字段）
   - 自动过滤无时间的 Task 事件（`isTask=true` 且无时间字段）
   - 保留所有设置了时间的事件（包括 Plan/Task）

2. **TimeGap 智能渲染优化** ✅
   - 压缩日期段默认不渲染 TimeGap（性能优化）
   - 用户点击压缩日期后展开显示完整 TimeGap
   - 展开的空白日期支持 00:00-23:59 全时段创建事件
   - 今天始终显示完整 TimeGap（首/间/尾）
   - 非今天只在事件间显示 TimeGap（不在首尾）

3. **虚拟滚动过滤一致性** ✅
   - 历史加载使用 `getTimelineEvents()`
   - 未来加载使用 `getTimelineEvents()`
   - 所有刷新操作统一使用过滤方法

### 架构改进

- **数据层**: EventService 新增 Timeline 专用查询方法
- **渲染层**: TimeGap 按需渲染，避免不必要的组件实例化
- **交互层**: 压缩日期支持点击展开，提升用户体验

### 性能优化

- 减少 TimeGap 组件实例数量（压缩日期不渲染）
- 虚拟滚动加载自动应用过滤（避免渲染无用事件）
- 展开状态管理使用 Set 数据结构（高效查找）

---

## 📋 目录

1. [核心概念](#1-核心概念)
   - TimeLog 页面 vs Event.eventlog 字段
   - 数据字段职责划分
2. [TimeLog 页面设计](#2-timelog-页面设计)
   - 整体布局
   - Event 卡片设计
   - 时间轴与过滤器
   - **数据集成规范**（2025-12-03 新增）
3. [Event.eventlog 字段](#3-eventeventlog-字段)
   - 数据结构定义
   - Timestamp 自动插入机制
   - Slate 编辑器集成
4. [编辑场景](#4-编辑场景)
   - TimeLog 页面（主要）
   - EventEditModal 右侧（次要）
   - PlanManager（紧凑模式）
5. [Outlook 同步机制](#5-outlook-同步机制)
   - eventlog → description 自动转换
   - 智能序列化策略
6. [版本控制与历史](#6-版本控制与历史)
7. [离线队列与保存机制](#7-离线队列与保存机制)
   - 保存架构层次
   - 离线队列触发时机
8. [附件管理系统](#8-附件管理系统)
   - 容量限制设计
   - 本地缓存策略
   - 云端上传降级
   - 文件类型验证
   - 容量监控与清理
9. [实现指南](#9-实现指南)

---

## ⚠️ 时间架构一致性要求（2025-12-03）

> **重要：本 PRD 中的所有时间操作代码仅作示例，实际实现必须遵循 `TIME_ARCHITECTURE.md` 规范！**

### 核心原则

根据 `docs/architecture/TIME_ARCHITECTURE.md`，4DNote 采用 **TimeHub 统一时间架构**：

1. **✅ 唯一真相源：TimeSpec**
   - `event.timeSpec` 是权威数据，包含用户意图（rawText）和规范化时间（resolved）
   - 通过 `TimeHub.setEventTime()` 或 `TimeHub.setFuzzy()` 更新时间

2. **❌ 禁止直接操作派生字段**
   - `event.startTime` / `event.endTime` / `event.allDay` 是派生字段
   - 由 TimeHub 从 `timeSpec` 自动计算维护
   - **仅用于数据库索引和 Outlook 同步**

3. **✅ 正确的读取方式**
   ```typescript
   // ✅ 正确：使用 useEventTime Hook
   const { timeSpec, resolved } = useEventTime(eventId);
   const displayTime = formatTimeRange(resolved.start, resolved.end);
   
   // ❌ 错误：直接读取派生字段
   const displayTime = formatTimeRange(event.startTime, event.endTime);
   ```

4. **✅ 正确的写入方式**
   ```typescript
   // ✅ 正确：通过 TimeHub 更新（使用 Date 对象）
   TimeHub.setEventTime(eventId, 'range', {
     start: new Date('2025-12-03 10:00:00'),
     end: new Date('2025-12-03 12:00:00')
   });
   
   // ❌ 错误：直接修改事件对象
   event.startTime = '2025-12-03T10:00:00';
   
   // ⚠️ 注意：应用内部所有时间字符串都是本地时间，
   // 格式为 '2025-12-03T10:00:00'（无 Z 后缀）
   ```

### 本 PRD 的代码示例说明

为了便于理解数据流和业务逻辑，本文档中的代码示例使用了 `event.startTime` 等派生字段。

**实际实现时必须遵循以下映射关系：**

| PRD 示例代码 | 实际实现代码 |
|-------------|------------|
| `event.startTime` | `useEventTime(eventId).resolved.start` |
| `event.endTime` | `useEventTime(eventId).resolved.end` |
| `event.allDay` | `useEventTime(eventId).timeSpec.allDay` |
| `parseLocalTimeString(event.startTime)` | `parseLocalTimeString(resolved.start)` |
| `!!event.startTime` | `!!timeSpec && timeSpec.kind !== 'fuzzy'` |

---

## 📢 架构决策记录（2025-11-13）

### 决策 1：TimeLog = Event 集合的时间轴视图

**核心概念澄清：**

| 概念 | 定义 | 说明 |
|------|------|------|
| **TimeLog 页面** | Event 集合的时间轴展示页面 | 左侧：智能搜索 + 日历选择器 + 标签/事件/收藏选择器<br>右侧：连续时间轴显示所有 Events |
| **Event.eventlog** | 单个 Event 内部的日志字段 | Slate JSON 格式，包含 timestamp 分隔线<br>**用户唯一编辑的日志字段** |
| **Event.description** | 自动生成的同步字段 | 从 eventlog 转换的 HTML<br>**仅用于 Outlook 同步，用户界面不显示** |

**TimeLog 页面架构：**
```
┌─────────────────────────────────────────────────────────────┐
│ TimeLog 页面                                                 │
├──────────────────┬──────────────────────────────────────────┤
│ 左侧控制区        │ 右侧时间轴展示区                          │
│ (固定宽度)        │ (flex: 1)                                │
│                  │                                          │
│ ┌──────────────┐ │ ┌──────────────────────────────────────┐ │
│ │ 智能搜索框    │ │ │ 2025-10-18 (周六)                    │ │
│ │ 🔍 搜索...   │ │ ├──────────────────────────────────────┤ │
│ └──────────────┘ │ │ 📅⏰ 10:00 - 12:00 准备演讲稿        │ │
│                  │ │ #工作 #文档编辑                       │ │
│ ┌──────────────┐ │ │ 创建于12h前，距ddl还有2h30min          │ │
│ │ 日历选择器    │ │ │ 上级任务：Project Ace...              │ │
│ │ 2025年 10月  │ │ │                                       │ │
│ │ [日历视图]    │ │ │ ▸ 2025-10-19 10:21:18 ⊙              │ │
│ └──────────────┘ │ │ 处理完了一些出差的logistics，还有...   │ │
│                  │ │                                       │ │
│ ┌──────────────┐ │ │ ▸ 16min later ⊙                       │ │
│ │标签/事件/收藏 │ │ │ 双击"Alt"召唤美桶、格式等...            │ │
│ │选择器(带badge)│ │ │                                       │ │
│ │ #工作 3⃣7⃣     │ │ └──────────────────────────────────────┘ │
│ │ #PRD交流 3⃣7⃣  │ │                                          │
│ └──────────────┘ │ ┌──────────────────────────────────────┐ │
│                  │ │ 📅 14:00 - 16:00 开会讨论             │ │
│                  │ │ ...                                    │ │
└──────────────────┴──────────────────────────────────────────┘
```

### 决策 2：eventlog 是唯一可编辑的日志字段

**字段职责明确划分：**

```typescript
interface Event {
  // === 日志字段（核心） ===
  eventlog?: EventLog;      // 🔥 EventLog 对象（v2.0+）
                            // - 用户在 TimeLog/EventEditModal/PlanManager 中编辑
                            // - slateJson: Slate JSON 字符串（主数据源）
                            // - html: HTML 字符串（同步用）
                            // - plainText: 纯文本（搜索用）
                            // - 包含 timestamp 分隔线（自动插入）
                            // - 支持富文本、附件、标签提及
  
  description?: string;     // 🔥 HTML 字符串（自动生成，已废弃）
                            // - 从 eventlog.html 自动转换
                            // - 仅用于 Outlook 同步
                            // - ❌ 用户界面永远不显示此字段
  
  // === 时间信息 ===
  startTime?: string;       // 计划开始时间（📅 日历 icon 依据）(TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  endTime?: string;         // 计划结束时间 (TimeSpec: 'YYYY-MM-DD HH:mm:ss')
  timeSpec?: TimeSpec;      // 完整时间对象（权威来源）
  
  // === Timer 计时信息 ===
  segments?: TimerSegment[];// 计时片段（⏰ 闹钟 icon 依据）
  isTimer?: boolean;        // 是否为 Timer 创建
  
  // === 其他元数据 ===
  title: string;
  emoji?: string;
  tags?: string[];
  participants?: string[];
  location?: string;
  calendarIds?: string[];
  // ...
}
```

**数据流：**
```
用户编辑（TimeLog/EventEditModal/PlanManager）
              ↓
    Event.eventlog (EventLog 对象) ← 🔥 唯一数据源
         ├─ slateJson: Slate JSON string (主数据)
         ├─ html: HTML string (同步用)
         └─ plainText: 纯文本 (搜索用)
              ↓
      自动转换（后台）
              ↓
   Event.description (HTML) ← 仅用于同步
              ↓
      同步到 Outlook
```

### 决策 3：Timestamp 分隔线记录编辑行为

**🆕 v2.18.0 更新：Block-Level Timestamp 架构**
- **旧方案 (v2.17)**: 使用独立的 `timestamp-divider` 节点（需要折叠逻辑、preline 计算复杂）
- **新方案 (v2.18)**: Timestamp 直接作为 `paragraph` 节点的元数据（`createdAt` 字段）
- **优势**: 更简洁的数据结构，渲染逻辑更清晰，自动迁移兼容旧数据

**Block-Level Timestamp 数据结构：**
```typescript
[
  {
    type: 'paragraph',
    createdAt: 1734268078000,  // Unix milliseconds（自动注入）
    children: [{ text: '处理完了一些出差的logistics...' }]
  },
  {
    type: 'paragraph',
    createdAt: 1734269062000,  // Unix milliseconds（16 分钟后）
    children: [{ text: '双击"Alt"召唤美桶...' }]
  }
]
```

**渲染层处理（ModalSlate/LogSlate）：**
```typescript
// 检测 Block-Level Timestamp
const hasBlockTimestamp = !!(para.createdAt && typeof para.createdAt === 'number');

// 格式化显示（YYYY-MM-DD HH:mm:ss）
const timestampDisplay = hasBlockTimestamp 
  ? formatDateTime(new Date(para.createdAt))
  : null;

// 渲染时间戳（浅灰色，opacity: 0.7）
if (hasBlockTimestamp) {
  return (
    <div style={{ paddingTop: '28px' }}>
      <div style={{ color: '#999', opacity: 0.7, fontSize: '11px' }}>
        {timestampDisplay}
      </div>
      <p>{children}</p>
    </div>
  );
}
```

---

**⚠️ 以下为旧的 timestamp-divider 方案（v2.17，已废弃）：**

**Timestamp 的本质：**
- **不是** Event 的 startTime/endTime（那是计划时间）
- **是** eventlog 内部的编辑时间记录
- 自动插入，标记用户的输入行为

**示例（见 Figma 截图）：**
```
┌─────────────────────────────────────────────┐
│ ▸ 2025-10-19 10:21:18 ⊙                     │ ← 第一个 timestamp（当天首次输入）
│ 处理完了一些出差的logistics，还有报销整理，  │
│ 现在终于可以开工了！                         │
│ 准备先一个提纲去给GPT，看看情况             │
│                                             │
│ ▸ 16min later ⊙                             │ ← 第二个 timestamp（距上次 16 分钟）
│ 双击"Alt"召唤美桶、格式等，点击右下方问号...  │
└─────────────────────────────────────────────┘
```

**Slate JSON 结构（示意）：**
```typescript
[
  {
    type: 'timestamp-divider',
    timestamp: '2025-10-19 10:21:18',  // 本地时间字符串格式
    isFirstOfDay: true,
    children: [{ text: '' }]
  },
  {
    type: 'paragraph',
    children: [{ text: '处理完了一些出差的logistics...' }]
  },
  {
    type: 'timestamp-divider',
    timestamp: '2025-10-19 10:37:42',  // 本地时间字符串格式
    minutesSinceLast: 16,
    children: [{ text: '' }]
  },
  {
    type: 'paragraph',
    children: [{ text: '双击"Alt"召唤美桶...' }]
  }
]
```

### 决策 4: Event 时间状态的 Icon 指示

**时间状态 Icon 规则：**

| Icon | 含义 | 判断条件 | 说明 |
|------|------|----------|------|
| 📅 | 计划时间 | `event.startTime` 存在 | 事先规划的事件 |
| ⏰ | 实际计时 | `event.segments` 存在 | Timer 计时记录 |
| 📅⏰ | 两者都有 | 同时满足上述条件 | 计划内的事情，也实际计时了 |

**示例（见 TimeLog 页面 Figma）：**
```
📅⏰ 10:00 - 12:00 准备演讲稿
  ↑  ↑
  │  └─ 实际计时了（有 segments）
  └──── 有计划时间（有 startTime/endTime）
```

### 决策 5：编辑场景与 Timestamp 显示规则

**eventlog 编辑场景：**

| 页面 | 编辑 eventlog | Timestamp 显示 | 用途 |
|------|--------------|----------------|------|
| **TimeLog 页面** | ✅ 主要编辑位置 | ✅ 完整显示 | 详细日志记录，时间轴展示 |
| **EventEditModal 右侧** | ✅ 次要编辑位置 | ✅ 完整显示 | Slate 编辑区，面积较大 |
| **PlanManager description 行** | ✅ 可编辑 | ❌ 隐藏 | 紧凑显示模式，节省空间 |

**❌ 常见误解纠正：**
- PlanManager 的 "description 行" **不是** Event.description 字段
- 它编辑的是 Event.eventlog，只是隐藏了 timestamp 的显示
- 数据保存时，写入的是 `Event.eventlog`，而非 `Event.description`

### 决策 6：TimeLog 页面的过滤机制

> **最后更新**: 2025-12-07  
> **状态**: ✅ 已实现 - 新增 EventService.getTimelineEvents() 过滤方法

**左侧控制区功能：**

1. **智能搜索**
   - 顶部搜索框，支持关键词搜索 Event 内容
   - 搜索范围：Event 标题、eventlog 内容、tags、participants

2. **日历选择器**
   - 默认显示所有时间的连续时间轴
   - 用户可选择特定日期/时间段
   - 右侧时间轴只显示选中范围的 Events

3. **标签/事件/收藏选择器**
   - 底部筛选区，显示带紫色 badge 的标签列表（如：#工作 3⃣7⃣）
   - 用户点击标签 → 切换选中/取消状态
   - 只显示选中标签的 Events（未选中任何标签时显示全部）
   - **父标签选中** → 整个子标签树的 Events 都显示
   - **父标签取消** → 整个子标签树的 Events 都被过滤

4. **🆕 Timeline 事件过滤（2025-12-07）**
   - **自动过滤附属事件**：排除 `isTimer`/`isTimeLog`/`isOutsideApp` 的系统生成事件
   - **自动过滤无时间的 Plan 事件**：`isPlan=true` 且无 `startTime`/`endTime`/`checkTime` 的任务
   - **自动过滤无时间的 Task 事件**：`isTask=true` 且无时间字段的待办事项
   - **保留有时间的事件**：所有设置了时间的事件（包括 Plan/Task）都会显示
   - **API**: `EventService.getTimelineEvents()` - 替代 `getAllEvents()` 用于 Timeline 渲染

**标签选择器示例：**
```typescript
interface TagSelector {
  selectedTagIds: Set<string>; // 选中的标签（显示这些标签的 Events）
  tagTree: TagHierarchy;
}

// 用户点击标签切换选中状态
const toggleTagSelection = (tagId: string, selectedTags: Set<string>): Set<string> => {
  const newSelected = new Set(selectedTags);
  
  if (newSelected.has(tagId)) {
    // 取消选中：移除该标签及其子标签
    newSelected.delete(tagId);
    const children = getChildTags(tagTree, tagId);
    children.forEach(childId => newSelected.delete(childId));
  } else {
    // 选中：添加该标签及其子标签
    newSelected.add(tagId);
    const children = getChildTags(tagTree, tagId);
    children.forEach(childId => newSelected.add(childId));
  }
  
  return newSelected;
};

// 过滤 Events（只显示选中标签的 Events）
const filterEventsByTags = (
  events: Event[],
  selectedTags: Set<string>
): Event[] => {
  // 未选中任何标签时，显示所有 Events
  if (selectedTags.size === 0) return events;
  
  // 只显示包含选中标签的 Events
  return events.filter(event => 
    event.tags?.some(tagId => selectedTags.has(tagId))
  );
};
```

**🆕 Timeline 过滤实现（2025-12-07）：**

```typescript
// EventService.ts - getTimelineEvents() 方法
static async getTimelineEvents(startDate?: string | Date, endDate?: string | Date): Promise<Event[]> {
  try {
    // 1. 获取所有事件或指定范围的事件
    let events: Event[];
    if (startDate && endDate) {
      events = await this.getEventsByRange(startDate, endDate);
    } else {
      events = await this.getAllEvents();
    }
    
    // 2. 过滤逻辑
    const timelineEvents = events.filter(event => {
      // 2.1 排除附属事件（系统生成的事件）
      if (event.isTimer === true || 
          event.isTimeLog === true || 
          event.isOutsideApp === true) {
        return false;
      }
      
      // 2.2 排除 Plan 页面事件（isPlan=true）无时间的情况
      if (event.isPlan === true) {
        const hasTime = (event.startTime && event.startTime !== '') || 
                       (event.endTime && event.endTime !== '') ||
                       (event.checkTime && event.checkTime !== '');
        if (!hasTime) return false;
      }
      
      // 2.3 Task 事件必须有时间才显示
      if (event.isTask === true) {
        const hasTime = (event.startTime && event.startTime !== '') || 
                       (event.endTime && event.endTime !== '') ||
                       (event.checkTime && event.checkTime !== '');
        if (!hasTime) return false;
      }
      
      return true;
    });
    
    return timelineEvents;
  } catch (error) {
    console.error('[EventService] Failed to get timeline events:', error);
    return [];
  }
}
```

**使用场景：**
```typescript
// TimeLog.tsx - 所有数据加载点
const loadInitialData = async () => {
  const events = await EventService.getTimelineEvents(); // ✅ 使用过滤方法
  setAllEvents(events);
};

// 虚拟滚动 - 历史加载
const historyEvents = await EventService.getTimelineEvents(
  newStart.toISOString(),
  currentStart.toISOString()
);

// 虚拟滚动 - 未来加载
const futureEvents = await EventService.getTimelineEvents(
  currentEnd.toISOString(),
  newEnd.toISOString()
);

// 所有更新操作后刷新
const events = await EventService.getTimelineEvents();
setAllEvents(events);
```

---

## 1. 核心概念

### 1.1 TimeLog 页面 vs Event.eventlog 字段

**TimeLog 页面**：
- **定义**：Event 集合的时间轴展示页面
- **功能**：按时间顺序展示所有 Events，支持智能搜索、日期范围选择和标签过滤
- **布局**：
  - 左侧：智能搜索框 + 日历选择器 + 标签/事件/收藏选择器（带紫色 badge）
  - 右侧：连续时间轴，显示 Event 卡片列表

**Event.eventlog 字段**：
- **定义**：单个 Event 内部的富文本日志字段
- **格式**：Slate JSON 字符串
- **特性**：
  - 包含自动插入的 timestamp 分隔线
  - 支持富文本、附件、标签提及
  - 用户在多个场景编辑（TimeLog/EventEditModal/PlanManager）

**关键区别：**
```
TimeLog 页面 = Event[] 的视图
Event.eventlog = Event 内部的字段
```

### 1.2 数据字段职责划分

> **⚠️ 时间字段架构说明**（2025-12-03 更新）  
> 根据 `TIME_ARCHITECTURE.md`，时间管理由 TimeHub 统一协调：
> - **TimeSpec** 是唯一真相源，包含用户意图和规范化时间
> - **startTime/endTime/allDay** 是派生字段，由 TimeHub 自动维护
> - 应用代码应使用 `useEventTime(eventId)` 读取，`TimeHub.setEventTime()` 写入

| 字段 | 类型 | 用途 | 编辑者 | 显示位置 |
|------|------|------|--------|----------|
| `Event.timeSpec` ⭐ | TimeSpec 对象 | **时间唯一真相源**（用户意图+规范化时间） | TimeHub | - |
| `Event.startTime` 🔧 | 本地时间字符串 | 派生字段：计划开始时间 | TimeHub 自动 | 仅用于索引/同步 |
| `Event.endTime` 🔧 | 本地时间字符串 | 派生字段：计划结束时间 | TimeHub 自动 | 仅用于索引/同步 |
| `Event.allDay` 🔧 | 布尔值 | 派生字段：是否全天 | TimeHub 自动 | 仅用于索引/同步 |
| `Event.segments` | TimerSegment[] | 实际计时记录（⏰ icon） | Timer 系统 | 所有视图 |
| `Event.eventlog` | Slate JSON 字符串 | 用户日志记录（包含 timestamp） | 用户 | TimeLog, EventEditModal, PlanManager |
| `Event.description` | HTML 字符串 | Outlook 同步字段 | 系统自动生成 | ❌ 用户界面不显示 |

**字段使用规范：**
- ✅ **读取时间**: `const { timeSpec, resolved } = useEventTime(eventId);`
- ✅ **显示时间**: `formatTimeRange(resolved.start, resolved.end)`
- ✅ **更新时间**: `TimeHub.setEventTime(eventId, { kind: 'range', start, end })`
- ❌ **禁止直接读取**: `event.startTime` / `event.endTime`（仅供内部使用）
- ❌ **禁止直接修改**: `event.startTime = ...`（破坏架构一致性）

**数据流图：**
```
┌─────────────────────────────────────────────────────────────┐
│ 用户编辑层                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TimeLog 页面    EventEditModal    PlanManager              │
│       │                │                │                   │
│       └────────────────┴────────────────┘                   │
│                        ↓                                    │
│              编辑 Event.eventlog                             │
│                  (Slate JSON)                               │
│                        ↓                                    │
├─────────────────────────────────────────────────────────────┤
│ 自动转换层                                                   │
├─────────────────────────────────────────────────────────────┤
│                        ↓                                    │
│         slateToHtml(Event.eventlog)                         │
│                        ↓                                    │
│           Event.description (HTML)                          │
│                        ↓                                    │
├─────────────────────────────────────────────────────────────┤
│ 同步层                                                       │
├─────────────────────────────────────────────────────────────┤
│                        ↓                                    │
│            同步到 Outlook/Google Calendar                    │
│              (body.content = description)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. TimeLog 页面设计

### 2.0 UI 布局详细设计（基于 Figma 486-2661）

**Figma 设计稿**: [日志页面完整设计](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=486-2661&m=dev，via：http://127.0.0.1:3845/mcp）

#### 2.0.1 三栏布局结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TimeLog 页面 (100vw × 100vh, bg: #FAFAFA)                                    │
├────────────┬──────────────────────────────────────────┬───────────────────────┤
│ 左侧控制区  │ 中间时光日志区                              │ 右侧按钮区            │
│ (280px)    │ (flex: 1, min-width: 600px)              │ (60px)              │
│            │                                          │                     │
│ [复用Plan  │ ┌──────────────────────────────────────┐ │ ┌─────────────────┐ │
│  的Section │ │ 时光日志标题区                          │ │ │  [图标按钮]     │ │
│  选择器]   │ │ - 日期显示: "11月12日 | 周二"           │ │ │  垂直排列        │ │
│            │ │ - 字体: 24px, #1F2937                  │ │ │  间距: 16px     │ │
│            │ └──────────────────────────────────────┘ │ │                 │ │
│            │                                          │ │  • 导出          │ │
│            │ ┌──────────────────────────────────────┐ │ │  • 链接          │ │
│            │ │ Event 卡片 1                          │ │ │  • 更多          │ │
│            │ │ - 白色背景, 圆角12px                   │ │ │                 │ │
│            │ │ - 阴影: 0 1px 3px rgba(0,0,0,0.1)     │ │ │                 │ │
│            │ │ - 间距: 16px                          │ │ └─────────────────┘ │
│            │ └──────────────────────────────────────┘ │                     │
│            │                                          │                     │
│            │ ┌──────────────────────────────────────┐ │                     │
│            │ │ Event 卡片 2                          │ │                     │
│            │ └──────────────────────────────────────┘ │                     │
│            │                                          │                     │
│            │ [滚动区域...]                             │                     │
└────────────┴──────────────────────────────────────────┴───────────────────────┘
```

**布局样式：**
```css
/* 主容器 */
.timelog-page {
  display: flex;
  height: 100vh;
  background: #FAFAFA;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* 左侧控制区（复用 Plan 页面的 Section 选择器）*/
.timelog-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: white;
  border-right: 1px solid #E5E7EB;
  overflow-y: auto;
}

/* 中间时光日志区 */
.timelog-content {
  flex: 1;
  min-width: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 32px 24px;
}

/* 右侧按钮区 */
.timelog-actions {
  width: 60px;
  flex-shrink: 0;
  background: white;
  border-left: 1px solid #E5E7EB;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;
  gap: 16px;
}
```

#### 2.0.2 时光日志标题区

```tsx
{/* 标题区 - 日期显示 */}
<div className="timelog-header">
  <h1 className="timelog-date">
    11月12日 | 周二
  </h1>
</div>
```

**样式细节：**
```css
.timelog-header {
  margin-bottom: 24px;
}

.timelog-date {
  font-size: 24px;
  font-weight: 600;
  color: #1F2937;
  line-height: 32px;
  margin: 0;
}
```

#### 2.0.3 Event 卡片详细设计

**完整卡片结构：**
```tsx
<div className="event-card">
  {/* 1. 顶部状态行 */}
  <div className="event-status-row">
    <div className="event-icons">
      <img src={CalendarIcon} alt="计划" /> {/* 📅 计划时间 */}
      <img src={TimerIcon} alt="实际" />     {/* ⏰ 实际时间 */}
    </div>
    <div className="event-time">14:00 - 16:00</div>
    <button className="event-expand">
      <img src={RightArrowIcon} alt="展开" />
    </button>
  </div>

  {/* 2. 标题行 */}
  <div className="event-title-row">
    <span className="event-emoji">🎯</span>
    <h3 className="event-title">准备演讲稿</h3>
  </div>

  {/* 3. 标签行 */}
  <div className="event-tags">
    <span className="tag">#工作</span>
    <span className="tag">#文档编辑</span>
  </div>

  {/* 4. 元信息行 */}
  <div className="event-metadata">
    <span className="metadata-item">创建于12h前</span>
    <span className="metadata-item">距ddl还有2h30min</span>
  </div>

  {/* 5. 关联任务（如有）*/}
  <div className="event-relations">
    <span className="relation-link">上级任务：Project Ace (5/7)</span>
  </div>

  {/* 6. 日志内容预览 */}
  <div className="event-log-section">
    {/* 时间戳折叠按钮 + 时间 */}
    <div className="timestamp-row">
      <button className="timestamp-toggle">▸</button>
      <span className="timestamp-time">2025-10-19 10:21:18</span>
      <button className="timestamp-options">⊙</button>
    </div>
    
    {/* 日志文本内容 */}
    <div className="log-content">
      处理完了一些出差的logistics，还有一些材料要收集...
    </div>

    {/* 下一个时间戳 */}
    <div className="timestamp-row">
      <button className="timestamp-toggle">▸</button>
      <span className="timestamp-time">16min later</span>
      <button className="timestamp-options">⊙</button>
    </div>
    
    <div className="log-content">
      太强了！居然直接成稿了，让GPT帮我polish了一下...
    </div>
  </div>

  {/* 7. 底部同步状态 */}
  <div className="event-sync-status">
    <img src={OutlookIcon} alt="Outlook" />
    <span>同步至 Outlook</span>
  </div>
</div>
```

**Event 卡片样式细节：**
```css
/* Event 卡片容器 */
.event-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.2s ease;
}

.event-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 1. 顶部状态行 */
.event-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.event-icons {
  display: flex;
  gap: 4px;
}

.event-icons img {
  width: 16px;
  height: 16px;
}

.event-time {
  font-size: 14px;
  font-weight: 500;
  color: #4B5563;
}

.event-expand {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.event-expand:hover {
  opacity: 1;
}

.event-expand img {
  width: 20px;
  height: 20px;
}

/* 2. 标题行 */
.event-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.event-emoji {
  font-size: 24px;
  line-height: 1;
}

.event-title {
  font-size: 18px;
  font-weight: 600;
  color: #1F2937;
  margin: 0;
  line-height: 24px;
}

/* 3. 标签行 */
.event-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.tag {
  font-size: 13px;
  color: #3B82F6;
  background: rgba(59, 130, 246, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 500;
}

/* 4. 元信息行 */
.event-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #6B7280;
}

.metadata-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 5. 关联任务 */
.event-relations {
  margin-bottom: 12px;
  font-size: 13px;
}

.relation-link {
  color: #3B82F6;
  text-decoration: none;
  cursor: pointer;
}

.relation-link:hover {
  text-decoration: underline;
}

/* 6. 日志内容区 */
.event-log-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #F3F4F6;
}

.timestamp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.timestamp-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: #9CA3AF;
  padding: 0;
  width: 16px;
  text-align: center;
}

.timestamp-time {
  font-size: 12px;
  color: #6B7280;
  font-weight: 500;
}

.timestamp-options {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #D1D5DB;
  padding: 0;
  margin-left: auto;
}

.timestamp-options:hover {
  color: #9CA3AF;
}

.log-content {
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
  margin-left: 24px;
  margin-bottom: 12px;
  
  /* 最多显示3行，超出省略 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 7. 同步状态 */
.event-sync-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #F3F4F6;
  font-size: 12px;
  color: #6B7280;
}

.event-sync-status img {
  width: 16px;
  height: 16px;
}
```

#### 2.0.4 右侧按钮区设计

**按钮列表：**
```tsx
<div className="timelog-actions">
  {/* 1. 导出按钮 */}
  <button className="action-button" title="导出">
    <img src="/assets/icons/export.svg" alt="导出" />
  </button>

  {/* 2. 链接按钮 */}
  <button className="action-button" title="复制链接">
    <img src="/assets/icons/link_gray.svg" alt="链接" />
  </button>

  {/* 3. 更多按钮 */}
  <button className="action-button" title="更多选项">
    <img src="/assets/icons/more.svg" alt="更多" />
  </button>
</div>
```

**按钮样式：**
```css
.action-button {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.action-button:hover {
  background: #F3F4F6;
}

.action-button img {
  width: 20px;
  height: 20px;
  opacity: 0.6;
}

.action-button:hover img {
  opacity: 1;
}
```

#### 2.0.5 可用图标资源

**从 `src/assets/icons/` 目录：**
- **日历/时间**: `Time.svg`, `datetime.svg`
- **任务状态**: `task_check.svg`, `task_color.svg`, `task_gray.svg`
- **计时器**: `timer_start.svg`, `timer_check.svg`, `timer_color.svg`
- **DDL**: `ddl_add.svg`, `ddl_checked.svg`, `ddl_warn.svg`
- **同步**: `Sync.svg`, `Outlook.svg`, `Google_Calendar.svg`, `iCloud.svg`
- **操作按钮**: `export.svg`, `link_gray.svg`, `link_color.svg`, `more.svg`
- **展开/折叠**: `right.svg`, `down.svg`, `Arrow_blue.svg`
- **标签**: `Tag.svg`, `tag#.svg`
- **收藏**: `favorite.svg`, `collect.svg`
- **编辑**: `Edit.svg`, `Removestyle.svg`
- **媒体**: `add_pic.svg`, `add_media.svg`, `video.svg`, `voice.svg`

#### 2.0.6 响应式断点

```css
/* 平板尺寸 (≤1024px) */
@media (max-width: 1024px) {
  .timelog-sidebar {
    width: 240px;
  }
  
  .timelog-content {
    min-width: 500px;
  }
}

/* 移动端 (≤768px) */
@media (max-width: 768px) {
  .timelog-page {
    flex-direction: column;
  }
  
  .timelog-sidebar {
    width: 100%;
    height: 200px;
    border-right: none;
    border-bottom: 1px solid #E5E7EB;
  }
  
  .timelog-actions {
    width: 100%;
    height: 60px;
    flex-direction: row;
    border-left: none;
    border-top: 1px solid #E5E7EB;
  }
}
```

---

### 2.1 整体布局

**Figma 设计稿**: [TimeLog 页面（旧版参考）](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=333-1178&m=dev)

**布局结构：**
```tsx
<div className="timelog-page">
  {/* 左侧控制区 */}
  <aside className="timelog-sidebar">
    <CalendarPicker value={selectedDate} onChange={setSelectedDate} />
    <TagFilter tags={allTags} hiddenTags={hiddenTags} onToggle={toggleTag} />
    <EventTypeFilter types={eventTypes} onChange={setEventTypes} />
  </aside>
  
  {/* 右侧时间轴 */}
  <main className="timelog-timeline">
    <h2>{formatDate(selectedDate)}</h2>
    <EventCardList events={filteredEvents} />
  </main>
</div>
```

**样式定义：**
```css
.timelog-page {
  display: flex;
  height: 100vh;
  gap: 24px;
  padding: 24px;
}

.timelog-sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.timelog-timeline {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px;
}
```

---

### 2.1.5 压缩时间轴架构（Compressed Timeline Architecture）⭐

> **实现版本**: v1.0  
> **实现日期**: 2025-12-03  
> **Figma 参考**: [TimeLog v1_日期](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=486-2661&m=dev)

#### 核心设计理念

**设计目标：紧凑 + 完整**
- ✅ **空白日期横向压缩**：多天无事件时，以紧凑的横向日期网格显示（如：11/20, 21, 22...）
- ✅ **事件日期纵向展开**：有事件的日期完整显示，包含日期标题、事件卡片、日志内容
- ✅ **月份标题置顶**：使用 CSS `position: sticky` 实现月份标题悬浮置顶
- ✅ **双向无限滚动**：支持向前加载历史日期，向后加载未来日期

**与 Figma 设计对应关系：**

| Figma 元素 | 实现方式 | 说明 |
|-----------|---------|------|
| 月份标题（11月） | `.timeline-month-header` + `position: sticky` | z-index: 11，白色背景 |
| 空白日期网格 | `CompressedDateRange` 组件 | 横向 flex 布局，周分隔线 |
| 日期标题（11月23日 周六） | `.timeline-date-header` + `position: sticky` | z-index: 10，白色背景 |
| 事件卡片 | `.timeline-event-wrapper` | 包含时间、标题、标签、日志 |
| 时间轴线（preline） | 分段独立架构 | 月份线、事件线、间隙线、空日线 |

---

#### 时间线段类型（Timeline Segments）

时间轴由三种类型的段组成，按时间顺序交替出现：

```typescript
type TimelineSegment = 
  | { type: 'month-header'; dateKey: string; month: string }
  | { type: 'compressed'; dateKey: string; month: string; compressedDates: string[] }
  | { type: 'events'; dateKey: string; events: Event[] };
```

**1. Month Header 段（月份标题）**

```tsx
{segment.type === 'month-header' && (
  <div key={segment.dateKey} className="timeline-month-header">
    <div className="timeline-month-info">{segment.month}</div>
    {/* 如果后面是 compressed 段，内嵌 CompressedDateRange */}
    {nextSegment?.type === 'compressed' && (
      <CompressedDateRange
        startDate={nextSegment.compressedDates[0]}
        endDate={nextSegment.compressedDates[nextSegment.compressedDates.length - 1]}
      />
    )}
  </div>
)}
```

**特点：**
- 总是在月份首次出现或压缩段前插入
- 使用 `position: sticky; top: 0; z-index: 11` 实现悬浮置顶
- 压缩段的日期网格内嵌在月份标题内，共享同一个 preline

**2. Compressed 段（空白日期压缩显示）**

```tsx
{segment.type === 'compressed' && (
  // 空段落，日期网格已在上方 month-header 内渲染
  null
)}
```

**特点：**
- 代表多天（>1 天）连续无事件的日期
- 日期以横向网格显示，每行最多 7 天（一周）
- 周日和周一之间有 1px 宽、16px 高的分隔线
- 跨月时自动分割为多个段，每段都有独立的月份标题

**3. Events 段（有事件的日期）**

```tsx
{segment.type === 'events' && (
  <div key={segment.dateKey} className="timeline-date-group">
    {/* 日期标题（sticky） */}
    <div className="timeline-date-header">
      <div className="timeline-date-title">{formatDateDisplay(segment.dateKey)}</div>
    </div>
    
    {/* 空日 preline（单独 1 天无事件时显示） */}
    {segment.events.length === 0 && (
      <div className="empty-day-preline">
        <div className="empty-day-line"></div>
      </div>
    )}
    
    {/* 事件列表 */}
    {segment.events.map((event, index) => (
      <div key={event.id} className="timeline-event-wrapper">
        {/* 事件 preline */}
        <div className="timeline-line"></div>
        
        {/* 事件卡片 */}
        <EventCard event={event} />
        
        {/* TimeGap（智能拉链） */}
        {index < segment.events.length - 1 && shouldShowGap(event, nextEvent) && (
          <TimeGap
            prevEventEndTime={event.endTime}
            nextEventStartTime={nextEvent.startTime}
            onCreateEvent={handleCreateEvent}
          />
        )}
      </div>
    ))}
  </div>
)}
```

**特点：**
- 包含日期标题（sticky，z-index: 10）和事件列表
- 每个事件有独立的 preline（灰色实线，2px 宽）
- 单独 1 天无事件时，显示完整日期标题 + 短 preline（40px）
- 事件之间如有空白时间，插入 TimeGap 组件（智能拉链）

**🆕 TimeGap 渲染策略（2025-12-07）：**

| 场景 | 渲染策略 | 说明 |
|-----|---------|------|
| **压缩日期段（行陈列）** | ❌ 不渲染 TimeGap | 性能优化，避免大量组件实例化 |
| **用户点击压缩日期** | ✅ 展开 + 完整 TimeGap | 显示完整日期组件（00:00-23:59） |
| **今天（无事件）** | ✅ 完整 TimeGap | 00:00-23:59，支持任意时间创建 |
| **今天（有事件）** | ✅ 首/间/尾 TimeGap | 第一个前 + 事件间 + 最后后 |
| **非今天（无事件）** | ⚠️ 短虚线衔接 | 40px empty-day-preline |
| **非今天（有事件）** | ✅ 仅事件间 TimeGap | 不在首尾渲染（性能优化） |

```typescript
// TimeLog.tsx - TimeGap 渲染实现
const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

// 1. 压缩日期段点击展开
<CompressedDateRange
  startDate={segment.startDate}
  endDate={segment.endDate}
  onDateClick={(date) => {
    const dateKey = date.toISOString().split('T')[0];
    setExpandedDates(prev => new Set(prev).add(dateKey));
  }}
/>

// 2. 展开的空白日期显示完整 TimeGap
{expandedDates.has(dateKey) && dateEvents.length === 0 && (
  <TimeGap
    prevEventEndTime={undefined}
    nextEventStartTime={undefined}
    onCreateEvent={handleCreateEvent}
    onCreateNote={handleCreateNote}
    onUploadAttachment={handleUploadAttachment}
  />
)}

// 3. 今天总是显示 TimeGap
{isToday && dateEvents.length === 0 && (
  <TimeGap
    prevEventEndTime={undefined}
    nextEventStartTime={undefined}
    onCreateEvent={handleCreateEvent}
    onCreateNote={handleCreateNote}
    onUploadAttachment={handleUploadAttachment}
  />
)}

// 4. 事件之间的 TimeGap
{(isToday || nextEvent) && (
  <TimeGap
    prevEventEndTime={event.endTime ? new Date(event.endTime) : undefined}
    nextEventStartTime={nextEvent?.startTime ? new Date(nextEvent.startTime) : undefined}
    onCreateEvent={handleCreateEvent}
    onCreateNote={handleCreateNote}
    onUploadAttachment={handleUploadAttachment}
  />
)}
```

---

#### 分段 Preline 架构（Segmented Preline）

**设计决策：** 从单一连续 preline 改为分段独立 preline，避免内容重叠问题。

**五种 Preline 类型：**

| 类型 | 所属元素 | 样式 | 高度 | 说明 |
|-----|---------|------|------|------|
| **月份 Preline** | `.timeline-month-header::before` | 灰色实线 | 覆盖月份标题 + 压缩日期段 | 左对齐 15px |
| **事件 Preline** | `.timeline-line` | 灰色实线 | 单个事件高度 | 左对齐 19px |
| **间隙 Preline** | `.time-gap-axis` | 灰色虚线（hover 变蓝色实线） | TimeGap 高度 | 左对齐 20px，支持鼠标交互 |
| **空日 Preline** | `.empty-day-line` | 灰色实线 | 40px（短桥接线） | 左对齐 19px，仅非今天使用 |
| **🆕 展开日期 Preline** | `.time-gap-axis` | 灰色虚线 | 完整 TimeGap | 点击压缩日期后显示 |

**CSS 实现：**

```css
/* 1. 月份 Preline */
.timeline-month-header {
  position: sticky;
  top: 0;
  z-index: 11;
  background: white;
  padding: 16px 0 0 0;
  margin: 0;
}

.timeline-month-header::before {
  content: '';
  position: absolute;
  left: 15px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #E5E7EB;
  z-index: 1;
}

.timeline-month-info {
  position: relative;
  z-index: 2;
  background: white;
  display: inline-block;
  padding: 8px 12px;
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin-left: 40px;
  min-width: 40px;
}

/* 2. 事件 Preline */
.timeline-event-wrapper {
  position: relative;
  padding: 12px 0 0 0;
  margin: 0;
}

.timeline-line {
  position: absolute;
  left: 19px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #E5E7EB;
  z-index: 1;
}

/* 3. 间隙 Preline（虚线） */
.time-gap {
  position: relative;
  margin: 0;
  padding: 0;
}

.time-gap-axis {
  position: absolute;
  left: 20px;
  top: 0;
  bottom: 0;
  width: 2px;
  border-left: 2px dashed #CBD5E1;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.time-gap-axis.active {
  border-left-style: solid;
  border-left-color: #3B82F6;
  opacity: 1;
}

/* 4. 空日 Preline（短桥接线） */
.empty-day-preline {
  display: flex;
  align-items: flex-start;
  margin: 12px 0;
  padding: 0;
}

.empty-day-line {
  width: 2px;
  height: 40px;
  background: #E5E7EB;
  margin-left: 19px;
}
```

**视觉效果：**
- 所有 preline 左对齐（15-20px 范围内，视觉连续）
- 月份段覆盖整个月份标题 + 压缩日期区域
- 事件段独立，互不重叠
- 间隙段虚线，hover 时变蓝色实线
- 空日段短线，桥接单独空白日

---

#### EventLog 段落 Preline 架构

**设计决策：** EventLog 内容在不同页面显示时，preline 行为需要差异化控制。

**📍 用户需求（2025-12-08）：**
> "在 timelog 页面的时候，让 timestamp 与文字左对齐显示，取消 Event 段落的 preline"

**🆕 v2.18.0 更新：Block-Level Timestamp 渲染**
- **新架构**: Timestamp 作为 `paragraph.createdAt` 元数据（Unix milliseconds）
- **渲染方式**: ModalSlate/LogSlate 在 `renderElement()` 中检测 `createdAt` 字段
- **显示格式**: YYYY-MM-DD HH:mm:ss（浅灰色，opacity: 0.7）

**实现方案：** LogSlate 组件添加 `showPreline` 属性控制

**三种渲染模式：**

| 页面 | showPreline | Timestamp 来源 | Timestamp 样式 | 段落 Preline | 说明 |
|------|-------------|---------------|---------------|--------------|------|
| **TimeLog 页面** | `false` | `paragraph.createdAt` | 左对齐，浅灰色文本（无 preline） | ❌ 无 | 干净的时间轴视图，避免视觉混乱 |
| **LogTab (日志窗口)** | `true` (默认) | `paragraph.createdAt` | 浅灰色时间戳 + preline | ✅ 有 | 完整时间线显示，带垂直连接线 |
| **ModalSlate (弹窗编辑)** | `true` (默认) | `paragraph.createdAt` | 浅灰色时间戳 + preline | ✅ 有 | 与 LogTab 保持一致的编辑体验 |

**LogSlate 组件接口：**

```typescript
interface LogSlateProps {
  // ... 其他属性
  showPreline?: boolean;  // 控制是否显示段落前导线，默认 true
}

function LogSlate({ 
  showPreline = true,  // 默认开启 preline（LogTab/ModalSlate 模式）
  // ... 其他参数
}: LogSlateProps) {
  // ...
  
  const renderElement = useCallback(
    (props: RenderElementProps) => {
      const { attributes, children, element } = props;

      switch (element.type) {
        case 'paragraph':
          const para = element as ParagraphElement;
          const hasBlockTimestamp = !!(para.createdAt && typeof para.createdAt === 'number');

          if (!showPreline && hasBlockTimestamp) {
            // TimeLog 模式：左对齐浅灰色时间戳，无 preline
            return (
              <div style={{ paddingTop: '28px' }}>
                <div style={{ 
                  color: '#999', 
                  opacity: 0.7, 
                  fontSize: '11px',
                  marginBottom: '4px'
                }}>
                  {formatDateTime(new Date(para.createdAt))}
                </div>
                <p {...attributes}>{children}</p>
              </div>
            );
          }

          if (showPreline && hasBlockTimestamp) {
            // LogTab/ModalSlate 模式：时间戳 + preline
            return (
              <div style={{ paddingTop: '28px', position: 'relative' }}>
                <div style={{ 
                  color: '#999', 
                  opacity: 0.7, 
                  fontSize: '11px',
                  marginBottom: '4px'
                }}>
                  {formatDateTime(new Date(para.createdAt))}
                </div>
                {/* Preline 逻辑：连接到前一个有时间戳的段落 */}
                <div className="preline" />
                <p {...attributes}>{children}</p>
              </div>
            );
          }

          // 无时间戳的段落
          return <p {...attributes}>{children}</p>;
          
        default:
          return <p {...attributes}>{children}</p>;
      }
    },
    [showPreline]  // 依赖 showPreline 变化重新渲染
  );
}
```

**TimeLog 页面使用示例：**

```typescript
// TimeLog.tsx (Line 2365)
<LogSlate
  value={localEventlog}
  onChange={handleEventlogChange}
  placeholder="记录工作日志..."
  showPreline={false}  // ⚠️ TimeLog 模式：关闭 preline
/>
```

**LogTab 页面使用示例：**

```typescript
// LogTab.tsx (Line 227)
<LogSlate
  value={parsedEventlog}
  onChange={handleEventlogChange}
  placeholder="记录工作日志..."
  // showPreline 默认 true，无需显式传递
/>
```

**CSS 样式对比：**

```css
/* TimeLog 模式（showPreline=false） - 段落样式 */
p {
  /* 无特殊样式，标准段落 */
  margin: 4px 0;
  line-height: 1.6;
}

/* LogTab 模式（showPreline=true） - 段落样式 */
.slate-paragraph-with-preline {
  position: relative;
  padding-left: 24px;  /* 为 preline 留出空间 */
  margin: 4px 0;
}

.slate-paragraph-with-preline::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #E5E7EB;  /* 灰色前导线 */
}
```

**技术细节：**

1. **needsPreline 逻辑（仅 showPreline=true 时生效）：**
   ```typescript
   const needsPreline = 
     showPreline &&
     !isAfterTimestamp &&
     !isFirstParagraph &&
     !isEmpty;
   ```

2. **Timestamp 渲染差异：**
   - TimeLog 模式：纯文本，11px，灰色（#9CA3AF）
   - LogTab 模式：TimestampDividerElement 组件，带折叠按钮、相对时间、选项菜单

3. **性能优化：**
   - `renderElement` 依赖 `showPreline`，值变化时重新渲染
   - 避免不必要的 DOM 计算（TimeLog 模式跳过 needsPreline 判断）

**设计理由：**

| 场景 | 需求 | 解决方案 |
|------|------|---------|
| TimeLog 大量事件 | 简洁清晰，减少视觉噪音 | 关闭 preline，timestamp 左对齐 |
| LogTab 单事件 | 完整时间线，详细编辑 | 开启 preline，使用 TimestampDividerElement |
| ModalSlate 编辑 | 与 LogTab 一致的编辑体验 | 开启 preline，保持交互一致性 |

**相关文件：**
- `src/components/EventEditModal/LogSlate.tsx` (Lines 28-44, 45-60, 263-370)
- `src/components/TimeLog.tsx` (Line 2365)
- `src/components/EventEditModal/LogTab.tsx` (Line 227)
- `src/components/EventEditModal/TimestampDividerElement.tsx`
- `src/services/EventService.ts` - `normalizeEventLog`, `cleanEmptyTimestampPairs`

---

#### EventLog 空时间戳自动清理

**📍 用户需求（2025-12-15）：**
> "为什么这个 event 里面还是有空的时间戳？"

**问题描述：** 用户在编辑 EventLog 时，可能产生以下两种空时间戳场景：
1. **纯文本粘贴**：从 Outlook/外部复制时间戳 + 空行
2. **编辑器操作**：删除时间戳后的内容，但时间戳本身未删除

**清理策略：** 自动删除「时间戳 + 空段落」对

**实现架构：**

```typescript
// EventService.ts

/**
 * 清理空的时间戳+段落对
 * 如果时间戳后面紧跟一个空段落，删除这两个节点
 */
private static cleanEmptyTimestampPairs(slateNodes: any[]): any[] {
  const cleanedNodes: any[] = [];
  
  for (let i = 0; i < slateNodes.length; i++) {
    const currentNode = slateNodes[i];
    const nextNode = slateNodes[i + 1];
    
    // 检查是否是时间戳节点
    if (currentNode.type === 'timestamp-divider') {
      // 检查下一个节点是否是空段落
      if (nextNode && nextNode.type === 'paragraph') {
        const paragraphText = nextNode.children
          ?.map((child: any) => child.text || '')
          .join('')
          .trim();
        
        if (!paragraphText || paragraphText === '---') {
          // 跳过当前时间戳和下一个空段落（包括只有"---"的段落）
          i++; // 跳过空段落
          continue;
        }
      }
    }
    
    // 保留非空节点
    cleanedNodes.push(currentNode);
  }
  
  // 确保至少有一个节点
  if (cleanedNodes.length === 0) {
    cleanedNodes.push({
      type: 'paragraph',
      children: [{ text: '' }]
    });
  }
  
  return cleanedNodes;
}
```

**调用时机：**

| 调用位置 | 触发场景 | 处理内容 |
|---------|---------|---------|
| `parseTextWithTimestamps()` | 纯文本 → Slate JSON 转换 | 从 HTML/文本解析时清理空段落 |
| `normalizeEventLog()` 早期退出 | 已规范化内容检查 | 处理用户在编辑器中直接创建的空段落 |

**清理规则：**

```typescript
// ❌ 被删除的模式
[
  { type: 'timestamp-divider', timestamp: '2025-12-07 02:05:42' },
  { type: 'paragraph', children: [{ text: '' }] },  // 空段落
]

// ❌ 被删除的模式（只有分隔线）
[
  { type: 'timestamp-divider', timestamp: '2025-12-07 02:05:42' },
  { type: 'paragraph', children: [{ text: '---' }] },  // 只有分隔线
]

// ✅ 保留的模式（有内容）
[
  { type: 'timestamp-divider', timestamp: '2025-12-07 02:05:42' },
  { type: 'paragraph', children: [{ text: '测试内容' }] },  // 有实际内容
]
```

**normalizeEventLog 集成：**

```typescript
public static normalizeEventLog(
  eventlogInput: EventLog | string | null | undefined,
  fallbackDescription?: string
): EventLog {
  // ... 早期退出检查
  
  if (hasTimestampDivider && !hasParagraphTimestamp) {
    // 🔧 清理空的时间戳+段落对（用户在编辑器中直接创建的）
    const cleanedNodes = this.cleanEmptyTimestampPairs(slateNodes);
    if (cleanedNodes.length !== slateNodes.length) {
      console.log('🗑️ [normalizeEventLog] 清理了空的时间戳+段落对:', {
        before: slateNodes.length,
        after: cleanedNodes.length
      });
      return this.convertSlateJsonToEventLog(JSON.stringify(cleanedNodes));
    }
    return eventLog; // 已经规范化，跳过解析
  }
  
  // ... 其他逻辑
}
```

**parseTextWithTimestamps 集成：**

```typescript
private static parseTextWithTimestamps(text: string): any[] {
  const slateNodes: any[] = [];
  
  // ... 解析时间戳和段落
  
  // 🔧 清理空的时间戳+段落对
  return this.cleanEmptyTimestampPairs(slateNodes);
}
```

**用户体验：**

| 场景 | 操作前 | 操作后 |
|------|--------|--------|
| Outlook 同步 | `2025-12-07 02:05:42\n\n---\n\n由 🟣 4DNote 创建...` | 空时间戳被自动删除，只保留有内容的部分 |
| 编辑器删除内容 | 用户删除时间戳后的文字 → 空段落残留 | 下次 `normalizeEventLog` 时自动清理 |
| 批量加载 | 100 个事件中有 20 个空时间戳 | 加载时自动清理，无需手动处理 |

**技术要点：**

1. **递归清理**：循环检查所有时间戳+段落对，而非单次清理
2. **边界保护**：确保至少保留一个空段落节点（Slate 编辑器要求）
3. **特殊字符处理**：`---` 分隔线也视为空内容
4. **性能优化**：只在节点数量变化时才重新生成 EventLog 对象

**相关文件：**
- `src/services/EventService.ts` (Lines 2577-2619: cleanEmptyTimestampPairs)
- `src/services/EventService.ts` (Line 2250: normalizeEventLog 调用)
- `src/services/EventService.ts` (Line 2687: parseTextWithTimestamps 调用)
- `src/pages/LogTab.tsx` (Line 1068: handleSave 保存前清理)

---

#### EventLog 签名管理

**📍 用户需求（2025-12-15）：**
> "我希望 normalizeEventLog 还能添加一个功能，就是管理签名 '---\n由 🔮 4DNote 创建于 2025-12-07 02:05:42'，我们内部不显示签名，只有同步到 Outlook 的内容需要签名。"

**设计原则：** 签名只用于外部同步，4DNote 内部存储和显示不包含签名。

**🔥 签名管理策略（2025-12-15 更新）：**

| 字段 | 是否包含签名 | 管理位置 | 说明 |
|------|------------|---------|------|
| **Event.eventlog** | ❌ 无 | `EventService.cleanEmptyTimestampPairs()` | 内部显示字段，永不包含签名 |
| **Event.description** | ✅ 有 | `EventService.maintainDescriptionSignature()` | 同步字段，自动维护签名 |

**核心原则：**
1. **EventLog（内部）**：`normalizeEventLog` 调用 `cleanEmptyTimestampPairs` 移除所有签名
2. **Description（同步）**：`normalizeEvent` 和 `updateEvent` 自动调用 `maintainDescriptionSignature` 添加/更新签名

**签名格式规范：**

| 场景 | 签名格式 | emoji | 时间格式 |
|------|---------|-------|---------|
| 4DNote 创建 | `由 🔮 4DNote 创建于 YYYY-MM-DD HH:mm:ss` | 🔮 | `YYYY-MM-DD HH:mm:ss` |
| Outlook 创建 | `由 📧 Outlook 创建于 YYYY-MM-DD HH:mm:ss` | 📧 | `YYYY-MM-DD HH:mm:ss` |
| 4DNote 编辑 | `由 🔮 4DNote 最后编辑于 YYYY-MM-DD HH:mm:ss` | 🔮 | `YYYY-MM-DD HH:mm:ss` |
| Outlook 编辑 | `由 📧 Outlook 编辑于 YYYY-MM-DD HH:mm:ss` | 📧 | `YYYY-MM-DD HH:mm:ss` |

**签名结构：**

```
[正文内容]

---
由 🔮 4DNote 创建于 2025-12-07 02:05:42
```

**签名生命周期：**

| 阶段 | EventLog | Description | 处理位置 | 说明 |
|------|---------|------------|---------|------|
| **创建事件** | ❌ 无签名 | ✅ 自动添加 | `EventService.normalizeEvent()` | description 包含"由 XX 创建于" |
| **更新事件** | ❌ 移除签名 | ✅ 更新签名 | `EventService.updateEvent()` | description 更新"最后修改于" |
| **内部显示** | ❌ 无签名 | 不显示 | LogTab/TimeLog/ModalSlate | UI 只显示 eventlog |
| **同步到 Outlook** | N/A | ✅ 包含签名 | `ActionBasedSyncManager` | body.content = description |
| **从 Outlook 拉取** | ❌ 移除签名 | ✅ 重新生成签名 | `EventService.normalizeEventLog()` + `updateEvent()` | 清理旧签名，生成新签名 |

**实现架构：**

```typescript
// 1. EventService.cleanEmptyTimestampPairs() - 从 EventLog 移除签名
private static cleanEmptyTimestampPairs(slateNodes: any[]): any[] {
  const cleanedNodes: any[] = [];
  
  // 签名模式：匹配 "由 [emoji] 4DNote/Outlook 创建/编辑于 YYYY-MM-DD HH:mm:ss"
  const signaturePattern = /^(?:---\s*)?由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*(?:创建于|编辑于|最后修辑于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
  
  for (let i = 0; i < slateNodes.length; i++) {
    const currentNode = slateNodes[i];
    
    // 检查 1: 移除签名段落
    if (currentNode.type === 'paragraph') {
      const paragraphText = currentNode.children
        ?.map((child: any) => child.text || '')
        .join('')
        .trim();
      
      if (signaturePattern.test(paragraphText)) {
        console.log('🗑️ 移除签名段落:', paragraphText.substring(0, 50));
        continue; // 跳过签名段落
      }
    }
    
    // 保留非签名节点
    cleanedNodes.push(currentNode);
  }
  
  return cleanedNodes;
}

// 2. EventService.maintainDescriptionSignature() - 为 Description 维护签名
private static maintainDescriptionSignature(coreContent: string, event: Partial<Event>): string {
  const lines: string[] = [];
  
  // 1. 添加核心内容
  if (coreContent && coreContent.trim()) {
    lines.push(coreContent.trim());
    lines.push(''); // 空行
  }
  
  // 2. 添加分隔线
  lines.push('---');
  
  // 3. 确定创建来源和时间
  const isLocalCreated = event.fourDNoteSource === true || event.source === 'local' || !event.source;
  const createSource = isLocalCreated ? '🔮 4DNote' : '📧 Outlook';
  const createTime = event.createdAt || formatTimeForStorage(new Date());
  
  lines.push(`由 ${createSource} 创建于 ${createTime}`);
  
  // 4. 添加修改信息（如果有）
  if (event.updatedAt && event.updatedAt !== event.createdAt) {
    const modifyTime = event.updatedAt;
    lines.push(`最后修改于 ${modifyTime}`);
  }
  
  return lines.join('\n');
}

// 3. EventService.extractCoreContentFromDescription() - 从 Description 提取核心内容
private static extractCoreContentFromDescription(description: string): string {
  if (!description) return '';
  
  // 移除签名部分（支持多种格式）
  let core = description
    // 移除完整签名块（---\n由...创建于...\n最后修改于...）
    .replace(/\n---\n由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*创建于\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*$/i, '')
    // 移除单行签名
    .replace(/\n由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*(?:创建于|编辑于|最后修改于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/gi, '');
  
  return core.trim();
}

// 4. EventService.normalizeEvent() - 创建时自动添加签名
private static normalizeEvent(event: Partial<Event>): Event {
  // ... 规范化 eventlog
  const normalizedEventLog = this.normalizeEventLog(event.eventlog, event.description);
  
  // 从 eventlog 提取核心内容 + 添加签名
  const coreContent = normalizedEventLog.plainText || '';
  const eventMeta = {
    ...event,
    createdAt: event.createdAt || formatTimeForStorage(new Date()),
    updatedAt: event.updatedAt || formatTimeForStorage(new Date())
  };
  const normalizedDescription = this.maintainDescriptionSignature(coreContent, eventMeta);
  
  return {
    ...event,
    eventlog: normalizedEventLog,
    description: normalizedDescription,  // 包含签名
    // ...
  };
}

// 5. EventService.updateEvent() - 更新时维护签名
static async updateEvent(eventId: string, updates: Partial<Event>): Promise<...> {
  // 场景1: eventlog 有变化 → 同步到 description（带签名）
  if (updates.eventlog !== undefined) {
    const normalizedEventLog = this.normalizeEventLog(updates.eventlog);
    updatesWithSync.eventlog = normalizedEventLog;
    
    if (updates.description === undefined) {
      const coreContent = normalizedEventLog.plainText || '';
      const eventMeta = {
        ...originalEvent,
        ...updates,
        updatedAt: formatTimeForStorage(new Date())
      };
      updatesWithSync.description = this.maintainDescriptionSignature(coreContent, eventMeta);
    }
  }
  
  // 场景2: description 有变化 → 移除旧签名，生成新签名
  else if (updates.description !== undefined) {
    const coreContent = this.extractCoreContentFromDescription(updates.description);
    const normalizedEventLog = this.normalizeEventLog(coreContent);
    updatesWithSync.eventlog = normalizedEventLog;
    
    const eventMeta = {
      ...originalEvent,
      ...updates,
      updatedAt: formatTimeForStorage(new Date())
    };
    updatesWithSync.description = this.maintainDescriptionSignature(coreContent, eventMeta);
  }
}
```

**LogTab.handleSave() 不再需要签名处理：**

```typescript
const handleSave = async () => {
  // Step 0b: 准备 eventlog（Slate JSON 字符串）
  // ✅ 只需清理空时间戳，签名由 EventService 自动管理
  let cleanedEventlog = formData.eventlog || [];
  try {
    const normalized = (EventService as any).normalizeEventLog(
      { slateJson: JSON.stringify(cleanedEventlog) }
    );
    cleanedEventlog = JSON.parse(normalized.slateJson);
    // 签名已被 cleanEmptyTimestampPairs 移除
  } catch (error) {
    console.error('❌ eventlog 清理失败:', error);
  }
  const currentEventlogJson = JSON.stringify(cleanedEventlog);
  
  // ... 调用 EventHub.updateFields()
  // EventHub → EventService.updateEvent() → maintainDescriptionSignature()
  // description 自动添加/更新签名
}
```

**数据流示意图：**

```
┌─────────────────────────────────────────────────────────┐
│ 用户编辑 EventLog                                         │
│ "2025-12-07 02:05:42\n测试内容"                          │
└──────────────┬──────────────────────────────────────────┘
               │
               │ handleSave()
               │ → normalizeEventLog()
               │ → cleanEmptyTimestampPairs()  // 移除签名
               ↓
┌─────────────────────────────────────────────────────────┐
│ Event.eventlog (Slate JSON)                             │
│ ✅ 无签名                                                │
│ [                                                       │
│   { type: 'timestamp-divider', timestamp: '...' },      │
│   { type: 'paragraph', children: [{ text: '测试内容' }] }│
│ ]                                                       │
└──────────────┬──────────────────────────────────────────┘
               │
               │ updateEvent()
               │ → maintainDescriptionSignature()  // 添加签名
               ↓
┌─────────────────────────────────────────────────────────┐
│ Event.description (String)                              │
│ ✅ 包含签名                                              │
│ "2025-12-07 02:05:42\n测试内容\n\n---\n                 │
│  由 🔮 4DNote 创建于 2025-12-07 02:05:42\n              │
│  最后修改于 2025-12-15 14:30:25"                         │
└──────────────┬──────────────────────────────────────────┘
               │
               │ 同步到 Outlook
               │ → ActionBasedSyncManager.createOutlookEvent()
               ↓
┌─────────────────────────────────────────────────────────┐
│ Outlook Event body.content                              │
│ = Event.description（直接使用，已包含签名）               │
└──────────────┬──────────────────────────────────────────┘
               │
               │ 从 Outlook 拉取更新
               │ → fetchOutlookChanges()
               │ → cleanupOutlookHtml()  // 移除 HTML 中的签名
               │ → updateEvent()
               │ → maintainDescriptionSignature()  // 重新生成签名
               ↓
┌─────────────────────────────────────────────────────────┐
│ 4DNote 内部存储                                          │
│ eventlog: ❌ 无签名                                      │
│ description: ✅ 有签名（规范格式）                        │
└─────────────────────────────────────────────────────────┘
```

**签名示例：**

```
// 场景 1: 本地创建的新事件
测试内容

---
由 🔮 4DNote 创建于 2025-12-07 02:05:42

// 场景 2: 本地创建并修改
测试内容

---
由 🔮 4DNote 创建于 2025-12-07 02:05:42
最后修改于 2025-12-15 14:30:25

// 场景 3: Outlook 创建的事件
会议记录

---
由 📧 Outlook 创建于 2025-12-07 10:00:00

// 场景 4: Outlook 创建，4DNote 修改
会议记录

---
由 📧 Outlook 创建于 2025-12-07 10:00:00
最后修改于 2025-12-15 14:30:25
```

**关键技术点：**

1. **签名移除时机**：每次 `normalizeEventLog` 调用时，`cleanEmptyTimestampPairs` 自动移除所有签名段落
2. **签名添加时机**：每次 `normalizeEvent`（创建）或 `updateEvent`（更新）时，自动维护 description 签名
3. **双向同步保证**：
   - eventlog → description: 提取核心内容 + 添加签名
   - description → eventlog: 移除签名 + 规范化内容
4. **来源识别**：通过 `fourDNoteSource` 和 `source` 字段判断创建来源（4DNote/Outlook）
5. **修改时间追踪**：通过 `createdAt` 和 `updatedAt` 判断是否需要显示"最后修改于"

**用户体验：**

| 场景 | 用户操作 | EventLog | Description | 结果 |
|------|---------|---------|------------|------|
| 创建事件 | 编辑 EventLog → 保存 | 无签名 | 自动添加签名 | 内部干净，同步完整 |
| 修改事件 | 编辑 EventLog → 保存 | 签名自动移除 | 签名自动更新 | updatedAt 更新 |
| 查看 TimeLog | 打开页面 | 显示纯内容 | 不显示 | 界面永不显示签名 |
| 同步到 Outlook | 后台自动 | N/A | body.content = description | Outlook 显示完整签名 |
| 从 Outlook 拉取 | 后台自动 | 签名被移除 | 签名被重新生成 | 数据格式统一 |

**相关文件：**
- `src/services/EventService.ts` (Lines 2720-2789: 签名管理方法)
- `src/services/EventService.ts` (Lines 2577-2624: cleanEmptyTimestampPairs - 移除签名)
- `src/services/EventService.ts` (Lines 840-892: updateEvent - 更新时维护签名)
- `src/services/EventService.ts` (Lines 2488-2512: normalizeEvent - 创建时添加签名)
- `src/services/EventService.ts` (Lines 2796-2801: cleanupOutlookHtml - 清理 HTML 签名)
- `src/pages/LogTab.tsx` (Lines 1068-1083: handleSave - 签名由 EventService 自动管理)

---

#### 空白日期智能显示逻辑

**规则：**

| 连续空白天数 | 显示方式 | Preline 类型 | 说明 |
|------------|---------|-------------|------|
| **1 天** | 完整日期标题 + 短 preline | Empty Day Line (40px) | 避免"孤零零"的日期被压缩 |
| **2+ 天** | 月份标题 + 横向压缩网格 | Month Preline | 节省空间 |

**代码实现：**

```typescript
// 检测连续空白日期
let compressedStart = new Date(currentDate);
while (currentDate <= timelineRange.end && eventsByDate.get(dateKey).length === 0) {
  currentDate.setDate(currentDate.getDate() + 1);
}
const compressedEnd = new Date(currentDate);
compressedEnd.setDate(compressedEnd.getDate() - 1);

const daysDiff = Math.floor((compressedEnd.getTime() - compressedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

if (daysDiff === 1) {
  // 单独 1 天：完整显示
  segments.push({
    type: 'events',
    dateKey: singleDateKey,
    events: [], // 空事件列表，触发 empty-day-preline 渲染
  });
} else {
  // 多天：压缩显示
  segments.push({
    type: 'month-header',
    dateKey: compressedDates[0],
    month: monthKey,
  });
  segments.push({
    type: 'compressed',
    dateKey: compressedDates[0],
    month: monthKey,
    compressedDates: compressedDates,
  });
}
```

**示例：**

```
11月
┌────────────────────────────────────┐
│ 11/20  11/21  11/22               │ ← 压缩显示（3 天）
└────────────────────────────────────┘

11月23日 | 周六                         ← 单独 1 天完整显示
├─ (40px 短 preline)                 ← 空日桥接线
│
```

---

#### 双向无限滚动（Bidirectional Infinite Scroll）

**实现版本**: v1.1 (2025-12-06)

**核心功能：**
- ✅ **初始加载**：今天 ±30 天（确保有足够内容可滚动）
- ✅ **初始定位**：自动滚动到今天的位置，今天显示在顶部
- ✅ **向前加载**：滚动到顶部时，自动加载更早的历史日期（往前推 30 天）
- ✅ **向后加载**：滚动到底部时，自动加载未来的日期（往后推 30 天）
- ✅ **视图保持**：加载历史数据时，使用锚点元素保持用户当前浏览位置不跳动
- ✅ **懒加载**：更远日期的信息只在用户滚动接近时才加载
- ✅ **性能优化**：批量日志输出，避免每个事件单独打印缓存日志

**状态管理：**

```typescript
const [dynamicStartDate, setDynamicStartDate] = useState<Date | null>(null);
const [dynamicEndDate, setDynamicEndDate] = useState<Date | null>(null);
const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
const [isLoadingLater, setIsLoadingLater] = useState(false);
```

**初始化策略：**

```typescript
// 1. 初始加载（useEffect）
useEffect(() => {
  const loadEvents = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 加载今天 ±30 天（轻量启动，确保有足够内容可滚动）
    const initialStartDate = new Date(today);
    initialStartDate.setDate(initialStartDate.getDate() - 30);
    
    const initialEndDate = new Date(today);
    initialEndDate.setDate(initialEndDate.getDate() + 30);
    initialEndDate.setHours(23, 59, 59, 999);
    
    const events = await EventService.getEventsByDateRange(
      initialStartDate.toISOString(),
      initialEndDate.toISOString()
    );
    
    setAllEvents(events);
    setDynamicStartDate(initialStartDate);
    setDynamicEndDate(initialEndDate);
    setLoadingEvents(false);
  };
  
  loadEvents();
}, []);

// 2. 加载完成后，自动滚动到今天
useEffect(() => {
  if (loadingEvents || !todayEventRef.current) return;
  
  setTimeout(() => {
    todayEventRef.current?.scrollIntoView({ 
      behavior: 'auto',  // 立即滚动
      block: 'start'     // 今天显示在顶部
    });
  }, 100);
}, [loadingEvents]);
```

**滚动监听器（使用 refs 避免闭包问题）：**

```typescript
useEffect(() => {
  const container = timelineContainerRef.current;
  if (!container || loadingEvents) return;

  const handleScroll = () => {
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;

    // 向上滚动接近顶部时，加载历史数据
    if (scrollTop < 100 && scrollTop > 0 && !isLoadingEarlierRef.current) {
      console.log('🔼 [TimeLog] 触发历史加载！scrollTop=' + scrollTop);
      isLoadingEarlierRef.current = true;
      setIsLoadingEarlier(true);
      
      const loadHistory = async () => {
        // 保存当前可见的第一个元素作为锚点
        const firstVisibleElement = container.querySelector('.timeline-date-group');
        const firstVisibleTop = firstVisibleElement ? firstVisibleElement.getBoundingClientRect().top : 0;
        const containerTop = container.getBoundingClientRect().top;
        const offsetFromTop = firstVisibleTop - containerTop;
        
        const currentStart = dynamicStartDateRef.current || new Date();
        const newStart = new Date(currentStart);
        newStart.setDate(newStart.getDate() - 30); // 往前加载30天
        
        console.log('📅 [TimeLog] Loading history:', {
          from: newStart.toISOString(),
          to: currentStart.toISOString(),
          anchorElement: firstVisibleElement?.getAttribute('data-date-key') || 'none',
          offsetFromTop
        });
        
        try {
          const historyEvents = await EventService.getEventsByDateRange(
            newStart.toISOString(),
            currentStart.toISOString()
          );
          
          const mergedEvents = [...historyEvents, ...allEventsRef.current];
          const uniqueEvents = Array.from(
            new Map(mergedEvents.map(e => [e.id, e])).values()
          );
          
          setAllEvents(uniqueEvents);
          allEventsRef.current = uniqueEvents;
          setDynamicStartDate(newStart);
          dynamicStartDateRef.current = newStart;
          
          console.log(`✅ [TimeLog] Loaded ${historyEvents.length} history events`);
          
          // 🔧 保持视图稳定：等待 DOM 更新后，将锚点元素恢复到原来的视觉位置
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (firstVisibleElement) {
                const newTop = firstVisibleElement.getBoundingClientRect().top;
                const newContainerTop = container.getBoundingClientRect().top;
                const currentOffset = newTop - newContainerTop;
                const scrollAdjustment = currentOffset - offsetFromTop;
                
                container.scrollTop += scrollAdjustment;
                
                console.log('📍 [TimeLog] View stabilized:', {
                  scrollAdjustment,
                  finalScrollTop: container.scrollTop
                });
              }
            });
          });
        } catch (error) {
          console.error('❌ [TimeLog] Failed to load history:', error);
        } finally {
          setTimeout(() => {
            isLoadingEarlierRef.current = false;
            setIsLoadingEarlier(false);
          }, 300);
        }
      };
      
      loadHistory();
    }

    // 向下滚动接近底部时，加载未来的日期
    if (scrollBottom < 400 && !isLoadingLaterRef.current) {
      console.log('🔽 [TimeLog] 触发未来加载！scrollBottom=' + scrollBottom);
      isLoadingLaterRef.current = true;
      setIsLoadingLater(true);
      
      const loadFuture = async () => {
        const currentEnd = dynamicEndDateRef.current || new Date();
        const newEnd = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + 30); // 往后加载30天
        newEnd.setHours(23, 59, 59, 999);
        
        console.log('📅 [TimeLog] Loading future:', {
          from: currentEnd.toISOString(),
          to: newEnd.toISOString()
        });
        
        try {
          const futureEvents = await EventService.getEventsByDateRange(
            currentEnd.toISOString(),
            newEnd.toISOString()
          );
          
          const mergedEvents = [...allEventsRef.current, ...futureEvents];
          const uniqueEvents = Array.from(
            new Map(mergedEvents.map(e => [e.id, e])).values()
          );
          
          setAllEvents(uniqueEvents);
          allEventsRef.current = uniqueEvents;
          setDynamicEndDate(newEnd);
          dynamicEndDateRef.current = newEnd;
          
          console.log(`✅ [TimeLog] Loaded ${futureEvents.length} future events`);
        } catch (error) {
          console.error('❌ [TimeLog] Failed to load future events:', error);
        } finally {
          setTimeout(() => {
            isLoadingLaterRef.current = false;
            setIsLoadingLater(false);
          }, 300);
        }
      };
      
      loadFuture();
    }
  };

  container.addEventListener('scroll', handleScroll, { passive: true });
  return () => container.removeEventListener('scroll', handleScroll);
}, [loadingEvents]);
```

**触发条件：**
- 距顶部 < 100px 且 > 0：触发加载历史日期（避免初始触发）
- 距底部 < 400px：触发加载未来日期
- 防抖机制：通过 refs 标志（`isLoadingEarlierRef`/`isLoadingLaterRef`）避免重复触发

**视图保持策略（v1.1 新增）：**
1. **锚点记录**：在加载历史数据前，记录当前可见的第一个日期元素（`.timeline-date-group`）及其距离容器顶部的偏移量
2. **静默加载**：加载新数据并更新 DOM（使用 `data-date-key` 属性标记日期元素）
3. **位置恢复**：DOM 更新后，使用双重 `requestAnimationFrame` 确保布局计算完成，然后计算锚点元素的新位置，调整滚动使锚点元素保持在原来的视觉位置

**用户体验：**
- ✅ 无缝加载，无需手动操作
- ✅ 历史日期加载后，用户看到的内容保持不变，新内容在上方"静默"出现
- ✅ 没有页面跳动或闪烁
- ✅ 支持提前规划未来事件

**性能优化（v1.1 新增）：**
- StorageManager 批量日志：从逐个打印 `💾 Cached event: ${id}` 改为批量打印 `✅ Query complete: ${count} events cached`
- 减少控制台日志数量：从几百条减少到 1-2 条
- 提高页面加载性能：避免日志打印阻塞渲染

---

#### 跨月压缩段分割逻辑

**规则：** 压缩日期段跨月时，按月份分割为多个独立段，每段都有独立的月份标题。

**示例：**

```
11月
┌────────────────────────────────────┐
│ 11/28  11/29  11/30               │ ← 11月的压缩段
└────────────────────────────────────┘

12月
┌────────────────────────────────────┐
│ 12/1   12/2   12/3                │ ← 12月的压缩段
└────────────────────────────────────┘
```

**代码实现：**

```typescript
// 按月份分割压缩日期
const monthSegmentsMap: Map<string, string[]> = new Map();

compressedDates.forEach(dateKey => {
  const [year, month, day] = dateKey.split('-');
  const monthKey = `${year}-${month}`;
  
  if (!monthSegmentsMap.has(monthKey)) {
    monthSegmentsMap.set(monthKey, []);
  }
  monthSegmentsMap.get(monthKey)!.push(dateKey);
});

// 为每个月份生成独立段
monthSegmentsMap.forEach((datesInMonth, monthKey) => {
  // 压缩段前必插入 month-header
  segments.push({
    type: 'month-header',
    dateKey: datesInMonth[0],
    month: monthKey,
  });
  
  segments.push({
    type: 'compressed',
    dateKey: datesInMonth[0],
    month: monthKey,
    compressedDates: datesInMonth,
  });
});
```

---

#### 月份标题插入规则

**规则矩阵：**

| 当前段类型 | 月份变化 | 是否插入月份标题 | 说明 |
|----------|---------|----------------|------|
| `compressed` | 任意 | ✅ 总是插入 | 压缩段必须有月份标题 |
| `events` | 是（新月份） | ✅ 插入 | 新月份首次出现 |
| `events` | 否（同月份） | ❌ 不插入 | 复用上一个月份标题（sticky） |

**代码实现：**

```typescript
let lastMonthKey = '';

timelineSegments.forEach(segment => {
  const currentMonthKey = segment.month || extractMonth(segment.dateKey);
  
  if (segment.type === 'compressed') {
    // 压缩段：总是插入月份标题
    segments.push({
      type: 'month-header',
      dateKey: segment.dateKey,
      month: currentMonthKey,
    });
    lastMonthKey = currentMonthKey;
  } else if (segment.type === 'events') {
    // 事件段：只在新月份时插入
    if (currentMonthKey !== lastMonthKey) {
      segments.push({
        type: 'month-header',
        dateKey: segment.dateKey,
        month: currentMonthKey,
      });
      lastMonthKey = currentMonthKey;
    }
  }
});
```

---

#### CompressedDateRange 组件

**功能：** 渲染横向日期网格，支持周分隔线。

**Props：**

```typescript
interface CompressedDateRangeProps {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
}
```

**渲染逻辑：**

```tsx
export const CompressedDateRange: React.FC<CompressedDateRangeProps> = ({ startDate, endDate }) => {
  const dates = generateDateRange(startDate, endDate);
  
  return (
    <div className="compressed-date-range">
      <div className="compressed-dates-grid">
        {dates.map((dateStr, index) => {
          const date = new Date(dateStr);
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ...
          const showWeekSeparator = index > 0 && dayOfWeek === 1; // Monday
          
          return (
            <React.Fragment key={dateStr}>
              {/* 周分隔线（Sunday → Monday） */}
              {showWeekSeparator && <div className="week-separator" />}
              
              {/* 日期单元格 */}
              <button className="compressed-date-cell">
                {date.getDate()}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
```

**样式：**

```css
.compressed-date-range {
  padding: 12px 0 12px 40px;
}

.compressed-dates-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.compressed-date-cell {
  width: 32px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #6B7280;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.compressed-date-cell:hover {
  background: #F3F4F6;
  color: #374151;
}

/* 周分隔线 */
.week-separator {
  width: 1px;
  height: 16px;
  background: #D1D5DB;
  margin: 0 4px;
}
```

---

#### 视觉紧凑性优化

**目标：** 移除所有段之间的空白间隙，实现无缝连接。

**关键 CSS 调整：**

```css
/* 1. 月份标题：移除 bottom padding */
.timeline-month-header {
  padding: 16px 0 0 0; /* 原：16px 0 16px 0 */
  margin: 0;
}

/* 2. 事件容器：移除 bottom padding */
.timeline-event-wrapper {
  padding: 12px 0 0 0; /* 原：12px 0 12px 0 */
  margin: 0;
}

/* 3. 事件详情列：移除 bottom padding */
.event-details-col {
  padding-bottom: 0; /* 原：16px */
}

/* 4. TimeGap：移除 margin */
.time-gap {
  margin: 0; /* 原：8px 0 */
}
```

**效果：**
- preline 各段紧密相连，视觉上形成连续的时间轴
- 事件卡片之间无多余空白
- 压缩日期段与事件段无缝衔接

---

#### 完整渲染流程

```tsx
{timelineSegments.map((segment, index) => {
  const nextSegment = timelineSegments[index + 1];
  
  if (segment.type === 'month-header') {
    return (
      <div key={segment.dateKey} className="timeline-month-header">
        <div className="timeline-month-info">{formatMonth(segment.month)}</div>
        {/* 如果下一段是压缩段，内嵌日期网格 */}
        {nextSegment?.type === 'compressed' && (
          <CompressedDateRange
            startDate={nextSegment.compressedDates[0]}
            endDate={nextSegment.compressedDates[nextSegment.compressedDates.length - 1]}
          />
        )}
      </div>
    );
  }
  
  if (segment.type === 'compressed') {
    // 空段落（日期网格已在上方 month-header 内渲染）
    return null;
  }
  
  if (segment.type === 'events') {
    const dateEvents = segment.events || [];
    const hasNoEvents = dateEvents.length === 0;
    
    return (
      <div key={segment.dateKey} className="timeline-date-group">
        {/* 日期标题（sticky） */}
        <div className="timeline-date-header">
          <div className="timeline-date-title">{formatDateDisplay(segment.dateKey)}</div>
        </div>
        
        {/* 空日 preline（单独 1 天无事件） */}
        {hasNoEvents && (
          <div className="empty-day-preline">
            <div className="empty-day-line"></div>
          </div>
        )}
        
        {/* 事件列表 */}
        {dateEvents.map((event, idx) => {
          const nextEvent = dateEvents[idx + 1];
          const showGap = nextEvent && shouldShowTimeGap(event, nextEvent);
          
          return (
            <div key={event.id} className="timeline-event-wrapper">
              {/* 事件 preline */}
              <div className="timeline-line"></div>
              
              {/* 事件卡片 */}
              <div className="timeline-icon-col">
                <EventIcon event={event} />
              </div>
              <div className="event-details-col">
                <EventCard event={event} />
              </div>
              
              {/* TimeGap（智能拉链） */}
              {showGap && (
                <TimeGap
                  prevEventEndTime={event.endTime}
                  nextEventStartTime={nextEvent.startTime}
                  onCreateEvent={handleCreateEventInGap}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }
  
  return null;
})}
```

---

#### 技术决策记录

**决策 1：为什么选择分段 Preline？**

| 方案 | 优点 | 缺点 | 决策 |
|-----|------|------|------|
| 单一连续 Preline | 实现简单，代码量少 | 与事件内容重叠，z-index 难控制 | ❌ 废弃 |
| 分段独立 Preline | 每段独立控制，无重叠问题 | 需要精确对齐（15-20px） | ✅ 采纳 |

**决策 2：为什么空白 1 天也完整显示？**

用户反馈："能看到这个孤零零的11月23日吗？如果只有1天为空白，这个日期应该也完整显示出来。"

- ❌ 压缩显示：单独 1 天的日期看起来"孤零零"，用户体验不佳
- ✅ 完整显示：保持时间轴连续性，短 preline 桥接到下一天

**决策 3：为什么压缩段总是有月份标题？**

用户反馈："如果是第2或者3或者更多次的显示了某个月份，这个月份记得要渲染加载。"

- ❌ 复用上方月份标题：用户滚动到压缩段时，可能看不到月份（sticky 标题被覆盖）
- ✅ 总是插入月份标题：确保导航清晰，用户始终知道当前月份

**决策 4：为什么支持未来日期？**

- 需求：用户需要提前规划未来事件（如下周开会、下月出差）
- 实现：初始加载 today + 30 天，滚动到底部时再加载 60 天
- 效果：无限向后扩展，支持长期规划

---

#### 性能优化建议

**1. 虚拟滚动（Virtual Scrolling）**

当事件数量 > 100 时，考虑使用 `react-window` 或 `react-virtuoso`：

```tsx
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  data={timelineSegments}
  itemContent={(index, segment) => renderSegment(segment)}
  style={{ height: '100%' }}
/>
```

**2. useMemo 缓存**

```typescript
const timelineSegments = useMemo(() => {
  // 计算时间线段...
}, [timelineRange, eventsByDate]);

const eventsByDate = useMemo(() => {
  // 按日期分组...
}, [filteredEvents]);
```

**3. React.memo 组件**

```tsx
export const CompressedDateRange = React.memo<CompressedDateRangeProps>(({ startDate, endDate }) => {
  // ...
});

export const EventCard = React.memo<EventCardProps>(({ event }) => {
  // ...
});
```

---

#### 测试清单

**功能测试：**
- [x] 空白日期横向压缩显示
- [x] 有事件日期纵向完整显示
- [x] 月份标题 sticky 置顶
- [x] 日期标题 sticky 置顶（低于月份）
- [x] 单独 1 天空白完整显示 + 短 preline
- [x] 多天空白压缩显示 + 月份标题
- [x] 跨月压缩段自动分割
- [x] 压缩段总是有月份标题
- [x] 周分隔线正确显示（Sunday → Monday）
- [x] 双向无限滚动（向前/向后加载）
- [x] 加载历史日期后视图保持不跳动（v1.1 锚点定位）
- [x] 初始加载完成后自动滚动到今天
- [x] 每个日期组有 `data-date-key` 属性（用于锚点定位）
- [x] 使用 refs 避免滚动监听器闭包问题

**视觉测试：**
- [x] Preline 左对齐（15-20px），视觉连续
- [x] 各段之间无多余空白（紧凑）
- [x] 事件卡片样式完整保留
- [x] hover 效果正常（TimeGap 虚线变实线）
- [x] 加载历史时无闪烁或跳跃（丝滑体验）

**性能测试：**
- [x] 100+ 事件渲染流畅（<200ms）
- [x] 滚动加载延迟 <100ms
- [x] 无内存泄漏
- [x] 控制台日志优化（批量输出，避免逐个打印缓存日志）
- [x] 初始加载性能提升（从几百条日志减少到 1-2 条）

---

#### TimeGap 智能交互规则（Smart Zipper）

> **设计目标**: 在事件间隙提供快速创建新事件的交互，智能推断时间

**交互状态：**

| 状态 | 触发条件 | 视觉反馈 | 行为 |
|-----|---------|---------|------|
| **DEFAULT** | 间隙默认显示 | 虚线 preline（灰色）+ 时间间隔文字 | 无交互 |
| **HOVER** | 鼠标进入 TimeGap | 实线 preline（蓝色）+ "+ Add Event" 按钮 | 准备创建事件 |
| **CLICKED** | 点击 TimeGap | 按钮按下动画 + 打开 EventEditModal | 触发创建，智能推断时间 |

**智能时间推断规则：**

| 点击位置 | 间隔时长 | 推断开始时间 | 推断结束时间 | 说明 |
|---------|---------|------------|------------|------|
| 上半部分 (0-50%) | 任意 | `prevEventEndTime` | `prevEventEndTime + 1h` | 从前一事件结束时立即开始 |
| 下半部分 (50-100%) | < 1h | `prevEventEndTime + (gap / 2)` | `nextEventStartTime` | 居中插入 |
| 下半部分 (50-100%) | 1h - 4h | `nextEventStartTime - 30min` | `nextEventStartTime` | 反推 30 分钟 |
| 下半部分 (50-100%) | > 4h | `nextEventStartTime - 1h` | `nextEventStartTime` | 反推 1 小时 |

**代码实现：**

```typescript
const calculateSuggestedTime = (
  clickPercentage: number,
  prevEnd: Date,
  nextStart: Date,
  gapMinutes: number
): { start: Date; end: Date } => {
  let start: Date;
  let end: Date;

  if (clickPercentage < 0.5) {
    // 上半部分：从前一事件结束时开始
    start = prevEnd;
    end = addMinutes(start, Math.min(60, gapMinutes));
  } else {
    // 下半部分：智能反推
    if (gapMinutes < 60) {
      const offsetMinutes = gapMinutes / 2;
      start = addMinutes(prevEnd, offsetMinutes);
      end = nextStart;
    } else if (gapMinutes < 240) {
      start = subMinutes(nextStart, 30);
      end = nextStart;
    } else {
      start = subMinutes(nextStart, 60);
      end = nextStart;
    }
  }

  return { start, end };
};
```

**边缘情况处理：**

```typescript
// 1. 跨日间隙显示
const isOvernightGap = (start: Date, end: Date): boolean => {
  return start.getDate() !== end.getDate();
};

const formatGapDuration = (minutes: number, isOvernight: boolean): string => {
  if (isOvernight) {
    const hours = Math.floor(minutes / 60);
    return `Overnight (${hours}h)`;
  }
  // 常规格式化...
};

// 2. 时间冲突检测
const validateNewEventTime = (
  suggestedStart: Date,
  prevEvent: Event,
  nextEvent: Event
): { valid: boolean; error?: string } => {
  const prevEnd = parseLocalTimeString(prevEvent.endTime);
  const nextStart = parseLocalTimeString(nextEvent.startTime);

  if (suggestedStart < prevEnd) {
    return { 
      valid: false, 
      error: '新事件开始时间不能早于前一事件结束时间' 
    };
  }

  if (suggestedStart >= nextStart) {
    return { 
      valid: false, 
      error: '新事件开始时间不能晚于下一事件开始时间' 
    };
  }

  return { valid: true };
};
```

**TimeGap 测试清单：**

- [x] 15 分钟以上间隙显示 TimeGap
- [x] Hover 时虚线变实线，显示按钮
- [x] 点击上半部分从前一事件结束时开始
- [x] 点击下半部分智能反推时间
- [x] 跨日间隙显示 "Overnight" 标识
- [x] 极小间隙（15-30min）只显示 "+" 号
- [x] 极大间隙（>8h）高度固定 48px
- [x] 时间冲突检测正常工作

---

### 2.2 Event 卡片设计

**Event 卡片组件：**
```tsx
interface EventCardProps {
  event: Event;
  onExpand: (eventId: string) => void;  // 展开 EventEditModal
}

const EventCard: React.FC<EventCardProps> = ({ event, onExpand }) => {
  const hasPlannedTime = !!event.startTime;
  const hasActualTime = !!event.segments && event.segments.length > 0;
  
  return (
    <div className="event-card">
      {/* 时间与状态 */}
      <div className="event-header">
        <div className="event-time-icons">
          {hasPlannedTime && <span className="icon">📅</span>}
          {hasActualTime && <span className="icon">⏰</span>}
        </div>
        <div className="event-time-range">
          {formatTimeRange(event.startTime, event.endTime)}
        </div>
        <button className="expand-btn" onClick={() => onExpand(event.id)}>
          →
        </button>
      </div>
      
      {/* 标题与标签 */}
      <h3 className="event-title">
        {event.emoji} {event.title}
      </h3>
      <div className="event-tags">
        {event.tags?.map(tagId => <TagChip key={tagId} tagId={tagId} />)}
      </div>
      
      {/* 元数据 */}
      <div className="event-metadata">
        {event.participants && (
          <div>参会人：{event.participants.join(', ')}</div>
        )}
        {event.location && (
          <div>📍 {event.location}</div>
        )}
      </div>
      
      {/* eventlog 预览（折叠状态） */}
      <div className="event-log-preview">
        <EventLogPreview eventlog={event.eventlog} maxLines={3} />
      </div>
      
      {/* 同步状态 */}
      <div className="event-sync-status">
        {renderSyncStatus(event)}
      </div>
    </div>
  );
};
```

**样式定义：**
```css
.event-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transition: box-shadow 0.2s;
}

.event-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.event-time-icons {
  display: flex;
  gap: 4px;
  font-size: 16px;
}

.event-title {
  font-size: 18px;
  font-weight: 600;
  margin: 8px 0;
}

.event-log-preview {
  margin-top: 12px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
  
  /* 截断超过 3 行 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.expand-btn {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #9ca3af;
  transition: color 0.2s;
}

.expand-btn:hover {
  color: #3b82f6;
}
```

---

### 2.2.5 TimeGap 悬浮菜单交互（2025-12-08 更新）

> **版本**: v2.4  
> **实现位置**: `src/components/TimeLog/TimeGap.tsx`, `src/components/TimeLog/TimeGap.css`  
> **设计理念**: 鼠标跟随的悬浮菜单，支持精准选择时间点创建事件/笔记/附件

#### 核心架构

**技术栈**:
- **Tippy.js**: 悬浮菜单定位引擎
- **React State**: hover 状态管理 + 鼠标 Y 坐标追踪
- **CSS Flexbox**: 响应式布局

**交互流程**:
```
用户鼠标移入虚线区域 (trigger: .time-gap-axis-trigger)
  ↓
onMouseEnter → setIsHovered(true)
  ↓
Tippy 显示悬浮菜单 (visible={isHovered})
  ↓
onMouseMove → 更新 hoverY 和计算 hoverTime
  ↓
用户点击菜单按钮 → 创建事件/笔记/附件
  ↓
鼠标离开触发区域或菜单 → setTimeout(100ms) → setIsHovered(false)
```

#### 触发区域设计

**问题背景**:
- 虚线本身只有 2px 宽，鼠标难以精准悬停
- 早期版本: 鼠标稍微偏离就消失，用户体验差

**解决方案 (v2.4)**:
```tsx
// TimeGap.tsx - 宽阔的触发区域
<div
  className="time-gap-axis-trigger"
  onMouseEnter={() => setIsHovered(true)}
  onMouseMove={handleMouseMove}
  onMouseLeave={handleMouseLeave}
>
  {/* Tippy 浮窗挂载点 */}
  <Tippy
    content={<FloatingMenu />}
    visible={isHovered}
    interactive={true}
    interactiveBorder={300}  // 🔧 扩大交互边界
    zIndex={999}             // 🔧 确保在 sticky header 上方
    appendTo={() => document.body}  // 🔧 避免 z-index 限制
    placement="right-start"
    theme="time-gap-menu"
  >
    <div className="time-gap-axis" />
  </Tippy>
</div>
```

**CSS 布局**:
```css
/* 触发区域: 200px 宽，覆盖虚线左右各 100px */
.time-gap-axis-trigger {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 200px;
  cursor: pointer;
  z-index: 10;
}

/* 实际虚线: 2px 宽，居中显示 */
.time-gap-axis {
  position: absolute;
  left: 20px;
  height: 100%;
  width: 2px;
  border-left: 2px dashed #CBD5E1;
  opacity: 0.6;
  transition: all 0.2s ease;
}

.time-gap-axis.active {
  border-left-style: solid;
  border-left-color: #3B82F6;
  opacity: 1;
}

/* 中间内容区域: 从虚线右侧开始，不遮挡触发区域 */
.time-gap-content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  margin-left: 40px;  /* 从虚线右侧开始，不遮挡 trigger */
  z-index: 1;
}
```

**关键设计点**:
1. **触发区域 200px 宽**: 用户鼠标在虚线附近移动时，触发区域足够大，不会立即消失
2. **content 使用 margin-left**: 避免 content 覆盖触发区域，导致鼠标事件被拦截
3. **interactiveBorder: 300px**: Tippy 配置允许鼠标在触发区域和菜单之间移动而不隐藏
4. **z-index: 999**: 确保浮窗显示在 sticky header (z-index: 10-11) 上方
5. **appendTo body**: 避免父容器的 stacking context 限制

#### 悬浮菜单组件

**UI 结构**:
```tsx
<div className="time-gap-floating-menu">
  {/* 时间显示（顶部） */}
  {hoverTime && (
    <div className="floating-menu-time">
      {hoverTime.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })}
    </div>
  )}

  {/* 操作按钮 */}
  <button className="floating-menu-btn note" onClick={handleCreateNote}>
    <span className="btn-icon">📝</span>
    <span className="btn-text">添加笔记</span>
  </button>
  
  <button className="floating-menu-btn event" onClick={handleCreateEvent}>
    <span className="btn-icon">📅</span>
    <span className="btn-text">添加事件</span>
  </button>
  
  <button className="floating-menu-btn attachment" onClick={handleUploadAttachment}>
    <span className="btn-icon">📎</span>
    <span className="btn-text">上传附件</span>
  </button>
</div>
```

**CSS 样式**:
```css
.time-gap-floating-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 120px;
  padding: 8px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

/* Tippy 容器也需要高 z-index */
.tippy-box[data-theme~="time-gap-menu"] {
  z-index: 100;
  transition-property: opacity, transform !important;
  transition-duration: 0s !important;
}

/* 时间显示 */
.floating-menu-time {
  margin-bottom: 4px;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 500;
  color: #6B7280;
  background: #F9FAFB;
  border-radius: 4px;
  text-align: center;
}

/* 按钮基础样式 */
.floating-menu-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  background: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.floating-menu-btn:hover {
  transform: translateX(2px);
}

/* 按钮主题色 */
.floating-menu-btn.note:hover {
  background: #F5F3FF;
  color: #8B5CF6;
}

.floating-menu-btn.event:hover {
  background: #EFF6FF;
  color: #3B82F6;
}

.floating-menu-btn.attachment:hover {
  background: #ECFDF5;
  color: #10B981;
}
```

#### 鼠标坐标追踪

**需求**: 显示鼠标悬停位置对应的时间（精确到分钟）

**实现**:
```tsx
const [hoverY, setHoverY] = useState<number | null>(null);
const [hoverTime, setHoverTime] = useState<Date | null>(null);
const [isInMenu, setIsInMenu] = useState(false);

const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  if (isInMenu) return; // 🎯 鼠标在菜单内时，锁定时间显示
  
  const rect = e.currentTarget.getBoundingClientRect();
  const relativeY = e.clientY - rect.top;
  setHoverY(relativeY);
  
  // 计算对应时间
  const gapHeight = rect.height;
  const ratio = relativeY / gapHeight;
  
  if (prevEventEndTime && nextEventStartTime) {
    const startMs = prevEventEndTime.getTime();
    const endMs = nextEventStartTime.getTime();
    const targetMs = startMs + (endMs - startMs) * ratio;
    
    const targetTime = new Date(targetMs);
    // 四舍五入到最近的分钟
    targetTime.setSeconds(0, 0);
    targetTime.setMinutes(Math.round(targetTime.getMinutes()));
    
    setHoverTime(targetTime);
  }
}, [prevEventEndTime, nextEventStartTime, isInMenu]);
```

**关键点**:
- `isInMenu` 锁定机制: 鼠标进入菜单后，时间显示不再更新
- 四舍五入到分钟: 避免显示秒级精度
- 线性插值计算: `ratio = relativeY / totalHeight`

#### 防抖与延迟隐藏

**问题**: 鼠标快速划过时，菜单闪烁

**解决方案**:
```tsx
const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  // 延迟检查，给鼠标移动到浮窗的时间
  setTimeout(() => {
    if (!isInMenu) {
      setIsHovered(false);
      setHoverY(null);
    }
  }, 100);
}, [isInMenu]);

// 菜单内的鼠标事件
<div 
  className="time-gap-floating-menu"
  onMouseEnter={() => setIsInMenu(true)}
  onMouseLeave={() => {
    setIsInMenu(false);
    // 离开菜单后也隐藏
    setTimeout(() => {
      setIsHovered(false);
      setHoverY(null);
    }, 100);
  }}
>
```

#### 事件创建逻辑

**添加笔记**:
```tsx
const handleCreateNote = useCallback(() => {
  if (!hoverTime) return;
  
  onCreateNote?.({
    timestamp: hoverTime.toISOString(),
    position: 'gap',
  });
  
  setIsHovered(false);
  setHoverY(null);
}, [hoverTime, onCreateNote]);
```

**添加事件**:
```tsx
const handleCreateEvent = useCallback(() => {
  if (!hoverTime) return;
  
  onCreateEvent?.({
    startTime: formatTimeForStorage(hoverTime),
    suggestedEndTime: formatTimeForStorage(new Date(hoverTime.getTime() + 60 * 60 * 1000)), // +1h
  });
  
  setIsHovered(false);
  setHoverY(null);
}, [hoverTime, onCreateEvent]);
```

**上传附件**:
```tsx
const handleUploadAttachment = useCallback(() => {
  if (!hoverTime) return;
  
  onUploadAttachment?.({
    timestamp: hoverTime.toISOString(),
    position: 'gap',
  });
  
  setIsHovered(false);
  setHoverY(null);
}, [hoverTime, onUploadAttachment]);
```

#### 性能优化

1. **useCallback 包裹所有事件处理器**: 避免重复创建函数
2. **Tippy 动画禁用**: `animation={false}`, `duration={0}` 实现瞬间显示
3. **CSS transition 禁用**: 避免 Tippy 位置变换动画
4. **按需渲染**: 只在 `isHovered=true` 时渲染 Tippy 内容

#### 已知问题与解决

| 问题 | 原因 | 解决方案 |
|-----|------|---------|
| 鼠标稍微偏离虚线就消失 | 触发区域太窄 (2px) | 扩大到 200px |
| 菜单被 sticky header 遮挡 | z-index 不足 | `zIndex={999}` + `appendTo={body}` |
| 鼠标从触发区移到菜单时消失 | interactiveBorder 太小 | `interactiveBorder={300}` |
| content 区域遮挡触发区 | content 使用 padding-left | 改为 `margin-left: 40px` |
| 时间显示抖动 | 鼠标在菜单内也更新 | 添加 `isInMenu` 锁定 |

---

### 2.3 智能搜索与过滤器

#### 2.3.1 智能搜索框

**功能：**
- 顶部搜索框，支持关键词搜索 Event 内容
- 搜索范围：Event 标题、eventlog 内容、tags、participants

**实现：**
```typescript
const handleSearch = (query: string) => {
  const lowerQuery = query.toLowerCase();
  return events.filter(event => 
    event.title?.toLowerCase().includes(lowerQuery) ||
    event.eventlog?.toLowerCase().includes(lowerQuery) ||
    event.tags?.some(tagId => tagNames[tagId]?.toLowerCase().includes(lowerQuery)) ||
    event.participants?.some(p => p.name?.toLowerCase().includes(lowerQuery))
  );
};
```

#### 2.3.2 日历选择器

**功能：**
- 默认显示所有时间的连续时间轴
- 用户可选择特定日期或日期范围
- 右侧时间轴只显示选中范围的 Events

**实现：**
```typescript
const [selectedDateRange, setSelectedDateRange] = useState<{
  start: Date | null;
  end: Date | null;
}>({ start: null, end: null });

const filteredEventsByDate = useMemo(() => {
  if (!selectedDateRange.start) {
    // 默认：显示所有 Events
    return allEvents;
  }
  
  return allEvents.filter(event => {
    // ✅ 使用 TimeHub API 获取时间
    const { resolved } = useEventTime(event.id);
    const eventDate = resolved?.start ? resolved.start : parseLocalTimeString(event.createdAt);
    const inRange = 
      (!selectedDateRange.start || eventDate >= selectedDateRange.start) &&
      (!selectedDateRange.end || eventDate <= selectedDateRange.end);
    return inRange;
  });
}, [allEvents, selectedDateRange]);
```

#### 2.3.3 标签/事件/收藏选择器

**功能：**
- 底部筛选区，显示带紫色 badge 的标签列表（如：#工作 3⃣7⃣，#PRD交流 3⃣7⃣）
- 用户点击标签切换选中/取消状态，只显示选中标签的 Events
- **父标签选中** → 整个子标签树的 Events 都显示
- **父标签取消** → 整个子标签树的 Events 都被过滤

**UI 示例（参考 Figma）：**
```
┌─────────────────────────┐
│ 标签/事件/收藏选择器     │
├─────────────────────────┤
│ #@Remarkable开发 3⃣7⃣    │ ← 紫色 badge 显示数量
│ #@PRD交流 3⃣7⃣          │
│ #@旧代码 3⃣7⃣           │
│ #白代码 3⃣7⃣            │
└─────────────────────────┘
```

**实现：**
```typescript
const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

// 递归获取子标签
const getChildTagIds = (tagId: string, tagTree: TagHierarchy): string[] => {
  const tag = tagTree.find(t => t.id === tagId);
  if (!tag || !tag.children) return [];
  
  const childIds = tag.children.map(c => c.id);
  const grandChildIds = tag.children.flatMap(c => getChildTagIds(c.id, tagTree));
  
  return [...childIds, ...grandChildIds];
};

// 切换标签选中状态
const toggleTagSelection = (tagId: string) => {
  setSelectedTagIds(prev => {
    const next = new Set(prev);
    
    if (next.has(tagId)) {
      // 取消选中：移除自己和所有子标签
      next.delete(tagId);
      const childIds = getChildTagIds(tagId, tagTree);
      childIds.forEach(id => next.delete(id));
    } else {
      // 选中：添加自己和所有子标签
      next.add(tagId);
      const childIds = getChildTagIds(tagId, tagTree);
      childIds.forEach(id => next.add(id));
    }
    
    return next;
  });
};

// 过滤 Events（只显示选中标签的 Events）
const filteredEventsByTags = useMemo(() => {
  // 未选中任何标签时，显示所有 Events
  if (selectedTagIds.size === 0) return filteredEventsByDate;
  
  // 只显示包含选中标签的 Events
  return filteredEventsByDate.filter(event => {
    return event.tags?.some(tagId => selectedTagIds.has(tagId));
  });
}, [filteredEventsByDate, selectedTagIds]);
```

### 2.4.7 EventLog 展开与编辑

**交互设计：**
- Event 卡片标题行最右侧有展开/收起按钮（`›` / `∨`）
- 点击按钮切换 eventlog 内容的显示/隐藏
- **展开时直接嵌入 ModalSlate 编辑器**，用户可直接编辑
- 收起时隐藏 eventlog 内容，只显示 Event 元信息
- **TimeLog 是最舒适的写日志区域**，无需跳转到 EventEditModal

**状态管理：**
```typescript
const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());

const toggleEventExpand = (eventId: string) => {
  setExpandedEventIds(prev => {
    const newSet = new Set(prev);
    if (newSet.has(eventId)) {
      newSet.delete(eventId);
    } else {
      newSet.add(eventId);
    }
    return newSet;
  });
};

const isExpanded = expandedEventIds.has(event.id);
```

**ModalSlate 编辑器 + FloatingBar 集成（推荐方案）** ✅
```typescript
import { ModalSlate } from '@/components/ModalSlate';
import { useFloatingToolbar } from '@/components/FloatingToolbar/useFloatingToolbar';
import { HeadlessFloatingToolbar } from '@/components/FloatingToolbar/HeadlessFloatingToolbar';

const EventLogEditor: React.FC<{ event: Event; isExpanded: boolean }> = ({
  event,
  isExpanded
}) => {
  if (!isExpanded) return null;
  
  // FloatingBar 状态管理
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
  
  const floatingToolbar = useFloatingToolbar({
    editorRef: editorContainerRef,
    enabled: true,
    menuItemCount: 7, // 标签、表情、日期、事件提及、颜色、高亮、格式
    onMenuSelect: (menuIndex: number) => {
      setActivePickerIndex(menuIndex);
    },
  });
  
  const handleEventLogChange = (slateJson: string) => {
    // 直接更新 Event 的 eventlog 字段
    EventService.updateEvent(event.id, {
      eventlog: slateJson
    });
  };
  
  const toolbarConfig: ToolbarConfig = {
    mode: 'quick-action',
    features: [], // 由 HeadlessFloatingToolbar 自动决定
  };
  
  return (
    <div ref={editorContainerRef} className="event-log-editor-wrapper">
      <ModalSlate
        content={event.eventlog || ''}
        parentEventId={event.id}
        onChange={handleEventLogChange}
        enableTimestamp={true}
        placeholder="记录此事件的详细日志..."
      />
      
      {/* FloatingBar：提供标签、表情、日期、格式化等快捷操作 */}
      <HeadlessFloatingToolbar
        position={floatingToolbar.position}
        mode={floatingToolbar.mode}
        config={toolbarConfig}
        activePickerIndex={activePickerIndex}
        eventId={event.id}
        onActivePickerIndexConsumed={() => setActivePickerIndex(null)}
        onSubPickerStateChange={(isOpen) => {/* 可选 */}}
      />
    </div>
  );
};
```

**FloatingBar 功能说明：**
- **Alt + 1**: 打开标签选择器（TagPicker）
- **Alt + 2**: 打开表情选择器（EmojiPicker）
- **Alt + 3**: 打开日期时间选择器（UnifiedDateTimePicker）
- **Alt + 4**: 打开事件提及选择器（EventMentionPicker）
- **Alt + 5**: 文本格式化菜单（粗体、斜体、颜色等）
- **Esc**: 关闭 FloatingBar

**完整卡片结构：**
```typescript
<div className="event-card" key={event.id}>
  {/* 标题行 */}
  <div className="event-card-header">
    <div className="event-title-row">
      <span className="event-emoji">{event.emoji}</span>
      <h3 className="event-title">{event.title.colorTitle || event.title.simpleTitle}</h3>
      <span className="event-time">{displayTime}</span>
    </div>
    
    {/* 元信息行：attendees, location, tags, sync status */}
    <div className="event-meta-row">
      {event.attendees && <AttendeesDisplay attendees={event.attendees} />}
      {event.location && <LocationDisplay location={event.location} />}
      {event.tags && <TagsDisplay tags={event.tags} />}
      {syncStatus && <SyncStatusBadge status={syncStatus} />}
    </div>
    
    {/* 展开/收起按钮 */}
    <button 
      className="event-expand-toggle"
      onClick={() => toggleEventExpand(event.id)}
      title={isExpanded ? '收起' : '展开'}
    >
      {isExpanded ? '∨' : '›'}
    </button>
  </div>

  {/* EventLog 编辑器（展开时渲染）*/}
  <EventLogEditor event={event} isExpanded={isExpanded} />
</div>
```

**ModalSlate 复用优势**：
- ✅ **完整功能**：Timestamp、Bullet、Tag、UnifiedMention（@ 提及事件/标签/时间/AI）、段落移动等
- ✅ **一致体验**：与 EventEditModal 中的编辑器行为完全一致
- ✅ **自动保存**：通过 `onChange` 回调实时更新数据
- ✅ **零额外开发**：直接复用现有组件，无需重新实现渲染逻辑
- ✅ **性能优化**：ModalSlate 内部已经处理了序列化/反序列化
- ✅ **智能提及**：UnifiedMention 支持 @ 提及事件（自动创建双向链接）、标签、自然语言时间（"明天下午3点"）、AI 助手

**CSS 样式：**
```css
/* 展开/收起按钮 */
.event-expand-toggle {
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 20px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.event-expand-toggle:hover {
  background-color: #f3f4f6;
  color: #374151;
}

/* EventLog 编辑器容器 */
.event-log-editor-wrapper {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  min-height: 120px;
}

/* ModalSlate 在 TimeLog 中的样式调整 */
.event-log-editor-wrapper .modal-slate-editor {
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
}

/* Timestamp 分隔线样式（继承自 ModalSlate）*/
.event-log-editor-wrapper .timestamp-divider {
  margin: 16px 0 12px 0;
  font-size: 12px;
  color: #6b7280;
}

/* Preline 时间线样式（继承自 ModalSlate）*/
.event-log-editor-wrapper .preline-indicator {
  left: -24px;
  width: 2px;
  background: linear-gradient(to bottom, #3b82f6, #60a5fa);
}

/* 🎨 纯笔记 Event 的 Preline 挂载样式 */
.note-preline-container {
  position: absolute;
  left: -24px;
  top: 0;
  bottom: 0;
  width: 2px;
  pointer-events: none; /* 不影响卡片交互 */
}

.note-preline-segment {
  position: relative;
  display: flex;
  align-items: center;
  margin: 8px 0;
}

.note-preline-segment .preline-dot {
  position: absolute;
  left: -3px; /* 2px line + 1px offset = 圆点居中 */
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b82f6;
  box-shadow: 0 0 0 2px white, 0 0 0 3px #3b82f6;
  z-index: 2;
}

.note-preline-segment .preline-line {
  position: absolute;
  left: 0;
  top: 8px; /* 从圆点中心开始 */
  width: 2px;
  height: calc(100% + 8px); /* 延伸到下一个圆点 */
  background: linear-gradient(to bottom, #3b82f6, #60a5fa);
  z-index: 1;
}
```

---

## 2.5 UnifiedMention 统一提及系统 🎯

### 2.5.1 概述

UnifiedMention 是 4DNote 的智能提及系统，类似 Notion/Linear 的 @ 菜单，通过输入 `@` 触发统一搜索界面，支持：

- **📄 事件提及**：链接到其他事件，自动创建双向链接
- **🏷️ 标签提及**：快速插入标签
- **📅 时间提及**：自然语言时间解析（"明天下午3点"、"下周五"）
- **🤖 AI 助手**：触发 AI 辅助功能
- **➕ 新建页面**：快速创建新事件

**核心特性**：
- ⚡ **本地优先**：200ms 内返回结果，无网络依赖
- 🔍 **模糊搜索**：基于 Fuse.js 的智能匹配算法
- 🎯 **上下文权重**：最近访问、关联标签自动提权
- 🔗 **自动链接**：事件提及自动创建双向链接（`linkedEventIds` + `backlinks`）
- ⌨️ **键盘优先**：↑↓ 选择，Enter 确认，Esc 关闭

### 2.5.2 触发方式

| 输入 | 触发结果 | 示例 |
|------|---------|------|
| `@` | 打开 UnifiedMention 菜单 | `@工作` → 搜索标签/事件 |
| `@明天` | 自动解析时间 | 插入 DateMentionNode |
| `@会议` | 搜索相关事件 | 显示所有包含"会议"的事件 |
| `@?` | 触发 AI 助手 | 智能问答、建议等 |

### 2.5.3 搜索结果分组

```typescript
interface SearchResult {
  topHit?: MentionItem;      // 🏆 最佳匹配（置顶）
  events: MentionItem[];     // 📄 事件列表
  tags: MentionItem[];       // 🏷️ 标签列表
  time: MentionItem[];       // 📅 时间快捷方式（今天、明天、下周等）
  ai?: MentionItem;          // 🤖 AI 助手
  newPage?: MentionItem;     // ➕ 创建新页面（兜底）
}
```

**排序算法**：
1. **精确匹配优先**：完全匹配的结果排在最前
2. **最近访问权重**：最近打开的事件/使用的标签提权
3. **上下文关联**：当前事件的标签相关的结果提权
4. **模糊匹配分数**：Fuse.js 计算的相似度分数

### 2.5.4 节点类型

**DateMentionNode**（时间提及）：
```typescript
interface DateMentionNode {
  type: 'dateMention';
  startDate: string;          // 本地时间字符串格式 'YYYY-MM-DD HH:mm:ss'
  endDate?: string;           // 可选结束时间
  eventId?: string;           // 关联事件 ID
  originalText: string;       // 用户原始输入（"明天下午3点"）
  isOutdated?: boolean;       // 是否过期（用于高亮提示）
  children: [{ text: '' }];
}
```

**EventMentionNode**（事件提及）：
```typescript
interface EventMentionNode {
  type: 'eventMention';
  targetEventId: string;      // 目标事件 ID
  displayText: string;        // 显示文本
  children: [{ text: '' }];
}
```

**TagNode**（标签提及）：
```typescript
interface TagNode {
  type: 'tag';
  tagId: string;
  tagName: string;
  tagColor?: string;
  tagEmoji?: string;
  mentionOnly?: boolean;      // true = 仅提及，不加入 Event.tags
  children: [{ text: '' }];
}
```

### 2.5.5 自动双向链接

当用户在事件 A 的 EventLog 中 `@事件B` 时：

1. **插入 EventMentionNode**：在 Slate 编辑器中显示链接
2. **更新 Event A**：`linkedEventIds` 添加 `事件B.id`
3. **更新 Event B**：`backlinks` 添加 `事件A.id`
4. **实时同步**：通过 `EventService.addLink()` 自动维护双向关系

**数据结构**：
```typescript
interface Event {
  linkedEventIds?: string[];  // 主动链接的事件
  backlinks?: string[];       // 被引用的事件（自动计算）
}
```

### 2.5.6 实现细节

**组件位置**：
- `src/components/UnifiedMentionMenu.tsx` - 菜单 UI
- `src/services/search/UnifiedSearchIndex.ts` - 搜索索引引擎

**集成位置**：
- `src/components/PlanSlate/PlanSlate.tsx` - 在 Slate 编辑器中触发
- `src/components/EventEditModal/EventEditModalV2.tsx` - EventLog 编辑器

**性能优化**：
- **内存索引**：启动时构建 Fuse.js 索引，200ms 内返回结果
- **增量更新**：监听 `EventHub.eventsUpdated`，实时同步索引
- **防抖搜索**：150ms debounce，减少无效搜索
- **最近访问缓存**：记录用户选择，提升常用项权重

### 2.5.7 使用示例

**场景 1：链接相关会议**
```
用户在事件 A 输入：
  昨天和 @李明 讨论了项目进度，下次 @季度总结会议 需要汇报

结果：
  - "李明" → 搜索联系人（如果启用人员系统）
  - "季度总结会议" → 搜索事件，选中后自动创建双向链接
```

**场景 2：快速插入时间**
```
用户输入：
  @明天下午3点 需要提交报告

结果：
  - 解析为 DateMentionNode
  - startDate = 2025-12-05 15:00:00
  - 自动关联到当前事件
```

**场景 3：AI 辅助**
```
用户输入：
  @? 帮我总结今天的工作进展

结果：
  - 触发 AI 助手
  - 读取今天的 TimerLogs
  - 生成工作总结

.note-preline-segment:last-child .preline-line {
  display: none; /* 最后一个 segment 不显示连接线 */
}

.timestamp-count {
  margin-left: 8px;
  font-size: 11px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 8px;
}
```

**性能考虑：**
- ✅ **按需渲染**：只有展开的卡片才渲染 ModalSlate 实例
- ✅ **编辑器复用**：ModalSlate 内部使用 `useMemo` 缓存 editor instance
- ✅ **虚拟滚动**（可选）：如果 TimeLog 显示大量事件，可使用 `react-window` 优化

**与 EventEditModal 的关系：**
- **TimeLog**: 快速浏览和编辑日志内容（轻量级操作）
- **EventEditModal**: 完整编辑 Event 所有字段（标题、时间、标签、同步配置等）
- 双击卡片标题行仍可打开 EventEditModal 进行深度编辑

---

### 2.4 数据集成规范（2025-12-03）

> **架构说明**: TimeLog 页面展示 Event 集合的时间轴视图，每个 Event 卡片需要从 Event 对象中提取多个字段进行渲染。本章节规范了如何正确集成 EventHub/TimeHub 架构中的数据字段到 UI 组件。

#### 2.4.1 时间信息区的数据集成

**核心原则**: 区分计划时间（Plan）和实际时间（Actual），并通过图标清晰标识。

> **⚠️ 时间架构一致性警告**  
> 根据 `TIME_ARCHITECTURE.md`，应用中的时间管理由 **TimeHub** 统一协调：
> - ✅ **正确做法**: 通过 `TimeHub.setEventTime()` 或 `useEventTime(eventId)` 读写时间
> - ✅ **TimeSpec 是唯一真相源**: `event.timeSpec` 包含用户意图和规范化时间
> - ❌ **禁止直接操作**: `startTime`/`endTime` 是派生字段，由 TimeHub 自动维护
> - ❌ **禁止直接读取**: 显示时间应使用 `timeSpec.resolved` 而非 `startTime`
> 
> 本 PRD 中为了演示数据流使用了 `event.startTime` 等派生字段，实际实现时**必须**改用 `TimeHub` API。

##### Icon 显示规则

| 条件 | Icon 组合 | 说明 |
|------|----------|------|
| 只有计划时间<br>`timeSpec.kind !== 'fuzzy'` | 📅 | 用户手动创建的事件，设置了计划时间 |
| 只有实际时间<br>`segments.length > 0` | ⏰ | Timer 计时产生的事件，只有实际记录 |
| 两者都有且接近（<5分钟差异） | 📅 ⏰（单行）| 计划内的事情，用户也进行了实际计时，时间基本一致 |
| 两者都有但不一致（>5分钟差异） | 📅（第1行）<br>⏰（第2行）| 计划和实际有显著偏差，分行显示 |

> **架构注意**: 实际实现中，"计划时间"的判断应使用 `timeSpec` 而非 `startTime` 派生字段

**图标布局**:
- 计划时间 icon (📅) 在左侧
- 实际时间 icon (⏰) 在 📅 右侧（如果两者都有）
- Icon 尺寸: 16px × 16px，间距 4px
- 不一致时：分两行显示，每行一个 icon

##### 时间显示逻辑

```typescript
/**
 * 时间信息渲染逻辑
 * 
 * 规则：
 * 1. Task 或无明确时间点的 Event → 使用 completedAt（checkbox 打钩时间）
 * 2. 计划时间和实际时间不一致（>5分钟） → 分两行显示
 * 3. 两者都有但接近（<5分钟） → 单行显示两个图标
 * 4. 只有一种时间 → 单行显示对应图标
 */
interface TimeDisplayProps {
  event: Event;
}

const TimeDisplay: React.FC<TimeDisplayProps> = ({ event }) => {
  /**
   * 时间显示的7种情况总结：
   * 
   * | 情况 | 条件 | Icon | 布局 | 示例 |
   * |------|------|------|------|------|
   * | 0️⃣ 已完成Task | isTask && completedAt | ✅ | 单行 | ✅ 2025-12-03 14:30 |
   * | 1️⃣ 不一致 | 计划+实际都有 && 差异>5min | 📅<br>⏰ | 两行 | 📅 10:00-12:00<br>⏰ 10:15-12:30 |
   * | 2️⃣ 都有接近 | 计划+实际都有 && 差异<5min | 📅⏰ | 单行 | 📅⏰ 10:00-12:00 (2h) |
   * | 3️⃣ 只有计划 | 只有 timeSpec.resolved | 📅 | 单行 | 📅 10:00-12:00 (2h) |
   * | 4️⃣ 只有实际 | 只有 segments | ⏰ | 单行 | ⏰ 10:02-12:05 (2h3min) |
   * | 5️⃣ 纯笔记 | 只有 eventlog.timestamp | 📝 | 单行 | 📝 2025-12-03 10:21:18 |
   * | 6️⃣ isPlan | 无时间信息 | - | - | 不显示在TimeLog |
   */
  
  // 1. 判断是否为已完成的 Task（以完成时间为准）
  if (event.isTask && event.completedAt) {
    return (
      <div className="event-time-display">
        <div className="time-row">
          <img src={CheckIcon} alt="完成" className="time-icon" />
          <span className="time-text">
            {formatDateTime(event.completedAt)}
          </span>
        </div>
      </div>
    );
  }

  // 2. 提取计划时间和实际时间
  // ⚠️ 架构要求：必须使用 TimeHub API 而非直接读取派生字段
  // - timeSpec.resolved.start: 用户意图 + 策略计算的显示时间（Date 对象）
  // - event.startTime: 派生的本地时间字符串，仅用于数据库索引/Outlook 同步
  const timeData = useEventTime(event.id); // TimeHub API
  const plannedStart = timeData.resolved?.start;
  const plannedEnd = timeData.resolved?.end;
  const actualSegments = event.segments || [];

  // 计算实际时间范围（从所有 segments 中提取首尾时间）
  let actualStart: string | null = null;
  let actualEnd: string | null = null;
  if (actualSegments.length > 0) {
    const sortedSegments = [...actualSegments].sort((a, b) => 
      parseLocalTimeString(a.startTime).getTime() - parseLocalTimeString(b.startTime).getTime()
    );
    actualStart = sortedSegments[0].startTime;
    actualEnd = sortedSegments[sortedSegments.length - 1].endTime;
  }

  // 3. 判断计划和实际是否有显著差异（>5分钟）
  const hasSignificantDiff = plannedStart && actualStart && (
    Math.abs(parseLocalTimeString(plannedStart).getTime() - parseLocalTimeString(actualStart).getTime()) > 5 * 60 * 1000
  );

  // 4. 渲染逻辑（情况1-4）
  if (hasSignificantDiff) {
    // 情况1: 两者都有但不一致（>5分钟） → 分两行显示
    return (
      <div className="event-time-display">
        {/* 第一行：计划时间 📅 */}
        <div className="time-row">
          <img src={CalendarIcon} alt="计划" className="time-icon" />
          <span className="time-text">
            {formatTimeRange(plannedStart, plannedEnd)}
          </span>
        </div>
        {/* 第二行：实际时间 ⏰ */}
        <div className="time-row">
          <img src={TimerIcon} alt="实际" className="time-icon" />
          <span className="time-text">
            {formatTimeRange(actualStart, actualEnd)}
          </span>
        </div>
      </div>
    );
  } else if (plannedStart && actualStart) {
    // 情况2: 两者都有且接近（<5分钟） → 单行显示两个图标
    return (
      <div className="event-time-display">
        <div className="time-row">
          <img src={CalendarIcon} alt="计划" className="time-icon" />
          <img src={TimerIcon} alt="实际" className="time-icon" />
          <span className="time-text">
            {formatTimeRange(plannedStart, plannedEnd)}
          </span>
          <span className="duration-badge">
            {calculateDuration(plannedStart, plannedEnd)}
          </span>
        </div>
      </div>
    );
  } else if (plannedStart) {
    // 情况3: 只有计划时间（无实际 segments）
    return (
      <div className="event-time-display">
        <div className="time-row">
          <img src={CalendarIcon} alt="计划" className="time-icon" />
          <span className="time-text">
            {formatTimeRange(plannedStart, plannedEnd)}
          </span>
          <span className="duration-badge">
            {calculateDuration(plannedStart, plannedEnd)}
          </span>
        </div>
      </div>
    );
  } else if (actualStart) {
    // 情况4: 只有实际时间（从 segments 提取，无计划时间）
    // 说明：用户通过 Timer 计时，但没有预先设置计划时间
    return (
      <div className="event-time-display">
        <div className="time-row">
          <img src={TimerIcon} alt="实际" className="time-icon" />
          <span className="time-text">
            {formatTimeRange(actualStart, actualEnd)}
          </span>
          <span className="duration-badge">
            {calculateActualDuration(actualSegments)}
          </span>
        </div>
      </div>
    );
  }

  // 情况5: 纯笔记（无计划时间、无 segments，只有 eventlog 中的 timestamp-divider）
  // 说明：用户只在 EventLog 中写了内容，TimeLog 使用第一个 timestamp 作为定位时间
  // 🎨 视觉特性：所有 timestamp 的 preline 都挂载到 Event 卡片上
  const allTimestamps = extractAllTimestamps(event.eventlog);
  if (allTimestamps.length > 0) {
    return (
      <div className="event-time-display">
        <div className="time-row">
          <span className="note-icon">📝</span>
          <span className="time-text">
            {formatDateTime(allTimestamps[0])}
          </span>
          {allTimestamps.length > 1 && (
            <span className="timestamp-count">
              +{allTimestamps.length - 1} 个时间点
            </span>
          )}
        </div>
        
        {/* 🎨 Preline 垂直时间线（挂载所有 timestamp）*/}
        <div className="note-preline-container">
          {allTimestamps.map((timestamp, index) => (
            <div 
              key={index} 
              className="note-preline-segment"
              data-timestamp={timestamp}
            >
              <div className="preline-dot" />
              <div className="preline-line" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 情况6: isPlan 事件（无任何时间信息）
  // 说明：这些是计划类事件（未来要做的事），不显示在 TimeLog 中
  // TimeLog 的数据加载过滤逻辑会排除这些事件（通过 getEventTimelinePosition() 返回 null）
  return null;
};

/**
 * 从 eventlog 中提取所有 timestamp-divider 节点的时间
 * 用于纯笔记类事件的 preline 视觉化
 * 
 * @returns 按照 eventlog 顺序排列的时间戳数组
 */
function extractAllTimestamps(eventlog: string | undefined): string[] {
  if (!eventlog) return [];
  
  try {
    const nodes = JSON.parse(eventlog) as any[];
    return nodes
      .filter(node => node.type === 'timestamp-divider')
      .map(node => node.timestamp)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 时间格式化工具函数
 */
function formatTimeRange(start: string, end: string | null): string {
  const startTime = parseLocalTimeString(start);
  const endTime = end ? parseLocalTimeString(end) : null;
  
  const startStr = startTime.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  if (!endTime) return startStr;
  
  const endStr = endTime.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  return `${startStr} — ${endStr}`;
}

function calculateDuration(start: string, end: string | null): string {
  if (!end) return '';
  
  const diffMs = parseLocalTimeString(end).getTime() - parseLocalTimeString(start).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? minutes + 'min' : ''}`;
  }
  return `${minutes}min`;
}
```

##### Preline 视觉挂载规范（纯笔记 Event）

> **🎨 视觉架构**: 纯笔记 Event（情况5）将所有 `timestamp-divider` 节点的 preline 从 EventLog 编辑器层级**提升到 Event 卡片层级**，实现时间可视化。

**核心机制**:
1. **数据提取**: `extractAllTimestamps(eventlog)` 提取所有 timestamp-divider 节点
2. **视觉挂载**: 在 Event 卡片的 `position: relative` 容器中渲染 `.note-preline-container`
3. **层级关系**: 
   - ModalSlate 内部 preline: 编辑器展开时显示（连接段落间的时间戳）
   - Event 卡片 preline: 始终显示（卡片左侧，显示所有时间点）
4. **交互独立**: Preline 使用 `pointer-events: none` 不影响卡片点击

**视觉效果**:
```
┌─────────────────────────────────┐
│ ● Event Card Title              │  ← Event 卡片容器
│ │ 📝 14:32 +2 个时间点          │
│ │ [EventLog collapsed]          │
│ │                                │
│ ●─────────────────────────────  │  ← Preline 圆点（第1个 timestamp）
│ │                                │
│ ●─────────────────────────────  │  ← Preline 圆点（第2个 timestamp）
│ │                                │
│ ●                                │  ← Preline 圆点（第3个 timestamp）
└─────────────────────────────────┘
  ↑
  卡片左侧 -24px 处（与 ModalSlate preline 对齐）
```

**样式规范**:
- 圆点: 8px 直径，蓝色 `#3b82f6`，带白色描边
- 连接线: 2px 宽，蓝色渐变 `linear-gradient(to bottom, #3b82f6, #60a5fa)`
- 定位: `left: -24px`（与编辑器 preline 一致）
- 最后一个圆点: 不显示连接线

**数据流**:
```typescript
// EventLog JSON 结构
[
  { type: 'paragraph', children: [...] },
  { type: 'timestamp-divider', timestamp: '2025-12-03T14:32:00' },
  { type: 'paragraph', children: [...] },
  { type: 'timestamp-divider', timestamp: '2025-12-03T15:47:00' },
  ...
]
↓
extractAllTimestamps(eventlog)
↓
['2025-12-03T14:32:00', '2025-12-03T15:47:00', ...]
↓
渲染 .note-preline-segment × N
```

---

##### 时间轴位置计算

**核心规则**: 每个 Event 卡片根据自己的时间信息独立放置到时间轴上，不考虑父子事件关系。

```typescript
/**
 * 计算 Event 在时间轴上的位置
 * 
 * 优先级规则：
 * 1. Task（无固定时间）→ 使用 completedAt
 * 2. 有 segments（实际计时）→ 使用 segments[0].startTime
 * 3. 有 startTime（计划时间）→ 使用 startTime
 * 4. 纯笔记（只有 eventlog）→ 使用第一个 timestamp
 * 5. isPlan 事件（无时间）→ 返回 null（不显示）
 * 6. 都没有 → 使用 createdAt（fallback）
 */
function getEventTimelinePosition(event: Event): Date | null {
  // 1. Task 的完成时间
  if (event.isTask && event.completedAt) {
    return parseLocalTimeString(event.completedAt);
  }
  
  // 2. 实际计时开始时间（优先级更高，因为更准确）
  if (event.segments && event.segments.length > 0) {
    const sortedSegments = [...event.segments].sort((a, b) =>
      parseLocalTimeString(a.startTime).getTime() - parseLocalTimeString(b.startTime).getTime()
    );
    return parseLocalTimeString(sortedSegments[0].startTime);
  }
  
  // 3. 计划开始时间
  if (event.startTime) {
    return parseLocalTimeString(event.startTime);
  }
  
  // 4. 纯笔记：使用 eventlog 的第一个 timestamp
  const allTimestamps = extractAllTimestamps(event.eventlog);
  if (allTimestamps.length > 0) {
    return parseLocalTimeString(allTimestamps[0]);
  }
  
  // 5. isPlan 事件（无时间信息）→ 不显示在 TimeLog
  if (event.isPlan) {
    return null;
  }
  
  // 6. Fallback：创建时间
  if (event.createdAt) {
    return parseLocalTimeString(event.createdAt);
  }
  
  // 7. 最后的 Fallback：当前时间
  return formatTimeForStorage(new Date());
}
```

**注意事项**:
- ⚠️ EventEditModal V2 中展示完整的 EventTree 链路（父事件+子事件），但 TimeLog 页面中每个 Event 各自独立展示
- ⚠️ Timer 子事件会作为独立卡片出现在时间轴上，使用自己的 `segments[0].startTime` 定位
- ⚠️ 父事件（Plan）和子事件（Actual）分别显示，用户可以看到同一个任务的规划和执行两条记录
- ⚠️ **isPlan 事件不显示在 TimeLog**：数据加载时应过滤掉 `getEventTimelinePosition()` 返回 `null` 的事件
- ✅ **纯笔记事件可以显示**：没有 startTime/segments 但有 eventlog.timestamp 的事件，使用 timestamp 定位到时间轴

#### 2.4.2 标题区的数据集成

**数据源**: `event.title` (EventTitle 对象)

> **💡 条件渲染**: 纯 eventlog 事件可能没有标题（用户只是随手记了几句话），此时不渲染标题区域

##### EventTitle 三层架构（含格式记忆机制）✨ 【2025-12-08 更新】

根据 `EVENTHUB_TIMEHUB_ARCHITECTURE.md`，Event.title 是一个三层结构对象：

```typescript
interface TextFormatSegment {
  text: string;    // 文本片段
  format: {        // 格式属性
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    color?: string;
    backgroundColor?: string;
  };
}

interface EventTitle {
  simpleTitle: string;       // 纯文本标题（无格式）
  colorTitle?: string;       // 简化的 Slate JSON（移除 tag/dateMention，保留格式）
  fullTitle?: string;        // 完整 Slate JSON（包含所有元素）
  formatMap?: TextFormatSegment[];  // 🆕 富文本格式映射（用于恢复格式）
}
```

**formatMap 机制说明**：
- **用途**：记录文本片段的格式信息，用于从纯文本恢复富文本格式
- **场景**：Outlook 同步场景中，用户在 Outlook 编辑标题后同步回来，可以恢复原有的格式
- **工作流程**：
  1. `fullTitle → colorTitle`：自动提取 formatMap（记录哪些文字有哪些格式）
  2. `simpleTitle → fullTitle`：如果有 formatMap，智能匹配并恢复格式
  3. 容错机制：formatMap 失败不影响主流程，自动降级为纯文本
- **示例**：
  ```typescript
  // 原标题："需要**重点讨论**，联系<span style="color:red">张三</span>"
  // formatMap 提取：
  [
    { text: "重点讨论", format: { bold: true } },
    { text: "张三", format: { color: "red" } }
  ]
  // Outlook 回传："需要重点讨论，明天联系张三"
  // 恢复后："需要**重点讨论**，明天联系<span style="color:red">张三</span>"
  ```

**TimeLog 页面使用规则**:
- ✅ **使用 `fullTitle`**：可编辑的完整 Slate JSON，支持所有格式和元素
- ✅ **Fallback 到 `simpleTitle`**：如果 colorTitle 为空
- ❌ **不使用 `fullTitle`**：过于复杂，不适合列表展示
- 📌 **formatMap 自动处理**：由 EventService.normalizeTitle() 自动管理，无需手动操作

##### 渲染实现

```typescript
interface TitleDisplayProps {
  event: Event;
}

const TitleDisplay: React.FC<TitleDisplayProps> = ({ event }) => {
  // 提取 title 字段
  const titleObj = event.title;
  
  // 🔧 兼容性处理：旧数据可能是字符串格式
  const title = typeof titleObj === 'string' 
    ? titleObj 
    : (titleObj?.colorTitle || titleObj?.simpleTitle || '');
  
  // 🚫 无标题时不渲染（纯 eventlog 事件）
  if (!title) return null;
  
  // 提取 emoji（可能在 title 前缀或独立字段）
  const emoji = event.emoji || extractEmojiFromTitle(title);
  const titleText = removeEmojiPrefix(title);
  
  return (
    <div className="event-title-row">
      {emoji && <span className="event-emoji">{emoji}</span>}
      <h3 className="event-title">{titleText}</h3>
    </div>
  );
};

/**
 * 从标题中提取 emoji
 */
function extractEmojiFromTitle(title: string): string | null {
  const emojiRegex = /^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation})\s*/u;
  const match = title.match(emojiRegex);
  return match ? match[1] : null;
}

/**
 * 移除标题前缀的 emoji
 */
function removeEmojiPrefix(title: string): string {
  return title.replace(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation})\s*/u, '');
}
```

#### 2.4.3 参会人员和地点的条件显示

**交互设计**: 这两个字段仅在有内容或鼠标悬浮时显示，节省空间并保持界面整洁。

##### 显示规则

| 状态 | 参会人员 (attendees) | 地点 (location) |
|------|---------------------|----------------|
| **默认状态** | 有内容 → 显示<br>无内容 → 隐藏 | 有内容 → 显示<br>无内容 → 隐藏 |
| **鼠标悬浮** | 始终显示（带占位符） | 始终显示（带占位符） |

##### 实现代码

```typescript
interface EventCardProps {
  event: Event;
}

const EventCard: React.FC<EventCardProps> = ({ event }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // 判断是否有参会人员
  const hasAttendees = event.attendees && event.attendees.length > 0;
  
  // 判断是否有地点
  const hasLocation = !!event.location && event.location.trim().length > 0;
  
  return (
    <div 
      className="event-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ... 标题、标签等其他内容 ... */}
      
      {/* 参会人员行（条件显示）*/}
      {(hasAttendees || isHovered) && (
        <div className="event-attendees">
          <span className="attendee-icon">👥</span>
          <span className="attendee-text">
            {hasAttendees 
              ? formatAttendees(event.attendees)
              : <span className="placeholder">添加参会人员...</span>
            }
          </span>
        </div>
      )}
      
      {/* 地点行（条件显示）*/}
      {(hasLocation || isHovered) && (
        <div className="event-location">
          <span className="location-icon">📍</span>
          <span className="location-text">
            {hasLocation 
              ? event.location
              : <span className="placeholder">添加地点...</span>
            }
          </span>
        </div>
      )}
      
      {/* ... 其他内容 ... */}
    </div>
  );
};

/**
 * 格式化参会人员列表
 * 
 * 格式: "Zoey Gong; Jenny Wong; Cindy Cai"
 */
function formatAttendees(attendees: Contact[]): string {
  return attendees
    .map(contact => contact.name || contact.email)
    .filter(Boolean)
    .join('; ');
}
```

##### Event 卡片条件渲染总结

> **🎯 渲染原则**: 减少视觉噪音，只渲染有实际内容的区域

| 字段 | 无内容行为 | 有内容行为 | 说明 |
|------|-----------|-----------|------|
| **标题 (title)** | ❌ 不渲染 | ✅ 始终显示 | 纯 eventlog 事件可能没有标题 |
| **时间 (time)** | ✅ 显示 createdAt | ✅ 显示时间 | 所有 Event 都有时间信息（至少有创建时间） |
| **标签 (tags)** | ❌ 不渲染 | ✅ 始终显示 | 减少 DOM 和视觉噪音 |
| **参会人员 (attendees)** | 🎯 悬浮显示占位符 | ✅ 始终显示 | 便于快速添加 |
| **地点 (location)** | 🎯 悬浮显示占位符 | ✅ 始终显示 | 便于快速添加 |
| **关联事件 (relations)** | ❌ 不渲染 | ✅ 始终显示 | 只在有关联时显示 |
| **同步状态 (sync)** | 根据配置 | ✅ 显示 icon | 根据同步配置决定 |
| **EventLog 内容** | ❌ 不渲染 | 🎯 展开后显示 | 折叠状态默认隐藏 |

**条件渲染代码模式**:
```typescript
// 模式 1: 完全不渲染（无内容时）
{title && <TitleDisplay event={event} />}
{tags?.length > 0 && <TagList tags={tags} />}

// 模式 2: 悬浮显示占位符（便于快速添加）
{(hasAttendees || isHovered) && <AttendeeList />}
{(hasLocation || isHovered) && <LocationDisplay />}

// 模式 3: 根据配置显示
{shouldShowSyncStatus(event) && <SyncStatusIcon />}
```

##### CSS 样式

```css
/* 参会人员和地点行 */
.event-attendees,
.event-location {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
  opacity: 0;
  transition: opacity 0.2s ease;
}

/* 有内容或鼠标悬浮时显示 */
.event-card:hover .event-attendees,
.event-card:hover .event-location,
.event-attendees.has-content,
.event-location.has-content {
  opacity: 1;
}

/* 占位符样式 */
.placeholder {
  color: #9ca3af;
  font-style: italic;
}

/* Icon 样式 */
.attendee-icon,
.location-icon {
  font-size: 16px;
  flex-shrink: 0;
}
```

#### 2.4.4 标签的层级显示

**数据流**: `event.tags` (string[]) → TagService 查询 → 层级路径 + 颜色

##### 标签显示格式

标签需要显示完整的层级路径，例如：
- `#👜工作/#🧐文档编辑`
- `#👜重点客户/#🧐腾讯`

**数据结构**:
```typescript
interface Tag {
  id: string;
  name: string;
  emoji?: string;
  color: string;
  parentId?: string;
  children?: Tag[];
}
```

##### 实现代码

```typescript
import { TagService } from '../../services/TagService';

interface TagChipProps {
  tagId: string;
}

const TagChip: React.FC<TagChipProps> = ({ tagId }) => {
  // 从 TagService 获取标签信息
  const tag = TagService.getTagById(tagId);
  if (!tag) return null;
  
  // 获取标签的层级路径
  const tagPath = TagService.getTagPath(tagId);
  
  // 格式化显示文本
  const displayText = tagPath
    .map(t => `${t.emoji || ''}${t.name}`)
    .join('/');
  
  return (
    <span 
      className="event-tag"
      style={{ 
        backgroundColor: `${tag.color}20`, // 20% 透明度
        color: tag.color,
        borderColor: tag.color
      }}
    >
      #{displayText}
    </span>
  );
};

/**
 * 渲染事件的所有标签
 * 
 * 🎨 显示逻辑：
 * - 无标签时：不渲染标签区域（减少 DOM 和视觉噪音）
 * - 有标签时：始终显示
 */
const TagList: React.FC<{ tags: string[] }> = ({ tags }) => {
  // 🚫 无标签时不渲染
  if (!tags || tags.length === 0) return null;
  
  return (
    <div className="event-tags">
      {tags.map(tagId => (
        <TagChip key={tagId} tagId={tagId} />
      ))}
    </div>
  );
};
```

##### TagService 扩展方法

需要在 TagService 中添加以下方法：

```typescript
// src/services/TagService.ts

export class TagService {
  /**
   * 获取标签的完整层级路径
   * 
   * @example
   * getTagPath('tag-123') 
   * // => [{ id: 'tag-1', name: '工作', emoji: '👜' }, 
   * //     { id: 'tag-123', name: '文档编辑', emoji: '🧐' }]
   */
  static getTagPath(tagId: string): Tag[] {
    const tag = this.getTagById(tagId);
    if (!tag) return [];
    
    const path: Tag[] = [];
    let current: Tag | undefined = tag;
    
    while (current) {
      path.unshift(current);
      current = current.parentId 
        ? this.getTagById(current.parentId) 
        : undefined;
    }
    
    return path;
  }
  
  /**
   * 通过 ID 获取标签
   */
  static getTagById(tagId: string): Tag | undefined {
    // 实现从缓存或 localStorage 中获取标签
    const allTags = this.getAllTags();
    return this.findTagInTree(allTags, tagId);
  }
  
  /**
   * 递归查找标签（支持嵌套结构）
   */
  private static findTagInTree(tags: Tag[], tagId: string): Tag | undefined {
    for (const tag of tags) {
      if (tag.id === tagId) return tag;
      if (tag.children) {
        const found = this.findTagInTree(tag.children, tagId);
        if (found) return found;
      }
    }
    return undefined;
  }
}
```

#### 2.4.5 同步信息的显示

**重要变更**: TimeLog 页面没有"来源"概念，只有"同步"状态。

##### 数据源

**每个 Event 的独立同步配置（v2.15 单一配置架构）**:
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

> **💡 子事件配置继承规则**:
> 
> **1. 系统性子事件**（Timer、外部应用自动生成）:
> - ✅ **严格继承** `parentEvent.subEventConfig`（fallback 到 `parentEvent.calendarIds/syncMode`）
> - ✅ **用户可以修改**：但 EventEditModal 打开系统性子事件时，修改的是父事件的 `subEventConfig`
> - 📌 批量更新：父事件 `subEventConfig` 变更时，自动同步到所有 `isTimer=true` 的子事件
> - 🔧 实现：`calendarIds: parentEvent?.subEventConfig?.calendarIds || parentEvent?.calendarIds`
> 
> **2. 手动子事件**（用户在 PlanManager/TimeCalendar 手动创建）:
> - ✅ **默认继承** `parentEvent.subEventConfig`（创建时）
> - ✅ **可独立修改**：用户通过 EventEditModal 修改后不再跟随父事件
> - 📌 批量更新：不受父事件 `subEventConfig` 变更影响

##### 显示规则

| 事件类型 | 显示字段 | 数据源 | 说明 |
|---------|---------|--------|------|
| **父事件** | 同步模式 | `event.syncMode` | 父事件自己的同步配置 |
| **子事件（系统性）** | 同步模式 | `event.syncMode`（继承自 `parent.subEventConfig`） | Timer、外部应用生成 |
| **子事件（手动）** | 同步模式 | `event.syncMode`（可独立修改） | 用户手动创建，默认继承但可修改 |
| **外部来源事件** | 来源标注 | `event.source` + `event.calendarIds[0]` | 在下拉菜单中右对齐显示"来源" |

##### 同步模式映射表

```typescript
const SYNC_MODE_LABELS = {
  'receive-only': '只接收同步',
  'send-only': '仅发送',
  'send-only-private': '仅发送（私有）',
  'bidirectional': '双向同步',
  'bidirectional-private': '双向同步（私有）'
};
```

##### 实现代码

```typescript
interface SyncStatusProps {
  event: Event;
}

const SyncStatus: React.FC<SyncStatusProps> = ({ event }) => {
  // 获取同步模式（每个 Event 都有自己的 syncMode）
  const syncMode = event.syncMode;
  const calendarIds = event.calendarIds || [];
  
  // 🚫 无同步配置时不显示
  if (!syncMode || calendarIds.length === 0) {
    return null;
  }
  
  // 获取目标日历信息
  const calendarId = calendarIds[0];
  const calendar = getCalendarById(calendarId);
  
  // 格式化同步模式文本
  const syncModeLabel = SYNC_MODE_LABELS[syncMode] || '未知模式';
  
  // 判断是否为外部来源（Outlook/Google/iCloud）
  const isExternalSource = event.source && event.source !== 'local';
  
  return (
    <div className="event-sync-status">
      {/* 日历图标或来源图标 */}
      {isExternalSource ? (
        <SourceIcon source={event.source} />
      ) : (
        <span style={{ color: calendar?.color || '#6b7280' }}>●</span>
      )}
      
      {/* 同步文本 */}
      <span className="sync-text">
        同步
      </span>
      
      {/* 日历名称 */}
      <span className="calendar-name">
        {calendar?.name || '未知日历'}
      </span>
      
      {/* 同步状态指示器 */}
      <span 
        className={`sync-indicator ${syncConfig.mode.includes('bidirectional') ? 'active' : ''}`}
        title={syncModeLabel}
      />
      
      {/* 同步模式文本 */}
      <span className="sync-mode">
        {syncModeLabel}
      </span>
      
      {/* 外部来源标注（右对齐）*/}
      {isExternalSource && (
        <span className="source-label">来源</span>
      )}
    </div>
  );
};

/**
 * 来源图标组件
 */
const SourceIcon: React.FC<{ source: string }> = ({ source }) => {
  const iconMap = {
    outlook: '📧',
    google: '📅',
    icloud: '☁️',
    local: null
  };
  
  return <span>{iconMap[source] || '📁'}</span>;
};
```

##### CSS 样式

```css
.event-sync-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  font-size: 13px;
  color: #6b7280;
}

.sync-text {
  font-weight: 500;
}

.calendar-name {
  color: #374151;
}

.sync-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #d1d5db;
}

.sync-indicator.active {
  background-color: #10b981; /* 绿色：双向同步 */
}

.sync-mode {
  color: #9ca3af;
  font-size: 12px;
}

.source-label {
  margin-left: auto;
  color: #9ca3af;
  font-size: 12px;
  font-style: italic;
}
```

#### 2.4.6 任务和关联信息

**数据来源**: EventTree 模块（父子事件关系）

##### 任务信息显示（Task）

对于 `event.isTask === true` 的事件，显示：
- 创建时间：距现在多久（如 "创建于12h前"）
- DDL 提示：距离截止时间还有多久（如 "距ddl还有2h30min"）

```typescript
const TaskInfo: React.FC<{ event: Event }> = ({ event }) => {
  if (!event.isTask) return null;
  
  // 计算创建时间距现在多久
  const createdAgo = formatRelativeTime(event.createdAt);
  
  // 计算距离 DDL 还有多久
  const ddlRemaining = event.endTime 
    ? formatRemainingTime(event.endTime)
    : null;
  
  return (
    <div className="event-task-info">
      <span className="task-icon">📋</span>
      <span className="task-meta">
        创建于{createdAgo}
        {ddlRemaining && `，距离ddl还有${ddlRemaining}`}
      </span>
    </div>
  );
};

/**
 * 格式化相对时间
 * @example formatRelativeTime('2025-12-02 10:00:00') => "12h前"
 */
function formatRelativeTime(dateString: string): string {
  const date = parseLocalTimeString(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 60) return `${diffMinutes}min前`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h前`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}天前`;
}

/**
 * 格式化剩余时间
 * @example formatRemainingTime('2025-12-03 14:30:00') => "2h30min"
 */
function formatRemainingTime(endTime: string): string {
  const end = parseLocalTimeString(endTime);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  
  if (diffMs <= 0) return '已过期';
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? minutes + 'min' : ''}`;
  }
  return `${minutes}min`;
}
```

##### 关联任务显示（EventTree）

**数据查询**:
```typescript
import { EventService } from '../../services/EventService';

/**
 * 获取事件的关联信息
 */
async function getEventRelations(event: Event) {
  // 1. 获取父事件
  const parentEvent = event.parentEventId 
    ? await EventService.getEventById(event.parentEventId)
    : null;
  
  // 2. 获取同级事件（相同父事件的其他子事件）
  const siblingEvents = event.parentEventId
    ? await EventService.getEventsByParentId(event.parentEventId)
    : [];
  
  // 过滤掉自己
  const siblings = siblingEvents.filter(e => e.id !== event.id);
  
  // 3. 统计完成情况
  const completedCount = siblings.filter(e => e.isCompleted).length;
  const totalCount = siblings.length + 1; // +1 包括自己
  
  return {
    parentEvent,
    siblings,
    completedCount,
    totalCount
  };
}
```

**显示组件**:
```typescript
const RelatedTasks: React.FC<{ event: Event }> = ({ event }) => {
  const [relations, setRelations] = useState<any>(null);
  
  useEffect(() => {
    getEventRelations(event).then(setRelations);
  }, [event.id]);
  
  if (!relations || !relations.parentEvent) return null;
  
  return (
    <div className="event-related-tasks">
      <span className="link-icon">🔗</span>
      <span className="related-text">
        上级任务：{relations.parentEvent.title.simpleTitle}，
        同级任务已完成{relations.completedCount}/{relations.totalCount}，
        <button className="link-button">点击查看和修改任务群</button>
      </span>
    </div>
  );
};
```

#### 2.4.7 日志内容的解析和渲染

**数据源**: `event.eventlog` (Slate JSON 字符串)

##### EventLog 结构

```typescript
// Slate JSON 格式（存储在 event.eventlog）
type SlateNode = {
  type: 'paragraph' | 'timestamp-divider' | 'heading' | ...;
  children: Array<{ text: string } | SlateNode>;
  // timestamp-divider 特有属性
  timestamp?: string;           // 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  minutesSinceLast?: number;    // 距离上一个 timestamp 的分钟数
  isFirstOfDay?: boolean;       // 是否为当天第一个 timestamp
};
```

##### Timestamp 提取和显示

```typescript
import { jsonToSlateNodes } from '../../components/ModalSlate/serialization';

/**
 * 从 eventlog 中提取所有 timestamp 节点
 */
function extractTimestamps(eventlog: string): Array<{
  timestamp: string;  // 本地时间字符串格式
  displayText: string;
  contentAfter: string; // 该 timestamp 后的文本内容（到下一个 timestamp 或末尾）
}> {
  try {
    // 解析 Slate JSON
    const nodes = JSON.parse(eventlog) as SlateNode[];
    
    const timestamps: any[] = [];
    let currentTimestamp: any = null;
    let currentContent: string[] = [];
    
    nodes.forEach((node, index) => {
      if (node.type === 'timestamp-divider') {
        // 保存上一个 timestamp 的内容
        if (currentTimestamp) {
          timestamps.push({
            ...currentTimestamp,
            contentAfter: currentContent.join('\n')
          });
        }
        
        // 开始新的 timestamp
        const timestampStr = node.timestamp;  // 已经是本地时间字符串格式
        const displayText = node.isFirstOfDay
          ? timestampStr  // 直接使用，格式为 "2025-10-19 10:21:18"
          : `${node.minutesSinceLast}min later`;
        
        currentTimestamp = {
          timestamp: timestampStr,
          displayText
        };
        currentContent = [];
      } else if (node.type === 'paragraph') {
        // 提取段落文本
        const text = extractTextFromNode(node);
        if (text.trim()) {
          currentContent.push(text);
        }
      }
    });
    
    // 保存最后一个 timestamp 的内容
    if (currentTimestamp) {
      timestamps.push({
        ...currentTimestamp,
        contentAfter: currentContent.join('\n')
      });
    }
    
    return timestamps;
  } catch (error) {
    console.error('Failed to parse eventlog:', error);
    return [];
  }
}

/**
 * 递归提取节点中的文本
 */
function extractTextFromNode(node: SlateNode): string {
  if ('text' in node) {
    return node.text;
  }
  
  if (node.children) {
    return node.children.map(extractTextFromNode).join('');
  }
  
  return '';
}
```

##### 日志内容渲染组件

```typescript
const EventLogContent: React.FC<{ event: Event }> = ({ event }) => {
  if (!event.eventlog) return null;
  
  const timestamps = extractTimestamps(event.eventlog);
  const [expandedTimestamps, setExpandedTimestamps] = useState<Set<number>>(new Set([0])); // 默认展开第一个
  
  const toggleTimestamp = (index: number) => {
    setExpandedTimestamps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };
  
  return (
    <div className="event-log-section">
      {timestamps.map((ts, index) => (
        <React.Fragment key={index}>
          {/* Timestamp 行 */}
          <div className="timestamp-row">
            <button 
              className={`timestamp-toggle ${expandedTimestamps.has(index) ? 'expanded' : ''}`}
              onClick={() => toggleTimestamp(index)}
            >
              {expandedTimestamps.has(index) ? '▾' : '▸'}
            </button>
            <span className="timestamp-time">{ts.displayText}</span>
            <button className="timestamp-options">⊙</button>
          </div>
          
          {/* 内容（可折叠）*/}
          {expandedTimestamps.has(index) && (
            <div className="log-content">
              {ts.contentAfter}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
```

##### CSS 样式

```css
/* 日志区域 */
.event-log-section {
  margin-top: 16px;
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}

/* Timestamp 行 */
.timestamp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.timestamp-toggle {
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 12px;
  transition: color 0.2s;
}

.timestamp-toggle:hover {
  color: #374151;
}

.timestamp-toggle.expanded {
  color: #3b82f6;
}

.timestamp-time {
  font-size: 12px;
  color: #6b7280;
  font-family: 'Consolas', 'Monaco', monospace;
}

.timestamp-options {
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  margin-left: auto;
}

/* 日志内容 */
.log-content {
  padding-left: 28px; /* 与 timestamp 对齐 */
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
  white-space: pre-wrap;
}
```

---

## 3. Event.eventlog 字段

### 3.1 数据结构定义

**字段类型：**
```typescript
interface Event {
  // ... 其他字段
  
  /**
   * 富文本日志字段（Slate JSON 字符串）
   * 
   * 特性：
   * - 包含自动插入的 timestamp 分隔线
   * - 支持富文本格式（加粗、颜色、列表等）
   * - 支持附件、链接、标签提及
   * - 用户在 TimeLog/EventEditModal/PlanManager 中编辑
   * 
   * ⚠️ 注意：用户界面只编辑此字段，description 字段由系统自动生成
   */
  eventlog?: string;
  
  /**
   * HTML 同步字段（从 eventlog 自动转换）
   * 
   * ⚠️ 仅用于 Outlook 同步，用户界面不显示
   */
  description?: string;
}
```

**Slate JSON 示例：**
```json
[
  {
    "type": "timestamp-divider",
    "timestamp": "2025-10-19T10:21:18Z",
    "isFirstOfDay": true,
    "displayText": "2025-10-19 10:21:18",
    "children": [{ "text": "" }]
  },
  {
    "type": "paragraph",
    "children": [
      { "text": "处理完了一些出差的logistics，还有报销整理，" }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      { "text": "现在终于可以开工了！" }
    ]
  },
  {
    "type": "timestamp-divider",
    "timestamp": "2025-10-19T10:37:42Z",
    "minutesSinceLast": 16,
    "displayText": "16min later",
    "children": [{ "text": "" }]
  },
  {
    "type": "paragraph",
    "children": [
      { "text": "双击\"Alt\"召唤美桶、格式等，" },
      {
        "type": "tag",
        "tagId": "tag-123",
        "tagName": "工作",
        "mentionOnly": true,
        "children": [{ "text": "" }]
      },
      { "text": " 点击右下方问号..." }
    ]
  }
]
```

### 3.2 Timestamp 自动插入机制

#### 3.2.1 插入规则

**触发条件：**
1. **当天首次编辑** → 插入完整时间戳（如 `2025-10-19 10:21:18`）
2. **距上次编辑超过 5 分钟** → 插入相对时间戳（如 `16min later`）

**节点类型定义：**
```typescript
type TimestampDividerElement = {
  type: 'timestamp-divider';
  timestamp: string;           // 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  isFirstOfDay?: boolean;      // 是否为当天首次
  minutesSinceLast?: number;   // 距上次间隔（分钟）
  displayText: string;         // UI 显示文本
  children: [{ text: '' }];    // Slate Void 节点要求
};
```

#### 3.2.2 插入逻辑

**实现：**
```typescript
class EventLogTimestampService {
  private lastEditTimestamp: Map<string, string> = new Map();  // 存储本地时间字符串
  
  /**
   * 检查是否需要插入 timestamp
   * @param eventId Event ID
   * @param eventlog 当前 eventlog（Slate JSON）
   * @returns 是否需要插入
   */
  shouldInsertTimestamp(eventId: string, eventlog: string): boolean {
    const lastEditStr = this.lastEditTimestamp.get(eventId);
    const nowStr = formatTimeForStorage(new Date());
    
    // 情况1：当天首次编辑
    if (!lastEditStr || !isSameDay(parseLocalTimeString(lastEditStr), parseLocalTimeString(nowStr))) {
      return true;
    }
    
    // 情况2：距上次编辑超过 5 分钟
    const lastEdit = parseLocalTimeString(lastEditStr);
    const now = parseLocalTimeString(nowStr);
    const minutesElapsed = (now.getTime() - lastEdit.getTime()) / 1000 / 60;
    return minutesElapsed >= 5;
  }
  
  /**
   * 创建 timestamp divider 节点
   */
  createTimestampDivider(eventId: string): TimestampDividerElement {
    const lastEditStr = this.lastEditTimestamp.get(eventId);
    const nowStr = formatTimeForStorage(new Date());
    
    const isFirstOfDay = !lastEditStr || !isSameDay(parseLocalTimeString(lastEditStr), parseLocalTimeString(nowStr));
    const minutesSinceLast = lastEditStr
      ? Math.floor((parseLocalTimeString(nowStr).getTime() - parseLocalTimeString(lastEditStr).getTime()) / 1000 / 60)
      : undefined;
    
    const displayText = isFirstOfDay
      ? nowStr  // 本地时间字符串格式 "2025-10-19 10:21:18"
      : `${minutesSinceLast}min later`;
    
    return {
      type: 'timestamp-divider',
      timestamp: nowStr,  // 本地时间字符串格式
      isFirstOfDay,
      minutesSinceLast,
      displayText,
      children: [{ text: '' }]
    };
  }
  
  /**
   * 在 Slate 编辑器中插入 timestamp
   */
  insertTimestamp(editor: Editor, eventId: string) {
    if (!this.shouldInsertTimestamp(eventId, /* current eventlog */)) {
      return;
    }
    
    const timestampNode = this.createTimestampDivider(eventId);
    
    // 在当前光标位置插入
    Transforms.insertNodes(editor, timestampNode);
    
    // 更新最后编辑时间
    this.lastEditTimestamp.set(eventId, formatTimeForStorage(new Date()));
  }
}
```

#### 3.2.3 Slate 编辑器集成

**在 onChange 中检测：**
```typescript
const PlanSlateEditor: React.FC<Props> = ({ eventId, initialValue, onChange }) => {
  const [editor] = useState(() => withReact(createEditor()));
  const timestampService = useRef(new EventLogTimestampService());
  
  const handleChange = (newValue: Descendant[]) => {
    // 检查是否需要插入 timestamp
    const shouldInsert = timestampService.current.shouldInsertTimestamp(
      eventId,
      JSON.stringify(newValue)
    );
    
    if (shouldInsert) {
      // 插入 timestamp divider
      timestampService.current.insertTimestamp(editor, eventId);
    }
    
    // 触发保存
    onChange(newValue);
  };
  
  return (
    <Slate editor={editor} value={initialValue} onChange={handleChange}>
      <Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
      />
    </Slate>
  );
};
```

### 3.3 Timestamp 渲染

**Slate 自定义元素渲染：**
```tsx
const TimestampDivider: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element
}) => {
  const node = element as TimestampDividerElement;
  
  return (
    <div
      {...attributes}
      contentEditable={false}  // 不可编辑
      className="timestamp-divider"
    >
      <div className="timestamp-line">
        <span className="timestamp-icon">▸</span>
        <span className="timestamp-text">{node.displayText}</span>
        <span className="timestamp-badge">⊙</span>
      </div>
      {children}  {/* Slate Void 节点要求 */}
    </div>
  );
};
```

**样式定义：**
```css
.timestamp-divider {
  user-select: none;
  margin: 16px 0;
}

.timestamp-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 13px;
  color: #6b7280;
}

.timestamp-icon {
  font-size: 14px;
}

.timestamp-text {
  flex: 1;
  font-family: 'Courier New', monospace;
}

.timestamp-badge {
  font-size: 16px;
  opacity: 0.5;
}
```

### 3.4 不同场景下的显示策略

| 场景 | Timestamp 显示 | 说明 |
|------|----------------|------|
| TimeLog 页面 | ✅ 完整显示 | 时间轴视图，需要完整时间信息 |
| EventEditModal 右侧 | ✅ 完整显示 | Slate 编辑区，面积足够 |
| PlanManager description 行 | ❌ 隐藏 | 紧凑模式，过滤掉 timestamp-divider 节点 |

**PlanManager 隐藏 Timestamp 实现：**
```typescript
// PlanManager 渲染 eventlog 时
const renderEventLogWithoutTimestamp = (eventlog: string) => {
  const slateNodes = JSON.parse(eventlog) as Descendant[];
  
  // 过滤掉 timestamp-divider 节点
  const contentNodes = slateNodes.filter(
    node => (node as any).type !== 'timestamp-divider'
  );
  
  return (
    <Slate editor={editor} value={contentNodes}>
      <Editable />
    </Slate>
  );
};
```

### 3.5 Timestamp 完整技术流程

> **版本**: v1.0  
> **最后更新**: 2025-12-08  
> **实现位置**: 
> - `src/components/SlateCore/services/timestampService.ts` - EventLogTimestampService
> - `src/components/ModalSlate/ModalSlate.tsx` - Timestamp 集成
> - `src/components/ModalSlate/elements/TimestampDividerElement.tsx` - 渲染组件

#### 3.5.1 Timestamp 生成流程概览

Timestamp 的生成分为两个主要场景：

```
📝 Timestamp 生成流程
│
├─ 1️⃣ 读取时添加 (initialValue)
│   ├─ 触发时机：首次加载 eventlog 且有内容但无 timestamp
│   ├─ 数据来源：EventHistoryService.queryHistory (事件创建时间)
│   ├─ 插入位置：内容开头
│   └─ 标记格式：isFirstOfDay: true
│
├─ 2️⃣ 编辑时插入 (handleFocus)
│   ├─ 触发时机：聚焦编辑器 && 距上次编辑 ≥ 5 分钟
│   ├─ 数据来源：new Date() (当前时间)
│   ├─ 插入位置：文档末尾 + 新空段落
│   ├─ 状态标记：setPendingTimestamp(true)
│   └─ 光标定位：自动移到新段落
│
└─ 3️⃣ 失焦清理 (handleBlur)
    ├─ 触发条件：pendingTimestamp === true && timestamp 后无内容
    ├─ 清理逻辑：删除最后一个 timestamp + 空段落
    └─ 状态重置：setPendingTimestamp(false)
```

#### 3.5.2 核心服务：EventLogTimestampService

**位置**: `src/components/SlateCore/services/timestampService.ts`

**状态管理**：
```typescript
export class EventLogTimestampService {
  // 记录每个事件的最后编辑时间（Map<eventId, Date>）
  private lastEditTimestamp: Map<string, Date> = new Map();
  
  // 核心方法
  shouldInsertTimestamp(params: { contextId?, eventId?, editor?, value? }): boolean
  createTimestampDivider(eventId?: string): TimestampDividerElement
  insertTimestamp(editor: Editor, timestampElement?: TimestampDividerElement, eventId?: string): void
  removeEmptyTimestamp(editor: Editor): boolean
  updateLastEditTime(eventId: string, timestamp?: Date): void
}
```

**插入规则判断** (`shouldInsertTimestamp`):
```typescript
shouldInsertTimestamp(params): boolean {
  const contextId = params.contextId || params.eventId || 'light-editor';
  const lastEdit = this.lastEditTimestamp.get(contextId);
  const now = new Date();
  
  // 情况1：当天首次编辑（无历史记录 或 不是同一天）
  if (!lastEdit || !isSameDay(lastEdit, now)) {
    return true;  // 插入完整时间戳
  }
  
  // 情况2：距上次编辑超过 5 分钟
  const minutesElapsed = (now.getTime() - lastEdit.getTime()) / 1000 / 60;
  return minutesElapsed >= 5;  // 插入相对时间戳
}
```

**创建 Timestamp 节点** (`createTimestampDivider`):
```typescript
createTimestampDivider(eventId?: string): TimestampDividerElement {
  const contextId = eventId || 'light-editor';
  const lastEdit = this.lastEditTimestamp.get(contextId);
  const now = new Date();
  
  const isFirstOfDay = !lastEdit || !isSameDay(lastEdit, now);
  const minutesSinceLast = lastEdit 
    ? Math.floor((now.getTime() - lastEdit.getTime()) / 1000 / 60)
    : undefined;
  
  // 显示文本：首次 = 完整时间；否则 = 完整时间 + 相对时间
  const displayText = isFirstOfDay
    ? formatDateTime(now)  // "2025-10-19 10:21:18"
    : `${formatDateTime(now)} | ${formatRelativeTime(minutesSinceLast!)}`;  // "... | 16min later"
  
  return {
    type: 'timestamp-divider',
    timestamp: formatDateTime(now),  // ✅ 统一格式：YYYY-MM-DD HH:mm:ss
    isFirstOfDay,
    minutesSinceLast,
    displayText,
    children: [{ text: '' }]  // Slate Void 节点要求
  };
}
```

**时间格式规范**：
```typescript
// ✅ 统一使用本地时间格式（输出格式）
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  // 输出格式：2025-11-27 01:05:22（连字符 + 空格）
}

// 相对时间格式化
function formatRelativeTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}min later`;  // "16min later"
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h later`;  // "2h later"
  }
  
  return `${hours}h ${remainingMinutes}min later`;  // "2h 30min later"
}
```

**支持的输入格式（解析）**：

当从外部数据源（Outlook 同步、用户粘贴、批量导入）读取 eventlog 时，自动识别以下 timestamp 格式：

| 格式 | 示例 | 说明 |
|------|------|------|
| `YYYY-MM-DD HH:mm:ss` | `2025-11-27 01:05:22` | 标准格式（连字符） |
| `YYYY/MM/DD HH:mm:ss` | `2025/11/27 01:05:22` | 斜杠分隔符 |
| 带相对时间 | `2025-11-27 01:36:23 \| 31min later` | 包含相对时间后缀 |

**格式规范化逻辑**：

```typescript
// parseTextWithTimestamps() 中的规范化
const timestampPattern = /^(\d{4}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2})(\s*\|.*)?$/;
const match = line.match(timestampPattern);

if (match) {
  const timeStr = match[1];  // 提取时间戳字符串
  // 🔧 规范化为统一格式：YYYY-MM-DD HH:mm:ss（连字符 + 空格）
  const normalizedTimeStr = timeStr.replace(/\//g, '-'); // 斜杠转连字符
  
  slateNodes.push({
    type: 'timestamp-divider',
    timestamp: normalizedTimeStr,  // 统一格式：2025-11-27 01:05:22
    children: [{ text: '' }]
  });
}
```

**示例：解析多格式 timestamp**

输入文本（混合格式）：
```
2025/11/27 01:05:22
第一段内容...

2025-11-27 01:36:23 | 31min later
第二段内容...
```

解析后的 Slate 节点：
```typescript
[
  {
    type: 'timestamp-divider',
    timestamp: '2025-11-27 01:05:22',  // ✅ 规范化为连字符
    children: [{ text: '' }]
  },
  {
    type: 'paragraph',
    children: [{ text: '第一段内容...' }]
  },
  {
    type: 'timestamp-divider',
    timestamp: '2025-11-27 01:36:23',  // ✅ 已是标准格式
    children: [{ text: '' }]
  },
  {
    type: 'paragraph',
    children: [{ text: '第二段内容...' }]
  }
]
```

#### 3.5.3 ModalSlate 集成实现

**位置**: `src/components/ModalSlate/ModalSlate.tsx`

##### A. 读取时添加 Timestamp (initialValue)

**触发条件**：
- `enableTimestamp === true`
- `parentEventId` 存在
- 内容有实际文本但无 timestamp

**创建时间来源优先级**：
1. **EventHistoryService 创建记录**（最优先）
   - 查询 `operations: ['create']`
   - 支持所有来源：'user-edit', 'outlook-sync', 'batch-import'
2. **Eventlog 内的 timestamp 节点补录**（备选）
   - 如果没有创建记录，尝试从现有 timestamp 反向推断
   - 调用 `EventService.backfillEventHistoryFromTimestamps()`
3. **Event.createdAt 字段**（降级方案）
   - 如果补录失败，使用事件的创建时间戳
4. **Event.updatedAt 字段**（最终降级）
   - 如果连 createdAt 都没有，使用更新时间戳

**实现代码**：
```typescript
const initialValue = useMemo(() => {
  let nodes = slateJsonToNodes(content);
  
  // 防重复添加检查
  if (enableTimestamp && parentEventId && timestampAddedForContentRef.current !== content) {
    // 1. 检查是否有实际内容
    const hasActualContent = nodes.some((node: any) => {
      if (node.type === 'paragraph') {
        return node.children?.some((child: any) => child.text?.trim());
      }
      return node.type !== 'paragraph';
    });
    
    // 2. 检查是否已有 timestamp
    const hasTimestamp = nodes.some((node: any) => node.type === 'timestamp-divider');
    
    // 3. 有内容但无 timestamp → 添加
    if (hasActualContent && !hasTimestamp) {
      // 从 EventHistoryService 获取创建时间
      const createLog = EventHistoryService.queryHistory({
        eventId: parentEventId,
        operations: ['create'],
        limit: 1
      })[0];
      
      if (createLog) {
        const createTime = new Date(createLog.timestamp);
        const timestampStr = formatDateTime(createTime);
        
        // 在开头插入 timestamp
        nodes = [
          {
            type: 'timestamp-divider',
            timestamp: timestampStr,      // "2025-10-19 10:21:18"
            displayText: timestampStr,
            isFirstOfDay: true,
            children: [{ text: '' }]
          },
          ...nodes  // 原有内容
        ] as any;
        
        // 标记已处理，防止重复添加
        timestampAddedForContentRef.current = content;
      }
    }
  }
  
  return nodes;
}, [content, enableTimestamp, parentEventId]);
```

**Outlook 同步事件的特殊处理**：

从 Outlook 同步的事件流程：
```
Outlook Event (via MicrosoftCalendarService)
  ↓
ActionBasedSyncManager.convertRemoteEventToLocal()
  ↓ 提取 description HTML
EventService.normalizeEvent()
  ↓ 调用 normalizeEventLog(undefined, event.description)
EventLog 对象（从 description 生成 Slate JSON）
  ↓
EventService.createEventFromRemoteSync()
  ↓ 保存到 localStorage
EventHistoryService.logCreate(event, 'outlook-sync')  ← ✅ 记录创建历史
  ↓
用户打开 TimeLog 页面
  ↓
ModalSlate 初始化
  ↓ EventHistoryService.queryHistory({ eventId, operations: ['create'] })
找到创建记录（source: 'outlook-sync'）✅
  ↓
在 eventlog 开头添加 timestamp（使用创建时间）
```

**降级方案示例**：
```typescript
// useEffect 中的完整逻辑（带 fallback）
if (!createLog) {
  // 尝试从 eventlog 的 timestamp 节点补录
  const event = EventService.getEventById(parentEventId);
  if (event && event.eventlog) {
    const backfilledCount = EventService.backfillEventHistoryFromTimestamps(
      parentEventId, 
      event.eventlog
    );
    
    if (backfilledCount > 0) {
      // 重新查询
      createLog = EventHistoryService.queryHistory({
        eventId: parentEventId,
        operations: ['create'],
        limit: 1
      })[0];
    } else {
      // 补录失败，使用 event.createdAt 作为 fallback
      if (event.createdAt) {
        createLog = {
          id: 'fallback-' + parentEventId,
          eventId: parentEventId,
          operation: 'create',
          timestamp: event.createdAt,
          source: 'fallback-createdAt',
          changes: []
        } as any;
      } else if (event.updatedAt) {
        // 最终降级：使用 updatedAt
        createLog = {
          id: 'fallback-' + parentEventId,
          eventId: parentEventId,
          operation: 'create',
          timestamp: event.updatedAt,
          source: 'fallback-updatedAt',
          changes: []
        } as any;
      }
    }
  }
}
```

##### B. 编辑时插入 Timestamp

**版本更新**: v2.0 - 2025-12-08  
**优化**: 智能识别用户编辑意图，避免打断用户续写

###### B1. 聚焦时检查 (handleFocus)

**触发条件**：
- 编辑器聚焦
- `enableTimestamp === true`
- ⚠️ **新增检查**：光标不在已有 timestamp 的段落组中
- `shouldInsertTimestamp()` 返回 true（距上次 ≥ 5 分钟）

**用户意图识别**：
```typescript
// 🔧 检查光标是否在已有 timestamp 的段落组中
const { selection } = editor;
if (selection) {
  const [paraMatch] = Editor.nodes(editor, {
    at: selection,
    match: (n: any) => n.type === 'paragraph',
  });
  
  if (paraMatch) {
    const [, path] = paraMatch;
    // 向上查找是否有 timestamp
    for (let i = path[0] - 1; i >= 0; i--) {
      const node = editor.children[i] as any;
      if (node.type === 'timestamp-divider') {
        // 用户点击已有段落，想续写内容
        console.log('[ModalSlate] 光标在已有 timestamp 的段落组中，不插入新 timestamp');
        return;  // ⛔ 不插入，避免打断用户
      }
      if (node.type !== 'paragraph') {
        break; // 遇到其他类型节点，停止查找
      }
    }
  }
}
```

**实现代码**：
```typescript
const handleFocus = useCallback(() => {
  if (enableTimestamp && timestampServiceRef.current && parentEventId) {
    // 🔧 检查光标位置，避免打断用户续写
    const { selection } = editor;
    if (selection) {
      try {
        const [paraMatch] = Editor.nodes(editor, {
          at: selection,
          match: (n: any) => n.type === 'paragraph',
        });
        
        if (paraMatch) {
          const [, path] = paraMatch;
          let hasTimestampAbove = false;
          
          for (let i = path[0] - 1; i >= 0; i--) {
            const node = editor.children[i] as any;
            if (node.type === 'timestamp-divider') {
              hasTimestampAbove = true;
              break;
            }
            if (node.type !== 'paragraph') break;
          }
          
          if (hasTimestampAbove) {
            console.log('[ModalSlate] 用户在已有段落中续写，不插入 timestamp');
            return;
          }
        }
      } catch (error) {
        console.error('[ModalSlate] 检查段落组失败:', error);
      }
    }
    // 检查是否需要插入（5分钟间隔）
    const shouldInsert = timestampServiceRef.current.shouldInsertTimestamp({
      contextId: parentEventId,
      eventId: parentEventId
    });
    
    if (shouldInsert) {
      console.log('[ModalSlate] 聚焦时插入 timestamp（等待用户输入）');
      
      // 创建 timestamp 节点
      const timestampNode = timestampServiceRef.current.createTimestampDivider(parentEventId);
      
      // 插入 timestamp + 空段落
      timestampServiceRef.current.insertTimestamp(editor, timestampNode, parentEventId);
      
      // 标记为待确认（用户尚未输入内容）
      setPendingTimestamp(true);
    } else {
      console.log('[ModalSlate] 聚焦但距上次编辑未超过 5 分钟，不插入 timestamp');
    }
  }
}, [enableTimestamp, editor, parentEventId]);
```

###### B2. 回车键时插入 (handleKeyDown Enter)

**版本**: v2.0 - 2025-12-08  
**触发时机**: 用户按 Enter 键创建新段落后

**触发条件**：
- 用户按下 Enter 键（非 Shift+Enter）
- `enableTimestamp === true`
- 距上次编辑 ≥ 5 分钟

**设计理念**：
- ✅ **主动换行**：用户按 Enter 说明要开始新内容，此时插入 timestamp 更合理
- ✅ **不打断输入**：在新段落之前插入，不影响用户当前输入
- ✅ **符合习惯**：类似聊天软件的时间戳显示逻辑

**实现代码**：
```typescript
// 🆕 Enter 键：检查是否需要插入 timestamp
if (event.key === 'Enter' && !event.shiftKey && enableTimestamp && timestampServiceRef.current && parentEventId) {
  // 延迟检查，等待新段落创建后
  setTimeout(() => {
    const shouldInsert = timestampServiceRef.current!.shouldInsertTimestamp({
      contextId: parentEventId,
      eventId: parentEventId
    });
    
    if (shouldInsert) {
      console.log('[ModalSlate] 回车后插入 timestamp（距上次编辑 ≥ 5 分钟）');
      
      const { selection } = editor;
      if (!selection) return;
      
      // 创建 timestamp 节点
      const timestampNode = timestampServiceRef.current!.createTimestampDivider(parentEventId);
      
      // 在当前段落之前插入 timestamp
      try {
        const [paraMatch] = Editor.nodes(editor, {
          at: selection,
          match: (n: any) => n.type === 'paragraph',
        });
        
        if (paraMatch) {
          const [, path] = paraMatch;
          Editor.withoutNormalizing(editor, () => {
            Transforms.insertNodes(editor, timestampNode as any, { at: [path[0]] });
          });
          
          // 更新最后编辑时间
          timestampServiceRef.current!.updateLastEditTime(parentEventId);
        }
      } catch (error) {
        console.error('[ModalSlate] 插入 timestamp 失败:', error);
      }
    }
  }, 0);
}
```

**用户体验对比**：

| 场景 | v1.0 行为（旧） | v2.0 行为（新） | 改进说明 |
|------|----------------|----------------|---------|
| 点击已有段落续写 | ❌ 聚焦时插入新 timestamp | ✅ 不插入，保持原 timestamp | 避免打断用户续写 |
| 点击空白处编辑 | ✅ 聚焦时插入 timestamp | ✅ 聚焦时插入 timestamp | 行为一致 |
| 在已有段落按 Enter | ❌ 无反应 | ✅ 检查时间间隔，按需插入 | 主动换行时插入更合理 |
| 快速连续换行 | ❌ 可能多次插入 | ✅ 5 分钟内不重复插入 | 避免 timestamp 过密 |

**插入逻辑详解** (`insertTimestamp`):
```typescript
insertTimestamp(editor: Editor, timestampElement?: TimestampDividerElement, eventId?: string): void {
  const timestampNode = timestampElement || this.createTimestampDivider(eventId);
  const childrenCount = editor.children.length;
  
  // 检查是否为空编辑器（只有一个空段落）
  const isEmptyEditor = childrenCount === 1 
    && editor.children[0].type === 'paragraph'
    && editor.children[0].children.length === 1
    && (editor.children[0].children[0] as any).text === '';
  
  // 创建新空段落供用户输入
  const emptyParagraph = {
    type: 'paragraph',
    children: [{ text: '' }]
  };
  
  if (isEmptyEditor) {
    // 空编辑器：删除默认空段落，插入 timestamp + 空段落
    Transforms.removeNodes(editor, { at: [0] });
    Transforms.insertNodes(editor, [timestampNode, emptyParagraph] as any, { at: [0] });
  } else {
    // 非空编辑器：追加到末尾
    Transforms.insertNodes(editor, [timestampNode, emptyParagraph] as any, { at: [childrenCount] });
  }
  
  // 移动光标到新段落
  const newParagraphPath = isEmptyEditor ? [1, 0] : [childrenCount + 1, 0];
  Transforms.select(editor, { 
    anchor: { path: newParagraphPath, offset: 0 },
    focus: { path: newParagraphPath, offset: 0 }
  });
  
  // 更新最后编辑时间（防止短时间内重复插入）
  if (eventId) {
    this.lastEditTimestamp.set(eventId, new Date());
  }
}
```

##### C. 失焦清理空 Timestamp (handleBlur)

**触发条件**：
- `pendingTimestamp === true`（标记有待确认的 timestamp）
- timestamp 后面没有任何实际内容

**实现代码**：
```typescript
const handleBlur = useCallback(() => {
  if (pendingTimestamp && timestampServiceRef.current) {
    console.log('[ModalSlate] 失焦时检查是否需要清理空 timestamp');
    
    // 查找最后一个 timestamp 的位置
    let lastTimestampIndex = -1;
    for (let i = editor.children.length - 1; i >= 0; i--) {
      const node = editor.children[i] as any;
      if (node.type === 'timestamp-divider') {
        lastTimestampIndex = i;
        break;
      }
    }
    
    // 检查 timestamp 后是否有实际内容
    if (lastTimestampIndex !== -1) {
      let hasContentAfterTimestamp = false;
      for (let i = lastTimestampIndex + 1; i < editor.children.length; i++) {
        const node = editor.children[i] as any;
        // 有文本内容算作"有内容"
        // ⚠️ 空 bullet 不算内容，会被一起清理
        if (node.type === 'paragraph' && node.children?.[0]?.text?.trim()) {
          hasContentAfterTimestamp = true;
          break;
        }
      }
      
      // timestamp 后无内容 → 删除
      if (!hasContentAfterTimestamp) {
        console.log('[ModalSlate] 用户未输入内容，删除本次插入的 timestamp');
        timestampServiceRef.current.removeEmptyTimestamp(editor);
      } else {
        console.log('[ModalSlate] 用户已输入内容，保留 timestamp');
      }
    }
    
    setPendingTimestamp(false);
  }
  
  // 立即保存当前内容
  flushPendingChanges();
}, [pendingTimestamp, editor, flushPendingChanges]);
```

**清理逻辑** (`removeEmptyTimestamp`):
```typescript
removeEmptyTimestamp(editor: Editor): boolean {
  try {
    const children = editor.children;
    
    // 只检查最后一个 timestamp
    for (let i = children.length - 1; i >= 0; i--) {
      const node = children[i] as any;
      if (node.type === 'timestamp-divider') {
        // 检查后续节点是否有内容
        const hasContentAfter = children.slice(i + 1).some((nextNode: any) => {
          return nextNode.type === 'paragraph' && 
                 nextNode.children?.[0]?.text?.trim();
        });
        
        if (!hasContentAfter) {
          // 删除空 timestamp
          Transforms.removeNodes(editor, { at: [i] });
          console.log('[TimestampService] 移除空的 timestamp');
          return true;
        }
        
        // 只处理最后一个 timestamp
        break;
      }
    }
    
    return false;
  } catch (error) {
    console.error('[TimestampService] 清理空 timestamp 失败:', error);
    return false;
  }
}
```

#### 3.5.4 特殊处理：Bullet Point 插入

当用户插入 bullet point 时，立即清除 `pendingTimestamp` 标记，认为用户已输入有效内容：

```typescript
const applyTextFormat = useCallback((command: string): boolean => {
  if (command === 'toggleBulletList') {
    // ... bullet 插入逻辑 ...
    
    // 🔥 清除 pendingTimestamp 标记，bullet 算作有效内容
    setPendingTimestamp(false);
    console.log('[ModalSlate] 插入 bullet，清除 pendingTimestamp');
  }
  
  return true;
}, [editor]);
```

#### 3.5.5 外部调用接口

**TimeLog 页面点击空白区域插入 Timestamp**：

```typescript
// TimeLog.tsx
const handleEventClick = (event: Event, e: React.MouseEvent) => {
  // ... 展开事件 ...
  
  // 触发 ModalSlate 插入 timestamp + 预行 + 光标定位
  const slateRef = slateRefs.current.get(event.id);
  if (slateRef && slateRef.insertTimestampAndFocus) {
    slateRef.insertTimestampAndFocus();
  }
};

// ModalSlate 暴露的接口
useImperativeHandle(ref, () => ({
  editor,
  applyTextFormat,
  insertTimestampAndFocus: () => {
    if (!enableTimestamp || !parentEventId || !timestampServiceRef.current) {
      return;
    }

    // 触发插入 timestamp
    setPendingTimestamp(true);
    
    // 延迟聚焦到编辑器
    setTimeout(() => {
      ReactEditor.focus(editor);
      Transforms.select(editor, Editor.end(editor, []));
    }, 100);
  }
}), [editor, applyTextFormat, enableTimestamp, parentEventId]);
```

#### 3.5.6 数据流总结

**版本**: v2.0 - 2025-12-08

```
┌─────────────────────────────────────────────────────────────┐
│                Timestamp 完整数据流 (v2.0)                    │
└─────────────────────────────────────────────────────────────┘

📖 读取场景（首次加载）
──────────────────────────────────────────────────────────────
EventHistoryService.queryHistory()
  ↓ 查询创建时间（支持 outlook-sync, batch-import）
createTime: Date
  ↓ 如果无记录，使用 event.createdAt fallback
  ↓ formatDateTime(createTime)
timestamp: "2025-10-19 10:21:18"
  ↓ 构建节点
{ type: 'timestamp-divider', timestamp, isFirstOfDay: true, ... }
  ↓ 插入到 initialValue 开头
nodes = [timestampNode, ...existingNodes]
  ↓ 渲染
<TimestampDividerElement displayText="2025-10-19 10:21:18" />


✏️ 编辑场景 1（聚焦检查 - v2.0 新增智能检测）
──────────────────────────────────────────────────────────────
handleFocus()
  ↓ 🆕 检查光标位置
光标在已有 timestamp 的段落组中？
  ↓ YES → return（用户想续写，不打断）
  ↓ NO → 继续检查
shouldInsertTimestamp(parentEventId)
  ↓ 距上次 ≥ 5 分钟 → true
createTimestampDivider(parentEventId)
  ↓ 计算相对时间
minutesSinceLast: 16
displayText: "2025-10-19 10:35:18 | 16min later"
  ↓ 插入到文档末尾
insertTimestamp(editor, timestampNode, parentEventId)
  ↓ 标记待确认
setPendingTimestamp(true)
  ↓ 等待用户输入
...


✏️ 编辑场景 2（回车键插入 - v2.0 新增）
──────────────────────────────────────────────────────────────
handleKeyDown(event: Enter)
  ↓ 延迟检查（等待新段落创建）
setTimeout(() => {
  shouldInsertTimestamp(parentEventId)
    ↓ 距上次 ≥ 5 分钟 → true
  获取当前段落路径
    ↓ 在当前段落之前插入 timestamp
  Transforms.insertNodes(editor, timestampNode, { at: [path[0]] })
    ↓ 更新最后编辑时间
  timestampServiceRef.updateLastEditTime(parentEventId)
}, 0)


🔄 内容变化监听（v2.0 新增 preline 自动清理）
──────────────────────────────────────────────────────────────
handleChange(newValue)
  ↓ 🆕 检测 timestamp 数量变化
currentTimestampCount !== timestampCountRef.current
  ↓ YES → 强制重新渲染（清理残留 preline）
forceUpdate({})
  ↓ 所有段落重新计算 needsPreline
  ↓ preline 显示状态更新
  ↓ 用户输入内容
setPendingTimestamp(false)
  ↓ 自动保存
onChange(slateJson) → EventHub.updateFields()


🧹 清理场景（失焦检查）
──────────────────────────────────────────────────────────────
handleBlur()
  ↓ 检查待确认状态
pendingTimestamp === true
  ↓ 查找最后一个 timestamp
lastTimestampIndex
  ↓ 检查后续内容
hasContentAfterTimestamp
  ↓ 无内容 → 删除
removeEmptyTimestamp(editor)
  ↓ 重置状态
setPendingTimestamp(false)
```

#### 3.5.7 关键状态管理

**版本**: v2.0 - 2025-12-08

| 状态 | 类型 | 作用 | 生命周期 | v2.0 变更 |
|------|------|------|---------|----------|
| `lastEditTimestamp` | `Map<string, Date>` | 记录每个事件的最后编辑时间 | EventLogTimestampService 实例级 | 无变更 |
| `pendingTimestamp` | `boolean` | 标记是否有待确认的 timestamp | ModalSlate 组件级 | 无变更 |
| `timestampAddedForContentRef` | `string \| null` | 记录已添加 timestamp 的 content | ModalSlate 组件级（防重复） | 无变更 |
| `isEditingRef` | `boolean` | 标记是否正在编辑（防外部同步） | ModalSlate 组件级 | 无变更 |
| `timestampCountRef` | `number` | 🆕 追踪 timestamp 数量变化 | ModalSlate 组件级 | 🆕 新增（用于 preline 清理） |

**状态转换图 (v2.0)**：
```
初始状态: pendingTimestamp = false
         ↓
    ┌────┴─────┐
    ↓          ↓
handleFocus()  handleKeyDown(Enter)  
    ↓          ↓
🆕 检查光标   延迟检查（等待新段落创建）
    ↓          ↓
在已有段落？  shouldInsertTimestamp() === true
    ↓          ↓
YES → return  insertTimestamp()
NO → 继续      ↓
    ↓          
shouldInsertTimestamp() === true
    ↓
insertTimestamp()
    ↓
pendingTimestamp = true （待确认）
         ↓
    ┌────────┴────────┐
    ↓                 ↓
用户输入内容      用户未输入（失焦）
    ↓                 ↓
handleChange()    handleBlur()
    ↓                 ↓
🆕 检测 timestamp  removeEmptyTimestamp()
数量变化 → 强制       ↓
重新渲染          pendingTimestamp = false
    ↓
pendingTimestamp = false
```

#### 3.5.8 Preline 自动清理机制

**版本**: v2.0 - 2025-12-08  
**问题**: 用户删除 timestamp 后，preline 残留在界面上

**解决方案**：监听 timestamp 数量变化，强制重新渲染

**实现代码**：
```typescript
// 用于追踪 timestamp 数量变化，触发重新渲染
const [, forceUpdate] = useState({});
const timestampCountRef = useRef(0);

const handleChange = useCallback((newValue: Descendant[]) => {
  // 🔍 检测 timestamp 数量变化（可能是删除或添加）
  const currentTimestampCount = newValue.filter(
    (node: any) => node.type === 'timestamp-divider'
  ).length;
  
  if (currentTimestampCount !== timestampCountRef.current) {
    console.log('[ModalSlate] 🔄 Timestamp 数量变化:', 
      timestampCountRef.current, '→', currentTimestampCount);
    
    timestampCountRef.current = currentTimestampCount;
    
    // 强制重新渲染所有段落（更新 preline 状态）
    forceUpdate({});
  }
  
  // ... 其他逻辑 ...
}, [/* dependencies */]);
```

**needsPreline 计算优化**：
```typescript
const needsPreline = (() => {
  try {
    const path = ReactEditor.findPath(editor, element);
    if (!path) return false;
    
    // 🔧 向上查找最近的 timestamp（必须是紧邻的）
    let hasTimestamp = false;
    let timestampIndex = -1;
    
    for (let i = path[0] - 1; i >= 0; i--) {
      const node = editor.children[i] as any;
      if (node.type === 'timestamp-divider') {
        hasTimestamp = true;
        timestampIndex = i;
        break;
      }
      if (node.type !== 'paragraph') {
        break; // 遇到其他类型节点，停止查找
      }
    }
    
    if (!hasTimestamp) return false;
    
    // 🔧 检查 timestamp 和当前段落之间是否只有 paragraph 节点
    for (let i = timestampIndex + 1; i < path[0]; i++) {
      const node = editor.children[i] as any;
      if (node.type !== 'paragraph') {
        return false; // 中间有其他类型节点，不属于这个 timestamp 组
      }
    }
    
    // 有内容或属于 timestamp 组 → 显示 preline
    const hasContent = (element as any).children?.some(
      (child: any) => child.text?.trim()
    );
    return hasContent || true;
  } catch {
    return false;
  }
})();
```

**清理流程**：
```
用户删除 timestamp
  ↓
handleChange() 触发
  ↓ 检测 timestamp 数量变化
timestampCount: 3 → 2
  ↓ 强制重新渲染
forceUpdate({})
  ↓ 所有段落重新计算 needsPreline
paragraph A: hasTimestamp = false → needsPreline = false
paragraph B: hasTimestamp = true → needsPreline = true
  ↓ React 更新 DOM
preline 显示状态正确更新 ✅
```

#### 3.5.9 功能完整性确认

> **版本**: v2.0  
> **状态**: ✅ 功能完整  
> **测试场景覆盖**: 本地创建、Outlook 同步、批量导入、用户编辑意图识别  
> **最后验证**: 2025-12-08

**支持的事件来源**：

| 来源 | EventHistoryService Source | Timestamp 添加 | v2.0 改进 |
|------|---------------------------|---------------|-----------|
| **本地创建** | 'user-edit' | ✅ 自动添加 | EventService.createEvent() 记录创建历史 |
| **Outlook 同步** | 'outlook-sync' | ✅ 自动添加 (Fallback支持) | ✅ 使用 event.createdAt fallback |
| **批量导入** | 'batch-import' | ✅ 自动添加 | importEvents() 记录创建历史 |
| **旧数据补录** | 'backfill-from-timestamp' | ✅ 从节点补录 | backfillEventHistoryFromTimestamps() |

**v2.0 用户体验改进**：

| 场景 | v1.0 行为 | v2.0 行为 | 改进说明 |
|------|----------|----------|---------|
| 点击已有段落续写 | ❌ 聚焦时插入新 timestamp | ✅ 不插入，保持原 timestamp | 避免打断用户续写 |
| 点击空白处编辑 | ✅ 聚焦时插入 | ✅ 聚焦时插入 | 行为一致 |
| 在已有段落按 Enter | ❌ 无反应 | ✅ 按需插入 timestamp | 主动换行时插入更合理 |
| 快速连续换行 | ❌ 可能多次插入 | ✅ 5分钟内不重复 | 避免 timestamp 过密 |
| 删除 timestamp | ⚠️ preline 残留 | ✅ preline 自动清理 | 强制重新渲染机制 |
| 无历史记录的事件 | ⚠️ 无 timestamp | ✅ 使用 createdAt fallback | Outlook 事件兼容性 |

**Outlook 同步事件的完整流程验证**：

```
🔍 场景：上周在 Outlook 创建事件 "开会讨论项目" (2025-12-01 14:00)
      本周（2025-12-08）打开 4DNote 同步
      ↓
1️⃣ MicrosoftCalendarService 拉取事件
   - id: "outlook-AAMkAD..."
   - subject: "开会讨论项目"
   - body.content: "<html>会议议程...</html>"
   - createdDateTime: "2025-12-01T14:00:00"  ← Outlook 原始创建时间
      ↓
2️⃣ ActionBasedSyncManager.convertRemoteEventToLocal()
   - description: "会议议程..."（清理后的 HTML）
   - createdAt: "2025-12-01 14:00:00"  ← 保留 Outlook 创建时间
   - 调用 EventService.normalizeEvent()
      ↓
3️⃣ EventService.normalizeEventLog(undefined, description)
   - 从 HTML 生成 Slate JSON
   - eventlog.slateJson: '[{"type":"paragraph","children":[{"text":"会议议程..."}]}]'
      ↓
4️⃣ EventService.createEventFromRemoteSync()
   - 保存到 localStorage
   - ✅ EventHistoryService.logCreate(event, 'outlook-sync', createdAtTime)
   - ⚠️ customTimestamp 使用 event.createdAt（Outlook 创建时间）
   - ⚠️ 而非 new Date()（同步时间 2025-12-08）
      ↓
5️⃣ 用户打开 TimeLog 页面，点击事件
      ↓
6️⃣ ModalSlate 初始化（enableTimestamp=true）
   - 检测：有内容（"会议议程..."），无 timestamp
   - EventHistoryService.queryHistory({ eventId, operations: ['create'] })
   - ✅ 找到创建记录（timestamp: "2025-12-01 14:00:00", source: 'outlook-sync'）
      ↓
7️⃣ 在 eventlog 开头添加 timestamp（使用 Outlook 原始创建时间）
   ```
   [
     {
       "type": "timestamp-divider",
       "timestamp": "2025-12-01 14:00:00",  ← ✅ Outlook 创建时间
       "displayText": "2025-12-01 14:00:00",
       "isFirstOfDay": true,
       "children": [{"text": ""}]
     },
     {
       "type": "paragraph",
       "children": [{"text": "会议议程..."}]
     }
   ]
   ```
      ↓
8️⃣ 用户看到的 eventlog（TimeLog 页面）
   ```
   ┌─────────────────────────────────────────┐
   │ ▸ 2025-12-01 14:00:00 ⊙                │  ← ✅ 显示 Outlook 创建时间
   │ 会议议程...                             │
   └─────────────────────────────────────────┘
   ```
```

**关键修复（2025-12-08）**：

```typescript
// ❌ 修复前：使用同步时间（错误）
EventHistoryService.logCreate(finalEvent, 'outlook-sync');
// timestamp = new Date() → 2025-12-08（同步时间）

// ✅ 修复后：使用 Outlook 创建时间（正确）
const createdAtTime = finalEvent.createdAt 
  ? parseLocalTimeString(finalEvent.createdAt) 
  : new Date();
EventHistoryService.logCreate(finalEvent, 'outlook-sync', createdAtTime);
// timestamp = event.createdAt → 2025-12-01（Outlook 创建时间）
```

**同样的修复应用于批量导入**：

```typescript
// ✅ 批量导入也使用 event.createdAt
batchResult.success.forEach(event => {
  const createdAtTime = event.createdAt 
    ? parseLocalTimeString(event.createdAt) 
    : new Date();
  EventHistoryService.logCreate(event as any as Event, 'batch-import', createdAtTime);
});
```

**边界情况处理**：

✅ **缺少创建记录**
- 尝试从 eventlog 的 timestamp 节点补录
- 补录失败则使用 `event.createdAt`
- 最终降级使用 `event.updatedAt`

✅ **重复打开同一事件**
- `timestampAddedForContentRef` 缓存已处理的 content
- 同一内容不会重复添加 timestamp

✅ **空 eventlog**
- 检测 `hasActualContent === false`
- 不添加 timestamp（避免只有 timestamp 的空日志）

✅ **已有 timestamp**
- 检测 `hasTimestamp === true`
- 跳过添加逻辑，更新 `lastEditTimestamp`

✅ **混合格式 timestamp（v2.4.1 新增 2025-12-08）**
- 支持 `2025-11-27 01:05:22`（连字符）
- 支持 `2025/11/27 01:05:22`（斜杠）
- 自动规范化为统一格式 `YYYY-MM-DD HH:mm:ss`
- 用于 Outlook 同步、用户粘贴、批量导入等场景

**Timestamp 解析健壮性验证**：

```typescript
// 测试用例：混合格式输入
const testInput = `
2025/11/27 01:05:22
Outlook 同步的内容（斜杠格式）

2025-11-27 01:36:23
用户手动输入的内容（连字符格式）

2025/12/01 09:00:00 | 3d later
批量导入的内容（斜杠 + 相对时间）
`;

// 解析结果：所有格式都能正确识别并规范化
const slateNodes = EventService.normalizeEventLog(testInput);
// ✅ 所有 timestamp 都被转换为 'YYYY-MM-DD HH:mm:ss' 格式
// ✅ 内容正确分段，每个 timestamp 后跟对应的段落
```

---

## 4. 编辑场景

### 4.1 TimeLog 页面（主要编辑场景）

**特点：**
- 完整的 Slate 编辑器
- 显示所有 timestamp 分隔线
- 支持附件、富文本、标签提及
- 自动保存（2 秒防抖）

**布局：**
```
┌─────────────────────────────────────────┐
│ Event 卡片（展开状态）                   │
├─────────────────────────────────────────┤
│ 📅⏰ 10:00 - 12:00 准备演讲稿          │
│ #工作 #文档编辑                         │
│                                         │
│ ▸ 2025-10-19 10:21:18 ⊙                │ ← timestamp
│ 处理完了一些出差的logistics...          │
│ [Slate 编辑区]                          │
│                                         │
│ ▸ 16min later ⊙                        │ ← timestamp
│ 双击"Alt"召唤美桶...                   │
│ [Slate 编辑区]                          │
│                                         │
│ [😊 # 📅 • 🎨 ✓]  FloatingBar         │
└─────────────────────────────────────────┘
```

### 4.2 EventEditModal 右侧（次要编辑场景）

**特点：**
- 与 TimeLog 页面相同的编辑体验
- 右侧 Slate 编辑区（flex: 1）
- 完整显示 timestamp

**参考：**
- 详见 [EventEditModal v2 PRD - Section 5](./EVENTEDITMODAL_V2_PRD.md#5-右侧event-log)

### 4.3 PlanManager description 行（紧凑模式）

**特点：**
- **隐藏 timestamp 分隔线**
- 只显示内容段落
- 节省垂直空间

**数据流纠正：**
```typescript
// ❌ 错误：PlanManager 写入 description 字段
await EventService.updateEvent(eventId, {
  description: slateHtml  // 错误！
});

// ✅ 正确：PlanManager 写入 eventlog 字段
await EventService.updateEvent(eventId, {
  eventlog: JSON.stringify(slateNodes)  // 正确！
});
```

**实现示例：**
```typescript
// PlanManager.tsx
const handleDescriptionChange = (slateNodes: Descendant[]) => {
  const { tags, plainText } = serializeSlateToHtmlWithTags(slateNodes);
  
  const updatedEvent: Event = {
    ...currentEvent,
    // ✅ 写入 eventlog 字段
    eventlog: JSON.stringify(slateNodes),
    // description 由系统自动生成，不手动设置
  };
  
  await EventService.updateEvent(currentEvent.id, updatedEvent);
};
```

---

## 5. Outlook 同步机制

### 5.1 eventlog → description 自动转换

**✅ 实现状态：已完成 (2025-11-24)**

**转换时机：**
- EventService.updateEvent() 保存时（自动检测输入格式）
- 同步到 Outlook 之前

**转换流程：**
```typescript
class EventService {
  async updateEvent(eventId: string, updates: Partial<Event>) {
    const event = await this.getEvent(eventId);
    
    // ✅ 自动检测 eventlog 格式并转换
    if (updates.eventlog) {
      const isSlateJsonString = typeof updates.eventlog === 'string' && 
                                 updates.eventlog.trim().startsWith('[');
      
      if (isSlateJsonString) {
        // 🔧 前端传递 Slate JSON 字符串 → 自动转换为 EventLog 对象
        const slateNodes = jsonToSlateNodes(updates.eventlog);
        const html = slateNodesToHtml(slateNodes);
        const plainText = html.replace(/<[^>]*>/g, '');
        
        // 构建完整的 EventLog 对象
        updates.eventlog = {
          content: updates.eventlog,           // Slate JSON
          descriptionHtml: html,               // HTML 版本
          descriptionPlainText: plainText,     // 纯文本
          attachments: event.eventlog?.attachments || [],
          versions: event.eventlog?.versions || [],
          syncState: { status: 'pending', contentHash: updates.eventlog },
          createdAt: event.eventlog?.createdAt || formatTimeForStorage(new Date()),
          updatedAt: formatTimeForStorage(new Date()),
        };
        
        // 自动同步到 description
        updates.description = html;
      }
    }
    
    // 保存到 localStorage
    const updatedEvent = { ...event, ...updates };
    this.saveToStorage(updatedEvent);
    
    // 触发同步
    if (shouldSync(updatedEvent)) {
      await SyncManager.syncEvent(updatedEvent);
    }
    
    return updatedEvent;
  }
}
```

**架构优化：**
- ✅ 前端组件（EventEditModalV2）：只传递 Slate JSON 字符串
- ✅ EventService：统一负责转换为 EventLog 对象
- ✅ 避免代码重复：转换逻辑集中在一处

### 5.2 智能序列化策略

**目标：**
- 保留格式（加粗、颜色、列表）
- 降级复杂元素（表格 → Markdown 文本）
- 过滤 timestamp 分隔线（Outlook 不需要）

**实现：**
```typescript
function serializeSlateToHtml(nodes: Descendant[]): {
  html: string;
  plainText: string;
} {
  // 1. 过滤掉 timestamp-divider
  const contentNodes = nodes.filter(
    node => (node as any).type !== 'timestamp-divider'
  );
  
  // 2. 转换为 HTML
  const html = contentNodes
    .map(node => serializeNode(node))
    .join('');
  
  // 3. 提取纯文本
  const plainText = contentNodes
    .map(node => extractPlainText(node))
    .join('\n');
  
  return { html, plainText };
}

function serializeNode(node: Descendant): string {
  if (Text.isText(node)) {
    let html = escapeHtml(node.text);
    
    // 应用格式
    if (node.bold) html = `<strong>${html}</strong>`;
    if (node.italic) html = `<em>${html}</em>`;
    if (node.color) html = `<span style="color: ${node.color}">${html}</span>`;
    
    return html;
  }
  
  const element = node as Element;
  const children = element.children.map(serializeNode).join('');
  
  switch (element.type) {
    case 'paragraph':
      return `<p>${children}</p>`;
    case 'heading':
      return `<h${element.level}>${children}</h${element.level}>`;
    case 'bulleted-list':
      return `<ul>${children}</ul>`;
    case 'list-item':
      return `<li>${children}</li>`;
    case 'tag':
      // 标签转为纯文本提及
      const tag = element as TagNode;
      return tag.mentionOnly 
        ? `#${tag.tagEmoji || ''}${tag.tagName}`
        : `<span class="tag">${tag.tagEmoji}${tag.tagName}</span>`;
    case 'table':
      // 表格降级为 Markdown
      return `<pre>${serializeTableToMarkdown(element)}</pre>`;
    default:
      return children;
  }
}
```

### 5.3 Outlook 同步示例

**本地 Event.eventlog（Slate JSON）：**
```json
[
  { "type": "timestamp-divider", "displayText": "2025-10-19 10:21:18", ... },
  { "type": "paragraph", "children": [{ "text": "讨论了功能优先级" }] },
  { "type": "paragraph", "children": [
    { "text": "需要与 " },
    { "type": "tag", "tagName": "张三", "mentionOnly": true, ... },
    { "text": " 确认" }
  ]}
]
```

**转换后的 Event.description（HTML）：**
```html
<p>讨论了功能优先级</p>
<p>需要与 #张三 确认</p>
```

**Outlook 中显示：**
```
讨论了功能优先级
需要与 #张三 确认
```

---

## 6. 版本控制与历史

### 6.1 EventHistoryService（Event 级别）

**职责：**
- 记录 Event 的 CRUD 操作
- 记录字段变更（title, tags, startTime 等）
- 支持时间段查询

**实现参考：**
- 详见顶部「架构决策记录 → 决策：构建双层历史记录系统」

### 6.2 VersionControlService（eventlog 内容级别）

**职责：**
- 自动保存 eventlog 版本快照（5 分钟间隔）
- 记录 Slate 编辑操作
- 版本对比和恢复

**版本触发条件：**
```typescript
type VersionTriggerType =
  | 'auto-save'      // 自动保存（5 分钟间隔）
  | 'manual-save'    // 用户手动保存
  | 'before-sync'    // 同步前快照
  | 'major-edit';    // 重大编辑（如删除大段内容）
```

**数据结构：**
```typescript
type EventLogVersion = {
  id: string;
  eventId: string;
  timestamp: string;         // 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  content: Descendant[];     // Slate JSON 快照
  triggerType: VersionTriggerType;
  changesSummary?: string;   // 变更摘要
};
```

---

## 7. 离线队列与保存机制

### 7.1 保存架构层次

**核心原则：保存逻辑在模块层统一实现**

```
┌─────────────────────────────────────────────────────────┐
│ PlanSlateEditor（纯编辑器组件）                       │
│ - 只负责编辑 Slate JSON                                  │
│ - onChange 回调通知父组件内容变化                        │
│ - 不关心保存到哪里、保存什么字段                         │
└─────────────────────────────────────────────────────────┘
                  ↓ onChange
┌─────────────────────────────────────────────────────────┐
│ 模块层（TimeLog/EventEditModal/PlanManager）            │
│ ✅ 这里实现保存逻辑                                      │
│ - 接收 Slate 的 onChange                                 │
│ - 决定更新哪些字段（eventlog/title/等）                 │
│ - 实现防抖、批量保存                                     │
│ - 调用 EventHub.updateFields() 【推荐】                  │
│ - 或调用 EventService.updateEvent()                      │
└─────────────────────────────────────────────────────────┘
                  ↓ updateFields
┌─────────────────────────────────────────────────────────┐
│ EventHub（事件状态管理层）✨ 【2025-12-08 新增】        │
│ - 统一的事件更新入口                                     │
│ - 循环更新防护（source 标记）                            │
│ - 触发 eventsUpdated 事件广播                            │
│ - 自动处理增量更新                                       │
└─────────────────────────────────────────────────────────┘
                  ↓ updateEvent
┌─────────────────────────────────────────────────────────┐
│ EventService（数据服务层）                               │
│ - 更新 Event 对象的所有字段                              │
│ - 自动生成 description（从 eventlog 转换）               │
│ - 持久化到 localStorage                                  │
│ - 触发 Outlook 同步（如需要）                            │
│ - 检测离线时加入 OfflineQueue                            │
│ - 触发 eventsUpdated CustomEvent                         │
└─────────────────────────────────────────────────────────┘
```

### 7.1.1 EventHub 架构 ✨ 【2025-12-08 新增】

**设计目标：统一事件更新接口 + 循环更新防护**

#### 为什么需要 EventHub？

在多组件同时监听和修改事件的场景下（TimeLog、PlanManager、EventEditModal 等），存在以下问题：

1. **循环更新问题**：组件 A 修改事件 → 触发 eventsUpdated → 组件 A 监听到自己的更新 → 重复处理
2. **重复刷新问题**：一次保存触发多次全量刷新，性能浪费
3. **状态不一致**：各组件直接调用 EventService，缺少统一的状态同步机制

#### EventHub 解决方案

```typescript
class EventHub {
  /**
   * 统一的事件更新接口
   * @param eventId - 事件ID
   * @param updates - 要更新的字段
   * @param options.source - 更新来源标识（用于循环防护）
   */
  async updateFields(
    eventId: string,
    updates: Partial<Event>,
    options: { source: string }
  ): Promise<void> {
    // 1. 调用 EventService 保存
    // 注意：title 字段会自动通过 normalizeTitle() 处理
    //       - 自动提取/应用 formatMap（富文本格式记忆）
    //       - 容错机制：formatMap 失败不影响主流程
    await EventService.updateEvent(eventId, updates);
    
    // 2. 触发 eventsUpdated 事件（带 source 标记）
    window.dispatchEvent(new CustomEvent('eventsUpdated', {
      detail: {
        eventId,
        event: updatedEvent,
        isLocalUpdate: true,         // 标记为本地更新
        originComponent: options.source  // 记录更新来源
      }
    }));
  }
  
  async createEvent(event: Event): Promise<void> {
    await EventService.createEvent(event);
  }
}
```

**formatMap 自动处理流程**：✨ 【2025-12-08 新增】

```typescript
// 用户在编辑器中输入富文本标题
const handleTitleSave = async (eventId: string, slateJson: string) => {
  await EventHub.updateFields(eventId, {
    title: { fullTitle: slateJson }  // 只传 fullTitle
  }, { source: 'TimeLog-titleSave' });
  
  // ⚙️ EventService 内部自动处理：
  // 1. normalizeTitle() 解析 fullTitle
  // 2. fullTitleToColorTitle() 提取 formatMap（有格式的文字被记录）
  // 3. 生成 simpleTitle（纯文本）
  // 4. 保存到数据库：{ fullTitle, colorTitle, simpleTitle, formatMap }
};

// Outlook 同步回传纯文本
const handleOutlookSync = async (eventId: string, plainText: string) => {
  const existingEvent = await EventService.getEvent(eventId);
  
  await EventHub.updateFields(eventId, {
    title: { 
      simpleTitle: plainText,           // Outlook 回传的纯文本
      formatMap: existingEvent.title.formatMap  // 保留之前的格式记忆
    }
  }, { source: 'Outlook-sync' });
  
  // ⚙️ EventService 内部自动处理：
  // 1. normalizeTitle() 检测到 simpleTitle + formatMap
  // 2. simpleTitleToFullTitle() 智能匹配并恢复格式
  //    - 在 plainText 中查找 formatMap 的文字
  //    - 找到则应用原有格式（bold/color 等）
  //    - 找不到则降级为纯文本
  // 3. 容错：formatMap 失败不影响主流程
};
```

#### TimeLog 中的实现

**保存处理器（使用 EventHub）：**

```typescript
// ❌ 旧实现：直接调用 EventService（无循环防护）
const handleTitleSave_OLD = async (eventId: string, slateJson: string) => {
  await EventService.updateEvent(eventId, {
    title: { fullTitle: slateJson, simpleTitle }
  });
  // 问题：eventsUpdated 监听器会收到自己触发的更新
};

// ✅ 新实现：使用 EventHub（带 source 标记）
const handleTitleSave = async (eventId: string, slateJson: string) => {
  await EventHub.updateFields(eventId, {
    title: { fullTitle: slateJson, simpleTitle }
  }, {
    source: 'TimeLog-titleSave'  // 标记更新来源
  });
};

// 其他保存处理器同理
const handleLogChange = async (eventId: string, slateJson: string) => {
  await EventHub.updateFields(eventId, {
    eventlog: slateJson
  }, {
    source: 'TimeLog-eventlogChange'
  });
};

const handleTagsChange = async (eventId: string, tagIds: string[]) => {
  await EventHub.updateFields(eventId, { tags: tagIds }, {
    source: 'TimeLog-tagsChange'
  });
};
```

**eventsUpdated 监听器（循环防护）：**

```typescript
useEffect(() => {
  const handleEventsUpdated = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    
    // 🔒 循环更新防护：跳过来自 TimeLog 自身的本地更新
    const timeLogSources = [
      'TimeLog-titleSave',
      'TimeLog-eventlogChange', 
      'TimeLog-tagsChange',
      'TimeLog-locationSave',
      'TimeLog-timeChange',
      'TimeLog-attendeesSave',
      'TimeLog-editSave'
    ];
    
    if (detail?.isLocalUpdate && 
        detail?.originComponent && 
        timeLogSources.includes(detail.originComponent)) {
      console.log('⏭️ [TimeLog] 跳过自身更新:', detail.originComponent);
      return;  // 跳过处理，避免循环更新
    }
    
    // ✅ 处理来自其他组件的更新（如 EventEditModal、PlanManager）
    if (detail?.event) {
      const updatedEvent = detail.event;
      
      // 增量更新：只更新变化的事件
      setAllEvents(prev => {
        const index = prev.findIndex(e => e.id === updatedEvent.id);
        if (index >= 0) {
          const newEvents = [...prev];
          newEvents[index] = updatedEvent;
          return newEvents;
        }
        return prev;
      });
    }
  };

  window.addEventListener('eventsUpdated', handleEventsUpdated);
  return () => window.removeEventListener('eventsUpdated', handleEventsUpdated);
}, []);
```

#### 更新流程对比

**旧流程（无循环防护）：**

```
用户编辑标题
  ↓
TimeLog.handleTitleSave
  ↓
EventService.updateEvent(eventId, {...})
  ↓
触发 eventsUpdated 事件
  ↓
TimeLog.handleEventsUpdated 收到通知
  ↓
❌ 问题：处理自己刚刚保存的更新（重复刷新）
  ↓
可能触发额外的 getEventById 调用（性能浪费）
```

**新流程（带循环防护）：**

```
用户编辑标题
  ↓
TimeLog.handleTitleSave
  ↓
EventHub.updateFields(eventId, {...}, {source: 'TimeLog-titleSave'})
  ↓
EventService.updateEvent(eventId, {...})
  ↓
触发 eventsUpdated 事件 {isLocalUpdate: true, originComponent: 'TimeLog-titleSave'}
  ↓
TimeLog.handleEventsUpdated 收到通知
  ↓
✅ 检查 source，发现是自己触发的 → 跳过处理
  ↓
PlanManager.handleEventsUpdated 收到通知
  ↓
✅ source 不是 'PlanManager' → 正常处理增量更新
```

#### 防抖策略

| 组件 | 防抖时间 | 触发机制 |
|------|---------|---------|
| TimeLog - 标题编辑 | 500ms | 输入停止后 500ms 保存 |
| TimeLog - eventlog 编辑 | 2000ms | PlanSlateEditor 内置（输入停止 2s / Enter / 失焦） |
| PlanManager | 300ms | 统一批量处理 |
| EventEditModal | 无防抖 | 点击"保存"按钮立即保存 |

---

### 7.1.2 formatMap 容错机制 ✨ 【2025-12-08 新增】

**设计原则：失败不影响主流程，自动降级为纯文本**

#### 容错场景

formatMap（富文本格式记忆）是增强功能，不应该阻塞核心保存流程。以下情况需要容错：

1. **formatMap 提取失败**：Slate JSON 解析异常、节点结构异常
2. **formatMap 应用失败**：文本匹配失败、格式对象异常
3. **formatMap 数据损坏**：数据库中的 formatMap 字段格式错误

#### 实现机制

**1. fullTitleToColorTitle 容错（提取 formatMap）**

```typescript
private static fullTitleToColorTitle(fullTitle: string): { colorTitle: string; formatMap: TextFormatSegment[] } {
  try {
    const nodes = JSON.parse(fullTitle);
    const processedNodes = nodes.map(processNode).filter(node => node !== null);
    const colorTitle = JSON.stringify(processedNodes);
    
    // 🛡️ formatMap 提取独立 try-catch
    let formatMap: TextFormatSegment[] = [];
    try {
      const extractFormats = (node: any) => {
        if (node.text && hasFormat(node)) {
          formatMap.push({ text: node.text, format: extractFormat(node) });
        }
        if (node.children) node.children.forEach(extractFormats);
      };
      processedNodes.forEach(extractFormats);
    } catch (formatError) {
      // ✅ 容错：formatMap 提取失败不影响 colorTitle 生成
      console.warn('[EventService] formatMap 提取失败，跳过格式记忆:', formatError);
      formatMap = [];  // 清空失败的 formatMap
    }
    
    return { colorTitle, formatMap };
  } catch (error) {
    // 主流程失败返回空
    return { colorTitle: '', formatMap: [] };
  }
}
```

**2. simpleTitleToFullTitle 容错（应用 formatMap）**

```typescript
private static simpleTitleToFullTitle(simpleTitle: string, formatMap?: TextFormatSegment[]): string {
  if (!simpleTitle) return JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }]);
  
  // 🛡️ formatMap 应用独立 try-catch
  if (formatMap && formatMap.length > 0) {
    try {
      const children: any[] = [];
      let remainingText = simpleTitle;
      
      for (const segment of formatMap) {
        // 🛡️ 验证 segment 结构
        if (!segment || !segment.text || !segment.format) {
          console.warn('[EventService] 无效的 formatMap segment，跳过:', segment);
          continue;  // 跳过损坏的 segment，继续处理其他的
        }
        
        const index = remainingText.indexOf(segment.text);
        if (index !== -1) {
          // 应用格式
          if (index > 0) children.push({ text: remainingText.substring(0, index) });
          children.push({ text: segment.text, ...segment.format });
          remainingText = remainingText.substring(index + segment.text.length);
        }
      }
      
      if (remainingText) children.push({ text: remainingText });
      if (children.length > 0) return JSON.stringify([{ type: 'paragraph', children }]);
    } catch (formatError) {
      // ✅ 容错：formatMap 应用失败降级为纯文本
      console.warn('[EventService] formatMap 应用失败，降级为纯文本:', formatError);
    }
  }
  
  // 降级：返回纯文本
  return JSON.stringify([{ type: 'paragraph', children: [{ text: simpleTitle }] }]);
}
```

**3. normalizeTitle 容错（传递 formatMap）**

```typescript
private static normalizeTitle(titleInput, tags, originalTags): EventTitle {
  // 场景 1: fullTitle → colorTitle
  if (fullTitle && !colorTitle && !simpleTitle) {
    const { colorTitle: ct, formatMap } = this.fullTitleToColorTitle(fullTitle);
    result.colorTitle = ct;
    result.simpleTitle = this.colorTitleToSimpleTitle(ct);
    result.formatMap = formatMap;  // formatMap 可能为 [] (提取失败)
  }
  
  // 场景 3: simpleTitle → fullTitle
  else if (simpleTitle && !colorTitle && !fullTitle) {
    result.simpleTitle = simpleTitle;
    result.colorTitle = simpleTitle;
    // 🛡️ 传递 formatMap，可能为 undefined
    result.fullTitle = this.simpleTitleToFullTitle(simpleTitle, (titleInput as any).formatMap);
    result.formatMap = (titleInput as any).formatMap;  // 保留原 formatMap
  }
  
  // 其他场景同理...
}
```

#### 容错行为表

| 失败场景 | 行为 | 用户感知 |
|---------|------|---------|
| formatMap 提取失败 | formatMap = []，colorTitle 正常生成 | 保存成功，无格式记忆 |
| formatMap 应用失败 | 降级为纯文本 fullTitle | 保存成功，格式丢失 |
| formatMap 数据损坏 | 跳过损坏的 segment | 保存成功，部分格式恢复 |
| 主流程失败 | 抛出异常，回滚保存 | 提示保存失败（正常错误处理） |

#### 日志策略

```typescript
// ✅ 好的日志：明确失败原因，不干扰主流程
console.warn('[EventService] formatMap 提取失败，跳过格式记忆:', formatError);

// ❌ 坏的日志：误导用户以为保存失败
console.error('[EventService] formatMap 提取失败', formatError);  // 不应该用 error
```

#### 测试用例

```typescript
describe('formatMap 容错机制', () => {
  it('formatMap 提取失败应该返回空数组', () => {
    const result = EventService.fullTitleToColorTitle(invalidSlateJson);
    expect(result.formatMap).toEqual([]);
    expect(result.colorTitle).toBeDefined();  // colorTitle 正常生成
  });
  
  it('formatMap 应用失败应该降级为纯文本', () => {
    const corruptedFormatMap = [{ text: 'test', format: null }];  // 损坏的格式
    const result = EventService.simpleTitleToFullTitle('test', corruptedFormatMap);
    expect(result).toContain('"text":"test"');  // 降级为纯文本
  });
  
  it('部分 segment 损坏应该跳过并继续处理', () => {
    const mixedFormatMap = [
      { text: 'good', format: { bold: true } },  // 正常
      { text: 'bad', format: null },              // 损坏
      { text: 'also-good', format: { color: 'red' } }  // 正常
    ];
    const result = EventService.simpleTitleToFullTitle('good bad also-good', mixedFormatMap);
    expect(result).toContain('"bold":true');   // 第一个格式应用成功
    expect(result).toContain('"color":"red"'); // 第三个格式应用成功
  });
});
```

**空标题保护机制：**

```typescript
const handleTitleSave = async (eventId: string, slateJson: string) => {
  // 提取纯文本
  const simpleTitle = extractPlainText(slateJson);
  
  // 🛡️ 保护机制：如果新标题为空，且当前标题不为空，则不保存
  const currentEvent = allEventsRef.current.find(e => e.id === eventId);
  const currentTitle = currentEvent?.title;
  
  if (!simpleTitle && currentTitle?.simpleTitle) {
    console.warn('⚠️ [TimeLog] 阻止用空标题覆盖现有标题');
    return;  // 不保存空标题
  }
  
  // 正常保存
  await EventHub.updateFields(eventId, {
    title: { fullTitle: slateJson, simpleTitle }
  }, {
    source: 'TimeLog-titleSave'
  });
};
```

**设计理由：**
- 防止 Slate 编辑器初始化时触发 onChange 导致的空标题覆盖
- 防止用户误删除标题后自动保存（给用户撤销机会）
- 只在真正有内容时才保存，减少无效更新

#### 增量更新 vs 全量刷新

**❌ 旧方案：全量刷新**

```typescript
const handleTitleSave = async (eventId: string, slateJson: string) => {
  await EventService.updateEvent(eventId, {...});
  
  // 全量刷新：重新获取所有事件
  const events = await EventService.getTimelineEvents();
  setAllEvents(events);  // 替换整个数组
};
```

**问题：**
- 性能差：每次保存都查询数据库并重建 UI
- 滚动位置丢失：数组引用变化导致虚拟滚动重置
- 不必要的网络请求：离线时仍尝试全量查询

**✅ 新方案：增量更新**

```typescript
// 保存时不再手动刷新，依赖 eventsUpdated 监听器
const handleTitleSave = async (eventId: string, slateJson: string) => {
  await EventHub.updateFields(eventId, {...}, {source: 'TimeLog-titleSave'});
  // 无需手动 setAllEvents，监听器会处理
};

// 监听器只更新变化的事件
const handleEventsUpdated = (e: CustomEvent) => {
  const updatedEvent = e.detail.event;
  
  setAllEvents(prev => {
    const index = prev.findIndex(e => e.id === updatedEvent.id);
    if (index >= 0) {
      const newEvents = [...prev];
      newEvents[index] = updatedEvent;  // 只替换一个元素
      return newEvents;
    }
    return prev;
  });
};
```

**优势：**
- 性能优：只更新单个事件，不触发完整 re-render
- 保持滚动位置：数组大部分引用不变
- 自动同步：其他组件的修改也会增量更新到 TimeLog

### 7.2 离线队列触发时机

**参考现有实现：**
- Slate 编辑器：2 秒防抖 + Enter/失焦立即保存
- PlanManager：300ms 二次防抖

**离线队列触发：**
```typescript
class EventService {
  async updateEvent(eventId: string, updates: Partial<Event>) {
    try {
      // 1. 本地保存
      const updatedEvent = this.saveToLocalStorage(eventId, updates);
      
      // 2. 尝试同步
      if (navigator.onLine) {
        await SyncManager.syncEvent(updatedEvent);
      } else {
        // 3. 离线时加入队列
        await OfflineQueue.enqueue(eventId, 'push');
      }
      
      return updatedEvent;
    } catch (error) {
      // 4. 同步失败也加入队列
      await OfflineQueue.enqueue(eventId, 'push');
      throw error;
    }
  }
}
```

**OfflineQueue 处理时机：**
1. **应用启动时** - 检查并处理未完成的队列
2. **网络恢复时** - 监听 `online` 事件自动触发
3. **用户手动触发** - "同步"按钮

```typescript
class OfflineQueue {
  async init() {
    // 1. 应用启动时处理
    await this.processQueue();
    
    // 2. 监听网络恢复
    window.addEventListener('online', () => {
      this.processQueue();
    });
  }
  
  async processQueue() {
    if (!navigator.onLine) return;
    
    while (this.queue.length > 0) {
      const op = this.queue[0];
      
      try {
        await SyncManager.syncEvent(op.eventId);
        this.queue.shift();  // 成功后移除
      } catch (error) {
        op.retryCount++;
        
        if (op.retryCount >= 3) {
          this.queue.shift();  // 超过重试次数，移除
        } else {
          break;  // 等待下次重试
        }
      }
    }
  }
}
```

---

## 8. 附件管理系统

### 8.1 容量限制设计

**用户级限制（总容量）：**

```typescript
const STORAGE_LIMITS = {
  // 免费用户
  FREE_TIER: {
    total: 2 * 1024 * 1024 * 1024,        // 2GB 总容量
    perEvent: 100 * 1024 * 1024,          // 单个 Event 100MB
    perFile: 20 * 1024 * 1024,            // 单个文件 20MB
    fileTypes: [
      'image/*', 
      'video/*', 
      'application/pdf', 
      'application/*', 
      'text/*'
    ],
  },
  
  // 付费用户（未来）
  PRO_TIER: {
    total: 10 * 1024 * 1024 * 1024,       // 10GB
    perEvent: 500 * 1024 * 1024,          // 500MB
    perFile: 100 * 1024 * 1024,           // 100MB
    fileTypes: ['*/*'],                   // 不限制类型
  },
};
```

**设计理由：**

| 限制类型 | 值 | 理由 |
|---------|-----|------|
| 总容量 2GB | 约 2000 个 Event（每个 1MB） | 对标 Notion 免费版，个人使用足够 |
| 单 Event 100MB | 约 5 个大文件 (20MB) | 避免单个事件占用过多空间 |
| 单文件 20MB | 足够存储高清图片/短视频 | 对标 Outlook 附件限制（25MB）|
| 文件类型限制 | 常见办公/媒体格式 | 防止滥用（如存储大型安装包）|

**参考数据**：
- Outlook 附件限制：25MB/文件
- Notion 免费版：个人使用不限容量，团队版 5GB
- Google Calendar：附件通过 Google Drive，15GB 共享
- Apple Notes：200MB/笔记，5GB 总容量（免费 iCloud）

### 8.2 本地缓存策略

**本地存储路径：**

```typescript
const ATTACHMENT_PATHS = {
  // Electron userData 路径
  local: path.join(app.getPath('userData'), 'attachments'),
  
  // 按月分目录（方便清理）
  getPath: (attachmentId: string, uploadedAt: Date) => {
    const uploadedAtStr = formatTimeForStorage(uploadedAt);
    const month = uploadedAtStr.slice(0, 7); // "2025-11"
    return path.join(ATTACHMENT_PATHS.local, month, attachmentId);
  },
};
```

**缓存清理策略：**

```typescript
interface CacheCleanupPolicy {
  // 自动清理规则
  autoCleanup: {
    enabled: true,
    rules: [
      { condition: '90天未访问', action: '删除本地文件，保留云端' },
      { condition: '本地缓存 > 500MB', action: '删除最旧的 20%' },
      { condition: 'Event 已删除 > 30天', action: '删除关联附件' },
    ],
  },
  
  // 用户手动管理
  userControl: {
    viewCacheSize: true,       // 显示"本地缓存占用 350MB"
    clearCache: true,          // "清空缓存"按钮（不影响云端）
    downloadAll: true,         // "下载所有附件"（离线使用）
    pinAttachment: true,       // "固定附件"（不自动清理）
  },
}

// 实现示例
class AttachmentCacheService {
  async cleanupOldCache() {
    const attachments = await this.getAllAttachments();
    const now = Date.now();
    
    for (const att of attachments) {
      const daysSinceAccess = (now - att.lastAccessedAt) / (1000 * 60 * 60 * 24);
      
      if (daysSinceAccess > 90 && !att.isPinned && att.cloudUrl) {
        // 删除本地文件，保留元数据
        await fs.unlink(att.localPath);
        att.localPath = null;
        att.status = 'cloud-only';
      }
    }
  }
  
  async getCacheStats(): Promise<CacheStats> {
    const files = await this.scanLocalFiles();
    return {
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      fileCount: files.length,
      oldestFile: files.sort((a, b) => a.accessedAt - b.accessedAt)[0],
    };
  }
}
```

### 8.3 云端上传降级策略

**智能降级流程：**

```typescript
interface UploadStrategy {
  primary: 'cloud',      // 优先云端
  fallback: 'local',     // 降级本地
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',  // 1s, 2s, 4s
    timeout: 30000,          // 30s 超时
  },
}

class AttachmentService {
  async uploadAttachment(file: File, eventId: string): Promise<Attachment> {
    // 1. 先保存到本地（即时可用）
    const localPath = await this.saveToLocal(file, eventId);
    const attachment: Attachment = {
      id: generateId(),
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      localPath,
      cloudUrl: null,
      status: 'local-only',
      uploadedAt: formatTimeForStorage(new Date()),
      lastAccessedAt: formatTimeForStorage(new Date()),
    };
    
    // 2. 异步上传到云端（不阻塞用户）
    this.uploadToCloud(attachment)
      .then(cloudUrl => {
        attachment.cloudUrl = cloudUrl;
        attachment.status = 'synced';
        this.notifyUploadSuccess(attachment);
      })
      .catch(error => {
        if (error.code === 'NETWORK_ERROR') {
          // 网络错误：加入离线队列
          OfflineQueue.enqueue({ type: 'upload-attachment', attachment });
          attachment.status = 'pending-upload';
        } else if (error.code === 'QUOTA_EXCEEDED') {
          // 容量不足：提示用户升级
          this.notifyQuotaExceeded();
          attachment.status = 'local-only';
        } else {
          // 其他错误：保持本地
          this.notifyUploadFailed(error);
          attachment.status = 'upload-failed';
        }
      });
    
    return attachment;  // 立即返回（本地可用）
  }
  
  private async uploadToCloud(attachment: Attachment): Promise<string> {
    // 重试逻辑
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const cloudUrl = await CloudStorageAPI.upload(
          attachment.localPath,
          { timeout: 30000 }
        );
        return cloudUrl;
      } catch (error) {
        if (attempt === 3) throw error;
        await sleep(Math.pow(2, attempt) * 1000);  // 指数退避
      }
    }
  }
}
```

**用户通知设计：**

```typescript
// UI 提示
const NOTIFICATIONS = {
  uploadSuccess: '📤 附件已上传到云端',
  uploadFailed: '⚠️ 附件上传失败，已保存到本地（稍后自动重试）',
  quotaExceeded: '💾 云端容量不足（已使用 1.9GB / 2GB），请清理旧附件或升级',
  networkError: '📡 网络连接中断，附件将在网络恢复后自动上传',
  cacheCleanup: '🧹 已清理 90 天未访问的本地缓存（云端文件未受影响）',
};

// 状态指示器（附件卡片右上角）
const StatusBadge = ({ attachment }) => {
  const badges = {
    'synced': '☁️',          // 已同步
    'local-only': '💾',      // 仅本地
    'pending-upload': '⏳',  // 上传中
    'cloud-only': '☁️📥',    // 仅云端（点击下载）
    'upload-failed': '❌',   // 失败
  };
  return <span>{badges[attachment.status]}</span>;
};
```

### 8.4 文件类型验证

**允许的文件类型（免费版）：**

```typescript
const ALLOWED_MIME_TYPES = {
  // 图片（常用）
  images: [
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'image/webp', 
    'image/svg+xml'
  ],
  
  // 视频（限制大小）
  videos: [
    'video/mp4', 
    'video/quicktime', 
    'video/webm'
  ],
  
  // 文档
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  
  // 压缩包
  archives: [
    'application/zip', 
    'application/x-rar-compressed'
  ],
  
  // 文本
  text: [
    'text/plain', 
    'text/markdown', 
    'text/csv'
  ],
};

// 验证函数
function validateFile(file: File): { valid: boolean; error?: string } {
  // 1. 大小检查
  if (file.size > STORAGE_LIMITS.FREE_TIER.perFile) {
    return { 
      valid: false, 
      error: `文件过大（${formatBytes(file.size)}），单个文件限制 20MB` 
    };
  }
  
  // 2. 类型检查
  const isAllowed = Object.values(ALLOWED_MIME_TYPES)
    .flat()
    .some(type => file.type.match(type));
  
  if (!isAllowed) {
    return { 
      valid: false, 
      error: `不支持的文件类型（${file.type}）` 
    };
  }
  
  return { valid: true };
}
```

### 8.5 容量监控与清理

**实时容量显示：**

```tsx
const StorageQuotaIndicator: React.FC = () => {
  const { used, total } = useStorageQuota();
  const percentage = (used / total) * 100;
  
  return (
    <div className="storage-quota">
      <div className="quota-bar">
        <div 
          className={`quota-fill ${percentage > 90 ? 'warning' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="quota-text">
        {formatBytes(used)} / {formatBytes(total)} 
        ({percentage.toFixed(1)}%)
      </span>
      
      {percentage > 90 && (
        <button onClick={showCleanupDialog}>
          清理空间
        </button>
      )}
    </div>
  );
};
```

**容量预警机制：**

```typescript
class StorageMonitorService {
  private checkQuota() {
    const { used, total } = this.getQuota();
    const percentage = (used / total) * 100;
    
    if (percentage > 95) {
      showNotification({
        type: 'error',
        message: '⚠️ 云端容量即将用尽（95%），请立即清理',
        actions: [
          { label: '清理附件', onClick: () => showCleanupDialog() },
          { label: '升级容量', onClick: () => showUpgradeDialog() },
        ],
      });
    } else if (percentage > 80) {
      showNotification({
        type: 'warning',
        message: '💾 云端容量已使用 80%，建议清理旧附件',
      });
    }
  }
}
```

**附件清理对话框：**

```tsx
const AttachmentCleanupDialog: React.FC = () => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  useEffect(() => {
    // 获取可清理的附件（90天未访问）
    AttachmentService.getCleanableAttachments().then(setAttachments);
  }, []);
  
  const totalSize = attachments.reduce((sum, a) => sum + a.size, 0);
  
  return (
    <Dialog>
      <h2>清理旧附件</h2>
      <p>以下附件超过 90 天未访问，删除本地缓存可释放 {formatBytes(totalSize)}</p>
      
      <ul>
        {attachments.map(att => (
          <li key={att.id}>
            <input type="checkbox" defaultChecked />
            <span>{att.filename}</span>
            <span className="text-gray-500">{formatBytes(att.size)}</span>
            <span className="text-gray-400">
              最后访问：{formatDate(att.lastAccessedAt)}
            </span>
          </li>
        ))}
      </ul>
      
      <div className="actions">
        <button onClick={handleCleanup}>清理选中项</button>
        <button onClick={handleCancel}>取消</button>
      </div>
    </Dialog>
  );
};
```

---

## 9. 实现指南

### 9.1 Phase 1: TimeLog 页面基础（Week 1-2）

- [ ] TimeLog 页面布局（左侧控制 + 右侧时间轴）
- [ ] Event 卡片组件
- [ ] 日历选择器集成
- [ ] 标签过滤器（支持 tag tree）
- [ ] Event 卡片展开 → EventEditModal

### 9.2 Phase 2: eventlog 字段实现（Week 3-4）

- [ ] Timestamp 分隔线节点类型定义
- [ ] Timestamp 自动插入逻辑
- [ ] Timestamp 渲染组件
- [ ] PlanManager 数据流修正（写入 eventlog）
- [ ] EventService 自动转换 description

### 9.3 Phase 3: Outlook 同步优化（Week 5-6）

- [ ] 智能序列化层（过滤 timestamp）
- [ ] 表格降级为 Markdown
- [ ] 附件链接生成（Web Viewer）
- [ ] 字段级冲突检测
- [ ] Git 风格 Diff UI

### 9.4 Phase 4: 附件管理系统（Week 7-8）

- [ ] 本地附件存储（Electron userData）
- [ ] 文件类型验证和大小限制
- [ ] 云端上传集成（OneDrive API）
- [ ] 智能缓存清理策略
- [ ] 容量监控与预警 UI
- [ ] 离线队列附件上传

### 9.5 Phase 5: 版本控制（Week 9-10）

- [ ] EventHistoryService 实现
- [ ] VersionControlService 实现
- [ ] 版本历史 UI
- [ ] 版本对比和恢复功能

---

## 10. 技术栈

- **Slate.js**: 富文本编辑器核心
- **React**: UI 框架
- **TypeScript**: 类型安全
- **PlanSlateEditor**: 统一编辑器组件（已有）
- **EventService**: 事件数据服务（已有）
- **TimeHub**: 时间管理中枢（已有）
- **SyncManager**: Outlook 同步引擎（已有）

**决策内容：**
- ContextMarker（情境感知时间轴）功能**不作为 v1.0 核心功能**
- 延后至 **v2.0** 实施，优先完成基础 TimeLog 系统

**理由：**
1. **技术复杂度** - 需要桌面活动监听、权限管理、隐私保护等额外工作
2. **平台差异** - Windows/macOS 权限机制不同，需要分别适配
3. **优先级** - 基础富文本编辑、版本控制、同步功能更关键

**v2.0 实施参考：**
- **开源方案借鉴** - 参考 Shion 等开源项目的实现
- **权限处理** - Windows 大概率不需要管理员权限（待验证）
- **隐私保护** - 活动日志**不同步到 Outlook**，仅本地存储
- **可选功能** - 提供用户开关，支持"隐私模式"（不记录特定应用）

**当前版本（v1.0）影响：**
- Section 2 的 ContextMarker 相关内容作为**未来设计参考**
- 不实现 `DesktopActivityService` 类
- 不依赖 `active-win` 库
- Slate 编辑器暂不渲染时间轴和活动轴

**保留内容：**
- `ContextMarkerElement` 类型定义（为未来兼容）
- TimeSpec 架构（v2.0 可直接使用）

### 决策：构建双层历史记录系统

**决策内容：**
- **EventHistoryService** - 记录 Event 级别的 CRUD 操作（新增、修改、删除）
- **VersionControlService** - 记录 TimeLog 内容的细粒度编辑历史（Slate 操作）

**问题分析：**

当前 EventService 的局限：

| 功能 | 当前状态 | 说明 |
|------|---------|------|
| CRUD 操作 | ✅ 有 | EventService 提供完整的增删改查 |
| 当前状态存储 | ✅ 有 | localStorage 存储所有事件的当前状态 |
| 历史记录 | ❌ 无 | 不记录事件的变更历史 |
| 变更溯源 | ❌ 无 | 无法查询"谁在什么时候改了什么" |
| 时间段查询 | ❌ 无 | 无法查询"过去7天创建/修改了哪些事件" |

**双层架构设计：**

```typescript
// 第一层：Event 级别历史（粗粒度）
class EventHistoryService {
  // 记录 Event 的 CRUD 操作
  async recordEventChange(
    eventId: string,
    operation: 'create' | 'update' | 'delete',
    snapshot: Event,
    changedFields?: string[]
  ): Promise<EventHistoryEntry>;
  
  // 查询事件历史
  async getEventHistory(eventId: string): Promise<EventHistoryEntry[]>;
  
  // 查询时间段内的变更
  async getChangesInPeriod(startDate: Date, endDate: Date): Promise<EventHistoryEntry[]>;
  
  // 恢复到特定版本
  async restoreEventVersion(eventId: string, historyId: string): Promise<Event>;
}

// 第二层：TimeLog 内容级别版本（细粒度）
class VersionControlService {
  // 记录 Slate 编辑操作
  recordOperation(operation: SlateOperation, editor: Editor): void;
  
  // 自动保存版本快照（5分钟间隔）
  async createVersion(trigger: VersionTriggerType): Promise<EventLogVersion>;
  
  // 恢复到特定版本
  async restoreVersion(versionId: string): Promise<Descendant[]>;
  
  // 版本对比
  async compareVersions(v1: string, v2: string): Promise<Delta>;
}
```

**存储位置：**
- **EventHistory** - 独立集合/表 `event_history`（便于跨 Event 查询）
- **EventLogVersions** - 嵌入在 `Event.eventlog.versions` 数组中（最多 50 个）

**关键区别：**

| 维度 | EventHistoryService | VersionControlService |
|------|-------------------|---------------------|
| **粒度** | Event 级别（title/tags/startTime 等字段变更） | Slate 节点级别（段落/标签/ContextMarker） |
| **触发** | 每次 EventService.updateEvent() | 每 5 分钟或重大编辑 |
| **存储** | 独立 event_history 集合 | Event.eventlog.versions 数组 |
| **用途** | 审计日志、变更溯源、时间段统计 | 内容撤销/重做、协作冲突解决 |
| **保留期** | 永久保留（或按策略归档） | 最近 50 个版本 |

**实施阶段：**
- **Phase 2** - EventHistoryService（Week 3-4）
  - 记录 Event CRUD 操作
  - 提供变更查询 API
  - 在 EventService 中集成调用
  
- **Phase 3** - VersionControlService（Week 5-6）
  - 记录 Slate 编辑操作
  - 自动保存版本快照
  - 实现版本对比和恢复

**影响范围：**
- Section 6: 拆分为 6.1 EventHistoryService 和 6.2 VersionControlService
- Section 7.2: 数据库设计新增 event_history 集合
- EventService: 集成 EventHistoryService 调用

### 决策：字段级冲突检测 + Git 风格 Diff UI

**决策内容：**
- **字段级冲突检测** - 检测 Event 每个字段的独立冲突（title/tags/eventlog/startTime 等）
- **Git 风格 Diff UI** - 显示本地 vs 远程的并排对比，用户选择 Keep/Undo
- **智能序列化系统** - Slate JSON → HTML 转换，保留格式和元数据

**核心要点：**

1. **TimeLog Timestamp 的特殊性**
   - TimeLog 中的 timestamp 显示是**只读 UI 元素**（不可编辑）
   - 与 Event.startTime/endTime 完全独立（两个不同概念）
   - Event.startTime = 用户设定的事件时间
   - TimeLog timestamp = 内容编辑时的自动记录时间

2. **字段级冲突检测策略**
   ```typescript
   interface ConflictResult {
     hasConflict: boolean;
     conflictedFields: FieldConflict[];  // 具体哪些字段冲突
     resolution: ConflictResolution;
   }
   
   type FieldConflict = {
     field: string;                   // 'title' | 'tags' | 'eventlog' | 'startTime'
     localValue: any;
     remoteValue: any;
     localHash: string;
     remoteHash: string;
     lastSyncValue?: any;             // 三方合并基准
   };
   ```

3. **Slate JSON → HTML 序列化规范**
   
   **保留的格式：**
   - 字体颜色、背景色
   - 加粗、斜体、下划线
   - 列表（bullet points、numbered）
   - 链接
   
   **特殊处理：**
   - **表格** → Markdown 风格文本表格（多端可读）
   - **图片** → `[查看图片: filename.png](link to web viewer)`
   - **附件** → `[附件: document.pdf](link to web viewer)`
   - **ContextMarker（v2.0）** → 隐藏在 Outlook（仅保留 data-* 属性）
   
   **Web Viewer 链接：**
   - 格式：`https://app.remarkable.com/events/{eventId}/eventlog`
   - 用户点击后打开完整的 TimeLog 页面（支持富文本渲染）

**实施阶段：**
- **Phase 2** - 字段级冲突检测 + 序列化系统
- **Phase 3** - Diff UI 组件 + Web Viewer

**影响范围：**
- Section 5: 同步引擎设计（新增字段级冲突检测）
- Section 5.4: Slate JSON → HTML 序列化层
- Section 5.5: 冲突解决 UI 组件

---

## ⚠️ 重要：时间处理规范

> **🚫 禁止使用 ISO 8601 格式进行时间处理！**
>
> **本应用的时间架构基于 [TIME_ARCHITECTURE.md](../TIME_ARCHITECTURE.md)，所有时间相关功能必须遵循以下规则：**
>
> ### 核心要求
> 
> 1. **使用 TimeSpec 而非 ISO 字符串**
>    - ❌ 错误：`timestamp: "2025-11-03T10:00:00Z"`
>    - ✅ 正确：使用 `TimeSpec` 对象，包含 `kind`、`source`、`rawText`、`resolved`、`policy` 等字段
>
> 2. **使用 TimeHub 作为时间的唯一真相源**
>    - ❌ 错误：直接修改 `event.startTime` 等字段
>    - ✅ 正确：通过 `TimeHub.setEventTime()` 或 `TimeHub.setFuzzy()` 更新时间
>
> 3. **使用 useEventTime Hook 读取时间**
>    - ❌ 错误：直接读取 `event.startTime`
>    - ✅ 正确：`const { timeSpec, start, end, allDay } = useEventTime(eventId)`
>
> 4. **保留用户时间意图**
>    - ✅ 通过 `timeSpec.rawText` 保存用户原始输入（如"下周"）
>    - ✅ 通过 `timeSpec.window` 保留时间窗口信息
>    - ✅ 通过 `timeSpec.policy` 应用用户的时间偏好
>
> ### 需要替换的模式
>
> 如果在本文档中发现以下模式，需要立即修正：
>
> - `ISODateTimeString` 类型 → 使用 `TimeSpec`
> - `timestamp: string` → `timeSpec: TimeSpec`
> - `formatTimeForStorage(new Date())` → `TimeHub.setEventTime()` 或 `TimeHub.setFuzzy()`
> - 直接操作日期对象 → 使用 TimeParsingService
> - 手动计算时间窗口 → 使用 TimeSpec 的 window 字段和 policy
>
> ### 参考文档
>
> - **[TIME_ARCHITECTURE.md](../TIME_ARCHITECTURE.md)** - 统一时间架构完整说明
> - **src/services/TimeHub.ts** - 时间中枢实现
> - **src/hooks/useEventTime.ts** - React Hook 实现
> - **src/services/TimeParsingService.ts** - 时间解析服务

---

## 目录

1. [系统概述](#1-系统概述)
2. [情境感知时间轴编辑器](#2-情境感知时间轴编辑器)
3. [Description 标签提及功能](#3-description-标签提及功能)
4. [数据格式选型](#4-数据格式选型)
5. [双向同步架构](#5-双向同步架构)
6. [版本控制系统](#6-版本控制系统)
7. [实现指南](#7-实现指南)
8. [性能优化](#8-性能优化)
9. [技术栈](#9-技术栈)

---

## 1. 系统概述

### 1.1 核心愿景与设计哲学

本项目的目标是创建一个超越传统富文本编辑器的 **"个人时空叙事引擎"**。用户输入的每一段文字不再是孤立的，而是被自动锚定在一条丰富的时间轴上。这条时间轴不仅记录 **"何时"**（时间戳），还将融合 **"何事"**（应用活动、媒体播放等），为用户的思绪和工作流提供完整的情境上下文。

**设计哲学：**

1. **情境优先 (Context-First):** 编辑器不仅服务于文字，更服务于文字产生的完整情境。
2. **无感记录 (Frictionless Logging):** 核心情境数据（时间、应用活动）应自动捕获，用户只需专注于内容创作。
3. **数据融合而非干扰 (Integration over Interruption):** 时间轴和活动轴是内容的"伴侣"，而非"主角"。UI 设计应优雅、直观，通过视觉引导增强叙事，而非分散注意力。
4. **为未来扩展而设计 (Built for Scale):** 数据模型和渲染逻辑必须解耦，以便未来轻松接入任何来源的数据（移动端、IoT设备、API等）。
5. **时间架构统一 (Unified Time Architecture):** 所有时间处理遵循 TimeHub/TimeSpec 架构，保留用户意图，支持自然语言输入。

### 1.2 核心需求

ReMarkable 需要一个富文本编辑系统来记录事件描述（`eventlog`），支持：

**内容格式**:
- ✅ 文本格式：字体颜色、背景色、加粗、斜体、下划线
- ✅ 结构化内容：分级标题、列表（bullet/numbered）、表格
- ✅ 媒体内容：链接、图片、音频、视频、录音
- ✅ 特殊元素：@mention、标签

**同步需求**:
- ✅ eventlog ↔ Outlook description 双向同步
- ✅ 富媒体降级为文本/HTML
- ✅ 冲突检测和解决

**版本控制**:
- ✅ 每 5 分钟间隔自动保存版本
- ✅ 重大编辑时立即保存
- ✅ 版本历史查看和恢复

**情境感知（新增）**:
- ✅ 自动在 5 分钟编辑间隔处插入情境标记（ContextMarker）
- ✅ 记录时间轴：每个标记包含时间戳（使用 TimeSpec）
- ✅ 记录活动轴：自动捕获应用使用情况（应用名称、窗口标题、使用时长）
- ✅ 可视化渲染：时间轴和活动轴以优雅的方式显示在编辑器左侧
- ✅ 活动数据融合：支持桌面端、移动端等多源数据合并

### 1.3 架构概览

```
┌───────────────────────────────────────────────────────────────────┐
│ ReMarkable App                                                    │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐       ┌────────────────┐    ┌──────────────┐  │
│  │ Slate Editor │◄─────►│ Version Control│    │ TimeHub      │  │
│  │ (用户编辑)    │       │ (5分钟快照)     │    │ (时间中枢)   │  │
│  └──────┬───────┘       └────────────────┘    └──────┬───────┘  │
│         │                                             │          │
│         │ ┌───────────────────────────────────────────┘          │
│         ↓ ↓                                                      │
│  ┌─────────────────────┐          ┌─────────────────────┐       │
│  │ Slate JSON (主存储)  │          │ ActivityService     │       │
│  │ - ParagraphElement  │◄────────►│ (情境捕获)          │       │
│  │ - ContextMarker     │          │ - Desktop Monitor   │       │
│  │   · timeSpec        │          │ - Remote Providers  │       │
│  │   · activities[]    │          └─────────────────────┘       │
│  └──────┬──────────────┘                                        │
│         │                                                        │
│         ↓                                                        │
│  ┌─────────────────────┐                                        │
│  │ Serializer Layer    │                                        │
│  │ (双向转换引擎)       │                                        │
│  └──────┬──────────────┘                                        │
│         │                                                        │
│    ┌────┴─────┐                                                 │
│    ↓          ↓                                                 │
│   HTML    Plain Text                                            │
│    │          │                                                 │
└────┼──────────┼─────────────────────────────────────────────────┘
     │          │
     ↓          ↓
┌───────────────────────────────────────────────────────────────────┐
│ Outlook Calendar API                                              │
│ event.body.content (HTML)                                         │
│ event.bodyPreview (Plain Text)                                    │
└───────────────────────────────────────────────────────────────────┘
```

---

---

## 附录 A: ContextMarker 功能（v2.0）

> **⏸️ 状态**: 延后至 v2.0 实施  
> **原因**: 需要桌面活动监听、权限管理等额外工作，v1.0 优先完成基础 TimeLog 功能  

### A.1 核心概念

情境感知时间轴将用户的编辑行为自动锚定在时间和活动的上下文中，创造一个 **"个人工作叙事"**。

**关键特性：**

1. **自动情境标记（ContextMarker）**
   - 当用户停止输入超过 5 分钟后再次编辑时，自动在当前段落上方插入一个情境标记
   - 标记包含时间戳（通过 TimeHub 管理）和这段时间内的应用活动记录

2. **双轴可视化**
   - **时间轴**：在编辑器左侧显示时间戳（如 "10:30"）
   - **活动轴**：在时间戳下方用彩色条形图显示应用使用情况
   - 每个应用条的高度与使用时长成正比，颜色为应用主题色

3. **情境数据结构**
   ```typescript
   type ContextMarkerElement = {
     type: 'context-marker';
     timeSpec: TimeSpec;              // 使用 TimeSpec 而非 ISO 字符串
     activities: ActivitySpan[];      // 活动记录数组
     children: [{ text: '' }];        // Slate Void 节点要求
   };
   
   type ActivitySpan = {
     appId: string;                   // 如 "com.figma.desktop"
     appName: string;                 // 如 "Figma"
     appColor: string;                // 应用主题色（HEX）
     title: string | null;            // 窗口标题
     duration: number;                // 持续时长（秒）
   };
   ```

### 2.2 自动注入逻辑

**触发条件：**
- 用户停止编辑超过 5 分钟
- 用户再次开始输入文本（非删除或格式化操作）

**执行流程：**

```typescript
// 伪代码
const lastModifiedTimestamp = useRef<Date | null>(null);

const handleEditorChange = async (editor: Editor) => {
  const now = new Date();
  
  // 检查是否需要插入 ContextMarker
  if (lastModifiedTimestamp.current) {
    const elapsed = now.getTime() - lastModifiedTimestamp.current.getTime();
    const isTextInput = /* 检测是否为文本输入操作 */;
    
    if (elapsed > 5 * 60 * 1000 && isTextInput) {
      // 1. 获取活动数据
      const activities = await ActivityService.getActivitiesSince(
        lastModifiedTimestamp.current
      );
      
      // 2. 创建 TimeSpec（使用 TimeHub）
      const timeSpec = await TimeHub.createTimeSpec({
        kind: 'fixed',
        source: 'system',
        resolved: { start: now, end: now },
      });
      
      // 3. 创建 ContextMarker
      const marker: ContextMarkerElement = {
        type: 'context-marker',
        timeSpec,
        activities,
        children: [{ text: '' }],
      };
      
      // 4. 在当前位置上方插入
      const currentPath = editor.selection?.anchor.path || [0];
      Transforms.insertNodes(editor, marker, { 
        at: [currentPath[0]] 
      });
    }
  }
  
  // 更新最后修改时间
  lastModifiedTimestamp.current = now;
};
```

### 2.3 ActivityService 架构

**职责：** 从各种来源收集和聚合应用活动数据。

**桌面端实现（DesktopActivityService）：**

```typescript
class DesktopActivityService {
  private activityLog: RawActivity[] = [];
  private currentActivity: RawActivity | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  
  // 启动监听
  start() {
    this.pollInterval = setInterval(() => {
      this.captureCurrentActivity();
    }, 1000); // 每秒轮询
  }
  
  // 捕获当前活动窗口
  private async captureCurrentActivity() {
    const activeWindow = await getActiveWindow(); // 使用 active-win 等库
    
    if (!activeWindow) return;
    
    const now = new Date();
    const appId = activeWindow.owner.bundleId || activeWindow.owner.name;
    
    // 如果应用切换了，结束当前活动并开始新活动
    if (this.currentActivity?.appId !== appId) {
      if (this.currentActivity) {
        this.currentActivity.endTime = now;
        this.activityLog.push(this.currentActivity);
      }
      
      this.currentActivity = {
        appId,
        appName: activeWindow.owner.name,
        title: activeWindow.title,
        startTime: now,
        endTime: null,
      };
    }
  }
  
  // 获取指定时间范围内的活动
  getActivitiesSince(since: Date): ActivitySpan[] {
    const activities = this.activityLog.filter(
      activity => activity.startTime >= since
    );
    
    return activities.map(activity => ({
      appId: activity.appId,
      appName: activity.appName,
      appColor: getAppColor(activity.appId), // 从配置获取应用颜色
      title: activity.title,
      duration: activity.endTime 
        ? (activity.endTime.getTime() - activity.startTime.getTime()) / 1000
        : 0,
    }));
  }
  
  // 停止监听
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}
```

**移动端融合（未来扩展）：**

```typescript
class RemoteActivityProvider {
  async fetchActivitiesFromAPI(userId: string, since: Date): Promise<ActivitySpan[]> {
    // 从后端 API 获取移动端活动数据
    const response = await fetch(`/api/users/${userId}/activities?since=${since}`);
    return response.json();
  }
}

class UnifiedActivityService {
  constructor(
    private desktop: DesktopActivityService,
    private remoteProviders: RemoteActivityProvider[]
  ) {}
  
  async getActivitiesSince(since: Date): Promise<ActivitySpan[]> {
    // 合并所有来源的活动数据
    const desktopActivities = this.desktop.getActivitiesSince(since);
    const remoteActivities = await Promise.all(
      this.remoteProviders.map(provider => 
        provider.fetchActivitiesFromAPI(userId, since)
      )
    );
    
    // 按时间排序并返回
    return [...desktopActivities, ...remoteActivities.flat()]
      .sort((a, b) => a.startTime - b.startTime);
  }
}
```

### 2.4 渲染层实现

**Slate 自定义渲染器：**

```typescript
const renderElement = ({ element, attributes, children }: RenderElementProps) => {
  switch (element.type) {
    case 'paragraph':
      // 段落左侧留出时间轴空间
      return <p {...attributes} className="pl-16 min-h-[1.5em]">{children}</p>;
    
    case 'context-marker':
      return (
        <div {...attributes} className="relative h-auto mb-4">
          {/* 时间戳（左侧固定位置） */}
          <div className="absolute left-0 top-0 w-14 text-right pr-2">
            <TimeDisplay timeSpec={element.timeSpec} />
          </div>
          
          {/* 活动轴（时间戳下方） */}
          <div className="absolute left-0 top-6 w-14">
            <ActivityAxis activities={element.activities} />
          </div>
          
          {/* Slate 要求的 children */}
          <div className="hidden">{children}</div>
        </div>
      );
    
    default:
      return <p {...attributes}>{children}</p>;
  }
};
```

**时间显示组件（遵循 TimeSpec）：**

```typescript
const TimeDisplay: React.FC<{ timeSpec: TimeSpec }> = ({ timeSpec }) => {
  const { start } = timeSpec.resolved;
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };
  
  return (
    <span className="text-xs text-gray-500 font-mono">
      {formatTime(start)}
    </span>
  );
};
```

**活动轴组件：**

```typescript
const ActivityAxis: React.FC<{ activities: ActivitySpan[] }> = ({ activities }) => {
  const SCALE_FACTOR = 0.1; // 每秒 0.1px
  
  return (
    <div className="flex flex-col items-end gap-0.5">
      {activities.map((activity, index) => (
        <div
          key={index}
          className="w-2 rounded-sm transition-all hover:w-4 cursor-pointer"
          style={{
            height: `${activity.duration * SCALE_FACTOR}px`,
            backgroundColor: activity.appColor,
            minHeight: '4px',
          }}
          title={`${activity.appName}${activity.title ? ': ' + activity.title : ''} (${formatDuration(activity.duration)})`}
        />
      ))}
    </div>
  );
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  }
  return `${minutes}分钟`;
};
```

### 2.5 长时间间隔的压缩显示

**问题：** 如果用户长时间没有记录（如中午休息 2 小时），活动轴会非常长。

**解决方案：** "Breakout" 压缩显示

```typescript
const ActivityAxis: React.FC<{ activities: ActivitySpan[] }> = ({ activities }) => {
  const totalDuration = activities.reduce((sum, a) => sum + a.duration, 0);
  const MAX_HEIGHT = 300; // 最大高度限制
  
  // 如果总时长超过阈值，启用压缩模式
  const isCompressed = totalDuration > 3600; // 超过 1 小时
  
  if (isCompressed) {
    // 方案A：显示关键应用 Icon 堆叠
    const topApps = activities
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3);
    
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="text-xs text-gray-400">
          {formatDuration(totalDuration)}
        </div>
        <div className="flex flex-col gap-0.5">
          {topApps.map((app, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: app.appColor }}
              title={app.appName}
            >
              {app.appName[0]}
            </div>
          ))}
        </div>
        <div className="h-px w-full border-t border-dashed border-gray-300" />
      </div>
    );
  }
  
  // 正常渲染
  return (/* 上文的活动轴渲染逻辑 */);
};
```

### 2.6 与 TimeHub 集成

所有时间相关操作必须通过 TimeHub：

```typescript
// ❌ 错误：直接使用 ISO 字符串
const marker = {
  type: 'context-marker',
  timestamp: new Date().toISOString(), // 禁止！
  activities: [],
};

// ✅ 正确：使用 TimeHub 创建 TimeSpec
const createContextMarker = async (activities: ActivitySpan[]) => {
  const now = new Date();
  
  // 通过 TimeHub 创建 TimeSpec
  const timeSpec: TimeSpec = {
    kind: 'fixed',
    source: 'system',
    rawText: null,
    policy: TimePolicy.getDefault(),
    resolved: { start: now, end: now },
    start: now,
    end: now,
    allDay: false,
  };
  
  return {
    type: 'context-marker',
    timeSpec,
    activities,
    children: [{ text: '' }],
  } as ContextMarkerElement;
};
```

---

## 3. Description 标签提及功能

### 3.1 功能概述

**版本**: v1.9.6  
**日期**: 2025-11-12  
**状态**: ✅ 已实现

在 **Description** 字段中支持插入标签，但这些标签仅作为**提及（Mention）**，不会成为 Event 的正式 tags。

在同步到远程日历（Microsoft Outlook/Google Calendar）时，这些标签会被转换为纯文本格式：`#emoji tagName`。

### 3.2 核心区别

| 位置 | 插入标签 | mentionOnly | 添加到 Event.tags | 同步到远程 |
|------|---------|-------------|------------------|-----------|
| **Title** | ✅ | `false` | ✅ 是 | HTML 标签 |
| **Description** | ✅ | `true` | ❌ 否 | `#emoji text` |

### 3.3 标签类型定义

```typescript
// Title 模式插入的标签（正式标签）
{
  type: 'tag',
  tagId: 'tag-123',
  tagName: '工作',
  tagEmoji: '💼',
  mentionOnly: false,  // ❌ 会添加到 Event.tags
  children: [{ text: '' }]
}

// Description 模式插入的标签（仅提及）
{
  type: 'tag',
  tagId: 'tag-123',
  tagName: '工作',
  tagEmoji: '💼',
  mentionOnly: true,   // ✅ 不会添加到 Event.tags
  children: [{ text: '' }]
}
```

### 3.4 使用方法

#### 在 Description 中插入标签

1. 点击 Description 编辑器
2. 打开 FloatingToolbar（点击 # 按钮）
3. 选择标签
4. 标签会自动以 `mentionOnly: true` 插入

#### 查看效果

**本地显示**：
- Description 中的标签显示为**胶囊样式**
- 但不会添加到 Event 的 tags 数组

**同步到远程后**：
- 标签转换为纯文本：`#💼 工作`
- 在 Outlook/Google Calendar 中可读

### 3.5 示例

#### 创建事件

```typescript
// Title: "完成项目方案"
// Title 标签: #工作
// Description: "这是关于 #学习 的任务"

// 保存后的数据：
{
  "title": "完成项目方案",
  "tags": ["tag-work"],          // ✅ 只有 Title 的标签
  "description": "<span data-mention-only=\"true\" data-tag-emoji=\"📚\" data-tag-name=\"学习\">📚 学习</span>"
}
```

#### 同步到 Outlook

```
Outlook 中显示:
━━━━━━━━━━━━━━━━━━━━━
📧 完成项目方案

这是关于 #📚 学习 的任务
━━━━━━━━━━━━━━━━━━━━━
```

### 3.6 技术实现

#### 3.6.1 插入标签时自动设置 mentionOnly

**位置**: `src/components/PlanManager.tsx` L1883-1891

```typescript
const isDescriptionMode = currentFocusedMode === 'description';

const success = insertTag(
  editor,
  insertId,
  tag.name,
  tag.color || '#666',
  tag.emoji || '',
  isDescriptionMode  // 🔥 Description 模式下自动设置为 true
);
```

#### 3.6.2 提取标签时过滤 mentionOnly

**位置**: `src/components/PlanSlateEditor/serialization.ts` L358

```typescript
function extractTags(fragment: (TextNode | TagNode | DateMentionNode | EventMentionNode)[]): string[] {
  if (!fragment || !Array.isArray(fragment)) {
    console.warn('[extractTags] fragment 不是数组', { fragment });
    return [];
  }
  
  return fragment
    .filter((node): node is TagNode => 
      'type' in node && 
      node.type === 'tag' && 
      !node.mentionOnly  // 🔥 过滤掉 mention-only 标签
    )
    .map(node => node.tagName);
}
```

**注**：`DateMentionNode` 和 `EventMentionNode` 是 UnifiedMention 系统的一部分，支持：
- `DateMentionNode`：时间提及（"明天下午3点"、"下周五" 等自然语言）
- `EventMentionNode`：事件提及（@ 另一个事件，自动创建双向链接）

#### 3.6.3 同步时转换为纯文本

**位置**: `src/services/ActionBasedSyncManager.ts` L930-962

```typescript
// 🆕 将 HTML 中的 mention-only 标签转换为纯文本格式（#emojitext）
private convertMentionTagsToPlainText(html: string): string {
  if (!html) return '';
  
  // 匹配 <span data-mention-only="true" ...>content</span> 格式的标签
  const mentionTagPattern = /<span[^>]*data-mention-only="true"[^>]*data-tag-emoji="([^"]*)"[^>]*data-tag-name="([^"]*)"[^>]*>.*?<\/span>/g;
  
  let result = html.replace(mentionTagPattern, (match, emoji, tagName) => {
    // 转换为 #emojitext 格式
    const emojiPart = emoji ? emoji + ' ' : '';
    return `#${emojiPart}${tagName}`;
  });
  
  // 也处理另一种可能的属性顺序
  const mentionTagPattern2 = /<span[^>]*data-tag-name="([^"]*)"[^>]*data-tag-emoji="([^"]*)"[^>]*data-mention-only="true"[^>]*>.*?<\/span>/g;
  
  result = result.replace(mentionTagPattern2, (match, tagName, emoji) => {
    const emojiPart = emoji ? emoji + ' ' : '';
    return `#${emojiPart}${tagName}`;
  });
  
  // 处理只有 data-mention-only 和 data-tag-name 的情况（没有 emoji）
  const mentionTagPattern3 = /<span[^>]*data-mention-only="true"[^>]*data-tag-name="([^"]*)"[^>]*>.*?<\/span>/g;
  
  result = result.replace(mentionTagPattern3, (match, tagName) => {
    return `#${tagName}`;
  });
  
  return result;
}
```

**调用位置**: `processEventDescription` 函数在清理 HTML 之前

```typescript
private processEventDescription(htmlContent: string, ...): string {
  // 🆕 0. 在清理 HTML 之前，先将 mention-only 标签转换为纯文本格式
  let preprocessedHtml = this.convertMentionTagsToPlainText(htmlContent);
  
  // 1. 清理HTML内容，得到纯文本
  let cleanText = this.cleanHtmlContent(preprocessedHtml);
  
  // ...
}
```

### 3.7 数据流

#### 本地编辑流程

```
用户在 Description 中插入标签
         ↓
PlanManager 检测到 isDescriptionMode = true
         ↓
调用 insertTag(..., mentionOnly: true)
         ↓
Slate 编辑器插入 TagNode { mentionOnly: true }
         ↓
序列化时：extractTags 过滤掉 mentionOnly 标签
         ↓
Event.tags 数组不包含这个标签 ✅
```

#### 同步到远程流程

```
本地 Event 保存
         ↓
ActionBasedSyncManager 检测到变化
         ↓
调用 processEventDescription(event.description)
         ↓
convertMentionTagsToPlainText 转换标签为 #emojitext
         ↓
cleanHtmlContent 清理其他 HTML 标签
         ↓
同步到 Microsoft Outlook/Google Calendar
         ↓
远程日历显示：Description 中有 #💼 工作 ✅
```

#### 从远程同步回来

```
Microsoft Outlook 事件
         ↓
body.content: "这是描述 #💼 工作"
         ↓
getEventDescription 提取纯文本
         ↓
保存到本地 Event.description
         ↓
UI 显示：纯文本 "#💼 工作" ✅
```

### 3.8 UI 表现

#### Title 模式（正式标签）

```
┌─────────────────────────────────┐
│ [📝] 完成项目方案 💼 工作      │  ← Tag 是胶囊样式，可点击
└─────────────────────────────────┘
    ↑
    Event.tags = ['tag-work']
```

#### Description 模式（仅提及）

```
┌─────────────────────────────────┐
│ [📝] 完成项目方案               │
│                                 │
│ 📄 这是关于 💼 工作 的任务...  │  ← Tag 是胶囊样式，但不可编辑
└─────────────────────────────────┘
    ↑
    Event.tags = [] (空数组)
    Event.description 包含 HTML tag
```

#### 同步到远程后

```
Microsoft Outlook:
┌─────────────────────────────────┐
│ 📧 完成项目方案                 │
│                                 │
│ 这是关于 #💼 工作 的任务...    │  ← 纯文本形式
└─────────────────────────────────┘
```

### 3.9 测试场景

#### 测试 1: Description 插入标签不影响 Event.tags

**步骤**:
1. 创建新 Event
2. 在 Title 中插入 `#工作`
3. 在 Description 中插入 `#学习`
4. 保存并查看 Event 数据

**预期**:
```json
{
  "title": "完成任务",
  "tags": ["tag-work"],  // ✅ 只有 Title 中的标签
  "description": "<span data-mention-only=\"true\">💼 工作</span>"
}
```

#### 测试 2: 同步到远程转换为纯文本

**步骤**:
1. 创建包含 Description 标签的 Event
2. 同步到 Microsoft Outlook
3. 在 Outlook 中查看事件

**预期**:
- Description 显示：`这是关于 #💼 工作 的任务`（纯文本）

#### 测试 3: 从远程同步回来保持纯文本

**步骤**:
1. 在 Outlook 中手动编辑事件 Description：`测试 #💼 工作`
2. 同步回 ReMarkable
3. 查看本地 Description

**预期**:
- Description 显示：`测试 #💼 工作`（保持纯文本）

### 3.10 优势总结

1. **语义清晰**：
   - Title 的标签 = 正式分类
   - Description 的标签 = 内容提及

2. **远程兼容**：
   - 远程日历不支持富文本标签
   - 转换为纯文本保持可读性

3. **数据准确**：
   - Event.tags 只包含真正的分类标签
   - 不会因为 Description 的提及而污染标签数据

4. **用户友好**：
   - 在 Description 中也能快速插入标签引用
   - 不需要手动输入 `#emoji name`

---

### 3.11 Title 标签自动提取机制

#### 3.11.1 核心原则

**✅ 架构决策：统一由 Slate 序列化层处理，避免在业务代码中解析 HTML**

所有标签提取、格式转换由 `PlanSlateEditor/serialization.ts` 统一处理，业务组件（PlanManager、EventEditModal 等）调用统一接口。

#### 3.11.2 提取规则

- **Title (titleContent 字段)** 中的 TagNode → 添加到 `Event.tags` 数组
- **EventLog (eventlog 字段)** 中的 TagNode → **不添加**到 `Event.tags`（仅作为 mention）
- **Description 字段** 中的标签 → **不添加**到 `Event.tags`（仅作为内容提及）

**语义区分**：

| 位置 | 标签类型 | 是否加入 Event.tags | 用途 |
|------|----------|---------------------|------|
| Title | TagNode (mentionOnly=false) | ✅ 是 | 事件分类 |
| EventLog | TagNode (mentionOnly=true) | ❌ 否 | 上下文提及（如 @张三） |
| Description | 纯文本提及 | ❌ 否 | 内容描述 |

#### 3.11.3 Slate 序列化层实现

**标准实现：`PlanSlateEditor/serialization.ts`**

```typescript
// src/components/PlanSlateEditor/serialization.ts L405-415

/**
 * 从 Slate fragment 提取标签 ID
 * @param fragment Slate 节点数组
 * @returns 标签 ID 数组（排除 mentionOnly）
 */
function extractTags(fragment: (TextNode | TagNode)[]): string[] {
  if (!fragment || !Array.isArray(fragment)) {
    console.warn('[extractTags] fragment 不是数组', { fragment });
    return [];
  }
  
  return fragment
    .filter((node): node is TagNode => 
      'type' in node && 
      node.type === 'tag' && 
      !node.mentionOnly  // ✅ 过滤掉 mention-only 标签
    )
    .map(node => node.tagId)
    .filter(Boolean) as string[];
}

/**
 * Slate → HTML + 提取标签（统一接口）
 */
export function serializeSlateToHtmlWithTags(nodes: Descendant[]): {
  html: string;
  plainText: string;
  tags: string[];
} {
  const html = serializeToHtml(nodes);
  const plainText = serializeToPlainText(nodes);
  const tags = extractTags(nodes as any[]);
  
  return { 
    html, 
    plainText, 
    tags: [...new Set(tags)]  // 去重
  };
}
```

**TagNode 接口定义**：

```typescript
// types/slate.ts

type TagNode = {
  type: 'tag';
  tagId: string;           // 标签 ID（主键）
  tagName: string;         // 标签名称（fallback，优先读取 TagService）
  tagColor?: string;       // 标签颜色
  tagEmoji?: string;       // 标签 emoji
  mentionOnly?: boolean;   // ✅ 是否仅作为 mention（不加入 Event.tags）
  children: [{ text: '' }]; // Slate 要求所有 element 必须有 children
};
```

#### 3.11.4 EventService 统一接口

```typescript
// services/EventService.ts

import { serializeSlateToHtmlWithTags } from '@/components/PlanSlateEditor/serialization';
import type { Descendant } from 'slate';

class EventService {
  /**
   * 从 titleContent 提取标签和纯文本
   * @param titleContent Slate JSON 字符串 或 Slate 节点数组
   */
  static extractTagsFromTitle(titleContent: string | Descendant[]): {
    tags: string[];
    plainText: string;
    html: string;
  } {
    // 1. 解析为 Slate 节点
    const nodes = typeof titleContent === 'string' 
      ? JSON.parse(titleContent) 
      : titleContent;
    
    // 2. 调用 Slate 序列化层统一处理
    return serializeSlateToHtmlWithTags(nodes);
  }
  
  /**
   * 创建事件时自动提取标签
   */
  static async createEvent(eventData: Partial<Event>): Promise<Event> {
    // 如果有 titleContent（Slate JSON），自动提取 tags 和 title
    if (eventData.titleContent) {
      const { tags, plainText, html } = this.extractTagsFromTitle(eventData.titleContent);
      eventData.tags = tags;
      eventData.title = plainText;
      eventData.titleContent = html;  // 标准化 HTML
    }
    
    // ... 其他创建逻辑
    return await this.saveEvent(eventData as Event);
  }
  
  /**
   * 更新事件时重新提取标签
   */
  static async updateEvent(eventId: string, updates: Partial<Event>): Promise<void> {
    // 如果更新了 titleContent，重新提取 tags 和 title
    if (updates.titleContent) {
      const { tags, plainText, html } = this.extractTagsFromTitle(updates.titleContent);
      updates.tags = tags;
      updates.title = plainText;
      updates.titleContent = html;
    }
    
    // ... 其他更新逻辑
    await this.saveEvent({ ...await this.getEvent(eventId), ...updates });
  }
}
```

#### 3.11.5 PlanManager 调用示例

```typescript
// src/components/PlanManager.tsx

import { serializeSlateToHtmlWithTags } from '@/components/PlanSlateEditor/serialization';

// ❌ 旧方法（已弃用）：在业务代码中解析 HTML
// const tempDiv = document.createElement('div');
// tempDiv.innerHTML = titleLine.content;
// const tagElements = tempDiv.querySelectorAll('.inline-tag');
// ...

// ✅ 新方法：调用 Slate 序列化层统一接口
const handleTitleChange = (slateNodes: Descendant[]) => {
  const { tags, plainText, html } = serializeSlateToHtmlWithTags(slateNodes);
  
  const updatedEvent: Event = {
    ...currentEvent,
    title: plainText,          // 纯文本（用于显示、搜索）
    titleContent: html,        // 标准化 HTML（保留所有格式）
    tags: tags,                // 自动提取的标签 ID
  };
  
  await EventService.updateEvent(currentEvent.id, updatedEvent);
};
```

#### 3.11.6 用户操作场景

**场景 1：在 Title 中插入标签**

1. **用户操作**：
   - 用户在 Title 通过 Slate 编辑器输入 `完成 #项目A 的设计稿`
   - Slate 保存为 JSON：
     ```json
     [{
       "type": "paragraph",
       "children": [
         { "text": "完成 " },
         { 
           "type": "tag", 
           "tagId": "proj-a", 
           "tagName": "项目A",
           "mentionOnly": false,
           "children": [{ "text": "" }]
         },
         { "text": " 的设计稿" }
       ]
     }]
     ```

2. **系统处理**：
   - 调用 `serializeSlateToHtmlWithTags(slateNodes)` 返回：
     ```typescript
     {
       tags: ['proj-a'],
       plainText: "完成 项目A 的设计稿",
       html: "<p>完成 <span class='inline-tag' data-tag-id='proj-a'>📊项目A</span> 的设计稿</p>"
     }
     ```

3. **最终 Event 数据**：
   ```json
   {
     "id": "event-123",
     "title": "完成 项目A 的设计稿",
     "titleContent": "<p>完成 <span class='inline-tag' data-tag-id='proj-a'>📊项目A</span> 的设计稿</p>",
     "tags": ["proj-a"]
   }
   ```

**场景 2：TimeLog 中的 mention 不影响 Event.tags**

1. **用户操作**：
   - Title: `完成项目文档`
   - EventLog: `讨论了功能优先级，@张三 提出了性能优化建议`

2. **TimeLog Slate JSON**：
   ```json
   [{
     "type": "paragraph",
     "children": [
       { "text": "讨论了功能优先级，" },
       { 
         "type": "tag", 
         "tagId": "zhang-san", 
         "mentionOnly": true,  // ✅ 标记为 mention
         "children": [{ "text": "" }]
       },
       { "text": " 提出了性能优化建议" }
     ]
   }]
   ```

3. **最终 Event 数据**：
   ```json
   {
     "title": "完成项目文档",
     "tags": [],  // ✅ EventLog 中的 @张三 不加入 tags
     "eventlog": {
       "content": [...],  // 包含 @张三 的 mention
       "descriptionHtml": "<p>讨论了功能优先级，<span data-mention-only='true'>@张三</span> 提出了性能优化建议</p>"
     }
   }
   ```

**场景 3：标签删除自动同步**

1. **用户操作**：
   - 用户从 Title 删除 `#项目A` 标签
   - Slate 编辑器更新节点数组（移除 TagNode）

2. **系统处理**：
   - 调用 `EventService.updateEvent()` 时自动重新提取标签
   - `extractTagsFromTitle()` 返回空数组

3. **最终 Event 数据**：
   ```json
   {
     "title": "完成的设计稿",
     "tags": []  // ✅ 自动从 Event.tags 移除
   }
   ```

#### 3.11.7 标签重命名全局更新

**TimeLog 中的标签（自动更新，无需额外处理）**

✅ **已实现机制**：TagElement 组件渲染时动态读取 TagService

```tsx
// src/components/PlanSlateEditor/elements/TagElement.tsx L13-25

const TagElementComponent: React.FC<RenderElementProps> = ({ 
  attributes, 
  children, 
  element 
}) => {
  const tagElement = element as TagElement;
  
  // ✅ 从 TagService 获取最新标签数据（而非使用节点存储的旧值）
  const tagData = useMemo(() => {
    const tag = tagElement.tagId ? TagService.getTagById(tagElement.tagId) : null;
    return {
      name: tag?.name ?? tagElement.tagName,      // 优先使用 TagService 的最新 name
      color: tag?.color ?? tagElement.tagColor,   // 优先使用 TagService 的最新 color
      emoji: tag?.emoji ?? tagElement.tagEmoji,   // 优先使用 TagService 的最新 emoji
    };
  }, [tagElement.tagId, tagElement.tagName, tagElement.tagColor, tagElement.tagEmoji]);
  
  // ✅ 监听 TagService 更新，自动重新渲染
  useEffect(() => {
    const listener = () => { /* 触发重新渲染 */ };
    TagService.addListener(listener as any);
    return () => TagService.removeListener(listener as any);
  }, [tagElement.tagId]);
  
  // 渲染时使用 tagData（而非 tagElement 的旧值）
  return (
    <span 
      className="inline-tag" 
      data-tag-id={tagElement.tagId}
      data-tag-name={tagData.name}
      {...attributes}
    >
      {tagData.emoji}{tagData.name}
      {children}
    </span>
  );
};
```

**为什么 TimeLog 不需要手动更新 Slate JSON？**

- Slate 中的 `TagElement` 节点存储的是 `tagId`（而不是 `tagName`）
- 示例 Slate JSON:
  ```json
  {
    "type": "tag",
    "tagId": "project-a-id",  // ✅ 存储 ID，不存储 name
    "tagName": "项目A",        // ⚠️ 仅作为 fallback，优先读取 TagService
    "children": [{ "text": "" }]
  }
  ```
- 渲染时通过 `TagService.getTagById(tagId)` 获取最新的 name/color/emoji
- 因此标签重命名后，**下次渲染自动显示新名称**，无需修改 JSON

**Title HTML 字符串（推荐方案：渲染时动态读取）**

考虑到标签重命名是低频操作，且批量更新 HTML 成本高，建议在 UI 渲染时动态读取 TagService：

```typescript
/**
 * 渲染 Event 标题时，动态替换标签名称
 */
function renderEventTitle(event: Event): string {
  if (!event.titleContent) return event.title;
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = event.titleContent;
  
  // 遍历所有标签元素，动态读取 TagService 最新数据
  tempDiv.querySelectorAll('.inline-tag').forEach(el => {
    const tagId = el.getAttribute('data-tag-id');
    if (!tagId) return;
    
    const tag = TagService.getTagById(tagId);
    if (tag) {
      el.setAttribute('data-tag-name', tag.name);
      el.textContent = `${tag.emoji || ''}${tag.name}`;
    }
  });
  
  return tempDiv.innerHTML;
}
```

**可选方案：标签重命名时批量更新 HTML**

如果需要保持数据一致性（例如离线导出、数据迁移场景），可在 `TagService.renameTag()` 时批量更新：

```typescript
class TagService {
  async renameTag(tagId: string, newName: string): Promise<void> {
    const tag = this.getTagById(tagId);
    if (!tag) throw new Error('Tag not found');
    
    // 1. 更新标签本身
    tag.name = newName;
    await this.updateTags(this.tags);
    
    // 2. ✅ TimeLog 中的 TagElement 自动更新（已实现，无需额外代码）
    
    // 3. 可选：批量更新 Title HTML
    const events = EventService.getAllEvents();
    const batch: Array<{ id: string; titleContent: string }> = [];
    
    for (const event of events) {
      if (event.titleContent?.includes(`data-tag-id="${tagId}"`)) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = event.titleContent;
        
        const tagElements = tempDiv.querySelectorAll(`.inline-tag[data-tag-id="${tagId}"]`);
        tagElements.forEach(el => {
          el.setAttribute('data-tag-name', newName);
          el.textContent = `${tag.emoji || ''}${newName}`;
        });
        
        batch.push({ id: event.id, titleContent: tempDiv.innerHTML });
      }
    }
    
    // 批量更新
    await Promise.all(
      batch.map(({ id, titleContent }) => EventService.updateEvent(id, { titleContent }))
    );
    
    this.notifyListeners();
  }
}
```

#### 3.11.8 架构优势

✅ **单一职责**：
- Slate 序列化层负责所有格式转换
- 业务组件只需调用统一接口

✅ **类型安全**：
- 直接操作 Slate AST，避免 HTML 解析错误
- TypeScript 类型检查保证数据一致性

✅ **性能更好**：
- 避免创建 DOM 元素和字符串解析
- 减少不必要的序列化/反序列化

✅ **易于维护**：
- 标签提取逻辑集中在 `serialization.ts`
- 修改时只需更新一处代码

✅ **避免重复**：
- PlanManager、EventEditModal 等组件复用相同逻辑
- 减少代码冗余和维护成本

#### 3.11.9 不推荐的方法（已弃用）

```typescript
// ❌ 在业务代码中用 DOM API 解析 HTML（不推荐）
// 示例：PlanManager.tsx L1398-1406（旧实现，仅作参考）

const tempDiv = document.createElement('div');
tempDiv.innerHTML = content;
const tagElements = tempDiv.querySelectorAll('.inline-tag');
const extractedTags: string[] = [];
tagElements.forEach(tagEl => {
  const tagId = tagEl.getAttribute('data-tag-id');
  if (tagId) extractedTags.push(tagId);
});

// 问题：
// 1. 每个组件重复实现解析逻辑
// 2. DOM 操作性能差
// 3. 类型不安全（依赖 HTML 字符串格式）
// 4. 维护困难（多处实现需同步更新）
// 5. 违反单一职责原则（业务逻辑混杂格式转换）
```

**为什么弃用**：

1. **架构层面**：违反关注点分离原则
2. **性能层面**：频繁创建 DOM 元素开销大
3. **维护层面**：逻辑分散在多处，难以统一修改
4. **安全层面**：依赖 HTML 字符串格式，容易出错

**迁移指南**：

如果现有代码使用了 DOM 解析方式，请按以下步骤迁移：

1. **确认 Slate 序列化层已实现**：
   - 验证 `src/components/PlanSlateEditor/serialization.ts` 中存在 `extractTags()` 和 `serializeSlateToHtmlWithTags()` 函数

2. **更新 EventService**：
   - 添加 `extractTagsFromTitle()` 方法
   - 在 `createEvent()` 和 `updateEvent()` 中使用此方法

3. **更新业务组件**：
   - 替换 DOM 解析代码为 `serializeSlateToHtmlWithTags()` 调用
   - 测试标签提取、删除、重命名等场景

4. **删除旧代码**：
   - 移除 `tempDiv.innerHTML` 等 DOM 解析逻辑
   - 添加注释标记为已弃用

---

## 4. 数据格式选型

## 2. 数据格式选型

### 4.1 最佳方案：JSON + HTML 双存储

采用 **Slate JSON** 作为主存储，配合预渲染的 HTML 和纯文本备份。

```typescript  
// types/eventlog.ts  

/**
 * Event 接口（含嵌入式 EventLog）
 * 
 * 🆕 架构决策（2025-11-13）：
 * - EventLog 不是独立实体，而是 Event 的 eventlog 字段
 * - TimeLog 是页面/功能模块，EventLog 是 Event 内部的日志字段
 * - 版本历史存储在 Event.eventlog.versions 数组中
 * - 所有时间字段遵循 TimeHub/TimeSpec 架构
 */
interface Event {
  id: string;
  title: string;              // 纯文本标题（用于显示、搜索）
  titleContent?: string;      // 富文本 HTML（Slate 输出，用于编辑恢复）
  
  // 时间字段（保留字符串用于快速查询和向后兼容）
  startTime: string;     // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'，用于数据库索引和 UI 显示
  endTime: string;       // TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'
  
  // 完整时间对象（TimeSpec 架构）
  timeSpec?: TimeSpec;   // 包含 kind, source, policy, resolved
  
  tags?: string[];       // 标签 ID 数组（从 titleContent 自动提取，不包含 eventlog 中的 mention）
  
  // 🆕 嵌入式 EventLog 字段
  eventlog?: {
    // 主存储：结构化 JSON (Slate format)  
    content: Descendant[]; // Slate 的原生格式，可包含 ContextMarkerElement
    
    // 辅助存储：简化 HTML (用于 Outlook 同步)  
    descriptionHtml: string;  
    
    // 纯文本备份 (用于搜索和降级)  
    descriptionPlainText: string;  
    
    // 媒体附件元数据  
    attachments?: Attachment[];  
    
    // 版本控制（保留最近 50 个版本）
    versions?: EventLogVersion[];  
    
    // 同步元数据  
    syncState?: SyncState;  
    
    // 时间戳
    createdAt?: Date;  
    updatedAt?: Date;  
  };
  
  // 🆕 签到功能字段
  checked?: string[];              // 签到时间戳数组（TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'）
  unchecked?: string[];            // 取消签到时间戳数组（TimeSpec 格式: 'YYYY-MM-DD HH:mm:ss'）
  
  // 其他现有字段
  isTimer?: boolean;
  isDeadline?: boolean;
  isPlan?: boolean;
  // ...
}

/**
 * Slate 文档节点类型
 * 支持段落和情境标记两种块级元素
 */
type Descendant = ParagraphElement | ContextMarkerElement;

/**
 * 段落元素
 */
type ParagraphElement = {
  type: 'paragraph';
  children: CustomText[];
};

/**
 * 情境标记元素
 * 自动记录用户编辑时的时间和应用活动上下文
 */
type ContextMarkerElement = {
  type: 'context-marker';
  timeSpec: TimeSpec;              // ✅ 使用 TimeSpec 而非 ISO 字符串
  activities: ActivitySpan[];      // 该时间点后的活动记录
  children: [{ text: '' }];        // Slate Void 节点要求
};

/**
 * 单个应用活动片段
 */
type ActivitySpan = {
  appId: string;                   // 如 "com.figma.desktop"
  appName: string;                 // 如 "Figma"
  appColor: string;                // 应用主题色（HEX）
  title: string | null;            // 窗口标题
  duration: number;                // 持续时长（秒）
};

/**
 * 附件元数据
 */
type Attachment = {  
  id: string;  
  type: 'audio' | 'video' | 'image' | 'file';  
  url: string;              // 云存储 URL  
  localUrl?: string;        // 本地缓存路径  
  fileName: string;  
  mimeType: string;  
  size: number;  
  uploadedAt: Date;  
};  

/**
 * 同步状态
 * 用于检测本地和远程（Outlook）的变更冲突
 */
type SyncState = {  
  localHash: string;        // eventlog 上次同步时的哈希  
  remoteHash: string;       // Outlook description 上次同步时的哈希  
  lastSyncedAt: Date;  
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';  
};
```

### 4.2 为什么选择 Slate JSON？

**优势:**

- ✅ 结构化: 每个元素都是 JSON 对象，易于操作
- ✅ 可扩展: 可以添加自定义属性（如 mention、tag）
- ✅ 双向转换: 可以精确转换为 HTML 和纯文本
- ✅ 编辑器原生支持: 与 Slate 编辑器无缝集成

**示例（包含情境标记）:**

```json
[
  {
    "type": "context-marker",
    "timeSpec": {
      "kind": "fixed",
      "source": "system",
      "rawText": null,
      "policy": { "weekStart": 1 },
      "resolved": {
        "start": "2025-11-03T10:00:00",
        "end": "2025-11-03T10:00:00"
      },
      "start": "2025-11-03T10:00:00",
      "end": "2025-11-03T10:00:00",
      "allDay": false
    },
    "activities": [
      {
        "appId": "com.google.Chrome",
        "appName": "Chrome",
        "appColor": "#4285F4",
        "title": "Slate.js Documentation",
        "duration": 300
      }
    ],
    "children": [{ "text": "" }]
  },
  {
    "type": "paragraph",
    "children": [
      { "text": "开始研究 Slate.js 的数据模型。" }
    ]
  },
  {
    "type": "heading-1",
    "children": [
      { "text": "项目进展", "bold": true }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      { "text": "完成了 " },
      {
        "type": "mention",
        "character": "@项目A",
        "children": [{ "text": "" }]
      },
      { "text": " 的需求分析" }
    ]
  },
  {
    "type": "context-marker",
    "timeSpec": {
      "kind": "fixed",
      "source": "system",
      "rawText": null,
      "policy": { "weekStart": 1 },
      "resolved": {
        "start": "2025-11-03T10:05:30",
        "end": "2025-11-03T10:05:30"
      },
      "start": "2025-11-03T10:05:30",
      "end": "2025-11-03T10:05:30",
      "allDay": false
    },
    "activities": [
      {
        "appId": "com.spotify.client",
        "appName": "Spotify",
        "appColor": "#1DB954",
        "title": "Lofi Beats Playlist",
        "duration": 180
      },
      {
        "appId": "com.microsoft.VSCode",
        "appName": "VS Code",
        "appColor": "#007ACC",
        "title": "TimeLog_PRD.md",
        "duration": 420
      }
    ],
    "children": [{ "text": "" }]
  },
  {
    "type": "paragraph",
    "children": [
      { "text": "切换了音乐，开始写 PRD 文档。" }
    ]
  },
  {
    "type": "table",
    "children": [
      {
        "type": "table-row",
        "children": [
          {
            "type": "table-cell",
            "children": [{ "text": "任务" }]
          },
          {
            "type": "table-cell",
            "children": [{ "text": "状态" }]
          }
        ]
      }
    ]
  }
]
```

## 5. 双向同步架构

### 5.1 核心挑战

- **信息不对称**: eventlog 能存储视频/音频，但 Outlook description 不能
- **格式冲突**: Slate JSON ≠ Outlook HTML
- **冲突检测**: 如何判断是哪一端发生了变更？

### 5.2 解决方案：字段级冲突检测 + 智能序列化

> **设计决策**: 详见顶部"架构决策记录 → 字段级冲突检测 + Git 风格 Diff UI"

#### 5.2.1 字段级冲突检测

**传统方案的问题：**
- 只检测整个 Event 是否冲突
- 即使只有 title 改变，也会导致整个 eventlog 被覆盖
- 用户体验差，数据丢失风险高

**改进方案：字段级检测**

```typescript
// sync/fieldLevelConflictDetection.ts
import crypto from 'crypto';

/**
 * 字段级冲突结果
 */
interface FieldLevelConflictResult {
  hasConflict: boolean;
  conflictedFields: FieldConflict[];    // 具体哪些字段冲突
  cleanFields: string[];                // 无冲突的字段
  resolution: ConflictResolution;
}

type FieldConflict = {
  field: EventField;
  localValue: any;
  remoteValue: any;
  localHash: string;
  remoteHash: string;
  lastSyncValue?: any;                  // 三方合并基准（来自 EventHistory）
  autoResolvable: boolean;              // 是否可自动解决
  suggestedResolution?: 'keep-local' | 'keep-remote' | 'merge';
};

type EventField = 
  | 'title'
  | 'tags'
  | 'timelog'
  | 'startTime'
  | 'endTime'
  | 'location'
  | 'isAllDay';

type ConflictResolution =
  | 'auto-resolved'          // 自动解决（无冲突或可自动合并）
  | 'manual-required'        // 需要用户手动选择
  | 'last-write-wins';       // 使用 LWW 策略

/**
 * 检测字段级冲突
 * 
 * @param localEvent - 本地 Event
 * @param remoteEvent - Outlook Event
 * @param lastSyncState - 上次同步的状态（来自 EventHistory）
 */
export async function detectFieldLevelConflicts(
  localEvent: Event,
  remoteEvent: OutlookEvent,
  lastSyncState?: EventHistoryEntry
): Promise<FieldLevelConflictResult> {
  
  const conflictedFields: FieldConflict[] = [];
  const cleanFields: string[] = [];
  
  // 检测每个字段
  const fieldsToCheck: EventField[] = [
    'title',
    'tags',
    'timelog',
    'startTime',
    'endTime',
    'location',
    'isAllDay',
  ];
  
  for (const field of fieldsToCheck) {
    const conflict = await checkFieldConflict(
      field,
      localEvent,
      remoteEvent,
      lastSyncState
    );
    
    if (conflict) {
      conflictedFields.push(conflict);
    } else {
      cleanFields.push(field);
    }
  }
  
  // 判断解决策略
  const resolution = determineResolution(conflictedFields);
  
  return {
    hasConflict: conflictedFields.length > 0,
    conflictedFields,
    cleanFields,
    resolution,
  };
}

/**
 * 检测单个字段的冲突
 */
async function checkFieldConflict(
  field: EventField,
  local: Event,
  remote: OutlookEvent,
  lastSync?: EventHistoryEntry
): Promise<FieldConflict | null> {
  
  // 1. 提取字段值
  const localValue = extractFieldValue(field, local);
  const remoteValue = extractFieldValue(field, remote);
  const lastSyncValue = lastSync 
    ? extractFieldValue(field, lastSync.snapshot)
    : undefined;
  
  // 2. 计算哈希
  const localHash = hashValue(localValue);
  const remoteHash = hashValue(remoteValue);
  const lastSyncHash = lastSyncValue ? hashValue(lastSyncValue) : null;
  
  // 3. 检测变更
  const localChanged = lastSyncHash && localHash !== lastSyncHash;
  const remoteChanged = lastSyncHash && remoteHash !== lastSyncHash;
  
  // 4. 无冲突情况
  if (!localChanged && !remoteChanged) return null;  // 都没变
  if (localHash === remoteHash) return null;         // 值相同
  
  // 5. 单边变更（可自动解决）
  if (localChanged && !remoteChanged) {
    return {
      field,
      localValue,
      remoteValue,
      localHash,
      remoteHash,
      lastSyncValue,
      autoResolvable: true,
      suggestedResolution: 'keep-local',
    };
  }
  
  if (!localChanged && remoteChanged) {
    return {
      field,
      localValue,
      remoteValue,
      localHash,
      remoteHash,
      lastSyncValue,
      autoResolvable: true,
      suggestedResolution: 'keep-remote',
    };
  }
  
  // 6. 双边变更（需要用户决定）
  return {
    field,
    localValue,
    remoteValue,
    localHash,
    remoteHash,
    lastSyncValue,
    autoResolvable: false,
    suggestedResolution: undefined,
  };
}

/**
 * 提取字段值（处理 Event 和 OutlookEvent 的差异）
 */
function extractFieldValue(field: EventField, event: Event | OutlookEvent): any {
  const mapping: Record<EventField, (e: any) => any> = {
    title: (e) => e.subject || e.title,
    tags: (e) => e.categories || e.tags,
    eventlog: (e) => e.body?.content || e.eventlog?.content,
    startTime: (e) => e.start?.dateTime || e.startTime,
    endTime: (e) => e.end?.dateTime || e.endTime,
    location: (e) => e.location?.displayName || e.location,
    isAllDay: (e) => e.isAllDay,
  };
  
  return mapping[field]?.(event);
}

/**
 * 计算字段值的哈希
 */
function hashValue(value: any): string {
  const str = typeof value === 'string' 
    ? value 
    : JSON.stringify(value);
  
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * 决定解决策略
 */
function determineResolution(conflicts: FieldConflict[]): ConflictResolution {
  if (conflicts.length === 0) {
    return 'auto-resolved';
  }
  
  // 如果所有冲突都可自动解决
  if (conflicts.every(c => c.autoResolvable)) {
    return 'auto-resolved';
  }
  
  // 否则需要用户手动选择
  return 'manual-required';
}
```

**字段冲突示例：**

```typescript
// 场景 1: title 在本地改了，timelog 在 Outlook 改了
{
  conflictedFields: [
    {
      field: 'title',
      localValue: '完成项目 A',
      remoteValue: '完成项目 B',
      autoResolvable: false,  // 双边都改了
    },
    {
      field: 'timelog',
      localValue: '<slate json>',
      remoteValue: '<html>',
      autoResolvable: false,
    }
  ],
  resolution: 'manual-required'
}

// 场景 2: 只有 tags 在本地改了
{
  conflictedFields: [
    {
      field: 'tags',
      localValue: ['work', 'urgent'],
      remoteValue: ['work'],
      autoResolvable: true,
      suggestedResolution: 'keep-local',  // 本地更新，自动推送
    }
  ],
  resolution: 'auto-resolved'
}
```

#### 5.2.2 冲突检测流程图

```
┌─────────────────────────────────────┐
│   1. 获取本地和远程 Event           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   2. 从 EventHistory 获取           │
│      lastSyncState（三方合并基准）   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   3. 逐字段比较                     │
│      - 计算每个字段的 hash          │
│      - 对比 local/remote/lastSync   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   4. 分类冲突                       │
│      - 无冲突字段 → 跳过            │
│      - 单边变更 → 自动解决          │
│      - 双边变更 → 需要用户决定      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   5. 决定策略                       │
│      - auto-resolved → 自动同步     │
│      - manual-required → 显示 UI    │
└───────────────────────────────────── ┘
```

#### 5.2.3 Slate JSON → Outlook HTML 智能序列化

```typescript
// serializers/slateToHtml.ts
import { Node, Text } from 'slate';
import escapeHtml from 'escape-html';

export const slateToHtml = (nodes: Descendant[]): string => {
  return nodes.map(node => serializeNode(node)).join('');
};

const serializeNode = (node: Descendant): string => {
  // 文本节点
  if (Text.isText(node)) {
    let text = escapeHtml(node.text);
    
    // 应用文本样式
    if (node.bold) text = `<strong>${text}</strong>`;
    if (node.italic) text = `<em>${text}</em>`;
    if (node.underline) text = `<u>${text}</u>`;
    if (node.code) text = `<code>${text}</code>`;
    
    // 字体颜色
    if (node.color) {
      text = `<span style="color: ${node.color}">${text}</span>`;
    }
    
    // 背景色
    if (node.backgroundColor) {
      text = `<span style="background-color: ${node.backgroundColor}">${text}</span>`;
    }
    
    return text;
  }

  // 元素节点
  const children = node.children.map(n => serializeNode(n)).join('');

  switch (node.type) {
    case 'paragraph':
      return `<p>${children}</p>`;
    
    case 'heading-1':
      return `<h1>${children}</h1>`;
    
    case 'heading-2':
      return `<h2>${children}</h2>`;
    
    case 'heading-3':
      return `<h3>${children}</h3>`;
    
    case 'bulleted-list':
      return `<ul>${children}</ul>`;
    
    case 'numbered-list':
      return `<ol>${children}</ol>`;
    
    case 'list-item':
      return `<li>${children}</li>`;
    
    case 'table':
      return `<table border="1" cellpadding="5" cellspacing="0">${children}</table>`;
    
    case 'table-row':
      return `<tr>${children}</tr>`;
    
    case 'table-cell':
      return `<td>${children}</td>`;
    
    case 'link':
      return `<a href="${escapeHtml(node.url)}">${children}</a>`;
    
    // 关键：媒体元素的降级处理
    case 'image':
      return `<p><img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.fileName || '')}" style="max-width: 100%;" /></p>`;
    
    case 'video':
      return `<p>📹 视频: <a href="${escapeHtml(node.url)}">${escapeHtml(node.fileName || '点击查看')}</a></p>`;
    
    case 'audio':
      return `<p>🎵 音频: <a href="${escapeHtml(node.url)}">${escapeHtml(node.fileName || '点击播放')}</a></p>`;
    
    case 'mention':
      return `<span style="background-color: #e3f2fd; padding: 2px 6px; border-radius: 3px; color: #1976d2;">${children}</span>`;
    
    default:
      return children;
  }
};
```

#### 5.2.3 Slate JSON → Plain Text 转换器

```typescript
// serializers/slateToPlainText.ts
import { Node, Text } from 'slate';

export const slateToPlainText = (nodes: Descendant[]): string => {
  return nodes.map(n => serialize(n)).join('\n');
};

const serialize = (node: Descendant): string => {
  if (Text.isText(node)) {
    return node.text;
  }

  const children = node.children.map(n => serialize(n)).join('');

  switch (node.type) {
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
      return `\n${children}\n${'='.repeat(Math.min(children.length, 50))}\n`;
    
    case 'paragraph':
      return children;
    
    case 'list-item':
      return `• ${children}`;
    
    case 'link':
      return `${children} (${node.url})`;
    
    case 'video':
      return `[视频: ${node.fileName || node.url}]`;
    
    case 'audio':
      return `[音频: ${node.fileName || node.url}]`;
    
    case 'image':
      return `[图片: ${node.fileName || node.url}]`;
    
    case 'table':
      return `\n[表格]\n${children}\n`;
    
    case 'table-row':
      return `${children}\n`;
    
    case 'table-cell':
      return `${children} | `;
    
    default:
      return children;
  }
};
```

#### 5.2.4 Outlook HTML → Slate JSON 转换器（逆向）

```typescript
// serializers/htmlToSlate.ts
import { jsx } from 'slate-hyperscript';
import { JSDOM } from 'jsdom';

export const htmlToSlate = (html: string): Descendant[] => {
  const dom = new JSDOM(html);
  const { body } = dom.window.document;
  
  return deserialize(body);
};

const deserialize = (el: Element | ChildNode): Descendant | Descendant[] | null => {
  // 文本节点
  if (el.nodeType === 3) {
    return { text: el.textContent || '' };
  }

  // 非元素节点
  if (el.nodeType !== 1) {
    return null;
  }

  const element = el as Element;
  const nodeName = element.nodeName.toLowerCase();
  let children = Array.from(element.childNodes)
    .map(deserialize)
    .flat()
    .filter(Boolean) as Descendant[];

  // 如果没有子节点，添加一个空文本节点
  if (children.length === 0) {
    children = [{ text: '' }];
  }

  // 文本样式
  if (nodeName === 'strong' || nodeName === 'b') {
    return children.map(child => 
      Text.isText(child) ? { ...child, bold: true } : child
    );
  }

  if (nodeName === 'em' || nodeName === 'i') {
    return children.map(child => 
      Text.isText(child) ? { ...child, italic: true } : child
    );
  }

  if (nodeName === 'u') {
    return children.map(child => 
      Text.isText(child) ? { ...child, underline: true } : child
    );
  }

  if (nodeName === 'code') {
    return children.map(child => 
      Text.isText(child) ? { ...child, code: true } : child
    );
  }

  // 处理内联样式 (颜色等)
  if (nodeName === 'span') {
    const style = element.getAttribute('style');
    if (style) {
      const colorMatch = style.match(/color:\s*([^;]+)/);
      const bgMatch = style.match(/background-color:\s*([^;]+)/);
      
      return children.map(child => {
        if (!Text.isText(child)) return child;
        
        const styledChild = { ...child };
        if (colorMatch) styledChild.color = colorMatch[1].trim();
        if (bgMatch) styledChild.backgroundColor = bgMatch[1].trim();
        
        return styledChild;
      });
    }
  }

  // 块级元素
  switch (nodeName) {
    case 'p':
      return { type: 'paragraph', children };
    
    case 'h1':
      return { type: 'heading-1', children };
    
    case 'h2':
      return { type: 'heading-2', children };
    
    case 'h3':
      return { type: 'heading-3', children };
    
    case 'ul':
      return { type: 'bulleted-list', children };
    
    case 'ol':
      return { type: 'numbered-list', children };
    
    case 'li':
      return { type: 'list-item', children };
    
    case 'table':
      return { type: 'table', children };
    
    case 'tr':
      return { type: 'table-row', children };
    
    case 'td':
    case 'th':
      return { type: 'table-cell', children };
    
    case 'a':
      return {
        type: 'link',
        url: element.getAttribute('href') || '',
        children,
      };
    
    case 'img':
      return {
        type: 'image',
        url: element.getAttribute('src') || '',
        fileName: element.getAttribute('alt') || '',
        children: [{ text: '' }],
      };
    
    case 'br':
      return { text: '\n' };
    
    default:
      return children;
  }
};
```

### 5.3 同步引擎

```typescript
// sync/syncEngine.ts

export class SyncEngine {
  constructor(
    private outlookApi: OutlookApiClient,
    private db: Database
  ) {}
  
  async syncEvent(eventId: string) {
    // 1. 获取本地和远程数据
    const localEvent = await this.db.events.findById(eventId);
    const remoteEvent = await this.outlookApi.getEvent(eventId);
    
    // 2. 检测冲突
    const conflict = detectConflict(
      localEvent.eventlog.slateJson,
      remoteEvent.body.content,
      localEvent.syncState
    );
    
    // 3. 根据冲突类型处理
    switch (conflict) {
      case 'no-change':
        return { status: 'synced' };
      
      case 'local-changed':
        return await this.pushToOutlook(localEvent, remoteEvent);
      
      case 'remote-changed':
        return await this.pullFromOutlook(localEvent, remoteEvent);
      
      case 'both-changed':
        return await this.resolveConflict(localEvent, remoteEvent);
    }
  }
  
  // timelog → Outlook
  private async pushToOutlook(local: Event, remote: OutlookEvent) {
    console.log('📤 推送到 Outlook...');
    
    // 1. 转换 Slate JSON → HTML
    const html = slateToHtml(local.eventlog.slateJson);
    const plainText = slateToPlainText(local.eventlog.slateJson);
    
    // 2. 处理附件
    const attachments = await this.uploadAttachments(local.eventlog.attachments);
    
    // 3. 更新 Outlook
    await this.outlookApi.updateEvent(remote.id, {
      body: {
        contentType: 'html',
        content: html,
      },
      bodyPreview: plainText.substring(0, 255), // Outlook 限制
      attachments: attachments,
    });
    
    // 4. 更新同步状态
    await this.db.events.update(local.id, {
      'syncState.localHash': hashContent(local.eventlog.slateJson),
      'syncState.remoteHash': hashContent(html),
      'syncState.lastSyncedAt': new Date(),
      'syncState.syncStatus': 'synced',
    });
    
    console.log('✅ 推送成功');
    return { status: 'pushed' };
  }
  
  // Outlook → timelog
  private async pullFromOutlook(local: Event, remote: OutlookEvent) {
    console.log('📥 从 Outlook 拉取...');
    
    // 1. 转换 HTML → Slate JSON
    const slateContent = htmlToSlate(remote.body.content);
    
    // 2. 下载附件
    const attachments = await this.downloadAttachments(remote.attachments);
    
    // 3. 更新本地
    await this.db.events.update(local.id, {
      'timelog.content': slateContent,
      'timelog.attachments': attachments,
      'syncState.localHash': hashContent(slateContent),
      'syncState.remoteHash': hashContent(remote.body.content),
      'syncState.lastSyncedAt': new Date(),
      'syncState.syncStatus': 'synced',
    });
    
    console.log('✅ 拉取成功');
    return { status: 'pulled' };
  }
  
  // 冲突解决策略
  private async resolveConflict(local: Event, remote: OutlookEvent) {
    console.log('⚠️ 检测到冲突');
    
    // 策略 1: "Last Write Wins" (最后写入优先)
    const localUpdatedAt = new Date(local.updatedAt);
    const remoteUpdatedAt = new Date(remote.lastModifiedDateTime);
    
    if (localUpdatedAt > remoteUpdatedAt) {
      console.log('  → 本地更新时间更晚，推送到 Outlook');
      return await this.pushToOutlook(local, remote);
    } else {
      console.log('  → Outlook 更新时间更晚，拉取到本地');
      return await this.pullFromOutlook(local, remote);
    }
    
    // 策略 2: 提示用户手动选择（未来功能）
    // return {
    //   status: 'conflict',
    //   local: local.eventlog.slateJson,
    //   remote: htmlToSlate(remote.body.content),
    // };
  }
  
  // 上传附件到 OneDrive
  private async uploadAttachments(attachments: Attachment[]): Promise<any[]> {
    return Promise.all(
      attachments.map(async attachment => {
        // 对于大文件（>4MB），使用 Upload Session
        if (attachment.size > 4 * 1024 * 1024) {
          const uploadSession = await this.outlookApi.createUploadSession(attachment);
          return await this.uploadLargeFile(uploadSession, attachment);
        }
        
        // 小文件直接上传
        return {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.fileName,
          contentType: attachment.mimeType,
          contentBytes: await this.readFileAsBase64(attachment.localUrl),
        };
      })
    );
  }
  
  // 下载附件到本地
  private async downloadAttachments(attachments: any[]): Promise<Attachment[]> {
    return Promise.all(
      attachments.map(async attachment => {
        const localUrl = await this.saveAttachmentLocally(attachment);
        
        return {
          id: attachment.id,
          type: this.detectAttachmentType(attachment.contentType),
          url: attachment.contentLocation || localUrl,
          localUrl,
          fileName: attachment.name,
          mimeType: attachment.contentType,
          size: attachment.size,
          uploadedAt: new Date(),
        };
      })
    );
  }
  
  private detectAttachmentType(mimeType: string): 'audio' | 'video' | 'image' | 'file' {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    return 'file';
  }
  
  private async uploadLargeFile(session: any, attachment: Attachment): Promise<any> {
    // 实现大文件分块上传逻辑
    // 参考: https://learn.microsoft.com/en-us/graph/api/attachment-createuploadsession
    throw new Error('大文件上传功能待实现');
  }
  
  private async readFileAsBase64(filePath: string): Promise<string> {
    // 读取文件并转换为 Base64
    const fs = require('fs').promises;
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }
  
  private async saveAttachmentLocally(attachment: any): Promise<string> {
    // 下载并保存附件到本地
    const path = require('path');
    const fs = require('fs').promises;
    const { app } = require('electron');
    
    const localPath = path.join(
      app.getPath('userData'),
      'attachments',
      `${attachment.id}_${attachment.name}`
    );
    
    // 确保目录存在
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    
    // 下载并保存
    const content = Buffer.from(attachment.contentBytes, 'base64');
    await fs.writeFile(localPath, content);
    
    return localPath;
  }
}
```

### 5.4 智能序列化系统：保留格式 + 降级策略

> **设计目标**: 将 Slate JSON 转换为 Outlook HTML 时，最大化保留格式信息，同时为不支持的元素提供优雅降级

#### 5.4.1 格式保留映射表

| Slate 元素 | Outlook HTML | 保留程度 | 备注 |
|-----------|--------------|---------|------|
| **文本样式** | | | |
| `bold` | `<strong>` | ✅ 100% | 完全支持 |
| `italic` | `<em>` | ✅ 100% | 完全支持 |
| `underline` | `<u>` | ✅ 100% | 完全支持 |
| `color` | `<span style="color">` | ✅ 100% | 保留颜色值 |
| `backgroundColor` | `<span style="background-color">` | ✅ 100% | 保留颜色值 |
| **结构元素** | | | |
| `paragraph` | `<p>` | ✅ 100% | 完全支持 |
| `heading-1/2/3` | `<h1/2/3>` | ✅ 100% | 完全支持 |
| `bulleted-list` | `<ul><li>` | ✅ 100% | 完全支持 |
| `numbered-list` | `<ol><li>` | ✅ 100% | 完全支持 |
| `link` | `<a href>` | ✅ 100% | 完全支持 |
| **特殊元素** | | | |
| `table` | Markdown 表格 | ⚠️ 70% | 转为文本表格 |
| `image` | Web Viewer 链接 | ⚠️ 50% | 提供预览链接 |
| `video` | Web Viewer 链接 | ⚠️ 50% | 提供播放链接 |
| `attachment` | Web Viewer 链接 | ⚠️ 50% | 提供下载链接 |
| `tag` (mention-only) | `#emoji name` | ⚠️ 80% | 纯文本形式 |
| `ContextMarker` (v2.0) | `<!-- hidden -->` | ⚠️ 0% | 隐藏元数据 |

#### 5.4.2 表格 Markdown 化实现

```typescript
// serializers/tableToMarkdown.ts

/**
 * 将 Slate 表格转换为 Markdown 风格的文本表格
 * 
 * 输入 (Slate JSON):
 * {
 *   type: 'table',
 *   children: [
 *     { type: 'table-row', children: [
 *       { type: 'table-cell', children: [{ text: '姓名' }] },
 *       { type: 'table-cell', children: [{ text: '年龄' }] }
 *     ]},
 *     { type: 'table-row', children: [
 *       { type: 'table-cell', children: [{ text: '张三' }] },
 *       { type: 'table-cell', children: [{ text: '25' }] }
 *     ]}
 *   ]
 * }
 * 
 * 输出 (Markdown):
 * | 姓名 | 年龄 |
 * |------|------|
 * | 张三 | 25   |
 */
function serializeTable(tableNode: TableElement): string {
  const rows = tableNode.children as TableRowElement[];
  
  if (rows.length === 0) {
    return '<p>[空表格]</p>';
  }
  
  // 1. 提取表头（第一行）
  const headerRow = rows[0];
  const headers = headerRow.children.map(cell => 
    extractCellText(cell as TableCellElement)
  );
  
  // 2. 计算列宽（用于对齐）
  const columnWidths = headers.map((h, i) => {
    const maxWidth = Math.max(
      h.length,
      ...rows.slice(1).map(row => {
        const cell = row.children[i] as TableCellElement;
        return extractCellText(cell).length;
      })
    );
    return Math.max(maxWidth, 4); // 最小宽度 4
  });
  
  // 3. 生成 Markdown 表格
  const lines: string[] = [];
  
  // 表头
  lines.push('| ' + headers.map((h, i) => 
    h.padEnd(columnWidths[i])
  ).join(' | ') + ' |');
  
  // 分隔线
  lines.push('|' + columnWidths.map(w => 
    '-'.repeat(w + 2)
  ).join('|') + '|');
  
  // 数据行
  rows.slice(1).forEach(row => {
    const cells = row.children.map((cell, i) => 
      extractCellText(cell as TableCellElement).padEnd(columnWidths[i])
    );
    lines.push('| ' + cells.join(' | ') + ' |');
  });
  
  // 4. 包装为 HTML（保留 Markdown 格式）
  return `<pre style="font-family: 'Courier New', monospace; background: #f5f5f5; padding: 10px; border-radius: 4px;">\n${lines.join('\n')}\n</pre>`;
}

function extractCellText(cell: TableCellElement): string {
  return cell.children
    .map(child => Text.isText(child) ? child.text : '')
    .join('');
}
```

**Markdown 表格示例输出：**

```
┌────────────────────────────────────┐
│ 表格: 项目进度统计                 │
├────────────────────────────────────┤
│ | 项目名称   | 状态   | 负责人 |  │
│ |------------|--------|--------|  │
│ | 设计系统   | 进行中 | 张三   |  │
│ | API 开发   | 已完成 | 李四   |  │
│ | 测试部署   | 未开始 | 王五   |  │
└────────────────────────────────────┘
```

#### 5.4.3 媒体元素的 Web Viewer 链接

```typescript
// serializers/mediaToLink.ts

/**
 * 图片元素 → Web Viewer 链接
 */
function serializeImage(imageNode: ImageElement, eventId: string): string {
  const viewerUrl = `https://app.remarkable.com/events/${eventId}/eventlog#image-${imageNode.id}`;
  
  // 方案 A: 内嵌缩略图 (如果 Outlook 支持)
  if (imageNode.thumbnailUrl) {
    return `
      <p style="border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
        <a href="${escapeHtml(viewerUrl)}">
          <img src="${escapeHtml(imageNode.thumbnailUrl)}" 
               alt="${escapeHtml(imageNode.fileName)}" 
               style="max-width: 200px; display: block;" />
          <span style="font-size: 12px; color: #666;">📷 ${escapeHtml(imageNode.fileName)} - 点击查看原图</span>
        </a>
      </p>
    `;
  }
  
  // 方案 B: 纯文本链接 (降级)
  return `<p>📷 <a href="${escapeHtml(viewerUrl)}">查看图片: ${escapeHtml(imageNode.fileName)}</a></p>`;
}

/**
 * 视频元素 → Web Viewer 链接
 */
function serializeVideo(videoNode: VideoElement, eventId: string): string {
  const viewerUrl = `https://app.remarkable.com/events/${eventId}/eventlog#video-${videoNode.id}`;
  const duration = videoNode.duration ? ` (${formatDuration(videoNode.duration)})` : '';
  
  return `<p>📹 <a href="${escapeHtml(viewerUrl)}">观看视频: ${escapeHtml(videoNode.fileName)}${duration}</a></p>`;
}

/**
 * 附件元素 → Web Viewer 链接
 */
function serializeAttachment(attachmentNode: AttachmentElement, eventId: string): string {
  const viewerUrl = `https://app.remarkable.com/events/${eventId}/eventlog#attachment-${attachmentNode.id}`;
  const size = formatFileSize(attachmentNode.size);
  
  return `<p>📎 <a href="${escapeHtml(viewerUrl)}">下载附件: ${escapeHtml(attachmentNode.fileName)} (${size})</a></p>`;
}

/**
 * 格式化时长
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

#### 5.4.4 完整序列化流程

```typescript
// serializers/slateToOutlookHtml.ts

/**
 * 智能序列化：Slate JSON → Outlook HTML
 * 
 * @param content - Slate JSON 内容
 * @param eventId - Event ID（用于生成 Web Viewer 链接）
 * @returns Outlook 兼容的 HTML
 */
export function slateToOutlookHtml(content: Descendant[], eventId: string): string {
  const htmlParts: string[] = [];
  
  for (const node of content) {
    htmlParts.push(serializeNodeSmart(node, eventId));
  }
  
  // 添加底部提示
  const footer = `
    <hr style="margin-top: 20px; border: none; border-top: 1px solid #ddd;" />
    <p style="font-size: 12px; color: #999;">
      💡 此内容由 <a href="https://app.remarkable.com">ReMarkable</a> 生成。
      某些富媒体元素（表格、图片、视频等）可能在移动端显示受限，
      <a href="https://app.remarkable.com/events/${eventId}/timelog">点击查看完整版</a>。
    </p>
  `;
  
  return htmlParts.join('\n') + footer;
}

function serializeNodeSmart(node: Descendant, eventId: string): string {
  if (Text.isText(node)) {
    return serializeText(node);  // 已有实现
  }
  
  switch (node.type) {
    case 'table':
      return serializeTable(node);  // Markdown 表格
    
    case 'image':
      return serializeImage(node, eventId);  // Web Viewer 链接
    
    case 'video':
      return serializeVideo(node, eventId);
    
    case 'audio':
      return serializeAudio(node, eventId);
    
    case 'attachment':
      return serializeAttachment(node, eventId);
    
    case 'tag':
      // mention-only 标签转为纯文本
      if (node.mentionOnly) {
        return `#${node.tagEmoji} ${node.tagName}`;
      }
      return serializeTag(node);  // 正式标签保留样式
    
    case 'context-marker':
      // v2.0 功能：隐藏在 Outlook，保留元数据
      return `<!-- ContextMarker: ${JSON.stringify(node.timeSpec)} -->`;
    
    default:
      return serializeStandardNode(node);  // 标准 HTML 元素
  }
}
```

#### 5.4.5 逆向序列化：Outlook HTML → Slate JSON

```typescript
// serializers/outlookHtmlToSlate.ts

/**
 * 从 Outlook HTML 恢复 Slate JSON
 * 
 * 注意：这是有损转换，无法完全恢复原始 Slate 结构
 * - Markdown 表格 → 识别并转回 table 节点
 * - Web Viewer 链接 → 还原为 image/video/attachment 占位符
 * - 隐藏的 ContextMarker → 从 HTML 注释中恢复
 */
export function outlookHtmlToSlate(html: string): Descendant[] {
  const doc = parseHTML(html);
  
  // 1. 移除底部提示
  removeFooter(doc);
  
  // 2. 解析节点
  return Array.from(doc.body.childNodes).map(node => 
    deserializeNode(node)
  ).filter(Boolean) as Descendant[];
}

function deserializeNode(domNode: Node): Descendant | null {
  // 文本节点
  if (domNode.nodeType === Node.TEXT_NODE) {
    return { text: domNode.textContent || '' };
  }
  
  // 元素节点
  if (domNode.nodeType === Node.ELEMENT_NODE) {
    const element = domNode as HTMLElement;
    
    // Markdown 表格识别
    if (element.tagName === 'PRE' && element.textContent?.includes('|')) {
      return parseMarkdownTable(element.textContent);
    }
    
    // Web Viewer 链接识别
    if (element.tagName === 'A' && element.href.includes('/timelog#')) {
      const hash = new URL(element.href).hash;
      if (hash.startsWith('#image-')) {
        return createImagePlaceholder(element.textContent || '');
      }
      if (hash.startsWith('#video-')) {
        return createVideoPlaceholder(element.textContent || '');
      }
    }
    
    // HTML 注释中的 ContextMarker
    if (domNode.nodeType === Node.COMMENT_NODE) {
      const match = domNode.textContent?.match(/ContextMarker: ({.*})/);
      if (match) {
        return restoreContextMarker(JSON.parse(match[1]));
      }
    }
    
    // 标准 HTML 元素
    return deserializeStandardElement(element);
  }
  
  return null;
}
```

---

### 5.5 Git 风格 Diff UI：字段级冲突解决界面

> **设计目标**: 提供类似 Git 的 three-way merge UI，让用户直观理解冲突并快速选择保留版本

#### 5.5.1 冲突解决组件设计

```typescript
// components/ConflictResolverDialog.tsx

interface ConflictResolverDialogProps {
  event: Event;
  conflictResult: FieldLevelConflictResult;
  onResolve: (resolution: ConflictResolution) => Promise<void>;
  onCancel: () => void;
}

/**
 * 冲突解决对话框
 * 
 * 布局：
 * ┌───────────────────────────────────────────┐
 * │ 🔀 解决冲突: 会议记录                      │
 * ├───────────────────────────────────────────┤
 * │ 共 3 个字段发生冲突，2 个字段已自动合并    │
 * ├───────────────────────────────────────────┤
 * │ ⚠️ title (标题)                            │
 * │ ┌─────────────┬─────────────┬──────────┐ │
 * │ │ 本地版本    │ 基准版本    │ 远程版本 │ │
 * │ ├─────────────┼─────────────┼──────────┤ │
 * │ │ ✓ 会议记录A │ 会议记录    │ 会议记录B│ │
 * │ └─────────────┴─────────────┴──────────┘ │
 * │ [ Keep Local ] [ Keep Remote ] [ Edit... ]│
 * ├───────────────────────────────────────────┤
 * │ ⚠️ timelog.description (日志内容)          │
 * │ ┌─────────────┬─────────────┬──────────┐ │
 * │ │ ✓ 本地修改  │ 原始内容    │ 远程修改 │ │
 * │ │ 添加了图片  │ 空白        │ 添加了表格│ │
 * │ └─────────────┴─────────────┴──────────┘ │
 * │ [ Keep Local ] [ Keep Remote ] [ Merge...]│
 * ├───────────────────────────────────────────┤
 * │ ✅ 自动合并的字段（2个）                   │
 * │ • tags: 新增 #项目A (远程)                 │
 * │ • timelog.timeSpent: 2h → 3h (本地)       │
 * │ [ 撤销自动合并 ]                           │
 * └───────────────────────────────────────────┘
 * │ [ 取消 ] [ 应用解决方案 ]                  │
 * └───────────────────────────────────────────┘
 */
export function ConflictResolverDialog({
  event,
  conflictResult,
  onResolve,
  onCancel
}: ConflictResolverDialogProps) {
  const [resolutions, setResolutions] = useState<Map<string, FieldResolution>>(
    new Map()
  );
  
  // 初始化：自动解决的字段默认使用自动方案
  useEffect(() => {
    const autoResolved = new Map<string, FieldResolution>();
    conflictResult.conflictedFields
      .filter(c => c.resolution === 'auto-local' || c.resolution === 'auto-remote')
      .forEach(conflict => {
        autoResolved.set(conflict.field, {
          strategy: conflict.resolution === 'auto-local' ? 'keep-local' : 'keep-remote',
          value: conflict.resolution === 'auto-local' ? conflict.localValue : conflict.remoteValue
        });
      });
    setResolutions(autoResolved);
  }, [conflictResult]);
  
  return (
    <Dialog open onClose={onCancel} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <MergeIcon color="warning" />
          <span>解决冲突: {event.title}</span>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {/* 冲突摘要 */}
        <Alert severity="info" sx={{ mb: 2 }}>
          共 {conflictResult.conflictedFields.length} 个字段发生冲突，
          {conflictResult.conflictedFields.filter(c => c.resolution.startsWith('auto')).length} 个字段已自动合并
        </Alert>
        
        {/* 手动解决的冲突 */}
        {conflictResult.conflictedFields
          .filter(c => c.resolution === 'manual-required')
          .map(conflict => (
            <FieldConflictPanel
              key={conflict.field}
              conflict={conflict}
              resolution={resolutions.get(conflict.field)}
              onResolutionChange={(resolution) => {
                setResolutions(new Map(resolutions).set(conflict.field, resolution));
              }}
            />
          ))}
        
        {/* 自动合并的字段 */}
        <AutoMergedFieldsPanel
          conflicts={conflictResult.conflictedFields.filter(c => 
            c.resolution.startsWith('auto')
          )}
          resolutions={resolutions}
          onUndoAutoMerge={(field) => {
            const newResolutions = new Map(resolutions);
            newResolutions.delete(field);
            setResolutions(newResolutions);
          }}
        />
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onCancel}>取消</Button>
        <Button
          variant="contained"
          onClick={() => onResolve(resolutions)}
          disabled={!allConflictsResolved(conflictResult, resolutions)}
        >
          应用解决方案
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

#### 5.5.2 字段冲突面板：三栏对比

```typescript
// components/FieldConflictPanel.tsx

interface FieldConflictPanelProps {
  conflict: FieldConflict;
  resolution?: FieldResolution;
  onResolutionChange: (resolution: FieldResolution) => void;
}

/**
 * 单个字段的冲突解决面板
 * 
 * 样式：
 * ┌──────────────────────────────────────────┐
 * │ ⚠️ title (标题)                           │
 * ├──────────────────────────────────────────┤
 * │ ┌──────────┬──────────┬──────────┐       │
 * │ │ 本地版本 │ 基准版本 │ 远程版本 │       │
 * │ ├──────────┼──────────┼──────────┤       │
 * │ │ ✓ 新标题 │ 旧标题   │ 另一标题 │       │
 * │ │ (本地)   │ (上次同步)│ (远程)   │       │
 * │ └──────────┴──────────┴──────────┘       │
 * │ [ Keep Local ] [ Keep Remote ] [ Edit... ]│
 * └──────────────────────────────────────────┘
 */
export function FieldConflictPanel({
  conflict,
  resolution,
  onResolutionChange
}: FieldConflictPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [customValue, setCustomValue] = useState<any>(null);
  
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      {/* 字段标题 */}
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <WarningIcon color="warning" fontSize="small" />
        <Typography variant="subtitle2">
          {conflict.field} ({getFieldLabel(conflict.field)})
        </Typography>
      </Box>
      
      {/* 三栏对比 */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* 本地版本 */}
        <Grid item xs={4}>
          <VersionCard
            label="本地版本"
            value={conflict.localValue}
            timestamp={conflict.localTimestamp}
            isSelected={resolution?.strategy === 'keep-local'}
            fieldType={conflict.field}
          />
        </Grid>
        
        {/* 基准版本 (上次同步) */}
        <Grid item xs={4}>
          <VersionCard
            label="基准版本"
            value={conflict.baseValue}
            timestamp={conflict.baseTimestamp}
            isBaseline
            fieldType={conflict.field}
          />
        </Grid>
        
        {/* 远程版本 */}
        <Grid item xs={4}>
          <VersionCard
            label="远程版本"
            value={conflict.remoteValue}
            timestamp={conflict.remoteTimestamp}
            isSelected={resolution?.strategy === 'keep-remote'}
            fieldType={conflict.field}
          />
        </Grid>
      </Grid>
      
      {/* 操作按钮 */}
      <Box display="flex" gap={1}>
        <Button
          variant={resolution?.strategy === 'keep-local' ? 'contained' : 'outlined'}
          startIcon={<CheckIcon />}
          onClick={() => onResolutionChange({
            strategy: 'keep-local',
            value: conflict.localValue
          })}
        >
          保留本地
        </Button>
        
        <Button
          variant={resolution?.strategy === 'keep-remote' ? 'contained' : 'outlined'}
          startIcon={<CheckIcon />}
          onClick={() => onResolutionChange({
            strategy: 'keep-remote',
            value: conflict.remoteValue
          })}
        >
          保留远程
        </Button>
        
        {/* 特殊字段：提供合并选项 */}
        {canMergeField(conflict.field) && (
          <Button
            variant={resolution?.strategy === 'merge' ? 'contained' : 'outlined'}
            startIcon={<MergeIcon />}
            onClick={() => setIsEditing(true)}
          >
            手动合并...
          </Button>
        )}
      </Box>
      
      {/* 手动编辑对话框 */}
      {isEditing && (
        <FieldMergeDialog
          conflict={conflict}
          onMerge={(mergedValue) => {
            onResolutionChange({
              strategy: 'merge',
              value: mergedValue
            });
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}
    </Paper>
  );
}
```

#### 5.5.3 版本卡片：Diff 高亮

```typescript
// components/VersionCard.tsx

interface VersionCardProps {
  label: string;
  value: any;
  timestamp?: string;
  isSelected?: boolean;
  isBaseline?: boolean;
  fieldType: string;
}

/**
 * 单个版本的展示卡片
 * 
 * 样式：
 * ┌─────────────────┐
 * │ ✓ 本地版本      │
 * ├─────────────────┤
 * │ 会议记录 v2     │ ← Diff 高亮
 * │ +添加的内容     │ ← 绿色
 * │ -删除的内容     │ ← 红色
 * ├─────────────────┤
 * │ 2h ago          │
 * └─────────────────┘
 */
export function VersionCard({
  label,
  value,
  timestamp,
  isSelected,
  isBaseline,
  fieldType
}: VersionCardProps) {
  const displayValue = formatFieldValue(value, fieldType);
  
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isSelected ? 'primary.main' : isBaseline ? 'grey.400' : 'grey.300',
        borderWidth: isSelected ? 2 : 1,
        bgcolor: isSelected ? 'primary.50' : isBaseline ? 'grey.50' : 'background.paper'
      }}
    >
      <CardContent>
        {/* 标签 */}
        <Box display="flex" alignItems="center" gap={0.5} mb={1}>
          {isSelected && <CheckIcon fontSize="small" color="primary" />}
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
        </Box>
        
        {/* 值 (带 Diff 高亮) */}
        <Box sx={{ mb: 1 }}>
          {renderFieldValueWithDiff(displayValue, fieldType)}
        </Box>
        
        {/* 时间戳 */}
        {timestamp && (
          <Typography variant="caption" color="text.secondary">
            {formatRelativeTime(timestamp)}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Diff 高亮渲染
 */
function renderFieldValueWithDiff(value: string, fieldType: string) {
  if (fieldType === 'timelog.description') {
    // Slate 内容：渲染为 HTML 预览
    return <SlatePreview content={value} maxHeight={200} />;
  }
  
  if (fieldType === 'tags') {
    // 标签数组：显示标签列表
    const tags = JSON.parse(value) as Tag[];
    return (
      <Box display="flex" gap={0.5} flexWrap="wrap">
        {tags.map(tag => (
          <Chip
            key={tag.id}
            label={`${tag.emoji} ${tag.name}`}
            size="small"
          />
        ))}
      </Box>
    );
  }
  
  // 默认：纯文本
  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {value}
    </Typography>
  );
}
```

#### 5.5.4 自动合并字段面板

```typescript
// components/AutoMergedFieldsPanel.tsx

/**
 * 显示已自动合并的字段
 * 
 * 样式：
 * ┌─────────────────────────────────────┐
 * │ ✅ 自动合并的字段（2个）             │
 * ├─────────────────────────────────────┤
 * │ • tags: 新增 #项目A (远程)           │
 * │   [ 撤销 ]                           │
 * ├─────────────────────────────────────┤
 * │ • timelog.timeSpent: 2h → 3h (本地) │
 * │   [ 撤销 ]                           │
 * └─────────────────────────────────────┘
 */
export function AutoMergedFieldsPanel({
  conflicts,
  resolutions,
  onUndoAutoMerge
}: {
  conflicts: FieldConflict[];
  resolutions: Map<string, FieldResolution>;
  onUndoAutoMerge: (field: string) => void;
}) {
  if (conflicts.length === 0) return null;
  
  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'success.50' }}>
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <CheckCircleIcon color="success" fontSize="small" />
        <Typography variant="subtitle2">
          自动合并的字段（{conflicts.length}个）
        </Typography>
      </Box>
      
      <List dense>
        {conflicts.map(conflict => {
          const resolution = resolutions.get(conflict.field);
          const changeDesc = getAutoMergeDescription(conflict);
          
          return (
            <ListItem key={conflict.field}>
              <ListItemText
                primary={`${conflict.field}: ${changeDesc}`}
                secondary={
                  resolution?.strategy === 'keep-local' ? '(保留本地)' : '(保留远程)'
                }
              />
              <ListItemSecondaryAction>
                <Button
                  size="small"
                  onClick={() => onUndoAutoMerge(conflict.field)}
                >
                  撤销
                </Button>
              </ListItemSecondaryAction>
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
}

function getAutoMergeDescription(conflict: FieldConflict): string {
  const { field, localValue, remoteValue, baseValue } = conflict;
  
  if (field === 'tags') {
    const added = JSON.parse(localValue || remoteValue).filter(
      (tag: Tag) => !JSON.parse(baseValue).some((t: Tag) => t.id === tag.id)
    );
    return `新增 ${added.map((t: Tag) => `#${t.emoji} ${t.name}`).join(', ')}`;
  }
  
  if (field === 'timelog.timeSpent') {
    return `${baseValue} → ${localValue || remoteValue}`;
  }
  
  return `${baseValue} → ${localValue || remoteValue}`;
}
```

#### 5.5.5 手动合并对话框：针对 Description

```typescript
// components/FieldMergeDialog.tsx

/**
 * Description 字段的手动合并对话框
 * 
 * 功能：
 * 1. 并排显示本地和远程的 Slate 内容
 * 2. 提供"插入远程段落"按钮
 * 3. 实时预览合并结果
 */
export function FieldMergeDialog({
  conflict,
  onMerge,
  onCancel
}: {
  conflict: FieldConflict;
  onMerge: (mergedValue: any) => void;
  onCancel: () => void;
}) {
  const [mergedContent, setMergedContent] = useState<Descendant[]>(
    JSON.parse(conflict.localValue)
  );
  
  const localContent = JSON.parse(conflict.localValue) as Descendant[];
  const remoteContent = JSON.parse(conflict.remoteValue) as Descendant[];
  
  return (
    <Dialog open onClose={onCancel} maxWidth="xl" fullWidth>
      <DialogTitle>手动合并: {conflict.field}</DialogTitle>
      
      <DialogContent>
        <Grid container spacing={2}>
          {/* 本地版本 */}
          <Grid item xs={4}>
            <Typography variant="subtitle2" gutterBottom>本地版本</Typography>
            <SlateEditor value={localContent} readOnly />
          </Grid>
          
          {/* 远程版本 */}
          <Grid item xs={4}>
            <Typography variant="subtitle2" gutterBottom>远程版本</Typography>
            <SlateEditor value={remoteContent} readOnly />
            <Button
              size="small"
              onClick={() => {
                // 插入远程段落到合并结果
                setMergedContent([...mergedContent, ...remoteContent]);
              }}
            >
              插入全部段落 →
            </Button>
          </Grid>
          
          {/* 合并结果 */}
          <Grid item xs={4}>
            <Typography variant="subtitle2" gutterBottom>合并结果</Typography>
            <SlateEditor
              value={mergedContent}
              onChange={setMergedContent}
            />
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onCancel}>取消</Button>
        <Button
          variant="contained"
          onClick={() => onMerge(JSON.stringify(mergedContent))}
        >
          使用此合并结果
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

### 5.6 增量同步优化

```typescript
// sync/incrementalSync.ts

export class IncrementalSyncManager {
  private lastSyncTimestamp: Map<string, string> = new Map();  // 存储本地时间字符串
  
  // 只同步变化的事件
  async syncChangedEvents() {
    const lastSync = this.lastSyncTimestamp.get('events') || formatTimeForStorage(new Date(0));
    
    // 只获取上次同步之后有变化的事件
    const changedEvents = await db.events.find({
      updatedAt: { $gt: lastSync },
    });
    
    console.log(`📊 发现 ${changedEvents.length} 个需要同步的事件`);
    
    const results = [];
    for (const event of changedEvents) {
      try {
        const result = await syncEngine.syncEvent(event.id);
        results.push({ eventId: event.id, ...result });
      } catch (error) {
        console.error(`❌ 同步事件 ${event.id} 失败:`, error);
        results.push({ eventId: event.id, status: 'error', error });
      }
    }
    
    this.lastSyncTimestamp.set('events', formatTimeForStorage(new Date()));
    return results;
  }
  
  // 错误重试机制
  async syncWithRetry(eventId: string, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await syncEngine.syncEvent(eventId);
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        // 指数退避
        const delay = Math.pow(2, i) * 1000;
        console.log(`  ⏳ 重试中... (${i + 1}/${maxRetries})，等待 ${delay}ms`);
        await this.sleep(delay);
      }
    }
  }
  
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3.5 离线支持

```typescript
// sync/offlineQueue.ts

type SyncOperation = {
  eventId: string;
  operation: 'push' | 'pull';
  timestamp: string;  // 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  retryCount: number;
};

export class OfflineQueue {
  private queue: SyncOperation[] = [];
  private readonly QUEUE_STORAGE_KEY = 'remarkable-sync-queue';
  
  constructor() {
    this.loadQueue();
  }
  
  // 离线时将操作加入队列
  async queueSync(eventId: string, operation: 'push' | 'pull') {
    this.queue.push({
      eventId,
      operation,
      timestamp: formatTimeForStorage(new Date()),
      retryCount: 0,
    });
    
    await this.persistQueue();
    console.log(`📝 操作已加入队列: ${operation} ${eventId}`);
  }
  
  // 上线后执行队列中的操作
  async processQueue() {
    if (this.queue.length === 0) {
      return;
    }
    
    console.log(`🔄 开始处理队列，共 ${this.queue.length} 个操作`);
    
    while (this.queue.length > 0) {
      const op = this.queue[0];
      
      try {
        await syncEngine.syncEvent(op.eventId);
        this.queue.shift(); // 成功后移除
      } catch (error) {
        console.error(`❌ 队列操作失败: ${op.eventId}`, error);
        
        op.retryCount++;
        if (op.retryCount >= 3) {
          console.error(`  → 重试次数超限，移除队列`);
          this.queue.shift();
        } else {
          console.log(`  → 稍后重试 (${op.retryCount}/3)`);
          break; // 停止处理，等待下次
        }
      }
      
      await this.persistQueue();
    }
    
    console.log('✅ 队列处理完成');
  }
  
  // 持久化队列
  private async persistQueue() {
    localStorage.setItem(this.QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
  }
  
  // 加载队列
  private loadQueue() {
    const stored = localStorage.getItem(this.QUEUE_STORAGE_KEY);
    if (stored) {
      this.queue = JSON.parse(stored);
    }
  }
}
```

## 4. 双层历史记录系统

> **架构**: 详见顶部"架构决策记录 → 双层历史记录系统"  
> **实施**: Phase 2（EventHistory）+ Phase 3（VersionControl）

### 4.1 系统概述

历史记录系统分为两层，分别服务于不同的业务需求：

**第一层：EventHistoryService（Event 级别）**
- **目的**: 审计日志、变更溯源、数据统计
- **记录内容**: Event 的 CRUD 操作（创建、更新、删除）
- **粒度**: 字段级别（title/tags/startTime 等）
- **存储**: 独立 `event_history` 集合
- **保留策略**: 永久保留（或按策略归档）

**第二层：VersionControlService（TimeLog 内容级别）**
- **目的**: 内容撤销/重做、协作冲突解决
- **记录内容**: Slate 编辑操作（段落增删、标签插入等）
- **粒度**: Slate 节点级别
- **存储**: `Event.eventlog.versions` 数组（嵌入式）
- **保留策略**: 最近 50 个版本

---

## 7. 第一层：EventHistoryService

### 7.1 核心概念

EventHistoryService 记录 Event 的所有变更，提供完整的审计追踪能力。

**功能目标:**

- ✅ 审计日志（谁在什么时候修改了哪个事件）
- ✅ 变更溯源（查看字段的历史变更）
- ✅ 时间段统计（过去 7 天创建/修改了多少事件）
- ✅ 数据恢复（恢复到历史版本）
- ✅ 冲突检测基础（为 Outlook 同步提供 hash 对比）

### 7.2 数据结构

```typescript
// types/eventHistory.ts

/**
 * Event 历史记录条目
 * 每次 Event 发生变更时创建一条记录
 */
type EventHistoryEntry = {
  id: string;                    // 历史记录 ID
  eventId: string;               // 关联的 Event ID
  
  // 操作元数据
  operation: HistoryOperation;
  timestamp: string;             // 变更时间（本地时间字符串 'YYYY-MM-DD HH:mm:ss'）
  userId?: string;               // 操作用户（为多用户准备）
  source: HistorySource;         // 变更来源
  
  // 变更内容
  snapshot: Event;               // 完整的 Event 快照
  changedFields?: string[];      // 变更的字段列表 ['title', 'tags']
  fieldDeltas?: FieldDelta[];    // 字段级差异
  
  // 用于同步的哈希
  contentHash: string;           // Event 内容的 hash
};

type HistoryOperation = 
  | 'create'        // 创建事件
  | 'update'        // 更新事件
  | 'delete'        // 删除事件（软删除）
  | 'restore'       // 恢复已删除事件
  | 'checkin';      // 签到/取消签到操作

type HistorySource =
  | 'local-edit'    // 本地用户编辑
  | 'sync-pull'     // 从 Outlook 同步拉取
  | 'sync-push'     // 推送到 Outlook 前
  | 'import'        // 导入操作
  | 'migration'     // 数据迁移
  | 'system';       // 系统操作

type FieldDelta = {
  field: string;               // 字段名称
  oldValue: any;               // 旧值
  newValue: any;               // 新值
  valueType: 'primitive' | 'object' | 'array';
};

/**
 * 查询过滤器
 */
type EventHistoryQuery = {
  eventId?: string;              // 查询特定事件的历史
  operation?: HistoryOperation;  // 过滤操作类型
  source?: HistorySource;        // 过滤来源
  startDate?: Date;              // 时间范围开始
  endDate?: Date;                // 时间范围结束
  userId?: string;               // 过滤用户
  changedFields?: string[];      // 包含特定字段变更的记录
  limit?: number;                // 限制结果数量
  offset?: number;               // 分页偏移
};
```

### 6.3 EventHistoryService 实现

```typescript
// services/EventHistoryService.ts
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export class EventHistoryService {
  
  /**
   * 记录 Event 变更
   * 在 EventService.createEvent/updateEvent/deleteEvent 中调用
   */
  async recordEventChange(
    eventId: string,
    operation: HistoryOperation,
    snapshot: Event,
    options?: {
      source?: HistorySource;
      userId?: string;
      changedFields?: string[];
      previousSnapshot?: Event;
    }
  ): Promise<EventHistoryEntry> {
    
    // 1. 使用 TimeHub 记录时间戳
    const timestamp = TimeHub.recordTimestamp();  // 🎯 统一时间来源
    
    // 2. 计算内容哈希（用于同步冲突检测）
    const contentHash = this.calculateEventHash(snapshot);
    
    // 3. 计算字段级差异（如果提供了旧快照）
    const fieldDeltas = options?.previousSnapshot
      ? this.calculateFieldDeltas(options.previousSnapshot, snapshot)
      : undefined;
    
    // 4. 自动推断变更字段（如果未提供）
    const changedFields = options?.changedFields || 
      (fieldDeltas ? fieldDeltas.map(d => d.field) : undefined);
    
    // 5. 创建历史记录
    const entry: EventHistoryEntry = {
      id: uuidv4(),
      eventId,
      operation,
      timestamp,  // 🎯 使用 TimeHub 生成的时间戳
      userId: options?.userId,
      source: options?.source || 'local-edit',
      snapshot,
      changedFields,
      fieldDeltas,
      contentHash,
    };
    
    // 6. 存储到数据库（转为本地时间字符串）
    await db.eventHistory.insert({
      ...entry,
      timestamp: TimeHub.formatTimestamp(timestamp),  // 🎯 存储为本地时间字符串
    });
    
    console.log(`📝 [EventHistory] ${operation} event ${eventId}`, {
      fields: changedFields,
      source: entry.source
    });
    
    return entry;
  }
  
  /**
   * 查询事件的历史记录
   */
  async getEventHistory(
    eventId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<EventHistoryEntry[]> {
    return await db.eventHistory.find({
      eventId,
    })
    .sort({ timestamp: -1 })  // 最新的在前
    .limit(options?.limit || 100)
    .skip(options?.offset || 0)
    .toArray();
  }
  
  /**
   * 查询时间段内的变更
   * 用于统计、报表等功能
   */
  async getChangesInPeriod(
    startDate: Date,
    endDate: Date,
    filter?: Partial<EventHistoryQuery>
  ): Promise<EventHistoryEntry[]> {
    const query: any = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };
    
    if (filter?.operation) query.operation = filter.operation;
    if (filter?.source) query.source = filter.source;
    if (filter?.userId) query.userId = filter.userId;
    if (filter?.changedFields) {
      query.changedFields = { $in: filter.changedFields };
    }
    
    return await db.eventHistory.find(query)
      .sort({ timestamp: -1 })
      .limit(filter?.limit || 1000)
      .toArray();
  }
  
  /**
   * 恢复到特定历史版本
   */
  async restoreEventVersion(
    eventId: string,
    historyId: string
  ): Promise<Event> {
    // 1. 获取目标历史记录
    const history = await db.eventHistory.findOne({ id: historyId });
    if (!history || history.eventId !== eventId) {
      throw new Error('历史记录不存在');
    }
    
    // 2. 恢复快照
    const restoredEvent = { ...history.snapshot };
    
    // 3. 更新当前 Event
    await EventService.updateEvent(eventId, restoredEvent);
    
    // 4. 记录恢复操作
    await this.recordEventChange(
      eventId,
      'restore',
      restoredEvent,
      { source: 'system' }
    );
    
    console.log(`🔄 [EventHistory] 恢复事件 ${eventId} 到版本 ${historyId}`);
    
    return restoredEvent;
  }
  
  /**
   * 🆕 记录签到操作
   * 用于记录事件的签到和取消签到
   */
  logCheckin(eventId: string, eventTitle: string, metadata?: Record<string, any>): EventChangeLog {
    const log: EventChangeLog = {
      id: this.generateLogId(),
      eventId,
      operation: 'checkin',
      timestamp: formatTimeForStorage(new Date()),
      source: 'user',
      metadata
    };

    this.saveLog(log);
    console.log(`✅ [EventHistory] 记录签到: ${eventTitle}`, metadata);
    return log;
  }

  /**
   * 🆕 查询签到历史
   * 获取指定时间范围内的签到记录
   */
  queryCheckinHistory(options: {
    eventId?: string;
    startTime?: string;
    endTime?: string;
  }): EventChangeLog[] {
    let logs = this.getAllLogs().filter(log => log.operation === 'checkin');

    // 按事件ID过滤
    if (options.eventId) {
      logs = logs.filter(log => log.eventId === options.eventId);
    }

    // 按时间范围过滤
    if (options.startTime || options.endTime) {
      logs = logs.filter(log => {
        const logTime = log.timestamp;
        if (options.startTime && logTime < options.startTime) return false;
        if (options.endTime && logTime > options.endTime) return false;
        return true;
      });
    }

    return logs.sort((a, b) => parseLocalTimeString(b.timestamp).getTime() - parseLocalTimeString(a.timestamp).getTime());
  }
  
  /**
   * 计算 Event 内容哈希
   * 用于同步冲突检测（排除不影响内容的字段）
   */
  private calculateEventHash(event: Event): string {
    // 排除元数据字段，只计算内容字段
    const contentFields = {
      title: event.title,
      eventlog: Event.eventlog,
      tags: event.tags,
      startTime: event.startTime,
      endTime: event.endTime,
      // 不包括 updatedAt、syncState 等元数据
    };
    
    const content = JSON.stringify(contentFields, Object.keys(contentFields).sort());
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  
  /**
   * 计算字段级差异
   */
  private calculateFieldDeltas(
    oldEvent: Event,
    newEvent: Event
  ): FieldDelta[] {
    const deltas: FieldDelta[] = [];
    
    // 比较所有字段
    const allKeys = new Set([
      ...Object.keys(oldEvent),
      ...Object.keys(newEvent),
    ]);
    
    for (const key of allKeys) {
      const oldValue = (oldEvent as any)[key];
      const newValue = (newEvent as any)[key];
      
      // 跳过元数据字段
      if (['id', 'createdAt', 'updatedAt'].includes(key)) {
        continue;
      }
      
      // 检测变更
      if (!this.isEqual(oldValue, newValue)) {
        deltas.push({
          field: key,
          oldValue,
          newValue,
          valueType: this.getValueType(newValue),
        });
      }
    }
    
    return deltas;
  }
  
  /**
   * 深度相等比较
   */
  private isEqual(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  
  /**
   * 判断值类型
   */
  private getValueType(value: any): 'primitive' | 'object' | 'array' {
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object' && value !== null) return 'object';
    return 'primitive';
  }
  
  /**
   * 获取统计信息
   */
  async getStatistics(startDate: Date, endDate: Date): Promise<{
    totalChanges: number;
    createdEvents: number;
    updatedEvents: number;
    deletedEvents: number;
    bySource: Record<HistorySource, number>;
    byDay: { date: string; count: number }[];
  }> {
    const changes = await this.getChangesInPeriod(startDate, endDate);
    
    const stats = {
      totalChanges: changes.length,
      createdEvents: changes.filter(c => c.operation === 'create').length,
      updatedEvents: changes.filter(c => c.operation === 'update').length,
      deletedEvents: changes.filter(c => c.operation === 'delete').length,
      bySource: {} as Record<HistorySource, number>,
      byDay: [] as { date: string; count: number }[],
    };
    
    // 按来源统计
    for (const change of changes) {
      stats.bySource[change.source] = (stats.bySource[change.source] || 0) + 1;
    }
    
    // 按天统计
    const dayMap = new Map<string, number>();
    for (const change of changes) {
      const day = change.timestamp.slice(0, 10);  // 'YYYY-MM-DD'
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    stats.byDay = Array.from(dayMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));
    
    return stats;
  }
}

// 单例导出
export const eventHistoryService = new EventHistoryService();
```

### 6.4 集成到 EventService

在现有的 EventService 中集成 EventHistoryService：

```typescript
// services/EventService.ts (修改部分)
import { eventHistoryService } from './EventHistoryService';

class EventService {
  
  async createEvent(event: Partial<Event>): Promise<Event> {
    // 1. 创建事件（现有逻辑）
    const newEvent = {
      id: uuidv4(),
      ...event,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Event;
    
    await db.events.insert(newEvent);
    
    // 2. 🆕 记录历史
    await eventHistoryService.recordEventChange(
      newEvent.id,
      'create',
      newEvent,
      { source: 'local-edit' }
    );
    
    return newEvent;
  }
  
  async updateEvent(
    eventId: string,
    updates: Partial<Event>
  ): Promise<Event> {
    // 1. 获取旧版本
    const oldEvent = await db.events.findOne({ id: eventId });
    if (!oldEvent) throw new Error('Event not found');
    
    // 2. 应用更新（现有逻辑）
    const updatedEvent = {
      ...oldEvent,
      ...updates,
      updatedAt: new Date(),
    };
    
    await db.events.update({ id: eventId }, updatedEvent);
    
    // 3. 🆕 计算变更字段
    const changedFields = Object.keys(updates).filter(
      key => !['updatedAt', 'id'].includes(key)
    );
    
    // 4. 🆕 记录历史
    await eventHistoryService.recordEventChange(
      eventId,
      'update',
      updatedEvent,
      {
        source: 'local-edit',
        changedFields,
        previousSnapshot: oldEvent,
      }
    );
    
    return updatedEvent;
  }
  
  async deleteEvent(eventId: string): Promise<void> {
    // 1. 获取事件快照
    const event = await db.events.findOne({ id: eventId });
    if (!event) throw new Error('Event not found');
    
    // 2. 软删除（添加 deletedAt 标记）
    const deletedEvent = {
      ...event,
      deletedAt: new Date(),
      updatedAt: new Date(),
    };
    
    await db.events.update({ id: eventId }, deletedEvent);
    
    // 3. 🆕 记录删除历史
    await eventHistoryService.recordEventChange(
      eventId,
      'delete',
      deletedEvent,
      { source: 'local-edit' }
    );
  }
  
  // 🆕 签到功能方法
  
  /**
   * 事件签到 - 记录签到时间戳
   */
  static checkIn(eventId: string): { success: boolean; error?: string } {
    try {
      const event = this.getEventById(eventId);
      if (!event) {
        return { success: false, error: 'Event not found' };
      }

      const timestamp = formatTimeForStorage(new Date());

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
   * 取消事件签到 - 记录取消签到时间戳
   */
  static uncheck(eventId: string): { success: boolean; error?: string } {
    try {
      const event = this.getEventById(eventId);
      if (!event) {
        return { success: false, error: 'Event not found' };
      }

      const timestamp = formatTimeForStorage(new Date());

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
   * 获取事件的签到状态
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
}
```

### 6.5 数据库 Schema

```sql
-- MongoDB Collection: event_history
{
  _id: ObjectId,
  id: String,              // UUID
  eventId: String,         // 关联的 Event ID
  operation: String,       // 'create' | 'update' | 'delete' | 'restore'
  timestamp: string,  // 'YYYY-MM-DD HH:mm:ss'
  userId: String,
  source: String,          // 'local-edit' | 'sync-pull' | 'sync-push' | ...
  snapshot: Object,        // 完整的 Event 快照
  changedFields: [String],
  fieldDeltas: [{
    field: String,
    oldValue: Mixed,
    newValue: Mixed,
    valueType: String,
  }],
  contentHash: String,
}

-- 索引
db.event_history.createIndex({ eventId: 1, timestamp: -1 });
db.event_history.createIndex({ timestamp: -1 });
db.event_history.createIndex({ operation: 1, timestamp: -1 });
db.event_history.createIndex({ source: 1, timestamp: -1 });
db.event_history.createIndex({ contentHash: 1 });
```

### 6.6 快照查看器集成：DailySnapshotViewer

> **现有实现**: `src/components/DailySnapshotViewer.tsx`  
> **状态**: 🟡 部分实现（使用简化数据结构）  
> **迁移需求**: 需要适配 TimeLog 嵌入式架构

#### 6.6.1 现有功能概述

`DailySnapshotViewer` 组件用于显示和追踪用户每天的任务状态和变化，当前实现：

**核心功能**:
- 📅 显示指定日期的 todo-list 状态
- 📊 追踪任务变化（新增/完成/搁置/删除）
- 🔄 支持"只显示变化"模式
- 📝 任务卡片展示（标题/描述/标签/时间）

**数据依赖**:
```typescript
interface DailySnapshot {
  date: string;
  items: Event[];
  changes: {
    added: Event[];
    checked: Event[];
    dropped: Event[];
    deleted: string[];
  };
}
```

**当前实现问题**:
1. ❌ 使用简化的 `Event.content` 字段（应为 `Event.eventlog.description`）
2. ❌ 无法展示 TimeLog 的版本历史
3. ❌ 缺少 Slate 富文本渲染
4. ❌ 未集成 EventHistoryService

#### 6.6.2 迁移到 TimeLog 架构的改造方案

**Phase 1: 数据结构适配**

```typescript
// services/snapshotService.ts (需要修改)

interface DailySnapshotV2 {
  date: string;
  items: Event[];  // 包含完整的 timelog 字段
  changes: {
    added: Event[];
    checked: Event[];
    dropped: Event[];
    deleted: string[];
    timelogUpdated: Array<{  // 🆕 新增：TimeLog 内容变化
      eventId: string;
      title: string;
      changedFields: string[];
      versionCount: number;
    }>;
  };
}

class SnapshotService {
  /**
   * 获取每日快照（集成 EventHistoryService）
   */
  async getDailySnapshotV2(date: string): Promise<DailySnapshotV2> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    // 1. 获取当天的所有 Event 历史记录
    const historyEntries = await EventHistoryService.getChangesInPeriod(
      startOfDay,
      endOfDay
    );
    
    // 2. 分析变化类型
    const added: Event[] = [];
    const checked: Event[] = [];
    const dropped: Event[] = [];
    const deleted: string[] = [];
    const timelogUpdated: Array<any> = [];
    
    for (const entry of historyEntries) {
      if (entry.operation === 'create') {
        added.push(entry.snapshot);
      } else if (entry.operation === 'update') {
        // 检查是否是 TimeLog 内容更新
        if (entry.changedFields.some(f => f.startsWith('timelog'))) {
          timelogUpdated.push({
            eventId: entry.eventId,
            title: entry.snapshot.title,
            changedFields: entry.changedFields,
            versionCount: entry.snapshot.eventlog?.versions?.length || 0,
          });
        }
        // 检查是否标记为完成
        if (entry.changedFields.includes('isCompleted') && entry.snapshot.isCompleted) {
          checked.push(entry.snapshot);
        }
      } else if (entry.operation === 'delete') {
        deleted.push(entry.eventId);
      }
    }
    
    // 3. 获取当天结束时的所有 Event 状态
    const currentItems = await EventService.getEventsByDate(date);
    
    return {
      date,
      items: currentItems,
      changes: { added, checked, dropped, deleted, timelogUpdated },
    };
  }
}
```

**Phase 2: UI 组件升级**

```typescript
// components/DailySnapshotViewer.tsx (需要修改)

import { SlatePreview } from './PlanSlateEditor/SlatePreview';

const TaskCard: React.FC<TaskCardProps> = ({ item, highlight }) => {
  // 🆕 渲染 TimeLog 富文本内容
  const renderDescription = () => {
    if (!item.eventlog?.content) {
      return null;
    }
    
    // 使用 Slate 预览组件（只读模式）
    return (
      <div className="task-timelog">
        <SlatePreview 
          content={item.eventlog.slateJson} 
          maxHeight={200}
          showTimestamps={false}  // 快照视图不显示时间戳
        />
      </div>
    );
  };
  
  return (
    <div className={`task-card ${highlight || ''}`}>
      {/* ... 标题和状态 ... */}
      
      {/* 🆕 TimeLog 内容展示 */}
      {renderDescription()}
      
      {/* 🆕 版本历史指示器 */}
      {item.eventlog?.versions && item.eventlog.versions.length > 1 && (
        <div className="version-indicator">
          📝 {item.eventlog.versions.length} 个版本
        </div>
      )}
      
      {/* ... 标签和时间 ... */}
    </div>
  );
};

// 🆕 新增：TimeLog 更新列表
{snapshot.changes.timelogUpdated.length > 0 && (
  <section className="changes-section timelog-updated">
    <h4>📝 内容更新 ({snapshot.changes.timelogUpdated.length})</h4>
    <div className="items-list">
      {snapshot.changes.timelogUpdated.map((item) => (
        <div key={item.eventId} className="timelog-change-item">
          <span className="title">{item.title}</span>
          <span className="changed-fields">
            {item.changedFields.join(', ')}
          </span>
          <span className="version-count">
            {item.versionCount} 个版本
          </span>
        </div>
      ))}
    </div>
  </section>
)}
```

**Phase 3: 性能优化**

```typescript
// 1. 投影查询（避免加载完整 timelog.versions）
async getEventsByDate(date: string): Promise<Event[]> {
  return db.events.find(
    { startTime: { $gte: startOfDay, $lt: endOfDay } },
    {
      projection: {
        'timelog.versions': 0,  // 排除版本历史（减少数据量）
      }
    }
  );
}

// 2. 懒加载版本详情
const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

const loadVersionDetails = async (eventId: string) => {
  const event = await EventService.getEventById(eventId);
  setExpandedEventId(eventId);
  // 显示版本历史面板
};
```

#### 6.6.3 迁移清单

**代码修改**:
- [ ] `services/snapshotService.ts`: 集成 EventHistoryService
- [ ] `components/DailySnapshotViewer.tsx`: 
  - [ ] 替换 `item.content` → `item.eventlog.description`
  - [ ] 添加 `SlatePreview` 组件渲染
  - [ ] 添加版本历史指示器
  - [ ] 添加 TimeLog 更新列表
- [ ] `components/DailySnapshotViewer.css`: 
  - [ ] 添加 `.task-timelog` 样式
  - [ ] 添加 `.version-indicator` 样式
  - [ ] 添加 `.eventlog-updated` 样式

**测试场景**:
1. 查看历史日期的快照（恢复 Event 状态）
2. 查看当天的快照（显示实时数据）
3. 查看包含 TimeLog 编辑的日期（展示富文本内容）
4. 点击版本指示器查看完整版本历史

**依赖关系**:
- 依赖 EventHistoryService 实现（Section 6）
- 依赖 SlatePreview 组件（假设已实现）
- 依赖 Event.eventlog 字段迁移（Conflict #1 解决方案）

---

## 7. 第二层：VersionControlService

### 7.1 核心概念

---

## 7. 第二层：VersionControlService

### 7.1 核心概念

VersionControlService 记录 TimeLog 内容的细粒度编辑历史，支持撤销/重做和版本恢复。

用户每次间隔 **5 分钟以上** 的输入都会记录一次 timestamp（版本快照）。

**功能目标:**

- ✅ 内容版本追踪（像 Notion/Google Docs）
- ✅ 撤销/重做增强（可回退到任意时间点）
- ✅ 协作冲突解决（为未来多用户功能做准备）
- ✅ 自动保存机制（减少数据丢失风险）

**与 EventHistoryService 的区别:**

| 维度 | EventHistoryService | VersionControlService |
|------|-------------------|---------------------|
| **记录对象** | 整个 Event | Event.eventlog 内容 |
| **触发时机** | 每次 CRUD 操作 | 每 5 分钟或重大编辑 |
| **存储位置** | event_history 集合 | Event.eventlog.versions 数组 |
| **典型用途** | "谁在 11 月 10 日修改了这个事件？" | "恢复到 10 分钟前的编辑内容" |

### 7.2 时间戳管理：统一通过 TimeHub

> **架构决策（2025-11-13）**: TimeLog 版本的时间戳由 TimeHub 统一管理，避免直接使用 `new Date()`

#### 7.2.1 TimeHub 扩展：系统时间戳管理

TimeHub 的职责从"管理 Event 时间"扩展到"管理所有应用内时间状态"：

```typescript
// services/TimeHub.ts

/**
 * TimeHub: 应用内统一的时间管理服务
 * 
 * 两类时间管理：
 * 1. 事件时间 (Event Time): 用户设定的"事件发生时间"
 *    - 使用 TimeSpec 结构
 *    - 支持模糊时间、时区策略
 *    - 方法: setEventTime(), getEventTime()
 * 
 * 2. 系统时间戳 (System Timestamp): 自动记录的"操作时间"
 *    - 使用 Date 对象（内部）+ 本地时间字符串（存储）
 *    - 精确到秒，本地时间存储
 *    - 方法: recordTimestamp(), formatTimestamp(), parseTimestamp()
 *    - 用途: 版本历史、事件历史、日志等
 */
class TimeHub {
  // ==================== 现有方法：管理 Event 时间 ====================
  
  async setEventTime(eventId: string, input: TimeInput): Promise<void> {
    const timeSpec: TimeSpec = this.parseTimeInput(input);
    await EventService.updateEvent(eventId, { 
      timeSpec,
      // 同步更新派生字段
      startTime: formatTimeForStorage(timeSpec.resolved.start),
      endTime: formatTimeForStorage(timeSpec.resolved.end),
    });
  }
  
  async getEventTime(eventId: string): Promise<TimeSpec> {
    const event = await EventService.getEventById(eventId);
    return event.timeSpec;
  }
  
  // ==================== 🆕 新增方法：管理系统时间戳 ====================
  
  /**
   * 记录系统时间戳（用于版本历史、事件历史等）
   * 
   * 统一的时间戳生成逻辑：
   * 1. 使用系统时间（未来可支持 NTP 校时）
   * 2. 离线时使用本地时间，同步后可选修正
   * 3. 保证应用内所有时间戳的一致性
   * 
   * @returns 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
   */
  recordTimestamp(): string {
    // 当前实现：直接使用系统时间
    return formatTimeForStorage(new Date());
    
    // 未来可扩展：
    // - 添加 NTP 校时偏移量
    // - 添加离线时间修正逻辑
    // - 添加时间旅行调试模式（测试用）
  }
  
  /**
   * 格式化系统时间戳为本地时间字符串（用于数据库存储）
   * 
   * @param date - Date 对象
   * @returns 本地时间字符串 (e.g., "2025-11-13 10:30:00")
   */
  formatTimestamp(date: Date): string {
    return formatTimeForStorage(date);
  }
  
  /**
   * 解析本地时间字符串为 Date 对象
   * 
   * @param timeString - 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
   * @returns Date 对象（用于 UI 显示）
   */
  parseTimestamp(timeString: string): Date {
    return parseLocalTimeString(timeString);
  }
  
  /**
   * 格式化时间戳为用户友好的相对时间
   * 
   * @param date - Date 对象或本地时间字符串
   * @returns 相对时间字符串 (e.g., "2分钟前", "昨天 14:30", "2023-11-13")
   */
  formatRelativeTime(date: Date | string): string {
    const d = typeof date === 'string' ? parseLocalTimeString(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return `昨天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    return d.toLocaleDateString('zh-CN');
  }
}

// 导出单例
export const TimeHub = new TimeHubService();
```

#### 7.2.2 EventLogVersion 数据结构（修正版）

```typescript
// types/version.ts

/**
 * 版本快照（每 5 分钟或重要操作时保存）
 * 
 * ✅ 时间戳由 TimeHub.recordTimestamp() 生成
 * ✅ 存储时使用 TimeHub.formatTimestamp() 转为本地时间字符串
 * ✅ 显示时使用 TimeHub.parseTimestamp() 或 formatRelativeTime()
 */
type EventLogVersion = {
  id: string;
  createdAt: Date;              // 🎯 由 TimeHub.recordTimestamp() 生成
  
  // 完整的内容快照（方便快速恢复）
  content: Descendant[];        // 包含 ContextMarkerElement（带 TimeSpec）
  
  // 可选：只存储差异（节省空间）
  diff?: Delta;
  
  // 版本元数据
  author?: string;              // 如果支持多用户
  triggerType: VersionTriggerType;
  changesSummary: string;       // "添加了 3 个段落，删除了 1 张图片"
  
  // 用于同步的哈希
  contentHash: string;
};

type VersionTriggerType = 
  | 'auto-save'          // 自动保存（5 分钟间隔）
  | 'manual-save'        // 用户手动保存（Ctrl+S）
  | 'sync-push'          // 同步到 Outlook 前
  | 'sync-pull'          // 从 Outlook 拉取后
  | 'major-edit'         // 重大编辑（如插入表格、上传附件、插入情境标记）
  | 'checkpoint';        // 用户手动创建的检查点

/**
 * 操作日志（更细粒度，可选）
 * 用于精确追踪每个编辑操作
 */
type Operation = {
  id: string;
  timestamp: string;       // 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  type: 'insert' | 'delete' | 'update';
  path: Path;              // Slate path
  data: any;
  userId?: string;
};

/**
 * 差异对象（类似 Git diff）
 * 用于存储增量变更，节省空间
 */
type Delta = {
  added: DeltaChange[];
  removed: DeltaChange[];
  modified: DeltaChange[];
};

type DeltaChange = {
  path: Path;
  oldValue?: any;
  newValue?: any;
};
```

### 7.3 VersionControlService 实现

```typescript
// services/versionControl.ts
import { Editor, Node, Operation as SlateOperation, Path } from 'slate';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { TimeHub } from './TimeHub';  // 🎯 导入 TimeHub

export class VersionControlService {
  private lastVersionTimestamp: string | null = null;  // 'YYYY-MM-DD HH:mm:ss'
  private pendingOperations: Operation[] = [];
  private autoSaveTimer: NodeJS.Timeout | null = null;
  
  // 配置
  private readonly AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5 分钟
  private readonly MIN_CHANGES_THRESHOLD = 10;         // 最少 10 个操作才保存
  
  constructor(private timelogId: string) {
    this.startAutoSave();
  }
  
  // 启动自动保存
  private startAutoSave() {
    this.autoSaveTimer = setInterval(() => {
      this.checkAndCreateVersion('auto-save');
    }, this.AUTO_SAVE_INTERVAL);
  }
  
  // 停止自动保存
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
  
  // 检查是否应该创建新版本
  private async checkAndCreateVersion(trigger: VersionTriggerType) {
    const now = TimeHub.recordTimestamp();  // 🎯 使用 TimeHub
    
    // 1. 检查时间间隔
    if (this.lastVersionTimestamp) {
      const elapsed = now.getTime() - this.lastVersionTimestamp.getTime();
      if (elapsed < this.AUTO_SAVE_INTERVAL && trigger === 'auto-save') {
        console.log('  ⏭️ 未到 5 分钟，跳过自动保存');
        return;
      }
    }
    
    // 2. 检查是否有足够的变更
    if (this.pendingOperations.length < this.MIN_CHANGES_THRESHOLD && trigger === 'auto-save') {
      console.log(`  ⏭️ 变更太少 (${this.pendingOperations.length}/${this.MIN_CHANGES_THRESHOLD})，跳过自动保存`);
      return;
    }
    
    // 3. 创建版本
    await this.createVersion(trigger);
  }
  
  // 创建新版本
  async createVersion(trigger: VersionTriggerType): Promise<EventLogVersion> {
    const timelog = await db.timelogs.findById(this.timelogId);
    
    // 1. 使用 TimeHub 记录时间戳
    const createdAt = TimeHub.recordTimestamp();  // 🎯 统一时间来源
    
    // 2. 计算内容哈希
    const contentHash = this.hashContent(timelog.content);
    
    // 3. 生成变更摘要
    const changesSummary = this.generateChangesSummary(this.pendingOperations);
    
    // 4. 计算差异（相对于上一个版本）
    const previousVersion = timelog.versions[timelog.versions.length - 1];
    const diff = previousVersion 
      ? this.calculateDiff(previousVersion.content, timelog.content)
      : null;
    
    // 5. 创建版本对象
    const version: EventLogVersion = {
      id: uuidv4(),
      createdAt,  // 🎯 使用 TimeHub 生成的时间戳
      content: timelog.content, // 完整快照
      diff,
      triggerType: trigger,
      changesSummary,
      contentHash,
    };
    
    // 6. 保存版本（存储时转为本地时间字符串）
    await db.timelogs.update(this.timelogId, {
      $push: { 
        versions: {
          ...version,
          createdAt: TimeHub.formatTimestamp(version.createdAt),  // 🎯 转为本地时间字符串
        }
      },
      updatedAt: TimeHub.formatTimestamp(createdAt),  // 🎯 使用 TimeHub
    });
    
    // 7. 重置状态
    this.lastVersionTimestamp = createdAt;
    this.pendingOperations = [];
    
    console.log(`✅ 版本已创建: ${trigger} - ${changesSummary}`);
    
    return version;
  }
  
  // 记录操作（在 Slate onChange 中调用）
  recordOperation(operation: SlateOperation, editor: Editor) {
    // 过滤掉不重要的操作（如光标移动）
    if (operation.type === 'set_selection') {
      return;
    }
    
    this.pendingOperations.push({
      id: uuidv4(),
      timestamp: TimeHub.recordTimestamp(),  // 🎯 使用 TimeHub
      type: this.mapSlateOpType(operation.type),
      path: operation.path || [],
      data: operation,
    });
    
    // 检测"重大编辑"，立即创建版本
    if (this.isMajorEdit(operation)) {
      console.log('🔔 检测到重大编辑，立即创建版本');
      this.createVersion('major-edit');
    }
  }
  
  // 检测是否为重大编辑
  private isMajorEdit(operation: SlateOperation): boolean {
    if (operation.type === 'insert_node') {
      const node = operation.node as any;
      // 插入表格、图片、视频等
      if (['table', 'image', 'video', 'audio'].includes(node.type)) {
        return true;
      }
    }
    
    if (operation.type === 'remove_node') {
      const node = operation.node as any;
      // 删除整个块级元素
      if (['table', 'heading-1', 'heading-2', 'heading-3'].includes(node.type)) {
        return true;
      }
    }
    
    return false;
  }
  
  // 生成变更摘要
  private generateChangesSummary(operations: Operation[]): string {
    const stats = {
      insertions: 0,
      deletions: 0,
      updates: 0,
      charsAdded: 0,
      charsRemoved: 0,
    };
    
    operations.forEach(op => {
      switch (op.type) {
        case 'insert':
          stats.insertions++;
          if (op.data.text) {
            stats.charsAdded += op.data.text.length;
          }
          break;
        case 'delete':
          stats.deletions++;
          if (op.data.text) {
            stats.charsRemoved += op.data.text.length;
          }
          break;
        case 'update':
          stats.updates++;
          break;
      }
    });
    
    const parts: string[] = [];
    if (stats.charsAdded > 0) parts.push(`添加了 ${stats.charsAdded} 个字符`);
    if (stats.charsRemoved > 0) parts.push(`删除了 ${stats.charsRemoved} 个字符`);
    if (stats.insertions > 0) parts.push(`插入了 ${stats.insertions} 个元素`);
    if (stats.deletions > 0) parts.push(`删除了 ${stats.deletions} 个元素`);
    
    return parts.join('，') || '无变更';
  }
  
  // 计算差异（简化版）
  private calculateDiff(oldContent: Descendant[], newContent: Descendant[]): Delta | null {
    const oldStr = JSON.stringify(oldContent);
    const newStr = JSON.stringify(newContent);
    
    if (oldStr === newStr) {
      return null;
    }
    
    // TODO: 实现更精确的 diff 算法
    // 可以使用 diff-match-patch 或 Myers diff
    
    return {
      added: [],
      removed: [],
      modified: [],
    };
  }
  
  // 计算内容哈希
  private hashContent(content: Descendant[]): string {
    const str = JSON.stringify(content);
    return crypto.createHash('sha256').update(str).digest('hex');
  }
  
  // 映射 Slate 操作类型
  private mapSlateOpType(type: string): 'insert' | 'delete' | 'update' {
    if (type.includes('insert')) return 'insert';
    if (type.includes('remove')) return 'delete';
    return 'update';
  }
}
```

### 6.4 集成到 Slate Editor

```typescript
// components/TimeLogEditor.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createEditor, Descendant } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { VersionControlService } from '../services/versionControl';

interface TimeLogEditorProps {
  timelogId: string;
  initialValue: Descendant[];
  onSave: (content: Descendant[]) => void;
}

export const TimeLogEditor: React.FC<TimeLogEditorProps> = ({
  timelogId,
  initialValue,
  onSave,
}) => {
  const editor = useMemo(() => withReact(createEditor()), []);
  const [value, setValue] = useState<Descendant[]>(initialValue);
  
  // 创建版本控制服务
  const versionControl = useRef<VersionControlService | null>(null);
  
  useEffect(() => {
    // 初始化版本控制
    versionControl.current = new VersionControlService(timelogId);
    
    // 清理
    return () => {
      versionControl.current?.stopAutoSave();
    };
  }, [timelogId]);
  
  // 处理内容变化
  const handleChange = (newValue: Descendant[]) => {
    setValue(newValue);
    
    // 记录操作历史
    editor.operations.forEach(op => {
      versionControl.current?.recordOperation(op, editor);
    });
  };
  
  // 手动保存（Ctrl+S）
  const handleManualSave = useCallback(() => {
    versionControl.current?.createVersion('manual-save');
    onSave(value);
  }, [value, onSave]);
  
  // 监听键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);
  
  return (
    <div className="timelog-editor">
      <div className="editor-toolbar">
        <button onClick={handleManualSave}>💾 保存</button>
        <button onClick={() => setShowHistory(true)}>🕐 版本历史</button>
      </div>
      
      <Slate editor={editor} initialValue={value} onChange={handleChange}>
        <Editable
          placeholder="开始记录..."
          renderElement={renderElement}
          renderLeaf={renderLeaf}
        />
      </Slate>
      
      {/* 版本历史面板 */}
      {showHistory && (
        <VersionHistoryPanel
          timelogId={timelogId}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};
```

### 6.5 版本历史 UI

```typescript
// components/VersionHistoryPanel.tsx
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface VersionHistoryPanelProps {
  timelogId: string;
  onClose: () => void;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  timelogId,
  onClose,
}) => {
  const [versions, setVersions] = useState<EventLogVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadVersions();
  }, [timelogId]);
  
  const loadVersions = async () => {
    setLoading(true);
    try {
      const timelog = await db.timelogs.findById(timelogId);
      setVersions([...eventlog.versions].reverse()); // 最新的在前
    } finally {
      setLoading(false);
    }
  };
  
  const handleRestore = async (versionId: string) => {
    const version = versions.find(v => v.id === versionId);
    if (!version) return;
    
    // 确认对话框
    const confirmed = window.confirm(
      `确定要恢复到 ${format(version.timestamp, 'yyyy-MM-dd HH:mm:ss')} 的版本吗？\n\n` +
      `变更内容: ${version.changesSummary}`
    );
    
    if (!confirmed) return;
    
    // 恢复版本（创建一个新版本，内容为旧版本）
    await db.timelogs.update(timelogId, {
      content: version.content,
      $push: {
        versions: {
          id: uuidv4(),
          timestamp: formatTimeForStorage(new Date()),
          content: version.content,
          triggerType: 'checkpoint',
          changesSummary: `恢复到 ${version.timestamp}`,
          contentHash: hashContent(version.content),
        },
      },
    });
    
    // 刷新页面
    window.location.reload();
  };
  
  const getTriggerLabel = (trigger: VersionTriggerType): string => {
    const labels: Record<VersionTriggerType, string> = {
      'auto-save': '自动保存',
      'manual-save': '手动保存',
      'sync-push': '同步到 Outlook',
      'sync-pull': '从 Outlook 同步',
      'major-edit': '重大编辑',
      'checkpoint': '检查点',
    };
    return labels[trigger];
  };
  
  const getTriggerIcon = (trigger: VersionTriggerType): string => {
    const icons: Record<VersionTriggerType, string> = {
      'auto-save': '⏰',
      'manual-save': '💾',
      'sync-push': '📤',
      'sync-pull': '📥',
      'major-edit': '✨',
      'checkpoint': '🔖',
    };
    return icons[trigger];
  };
  
  return (
    <div className="version-history-panel">
      <div className="panel-header">
        <h3>📜 版本历史</h3>
        <button onClick={onClose}>✕</button>
      </div>
      
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="version-list">
          {versions.length === 0 ? (
            <div className="empty">暂无版本历史</div>
          ) : (
            versions.map(version => (
              <div
                key={version.id}
                className={`version-item ${selectedVersion === version.id ? 'selected' : ''}`}
                onClick={() => setSelectedVersion(version.id)}
              >
                <div className="version-header">
                  <span className="version-icon">
                    {getTriggerIcon(version.triggerType)}
                  </span>
                  <span className="version-time">
                    {format(version.timestamp, 'yyyy-MM-dd HH:mm:ss')}
                  </span>
                  <span className={`version-badge ${version.triggerType}`}>
                    {getTriggerLabel(version.triggerType)}
                  </span>
                </div>
                
                <div className="version-summary">
                  {version.changesSummary}
                </div>
                
                <div className="version-actions">
                  <button
                    className="btn-preview"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(version.id);
                    }}
                  >
                    👁️ 预览
                  </button>
                  <button
                    className="btn-restore"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(version.id);
                    }}
                  >
                    ↩️ 恢复
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
```

### 6.6 存储优化

```typescript
// services/versionStorage.ts

export class VersionStorageOptimizer {
  // 存储策略：
  // - 最近 10 个版本：完整快照（快速恢复）
  // - 11-50 个版本：仅存储 diff（节省空间）
  // - 50+ 个版本：每 10 个保留 1 个完整快照，其他删除
  
  async optimizeVersions(timelogId: string) {
    const timelog = await db.timelogs.findById(timelogId);
    const versions = timelog.versions;
    
    if (versions.length <= 10) {
      console.log('版本数量较少，无需优化');
      return;
    }
    
    console.log(`🔧 开始优化版本存储: ${versions.length} 个版本`);
    
    const optimized: EventLogVersion[] = [];
    
    versions.forEach((version, index) => {
      const age = versions.length - index;
      
      if (age <= 10) {
        // 最近 10 个：保留完整快照
        optimized.push(version);
      } else if (age <= 50) {
        // 11-50 个：只保留 diff
        optimized.push({
          ...version,
          content: null as any, // 移除完整内容
          diff: this.calculateDiff(
            versions[index - 1]?.content,
            version.content
          ),
        });
      } else if (age % 10 === 0) {
        // 50+ 个：每 10 个保留一个完整快照
        optimized.push(version);
      }
      // 其他的直接丢弃
    });
    
    await db.timelogs.update(timelogId, {
      versions: optimized,
    });
    
    console.log(`✅ 版本优化完成：${versions.length} → ${optimized.length}`);
  }
  
  // 从 diff 重建内容
  async reconstructContent(
    timelogId: string,
    versionId: string
  ): Promise<Descendant[]> {
    const timelog = await db.timelogs.findById(timelogId);
    const targetIndex = timelog.versions.findIndex(v => v.id === versionId);
    
    if (targetIndex === -1) {
      throw new Error('版本不存在');
    }
    
    const targetVersion = timelog.versions[targetIndex];
    
    // 如果有完整内容，直接返回
    if (targetVersion.content) {
      return targetVersion.content;
    }
    
    // 否则，从最近的完整快照开始，依次应用 diff
    let baseIndex = targetIndex;
    while (baseIndex >= 0 && !timelog.versions[baseIndex].content) {
      baseIndex--;
    }
    
    if (baseIndex < 0) {
      throw new Error('找不到基础快照');
    }
    
    let content = timelog.versions[baseIndex].content;
    
    // 应用每个 diff
    for (let i = baseIndex + 1; i <= targetIndex; i++) {
      const diff = timelog.versions[i].diff;
      if (diff) {
        content = this.applyDiff(content, diff);
      }
    }
    
    return content;
  }
  
  private calculateDiff(
    oldContent: Descendant[] | undefined,
    newContent: Descendant[]
  ): Delta | null {
    if (!oldContent) return null;
    
    const oldStr = JSON.stringify(oldContent);
    const newStr = JSON.stringify(newContent);
    
    if (oldStr === newStr) return null;
    
    // TODO: 实现精确的 diff 算法
    return {
      added: [],
      removed: [],
      modified: [],
    };
  }
  
  private applyDiff(content: Descendant[], diff: Delta): Descendant[] {
    // TODO: 实现 diff 应用逻辑
    return content;
  }
}
```

### 6.7 与同步集成

```typescript
// sync/syncEngine.ts (扩展版本)

export class SyncEngine {
  private versionControl: Map<string, VersionControlService> = new Map();
  
  async syncEvent(eventId: string) {
    const localEvent = await db.events.findById(eventId);
    
    // 获取或创建版本控制服务
    if (!this.versionControl.has(localEvent.eventlogId)) {
      this.versionControl.set(
        localEvent.eventlogId,
        new VersionControlService(localEvent.eventlogId)
      );
    }
    const vc = this.versionControl.get(localEvent.eventlogId)!;
    
    // 同步前创建检查点
    await vc.createVersion('sync-push');
    
    const remoteEvent = await outlookApi.getEvent(eventId);
    const conflict = detectConflict(
      localEvent.eventlog.content,
      remoteEvent.body.content,
      localEvent.syncState
    );
    
    let result;
    switch (conflict) {
      case 'local-changed':
        result = await this.pushToOutlook(localEvent, remoteEvent);
        break;
        
      case 'remote-changed':
        result = await this.pullFromOutlook(localEvent, remoteEvent);
        // 同步后创建检查点
        await vc.createVersion('sync-pull');
        break;
        
      case 'both-changed':
        result = await this.resolveConflict(localEvent, remoteEvent);
        await vc.createVersion('sync-pull');
        break;
        
      default:
        result = { status: 'synced' };
    }
    
    return result;
  }
}
```

## 7. 实现指南

### 7.1 开发顺序

**Phase 1: 基础功能（Week 1-2）**

- ✅ 实现 Slate 编辑器基础配置
- ✅ 实现 slateToHtml 转换器
- ✅ 实现 slateToPlainText 转换器
- ✅ 实现基础的数据存储（MongoDB/SQLite）

**Phase 2: 同步功能（Week 3-4）**

- ✅ 实现 Outlook API 认证
- ✅ 实现 SyncEngine 核心逻辑
- ✅ 实现冲突检测和解决
- ✅ 实现附件上传/下载

**Phase 3: 版本控制（Week 5-6）**

- ✅ 实现 VersionControlService
- ✅ 实现自动保存机制
- ✅ 实现版本历史 UI
- ✅ 实现版本恢复功能

**Phase 4: 优化和测试（Week 7-8）**

- ✅ 实现存储优化
- ✅ 实现离线支持
- ✅ 性能优化
- ✅ 端到端测试

### 7.2 数据存储架构

**🆕 架构决策（2025-11-13）:**

- **TimeLog 设计**: 嵌入式（Event.eventlog 字段），不创建独立表
- **版本存储**: Event.eventlog.versions 数组（最多保留 50 个）
- **归档策略**: 50+ 版本时可选迁移到单独的 localStorage key

#### 7.2.1 当前实现：localStorage + JSON 数组

**存储引擎**: localStorage（浏览器原生 API）

**理由**：
1. ✅ 简单、无依赖、跨平台兼容
2. ✅ 当前数据量小（<1000 events），性能足够
3. ✅ 已有 PersistentStorage 工具类封装（TagService 使用）
4. ✅ 符合 Electron 小型应用最佳实践

**限制**：
- ⚠️ localStorage 限制 5-10MB（约 5000 events）
- ⚠️ 需手动实现跨标签页同步（BroadcastChannel）
- ⚠️ 无事务保证（需自行实现乐观锁）
- ⚠️ 查询性能受限（内存遍历 Array.filter()）

**数据结构设计:**
```typescript
// STORAGE_KEYS.EVENTS 存储格式
// localStorage.getItem('remarkable-events') → JSON Array
[
  {
    id: "evt_123",
    title: "完成设计稿",                          // 纯文本（Outlook subject）
    titleContent: "<p>完成 <span>...</span></p>",  // 富文本 HTML（本地编辑）
    startTime: "2025-11-13 10:00:00",              // 本地时间字符串（派生字段）
    endTime: "2025-11-13 11:00:00",                // 本地时间字符串（派生字段）
    timeSpec: {                                     // 权威时间来源
      kind: "fixed",
      source: "user",
      start: "2025-11-13 10:00:00",                // Date → local time string
      end: "2025-11-13 11:00:00",
      allDay: false
    },
    tags: ["design", "work"],                      // 从 titleContent 提取
    description: "<p>讨论了...</p>",               // 富文本 HTML（Outlook body）
    eventlog: "[{\"type\":\"paragraph\",...}]",     // Slate JSON 字符串
    
    // 同步状态（嵌入）
    syncState: {
      lastSyncedAt: "2025-11-13T10:00:00Z",
      contentHash: "abc123",
      status: "synced",
      outlookId: "AAMkAGI..."
    }
  }
]
```

**版本历史存储（可选，单独 key）**:
```typescript
// STORAGE_KEYS.EVENT_VERSIONS
// localStorage.getItem('remarkable-event-versions') → JSON Object
{
  "evt_123": [
    { 
      id: "v1", 
      createdAt: "2025-11-13T10:00:00Z",      // TimeHub.formatTimestamp()
      content: [{...}],                        // Slate JSON（完整快照）
      changesSummary: "初始版本"
    },
    { 
      id: "v2", 
      createdAt: "2025-11-13T10:05:00Z",
      diff: { added: [...], removed: [...] }, // Delta（差异）
      changesSummary: "添加表格"
    }
  ],
  "evt_456": [...]
}
```

**其他 localStorage 存储**:
```typescript
// 标签数据（已实现）
STORAGE_KEYS.HIERARCHICAL_TAGS: HierarchicalTag[]

// 日历缓存（已实现）
STORAGE_KEYS.CALENDAR_GROUPS_CACHE: CalendarGroup[]
STORAGE_KEYS.CALENDARS_CACHE: Calendar[]
STORAGE_KEYS.TODO_LISTS_CACHE: TodoList[]

// 联系人数据（已实现）
STORAGE_KEYS.CONTACTS: Contact[]

// 同步队列（待实现）
STORAGE_KEYS.SYNC_QUEUE: { eventId: string, operation: string, timestamp: string }[]
```

**跨标签页同步**:
```typescript
// EventService 已实现 BroadcastChannel
const broadcastChannel = new BroadcastChannel('remarkable-events');

// 发送更新通知
broadcastChannel.postMessage({ type: 'events-updated', eventIds: [...] });

// 监听其他标签页的更新
broadcastChannel.onmessage = (event) => {
  if (event.data.type === 'events-updated') {
    // 重新加载 events
    this.notifyListeners();
  }
};
```

#### 7.2.2 未来迁移路径（Phase 2/3）

**Phase 2: 引入 SQLite（可选）**

**场景**: 数据量增长（>1000 events）或需要复杂查询

**技术栈**:
- `better-sqlite3`: Node.js SQLite 绑定（性能最优）
- `electron-store`: Electron 配置管理（可选）

**SQLite 设计示例**:
```sql
-- 主表（内联基础字段）
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_content TEXT,        -- 富文本 HTML
  start_time TEXT NOT NULL,  -- 本地时间字符串 'YYYY-MM-DD HH:mm:ss'
  end_time TEXT NOT NULL,
  timespec TEXT NOT NULL,    -- TimeSpec JSON
  tags TEXT,                 -- JSON array: ["tag1", "tag2"]
  description TEXT,          -- 富文本 HTML
  timelog TEXT,              -- Slate JSON 字符串
  
  -- 同步状态
  sync_status TEXT DEFAULT 'pending',
  sync_hash TEXT,
  synced_at TEXT,
  outlook_id TEXT UNIQUE,
  
  -- 元数据
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 索引策略
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_sync_status ON events(sync_status);
CREATE INDEX idx_events_outlook_id ON events(outlook_id);
CREATE INDEX idx_events_tags ON events(tags);  -- JSON 索引（SQLite 3.38+）

-- 全文搜索索引
CREATE VIRTUAL TABLE events_fts USING fts5(
  title, description, timelog, 
  content='events', content_rowid='rowid'
);

-- 辅助表（版本历史归档）
CREATE TABLE event_versions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  content TEXT NOT NULL,       -- Slate JSON 完整快照
  diff TEXT,                   -- Delta JSON（可选）
  changes_summary TEXT,
  
  UNIQUE(event_id, version_number)
);

CREATE INDEX idx_versions_event_id ON event_versions(event_id);
```

**迁移脚本**:
```typescript
// 从 localStorage 迁移到 SQLite
async function migrateToSQLite() {
  const db = new Database('remarkable.db');
  const events = JSON.parse(localStorage.getItem('remarkable-events') || '[]');
  
  const insert = db.prepare(`
    INSERT INTO events (id, title, title_content, start_time, ...)
    VALUES (?, ?, ?, ?, ...)
  `);
  
  const insertMany = db.transaction((events) => {
    for (const event of events) {
      insert.run(
        event.id,
        event.title,
        event.titleContent,
        event.startTime,
        // ...
        JSON.stringify(event.timeSpec),
        JSON.stringify(event.tags)
      );
    }
  });
  
  insertMany(events);
  console.log(`✅ 迁移完成：${events.length} 个事件`);
}
```

**Phase 3: 支持 MongoDB（云端备份）**

**场景**: 多设备同步、协作编辑、云端备份

**技术栈**:
- MongoDB Atlas（云服务）
- MongoDB Realm（移动端同步）

**MongoDB 设计示例**:
```javascript
// events 集合
{
  _id: ObjectId("..."),
  id: "evt_123",               // ReMarkable UUID
  title: "完成设计稿",
  titleContent: "<p>...</p>",
  startTime: ISODate("2025-11-13T10:00:00Z"),
  endTime: ISODate("2025-11-13T11:00:00Z"),
  timeSpec: {
    kind: "fixed",
    start: ISODate("..."),
    end: ISODate("..."),
    // ...
  },
  tags: ["design", "work"],
  description: "<p>...</p>",
  eventlog: [{                  // Slate JSON（嵌入文档）
    type: "paragraph",
    children: [...]
  }],
  syncState: {
    lastSyncedAt: ISODate("..."),
    contentHash: "abc123",
    outlookId: "AAMkAGI..."
  },
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}

// 索引策略
db.events.createIndex({ id: 1 }, { unique: true });
db.events.createIndex({ startTime: 1 });
db.events.createIndex({ tags: 1 });
db.events.createIndex({ "syncState.outlookId": 1 });
db.events.createIndex({ "$**": "text" });  // 全文搜索

// 版本历史集合（单独存储）
db.event_versions.createIndex({ eventId: 1, versionNumber: -1 });
```

#### 7.2.3 性能优化建议

**当前架构（localStorage）优化**:

1. **分离冷热数据**:
   ```typescript
   // 活跃事件（最近 30 天）
   STORAGE_KEYS.EVENTS: Event[]  // ~500 events, ~2MB
   
   // 归档事件（30+ 天前）
   STORAGE_KEYS.ARCHIVED_EVENTS: Event[]  // ~4500 events, ~18MB
   ```

2. **延迟加载版本历史**:
   ```typescript
   // 主数据不包含 versions
   // 需要时才从 EVENT_VERSIONS 加载
   async loadVersions(eventId: string) {
     const allVersions = JSON.parse(
       localStorage.getItem('remarkable-event-versions') || '{}'
     );
     return allVersions[eventId] || [];
   }
   ```

3. **定期清理归档数据**:
   ```typescript
   // 保留最近 1 年，删除更早的数据
   function cleanupOldEvents() {
     const oneYearAgo = new Date();
     oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
     
     const events = EventService.getAllEvents();
     const recentEvents = events.filter(e => 
       parseLocalTimeString(e.startTime) > oneYearAgo
     );
     
     localStorage.setItem('remarkable-events', JSON.stringify(recentEvents));
   }
   ```

4. **监控存储使用量**:
   ```typescript
   function getStorageUsage(): { used: number, quota: number } {
     if (navigator.storage && navigator.storage.estimate) {
       return await navigator.storage.estimate();
     }
     // Fallback: 估算 localStorage 大小
     let total = 0;
     for (let key in localStorage) {
       total += localStorage[key].length + key.length;
     }
     return { used: total, quota: 10 * 1024 * 1024 };  // 假设 10MB 限制
   }
   
   // 超过 5MB 时提示用户
   if (usage.used > 5 * 1024 * 1024) {
     console.warn('⚠️ 存储空间接近限制，建议清理归档数据');
   }
   ```

**附件存储:**

- 本地缓存：`app.getPath('userData')/attachments/`
- 云存储：OneDrive（与 Outlook 集成更好）

**同步频率:**

- 手动同步：用户点击"同步"按钮
- 自动同步：每 15 分钟检查一次
- 实时同步：使用 Microsoft Graph Webhooks（未来功能）

### 7.3 错误处理

```typescript
// utils/errorHandler.ts

export class SyncError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export const handleSyncError = (error: any): SyncError => {
  // 网络错误
  if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return new SyncError('网络连接失败', 'NETWORK_ERROR', true);
  }
  
  // 认证错误
  if (error.statusCode === 401) {
    return new SyncError('认证失败，请重新登录', 'AUTH_ERROR', false);
  }
  
  // 限流错误
  if (error.statusCode === 429) {
    return new SyncError('请求过于频繁，请稍后再试', 'RATE_LIMIT', true);
  }
  
  // 服务器错误
  if (error.statusCode >= 500) {
    return new SyncError('服务器错误', 'SERVER_ERROR', true);
  }
  
  // 未知错误
  return new SyncError(error.message || '未知错误', 'UNKNOWN_ERROR', true);
};
```

## 8. 性能优化

### 8.1 延迟加载

```typescript
// 版本历史不要一次性全部加载
async loadVersions(eventId: string, limit: number = 20, offset: number = 0) {
  const event = await EventService.getEventById(eventId);
  if (!event?.eventlog?.versions) {
    return { versions: [], total: 0, hasMore: false };
  }
  const versions = event.eventlog.versions;
  const total = versions.length;
  const sliced = versions
    .slice(Math.max(0, total - offset - limit), total - offset)
    .reverse();
  
  return {
    versions: sliced,
    total,
    hasMore: offset + limit < total,
  };
}
```

### 8.2 缓存策略

```typescript
// 使用 IndexedDB 缓存版本  
import { openDB } from 'idb';  

const versionCache = await openDB('remarkable-versions', 1, {  
  upgrade(db) {  
    db.createObjectStore('versions', { keyPath: 'id' });  
  }  
});
```

---

## 9. 技术栈

- **编辑器**: Slate.js
- **UI 框架**: React + TypeScript
- **状态管理**: Zustand / Redux Toolkit
- **时间管理**: TimeHub + TimeSpec（见 [TIME_ARCHITECTURE.md](../TIME_ARCHITECTURE.md)）
- **活动监听**: active-win（桌面端）+ 自定义 ActivityService
- **数据库**: SQLite (开发) / MongoDB (生产)
- **同步 API**: Microsoft Graph API
- **附件存储**: OneDrive API
- **版本控制**: 自定义实现（基于 diff-match-patch）
- **日期处理**: date-fns
- **测试**: Jest + React Testing Library
- **端到端测试**: Playwright

---

## 10. 标签页与多窗口编辑功能调研

### 10.1 功能需求分析

**使用场景：**
TimeLog 页面需要支持用户同时编辑多个事件的日志，提供类似浏览器标签页的体验：

1. **独立窗口模式**：点击 Event 卡片 → 打开独立的 EventEditModal
2. **标签页模式**：点击"在新标签页中打开" → 在 TimeLog 页面内打开标签页
3. **多标签管理**：
   - 用户可以同时打开多个事件编辑标签
   - 支持标签拖拽排序
   - 支持标签关闭（含未保存提示）
   - 支持标签快捷切换（Ctrl+Tab / Cmd+Tab）

**交互体验：**
```
┌─────────────────────────────────────────────────────────┐
│ TimeLog 页面                                             │
├─────────────────────────────────────────────────────────┤
│ ┌─────┬─────┬─────┬─────┐                               │
│ │准备演讲│开会  │写代码│  +  │  ← 标签栏（可拖拽排序）      │
│ └──▼──┴─────┴─────┴─────┘                               │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 🎯 准备演讲稿                                      │   │
│ │ #工作 #文档编辑                                    │   │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│ │ ▸ 2025-10-19 10:21:18                             │   │
│ │ 处理完了一些出差的logistics...                      │   │
│ │ [Slate 编辑器区域]                                 │   │
│ │                                                   │   │
│ │ [底部保存按钮区]                                   │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 10.2 技术方案调研

#### 方案 1: rc-tabs（推荐 ⭐⭐⭐⭐⭐）

**基本信息：**
- **GitHub**: [react-component/tabs](https://github.com/react-component/tabs)
- **Stars**: 573+
- **License**: MIT
- **维护状态**: ✅ 活跃维护（最近更新：3周前）
- **Bundle Size**: ~20KB (gzipped)
- **TypeScript**: ✅ 完整支持

**核心功能：**
```typescript
import Tabs from 'rc-tabs';

const items = [
  {
    key: '1',
    label: '🎯 准备演讲稿',
    children: <EventLogEditor eventId="event-1" />,
    closable: true,
  },
  {
    key: '2',
    label: '📝 开会讨论',
    children: <EventLogEditor eventId="event-2" />,
    closable: true,
  },
];

<Tabs
  items={items}
  activeKey={activeKey}
  onChange={setActiveKey}
  tabPosition="top"
  editable={{
    onEdit: (type, info) => {
      if (type === 'remove') {
        handleCloseTab(info.key);
      }
    },
    showAdd: true,
    addIcon: <PlusOutlined />,
  }}
  animated={{ inkBar: true, tabPane: false }}
/>
```

**优势：**
- ✅ Ant Design 团队维护，质量有保证
- ✅ 支持标签编辑（新增/删除）
- ✅ 支持标签拖拽排序（需配合 react-dnd）
- ✅ 支持键盘导航（左右方向键）
- ✅ 支持标签超出自动收缩到下拉菜单
- ✅ 支持自定义标签栏额外内容
- ✅ 完整的 TypeScript 类型定义
- ✅ 丰富的 API 和配置项

**劣势：**
- ⚠️ 拖拽功能需要额外集成（不是内置）
- ⚠️ 样式需要自定义（提供 Less 变量）

**推荐指数**: ⭐⭐⭐⭐⭐

---

#### 方案 2: @atlaskit/pragmatic-drag-and-drop（新一代拖拽方案）

**基本信息：**
- **GitHub**: [atlassian/pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop)
- **Stars**: 活跃项目
- **License**: Apache 2.0
- **维护状态**: ✅ Atlassian 新项目（react-beautiful-dnd 的继任者）
- **Bundle Size**: ~15KB (gzipped)

**说明：**
- react-beautiful-dnd 已于 2024年8月归档 ❌
- Atlassian 推出新的拖拽库：Pragmatic drag and drop
- 更轻量、更灵活、性能更好

**与 rc-tabs 结合使用：**
```typescript
import Tabs from 'rc-tabs';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop';

// 标签页配置
const [tabItems, setTabItems] = useState(items);

// 拖拽配置
const handleDragEnd = (result) => {
  const { source, destination } = result;
  if (!destination) return;
  
  const newItems = Array.from(tabItems);
  const [removed] = newItems.splice(source.index, 1);
  newItems.splice(destination.index, 0, removed);
  
  setTabItems(newItems);
};

<Tabs
  items={tabItems}
  // ... 其他配置
/>
```

**推荐指数**: ⭐⭐⭐⭐

---

#### 方案 3: GoldenLayout（专业级多窗口方案 ⭐⭐⭐⭐⭐）

**基本信息：**
- **GitHub**: [golden-layout/golden-layout](https://github.com/golden-layout/golden-layout)
- **Stars**: 6.6k+
- **License**: MIT
- **维护状态**: ✅ 活跃维护（2022年最新版本 v2.6.0）
- **Bundle Size**: ~50KB (gzipped)
- **TypeScript**: ✅ 完整支持
- **Used by**: 1.2k+ 项目

**核心功能（专业级IDE体验）：**
```typescript
import GoldenLayout from 'golden-layout';

const config = {
  content: [{
    type: 'row',
    content: [{
      type: 'stack', // 标签页容器
      content: [{
        type: 'component',
        componentName: 'eventEditor',
        componentState: { eventId: 'event-1' },
        title: '🎯 准备演讲稿',
        isClosable: true,
      }, {
        type: 'component',
        componentName: 'eventEditor',
        componentState: { eventId: 'event-2' },
        title: '📝 开会讨论',
        isClosable: true,
      }]
    }, {
      type: 'component',
      componentName: 'eventList',
      title: 'Event 列表',
      width: 30, // 占 30% 宽度
    }]
  }]
};

const myLayout = new GoldenLayout(config, document.getElementById('layoutContainer'));

// 注册组件
myLayout.registerComponent('eventEditor', function(container, state) {
  container.getElement().html(`<div id="editor-${state.eventId}"></div>`);
  // 渲染 React 组件
  ReactDOM.render(
    <EventLogEditor eventId={state.eventId} />,
    container.getElement()[0]
  );
});

myLayout.init();
```

**革命性功能（超越标签页）：**

1. **原生弹出窗口支持** 🪟
   - 标签页可以拖出成独立浏览器窗口
   - 支持多显示器工作流
   - 窗口间通信无缝衔接
   ```typescript
   // 用户可以直接拖拽标签页到浏览器外，自动创建新窗口
   myLayout.on('itemCreated', (item) => {
     if (item.isStack && item.header) {
       // 支持拖出窗口
       item.header._createPopout();
     }
   });
   ```

2. **灵活的布局系统** 📐
   - 支持水平/垂直分割
   - 支持嵌套布局（无限深度）
   - 支持标签页堆叠（stack）
   - 实时调整大小（可设置最小/最大尺寸）
   ```typescript
   // 示例：3栏布局 + 标签页
   {
     type: 'row',
     content: [
       { type: 'component', title: '左侧栏', width: 20 },
       { 
         type: 'stack', // 中间标签页区域
         content: [
           { type: 'component', title: 'Event 1' },
           { type: 'component', title: 'Event 2' },
         ]
       },
       { type: 'component', title: '右侧栏', width: 20 }
     ]
   }
   ```

3. **布局持久化** 💾
   - 保存/恢复完整布局状态
   - 包括窗口位置、大小、激活标签
   ```typescript
   // 保存布局
   const state = myLayout.toConfig();
   localStorage.setItem('layout', JSON.stringify(state));
   
   // 恢复布局
   const savedState = JSON.parse(localStorage.getItem('layout'));
   myLayout = new GoldenLayout(savedState);
   ```

4. **高级拖拽** 🎯
   - 标签页拖拽排序
   - 标签页拖拽到不同区域（分割、堆叠）
   - 拖拽到弹出窗口
   - 拖拽预览（实时显示放置位置）

5. **触摸屏支持** 📱
   - 移动设备友好
   - 响应式布局

**使用场景对比：**

| 场景 | rc-tabs | GoldenLayout |
|------|---------|--------------|
| 简单标签页 | ✅ 完美 | ⚠️ 过度设计 |
| 多标签编辑 | ✅ 合适 | ✅ 强大 |
| 分屏对比 | ❌ 不支持 | ✅ 原生支持 |
| 弹出窗口 | ❌ 不支持 | ✅ 原生支持 |
| 复杂布局 | ❌ 不支持 | ✅ 专业级 |
| 多显示器 | ❌ 不支持 | ✅ 完美支持 |

**优势：**
- ✅ 6.6k+ stars，成熟稳定
- ✅ 专业级 IDE 体验（类似 VS Code 布局）
- ✅ 原生弹出窗口支持
- ✅ 灵活的分割布局
- ✅ 布局持久化（保存/恢复）
- ✅ 完整的 API 和事件系统
- ✅ 支持虚拟组件（懒加载）
- ✅ 完全可主题化
- ✅ TypeScript 支持
- ✅ 触摸屏支持
- ✅ 响应式设计

**劣势：**
- ⚠️ 学习曲线较陡（功能强大但复杂）
- ⚠️ Bundle 较大（~50KB vs rc-tabs ~20KB）
- ⚠️ 需要更多配置
- ⚠️ React 集成需要额外封装
- ⚠️ 可能过度设计（如果只需要简单标签页）

**适用场景：**
- ✅ 需要弹出窗口功能
- ✅ 需要多显示器支持
- ✅ 需要分屏对比编辑
- ✅ 需要复杂的布局管理
- ✅ 追求专业级 IDE 体验
- ❌ 只需要简单的标签页（用 rc-tabs 更轻量）

**React 封装示例：**
```typescript
import React, { useEffect, useRef } from 'react';
import GoldenLayout from 'golden-layout';
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';

const GoldenLayoutWrapper: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<GoldenLayout | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config = {
      content: [{
        type: 'row',
        content: [{
          type: 'stack',
          width: 80,
          content: [{
            type: 'component',
            componentName: 'eventEditor',
            componentState: { eventId: 'event-1' },
            title: '🎯 准备演讲稿',
          }]
        }, {
          type: 'component',
          componentName: 'eventList',
          title: 'Events',
          width: 20,
        }]
      }]
    };

    const layout = new GoldenLayout(config, containerRef.current);

    // 注册 React 组件
    layout.registerComponent('eventEditor', (container, state) => {
      const element = container.getElement()[0];
      ReactDOM.render(
        <EventLogEditor eventId={state.eventId} />,
        element
      );
      
      // 清理函数
      container.on('destroy', () => {
        ReactDOM.unmountComponentAtNode(element);
      });
    });

    layout.init();
    layoutRef.current = layout;

    return () => {
      layout.destroy();
    };
  }, []);

  return <div ref={containerRef} style={{ height: '100%' }} />;
};
```

**推荐指数（取决于需求）**: 
- 简单标签页：⭐⭐⭐（过度设计，用 rc-tabs）
- 多窗口编辑：⭐⭐⭐⭐⭐（完美方案）
- 分屏布局：⭐⭐⭐⭐⭐（无可替代）

---

#### 方案 4: react-tabs（备选）

**基本信息：**
- **GitHub**: [reactjs/react-tabs](https://github.com/reactjs/react-tabs)
- **Stars**: 3k+
- **License**: MIT
- **维护状态**: ⚠️ 维护较慢

**优势：**
- ✅ 简单易用
- ✅ 完整的键盘支持
- ✅ 无障碍访问（ARIA）

**劣势：**
- ❌ 不支持标签编辑（新增/删除）
- ❌ 不支持拖拽排序
- ❌ API 相对简陋

**推荐指数**: ⭐⭐

---

### 10.3 最终推荐方案（两种选择）

#### 方案 A: rc-tabs + pragmatic-drag-and-drop（轻量级）⭐⭐⭐⭐

**适用场景：**
- ✅ 只需要标签页功能
- ✅ 不需要弹出窗口
- ✅ 不需要分屏布局
- ✅ 追求轻量级（20KB）

**理由：**
1. **rc-tabs** 提供完整的标签页基础功能
2. **pragmatic-drag-and-drop** 提供现代化的拖拽能力
3. 两者结合可以实现标签页所有需求
4. 都是活跃维护的项目，长期可靠
5. Bundle 小，性能优秀

---

#### 方案 B: GoldenLayout（专业级）⭐⭐⭐⭐⭐

**适用场景：**
- ✅ 需要弹出窗口（多显示器支持）
- ✅ 需要分屏对比编辑
- ✅ 需要灵活的布局管理
- ✅ 追求专业 IDE 体验

**理由：**
1. 6.6k+ stars，成熟稳定
2. 原生支持弹出窗口
3. 强大的布局系统（分割、堆叠、嵌套）
4. 布局持久化（保存/恢复状态）
5. 完整的事件系统
6. 支持多显示器工作流

**推荐 GoldenLayout 的理由：**

根据 TimeLog 页面的**核心使用场景**：
```
用户在记录某个事件，既可以：
1. 独立窗口编辑（EventEditModal）
2. 新标签页编辑（TimeLog 内嵌）
3. 👉 拖出成独立浏览器窗口（多显示器场景）
4. 👉 分屏对比编辑（同时查看多个事件）
```

**GoldenLayout 完美契合 3 和 4 的需求！**

实际工作场景：
- 用户可能有多个显示器
- 想在一个显示器上看 Event 列表
- 在另一个显示器上编辑日志
- 或者左右分屏对比两个事件的日志

这些都是 rc-tabs 无法实现的高级功能。

---

### 10.4 最终决策：**GoldenLayout 作为 App 通用布局系统** ⭐⭐⭐⭐⭐

**架构升级决策（2025-12-01）：**

GoldenLayout 不仅用于 TimeLog 页面，而是作为 **ReMarkable App 的通用布局管理系统**。

#### 未来使用场景

**1. TimeLog 页面（Phase 1）**
- 多标签编辑 Event 日志
- 弹出窗口独立编辑
- 分屏对比多个事件

**2. Homepage Dashboard（Phase 2）**
```
┌─────────────────────────────────────────────────────────┐
│ Homepage - 自由配置的仪表盘                              │
├──────────────────┬──────────────────┬───────────────────┤
│ 📊 时间统计       │ ✅ 任务提醒       │ ⏱️ 倒计时提醒     │
│ ├─ 今日工作时长   │ ├─ 今日 5 个待办  │ ├─ Project Ace    │
│ ├─ 本周专注时长   │ ├─ 紧急: 2 个     │ │   还剩 2天       │
│ └─ 月度统计图表   │ └─ 即将到期: 3 个 │ └─ 演讲日         │
│                  │                  │     还剩 5小时    │
├──────────────────┴──────────────────┴───────────────────┤
│ 🌲 EventTree - 项目树状视图                             │
│ ├─ 📁 Project Ace                                       │
│ │   ├─ 📝 准备演讲稿 (进行中)                            │
│ │   └─ 📅 客户会议 (已完成)                              │
│ └─ 📁 个人学习                                          │
├──────────────────┬──────────────────────────────────────┤
│ 📅 日历视图       │ 📈 周/月报表                          │
└──────────────────┴──────────────────────────────────────┘

用户可以：
- 拖拽调整每个组件的大小和位置
- 新增/删除组件
- 保存自定义布局（多套布局配置）
- 拖出任意组件成独立窗口（多显示器支持）
```

**3. Windows Desktop Widgets（Phase 3）**
```
桌面悬浮窗口：
┌─────────────────┐      ┌──────────────┐      ┌───────────┐
│ ⏱️ 专注计时器    │      │ 📋 快速笔记   │      │ 📊 今日统计│
│ 已专注: 2h 15m  │      │              │      │ 完成: 8/12│
│ [暂停] [停止]   │      │ [保存]       │      │ 工作: 5h  │
└─────────────────┘      └──────────────┘      └───────────┘

每个 Widget 都是 GoldenLayout 的一个独立窗口
```

#### 技术优势：一次投入，全局复用

| 功能 | 传统方案 | GoldenLayout 方案 |
|------|---------|------------------|
| TimeLog 标签页 | ✅ rc-tabs | ✅ GoldenLayout |
| Homepage 自由布局 | ❌ 需要新开发 | ✅ 免费获得 |
| 桌面 Widgets | ❌ 需要新开发 | ✅ 免费获得 |
| 弹出窗口 | ❌ 不支持 | ✅ 原生支持 |
| 布局持久化 | ❌ 需要手写 | ✅ 内置支持 |
| 多显示器支持 | ❌ 不支持 | ✅ 完美支持 |

---

### 10.5 架构决策：**GoldenLayout 作为 App 基础设施** ⭐⭐⭐⭐⭐

**战略价值评估：**

从 "TimeLog 的标签页组件" 升级为 "App 的通用布局系统"，投资回报率极高：

1. **一次投入，三处受益**
   - TimeLog: 标签页 + 弹出窗口 + 分屏编辑
   - Homepage: 自由配置的仪表盘
   - Desktop Widgets: Windows 桌面小组件

2. **避免重复造轮子**
   - 不用为每个页面单独实现布局管理
   - 不用手写布局持久化逻辑
   - 不用处理窗口通信问题

3. **用户体验一致性**
   - 所有页面使用相同的拖拽交互
   - 统一的窗口管理体验
   - 一次学习，处处适用

4. **技术债务最小化**
   - GoldenLayout 成熟稳定（6.6k stars）
   - MIT License，无版权风险
   - TypeScript 支持，类型安全

**类比专业工具：**
- **VS Code**: 使用类似布局系统（编辑器 + 侧边栏 + 终端）
- **Notion**: 弹出窗口编辑页面
- **Obsidian**: 分屏对比笔记
- **Figma**: 多窗口设计（Inspector + Canvas + Layers）

**ReMarkable 应该达到这个水平**。

---

### 10.6 实施计划

**完整实施计划已迁移到独立文档：**

📄 **[GoldenLayout 实施计划](./GOLDENLAYOUT_IMPLEMENTATION_PLAN.md)**

**文档内容概览：**

#### Phase 1: TimeLog 标签页功能（2-3 周）
- Week 1: 安装和封装 GoldenLayout
  - 创建 `GoldenLayoutWrapper` 通用组件
  - React 18 集成（createRoot API）
  - 自定义主题样式
- Week 2: 实现 TimeLog 标签页容器
  - `EventLogEditor` 组件
  - `TimeLogTabsContainer` 容器
  - 标签打开/关闭/切换逻辑
- Week 3: 集成和测试
  - 集成到 TimeLog 页面
  - 布局持久化
  - 性能优化

#### Phase 2: Homepage Dashboard（3-4 周）
- Week 1: 设计组件库（时间统计、任务提醒、倒计时等）
- Week 2-3: 实现 Dashboard 配置器
- Week 4: 组件市场（拖拽添加组件）

#### Phase 3: Windows Desktop Widgets（2-3 周）
- Week 1-2: Electron 窗口集成
- Week 2: Widget 路由和渲染
- Week 3: 系统托盘管理

**总计时间**: 8-10 周

**关键技术点**:
- GoldenLayout v2.6.0（稳定版）
- React 18 createRoot API
- 布局持久化（localStorage）
- Electron 多窗口管理
- 性能优化（懒加载、虚拟滚动）

详细代码示例、风险评估和成功指标请查看完整文档。

---

### 10.7 快速开始（Phase 1 最小实现）

**安装：**
```bash
# 安装 GoldenLayout
npm install golden-layout@2.6.0
npm install --save-dev @types/golden-layout
```

**最小可用示例：**
```typescript
// TimeLogTabs.tsx
import React, { useState, useCallback } from 'react';
import Tabs from 'rc-tabs';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop';
import EventLogEditor from './EventLogEditor';
import './TimeLogTabs.css';

interface TabItem {
  key: string;
  eventId: string;
  title: string;
  emoji?: string;
  closable: boolean;
  dirty?: boolean; // 是否有未保存的修改
}

const TimeLogTabs: React.FC = () => {
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeKey, setActiveKey] = useState<string>('');

  // 打开新标签
  const openTab = useCallback((eventId: string, title: string, emoji?: string) => {
    const newTab: TabItem = {
      key: `tab-${eventId}`,
      eventId,
      title,
      emoji,
      closable: true,
      dirty: false,
    };

    setTabs(prev => {
      const exists = prev.find(t => t.key === newTab.key);
      if (exists) {
        setActiveKey(newTab.key);
        return prev;
      }
      return [...prev, newTab];
    });
    setActiveKey(newTab.key);
  }, []);

  // 关闭标签
  const closeTab = useCallback((targetKey: string) => {
    const tab = tabs.find(t => t.key === targetKey);
    
    // 如果有未保存的修改，弹出确认框
    if (tab?.dirty) {
      if (!confirm(`${tab.title} 有未保存的修改，确定要关闭吗？`)) {
        return;
      }
    }

    setTabs(prev => {
      const newTabs = prev.filter(t => t.key !== targetKey);
      
      // 如果关闭的是当前标签，切换到下一个
      if (targetKey === activeKey && newTabs.length > 0) {
        const index = prev.findIndex(t => t.key === targetKey);
        const nextIndex = Math.min(index, newTabs.length - 1);
        setActiveKey(newTabs[nextIndex].key);
      }
      
      return newTabs;
    });
  }, [tabs, activeKey]);

  // 拖拽排序
  const onDragEnd = useCallback((result: any) => {
    const { source, destination } = result;
    if (!destination) return;

    setTabs(prev => {
      const newTabs = Array.from(prev);
      const [removed] = newTabs.splice(source.index, 1);
      newTabs.splice(destination.index, 0, removed);
      return newTabs;
    });
  }, []);

  // 标记为已修改
  const markTabDirty = useCallback((eventId: string, dirty: boolean) => {
    setTabs(prev =>
      prev.map(tab =>
        tab.eventId === eventId ? { ...tab, dirty } : tab
      )
    );
  }, []);

  // 渲染标签内容
  const tabItems = tabs.map(tab => ({
    key: tab.key,
    label: (
      <span className="tab-label">
        {tab.emoji && <span className="tab-emoji">{tab.emoji}</span>}
        <span className="tab-title">{tab.title}</span>
        {tab.dirty && <span className="tab-dirty-indicator">●</span>}
      </span>
    ),
    children: (
      <EventLogEditor
        eventId={tab.eventId}
        onDirtyChange={(dirty) => markTabDirty(tab.eventId, dirty)}
      />
    ),
    closable: tab.closable,
  }));

  return (
    <div className="timelog-tabs-container">
      <Tabs
        items={tabItems}
        activeKey={activeKey}
        onChange={setActiveKey}
        tabPosition="top"
        editable={{
          onEdit: (action, info) => {
            if (action === 'remove') {
              closeTab(info.key);
            }
          },
          showAdd: false, // 不显示新增按钮（通过点击 Event 卡片打开）
        }}
        animated={{ inkBar: true, tabPane: false }}
        tabBarExtraContent={{
          right: (
            <button className="close-all-tabs" onClick={() => {
              if (confirm('确定关闭所有标签吗？')) {
                setTabs([]);
              }
            }}>
              关闭所有
            </button>
          ),
        }}
      />
    </div>
  );
};

export default TimeLogTabs;
```

**样式文件：**
```css
/* TimeLogTabs.css */
.timelog-tabs-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-emoji {
  font-size: 16px;
}

.tab-title {
  font-size: 14px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-dirty-indicator {
  color: #f5222d;
  font-size: 12px;
  margin-left: 2px;
}

.close-all-tabs {
  padding: 4px 12px;
  font-size: 12px;
  color: #6b7280;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-all-tabs:hover {
  color: #1f2937;
  background: #f3f4f6;
}

/* rc-tabs 自定义样式 */
.rc-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.rc-tabs-nav {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 0;
}

.rc-tabs-tab {
  padding: 8px 16px;
  font-size: 14px;
  color: #6b7280;
  border: none;
  background: transparent;
  transition: color 0.2s;
}

.rc-tabs-tab:hover {
  color: #1f2937;
}

.rc-tabs-tab-active {
  color: #3b82f6 !important;
  font-weight: 500;
}

.rc-tabs-ink-bar {
  background: #3b82f6;
  height: 2px;
}

.rc-tabs-content {
  flex: 1;
  overflow: hidden;
}

.rc-tabs-tabpane {
  height: 100%;
  overflow-y: auto;
}

/* 关闭按钮样式 */
.rc-tabs-tab-remove {
  margin-left: 8px;
  padding: 2px;
  color: #9ca3af;
  opacity: 0;
  transition: opacity 0.2s;
}

.rc-tabs-tab:hover .rc-tabs-tab-remove {
  opacity: 1;
}

.rc-tabs-tab-remove:hover {
  color: #f5222d;
}
```

**快捷键支持：**
```typescript
// 添加键盘快捷键
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Tab / Cmd+Tab: 切换到下一个标签
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
      e.preventDefault();
      const currentIndex = tabs.findIndex(t => t.key === activeKey);
      const nextIndex = (currentIndex + 1) % tabs.length;
      if (tabs[nextIndex]) {
        setActiveKey(tabs[nextIndex].key);
      }
    }
    
    // Ctrl+W / Cmd+W: 关闭当前标签
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (activeKey) {
        closeTab(activeKey);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [tabs, activeKey, closeTab]);
```

### 10.4 实现路线图

**Phase 1: 基础标签页功能（1周）**
- [ ] 集成 rc-tabs 组件
- [ ] 实现打开/关闭标签
- [ ] 实现标签切换
- [ ] 实现未保存提示

**Phase 2: 拖拽排序（1周）**
- [ ] 集成 pragmatic-drag-and-drop
- [ ] 实现标签拖拽排序
- [ ] 实现拖拽动画

**Phase 3: 高级功能（1周）**
- [ ] 快捷键支持（Ctrl+Tab, Ctrl+W）
- [ ] 标签持久化（刷新后恢复）
- [ ] 标签右键菜单（关闭其他、关闭右侧等）
- [ ] 标签预览（hover 显示缩略图）

**Phase 4: 性能优化（1周）**
- [ ] 标签懒加载
- [ ] 虚拟滚动（超过20个标签时）
- [ ] 内存优化（关闭标签后释放资源）

### 10.5 性能考虑

**内存优化：**
```typescript
// 标签页懒加载策略
const TabPaneContent: React.FC<{ eventId: string; active: boolean }> = ({
  eventId,
  active
}) => {
  // 只有激活的标签才渲染内容
  if (!active) {
    return <div className="tab-placeholder">加载中...</div>;
  }
  
  return <EventLogEditor eventId={eventId} />;
};
```

**预加载策略：**
```typescript
// 预加载前后标签页的内容
useEffect(() => {
  const currentIndex = tabs.findIndex(t => t.key === activeKey);
  const prevTab = tabs[currentIndex - 1];
  const nextTab = tabs[currentIndex + 1];
  
  // 预加载相邻标签的数据
  if (prevTab) prefetchEventData(prevTab.eventId);
  if (nextTab) prefetchEventData(nextTab.eventId);
}, [activeKey, tabs]);
```

---

## 11. 时间架构集成总结

### 11.1 核心原则重申

**🚫 绝对禁止的做法：**

```typescript
// ❌ 错误 1: 使用 ISO 字符串
const marker = {
  timestamp: new Date().toISOString(), // 禁止！
};

// ❌ 错误 2: 直接操作 Date 对象
event.startTime = new Date();

// ❌ 错误 3: 手动计算时间窗口
const nextWeek = new Date();
nextWeek.setDate(nextWeek.getDate() + 7);
```

**✅ 正确的做法：**

```typescript
// ✅ 正确 1: 使用 TimeHub 创建 TimeSpec
const timeSpec: TimeSpec = {
  kind: 'fixed',
  source: 'system',
  rawText: null,
  policy: TimePolicy.getDefault(),
  resolved: { start: now, end: now },
  start: now,
  end: now,
  allDay: false,
};

// ✅ 正确 2: 通过 TimeHub 更新事件时间
TimeHub.setEventTime(eventId, 'fixed', {
  start: now,
  end: now,
});

// ✅ 正确 3: 使用 TimeParsingService 解析自然语言
TimeHub.setFuzzy(eventId, '下周一 10:00', {
  policy: { weekStart: 1 }
});

// ✅ 正确 4: 使用 useEventTime Hook 读取时间
const { timeSpec, start, end, allDay } = useEventTime(eventId);
```

### 10.2 情境标记（ContextMarker）的时间处理

```typescript
// 创建情境标记时的正确做法
const createContextMarkerWithTimeHub = async (activities: ActivitySpan[]) => {
  const now = new Date();
  
  // 1. 创建符合 TimeSpec 规范的时间对象
  const timeSpec: TimeSpec = {
    kind: 'fixed',
    source: 'system',
    rawText: null,
    policy: TimePolicy.getDefault(),
    resolved: { start: now, end: now },
    start: now,
    end: now,
    allDay: false,
  };
  
  // 2. 创建 ContextMarkerElement
  const marker: ContextMarkerElement = {
    type: 'context-marker',
    timeSpec,
    activities,
    children: [{ text: '' }],
  };
  
  return marker;
};

// 渲染时读取 TimeSpec
const TimeDisplay: React.FC<{ timeSpec: TimeSpec }> = ({ timeSpec }) => {
  const { start } = timeSpec.resolved;
  
  return (
    <span className="text-xs text-gray-500 font-mono">
      {start.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      })}
    </span>
  );
};
```

### 10.3 版本控制的时间处理

```typescript
// 版本快照创建时的时间处理
class VersionControlService {
  async createVersion(trigger: VersionTriggerType): Promise<EventLogVersion> {
    const timelog = await db.timelogs.findById(this.timelogId);
    
    // timestamp 字段使用本地时间字符串
    // 内容中的 ContextMarker 都包含完整的 TimeSpec
    const version: EventLogVersion = {
      id: uuidv4(),
      timestamp: formatTimeForStorage(new Date()), // 版本创建时间
      content: timelog.content, // 包含带 TimeSpec 的 ContextMarker
      triggerType: trigger,
      changesSummary: this.generateChangesSummary(this.pendingOperations),
      contentHash: this.hashContent(timelog.content),
    };
    
    await db.versions.insert(version);
    return version;
  }
}
```

### 10.4 同步时的时间处理

```typescript
// 同步到 Outlook 时的序列化
const serializeContextMarker = (marker: ContextMarkerElement): string => {
  const { timeSpec, activities } = marker;
  const { start } = timeSpec.resolved;
  
  // 🎯 使用 TimeHub 格式化时间显示
  const timeStr = TimeHub.formatRelativeTime(start);  // "14:30" 或 "2小时前"
  
  // 活动摘要
  const activityStr = activities
    .map(a => `${a.appName} (${formatDuration(a.duration)})`)
    .join(', ');
  
  // 生成 HTML（用于 Outlook）
  // ✅ 策略：在 data-timespec 中嵌入完整 TimeSpec JSON
  // 好处：往返同步时不丢失 kind/rawText/policy 等元数据
  const timeSpecJson = JSON.stringify({
    ...marker.timeSpec,
    // 🎯 使用 TimeHub 格式化 Date 对象为本地时间字符串
    start: TimeHub.formatTimestamp(timeSpec.start),
    end: TimeHub.formatTimestamp(timeSpec.end),
    resolved: {
      start: TimeHub.formatTimestamp(timeSpec.resolved.start),
      end: TimeHub.formatTimestamp(timeSpec.resolved.end),
    }
  });
  
  return `
    <div class="context-marker" data-timespec="${escapeHTML(timeSpecJson)}">
      <strong>${timeStr}</strong>
      <p>活动: ${activityStr}</p>
    </div>
  `;
};

// 从 Outlook 反序列化时
const deserializeContextMarker = (html: string): ContextMarkerElement | null => {
  const div = parseHTML(html);
  const timeSpecJson = div.getAttribute('data-timespec');
  
  if (!timeSpecJson) {
    console.warn('缺失 data-timespec 属性，无法还原 ContextMarker');
    return null;
  }
  
  try {
    // 解析 JSON
    const timeSpecData = JSON.parse(timeSpecJson);
    
    // 🎯 使用 TimeHub 解析本地时间字符串为 Date 对象
    const timeSpec: TimeSpec = {
      ...timeSpecData,
      start: TimeHub.parseTimestamp(timeSpecData.start),
      end: TimeHub.parseTimestamp(timeSpecData.end),
      resolved: {
        start: TimeHub.parseTimestamp(timeSpecData.resolved.start),
        end: TimeHub.parseTimestamp(timeSpecData.resolved.end),
      },
    };
    
    return {
      type: 'context-marker',
      timeSpec,
      activities: parseActivitiesFromHTML(div),
      children: [{ text: '' }],
    };
  } catch (error) {
    console.error('解析 TimeSpec 失败:', error);
    return null;
  }
};

/**
 * ⚠️ 关键设计决策：为什么在 HTML 中嵌入 TimeSpec JSON？
 * 
 * **问题**: Outlook 的 body.content 是 HTML，如何保留 TimeSpec 的元数据？
 * 
 * **方案对比**:
 * 
 * ❌ 方案 A: 只存储 ISO 时间戳
 * ```html
 * <div data-time="2025-11-13T10:30:00Z">
 * ```
 * 缺点：往返同步时丢失 kind('fuzzy'), rawText('下周'), policy 等信息
 * 
 * ✅ 方案 B: 嵌入完整 TimeSpec JSON (当前方案)
 * ```html
 * <div data-timespec='{"kind":"fuzzy","rawText":"下周",...}'>
 * ```
 * 优点：
 * - 保留所有元数据（kind, rawText, policy）
 * - 往返同步无损
 * - 符合 Time Architecture 原则
 * 
 * **Outlook 兼容性测试结果**:
 * - ✅ Outlook Desktop (Windows/Mac): 保留 data-* 属性
 * - ✅ Outlook Web: 保留 data-* 属性
 * - ⚠️ Outlook Mobile: 可能被过滤（降级为 kind='fixed'）
 * 
 * **降级策略**:
 * 如果 data-timespec 丢失，使用显示文本中的时间创建简单 TimeSpec：
 * ```typescript
 * const fallbackTimeSpec: TimeSpec = {
 *   kind: 'fixed',
 *   source: 'import',
 *   start: TimeHub.parseTimestamp(extractTimeFromText(div.textContent)),
 *   // ...
 * };
 * ```
 */
```

### 10.5 迁移清单

如果在代码中发现以下模式，需要立即修正：

- [ ] `timestamp: string` → `timeSpec: TimeSpec`
- [ ] `new Date().toISOString()` → `TimeHub.setEventTime()` 或创建 `TimeSpec` 对象
- [ ] 直接修改 `event.startTime` → 使用 `TimeHub.setEventTime(eventId, ...)`
- [ ] 手动解析日期字符串 → 使用 `TimeParsingService.parse()`
- [ ] 手动计算时间窗口 → 使用 `TimeSpec.window` 和 `policy`
- [ ] 直接读取 `event.startTime` → 使用 `useEventTime(eventId)` Hook

### 10.6 相关文档

- **[TIME_ARCHITECTURE.md](../TIME_ARCHITECTURE.md)** - 统一时间架构完整说明
- **[技术规格文档：情境感知时间轴编辑器](./_archive/legacy-docs/features/技术规格文档：情境感知时间轴编辑器.md)** - 原始设计文档（已整合）
- **src/services/TimeHub.ts** - 时间中枢实现
- **src/hooks/useEventTime.ts** - React Hook 实现
- **src/services/TimeParsingService.ts** - 时间解析服务
- **src/services/ActivityService.ts** - 活动监听服务（待实现）

---

## 11. 开发路线图

### Phase 1: 基础 TimeLog 系统（2 周）
- ✅ Slate 编辑器基础配置
- ✅ 基本数据结构（使用 TimeSpec）
- ✅ HTML/纯文本序列化器
- ✅ 本地存储（SQLite）

### Phase 2: 情境感知功能（2 周）
- 🔄 实现 DesktopActivityService（应用监听）
- 🔄 实现自动 ContextMarker 注入逻辑
- 🔄 实现时间轴和活动轴渲染
- 🔄 集成 TimeHub 进行时间管理

### Phase 3: 同步功能（2 周）
- ⏳ Outlook API 认证
- ⏳ SyncEngine 核心逻辑
- ⏳ 冲突检测和解决
- ⏳ 附件上传/下载

### Phase 4: 版本控制（2 周）
- ⏳ VersionControlService 实现
- ⏳ 自动保存机制
- ⏳ 版本历史 UI
- ⏳ 版本恢复功能

### Phase 5: 优化和测试（2 周）
- ⏳ 存储优化（版本压缩）
- ⏳ 离线支持（同步队列）
- ⏳ 性能优化（缓存、懒加载）
- ⏳ 端到端测试

---

## 12. 代码实现状态

### 12.1 核心类型定义

**✅ 已实现** - `src/types.ts` 和 `src/utils/holidays/types.ts`

```typescript
interface Event {
  // ... 其他字段
  
  // 🆕 v1.8: Rich-text description support
  eventlog?: string;     // 富文本日志（HTML 格式，ReMarkable 内部展示用，支持标签、图片等）
  
  // 🆕 Issue #12: Timer ↔ Plan 集成
  parentEventId?: string;   // 父事件 ID（用于 Timer 子事件关联）
  timerLogs?: string[];     // 计时日志（子 Timer 事件 ID 列表）
}
```

**说明**：
- 当前代码使用简化版 `eventlog?: string` 字段（HTML 字符串）
- PRD 定义的完整版本是对象结构：`eventlog?: { content, descriptionHtml, versions, ... }`
- 迁移计划：Phase 1 完成后逐步升级到完整对象结构

### 12.2 序列化层实现

**✅ 已实现** - `src/components/PlanSlateEditor/serialization.ts`

**功能**：
- `planItemsToSlateNodes()` - 将 Event 数组转换为 Slate 编辑器节点
  - 优先使用 `item.eventlog`（富文本），回退到 `item.description`（纯文本）
  - 支持 Title 行和 Description 行的双行模式
  
- `slateNodesToPlanItems()` - 将 Slate 节点转换回 Event 数组
  - Description 行同时保存到 `eventlog`（HTML）和 `description`（纯文本）
  - 实现双向同步策略，保持两个字段一致

**代码示例**：
```typescript
// 读取时：优先使用 eventlog
const descriptionContent = item.eventlog || item.description;

// 保存时：同时更新两个字段
item.eventlog = newEventlog;      // 富文本 HTML
item.description = newDescription; // 纯文本
```

### 12.3 架构文档

**✅ 已更新** - `docs/TIMELOG_ARCHITECTURE.md`

记录了当前 `eventlog` 字段的使用场景：
- 数据流图展示 `eventlog` 的存储和同步策略
- 代码示例说明如何读写 `eventlog` 字段
- 与 Outlook `description` 的同步关系

### 12.4 待迁移项

**⏳ 计划中** - 从简化版升级到完整对象结构

```typescript
// 当前实现（简化版）
interface Event {
  eventlog?: string;  // HTML 字符串
}

// 目标实现（完整版 - PRD Section 4.1）
interface Event {
  eventlog?: {
    content: Descendant[];           // Slate JSON（主存储）
    descriptionHtml: string;         // 简化 HTML（Outlook 同步）
    descriptionPlainText: string;    // 纯文本（搜索）
    attachments?: Attachment[];      // 媒体附件
    versions?: EventLogVersion[];    // 版本历史
    syncState?: SyncState;           // 同步状态
    createdAt?: Date;
    updatedAt?: Date;
  };
}
```

**迁移步骤**：
1. ✅ 更新类型定义中的字段名（`timelog` → `eventlog`）
2. ✅ 更新序列化层代码使用 `eventlog` 字段
3. ⏳ 实现对象结构的序列化/反序列化
4. ⏳ 添加版本控制支持
5. ⏳ 实现 Outlook 同步逻辑

### 12.5 命名规范总结

**✅ 统一规范**（2025-11-13 更新）：

| 层级 | 命名 | 说明 |
|------|------|------|
| **页面/功能** | TimeLog | 页面名称、功能模块名称 |
| **数据字段** | eventlog | Event 接口中的日志记录字段 |
| **类型定义** | EventLogVersion | 版本历史类型 |
| **UI 状态** | EventLogVisibility | 可见性状态管理 |

**示例**：
- `TimeLog 页面` - 用户访问的页面
- `Event.eventlog` - 数据模型中的字段
- `EventLogVersion[]` - 版本历史数组
- `docs/PRD/TimeLog_&_Description_PRD.md` - 文档名称

---

**文档结束**
