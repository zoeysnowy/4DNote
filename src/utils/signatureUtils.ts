/**
 * 签名工具类 - 统一的事件签名处理
 * 
 * 职责：
 * 1. 签名格式定义和识别
 * 2. 签名添加/移除/提取
 * 3. 时间戳和创建者信息解析
 * 
 * 支持的签名来源：
 * - 🔮 4DNote（本地创建）
 * - 📧 Outlook（外部日历同步）
 * 
 * @author 4DNote Team
 * @date 2025-12-16
 */

import { formatTimeForStorage, parseLocalTimeString } from './timeUtils';

export type SignatureSource = '4dnote' | 'outlook';
export type SignatureEmoji = '🔮' | '📧';

export interface SignatureInfo {
  createdAt?: string;           // 创建时间（TimeSpec 格式）
  updatedAt?: string;           // 最后修改时间（TimeSpec 格式）
  fourDNoteSource?: boolean;    // 是否由 4DNote 创建
  source?: 'local' | 'outlook'; // 来源类型
}

/**
 * 统一的签名处理工具类
 */
export class SignatureUtils {
  // ==================== 签名格式正则 ====================
  
  /**
   * 签名段落识别正则（支持所有来源和格式）
   * 匹配：
   * - 由 🔮 4DNote 创建于 2025-12-15 10:00:00
   * - 由 📧 Outlook 创建于 2025-12-15 10:00:00
   * - 由 � ReMarkable 创建于 2025-12-15 10:00:00
   * - 由 🔮 4DNote 编辑于 2025-12-15 10:00:00
   * - 由 📧 Outlook 最后修改于 2025-12-15 10:00:00
   * - 带/不带 --- 分隔线
   */
  private static readonly SIGNATURE_PATTERN = 
    /^(?:---\s*)?由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;

  /**
   * 创建时间提取正则
   */
  private static readonly CREATE_TIME_PATTERN = 
    /由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*创建于\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i;

  /**
   * 修改时间提取正则
   */
  private static readonly UPDATE_TIME_PATTERN = 
    /(?:最后修改于|最后编辑于|编辑于)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i;

  /**
   * 创建者提取正则
   */
  private static readonly CREATOR_PATTERN = 
    /由\s+(?:🔮|📧|🟣)?\s*(4DNote|Outlook|ReMarkable)\s*创建于/i;

  // ==================== 核心方法 ====================

  /**
   * 检查文本段落是否为签名
   * @param text - 段落文本
   * @returns true 如果是签名段落
   */
  static isSignatureParagraph(text: string): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    
    // 只有分隔线不算签名
    if (trimmed === '---') return false;
    
    // 检查是否匹配签名格式
    if (this.SIGNATURE_PATTERN.test(trimmed)) {
      return true;
    }
    
    // 检查合并签名格式（创建 + 修改）
    if (/^由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*创建于.*，最后(?:修改|编辑)于/.test(trimmed)) {
      return true;
    }
    
