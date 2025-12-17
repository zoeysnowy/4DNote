/**
 * Embedding Service
 * 文本向量化服务
 */

/**
 * Embedding 配置
 */
export interface EmbeddingConfig {
  model?: string;
  dimensions?: number;
  provider?: 'local' | 'api';
  batchSize?: number;
}

/**
 * Embedding 结果
 */
export interface EmbeddingResult {
  embedding: number[];
  metadata?: {
    model: string;
    dimensions: number;
  };
}

/**
 * Embedding Service 类
 */
export class EmbeddingService {
  private config: EmbeddingConfig;
  private cache: Map<string, number[]> = new Map();

  constructor(config: EmbeddingConfig = {}) {
    this.config = {
      model: 'mini-lm',
      dimensions: 384,
      provider: 'local',
      batchSize: 32,
      ...config
    };
  }

  /**
   * 生成单个文本的 embedding
   */
  async embed(text: string): Promise<EmbeddingResult> {
    // 检查缓存
    const cached = this.cache.get(text);
    if (cached) {
      return {
        embedding: cached,
        metadata: {
          model: this.config.model!,
          dimensions: this.config.dimensions!
        }
      };
    }

    // 生成 embedding
    const embedding = await this.generateEmbedding(text);

    // 写入缓存
    this.cache.set(text, embedding);

    return {
      embedding,
      metadata: {
        model: this.config.model!,
        dimensions: this.config.dimensions!
      }
    };
  }

  /**
   * 批量生成 embeddings
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const batchSize = this.config.batchSize || 32;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 生成 embedding（内部实现）
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (this.config.provider === 'local') {
      // 使用本地模型（简化实现：使用简单的哈希向量）
      return this.simpleHashEmbedding(text, this.config.dimensions!);
    } else {
      // 调用 API（TODO）
      throw new Error('API embedding not implemented yet');
    }
  }

  /**
   * 简单哈希 embedding（临时实现，后续替换为真实模型）
   */
  private simpleHashEmbedding(text: string, dimensions: number): number[] {
    const embedding = new Array(dimensions).fill(0);
    
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const index = charCode % dimensions;
      embedding[index] += 1;
    }

    // 归一化
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );

    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}
