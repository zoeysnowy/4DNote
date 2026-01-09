/**
 * Event Facet 推导函数
 * 根据 Contract Section 6.1 实现
 * 
 * 核心原则：通过字段组合推导事件能力，替代废弃的分类 flags
 */

import { Event } from '@frontend/types';
import {
  assertNamespacedEventSource,
  isExternalEventSource,
  isLocalEventSource,
} from '@frontend/utils/eventSourceSSOT';

/**
 * 判断事件是否具有任务能力
 * @param event - 事件对象
 * @returns 是否为任务（有 checkbox）
 */
export function hasTaskFacet(event: Event): boolean {
  return event.checkType !== 'none' && event.checkType !== undefined;
}

/**
 * 判断事件是否具有日历能力
 * @param event - 事件对象
 * @returns 是否有完整的时间段（startTime && endTime）
 */
export function hasCalendarFacet(event: Event): boolean {
  return !!(event.startTime && event.endTime);
}

/**
 * 判断事件是否应该在 Plan 页面显示
 * @param event - 事件对象
 * @returns 是否应该显示在 Plan 页面
 */
export function shouldShowInPlan(event: Event): boolean {
  // Plan 页面纳入所有具有任务能力的事件
  return hasTaskFacet(event);
}

/**
 * 判断事件是否应该在 TimeCalendar 页面显示
 * @param event - 事件对象
 * @returns 是否应该显示在 TimeCalendar 页面
 * 
 * 显示规则：
 * 1. 有完整时间段（Calendar block）的本地创建或外部同步事件
 * 2. 或者 Task Bar（有 checkType 但无时间段）
 */
export function shouldShowInTimeCalendar(event: Event): boolean {
  // 规则 1: 本地创建或外部同步 + 有 calendar block
  if (hasCalendarFacet(event)) {
    assertNamespacedEventSource(event.source);
    return true;
  }
  
  // 规则 2: Task Bar（checkType 存在但无时间段）
  return hasTaskFacet(event) && !hasCalendarFacet(event);
}

/**
 * 判断事件是否为本地创建
 * @param event - 事件对象
 * @returns 是否为本地创建的事件
 */
export function isLocalCreation(event: Event): boolean {
  assertNamespacedEventSource(event.source);
  return isLocalEventSource(event.source);
}

/**
 * 判断事件是否为外部同步
 * @param event - 事件对象
 * @returns 是否为外部同步的事件
 */
export function isExternalSync(event: Event): boolean {
  assertNamespacedEventSource(event.source);
  return isExternalEventSource(event.source);
}

/**
 * 获取事件的创建来源（带命名空间格式）
 * @param event - 事件对象
 * @returns 标准化的 source 字符串
 */
export function getCreationSource(event: Event): string {
  assertNamespacedEventSource(event.source);
  return event.source;
}

/**
 * 判断事件是否为“Activity Trace / 实际进展链路事件”（系统生成，无独立计划状态）
 * @param event - 事件对象
 * @returns 是否为系统链路控制的子事件（例如 Timer / TimeLog / OutsideApp）
 */
export function isActivityTraceEvent(event: Event): boolean {
  if (event.timerSessionId) return true;
  if (getCreationSource(event) === 'local:timelog') return true;

  return false;
}
