/**
 * 时间差异计算工具
 * 
 * 用于计算两个时间点之间的差异，并生成人类可读的描述
 * 用于 DateMention 过期提示
 * 
 * @module timeDiffCalculator
 * @created 2025-11-14
 * @version 1.0
 */

import { parseLocalTimeStringOrNull } from './timeUtils';

export interface TimeDiffResult {
  /** 是否有差异 */
  hasDiff: boolean;
  /** 差异描述（如 "提前了1天", "延后了2小时"） */
  description: string;
  /** 差异方向 */
  direction: 'earlier' | 'later' | 'same';
  /** 差异毫秒数 */
  diffMs: number;
  /** 🆕 v2.4: 差异数值（用于显示"提前了X天"） */
  value: number;
  /** 🆕 v2.4: 差异单位（天/小时/分钟） */
  unit: string;
}

/**
 * 计算两个时间之间的差异
 * 
 * 简化规则：
 * - 只显示最大单位（天 > 小时 > 分钟）
 * - 小数向上取整（2小时30分 → 3小时）
 * - 1天10小时 → 简化为 1天
 * 
 * @param originalTime - 原始时间
 * @param currentTime - 当前时间
 * @returns 时间差异结果
 */
export function calculateTimeDiff(
  originalTime: string | Date,
  currentTime: string | Date
): TimeDiffResult {
  const original = typeof originalTime === 'string'
    ? (parseLocalTimeStringOrNull(originalTime) ?? new Date(originalTime))
    : originalTime;
  const current = typeof currentTime === 'string'
    ? (parseLocalTimeStringOrNull(currentTime) ?? new Date(currentTime))
    : currentTime;

  if (Number.isNaN(original.getTime()) || Number.isNaN(current.getTime())) {
    return {
      hasDiff: false,
      description: '时间未变化',
      direction: 'same',
      diffMs: 0,
      value: 0,
      unit: '分钟',
    };
  }
  
  const diffMs = current.getTime() - original.getTime();
  
  // 没有差异（允许1分钟误差）
  if (Math.abs(diffMs) < 60 * 1000) {
    return {
      hasDiff: false,
      description: '时间未变化',
      direction: 'same',
      diffMs: 0,
      value: 0,
      unit: '分钟',
    };
  }
  
  const direction: 'earlier' | 'later' = diffMs > 0 ? 'later' : 'earlier';
  const absDiffMs = Math.abs(diffMs);
  
  // 计算各单位
  const days = Math.floor(absDiffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((absDiffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((absDiffMs % (60 * 60 * 1000)) / (60 * 1000));
  
  // 生成描述（只显示最大单位）
  let description: string;
  let value: number;
  let unit: string;
  
  if (days > 0) {
    // 优先显示天数
    value = days;
    unit = '天';
    description = `${direction === 'later' ? '延后了' : '提前了'}${days}天`;
  } else if (hours > 0) {
    // 显示小时（向上取整）
    const roundedHours = minutes > 0 ? hours + 1 : hours;
    const suffix = minutes > 30 ? '+' : '';
    value = roundedHours;
    unit = suffix ? '小时+' : '小时';
    description = `${direction === 'later' ? '延后了' : '提前了'}${roundedHours}${suffix}小时`;
  } else {
    // 显示分钟（向上取整到5分钟）
    const roundedMinutes = Math.ceil(minutes / 5) * 5;
    value = roundedMinutes;
    unit = '分钟';
    description = `${direction === 'later' ? '延后了' : '提前了'}${roundedMinutes}分钟`;
  }
  
  return {
    hasDiff: true,
    description,
    direction,
    diffMs,
    value,
    unit,
  };
}

/**
 * 检查 DateMention 是否过期
 * 
 * 判定规则：
 * - 优先对比 startDate vs startTime
 * - 如果只有 endDate/endTime（deadline 场景），对比 endDate vs endTime
 * - DateMention 的时间 < TimeHub 的时间 → 过期（时间延后了）
 * 
 * @param mentionStartDate - DateMention 的 startDate
 * @param eventStartTime - Event 的 startTime（来自 TimeHub）
 * @param mentionEndDate - DateMention 的 endDate（可选）
 * @param eventEndTime - Event 的 endTime（可选，来自 TimeHub）
 * @returns 是否过期（true = DateMention 早于 TimeHub）
 */
export function isDateMentionOutdated(
  mentionStartDate?: string,
  eventStartTime?: string,
  mentionEndDate?: string,
  eventEndTime?: string
): boolean {
  // 🔧 优先对比 start
  if (mentionStartDate && eventStartTime) {
    const diff = calculateTimeDiff(mentionStartDate, eventStartTime);
    
    console.log('[timeDiffCalculator] 🔍 过期检测 (start)', {
      mentionStartDate,
      eventStartTime,
      diffMs: diff.diffMs,
      direction: diff.direction,
      isOutdated: diff.hasDiff && diff.direction === 'later',
    });
    
    return diff.hasDiff && diff.direction === 'later';
  }
  
  // 🔧 降级：如果只有 end（deadline 场景），对比 end
  if (mentionEndDate && eventEndTime) {
    const diff = calculateTimeDiff(mentionEndDate, eventEndTime);
    
    console.log('[timeDiffCalculator] 🔍 过期检测 (end, deadline场景)', {
      mentionEndDate,
      eventEndTime,
      diffMs: diff.diffMs,
      direction: diff.direction,
      isOutdated: diff.hasDiff && diff.direction === 'later',
    });
    
    return diff.hasDiff && diff.direction === 'later';
  }
  
  // 🔧 没有可对比的时间，不算过期
  console.log('[timeDiffCalculator] ⚪ 无可对比时间，跳过过期检测', {
    hasMentionStart: !!mentionStartDate,
    hasEventStart: !!eventStartTime,
    hasMentionEnd: !!mentionEndDate,
    hasEventEnd: !!eventEndTime,
  });
  
  return false;
}
