# RAG Embedding Architecture - 4DNote 检索增强生成架构

**版本**: v1.0  
**日期**: 2026-01-09  
**状态**: ✅ 架构设计完成，待实施  
**相关文档**: 
- [SSOT Architecture](./EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md) - Embedding 权威定义与边界
- [Signal Architecture](./SIGNAL_ARCHITECTURE_PROPOSAL.md) - Signal embedding 策略
- [Media Architecture](./Media_Architecture.md) - MediaArtifact embedding 策略
- [AI Enhanced Methodology](./AI_Enhanced_methodology) - Contextual Retrieval 理论基础

---

## 📋 目录

1. [架构概述](#架构概述)
2. [核心问题与解决方案](#核心问题与解决方案)
3. [分层 Chunking 策略](#分层-chunking-策略)
4. [Semantic Chunking 算法](#semantic-chunking-算法)
5. [Embedding 存储架构](#embedding-存储架构)
6. [检索策略](#检索策略)
7. [上下文增强（Contextual Retrieval）](#上下文增强contextual-retrieval)
8. [成本与性能优化](#成本与性能优化)
9. [实施路线](#实施路线)

---

## 架构概述

### 设计原则

1. **SSOT 不可变**：TimeNode 的 Block-Level Timestamp 设计保持不变，作为数据真相源
2. **Derived 多粒度**：RAG Index 层提供多粒度 chunk（Block/TimeNode/Semantic），按需检索
3. **语义优先**：主力使用 Semantic-Level chunking，保证语义完整性
4. **单一 Writer**：所有 embedding 由 `RAGIndexService` 统一管理（符合 SSOT §5.1）
5. **可重建**：Embedding 可从 SSOT 完全重建，支持模型版本升级

### 架构分层

```
┌─────────────────────────────────────────────────────────┐
│                  SSOT Layer (真相源)                     │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  TimeNode   │  │   Signal    │  │MediaArtifact│    │
│  │  (5分钟分段)│  │ (行为分析)  │  │ (媒体理解)  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                          │
│  特点：Block-Level Timestamp，精确时间追溯              │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ 派生（可重建）
                       ▼
┌─────────────────────────────────────────────────────────┐
│               RAG Index Layer (检索层)                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Semantic Chunking Service                 │  │
│  │  • 语义连贯性判断  • 动态聚合 TimeNode             │  │
│  │  • 主题提取        • 上下文增强                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Block-   │  │TimeNode- │  │Semantic- │⭐ 主力      │
│  │ Level    │  │ Level    │  │ Level    │             │
│  │ Chunks   │  │ Chunks   │  │ Chunks   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                          │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │ Owner: RAGIndexService
                       ▼
┌─────────────────────────────────────────────────────────┐
│            Embedding Storage (Derived Store)            │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ event_       │  │ signal_      │  │media_artifact│ │
│  │ embeddings   │  │ embeddings   │  │_embeddings   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  统一 Writer: RAGIndexService                           │
│  统一抽象: EmbeddingModelVersion (v1/v2/...)           │
└─────────────────────────────────────────────────────────┘
```

---

## 核心问题与解决方案

### 问题 1：5 分钟分段可能破坏语义连贯性

**场景**：用户在 15 分钟内写了一段长文，被自动分成 3 个 TimeNode：

```typescript
// 0-5 分钟
timeNode1: {
  blocks: [
    { text: '今天的会议讨论了代码签名问题' },
    { text: 'Alex 提出了三个关键点:' },
    { text: '1. 证书过期问题' },
  ]
}

// 5-10 分钟（被强制分割）
timeNode2: {
  blocks: [
    { text: '2. 权限配置不当' },  // ❌ 延续上面"三个关键点"
    { text: '3. 开发者账号问题' },
  ]
}

// 10-15 分钟
timeNode3: {
  blocks: [
    { text: '最终我们决定使用 Fastlane 自动化流程' },  // ❌ 结论被分离
  ]
}
```

**问题**：如果按 TimeNode 做 chunk，用户搜索"代码签名的解决方案"时：
- 检索到 `timeNode3`（"决定使用 Fastlane"），但缺少前因
- 或检索到 `timeNode1`（"提出了三个关键点"），但缺少具体方案

**解决方案**：Semantic-Level Chunking，跨 TimeNode 动态聚合

```typescript
semanticChunk: {
  sourceIds: ['node_1', 'node_2', 'node_3'],
  text: `今天的会议讨论了代码签名问题
Alex 提出了三个关键点:
1. 证书过期问题
2. 权限配置不当
3. 开发者账号问题
最终我们决定使用 Fastlane 自动化流程`,
  metadata: {
    topic: '代码签名问题解决方案',  // AI 提取
    duration: 600000,  // 10 分钟
  }
}
```

### 问题 2：Block-Level Chunk 太细，上下文不足

**场景**：如果按 paragraph 做 chunk，每个 block 单独 embedding：

```typescript
chunk1: { text: 'Alex 提出了三个关键点:', embedding: [...] }
chunk2: { text: '1. 证书过期问题', embedding: [...] }
chunk3: { text: '2. 权限配置不当', embedding: [...] }
```

**问题**：用户搜索"Alex 提出的解决方案"时：
- 召回 `chunk1`，但只说"提出了三个关键点"，没说是什么
- 需要再召回后续 3-5 个 chunk 才能拼成完整答案
- **检索返回 20 个 chunk 才够用** → Token 浪费 + 用户体验差

**解决方案**：Semantic-Level Chunking 一次性包含完整语义，只需 5-8 个 chunk

---

## 分层 Chunking 策略

### 三层 Chunk 粒度

| 粒度 | 用途 | 平均大小 | 使用场景 | 占比 |
|-----|------|---------|---------|------|
| **Block-Level** | 精确匹配 | 50-200 字符 | 搜索引用的某句话、特定术语 | 10% |
| **TimeNode-Level** | 时间敏感查询 | 200-500 字符 | "昨天下午我记录了什么" | 20% |
| **Semantic-Level** ⭐ | 语义搜索 | 500-1500 字符 | "代码签名的解决方案"（主力） | 70% |

### Chunk 数据结构

```typescript
// ===== SSOT 层（不变）=====
interface TimeNode {
  id: string;
  eventId: string;
  createdAt: number;  // 毫秒时间戳
  blocks: Array<{
    id: string;
    type: 'paragraph' | 'heading-one' | 'heading-two' | 'bulleted-list';
    createdAt: number;
    children: any[];
  }>;
}

// ===== Derived 层（RAG Index）=====
interface RAGChunk {
  id: string;
  
  // Chunk 类型（多粒度）
  chunkType: 'block' | 'timenode' | 'semantic';
  
  // 关联的 SSOT
  sourceType: 'timenode' | 'event' | 'signal' | 'media_artifact';
  sourceIds: string[];  // 可能跨多个 TimeNode
  
  // 内容（从 SSOT 重建）
  text: string;
  
  // AI 生成的元数据（Derived，可选）
  metadata: {
    topic?: string;        // AI 提取的主题（5-10 字）
    entities?: string[];   // AI 提取的实体（人名/地点/组织）
    keywords?: string[];   // 关键词
    startTime: number;     // 最早的 block.createdAt
    endTime: number;       // 最晚的 block.createdAt
    timeNodeIds: string[]; // 原始 TimeNode IDs
    eventId?: string;      // 所属 Event
  };
  
  // 生成信息
  generatedAt: string;
  modelVersion: string;  // 用于生成 topic 的 LLM 版本（可选）
}

// Embedding 表（符合 SSOT §5.1）
interface EventEmbedding {
  id: string;
  chunkId: string;       // 关联 RAGChunk.id
  
  // Embedding 向量
  embedding: number[];   // 1536 维 (text-embedding-3-small)
  modelVersion: 'v1' | 'v2' | 'v3';  // EmbeddingModelVersion 抽象
  
  // 元数据（用于过滤）
  eventId?: string;
  tags?: string[];
  createdAt: string;
  
  // 生成信息
  generatedAt: string;
}
```

---

## Semantic Chunking 算法

### 核心逻辑

```typescript
/**
 * Semantic Chunking Service
 * 
 * 职责：
 * 1. 从 SSOT 的 TimeNode 动态聚合出 Semantic Chunk
 * 2. 判断语义连贯性（AI 驱动）
 * 3. 提取主题和实体（AI 生成元数据）
 */
class SemanticChunkingService {
  /**
   * 核心方法：为一个 Event 的所有 TimeNode 生成 Semantic Chunks
   */
  async createSemanticChunks(eventId: string): Promise<RAGChunk[]> {
    // 1. 获取 Event 下的所有 TimeNode（按时间排序）
    const timeNodes = await this.getTimeNodesByEvent(eventId);
    if (timeNodes.length === 0) return [];
    
    const chunks: RAGChunk[] = [];
    let currentChunk: {
      nodes: TimeNode[];
      text: string;
      startTime: number;
      endTime: number;
    } = {
      nodes: [],
      text: '',
      startTime: 0,
      endTime: 0,
    };
    
    for (let i = 0; i < timeNodes.length; i++) {
      const node = timeNodes[i];
      const nextNode = timeNodes[i + 1];
      
      // 将当前 node 添加到 chunk
      currentChunk.nodes.push(node);
      currentChunk.text += this.nodeToText(node) + '\n';
      if (currentChunk.nodes.length === 1) {
        currentChunk.startTime = node.createdAt;
      }
      currentChunk.endTime = node.createdAt;
      
      // 判断是否应该切分
      const shouldSplit = await this.shouldSplitChunk(currentChunk, nextNode);
      
      if (shouldSplit || !nextNode) {
        // 生成 chunk
        const chunk = await this.finalizeChunk(currentChunk, eventId);
        chunks.push(chunk);
        
        // 重置
        currentChunk = { nodes: [], text: '', startTime: 0, endTime: 0 };
      }
    }
    
    return chunks;
  }
  
  /**
   * 判断是否应该切分（核心算法）
   */
  private async shouldSplitChunk(
    currentChunk: { nodes: TimeNode[]; text: string; endTime: number },
    nextNode?: TimeNode,
  ): Promise<boolean> {
    if (!nextNode) return true;
    
    // 策略 1: 字数限制（防止 chunk 过大）
    if (currentChunk.text.length > 1500) {
      console.log('[Chunking] Split: 超过字数上限 1500');
      return true;
    }
    
    // 策略 2: 时间间隔（超过 30 分钟强制切分）
    const timeGap = nextNode.createdAt - currentChunk.endTime;
    if (timeGap > 30 * 60 * 1000) {
      console.log(`[Chunking] Split: 时间间隔过大 ${timeGap / 60000} 分钟`);
      return true;
    }
    
    // 策略 3: TimeNode 数量限制
    if (currentChunk.nodes.length >= 5) {
      console.log('[Chunking] Split: 已聚合 5 个 TimeNode');
      return true;
    }
    
    // 策略 4: 语义连贯性（AI 判断）⭐ 核心
    const nextText = this.nodeToText(nextNode);
    const semanticContinuity = await this.checkSemanticContinuity(
      currentChunk.text,
      nextText,
    );
    
    if (semanticContinuity < 0.7) {
      console.log(`[Chunking] Split: 语义连贯性低 ${semanticContinuity}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * 语义连贯性检查（用 LLM）
   */
  private async checkSemanticContinuity(
    currentText: string,
    nextText: string,
  ): Promise<number> {
    const prompt = `判断以下两段文字是否在讨论同一个话题：

段落 A:
${currentText}

段落 B:
${nextText}

返回 0-1 的连贯性分数（1 = 完全连贯，0 = 完全无关）。
只返回数字，不要解释。`;
    
    const llm = new LLMService(llmConfig);
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 10,
    });
    
    const score = parseFloat(response.content || '0.5');
    return Math.min(Math.max(score, 0), 1);  // 限制在 0-1
  }
  
  /**
   * 提取主题（用 LLM）
   */
  private async extractTopic(text: string): Promise<string> {
    const prompt = `用 5-10 个字总结以下内容的主题：

${text}

只返回主题，不要解释。`;
    
    const llm = new LLMService(llmConfig);
    const response = await llm.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 20,
    });
    
    return response.content?.trim() || '未知主题';
  }
  
  /**
   * 生成最终 chunk
   */
  private async finalizeChunk(
    currentChunk: { nodes: TimeNode[]; text: string; startTime: number; endTime: number },
    eventId: string,
  ): Promise<RAGChunk> {
    // AI 生成元数据（可选，可配置是否开启）
    const topic = await this.extractTopic(currentChunk.text);
    
    return {
      id: `chunk_${nanoid()}`,
      chunkType: 'semantic',
      sourceType: 'timenode',
      sourceIds: currentChunk.nodes.map(n => n.id),
      text: currentChunk.text.trim(),
      metadata: {
        topic,
        startTime: currentChunk.startTime,
        endTime: currentChunk.endTime,
        timeNodeIds: currentChunk.nodes.map(n => n.id),
        eventId,
      },
      generatedAt: new Date().toISOString(),
      modelVersion: llmConfig.model,  // 记录用于生成 topic 的模型
    };
  }
  
  /**
   * TimeNode 转文本
   */
  private nodeToText(node: TimeNode): string {
    return node.blocks
      .map(block => this.blockToPlainText(block))
      .filter(Boolean)
      .join('\n');
  }
  
  private blockToPlainText(block: any): string {
    // 递归提取 Slate nodes 的纯文本
    if (block.text) return block.text;
    if (block.children) {
      return block.children.map((c: any) => this.blockToPlainText(c)).join('');
    }
    return '';
  }
}
```

---

## Embedding 存储架构

### 表设计（符合 SSOT §5.1）

```typescript
/**
 * RAG Chunk 表（存储 chunk 定义，不含 embedding）
 * 
 * Owner: RAGIndexService
 */
interface RAGChunkTable {
  id: string;                // chunk_${nanoid()}
  chunkType: 'block' | 'timenode' | 'semantic';
  sourceType: 'timenode' | 'event' | 'signal' | 'media_artifact';
  sourceIds: string[];       // JSON array
  text: string;              // 从 SSOT 重建的文本
  metadata: string;          // JSON: { topic, entities, startTime, endTime, ... }
  generatedAt: string;       // ISO timestamp
  modelVersion: string;      // LLM 版本（用于生成 topic）
}

/**
 * Event Embedding 表（存储 embedding 向量）
 * 
 * Owner: RAGIndexService（单一 Writer）
 * 符合 SSOT §5.1 要求
 */
interface EventEmbeddingTable {
  id: string;                // emb_${nanoid()}
  chunkId: string;           // 关联 RAGChunkTable.id
  embedding: Float32Array;   // 1536 维 (text-embedding-3-small)
  modelVersion: 'v1' | 'v2' | 'v3';  // EmbeddingModelVersion 抽象
  
  // 用于过滤的元数据（从 chunk.metadata 冗余）
  eventId?: string;
  tags?: string[];           // JSON array
  createdAt: string;
  
  generatedAt: string;
}

/**
 * Signal Embedding 表（独立表，按 SSOT §5.1.3）
 */
interface SignalEmbeddingTable {
  id: string;
  signalId: string;          // 关联 signals.id
  embedding: Float32Array;
  modelVersion: 'v1' | 'v2' | 'v3';
  generatedAt: string;
}

/**
 * MediaArtifact Embedding 表
 */
interface MediaArtifactEmbeddingTable {
  id: string;
  mediaArtifactId: string;   // 关联 media_artifacts.id
  embedding: Float32Array;
  modelVersion: 'v1' | 'v2' | 'v3';
  generatedAt: string;
}
```

### RAGIndexService 实现

```typescript
/**
 * RAG Index Service
 * 
 * 职责（符合 SSOT §5.1）：
 * 1. 所有 embedding 的统一 Writer
 * 2. 管理多粒度 chunk 生成
 * 3. Embedding 生成与更新
 * 4. 模型版本迁移
 */
class RAGIndexService {
  private embeddingService: EmbeddingService;
  private chunkingService: SemanticChunkingService;
  private storageManager: StorageManager;
  
  constructor(deps: {
    embeddingService: EmbeddingService;
    storageManager: StorageManager;
  }) {
    this.embeddingService = deps.embeddingService;
    this.chunkingService = new SemanticChunkingService();
    this.storageManager = deps.storageManager;
  }
  
  /**
   * 当 TimeNode 创建/修改时触发
   */
  async onTimeNodeChange(timeNodeId: string): Promise<void> {
    // 1. 获取所属 Event
    const timeNode = await this.storageManager.getTimeNode(timeNodeId);
    if (!timeNode) return;
    
    // 2. 删除旧的相关 chunk
    const oldChunks = await this.findChunksContaining(timeNodeId);
    await this.deleteChunks(oldChunks.map(c => c.id));
    
    // 3. 重新生成 Semantic Chunks（整个 Event 级别）
    const newChunks = await this.chunkingService.createSemanticChunks(timeNode.eventId);
    
    // 4. 保存 chunk + 生成 embedding
    for (const chunk of newChunks) {
      await this.indexChunk(chunk);
    }
  }
  
  /**
   * 为 chunk 生成 embedding 并存储
   */
  async indexChunk(chunk: RAGChunk): Promise<void> {
    // 1. 保存 chunk 定义
    await this.storageManager.db.ragChunks.add(chunk);
    
    // 2. 生成 embedding
    const result = await this.embeddingService.embed(chunk.text);
    
    // 3. 保存 embedding
    await this.storageManager.db.eventEmbeddings.add({
      id: `emb_${nanoid()}`,
      chunkId: chunk.id,
      embedding: new Float32Array(result.embedding),
      modelVersion: 'v1',  // 当前版本
      eventId: chunk.metadata.eventId,
      tags: [], // 可从 Event 读取
      createdAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    });
  }
  
  /**
   * 查找包含指定 TimeNode 的所有 chunk
   */
  private async findChunksContaining(timeNodeId: string): Promise<RAGChunk[]> {
    const allChunks = await this.storageManager.db.ragChunks.toArray();
    return allChunks.filter(chunk =>
      chunk.sourceIds.includes(timeNodeId)
    );
  }
  
  /**
   * 删除 chunk 及其 embedding
   */
  private async deleteChunks(chunkIds: string[]): Promise<void> {
    await this.storageManager.db.ragChunks.bulkDelete(chunkIds);
    
    const embeddings = await this.storageManager.db.eventEmbeddings
      .where('chunkId')
      .anyOf(chunkIds)
      .toArray();
    
    await this.storageManager.db.eventEmbeddings.bulkDelete(
      embeddings.map(e => e.id)
    );
  }
  
  /**
   * 模型版本迁移（从 v1 → v2）
   */
  async migrateEmbeddings(fromVersion: string, toVersion: string): Promise<void> {
    console.log(`[RAGIndex] 迁移 embedding: ${fromVersion} → ${toVersion}`);
    
    // 1. 查找所有旧版本 embedding
    const oldEmbeddings = await this.storageManager.db.eventEmbeddings
      .where('modelVersion')
      .equals(fromVersion)
      .toArray();
    
    console.log(`[RAGIndex] 找到 ${oldEmbeddings.length} 个旧 embedding`);
    
    // 2. 批量重新生成
    for (const oldEmb of oldEmbeddings) {
      const chunk = await this.storageManager.db.ragChunks.get(oldEmb.chunkId);
      if (!chunk) continue;
      
      // 重新生成 embedding
      const result = await this.embeddingService.embed(chunk.text);
      
      // 更新 embedding
      await this.storageManager.db.eventEmbeddings.update(oldEmb.id, {
        embedding: new Float32Array(result.embedding),
        modelVersion: toVersion,
        generatedAt: new Date().toISOString(),
      });
    }
    
    console.log(`[RAGIndex] 迁移完成`);
  }
}
```

---

## 检索策略

### 混合检索（Hybrid Retrieval）

参考 `AI_Enhanced_methodology` 的 BM25 + Embedding + Rerank 策略：

```typescript
class HybridRetrievalService {
  private ragIndexService: RAGIndexService;
  private embeddingService: EmbeddingService;
  
  /**
   * 混合检索主流程
   */
  async search(query: string, options: {
    topK?: number;          // 返回结果数，默认 5
    filter?: {
      eventIds?: string[];
      tags?: string[];
      dateRange?: { start: string; end: string };
    };
  } = {}): Promise<SearchResult[]> {
    const topK = options.topK || 5;
    
    // ===== 阶段 1: 粗筛（Semantic Search）=====
    const queryEmbedding = await this.embeddingService.embed(query);
    const candidates = await this.vectorSearch(queryEmbedding.embedding, {
      limit: topK * 4,  // 先召回 20 个候选
      filter: options.filter,
    });
    
    // ===== 阶段 2: 精排（Rerank）=====
    const reranked = await this.rerank(query, candidates, topK);
    
    // ===== 阶段 3: 上下文增强（返回前后 TimeNode）=====
    const enriched = await this.enrichWithContext(reranked);
    
    return enriched;
  }
  
  /**
   * 向量搜索（余弦相似度）
   */
  private async vectorSearch(
    queryEmbedding: number[],
    options: {
      limit: number;
      filter?: any;
    },
  ): Promise<SearchCandidate[]> {
    // 1. 获取所有 embedding（支持过滤）
    let embeddings = await this.storageManager.db.eventEmbeddings.toArray();
    
    // 应用过滤
    if (options.filter?.eventIds) {
      embeddings = embeddings.filter(e =>
        options.filter!.eventIds!.includes(e.eventId!)
      );
    }
    
    // 2. 计算余弦相似度
    const similarities = embeddings.map(emb => ({
      embedding: emb,
      score: this.embeddingService.cosineSimilarity(
        queryEmbedding,
        Array.from(emb.embedding)
      ),
    }));
    
    // 3. 排序并返回 Top-N
    similarities.sort((a, b) => b.score - a.score);
    const topCandidates = similarities.slice(0, options.limit);
    
    // 4. 加载完整 chunk
    const results: SearchCandidate[] = [];
    for (const candidate of topCandidates) {
      const chunk = await this.storageManager.db.ragChunks.get(
        candidate.embedding.chunkId
      );
      if (chunk) {
        results.push({
          chunk,
          score: candidate.score,
        });
      }
    }
    
    return results;
  }
  
  /**
   * Rerank（用 LLM 重新排序）
   */
  private async rerank(
    query: string,
    candidates: SearchCandidate[],
    topK: number,
  ): Promise<SearchCandidate[]> {
    // 可选：用 LLM 判断相关性
    // 这里简化为保留 vector search 结果
    return candidates.slice(0, topK);
  }
  
  /**
   * 上下文增强：返回前后 TimeNode
   */
  private async enrichWithContext(
    results: SearchCandidate[],
  ): Promise<SearchResult[]> {
    const enriched: SearchResult[] = [];
    
    for (const result of results) {
      const chunk = result.chunk;
      
      // 获取 chunk 关联的 TimeNode
      const timeNodes = await this.storageManager.db.timeNodes
        .where('id')
        .anyOf(chunk.sourceIds)
        .toArray();
      
      // 获取前后各 1 个 TimeNode（作为上下文）
      const contextNodes = await this.getAdjacentTimeNodes(timeNodes);
      
      enriched.push({
        chunk,
        score: result.score,
        context: {
          before: contextNodes.before,
          after: contextNodes.after,
        },
      });
    }
    
    return enriched;
  }
}

interface SearchCandidate {
  chunk: RAGChunk;
  score: number;
}

interface SearchResult extends SearchCandidate {
  context: {
    before: TimeNode[];  // 前 1-2 个 TimeNode
    after: TimeNode[];   // 后 1-2 个 TimeNode
  };
}
```

---

## 上下文增强（Contextual Retrieval）

参考 `AI_Enhanced_methodology` 的方法，为每个 chunk 注入上下文信息，提升检索精度：

```typescript
/**
 * 上下文增强 Service
 * 
 * 目标：在生成 embedding 前，为 chunk.text 添加上下文说明
 * 效果：检索失败率降低 49%-67%（参考 AI_Enhanced_methodology）
 */
class ContextualRetrievalService {
  /**
   * 为 chunk 添加上下文
   */
  async enhanceChunk(chunk: RAGChunk): Promise<string> {
    // 1. 获取 Event 信息
    const event = await this.storageManager.getEvent(chunk.metadata.eventId!);
    if (!event) return chunk.text;
    
    // 2. 获取关联的 Signal（如果有）
    const signals = await this.getRelatedSignals(chunk.metadata.eventId!);
    
    // 3. 构建上下文前缀
    const contextPrefix = this.buildContextPrefix(event, signals, chunk);
    
    // 4. 返回增强后的文本
    return `${contextPrefix}\n\n${chunk.text}`;
  }
  
  /**
   * 构建上下文前缀
   */
  private buildContextPrefix(
    event: Event,
    signals: Signal[],
    chunk: RAGChunk,
  ): string {
    const parts: string[] = [];
    
    // Event 信息
    parts.push(`【Event: ${event.title}】`);
    
    // 时间信息
    if (event.startTime) {
      parts.push(`【时间: ${event.startTime}】`);
    }
    
    // 标签
    if (event.tags && event.tags.length > 0) {
      parts.push(`【标签: ${event.tags.map(t => `#${t}`).join(' ')}】`);
    }
    
    // 参与者
    if (event.attendees && event.attendees.length > 0) {
      parts.push(`【参与者: ${event.attendees.join(', ')}】`);
    }
    
    // Signal 信息（如果有高注意力行为）
    if (signals.length > 0) {
      const highAttention = signals.find(s => s.signalType === 'high_attention');
      if (highAttention) {
        parts.push(`【Signal: 高注意力 | 停留 ${highAttention.behaviorMeta?.dwellTime}ms】`);
      }
    }
    
    // Chunk 主题（AI 生成）
    if (chunk.metadata.topic) {
      parts.push(`【主题: ${chunk.metadata.topic}】`);
    }
    
    return parts.join(' ');
  }
}

// 使用示例
const enhanced = await contextualRetrievalService.enhanceChunk(chunk);

// 原始 chunk.text:
// "讨论了数据库索引优化方案"

// 增强后的 enhanced:
// "【Event: 技术评审会议】【时间: 2025-12-06 14:30】【参与者: @张三 @李四】【Signal: 高注意力 | 停留 120000ms】【主题: 数据库优化】
//
// 讨论了数据库索引优化方案"

// 效果：
// 1. 检索"技术评审会议的数据库方案"时，匹配度更高
// 2. 检索"张三参与的讨论"时，也能召回这个 chunk
```

---

## 成本与性能优化

### 成本对比（10K 用户，每人 1000 TimeNode）

| 方案 | Chunk 数量 | Embedding 成本 | 存储成本 | 检索 Token 消耗 | 总成本/月 |
|-----|-----------|---------------|---------|---------------|----------|
| **Block-Level** | 30M chunks | $30 | $18.4 | $60 | $108.4 |
| **TimeNode-Level** | 10M chunks | $20 | $6.1 | $30 | $56.1 |
| **Semantic-Level** ⭐ | 3M chunks | $18 | $1.84 | $9 | $28.84 |

**洞察**：Semantic-Level 成本降低 73%，且检索质量更高

### 性能优化策略

```typescript
// 1. 批量生成 embedding（降低 API 调用次数）
async function batchGenerateEmbeddings(chunks: RAGChunk[]): Promise<void> {
  const batchSize = 100;
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);
    
    const embeddings = await embeddingService.embedBatch(texts);
    
    // 保存
    await Promise.all(
      batch.map((chunk, idx) =>
        ragIndexService.indexChunk(chunk, embeddings[idx].embedding)
      )
    );
  }
}

// 2. 增量更新（只重新生成变化的 chunk）
async function incrementalUpdate(timeNodeId: string): Promise<void> {
  // 只删除包含该 TimeNode 的 chunk
  const affectedChunks = await findChunksContaining(timeNodeId);
  await deleteChunks(affectedChunks);
  
  // 重新生成（局部）
  const event = await getEventByTimeNode(timeNodeId);
  const newChunks = await semanticChunkingService.createSemanticChunks(event.id);
  
  await batchGenerateEmbeddings(newChunks);
}

// 3. Prompt Caching（用 Claude 的 Prompt Caching）
async function extractTopicWithCache(text: string): Promise<string> {
  // 系统提示词缓存（减少 90% 成本）
  const systemPrompt = `你是一个主题提取专家。用 5-10 个字总结文本主题。`;
  
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },  // 缓存系统提示词
      },
    ],
    messages: [{ role: 'user', content: text }],
  });
  
  return response.content[0].text;
}
```

---

## 多地域部署策略

### 问题背景

4DNote 面向全球用户，需要在**中文内容检索**与**英文内容检索**之间做平衡：
- **国内用户**：主要搜索中文内容，使用国内 Embedding API（如通义 qwen-text-embedding）延迟低、成本低
- **海外用户**：可能搜索英文内容，使用国际 Embedding API（如 Voyage AI）效果更好
- **混合场景**：同一用户可能同时搜索中英文内容

### 方案对比矩阵

| 方案 | 技术复杂度 | 成本 | 用户体验 | 适用场景 |
|------|----------|------|---------|---------|
| **方案 A：语言检测 + 动态路由** | ⭐⭐⭐⭐ | 中等 | 最优 | 多语言混合用户 |
| **方案 B：地域一刀切** | ⭐⭐ | 最低 | 较好 | 用户地域明确 |
| **方案 C：混合策略（推荐）** ⭐ | ⭐⭐⭐ | 中等偏低 | 优秀 | 大部分场景 |

---

### 方案 A：语言检测 + 动态路由

**架构**：

```
用户查询
  ↓
