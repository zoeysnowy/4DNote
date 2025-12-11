# BulletLevel 临时ID问题分析报告

## 问题描述

**用户反馈**：Plan页面输入的bulletLevel不能有序保存

**根本原因**：Tab键后生成的临时ID（`line-xxx`）在建立父子关系时，如果父事件还是临时ID，在存储时会导致 `parentEventId` 引用一个不存在的临时ID，从而破坏EventTree层级关系。

## 问题链路追踪

### 1. 临时ID生成（PlanSlate.tsx）

当用户在空行按Tab键时：

```typescript
// PlanSlate.tsx L2663-2730
// 步骤1: 更新Slate metadata，设置 parentEventId = previousEventId
const updatedMetadata = {
  ...(currentNode.metadata || {}),
  parentEventId: previousEventId, // ⚠️ previousEventId 可能是 "line-xxx"
};

Transforms.setNodes(editor, { 
  level: newBulletLevel,
  metadata: updatedMetadata 
}, { at: currentPath });
```

**问题点**：此时 `previousEventId` 可能是临时ID（`line-1234567890`），尚未保存到数据库。

### 2. 临时ID保存逻辑（PlanSlate.tsx L2735-2870）

```typescript
// 检测到临时ID，触发保存
const isCurrentTempId = currentEventId.startsWith('line-');
const isPreviousTempId = previousEventId.startsWith('line-');

if (isCurrentTempId || isPreviousTempId) {
  // ✅ 正确：先保存父事件（上一行）
  if (isPreviousTempId && currentIndex > 0) {
    const [prevNode] = currentContent[currentIndex - 1];
    eventsToSave.push({ node: prevNode, path: [currentIndex - 1] });
  }
  
  // ✅ 正确：再保存子事件（当前行）
  if (isCurrentTempId) {
    eventsToSave.push({ node: eventLine, path: currentPath });
  }
  
  // ✅ 正确：使用 idMapping 解析真实ID
  for (const { node, path } of eventsToSave) {
    const isCurrentEvent = path[0] === currentPath[0];
    
    // 🔥 核心修复：从 idMapping 获取真实 ID
    let resolvedParentId = previousEventId;
    if (isCurrentEvent && previousEventId) {
      resolvedParentId = idMapping[previousEventId] || previousEventId;
    }
    
    const event = {
      id: tempId,
      title: '',
      isPlan: true,
      parentEventId: resolvedParentId // ✅ 使用解析后的真实ID
    };
    
    const result = await EventHub.createEvent(event);
    idMapping[tempId] = result.event.id; // ✅ 更新映射
  }
}
```

**问题点1**：这段代码**仅在按Tab键时执行**，但如果用户快速输入多行再Tab，可能触发不同步。

**问题点2**：`EventHub.createEvent()` 返回格式是 `{ success, event }`，代码已修复。

### 3. 序列化读取（serialization.ts L400-450）

```typescript
// slateNodesToPlanItems - 将Slate节点转换为PlanItem
const metadata = node.metadata || {};

items.set(baseId, {
  id: baseId,
  eventId: baseId,
  // ... 其他字段
  // 🔥 从 metadata 读取 EventTree 字段
  parentEventId: metadata.parentEventId,
  childEventIds: metadata.childEventIds,
});
```

**问题点**：如果 `metadata.parentEventId` 仍然是 `line-xxx`，这个临时ID在数据库中不存在，导致：
- `calculateBulletLevel()` 无法找到父事件，返回 0
- EventTree 层级关系断裂

### 4. 批量更新保存（PlanManager.tsx L1311-1313）

```typescript
// executeBatchUpdate 保存事件
const eventItem: Event = {
  ...(existingItem || {}),
  ...updatedItem,
  // 🔥 使用 updatedItem 的 parentEventId（来自 serialization）
  parentEventId: updatedItem.parentEventId ?? existingItem?.parentEventId,
  childEventIds: updatedItem.childEventIds ?? existingItem?.childEventIds,
};

await EventHub.updateFields(item.id, eventItem, { source: 'PlanManager' });
```

**问题点**：如果 `updatedItem.parentEventId` 是临时ID，这个错误的关系会被保存到数据库。

## 失败场景重现

### 场景1：快速Tab导致时序问题

```
1. 用户输入 "任务A"
2. 按Enter创建新行（临时ID: line-111）
3. 立即按Tab缩进（parentEventId = line-111）❌
4. 输入 "任务A1"
5. 按Enter保存

结果：
- line-111 还未转换为真实ID
- 任务A1的 parentEventId 指向 line-111（数据库中不存在）
- bulletLevel 计算失败，显示为同级
```

### 场景2：多层缩进连续创建

```
1. 创建 "任务A"（event_001）
2. Enter + Tab创建 "任务A1"（line-222, parentEventId = event_001）✅
3. Enter + Tab创建 "任务A1a"（line-333, parentEventId = line-222）❌
4. 批量保存

结果：
- 任务A1保存成功（event_002）
- 任务A1a的 parentEventId = line-222（应该是 event_002）
- 层级关系错误
```

