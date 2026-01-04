/**
 * 日历同步工具函数
 * 
 * 包含 Private 模式、同步配置处理、远程事件管理等核心功能
 */

import { Contact, Event, PlanSyncConfig, ActualSyncConfig } from '@frontend/types';
import { logger } from './logger';

const syncLogger = logger.module('CalendarSync');

/**
 * 将参与者格式化为描述文本（Private 模式使用）
 * 
 * @param participants 参与者邮箱列表
 * @param originalDescription 原始描述内容
 * @returns 格式化后的描述（参与者信息 + 原始内容）
 * 
 * @example
 * formatParticipantsToDescription(
 *   ['alice@company.com', 'bob@company.com'],
 *   '讨论项目进展'
 * )
 * // 返回: '📧 参与者：alice@company.com, bob@company.com\n\n讨论项目进展'
 */
export function formatParticipantsToDescription(
  participants: string[], 
  originalDescription: string = ''
): string {
  if (!participants || participants.length === 0) {
    return originalDescription;
  }
  
  const participantsText = `📧 参与者：${participants.join(', ')}`;
  
  return originalDescription 
    ? `${participantsText}\n\n${originalDescription}`
    : participantsText;
}

/**
 * 从描述文本中提取参与者信息（Private 模式使用）
 * 
 * @param description 包含参与者信息的描述
 * @returns { participants: string[], cleanDescription: string }
 * 
 * @example
 * extractParticipantsFromDescription(
 *   '📧 参与者：alice@company.com, bob@company.com\n\n讨论项目进展'
 * )
 * // 返回: { 
 * //   participants: ['alice@company.com', 'bob@company.com'], 
 * //   cleanDescription: '讨论项目进展' 
 * // }
 */
export function extractParticipantsFromDescription(description: string): {
  participants: string[];
  cleanDescription: string;
} {
  if (!description) {
    return { participants: [], cleanDescription: '' };
  }
  
  const participantsRegex = /^📧 参与者：(.+)$/m;
  const match = description.match(participantsRegex);
  
  if (!match) {
    return { participants: [], cleanDescription: description };
  }
  
  const participantsText = match[1];
  const participants = participantsText.split(',').map(email => email.trim());
  
  // 移除参与者行，保留其余内容
  const cleanDescription = description
    .replace(participantsRegex, '')
    .replace(/^\n+/, '')  // 移除开头的空行
    .trim();
  
  return { participants, cleanDescription };
}

/**
 * 检查同步模式是否为 Private 模式
 */
export function isPrivateMode(syncMode: string): boolean {
  return syncMode.includes('-private');
}

/**
 * 获取同步模式的显示配置
 */
export function getSyncModeConfig(mode: string) {
  const configs = {
    'receive-only': { icon: '📥', label: '只接收同步', color: '#4CAF50' },
    'send-only': { icon: '📤', label: '只发送同步', color: '#2196F3' },
    'send-only-private': { icon: '📤🔒', label: '只发送（仅自己）', color: '#2196F3' },
    'bidirectional': { icon: '🔄', label: '双向同步', color: '#FF9800' },
    'bidirectional-private': { icon: '🔄🔒', label: '双向同步（仅自己）', color: '#FF9800' }
  };
  
  return configs[mode as keyof typeof configs] || { icon: '❓', label: mode, color: '#9E9E9E' };
}

/**
 * 验证 Plan 同步模式是否有效
 */
export function isValidPlanSyncMode(mode: string): boolean {
  const validModes = ['receive-only', 'send-only', 'send-only-private', 'bidirectional', 'bidirectional-private'];
  return validModes.includes(mode);
}

/**
 * 验证 Actual 同步模式是否有效
 */
export function isValidActualSyncMode(mode: string): boolean {
  const validModes = ['send-only', 'send-only-private', 'bidirectional', 'bidirectional-private'];
  return validModes.includes(mode);
}

/**
 * 获取事件的有效 Plan 同步配置
 */
export function getEffectivePlanSyncConfig(event: Event): PlanSyncConfig | null {
  return event.planSyncConfig || null;
}

/**
 * 获取事件的有效 Actual 同步配置
 */
