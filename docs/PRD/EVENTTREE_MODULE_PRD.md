---

# 🌳 EventTree 模块 PRD（ADR-001 对齐版）

版本: v2.0（文档重写）  
创建日期: 2025-12-02  
最后更新: 2025-12-30  
维护者: GitHub Copilot  
状态: ✅ 生产环境（以 ADR-001 为准）

---

## 0. 背景与目标

EventTree 负责事件的“树结构关系”和“关联关系”展示/编辑，为 EditModal 的事件树、以及未来的全量事件索引/Library 资源管理器提供基础能力。

本 PRD **以 ADR-001 为最高约束**：

- 结构真相（Source of Truth）: `parentEventId`
- `childEventIds` **不是**真相，且因为无法长期正确维护，已作为 legacy 机制移除/不再依赖
- 统计/索引（Derived Index）: `event_stats`（可重建），用于全量树上下文、快速计数、root 缓存等

---

## 1. 数据模型（ADR-001）

### 1.1 Event（树结构字段）

```ts
export interface Event {
  id: string;
  title: any;

  // ✅ ADR-001: 树结构唯一真相
  parentEventId?: string | null;

  // ✅ 柔性关联（双向链接）
  linkedEventIds?: string[];
  backlinks?: string[];

  // 其他字段省略
}
```

### 1.2 EventStats（派生索引，可重建）

`event_stats` 是轻量索引层，允许重建，不要求 100% 实时完美，但必须可自洽且可修复。

```ts
export interface EventStats {
  id: string;

  // ✅ 与 Event 同步的派生字段（用于索引/计数/快速爬链）
  parentEventId?: string | null;
  rootEventId?: string;

  // 其它统计字段（如 tags 等）
  tags: string[];
}
```

索引要求（IndexedDB）:

- `event_stats.parentEventId`（children 查询）
- `event_stats.rootEventId`（subtree 计数）

---

## 2. 树构建与排序

### 2.1 构树原则

- 任何树遍历、子树展示、层级计算，都必须从 `parentEventId` 推导（`parent -> childrenMap`）
- 不依赖 `childEventIds`

核心实现位置:

- `src/services/EventTree`（TreeEngine / EventTreeAPI）
- UI 侧: `src/components/EventTree/EventTreeSlate.tsx` 使用 `EventTreeAPI.getSubtree(rootId, allEvents)` + `buildTree()`

### 2.2 兄弟排序原则

- 同一个 parent 下的 siblings，使用 `position`（或项目约定的排序字段）稳定排序
- UI 展示顺序应与“视觉顺序”一致，必要时在保存前对同父节点重排 `position`

---

## 3. Stats-backed Tree Context（全量树上下文）

### 3.1 需求

任意事件 `eventId` 都应能在 **不扫描全表** 的前提下得到：

- `rootEventId`（Level0 根节点）
- `subtreeCount`（该 root 下总节点数，含 root 自身）
- `directChildCount`（当前节点的直接子节点数）
- `rootEvent`（根事件对象，可为空）

### 3.2 对外 API

`src/services/EventService.ts`

```ts
EventService.getEventTreeContext(eventId)
// => { rootEventId, subtreeCount, directChildCount, rootEvent }
```

实现要求:

- 优先使用 `event_stats.rootEventId`（缓存）
- 缺失时沿 `parentEventId` 上溯计算，并回写 `event_stats.rootEventId`（path compression）
- `directChildCount` 通过 `event_stats.parentEventId` 索引计数
- `subtreeCount` 通过 `event_stats.rootEventId` 索引计数

### 3.3 写入/同步（create/update）

在 `createEvent/updateEvent` 路径：

- 同步写 `event_stats.parentEventId`
- 同步写 `event_stats.rootEventId`
  - 新建事件：root =（parent 的 root）或自身
  - reparent（parent 改变）：可能引发整棵子树 root 变化

### 3.4 Reparent：子树 rootEventId 传播（BFS）

当某节点 `X` 的 `rootEventId` 因 reparent 发生变化时，需要将 `X` 的所有后代的 `rootEventId` 更新为新 root。

约束:

- **禁止**扫描全表事件
- 只能使用 `event_stats.parentEventId` 索引逐层查 children（BFS）
- 批量 upsert 写回 `event_stats`（bulkPut）
- 必须有 cycle 防护（visited set）

实现位置:

- `src/services/eventTreeStats.ts`:
  - `updateSubtreeRootEventIdUsingStatsIndex(subtreeRootId, newRootEventId)`

---

