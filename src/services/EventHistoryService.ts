/**
 * EventHistoryService - 事件变更历史记录服务
 * 
 * 职责：
 * 1. 记录所有事件的 CRUD 操作历史
 * 2. 支持按时间范围、事件ID、操作类型查询历史
 * 3. 提供历史统计分析功能
 * 4. 自动清理过期历史记录
 * 
 * ⚠️ 存储架构变更（2025-12-06）：
 * - 历史记录已迁移到 SQLite (IndexedDB)
 * - 自动清理机制防止存储溢出
 */

import { Event } from '@frontend/types';
import {
  EventChangeLog,
  ChangeOperation,
  ChangeDetail,
  HistoryQueryOptions,
  HistoryStatistics
} from '@frontend/types/eventHistory';
import { logger } from '@frontend/utils/logger';
import { formatTimeForStorage, parseLocalTimeString } from '@frontend/utils/timeUtils';
import { StorageManager } from '@backend/storage/StorageManager';
import { SignatureUtils } from '@frontend/utils/signatureUtils';
import { resolveCheckState } from '@frontend/utils/TimeResolver';
import { hasTaskFacet } from '@frontend/utils/eventFacets';

const historyLogger = logger.module('EventHistory');

// 默认保留历史记录的天数（🆕 30天 - Block-Level 优化）
const DEFAULT_RETENTION_DAYS = 30;

// 最大历史记录数（🆕 10,000 - Block-Level 优化）
const MAX_HISTORY_COUNT = 10000;

// 全局 StorageManager 实例
let storageManager: StorageManager | null = null;

// 🆕 [v2.18.8] 去重缓存：防止1秒内重复记录同一事件
const recentCallsCache = new Map<string, number>();

// ✅ v2.21.1: 存储定时器ID，支持清理
let cacheCleanupIntervalId: NodeJS.Timeout | null = null;

// 🆕 [v2.18.8] 启动去重缓存清理定时器
function startCacheCleanup(): void {
  if (cacheCleanupIntervalId) {
    historyLogger.warn('⚠️ 去重缓存清理定时器已在运行');
    return;
  }
  
  cacheCleanupIntervalId = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, timestamp] of recentCallsCache.entries()) {
      if (now - timestamp > 5000) { // 5秒后清理
        recentCallsCache.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      historyLogger.debug(`🧹 去重缓存清理: ${cleanedCount} 条`);
    }
  }, 10000); // 每10秒清理一次
}

// ✅ v2.21.1: 停止去重缓存清理
function stopCacheCleanup(): void {
  if (cacheCleanupIntervalId) {
    clearInterval(cacheCleanupIntervalId);
    cacheCleanupIntervalId = null;
    historyLogger.log('✅ 已停止去重缓存清理定时器');
  }
}

/**
 * 🔧 自动获取 StorageManager 实例
 * 如果未手动初始化，则从 EventService 获取 storageManager 单例
 */
async function getStorageManager(): Promise<StorageManager | null> {
  if (storageManager) return storageManager;
  
  // 尝试从 EventService 获取全局 storageManager 单例
  try {
    const { storageManager: sm } = await import('./storage/StorageManager');
    if (sm) {
      storageManager = sm;
      historyLogger.log('✅ EventHistoryService 自动获取 StorageManager 单例');
      return sm;
    }
  } catch (error) {
    historyLogger.error('❌ 无法获取 StorageManager 单例:', error);
  }
  
  return null;
}

// 字段显示名称映射
const FIELD_DISPLAY_NAMES: Record<string, string> = {
  title: '标题',
  description: '描述',
  startTime: '开始时间',
  endTime: '结束时间',
  isAllDay: '全天事件',
  location: '地点',
  tags: '标签',
  priority: '优先级',
  isCompleted: '完成状态',
  color: '颜色',
  emoji: '图标',
  reminder: '提醒',
  content: '内容',
  notes: '备注',
  eventLog: '时间日志', // 🆕 添加：追踪时间日志变化
  simpleTitle: '简单标题',
  fullTitle: '富文本标题',
  timeSpec: '时间规范',
  displayHint: '显示提示',
  dueDateTime: '截止日期/时间'
};

export class EventHistoryService {
  /**
   * 初始化 StorageManager（必须在使用前调用）
   */
  static async initialize(sm: StorageManager): Promise<void> {
    storageManager = sm;
    historyLogger.log('✅ EventHistoryService 已初始化');

    // 🆕 [v2.18.2] 启动定期清理任务
    this.startPeriodicCleanup();
    
    // ✅ v2.21.1: 启动去重缓存清理
    startCacheCleanup();
    
    // ✅ v2.21.1: 使用 queueMicrotask 替代 setTimeout，更可靠且不阻塞
    queueMicrotask(async () => {
      try {
        const deleted = await this.autoCleanup();
        if (deleted > 0) {
          historyLogger.log(`🧹 初始清理: 删除 ${deleted} 条记录`);
        }
      } catch (error) {
        historyLogger.error('❌ 初始清理失败:', error);
      }
    });
  }

