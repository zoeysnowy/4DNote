/**
 * 时间工具函数 - 确保所有时间处理的一致性
 * 目标：18:06的事件在任何地方都显示为18:06，不受时区影响
 */

// 🔧 将日期转换为 YYYY-MM-DD 格式（本地日期，不受时区影响）
// ⚠️ WARNING: 不要使用 date.toISOString().split('T')[0]！
// 原因：toISOString() 返回 UTC 时间，会造成日期偏移（如 GMT+8 的 2025-12-11 00:00 会变成 2025-12-10）
export const formatDateForStorage = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 🔧 将时间转换为存储格式（本地时间字符串，空格分隔符）
// ⚠️ WARNING: 不要使用 ISO 格式（T分隔符）！
// 原因：数据会同步到 Outlook，ISO 格式会被误认为 UTC 时间，造成时区偏移
export const formatTimeForStorage = (date: Date): string => {
  // 使用本地时间创建字符串，用空格分隔日期和时间
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  // ✅ 使用空格分隔符，不是 'T'
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 🔧 解析本地时间字符串为Date对象 - 修复类型问题
export const parseLocalTimeString = (timeString: string | Date): Date => {
  // 如果已经是Date对象，直接返回
  if (timeString instanceof Date) {
    return isNaN(timeString.getTime()) ? new Date() : timeString;
  }
  
  // 如果是空字符串或undefined，返回当前时间
  if (!timeString) {
    return new Date();
  }
  
  // 如果是标准 ISO 8601 格式（带 Z 或时区），直接用 Date 构造函数
  if (timeString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(timeString)) {
    const date = new Date(timeString);
    if (isNaN(date.getTime())) {
      console.error('❌ [parseLocalTimeString] Invalid ISO date:', timeString);
      return new Date();
    }
    return date;
  }
  
  // 🔧 优先处理 TimeSpec 格式：YYYY-MM-DD HH:mm:ss（空格分隔符）
  // 支持单位数月份/日期：2025-12-7 21:39:42 或 2025/12/7 21:39:42
  const timeSpecPattern = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/;
  const match = timeString.match(timeSpecPattern);
  
  if (match) {
    const [, year, month, day, hours, minutes, seconds] = match;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds)
    );
    
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // 🔧 处理纯日期（本地日期，不受时区影响）：YYYY-MM-DD 或 YYYY/MM/DD
  // ⚠️ 不要用 new Date('YYYY-MM-DD')，不同环境可能按 UTC 解析导致日期偏移
  const dateOnlyPattern = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/;
  const dateOnlyMatch = timeString.match(dateOnlyPattern);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
    return isNaN(date.getTime()) ? new Date() : date;
  }
  
  // 解析ISO格式的时间字符串，但作为本地时间处理
  if (timeString.includes('T')) {
    const [datePart, fullTimePart] = timeString.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    
    // 移除毫秒和时区标记（如果有）
    const timePart = fullTimePart.split('.')[0]; // 移除 .000Z
    const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
    
    const date = new Date(year, month - 1, day, hours, minutes, seconds);
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      console.error('❌ [parseLocalTimeString] Invalid date:', timeString);
      return new Date();
    }
    
    return date;
  }
  
  // 兼容其他格式
  const date = new Date(timeString);
  if (isNaN(date.getTime())) {
    console.error('❌ [parseLocalTimeString] Invalid date format:', timeString);
    return new Date();
  }
  return date;
};

