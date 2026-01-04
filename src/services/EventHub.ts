/**
 * EventHub - 事件状态管理中心
 * 
 * 职责：
 * 1. 维护事件的内存快照（snapshot）
 * 2. 提供增量更新 API（只更新变化的字段）
 * 3. 协调多个组件对同一事件的修改
 * 4. 发出全局事件通知
 * 5. 🕐 管理时间字段（整合 TimeHub 的功能）
 * 
 * 设计理念：
 * - 统一的事件状态管理，包括时间
 * - 组件只能通过 EventHub 修改事件
 * - 所有修改都是增量的、可追踪的
 * - TimeSpec 等时间元数据也在 EventHub 管理
 */

import { Event } from '@frontend/types';
import { EventService } from '@backend/EventService';
import { TimeHub } from '@backend/TimeHub';
import { formatTimeForStorage } from '@frontend/utils/timeUtils'; // 🔧 导入时间格式化工具

const dbg = console.log.bind(console);

interface EventSnapshot {
  event: Event;
  lastModified: number;
}

class EventHubClass {
  private cache: Map<string, EventSnapshot> = new Map();
  private subscribers: Map<string, Array<(data: any) => void>> = new Map();

  // 保持单航道：避免同一 eventId 并发冷加载造成重复 IO
  private inFlightLoads: Map<string, Promise<Event | null>> = new Map();

  private async loadSnapshotFromEventService(eventId: string): Promise<Event | null> {
    const existing = this.inFlightLoads.get(eventId);
    if (existing) return existing;

    const loadPromise = (async () => {
      const event = await EventService.getEventById(eventId);
      if (!event) return null;

      this.cache.set(eventId, {
        event: { ...event },
        lastModified: Date.now()
      });

      return { ...event };
    })();

    this.inFlightLoads.set(eventId, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.inFlightLoads.delete(eventId);
    }
  }

  private async getSnapshotOrLoad(eventId: string): Promise<Event | null> {
    return this.getSnapshot(eventId) ?? (await this.loadSnapshotFromEventService(eventId));
  }

  /**
   * 获取事件快照（异步版，缓存未命中会冷加载）
   */
  async getSnapshotAsync(eventId: string): Promise<Event | null> {
    return await this.getSnapshotOrLoad(eventId);
  }

  /**
   * 预加载事件到缓存（不关心返回值）
   */
  async prefetch(eventId: string): Promise<void> {
    await this.loadSnapshotFromEventService(eventId);
  }

  /**
   * 获取事件快照（从缓存或 EventService）
   */
  getSnapshot(eventId: string): Event | null {
    // 1. 尝试从缓存读取
    const cached = this.cache.get(eventId);
    if (cached) {
      dbg('🔍 [EventHub] 缓存命中', { eventId, age: Date.now() - cached.lastModified });
      return { ...cached.event }; // 返回副本，防止外部修改
    }

    // ⚠️ EventService.getEventById 已迁移为 async。
    // 这里保持同步语义：缓存未命中先返回 null，同时触发后台预加载。
    // 需要强一致读请使用 getSnapshotAsync。
    void this.loadSnapshotFromEventService(eventId);
    return null;
  }

