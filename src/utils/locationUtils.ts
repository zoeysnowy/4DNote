/**
 * Location 工具函数
 * 用于处理 Event.location 的双格式（string | LocationObject）
 */

import type { LocationObject } from '../types';

/**
 * 获取 location 的显示文本
 * @param location - string 或 LocationObject
 * @returns 显示文本，如果为空则返回空字符串
 */
export function getLocationDisplayText(
  location: string | LocationObject | undefined
): string {
  if (!location) return '';
  
  if (typeof location === 'string') {
    return location;
  }
  
  // LocationObject 格式
  return location.displayName || location.address || '';
}

/**
 * 检查 location 是否为空
 * @param location - string 或 LocationObject
 * @returns 是否为空
 */
export function isLocationEmpty(
  location: string | LocationObject | undefined
): boolean {
  if (!location) return true;
  
  if (typeof location === 'string') {
    return location.trim() === '';
  }
  
  // LocationObject 格式
  return !location.displayName && !location.address;
}

/**
 * 标准化 location 为 LocationObject 格式
 * @param location - string 或 LocationObject
 * @returns LocationObject 或 undefined
 */
export function normalizeLocation(
  location: string | LocationObject | undefined
): LocationObject | undefined {
  if (!location) return undefined;
  
  if (typeof location === 'string') {
    return { displayName: location };
  }
  
  return location;
}