// ✅ 严格解析：解析失败返回 null（不默认回填当前时间）
// 用于：派生计算/同步/持久化前校验，避免把“无效/缺失时间”当成真实时间。
export const parseLocalTimeStringOrNull = (
  timeString?: string | Date | null
): Date | null => {
  if (timeString instanceof Date) {
    return isNaN(timeString.getTime()) ? null : timeString;
  }

  if (!timeString) return null;
  if (typeof timeString !== 'string') return null;

  const trimmed = timeString.trim();
  if (trimmed === '') return null;

  // ⚠️ DEPRECATED: ISO 8601（带 Z 或时区）兼容性解析
  // 仅用于向后兼容存量数据，新代码严禁写入 ISO 格式
  if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    console.warn('⚠️ [timeUtils] Parsing deprecated ISO 8601 format:', trimmed.slice(0, 30));
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
  }

  // TimeSpec：YYYY-MM-DD HH:mm:ss（空格分隔符）
  const timeSpecPattern =
    /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/;
  const match = trimmed.match(timeSpecPattern);
  if (match) {
    const [, year, month, day, hours, minutes, seconds] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds)
    );
    return isNaN(date.getTime()) ? null : date;
  }

  // 纯日期（本地日期）：YYYY-MM-DD 或 YYYY/MM/DD
  const dateOnlyPattern = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/;
  const dateOnlyMatch = trimmed.match(dateOnlyPattern);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }

  // ISO-like（无时区）：YYYY-MM-DDTHH:mm(:ss)
  if (trimmed.includes('T')) {
    const [datePart, fullTimePart] = trimmed.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    if (!year || !month || !day) return null;

    const timePart = fullTimePart.split('.')[0];
    const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
    if ([hours, minutes, seconds].some((v) => Number.isNaN(v))) return null;

    const date = new Date(year, month - 1, day, hours, minutes, seconds);
    return isNaN(date.getTime()) ? null : date;
  }

  // 其他格式：尽量解析，但失败返回 null
  const date = new Date(trimmed);
  return isNaN(date.getTime()) ? null : date;
};

// 🔧 格式化时间用于input[type="time"]控件
export const formatTimeForInput = (timeString: string | Date): string => {
  const date = parseLocalTimeString(timeString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// 🔧 格式化完整日期时间用于input[type="datetime-local"]控件
export const formatDateTimeForInput = (timeString: string | Date): string => {
  const date = parseLocalTimeString(timeString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// 🔧 格式化日期用于input[type="date"]控件
export const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 🔧 格式化时间用于显示（只显示时间部分）
export const formatDisplayTime = (timeString: string | Date): string => {
  const date = parseLocalTimeString(timeString);
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
};

// 🔧 格式化日期时间用于显示
export const formatDisplayDateTime = (timeString: string | Date): string => {
  const date = parseLocalTimeString(timeString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// 🔧 获取今天的开始时间
export const getTodayStart = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

// 🔧 获取今天的结束时间
export const getTodayEnd = (): Date => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
};

// 🔧 检查是否为今天
export const isToday = (timeString: string | Date): boolean => {
  const date = parseLocalTimeString(timeString);
  const today = new Date();
  
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
};

// 🔧 计算时间差（秒）
export const getTimeDifferenceInSeconds = (startTime: string | Date, endTime: string | Date): number => {
  const start = parseLocalTimeString(startTime);
  const end = parseLocalTimeString(endTime);
  return Math.floor((end.getTime() - start.getTime()) / 1000);
};

// 🔧 添加更多实用的时间工具函数

// 格式化持续时间（秒转为可读格式）
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}小时${minutes.toString().padStart(2, '0')}分`;
  } else if (minutes > 0) {
    return `${minutes}分${secs.toString().padStart(2, '0')}秒`;
  } else {
    return `${secs}秒`;
  }
};

// 简化的时间格式化函数（与formatDuration相同，为了兼容性）
export const formatTime = (seconds: number): string => {
  return formatDuration(seconds);
};

// 获取时间字符串（用于文件名等）
export const getTimeString = (): string => {
  const now = new Date();
  // ✅ 直接格式化，不使用 replace('T', '_')
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
};

// 检查时间是否在指定范围内
export const isTimeInRange = (timeString: string | Date, startTime: string | Date, endTime: string | Date): boolean => {
  const time = parseLocalTimeString(timeString).getTime();
  const start = parseLocalTimeString(startTime).getTime();
  const end = parseLocalTimeString(endTime).getTime();
  
  return time >= start && time <= end;
};

// 获取相对时间描述
export const getRelativeTimeDescription = (timeString: string | Date): string => {
  const date = parseLocalTimeString(timeString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) {
    return '刚刚';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return formatDisplayDateTime(timeString);
  }
};