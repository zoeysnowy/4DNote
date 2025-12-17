# Outlook 同步到 EventNodes 完整流程

## 概述

本文档说明从 Outlook 同步事件时，如何正确处理描述（description）并转换为符合 EventNode 要求的数据结构。

**设计目标**：
1. ✅ 清除签名（避免重复签名）
2. ✅ 记录 createdAt、updatedAt、创建者、更新者
3. ✅ 按照 Block-Level Timestamp 要求保存成 Eventlog
4. ✅ 自动生成 EventNodes 用于 AI 检索

---

## 数据流完整链路

### 1. Outlook → 4DNote 同步（ActionBasedSyncManager）

**入口**：`ActionBasedSyncManager.convertRemoteEventToLocal(remoteEvent)`

**输入**：
```typescript
remoteEvent = {
  id: 'outlook-AAMkAD...',
  subject: '产品周会纪要',
  body: {
    content: `
      <html>
        <body>
          <p>讨论了下个季度的服务器预算问题</p>
          <p>---</p>
          <p>由 📧 Outlook 创建于 2025-12-15 10:00:00</p>
        </body>
      </html>
    `
  },
  createdDateTime: '2025-12-15T10:00:00Z',
  lastModifiedDateTime: '2025-12-15T14:30:00Z'
}
```

**处理流程**：
```typescript
// L4760-4816: convertRemoteEventToLocal
const htmlContent = remoteEvent.body?.content || '';

const partialEvent = {
  id: remoteEvent.id,  // 'outlook-AAMkAD...'
  title: cleanTitle,
  description: htmlContent,  // ✅ 传递原始 HTML（包含签名）
  startTime: '2025-12-15 10:00:00',
  endTime: '2025-12-15 11:00:00',
  createdAt: '2025-12-15 10:00:00',  // Outlook 的 createdDateTime
  updatedAt: '2025-12-15 14:30:00',  // Outlook 的 lastModifiedDateTime
  source: 'outlook',  // ✅ 设置来源
  syncMode: 'bidirectional-private'
};

// ✅ 通过 EventService.normalizeEvent 统一处理
const normalizedEvent = EventService.normalizeEvent(partialEvent);
```

---

### 2. EventService.normalizeEvent 处理（核心中枢）

**文件**：`src/services/EventService.ts`

**L2796-3072**：`normalizeEvent(event, options?)`

#### 阶段 1: 提取签名中的时间戳和创建者

```typescript
// L2806-2817: 从 description 中提取签名信息
const extractedTimestamps = this.extractTimestampsFromSignature(event.description);
// 返回：{ createdAt: '2025-12-15 10:00:00', updatedAt: '2025-12-15 14:30:00' }

const extractedCreator = this.extractCreatorFromSignature(event.description);
// 返回：{ source: 'outlook', fourDNoteSource: false, lastModifiedSource: 'outlook' }
```

#### 阶段 2: 处理 eventlog（清除签名 + 生成 Block-Level Timestamp）

```typescript
// L2819-2863: normalizeEventLog 处理
const normalizedEventLog = this.normalizeEventLog(event.eventlog, event.description);

// normalizeEventLog 内部流程（L2442-2720）：
// 1. 检测到 HTML 格式
if (trimmed.startsWith('<') || trimmed.includes('<p>')) {
  // 2. 移除签名元素（L2623-2630）
  cleanedHtml = cleanedHtml.replace(
    /<(p|div)[^>]*>\s*---\s*<br\s*\/?>\s*由\s+(?:🔮|📧)?\s*(?:4DNote|Outlook)\s*创建于\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?<\/(p|div)>/gi,
    ''
  );
  
  // 3. 提取纯文本（保留换行）
  textContent = extractTextFromHtml(cleanedHtml);
  
  // 4. 检查是否包含时间戳分隔符
  const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})$/gm;
  const matches = [...textContent.matchAll(timestampPattern)];
  
  if (matches.length > 0) {
    // 5. 使用 Block-Level 解析器
    const slateNodes = this.parseTextWithBlockTimestamps(textContent);
    return this.convertSlateJsonToEventLog(JSON.stringify(slateNodes));
  }
}
```

#### 阶段 3: parseTextWithBlockTimestamps（关键方法）

**文件**：`src/services/EventService.ts` L3283-3390

**输入**：
```text
讨论了下个季度的服务器预算问题
```

**输出**：
```json
[
  {
    "type": "paragraph",
    "id": "block-1734249600000-abc123",
    "createdAt": 1734249600000,
    "updatedAt": 1734249600000,
    "children": [{ "text": "讨论了下个季度的服务器预算问题" }]
  }
]
```