  /**
   * 记录事件创建
   * @param customTimestamp - 可选，指定创建时间（用于补录历史记录）
   */
  static logCreate(event: Event, source: string = 'user', customTimestamp?: Date): EventChangeLog {
    const log: EventChangeLog = {
      id: this.generateLogId(),
      eventId: event.id,
      operation: 'create',
      timestamp: formatTimeForStorage(customTimestamp || new Date()),
      after: { ...event },
      source,
      changes: this.extractChanges({}, event)
    };

    console.log('[EventHistoryService] 🔄 准备 logCreate:', {
      eventId: event.id?.slice(-10),
      fullEventId: event.id,
      timestamp: log.timestamp,
      title: event.title,
      source,
      // 🆕 [v2.18.8] 添加调用堆栈，诊断重复调用
      stack: new Error().stack?.split('\n').slice(2, 6).join('\n')
    });
    
    this.saveLog(log);
    
    console.log('[EventHistoryService] ✅ logCreate 完成');
    historyLogger.log('📝 [Create] 记录创建:', event.title);
    return log;
  }

  /**
   * 记录事件更新
   * @param customTimestamp - 可选，指定更新时间（用于补录历史记录）
   */
  static logUpdate(
    eventId: string,
    before: Event,
    after: Partial<Event>,
    source: string = 'user',
    customTimestamp?: Date
  ): EventChangeLog {
    const changes = this.extractChanges(before, after);
    
    // 如果没有实质性变更，不记录
    if (changes.length === 0) {
      historyLogger.log('⏭️ [Update] 无实质性变更，跳过记录:', {
        eventId: eventId.slice(-8),
        source,
        传入字段: Object.keys(after).join(', ')
      });
      return null as any;
    }

    const log: EventChangeLog = {
      id: this.generateLogId(),
      eventId,
      operation: 'update',
      timestamp: formatTimeForStorage(customTimestamp || new Date()),
      before: { ...before },
      after: { ...after },
      source,
      changes
    };

    this.saveLog(log);
    historyLogger.log('📝 [Update] 记录变更:', {
      eventId: eventId.slice(-8),
      source,
      变更字段: changes.map(c => c.field).join(', ')
    });
    return log;
  }

  /**
   * 记录事件删除
   */
  static logDelete(event: Event, source: string = 'user'): EventChangeLog {
    const log: EventChangeLog = {
      id: this.generateLogId(),
      eventId: event.id,
      operation: 'delete',
      timestamp: formatTimeForStorage(new Date()),
      before: { ...event },
      source
    };

    this.saveLog(log);
    historyLogger.log('🗑️ [Delete] 记录删除:', event.title);
    return log;
  }

  /**
   * 🆕 v3.1: 记录事件删除（带 best snapshot）
   * 用于空白事件清理场景：记录事件的"最富有状态"而非删除前的空状态
   * 
   * @param event 被删除的事件（当前状态）
   * @param snapshot 最佳快照（历史上最丰富的状态）
   * @param source 删除来源
   */
  static logDeleteWithSnapshot(
    event: Event,
    snapshot: import('@frontend/utils/eventContentSemantics').EventSnapshot,
    source: string = 'user'
  ): EventChangeLog {
    const log: EventChangeLog = {
      id: this.generateLogId(),
      eventId: event.id,
      operation: 'delete',
      timestamp: formatTimeForStorage(new Date()),
      before: { ...event },
      source,
      // 🆕 附加 best snapshot（用于 Snapshot 附件模式展示）
      metadata: {
        bestSnapshot: snapshot,
        snapshotScore: snapshot.score,
        lastNonBlankAt: event.lastNonBlankAt,
        deletionContext: 'blank-cleanup'
      }
    };

    this.saveLog(log);
    historyLogger.log('🗑️📸 [Delete+Snapshot] 记录删除（含最佳快照）:', {
      title: event.title,
      snapshotScore: snapshot.score,
      capturedAt: snapshot.capturedAt
    });
    return log;
  }

  /**
   * 记录签到操作
   */
  static logCheckin(eventId: string, eventTitle: string, metadata?: Record<string, any>): EventChangeLog {
    const log: EventChangeLog = {
      id: this.generateLogId(),
      eventId,
      operation: 'checkin',
      timestamp: formatTimeForStorage(new Date()),
      source: 'user',
      metadata
    };

    this.saveLog(log);
    historyLogger.log('✅ [Checkin] 记录签到:', eventTitle);
    return log;
  }
  
  /**
   * 🔥 v2.15: 记录临时ID到真实ID的映射关系
   * @param tempId 临时ID（line-xxx格式）
   * @param realId 真实ID（event_xxx格式）
   */
  static async recordTempIdMapping(tempId: string, realId: string): Promise<void> {
    const log: EventChangeLog = {
      id: this.generateLogId(),
      eventId: realId,
      operation: 'create',
      timestamp: formatTimeForStorage(new Date()),
      source: 'temp-id-mapping',
      tempIdMapping: {
        tempId,
        realId,
        timestamp: formatTimeForStorage(new Date())
      },
      metadata: {
        type: 'temp-id-resolution',
        description: `临时ID ${tempId} 转换为真实ID ${realId}`
      }
    };
    
    this.saveLog(log);
    historyLogger.log('🔥 [TempId] 记录ID映射:', { tempId, realId });
  }
  
  /**
   * 🔥 v2.15: 查询临时ID对应的真实ID
   * @param tempId 临时ID
   * @returns 真实ID（如果找到）
   */
  static async resolveTempId(tempId: string): Promise<string | null> {
    const sm = await getStorageManager();
    if (!sm) {
      historyLogger.error('❌ StorageManager 未初始化');
      return null;
    }
    
    try {
      const logs = await sm.queryEventHistory({
        limit: 1000,
        operations: ['create']
      });
      
      // 查找包含该临时ID映射的日志
      const mappingLog = logs.find(log => 
        log.tempIdMapping?.tempId === tempId
      );
      
      if (mappingLog && mappingLog.tempIdMapping) {
        historyLogger.log('🔥 [TempId] 找到ID映射:', {
          tempId,
          realId: mappingLog.tempIdMapping.realId
        });
        return mappingLog.tempIdMapping.realId;
      }
      
      historyLogger.log('🔍 [TempId] 未找到ID映射:', { tempId });
      return null;
    } catch (error) {
      historyLogger.error('❌ [TempId] 查询ID映射失败:', error);
      return null;
    }
  }

