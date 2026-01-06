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
import type { Event } from '@frontend/types';
import { EventHub } from '@backend/EventHub';
import { EventService } from '@backend/EventService';
import { useEventsUpdatedSubscription } from '@frontend/hooks/useEventsUpdatedSubscription';

function getEventIdFromEventsUpdatedDetail(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const asAny = detail as any;
  if (typeof asAny.eventId === 'string' && asAny.eventId) return asAny.eventId;
  if (typeof asAny.event?.id === 'string' && asAny.event.id) return asAny.event.id;
  return null;
}

function getEventFromEventsUpdatedDetail(detail: unknown): Event | null {
  if (!detail || typeof detail !== 'object') return null;
  const asAny = detail as any;
  if (asAny.event && typeof asAny.event === 'object' && typeof asAny.event.id === 'string') {
    return asAny.event as Event;
  }
  return null;
}

function isDeletedFromEventsUpdatedDetail(detail: unknown): boolean {
  if (!detail || typeof detail !== 'object') return false;
  const asAny = detail as any;
  return Boolean(asAny.deleted || asAny.softDeleted || asAny.hardDeleted);
}

type EventHubPayload =
  | Event
  | {
      eventId?: string;
      event?: Event;
      updates?: Record<string, unknown>;
      [key: string]: unknown;
    }
  | null
  | undefined;

function getEventIdFromPayload(payload: EventHubPayload): string | null {
  if (!payload) return null;
  if (typeof payload === 'object') {
    const asAny = payload as any;
    return (
      (typeof asAny.eventId === 'string' && asAny.eventId) ||
      (typeof asAny.id === 'string' && asAny.id) ||
      (typeof asAny.event?.id === 'string' && asAny.event.id) ||
      null
    );
  }
  return null;
}

function getEventFromPayload(payload: EventHubPayload): Event | null {
  if (!payload) return null;
  if (typeof payload === 'object') {
    const asAny = payload as any;
    // Newer/expected: wrapper payload
    if (asAny.event && typeof asAny.event === 'object') return asAny.event as Event;
    // Current EventService.emit/EventHub.notify path: raw Event
    if (typeof asAny.id === 'string') return asAny as Event;
  }
  return null;
}

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
      const createdEvent = getEventFromPayload(data);
      if (debug) {
        console.log('[useEventHubSubscription] 事件创建', {
          source,
          eventId: getEventIdFromPayload(data),
          title: (createdEvent as any)?.title
        });
      }
      
      setVersion(v => v + 1); // 触发重新过滤
    });
    
    // 3. 订阅事件更新
    const unsubscribeUpdated = EventHub.subscribe('event-updated', (data) => {
      if (debug) {
        console.log('[useEventHubSubscription] 事件更新', {
          source,
          eventId: getEventIdFromPayload(data),
          fields: (data as any)?.updates ? Object.keys((data as any).updates) : []
        });
      }
      
      setVersion(v => v + 1); // 触发重新过滤
    });
    
    // 4. 订阅事件删除
    const unsubscribeDeleted = EventHub.subscribe('event-deleted', (data) => {
      if (debug) {
        console.log('[useEventHubSubscription] 事件删除', {
          source,
          eventId: getEventIdFromPayload(data)
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

  // 1) 初始强一致加载（避免依赖 EventHub 缓存时序/契约）
  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const loaded = await EventService.getEventById(eventId);
      if (cancelled) return;
      setEvent(loaded);

      if (debug) {
        console.log('[useEventSubscription] 初始加载(EventService)', {
          source,
          eventId,
          title: loaded?.title
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, source, debug]);

  // 2) 监听全局 eventsUpdated 增量更新（方案A：UI 以 eventsUpdated 为主）
  const handleEventsUpdated = useCallback(
    (detail: unknown) => {
      if (!eventId) return;
      const updatedId = getEventIdFromEventsUpdatedDetail(detail);
      if (updatedId !== eventId) return;

      if (isDeletedFromEventsUpdatedDetail(detail)) {
        setEvent(null);
        if (debug) {
          console.log('[useEventSubscription] eventsUpdated: 删除', {
            source,
            eventId,
            senderId: (detail as any)?.senderId,
            timestamp: (detail as any)?.timestamp
          });
        }
        return;
      }

      const payloadEvent = getEventFromEventsUpdatedDetail(detail);
      if (payloadEvent) {
        setEvent(payloadEvent);
        if (debug) {
          console.log('[useEventSubscription] eventsUpdated: 更新(payload)', {
            source,
            eventId,
            senderId: (detail as any)?.senderId,
            timestamp: (detail as any)?.timestamp
          });
        }
        return;
      }

      // 极少数情况下 detail 可能不带 event：兜底强一致 reload
      void (async () => {
        const reloaded = await EventService.getEventById(eventId);
        setEvent(reloaded);
        if (debug) {
          console.log('[useEventSubscription] eventsUpdated: 更新(reload)', {
            source,
            eventId
          });
        }
      })();
    },
    [eventId, source, debug]
  );

  useEventsUpdatedSubscription({ enabled: Boolean(eventId), onEventsUpdated: handleEventsUpdated });
  
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