## 4. UI 集成（EditModal / EventTree）

### 4.1 EditModal：Level0 也必须能打开 EventTree

问题根因（历史）:

- 关联区/树展开按钮的渲染 gate 依赖 `allEvents`（懒加载），导致 Level0 根节点在 `allEvents` 未加载时判断不到“有下级”，从而按钮不出现。

解决方案:

- 使用 `EventService.getEventTreeContext(eventId)` 的 `directChildCount/rootEventId` 做 gate 与 rootId 推导
- `allEvents` 仍然可以在用户真正展开 EventTree 时再加载（避免打开 modal 失焦）

相关文件:

- `src/components/EventEditModal/EventEditModalV2.tsx`

### 4.2 EventTreeViewer / EventTreeSlate

目前主展示以 `EventTreeSlate` 为准：

- `EventTreeViewer` 会将上层已加载的 `events` 快照传给 `EventTreeSlate`，避免组件内部重复 `getAllEvents()` 造成的视图不一致
- `EventTreeSlate` 在未收到 `events` 时，才会自行通过 `EventService.getAllEvents()` 拉全量事件，再用 `EventTreeAPI` 基于 `parentEventId` 构子树

（未来如要进一步优化，可将 UI 侧全量加载替换为分页/按需子树加载，但不在本 PRD 范围）

---

## 5. 测试策略

Vitest 单测覆盖重点：

- `getEventTreeContext` 在 stats 已存在时直接返回正确 root/count
- stats 缺失时能沿 parent 链计算 root 并回写（path compression）
- reparent 引发的子树 root 更新：使用 stats index BFS，且 cycle 不会死循环

建议测试位置:

- `src/services/__tests__/EventService.eventTreeContext.test.ts`

---

## 6. 非目标（Out of Scope）

- 不新增新的页面/复杂 UI
- 不引入新的“自动维护 childEventIds”机制
- 不在此 PRD 里规定 Library 的最终 UI 形态（只提供所需的 tree context 指标）

---

## 7. 关键约束总结（必须遵守）

- `parentEventId` 是唯一树结构真相
- `event_stats` 是派生索引，可重建，不能反向成为真相
- reparent 子树 root 传播必须 BFS + stats 索引，不扫全表
- UI gate 不能依赖 `allEvents` 的预加载来决定“是否显示 EventTree”

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
  
  // 获取子事件列表（⚡ v2.20.0: 批量查询优化，性能提升 5-10 倍）
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

**⚡ v2.20.0 重大优化**: `getChildEvents` 使用批量查询替代逐个查询，性能提升 5-10 倍

```typescript
// ✅ v2.20.0 优化后实现
static async getChildEvents(parentId: string): Promise<Event[]> {
  const parent = await this.getEventById(parentId);
  if (!parent?.childEventIds || parent.childEventIds.length === 0) {
    return [];
  }
  
  // ⚡ [BATCH QUERY] 一次查询所有子事件，避免 N 次异步查询
  try {
    const result = await storageManager.queryEvents({
      filters: { eventIds: parent.childEventIds },
      limit: 1000
    });
    
    return result.items;
  } catch (error) {
    // 🛡️ Fallback: 如果批量查询失败，回退到逐个查询
    const children = await Promise.all(
      parent.childEventIds.map(id => this.getEventById(id))
    );
    return children.filter(Boolean) as Event[];
  }
}

// 性能对比
// ❌ 旧实现：10 个子事件 = 10 次异步查询 ≈ 50ms
// ✅ 新实现：10 个子事件 = 1 次批量查询 ≈ 5ms
// 性能提升：10倍

// 避免 N+1 查询（树结构批量获取）
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

## 🐛 层级显示常见问题

### 问题：EventTree 显示顺序错乱（PlanManager v2.17 案例）

**现象**:
- 所有 L1 子事件混在一起，未按所属根事件分组
- 树结构完全无法理解，用户体验极差

**诊断流程**:

**1. 验证数据库完整性** ✅
```typescript
// 检查 parentEventId ↔ childEventIds 双向关系
const parent = await EventService.getEventById(parentId);
const child = await EventService.getEventById(childId);

console.log('父事件的 childEventIds:', parent.childEventIds);
console.log('子事件的 parentEventId:', child.parentEventId);

// 应该满足：parent.childEventIds.includes(child.id) && child.parentEventId === parent.id
```

**2. 验证 bulletLevel 计算** ✅
```typescript
// 检查 calculateAllBulletLevels() 是否正确
const bulletLevels = await EventService.calculateAllBulletLevels();

