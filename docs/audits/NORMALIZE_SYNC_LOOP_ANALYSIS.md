# 数据流追踪分析：normalizeEvent 5 次同步循环检查

**日期**：2026-01-09
**目的**：检查 normalizeEvent 在多次同步循环中是否产生脏数据、冗余字段、无意义 EventHistory 写入

---

## 🔍 测试场景：5 次同步循环

```
Cycle 1: 本地新建事件 → 写入 IndexedDB
Cycle 2: 同步到 Outlook
Cycle 3: Outlook 回读 → 本地写入
Cycle 4: 用户编辑 → 本地写入
Cycle 5: 同步到 Outlook → 回读 → 本地写入
```

---

## 📊 数据流追踪（详细分析）

### Cycle 1: 本地新建事件

**入口**：`EventService.createEvent()`

```typescript
// 1. 用户创建事件
const newEvent = {
  title: "会议",
  description: "讨论Q1规划",
  startTime: "2026-01-10 14:00:00",
  endTime: "2026-01-10 15:00:00"
};

// 2. normalizeEvent() 处理
const normalizedEvent = this.normalizeEvent(newEvent);
```

**normalizeEvent 做了什么**：

```typescript
// src/services/EventService.ts:3250-3400
normalizeEvent(event, options?) {
  // 1. 提取签名（如果有）
  const extractedTimestamps = SignatureUtils.extractTimestampsFromSignature(event.description);
  const extractedCreator = SignatureUtils.extractCreatorFromSignature(event.description);
  
  // 2. 清理 description（移除签名）
  let fallbackContent = SignatureUtils.extractCoreContent(event.description);
  
  // 3. HTML → 纯文本转换（如果是 HTML）
  if (fallbackContent.includes('<')) {
    // 递归解码 HTML 实体
    // 提取纯文本
  }
  
  // 4. normalizeEventLog（核心）
  const normalizedEventLog = this.normalizeEventLog(
    event.eventlog,
    fallbackContent,    // 回退内容
    eventCreatedAt,     // Event.createdAt (number)
    eventUpdatedAt,     // Event.updatedAt (number)
    oldEventLog         // 旧 eventlog（用于 Diff）
  );
  
  // 5. 从 Block-Level Timestamp 提取时间（优先级最高）
  const blockLevelTimestamps = extractFromBlockLevel(normalizedEventLog);
  
  // 6. 时间戳选择策略（取最早/最新）
  const finalCreatedAt = min(
    blockLevelTimestamps.createdAt,
    extractedTimestamps.createdAt,
    event.createdAt
  );
  
  const finalUpdatedAt = max(
    blockLevelTimestamps.updatedAt,
    extractedTimestamps.updatedAt,
    event.updatedAt
  );
  
  // 7. 重新构建 description（添加签名）
  const descriptionWithSignature = SignatureUtils.buildSignature(
    normalizedEventLog.html,
    finalCreatedAt,
    finalUpdatedAt,
    creator
  );
  
  return {
    ...event,
    description: descriptionWithSignature,
    eventlog: normalizedEventLog,
    createdAt: finalCreatedAt,
    updatedAt: finalUpdatedAt
  };
}
```

**Cycle 1 输出**：

```json
{
  "id": "abc123",
  "title": "会议",
  "description": "讨论Q1规划\n\n---\n⏱️ 2026-01-10 14:00:00 | 📝 2026-01-10 14:00:00 | 🖥️ 4DNote",
  "eventlog": {
    "slateJson": "[{\"type\":\"paragraph\",\"id\":\"block-001\",\"createdAt\":1736496000000,\"updatedAt\":1736496000000,\"children\":[{\"text\":\"讨论Q1规划\"}]}]",
    "html": "<p>讨论Q1规划</p>",
    "plainText": "讨论Q1规划"
  },
  "createdAt": "2026-01-10 14:00:00",
  "updatedAt": "2026-01-10 14:00:00"
}
```

