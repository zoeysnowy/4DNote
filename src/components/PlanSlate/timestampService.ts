/**
 * EventLogTimestampService - EventLog 时间戳自动插入服务
 * 
 * 按照 TimeLog PRD 的规则自动插入 timestamp divider：
 * 1. 当天首次编辑 → 完整时间戳（如 "2025-10-19 10:21:18"）
 * 2. 距上次编辑超过 5 分钟 → 相对时间戳（如 "16min later"）
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import { Editor, Transforms, Range, Node, Element as SlateElement } from 'slate';
import { TimestampDividerElement } from './types';

/**
 * 检查两个日期是否为同一天
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * 格式化日期时间为 "YYYY-MM-DD HH:mm:ss" 格式
 */
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化相对时间（如 "16min later", "2h later"）
 */
function formatRelativeTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}min later`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h later`;
  }
  
  return `${hours}h ${remainingMinutes}min later`;
}

export class EventLogTimestampService {
  private lastEditTimestamp: Map<string, Date> = new Map();
  
  /**
   * 检查是否需要插入 timestamp
   * @param params 参数对象
   * @returns 是否需要插入
   */
  shouldInsertTimestamp(params: { 
    contextId?: string; 
    eventId?: string; 
    editor?: Editor; 
    value?: any[] 
  }): boolean {
    // 使用 contextId 或 eventId
    const contextId = params.contextId || params.eventId || 'light-editor';
    const lastEdit = this.lastEditTimestamp.get(contextId);
    const now = new Date();
    
    console.log('[TimestampService] shouldInsertTimestamp 检查:', {
      contextId,
      params,
      lastEdit,
      now,
      hasLastEdit: !!lastEdit,
      allKeys: Array.from(this.lastEditTimestamp.keys())
    });
    
    // 情况1：当天首次编辑
    if (!lastEdit || !isSameDay(lastEdit, now)) {
      console.log('[TimestampService] 返回 true - 首次编辑或新的一天');
      return true;
    }
    
    // 情况2：距上次编辑超过 5 分钟
    const minutesElapsed = (now.getTime() - lastEdit.getTime()) / 1000 / 60;
    const shouldInsert = minutesElapsed >= 5;
    console.log('[TimestampService] 检查时间间隔:', { minutesElapsed, shouldInsert });
    return shouldInsert;
  }
  
  /**
   * 创建 timestamp divider 节点
   * @param eventId Event ID (可选)
   * @returns TimestampDividerElement
   */
  createTimestampDivider(eventId?: string): TimestampDividerElement {
    const contextId = eventId || 'light-editor';
    const lastEdit = this.lastEditTimestamp.get(contextId);
    const now = new Date();
    
    const isFirstOfDay = !lastEdit || !isSameDay(lastEdit, now);
    const minutesSinceLast = lastEdit 
      ? Math.floor((now.getTime() - lastEdit.getTime()) / 1000 / 60)
      : undefined;
    
    const displayText = isFirstOfDay
      ? formatDateTime(now) // "2025-10-19 10:21:18"
      : `${formatDateTime(now)} | ${formatRelativeTime(minutesSinceLast!)}`; // "2025-10-19 10:35:18 | 16min later"
    
    return {
      type: 'timestamp-divider',
      timestamp: now.toISOString(),
      isFirstOfDay,
      minutesSinceLast,
      displayText,
      children: [{ text: '' }]
    };
  }
  
