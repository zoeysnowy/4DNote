/**
 * EventNode - 事件节点类型定义
 * 
 * 用于 AI 检索的扁平化存储结构。
 * 每个 Event 的 eventlog 中的每个 paragraph 节点都会拆分为一条 EventNode 记录。
 * 
 * 核心设计原则：
 * 1. 扁平化 (Flattening)：每个节点独立存储
 * 2. 携带上下文 (Context-Enriched)：embedding_text 包含父级信息
 * 3. 精确定位：通过 timestamp 精确跳转
 * 
 * @version 2.19.0
 * @author Zoey Gong
 */

export interface EventNode {
  // 1. 唯一标识符
  id: string;
  
  // 2. 父级关联（用于点击搜索结果跳转回原来的卡片）
  eventId: string;
  eventTitle: string;  // 冗余存储，便于检索时直接显示
  
  // 3. AI 检索核心字段
  /**
   * 用于 Embedding 的混合文本
   * 格式：[事件标题] - [时间] - [节点内容]
   * 例如：产品周会纪要 - 10:15 - 讨论了下个季度的服务器预算问题
   */
  embeddingText: string;
  
  // 4. 原始内容（UI 展示用）
  /**
   * 节点的纯文本内容
   * 例如：讨论了下个季度的服务器预算问题
   */
  content: string;
  
  /**
   * Slate 节点的原始 JSON（用于编辑和精确渲染）
   * 包含格式化信息、行内样式等
   */
  slateNode?: any;
  
  // 5. 时间戳元数据（用于精确定位和过滤）
  /**
   * 节点的创建时间（TimeSpec 格式：YYYY-MM-DD HH:mm:ss）
   * 用于精确跳转和时间过滤
   * @deprecated 使用 paragraphCreatedAt 代替（保留用于向后兼容）
   */
  timestamp: string;
  
  /**
   * 日期（YYYY-MM-DD）
   * 用于按天过滤
   */
  day: string;
  
  /**
   * 段落的创建时间（TimeSpec 格式：YYYY-MM-DD HH:mm:ss）
   * 来源：slateJson paragraph.createdAt（Block-Level Timestamp）
   */
  paragraphCreatedAt: string;
  
  /**
   * 段落的最后修改时间（TimeSpec 格式：YYYY-MM-DD HH:mm:ss）
   * 来源：slateJson paragraph.updatedAt（Block-Level Timestamp）
   */
  paragraphUpdatedAt: string;
  
  /**
   * EventNode 记录的最后修改时间
   * （区分于段落的修改时间，用于追踪 Node 记录本身的更新）
   */
  nodeUpdatedAt: string;
  
  /**
   * @deprecated 使用 nodeUpdatedAt 代替（保留用于向后兼容）
   */
  updatedAt?: string;
  
  // 6. 分类和标签（继承自父 Event）
  tags?: string[];
  
  /**
   * 节点类型
   * - paragraph: 普通段落
   * - code: 代码块
   * - quote: 引用
   */
  type: 'paragraph' | 'code' | 'quote' | 'list-item';
  
  // 7. 向量检索字段（Supabase pgvector）
  /**
   * embedding 向量（由 AI 服务生成）
   */
  embedding?: number[];
  
  // 8. 元数据
  /**
   * 节点在 Event 内的顺序（用于恢复原始顺序）
   */
  position: number;
  
  /**
   * 所属的 Block ID（对应 paragraph.id）
   */
  blockId?: string;
  
  /**
   * 创建来源
   */
  source?: '4dnote' | 'outlook' | 'google' | 'local';
}

/**
 * EventNode 创建参数
 */
export interface CreateEventNodeInput {
  eventId: string;
  eventTitle: string;
  content: string;
  timestamp: string;
  paragraphCreatedAt?: string;  // 🆕 段落创建时间
  paragraphUpdatedAt?: string;  // 🆕 段落修改时间
  position: number;
  slateNode?: any;
  tags?: string[];
  type?: EventNode['type'];
  blockId?: string;
  source?: EventNode['source'];
}

/**
 * EventNode 更新参数
 */
export interface UpdateEventNodeInput {
  content?: string;
  timestamp?: string;
  embeddingText?: string;
  slateNode?: any;
  tags?: string[];
  updatedAt?: string;
}

/**
 * EventNode 查询参数
 */
export interface QueryEventNodesInput {
  eventId?: string;
  timeRange?: {
    start: string;
    end: string;
  };
  tags?: string[];
  type?: EventNode['type'];
  limit?: number;
  offset?: number;
}
