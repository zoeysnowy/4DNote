# 时间戳全链路审计报告

**生成时间**: 2025-12-17  
**审计范围**: Outlook 同步 → Event → EventNode 时间戳传递链路

---

## 🎯 审计目标

检查以下两个核心时间戳是否正确传递到 EventNode：
1. **签名提取的 createdAt/updatedAt**（从 description 签名中解析）
2. **Block-Level Timestamp**（从 slateJson paragraph.createdAt 提取）
3. **文本时间戳**（从纯文本中解析，如 `2025-10-22 18:26:29`）

---

## ✅ 全链路检查结果

### 1️⃣ Outlook → Event（签名提取）

**文件**: [src/services/EventService.ts](src/services/EventService.ts)

#### 签名提取逻辑（normalizeEvent L2807）
```typescript
// ✅ 从 description 签名中提取时间戳
const extractedTimestamps = this.extractTimestampsFromSignature(event.description || '');

// extractTimestampsFromSignature (L3631-3690)
// 提取格式：
// - "由 🔮 4DNote 创建于 2025-12-15 10:00:00"
// - "最后修改于 2025-12-15 11:30:00"
```

**提取结果**:
- ✅ `extractedTimestamps.createdAt`: `"2025-12-15 10:00:00"` (TimeSpec 格式)
- ✅ `extractedTimestamps.updatedAt`: `"2025-12-15 11:30:00"` (TimeSpec 格式)

#### 时间戳优先级策略（normalizeEvent L2900-2930）
```typescript
// createdAt 优先级（选择最早时间）
const createdAtCandidates = [
  blockLevelTimestamps.createdAt,    // 1️⃣ Block-Level（最高优先级）
  extractedTimestamps.createdAt,      // 2️⃣ 签名提取
  event.createdAt                     // 3️⃣ 传入值
].filter(Boolean);

const finalCreatedAt = createdAtCandidates.length > 0
  ? createdAtCandidates.reduce((earliest, current) => 
      current < earliest ? current : earliest  // 取最早
    )
  : now;

// updatedAt 优先级（选择最新时间）
const updatedAtCandidates = [
  blockLevelTimestamps.updatedAt,     // 1️⃣ Block-Level（最高优先级）
  extractedTimestamps.updatedAt,      // 2️⃣ 签名提取
  event.updatedAt                     // 3️⃣ 传入值
].filter(Boolean);

const finalUpdatedAt = updatedAtCandidates.length > 0
  ? updatedAtCandidates.reduce((latest, current) => 
      current > latest ? current : latest  // 取最新
    )
  : now;
```

**结论**: ✅ **签名时间戳正确传递到 Event.createdAt / Event.updatedAt**

---

### 2️⃣ Outlook → Event（Block-Level Timestamp）

**文件**: [src/services/EventService.ts](src/services/EventService.ts)

#### Block-Level 提取逻辑（normalizeEvent L2860-2900）
```typescript
// ✅ 从 slateJson 中提取 Block-Level Timestamp
const slateNodes = typeof normalizedEventLog.slateJson === 'string' 
  ? JSON.parse(normalizedEventLog.slateJson) 
  : normalizedEventLog.slateJson;

if (Array.isArray(slateNodes) && slateNodes.length > 0) {
  // 提取所有带 createdAt 的 paragraph 节点
  const blockLevelParagraphs = slateNodes.filter((node: any) => 
    node.type === 'paragraph' && node.createdAt !== undefined
  );
  
  if (blockLevelParagraphs.length > 0) {
    // 第一个 Block-Level paragraph 的 createdAt 作为事件创建时间
    const firstTimestamp = blockLevelParagraphs[0].createdAt;
    if (firstTimestamp) {
      blockLevelTimestamps.createdAt = this.convertTimestampToTimeSpec(firstTimestamp);
    }
    
    // 最后一个 Block-Level paragraph 的 updatedAt/createdAt 作为最后修改时间
    const lastParagraph = blockLevelParagraphs[blockLevelParagraphs.length - 1];
    const lastTimestamp = lastParagraph.updatedAt || lastParagraph.createdAt;
    if (lastTimestamp) {
      blockLevelTimestamps.updatedAt = this.convertTimestampToTimeSpec(lastTimestamp);
    }
  }
}
```