  /**
   * 在 Slate 编辑器中插入 timestamp
   * @param editor Slate Editor 实例
   * @param timestampElement 预创建的 timestamp 元素 (用于 ModalSlate)
   * @param eventId Event ID (可选，用于传统模式)
   */
  insertTimestamp(editor: Editor, timestampElement?: TimestampDividerElement, eventId?: string): void {
    console.log('[TimestampService] insertTimestamp 被调用:', { eventId, hasPreElement: !!timestampElement });
    
    // 如果没有预创建元素，检查是否需要插入并创建
    if (!timestampElement) {
      if (!this.shouldInsertTimestamp({ editor, eventId })) {
        console.log('[TimestampService] shouldInsertTimestamp 返回 false，跳过插入');
        return;
      }
      timestampElement = this.createTimestampDivider(eventId);
    }
    
    const timestampNode = timestampElement;
    console.log('[TimestampService] 创建 timestamp 节点:', timestampNode);
    
    try {
      const { selection } = editor;
      const childrenCount = editor.children.length;
      console.log('[TimestampService] 编辑器状态:', { hasSelection: !!selection, childrenCount });
      
      // 检查是否为空编辑器（只有一个空段落）
      const isEmptyEditor = childrenCount === 1 
        && editor.children[0].type === 'paragraph'
        && editor.children[0].children.length === 1
        && (editor.children[0].children[0] as any).text === '';
      
      console.log('[TimestampService] 是否为空编辑器:', isEmptyEditor);
      
      // 在文档末尾插入 timestamp + 新的空段落（用户可以输入内容）
      const emptyParagraph = {
        type: 'paragraph',
        children: [{ text: '' }]
      };
      
      // 如果是空编辑器，替换掉默认空段落；否则追加到末尾
      const insertPosition = isEmptyEditor ? [0] : [childrenCount];
      console.log('[TimestampService] 插入位置:', insertPosition);
      
      if (isEmptyEditor) {
        // 先删除默认空段落，再插入 timestamp + 空段落
        Transforms.removeNodes(editor, { at: [0] });
        Transforms.insertNodes(editor, [timestampNode, emptyParagraph] as any, { at: [0] });
      } else {
        // 直接追加到末尾
        Transforms.insertNodes(editor, [timestampNode, emptyParagraph] as any, { at: [childrenCount] });
      }
      
      // 将光标移动到新段落
      try {
        const newParagraphPath = isEmptyEditor ? [1, 0] : [childrenCount + 1, 0];
        Transforms.select(editor, { 
          anchor: { path: newParagraphPath, offset: 0 },
          focus: { path: newParagraphPath, offset: 0 }
        });
        console.log('[TimestampService] 光标已移动到新段落:', newParagraphPath);
      } catch (error) {
        console.warn('[TimestampService] 无法移动光标:', error);
      }
      
      console.log('[TimestampService] timestamp 插入成功');
      
      // 插入成功后立即更新时间戳 - 使用 eventId
      if (eventId) {
        this.lastEditTimestamp.set(eventId, new Date());
        console.log('[TimestampService] 更新最后编辑时间完成:', eventId);
      }
      
    } catch (error) {
      console.error('[Timestamp] 插入失败:', error);
    }
  }
  
  /**
   * 清理空的 timestamp（用户未输入内容时）
   * 只清理最后一个 timestamp，并且只在它后面没有任何内容时清理
   */
  removeEmptyTimestamp(editor: any): boolean {
    try {
      const children = editor.children;
      let removed = false;
      
      // 只检查最后一个 timestamp
      for (let i = children.length - 1; i >= 0; i--) {
        const node = children[i] as any;
        if (node.type === 'timestamp-divider') {
          // 检查 timestamp 后是否有任何非空内容
          const hasContentAfter = children.slice(i + 1).some((nextNode: any) => {
            return nextNode.type === 'paragraph' && 
                   nextNode.children?.[0]?.text?.trim();
          });
          
          if (!hasContentAfter) {
            // 移除空的 timestamp
            Transforms.removeNodes(editor, { at: [i] });
            removed = true;
            console.log('[TimestampService] 移除空的 timestamp');
          }
          
          // 只处理最后一个 timestamp，不继续循环
          break;
        }
      }
      
      return removed;
    } catch (error) {
      console.error('[TimestampService] 清理空 timestamp 失败:', error);
      return false;
    }
  }

  /**
   * 更新最后编辑时间（手动调用，防止短时间内重复插入）
   * @param eventId Event ID
   * @param timestamp 可选的时间戳，如果不提供则使用当前时间
   */
  updateLastEditTime(eventId: string, timestamp?: Date): void {
    if (eventId) {
      const time = timestamp || new Date();
      this.lastEditTimestamp.set(eventId, time);
      // console.log('[TimestampService] 手动更新最后编辑时间:', eventId, time);
    }
  }

  /**
   * 重置某个 Event 的时间戳记录（用于清空 eventlog 时）
   * @param eventId Event ID
   */
  resetTimestamp(eventId: string): void {
    this.lastEditTimestamp.delete(eventId);
  }
  
  /**
   * 清空所有时间戳记录
   */
  clearAll(): void {
    this.lastEditTimestamp.clear();
  }
}
