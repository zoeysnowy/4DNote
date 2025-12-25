/**
 * useEventHubSubscription Hook
 * 
 * 用途：订阅EventHub的事件更新，自动同步组件状态
 * 
 * 解决问题：
 * - 组件直接从EventService异步加载，绕过EventHub（多源真相）
 * - 事件更新后组件State不自动同步
 * - 不同组件重复请求相同数据
 * 
 * 使用示例：
 * ```typescript
 * const allEvents = useEventHubSubscription({
 *   filter: (event) => isInTimelineRange(event, start, end),
 *   source: 'TimeLog'
 * });
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Event } from '../types';
import { EventHub } from '../services/EventHub';
import { EventService } from '../services/EventService';

export interface UseEventHubSubscriptionOptions {
  /**
   * 过滤函数：决定哪些事件需要订阅
   */
  filter?: (event: Event) => boolean;
  
  /**
   * 订阅源标识（用于调试）
   */
  source: string;
  
  /**
   * 是否启用调试日志
   */
  debug?: boolean;
  
  /**
   * 依赖数组：当这些值变化时重新过滤事件
   */
  deps?: any[];
}

/**
 * 订阅EventHub的事件更新
 * 
 * 特性：
 * - 自动订阅事件创建、更新、删除
 * - 支持自定义过滤条件
 * - 自动管理订阅生命周期
 * - 性能优化：使用useMemo避免重复过滤
 */
export function useEventHubSubscription(
  options: UseEventHubSubscriptionOptions
): Event[] {
  const { filter, source, debug = false, deps = [] } = options;
  
  // 稳定的过滤函数引用
  const stableFilter = useCallback(
    filter || (() => true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );
  
  // 内部状态：所有事件
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [version, setVersion] = useState(0);
  
  // 初始加载 + 订阅更新
  useEffect(() => {
    if (debug) {
      console.log('[useEventHubSubscription] 初始化订阅', { source });
    }
    
    // 1. 初始加载所有事件
    const loadInitialEvents = async () => {
      try {
        const events = await EventService.getAllEvents();
        setAllEvents(events);
        
        if (debug) {
          console.log('[useEventHubSubscription] 初始加载完成', {
            source,
            count: events.length
          });
        }
      } catch (error) {
        console.error('[useEventHubSubscription] 初始加载失败', {
          source,
          error
        });
        setAllEvents([]);
      }
    };
    
    loadInitialEvents();
    
    // 2. 订阅事件创建
    const unsubscribeCreated = EventHub.subscribe('event-created', (data) => {
      if (debug) {
        console.log('[useEventHubSubscription] 事件创建', {
          source,
          eventId: data.event?.id,
          title: data.event?.title
        });
      }
      
      setVersion(v => v + 1); // 触发重新过滤
    });
    
    // 3. 订阅事件更新
    const unsubscribeUpdated = EventHub.subscribe('event-updated', (data) => {
      if (debug) {
        console.log('[useEventHubSubscription] 事件更新', {
          source,
          eventId: data.eventId,
          fields: data.updates ? Object.keys(data.updates) : []
        });
      }
      
      setVersion(v => v + 1); // 触发重新过滤
    });
    
    // 4. 订阅事件删除
    const unsubscribeDeleted = EventHub.subscribe('event-deleted', (data) => {
      if (debug) {
        console.log('[useEventHubSubscription] 事件删除', {
          source,
          eventId: data.eventId
        });
      }
      
      setVersion(v => v + 1); // 触发重新过滤
    });
    
    // 清理订阅
    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
      
      if (debug) {
        console.log('[useEventHubSubscription] 取消订阅', { source });
      }
    };
  }, [source, debug]);
  
  // 当事件变化或过滤条件变化时，重新加载最新数据
  useEffect(() => {
    if (version > 0) {
      // 重新加载最新事件列表
      const reloadEvents = async () => {
        try {
          const events = await EventService.getAllEvents();
          setAllEvents(events);
          
          if (debug) {
            console.log('[useEventHubSubscription] 重新加载事件', {
              source,
              version,
              count: events.length
            });
          }
        } catch (error) {
          console.error('[useEventHubSubscription] 重新加载失败', {
            source,
            version,
            error
          });
        }
      };
      
      reloadEvents();
    }
  }, [version, source, debug]);
  
  // 5. 应用过滤条件（性能优化：使用useMemo）
  const filteredEvents = useMemo(() => {
    const filtered = allEvents.filter(stableFilter);
    
    if (debug) {
      console.log('[useEventHubSubscription] 过滤事件', {
        source,
        total: allEvents.length,
        filtered: filtered.length
      });
    }
    
    return filtered;
  }, [allEvents, stableFilter, source, debug]);
  
  return filteredEvents;
}

/**
 * 订阅单个事件的更新
 * 
 * 使用示例：
 * ```typescript
 * const event = useEventSubscription(eventId, 'EventEditModal');
 * ```
 */
export function useEventSubscription(
  eventId: string | null,
  source: string,
  debug: boolean = false
): Event | null {
  const [event, setEvent] = useState<Event | null>(null);
  
  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      return;
    }
    
    // 1. 初始加载
    const loadEvent = () => {
      const snapshot = EventHub.getSnapshot(eventId);
      setEvent(snapshot);
      
      if (debug) {
        console.log('[useEventSubscription] 初始加载', {
          source,
          eventId,
          title: snapshot?.title
        });
      }
    };
    
    loadEvent();
    
    // 2. 订阅更新
    const unsubscribe = EventHub.subscribe('event-updated', (data) => {
      if (data.eventId === eventId) {
        const updatedEvent = EventHub.getSnapshot(eventId);
        setEvent(updatedEvent);
        
        if (debug) {
          console.log('[useEventSubscription] 事件更新', {
            source,
            eventId,
            fields: data.updates ? Object.keys(data.updates) : []
          });
        }
      }
    });
    
    // 3. 订阅删除
    const unsubscribeDeleted = EventHub.subscribe('event-deleted', (data) => {
      if (data.eventId === eventId) {
        setEvent(null);
        
        if (debug) {
          console.log('[useEventSubscription] 事件删除', {
            source,
            eventId
          });
        }
      }
    });
    
    return () => {
      unsubscribe();
      unsubscribeDeleted();
    };
  }, [eventId, source, debug]);
  
  return event;
}

/**
 * 获取EventHub的所有缓存事件
 * 
 * 使用示例：
 * ```typescript
 * const allEvents = useEventHubCache('PlanManager');
 * ```
 */
export function useEventHubCache(source: string, debug: boolean = false): Event[] {
  return useEventHubSubscription({
    source,
    debug
    // 无filter，返回所有事件
  });
}
