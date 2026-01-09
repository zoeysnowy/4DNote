/**
 * SSOT Linter - 运行时检查工具
 * 
 * 用途：在开发/测试环境中检测违反SSOT架构规范的代码
 * 
 * 规则来源：docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md
 * 
 * @created 2026-01-09
 * @version 1.0.0
 */

import type { Event } from '@frontend/types';
import { logger } from './logger';

const ssotLogger = logger.module('SSOT-Linter');

/**
 * 禁止的字段（Signal相关，违反SSOT规则）
 * 来源：SSOT §0.3 - Signal 与 Event 的衔接约定
 */
const FORBIDDEN_SIGNAL_FIELDS = [
  'isHighlight',
  'hasQuestions',
  'signalCount',
  'importanceLevel',
  'isImportant',
  'hasDoubt',
  'needsAction',
] as const;

/**
 * Deprecated字段（允许读取用于migration，禁止写入）
 * 来源：Event接口注释
 */
const DEPRECATED_FIELDS = [
  'isTask',      // 用 hasTaskFacet(event) 替代
  'isPlan',      // 用 shouldShowInPlan(event) 替代
  'isTimeCalendar', // 用 shouldShowInTimeCalendar(event) 替代
  'content',     // 用 title.fullTitle 替代
  'isTimer',     // 用 id.startsWith('timer-') 替代
  'isTimeLog',   // 用 source='local:timelog' 替代
  'isOutsideApp', // 用 source='local:timelog' 替代
] as const;

/**
 * 禁止使用的时间格式化方法
 * 来源：SSOT Hard Rule #6
 */
const FORBIDDEN_TIME_METHODS = [
  'toISOString',
  'toJSON',
] as const;

/**
 * 检查Event是否包含禁止的Signal字段
 */
export function checkForbiddenSignalFields(event: Partial<Event>, context?: string): void {
  if (process.env.NODE_ENV === 'production') return; // 仅在开发环境检查

  for (const field of FORBIDDEN_SIGNAL_FIELDS) {
    if (field in event) {
      const error = `[SSOT VIOLATION] Event contains forbidden Signal field: ${field}`;
      ssotLogger.error(error, { context, eventId: event.id, field });
      
      if (process.env.NODE_ENV === 'test') {
        throw new Error(error); // 测试环境抛出错误
      }
    }
  }
}

/**
 * 检查是否在写入deprecated字段
 */
export function checkDeprecatedFieldWrite(
  fieldName: string, 
  value: unknown, 
  context?: string
): void {
  if (process.env.NODE_ENV === 'production') return;

  if (DEPRECATED_FIELDS.includes(fieldName as any)) {
    const warning = `[SSOT WARNING] Writing to deprecated field: ${fieldName}. Use facet/resolver instead.`;
    ssotLogger.warn(warning, { context, fieldName, value });
    
    // 不抛出错误，但记录警告（允许migration路径）
    console.warn(warning);
  }
}

/**
 * 检查Event对象中的deprecated字段写入
 */
export function checkEventDeprecatedFields(
  event: Partial<Event>, 
  context: 'create' | 'update',
  allowMigration: boolean = false
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (allowMigration) return; // migration路径豁免

  for (const field of DEPRECATED_FIELDS) {
    if (field in event && event[field as keyof Event] !== undefined) {
      const warning = `[SSOT WARNING] ${context} Event with deprecated field: ${field}`;
      ssotLogger.warn(warning, { 
        context, 
        eventId: event.id, 
        field,
        value: event[field as keyof Event],
        recommendation: getDeprecatedFieldRecommendation(field)
      });
    }
  }
}

/**
 * 获取deprecated字段的推荐替代方案
 */