  /**
   * 查询历史记录（异步，使用 SQLite）
   */
  static async queryHistory(options: HistoryQueryOptions = {}): Promise<EventChangeLog[]> {
    const sm = await getStorageManager();
    if (!sm) {
      historyLogger.error('❌ StorageManager 未初始化');
      return [];
    }

    try {
      const logs = await sm.queryEventHistory({
        eventIds: options.eventId ? [options.eventId] : undefined,
        operations: options.operations as any,
        startTime: options.startTime,
        endTime: options.endTime,
        limit: options.limit,
        offset: options.offset
      });

      return logs;
    } catch (error) {
      historyLogger.error('❌ 查询历史失败:', error);
      return [];
    }
  }

  /**
   * 获取指定时间段的所有变更
   */
  static async getChangesByTimeRange(startTime: string, endTime: string): Promise<EventChangeLog[]> {
    const result = await this.queryHistory({ startTime, endTime });
    console.log('[EventHistoryService] 📊 getChangesByTimeRange:', {
      startTime,
      endTime,
      结果数量: result.length,
      示例: result.slice(0, 3).map(log => ({
        operation: log.operation,
        eventId: log.eventId?.slice(-10),
        timestamp: log.timestamp
      }))
    });
    return result;
  }

  /**
   * 获取单个事件的完整历史
   */
  static async getEventHistory(eventId: string): Promise<EventChangeLog[]> {
    return await this.queryHistory({ eventId });
  }

  /**
   * 查询截止指定时间点还存在的所有事件
   * @param timestamp 时间点（ISO字符串或格式化字符串）
   * @returns 在该时间点存在的事件ID集合
   * 
   * 逻辑说明：
   * 1. 从当前存在的事件开始（基准状态）
   * 2. 过滤掉"在目标时间之后才创建"的事件
   * 3. 添加回"在目标时间之后才删除"的事件（它们在目标时间时还存在）
   */
  static async getExistingEventsAtTime(timestamp: string): Promise<Set<string>> {
    const targetTime = parseLocalTimeString(timestamp);
    const allLogs = await this.queryHistory({});
    
    // 🔧 步骤1：从当前存在的事件开始
    // NOTE: Do not rely on window.EventService (often undefined after refresh).
    // Use StorageManager as the canonical source to avoid circular deps.
    const sm = await getStorageManager();
    const currentEventsResult = sm ? await sm.queryEvents({ limit: 100000 }) : { items: [] as any[] };
    const allCurrentEvents = (currentEventsResult as any).items || [];
    const existingEvents = new Set<string>(allCurrentEvents.filter((e: any) => e && !e.deletedAt).map((e: any) => e.id));
    
    console.log('[EventHistoryService] 📊 getExistingEventsAtTime 步骤1:', {
      timestamp,
      targetTime: formatTimeForStorage(targetTime),
      当前事件总数: existingEvents.size,
      历史记录总数: allLogs.length
    });
    
    // 🔧 步骤2：分析每个事件的完整生命周期
    const eventLifecycle = new Map<string, { createTime?: Date; deleteTime?: Date }>();
    
    allLogs.forEach(log => {
      const logTime = parseLocalTimeString(log.timestamp);
      
      if (!eventLifecycle.has(log.eventId)) {
        eventLifecycle.set(log.eventId, {});
      }
      
      const lifecycle = eventLifecycle.get(log.eventId)!;
      
      if (log.operation === 'create') {
        lifecycle.createTime = logTime;
      } else if (log.operation === 'delete') {
        lifecycle.deleteTime = logTime;
      }
    });
    
    // 🔧 步骤3：根据生命周期调整事件集合
    const createAfterTarget: string[] = [];
    const deleteAfterTarget: string[] = [];
    
    eventLifecycle.forEach((lifecycle, eventId) => {
      const createdAfter = lifecycle.createTime && lifecycle.createTime > targetTime;
      const deletedAfter = lifecycle.deleteTime && lifecycle.deleteTime > targetTime;
      const createdBefore = !lifecycle.createTime || lifecycle.createTime <= targetTime;
      
      if (createdAfter) {
        // 创建时间晚于目标时间 → 目标时间时不存在
        if (existingEvents.has(eventId)) {
          existingEvents.delete(eventId);
          createAfterTarget.push(eventId);
        }
      } else if (deletedAfter && createdBefore) {
        // 删除时间晚于目标时间 && 创建时间早于或等于目标时间
        // → 目标时间时还存在
        if (!existingEvents.has(eventId)) {
          existingEvents.add(eventId);
          deleteAfterTarget.push(eventId);
        }
      }
    });
    
    console.log('[EventHistoryService] 📊 getExistingEventsAtTime 步骤2调整:', {
      移除的事件: createAfterTarget.length + ' 个（创建时间晚于目标时间）',
      添加的事件: deleteAfterTarget.length + ' 个（删除时间晚于目标时间）',
      移除示例: createAfterTarget.slice(0, 3).map(id => id?.slice(-8) || 'undefined'),
      添加示例: deleteAfterTarget.slice(0, 3).map(id => id?.slice(-8) || 'undefined')
    });
    
    console.log('[EventHistoryService] 📊 getExistingEventsAtTime 最终结果:', {
      timestamp,
      existingCount: existingEvents.size,
      示例: Array.from(existingEvents).slice(0, 5).map(id => id?.slice(-8) || 'undefined')
    });
    
    return existingEvents;
  }