**convertTimestampToTimeSpec 逻辑**（L3280-3290）:
```typescript
private static convertTimestampToTimeSpec(timestamp: number | string): string {
  if (typeof timestamp === 'number') {
    // Unix 毫秒时间戳 → TimeSpec
    return formatTimeForStorage(new Date(timestamp));
  } else if (typeof timestamp === 'string') {
    // 已经是 TimeSpec 格式，直接返回
    return timestamp;
  }
  return formatTimeForStorage(new Date());
}
```

**结论**: ✅ **Block-Level Timestamp 正确传递到 Event.createdAt / Event.updatedAt**（优先级最高）

---

### 3️⃣ 文本时间戳解析（parseTextWithBlockTimestamps）

**文件**: [src/services/EventService.ts](src/services/EventService.ts)

#### 解析逻辑（L3295-3410）
```typescript
// 时间戳正则（两种模式）
const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/;
// 1. 独立成行：2025-12-15 21:24:26
// 2. 行首时间戳：2025-12-15 21:24:26 内容...

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const match = line.match(timestampPattern);
  
  if (match) {
    // 解析新时间戳
    const timeStr = match[1].replace(/\//g, '-'); // 斜杠转连字符
    
    // 🔧 规范化日期格式：补零（2025-12-7 → 2025-12-07）
    const parts = timeStr.split(' ');
    const datePart = parts[0];
    const timePart = parts[1];
    
    const [year, month, day] = datePart.split('-');
    const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const normalizedTimeStr = `${normalizedDate} ${timePart}`;
    
    // ✅ 直接使用 YYYY-MM-DD HH:mm:ss 格式（空格分隔符）
    currentTimestamp = new Date(normalizedTimeStr).getTime();
    
    // 保存到 paragraph 节点
    slateNodes.push({
      type: 'paragraph',
      id: generateBlockId(timestamp),
      createdAt: timestamp,     // ✅ Unix 毫秒时间戳
      updatedAt: timestamp,     // ✅ 同时设置 updatedAt
      children: [{ text: paragraphText }]
    });
  }
}
```

**示例输入**:
```
2025-10-22 18:26:29
这是第一段内容

2025-10-22 18:30:15
这是第二段内容
```

**输出**:
```json
[
  {
    "type": "paragraph",
    "id": "block-xxx",
    "createdAt": 1729590389000,  // 2025-10-22 18:26:29
    "updatedAt": 1729590389000,
    "children": [{ "text": "这是第一段内容" }]
  },
  {
    "type": "paragraph",
    "id": "block-yyy",
    "createdAt": 1729590615000,  // 2025-10-22 18:30:15
    "updatedAt": 1729590615000,
    "children": [{ "text": "这是第二段内容" }]
  }
]
```

**结论**: ✅ **文本时间戳正确解析为 Block-Level Timestamp**

---

### 4️⃣ Event → EventNode（时间戳传递）

**文件**: [src/services/EventNodeService.ts](src/services/EventNodeService.ts)

#### syncNodesFromEvent 逻辑（L56-95）
```typescript
static async syncNodesFromEvent(event: Event): Promise<EventNode[]> {
  // 1. 解析 eventlog
  const eventlog = typeof event.eventlog === 'string' 
    ? JSON.parse(event.eventlog) 
    : event.eventlog;
  
  // 2. 提取所有 Block-Level paragraph 节点
  const paragraphs = this.extractParagraphsFromEventLog(eventlog as EventLog);
  
  // 3. 创建 EventNode
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const node = await this.createNode({
      eventId: event.id,
      eventTitle: (event.title as any)?.simpleTitle || '无标题',
      content: para.content,
      timestamp: para.timestamp,  // ✅ 使用 Block-Level Timestamp
      position: i,
      slateNode: para.slateNode,
      tags: event.tags,
      type: 'paragraph',
      blockId: para.blockId,
      source: event.source
    });
    nodes.push(node);
  }
  
  return nodes;
}
```

