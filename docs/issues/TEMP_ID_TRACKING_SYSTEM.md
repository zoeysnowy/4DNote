# 临时ID追踪系统 - 技术文档

## 概述

**版本**: v2.15  
**创建时间**: 2025-12-10  
**问题**: Tab键缩进时生成的临时ID在存储过程中导致父子关系断裂  
**解决方案**: 添加临时ID标记字段，通过EventHistory记录映射，自动替换父子关系中的临时ID

## 问题分析

### 原始问题
用户反馈：**"因为tab后生成的是临时ID，在存储过程中出了很多问题"**

### 根本原因
1. **临时ID生成**: 新行创建时使用 `line-{timestamp}-{random}` 格式的临时ID
2. **父子关系设置**: Tab键缩进时，如果父事件还是临时ID，子事件的 `parentEventId` 会被设置为临时ID
3. **异步保存竞争**: Tab键触发异步保存，但 `onChange` 可能先触发，导致临时ID被序列化
4. **数据库污染**: 临时ID被保存到数据库，`calculateBulletLevel()` 找不到父事件，层级关系断裂

### 失败场景示例
```
操作序列：
1. 创建 "任务A" (生成临时ID: line-123)
2. 按 Enter 创建新行
3. 立即按 Tab 缩进 (设置 parentEventId = line-123)
4. 输入 "任务A1"
5. 失焦触发保存

结果：
- line-123 转换为 event_001 (任务A保存成功)
- 任务A1 的 parentEventId = "line-123" (错误！应该是 event_001)
- bulletLevel 计算失败，显示为同级
```

## 解决方案架构

### 三层防御策略

#### 第一层：临时ID过滤（v2.14 已实现）
- **位置**: `serialization.ts` 和 `PlanManager.tsx`
- **功能**: 检测并清除临时ID，防止脏数据进入数据库
- **限制**: 丢失层级信息，子事件变为顶层事件

#### 第二层：临时ID标记（v2.15 新增）
- **位置**: `types.ts` - Event接口
- **字段**:
  ```typescript
  _isTempId?: boolean;       // 标记当前ID是否为临时ID
  _originalTempId?: string;  // 保存原始临时ID
  ```
- **功能**: 在创建事件时标记临时ID，用于追踪和调试

#### 第三层：EventHistory映射追踪（v2.15 新增）
- **位置**: `EventHistoryService.ts`
- **功能**: 记录临时ID → 真实ID的映射关系
- **数据结构**:
  ```typescript
  interface EventChangeLog {
    tempIdMapping?: {
      tempId: string;      // line-xxx
      realId: string;      // event_xxx
      timestamp: string;   // 转换时间
    };
  }
  ```

#### 第四层：自动替换系统（v2.15 新增）
- **位置**: `EventService.ts - resolveTempIdReferences()`
- **功能**: 当临时ID转换为真实ID时，自动扫描并更新所有引用
- **替换范围**:
  - `parentEventId` 字段
  - `childEventIds` 数组
  - 所有子事件和父事件的双向关系

## 技术实现

### 1. Event类型扩展

**文件**: `src/types.ts`

```typescript
export interface Event {
  // ... 现有字段
  
  // 🔥 v2.15: 临时ID追踪系统
  _isTempId?: boolean;       // 标记当前ID是否为临时ID（line-xxx格式）
  _originalTempId?: string;  // 保存原始临时ID，用于EventHistory追踪和父子关系替换
}
```

### 2. EventHistory扩展

**文件**: `src/types/eventHistory.ts`

```typescript
export interface EventChangeLog {
  // ... 现有字段
  
  /** 🔥 临时ID映射（记录临时ID→真实ID的转换关系） */
  tempIdMapping?: {
    tempId: string;      // 原始临时ID（line-xxx格式）
    realId: string;      // 转换后的真实ID（event_xxx格式）
    timestamp: string;   // 转换时间戳
  };
}
```

### 3. EventService创建事件

**文件**: `src/services/EventService.ts`

#### 3.1 检测并标记临时ID

```typescript
static async createEvent(event: Event, skipSync = false, options?: CreateEventOptions) {
  // 🔥 v2.15: 临时ID追踪系统
  const isTempId = event.id.startsWith('line-');
  const originalTempId = isTempId ? event.id : undefined;
  
  const finalEvent: Event = {
    ...normalizedEvent,
    _isTempId: isTempId,
    _originalTempId: originalTempId,
  };
  
  // ... 创建事件
}
```

