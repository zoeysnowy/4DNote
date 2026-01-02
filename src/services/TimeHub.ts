import { Event } from '../types';
import { TimeGetResult, TimeKind, TimePolicy, TimeSource, TimeSpec } from '../types/time';
import { EventService } from './EventService';
import { formatTimeForStorage, parseLocalTimeString } from '../utils/timeUtils';
import { defaultTimePolicy } from '../config/time.config';
import { dbg, error } from '../utils/debugLogger';

// React 18/19 useSyncExternalStore requires getSnapshot() to be referentially stable
// when the underlying store value hasn't changed. Returning a fresh `{}` on every
// call can cause an infinite re-render loop ("Maximum update depth exceeded").
const EMPTY_TIME_SNAPSHOT: Readonly<TimeGetResult> = Object.freeze({});

// Lightweight TimeHub: single source of truth for event time intents and normalized values
// - getEventTime(eventId)
// - setEventTime(eventId, payload)
// - setFuzzy(eventId, rawText, options)
// - subscribe(eventId, cb)

export type SetEventTimeInput = {
  start?: string | Date;
  end?: string | Date;
  kind?: TimeKind;
  allDay?: boolean;
  source?: TimeSource;
  policy?: Partial<TimePolicy>;
  rawText?: string; // optional when updating intent
  timeSpec?: TimeSpec; // allow direct replacement
  isFuzzyDate?: boolean;  // 🆕 v2.6: 是否为模糊日期
  timeFieldState?: [number | null, number | null, number | null, number | null];  // 🆕 v2.7.4: [startHour, startMinute, endHour, endMinute]
  isFuzzyTime?: boolean;  // 🆕 v2.7: 是否为模糊时间段
  fuzzyTimeName?: string; // 🆕 v2.7: 模糊时间段名称
  // displayHint 已移除，使用动态计算
};

class TimeHubImpl {
  private cache = new Map<string, TimeGetResult>();
  private listeners = new Map<string, Set<() => void>>();
  private inited = false;

  private init() {
    if (this.inited) return;
    this.inited = true;

    // 🔧 Cache warming removed - EventService uses Promise deduplication now

    // Keep cache in sync with global event updates
    window.addEventListener('eventsUpdated', (e: any) => {
      try {
        const detail = e?.detail;
        const id = detail?.eventId as string | undefined;
        if (!id) return;
        
        // 🔧 优化：如果事件被删除，直接清除缓存但不通知订阅者
        // 原因：被删除的事件不需要触发组件重新渲染，TimeCalendar 已经处理了 UI 更新
        if (detail?.deleted || detail?.isDeleted) {
          this.cache.delete(id);
          dbg('timehub', '🗑️ 事件已删除，清除缓存但跳过通知订阅者', { eventId: id });
          return;
        }
        
        // 🚀 增量更新：如果 detail 包含完整事件数据，直接更新缓存，避免重新读取
        if (detail?.event) {
          const event = detail.event;
          const snapshot: TimeGetResult = {
            timeSpec: event.timeSpec,
            start: event.startTime,
            end: event.endTime,
          };
          this.cache.set(id, snapshot);
          dbg('timehub', '🔄 从 eventsUpdated 增量更新缓存', { eventId: id, start: snapshot.start, end: snapshot.end });
          this.emit(id);
        } else {
          // 降级：如果没有完整事件数据，清除缓存让组件重新读取
          this.cache.delete(id);
          dbg('timehub', '⚠️ 缺少事件数据，清除缓存并通知订阅者重新读取', { eventId: id });
          this.emit(id);
        }
      } catch {}
    });
  }

  private emit(eventId: string) {
    const set = this.listeners.get(eventId);
    // console.log(`%c[🔔 TimeHub.emit]`, 'background: #9C27B0; color: white; padding: 2px 6px;', {
    //   eventId,
    //   订阅者数量: set?.size ?? 0,
    //   hasListeners: !!set
    // });
    if (!set) return;
    set.forEach((cb) => {
      try { 
        // console.log(`%c[📞 调用订阅者]`, 'background: #673AB7; color: white; padding: 2px 6px;', { eventId });
        cb(); 
      } catch (err) { 
        console.error(`%c[❌ 订阅者回调失败]`, 'background: #F44336; color: white; padding: 2px 6px;', { eventId, error: err });
      }
    });
  }

