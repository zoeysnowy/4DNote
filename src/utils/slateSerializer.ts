/**
 * Slate 序列化工具
 * 
 * 提供 Slate 数据与各种格式之间的转换：
 * - Slate JSON ↔ EventLog
 * - Slate JSON ↔ HTML
 * - Slate JSON ↔ PlainText
 * - Slate JSON ↔ Markdown
 * 
 * @version 1.0.0
 * @date 2025-12-02
 */

import { Descendant, Text as SlateText } from 'slate';
import type { EventLog } from '../types';

// ==================== EventLog 转换 ====================

/**
 * Slate 节点转 EventLog
 * @param nodes Slate Descendant 节点数组
 * @returns EventLog 对象
 */
export function slateNodesToEventLog(nodes: Descendant[]): EventLog {
  const slateJson = JSON.stringify(nodes);
  const plainText = slateNodesToPlainText(nodes);
  const html = slateNodesToHtml(nodes);
  
  return {
    slateJson,
    plainText,
    html,
    wordCount: countWords(plainText),
    characterCount: plainText.length,
    lastEditedAt: formatTimeForStorage(new Date()),
  };
}

/**
 * EventLog 转 Slate 节点
 * @param eventLog EventLog 对象
 * @returns Slate Descendant 节点数组
 */
export function eventLogToSlateNodes(eventLog: string | EventLog): Descendant[] {
  try {
    // 兼容旧数据：如果是字符串，直接解析
    if (typeof eventLog === 'string') {
      return JSON.parse(eventLog);
    }
    
    // 新数据：从 slateJson 字段解析
    if (eventLog.slateJson) {
      return JSON.parse(eventLog.slateJson);
    }
    
    // 降级：返回空段落
    return [{ type: 'paragraph', children: [{ text: '' }] }];
  } catch (error) {
    console.error('[slateSerializer] Failed to parse slateJson:', error);
    return [{ type: 'paragraph', children: [{ text: '' }] }];
  }
}

// ==================== 纯文本转换（用于 FTS5 搜索）====================

/**
 * Slate 节点转纯文本（递归处理）
 * @param nodes Slate 节点数组
 * @returns 纯文本字符串
 */
export function slateNodesToPlainText(nodes: Descendant[]): string {
  return nodes.map(node => nodeToPlainText(node)).join('\n');
}

/**
 * 单个节点转纯文本（递归处理）
 */
function nodeToPlainText(node: any): string {
  // 文本节点
  if (SlateText.isText(node)) {
    return node.text;
  }
  
  // 元素节点（递归处理子节点）
  if ('children' in node && Array.isArray(node.children)) {
    const childText = node.children.map((child: any) => nodeToPlainText(child)).join('');
    
    // 根据节点类型添加格式
    switch (node.type) {
      case 'paragraph':
        // Bullet 列表项
        if (node.bullet) {
          const level = node.bulletLevel || 0;
          const indent = '  '.repeat(level);
          return indent + '• ' + childText;
        }
        return childText;
        
      case 'timestamp-divider':
        return `[${node.displayText}]`;
        
      case 'tag':
        return `#${node.tagName}`;
        
      case 'dateMention':
        return node.originalText || node.startDate;
        
      default:
        return childText;
    }
  }
  
  return '';
}

// ==================== HTML 转换（用于预览）====================

/**
 * Slate 节点转 HTML
 * @param nodes Slate 节点数组
 * @returns HTML 字符串
 */
export function slateNodesToHtml(nodes: Descendant[]): string {
  return nodes.map(node => nodeToHtml(node)).join('\n');
}

/**
 * 单个节点转 HTML（递归处理）
 */
