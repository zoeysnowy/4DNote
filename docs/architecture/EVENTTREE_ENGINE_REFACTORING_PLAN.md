# EventTree Engine 架构重构方案

**日期**: 2025-12-23  
**状态**: 🎯 设计阶段  
**目标**: 解决 PlanManager 中层级管理的结构性问题  

---

## 📋 目录

1. [问题诊断](#问题诊断)
2. [现有架构分析](#现有架构分析)
3. [EventTree Engine 设计](#eventtree-engine-设计)
4. [数据流重构](#数据流重构)
5. [实施路线图](#实施路线图)
6. [Tab/Shift+Tab 行为规格](#tabshifttab-行为规格)

---

## 问题诊断

### 核心症状

你遇到的"**一直在修理，总是修不好**"不是错觉，而是结构性问题：

```
现象：
- Tab键父子关系 → 刷新后丢失
- bulletLevel 层级 → 保存后错乱
- setTimeout 创可贴 → 越修越多
- 键盘操作 → 总有边界case失效
```

### 根本原因

#### 1. **多源真相 (Multiple Sources of Truth)**

当前系统中至少有 **4套** 互相关联的层级信息：

| 数据源 | 位置 | 用途 | 计算方式 |
|--------|------|------|----------|
| `Event.parentEventId` | EventService | 事件树父节点 | 用户操作/同步 |
| `Event.childEventIds` | EventService | 事件树子节点列表 | 双向维护 |
| `Event.bulletLevel` | PlanManager计算 | 渲染缩进层级 | DFS 遍历计算 |
| `Event.position` | EventService | 兄弟节点顺序 | 手动设置 |
| `Slate metadata.parentEventId` | PlanSlate | 编辑器内存 | Tab/Shift+Tab修改 |

**问题**: 这些字段在不同路径下计算结果不一致：
- `loadInitialData`: DFS遍历 + `calculateAllBulletLevels()`
- `incrementalUpdateEvent`: 局部更新 + 部分重算
- `executeBatchUpdate`: 清理无效 parentId + 全量排序
- Snapshot 模式: 重新构建 EventTree + 重算层级

#### 2. **职责边界混乱 (God Component)**

**PlanManager.tsx** (3421行) 同时负责：

```typescript
// ❌ 单个组件包含太多职责
PlanManager {
  // UI 状态管理
  - 侧边栏过滤、标签、搜索
  - snapshot 模式切换
  - hover 状态
  
  // 数据层
  - items / editorItems / pendingEmptyItems
  - itemsMap / eventIndexMap
  
  // 树形逻辑
  - DFS 遍历排序 (L591-700, L1977-2026)
  - bulletLevel 计算 (调用 EventService)
  - parentEventId 校验 (executeBatchUpdate)
  
  // 持久化
  - debouncedOnChange
  - executeBatchUpdate
  - 直接调用 EventHub.createEvent
  
  // 同步集成
  - TimeHub / syncToUnifiedTimeline
  - EventHistoryService
}
```

**结果**: 任何键盘操作都要穿过 5-10 层逻辑，无法局部推理。

#### 3. **事件流过载 (Event Flow Overload)**

以 **Tab 键缩进** 为例：

```
用户按 Tab
  ↓
PlanSlate keydown (L3147)
  ├─ Editor.withoutNormalizing
  ├─ Transforms.setNodes({ metadata: { parentEventId } })
  ├─ flushPendingChanges(editor.children)  ← 🔥 立即保存
  ↓
PlanManager.handleLinesChange
  ├─ debouncedOnChange (300ms防抖)
  ├─ executeBatchUpdate
  │   ├─ 解析 create/update/delete
  │   ├─ 清理无效 parentEventId
  │   ├─ EventHub.updateEvent
  │   └─ TimeHub.syncToUnifiedTimeline
  ↓
EventService.updateEvent
  ├─ normalizeEvent
  ├─ storageManager.updateEvent
  └─ dispatchEventUpdate('eventsUpdated')
  ↓
PlanManager 监听 eventsUpdated
  ├─ incrementalUpdateEvent(eventId)
  ├─ 批量获取受影响的事件
  ├─ calculateAllBulletLevels (重新计算)
  ├─ 更新 items 数组
  └─ 可能触发循环 (isLocalUpdate 防护)
```

**问题**: 一次键盘操作 = **5次数据流往返** + 多种路径更新同一批字段。

---

## 现有架构分析

### ✅ 已有的优秀设计

你的系统已经有非常好的基础：

#### 1. **EventService 的 Tree 方法**

```typescript
// ✅ 已实现的纯函数逻辑
EventService {
  // 层级计算
  static calculateBulletLevel(event, eventMap, visited): number
  static calculateAllBulletLevels(events): Map<string, number>
  
  // 树遍历
  static async getEventTree(rootId): Promise<Event[]>  // BFS
  static async buildEventTree(rootId): Promise<EventTreeNode>  // 递归
  
  // 子事件查询
  static async getChildEvents(parentId): Promise<Event[]>  // ⚡️ v2.20批量查询
  static async getTotalDuration(parentId): Promise<number>
  static async getRootEvent(eventId): Promise<Event | null>
}
```

**这些方法已经是 "EventTreeEngine" 的雏形！**

#### 2. **EventTree 组件**

你已有完整的树形编辑器：

```
src/components/EventTree/
  ├─ EventTreeViewer.tsx     - 查看器入口
  ├─ EventTreeSlate.tsx      - 单实例编辑器（类似PlanSlate）
  ├─ EditableEventTree.tsx   - 多实例编辑器
  └─ EventTreeCanvas.tsx     - 可视化渲染
```

**这些组件已经在处理树形结构，可以复用！**

#### 3. **PlanManager 的 DFS 排序**

```typescript
// L591-700: 完整的深度优先遍历逻辑
const addEventWithChildren = (event: Event) => {
  if (visited.has(event.id!)) return;
  visited.add(event.id!);
  sortedEvents.push(event);
  
  const children = (event.childEventIds || [])
    .map(childId => eventMap.get(childId))
    .filter((child): child is Event => !!child)
    .sort((a, b) => {
      if (a.position !== undefined && b.position !== undefined) {
        return a.position - b.position;
      }
      // ...
    });
  
  children.forEach(child => addEventWithChildren(child));
};
```

**这个逻辑已经很完善，只需要抽取出来！**

### ❌ 需要优化的地方

#### 1. **散落的树逻辑**

```
树形逻辑分布在：
- EventService (calculateBulletLevel, buildEventTree)
- PlanManager (DFS排序, L591-700)
- PlanManager.incrementalUpdateEvent (局部更新)
- PlanManager.snapshot模式 (重新构建树)
- PlanSlate (Tab/Shift+Tab 修改 parentId)
```

**问题**: 没有"唯一真相源"，每处各算一遍，结果不一致。

#### 2. **同步 vs 异步混乱**

```typescript
// ❌ PlanSlate: 同步修改 + 立即保存
Editor.withoutNormalizing(() => {
  Transforms.setNodes({ metadata: { parentEventId } });
});
flushPendingChanges(editor.children);  // 立即保存

// ❌ PlanManager: 300ms防抖 + 批量更新
const debouncedOnChange = useMemo(() => 
  debounce((items: Event[]) => { ... }, 300)
);
```

**问题**: Tab键绕过防抖 → 时序混乱 → setTimeout 创可贴。

---

## EventTree Engine 设计

### 核心思路

**GPT的建议完全正确**: 把树逻辑抽成一个纯函数模块。但你提出了更好的方案：

> "EventTreeEngine 融合进 EventService，作为清晰分层的子模块"

### 架构决策

```
EventService/
  ├─ normalize.ts       - 数据规范化
  ├─ storage.ts         - 持久化
  ├─ sync.ts            - 同步逻辑
  └─ tree/              - 🆕 EventTree 子模块
      ├─ TreeEngine.ts  - 🔥 纯函数树逻辑
      ├─ TreeAPI.ts     - EventService 高阶API
      └─ types.ts       - 树相关类型
```

### 1. TreeEngine.ts - 纯函数模块

```typescript
/**
 * EventTree 纯函数引擎
 * 不依赖 React/Slate，只依赖 Event 类型
 * 可单元测试，可独立验证
 */

// ==================== 类型定义 ====================

export interface EventNode {
  id: string;
  parentEventId?: string | null;
  childEventIds?: string[];
  position?: number | string;  // 兄弟节点顺序
  createdAt?: string;
  updatedAt?: string;
}

export interface EventTreeResult {
  // DFS 排序后的 ID 列表（用于渲染顺序）
  sortedIds: string[];
  
  // 每个节点的 bulletLevel（0=根，1=子，2=孙...）
  bulletLevels: Map<string, number>;
  
  // 以 parentId 分组的 children 列表（已排序）
  childrenByParentId: Map<string | null, string[]>;
  
  // 孤儿节点（parent不存在或形成环）
  orphans: string[];
  
  // 环检测
  cycles: string[][];
}

export interface SiblingOrderUpdate {
  parentId: string | null;
  orderedIds: string[];
  bulletLevels: Map<string, number>;
}

export interface ReparentUpdateInput {
  movedId: string;
  newParentId: string | null;
}

export interface ReparentUpdateResult {
  // 需要更新的 parentEventId 映射
  parentChanges: Map<string, string | null>;
  
  // 受影响子树的 bulletLevel
  bulletLevelChanges: Map<string, number>;
}

// ==================== 核心函数 ====================

/**
 * 从事件列表构建完整树结构
 * - DFS 排序
 * - 计算 bulletLevel
 * - 检测孤儿/环
 * 
 * @param events - 事件列表（可以是部分事件）
 * @returns EventTreeResult
 */
export function buildEventTree(events: EventNode[]): EventTreeResult {
  const eventMap = new Map(events.map(e => [e.id, e]));
  const visited = new Set<string>();
  const sortedIds: string[] = [];
  const bulletLevels = new Map<string, number>();
  const childrenByParentId = new Map<string | null, string[]>();
  const orphans: string[] = [];
  const cycles: string[][] = [];
  
  // 1. 预处理：按 parentId 分组 children
  events.forEach(event => {
    const parentId = event.parentEventId || null;
    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }
    childrenByParentId.get(parentId)!.push(event.id);
  });
  
  // 2. 排序每个 parent 下的 children（按 position/createdAt）
  childrenByParentId.forEach((children, parentId) => {
    children.sort((idA, idB) => {
      const a = eventMap.get(idA);
      const b = eventMap.get(idB);
      if (!a || !b) return 0;
      
      // 优先 position
      if (a.position !== undefined && b.position !== undefined) {
        return Number(a.position) - Number(b.position);
      }
      if (a.position !== undefined) return -1;
      if (b.position !== undefined) return 1;
      
      // 降级 createdAt
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });
  });
  
  // 3. DFS 遍历（检测环）
  const dfs = (eventId: string, level: number, path: Set<string>) => {
    // 环检测
    if (path.has(eventId)) {
      const cycle = Array.from(path).concat(eventId);
      cycles.push(cycle);
      return;
    }
    
    // 已访问
    if (visited.has(eventId)) return;
    
    const event = eventMap.get(eventId);
    if (!event) {
      orphans.push(eventId);
      return;
    }
    
    // 标记访问
    visited.add(eventId);
    path.add(eventId);
    
    // 记录结果
    sortedIds.push(eventId);
    bulletLevels.set(eventId, level);
    
    // 递归子节点
    const children = childrenByParentId.get(eventId) || [];
    children.forEach(childId => {
      dfs(childId, level + 1, new Set(path));
    });
    
    path.delete(eventId);
  };
  
  // 4. 从顶层节点开始遍历
  const topLevelIds = childrenByParentId.get(null) || [];
  topLevelIds.forEach(id => dfs(id, 0, new Set()));
  
  // 5. 找出孤儿（有 parent 但 parent 不存在）
  events.forEach(event => {
    if (event.parentEventId && !eventMap.has(event.parentEventId)) {
      if (!visited.has(event.id)) {
        orphans.push(event.id);
      }
    }
  });
  
  return {
    sortedIds,
    bulletLevels,
    childrenByParentId,
    orphans,
    cycles
  };
}

/**
 * 重新计算某个 parent 下的兄弟节点顺序
 * 用于 Tab/Shift+Tab 局部调整
 * 
 * @param eventsById - 事件 Map
 * @param parentId - 父节点 ID（null=顶层）
 * @returns SiblingOrderUpdate
 */
export function recomputeSiblings(
  eventsById: Map<string, EventNode>,
  parentId: string | null
): SiblingOrderUpdate {
  const children = Array.from(eventsById.values())
    .filter(e => (e.parentEventId || null) === parentId);
  
  const orderedIds = children
    .sort((a, b) => {
      // 按 position/createdAt 排序
      if (a.position !== undefined && b.position !== undefined) {
        return Number(a.position) - Number(b.position);
      }
      if (a.position !== undefined) return -1;
      if (b.position !== undefined) return 1;
      
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    })
    .map(e => e.id);
  
  const bulletLevels = new Map<string, number>();
  const parentLevel = parentId 
    ? calculateLevel(parentId, eventsById) 
    : -1;
  
  orderedIds.forEach(id => {
    bulletLevels.set(id, parentLevel + 1);
  });
  
  return { parentId, orderedIds, bulletLevels };
}

/**
 * 计算节点被重新父化后的影响范围
 * 用于 Tab/Shift+Tab 修改父节点
 * 
 * @param eventsById - 事件 Map
 * @param input - { movedId, newParentId }
 * @returns ReparentUpdateResult
 */
export function computeReparentEffect(
  eventsById: Map<string, EventNode>,
  input: ReparentUpdateInput
): ReparentUpdateResult {
  const { movedId, newParentId } = input;
  const parentChanges = new Map<string, string | null>();
  const bulletLevelChanges = new Map<string, number>();
  
  // 1. 记录 parent 变化
  parentChanges.set(movedId, newParentId);
  
  // 2. 计算新 bulletLevel
  const newLevel = newParentId 
    ? calculateLevel(newParentId, eventsById) + 1
    : 0;
  
  // 3. 递归更新子树的 bulletLevel
  const updateSubtree = (eventId: string, level: number) => {
    bulletLevelChanges.set(eventId, level);
    
    const event = eventsById.get(eventId);
    if (!event) return;
    
    (event.childEventIds || []).forEach(childId => {
      updateSubtree(childId, level + 1);
    });
  };
  
  updateSubtree(movedId, newLevel);
  
  return { parentChanges, bulletLevelChanges };
}

// ==================== 辅助函数 ====================

function calculateLevel(
  eventId: string,
  eventsById: Map<string, EventNode>,
  visited: Set<string> = new Set()
): number {
  if (visited.has(eventId)) return 0;  // 环
  visited.add(eventId);
  
  const event = eventsById.get(eventId);
  if (!event || !event.parentEventId) return 0;
  
  return 1 + calculateLevel(event.parentEventId, eventsById, visited);
}
```

### 2. TreeAPI.ts - EventService 高阶接口

```typescript
/**
 * EventService 树形操作的高阶 API
 * 内部调用 TreeEngine 纯函数
 */

import * as TreeEngine from './TreeEngine';

export class EventTreeAPI {
  /**
   * 重建 Plan 范围的树结构
   * 用于初始化加载、snapshot 切换
   */
  static async rebuildPlanTree(scope: PlanScope): Promise<TreeEngine.EventTreeResult> {
    const events = await EventService.getPlanEvents(scope);
    const nodes: TreeEngine.EventNode[] = events.map(e => ({
      id: e.id,
      parentEventId: e.parentEventId,
      childEventIds: e.childEventIds,
      position: e.position,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt
    }));
    
    return TreeEngine.buildEventTree(nodes);
  }
  
  /**
   * Tab 键：将事件移动到新 parent 下
   */
  static async reparentEvent(
    movedId: string,
    newParentId: string | null
  ): Promise<void> {
    // 1. 获取所有相关事件
    const allEvents = await EventService.getAllEvents();
    const eventsById = new Map(allEvents.map(e => [e.id, e]));
    
    // 2. 计算影响范围
    const effect = TreeEngine.computeReparentEffect(eventsById, {
      movedId,
      newParentId
    });
    
    // 3. 批量更新数据库
    const updates: Array<{ id: string; changes: Partial<Event> }> = [];
    
    effect.parentChanges.forEach((parentId, eventId) => {
      updates.push({
        id: eventId,
        changes: { parentEventId: parentId }
      });
    });
    
    effect.bulletLevelChanges.forEach((level, eventId) => {
      const existing = updates.find(u => u.id === eventId);
      if (existing) {
        existing.changes.bulletLevel = level;
      } else {
        updates.push({
          id: eventId,
          changes: { bulletLevel: level }
        });
      }
    });
    
    // 4. 一次性写入（事务）
    await EventService.batchUpdateEvents(updates);
    
    // 5. 广播变更
    EventHub.dispatchEventUpdate('events-reparented', {
      movedId,
      newParentId,
      affectedIds: Array.from(effect.bulletLevelChanges.keys())
    });
  }
  
  /**
   * 重新排序兄弟节点
   */
  static async reorderSiblings(
    parentId: string | null,
    orderedIds: string[]
  ): Promise<void> {
    const updates = orderedIds.map((id, index) => ({
      id,
      changes: { position: index }
    }));
    
    await EventService.batchUpdateEvents(updates);
  }
}
```

---

## 数据流重构

### 新的数据流：Tab 键案例

```
┌─────────────────────────────────────────────────┐
│ (1) 键盘事件: Tab                                │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ (2) PlanSlate.onKeyDown                          │
│  - 捕获 Tab 键                                   │
│  - 不修改 Slate metadata！                       │
│  - 调用 onReparentEvent(eventId, newParentId)  │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ (3) PlanManager.handleReparent                   │
│  - 记录操作：reparentQueue.push({ eventId, newParentId }) │
│  - 调用 debouncedApplyTreeChanges()            │
└──────────────────┬──────────────────────────────┘
                   ↓
           (等待 300ms 防抖)
                   ↓
┌─────────────────────────────────────────────────┐
│ (4) PlanManager.applyTreeChanges                │
│  - 批量处理 reparentQueue                       │
│  - 调用 EventTreeAPI.reparentEvent(...)        │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ (5) EventTreeAPI.reparentEvent                  │
│  1) 获取所有相关事件                             │
│  2) 调用 TreeEngine.computeReparentEffect()    │
│  3) 生成批量更新列表                             │
│  4) EventService.batchUpdateEvents()           │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ (6) EventService.batchUpdateEvents              │
│  - StorageManager 批量写入                      │
│  - dispatchEventUpdate('events-reparented')    │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│ (7) PlanManager 监听 events-reparented          │
│  - 调用 EventTreeAPI.rebuildPlanTree()         │
│  - 更新 items（按新的 sortedIds）               │
│  - 触发 React re-render                         │
└─────────────────────────────────────────────────┘
```

### 关键改进

#### ✅ 单向数据流

```
UI操作 → 队列 → 防抖 → TreeEngine计算 → 批量DB写入 → 事件广播 → UI更新
```

#### ✅ 唯一真相源

```
TreeEngine.buildEventTree() 是唯一计算 bulletLevel 的地方
- PlanManager初始化：调用它
- Snapshot切换：调用它
- Tab/Shift+Tab：调用它
- 增量更新：调用它
```

#### ✅ 可测试

```typescript
// ✅ 纯函数，易于单元测试
describe('TreeEngine.buildEventTree', () => {
  it('should calculate bulletLevel correctly', () => {
    const events = [
      { id: 'a', parentEventId: null },
      { id: 'b', parentEventId: 'a' },
      { id: 'c', parentEventId: 'b' }
    ];
    
    const result = TreeEngine.buildEventTree(events);
    
    expect(result.bulletLevels.get('a')).toBe(0);
    expect(result.bulletLevels.get('b')).toBe(1);
    expect(result.bulletLevels.get('c')).toBe(2);
  });
  
  it('should detect cycles', () => {
    const events = [
      { id: 'a', parentEventId: 'b' },
      { id: 'b', parentEventId: 'a' }
    ];
    
    const result = TreeEngine.buildEventTree(events);
    
    expect(result.cycles.length).toBe(1);
  });
});
```

---

## 实施路线图

### Phase 1: 抽取 TreeEngine (1-2天)

**目标**: 创建纯函数模块，不破坏现有功能

```typescript
// 创建文件
src/services/EventTree/
  ├─ TreeEngine.ts     - 纯函数逻辑
  ├─ TreeAPI.ts        - EventService 高阶API
  └─ types.ts          - 类型定义
```

**步骤**:

1. **复制现有逻辑** → TreeEngine.ts
   - EventService.calculateBulletLevel → TreeEngine.buildEventTree
   - PlanManager DFS排序 → TreeEngine 内部实现
   
2. **添加单元测试**
   ```typescript
   tests/services/TreeEngine.test.ts
   - ✅ 计算 bulletLevel
   - ✅ 检测环
   - ✅ 孤儿节点处理
   - ✅ position 排序
   ```

3. **验证一致性**
   - 在 PlanManager 中同时调用新旧两个实现
   - 对比结果，确保 100% 一致
   - 通过后，删除旧实现

### Phase 2: 重构 PlanManager 初始化 (1天)

**目标**: 初始化加载改用 TreeEngine

```typescript
// BEFORE
const bulletLevels = EventService.calculateAllBulletLevels(filtered);
const sorted = /* 手写 DFS 排序 */;

// AFTER
const treeResult = await EventTreeAPI.rebuildPlanTree({ isPlan: true });
const itemsWithLevels = treeResult.sortedIds.map(id => ({
  ...eventMap.get(id),
  bulletLevel: treeResult.bulletLevels.get(id)
}));
```

**验证**: 
- 刷新页面 → 层级正确
- Snapshot 切换 → 层级正确

### Phase 3: 重构 Tab/Shift+Tab (2天)

**目标**: 移除 setTimeout，改用防抖队列

```typescript
// PlanSlate.tsx
const handleKeyDown = (event: React.KeyboardEvent) => {
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    
    // ❌ BEFORE: 立即修改 metadata + 立即保存
    // Editor.withoutNormalizing(() => {
    //   Transforms.setNodes({ metadata: { parentEventId } });
    // });
    // flushPendingChanges(editor.children);
    
    // ✅ AFTER: 只记录意图，交给 PlanManager 处理
    const eventId = getCurrentEventId(editor);
    const newParentId = getPreviousEventId(editor);
    onReparentEvent?.(eventId, newParentId);
  }
};

// PlanManager.tsx
const [reparentQueue, setReparentQueue] = useState<Array<{eventId: string, newParentId: string}>>([]);

const debouncedApplyTreeChanges = useMemo(() =>
  debounce(async () => {
    if (reparentQueue.length === 0) return;
    
    // 批量处理所有 reparent 操作
    for (const { eventId, newParentId } of reparentQueue) {
      await EventTreeAPI.reparentEvent(eventId, newParentId);
    }
    
    // 清空队列
    setReparentQueue([]);
    
    // 重建树
    const treeResult = await EventTreeAPI.rebuildPlanTree({ isPlan: true });
    setItems(/* 按 treeResult.sortedIds 排序 */);
  }, 300),
  [reparentQueue]
);

const handleReparent = useCallback((eventId: string, newParentId: string) => {
  setReparentQueue(prev => [...prev, { eventId, newParentId }]);
  debouncedApplyTreeChanges();
}, []);
```

**验证**:
- Tab键 → 层级改变 → 保存 → 刷新 → 层级保持 ✅
- 连续快速 Tab → 最终结果正确 ✅

### Phase 4: 增量更新优化 (1天)

**目标**: incrementalUpdateEvent 也用 TreeEngine

```typescript
const incrementalUpdateEvent = useCallback(async (eventId: string) => {
  // 1. 获取受影响的事件范围
  const affected = await getAffectedEvents(eventId);
  
  // 2. 用 TreeEngine 重新计算这些事件的 bulletLevel
  const nodes = affected.map(e => ({
    id: e.id,
    parentEventId: e.parentEventId,
    childEventIds: e.childEventIds,
    // ...
  }));
  
  const treeResult = TreeEngine.buildEventTree(nodes);
  
  // 3. 增量更新 items
  setItems(prev => {
    const newItems = [...prev];
    treeResult.sortedIds.forEach((id, index) => {
      const idx = newItems.findIndex(e => e.id === id);
      if (idx !== -1) {
        newItems[idx] = {
          ...newItems[idx],
          bulletLevel: treeResult.bulletLevels.get(id)
        };
      }
    });
    return newItems;
  });
}, []);
```

### Phase 5: 清理旧代码 (半天)

**删除**:
- PlanManager 中的手写 DFS 排序
- PlanSlate 中的 setTimeout
- 所有 `skipNextOnChange` / `isLocalUpdate` 补丁逻辑

---

## Tab/Shift+Tab 行为规格

用于编写单元测试和验证正确性

### Case T1: 普通缩进

**初始状态**:
```
L1: eventId=A, parent=null, level=0
L2: eventId=B, parent=null, level=0 ← 光标在这
L3: eventId=C, parent=null, level=0
```

**操作**: 在 L2 按 Tab

**期望结果**:
```
结构:
  L1: parent=null, level=0
  L2: parent=A, level=1     ← 成为 A 的子节点
  L3: parent=null, level=0

排序: sortedIds = [A, B, C]

持久化:
  Event B: parentEventId = A
  Event A: childEventIds = [B]
```

### Case T2: 多级嵌套

**初始状态**:
```
L1: A, parent=null, level=0
L2: B, parent=A, level=1
L3: C, parent=A, level=1 ← 光标在这
```

**操作**: 在 L3 按 Tab

**期望结果**:
```
结构:
  L1: A, parent=null, level=0
  L2: B, parent=A, level=1
  L3: C, parent=B, level=2  ← 成为 B 的子节点

Event B: childEventIds = [C]
Event C: parentEventId = B, bulletLevel = 2
```

### Case S1: 提升节点

**初始状态**:
```
L1: A, parent=null, level=0
L2: B, parent=A, level=1 ← 光标在这
```

**操作**: 在 L2 按 Shift+Tab

**期望结果**:
```
结构:
  L1: A, parent=null, level=0
  L2: B, parent=null, level=0  ← 提升为顶层

Event B: parentEventId = null
Event A: childEventIds = []
```

### Case B1: 防止环

**初始状态**:
```
L1: A, parent=null
L2: B, parent=A
L3: C, parent=B ← 光标在这
```

**操作**: 尝试将 A 设为 C 的子节点

**期望结果**: 
- **拒绝操作**（会形成环 A → B → C → A）
- 显示错误提示
- TreeEngine.buildEventTree 检测到 cycle

---

## 总结

### 核心改进

| 问题 | 当前状态 | 改进后 |
|------|---------|--------|
| **多源真相** | 4处计算 bulletLevel | TreeEngine 唯一真相 |
| **职责混乱** | PlanManager 3421行 | 分离 Tree 逻辑 |
| **事件流过载** | Tab = 5次往返 | Tab = 1次防抖处理 |
| **时序问题** | setTimeout 创可贴 | 防抖队列 |
| **可测试性** | 无法单元测试 | TreeEngine 纯函数 |

### 预期收益

1. **稳定性**: bulletLevel 计算结果 100% 一致
2. **性能**: 减少 5次往返 → 1次批量更新
3. **可维护性**: 树逻辑集中在 TreeEngine，易于理解
4. **可扩展性**: 新增树形功能（拖拽排序、批量移动）只需修改 TreeEngine

### 风险控制

- Phase 1-2: 新旧并行，验证一致性，**零风险**
- Phase 3-4: 渐进替换，每个 Phase 独立测试
- Phase 5: 最后清理，此时新系统已稳定运行

---

**建议**: 先实施 Phase 1（1-2天），验证 TreeEngine 逻辑正确后，再决定是否继续。