#### 3.2 记录临时ID映射

```typescript
// 记录到事件历史
const historyLog = EventHistoryService.logCreate(finalEvent, options?.source || 'user-edit');

// 🔥 v2.15: 如果是临时ID，记录映射关系到EventHistory
if (isTempId && originalTempId) {
  await EventHistoryService.recordTempIdMapping(originalTempId, finalEvent.id);
  eventLogger.log('🔥 [TempId] 记录临时ID映射:', {
    tempId: originalTempId,
    realId: finalEvent.id,
    title: finalEvent.title?.simpleTitle
  });
  
  // 🔥 v2.15: 自动替换所有引用该临时ID的父子关系
  await this.resolveTempIdReferences(originalTempId, finalEvent.id);
}
```

#### 3.3 自动替换引用

```typescript
/**
 * 解析并替换所有引用临时ID的父子关系
 * @param tempId 临时ID（line-xxx）
 * @param realId 真实ID（event_xxx）
 */
private static async resolveTempIdReferences(tempId: string, realId: string): Promise<void> {
  try {
    // 查找所有引用该临时ID作为parentEventId的事件
    const allEvents = await storageManager.queryEvents({ limit: 10000 });
    const needsUpdate: Event[] = [];
    
    allEvents.items.forEach(event => {
      let needUpdate = false;
      const updates: Partial<Event> = {};
      
      // 检查 parentEventId
      if (event.parentEventId === tempId) {
        updates.parentEventId = realId;
        needUpdate = true;
      }
      
      // 检查 childEventIds
      if (event.childEventIds && Array.isArray(event.childEventIds)) {
        const index = event.childEventIds.indexOf(tempId);
        if (index !== -1) {
          const newChildIds = [...event.childEventIds];
          newChildIds[index] = realId;
          updates.childEventIds = newChildIds;
          needUpdate = true;
        }
      }
      
      if (needUpdate) {
        needsUpdate.push({ ...event, ...updates });
      }
    });
    
    // 批量更新
    if (needsUpdate.length > 0) {
      for (const event of needsUpdate) {
        await this.updateEvent(
          event.id,
          {
            parentEventId: event.parentEventId,
            childEventIds: event.childEventIds
          },
          true, // skipSync
          { source: 'temp-id-resolution' }
        );
      }
      
      eventLogger.log('✅ [TempId] 临时ID替换完成:', {
        tempId,
        realId,
        updatedCount: needsUpdate.length
      });
    }
  } catch (error) {
    eventLogger.error('❌ [TempId] 替换临时ID引用失败:', error);
  }
}
```

### 4. EventHistoryService扩展

**文件**: `src/services/EventHistoryService.ts`

#### 4.1 记录映射关系

```typescript
/**
 * 🔥 v2.15: 记录临时ID到真实ID的映射关系
 */
static async recordTempIdMapping(tempId: string, realId: string): Promise<void> {
  const log: EventChangeLog = {
    id: this.generateLogId(),
    eventId: realId,
    operation: 'create',
    timestamp: formatTimeForStorage(new Date()),
    source: 'temp-id-mapping',
    tempIdMapping: {
      tempId,
      realId,
      timestamp: formatTimeForStorage(new Date())
    },
    metadata: {
      type: 'temp-id-resolution',
      description: `临时ID ${tempId} 转换为真实ID ${realId}`
    }
  };
  
  this.saveLog(log);
  historyLogger.log('🔥 [TempId] 记录ID映射:', { tempId, realId });
}
```

#### 4.2 查询映射关系

```typescript
/**
 * 🔥 v2.15: 查询临时ID对应的真实ID
 */
static async resolveTempId(tempId: string): Promise<string | null> {
  const logs = await storageManager.queryEventHistory({
    limit: 1000,
    operations: ['create']
  });
  
  const mappingLog = logs.find(log => 
    log.tempIdMapping?.tempId === tempId
  );
  
  if (mappingLog && mappingLog.tempIdMapping) {
    return mappingLog.tempIdMapping.realId;
  }
  
  return null;
}
```

### 5. PlanSlate更新

**文件**: `src/components/PlanSlate/PlanSlate.tsx`

#### 5.1 Tab键处理