**核心逻辑**：
```typescript
// L3283-3390
private static parseTextWithBlockTimestamps(text: string): any[] {
  const slateNodes: any[] = [];
  const lines = text.split('\n');
  const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/;
  
  let currentTimestamp: number | null = null;
  
  for (const line of lines) {
    const match = line.match(timestampPattern);
    
    if (match) {
      // 遇到时间戳行
      const timeStr = match[1].replace(/\//g, '-');
      currentTimestamp = new Date(timeStr).getTime();
    } else {
      // 普通文本行
      paragraphLines.push(line);
    }
  }
  
  // 生成 paragraph 节点
  slateNodes.push({
    type: 'paragraph',
    id: generateBlockId(currentTimestamp),
    createdAt: currentTimestamp || Date.now(),
    updatedAt: currentTimestamp || Date.now(),  // ✅ 同时设置 updatedAt
    children: [{ text: paragraphText }]
  });
  
  return slateNodes;
}
```

**支持格式**：
- ✅ 独立成行：`2025-12-15 21:24:26`
- ✅ 行首时间戳：`2025-12-15 21:24:26 内容...`
- ✅ 斜杠分隔：`2025/12/15 21:24:26`（自动转换为连字符）
- ✅ 单位数月/日：`2025-12-7 10:00:00`（自动补零）

#### 阶段 4: 提取 Block-Level Timestamp

```typescript
// L2833-2892: 从 eventlog 中提取 Block-Level Timestamp
const slateNodes = JSON.parse(normalizedEventLog.slateJson);
const blockLevelParagraphs = slateNodes.filter(node => 
  node.type === 'paragraph' && node.createdAt !== undefined
);

if (blockLevelParagraphs.length > 0) {
  // 第一个 paragraph 的 createdAt 作为事件创建时间
  blockLevelTimestamps.createdAt = this.convertTimestampToTimeSpec(
    blockLevelParagraphs[0].createdAt
  );
  
  // 最后一个 paragraph 的 updatedAt 作为最后修改时间
  const lastPara = blockLevelParagraphs[blockLevelParagraphs.length - 1];
  blockLevelTimestamps.updatedAt = this.convertTimestampToTimeSpec(
    lastPara.updatedAt || lastPara.createdAt
  );
}
```

#### 阶段 5: 时间戳选择策略（多来源优先级）

```typescript
// L2898-2925: 时间戳候选值合并
const createdAtCandidates = [
  blockLevelTimestamps.createdAt,      // 1️⃣ 最高优先级
  extractedTimestamps.createdAt,       // 2️⃣ 签名中的时间
  event.createdAt                      // 3️⃣ Outlook 的时间
].filter(Boolean);

const finalCreatedAt = createdAtCandidates.reduce((earliest, current) => 
  current < earliest ? current : earliest  // 选择最早的时间
);

const updatedAtCandidates = [
  blockLevelTimestamps.updatedAt,      // 1️⃣ 最高优先级
  extractedTimestamps.updatedAt,       // 2️⃣ 签名中的时间
  event.updatedAt                      // 3️⃣ Outlook 的时间
].filter(Boolean);

const finalUpdatedAt = updatedAtCandidates.reduce((latest, current) =>
  current > latest ? current : latest  // 选择最晚的时间
);
```

#### 阶段 6: 重新生成带签名的 description

```typescript
// L2927-2976: 重新添加签名
const coreContent = normalizedEventLog.plainText || '';
const lastModifiedSource = extractedCreator.lastModifiedSource || 
  (event.fourDNoteSource ? '4dnote' : 'outlook');

normalizedDescription = SignatureUtils.addSignature(coreContent, {
  ...event,
  createdAt: finalCreatedAt,
  updatedAt: finalUpdatedAt,
  source: lastModifiedSource
});

// 生成的签名格式：
// ---
// 由 📧 Outlook 创建于 2025-12-15 10:00:00，最后修改于 2025-12-15 14:30:00
```

---

### 3. EventService.createEvent/updateEvent 同步到 EventNodes

**文件**：`src/services/EventService.ts`

**createEvent**（L780-791）：
```typescript
// 创建事件后，自动同步 Nodes
try {
  const { EventNodeService } = await import('./EventNodeService');
  await EventNodeService.syncNodesFromEvent(finalEvent);
  eventLogger.log('✅ [EventService] EventNodes synced successfully');
} catch (nodesSyncError) {
  eventLogger.error('⚠️ [EventService] EventNodes sync failed (non-blocking):', nodesSyncError);
}
```

