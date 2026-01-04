/**
 * AI 配置文件
 */

import { LLMConfig } from '@frontend/ai/services/LLMService';
import { EmbeddingConfig } from '@frontend/ai/services/EmbeddingService';

/**
 * LLM 配置
 */
export const llmConfig: LLMConfig = {
  provider: 'hunyuan',
  baseURL: 'http://localhost:3001',
  model: 'hunyuan-lite',
  temperature: 0.7,
  maxTokens: 2000,
  timeout: 30000
};

/**
 * Embedding 配置
 */
export const embeddingConfig: EmbeddingConfig = {
  model: 'mini-lm',
  dimensions: 384,
  provider: 'local',
  batchSize: 32
};

/**
 * Vector Store 配置
 */
export const vectorStoreConfig = {
  type: 'in-memory' as 'in-memory' | 'chroma',
  topK: 10,
  // ChromaDB 配置（未来使用）
  chroma: {
    url: 'http://localhost:8000',
    collectionName: '4dnote_vectors'
  }
};

/**
 * Agent 配置
 */
export const agentConfig = {
  // Task Agent
  task: {
    name: 'TaskAgent',
    description: '智能任务管理 Agent',
    memoryConfig: {
      maxShortTermMessages: 50,
      enableLongTerm: true,
      enableVectorStore: true
    }
  },

  // Notes Agent
  notes: {
    name: 'NotesAgent',
    description: '智能笔记管理 Agent',
    memoryConfig: {
      maxShortTermMessages: 100,
      enableLongTerm: true,
      enableVectorStore: true
    }
  },

  // Search Agent
  search: {
    name: 'SearchAgent',
    description: '智能搜索 Agent',
    memoryConfig: {
      maxShortTermMessages: 20,
      enableLongTerm: false,
      enableVectorStore: true
    }
  }
};

/**
 * Tool 配置
 */
export const toolConfig = {
  // OCR Tool
  ocr: {
    provider: 'tencent',
    timeout: 10000,
    retryPolicy: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2
    }
  },

  // QR Code Tool
  qrCode: {
    timeout: 5000,
    retryPolicy: {
      maxRetries: 2,
      initialDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 2
    }
  },

  // ASR Tool
  asr: {
    provider: 'web-speech-api',
    language: 'zh-CN',
    timeout: 30000
  }
};
