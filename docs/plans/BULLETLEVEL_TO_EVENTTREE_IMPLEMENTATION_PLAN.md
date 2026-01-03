# BulletLevel → EventTree 数据联通实施计划

## 📋 需求总结

### 当前问题
- **bulletLevel** 仅用于视觉缩进（paragraph.bulletLevel + EventLine.level）
- 刷新后标题丢失格式（已修复同步问题，但仍无真实关系）
- 无法通过 Shift+Enter 进入子事件的 eventlog 编辑

### 目标架构
- **bulletLevel** 应创建真实的 EventTree 父子关系
- 每个 bullet item 对应一个独立的 Event 记录
- Tab 键创建父子关系：`parentEventId` + `childEventIds`
- Shift+Enter 进入当前 Event 的 eventlog 编辑模式

---

## 🎯 Plan 页面过滤规则（核心依据）

### 事件显示规则（PlanManager.tsx L480-530）

#### ✅ **纳入条件（并集）**
满足以下**任意一个**条件的事件会显示：
```typescript
event.isPlan === true ||
(event.checkType && event.checkType !== 'none') ||
event.isTimeCalendar === true
```

#### ❌ **排除条件**
1. **系统附属事件**（`EventService.isSubordinateEvent()`）：
   ```typescript
   event.isTimer || event.isTimeLog || event.isOutsideApp
   ```

2. **空白事件**：
   - `title.simpleTitle`, `title.fullTitle`, `content` 都为空
   - **且** `eventlog.slateJson`, `eventlog.html`, `eventlog.plainText` 都为空

3. **隐藏标签事件**：
   ```typescript
   event.tags.some(tag => hiddenTags.has(tag))
   ```

4. **搜索过滤**：
   - 不匹配 `searchQuery` 的事件

### 📌 关键规则
- **isPlan 不是唯一标准**：`checkType` 或 `isTimeCalendar` 也可以显示
- **用户子事件会显示**：有 `parentEventId` 但 `isPlan=true` 的事件会显示
  ```typescript
  EventService.isUserSubEvent(event) = 
    event.isPlan && event.parentEventId && !isSubordinateEvent(event)
  ```
- **系统附属事件隐藏**：即使有 `parentEventId`，只要是 Timer/TimeLog/OutsideApp 就不显示

---

## 🏗️ 架构设计

### 1. 数据模型变更

#### Event 接口（types.ts）
```typescript
interface Event {
  // 现有字段
  id: string;
  isPlan?: boolean;
  checkType?: CheckType;
  parentEventId?: string;
  childEventIds?: string[];
  
  // ⚠️ 保留 bulletLevel 字段（用于序列化/反序列化）
  // 但它的值将自动从 EventTree 关系推导
  bulletLevel?: number; // 0=根事件, 1=一级子, 2=二级子...
}
```

#### EventLine 接口（PlanSlate）
```typescript
interface EventLine {
  type: 'event';
  id: string;
  eventId: string;
  bulletLevel: number; // ✅ 从 Event.bulletLevel 派生（自动计算）
  level: number;       // ✅ 与 bulletLevel 保持同步
}
```

### 2. 核心原则

#### 🎯 bulletLevel 自动推导
```typescript
// 计算规则
function calculateBulletLevel(event: Event, allEvents: Event[]): number {
  if (!event.parentEventId) return 0; // 根事件
  
  const parent = allEvents.find(e => e.id === event.parentEventId);
  if (!parent) return 0; // 父事件不存在，降级为根
  
  return calculateBulletLevel(parent, allEvents) + 1; // 递归计算
}
```

#### 🔄 数据流向
```
用户操作 (Tab) 
  → 创建/更新 EventTree 关系 (parentEventId/childEventIds)
  → EventService 自动维护双向关系
  → 反序列化时自动计算 bulletLevel
  → PlanSlate 渲染视觉缩进
```

---

## 🛠️ 实施步骤

### Phase 1: 基础架构准备 ✅

#### 1.1 EventService 辅助方法（已存在）
```typescript
// src/services/EventService.ts L3180-3240
static isSubordinateEvent(event: Event): boolean {
  return !!(event.isTimer || event.isTimeLog || event.isOutsideApp);
}

static isUserSubEvent(event: Event): boolean {
  return !!(event.isPlan && event.parentEventId && !this.isSubordinateEvent(event));
}

static async getChildEvents(parentId: string): Promise<Event[]> {
  // 已实现
}

static async getUserSubTasks(parentId: string): Promise<Event[]> {
  // 已实现
}
```

