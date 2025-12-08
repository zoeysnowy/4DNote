# 🌳 EventTree 模块 PRD

**版本**: v1.0  
**创建日期**: 2025-12-02  
**维护者**: GitHub Copilot  
**状态**: ✅ 生产环境

---

## 📊 模块概述

EventTree 是 ReMarkable 的核心模块，负责管理事件之间的层级关系（父子关系）和柔性关联（双向链接），提供可视化的事件树结构展示。

### 核心能力

- 🌳 **层级管理**: 父子事件关系（刚性骨架）
- 🔗 **双向链接**: 事件间柔性关联（Bidirectional Links）
- 🎨 **可视化渲染**: Canvas 画布动态绘制事件树
- ⚡ **自动维护**: 父子关系自动同步
- 🎯 **类型区分**: Timer、TimeLog、外部同步事件等

---

## 🏗️ 架构设计

### 1. 数据结构

#### 统一字段设计（v2.16+）

```typescript
export interface Event {
  // ===== 层级关系（刚性骨架）=====
  parentEventId?: string;      // 父事件 ID
  childEventIds?: string[];    // 所有子事件 ID（统一字段）
  
  // ===== 双向链接（柔性血管）=====
  linkedEventIds?: string[];   // 正向链接（我链接的事件）
  backlinks?: string[];        // 反向链接（链接我的事件）
  
  // ===== 事件类型标记 =====
  isTimer?: boolean;           // Timer 计时记录
  isTimeLog?: boolean;         // 时间日志
  isOutsideApp?: boolean;      // 外部应用同步
  isPlan?: boolean;            // 用户计划事件
  isTask?: boolean;            // 任务类型
  
  // ===== 其他核心字段 =====
  id: string;
  title: string | EventLog;
  start_time?: string;
  end_time?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}
```

#### 设计原则

**单一字段管理所有子事件** (Single Field Design)
- ✅ **统一存储**: `childEventIds` 存储所有类型的子事件
- ✅ **类型标记**: 通过 `isTimer`, `isTimeLog` 等布尔字段区分类型
- ✅ **避免碎片化**: 不再使用 `timerLogs`, `userSubTaskIds` 等分散字段

**刚性骨架 vs 柔性血管** (Vessels as Stacks)
- 🦴 **刚性骨架**: 父子关系（`parentEventId` ↔ `childEventIds`）
  - 占据画布空间
  - 用 line + link 标记显示
  - 严格的层级结构
  
- 🔗 **柔性血管**: 双向链接（`linkedEventIds` ↔ `backlinks`）
  - 不占画布空间
  - 堆叠在主节点背后
  - Hover 展开显示
  - 柔性引用关系

---

### 2. 核心组件

#### 2.1 EventTree Canvas 渲染

**文件**: `src/components/EventTree/EventTreeCanvas.tsx`

**功能**:
- Canvas 画布渲染事件节点和连接线
- 动态布局算法（递归计算坐标）
- 鼠标交互（拖拽、缩放、Hover）
- 性能优化（虚拟滚动、节点剪裁）

#### 2.2 EventRelationSummary

**文件**: `src/components/EventTree/EventRelationSummary.tsx`

**功能**:
- 显示事件的关系摘要（父节点、子节点、链接数量）
- 支持快速导航到关联事件
- 预览关联事件的基本信息

#### 2.3 EditableEventTree (v2.18+)

**文件**: `src/components/EventTree/EditableEventTree.tsx` (344 lines)

**功能**:
- ✅ **树形结构编辑器**: 递归渲染事件树，支持无限层级
- ✅ **每节点独立 Slate 编辑器**: 每个节点 title 可独立编辑
- ✅ **L 型连接线**: CSS 绝对定位实现树形连接线
- ✅ **折叠/展开**: ChevronDown/Right 图标控制子节点显示
- ✅ **Link 按钮悬浮**: 右对齐 Link 按钮，Tippy.js 定位链接堆叠卡片
- ✅ **递归加载**: `buildTree()` 递归加载所有 `childEventIds`
- ✅ **实时更新**: Slate onChange 防抖 500ms 保存到数据库
- ✅ **LinkedCard 堆叠**: 纵向堆叠展示双向链接，Tippy 定位避免模态框裁剪

