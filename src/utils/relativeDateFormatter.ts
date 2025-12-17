/**
 * 智能相对日期格式化引擎
 * 
 * 基于优先级匹配原则，从最口语化到精确格式：
 * 1. 核心口语: 今天、明天、昨天
 * 2. 本周范围: 后天、周X、本周X
 * 3. 邻近周: 上周X、下周X
 * 4. 数字增量: X天前/后、X周前/后、X月前/后
 * 5. 绝对日期: 11月25日、2026/03/15
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import { parseLocalTimeString } from './timeUtils';
import { DATE_RANGE_DICTIONARY } from './naturalLanguageTimeDictionary';

/**
 * 获取一天的开始时间（00:00:00）
 */
function getStartOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * 格式化星期
 * @param date 日期对象
 * @returns 周X格式（如"周一"、"周日"）
 */
function formatDayOfWeek(date: Date): string {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[date.getDay()];
}

/**
 * 计算两个日期之间的月份差
 * @param date1 目标日期
 * @param date2 基准日期
 * @returns 月份差（正数表示 date1 在未来）
 */
function getMonthsDifference(date1: Date, date2: Date): number {
  const yearDiff = date1.getFullYear() - date2.getFullYear();
  const monthDiff = date1.getMonth() - date2.getMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * 格式化日期为指定格式
 * @param date 日期对象
 * @param format 格式字符串
 * @returns 格式化后的日期字符串
 */
function formatDate(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  return format
    .replace('yyyy', String(year))
    .replace('M', String(month))
    .replace('d', String(day));
}

/**
 * 智能相对日期格式化引擎
 * 
 * 🔄 v2.8.2: 完全基于动态计算，移除 displayHint 存储依赖
 * - 远程同步的事件也能正确显示相对时间
 * - 时间显示随着当前日期自动更新（今天 → 昨天 → 2天前）
 * 
 * @param targetDate 目标日期（要格式化的日期）
 * @param today 基准日期（默认为当前日期）
 * @returns 相对时间描述字符串
 * 
 * @example
 * formatRelativeDate(new Date('2025-11-11'), new Date('2025-11-10')) // "明天"
 * formatRelativeDate(new Date('2025-11-09'), new Date('2025-11-10')) // "昨天"
 * formatRelativeDate(new Date('2025-11-12'), new Date('2025-11-10')) // "后天"
 * formatRelativeDate(new Date('2025-11-13'), new Date('2025-11-10')) // "周三"
 * formatRelativeDate(new Date('2025-11-18'), new Date('2025-11-10')) // "下周一"
 * formatRelativeDate(new Date('2025-11-20'), new Date('2025-11-10')) // "10天后"
 */
export function formatRelativeDate(
  targetDate: Date, 
  today: Date = new Date()
): string {
  
  // 确保只比较日期部分，忽略时间
  const startOfTarget = getStartOfDay(targetDate);
  const startOfToday = getStartOfDay(today);
  
  // 计算天数差
  const daysDiff = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
  
  // 获取今天是星期几（0=周日, 1=周一, ..., 6=周六）
  const todayDayOfWeek = today.getDay();
  
  // --- 优先级 1: 核心口语 ---
  if (daysDiff === 0) return "今天";
  if (daysDiff === 1) return "明天";
  if (daysDiff === -1) return "昨天";
  
  // --- 优先级 2: 本周范围 ---
  if (daysDiff === 2) return "后天";
  if (daysDiff === 3) return "大后天";
  
  // 计算本周日距离今天的天数（周日=0，需要特殊处理）
  const daysUntilSunday = todayDayOfWeek === 0 ? 0 : 7 - todayDayOfWeek;
  
  // 今天之后到本周日的范围（如果今天是周日，则不包含任何日期）
  if (daysDiff > 2 && daysDiff <= daysUntilSunday) {
    return formatDayOfWeek(targetDate);
  }
  
  // 本周一到昨天之前的日期（已过去的本周日期）
  const daysSinceMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
  if (daysDiff < -1 && daysDiff >= -daysSinceMonday) {
    return "本" + formatDayOfWeek(targetDate);
  }
  
  // --- 优先级 3: 邻近周范围 ---
  // 下周范围：下周一到下周日
  const daysUntilNextMonday = todayDayOfWeek === 0 ? 1 : 8 - todayDayOfWeek;
  const daysUntilNextSunday = daysUntilNextMonday + 6;
  
  if (daysDiff >= daysUntilNextMonday && daysDiff <= daysUntilNextSunday) {
    return "下" + formatDayOfWeek(targetDate);
  }
  
  // 上周范围：上周一到上周日
  const daysToLastMonday = todayDayOfWeek === 0 ? 7 : todayDayOfWeek + 6;
  const daysToLastSunday = todayDayOfWeek === 0 ? 1 : todayDayOfWeek;
  
  if (daysDiff <= -daysToLastSunday && daysDiff >= -daysToLastMonday) {
    return "上" + formatDayOfWeek(targetDate);
  }
  
  // --- 优先级 4: 数字增量 ---
  // 3-14 天范围
  if (daysDiff > 0 && daysDiff <= 14) return `${daysDiff}天后`;
  if (daysDiff < 0 && daysDiff >= -14) return `${-daysDiff}天前`;
  
  // 周范围（15天-8周）
  const weeksDiff = Math.round(daysDiff / 7);
  if (weeksDiff > 1 && weeksDiff <= 8) return `${weeksDiff}周后`;
  if (weeksDiff < -1 && weeksDiff >= -8) return `${-weeksDiff}周前`;
  
  // 月范围
  const monthsDiff = getMonthsDifference(targetDate, today);
  if (monthsDiff === 1) return "下个月";
  if (monthsDiff === -1) return "上个月";
  if (monthsDiff > 1 && monthsDiff <= 11) return `${monthsDiff}个月后`;
  if (monthsDiff < -1 && monthsDiff >= -11) return `${-monthsDiff}个月前`;
  
  // --- 优先级 5: 绝对日期 ---
  if (targetDate.getFullYear() === today.getFullYear()) {
    return formatDate(targetDate, "M月d日");
  } else {
    return formatDate(targetDate, "yyyy/M/d");
  }
}

/**
 * 使用共享词库进行日期范围的反向识别
 * @param startDate 开始日期
 * @param endDate 结束日期  
 * @param now 当前日期
 * @returns 相对表达（如"本周末"、"下周中"）或 null
 */
function detectDateRange(startDate: Date, endDate: Date, now: Date): string | null {
  // 遍历 DATE_RANGE_DICTIONARY 中的所有词条
  const dateRangeEntries = [
    ['本周末', '这周末', '周末'],
    ['下周末'],
    ['上周末'],
    ['下下周末'],
    ['上上周末'],
    ['周中', '本周中'],
    ['下周中'],
    ['上周中'],
    ['工作日', '本工作日'],
    ['下工作日']
  ];
  
  for (const aliases of dateRangeEntries) {
    for (const keyword of aliases) {
      if (DATE_RANGE_DICTIONARY[keyword]) {
        try {
          const range = DATE_RANGE_DICTIONARY[keyword](now);
          
          // 比较日期范围（只比较日期部分，忽略时间）
          const rangeStart = new Date(range.start.year(), range.start.month(), range.start.date());
          const rangeEnd = new Date(range.end.year(), range.end.month(), range.end.date());
          const inputStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const inputEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          
          if (rangeStart.getTime() === inputStart.getTime() && rangeEnd.getTime() === inputEnd.getTime()) {
            return range.displayHint || keyword;
          }
        } catch (e) {
          // 词库条目可能不存在，跳过
          continue;
        }
      }
    }
  }
  
  return null;
}

/**
 * 格式化时间为 HH:MM 格式
 * @param date 日期对象
 * @returns 时间字符串（如"14:30"）
 */
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 格式化完整的日期和星期
 * @param date 日期对象
 * @returns 格式化字符串（如"2025-11-06（周四）"）
 */
export function formatFullDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekday = formatDayOfWeek(date);
  
  return `${year}-${month}-${day}（${weekday}）`;
}

