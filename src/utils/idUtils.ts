/**
 * ID 工具函数
 * 用于安全地显示和处理事件 ID
 */

/**
 * 安全地截取 ID 的后几位用于日志显示
 * @param id - 事件 ID（可能为 undefined 或 null）
 * @param length - 要截取的长度（默认 8 位）
 * @returns 截取后的 ID 或 'unknown'
 */
export function shortenId(id: string | undefined | null, length: number = 8): string {
  if (!id) return 'unknown';
  return id.slice(-length);
}

/**
 * 安全地获取完整 ID 用于日志显示
 * @param id - 事件 ID（可能为 undefined 或 null）
 * @returns 完整 ID 或 'unknown'
 */
export function safeId(id: string | undefined | null): string {
  return id || 'unknown';
}