**核心代码**:
```typescript
const TreeNodeItem: React.FC<TreeNodeProps> = ({ node, depth }) => {
  // 1. 独立 Slate 编辑器
  const [editor] = useState(() => withReact(createEditor()));
  
  // 2. 防抖保存
  const handleChange = useMemo(() => 
    debounce(async (value: Descendant[]) => {
      const newTitle = serialize(value);
      await EventService.updateEvent(node.event.id, {
        title: { fullTitle: newTitle }
      });
    }, 500),
    [node.event.id]
  );
  
  // 3. 递归渲染子节点
  return (
    <div className="tree-node">
      <div className="tree-line" />
      <div className="tree-connector" />
      
      <div className="tree-content">
        <button onClick={toggleOpen}>
          {hasChildren ? <ChevronDown /> : <Circle />}
        </button>
        
        <Slate editor={editor} initialValue={slateValue} onChange={handleChange}>
          <Editable placeholder="输入标题..." />
        </Slate>
        
        <div className="link-button-container">
          <LinkButton eventId={node.event.id} />
        </div>
      </div>
      
      {isOpen && children.map(child => (
        <TreeNodeItem key={child.event.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};
```

**递归加载逻辑**:
```typescript
const buildTree = async (event: Event, depth: number = 0): Promise<TreeNode> => {
  const children: TreeNode[] = [];
  
  if (event.childEventIds && event.childEventIds.length > 0) {
    for (const childId of event.childEventIds) {
      const child = await EventService.getEventById(childId);
      if (child && EventService.shouldShowInEventTree(child)) {
        // 🔥 递归加载子事件的子事件
        const childNode = await buildTree(child, depth + 1);
        children.push(childNode);
      }
    }
  }
  
  return { event, children, isOpen: true };
};
```

**Link 按钮与 LinkedCard (v2.18.1)**:
```tsx
{/* Tippy.js 定位 LinkedCard 堆叠 */}
{linkedEvents.length > 0 && (
  <Tippy
    content={
      <div className="linked-cards-stack">
        {linkedEvents.map((linkedEvent, index) => (
          <LinkedCard
            key={linkedEvent.id}
            event={linkedEvent}
            index={index}
            isHovered={true}
            onClick={() => onEventClick?.(linkedEvent)}
          />
        ))}
      </div>
    }
    interactive={true}
    placement="right-end"  // 🎯 从按钮右下角开始对齐
    theme="light-border"
    offset={[8, 0]}        // 8px 横向间距
    appendTo={() => document.body}  // 避免被 EventEditModal 裁剪
    zIndex={9999}
  >
    <button className="link-button">
      <LinkIcon size={14} />
      <span>{linkedEvents.length}</span>
    </button>
  </Tippy>
)}
```

**LinkedCard 纵向堆叠** (`src/components/EventTree/LinkedCard.tsx`):
```typescript
// 展开态：卡片纵向堆叠展开，间隔 80px
const yOffset = isHovered ? index * 80 : (index + 1) * 4; // 第一张从 0 开始
```

**关键配置**:
- `placement="right-end"`: Tippy 从按钮右下角开始对齐
- `yOffset = index * 80`: 第一张卡片 yOffset=0，紧贴按钮
- `appendTo={() => document.body}`: 渲染到 body，避免 EventEditModal 的 overflow 裁剪

#### 2.4 EventTreeViewer

**文件**: `src/components/EventTree/EventTreeViewer.tsx`

**功能**:
- 只读模式的事件树查看器
- 支持展开/折叠节点
- 支持搜索和过滤
- 轻量级渲染

---

### 3. EventService API

#### 层级管理

```typescript
class EventService {
  // 创建事件时自动维护父子关系
  async createEvent(event: Partial<Event>): Promise<Event>
  
  // 更新事件时自动同步父子关系
  async updateEvent(id: string, updates: Partial<Event>): Promise<Event>
  
  // 删除事件时自动清理父子引用
  async deleteEvent(id: string): Promise<void>
  
  // 获取子事件列表
  async getChildEvents(parentId: string): Promise<Event[]>
  
  // 获取事件的完整树结构
  async getEventTree(rootId: string): Promise<EventTreeNode>
}
```

#### 双向链接管理（v2.17+）

```typescript
class EventService {
  // 创建双向链接
  async addLink(fromEventId: string, toEventId: string): Promise<void>
  
  // 删除双向链接
  async removeLink(fromEventId: string, toEventId: string): Promise<void>
  
  // 获取正向链接的事件列表
  async getLinkedEvents(eventId: string): Promise<Event[]>
  
  // 获取反向链接的事件列表（谁链接了我）
  async getBacklinks(eventId: string): Promise<Event[]>
  
  // 刷新所有 backlinks（全量计算）
  async refreshAllBacklinks(): Promise<void>
}
```

---

## 🔄 自动维护机制

### 1. 父子关系自动同步

