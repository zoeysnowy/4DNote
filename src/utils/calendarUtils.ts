/**
 * Calendar Utils - 日历数据转换工具
 * 
 * 负责 4DNote Event 与 TUI Calendar EventObject 之间的数据转换
 * 
 * @charset UTF-8
 * @author Zoey Gong
 * @version 2.0.0 - 重构使用统一的CalendarService
 */

import type { EventObject } from '../lib/tui.calendar/apps/calendar';
import { Event } from '@frontend/types';
import { EventHub } from '@backend/EventHub';
import { parseLocalTimeString, formatTimeForStorage } from './timeUtils';
import { CalendarService } from '@backend/CalendarService';
import dayjs from 'dayjs';
import { resolveCalendarDateRange } from './TimeResolver';
import { resolveDisplayTitle } from './TitleResolver';

/**
 * Get a human-readable tag label from a (possibly hierarchical) tag list.
 */
export function getTagLabel(tagId: string | undefined, tags: any[]): string | undefined {
  if (!tagId) return undefined;

  const findTag = (tagList: any[]): any => {
    for (const tag of tagList) {
      if (tag?.id === tagId) return tag;
      if (Array.isArray(tag?.children) && tag.children.length > 0) {
        const found = findTag(tag.children);
        if (found) return found;
      }
    }
    return null;
  };

  const tag = findTag(tags);
  const label = (tag?.displayName || tag?.name) as string | undefined;
  return typeof label === 'string' && label.trim().length > 0 ? label : undefined;
}

/**
 * 生成唯一ID
 */
export function generateEventId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取标签颜色
 * @param tagId 标签ID
 * @param tags 标签列表
 * @returns 颜色值
 */
export function getTagColor(tagId: string | undefined, tags: any[]): string {
  if (!tagId) {
    return '#3788d8'; // 默认颜色
  }
  
  const findTag = (tagList: any[]): any => {
    for (const tag of tagList) {
      if (tag.id === tagId) return tag;
      if (tag.children && tag.children.length > 0) {
        const found = findTag(tag.children);
        if (found) return found;
      }
    }
    return null;
  };
  
  const tag = findTag(tags);
  const color = tag?.color || '#3788d8';
  
  return color;
}

/**
 * 获取事件颜色（支持多标签，返回第一个标签的颜色）
 * @param event 事件对象
 * @param tags 标签列表
 * @returns 颜色值
 */
export function getEventColor(event: Event, tags: any[]): string {
  // Priority 1: tags (user grouping)
  if (event.tags && event.tags.length > 0) {
    const firstTagId = event.tags[0];
    const color = getTagColor(firstTagId, tags);
    if (color) return color;
  }

  // Priority 2: calendarIds (external calendars)
  if (event.calendarIds && event.calendarIds.length > 0) {
    const calendarColor = CalendarService.getColor(event.calendarIds[0]);
    if (calendarColor) return calendarColor;
  }

  // Default
  return '#3788d8';
}

function stripLeadingTimestampBlocksForCalendar(raw: string): string {
  // Keep consistent with EventService timestamp parsing.
  const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})(?:\s*\|\s*[^\n]+)?/;
  const signatureLinePattern = /^\s*(?:由\s+.+?\s+)?(?:创建于|最后修改于|最后编辑于|编辑于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.*$/;

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();
    if (!line) {
      i++;
      continue;
    }
    if (signatureLinePattern.test(line)) {
      i++;
      continue;
    }

    const m = line.match(timestampPattern);
    if (m) {
      const rest = line.slice(m[0].length).trim();
      if (!rest) {
        i++;
        continue;
      }
      out.push(rest);
      i++;
      break;
    }

    out.push(line);
    i++;
    break;
  }

  for (; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    if (signatureLinePattern.test(line)) continue;
    out.push(line);
  }

  return out.join('\n');
}