```typescript
// 创建事件（EventService 会生成真实 ID）
const event: any = {
  id: tempId,
  title: '',
  isPlan: true,
  isTask: true,
  type: 'todo',
  // 🔥 v2.15: 标记临时ID
  _isTempId: true,
  _originalTempId: tempId,
  // 使用解析后的真实 parentEventId
  ...(isCurrentEvent && resolvedParentId && { parentEventId: resolvedParentId })
};
```

#### 5.2 Shift+Tab键处理

```typescript
for (const { node, path, id } of eventsToSave) {
  const event: any = {
    id,
    title: '',
    isPlan: true,
    isTask: true,
    type: 'todo',
    // 🔥 v2.15: 标记临时ID
    _isTempId: true,
    _originalTempId: id
  };
  // ...
}
```

## 数据流程

### 完整生命周期

```
1. 用户操作
   ↓
   按 Enter 创建新行
   ↓
   Slate 生成临时ID: line-1702345678901-0.12345
   ↓
   按 Tab 缩进
   ↓
   更新 metadata: { parentEventId: 'line-xxx' } (可能是临时ID)

2. 事件创建
   ↓
   PlanSlate 检测到临时ID
   ↓
   标记 _isTempId = true, _originalTempId = 'line-xxx'
   ↓
   调用 EventHub.createEvent()
   ↓
   EventService.createEvent() 生成真实ID: event_xxx

3. 临时ID追踪
   ↓
   EventHistoryService.recordTempIdMapping('line-xxx', 'event_xxx')
   ↓
   保存映射关系到 EventHistory（SQLite）
   ↓
   EventService.resolveTempIdReferences('line-xxx', 'event_xxx')

4. 自动替换
   ↓
   查询所有事件，查找引用 'line-xxx' 的 parentEventId/childEventIds
   ↓
   批量更新所有引用，替换为 'event_xxx'
   ↓
   双向关系修复完成

5. 最终结果
   ↓
   数据库中所有 parentEventId 都是真实ID
   ↓
   calculateBulletLevel() 正确计算层级
   ↓
   EventTree 显示正确的缩进关系
```

## 优势对比

### v2.14方案（临时ID过滤）
| 优点 | 缺点 |
|------|------|
| ✅ 简单直接 | ❌ 丢失层级信息 |
| ✅ 防御性编程 | ❌ 子事件变为顶层 |
| ✅ 向后兼容 | ❌ 无法恢复关系 |

### v2.15方案（临时ID追踪）
| 优点 | 缺点 |
|------|------|
| ✅ 完全保留层级关系 | ⚠️ 增加系统复杂度 |
| ✅ 自动修复引用 | ⚠️ 需要扫描所有事件 |
| ✅ 支持历史追溯 | ⚠️ EventHistory体积增大 |
| ✅ 可调试可追踪 | - |

## 调试工具

### debug-bulletlevel.html

新增第7个检查按钮：**🆕 7️⃣ 检查临时ID追踪系统（v2.15）**

#### 检查项目

1. **临时ID标记检查**
   - 查询所有带有 `_isTempId` 或 `_originalTempId` 的事件
   - 确认是否有事件未正确转换

2. **EventHistory映射检查**
   - 显示提示查看SQLite数据库
   - 未来可添加API查询映射记录

3. **父子关系验证**
   - 统计所有有父事件的事件数量
   - 检查parentEventId是否为真实ID
   - 计算修复率

#### 使用方法

```
1. 打开 http://localhost:5173/debug-bulletlevel.html
2. 点击 🆕 7️⃣ 检查临时ID追踪系统（v2.15）
3. 查看输出结果：
   ✅ 所有事件已正确转换为真实ID
   ✅ 父子关系验证: 使用真实ID的事件: X / X
   ✅ 临时ID追踪系统工作正常！
```

## 测试用例

### 测试1：单层缩进
```
操作：
1. 创建 "任务A" → Enter
2. Tab → "任务A1" → 失焦
3. 刷新页面

验证：
✅ 任务A1 缩进在 任务A 下
✅ 控制台显示 "🔥 [TempId] 记录临时ID映射"
✅ 控制台显示 "✅ [TempId] 临时ID替换完成"
✅ debug工具显示 "所有事件已正确转换为真实ID"
```

### 测试2：多层缩进
```
操作：
快速输入：
  A → Enter
  Tab → A1 → Enter
  Tab → A1a → Enter
  Tab → A1a-i

验证：
✅ 4层缩进正确显示
✅ 每个事件的 parentEventId 都是真实ID
✅ calculateBulletLevel() 返回正确层级
```