[语言检测层] ← 检测查询语言（10-50ms）
  ↓
┌─────────────┬─────────────┐
│  中文检测    │  英文检测    │
↓             ↓
[国内服务器]   [香港/海外]
通义 Embedding  Voyage API
```

**技术实现**：

```typescript
/**
 * 轻量级语言检测（最快，<1ms）
 */
function detectLanguage(text: string): 'zh' | 'en' {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const totalChars = text.trim().length;
  
  if (chineseChars / totalChars > 0.3) {
    return 'zh';
  }
  return 'en';
}

/**
 * Embedding 路由器
 */
class EmbeddingRouter {
  private domesticClient: TongyiEmbeddingService;
  private overseasClient: VoyageEmbeddingService;
  
  async getEmbedding(text: string): Promise<number[]> {
    const lang = detectLanguage(text);
    
    if (lang === 'zh') {
      return await this.domesticClient.embed(text);
    } else {
      return await this.overseasClient.embed(text);
    }
  }
}
```

**优势**：
- ✅ 自动选择最优模型（中文用通义，英文用 Voyage）
- ✅ 用户无感知，体验最佳

**劣势**：
- ❌ **混合语言处理难**：查询"GPT和通义千问的对比"（中英混合）如何路由？
- ❌ **切换抖动**：同一用户连续查询可能路由到不同服务器，embedding 不一致
- ❌ **调试复杂**：线上问题难以复现（"为什么他的查询走了 Voyage？"）
- ❌ 代码复杂度 +30%

---

### 方案 B：地域一刀切

**架构**：

```
用户注册时确定地域
  ↓
