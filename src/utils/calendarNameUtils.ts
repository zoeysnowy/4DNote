/**
 * Calendar Name Utils - 日历名称处理工具
 * 
 * @description 统一处理日历名称的格式化、清理等操作
 * @version 2.0.0
 * @author Zoey Gong
 */

/**
 * 移除字符串开头的emoji
 * 使用兼容的正则表达式（支持各种emoji）
 * 
 * @param text - 原始文本
 * @returns 清理后的文本
 */
export function removeLeadingEmoji(text: string): string {
  if (!text) return '';
  
  // 移除开头的emoji和空格
  return text.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/, '').trim();
}

/**
 * 提取emoji和名称
 * 
 * @param text - 原始文本
 * @returns { emoji: string | null, name: string }
 */
export function extractEmojiAndName(text: string): { emoji: string | null; name: string } {
  if (!text) return { emoji: null, name: '' };
  
  const emojiMatch = text.match(/^([\uD83C-\uDBFF\uDC00-\uDFFF]+)\s*/);
  if (emojiMatch) {
    return {
      emoji: emojiMatch[1],
      name: text.substring(emojiMatch[0].length).trim()
    };
  }
  
  return { emoji: null, name: text.trim() };
}

/**
 * 获取日历的显示名称（清理emoji）
 * 
 * @param calendar - 日历对象
 * @returns 清理后的显示名称
 */
export function getCalendarDisplayName(calendar: {
  name?: string;
  displayName?: string;
  id?: string;
}): string {
  const rawName = calendar.name || calendar.displayName || '';
  
  if (rawName) {
    return removeLeadingEmoji(rawName);
  }
  
  // 如果没有名称，使用ID的一部分
  if (calendar.id) {
    if (calendar.id.length > 40) {
      return calendar.id.substring(0, 30) + '...';
    }
    return calendar.id;
  }
  
  return '未命名日历';
}

/**
 * 分割名称（处理 "主名称: 子名称" 格式）
 * 
 * @param name - 完整名称
 * @returns { mainName: string, subName: string }
 */
export function splitCalendarName(name: string): { mainName: string; subName: string } {
  if (!name) return { mainName: '', subName: '' };
  
  const cleanName = removeLeadingEmoji(name);
  
  if (cleanName.includes(': ')) {
    const [main, ...rest] = cleanName.split(': ');
    return {
      mainName: main.trim(),
      subName: rest.join(': ').trim()
    };
  }
  
  return { mainName: cleanName, subName: '' };
}

/**
 * 获取日历的简短显示名称（用于狭窄空间）
 * 
 * @param calendar - 日历对象
 * @param maxLength - 最大长度（默认8）
 * @returns 简短名称
 */
export function getShortCalendarName(calendar: {
  name?: string;
  displayName?: string;
  id?: string;
}, maxLength: number = 8): string {
  const fullName = getCalendarDisplayName(calendar);
  
  if (fullName.length <= maxLength) {
    return fullName;
  }
  
  return fullName.substring(0, maxLength) + '...';
}

/**
 * 从日历ID推断提供商名称
 * 
 * @param calendarId - 日历ID
 * @returns 提供商名称
 */
export function inferProviderFromId(calendarId: string): string {
  if (!calendarId) return 'Unknown';
  
  const id = calendarId.toLowerCase();
  
  if (id.startsWith('outlook-') || id.includes('microsoft')) {
    return 'Outlook';
  }
  
  if (id.startsWith('google-') || id.includes('google')) {
    return 'Google';
  }
  
  if (id.startsWith('icloud-') || id.includes('icloud')) {
    return 'iCloud';
  }
  
  if (id.startsWith('local-')) {
    return 'Local';
  }
  
  return 'Calendar';
}

/**
 * 获取带提供商前缀的名称
 * 
 * @param calendar - 日历对象
 * @returns 格式化的名称（如 "Outlook: 工作日历"）
 */
export function getCalendarNameWithProvider(calendar: {
  name?: string;
  displayName?: string;
  id?: string;
  provider?: string;
}): string {
  const displayName = getCalendarDisplayName(calendar);
  
  // 如果名称中已经包含提供商前缀，直接返回
  if (displayName.match(/^(Outlook|Google|iCloud|Local):\s/)) {
    return displayName;
  }
  
  const provider = calendar.provider || inferProviderFromId(calendar.id || '');
  
  if (provider && provider !== 'Calendar') {
    return `${provider}: ${displayName}`;
  }
  
  return displayName;
}

/**
 * 截断日历名称列表显示
 * 用于显示多个日历时，如 "工作日历 等2个"
 * 
 * @param calendars - 日历列表
 * @param maxDisplay - 最多显示几个名称（默认1）
 * @returns 格式化的显示文本
 */
export function formatMultiCalendarDisplay(
  calendars: Array<{ name?: string; displayName?: string; id?: string }>,
  maxDisplay: number = 1
): string {
  if (calendars.length === 0) {
    return '选择日历...';
  }
  
  if (calendars.length === 1) {
    return getCalendarDisplayName(calendars[0]);
  }
  
  const firstNames = calendars
    .slice(0, maxDisplay)
    .map(c => getCalendarDisplayName(c))
    .join('、');
  
  if (calendars.length > maxDisplay) {
    return `${firstNames} 等${calendars.length}个`;
  }
  
  return firstNames;
}