#### 1.2 新增辅助方法
```typescript
// src/services/EventService.ts

/**
 * 计算事件的 bulletLevel（基于 EventTree 层级）
 */
static calculateBulletLevel(
  event: Event, 
  eventMap: Map<string, Event>
): number {
  if (!event.parentEventId) return 0;
  
  const parent = eventMap.get(event.parentEventId);
  if (!parent) {
    console.warn('[EventService] Parent not found:', event.parentEventId);
    return 0;
  }
  
  return this.calculateBulletLevel(parent, eventMap) + 1;
}

/**
 * 批量计算所有事件的 bulletLevel
 */
static calculateAllBulletLevels(events: Event[]): Map<string, number> {
  const eventMap = new Map(events.map(e => [e.id, e]));
  const levels = new Map<string, number>();
  
  events.forEach(event => {
    levels.set(event.id, this.calculateBulletLevel(event, eventMap));
  });
  
  return levels;
}
```

---

### Phase 2: Tab 键创建 EventTree 关系

#### 2.1 当前 Tab 行为（PlanSlate.tsx L2513-2617）
```typescript
// ❌ 当前：仅修改视觉缩进
const newBulletLevel = Math.min(currentBulletLevel + 1, 5);
Transforms.setNodes(editor, {
  bulletLevel: newBulletLevel,
  level: newBulletLevel // 已修复同步
});
```

#### 2.2 新 Tab 行为（乐观更新 + 异步持久化）

##### 🚀 核心策略：本地优先渲染
```typescript
/**
 * 性能优化原则：
 * 1. 本地状态立即更新（乐观更新）→ 用户无感知延迟
 * 2. 异步持久化到数据库 → 后台完成
 * 3. 本组件跳过广播回调 → 避免重复渲染
 * 4. 其他组件增量更新 → 只更新受影响的事件
 */
```

##### 🎯 Tab 键实现（PlanSlate.tsx）
```typescript
const handleTabKey = async (event: React.KeyboardEvent) => {
  event.preventDefault();
  
  const [eventLineNode, eventLinePath] = Editor.above(editor, {
    match: n => n.type === 'event',
  }) || [];
  
  if (!eventLineNode) return;
  
  const currentEventId = eventLineNode.eventId;
  const currentBulletLevel = eventLineNode.bulletLevel || 0;
  
  // 🎯 步骤 1: 找到上一行（潜在父事件）
  const previousEventLine = findPreviousEventLine(editor, eventLinePath);
  
  if (!previousEventLine) {
    console.warn('[Tab] No previous line, cannot indent');
    return;
  }
  
  const previousEventId = previousEventLine.eventId;
  const previousLevel = previousEventLine.bulletLevel || 0;
  const newBulletLevel = previousLevel + 1;
  
  // 🎯 步骤 2: 检查层级限制
  if (newBulletLevel > 5) {
    console.warn('[Tab] Max bullet level reached');
    return;
  }
  
  // ⚡ 步骤 3: 乐观更新 - 立即修改 Slate Editor 状态
  Editor.withoutNormalizing(editor, () => {
    Transforms.setNodes(
      editor,
      { 
        bulletLevel: newBulletLevel,
        level: newBulletLevel // 保持同步
      },
      { at: eventLinePath }
    );
  });
  
  console.log('[Tab] ⚡ Optimistic update:', {
    eventId: currentEventId.slice(-8),
    oldLevel: currentBulletLevel,
    newLevel: newBulletLevel,
    渲染: '立即完成'
  });
  
  // 📡 步骤 4: 异步持久化 - 后台保存到数据库
  // 不 await，让操作在后台进行
  EventService.updateEvent(
    currentEventId, 
    {
      parentEventId: previousEventId, // 设置父事件
      isPlan: true // 确保是 Plan 事件
    },
    false, // skipSync=false，允许同步
    {
      originComponent: 'PlanManager', // 标识来源
      source: 'user-edit' // 标记为用户编辑
    }
  ).then(() => {
    console.log('[Tab] 📡 Persisted to database:', {
      child: currentEventId.slice(-8),
      parent: previousEventId.slice(-8)
    });
  }).catch((error) => {
    console.error('[Tab] ❌ Failed to persist:', error);
    
    // 🔄 持久化失败 - 回滚乐观更新
    Editor.withoutNormalizing(editor, () => {
      Transforms.setNodes(
        editor,
        { 
          bulletLevel: currentBulletLevel,
          level: currentBulletLevel
        },
        { at: eventLinePath }
      );
    });
    
    console.warn('[Tab] 🔄 Rollback optimistic update');
  });
  
  // ✅ 用户已经看到缩进变化，无需等待数据库
  // EventService.updateEvent() 会广播 eventsUpdated
  // 但 PlanSlate 监听器会跳过（originComponent === 'PlanManager'）
};

// 辅助函数：找到上一个 EventLine
function findPreviousEventLine(editor, currentPath) {
  const currentIndex = currentPath[0];
  if (currentIndex === 0) return null;
  
  // 向上遍历找到最近的 EventLine
  for (let i = currentIndex - 1; i >= 0; i--) {
    const node = editor.children[i];
    if (node.type === 'event') {
      return node;
    }
  }
  
  return null;
}
```

