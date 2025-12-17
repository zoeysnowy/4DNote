/**
 * LLM Service
 * 统一的 LLM 调用服务
 */

/**
 * LLM 提供商类型
 */
export type LLMProvider = 'hunyuan' | 'openai' | 'claude';

/**
 * LLM 配置
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/**
 * LLM 请求参数
 */
export interface LLMRequest {
  prompt?: string;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

/**
 * LLM 响应
 */
export interface LLMResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'error';
  metadata?: Record<string, any>;
}

/**
 * LLM Service 类
 */
export class LLMService {
  private config: LLMConfig;
  private cache: Map<string, LLMResponse> = new Map();

  constructor(config: LLMConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 2000,
      timeout: 30000,
      ...config
    };
  }

  /**
   * 生成文本
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    // 检查缓存
    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 根据 provider 调用不同的 API
    let response: LLMResponse;
    switch (this.config.provider) {
      case 'hunyuan':
        response = await this.callHunyuan(request);
        break;
      case 'openai':
        response = await this.callOpenAI(request);
        break;
      case 'claude':
        response = await this.callClaude(request);
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }

    // 写入缓存
    this.cache.set(cacheKey, response);

    return response;
  }

  /**
   * 调用腾讯混元
   */
  private async callHunyuan(request: LLMRequest): Promise<LLMResponse> {
    const baseURL = this.config.baseURL || 'http://localhost:3001';
    const url = `${baseURL}/v1/chat/completions`;

    const messages = request.messages || [
      { role: 'user' as const, content: request.prompt || '' }
    ];

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model || 'hunyuan-lite',
          messages,
          temperature: request.temperature ?? this.config.temperature,
          max_tokens: request.maxTokens ?? this.config.maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Hunyuan API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        text: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        },
        finishReason: data.choices[0].finish_reason === 'stop' ? 'stop' : 'length',
        metadata: {
          model: data.model,
          created: data.created
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to call Hunyuan: ${error.message}`);
    }
  }

  /**
   * 调用 OpenAI（备用）
   */
  private async callOpenAI(request: LLMRequest): Promise<LLMResponse> {
    // TODO: 实现 OpenAI 调用
    throw new Error('OpenAI provider not implemented yet');
  }

  /**
   * 调用 Claude（备用）
   */
  private async callClaude(request: LLMRequest): Promise<LLMResponse> {
    // TODO: 实现 Claude 调用
    throw new Error('Claude provider not implemented yet');
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(request: LLMRequest): string {
    return JSON.stringify({
      prompt: request.prompt,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens
    });
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}