┌────────────────┬────────────────┐
│  中国用户       │  海外用户       │
↓                ↓
[国内服务器]      [海外服务器]
通义 Embedding     Voyage API
```

**实现**：

```typescript
function assignDefaultServer(userIp: string): 'domestic' | 'overseas' {
  if (isChinaIP(userIp)) {
    return 'domestic';
  }
  return 'overseas';
}

function isChinaIP(ip: string): boolean {
  // 使用 IP 数据库（如 MaxMind GeoIP2）
  const country = geoip.country(ip);
  return country === 'CN';
}
```

**优势**：
- ✅ 架构极简：一个用户只连一个集群
- ✅ 性能最优：无需语言检测，延迟最低
- ✅ 成本可控：按地域独立计费，易于核算
- ✅ 合规友好：中国用户数据不出境

**劣势**：
- ❌ **用户体验问题**：
  - 中国用户搜索英文内容时，效果可能不佳
  - 海外华人用户搜索中文时，延迟高且效果差
- ❌ **无法应对特殊场景**：
  - 出差/VPN 用户体验下降
  - 跨国企业用户需要两个账号

---

### 方案 C：混合策略（推荐）⭐

**核心思路**：用地域作为默认路由 + 用户可手动切换

**架构**：

```
用户注册 → 自动分配默认服务器（基于 IP）
  ↓