function normalizeCalendarDisplayTitle(raw: string): string {
  const original = (raw ?? '').toString();
  let trimmed = original.trim();
  if (!trimmed) return '';

  // Preserve the running-timer prefix while sanitizing the rest.
  let prefix = '';
  if (trimmed.startsWith('[专注中]')) {
    prefix = '[专注中] ';
    trimmed = trimmed.replace(/^\[专注中\]\s*/, '');
  }

  const looksLikeSlateJson = (() => {
    const t = trimmed.trim();
    if (!t) return false;
    if (t === '[]') return true;
    if (t.startsWith('[{') || t.startsWith('[ {')) return true;
    if (t.startsWith('"[{') || t.startsWith('"[ {')) return true;
    if (t.startsWith('{') || t.startsWith('"{')) {
      // Sometimes a whole EventLog-like object gets stringified into title.
      return t.includes('slateJson') || t.includes('plainText') || t.includes('children');
    }
    return false;
  })();

  if (looksLikeSlateJson) {
    const extracted = extractPlainTextFromSlateJsonForCalendar(trimmed);
    // If it looks like Slate JSON but we can't parse meaningful text,
    // treat it as invalid and allow later fallbacks (eventlog/Untitled).
    trimmed = extracted ? extracted : '';
  }

  if (!trimmed) return prefix.trim();

  trimmed = stripLeadingTimestampBlocksForCalendar(trimmed);
  // Month view expects a single-line title; collapse whitespace.
  trimmed = trimmed.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  return `${prefix}${trimmed}`.trim();
}

function extractPlainTextFromSlateJsonForCalendar(slateJson: string): string {
  try {
    const decode = (value: unknown, depth: number): any => {
      if (depth <= 0) return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
          try {
            return decode(JSON.parse(trimmed), depth - 1);
          } catch {
            return value;
          }
        }
        return value;
      }
      return value;
    };

    const decoded = decode(slateJson, 2);
    const nodes = Array.isArray(decoded) ? decoded : (decoded ? [decoded] : []);
    if (nodes.length === 0) return '';

    const extractText = (node: any): string => {
      if (!node || typeof node !== 'object') return '';
      if (typeof node.text === 'string') return node.text;
      if (Array.isArray(node.children)) return node.children.map(extractText).join('');
      return '';
    };

    return nodes.map(extractText).join('\n').trim();
  } catch {
    return '';
  }
}

function tryExtractSlateTextFromUnknownString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  // Heuristic: Slate JSON is typically an array of nodes.
  if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
    const extracted = extractPlainTextFromSlateJsonForCalendar(trimmed);
    if (extracted) return extracted;
  }

  return '';
}

/**
 * 从 CalendarService 获取日历颜色
 * @deprecated 使用 CalendarService.getColor() 代替
 * @param calendarId 日历ID
 * @returns 颜色值或null
 */
export function getCalendarGroupColor(calendarId: string): string | null {
  return CalendarService.getColor(calendarId);
}

/**
 * 获取可用日历列表（用于EventEditModal的availableCalendars）
 * 包含所有同步的日历 + 特殊选项（"创建自本地"、"未同步至日历"）
 * 
 * @returns 日历列表，每个日历包含 id, name, color（十六进制颜色值）
 */
export function getAvailableCalendarsForSettings(): Array<{ id: string; name: string; color: string }> {
  // 使用新的 CalendarService 获取日历列表
  const calendars = CalendarService.getCalendars(true); // includeSpecial = true
  
  return calendars.map(cal => ({
    id: cal.id,
    name: cal.name,
    color: cal.color
  }));
}

/**
 * 获取标签显示名称（支持层级）
 * @param tagId 标签ID
 * @param tags 标签列表
 * @returns 显示名称
 */
export function getTagDisplayName(tagId: string | undefined, tags: any[]): string {
  if (!tagId) return '未分类';
  
  const findTagWithPath = (tagList: any[], parentPath: string = ''): string => {
    for (const tag of tagList) {
      const currentPath = parentPath ? `${parentPath} > ${tag.name}` : tag.name;
      if (tag.id === tagId) return currentPath;
      if (tag.children && tag.children.length > 0) {
        const found = findTagWithPath(tag.children, currentPath);
        if (found) return found;
      }
    }
    return '';
  };
  
  return findTagWithPath(tags) || '未分类';
}

/**
 * 扁平化标签树结构
 * @param tags 层级标签数组
 * @returns 扁平化的标签数组
 */
export function flattenTags(tags: any[]): any[] {
  const result: any[] = [];
  
  const flatten = (tagList: any[], parentName = '', level = 0) => {
    tagList.forEach(tag => {
      const displayName = parentName ? `${parentName} > ${tag.name}` : tag.name;
      result.push({
        ...tag,
        displayName,
        parentName,
        level
      });
      
      if (tag.children && tag.children.length > 0) {
        flatten(tag.children, displayName, level + 1);
      }
    });
  };
  
  flatten(tags);
  return result;
}