**⚠️ 潜在问题 #1**：
- ✅ **已缓解**：`normalizeEventLog` 有早期退出逻辑（lines 2840-2850）
- ✅ **已缓解**：使用 `ensureBlockTimestamps()` 只补全缺失字段，不修改已有字段

---

### Cycle 2: 同步到 Outlook

**入口**：`MicrosoftCalendarService.updateOutlookEvent()`

```typescript
// src/services/calendar/MicrosoftCalendarService.ts
async updateOutlookEvent(event: Event) {
  // 1. serializeEventDescription（生成 CompleteMeta V2）
  const outlookDescription = EventService.serializeEventDescription(event);
  
  // 2. 发送到 Outlook API
  await graphClient.api(`/me/events/${outlookId}`).update({
    subject: event.title,
    start: { dateTime: event.startTime },
    end: { dateTime: event.endTime },
    body: {
      contentType: 'HTML',
      content: outlookDescription
    }
  });
}
```

**serializeEventDescription 做了什么**：

```typescript
// src/services/EventService.ts:6456-6560
serializeEventDescription(event) {
  // 1. normalizeEventLog（再次规范化）
  const normalizedEventlog = this.normalizeEventLog(event.eventlog);
  const slateNodes = JSON.parse(normalizedEventlog.slateJson || '[]');
  
  // 2. 生成 CompleteMeta V2
  const meta = {
    v: 2,
    id: event.id,
    slate: {
      nodes: slateNodes.map(node => {
        const text = extractNodeText(node);
        return {
          id: node.id,
          s: text.substring(0, 5),      // 前5字符
          e: text.substring(len - 5),   // 后5字符
          l: text.length,                // 长度
          ts: node.createdAt,            // 创建时间
          ut: node.updatedAt,            // 更新时间
          lvl: node.level,
          bullet: node.bulletLevel,
          mention: node.children?.[0]?.mention
        };
      })
    },
    signature: {
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      creator: inferredCreator,
      eventSource: event.source
    }
  };
  
  // 3. Base64 编码
  const metaBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(meta))));
  
  // 4. 拼接 HTML
  return `
    <div class="4dnote-content-wrapper" data-4dnote-version="2">
      ${slateNodesToHtml(slateNodes, { includeTimestamps: true })}
      <div id="4dnote-meta" style="display:none">
        ${metaBase64}
      </div>
    </div>
  `;
}
```

**Cycle 2 输出（Outlook description）**：

```html
<div class="4dnote-content-wrapper" data-4dnote-version="2">
  <p data-4d-id="block-001" data-4d-ts="1736496000000">讨论Q1规划</p>
  
  <!-- Meta Data Zone (V2) -->
  <div id="4dnote-meta" style="display:none">
    eyJ2IjoyLCJpZCI6ImFiYzEyMyIsInNsYXRlIjp7Im5vZGVzIjpbeyJpZCI6ImJsb2NrLTAwMSIsInMiOiLoqozorrojLCJlIjoiUTHop4TliJIiLCJsIjoxMCwidHMiOjE3MzY0OTYwMDAwMDAsInV0IjoxNzM2NDk2MDAwMDAwfV19LCJzaWduYXR1cmUiOnsiY3JlYXRlZEF0IjoiMjAyNi0wMS0xMCAxNDowMDowMCIsInVwZGF0ZWRBdCI6IjIwMjYtMDEtMTAgMTQ6MDA6MDAiLCJjcmVhdG9yIjoiNGRub3RlIiwiZXZlbnRTb3VyY2UiOiJsb2NhbCJ9fQ==
  </div>
</div>
```

**⚠️ 潜在问题 #2**：
- ❌ **问题**：`serializeEventDescription` 内部又调用了一次 `normalizeEventLog`
- ❌ **风险**：如果 `normalizeEventLog` 不是幂等的，会产生额外字段
- ✅ **实际情况**：有早期退出（line 2840），但仍有优化空间

---

### Cycle 3: Outlook 回读 → 本地写入