┌─────────────────────────────────┐
│  默认路由（基于注册地）          │
│  - 中国 IP → 国内               │
│  - 海外 IP → 海外               │
└─────────────────────────────────┘
  ↓
允许用户在设置中切换：
  - "我经常搜索英文内容" → 切换到海外
  - "我在中国但用 VPN" → 强制国内
```

**实现**：

```typescript
/**
 * 用户偏好存储（在 User 表中增加字段）
 */
interface User {
  id: string;
  embeddingPreference: 'auto' | 'domestic' | 'overseas';  // 新增字段
  defaultServer?: 'domestic' | 'overseas';  // 自动分配的默认值
}

/**
 * Embedding Service with Fallback
 */
class SmartEmbeddingService {
  private domesticClient: TongyiEmbeddingService;
  private overseasClient: VoyageEmbeddingService;
  
  async getEmbedding(
    text: string,
    user: User,
  ): Promise<number[]> {
    // 1. 确定使用哪个服务器
    const server = this.resolveServer(user);
    
    try {
      // 2. 主服务器
      if (server === 'domestic') {
        return await this.domesticClient.embed(text);
      } else {
        return await this.overseasClient.embed(text);
      }
    } catch (error) {
      // 3. 智能降级：主服务器失败时自动切换
      console.warn(`Primary server (${server}) failed, switching to backup`);
      
      if (server === 'domestic') {
        return await this.overseasClient.embed(text);
      } else {
        return await this.domesticClient.embed(text);
      }
    }
  }
  
