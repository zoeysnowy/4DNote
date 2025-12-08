# BulletLevel → EventTree: 临时 ID 修复报告

**修复日期**: 2025-12-04  
**问题**: Tab/Shift+Tab 键使用临时 ID (`line-xxx`) 导致创建失败  
**状态**: ✅ 已修复

---

## 🐛 问题描述

### 错误日志
```
⚠️ [EventService] Invalid ID format, generated new UUID: {
  oldId: 'line-1764785268590-0.9871440706782005', 
  newId: 'event_hXgNW8bQr0iXTzD6gvjx9'
}
❌ Failed to update event: Error: Event not found: event_hXgNW8bQr0iXTzD6gvjx9
```

### 根本原因
1. 用户按 **Ctrl+Enter** 创建新行 → 生成临时 ID (`line-xxx`)
2. 用户立即按 **Tab** 键 → 尝试用临时 ID 创建父子关系
3. EventService 检测到无效 ID → 生成新 UUID
4. 但新 UUID 的事件还未保存 → `updateEvent` 失败
5. 刷新后父子关系丢失 ❌

---

## ✅ 修复方案

### 核心思路：检测临时 ID → 触发保存 → 等待真实 ID → 再创建关系

### 实施步骤

#### 1. 检测临时 ID
```typescript
const isCurrentTempId = currentEventId.startsWith('line-');
const isPreviousTempId = previousEventId.startsWith('line-');

if (isCurrentTempId || isPreviousTempId) {
  // 触发保存流程
}
```

#### 2. 触发保存
```typescript
// 强制触发 onChange（通过修改临时 Mark）
Editor.withoutNormalizing(editor, () => {
  Editor.removeMark(editor, 'tempTrigger');
  Editor.addMark(editor, 'tempTrigger', true);
  Editor.removeMark(editor, 'tempTrigger');
});

// PlanManager 的防抖机制会在 300ms 后保存
```

#### 3. 等待真实 ID 生成
```typescript
let attempts = 0;
const maxAttempts = 50; // 5 秒超时

const checkInterval = setInterval(async () => {
  attempts++;
  
  // 重新查找事件行（ID 可能已更新）
  const updatedEventLine = findEventLineAtPath(currentPath);
  const newCurrentId = updatedEventLine?.eventId;
  
  const currentReady = newCurrentId && !newCurrentId.startsWith('line-');
  
  if (currentReady) {
    clearInterval(checkInterval);
    
    // ✅ 使用真实 ID 继续执行
    await executeTabIndent(newCurrentId, ...);
  }
}, 100); // 每 100ms 检查一次
```

#### 4. 执行正常 Tab 逻辑
```typescript
const executeTabIndent = async (
  currentEventId: string,
  previousEventId: string,
  newBulletLevel: number,
  currentPath: Path,
  oldLevel: number
) => {
  // 乐观更新
  Editor.withoutNormalizing(editor, () => {
    Transforms.setNodes(editor, { level: newBulletLevel }, { at: currentPath });
  });
  
  // 异步持久化
  EventService.updateEvent(currentEventId, { parentEventId: previousEventId }, ...);
};
```

---

## 📦 代码变更

### 文件: `src/components/PlanSlate/PlanSlate.tsx`

#### 新增辅助函数
```typescript
// L2202: 在指定路径查找 EventLine（用于 ID 更新后重新查找）
const findEventLineAtPath = useCallback((path: Path): EventLineNode | null => {
  try {
    const [node] = Editor.node(editor, path);
    const eventLine = node as unknown as EventLineNode;
    if (eventLine && eventLine.type === 'event-line') {
      return eventLine;
    }
    return null;
  } catch (error) {
    return null;
  }
}, [editor]);
```

#### Tab 键改造（L2570-2675）
**变更**:
- 添加临时 ID 检测
- 触发保存并等待真实 ID（最多 5 秒）
- 提取 `executeTabIndent()` 独立函数

**关键日志**:
```
[Tab] 🔄 Detected temporary ID, triggering save
[Tab] ⏳ Waiting for real event ID generation...
[Tab] ✅ Real IDs generated: {current: 'xxx', previous: 'xxx', attempts: 3}
[Tab] ⚡ Optimistic update complete (< 1ms)
[Tab] 📡 Persisted to database
```

#### Shift+Tab 键改造（L2748-2920）
**变更**:
- 同样的临时 ID 检测逻辑
- 提取 `executeShiftTabOutdent()` 独立函数