**入口**：`MicrosoftCalendarService.fetchEvents()` → `EventService.updateEvent()`

```typescript
// 1. Outlook 返回的 HTML（可能被改写）
const outlookHtml = graphEvent.body.content;

// 2. deserializeEventDescription（三层匹配 + Meta 合并）
const deserialized = EventService.deserializeEventDescription(outlookHtml, eventId);

// 3. normalizeEvent（再次规范化）
const normalizedEvent = EventService.normalizeEvent({
  ...existingEvent,
  ...deserialized.eventlog,
  ...deserialized.signature
});

// 4. updateEvent（记录 EventHistory）
await EventService.updateEvent(eventId, normalizedEvent, { source: 'external-sync' });
```

**deserializeEventDescription 做了什么**：

```typescript
// src/services/EventService.ts:6574-6640
deserializeEventDescription(html, eventId) {
  // 1. 提取 Meta
  const metaMatch = html.match(/<div id="4dnote-meta"[^>]*>([\s\S]*?)<\/div>/);
  const meta = metaMatch ? JSON.parse(atob(metaMatch[1])) : null;
  
  // 2. 提取可见 HTML（移除 Meta div）
  const visibleHtml = html.replace(/<div id="4dnote-meta"[\s\S]*?<\/div>/, '');
  
  // 3. 从 HTML 提取段落
  const htmlNodes = extractParagraphs(visibleHtml);
  
  // 4. 三层匹配（Exact → Sandwich → Fuzzy）
  const matchResults = this.threeLayerMatch(htmlNodes, meta.slate.nodes);
  
  // 5. 合并 HTML 文本 + Meta 元数据
  const finalNodes = this.applyMatchResults(htmlNodes, meta.slate.nodes, matchResults);
  
  return {
    eventlog: {
      slateJson: JSON.stringify(finalNodes)
    },
    signature: meta.signature
  };
}
```

**applyMatchResults 做了什么**：

```typescript
applyMatchResults(htmlNodes, metaNodes, matchResults) {
  return matchResults.map(match => {
    if (match.type === 'insert') {
      // 新增段落
      return {
        type: 'paragraph',
        id: match.id,  // 新生成的 ID
        createdAt: Date.now(),
        updatedAt: Date.now(),
        children: [{ text: htmlNodes[match.htmlIndex].text }]
      };
    }
    
    // Layer 1/2/3 匹配成功
    const htmlNode = htmlNodes[match.htmlIndex];
    const metaNode = metaNodes[match.metaIndex];
    
    return {
      type: 'paragraph',
      id: metaNode.id,           // ← 从 Meta 恢复
      createdAt: metaNode.ts,     // ← 从 Meta 恢复
      updatedAt: metaNode.ut,     // ← 从 Meta 恢复
      bulletLevel: metaNode.bullet,
      children: [{ 
        text: htmlNode.text,      // ← 从 HTML 提取（允许用户在 Outlook 编辑）
        ...(metaNode.mention && { mention: metaNode.mention })
      }]
    };
  });
}
```

**updateEvent → normalizeEvent**：

```typescript
// src/services/EventService.ts:1275
const normalizedEvent = this.normalizeEvent(mergedEvent, {
  preserveSignature: !eventlogChanged,  // ← 关键：如果 eventlog 没变，保留原签名
  oldEvent: originalEvent
});
```

**⚠️ 潜在问题 #3**：
- ❌ **问题**：`deserializeEventDescription` 解析完 → `updateEvent` 又调用 `normalizeEvent`
- ❌ **风险**：双重 normalize 可能产生额外字段
- ✅ **缓解**：`preserveSignature: !eventlogChanged` 避免签名变化
- ⚠️ **仍有风险**：`normalizeEventLog` 内部的 `ensureBlockTimestamps()` 可能补全字段

---

### Cycle 4: 用户编辑 → 本地写入

**入口**：用户在 UI 编辑内容，触发 `EventService.updateEvent()`

