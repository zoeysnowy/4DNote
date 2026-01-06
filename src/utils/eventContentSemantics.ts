/**
 * EventContentSemantics - 事件内容语义分析工具
 * 
 * 职责：
 * 1. 判断事件是否为空白（isBlankCanonical）
 * 2. 计算事件内容丰富度评分（contentScore）
 * 3. 选择"最富有状态"的快照（chooseBestSnapshot）
 * 4. 提取 EventLog 的纯文本内容（extractTextFromEventLog）
 * 
 * 用途：
 * - 空白事件清理（避免数据库中长期存在无意义事件）
 * - EventHistory 的 best snapshot 策略（记录删除前的最佳状态）
 * - UI 层的内容判断（例如：是否显示为空行）
 */

import { Event, EventLog } from '@frontend/types';
import { formatTimeForStorage } from './timeUtils';

/**
 * 从 EventLog 中提取纯文本内容
 * 支持新旧格式：
 * - 新格式：EventLog 对象（优先使用 plainText，降级到 slateJson 解析）
 * - 旧格式：HTML 字符串（移除 HTML 标签）
 */
export function extractTextFromEventLog(eventLog: string | EventLog | undefined): string {
  if (!eventLog) return '';
  
  // 旧格式：HTML 字符串
  if (typeof eventLog === 'string') {
    return stripHtmlTags(eventLog);
  }
  
  // 新格式：EventLog 对象
  if (eventLog.plainText) {
    return eventLog.plainText;
  }
  
  // 降级：从 slateJson 解析
  if (eventLog.slateJson) {
    try {
      const slateNodes = JSON.parse(eventLog.slateJson);
      return extractTextFromSlateNodes(slateNodes);
    } catch (e) {
      console.error('[EventContentSemantics] Failed to parse slateJson:', e);
      return '';
    }
  }
  
  // 最后降级：使用 html
  if (eventLog.html) {
    return stripHtmlTags(eventLog.html);
  }
  
  return '';
}

/**
 * 从 Slate JSON 节点中提取纯文本
 */
function extractTextFromSlateNodes(nodes: any[]): string {
  if (!Array.isArray(nodes)) return '';
  
  const texts: string[] = [];
  
  for (const node of nodes) {
    if (node.text !== undefined) {
      texts.push(node.text);
    }
    if (node.children && Array.isArray(node.children)) {
      texts.push(extractTextFromSlateNodes(node.children));
    }
  }
  
  return texts.join('');
}

/**
 * 移除 HTML 标签，提取纯文本
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * 检查时间字段是否为空
 */
function isEmptyTime(
  timeSpec: any,
  startTime: string | undefined,
  endTime: string | undefined,
  isAllDay: boolean | undefined
): boolean {
  // 如果有 timeSpec，检查其内容
  if (timeSpec) {
    // 如果 timeSpec 有任何有意义的值，认为时间非空
    return false;
  }
  
  // 检查传统时间字段
  const hasStartTime = !!startTime && startTime.trim() !== '';
  const hasEndTime = !!endTime && endTime.trim() !== '';
  const hasAllDay = isAllDay === true;
  
  return !hasStartTime && !hasEndTime && !hasAllDay;
}

/**
 * 检查任务字段是否为默认值（空）
 */
function isDefaultTaskFields(event: Event): boolean {
  // 如果不是任务，认为字段为默认
  if (!event.isTask) return true;
  
  // 检查任务特有字段
  const hasPriority = !!event.priority && event.priority !== 'low';
  const hasCompleted = event.isCompleted === true;
  const hasDueDateTime = !!event.dueDateTime && event.dueDateTime.trim() !== '';
  
  return !hasPriority && !hasCompleted && !hasDueDateTime;
}

/**
 * 判断事件是否为空白（Blank Canonical Event）
 * 
 * 只检查对用户有意义的字段（Allowlist 策略）：
 * - title（任何格式）
 * - eventLog（语义文本）
 * - tags
 * - timeSpec / startTime / endTime / isAllDay
 * - location
 * - 任务字段（isTask, isCompleted, priority, dueDateTime）
 * 
 * ⚠️ 注意：
 * - 不检查 id, createdAt, updatedAt 等元数据字段
 * - 不检查 syncStatus, source 等系统字段
 * - 不检查 _isTempId, _originalTempId 等临时字段
 * 
 * @param event 待检查的事件
 * @returns true = 空白事件，false = 有实质内容
 */
export function isBlankCanonical(event: Event): boolean {
  // 1. 检查 title
  const hasTitle = hasRealTitle(event.title);
  if (hasTitle) return false;
  
  // 2. 检查 eventLog（使用语义文本）
  const eventLogText = extractTextFromEventLog(event.eventlog);
  if (eventLogText.trim().length > 0) return false;
  
  // 3. 检查 tags
  const hasTags = event.tags && event.tags.length > 0;
  if (hasTags) return false;
  
  // 4. 检查 location
  if (event.location) {
    const locationText = typeof event.location === 'string' 
      ? event.location 
      : event.location.displayName || event.location.address || '';
    if (locationText.trim().length > 0) return false;
  }
  
  // 5. 检查时间字段
  const hasTime = !isEmptyTime(
    event.timeSpec,
    event.startTime,
    event.endTime,
    event.isAllDay
  );
  if (hasTime) return false;
  
  // 6. 检查任务字段
  const hasTaskFields = !isDefaultTaskFields(event);
  if (hasTaskFields) return false;
  
  // 所有字段都为空
  return true;
}

/**
 * 检查 title 是否有实质内容
 * 支持多种格式：
 * - string
 * - { simpleTitle, fullTitle, colorTitle }
 */
