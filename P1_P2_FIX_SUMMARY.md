# P1/P2 问题修复总结

**修复时间**: 2025-12-17  
**问题来源**: [TIMESTAMP_CHAIN_AUDIT.md](TIMESTAMP_CHAIN_AUDIT.md)

---

## 修复内容

### ✅ P1 修复：EventNode 添加 Event.createdAt 回退逻辑

**问题描述**：
- 如果旧事件没有 Block-Level Timestamp（paragraph.createdAt），将不创建 EventNode
- 影响：从 Outlook 同步的旧事件，description 中有签名但 slateJson 无 Block-Level

**修复方案**：
1. 修改 `EventNodeService.extractParagraphsFromEventLog` 方法签名，添加可选参数 `event?: Event`
2. 添加回退逻辑：
   - 优先使用 Block-Level Timestamp（`paragraph.createdAt`）
   - 回退到 Event.createdAt（签名提取的时间戳）
   - 最后回退到当前时间

**代码变更**：

```typescript
// src/services/EventNodeService.ts

// 修改前：只处理有 createdAt 的节点
if (node.type === 'paragraph' && node.createdAt) {
  // ...创建 EventNode
}
// ❌ 无 createdAt 的节点被忽略

// 修改后：添加回退逻辑
if (node.type === 'paragraph' && node.createdAt) {
  // 优先使用 Block-Level Timestamp
  const timestamp = this.convertTimestampToTimeSpec(node.createdAt);
  paragraphs.push({ timestamp, ... });
} else if (node.type === 'paragraph' && !node.createdAt && event) {
  // ✅ 回退到 Event.createdAt
  const fallbackTimestamp = event.createdAt || formatTimeForStorage(new Date());
  paragraphs.push({ timestamp: fallbackTimestamp, ... });
}
```

**预期效果**：
- 旧事件（无 Block-Level Timestamp）也能创建 EventNode
- 使用 Event.createdAt（从签名提取的时间戳）作为 Node 时间戳

---

### ✅ P2 修复：EventNode 添加 paragraphCreatedAt/paragraphUpdatedAt 字段

**问题描述**：
- EventNode 只有 `timestamp`（单个时间点）和 `updatedAt`（当前时间）
- 无法区分：
  * 段落的创建时间（paragraph.createdAt）
  * 段落的修改时间（paragraph.updatedAt）
  * EventNode 记录的更新时间（数据库记录修改时间）

**修复方案**：
1. 在 `EventNode` 类型中添加新字段：
   - `paragraphCreatedAt`: 段落创建时间（来自 Block-Level Timestamp）
   - `paragraphUpdatedAt`: 段落修改时间（来自 Block-Level Timestamp）
   - `nodeUpdatedAt`: EventNode 记录的更新时间
2. 标记旧字段为 `@deprecated`（向后兼容）：
   - `timestamp` → 使用 `paragraphCreatedAt`
   - `updatedAt` → 使用 `nodeUpdatedAt`

**代码变更**：

```typescript
// src/types/EventNode.ts

export interface EventNode {
  // 旧字段（向后兼容）
  /** @deprecated 使用 paragraphCreatedAt 代替 */
  timestamp: string;
  
  /** @deprecated 使用 nodeUpdatedAt 代替 */
  updatedAt?: string;
  
  // 🆕 新字段（清晰区分）
  paragraphCreatedAt: string;     // 段落创建时间
  paragraphUpdatedAt: string;     // 段落修改时间
  nodeUpdatedAt: string;          // Node 记录更新时间
}
```

```typescript
// src/services/EventNodeService.ts

const node: EventNode = {
  timestamp: input.timestamp,  // 保留（向后兼容）
  
  // 🆕 段落时间戳（来自 Block-Level 或 Event.createdAt）
  paragraphCreatedAt: input.paragraphCreatedAt || input.timestamp,
  paragraphUpdatedAt: input.paragraphUpdatedAt || input.timestamp,
  
  // 🆕 Node 记录时间戳（当前时间）
  nodeUpdatedAt: now,
  updatedAt: now  // 保留（向后兼容）
};
```

**预期效果**：
- 清晰区分段落时间和 Node 记录时间
- 保留旧字段确保向后兼容
- 新代码优先使用新字段

---

## 数据流对比

### 修复前（❌ 旧事件无法创建 Node）

```
旧 Outlook 事件（无 Block-Level Timestamp）
  ├─ eventlog.slateJson: [
  │    { type: 'paragraph', children: [{ text: '内容' }] }
  │    // ❌ 无 createdAt
  │  ]
  ├─ Event.createdAt: "2025-10-22 18:26:29"  ✅ 从签名提取
  └─ Event.updatedAt: "2025-10-22 18:30:15"  ✅ 从签名提取
       ↓
extractParagraphsFromEventLog()
  - 检查 node.createdAt → undefined
  - ❌ 跳过该节点（不创建 EventNode）
       ↓
EventNode: []  // ❌ 空数组
```

