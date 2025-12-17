/**
 * Memory 基础实现
 */

import {
  IMemory,
  ShortTermMemory,
  LongTermMemory,
  IVectorStore,
  Message,
  Context,
  Fact,
  Experience,
  VectorMemoryEntry
} from '../../../types/ai/memory.types';

/**
 * Memory 配置
 */
export interface MemoryConfig {
  maxShortTermMessages?: number;
  enableLongTerm?: boolean;
  enableVectorStore?: boolean;
  persistenceKey?: string;
}

/**
 * Memory 基础实现
 */
export class Memory implements IMemory {
  public shortTerm: ShortTermMemory;
  public longTerm: LongTermMemory;
  public vectorStore: IVectorStore;

  private config: MemoryConfig;

  constructor(
    vectorStore: IVectorStore,
    config: MemoryConfig = {}
  ) {
    this.config = {
      maxShortTermMessages: 50,
      enableLongTerm: true,
      enableVectorStore: true,
      ...config
    };

    this.vectorStore = vectorStore;

    // 初始化短期记忆
    this.shortTerm = {
      conversationHistory: [],
      currentContext: {
        sessionId: this.generateSessionId(),
        variables: new Map(),
        metadata: {}
      },
      workingMemory: new Map(),
      maxMessages: this.config.maxShortTermMessages
    };

    // 初始化长期记忆
    this.longTerm = {
      facts: [],
      experiences: [],
      preferences: [],
      patterns: []
    };
  }

  /**
   * 添加消息到会话历史
   */
  addMessage(message: Message): void {
    this.shortTerm.conversationHistory.push(message);

    // 限制历史消息数量
    const maxMessages = this.shortTerm.maxMessages || 50;
    if (this.shortTerm.conversationHistory.length > maxMessages) {
      this.shortTerm.conversationHistory = this.shortTerm.conversationHistory.slice(-maxMessages);
    }
  }

  /**
   * 获取最近的消息
   */
  getRecentMessages(count: number): Message[] {
    return this.shortTerm.conversationHistory.slice(-count);
  }

  /**
   * 存储事实
   */
  async storeFact(fact: Omit<Fact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Fact> {
    const newFact: Fact = {
      ...fact,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.longTerm.facts.push(newFact);

    // 添加到向量存储
    if (this.config.enableVectorStore) {
      await this.vectorStore.add({
        id: newFact.id,
        content: newFact.content,
        embedding: [], // 需要外部生成 embedding
        metadata: {
          type: 'fact',
          source: newFact.source,
          confidence: newFact.confidence,
          tags: newFact.tags
        },
        timestamp: newFact.createdAt
      });
    }

    return newFact;
  }

  /**
   * 存储经验
   */
  async storeExperience(experience: Omit<Experience, 'id' | 'timestamp'>): Promise<Experience> {
    const newExperience: Experience = {
      ...experience,
      id: this.generateId(),
      timestamp: new Date()
    };

    this.longTerm.experiences.push(newExperience);

    // 添加到向量存储
    if (this.config.enableVectorStore) {
      const content = `Situation: ${experience.situation}\nAction: ${experience.action}\nResult: ${experience.result}`;
      await this.vectorStore.add({
        id: newExperience.id,
        content,
        embedding: [], // 需要外部生成 embedding
        metadata: {
          type: 'experience',
          quality: experience.quality
        },
        timestamp: newExperience.timestamp
      });
    }

    return newExperience;
  }

  /**
   * 检索相关记忆
   */
  async retrieve(query: string, topK: number = 5): Promise<VectorMemoryEntry[]> {
    if (!this.config.enableVectorStore) {
      return [];
    }

    return await this.vectorStore.search(query, topK);
  }

  /**
   * 清除短期记忆
   */
  clearShortTerm(): void {
    this.shortTerm.conversationHistory = [];
    this.shortTerm.workingMemory.clear();
  }

  /**
   * 保存到持久化存储
   */
  async persist(): Promise<void> {
    if (!this.config.enableLongTerm) return;

    const key = this.config.persistenceKey || 'ai_memory';
    const data = {
      longTerm: {
        facts: this.longTerm.facts,
        experiences: this.longTerm.experiences,
        preferences: this.longTerm.preferences,
        patterns: this.longTerm.patterns
      },
      timestamp: new Date()
    };

    // 保存到 localStorage（简化实现）
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  /**
   * 从持久化存储加载
   */
  async load(): Promise<void> {
    if (!this.config.enableLongTerm) return;

    const key = this.config.persistenceKey || 'ai_memory';

    // 从 localStorage 加载（简化实现）
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        this.longTerm = parsed.longTerm;
      }
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