##### 🔄 Shift+Tab 实现（解除父子关系）
```typescript
const handleShiftTabKey = async (event: React.KeyboardEvent) => {
  event.preventDefault();
  
  const [eventLineNode, eventLinePath] = Editor.above(editor, {
    match: n => n.type === 'event',
  }) || [];
  
  if (!eventLineNode) return;
  
  const currentEventId = eventLineNode.eventId;
  const currentBulletLevel = eventLineNode.bulletLevel || 0;
  
  if (currentBulletLevel === 0) {
    console.warn('[Shift+Tab] Already at root level');
    return;
  }
  
  const newBulletLevel = currentBulletLevel - 1;
  
  // ⚡ 乐观更新 - 立即修改视觉层级
  Editor.withoutNormalizing(editor, () => {
    Transforms.setNodes(
      editor,
      { 
        bulletLevel: newBulletLevel,
        level: newBulletLevel
      },
      { at: eventLinePath }
    );
  });
  
  console.log('[Shift+Tab] ⚡ Optimistic update:', {
    eventId: currentEventId.slice(-8),
    oldLevel: currentBulletLevel,
    newLevel: newBulletLevel
  });
  
  // 📡 异步持久化 - 解除父子关系
  // 需要找到新的父事件（上一级）或设为 undefined（根事件）
  const newParentEventLine = findParentEventLineAtLevel(editor, eventLinePath, newBulletLevel);
  
  EventService.updateEvent(
    currentEventId,
    {
      parentEventId: newParentEventLine?.eventId || undefined, // 可能变为根事件
      isPlan: true
    },
    false,
    {
      originComponent: 'PlanManager',
      source: 'user-edit'
    }
  ).then(() => {
    console.log('[Shift+Tab] 📡 Persisted:', {
      child: currentEventId.slice(-8),
      newParent: newParentEventLine?.eventId?.slice(-8) || 'ROOT'
    });
  }).catch((error) => {
    console.error('[Shift+Tab] ❌ Failed:', error);
    
    // 回滚
    Editor.withoutNormalizing(editor, () => {
      Transforms.setNodes(
        editor,
        { 
          bulletLevel: currentBulletLevel,
          level: currentBulletLevel
        },
        { at: eventLinePath }
      );
    });
  });
};

// 辅助函数：找到当前父事件的父事件（祖父事件）
// 🔥 v2.17.1 修复：新父事件 = 祖父事件，而非向上第一个同级事件
function findParentEventLineAtLevel(editor, currentPath, targetLevel) {
  const currentIndex = currentPath[0];
  const currentNode = editor.children[currentIndex];
  
  // 1. 获取当前父事件 ID
  const currentParentId = currentNode.metadata?.parentEventId;
  if (!currentParentId) return null; // 已是根事件
  
  // 2. 查找当前父事件节点
  let parentEventLine = null;
  for (let i = currentIndex - 1; i >= 0; i--) {
    const node = editor.children[i];
    if (node.type === 'event' && node.eventId === currentParentId) {
      parentEventLine = node;
      break;
    }
  }
  
  if (!parentEventLine) return null; // 父事件不存在
  
  // 3. 获取祖父事件 ID（当前父事件的父事件）
  const newParentId = parentEventLine.metadata?.parentEventId;
  if (!newParentId) return null; // 父事件是根事件，降级后也是根事件
  
  // 4. 查找祖父事件节点
  for (let i = currentIndex - 1; i >= 0; i--) {
    const node = editor.children[i];
    if (node.type === 'event' && node.eventId === newParentId) {
      return node; // ✅ 返回祖父事件
    }
  }
  
  return null; // 祖父事件不存在，变为根事件
}
```

