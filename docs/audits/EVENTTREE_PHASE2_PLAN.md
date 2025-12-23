# EventTree Phase 2 优化计划

**日期**: 2025-12-24  
**版本**: v2.22  
**优化阶段**: Phase 2 - 架构改进

---

## 1. Phase 2 目标

### 1.1 核心任务

| 优化项 | 文件 | 当前代码行数 | 目标 | 优先级 |
|-------|------|------------|------|--------|
| **Opt 4**: Tab/Shift+Tab重新父化 | PlanSlate.tsx | ~200行 | 使用EventTreeAPI.reparent() | 🔴 P0 |
| **Opt 6**: EventService.buildEventTree | EventService.ts | ~50行 | 批量查询 + TreeAPI | 🔴 P0 |

### 1.2 预期收益

- **代码减少**: ~200行
- **性能提升**: 3-10x
- **数据一致性**: 原子更新，事务性保障
- **环检测**: 100%覆盖

---

## 2. Opt 4: Tab/Shift+Tab 重构详细计划

### 2.1 当前实现分析

**复杂度统计** (PlanSlate.tsx Line 3011-3450):
- Tab缩进: ~140行代码
- Shift+Tab解缩进: ~200行代码
- 总计: ~340行

**主要问题**:
1. ❌ 手写双向关联更新（子事件 + 父事件childEventIds）
2. ❌ 3次异步数据库写入（旧父 + 新父 + 当前事件）
3. ❌ 无事务性保障（中途失败导致数据不一致）
4. ❌ 无环检测（可能创建循环引用）
5. ❌ 无验证机制（parentEventId不存在）
6. ❌ Slate乐观更新可能与数据库不同步

**当前流程** (Tab缩进):
```typescript
// 1. Slate乐观更新（同步）
Editor.withoutNormalizing(editor, () => {
  setEventLineLevel(editor, currentPath, newBulletLevel);
  Transforms.setNodes(editor, { metadata: { parentEventId: previousEventId } });
  
  // 手动更新父节点childEventIds
  const parentNode = findParentNode(previousEventId);
  if (parentNode) {
    const updatedChildIds = [...existingChildIds, currentEventId];
    Transforms.setNodes(editor, { metadata: { childEventIds: updatedChildIds } });
  }
});

// 2. 异步持久化（分3次写入）
await EventHub.updateFields(currentEventId, { 
  parentEventId: previousEventId,
  bulletLevel: newBulletLevel 
});
await EventHub.updateFields(previousEventId, { childEventIds });
// 旧父节点也需要更新...
```

**性能问题**:
- 每次Tab: **3次数据库写入**
- 每次Shift+Tab: **3次数据库写入**
- 无批量优化

---

### 2.2 目标架构

**使用EventTreeAPI.reparent()实现原子更新**:

```typescript
// ✅ 新实现: Tab缩进 (~30行)
const handleTabIndent = async (currentEventId, previousEventId, currentPath) => {
  try {
    // 1. 计算新层级
    const allEvents = await EventService.getAllEvents();
    const previousEvent = allEvents.find(e => e.id === previousEventId);
    const newBulletLevel = (previousEvent?.bulletLevel || 0) + 1;
    
    // 2. 乐观更新Slate
    Editor.withoutNormalizing(editor, () => {
      setEventLineLevel(editor, currentPath, newBulletLevel);
      Transforms.setNodes(editor, {
        metadata: { parentEventId: previousEventId }
      });
    });
    
    // 3. 使用EventTreeAPI计算影响范围
    const reparentResult = EventTreeAPI.reparent({
      nodeId: currentEventId,
      oldParentId: null,  // 从根移动
      newParentId: previousEventId,
      newPosition: 0,  // 添加到父节点子节点列表末尾
    }, allEvents);
    
    // 4. 批量更新数据库（一次事务）
    await EventHub.batchUpdate(reparentResult.nodesToUpdate);
    
    // 5. 重新计算受影响节点的bulletLevel
    const updatedEvents = await EventService.getAllEvents();
    const newLevels = EventTreeAPI.calculateBulletLevelsBatch(
      reparentResult.affectedSubtree,
      updatedEvents
    );
    
    // 6. 批量更新bulletLevel（一次事务）
    const levelUpdates = Array.from(newLevels.entries()).map(([id, level]) => ({
      eventId: id,
      updates: { bulletLevel: level }
    }));
    await EventHub.batchUpdate(levelUpdates);
    
  } catch (error) {
    console.error('Tab indent failed:', error);
    
    // 回滚Slate状态
    Editor.withoutNormalizing(editor, () => {
      setEventLineLevel(editor, currentPath, oldLevel);
      Transforms.setNodes(editor, {
        metadata: { parentEventId: oldParentId }
      });
    });
  }
};
```

