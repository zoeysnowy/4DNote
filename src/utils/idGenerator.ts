/**
 * ID 生成器 - 使用 UUID v4 生成全局唯一 ID
 * 
 * 特性：
 * - 业界标准（Notion, Linear, Feishu 等都在使用）
 * - 全局唯一（128位随机数，碰撞概率极低）
 * - 多设备离线创建安全（无需服务器协调）
 * - 无状态生成（不需要池管理，无阻塞）
 * 
 * 迁移说明：
 * - v2.17: 从 nanoid 迁移到 UUID v4
 * - 原因: UUID 是工业标准，简化ID池管理，消除临时ID问题
 * 
 * @version 2.17.0
 * @date 2025-12-11
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 生成事件 ID
 * 格式: event_550e8400-e29b-41d4-a716-446655440000
 * 长度: 6 (前缀) + 36 (UUID) = 42 字符
 */
export function generateEventId(): string {
  return `event_${uuidv4()}`;
}

/**
 * 生成标签 ID
 * 格式: tag_550e8400-e29b-41d4-a716-446655440000
 * 长度: 4 (前缀) + 36 (UUID) = 40 字符
 */
export function generateTagId(): string {
  return `tag_${uuidv4()}`;
}

/**
 * 生成联系人 ID
 * 格式: contact_550e8400-e29b-41d4-a716-446655440000
 * 长度: 8 (前缀) + 36 (UUID) = 44 字符
 */
export function generateContactId(): string {
  return `contact_${uuidv4()}`;
}

/**
 * 生成附件 ID
 * 格式: attach_550e8400-e29b-41d4-a716-446655440000
 * 长度: 7 (前缀) + 36 (UUID) = 43 字符
 */
export function generateAttachmentId(): string {
  return `attach_${uuidv4()}`;
}

/**
 * 生成用户 ID
 * 格式: user_V1StGXR8_Z5jdHi6B-JnuZ4
 * 长度: 5 (前缀) + 21 (nanoid) = 26 字符
 */
export function generateUserId(): string {
  return `user_${nanoid(21)}`;
}

/**
 * 生成通用 ID（用于未分类的实体）
 * 格式: V1StGXR8_Z5jdHi6B-JnuZ4
 * 长度: 21 字符
 */
export function generateId(): string {
  return nanoid(21);
}

/**
 * 验证 ID 格式是否有效
 * @param id 待验证的 ID
 * @param type 可选：验证特定类型的 ID（如 'event', 'tag'）
 */
export function isValidId(id: string, type?: 'event' | 'tag' | 'contact' | 'attach' | 'user'): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // 如果指定了类型，验证前缀
  if (type) {
    const prefixMap = {
      event: 'event_',
      tag: 'tag_',
      contact: 'contact_',
      attach: 'attach_',
      user: 'user_',
    };
    
    const prefix = prefixMap[type];
    if (!id.startsWith(prefix)) return false;
    
    const idPart = id.slice(prefix.length);
    
    // 🔥 支持两种格式:
    // 1. nanoid: 21字符 (A-Za-z0-9_-)
    // 2. UUID v4: 36字符 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    const isNanoid = idPart.length === 21 && /^[A-Za-z0-9_-]+$/.test(idPart);
    const isUUID = idPart.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idPart);
    
    return isNanoid || isUUID;
  }
  
  // 通用验证：至少 10 字符，只包含字母数字和 _-
  return id.length >= 10 && /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * 从旧格式 ID 迁移到新格式
 * 用于数据迁移场景
 * 
 * @example
 * migrateId('event_1733126400000') -> 'event_V1StGXR8_Z5jdHi6B-JnuZ4'
 */
export function migrateId(oldId: string, type: 'event' | 'tag' | 'contact' | 'attach' | 'user'): string {
  // 如果已经是新格式，直接返回
  if (isValidId(oldId, type)) {
    return oldId;
  }
  
  // 生成新 ID
  const generators = {
    event: generateEventId,
    tag: generateTagId,
    contact: generateContactId,
    attach: generateAttachmentId,
    user: generateUserId,
  };
  
  return generators[type]();
}