```typescript
// 用户编辑
const updates = {
  eventlog: {
    slateJson: "[{\"type\":\"paragraph\",\"id\":\"block-001\",\"createdAt\":1736496000000,\"updatedAt\":1736496000000,\"children\":[{\"text\":\"讨论Q1规划（已更新）\"}]}]"
  }
};

await EventService.updateEvent(eventId, updates, { source: 'user-edit' });
```

**updateEvent 内部流程**：

```typescript
// src/services/EventService.ts:1200-1500
updateEvent(eventId, updates, options) {
  // 1. 合并更新
  const mergedEvent = { ...originalEvent, ...filteredUpdates };
  
  // 2. 检测 eventlog 是否变化（Block-Level paragraph 计数）
  const oldBlockCount = countBlockLevelParagraphs(originalEvent.eventlog);
  const newBlockCount = countBlockLevelParagraphs(mergedEvent.eventlog);
  const eventlogChanged = oldBlockCount !== newBlockCount;
  
  // 3. normalizeEvent
  const normalizedEvent = this.normalizeEvent(mergedEvent, {
    preserveSignature: !eventlogChanged,  // ← 如果段落数没变，保留签名
    oldEvent: originalEvent
  });
  
  // 4. 记录 EventHistory（比对 normalize 后的数据）
  const changeLog = EventHistoryService.logUpdate(
    eventId,
    originalEvent,      // before（已 normalize）
    normalizedEvent,    // after（刚 normalize）
    'user-edit'
  );
  
  // 5. 只有真正有变更时才更新 updatedAt
  const hasRealChanges = changeLog !== null;
  const updatedEvent = {
    ...normalizedEvent,
    ...(hasRealChanges ? { updatedAt: now() } : {})
  };
  
  // 6. 保存 EventLog 版本历史
  if (filteredUpdates.eventlog && originalEvent.eventlog) {
    const oldEventLog = this.normalizeEventLog(originalEvent.eventlog);
    const newEventLog = this.normalizeEventLog(filteredUpdates.eventlog);
    
    // 比对内容是否真的有变化
    if (JSON.stringify(oldEventLog.slateJson) !== JSON.stringify(newEventLog.slateJson)) {
      await storageManager.saveEventLogVersion(eventId, newEventLog, oldEventLog);
    }
  }
}
```

**EventHistoryService.logUpdate**：

```typescript
// src/services/EventHistoryService.ts
static logUpdate(eventId, before, after, source) {
  // 使用 Block-Level paragraph 计数判断是否有变化
  const beforeBlockCount = countBlockLevelParagraphs(before.eventlog);
  const afterBlockCount = countBlockLevelParagraphs(after.eventlog);
  
  // 如果段落数相同，进一步比对内容
  if (beforeBlockCount === afterBlockCount) {
    const beforeContent = JSON.stringify(normalizeEventLog(before.eventlog).slateJson);
    const afterContent = JSON.stringify(normalizeEventLog(after.eventlog).slateJson);
    
    if (beforeContent === afterContent) {
      return null;  // ← 无变化，不记录历史
    }
  }
  
  // 记录历史
  return {
    eventId,
    timestamp: Date.now(),
    source,
    changes: diff(before, after)
  };
}
```

**⚠️ 潜在问题 #4**：
- ✅ **已修复**：使用 Block-Level paragraph 计数 + 内容比对，避免签名变化导致误判
- ✅ **已修复**：`preserveSignature: !eventlogChanged` 避免无意义的签名更新
- ⚠️ **仍有风险**：`normalizeEventLog` 在 `logUpdate` 内部又被调用了一次

---

### Cycle 5: 同步到 Outlook → 回读 → 本地写入

重复 Cycle 2 + Cycle 3 的流程。

---

## 🚨 发现的问题汇总

### 问题 #1：重复调用 normalizeEventLog（性能 + 幂等性风险）

**问题路径**：

