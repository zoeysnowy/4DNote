/**
 * Block Timestamp 数据迁移工具
 * 
 * 提供 timestamp-divider 格式到 Block-Level Timestamp 的迁移功能：
 * - migrateToBlockTimestamp: 迁移单个 EventLog 的 Slate 节点
 * - migrateEventLog: 迁移整个 Event 的 eventlog 字段
 * - batchMigrateEvents: 批量迁移多个 Events
 * - validateMigration: 验证迁移结果
 * 
 * @author Zoey Gong
 * @version 1.0.0
 * @date 2025-12-15
 */

import { generateBlockId } from './blockTimestampUtils';
import type { ParagraphNode } from '@frontend/components/SlateCore/types';

// ==================== 迁移核心函数 ====================

/**
 * 将 timestamp-divider 格式迁移到 block-level
 * 
 * 原理：
 * 1. 遍历旧节点数组
 * 2. 遇到 timestamp-divider 节点时，记录时间戳
 * 3. 遇到 paragraph 节点时，注入记录的时间戳
 * 4. 过滤掉所有 timestamp-divider 节点
 * 
 * @param oldNodes - 旧格式的 Slate 节点数组
 * @returns 新格式的 Slate 节点数组（移除 timestamp-divider）
 */
export function migrateToBlockTimestamp(oldNodes: any[]): any[] {
  if (!Array.isArray(oldNodes) || oldNodes.length === 0) {
    // 空内容，返回一个默认段落
    return [{
      type: 'paragraph',
      id: generateBlockId(),
      createdAt: Date.now(),
      children: [{ text: '' }]
    }];
  }
  
  const newNodes: any[] = [];
  let pendingTimestamp: number | null = null;
  
  for (const node of oldNodes) {
    if (node.type === 'timestamp-divider') {
      // 🔍 解析时间戳
      try {
        const timeStr = node.timestamp || node.displayText;
        if (timeStr) {
          const parsedDate = new Date(timeStr);
          if (!isNaN(parsedDate.getTime())) {
            pendingTimestamp = parsedDate.getTime();
          }
        }
      } catch (error) {
        console.warn('[migrateToBlockTimestamp] 解析时间戳失败:', node.timestamp, error);
        pendingTimestamp = Date.now();
      }
    } else if (node.type === 'paragraph') {
      // 🆕 为段落注入时间戳
      const timestamp = pendingTimestamp || node.createdAt || Date.now();
      
      newNodes.push({
        ...node,
        id: node.id || generateBlockId(timestamp),
        createdAt: timestamp,
      });
      
      pendingTimestamp = null; // 重置
    } else {
      // 其他节点（tag, dateMention, eventMention 等）保持不变
      newNodes.push(node);
    }
  }
  
  // 🔧 确保至少有一个节点
  if (newNodes.length === 0) {
    newNodes.push({
      type: 'paragraph',
      id: generateBlockId(),
      createdAt: Date.now(),
      children: [{ text: '' }]
    });
  }
  
  return newNodes;
}

// ==================== EventLog 迁移 ====================

/**
 * 迁移单个 Event 的 eventlog 字段
 * 
 * @param eventlog - Event.eventlog JSON 字符串
 * @returns 迁移后的 JSON 字符串
 */
export function migrateEventLog(eventlog: string | null): string {
  if (!eventlog) {
    // 空内容，返回默认段落
    return JSON.stringify([{
      type: 'paragraph',
      id: generateBlockId(),
      createdAt: Date.now(),
      children: [{ text: '' }]
    }]);
  }
  
  try {
    const oldNodes = JSON.parse(eventlog);
    const newNodes = migrateToBlockTimestamp(oldNodes);
    return JSON.stringify(newNodes);
  } catch (error) {
    console.error('[migrateEventLog] 迁移失败:', error);
    // 返回默认段落
    return JSON.stringify([{
      type: 'paragraph',
      id: generateBlockId(),
      createdAt: Date.now(),
      children: [{ text: '' }]
    }]);
  }
}

/**
 * 批量迁移多个 Events
 * 
 * @param events - Event 数组
 * @returns 迁移后的 Event 数组
 */
export function batchMigrateEvents(events: any[]): any[] {
  return events.map(event => ({
    ...event,
    eventlog: migrateEventLog(event.eventlog)
  }));
}

// ==================== 迁移验证 ====================

/**
 * 验证迁移结果
 * 
 * 检查项：
 * 1. 所有 paragraph 节点都有 id 和 createdAt
 * 2. 没有 timestamp-divider 节点
 * 3. 节点顺序保持一致
 * 
 * @param oldNodes - 旧节点数组
 * @param newNodes - 新节点数组
 * @returns 验证结果
 */