#### 创建事件
```typescript
// 创建子事件时
if (event.parentEventId) {
  // 自动添加到父事件的 childEventIds
  parentEvent.childEventIds = [...(parentEvent.childEventIds || []), event.id];
}
```

#### 更新事件
```typescript
// 修改 parentEventId 时
if (updates.parentEventId !== oldEvent.parentEventId) {
  // 1. 从旧父事件移除
  if (oldEvent.parentEventId) {
    removeFromParent(oldEvent.parentEventId, event.id);
  }
  
  // 2. 添加到新父事件
  if (updates.parentEventId) {
    addToParent(updates.parentEventId, event.id);
  }
}
```

#### 删除事件
```typescript
// 删除事件时
// 1. 从父事件的 childEventIds 中移除
if (event.parentEventId) {
  parentEvent.childEventIds = parentEvent.childEventIds.filter(id => id !== event.id);
}

// 2. 递归删除所有子事件（可选）
if (event.childEventIds?.length) {
  for (const childId of event.childEventIds) {
    await deleteEvent(childId);
  }
}
```

### 2. 父子关系自动维护（v2.18+）

#### 触发时机
- **创建事件**: 在 `EventHub.createEvent()` 时传入 `parentEventId`
- **更新事件**: 调用 `EventService.updateEvent()` 修改 `parentEventId`
- **Tab 键缩进**: PlanManager 中按 Tab 键建立父子关系
- **Shift+Tab 反缩进**: 解除父子关系或改变层级

#### 双向维护逻辑
```typescript
// EventService.updateEvent() 自动维护
async updateEvent(eventId: string, updates: Partial<Event>) {
  const originalEvent = await this.getEventById(eventId);
  const filteredUpdates = { ...updates }; // 过滤 undefined 字段
  
  // 🔥 检测 parentEventId 变化
  if (filteredUpdates.parentEventId !== undefined) {
    const parentHasChanged = 
      filteredUpdates.parentEventId !== originalEvent.parentEventId;
    
    // 1️⃣ 从旧父事件移除（如果父事件变化）
    if (parentHasChanged && originalEvent.parentEventId) {
      const oldParent = await this.getEventById(originalEvent.parentEventId);
      if (oldParent?.childEventIds) {
        await this.updateEvent(oldParent.id, {
          childEventIds: oldParent.childEventIds.filter(id => id !== eventId)
        }, true); // skipSync
      }
    }
    
    // 2️⃣ 添加到新父事件（无论是否变化，都确保包含）
    if (filteredUpdates.parentEventId) {
      const newParent = await this.getEventById(filteredUpdates.parentEventId);
      if (newParent) {
        const childIds = newParent.childEventIds || [];
        
        if (!childIds.includes(eventId)) {
          await this.updateEvent(newParent.id, {
            childEventIds: [...childIds, eventId]
          }, true); // skipSync
        }
      }
    }
  }
}
```

#### PlanManager Tab 键集成
```typescript
// PlanSlate.tsx - Tab 键处理
if (event.key === 'Tab' && !event.shiftKey) {
  const currentEventId = eventLine.eventId;
  const previousEventId = findPreviousEventLine().eventId;
  
  // 🔥 创建新事件时直接设置 parentEventId
  if (currentEventId.startsWith('line-')) {
    await EventHub.createEvent({
      id: currentEventId,
      title: '',
      isPlan: true,
      parentEventId: previousEventId // ✅ 创建时就设置
    });
  } 
  // 🔥 已存在事件则调用 updateEvent
  else {
    await EventService.updateEvent(currentEventId, {
      parentEventId: previousEventId
    });
  }
}
```

### 3. Backlinks 自动计算

#### 触发时机
- 保存 EventLog 时检测 `@mention` 语法
- 调用 `addLink()` API 时
- 定期后台刷新（`refreshAllBacklinks()`）

#### 计算逻辑
```typescript
async function updateBacklinks(fromEventId: string) {
  const fromEvent = await getEvent(fromEventId);
  const linkedIds = fromEvent.linkedEventIds || [];
  
  // 为每个被链接的事件添加 backlink
  for (const toEventId of linkedIds) {
    const toEvent = await getEvent(toEventId);
    if (!toEvent.backlinks) toEvent.backlinks = [];
    
    if (!toEvent.backlinks.includes(fromEventId)) {
      toEvent.backlinks.push(fromEventId);
      await updateEvent(toEventId, { backlinks: toEvent.backlinks });
    }
  }
}
```

---

## 📐 可视化设计规范

### 1. 节点样式

#### 主节点（Plan）
```css
.event-node.plan {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
  min-width: 200px;
  padding: 16px;
}
```

