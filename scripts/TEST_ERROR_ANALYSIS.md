# 测试错误根源分析报告

## 执行摘要

测试脚本 v2.0 运行时出现大量错误，通过系统性分析代码和PRD文档，发现**4个核心根源**：

1. **事件验证失败** - 缺少必需的时间字段
2. **IndexedDB更新失败** - 事件未正确存储
3. **EventHistory配额超限** - localStorage已满
4. **属性断言错误** - 期望值与实际数据模型不匹配

---

## 错误 #1: 事件创建验证失败

### 错误信息
```
❌ [EventService] Event validation failed: Calendar event requires both startTime and endTime
```

### 根本原因

**位置**: `src/utils/eventValidation.ts`

```typescript
export function validateEventTime(event: Event): ValidationResult {
  // Task 类型：时间可选
  if (event.isTask === true) {
    return { valid: true, warnings };
  }
  
  // Calendar 事件：时间必需
  if (!event.startTime || !event.endTime) {
    return {
      valid: false,
      error: 'Calendar event requires both startTime and endTime',
    };
  }
  
  return { valid: true, warnings };
}
```

**问题分析**:
- 4DNote区分两种事件类型:
  - **Task事件** (`isTask=true`): 时间可选，同步到Microsoft To Do
  - **Calendar事件** (`isTask=false/undefined`): 时间必需，同步到Outlook Calendar
  
- 测试脚本创建事件时:
  ```javascript
  await EventService.createEvent({
    id: testEventId,
    title: 'Hub 测试事件',
    timeSpec: { type: 'span', start: ..., end: ... },  // ❌ 错误：timeSpec不是存储字段
    content: [{ type: 'paragraph', children: [{ text: '测试内容' }] }],
    // ❌ 缺少: isTask 或 startTime/endTime
  });
  ```

- `timeSpec`字段只是"意图表达"，实际存储使用`startTime`和`endTime`(字符串格式: `'YYYY-MM-DD HH:mm:ss'`)

### 解决方案

**选项A**: 创建Task类型事件（无需时间）
```javascript
await EventService.createEvent({
  id: testEventId,
  title: 'Task测试事件',
  isTask: true,  // ✅ 标记为Task
  // ✅ 时间可选
});
```

**选项B**: 提供正确的时间字段
```javascript
await EventService.createEvent({
  id: testEventId,
  title: 'Calendar测试事件',
  startTime: '2025-12-03 10:00:00',  // ✅ 字符串格式
  endTime: '2025-12-03 11:00:00',
  // isTask默认为false/undefined
});
```

---

## 错误 #2: IndexedDB更新失败

### 错误信息
```
❌ Failed to update event: Error: Event not found: test-hub-1764759531608
    at IndexedDBService.updateEvent (IndexedDBService.ts:355:13)
```

### 根本原因

**位置**: `src/services/storage/IndexedDBService.ts:340-356`

```typescript
async createEvent(event: StorageEvent): Promise<void> {
  return this.put('events', event);
}

async updateEvent(id: string, updates: Partial<StorageEvent>): Promise<void> {
  const existingEvent = await this.getEvent(id);
  if (!existingEvent) {
    throw new Error(`Event not found: ${id}`);  // ❌ 这里抛出错误
  }
  const updatedEvent = { ...existingEvent, ...updates, updatedAt: new Date().toISOString() };
  return this.put('events', updatedEvent);
}
```

**问题分析**:
1. 事件通过`createEvent`存入IndexedDB，但`getEvent(id)`找不到
2. 可能原因:
   - **事件对象缺少必需字段** → IndexedDB `put()`失败但未抛出错误
   - **事件ID格式问题** → 测试使用`test-hub-${Date.now()}`，但存储可能需要标准UUID
   - **索引不匹配** → IndexedDB Schema定义的索引与查询不符

**存储字段要求** (`src/services/storage/types.ts`):
```typescript
export interface StorageEvent extends Event {
  // Event接口中的所有字段
  id: string;              // ✅ 必需
  title: EventTitle;       // ✅ 必需（对象格式）
  startTime?: string;      // Calendar事件必需
  endTime?: string;
  createdAt: string;       // ✅ 必需
  updatedAt: string;       // ✅ 必需
  // ... 其他字段
}
```

### 解决方案

