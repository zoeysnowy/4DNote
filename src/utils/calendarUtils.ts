/**
 * Calendar Utils - 日历数据转换工具
 * 
 * 负责 4DNote Event 与 TUI Calendar EventObject 之间的数据转换
 * 
 * @charset UTF-8
 * @author Zoey Gong
 * @version 1.0.0
 */

import type { EventObject } from '../lib/tui.calendar/apps/calendar';
import { Event } from '../types';
import { EventHub } from '../services/EventHub';
import { parseLocalTimeString, formatTimeForStorage } from './timeUtils';
import dayjs from 'dayjs';

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
  // 优先级 1: 如果有 tags 数组，使用第一个标签的颜色
  if (event.tags && event.tags.length > 0) {
    const firstTagId = event.tags[0];
    const color = getTagColor(firstTagId, tags);
    if (color && color !== '#3788d8') {
      return color;
    }
  }

  // 优先级 2: 回退到事件关联的日历分组颜色
  if (event.calendarIds && event.calendarIds.length > 0) {
    const calendarColor = getCalendarGroupColor(event.calendarIds[0]);
    if (calendarColor) return calendarColor;
  }

  // 优先级 3: 默认蓝色
  return '#3788d8';
}

/**
 * 从 localStorage 获取日历分组颜色
 * @param calendarId 日历ID
 * @returns 颜色值或null
 */
