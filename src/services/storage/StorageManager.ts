/**
 * StorageManager - 统一存储管理器
 * 
 * 核心职责：
 * - 协调三层存储架构（IndexedDB + SQLite + Cloud）
 * - 实现双写策略（同步写入 IndexedDB 和 SQLite）
 * - 提供统一的 CRUD 接口
 * - 管理 LRU 内存缓存（50 MB）
 * 
 * @version 1.0.0
 * @date 2025-12-01
 */

import type { 
  StorageEvent, 
  Contact, 
  Tag, 
  Attachment,
  SyncQueueItem,
  QueryOptions, 
  QueryResult,
  BatchResult,
  StorageStats,
  EventStats
} from './types';

import { SyncStatus } from './types';
import { formatTimeForStorage } from '../../utils/timeUtils';

import StorageManagerVersionExt from './StorageManagerVersionExt';
import type { EventLog } from '../../types';

/**
 * LRU 缓存实现（简化版）
 */
class LRUCache<T> {
  private cache: Map<string, { value: T; timestamp: number }>;
  private maxSize: number;
  private currentSize: number;

  constructor(maxSizeMB: number = 50) {
    this.cache = new Map();
    this.maxSize = maxSizeMB * 1024 * 1024; // 转换为字节
    this.currentSize = 0;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry) {
      // 更新时间戳（LRU 策略）
      entry.timestamp = Date.now();
      return entry.value;
    }
    return null;
  }

  set(key: string, value: T): void {
    const size = this.estimateSize(value);
    
    // 如果缓存满了，移除最老的项
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    this.cache.set(key, { value, timestamp: Date.now() });
    this.currentSize += size;
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= this.estimateSize(entry.value);
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  getStats() {
    return {
      size: this.currentSize,
      count: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0 // TODO: 实现命中率统计
    };
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private estimateSize(value: any): number {
    // 简化的大小估算（JSON 字符串长度 * 2 bytes per char）
    return JSON.stringify(value).length * 2;
  }
}

/**
 * StorageManager 主类
 */
export class StorageManager {
  private static instance: StorageManager | null = null;
  
  // 存储服务（懒加载）
  private indexedDBService: any = null;
  private sqliteService: any = null;
  private fileSystemService: any = null;
  
  // LRU 缓存 (🎯 Issue #001: 暴露给测试验证)
  private eventCache: LRUCache<StorageEvent>;
  private contactCache: LRUCache<Contact>;
  private tagCache: LRUCache<Tag>;
  
  // 缓存访问器（用于测试验证）
  public get cache() {
    return this.eventCache;
  }
  
  // 初始化状态
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;

  private constructor() {
    this.eventCache = new LRUCache<StorageEvent>(30); // 30 MB for events
    this.contactCache = new LRUCache<Contact>(10); // 10 MB for contacts
    this.tagCache = new LRUCache<Tag>(10); // 10 MB for tags
  }

  /**
   * 获取单例实例
   */
  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * 初始化存储服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[StorageManager] Already initialized');
      return;
    }

    // 如果正在初始化，返回现有的Promise
    if (this.initializingPromise) {
      console.log('[StorageManager] Initialization in progress, waiting...');
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      console.log('[StorageManager] Initializing storage services...');

    try {
      // 动态导入存储服务（避免循环依赖）
      const { indexedDBService } = await import('./IndexedDBService');
      // const { fileSystemService } = await import('./FileSystemService');
      
      this.indexedDBService = indexedDBService;
      // this.fileSystemService = fileSystemService;
      
      // 初始化 IndexedDB（浏览器环境必需）
      await this.indexedDBService.initialize();
      console.log('[StorageManager] ✅ IndexedDB initialized');
      
      // 初始化 SQLite（仅在 Electron 环境）
      // ⚠️ 注意：在 Web 环境中不导入 SQLiteService，因为 better-sqlite3 是 Node.js 原生模块
      const hasElectronAPI = typeof window !== 'undefined' && (window as any).electronAPI;
      console.log('[StorageManager] 🔍 Electron check:', {
        hasWindow: typeof window !== 'undefined',
        hasElectronAPI,
        electronAPIKeys: hasElectronAPI ? Object.keys((window as any).electronAPI) : []
      });
      
      if (hasElectronAPI) {
        try {
          console.log('[StorageManager] 🔄 Loading SQLiteService...');
          const { sqliteService } = await import(/* @vite-ignore */ './SQLiteService');
          this.sqliteService = sqliteService;
          console.log('[StorageManager] 🔄 Initializing SQLite...');
          await this.sqliteService.initialize();
          console.log('[StorageManager] ✅ SQLite enabled (Electron) - queries will be 5-10x faster!');
        } catch (error) {
          console.error('[StorageManager] ❌ SQLite initialization failed:', error);
          this.sqliteService = null;
        }
      } else {
        console.log('[StorageManager] ℹ️  SQLite skipped (not in Electron environment)');
        this.sqliteService = null;
      }

      this.initialized = true;
      console.log('[StorageManager] ✅ Initialization complete');
      } catch (error) {
        console.error('[StorageManager] ❌ Initialization failed:', error);
        this.initializingPromise = null;
        throw error;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 查询事件（智能分层查询 + LRU 缓存优化）
   * 
   * 策略：
   * - 🎯 优先从 LRU 缓存读取（单 ID 查询）
   * - 降级到 SQLite/IndexedDB 查询
   * - 结果自动缓存到内存
   */
  async queryEvents(options: QueryOptions = {}): Promise<QueryResult<StorageEvent>> {
    const perfStart = performance.now();
    await this.ensureInitialized();
    const initDuration = performance.now() - perfStart;

    try {
      // 🎯 优化 #1: 单 ID 查询时先检查缓存
      if (options.filters?.eventIds && options.filters.eventIds.length === 1) {
        const eventId = options.filters.eventIds[0];
        const cached = this.eventCache.get(eventId);
        
        if (cached) {
          return {
            items: [cached],
            total: 1,
            hasMore: false,
            offset: 0
          };
        }
      }

      // 1. 优先使用 SQLite（如果可用）- 性能更好，支持复杂查询
      if (this.sqliteService) {
        const queryStart = performance.now();
        const result = await this.sqliteService.queryEvents(options);
        const queryDuration = performance.now() - queryStart;
        
        // 将查询结果缓存到内存（批量，无逐个日志）
        result.items.forEach((event: StorageEvent) => {
          this.eventCache.set(event.id, event);
        });
        
        // Only log slow queries (>500ms) or large result sets (>100 events)
        if (queryDuration > 500 || result.items.length > 100) {
          console.log(`[StorageManager] ✅ Query complete (SQLite): ${result.items.length} events in ${queryDuration.toFixed(1)}ms (init: ${initDuration.toFixed(1)}ms)`);
        }
        return result;
      }

      // 2. 降级到 IndexedDB（Web 环境）
      if (this.indexedDBService) {
        const queryStart = performance.now();
        const result = await this.indexedDBService.queryEvents(options);
        const queryDuration = performance.now() - queryStart;
        
        // 缓存结果（批量，无逐个日志）
        result.items.forEach((event: StorageEvent) => {
          this.eventCache.set(event.id, event);
        });
        
        // ✨ 只记录非常慢的查询（>1000ms）以减少噪音
        if (queryDuration > 1000) {
          console.log(`[StorageManager] ⚠️ Very slow query: ${result.items.length} events in ${queryDuration.toFixed(1)}ms (init: ${initDuration.toFixed(1)}ms)`);
        }
        return result;
      }

      // 3. 如果都不可用，返回空结果
      console.warn('[StorageManager] ⚠️  No storage service available, returning empty result');
      return {
        items: [],
        total: 0,
        hasMore: false,
        offset: 0
      };
    } catch (error) {
      console.error('[StorageManager] ❌ Query failed:', error);
      throw error;
    }
  }

  /**
   * 🚀 获取单个事件（通过 ID）
   * 优先从缓存读取，缓存未命中时从 IndexedDB 读取（不走全表扫描）
   */
  async getEvent(id: string): Promise<StorageEvent | null> {
    await this.ensureInitialized();

    // 1. 检查缓存
    const cached = this.eventCache.get(id);
    if (cached) {
      return cached;
    }

    // 2. 从 IndexedDB 直接获取（通过主键，不是全表扫描）
    if (this.indexedDBService) {
      const event = await this.indexedDBService.getEvent(id);
      if (event && !event.deletedAt) {
        // 缓存结果
        this.eventCache.set(id, event);
        return event;
      }
    }

    // 3. 降级到 SQLite（如果可用）
    if (this.sqliteService) {
      const result = await this.sqliteService.queryEvents({
        filters: { eventIds: [id] },
        limit: 1
      });
      if (result.items.length > 0) {
        const event = result.items[0];
        this.eventCache.set(id, event);
        return event;
      }
    }

    return null;
  }

  /**
   * 创建事件（双写：IndexedDB + SQLite）
   */
  async createEvent(event: StorageEvent): Promise<StorageEvent> {
    await this.ensureInitialized();

    console.log('[StorageManager] Creating event:', event.id);

    try {
      // 双写策略：同步写入 IndexedDB 和 SQLite
      await this.indexedDBService.createEvent(event);
      
      if (this.sqliteService) {
        await this.sqliteService.createEvent(event);
      }
      
      // 🚀 [CACHE FIX] 创建后立即缓存，避免后续 getEvent 缓存未命中
      this.eventCache.set(event.id, event);
      
      console.log('[StorageManager] ✅ Event created:', event.id);
      return event;
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to create event:', error);
      throw error;
    }
  }

  /**
   * 更新事件（双写：IndexedDB + SQLite）
   */
  async updateEvent(id: string, updates: Partial<StorageEvent>): Promise<StorageEvent> {
    await this.ensureInitialized();

    // 🔍 调试：验证 syncMode 是否传递到 StorageManager
    console.log('🔍 [StorageManager] updateEvent 接收到的 updates:', {
      eventId: id.slice(-8),
      'updates.syncMode': updates.syncMode,
      'updates.calendarIds': updates.calendarIds,
      'syncMode 类型': typeof updates.syncMode,
      'calendarIds 类型': Array.isArray(updates.calendarIds) ? 'array' : typeof updates.calendarIds,
    });

    try {
      // 1. 双写到 IndexedDB 和 SQLite
      if (this.indexedDBService) {
        await this.indexedDBService.updateEvent(id, updates);
      }
      
      if (this.sqliteService) {
        await this.sqliteService.updateEvent(id, updates);
      }

      // 2. 🚀 [CACHE FIX] 获取最新数据并更新缓存
      // 必须从数据库重新读取，确保拿到完整的最新数据
      const updatedEvent = await this.indexedDBService.getEvent(id);
      if (!updatedEvent) {
        throw new Error(`Event not found: ${id}`);
      }

      // 3. 强制更新缓存（无论之前是否存在）
      // 这确保后续的 getEvent(id) 能拿到最新的数据
      this.eventCache.set(id, updatedEvent);

      return updatedEvent;
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to update event:', error);
      throw error;
    }
  }

  /**
   * 🔒 批量更新事件（事务性）- Phase 3优化
   * 
   * 使用IndexedDB的批量写入事务，提供原子性保证
   * 
   * @param events - 完整的事件对象数组
   */
  async batchUpdateEvents(events: StorageEvent[]): Promise<void> {
    await this.ensureInitialized();

    console.log('🔒 [StorageManager] 批量更新事件（事务性）:', {
      count: events.length,
      eventIds: events.map(e => e.id.slice(-8)).join(', ')
    });

    try {
      // IndexedDB批量更新（使用事务）
      if (this.indexedDBService) {
        await this.indexedDBService.batchUpdateEvents(events);
      }
      
      // SQLite批量更新（如果启用）
      if (this.sqliteService) {
        for (const event of events) {
          await this.sqliteService.updateEvent(event.id, event);
        }
      }

      // 更新缓存
      for (const event of events) {
        this.eventCache.set(event.id, event);
      }

      console.log('✅ [StorageManager] 批量更新成功:', {
        count: events.length,
        cacheSize: this.eventCache.size
      });
    } catch (error) {
      console.error('[StorageManager] ❌ 批量更新失败:', error);
      throw error;
    }
  }

  /**
   * 删除事件（软删除：设置 deletedAt 时间戳）
   * 
   * 🎯 Issue #002: 软删除策略
   * - 设置 deletedAt 字段而不是物理删除
   * - 数据可在 30 天内恢复
   * - 查询时自动过滤已删除事件（除非明确指定 includeDeleted）
   */
  async deleteEvent(id: string): Promise<void> {
    await this.ensureInitialized();

    console.log('[StorageManager] Soft deleting event:', id);

    try {
      const now = formatTimeForStorage(new Date());
      
      // 软删除：设置 deletedAt 字段
      await this.updateEvent(id, { deletedAt: now } as Partial<StorageEvent>);

      // 从缓存移除（已删除事件不应被缓存）
      this.eventCache.delete(id);

      console.log('[StorageManager] ✅ Event soft deleted:', id, 'deletedAt:', now);
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to soft delete event:', error);
      throw error;
    }
  }

  /**
   * 永久删除事件（物理删除，不可恢复）
   * 
   * ⚠️  仅在以下情况使用：
   * - 清理 30 天前的已删除事件
   * - 用户明确选择"永久删除"
   * - 数据迁移/清理任务
   */
  async hardDeleteEvent(id: string): Promise<void> {
    await this.ensureInitialized();

    console.log('[StorageManager] Hard deleting event (permanent):', id);

    try {
      // 物理删除
      await this.indexedDBService.deleteEvent(id);
      
      if (this.sqliteService) {
        await this.sqliteService.deleteEvent(id);
      }

      // 从缓存移除
      this.eventCache.delete(id);

      console.log('[StorageManager] ✅ Event permanently deleted:', id);
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to hard delete event:', error);
      throw error;
    }
  }

  /**
   * 批量硬删除事件（永久删除，不可恢复）
   * 使用单次事务，比多次调用 hardDeleteEvent 快得多
   */
  async batchHardDeleteEvents(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    await this.ensureInitialized();

    console.log(`[StorageManager] Batch hard deleting ${ids.length} events...`);

    try {
      // 批量物理删除
      await this.indexedDBService.batchDeleteEvents(ids);
      
      if (this.sqliteService) {
        // SQLite 也需要批量删除
        await Promise.all(ids.map(id => this.sqliteService!.deleteEvent(id)));
      }

      // 从缓存批量移除
      ids.forEach(id => this.eventCache.delete(id));

      console.log(`[StorageManager] ✅ Batch deleted ${ids.length} events permanently`);
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to batch hard delete events:', error);
      throw error;
    }
  }

  /**
   * 恢复已删除的事件
   * 
   * 将 deletedAt 设置为 null，使事件重新可见
   */
  async restoreEvent(id: string): Promise<StorageEvent> {
    await this.ensureInitialized();

    console.log('[StorageManager] Restoring event:', id);

    try {
      // 移除 deletedAt 字段
      const restored = await this.updateEvent(id, { deletedAt: null } as Partial<StorageEvent>);
      
      console.log('[StorageManager] ✅ Event restored:', id);
      return restored;
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to restore event:', error);
      throw error;
    }
  }

  /**
   * 批量操作
   */
  async batchCreateEvents(events: StorageEvent[]): Promise<BatchResult<StorageEvent>> {
    await this.ensureInitialized();

    console.log('[StorageManager] Batch creating events:', events.length);

    const success: StorageEvent[] = [];
    const failed: Array<{ item: StorageEvent; error: Error }> = [];

    for (const event of events) {
      try {
        await this.createEvent(event);
        success.push(event);
      } catch (error) {
        failed.push({ item: event, error: error as Error });
      }
    }

    console.log('[StorageManager] Batch create complete:', { success: success.length, failed: failed.length });
    return { success, failed };
  }

  /**
   * 全文搜索（使用 SQLite FTS5）
   * 
   * 策略：
   * - Electron 环境：使用 SQLite FTS5 全文索引（高性能）
   * - Web 环境：降级到 IndexedDB 前端过滤（性能较低）
   */
  async search(query: string, options: { limit?: number; offset?: number } = {}): Promise<QueryResult<StorageEvent>> {
    await this.ensureInitialized();

    if (!query || query.trim().length === 0) {
      return { items: [], total: 0, hasMore: false };
    }

    console.log('[StorageManager] Searching:', query);

    try {
      // 1. 优先使用 SQLite FTS5（如果可用）
      if (this.sqliteService) {
        const result = await this.sqliteService.searchEvents(query, options);
        
        // 缓存搜索结果
        result.items.forEach((event: StorageEvent) => {
          this.eventCache.set(event.id, event);
        });
        
        console.log('[StorageManager] ✅ Search complete (FTS5):', result.items.length, 'events');
        return result;
      }

      // 2. 降级到 IndexedDB 前端过滤
      const allEvents = await this.indexedDBService.queryEvents({ limit: 1000 });
      const searchLower = query.toLowerCase();
      
      const filtered = allEvents.items.filter((event: StorageEvent) => {
        const titleText = typeof event.title === 'string' ? event.title : event.title?.simpleTitle || '';
        return (
          titleText.toLowerCase().includes(searchLower) ||
          event.description?.toLowerCase().includes(searchLower) ||
          event.location?.toLowerCase().includes(searchLower)
        );
      });

      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const items = filtered.slice(offset, offset + limit);

      console.log('[StorageManager] ✅ Search complete (IndexedDB):', items.length, 'events');
      return {
        items,
        total: filtered.length,
        hasMore: offset + limit < filtered.length
      };
    } catch (error) {
      console.error('[StorageManager] ❌ Search failed:', error);
      throw error;
    }
  }

  /**
   * 获取存储统计信息（聚合所有存储层）
   */
  async getStats(): Promise<StorageStats> {
    await this.ensureInitialized();

    console.log('[StorageManager] Collecting storage statistics...');

    try {
      // 1. 收集 IndexedDB 统计信息
      const indexedDBStats = await this.indexedDBService.getStorageStats();

      // 2. 收集 SQLite 统计信息（如果可用）
      let sqliteStats = undefined;
      if (this.sqliteService) {
        sqliteStats = await this.sqliteService.getStorageStats();
      }

      // 3. 收集缓存统计信息
      const cacheStats = {
        events: this.eventCache.getStats(),
        contacts: this.contactCache.getStats(),
        tags: this.tagCache.getStats()
      };

      // 4. 聚合统计信息
      const stats: StorageStats = {
        indexedDB: indexedDBStats.indexedDB,
        sqlite: sqliteStats?.sqlite,
        cache: {
          size: cacheStats.events.size + cacheStats.contacts.size + cacheStats.tags.size,
          count: cacheStats.events.count + cacheStats.contacts.count + cacheStats.tags.count,
          maxSize: cacheStats.events.maxSize + cacheStats.contacts.maxSize + cacheStats.tags.maxSize,
          hitRate: 0, // TODO: 实现命中率追踪
          breakdown: cacheStats
        }
      };

      console.log('[StorageManager] ✅ Statistics collected:', {
        indexedDB: stats.indexedDB?.eventsCount || 0,
        sqlite: stats.sqlite?.eventsCount || 0,
        cache: stats.cache?.count || 0
      });

      return stats;
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to collect stats:', error);
      throw error;
    }
  }

  // ==================== EventLog Version History ====================

  /**
   * 保存 EventLog 版本历史
   */
  async saveEventLogVersion(
    eventId: string,
    eventLog: EventLog,
    previousEventLog?: EventLog
  ): Promise<void> {
    await this.ensureInitialized();
    
    return StorageManagerVersionExt.saveEventLogVersion(
      this.sqliteService || null,
      eventId,
      eventLog,
      previousEventLog
    );
  }

  /**
   * 获取 EventLog 历史版本列表
   */
  async getEventLogVersions(
    eventId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Array<{
    version: number;
    createdAt: string;
    deltaSize: number;
    originalSize: number;
    compressionRatio: number;
  }>> {
    await this.ensureInitialized();
    
    return StorageManagerVersionExt.getEventLogVersions(
      this.sqliteService || null,
      eventId,
      options
    );
  }

  /**
   * 恢复 EventLog 到指定版本
   */
  async restoreEventLogVersion(
    eventId: string,
    version: number
  ): Promise<EventLog> {
    await this.ensureInitialized();
    
    return StorageManagerVersionExt.restoreEventLogVersion(
      this.sqliteService || null,
      eventId,
      version
    );
  }

  /**
   * 获取版本统计信息
   */
  async getVersionStats(
    eventId: string
  ): Promise<{
    totalVersions: number;
    totalSize: number;
    averageCompressionRatio: number;
    latestVersion: number;
  }> {
    await this.ensureInitialized();
    
    return StorageManagerVersionExt.getVersionStats(
      this.sqliteService || null,
      eventId
    );
  }

  /**
   * 清理旧版本（保留最近 N 个）
   */
  async pruneOldVersions(
    eventId: string,
    keepCount: number = 50
  ): Promise<number> {
    await this.ensureInitialized();
    
    return StorageManagerVersionExt.pruneOldVersions(
      this.sqliteService || null,
      eventId,
      keepCount
    );
  }

  /**
   * FTS5 全文搜索（覆盖原有的 search 方法，支持 EventLog 搜索）
   */
  async searchEventLogs(
    query: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<QueryResult<StorageEvent>> {
    await this.ensureInitialized();
    
    return StorageManagerVersionExt.searchEventLogs(
      this.sqliteService || null,
      this.indexedDBService,
      query,
      options
    );
  }

  // ==================== Tag 管理方法 ====================

  /**
   * 创建标签
   */
  async createTag(tag: import('./types').StorageTag): Promise<import('./types').StorageTag> {
    await this.ensureInitialized();

    // 优先使用 SQLite，降级到 IndexedDB
    if (this.sqliteService) {
      await this.sqliteService.createTag(tag);
    } else if (this.indexedDBService) {
      // 🔧 浏览器环境降级：使用 IndexedDB
      await this.indexedDBService.createTag(tag);
    }

    // 写入缓存
    this.tagCache.set(tag.id, tag as any);

    return tag;
  }

  /**
   * 更新标签
   */
  async updateTag(id: string, updates: Partial<import('./types').StorageTag>): Promise<import('./types').StorageTag> {
    await this.ensureInitialized();
    console.log('[StorageManager] Updating tag:', id);

    // 优先使用 SQLite，降级到 IndexedDB
    if (this.sqliteService) {
      await this.sqliteService.updateTag(id, updates);
    } else if (this.indexedDBService) {
      // 🔧 浏览器环境降级：使用 IndexedDB
      await this.indexedDBService.updateTag(id, updates);
    }

    // 更新缓存
    const cachedTag = this.tagCache.get(id);
    if (cachedTag) {
      const updatedTag = { ...cachedTag, ...updates };
      this.tagCache.set(id, updatedTag);
    }

    // 返回更新后的标签
    return await this.getTag(id);
  }

  /**
   * 删除标签（软删除）
   */
  async deleteTag(id: string): Promise<void> {
    await this.ensureInitialized();
    console.log('[StorageManager] Soft-deleting tag:', id);

    // 🔧 [TIMESPEC] 使用 TimeSpec 格式 (YYYY-MM-DD HH:mm:ss)
    const now = formatTimeForStorage(new Date());

    // 软删除：设置 deletedAt
    await this.updateTag(id, {
      deletedAt: now,
      updatedAt: now,
    });

    // 从缓存中移除
    this.tagCache.delete(id);

    console.log('[StorageManager] ✅ Tag soft-deleted:', id);
  }

  /**
   * 硬删除标签（永久删除）
   */
  async hardDeleteTag(id: string): Promise<void> {
    await this.ensureInitialized();
    console.warn('[StorageManager] Hard-deleting tag (permanent):', id);

    if (this.sqliteService) {
      await this.sqliteService.hardDeleteTag(id);
    } else if (this.indexedDBService) {
      // 🔧 浏览器环境降级：使用 IndexedDB
      await this.indexedDBService.hardDeleteTag(id);
    }

    this.tagCache.delete(id);

    console.log('[StorageManager] ✅ Tag permanently deleted:', id);
  }

  /**
   * 获取单个标签
   */
  async getTag(id: string): Promise<import('./types').StorageTag> {
    await this.ensureInitialized();

    // 1. 检查缓存
    const cached = this.tagCache.get(id);
    if (cached) {
      return cached as any;
    }

    // 2. 优先从 SQLite 查询，降级到 IndexedDB
    if (this.sqliteService) {
      const tag = await this.sqliteService.getTag(id);
      if (tag) {
        this.tagCache.set(id, tag as any);
        return tag;
      }
    } else if (this.indexedDBService) {
      // 🔧 浏览器环境降级：使用 IndexedDB
      const tag = await this.indexedDBService.getTag(id);
      if (tag) {
        this.tagCache.set(id, tag as any);
        return tag;
      }
    }

    throw new Error(`Tag not found: ${id}`);
  }

  /**
   * 查询标签
   */
  async queryTags(options: QueryOptions = {}): Promise<QueryResult<import('./types').StorageTag>> {
    await this.ensureInitialized();

    // 优先使用 SQLite，降级到 IndexedDB
    if (this.sqliteService) {
      const result = await this.sqliteService.queryTags(options);
      
      // 写入缓存
      result.items.forEach(tag => this.tagCache.set(tag.id, tag as any));
      
      return result;
    } else if (this.indexedDBService) {
      // 🔧 浏览器环境降级：使用 IndexedDB
      const tags = await this.indexedDBService.getTags();
      
      // 写入缓存
      tags.forEach(tag => this.tagCache.set(tag.id, tag as any));
      
      return {
        items: tags,
        total: tags.length,
        hasMore: false,
      };
    }

    // 最终降级：返回空结果
    return {
      items: [],
      total: 0,
      hasMore: false,
    };
  }

  /**
   * 批量创建标签
   */
  async batchCreateTags(tags: import('./types').StorageTag[]): Promise<BatchResult<import('./types').StorageTag>> {
    await this.ensureInitialized();

    const success: import('./types').StorageTag[] = [];
    const failed: Array<{ item: import('./types').StorageTag; error: Error }> = [];

    for (const tag of tags) {
      try {
        const created = await this.createTag(tag);
        success.push(created);
      } catch (error) {
        failed.push({ item: tag, error: error as Error });
      }
    }

    return { success, failed };
  }

  // ==================== Contact 操作 ====================

  /**
   * 查询联系人（智能分层查询）
   * 
   * 策略：
   * - 优先从 SQLite 查询（Electron 环境，支持复杂查询）
   * - 降级到 IndexedDB（Web 环境）
   * - 结果自动缓存到内存
   */
  async queryContacts(options: QueryOptions = {}): Promise<QueryResult<Contact>> {
    await this.ensureInitialized();

    console.log('[StorageManager] Querying contacts:', options);

    try {
      // 1. 优先使用 SQLite
      if (this.sqliteService) {
        const result = await this.sqliteService.queryContacts(options);
        
        // 缓存结果
        result.items.forEach((contact: Contact) => {
          this.contactCache.set(contact.id, contact);
        });
        
        console.log('[StorageManager] ✅ Query complete (SQLite):', result.items.length, 'contacts');
        return result;
      }

      // 2. 降级到 IndexedDB
      if (this.indexedDBService) {
        const result = await this.indexedDBService.queryContacts(options);
        
        result.items.forEach((contact: Contact) => {
          this.contactCache.set(contact.id, contact);
        });
        
        console.log('[StorageManager] ✅ Query complete (IndexedDB):', result.items.length, 'contacts');
        return result;
      }

      // 3. 都不可用，返回空结果
      console.warn('[StorageManager] ⚠️  No storage service available');
      return { items: [], total: 0, hasMore: false };
    } catch (error) {
      console.error('[StorageManager] ❌ Query contacts failed:', error);
      return { items: [], total: 0, hasMore: false };
    }
  }

  /**
   * 创建联系人（双写：IndexedDB + SQLite）
   */
  async createContact(contact: Contact): Promise<void> {
    await this.ensureInitialized();

    console.log('[StorageManager] Creating contact:', contact.id);

    const errors: any[] = [];

    try {
      // 1. 写入 IndexedDB
      if (this.indexedDBService) {
        try {
          await this.indexedDBService.createContact(contact);
          console.log('[StorageManager] ✅ Contact created in IndexedDB');
        } catch (error) {
          console.error('[StorageManager] ❌ IndexedDB write failed:', error);
          errors.push({ service: 'IndexedDB', error });
        }
      }

      // 2. 写入 SQLite（如果可用）
      if (this.sqliteService) {
        try {
          await this.sqliteService.createContact(contact);
          console.log('[StorageManager] ✅ Contact created in SQLite');
        } catch (error) {
          console.error('[StorageManager] ❌ SQLite write failed:', error);
          errors.push({ service: 'SQLite', error });
        }
      }

      // 3. 更新缓存
      this.contactCache.set(contact.id, contact);

      // 如果所有存储都失败，抛出错误
      if (errors.length > 0 && errors.length === 2) {
        throw new Error(`All storage services failed: ${JSON.stringify(errors)}`);
      }
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to create contact:', error);
      throw error;
    }
  }

  /**
   * 更新联系人（双写：IndexedDB + SQLite）
   */
  async updateContact(contact: Contact): Promise<void> {
    await this.ensureInitialized();

    console.log('[StorageManager] Updating contact:', contact.id);

    const errors: any[] = [];

    try {
      // 1. 更新 IndexedDB
      if (this.indexedDBService) {
        try {
          await this.indexedDBService.updateContact(contact);
          console.log('[StorageManager] ✅ Contact updated in IndexedDB');
        } catch (error) {
          console.error('[StorageManager] ❌ IndexedDB update failed:', error);
          errors.push({ service: 'IndexedDB', error });
        }
      }

      // 2. 更新 SQLite
      if (this.sqliteService) {
        try {
          await this.sqliteService.updateContact(contact);
          console.log('[StorageManager] ✅ Contact updated in SQLite');
        } catch (error) {
          console.error('[StorageManager] ❌ SQLite update failed:', error);
          errors.push({ service: 'SQLite', error });
        }
      }

      // 3. 更新缓存
      this.contactCache.set(contact.id, contact);

      if (errors.length > 0 && errors.length === 2) {
        throw new Error(`All storage services failed: ${JSON.stringify(errors)}`);
      }
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to update contact:', error);
      throw error;
    }
  }

  /**
   * 删除联系人（软删除）
   */
  async deleteContact(id: string): Promise<void> {
    await this.ensureInitialized();

    console.log('[StorageManager] Soft-deleting contact:', id);

    try {
      // 获取现有联系人
      const result = await this.queryContacts({
        filters: { contactIds: [id] },
        limit: 1
      });

      if (result.items.length === 0) {
        throw new Error(`Contact not found: ${id}`);
      }

      const contact = result.items[0];
      // 🔧 [TIMESPEC] 使用 TimeSpec 格式
      const now = formatTimeForStorage(new Date());
      const deletedContact = {
        ...contact,
        deletedAt: now,
        updatedAt: now
      };

      // 标记为已删除（双写）
      await this.updateContact(deletedContact);

      // 从缓存移除
      this.contactCache.delete(id);

      console.log('[StorageManager] ✅ Contact soft-deleted');
    } catch (error) {
      console.error('[StorageManager] ❌ Failed to delete contact:', error);
      throw error;
    }
  }

  /**
   * 批量创建联系人
   */
  async batchCreateContacts(contacts: Contact[]): Promise<{ successful: number; failed: number }> {
    await this.ensureInitialized();

    console.log('[StorageManager] Batch creating contacts:', contacts.length);

    let successful = 0;
    let failed = 0;

    for (const contact of contacts) {
      try {
        await this.createContact(contact);
        successful++;
      } catch (error) {
        console.error('[StorageManager] Failed to create contact:', contact.id, error);
        failed++;
      }
    }

    console.log('[StorageManager] ✅ Batch create complete:', { successful, failed });
    return { successful, failed };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.eventCache.clear();
    this.contactCache.clear();
    this.tagCache.clear();
    console.log('[StorageManager] Cache cleared');
  }

  // ==================== Event History Methods ====================

  /**
   * 创建事件历史记录
   */
  async createEventHistory(log: {
    id: string;
    eventId: string;
    operation: 'create' | 'update' | 'delete' | 'checkin' | 'uncheck';
    timestamp: string;
    source: string;
    before?: any;
    after?: any;
    changes?: any;
    userId?: string;
    metadata?: any;
  }): Promise<void> {
    await this.ensureInitialized();

    // 优先使用 IndexedDB（Web + Electron 通用）
    await this.indexedDBService.createEventHistory(log);

    // SQLite 作为备份层（仅 Electron）
    if (this.sqliteService) {
      try {
        await this.sqliteService.createEventHistory(log);
      } catch (error) {
        console.warn('[StorageManager] SQLite backup failed:', error);
      }
    }
  }

  /**
   * 创建或更新事件历史记录（幂等操作，用于迁移）
   */
  async createOrUpdateEventHistory(log: {
    id: string;
    eventId: string;
    operation: 'create' | 'update' | 'delete' | 'checkin' | 'uncheck';
    timestamp: string;
    source: string;
    before?: any;
    after?: any;
    changes?: any;
    userId?: string;
    metadata?: any;
  }): Promise<void> {
    await this.ensureInitialized();

    // 优先使用 IndexedDB（Web + Electron 通用）
    await this.indexedDBService.createOrUpdateEventHistory(log);

    // SQLite 作为备份层（仅 Electron）
    if (this.sqliteService) {
      try {
        // SQLite 也需要幂等操作
        await this.sqliteService.createEventHistory(log);
      } catch (error) {
        console.warn('[StorageManager] SQLite backup failed (ignored):', error);
      }
    }
  }

  /**
   * 查询事件历史记录
   */
  async queryEventHistory(options: {
    eventIds?: string[];
    operations?: string[];
    startTime?: string;
    endTime?: string;
    source?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    await this.ensureInitialized();

    // 优先从 IndexedDB 查询（Web + Electron 通用）
    return await this.indexedDBService.queryEventHistory(options);
  }

  /**
   * 删除单条事件历史记录
   */
  async deleteEventHistory(id: string): Promise<void> {
    await this.ensureInitialized();

    // 从 IndexedDB 删除
    await this.indexedDBService.deleteEventHistory(id);

    // 同步删除 SQLite（如果可用）
    if (this.sqliteService) {
      try {
        await this.sqliteService.deleteEventHistory(id);
      } catch (error) {
        console.warn('[StorageManager] SQLite deleteEventHistory failed:', error);
      }
    }
  }

  /**
   * 清理旧的事件历史记录
   */
  async cleanupEventHistory(olderThan: string): Promise<number> {
    await this.ensureInitialized();

    // 从 IndexedDB 清理
    const deleted = await this.indexedDBService.cleanupEventHistory(olderThan);

    // 同步清理 SQLite（如果可用）
    if (this.sqliteService) {
      try {
        await this.sqliteService.cleanupEventHistory(olderThan);
      } catch (error) {
        console.warn('[StorageManager] SQLite cleanup failed:', error);
      }
    }

    return deleted;
  }

  /**
   * 获取事件历史统计信息
   */
  async getEventHistoryStats(): Promise<{
    total: number;
    byOperation: Record<string, number>;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  }> {
    await this.ensureInitialized();

    // 从 IndexedDB 获取统计
    return await this.indexedDBService.getEventHistoryStats();
  }

  // ==================== Sync Queue 管理方法 ====================

  /**
   * 获取所有同步队列项
   */
  async getSyncQueue(): Promise<SyncQueueItem[]> {
    await this.ensureInitialized();
    return await this.indexedDBService.getSyncQueue();
  }

  /**
   * 创建同步队列项
   */
  async createSyncAction(item: SyncQueueItem): Promise<void> {
    await this.ensureInitialized();
    console.log('[StorageManager] Creating sync action:', item.id);
    await this.indexedDBService.addToSyncQueue(item);
  }

  /**
   * 批量创建同步队列项
   */
  async createSyncActions(items: SyncQueueItem[]): Promise<void> {
    await this.ensureInitialized();
    // Only log large batches to reduce noise
    if (items.length > 100) {
      console.log('[StorageManager] Creating sync actions:', items.length);
    }
    for (const item of items) {
      await this.indexedDBService.addToSyncQueue(item);
    }
  }

  /**
   * 查询同步队列项
   */
  async querySyncActions(filter?: {
    status?: SyncQueueItem['status'];
    entityType?: 'event' | 'contact' | 'tag' | 'eventlog';
    accountId?: string;
  }): Promise<SyncQueueItem[]> {
    await this.ensureInitialized();
    
    const allItems = await this.indexedDBService.getSyncQueue();
    
    if (!filter) {
      return allItems;
    }

    return allItems.filter(item => {
      if (filter.status && item.status !== filter.status) return false;
      if (filter.entityType && item.entityType !== filter.entityType) return false;
      if (filter.accountId && item.accountId !== filter.accountId) return false;
      return true;
    });
  }

  /**
   * 更新同步队列项
   */
  async updateSyncAction(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    await this.ensureInitialized();
    console.log('[StorageManager] Updating sync action:', id);
    
    const allItems = await this.indexedDBService.getSyncQueue();
    const item = allItems.find(i => i.id === id);
    
    if (!item) {
      throw new Error(`Sync action not found: ${id}`);
    }

    const updatedItem = {
      ...item,
      ...updates,
      updatedAt: formatTimeForStorage(new Date())
    };

    await this.indexedDBService.addToSyncQueue(updatedItem);
  }

  /**
   * 删除同步队列项
   */
  async deleteSyncAction(id: string): Promise<void> {
    await this.ensureInitialized();
    console.log('[StorageManager] Deleting sync action:', id);
    await this.indexedDBService.removeFromSyncQueue(id);
  }

  /**
   * 批量删除同步队列项
   */
  async deleteSyncActions(ids: string[]): Promise<void> {
    await this.ensureInitialized();
    console.log('[StorageManager] Deleting sync actions:', ids.length);
    for (const id of ids) {
      await this.indexedDBService.removeFromSyncQueue(id);
    }
  }

  /**
   * 清理已完成的同步队列项
   */
  async cleanupCompletedSyncActions(olderThan?: string): Promise<number> {
    await this.ensureInitialized();
    
    const allItems = await this.indexedDBService.getSyncQueue();
    // 🔧 [TIMESPEC] 使用 TimeSpec 格式
    const defaultCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cutoffDate = olderThan || formatTimeForStorage(defaultCutoff); // 7天前
    
    const itemsToDelete = allItems.filter(item => 
      item.status === SyncStatus.Synced && 
      item.updatedAt < cutoffDate
    );

    for (const item of itemsToDelete) {
      await this.indexedDBService.removeFromSyncQueue(item.id);
    }

    console.log(`[StorageManager] Cleaned up ${itemsToDelete.length} completed sync actions`);
    return itemsToDelete.length;
  }

  // ========== EventStats Methods (Performance Optimization) ==========
  
  /**
   * 创建统计记录
   */
  async createEventStats(stats: EventStats): Promise<void> {
    await this.ensureInitialized();
    await this.indexedDBService.createEventStats(stats);
  }

  /**
   * 批量创建统计记录（用于迁移）
   */
  async bulkCreateEventStats(statsList: EventStats[]): Promise<void> {
    await this.ensureInitialized();
    await this.indexedDBService.bulkCreateEventStats(statsList);
  }

  /**
   * 更新统计记录
   */
  async updateEventStats(id: string, updates: Partial<EventStats>): Promise<void> {
    await this.ensureInitialized();
    await this.indexedDBService.updateEventStats(id, updates);
  }

  /**
   * 获取单条 EventStats
   */
  async getEventStats(id: string): Promise<EventStats | null> {
    await this.ensureInitialized();
    return await this.indexedDBService.getEventStats(id);
  }

  /**
   * 获取某事件的直接子节点 stats（基于 parentEventId 索引）
   */
  async getEventStatsByParentEventId(parentEventId: string): Promise<EventStats[]> {
    await this.ensureInitialized();
    return await this.indexedDBService.getEventStatsByParentEventId(parentEventId);
  }

  /**
   * 统计直接子节点数量
   */
  async countEventStatsByParentEventId(parentEventId: string): Promise<number> {
    await this.ensureInitialized();
    return await this.indexedDBService.countEventStatsByParentEventId(parentEventId);
  }

  /**
   * 统计子树节点总数（按 rootEventId 聚合）
   */
  async countEventStatsByRootEventId(rootEventId: string): Promise<number> {
    await this.ensureInitialized();
    return await this.indexedDBService.countEventStatsByRootEventId(rootEventId);
  }

  /**
   * 批量 upsert EventStats
   */
  async bulkPutEventStats(statsList: EventStats[]): Promise<void> {
    await this.ensureInitialized();
    await this.indexedDBService.bulkPutEventStats(statsList);
  }

  /**
   * 删除统计记录
   */
  async deleteEventStats(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.indexedDBService.deleteEventStats(id);
  }

  /**
   * 查询统计记录（按时间范围）
   */
  async queryEventStats(options: {
    startDate?: string;
    endDate?: string;
  }): Promise<EventStats[]> {
    await this.ensureInitialized();
    
    // 转换 string → Date（符合 QueryOptions 接口）
    const queryOptions: QueryOptions = {
      startDate: options.startDate ? new Date(options.startDate) : undefined,
      endDate: options.endDate ? new Date(options.endDate) : undefined,
    };
    
    const result = await this.indexedDBService.queryEventStats(queryOptions);
    return result.items;
  }

  /**
   * 一次性数据迁移：将现有 Event 转换为 EventStats
   */
  async migrateToEventStats(): Promise<void> {
    await this.ensureInitialized();
    
    const migrationKey = '4dnote-stats-migrated';
    if (localStorage.getItem(migrationKey) === 'true') {
      console.log('[StorageManager] EventStats migration already completed');
      return;
    }

    console.log('[StorageManager] Starting EventStats migration...');
    const startTime = performance.now();

    // 🚀 直接从 IndexedDB 提取轻量级字段（避免读取完整 Event）
    const statsList = await this.indexedDBService.extractEventStatsFromEvents();
    console.log(`[StorageManager] Migrating ${statsList.length} events...`);

    if (statsList.length === 0) {
      console.log('[StorageManager] ⚠️ No events to migrate, skipping EventStats creation');
      localStorage.setItem(migrationKey, 'true');
      return;
    }

    // 批量插入
    console.log('[StorageManager] 🚀 Starting bulk insert...');
    await this.bulkCreateEventStats(statsList);
    console.log('[StorageManager] ✅ Bulk insert completed');

    const elapsed = performance.now() - startTime;
    console.log(`[StorageManager] ✅ EventStats migration completed in ${elapsed.toFixed(0)}ms`);
    
    // 标记迁移完成
    localStorage.setItem(migrationKey, 'true');
  }

  /**
   * 清空所有数据（仅用于测试/调试）
   */
  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    console.log('[StorageManager] Clearing all data...');
    
    await this.indexedDBService.clearAll();
    
    if (this.sqliteService) {
      await this.sqliteService.clearAll();
    }
    
    this.clearCache();
    
    console.log('[StorageManager] ✅ All data cleared');
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// 导出单例实例
export const storageManager = StorageManager.getInstance();
