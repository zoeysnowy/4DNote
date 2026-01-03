# bulletLevel vs EventTree 概念澄清文档

> **问题**: bulletLevel 是否创建了 parentEvent 和 childEvent？是否符合 EventTree 定义？  
> **日期**: 2025-12-03  
> **结论**: ❌ **完全不同的概念**，bulletLevel 是视觉层级，EventTree 是数据关系

---

## 🎯 核心结论

**bulletLevel 和 EventTree 是两个完全独立的系统**：

| 维度 | bulletLevel | EventTree |
|------|------------|-----------|
| **层级** | 📋 **视觉层级** | 🌳 **数据层级** |
| **用途** | UI 缩进显示 | 父子事件关系 |
| **存储字段** | `paragraph.bulletLevel` + `EventLine.level` | `parentEventId` + `childEventIds` |
| **作用域** | 单个事件的 eventlog 内部 | 跨事件的关系网络 |
| **创建方式** | 按 Tab 键 | 明确创建子事件 |
| **是否创建新 Event** | ❌ **否** | ✅ **是** |
| **视觉表现** | 项目符号缩进（●○–□▸） | Canvas 画布连接线 |

---

## 📋 bulletLevel - 视觉层级系统

### 1. 定义

**bulletLevel 是 Slate 编辑器内部的段落格式属性**，类似于 Word 中的"增加缩进"功能。

### 2. 数据结构

**位置**: `src/components/PlanSlate/types.ts` L85

```typescript
export interface ParagraphNode {
  type: 'paragraph';
  bullet?: boolean;        // 是否为 bullet 项
  bulletLevel?: number;    // 缩进层级 (0-4)
  children: (TextNode | TagNode | DateMentionNode)[];
}
```

**位置**: `src/components/PlanSlate/types.ts` L21-27

```typescript
export interface EventLineNode {
  type: 'event-line';
  eventId?: string;        // 关联的 Event ID
  lineId: string;          // 行唯一ID
  level: number;           // 缩进层级 (0, 1, 2, ...)
  mode: 'title' | 'eventlog';
  children: ParagraphNode[];
}
```

### 3. 关键特征

#### 特征 1: 只是格式属性

```typescript
// ❌ 错误理解：按 Tab 创建了新的子事件
// ✅ 正确理解：只是修改了段落的 bulletLevel 属性

// 按 Tab 后的数据结构
{
  type: 'event-line',
  eventId: 'event-123',  // ⚠️ 仍然是同一个 event
  level: 1,
  children: [
    {
      type: 'paragraph',
      bullet: true,
      bulletLevel: 1,      // 只是增加了 bulletLevel
      children: [{ text: '二级标题' }]
    }
  ]
}
```

#### 特征 2: 不创建新 Event 记录

```typescript
// bulletLevel 增加时的数据库操作
await EventService.updateEvent('event-123', {
  eventlog: {
    html: '<p data-bullet="true" data-bullet-level="1">二级标题</p>'
  }
});

// ⚠️ 注意：
// - 仍然是同一个 event (event-123)
// - 没有创建新的 Event 记录
// - 只是更新了 eventlog 字段的 HTML
```

### 4. 视觉效果

```
事件 A (eventId: 'event-123')
  ├─ Title: "项目计划"
  └─ EventLog:
       ● 一级任务        <- bulletLevel=0, level=0
         ○ 二级任务      <- bulletLevel=1, level=1  (Tab 创建)
           – 三级任务    <- bulletLevel=2, level=2  (Tab Tab 创建)
```

**CSS 渲染**:
```css
/* Level 1: ● */
.slate-bullet-paragraph[data-level="0"]::before {
  content: '●';
}

/* Level 2: ○ */
.slate-bullet-paragraph[data-level="1"]::before {
  content: '○';
}

/* Level 3: – */
.slate-bullet-paragraph[data-level="2"]::before {
  content: '–';
}
```

---

## 🌳 EventTree - 数据层级系统

### 1. 定义

**EventTree 是真实的父子事件关系**：ADR-001 规定层级结构真相来自 `parentEventId`；`childEventIds` 为 legacy 兼容字段（不维护/不依赖其正确性）。