  private resolveServer(user: User): 'domestic' | 'overseas' {
    switch (user.embeddingPreference) {
      case 'domestic':
        return 'domestic';
      case 'overseas':
        return 'overseas';
      case 'auto':
      default:
        return user.defaultServer || 'domestic';
    }
  }
}
```

**用户设置界面**（在 Settings → Advanced）：

```typescript
// UI 组件
const EmbeddingPreferenceSettings = () => {
  return (
    <div>
      <h3>搜索优化设置</h3>
      <RadioGroup value={preference} onChange={setPreference}>
        <Radio value="auto">
          自动（推荐）- 基于注册地自动选择
        </Radio>
        <Radio value="domestic">
          优先中文搜索 - 使用国内服务器（延迟低，适合中文内容）
        </Radio>
        <Radio value="overseas">
          优先英文搜索 - 使用国际服务器（适合英文内容）
        </Radio>
      </RadioGroup>
    </div>
  );
};
```

**优势**：
- ✅ 开发成本低（2 人日）
- ✅ 用户体验好（有选择权）
- ✅ 可扩展性强（后续可加语言检测）
- ✅ 成本增加可控（<10%）
- ✅ 智能降级：主服务器故障时自动切换

**劣势**：
- ⚠️ 需要用户手动设置（但默认值已够用）
- ⚠️ 需要额外存储 1 个用户偏好字段

---

### 成本详细对比（假设 10 万用户，月均 100 万次查询）

| 方案 | 服务器成本 | API 成本 | 开发成本 | 总成本/月 |
|------|----------|---------|---------|-----------|
| **纯国内** | ¥500 | ¥350 | 0 | **¥850** |
| **纯海外** | $200 (¥1,400) | $60 (¥420) | 0 | **¥1,820** |
| **语言检测路由** | ¥500 + $100 | ¥200 + $30 | 5 人日 | **¥1,450** |
| **地域一刀切** | ¥500 + $100 | ¥250 + $35 | 1 人日 | **¥1,200** |
| **混合策略** ⭐ | ¥500 + $100 | ¥280 + $25 | 2 人日 | **¥1,100** |

**洞察**：混合策略在成本和体验之间达到最佳平衡

---

### 快速决策树

```
你的用户中，中文和英文内容各占多少？
  ↓
