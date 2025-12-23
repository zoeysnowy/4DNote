# EventTree Phase 3 使用指南

**版本**: v2.20.3  
**日期**: 2025-12-24

---

## 🎯 快速开始

Phase 3为EventTree添加了三大新功能：**原子事务**、**智能缓存**、**性能监控**。

---

## 1. 原子事务（batchUpdateTransaction）

### 使用场景
- Tab/Shift+Tab缩进操作（父子关系必须原子化）
- 批量移动事件（多个事件的父节点同时变化）
- 任何需要"全部成功或全部失败"的批量更新

### 基本用法

```typescript
import { EventHub } from '@/services/EventHub';

// Tab缩进示例：父子关系更新必须原子化
const result = await EventHub.batchUpdateTransaction([
  { 
    eventId: 'child_1', 
    updates: { parentEventId: 'new_parent' } 
  },
  { 
    eventId: 'new_parent', 
    updates: { childEventIds: [...oldChildren, 'child_1'] } 
  },
], {
  skipSync: false,
  source: 'Tab缩进'
});

if (!result.success) {
  // 所有更新已自动回滚
  console.error('事务失败，已回滚', result.error);
  // 需要回滚Slate编辑器状态
  Transforms.undo(editor);
}
```

### 与batchUpdate的区别

| 特性 | batchUpdate | batchUpdateTransaction |
|------|-------------|------------------------|
| **原子性** | ❌ 部分成功/失败 | ✅ 全部成功或全部失败 |
| **错误处理** | 收集错误列表 | 自动回滚 |
| **适用场景** | 独立更新 | 关联更新 |
| **性能** | 顺序N次updateFields | 单次批量写入 |

---

## 2. 智能缓存（TreeCache）

### 使用场景
- PlanManager中构建日视图树
- 重复访问相同日期的事件树
- 大树（500+节点）性能优化

### 基本用法

```typescript
import { treeCache } from '@/services/EventTree';

// PlanManager中使用
const cacheKey = `plan_${currentDate}`; // 例如: 'plan_20250101'

// 首次构建：~20ms（缓存）
const tree = treeCache.getCachedTree(validEvents, cacheKey);
console.log(tree.stats.totalNodes); // 100

// 再次访问：<1ms（缓存命中）
const tree2 = treeCache.getCachedTree(validEvents, cacheKey);
// ✅ 缓存命中，20x提升
```

### 增量更新

```typescript
// Tab/Shift+Tab后增量更新
const updatedTree = treeCache.incrementalUpdate(
  cacheKey,
  ['event_123'], // 变化的事件ID
  allEventsAfterUpdate
);
// 自动检测受影响范围，只重算变化子树
```

### 缓存控制

```typescript
// 手动清除缓存
treeCache.invalidate('plan_20250101');

// 清除所有缓存
treeCache.clearAll();

// 获取缓存统计
const stats = treeCache.getStats();
console.log('缓存命中率:', stats.hitRate); // '85.5%'
console.log('缓存大小:', stats.cacheSize);  // 8
```

### 性能对比

| 场景 | 无缓存 | 有缓存 | 提升 |
|------|--------|--------|------|
| 100节点树（首次） | ~20ms | ~20ms | - |
| 100节点树（命中） | ~20ms | <1ms | **20x** |
| 1000节点树（命中） | ~200ms | <1ms | **200x** |

---

## 3. 性能监控（PerformanceMonitor）

### 使用场景
- 监控Tab/Shift+Tab响应时间
- 跟踪buildEventTree性能
- 识别性能瓶颈

### 基本用法

```typescript
import { perfMonitor } from '@/services/EventTree';

// 监控Tab操作
perfMonitor.start('tab_1', 'executeTabIndent', { 
  eventId: '...',
  nodeCount: 100 
});

await executeTabIndent();

perfMonitor.end('tab_1', { success: true });
// ✅ [PerfMonitor] End: executeTabIndent (45.23ms)
```

### 查看性能报告

```typescript
// 获取单个操作的统计
const summary = perfMonitor.getSummary('executeTabIndent');
console.log('平均耗时:', summary.avgDuration); // 32.5ms
console.log('P95耗时:', summary.p95);          // 89.2ms

// 打印完整报告
perfMonitor.printReport();
// ┌─────────────────┬───────┬──────────┬──────────┬──────────┐
// │ Operation       │ Count │ Avg (ms) │ P95 (ms) │ Max (ms) │
// ├─────────────────┼───────┼──────────┼──────────┼──────────┤
// │ executeTabIndent│   45  │   32.5   │   89.2   │  105.3   │
// │ buildEventTree  │   12  │   18.7   │   45.1   │   52.8   │
// └─────────────────┴───────┴──────────┴──────────┴──────────┘
```

### 开发环境快捷访问

```typescript
// 浏览器控制台中
window.eventTreePerfMonitor.printReport();
window.eventTreePerfMonitor.getAllSummaries();
window.eventTreePerfMonitor.clear();
```

### 自动性能警告

性能监控器会自动检测并警告：
- **Tab操作慢**：超过100ms
- **buildTree慢**：小树（<200节点）超过50ms
- **大树检测**：超过500节点

---

## 🧪 完整示例：PlanManager集成

