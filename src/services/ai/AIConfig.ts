/**
 * AI 配置管理器
 * 
 * 管理 AI 模型配置、地区检测和用户偏好设置
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import { formatTimeForStorage } from '@frontend/utils/timeUtils';

export interface AIConfig {
  /** 提供商类型 */
  provider: 'ollama' | 'dashscope' | 'hunyuan' | 'google-ai' | 'doubao';
  
  /** 当前使用的模型 */
  currentModel: 'qwen' | 'gemma';
  
  /** Ollama 服务地址 */
  ollamaBaseUrl: string;
  
  /** Ollama Qwen 模型版本 */
  ollamaQwenModel: string;
  
  /** Ollama Gemma 模型版本 */
  ollamaGemmaModel: string;
  
  /** DashScope API Key */
  dashscopeApiKey?: string;
  
  /** DashScope 模型版本 */
  dashscopeModel?: 'qwen-plus' | 'qwen-turbo' | 'qwen-max';
  
  /** 腾讯混元 SecretId */
  hunyuanSecretId?: string;
  
  /** 腾讯混元 SecretKey */
  hunyuanSecretKey?: string;
  
  /** 腾讯混元模型版本 */
  hunyuanModel?: 'hunyuan-lite' | 'hunyuan-standard' | 'hunyuan-pro';
  
  /** Google AI API Key（未来支持） */
  googleAIApiKey?: string;
  
  /** 豆包/元宝 API Key（字节跳动） */
  doubaoApiKey?: string;
  
  /** 豆包/元宝模型版本 */
  doubaoModel?: 'doubao-pro-4k' | 'doubao-pro-32k' | 'doubao-lite-4k' | 'doubao-lite-32k';
  
  /** 是否自动检测地区 */
  autoDetectRegion: boolean;
  
  /** 手动指定地区（覆盖自动检测） */
  manualRegion?: 'china' | 'global';
  
  /** 检测到的地区 */
  region: 'china' | 'global';
}

/**
 * API 配置预设（用于快速切换）
 */
export interface APIPreset {
  id: string;
  name: string;
  provider: 'dashscope' | 'hunyuan' | 'doubao';
  dashscopeApiKey?: string;
  dashscopeModel?: 'qwen-plus' | 'qwen-turbo' | 'qwen-max';
  hunyuanSecretId?: string;
  hunyuanSecretKey?: string;
  hunyuanModel?: 'hunyuan-lite' | 'hunyuan-standard' | 'hunyuan-pro';
  doubaoApiKey?: string;
  doubaoModel?: 'doubao-pro-4k' | 'doubao-pro-32k' | 'doubao-lite-4k' | 'doubao-lite-32k';
  createdAt: string;
}

/**
 * AI 配置管理器
 * 
 * 使用示例：
 * ```typescript
 * // 获取配置
 * const config = AIConfigManager.getConfig();
 * 
 * // 保存配置
 * AIConfigManager.saveConfig({ currentModel: 'gemma' });
 * 
 * // 检测地区
 * const region = await AIConfigManager.detectRegion(); // 'china' | 'global'
 * 
 * // 获取推荐模型
 * const model = await AIConfigManager.getRecommendedModel(); // 'qwen' | 'gemma'
 * ```
 */
export class AIConfigManager {
  private static readonly STORAGE_KEY = '4dnote-ai-config';

  /**
   * 获取默认配置
   */
  static getDefaultConfig(): AIConfig {
    const region = AIConfigManager.detectRegionSync();
    
    return {
      provider: region === 'china' ? 'dashscope' : 'ollama', // 中国默认云端
      currentModel: region === 'china' ? 'qwen' : 'gemma',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaQwenModel: 'qwen2.5:7b',
      ollamaGemmaModel: 'gemma2:9b',
      dashscopeApiKey: undefined,
      dashscopeModel: 'qwen-plus',
      autoDetectRegion: true,
      region
    };
  }