#### extractParagraphsFromEventLog 逻辑（L111-160）
```typescript
private static extractParagraphsFromEventLog(eventlog: EventLog): Array<{
  content: string;
  timestamp: string;
  slateNode: any;
  blockId?: string;
}> {
  const slateJson = typeof eventlog.slateJson === 'string' 
    ? JSON.parse(eventlog.slateJson)
    : eventlog.slateJson;

  for (const node of slateJson) {
    // 只处理 paragraph 节点，且必须有 createdAt（Block-Level Timestamp）
    if (node.type === 'paragraph' && node.createdAt) {
      const content = node.children
        ?.map((child: any) => child.text || '')
        .join('')
        .trim();

      if (!content) continue;  // 跳过空段落

      // ✅ 转换时间戳为 TimeSpec 格式
      const timestamp = this.convertTimestampToTimeSpec(node.createdAt);

      paragraphs.push({
        content,
        timestamp,      // ✅ TimeSpec 格式: "2025-10-22 18:26:29"
        slateNode: node,
        blockId: node.id
      });
    }
  }

  return paragraphs;
}
```

#### convertTimestampToTimeSpec 逻辑（L165-180）
```typescript
private static convertTimestampToTimeSpec(timestamp: number | string): string {
  if (typeof timestamp === 'number') {
    // Unix 毫秒时间戳 → TimeSpec
    const converted = formatTimeForStorage(new Date(timestamp));
    console.log('[EventNodeService] 转换时间戳:', {
      原始值: timestamp,
      类型: 'number',
      Date对象: new Date(timestamp).toISOString(),
      转换后: converted
    });
    return converted;
  }
  console.log('[EventNodeService] 时间戳已是字符串:', timestamp);
  return timestamp;
}
```

**示例日志**:
```
[EventNodeService] 转换时间戳: {
  原始值: 1729590389000,
  类型: 'number',
  Date对象: '2025-10-22T10:26:29.000Z',
  转换后: '2025-10-22 18:26:29'  // ✅ 本地时间（UTC+8）
}
```

#### createNode 逻辑（L190-220）
```typescript
static async createNode(input: CreateEventNodeInput): Promise<EventNode> {
  const now = formatTimeForStorage(new Date());
  
  // 构造 embedding_text（格式：[事件标题] - [时间] - [内容]）
  const timeStr = input.timestamp.substring(11, 16);  // HH:mm
  const embeddingText = `${input.eventTitle} - ${timeStr} - ${input.content}`;

  // 提取日期（YYYY-MM-DD）
  const day = input.timestamp.substring(0, 10);

  const node: EventNode = {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    embeddingText,
    content: input.content,
    slateNode: input.slateNode,
    timestamp: input.timestamp,  // ✅ "2025-10-22 18:26:29"（TimeSpec 格式）
    day,                         // ✅ "2025-10-22"
    updatedAt: now,
    tags: input.tags || [],
    type: input.type || 'paragraph',
    position: input.position,
    blockId: input.blockId,
    source: input.source
  };

  await memoryStore.put(this.TABLE_NAME, node.id, node);
  
  return node;
}
```

**最终 EventNode 数据**:
```json
{
  "id": "node-1734442467000-abc123",
  "eventId": "evt-xxx",
  "eventTitle": "产品周会纪要",
  "embeddingText": "产品周会纪要 - 18:26 - 这是第一段内容",
  "content": "这是第一段内容",
  "timestamp": "2025-10-22 18:26:29",  // ✅ 正确传递
  "day": "2025-10-22",
  "tags": ["work"],
  "source": "outlook",
  "position": 0
}
```

**结论**: ✅ **Block-Level Timestamp 正确传递到 EventNode.timestamp**

---

## 🔍 潜在问题检查

### ⚠️ 问题 1: Event.createdAt / Event.updatedAt 未传递到 EventNode

**问题描述**:
- EventNode 只使用 **Block-Level Timestamp**（paragraph.createdAt）
- **不使用** Event.createdAt / Event.updatedAt

**影响范围**:
- 如果事件只有签名时间戳（无 Block-Level Timestamp），EventNode 将没有时间戳
- 例如：从 Outlook 同步的旧事件，description 中有签名但 slateJson 无 Block-Level