    return false;
  }

  /**
   * 从文本中提取核心内容（移除签名）
   * @param description - 原始 description（可能包含签名）
   * @returns 去除签名的核心内容
   */
  static extractCoreContent(description: string): string {
    if (!description) return '';

    let core = description;
    
    // 🔥 [CRITICAL] 循环移除直到没有签名行（处理多层嵌套）
    let previousCore = '';
    let iterations = 0;
    while (core !== previousCore && iterations < 10) {
      previousCore = core;
      core = core
        // 1. 移除 HTML 注释
        .replace(/<!--[\s\S]*?-->/g, '')
        // 2. 移除所有 "---" 分隔符（包括前后的空白）
        .replace(/\s*---+\s*/g, '\n')
        // 3. 移除签名行（一行格式：创建+修改）
        .replace(/\n*\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*创建于\s+[\d\-:\s/]+，\s*最后修改于\s+[\d\-:\s/]+/gi, '')
        // 4. 移除签名行（单独的创建行）
        .replace(/\n*\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*创建于\s+[\d\-:\s/]+/gi, '')
        // 5. 移除签名行（单独的修改/编辑行）
        .replace(/\n*\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:最后(?:修改|编辑)于|编辑于)\s+[\d\-:\s/]+/gi, '')
        // 6. 移除残留的签名前缀（不完整的签名）
        .replace(/\n*\s*[。，、]+\s*/g, '\n')
        // 7. 移除多余空行
        .replace(/\n\s*\n+/g, '\n')
        .trim();
      iterations++;
    }

    return core;
  }

  /**
   * 从签名中提取时间戳信息
   * @param content - 包含签名的文本
   * @returns 提取的时间戳（TimeSpec 格式）
   */
  static extractTimestamps(content: string): Pick<SignatureInfo, 'createdAt' | 'updatedAt'> {
    if (!content) return {};

    const result: Pick<SignatureInfo, 'createdAt' | 'updatedAt'> = {};

    // 提取创建时间
    const createMatch = content.match(this.CREATE_TIME_PATTERN);
    if (createMatch && createMatch[1]) {
      try {
        const timeStr = createMatch[1];
        const parsedTime = parseLocalTimeString(timeStr);
        if (parsedTime) {
          result.createdAt = timeStr; // 使用 TimeSpec 格式
        }
      } catch (error) {
        console.warn('[SignatureUtils] 解析创建时间失败:', createMatch[1], error);
      }
    }

    // 提取修改时间
    const updateMatch = content.match(this.UPDATE_TIME_PATTERN);
    if (updateMatch && updateMatch[1]) {
      try {
        const timeStr = updateMatch[1];
        const parsedTime = parseLocalTimeString(timeStr);
        if (parsedTime) {
          result.updatedAt = timeStr; // 使用 TimeSpec 格式
        }
      } catch (error) {
        console.warn('[SignatureUtils] 解析修改时间失败:', updateMatch[1], error);
      }
    }

    return result;
  }

  /**
   * 从签名中提取创建者信息
   * @param content - 包含签名的文本
   * @returns 创建者信息
   */
  static extractCreator(content: string): Pick<SignatureInfo, 'fourDNoteSource' | 'source'> {
    if (!content) return {};

    const result: Pick<SignatureInfo, 'fourDNoteSource' | 'source'> = {};

    const creatorMatch = content.match(this.CREATOR_PATTERN);
    if (creatorMatch && creatorMatch[1]) {
      const creator = creatorMatch[1].toLowerCase();

      if (creator === '4dnote') {
        result.fourDNoteSource = true;
        result.source = 'local';
      } else if (creator === 'outlook') {
        result.fourDNoteSource = false;
        result.source = 'outlook';
      }
    }

    return result;
  }

  /**
   * 提取完整的签名信息
   * @param content - 包含签名的文本
   * @returns 完整的签名信息
   */
  static extractSignatureInfo(content: string): SignatureInfo {
    return {
      ...this.extractTimestamps(content),
      ...this.extractCreator(content)
    };
  }

  /**
   * 为内容添加/更新签名
   * @param coreContent - 核心内容（不含签名）
   * @param options - 签名选项
   * @returns 带签名的完整内容
   */
  static addSignature(
    coreContent: string,
    options: {
      createdAt?: string;
      updatedAt?: string;
      fourDNoteSource?: boolean;
      source?: 'local' | 'outlook';
      lastModifiedSource?: SignatureSource;
      isVirtualTime?: boolean;  // 🆕 v2.19: 虚拟时间标记（note同步）
    }
  ): string {
    // 🔥 [CRITICAL] 始终先清理旧签名（避免重复累积）
    const cleanContent = this.extractCoreContent(coreContent);

    const lines: string[] = [];

    // 1. 添加核心内容
    if (cleanContent && cleanContent.trim()) {
      lines.push(cleanContent.trim());
      lines.push(''); // 空行
    }

    // 2. 添加分隔线
    lines.push('---');

    // 3. 确定创建来源和时间
    const isLocalCreated = options.fourDNoteSource === true || options.source === 'local' || !options.source;
    const createSource = isLocalCreated ? '🔮 4DNote' : '📧 Outlook';
    const createSourceKey: SignatureSource = isLocalCreated ? '4dnote' : 'outlook';
    const createTime = options.createdAt || formatTimeForStorage(new Date());

    // 4. 确定修改来源
    const modifySourceKey = options.lastModifiedSource || createSourceKey;
    const modifySource = modifySourceKey === '4dnote' ? '🔮 4DNote' : '📧 Outlook';

    // 🆕 v2.19: 虚拟时间标记（note同步）- 使用"笔记"前缀
    const notePrefix = options.isVirtualTime ? '📝 笔记' : '';

    // 5. 生成签名
    if (options.updatedAt && options.updatedAt !== options.createdAt) {
      const modifyTime = options.updatedAt;

      if (createSourceKey === modifySourceKey) {
        // 同一来源：一行签名
        lines.push(`${notePrefix ? notePrefix + '由' : '由'} ${createSource} 创建于 ${createTime}，最后修改于 ${modifyTime}`);
      } else {
        // 不同来源：两行签名
        lines.push(`${notePrefix ? notePrefix + '由' : '由'} ${createSource} 创建于 ${createTime}`);
        lines.push(`由 ${modifySource} 最后修改于 ${modifyTime}`);
      }
    } else {
      // 未修改：只显示创建信息
      lines.push(`${notePrefix ? notePrefix + '由' : '由'} ${createSource} 创建于 ${createTime}`);
    }

    return lines.join('\n');
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取来源的 Emoji 图标
   */
  static getSourceEmoji(source?: SignatureSource | 'local' | 'outlook'): SignatureEmoji {
    if (!source) return '🔮';
    return source === 'outlook' ? '📧' : '🔮';
  }

  /**
   * 获取来源的显示名称
   */
  static getSourceName(source?: SignatureSource | 'local' | 'outlook'): string {
    if (!source) return '4DNote';
    return source === 'outlook' ? 'Outlook' : '4DNote';
  }
}

// 向后兼容：导出类型
export type { SignatureInfo as ExtractedSignature };

// 便捷导出
export const isSignature = SignatureUtils.isSignatureParagraph;
export const extractCoreContent = SignatureUtils.extractCoreContent;
export const extractTimestamps = SignatureUtils.extractTimestamps;
export const extractCreator = SignatureUtils.extractCreator;
export const addSignature = SignatureUtils.addSignature;