```
updateEvent()
  ├─ normalizeEvent()
  │   └─ normalizeEventLog()  ← 第1次
  │
  ├─ EventHistoryService.logUpdate()
  │   ├─ normalizeEventLog(before.eventlog)  ← 第2次
  │   └─ normalizeEventLog(after.eventlog)   ← 第3次
  │
  └─ saveEventLogVersion()
      ├─ normalizeEventLog(originalEvent.eventlog)  ← 第4次
      └─ normalizeEventLog(filteredUpdates.eventlog)  ← 第5次
```

**风险**：
- 每次 `updateEvent` 调用 5 次 `normalizeEventLog`
- 如果 `normalizeEventLog` 不是严格幂等，会逐步产生脏数据

**实际情况**：
- ✅ 有早期退出（line 2840-2850）
- ✅ 使用 `ensureBlockTimestamps()` 只补全缺失字段
- ⚠️ 但仍有优化空间：`ensureBlockTimestamps` 会添加 `updatedAt: Date.now()`，可能导致字段漂移

---

### 问题 #2：签名重复生成（导致 description 变化 → EventHistory 误判）

**问题路径**：

```
normalizeEvent()
  └─ SignatureUtils.buildSignature()  ← 每次都重新生成签名
      └─ 签名包含 updatedAt
          └─ updatedAt 变化 → description 变化
              └─ EventHistory 误判为"有变更"
```

**已修复**：
- ✅ `preserveSignature: !eventlogChanged` 选项（line 1275）
- ✅ 使用 Block-Level paragraph 计数判断是否有内容变化（line 1256-1268）

**残留风险**：
- ⚠️ 如果 `eventlogChanged` 判断不准确，仍会重新生成签名

---

### 问题 #3：ensureBlockTimestamps 可能产生冗余字段

**问题代码**：

```typescript
// src/utils/blockTimestampMigration.ts
function ensureBlockTimestamps(slateNodes) {
  return slateNodes.map(node => {
    if (node.type === 'paragraph' && !node.createdAt) {
      return {
        ...node,
        createdAt: Date.now(),  // ← 添加当前时间
        updatedAt: Date.now()   // ← 添加当前时间
      };
    }
    
    if (node.type === 'paragraph' && !node.updatedAt) {
      return {
        ...node,
        updatedAt: Date.now()  // ← 每次调用都更新
      };
    }
    
    return node;
  });
}
```

**问题**：
- ❌ 每次调用都会更新 `updatedAt: Date.now()`
- ❌ 即使内容没变，`updatedAt` 也会变化
- ❌ 导致 EventHistory 误判为"有变更"

**修复建议**：

```typescript
function ensureBlockTimestamps(slateNodes, eventCreatedAt?) {
  const fallbackTime = eventCreatedAt || Date.now();
  
  return slateNodes.map(node => {
    if (node.type === 'paragraph') {
      return {
        ...node,
        createdAt: node.createdAt || fallbackTime,  // ← 只填充缺失的
        updatedAt: node.updatedAt || fallbackTime   // ← 不覆盖已有的
      };
    }
    return node;
  });
}
```

---

### 问题 #4：deserializeEventDescription + normalizeEvent 双重处理

**问题路径**：

```
Outlook 回读
  ├─ deserializeEventDescription()
  │   └─ threeLayerMatch() + applyMatchResults()
  │       └─ 生成 slateJson
  │
  └─ updateEvent()
      └─ normalizeEvent()
          └─ normalizeEventLog()  ← 又处理一次
```

**风险**：
- ❌ `deserializeEventDescription` 已经生成了完整的 slateJson
- ❌ `normalizeEvent` 又处理一次，可能产生额外字段

**实际情况**：
- ✅ `normalizeEventLog` 有早期退出（line 2767-2776）
- ⚠️ 但仍会检查 `hasParagraphWithoutTimestamp`，可能触发重解析

---

## ✅ 幂等性验证

### 测试 1：连续调用 normalizeEvent