### 场景3：onChange时序竞争

```
1. 用户快速输入并Tab
2. PlanSlate onChange 触发 serialization
3. serialization 读取 metadata.parentEventId（还是 line-xxx）
4. executeBatchUpdate 保存错误的 parentEventId
5. Tab键的异步保存尚未完成，idMapping 未建立
```

## 问题根源总结

| 问题层面 | 具体原因 | 影响范围 |
|---------|---------|---------|
| **架构设计** | 临时ID和真实ID并存，未统一管理 | 全局 |
| **时序问题** | Tab键异步保存 vs onChange同步序列化 | 高频操作 |
| **ID映射** | idMapping仅在Tab键处理器中维护，onChange无法访问 | 所有新建事件 |
| **验证缺失** | 没有检查parentEventId是否为临时ID | 存储层 |

## 解决方案

### 方案A：禁止临时ID作为parentEventId（推荐）

**原理**：在保存时检查并清理临时ID引用

**实现位置**：
1. `serialization.ts` - 在读取metadata时过滤临时ID
2. `PlanManager.tsx` - 在executeBatchUpdate保存前验证

**优点**：
- 简单直接，不影响现有流程
- 防御性编程，避免脏数据
- 向后兼容

**缺点**：
- 可能导致层级关系丢失（临时降为顶层）

### 方案B：全局ID映射管理器

**原理**：创建全局 `TempIdMapper` 服务，统一管理临时ID→真实ID的映射

**实现位置**：
1. 新建 `services/TempIdMapper.ts`
2. 在 `EventHub.createEvent` 成功后更新映射
3. 在 `serialization.ts` 和 `PlanManager` 中使用映射解析

**优点**：
- 彻底解决问题
- 支持跨组件ID解析
- 可扩展性强

**缺点**：
- 需要改动多个文件
- 增加系统复杂度

### 方案C：同步创建模式

**原理**：Tab键后立即等待父事件创建完成，获取真实ID后再继续

**实现位置**：
1. `PlanSlate.tsx` - Tab键处理器改为完全同步
2. 使用 `await` 确保ID转换完成

**优点**：
- 从根源消除问题
- 逻辑清晰

**缺点**：
- 影响用户体验（可能有延迟）
- 增加Tab键响应时间

## 推荐修复步骤

### 第1步：立即修复 - 添加临时ID过滤（方案A）

在 `serialization.ts` 和 `PlanManager.tsx` 中添加临时ID检测：

```typescript
// serialization.ts
const parentEventId = metadata.parentEventId;
if (parentEventId && parentEventId.startsWith('line-')) {
  console.warn('[Serialization] ⚠️ 过滤临时ID parentEventId:', parentEventId);
  metadata.parentEventId = undefined; // 清除临时ID
}

// PlanManager.tsx executeBatchUpdate
if (updatedItem.parentEventId?.startsWith('line-')) {
  console.warn('[PlanManager] ⚠️ 检测到临时ID，清除:', updatedItem.parentEventId);
  updatedItem.parentEventId = undefined;
}
```

### 第2步：中期优化 - 实现全局ID映射器（方案B）

创建 `TempIdMapper` 服务，统一管理ID映射。

### 第3步：长期重构 - 考虑去临时ID架构

探索完全移除临时ID的可能性，改用占位符或延迟创建。

## 测试计划

### 测试用例1：单层缩进
1. 创建事件A
2. Enter + Tab创建子事件A1
3. 输入内容后失焦
4. 刷新页面
5. 验证：A1是A的子事件，bulletLevel正确

### 测试用例2：多层缩进
1. 创建事件A
2. Enter + Tab创建A1
3. Enter + Tab创建A1a
4. Enter + Tab创建A1a-i
5. 输入内容后失焦
6. 刷新页面
7. 验证：层级关系A > A1 > A1a > A1a-i

### 测试用例3：快速连续操作
1. 快速输入多行（不等待保存）
2. 连续按Tab建立多层关系
3. 立即失焦触发保存
4. 刷新页面
5. 验证：所有层级关系正确

### 测试用例4：临时ID清理
1. 打开开发者工具
2. 执行测试用例1-3
3. 打开数据库检查
4. 验证：所有parentEventId都是真实ID（event_xxx），无临时ID（line-xxx）

## 下一步行动

1. ✅ **立即**：实现方案A的临时ID过滤
2. ⏳ **本周**：编写并运行测试用例
3. ⏳ **下周**：设计方案B的详细架构
4. ⏳ **长期**：考虑架构重构

---

**文档版本**：v1.0  
**创建时间**：2025-12-10  
**创建人**：GitHub Copilot  
**相关文件**：
- `src/components/PlanSlate/PlanSlate.tsx`
- `src/components/PlanSlate/serialization.ts`
- `src/components/PlanManager.tsx`
- `src/services/EventHub.ts`