/**
 * 将事件对象转换为 TUI Calendar 所需的格式
 * @param event 事件对象
 * @param tags 标签列表（用于获取颜色）
 * @param runningTimerEventId 当前运行的timer事件ID
 * @param isWidgetMode 是否为Widget模式
 * @returns TUI Calendar 事件对象
 */
export function convertToCalendarEvent(
  event: Event, 
  tags: any[] = [],
  runningTimerEventId: string | null = null,
  isWidgetMode: boolean = false
): Partial<EventObject> {
  // ✅ TimeResolver：统一“时间展示/日期落位”的派生逻辑（不回写 canonical 字段）
  const { start: startDate, end: endDate } = resolveCalendarDateRange(event);
  
  // 🎨 使用getEventColor获取正确的颜色（支持多标签和日历颜色）
  const eventColor = getEventColor(event, tags);
  
  // 📋 calendarId 决定 ToastUI 的分组与 DOM 结构。
  // 口径（按你的优先级）：tagId > calendarId > default。
  // 重要：为了避免“未知 calendar”导致 month view DOM 分支差异，
  // getCalendars() 必须注册这些 tagId（见 createCalendarsFromCalendarService 的合并逻辑）。
  let calendarId = 'default';
  if (event.tags && event.tags.length > 0) {
    calendarId = event.tags[0];
  } else if (event.calendarIds && event.calendarIds.length > 0) {
    calendarId = event.calendarIds[0];
  }
  
  // 🎯 确定事件类型（category）
  // TUI Calendar 支持: 'milestone', 'task', 'allday', 'time'
  let category: 'milestone' | 'task' | 'allday' | 'time' = 'time';
  
  // 优先使用新的布尔字段（isDeadline, isTask）
  if (event.isDeadline) {
    category = 'milestone';
  } else if (event.isTask) {
    category = 'task';
  } 
  // 回退到旧的 category 字符串字段（向后兼容）
  else if (event.category === 'milestone') {
    category = 'milestone';
  } else if (event.category === 'task') {
    category = 'task';
  } 
  // 全天事件
  else if (event.isAllDay) {
    category = 'allday';
  } 
  // 默认时间事件
  else {
    category = 'time';
  }
  
  // 🔧 前端渲染时添加"[专注中]"标记（仅计时中的事件）
  // localStorage 中不包含此标记，避免事件重复
  const isCurrentlyRunningTimer = runningTimerEventId !== null && event.id === runningTimerEventId;
  
  // 🔧 修复：保持已有的"[专注中]"前缀，或为当前运行的timer添加前缀
  let displayTitle = resolveDisplayTitle(
    event,
    {
      getTagLabel: (id: string) => getTagLabel(id, tags) || id,
    },
    {
      // TimeCalendar: prefer pure text title layer; fall back to tags/eventlog if needed.
      preferredLayer: 'simpleTitle',
      fallback: '',
      maxLength: 50,
    }
  );
  
  // 🆕 v1.1: 对于全天事件，优先使用 displayHint 作为标题
  const eventWithHint = event as any;
  if (eventWithHint.displayHint && event.isAllDay) {
    displayTitle = eventWithHint.displayHint; // 使用 displayHint（如"本周"、"下周 全天"等）
  }

  // Final fallback to avoid empty titles breaking layout.
  if (!displayTitle) {
    displayTitle = 'Untitled';
  }
  
  if (isWidgetMode) {
    // 🆕 Widget模式：简化的前缀同步逻辑
    // 如果事件已经有[专注中]前缀，说明主程序认为它正在运行，Widget也应该显示前缀
    // displayTitle 已经初始化为 simpleTitle，这里只需要检查是否保持即可
    if (!displayTitle.startsWith('[专注中]')) {
      // Widget 模式不添加前缀，保持原样
    }
  } else {
    // 主程序模式：使用复杂的timer状态检测逻辑
    if (isCurrentlyRunningTimer && !displayTitle.startsWith('[专注中]')) {
      // 当前运行的timer且title没有前缀 -> 添加前缀
      displayTitle = `[专注中] ${displayTitle}`;
    }
    // 其他情况保持原 displayTitle（已经是 simpleTitle 或 displayHint）
  }
  
  // 🔍 调试：检查"[专注中]"前缀逻辑
  // if (event.id && event.id.includes('timer-')) {
  //   console.log('🔍 [专注中 DEBUG] Timer event processing:', {
  //     eventId: event.id,
  //     eventTitle: event.title,
  //     runningTimerEventId,
  //     isCurrentlyRunningTimer,
  //     isWidgetMode,
  //     titleHasPrefix: event.title.startsWith('[专注中]'),
  //     displayTitle,
  //     idsMatch: event.id === runningTimerEventId
  //   });
  // }
  
  return {
    id: event.id,
    calendarId: calendarId,
    title: displayTitle,
    body: event.description || '',
    start: startDate,
    end: endDate,
    isAllday: event.isAllDay || false,
    category: category,
    location: event.location || '',
    // 颜色配置
    color: '#ffffff',
    backgroundColor: eventColor,
    borderColor: eventColor,
    dragBackgroundColor: eventColor,
    // 自定义数据（保留原始事件信息）
    raw: {
      remarkableEvent: event,
      externalId: event.externalId,
      syncStatus: event.syncStatus,
      tags: event.tags,
      calendarIds: event.calendarIds,
      category: event.category
    }
  };
}