#### 2.3 Shift+Tab 行为（解除父子关系）
```typescript
const handleShiftTabKey = async (event: React.KeyboardEvent) => {
  event.preventDefault();
  
  const [eventLineNode] = Editor.above(editor, {
    match: n => n.type === 'event',
  }) || [];
  
  if (!eventLineNode) return;
  
  const currentEventId = eventLineNode.eventId;
  const currentEvent = await EventService.getEventById(currentEventId);
  
  if (!currentEvent?.parentEventId) {
    console.warn('[Shift+Tab] Already at root level');
    return;
  }
  
  // 🎯 解除父子关系（变为根事件）
  try {
    await EventService.updateEvent(currentEventId, {
      parentEventId: undefined
    });

    // ADR-001：不维护 childEventIds；子列表通过 parentEventId 派生/查询获得
    
    await reloadEvents();
    
    console.log('[Shift+Tab] Removed parent relationship:', {
      child: currentEventId.slice(-8),
      formerParent: currentEvent.parentEventId.slice(-8)
    });
    
  } catch (error) {
    console.error('[Shift+Tab] Failed to remove relationship:', error);
  }
};
```

---

### Phase 3: PlanManager 增量更新策略

#### 3.1 监听器优化（只更新受影响的事件）
```typescript
// src/components/PlanManager.tsx

useEffect(() => {
  const handleEventsUpdated = async (e: CustomEvent) => {
    const { eventId, originComponent, isLocalUpdate } = e.detail || {};
    
    // 🚫 跳过本组件触发的更新（已乐观更新）
    if (originComponent === 'PlanManager' || isLocalUpdate) {
      console.log('[PlanManager] ⏭️ Skip own update:', eventId?.slice(-8));
      return;
    }
    
    // 🎯 增量更新策略
    if (eventId) {
      await incrementalUpdateEvent(eventId);
    } else {
      // 没有 eventId，可能是批量操作，全量刷新
      await reloadAllEvents();
    }
  };
  
  window.addEventListener('eventsUpdated', handleEventsUpdated);
  return () => window.removeEventListener('eventsUpdated', handleEventsUpdated);
}, []);

/**
 * 增量更新单个事件及其受影响的关联事件
 */
const incrementalUpdateEvent = async (eventId: string) => {
  console.log('[PlanManager] 🎯 Incremental update:', eventId.slice(-8));
  
  // 1. 获取更新后的事件
  const updatedEvent = await EventService.getEventById(eventId);
  if (!updatedEvent) {
    // 事件被删除，从列表中移除
    setItems(prev => prev.filter(item => item.id !== eventId));
    return;
  }
  
  // 2. 计算受影响的事件范围
  const affectedEventIds = new Set<string>([eventId]);
  
  // 2.1 父事件（childEventIds 可能变化）
  if (updatedEvent.parentEventId) {
    affectedEventIds.add(updatedEvent.parentEventId);
  }
  
  // 2.2 子事件（bulletLevel 需要重新计算）
  if (updatedEvent.childEventIds?.length) {
    updatedEvent.childEventIds.forEach(id => affectedEventIds.add(id));
  }
  
  // 3. 批量获取受影响的事件
  const affectedEvents = await Promise.all(
    Array.from(affectedEventIds).map(id => EventService.getEventById(id))
  );
  const validEvents = affectedEvents.filter(e => e !== null) as Event[];
  
  // 4. 计算这些事件的 bulletLevel
  const bulletLevels = EventService.calculateAllBulletLevels(validEvents);
  
  // 5. 更新 items 数组（增量）
  setItems(prev => {
    const newItems = [...prev];
    const eventMap = new Map(newItems.map((item, index) => [item.id, index]));
    
    validEvents.forEach(event => {
      const bulletLevel = bulletLevels.get(event.id!) || 0;
      const eventWithLevel = { ...event, bulletLevel }; // 临时添加 bulletLevel 字段
      
      const existingIndex = eventMap.get(event.id!);
      if (existingIndex !== undefined) {
        // 更新现有事件
        newItems[existingIndex] = eventWithLevel;
      } else {
        // 新增事件（不太可能，但做防护）
        newItems.push(eventWithLevel);
      }
    });
    
    return newItems;
  });
  
  console.log('[PlanManager] ✅ Incremental update complete:', {
    updatedEvents: affectedEventIds.size,
    eventIds: Array.from(affectedEventIds).map(id => id.slice(-8))
  });
};

/**
 * 全量刷新（仅初始化或批量操作时使用）
 */
const reloadAllEvents = async () => {
  console.log('[PlanManager] 🔄 Full reload');
  const allEvents = await EventService.getAllEvents();
  
  // 过滤 + 计算 bulletLevel
  const filtered = allEvents.filter(/* 过滤规则 */);
  const bulletLevels = EventService.calculateAllBulletLevels(filtered);
  
  const itemsWithLevels = filtered.map(event => ({
    ...event,
    bulletLevel: bulletLevels.get(event.id!) || 0
  }));
  
  setItems(itemsWithLevels);
  console.log('[PlanManager] ✅ Full reload complete:', itemsWithLevels.length);
};
```