**修复1**: 提供完整的事件对象
```javascript
const now = formatTimeForStorage(new Date());
await EventService.createEvent({
  id: testEventId,
  title: { simpleTitle: 'Hub测试事件' },  // ✅ EventTitle对象
  isTask: true,
  createdAt: now,  // ✅ 必需
  updatedAt: now,  // ✅ 必需
  tags: [],
  attendees: [],
});
```

**修复2**: 使用EventService内部的normalizeEvent
- EventService.createEvent会自动填充缺失字段
- 但需要通过验证（见错误#1）

---

## 错误 #3: EventHistory配额超限

### 错误信息
```
❌ 保存日志失败: QuotaExceededError: Failed to execute 'setItem' on 'Storage': 
   Setting the value of '4dnote_event_history' exceeded the quota.
    at EventHistoryService.saveLog (EventHistoryService.ts:545:22)
```

### 根本原因

**位置**: `src/services/EventHistoryService.ts:533-548`

```typescript
private static saveLog(log: EventChangeLog): void {
  try {
    const logs = this.getAllLogs();
    logs.push(log);
    
    console.log('[EventHistoryService] 💾 saveLog:', {
      operation: log.operation,
      历史总数: logs.length  // ⚠️ 可能已经>10000
    });
    
    // 如果记录太多，自动清理旧记录
    if (logs.length > 10000) {
      this.cleanupOldLogs();
    } else {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(logs));  // ❌ 超出5MB配额
    }
  } catch (error: any) {
    if (error.name === 'QuotaExceededError') {
      throw error;  // ❌ 直接抛出，导致deleteEvent失败
    }
  }
}
```

**问题分析**:
- EventHistoryService将所有事件变更记录存储在localStorage的单个key中
- 每次调用`createEvent`/`updateEvent`/`deleteEvent`都会记录历史
- 测试运行多次后，`4dnote_event_history`可能已包含数千条记录
- localStorage配额限制: **5-10MB per domain** (浏览器标准)

**数据量估算**:
```
单条记录 ≈ 500-1000 bytes
10,000条记录 ≈ 5-10 MB
```

### 解决方案

**修复1**: 测试前清空EventHistory
```javascript
// 在runAllTests()开头添加
async function runAllTests() {
  testLogger.section('🎯 4DNote 数据流完整测试 v2.0');
  
  // ✅ 清空历史记录（避免配额超限）
  try {
    localStorage.removeItem('4dnote_event_history');
    testLogger.info('🧹 已清空 EventHistory');
  } catch (error) {
    testLogger.warn('⚠️ 清空 EventHistory 失败', error);
  }
  
  // ... 运行测试
}
```

**修复2**: 禁用EventHistory during测试
```javascript
// 修改EventService.createEvent，添加选项
await EventService.createEvent({
  id: testEventId,
  title: '测试事件',
  isTask: true,
}, false, {
  source: 'test',  // ✅ EventHistoryService可以检测并跳过
});
```

**修复3**: 实施自动清理
- PRD文档建议使用SQLite存储历史（避免localStorage限制）
- 短期方案: 测试完成后清理

---

## 错误 #4: 属性断言失败

### 错误信息
```
❌ 联系人与事件关联成功 {organizer: undefined}
❌ 标签与事件关联成功 {tags: Array(0)}
❌ 事件 A → 事件 B 链接成功 {linkedEventIds: undefined}
❌ 子事件1的 parentEventId 正确 {parentEventId: undefined}
```

### 根本原因

**测试代码期望**:
```javascript
// 期望organizer自动设置
const event = await EventService.getEventById(testEventId);
await assert(
  event && event.organizer === contactId,  // ❌ 断言失败
  '联系人与事件关联成功',
  { organizer: event?.organizer }
);
```

**实际数据模型** (`src/types.ts`):
```typescript
export interface Event {
  // ...
  organizer?: Contact;  // ⚠️ 类型是Contact对象，不是string
  attendees?: Contact[];
  tags?: string[];      // ✅ 但需要手动设置
  linkedEventIds?: string[];  // ⚠️ 需要调用addLink()
  backlinks?: string[];       // ⚠️ 自动计算，只读
  parentEventId?: string;     // ⚠️ 创建时设置，不会自动填充
}
```

