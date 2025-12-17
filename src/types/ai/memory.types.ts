/**
 * AI Memory 类型定义
 * Memory 存储 Agent 的上下文和历史
 */

/**
 * 消息类型
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string; // 函数名或用户名
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * 上下文信息
 */
export interface Context {
  userId?: string;
  sessionId: string;
  conversationId?: string;
  variables: Map<string, any>;
  metadata: Record<string, any>;
}

/**
 * 短期记忆（会话级别）
 */
export interface ShortTermMemory {
  conversationHistory: Message[];
  currentContext: Context;
  workingMemory: Map<string, any>;
  maxMessages?: number; // 最大消息数
}

/**
 * 事实知识
 */
export interface Fact {
  id: string;
  content: string;
  source: string;
  confidence: number; // 0-1
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

/**
 * 经验记录
 */
export interface Experience {
  id: string;
  situation: string; // 情境描述
  action: string; // 采取的行动
  result: string; // 结果
  quality: number; // 质量评分 0-1
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * 用户偏好
 */
export interface Preference {
  key: string;
  value: any;
  confidence: number; // 置信度 0-1
  learnedFrom: string[]; // 从哪些交互中学习
  updatedAt: Date;
}

/**
 * 模式识别
 */
export interface Pattern {
  id: string;
  type: string; // 模式类型
  pattern: string; // 模式描述
  occurrences: number; // 出现次数
  examples: any[]; // 示例
  confidence: number; // 置信度 0-1
  createdAt: Date;
}

/**
 * 长期记忆（持久化）
 */
export interface LongTermMemory {
  facts: Fact[];
  experiences: Experience[];
  preferences: Preference[];
  patterns: Pattern[];
}

/**
 * 向量记忆条目
 */
export interface VectorMemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  timestamp: Date;
}

/**
 * 向量存储接口
 */
export interface IVectorStore {
  /**
   * 添加条目
   */
  add(entry: VectorMemoryEntry): Promise<void>;

  /**
   * 批量添加
   */
  addBatch(entries: VectorMemoryEntry[]): Promise<void>;

  /**
   * 搜索相似条目
   */
  search(query: string | number[], topK: number): Promise<VectorMemoryEntry[]>;

  /**
   * 删除条目
   */
  delete(id: string): Promise<void>;

  /**
   * 清空存储
   */
  clear(): Promise<void>;
}

/**
 * Memory 接口
 */
export interface IMemory {
  shortTerm: ShortTermMemory;
  longTerm: LongTermMemory;
  vectorStore: IVectorStore;

  /**
   * 添加消息到会话历史
   */
  addMessage(message: Message): void;

  /**
   * 获取最近的消息
   */
  getRecentMessages(count: number): Message[];

  /**
   * 存储事实
   */
  storeFact(fact: Omit<Fact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Fact>;

  /**
   * 存储经验
   */
  storeExperience(experience: Omit<Experience, 'id' | 'timestamp'>): Promise<Experience>;

  /**
   * 检索相关记忆
   */
  retrieve(query: string, topK?: number): Promise<VectorMemoryEntry[]>;

  /**
   * 清除短期记忆
   */
  clearShortTerm(): void;

  /**
   * 保存到持久化存储
   */
  persist(): Promise<void>;

  /**
   * 从持久化存储加载
   */
  load(): Promise<void>;
}
