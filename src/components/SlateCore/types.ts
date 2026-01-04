/**
 * SlateCore - 共享类型定义
 * 
 * 定义所有 Slate 编辑器共享的类型和接口
 * 包括: TextNode, ParagraphNode, TagNode, DateMentionNode, TimestampDividerElement 等
 * 
 * @version 1.0.0
 * @date 2025-11-29
 */

import { BaseEditor, Descendant } from 'slate';
import { ReactEditor } from 'slate-react';
import { HistoryEditor } from 'slate-history';
import type { EventLineNode } from '@frontend/components/PlanSlate/types';

// ==================== 编辑器类型 ====================

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor;

// ==================== 基础节点类型 ====================

/**
 * Text - 文本叶子节点（支持格式）
 */
export interface TextNode {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  color?: string;
  backgroundColor?: string;
}

/**
 * Paragraph - 段落节点（内部包含文本和 inline 元素）
 */
export interface ParagraphNode {
  type: 'paragraph';
  id?: string;             // 🆕 唯一标识符（block_timestamp_random）
  createdAt?: number;      // 🆕 创建时间戳（Unix ms）
  updatedAt?: number;      // 🆕 最后修改时间戳
  bullet?: boolean;        // 是否为 bullet list item
  bulletLevel?: number;    // bullet 层级 (0-4)
  children: (TextNode | TagNode | DateMentionNode)[];
}

/**
 * Tag - 标签元素
 */
export interface TagNode {
  type: 'tag';
  tagId: string;
  tagName: string;
  tagColor?: string;
  tagEmoji?: string;
  mentionOnly?: boolean;  // description 模式下的只读标签
  children: [{ text: '' }];
}

/**
 * DateMention - 日期提及元素
 */
export interface DateMentionNode {
  type: 'dateMention' | 'date-mention';
  startDate: string;      // ISO string - 用户插入时的时间
  endDate?: string;       // ISO string - 用户插入时的结束时间
  mentionOnly?: boolean;  // description 模式下的只读提及
  eventId?: string;       // 关联的事件 ID
  originalText?: string;  // 用户原始输入文本（如"下周二下午3点"）
  isOutdated?: boolean;   // 时间是否过期（与 TimeHub 不一致）
  children: [{ text: '' }];
}

/**
 * EventMention - 事件提及元素 (双向链接)
 */
export interface EventMentionNode {
  type: 'eventMention' | 'event-mention';
  eventId: string;        // 目标事件 ID
  eventTitle: string;     // 事件标题（缓存，用于显示）
  eventEmoji?: string;    // 事件 emoji（缓存）
  children: [{ text: string }];
}

/**
 * @deprecated 使用 Block-Level Timestamp (paragraph.createdAt) 替代
 * TimestampDivider - 时间戳分隔线元素 (Legacy v2.17)
 * 
 * 保留此类型定义以向后兼容旧数据，但不再使用。
 * 新代码应使用 paragraph.createdAt 存储时间戳。
 */
export interface TimestampDividerElement {
  type: 'timestamp-divider';
  timestamp: string;           // ISO 8601 格式
  isFirstOfDay?: boolean;      // 是否为当天首次
  minutesSinceLast?: number;   // 距上次间隔（分钟）
  displayText: string;         // UI 显示文本
  children: [{ text: '' }];    // Slate Void 节点要求
}

// ==================== 组合类型 ====================

/**
 * 共享的元素类型（不包括 EventLineNode，EventLineNode 是 PlanSlate 特有）
 * @deprecated TimestampDividerElement 仅保留以向后兼容
 */
export type SharedElement = ParagraphNode | TagNode | DateMentionNode | TimestampDividerElement;

/**
 * 全局 Slate 元素类型（聚合各编辑器元素）。
 * 说明：这会让 RenderElementProps.element 支持 event-line / event-mention 等元素。
 */
export type CustomElement = SharedElement | EventMentionNode | EventLineNode;

/**
 * 共享的文本类型
 */
export type CustomText = TextNode;

// ==================== 编辑器配置 ====================

/**
 * 通用编辑器配置
 */
export interface SlateEditorConfig {
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  enableTimestamp?: boolean;  // 是否启用 Timestamp 自动插入
  maxBulletLevel?: number;    // 最大 bullet 层级（默认 4）
}

// ==================== Slate 模块扩展 ====================

declare module 'slate' {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}