```typescript
const event1 = normalizeEvent(rawEvent);
const event2 = normalizeEvent(event1);
const event3 = normalizeEvent(event2);

// 预期：event1 === event2 === event3（除了 updatedAt）
```

**结果**：
- ✅ `slateJson` 应该完全一致
- ⚠️ `description` 中的签名可能因 `updatedAt` 变化而不同
- ⚠️ 如果 `ensureBlockTimestamps` 每次都更新 `updatedAt`，会导致 slateJson 不一致

---

### 测试 2：同步往返

```typescript
const original = normalizeEvent(rawEvent);
const outlookHtml = serializeEventDescription(original);
const deserialized = deserializeEventDescription(outlookHtml, original.id);
const normalized = normalizeEvent({ ...original, ...deserialized });

// 预期：normalized.eventlog.slateJson === original.eventlog.slateJson
```

**结果**：
- ✅ 三层匹配算法应该能恢复原始数据
- ⚠️ 如果 Outlook 改写了 HTML，可能有差异
- ⚠️ 新增的 `insert` 节点会产生新 ID

---

## 🔧 修复建议优先级

### P0（立即修复）

**1. 修复 `ensureBlockTimestamps` 的 `updatedAt` 覆盖问题**

```typescript
// 当前（有问题）
if (!node.updatedAt) {
  return { ...node, updatedAt: Date.now() };  // ← 每次都生成新时间
}

// 修复后
if (!node.updatedAt) {
  return { ...node, updatedAt: node.createdAt || fallbackTime };  // ← 使用 createdAt 兜底
}
```

**2. 优化 `normalizeEventLog` 的早期退出**

```typescript
// 添加更严格的幂等性检查
if (Array.isArray(slateNodes)) {
  // 检查是否已经完全规范化（有 id + createdAt + updatedAt）
  const isFullyNormalized = slateNodes.every(node =>
    node.type === 'paragraph' && node.id && node.createdAt && node.updatedAt
  );
  
  if (isFullyNormalized && !needsMigration(slateNodes)) {
    return eventLog;  // ← 早期退出，避免重复处理
  }
}
```

---

### P1（短期优化）

**3. 减少 `normalizeEventLog` 调用次数**

```typescript
// 当前
const oldEventLog = this.normalizeEventLog(originalEvent.eventlog);  // ← 第1次
const newEventLog = this.normalizeEventLog(filteredUpdates.eventlog);  // ← 第2次

// 优化后（复用已 normalize 的数据）
const oldEventLog = originalEvent._normalizedEventLog || this.normalizeEventLog(originalEvent.eventlog);
const newEventLog = normalizedEvent._normalizedEventLog;  // ← 复用 normalizeEvent 的结果
```

**4. 优化签名生成策略**

```typescript
// 添加签名缓存
if (options?.preserveSignature && event.description) {
  // 检查签名是否已经包含正确的时间戳
  const existingSignature = SignatureUtils.extractTimestampsFromSignature(event.description);
  if (existingSignature.createdAt === finalCreatedAt && existingSignature.updatedAt === finalUpdatedAt) {
    // 签名已经正确，跳过重新生成
    return event.description;
  }
}
```

---

### P2（长期优化）

**5. 引入脏检查（Dirty Checking）**

```typescript
interface NormalizedEvent extends Event {
  _normalizedAt?: number;        // 规范化时间戳
  _normalizedVersion?: number;   // 规范化版本
  _isDirty?: boolean;            // 是否需要重新规范化
}

// 在 updateEvent 中
if (!event._isDirty && event._normalizedVersion === CURRENT_VERSION) {
  return event;  // ← 跳过 normalize
}
```

**6. 分离 Encode/Decode 与 Normalize**