**问题分析**:
1. **organizer不是自动字段**: 需要在createEvent时明确传入
   ```javascript
   await EventService.createEvent({
     id: testEventId,
     title: '测试事件',
     isTask: true,
     organizer: { id: contactId, name: '张三', email: 'zhang@example.com' },  // ✅ Contact对象
   });
   ```

2. **tags需要明确设置**:
   ```javascript
   await EventService.createEvent({
     id: testEventId,
     title: '测试事件',
     isTask: true,
     tags: ['测试标签'],  // ✅ 明确设置
   });
   ```

3. **linkedEventIds需要调用addLink()**:
   ```javascript
   await EventService.createEvent({ id: eventA, ... });
   await EventService.createEvent({ id: eventB, ... });
   await EventService.addLink(eventA, eventB);  // ✅ 建立链接
   
   const eventA = await EventService.getEventById(eventA);
   console.log(eventA.linkedEventIds);  // ['eventB']
   ```

4. **parentEventId在创建时设置**:
   ```javascript
   await EventService.createEvent({ id: parentId, ... });
   await EventService.createEvent({ 
     id: childId,
     parentEventId: parentId,  // ✅ 创建时指定父事件
     ...
   });
   ```

### 解决方案

**调整测试断言**:
```javascript
// ❌ 旧断言
await assert(
  event && event.organizer === contactId,
  '联系人与事件关联成功'
);

// ✅ 新断言
await assert(
  event && event.organizer?.id === contactId,  // 检查Contact.id
  '联系人与事件关联成功',
  { organizer: event?.organizer }
);
```

---

## 综合修复方案

### 修复清单

- [ ] **错误#1**: 为所有测试事件添加`isTask: true`或正确的`startTime/endTime`
- [ ] **错误#2**: 确保事件对象包含必需字段（title作为EventTitle对象）
- [ ] **错误#3**: 测试开始前清空`localStorage.removeItem('4dnote_event_history')`
- [ ] **错误#4**: 调整所有断言以匹配实际数据模型行为

### 推荐的测试事件模板

```javascript
function createTestEvent(id, overrides = {}) {
  const now = formatTimeForStorage(new Date());
  return {
    id,
    title: { simpleTitle: '测试事件' },  // ✅ EventTitle对象
    isTask: true,                        // ✅ 避免时间验证错误
    tags: [],
    attendees: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// 使用示例
await EventService.createEvent(createTestEvent('test-1', {
  title: { simpleTitle: '自定义标题' },
  tags: ['标签A'],
}));
```

### 测试前置操作

```javascript
async function setupTests() {
  testLogger.info('🧹 清理测试环境...');
  
  // 1. 清空EventHistory（避免配额超限）
  try {
    localStorage.removeItem('4dnote_event_history');
    testLogger.info('✅ 已清空 EventHistory');
  } catch (error) {
    testLogger.warn('⚠️ 清空失败:', error);
  }
  
  // 2. 清空测试事件（可选）
  const testEventIds = await storageManager.queryEvents({
    filters: { id: { $regex: '^test-' } }
  });
  for (const event of testEventIds.items) {
    await EventService.deleteEvent(event.id);
  }
  
  testLogger.info('✅ 测试环境已准备');
}
```

---

## 参考文档

### 相关代码文件
- `src/utils/eventValidation.ts` - 事件时间验证逻辑
- `src/services/EventService.ts` - 事件CRUD核心服务
- `src/services/storage/IndexedDBService.ts` - IndexedDB存储实现
- `src/services/EventHistoryService.ts` - 事件历史记录服务
- `src/types.ts` - Event接口定义

### 相关PRD文档
- `docs/PRD/TimeLog_&_Description_PRD.md` - EventHistory设计文档

### 关键概念
1. **Task vs Calendar事件**: isTask标志决定时间字段是否必需
2. **EventTitle三层架构**: fullTitle/colorTitle/simpleTitle分别用于不同场景
3. **EventHistory存储限制**: localStorage 5-10MB配额
4. **双向链接**: addLink()建立关系，backlinks自动计算

---

## 下一步行动

1. ✅ 创建修复版测试脚本 (`test-data-flow-v3.js`)
2. ⏳ 运行测试并验证通过率
3. ⏳ 文档化测试最佳实践
4. ⏳ 考虑将EventHistory迁移到IndexedDB（长期方案）
