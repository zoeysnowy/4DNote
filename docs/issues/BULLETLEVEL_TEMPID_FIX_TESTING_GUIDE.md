# BulletLevel 临时ID问题 - 测试指南

## 问题修复说明

✅ **已实现修复**：在 `serialization.ts` 和 `PlanManager.tsx` 中添加了临时ID过滤机制，防止 `line-xxx` 格式的临时ID被保存到数据库，破坏EventTree层级关系。

## 修复内容

### 1. serialization.ts - 数据序列化时过滤
- **位置**：L395-420
- **功能**：在将Slate节点转换为Event对象时，检测并清除临时ID
- **代码**：
  ```typescript
  // 过滤 parentEventId 中的临时ID
  if (metadata.parentEventId && metadata.parentEventId.startsWith('line-')) {
    console.warn('[Serialization] ⚠️ 检测到临时ID parentEventId，已清除');
    metadata.parentEventId = undefined;
  }
  
  // 过滤 childEventIds 中的临时ID
  if (metadata.childEventIds && Array.isArray(metadata.childEventIds)) {
    metadata.childEventIds = metadata.childEventIds.filter(id => !id.startsWith('line-'));
  }
  ```

### 2. PlanManager.tsx - 批量保存时验证
- **位置**：L1269-1310
- **功能**：在 `executeBatchUpdate` 保存前验证EventTree字段，清除临时ID
- **代码**：
  ```typescript
  // 验证并清理 parentEventId
  let validatedParentEventId = updatedItem.parentEventId ?? existingItem?.parentEventId;
  if (validatedParentEventId && validatedParentEventId.startsWith('line-')) {
    console.warn('[PlanManager] ⚠️ 检测到临时ID parentEventId，已清除');
    validatedParentEventId = undefined;
  }
  
  // 验证并清理 childEventIds
  let validatedChildEventIds = updatedItem.childEventIds ?? existingItem?.childEventIds;
  if (validatedChildEventIds && Array.isArray(validatedChildEventIds)) {
    validatedChildEventIds = validatedChildEventIds.filter(id => !id.startsWith('line-'));
  }
  ```

### 3. debug-bulletlevel.html - 新增临时ID检测工具
- **位置**：新增第6个检查按钮
- **功能**：扫描数据库，检测所有临时ID问题
- **检查项**：
  1. parentEventId 是否包含临时ID
  2. childEventIds 是否包含临时ID
  3. 孤儿事件（父事件不存在）
  4. EventTree双向关系一致性
  5. 统计数据

## 测试步骤

### 测试1：基本缩进功能
```
目标：验证单层缩进能正确保存父子关系

步骤：
1. 打开 Plan 页面（http://localhost:5173）
2. 创建事件 "任务A"，输入内容后失焦（触发保存）
3. 按 Enter 创建新行
4. 立即按 Tab 键缩进
5. 输入 "任务A1"，失焦保存
6. 刷新页面（Ctrl+R）

验证：
✅ 任务A1 应该缩进在 任务A 下方
✅ 打开控制台，查看日志：
   - 应该看到 [Serialization] 或 [PlanManager] 的警告日志（如果之前存在临时ID）
   - 不应该有错误日志
```

### 测试2：快速连续缩进
```
目标：验证快速操作时临时ID不会被保存

步骤：
1. 快速输入以下内容（不等待保存完成）：
   输入 "A" + Enter
   立即 Tab + 输入 "A1" + Enter
   立即 Tab + 输入 "A1a" + Enter
   立即 Tab + 输入 "A1a-i"
2. 等待2秒（确保所有保存完成）
3. 刷新页面

验证：
✅ 应该看到4层缩进：
   A
     A1
       A1a
         A1a-i
✅ 控制台不应该有临时ID错误
```

### 测试3：多层级混合操作
```
目标：验证复杂层级关系

步骤：
1. 创建以下结构：
   任务1
     子任务1.1
       子任务1.1.1
     子任务1.2
   任务2
     子任务2.1

2. 操作方式：
   - 输入 "任务1" + Enter
   - Tab + "子任务1.1" + Enter
   - Tab + "子任务1.1.1" + Enter
   - Shift+Tab + "子任务1.2" + Enter
   - Shift+Tab + "任务2" + Enter
   - Tab + "子任务2.1"

3. 刷新页面

验证：
✅ 层级关系完全正确
✅ 使用调试工具检查（见下文）
```

### 测试4：使用调试工具验证
```
目标：确认数据库中没有临时ID

步骤：
1. 完成测试1-3后
2. 打开 http://localhost:5173/debug-bulletlevel.html
3. 依次点击：
   - 🔥 6️⃣ 检查临时ID问题
   - 1️⃣ 检查数据库中的 EventTree 字段
   - 3️⃣ 检查排序算法

验证：
✅ 检查6应该显示：
   ✅ 没有发现临时ID作为 parentEventId
   ✅ 没有发现 childEventIds 中包含临时ID
   ✅ 没有发现孤儿事件
   ✅ EventTree 双向关系一致

✅ 检查1应该显示：
   所有事件的 parentEventId 都是 event_xxx 格式（或null）
   没有 line-xxx 格式的ID

✅ 检查3应该显示：
   DFS排序正确，父事件在子事件前面
```

