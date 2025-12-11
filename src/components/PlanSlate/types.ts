/**
 * PlanSlate - 节点类型定义
 * 
 * 基于 Event 的单实例 Slate 编辑器
 * 支持跨行选择、富文本复制粘贴、缩进管理
 */

import { BaseEditor, Descendant } from 'slate';
import { ReactEditor } from 'slate-react';
import { HistoryEditor } from 'slate-history';

// ==================== 编辑器类型 ====================

export type CustomEditor = BaseEditor & ReactEditor & HistoryEditor;

// ==================== 节点类型 ====================

/**
 * EventLine - 对应一个 Event 的一行（可能是 title 或 description）
 */
export interface EventLineNode {
  type: 'event-line';
  eventId?: string;        // 关联的 Event ID（新建时为空）
  lineId: string;          // 行唯一ID（用于编辑器内部定位）
  level: number;           // 缩进层级 (0, 1, 2, ...)
  mode: 'title' | 'eventlog';  // 行模式（title=标题行, eventlog=日志内容区）
  children: ParagraphNode[];
  
  // 🆕 v1.5: 元数据透传（保留业务字段，避免字段丢失）
  metadata?: EventMetadata;
}

/**
 * Event 元数据（完整业务字段透传）
 * 
 * v1.6: 扩展所有业务字段，避免字段丢失
 */
export interface EventMetadata {
  // 时间字段
  startTime?: string | null;
  endTime?: string | null;
  dueDate?: string | null;
  isAllDay?: boolean;
  timeSpec?: any;
  
  // 样式字段
  emoji?: string;
  color?: string;
  
  // 业务字段
  priority?: string;
  category?: string;
  isCompleted?: boolean;
  isTask?: boolean;
  type?: string;
  checkType?: 'none' | 'once' | 'recurring'; // 🆕 任务类型（控制 checkbox 显示：'once'/'recurring'=显示，'none'/undefined=隐藏）
  
  // Plan 相关
  isPlan?: boolean;
  isTimeCalendar?: boolean;
  
  // 同步字段
  calendarId?: string;
  calendarIds?: string[];
  todoListIds?: string[]; // 🆕 To Do List IDs
  source?: string;
  syncStatus?: string;
  externalId?: string;
  fourDNoteSource?: boolean;
  
  // 时间戳
  createdAt?: string;
  updatedAt?: string;
  
  // 🔥 EventTree 字段
  parentEventId?: string;
  childEventIds?: string[];
  
  // 🔥 Position 和 BulletLevel（用于排序和层级显示）
  bulletLevel?: number;
  position?: number;
  
  // 扩展字段（允许其他未列出的字段）
  [key: string]: any;
}

/**
 * Paragraph - 段落节点（内部包含文本和 inline 元素）
 */
export interface ParagraphNode {
  type: 'paragraph';
  bullet?: boolean;        // 是否为 bullet list item
  bulletLevel?: number;    // bullet 层级 (0-4)
  children: (TextNode | TagNode | DateMentionNode)[];
}

/**
 * Text - 文本叶子节点（支持格式）
 */
export interface TextNode {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;
  backgroundColor?: string; // 🆕 背景颜色
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
  type: 'dateMention';
  startDate: string;      // ISO string - 用户插入时的时间
  endDate?: string;       // ISO string - 用户插入时的结束时间
  mentionOnly?: boolean;  // description 模式下的只读提及
  eventId?: string;       // 🆕 关联的事件 ID
  originalText?: string;  // 🆕 v2.3: 用户原始输入文本（如"下周二下午3点"）
  isOutdated?: boolean;   // 🆕 v2.3: 时间是否过期（与 TimeHub 不一致）
  children: [{ text: '' }];
}

/**
 * TimestampDivider - 时间戳分隔线元素
 * 
 * 用于 EventLog 记录编辑时间，自动插入：
 * - 当天首次编辑 → 完整时间戳（如 "2025-10-19 10:21:18"）
 * - 距上次编辑超过 5 分钟 → 相对时间戳（如 "16min later"）
 */
export interface TimestampDividerElement {
  type: 'timestamp-divider';
  timestamp: string;           // ISO 8601 格式
  isFirstOfDay?: boolean;      // 是否为当天首次
  minutesSinceLast?: number;   // 距上次间隔（分钟）
  displayText: string;         // UI 显示文本
  children: [{ text: '' }];    // Slate Void 节点要求
}

// TimelineSegmentElement removed - using simpler timestamp approach to prevent path resolution issues

// ==================== 类型导出 ====================

export type CustomElement = EventLineNode | ParagraphNode | TagNode | DateMentionNode | TimestampDividerElement;
export type CustomText = TextNode;

// ==================== 工具类型 ====================

/**
 * EventLine 数据（用于序列化/反序列化）
 */
export interface EventLineData {
  lineId: string;
  eventId?: string;
  level: number;
  mode: 'title' | 'eventlog';
  content: string;  // HTML 格式
}

/**
 * 编辑器配置
 */
export interface PlanSlateConfig {
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  maxLevel?: number;  // 最大缩进层级
}