console.log('根事件的 bulletLevel:', bulletLevels.get(rootEventId)); // 应该是 0
console.log('L1 子事件的 bulletLevel:', bulletLevels.get(l1ChildId)); // 应该是 1
console.log('L2 子事件的 bulletLevel:', bulletLevels.get(l2ChildId)); // 应该是 2
```

**3. 验证 DFS 遍历算法** ✅
```typescript
// 检查 addEventWithChildren() 深度优先遍历
const sortedEvents = [];
const visited = new Set<string>();

function addEventWithChildren(event: Event) {
  if (visited.has(event.id!)) return;
  visited.add(event.id!);
  sortedEvents.push(event);
  
  if (event.childEventIds) {
    for (const childId of event.childEventIds) {
      const child = eventMap.get(childId);
      if (child) addEventWithChildren(child);
    }
  }
}

// 日志输出前 30 个事件，检查是否按树结构排序
console.log('sortedEvents 顺序检查（前30个）:');
sortedEvents.slice(0, 30).forEach((e, idx) => {
  const indent = '  '.repeat(e.bulletLevel || 0);
  console.log(`[${idx}] ${indent}L${e.bulletLevel} ${e.title} (父:${e.parentEventId?.slice(-8) || 'ROOT'})`);
});

// 应该看到：L0 → L1 → L2 → ... → L2 → L1 → L0 → ...（深度优先）
```

**4. 验证 items 状态更新** ✅
```typescript
// 检查 setItems(sortedEvents) 是否保持顺序
useEffect(() => {
  if (items.length > 0) {
    console.log('[PlanManager] items 数组已更新:', {
      数量: items.length,
      前5个ID: items.slice(0, 5).map(e => e.id?.slice(-8))
    });
  }
}, [items]);

// items 应该与 sortedEvents 顺序完全一致
```

**5. 验证 filteredItems useMemo** ✅
```typescript
// filter() 操作不会改变已有元素的相对顺序
const filteredItems = useMemo(() => {
  return items.filter(item => {
    // 标签过滤、搜索过滤等
    return matchesFilter(item);
  });
}, [items, filters]);

// filteredItems 应该保持 items 的相对顺序
```

**6. ❌ 发现问题：computeEditorItems 错误排序**
```typescript
// ❌ 错误代码（PlanManager v2.16 及之前）
function computeEditorItems() {
  // ...
  result = allItems.sort((a, b) => {
    const pa = (a as any).position ?? allItems.indexOf(a);
    const pb = (b as any).position ?? allItems.indexOf(b);
    return pa - pb;  // ❌ position 值不反映树结构，完全打乱 DFS 顺序！
  });
}
```

**根本原因**:
- `position` 字段：扁平列表的拖拽重排字段，值如 `[0, 10, 20, 5, 15]`
- EventTree DFS 顺序：深度优先遍历顺序，`根事件1 → L1子 → L2子 → L2子 → L1返回 → 根事件2 → ...`
- **冲突**：按 `position` 排序会完全打乱树结构

**修复方案（PlanManager v2.17）**:
```typescript
// ✅ 修复后代码
function computeEditorItems() {
  // ...
  
  if (currentSnapshot) {
    // Snapshot 模式：按时间戳排序
    result = allItems.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeB - timeA;
    });
  } else {
    // 🔥 正常模式：直接使用 allItems（即 filteredItems）
    // items 数组在初始化时已经按照 EventTree 结构排序（DFS），无需再次排序
    // filteredItems 只是过滤操作（标签、搜索），不会改变顺序
    result = allItems.filter(item => item.id);
    console.log('[PlanManager] ✅ 正常模式：使用已排序的 items，共', result.length, '个事件');
  }
  
  // 添加 pendingEmptyItems（空标题占位符，添加在末尾）
  result.push(...pendingEmptyItems.values());
  
  return result;
}
```

**关键教训**:
- 🎯 **信任源数据的顺序**：如果数据在初始化时已经正确排序，不要轻易重新排序
- ⚠️ **过滤不改变顺序**：`filter()` 操作不会改变已有元素的相对顺序
- 🚫 **position 不适用于树结构**：扁平列表的排序字段不反映树形层级关系

**验证方法**:
```typescript
// 对比 sortedEvents 和 editorItems 的顺序
console.log('[DEBUG] sortedEvents vs editorItems 顺序对比:');
for (let i = 0; i < Math.min(10, sortedEvents.length); i++) {
  console.log(`sortedEvents[${i}]:`, sortedEvents[i].id?.slice(-8), 'L' + sortedEvents[i].bulletLevel);
  console.log(`editorItems[${i}]:`, editorItems[i].id?.slice(-8), 'L' + (editorItems[i] as any).bulletLevel);
}