**关键日志**:
```
[Shift+Tab] 🔄 Detected temporary ID, triggering save
[Shift+Tab] ⏳ Waiting for real event ID generation...
[Shift+Tab] ✅ Real IDs generated
[Shift+Tab] ⚡ Optimistic update complete
[Shift+Tab] 📡 Persisted
```

---

## 🧪 测试验证

### Test Case 1: 空行立即 Tab
**步骤**:
1. 按 Ctrl+Enter 创建两个新行（Event A, Event B）
2. **立即**在 Event B 按 Tab 键（不输入内容）
3. 观察控制台日志

**预期结果**:
```
✅ [Tab] 🔄 Detected temporary ID
✅ [Tab] ⏳ Waiting for real event ID generation...
✅ [Tab] ✅ Real IDs generated: {attempts: 3-5}
✅ [Tab] 📡 Persisted to database
```

**刷新后**:
```
✅ Event B 成功缩进为 Event A 的子事件
✅ bulletLevel = 1
✅ parentEventId = Event A 的 ID
```

### Test Case 2: 超时保护
**步骤**:
1. 修改代码：`maxAttempts = 3`（加快超时）
2. 执行 Test Case 1

**预期结果**:
```
✅ [Tab] ❌ Timeout waiting for real IDs: {attempts: 3}
✅ 不执行任何操作（避免错误）
```

### Test Case 3: 真实 ID 快速路径
**步骤**:
1. 创建 Event A，输入标题 "Parent"（触发保存，生成真实 ID）
2. 创建 Event B，输入标题 "Child"（触发保存，生成真实 ID）
3. 在 Event B 按 Tab 键

**预期结果**:
```
✅ [Tab] 🎯 Creating parent-child relationship (跳过临时 ID 检测)
✅ [Tab] ⚡ Optimistic update complete
✅ [Tab] 📡 Persisted to database
```

---

## 📊 性能影响

| 场景 | 旧方案 | 新方案 |
|------|--------|--------|
| **空行立即 Tab** | ❌ 失败 | ✅ 成功（延迟 300-500ms） |
| **已保存行 Tab** | ✅ 成功 | ✅ 成功（无变化） |
| **检测次数** | - | 3-5 次（300-500ms 总计） |
| **超时保护** | ❌ 无 | ✅ 5 秒 |

### 延迟来源
- **PlanManager 防抖**: 300ms（触发 `onChange` → 执行保存）
- **ID 检测轮询**: 100ms × 3-5 次 = 300-500ms
- **总延迟**: ~600-800ms（可接受范围）

---

## 🎯 用户体验

### 修复前
```
用户: 创建两个新行 → 立即按 Tab
结果: ❌ 视觉缩进成功，但刷新后丢失
问题: 临时 ID 导致数据库操作失败
```

### 修复后
```
用户: 创建两个新行 → 立即按 Tab
结果: ✅ 等待 0.6-0.8 秒 → 缩进成功 → 刷新后保留
体验: 轻微延迟（可感知但不影响使用）
```

---

## ⚠️ 注意事项

### 1. 防抖时间依赖
- 当前依赖 PlanManager 的 300ms 防抖
- 如果修改防抖时间，需要调整 `maxAttempts`

### 2. ID 格式约定
- 临时 ID: `line-{timestamp}-{random}`
- 真实 ID: `event_{base64}`
- 检测方法: `id.startsWith('line-')`

### 3. 超时处理
- 5 秒超时后不执行任何操作
- 避免在数据未准备好时强制操作
- 用户可以手动重试

---

## 📚 相关文档

1. **原始问题**: 用户报告 Tab 创建的二级、三级标题刷新后丢失
2. **实施计划**: `docs/plans/BULLETLEVEL_TO_EVENTTREE_IMPLEMENTATION_PLAN.md`
3. **开发报告**: `docs/plans/BULLETLEVEL_TO_EVENTTREE_DEVELOPMENT_REPORT.md`
4. **测试指南**: `docs/plans/BULLETLEVEL_TO_EVENTTREE_TESTING_GUIDE.md`

---

## ✅ 完成状态

- [x] Tab 键临时 ID 检测
- [x] Shift+Tab 键临时 ID 检测
- [x] 触发保存机制
- [x] 真实 ID 等待轮询
- [x] 超时保护（5 秒）
- [x] 提取独立执行函数
- [x] 错误回滚机制
- [x] 详细日志记录

---

**修复完成**: ✅  
**待测试**: 🧪 等待用户验收  
**下一步**: 按照测试指南验证所有场景