  /**
   * 获取用户配置（合并默认配置）
   */
  static getConfig(): AIConfig {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...this.getDefaultConfig(), ...parsed };
      }
    } catch (error) {
      console.error('[AIConfig] 读取配置失败:', error);
    }
    return this.getDefaultConfig();
  }

  /**
   * 保存配置（增量更新）
   */
  static saveConfig(config: Partial<AIConfig>): void {
    try {
      const current = this.getConfig();
      const updated = { ...current, ...config };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('[AIConfig] 保存配置失败:', error);
      throw new Error('配置保存失败，请检查浏览器存储');
    }
  }

  /**
   * 重置为默认配置
   */
  static resetConfig(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('[AIConfig] 重置配置失败:', error);
    }
  }

  /**
   * 自动检测用户所在地区（同步版本）
   */
  static detectRegionSync(): 'china' | 'global' {
    try {
      // 方法1：检测时区
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (
        timezone.includes('Shanghai') || 
        timezone.includes('Beijing') || 
        timezone.includes('Chongqing') ||
        timezone.includes('Asia/Shanghai')
      ) {
        return 'china';
      }

      // 方法2：检测浏览器语言
      const language = navigator.language;
      if (language.startsWith('zh')) {
        return 'china';
      }

      return 'global';
    } catch (error) {
      return 'china'; // 保守策略：默认中国
    }
  }

  /**
   * 自动检测用户所在地区
   * 
   * 检测逻辑：
   * 1. 检查时区（Asia/Shanghai, Asia/Beijing）
   * 2. 检查浏览器语言（zh-CN）
   * 3. 默认返回 'china'
   * 
   * @returns 'china' 或 'global'
   */
  static async detectRegion(): Promise<'china' | 'global'> {
    return this.detectRegionSync();
  }

  /**
   * 根据地区获取推荐模型
   * 
   * 推荐规则：
   * - 中国地区：Qwen 2.5（中文优化）
   * - 海外地区：Gemma 2（开源 Gemini）
   */
  static async getRecommendedModel(): Promise<'qwen' | 'gemma'> {
    const config = this.getConfig();
    
    // 如果用户手动指定了地区，优先使用
    if (!config.autoDetectRegion && config.manualRegion) {
      return config.manualRegion === 'china' ? 'qwen' : 'gemma';
    }

    // 自动检测地区
    const region = await this.detectRegion();
    const recommendedModel = region === 'china' ? 'qwen' : 'gemma';
      // console.log(`[AIConfig] 推荐模型: ${recommendedModel} (基于地区: ${region})`);
    return recommendedModel;
  }

  /**
   * 获取当前模型的完整名称（包括版本号）
   */
  static getCurrentModelName(): string {
    const config = this.getConfig();
    return config.currentModel === 'qwen' ? config.ollamaQwenModel : config.ollamaGemmaModel;
  }

  /**
   * 检查配置是否有效
   */
  static validateConfig(): { valid: boolean; errors: string[] } {
    const config = this.getConfig();
    const errors: string[] = [];

    // 验证 Ollama 地址
    if (!config.ollamaBaseUrl) {
      errors.push('Ollama 服务地址未配置');
    } else if (!config.ollamaBaseUrl.startsWith('http')) {
      errors.push('Ollama 服务地址必须以 http 或 https 开头');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // ==================== API 预设管理 ====================
  
  private static readonly PRESETS_KEY = '4dnote-ai-presets';
  
  /**
   * 获取所有 API 预设
   */
  static getPresets(): APIPreset[] {
    try {
      const saved = localStorage.getItem(this.PRESETS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('[AIConfig] 读取预设失败:', error);
    }
    return [];
  }
  
  /**
   * 保存新的 API 预设
   */
  static savePreset(preset: Omit<APIPreset, 'id' | 'createdAt'>): APIPreset {
    try {
      const presets = this.getPresets();
      const newPreset: APIPreset = {
        ...preset,
        id: `preset-${Date.now()}`,
        createdAt: formatTimeForStorage(new Date())
      };
      
      presets.push(newPreset);
      localStorage.setItem(this.PRESETS_KEY, JSON.stringify(presets));
      return newPreset;
    } catch (error) {
      console.error('[AIConfig] 保存预设失败:', error);
      throw new Error('预设保存失败');
    }
  }
  
  /**
   * 删除预设
   */
  static deletePreset(id: string): void {
    try {
      const presets = this.getPresets();
      const filtered = presets.filter(p => p.id !== id);
      localStorage.setItem(this.PRESETS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('[AIConfig] 删除预设失败:', error);
      throw new Error('预设删除失败');
    }
  }
  
  /**
   * 应用预设到当前配置
   */
  static applyPreset(preset: APIPreset): void {
    try {
      const update: Partial<AIConfig> = {
        provider: preset.provider
      };
      
      if (preset.provider === 'dashscope') {
        update.dashscopeApiKey = preset.dashscopeApiKey;
        update.dashscopeModel = preset.dashscopeModel;
      } else if (preset.provider === 'hunyuan') {
        update.hunyuanSecretId = preset.hunyuanSecretId;
        update.hunyuanSecretKey = preset.hunyuanSecretKey;
        update.hunyuanModel = preset.hunyuanModel;
      } else if (preset.provider === 'doubao') {
        update.doubaoApiKey = preset.doubaoApiKey;
        update.doubaoModel = preset.doubaoModel;
      }
      
      this.saveConfig(update);
    } catch (error) {
      console.error('[AIConfig] 应用预设失败:', error);
      throw new Error('应用预设失败');
    }
  }
}
