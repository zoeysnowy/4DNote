markdown
# PRD: EventTree 拖拽调度功能 (Drag-to-Schedule)

## 1. 功能概述 (Overview)
本功能旨在实现“时间块规划”的核心交互。用户可以从左侧的 **EventTree 面板**（基于 Slate 编辑器）中，通过拖拽手柄（Drag Handle），将单个任务节点（Block）拖入右侧的 **TimeCalendar 日历视图**中。

拖拽完成后，该任务将在日历对应时间点生成一个具体的**日程块（TimeBlock）**，并建立双向关联。

---

## 2. 用户交互流程 (User Flow)

1.  **悬停 (Hover)**: 用户鼠标悬停在左侧 Slate 编辑器的某一行任务（Event Node）上。
2.  **显现 (Reveal)**: 该行左侧出现“拖拽手柄”（Drag Handle，图标 `⋮⋮`）。
3.  **拖拽 (Drag)**: 用户按住手柄开始拖动。
    *   被拖动的元素半透明跟随鼠标。
    *   左侧原任务保持可见（或变灰，取决于 UI 偏好，暂定保持可见）。
4.  **放置 (Drop)**: 用户将元素拖至右侧日历的特定时间格（例如：2025-11-20 14:00）。
5.  **生成 (Create)**:
    *   日历在 14:00 - 15:00（默认时长）生成一个新的日程块。
    *   日程块标题自动填充为任务文本。
    *   左侧 Slate 任务状态更新（可选：标记为“已调度”）。

---

## 3. 技术规范 (Technical Specifications)

### 3.1 前端技术栈假设
*   **Editor**: Slate.js (React)
*   **Calendar**: FullCalendar / React-Big-Calendar / 自研 Grid (本 PRD 以通用 HTML5 DnD API 为标准)
*   **Drag & Drop Lib**: `@dnd-kit/core` 或原生 HTML5 Drag API (推荐原生 API 以适配 FullCalendar `interactionPlugin`)

### 3.2 数据结构 (Data Model)

#### Slate Node (EventTree)
需要在 Slate 的 Element 属性中扩展 ID 和 Type。
```typescript  
interface SlateEventNode {  
  id: string;          // UUID, 必须唯一  
  type: 'event-block';  
  children: [{ text: string }];  
  scheduled?: boolean; // 标记是否已调度  
  refEventId?: string; // 关联的日历 Event ID (可选)  
}
```

#### Calendar Event (TimeBlock)
```typescript
interface CalendarEvent {
  id: string;          // UUID
  title: string;       // 来自 Slate Node 的文本
  start: Date;         // Drop 的时间
  end: Date;           // Start + 默认时长
  sourceNodeId: string;// 关键：关联回 Slate Node 的 ID
  color?: string;      // 继承任务标签颜色
}
```

---

## 4. 详细实现步骤 (Implementation Steps)
### 步骤 1: 改造 Slate 组件 (Draggable Element)
**目标**: 让 Slate 的每一个 Block 变为可拖拽源。

- 创建一个 `DraggableBlockWrapper` 组件。
- 在组件左侧添加 `<DragHandle />`。
- 利用 HTML5 `draggable="true"` 属性。
- **关键逻辑**: 在 `onDragStart` 事件中封装数据。

```javascript
// 伪代码示例
const onDragStart = (event, node) => {
  event.dataTransfer.effectAllowed = 'copy';
  
  // 序列化传输数据
  const payload = JSON.stringify({
    id: node.id,
    title: Node.string(node), // 获取纯文本
    duration: 60, // 默认 60 分钟
    type: 'slate-event-item'
  });
  
  // 必须设置标准 MIME type，以便日历组件识别
  event.dataTransfer.setData('application/x-event-drag', payload);
  
  // 如果使用 FullCalendar，可能需要设置特定的纯文本格式
  event.dataTransfer.setData('text/plain', JSON.stringify(payload));
};
```

### 步骤 2: 改造日历组件 (Droppable Area)
**目标**: 让日历能识别并接收来自 Slate 的数据。

- 监听日历容器的 `onDragOver` 事件，执行 `event.preventDefault()` 以允许放置。
- 监听 `onDrop` 事件。

```javascript
// 伪代码示例
const onCalendarDrop = (info) => {
  // info 包含 drop 的日期和时间 (dateStr)
  
  const rawData = info.dragEvent.dataTransfer.getData('application/x-event-drag');
  if (!rawData) return;

  const { id, title, duration } = JSON.parse(rawData);
  
  // 调用创建日程 API
  createCalendarEvent({
    sourceNodeId: id // 建立关联
  });
};
```

### 步骤 3: 视觉反馈 (Visual Feedback)
- **DragHandle**: 平时 `opacity: 0`，Hover 时 `opacity: 1`。
- **Cursor**: 拖拽时鼠标变为 `grabbing`。
- **Ghost Image**: 拖拽时显示的半透明影子，应仅包含任务文本，尽量去除杂乱的 UI 元素。

---
- **无文本节点**: 如果 Slate 节点为空文本，禁止拖拽或给予提示。
- **重复调度**:
  - 如果同一个 Task 被拖入日历两次，生成两个独立的 Event（允许）。
  - 可选策略: 如果业务逻辑限制一对一，则拖拽后禁用 Handle。
- **拖拽取消**: 用户拖出编辑器但未在日历松手，不做任何操作。
- **层级处理**: 仅拖拽当前节点，不包含其子节点（Slate Children）。仅提取当前行的 Text。

---

## 6. Copilot Prompt 指令
如果同一个 Task 被拖入日历两次，生成两个独立的 Event（允许）。
可选策略: 如果业务逻辑限制一对一，则拖拽后禁用 Handle。
如果你使用 Copilot 辅助编程，请使用以下 Prompt:

> "我们需要在现有的 Slate 编辑器和日历视图之间实现拖拽调度功能。
>
> 1. 请修改 Slate 的 `renderElement`，为每个 `'event-block'` 类型的节点添加一个 Draggable Handle。
> 2. 使用 HTML5 Drag API，在 `onDragStart` 中传输节点的 ID 和纯文本内容。
> 3. 在日历组件的 Drop Handler 中，解析这些数据并在对应时间创建一个新的 Event。
> 4. 请确保处理好 `dataTransfer` 的格式，以便 FullCalendar (或其他日历库) 能正确识别。"

---

## 📥 如何使用

1. 复制上方代码块的内容。
2. 保存为 `.md` 文件。
3. 在你的 IDE (VS Code / Cursor) 中打开该文件作为上下文，告诉 AI："基于这个 PRD 文档，帮我实现第一步：改造 Slate 组件。"

---

*本文档遵循标准 PRD 格式，适用于前端开发团队协作。*
2.  保存为 `.md` 文件。  
3.  在你的 IDE (VS Code / Cursor) 中打开该文件作为上下文，告诉 AI：“基于这个 PRD 文档，帮我实现第一步：改造 Slate 组件。”
Go further——in-depth analysis with Deep Research