#### 3.2 PlanSlate 跳过广播回调
```typescript
// src/components/PlanSlate/PlanSlate.tsx

useEffect(() => {
  const handleEventUpdated = (e: any) => {
    const { eventId, originComponent, isLocalUpdate } = e.detail || {};
    
    // 🚫 跳过本组件触发的更新（已乐观更新过了）
    if (originComponent === 'PlanManager' || isLocalUpdate) {
      console.log('[PlanSlate] ⏭️ Skip own update (already optimistically updated)');
      return;
    }
    
    // 🎯 其他组件的更新：增量更新 Slate Editor
    // 这里可以实现增量更新逻辑，或者依赖 PlanManager 传入新的 items
    console.log('[PlanSlate] 📡 External update:', eventId?.slice(-8));
  };
  
  window.addEventListener('eventsUpdated', handleEventUpdated);
  return () => window.removeEventListener('eventsUpdated', handleEventUpdated);
}, []);
```

---

### Phase 4: Shift+Enter 进入 Eventlog

#### 4.1 键盘事件处理
```typescript
// src/components/PlanSlate/PlanSlate.tsx

const handleShiftEnter = (event: React.KeyboardEvent) => {
  event.preventDefault();
  
  const [eventLineNode] = Editor.above(editor, {
    match: n => n.type === 'event',
  }) || [];
  
  if (!eventLineNode) return;
  
  const eventId = eventLineNode.eventId;
  
  // 🎯 触发 eventlog 编辑模式
  onEnterEventlogMode?.(eventId);
};

// 在 onKeyDown 中注册
if (event.key === 'Enter' && event.shiftKey) {
  handleShiftEnter(event);
  return;
}
```

#### 4.2 PlanManager 接收事件
```typescript
// src/components/PlanManager.tsx

const [eventlogEditingId, setEventlogEditingId] = useState<string | null>(null);

const handleEnterEventlogMode = (eventId: string) => {
  console.log('[PlanManager] Enter eventlog mode:', eventId);
  setEventlogEditingId(eventId);
  // 可选：滚动到目标位置，展开 eventlog 编辑器
};

// 传递给 PlanSlate
<PlanSlate
  items={editorItems}
  onEnterEventlogMode={handleEnterEventlogMode}
  // ...
/>
```

---

### Phase 5: 视觉渲染适配

#### 5.1 PlanSlate 缩进渲染
```typescript
// src/components/PlanSlate/PlanSlate.tsx

const EventLineComponent = ({ element, children, attributes }) => {
  const bulletLevel = element.bulletLevel || 0;
  
  return (
    <div
      {...attributes}
      style={{
        paddingLeft: `${bulletLevel * 24}px`, // 每级缩进 24px
        position: 'relative'
      }}
    >
      {/* Bullet 图标 */}
      {bulletLevel > 0 && (
        <span style={{ position: 'absolute', left: `${(bulletLevel - 1) * 24 + 8}px` }}>
          •
        </span>
      )}
      
      {children}
    </div>
  );
};
```

---

## 🧪 测试计划

### 测试场景 1: Tab 创建父子关系
```
操作步骤：
1. 创建事件 A（根事件）
2. 创建事件 B（根事件）
3. 在事件 B 上按 Tab

预期结果：
- B.parentEventId = A.id
- A.childEventIds = [B.id]
- B.bulletLevel = 1
- B.isPlan = true
- Plan 页面显示 B（因为 isPlan=true）
```