  subscribe(eventId: string, cb: () => void): () => void {
    this.init();
    let set = this.listeners.get(eventId);
    if (!set) {
      set = new Set();
      this.listeners.set(eventId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.listeners.delete(eventId);
    };
  }

  getSnapshot(eventId: string): TimeGetResult {
    this.init(); // 🔧 Issue #11 修复：确保初始化监听器
    const cached = this.cache.get(eventId);
    if (cached) {
      dbg('timehub', '📦 返回缓存的快照', { eventId, start: cached.start, end: cached.end });
      return cached;
    }
    // EventService.getEventById is async; avoid blocking sync snapshot reads.
    // Return an empty snapshot and asynchronously refresh the cache.
    void this.refreshFromEventService(eventId);
    // IMPORTANT: return a stable reference to avoid useSyncExternalStore loops.
    this.cache.set(eventId, EMPTY_TIME_SNAPSHOT as TimeGetResult);
    dbg('timehub', '🔍 冷加载快照 (首次getSnapshot)：返回稳定空快照并异步刷新', { eventId });
    return EMPTY_TIME_SNAPSHOT as TimeGetResult;
  }

  private async refreshFromEventService(eventId: string): Promise<void> {
    try {
      const ev = await EventService.getEventById(eventId);
      if (!ev) return;
      const snapshot: TimeGetResult = {
        timeSpec: (ev as any).timeSpec as TimeSpec | undefined,
        start: ev.startTime,
        end: ev.endTime,
        isFuzzyDate: (ev as any).isFuzzyDate as boolean | undefined,
        timeFieldState: (ev as any).timeFieldState as [number, number, number, number] | undefined,
        isFuzzyTime: (ev as any).isFuzzyTime as boolean | undefined,
        fuzzyTimeName: (ev as any).fuzzyTimeName as string | undefined,
      };
      this.cache.set(eventId, snapshot);
      this.emit(eventId);
    } catch {
      // ignore
    }
  }

  async setEventTime(
    eventId: string, 
    input: SetEventTimeInput, 
    options: { skipSync?: boolean } = {}
  ): Promise<{ success: boolean; event?: Event; error?: string }> {
    this.init();
    const { skipSync = false } = options;
    
    // 🔍 [DEBUG-TIMER] 额外日志
    dbg('timehub', '📥 收到 setEventTime 调用', { 
      eventId, 
      输入start: input.start, 
      输入end: input.end,
      kind: input.kind,
      allDay: input.allDay,
      source: input.source,
      skipSync
    });
    // Prefer explicit timeSpec replacement
    let timeSpec: TimeSpec | undefined = input.timeSpec;

    // Normalize start/end into local-time ISO
    const normalize = (v?: string | Date) => {
      console.log('[TimeHub.normalize] 输入:', v, typeof v);
      if (!v) return undefined;
      const d = v instanceof Date ? v : parseLocalTimeString(v);
      const result = formatTimeForStorage(d);
      console.log('[TimeHub.normalize] 输出:', result);
      return result;
    };

    const start = normalize(input.start);
    const end = normalize(input.end);  // 🔧 修复：不要强制 end = start

    dbg('timehub', '🔄 标准化后的时间', { 
      标准化start: start,
      标准化end: end
    });

    if (!timeSpec) {
      const policy: TimePolicy = { ...defaultTimePolicy, ...(input.policy ?? {}) };
      const kind: TimeKind = input.kind ?? (start && end && start !== end ? 'range' : 'fixed');
      
      // 🔧 v2.7: 单个时间点时，end 应该是 undefined（不是 start）
      const finalEnd = kind === 'range' ? end : undefined;
      
      timeSpec = {
        kind,
        rawText: input.rawText,
        source: input.source ?? 'picker',
        policy,
        start,
        end: finalEnd,  // 🔧 使用 finalEnd
        allDay: input.allDay,
        resolved: { start, end: finalEnd },
      };
    }

    // 🚀 [架构修复 v2.10] 立即更新内存缓存，确保同步读取时能获取最新值
    const snapshot: TimeGetResult = {
      timeSpec: timeSpec,
      start: timeSpec.start,
      end: timeSpec.end,
    };
    this.cache.set(eventId, snapshot);
    console.log('[TimeHub.setEventTime] ⚡ 立即更新缓存', { 
      eventId, 
      start: snapshot.start, 
      end: snapshot.end 
    });

    // 🔔 立即通知订阅者（UI 即时响应）
    this.emit(eventId);

    // 🔧 持久化到 EventService（同步操作，无需 await）
    const existing = await EventService.getEventById(eventId);
    if (!existing) {
      // 🔧 [新行场景] 事件尚未创建
      // 缓存已更新，订阅者已通知，serialization.ts 会在创建时读取缓存
      console.warn('[TimeHub.setEventTime] ⚠️ 事件尚未创建，仅更新缓存', { 
        eventId, 
        start: snapshot.start, 
        end: snapshot.end 
      });
      return { success: true }; // ✅ 返回成功（缓存已设置）
    }

    const updated: Partial<Event> = {
      startTime: timeSpec.start ?? existing.startTime,
      endTime: timeSpec.end ?? undefined,  // 🔧 v2.9: undefined 时设为 undefined（不是空字符串）
      isAllDay: timeSpec.allDay ?? existing.isAllDay,
      updatedAt: formatTimeForStorage(new Date()),
      timeSpec: timeSpec, // 附加完整 timeSpec
    } as any;
    
    console.log('[TimeHub.setEventTime] 🔍 准备更新字段:', {
      eventId,
      'timeSpec.start': timeSpec.start,
      'timeSpec.end': timeSpec.end,
      'updated.startTime': updated.startTime,
      'updated.endTime': updated.endTime,
      'endTime是否为undefined': updated.endTime === undefined,
      'endTime类型': typeof updated.endTime
    });
    
    // 🆕 v2.6-v2.7: 保存模糊时间相关字段
    if (input.isFuzzyDate !== undefined) (updated as any).isFuzzyDate = input.isFuzzyDate;
    if (input.timeFieldState !== undefined) (updated as any).timeFieldState = input.timeFieldState;
    if (input.isFuzzyTime !== undefined) (updated as any).isFuzzyTime = input.isFuzzyTime;
    if (input.fuzzyTimeName !== undefined) (updated as any).fuzzyTimeName = input.fuzzyTimeName;
    // displayHint 已移除，使用动态计算

    dbg('timehub', '💾 持久化到 EventService', { 
      eventId, 
      startTime: updated.startTime,
      endTime: updated.endTime,
      skipSync
    });

    // ✅ 同步调用（localStorage 操作是同步的）
    const result = await EventService.updateEvent(eventId, updated, skipSync);
    
    if (!result.success) {
      error('timehub', '❌ EventService.updateEvent 失败', { eventId, error: result.error });
    }
    
    // 📝 注意：不需要再次更新缓存和通知订阅者
    // - 缓存已在第 210 行更新
    // - 订阅者已在第 219 行通知
    // - EventService 会触发 eventsUpdated 事件（由其他模块监听）
    return result;
  }

  // Set fuzzy intent (e.g., rawText: "下周"), without resolving to concrete times.
  async setFuzzy(eventId: string, rawText: string, options?: { source?: TimeSource; policy?: Partial<TimePolicy> }) {
    this.init();
    const existing = await EventService.getEventById(eventId);
    if (!existing) return { success: false, error: `Event not found: ${eventId}` };
    const policy: TimePolicy = { ...defaultTimePolicy, ...(options?.policy ?? {}) };

    const timeSpec: TimeSpec = {
      kind: 'fuzzy',
      rawText,
      source: options?.source ?? 'parser',
      policy,
      // No resolved bounds yet
    } as TimeSpec;

    const result = await EventService.updateEvent(eventId, { ...(existing as any), timeSpec });
    if (result.success && result.event) {
      const snapshot: TimeGetResult = {
        timeSpec,
        start: result.event.startTime,
        end: result.event.endTime,
      };
      this.cache.set(eventId, snapshot);
      
      // 🔧 Issue #11 修复：使用 queueMicrotask 确保订阅者及时收到通知
      queueMicrotask(() => {
        this.emit(eventId);
      });
      
      // ✅ 架构优化：EventService 已经触发了 eventsUpdated 事件
      // 不需要 TimeHub 再触发 timeChanged
    }
    return result;
  }

  // Timer helper: update an event's time from a running timer without triggering external sync.
  // Useful for realtime UI; persisted locally and broadcast via eventsUpdated/timeChanged.
  async setTimerWindow(
    eventId: string,
    input: { start?: string | Date; end?: string | Date; allDay?: boolean; policy?: Partial<TimePolicy> }
  ) {
    this.init();
    const existing = await EventService.getEventById(eventId);
    if (!existing) return { success: false, error: `Event not found: ${eventId}` };

    const normalize = (v?: string | Date) => {
      if (!v) return undefined;
      const d = v instanceof Date ? v : parseLocalTimeString(v);
      return formatTimeForStorage(d);
    };

    const start = normalize(input.start);
    const end = normalize(input.end ?? input.start);
    const policy: TimePolicy = { ...defaultTimePolicy, ...(input.policy ?? {}) };

    const timeSpec: TimeSpec = {
      kind: start && end && start !== end ? 'range' : 'fixed',
      source: 'timer',
      policy,
      start,
      end,
      allDay: input.allDay,
      resolved: { start, end },
    };

    const updated: Partial<Event> = {
      startTime: timeSpec.start ?? existing.startTime,
      endTime: timeSpec.end ?? existing.endTime,
      isAllDay: timeSpec.allDay ?? existing.isAllDay,
      isTimer: true,
      updatedAt: formatTimeForStorage(new Date()),
    } as any;
    (updated as any).timeSpec = timeSpec;

    // Skip external sync to avoid frequent updates, but still update local store and notify listeners.
    const result = await EventService.updateEvent(eventId, updated, true /* skipSync */);
    if (result.success && result.event) {
      const snapshot: TimeGetResult = { timeSpec, start: result.event.startTime, end: result.event.endTime };
      this.cache.set(eventId, snapshot);
      
      // 🔧 Issue #11 修复：使用 queueMicrotask 确保订阅者及时收到通知
      queueMicrotask(() => {
        this.emit(eventId);
      });
      
      // ✅ 架构优化：EventService 已经触发了 eventsUpdated 事件
      // 不需要 TimeHub 再触发 timeChanged
    }
    return result;
  }
}

export const TimeHub = new TimeHubImpl();