```typescript
// 当前：三者混在一起
normalizeEvent() {
  // 既做 normalize，又做 signature 生成，又做 eventlog 转换
}

// 建议：分离职责
class EventNormalizer {
  normalize(event): Event;  // 仅规范化字段
}

class EventCodec {
  encode(event): string;    // Slate → HTML (for Outlook)
  decode(html): EventLog;   // HTML → Slate (from Outlook)
}

class SignatureManager {
  generate(event): string;  // 生成签名
  extract(description): Signature;  // 提取签名
}
```

---

## 📋 验收标准

### 幂等性测试

```typescript
describe('normalizeEvent 幂等性', () => {
  it('连续调用应该产生相同结果', () => {
    const event1 = normalizeEvent(rawEvent);
    const event2 = normalizeEvent(event1);
    const event3 = normalizeEvent(event2);
    
    expect(event1.eventlog.slateJson).toBe(event2.eventlog.slateJson);
    expect(event2.eventlog.slateJson).toBe(event3.eventlog.slateJson);
  });
  
  it('同步往返应该保持数据一致', () => {
    const original = normalizeEvent(rawEvent);
    const outlookHtml = serializeEventDescription(original);
    const deserialized = deserializeEventDescription(outlookHtml, original.id);
    const restored = normalizeEvent({ ...original, ...deserialized });
    
    // slateJson 应该一致（除了新增/删除的节点）
    const originalNodes = JSON.parse(original.eventlog.slateJson);
    const restoredNodes = JSON.parse(restored.eventlog.slateJson);
    
    expect(restoredNodes.filter(n => n.id).map(n => n.id))
      .toEqual(originalNodes.map(n => n.id));
  });
});
```

### EventHistory 噪音测试

```typescript
describe('EventHistory 无噪音写入', () => {
  it('仅同步（无编辑）不应产生历史记录', async () => {
    const event = await EventService.createEvent(rawEvent);
    const historyCount1 = await EventHistoryService.getHistoryCount(event.id);
    
    // 同步往返 5 次
    for (let i = 0; i < 5; i++) {
      const outlookHtml = EventService.serializeEventDescription(event);
      const deserialized = EventService.deserializeEventDescription(outlookHtml, event.id);
      await EventService.updateEvent(event.id, deserialized, { source: 'external-sync' });
    }
    
    const historyCount2 = await EventHistoryService.getHistoryCount(event.id);
    
    // 预期：历史记录数量不变（仅同步不产生历史）
    expect(historyCount2).toBe(historyCount1);
  });
});
```

---

## 🎯 结论

### 当前状态评估

| 检查项 | 状态 | 评分 |
|--------|------|------|
| **幂等性** | ⚠️ 部分幂等 | 6/10 |
| **EventHistory 噪音** | ✅ 已缓解 | 8/10 |
| **字段干净** | ⚠️ 有冗余风险 | 7/10 |
| **性能** | ⚠️ 有优化空间 | 6/10 |

### 关键风险

1. ⚠️ **`ensureBlockTimestamps` 的 `updatedAt` 覆盖**：每次调用都更新时间戳
2. ⚠️ **重复调用 `normalizeEventLog`**：每次 `updateEvent` 调用 5 次
3. ✅ **签名重复生成**：已通过 `preserveSignature` 缓解
4. ✅ **EventHistory 误判**：已通过 Block-Level paragraph 计数 + 内容比对缓解

### 建议行动

- **立即执行**（P0）：修复 `ensureBlockTimestamps` + 优化早期退出
- **短期优化**（P1）：减少 `normalizeEventLog` 调用次数 + 签名缓存
- **长期重构**（P2）：分离 Encode/Decode/Normalize 职责

---

## 附录：代码位置索引

```
normalizeEvent:            src/services/EventService.ts:3250-3400
normalizeEventLog:         src/services/EventService.ts:2758-2900
serializeEventDescription: src/services/EventService.ts:6456-6560
deserializeEventDescription: src/services/EventService.ts:6574-6640
updateEvent:               src/services/EventService.ts:1200-1500
EventHistoryService:       src/services/EventHistoryService.ts
ensureBlockTimestamps:     src/utils/blockTimestampMigration.ts
```