// 应该完全一致！
```

**相关文档**:
- 完整修复报告：`docs/EVENTTREE_HIERARCHY_FIX_REPORT.md`
- PlanManager v2.17 PRD：`docs/PRD/PLANMANAGER_MODULE_PRD.md`

---

## 📚 最佳实践指南

### 1. 树结构数据流管理

**DO ✅**: 信任已排序的源数据
```typescript
// 初始化时 DFS 遍历排序
const sortedEvents = dfsTraversal(rootEvents);
setItems(sortedEvents);

// 过滤操作（不改变顺序）
const filteredItems = items.filter(matchesFilter);

// 直接使用，不要再次排序
setEditorItems(filteredItems);
```

**DON'T ❌**: 错误地重新排序
```typescript
// ❌ 错误：按 position 排序会打乱树结构
const editorItems = filteredItems.sort((a, b) => a.position - b.position);

// ❌ 错误：按 created_at 排序（除非是 Snapshot 模式）
const editorItems = filteredItems.sort((a, b) => 
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);
```

### 2. 调试日志策略

**分层验证数据流**:
```typescript
// L1: 数据库查询
const events = await EventService.getAllEvents();
console.log('[Layer 1] 数据库查询结果:', events.length, '个事件');

// L2: bulletLevel 计算
const bulletLevels = await EventService.calculateAllBulletLevels();
console.log('[Layer 2] bulletLevel 计算完成:', bulletLevels.size, '个事件');

// L3: DFS 遍历
console.log('[Layer 3] 🔍 sortedEvents 顺序检查（前30个）:');
sortedEvents.slice(0, 30).forEach((e, idx) => {
  const indent = '  '.repeat(e.bulletLevel || 0);
  console.log(`[${idx}] ${indent}L${e.bulletLevel} ${e.title} (父:${e.parentEventId?.slice(-8) || 'ROOT'})`);
});

// L4: 状态更新
useEffect(() => {
  console.log('[Layer 4] 📋 items 数组已更新:', items.length, '个事件');
}, [items]);

// L5: 最终渲染
console.log('[Layer 5] 🎯 setEditorItems 调用前:', result.length, '个事件');
```

### 3. position vs DFS 排序

**position 字段适用场景**:
- ✅ 扁平列表拖拽重排（Kanban Board）
- ✅ 无层级关系的事件列表
- ✅ 用户手动排序的待办列表

**DFS 遍历适用场景**:
- ✅ EventTree 层级显示
- ✅ 父子关系可视化
- ✅ 缩进层级编辑器（PlanManager）

**永远不要混用**:
```typescript
// ❌ 错误：在树结构中使用 position 排序
if (isTreeView) {
  items.sort((a, b) => a.position - b.position); // ❌ 会打乱树结构
}

// ✅ 正确：根据模式选择排序方式
if (isTreeView) {
  // 使用已经 DFS 排序的 items，不要再次排序
  return items;
} else if (isFlatListView) {
  // 扁平列表可以按 position 排序
  return items.sort((a, b) => a.position - b.position);
}
```

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
  
  test('DFS 遍历顺序正确性', async () => {
    // 创建树结构：Root → L1-A → L2-A1, L2-A2, L1-B
    const root = await createEvent({ title: 'Root' });
    const l1A = await createEvent({ title: 'L1-A', parentEventId: root.id });
    const l2A1 = await createEvent({ title: 'L2-A1', parentEventId: l1A.id });
    const l2A2 = await createEvent({ title: 'L2-A2', parentEventId: l1A.id });
    const l1B = await createEvent({ title: 'L1-B', parentEventId: root.id });
    
    const sortedEvents = await EventService.getAllEventsSorted();
    const ids = sortedEvents.map(e => e.id);
    
    // 验证 DFS 顺序：Root → L1-A → L2-A1 → L2-A2 → L1-B
    expect(ids.indexOf(root.id!)).toBeLessThan(ids.indexOf(l1A.id!));
    expect(ids.indexOf(l1A.id!)).toBeLessThan(ids.indexOf(l2A1.id!));
    expect(ids.indexOf(l2A1.id!)).toBeLessThan(ids.indexOf(l2A2.id!));
    expect(ids.indexOf(l2A2.id!)).toBeLessThan(ids.indexOf(l1B.id!));
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