  /**
   * 获取时间范围内的事件操作摘要（用于 Snapshot 功能）
   * @returns 包含 created/updated/completed/deleted 事件列表的对象
   */
  static async getEventOperationsSummary(startTime: string, endTime: string): Promise<{
    created: EventChangeLog[];
    updated: EventChangeLog[];
    completed: EventChangeLog[];
    deleted: EventChangeLog[];
    missed: EventChangeLog[];
  }> {
    const logs = await this.queryHistory({ startTime, endTime });
    
    const created = logs.filter(l => l.operation === 'create');
    const deleted = logs.filter(l => l.operation === 'delete');
    
    // updated: 有实质性变更的 update 操作（排除 completed）
    const updated = logs.filter(l => 
      l.operation === 'update' && 
      !l.changes?.some(c => 
        c.field === 'isCompleted' || 
        c.field === 'checked' || 
        c.field === 'unchecked'
      )
    );
    
    // completed: 标记为完成的操作
    const completed = logs.filter(l => 
      l.operation === 'update' && 
      l.changes?.some(c => 
        (c.field === 'isCompleted' && c.newValue === true) ||
        (c.field === 'checked' && Array.isArray(c.newValue) && c.newValue.length > 0)
      )
    );
    
    // missed: 过期未完成的事件（派生，不落盘）
    // 规则（与 TimeCalendar/TimeResolver 对齐）：
    // - 仅对 task-like（hasTaskFacet）且存在 planned endTime 的事件判断
    // - 判断时间取 min(现在, rangeEnd)
    // - endTime 落在该 range 内，且 endTime <= evalTime，且当前未完成 => missed
    const missed: EventChangeLog[] = [];
    try {
      const sm = await getStorageManager();
      if (sm) {
        const rangeStartDate = parseLocalTimeString(startTime);
        const rangeEndDate = parseLocalTimeString(endTime);
        const now = new Date();
        const evalTime = new Date(Math.min(now.getTime(), rangeEndDate.getTime()));

        const result = await sm.queryEvents({ limit: 10000 });
        const activeEvents = result.items.filter((e: any) => !e.deletedAt);

        activeEvents.forEach((event: any) => {
          if (!event?.id) return;
          if (!hasTaskFacet(event)) return;
          if (!event.endTime) return;

          const plannedEnd = parseLocalTimeString(event.endTime);
          if (plannedEnd < rangeStartDate || plannedEnd > rangeEndDate) return;
          if (plannedEnd > evalTime) return;

          const { isChecked } = resolveCheckState(event);
          if (isChecked) return;

          missed.push({
            id: this.generateLogId(),
            eventId: event.id,
            operation: 'update',
            timestamp: formatTimeForStorage(evalTime),
            source: 'derived',
            after: {
              id: event.id,
              title: event.title,
              endTime: event.endTime,
            },
            changes: [
              {
                field: 'missed',
                oldValue: false,
                newValue: true,
                displayName: 'Missed (derived)'
              }
            ],
            metadata: {
              derived: true,
              kind: 'missed',
              plannedEndTime: event.endTime,
              evaluatedAt: formatTimeForStorage(evalTime)
            }
          });
        });
      }
    } catch (error) {
      historyLogger.warn('⚠️ missed 派生计算失败（降级为空）:', error);
    }
    
    console.log('[EventHistoryService] 📊 getEventOperationsSummary:', {
      timeRange: `${startTime} ~ ${endTime}`,
      created: created.length,
      updated: updated.length,
      completed: completed.length,
      deleted: deleted.length,
      missed: missed.length
    });
    
    return { created, updated, completed, deleted, missed };
  }

  /**
   * 批量获取事件在时间范围内的状态
   * @returns Map<eventId, EventChangeLog[]> 每个事件在该时间范围内的历史记录
   */
  static async getEventStatusesInRange(
    eventIds: string[], 
    startTime: string, 
    endTime: string
  ): Promise<Map<string, EventChangeLog[]>> {
    const logs = await this.queryHistory({ startTime, endTime });
    const statusMap = new Map<string, EventChangeLog[]>();
    
    // 初始化所有事件的空数组
    eventIds.forEach(id => statusMap.set(id, []));
    
    // 按事件ID分组
    logs.forEach(log => {
      if (statusMap.has(log.eventId)) {
        statusMap.get(log.eventId)!.push(log);
      }
    });
    
    console.log('[EventHistoryService] 📊 getEventStatusesInRange:', {
      timeRange: `${startTime} ~ ${endTime}`,
      eventCount: eventIds.length,
      logsFound: logs.length,
      eventsWithHistory: Array.from(statusMap.values()).filter(arr => arr.length > 0).length
    });
    
    return statusMap;
  }

