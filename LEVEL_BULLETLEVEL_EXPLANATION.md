# EventLineNode.level vs metadata.bulletLevel 架构说明

## 📋 字段职责

### 1. `EventLineNode.level` (Slate 视觉层级)
**职责**：控制 Slate 编辑器的视觉显示
- 用途：CSS 缩进渲染 (`margin-left: ${level * 24}px`)
- 层级：UI 渲染层
- 更新时机：用户 Tab/Shift+Tab 时立即更新
- 生命周期：临时状态，编辑器内存中
- 示例：用户按 Tab 时，`level: 0 → 1`，立即显示缩进

### 2. `metadata.bulletLevel` (业务层级)
**职责**：数据持久化和 EventTree 关系验证
- 用途：序列化到数据库的真实层级
- 层级：数据持久层
- 更新时机：flushPendingChanges 时写入
- 生命周期：持久化状态，保存到 IndexedDB
- 验证：与 `parentEventId` 配合检查层级冲突
  ```typescript
  // 序列化检查逻辑
  const bulletLevel = metadata.bulletLevel ?? node.level ?? 0;
  if (bulletLevel === 0 && metadata.parentEventId) {
    // ⚠️ 冲突！顶级事件不应有父事件
    metadata.parentEventId = undefined;
  }
  ```

### 3. `ParagraphNode.bulletLevel` (段落层级)
**职责**：EventLog 内部的 bullet list 层级
- 用途：段落内的 bullet list 缩进（0-4 级）
- 独立于 EventLine 层级
- 示例：
  ```
  一级标题 (EventLineNode.level: 0)
    - Bullet 1 (ParagraphNode.bulletLevel: 0)
      - Bullet 1.1 (ParagraphNode.bulletLevel: 1)
  ```

## 🔄 数据流

### 输入（PlanItems → Slate Nodes）
```typescript
// serialization.ts:97
const titleNode: EventLineNode = {
  level: item.bulletLevel ?? 0,  // ✅ 从 bulletLevel 读取
  metadata: {
    bulletLevel: item.bulletLevel,  // ✅ 同时保存到 metadata
  }
};
```

### 编辑（Tab/Shift+Tab）
```typescript
// PlanSlate.tsx:3119
Transforms.setNodes(editor, { 
  level: newBulletLevel,  // ✅ 更新视觉层级
  metadata: {
    bulletLevel: newBulletLevel,  // 🔥 v2.20.0: 同步更新
  }
});
```

### 输出（Slate Nodes → PlanItems）
```typescript
// serialization.ts:454
const bulletLevel = metadata.bulletLevel ?? node.level ?? 0;  // ✅ 优先读 metadata
items.set(baseId, {
  bulletLevel: bulletLevel,  // ✅ 持久化
});
```

## ❌ 为什么不能合并为一个字段？

### 架构分离原则
1. **Slate 层**（`level`）：
   - Slate 节点是编辑器内部状态
   - 需要符合 Slate 的节点定义
   - 实时变化，不一定立即持久化
   
2. **业务层**（`bulletLevel`）：
   - EventTree 关系需要稳定的层级信息
   - 持久化时需要验证一致性
   - 可能与 Slate 状态暂时不同步（debounce 期间）

### 实际场景
用户快速连续按 Tab 3 次：
```
时刻 T0: level=0, bulletLevel=0 (初始)
时刻 T1: level=1, bulletLevel=0 (Tab 1st，视觉立即更新，但未 flush)
时刻 T2: level=2, bulletLevel=0 (Tab 2nd，视觉更新，但未 flush)
时刻 T3: level=3, bulletLevel=0 (Tab 3rd，视觉更新，但未 flush)
时刻 T4: flushPendingChanges → bulletLevel=3 (持久化)
```

如果没有 `level`，用户会看到延迟缩进；如果没有 `bulletLevel`，刷新后层级丢失。

## ✅ 最佳实践：统一同步机制

### 当前方案（v2.20.0）
**原则**：任何修改 `level` 的地方，同时更新 `metadata.bulletLevel`

```typescript
// ✅ 正确：双字段同步
Transforms.setNodes(editor, { 
  level: newLevel,
  metadata: {
    ...currentNode.metadata,
    bulletLevel: newLevel,  // 🔥 关键！同步更新
  }
});

// ❌ 错误：只更新 level
Transforms.setNodes(editor, { 
  level: newLevel,  // 序列化时会读到旧的 bulletLevel，导致冲突
});
```

### 代码位置清单
需要同步更新的地方：
1. ✅ Tab 缩进：`PlanSlate.tsx:3119`
2. ✅ Shift+Tab 减少缩进：`PlanSlate.tsx:3268`
3. ✅ 删除后调整：`PlanSlate.tsx:565-566`
4. ✅ 创建新行：`serialization.ts:406`

## 🔧 未来优化方向

### 方案 A：封装同步函数
```typescript
function setEventLineLevel(
  editor: Editor, 
  path: Path, 
  newLevel: number
): void {
  const currentNode = Node.get(editor, path) as EventLineNode;
  Transforms.setNodes(editor, { 
    level: newLevel,
    metadata: {
      ...currentNode.metadata,
      bulletLevel: newLevel,
    }
  }, { at: path });
}

// 使用
setEventLineLevel(editor, currentPath, newBulletLevel);
```

### 方案 B：Slate Transform 拦截（高级）
```typescript
const withLevelSync = (editor: Editor) => {
  const { apply } = editor;
  
  editor.apply = (op) => {
    if (op.type === 'set_node' && op.properties.level !== undefined) {
      // 自动同步 bulletLevel
      op.properties = {
        ...op.properties,
        metadata: {
          ...(op.properties.metadata || {}),
          bulletLevel: op.properties.level,
        }
      };
    }
    apply(op);
  };
  
  return editor;
};
```

## 📊 总结

| 维度 | `level` | `bulletLevel` |
|------|---------|---------------|
| **用途** | 视觉显示 | 数据持久化 |
| **层级** | UI 层 | 业务层 |
| **更新时机** | 立即（用户操作） | 延迟（debounce flush） |
| **验证** | 无 | 与 parentEventId 冲突检查 |
| **能否删除** | ❌ 必需（Slate 渲染） | ❌ 必需（EventTree 验证） |
| **同步要求** | 🔥 **必须同步更新** | 🔥 **必须同步更新** |

**结论**：两个字段不能合并，但必须严格同步。建议封装统一的更新函数避免遗漏。
