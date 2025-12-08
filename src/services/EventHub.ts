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

import { Event } from '../types';
import { EventService } from './EventService';
import { TimeHub } from './TimeHub';

const dbg = console.log.bind(console);

interface EventSnapshot {
  event: Event;
  lastModified: number;
}

class EventHubClass {
  private cache: Map<string, EventSnapshot> = new Map();
  private subscribers: Map<string, Array<(data: any) => void>> = new Map();

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

    // 2. 从 EventService 冷加载（使用 Index 查询，避免全表扫描）
    const event = EventService.getEventById(eventId);
    
    if (!event) {
      console.warn('⚠️ [EventHub] 事件不存在', { eventId });
      return null;
    }

    // 3. 缓存快照
    this.cache.set(eventId, {
      event: { ...event },
      lastModified: Date.now()
    });

    dbg('📥 [EventHub] 冷加载快照', { eventId, title: event.title });
    return { ...event };
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
    
    // 🔍 [DEBUG-TIMER] 额外日志
    // 1. 🔧 [FIX] 始终从 EventService 读取最新数据，避免缓存导致的数据不一致
    const currentEvent = EventService.getEventById(eventId);
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

    // ✅ 架构优化：EventService 已经触发了 eventsUpdated 事件
    // 不需要 EventHub 再触发 eventUpdated，避免重复事件
    // 所有订阅者统一监听 eventsUpdated 事件即可

    return result;
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
    const updatedEvent = this.getSnapshot(eventId);
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

    // ✅ 架构优化：EventService 已经触发了 eventsUpdated 事件
    // 不需要 EventHub 再触发 eventCreated，避免重复事件

    return result;
  }

  /**
   * 删除事件
   */
  async deleteEvent(eventId: string, skipSync: boolean = false): Promise<{ success: boolean; error?: string }> {
    dbg('🗑️ [EventHub] 删除事件', { eventId });

    // 1. 清除缓存
    this.cache.delete(eventId);

    // 2. 删除持久化数据
    const result = await EventService.deleteEvent(eventId, skipSync);

    // ✅ 架构优化：EventService 已经触发了 eventsUpdated 事件
    // 不需要 EventHub 再触发 eventDeleted，避免重复事件

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
    getCacheStats: () => EventHub.getCacheStats(),
    invalidate: (id: string) => EventHub.invalidate(id),
    invalidateAll: () => EventHub.invalidateAll()
  };
}