/**
 * 计算倒计时或已过期时间
 * @param targetDate 目标日期
 * @param now 当前时间（默认为现在）
 * @returns 倒计时/已过期描述对象
 */
export function formatCountdown(targetDate: Date, now: Date = new Date()): {
  text: string;
  isOverdue: boolean;
  hours?: number;
  days?: number;
} {
  const diffMs = targetDate.getTime() - now.getTime();
  const isOverdue = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);
  
  const hours = Math.floor(absDiffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 24) {
    // 小于24小时，显示小时
    return {
      text: isOverdue ? `已过期${hours}h` : `倒计时${hours}h`,
      isOverdue,
      hours
    };
  } else {
    // 大于等于24小时，显示天数
    return {
      text: isOverdue ? `已过期${days}天` : `倒计时${days}天`,
      isOverdue,
      days
    };
  }
}

/**
 * 格式化相对时间显示（用于 PlanManager 右侧）
 * 
 * 🔄 v2.8.2: 移除 displayHint 参数，完全基于动态计算
 * - 远程同步的事件也能正确显示相对时间
 * - 时间显示随着当前日期自动更新
 * 
 * @param startTime 开始时间（可选）
 * @param endTime 结束时间（可选）
 * @param isAllDay 是否全天事件
 * @param dueDateTime 截止日期/时间（可选）
 * @returns 格式化的时间显示字符串
 * 
 * @example
 * // 有开始和结束时间
 * formatRelativeTimeDisplay("2025-11-11T14:00:00", "2025-11-11T15:00:00", false)
 * // => "明天 14:00 - 15:00"
 * 
 * // 全天事件
 * formatRelativeTimeDisplay("2025-11-12T00:00:00", null, true)
 * // => "后天 全天"
 * 
 * // 只有截止日期
 * formatRelativeTimeDisplay(null, null, false, "2025-11-15")
 * // => "周五"
 */
