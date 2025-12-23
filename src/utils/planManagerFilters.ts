/**
 * PlanManager事件过滤逻辑（统一封装）
 * 
 * 三步过滤公式（来自PRD Section 2.4）：
 * 1. 并集条件：isPlan=true OR checkType存在 OR isTimeCalendar=true
 * 2. 排除系统事件：subordinate events (TimerLog, TimeLog等)
 * 3. 过期/完成处理：根据模式决定是否显示
 */

import { Event } from '../types';
import { EventService } from '../services/EventService';

/**
 * 检查事件是否应该显示在PlanManager中
 */
export function shouldShowInPlanManager(
  event: Event,
  options: {
    mode: 'normal' | 'snapshot';
    dateRange?: { start: Date; end: Date };
    showCompleted?: boolean;
  } = { mode: 'normal' }
): boolean {
  // 🗑️ 步骤0: 排除已删除的事件
  if (event.deletedAt) return false;
  
  // 步骤1: 并集条件
  const matchesInclusionCriteria =
    event.isPlan === true ||
    (event.checkType && event.checkType !== 'none') ||
    event.isTimeCalendar === true;

  if (!matchesInclusionCriteria) return false;

  // 步骤2: 排除系统事件
  if (EventService.isSubordinateEvent(event)) return false;

  // 步骤3: 过期/完成处理
  if (options.mode === 'normal') {
    // 正常模式：排除已完成事件（如果配置不显示）
    if (!options.showCompleted && event.isCompleted) {
      return false;
    }

    // 排除过期事件（超过7天未完成）
    if (event.dueDate) {
      const dueDate = new Date(event.dueDate);
      const now = new Date();
      const daysDiff = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff > 7 && !event.isCompleted) {
        return false;
      }
    }
  } else if (options.mode === 'snapshot' && options.dateRange) {
    // Snapshot模式：按日期范围过滤
    if (!event.startTime && !event.endTime && !event.dueDate) {
      return false; // 没有时间的事件不显示
    }

    const eventDate = new Date(event.startTime || event.dueDate || event.endTime!);
    return eventDate >= options.dateRange.start && eventDate <= options.dateRange.end;
  }

  return true;
}

/**
 * 批量过滤事件列表
 */
export function filterPlanEvents(
  events: Event[],
  options: Parameters<typeof shouldShowInPlanManager>[1]
): Event[] {
  return events.filter(event => shouldShowInPlanManager(event, options));
}

/**
 * 检查事件是否为空白事件
 */
export function isEmptyEvent(event: Event): boolean {
  // 检查title
  let hasRealTitle = false;
  if (typeof event.title === 'object' && event.title?.fullTitle) {
    try {
      const titleSlate = JSON.parse(event.title.fullTitle);
      hasRealTitle = titleSlate.some((para: any) => {
        const children = para.children || [];
        return children.some((child: any) => child.text && child.text.trim() !== '');
      });
    } catch (e) {
      hasRealTitle = !!event.title.fullTitle.trim();
    }
  } else if (typeof event.title === 'string') {
    hasRealTitle = !!event.title.trim();
  } else if (event.title?.simpleTitle || event.title?.colorTitle) {
    hasRealTitle = !!(event.title.simpleTitle?.trim() || event.title.colorTitle?.trim());
  }

  // 检查eventlog
  let hasEventlog = false;
  if (event.eventlog && typeof event.eventlog === 'object') {
    // 检查slateJson是否有实际文本内容
    if (event.eventlog.slateJson) {
      try {
        const slateNodes = JSON.parse(event.eventlog.slateJson);
        hasEventlog = slateNodes.some((node: any) => {
          const children = node.children || [];
          return children.some((child: any) => child.text && child.text.trim() !== '');
        });
      } catch (e) {
        hasEventlog = false;
      }
    }
    // 如果slateJson没有内容，检查plainText
    if (!hasEventlog && event.eventlog.plainText) {
      hasEventlog = !!event.eventlog.plainText.trim();
    }
  } else if (event.eventlog && typeof event.eventlog === 'string') {
    hasEventlog = !!event.eventlog.trim();
  }

  const isEmpty =
    !hasRealTitle &&
    !event.content?.trim() &&
    !event.description?.trim() &&
    !hasEventlog &&
    (!event.tags || event.tags.length === 0);

  return isEmpty;
}