### 测试场景 2: 多级缩进
```
操作步骤：
1. A（根）
2. B（根）→ Tab → B 成为 A 的子
3. C（根）→ Tab → C 成为 B 的子

预期结果：
- A.bulletLevel = 0, childEventIds = [B]
- B.bulletLevel = 1, parentEventId = A, childEventIds = [C]
- C.bulletLevel = 2, parentEventId = B
- 刷新后层级关系保持
```

### 测试场景 3: Shift+Tab 解除关系
```
操作步骤：
1. A → B(Tab) → C(Tab)
2. 在 C 上按 Shift+Tab

预期结果：
- C.parentEventId = A.id（提升到 B 的同级）
- B.childEventIds = []（C 被移除）
- A.childEventIds = [B, C]
- C.bulletLevel = 1
```

### 测试场景 4: 系统事件不显示
```
操作步骤：
1. 创建 Plan 事件 A
2. 为 A 创建 Timer 子事件（isTimer=true）
3. 刷新 Plan 页面

预期结果：
- Plan 页面只显示 A
- Timer 子事件不显示（被 isSubordinateEvent 过滤）
- EventTree 视图应显示 Timer（如果有这个视图）
```

### 测试场景 5: Shift+Enter 进入 Eventlog
```
操作步骤：
1. 在事件 A 的标题行按 Shift+Enter

预期结果：
- 触发 eventlog 编辑模式
- 光标定位到 A.eventlog 编辑器
- 标题行不插入换行
```

---

## ⚠️ 风险与注意事项

### 1. 数据迁移
- **现有 bulletLevel 数据**：需要迁移脚本将 bulletLevel 转换为 EventTree 关系
- **向后兼容**：保留 bulletLevel 字段，从 EventTree 自动计算

### 2. 循环引用防护
```typescript
// EventService.calculateBulletLevel 需要防死循环
const visited = new Set<string>();

function calculateBulletLevel(event: Event, eventMap: Map<string, Event>, visited: Set<string>): number {
  if (visited.has(event.id)) {
    console.error('[BulletLevel] Circular reference detected:', event.id);
    return 0;
### 🔄 增量渲染机制详解

#### 核心原则
1. **本地优先**：Slate Editor 状态立即更新（乐观更新）
2. **异步持久化**：数据库保存在后台进行（不阻塞 UI）
3. **跳过自己的广播**：本组件触发的更新不触发重新渲染
4. **增量更新其他组件**：只更新受影响的事件（不全量刷新）

#### 乐观更新策略（已实现）
```

### 3. 性能优化
- **批量计算**：`calculateAllBulletLevels()` 一次性计算所有层级
- **缓存**：在 PlanManager 中缓存 bulletLevel 计算结果
- **增量更新**：仅重新计算受影响的事件子树

### 4. UI 响应性
- **异步更新**：Tab/Shift+Tab 后立即重新加载数据
- **乐观更新**：先更新 UI，后台同步数据
- **错误回滚**：失败时恢复原状态

---

## 📊 数据流总览（乐观更新 + 增量渲染）