### 2. 数据结构

**位置**: `src/types.ts` L403-404

```typescript
export interface Event {
  id: string;
  title: EventTitle;
  
  // ===== EventTree 父子关系 =====
  parentEventId?: string;      // 父事件 ID（结构真相）
  childEventIds?: string[];    // legacy-only（不维护/不依赖；必要时仅兼容保留）
  
  // ===== 双向链接（柔性血管）=====
  linkedEventIds?: string[];   // 正向链接
  backlinks?: string[];        // 反向链接
  
  // ===== 事件类型标记 =====
  isTimer?: boolean;           // Timer 子事件
  isTimeLog?: boolean;         // 时间日志
  isOutsideApp?: boolean;      // 外部同步
  isPlan?: boolean;            // 用户计划
}
```

### 3. 关键特征

#### 特征 1: 创建独立的 Event 记录

```typescript
// 创建父事件
const parentEvent = await EventService.createEvent({
  id: 'parent-1',
  title: { simpleTitle: 'Project Ace' },
  isPlan: true
});

// 创建子事件（真正的 EventTree 关系）
const childEvent = await EventService.createEvent({
  id: 'child-1',
  title: { simpleTitle: 'Task 1' },
  parentEventId: 'parent-1',  // ✅ 真正的父子关系
  isPlan: true
});

// 通过 parentEventId 派生子列表（不依赖/不维护 childEventIds）
const allEvents = [parentEvent, childEvent];
const derivedChildren = allEvents.filter(e => e.parentEventId === parentEvent.id);
console.log(derivedChildren.map(e => e.id)); // ['child-1']
console.log(childEvent.parentEventId);  // 'parent-1'
```

#### 特征 2: 数据库中是独立的行

```sql
-- 数据库存储（两条独立记录）

-- 父事件
INSERT INTO events (id, title) 
VALUES ('parent-1', 'Project Ace');

-- 子事件
INSERT INTO events (id, title, parentEventId) 
VALUES ('child-1', 'Task 1', 'parent-1');
```

### 4. 视觉效果（Canvas 画布）

```
Project Ace (parent-1)
    │
    ├─── Task 1 (child-1)
    │     │
    │     └─── Subtask 1.1 (child-1-1)
    │
    └─── Task 2 (child-2)
          │
          └─── Timer Record (timer-1)  [isTimer=true]
```

**Canvas 渲染代码**:
```typescript
// 绘制父子关系连接线
function drawEventTree(ctx: CanvasRenderingContext2D, event: Event, allEvents: Event[]) {
  const children = allEvents.filter(e => e.parentEventId === event.id);
  children.forEach(child => {
    // 绘制连接线（实线，刚性骨架）
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(event.x, event.y);
    ctx.lineTo(child.x, child.y);
    ctx.stroke();
  });
}
```

---

## 🔍 关键区别对比

### 区别 1: 数据独立性

| | bulletLevel | EventTree |
|---|---|---|
| **Event 记录数** | 1 个 | N 个（父 + 子） |
| **数据库行数** | 1 行 | N 行 |
| **eventId** | 相同 | 不同 |
| **独立修改** | ❌ 不可 | ✅ 可以 |

**示例**:

```typescript
// bulletLevel: 修改任何一个段落都会影响整个 eventlog
event.eventlog = `
  <p data-bullet-level="0">一级</p>
  <p data-bullet-level="1">二级</p>
`;
// ⚠️ 两个段落属于同一个 event，无法独立修改时间/标签等

// EventTree: 每个子事件完全独立
parentEvent = { id: 'p1', title: '父事件', startTime: '2025-12-03 10:00' };
childEvent1 = { id: 'c1', title: '子事件1', startTime: '2025-12-03 11:00', parentEventId: 'p1' };
childEvent2 = { id: 'c2', title: '子事件2', startTime: '2025-12-03 14:00', parentEventId: 'p1' };
// ✅ 子事件可以独立设置时间、标签、同步状态等
```

### 区别 2: 用户操作