export function formatRelativeTimeDisplay(
  startTime?: string | null,
  endTime?: string | null,
  isAllDay?: boolean,
  dueDateTime?: string | null
): string {
  const now = new Date();
  
  // 优先使用开始时间，其次是截止日期/时间
  const primaryDate = startTime || dueDateTime;
  
  if (!primaryDate) {
    return ''; // 没有任何日期信息
  }
  
  const startDate = parseLocalTimeString(primaryDate);
  
  // 🆕 智能日期范围检测（使用共享词库）
  if (endTime) {
    const endDate = parseLocalTimeString(endTime);
    const dateRange = detectDateRange(startDate, endDate, now);
    if (dateRange) {
      // 检查是否有有效时间
      const hasValidStartTime = startTime && !startTime.includes('00:00:00');
      const hasValidEndTime = endTime && !endTime.includes('00:00:00');
      
      if (!hasValidStartTime && !hasValidEndTime) {
        // 纯日期范围，直接返回如"本周末"
        return dateRange;
      } else if (hasValidStartTime || hasValidEndTime) {
        // 有具体时间的话，应该是语义错误（如"本周末2点"）
        // 但为了容错，还是组合显示
        if (hasValidStartTime) {
          const startTimeStr = formatTime(startDate);
          return `${dateRange} ${startTimeStr}`;
        }
      }
    }
  }
  
  const relativeDate = formatRelativeDate(startDate, now);
  
  // 全天事件
  if (isAllDay) {
    return `${relativeDate} 全天`;
  }
  
  // 🔧 修复：只有当时间不是 00:00:00 才显示具体时间
  const hasValidStartTime = startTime && !startTime.includes('00:00:00');
  const hasValidEndTime = endTime && !endTime.includes('00:00:00');
  
  if (hasValidStartTime) {
    const startTimeStr = formatTime(startDate);
    
    if (hasValidEndTime) {
      const endDate = parseLocalTimeString(endTime!);
      const endTimeStr = formatTime(endDate);
      return `${relativeDate} ${startTimeStr} - ${endTimeStr}`;
    }
    
    return `${relativeDate} ${startTimeStr}`;
  }
  
  // 只有日期，没有具体时间
  return relativeDate;
}
