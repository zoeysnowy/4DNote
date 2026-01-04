/**
 * 统一时间管理工具
 * 
 * 解决 TimeHub、EventService、PlanItem metadata 三处时间不同步的问题
 * 
 * 设计原则：
 * 1. TimeHub 是时间的"唯一数据源"（Single Source of Truth）
 * 2. 所有读取时间的操作都通过 getEventTime() 统一接口
 * 3. 所有设置时间的操作都通过 setEventTime() 统一接口
 * 
 * @module timeManager
 * @version 1.6
 * @date 2025-11-08
 */

import { TimeHub } from '@backend/TimeHub';
import { EventHub } from '@backend/EventHub';  // 🎯 使用 EventHub
import { dbg } from './debugLogger';

/**
 * 时间数据结构
 */
export interface EventTime {
  start: string | null;
  end: string | null;
  dueDate?: string | null;
  isAllDay?: boolean;
  timeSpec?: any;
}

/**
 * 获取事件时间（统一接口）
 * 
 * 优先级：TimeHub > EventService > fallback
 * 
 * @param eventId - 事件 ID
 * @param fallback - 兜底数据（当 TimeHub 和 EventService 都没有时使用）
 * @returns EventTime
 */
export function getEventTime(eventId: string, fallback?: Partial<EventTime>): EventTime {
  // 优先级 1: TimeHub（时间的唯一数据源）
  const snapshot = TimeHub.getSnapshot(eventId);
  if (snapshot.start && snapshot.end) {
    dbg('time', '📖 从 TimeHub 读取时间', {
      eventId,
      source: 'TimeHub',
      start: snapshot.start,
      end: snapshot.end,
      allDay: snapshot.timeSpec?.allDay,
    });
    
    return {
      start: snapshot.start,
      end: snapshot.end,
      isAllDay: snapshot.timeSpec?.allDay ?? false,
      timeSpec: snapshot.timeSpec,
    };
  }
  
  // 优先级 2: Fallback
  if (fallback?.start || fallback?.end) {
    dbg('time', '📖 使用 fallback 时间', {
      eventId,
      source: 'fallback',
      start: fallback.start,
      end: fallback.end,
    });
    
    return {
      start: fallback.start ?? null,
      end: fallback.end ?? null,
      dueDate: fallback.dueDate,
      isAllDay: fallback.isAllDay ?? false,
      timeSpec: fallback.timeSpec,
    };
  }
  
  // 没有时间数据
  dbg('time', '⚠️ 无时间数据', { eventId });
  return {
    start: null,
    end: null,
    isAllDay: false,
  };
}

/**
 * 设置事件时间（统一接口）
 * 
 * 同步到：TimeHub + EventHub（而不是直接调用 EventService）
 * 
 * @param eventId - 事件 ID
 * @param time - 时间数据
 * @returns Promise<EventTime> - 返回设置后的完整时间数据（用于更新 metadata）
 */
export async function setEventTime(
  eventId: string, 
  time: Partial<EventTime>
): Promise<EventTime> {
  const { start, end, dueDate, isAllDay, timeSpec } = time;
  
  dbg('time', '🖊️ 设置事件时间', {
    eventId,
    start,
    end,
    dueDate,
    isAllDay,
  });
  
  // 🎯 Step 1: 通过 EventHub 更新时间（EventHub 内部会调用 TimeHub）
  if (start && end) {
    const payload: any = {
      start,
      end,
      source: 'planmanager',
      ...timeSpec,
    };
    // Field contract: isAllDay 保持可选；不要默认注入 false
    if (typeof isAllDay === 'boolean') {
      payload.allDay = isAllDay;
    }

    const result = await EventHub.setEventTime(eventId, payload);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to set event time');
    }
    
    dbg('time', '✅ EventHub 更新成功', { eventId, start, end });
  }
  
  // 🎯 Step 2: 如果有其他非时间字段（dueDateTime），通过 EventHub.updateFields 更新
  if (dueDate) {
    await EventHub.updateFields(eventId, {
      dueDateTime: dueDate,
    }, {
      source: 'planmanager-duedatetime'
    });
  }
  
  // Step 3: 返回完整的时间数据（用于更新 PlanItem metadata）
  return {
    start: start ?? null,
    end: end ?? null,
    dueDate: dueDate ?? null,
    // UI 侧仍然可以把 undefined 当作 false 渲染；这里保持旧行为
    isAllDay: isAllDay ?? false,
    timeSpec,
  };
}

/**
 * 判断事件是否为任务（Task）
 * 
 * 规则：
 * - 有完整起止时间 → Event
 * - 只有一个时间或无时间 → Task
 * 
 * @param time - 事件时间
 * @returns boolean
 */
export function isTask(time: EventTime): boolean {
  const hasStart = !!time.start;
  const hasEnd = !!time.end;
  
  // 有完整起止时间 → Event
  if (hasStart && hasEnd) {
    return false;
  }
  
  // 其他情况 → Task
  return true;
}

/**
 * 清除事件时间（删除时调用）
 * 
 * @param eventId - 事件 ID
 */
export async function clearEventTime(eventId: string): Promise<void> {
  dbg('time', '🗑️ 清除事件时间', { eventId });
  
  // TimeHub 会在 EventService 删除事件时自动清除缓存
  // 这里不需要额外操作
  
  dbg('time', '✅ 时间清除成功', { eventId });
}
