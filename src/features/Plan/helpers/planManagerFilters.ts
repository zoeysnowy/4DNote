/**
 * PlanManager事件过滤逻辑（统一封装）
 *
 * 三步过滤公式（来自PRD Section 2.4）：
 * 1. 并集条件：checkType存在 OR 具有日历能力
 * 2. 排除系统事件：subordinate events (TimerLog, TimeLog等)
 * 3. 过期/完成处理：根据模式决定是否显示
 */

import type { Event } from '@frontend/types';
import { resolveCalendarDateRange } from '@frontend/utils/TimeResolver';
import { parseLocalTimeStringOrNull } from '@frontend/utils/timeUtils';
import { shouldShowInPlan, isActivityTraceEvent } from '@frontend/utils/eventFacets';

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

  // 步骤1: 纳入条件（Plan 页面只纳入 task-like 事件）
  const matchesInclusionCriteria = shouldShowInPlan(event);

  if (!matchesInclusionCriteria) return false;

  // 步骤2: 排除系统事件
  if (isActivityTraceEvent(event)) return false;

  // 步骤3: 过期/完成处理
  if (options.mode === 'normal') {
    // 正常模式：排除已完成事件（如果配置不显示）
    if (!options.showCompleted && event.isCompleted) {
      return false;
    }

    // 排除过期事件（超过7天未完成）
    // 说明：Event 结构中使用 dueDateTime 作为截止时间字段
    if (event.dueDateTime) {
      const dueDate = parseLocalTimeStringOrNull(event.dueDateTime);
      if (dueDate) {
        const now = new Date();
        const daysDiff = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff > 7 && !event.isCompleted) {
          return false;
        }
      }
    }
  } else if (options.mode === 'snapshot' && options.dateRange) {
    // Snapshot模式：按日期范围过滤
    try {
      const { start } = resolveCalendarDateRange(event);
      return start >= options.dateRange.start && start <= options.dateRange.end;
    } catch {
      return false;
    }
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
  const title = event.title;
  const fullTitle = title?.fullTitle;
  if (fullTitle) {
    try {
      const titleSlate = JSON.parse(fullTitle);
      hasRealTitle = titleSlate.some((para: any) => {
        const children = para.children || [];
        return children.some((child: any) => child.text && child.text.trim() !== '');
      });
    } catch {
      hasRealTitle = fullTitle.trim() !== '';
    }
  } else if (title?.simpleTitle && title.simpleTitle.trim() !== '') {
    hasRealTitle = true;
  } else if (title?.colorTitle) {
    // colorTitle 是 Slate JSON 格式（简化）——尽量解析出真实文本
    try {
      const titleSlate = JSON.parse(title.colorTitle);
      hasRealTitle = titleSlate.some((para: any) => {
        const children = para.children || [];
        return children.some((child: any) => child.text && child.text.trim() !== '');
      });
    } catch {
      hasRealTitle = title.colorTitle.trim() !== '';
    }
  }

  // 检查eventlog
  let hasEventlog = false;
  if (event.eventlog && typeof event.eventlog === 'object') {
    // 检查slateJson是否有实际文本内容
    if ((event.eventlog as any).slateJson) {
      try {
        const slateNodes = JSON.parse((event.eventlog as any).slateJson);
        hasEventlog = slateNodes.some((node: any) => {
          const children = node.children || [];
          return children.some((child: any) => child.text && child.text.trim() !== '');
        });
      } catch {
        hasEventlog = false;
      }
    }
    // 如果slateJson没有内容，检查plainText
    if (!hasEventlog && (event.eventlog as any).plainText) {
      hasEventlog = !!(event.eventlog as any).plainText.trim();
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
