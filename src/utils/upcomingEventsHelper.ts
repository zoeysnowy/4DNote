import { Event } from '@frontend/types';
import { isSystemProgressSubEvent } from '@frontend/utils/eventFacets';
import { TagService } from '@backend/TagService';
import { parseLocalTimeStringOrNull } from './timeUtils';

export type TimeFilter = 'today' | 'tomorrow' | 'week' | 'nextWeek' | 'all';

/**
 * 获取时间范围的开始和结束时间
 */
export function getTimeRange(filter: TimeFilter, now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (filter) {
    case 'today':
      // 今天 00:00 - 23:59
      return { start, end };

    case 'tomorrow':
      // 明天 00:00 - 23:59
      start.setDate(start.getDate() + 1);
      end.setDate(end.getDate() + 1);
      return { start, end };

    case 'week':
      // 本周（周一到周日）
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 调整到周一
      start.setDate(start.getDate() + diff);
      end.setDate(start.getDate() + 6); // 到周日
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'nextWeek':
      // 下周（下周一到下周日）
      const currentDayOfWeek = start.getDay();
      const daysToNextMonday = currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek;
      start.setDate(start.getDate() + daysToNextMonday);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'all':
      // 所有事件（从今天开始）
      end.setFullYear(end.getFullYear() + 10); // 未来10年
      return { start, end };

    default:
      return { start, end };
  }
}

/**
 * 判断事件是否在指定时间范围内
 * ✅ 符合 TIME_ARCHITECTURE：强制使用 timeSpec.resolved
 */
export function isEventInRange(event: Event, start: Date, end: Date): boolean {
  // ✅ 强制使用 timeSpec.resolved（TIME_ARCHITECTURE 规范）
  if (!event.timeSpec?.resolved?.start) {
    return false; // 没有 timeSpec 的事件不显示
  }
  
  const eventStart = parseLocalTimeStringOrNull(event.timeSpec.resolved.start);
  if (!eventStart) return false;
  return eventStart >= start && eventStart <= end;
}

/**
 * 判断事件是否已过期
 * ✅ 符合 TIME_ARCHITECTURE：强制使用 timeSpec.resolved
 */
export function isEventExpired(event: Event, now: Date = new Date()): boolean {
  // ✅ 强制使用 timeSpec.resolved（TIME_ARCHITECTURE 规范）
  if (!event.timeSpec?.resolved) {
    return false; // 没有 timeSpec 的事件认为未过期
  }
  
  const resolved = event.timeSpec.resolved;
  
  // 如果有结束时间，使用结束时间判断
  if (resolved.end) {
    const eventEnd = parseLocalTimeStringOrNull(resolved.end);
    if (!eventEnd) return false;
    return eventEnd < now;
  }
  
  // 如果只有开始时间，使用开始时间判断
  if (resolved.start) {
    const eventStart = parseLocalTimeStringOrNull(resolved.start);
    if (!eventStart) return false;
    return eventStart < now;
  }
  
  // 没有时间信息，认为未过期
  return false;
}

/**
 * 计算事件距离现在的时间差（用于排序）
 * ✅ 符合 TIME_ARCHITECTURE：强制使用 timeSpec.resolved
 */
export function getEventTimeDiff(event: Event, now: Date = new Date()): number {
  // ✅ 强制使用 timeSpec.resolved（TIME_ARCHITECTURE 规范）
  if (!event.timeSpec?.resolved) {
    return Infinity; // 没有 timeSpec 的排到最后
  }
  
  const timeString = event.timeSpec.resolved.start || event.timeSpec.resolved.end;
  if (!timeString) {
    return Infinity; // 没有时间信息的排到最后
  }
  
  const eventDate = parseLocalTimeStringOrNull(timeString);
  if (!eventDate) return Infinity;
  return eventDate.getTime() - now.getTime();
}

/**
 * 对事件进行排序：即将开始的优先，然后是过期事件
 */
export function sortEvents(events: Event[], now: Date = new Date()): Event[] {
  if (!events || !Array.isArray(events)) {
    return [];
  }
  
  return events.sort((a, b) => {
    const aExpired = isEventExpired(a, now);
    const bExpired = isEventExpired(b, now);

    // 未过期事件优先
    if (!aExpired && bExpired) return -1;
    if (aExpired && !bExpired) return 1;

    // 同类型事件按时间排序
    const aDiff = getEventTimeDiff(a, now);
    const bDiff = getEventTimeDiff(b, now);

    if (!aExpired && !bExpired) {
      // 未过期事件：距离现在越近越靠前
      return aDiff - bDiff;
    } else {
      // 过期事件：刚过期的靠前（按时间倒序）
      return bDiff - aDiff;
    }
  });
}

