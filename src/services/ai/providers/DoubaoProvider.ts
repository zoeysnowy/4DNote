/**
 * 元宝/豆包 AI Provider（字节跳动）
 * 用于 RAG 系统的 Embedding 和检索
 * 
 * API 文档: https://www.volcengine.com/docs/82379/1263482
 * 兼容 OpenAI API 格式
 */

import OpenAI from 'openai';
import { AIConfigManager } from '../AIConfig';

export interface DoubaoEmbeddingOptions {
  model?: string;
  apiKey?: string;
}

export interface DoubaoSearchOptions {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 元宝 AI Provider
 */
export class DoubaoProvider {
  private client: OpenAI | null = null;
  private apiKey: string;
  private baseURL = 'https://ark.cn-beijing.volces.com/api/v3';
  
  constructor(apiKey?: string) {
    const config = AIConfigManager.getConfig();
    this.apiKey = apiKey || config.doubaoApiKey || '';
    
    if (this.apiKey) {
      this.initClient();
    }
  }
  
  /**
   * 初始化 OpenAI 客户端（元宝兼容 OpenAI API）
   */
  private initClient() {
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      dangerouslyAllowBrowser: true // 浏览器环境
    });
  }
  
  /**
   * 生成文本 Embedding
   */
  async generateEmbedding(
    text: string, 
    options?: DoubaoEmbeddingOptions
  ): Promise<number[]> {
    if (!this.client) {
      if (options?.apiKey) {
        this.apiKey = options.apiKey;
        this.initClient();
      } else {
        throw new Error('元宝 API Key 未配置');
      }
    }
    
    try {
      const response = await this.client!.embeddings.create({
        model: options?.model || 'doubao-embedding',
        input: text
      });
      
      return response.data[0].embedding;
      
    } catch (error: any) {
      console.error('[DoubaoProvider] Embedding 生成失败:', error);
      throw new Error(`Embedding 生成失败: ${error.message}`);
    }
  }
  
  /**
   * 批量生成 Embeddings
   */
  async generateEmbeddings(
    texts: string[],
    options?: DoubaoEmbeddingOptions
  ): Promise<number[][]> {
    if (!this.client) {
      if (options?.apiKey) {
        this.apiKey = options.apiKey;
        this.initClient();
      } else {
        throw new Error('元宝 API Key 未配置');
      }
    }
    
    try {
      const response = await this.client!.embeddings.create({
        model: options?.model || 'doubao-embedding',
        input: texts
      });
      
      return response.data.map(item => item.embedding);
      
    } catch (error: any) {
      console.error('[DoubaoProvider] 批量 Embedding 生成失败:', error);
      throw new Error(`批量 Embedding 生成失败: ${error.message}`);
    }
  }
  
  /**
   * AI 对话（用于检索增强）
   */
  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: DoubaoSearchOptions
  ): Promise<string> {
    if (!this.client) {
      if (options?.apiKey) {
        this.apiKey = options.apiKey;
        this.initClient();
      } else {
        throw new Error('元宝 API Key 未配置');
      }
    }
    
    const config = AIConfigManager.getConfig();
    
    try {
      const response = await this.client!.chat.completions.create({
        model: options?.model || config.doubaoModel || 'doubao-pro-4k',
        messages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 2000
      });
      
      return response.choices[0].message.content || '';
      
    } catch (error: any) {
      console.error('[DoubaoProvider] 对话失败:', error);
      throw new Error(`对话失败: ${error.message}`);
    }
  }
  
  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
    this.initClient();
  }
  
  /**
   * 检查配置是否有效
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// 导出单例实例
export const doubaoProvider = new DoubaoProvider();