#### Timer 节点
```css
.event-node.timer {
  background: #fff;
  border: 2px dashed #3498db;
  border-radius: 8px;
  opacity: 0.8;
  font-size: 0.9em;
}
```

#### 外部同步节点
```css
.event-node.outside-app {
  background: #f8f9fa;
  border: 2px solid #6c757d;
  border-left: 4px solid #28a745; /* 绿色标记 */
}
```

### 2. 连接线样式

#### 父子关系（刚性）
```typescript
// 实线，带箭头
ctx.strokeStyle = '#000';
ctx.lineWidth = 2;
ctx.setLineDash([]);
drawArrow(fromX, fromY, toX, toY);
```

#### 双向链接（柔性）
```typescript
// 虚线，双向箭头
ctx.strokeStyle = '#999';
ctx.lineWidth = 1;
ctx.setLineDash([5, 5]);
drawDoubleArrow(fromX, fromY, toX, toY);
```

### 3. 交互行为

| 操作 | 行为 |
|------|------|
| 单击节点 | 打开 EventEditModal |
| 双击节点 | 快速编辑标题 |
| 拖拽节点 | 调整位置（保存到坐标字段） |
| Hover 节点 | 显示子节点和链接预览卡片 |
| Ctrl + 拖拽 | 创建链接 |
| 右键节点 | 上下文菜单（复制、删除、标记等） |

---

## 🎯 使用场景

### 场景 1: Timer 计时

```typescript
// 用户启动 Timer
const parentEvent = { id: 'parent-1', title: 'Project Ace' };

// 自动创建 Timer 子事件
const timerEvent = {
  id: 'timer-1',
  title: 'Timer Record',
  parentEventId: 'parent-1',  // 指向父事件
  isTimer: true,               // 标记为 Timer
  start_time: '2025-12-02T10:00:00Z',
  end_time: '2025-12-02T11:00:00Z'
};

await EventService.createEvent(timerEvent);
// 自动添加到 parentEvent.childEventIds
```

### 场景 2: 外部日历同步

```typescript
// 从 Outlook 同步事件
const syncedEvent = {
  id: 'outlook-1',
  title: 'Team Meeting',
  parentEventId: 'project-123',  // 关联到本地项目
  isOutsideApp: true,            // 标记为外部事件
  sourceAccount: 'outlook',
  sourceEventId: 'AAMk...'
};

await EventService.createEvent(syncedEvent);
// 自动维护父子关系
```

### 场景 3: 双向链接

```typescript
// 在事件 A 的 EventLog 中输入 "@Project Ace"
// 系统自动检测并创建链接
await EventService.addLink('event-a', 'project-ace');

// 结果：
// event-a.linkedEventIds = ['project-ace']
// project-ace.backlinks = ['event-a']
```

---

## 🔍 数据完整性保证

### 1. 一致性检查

```typescript
// 定期检查父子关系一致性
async function validateEventTree() {
  const allEvents = await EventService.getAllEvents();
  
  for (const event of allEvents) {
    // 检查1: childEventIds 中的事件是否存在且 parentEventId 正确
    if (event.childEventIds) {
      for (const childId of event.childEventIds) {
        const child = allEvents.find(e => e.id === childId);
        if (!child || child.parentEventId !== event.id) {
          console.error(`Integrity error: Child ${childId} mismatch`);
        }
      }
    }
    
    // 检查2: parentEventId 指向的父事件是否存在
    if (event.parentEventId) {
      const parent = allEvents.find(e => e.id === event.parentEventId);
      if (!parent) {
        console.error(`Integrity error: Parent ${event.parentEventId} not found`);
      }
    }
  }
}
```

### 2. 循环依赖检测

```typescript
// 防止创建循环父子关系
async function detectCycle(eventId: string, proposedParentId: string): Promise<boolean> {
  let current = proposedParentId;
  const visited = new Set<string>();
  
  while (current) {
    if (current === eventId) return true; // 检测到循环
    if (visited.has(current)) return true; // 检测到循环
    visited.add(current);
    
    const parent = await EventService.getEvent(current);
    current = parent?.parentEventId;
  }
  
  return false; // 无循环
}
```

---

## 📈 性能优化

### 1. 查询优化

#### 索引策略
```sql
-- SQLite 索引
CREATE INDEX idx_events_parent ON events(parentEventId) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_child_ids ON events(childEventIds) WHERE deleted_at IS NULL;
```