/**
 * 筛选并排序事件
 */
export function filterAndSortEvents(
  events: Event[],
  filter: TimeFilter,
  now: Date = new Date()
): { upcoming: Event[]; expired: Event[] } {
  // 防御性检查：如果 events 未定义或不是数组，返回空结果
  if (!events || !Array.isArray(events)) {
    return { upcoming: [], expired: [] };
  }

  const { start, end } = getTimeRange(filter, now);

  // 筛选事件（严格按顺序）：
  // 1. checkType !== 'none' && checkType !== undefined （保留有签到需求的事件）
  // 2. + 在时间范围内
  // 3. - 排除系统性子事件/轨迹事件（timerSessionId 存在 或 source='local:timelog'）
  const filteredEvents = events.filter(event => {
    // 步骤1：checkType 过滤（排除 'none' 和 undefined）
    if (!event.checkType || event.checkType === 'none') {
      return false;
    }
    
    // 步骤2：时间范围过滤
    const inRange = isEventInRange(event, start, end);
    if (!inRange) {
      return false;
    }
    
    // 步骤3：排除系统性子事件/轨迹事件
    if (isSystemProgressSubEvent(event)) {
      console.log('🚫 [Panel] 过滤系统事件:', event.title?.simpleTitle || '', {
        checkType: event.checkType,
        source: event.source,
        timerSessionId: (event as any).timerSessionId,
        isTimerId: typeof event.id === 'string' ? event.id.startsWith('timer-') : false,
        startTime: event.startTime
      });
      return false;
    }
    
    // 通过所有3个步骤的检查
    return true;
  });

  // 排序
  const sortedEvents = sortEvents(filteredEvents, now);

  // 分组：即将开始 vs 已过期
  const upcoming: Event[] = [];
  const expired: Event[] = [];

  sortedEvents.forEach(event => {
    if (isEventExpired(event, now)) {
      expired.push(event);
    } else {
      upcoming.push(event);
    }
  });

  console.log('📊 [Panel] 过滤结果统计:', {
    原始事件数: events.length,
    过滤后事件数: filteredEvents.length,
    即将开始: upcoming.length,
    已过期: expired.length,
    已过期事件标题: expired.map(e => e.title?.simpleTitle || '')
  });

  return { upcoming, expired };
}

/**
 * 格式化倒计时文本
 */
export function formatCountdown(event: Event, now: Date = new Date()): string | undefined {
  const timeDiff = getEventTimeDiff(event, now);
  
  if (timeDiff < 0) {
    // 已过期
    return undefined;
  }

  const hours = Math.floor(timeDiff / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `还有${days}天`;
  } else if (hours > 0) {
    return `还有${hours}h`;
  } else if (minutes > 0) {
    return `还有${minutes}min`;
  } else {
    return '即将开始';
  }
}

/**
 * 格式化时间显示文本
 * ✅ 符合 TIME_ARCHITECTURE：强制使用 timeSpec
 */
export function formatTimeLabel(event: Event): string | undefined {
  // 提取时间部分（HH:mm）
  const extractTime = (timeString: string): string => {
    const date = new Date(timeString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // ✅ 强制使用 timeSpec（TIME_ARCHITECTURE 规范）
  if (!event.timeSpec) {
    return undefined; // 没有 timeSpec 的事件不显示时间
  }
  
  // 检查是否全天事件
  if (event.timeSpec.allDay) {
    return '全天';
  }
  
  // 使用 resolved 时间
  if (!event.timeSpec.resolved) {
    return undefined; // 没有 resolved 的不显示时间
  }
  
  const { start, end } = event.timeSpec.resolved;
  
  if (start && end) {
    const startTimeStr = extractTime(start);
    const endTimeStr = extractTime(end);
    return `${startTimeStr}-${endTimeStr}`;
  } else if (start) {
    const startTimeStr = extractTime(start);
    return `${startTimeStr}开始`;
  } else if (end) {
    const endTimeStr = extractTime(end);
    return `${endTimeStr}截止`;
  }
  
  return undefined;
}
