/**
 * StorageManager 扩展 - EventLog 版本历史管理
 * 
 * 提供以下功能：
 * - 保存 EventLog 版本历史
 * - 查询版本列表
 * - 恢复指定版本
 * - FTS5 全文搜索
 * 
 * @version 1.0.0
 * @date 2025-12-02
 */

import type { EventLog } from '../../types';
import type { QueryResult, StorageEvent } from './types';
import { 
  generateDelta, 
  applyDelta, 
  compressFullEventLog,
  decompressFullEventLog,
  type DeltaResult 
} from '../../utils/versionDiff';
import { formatTimeForStorage } from '../../utils/timeUtils';

/**
 * 版本信息接口
 */
export interface EventLogVersion {
  id: number;
  eventId: string;
  version: number;
  deltaCompressed: string;
  deltaSize: number;
  originalSize: number;
  compressionRatio: number;
  createdAt: string;
  createdBy?: string;
  changeSummary?: string;
}

/**
 * StorageManager 类（版本历史扩展方法）
 */
export class StorageManagerVersionExt {
  /**
   * 保存 EventLog 版本历史
   * 
   * 策略：
   * - 首个版本：存储完整压缩数据
   * - 后续版本：存储增量 delta（相对于上一版本）
   * 
   * @param eventId 事件ID
   * @param eventLog 新版本 EventLog
   * @param previousEventLog 上一版本 EventLog（可选）
   */
  static async saveEventLogVersion(
    sqliteService: any,
    eventId: string,
    eventLog: EventLog,
    previousEventLog?: EventLog
  ): Promise<void> {
    if (!sqliteService) {
      // ✨ Silent skip in web environment (SQLite only available in Electron)
      return;
    }

    try {
      // 1. 获取当前版本号
      const currentVersion = await sqliteService.getLatestVersion(eventId);
      const newVersion = currentVersion + 1;

      // 2. 生成压缩数据
      let deltaResult: DeltaResult;

      if (previousEventLog && newVersion > 1) {
        // 增量存储（相对于上一版本）
        deltaResult = generateDelta(previousEventLog, eventLog);
        console.log('[StorageManager] Generated delta for version', newVersion, {
          deltaSize: deltaResult.deltaSize,
          originalSize: deltaResult.originalSize,
          compressionRatio: deltaResult.compressionRatio.toFixed(2) + '%'
        });
      } else {
        // 首个版本，存储完整数据（压缩）
        deltaResult = compressFullEventLog(eventLog);
        console.log('[StorageManager] Compressed full EventLog for version 1:', {
          deltaSize: deltaResult.deltaSize,
          originalSize: deltaResult.originalSize,
          compressionRatio: deltaResult.compressionRatio.toFixed(2) + '%'
        });
      }

      // 3. 保存到 SQLite
      await sqliteService.insertVersion({
        eventId,
        version: newVersion,
        deltaCompressed: deltaResult.delta,
        deltaSize: deltaResult.deltaSize,
        originalSize: deltaResult.originalSize,
        compressionRatio: deltaResult.compressionRatio,
        createdAt: formatTimeForStorage(new Date()),
        createdBy: 'system', // TODO: 添加用户信息
        changeSummary: newVersion === 1 ? 'Initial version' : 'Update'
      });

      console.log(`[StorageManager] ✅ Version ${newVersion} saved for event ${eventId}`);
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to save version:', error);
      throw error;
    }
  }