export function getCalendarGroupColor(calendarId: string): string | null {
  try {
    const calendarsCache = localStorage.getItem('4dnote-calendars-cache');
    if (!calendarsCache) return null;
    
    const calendars = JSON.parse(calendarsCache);
    const calendar = calendars.find((cal: any) => cal.id === calendarId);
    
    // Microsoft Calendar颜色名称映射
    if (calendar?.color) {
      return convertMicrosoftColorToHex(calendar.color);
    }
    
    // 如果calendar对象有backgroundColor，直接使用
    if (calendar?.backgroundColor) {
      return calendar.backgroundColor;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to get calendar color:', error);
    return null;
  }
}

/**
 * 获取可用日历列表（用于EventEditModal的availableCalendars）
 * 包含所有同步的日历 + 特殊选项（"创建自本地"、"未同步至日历"）
 * 
 * @returns 日历列表，每个日历包含 id, name, color（十六进制颜色值）
 */
export function getAvailableCalendarsForSettings(): Array<{ id: string; name: string; color: string }> {
  try {
    const savedCalendars = localStorage.getItem('4dnote-calendars-cache');
    const regularCalendars = savedCalendars
      ? JSON.parse(savedCalendars).map((cal: any) => ({
          id: cal.id,
          name: cal.name,
          // 🎨 使用getCalendarGroupColor获取正确的十六进制颜色
          color: getCalendarGroupColor(cal.id) || '#3788d8'
        }))
      : [];
    
    // ✅ 添加特殊选项："创建自本地" 和 "未同步至日历"
    return [
      ...regularCalendars,
      {
        id: 'local-created',
        name: '🔮 创建自本地',
        color: '#9c27b0'
      },
      {
        id: 'not-synced',
        name: '🔄 未同步至日历',
        color: '#ff9800'
      }
    ];
  } catch (error) {
    console.error('Failed to load calendars:', error);
    // 即使出错，也返回特殊选项
    return [
      {
        id: 'local-created',
        name: '🔮 创建自本地',
        color: '#9c27b0'
      },
      {
        id: 'not-synced',
        name: '🔄 未同步至日历',
        color: '#ff9800'
      }
    ];
  }
}

/**
 * 将Microsoft颜色名称转换为十六进制颜色
 * @param colorName Microsoft颜色名称
 * @returns 十六进制颜色值
 */
function convertMicrosoftColorToHex(colorName: string): string {
  const colorMap: { [key: string]: string } = {
    'auto': '#3788d8',
    'lightBlue': '#5194f0',
    'lightGreen': '#42b883',
    'lightOrange': '#ff8c42',
    'lightGray': '#9ca3af',
    'lightYellow': '#f1c40f',
    'lightTeal': '#48c9b0',
    'lightPink': '#f48fb1',
    'lightBrown': '#a0826d',
    'lightRed': '#e74c3c',
    'maxColor': '#6366f1'
  };
  
  return colorMap[colorName] || '#3788d8';
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
  // 🔧 修复：对于无时间的 Task，使用 createdAt 作为日期，但不设置具体时间
  // 适用场景：Plan 页面创建的待办事项，用户未设置时间
  let startDate: Date;
  let endDate: Date;
  
  if ((!event.startTime || !event.endTime) && event.isTask) {
    // 📋 Task 类型且无时间：只使用 createdAt 的日期部分
    const createdDate = parseLocalTimeString(event.createdAt);
    startDate = new Date(createdDate);
    startDate.setHours(0, 0, 0, 0); // 只保留日期，时间设为 00:00
    endDate = new Date(startDate); // Task 的 end 等于 start
  } else {
    // ⏰ 有时间的事件：使用实际的 startTime/endTime
    startDate = parseLocalTimeString(event.startTime || event.createdAt);
    endDate = parseLocalTimeString(event.endTime || event.createdAt);
  }
  
  // 🎨 使用getEventColor获取正确的颜色（支持多标签和日历颜色）
  const eventColor = getEventColor(event, tags);
  
  // 📋 确定 calendarId：使用第一个标签或 calendarId
  let calendarId = 'default';
  if (event.tags && event.tags.length > 0) {
    calendarId = event.tags[0]; // 使用第一个标签作为日历分组
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
  let displayTitle: string = '';
  
  // ✅ 提取标题：simpleTitle 可能是纯文本或 Slate JSON，需要智能解析
  const simpleTitle = event.title?.simpleTitle || '';
  if (simpleTitle) {
    try {
      // 尝试解析为 JSON（v2.14+ 新格式：simpleTitle 存储的是 Slate JSON）
      const nodes = JSON.parse(simpleTitle);
      if (Array.isArray(nodes)) {
        // 递归提取文本内容
        const extractText = (node: any): string => {
          if (node.text !== undefined) return node.text;
          if (node.children) return node.children.map(extractText).join('');
          return '';
        };
        displayTitle = nodes.map(extractText).join('\n').trim();
      } else {
        displayTitle = simpleTitle; // 不是数组，作为纯文本使用
      }
    } catch {
      // 不是 JSON（旧格式或纯文本），直接使用
      displayTitle = simpleTitle;
    }
  }
  
  // 🆕 v1.2: 如果既没有标题也没有标签，使用 eventlog 内容作为 fallback
  if (!displayTitle && (!event.tags || event.tags.length === 0)) {
    const eventlog = event.eventlog || (event as any).description;
    if (eventlog) {
      if (typeof eventlog === 'string') {
        // 纯文本或 HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = eventlog;
        displayTitle = (tempDiv.textContent || '').substring(0, 50).trim(); // 取前50字符
      } else if (eventlog.plainText) {
        // EventLog 对象格式
        displayTitle = eventlog.plainText.substring(0, 50).trim();
      } else if (eventlog.html) {
        // EventLog 对象格式（HTML）
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = eventlog.html;
        displayTitle = (tempDiv.textContent || '').substring(0, 50).trim();
      }
      
      if (displayTitle) {
        displayTitle = displayTitle + (displayTitle.length >= 50 ? '...' : ''); // 添加省略号
      }
    }
  }
  
  // 🆕 v1.1: 对于全天事件，优先使用 displayHint 作为标题
  const eventWithHint = event as any;
  if (eventWithHint.displayHint && event.isAllDay) {
    displayTitle = eventWithHint.displayHint; // 使用 displayHint（如"本周"、"下周 全天"等）
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
    // 颜色配置 - 使用事件颜色（标签颜色或日历颜色）
    color: '#ffffff',
    backgroundColor: eventColor,
    borderColor: eventColor,
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
  
  return [
    {
      id: 'default',
      name: '默认日历',
      color: '#ffffff',
      backgroundColor: '#3788d8',
      borderColor: '#3788d8',
      dragBackgroundColor: 'rgba(55, 136, 216, 0.3)'
    },
    ...eventTags.map(tag => ({
      id: tag.id,
      name: tag.displayName || tag.name,
      color: '#ffffff',
      backgroundColor: tag.color || '#3788d8',
      borderColor: tag.color || '#3788d8',
      dragBackgroundColor: `${tag.color}33` || 'rgba(55, 136, 216, 0.3)' // 透明度20%
    }))
  ];
}

/**
 * 验证事件数据完整性
 * @param event 事件对象
 * @returns 是否有效
 */
export function validateEvent(event: Partial<Event>): boolean {
  if (!event.title || !event.title.simpleTitle?.trim()) {
    console.error('❌ Event validation failed: title is required');
    return false;
  }
  
  if (!event.startTime || !event.endTime) {
    console.error('❌ Event validation failed: startTime and endTime are required');
    return false;
  }
  
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