| 操作 | bulletLevel | EventTree |
|------|------------|-----------|
| 创建方式 | 按 Tab 键 | 右键菜单"创建子事件" |
| 修改标题 | 直接编辑 | 打开 EventEditModal |
| 设置时间 | ❌ 不可（段落无时间） | ✅ 独立设置 |
| 同步 Outlook | ❌ 不可 | ✅ 可以 |
| 添加标签 | 段落内添加 | 事件级别添加 |
| 显示位置 | EventLog 内部 | Plan 列表 + Canvas 画布 |

### 区别 3: 应用场景

| 场景 | 使用系统 |
|------|---------|
| 会议纪要（多个议题） | bulletLevel |
| 任务分解（独立子任务） | EventTree |
| 笔记层级显示 | bulletLevel |
| Timer 计时记录 | EventTree |
| 外部日历同步 | EventTree |
| 文档大纲视图 | bulletLevel |
| 项目层级管理 | EventTree |

---

## 🎨 实际案例对比

### 案例 1: 会议纪要（使用 bulletLevel）

```
事件: "团队周会" (eventId: meeting-1)
  ├─ Title: "团队周会"
  └─ EventLog:
       ● 项目进展讨论        <- bulletLevel=0
         ○ Feature A 完成    <- bulletLevel=1 (Tab)
         ○ Feature B 延期    <- bulletLevel=1 (Tab)
       ● 下周计划安排        <- bulletLevel=0
         ○ Sprint 冲刺       <- bulletLevel=1 (Tab)
           – 代码审查        <- bulletLevel=2 (Tab Tab)
           – 测试验收        <- bulletLevel=2 (Tab Tab)

数据库存储:
{
  id: 'meeting-1',
  title: { simpleTitle: '团队周会' },
  eventlog: {
    html: `
      <p data-bullet-level="0">项目进展讨论</p>
      <p data-bullet-level="1">Feature A 完成</p>
      <p data-bullet-level="1">Feature B 延期</p>
      <p data-bullet-level="0">下周计划安排</p>
      <p data-bullet-level="1">Sprint 冲刺</p>
      <p data-bullet-level="2">代码审查</p>
      <p data-bullet-level="2">测试验收</p>
    `
  }
  // ⚠️ 只有 1 个 Event 记录，7 个段落都是格式属性
}
```

### 案例 2: 项目任务分解（使用 EventTree）

```
事件树结构:
Project Ace (id: project-1) - 父事件
    │
    ├─── Feature A (id: feature-a) - 子事件 1
    │     │ parentEventId: 'project-1'
    │     │
    │     ├─── 前端开发 (id: task-a1) - 孙事件
    │     │     parentEventId: 'feature-a'
    │     │
    │     └─── 后端开发 (id: task-a2)
    │           parentEventId: 'feature-a'
    │
    └─── Feature B (id: feature-b) - 子事件 2
          │ parentEventId: 'project-1'
          │
          └─── Timer Record (id: timer-1) - 计时记录
                parentEventId: 'feature-b'
                isTimer: true

数据库存储（5 条独立记录）:

INSERT INTO events (id, title, childEventIds) 
VALUES ('project-1', 'Project Ace', '["feature-a", "feature-b"]');

INSERT INTO events (id, title, parentEventId, childEventIds) 
VALUES ('feature-a', 'Feature A', 'project-1', '["task-a1", "task-a2"]');

INSERT INTO events (id, title, parentEventId) 
VALUES ('task-a1', '前端开发', 'feature-a');

INSERT INTO events (id, title, parentEventId) 
VALUES ('task-a2', '后端开发', 'feature-a');

INSERT INTO events (id, title, parentEventId, childEventIds, isTimer) 
VALUES ('feature-b', 'Feature B', 'project-1', '["timer-1"]', FALSE);

INSERT INTO events (id, title, parentEventId, isTimer) 
VALUES ('timer-1', 'Timer Record', 'feature-b', TRUE);
```

---

## 📊 技术实现对比

### bulletLevel 实现

**文件**: `src/components/PlanSlate/PlanSlate.tsx` L2513-2617

