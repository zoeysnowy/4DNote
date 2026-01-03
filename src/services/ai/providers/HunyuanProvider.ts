import { formatTimeForStorage, parseLocalTimeStringOrNull } from '../../../utils/timeUtils';
/**
 * Tencent Hunyuan AI Provider
 * 
 * 支持两种模式：
 * 1. 代理模式（推荐）：通过本地代理服务器调用，解决 CORS 限制 ✅
 * 2. 直连模式：直接调用腾讯云 API（仅服务器端可用）
 * 
 * 使用代理模式：
 * 1. 启动代理: cd ai-proxy && npm start
 * 2. 配置 useProxy = true
 * 3. 前端正常调用，无 CORS 错误
 * 
 * 优势：
 * - 免费额度：10 万 tokens/月（可持续）
 * - 中文优化：腾讯自研，中文理解强
 * - 速度快：国内服务器，延迟低
 * - 稳定性高：腾讯云基础设施
 * 
 * @author Zoey Gong
 */

import { AIProvider, ExtractedEventInfo, AIProviderTestResult } from '../AIProvider.interface';
import { checkProxyHealth, getProxyStartInstructions } from '../../../utils/proxyHelper';

export interface HunyuanConfig {
  secretId: string;
  secretKey: string;
  model?: 'hunyuan-lite' | 'hunyuan-standard' | 'hunyuan-pro';
  region?: string;
  useProxy?: boolean;  // 是否使用代理模式
  proxyUrl?: string;   // 代理服务器地址
}

export class HunyuanProvider implements AIProvider {
  public readonly name = 'Hunyuan';
  private config: HunyuanConfig;
  private endpoint: string;

  constructor(config: HunyuanConfig) {
    this.config = {
      model: 'hunyuan-lite',
      region: 'ap-guangzhou',
      useProxy: true,  // 默认使用代理模式
      proxyUrl: 'http://localhost:3001/api/hunyuan',
      ...config
    };
    
    this.endpoint = this.config.useProxy 
      ? this.config.proxyUrl! 
      : 'https://hunyuan.tencentcloudapi.com/';
    
    // 输出模式信息
    if (this.config.useProxy) {
      console.log(
        `[HunyuanProvider] 🔄 使用代理模式\n` +
        `代理地址: ${this.endpoint}\n` +
        `确保代理服务器已启动: cd ai-proxy && npm start`
      );
    } else {
      console.warn(
        '[HunyuanProvider] ⚠️ 使用直连模式（浏览器会遇到 CORS 错误）\n' +
        '推荐启用代理模式: useProxy: true'
      );
    }
  }

  /**
   * 生成腾讯云 API 签名（V3）
   */
  private async generateSignature(payload: string, timestamp: number): Promise<string> {
    const service = 'hunyuan';
    const date = formatTimeForStorage(new Date(timestamp * 1000)).split(' ')[0];
    const algorithm = 'TC3-HMAC-SHA256';
    
    // 简化版签名（实际应用中需要完整实现）
    // 这里使用 Authorization header 方式
    const authorization = `TC3-HMAC-SHA256 Credential=${this.config.secretId}/${date}/${service}/tc3_request`;
    
    return authorization;
  }

  /**
   * 调用腾讯云 API（支持代理模式）
   */
  private async callAPI(messages: Array<{ role: string; content: string }>, maxTokens: number = 2000): Promise<any> {
    if (this.config.useProxy) {
      // 代理模式：通过本地代理服务器调用
      return this.callViaProxy(messages, maxTokens);
    } else {
      // 直连模式：直接调用腾讯云 API（浏览器会遇到 CORS）
      return this.callDirectly(messages, maxTokens);
    }
  }
  
  /**
   * 通过代理服务器调用（解决 CORS 问题）
   */
  private async callViaProxy(messages: Array<{ role: string; content: string }>, maxTokens: number): Promise<any> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          secretId: this.config.secretId,
          secretKey: this.config.secretKey,
          model: this.config.model,
          messages,
          topP: 0.7,           // 降低随机性（原 0.8）
          temperature: 0.05    // 极低温度，追求稳定输出（原 0.1）
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      // 检测是否是网络连接失败
      if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
        // 检查代理服务器健康状态
        const isProxyHealthy = await checkProxyHealth(this.endpoint);
        