/**
 * 将 TUI Calendar EventObject 转换为 4DNote Event
 * @param calendarEvent TUI Calendar 事件对象
 * @param originalEvent 原始事件（用于保留某些字段）
 * @returns ReMarkable 事件对象
 */
/**
 * 🔥 简化版：只做字段映射，不做复杂转换
 * 所有数据规范化交给 EventService.normalizeEvent() 统一处理
 * 
 * @param calendarEvent - TUI Calendar 事件对象
 * @param originalEvent - 原始 Event 对象（用于继承同步信息）
 * @returns 部分 Event 数据（等待 EventService 规范化）
 */
export function convertFromCalendarEvent(
  calendarEvent: any, 
  originalEvent?: Event
): Partial<Event> {
  const now = new Date();
  const nowStr = formatTimeForStorage(now);
  
  // 如果有原始事件数据，优先使用
  if (calendarEvent.raw?.remarkableEvent) {
    return {
      ...calendarEvent.raw.remarkableEvent,
      // ✅ 只更新被修改的字段，传递原始字符串（让 EventService 规范化）
      title: calendarEvent.title,  // ✅ 简单字符串，EventService 会转换为 EventTitle
      description: calendarEvent.body,  // ✅ 简单字符串，EventService 会生成 EventLog
      startTime: formatTimeForStorage(calendarEvent.start),
      endTime: formatTimeForStorage(calendarEvent.end),
      isAllDay: calendarEvent.isAllday || false,
      location: calendarEvent.location,
      updatedAt: nowStr
    };
  }
  
  // ✅ 创建新事件：只传原始数据，不做复杂转换
  return {
    id: calendarEvent.id || generateEventId(),
    title: calendarEvent.title || '(无标题)',  // ✅ 简单字符串
    description: calendarEvent.body || '',      // ✅ 简单字符串
    // ❌ 不再自己创建 eventlog，交给 EventService.normalizeEvent()
    // 🔧 修复时区问题：使用 dayjs 格式化避免 UTC 转换
    startTime: dayjs(calendarEvent.start).format('YYYY-MM-DD HH:mm:ss'),
    endTime: dayjs(calendarEvent.end).format('YYYY-MM-DD HH:mm:ss'),
    isAllDay: calendarEvent.isAllday || false,
    location: calendarEvent.location || '',
    tags: calendarEvent.calendarId !== 'default' ? [calendarEvent.calendarId] : [],
    // 继承原始事件的同步信息
    externalId: originalEvent?.externalId,
    syncStatus: originalEvent?.syncStatus,
    calendarIds: originalEvent?.calendarIds,
    fourDNoteSource: true,
    // 时间戳
    createdAt: originalEvent?.createdAt || nowStr,
    updatedAt: nowStr,
    lastLocalChange: nowStr,
    localVersion: (originalEvent?.localVersion || 0) + 1
  };
}

/**
 * 批量转换 4DNote Events 到 TUI Calendar Events
 * @param events ReMarkable 事件数组
 * @param tags 标签列表
 * @returns TUI Calendar 事件数组
 */
export function convertToCalendarEvents(
  events: Event[], 
  tags: any[] = []
): Partial<EventObject>[] {
  return events.map(event => convertToCalendarEvent(event, tags));
}

/**
 * 创建日历分组配置
 * @param tags 标签列表
 * @returns TUI Calendar 的 calendars 配置
 */