  /**
   * 获取 EventLog 历史版本列表
   * 
   * @param eventId 事件ID
   * @param options 查询选项
   * @returns 版本列表
   */
  static async getEventLogVersions(
    sqliteService: any,
    eventId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{
    version: number;
    createdAt: string;
    deltaSize: number;
    originalSize: number;
    compressionRatio: number;
  }>> {
    if (!sqliteService) {
      console.warn('[StorageManager] SQLite not available');
      return [];
    }

    try {
      const versions = await sqliteService.queryVersions(eventId, options);
      console.log(`[StorageManager] ✅ Retrieved ${versions.length} versions for event ${eventId}`);
      return versions;
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to get versions:', error);
      return [];
    }
  }

  /**
   * 恢复 EventLog 到指定版本
   * 
   * 策略：
   * 1. 加载版本 1（完整压缩数据）
   * 2. 依次应用版本 2~N 的 delta
   * 3. 返回恢复后的 EventLog
   * 
   * @param eventId 事件ID
   * @param version 目标版本号
   * @returns 恢复后的 EventLog
   */
  static async restoreEventLogVersion(
    sqliteService: any,
    eventId: string,
    version: number
  ): Promise<EventLog> {
    if (!sqliteService) {
      throw new Error('SQLite not available');
    }

    try {
      console.log(`[StorageManager] Restoring event ${eventId} to version ${version}...`);

      // 1. 获取版本 1（基础版本）
      const version1Data = await sqliteService.getVersion(eventId, 1);
      if (!version1Data) {
        throw new Error(`Version 1 not found for event ${eventId}`);
      }

      // 2. 解压版本 1
      let currentEventLog = decompressFullEventLog(version1Data.delta_compressed);
      console.log(`[StorageManager] Loaded base version 1`);

      // 3. 如果目标版本是 1，直接返回
      if (version === 1) {
        console.log('[StorageManager] ✅ Restored to version 1');
        return currentEventLog;
      }

      // 4. 依次应用版本 2~N 的 delta
      for (let v = 2; v <= version; v++) {
        const vData = await sqliteService.getVersion(eventId, v);
        if (!vData) {
          throw new Error(`Version ${v} not found for event ${eventId}`);
        }

        currentEventLog = applyDelta(currentEventLog, vData.delta_compressed);
        console.log(`[StorageManager] Applied delta for version ${v}`);
      }

      console.log(`[StorageManager] ✅ Restored to version ${version}`);
      return currentEventLog;
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to restore version:', error);
      throw error;
    }
  }

  /**
   * 获取版本统计信息
   * 
   * @param eventId 事件ID
   * @returns 统计信息
   */
  static async getVersionStats(
    sqliteService: any,
    eventId: string
  ): Promise<{
    totalVersions: number;
    totalSize: number;
    averageCompressionRatio: number;
    latestVersion: number;
  }> {
    if (!sqliteService) {
      return {
        totalVersions: 0,
        totalSize: 0,
        averageCompressionRatio: 0,
        latestVersion: 0
      };
    }

    try {
      const versions = await sqliteService.queryVersions(eventId, { limit: 1000 });

      if (versions.length === 0) {
        return {
          totalVersions: 0,
          totalSize: 0,
          averageCompressionRatio: 0,
          latestVersion: 0
        };
      }

      const totalSize = versions.reduce((sum: number, v: any) => sum + v.deltaSize, 0);
      const totalOriginalSize = versions.reduce((sum: number, v: any) => sum + v.originalSize, 0);
      const averageCompressionRatio = totalOriginalSize > 0
        ? ((1 - totalSize / totalOriginalSize) * 100)
        : 0;

      return {
        totalVersions: versions.length,
        totalSize,
        averageCompressionRatio,
        latestVersion: versions[0]?.version || 0
      };
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to get version stats:', error);
      throw error;
    }
  }

  /**
   * 清理旧版本（保留最近 N 个版本）
   * 
   * @param eventId 事件ID
   * @param keepCount 保留数量（默认 50）
   */
  static async pruneOldVersions(
    sqliteService: any,
    eventId: string,
    keepCount: number = 50
  ): Promise<number> {
    if (!sqliteService) {
      console.warn('[StorageManager] SQLite not available');
      return 0;
    }

    try {
      const deletedCount = await sqliteService.pruneVersions(eventId, keepCount);
      console.log(`[StorageManager] ✅ Pruned ${deletedCount} old versions for event ${eventId}`);
      return deletedCount;
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to prune versions:', error);
      throw error;
    }
  }

  /**
   * FTS5 全文搜索（搜索 EventLog 内容）
   * 
   * @param query 搜索关键词
   * @param options 查询选项
   * @returns 搜索结果
   */
  static async searchEventLogs(
    sqliteService: any,
    indexedDBService: any,
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<QueryResult<StorageEvent>> {
    if (!query || query.trim().length === 0) {
      return { items: [], total: 0, hasMore: false };
    }

    // 1. 优先使用 SQLite FTS5（如果可用）
    if (sqliteService) {
      try {
        const result = await sqliteService.searchEventLogs(query, options);
        console.log(`[StorageManager] ✅ FTS5 search complete: ${result.items.length} results`);
        return result;
      } catch (error) {
        console.error('[StorageManager] ❌ FTS5 search failed, fallback to IndexedDB:', error);
      }
    }

    // 2. 降级到 IndexedDB 前端过滤
    if (indexedDBService) {
      try {
        const allEvents = await indexedDBService.queryEvents({ limit: 1000 });
        const searchLower = query.toLowerCase();

        const filtered = allEvents.items.filter((event: StorageEvent) => {
          // 搜索 title
          const titleText = typeof event.title === 'string'
            ? event.title
            : event.title?.simpleTitle || '';
          if (titleText.toLowerCase().includes(searchLower)) return true;

          // 搜索 EventLog plainText
          if (typeof event.eventlog === 'object' && event.eventlog.plainText) {
            if (event.eventlog.plainText.toLowerCase().includes(searchLower)) return true;
          }

          // 搜索 description（兼容旧数据）
          if (event.description?.toLowerCase().includes(searchLower)) return true;

          // 搜索 location
          if (event.location?.toLowerCase().includes(searchLower)) return true;

          return false;
        });

        const limit = options?.limit || 50;
        const offset = options?.offset || 0;
        const items = filtered.slice(offset, offset + limit);

        console.log(`[StorageManager] ✅ IndexedDB fallback search complete: ${items.length} results`);
        return {
          items,
          total: filtered.length,
          hasMore: offset + limit < filtered.length
        };
      } catch (error) {
        console.error('[StorageManager] ❌ IndexedDB search failed:', error);
        throw error;
      }
    }

    // 3. 如果都不可用，返回空结果
    console.warn('[StorageManager] ⚠️  No storage service available for search');
    return { items: [], total: 0, hasMore: false };
  }
}

export default StorageManagerVersionExt;