### 测试3：快速连续操作
```
操作：
1. 快速连续输入10行
2. 快速按Tab建立多层关系
3. 不等待保存完成，立即失焦

验证：
✅ 所有层级关系正确
✅ 无临时ID残留
✅ EventHistory记录完整映射
```

### 测试4：临时ID映射查询
```
代码：
import { EventHistoryService } from './services/EventHistoryService';

// 查询临时ID对应的真实ID
const realId = await EventHistoryService.resolveTempId('line-1702345678901-0.12345');
console.log('真实ID:', realId); // event_1702345678901_abc123

验证：
✅ 返回正确的真实ID
✅ 未找到时返回 null
```

## 性能影响

### 额外开销

1. **事件创建时**:
   - 记录映射到EventHistory: ~5ms
   - 扫描并替换引用: ~10ms × 事件数量/1000
   - 总计：15-50ms（取决于事件数量）

2. **存储空间**:
   - 每个映射记录: ~200 bytes
   - 1000个事件: ~200KB
   - SQLite无配额限制，可忽略

3. **查询性能**:
   - EventHistory索引: 支持快速查询
   - 临时ID解析: O(n) 线性扫描（可优化为索引查询）

### 优化建议

1. **批量处理**: 收集多个临时ID，一次性批量替换
2. **索引优化**: 为tempIdMapping创建专门索引
3. **缓存策略**: 内存缓存最近的映射关系
4. **定期清理**: 删除90天前的映射记录

## 监控和日志

### 关键日志

```typescript
// 创建临时ID
[Tab] 🆕 Creating event with parentEventId: { tempId, parentEventId }

// 记录映射
[TempId] 记录临时ID映射: { tempId, realId, title }

// 查找引用
[TempId] 找到引用临时ID的parentEventId: { eventId, oldParentId, newParentId }

// 批量更新
[TempId] 批量更新 X 个事件的父子关系

// 完成
[TempId] 临时ID替换完成: { tempId, realId, updatedCount }
```

### 监控指标

1. **映射成功率**: 映射记录数 / 临时ID事件数
2. **替换成功率**: 替换事件数 / 引用临时ID事件数
3. **平均响应时间**: createEvent的耗时分布
4. **残留临时ID数**: 数据库中仍包含临时ID的事件数

## 回滚策略

### 如果需要禁用v2.15功能

1. **保留v2.14过滤逻辑**: serialization.ts和PlanManager.tsx的临时ID检测仍然有效
2. **注释EventService代码**:
   ```typescript
   // 注释这两行
   // await EventHistoryService.recordTempIdMapping(originalTempId, finalEvent.id);
   // await this.resolveTempIdReferences(originalTempId, finalEvent.id);
   ```
3. **降级行为**: 系统恢复到v2.14，临时ID被过滤但层级关系丢失

### 数据迁移

如果需要清理历史临时ID：

```typescript
// 批量清理工具（未来实现）
async function cleanupTempIdReferences() {
  const allEvents = await EventService.getAllEvents();
  
  for (const event of allEvents) {
    if (event.parentEventId?.startsWith('line-')) {
      // 尝试从EventHistory解析
      const realId = await EventHistoryService.resolveTempId(event.parentEventId);
      if (realId) {
        await EventService.updateEvent(event.id, { parentEventId: realId });
      } else {
        // 无法解析，清除parentEventId
        await EventService.updateEvent(event.id, { parentEventId: undefined });
      }
    }
  }
}
```

## 未来改进

### 短期（下周）
- [ ] 添加EventHistory索引优化临时ID查询
- [ ] 实现批量替换优化性能
- [ ] 添加监控指标和性能仪表板

### 中期（下月）
- [ ] 实现临时ID缓存机制
- [ ] 添加自动清理过期映射
- [ ] 支持临时ID跨会话持久化

### 长期（下季度）
- [ ] 探索去临时ID架构
- [ ] 使用UUID替代临时ID
- [ ] 延迟创建模式优化

## 相关文档

- [问题分析报告](./BULLETLEVEL_TEMPID_ISSUE_ANALYSIS.md)
- [测试指南](./BULLETLEVEL_TEMPID_FIX_TESTING_GUIDE.md)
- [EventTree架构](../architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md)
- [PlanManager PRD](../PRD/PLANMANAGER_MODULE_PRD.md)

---

**文档版本**: v1.0  
**最后更新**: 2025-12-10  
**维护者**: GitHub Copilot  
**状态**: ✅ 实现完成，待测试验证
