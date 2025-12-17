/**
 * AI 模块主入口
 * 导出所有公共 API
 */

// ============ 类型定义 ============
export * from '../types/ai/agent.types';
export * from '../types/ai/tool.types';
export * from '../types/ai/memory.types';
export * from '../types/ai/workflow.types';

// ============ 基础类 ============
export { BaseAgent } from './agents/base/Agent';
export { Memory } from './agents/base/Memory';
export { BaseTool } from './tools/base/Tool';

// ============ 服务 ============
export { LLMService } from './services/LLMService';
export type { LLMConfig, LLMRequest, LLMResponse, LLMProvider } from './services/LLMService';

export { EmbeddingService } from './services/EmbeddingService';
export type { EmbeddingConfig, EmbeddingResult } from './services/EmbeddingService';

export { InMemoryVectorStore, ChromaVectorStore } from './services/VectorStoreService';
export type { VectorStoreConfig } from './services/VectorStoreService';

// ============ 配置 ============
export {
  llmConfig,
  embeddingConfig,
  vectorStoreConfig,
  agentConfig,
  toolConfig
} from '../config/ai.config';
