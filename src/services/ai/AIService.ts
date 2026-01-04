/**
 * AI 服务
 * 
 * 协调 PDF 解析和 AI 提取，提供统一的事件提取接口
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import { AIProvider, ExtractedEventInfo } from './AIProvider.interface';
import { OllamaProvider } from './providers/OllamaProvider';
import { DashScopeProvider } from './providers/DashScopeProvider';
import { HunyuanProvider } from './providers/HunyuanProvider';
import { AIConfigManager } from './AIConfig';
import { PDFParserService } from '@backend/PDFParserService';
import { EVENT_EXTRACTION_PROMPT } from '@frontend/constants/ai/prompts';

/**
 * AI 服务
 * 
 * 使用示例：
 * ```typescript
 * const aiService = new AIService();
 * 
 * // 测试可用性
 * const test = await aiService.testAvailability();
 * if (test.available) {
 *   // 提取事件信息
 *   const file = event.target.files[0];
 *   const result = await aiService.extractEventFromDocument(file);
 *   console.log('提取结果:', result);
 * }
 * ```
 */
export class AIService {
  private provider: AIProvider | null = null;

  /**
   * 初始化 AI Provider（懒加载）
   * 
   * 根据用户配置和地区自动选择最佳模型
   */
  private async initializeProvider(): Promise<AIProvider> {
    // 如果已初始化，直接返回
    if (this.provider) {
      return this.provider;
    }
    // 1. 读取配置
    const config = AIConfigManager.getConfig();
    
    // 2. 根据 provider 类型创建实例
    if (config.provider === 'dashscope') {
      // 使用 DashScope 云端 API
      if (!config.dashscopeApiKey) {
        console.warn('[AIService] DashScope API Key 未配置，尝试降级到本地 ai-proxy...');
        // 降级到本地 ai-proxy（混元）
        return await this.fallbackToLocalProxy();
      }

      this.provider = new DashScopeProvider({
        apiKey: config.dashscopeApiKey,
        model: config.dashscopeModel || 'qwen-plus'
      });
    } else if (config.provider === 'hunyuan') {
      // 使用腾讯混元云端 API
      if (!config.hunyuanSecretId || !config.hunyuanSecretKey) {
        console.warn('[AIService] 腾讯混元密钥未配置，尝试降级到本地 ai-proxy...');
        // 降级到本地 ai-proxy
        return await this.fallbackToLocalProxy();
      }

      this.provider = new HunyuanProvider({
        secretId: config.hunyuanSecretId,
        secretKey: config.hunyuanSecretKey,
        model: config.hunyuanModel || 'hunyuan-lite'
      });
    } else {
      // 使用 Ollama 本地服务
      const modelName = config.currentModel === 'qwen' 
        ? config.ollamaQwenModel 
        : config.ollamaGemmaModel;
      
      this.provider = new OllamaProvider({
        baseUrl: config.ollamaBaseUrl,
        model: modelName,
        name: `Ollama (${modelName})`
      });

      // 检查本地模型可用性
      const available = await this.provider.isAvailable();
      if (!available) {
        const errorMessage = 
          `模型 ${modelName} 不可用。请按以下步骤操作：\n\n` +
          `1. 安装 Ollama: https://ollama.ai/download\n` +
          `2. 启动服务: ollama serve\n` +
          `3. 下载模型: ollama pull ${modelName}\n\n` +
          `当前配置: ${config.ollamaBaseUrl}\n\n` +
          `💡 提示：如果不想下载模型，可以在配置中切换到云端服务（DashScope 或腾讯混元）。`;
        
        throw new Error(errorMessage);
      }
    }

    return this.provider;
  }