```typescript
// Tab 键处理：只修改属性，不创建新 Event
if (event.key === 'Tab' && !event.shiftKey) {
  const currentBulletLevel = paragraph.bulletLevel || 0;
  const newBulletLevel = Math.min(currentBulletLevel + 1, 4);
  
  // ✅ 只修改 Slate 节点属性
  Transforms.setNodes(editor, { bulletLevel: newBulletLevel } as any, ...);
  Transforms.setNodes(editor, { level: newBulletLevel } as unknown as Partial<Node>, ...);
  
  // ❌ 不调用 EventService.createEvent()
  // ❌ 不创建新的数据库记录
}
```

**序列化**: `src/components/PlanSlate/serialization.ts` L466-479

```typescript
// 保存时：转换为 HTML 属性
const bullet = para.bullet;
const bulletLevel = para.bulletLevel || 0;

if (bullet) {
  return `<p data-bullet="true" data-bullet-level="${bulletLevel}">${html}</p>`;
}

// ⚠️ 保存到同一个 event.eventlog 字段
item.eventlog = (item.eventlog || '') + paragraphHtml;
```

### EventTree 实现

**文件**: `src/services/EventService.ts`（父子关系以 `parentEventId` 为结构真相）

```typescript
class EventService {
  // 创建事件时自动维护父子关系
  async createEvent(event: Partial<Event>): Promise<Event> {
    // ✅ 创建新的 Event 记录
    const newEvent = { ...event, id: generateEventId() };
    await db.insert('events', newEvent);
    // ADR-001：不维护 childEventIds。需要子列表时应通过 parentEventId 派生/查询。
    
    return newEvent;
  }
}
```

---

## 🚀 最佳实践建议

### 何时使用 bulletLevel？

✅ **适合场景**:
- 会议纪要（多个议题点）
- 文档大纲（章节层级）
- 任务步骤说明（操作流程）
- 笔记内容结构化

❌ **不适合场景**:
- 需要独立时间的子任务
- 需要同步到外部日历的子事件
- 需要独立标签/状态的子项
- Timer 计时记录

### 何时使用 EventTree？

✅ **适合场景**:
- 项目任务分解（独立子任务）
- Timer 计时记录（父任务 + Timer 子事件）
- 外部日历同步（父事件 + 同步子事件）
- 需要独立管理的子事件

❌ **不适合场景**:
- 纯文本笔记层级
- 会议纪要议题列表
- 不需要独立时间的内容结构

---

## 🔗 相关文档

- [BULLET_LEVEL_SYNC_BUG_FIX.md](BULLET_LEVEL_SYNC_BUG_FIX.md) - bulletLevel 同步 Bug 修复
- [EVENTTREE_MODULE_PRD.md](../PRD/EVENTTREE_MODULE_PRD.md) - EventTree 模块 PRD
- [EVENTTREE_UNIFIED_DESIGN.md](../architecture/EVENTTREE_UNIFIED_DESIGN.md) - EventTree 统一架构
- [SLATEEDITOR_PRD.md](../PRD/SLATEEDITOR_PRD.md) - Slate 编辑器 PRD

---

## 💡 总结

| 问题 | 答案 |
|------|------|
| **bulletLevel 是否创建新 Event？** | ❌ 否，只是段落格式属性 |
| **bulletLevel 是否属于 EventTree？** | ❌ 否，完全不同的系统 |
| **Tab 键是否创建父子事件？** | ❌ 否，只是增加缩进层级 |
| **bulletLevel 是否存储 parentEventId？** | ❌ 否，没有父子关系字段 |
| **bulletLevel 是否在数据库创建新行？** | ❌ 否，只更新 eventlog 字段 |

**核心要点**:
- 🎨 **bulletLevel = 视觉格式**（类似 Word 缩进）
- 🌳 **EventTree = 数据关系**（真正的父子事件）
- 🔑 **判断标准**: 是否创建了新的 Event 记录？
  - bulletLevel: ❌ 否
  - EventTree: ✅ 是

---

**文档版本**: v1.0  
**创建日期**: 2025-12-03  
**维护者**: GitHub Copilot
