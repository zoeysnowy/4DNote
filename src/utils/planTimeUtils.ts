/**
 * Plan 时间处理工具函数
 * 从 PlanManager 提取的时间判断逻辑
 */

import { Event } from '../types';
import { formatTimeForStorage, parseLocalTimeString } from './timeUtils';

export interface TimeRange {
  startTime: string;
  endTime: string;
}

/**
 * 确定事件的时间范围
 * 从 PlanManager 的 syncToUnifiedTimeline 函数提取
 * 
 * 支持 4 种场景：
 * 1. 明确的开始和结束时间
 * 2. 只有开始时间（截止日期）
 * 3. 全天事件
 * 4. 无时间信息（返回 null）
 * 
 * @param item Plan Item（Event对象）
 * @returns 时间范围对象或 null
 */
export function determineEventTime(item: Event): TimeRange | null {
  // 场景 1: 明确的开始和结束时间
  if (item.startTime && item.endTime) {
    return {
      startTime: item.startTime,
      endTime: item.endTime
    };
  }

  // 场景 2: 只有开始时间（视为截止日期）
  if (item.startTime) {
    const startDate = parseLocalTimeString(item.startTime);
    if (!startDate) return null;

    // 创建 30 分钟的时间块
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
    
    return {
      startTime: item.startTime,
      endTime: formatTimeForStorage(endDate)
    };
  }

  // 场景 3: dueDateTime（截止日期/时间）
  if (item.dueDateTime) {
    const dueDate = parseLocalTimeString(item.dueDateTime);
    if (!dueDate) return null;

    // 设置为截止日期当天 23:59
    const startDate = new Date(dueDate);
    startDate.setHours(23, 0, 0, 0);
    const endDate = new Date(dueDate);
    endDate.setHours(23, 59, 0, 0);

    return {
      startTime: formatTimeForStorage(startDate),
      endTime: formatTimeForStorage(endDate)
    };
  }

  // 场景 4: 全天事件（通过 timeSpec 判断）
  if (item.timeSpec?.allDay) {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);

    return {
      startTime: formatTimeForStorage(startDate),
      endTime: formatTimeForStorage(endDate)
    };
  }

  // 无时间信息
  return null;
}

/**
 * 判断 Plan Item 是否应该同步到 Unified Timeline
 * 
 * @param item Plan Item
 * @returns 是否应该同步
 */
export function shouldSyncToTimeline(item: Event): boolean {
  // 必须有 ID
  if (!item.id) return false;

  // 必须有任意时间信息
  const timeRange = determineEventTime(item);
  return timeRange !== null;
}

/**
 * 计算事件持续时长（分钟）
 * 
 * @param startTime 开始时间字符串
 * @param endTime 结束时间字符串
 * @returns 持续时长（分钟）
 */
export function calculateDuration(startTime: string, endTime: string): number {
  const start = parseLocalTimeString(startTime);
  const end = parseLocalTimeString(endTime);
  
  if (!start || !end) return 0;
  
  const durationMs = end.getTime() - start.getTime();
  return Math.round(durationMs / (1000 * 60));
}

/**
 * 验证时间范围的合法性
 * 
 * @param startTime 开始时间字符串
 * @param endTime 结束时间字符串
 * @returns 错误消息，如果合法则返回 null
 */
export function validateTimeRange(startTime: string, endTime: string): string | null {
  const start = parseLocalTimeString(startTime);
  const end = parseLocalTimeString(endTime);
  
  if (!start) return '开始时间格式无效';
  if (!end) return '结束时间格式无效';
  
  if (start >= end) {
    return '开始时间必须早于结束时间';
  }
  
  return null;
}