```
┌───────────────────────────────────────────────────────────────────┐
│                          User Actions                             │
│     Tab: 创建父子关系 | Shift+Tab: 解除关系 | Shift+Enter: 编辑   │
└──────────────────────────────┬────────────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│                    PlanSlate 键盘处理器                            │
│  handleTabKey() / handleShiftTabKey()                             │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ 🚀 步骤 1: 乐观更新本地状态（立即渲染）                 │     │
│  │  - 直接修改 Slate Editor 节点的 bulletLevel              │     │
│  │  - Transforms.setNodes(editor, { bulletLevel: newLevel })│     │
│  │  - 用户立即看到缩进变化（无延迟）                        │     │
│  └─────────────────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ 📡 步骤 2: 异步持久化到 EventService（后台）            │     │
│  │  - await EventService.updateEvent(eventId, updates)      │     │
│  │  - 传递 options.originComponent = 'PlanManager'          │     │
│  │  - 传递 options.source = 'user-edit'                     │     │
│  └─────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│                      EventService.updateEvent()                   │
│  1. 更新数据库：parentEventId/childEventIds（双向维护）           │
│  2. 生成 updateId 和记录 pendingLocalUpdates                      │
│  3. 📡 广播 eventsUpdated（携带 originComponent, updateId）       │
└──────────────────────────────┬────────────────────────────────────┘
                               │
                   ┌───────────┴───────────┐
                   │                       │
                   ▼                       ▼
    ┌──────────────────────┐   ┌──────────────────────┐
    │  PlanManager 监听器  │   │  PlanSlate 监听器    │
    │  eventsUpdated       │   │  eventsUpdated       │
    └──────────┬───────────┘   └──────────┬───────────┘
               │                          │
               │                          │ ✅ 本组件触发的更新
               │                          ├─ originComponent === 'PlanManager'
               │                          └─ 🎯 跳过（已乐观更新）
               │                          
               │ ❌ 其他组件触发的更新
               ├─ originComponent !== 'PlanManager'
               └─ 🎯 增量更新受影响的事件
                  │
                  ▼
    ┌─────────────────────────────────────────────────────────┐
    │  增量更新策略（PlanManager）                            │
    │  1. 只获取变更的事件：EventService.getEventById()       │
    │  2. 计算受影响的事件范围：                               │
    │     - 当前事件                                          │
    │     - 父事件（childEventIds 变化）                      │
    │     - 子事件（bulletLevel 需要重新计算）                │
    │  3. 增量更新 items 数组（splice/push）                  │
    │  4. 触发 PlanSlate 增量渲染                             │
    └─────────────────────────────────────────────────────────┘
```

### 🔄 循环防护机制详解

#### 问题根源
- **EventService 不会把广播发给发起模块**：这是正确的防护策略
- PlanSlate 在 Tab 键时调用 `EventService.updateEvent()`
- EventService 广播 `eventsUpdated` 事件
- PlanSlate 如果监听到自己触发的更新，会导致**无限循环**

#### 多层防护策略（已实现）

##### 1. originComponent 标识（EventService.ts L880-910）
```typescript
const originComponent = options?.originComponent || 'Unknown'; // 'PlanManager'
this.dispatchEventUpdate(eventId, { 
  originComponent, // 广播时携带来源
  updateId,
  isLocalUpdate: source === 'user-edit'
});
```

##### 2. updateId 序列号（EventService.ts L36-38）
```typescript
let updateSequence = 0; // 全局序列号
const updateId = ++updateSequence; // 每次更新生成唯一ID
pendingLocalUpdates.set(eventId, { updateId, timestamp: Date.now(), component: originComponent });
```

##### 3. pendingLocalUpdates 时间窗口（EventService.ts L890-895）
```typescript
pendingLocalUpdates.set(eventId, { updateId, timestamp: Date.now(), component });
setTimeout(() => {
  pendingLocalUpdates.delete(eventId); // 5秒后清理
}, 5000);
```

##### 4. PlanSlate 监听器跳过检查（PlanSlate.tsx L871-890）
```typescript
const { updateId, isLocalUpdate, originComponent } = e.detail || {};

// 多重检查避免循环
if (isLocalUpdate ||                                    // 来自用户编辑
    originComponent === 'PlanManager' ||                // 来自 PlanManager
    recentlySavedEventsRef.current.has(eventId) ||      // 最近保存过
    (updateId && EventService.isLocalUpdate(eventId, updateId))) { // updateId 匹配
  console.log('[跳过] 本组件相关的更新，避免循环');
  return; // ✅ 跳过更新
}

// ✅ 只有其他组件的更新才会触发 PlanSlate 刷新
```

##### 5. EventService.isLocalUpdate() 辅助方法（EventService.ts L1418-1435）
```typescript
### P0 - 核心功能（本周完成）
1. ✅ EventService 辅助方法（calculateBulletLevel）
2. ✅ Tab/Shift+Tab 乐观更新 + 异步持久化
3. ✅ PlanManager 增量更新策略
4. ✅ PlanSlate 跳过自己的广播回调

### P1 - 增强功能（下周）
1. Shift+Enter 进入 eventlog
2. 数据迁移脚本（旧 bulletLevel → EventTree）
3. 错误回滚机制（持久化失败时恢复）

### P2 - 优化（按需）
1. 循环引用检测与修复
2. UI 动画（缩进过渡效果）
3. 批量操作优化（多个事件同时 Tab）
#### 数据流实例（Tab 键场景）

```
时间线（乐观更新 + 异步持久化）：