```typescript
import { EventHub } from '@/services/EventHub';
import { treeCache, perfMonitor } from '@/services/EventTree';

// ==================== 构建树（带缓存） ====================

const loadPlanData = useCallback(async (date: string) => {
  perfMonitor.start('load_plan', 'loadPlanData', { date });
  
  const events = await EventService.getEventsByDate(date);
  const cacheKey = `plan_${date}`;
  
  // 使用缓存
  const tree = treeCache.getCachedTree(events, cacheKey);
  
  setItems(tree.nodes.map(n => n._fullEvent!));
  
  perfMonitor.end('load_plan', { nodeCount: tree.stats.totalNodes });
}, []);

// ==================== Tab缩进（带事务） ====================

const executeTabIndent = useCallback(async (eventId: string) => {
  perfMonitor.start('tab_indent', 'executeTabIndent', { eventId });
  
  // Step 1-3: EventTreeAPI.reparent计算更新
  const reparentResult = EventTreeAPI.reparent({
    eventId,
    newParentId,
    events: items
  });
  
  // Step 4: 原子事务批量更新
  const result = await EventHub.batchUpdateTransaction(
    reparentResult.updates,
    { skipSync: false, source: 'Tab缩进' }
  );
  
  if (!result.success) {
    // 回滚Slate状态
    Transforms.undo(editor);
    perfMonitor.end('tab_indent', { success: false, error: result.error });
    return;
  }
  
  // Step 5: 增量更新缓存
  const changedIds = reparentResult.updates.map(u => u.eventId);
  const updatedEvents = await EventService.getAllEvents();
  const cacheKey = `plan_${currentDate}`;
  
  treeCache.incrementalUpdate(cacheKey, changedIds, updatedEvents);
  
  perfMonitor.end('tab_indent', { success: true, changedCount: changedIds.length });
}, [items, currentDate, editor]);

// ==================== 性能报告（开发模式） ====================

useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    const interval = setInterval(() => {
      perfMonitor.printReport();
    }, 60000); // 每分钟打印一次
    
    return () => clearInterval(interval);
  }
}, []);
```

---

## 📊 性能验证清单

### 功能测试

- [ ] **事务性批量更新**:
  - [ ] Tab缩进→中途失败→验证所有更新回滚
  - [ ] batchUpdateTransaction成功→验证所有事件已更新
  - [ ] 网络中断→验证缓存回滚

- [ ] **树结构缓存**:
  - [ ] 首次构建→验证缓存创建
  - [ ] 再次访问→验证缓存命中（<1ms）
  - [ ] 修改事件→验证缓存失效并重建
  - [ ] 增量更新→验证只重算变化子树

- [ ] **性能监控**:
  - [ ] 执行Tab→验证性能记录
  - [ ] buildEventTree→验证耗时统计
  - [ ] printReport()→验证统计准确

### 性能测试

| 场景 | 目标 | 验证方法 |
|------|------|----------|
| **100节点树（无缓存）** | <30ms | perfMonitor |
| **100节点树（缓存）** | <2ms | treeCache.getStats() |
| **1000节点树（缓存）** | <2ms | treeCache.getStats() |
| **Tab操作（100节点）** | <100ms | perfMonitor |
| **增量更新（5节点变化）** | <10ms | treeCache logs |

---

## 🔧 故障排查

### 缓存未命中（命中率低）

**症状**: `treeCache.getStats().hitRate < 50%`

**原因**:
1. events引用频繁变化（每次都创建新数组）
2. TTL过短（默认30秒）
3. 缓存被意外清除

**解决**:
```typescript
// 方案1: 确保events引用稳定（使用useMemo）
const stableEvents = useMemo(() => items, [items.length, items.map(i => i.id).join()]);

// 方案2: 延长TTL（在TreeCache.ts中修改）
private ttl: number = 60000; // 60秒
```

### 性能警告频繁出现

**症状**: 控制台频繁出现"⚠️ Tab operation slow!"

**原因**:
1. 大树（500+节点）未使用缓存
2. 数据库性能问题
3. 浏览器性能问题

**解决**:
```typescript
// 方案1: 确保使用缓存
const tree = treeCache.getCachedTree(events, cacheKey); // 而不是直接buildEventTree

// 方案2: 检查数据库性能
perfMonitor.start('db_query', 'getEventsByDate');
const events = await EventService.getEventsByDate(date);
perfMonitor.end('db_query');
```

### 事务回滚后状态不一致

**症状**: 事务失败后，Slate编辑器状态与数据库不一致

**原因**: 忘记回滚Slate状态

**解决**:
```typescript
const result = await EventHub.batchUpdateTransaction(...);

if (!result.success) {
  // ⚠️ 必须回滚Slate状态
  Transforms.undo(editor);
  console.error('事务失败', result.error);
}
```

---

## 📚 相关文档

- [Phase 3完成报告](./EVENTTREE_PHASE3_OPTIMIZATION_REPORT.md)
- [优化进度总览](./EVENTTREE_OPTIMIZATION_PROGRESS.md)
- [Phase 1报告](./EVENTTREE_PHASE1_OPTIMIZATION_REPORT.md)
- [Phase 2报告](./EVENTTREE_PHASE2_OPTIMIZATION_REPORT.md)