**收益**:
- ✅ 代码减少: 140行 → 30行 (减少110行)
- ✅ 数据库写入: 3次 → 2次批量 (性能3x)
- ✅ 原子性: 使用batchUpdate()事务
- ✅ 环检测: EventTreeAPI自动检测
- ✅ 验证: 自动检测parentEventId存在性

---

### 2.3 Shift+Tab 目标架构

```typescript
// ✅ 新实现: Shift+Tab解缩进 (~40行)
const handleShiftTabOutdent = async (currentEventId, currentPath) => {
  try {
    // 1. 查找当前节点和父节点
    const allEvents = await EventService.getAllEvents();
    const currentEvent = allEvents.find(e => e.id === currentEventId);
    const oldParentId = currentEvent?.parentEventId;
    
    // 2. 查找新父节点（祖父节点）
    const oldParent = oldParentId ? allEvents.find(e => e.id === oldParentId) : null;
    const newParentId = oldParent?.parentEventId;  // 可能为undefined（变成根节点）
    const newLevel = newParentId 
      ? (allEvents.find(e => e.id === newParentId)?.bulletLevel || 0) + 1
      : 0;
    
    // 3. 乐观更新Slate
    Editor.withoutNormalizing(editor, () => {
      setEventLineLevel(editor, currentPath, newLevel);
      Transforms.setNodes(editor, {
        metadata: { parentEventId: newParentId }
      });
    });
    
    // 4. 使用EventTreeAPI计算影响范围
    const reparentResult = EventTreeAPI.reparent({
      nodeId: currentEventId,
      oldParentId: oldParentId,
      newParentId: newParentId,
      newPosition: 0,
    }, allEvents);
    
    // 5. 批量更新数据库
    await EventHub.batchUpdate(reparentResult.nodesToUpdate);
    
    // 6. 重新计算bulletLevel
    const updatedEvents = await EventService.getAllEvents();
    const newLevels = EventTreeAPI.calculateBulletLevelsBatch(
      reparentResult.affectedSubtree,
      updatedEvents
    );
    
    const levelUpdates = Array.from(newLevels.entries()).map(([id, level]) => ({
      eventId: id,
      updates: { bulletLevel: level }
    }));
    await EventHub.batchUpdate(levelUpdates);
    
  } catch (error) {
    // 回滚...
  }
};
```

---

### 2.4 EventHub.batchUpdate() 实现

**需要在EventHub中添加批量更新方法**:

```typescript
// EventHub.ts
/**
 * 批量更新多个事件（一次事务）
 * 
 * @param updates - 更新列表
 */
static async batchUpdate(
  updates: Array<{ eventId: string; updates: Partial<Event> }>
): Promise<void> {
  // 实现事务性批量更新
  // TODO: 使用数据库事务API
  for (const { eventId, updates } of updates) {
    await this.updateFields(eventId, updates, { source: 'EventTreeAPI' });
  }
}
```

---

## 3. Opt 6: EventService.buildEventTree 重构

### 3.1 当前实现问题

**当前代码** (EventService.ts Line 5633):
```typescript
static async buildEventTree(rootId: string): Promise<EventTreeNode> {
  const event = await this.getEventById(rootId);
  if (!event) throw new Error(`Event not found: ${rootId}`);
  
  const children: EventTreeNode[] = [];
  if (event.childEventIds && event.childEventIds.length > 0) {
    for (const childId of event.childEventIds) {
      const childTree = await this.buildEventTree(childId);  // ❌ 递归N次查询
      children.push(childTree);
    }
  }
  
  return {
    id: event.id,
    event,
    children,
  };
}
```

**问题**:
- ❌ N次异步递归查询（10层树 = 10次DB查询）
- ❌ O(n²) 时间复杂度
- ❌ 无环检测（可能死循环）
- ❌ 无法批量加载

