/**
 * EventService - 统一的事件管理服�?
 * 
 * 职责�?
 * 1. 集中管理所有事件的创建、更新、删除操�?
 * 2. 自动处理 localStorage 持久�?
 * 3. 自动触发同步机制（recordLocalAction�?
 * 4. 发送全局事件通知（eventsUpdated�?
 * 5. 确保所有事件创建路径（Timer、TimeCalendar、PlanManager）都经过统一处理
 */

import { Event, EventLog } from '../types';
import { STORAGE_KEYS } from '../constants/storage';
import { formatTimeForStorage, parseLocalTimeString } from '../utils/timeUtils';
import { storageManager } from './storage/StorageManager';
import type { StorageEvent } from './storage/types';
import { logger } from '../utils/logger';
import { validateEventTime } from '../utils/eventValidation';

import { ContactService } from './ContactService';
import { EventHistoryService } from './EventHistoryService'; // 🆕 事件历史记录
import { jsonToSlateNodes, slateNodesToHtml } from '../components/ModalSlate/serialization'; // 🆕 Slate 转换
import { generateEventId, isValidId } from '../utils/idGenerator'; // 🆕 UUID ID 生成
import { EventHub } from './EventHub'; // 🔧 用于 IndexMap 同步
import { generateBlockId, injectBlockTimestamp } from '../utils/blockTimestampUtils'; // 🆕 Block-Level Timestamp
import { migrateToBlockTimestamp, needsMigration, ensureBlockTimestamps } from '../utils/blockTimestampMigration'; // 🆕 数据迁移
import { SignatureUtils } from '../utils/signatureUtils'; // 🆕 统一的签名处理工具

const eventLogger = logger.module('EventService');

// 🆕 Block-Level Timestamp 解析上下文
interface ParseContext {
  eventCreatedAt?: number;
  eventUpdatedAt?: number;
  oldEventLog?: EventLog;
}

// 同步管理器实例（将在初始化时设置）
let syncManagerInstance: any = null;

// 🔍 模块加载时的调试
// EventService 模块初始化

// 跨标签页广播通道
let broadcastChannel: BroadcastChannel | null = null;