function nodeToHtml(node: any): string {
  // 文本节点（处理格式）
  if (SlateText.isText(node)) {
    let text = escapeHtml(node.text);
    
    // 应用文本格式
    if (node.bold) text = `<strong>${text}</strong>`;
    if (node.italic) text = `<em>${text}</em>`;
    if (node.underline) text = `<u>${text}</u>`;
    if (node.strikethrough) text = `<s>${text}</s>`;
    if (node.code) text = `<code>${text}</code>`;
    
    // 应用颜色
    const styles: string[] = [];
    if (node.color) styles.push(`color: ${node.color}`);
    if (node.backgroundColor) styles.push(`background-color: ${node.backgroundColor}`);
    
    if (styles.length > 0) {
      text = `<span style="${styles.join('; ')}">${text}</span>`;
    }
    
    return text;
  }
  
  // 元素节点（递归处理）
  if ('children' in node && Array.isArray(node.children)) {
    const childrenHtml = node.children.map((child: any) => nodeToHtml(child)).join('');
    
    switch (node.type) {
      case 'paragraph':
        // Bullet 列表
        if (node.bullet) {
          const level = node.bulletLevel || 0;
          const style = `margin-left: ${level * 24}px;`;
          return `<p class="bullet-paragraph" style="${style}">• ${childrenHtml}</p>`;
        }
        return `<p>${childrenHtml}</p>`;
        
      case 'timestamp-divider':
        return `<div class="timestamp-divider">
          <hr/>
          <span class="timestamp-text">${node.displayText}</span>
        </div>`;
        
      case 'tag':
        const tagStyle = node.tagColor ? `background-color: ${node.tagColor}` : '';
        const tagEmoji = node.tagEmoji || '';
        return `<span class="slate-tag" style="${tagStyle}">${tagEmoji}${escapeHtml(node.tagName)}</span>`;
        
      case 'dateMention':
        const dateText = node.originalText || node.startDate;
        return `<span class="slate-date-mention">${escapeHtml(dateText)}</span>`;
        
      default:
        return `<div>${childrenHtml}</div>`;
    }
  }
  
  return '';
}

// ==================== Markdown 转换（可选）====================

/**
 * Slate 节点转 Markdown
 * @param nodes Slate 节点数组
 * @returns Markdown 字符串
 */
export function slateNodesToMarkdown(nodes: Descendant[]): string {
  return nodes.map(node => nodeToMarkdown(node)).join('\n\n');
}

/**
 * 单个节点转 Markdown（递归处理）
 */
function nodeToMarkdown(node: any): string {
  // 文本节点
  if (SlateText.isText(node)) {
    let text = node.text;
    
    // Markdown 格式
    if (node.bold) text = `**${text}**`;
    if (node.italic) text = `*${text}*`;
    if (node.code) text = `` `${text}` ``;
    if (node.strikethrough) text = `~~${text}~~`;
    
    return text;
  }
  
  // 元素节点
  if ('children' in node && Array.isArray(node.children)) {
    const childrenMd = node.children.map((child: any) => nodeToMarkdown(child)).join('');
    
    switch (node.type) {
      case 'paragraph':
        if (node.bullet) {
          const level = node.bulletLevel || 0;
          const indent = '  '.repeat(level);
          return `${indent}- ${childrenMd}`;
        }
        return childrenMd;
        
      case 'timestamp-divider':
        return `---\n*${node.displayText}*\n`;
        
      case 'tag':
        return `#${node.tagName}`;
        
      case 'dateMention':
        return `[${node.originalText || node.startDate}]`;
        
      default:
        return childrenMd;
    }
  }
  
  return '';
}

// ==================== 工具函数 ====================

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 统计单词数（支持中文和英文）
 */
export function countWords(text: string): number {
  // 中文字符算 1 个词
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  
  // 英文单词按空格分割
  const englishWords = text
    .replace(/[\u4e00-\u9fa5]/g, '') // 移除中文
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length;
  
  return chineseChars + englishWords;
}

/**
 * 计算字符数（不含空格）
 */
export function countCharacters(text: string): number {
  return text.replace(/\s/g, '').length;
}

/**
 * 提取所有标签
 */
export function extractTags(nodes: Descendant[]): string[] {
  const tags: string[] = [];
  
  function traverse(node: any) {
    if (node.type === 'tag') {
      tags.push(node.tagName);
    }
    
    if ('children' in node && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return [...new Set(tags)]; // 去重
}

/**
 * 提取所有时间提及
 */
export function extractDateMentions(nodes: Descendant[]): Array<{
  startDate: string;
  endDate?: string;
  originalText?: string;
}> {
  const mentions: Array<any> = [];
  
  function traverse(node: any) {
    if (node.type === 'dateMention') {
      mentions.push({
        startDate: node.startDate,
        endDate: node.endDate,
        originalText: node.originalText
      });
    }
    
    if ('children' in node && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return mentions;
}

/**
 * 提取所有时间戳
 */
export function extractTimestamps(nodes: Descendant[]): string[] {
  const timestamps: string[] = [];
  
  function traverse(node: any) {
    if (node.type === 'timestamp-divider') {
      timestamps.push(node.timestamp);
    }
    
    if ('children' in node && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return timestamps;
}

// ==================== 导出 ====================

export default {
  // EventLog 转换
  slateNodesToEventLog,
  eventLogToSlateNodes,
  
  // 格式转换
  slateNodesToPlainText,
  slateNodesToHtml,
  slateNodesToMarkdown,
  
  // 工具函数
  countWords,
  countCharacters,
  extractTags,
  extractDateMentions,
  extractTimestamps
};