---

### 3.2 目标架构

```typescript
// ✅ 新实现: 批量查询 + TreeAPI构建
static async buildEventTree(rootId: string): Promise<EventTreeNode> {
  // 1. 批量查询所有事件（一次查询）
  const allEvents = await this.getAllEvents();
  
  // 2. 使用EventTreeAPI获取完整子树
  const subtree = EventTreeAPI.getSubtree(rootId, allEvents);
  
  // 3. 构建TreeNode结构（纯内存操作）
  const eventsById = new Map(subtree.map(e => [e.id, e]));
  const buildNode = (id: string): EventTreeNode => {
    const event = eventsById.get(id);
    if (!event) throw new Error(`Event not found: ${id}`);
    
    const children = (event.childEventIds || [])
      .map(childId => buildNode(childId))
      .filter(Boolean);
    
    return {
      id: event.id,
      event,
      children,
    };
  };
  
  return buildNode(rootId);
}
```

**收益**:
- ✅ 数据库查询: N次 → 1次 (性能10x+)
- ✅ 时间复杂度: O(n²) → O(n)
- ✅ 自动环检测
- ✅ 代码减少: ~50行 → ~20行

---

## 4. 实施计划

### 4.1 Phase 2.1: EventHub.batchUpdate() (0.5天)

- [ ] 在EventHub.ts中实现batchUpdate()方法
- [ ] 添加事务性保障（如果支持）
- [ ] 添加单元测试

### 4.2 Phase 2.2: Tab缩进重构 (1天)

- [ ] 提取handleTabIndent()辅助函数
- [ ] 集成EventTreeAPI.reparent()
- [ ] 测试父子关系正确性
- [ ] 测试bulletLevel更新
- [ ] 清理旧代码（移除手动childEventIds更新）

### 4.3 Phase 2.3: Shift+Tab重构 (1天)

- [ ] 提取handleShiftTabOutdent()辅助函数
- [ ] 集成EventTreeAPI.reparent()
- [ ] 测试解除父化逻辑
- [ ] 测试根节点变化
- [ ] 清理旧代码

### 4.4 Phase 2.4: buildEventTree重构 (0.5天)

- [ ] 重构EventService.buildEventTree()
- [ ] 移除递归查询
- [ ] 使用EventTreeAPI.getSubtree()
- [ ] 测试树结构正确性
- [ ] 更新所有调用方（TimeLog等）

---

## 5. 风险与缓解

### 5.1 风险识别

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| Slate状态与DB不同步 | 数据丢失 | 中 | 完善回滚机制 |
| batchUpdate()失败 | 部分更新 | 低 | 添加事务回滚 |
| 性能回退 | 用户体验差 | 低 | 保留性能监控 |
| 破坏现有功能 | 严重 | 中 | 全面测试 |

### 5.2 回滚计划

- 保留旧代码注释（不立即删除）
- 添加feature flag控制新/旧实现
- 监控错误日志，发现问题立即回滚

---

## 6. 测试计划

### 6.1 单元测试

- [ ] EventTreeAPI.reparent()边界用例
- [ ] batchUpdate()事务性测试
- [ ] buildEventTree()环检测

### 6.2 集成测试

- [ ] Tab缩进后父子关系正确
- [ ] Shift+Tab后父子关系正确
- [ ] bulletLevel自动更新
- [ ] 连续Tab/Shift+Tab操作
- [ ] 多层嵌套场景

### 6.3 性能测试

- [ ] Tab操作延迟 < 50ms
- [ ] buildEventTree(100节点) < 100ms
- [ ] 批量更新vs逐个更新对比

---

## 7. 完成标准

### 7.1 代码质量

- ✅ 移除200+行重复逻辑
- ✅ 统一使用EventTreeAPI
- ✅ 无TypeScript错误
- ✅ 代码覆盖率 > 80%

### 7.2 功能完整性

- ✅ Tab/Shift+Tab功能正常
- ✅ buildEventTree返回结构正确
- ✅ 所有现有功能无回归

### 7.3 性能指标

- ✅ Tab操作性能提升 > 3x
- ✅ buildEventTree性能提升 > 10x
- ✅ 数据库写入减少 > 50%

---

**下一步**: 开始Phase 2.1 - 实现EventHub.batchUpdate()
