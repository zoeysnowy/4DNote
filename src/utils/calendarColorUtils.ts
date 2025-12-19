/**
 * Calendar Color Utils - 日历颜色转换工具
 * 
 * @description 统一处理各种颜色格式转换
 * @version 2.0.0
 * @author Zoey Gong
 */

/**
 * Microsoft 颜色名称到十六进制映射表
 */
const MICROSOFT_COLOR_MAP: Record<string, string> = {
  'lightBlue': '#5194f0',
  'lightGreen': '#42b883',
  'lightOrange': '#ff8c42',
  'lightGray': '#9ca3af',
  'lightYellow': '#f1c40f',
  'lightTeal': '#48c9b0',
  'lightPink': '#f48fb1',
  'lightBrown': '#a0826d',
  'lightRed': '#e74c3c',
  'maxColor': '#6366f1',
  
  // 添加更多Microsoft可能的颜色
  'blue': '#3b82f6',
  'green': '#10b981',
  'orange': '#f97316',
  'red': '#ef4444',
  'purple': '#8b5cf6',
  'yellow': '#eab308',
  'pink': '#ec4899',
  'teal': '#14b8a6',
  'gray': '#6b7280',
  'brown': '#92400e'
};

/**
 * 默认颜色池（用于哈希生成）
 */
const DEFAULT_COLOR_POOL = [
  '#667eea', // 紫蓝
  '#764ba2', // 紫色
  '#f093fb', // 粉紫
  '#4facfe', // 天蓝
  '#43e97b', // 薄荷绿
  '#fa709a', // 粉红
  '#3b82f6', // 蓝色
  '#10b981', // 绿色
  '#f59e0b', // 橙色
  '#ef4444'  // 红色
];

/**
 * 提供商默认颜色
 */
const PROVIDER_COLORS: Record<string, string> = {
  'outlook': '#0078d4',
  'google': '#ea4335',
  'icloud': '#007aff',
  'local': '#7b1fa2'
};

/**
 * 将 Microsoft 颜色名称转换为十六进制颜色
 * 
 * @param colorName - Microsoft 颜色名称
 * @returns 十六进制颜色值
 */
export function convertMicrosoftColorToHex(colorName?: string): string {
  if (!colorName) return '#3b82f6'; // 默认蓝色
  
  // 如果已经是十六进制颜色，直接返回
  if (colorName.startsWith('#')) {
    return colorName;
  }
  
  // 查找映射表
  const hexColor = MICROSOFT_COLOR_MAP[colorName.toLowerCase()];
  return hexColor || '#3b82f6';
}

/**
 * 根据ID生成一致的颜色（哈希算法）
 * 
 * @param id - 日历ID
 * @returns 十六进制颜色值
 */
export function generateColorFromId(id: string): string {
  if (!id) return '#3b82f6';
  
  // 简单的哈希算法
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return DEFAULT_COLOR_POOL[hash % DEFAULT_COLOR_POOL.length];
}

/**
 * 根据提供商类型获取默认颜色
 * 
 * @param provider - 提供商类型
 * @returns 十六进制颜色值
 */
export function getProviderColor(provider?: string): string {
  if (!provider) return '#3b82f6';
  return PROVIDER_COLORS[provider.toLowerCase()] || '#3b82f6';
}

/**
 * 统一的颜色获取函数
 * 优先级：hexColor > backgroundColor > rawColor转换 > provider颜色 > ID哈希生成
 * 
 * @param calendar - 日历对象（可以是任何包含颜色信息的对象）
 * @returns 十六进制颜色值
 */
export function getCalendarColor(calendar: {
  color?: string;
  hexColor?: string;
  backgroundColor?: string;
  rawColor?: string;
  id?: string;
  provider?: string;
}): string {
  // 1. 优先使用已转换的十六进制颜色
  if (calendar.color && calendar.color.startsWith('#')) {
    return calendar.color;
  }
  
  // 2. 使用 hexColor 字段
  if (calendar.hexColor && calendar.hexColor.startsWith('#')) {
    return calendar.hexColor;
  }
  
  // 3. 使用 backgroundColor
  if (calendar.backgroundColor && calendar.backgroundColor.startsWith('#')) {
    return calendar.backgroundColor;
  }
  
  // 4. 尝试转换 rawColor（可能是 Microsoft 颜色名称）
  if (calendar.rawColor) {
    return convertMicrosoftColorToHex(calendar.rawColor);
  }
  
  // 5. 尝试转换 color（可能是 Microsoft 颜色名称）
  if (calendar.color && !calendar.color.startsWith('#')) {
    return convertMicrosoftColorToHex(calendar.color);
  }
  
  // 6. 根据提供商返回默认颜色
  if (calendar.provider) {
    return getProviderColor(calendar.provider);
  }
  
  // 7. 根据ID生成颜色
  if (calendar.id) {
    return generateColorFromId(calendar.id);
  }
  
  // 8. 最终默认值
  return '#3b82f6';
}

/**
 * 验证颜色值是否为有效的十六进制颜色
 * 
 * @param color - 颜色值
 * @returns 是否有效
 */
export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

/**
 * 获取颜色的亮度（0-255）
 * 用于判断文字应该使用深色还是浅色
 * 
 * @param hexColor - 十六进制颜色值
 * @returns 亮度值
 */
export function getColorBrightness(hexColor: string): number {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // 使用感知亮度公式
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * 根据背景颜色获取最佳文字颜色
 * 
 * @param backgroundColor - 背景颜色
 * @returns 文字颜色（黑色或白色）
 */
export function getTextColor(backgroundColor: string): string {
  const brightness = getColorBrightness(backgroundColor);
  return brightness > 128 ? '#000000' : '#ffffff';
}