  /**
   * 增量更新事件（只更新指定字段）
   * 
   * @param eventId 事件 ID
   * @param updates 要更新的字段（Partial<Event>）
   * @param options 选项
   * @returns 更新后的完整事件
   */
  async updateFields(
    eventId: string, 
    updates: Partial<Event>,
    options: { skipSync?: boolean; source?: string } = {}
  ): Promise<{ success: boolean; event?: Event; error?: string }> {
    const { skipSync = false, source = 'unknown' } = options;

    dbg('📝 [EventHub] 增量更新', { 
      eventId, 
      fields: Object.keys(updates),
      source,
      skipSync
    });
    
    // 1. 🔧 [FIX] 始终从 EventService 读取最新数据，避免缓存导致的数据不一致
    const currentEvent = await this.loadSnapshotFromEventService(eventId);
    if (!currentEvent) {
      return { success: false, error: 'Event not found' };
    }

    // 2. 合并更新（只更新指定字段）
    const updatedEvent: Event = {
      ...currentEvent,  // ✅ 使用 EventService 的最新数据
      ...updates,
      // 🔧 修复：使用 formatTimeForStorage 而不是 toISOString()
      updatedAt: formatTimeForStorage(new Date())
    };

    // 3. 记录变化（用于调试）
    const changes: string[] = [];
    const allFields: string[] = [];
    for (const key in updates) {
      if (updates.hasOwnProperty(key)) {
        const oldValue = (currentEvent as any)[key];
        const newValue = (updates as any)[key];
        allFields.push(key);
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push(`${key}: ${this.formatValue(oldValue)} → ${this.formatValue(newValue)}`);
        } else if (key === 'planSyncConfig' || key === 'actualSyncConfig') {
          // 🔍 特别记录同步配置字段（即使没有变化）
          dbg(`🔍 [EventHub] ${key} 比较:`, {
            oldValue: JSON.stringify(oldValue),
            newValue: JSON.stringify(newValue),
            相同: JSON.stringify(oldValue) === JSON.stringify(newValue)
          });
        }
      }
    }

    if (changes.length > 0) {
      dbg('🔄 [EventHub] 字段变化:', changes);
    }
    
    dbg('📋 [EventHub] 所有更新字段:', allFields);

    // 4. 更新缓存
    this.cache.set(eventId, {
      event: updatedEvent,
      lastModified: Date.now()
    });

    // 5. 持久化到 EventService
    const result = await EventService.updateEvent(eventId, updatedEvent, skipSync);

    // 6. 用持久化结果刷新缓存（如果有）
    if (result.success && result.event) {
      this.cache.set(eventId, {
        event: { ...result.event },
        lastModified: Date.now()
      });
    }

    // ✅ 不触发 notify，避免 ActionBasedSyncManager 循环依赖
    // ActionBasedSyncManager 应该通过其他方式（如拦截 EventService）感知变化

