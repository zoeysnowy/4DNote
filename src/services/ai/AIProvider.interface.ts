/**
 * AI Provider 接口定义
 * 
 * 提供统一的 AI 服务抽象，支持多种 AI 模型（Qwen, Gemma 等）
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

/**
 * 从文档中提取的事件信息
 */
export interface ExtractedEventInfo {
  /** 会议/事件标题 */
  title: string;
  
  /** 开始时间（ISO 8601 格式，如 "2024-10-28T14:00:00+08:00"） */
  startTime: string;
  
  /** 结束时间（ISO 8601 格式） */
  endTime: string;
  
  /** 地点（可选） */
  location?: string;
  
  /** 参与方列表 */
  attendees?: Array<{
    name: string;
    email?: string;
    role?: string;
  }>;
  
  /** 详细议程（放到 event.description） */
  agenda?: string;
  
  /** AI 提取的置信度（0-1） */
  confidence: number;
}

/**
 * AI Provider 测试结果
 */
export interface AIProviderTestResult {
  available: boolean;
  model: string;
  error?: string;
}

/**
 * AI Provider 统一接口
 * 
 * 所有 AI 提供商（Ollama、DashScope、Google AI 等）都需要实现此接口
 */
export interface AIProvider {
  /** 提供商名称（用于日志和 UI 显示） */
  name: string;
  
  /**
   * 检查 AI 服务是否可用
   * @returns Promise<boolean> 是否可用
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * 测试 AI 服务（带详细信息）
   * @returns Promise<AIProviderTestResult> 测试结果
   */
  test?(): Promise<AIProviderTestResult>;
  
  /**
   * 从文本中提取事件信息
   * @param text - 待提取的文本内容
   * @param prompt - AI 提示词
   * @returns Promise<ExtractedEventInfo> 提取的事件信息
   */
  extractEventInfo(text: string, prompt: string): Promise<ExtractedEventInfo>;
}