  /**
   * 获取历史统计信息
   */
  static async getStatistics(startTime?: string, endTime?: string): Promise<HistoryStatistics> {
    const logs = await this.queryHistory({ startTime, endTime });

    // 统计各类操作数量
    const stats: HistoryStatistics = {
      totalChanges: logs.length,
      createCount: logs.filter(l => l.operation === 'create').length,
      updateCount: logs.filter(l => l.operation === 'update').length,
      deleteCount: logs.filter(l => l.operation === 'delete').length,
      checkinCount: logs.filter(l => l.operation === 'checkin').length,
      dateRange: {
        earliest: logs.length > 0 ? logs[logs.length - 1].timestamp : '',
        latest: logs.length > 0 ? logs[0].timestamp : ''
      },
      topModifiedEvents: []
    };

    // 统计修改最频繁的事件
    const eventChangeCounts = new Map<string, { title: string; count: number }>();
    
    logs.forEach(log => {
      if (log.operation === 'update') {
        const current = eventChangeCounts.get(log.eventId) || {
          title: (log.before as any)?.title || (log.after as any)?.title || 'Unknown',
          count: 0
        };
        current.count++;
        eventChangeCounts.set(log.eventId, current);
      }
    });

    stats.topModifiedEvents = Array.from(eventChangeCounts.entries())
      .map(([eventId, data]) => ({
        eventId,
        title: data.title,
        changeCount: data.count
      }))
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 10); // 取前10个

