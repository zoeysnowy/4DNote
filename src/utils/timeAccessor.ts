/**
 * 统一的时间字段访问接口
 * TimeHub是唯一的时间数据源
 */

import { TimeHub } from '../services/TimeHub';

export interface EventTime {
  start: string | null;
  end: string | null | undefined;
  isAllDay: boolean;
  dueDate?: string;
}

/**
 * 获取事件的时间信息（唯一来源：TimeHub）
 */
export function getEventTime(eventId: string): EventTime {
  const snapshot = TimeHub.getSnapshot(eventId);
  
  return {
    start: snapshot.start || null,
    end: snapshot.end,
    isAllDay: snapshot.timeSpec?.allDay ?? false,
    dueDate: undefined, // dueDate 不在TimeHub中，需要从Event读取
  };
}

/**
 * 检查事件是否有时间
 */
export function hasEventTime(eventId: string): boolean {
  const { start, end } = getEventTime(eventId);
  return !!(start || end);
}
