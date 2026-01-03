/**
 * 固定阳历节日数据
 * @file src/utils/holidays/fixedHolidays.ts
 */

import { HolidayInfo } from './types';

/**
 * 固定阳历节日数据
 * 键格式: "MM-DD"（月份和日期，补零）
 */
export const FIXED_SOLAR_HOLIDAYS: Record<string, HolidayInfo> = {
  // === 中国法定节假日 ===
  "01-01": { 
    name: "元旦", 
    isHoliday: true, 
    days: 1, 
    emoji: "🎊",
    description: "新年第一天" 
  },
  
  "05-01": { 
    name: "劳动节", 
    isHoliday: true, 
    days: 1, 
    emoji: "🎉",
    description: "国际劳动节" 
  },
  
  "10-01": { 
    name: "国庆节", 
    isHoliday: true, 
    days: 7, 
    emoji: "🇨🇳",
    description: "中华人民共和国国庆日" 
  },
  
  // 清明节（近似，实际需要计算）
  "04-05": { 
    name: "清明节", 
    isHoliday: true, 
    days: 1, 
    emoji: "🌾",
    description: "传统祭祀节日" 
  },
  
  // === 国际节日（非法定） ===
  "02-14": { 
    name: "情人节", 
    isHoliday: false, 
    emoji: "💝",
    description: "西方情人节" 
  },
  
  "03-08": { 
    name: "妇女节", 
    isHoliday: false, 
    emoji: "👩",
    description: "国际妇女节" 
  },
  
  "05-04": { 
    name: "青年节", 
    isHoliday: false, 
    emoji: "🎓",
    description: "中国青年节" 
  },
  
  "06-01": { 
    name: "儿童节", 
    isHoliday: false, 
    emoji: "👶",
    description: "国际儿童节" 
  },
  
  "09-10": { 
    name: "教师节", 
    isHoliday: false, 
    emoji: "👨‍🏫",
    description: "中国教师节" 
  },
  
  "12-24": { 
    name: "平安夜", 
    isHoliday: false, 
    emoji: "🌟",
    description: "圣诞节前夜" 
  },
  
  "12-25": { 
    name: "圣诞节", 
    isHoliday: false, 
    emoji: "🎄",
    description: "基督教节日" 
  },
};

/**
 * 获取指定日期的固定节日信息
 * @param date 要查询的日期
 * @returns 节日信息，如果不是节日则返回 null
 * 
 * @example
 * ```typescript
 * const holiday = getHoliday(new Date(2025, 11, 25));
 * console.log(holiday); // { name: "圣诞节", isHoliday: false, emoji: "🎄" }
 * ```
 */
export function getHoliday(date: Date): HolidayInfo | null {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${month}-${day}`;
  
  return FIXED_SOLAR_HOLIDAYS[key] || null;
}

/**
 * 根据节日名称查找日期（仅适用于固定日期）
 * @param name 节日名称
 * @param year 年份（默认当前年份）
 * @returns 节日日期，如果未找到则返回 null
 * 
 * @example
 * ```typescript
 * const date = getHolidayByName("圣诞节", 2025);
 * console.log(date); // Date(2025-12-25)
 * ```
 */
export function getHolidayByName(name: string, year: number = new Date().getFullYear()): Date | null {
  const entry = Object.entries(FIXED_SOLAR_HOLIDAYS).find(
    ([, info]) => info.name === name
  );
  
  if (!entry) return null;
  
  const [monthDay] = entry;
  const [month, day] = monthDay.split('-').map(Number);
  
  return new Date(year, month - 1, day);
}