**示例**:
```json
// Event（有签名时间戳）
{
  "id": "evt-123",
  "createdAt": "2025-10-22 18:26:29",  // ✅ 从签名提取
  "eventlog": {
    "slateJson": "[{\"type\":\"paragraph\",\"children\":[{\"text\":\"内容\"}]}]"
    // ❌ 无 createdAt（无 Block-Level Timestamp）
  }
}

// extractParagraphsFromEventLog 结果
[]  // ❌ 空数组（因为 paragraph 没有 createdAt）

// EventNode
// ❌ 不会创建（因为 paragraphs 为空）
```

**修复建议**:
```typescript
// EventNodeService.extractParagraphsFromEventLog
if (node.type === 'paragraph' && node.createdAt) {
  // 现有逻辑...
} else if (node.type === 'paragraph' && !node.createdAt) {
  // 🆕 回退到 Event.createdAt
  const timestamp = eventCreatedAt || formatTimeForStorage(new Date());
  paragraphs.push({
    content,
    timestamp,
    slateNode: node,
    blockId: node.id
  });
}
```

---

### ⚠️ 问题 2: 时区转换可能导致日期错误

**问题描述**:
- `formatTimeForStorage(new Date(timestamp))` 使用本地时区
- 如果时间戳接近 00:00:00，可能跨越日期边界

**示例**:
```typescript
// Unix 时间戳: 1729590389000
// UTC 时间: 2025-10-22 10:26:29
// 本地时间(UTC+8): 2025-10-22 18:26:29  ✅ 正确

// Unix 时间戳: 1729526400000（00:00:00 UTC）
// UTC 时间: 2025-10-22 00:00:00
// 本地时间(UTC+8): 2025-10-22 08:00:00  ✅ 正确

// Unix 时间戳: 1729497600000（16:00:00 UTC-8）
// UTC 时间: 2025-10-21 16:00:00
// 本地时间(UTC+8): 2025-10-22 00:00:00  ⚠️ 可能跨天
```

**当前实现**:
```typescript
// EventService.parseTextWithBlockTimestamps
const normalizedTimeStr = `${normalizedDate} ${timePart}`;
currentTimestamp = new Date(normalizedTimeStr).getTime();
// ⚠️ 假设输入已是本地时间，但 new Date() 可能按 UTC 解析
```

**修复建议**:
使用 `parseLocalTimeString` 工具函数确保时区一致性

---

### ⚠️ 问题 3: EventNode 缺少 createdAt / updatedAt

**问题描述**:
- EventNode 只有 `timestamp`（单个时间点）
- 缺少 `createdAt`（创建时间）和 `updatedAt`（修改时间）

**当前实现**:
```typescript
const node: EventNode = {
  timestamp: input.timestamp,  // ✅ 段落时间戳
  updatedAt: now,              // ⚠️ 当前时间（非段落修改时间）
  // ❌ 缺少 createdAt
};
```

**问题分析**:
- `updatedAt: now` 是 EventNode 的修改时间（数据库记录更新时间）
- 但缺少 **段落的原始创建时间** 和 **段落的最后修改时间**

**修复建议**:
```typescript
const node: EventNode = {
  timestamp: input.timestamp,      // 段落时间戳（兼容字段）
  paragraphCreatedAt: input.timestamp,  // 🆕 段落创建时间
  paragraphUpdatedAt: input.slateNode.updatedAt || input.timestamp,  // 🆕 段落修改时间
  nodeCreatedAt: now,              // 🆕 Node 记录创建时间
  nodeUpdatedAt: now,              // 现有字段（Node 记录修改时间）
};
```

---

## 📊 完整数据流图

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. Outlook 同步                                                     │
└────────────────────────────────────────────────────────────────────┘
                              ↓
    MicrosoftCalendarService.getEvents()
    - remoteEvent.createdDateTime → undefined
    - remoteEvent.start.dateTime → "2025-10-22T18:26:29"
                              ↓
    ActionBasedSyncManager.convertRemoteEventToLocal()
    - createdAt: start.dateTime → "2025-10-22 18:26:29"  ✅
    - description: HTML 内容（含签名或时间戳文本）
                              ↓

