/**
 * Vector Store Service
 * 向量存储服务（基于内存的简单实现）
 */

import { IVectorStore, VectorMemoryEntry } from '../../types/ai/memory.types';
import { EmbeddingService } from './EmbeddingService';

/**
 * Vector Store 配置
 */
export interface VectorStoreConfig {
  embeddingService: EmbeddingService;
  topK?: number;
}

/**
 * 简单的内存向量存储实现
 * TODO: 后续替换为 ChromaDB 或 Qdrant
 */
export class InMemoryVectorStore implements IVectorStore {
  private entries: Map<string, VectorMemoryEntry> = new Map();
  private embeddingService: EmbeddingService;
  private topK: number;

  constructor(config: VectorStoreConfig) {
    this.embeddingService = config.embeddingService;
    this.topK = config.topK || 10;
  }

  /**
   * 添加条目
   */
  async add(entry: VectorMemoryEntry): Promise<void> {
    // 如果没有 embedding，生成一个
    if (!entry.embedding || entry.embedding.length === 0) {
      const result = await this.embeddingService.embed(entry.content);
      entry.embedding = result.embedding;
    }

    this.entries.set(entry.id, entry);
  }

  /**
   * 批量添加
   */
  async addBatch(entries: VectorMemoryEntry[]): Promise<void> {
    // 找出需要生成 embedding 的条目
    const needsEmbedding = entries.filter(
      e => !e.embedding || e.embedding.length === 0
    );

    if (needsEmbedding.length > 0) {
      const texts = needsEmbedding.map(e => e.content);
      const embeddings = await this.embeddingService.embedBatch(texts);

      needsEmbedding.forEach((entry, i) => {
        entry.embedding = embeddings[i].embedding;
      });
    }

    entries.forEach(entry => {
      this.entries.set(entry.id, entry);
    });
  }

  /**
   * 搜索相似条目
   */
  async search(query: string | number[], topK: number = this.topK): Promise<VectorMemoryEntry[]> {
    // 获取查询向量
    let queryVector: number[];
    if (typeof query === 'string') {
      const result = await this.embeddingService.embed(query);
      queryVector = result.embedding;
    } else {
      queryVector = query;
    }

    // 计算所有条目的相似度
    const similarities: Array<{ entry: VectorMemoryEntry; score: number }> = [];

    for (const entry of this.entries.values()) {
      const score = this.embeddingService.cosineSimilarity(
        queryVector,
        entry.embedding
      );

      similarities.push({ entry, score });
    }

    // 排序并返回 Top-K
    similarities.sort((a, b) => b.score - a.score);

    return similarities.slice(0, topK).map(item => item.entry);
  }

  /**
   * 删除条目
   */
  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    this.entries.clear();
  }

  /**
   * 获取条目数量
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * 获取所有条目
   */
  getAll(): VectorMemoryEntry[] {
    return Array.from(this.entries.values());
  }
}

/**
 * ChromaDB Vector Store（TODO: 实现）
 */
export class ChromaVectorStore implements IVectorStore {
  async add(entry: VectorMemoryEntry): Promise<void> {
    throw new Error('ChromaDB integration not implemented yet');
  }

  async addBatch(entries: VectorMemoryEntry[]): Promise<void> {
    throw new Error('ChromaDB integration not implemented yet');
  }

  async search(query: string | number[], topK: number): Promise<VectorMemoryEntry[]> {
    throw new Error('ChromaDB integration not implemented yet');
  }

  async delete(id: string): Promise<void> {
    throw new Error('ChromaDB integration not implemented yet');
  }

  async clear(): Promise<void> {
    throw new Error('ChromaDB integration not implemented yet');
  }
}