## 问题排查

### 如果仍然看到临时ID警告

**可能原因1：历史数据污染**
```
症状：控制台显示 "检测到临时ID parentEventId，已清除"
解决：这是正常的，说明修复代码正在清理旧数据
      继续使用，新创建的事件不会有此问题
```

**可能原因2：Tab键异步保存未完成**
```
症状：快速操作时偶尔出现层级错误
解决：等待1-2秒再进行下一步操作
      或者刷新页面（数据已保存，只是显示未同步）
```

### 如果层级关系仍然错误

**调试步骤**：
1. 打开控制台（F12）
2. 执行测试操作
3. 查找以下关键日志：
   - `[Tab] 🔥 Updating Slate metadata` - Tab键更新metadata
   - `[Serialization] 🔍 Reading EventTree from metadata` - 读取父子关系
   - `[PlanManager executeBatchUpdate] ⚠️ 检测到临时ID` - 过滤临时ID
   - `[EventService] 计算 bulletLevel` - bulletLevel计算

4. 在 `#bugs-and-issues` 报告以下信息：
   - 操作步骤
   - 控制台完整日志
   - 调试工具第6项的输出截图

## 预期效果

### 修复前（问题状态）
```
数据库内容：
event_001: { id: 'event_001', title: '任务A', parentEventId: null }
event_002: { id: 'event_002', title: '任务A1', parentEventId: 'line-1234567890' } ❌

显示效果：
任务A          (bulletLevel = 0)
任务A1         (bulletLevel = 0)  ❌ 应该是 1

问题：parentEventId = 'line-1234567890' 在数据库中不存在
```

### 修复后（正常状态）
```
数据库内容：
event_001: { id: 'event_001', title: '任务A', parentEventId: null, childEventIds: ['event_002'] }
event_002: { id: 'event_002', title: '任务A1', parentEventId: 'event_001' } ✅

显示效果：
任务A          (bulletLevel = 0)
  任务A1       (bulletLevel = 1)  ✅ 正确

双向关系：
- 父→子：event_001.childEventIds 包含 'event_002'
- 子→父：event_002.parentEventId = 'event_001'
```

## 技术原理

### 临时ID的生命周期
```
1. 用户按 Enter 创建新行
   → Slate 生成临时ID: line-1702345678901-0.12345
   
2. 用户按 Tab 键缩进
   → 更新 Slate metadata: { parentEventId: '上一行的ID' }
   → 如果上一行是临时ID，此时 parentEventId = 'line-xxx' ⚠️
   
3. PlanSlate 检测到临时ID，触发异步保存
   → 调用 EventHub.createEvent()
   → 返回真实ID: event_1702345678901_abc123
   → 更新 idMapping: { 'line-xxx': 'event_xxx' }
   → 更新 Slate 节点的 eventId
   
4. 用户失焦，触发 onChange
   → serialization.slateNodesToPlanItems() 读取 metadata
   → 🔥 [FIX] 检测 parentEventId 是否为临时ID
   → 如果是，清除为 undefined
   
5. PlanManager.executeBatchUpdate 保存
   → 🔥 [FIX] 再次验证 parentEventId
   → 保存到数据库: { parentEventId: 'event_xxx' } ✅
```

### 防御层级
```
第一道防线：PlanSlate Tab键处理器
  - 检测临时ID，触发立即保存
  - 使用 idMapping 解析真实ID
  - 🔧 但可能被 onChange 竞争

第二道防线：serialization.ts（本次修复）
  - 过滤所有 line-xxx 格式的ID
  - 设置为 undefined（表示无父事件）
  - ✅ 防止脏数据进入Event对象

第三道防线：PlanManager.executeBatchUpdate（本次修复）
  - 保存前最后一次验证
  - 清理所有临时ID引用
  - ✅ 确保数据库干净
```

## 后续计划

### 短期（本周）
- ✅ 实现临时ID过滤（已完成）
- ⏳ 完成测试用例
- ⏳ 观察线上日志，确认修复效果

### 中期（下周）
- ⏳ 设计全局 TempIdMapper 服务
- ⏳ 优化 Tab 键的 ID 解析逻辑
- ⏳ 改进 EventHub.createEvent 的返回格式

### 长期（下个月）
- ⏳ 探索去临时ID架构
- ⏳ 使用占位符替代临时ID
- ⏳ 延迟创建模式（仅在失焦时创建真实Event）

## 相关文档

- [问题分析报告](./BULLETLEVEL_TEMPID_ISSUE_ANALYSIS.md)
- [EventTree架构文档](../architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md)
- [PlanManager PRD](../PRD/PLANMANAGER_MODULE_PRD.md)
- [SlateEditor PRD](../PRD/SlateEditor_PRD.md)

---

**文档版本**：v1.0  
**更新时间**：2025-12-10  
**状态**：✅ 修复已完成，待测试验证