  /**
   * 降级到本地 ai-proxy（混元代理）
   */
  private async fallbackToLocalProxy(): Promise<AIProvider> {
    console.log('[AIService] 🔄 使用本地 ai-proxy (http://localhost:3001)...');
    
    // 创建一个临时的混元 Provider，使用代理服务器
    const proxyProvider = new HunyuanProvider({
      secretId: 'proxy',  // 代理模式，不需要真实密钥
      secretKey: 'proxy',
      model: 'hunyuan-lite',
      useProxy: true,
      proxyUrl: 'http://localhost:3001/api/hunyuan'
    });

    // 检查代理是否可用
    try {
      const available = await proxyProvider.isAvailable();
      if (!available) {
        throw new Error('代理不可用');
      }
    } catch (error) {
      throw new Error(
        '本地 ai-proxy 不可用。\n\n' +
        '请按以下步骤操作：\n' +
        '1. 打开终端，进入 ai-proxy 目录\n' +
        '2. 运行: npm install\n' +
        '3. 运行: node proxy-server.js\n' +
        '4. 确保服务运行在 http://localhost:3001\n\n' +
        '或者，你也可以配置云端 API Key：\n' +
        '- DashScope: https://dashscope.console.aliyun.com/apiKey\n' +
        '- 腾讯混元: https://console.cloud.tencent.com/cam/capi'
      );
    }

    this.provider = proxyProvider;
    console.log('[AIService] ✅ 本地 ai-proxy 已连接');
    return this.provider;
  }

  /**
   * 从文档中提取事件信息
   * 
   * @param file - PDF 或文本文件
   * @returns 提取的事件信息
   * @throws Error 如果文件类型不支持或处理失败
   */
  async extractEventFromDocument(file: File): Promise<ExtractedEventInfo> {
      // console.log('[AIService] 文件大小:', (file.size / 1024).toFixed(2), 'KB');

    // 1. 解析文件内容
    let text: string;
    try {
      if (PDFParserService.isPDF(file)) {
        text = await PDFParserService.extractText(file);
      } else if (PDFParserService.isTextFile(file)) {
        text = await file.text();
      } else {
        throw new Error(
          `不支持的文件类型: ${file.type}\n` +
          `支持的格式: ${PDFParserService.getSupportedFormats()}`
        );
      }
    } catch (error) {
      console.error('[AIService] ❌ 文件解析失败:', error);
      throw error;
    }

    // 2. 验证文本内容
    const trimmedText = text.trim();
    if (trimmedText.length < 10) {
      throw new Error('文件内容为空或过短（少于10个字符），无法提取有效信息');
    }
    // 3. 初始化 AI Provider
    let provider: AIProvider;
    try {
      provider = await this.initializeProvider();
    } catch (error) {
      console.error('[AIService] ❌ AI Provider 初始化失败:', error);
      throw error;
    }

    // 4. 调用 AI 提取信息
    const startTime = Date.now();

    try {
      const result = await provider.extractEventInfo(trimmedText, EVENT_EXTRACTION_PROMPT);
      const elapsed = Date.now() - startTime;
      return result;
    } catch (error) {
      console.error('[AIService] ❌ AI 提取失败:', error);
      throw error;
    }
  }

  /**
   * 从文本中提取事件信息（直接使用文本）
   * 
   * @param text - 文本内容
   * @param prompt - 自定义提示词（可选）
   * @returns 提取的事件信息
   */
  async extractEventInfo(text: string, prompt?: string): Promise<ExtractedEventInfo> {
    // 1. 验证文本内容
    const trimmedText = text.trim();
    if (trimmedText.length < 10) {
      throw new Error('文本内容为空或过短（少于10个字符），无法提取有效信息');
    }

    // 2. 初始化 AI Provider
    let provider: AIProvider;
    try {
      provider = await this.initializeProvider();
    } catch (error) {
      console.error('[AIService] ❌ AI Provider 初始化失败:', error);
      throw error;
    }

    // 3. 调用 AI 提取信息
    const startTime = Date.now();

    try {
      const result = await provider.extractEventInfo(
        trimmedText, 
        prompt || EVENT_EXTRACTION_PROMPT
      );
      const elapsed = Date.now() - startTime;
      console.log(`[AIService] ✅ AI 提取完成，耗时: ${elapsed}ms`);
      return result;
    } catch (error) {
      console.error('[AIService] ❌ AI 提取失败:', error);
      throw error;
    }
  }

  /**
   * 测试 AI 可用性
   * 
   * @returns 测试结果
   */
  async testAvailability(): Promise<{
    available: boolean;
    model: string;
    error?: string;
  }> {
    try {
      const provider = await this.initializeProvider();
      return {
        available: true,
        model: provider.name
      };
    } catch (error) {
      return {
        available: false,
        model: 'unknown',
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 重新初始化 Provider（用于切换模型）
   */
  resetProvider(): void {
    this.provider = null;
  }

  /**
   * 获取当前使用的模型名称
   */
  getCurrentModel(): string {
    return AIConfigManager.getCurrentModelName();
  }
}