┌────────────────────────────────────────────────────────────────────┐
│ 2. EventService.normalizeEvent()                                   │
└────────────────────────────────────────────────────────────────────┘
                              ↓
    extractTimestampsFromSignature(description)
    - extractedTimestamps.createdAt: "2025-10-22 18:26:29"  ✅
    - extractedTimestamps.updatedAt: "2025-10-22 18:30:15"  ✅
                              ↓
    parseTextWithBlockTimestamps(plainText)
    - slateNodes[0].createdAt: 1729590389000  ✅
    - slateNodes[1].createdAt: 1729590615000  ✅
                              ↓
    Block-Level Timestamp 提取
    - blockLevelTimestamps.createdAt: "2025-10-22 18:26:29"  ✅
    - blockLevelTimestamps.updatedAt: "2025-10-22 18:30:15"  ✅
                              ↓
    时间戳优先级策略（取最早/最新）
    - finalCreatedAt: min(blockLevel, signature, event)  ✅
    - finalUpdatedAt: max(blockLevel, signature, event)  ✅
                              ↓
    返回 Event
    - createdAt: "2025-10-22 18:26:29"  ✅
    - updatedAt: "2025-10-22 18:30:15"  ✅
    - eventlog.slateJson: [paragraph with createdAt]  ✅
                              ↓

┌────────────────────────────────────────────────────────────────────┐
│ 3. EventNodeService.syncNodesFromEvent()                           │
└────────────────────────────────────────────────────────────────────┘
                              ↓
    extractParagraphsFromEventLog(eventlog)
    - paragraph[0].timestamp: "2025-10-22 18:26:29"  ✅
    - paragraph[1].timestamp: "2025-10-22 18:30:15"  ✅
                              ↓
    createNode(input)
    - node.timestamp: "2025-10-22 18:26:29"  ✅
    - node.day: "2025-10-22"  ✅
    - node.embeddingText: "标题 - 18:26 - 内容"  ✅
                              ↓

┌────────────────────────────────────────────────────────────────────┐
│ 4. EventNode 最终数据                                               │
└────────────────────────────────────────────────────────────────────┘
    {
      "id": "node-xxx",
      "eventId": "evt-xxx",
      "eventTitle": "产品周会纪要",
      "timestamp": "2025-10-22 18:26:29",  ✅
      "day": "2025-10-22",                 ✅
      "embeddingText": "产品周会纪要 - 18:26 - 内容",
      "content": "内容",
      "source": "outlook"
    }
```

---

## 🎯 总结

### ✅ 正确传递的时间戳

| 来源 | 提取位置 | 传递路径 | 最终字段 | 状态 |
|------|---------|---------|---------|------|
| 签名 | EventService.extractTimestampsFromSignature | description → Event.createdAt | Event.createdAt | ✅ |
| 签名 | EventService.extractTimestampsFromSignature | description → Event.updatedAt | Event.updatedAt | ✅ |
| Block-Level | EventService.normalizeEvent | slateJson[].createdAt → Event.createdAt | Event.createdAt | ✅ |
| Block-Level | EventService.normalizeEvent | slateJson[].updatedAt → Event.updatedAt | Event.updatedAt | ✅ |
| 文本解析 | EventService.parseTextWithBlockTimestamps | "2025-10-22 18:26:29" → slateJson[].createdAt | slateJson[].createdAt | ✅ |
| Block-Level | EventNodeService.extractParagraphsFromEventLog | slateJson[].createdAt → EventNode.timestamp | EventNode.timestamp | ✅ |

### ⚠️ 需要修复的问题

| 问题 | 优先级 | 影响 | 建议修复 |
|------|-------|------|---------|
| EventNode 不使用 Event.createdAt 回退 | P1 | 旧事件无 Block-Level 时不创建 Node | 添加回退逻辑 |
| EventNode 缺少 paragraphCreatedAt / paragraphUpdatedAt | P2 | 无法区分段落时间和 Node 更新时间 | 添加字段 |
| 时区转换可能跨天 | P3 | 边界情况可能日期错误 | 使用 parseLocalTimeString |

### 🚀 下一步行动

1. **立即修复**: EventNodeService 添加 Event.createdAt 回退逻辑
2. **短期优化**: 添加 paragraphCreatedAt / paragraphUpdatedAt 字段
3. **长期规划**: 统一时区处理逻辑

---

**审计完成** ✅