        if (!isProxyHealthy) {
          const instructions = getProxyStartInstructions(this.endpoint);
          throw new Error(instructions);
        }
        
        // 代理健康但请求失败，可能是其他网络问题
        throw new Error(
          '网络请求失败\n\n' +
          '可能原因：\n' +
          '1. 代理服务器刚启动，请稍等片刻后重试\n' +
          '2. 网络连接不稳定\n' +
          '3. 防火墙拦截\n\n' +
          `代理地址: ${this.endpoint}`
        );
      }
      throw new Error(`腾讯混元 API 调用失败: ${error.message}`);
    }
  }
  
  /**
   * 直接调用腾讯云 API（仅服务器端可用）
   */
  private async callDirectly(messages: Array<{ role: string; content: string }>, maxTokens: number): Promise<any> {
    throw new Error(
      '⚠️ 直连模式在浏览器中不可用（CORS 限制）\n\n' +
      '解决方案：\n' +
      '1. 启用代理模式（推荐）\n' +
      '2. 启动代理服务器: cd ai-proxy && npm start\n' +
      '3. 配置 useProxy: true'
    );
  }

  /**
   * 检测 API 可用性
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.test();
      return result.available;
    } catch (error) {
      return false;
    }
  }

  /**
   * 测试 API（带详细信息）
   */
  async test(): Promise<AIProviderTestResult> {
    if (!this.config.secretId || !this.config.secretKey) {
      return {
        available: false,
        model: this.config.model!,
        error: 'SecretId 或 SecretKey 未配置。\n\n请访问：https://console.cloud.tencent.com/cam/capi'
      };
    }

    try {
      await this.callAPI([
        { role: 'user', content: 'Hello' }
      ], 10);

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
    if (!this.config.secretId || !this.config.secretKey) {
      throw new Error('腾讯混元 SecretId/SecretKey 未配置');
    }

    try {
      const response = await this.callAPI([
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: `请从以下文本中提取事件信息：\n\n${text}`
        }
      ]);

      // 调试：打印完整响应
      console.log('[HunyuanProvider] API 响应:', JSON.stringify(response, null, 2));

      // 解析响应
      const content = response.Response?.Choices?.[0]?.Message?.Content;
      if (!content) {
        console.error('[HunyuanProvider] 响应结构:', {
          hasResponse: !!response.Response,
          hasChoices: !!response.Response?.Choices,
          choicesLength: response.Response?.Choices?.length,
          firstChoice: response.Response?.Choices?.[0],
          rawResponse: response
        });
        throw new Error('API 返回格式错误：缺少 content 字段');
      }

      // 提取 JSON（可能在 markdown 代码块中）
      let jsonText = content.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      // 解析 JSON（处理可能的转义问题）
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (error) {
        // 如果解析失败，尝试修复常见的 JSON 格式问题
        console.log('[HunyuanProvider] 原始 JSON 解析失败，尝试修复...');
        
        // 修复策略：在字符串值内部的真实换行符前添加转义
        // 使用正则表达式找到所有字符串值，并替换其中的换行符
        const fixedJsonText = jsonText.replace(
          /"([^"]*(?:\\"[^"]*)*)"/g,
          (match: string, p1: string) => {
            // 替换字符串内部的真实换行符为 \n
            const fixed = p1.replace(/\n/g, '\\n').replace(/\r/g, '');
            return `"${fixed}"`;
          }
        );
        
        console.log('[HunyuanProvider] 修复后的 JSON:', fixedJsonText.substring(0, 200) + '...');
        
        try {
          parsed = JSON.parse(fixedJsonText);
          console.log('[HunyuanProvider] ✅ JSON 修复成功');
        } catch (retryError) {
          console.error('[HunyuanProvider] ❌ JSON 修复失败:', retryError);
          // 如果还是失败，抛出原始错误
          throw error;
        }
      }

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
        confidence: parsed.confidence || 0.85
      };

    } catch (error: any) {
      console.error('[HunyuanProvider] 提取失败:', error);
      throw new Error(`腾讯混元提取失败: ${error.message}`);
    }
  }
}
