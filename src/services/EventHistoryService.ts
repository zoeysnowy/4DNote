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
 * - 历史记录已从 localStorage 迁移到 IndexedDB
 * - localStorage 仅用作 IndexedDB 不可用时的降级方案
 * - 自动清理机制防止存储溢出
 */

import { Event } from '../types';
import {
  EventChangeLog,
  ChangeOperation,
  ChangeDetail,
  HistoryQueryOptions,
  HistoryStatistics
} from '../types/eventHistory';
import { STORAGE_KEYS } from '../constants/storage';
import { logger } from '../utils/logger';
import { formatTimeForStorage, parseLocalTimeString } from '../utils/timeUtils';
import { StorageManager } from './storage/StorageManager';

const historyLogger = logger.module('EventHistory');

// 历史记录存储键（降级方案 - 仅用于迁移）
const HISTORY_STORAGE_KEY = '4dnote_event_history';

// 默认保留历史记录的天数（90天 - SQLite无配额限制）
const DEFAULT_RETENTION_DAYS = 90;

// 最大历史记录数（SQLite支持无限增长，仅用于性能优化）
const MAX_HISTORY_COUNT = 50000;

// 全局 StorageManager 实例
let storageManager: StorageManager | null = null;

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
  dueDate: '截止日期'
};

export class EventHistoryService {
  /**
   * 初始化 StorageManager（必须在使用前调用）
   */
  static async initialize(sm: StorageManager): Promise<void> {
    storageManager = sm;
    historyLogger.log('✅ EventHistoryService 已初始化');
    
    // 迁移 localStorage 数据到 SQLite（仅执行一次）
    await this.migrateFromLocalStorage();
  }

  /**
   * 迁移 localStorage 历史记录到 IndexedDB
   */
  private static async migrateFromLocalStorage(): Promise<void> {
    try {
      const localData = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!localData) {
        historyLogger.log('✅ 无需迁移（localStorage 无数据）');
        return;
      }

      const logs: EventChangeLog[] = JSON.parse(localData);
      if (logs.length === 0) {
        historyLogger.log('✅ 无需迁移（localStorage 数据为空）');
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        return;
      }

      historyLogger.log(`🔄 开始迁移 ${logs.length} 条历史记录到 IndexedDB...`);
      
      let migratedCount = 0;
      for (const log of logs) {
        try {
          // 使用幂等方法，避免重复插入导致主键冲突
          await storageManager!.createOrUpdateEventHistory({
            id: log.id,
            eventId: log.eventId,
            operation: log.operation,
            timestamp: log.timestamp,
            source: log.source,
            before: log.before,
            after: log.after,
            changes: log.changes,
            userId: log.userId,
            metadata: log.metadata
          });
          migratedCount++;
        } catch (error) {
          historyLogger.error('❌ 迁移单条记录失败:', log.id, error);
        }
      }

      historyLogger.log(`✅ 迁移完成: ${migratedCount}/${logs.length} 条`);
      
      // 直接清除旧数据（已迁移到 IndexedDB，无需备份到 localStorage）
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      historyLogger.log('✅ 已清除 localStorage 旧数据（已迁移到 IndexedDB）');
    } catch (error) {
      historyLogger.error('❌ 迁移失败:', error);
    }
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
      source
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
   * 查询历史记录（异步，使用 SQLite）
   */
  static async queryHistory(options: HistoryQueryOptions = {}): Promise<EventChangeLog[]> {
    if (!storageManager) {
      historyLogger.error('❌ StorageManager 未初始化');
      return [];
    }

    try {
      const logs = await storageManager.queryEventHistory({
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
    const EventService = (window as any).EventService;
    const allCurrentEvents = EventService?.getAllEvents() || [];
    const existingEvents = new Set<string>(allCurrentEvents.map((e: any) => e.id));
    
    console.log('[EventHistoryService] 📊 getExistingEventsAtTime 步骤1:', {
      timestamp,
      targetTime: targetTime.toISOString(),
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
    
    // missed: 过期未完成的事件（这个需要结合当前时间和事件的 endTime 判断）
    // TODO: 实现 missed 逻辑
    const missed: EventChangeLog[] = [];
    
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
      const stats = await this.getStatistics();
      
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

  /**
   * 清空所有历史记录（慎用！）
   */
  static clearAll(): void {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    historyLogger.warn('⚠️ 已清空所有历史记录');
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
    if (!storageManager) {
      historyLogger.error('❌ StorageManager 未初始化');
      return;
    }

    try {
      await storageManager.createEventHistory({
        id: log.id,
        eventId: log.eventId,
        operation: log.operation,
        timestamp: log.timestamp,
        source: log.source,
        before: log.before,
        after: log.after,
        changes: log.changes,
        userId: log.userId,
        metadata: log.metadata
      });
    } catch (error) {
      historyLogger.error('❌ saveLogToStorage 失败:', error);
      throw error;
    }
  }

  /**
   * 自动清理历史记录（保留策略）
   */
  static async autoCleanup(): Promise<number> {
    if (!storageManager) {
      historyLogger.error('❌ StorageManager 未初始化');
      return 0;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_RETENTION_DAYS);
      
      const deleted = await storageManager.cleanupEventHistory(
        formatTimeForStorage(cutoffDate)
      );

      historyLogger.log(`✅ 清理完成: 删除 ${deleted} 条过期记录（保留 ${DEFAULT_RETENTION_DAYS} 天）`);
      return deleted;
    } catch (error) {
      historyLogger.error('❌ 清理失败:', error);
      return 0;
    }
  }

  /**
   * 获取历史统计信息
   */
  static async getStatistics(): Promise<{
    total: number;
    byOperation: Record<string, number>;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  } | null> {
    if (!storageManager) {
      // Silent return during initialization phase
      return null;
    }

    try {
      return await storageManager.getEventHistoryStats();
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
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    // 忽略的字段（自动更新的元数据）
    const ignoredFields = new Set([
      'updatedAt', 
      'localVersion', 
      'lastLocalChange', 
      'lastSyncTime',
      'position'  // ✅ position 只是排序字段，不应触发历史记录
    ]);

    allKeys.forEach(key => {
      if (ignoredFields.has(key)) return;

      const oldValue = (before as any)[key];
      const newValue = (after as any)[key];

      // 深度比较（处理数组和对象）
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
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
}