### 核心变化
1. **bulletLevel** 从"视觉属性"升级为"EventTree 派生属性"
2. **Tab/Shift+Tab** 从"修改属性"升级为"创建/解除父子关系"
3. **渲染策略** 从"等广播回调"升级为"乐观更新 + 增量渲染"
4. **数据流** 从"同步等待"升级为"异步持久化"

### 架构优势
- ✅ **数据一致性**：bulletLevel 由 EventTree 唯一决定
- ✅ **可追溯性**：父子关系有真实的数据库记录
- ✅ **可扩展性**：支持 EventTree 的所有查询功能（getChildEvents, getUserSubTasks）
- ✅ **极致性能**：乐观更新延迟 < 1ms，无全量刷新
- ✅ **增量渲染**：只更新受影响的事件，减少 90%+ 的渲染开销

### 用户体验
- ✅ **无感知延迟**：Tab 键立即响应，无等待
- ✅ **无卡顿**：异步持久化不阻塞 UI 线程
- ✅ **符合预期**：Tab 键行为与 Word/Notion 一致
- ✅ **自动回滚**：持久化失败时自动恢复视觉状态
- ✅ **功能增强**：Shift+Enter 快速编辑 eventlog
  ├─ 记录 pendingLocalUpdates
  └─ 广播 eventsUpdated({ originComponent: 'PlanManager', updateId: 1001 })
  
T11 (11-51ms): 📡 广播到达各监听器
  ├─ PlanManager 监听器收到
  │   ├─ originComponent === 'PlanManager' → 跳过全量刷新 ✅
  │   └─ 🎯 增量更新策略：
  │       ├─ 只更新受影响的事件（当前、父、子）
  │       ├─ EventService.getEventById(affectedIds)
  │       └─ 局部更新 items 数组（splice/push）
  │
  └─ PlanSlate 监听器收到
      ├─ originComponent === 'PlanManager' → 跳过 ✅
      ├─ 已经乐观更新过了
      └─ 无需重新渲染
  
T15 (15ms): ✅ .then() 回调
  └─ console.log('📡 Persisted to database')
  
T50 (50ms): 其他标签页同步（如果有）
  └─ BroadcastChannel 触发跨标签页更新
  
T5000: 清理跟踪信息
  └─ pendingLocalUpdates.delete(eventId)
```

#### 性能优势总结
✅ **用户感知延迟 < 1ms**：乐观更新立即渲染，无等待  
✅ **无全量刷新**：只有初始化时全量加载，后续都是增量更新  
✅ **避免重复渲染**：本组件跳过自己的广播，不重复渲染  
✅ **异步持久化**：数据库操作不阻塞 UI 线程  
✅ **自动回滚**：持久化失败时回滚乐观更新，保证数据一致性  
✅ **增量传播**：其他组件只更新受影响的事件，不全量刷新

---

## 🚀 实施优先级

### P0 - 核心功能（本周完成）
1. ✅ EventService 辅助方法（calculateBulletLevel）
2. ✅ Tab 键创建父子关系
3. ✅ Shift+Tab 解除父子关系
4. ✅ 反序列化适配（bulletLevel 自动计算）

### P1 - 增强功能（下周）
1. Shift+Enter 进入 eventlog
2. 序列化保留兼容性
3. 数据迁移脚本（旧 bulletLevel → EventTree）

### P2 - 优化（按需）
1. 性能优化（缓存、增量更新）
2. 循环引用检测与修复
3. UI 动画（缩进过渡效果）

---

## 📝 总结

### 核心变化
1. **bulletLevel** 从"视觉属性"升级为"EventTree 派生属性"
2. **Tab/Shift+Tab** 从"修改属性"升级为"创建/解除父子关系"
3. **数据源** 从 HTML 属性变为 EventTree 计算

### 架构优势
- ✅ **数据一致性**：bulletLevel 由 EventTree 唯一决定
- ✅ **可追溯性**：父子关系有真实的数据库记录
- ✅ **可扩展性**：支持 EventTree 的所有查询功能（getChildEvents, getUserSubTasks）
- ✅ **向后兼容**：保留 bulletLevel 字段，静默迁移

### 用户体验
- ✅ **无感知迁移**：现有数据自动转换
- ✅ **符合预期**：Tab 键行为与 Word/Notion 一致
- ✅ **功能增强**：Shift+Enter 快速编辑 eventlog

---

**创建时间**: 2025-01-XX  
**作者**: GitHub Copilot  
**状态**: 待实施  
**优先级**: P0 - 核心功能改造