export function getEffectiveActualSyncConfig(event: Event): ActualSyncConfig | null {
  // 如果有显式的 actualSyncConfig，使用它
  if (event.actualSyncConfig) {
    return event.actualSyncConfig;
  }
  
  // 否则尝试从 planSyncConfig 继承（如果 plan 模式支持 actual）
  if (event.planSyncConfig) {
    const planMode = event.planSyncConfig.mode;
    
    // receive-only 不能被 actual 继承
    if (planMode === 'receive-only') {
      return null;
    }
    
    // 其他模式可以被继承
    return {
      mode: planMode as any, // 类型转换，因为 actual 不支持 receive-only
      targetCalendars: event.planSyncConfig.targetCalendars
    };
  }
  
  return null;
}

/**
 * 准备要同步到远程日历的事件数据
 */
export function prepareRemoteEventData(event: Event, syncMode: string) {
  const isPrivate = isPrivateMode(syncMode);
  
  // 准备基础远程事件数据
  const remoteEvent = {
    title: event.title?.simpleTitle || '',
    description: event.description || '',
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    attendees: [] as string[],
  };
  
  // Private 模式处理
  if (isPrivate && event.attendees && event.attendees.length > 0) {
    // 参与者不被邀请，而是作为文本添加到描述中
    const participantEmails = event.attendees.map(a => a.email).filter(Boolean) as string[];
    remoteEvent.description = formatParticipantsToDescription(
      participantEmails, 
      remoteEvent.description
    );
    // attendees 保持为空数组（不邀请任何人）
  } else {
    // 普通模式：正常邀请参与者
    remoteEvent.attendees = event.attendees?.map(a => a.email).filter(Boolean) as string[] || [];
  }
  
  return remoteEvent;
}

/**
 * 检查是否应该同步事件
 */
export function shouldSyncEvent(event: Event, syncType: 'plan' | 'actual'): boolean {
  if (syncType === 'plan') {
    const config = getEffectivePlanSyncConfig(event);
    return config !== null;
  } else {
    const config = getEffectiveActualSyncConfig(event);
    return config !== null;
  }
}

/**
 * 计算远程事件数量（基于同步场景矩阵）
 */
export function calculateRemoteEventCount(event: Event): number {
  const planConfig = getEffectivePlanSyncConfig(event);
  const actualConfig = getEffectiveActualSyncConfig(event);
  
  if (!planConfig && !actualConfig) {
    return 0; // 不同步
  }
  
  // 只有 Plan
  if (planConfig && !actualConfig) {
    if (planConfig.mode === 'receive-only') {
      return 0; // 只接收，不创建远程事件
    }
    return 1; // Plan 创建 1 个事件
  }
  
  // 只有 Actual  
  if (!planConfig && actualConfig) {
    return 1; // Actual 创建 1 个事件
  }
  
  // Plan 和 Actual 都有
  if (planConfig && actualConfig) {
    const planCreatesEvent = planConfig.mode !== 'receive-only';
    const actualCreatesEvent = true; // Actual 总是创建事件（不支持 receive-only）
    
    if (planCreatesEvent && actualCreatesEvent) {
      // 检查是否为相同日历的场景
      const planCalendars = new Set(planConfig.targetCalendars);
      const actualCalendars = new Set(actualConfig.targetCalendars);
      const hasOverlap = [...planCalendars].some(cal => actualCalendars.has(cal));
      
      if (hasOverlap) {
        // 相同日历场景：2 个独立事件（基于 Matrix 分析）
        return 2;
      } else {
        // 不同日历场景：Plan 1 + Actual M
        return 1 + actualConfig.targetCalendars.length;
      }
    } else if (planCreatesEvent) {
      return 1; // 只有 Plan 创建
    } else if (actualCreatesEvent) {
      return actualConfig.targetCalendars.length; // 只有 Actual 创建
    }
  }
  
  return 0;
}

/**
 * 日志记录同步操作
 */
export function logSyncOperation(operation: string, event: Event, details?: any) {
  syncLogger.log(`🔄 [${operation}] Event: ${event.id} (${event.title})`, details);
}

/**
 * 处理同步错误
 */
export function handleSyncError(operation: string, event: Event, error: any) {
  syncLogger.error(`❌ [${operation}] Failed for event: ${event.id}`, error);
}