**updateEvent**（L1391-1403）：
```typescript
// 更新事件后，自动同步 Nodes
try {
  const { EventNodeService } = await import('./EventNodeService');
  await EventNodeService.syncNodesFromEvent(updatedEvent);
  eventLogger.log('✅ [EventService] EventNodes synced successfully on update');
} catch (nodesSyncError) {
  eventLogger.error('⚠️ [EventService] EventNodes sync failed (non-blocking):', nodesSyncError);
}
```

---

### 4. EventNodeService.syncNodesFromEvent（生成 Nodes）

**文件**：`src/services/EventNodeService.ts`

**L23-78**：`syncNodesFromEvent(event)`

```typescript
static async syncNodesFromEvent(event: Event): Promise<number> {
  try {
    // 1. 删除旧 Nodes
    await this.deleteNodesByEventId(event.id);
    
    // 2. 从 eventlog 中提取 Block-Level paragraphs
    const paragraphs = this.extractParagraphsFromEventLog(event.eventlog);
    
    // 3. 为每个 paragraph 创建 Node
    const nodes: EventNode[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const node = await this.createNode({
        eventId: event.id,
        eventTitle: event.title?.plainText || '无标题',
        content: para.content,
        timestamp: para.timestamp,
        position: i,
        slateNode: para.slateNode,
        tags: event.tags,
        type: 'paragraph',
        blockId: para.blockId,
        source: event.source  // ✅ 从 Event 继承来源（'outlook' | '4dnote'）
      });
      nodes.push(node);
    }
    
    return nodes.length;
  } catch (error) {
    console.error('[EventNodeService] ❌ 同步失败:', error);
    throw error;
  }
}
```

**L80-133**：`extractParagraphsFromEventLog(eventlog)`

```typescript
private static extractParagraphsFromEventLog(eventlog: EventLog): Array<{
  content: string;
  timestamp: string;
  slateNode: any;
  blockId?: string;
}> {
  const slateJson = JSON.parse(eventlog.slateJson);
  const paragraphs = [];
  
  for (const node of slateJson) {
    // 只处理 paragraph 节点，且必须有 createdAt（Block-Level Timestamp）
    if (node.type === 'paragraph' && node.createdAt) {
      // 提取纯文本内容
      const content = node.children
        ?.map(child => child.text || '')
        .join('')
        .trim();
      
      if (!content) continue;  // 跳过空段落
      
      // 转换时间戳为 TimeSpec 格式
      const timestamp = this.convertTimestampToTimeSpec(node.createdAt);
      
      paragraphs.push({
        content,
        timestamp,
        slateNode: node,
        blockId: node.id
      });
    }
  }
  
  return paragraphs;
}
```

**L135-187**：`createNode(input)`

```typescript
static async createNode(input: CreateEventNodeInput): Promise<EventNode> {
  const now = new Date().toISOString();
  
  // 生成 embeddingText（AI 检索核心）
  const timeStr = input.timestamp.substring(11, 16);  // HH:mm
  const embeddingText = `${input.eventTitle} - ${timeStr} - ${input.content}`;
  // 例如：产品周会纪要 - 10:15 - 讨论了下个季度的服务器预算问题
  
  // 计算 day
  const day = input.timestamp.substring(0, 10);  // YYYY-MM-DD
  
  const node: EventNode = {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    embeddingText,
    content: input.content,
    slateNode: input.slateNode,
    timestamp: input.timestamp,
    day,
    updatedAt: now,
    tags: input.tags || [],
    type: input.type || 'paragraph',
    position: input.position,
    blockId: input.blockId,
    source: input.source  // ✅ 记录来源（'outlook' | '4dnote'）
  };
  
  // 保存到 IndexedDB
  await db.put('event_nodes', node.id, node);
  
  return node;
}
```

---

## 最终数据结构

### Event（IndexedDB/SQLite）

```typescript
{
  id: 'outlook-AAMkAD...',
  title: {
    simpleTitle: '产品周会纪要',
    plainText: '产品周会纪要'
  },
  eventlog: {
    slateJson: '[{"type":"paragraph","id":"block-1734249600000-abc123","createdAt":1734249600000,"updatedAt":1734249600000,"children":[{"text":"讨论了下个季度的服务器预算问题"}]}]',
    html: '<p>讨论了下个季度的服务器预算问题</p>',
    plainText: '讨论了下个季度的服务器预算问题'
  },
  description: '讨论了下个季度的服务器预算问题\n---\n由 📧 Outlook 创建于 2025-12-15 10:00:00，最后修改于 2025-12-15 14:30:00',
  source: 'outlook',
  fourDNoteSource: false,
  createdAt: '2025-12-15 10:00:00',
  updatedAt: '2025-12-15 14:30:00',
  startTime: '2025-12-15 10:00:00',
  endTime: '2025-12-15 11:00:00',
  tags: ['work', 'meeting']
}
```