// 🆕 循环更新防护机制
let updateSequence = 0;
const pendingLocalUpdates = new Map<string, { updateId: number; timestamp: number; component: string }>();
const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export class EventService {
  // 🚀 [CRITICAL PERFORMANCE FIX] Promise 去重机制 - 防止并发查询风暴
  private static getAllEventsPromise: Promise<Event[]> | null = null;
  
  // 🚀 [PERFORMANCE] 范围查询缓存 - 避免重复 IndexedDB 查询
  private static rangeQueryCache = new Map<string, { 
    data: Event[]; 
    timestamp: number;
    startDate: string;
    endDate: string;
  }>();
  private static readonly RANGE_CACHE_TTL = 5000; // 5秒缓存
  
  /**
   * 🔧 [FIX] 确保 StorageManager 已初始化
   * 防止竞争条件导致查询失败
   */
  private static async ensureStorageReady(): Promise<void> {
    if (!storageManager.isInitialized()) {
      eventLogger.log('⏳ [EventService] Waiting for StorageManager initialization...');
      await storageManager.initialize();
      eventLogger.log('✅ [EventService] StorageManager ready');
    }
  }
  
  /**
   * 清空范围查询缓存（事件变更时调用）
   */
  private static clearRangeCache(): void {
    this.rangeQueryCache.clear();
  }

  /**
   * 初始化服务，注入同步管理器
   */
  static initialize(syncManager: any) {
    syncManagerInstance = syncManager;
    eventLogger.log('✅ [EventService] Initialized with sync manager');
    
    // 初始化跨标签页广播通道
    try {
      broadcastChannel = new BroadcastChannel('4dnote-events');
      
      // 🆕 监听其他标签页的消息，过滤自己发送的消息
      broadcastChannel.onmessage = (event) => {
        const { senderId, ...data } = event.data;
        
        // 🚫 忽略自己发送的消息，避免循环
        if (senderId === tabId) {
          return;
        }
        
        // ✅ 处理其他标签页的更新
        if (data.type === 'eventsUpdated') {
          window.dispatchEvent(new CustomEvent('eventsUpdated', { 
            detail: { ...data, isFromOtherTab: true, senderId }
          }));
        }
      };
      
      eventLogger.log('📡 [EventService] BroadcastChannel initialized for cross-tab sync', { tabId });
    } catch (error) {
      eventLogger.warn('⚠️ [EventService] BroadcastChannel not supported:', error);
    }
    
    // 订阅 ContactService 事件，自动同步联系人变更到事件
    this.subscribeToContactEvents();
  }

  /**
   * 订阅 ContactService 事件
   * 实现联系人变更自动同步到相关事件
   */
  private static subscribeToContactEvents(): void {
    // 联系人更新时，同步到所有包含该联系人的事件
    ContactService.addEventListener('contact.updated', async (event) => {
      const { id, after } = event.data;
      eventLogger.log('📇 [EventService] Contact updated, syncing to related events:', id);
      
      const events = await this.getAllEvents();
      const relatedEvents = events.filter((e: Event) => 
        e.attendees?.some(a => a.id === id) || e.organizer?.id === id
      );
      
      if (relatedEvents.length === 0) {
        eventLogger.log('ℹ️ [EventService] No events reference this contact');
        return;
      }
      
      relatedEvents.forEach((event: Event) => {
        const updates: Partial<Event> = {};
        
        // 更新参会人
        if (event.attendees?.some((a: any) => a.id === id)) {
          updates.attendees = event.attendees.map((a: any) => 
            a.id === id ? after : a
          );
        }
        
        // 更新发起人
        if (event.organizer?.id === id) {
          updates.organizer = after;
        }
        
        this.updateEvent(event.id!, updates);
      });
      
      eventLogger.log(`✅ [EventService] Updated ${relatedEvents.length} events with new contact info`);
    });

    // 联系人删除时，从所有事件中移除该联系人
    ContactService.addEventListener('contact.deleted', async (event) => {
      const { id } = event.data;
      eventLogger.log('🗑️ [EventService] Contact deleted, removing from events:', id);
      
      const events = await this.getAllEvents();
      const relatedEvents = events.filter((e: Event) =>
        e.attendees?.some((a: any) => a.id === id) || e.organizer?.id === id
      );
      
      if (relatedEvents.length === 0) {
        eventLogger.log('ℹ️ [EventService] No events reference this contact');
        return;
      }
      
      relatedEvents.forEach((event: Event) => {
        const updates: Partial<Event> = {};
        
        // 从参会人中移除
        if (event.attendees?.some((a: any) => a.id === id)) {
          updates.attendees = event.attendees.filter((a: any) => a.id !== id);
        }
        
        // 清除发起人（如果是被删除的联系人）
        if (event.organizer?.id === id) {
          updates.organizer = undefined;
        }
        
        this.updateEvent(event.id!, updates);
      });
      
      eventLogger.log(`✅ [EventService] Removed contact from ${relatedEvents.length} events`);
    });
  }

  /**
   * 获取所有事�?
   * 🆕 v2.14.1: 自动规范化 title 字段，兼容旧数据
   * 🔥 v3.0.0: 迁移到 StorageManager（异步查询）
   * 🚀 v3.1.0: Promise 去重机制 - 避免并发查询导致的 IndexedDB 死锁
   */
  static async getAllEvents(): Promise<Event[]> {
    // 🔧 [CRITICAL FIX] 如果已有查询进行中，等待该查询完成
    // 避免"惊群问题"：100+ 个并发调用同时触发全表查询，导致 IndexedDB 事务阻塞
    if (this.getAllEventsPromise) {
      // ✨ 静默重用 Promise（避免日志刷屏）
      return this.getAllEventsPromise;
    }
    
    // 开始新查询，保存 Promise 供其他调用等待
    this.getAllEventsPromise = (async () => {
      try {
        // 🔧 [FIX] 确保存储已初始化
        await this.ensureStorageReady();
        
        const result = await storageManager.queryEvents({ limit: 10000 });
        
        // ✅ v3.0: 过滤已软删除的事件
        const activeEvents = result.items.filter(event => !event.deletedAt);
        
        // 🔧 自动规范化所有事件的 title 字段（处理旧数据中的 undefined）
        const events = activeEvents.map(event => this.convertStorageEventToEvent(event));
        
        // ✨ 查询完成，清除 Promise（5秒后，避免同步过程中频繁查询）
        setTimeout(() => {
          this.getAllEventsPromise = null;
        }, 5000);
        
        return events;
      } catch (error) {
        eventLogger.error('❌ [EventService] Failed to load events:', error);
        this.getAllEventsPromise = null; // 查询失败，立即清除
        return [];
      }
    })();
    
    return this.getAllEventsPromise;
  }

  /**
   * 根据日期范围获取事件（TimeLog 优化）
   * ✅ 符合 Storage Architecture：使用 StorageManager 的查询能力
   * @param startDate ISO 格式的开始日期
   * @param endDate ISO 格式的结束日期
   */
  /**
   * 🚀 [PERFORMANCE] 获取统计数据（使用轻量级 EventStats）
   * @param startDate 开始日期（YYYY-MM-DD 或 ISO 格式）
   * @param endDate 结束日期（YYYY-MM-DD 或 ISO 格式）
   * @returns EventStats 数组（90% 更小，5x 更快）
   */
  static async getEventStatsByDateRange(startDate: string, endDate: string): Promise<import('./storage/types').EventStats[]> {
    try {
      await this.ensureStorageReady();
      
      const perfStart = performance.now();
      
      const stats = await storageManager.queryEventStats({
        startDate,
        endDate,
      });
      
      const duration = performance.now() - perfStart;
      eventLogger.log(`📊 [Performance] getEventStatsByDateRange: ${duration.toFixed(1)}ms → ${stats.length} stats`);
      
      return stats;
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to load event stats:', error);
      return [];
    }
  }

  static async getEventsByDateRange(startDate: string, endDate: string): Promise<Event[]> {
    try {
      // 🔧 [FIX] 确保存储已初始化
      await this.ensureStorageReady();
      
      const perfStart = performance.now();
      
      // ✅ 使用 StorageManager 的日期范围查询
      const queryStart = performance.now();
      // 🚀 [CRITICAL FIX] 使用 startDate/endDate（触发索引查询），而不是 startTime/endTime
      const result = await storageManager.queryEvents({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        limit: 10000
      });
      const queryDuration = performance.now() - queryStart;
      
      // 过滤已软删除的事件
      const filterStart = performance.now();
      const activeEvents = result.items.filter(event => !event.deletedAt);
      const filterDuration = performance.now() - filterStart;
      
      const convertStart = performance.now();
      const events = activeEvents.map(event => this.convertStorageEventToEvent(event));
      const convertDuration = performance.now() - convertStart;
      
      const totalDuration = performance.now() - perfStart;
      eventLogger.log(`⚡ [Performance] getEventsByDateRange: total=${totalDuration.toFixed(1)}ms (query=${queryDuration.toFixed(1)}ms, filter=${filterDuration.toFixed(1)}ms, convert=${convertDuration.toFixed(1)}ms) → ${events.length} events`);
      
      return events;
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to load events by date range:', error);
      return [];
    }
  }

  /**
   * 根据ID获取事件
   * 🔧 性能优化：只规范化目标事件的 title 和 eventlog，避免全量处理
   * 🔥 v3.0.0: 迁移到 StorageManager（异步查询，自动修复逻辑由 normalizeEvent 处理）
   */
  static async getEventById(eventId: string): Promise<Event | null> {
    try {
      // 🔧 [FIX] 确保存储已初始化
      await this.ensureStorageReady();
      
      // 🚀 [PERFORMANCE FIX] 直接通过 ID 获取，不要用 queryEvents 全表扫描
      const storageEvent = await storageManager.getEvent(eventId);
      
      if (!storageEvent) return null;
      
      // 检查 eventlog 是否为空或空数组
      const needsEventLogFix = !storageEvent.eventlog || 
                               (typeof storageEvent.eventlog === 'object' && storageEvent.eventlog.slateJson === '[]');
      
      // 规范化 title（只处理格式，不做重量级转换）
      const normalizedTitle = this.normalizeTitle(storageEvent.title);
      
      // 🔍 调试日志：检查 title 规范化结果
      if (!normalizedTitle.simpleTitle && !normalizedTitle.fullTitle) {
        console.warn('[EventService] 空标题事件:', {
          id: eventId.slice(-8),
          originalTitle: storageEvent.title,
          normalizedTitle,
          description: storageEvent.description?.substring(0, 50)
        });
      }
      
      // 🚀 [PERFORMANCE FIX] 读取时不要调用 normalizeEventLog！
      // eventlog 应该在保存时（createEvent/updateEvent）已经包含完整字段
      // 如果缺失字段，说明数据有问题，应该用修复工具批量修复，而不是每次读取都转换
      const normalizedEvent = {
        ...storageEvent,
        title: normalizedTitle,
        // 直接使用数据库中的 eventlog，不做转换
        eventlog: storageEvent.eventlog
      };
      
      // 🔍 调试：验证 syncMode 是否从数据库正确读取（已禁用，日志太多）
      // if (eventId.startsWith('outlook-')) {
      //   console.log('🔍 [EventService] getEventById Outlook 事件:', {
      //     eventId: eventId.slice(-8),
      //     'storageEvent.syncMode': storageEvent.syncMode,
      //     'normalizedEvent.syncMode': normalizedEvent.syncMode
      //   });
      // }
      
      // ⚠️ [数据质量检查] 如果 eventlog 缺少 html/plainText，记录警告
      // 不要自动修复，避免性能灾难（每次读取都转换）
      if (storageEvent.eventlog && typeof storageEvent.eventlog === 'object') {
        const eventlog = storageEvent.eventlog as any;
        // 🔥 修复：检查字段是否 undefined，不是检查 falsy
        // 空字符串 '' 是合法值
        if (eventlog.html === undefined || eventlog.plainText === undefined) {
          console.warn('[EventService] ⚠️ EventLog 缺少预生成字段，请运行修复工具:', {
            eventId: eventId.slice(-8),
            hasSlateJson: !!eventlog.slateJson,
            hasHtml: eventlog.html !== undefined,
            hasPlainText: eventlog.plainText !== undefined,
            htmlValue: eventlog.html,
            plainTextValue: eventlog.plainText,
            fixTool: 'http://localhost:5173/fix-eventlog-fields.html'
          });
        }
      }
      
      return normalizedEvent as Event;
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to get event by ID:', error);
      return null;
    }
  }

  /**
   * 获取适合在 TimeLog 时间轴显示的事件
   * 过滤逻辑：
   * 1. 排除附属事件（Timer/TimeLog/OutsideApp）
   * 2. 排除没有时间信息的 Task 事件
   * 3. 包含有时间的 Plan 事件和 Task 事件
   */
  static async getTimelineEvents(startDate?: string | Date, endDate?: string | Date): Promise<Event[]> {
    try {
      // 🔧 [FIX] 确保存储已初始化
      await this.ensureStorageReady();
      
      const t0 = performance.now();
      
      // 获取所有事件或指定范围的事件
      let events: Event[];
      const queryStart = performance.now();
      if (startDate && endDate) {
        events = await this.getEventsByRange(startDate, endDate);
      } else {
        events = await this.getAllEvents();
      }
      const queryDuration = performance.now() - queryStart;
      
      // 过滤逻辑
      const filterStart = performance.now();
      const timelineEvents = events.filter(event => {
        // 1. 排除附属事件（系统生成的事件）
        if (event.isTimer === true || 
            event.isTimeLog === true || 
            event.isOutsideApp === true) {
          // eventLogger.log('🔽 [EventService] 过滤附属事件:', {
          //   id: event.id,
          //   title: typeof event.title === 'object' ? event.title.simpleTitle : event.title,
          //   isTimer: event.isTimer,
          //   isTimeLog: event.isTimeLog,
          //   isOutsideApp: event.isOutsideApp
          // });
          return false;
        }
        
        // 2. 排除 Plan 页面事件（isPlan=true）无时间的情况
        if (event.isPlan === true) {
          const hasTime = (event.startTime && event.startTime !== '') || 
                         (event.endTime && event.endTime !== '');
          
          if (!hasTime) {
            // eventLogger.log('🔽 [EventService] 过滤无时间的 Plan 事件:', {
            //   id: event.id,
            //   title: typeof event.title === 'object' ? event.title.simpleTitle : event.title,
            //   isPlan: event.isPlan,
            //   isTask: event.isTask,
            //   startTime: event.startTime,
            //   endTime: event.endTime,
            //   checkTime: event.checkTime
            // });
            return false;
          }
        }
        
        // 3. Task 事件必须有时间才显示
        if (event.isTask === true) {
          const hasTime = (event.startTime && event.startTime !== '') || 
                         (event.endTime && event.endTime !== '');
          
          if (!hasTime) {
            // eventLogger.log('🔽 [EventService] 过滤无时间的 Task 事件:', {
            //   id: event.id,
            //   title: typeof event.title === 'object' ? event.title.simpleTitle : event.title,
            //   isPlan: event.isPlan,
            //   isTask: event.isTask,
            //   startTime: event.startTime,
            //   endTime: event.endTime,
            //   checkTime: event.checkTime
            // });
            return false;
          }
        }
        
        // 4. 显示的事件日志（已禁用以减少日志输出）
        // eventLogger.log('✅ [EventService] 显示事件:', {
        //   id: event.id,
        //   title: typeof event.title === 'object' ? event.title.simpleTitle : event.title,
        //   isPlan: event.isPlan,
        //   isTask: event.isTask,
        //   isTimer: event.isTimer,
        //   isTimeLog: event.isTimeLog,
        //   isOutsideApp: event.isOutsideApp,
        //   startTime: event.startTime,
        //   endTime: event.endTime
        // });
        
        return true;
      });
      const filterDuration = performance.now() - filterStart;
      
      const totalDuration = performance.now() - t0;
      eventLogger.log(`⚡ [Performance] getTimelineEvents: total=${totalDuration.toFixed(1)}ms (query=${queryDuration.toFixed(1)}ms, filter=${filterDuration.toFixed(1)}ms) → ${timelineEvents.length}/${events.length} events`, {
        range: startDate && endDate ? `${formatTimeForStorage(new Date(startDate))} ~ ${formatTimeForStorage(new Date(endDate))}` : 'all',
        filtered: events.length - timelineEvents.length
      });
      
      return timelineEvents;
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to get timeline events:', error);
      return [];
    }
  }

  /**
   * 按日期范围获取事件（性能优化：只加载视图需要的事件）
   * @param startDate - 范围起始日期（YYYY-MM-DD 或 Date 对象）
   * @param endDate - 范围结束日期（YYYY-MM-DD 或 Date 对象）
   * @returns 在指定范围内的事件数组
   * 
   * 🔥 v3.0.0: 使用 StorageManager 智能查询（SQLite 索引加速）
   */
  static async getEventsByRange(startDate: string | Date, endDate: string | Date): Promise<Event[]> {
    try {
      // 🔧 [FIX] 确保存储已初始化
      await this.ensureStorageReady();
      
      const t0 = performance.now();
      
      // 转换为时间戳（方便比较）
      const rangeStart = formatTimeForStorage(new Date(startDate));
      const rangeEnd = formatTimeForStorage(new Date(endDate));
      
      // 🚀 [PERFORMANCE] 检查缓存
      const cacheKey = `${rangeStart}|${rangeEnd}`;
      const cached = this.rangeQueryCache.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < this.RANGE_CACHE_TTL) {
        eventLogger.log(`⚡ [EventService] getEventsByRange (cached): ${cached.data.length} events in ${(performance.now() - t0).toFixed(2)}ms`, {
          range: `${rangeStart} ~ ${rangeEnd}`,
          age: `${(now - cached.timestamp)}ms`
        });
        return cached.data;
      }
      
      // 🚀 [PERFORMANCE] 使用 StorageManager 索引查询（IndexedDB startTime 索引已过滤时间范围）
      const result = await storageManager.queryEvents({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        filters: {},
        limit: 10000
      });
      
      const events = result.items.map(e => this.convertStorageEventToEvent(e));
      
      // 缓存结果
      this.rangeQueryCache.set(cacheKey, {
        data: events,
        timestamp: now,
        startDate: rangeStart,
        endDate: rangeEnd
      });
      
      const t1 = performance.now();
      eventLogger.log(`🔍 [EventService] getEventsByRange: ${result.items.length}/${result.items.length} events in ${(t1 - t0).toFixed(2)}ms`, {
        range: `${rangeStart} ~ ${rangeEnd}`,
        reduction: '0.0%'
      });
      
      return events;
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to load events by range:', error);
      return [];
    }
  }

  /**
   * 创建新事�?
   * @param event - 事件对象
   * @param skipSync - 是否跳过同步（默认false，某些场景如Timer运行中可设为true�?
   * @param options - 创建选项，包含来源组件信息
   */
  static async createEvent(
    event: Event, 
    skipSync: boolean = false,
    options?: {
      originComponent?: 'PlanManager' | 'TimeCalendar' | 'Timer' | 'EventEditModal';
      source?: 'user-edit' | 'external-sync' | 'auto-sync';
    }
  ): Promise<{ success: boolean; event?: Event; error?: string }> {
    try {
      eventLogger.log('🆕 [EventService] Creating new event:', event.id);

      // ✅ v1.8: 验证时间字段（区分 Task 和 Calendar 事件）
      const validation = validateEventTime(event);
      if (!validation.valid) {
        eventLogger.error('❌ [EventService] Event validation failed:', validation.error);
        return { success: false, error: validation.error };
      }
      
      if (validation.warnings && validation.warnings.length > 0) {
        eventLogger.warn('⚠️ [EventService] Event warnings:', validation.warnings);
      }

      // ✅ v3.0: 自动生成 UUID ID（如果未提供或格式无效）
      if (!event.id || !isValidId(event.id, 'event')) {
        const oldId = event.id;
        event.id = generateEventId();
        
        if (oldId) {
          eventLogger.warn('⚠️ [EventService] Invalid ID format, generated new UUID:', {
            oldId,
            newId: event.id
          });
        } else {
          eventLogger.log('🆕 [EventService] Generated UUID for new event:', event.id);
        }
      }
      
      // 标题可以为空（会在上层如 EventEditModal 或 TimeCalendar 中自动填充）
      // 如果既无标题又无标签，应该在 UI 层禁用保存按钮
      if (!event.title && (!event.tags || event.tags.length === 0)) {
        eventLogger.warn('⚠️ [EventService] Event has no title and no tags:', event.id);
      }

      // 🔥 v2.15: 中枢化架构 - 使用 normalizeEvent 统一处理所有字段
      const normalizedEvent = this.normalizeEvent(event);
      
      // 🔥 v2.15: 临时ID追踪系统
      const isTempId = event.id.startsWith('line-');
      const originalTempId = isTempId ? event.id : undefined;
      
      // ✅ [TIME SPEC] 确保时间戳格式统一
      const now = formatTimeForStorage(new Date());
      if (!normalizedEvent.createdAt) {
        console.warn('[createEvent] ⚠️ normalizedEvent 缺少 createdAt，使用当前时间:', now);
      }
      if (!normalizedEvent.updatedAt) {
        console.warn('[createEvent] ⚠️ normalizedEvent 缺少 updatedAt，使用当前时间:', now);
      }
      
      // 确保必要字段
      // 🔧 [BUG FIX] skipSync=true时，强制设置syncStatus='local-only'，忽略event.syncStatus
      const finalEvent: Event = {
        ...normalizedEvent,
        createdAt: normalizedEvent.createdAt || now,  // ✅ 回退到当前时间
        updatedAt: normalizedEvent.updatedAt || now,  // ✅ 回退到当前时间
        fourDNoteSource: true,
        syncStatus: skipSync ? 'local-only' : (event.syncStatus || 'pending'),
        // 🔥 v2.15: 添加临时ID标记
        _isTempId: isTempId,
        _originalTempId: originalTempId,
      };

      // 检查是否已存在（从 StorageManager 查询）
      const existing = await storageManager.queryEvents({
        filters: { eventIds: [event.id] },
        limit: 1
      });
      
      if (existing.items.length > 0) {
        eventLogger.warn('⚠️ [EventService] Event already exists, will update instead:', event.id);
        return this.updateEvent(event.id, finalEvent, skipSync, options);
      }

      // 创建事件（双写到 IndexedDB + SQLite）
      const storageEvent = this.convertEventToStorageEvent(finalEvent);
      console.log('[createEvent] 🔍 Saving storageEvent:', {
        id: storageEvent.id?.slice(-8),
        eventlogType: typeof storageEvent.eventlog,
        eventlogKeys: storageEvent.eventlog && typeof storageEvent.eventlog === 'object' 
          ? Object.keys(storageEvent.eventlog) 
          : 'N/A',
        eventlog: storageEvent.eventlog
      });
      await storageManager.createEvent(storageEvent);
      eventLogger.log('💾 [EventService] Event saved to StorageManager');
      
      // 🚀 [PERFORMANCE] 同步写入 EventStats（统计数据表）
      await storageManager.createEventStats({
        id: finalEvent.id,
        tags: finalEvent.tags || [],
        calendarIds: (finalEvent as any).calendarIds || [],
        startTime: finalEvent.startTime,
        endTime: finalEvent.endTime,
        source: finalEvent.source,
        updatedAt: finalEvent.updatedAt,
      });
      eventLogger.log('📊 [EventService] EventStats synced');
      
      // 🔍 立即读取验证
      const savedEvent = await storageManager.getEvent(storageEvent.id!);
      if (savedEvent?.eventlog && typeof savedEvent.eventlog === 'object') {
        const log = savedEvent.eventlog as any;
        console.log('[createEvent] 🔍 Verified saved event:', {
          id: savedEvent.id?.slice(-8),
          eventlogType: typeof savedEvent.eventlog,
          keys: Object.keys(savedEvent.eventlog),
          hasHtml: 'html' in log,
          htmlValue: log.html,
          hasPlainText: 'plainText' in log,
          plainTextValue: log.plainText,
          slateJson: log.slateJson
        });
      }
      
      // 🆕 自动维护父子事件双向关联
      if (finalEvent.parentEventId) {
        const parentEvent = await this.getEventById(finalEvent.parentEventId);
        
        if (parentEvent) {
          // 初始化 childEventIds 数组
          const childIds = parentEvent.childEventIds || [];
          
          // 添加子事件 ID（避免重复）
          if (!childIds.includes(finalEvent.id)) {
            await this.updateEvent(parentEvent.id, {
              childEventIds: [...childIds, finalEvent.id]
            }, true); // skipSync=true 避免递归同步
            
            eventLogger.log('🔗 [EventService] 已关联子事件到父事件:', {
              parentId: parentEvent.id,
              parentTitle: parentEvent.title?.simpleTitle,
              childId: finalEvent.id,
              childTitle: finalEvent.title?.simpleTitle,
              childType: this.getEventType(finalEvent),
              totalChildren: childIds.length + 1
            });
          }
        } else {
          eventLogger.warn('⚠️ [EventService] 父事件不存在:', {
            parentId: finalEvent.parentEventId,
            childId: finalEvent.id
          });
        }
      }
      
      // 🆕 v2.16: 记录到事件历史 (跳过池化占位事件)
      if (!(finalEvent as any)._isPlaceholder) {
        const historyLog = EventHistoryService.logCreate(finalEvent, options?.source || 'user-edit');
      } else {
        eventLogger.log('⏭️ [EventIdPool] 跳过占位事件的历史记录:', {
          eventId: finalEvent.id.slice(-8),
          _isPlaceholder: true
        });
      }
      
      // 🔥 v2.15: 如果是临时ID，记录映射关系到EventHistory
      if (isTempId && originalTempId) {
        await EventHistoryService.recordTempIdMapping(originalTempId, finalEvent.id);
        eventLogger.log('🔥 [TempId] 记录临时ID映射:', {
          tempId: originalTempId,
          realId: finalEvent.id,
          title: finalEvent.title?.simpleTitle
        });
        
        // 🔥 v2.15: 自动替换所有引用该临时ID的父子关系
        await this.resolveTempIdReferences(originalTempId, finalEvent.id);
      }
      
      // ✨ 自动提取并保存联系人
      if (finalEvent.organizer || finalEvent.attendees) {
        ContactService.extractAndAddFromEvent(finalEvent.organizer, finalEvent.attendees);
      }
      
      // 获取统计信息用于日志
      const stats = await storageManager.getStats();
      const totalEvents = (stats.indexedDB?.eventsCount || 0);
      
      eventLogger.log('✅ [EventService] 创建成功:', {
        eventId: finalEvent.id,
        title: finalEvent.title,
        startTime: finalEvent.startTime,
        endTime: finalEvent.endTime,
        总事件数: totalEvents
      });

      // 🆕 生成更新ID和跟踪本地更新
      const updateId = ++updateSequence;
      const originComponent = options?.originComponent || 'Unknown';
      const source = options?.source || 'user-edit';
      
      // 记录本地更新，用于循环检测
      if (source === 'user-edit') {
        pendingLocalUpdates.set(finalEvent.id, {
          updateId,
          timestamp: Date.now(),
          component: originComponent
        });
        
        // 5秒后清理，给广播和同步足够时间
        setTimeout(() => {
          pendingLocalUpdates.delete(finalEvent.id);
        }, 5000);
      }

      // 触发全局更新事件（携带完整事件数据和来源信息）
      this.dispatchEventUpdate(finalEvent.id, { 
        isNewEvent: true, 
        tags: finalEvent.tags, 
        event: finalEvent,
        updateId,
        originComponent,
        source,
        isLocalUpdate: source === 'user-edit'
      });

      // 🆕 [v2.19.0] 同步创建 EventNodes（用于 AI 检索）
      // 🔧 [BUG FIX] 从数据库重新读取事件，确保 eventlog 完整
      try {
        const savedEventForNodes = await storageManager.getEvent(finalEvent.id);
        if (savedEventForNodes) {
          const { EventNodeService } = await import('./EventNodeService');
          await EventNodeService.syncNodesFromEvent(savedEventForNodes);
          eventLogger.log('🔍 [EventService] EventNodes 同步完成');
        } else {
          eventLogger.warn('⚠️ [EventService] 无法读取保存的事件，跳过 EventNodes 同步');
        }
      } catch (nodeError) {
        eventLogger.error('❌ [EventService] EventNodes 同步失败:', nodeError);
        // 不阻塞主流程
      }

      // 同步到Outlook/To Do（如果不跳过且有同步管理器）
      if (!skipSync && syncManagerInstance && finalEvent.syncStatus !== 'local-only') {
        try {
          console.log('[EventService.createEvent] ✅ 触发同步:', {
            eventId: finalEvent.id,
            title: finalEvent.title?.simpleTitle?.substring(0, 30) || '',
            syncStatus: finalEvent.syncStatus,
            calendarIds: (finalEvent as any).calendarIds,
            tags: finalEvent.tags
          });
          await syncManagerInstance.recordLocalAction('create', 'event', finalEvent.id, finalEvent);
          eventLogger.log('🔄 [EventService] Event synced to Outlook');
        } catch (syncError) {
          eventLogger.error('❌ [EventService] Sync failed (non-blocking):', syncError);
          // 同步失败不影响事件创建成功
        }
      } else {
        if (!skipSync && finalEvent.syncStatus !== 'local-only') {
          console.log('[EventService.createEvent] ⏭️ 跳过同步 (syncStatus=local-only):', {
            eventId: finalEvent.id,
            title: finalEvent.title?.simpleTitle?.substring(0, 30) || '',
            calendarIds: (finalEvent as any).calendarIds,
            tags: finalEvent.tags
          });
        } else {
          eventLogger.warn('⚠️ [EventService] Sync manager not initialized');
        }
      }

      // 🚀 [PERFORMANCE] 清空范围查询缓存
      this.clearRangeCache();

      return { success: true, event: finalEvent };
    } catch (error) {
      eventLogger.error('�?[EventService] Failed to create event:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 更新事件
   * @param eventId - 事件ID
   * @param updates - 更新内容（部分字段或完整事件对象�?
   * @param skipSync - 是否跳过同步
   * @param options - 更新选项，包含来源组件信息
   */
  static async updateEvent(
    eventId: string, 
    updates: Partial<Event> | Event, 
    skipSync: boolean = false,
    options?: {
      originComponent?: 'PlanManager' | 'TimeCalendar' | 'Timer' | 'EventEditModal';
      source?: 'user-edit' | 'external-sync' | 'auto-sync';
      modifiedBy?: '4dnote' | 'outlook';  // 🆕 修改来源，用于签名
    }
  ): Promise<{ success: boolean; event?: Event; error?: string }> {
    try {
      // 🔍 DEBUG: 检查 parentEventId 的值
      if (updates.parentEventId !== undefined) {
        console.log('[EventService] 🔍 updateEvent parentEventId:', {
          eventId: eventId,
          eventIdLength: eventId.length,
          parentEventId: updates.parentEventId,
          parentEventIdLength: updates.parentEventId?.length,
          originComponent: options?.originComponent
        });
      }
      
      // 获取原始事件（从 StorageManager 查询）
      const originalEvent = await this.getEventById(eventId);

      if (!originalEvent) {
        const error = `Event not found: ${eventId}`;
        eventLogger.error('❌ [EventService]', error);
        return { success: false, error };
      }
      
      // 🆕 v2.8: 双向同步 simpleTitle ↔ fullTitle
      // 🆕 v1.8.1: 双向同步 description ↔ eventlog
      // 支持新旧格式兼容：
      // - 旧格式：eventlog 是字符串（HTML）
      // - 新格式：eventlog 是 EventLog 对象（Slate JSON + metadata）
      
      const updatesWithSync = { ...updates };
      
      // ========== Title 三层架构同步 (v2.14) ==========
      // 🆕 v2.15.4: 自动同步 tags 到 fullTitle
      if ((updates as any).title !== undefined || (updates as any).tags !== undefined) {
        const titleUpdate = (updates as any).title !== undefined 
          ? (updates as any).title 
          : originalEvent.title;
        const currentTags = (updates as any).tags !== undefined 
          ? (updates as any).tags 
          : originalEvent.tags;
        
        // 🔥 使用增强版 normalizeTitle（支持字符串输入 + tags 同步）
        const normalizedTitle = this.normalizeTitle(
          titleUpdate,
          currentTags,
          originalEvent.tags
        );
        
        (updatesWithSync as any).title = normalizedTitle;
      }
      
      // 🗺️ Location 字段规范化（支持 string 和 LocationObject）
      if ((updates as any).location !== undefined) {
        const normalizedLocation = this.normalizeLocation((updates as any).location);
        (updatesWithSync as any).location = normalizedLocation;
      }
      
      // ========== EventLog 和 Description 双向同步 ==========
      // 🔥 使用 normalizeEventLog 统一处理（支持从 description 生成）
      
      // 🆕 智能判断修改来源：只有内容真正变化时才认定为修改
      let lastModifiedSource: '4dnote' | 'outlook' = '4dnote';
      
      // 场景1: eventlog 有变化 → 规范化并同步到 description（带签名）
      if ((updates as any).eventlog !== undefined) {
        // 🆕 转换时间戳（字符串 → number）
        const eventCreatedAt = originalEvent.createdAt 
          ? new Date(originalEvent.createdAt).getTime() 
          : undefined;
        const eventUpdatedAt = originalEvent.updatedAt 
          ? new Date(originalEvent.updatedAt).getTime() 
          : eventCreatedAt;
        
        const normalizedEventLog = this.normalizeEventLog(
          (updates as any).eventlog,
          undefined,
          eventCreatedAt,   // 🆕 Event.createdAt (number)
          eventUpdatedAt,   // 🆕 Event.updatedAt (number)
          originalEvent.eventlog    // 🆕 旧 eventlog
        );
        (updatesWithSync as any).eventlog = normalizedEventLog;
        
        // 检查内容是否真的变化
        const newContent = normalizedEventLog.plainText || normalizedEventLog.html || '';
        const oldContent = originalEvent.eventlog?.plainText || originalEvent.eventlog?.html || '';
        const hasContentChange = newContent !== oldContent;
        
        // 只有内容真正变化时，才使用指定的修改来源
        if (hasContentChange) {
          lastModifiedSource = options?.modifiedBy || 
            (options?.source === 'external-sync' ? 'outlook' : '4dnote');
        }
        
        // ✅ 修复：同步到 description（只提取核心内容，签名由 normalizeEvent 添加）
        if (updates.description === undefined) {
          updatesWithSync.description = newContent;  // ← 只存核心内容，不生成签名
          console.log('[EventService] ✅ 自动从 eventlog 同步 description（核心内容）:', {
            eventId: eventId.slice(-8),
            descriptionLength: newContent.length,
            hasContentChange
          });
        }
      }
      
      // 场景2: description 有变化但 eventlog 没变 → 从 description 生成 eventlog（移除签名）
      else if (updates.description !== undefined && updates.description !== originalEvent.description) {
        // 从 description 中移除签名，提取核心内容
        const coreContent = SignatureUtils.extractCoreContent(updates.description);
        
        // 🆕 转换时间戳（字符串 → number）
        const eventCreatedAt = originalEvent.createdAt 
          ? new Date(originalEvent.createdAt).getTime() 
          : undefined;
        const eventUpdatedAt = originalEvent.updatedAt 
          ? new Date(originalEvent.updatedAt).getTime() 
          : eventCreatedAt;
        
        const normalizedEventLog = this.normalizeEventLog(
          coreContent,
          undefined,
          eventCreatedAt,   // 🆕 Event.createdAt (number)
          eventUpdatedAt,   // 🆕 Event.updatedAt (number)
          originalEvent.eventlog    // 🆕 旧 eventlog
        );
        (updatesWithSync as any).eventlog = normalizedEventLog;
        
        // 检查核心内容是否真的变化
        const oldCoreContent = SignatureUtils.extractCoreContent(originalEvent.description || '');
        const hasContentChange = coreContent !== oldCoreContent;
        
        // 只有内容真正变化时，才使用指定的修改来源
        if (hasContentChange) {
          lastModifiedSource = options?.modifiedBy || 
            (options?.source === 'external-sync' ? 'outlook' : '4dnote');
        }
        
        // 只保留核心内容，签名由 normalizeEvent 添加
        updatesWithSync.description = coreContent;  // ← 只存核心内容
        
        console.log('[EventService] description 更新 → 生成 eventlog（已移除签名）:', {
          eventId,
          coreContentLength: coreContent.length,
          descriptionWithSignature: updatesWithSync.description.substring(0, 100)
        });
      }
      
      // 场景3: 都没变，但原始事件缺少 eventlog → 从 description 补全
      else if (!(originalEvent as any).eventlog && originalEvent.description) {
        // ✅ 从 description 中移除签名，提取核心内容
        const coreContent = SignatureUtils.extractCoreContent(originalEvent.description);
        
        // 🆕 转换时间戳（字符串 → number）
        const eventCreatedAt = originalEvent.createdAt 
          ? new Date(originalEvent.createdAt).getTime() 
          : undefined;
        const eventUpdatedAt = originalEvent.updatedAt 
          ? new Date(originalEvent.updatedAt).getTime() 
          : eventCreatedAt;
        
        const normalizedEventLog = this.normalizeEventLog(
          coreContent,
          undefined,
          eventCreatedAt,   // 🆕 Event.createdAt (number)
          eventUpdatedAt    // 🆕 Event.updatedAt (number)
          // 没有旧 eventlog，不传
        );
        (updatesWithSync as any).eventlog = normalizedEventLog;
        
        console.log('[EventService] 补全缺失的 eventlog（从 description，已移除签名）:', {
          eventId,
          coreContentLength: coreContent.length
        });
      }
      
      // 🔍 临时保留旧代码用于兼容性检查（可在后续版本移除）
      const __legacy_check = false;
      if (__legacy_check) {
        const newEventlog = (updates as any).eventlog;
        const isEventLogObject = typeof newEventlog === 'object' && newEventlog !== null && 'slateJson' in newEventlog;
        const isSlateJsonString = typeof newEventlog === 'string' && newEventlog.trim().startsWith('[');
        
        console.log('🔍 [EventService] eventlog 变化检测:', {
          eventId,
          type: typeof newEventlog,
          isArray: Array.isArray(newEventlog),
          isEventLogObject,
          isSlateJsonString,
          preview: typeof newEventlog === 'string' ? newEventlog.substring(0, 100) : JSON.stringify(newEventlog).substring(0, 100)
        });
        
        if (isEventLogObject) {
          // 格式1: 已经是 EventLog 对象 - 直接使用
          const eventLogObj = newEventlog as EventLog;
          (updatesWithSync as any).eventlog = {
            ...eventLogObj,
            updatedAt: formatTimeForStorage(new Date()),
          };
          
          if (updates.description === undefined) {
            updatesWithSync.description = eventLogObj.html || eventLogObj.plainText || '';
          }
          

        } else if (isSlateJsonString) {
          // 格式2: Slate JSON 字符串 - 自动转换为 EventLog 对象
          try {
            const slateNodes = jsonToSlateNodes(newEventlog);
            const htmlDescription = slateNodesToHtml(slateNodes);
            const plainTextDescription = htmlDescription.replace(/<[^>]*>/g, '');
            
            // 构建完整的 EventLog 对象
            const eventLogObject: EventLog = {
              slateJson: newEventlog,
              html: htmlDescription,
              plainText: plainTextDescription,
              attachments: (originalEvent as any)?.eventlog?.attachments || [],
              versions: (originalEvent as any)?.eventlog?.versions || [],
              syncState: {
                status: 'pending',
                contentHash: this.hashContent(newEventlog),
              },
              createdAt: (originalEvent as any)?.eventlog?.createdAt || formatTimeForStorage(new Date()),
              updatedAt: formatTimeForStorage(new Date()),
            };
            
            (updatesWithSync as any).eventlog = eventLogObject;
            
            if (updates.description === undefined) {
              updatesWithSync.description = htmlDescription;
            }
            
            console.log('[EventService] ✅ Slate JSON 自动转换为 EventLog 对象:', {
              eventId,
              contentLength: newEventlog.length,
              htmlLength: htmlDescription.length,
              plainTextLength: plainTextDescription.length,
              htmlPreview: htmlDescription.substring(0, 100),
              descriptionSet: updates.description === undefined
            });
          } catch (error) {
            console.error('[EventService] ❌ Slate JSON 转换失败:', error);
            // 降级：保存原始字符串
            (updatesWithSync as any).eventlog = newEventlog;
          }
        } else {
          // 格式3: 其他格式（向后兼容）- 提取纯文本
          if (typeof newEventlog === 'string') {
            const plainText = this.stripHtml(newEventlog);
            (updatesWithSync as any).eventlog = newEventlog;
            
            if (updates.description === undefined) {
              updatesWithSync.description = plainText;
            }
            

          } else {
            // 🔧 非字符串格式，直接保存
            (updatesWithSync as any).eventlog = newEventlog;

          }
        }
      }
      
      // 场景3: 初始化场景 - eventlog 为空但 description 有内容
      if (!(originalEvent as any).eventlog && originalEvent.description && (updates as any).eventlog === undefined) {
        const initialEventLog: EventLog = {
          slateJson: JSON.stringify([{ 
          type: 'paragraph',
          id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          children: [{ text: originalEvent.description }]
        }]),
          html: originalEvent.description,
          plainText: this.stripHtml(originalEvent.description),
          attachments: [],
          versions: [],
          syncState: {
            status: 'pending',
            contentHash: this.hashContent(originalEvent.description),
          },
          createdAt: originalEvent.createdAt || formatTimeForStorage(new Date()),
          updatedAt: formatTimeForStorage(new Date()),
        };
        (updatesWithSync as any).eventlog = initialEventLog;
        
        console.log('[EventService] 初始化 eventlog 从 description:', {
          eventId,
          description: originalEvent.description.substring(0, 50)
        });
      }
      
      // 🆕 v1.8: 只合并非 undefined 的字段，避免覆盖已有数据
      // 🔧 v2.9: 但对于时间字段，允许显式设为 undefined 以清除
      // 🔧 v2.17.2: 保护本地专属字段，防止被远程同步覆盖
      const filteredUpdates: Partial<Event> = {};
      
      // 🛡️ 定义本地专属字段列表（不应被远程同步覆盖）
      const localOnlyFields = new Set([
        'tags',
        'remarkableSource',
        'childEventIds',
        'parentEventId',
        'linkedEventIds',
        'backlinks',
        'fourDNoteSource',
        'isTimer',
        'isTimeLog',
        'isOutsideApp'
      ]);
      
      // 🆕 [v2.18.9] 定义自动生成字段（不参与比对，从 eventlog 派生）
      const autoGeneratedFields = new Set([
        'description'  // description 从 eventlog + 签名自动生成，不应触发变更
      ]);
      
      // 🔧 v2.9: 使用 Object.keys 遍历自有属性，避免原型链问题
      Object.keys(updatesWithSync).forEach(key => {
        const typedKey = key as keyof Event;
        const value = updatesWithSync[typedKey];
        
        // 🆕 [v2.18.9] 过滤掉自动生成字段（不参与比对）
        if (autoGeneratedFields.has(key)) {
          console.log('[EventService.updateEvent] 🚫 忽略自动生成字段:', key);
          return;
        }
        
        // 🛡️ v2.17.2: 保护本地专属字段
        // 如果是外部同步（external-sync）且字段在保护列表中，跳过
        if (options?.source === 'external-sync' && localOnlyFields.has(key)) {
          // 不包含此字段，保留原始值
          return;
        }
        
        // 🔧 如果值不是 undefined，直接包含
        // 🔧 如果值是 undefined 但 key 存在于 updatesWithSync（显式设置），也包含
        if (value !== undefined) {
          (filteredUpdates as any)[typedKey] = value;
        } else if (Object.prototype.hasOwnProperty.call(updatesWithSync, key)) {
          // 显式设置为 undefined（用于清除字段）
          // 但本地专属字段不允许清除
          if (!localOnlyFields.has(key)) {
            (filteredUpdates as any)[typedKey] = undefined;
          }
        }
      });
      
      // 🔥 [CRITICAL FIX v2.18.8] 先合并再 normalize，确保 logUpdate 比对的是完整数据
      // 原问题：logUpdate 太早，比对的是 filteredUpdates（部分字段），导致误判
      // 正确流程：
      //   1. 合并 originalEvent + filteredUpdates
      //   2. normalizeEvent() 处理所有字段（description、eventlog、签名等）
      //   3. logUpdate() 比对 normalize 后的完整数据
      //   4. 存储
      
      // 步骤1: 合并更新（不更新 updatedAt，等 logUpdate 判断后再决定）
      const mergedEvent: Event = {
        ...originalEvent,
        ...filteredUpdates,
        id: eventId // 确保ID不被覆盖
      };
      
      // ✅ 验证合并后的事件时间
      const eventToValidate = {
        ...mergedEvent,
        startTime: mergedEvent.startTime || originalEvent.startTime,
        endTime: mergedEvent.endTime || originalEvent.endTime,
      };
      const validation = validateEventTime(eventToValidate);
      if (!validation.valid) {
        eventLogger.error('❌ [EventService] Update validation failed:', validation.error);
        return { success: false, error: validation.error };
      }
      
      // 步骤2: 规范化处理（重新生成 description 签名、处理 eventlog 等）
      // 使用 preserveSignature 选项，避免每次都重新生成签名导致变更
      // 🆕 [v2.18.9] 智能判断：如果 eventlog 没变，就保留原签名
      const eventlogChanged = mergedEvent.eventlog !== undefined && 
        JSON.stringify(mergedEvent.eventlog) !== JSON.stringify(originalEvent.eventlog);
      const normalizedEvent = this.normalizeEvent(mergedEvent, {
        preserveSignature: !eventlogChanged,  // eventlog 没变就保留签名
        oldEvent: originalEvent  // 🆕 传入旧事件用于 eventlog diff
      });
      
      // 步骤3: 记录事件历史（比对 normalize 后的完整数据）
      const changeLog = EventHistoryService.logUpdate(
        eventId, 
        originalEvent,  // before: 旧事件（已 normalize）
        normalizedEvent,  // after: 新事件（刚 normalize）
        options?.source || 'user-edit'
      );
      
      // 🔥 [CRITICAL FIX] 只有真正有变更时才更新 updatedAt
      // 否则会导致：updatedAt 变 → description 签名变 → EventHistory 误判 → 历史记录爆炸
      const hasRealChanges = changeLog !== null;
      
      // 最终事件（包含 updatedAt）
      const updatedEvent: Event = {
        ...normalizedEvent,
        ...(hasRealChanges ? { updatedAt: formatTimeForStorage(new Date()) } : {})
      };
      
      // 🆕 v2.16: 清除占位标志（池化ID的占位事件已被真实数据更新）
      if ((originalEvent as any)._isPlaceholder && Object.keys(filteredUpdates).length > 0) {
        delete (updatedEvent as any)._isPlaceholder;
        delete (updatedEvent as any)._isPooledId;
        delete (updatedEvent as any)._pooledAt;
        console.log('[EventService] 🔄 清除占位标志（池化ID已转为真实事件）:', {
          eventId: eventId.slice(-8),
          updateFields: Object.keys(filteredUpdates).length,
          fieldList: Object.keys(filteredUpdates),
          hasTitle: 'title' in filteredUpdates,
          titleValue: (filteredUpdates as any).title
        });
      }

      // 🆕 检测 parentEventId 变化，同步更新双向关联
      // 🔧 修复：即使 parentEventId 没有变化，也要确保父事件的 childEventIds 包含当前事件
      if (filteredUpdates.parentEventId !== undefined) {
        const parentHasChanged = filteredUpdates.parentEventId !== originalEvent.parentEventId;
        
        if (parentHasChanged) {
          eventLogger.log('🔗 [EventService] Detected parentEventId change, syncing bi-directional links');
        
          // 从旧父事件移除
          if (originalEvent.parentEventId) {
            const oldParent = await this.getEventById(originalEvent.parentEventId);
            if (oldParent && oldParent.childEventIds) {
              await this.updateEvent(
                oldParent.id,
                {
                  childEventIds: oldParent.childEventIds.filter(cid => cid !== eventId)
                },
                true // skipSync
              );
              
              eventLogger.log('🔗 [EventService] 已从旧父事件移除子事件:', {
                oldParentId: originalEvent.parentEventId,
                childId: eventId,
                remainingChildren: oldParent.childEventIds.length - 1
              });
            }
          }
        }
        
        // 🔧 无论是否变化，都要确保父事件的 childEventIds 包含当前事件
        if (filteredUpdates.parentEventId) {
          const newParent = await this.getEventById(filteredUpdates.parentEventId);
          if (newParent) {
            const childIds = newParent.childEventIds || [];
            
            if (!childIds.includes(eventId)) {
              await this.updateEvent(
                newParent.id,
                {
                  childEventIds: [...childIds, eventId]
                },
                true // skipSync
              );
              
              eventLogger.log('🔗 [EventService] 已添加子事件到新父事件:', {
                newParentId: filteredUpdates.parentEventId,
                childId: eventId,
                totalChildren: childIds.length + 1,
                reason: parentHasChanged ? 'parentEventId changed' : 'ensuring consistency'
              });
            } else {
              eventLogger.log('✅ [EventService] 父事件已包含子事件，跳过:', {
                parentId: filteredUpdates.parentEventId.slice(-8),
                childId: eventId.slice(-8)
              });
            }
          } else {
            eventLogger.warn('⚠️ [EventService] 新父事件不存在，清除 parentEventId:', {
              childId: eventId.slice(-8),
              invalidParentId: filteredUpdates.parentEventId,
              action: 'clearing parentEventId'
            });
            // 🔥 [CRITICAL FIX] 清除无效的 parentEventId，避免数据不一致
            delete filteredUpdates.parentEventId;
            delete updatedEvent.parentEventId;
          }
        }
      }

      // 更新到 StorageManager（双写到 IndexedDB + SQLite）
      const storageEvent = this.convertEventToStorageEvent(updatedEvent);
      
      // 🔍 调试：验证 syncMode 是否包含在 updatedEvent 中
      console.log('🔍 [EventService] updateEvent 保存前验证:', {
        eventId: eventId.slice(-8),
        '原始syncMode': originalEvent.syncMode,
        '更新syncMode': filteredUpdates.syncMode,
        '最终syncMode': updatedEvent.syncMode,
        'storageEvent.syncMode': storageEvent.syncMode
      });
      
      await storageManager.updateEvent(eventId, storageEvent);
      
      // 🚀 [PERFORMANCE] 同步更新 EventStats（仅更新必要字段）
      const statsUpdates: Partial<import('./storage/types').EventStats> = {};
      if (filteredUpdates.tags !== undefined) statsUpdates.tags = updatedEvent.tags || [];
      if ((filteredUpdates as any).calendarIds !== undefined) statsUpdates.calendarIds = (updatedEvent as any).calendarIds || [];
      if (filteredUpdates.startTime !== undefined) statsUpdates.startTime = updatedEvent.startTime;
      if (filteredUpdates.endTime !== undefined) statsUpdates.endTime = updatedEvent.endTime;
      if (filteredUpdates.source !== undefined) statsUpdates.source = updatedEvent.source;
      statsUpdates.updatedAt = updatedEvent.updatedAt;
      
      if (Object.keys(statsUpdates).length > 1) { // updatedAt 总是存在
        await storageManager.updateEventStats(eventId, statsUpdates);
        eventLogger.log('📊 [EventService] EventStats synced');
      }
      
      // 🆕 保存 EventLog 版本历史（如果 eventlog 有变更）
      if (filteredUpdates.eventlog && originalEvent.eventlog) {
        const oldEventLog = this.normalizeEventLog(originalEvent.eventlog);
        const newEventLog = this.normalizeEventLog(filteredUpdates.eventlog);
        
        // 🔍 比对内容是否真的有变化（避免同步时产生冗余版本）
        // 注意：parseTextWithBlockTimestamps 已经做了精细的节点级 diff
        // 这里用 JSON.stringify 做最终验证，确保包括所有字段变化
        const oldContent = JSON.stringify(oldEventLog.slateJson);
        const newContent = JSON.stringify(newEventLog.slateJson);
        
        if (oldContent !== newContent) {
          // ✅ 内容有变化，保存版本
          storageManager.saveEventLogVersion(
            eventId,
            newEventLog,
            oldEventLog
          ).catch((error: any) => {
            eventLogger.warn('⚠️ [EventService] Failed to save EventLog version:', error);
          });
          
          eventLogger.log('📝 [EventService] EventLog changed, version saved:', {
            eventId: eventId.slice(-8),
            oldSize: oldContent.length,
            newSize: newContent.length
          });
        } else {
          // ⏭️ 内容未变化，跳过保存（复用 parseTextWithBlockTimestamps 的 diff 结果）
          eventLogger.log('⏭️ [EventService] EventLog unchanged, skip version save:', {
            eventId: eventId.slice(-8)
          });
        }
      }
      
      // 🔍 验证同步配置是否保存
      if (filteredUpdates.planSyncConfig || filteredUpdates.actualSyncConfig) {
        console.log('🔍 [EventService] 同步配置保存验证:', {
          eventId,
          保存前_planSyncConfig: originalEvent.planSyncConfig,
          保存后_planSyncConfig: updatedEvent.planSyncConfig,
          保存前_actualSyncConfig: originalEvent.actualSyncConfig,
          保存后_actualSyncConfig: updatedEvent.actualSyncConfig,
          更新字段包含planSyncConfig: !!filteredUpdates.planSyncConfig,
          更新字段包含actualSyncConfig: !!filteredUpdates.actualSyncConfig
        });
      }
      
      // ✨ 自动提取并保存联系人（如果 organizer 或 attendees 有更新）
      if (updates.organizer !== undefined || updates.attendees !== undefined) {
        ContactService.extractAndAddFromEvent(updatedEvent.organizer, updatedEvent.attendees);
      }
      
      // 🆕 生成更新ID和跟踪本地更新
      const updateId = ++updateSequence;
      const originComponent = options?.originComponent || 'Unknown';
      const source = options?.source || 'user-edit';
      
      // 记录本地更新，用于循环检测
      if (source === 'user-edit') {
        pendingLocalUpdates.set(eventId, {
          updateId,
          timestamp: Date.now(),
          component: originComponent
        });
        
        // 5秒后清理，给广播和同步足够时间
        setTimeout(() => {
          pendingLocalUpdates.delete(eventId);
        }, 5000);
      }

      // 触发全局更新事件（携带完整事件数据和来源信息）
      this.dispatchEventUpdate(eventId, { 
        isUpdate: true, 
        tags: updatedEvent.tags, 
        event: updatedEvent,
        updateId,
        originComponent,
        source,
        isLocalUpdate: source === 'user-edit'
      });

      // 同步到Outlook
      if (!skipSync && syncManagerInstance && updatedEvent.syncStatus !== 'local-only') {
        try {
          eventLogger.log('🔍 [DEBUG-TIMER] 即将调用 recordLocalAction (update)');
          await syncManagerInstance.recordLocalAction('update', 'event', eventId, updatedEvent, originalEvent);
          eventLogger.log('🔄 [EventService] Event update synced');
        } catch (syncError) {
          eventLogger.error('❌ [EventService] Sync failed (non-blocking):', syncError);
        }
      }
      // Sync skipped or not needed

      // 🚀 [PERFORMANCE] 清空范围查询缓存
      this.clearRangeCache();

      // 🔍 [Nodes Sync] 同步更新 EventNodes（非阻塞）
      try {
        const { EventNodeService } = await import('./EventNodeService');
        await EventNodeService.syncNodesFromEvent(updatedEvent);
        eventLogger.log('✅ [EventService] EventNodes synced successfully on update');
      } catch (nodesSyncError) {
        eventLogger.error('⚠️ [EventService] EventNodes sync failed (non-blocking):', nodesSyncError);
      }

      return { success: true, event: updatedEvent };
    } catch (error) {
      eventLogger.error('�?[EventService] Failed to update event:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 删除事件
   * @param eventId - 事件ID
   * @param skipSync - 是否跳过同步
   */
  static async deleteEvent(eventId: string, skipSync: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      eventLogger.log('🗑️ [EventService] Soft-deleting event (setting deletedAt):', eventId);

      // 获取待删除事件（从 StorageManager 查询）
      const deletedEvent = await this.getEventById(eventId);

      if (!deletedEvent) {
        const error = `Event not found: ${eventId}`;
        eventLogger.error('❌ [EventService]', error);
        return { success: false, error };
      }
      
      // ✅ v3.0: 软删除 - 设置 deletedAt 而非硬删除
      // 优点：
      // 1. 支持撤销删除
      // 2. 多设备同步时不会丢失数据
      // 3. 可定期清理旧数据（30天后）
      const now = formatTimeForStorage(new Date());
      // 🔧 [FIX] 软删除时必须 skipSync=true，避免触发 UPDATE action
      // 因为后面会显式调用 recordLocalAction('delete')
      await this.updateEvent(eventId, {
        deletedAt: now,
        updatedAt: now,
      }, true);
      
      eventLogger.log('✅ [EventService] Event soft-deleted:', {
        eventId,
        deletedAt: now,
        canRestore: true,
      });

      // 🆕 v2.16: 记录事件历史（跳过池化占位事件）
      if (!(deletedEvent as any)._isPlaceholder) {
        EventHistoryService.logDelete(deletedEvent, 'user-edit');
      } else {
        eventLogger.log('⏭️ [EventIdPool] 跳过占位事件的删除历史记录:', {
          eventId: eventId.slice(-8),
          _isPlaceholder: true
        });
      }
      
      // 🚀 [PERFORMANCE] 同步删除 EventStats
      await storageManager.deleteEventStats(eventId);
      eventLogger.log('📊 [EventService] EventStats deleted');

      // 触发全局更新事件（标记为已删除）
      this.dispatchEventUpdate(eventId, { deleted: true, softDeleted: true });

      // 同步�?Outlook
      if (!skipSync && syncManagerInstance && deletedEvent.syncStatus !== 'local-only') {
        try {
          await syncManagerInstance.recordLocalAction('delete', 'event', eventId, null, deletedEvent);
          eventLogger.log('�?[EventService] Event deletion synced to Outlook');
        } catch (syncError) {
          eventLogger.error('�?[EventService] Sync failed (non-blocking):', syncError);
        }
      }
      // Sync skipped or not needed

      // 🚀 [PERFORMANCE] 清空范围查询缓存
      this.clearRangeCache();

      // 🔍 [Nodes Sync] 删除关联的 EventNodes（非阻塞）
      try {
        const { EventNodeService } = await import('./EventNodeService');
        const deletedCount = await EventNodeService.deleteNodesByEventId(eventId);
        eventLogger.log(`✅ [EventService] ${deletedCount} EventNodes deleted`);
      } catch (nodesDeletionError) {
        eventLogger.error('⚠️ [EventService] EventNodes deletion failed (non-blocking):', nodesDeletionError);
      }

      return { success: true };
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to delete event:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 恢复软删除的事件
   * 
   * @param eventId 事件 ID
   * @returns 操作结果
   */
  static async restoreEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      eventLogger.log('♻️ [EventService] Restoring soft-deleted event:', eventId);

      // 获取事件（包括已删除的）
      const result = await storageManager.queryEvents({
        filters: { eventIds: [eventId] },
        limit: 1
      });

      if (result.items.length === 0) {
        return { success: false, error: `Event not found: ${eventId}` };
      }

      const event = result.items[0];

      if (!event.deletedAt) {
        return { success: false, error: 'Event is not deleted' };
      }

      // 恢复事件（清除 deletedAt）
      await this.updateEvent(eventId, {
        deletedAt: null,
        updatedAt: formatTimeForStorage(new Date()),
      }, false); // 需要同步

      eventLogger.log('✅ [EventService] Event restored:', eventId);
      
      // 触发全局更新事件
      this.dispatchEventUpdate(eventId, { restored: true });

      return { success: true };
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to restore event:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 硬删除事件（真正从数据库删除）
   * ⚠️ 危险操作：无法恢复！
   * 
   * @param eventId 事件 ID
   * @param force 是否强制删除（即使未标记为删除）
   * @returns 操作结果
   */
  static async hardDeleteEvent(eventId: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      eventLogger.warn('⚠️ [EventService] Hard-deleting event (permanent):', eventId);

      const event = await this.getEventById(eventId);

      if (!event) {
        return { success: false, error: `Event not found: ${eventId}` };
      }

      // 安全检查：只允许删除已标记为 deletedAt 的事件
      if (!force && !event.deletedAt) {
        return { 
          success: false, 
          error: 'Event must be soft-deleted first. Use force=true to override.' 
        };
      }

      // 真正删除
      await storageManager.deleteEvent(eventId);
      
      eventLogger.warn('🗑️ [EventService] Event permanently deleted:', eventId);
      
      // 触发全局更新事件
      this.dispatchEventUpdate(eventId, { deleted: true, hardDeleted: true });

      return { success: true };
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to hard-delete event:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 清理旧的已删除事件（定期维护）
   * 
   * @param daysOld 删除多少天前的已删除事件（默认 30 天）
   * @returns 清理统计
   */
  static async purgeOldDeletedEvents(daysOld: number = 30): Promise<{ 
    purgedCount: number; 
    errors: string[] 
  }> {
    try {
      eventLogger.log(`🧹 [EventService] Purging events deleted ${daysOld} days ago...`);

      // 获取所有事件（包括已删除的）
      const allResult = await storageManager.queryEvents({ limit: 10000 });
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      const cutoffMs = cutoffDate.getTime();

      // 过滤出需要清理的事件
      const toPurge = allResult.items.filter(event => {
        if (!event.deletedAt) return false;
        const deletedMs = new Date(event.deletedAt).getTime();
        return deletedMs < cutoffMs;
      });

      eventLogger.log(`🗑️ [EventService] Found ${toPurge.length} events to purge`);

      let purgedCount = 0;
      const errors: string[] = [];

      // 逐个硬删除
      for (const event of toPurge) {
        try {
          await storageManager.deleteEvent(event.id);
          purgedCount++;
        } catch (error) {
          errors.push(`${event.id}: ${String(error)}`);
        }
      }

      eventLogger.log(`✅ [EventService] Purge completed:`, {
        purgedCount,
        errorCount: errors.length,
      });

      return { purgedCount, errors };
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to purge old events:', error);
      return { purgedCount: 0, errors: [String(error)] };
    }
  }

  /**
   * 事件签到 - 记录签到时间戳
   */
  static async checkIn(eventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      eventLogger.log('✅ [EventService] Checking in event:', eventId);

      // 获取事件（从 StorageManager 查询）
      const event = await this.getEventById(eventId);

      if (!event) {
        const error = `Event not found: ${eventId}`;
        eventLogger.error('❌ [EventService]', error);
        return { success: false, error };
      }

      const timestamp = formatTimeForStorage(new Date());

      // 🐛 DEBUG: Log checkType before update
      console.log('🔍 [EventService.checkIn] BEFORE update:', {
        eventId: eventId.slice(-10),
        checkType: event.checkType,
        checkedCount: (event.checked || []).length,
        title: event.title?.simpleTitle?.substring(0, 20)
      });

      // 更新 checked 数组
      const checked = event.checked || [];
      checked.push(timestamp);

      // 更新到 StorageManager
      await this.updateEvent(eventId, {
        checked: checked,
        updatedAt: timestamp
      }, true); // skipSync=true
      
      eventLogger.log('💾 [EventService] Event checked in, saved to StorageManager');

      // 🐛 DEBUG: Log checkType after save
      console.log('🔍 [EventService.checkIn] AFTER save:', {
        eventId: eventId.slice(-10),
        checkType: event.checkType,
        checkedCount: checked.length,
        willDispatchUpdate: true
      });

      // 记录事件历史
      EventHistoryService.logCheckin(eventId, event.title?.simpleTitle || 'Untitled Event', { action: 'check-in', timestamp });

      // 触发更新事件
      this.dispatchEventUpdate(eventId, { checkedIn: true, timestamp });

      eventLogger.log('✅ [EventService] 签到成功:', {
        eventId,
        timestamp,
        totalCheckins: checked.length
      });

      return { success: true };
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to check in event:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 取消事件签到 - 记录取消签到时间戳
   */
  static async uncheck(eventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      eventLogger.log('❌ [EventService] Unchecking event:', eventId);

      // 获取事件（从 StorageManager 查询）
      const event = await this.getEventById(eventId);

      if (!event) {
        const error = `Event not found: ${eventId}`;
        eventLogger.error('❌ [EventService]', error);
        return { success: false, error };
      }

      const timestamp = formatTimeForStorage(new Date());

      // 更新 unchecked 数组
      const unchecked = event.unchecked || [];
      unchecked.push(timestamp);

      // 更新到 StorageManager
      await this.updateEvent(eventId, {
        unchecked: unchecked,
        updatedAt: timestamp
      }, true); // skipSync=true
      
      eventLogger.log('💾 [EventService] Event unchecked, saved to StorageManager');

      // 记录事件历史
      EventHistoryService.logCheckin(eventId, event.title?.simpleTitle || 'Untitled Event', { action: 'uncheck', timestamp });

      // 触发更新事件
      this.dispatchEventUpdate(eventId, { unchecked: true, timestamp });

      eventLogger.log('❌ [EventService] 取消签到成功:', {
        eventId,
        timestamp,
        totalUnchecks: unchecked.length
      });

      return { success: true };
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to uncheck event:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 获取事件的签到状态
   */
  static async getCheckInStatus(eventId: string): Promise<{ 
    isChecked: boolean; 
    lastCheckIn?: string; 
    lastUncheck?: string;
    checkInCount: number;
    uncheckCount: number;
    checkType: import('../types').CheckType;
    recurringConfig?: import('../types').RecurringConfig;
  }> {
    const event = await this.getEventById(eventId);
    if (!event) {
      return { 
        isChecked: false, 
        checkInCount: 0, 
        uncheckCount: 0,
        checkType: 'none'
      };
    }

    const checked = event.checked || [];
    const unchecked = event.unchecked || [];
    
    // 获取最后的操作时间戳来判断当前状态
    const lastCheckIn = checked.length > 0 ? checked[checked.length - 1] : undefined;
    const lastUncheck = unchecked.length > 0 ? unchecked[unchecked.length - 1] : undefined;
    
    // 如果都没有操作，默认未签到
    if (!lastCheckIn && !lastUncheck) {
      return { 
        isChecked: false, 
        checkInCount: checked.length, 
        uncheckCount: unchecked.length,
        checkType: event.checkType || 'once', // 🔧 默认显示 checkbox（与 planItemsToSlateNodes 保持一致）
        recurringConfig: event.recurringConfig
      };
    }
    
    // 比较最后的签到和取消签到时间
    const isChecked = !!lastCheckIn && (!lastUncheck || lastCheckIn > lastUncheck);

    return {
      isChecked,
      lastCheckIn,
      lastUncheck,
      checkInCount: checked.length,
      uncheckCount: unchecked.length,
      checkType: event.checkType || 'once', // 🔧 默认显示 checkbox（与 planItemsToSlateNodes 保持一致）
      recurringConfig: event.recurringConfig
    };
  }

  /**
   * 批量创建事件（用于导入或迁移场景）
   * 🔥 v3.0.0: 使用 StorageManager 批量创建（高性能）
   */
  static async batchCreateEvents(events: Event[], skipSync: boolean = false): Promise<{ 
    success: boolean; 
    created: number; 
    failed: number;
    errors: string[];
  }> {
    try {
      // 规范化所有事件
      const normalizedEvents = events.map(event => this.normalizeEvent({
        ...event,
        syncStatus: skipSync ? 'local-only' : (event.syncStatus || 'pending')
      }));
      
      // 转换为 StorageEvent 并批量创建
      const storageEvents = normalizedEvents.map(e => this.convertEventToStorageEvent(e));
      const batchResult = await storageManager.batchCreateEvents(storageEvents);
      
      // 记录历史（使用 event.createdAt 作为时间戳）
      batchResult.success.forEach(event => {
        const createdAtTime = event.createdAt ? parseLocalTimeString(event.createdAt) : new Date();
        EventHistoryService.logCreate(event as any as Event, 'batch-import', createdAtTime);
      });
      
      const errors = batchResult.failed.map(f => `${f.item.id}: ${f.error.message}`);
      
      eventLogger.log(`📊 [EventService] Batch create: ${batchResult.success.length} created, ${batchResult.failed.length} failed`);
      return { 
        success: batchResult.failed.length === 0, 
        created: batchResult.success.length, 
        failed: batchResult.failed.length, 
        errors 
      };
    } catch (error) {
      eventLogger.error('❌ [EventService] Batch create failed:', error);
      return { success: false, created: 0, failed: events.length, errors: [String(error)] };
    }
  }

  /**
   * 触发全局事件更新通知
   */
  private static dispatchEventUpdate(eventId: string, detail: any) {
    try {
      const eventDetail = { 
        eventId, 
        ...detail,
        senderId: tabId,  // 🆕 添加发送者标识
        timestamp: Date.now()
      };
      
      // 0. 🔧 通知 EventHub（用于 IndexMap 同步）
      if (detail.event) {
        if (detail.deleted) {
          EventHub.notify('event-deleted', detail.event);
        } else if (detail.isUpdate) {
          EventHub.notify('event-updated', detail.event);
        } else {
          EventHub.notify('event-created', detail.event);
        }
      }
      
      // 1. 触发当前标签页的事件
      window.dispatchEvent(new CustomEvent('eventsUpdated', {
        detail: eventDetail
      }));
      
      // 2. 广播到其他标签页（携带发送者ID）
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'eventsUpdated',
            senderId: tabId,  // 🆕 标记发送者
            eventId,
            ...detail,
            timestamp: Date.now()
          });
        } catch (broadcastError) {
          eventLogger.warn('⚠️ [EventService] Failed to broadcast:', broadcastError);
        }
      }
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to dispatch event:', error);
    }
  }

  /**
   * 获取同步管理器实例（用于外部调试�?
   */
  static getSyncManager() {
    return syncManagerInstance;
  }

  /**
   * 检查服务是否已初始�?
   */
  static isInitialized(): boolean {
    return syncManagerInstance !== null;
  }

  /**
   * 🆕 循环更新防护：检查是否为本地更新
   */
  static isLocalUpdate(eventId: string, updateId?: number): boolean {
    const localUpdate = pendingLocalUpdates.get(eventId);
    if (!localUpdate) return false;
    
    // 如果提供了 updateId，检查是否匹配
    if (updateId !== undefined) {
      return localUpdate.updateId === updateId;
    }
    
    // 检查时间窗口（5秒内为本地更新）
    const timeDiff = Date.now() - localUpdate.timestamp;
    return timeDiff < 5000;
  }

  /**
   * 🆕 v1.8.1: 生成内容哈希（用于检测 eventlog 变化）
   * 简化版实现：使用字符串长度 + 前100字符
   */
  private static hashContent(content: string): string {
    if (!content) return '0-';
    const prefix = content.substring(0, 100);
    return `${content.length}-${prefix.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)}`;
  }

  /**
   * 🆕 v1.8.1: 移除 HTML 标签，提取纯文本
   */
  private static stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * 🆕 v1.8.1: Slate JSON → HTML 转换（简化版）
   */
  private static slateToHtml(slateJson: any[]): string {
    if (!slateJson || !Array.isArray(slateJson)) return '';
    
    return slateJson.map(node => {
      if (node.type === 'paragraph') {
        const text = node.children?.map((child: any) => child.text || '').join('') || '';
        return `<p>${text}</p>`;
      }
      return '';
    }).join('');
  }

  // ==================== 标题三层架构转换工具 (v2.14) ====================

  /**
   * Slate JSON → Slate JSON（移除 Slate 元素节点，保留文本和格式）+ 提取格式映射
   * @param fullTitle - 完整 Slate JSON 字符串
   * @returns { colorTitle, formatMap } - 简化的 Slate JSON 字符串 + 格式映射
   */
  private static fullTitleToColorTitle(fullTitle: string): { colorTitle: string; formatMap: import('../types').TextFormatSegment[] } {
    if (!fullTitle) return { colorTitle: '', formatMap: [] };
    
    try {
      const nodes = JSON.parse(fullTitle);
      if (!Array.isArray(nodes)) return { colorTitle: '', formatMap: [] };
      
      // 递归处理节点，移除 tag/dateMention 元素，保留文本和格式
      const processNode = (node: any): any => {
        // 跳过元素节点
        if (node.type === 'tag' || node.type === 'dateMention' || node.type === 'event-mention') {
          return null;
        }
        
        // 段落节点：递归处理子节点
        if (node.type === 'paragraph') {
          const children = node.children
            ?.map((child: any) => processNode(child))
            .filter((child: any) => child !== null);
          
          // 如果没有有效子节点，返回空文本节点
          if (!children || children.length === 0) {
            return { 
              type: 'paragraph',
              id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              children: [{ text: '' }]
            };
          }
          
          return { type: 'paragraph', children };
        }
        
        // 文本节点：保留所有格式属性
        if (node.text !== undefined) {
          const textNode: any = { text: node.text };
          
          // 保留所有格式
          if (node.bold) textNode.bold = true;
          if (node.italic) textNode.italic = true;
          if (node.underline) textNode.underline = true;
          if (node.strikethrough) textNode.strikethrough = true;
          if (node.code) textNode.code = true;
          if (node.color) textNode.color = node.color;
          if (node.backgroundColor) textNode.backgroundColor = node.backgroundColor;
          
          return textNode;
        }
        
        return null;
      };
      
      const processedNodes = nodes
        .map(processNode)
        .filter(node => node !== null);
      
      const colorTitle = JSON.stringify(processedNodes.length > 0 ? processedNodes : [{ type: 'paragraph', children: [{ text: '' }] }]);
      
      // ✅ 提取 formatMap：记录所有有格式的文本片段
      let formatMap: import('../types').TextFormatSegment[] = [];
      try {
        const extractFormats = (node: any) => {
          if (node.text !== undefined && node.text.trim() !== '') {
            // 检查是否有任何格式
            const hasFormat = node.bold || node.italic || node.underline || node.strikethrough || 
                             node.code || node.color || node.backgroundColor;
            
            if (hasFormat) {
              const format: any = {};
              if (node.bold) format.bold = true;
              if (node.italic) format.italic = true;
              if (node.underline) format.underline = true;
              if (node.strikethrough) format.strikethrough = true;
              if (node.code) format.code = true;
              if (node.color) format.color = node.color;
              if (node.backgroundColor) format.backgroundColor = node.backgroundColor;
              
              formatMap.push({ text: node.text, format });
            }
          }
          if (node.children) {
            node.children.forEach(extractFormats);
          }
        };
        processedNodes.forEach(extractFormats);
      } catch (formatError) {
        // 🛡️ 容错：formatMap 提取失败不影响主流程
        console.warn('[EventService] formatMap 提取失败，跳过格式记忆:', formatError);
        formatMap = [];
      }
      
      return { colorTitle, formatMap };
    } catch (error) {
      console.warn('[EventService] fullTitleToColorTitle 解析失败:', error);
      return { 
        colorTitle: JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }]),
        formatMap: []
      };
    }
  }

  /**
   * Slate JSON → 纯文本
   * @param colorTitle - Slate JSON 字符串
   * @returns 纯文本
   */
  private static colorTitleToSimpleTitle(colorTitle: string): string {
    try {
      if (!colorTitle) return '';
      
      const nodes = JSON.parse(colorTitle);
      if (!Array.isArray(nodes)) return '';
      
      // 递归提取所有文本节点
      const extractText = (node: any): string => {
        if (node.text !== undefined) {
          return node.text;
        }
        if (node.children) {
          return node.children.map(extractText).join('');
        }
        return '';
      };
      
      return nodes.map(extractText).join('\n').trim();
    } catch (error) {
      console.warn('[EventService] colorTitleToSimpleTitle 解析失败，尝试作为纯文本:', error);
      return this.stripHtml(colorTitle); // 降级处理：如果是旧的 HTML 格式
    }
  }

  /**
   * 纯文本 → Slate JSON（智能恢复格式）
   * @param simpleTitle - 纯文本
   * @param formatMap - 可选的格式映射（用于恢复格式）
   * @returns Slate JSON 字符串
   */
  private static simpleTitleToFullTitle(simpleTitle: string, formatMap?: import('../types').TextFormatSegment[]): string {
    if (!simpleTitle) return JSON.stringify([{ 
      type: 'paragraph',
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      children: [{ text: '' }]
    }]);
    
    // ✅ 如果有 formatMap，尝试应用格式
    if (formatMap && formatMap.length > 0) {
      try {
        const children: any[] = [];
        let remainingText = simpleTitle;
        
        // 按照 formatMap 中的顺序匹配文本
        for (const segment of formatMap) {
          // 🛡️ 验证 segment 结构
          if (!segment || !segment.text || !segment.format) {
            console.warn('[EventService] 无效的 formatMap segment，跳过:', segment);
            continue;
          }
          
          const index = remainingText.indexOf(segment.text);
          
          if (index !== -1) {
            // 如果之前有未匹配的文本，添加为普通文本
            if (index > 0) {
              const plainText = remainingText.substring(0, index);
              if (plainText) {
                children.push({ text: plainText });
              }
            }
            
            // 添加带格式的文本
            children.push({
              text: segment.text,
              ...segment.format
            });
            
            remainingText = remainingText.substring(index + segment.text.length);
          }
        }
        
        // 添加剩余的普通文本
        if (remainingText) {
          children.push({ text: remainingText });
        }
        
        // 如果成功应用了格式，返回格式化的 Slate JSON
        if (children.length > 0) {
          return JSON.stringify([{ type: 'paragraph', children }]);
        }
      } catch (formatError) {
        // 🛡️ 容错：formatMap 应用失败不影响主流程
        console.warn('[EventService] formatMap 应用失败，降级为纯文本:', formatError);
      }
    }
    
    // 降级：没有 formatMap 或应用失败，返回普通文本
    return JSON.stringify([
      {
        type: 'paragraph',
        children: [{ text: simpleTitle }]
      }
    ]);
  }

  /**
   * 规范化标题对象：自动填充缺失的层级 + 同步 tags
   * @param titleInput - 部分标题数据（可能只有 fullTitle/colorTitle/simpleTitle 之一），或者字符串（远程同步场景）
   * @param tags - 事件的 tags 数组（用于自动注入 tag 元素到 fullTitle）
   * @param originalTags - 原始的 tags 数组（用于检测 tag 增删）
   * @returns 完整的 EventTitle 对象（包含三层，fullTitle 已同步 tag 元素）
   * 
   * 🔥 中枢化架构：统一处理所有 title 输入格式 + tags 同步
   * 
   * 规则：
   * 0. 如果是字符串（Outlook/Timer/旧数据） → 转换为 simpleTitle，然后升级为三层
   * 1. 有 fullTitle → 降级生成 colorTitle 和 simpleTitle
   * 2. 有 colorTitle → 升级生成 fullTitle，降级生成 simpleTitle
   * 3. 有 simpleTitle → 升级生成 colorTitle 和 fullTitle
   * 4. 多个字段都有 → 保持原样，不覆盖
   * 5. 同步 tags：自动将 tags 注入/更新/删除到 fullTitle 的 tag 元素
   */
  private static normalizeTitle(
    titleInput: Partial<import('../types').EventTitle> | string | undefined,
    tags?: string[],
    originalTags?: string[]
  ): import('../types').EventTitle {
    const result: import('../types').EventTitle = {};
    
    // 🔧 场景 0: 兼容旧格式 - 字符串 title（来自 Timer、Outlook 同步等）
    if (typeof titleInput === 'string') {
      // ✅ 检测是否为 Slate JSON 字符串
      try {
        const parsed = JSON.parse(titleInput);
        // 如果解析成功且是数组（Slate Document），说明是 colorTitle（来自 EventEditModalV2）
        if (Array.isArray(parsed)) {
          console.log('🔍 [normalizeTitle] 检测到 Slate JSON colorTitle，进行处理');
          return {
            colorTitle: titleInput,
            simpleTitle: this.colorTitleToSimpleTitle(titleInput),
            fullTitle: this.simpleTitleToFullTitle(this.colorTitleToSimpleTitle(titleInput))
          };
        }
      } catch {
        // 解析失败，说明是纯文本
      }
      
      // 纯文本处理
      // 🔧 修复: 将纯文本转换为 Slate JSON 格式保存到 colorTitle,保留 emoji
      // ⚠️ 标题不应该包含 Block-Level Timestamp（仅用于 eventlog）
      const slateJson = JSON.stringify([{ 
        type: 'paragraph',
        children: [{ text: titleInput }]
      }]);
      return {
        simpleTitle: titleInput,
        colorTitle: slateJson,  // ✅ 保存为 Slate JSON,保留 emoji
        fullTitle: this.simpleTitleToFullTitle(titleInput)
      };
    }
    
    if (!titleInput) {
      // 空标题：返回空对象
      return {
        fullTitle: this.simpleTitleToFullTitle(''),
        colorTitle: '',
        simpleTitle: ''
      };
    }
    
    const { fullTitle, colorTitle, simpleTitle } = titleInput;
    
    // 🔧 边界情况：所有字段都是 undefined → 视为空标题
    if (!fullTitle && !colorTitle && !simpleTitle) {
      return {
        fullTitle: this.simpleTitleToFullTitle(''),
        colorTitle: '',
        simpleTitle: ''
      };
    }
    
    // 场景 1: 只有 fullTitle → 降级生成 colorTitle 和 simpleTitle
    if (fullTitle && !colorTitle && !simpleTitle) {
      result.fullTitle = fullTitle;
      const { colorTitle: ct, formatMap } = this.fullTitleToColorTitle(fullTitle);
      result.colorTitle = ct;
      result.simpleTitle = this.colorTitleToSimpleTitle(result.colorTitle);
      result.formatMap = formatMap; // ✅ 保存 formatMap
    }
    
    // 场景 2: 只有 colorTitle → 升级生成 fullTitle，降级生成 simpleTitle
    else if (colorTitle && !fullTitle && !simpleTitle) {
      result.colorTitle = colorTitle;
      result.simpleTitle = this.colorTitleToSimpleTitle(colorTitle);
      // 简化升级：colorTitle 无法完美转换为 Slate JSON，使用纯文本升级
      // ✅ 尝试使用保存的 formatMap
      result.fullTitle = this.simpleTitleToFullTitle(result.simpleTitle, (titleInput as any).formatMap);
      result.formatMap = (titleInput as any).formatMap; // 保留 formatMap
    }
    
    // 场景 3: 只有 simpleTitle → 升级生成 colorTitle 和 fullTitle
    // 🔧 修复：使用 === undefined 严格判断，避免空字符串被误判
    // ✅ 检测 simpleTitle 是否为 Slate JSON（防止重复包装）
    else if (simpleTitle && colorTitle === undefined && fullTitle === undefined) {
      try {
        const parsed = JSON.parse(simpleTitle);
        // 如果 simpleTitle 已经是 Slate JSON，说明数据错误，进行修复
        if (Array.isArray(parsed)) {
          console.warn('⚠️ [normalizeTitle] simpleTitle 包含 Slate JSON，进行修复（作为 colorTitle 处理）');
          result.colorTitle = simpleTitle; // 已经是 Slate JSON，作为 colorTitle
          result.simpleTitle = this.colorTitleToSimpleTitle(simpleTitle);
          result.fullTitle = this.simpleTitleToFullTitle(result.simpleTitle);
        } else {
          // 不是数组，说明是其他 JSON 对象（如旧版格式），当作纯文本处理
          result.simpleTitle = simpleTitle;
          result.colorTitle = simpleTitle;
          result.fullTitle = this.simpleTitleToFullTitle(simpleTitle, (titleInput as any).formatMap);
          result.formatMap = (titleInput as any).formatMap;
        }
      } catch {
        // 解析失败，说明是纯文本
        result.simpleTitle = simpleTitle;
        // 🔧 修复: 纯文本需要转换为 Slate JSON 格式（标题不包含 Block-Level Timestamp）
        result.colorTitle = JSON.stringify([{ type: 'paragraph', children: [{ text: simpleTitle }] }]);
        // ✅ 尝试使用保存的 formatMap
        result.fullTitle = this.simpleTitleToFullTitle(simpleTitle, (titleInput as any).formatMap);
        result.formatMap = (titleInput as any).formatMap; // 保留 formatMap
      }
    }
    
    // 场景 4: 多个字段都有 → 保持原样，填充缺失字段
    else {
      result.fullTitle = fullTitle ?? (simpleTitle ? this.simpleTitleToFullTitle(simpleTitle) : this.simpleTitleToFullTitle(''));
      result.colorTitle = colorTitle ?? simpleTitle ?? '';
      result.simpleTitle = simpleTitle ?? (colorTitle ? this.colorTitleToSimpleTitle(colorTitle) : '');
    }
    
    // 🆕 场景 5: 同步 tags 到 fullTitle（自动注入/更新/删除 tag 元素）
    if (tags !== undefined && result.fullTitle) {
      result.fullTitle = this.syncTagsToFullTitle(result.fullTitle, tags, originalTags);
      // 同步后需要重新生成 colorTitle 和 simpleTitle
      const { colorTitle: ct, formatMap } = this.fullTitleToColorTitle(result.fullTitle);
      result.colorTitle = ct;
      result.simpleTitle = this.colorTitleToSimpleTitle(result.colorTitle);
      result.formatMap = formatMap; // ✅ 更新 formatMap
    }
    
    return result;
  }

  /**
   * 同步 tags 到 fullTitle：自动添加/删除 tag 元素
   * @param fullTitle - Slate JSON 字符串
   * @param tags - 当前的 tags 数组
   * @param originalTags - 原始的 tags 数组（用于检测删除）
   * @returns 更新后的 fullTitle
   */
  private static syncTagsToFullTitle(
    fullTitle: string,
    tags: string[],
    originalTags?: string[]
  ): string {
    try {
      const nodes = JSON.parse(fullTitle);
      if (!Array.isArray(nodes) || nodes.length === 0) return fullTitle;
      
      // 只处理第一个 paragraph（title 行）
      const paragraph = nodes[0];
      if (paragraph.type !== 'paragraph' || !Array.isArray(paragraph.children)) {
        return fullTitle;
      }
      
      // 提取现有的 tag 元素
      const existingTags = new Set<string>();
      paragraph.children.forEach((child: any) => {
        if (child.type === 'tag' && child.tagName) {
          existingTags.add(child.tagName);
        }
      });
      
      // 计算需要添加和删除的 tags
      const tagsToAdd = tags.filter(tag => !existingTags.has(tag));
      const tagsToRemove = originalTags 
        ? Array.from(existingTags).filter(tag => !tags.includes(tag))
        : [];
      
      // 如果没有变化，直接返回
      if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
        return fullTitle;
      }
      
      // 删除不需要的 tag 元素
      if (tagsToRemove.length > 0) {
        paragraph.children = paragraph.children.filter((child: any) => {
          if (child.type === 'tag' && tagsToRemove.includes(child.tagName)) {
            return false;
          }
          return true;
        });
      }
      
      // 添加新的 tag 元素（插入到文本内容之前）
      if (tagsToAdd.length > 0) {
        const newTagElements = tagsToAdd.map(tag => ({
          type: 'tag',
          tagName: tag,
          children: [{ text: '' }]
        }));
        
        // 找到第一个非 tag 元素的位置
        let insertIndex = 0;
        for (let i = 0; i < paragraph.children.length; i++) {
          if (paragraph.children[i].type !== 'tag') {
            insertIndex = i;
            break;
          }
        }
        
        // 插入新 tag 元素
        paragraph.children.splice(insertIndex, 0, ...newTagElements);
      }
      
      // 返回更新后的 fullTitle
      return JSON.stringify(nodes);
    } catch (error) {
      console.error('[EventService] syncTagsToFullTitle 失败:', error);
      return fullTitle; // 失败时返回原值
    }
  }

  /**
   * 🗺️ 标准化 location 字段
   * 将字符串或 LocationObject 统一转换为 LocationObject
   * 
   * @param locationInput - 支持 2 种格式：
   *   1. LocationObject（内部格式）→ 直接返回
   *   2. string（Outlook 同步）→ 转换为 LocationObject
   * @returns LocationObject | undefined
   */
  private static normalizeLocation(
    locationInput: string | import('../types').LocationObject | undefined
  ): import('../types').LocationObject | undefined {
    if (!locationInput) return undefined;
    
    // 场景 1: 已经是 LocationObject → 直接返回
    if (typeof locationInput === 'object' && 'displayName' in locationInput) {
      return locationInput;
    }
    
    // 场景 2: 字符串 → 转换为 LocationObject
    if (typeof locationInput === 'string') {
      return {
        displayName: locationInput
      };
    }
    
    return undefined;
  }

  /**
   * 标准化 eventlog 字段
   * 将各种格式的 eventlog 输入统一转换为 EventLog 对象
   * 
   * @param eventlogInput - 支持 5 种输入格式:
   *   1. EventLog 对象（已标准化）→ 直接返回
   *   2. Slate JSON 字符串 → 自动转换
   *   3. HTML 字符串 → 反向识别后转换
   *   4. 纯文本字符串 → 转换为单段落
   *   5. undefined/null → 返回空 EventLog
   * @returns 标准化的 EventLog 对象
   */
  /**
   * 🔥 中枢化架构：规范化 EventLog 对象
   * 支持多种输入格式，统一转换为完整的 EventLog 对象
   * 
   * @param eventlogInput - 可能是 EventLog 对象、Slate JSON 字符串、HTML、纯文本、或 undefined
   * @param fallbackDescription - 回退用的 description 字符串（用于远程同步场景）
   * @param oldEventLog - 旧的 EventLog（用于 diff，检测增量更新并插入 timestamp-divider）
   * @returns 完整的 EventLog 对象
   */
  private static normalizeEventLog(
    eventlogInput: any, 
    fallbackDescription?: string,
    eventCreatedAt?: number,  // 🆕 Event.createdAt（用于未包裹文字）
    eventUpdatedAt?: number,  // 🆕 Event.updatedAt（用于新增行）
    oldEventLog?: EventLog    // 🆕 旧 eventlog（用于 Diff）
  ): EventLog {
    // 情况1: 已经是 EventLog 对象
    if (typeof eventlogInput === 'object' && eventlogInput !== null && 'slateJson' in eventlogInput) {
      const eventLog = eventlogInput as EventLog;
      
      // 🔧 检查 eventlog 是否为空（slateJson 是空数组）
      if (eventLog.slateJson === '[]' && fallbackDescription && fallbackDescription.trim()) {
        const timestamp = eventCreatedAt || Date.now();
        return this.convertSlateJsonToEventLog(JSON.stringify([{
          type: 'paragraph',
          id: generateBlockId(timestamp),
          createdAt: timestamp,
          updatedAt: timestamp,
          children: [{ text: fallbackDescription }]
        }]));
      }
      
      // 🔍 检查是否需要将 paragraph 节点中的时间戳文本拆分成 timestamp-divider 结构
      // （用于修复从 Outlook 同步回来的旧事件或用户粘贴的内容）
      try {
        // 🚨 修复：先判断是否是 JSON 格式再 parse
        let slateNodes;
        if (typeof eventLog.slateJson === 'string') {
          const trimmed = eventLog.slateJson.trim();
          // 🚨 严格检测 JSON 数组：开头是 [{，结尾是 }]（排除 "[⏱️ 计时]" 等文本）
          const looksLikeJson = trimmed.startsWith('[{') && trimmed.endsWith('}]') ||
                               trimmed === '[]';
          
          if (looksLikeJson) {
            try {
              slateNodes = JSON.parse(eventLog.slateJson);
            } catch (parseError) {
              // JSON 解析失败，当作纯文本处理
              console.warn('[normalizeEventLog] slateJson 看起来像 JSON 但解析失败，转换为纯文本:', trimmed.substring(0, 50));
              return this.convertSlateJsonToEventLog(JSON.stringify([{
                type: 'paragraph',
                children: [{ text: trimmed }]
              }]));
            }
          } else {
            // 🔧 纯文本字符串，转换为 Slate JSON
            console.warn('[normalizeEventLog] 🚨 架构错误：slateJson 是纯文本，应该在上游规范化');
            console.log('[normalizeEventLog] 纯文本内容:', trimmed.substring(0, 100));
            return this.convertSlateJsonToEventLog(JSON.stringify([{
              type: 'paragraph',
              children: [{ text: trimmed }]
            }]));
          }
        } else {
          slateNodes = eventLog.slateJson;
        }
        
        // 🚀 [性能优化] 早期退出：如果已经是规范化格式，直接返回
        if (Array.isArray(slateNodes)) {
          // 🆕 检测并迁移旧格式（timestamp-divider → Block-Level）
          if (needsMigration(slateNodes)) {
            console.log('[EventService] 🔄 检测到旧格式 timestamp-divider，自动迁移到 Block-Level...');
            const migratedNodes = migrateToBlockTimestamp(slateNodes);
            console.log('[EventService] ✅ 迁移完成:', {
              原节点数: slateNodes.length,
              新节点数: migratedNodes.length,
              移除divider数: slateNodes.filter((n: any) => n.type === 'timestamp-divider').length
            });
            return this.convertSlateJsonToEventLog(JSON.stringify(migratedNodes));
          }
          
          // 🆕 [CRITICAL FIX] 检查是否有 paragraph 缺少 createdAt
          // 如果缺少，说明是旧格式，需要从 plainText 重新解析时间戳
          const hasParagraphWithoutTimestamp = slateNodes.some((node: any) => 
            node.type === 'paragraph' && !node.createdAt
          );
          
          if (hasParagraphWithoutTimestamp && eventLog.plainText) {
            console.log('[normalizeEventLog] 🔄 检测到 paragraph 缺少 createdAt，从 plainText 重新解析');
            
            // 检查 plainText 是否包含时间戳
            const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/gm;
            const matches = [...eventLog.plainText.matchAll(timestampPattern)];
            
            if (matches.length > 0) {
              console.log('[normalizeEventLog] ✅ plainText 中发现', matches.length, '个时间戳，重新解析为 Block-Level');
              const newSlateNodes = this.parseTextWithBlockTimestamps(
                eventLog.plainText,
                { eventCreatedAt, eventUpdatedAt, oldEventLog }
              );
              console.log('[normalizeEventLog] 解析后的节点:', newSlateNodes);
              return this.convertSlateJsonToEventLog(JSON.stringify(newSlateNodes));
            } else {
              console.log('[normalizeEventLog] ⚠️ plainText 中未发现时间戳，使用 ensureBlockTimestamps 补全');
              const ensuredNodes = ensureBlockTimestamps(slateNodes);
              return this.convertSlateJsonToEventLog(JSON.stringify(ensuredNodes));
            }
          }
          
          // 🆕 确保所有 paragraph 都有 Block Timestamp 元数据
          const ensuredNodes = ensureBlockTimestamps(slateNodes);
          if (JSON.stringify(ensuredNodes) !== JSON.stringify(slateNodes)) {
            console.log('[EventService] 🔧 补全了缺失的 Block Timestamp 元数据');
            return this.convertSlateJsonToEventLog(JSON.stringify(ensuredNodes));
          }
          
          // ❌ 移除旧的 timestamp-divider 检测逻辑（已由 needsMigration 替代）
          const hasParagraphTimestamp = slateNodes.some((node: any) => {
            if (node.type === 'paragraph' && node.children?.[0]?.text) {
              const text = node.children[0].text.trim();
              return /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/.test(text);
            }
            return false;
          });
          
          // 如果没有纯文本时间戳，直接返回（不再检查 timestamp-divider）
          if (!hasParagraphTimestamp) {
            return eventLog; // 已经规范化，跳过解析
          }
        }
        
        if (Array.isArray(slateNodes)) {
          let needsReparse = false;
          const timestampNodes: any[] = [];
          
          // 遍历所有节点，检查段落中是否包含时间戳文本
          for (let i = 0; i < slateNodes.length; i++) {
            const node = slateNodes[i];
            if (node.type === 'paragraph' && node.children?.[0]?.text) {
              const text = node.children[0].text.trim();
              // 支持 YYYY-MM-DD HH:mm:ss 和 YYYY/MM/DD HH:mm:ss
              // 支持单位数月份/日期（如 2025/12/7）
              // 🔧 修复：去掉 $ 结尾符，允许时间戳后面有其他内容（换行+正文）
              const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/;
              const matched = timestampPattern.test(text);
              
              if (matched) {
                needsReparse = true;
                timestampNodes.push({ index: i, text });
              }
            }
          }
          
          if (needsReparse) {
            // 发现时间戳段落，需要重新解析整个内容
            console.log('🔄 [normalizeEventLog] 发现纯文本时间戳，重新解析为 Block-Level:', {
              timestampCount: timestampNodes.length
            });
            // 将所有节点转换回文本，然后使用 parseTextWithBlockTimestamps 重新解析
            const textLines: string[] = [];
            for (const node of slateNodes) {
              if (node.type === 'paragraph' && node.children) {
                const paragraphText = node.children.map((child: any) => child.text || '').join('');
                textLines.push(paragraphText);
              } else if (node.type === 'timestamp-divider') {
                // 旧格式：保留时间戳行
                textLines.push(node.displayText || new Date(node.timestamp).toLocaleString());
              }
            }
            
            const fullText = textLines.join('\n');
            console.log('✅ [normalizeEventLog] 重新解析 eventlog，原文本:', fullText.substring(0, 200));
            // 🆕 使用 Block-Level 解析器
            const newSlateNodes = this.parseTextWithBlockTimestamps(
              fullText,
              { eventCreatedAt, eventUpdatedAt, oldEventLog }
            );
            console.log('✅ [normalizeEventLog] 解析后的节点（Block-Level）:', newSlateNodes);
            const newSlateJson = JSON.stringify(newSlateNodes);
            return this.convertSlateJsonToEventLog(newSlateJson);
          }
        }
      } catch (error) {
        console.warn('[EventService] 检查时间戳拆分时出错，使用原 eventlog:', error);
      }
      
      // 🚀 [PERFORMANCE FIX] 不再自动生成缺失字段！
      // 原逻辑会在每次 normalizeEventLog 调用时检查并转换，导致性能灾难
      // 新逻辑：保存时预生成（convertSlateJsonToEventLog），读取时直接使用
      // 如果数据缺失字段，应该用修复工具批量修复，而不是每次读取都转换
      
      return eventLog;
    }
    
    // 情况2: undefined 或 null - 尝试从 fallbackDescription 生成
    if (eventlogInput === undefined || eventlogInput === null) {
      if (fallbackDescription && fallbackDescription.trim()) {
        // 🔍 检查 fallbackDescription 是否包含时间戳
        const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/gm;
        const matches = [...fallbackDescription.matchAll(timestampPattern)];
        
        if (matches.length > 0) {
          // ✅ 发现时间戳，使用 parseTextWithBlockTimestamps 解析
          console.log('[normalizeEventLog] fallbackDescription 中发现', matches.length, '个时间戳，解析为 Block-Level');
          const slateNodes = this.parseTextWithBlockTimestamps(
            fallbackDescription,
            { eventCreatedAt, eventUpdatedAt, oldEventLog }
          );
          return this.convertSlateJsonToEventLog(JSON.stringify(slateNodes));
        }
        
        // 没有时间戳，直接包装（使用 Event.createdAt 作为时间戳）
        const timestamp = eventCreatedAt || Date.now();
        return this.convertSlateJsonToEventLog(JSON.stringify([{
          type: 'paragraph',
          id: generateBlockId(timestamp),
          createdAt: timestamp,
          updatedAt: timestamp,
          children: [{ text: fallbackDescription }]
        }]));
      }
      // console.log('[EventService] eventlog 和 fallbackDescription 均为空，返回空对象');
      return this.convertSlateJsonToEventLog('[]');
    }
    
    // 情况3-5: 字符串格式（需要判断类型）
    if (typeof eventlogInput === 'string') {
      const trimmed = eventlogInput.trim();
      
      // 空字符串
      if (!trimmed) {
        return this.convertSlateJsonToEventLog('[]');
      }
      
      // Slate JSON 字符串（以 [ 开头）
      if (trimmed.startsWith('[')) {
        return this.convertSlateJsonToEventLog(eventlogInput);
      }
      
      // HTML 字符串（包含标签）
      if (trimmed.startsWith('<') || trimmed.includes('<p>') || trimmed.includes('<div>')) {
        console.log('[EventService] 检测到 HTML 格式，先提取文本检查时间戳');
        
        // � [CRITICAL FIX] 先从 HTML 中移除签名元素，再提取文本
        // 问题：如果先提取文本，签名会作为纯文本保留下来
        let cleanedHtml = eventlogInput;
        
        // 1. 移除 Outlook/4DNote 签名段落（<p> 或 <div> 包含签名）
        cleanedHtml = cleanedHtml.replace(/<(p|div)[^>]*>\s*---\s*<br\s*\/?>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?<\/(p|div)>/gi, '');
        cleanedHtml = cleanedHtml.replace(/<(p|div)[^>]*>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?<\/(p|div)>/gi, '');
        
        // 2. 移除分隔线段落
        cleanedHtml = cleanedHtml.replace(/<(p|div)[^>]*>\s*---\s*<\/(p|div)>/gi, '');
        
        console.log('[EventService] 🧹 清理 HTML 签名:', {
          原长度: eventlogInput.length,
          清理后: cleanedHtml.length,
          移除字符数: eventlogInput.length - cleanedHtml.length
        });
        
        // 🆕 [CRITICAL FIX] 递归解码多层 HTML 实体编码
        // 问题：Outlook 同步回来的 HTML 可能被多层转义（&amp;lt;br&amp;gt; → &lt;br&gt; → <br>）
        // 解决：递归解码，直到没有 HTML 实体为止
        let decodedHtml = cleanedHtml;
        let previousHtml = '';
        let iterations = 0;
        const maxIterations = 10; // 防止无限循环
        
        while (decodedHtml !== previousHtml && iterations < maxIterations) {
          previousHtml = decodedHtml;
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = decodedHtml;
          decodedHtml = tempDiv.innerHTML;
          iterations++;
        }
        
        console.log('[EventService] 🔓 递归解码 HTML 实体:', {
          迭代次数: iterations,
          原始长度: cleanedHtml.length,
          解码后长度: decodedHtml.length
        });
        
        // 🔧 从解码后的 HTML 提取纯文本（保留换行）
        // Step 1: 将 <br> 和 </p> 转换为换行符
        let htmlForExtraction = decodedHtml
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/div>/gi, '\n');
        
        // Step 2: 提取纯文本
        const tempDiv2 = document.createElement('div');
        tempDiv2.innerHTML = htmlForExtraction;
        
        // 优先从 <body> 提取，如果没有则从整个内容提取
        const bodyElement = tempDiv2.querySelector('body');
        let textContent = (bodyElement || tempDiv2).textContent || '';
        
        // Step 3: 清理多余换行
        textContent = textContent
          .replace(/\n{3,}/g, '\n\n')  // 最多保留两个连续换行
          .trim();
        
        // 🔍 检查提取的文本是否包含时间戳分隔符
        // 支持 YYYY-MM-DD HH:mm:ss 和 YYYY/MM/DD HH:mm:ss
        // 支持单位数月份/日期（如 2025/12/7）
        // ✅ 修改：允许行首时间戳（独立成行 OR 行首+内容）
        const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/gm;
        const matches = [...textContent.matchAll(timestampPattern)];
        
        if (matches.length > 0) {
          // 发现时间戳，按时间戳分割内容
          console.log('[EventService] HTML 中发现', matches.length, '个时间戳，按时间分割内容（Block-Level）');
          console.log('[EventService] 原始文本:', textContent);
          // 🆕 使用 Block-Level 解析器
          const slateNodes = this.parseTextWithBlockTimestamps(
            textContent,
            { eventCreatedAt, eventUpdatedAt, oldEventLog }
          );
          console.log('[EventService] 解析后的节点:', slateNodes);
          const slateJson = JSON.stringify(slateNodes);
          return this.convertSlateJsonToEventLog(slateJson);
        }
        
        // 没有时间戳，使用反向识别将 HTML 转换为 Slate JSON（使用清理后的 HTML）
        const slateJson = this.htmlToSlateJsonWithRecognition(cleanedHtml);
        return this.convertSlateJsonToEventLog(slateJson);
      }
      
      // 纯文本字符串 - 先清理签名，再检查是否包含时间戳分隔符
      console.log('[EventService] 检测到纯文本，先清理签名再检查时间戳');
      
      // 🧹 Step 1: 清理签名（使用 SignatureUtils）
      let cleanedText = SignatureUtils.extractCoreContent(eventlogInput);
      console.log('[EventService] 🧹 清理签名:', {
        原始长度: eventlogInput.length,
        清理后长度: cleanedText.length,
        移除字符数: eventlogInput.length - cleanedText.length
      });
      
      // 🔍 Step 2: 识别所有 timestamp
      // 尝试识别时间戳格式：YYYY-MM-DD HH:mm:ss 或 YYYY/MM/DD HH:mm:ss
      // 支持单位数月份/日期（如 2025/12/7）
      // 用于 Outlook 同步回来的文本或用户粘贴的内容
      // ✅ 修改：允许行首时间戳（独立成行 OR 行首+内容）
      const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/gm;
      const matches = [...cleanedText.matchAll(timestampPattern)];
      
      if (matches.length > 0) {
        // 发现时间戳，按时间戳分割内容
        console.log('[EventService] 发现', matches.length, '个时间戳，按时间分割内容（Block-Level）');
        console.log('[EventService] 原始文本:', cleanedText);
        // 🆕 Step 3: 使用 Block-Level 解析器（会遍历全文，识别所有 timestamp）
        const slateNodes = this.parseTextWithBlockTimestamps(
          cleanedText,
          { eventCreatedAt, eventUpdatedAt, oldEventLog }
        );
        console.log('[EventService] 解析后的节点:', slateNodes);
        const slateJson = JSON.stringify(slateNodes);
        return this.convertSlateJsonToEventLog(slateJson);
      }
      
      // 没有时间戳，转换为单段落（🆕 注入 Block-Level Timestamp）
      const timestamp = eventCreatedAt || Date.now();
      const blockId = generateBlockId(timestamp);
      
      const slateJson = JSON.stringify([{
        type: 'paragraph',
        id: blockId,
        createdAt: timestamp,
        updatedAt: timestamp,
        children: [{ text: cleanedText }]  // 使用清理后的文本
      }]);
      return this.convertSlateJsonToEventLog(slateJson);
    }
    
    // 🆕 情况6: 从 description 字符串生成（用于远程同步回退）
    // 注意：这个分支通常不会被直接调用，因为上面的"纯文本字符串"分支已覆盖
    // 但保留作为明确的文档说明
    
    // 情况7: 未知对象格式 - 尝试智能提取
    if (typeof eventlogInput === 'object' && eventlogInput !== null) {
      // 🔧 检查是否有 content 字段（包含 Slate JSON）
      if (eventlogInput.content && typeof eventlogInput.content === 'string') {
        // content 字段可能是 Slate JSON 字符串
        try {
          const parsed = JSON.parse(eventlogInput.content);
          if (Array.isArray(parsed)) {
            // ✅ 是有效的 Slate JSON，直接使用
            return this.convertSlateJsonToEventLog(eventlogInput.content);
          }
        } catch (e) {
          // 不是 JSON，当作纯文本处理
        }
      }
      
      // 🔧 尝试提取其他常见字段
      const possibleText = eventlogInput.content || 
                          eventlogInput.plainText || 
                          eventlogInput.descriptionPlainText ||
                          eventlogInput.text || 
                          eventlogInput.description;
      
      if (typeof possibleText === 'string' && possibleText.trim()) {
        // 只在首次遇到时打印一次日志
        if (!(eventlogInput as any)._loggedOnce) {
          console.log('[EventService] 从未知对象提取字段:', Object.keys(eventlogInput).slice(0, 3).join(', '));
          (eventlogInput as any)._loggedOnce = true;
        }
        const timestamp = eventCreatedAt || Date.now();
        return this.convertSlateJsonToEventLog(JSON.stringify([{
          type: 'paragraph',
          id: generateBlockId(timestamp),
          createdAt: timestamp,
          updatedAt: timestamp,
          children: [{ text: possibleText }]
        }]));
      }
      
      // 最后的回退：JSON.stringify 整个对象
      console.warn('[EventService] 无法从对象提取文本，使用 JSON.stringify:', Object.keys(eventlogInput));
      const timestamp = eventCreatedAt || Date.now();
      return this.convertSlateJsonToEventLog(JSON.stringify([{
        type: 'paragraph',
        id: generateBlockId(timestamp),
        createdAt: timestamp,
        updatedAt: timestamp,
        children: [{ text: JSON.stringify(eventlogInput) }]
      }]));
    }
    
    // 未知格式 - 降级为空
    console.warn('[EventService] 无法处理的 eventlog 格式:', typeof eventlogInput);
    return this.convertSlateJsonToEventLog('[]');
  }
  
  /**
   * 🔥 中枢化架构：统一的事件数据规范化入口
   * 所有事件在存储前必须经过此方法处理，确保数据完整性和一致性
   * 
   * @param event - 部分事件数据（可能来自 UI、远程同步、或旧数据）
   * @param options - 规范化选项
   *   - preserveSignature: 是否保留现有签名（用于 external-sync，避免签名变化导致误判）
   *   - oldEvent: 旧的事件数据（用于 diff，检测 eventlog 增量更新）
   * @returns 完整且规范化的 Event 对象
   * 
   * 处理内容：
   * - title: 字符串 → EventTitle 对象（三层架构）
   * - eventlog: 从 eventlog 或 description 生成完整 EventLog 对象
   * - description: 从 eventlog 提取或使用原值
   * - 其他字段: 填充默认值和时间戳
   */
  private static normalizeEvent(
    event: Partial<Event>,
    options?: { 
      preserveSignature?: boolean;
      oldEvent?: Partial<Event>;
    }
  ): Event {
    const now = formatTimeForStorage(new Date());
    
    // 🔥 Title 规范化（支持字符串或对象输入 + tags 同步）
    const normalizedTitle = this.normalizeTitle(event.title, event.tags);
    
    // 🗺️ Location 规范化（支持 string 和 LocationObject）
    const normalizedLocation = this.normalizeLocation(event.location);
    
    // 🆕 [CRITICAL FIX] 在清理签名之前，先从原始 description 提取签名信息
    const extractedTimestamps = this.extractTimestampsFromSignature(event.description || '');
    const extractedCreator = this.extractCreatorFromSignature(event.description || '');
    
    console.log('[normalizeEvent] 📝 从签名提取元信息:', {
      eventId: event.id?.slice(-8),
      descriptionPreview: event.description?.slice(0, 100),
      createdAt: extractedTimestamps.createdAt,
      updatedAt: extractedTimestamps.updatedAt,
      source: extractedCreator.source,
      fourDNoteSource: extractedCreator.fourDNoteSource,
      lastModifiedSource: extractedCreator.lastModifiedSource  // 🆕 修改来源
    });
    
    // 🔥 EventLog 规范化（优先从 eventlog，回退到 description）
    // ✅ 从 description 中移除签名，提取核心内容
    let fallbackContent = event.description ? SignatureUtils.extractCoreContent(event.description) : '';
    
    // 🆕 [CRITICAL FIX] 如果 fallbackContent 是 HTML，先转换为纯文本
    if (fallbackContent && (fallbackContent.includes('<') || fallbackContent.includes('>'))) {
      console.log('[normalizeEvent] 检测到 HTML 格式的 description，转换为纯文本');
      
      // 🆕 [CRITICAL FIX] 递归解码多层 HTML 实体编码
      let decodedHtml = fallbackContent;
      let previousHtml = '';
      let iterations = 0;
      const maxIterations = 10;
      
      while (decodedHtml !== previousHtml && iterations < maxIterations) {
        previousHtml = decodedHtml;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = decodedHtml;
        decodedHtml = tempDiv.innerHTML;
        iterations++;
      }
      
      console.log('[normalizeEvent] 🔓 递归解码 HTML 实体:', {
        迭代次数: iterations,
        原始长度: fallbackContent.length,
        解码后长度: decodedHtml.length
      });
      
      // Step 1: 将 <br> 和 </p> 转换为换行符
      let htmlForExtraction = decodedHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n');
      
      // Step 2: 提取纯文本
      const tempDiv2 = document.createElement('div');
      tempDiv2.innerHTML = htmlForExtraction;
      
      // 优先从 <body> 提取
      const bodyElement = tempDiv2.querySelector('body');
      fallbackContent = (bodyElement || tempDiv2).textContent || '';
      
      // Step 3: 清理多余换行
      fallbackContent = fallbackContent
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      console.log('[normalizeEvent] HTML → 纯文本转换完成:', {
        原长度: event.description?.length,
        转换后长度: fallbackContent.length,
        前100字符: fallbackContent.substring(0, 100)
      });
    }
    
    // 🆕 转换时间戳（字符串 → number）
    const eventCreatedAt = event.createdAt 
      ? new Date(event.createdAt).getTime() 
      : undefined;
    const eventUpdatedAt = event.updatedAt 
      ? new Date(event.updatedAt).getTime() 
      : eventCreatedAt;
    
    const normalizedEventLog = this.normalizeEventLog(
      event.eventlog, 
      fallbackContent,   // 回退用的核心内容（已移除签名 + 转换为纯文本）
      eventCreatedAt,    // 🆕 Event.createdAt (number)
      eventUpdatedAt     // 🆕 Event.updatedAt (number)
      // 没有旧 eventlog，因为 normalizeEvent 是规范化新事件
    );
    
    // 🆕 [v2.18.0] 优先从 Block-Level Timestamp 中提取时间戳
    let blockLevelTimestamps: { createdAt?: string; updatedAt?: string } = {};
    try {
      const slateNodes = typeof normalizedEventLog.slateJson === 'string' 
        ? JSON.parse(normalizedEventLog.slateJson) 
        : normalizedEventLog.slateJson;
      
      if (Array.isArray(slateNodes) && slateNodes.length > 0) {
        // ✅ 从 Block-Level paragraph 节点提取时间戳（createdAt 元数据）
        const blockLevelParagraphs = slateNodes.filter((node: any) => 
          node.type === 'paragraph' && node.createdAt !== undefined
        );
        
        console.log('[normalizeEvent] 🕐 Block-Level Timestamp 提取:', {
          节点总数: slateNodes.length,
          'Block-Level paragraph数量': blockLevelParagraphs.length,
          时间戳列表: blockLevelParagraphs.map((n: any) => n.createdAt)
        });
        
        if (blockLevelParagraphs.length > 0) {
          // 第一个 Block-Level paragraph 的 createdAt 作为事件创建时间
          const firstTimestamp = blockLevelParagraphs[0].createdAt;
          if (firstTimestamp) {
            // 转换为 TimeSpec 格式（YYYY-MM-DD HH:mm:ss）
            blockLevelTimestamps.createdAt = this.convertTimestampToTimeSpec(firstTimestamp);
            console.log('[normalizeEvent] ✅ 从 Block-Level 提取到 createdAt:', blockLevelTimestamps.createdAt);
          }
          
          // 最后一个 Block-Level paragraph 的 createdAt 作为最后修改时间
          const lastParagraph = blockLevelParagraphs[blockLevelParagraphs.length - 1];
          const lastTimestamp = lastParagraph.updatedAt || lastParagraph.createdAt;
          if (lastTimestamp) {
            blockLevelTimestamps.updatedAt = this.convertTimestampToTimeSpec(lastTimestamp);
            console.log('[normalizeEvent] ✅ 从 Block-Level 提取到 updatedAt:', blockLevelTimestamps.updatedAt);
          }
        } else {
          console.log('[normalizeEvent] ℹ️ 未找到 Block-Level paragraph 节点，将使用签名或传入的时间');
        }
      }
    } catch (error) {
      console.warn('[normalizeEvent] 从 Block-Level Timestamp 提取时间失败:', error);
    }
    
    // 🆕 [v2.18.0] 时间戳选择策略：
    // - createdAt: 选择最早的时间（多个来源取 min）
    // - updatedAt: 选择最新的时间（多个来源取 max）
    // 注意：extractedTimestamps 和 extractedCreator 已在前面提取（清理签名之前）
    
    const createdAtCandidates = [
      blockLevelTimestamps.createdAt,
      extractedTimestamps.createdAt,
      event.createdAt
    ].filter(Boolean);
    
    const finalCreatedAt = createdAtCandidates.length > 0
      ? createdAtCandidates.reduce((earliest, current) => 
          current < earliest ? current : earliest
        )
      : now;
    
    const updatedAtCandidates = [
      blockLevelTimestamps.updatedAt,
      extractedTimestamps.updatedAt,
      event.updatedAt
    ].filter(Boolean);
    
    const finalUpdatedAt = updatedAtCandidates.length > 0
      ? updatedAtCandidates.reduce((latest, current) => 
          current > latest ? current : latest
        )
      : now;
    
    // 🚨 错误：如果使用了默认时间（now），说明代码有严重 bug
    // 理论上永远不应该走到这个分支：
    // - createEvent: 前端必定传 createdAt
    // - Outlook 同步: 必定有 createdDateTime
    // - updateEvent: 保留原有时间戳
    if (createdAtCandidates.length === 0) {
      console.error('[normalizeEvent] 🚨 严重错误：缺少创建时间！这不应该发生，请检查调用链:', {
        eventId: event.id,
        title: event.title,
        source: event.source,
        fourDNoteSource: event.fourDNoteSource,
        使用默认值: now,
        堆栈: new Error().stack
      });
    }
    
    console.log('[normalizeEvent] 📊 时间戳选择策略:', {
      '候选 createdAt': createdAtCandidates,
      '最终 createdAt (最早)': finalCreatedAt,
      '候选 updatedAt': updatedAtCandidates,
      '最终 updatedAt (最新)': finalUpdatedAt,
      '使用默认值': createdAtCandidates.length === 0
    });
    
    const finalFourDNoteSource = extractedCreator.fourDNoteSource !== undefined 
      ? extractedCreator.fourDNoteSource 
      : event.fourDNoteSource;
    const finalSource = extractedCreator.source || event.source;
    
    // 🔥 Description 规范化（从 eventlog 提取 + 添加签名）
    let normalizedDescription: string;
    
    // 🆕 [v2.18.8] 如果 preserveSignature=true（external-sync），保留原有签名
    if (options?.preserveSignature && event.description) {
      normalizedDescription = event.description; // 直接使用原有 description（含签名）
      console.log('[normalizeEvent] 🔒 保留原有签名（preserveSignature=true）');
    } else {
      // 正常流程：重新生成签名
      const coreContent = normalizedEventLog.plainText || '';
      const eventMeta = {
        ...event,
        createdAt: finalCreatedAt,  // ✅ 使用提取的创建时间
        updatedAt: finalUpdatedAt   // ✅ 使用提取的修改时间
      };
      // ✅ [v2.18.9] 智能识别修改来源：优先使用签名中提取的，回退到事件来源
      const lastModifiedSource = extractedCreator.lastModifiedSource 
        || (finalSource === 'outlook' ? 'outlook' : '4dnote');
      normalizedDescription = SignatureUtils.addSignature(coreContent, {
        ...eventMeta,
        lastModifiedSource
      });
    }
    
    console.log('[normalizeEvent] 时间戳提取完整链路:', {
      eventId: (event.id || 'new').slice(-8),
      // Block-Level Timestamp（最高优先级）
      blockLevelCreatedAt: blockLevelTimestamps.createdAt?.slice(0, 19),
      blockLevelUpdatedAt: blockLevelTimestamps.updatedAt?.slice(0, 19),
      // 签名时间戳（次优先级）
      signatureCreatedAt: extractedTimestamps.createdAt?.slice(0, 19),
      signatureUpdatedAt: extractedTimestamps.updatedAt?.slice(0, 19),
      // 传入的时间（回退）
      passedCreatedAt: event.createdAt?.slice(0, 19),
      passedUpdatedAt: event.updatedAt?.slice(0, 19),
      // 候选值
      '候选createdAt': createdAtCandidates,
      '候选updatedAt': updatedAtCandidates,
      // 最终选择
      '🏆 finalCreatedAt': finalCreatedAt.slice(0, 19),
      '🏆 finalUpdatedAt': finalUpdatedAt.slice(0, 19),
      // 创建者信息
      extractedCreator: extractedCreator.fourDNoteSource !== undefined 
        ? (extractedCreator.fourDNoteSource ? '4DNote' : 'Outlook')
        : undefined,
      extractedModifier: extractedCreator.lastModifiedSource,  // 🆕 修改者信息
      finalFourDNoteSource,
      finalSource,
      // 签名处理
      preserveSignature: options?.preserveSignature
    });
    
    return {
      // 🔥 保留所有原始字段（包括 bulletLevel, position 等）
      ...event,
      
      // 基础标识
      id: event.id || `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      
      // 规范化字段（覆盖原始值）
      title: normalizedTitle,
      eventlog: normalizedEventLog,
      description: normalizedDescription,
      
      // 时间字段
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay || false,
      dueDateTime: event.dueDateTime,
      
      // 分类字段
      // 🔥 [CRITICAL FIX] 只有 tags 字段存在时才设置，避免强制覆盖为空数组
      // 否则 Outlook 同步会导致 tags: undefined → tags: [] → EventHistory 误判为变更
      ...(event.tags !== undefined ? { tags: event.tags || [] } : {}),
      priority: event.priority,
      
      // 协作字段
      organizer: event.organizer,
      // 🔥 [CRITICAL FIX] 只有字段存在时才设置，避免强制覆盖为空数组
      ...(event.attendees !== undefined ? { attendees: event.attendees || [] } : {}),
      location: normalizedLocation,
      
      // 来源标识（优先使用从签名提取的值）
      fourDNoteSource: finalFourDNoteSource,
      source: finalSource,
      isPlan: event.isPlan,
      isTimeCalendar: event.isTimeCalendar,
      isTimer: event.isTimer,
      isDeadline: event.isDeadline,
      
      // 任务模式
      isTask: event.isTask,
      isCompleted: event.isCompleted,
      
      // Timer 关联
      parentEventId: event.parentEventId,
      childEventIds: event.childEventIds,
      
      // 日历同步配置
      // 🔥 [CRITICAL FIX] 只有字段存在时才设置，避免强制覆盖为空数组
      ...(event.calendarIds !== undefined ? { calendarIds: event.calendarIds || [] } : {}),
      syncMode: event.syncMode,
      subEventConfig: event.subEventConfig,
      
      // 签到字段
      // 🔥 [CRITICAL FIX] 只有字段存在时才设置，避免强制覆盖为空数组
      ...(event.checked !== undefined ? { checked: event.checked || [] } : {}),
      ...(event.unchecked !== undefined ? { unchecked: event.unchecked || [] } : {}),
      
      // 外部同步
      externalId: event.externalId,
      
      // 时间戳 - ✅ [v2.18.0] 使用从签名中提取的真实时间
      createdAt: finalCreatedAt,  // 优先使用签名中的创建时间
      updatedAt: finalUpdatedAt,  // 优先使用签名中的修改时间
      lastLocalChange: now,
      localVersion: (event.localVersion || 0) + 1,
      syncStatus: event.syncStatus || 'pending',
    } as Event;
  }

  /**
   * 解析包含时间戳的纯文本，将其分割为 timestamp-divider + paragraph 节点
   * 
   * @param text - 包含时间戳的纯文本（如 Outlook 同步回来的 description）
   * @returns Slate 节点数组，包含 timestamp-divider 和 paragraph 节点
   * 
   * 输入示例:
   * ```
   * 2025-11-27 01:05:22
   * 第一段内容...
   * 2025-11-27 01:36:23
   * 第二段内容...
   * ```
   * 
   * 输出:
   * ```
   * [
   *   { type: 'timestamp-divider', timestamp: '2025-11-27T01:05:22', children: [{ text: '' }] },
   *   { type: 'paragraph', children: [{ text: '第一段内容...' }] },
   *   { type: 'timestamp-divider', timestamp: '2025-11-27T01:36:23', children: [{ text: '' }] },
   *   { type: 'paragraph', children: [{ text: '第二段内容...' }] }
   * ]
   * ```
   */
  private static cleanEmptyTimestampPairs(slateNodes: any[]): any[] {
    const cleanedNodes: any[] = [];
    
    for (let i = 0; i < slateNodes.length; i++) {
      const currentNode = slateNodes[i];
      const nextNode = slateNodes[i + 1];
      
      // 检查 1: 移除签名段落（使用统一的签名检测工具）
      if (currentNode.type === 'paragraph') {
        const paragraphText = currentNode.children
          ?.map((child: any) => child.text || '')
          .join('')
          .trim();
        
        if (SignatureUtils.isSignatureParagraph(paragraphText)) {
          console.log('🗑️ [cleanEmptyTimestampPairs] 移除签名段落:', paragraphText.substring(0, 50));
          continue; // 跳过签名段落
        }
      }
      
      // 检查 2: 移除空时间戳+段落对
      if (currentNode.type === 'timestamp-divider') {
        // 检查下一个节点是否是空段落
        if (nextNode && nextNode.type === 'paragraph') {
          const paragraphText = nextNode.children
            ?.map((child: any) => child.text || '')
            .join('')
            .trim();
          
          if (!paragraphText || paragraphText === '---') {
            // 跳过当前时间戳和下一个空段落（包括只有"---"的段落）
            i++; // 跳过空段落
            console.log('🗑️ [cleanEmptyTimestampPairs] 移除空时间戳对:', currentNode.timestamp);
            continue;
          }
        }
      }
      
      // 保留非签名、非空的节点
      cleanedNodes.push(currentNode);
    }
    
    // 确保至少有一个节点
    if (cleanedNodes.length === 0) {
      cleanedNodes.push({
        type: 'paragraph',
        children: [{ text: '' }]
      });
    }
    
    return cleanedNodes;
  }

  // ==================== 可复用组件：文本处理 ====================
  
  /** 🔍 时间戳正则模式（统一定义） */
  private static readonly TIMESTAMP_PATTERN = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/;
  private static readonly TIMESTAMP_PATTERN_GLOBAL = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/gm;
  
  /** 🧹 递归解码 HTML 实体编码（处理多层转义） */
  private static decodeHtmlEntities(html: string, maxIterations: number = 10): string {
    let decoded = html;
    let previous = '';
    let iterations = 0;
    
    while (decoded !== previous && iterations < maxIterations) {
      previous = decoded;
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = decoded;
      decoded = tempDiv.innerHTML;
      iterations++;
    }
    
    console.log('[decodeHtmlEntities] 🔓 递归解码:', { 迭代次数: iterations });
    return decoded;
  }
  
  /** 🧹 从 HTML 中提取纯文本（保留换行） */
  private static extractTextFromHtml(html: string): string {
    const htmlWithNewlines = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n');
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlWithNewlines;
    
    const bodyElement = tempDiv.querySelector('body');
    return ((bodyElement || tempDiv).textContent || '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  
  /** 🧹 清理 HTML 中的签名元素 */
  private static cleanHtmlSignature(html: string): string {
    return html
      .replace(/<(p|div)[^>]*>\s*---\s*<br\s*\/?>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?<\/(p|div)>/gi, '')
      .replace(/<(p|div)[^>]*>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?<\/(p|div)>/gi, '')
      .replace(/<(p|div)[^>]*>\s*---\s*<\/(p|div)>/gi, '');
  }
  
  /** 🔍 检测文本中的时间戳 */
  private static detectTimestamps(text: string): RegExpMatchArray[] {
    return [...text.matchAll(this.TIMESTAMP_PATTERN_GLOBAL)];
  }
  
  /** 📝 创建基础 Paragraph 节点（带 Block-Level Timestamp） */
  private static createParagraphNode(text: string, context: ParseContext): any {
    const timestamp = context.eventCreatedAt || Date.now();
    return {
      type: 'paragraph',
      id: generateBlockId(timestamp),
      createdAt: timestamp,
      updatedAt: timestamp,
      children: [{ text }]
    };
  }
  
  /** 🔄 从文本解析并生成 Slate 节点（带时间戳检测） */
  private static parseTextToSlateNodes(text: string, context: ParseContext): any[] {
    const matches = this.detectTimestamps(text);
    
    if (matches.length > 0) {
      console.log('[parseTextToSlateNodes] ✅ 发现', matches.length, '个时间戳，使用 Block-Level 解析');
      return this.parseTextWithBlockTimestamps(text, context);
    }
    
    return [this.createParagraphNode(text, context)];
  }
  
  // ==================== 原有解析方法 ====================
  
  /**
   * 从纯文本中解析并插入 timestamp-divider 节点（旧格式）
   * 
   * 输入:
   * ```
   * 2025-11-27 01:05:22
   * 第一段内容...
   * 2025-11-27 01:36:23
   * 第二段内容...
   * ```
   * 
   * 输出:
   * ```
   * [
   *   { type: 'timestamp-divider', timestamp: '2025-11-27T01:05:22', children: [{ text: '' }] },
   *   { type: 'paragraph', children: [{ text: '第一段内容...' }] },
   *   { type: 'timestamp-divider', timestamp: '2025-11-27T01:36:23', children: [{ text: '' }] },
   *   { type: 'paragraph', children: [{ text: '第二段内容...' }] }
   * ]
   * ```
   */
  private static parseTextWithTimestamps(text: string): any[] {
    const slateNodes: any[] = [];
    
    // 按行分割
    const lines = text.split('\n');
    
    // 时间戳正则（支持两种模式）
    // 模式 1：独立成行："2025-11-27 01:05:22"
    // 模式 2：行首时间戳+内容："2025-11-27 01:05:22 这是内容"
    // 支持格式：
    // - "2025-11-27 01:05:22" （连字符）
    // - "2025/11/27 01:05:22" （斜杠）
    // - "2025/12/7 21:39:42" （单位数月份/日期）
    // - 带相对时间："2025-11-27 01:36:23 | 31min later"
    // ✅ 去掉 $ 结尾符，允许时间戳后面有内容
    const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/
    
    let currentParagraphLines: string[] = [];
    
    for (const line of lines) {
      const match = line.match(timestampPattern);
      
      if (match) {
        // 遇到时间戳行
        
        // 1. 先保存之前累积的段落内容（如果有）
        if (currentParagraphLines.length > 0) {
          // ✅ 多行内容保持为一个完整的 paragraph（不 trim，保留空行）
          const paragraphText = currentParagraphLines.join('\n');
          if (paragraphText.trim()) { // 只检查是否完全为空
            slateNodes.push({
              type: 'paragraph',
              children: [{ text: paragraphText }]
            });
          }
          currentParagraphLines = [];
        }
        
        // 2. 添加 timestamp-divider 节点
        const timeStr = match[1]; // 提取时间戳字符串
        // 🔧 规范化为统一格式：YYYY-MM-DD HH:mm:ss（连字符 + 空格）
        const normalizedTimeStr = timeStr.replace(/\//g, '-'); // 斜杠转连字符
        
        slateNodes.push({
          type: 'timestamp-divider',
          timestamp: normalizedTimeStr, // 统一格式：YYYY-MM-DD HH:mm:ss
          children: [{ text: '' }]
        });
        
        // 3. 提取时间戳后面的内容（如果有）
        const restOfLine = line.substring(match[0].length).trim();
        if (restOfLine) {
          currentParagraphLines.push(restOfLine);
        }
        
      } else {
        // 普通文本行，累积到当前段落（包括空行）
        currentParagraphLines.push(line);
      }
    }
    
    // 处理最后剩余的段落
    if (currentParagraphLines.length > 0) {
      const paragraphText = currentParagraphLines.join('\n');
      if (paragraphText.trim()) {
        slateNodes.push({
          type: 'paragraph',
          children: [{ text: paragraphText }]
        });
      }
    }
    
    // 🔧 清理空的时间戳+段落对
    return this.cleanEmptyTimestampPairs(slateNodes);
  }

  /**
   * 🆕 从纯文本中解析并注入 Block-Level Timestamp
   * 
   * 输入:
   * ```
   * 2025-11-27 01:05:22
   * 第一段内容...
   * 2025-11-27 01:36:23
   * 第二段内容...
   * ```
   * 
   * 输出:
   * ```
   * [
   *   { 
   *     type: 'paragraph', 
   *     id: 'block_1701007522000_abc123',
   *     createdAt: 1701007522000,
   *     children: [{ text: '第一段内容...' }] 
   *   },
   *   { 
   *     type: 'paragraph', 
   *     id: 'block_1701009383000_def456',
   *     createdAt: 1701009383000,
   *     children: [{ text: '第二段内容...' }] 
   *   }
   * ]
   * ```
   */
  
  /**
   * 将时间戳（number 或 string）转换为 TimeSpec 格式（YYYY-MM-DD HH:mm:ss）
   */
  private static convertTimestampToTimeSpec(timestamp: number | string): string {
    if (typeof timestamp === 'number') {
      // Unix 毫秒时间戳 → TimeSpec
      return formatTimeForStorage(new Date(timestamp));
    } else if (typeof timestamp === 'string') {
      // 已经是 TimeSpec 格式，直接返回
      return timestamp;
    }
    return formatTimeForStorage(new Date());
  }
  
  private static parseTextWithBlockTimestamps(
    text: string,
    context: ParseContext
  ): any[] {
    const { eventCreatedAt, eventUpdatedAt, oldEventLog } = context;
    const slateNodes: any[] = [];
    const lines = text.split('\n');
    
    console.log('[parseTextWithBlockTimestamps] 🔍 开始解析:', {
      总行数: lines.length,
      前3行: lines.slice(0, 3)
    });
    
    // 🔧 时间戳正则（两种模式）：
    // 1. 独立成行：2025-12-15 21:24:26
    // 2. 行首时间戳：2025-12-15 21:24:26 内容...
    const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})/;
    
    let currentParagraphLines: string[] = [];
    let currentTimestamp: number | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(timestampPattern);
      
      if (match) {
        // 遇到时间戳行
        
        // 1. 先保存之前累积的段落内容（如果有）
        if (currentParagraphLines.length > 0) {
          // ✅ 多行内容保持为一个完整的 paragraph（不 trim，保留空行）
          const paragraphText = currentParagraphLines.join('\n');
          if (paragraphText.trim()) { // 只检查是否完全为空
            // ✅ 修复：遇到新时间戳前的段落，使用上一个时间戳或 eventCreatedAt
            const timestamp = currentTimestamp || eventCreatedAt || Date.now();
            slateNodes.push({
              type: 'paragraph',
              id: generateBlockId(timestamp),
              createdAt: timestamp,
              updatedAt: timestamp,  // 🆕 同时设置 updatedAt
              children: [{ text: paragraphText }]
            });
          }
          currentParagraphLines = [];
        }
        
        // 2. 解析新时间戳
        const timeStr = match[1].replace(/\//g, '-'); // 斜杠转连字符
        try {
          // 🔧 规范化日期格式：补零（2025-12-7 → 2025-12-07）
          const parts = timeStr.split(' ');
          const datePart = parts[0];
          const timePart = parts[1];
          
          // 分割日期部分并补零
          const [year, month, day] = datePart.split('-');
          const normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          const normalizedTimeStr = `${normalizedDate} ${timePart}`;
          
          // ⚠️ 直接使用 YYYY-MM-DD HH:mm:ss 格式（空格分隔符）
          currentTimestamp = new Date(normalizedTimeStr).getTime();
          console.log('[parseTextWithBlockTimestamps] ✅ 解析时间戳:', { 
            原始: timeStr, 
            规范化: normalizedTimeStr,
            Unix: currentTimestamp, 
            日期: new Date(currentTimestamp).toLocaleString() 
          });
        } catch (error) {
          console.warn('[parseTextWithBlockTimestamps] 解析时间戳失败:', timeStr, error);
          // ✅ 修复：解析失败时使用 eventCreatedAt，而不是同步时间
          currentTimestamp = eventCreatedAt || Date.now();
        }
        
        // 3. 提取时间戳后面的内容（如果有）
        const restOfLine = line.substring(match[0].length).trim();
        if (restOfLine) {
          // ✅ 时间戳 + 内容：2025-12-15 13:56:36 这是内容
          currentParagraphLines.push(restOfLine);
        }
        // ✅ 独立时间戳行：下一行开始新段落（currentParagraphLines 保持空数组，等待下一行）
        
      } else {
        // 普通文本行，累积到当前段落（包括空行）
        currentParagraphLines.push(line);
      }
    }
    
    // 处理最后剩余的段落
    if (currentParagraphLines.length > 0) {
      const paragraphText = currentParagraphLines.join('\n');
      if (paragraphText.trim()) {
        // ✅ 修复：未被时间戳包裹的文字使用 eventCreatedAt，而不是同步时间
        const timestamp = currentTimestamp || eventCreatedAt || Date.now();
        
        console.log('[parseTextWithBlockTimestamps] 📝 处理剩余段落:', {
          段落内容: paragraphText.substring(0, 50),
          currentTimestamp: currentTimestamp ? new Date(currentTimestamp).toLocaleString() : 'null',
          eventCreatedAt: eventCreatedAt ? new Date(eventCreatedAt).toLocaleString() : 'undefined',
          最终使用: new Date(timestamp).toLocaleString(),
          是否使用eventCreatedAt: !currentTimestamp && eventCreatedAt
        });
        
        slateNodes.push({
          type: 'paragraph',
          id: generateBlockId(timestamp),
          createdAt: timestamp,
          updatedAt: timestamp,  // 🆕 同时设置 updatedAt
          children: [{ text: paragraphText }]
        });
      }
    }
    
    console.log('[parseTextWithBlockTimestamps] ✅ Step 1 完成（解析时间戳）:', {
      生成节点数: slateNodes.length,
      节点详情: slateNodes.map(n => ({ createdAt: n.createdAt, 文本长度: n.children[0]?.text?.length }))
    });
    
    // 🆕 Step 2: 处理未被时间戳包裹的文字
    // 检查是否有文本内容没有以时间戳开头（首行没有时间戳）
    if (slateNodes.length === 0 && text.trim()) {
      // 完全没有时间戳的情况，整个文本作为一个段落
      const fallbackTimestamp = eventCreatedAt || Date.now();
      console.log('[parseTextWithBlockTimestamps] ⚠️ Step 2: 未发现时间戳，使用 Event.createdAt:', {
        eventCreatedAt,
        使用时间戳: new Date(fallbackTimestamp).toLocaleString()
      });
      slateNodes.push({
        type: 'paragraph',
        id: generateBlockId(fallbackTimestamp),
        createdAt: fallbackTimestamp,
        updatedAt: fallbackTimestamp,
        children: [{ text: text.trim() }]
      });
    }
    // ✅ 空内容不再创建空段落（会在下面的过滤中移除）
    
    // 🆕 Step 3: Diff 比较（仅 Update 时）
    if (oldEventLog) {
      console.log('[parseTextWithBlockTimestamps] 🔍 Step 3: 开始 Diff 比较');
      
      let oldNodes: any[] = [];
      try {
        oldNodes = typeof oldEventLog.slateJson === 'string' 
          ? JSON.parse(oldEventLog.slateJson) 
          : oldEventLog.slateJson;
      } catch (e) {
        console.warn('[parseTextWithBlockTimestamps] 解析旧 slateJson 失败:', e);
      }
      
      // 比较文本内容（逐行 diff）
      const oldTexts = oldNodes.map((n: any) => 
        n.children?.map((c: any) => c.text || '').join('') || ''
      );
      const newTexts = slateNodes.map((n: any) => 
        n.children?.map((c: any) => c.text || '').join('') || ''
      );
      
      console.log('[parseTextWithBlockTimestamps] Diff 结果:', {
        旧节点数: oldTexts.length,
        新节点数: newTexts.length,
        旧内容前100字: oldTexts.join('\\n').substring(0, 100),
        新内容前100字: newTexts.join('\\n').substring(0, 100)
      });
      
      // 🚀 性能优化：快速路径
      // 场景1：有新增节点 → 只给新增的节点设置 updatedAt
      if (newTexts.length > oldTexts.length) {
        const updateTimestamp = eventUpdatedAt || Date.now();
        
        console.log('[parseTextWithBlockTimestamps] ✅ 检测到', newTexts.length - oldTexts.length, '个新增节点');
        
        // 为新增的节点设置时间戳
        for (let i = oldTexts.length; i < newTexts.length; i++) {
          slateNodes[i].createdAt = updateTimestamp;
          slateNodes[i].updatedAt = updateTimestamp;
          slateNodes[i].id = generateBlockId(updateTimestamp);
        }
      }
      // 场景2：节点数相同 → 只检查最后一个节点（最常见的追加场景）
      else if (newTexts.length === oldTexts.length && newTexts.length > 0) {
        const lastIndex = newTexts.length - 1;
        
        if (newTexts[lastIndex] !== oldTexts[lastIndex]) {
          // 最后一个节点有变化，更新它的 updatedAt
          const updateTimestamp = eventUpdatedAt || Date.now();
          slateNodes[lastIndex].updatedAt = updateTimestamp;
          
          console.log('[parseTextWithBlockTimestamps] 📝 最后一个节点内容变化，更新 updatedAt');
        } else {
          // 内容未变，保留旧时间戳（复用所有节点的旧时间戳）
          for (let i = 0; i < oldNodes.length; i++) {
            if (oldNodes[i]?.createdAt) {
              slateNodes[i].createdAt = oldNodes[i].createdAt;
              slateNodes[i].updatedAt = oldNodes[i].updatedAt || oldNodes[i].createdAt;
              slateNodes[i].id = oldNodes[i].id;
            }
          }
          
          console.log('[parseTextWithBlockTimestamps] ⏭️ 内容未变化，保留所有旧时间戳');
        }
      }
    }
    
    // 🧹 过滤空节点（删除内容为空或只有空白的节点）
    slateNodes = slateNodes.filter(node => {
      const text = node.children?.[0]?.text || '';
      return text.trim().length > 0;
    });
    
    console.log('[parseTextWithBlockTimestamps] ✅ 所有步骤完成:', {
      最终节点数: slateNodes.length,
      节点详情: slateNodes.map(n => ({ 
        id: n.id, 
        createdAt: new Date(n.createdAt).toLocaleString(), 
        updatedAt: new Date(n.updatedAt).toLocaleString(),
        文本: n.children[0]?.text?.substring(0, 30) 
      }))
    });
    
    return slateNodes;
  }

  /**
   * 🔧 扁平化 Slate 节点，移除嵌套的 paragraph（v2.18.8）
   * 
   * 问题：Slate JSON 可能包含嵌套的 paragraph：
   * { type: 'paragraph', children: [{ type: 'paragraph', children: [...] }] }
   * 
   * 这会导致 React 警告：<p> cannot be a descendant of <p>
   * 
   * 解决方案：递归扁平化，确保 paragraph 的 children 只包含 text 节点
   */
  private static flattenSlateNodes(nodes: any[]): any[] {
    const flattened: any[] = [];
    
    for (const node of nodes) {
      if (node.type === 'paragraph') {
        // 检查 children 中是否有嵌套的 paragraph
        const hasNestedParagraph = node.children?.some((child: any) => 
          child.type === 'paragraph'
        );
        
        if (hasNestedParagraph) {
          // 递归提取所有嵌套的 paragraph
          const extractParagraphs = (n: any): any[] => {
            if (n.type === 'paragraph') {
              // 如果子节点中还有 paragraph，继续递归
              const nestedParagraphs = n.children?.filter((c: any) => c.type === 'paragraph') || [];
              const textNodes = n.children?.filter((c: any) => c.text !== undefined) || [];
              
              if (nestedParagraphs.length > 0) {
                // 先添加当前层的文本节点
                const results: any[] = [];
                if (textNodes.length > 0) {
                  results.push({
                    type: 'paragraph',
                    createdAt: n.createdAt, // 保留时间戳
                    children: textNodes
                  });
                }
                
                // 递归处理嵌套的 paragraph
                for (const nested of nestedParagraphs) {
                  results.push(...extractParagraphs(nested));
                }
                
                return results;
              } else {
                // 没有嵌套，直接返回
                return [{
                  type: 'paragraph',
                  createdAt: n.createdAt,
                  children: textNodes.length > 0 ? textNodes : [{ text: '' }]
                }];
              }
            }
            return [n];
          };
          
          flattened.push(...extractParagraphs(node));
        } else {
          // 没有嵌套，直接添加
          flattened.push(node);
        }
      } else {
        // 非 paragraph 节点，直接添加
        flattened.push(node);
      }
    }
    
    return flattened;
  }

  /**
   * 将 Slate JSON 字符串转换为完整的 EventLog 对象
   * （由 normalizeEventLog 调用）
   */
  private static convertSlateJsonToEventLog(slateJson: string): EventLog {
    // 🔧 检测并修复非 JSON 输入（架构错误：不应该传纯文本进来）
    let normalizedSlateJson = slateJson;
    const trimmed = slateJson.trim();
    
    // 检测是否真的是 JSON 格式
    const looksLikeJson = trimmed.startsWith('[{') && trimmed.endsWith('}]') ||
                         trimmed === '[]';
    
    if (!looksLikeJson && trimmed) {
      console.error(`[convertSlateJsonToEventLog] 🚨 架构错误：收到非 JSON 输入: ${trimmed.substring(0, 100)}`);
      console.trace('[convertSlateJsonToEventLog] 调用堆栈');
      
      // 临时兼容：转换纯文本为 Slate JSON
      normalizedSlateJson = JSON.stringify([{
        type: 'paragraph',
        children: [{ text: trimmed }]
      }]);
      console.log('[convertSlateJsonToEventLog] 已转换为 Slate JSON（临时兼容）');
    }
    
    try {
      // 🆕 [v2.18.8] 扁平化 Slate 节点，移除嵌套的 paragraph
      let slateNodes = jsonToSlateNodes(normalizedSlateJson);
      slateNodes = this.flattenSlateNodes(slateNodes);
      normalizedSlateJson = JSON.stringify(slateNodes); // 使用扁平化后的数据
      
      const htmlDescription = slateNodesToHtml(slateNodes);
      const plainTextDescription = htmlDescription.replace(/<[^>]*>/g, '');
      
      return {
        slateJson: normalizedSlateJson,
        html: htmlDescription,
        plainText: plainTextDescription,
        attachments: [],
        versions: [],
        syncState: {
          status: 'pending',
          contentHash: this.hashContent(normalizedSlateJson), // 使用扁平化后的数据
        },
        createdAt: formatTimeForStorage(new Date()),
        updatedAt: formatTimeForStorage(new Date()),
      };
    } catch (error) {
      console.error('[EventService] convertSlateJsonToEventLog 失败:', error);
      // 降级返回空对象
      return {
        slateJson: '[]',
        html: '',
        plainText: '',
        attachments: [],
        versions: [],
        syncState: { status: 'pending' },
        createdAt: formatTimeForStorage(new Date()),
        updatedAt: formatTimeForStorage(new Date()),
      };
    }
  }

  /**
   * 为 description 字段维护签名
   * 签名格式：
   * - 同一来源：由 🔮 4DNote 创建于 YYYY-MM-DD HH:mm:ss，最后修改于 YYYY-MM-DD HH:mm:ss
   * - 不同来源：
   *   由 🔮 4DNote 创建于 YYYY-MM-DD HH:mm:ss
   *   由 📧 Outlook 最后修改于 YYYY-MM-DD HH:mm:ss
   * 
   * @param coreContent - 去除签名的核心内容
   * @param event - 事件对象（包含创建时间、更新时间、来源等元数据）
   * @param lastModifiedSource - 最后修改来源（'4dnote' | 'outlook'，可选）
   * @returns 带签名的完整 description
   */
  private static maintainDescriptionSignature(
    coreContent: string, 
    event: Partial<Event>,
    lastModifiedSource?: '4dnote' | 'outlook'
  ): string {
    // 🔍 检查核心内容是否已包含签名（避免重复添加）
    const hasExistingSignature = /由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)/.test(coreContent);
    
    if (hasExistingSignature) {
      // 已有签名，直接返回原内容（不重复添加）
      return coreContent;
    }
    
    const lines: string[] = [];
    
    // 1. 添加核心内容
    if (coreContent && coreContent.trim()) {
      lines.push(coreContent.trim());
      lines.push(''); // 空行
    }
    
    // 2. 添加分隔线
    lines.push('---');
    
    // 3. 确定创建来源和时间
    const isLocalCreated = event.fourDNoteSource === true || event.source === 'local' || !event.source;
    const createSource = isLocalCreated ? '🔮 4DNote' : '📧 Outlook';
    const createSourceKey = isLocalCreated ? '4dnote' : 'outlook';
    const createTime = event.createdAt || formatTimeForStorage(new Date());
    
    // 4. 确定修改来源（优先使用传入的 lastModifiedSource，否则假设与创建来源相同）
    const modifySourceKey = lastModifiedSource || createSourceKey;
    const modifySource = modifySourceKey === '4dnote' ? '🔮 4DNote' : '📧 Outlook';
    
    // 5. 生成签名
    if (event.updatedAt && event.updatedAt !== event.createdAt) {
      const modifyTime = event.updatedAt;
      
      if (createSourceKey === modifySourceKey) {
        // 同一来源：一行签名
        lines.push(`由 ${createSource} 创建于 ${createTime}，最后修改于 ${modifyTime}`);
      } else {
        // 不同来源：两行签名
        lines.push(`由 ${createSource} 创建于 ${createTime}`);
        lines.push(`由 ${modifySource} 最后修改于 ${modifyTime}`);
      }
    } else {
      // 未修改：只显示创建信息
      lines.push(`由 ${createSource} 创建于 ${createTime}`);
    }
    
    return lines.join('\n');
  }

  /**
   * 从 description 中移除签名，提取核心内容
   * @param description - 原始 description（可能包含签名）
   * @returns 去除签名的核心内容
   */
  private static extractCoreContentFromDescription(description: string): string {
    if (!description) return '';
    
    // 移除签名部分（支持多种格式）
    let core = description
      // 移除完整签名块（---\n由...创建于...）
      .replace(/\n?---\n由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*创建于\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*$/i, '')
      // 移除单行签名（创建）
      .replace(/\n?由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*创建于\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*$/gi, '')
      // 移除单行签名（编辑/修改）
      .replace(/\n?由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*(?:编辑于|最后(?:编辑|修改)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*$/gi, '');
    
    return core.trim();
  }

  /**
   * 从 description 或 HTML 中提取签名时间戳
   * @param content - description 或 HTML 内容（可能包含签名）
   * @returns { createdAt?: string, updatedAt?: string } - 提取的时间戳（ISO 格式）
   */
  private static extractTimestampsFromSignature(content: string): { createdAt?: string; updatedAt?: string } {
    if (!content) return {};
    
    const result: { createdAt?: string; updatedAt?: string } = {};
    
    // 1️⃣ 提取创建时间
    // 支持格式：
    // - "由 🔮 4DNote 创建于 2025-12-15 10:00:00"
    // - "由 📧 Outlook 创建于 2025-12-15 10:00:00"
    // - HTML: "由 <emoji> 4DNote 创建于 2025-12-15 10:00:00"
    const createPattern = /由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*创建于\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i;
    const createMatch = content.match(createPattern);
    
    if (createMatch && createMatch[1]) {
      try {
        // ✅ 直接使用 TimeSpec 格式（YYYY-MM-DD HH:mm:ss），不转换 ISO
        const timeStr = createMatch[1];
        const parsedTime = parseLocalTimeString(timeStr);
        
        if (parsedTime) {
          result.createdAt = timeStr; // 直接使用原始字符串（已是 TimeSpec 格式）
        }
      } catch (error) {
        console.warn('[extractTimestampsFromSignature] 解析创建时间失败:', createMatch[1], error);
      }
    }
    
    // 2️⃣ 提取最后修改时间
    // 支持格式：
    // - "最后修改于 2025-12-15 11:30:00"
    // - "最后编辑于 2025-12-15 11:30:00"
    // - "编辑于 2025-12-15 11:30:00"
    // - 合并格式: "创建于 2025-12-15 10:00:00，最后修改于 2025-12-15 11:30:00"
    const updatePattern = /(?:最后修改于|最后编辑于|编辑于)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i;
    const updateMatch = content.match(updatePattern);
    
    if (updateMatch && updateMatch[1]) {
      try {
        // ✅ 直接使用 TimeSpec 格式（YYYY-MM-DD HH:mm:ss），不转换 ISO
        const timeStr = updateMatch[1];
        const parsedTime = parseLocalTimeString(timeStr);
        
        if (parsedTime) {
          result.updatedAt = timeStr; // 直接使用原始字符串（已是 TimeSpec 格式）
        }
      } catch (error) {
        console.warn('[extractTimestampsFromSignature] 解析修改时间失败:', updateMatch[1], error);
      }
    }
    
    return result;
  }

  /**
   * 从 description 或 HTML 中提取签名创建者信息
   * @param content - description 或 HTML 内容（可能包含签名）
   * @returns { fourDNoteSource?: boolean, source?: 'outlook' | 'local', lastModifiedSource?: '4dnote' | 'outlook' } - 提取的创建者和修改者信息
   */
  private static extractCreatorFromSignature(content: string): { 
    fourDNoteSource?: boolean; 
    source?: 'outlook' | 'local';
    lastModifiedSource?: '4dnote' | 'outlook';
  } {
    if (!content) return {};
    
    const result: { 
      fourDNoteSource?: boolean; 
      source?: 'outlook' | 'local';
      lastModifiedSource?: '4dnote' | 'outlook';
    } = {};
    
    // 🔍 提取创建者
    // 支持格式：
    // - "由 🔮 4DNote 创建于..."
    // - "由 📧 Outlook 创建于..."
    // - HTML: "由 <span>🔮</span> 4DNote 创建于..."
    const creatorPattern = /由\s+(?:🔮|📧|🟣)?\s*(4DNote|Outlook)\s*创建于/i;
    const creatorMatch = content.match(creatorPattern);
    
    if (creatorMatch && creatorMatch[1]) {
      const creator = creatorMatch[1].toLowerCase();
      
      if (creator === '4dnote') {
        result.fourDNoteSource = true;
        result.source = 'local';
      } else if (creator === 'outlook') {
        result.fourDNoteSource = false;
        result.source = 'outlook';
      }
    }
    
    // 🆕 提取修改者
    // 支持格式：
    // - "由 🔮 4DNote 最后修改于..."
    // - "由 📧 Outlook 最后修改于..."
    // - "由 🔮 4DNote 最后编辑于..."
    const modifierPattern = /由\s+(?:🔮|📧|🟣)?\s*(4DNote|Outlook)\s*最后(?:修改|编辑)于/i;
    const modifierMatch = content.match(modifierPattern);
    
    if (modifierMatch && modifierMatch[1]) {
      const modifier = modifierMatch[1].toLowerCase();
      result.lastModifiedSource = modifier === '4dnote' ? '4dnote' : 'outlook';
    }
    
    return result;
  }
  
  /**
   * 清理 Outlook Exchange Server 生成的多层嵌套 HTML
   * 解决问题：Outlook 会对内容进行多次 HTML 转义，导致 &amp;lt; 这样的多层编码
   */
  private static cleanupOutlookHtml(html: string): string {
    let cleaned = html;
    
    // 1️⃣ 递归解码 HTML 实体（最多解码 10 层，防止无限循环）
    for (let i = 0; i < 10; i++) {
      const before = cleaned;
      cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      
      // 如果没有变化，说明解码完成
      if (before === cleaned) break;
    }
    
    // 2️⃣ 移除 Exchange Server 模板代码
    cleaned = cleaned
      // 移除 <head> 标签及其内容
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      // 移除 meta 标签
      .replace(/<meta[^>]*>/gi, '')
      // 移除 style 标签
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // 移除注释
      .replace(/<!--[\s\S]*?-->/g, '')
      // 移除 font 和 span 包装（保留内容）
      .replace(/<\/?font[^>]*>/gi, '')
      .replace(/<\/?span[^>]*>/gi, '');
    
    // 3️⃣ 清理签名行（"由 XXX 创建于 YYYY-MM-DD HH:mm:ss"）
    // 支持多种格式：
    // - "---<br>由 🔮 4DNote 创建于 2025-12-07 02:05:42"
    // - "由 📧 Outlook 编辑于 2025-12-07 02:05:42"
    // - "由 4DNote 最后编辑于 2025-12-07 02:05:42"
    cleaned = cleaned
      .replace(/---\s*<br[^>]*>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*(?:创建于|编辑于|最后编辑于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/gi, '')
      .replace(/由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook)\s*(?:创建于|编辑于|最后编辑于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/gi, '');
    
    // 4️⃣ 清理多余的 <br> 标签（连续 3 个以上）
    cleaned = cleaned.replace(/(<br[^>]*>\s*){3,}/gi, '<br><br>');
    
    // 5️⃣ 提取 .PlainText 内容（如果存在）
    const plainTextMatch = cleaned.match(/<div[^>]*class=["']PlainText["'][^>]*>([\s\S]*?)<\/div>/i);
    if (plainTextMatch) {
      cleaned = plainTextMatch[1];
    }
    
    // 6️⃣ 清理多余的空白标签
    cleaned = cleaned
      .replace(/<div[^>]*>\s*<\/div>/gi, '')
      .replace(/<p[^>]*>\s*<\/p>/gi, '');
    
    return cleaned.trim();
  }

  /**
   * HTML 转换为 Slate JSON（含反向识别）
   * 从 Outlook 返回的 HTML 中识别出 App 元素（Tag、DateMention 等）
   */
  private static htmlToSlateJsonWithRecognition(html: string): string {
    try {
      // 🔥 预处理：清理 Outlook Exchange Server 的多层嵌套和转义
      const cleanedHtml = this.cleanupOutlookHtml(html);
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cleanedHtml;
      
      // 🔧 优先从 <body> 元素提取内容（处理完整 HTML 文档）
      const bodyElement = tempDiv.querySelector('body');
      const contentElement = bodyElement || tempDiv;
      
      const slateNodes: any[] = [];
      
      // 遍历 HTML 节点并转换
      this.parseHtmlNode(contentElement, slateNodes);
      
      // 确保至少有一个段落
      if (slateNodes.length === 0) {
        slateNodes.push({
          type: 'paragraph',
          children: [{ text: '' }]
        });
      }
      
      return JSON.stringify(slateNodes);
    } catch (error) {
      console.error('[EventService] htmlToSlateJsonWithRecognition 失败:', error);
      // 降级返回空数组
      return '[]';
    }
  }
  
  /**
   * 递归解析 HTML 节点
   */
  private static parseHtmlNode(node: Node, slateNodes: any[]): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim()) {
        // 检查文本中是否包含 Tag 或 DateMention 模式
        const fragments = this.recognizeInlineElements(text);
        slateNodes.push(...fragments);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      
      // 1. 精确匹配：检查 data-* 属性
      const recognizedNode = this.recognizeByDataAttributes(element);
      if (recognizedNode) {
        slateNodes.push(recognizedNode);
        return;
      }
      
      // 2. 块级元素：段落、列表等
      if (element.tagName === 'P' || element.tagName === 'DIV') {
        // 🔧 检查是否包含 <br> 标签，如果有则按 <br> 分割成多个段落
        const hasBr = Array.from(element.childNodes).some(
          child => child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'BR'
        );
        
        if (hasBr) {
          // 按 <br> 分割成多个段落
          let currentParagraphChildren: any[] = [];
          
          element.childNodes.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'BR') {
              // 遇到 <br>，结束当前段落
              if (currentParagraphChildren.length > 0) {
                slateNodes.push({
                  type: 'paragraph',
                  children: currentParagraphChildren
                });
                currentParagraphChildren = [];
              }
            } else {
              // 添加到当前段落
              this.parseHtmlNode(child, currentParagraphChildren);
            }
          });
          
          // 处理最后一个段落
          if (currentParagraphChildren.length > 0) {
            slateNodes.push({
              type: 'paragraph',
              children: currentParagraphChildren
            });
          }
        } else {
          // 没有 <br>，正常处理
          const paragraphChildren: any[] = [];
          element.childNodes.forEach(child => {
            this.parseHtmlNode(child, paragraphChildren);
          });
          
          if (paragraphChildren.length > 0) {
            // 🆕 保留 bullet 属性（Bulletpoint 功能）
            const bullet = element.getAttribute('data-bullet') === 'true';
            const bulletLevel = element.getAttribute('data-bullet-level');
            
            const paragraphNode: any = {
              type: 'paragraph',
              children: paragraphChildren
            };
            
            if (bullet && bulletLevel !== null) {
              paragraphNode.bullet = true;
              paragraphNode.bulletLevel = parseInt(bulletLevel, 10);
              console.log('[EventService.parseHtmlNode] ✅ 保留 Bullet 属性:', { bullet, bulletLevel });
            }
            
            slateNodes.push(paragraphNode);
          }
        }
        return;
      }
      
      // 3. 格式化元素：bold, italic, underline 等
      if (['STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN'].includes(element.tagName)) {
        const marks: any = {};
        
        if (element.tagName === 'STRONG' || element.tagName === 'B') marks.bold = true;
        if (element.tagName === 'EM' || element.tagName === 'I') marks.italic = true;
        if (element.tagName === 'U') marks.underline = true;
        if (element.tagName === 'S') marks.strikethrough = true;
        
        // 提取颜色
        const style = element.getAttribute('style');
        if (style) {
          const colorMatch = style.match(/color:\s*([^;]+)/);
          const bgColorMatch = style.match(/background-color:\s*([^;]+)/);
          if (colorMatch) marks.color = colorMatch[1].trim();
          if (bgColorMatch) marks.backgroundColor = bgColorMatch[1].trim();
        }
        
        // 递归处理子节点
        element.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            slateNodes.push({ text: child.textContent || '', ...marks });
          } else {
            this.parseHtmlNode(child, slateNodes);
          }
        });
        return;
      }
      
      // 4. 其他元素：递归处理子节点
      element.childNodes.forEach(child => {
        this.parseHtmlNode(child, slateNodes);
      });
    }
  }
  
  /**
   * 通过 data-* 属性精确识别元素
   */
  private static recognizeByDataAttributes(element: HTMLElement): any | null {
    // TagNode 识别
    if (element.hasAttribute('data-tag-id')) {
      return {
        type: 'tag',
        tagId: element.getAttribute('data-tag-id') || '',
        tagName: element.getAttribute('data-tag-name') || '',
        tagColor: element.getAttribute('data-tag-color') || undefined,
        tagEmoji: element.getAttribute('data-tag-emoji') || undefined,
        mentionOnly: element.hasAttribute('data-mention-only'),
        children: [{ text: '' }]
      };
    }
    
    // DateMentionNode 识别
    if (element.getAttribute('data-type') === 'dateMention' || element.hasAttribute('data-start-date')) {
      const startDate = element.getAttribute('data-start-date');
      if (startDate) {
        return {
          type: 'dateMention',
          startDate: startDate,
          endDate: element.getAttribute('data-end-date') || undefined,
          eventId: element.getAttribute('data-event-id') || undefined,
          originalText: element.getAttribute('data-original-text') || undefined,
          isOutdated: element.getAttribute('data-is-outdated') === 'true',
          children: [{ text: '' }]
        };
      }
    }
    
    return null;
  }
  
  /**
   * 识别文本中的内联元素（Tag、DateMention）
   * 使用正则模式进行模糊匹配
   */
  private static recognizeInlineElements(text: string): any[] {
    const fragments: any[] = [];
    let lastIndex = 0;
    
    // 1. 尝试识别 TagNode
    const tagMatches = this.recognizeTagNodeByPattern(text);
    
    // 2. 尝试识别 DateMentionNode
    const dateMatches = this.recognizeDateMentionByPattern(text);
    
    // 合并所有匹配结果并排序
    const allMatches = [...tagMatches, ...dateMatches].sort((a, b) => a.index - b.index);
    
    // 构建最终的 fragments
    for (const match of allMatches) {
      // 添加匹配前的纯文本
      if (match.index > lastIndex) {
        fragments.push({ text: text.slice(lastIndex, match.index) });
      }
      
      // 添加识别的节点
      fragments.push(match.node);
      
      lastIndex = match.index + match.length;
    }
    
    // 添加剩余的文本
    if (lastIndex < text.length) {
      fragments.push({ text: text.slice(lastIndex) });
    }
    
    // 如果没有匹配任何元素，返回整个文本
    if (fragments.length === 0) {
      fragments.push({ text: text });
    }
    
    return fragments;
  }
  
  /**
   * 使用正则模式识别 TagNode
   * 返回匹配位置和节点信息
   */
  private static recognizeTagNodeByPattern(text: string): Array<{ index: number; length: number; node: any }> {
    const matches: Array<{ index: number; length: number; node: any }> = [];
    
    // Tag 模式: (emoji)? @tagName
    // 支持: "@工作", "💼 @工作", "📅 @会议"
    // 注：简化正则，不使用 \p{Emoji}（需要 ES2018+）
    const tagPattern = /(@[\w\u4e00-\u9fa5]+)/g;
    
    let match;
    while ((match = tagPattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const index = match.index;
      
      // 提取 emoji 和标签名（简化处理，emoji 需要在前面单独提取）
      const emojiMatch = null; // 暂时禁用 emoji 匹配
      const tagEmoji = emojiMatch ? emojiMatch[1] : undefined;
      const tagName = emojiMatch ? emojiMatch[2] : fullMatch.replace('@', '');
      
      // TODO: 这里应该查询 TagService，但为了避免循环依赖，暂时创建新标签
      // 实际使用时需要注入 TagService 或使用事件总线
      const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      matches.push({
        index,
        length: fullMatch.length,
        node: {
          type: 'tag',
          tagId: tagId,
          tagName: tagName,
          tagEmoji: tagEmoji,
          children: [{ text: '' }]
        }
      });
    }
    
    return matches;
  }
  
  /**
   * 使用正则模式识别 DateMentionNode
   * 返回匹配位置和节点信息
   */
  private static recognizeDateMentionByPattern(text: string): Array<{ index: number; length: number; node: any }> {
    const matches: Array<{ index: number; length: number; node: any }> = [];
    
    // DateMention 模式1: "11/29 10:00" or "11/29 10:00 - 12:00"
    const pattern1 = /(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?)/g;
    
    // DateMention 模式2: "2025-11-29 10:00" or "2025-11-29 10:00 - 12:00"
    const pattern2 = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?:\s*-\s*\d{2}:\d{2})?)/g;
    
    // DateMention 模式3: "今天下午3点" or "明天上午9点"
    const pattern3 = /(今天|明天|后天|下周[一二三四五六日])(?:\s*(上午|下午|晚上))?(?:\s*(\d{1,2})点)?/g;
    
    const patterns = [pattern1, pattern2, pattern3];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const fullMatch = match[0];
        const index = match.index;
        
        // 尝试解析日期（这里简化处理，实际应该使用 TimeHub 的解析功能）
        try {
          // TODO: 集成 TimeHub 的日期解析
          // 暂时使用简化版本
          const startDate = this.parseSimpleDate(fullMatch);
          
          if (startDate) {
            matches.push({
              index,
              length: fullMatch.length,
              node: {
                type: 'dateMention',
                startDate: startDate,
                originalText: fullMatch,
                isOutdated: false,
                children: [{ text: '' }]
              }
            });
          }
        } catch (error) {
          console.warn('[EventService] 日期解析失败:', fullMatch, error);
        }
      }
    }
    
    return matches;
  }
  
  /**
   * 简化的日期解析（用于 recognizeDateMentionByPattern）
   * TODO: 应该使用 TimeHub 的完整解析功能
   */
  private static parseSimpleDate(dateText: string): string | null {
    const now = new Date();
    
    // 模式1: "11/29 10:00"
    const pattern1Match = dateText.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (pattern1Match) {
      const month = parseInt(pattern1Match[1], 10) - 1; // JS 月份从 0 开始
      const day = parseInt(pattern1Match[2], 10);
      const hour = parseInt(pattern1Match[3], 10);
      const minute = parseInt(pattern1Match[4], 10);
      
      const date = new Date(now.getFullYear(), month, day, hour, minute);
      return formatTimeForStorage(date);
    }
    
    // 模式2: "2025-11-29 10:00"
    const pattern2Match = dateText.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (pattern2Match) {
      const year = parseInt(pattern2Match[1], 10);
      const month = parseInt(pattern2Match[2], 10) - 1;
      const day = parseInt(pattern2Match[3], 10);
      const hour = parseInt(pattern2Match[4], 10);
      const minute = parseInt(pattern2Match[5], 10);
      
      const date = new Date(year, month, day, hour, minute);
      return formatTimeForStorage(date);
    }
    
    // 模式3: "今天下午3点"（简化处理）
    if (dateText.includes('今天')) {
      const hourMatch = dateText.match(/(\d{1,2})点/);
      if (hourMatch) {
        let hour = parseInt(hourMatch[1], 10);
        if (dateText.includes('下午') && hour < 12) hour += 12;
        
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0);
        return formatTimeForStorage(date);
      }
    }
    
    return null;
  }

  /**
   * 搜索历史事件中的参会人
   * 从所有事件的 organizer 和 attendees 字段提取联系人
   */
  static async searchHistoricalParticipants(query: string): Promise<import('../types').Contact[]> {
    const allEvents = await this.getAllEvents();
    const contactsMap = new Map<string, import('../types').Contact>();
    const lowerQuery = query.toLowerCase();

    allEvents.forEach(event => {
      // 提取 organizer
      if (event.organizer) {
        const key = event.organizer.email || event.organizer.name;
        if (key && !contactsMap.has(key)) {
          const matches = 
            event.organizer.name?.toLowerCase().includes(lowerQuery) ||
            event.organizer.email?.toLowerCase().includes(lowerQuery) ||
            event.organizer.organization?.toLowerCase().includes(lowerQuery);
          
          if (matches) {
            contactsMap.set(key, { ...event.organizer });
          }
        }
      }

      // 提取 attendees
      if (event.attendees) {
        event.attendees.forEach(attendee => {
          const key = attendee.email || attendee.name;
          if (key && !contactsMap.has(key)) {
            const matches =
              attendee.name?.toLowerCase().includes(lowerQuery) ||
              attendee.email?.toLowerCase().includes(lowerQuery) ||
              attendee.organization?.toLowerCase().includes(lowerQuery);
            
            if (matches) {
              contactsMap.set(key, { ...attendee });
            }
          }
        });
      }
    });

    return Array.from(contactsMap.values());
  }

  /**
   * 获取与特定联系人相关的事件
   * @param identifier 联系人邮箱或姓名
   * @param limit 返回数量限制
   */
  static async getEventsByContact(identifier: string, limit: number = 5): Promise<Event[]> {
    const allEvents = await this.getAllEvents();
    const lowerIdentifier = identifier.toLowerCase();
    
    const relatedEvents = allEvents.filter(event => {
      // 检查 organizer
      if (event.organizer) {
        if (event.organizer.email?.toLowerCase() === lowerIdentifier ||
            event.organizer.name?.toLowerCase() === lowerIdentifier) {
          return true;
        }
      }
      
      // 检查 attendees
      if (event.attendees) {
        return event.attendees.some(attendee =>
          attendee.email?.toLowerCase() === lowerIdentifier ||
          attendee.name?.toLowerCase() === lowerIdentifier
        );
      }
      
      return false;
    });

    // 按时间倒序排列，返回最近的 N 个
    return relatedEvents
      .sort((a, b) => {
        const timeA = new Date(
          (a.startTime != null && a.startTime !== '') ? a.startTime : a.createdAt
        ).getTime();
        const timeB = new Date(
          (b.startTime != null && b.startTime !== '') ? b.startTime : b.createdAt
        ).getTime();
        return timeB - timeA;
      })
      .slice(0, limit);
  }

  // ========== 日历同步相关方法 ==========

  /**
   * 🆕 v2.0.6 统一多日历同步管理器
   * 
   * 核心功能：
   * 1. 管理 calendarIds、syncMode 和 externalIds 的联动
   * 2. 根据 syncMode 决定发送/接收逻辑
   * 3. 本地一个 event，远程多个日历可能有多个事件
   * 4. 远程多事件智能合并到本地单事件
   * 
   * SyncMode 逻辑：
   * - receive-only: 只接收远程更新，不发送到远程
   * - send-only / send-only-private: 只发送到远程，不接收远程更新
   * - bidirectional / bidirectional-private: 双向同步
   * 
   * @param event 要同步的事件
   * @param calendarIds 目标日历 IDs
   * @param syncMode 同步模式
   * @param syncType 同步类型：'plan' 或 'actual'
   * @returns 远程事件 ID 映射 Map<calendarId, remoteEventId>
   */
  static async syncToMultipleCalendars(
    event: Event,
    calendarIds: string[],
    syncMode: string,
    syncType: 'plan' | 'actual'
  ): Promise<Map<string, string>> {
    const remoteEventIds = new Map<string, string>();
    
    try {
      eventLogger.log(`📤 [syncToMultipleCalendars] 开始同步到多个日历`, {
        eventId: event.id,
        calendarIds,
        syncMode,
        syncType
      });
      
      // ========== 第一步：SyncMode 发送逻辑检查 ==========
      const canSendToRemote = this.canSendToRemote(syncMode);
      
      if (!canSendToRemote) {
        eventLogger.log(`⏭️ [syncToMultipleCalendars] SyncMode 不允许发送到远程: ${syncMode}`);
        // receive-only 模式，不发送到远程，但保留现有的 syncedCalendars
        return new Map();
      }
      
      // 获取 Microsoft Calendar Service（从 syncManager 中获取）
      if (!syncManagerInstance?.microsoftService) {
        eventLogger.error('❌ [syncToMultipleCalendars] MicrosoftService 未初始化');
        throw new Error('MicrosoftCalendarService not initialized in syncManager');
      }
      const microsoftService = syncManagerInstance.microsoftService;
      
      // ========== 第二步：获取现有同步状态 ==========
      const existingSyncedCalendars = syncType === 'plan' 
        ? (event.syncedPlanCalendars || [])
        : (event.syncedActualCalendars || []);
      
      eventLogger.log(`📋 [syncToMultipleCalendars] 现有同步状态`, {
        existingSyncedCount: existingSyncedCalendars.length,
        newCalendarCount: calendarIds.length
      });
      
      // ========== 第三步：删除旧的远程事件（日历分组变更） ==========
      const calendarsToDelete = existingSyncedCalendars.filter(
        cal => !calendarIds.includes(cal.calendarId)
      );
      
      for (const oldCalendar of calendarsToDelete) {
        try {
          await microsoftService.deleteEvent(oldCalendar.remoteEventId);
          eventLogger.log(`🗑️ [syncToMultipleCalendars] 删除旧远程事件`, {
            calendarId: oldCalendar.calendarId,
            remoteEventId: oldCalendar.remoteEventId
          });
        } catch (deleteError) {
          eventLogger.error(`❌ [syncToMultipleCalendars] 删除失败，继续处理`, deleteError);
        }
      }
      
      // ========== 第四步：同步到新的日历列表 ==========
      const { prepareRemoteEventData } = await import('../utils/calendarSyncUtils');
      
      for (const calendarId of calendarIds) {
        try {
          // 准备远程事件数据（处理 Private 模式）
          const remoteEventData = prepareRemoteEventData(event, syncMode);
          
          // 检查是否已经同步过这个日历
          const existingSync = existingSyncedCalendars.find(
            cal => cal.calendarId === calendarId
          );
          
          let remoteEventId: string | null = null;
          
          if (existingSync?.remoteEventId) {
            // 更新已有的远程事件
            try {
              await microsoftService.updateEvent(existingSync.remoteEventId, remoteEventData);
              remoteEventId = existingSync.remoteEventId;
              eventLogger.log(`♻️ [syncToMultipleCalendars] 更新远程事件`, {
                calendarId,
                remoteEventId
              });
            } catch (updateError) {
              // 更新失败，删除后重建
              eventLogger.warn(`⚠️ [syncToMultipleCalendars] 更新失败，删除重建`, updateError);
              try {
                await microsoftService.deleteEvent(existingSync.remoteEventId);
              } catch (delErr) {
                // 删除失败也继续，尝试创建新的
              }
              remoteEventId = await microsoftService.syncEventToCalendar(remoteEventData, calendarId);
              eventLogger.log(`🆕 [syncToMultipleCalendars] 重建远程事件`, {
                calendarId,
                remoteEventId
              });
            }
          } else {
            // 创建新的远程事件
            remoteEventId = await microsoftService.syncEventToCalendar(remoteEventData, calendarId);
            eventLogger.log(`🆕 [syncToMultipleCalendars] 创建远程事件`, {
              calendarId,
              remoteEventId
            });
          }
          
          if (remoteEventId) {
            remoteEventIds.set(calendarId, remoteEventId);
          }
        } catch (calendarError) {
          eventLogger.error(`❌ [syncToMultipleCalendars] 日历 ${calendarId} 同步失败`, calendarError);
          // 继续处理其他日历
        }
      }
      
      // ========== 第五步：更新本地事件的同步记录（合并管理） ==========
      const syncedCalendars = Array.from(remoteEventIds.entries()).map(
        ([calendarId, remoteEventId]) => ({
          calendarId,
          remoteEventId
        })
      );
      
      const updates: Partial<Event> = {};
      if (syncType === 'plan') {
        updates.syncedPlanCalendars = syncedCalendars;
      } else {
        updates.syncedActualCalendars = syncedCalendars;
      }
      
      await this.updateEvent(event.id, updates);
      
      eventLogger.log(`✅ [syncToMultipleCalendars] 成功同步到 ${remoteEventIds.size} 个日历`, {
        eventId: event.id,
        syncedCalendars: remoteEventIds.size,
        syncType,
        syncMode
      });
      
      return remoteEventIds;
    } catch (error) {
      eventLogger.error(`❌ [syncToMultipleCalendars] 同步失败`, error);
      const { handleSyncError } = await import('../utils/calendarSyncUtils');
      handleSyncError('syncToMultipleCalendars', event, error);
      throw error;
    }
  }
  
  /**
   * 🆕 v2.0.6 检查 syncMode 是否允许发送到远程
   * 
   * @param syncMode 同步模式
   * @returns true 允许发送，false 不允许
   */
  private static canSendToRemote(syncMode: string): boolean {
    // receive-only: 只接收，不发送
    if (syncMode === 'receive-only') {
      return false;
    }
    
    // send-only, send-only-private, bidirectional, bidirectional-private: 允许发送
    return ['send-only', 'send-only-private', 'bidirectional', 'bidirectional-private'].includes(syncMode);
  }
  
  /**
   * 🆕 v2.0.6 检查 syncMode 是否允许接收远程更新
   * 
   * @param syncMode 同步模式
   * @returns true 允许接收，false 不允许
   */
  static canReceiveFromRemote(syncMode: string): boolean {
    // send-only, send-only-private: 只发送，不接收
    if (syncMode === 'send-only' || syncMode === 'send-only-private') {
      return false;
    }
    
    // receive-only, bidirectional, bidirectional-private: 允许接收
    return ['receive-only', 'bidirectional', 'bidirectional-private'].includes(syncMode);
  }
  
  /**
   * 🆕 v2.0.6 从远程事件合并到本地事件（多日历智能合并）
   * 
   * 核心逻辑：
   * 1. 检查远程事件的 externalId 是否在 syncedPlanCalendars/syncedActualCalendars 中
   * 2. 如果存在，说明是同一个本地事件的多个远程副本，合并而不是创建新事件
   * 3. 如果不存在，可能是新的远程事件，需要创建
   * 
   * @param remoteEvent 远程事件
   * @param localEvents 本地事件列表
   * @param syncType 同步类型
   * @returns 匹配的本地事件或 null
   */
  static findLocalEventByRemoteId(
    remoteEventId: string,
    localEvents: Event[],
    syncType: 'plan' | 'actual'
  ): Event | null {
    // 清理 outlook- 前缀
    const cleanRemoteId = remoteEventId.startsWith('outlook-') 
      ? remoteEventId.replace('outlook-', '') 
      : remoteEventId;
    
    // 在本地事件中查找匹配的 syncedCalendars
    const matchedEvent = localEvents.find((event: Event) => {
      const syncedCalendars = syncType === 'plan' 
        ? event.syncedPlanCalendars 
        : event.syncedActualCalendars;
      
      return syncedCalendars?.some(cal => 
        cal.remoteEventId === cleanRemoteId ||
        cal.remoteEventId === `outlook-${cleanRemoteId}` ||
        `outlook-${cal.remoteEventId}` === cleanRemoteId
      );
    });
    
    return matchedEvent || null;
  }

  /**
   * 同步事件到远程日历（支持 Private 模式）
   * 
   * @param event 要同步的事件
   * @param syncMode 同步模式
   * @param calendarId 目标日历 ID  
   * @param syncType 同步类型：'plan' 或 'actual'
   * @deprecated 使用 syncToMultipleCalendars 替代，支持多日历同步
   */
  static async syncToRemoteCalendar(
    event: Event, 
    syncMode: string, 
    calendarId: string,
    syncType: 'plan' | 'actual'
  ): Promise<string | null> {
    // 调用新的多日历同步方法
    const result = await this.syncToMultipleCalendars(event, [calendarId], syncMode, syncType);
    return result.get(calendarId) || null;
  }

  /**
   * 更新事件的同步配置
   */
  static async updateSyncConfig(
    eventId: string, 
    planConfig?: import('../types').PlanSyncConfig, 
    actualConfig?: import('../types').ActualSyncConfig
  ): Promise<void> {
    const updates: Partial<Event> = {};
    
    if (planConfig !== undefined) {
      updates.planSyncConfig = planConfig;
    }
    
    if (actualConfig !== undefined) {
      updates.actualSyncConfig = actualConfig;
    }
    
    await this.updateEvent(eventId, updates);
    
    eventLogger.log('🔧 [updateSyncConfig] Updated sync configuration', {
      eventId,
      planConfig,
      actualConfig
    });
  }

  /**
   * 检查事件是否需要同步
   */
  static shouldSyncEvent(event: Event, syncType: 'plan' | 'actual'): boolean {
    const { shouldSyncEvent } = require('../utils/calendarSyncUtils');
    return shouldSyncEvent(event, syncType);
  }

  /**
   * 获取事件的同步状态摘要
   */
  static getSyncStatusSummary(event: Event): {
    planStatus: 'not-configured' | 'synced' | 'pending' | 'error';
    actualStatus: 'not-configured' | 'synced' | 'pending' | 'error';
    remoteEventCount: number;
  } {
    const { calculateRemoteEventCount, getEffectivePlanSyncConfig, getEffectiveActualSyncConfig } = require('../utils/calendarSyncUtils');
    
    const planConfig = getEffectivePlanSyncConfig(event);
    const actualConfig = getEffectiveActualSyncConfig(event);
    
    // 计算 Plan 状态
    let planStatus: 'not-configured' | 'synced' | 'pending' | 'error' = 'not-configured';
    if (planConfig) {
      if (event.syncedPlanEventId) {
        planStatus = 'synced';
      } else {
        planStatus = 'pending';
      }
    }
    
    // 计算 Actual 状态
    let actualStatus: 'not-configured' | 'synced' | 'pending' | 'error' = 'not-configured';
    if (actualConfig) {
      if (event.syncedActualEventId) {
        actualStatus = 'synced';
      } else {
        actualStatus = 'pending';
      }
    }
    
    return {
      planStatus,
      actualStatus,
      remoteEventCount: calculateRemoteEventCount(event)
    };
  }

  /**
   * 从事件的 eventlog 中提取 timestamp 节点，补录到 EventHistoryService
   * 用于修复旧事件缺失的历史记录
   * 
   * @param eventId - 事件ID
   * @param eventlog - 事件日志对象
   * @returns 补录的历史记录数量
   */
  static async backfillEventHistoryFromTimestamps(eventId: string, eventlog: any): Promise<number> {
    try {
      // 检查是否已有创建记录
      const existingLogs = await EventHistoryService.queryHistory({
        eventId,
        operations: ['create'],
        limit: 1
      });
      
      if (existingLogs.length > 0) {
        eventLogger.log('✅ [EventService] Event already has history, skip backfill:', eventId);
        return 0;
      }
      
      // 解析 eventlog 中的 slateJson
      if (!eventlog || typeof eventlog !== 'object' || !eventlog.slateJson) {
        eventLogger.warn('⚠️ [EventService] Invalid eventlog for backfill:', eventId);
        return 0;
      }
      
      let slateNodes: any[];
      try {
        slateNodes = typeof eventlog.slateJson === 'string' 
          ? JSON.parse(eventlog.slateJson) 
          : eventlog.slateJson;
      } catch (error) {
        eventLogger.error('❌ [EventService] Failed to parse slateJson:', error);
        return 0;
      }
      
      // 提取所有 timestamp-divider 节点
      const timestamps: Date[] = [];
      
      // 🔍 方案1: 查找 timestamp-divider 节点（标准 ReMarkable 格式）
      for (const node of slateNodes) {
        if (node.type === 'timestamp-divider' && node.timestamp) {
          try {
            const timestampDate = new Date(node.timestamp);
            if (!isNaN(timestampDate.getTime())) {
              timestamps.push(timestampDate);
            }
          } catch (error) {
            eventLogger.warn('⚠️ [EventService] Invalid timestamp:', node.timestamp);
          }
        }
      }
      
      // 🔍 方案2: 如果没找到 timestamp-divider，尝试从 paragraph 文本中提取时间字符串
      // 用于处理从 Outlook 同步回来的事件（timestamp 被转换成纯文本）
      if (timestamps.length === 0) {
        eventLogger.log('📋 [EventService] No timestamp-divider found, try extracting from text content');
        
        // 正则匹配 YYYY-MM-DD HH:mm:ss 格式的时间字符串
        const timePattern = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/g;
        
        for (const node of slateNodes) {
          if (node.type === 'paragraph' && node.children) {
            // 遍历 paragraph 的所有文本节点
            for (const child of node.children) {
              if (child.text) {
                const matches = child.text.matchAll(timePattern);
                for (const match of matches) {
                  try {
                    const timeStr = match[1];
                    // ✅ 使用 parseLocalTimeString 解析 TimeSpec 格式
                    const timestampDate = parseLocalTimeString(timeStr);
                    
                    if (timestampDate) {
                      timestamps.push(timestampDate);
                      eventLogger.log('✅ [EventService] Extracted timestamp from text:', timeStr);
                    }
                  } catch (error) {
                    eventLogger.warn('⚠️ [EventService] Failed to parse time string:', match[1]);
                  }
                }
              }
            }
          }
        }
      }
      
      if (timestamps.length === 0) {
        eventLogger.log('📋 [EventService] No timestamps found in eventlog (neither nodes nor text), skip backfill:', eventId);
        return 0;
      }
      
      // 按时间排序（最早的在前）
      timestamps.sort((a, b) => a.getTime() - b.getTime());
      
      // 补录历史记录
      let backfilledCount = 0;
      
      // 第一个 timestamp 作为创建记录
      const createTime = timestamps[0];
      const event = await this.getEventById(eventId);
      if (event) {
        // 添加 try-catch 处理 QuotaExceededError
        try {
          EventHistoryService.logCreate(event, 'backfill-from-timestamp', createTime);
          backfilledCount++;
          eventLogger.log('✅ [EventService] Backfilled create log:', {
            eventId,
            createTime: formatTimeForStorage(createTime)
          });
        } catch (error: any) {
          if (error.name === 'QuotaExceededError') {
            eventLogger.warn('⚠️ localStorage quota exceeded, cannot backfill EventHistory. Consider cleaning old records.');
            return 0;  // 优雅降级：跳过补录
          }
          throw error;  // 其他错误继续抛出
        }
      }
      
      // 🔧 暂时只补录创建记录，不补录后续的编辑记录
      // 原因：避免 localStorage 配额超限（EventHistory 已经很大）
      // TODO: 后续可以考虑只补录最近的几个 timestamp
      /*
      for (let i = 1; i < timestamps.length; i++) {
        const editTime = timestamps[i];
        if (event) {
          EventHistoryService.logUpdate(
            eventId,  // ✅ 修复：第一个参数是 eventId 字符串，不是 event 对象
            event, 
            event,
            'backfill-from-timestamp',
            editTime
          );
          backfilledCount++;
        }
      }
      */
      
      eventLogger.log('✅ [EventService] Backfill completed:', {
        eventId,
        totalTimestamps: timestamps.length,
        backfilledCount
      });
      
      return backfilledCount;
    } catch (error) {
      eventLogger.error('❌ [EventService] Backfill failed:', error);
      return 0;
    }
  }

  /**
   * 从远程同步创建事件（内部方法，供 ActionBasedSyncManager 使用）
   * - 直接保存到 localStorage（不触发 sync）
   * - 记录到 EventHistoryService
   * 
   * @param event - 事件对象（已经过 convertRemoteEventToLocal 和 normalizeEvent 处理）
   * @returns 创建的事件对象
   */
  static async createEventFromRemoteSync(event: Event): Promise<Event> {
    try {
      // ⚠️ 注意：event 已经过 convertRemoteEventToLocal 中的 normalizeEvent 处理
      // 但如果 eventlog 为空或是空数组，需要从 description 重新生成
      let finalEventLog = event.eventlog;
      
      if (!finalEventLog || 
          (typeof finalEventLog === 'object' && finalEventLog.slateJson === '[]')) {
        eventLogger.log('🔧 [EventService] Remote event eventlog 为空，从 description 重新生成（移除签名）');
        // ✅ 从 description 中移除签名，提取核心内容
        const coreContent = event.description ? this.extractCoreContentFromDescription(event.description) : '';
        
        // 🆕 转换时间戳（字符串 → number）
        const eventCreatedAt = event.createdAt 
          ? new Date(event.createdAt).getTime() 
          : undefined;
        const eventUpdatedAt = event.updatedAt 
          ? new Date(event.updatedAt).getTime() 
          : eventCreatedAt;
        
        finalEventLog = this.normalizeEventLog(
          undefined, 
          coreContent,
          eventCreatedAt,   // 🆕 Event.createdAt (number)
          eventUpdatedAt    // 🆕 Event.updatedAt (number)
          // 没有旧 eventlog
        );
      }
      
      const finalEvent: Event = {
        ...event,
        eventlog: finalEventLog,
        // 确保 sync 相关字段正确
        syncStatus: event.syncStatus || 'synced',
      };

      // 检查是否已存在（理论上不应该存在，但做防御性检查）
      const existing = await storageManager.queryEvents({
        filters: { eventIds: [event.id] },
        limit: 1
      });
      
      if (existing.items.length > 0) {
        eventLogger.warn('⚠️ [EventService] Remote event already exists, updating instead:', event.id);
        const storageEvent = this.convertEventToStorageEvent(finalEvent);
        await storageManager.updateEvent(event.id, storageEvent);
      } else {
      // 创建新事件（双写到 IndexedDB + SQLite）
      const storageEvent = this.convertEventToStorageEvent(finalEvent);
      await storageManager.createEvent(storageEvent);
      
      // 🚀 [PERFORMANCE] 同步写入 EventStats
      await storageManager.createEventStats({
        id: finalEvent.id,
        tags: finalEvent.tags || [],
        calendarIds: (finalEvent as any).calendarIds || [],
        startTime: finalEvent.startTime,
        endTime: finalEvent.endTime,
        source: finalEvent.source,
        updatedAt: finalEvent.updatedAt,
      });
    }
    
    // 🆕 记录到事件历史（使用 outlook-sync 作为来源）
    // ✅ 使用 event.createdAt 作为历史记录的时间戳（而非当前时间）
    const createdAtTime = finalEvent.createdAt ? parseLocalTimeString(finalEvent.createdAt) : new Date();
    const historyLog = EventHistoryService.logCreate(finalEvent, 'outlook-sync', createdAtTime);      // 🔍 验证历史记录是否真的保存成功
      const verifyLogs = await EventHistoryService.queryHistory({
        eventId: finalEvent.id,
        operations: ['create'],
        limit: 1
      });
      const verifyLog = verifyLogs[0];
      
      // 获取统计信息
      const stats = await storageManager.getStats();
      const totalEvents = stats.indexedDB?.eventsCount || 0;
      
      eventLogger.log('✅ [EventService] Remote event created:', {
        eventId: finalEvent.id,
        title: finalEvent.title,
        hasEventlog: typeof finalEvent.eventlog === 'object' && !!finalEvent.eventlog?.slateJson,
        总事件数: totalEvents,
        historyLogSaved: !!historyLog,
        historyLogVerified: !!verifyLog,
        historyLogId: historyLog?.id,
        verifyLogId: verifyLog?.id
      });

      // 触发全局更新事件
      this.dispatchEventUpdate(finalEvent.id, { 
        isNewEvent: true, 
        tags: finalEvent.tags, 
        event: finalEvent,
        source: 'external-sync',
        isLocalUpdate: false
      });

      return finalEvent;
    } catch (error) {
      eventLogger.error('❌ [EventService] Failed to create event from remote sync:', error);
      throw error; // 抛出错误让调用方处理
    }
  }

  // ========================================
  // 🆕 Storage Layer 转换工具
  // ========================================

  /**
   * 将 StorageEvent 转换为 Event（应用层模型）
   */
  private static convertStorageEventToEvent(storageEvent: StorageEvent): Event {
    // ✅ 从 description 中移除签名，提取核心内容
    const fallbackContent = storageEvent.description ? this.extractCoreContentFromDescription(storageEvent.description) : '';
    
    // 🆕 转换时间戳（字符串 → number）
    const eventCreatedAt = storageEvent.createdAt 
      ? new Date(storageEvent.createdAt).getTime() 
      : undefined;
    const eventUpdatedAt = storageEvent.updatedAt 
      ? new Date(storageEvent.updatedAt).getTime() 
      : eventCreatedAt;
    
    return {
      ...storageEvent,
      title: this.normalizeTitle(storageEvent.title),
      eventlog: this.normalizeEventLog(
        storageEvent.eventlog, 
        fallbackContent,
        eventCreatedAt,   // 🆕 Event.createdAt (number)
        eventUpdatedAt    // 🆕 Event.updatedAt (number)
        // 没有旧 eventlog（读取时不需要 diff）
      ),
    } as Event;
  }

  /**
   * 将 Event 转换为 StorageEvent（存储层模型）
   */
  private static convertEventToStorageEvent(event: Event): StorageEvent {
    // 🔥 确保 EventLog 包含完整的 html/plainText 字段
    // 如果 eventlog.slateJson 存在但缺少 html/plainText,则自动生成
    let processedEventlog = event.eventlog;
    
    // 🔍 调试日志
    console.log('[convertEventToStorageEvent] Input eventlog:', {
      exists: !!event.eventlog,
      type: typeof event.eventlog,
      slateJson: event.eventlog?.slateJson,
      html: event.eventlog?.html,
      plainText: event.eventlog?.plainText
    });
    
    if (event.eventlog?.slateJson) {
      // 🔥 检查字段是否 undefined (不存在)，而不是检查 falsy
      // 空字符串 '' 是合法值，不应触发重新生成
      const hasHtml = event.eventlog.html !== undefined;
      const hasPlainText = event.eventlog.plainText !== undefined;
      
      console.log('[convertEventToStorageEvent] Field check:', { hasHtml, hasPlainText });
      
      if (!hasHtml || !hasPlainText) {
        console.log('[convertEventToStorageEvent] Generating fields from slateJson...');
        // 🔥 关键修复：传递 slateJson 字符串，不是整个 eventlog 对象
        processedEventlog = this.convertSlateJsonToEventLog(event.eventlog.slateJson);
        console.log('[convertEventToStorageEvent] Generated eventlog:', processedEventlog);
      }
    }
    
    return {
      ...event,
      title: event.title,
      eventlog: processedEventlog as any,
    } as StorageEvent;
  }

  // ========================================
  // 🆕 EventTree 辅助方法
  // ========================================

  /**
   * 获取事件类型描述（用于日志和调试）
   */
  static getEventType(event: Event): string {
    if (event.isTimer) return 'Timer';
    if (event.isTimeLog) return 'TimeLog';
    if (event.isOutsideApp) return 'OutsideApp';
    if (event.isPlan) return 'UserSubTask';
    return 'Event';
  }

  /**
   * 判断是否为附属事件（系统自动生成，无独立 Plan 状态）
   */
  static isSubordinateEvent(event: Event): boolean {
    return !!(event.isTimer || event.isTimeLog || event.isOutsideApp);
  }

  /**
   * 判断是否为用户子事件（用户主动创建，有完整 Plan 状态）
   */
  static isUserSubEvent(event: Event): boolean {
    return !!(event.isPlan && event.parentEventId && !this.isSubordinateEvent(event));
  }

  /**
   * 获取所有子事件（包括所有类型）
   */
  static async getChildEvents(parentId: string): Promise<Event[]> {
    const parent = await this.getEventById(parentId);
    if (!parent?.childEventIds) return [];
    
    const children = await Promise.all(
      parent.childEventIds.map((id: string) => this.getEventById(id))
    );
    return children.filter((e): e is Event => e !== null);
  }

  /**
   * 获取附属事件（Timer/TimeLog/OutsideApp）
   */
  static async getSubordinateEvents(parentId: string): Promise<Event[]> {
    const children = await this.getChildEvents(parentId);
    return children.filter(e => this.isSubordinateEvent(e));
  }

  /**
   * 获取用户子任务
   */
  static async getUserSubTasks(parentId: string): Promise<Event[]> {
    const children = await this.getChildEvents(parentId);
    return children.filter(e => this.isUserSubEvent(e));
  }

  /**
   * 计算事件的 bulletLevel（基于 EventTree 层级）
   * @param event - 目标事件
   * @param eventMap - 事件 Map（用于快速查找父事件）
   * @param visited - 已访问的事件 ID（防止循环引用）
   * @returns bulletLevel 层级（0=根事件, 1=一级子, 2=二级子...）
   */
  static calculateBulletLevel(
    event: Event, 
    eventMap: Map<string, Event>,
    visited: Set<string> = new Set()
  ): number {
    // 防止循环引用
    if (visited.has(event.id!)) {
      eventLogger.error('🔄 [EventService] Circular reference detected in EventTree:', event.id);
      return 0;
    }
    
    // 根事件（无父事件）
    if (!event.parentEventId) return 0;
    
    const parent = eventMap.get(event.parentEventId);
    if (!parent) {
      eventLogger.warn('⚠️ [EventService] Parent not found:', event.parentEventId, 'for event:', event.id);
      return 0; // 父事件不存在，降级为根事件
    }
    
    // 递归计算父事件的层级
    visited.add(event.id!);
    return this.calculateBulletLevel(parent, eventMap, visited) + 1;
  }

  /**
   * 批量计算所有事件的 bulletLevel
   * @param events - 事件列表
   * @returns Map<eventId, bulletLevel>
   */
  static calculateAllBulletLevels(events: Event[]): Map<string, number> {
    const eventMap = new Map(events.map(e => [e.id!, e]));
    const levels = new Map<string, number>();
    
    // 🔍 DEBUG: 检查 eventMap 是否包含 parentEventId
    console.log('[EventService] 🔍 calculateAllBulletLevels input:', {
      eventsCount: events.length,
      eventsWithParent: events.filter(e => e.parentEventId).length,
      sampleEvents: events.slice(0, 3).map(e => ({
        id: e.id?.slice(-8),
        parentEventId: e.parentEventId?.slice(-8),
        title: e.title?.simpleTitle?.slice(0, 20)
      }))
    });
    
    // 🔥 关键修复：检查并加载缺失的父事件
    // 如果子事件的 parentEventId 不在 eventMap 中，说明父事件被过滤掉了
    // 但为了正确计算层级，我们需要知道父事件的完整层级链
    const missingParentIds = new Set<string>();
    events.forEach(event => {
      if (event.parentEventId && !eventMap.has(event.parentEventId)) {
        missingParentIds.add(event.parentEventId);
      }
    });
    
    if (missingParentIds.size > 0) {
      console.log('[EventService] 🔍 检测到缺失的父事件:', {
        missingCount: missingParentIds.size,
        missingIds: Array.from(missingParentIds).slice(0, 5).map(id => id.slice(-8))
      });
      
      // 注意：这里不能使用 async/await，因为这是同步函数
      // 我们只能基于当前 eventMap 计算，无法动态加载
      // 解决方案：如果父事件不存在，从数据库中的 bulletLevel 字段读取
    }
    
    events.forEach(event => {
      if (!event.id) return;
      
      // 🔥 关键修复：如果父事件不在 eventMap 中，优先使用数据库中的 bulletLevel
      // 这避免了因为父事件被过滤导致层级计算错误
      let level: number;
      
      if (event.parentEventId && !eventMap.has(event.parentEventId)) {
        // 父事件被过滤掉了，使用数据库中保存的 bulletLevel
        if (event.bulletLevel !== undefined && event.bulletLevel !== null) {
          level = event.bulletLevel;
          console.log('[EventService] 🔧 使用数据库 bulletLevel (父事件缺失):', {
            eventId: event.id.slice(-8),
            parentEventId: event.parentEventId.slice(-8),
            bulletLevel: level,
            title: event.title?.simpleTitle?.slice(0, 30)
          });
        } else {
          // 数据库中也没有 bulletLevel，降级为根事件
          level = 0;
          console.warn('[EventService] ⚠️ 父事件缺失且无 bulletLevel，降级为根:', {
            eventId: event.id.slice(-8),
            parentEventId: event.parentEventId.slice(-8)
          });
        }
      } else {
        // 正常情况：父事件存在或无父事件，递归计算
        const visited = new Set<string>();
        level = this.calculateBulletLevel(event, eventMap, visited);
        
        // 🔍 DEBUG: 记录每个事件的计算结果
        if (event.parentEventId) {
          console.log('[EventService] 🔍 Calculated level:', {
            eventId: event.id.slice(-8),
            parentEventId: event.parentEventId.slice(-8),
            calculatedLevel: level,
            parentExists: eventMap.has(event.parentEventId)
          });
        }
      }
      
      levels.set(event.id, level);
    });
    
    eventLogger.log('📊 [EventService] Calculated bullet levels for', events.length, 'events');
    return levels;
  }

  /**
   * 递归获取整个事件树（广度优先遍历）
   */
  static async getEventTree(rootId: string): Promise<Event[]> {
    const result: Event[] = [];
    const visited = new Set<string>();
    const queue = [rootId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      // 避免循环引用
      if (visited.has(currentId)) {
        eventLogger.warn('⚠️ [EventService] 检测到循环引用:', currentId);
        continue;
      }
      visited.add(currentId);
      
      const event = await this.getEventById(currentId);
      
      if (event) {
        result.push(event);
        
        // 添加子事件到队列
        if (event.childEventIds) {
          queue.push(...event.childEventIds);
        }
      }
    }
    
    return result;
  }

  /**
   * 计算事件总时长（包括所有附属事件的实际时长）
   */
  static async getTotalDuration(parentId: string): Promise<number> {
    const children = await this.getSubordinateEvents(parentId);
    return children.reduce((sum, child) => {
      if (child.startTime && child.endTime) {
        const start = new Date(child.startTime).getTime();
        const end = new Date(child.endTime).getTime();
        return sum + (end - start);
      }
      return sum;
    }, 0);
  }

  /**
   * 获取事件的层级深度
   */
  static async getEventDepth(eventId: string): Promise<number> {
    let depth = 0;
    let currentId: string | undefined = eventId;
    const visited = new Set<string>();
    
    while (currentId) {
      if (visited.has(currentId)) {
        eventLogger.warn('⚠️ [EventService] 检测到父子循环引用:', currentId);
        break;
      }
      visited.add(currentId);
      
      const event = await this.getEventById(currentId);
      if (!event?.parentEventId) break;
      
      depth++;
      currentId = event.parentEventId;
    }
    
    return depth;
  }

  /**
   * 获取根事件（最顶层的父事件）
   */
  static async getRootEvent(eventId: string): Promise<Event | null> {
    let currentId = eventId;
    const visited = new Set<string>();
    
    while (currentId) {
      if (visited.has(currentId)) {
        eventLogger.warn('⚠️ [EventService] 检测到父子循环引用:', currentId);
        return null;
      }
      visited.add(currentId);
      
      const event = await this.getEventById(currentId);
      if (!event) return null;
      if (!event.parentEventId) return event;
      
      currentId = event.parentEventId;
    }
    
    return null;
  }

  // ========== 双向链接管理（Issue #13）==========

  /**
   * 添加双向链接
   * 在事件 A 和事件 B 之间创建链接关系
   * 
   * @param fromEventId 源事件 ID
   * @param toEventId 目标事件 ID
   * @returns 是否成功
   * 
   * @example
   * // 在事件 A 的 EventLog 中输入 "@Project Ace"
   * await EventService.addLink(eventA.id, projectAce.id);
   * // 结果：eventA.linkedEventIds = ['project-ace-id']
   * //      projectAce.backlinks = ['event-a-id']
   */
  static async addLink(fromEventId: string, toEventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 验证事件存在
      const fromEvent = await this.getEventById(fromEventId);
      const toEvent = await this.getEventById(toEventId);
      
      if (!fromEvent) {
        return { success: false, error: `源事件不存在: ${fromEventId}` };
      }
      
      if (!toEvent) {
        return { success: false, error: `目标事件不存在: ${toEventId}` };
      }
      
      // 防止自己链接自己
      if (fromEventId === toEventId) {
        return { success: false, error: '不能链接自己' };
      }
      
      // 更新源事件的 linkedEventIds
      const linkedEventIds = fromEvent.linkedEventIds || [];
      if (!linkedEventIds.includes(toEventId)) {
        linkedEventIds.push(toEventId);
        await this.updateEvent(fromEventId, { linkedEventIds }, 'EventService.addLink');
      }
      
      // 更新目标事件的 backlinks
      await this.rebuildBacklinks(toEventId);
      
      eventLogger.log('🔗 [EventService] 添加链接:', { fromEventId, toEventId });
      return { success: true };
    } catch (error) {
      eventLogger.error('❌ [EventService] 添加链接失败:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 移除双向链接
   * 
   * @param fromEventId 源事件 ID
   * @param toEventId 目标事件 ID
   * @returns 是否成功
   */
  static async removeLink(fromEventId: string, toEventId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const fromEvent = await this.getEventById(fromEventId);
      
      if (!fromEvent) {
        return { success: false, error: `源事件不存在: ${fromEventId}` };
      }
      
      // 从 linkedEventIds 中移除
      const linkedEventIds = (fromEvent.linkedEventIds || []).filter(id => id !== toEventId);
      await this.updateEvent(fromEventId, { linkedEventIds }, 'EventService.removeLink');
      
      // 重新计算目标事件的 backlinks
      await this.rebuildBacklinks(toEventId);
      
      eventLogger.log('🔓 [EventService] 移除链接:', { fromEventId, toEventId });
      return { success: true };
    } catch (error) {
      eventLogger.error('❌ [EventService] 移除链接失败:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 重建事件的反向链接（backlinks）
   * 遍历所有事件，找出哪些事件链接了当前事件
   * 
   * @param eventId 需要重建 backlinks 的事件 ID
   */
  static async rebuildBacklinks(eventId: string): Promise<void> {
    try {
      const allEvents = await this.getAllEvents();
      const backlinks: string[] = [];
      
      // 遍历所有事件，找出链接了当前事件的
      allEvents.forEach((event: Event) => {
        if (event.linkedEventIds?.includes(eventId)) {
          backlinks.push(event.id);
        }
      });
      
      // 更新 backlinks（不触发同步）
      await this.updateEvent(eventId, { backlinks }, 'EventService.rebuildBacklinks');
      
      eventLogger.log('🔄 [EventService] 重建反向链接:', { eventId, backlinksCount: backlinks.length });
    } catch (error) {
      eventLogger.error('❌ [EventService] 重建反向链接失败:', error);
    }
  }

  /**
   * 批量重建所有事件的反向链接
   * 用于数据迁移或修复
   */
  static async rebuildAllBacklinks(): Promise<{ success: boolean; rebuiltCount: number; error?: string }> {
    try {
      const allEvents = await this.getAllEvents();
      let rebuiltCount = 0;
      
      for (const event of allEvents) {
        await this.rebuildBacklinks(event.id);
        rebuiltCount++;
      }
      
      eventLogger.log('✅ [EventService] 批量重建反向链接完成:', { rebuiltCount });
      return { success: true, rebuiltCount };
    } catch (error) {
      eventLogger.error('❌ [EventService] 批量重建反向链接失败:', error);
      return { success: false, rebuiltCount: 0, error: String(error) };
    }
  }

  /**
   * 获取事件的所有链接事件（正向链接 + 反向链接）
   * 用于在 EventTree 中显示堆叠卡片
   * 
   * @param eventId 事件 ID
   * @returns 链接事件列表
   */
  static async getLinkedEvents(eventId: string): Promise<{
    outgoing: Event[];  // 正向链接（我链接的事件）
    incoming: Event[];  // 反向链接（链接我的事件）
  }> {
    try {
      const event = await this.getEventById(eventId);
      
      if (!event) {
        return { outgoing: [], incoming: [] };
      }
      
      // 获取正向链接的事件
      const outgoingIds = event.linkedEventIds || [];
      const outgoing = (await Promise.all(
        outgoingIds.map(id => this.getEventById(id))
      )).filter(e => e !== null) as Event[];
      
      // 获取反向链接的事件
      const incomingIds = event.backlinks || [];
      const incoming = (await Promise.all(
        incomingIds.map(id => this.getEventById(id))
      )).filter(e => e !== null) as Event[];
      
      return { outgoing, incoming };
    } catch (error) {
      eventLogger.error('❌ [EventService] 获取链接事件失败:', error);
      return { outgoing: [], incoming: [] };
    }
  }

  /**
   * 检查两个事件之间是否存在链接
   * 
   * @param fromEventId 源事件 ID
   * @param toEventId 目标事件 ID
   * @returns 是否存在链接
   */
  static async hasLink(fromEventId: string, toEventId: string): Promise<boolean> {
    try {
      const fromEvent = await this.getEventById(fromEventId);
      return fromEvent?.linkedEventIds?.includes(toEventId) || false;
    } catch (error) {
      eventLogger.error('❌ [EventService] 检查链接失败:', error);
      return false;
    }
  }

  // ==================== 🔥 v2.15: 临时ID替换系统 ====================
  
  /**
   * 解析并替换所有引用临时ID的父子关系
   * @param tempId 临时ID（line-xxx）
   * @param realId 真实ID（event_xxx）
   */
  private static async resolveTempIdReferences(tempId: string, realId: string): Promise<void> {
    try {
      // 查找所有引用该临时ID作为parentEventId的事件
      const allEvents = await storageManager.queryEvents({ limit: 10000 });
      const needsUpdate: Event[] = [];
      
      allEvents.items.forEach(event => {
        let needUpdate = false;
        const updates: Partial<Event> = {};
        
        // 检查 parentEventId
        if (event.parentEventId === tempId) {
          updates.parentEventId = realId;
          needUpdate = true;
          eventLogger.log('🔥 [TempId] 找到引用临时ID的parentEventId:', {
            eventId: event.id.slice(-8),
            oldParentId: tempId,
            newParentId: realId
          });
        }
        
        // 检查 childEventIds
        if (event.childEventIds && Array.isArray(event.childEventIds)) {
          const index = event.childEventIds.indexOf(tempId);
          if (index !== -1) {
            const newChildIds = [...event.childEventIds];
            newChildIds[index] = realId;
            updates.childEventIds = newChildIds;
            needUpdate = true;
            eventLogger.log('🔥 [TempId] 找到引用临时ID的childEventIds:', {
              eventId: event.id.slice(-8),
              oldChildId: tempId,
              newChildId: realId
            });
          }
        }
        
        if (needUpdate) {
          needsUpdate.push({ ...event, ...updates });
        }
      });
      
      // 批量更新
      if (needsUpdate.length > 0) {
        eventLogger.log(`🔥 [TempId] 批量更新 ${needsUpdate.length} 个事件的父子关系`);
        
        for (const event of needsUpdate) {
          await this.updateEvent(
            event.id,
            {
              parentEventId: event.parentEventId,
              childEventIds: event.childEventIds
            },
            true, // skipSync
            {
              source: 'temp-id-resolution',
              originComponent: 'EventService'
            }
          );
        }
        
        eventLogger.log('✅ [TempId] 临时ID替换完成:', {
          tempId,
          realId,
          updatedCount: needsUpdate.length
        });
      } else {
        eventLogger.log('🔍 [TempId] 未找到引用该临时ID的事件');
      }
    } catch (error) {
      eventLogger.error('❌ [TempId] 替换临时ID引用失败:', error);
    }
  }
  
  /**
   * 判断事件是否应该显示在 EventTree 中
   * 排除系统自动生成的事件类型
   * 
   * @param event 事件对象
   * @returns 是否应该显示
   */
  static shouldShowInEventTree(event: Event): boolean {
    // 排除系统事件
    if (event.isTimer) return false;         // Timer 子事件
    if (event.isOutsideApp) return false;    // 外部应用数据（听歌、录屏等）
    if (event.isTimeLog) return false;       // 纯系统时间日志
    
    // 显示所有用户创建的事件
    return true; // Task、文档、Plan 事件、TimeCalendar 事件等
  }
}

// 暴露到全局用于调试
if (typeof window !== 'undefined') {
  (window as any).EventService = EventService;
}