    return result;
  }

  /**
   * 批量更新多个事件（优化版本）
   * 
   * 用于 EventTreeAPI 重新父化等批量操作
   * 
   * @param updates - 更新列表 [{ eventId, updates }]
   * @param options - 选项
   * @returns 成功更新的事件数量
   * 
   * @example
   * ```typescript
   * await EventHub.batchUpdate([
   *   { eventId: 'event_1', updates: { parentEventId: 'event_parent' } },
   *   { eventId: 'event_2', updates: { bulletLevel: 2 } },
   * ]);
   * ```
   */
  async batchUpdate(
    updates: Array<{ eventId: string; updates: Partial<Event> }>,
    options: { skipSync?: boolean; source?: string } = {}
  ): Promise<{ success: boolean; updatedCount: number; errors: Array<{ eventId: string; error: string }> }> {
    const { skipSync = false, source = 'EventTreeAPI' } = options;
    
    dbg('🔄 [EventHub] 批量更新', { 
      count: updates.length,
      source,
      skipSync
    });
    
    const errors: Array<{ eventId: string; error: string }> = [];
    let updatedCount = 0;
    
    // 当前实现：顺序更新（非事务性）
    // 使用 batchUpdateTransaction() 获得原子事务保证
    for (const { eventId, updates: eventUpdates } of updates) {
      try {
        const result = await this.updateFields(eventId, eventUpdates, {
          skipSync,
          source: `${source}/batch`
        });
        
        if (result.success) {
          updatedCount++;
        } else {
          errors.push({
            eventId,
            error: result.error || 'Unknown error'
          });
        }
      } catch (error) {
        errors.push({
          eventId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    dbg('✅ [EventHub] 批量更新完成', { 
      total: updates.length,
      success: updatedCount,
      failed: errors.length
    });
    
    return {
      success: errors.length === 0,
      updatedCount,
      errors
    };
  }

  /**
   * 🔒 批量更新（事务性）- Phase 3优化
   * 
   * 提供真正的原子事务：要么全部成功，要么全部回滚
   * 
   * @param updates - 更新列表 [{ eventId, updates }]
   * @param options - 选项
   * @returns 事务结果
   * 
   * @example
   * ```typescript
   * // Tab缩进：父子关系更新必须原子化
   * const result = await EventHub.batchUpdateTransaction([
   *   { eventId: 'child_1', updates: { parentEventId: 'new_parent' } },
   * ]);
   * 
   * if (!result.success) {
   *   // 所有更新已回滚
   *   console.error('事务失败', result.error);
   * }
   * ```
   */
  async batchUpdateTransaction(
    updates: Array<{ eventId: string; updates: Partial<Event> }>,
    options: { skipSync?: boolean; source?: string } = {}
  ): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
    const { skipSync = false, source = 'EventTreeAPI/transaction' } = options;
    
    dbg('🔒 [EventHub] 事务性批量更新开始', { 
      count: updates.length,
      source,
      skipSync
    });
    
    // 备份：记录所有事件的原始状态
    const snapshots = new Map<string, Event>();
    const toUpdate: Event[] = [];
    
    try {
      // Phase 1: 收集快照 + 验证
      for (const { eventId, updates: eventUpdates } of updates) {
        const snapshot = await this.getSnapshotOrLoad(eventId);
        
        if (!snapshot) {
          throw new Error(`Event not found: ${eventId}`);
        }
        
        snapshots.set(eventId, { ...snapshot });
        
        // 应用更新到临时对象
        const updatedEvent: Event = {
          ...snapshot,
          ...eventUpdates,
          updatedAt: formatTimeForStorage(new Date())
        };
        
        toUpdate.push(updatedEvent);
      }
      
      dbg('🔍 [EventHub] Phase 1: 快照收集完成', { count: snapshots.size });
      
      // Phase 2: 批量写入数据库（原子操作）
      const writeResult = await EventService.batchUpdateEvents(toUpdate, skipSync);
      
      if (!writeResult.success) {
        throw new Error(writeResult.error || 'Database batch update failed');
      }
      
      dbg('💾 [EventHub] Phase 2: 数据库写入成功');
      
      // Phase 3: 更新缓存
      for (const event of toUpdate) {
        this.cache.set(event.id, {
          event: { ...event },
          lastModified: Date.now()
        });
      }
      
      dbg('✅ [EventHub] 事务提交成功', { 
        updatedCount: toUpdate.length
      });
      
      return {
        success: true,
        updatedCount: toUpdate.length
      };
      
    } catch (error) {
      // 回滚：恢复缓存快照
      for (const [eventId, snapshot] of snapshots) {
        this.cache.set(eventId, {
          event: { ...snapshot },
          lastModified: Date.now()
        });
      }
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ [EventHub] 事务回滚', { 
        error: errorMsg,
        rollbackCount: snapshots.size
      });
      
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * 🕐 更新时间字段（通过 TimeHub）
   * 这是一个便捷方法，内部调用 TimeHub 并同步快照
   */
  async setEventTime(
    eventId: string,
    timeInput: {
      start?: string | Date;
      end?: string | Date;
      kind?: string;
      allDay?: boolean;
      source?: string;
    },
    options: { skipSync?: boolean } = {}
  ): Promise<{ success: boolean; event?: Event; error?: string }> {
    const { skipSync = false } = options;
    dbg('🕐 [EventHub] 更新时间字段', { eventId, timeInput, skipSync });

    // 1. 调用 TimeHub 更新时间（传递 skipSync）
    const timeResult = await TimeHub.setEventTime(eventId, timeInput as any, { skipSync });
    
    if (!timeResult.success) {
      return timeResult;
    }

    // 2. 清除缓存，下次读取时会从 EventService 重新加载（包含新时间）
    this.invalidate(eventId);

    // 3. 返回更新后的事件
    const updatedEvent = await this.loadSnapshotFromEventService(eventId);
    if (!updatedEvent) {
      return { success: false, error: 'Event not found after time update' };
    }

    return { success: true, event: updatedEvent };
  }

  /**
   * 保存事件（创建或更新）
   * 自动判断是新建还是更新
   * 
   * @param eventData 事件数据
   * @returns 保存后的完整 Event 对象
   */
  async saveEvent(eventData: Event): Promise<Event> {
    dbg('💾 [EventHub] 保存事件', { id: eventData.id, title: eventData.title });

    let result;
    
    // 判断是创建还是更新
    if (eventData.id.startsWith('temp-') || eventData.id.startsWith('timer-')) {
      // 临时ID或Timer ID，需要创建
      result = await this.createEvent(eventData);
    } else {
      // 已有ID，更新现有事件
      result = await this.updateFields(eventData.id, eventData);
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to save event');
    }

    // 返回保存后的完整事件对象
    return result.event!;
  }

  /**
   * 创建新事件
   */
  async createEvent(event: Event): Promise<{ success: boolean; event?: Event; error?: string }> {
    dbg('➕ [EventHub] 创建事件', { id: event.id, title: event.title });

    // 1. 缓存快照
    this.cache.set(event.id, {
      event: { ...event },
      lastModified: Date.now()
    });

    // 2. 持久化
    const result = await EventService.createEvent(event);

    // ✅ 不触发 notify，避免 ActionBasedSyncManager 循环依赖

    return result;
  }

  /**
   * 删除事件
   */
  async deleteEvent(eventId: string, skipSync: boolean = false): Promise<{ success: boolean; error?: string }> {
    dbg('🗑️ [EventHub] 删除事件', { eventId });

    // 1. 缓存快照（用于触发事件）
    const deletedEvent = this.cache.get(eventId)?.event || (await EventService.getEventById(eventId));

    // 2. 清除缓存
    this.cache.delete(eventId);

    // 3. 删除持久化数据
    const result = await EventService.deleteEvent(eventId, skipSync);

    // ✅ 不触发 notify，避免 ActionBasedSyncManager 循环依赖

    return result;
  }

  /**
   * 清除指定事件的缓存
   */
  invalidate(eventId: string): void {
    dbg('🔄 [EventHub] 清除缓存', { eventId });
    this.cache.delete(eventId);
  }

  /**
   * 清除所有缓存
   */
  invalidateAll(): void {
    dbg('🔄 [EventHub] 清除所有缓存');
    this.cache.clear();
  }

  /**
   * 格式化值用于日志输出
   */
  private formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      return value.length > 30 ? `"${value.substring(0, 30)}..."` : `"${value}"`;
    }
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    return JSON.stringify(value);
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      events: Array.from(this.cache.entries()).map(([id, snapshot]) => ({
        id,
        title: snapshot.event.title,
        age: Date.now() - snapshot.lastModified
      }))
    };
  }

  /**
   * 订阅事件通知
   * @param eventType 事件类型：'event-created' | 'event-updated' | 'event-deleted'
   * @param callback 回调函数
   */
  subscribe(eventType: string, callback: (data: any) => void): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(callback);
    
    // 返回取消订阅函数
    return () => {
      const callbacks = this.subscribers.get(eventType);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * 发布事件通知
   * @param eventType 事件类型
   * @param data 事件数据
   */
  notify(eventType: string, data: any): void {
    const callbacks = this.subscribers.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventHub] Subscriber error for ${eventType}:`, error);
        }
      });
    }
  }
}

// 导出单例
export const EventHub = new EventHubClass();

// 调试接口
if (typeof window !== 'undefined') {
  (window as any).debugEventHub = {
    getSnapshot: (id: string) => EventHub.getSnapshot(id),
    getSnapshotAsync: (id: string) => EventHub.getSnapshotAsync(id),
    prefetch: (id: string) => EventHub.prefetch(id),
    getCacheStats: () => EventHub.getCacheStats(),
    invalidate: (id: string) => EventHub.invalidate(id),
    invalidateAll: () => EventHub.invalidateAll()
  };
}