export function validateMigration(oldNodes: any[], newNodes: any[]): {
  success: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    oldParagraphCount: number;
    newParagraphCount: number;
    timestampDividerCount: number;
    missingIdCount: number;
    missingCreatedAtCount: number;
  };
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 统计数据
  const oldParagraphCount = oldNodes.filter(n => n.type === 'paragraph').length;
  const newParagraphCount = newNodes.filter(n => n.type === 'paragraph').length;
  const timestampDividerCount = oldNodes.filter(n => n.type === 'timestamp-divider').length;
  
  let missingIdCount = 0;
  let missingCreatedAtCount = 0;
  
  // ✅ 检查 1: 所有 paragraph 都有 id 和 createdAt
  newNodes.forEach((node, index) => {
    if (node.type === 'paragraph') {
      if (!node.id) {
        errors.push(`节点 ${index}: 缺少 id 属性`);
        missingIdCount++;
      }
      if (!node.createdAt) {
        errors.push(`节点 ${index}: 缺少 createdAt 属性`);
        missingCreatedAtCount++;
      }
    }
  });
  
  // ✅ 检查 2: 没有 timestamp-divider 节点
  const remainingDividers = newNodes.filter(n => n.type === 'timestamp-divider');
  if (remainingDividers.length > 0) {
    errors.push(`仍存在 ${remainingDividers.length} 个 timestamp-divider 节点`);
  }
  
  // ✅ 检查 3: 段落数量合理（应该保持一致或略有增加）
  if (newParagraphCount < oldParagraphCount) {
    warnings.push(`段落数量减少: ${oldParagraphCount} → ${newParagraphCount}`);
  }
  
  // ✅ 检查 4: 至少有一个节点
  if (newNodes.length === 0) {
    errors.push('迁移后节点数为 0');
  }
  
  return {
    success: errors.length === 0,
    errors,
    warnings,
    stats: {
      oldParagraphCount,
      newParagraphCount,
      timestampDividerCount,
      missingIdCount,
      missingCreatedAtCount
    }
  };
}

// ==================== 向后兼容工具 ====================

/**
 * 检查节点是否需要迁移
 * 
 * @param nodes - Slate 节点数组
 * @returns 是否包含 timestamp-divider 节点
 */
export function needsMigration(nodes: any[]): boolean {
  if (!Array.isArray(nodes)) return false;
  return nodes.some(node => node.type === 'timestamp-divider');
}

/**
 * 自动迁移（如果需要）
 * 
 * @param nodes - Slate 节点数组
 * @returns 迁移后的节点数组（如果不需要迁移则返回原数组）
 */
export function autoMigrate(nodes: any[]): any[] {
  if (!needsMigration(nodes)) {
    return nodes;
  }
  
  console.log('[autoMigrate] 检测到旧格式，正在迁移...');
  const migrated = migrateToBlockTimestamp(nodes);
  console.log('[autoMigrate] 迁移完成:', {
    原节点数: nodes.length,
    新节点数: migrated.length
  });
  
  return migrated;
}

/**
 * 确保所有 paragraph 都有 Block Timestamp 元数据
 * 
 * @param nodes - Slate 节点数组
 * @returns 补全元数据后的节点数组
 */
export function ensureBlockTimestamps(nodes: any[]): any[] {
  return ensureBlockTimestampsWithBase(nodes);
}

/**
 * 确保所有 paragraph 都有稳定的 blockId / 时间戳
 * - 关键：不要在每次 normalize 时使用 Date.now() 生成新的 id（会导致往返同步后产生“脏变更”）
 * - 仅补全缺失字段，不覆盖已有字段
 */
export function ensureBlockTimestampsWithBase(nodes: any[], baseTimestamp?: number): any[] {
  const base = Number.isFinite(baseTimestamp as number) ? (baseTimestamp as number) : Date.now();

  return nodes.map((node, index) => {
    if (node?.type !== 'paragraph') return node;

    // ⚠️ 只为非空段落添加 Block-Level Timestamp
    // 空段落（只有空文本）不应该显示时间戳
    const isEmptyParagraph =
      !node.children ||
      (node.children.length === 1 && (!node.children[0].text || node.children[0].text.trim() === ''));

    const stableSeed = (node.createdAt ?? (base + index)) as number;
    const id = node.id || generateBlockId(stableSeed);

    if (isEmptyParagraph) {
      return {
        ...node,
        id,
      };
    }

    const createdAt = node.createdAt ?? stableSeed;
    const updatedAt = node.updatedAt ?? createdAt;

    return {
      ...node,
      id,
      createdAt,
      updatedAt,
    };
  });
}

// ==================== 导出所有函数 ====================

export default {
  migrateToBlockTimestamp,
  migrateEventLog,
  batchMigrateEvents,
  validateMigration,
  needsMigration,
  autoMigrate,
  ensureBlockTimestamps,
  ensureBlockTimestampsWithBase,
};