function hasRealTitle(title: any): boolean {
  if (!title) return false;
  
  // 字符串格式
  if (typeof title === 'string') {
    return title.trim().length > 0;
  }
  
  // 对象格式
  if (typeof title === 'object') {
    // 检查 simpleTitle
    if (title.simpleTitle && title.simpleTitle.trim().length > 0) {
      return true;
    }
    
    // 检查 colorTitle
    if (title.colorTitle && title.colorTitle.trim().length > 0) {
      return true;
    }
    
    // 检查 fullTitle（Slate JSON）
    if (title.fullTitle) {
      try {
        const slateNodes = JSON.parse(title.fullTitle);
        const text = extractTextFromSlateNodes(slateNodes);
        return text.trim().length > 0;
      } catch (e) {
        // 降级：当作字符串
        return title.fullTitle.trim().length > 0;
      }
    }
  }
  
  return false;
}

/**
 * 计算事件内容丰富度评分
 * 
 * 评分规则（稳定，不要随意修改）：
 * - title 存在：+10
 * - eventLog 文本长度 > 0：+5
 * - eventLog 文本长度 > 50：+5
 * - eventLog 文本长度 > 200：+10
 * - tags 数量（最多10个）：每个 +2
 * - 有时间信息：+4
 * - 有地点：+2
 * - 是任务：+1
 * - 任务已完成：+1
 * 
 * @param event 待评分的事件
 * @returns 评分（数字越大，内容越丰富）
 */
export function contentScore(event: Event): number {
  let score = 0;
  
  // 1. title（+10）
  if (hasRealTitle(event.title)) {
    score += 10;
  }
  
  // 2. eventLog（+5 ~ +20）
  const eventLogText = extractTextFromEventLog(event.eventlog);
  const textLength = eventLogText.trim().length;
  
  if (textLength > 0) score += 5;
  if (textLength > 50) score += 5;
  if (textLength > 200) score += 10;
  
  // 3. tags（每个 +2，最多 +20）
  const tagsCount = event.tags?.length ?? 0;
  score += Math.min(tagsCount, 10) * 2;
  
  // 4. 时间信息（+4）
  const hasTime = !isEmptyTime(
    event.timeSpec,
    event.startTime,
    event.endTime,
    event.isAllDay
  );
  if (hasTime) score += 4;
  
  // 5. 地点（+2）
  if (event.location) {
    const locationText = typeof event.location === 'string'
      ? event.location
      : event.location.displayName || event.location.address || '';
    if (locationText.trim().length > 0) score += 2;
  }
  
  // 6. 任务相关（+1 ~ +2）
  if (event.isTask) {
    score += 1;
    if (event.isCompleted) score += 1;
  }
  
  return score;
}

/**
 * EventSnapshot - 事件快照（用于 EventHistory 的 best snapshot）
 */
export interface EventSnapshot {
  eventId: string;
  capturedAt: string; // ISO 8601 时间戳
  title?: any;        // 保留原始格式
  tags?: string[];
  eventLog?: EventLog;
  timeSpec?: any;
  startTime?: string;
  endTime?: string;
  isAllDay?: boolean;
  location?: string | any;
  isTask?: boolean;
  isCompleted?: boolean;
  priority?: string;
  dueDateTime?: string;
  score: number;      // contentScore 评分
}

/**
 * 从事件创建快照
 */
export function createSnapshot(event: Event): EventSnapshot {
  return {
    eventId: event.id,
    capturedAt: formatTimeForStorage(new Date()),
    title: event.title,
    tags: event.tags,
    eventLog: typeof event.eventlog === 'object' ? event.eventlog : undefined,
    timeSpec: event.timeSpec,
    startTime: event.startTime,
    endTime: event.endTime,
    isAllDay: event.isAllDay,
    location: event.location,
    isTask: event.isTask,
    isCompleted: event.isCompleted,
    priority: event.priority,
    dueDateTime: event.dueDateTime,
    score: contentScore(event)
  };
}

/**
 * 选择"最富有状态"的快照
 * 
 * 比较规则：
 * 1. 优先选择 score 更高的
 * 2. score 相同时，选择更新的（capturedAt 更晚）
 * 
 * @param a 快照 A（可能为 undefined）
 * @param b 快照 B（可能为 undefined）
 * @returns 最佳快照（如果都为空则返回 undefined）
 */
export function chooseBestSnapshot(
  a: EventSnapshot | undefined,
  b: EventSnapshot | undefined
): EventSnapshot | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  
  // 比较 score
  if (a.score > b.score) return a;
  if (b.score > a.score) return b;
  
  // score 相同，比较时间
  const timeA = new Date(a.capturedAt).getTime();
  const timeB = new Date(b.capturedAt).getTime();
  
  return timeA >= timeB ? a : b;
}

/**
 * 从快照重建事件（用于恢复）
 * 注意：只恢复用户内容字段，不恢复元数据（id, createdAt 等）
 */
export function restoreFromSnapshot(snapshot: EventSnapshot): Partial<Event> {
  return {
    title: snapshot.title,
    tags: snapshot.tags,
    eventlog: snapshot.eventLog,
    timeSpec: snapshot.timeSpec,
    startTime: snapshot.startTime,
    endTime: snapshot.endTime,
    isAllDay: snapshot.isAllDay,
    location: snapshot.location,
    isTask: snapshot.isTask,
    isCompleted: snapshot.isCompleted,
    priority: snapshot.priority as any,
    dueDateTime: snapshot.dueDateTime
  };
}