┌─────────────┬─────────────┬─────────────┐
│  90%+ 中文   │  30-70% 混合 │  90%+ 英文   │
↓             ↓             ↓
方案B          方案C ⭐       纯海外部署
(地域切分)     (混合策略)     (不需要国内)
```

**对于 4DNote，推荐方案 C（混合策略）**，因为：
1. 用户可能同时管理中英文事件
2. 海外华人用户需要搜索中文内容
3. 成本增加 <10%，但用户体验提升 50%+
4. 架构可扩展（未来可加入方案 A 的语言检测）

---

### 实施建议

**Phase 1（MVP）**：方案 B（地域一刀切）
- 先按用户注册 IP 分配服务器
- 开发成本低（1 人日）
- 满足 80% 场景

**Phase 2（优化）**：升级到方案 C
- 在用户设置中增加偏好选项
- 增加智能降级逻辑
- 成本 +10%，体验 +50%

**Phase 3（进阶）**：可选加入方案 A
- 对特定场景（如 AI 对话）用语言检测动态路由
- 适合对实时性要求极高的功能

---

## 实施路线

### Phase 1: 基础设施（Week 1-2）

```typescript
const phase1Tasks = [
  {
    task: '设计 RAGChunk / EventEmbedding 表结构',
    status: 'pending',
    files: [
      'src/types/rag.types.ts',
      'src/services/storage/schema.ts',
    ],
  },
  {
    task: '实现 SemanticChunkingService（简化版，不用 AI）',
    status: 'pending',
    files: ['src/ai/services/SemanticChunkingService.ts'],
    notes: '先用硬编码规则（时间间隔 + 字数限制），跳过语义判断',
  },
  {
    task: '实现 RAGIndexService 基础功能',
    status: 'pending',
    files: ['src/ai/services/RAGIndexService.ts'],
    features: ['indexChunk()', 'vectorSearch()', 'onTimeNodeChange()'],
  },
  {
    task: '集成 EmbeddingService（text-embedding-3-small）',
    status: 'pending',
    files: ['src/ai/services/EmbeddingService.ts'],
  },
];
```

### Phase 2: Semantic Chunking（Week 3-4）

```typescript
const phase2Tasks = [
  {
    task: '实现语义连贯性判断（用 LLM）',
    status: 'pending',
    files: ['src/ai/services/SemanticChunkingService.ts'],
    method: 'checkSemanticContinuity()',
  },
  {
    task: '实现主题提取（用 LLM）',
    status: 'pending',
    method: 'extractTopic()',
  },
  {
    task: '为历史 Event 批量生成 Semantic Chunks',
    status: 'pending',
    notes: '后台任务，避免阻塞 UI',
  },
];
```

### Phase 3: 上下文增强（Week 5）

```typescript
const phase3Tasks = [
  {
    task: '实现 ContextualRetrievalService',
    status: 'pending',
    files: ['src/ai/services/ContextualRetrievalService.ts'],
  },
  {
    task: '在 indexChunk() 时添加上下文前缀',
    status: 'pending',
    notes: 'Event 信息 + Signal 信息 + 主题',
  },
  {
    task: 'A/B 测试：对比有无上下文的检索精度',
    status: 'pending',
  },
];
```

### Phase 4: 混合检索与 UI（Week 6-7）

```typescript
const phase4Tasks = [
  {
    task: '实现 HybridRetrievalService',
    status: 'pending',
    files: ['src/ai/services/HybridRetrievalService.ts'],
  },
  {
    task: '添加 Rerank（可选）',
    status: 'pending',
    notes: '用 LLM 判断相关性',
  },
  {
    task: '实现搜索 UI',
    status: 'pending',
    files: ['src/components/Search/SemanticSearch.tsx'],
    features: ['显示 chunk + 上下文', '高亮匹配文本'],
  },
];
```

---

## 附录

### A. 关键代码位置

- **SSOT TimeNode 定义**: `src/types/event.types.ts`
- **RAGIndexService**: `src/ai/services/RAGIndexService.ts`（待创建）
- **SemanticChunkingService**: `src/ai/services/SemanticChunkingService.ts`（待创建）
- **EmbeddingService**: `src/ai/services/EmbeddingService.ts`（已存在）

### B. 参考文档

- [AI Enhanced Methodology](./AI_Enhanced_methodology) - Contextual Retrieval 理论
- [SSOT Architecture §5.1](./EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md#embedding-ownership) - Embedding 权威定义
- [Signal Architecture](./SIGNAL_ARCHITECTURE_PROPOSAL.md) - Signal embedding 策略
- [Media Architecture](./Media_Architecture.md) - MediaArtifact embedding 策略

### C. 术语表

- **SSOT**: Single Source of Truth，数据真相源（TimeNode）
- **Derived Store**: 派生存储（RAG Index），可从 SSOT 重建
- **Semantic Chunking**: 语义分块，按语义连贯性动态聚合 TimeNode
- **Contextual Retrieval**: 上下文检索，为 chunk 注入 Event/Signal 上下文
- **Hybrid Retrieval**: 混合检索，BM25 + Embedding + Rerank
- **RAGIndexService**: 统一 embedding Writer（符合 SSOT §5.1）

---

**End of Document**