function getDeprecatedFieldRecommendation(field: string): string {
  const recommendations: Record<string, string> = {
    isTask: 'Use hasTaskFacet(event) from @frontend/utils/eventFacets',
    isPlan: 'Use shouldShowInPlan(event) from @frontend/utils/eventFacets',
    isTimeCalendar: 'Use shouldShowInTimeCalendar(event) from @frontend/utils/eventFacets',
    content: 'Use event.title.fullTitle or resolveDisplayTitle(event)',
    isTimer: 'Use event.id.startsWith("timer-")',
    isTimeLog: 'Use event.source === "local:timelog"',
    isOutsideApp: 'Use event.source === "local:timelog"',
  };
  return recommendations[field] || 'See SSOT documentation';
}

/**
 * 检查时间字段格式（禁止ISO格式）
 * 来源：SSOT Hard Rule #6
 */
export function checkTimeFormat(
  fieldName: string,
  value: string | undefined,
  context?: string
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!value) return;

  // 检查是否为ISO格式（含'T'或'Z'）
  const isISOFormat = value.includes('T') || value.includes('Z');
  
  if (isISOFormat) {
    const error = `[SSOT VIOLATION] Time field "${fieldName}" uses ISO format: ${value}. Must use local format (YYYY-MM-DD HH:mm:ss)`;
    ssotLogger.error(error, { context, fieldName, value });
    
    if (process.env.NODE_ENV === 'test') {
      throw new Error(error);
    }
  }
}

/**
 * 检查Event的所有时间字段
 */
export function checkEventTimeFormats(event: Partial<Event>, context?: string): void {
  if (process.env.NODE_ENV === 'production') return;

  const timeFields = [
    'startTime',
    'endTime',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'lastSyncTime',
    'dueDateTime',
    'lastNonBlankAt',
  ] as const;

  for (const field of timeFields) {
    const value = event[field];
    if (typeof value === 'string') {
      checkTimeFormat(field, value, context);
    }
  }

  // 检查bestSnapshot中的时间
  if (event.bestSnapshot?.capturedAt) {
    checkTimeFormat('bestSnapshot.capturedAt', event.bestSnapshot.capturedAt, context);
  }
}

/**
 * 检查是否在代码中使用了禁止的时间方法
 * 注意：这是静态检查提示，不是运行时检查
 */
export function warnForbiddenTimeMethods(): void {
  if (process.env.NODE_ENV === 'production') return;

  const warning = `
⚠️ SSOT Reminder:
  DO NOT use: new Date().toISOString() or new Date().toJSON()
  USE: formatTimeForStorage(new Date())
  
  Forbidden methods: ${FORBIDDEN_TIME_METHODS.join(', ')}
  See: docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md - Hard Rule #6
  `;
  
  // 仅在模块首次加载时打印一次
  if (!globalThis.__SSOT_WARNING_SHOWN) {
    console.log(warning);
    globalThis.__SSOT_WARNING_SHOWN = true;
  }
}

/**
 * 全面检查Event对象（推荐在EventService中调用）
 */
export function validateEventAgainstSSOT(
  event: Partial<Event>,
  context: 'create' | 'update' | 'read',
  options?: {
    allowMigration?: boolean;
    skipTimeCheck?: boolean;
  }
): void {
  if (process.env.NODE_ENV === 'production') return;

  const { allowMigration = false, skipTimeCheck = false } = options || {};

  // 1. 检查禁止的Signal字段
  checkForbiddenSignalFields(event, context);

  // 2. 检查deprecated字段（仅在create/update时）
  if (context !== 'read') {
    checkEventDeprecatedFields(event, context, allowMigration);
  }

  // 3. 检查时间格式
  if (!skipTimeCheck) {
    checkEventTimeFormats(event, context);
  }
}

/**
 * 用于测试的严格模式：任何违规都抛出错误
 */
export function enableStrictMode(): void {
  if (process.env.NODE_ENV !== 'test') {
    ssotLogger.warn('Strict mode should only be enabled in test environment');
  }
  // 已在各检查函数中处理
}

// 声明全局类型
declare global {
  var __SSOT_WARNING_SHOWN: boolean | undefined;
}

// 模块加载时显示提醒
if (process.env.NODE_ENV === 'development') {
  warnForbiddenTimeMethods();
}