    return stats;
  }

  /**
   * 检查并清理历史记录（应用启动时调用）
   */
  static async checkAndCleanup(): Promise<void> {
    try {
      const stats = await this.getBasicStatistics();
      
      // Silent return if StorageManager not initialized yet
      if (!stats) {
        return;
      }
      
      const count = stats.total || 0;
      
      historyLogger.log(`📊 历史记录统计：共 ${count} 条`);
      
      // 如果超过阈值，立即清理
      if (count > MAX_HISTORY_COUNT) {
        historyLogger.warn(`⚠️ 历史记录超限（${count}/${MAX_HISTORY_COUNT}），开始清理...`);
        const deleted = await this.autoCleanup();
        historyLogger.log(`✅ 清理完成：删除 ${deleted} 条过期记录`);
      } else if (count > MAX_HISTORY_COUNT * 0.8) {
        historyLogger.warn(`⚠️ 历史记录即将超限（${count}/${MAX_HISTORY_COUNT}），建议清理`);
      }
    } catch (error) {
      historyLogger.error('❌ 检查历史记录失败:', error);
    }
  }

  /**
   * 清理过期历史记录
   */
  static async cleanupOldLogs(retentionDays: number = DEFAULT_RETENTION_DAYS): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const removedCount = await this.autoCleanup();
      historyLogger.log(`🧹 清理完成: 删除了 ${removedCount} 条过期记录 (保留${retentionDays}天内)`);
      
      return removedCount;
    } catch (error) {
      historyLogger.error('❌ 清理失败:', error);
      return 0;
    }
  }

  /**
   * 导出历史记录为 JSON
   */
  static async exportToJSON(options: HistoryQueryOptions = {}): Promise<string> {
    const logs = await this.queryHistory(options);
    return JSON.stringify(logs, null, 2);
  }

  /**
   * 导出历史记录为 CSV
   */
  static async exportToCSV(options: HistoryQueryOptions = {}): Promise<string> {
    const logs = await this.queryHistory(options);
    
    // CSV 头部
    const headers = ['时间', '事件ID', '事件标题', '操作', '变更字段', '来源'];
    const rows = [headers.join(',')];

    // 数据行
    logs.forEach(log => {
      const title = (log.before as any)?.title || (log.after as any)?.title || '';
      const changes = log.changes?.map((c: ChangeDetail) => `${c.displayName || c.field}`).join('; ') || '';
      
      const row = [
        log.timestamp,
        log.eventId,
        `"${title.replace(/"/g, '""')}"`, // CSV转义
        log.operation,
        `"${changes.replace(/"/g, '""')}"`,
        log.source || ''
      ];
      
      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  // ==================== 私有方法 ====================

  /**
   * 生成日志ID
   */
  private static generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 保存日志到存储（使用 SQLite）
   */
  private static saveLog(log: EventChangeLog): void {
    // 异步保存（不阻塞主流程）
    this.saveLogToStorage(log).catch(error => {
      historyLogger.error('❌ 保存日志失败:', error);
    });
  }

  /**
   * 保存日志到 SQLite（异步）
   */
  private static async saveLogToStorage(log: EventChangeLog): Promise<void> {
    const sm = await getStorageManager();
    if (!sm) {
      historyLogger.error('❌ StorageManager 未初始化');
      return;
    }

    try {
      await sm.createEventHistory({
        id: log.id,
        eventId: log.eventId,
        operation: log.operation,
        timestamp: log.timestamp,
        source: log.source,
        before: log.before,
        after: log.after,
        changes: log.changes,
        metadata: log.metadata
      });
    } catch (error) {
      historyLogger.error('❌ saveLogToStorage 失败:', error);
      throw error;
    }
  }

  /**
   * 🆕 智能清理历史记录（v2.18.8 - 只清理脏数据）
   * 
   * 策略：
   * 1. 删除无意义变更（只改了 updatedAt、tags 等的脏数据）
   * 2. 删除 backfill 记录（临时数据）
   * 3. **保留所有有意义的变更**（不限制数量）
   */
  static async autoCleanup(): Promise<number> {
    const sm = await getStorageManager();
    if (!sm) {
      historyLogger.error('❌ StorageManager 未初始化');
      return 0;
    }

    try {
      const stats = await this.getBasicStatistics();
      const totalCount = stats?.total || 0;
      let totalDeleted = 0;

      // 🔧 获取所有记录
      const allLogs = await sm.queryEventHistory({ limit: totalCount + 1000 });

      // 🔴 层级1: 删除无意义变更（脏数据）
      const meaninglessLogs = allLogs.filter(log => {
        if (!log.changes || log.changes.length === 0) {
          return true; // 没有变更记录
        }
        
        // 检查是否只改了无意义字段
        const meaningfulChanges = log.changes.filter(change => {
          // updatedAt 变更不算有意义（之前的 bug）
          if (change.field === 'updatedAt') return false;
          
          // tags 从 undefined → [] 不算有意义（之前的 bug）
          if (change.field === 'tags' && 
              (change.oldValue === undefined || change.oldValue === 'undefined') && 
              (change.newValue === '[]' || change.newValue === '' || !change.newValue)) {
            return false;
          }
          
          // description 签名变更不算有意义（之前的 bug）
          if (change.field === 'description') {
            const oldCore = this.extractCoreContent(change.oldValue || '');
            const newCore = this.extractCoreContent(change.newValue || '');
            return oldCore !== newCore;
          }
          
          return true; // 其他变更都算有意义
        });
        
        return meaningfulChanges.length === 0; // 没有有意义的变更
      });

      if (meaninglessLogs.length > 0) {
        await Promise.all(meaninglessLogs.map(log => sm.deleteEventHistory(log.id)));
        totalDeleted += meaninglessLogs.length;
        historyLogger.log(`🧹 清理脏数据: 删除 ${meaninglessLogs.length} 条无意义变更`);
      }

      // 🟡 层级2: 删除 backfill 记录
      const remainingLogs = allLogs.filter(log => !meaninglessLogs.includes(log));
      const backfillLogs = remainingLogs.filter(log => log.source === 'backfill-from-timestamp');
      
      if (backfillLogs.length > 0) {
        await Promise.all(backfillLogs.map(log => sm.deleteEventHistory(log.id)));
        totalDeleted += backfillLogs.length;
        historyLogger.log(`🧹 清理backfill: 删除 ${backfillLogs.length} 条记录`);
      }

      // ✅ 保留所有有意义的变更
      const meaningfulLogs = remainingLogs.filter(log => 
        !meaninglessLogs.includes(log) && !backfillLogs.includes(log)
      );

      const finalCount = totalCount - totalDeleted;
      // 只在有实际删除时才输出日志
      if (totalDeleted > 0) {
        historyLogger.log(`🧹 智能清理: 删除 ${totalDeleted} 条记录，剩余 ${finalCount} 条`);
      }
      return totalDeleted;
    } catch (error) {
      historyLogger.error('❌ 清理失败:', error);
      return 0;
    }
  }

  /**
   * 🆕 健康检查：诊断 EventHistory 状态
   */
  static async healthCheck(): Promise<{
    total: number;
    bySource: Record<string, number>;
    oldestRecord: string;
    newestRecord: string;
    recommendCleanup: boolean;
    estimatedCleanupCount: number;
  }> {
    const sm = await getStorageManager();
    if (!sm) {
      return {
        total: 0,
        bySource: {},
        oldestRecord: '',
        newestRecord: '',
        recommendCleanup: false,
        estimatedCleanupCount: 0
      };
    }

    try {
      const stats = await this.getBasicStatistics();
      if (!stats) {
        return {
          total: 0,
          bySource: {},
          oldestRecord: '',
          newestRecord: '',
          recommendCleanup: false,
          estimatedCleanupCount: 0
        };
      }

      // 统计按来源分类
      const logs = await this.queryHistory({ limit: 100000 });
      const bySource: Record<string, number> = {};
      logs.forEach(log => {
        const source = log.source || 'unknown';
        bySource[source] = (bySource[source] || 0) + 1;
      });

      // 估算清理数量
      const backfillCount = bySource['backfill-from-timestamp'] || 0;
      const oldCount = await this.estimateOldRecords(DEFAULT_RETENTION_DAYS);

      return {
        total: stats.total || 0,
        bySource,
        oldestRecord: stats.oldestTimestamp || '',
        newestRecord: stats.newestTimestamp || '',
        recommendCleanup: (stats.total || 0) > MAX_HISTORY_COUNT * 0.8,
        estimatedCleanupCount: backfillCount + oldCount
      };
    } catch (error) {
      historyLogger.error('❌ healthCheck 失败:', error);
      return {
        total: 0,
        bySource: {},
        oldestRecord: '',
        newestRecord: '',
        recommendCleanup: false,
        estimatedCleanupCount: 0
      };
    }
  }

  /**
   * 🆕 估算超过保留期的记录数
   */
  static async estimateOldRecords(retentionDays: number): Promise<number> {
    const sm = await getStorageManager();
    if (!sm) return 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // 🔧 修复：使用 sqliteService.db 而不是 sm.db
      const sqliteService = (sm as any).sqliteService;
      if (!sqliteService?.db) {
        historyLogger.warn('⚠️ SQLite service not available');
        return 0;
      }

      const result = await sqliteService.db.get(`
        SELECT COUNT(*) as count 
        FROM eventHistory 
        WHERE timestamp < ?
      `, [formatTimeForStorage(cutoffDate)]);

      return result?.count || 0;
    } catch (error) {
      historyLogger.error('❌ estimateOldRecords 失败:', error);
      return 0;
    }
  }

  // ✅ v2.21.1: 存储定期清理定时器ID
  private static periodicCleanupIntervalId: NodeJS.Timeout | null = null;
  
  /**
   * 🆕 启动定期清理任务（每小时）
   */
  static startPeriodicCleanup(): void {
    // ✅ v2.21.1: 防止重复启动
    if (this.periodicCleanupIntervalId) {
      historyLogger.warn('⚠️ 定期清理任务已在运行');
      return;
    }
    
    const interval = 60 * 60 * 1000; // 每小时

    this.periodicCleanupIntervalId = setInterval(async () => {
      const deleted = await this.autoCleanup();
      if (deleted > 0) {
        historyLogger.log(`🧹 定期清理: 删除 ${deleted} 条记录`);
      }
    }, interval);

    historyLogger.log('✅ 已启动定期清理任务（每小时）');
  }
  
  /**
   * ✅ v2.21.1: 停止定期清理任务
   */
  static stopPeriodicCleanup(): void {
    if (this.periodicCleanupIntervalId) {
      clearInterval(this.periodicCleanupIntervalId);
      this.periodicCleanupIntervalId = null;
      historyLogger.log('✅ 已停止定期清理任务');
    }
  }
  
  /**
   * ✅ v2.21.1: 清理所有定时器资源
   */
  static cleanup(): void {
    this.stopPeriodicCleanup();
    stopCacheCleanup();
    historyLogger.log('✅ EventHistoryService 资源已清理');
  }

  /**
   * 获取基础历史统计信息（从 StorageManager）
   */
  static async getBasicStatistics(): Promise<{
    total: number;
    byOperation: Record<string, number>;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  } | null> {
    const sm = await getStorageManager();
    if (!sm) {
      // Silent return during initialization phase
      return null;
    }

    try {
      return await sm.getEventHistoryStats();
    } catch (error) {
      historyLogger.error('❌ 获取统计失败:', error);
      return null;
    }
  }

  /**
   * 提取变更字段详情
   */
  private static extractChanges(before: Partial<Event>, after: Partial<Event>): ChangeDetail[] {
    const changes: ChangeDetail[] = [];
    
    // 🔥 [CRITICAL FIX] 只遍历 after 中存在的字段
    // 避免将 after 中不存在的字段（如本地专属字段）误判为删除
    // 之前：allKeys = before的所有字段 + after的字段
    // 问题：如果 after 只包含 {description}，但 before 有 {tags: ['tag1']}
    //      会遍历到 tags，导致 oldValue=['tag1'], newValue=undefined → 误判为变更
    const allKeys = new Set(Object.keys(after));

    // 忽略的字段（同步元数据和自动更新的时间戳）
    const ignoredFields = new Set([
      'localVersion', 
      'lastSyncTime',
      'position',          // ✅ position 只是排序字段，不应触发历史记录
      'updatedAt',         // 🆕 忽略 updatedAt（每次更新都会变，非实质性变更）
      '_isVirtualTime',    // 🆕 忽略 _isVirtualTime（内部标记，非持久化字段）

      // 🆕 v3.1: 空白清理/快照字段（系统维护的元数据，不应触发历史爆炸）
      'lastNonBlankAt',
      'bestSnapshot'
    ]);

    allKeys.forEach(key => {
      if (ignoredFields.has(key)) return;

      const oldValue = (before as any)[key];
      const newValue = (after as any)[key];

      // 🔍 [v2.18.8] 调试 description 变更
      // ✅ 只在 UPDATE 操作时触发（before 有值），CREATE 操作不触发
      if (key === 'description' && before && oldValue !== undefined) {
        const debugData = {
          eventId: (before as any).id?.slice(-8) || 'unknown',
          before_length: typeof oldValue === 'string' ? oldValue.length : 'N/A',
          after_length: typeof newValue === 'string' ? newValue.length : 'N/A',
          before_first_150: typeof oldValue === 'string' ? oldValue.substring(0, 150) : oldValue,
          after_first_150: typeof newValue === 'string' ? newValue.substring(0, 150) : newValue,
          equal: oldValue === newValue
        };
        
        console.log('[extractChanges] 🔍 description 检查 (UPDATE):', debugData);
        
        // 🆕 发送自定义事件到页面（供 test-event-history.html 监听）
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('description-debug', { detail: debugData }));
        }
      }

      // 🔧 特殊处理: eventlog 字段（比较 Block-Level paragraph 数量来判断版本变化）
      if (key === 'eventlog') {
        const oldBlockCount = this.countBlockLevelParagraphs(oldValue);
        const newBlockCount = this.countBlockLevelParagraphs(newValue);
        
        console.log('[EventHistoryService] eventlog 比较:', {
          oldBlockCount,
          newBlockCount,
          有变化: oldBlockCount !== newBlockCount
        });
        
        if (oldBlockCount !== newBlockCount) {
          changes.push({
            field: key,
            oldValue,
            newValue,
            displayName: FIELD_DISPLAY_NAMES[key] || key
          });
        }
        return;
      }

      // 🔧 特殊处理: title 对象（深度比较）
      if (key === 'title') {
        if (!this.isTitleEqual(oldValue, newValue)) {
          changes.push({
            field: key,
            oldValue,
            newValue,
            displayName: FIELD_DISPLAY_NAMES[key] || key
          });
        }
        return;
      }

      // 🔧 特殊处理: tags 数组（规范化后比较）
      if (key === 'tags') {
        if (!this.isTagsEqual(oldValue, newValue)) {
          changes.push({
            field: key,
            oldValue,
            newValue,
            displayName: FIELD_DISPLAY_NAMES[key] || key
          });
        }
        return;
      }

      // 🔧 特殊处理: description（忽略，因为它是 eventlog 的衍生品，用于外部同步）
      if (key === 'description') {
        // description 不记录到 EventHistory，因为：
        // 1. 它是从 eventlog 生成的（包含签名）
        // 2. 它用于同步到外部系统（Outlook），不是 app 内部状态
        // 3. eventlog 的变化已经被记录，无需重复记录 description
        console.log('[EventHistoryService] 🚫 跳过 description 字段（外部同步字段，不记录历史）');
        return;
      }

      // 深度比较（处理其他数组和对象）
      if (!this.isDeepEqual(oldValue, newValue)) {
        changes.push({
          field: key,
          oldValue,
          newValue,
          displayName: FIELD_DISPLAY_NAMES[key] || key
        });
      }
    });

    return changes;
  }
  
  /**
   * 🆕 统计 EventLog 中 Block-Level paragraph 的数量
   * 用于判断 eventlog 的版本变化（数量增加 = 有新的编辑）
   * Block-Level paragraph 是指带有 createdAt 元数据的 paragraph 节点
   * 
   * ⚠️ 此方法设为 public，供 EventService 在 updateEvent 时判断 eventlog 是否变化
   */
  static countBlockLevelParagraphs(eventlog: any): number {
    if (!eventlog) return 0;
    
    try {
      // 处理 EventLog 对象
      if (typeof eventlog === 'object' && 'slateJson' in eventlog) {
        const parsed = JSON.parse(eventlog.slateJson || '[]');
        if (Array.isArray(parsed)) {
          return parsed.filter((node: any) => 
            node.type === 'paragraph' && node.createdAt !== undefined
          ).length;
        }
      }
      
      // 处理直接的 Slate JSON 字符串
      if (typeof eventlog === 'string') {
        const parsed = JSON.parse(eventlog);
        if (Array.isArray(parsed)) {
          return parsed.filter((node: any) => 
            node.type === 'paragraph' && node.createdAt !== undefined
          ).length;
        }
      }
    } catch {
      // 解析失败，返回 0
    }
    
    return 0;
  }

  /**
   * 🆕 从 EventLog 中提取纯文本内容（忽略 Block Timestamp 元数据）
   */
  private static extractTextFromEventLog(eventlog: any): string {
    if (!eventlog) return '';
    
    try {
      // 处理 EventLog 对象
      if (typeof eventlog === 'object' && 'slateJson' in eventlog) {
        const parsed = JSON.parse(eventlog.slateJson || '[]');
        return this.extractTextFromSlateNodes(parsed);
      }
      
      // 处理直接的 Slate JSON 字符串
      if (typeof eventlog === 'string') {
        const parsed = JSON.parse(eventlog);
        return this.extractTextFromSlateNodes(parsed);
      }
    } catch {
      // 解析失败，直接返回空字符串
    }
    
    return '';
  }
  
  /**
   * 🆕 从 Slate 节点中提取纯文本（忽略时间戳元数据）
   */
  private static extractTextFromSlateNodes(nodes: any[]): string {
    if (!Array.isArray(nodes)) return '';
    
    return nodes.map(node => {
      if (node.type === 'paragraph' && node.children) {
        return node.children.map((child: any) => child.text || '').join('');
      }
      return '';
    }).join('\n').trim();
  }
  
  /**
   * 🆕 从 description 中移除签名，提取核心内容
   * 用于变更检测时只比较实际内容，忽略签名中的时间戳变化
   */
  private static extractCoreContent(description: string): string {
    if (!description) return '';
    
    // ✅ 使用 SignatureUtils 统一处理（支持所有签名格式，包括 TimeLog 前缀）
    return SignatureUtils.extractCoreContent(description);
  }

  /**
   * 🆕 深度比较两个值是否相等
   */
  private static isDeepEqual(a: any, b: any): boolean {
    // 处理 null/undefined
    if (a === b) return true;
    if (a == null || b == null) return false;
    
    // 处理基本类型
    if (typeof a !== 'object' || typeof b !== 'object') {
      return a === b;
    }
    
    // 处理数组
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.isDeepEqual(val, b[idx]));
    }
    
    // 处理对象
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => this.isDeepEqual(a[key], b[key]));
  }

  /**
   * 🆕 比较 title 对象是否相等
   */
  private static isTitleEqual(a: any, b: any): boolean {
    // 处理 null/undefined
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    
    // 提取实际标题文本
    const titleA = typeof a === 'object' ? (a.simpleTitle || a.text || '') : String(a);
    const titleB = typeof b === 'object' ? (b.simpleTitle || b.text || '') : String(b);
    
    return titleA.trim() === titleB.trim();
  }

  /**
   * 🆕 比较 tags 数组是否相等（忽略顺序和空值）
   */
  private static isTagsEqual(a: any, b: any): boolean {
    // 处理 null/undefined
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    
    // 规范化 tags 数组：过滤空值、排序、去重
    const normalize = (tags: any[]) => {
      if (!Array.isArray(tags)) return [];
      return [...new Set(
        tags
          .filter(tag => tag != null && tag !== '')
          .map(tag => String(tag).trim())
      )].sort();
    };
    
    const tagsA = normalize(a);
    const tagsB = normalize(b);
    
    if (tagsA.length !== tagsB.length) return false;
    return tagsA.every((tag, idx) => tag === tagsB[idx]);
  }
}