### EventNode（IndexedDB）

```typescript
{
  id: 'node-1734249600000-xyz789',
  eventId: 'outlook-AAMkAD...',
  eventTitle: '产品周会纪要',
  embeddingText: '产品周会纪要 - 10:00 - 讨论了下个季度的服务器预算问题',
  content: '讨论了下个季度的服务器预算问题',
  slateNode: {
    type: 'paragraph',
    id: 'block-1734249600000-abc123',
    createdAt: 1734249600000,
    updatedAt: 1734249600000,
    children: [{ text: '讨论了下个季度的服务器预算问题' }]
  },
  timestamp: '2025-12-15 10:00:00',
  day: '2025-12-15',
  updatedAt: '2025-12-17T03:30:00.000Z',
  tags: ['work', 'meeting'],
  type: 'paragraph',
  position: 0,
  blockId: 'block-1734249600000-abc123',
  source: 'outlook'  // ✅ 创建来源
}
```

---

## 关键点总结

### ✅ 已确保的功能

1. **清除签名**：
   - `normalizeEventLog` 中使用正则移除签名段落
   - 支持 `---\n由...创建于...` 和单行签名格式

2. **记录时间戳**：
   - `createdAt`：选择最早的时间（Block-Level > 签名 > Outlook）
   - `updatedAt`：选择最晚的时间（Block-Level > 签名 > Outlook）
   - paragraph 节点同时设置 `createdAt` 和 `updatedAt`

3. **记录创建者和更新者**：
   - Event 层面：`source` 字段（'outlook' | '4dnote'）
   - EventNode 层面：继承 Event 的 `source` 字段

4. **Block-Level Timestamp**：
   - 所有 paragraph 节点都包含 `createdAt` 和 `updatedAt` 元数据
   - 使用 `parseTextWithBlockTimestamps` 自动生成

5. **自动同步 EventNodes**：
   - `createEvent`、`updateEvent` 完成后自动调用 `EventNodeService.syncNodesFromEvent`
   - 失败不阻塞主流程（非阻塞错误处理）

### 🔍 测试建议

1. **有签名的 Outlook 事件**：
   ```html
   <p>讨论了预算</p>
   <p>---</p>
   <p>由 📧 Outlook 创建于 2025-12-15 10:00:00</p>
   ```
   - 验证签名被正确移除
   - 验证时间戳正确提取（优先使用签名中的时间）

2. **无签名的 Outlook 事件**：
   ```html
   <p>讨论了预算</p>
   ```
   - 验证使用 Outlook 的 `createdDateTime` 和 `lastModifiedDateTime`

3. **包含时间戳的描述**：
   ```text
   2025-12-15 10:00:00
   讨论了预算
   2025-12-15 14:30:00
   确定了方案
   ```
   - 验证自动拆分为 Block-Level paragraphs
   - 验证每个段落的时间戳正确

---

## 未来优化方向

### 1. Embedding 生成（AI 检索）

```typescript
// 在 EventNodeService.createNode 中添加
const { getEmbedding } = await import('./AIService');
const embedding = await getEmbedding(embeddingText);
node.embedding = embedding;
```

### 2. 向量检索（Supabase pgvector）

```typescript
// 创建 Supabase 表
CREATE TABLE event_nodes (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  embedding_text TEXT,
  embedding VECTOR(1536),  -- OpenAI text-embedding-3-small
  timestamp TIMESTAMP,
  source TEXT
);

CREATE INDEX ON event_nodes USING ivfflat (embedding vector_cosine_ops);
```

### 3. UI 支持精确跳转

```typescript
// 搜索结果点击后跳转
const handleNodeClick = (node: EventNode) => {
  // 1. 定位到 Event
  const event = await EventService.getEventById(node.eventId);
  
  // 2. 滚动到对应的 Block（使用 blockId）
  const blockElement = document.querySelector(`[data-block-id="${node.blockId}"]`);
  blockElement?.scrollIntoView();
  
  // 3. 高亮该段落
  blockElement?.classList.add('highlight');
};
```

---

## 相关文件

- **类型定义**：`src/types/EventNode.ts`
- **Node 服务**：`src/services/EventNodeService.ts`
- **Event 服务**：`src/services/EventService.ts`
- **同步管理**：`src/services/ActionBasedSyncManager.ts`
- **签名工具**：`src/utils/SignatureUtils.ts`
