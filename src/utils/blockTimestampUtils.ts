/**
 * Block Timestamp 工具函数库
 * 
 * 提供 Block-Level Timestamp 相关的核心工具函数：
 * - generateBlockId: 生成唯一 Block ID
 * - injectBlockTimestamp: 为节点注入时间戳元数据
 * - formatBlockTimestamp: 格式化时间戳显示
 * - shouldShowTimestamp: 判断是否显示时间戳（5分钟阈值）
 * - getPreviousBlockTimestamp: 获取上一个 block 的时间戳
 * - ensureBlockId: 确保节点有 ID
 * 
 * @author Zoey Gong
 * @version 1.0.0
 * @date 2025-12-15
 */

import { Editor, Node, Path } from 'slate';
import type { ParagraphNode } from '../components/SlateCore/types';

// ==================== Block ID 生成 ====================

/**
 * 生成 Block ID
 * 
 * 格式: block_timestamp_random
 * 示例: block_1702636800000_abc123
 * 
 * @param timestamp - 可选的时间戳（默认使用当前时间）
 * @returns Block ID 字符串
 */
export function generateBlockId(timestamp?: number): string {
  const ts = timestamp || Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `block_${ts}_${random}`;
}

/**
 * 确保节点有 ID（如果没有则生成）
 * 
 * @param node - Paragraph 节点
 * @param timestamp - 可选的时间戳
 * @returns 带 ID 的节点
 */
export function ensureBlockId(node: any, timestamp?: number): any {
  if (node.id) return node;
  
  return {
    ...node,
    id: generateBlockId(timestamp || node.createdAt || Date.now())
  };
}

// ==================== 时间戳注入 ====================

/**
 * 为 paragraph 节点注入时间戳元数据
 * 
 * @param node - 要处理的节点
 * @param timestamp - 可选的时间戳（默认使用当前时间）
 * @returns 注入元数据后的 ParagraphNode
 */
export function injectBlockTimestamp(
  node: any, 
  timestamp?: number
): ParagraphNode {
  const now = timestamp || Date.now();
  
  return {
    ...node,
    type: 'paragraph',
    id: node.id || generateBlockId(now),
    createdAt: node.createdAt || now,
    updatedAt: now,
  } as ParagraphNode;
}

/**
 * 批量为多个节点注入时间戳
 * 
 * @param nodes - 节点数组
 * @param baseTimestamp - 基准时间戳（可选）
 * @returns 注入时间戳后的节点数组
 */
export function injectBulkTimestamps(
  nodes: any[],
  baseTimestamp?: number
): any[] {
  const base = baseTimestamp || Date.now();
  
  return nodes.map((node, index) => {
    if (node.type === 'paragraph') {
      // 每个节点间隔 1ms，确保顺序
      return injectBlockTimestamp(node, base + index);
    }
    return node;
  });
}

// ==================== 时间戳格式化 ====================

/**
 * 格式化 Block 时间戳
 * 
 * @param timestamp - Unix 毫秒时间戳
 * @param format - 格式类型
 *   - 'HH:mm': 小时:分钟（默认）
 *   - 'full': 完整日期时间
 *   - 'relative': 相对时间（如 "5分钟前"）
 * @returns 格式化后的字符串
 */
export function formatBlockTimestamp(
  timestamp: number,
  format: 'HH:mm' | 'full' | 'relative' = 'HH:mm'
): string {
  const date = new Date(timestamp);
  
  if (format === 'HH:mm') {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  
  if (format === 'full') {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  if (format === 'relative') {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${days}天前`;
  }
  
  return date.toLocaleString();
}

// ==================== 时间戳显示判断 ====================

/**
 * 判断是否应该显示时间戳（5分钟阈值）
 * 
 * 规则：
 * - 如果是第一个 block（没有上一个），总是显示
 * - 如果距上一个 block 超过 5 分钟，显示
 * - 否则不显示
 * 
 * @param currentTimestamp - 当前 block 的时间戳
 * @param previousTimestamp - 上一个 block 的时间戳（可选）
 * @returns 是否应该显示时间戳
 */
export function shouldShowTimestamp(
  currentTimestamp: number,
  previousTimestamp?: number
): boolean {
  // 第一个 block，总是显示
  if (!previousTimestamp) return true;
  
  // 计算时间差（毫秒）
  const diff = currentTimestamp - previousTimestamp;
  
  // 5分钟阈值
  const THRESHOLD_MS = 5 * 60 * 1000;
  
  return diff > THRESHOLD_MS;
}

/**
 * 从 Slate Editor 获取上一个 block 的时间戳
 * 
 * @param editor - Slate 编辑器实例
 * @param currentPath - 当前节点的路径
 * @returns 上一个 block 的时间戳（如果不存在返回 null）
 */
export function getPreviousBlockTimestamp(
  editor: Editor,
  currentPath: Path
): number | null {
  // 第一个节点，没有上一个
  if (currentPath[0] === 0) return null;
  
  try {
    const prevPath = [currentPath[0] - 1];
    const prevNode = Node.get(editor, prevPath) as any;
    
    // 跳过非 paragraph 节点
    if (prevNode?.type !== 'paragraph') {
      // 递归向上查找
      if (currentPath[0] > 1) {
        return getPreviousBlockTimestamp(editor, [currentPath[0] - 1]);
      }
      return null;
    }
    
    return prevNode?.createdAt || null;
  } catch (error) {
    console.warn('[getPreviousBlockTimestamp] 获取上一个 block 失败:', error);
    return null;
  }
}

/**
 * 获取指定节点的时间戳（支持 fallback）
 * 
 * @param node - Paragraph 节点
 * @param fallbackTimestamp - fallback 时间戳（可选）
 * @returns 时间戳
 */
export function getBlockTimestamp(
  node: any,
  fallbackTimestamp?: number
): number {
  return node?.createdAt || fallbackTimestamp || Date.now();
}

// ==================== 时间戳提取 ====================

/**
 * 从 Slate Editor 提取所有 block 的时间戳
 * 
 * @param editor - Slate 编辑器实例
 * @returns 时间戳数组（按节点顺序）
 */
export function extractAllTimestamps(editor: Editor): number[] {
  const timestamps: number[] = [];
  
  try {
    for (const [node] of Editor.nodes(editor, {
      at: [],
      match: (n: any) => n.type === 'paragraph'
    })) {
      const para = node as any;
      if (para.createdAt) {
        timestamps.push(para.createdAt);
      }
    }
  } catch (error) {
    console.warn('[extractAllTimestamps] 提取时间戳失败:', error);
  }
  
  return timestamps;
}

/**
 * 获取最早和最晚的 block 时间戳
 * 
 * @param editor - Slate 编辑器实例
 * @returns { earliest: number | null, latest: number | null }
 */
export function getTimestampRange(editor: Editor): {
  earliest: number | null;
  latest: number | null;
} {
  const timestamps = extractAllTimestamps(editor);
  
  if (timestamps.length === 0) {
    return { earliest: null, latest: null };
  }
  
  return {
    earliest: Math.min(...timestamps),
    latest: Math.max(...timestamps)
  };
}

// ==================== 导出所有工具函数 ====================

export default {
  generateBlockId,
  ensureBlockId,
  injectBlockTimestamp,
  injectBulkTimestamps,
  formatBlockTimestamp,
  shouldShowTimestamp,
  getPreviousBlockTimestamp,
  getBlockTimestamp,
  extractAllTimestamps,
  getTimestampRange,
};