export function createCalendarsFromTags(tags: any[]): any[] {
  const flatTags = flattenTags(tags);
  // 使用所有标签创建日历分组
  const eventTags = flatTags;
  
  const defaultColor = '#3788d8';
  
  return [
    {
      id: 'default',
      name: '默认日历',
      color: '#ffffff',
      backgroundColor: defaultColor,
      borderColor: defaultColor,
      dragBackgroundColor: defaultColor
    },
    ...eventTags.map(tag => {
      const tagColor = tag.color || defaultColor;
      return {
        id: tag.id,
        name: tag.displayName || tag.name,
        color: '#ffffff',
        backgroundColor: tagColor,
        borderColor: tagColor,
        dragBackgroundColor: tagColor
      };
    })
  ];
}

/**
 * Create calendars from CalendarService (external calendar grouping).
 * This aligns event colors with `event.calendarIds`.
 */
export function createCalendarsFromCalendarService(sourceCalendars?: any[], tags?: any[]): any[] {
  const defaultColor = '#3788d8';
  const calendars = Array.isArray(sourceCalendars) && sourceCalendars.length > 0
    ? sourceCalendars
    : CalendarService.getCalendars(false);

  const flatTags = Array.isArray(tags) ? flattenTags(tags) : [];

  const isHexColor = (value: unknown): value is string =>
    typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);

  const base = [
    {
      id: 'default',
      name: '默认日历',
      color: '#ffffff',
      backgroundColor: defaultColor,
      borderColor: defaultColor,
      dragBackgroundColor: defaultColor
    },
    ...calendars.map(cal => {
      const serviceColor = typeof cal?.id === 'string' ? CalendarService.getColor(cal.id) : null;
      const color = (serviceColor && isHexColor(serviceColor))
        ? serviceColor
        : (isHexColor(cal?.color) ? cal.color : defaultColor);
      return {
        id: cal.id,
        name: (cal as any).displayName || cal.name || cal.id,
        color: '#ffffff',
        backgroundColor: color,
        borderColor: color,
        dragBackgroundColor: color
      };
    })
  ];

  // Add tag calendars so `calendarId=tagId` is always a known calendar.
  // This keeps ToastUI month/week DOM structure consistent (only color differs).
  const existingIds = new Set(base.map(c => c.id));
  const tagCalendars = flatTags
    .filter(tag => tag?.id && !existingIds.has(tag.id))
    .map(tag => {
      const tagColor = isHexColor(tag?.color) ? tag.color : defaultColor;
      return {
        id: tag.id,
        name: tag.displayName || tag.name || tag.id,
        color: '#ffffff',
        backgroundColor: tagColor,
        borderColor: tagColor,
        dragBackgroundColor: tagColor
      };
    });

  return [...base, ...tagCalendars];
}

/**
 * 验证事件数据完整性
 * @param event 事件对象
 * @returns 是否有效
 */
export function validateEvent(event: Partial<Event>): boolean {
  // Field contract: title/startTime/endTime can be optional.
  // Only validate time ordering when both startTime and endTime are present.
  const hasStart = !!event.startTime;
  const hasEnd = !!event.endTime;

  // One-sided time is almost always data corruption.
  // Exception: tasks may store a planned endTime without startTime.
  if (hasStart !== hasEnd) {
    const isTask = (event as any).isTask === true;
    if (isTask && hasEnd && !hasStart) return true;
    console.error('❌ Event validation failed: startTime and endTime must either both exist or both be absent');
    return false;
  }

  // No-time events (e.g., tasks) are valid.
  if (!hasStart && !hasEnd) return true;

  const start = parseLocalTimeString(event.startTime);
  const end = parseLocalTimeString(event.endTime);

  if (start.getTime() >= end.getTime()) {
    console.error('❌ Event validation failed: endTime must be after startTime');
    return false;
  }

  return true;
}

/**
 * 合并事件更新
 * @param original 原始事件
 * @param updates 更新内容
 * @returns 合并后的事件
 */
export function mergeEventUpdates(original: Event, updates: Partial<Event>): Event {
  return {
    ...original,
    ...updates,
    id: original.id, // ID 不能被修改
    createdAt: original.createdAt, // 创建时间不能被修改
    updatedAt: formatTimeForStorage(new Date()),
    lastLocalChange: formatTimeForStorage(new Date()),
    localVersion: (original.localVersion || 0) + 1
  };
}