#### 批量查询
```typescript
// 避免 N+1 查询
async function getEventTreeBatch(rootId: string): Promise<EventTreeNode> {
  // 1. 一次性获取所有后代事件
  const allDescendants = await EventService.getDescendants(rootId);
  
  // 2. 内存中构建树结构
  const tree = buildTree(rootId, allDescendants);
  
  return tree;
}
```

### 2. Canvas 渲染优化

#### 虚拟滚动
- 只渲染视口内的节点
- 节点坐标缓存
- requestAnimationFrame 优化

#### 层级剪裁
- 折叠状态下不渲染子节点
- 根据缩放级别调整细节层次（LOD）

---

## 🧪 测试覆盖

### 单元测试

```typescript
// src/services/__tests__/EventService.eventTree.test.ts

describe('EventTree Management', () => {
  test('自动维护父子关系 - 创建', async () => {
    const parent = await createEvent({ title: 'Parent' });
    const child = await createEvent({ 
      title: 'Child', 
      parentEventId: parent.id 
    });
    
    const updatedParent = await getEvent(parent.id);
    expect(updatedParent.childEventIds).toContain(child.id);
  });
  
  test('双向链接创建', async () => {
    const eventA = await createEvent({ title: 'A' });
    const eventB = await createEvent({ title: 'B' });
    
    await addLink(eventA.id, eventB.id);
    
    const updatedA = await getEvent(eventA.id);
    const updatedB = await getEvent(eventB.id);
    
    expect(updatedA.linkedEventIds).toContain(eventB.id);
    expect(updatedB.backlinks).toContain(eventA.id);
  });
});
```

---

## 🚀 版本历史

### v2.16 (2025-12-01)
- ✅ 统一字段架构（`timerLogs` → `childEventIds`）
- ✅ 自动维护父子关系
- ✅ 类型标记系统（`isTimer`, `isTimeLog` 等）

### v2.17 (2025-12-02)
- ✅ 双向链接功能（`linkedEventIds` + `backlinks`）
- ✅ EventService API: `addLink()`, `removeLink()`
- ✅ EventRelationSummary 组件

### v2.18 (2025-12-06) ✅ 已完成
- ✅ **父子关系自动维护**: `updateEvent()` 检测 `parentEventId` 变化，自动同步 `childEventIds`
- ✅ **PlanManager Tab 键集成**: Tab 缩进建立父子关系，Shift+Tab 解除关系
- ✅ **EditableEventTree 组件**: 树形结构编辑器，每个节点独立 Slate 编辑器
- ✅ **递归子事件加载**: `buildTree()` 递归加载所有层级子事件
- ✅ **Link 按钮悬浮卡片**: 显示双向链接的堆叠卡片（Vessels as Stacks）
- ✅ **创建时设置关系**: 新事件创建时直接传入 `parentEventId`，避免二次更新

#### 关键修复
- 🐛 修复 `executeShiftTabOutdent` 函数提升问题
- 🐛 修复 EventEditModalV2 `parentEvent` 未定义问题
- 🐛 确保 `childEventIds` 即使 `parentEventId` 未变化也能正确维护

### v2.19 (计划中)
- ⏳ **单一 Slate 编辑器架构**: 重构 EditableEventTree 使用单一编辑器 + 自定义 `tree-node` 类型，支持跨行选择
- ⏳ **Tippy.js 堆叠卡片定位**: 使用 Tippy 定位双向链接卡片，避免 Modal 溢出问题 ✅ 已实现
- ⏳ Canvas 可视化优化
- ⏳ 拖拽编辑功能
- ⏳ 性能优化（虚拟滚动）

#### 单一编辑器架构设计
参考 PlanSlate 的 `event-line` 实现，EditableEventTree 应该：
1. 使用单一 `<Slate>` 编辑器包含所有节点
2. 定义 `tree-node` 自定义元素类型，包含 `level`, `isOpen`, `eventId` 等属性
3. `renderElement` 渲染函数处理树形视觉（L 型连接线、折叠按钮）
4. 支持跨节点选择和复制
5. Tab/Shift+Tab 调整 `level` 属性而非 `parentEventId`（乐观更新）

---

## 📚 相关文档

- [EventTree 统一架构设计](../architecture/EVENTTREE_UNIFIED_DESIGN.md)
- [双向链接实现](../features/EVENTTREE_BIDIRECTIONAL_LINKS_IMPLEMENTATION.md)
- [EventService API 文档](EVENTSERVICE_MODULE_PRD.md)
- [Storage Architecture](../architecture/STORAGE_ARCHITECTURE.md)

---

**文档维护**: 每次架构调整或功能增强时更新本文档  
**最后更新**: 2025-12-02
