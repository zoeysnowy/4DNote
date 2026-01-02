import { parseLocalTimeStringOrNull } from '../../../utils/timeUtils';
/**
 * DashScope AI Provider
 * 
 * 使用阿里云 DashScope API 调用 Qwen 模型（云端）
 * 
 * 优势：
 * - 零安装：无需下载模型
 * - 轻量化：不增加应用体积
 * - 免费额度：新用户 100 万 tokens
 * - 更快：云端 GPU 推理
 * 
 * 定价：
 * - Qwen-Plus: ¥0.004/1k tokens
 * - Qwen-Turbo: ¥0.002/1k tokens
 * 
 * 文档：https://help.aliyun.com/zh/dashscope/
 * 
 * @author Zoey Gong
 */

import { AIProvider, ExtractedEventInfo, AIProviderTestResult } from '../AIProvider.interface';

export interface DashScopeConfig {
  apiKey: string;
  model?: 'qwen-plus' | 'qwen-turbo' | 'qwen-max';
  baseURL?: string;
}

export class DashScopeProvider implements AIProvider {
  public readonly name = 'DashScope';
  private config: DashScopeConfig;

  constructor(config: DashScopeConfig) {
    this.config = {
      model: 'qwen-plus', // 默认使用 qwen-plus（性价比最高）
      baseURL: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      ...config
    };
  }

  /**
   * 检测 API 可用性
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseURL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          input: {
            messages: [
              { role: 'user', content: 'ping' }
            ]
          },
          parameters: {
            max_tokens: 10
          }
        })
      });

      return response.ok;
    } catch (error) {
      console.error('[DashScopeProvider] 可用性检测失败:', error);
      return false;
    }
  }

  /**
   * 测试 API（带详细信息）
   */
  async test(): Promise<AIProviderTestResult> {
    if (!this.config.apiKey) {
      return {
        available: false,
        model: this.config.model!,
        error: 'API Key 未配置。请访问 https://dashscope.console.aliyun.com/ 获取'
      };
    }

    try {
      const response = await fetch(this.config.baseURL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          input: {
            messages: [
              { role: 'user', content: 'Hello' }
            ]
          },
          parameters: {
            max_tokens: 10
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          available: false,
          model: this.config.model!,
          error: errorData.message || `HTTP ${response.status}`
        };
      }

      return {
        available: true,
        model: this.config.model!
      };
    } catch (error: any) {
      return {
        available: false,
        model: this.config.model!,
        error: error.message || '网络错误'
      };
    }
  }

  /**
   * 提取事件信息
   */
  async extractEventInfo(text: string, prompt: string): Promise<ExtractedEventInfo> {
    if (!this.config.apiKey) {
      throw new Error('DashScope API Key 未配置');
    }

    try {
      const response = await fetch(this.config.baseURL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          input: {
            messages: [
              {
                role: 'system',
                content: prompt
              },
              {
                role: 'user',
                content: `请从以下文本中提取事件信息：\n\n${text}`
              }
            ]
          },
          parameters: {
            result_format: 'message', // 返回完整消息
            max_tokens: 2000,
            temperature: 0.1 // 低温度保证稳定输出
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`DashScope API 错误: ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      
      // 解析响应
      const content = data.output?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('API 返回格式错误：缺少 content 字段');
      }

      // 提取 JSON（可能在 markdown 代码块中）
      let jsonText = content.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      // 解析 JSON
      const parsed = JSON.parse(jsonText);

      // 验证必需字段
      if (!parsed.title || !parsed.startTime || !parsed.endTime) {
        throw new Error('提取结果缺少必需字段（title/startTime/endTime）');
      }

      // 验证时间格式
      const startDate = parseLocalTimeStringOrNull(parsed.startTime);
      const endDate = parseLocalTimeStringOrNull(parsed.endTime);
      if (!startDate || !endDate) {
        throw new Error('时间格式无效');
      }

      return {
        title: parsed.title,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        location: parsed.location || undefined,
        attendees: parsed.attendees || [],
        agenda: parsed.agenda || undefined,
        confidence: parsed.confidence || 0.8
      };

    } catch (error: any) {
      console.error('[DashScopeProvider] 提取失败:', error);
      throw new Error(`DashScope 提取失败: ${error.message}`);
    }
  }

  /**
   * 获取 API 使用统计（可选）
   */
  async getUsageStats(): Promise<{ totalTokens: number; cost: number } | null> {
    // DashScope 不直接提供 API 查询用量的接口
    // 需要在控制台查看：https://dashscope.console.aliyun.com/
    return null;
  }
}