### 修复后（✅ 旧事件也能创建 Node）

```
旧 Outlook 事件（无 Block-Level Timestamp）
  ├─ eventlog.slateJson: [
  │    { type: 'paragraph', children: [{ text: '内容' }] }
  │    // ❌ 无 createdAt
  │  ]
  ├─ Event.createdAt: "2025-10-22 18:26:29"  ✅ 从签名提取
  └─ Event.updatedAt: "2025-10-22 18:30:15"  ✅ 从签名提取
       ↓
extractParagraphsFromEventLog(eventlog, event)
  - 检查 node.createdAt → undefined
  - ✅ 回退到 event.createdAt: "2025-10-22 18:26:29"
       ↓
EventNode: {
  timestamp: "2025-10-22 18:26:29",           // 兼容字段
  paragraphCreatedAt: "2025-10-22 18:26:29",  // ✅ Event.createdAt
  paragraphUpdatedAt: "2025-10-22 18:30:15",  // ✅ Event.updatedAt
  nodeUpdatedAt: "2025-12-17 21:54:27"        // ✅ 当前时间
}
```

---

## 新增字段说明

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `paragraphCreatedAt` | string | `paragraph.createdAt` 或 `Event.createdAt` | 段落首次创建时间（Block-Level 或签名） |
| `paragraphUpdatedAt` | string | `paragraph.updatedAt` 或 `Event.updatedAt` | 段落最后修改时间（Block-Level 或签名） |
| `nodeUpdatedAt` | string | `formatTimeForStorage(new Date())` | EventNode 记录的更新时间（数据库操作时间） |

---

## 向后兼容策略

1. **保留旧字段**：
   - `timestamp` 和 `updatedAt` 字段仍然存在
   - 标记为 `@deprecated`，提示使用新字段

2. **数据填充**：
   - `timestamp = paragraphCreatedAt`
   - `updatedAt = nodeUpdatedAt`

3. **渐进迁移**：
   - 新代码优先使用新字段
   - 旧代码仍可使用旧字段
   - 未来版本可移除旧字段

---

## 测试场景

### 场景 1：有 Block-Level Timestamp 的事件

```json
// Event
{
  "eventlog": {
    "slateJson": "[{\"type\":\"paragraph\",\"createdAt\":1729590389000,\"updatedAt\":1729590615000,\"children\":[{\"text\":\"内容\"}]}]"
  },
  "createdAt": "2025-10-22 18:26:29",
  "updatedAt": "2025-10-22 18:30:15"
}

// EventNode
{
  "paragraphCreatedAt": "2025-10-22 18:26:29",  // ✅ 来自 paragraph.createdAt
  "paragraphUpdatedAt": "2025-10-22 18:30:15",  // ✅ 来自 paragraph.updatedAt
  "nodeUpdatedAt": "2025-12-17 21:54:27"        // ✅ 当前时间
}
```

### 场景 2：无 Block-Level Timestamp 的旧事件（P1 修复）

```json
// Event
{
  "eventlog": {
    "slateJson": "[{\"type\":\"paragraph\",\"children\":[{\"text\":\"内容\"}]}]"  // ❌ 无 createdAt
  },
  "createdAt": "2025-10-22 18:26:29",  // ✅ 从签名提取
  "updatedAt": "2025-10-22 18:30:15"   // ✅ 从签名提取
}

// EventNode（修复前：不创建）
❌ []

// EventNode（修复后：回退到 Event.createdAt）
✅ {
  "paragraphCreatedAt": "2025-10-22 18:26:29",  // ✅ 来自 Event.createdAt
  "paragraphUpdatedAt": "2025-10-22 18:30:15",  // ✅ 来自 Event.updatedAt
  "nodeUpdatedAt": "2025-12-17 21:54:27"        // ✅ 当前时间
}
```

---

## 影响范围

1. **数据结构**：
   - [x] `EventNode` 类型定义（新增 3 个字段）
   - [x] `CreateEventNodeInput` 接口（新增 2 个可选参数）

2. **Service 层**：
   - [x] `EventNodeService.extractParagraphsFromEventLog`（添加回退逻辑）
   - [x] `EventNodeService.syncNodesFromEvent`（传入 event 参数）
   - [x] `EventNodeService.createNode`（设置新字段）

3. **兼容性**：
   - [x] 旧字段标记为 `@deprecated`
   - [x] 新字段设置回退值
   - [x] 无需迁移现有数据（自动兼容）

---

## 下一步

1. **测试验证**：
   - 测试有 Block-Level Timestamp 的事件
   - 测试无 Block-Level Timestamp 的旧事件
   - 验证时间戳是否正确

2. **数据迁移**（可选）：
   - 遍历现有 EventNode 记录
   - 补全 `paragraphCreatedAt`/`paragraphUpdatedAt` 字段
   - 从 `timestamp`/`updatedAt` 迁移

3. **未来优化**：
   - 移除 `@deprecated` 字段（v3.0）
   - 更新文档和 UI

---

**修复完成** ✅
