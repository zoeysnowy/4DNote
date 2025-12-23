// @ts-nocheck
// 🚧 临时禁用类型检查：正在重构为异步架构
import { STORAGE_KEYS } from '../constants/storage';
import { logger } from '../utils/logger';
import { EventService } from './EventService';
import { formatTimeForStorage, parseLocalTimeString } from '../utils/timeUtils';
import { SignatureUtils } from '../utils/signatureUtils';
import { storageManager } from './storage/StorageManager';
import { SyncStatus } from './storage/types';
import type { SyncQueueItem } from './storage/types';
import { determineSyncTarget } from '../utils/syncRouter';

const syncLogger = logger.module('Sync');

interface SyncAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'event' | 'task';
  entityId: string;
  timestamp: Date;
  source: 'local' | 'outlook';
  data?: any;
  oldData?: any;
  originalData?: any;
  synchronized: boolean;
  synchronizedAt?: Date;
  retryCount: number;
  lastError?: string; // 🔧 [NEW] 最后一次错误信息
  lastAttemptTime?: Date; // 🔧 [NEW] 最后一次尝试时间
  userNotified?: boolean; // 🔧 [NEW] 是否已通知用户
}

interface SyncConflict {
  localAction: SyncAction;
  remoteAction: SyncAction;
  resolutionStrategy: 'local-wins' | 'remote-wins' | 'merge' | 'manual';
}

export class ActionBasedSyncManager {
  private microsoftService: any;
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime = new Date();
  private actionQueue: SyncAction[] = [];
  private conflictQueue: SyncConflict[] = [];
  private syncInProgress = false;
  private isTimerTriggered = false; // 🎯 标记是否由定时器触发（用于优先级控制）
  private needsFullSync = false; // 标记是否需要全量同步
  private lastSyncSettings: any = null; // 上次同步时的设置
  private deletedEventIds: Set<string> = new Set(); // 🆕 跟踪已删除的事件ID
  private editLocks: Map<string, number> = new Map(); // 🆕 编辑锁定机制 - 存储事件ID和锁定过期时间
  private recentlyUpdatedEvents: Map<string, number> = new Map(); // 🔧 [NEW] 记录最近更新的事件，防止误删
  private eventIndexMap: Map<string, any> = new Map(); // 🚀 [NEW] Event ID hash map for O(1) lookups
  private indexIntegrityCheckInterval: NodeJS.Timeout | null = null; // 🔧 [NEW] 完整性检查定时器
  private lastIntegrityCheck = 0; // 🔧 [NEW] 上次完整性检查时间
  private incrementalUpdateCount = 0; // 🔧 [NEW] 增量更新计数器
  private fullCheckCompleted = false; // 🔧 [NEW] 是否完成过完整检查
  private isWindowFocused = true; // 🔧 [NEW] 窗口是否被激活
  private lastQueueModification = Date.now(); // 🔧 [FIX] 上次 action queue 修改时间
  private pendingSyncAfterOnline = false; // 🔧 [NEW] 网络恢复后待同步标记
  private viewChangeTimeout: NodeJS.Timeout | null = null; // 🚀 [NEW] 视图变化防抖定时器
  private saveQueueDebounceTimer: NodeJS.Timeout | null = null; // ✨ 保存队列防抖定时器
  private queueDirty = false; // ✨ 队列脏标记（是否需要保存）
  private lastSavedQueueSize = 0; // ✨ 上次保存的队列大小
  private saveIndexMapDebounceTimer: NodeJS.Timeout | null = null; // 🗺️ IndexMap保存防抖定时器
  private indexMapDirty = false; // 🗺️ IndexMap脏标记
  
  // 🔧 [NEW] 删除候选追踪机制 - 两轮确认才删除
  private deletionCandidates: Map<string, {
    externalId: string;
    title: string;
    firstMissingRound: number; // 第一次未找到的轮次
    firstMissingTime: number;  // 第一次未找到的时间
    lastCheckRound: number;     // 最后检查的轮次
    lastCheckTime: number;      // 最后检查的时间
  }> = new Map();
  private syncRoundCounter = 0; // 同步轮次计数器
  private lastSyncBatchCount = 0; // 🔧 [NEW] 上次同步的批次数量（用于动态计算删除确认时间）
  
  // � [NEW] IndexMap 重建状态追踪
  private indexMapRebuildPromise: Promise<void> | null = null;
  
  // �📊 [NEW] 同步统计信息
  private syncStats = {
    syncFailed: 0,        // 同步至日历失败
    calendarCreated: 0,   // 新增日历事项
    syncSuccess: 0        // 成功同步至日历
  };
  
  // ✨ 单例追踪（警告重复实例）
  private static activeInstance: ActionBasedSyncManager | null = null;
  private static instanceCount = 0;
  private instanceId: number;

  constructor(microsoftService: any) {
    ActionBasedSyncManager.instanceCount++;
    this.instanceId = ActionBasedSyncManager.instanceCount;
    
    if (ActionBasedSyncManager.activeInstance) {
      console.warn(`⚠️ [ActionBasedSyncManager] Multiple instances detected! Instance #${this.instanceId} created while instance #${ActionBasedSyncManager.activeInstance.instanceId} is still active`);
    } else {
      console.log(`✅ [ActionBasedSyncManager] Instance #${this.instanceId} created`);
      ActionBasedSyncManager.activeInstance = this;
    }
    
    this.microsoftService = microsoftService;
    
    // 🔄 [MIGRATION] Step 1: 迁移 localStorage 数据到 IndexedDB（优先执行）
    this.migrateLocalStorageToIndexedDB()
      .then(() => {
        // 🔄 [MIGRATION] Step 2: 从 IndexedDB 加载队列
        return this.loadActionQueue();
      })
      .catch(err => console.error('Failed to migrate/load action queue:', err));
    
    this.loadConflictQueue();
    this.loadDeletedEventIds(); // 🆕 加载已删除事件ID
    
    // 🔧 [MIGRATION] 一次性清理重复的 outlook- 前缀
    this.migrateOutlookPrefixes().catch(err => console.error('Migration failed:', err));
    
    // 🔧 [NEW] 修复历史 pending 事件（补充到同步队列）
    this.fixOrphanedPendingEvents().catch(err => console.error('Fix orphaned events failed:', err));
    
    // 🔧 [NEW] 设置网络状态监听
    this.setupNetworkListeners();
    
    // 🔧 [NEW] 订阅 EventHub 事件，同步更新 IndexMap
    this.setupEventHubSubscription();
    
    // 🔧 [NEW] 监听窗口焦点状态（用于检测用户是否正在使用应用）
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.isWindowFocused = true;
      }, { passive: true });
      
      window.addEventListener('blur', () => {
        this.isWindowFocused = false;
      }, { passive: true });
      
      // 🚀 [NEW] 监听日历视图变化，触发优先同步
      window.addEventListener('calendarViewChanged', ((event: CustomEvent) => {
        const { visibleStart, visibleEnd } = event.detail;
        
        // 防抖处理：避免快速切换月份时频繁同步
        if (this.viewChangeTimeout) {
          clearTimeout(this.viewChangeTimeout);
        }
        
        this.viewChangeTimeout = setTimeout(async () => {
          if (this.isRunning && !this.syncInProgress) {
            // 🔧 [FIX] 等待 TagService 初始化（防止视图切换时触发过早同步）
            if (typeof window !== 'undefined' && (window as any).TagService) {
              try {
                await (window as any).TagService.initialize();
              } catch (error) {
                syncLogger.error('❌ [View Change] TagService initialization failed:', error);
              }
            }
            
            syncLogger.log('📅 [View Change] Triggering priority sync for new visible range');
            this.syncVisibleDateRangeFirst(
              new Date(visibleStart),
              new Date(visibleEnd)
            ).catch(error => {
              syncLogger.error('❌ [View Change] Priority sync failed:', error);
            });
          }
        }, 500); // 500ms 防抖
      }) as EventListener);
    }
    
    // 🔍 [DEBUG] 暴露调试函数到全局
    if (typeof window !== 'undefined') {
      (window as any).debugSyncManager = {
        getActionQueue: () => this.actionQueue,
        getConflictQueue: () => this.conflictQueue,
        isRunning: () => this.isRunning,
        isSyncInProgress: () => this.syncInProgress,
        getLastSyncTime: () => this.lastSyncTime,
        triggerSync: () => this.performSync(),
        checkTagMapping: (tagId: string) => this.getCalendarIdForTag(tagId),
        getHealthScore: () => this.getLastHealthScore(),
        getIncrementalUpdateCount: () => this.incrementalUpdateCount,
        resetFullCheck: () => { this.fullCheckCompleted = false; }
      };
    }
  }

  // 🔧 [NEW] 订阅 EventHub 事件，同步更新 IndexMap
  private setupEventHubSubscription() {
    // 🔧 延迟订阅，确保 EventHub 已挂载到 window
    let retryCount = 0;
    const maxRetries = 50; // 最多重试 5 秒
    
    const attemptSubscribe = () => {
      const EventHub = (window as any).EventHub;
      if (!EventHub) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error('❌ [ActionBasedSyncManager] EventHub not available after 50 retries, giving up');
          return;
        }
        if (retryCount === 1 || retryCount % 10 === 0) {
          console.warn(`⚠️ [ActionBasedSyncManager] EventHub not available yet (retry ${retryCount}/${maxRetries})`);
        }
        setTimeout(attemptSubscribe, 100);
        return;
      }
      
      console.log(`✅ [ActionBasedSyncManager] EventHub found after ${retryCount} retries, setting up subscriptions...`);
      
      // 订阅事件更新，同步更新 IndexMap
      let eventHubUpdateCount = 0;
      EventHub.subscribe('event-updated', (updatedEvent: any) => {
        if (updatedEvent && updatedEvent.id) {
          // 🔧 获取旧事件用于索引清理
          const oldEvent = this.eventIndexMap.get(updatedEvent.id);
          this.updateEventInIndex(updatedEvent, oldEvent);
          eventHubUpdateCount++;
          if (eventHubUpdateCount <= 5 || eventHubUpdateCount % 100 === 0) {
            console.log(`🔄 [IndexMap] Updated via EventHub (#${eventHubUpdateCount}):`, updatedEvent.id);
          }
        }
      });
      
      // 订阅事件创建
      let eventHubCreateCount = 0;
      EventHub.subscribe('event-created', (newEvent: any) => {
        if (newEvent && newEvent.id) {
          this.updateEventInIndex(newEvent);
          eventHubCreateCount++;
          if (eventHubCreateCount <= 5 || eventHubCreateCount % 100 === 0) {
            console.log(`➕ [IndexMap] Created via EventHub (#${eventHubCreateCount}):`, newEvent.id);
          }
        }
      });
    
      // 订阅事件删除
      let eventHubDeleteCount = 0;
      EventHub.subscribe('event-deleted', (deletedEvent: any) => {
        if (deletedEvent && deletedEvent.id) {
          this.removeEventFromIndex(deletedEvent);
          eventHubDeleteCount++;
          if (eventHubDeleteCount <= 5 || eventHubDeleteCount % 100 === 0) {
            console.log(`🗑️ [IndexMap] Deleted via EventHub (#${eventHubDeleteCount}):`, deletedEvent.id);
          }
        }
      });
    
    console.log('✅ [ActionBasedSyncManager] EventHub subscription setup complete');
    };
    
    // 立即尝试，如果失败会自动重试
    attemptSubscribe();
  }
  
  // 🔧 [NEW] 设置网络状态监听
  private setupNetworkListeners() {
    if (typeof window === 'undefined') return;
    // 监听网络恢复
    window.addEventListener('online', () => {
      // 🔧 [OPTIMIZED] 标记需要同步
      this.pendingSyncAfterOnline = true;
      
      // 🔧 [OPTIMIZED] 减少延迟到 500ms（从 1000ms）
      setTimeout(() => {
        if (!this.isRunning) {
          return;
        }
        
        if (this.syncInProgress) {
          // 🔧 [NEW] 如果正在同步，标记为待同步，等当前同步完成后立即执行
          // pendingSyncAfterOnline 保持 true，在 performSync 结束时会检查
        } else {
          this.triggerSyncAfterOnline();
        }
      }, 500); // 🔧 减少到 500ms
      
      // 🔧 [NEW] 显示恢复通知
      this.showNetworkNotification('online');
    });
    
    // 监听网络断开
    window.addEventListener('offline', () => {
      // 显示通知提醒用户
      this.showNetworkNotification('offline');
    });
    
    // 初始化时检查网络状态
    const isOnline = navigator.onLine;
    
    if (!isOnline) {
      this.showNetworkNotification('offline');
    }
  }

  // 🔧 [NEW] 网络恢复后触发同步的专用方法
  private async triggerSyncAfterOnline() {
    this.pendingSyncAfterOnline = false;
    
    try {
      // 网络恢复时只推送本地更改，不拉取远程（优化性能，避免429错误）
      await this.performSync({ skipRemoteFetch: true });
    } catch (error) {
      console.error('❌ [Network] Sync after network recovery failed:', error);
      // 🔧 失败后等待下一个定时器周期重试
    }
  }

  // 🔧 [NEW] 显示网络状态通知
  private showNetworkNotification(status: 'online' | 'offline') {
    if (typeof window === 'undefined') return;
    
    // 触发自定义事件，让UI层显示通知
    window.dispatchEvent(new CustomEvent('networkStatusChanged', {
      detail: {
        status,
        message: status === 'offline' 
          ? '⚠️ 网络已断开，本地操作将在联网后自动同步' 
          : '✅ 网络已恢复，正在同步数据...'
      }
    }));
  }

  // 🔧 [NEW] 显示同步失败通知
  private showSyncFailureNotification(action: SyncAction, error: string) {
    if (typeof window === 'undefined') return;
    
    const eventTitle = action.data?.title || action.entityId;
    const retryCount = action.retryCount || 0;
    
    // 触发自定义事件，让UI层显示通知
    window.dispatchEvent(new CustomEvent('syncFailure', {
      detail: {
        actionId: action.id,
        actionType: action.type,
        entityId: action.entityId,
        eventTitle,
        retryCount,
        error,
        timestamp: new Date()
      }
    }));
    
    console.warn(`🚨 [Sync Failure Notification] Event: "${eventTitle}", Retries: ${retryCount}, Error: ${error}`);
  }

  // 🔧 [NEW] 显示日历降级通知
  private showCalendarFallbackNotification(eventTitle: string, invalidCalendarId: string, fallbackCalendarId: string) {
    if (typeof window === 'undefined') return;
    
    // 触发自定义事件，让UI层显示通知
    window.dispatchEvent(new CustomEvent('calendarFallback', {
      detail: {
        eventTitle,
        invalidCalendarId,
        fallbackCalendarId,
        message: `目标日历不存在，事件 "${eventTitle}" 已保存到默认日历`,
        timestamp: new Date()
      }
    }));
    
    console.warn(`📅 [Calendar Fallback] Event: "${eventTitle}", Invalid: ${invalidCalendarId}, Fallback: ${fallbackCalendarId}`);
  }

  private lastHealthScore = 100; // 🔧 [NEW] 缓存最近的健康评分

  private getLastHealthScore(): number {
    return this.lastHealthScore;
  }

  // 🔍 [NEW] 获取标签的日历映射
  private getCalendarIdForTag(tagId: string): string | null {
    // Getting calendar ID for tag
    
    if (!tagId) {
      // No tagId provided
      return null;
    }
    
      try {
        // 🔧 修复：使用TagService获取标签，而不是直接读取localStorage
        if (typeof window !== 'undefined' && (window as any)['FourDNoteCache']?.tags?.service) {
          const flatTags = (window as any)['FourDNoteCache'].tags.service.getFlatTags();        const foundTag = flatTags.find((tag: any) => tag.id === tagId);
        if (foundTag && foundTag.calendarMapping) {
          return foundTag.calendarMapping.calendarId;
        } else {
          return null;
        }
      } else {
        // TagService not available, return null
        console.warn('[ActionBasedSyncManager] TagService not available for tag', tagId);
        return null;
      }
      
    } catch (error) {
      console.error('❌ [TAG-CALENDAR] Error getting calendar mapping:', error);
      return null;
    }
  }

  // 🔧 [NEW] 获取所有有标签映射的日历的事件
  private async getMappedCalendarEvents(startDate?: Date, endDate?: Date): Promise<any[]> {
    try {
      // 获取所有标签的日历映射
      const mappedCalendars = new Set<string>();
      
      if (typeof window !== 'undefined' && (window as any).TagService) {
        const flatTags = (window as any).TagService.getFlatTags();
        
        flatTags.forEach((tag: any) => {
          if (tag.calendarMapping?.calendarId) {
            mappedCalendars.add(tag.calendarMapping.calendarId);
          }
        });
      } else {
        // TagService not available, using empty map
        console.warn('[ActionBasedSyncManager] TagService not available for calendar mappings');
      }
      
      // Found mapped calendars
      
      if (mappedCalendars.size === 0) {
        return [];
      }
      
      // 获取每个映射日历的事件
      const allEvents: any[] = [];
      
      for (const calendarId of Array.from(mappedCalendars)) {
        try {
          // Fetching events from calendar with time range
          const events = await this.microsoftService.getEventsFromCalendar(calendarId, startDate, endDate);
          
          // 为这些事件设置正确的 calendarId 和标签信息
          const enhancedEvents = events.map((event: any) => ({
            ...event,
            calendarId: calendarId,
            // 尝试找到对应的标签
            tagId: this.findTagIdForCalendar(calendarId)
          }));
          
          allEvents.push(...enhancedEvents);
          // Got events from calendar
        } catch (error) {
          console.warn('⚠️ [getMappedCalendarEvents] Failed to fetch events from calendar', calendarId, ':', error);
        }
      }
      
      // Total events from mapped calendars
      return allEvents;
      
    } catch (error) {
      console.error('❌ [getMappedCalendarEvents] Error getting mapped calendar events:', error);
      return [];
    }
  }

  // � [NEW] 优先同步可见日期范围的事件（立即），然后异步同步剩余事件
  public async syncVisibleDateRangeFirst(visibleStart: Date, visibleEnd: Date) {
    try {
      syncLogger.log('📅 [Priority Sync] Starting sync for visible date range:', {
        start: formatTimeForStorage(visibleStart),
        end: formatTimeForStorage(visibleEnd)
      });

      // 0. 先推送本地未同步的更改（Local to Remote）
      const hasPendingLocalActions = this.actionQueue.some(
        action => action.source === 'local' && !action.synchronized
      );
      
      if (hasPendingLocalActions) {
        syncLogger.log('📤 [Priority Sync] Pushing local changes first...');
        await this.syncPendingLocalActions();
      }

      // 1. 立即同步可见范围的事件（Remote to Local）
      await this.syncDateRange(visibleStart, visibleEnd, true); // isHighPriority = true
      
      // 2. 异步同步剩余事件（分批次，避免阻塞UI）
      setTimeout(() => {
        this.syncRemainingEventsInBackground(visibleStart, visibleEnd);
      }, 100); // 100ms后开始后台同步

    } catch (error) {
      syncLogger.error('❌ [Priority Sync] Error:', error);
    }
  }

  // 🔧 [NEW] 同步指定日期范围的事件
  private async syncDateRange(startDate: Date, endDate: Date, isHighPriority: boolean = false) {
    if (!this.microsoftService.isSignedIn()) {
      syncLogger.warn('⚠️ [syncDateRange] Not signed in, skipping');
      return;
    }

    const priorityLabel = isHighPriority ? '[HIGH PRIORITY]' : '[BACKGROUND]';
    syncLogger.log(`📥 ${priorityLabel} Syncing date range:`, {
      start: formatTimeForStorage(startDate),
      end: formatTimeForStorage(endDate)
    });

    try {
      // 获取远程事件
      const remoteEvents = await this.getAllCalendarsEvents(startDate, endDate);
      
      if (remoteEvents === null || remoteEvents.length === 0) {
        syncLogger.warn(`⚠️ ${priorityLabel} No events found in range`);
        return;
      }

      syncLogger.log(`✅ ${priorityLabel} Got ${remoteEvents.length} events, processing...`);

      // 处理远程事件
      const localEvents = await this.getLocalEvents();
      const uniqueEvents = new Map();
      
      remoteEvents.forEach(event => {
        const key = event.externalId || event.id;
        if (key && !uniqueEvents.has(key)) {
          uniqueEvents.set(key, event);
        }
      });
      
      const eventsToProcess = Array.from(uniqueEvents.values());
      
      // 应用远程变更到本地
      for (const event of eventsToProcess) {
        // 检查是否已删除
        const cleanEventId = event.id.startsWith('outlook-') ? event.id.replace('outlook-', '') : event.id;
        const isDeleted = this.deletedEventIds.has(cleanEventId) || this.deletedEventIds.has(event.id);
        
        if (isDeleted) continue;

        // 检查是否已存在
        const pureOutlookId = event.id.replace(/^outlook-/, '');
        const existingLocal = this.eventIndexMap.get(pureOutlookId);

        if (!existingLocal) {
          // 创建新事件
          this.recordRemoteAction('create', 'event', event.id, event);
        } else {
          // 检查是否需要更新 (使用 TimeSpec 规范解析)
          const remoteModified = parseLocalTimeString(event.lastModifiedDateTime || event.createdDateTime);
          const localModified = parseLocalTimeString(existingLocal.updatedAt || existingLocal.createdAt);
          
          // 🔍 [DEBUG] 只对前 3 个事件打印时间对比
          if (Math.random() < 0.003) {
            console.log(`🕐 [Sync Time Check] ${existingLocal.id.slice(-8)}:`, {
              remote: event.lastModifiedDateTime,
              local: existingLocal.updatedAt,
              diff: `${((remoteModified.getTime() - localModified.getTime()) / 1000 / 60).toFixed(1)}min`,
              needsUpdate: remoteModified.getTime() > localModified.getTime() + 2 * 60 * 1000
            });
          }
          
          if (remoteModified.getTime() > localModified.getTime() + 2 * 60 * 1000) {
            this.recordRemoteAction('update', 'event', event.id, event);
          }
        }
      }

      // 立即应用远程动作
      await this.syncPendingRemoteActions();
      
      if (isHighPriority) {
        syncLogger.log('✅ [HIGH PRIORITY] Visible range synced successfully');
        
        // 触发UI更新事件
        window.dispatchEvent(new CustomEvent('visibleRangeSynced', {
          detail: { 
            count: eventsToProcess.length,
            startDate,
            endDate
          }
        }));
      }

    } catch (error) {
      syncLogger.error(`❌ ${priorityLabel} Sync failed:`, error);
    }
  }

  // 🔧 [NEW] 后台同步剩余事件（分批次，避免阻塞UI）
  private async syncRemainingEventsInBackground(visibleStart: Date, visibleEnd: Date) {
    syncLogger.log('🔄 [Background Sync] Starting incremental sync for adjacent ranges...');

    try {
      // ✨ [OPTIMIZED] 增量同步：只预加载"相邻范围"，避免全量同步
      // 策略：向前/向后各扩展 2 周（用户最可能滚动到的区域）
      const PREFETCH_DAYS = 14; // 2周预加载范围
      
      const extendedStart = new Date(visibleStart);
      extendedStart.setDate(extendedStart.getDate() - PREFETCH_DAYS);
      extendedStart.setHours(0, 0, 0, 0);
      
      const extendedEnd = new Date(visibleEnd);
      extendedEnd.setDate(extendedEnd.getDate() + PREFETCH_DAYS);
      extendedEnd.setHours(23, 59, 59, 999);

      // 分批次同步：
      // Batch 1: visibleStart 之前 2 周
      if (extendedStart < visibleStart) {
        syncLogger.log('📦 [Background Sync] Batch 1: Events before visible range (2 weeks)');
        await this.syncDateRange(extendedStart, new Date(visibleStart.getTime() - 1));
        await new Promise(resolve => setTimeout(resolve, 300)); // 延迟300ms，避免速率限制
      }

      // Batch 2: visibleEnd 之后 2 周
      if (extendedEnd > visibleEnd) {
        syncLogger.log('📦 [Background Sync] Batch 2: Events after visible range (2 weeks)');
        await this.syncDateRange(new Date(visibleEnd.getTime() + 1), extendedEnd);
      }

      syncLogger.log('✅ [Background Sync] Incremental sync completed (±2 weeks)');

    } catch (error) {
      syncLogger.error('❌ [Background Sync] Error:', error);
    }
  }

  // �🔧 [NEW] 获取所有日历的事件（保证每个事件携带正确的 calendarId）
  // ⚡ [OPTIMIZED] 使用并发限制避免触发 Microsoft Graph API 速率限制 (429)
  private async getAllCalendarsEvents(startDate?: Date, endDate?: Date): Promise<any[] | null> {
    try {
      const allEvents: any[] = [];

      // 优先从缓存读取用户的全部日历
      let calendars: any[] = [];
      try {
        const savedCalendars = localStorage.getItem(STORAGE_KEYS.CALENDARS_CACHE);
        if (savedCalendars) {
          calendars = JSON.parse(savedCalendars) || [];
        }
      } catch (e) {
        // ignore and fallback to empty list
      }

      if (!calendars || calendars.length === 0) {
        // 如果缓存为空，直接返回空数组，避免误用 /me/events 丢失 calendarId
        console.warn('⚠️ [getAllCalendarsEvents] No calendars in cache; skip global fetch to preserve calendarId fidelity');
        return [];
      }
      // ⚡ [OPTIMIZED] 降低并发限制，避免触发 429 速率限制
      // Microsoft Graph API 限制：每用户每秒 ~10 请求，但批量拉取需更保守
      const CONCURRENT_LIMIT = 1; // 🔧 从 2 降低到 1（串行请求，最安全）
      const chunks = [];
      for (let i = 0; i < calendars.length; i += CONCURRENT_LIMIT) {
        chunks.push(calendars.slice(i, i + CONCURRENT_LIMIT));
      }
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚡ [getAllCalendarsEvents] Fetching ${calendars.length} calendars sequentially (${CONCURRENT_LIMIT} at a time)`);
      }
      
      // 🔧 [NEW] 记录批次数量，用于动态计算删除确认时间
      this.lastSyncBatchCount = chunks.length;
      
      for (const [index, chunk] of chunks.entries()) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`📦 [Calendar ${index + 1}/${chunks.length}] Processing...`);
        }
        
        // 串行请求日历（避免并发触发限流）
        const promises = chunk.map(async (cal: any) => {
          const calendarId = cal.id;
          try {
            const events = await this.microsoftService.getEventsFromCalendar(calendarId, startDate, endDate);
            return events.map((ev: any) => ({
              ...ev,
              calendarId,
              // 为每个事件附带对应标签（若有映射）
              tagId: this.findTagIdForCalendar(calendarId)
            }));
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            // 🔧 429 错误特殊处理
            if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
              console.warn(`⏳ [429 Rate Limit] Calendar ${calendarId} - will retry later`);
              // 返回空数组，稍后会自动重试
              return [];
            }
            console.warn('⚠️ [getAllCalendarsEvents] Failed fetching events for calendar', calendarId, err);
            return [];
          }
        });
        
        const results = await Promise.all(promises);
        results.forEach(events => allEvents.push(...events));
        
        // 🔧 增加批次间延迟，避免速率限制（800ms → 2000ms → 3500ms）
        // Microsoft Graph 限制非常严格，需要更长的延迟避免 429
        if (index < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3500));
        }
      }
      return allEvents;
    } catch (error) {
      console.error('❌ [getAllCalendarsEvents] Error:', error);
      return null; // 🔧 返回 null 表示获取失败（而不是"确实没有事件"）
    }
  }

  // 🔧 [NEW] 找到映射到指定日历的标签ID
  private findTagIdForCalendar(calendarId: string): string | null {
    try {
      if (typeof window !== 'undefined' && (window as any).TagService) {
        const flatTags = (window as any).TagService.getFlatTags();
        const foundTag = flatTags.find((tag: any) => tag.calendarMapping?.calendarId === calendarId);
        return foundTag?.id || null;
      } else {
        // TagService not available, return null
        console.warn('[ActionBasedSyncManager] TagService not available for calendar', calendarId);
      }
      return null;
    } catch (error) {
      console.error('❌ [findTagIdForCalendar] Error:', error);
      return null;
    }
  }

  private async loadActionQueue() {
    try {
      // 🔄 [MIGRATION] 从 StorageManager (IndexedDB) 加载同步队列
      const syncQueueItems = await storageManager.getSyncQueue();
      
      // 转换 SyncQueueItem 到 SyncAction 格式
      this.actionQueue = syncQueueItems.map((item: SyncQueueItem) => ({
        id: item.id,
        type: item.operation,
        entityType: item.entityType as 'event' | 'task',
        entityId: item.entityId,
        timestamp: new Date(item.createdAt),
        source: 'local' as const,
        data: item.data,
        synchronized: item.status === SyncStatus.Synced,
        synchronizedAt: item.status === SyncStatus.Synced ? new Date(item.updatedAt) : undefined,
        retryCount: item.attempts,
        lastError: item.error,
        lastAttemptTime: item.lastAttemptAt ? new Date(item.lastAttemptAt) : undefined
      }));

      console.log(`[ActionBasedSyncManager] ✅ Loaded ${this.actionQueue.length} sync actions from IndexedDB`);
      
      // ✨ 初始化状态追踪
      this.lastSavedQueueSize = this.actionQueue.length;
      this.queueDirty = false; // 刚加载，队列干净
      
      // 🗺️ 加载 IndexMap
      await this.loadIndexMap();
    } catch (error) {
      console.error('[ActionBasedSyncManager] ❌ Failed to load action queue:', error);
      this.actionQueue = [];
      this.lastSavedQueueSize = 0;
      this.queueDirty = false;
    }
  }

  private async saveActionQueueAsync() {
    // ✨ 只在队列脏时才保存
    if (!this.queueDirty) {
      console.log(`[ActionBasedSyncManager] ⏭️ Queue not dirty, skipping save (${this.actionQueue.length} actions)`);
      return;
    }
    
    try {
      const startTime = performance.now();
      
      // 🔄 [MIGRATION] 保存到 StorageManager (IndexedDB)
      // 注意：IndexedDB 使用 upsert 语义，相同 ID 会覆盖旧记录
      
      // 转换 SyncAction 到 SyncQueueItem 格式
      const syncQueueItems: SyncQueueItem[] = this.actionQueue.map((action: SyncAction) => ({
        id: action.id,
        operation: action.type,
        entityType: action.entityType as 'event' | 'contact' | 'tag' | 'eventlog',
        entityId: action.entityId,
        data: action.data,
        status: action.synchronized ? SyncStatus.Synced : SyncStatus.Pending,
        attempts: action.retryCount,
        lastAttemptAt: action.lastAttemptTime ? formatTimeForStorage(action.lastAttemptTime) : undefined,
        error: action.lastError,
        createdAt: formatTimeForStorage(action.timestamp),
        updatedAt: action.synchronizedAt ? formatTimeForStorage(action.synchronizedAt) : formatTimeForStorage(new Date())
      }));

      // 批量保存（使用 put 操作，自动覆盖相同 ID）
      await storageManager.createSyncActions(syncQueueItems);
      
      // 🔧 [FIX] 更新队列修改时间，用于完整性检查的调度
      this.lastQueueModification = Date.now();
      this.queueDirty = false;
      this.lastSavedQueueSize = this.actionQueue.length;
      
      const duration = performance.now() - startTime;
      console.log(`[ActionBasedSyncManager] ✅ Saved ${syncQueueItems.length} sync actions to IndexedDB in ${duration.toFixed(1)}ms`);
    } catch (error) {
      console.error('[ActionBasedSyncManager] ❌ Failed to save action queue:', error);
    }
  }

  /**
   * Fire-and-forget wrapper for saveActionQueueAsync with debounce
   * 🔄 [MIGRATION] 保持同步调用接口，内部异步执行
   * ✨ [OPTIMIZATION] 防抖 500ms，避免频繁保存
   */
  private saveActionQueue() {
    this.queueDirty = true;
    
    // ✨ 防抖：取消之前的定时器
    if (this.saveQueueDebounceTimer) {
      clearTimeout(this.saveQueueDebounceTimer);
    }
    
    // ✨ 500ms 后执行保存
    this.saveQueueDebounceTimer = setTimeout(() => {
      this.saveActionQueueAsync().catch(err => 
        console.error('[ActionBasedSyncManager] saveActionQueue failed:', err)
      );
    }, 500);
  }
  
  /**
   * ✨ 立即保存队列（用于关键操作，如 stop()）
   */
  private async saveActionQueueImmediate() {
    if (this.saveQueueDebounceTimer) {
      clearTimeout(this.saveQueueDebounceTimer);
      this.saveQueueDebounceTimer = null;
    }
    this.queueDirty = true;
    await this.saveActionQueueAsync();
  }

  // 🗺️ IndexMap 不再持久化，每次启动时从 events 重建
  private async loadIndexMap(): Promise<void> {
    // IndexMap 是纯内存索引，不从 localStorage 加载
    // 将在第一次同步时通过 rebuildEventIndexMapAsync 构建
    console.log('[ActionBasedSyncManager] 🗺️ IndexMap will be rebuilt from events on first sync');
    this.eventIndexMap = new Map();
    this.indexMapDirty = false;
  }

  // 🗺️ IndexMap 不再保存到 localStorage，避免配额问题
  // IndexMap 是纯内存索引，每次启动时重建
  private saveIndexMap(): void {
    // 不再保存
  }

  private async saveIndexMapImmediate(): Promise<void> {
    // 不再保存
  }

  private loadConflictQueue() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SYNC_CONFLICTS);
      if (stored) {
        this.conflictQueue = JSON.parse(stored).map((conflict: any) => ({
          ...conflict,
          localAction: {
            ...conflict.localAction,
            timestamp: new Date(conflict.localAction.timestamp)
          },
          remoteAction: {
            ...conflict.remoteAction,
            timestamp: new Date(conflict.remoteAction.timestamp)
          }
        }));
      }
    } catch (error) {
      console.error('Failed to load conflict queue:', error);
      this.conflictQueue = [];
    }
  }

  private saveConflictQueue() {
    try {
      localStorage.setItem(STORAGE_KEYS.SYNC_CONFLICTS, JSON.stringify(this.conflictQueue));
    } catch (error) {
      console.error('Failed to save conflict queue:', error);
    }
  }

  // 🆕 加载已删除事件ID
  private loadDeletedEventIds() {
    try {
      const stored = localStorage.getItem('4dnote-dev-persistent-deletedEventIds');
      if (stored) {
        this.deletedEventIds = new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load deleted event IDs:', error);
      this.deletedEventIds = new Set();
    }
  }

  // 🆕 保存已删除事件ID
  private saveDeletedEventIds() {
    try {
      localStorage.setItem('4dnote-dev-persistent-deletedEventIds', JSON.stringify(Array.from(this.deletedEventIds)));
    } catch (error) {
      console.error('Failed to save deleted event IDs:', error);
    }
  }

  // 🆕 清理过期的已删除事件ID（避免Set无限增长）
  private cleanupDeletedEventIds() {
    // 保留最近1000个删除记录，超过的清理掉
    const maxSize = 1000;
    if (this.deletedEventIds.size > maxSize) {
      const array = Array.from(this.deletedEventIds);
      this.deletedEventIds = new Set(array.slice(-maxSize));
      this.saveDeletedEventIds();
    }
  }

  /**
   * 🔍 去重：检测并删除重复的事件
   * 重复定义：相同的 externalId（来自 Outlook）但不同的本地 ID
   * 策略：保留 lastSyncTime 最新的事件
   */
  private async deduplicateEvents() {
    try {
      const events = await EventService.getAllEvents(); // 自动规范化 title
      if (events.length === 0) return;
      
      // 🔧 [OPTIMIZATION] 快速预检：检查是否真的有重复
      const externalIdSet = new Set<string>();
      let hasDuplicate = false;
      
      for (const event of events) {
        if (event.externalId) {
          if (externalIdSet.has(event.externalId)) {
            hasDuplicate = true;
            break; // 发现重复，立即退出
          }
          externalIdSet.add(event.externalId);
        }
      }
      
      if (!hasDuplicate) {
        return; // ✅ 没有重复，直接返回，避免不必要的处理
      }
      
      // 如果有重复，才进行详细分组
      const externalIdMap = new Map<string, any[]>();
      
      // 按 externalId 分组
      events.forEach((event: any) => {
        if (event.externalId) {
          const existing = externalIdMap.get(event.externalId) || [];
          existing.push(event);
          externalIdMap.set(event.externalId, existing);
        }
      });

      // 统计重复
      let duplicateCount = 0;
      const duplicateGroups: string[] = [];
      
      externalIdMap.forEach((group, externalId) => {
        if (group.length > 1) {
          duplicateCount += group.length - 1;
          duplicateGroups.push(externalId);
        }
      });

      console.warn(`⚠️ [deduplicateEvents] Found ${duplicateCount} duplicate events in ${duplicateGroups.length} groups`);

      // 去重：每组只保留 lastSyncTime 最新的
      const uniqueEvents: any[] = [];
      const seenExternalIds = new Set<string>();
      const removedEventIds = new Set<string>();
      
      events.forEach((event: any) => {
        if (!event.externalId) {
          // 没有 externalId 的事件（本地新建）直接保留
          uniqueEvents.push(event);
          return;
        }

        if (seenExternalIds.has(event.externalId)) {
          // 已经处理过这个 externalId，需要比较
          const existingIndex = uniqueEvents.findIndex(e => e.externalId === event.externalId);
          if (existingIndex !== -1) {
            const existing = uniqueEvents[existingIndex];
            const existingTime = existing.lastSyncTime ? new Date(existing.lastSyncTime).getTime() : 0;
            const currentTime = event.lastSyncTime ? new Date(event.lastSyncTime).getTime() : 0;
            
            if (currentTime > existingTime) {
              // 当前事件更新，替换旧的
              removedEventIds.add(existing.id);
              uniqueEvents[existingIndex] = event;
            } else {
              // 旧事件更新，标记当前为删除
              removedEventIds.add(event.id);
            }
          }
        } else {
          // 第一次见到这个 externalId
          seenExternalIds.add(event.externalId);
          uniqueEvents.push(event);
        }
      });

      // 🔧 [IndexMap 优化] 从索引中删除被去重的事件
      removedEventIds.forEach(eventId => {
        const event = events.find((e: any) => e.id === eventId);
        if (event) {
          this.removeEventFromIndex(event);
        }
      });

      // 🔧 [CRITICAL FIX] 真正删除数据库中的重复记录,而非仅内存去重
      if (removedEventIds.size > 0) {
        const removedIds = Array.from(removedEventIds);
        console.log(`🗑️ [deduplicateEvents] Deleting ${removedIds.length} duplicate events from database...`);
        
        // ⚡ [PERFORMANCE] 使用批量删除API（单次事务），比逐个删除快100倍+
        const StorageManager = (window as any).StorageManager;
        if (StorageManager) {
          try {
            const deleteStart = performance.now();
            // 批量硬删除（单次事务）
            await StorageManager.batchHardDeleteEvents(removedIds);
            const deleteDuration = performance.now() - deleteStart;
            console.log(`✅ [deduplicateEvents] Deleted ${removedIds.length} duplicates in ${deleteDuration.toFixed(1)}ms`);
          } catch (error) {
            console.error('❌ [deduplicateEvents] Batch delete failed:', error);
          }
        }
      }
      
      // 异步重建 IndexMap
      this.rebuildEventIndexMapAsync(uniqueEvents).catch(err => {
        console.error('❌ [deduplicateEvents] Failed to rebuild IndexMap:', err);
      });
      
      // ⚠️ [CRITICAL] 不发送 eventsUpdated 通知！
      // 理由：删除的是重复副本，UI显示的是保留的事件，不需要触发组件更新
      // 发送通知会导致所有组件重新加载数据（1238个事件），造成严重性能问题
      if (removedEventIds.size > 0) {
        console.log(`✅ [deduplicateEvents] Cleaned ${removedEventIds.size} duplicates silently (no UI notification)`);
      }
      
      // 🧹 去重后立即清理重复的本地副本
      console.log('🧹 [deduplicateEvents] Triggering cleanup to remove duplicate copies...');
      setTimeout(() => this.cleanupSynchronizedActions(), 100);
      
    } catch (error) {
      console.error('❌ [deduplicateEvents] Failed:', error);
    }
  }

  // 🔧 添加同步备注生成方法
  private generateSyncNote(source: 'outlook' | '4dnote', action: 'create' | 'update'): string {
    const now = new Date();
    const timestamp = formatTimeForStorage(now).replace('T', ' ');
    const sourceDisplay = source === 'outlook' ? '📧 Outlook' : '🔮 4DNote';
    
    if (action === 'create') {
      return `\n\n---\n由 ${sourceDisplay} 创建`;
    } else {
      return `\n\n---\n由 ${sourceDisplay} 最新修改于 ${timestamp}`;
    }
  }

  // 🔧 检查文本中是否包含创建备注
  private hasCreateNote(text: string): boolean {
    const createNotePattern = /由 (?:📧 |🔮 )?(?:Outlook|4DNote) 创建/;
    return createNotePattern.test(text);
  }

  // 🔧 检查文本中是否包含编辑备注
  private hasEditNote(text: string): boolean {
    const editNotePattern = /由 (?:📧 |🔮 )?(?:Outlook|4DNote) (?:最后编辑于|最新修改于)/;
    return editNotePattern.test(text);
  }

  // 🔧 移除所有编辑备注，但保留创建备注，智能处理分隔线
  private removeEditNotesOnly(text: string): string {
    if (!text) return '';
    
    let result = text;
    
    // 1. 移除所有编辑备注（多行连续的）
    result = result.replace(/(\n由 (?:📧 |🔮 )?(?:Outlook|4DNote) (?:最后编辑于|最新修改于) [^\n]*)+$/g, '');
    
    // 2. 移除单独的编辑备注
    result = result.replace(/\n由 (?:📧 |🔮 )?(?:Outlook|4DNote) (?:最后编辑于|最新修改于) [^\n]*$/g, '');
    
    // 3. 清理多个连续的分隔线，合并为单个
    result = result.replace(/(\n---\s*){2,}/g, '\n---\n');
    
    // 4. 移除末尾孤立的分隔线（如果后面没有内容）
    result = result.replace(/\n---\s*$/g, '');
    
    return result.trim();
  }

  // 🔧 检查文本是否已经以分隔线结尾或包含创建备注
  private endsWithSeparator(text: string): boolean {
    const trimmed = text.trim();
    // 检查是否以 --- 结尾，或者包含创建备注（说明已有分隔线）
    return /\n---\s*$/.test(trimmed) || this.hasCreateNote(trimmed);
  }

  // 🔧 生成创建备注
  private generateCreateNote(source: 'outlook' | '4dnote', createTime?: Date | string, baseText?: string): string {
    // 使用传入的时间或当前时间
    const timeToUse = createTime ? (typeof createTime === 'string' ? new Date(createTime) : createTime) : new Date();
    const timeStr = `${timeToUse.getFullYear()}-${(timeToUse.getMonth() + 1).toString().padStart(2, '0')}-${timeToUse.getDate().toString().padStart(2, '0')} ${timeToUse.getHours().toString().padStart(2, '0')}:${timeToUse.getMinutes().toString().padStart(2, '0')}:${timeToUse.getSeconds().toString().padStart(2, '0')}`;
    const sourceIcon = source === 'outlook' ? '📧 Outlook' : '🔮 4DNote';
    
    // 检查是否需要添加分隔线
    if (baseText && (baseText.trim().endsWith('---') || baseText.includes('\n---\n'))) {
      // 如果已经有分隔线，只添加创建备注
      return `\n由 ${sourceIcon} 创建于 ${timeStr}`;
    } else {
      // 添加分隔线和创建备注
      return `\n\n---\n由 ${sourceIcon} 创建于 ${timeStr}`;
    }
  }

  // 🔧 生成编辑备注
  private generateEditNote(source: 'outlook' | '4dnote', baseText?: string): string {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const sourceIcon = source === 'outlook' ? '📧 Outlook' : '🔮 4DNote';
    
    // 检查基础文本是否已经以分隔线结尾
    if (baseText && this.endsWithSeparator(baseText)) {
      // 如果已经有分隔线，只添加编辑备注
      return `\n由 ${sourceIcon} 最后编辑于 ${timeStr}`;
    } else {
      // 如果没有分隔线，添加分隔线和编辑备注
      return `\n\n---\n由 ${sourceIcon} 最后编辑于 ${timeStr}`;
    }
  }

  /**
   * 从 EventTitle 对象中提取完整文本（包含 emoji，不包含 tag 元素）
   * @param title - EventTitle 对象
   * @returns 完整文本，从 colorTitle 提取，包含 emoji 和格式化文本，但不包含 tag 元素
   */
  private extractTextFromColorTitle(title: any): string {
    if (!title) return '';
    
    // 🔧 优先使用 colorTitle（已移除 tag 元素，只保留文本和格式）
    if (title.colorTitle) {
      try {
        // 尝试作为 Slate JSON 解析
        const nodes = JSON.parse(title.colorTitle);
        if (!Array.isArray(nodes)) return title.simpleTitle || '';
        
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
        
        const fullText = nodes.map(extractText).join('\n').trim();
        return fullText || title.simpleTitle || '';
      } catch (error) {
        // colorTitle 可能是纯文本格式（旧数据）
        return title.colorTitle || title.simpleTitle || '';
      }
    }
    
    // 降级：使用 simpleTitle
    return title.simpleTitle || '';
  }

  // 🔧 统一的描述处理方法 - 简化版本
  private processEventDescription(htmlContent: string, source: 'outlook' | '4dnote', action: 'create' | 'update' | 'sync', eventData?: any): string {
    // 1. 清理HTML内容，得到纯文本
    const cleanText = this.cleanHtmlContent(htmlContent);
    
    // 2. 移除多余的分隔符和处理原始内容
    
    // 3. 根据不同操作和情况处理
    if (source === 'outlook' && action === 'sync') {
      // 从Outlook同步到本地
      let result = this.extractOriginalDescription(cleanText);
      
      // 如果没有创建备注，添加Outlook创建备注，使用事件的真实创建时间
      if (!this.hasCreateNote(result)) {
        const createTime = eventData?.createdDateTime || eventData?.createdAt || new Date();
        result += this.generateCreateNote('outlook', createTime, result);
      }
      
      return result;
    }
    
    // 4. 对于本地操作（create/update）
    let result = cleanText;
    
    if (action === 'create') {
      // 创建操作：只有在没有创建备注时才添加
      if (!this.hasCreateNote(result)) {
        // 🔍 [NEW] 支持保持原始创建时间
        let createTime: Date;
        if (eventData?.preserveOriginalCreateTime) {
          createTime = eventData.preserveOriginalCreateTime;
          // Using preserved original create time
        } else {
          createTime = eventData?.createdAt || new Date();
          // Using new create time
        }
        
        result += this.generateCreateNote('4dnote', createTime, result);
        // Added 4DNote create note
      } else {
        // Skipping create note - already exists
      }
    } else if (action === 'update') {
      // 更新操作：移除编辑备注，保留创建备注，添加新的编辑备注
      result = this.removeEditNotesOnly(cleanText);
      result += this.generateEditNote('4dnote', result);
      // Removed old edit notes and added new edit note
    }
    
    // Description processing completed
    
    return result;
  }

  // 🔧 改进的提取原始内容方法 - 智能处理分隔线
  private extractOriginalDescription(description: string): string {
    if (!description) return '';
    
    let cleaned = description;
    
    // 1. 移除所有编辑备注（多行连续的）
    cleaned = cleaned.replace(/(\n由 (?:📧 |🔮 )?(?:Outlook|4DNote) (?:最后编辑于|最新修改于) [^\n]*)+$/g, '');
    
    // 2. 移除单独的编辑备注
    cleaned = cleaned.replace(/\n由 (?:📧 |🔮 )?(?:Outlook|4DNote) (?:最后编辑于|最新修改于) [^\n]*$/g, '');
    
    // 3. 清理多个连续的分隔线，合并为单个
    cleaned = cleaned.replace(/(\n---\s*){2,}/g, '\n---\n');
    
    // 4. 清理空行
    cleaned = cleaned.trim();
    
    // 5. 移除末尾孤立的分隔线（如果后面没有内容）
    cleaned = cleaned.replace(/\n---\s*$/g, '');
    
    return cleaned;
  }

  // 🔍 [NEW] 提取原始创建时间 - 用于保持事件的真实创建时间记录
  private extractOriginalCreateTime(description: string): Date | null {
    if (!description) return null;
    
    try {
      // 匹配创建时间的正则表达式
      // 格式：由 🔮 4DNote 创建于 2025-10-12 02:37:15
      // 或：  由 📧 Outlook 创建于 2025-10-12 02:37:15
      const createTimeMatch = description.match(/由 (?:🔮 4DNote|📧 Outlook) 创建于 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      
      if (createTimeMatch && createTimeMatch[1]) {
        const timeString = createTimeMatch[1];
        const parsedTime = new Date(timeString);
        
        if (!isNaN(parsedTime.getTime())) {
          // Found original create time
          return parsedTime;
        }
      }
      
      // No valid create time found
      return null;
    } catch (error) {
      console.warn('⚠️ [extractOriginalCreateTime] Error parsing create time:', error);
      return null;
    }
  }

  // 获取远程事件的描述内容 - 修复版本
  // ⚠️ [DEPRECATED v2.18.0] 此方法已不推荐使用，应直接使用 convertRemoteEventToLocal
  private getEventDescription(event: any): string {
    // 尝试多个可能的描述字段
    const htmlContent = event.body?.content || 
                       event.description || 
                       event.bodyPreview || 
                       '';
    
    // ✅ [v2.18.0] 直接返回清理后的纯文本，不添加签名备注
    // 因为 convertRemoteEventToLocal 会直接使用 HTML 传递给 normalizeEventLog
    return this.cleanHtmlContent(htmlContent);
  }

  // 🆕 编辑锁定机制 - 防止远程同步覆盖本地正在编辑的事件
  private setEditLock(entityId: string, durationMs: number = 10000) {
    // 设置10秒的编辑锁定期
    const expiryTime = Date.now() + durationMs;
    this.editLocks.set(entityId, expiryTime);
    // Locked event
  }

  private isEditLocked(entityId: string): boolean {
    const lockExpiry = this.editLocks.get(entityId);
    if (!lockExpiry) return false;
    
    if (Date.now() > lockExpiry) {
      // 锁定已过期，清除锁定
      this.editLocks.delete(entityId);
      // Lock expired
      return false;
    }
    
    // Event is still locked
    return true;
  }

  private clearEditLock(entityId: string) {
    if (this.editLocks.has(entityId)) {
      this.editLocks.delete(entityId);
      // Manually cleared lock
    }
  }

  public recordLocalAction(type: 'create' | 'update' | 'delete', entityType: 'event' | 'task', entityId: string, data?: any, oldData?: any) {
    // 🚀 [PERFORMANCE] 不立即清除缓存，等同步时再清除（避免频繁创建事件时重复查询）
    // this.localEventsCache = null; // ❌ 改为同步前清除
    
    //  [FIX] 记录最近更新的事件，防止同步时误删
    if (type === 'update' && entityType === 'event') {
      this.recentlyUpdatedEvents.set(entityId, Date.now());
    }
    
    // 🔧 注释：编辑锁定现在在实际同步时处理，而不是在记录时设置
    // if (type === 'update' && entityType === 'event') {
    //   this.setEditLock(entityId);
    // }

    // 🆕 [CRITICAL FIX] 当删除事件时，清理队列中该事件的所有待处理操作
    // 避免在同步时尝试更新/删除已不存在的事件
    if (type === 'delete' && entityType === 'event') {
      const beforeCount = this.actionQueue.length;
      this.actionQueue = this.actionQueue.filter(action => 
        !(action.entityId === entityId && action.entityType === 'event' && !action.synchronized)
      );
      const removedCount = beforeCount - this.actionQueue.length;
      
      if (removedCount > 0) {
        syncLogger.log(`🧹 [Queue Cleanup] Removed ${removedCount} pending actions for deleted event ${entityId}`);
      }
    }

    const action: SyncAction = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      entityType,
      entityId,
      timestamp: new Date(),
      source: 'local',
      data,
      oldData,
      originalData: oldData,
      synchronized: false,
      retryCount: 0
    };

    this.actionQueue.push(action);
    
    // 🔥 [CRITICAL FIX] 队列大小监控：超过 5000 触发强制清理
    if (this.actionQueue.length > 5000) {
      console.warn(`⚠️ [ActionQueue] Queue size exceeded 5000 (${this.actionQueue.length}), forcing cleanup...`);
      this.cleanupSynchronizedActions();
    }
    
    this.saveActionQueue();
    
    // 🔧 [NEW] 检查网络状态
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    
    if (this.isRunning && this.microsoftService.isSignedIn() && isOnline) {
      // � [PERFORMANCE FIX] 延迟同步避免阻塞 UI
      // 删除操作延迟 1 秒执行，让 UI 先响应用户操作
      const delayMs = type === 'delete' ? 1000 : 100;
      setTimeout(() => {
        this.syncSingleAction(action);
      }, delayMs);
    }
  }

  // 检查是否需要全量同步
  private checkIfFullSyncNeeded() {
    // 移除了ongoingDays的检查，因为现在默认同步1年的数据
    // 只在首次启动时需要全量同步
    if (!this.lastSyncSettings) {
      this.needsFullSync = true;
      this.lastSyncSettings = { initialized: true };
    }
  }

  // 🔧 [NEW] 获取当前 TimeCalendar 显示的日期
  private getCurrentCalendarDate(): Date {
    try {
      // 尝试从 localStorage 获取保存的当前日期
      const savedDate = localStorage.getItem('4dnote-calendar-current-date');
      if (savedDate) {
        const date = new Date(savedDate);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch (error) {
      // 忽略错误，使用默认值
    }
    
    // 默认返回当前日期
    return new Date();
  }

  public async start() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // 🔥 [CRITICAL FIX] 等待队列加载完成，然后清理历史积压的 actions
    console.log(`⏳ [Startup] Waiting for action queue to load...`);
    // 等待构造函数中的 loadActionQueue 完成
    let retries = 0;
    while (this.actionQueue.length === 0 && retries < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }
    console.log(`🧹 [Startup] Cleaning up action queue (current size: ${this.actionQueue.length})...`);
    this.cleanupSynchronizedActions();
    console.log(`✅ [Startup] Action queue cleaned (new size: ${this.actionQueue.length})`);
    
    // 🗺️ [CRITICAL] 加载事件并重建 IndexMap，避免同步时全部 mismatch
    console.log(`🗺️ [Startup] Rebuilding IndexMap from events...`);
    try {
      const events = await EventService.getAllEvents();
      await this.rebuildEventIndexMapAsync(events);
      const multiplier = events.length > 0 ? (this.eventIndexMap.size / events.length).toFixed(1) : '0';
      console.log(`✅ [Startup] IndexMap rebuilt: ${events.length} events → ${this.eventIndexMap.size} keys (${multiplier}x multiplier)`);
    } catch (error) {
      console.error('❌ [Startup] Failed to rebuild IndexMap:', error);
    }
    
    // 🔧 启动时立即检查 token 是否过期
    if (this.microsoftService && !this.microsoftService.checkTokenExpiration()) {
      // 不返回，让其他机制继续运行（用户可能会重新登录）
    }
    
    // 🔧 [FIX] 等待 TagService 初始化完成
    if (typeof window !== 'undefined' && (window as any).TagService) {
      try {
        syncLogger.log('⏳ [Start] Waiting for TagService initialization...');
        await (window as any).TagService.initialize();
        syncLogger.log('✅ [Start] TagService ready');
      } catch (error) {
        syncLogger.error('❌ [Start] TagService initialization failed:', error);
      }
    }
    
    // 检查是否需要全量同步
    this.checkIfFullSyncNeeded();
    
    // � [NEW] 立即同步可见日历视图（不延迟）
    // 优先同步当前月视图的事件，剩余事件异步后台同步
    if (typeof window !== 'undefined') {
      // 获取当前 TimeCalendar 的可见日期范围
      const currentDate = this.getCurrentCalendarDate();
      const visibleStart = new Date(currentDate);
      visibleStart.setMonth(visibleStart.getMonth() - 1); // 当前月-1月
      visibleStart.setDate(1);
      visibleStart.setHours(0, 0, 0, 0);
      
      const visibleEnd = new Date(currentDate);
      visibleEnd.setMonth(visibleEnd.getMonth() + 2); // 当前月+2月
      visibleEnd.setDate(0); // 上个月最后一天
      visibleEnd.setHours(23, 59, 59, 999);
      
      syncLogger.log('🚀 [Start] Immediate priority sync for visible calendar view');
      
      // 立即同步可见范围
      this.syncVisibleDateRangeFirst(visibleStart, visibleEnd).catch(error => {
        syncLogger.error('❌ [Start] Priority sync failed:', error);
      });
    } else {
      // 非浏览器环境，执行常规同步
      // ✅ v2.21.1: 使用 queueMicrotask 替代 setTimeout(0)
      queueMicrotask(() => {
        if (this.isRunning && !this.syncInProgress) {
          this.performSync();
        }
      });
    }
    
    // ✅ v2.21.1: 设置定期增量同步（20秒一次，只同步 3 个月窗口）
    // 已在 stop() 方法中清理
    this.syncInterval = setInterval(() => {
      // 🔧 [NEW] 主动检查 token 是否过期
      if (this.microsoftService && !this.microsoftService.checkTokenExpiration()) {
        return;
      }
      
      // 🔧 [MODIFIED] 移除窗口激活检查，允许在激活时同步
      // 删除检查会在 fetchRemoteChanges 中根据 isWindowFocused 跳过
      // if (this.isWindowFocused) {
      //   return;
      // }
      
      if (!this.syncInProgress) {
        // 🎯 标记为定时器触发，启用优先级控制
        this.isTimerTriggered = true;
        this.performSync();
      }
    }, 60000); // 60 秒 - 避免频繁同步导致性能问题
    
    // 🔧 [NEW] 立即启动高频完整性检查（每 5 秒检查一次，每次 < 10ms）
    this.startIntegrityCheckScheduler();
  }

  public async stop() {
    console.log(`🛑 [ActionBasedSyncManager] Stopping instance #${this.instanceId}`);
    this.isRunning = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    // 🔧 [NEW] 停止完整性检查
    if (this.indexIntegrityCheckInterval) {
      clearInterval(this.indexIntegrityCheckInterval);
      this.indexIntegrityCheckInterval = null;
    }
    // ✨ 清理视图变化定时器
    if (this.viewChangeTimeout) {
      clearTimeout(this.viewChangeTimeout);
      this.viewChangeTimeout = null;
    }
    // ✨ 清理队列保存防抖定时器并立即保存
    if (this.saveQueueDebounceTimer) {
      clearTimeout(this.saveQueueDebounceTimer);
      this.saveQueueDebounceTimer = null;
    }
    if (this.queueDirty) {
      console.log(`💾 [ActionBasedSyncManager] Saving queue before stop...`);
      await this.saveActionQueueImmediate();
    }
    // 🗺️ IndexMap 不再保存，每次启动时重建
    if (this.saveIndexMapDebounceTimer) {
      clearTimeout(this.saveIndexMapDebounceTimer);
      this.saveIndexMapDebounceTimer = null;
    }
    // ✨ 重置单例引用
    if (ActionBasedSyncManager.activeInstance === this) {
      ActionBasedSyncManager.activeInstance = null;
      console.log(`✅ [ActionBasedSyncManager] Instance #${this.instanceId} removed from active slot`);
    }
  }

  // 公共方法：触发全量同步（用于设置变更时调用）
  public triggerFullSync() {
    this.needsFullSync = true;
    this.checkIfFullSyncNeeded();
    
    // 如果正在运行，立即执行优先级同步
    if (this.isRunning && !this.syncInProgress) {
      // 🚀 使用优先级同步策略
      const currentDate = this.getCurrentCalendarDate();
      const visibleStart = new Date(currentDate);
      visibleStart.setMonth(visibleStart.getMonth() - 1);
      visibleStart.setDate(1);
      visibleStart.setHours(0, 0, 0, 0);
      
      const visibleEnd = new Date(currentDate);
      visibleEnd.setMonth(visibleEnd.getMonth() + 2);
      visibleEnd.setDate(0);
      visibleEnd.setHours(23, 59, 59, 999);
      
      syncLogger.log('🚀 [Full Sync Triggered] Using priority strategy');
      this.syncVisibleDateRangeFirst(visibleStart, visibleEnd).catch(error => {
        syncLogger.error('❌ [Full Sync] Priority sync failed:', error);
      });
    }
  }

  /**
   * 🆕 公共方法：清理同步队列中的失效操作
   * 用途：移除指向不存在事件的待处理操作
   * 
   * @returns 清理统计信息
   */
  public async cleanupInvalidQueueActions(): Promise<{ removed: number; kept: number }> {
    syncLogger.log('🧹 [Queue Cleanup] Starting cleanup of invalid actions...');
    
    const events = await EventService.getAllEvents();
    const eventIdSet = new Set(events.map(e => e.id));
    
    const beforeCount = this.actionQueue.length;
    
    // 保留：1) 已同步的操作（历史记录）2) 指向存在事件的待处理操作
    this.actionQueue = this.actionQueue.filter(action => {
      // 保留已同步的操作
      if (action.synchronized) {
        return true;
      }
      
      // 保留指向存在事件的操作
      if (action.entityId && eventIdSet.has(action.entityId)) {
        return true;
      }
      
      // 移除失效操作
      return false;
    });
    
    const afterCount = this.actionQueue.length;
    const removed = beforeCount - afterCount;
    
    if (removed > 0) {
      this.saveActionQueue();
      syncLogger.log(`🧹 [Queue Cleanup] Removed ${removed} invalid actions, kept ${afterCount}`);
    } else {
      syncLogger.log('✅ [Queue Cleanup] No invalid actions found');
    }
    
    return { removed, kept: afterCount };
  }

  private async performSync(options: { skipRemoteFetch?: boolean } = {}) {
    if (this.syncInProgress) {
      return;
    }
    
    if (!this.microsoftService.isSignedIn()) {
      return;
    }

    // 🔧 防止短时间内重复同步（最小间隔 5 秒）
    const now = Date.now();
    const timeSinceLastSync = this.lastSyncTime ? (now - this.lastSyncTime.getTime()) : Infinity;
    if (timeSinceLastSync < 5000) {
      return;
    }

    this.syncInProgress = true;
    const skipRemote = options.skipRemoteFetch || false;
    
    // 📊 重置同步统计
    this.syncStats = {
      syncFailed: 0,
      calendarCreated: 0,
      syncSuccess: 0
    };
    
    const syncStartTime = performance.now();

    try {
      // 🆕 清理过期的已删除事件ID
      this.cleanupDeletedEventIds();
      
      // 🔧 [FIX] 清理过期的最近更新事件记录（超过60秒的）
      const expireTime = Date.now() - 60000;
      let cleanedCount = 0;
      this.recentlyUpdatedEvents.forEach((timestamp, eventId) => {
        if (timestamp < expireTime) {
          this.recentlyUpdatedEvents.delete(eventId);
          cleanedCount++;
        }
      });
      if (cleanedCount > 0) {
        // 已清理过期记录
      }
      
      // 🔧 [OPTIMIZED] 双向同步优化：先推送本地更改（快），再拉取远程更改（慢）
      // 这样可以避免在只有本地更改时触发不必要的全量拉取（429错误）
      const hasPendingLocalActions = this.actionQueue.some(
        action => action.source === 'local' && !action.synchronized
      );
      
      if (hasPendingLocalActions) {
      // console.log('📤 [Sync] Step 1: Syncing local changes to remote (lightweight)...');
        await this.syncPendingLocalActions();
        
        // 🎯 [PRIORITY OPTIMIZATION] 如果定时器触发时发现有本地队列，先推送本地后立即返回
        // 让下一个定时器周期再拉取远程，确保 localToRemote 优先级高于 remoteToLocal
        if (!skipRemote && this.isTimerTriggered) {
          this.syncInProgress = false;
          this.isTimerTriggered = false; // 🎯 重置定时器标志
          this.lastSyncTime = new Date();
          return;
        }
      }
      
      // 根据skipRemote标志决定是否拉取远程
      if (!skipRemote) {
        await this.fetchRemoteChanges();
        await this.syncPendingRemoteActions();
      }
      
      await this.resolveConflicts();
      this.cleanupSynchronizedActions();
      
      // 🔍 去重检查：防止迁移等操作产生重复事件
      await this.deduplicateEvents();
      
      this.lastSyncTime = new Date();
      
      // 🔧 更新localStorage，供状态栏使用（使用本地时间格式）
      localStorage.setItem('lastSyncTime', formatTimeForStorage(this.lastSyncTime));
      localStorage.setItem('lastSyncEventCount', String(this.actionQueue.length || 0));
      
      // 📊 保存同步统计信息
      localStorage.setItem('syncStats', JSON.stringify(this.syncStats));
      
      const syncDuration = performance.now() - syncStartTime;
      
      window.dispatchEvent(new CustomEvent('action-sync-completed', {
        detail: { 
          timestamp: this.lastSyncTime,
          duration: syncDuration 
        }
      }));
      
      // ⚠️ 如果同步时间过长，给出警告
      if (syncDuration > 3000) {
        const localTime = this.lastLocalSyncDuration || 0;
        const remoteTime = this.lastRemoteSyncDuration || 0;
        const dedupTime = this.lastDedupDuration || 0;
        const otherTime = syncDuration - localTime - remoteTime - dedupTime;
        console.warn(`⚠️ [performSync] Sync took too long: ${syncDuration.toFixed(0)}ms (threshold: 3000ms)`);
        console.log(`📊 [Performance Breakdown] local=${localTime.toFixed(0)}ms, remote=${remoteTime.toFixed(0)}ms, dedup=${dedupTime.toFixed(0)}ms, other=${otherTime.toFixed(0)}ms`);
      }
    } catch (error) {
      console.error('❌ Sync failed:', error);
    } finally {
      this.syncInProgress = false;
      this.isTimerTriggered = false; // 🎯 重置定时器标志
    }
  }

  private async fetchRemoteChanges() {
    try {
      if (!this.microsoftService || !this.microsoftService.isSignedIn()) {
        return;
      }

      const isFullSync = this.needsFullSync;
      
      // ✅ 发送同步开始事件
      window.dispatchEvent(new CustomEvent('action-sync-started', { 
        detail: { isFullSync } 
      }));

      // 🔧 智能时间范围：根据同步类型决定范围
      const now = new Date();
      let startDate: Date;
      let endDate: Date;
      
      if (isFullSync) {
        // 全量同步：上次同步时间 → 现在 + 未来 3 个月
        startDate = this.lastSyncTime || new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date(now);
        endDate.setMonth(now.getMonth() + 3); // 未来 3 个月
        endDate.setHours(23, 59, 59, 999);
        
        this.needsFullSync = false; // 重置标记
      } else {
        // 增量同步：只检查最近 3 个月的事件（前后各 1.5 个月）
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1.5);
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date(now);
        endDate.setMonth(now.getMonth() + 1.5);
        endDate.setHours(23, 59, 59, 999);
      }

      
      const localEvents = await this.getLocalEvents();

      // 改为逐日历拉取，确保每个事件带有准确的 calendarId
      const allRemoteEvents = await this.getAllCalendarsEvents(startDate, endDate);
      
      // 🔧 [CRITICAL FIX] 如果获取失败（返回 null），中止同步以保护本地数据
      if (allRemoteEvents === null) {
        console.error('❌ [Sync] Failed to fetch remote events (possibly logged out), aborting sync to protect local data');
        return;
      }
      
      // 🔧 [CRITICAL FIX] 如果远程事件为空，可能是网络错误或登出，停止同步以保护本地数据
      if (allRemoteEvents.length === 0) {
        const hasLocalEventsWithExternalId = localEvents.some((e: any) => e.externalId);
        if (hasLocalEventsWithExternalId) {
          console.warn('⚠️ [Sync] Remote returned 0 events but local has synced events - possible auth issue, aborting sync to protect local data');
          return; // ❌ 中止同步，避免误删
        }
      }      const uniqueEvents = new Map();
      
      allRemoteEvents.forEach(event => {
        const key = event.externalId || event.id;
        if (key && !uniqueEvents.has(key)) {
          uniqueEvents.set(key, event);
        }
      });
      
      const combinedEvents = Array.from(uniqueEvents.values());
      const fourDNoteEvents = combinedEvents.filter((event: any) => {
        const subject = event.subject || '';
        
        // 🔧 修复时间解析问题
        let eventStartTime: Date;
        try {
          // 尝试多种时间字段
          const timeSource = event.start?.dateTime || 
                           event.start || 
                           event.createdDateTime || 
                           event.lastModifiedDateTime;
          
          if (timeSource) {
            eventStartTime = new Date(timeSource);
            // 验证日期是否有效
            if (isNaN(eventStartTime.getTime())) {
              console.error(`❌ [Sync] Invalid date for event "${subject}": ${timeSource}`);
              return false; // ⚠️ 时间无效，跳过该事件
            }
          } else {
            console.error(`❌ [Sync] No date found for event "${subject}"`);
            return false; // ⚠️ 无时间，跳过该事件
          }
        } catch (error) {
          console.error(`❌ [Sync] Date parsing error for event "${subject}":`, error);
          return false; // ⚠️ 解析失败，跳过该事件
        }
        
        const isInTimeRange = eventStartTime >= startDate && eventStartTime <= endDate;
        
        // 🔧 简化过滤逻辑：只要时间在范围内就同步
        const shouldInclude = isInTimeRange;
        
        return shouldInclude;
      });
      // 如果有事件被过滤掉，记录一个样本事件的信息
      if (combinedEvents.length > fourDNoteEvents.length) {
        const filteredOut = combinedEvents.filter(e => !fourDNoteEvents.includes(e))[0];
        if (filteredOut) {
        }
      }

      // 处理远程事件并转换为本地行动
      let createActionCount = 0;
      let updateActionCount = 0;
      
      fourDNoteEvents.forEach((event: any) => {
        // Processing event

        // 🆕 检查是否是已删除的事件，如果是则跳过
        const cleanEventId = event.id.startsWith('outlook-') ? event.id.replace('outlook-', '') : event.id;
        const isDeleted = this.deletedEventIds.has(cleanEventId) || this.deletedEventIds.has(event.id);
        
        if (isDeleted) {
          // Skipping deleted event
          return;
        }

        // 🚀 [SIMPLIFIED] 直接用纯 Outlook ID 查找 externalId
        // Outlook 返回的 event.id 是 'outlook-AAMkAD...'
        // 去掉前缀后得到纯 Outlook ID，这就是 externalId
        const pureOutlookId = event.id.replace(/^outlook-/, '');
        const existingLocal = this.eventIndexMap.get(pureOutlookId);

        if (!existingLocal) {
          // Creating new local event from remote
          // 🔧 [FIX] event.id 已经带有 'outlook-' 前缀（来自 MicrosoftCalendarService）
          // 不要重复添加前缀！
          this.recordRemoteAction('create', 'event', event.id, event);
          createActionCount++;
        } else {
          // 🔧 检查是否需要更新 - 更智能的比较逻辑 (使用 TimeSpec 规范解析)
          const remoteModified = parseLocalTimeString(event.lastModifiedDateTime || event.createdDateTime);
          const localModified = parseLocalTimeString(existingLocal.updatedAt || existingLocal.createdAt);
          
          // 🔧 验证日期有效性，使用安全的时间比较
          const isRemoteDateValid = !isNaN(remoteModified.getTime());
          const isLocalDateValid = !isNaN(localModified.getTime());
          
          let timeDiffMinutes = 0;
          let significantTimeChange = false;
          
          if (isRemoteDateValid && isLocalDateValid) {
            // 🔧 时间差阈值：只有大于2分钟的差异才认为是真正的更新（增加容错）
            timeDiffMinutes = Math.abs(remoteModified.getTime() - localModified.getTime()) / (1000 * 60);
            significantTimeChange = timeDiffMinutes > 2;
          }
          
          // 详细比较各个字段
          const titleChanged = event.subject !== existingLocal.title;
          
          // 🔧 智能描述比较：比较纯净的核心内容，忽略格式和备注差异
          const remoteRawDescription = this.getEventDescription(event);
          const localRawDescription = existingLocal.description || '';
          
          // 提取核心内容进行比较
          const remoteCoreContent = this.extractCoreContent(remoteRawDescription);
          const localCoreContent = this.extractCoreContent(localRawDescription);
          const descriptionChanged = remoteCoreContent !== localCoreContent;
          
          // Comparing events
          
          if (titleChanged || descriptionChanged || significantTimeChange) {
            const reason = titleChanged ? 'title' : descriptionChanged ? 'description' : 'significant time change';
            
            // 🔍 调试：打印前 3 个更新的详细信息
            if (updateActionCount < 3) {
              
              // 如果是描述更改，输出详细的内容对比
              if (descriptionChanged) {
                // console.log(`🔍 [Sync] Description comparison:`, { remoteCoreLength, localCoreLength, remoteCorePreview, localCorePreview });
              }
            }
            
            // Updating local event from remote
            this.recordRemoteAction('update', 'event', existingLocal.id, event, existingLocal);
            updateActionCount++;
          } else {
            // Event is up to date
          }
        }
      });
      
      // 📊 统计创建和更新的action数量（仅在有变化时输出）
      if (createActionCount > 0 || updateActionCount > 0) {
      }

      // 🔧 检测远程删除的事件
      // ⚠️ 重要：只在获取了完整事件列表时才检查删除
      // 如果使用时间窗口过滤的事件列表，会误判所有窗口外的事件为"已删除"
      
      // 🔧 从远程事件中提取原始的Outlook ID（去掉outlook-前缀）
      const remoteEventIds = new Set(combinedEvents.map((event: any) => {
        // MicrosoftCalendarService返回的ID格式是 "outlook-{原始ID}"
        const rawId = event.id.startsWith('outlook-') ? event.id.replace('outlook-', '') : event.id;
        return rawId;
      }));
      
      const localEventsWithExternalId = localEvents.filter((localEvent: any) => 
        localEvent.externalId && localEvent.externalId.trim() !== ''
      );

      // 🔍 [DEBUG] 检查是否有重复的 externalId
      const externalIdCounts = new Map<string, number>();
      const externalIdToEvents = new Map<string, any[]>();
      
      localEventsWithExternalId.forEach((event: any) => {
        const cleanId = event.externalId.startsWith('outlook-') 
          ? event.externalId.replace('outlook-', '') 
          : event.externalId;
        externalIdCounts.set(cleanId, (externalIdCounts.get(cleanId) || 0) + 1);
        
        // 记录每个 externalId 对应的事件列表
        const events = externalIdToEvents.get(cleanId) || [];
        events.push(event);
        externalIdToEvents.set(cleanId, events);
      });
      
      const duplicates = Array.from(externalIdCounts.entries()).filter(([_, count]) => count > 1);
      if (duplicates.length > 0) {
        // 计算总的重复事件数量
        const totalDuplicateEvents = duplicates.reduce((sum, [_, count]) => sum + count, 0);
        const extraDuplicates = totalDuplicateEvents - duplicates.length; // 多余的副本数量
        
        console.warn(`⚠️ [Sync] Found ${duplicates.length} externalIds with duplicates (total ${totalDuplicateEvents} events, ${extraDuplicates} extra copies)`);
        
        // 🔍 [DEBUG] 打印前3个重复的详细信息
        if (process.env.NODE_ENV === 'development' && duplicates.length > 0) {
          console.group('🔍 [Sync] Duplicate externalId details (first 3)');
          duplicates.slice(0, 3).forEach(([externalId, count]) => {
            const events = externalIdToEvents.get(externalId) || [];
            console.log(`📋 externalId: ${externalId.substring(0, 20)}... (${count} copies)`);
            events.forEach((event, index) => {
              const displayTitle = typeof event.title === 'object' ? (event.title?.simpleTitle || '[No Title]') : event.title;
              console.log(`  ${index + 1}. id: ${event.id.substring(0, 30)}..., title: "${displayTitle}", lastSyncTime: ${event.lastSyncTime || 'N/A'}`);
            });
          });
          console.groupEnd();
        }
      }

      
      // 📝 [NEW] 增加同步轮次
      this.syncRoundCounter++;      // ⚠️ 删除检查逻辑（两轮确认机制）：
      // 性能优化：只检查在同步窗口内的事件（通常 < 100个）
      // 1. 第一轮：未找到的事件加入候选列表（pending）
      // 2. 第二轮：候选列表中依然未找到的事件才真正删除
      // 3. 找到的事件从候选列表中移除

      // 🔧 [NEW] 删除轮询只在窗口非激活状态下进行，避免打断用户操作
      if (this.isWindowFocused) {
        console.log('⏸️ [Sync] Skipping deletion check: Window is focused (user is active)');
        // 注意：候选列表会保留，等待下一次窗口非激活时的同步再检查
      } else {
        const deletionCheckStartTime = performance.now();
        let deletionCheckCount = 0;
        let deletionCandidateCount = 0;
        let deletionConfirmedCount = 0;
      
      localEventsWithExternalId.forEach((localEvent: any) => {
        const cleanExternalId = localEvent.externalId.startsWith('outlook-') 
          ? localEvent.externalId.replace('outlook-', '')
          : localEvent.externalId;
        
        // 🔧 检查本地事件是否在当前同步的时间窗口内
        let localEventTime: Date;
        try {
          localEventTime = new Date(localEvent.start || localEvent.startTime);
        } catch {
          localEventTime = new Date(0); // fallback to epoch
        }
        
        const isInSyncWindow = localEventTime >= startDate && localEventTime <= endDate;
        
        // 🔧 [NEW] 检查是否已在候选列表中（即使不在同步窗口内）
        const isInCandidateList = this.deletionCandidates.has(localEvent.id);
        
        // 检查条件：在同步窗口内 OR 已在候选列表中
        if (isInSyncWindow || isInCandidateList) {
          const isFoundInRemote = remoteEventIds.has(cleanExternalId);
          
          if (isFoundInRemote) {
            // ✅ 找到了，从候选列表中移除
            if (this.deletionCandidates.has(localEvent.id)) {
              this.deletionCandidates.delete(localEvent.id);
            }
          } else {
            // ❌ 未找到，进入删除确认流程
            
            // 🔧 [FIX] 增加额外保护：检查事件是否最近刚更新过
            const recentlyUpdated = this.recentlyUpdatedEvents.has(localEvent.id);
            const lastUpdateTime = this.recentlyUpdatedEvents.get(localEvent.id) || 0;
            const timeSinceUpdate = Date.now() - lastUpdateTime;
            
            // 如果事件在最近30秒内被更新过，不视为删除（可能是同步延迟）
            if (recentlyUpdated && timeSinceUpdate < 30000) {
              deletionCheckCount++;
              return;
            }
            
            // 🔧 [FIX] 再次确认：检查是否在已删除列表中（避免重复删除）
            if (this.deletedEventIds.has(localEvent.id)) {
              deletionCheckCount++;
              return;
            }
            
            const existingCandidate = this.deletionCandidates.get(localEvent.id);
            const now = Date.now();
            
            if (!existingCandidate) {
              // 🆕 第一次未找到，加入候选列表
              this.deletionCandidates.set(localEvent.id, {
                externalId: cleanExternalId,
                title: localEvent.title?.simpleTitle || '',
                firstMissingRound: this.syncRoundCounter,
                firstMissingTime: now,
                lastCheckRound: this.syncRoundCounter,
                lastCheckTime: now
              });
              deletionCandidateCount++;
              
              if (deletionCandidateCount <= 3) {
      // console.log(`⏳ [Sync] Deletion candidate (1st miss): "${localEvent.title}"`);
              }
            } else {
              // 🔄 已在候选列表，检查是否满足删除条件
              existingCandidate.lastCheckRound = this.syncRoundCounter;
              existingCandidate.lastCheckTime = now;
              
              const roundsSinceMissing = this.syncRoundCounter - existingCandidate.firstMissingRound;
              const timeSinceMissing = now - existingCandidate.firstMissingTime;
              
              // 🔧 [NEW] 动态计算最小删除确认时间
              // 公式：Math.max(60000, 批次数量 * 800ms间隔 + 30000ms安全余量)
              // 例如：50个批次 → max(60000, 50*800+30000) = max(60000, 70000) = 70秒
              const minDeletionConfirmTime = Math.max(60000, this.lastSyncBatchCount * 800 + 30000);
              
              // 🔧 删除条件：至少2轮查询都未找到，且间隔超过动态计算的最小时间
              if (roundsSinceMissing >= 1 && timeSinceMissing >= minDeletionConfirmTime) {
                // ✅ 确认删除
                if (deletionConfirmedCount < 3) {
                  console.warn(`🗑️ [Sync] Confirmed deletion after ${roundsSinceMissing + 1} rounds (${Math.round(timeSinceMissing/1000)}s): "${localEvent.title}"`);
                }
                this.recordRemoteAction('delete', 'event', localEvent.id, null, localEvent);
                this.deletionCandidates.delete(localEvent.id);
                deletionConfirmedCount++;
              } else {
                // ⏳ 还在候选期，等待下一轮
                deletionCandidateCount++;
              }
            }
          }
          deletionCheckCount++;
        }
      });
      
      const deletionCheckDuration = performance.now() - deletionCheckStartTime;
      // 仅在有删除或候选时输出日志
      if (deletionCandidateCount > 0 || deletionConfirmedCount > 0) {
      // console.log(`📊 [Sync] Deletion check: ${deletionCandidateCount} pending, ${deletionConfirmedCount} confirmed (${deletionCheckDuration.toFixed(1)}ms)`);
      }
      
      // ⚠️ 性能警告
      if (deletionCheckDuration > 50) {
        console.warn(`⚠️ [Sync] Deletion check took too long: ${deletionCheckDuration.toFixed(0)}ms (threshold: 50ms)`);
      }
      
      // 🔧 清理过期的候选（超过10轮或超过10分钟仍未确认的，移除候选状态）
      const nowTime = Date.now();
      const expiredCandidates: string[] = [];
      this.deletionCandidates.forEach((candidate, eventId) => {
        const roundsSinceMissing = this.syncRoundCounter - candidate.firstMissingRound;
        const timeSinceMissing = nowTime - candidate.firstMissingTime;
        if (roundsSinceMissing > 10 || timeSinceMissing > 600000) {
          expiredCandidates.push(eventId);
        }
      });
      expiredCandidates.forEach(id => {
        const candidate = this.deletionCandidates.get(id);
        this.deletionCandidates.delete(id);
      });
      } // 🔧 [END] 删除检查 else 块

      // 🔧 只在全量同步时重置标记并输出特殊日志
      if (isFullSync) {
        // 全量同步完成，重置标记
        this.needsFullSync = false;
      } else {
      }

      // ...existing code...
    } catch (error) {
      console.error('❌ Failed to fetch remote changes:', error);
    }
  }

// 🔧 获取用户设置的方法（已废弃ongoingDays参数，现在默认同步1年数据）
private getUserSettings(): any {
  try {
    const settings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return settings ? JSON.parse(settings) : {};
  } catch {
    return {};
  }
}

  private recordRemoteAction(type: 'create' | 'update' | 'delete', entityType: 'event' | 'task', entityId: string, data?: any, oldData?: any) {
    // 🔥 [CRITICAL FIX] 防止重复 action：检查是否已有相同的未同步 action
    const existingAction = this.actionQueue.find(a => 
      a.source === 'outlook' &&
      a.entityType === entityType &&
      a.entityId === entityId &&
      a.type === type &&
      !a.synchronized
    );
    
    if (existingAction) {
      // 更新现有 action 的时间戳和数据
      existingAction.timestamp = new Date();
      existingAction.data = data;
      existingAction.oldData = oldData;
      existingAction.originalData = oldData;
      // console.log(`🔄 [RecordRemote] Updated existing action: ${type} ${entityId.slice(-8)}`);
      return;
    }
    
    const action: SyncAction = {
      id: `remote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      entityType,
      entityId,
      timestamp: new Date(),
      source: 'outlook',
      data,
      oldData,
      originalData: oldData,
      synchronized: false,
      retryCount: 0
    };

    this.actionQueue.push(action);
  }

  private async syncPendingLocalActions() {
    // 🚀 [PERFORMANCE] 同步前清除缓存，确保使用最新数据
    this.localEventsCache = null;
    
    const pendingLocalActions = this.actionQueue.filter(
      action => action.source === 'local' && !action.synchronized
    );
    
    // 🚀 [PERFORMANCE FIX] 只查询需要的事件ID，避免全表扫描（1233 → ~100）
    let localEvents: any[] | null = null;
    if (pendingLocalActions.length > 0) {
      const eventIds = [...new Set(pendingLocalActions.map(a => a.entityId))]; // 去重
      const events = await storageManager.queryEvents({
        filters: { eventIds },
        limit: eventIds.length
      });
      localEvents = events.items;
      console.log(`⚡ [SyncLocal] Preloaded ${localEvents.length} events to memory for ${pendingLocalActions.length} actions`);
    }
    
    // � [OPTIMIZATION] 合并同一个事件的多个 action，只保留最新的
    const consolidatedActions = new Map<string, SyncAction>();
    const markedAsSynced: SyncAction[] = []; // 需要标记为已同步的旧 action
    
    pendingLocalActions.forEach(action => {
      const key = `${action.entityType}-${action.entityId}`;
      const existing = consolidatedActions.get(key);
      
      if (!existing) {
        // 第一次遇到这个事件，直接添加
        consolidatedActions.set(key, action);
      } else {
        // 已经有这个事件的 action，需要合并
        if (action.type === 'delete') {
          // delete 优先级最高，覆盖任何其他操作
          markedAsSynced.push(existing); // 标记旧的为已同步
          consolidatedActions.set(key, action);
        } else if (existing.type === 'delete') {
          // 如果已经有 delete，保留 delete，忽略后续操作
          markedAsSynced.push(action);
        } else if (action.timestamp > existing.timestamp) {
          // 保留最新的操作（时间戳更大）
          markedAsSynced.push(existing);
          consolidatedActions.set(key, action);
        } else {
          // 当前操作更旧，忽略
          markedAsSynced.push(action);
        }
      }
    });
    
    // 🔧 标记被合并的旧 action 为已同步（避免重复执行）
    if (markedAsSynced.length > 0) {
      markedAsSynced.forEach(action => {
        action.synchronized = true;
        action.synchronizedAt = new Date();
      });
      this.saveActionQueue();
      console.log(`🔧 [Queue Optimization] Consolidated ${pendingLocalActions.length} actions → ${consolidatedActions.size} actions (saved ${markedAsSynced.length} API calls)`);
    }
    
    // 🔧 按重试次数排序，优先处理失败次数少的（新创建的事件优先）
    const actionsToSync = Array.from(consolidatedActions.values()).sort((a, b) => 
      (a.retryCount || 0) - (b.retryCount || 0)
    );

    // 🚀 [FIX] 批量限制策略 - 避免 429 错误
    // 窗口激活时：每次最多同步 10 个 action，剩余的留待下次定时同步
    // 窗口非激活时：快速批量处理
    const maxActionsPerSync = this.isWindowFocused ? 10 : actionsToSync.length;
    const actionsThisBatch = actionsToSync.slice(0, maxActionsPerSync);
    const remainingActions = actionsToSync.slice(maxActionsPerSync);
    
    if (remainingActions.length > 0) {
      console.log(`⏸️ [Sync] Window focused, limiting to ${maxActionsPerSync} actions this round. Remaining: ${remainingActions.length}`);
    }

    for (let i = 0; i < actionsThisBatch.length; i++) {
      const action = actionsThisBatch[i];
      
      try {
        await this.syncSingleAction(action, localEvents);
        
        // 🔧 窗口激活时添加短延迟，避免 UI 阻塞
        if (this.isWindowFocused && i < actionsThisBatch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        // 🔧 如果是 429 错误，立即停止本批次，等待下次同步
        if (error instanceof Error && error.message.includes('429')) {
          console.warn(`⚠️ [Sync] 429 throttling detected, stopping batch. Will retry remaining ${actionsThisBatch.length - i - 1} actions later.`);
          break;
        }
      }
    }
    
    // 🔧 [CRITICAL FIX] 清理已同步的 actions
    this.cleanupSynchronizedActions();
  }

  private async syncPendingRemoteActions() {
    const pendingRemoteActions = this.actionQueue.filter(
      action => action.source === 'outlook' && !action.synchronized
    );
    if (pendingRemoteActions.length === 0) {
      return;
    }
    
    // 🔧 [CRITICAL] 等待 IndexMap 重建完成，避免竞态条件
    if (this.indexMapRebuildPromise) {
      console.log(`⏳ [SyncRemote] Waiting for IndexMap rebuild to complete...`);
      await this.indexMapRebuildPromise;
      console.log(`✅ [SyncRemote] IndexMap rebuild completed, proceeding with ${pendingRemoteActions.length} actions`);
    }
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    // 🔧 [ARCHITECTURE FIX] 分离 update 操作（通过 EventService）和 create/delete（保留旧逻辑）
    const updateActions = pendingRemoteActions.filter(a => a.type === 'update');
    const otherActions = pendingRemoteActions.filter(a => a.type !== 'update');
    
    // ========== 处理 UPDATE 操作（通过 EventService，带变化检测） ==========
    // 🚀 [PERFORMANCE FIX] 只查询需要更新的事件ID，避免全表扫描（1233 events → ~900 events）
    const allEventsMap = new Map<string, any>();
    if (updateActions.length > 0) {
      const eventIds = updateActions.map(a => a.entityId);
      const events = await storageManager.queryEvents({
        filters: { eventIds },
        limit: eventIds.length
      });
      events.items.forEach(e => allEventsMap.set(e.id, e));
      console.log(`⚡ [SyncRemote] Preloaded ${events.items.length} events to memory for ${updateActions.length} updates`);
    }
    
    for (let i = 0; i < updateActions.length; i++) {
      const action = updateActions[i];
      
      // 🚀 [PERFORMANCE] 每处理50个事件让出控制权，避免阻塞UI
      if (i > 0 && i % 50 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      try {
        const localEvent = allEventsMap.get(action.entityId);
        
        // 🛡️ [软删除保护] 如果本地事件已被软删除，跳过远程更新
        if (localEvent && localEvent.deletedAt) {
          console.log(`🛡️ [Sync] Skipping UPDATE for soft-deleted event: ${action.entityId.slice(-8)}`);
          action.synchronized = true;
          action.synchronizedAt = new Date();
          skippedCount++;
          continue;
        }
        
        if (!localEvent) {
          // 🔧 [FIX] 静默标记为已同步（事件可能已被删除）
          // 只在前3个输出警告，避免刷屏
          if (failCount < 3) {
            console.warn(`⚠️ [SyncRemote] Event not found (likely deleted): ${action.entityId}`);
          }
          action.synchronized = true;
          action.synchronizedAt = new Date();
          skippedCount++; // 🔧 计入 skipped 而不是 failed
          continue;
        }
        
        // 🔧 [MIGRATION FIX] 自动升级旧的 receive-only 模式为 bidirectional-private
        // 这是为了修复历史遗留问题：旧代码将 Outlook 事件默认设置为 receive-only
        if (localEvent.syncMode === 'receive-only' || !localEvent.syncMode) {
          if (successCount < 3) {
            console.log(`🔧 [Migration] 自动升级 syncMode: ${localEvent.id.slice(-8)} receive-only → bidirectional-private`);
          }
          // 立即更新数据库
          await storageManager.updateEvent(localEvent.id, {
            syncMode: 'bidirectional-private'
          });
          // 更新内存中的对象
          localEvent.syncMode = 'bidirectional-private';
        }
        
        // 🔧 检测变化
        let remoteTitle = action.data.subject || '';
        
        // 🔧 [CRITICAL FIX] 检测并修复多重序列化的标题
        // 如果 remoteTitle 是 Slate JSON 字符串，提取纯文本
        try {
          const parsed = JSON.parse(remoteTitle);
          if (Array.isArray(parsed)) {
            console.warn(`⚠️ [Sync] 检测到损坏的远程标题（Slate JSON），提取纯文本:`, remoteTitle.substring(0, 100));
            // 递归提取纯文本
            const extractText = (nodes: any[]): string => {
              let text = '';
              for (const node of nodes) {
                if (typeof node === 'string') {
                  text += node;
                } else if (node.text) {
                  text += node.text;
                } else if (node.children) {
                  text += extractText(node.children);
                }
              }
              return text;
            };
            remoteTitle = extractText(parsed).trim();
            console.log(`✅ [Sync] 修复后的标题:`, remoteTitle);
          }
        } catch {
          // 不是 JSON，保持原样
        }
        
        // 🔧 确保 localTitle 是字符串
        const localTitle = (() => {
          if (!localEvent.title) return '';
          if (typeof localEvent.title === 'string') return localEvent.title;
          return localEvent.title.simpleTitle || '';
        })();
        
        // 🔍 调试：验证 localTitle 类型
        if (successCount < 3 && typeof localTitle !== 'string') {
          console.error('❌ [Sync] localTitle 类型错误:', {
            eventId: localEvent.id.slice(-8),
            'typeof localTitle': typeof localTitle,
            localTitle,
            'localEvent.title': localEvent.title
          });
        }
        
        // 🔧 读取 syncMode（此时已经过自动升级处理）
        const syncMode = localEvent.syncMode || 'bidirectional-private'; // 默认双向同步
        
        // 🔧 [CRITICAL FIX] 如果 remoteTitle 为空但 localTitle 不为空，保留 localTitle
        // Outlook 不允许空标题，如果 action.data.subject 为空，说明数据不完整
        // 🔧 [RICH TEXT FIX] 对于任何模式，如果本地有富文本标题（fullTitle），
        // 只在远程标题包含不同的实质内容时才更新，避免丢失 emoji/格式
        let titleChanged = false;
        if (remoteTitle && remoteTitle !== localTitle) {
          const localHasRichText = localEvent.title?.fullTitle && localEvent.title.fullTitle !== JSON.stringify([{ type: 'paragraph', children: [{ text: localTitle }] }]);
          
          // 🔧 调试日志
          if (successCount < 3) {
            console.log(`🔍 [Sync Title] ${localEvent.id.slice(-8)}:`, {
              remoteTitle,
              localTitle,
              localHasRichText,
              syncMode,
              'localEvent.title': localEvent.title,
              '会覆盖': syncMode === 'receive-only' && titleChanged
            });
          }
          
          // 如果本地有富文本，提取纯文本比较（忽略 emoji/格式差异）
          if (localHasRichText) {
            const localPlainText = localTitle.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
            const remotePlainText = remoteTitle.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
            titleChanged = remotePlainText && remotePlainText !== localPlainText;
            
            if (successCount < 3) {
              console.log(`🔍 [Sync Title Compare] ${localEvent.id.slice(-8)}:`, {
                localPlainText,
                remotePlainText,
                titleChanged
              });
            }
          } else {
            titleChanged = true;
          }
        }
        
        const remoteStart = this.safeFormatDateTime(action.data.start?.dateTime || action.data.start);
        const remoteEnd = this.safeFormatDateTime(action.data.end?.dateTime || action.data.end);
        const timeChanged = remoteStart !== localEvent.startTime || remoteEnd !== localEvent.endTime;
        
        // ✅ [v2.18.0 优化] 比较核心内容，移除签名后再比较
        // 数据流：Outlook HTML → 清理 HTML 标签 → 移除签名 → 比较
        const htmlContent = action.data.body?.content || action.data.description || action.data.bodyPreview || '';
        const cleanDescription = this.cleanHtmlContent(htmlContent);
        // 🔥 [CRITICAL FIX] 移除签名后再比较，避免误判变化
        const remoteCoreContent = this.extractCoreContent(cleanDescription);
        const localCoreContent = this.extractCoreContent(localEvent.description || '');
        let descriptionChanged = remoteCoreContent !== localCoreContent;  // 🔧 改为 let，因为后续可能重置
        
        // 🔧 无变化则跳过
        if (!titleChanged && !timeChanged && !descriptionChanged) {
          if (skippedCount < 5) {
            console.log(`⏭️ [Sync] 跳过无变化: ${localEvent.id.slice(-8)}`);
          }
          action.synchronized = true;
          action.synchronizedAt = new Date();
          skippedCount++;
          continue;
        }
        
        // 🔧 打印前3个变化详情
        if (successCount < 3) {
          console.log(`🔄 [Sync] 变化 ${localEvent.id.slice(-8)}:`, {
            title: titleChanged ? `"${localTitle}" → "${remoteTitle}"` : '-',
            time: timeChanged ? `${localEvent.startTime || '?'} → ${remoteStart}` : '-',
            desc: descriptionChanged ? `${localEvent.description?.length || 0} → ${cleanDescription?.length || 0} chars` : '-'
          });
        }
        
        // 🔧 构建增量更新（只更新 Outlook 返回的字段，保留本地专属字段）
        const updates: any = {
          lastSyncTime: formatTimeForStorage(new Date()),
          syncStatus: 'synced'
        };
        
        // ✅ 增量更新原则：只更新变化的字段
        if (descriptionChanged) {
          // 🔥 [CRITICAL FIX] 先解析成 Block-Level，再比较 diff，避免无脑更新
          const { EventService: ES } = await import('./EventService');
          
          // 🆕 获取 Outlook 时间戳
          const remoteCreatedAt = action.data.createdDateTime 
            ? new Date(action.data.createdDateTime).getTime() 
            : undefined;
          const remoteUpdatedAt = action.data.lastModifiedDateTime 
            ? new Date(action.data.lastModifiedDateTime).getTime() 
            : undefined;
          
          // 🔍 调试：打印 Outlook 时间戳
          if (successCount < 3) {
            console.log('[Sync] Outlook 时间戳:', {
              createdDateTime: action.data.createdDateTime,
              lastModifiedDateTime: action.data.lastModifiedDateTime,
              remoteCreatedAt: remoteCreatedAt ? new Date(remoteCreatedAt).toLocaleString() : 'undefined',
              remoteUpdatedAt: remoteUpdatedAt ? new Date(remoteUpdatedAt).toLocaleString() : 'undefined'
            });
          }
          
          // ✅ 直接传递 remoteCoreContent 作为 eventlogInput（而非 fallback）
          // 🆕 使用本地 updatedAt 进行 Diff（避免 Outlook 时间戳变化导致签名变化）
          const localUpdatedAt = localEvent.updatedAt 
            ? new Date(localEvent.updatedAt).getTime() 
            : remoteUpdatedAt;
          
          const remoteEventlog = ES.normalizeEventLog(
            remoteCoreContent,  // ✅ 直接传递 HTML/纯文本
            undefined,          // 不需要 fallback
            remoteCreatedAt,    // Event.createdAt
            localUpdatedAt,     // 🆕 使用本地时间（而非 Outlook 时间）
            localEvent.eventlog // 旧 eventlog（用于 Diff）
          );
          
          // 比较新旧 eventlog 的 slateJson
          const oldSlateJson = typeof localEvent.eventlog?.slateJson === 'string' 
            ? localEvent.eventlog.slateJson 
            : JSON.stringify(localEvent.eventlog?.slateJson || []);
          const newSlateJson = typeof remoteEventlog.slateJson === 'string'
            ? remoteEventlog.slateJson
            : JSON.stringify(remoteEventlog.slateJson || []);
          
          // 只有 eventlog 真的变化了才更新
          if (oldSlateJson !== newSlateJson) {
            updates.eventlog = remoteEventlog;
            
            // 🆕 同时更新 Event 的时间戳（使用 Outlook 的时间）
            if (remoteCreatedAt) {
              updates.createdAt = this.safeFormatDateTime(new Date(remoteCreatedAt));
            }
            if (remoteUpdatedAt) {
              updates.updatedAt = this.safeFormatDateTime(new Date(remoteUpdatedAt));
            }
            
            if (successCount < 3) {
              console.log('✅ [Sync] EventLog 真实变化，将更新（含时间戳）');
            }
          } else {
            if (successCount < 3) {
              console.log('⏭️ [Sync] Description 变化但 EventLog 相同（仅签名差异），跳过 eventlog 更新');
            }
            descriptionChanged = false;  // 重置标志，避免后续无意义更新
          }
        }
        
        if (timeChanged) {
          updates.startTime = remoteStart;
          updates.endTime = remoteEnd;
        }
        
        // ✅ location 和 isAllDay 也只在变化时更新
        const remoteLocation = action.data.location?.displayName || '';
        if (remoteLocation !== localEvent.location) {
          updates.location = remoteLocation;
        }
        
        const remoteIsAllDay = action.data.isAllDay || false;
        if (remoteIsAllDay !== localEvent.isAllDay) {
          updates.isAllDay = remoteIsAllDay;
        }
        
        // ✅ 修复: bidirectional 模式下不覆盖本地富文本标题
        // 只有 receive-only 模式才从远程同步标题
        if (syncMode === 'receive-only' && titleChanged) {
          updates.title = {
            simpleTitle: remoteTitle,
            colorTitle: remoteTitle,
            fullTitle: JSON.stringify([{ type: 'paragraph', children: [{ text: remoteTitle }] }])
          };
        }
        
        // ✅ 明确保护本地专属字段（不被覆盖）
        // tags, remarkableSource, childEventIds, parentEventId, linkedEventIds, backlinks
        // 这些字段会被 EventService 自动保留，不需要显式传递
        
        // ✅ 通过 EventService 更新（自动触发 eventsUpdated）
        // 🔧 v2.17.2: 传递 source: 'external-sync' 触发本地字段保护
        const updatedEvent = await EventService.updateEvent(localEvent.id, updates, true, { source: 'external-sync' });
        
        // 🔧 [CRITICAL FIX] 更新 IndexMap，避免下次同步再次检测到变化
        if (updatedEvent) {
          this.updateEventInIndex(updatedEvent, localEvent);
        }
        
        action.synchronized = true;
        action.synchronizedAt = new Date();
        successCount++;
        
      } catch (error) {
        console.error(`❌ [SyncRemote] Update failed:`, error);
        action.retryCount = (action.retryCount || 0) + 1;
        failCount++;
      }
    }
    
    // ========== 处理 CREATE/DELETE 操作（保留旧逻辑） ==========
    if (otherActions.length > 0) {
      console.log(`⚠️ [SyncRemote] ${otherActions.length} create/delete actions use legacy logic`);
      let localEvents = await this.getLocalEvents();
      const uiUpdates: Array<{ type: string; eventId: string; event?: any }> = [];
      
      for (const action of otherActions) {
        // ✅ 跳过已同步的 action（防止重复处理）
        if (action.synchronized) {
          console.log(`⏭️ [SyncRemote] Skipping already synchronized action:`, action.id);
          skippedCount++;
          continue;
        }
        
        try {
          const beforeCount = localEvents.length;
          const result = await this.applyRemoteActionToLocal(action, false, localEvents);
          
          if (result === null) {
            action.synchronized = true;
            action.synchronizedAt = new Date();
            skippedCount++;
            continue;
          }
          
          localEvents = result;
          const afterCount = localEvents.length;
          
          if (action.type === 'create' && afterCount > beforeCount) {
            uiUpdates.push({ type: 'create', eventId: action.entityId, event: localEvents[afterCount - 1] });
          } else if (action.type === 'delete') {
            uiUpdates.push({ type: 'delete', eventId: action.entityId });
          }
          
          action.synchronized = true;
          action.synchronizedAt = new Date();
          successCount++;
          
        } catch (error) {
          console.error(`❌ [SyncRemote] ${action.type} failed:`, error);
          action.retryCount = (action.retryCount || 0) + 1;
          failCount++;
        }
      }
      
      // 保存并触发 UI 更新
      if (uiUpdates.length > 0) {
        // ❌ saveLocalEvents() is deprecated - events are saved via EventService
        uiUpdates.forEach(update => {
          const detail: any = { eventId: update.eventId };
          if (update.type === 'create') {
            detail.isNewEvent = true;
            detail.tags = update.event?.tags || [];
          } else if (update.type === 'delete') {
            detail.deleted = true;
          }
          window.dispatchEvent(new CustomEvent('eventsUpdated', { detail }));
        });
      }
    }
    
    // 📊 打印统计
    console.log(`✅ [SyncRemote] Completed: ${successCount} updated, ${skippedCount} skipped (no changes), ${failCount} failed`);
    
    // 🔧 [CRITICAL FIX] 清理已同步的 actions，避免队列无限增长（8997 个！）
    this.cleanupSynchronizedActions();
  }

  private async syncSingleAction(action: SyncAction, localEvents?: any[]) {
    // 🔧 [NEW] 跳过 syncStatus 为 'local-only' 的事件（例如：运行中的 Timer）
    if (action.data && action.data.syncStatus === 'local-only') {
      // console.log('⏭️ [SYNC SINGLE ACTION] Skipping local-only event (Timer in progress):', action.entityId);
      action.synchronized = true; // 标记为已处理，防止重试
      this.saveActionQueue();
      return;
    }
    
    // 🔧 [MODIFIED] 移除重试次数限制，只检查是否已同步
    if (action.synchronized) {
      return;
    }

    // 🔧 [NEW] 记录尝试时间
    action.lastAttemptTime = new Date();

    try {
      if (action.source === 'local') {
        const result = await this.applyLocalActionToRemote(action, localEvents);
      } else {
        await this.applyRemoteActionToLocal(action);
      }

      action.synchronized = true;
      action.synchronizedAt = new Date();
      action.lastError = undefined; // 🔧 [NEW] 清除错误信息
      action.userNotified = false; // 🔧 [NEW] 重置通知状态
      
      // 📊 更新统计信息
      if (action.source === 'local') {
        if (action.type === 'create') {
          this.syncStats.calendarCreated++;
        } else if (action.type === 'update' || action.type === 'delete') {
          this.syncStats.syncSuccess++;
        }
      } else {
      // console.log('📊 [Stats] Skipping - not a local action (source:', action.source + ')');
      }
      
      this.saveActionQueue();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // 🔧 [FIX] 429/503 错误特殊处理 - 不增加重试计数，稍后自动重试
      const is429Error = errorMessage.includes('429');
      const is503Error = errorMessage.includes('503') || errorMessage.includes('Service Unavailable');
      
      if (is429Error || is503Error) {
        const errorType = is429Error ? '429 Rate Limit' : '503 Service Unavailable';
        console.warn(`⚠️ [SYNC] ${errorType} detected, will retry later without penalty:`, {
          actionId: action.id,
          type: action.type,
          retryCount: action.retryCount || 0
        });
        // 不增加 retryCount，不标记为失败，下次同步自动重试
        action.lastError = `${errorType} - will retry`;
        action.retryCount = (action.retryCount || 0) + 1; // 仅用于指数退避计算
        this.saveActionQueue();
        throw error; // 抛出错误，让外层捕获并延迟
      }
      
      console.error('❌ [SYNC SINGLE ACTION] Failed to sync action:', {
        actionId: action.id,
        type: action.type,
        error: error,
        errorMessage
      });
      
      // 🔧 [NEW] 记录错误信息
      action.lastError = errorMessage;
      action.retryCount = (action.retryCount || 0) + 1;
      
      // 📊 更新失败统计（仅针对本地到远程的同步）
      if (action.source === 'local') {
        this.syncStats.syncFailed++;
      }
      
      // 🔧 [NEW] 每失败3次通知用户一次（3, 6, 9...）
      const shouldNotify = action.retryCount % 3 === 0 && !action.userNotified;
      
      if (shouldNotify) {
        this.showSyncFailureNotification(action, errorMessage);
        action.userNotified = true; // 标记已通知，避免重复通知
      }
      
      this.saveActionQueue();
    }
  }

  private async applyLocalActionToRemote(action: SyncAction, localEvents?: any[]): Promise<boolean> {
    let syncTargetCalendarId: string | undefined; // 🔧 重命名变量避免潜在冲突
    
    try {
      // 🔧 检查是否为 503/429 服务不可用错误，延迟重试
      if (action.retryCount && action.retryCount > 0 && action.lastError) {
        const needsBackoff = action.lastError.includes('503') || 
                            action.lastError.includes('Service Unavailable') ||
                            action.lastError.includes('429') ||
                            action.lastError.includes('Rate Limit');
        
        if (needsBackoff) {
          // 指数退避：2^retryCount 秒，最多 32 秒
          const backoffSeconds = Math.min(Math.pow(2, action.retryCount), 32);
          console.log(`⏳ [Backoff] ${action.lastError} - Waiting ${backoffSeconds}s before retry (attempt ${action.retryCount})`);
          await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
        }
      }
      
      if (action.source !== 'local') {
        return false;
      }
      
      if (!this.microsoftService) {
        return false;
      }
      
      if (!this.microsoftService.isSignedIn()) {
        return false;
      }

      switch (action.type) {
        case 'create':
          // 检查事件是否已经同步过（有externalId）或者是从远端同步回来的
          if (action.data.externalId || action.data.fourDNoteSource === false) {
            return true; // 标记为成功，避免重试
          }
          
          // 🎯 使用 syncRouter 统一判断同步目标
          const createSyncRoute = determineSyncTarget(action.data);
          
          // 不需要同步
          if (createSyncRoute.target === 'none') {
            console.log(`⏭️ [Sync] Skipping: ${createSyncRoute.reason}`);
            return true;
          }
          
          // 同步到 Microsoft To Do
          if (createSyncRoute.target === 'todo') {
            try {
              const todoListId = (action.data.calendarIds && action.data.calendarIds.length > 0)
                ? action.data.calendarIds[0]
                : 'tasks';
              
              const taskData = {
                title: action.data.title?.simpleTitle || 'Untitled Task',
                body: action.data.description || '',
                dueDateTime: action.data.endTime || action.data.startTime
              };
              
              const createdTask = await this.microsoftService.syncTaskToTodoList(todoListId, taskData);
              
              if (createdTask && createdTask.id) {
                await EventService.updateEvent(action.entityId, {
                  externalId: `todo-${createdTask.id}`,
                  syncStatus: 'synced'
                }, true);
              }
              
              return true;
            } catch (error) {
              console.error('❌ [To Do] Failed to sync task:', error);
              throw error;
            }
          }
          
          // 同步到 Outlook Calendar (createSyncRoute.target === 'calendar')

          // ✅ [v2.18.1 架构优化] 单一数据源 - 直接使用 description
          // 数据流：Event.description（含签名）→ processEventDescription（处理签名）→ Outlook
          // 说明：description 字段已由 EventService.normalizeEvent 生成（包含签名）
          //       processEventDescription 会智能处理：
          //         - 移除旧签名
          //         - 添加 4DNote 创建/编辑签名
          const descriptionSource = action.data.description || '';
          
          const createDescription = this.processEventDescription(
            descriptionSource,
            '4dnote',
            'create',
            action.data
          );

          // 构建事件对象
          let startDateTime = action.data.startTime;
          let endDateTime = action.data.endTime;
          
          // 🆕 [v2.19] Note 事件虚拟时间处理：如果签名包含"📝 笔记由"，临时添加 endTime
          const isNoteWithVirtualTime = createDescription.includes('📝 笔记由');
          if (isNoteWithVirtualTime && startDateTime && !endDateTime) {
            const startDate = new Date(startDateTime);
            endDateTime = formatTimeForStorage(new Date(startDate.getTime() + 60 * 60 * 1000)); // +1小时
            console.log('[Sync] 📝 Note事件添加虚拟endTime:', {
              startTime: startDateTime,
              virtualEndTime: endDateTime
            });
          }
          
          // 🔧 [FIX] 全天事件必须强制设置为午夜 00:00:00（Outlook 要求）
          if (action.data.isAllDay) {
            if (!startDateTime || !endDateTime) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              startDateTime = formatTimeForStorage(today);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              endDateTime = formatTimeForStorage(tomorrow);
            } else {
              // 规范化为午夜（保留日期）
              const startDate = new Date(startDateTime);
              startDate.setHours(0, 0, 0, 0);
              startDateTime = formatTimeForStorage(startDate);
              
              const endDate = new Date(endDateTime);
              endDate.setHours(0, 0, 0, 0);
              endDate.setDate(endDate.getDate() + 1);
              endDateTime = formatTimeForStorage(endDate);
            }
          }
          
          // 🆕 使用虚拟标题生成（支持 Note 事件）
          const virtualTitle = EventService.getVirtualTitle(action.data, 50);
          
          const eventData = {
            subject: virtualTitle,
            body: { 
              contentType: 'Text', 
              content: createDescription
            },
            start: {
              dateTime: this.safeFormatDateTime(startDateTime),
              timeZone: 'Asia/Shanghai'
            },
            end: {
              dateTime: this.safeFormatDateTime(endDateTime),
              timeZone: 'Asia/Shanghai'
            },
            location: (() => {
              if (!action.data.location) return undefined;
              
              // 🔧 递归提取 displayName 字符串，处理深度嵌套
              let locationString: string;
              if (typeof action.data.location === 'string') {
                locationString = action.data.location;
              } else {
                let current: any = action.data.location;
                while (current && typeof current === 'object' && 'displayName' in current) {
                  current = current.displayName;
                }
                locationString = typeof current === 'string' ? current : '';
              }
              return locationString ? { displayName: locationString } : undefined;
            })(),
            isAllDay: action.data.isAllDay || false
          };
          
          // 🔍 [FIXED] 获取目标日历ID - 数组格式处理
          
          // 🔧 优先从 tags 数组中获取第一个标签的日历映射
          if (action.data.tags && Array.isArray(action.data.tags) && action.data.tags.length > 0) {
            const mappedCalendarId = this.getCalendarIdForTag(action.data.tags[0]);
            if (mappedCalendarId) {
              syncTargetCalendarId = mappedCalendarId;
              // console.log('🔍 [SYNC] Using calendar from tag mapping:', {
              //   tagId: action.data.tags[0],
              //   mappedCalendarId,
              //   eventTitle: action.data.title
              // });
            }
          }
          
          // 🔧 如果没有标签映射，从 calendarIds 数组中获取第一个日历ID
          if (!syncTargetCalendarId && action.data.calendarIds && Array.isArray(action.data.calendarIds) && action.data.calendarIds.length > 0) {
            syncTargetCalendarId = action.data.calendarIds[0];
            console.log('🔍 [SYNC] Using direct calendar ID from array:', {
              calendarIds: action.data.calendarIds,
              selectedCalendarId: syncTargetCalendarId,
              eventId: action.entityId,
              eventTitle: action.data.title?.simpleTitle
            });
          }
          
          // console.log('🔍 [SYNC] Calendar ID resolution:', {
          //   eventId: action.entityId,
          //   eventTitle: action.data.title,
          //   calendarIds: action.data.calendarIds,
          //   tags: action.data.tags,
          //   finalCalendarId: syncTargetCalendarId
          // });
          
          // 🚨 只有在真的没有任何日历信息时才使用默认日历（全新创建的事件）
          if (!syncTargetCalendarId) {
            const defaultCalendarId = this.microsoftService.getSelectedCalendarId();
            console.warn('⚠️ [SYNC] No calendar ID at all (new event), using default calendar:', {
              eventId: action.entityId,
              eventTitle: action.data.title?.simpleTitle,
              'event.calendarIds': action.data.calendarIds,
              'defaultCalendarId': defaultCalendarId,
              'event.tags': action.data.tags
            });
            syncTargetCalendarId = defaultCalendarId;
          }
          
          // 🔧 [NEW] 验证目标日历是否存在，不存在则降级到默认日历
          const isCalendarValid = await this.microsoftService.validateCalendarExists(syncTargetCalendarId);
          
          if (!isCalendarValid) {
            let fallbackCalendarId = this.microsoftService.getSelectedCalendarId();
            
            // 🔧 如果选定日历也无效或为null，获取实际默认日历
            if (!fallbackCalendarId) {
              try {
                const defaultCalendar = await this.microsoftService.getDefaultCalendar();
                fallbackCalendarId = defaultCalendar.id;
                // 保存为默认选择
                this.microsoftService.setSelectedCalendar(fallbackCalendarId);
                console.log('📅 [CALENDAR FALLBACK] Auto-set default calendar:', fallbackCalendarId);
              } catch (error) {
                console.error('❌ [CALENDAR FALLBACK] Failed to get default calendar:', error);
                throw new Error('无法获取默认日历，请检查网络连接或重新登录');
              }
            }
            
            console.warn('⚠️ [CALENDAR VALIDATION] Target calendar not found, falling back to default:', {
              invalidCalendarId: syncTargetCalendarId,
              fallbackCalendarId: fallbackCalendarId,
              eventTitle: action.data.title,
              eventId: action.entityId
            });
            
            // 发送通知给用户（确保参数都是 string 类型）
            this.showCalendarFallbackNotification(
              action.data.title?.simpleTitle || '未命名事件', 
              syncTargetCalendarId || 'unknown', 
              fallbackCalendarId
            );
            
            // 使用默认日历
            syncTargetCalendarId = fallbackCalendarId;
          }
          
          // 🔧 最后检查：确保有有效的日历ID
          if (!syncTargetCalendarId) {
            throw new Error('无法确定目标日历ID，事件同步失败');
          }
          
          const newEventId = await this.microsoftService.syncEventToCalendar(eventData, syncTargetCalendarId);
          
          if (newEventId) {
            // 🔧 确保 externalId 有正确的前缀格式
            const formattedExternalId = newEventId.startsWith('outlook-') 
              ? newEventId 
              : `outlook-${newEventId}`;
            await this.updateLocalEventExternalId(action.entityId, formattedExternalId, createDescription);
            return true;
          }
          break;

        case 'update':
          // 🔧 检查 syncMode 是否允许推送到远端
          if (action.data.syncMode === 'receive-only') {
            console.log(`⏭️ [Sync] SyncMode=receive-only, skipping push to remote:`, {
              eventId: action.entityId,
              title: action.data.title?.simpleTitle || '(无标题)',
              syncMode: action.data.syncMode
            });
            return true; // 标记为成功，避免重试
          }
          
          // 🚨 [REBUILT] 重构的 UPDATE 逻辑 - 按用户要求的5级优先级结构
          // 📊 [PRIORITY 0] 最高优先级：用户数据保护 - 保存操作到本地永久存储
          try {
            // 1. 获取当前本地事件数据 - 使用传入的 localEvents 或查询
            const priorityLocalEvents = localEvents || await this.getLocalEvents();
            const eventIndex = priorityLocalEvents.findIndex((e: any) => e.id === action.entityId);
            
            if (eventIndex !== -1) {
              // 2. 创建备份并更新本地数据
              const backupEvent = {
                ...priorityLocalEvents[eventIndex],
                lastBackupAt: new Date(),
                backupReason: 'update-operation'
              };
              
              // 3. 确保用户修改立即保存到本地
              const oldEvent = { ...priorityLocalEvents[eventIndex] };
              const updatedEvent = {
                ...priorityLocalEvents[eventIndex],
                ...action.data,
                updatedAt: formatTimeForStorage(new Date()),
                lastLocalEdit: formatTimeForStorage(new Date()),
                syncStatus: 'pending' // 🔧 [Unified] 统一使用 'pending'，不再区分 update
              };
              
              priorityLocalEvents[eventIndex] = updatedEvent;
              
              // 🔧 [IndexMap 优化] 使用增量更新而非完全重建
              this.updateEventInIndex(updatedEvent, oldEvent);
              // ❌ saveLocalEvents() is deprecated - events are saved via EventService
            }
          } catch (storageError) {
            console.error('❌ [PRIORITY 0] Failed to save user data locally:', storageError);
            // 即使本地保存失败，也要继续同步，但添加冲突标记
            const currentTitle = action.data.title?.simpleTitle || '';
            if (!currentTitle.includes('⚠️同步冲突')) {
              // ✅ 保持 EventTitle 结构完整性，只更新 simpleTitle
              action.data.title = {
                ...action.data.title,
                simpleTitle: '⚠️同步冲突 - ' + currentTitle
              };
            }
          }

          // 🔍 [PRIORITY 1] 最高优先级：检查事件基础状态
          // 1️⃣ 编辑锁定检查 - 对于UPDATE操作，清除之前的锁定以允许远程同步
          const lockStatus = this.editLocks.get(action.entityId);
          const currentTime = Date.now();
          
          if (this.isEditLocked(action.entityId)) {
            this.clearEditLock(action.entityId);
          } else {
          }
          
          // 为当前更新操作设置编辑锁定
          this.setEditLock(action.entityId, 15000); // 15秒锁定期
          // 2️⃣ ExternalId 检查 - 决定是 UPDATE 还是 CREATE
          // 🔧 关键修复：从本地存储的事件中获取externalId，因为前端data通常不包含externalId - 使用传入的 localEvents
          const updateLocalEvents = localEvents || await this.getLocalEvents();
          const currentLocalEvent = updateLocalEvents.find((e: any) => e.id === action.entityId);
          
          let cleanExternalId = action.data.externalId || 
                               action.originalData?.externalId || 
                               currentLocalEvent?.externalId; // 🔧 从本地事件获取externalId
          
          if (cleanExternalId && cleanExternalId.startsWith('outlook-')) {
            cleanExternalId = cleanExternalId.replace('outlook-', '');
          }
          // 🔄 如果没有 externalId，转为 CREATE 操作（首次同步）
          if (!cleanExternalId) {
      // console.log('🔄 [PRIORITY 1] No externalId found - Converting UPDATE → CREATE (first-time sync)');
            
            // 执行 CREATE 逻辑（复用现有的 create 分支逻辑）
            
            // 🔍 [NEW] 检查是否有旧的 externalId 需要清理（可能在其他日历中存在）
            // 这种情况可能发生在标签映射更改导致事件需要迁移到新日历时
            if (action.originalData?.externalId) {
              let oldExternalId = action.originalData.externalId;
              if (oldExternalId.startsWith('outlook-')) {
                oldExternalId = oldExternalId.replace('outlook-', '');
              }
              try {
                await this.microsoftService.deleteEvent(oldExternalId);
              } catch (error) {
                console.warn('⚠️ [SYNC UPDATE → CREATE] Failed to delete old event (may not exist):', error);
                // 继续执行，不影响新事件的创建
              }
            }
            
            // 🔍 [FIXED] 获取目标日历ID - 数组格式处理（UPDATE → CREATE转换）
            
            // 🔧 优先从 tags 数组中获取第一个标签的日历映射
            if (action.data.tags && Array.isArray(action.data.tags) && action.data.tags.length > 0) {
              const mappedCalendarId = this.getCalendarIdForTag(action.data.tags[0]);
              if (mappedCalendarId) {
                syncTargetCalendarId = mappedCalendarId;
                // console.log('🔍 [SYNC-UPDATE] Using calendar from tag mapping:', {
                //   tagId: action.data.tags[0],
                //   mappedCalendarId,
                //   eventTitle: action.data.title
                // });
              }
            }
            
            // 🔧 如果没有标签映射，从 calendarIds 数组中获取第一个日历ID
            if (!syncTargetCalendarId && action.data.calendarIds && Array.isArray(action.data.calendarIds) && action.data.calendarIds.length > 0) {
              syncTargetCalendarId = action.data.calendarIds[0];
              console.log('🔍 [SYNC-UPDATE] Using direct calendar ID from array:', {
                calendarIds: action.data.calendarIds,
                selectedCalendarId: syncTargetCalendarId,
                eventId: action.entityId,
                eventTitle: action.data.title?.simpleTitle
              });
            }
            
            // 🚨 只有在真的没有任何日历信息时才使用默认日历
            if (!syncTargetCalendarId) {
              const defaultCalendarId = this.microsoftService.getSelectedCalendarId();
              console.warn('⚠️ [SYNC-UPDATE] No calendar ID, using default calendar:', {
                eventId: action.entityId,
                eventTitle: action.data.title?.simpleTitle,
                'event.calendarIds': action.data.calendarIds,
                'defaultCalendarId': defaultCalendarId,
                'event.tags': action.data.tags
              });
              syncTargetCalendarId = defaultCalendarId;
            }
            // 🔍 [NEW] 构建事件描述，保持原有的创建时间记录
            const originalCreateTime = this.extractOriginalCreateTime(action.data.description || '');
            const createDescription = this.processEventDescription(
              action.data.description || '',
              '4dnote',
              'create',
              {
                ...action.data,
                // 如果有原始创建时间，保持它；否则使用当前时间
                preserveOriginalCreateTime: originalCreateTime
              }
            );
            
            // 构建事件对象
            let updateToCreateStartTime = action.data.startTime;
            let updateToCreateEndTime = action.data.endTime;
            
            // 🆕 [v2.19] Note 事件虚拟时间处理
            const isNoteWithVirtualTime_updateToCreate = createDescription.includes('📝 笔记由');
            if (isNoteWithVirtualTime_updateToCreate && updateToCreateStartTime && !updateToCreateEndTime) {
              const startDate = new Date(updateToCreateStartTime);
              updateToCreateEndTime = formatTimeForStorage(new Date(startDate.getTime() + 60 * 60 * 1000)); // +1小时
              console.log('[Sync] 📝 Note事件添加虚拟endTime (update→create):', {
                startTime: updateToCreateStartTime,
                virtualEndTime: updateToCreateEndTime
              });
            }
            
            // 🔧 [FIX] 全天事件必须强制设置为午夜 00:00:00（Outlook 要求）
            if (action.data.isAllDay) {
              if (!updateToCreateStartTime || !updateToCreateEndTime) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                updateToCreateStartTime = formatTimeForStorage(today);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                updateToCreateEndTime = formatTimeForStorage(tomorrow);
              } else {
                // 规范化为午夜（保留日期）
                const startDate = new Date(updateToCreateStartTime);
                startDate.setHours(0, 0, 0, 0);
                updateToCreateStartTime = formatTimeForStorage(startDate);
                
                const endDate = new Date(updateToCreateEndTime);
                endDate.setHours(0, 0, 0, 0);
                endDate.setDate(endDate.getDate() + 1);
                updateToCreateEndTime = formatTimeForStorage(endDate);
              }
            }
            
            // 🆕 使用虚拟标题生成（支持 Note 事件）
            const virtualTitle = EventService.getVirtualTitle(action.data, 50);
            
            const eventData = {
              subject: virtualTitle,
              body: { 
                contentType: 'text', 
                content: createDescription
              },
              start: {
                dateTime: this.safeFormatDateTime(updateToCreateStartTime),
                timeZone: 'Asia/Shanghai'
              },
              end: {
                dateTime: this.safeFormatDateTime(updateToCreateEndTime),
                timeZone: 'Asia/Shanghai'
              },
              location: action.data.location ? { 
                displayName: typeof action.data.location === 'string' 
                  ? action.data.location 
                  : action.data.location.displayName 
              } : undefined,
              isAllDay: action.data.isAllDay || false
            };
            
            // 🔧 确保有有效的日历ID
            if (!syncTargetCalendarId) {
              throw new Error('无法确定目标日历ID，事件同步失败');
            }
            
            const newEventId = await this.microsoftService.syncEventToCalendar(eventData, syncTargetCalendarId);
            
            if (newEventId) {
              await this.updateLocalEventExternalId(action.entityId, newEventId, createDescription);
              if (syncTargetCalendarId) {
                await this.updateLocalEventCalendarId(action.entityId, syncTargetCalendarId);
              }
              this.clearEditLock(action.entityId);
              // 📝 状态栏反馈
              window.dispatchEvent(new CustomEvent('sync-status-update', {
                detail: { message: `✅ 已创建1个事件到Outlook: ${syncTargetCalendarId}` }
              }));
              return true;
            } else {
              this.clearEditLock(action.entityId);
              console.error('❌ [PRIORITY 1] UPDATE → CREATE failed');
              return false;
            }
          }
          
          // 🏷️ [PRIORITY 2] 高优先级：标签日历映射检查（智能迁移）
          const currentCalendarId = action.data.calendarId;
          let needsCalendarMigration = false;
          syncTargetCalendarId = currentCalendarId;
          
          // 🎯 确定要检查的标签ID（优先使用 tags 数组的第一个标签）
          let tagToCheck = action.data.tagId;
          if (action.data.tags && action.data.tags.length > 0) {
            tagToCheck = action.data.tags[0];
          }
          
          // 🔍 获取原始事件的标签（用于比较）
          let originalTagToCheck = action.originalData?.tagId;
          if (action.originalData?.tags && action.originalData.tags.length > 0) {
            originalTagToCheck = action.originalData.tags[0];
          }
          
          if (tagToCheck) {
            const mappedCalendarId = this.getCalendarIdForTag(tagToCheck);
            
            // 🎯 获取原始标签映射的日历（如果标签没变，就不需要迁移）
            let originalMappedCalendarId = currentCalendarId;
            if (originalTagToCheck) {
              originalMappedCalendarId = this.getCalendarIdForTag(originalTagToCheck) || currentCalendarId;
            }
            
            // ✅ 智能迁移检测：只有当新旧映射的日历真的不同时才迁移
            if (mappedCalendarId && mappedCalendarId !== originalMappedCalendarId) {
              needsCalendarMigration = true;
              syncTargetCalendarId = mappedCalendarId;
              
              try {
                // 删除原日历中的事件
                await this.microsoftService.deleteEvent(cleanExternalId);
              } catch (deleteError) {
                console.error('❌ [PRIORITY 2] Calendar migration failed:', deleteError);
                // 迁移失败，继续执行普通更新
                needsCalendarMigration = false;
              }
              
              try {
                // 在新日历中创建事件（相当于迁移）
                // ✅ [v2.18.1] 使用 description 字段（已包含签名，由 normalizeEvent 生成）
                const descriptionSource = action.data.description || '';
                
                const migrateDescription = this.processEventDescription(
                  descriptionSource,
                  '4dnote',
                  'update',
                  action.data
                );
                
                // 🆕 [v2.19] Note 事件虚拟时间处理
                let migrateStartTime = action.data.startTime;
                let migrateEndTime = action.data.endTime;
                const isNoteWithVirtualTime_migrate = migrateDescription.includes('📝 笔记由');
                if (isNoteWithVirtualTime_migrate && migrateStartTime && !migrateEndTime) {
                  const startDate = new Date(migrateStartTime);
                  migrateEndTime = formatTimeForStorage(new Date(startDate.getTime() + 60 * 60 * 1000)); // +1小时
                  console.log('[Sync] 📝 Note事件添加虚拟endTime (migrate):', {
                    startTime: migrateStartTime,
                    virtualEndTime: migrateEndTime
                  });
                }
                
                // 🆕 使用虚拟标题生成（支持 Note 事件）
                const virtualTitle = EventService.getVirtualTitle(action.data, 50);
                
                const migrateEventData = {
                  subject: virtualTitle,
                  body: { 
                    contentType: 'text', 
                    content: migrateDescription
                  },
                  start: {
                    dateTime: this.safeFormatDateTime(migrateStartTime),
                    timeZone: 'Asia/Shanghai'
                  },
                  end: {
                    dateTime: this.safeFormatDateTime(migrateEndTime),
                    timeZone: 'Asia/Shanghai'
                  },
                  location: action.data.location ? { displayName: action.data.location } : undefined,
                  isAllDay: action.data.isAllDay || false
                };
                const newEventId = await this.microsoftService.syncEventToCalendar(migrateEventData, syncTargetCalendarId);
                
                if (newEventId) {
                  // 🔧 确保external ID有正确的前缀格式
                  const formattedExternalId = `outlook-${newEventId}`;
                  await this.updateLocalEventExternalId(action.entityId, formattedExternalId, migrateDescription);
                  await this.updateLocalEventCalendarId(action.entityId, syncTargetCalendarId);
                  this.clearEditLock(action.entityId);
                  // 📝 状态栏反馈
                  window.dispatchEvent(new CustomEvent('sync-status-update', {
                    detail: { message: `🔄 已迁移1个事件到日历: ${syncTargetCalendarId}` }
                  }));
                  return true;
                }
              } catch (migrationError) {
                console.error('❌ [PRIORITY 2] Calendar migration failed:', migrationError);
                // 迁移失败，继续执行普通更新
                needsCalendarMigration = false;
              }
            } else if (mappedCalendarId && mappedCalendarId === originalMappedCalendarId) {
              // ✅ 标签变了，但映射的日历没变，不需要迁移
              syncTargetCalendarId = mappedCalendarId;
            } else if (mappedCalendarId && !cleanExternalId) {
              // 如果事件还没有同步到 Outlook，只更新本地的 calendarId
              await this.updateLocalEventCalendarId(action.entityId, mappedCalendarId);
            }
          }
          
          // 📝 [PRIORITY 3] 中等优先级：字段更新处理
          // 3️⃣ 构建更新数据
          const updateData: any = {};
          
          // 📝 文本字段处理
          if (action.data.title) {
            // 🆕 使用虚拟标题生成（支持 Note 事件）
            const virtualTitle = EventService.getVirtualTitle(action.data, 50);
            updateData.subject = virtualTitle;
          }
          
          // 描述处理：添加同步备注管理
          if (action.data.description !== undefined) {
            // ✅ [v2.18.1] 单一数据源 - 直接使用 description（已包含签名）
            let descriptionSource = action.data.description || '';
            
            // 🔥 [v2.21.0] 使用 CompleteMeta V2 序列化 description
            // 如果事件有 eventlog.slateJson，则嵌入 Base64 Meta 到 HTML
            if (localEvent?.eventlog?.slateJson) {
              try {
                descriptionSource = EventService.serializeEventDescription({
                  ...localEvent,
                  ...action.data
                });
                console.log('[UPDATE] ✅ CompleteMeta V2 序列化成功:', {
                  eventId: action.entityId.slice(-10),
                  hasMetaDiv: descriptionSource.includes('id="4dnote-meta"')
                });
              } catch (err) {
                console.warn('[UPDATE] CompleteMeta 序列化失败，使用原始 description', err);
              }
            }
            
            const updateDescription = this.processEventDescription(
              descriptionSource,
              '4dnote',
              'update',
              action.data
            );
            updateData.body = { contentType: 'text', content: updateDescription };
          }
          
          if (action.data.location !== undefined) {
            if (action.data.location) {
              // 🔧 [FIX] 递归提取 displayName 字符串，处理深度嵌套问题
              let locationString: string;
              if (typeof action.data.location === 'string') {
                locationString = action.data.location;
              } else {
                // 处理 { displayName: "..." } 或 { displayName: { displayName: "..." } } 等嵌套情况
                let current: any = action.data.location;
                while (current && typeof current === 'object' && 'displayName' in current) {
                  current = current.displayName;
                }
                locationString = typeof current === 'string' ? current : '';
              }
              updateData.location = locationString ? { displayName: locationString } : null;
            } else {
              updateData.location = null; // 清空位置
            }
          }
          
          
          // 🎯 获取完整事件数据用于同步路由判断 - 使用传入的 localEvents
          const deleteLocalEvents = localEvents || await this.getLocalEvents();
          const localEvent = deleteLocalEvents.find((e: any) => e.id === action.entityId);
          
          // 合并 action.data 和 localEvent 得到最新状态
          const mergedEventData = {
            ...localEvent,
            ...action.data,
            // 确保 undefined 的字段使用 localEvent 的值
            startTime: action.data.startTime !== undefined ? action.data.startTime : localEvent?.startTime,
            endTime: action.data.endTime !== undefined ? action.data.endTime : localEvent?.endTime,
            isTask: action.data.isTask !== undefined ? action.data.isTask : localEvent?.isTask
          };
          
          // 🎯 使用 syncRouter 统一判断同步目标
          const updateSyncRoute = determineSyncTarget(mergedEventData);
          
          // 不需要同步
          if (updateSyncRoute.target === 'none') {
            console.log(`⏭️ [Sync] Skipping: ${updateSyncRoute.reason}`);
            return true;
          }
          
          const currentExternalId = action.data.externalId || localEvent?.externalId;
          const wasInCalendar = currentExternalId && currentExternalId.startsWith('outlook-');
          const wasInTodo = currentExternalId && currentExternalId.startsWith('todo-');
          
          // 需要迁移：从 Calendar 到 To Do
          if (updateSyncRoute.target === 'todo' && wasInCalendar) {
            console.log(`🔄 [Migration] Moving from Calendar to To Do`);
            
            try {
              // 1. 从 Calendar 删除
              const cleanExternalId = currentExternalId.replace(/^outlook-/, '');
              await this.microsoftService.deleteEvent(cleanExternalId);
              console.log(`✅ [Migration] Deleted from Calendar:`, cleanExternalId);
            } catch (error) {
              console.warn(`⚠️ [Migration] Failed to delete from Calendar:`, error);
            }
            
            // 2. 创建到 To Do
            try {
              const todoListId = (action.data.calendarIds && action.data.calendarIds.length > 0)
                ? action.data.calendarIds[0]
                : localEvent?.calendarIds?.[0] || 'tasks';
              
              const taskData = {
                title: action.data.title?.simpleTitle || localEvent?.title?.simpleTitle || 'Untitled Task',
                body: action.data.description || localEvent?.description || '',
                dueDate: mergedEventData.endTime || mergedEventData.startTime
              };
              
              const createdTask = await this.microsoftService.syncTaskToTodoList(todoListId, taskData);
              
              if (createdTask && createdTask.id) {
                await EventService.updateEvent(action.entityId, {
                  externalId: `todo-${createdTask.id}`,
                  syncStatus: 'synced'
                }, true);
              }
              
              return true;
            } catch (error) {
              console.error('❌ [To Do] Failed to create task:', error);
              throw error;
            }
          }
          
          // 更新 To Do 任务
          if (updateSyncRoute.target === 'todo' && wasInTodo) {
            console.log(`⚠️ [To Do] Task update not implemented yet, skipping...`);
            // TODO: 实现 updateTaskInTodoList 方法
            return true;
          }
          
          // 创建新的 To Do 任务（之前没有 externalId）
          if (updateSyncRoute.target === 'todo' && !currentExternalId) {
            try {
              const todoListId = (action.data.calendarIds && action.data.calendarIds.length > 0)
                ? action.data.calendarIds[0]
                : localEvent?.calendarIds?.[0] || 'tasks';
              
              const taskData = {
                title: action.data.title?.simpleTitle || localEvent?.title?.simpleTitle || 'Untitled Task',
                body: action.data.description || localEvent?.description || '',
                dueDate: mergedEventData.endTime || mergedEventData.startTime
              };
              
              const createdTask = await this.microsoftService.syncTaskToTodoList(todoListId, taskData);
              
              if (createdTask && createdTask.id) {
                await EventService.updateEvent(action.entityId, {
                  externalId: `todo-${createdTask.id}`,
                  syncStatus: 'synced'
                }, true);
              }
              
              return true;
            } catch (error) {
              console.error('❌ [To Do] Failed to create task:', error);
              throw error;
            }
          }
          
          // 需要迁移：从 To Do 到 Calendar（理论上不应该发生，但支持一下）
          if (updateSyncRoute.target === 'calendar' && wasInTodo) {
            console.log(`🔄 [Migration] Moving from To Do to Calendar`);
            // TODO: 实现从 To Do 删除的逻辑
            console.log(`⚠️ [Migration] To Do deletion not implemented, will create new calendar event`);
          }
          
          // 更新 Calendar 事件（正常流程）
          if (updateSyncRoute.target === 'calendar') {
            // 🏷️ 元数据字段处理
            const isAllDayEvent = typeof action.data.isAllDay === 'boolean' ? action.data.isAllDay : mergedEventData.isAllDay;
            if (typeof isAllDayEvent === 'boolean') {
              updateData.isAllDay = isAllDayEvent;
            }
            
            // ⏰ 时间字段处理
            if (action.data.startTime !== undefined || action.data.endTime !== undefined || isAllDayEvent) {
              let startDateTime = mergedEventData.startTime 
                ? this.safeFormatDateTime(mergedEventData.startTime)
                : null;
                
              let endDateTime = mergedEventData.endTime
                ? this.safeFormatDateTime(mergedEventData.endTime)
                : null;
              
              // 🆕 [v2.19] Note 事件虚拟时间处理：如果 description 包含"📝 笔记由"，临时添加 endTime
              const updateDescriptionContent = updateData.body?.content || action.data.description || '';
              const isNoteWithVirtualTime_update = updateDescriptionContent.includes('📝 笔记由');
              if (isNoteWithVirtualTime_update && mergedEventData.startTime && !mergedEventData.endTime) {
                const startDate = new Date(mergedEventData.startTime);
                endDateTime = this.safeFormatDateTime(formatTimeForStorage(new Date(startDate.getTime() + 60 * 60 * 1000))); // +1小时
                console.log('[Sync] 📝 Note事件添加虚拟endTime (update):', {
                  startTime: mergedEventData.startTime,
                  virtualEndTime: endDateTime
                });
              }
              
              // 🔧 [FIX] 全天事件必须强制设置为午夜 00:00:00（Outlook 要求）
              if (isAllDayEvent) {
                if (!startDateTime || !endDateTime) {
                  // 场景1：时间为空，生成默认午夜时间
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  startDateTime = this.safeFormatDateTime(formatTimeForStorage(today));
                  const tomorrow = new Date(today);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  endDateTime = this.safeFormatDateTime(formatTimeForStorage(tomorrow));
                } else {
                  // 场景2：时间存在，规范化为午夜（保留日期部分）
                  const startDate = new Date(mergedEventData.startTime!);
                  startDate.setHours(0, 0, 0, 0);
                  startDateTime = this.safeFormatDateTime(formatTimeForStorage(startDate));
                  
                  const endDate = new Date(mergedEventData.endTime!);
                  endDate.setHours(0, 0, 0, 0);
                  // 全天事件结束时间应该是次日午夜
                  endDate.setDate(endDate.getDate() + 1);
                  endDateTime = this.safeFormatDateTime(formatTimeForStorage(endDate));
                }
              }
              
              if (startDateTime && endDateTime) {
                updateData.start = { dateTime: startDateTime, timeZone: 'Asia/Shanghai' };
                updateData.end = { dateTime: endDateTime, timeZone: 'Asia/Shanghai' };
              }
            }
          }
          
          // 🎯 [PRIORITY 4] 标准优先级：执行更新操作
          
          try {
            const updateResult = await this.microsoftService.updateEvent(cleanExternalId, updateData);
            
            if (updateResult) {
              this.clearEditLock(action.entityId);
              // 📝 状态栏反馈
              window.dispatchEvent(new CustomEvent('sync-status-update', {
                detail: { message: `✅ 已更新1个事件到Outlook: ${syncTargetCalendarId || 'Default'}` }
              }));
              return true;
            }
          } catch (updateError) {
            console.error('❌ [PRIORITY 4] Update operation failed:', updateError);
            
            // 🔧 错误处理：事件不存在时转为 CREATE
            if (updateError instanceof Error && updateError.message.includes('Event not found')) {
              try {
                  // 🔍 [FIXED] 获取重建事件的日历ID - 按需求定义处理
                let createCalendarId = syncTargetCalendarId;
                
                // 🔧 优先从 tags 数组中获取标签映射的日历ID
                if (action.data.tags && Array.isArray(action.data.tags) && action.data.tags.length > 0) {
                  const mappedCalendarId = this.getCalendarIdForTag(action.data.tags[0]);
                  if (mappedCalendarId) {
                    createCalendarId = mappedCalendarId;
                    // console.log('🔍 [SYNC-RECREATE] Using calendar from tag mapping:', {
                    //   tagId: action.data.tags[0],
                    //   mappedCalendarId,
                    //   eventTitle: action.data.title
                    // });
                  }
                }
                
                // 🔧 如果没有标签映射，从 calendarIds 数组中获取日历ID
                if (!createCalendarId && action.data.calendarIds && Array.isArray(action.data.calendarIds) && action.data.calendarIds.length > 0) {
                  createCalendarId = action.data.calendarIds[0];
                  // console.log('🔍 [SYNC-RECREATE] Using direct calendar ID from array:', createCalendarId);
                }
                
                // 🚨 只有在真的没有任何日历信息时才使用默认日历
                if (!createCalendarId) {
                  createCalendarId = this.microsoftService.getSelectedCalendarId();
                }
              
                
                // ✅ [v2.18.1] 单一数据源 - 使用 description
                const descriptionSource = action.data.description || '';
                
                const recreateDescription = this.processEventDescription(
                  descriptionSource,
                  '4dnote',
                  'create',
                  action.data
                );
                
                let recreateStartTime = action.data.startTime;
                let recreateEndTime = action.data.endTime;
                
                // 🆕 [v2.19] Note 事件虚拟时间处理
                const isNoteWithVirtualTime_recreate = recreateDescription.includes('📝 笔记由');
                if (isNoteWithVirtualTime_recreate && recreateStartTime && !recreateEndTime) {
                  const startDate = new Date(recreateStartTime);
                  recreateEndTime = formatTimeForStorage(new Date(startDate.getTime() + 60 * 60 * 1000)); // +1小时
                  console.log('[Sync] 📝 Note事件添加虚拟endTime (recreate):', {
                    startTime: recreateStartTime,
                    virtualEndTime: recreateEndTime
                  });
                }
                
                // 🔧 [FIX] 全天事件必须强制设置为午夜 00:00:00（Outlook 要求）
                if (action.data.isAllDay) {
                  if (!recreateStartTime || !recreateEndTime) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    recreateStartTime = formatTimeForStorage(today);
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    recreateEndTime = formatTimeForStorage(tomorrow);
                  } else {
                    // 规范化为午夜（保留日期）
                    const startDate = new Date(recreateStartTime);
                    startDate.setHours(0, 0, 0, 0);
                    recreateStartTime = formatTimeForStorage(startDate);
                    
                    const endDate = new Date(recreateEndTime);
                    endDate.setHours(0, 0, 0, 0);
                    endDate.setDate(endDate.getDate() + 1);
                    recreateEndTime = formatTimeForStorage(endDate);
                  }
                }
                
                // 🆕 使用虚拟标题生成（支持 Note 事件）
                const virtualTitle = EventService.getVirtualTitle(action.data, 50);
                
                const recreateEventData = {
                  subject: virtualTitle,
                  body: { 
                    contentType: 'text', 
                    content: recreateDescription
                  },
                  start: {
                    dateTime: this.safeFormatDateTime(recreateStartTime),
                    timeZone: 'Asia/Shanghai'
                  },
                  end: {
                    dateTime: this.safeFormatDateTime(recreateEndTime),
                    timeZone: 'Asia/Shanghai'
                  },
                location: action.data.location ? { 
                  displayName: typeof action.data.location === 'string' 
                    ? action.data.location 
                    : action.data.location.displayName 
                } : undefined,
                isAllDay: action.data.isAllDay || false
              };
              
                // 🔧 确保有有效的日历ID
                if (!createCalendarId) {
                  throw new Error('无法确定创建目标日历ID，事件重建失败');
                }
                
                const recreatedEventId = await this.microsoftService.syncEventToCalendar(recreateEventData, createCalendarId);
                
                if (recreatedEventId) {
                  await this.updateLocalEventExternalId(action.entityId, recreatedEventId, recreateDescription);
                  if (createCalendarId) {
                    await this.updateLocalEventCalendarId(action.entityId, createCalendarId);
                  }
                  this.clearEditLock(action.entityId);
                  // 📝 状态栏反馈
                  window.dispatchEvent(new CustomEvent('sync-status-update', {
                    detail: { message: `🔄 已重新创建1个事件: ${createCalendarId || 'Default'}` }
                  }));
                  return true;
                }
              } catch (recreateError) {
                console.error('❌ [PRIORITY 4] Failed to recreate event:', recreateError);
              }
            }
            
            
            // 🔧 尝试最小更新（仅标题和描述）
      // console.log('🔧 [PRIORITY 4] Attempting minimal update (title + description only)...');
            try {
              // 🔧 使用 simpleTitle（已去掉 tag 元素，保留 emoji）
              const minimalUpdate = {
                subject: (action.data.title?.simpleTitle || this.extractTextFromColorTitle(action.data.title)) || 'Untitled Event',
                body: { 
                  contentType: 'text', 
                  content: action.data.description || '📱 由 4DNote 更新'
                }
              };
              
              const minimalResult = await this.microsoftService.updateEvent(cleanExternalId, minimalUpdate);
              
              if (minimalResult) {
                this.clearEditLock(action.entityId);
                // 📝 状态栏反馈
                window.dispatchEvent(new CustomEvent('sync-status-update', {
                  detail: { message: `⚠️ 已部分更新1个事件 (仅标题和描述)` }
                }));
                return true;
              }
            } catch (minimalError) {
              console.error('❌ [PRIORITY 4] Even minimal update failed:', minimalError);
            }
            
            // 🚨 最终错误处理：保持本地数据，标记同步冲突
            this.clearEditLock(action.entityId);
            console.error('🚨 [PRIORITY 4] All update attempts failed, marking as sync conflict');
            
            // 获取当前事件列表（如果之前未加载）
            const conflictEvents = localEvents || await this.getLocalEvents();
            
            // 更新本地事件，添加同步冲突标记
            const conflictEventIndex = conflictEvents.findIndex((e: any) => e.id === action.entityId);
            if (conflictEventIndex !== -1) {
              const currentTitle = conflictEvents[conflictEventIndex].title?.simpleTitle || '';
              if (!currentTitle.includes('⚠️同步冲突')) {
                const oldConflictEvent = { ...conflictEvents[conflictEventIndex] };
                
                conflictEvents[conflictEventIndex].title = { simpleTitle: '⚠️同步冲突 - ' + currentTitle, fullTitle: undefined, colorTitle: undefined };
                conflictEvents[conflictEventIndex].syncStatus = 'conflict';
                conflictEvents[conflictEventIndex].lastSyncError = updateError instanceof Error ? updateError.message : 'Unknown error';
                
                // 🔧 [IndexMap 优化] 更新冲突事件索引
                this.updateEventInIndex(conflictEvents[conflictEventIndex], oldConflictEvent);
                // ❌ saveLocalEvents() is deprecated - events are saved via EventService
                
                // 📝 状态栏反馈
                window.dispatchEvent(new CustomEvent('sync-status-update', {
                  detail: { message: `⚠️ 同步冲突: 已保护本地数据` }
                }));
              }
            }
            
            throw updateError;
          }

          // 📊 [PRIORITY 5] 低优先级：后续处理（已在上面的成功分支中处理）
          break;

        case 'delete':
          // 🔍 首先检查本地存储中的externalId（类似UPDATE的逻辑，使用传入的 localEvents）
          const deleteEvents = localEvents || await this.getLocalEvents();
          const deleteTargetEvent = deleteEvents.find((e: any) => e.id === action.entityId);
          
          // 🔧 [SYNC MODE CHECK] 检查是否为 receive-only 事件
          const deleteSyncMode = action.data?.syncMode || 
                                action.originalData?.syncMode || 
                                deleteTargetEvent?.syncMode;
          
          if (deleteSyncMode === 'receive-only') {
            console.log(`⏭️ [Sync] SyncMode=receive-only, skipping delete from remote`);
            // 只在本地删除，不推送到远程
            this.deletedEventIds.add(action.entityId);
            this.saveDeletedEventIds();
            
            window.dispatchEvent(new CustomEvent('sync-status-update', {
              detail: { message: `✅ 本地删除事件 (receive-only 模式)` }
            }));
            
            return true;
          }
          
          let externalIdToDelete = action.originalData?.externalId || 
                                  action.data?.externalId || 
                                  deleteTargetEvent?.externalId;
          
          // 🔧 [FIX] 无论是否有 externalId，都将本地 eventId 添加到 deletedEventIds
          // 防止同步队列中的创建动作恢复已删除的本地事件
          this.deletedEventIds.add(action.entityId);
          
          if (externalIdToDelete) {
            // 清理externalId，移除可能的前缀
            let cleanExternalId = externalIdToDelete;
            if (cleanExternalId.startsWith('outlook-')) {
              cleanExternalId = cleanExternalId.replace('outlook-', '');
            }
            try {
              await this.microsoftService.deleteEvent(cleanExternalId);
              // 🆕 添加到已删除事件ID跟踪
              this.deletedEventIds.add(cleanExternalId);
              this.deletedEventIds.add(externalIdToDelete); // 也添加原始格式
              this.saveDeletedEventIds();
              // 📝 状态栏反馈
              window.dispatchEvent(new CustomEvent('sync-status-update', {
                detail: { message: `✅ 已从Outlook删除事件: ${deleteTargetEvent?.title?.simpleTitle || 'Unknown'}` }
              }));
              
              return true;
            } catch (error) {
              console.error('❌ [DELETE] Failed to delete event from Outlook:', {
                error: error,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                externalId: cleanExternalId
              });
              
              // 📝 状态栏反馈
              window.dispatchEvent(new CustomEvent('sync-status-update', {
                detail: { message: `❌ 删除失败: ${error instanceof Error ? error.message : '未知错误'}` }
              }));
              
              // 🔧 [FIX] 即使远程删除失败，也保存 deletedEventIds（防止本地恢复）
              this.saveDeletedEventIds();
              
              return false;
            }
          } else {
            // 🔧 [FIX] 本地事件删除，也需要保存到 deletedEventIds
            this.saveDeletedEventIds();
            
            // 📝 状态栏反馈
            window.dispatchEvent(new CustomEvent('sync-status-update', {
              detail: { message: `⚠️ 仅本地删除 (事件未同步到Outlook)` }
            }));
            
            return true; // 本地删除成功，即使没有远程ID
          }
      }
      
      return false; // 默认返回值，如果没有匹配的action type
    } catch (error) {
      console.error('❌ Failed to apply local action to remote:', error);
      return false;
    }
  }

  // 🔧 改进时间格式化方法，支持 Graph API 要求的格式 - 修复时区问题
  private safeFormatDateTime(dateInput: any): string {
    try {
      if (!dateInput) {
        return formatTimeForStorage(new Date()); // 🔧 使用本地时间格式化
      }
      
      // 🔧 [CRITICAL FIX] 如果输入已经是正确格式（空格分隔），直接返回
      // 这避免了 new Date() 再次解析导致的格式变化
      if (typeof dateInput === 'string') {
        // 检查是否已经是正确的格式 'YYYY-MM-DD HH:mm:ss'
        const localFormat = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
        if (localFormat.test(dateInput)) {
          return dateInput; // ✅ 已经是正确格式，直接返回
        }
      }
      
      // ✅ [BUG FIX] 先转换为 Date 对象，再格式化
      // 问题：dateInput 可能是 string (ISO 8601) 或 Date 对象
      // formatTimeForStorage() 只接受 Date 对象
      let dateObj: Date;
      
      if (dateInput instanceof Date) {
        // 已经是 Date 对象，直接使用
        dateObj = dateInput;
      } else if (typeof dateInput === 'string') {
        // 🔍 [DEBUG v2.18.8] 记录原始输入
        console.log('[safeFormatDateTime] 📅 解析字符串:', {
          原始值: dateInput,
          类型: 'string'
        });
        
        // 字符串（ISO 8601 或其他格式），转换为 Date
        // 使用 parseLocalTimeString 而不是 new Date()，避免时区问题
        dateObj = parseLocalTimeString(dateInput);
        
        // 验证转换结果
        if (isNaN(dateObj.getTime())) {
          console.error('❌ safeFormatDateTime: Invalid date string:', dateInput);
          return formatTimeForStorage(new Date());
        }
        
        // 🔍 [DEBUG v2.18.8] 记录转换结果
        console.log('[safeFormatDateTime] ✅ 转换成功:', {
          原始值: dateInput,
          转换后: formatTimeForStorage(dateObj)
        });
      } else if (typeof dateInput === 'object' && 'dateTime' in dateInput) {
        // 🔧 处理 Outlook API 返回的对象 { dateTime: '...', timeZone: '...' }
        dateObj = parseLocalTimeString(dateInput.dateTime);
        
        if (isNaN(dateObj.getTime())) {
          console.error('❌ safeFormatDateTime: Invalid date object:', dateInput);
          return formatTimeForStorage(new Date());
        }
      } else {
        // 其他类型，尝试强制转换
        console.warn('⚠️ safeFormatDateTime: Unexpected input type:', typeof dateInput, dateInput);
        dateObj = new Date(dateInput);
        
        if (isNaN(dateObj.getTime())) {
          return formatTimeForStorage(new Date());
        }
      }
      
      // 🔧 [Time Architecture] 所有时间都必须转换为 'YYYY-MM-DD HH:mm:ss' 格式（空格分隔）
      // 原因：EventService validation 和整个系统都依赖这个格式
      return formatTimeForStorage(dateObj);
      
    } catch (error) {
      console.error('❌ safeFormatDateTime error:', error, 'Input:', dateInput);
      return formatTimeForStorage(new Date()); // 🔧 使用本地时间格式化
    }
  }

  private async applyRemoteActionToLocal(
    action: SyncAction, 
    triggerUI: boolean = true, 
    localEvents?: any[]
  ): Promise<any[] | null> {
    if (action.entityType !== 'event') return localEvents || await this.getLocalEvents();

    // 🚀 批量模式：如果传入了localEvents，说明是批量处理，不立即保存
    const isBatchMode = !!localEvents;
    let events = localEvents || await this.getLocalEvents();
    
    // 🆕 v2.0.6 SyncMode 接收逻辑检查
    if (action.type === 'create' || action.type === 'update') {
      let eventSyncMode: string | undefined;
      let localEvent: any = null;
      
      if (action.type === 'update') {
        // 查找本地事件的 syncMode
        localEvent = events.find((e: any) => 
          e.id === action.entityId || 
          e.externalId === action.entityId ||
          e.externalId === action.entityId?.replace('outlook-', '')
        );
        eventSyncMode = localEvent?.syncMode;
      } else if (action.type === 'create') {
        // 对于 create，需要检查是否是多日历同步的远程副本
        // 通过 remoteEventId 查找对应的本地事件
        const { EventService } = await import('./EventService');
        localEvent = EventService.findLocalEventByRemoteId(
          action.data.id || action.entityId,
          events,
          'plan' // 暂时检查 plan，实际应根据事件类型判断
        );
        
        if (localEvent) {
          eventSyncMode = localEvent.syncMode;
          console.log(`🔍 [Sync] Found existing local event for remote create`, {
            localEventId: localEvent.id,
            syncMode: eventSyncMode
          });
        }
      }
      
      // 检查 syncMode 是否允许接收远程更新
      if (eventSyncMode) {
        const { EventService } = await import('./EventService');
        const canReceive = EventService.canReceiveFromRemote(eventSyncMode);
        
        if (!canReceive) {
          console.log(`⏭️ [Sync] SyncMode 不允许接收远程 ${action.type}:`, {
            eventId: action.entityId,
            syncMode: eventSyncMode
          });
          return events; // 跳过远端更新
        }
      }
    }

    switch (action.type) {
      case 'create':
        const newEvent = this.convertRemoteEventToLocal(action.data);
        
        // 🔧 [FIX] 检查是否是已删除的事件，如果是则跳过创建
        const cleanNewEventId = newEvent.id.startsWith('outlook-') ? newEvent.id.replace('outlook-', '') : newEvent.id;
        const isDeletedEvent = this.deletedEventIds.has(cleanNewEventId) || 
                               this.deletedEventIds.has(newEvent.id) ||
                               (newEvent.externalId && this.deletedEventIds.has(newEvent.externalId));
        
        if (isDeletedEvent) {
          console.log(`⏭️ [Sync] 跳过创建已删除的事件: ${newEvent.title}`);
          return events; // 跳过创建
        }
        
        // 📝 [STEP 1] 优先通过 externalId 查找现有事件（从 IndexMap）
        // newEvent.externalId 是纯 Outlook ID（没有 outlook- 前缀）
        let existingEvent = this.eventIndexMap.get(newEvent.externalId);
        
        // 🔧 [CRITICAL FIX] 如果 IndexMap 没找到，再检查 events 数组（防止 IndexMap 失效）
        if (!existingEvent && newEvent.externalId) {
          existingEvent = events.find((e: any) => 
            !e.deletedAt &&  // 🛡️ 跳过已软删除的事件
            (e.externalId === newEvent.externalId || 
            e.externalId === `outlook-${newEvent.externalId}` ||
            `outlook-${e.externalId}` === newEvent.externalId)
          );
          
          if (existingEvent) {
            // ✨ 立即修复 IndexMap（同步更新，避免后续查找失败）
            this.updateEventInIndex(existingEvent);
            
            // 🔧 减少日志噪音：只记录前 3 次和每 50 次
            this.indexMapMismatchCount = (this.indexMapMismatchCount || 0) + 1;
            if (this.indexMapMismatchCount <= 3 || this.indexMapMismatchCount % 50 === 0) {
              console.warn(`⚠️ [IndexMap Mismatch #${this.indexMapMismatchCount}] Found via array search: ${newEvent.externalId.substring(0, 20)}... (fixed)`);
            }
          }
        }
        
        // 🆕 v2.0.5 [MULTI-CALENDAR SYNC] 检查多日历同步的 externalId
        // 核心：本地一个 event，远程多个日历可能有多个 externalId
        // 防止创建重复事件
        if (!existingEvent && newEvent.externalId) {
          existingEvent = events.find((e: any) => {
            if (e.deletedAt) return false;  // 🛡️ 跳过已软删除的事件
            
            // 检查 Plan 日历映射
            const inPlanCalendars = e.syncedPlanCalendars?.some((cal: any) => 
              cal.remoteEventId === newEvent.externalId ||
              cal.remoteEventId === `outlook-${newEvent.externalId}` ||
              `outlook-${cal.remoteEventId}` === newEvent.externalId
            );
            
            // 检查 Actual 日历映射
            const inActualCalendars = e.syncedActualCalendars?.some((cal: any) => 
              cal.remoteEventId === newEvent.externalId ||
              cal.remoteEventId === `outlook-${newEvent.externalId}` ||
              `outlook-${cal.remoteEventId}` === newEvent.externalId
            );
            
            return inPlanCalendars || inActualCalendars;
          });
          
          if (existingEvent) {
            console.log(`✅ [Multi-Calendar Dedupe] Found existing event via syncedCalendars: ${existingEvent.id}`);
          }
        }
        
        // 🎯 [STEP 2] 如果没找到，尝试通过 4DNote 创建签名匹配本地事件
        // 场景：本地事件刚同步到 Outlook，本地还没有 externalId，Outlook 返回时需要匹配本地事件
        if (!existingEvent && newEvent.fourDNoteSource) {
          const createTime = this.extractOriginalCreateTime(newEvent.description);
          
          if (createTime) {
            // 🔍 先尝试匹配 Timer 事件
            existingEvent = events.find((e: any) => 
              !e.deletedAt &&                 // 🛡️ 跳过已软删除的事件
              e.isTimer &&                    // ✅ 必须是 Timer 事件
              !e.externalId &&                 // ✅ 还没有同步过(没有 externalId)
              e.fourDNoteSource === true &&   // ✅ 4DNote 创建的
              Math.abs(new Date(e.createdAt).getTime() - createTime.getTime()) < 1000 // ✅ 创建时间匹配(1秒容差)
            );
            
            if (existingEvent) {
              // 🎯 [Timer Dedupe] 通过 4DNote 签名匹配到本地 Timer 事件
            }
            
            // 🆕 如果没有匹配到 Timer 事件，尝试匹配普通事件
            if (!existingEvent) {
              existingEvent = events.find((e: any) => 
                !e.deletedAt &&                 // 🛡️ 跳过已软删除的事件
                !e.isTimer &&                   // ✅ 非 Timer 事件
                !e.externalId &&                // ✅ 还没有同步过(没有 externalId)
                (e.fourDNoteSource === true || e.id.startsWith('local-')) && // ✅ 4DNote 创建的或本地创建的
                e.title?.simpleTitle === newEvent.title?.simpleTitle &&   // ✅ 标题匹配
                Math.abs(new Date(e.createdAt).getTime() - createTime.getTime()) < 5000 // ✅ 创建时间匹配(5秒容差)
              );
              
              if (existingEvent) {
                // 🎯 [Event Dedupe] 通过 4DNote 签名匹配到本地事件
              }
            }
          }
        }
        
        if (!existingEvent) {
          // 🆕 真正的新事件，使用 EventService 创建（会记录 EventHistory）
          try {
            const createdEvent = await EventService.createEventFromRemoteSync(newEvent);
            
            // EventService 已经保存到 StorageManager（IndexedDB + SQLite）并记录了 EventHistory
            // 这里只需要更新 IndexMap 和触发 UI
            this.updateEventInIndex(createdEvent);
            
            if (triggerUI) {
              this.triggerUIUpdate('create', createdEvent);
            }
          } catch (error) {
            console.error('[ActionBasedSyncManager] Failed to create remote event:', error);
            throw error; // ⚠️ 直接抛出错误，不掩盖问题
          }
        } else {
          // ✅ 找到现有事件（如 Timer 事件），更新而不是创建
          try {
            // 🔧 保留本地事件的 ID 和关键字段，只更新 Outlook 数据
            const updates = {
              ...newEvent,
              id: existingEvent.id,  // 保留本地 ID（如 timer-tag-...）
              tagId: existingEvent.tagId || newEvent.tagId,  // 保留 tagId
              eventlog: existingEvent.eventlog || newEvent.eventlog,  // 🆕 保留本地的 eventlog 字段（富文本）
              syncStatus: 'synced' as const,  // 标记为已同步
            };
            
            // 🔧 v2.17.2: 传递 source: 'external-sync' 触发本地字段保护
            const updatedEvent = await EventService.updateEvent(existingEvent.id, updates, true, { source: 'external-sync' });
            
            if (updatedEvent) {
              // 🔧 [IndexMap 优化] 更新索引
              this.updateEventInIndex(updatedEvent, existingEvent);
              
              if (triggerUI) {
                this.triggerUIUpdate('update', updatedEvent);
              }
            }
          } catch (error) {
            console.error('[ActionBasedSyncManager] Failed to update existing event:', error);
          }
        }
        break;

      case 'update':
        // Processing update action for event
        
        // 🔧 对于本地发起的远程更新回写，不检查编辑锁定
        // 只有真正的远程冲突更新才需要锁定保护
        if (action.source === 'outlook' && this.isEditLocked(action.entityId)) {
          return events; // 跳过此次更新
        }
        
        try {
          const existingEvent = await EventService.getEventById(action.entityId);
          if (!existingEvent) {
            console.warn('[ActionBasedSyncManager] Event not found for update:', action.entityId);
            break;
          }
          
          // 🔧 [软删除保护] 如果本地事件已被软删除，不要被远程同步覆盖
          if (existingEvent.deletedAt) {
            console.log('🛡️ [Sync] 跳过已软删除事件的远程更新:', {
              eventId: action.entityId.slice(-8),
              deletedAt: existingEvent.deletedAt
            });
            return isBatchMode ? null : events;
          }
          
          const oldEvent = existingEvent;
          
          // 🔧 [PERFORMANCE] 检测是否有实际变化，避免无意义的更新和 UI 触发
          const remoteTitle = action.data.subject || '';
          const localTitle = oldEvent.title?.simpleTitle || oldEvent.title || '';
          const titleChanged = remoteTitle !== localTitle;
          
          const remoteStart = this.safeFormatDateTime(action.data.start?.dateTime || action.data.start);
          const remoteEnd = this.safeFormatDateTime(action.data.end?.dateTime || action.data.end);
          const timeChanged = remoteStart !== oldEvent.startTime || remoteEnd !== oldEvent.endTime;
          
          // ✅ [v2.18.0 优化] 直接比较纯文本内容，不添加签名备注
          // 因为实际数据流已改为：Outlook HTML → eventlog.html（无损保存）
          const htmlContent = action.data.body?.content || 
                             action.data.description || 
                             action.data.bodyPreview || 
                             '';
          
          const cleanDescription = this.cleanHtmlContent(htmlContent);
          
          // 🔥 [CRITICAL FIX] 移除签名后再比较，避免签名差异导致误判
          const remoteCoreContent = this.extractCoreContent(cleanDescription);
          const localCoreContent = this.extractCoreContent(oldEvent.description || '');
          const descriptionChanged = remoteCoreContent !== localCoreContent;
          
          // 🔧 [PERFORMANCE DEBUG] 诊断：为什么 1016 个事件都检测到变化？
          if (Math.random() < 0.01) { // 只打印 1% 的样本，避免刷屏
            console.log(`🔍 [Sync Debug Sample] Event ${oldEvent.id.slice(-8)}:`, {
              remoteTitle: `"${remoteTitle}"`,
              localTitle: `"${localTitle}"`,
              titleEqual: remoteTitle === localTitle,
              remoteStart,
              remoteEnd,
              oldStart: oldEvent.startTime,
              oldEnd: oldEvent.endTime,
              timeEqual: remoteStart === oldEvent.startTime && remoteEnd === oldEvent.endTime,
              descLen: {
                remote: cleanDescription?.length || 0,
                local: oldEvent.description?.length || 0,
                equal: cleanDescription === oldEvent.description
              }
            });
          }
          
          // 🔧 [PERFORMANCE] 如果没有任何变化，跳过更新和 UI 触发
          if (!titleChanged && !timeChanged && !descriptionChanged) {
            console.log(`⏭️ [Sync] 跳过无变化的更新: ${oldEvent.id.slice(-8)}`);
            // 🔧 返回 null 表示"无变化"，通知批量同步不要触发 eventsUpdated
            return isBatchMode ? null : events;
          }
          
          // 🔧 [DEBUG] 打印变化详情（仅打印前 5 个，避免刷屏）
          if ((action as any).__debugCount === undefined) {
            (action as any).__debugCount = 0;
          }
          if ((action as any).__debugCount < 5) {
            (action as any).__debugCount++;
            console.log(`🔄 [Sync] 检测到变化 ${oldEvent.id.slice(-8)}:`, {
              titleChanged: titleChanged ? `"${localTitle}" → "${remoteTitle}"` : false,
              timeChanged: timeChanged ? `${oldEvent.startTime}-${oldEvent.endTime} → ${remoteStart}-${remoteEnd}` : false,
              descriptionChanged: descriptionChanged ? `${oldEvent.description?.length || 0} → ${cleanDescription?.length || 0} chars` : false
            });
          }
          
          // 🆕 v2.14.1: 同步 description 到 eventlog 对象
          // 🔥 [CRITICAL FIX] 先解析成 Block-Level，再比较 diff，避免无脑更新
          let updatedEventlog = oldEvent.eventlog;
          let eventlogActuallyChanged = false;
          
          if (descriptionChanged) {
            // ✅ Step 1: 将远程内容解析成 Block-Level eventlog
            const { EventService } = await import('./EventService');
            
            // 🆕 获取 Outlook 时间戳
            const remoteCreatedAt = action.data.createdDateTime 
              ? new Date(action.data.createdDateTime).getTime() 
              : undefined;
            const remoteUpdatedAt = action.data.lastModifiedDateTime 
              ? new Date(action.data.lastModifiedDateTime).getTime() 
              : undefined;
            
            // 🔍 调试：打印 Outlook 时间戳
            if ((action as any).__debugCount < 5) {
              console.log('[applyAction] Outlook 时间戳:', {
                eventId: oldEvent.id.slice(-8),
                createdDateTime: action.data.createdDateTime,
                lastModifiedDateTime: action.data.lastModifiedDateTime,
                remoteCreatedAt: remoteCreatedAt ? new Date(remoteCreatedAt).toLocaleString() : 'undefined',
                remoteUpdatedAt: remoteUpdatedAt ? new Date(remoteUpdatedAt).toLocaleString() : 'undefined'
              });
            }
            
            // ✅ 直接传递 remoteCoreContent 作为 eventlogInput（而非 fallback）
            // 🆕 使用本地 updatedAt 进行 Diff（避免 Outlook 时间戳变化导致签名变化）
            const localUpdatedAt = oldEvent.updatedAt 
              ? new Date(oldEvent.updatedAt).getTime() 
              : remoteUpdatedAt;
            
            const remoteEventlog = EventService.normalizeEventLog(
              remoteCoreContent,  // ✅ 直接传递 HTML/纯文本
              undefined,          // 不需要 fallback
              remoteCreatedAt,    // Event.createdAt
              localUpdatedAt,     // 🆕 使用本地时间（而非 Outlook 时间）
              oldEvent.eventlog   // 旧 eventlog（用于 Diff）
            );
            
            // ✅ Step 2: 比较新旧 eventlog 的 slateJson（规范化后的结构）
            const oldSlateJson = typeof oldEvent.eventlog?.slateJson === 'string' 
              ? oldEvent.eventlog.slateJson 
              : JSON.stringify(oldEvent.eventlog?.slateJson || []);
            const newSlateJson = typeof remoteEventlog.slateJson === 'string'
              ? remoteEventlog.slateJson
              : JSON.stringify(remoteEventlog.slateJson || []);
            
            // ✅ Step 3: 只有 eventlog 真的变化了才更新
            if (oldSlateJson !== newSlateJson) {
              updatedEventlog = remoteEventlog;
              eventlogActuallyChanged = true;
              console.log('✅ [Sync] EventLog 真实变化，将更新:', {
                eventId: oldEvent.id.slice(-8),
                oldLength: oldSlateJson.length,
                newLength: newSlateJson.length
              });
            } else {
              console.log('⏭️ [Sync] Description 变化但 EventLog 相同（仅签名差异），跳过更新:', {
                eventId: oldEvent.id.slice(-8)
              });
              // EventLog 没变化，不更新
            }
          }
          
          // 🔧 将 Outlook subject 转换为完整的 EventTitle 对象
          const cleanTitle = action.data.subject || '';
          const titleObject = {
            simpleTitle: cleanTitle,
            colorTitle: cleanTitle,
            fullTitle: JSON.stringify([{ type: 'paragraph', children: [{ text: cleanTitle }] }])
          };
          
          // 🔧 [v2.17.2 FIX] 增量更新机制：只更新变化的 Outlook 字段，保护本地专属字段
          const updates: any = {
            lastSyncTime: formatTimeForStorage(new Date()),
            syncStatus: 'synced' as const
          };
          
          // ✅ 只更新变化的字段
          if (titleChanged) {
            updates.title = titleObject;
          }
          
          if (eventlogActuallyChanged && updatedEventlog) {
            // ✅ 只在 eventlog 真正变化时才更新
            updates.eventlog = updatedEventlog;
          }
          
          if (timeChanged) {
            updates.startTime = remoteStart;
            updates.endTime = remoteEnd;
          }
          
          // location 和 isAllDay 也检测变化
          const remoteLocation = action.data.location?.displayName || '';
          if (remoteLocation !== oldEvent.location) {
            updates.location = remoteLocation;
          }
          
          const remoteIsAllDay = action.data.isAllDay || false;
          if (remoteIsAllDay !== oldEvent.isAllDay) {
            updates.isAllDay = remoteIsAllDay;
          }
          
          // ⚠️ 明确不传递以下本地专属字段（让 EventService 自动保留）：
          // tags, remarkableSource, childEventIds, parentEventId, linkedEventIds, backlinks
          
          // ✅ 使用 EventService 更新（会自动保存到 StorageManager）
          // 🔧 v2.17.2: 传递 source: 'external-sync' 触发本地字段保护
          const updatedEvent = await EventService.updateEvent(
            action.entityId, 
            updates, 
            true,
            { source: 'external-sync' }
          );
          
          if (updatedEvent) {
            // 🔧 [IndexMap 优化] 更新事件索引
            this.updateEventInIndex(updatedEvent, oldEvent);
            
            if (triggerUI) {
              this.triggerUIUpdate('update', updatedEvent);
            }
          }
        } catch (error) {
          console.error('[ActionBasedSyncManager] Failed to update event:', error);
        }
        break;

      case 'delete':
        try {
          const eventToDelete = await EventService.getEventById(action.entityId);
          if (eventToDelete) {
            // 🔧 [IndexMap 优化] 删除前从索引中移除
            this.removeEventFromIndex(eventToDelete);
            
            // ✅ 使用 EventService 删除（会自动从 StorageManager 删除）
            // 🔧 skipSync=true 避免再次调用 recordLocalAction 形成循环
            await EventService.deleteEvent(action.entityId, true);
            
            if (triggerUI) {
              this.triggerUIUpdate('delete', { id: action.entityId, title: eventToDelete.title });
            }
          } else {
            console.warn('[ActionBasedSyncManager] Event not found for delete:', action.entityId);
          }
        } catch (error) {
          console.error('[ActionBasedSyncManager] Failed to delete event:', error);
        }
        break;
    }
    
    // 🚀 返回修改后的events（用于批量模式）
    return events;
  }

  private triggerUIUpdate(actionType: string, eventData: any) {
    // ✅ 架构清理：triggerUIUpdate 已废弃
    // EventService 的 CRUD 操作已经触发 eventsUpdated 事件
    // 这里不需要重复触发，避免双重通知
    
    console.log('⏭️ [triggerUIUpdate] Skipping - EventService already triggered eventsUpdated:', {
      action: actionType,
      eventId: eventData?.id
    });
    
    // ❌ 已移除：local-events-changed 事件（已废弃）
    // ❌ 已移除：outlook-sync-completed 事件（不应该在每个操作时触发）
    // ❌ 已移除：action-sync-completed 事件（不应该在每个操作时触发）
  }

  private async resolveConflicts() {
    const localActions = this.actionQueue.filter(a => a.source === 'local' && !a.synchronized);
    const remoteActions = this.actionQueue.filter(a => a.source === 'outlook' && !a.synchronized);

    for (const localAction of localActions) {
      const conflictingRemoteAction = remoteActions.find(
        remote => remote.entityId === localAction.entityId && 
                 Math.abs(remote.timestamp.getTime() - localAction.timestamp.getTime()) < 60000
      );

      if (conflictingRemoteAction) {
        const conflict: SyncConflict = {
          localAction,
          remoteAction: conflictingRemoteAction,
          resolutionStrategy: this.determineConflictResolution(localAction, conflictingRemoteAction)
        };

        await this.resolveConflict(conflict);
      }
    }
  }

  private determineConflictResolution(localAction: SyncAction, remoteAction: SyncAction): 'local-wins' | 'remote-wins' | 'merge' | 'manual' {
    if (localAction.timestamp > remoteAction.timestamp) {
      return 'local-wins';
    } else {
      return 'remote-wins';
    }
  }

  private async resolveConflict(conflict: SyncConflict) {
    switch (conflict.resolutionStrategy) {
      case 'local-wins':
        await this.applyLocalActionToRemote(conflict.localAction);
        conflict.localAction.synchronized = true;
        conflict.remoteAction.synchronized = true;
        break;

      case 'remote-wins':
        await this.applyRemoteActionToLocal(conflict.remoteAction);
        conflict.remoteAction.synchronized = true;
        conflict.localAction.synchronized = true;
        break;

      case 'merge':
        await this.mergeConflictingActions(conflict.localAction, conflict.remoteAction);
        break;

      case 'manual':
        this.conflictQueue.push(conflict);
        this.saveConflictQueue();
        break;
    }

    this.saveActionQueue();
  }

  private async mergeConflictingActions(localAction: SyncAction, remoteAction: SyncAction) {
    // 实现智能合并逻辑
  }

  private cleanupSynchronizedActions() {
    const before = this.actionQueue.length;
    
    // 🔧 [CRITICAL FIX] 激进清理策略
    // 1. 清理已同步的 actions
    // 2. 清理失败次数过多的 actions (≥3)
    // 3. 清理超过 30 分钟的旧 actions (避免队列无限增长)
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    
    // 🔧 收集被删除的 actions（用于统计，不逐个打印）
    const removedActions: Array<{ type: string; age: number }> = [];
    
    this.actionQueue = this.actionQueue.filter(action => {
      // 已同步的 - 删除
      if (action.synchronized) {
        removedActions.push({ type: action.type, age: Math.round((Date.now() - action.timestamp.getTime()) / 60000) });
        return false;
      }
      
      // 失败 3 次以上的 - 删除
      if (action.retryCount >= 3) {
        removedActions.push({ type: `${action.type}(failed×${action.retryCount})`, age: Math.round((Date.now() - action.timestamp.getTime()) / 60000) });
        return false;
      }
      
      // 超过 30 分钟的旧 action - 删除 (防止队列膨胀)
      if (action.timestamp.getTime() < thirtyMinutesAgo) {
        removedActions.push({ type: `${action.type}(old)`, age: Math.round((Date.now() - action.timestamp.getTime()) / 60000) });
        return false;
      }
      
      return true;
    });
    
    const after = this.actionQueue.length;
    
    if (before !== after) {
      // 🔇 静默模式：只有清理数量 > 50 时才输出摘要，避免刷屏
      if (removedActions.length > 50) {
        const summary = removedActions.reduce((acc, a) => {
          acc[a.type] = (acc[a.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const avgAge = Math.round(removedActions.reduce((sum, a) => sum + a.age, 0) / removedActions.length);
        
        console.log(`🧹 [Cleanup] Removed ${before - after} actions (${before} → ${after}):`, {
          avgAge: `${avgAge}min`,
          breakdown: summary
        });
      } else if (removedActions.length > 0) {
        // 少量清理，只打印总数
        console.log(`🧹 [Cleanup] Removed ${before - after} actions (${before} → ${after})`);
      }
      
      this.saveActionQueue();
    }
  }

  private localEventsCache: Event[] | null = null;
  private localEventsCacheTime: number = 0;
  private localEventsPromise: Promise<Event[]> | null = null; // 🔧 查询去重
  private readonly CACHE_TTL = 5000; // 5秒缓存过期

  private async getLocalEvents() {
    try {
      // 🚀 [PERFORMANCE FIX] 使用缓存避免频繁全表查询阻塞 IndexedDB
      const now = Date.now();
      if (this.localEventsCache && (now - this.localEventsCacheTime < this.CACHE_TTL)) {
        return this.localEventsCache;
      }
      
      // 🔧 [CRITICAL FIX] 查询去重：如果已有查询进行中，等待该查询完成
      // 避免"惊群问题"：70+ 个并发调用同时触发全表查询
      if (this.localEventsPromise) {
        syncLogger.log('⏳ [getLocalEvents] Query in progress, waiting...');
        return this.localEventsPromise;
      }
      
      // 开始新查询，保存 Promise 供其他调用等待
      this.localEventsPromise = (async () => {
        const events = await EventService.getAllEvents(); // 自动规范化 title
        
        // 🔧 更新缓存
        this.localEventsCache = events;
        this.localEventsCacheTime = now;
        this.localEventsPromise = null; // 查询完成，清除 Promise
        
        return events;
      })();
      
      return this.localEventsPromise;
    } catch {
      this.localEventsPromise = null; // 查询失败，清除 Promise
      return [];
    }
  }

  // 🚀 Rebuild the event index map from events array
  // 🔧 [FIX] 优化：使用临时 Map，避免清空现有 Map 导致查询失败
  // 🚀 异步分批重建 IndexMap，避免阻塞主线程
  private async rebuildEventIndexMapAsync(events: any[], visibleEventIds?: string[]): Promise<void> {
    // 🔧 [CRITICAL] 记录重建 Promise，允许其他操作等待
    this.indexMapRebuildPromise = (async () => {
      const startTime = performance.now();
      let BATCH_SIZE = 200; // 初始批大小：200 个事件
      const MAX_BATCH_TIME = 10; // 每批最多 10ms
      const TARGET_FIRST_BATCH_TIME = 5; // 首批目标时间：5ms（留余量）
      // 🎯 优先处理可视区域的事件
      let priorityEvents: any[] = [];
      let remainingEvents: any[] = [];
    
      if (visibleEventIds && visibleEventIds.length > 0) {
        const visibleSet = new Set(visibleEventIds);
        events.forEach(event => {
          if (visibleSet.has(event.id)) {
            priorityEvents.push(event);
          } else {
            remainingEvents.push(event);
          }
        });
      } else {
        remainingEvents = events;
      }
    
      // 🔧 分批处理函数（带性能监控）
      const processBatch = (batchEvents: any[], batchIndex: number): number => {
        const batchStart = performance.now();
      
      batchEvents.forEach(event => {
        // 🔧 规范化 title 格式（避免标题闪烁）
        if (event.title) {
          event.title = EventService.normalizeTitle(event.title);
        }
        
        if (event.id) {
          this.eventIndexMap.set(event.id, event);
        }
        if (event.externalId) {
          // 优先保留 Timer 事件的 externalId 索引
          const existing = this.eventIndexMap.get(event.externalId);
          if (!existing || event.id.startsWith('timer-')) {
            this.eventIndexMap.set(event.externalId, event);
          }
        }
      });        const batchDuration = performance.now() - batchStart;
        if (batchIndex === 0 || batchIndex % 5 === 0) {
        // console.log(`📊 [IndexMap] Batch ${batchIndex}: ${batchEvents.length} events in ${batchDuration.toFixed(2)}ms`);
        }
      
        return batchDuration;
      };
    
      // 🎯 第一批：立即处理可视区域的事件（自适应批大小）
      if (priorityEvents.length > 0) {
        // 如果可视事件太多，分成更小的批次
        if (priorityEvents.length > BATCH_SIZE) {
        // console.log(`⚠️ [IndexMap] Priority events (${priorityEvents.length}) exceed batch size, splitting...`);
        
          // 第一小批：尽快完成
          const firstBatch = priorityEvents.slice(0, BATCH_SIZE);
          const firstBatchTime = processBatch(firstBatch, 0);
        
          // 🔧 根据第一批的性能调整批大小
          if (firstBatchTime > TARGET_FIRST_BATCH_TIME) {
            // 如果超时，减小批大小
            BATCH_SIZE = Math.max(50, Math.floor(BATCH_SIZE * TARGET_FIRST_BATCH_TIME / firstBatchTime));
          }
        
          // 处理剩余的优先事件
          for (let i = BATCH_SIZE; i < priorityEvents.length; i += BATCH_SIZE) {
            const batch = priorityEvents.slice(i, i + BATCH_SIZE);
            await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
            processBatch(batch, Math.floor(i / BATCH_SIZE));
          }
        } else {
          // 可视事件不多，一次处理完
          processBatch(priorityEvents, 0);
        }
      }
    
      // 🔄 分批处理剩余事件（在窗口失焦时处理）
      for (let i = 0; i < remainingEvents.length; i += BATCH_SIZE) {
        const batch = remainingEvents.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      
        // 等待窗口失焦或下一帧
        await new Promise(resolve => {
          if (document.hidden) {
            // 窗口失焦，立即处理
            resolve(null);
          } else {
            // 窗口激活，等待下一帧（约 16ms）
            requestAnimationFrame(() => resolve(null));
          }
        });
      
        processBatch(batch, batchIndex);
      }
    
      const totalDuration = performance.now() - startTime;
      console.log(`[ActionBasedSyncManager] 🗺️ IndexMap rebuild complete: ${events.length} events in ${totalDuration.toFixed(1)}ms`);
    })();
    
    // 等待重建完成
    await this.indexMapRebuildPromise;
    this.indexMapRebuildPromise = null;
    
    // 🗺️ IndexMap 不再保存，保留在内存中用于当前会话
  }
  
  // 🔧 同步版本（仅用于关键路径）
  private rebuildEventIndexMap(events: any[]) {
    events.forEach(event => {
      // 🔧 规范化 title 格式（避免标题闪烁）
      if (event.title) {
        event.title = EventService.normalizeTitle(event.title);
      }
      
      if (event.id) {
        this.eventIndexMap.set(event.id, event);
      }
      if (event.externalId) {
        const existing = this.eventIndexMap.get(event.externalId);
        if (!existing || event.id.startsWith('timer-')) {
          this.eventIndexMap.set(event.externalId, event);
        }
      }
    });
  }

  // 🚀 [NEW] 增量更新单个事件的索引（性能优化）
  private updateEventInIndex(event: any, oldEvent?: any) {
    // 移除旧索引
    if (oldEvent) {
      if (oldEvent.id) {
        this.eventIndexMap.delete(oldEvent.id);
      }
      if (oldEvent.externalId) {
        // 🔧 同时移除 "outlook-" 前缀和纯 ID 两种格式
        const cleanId = oldEvent.externalId.replace(/^outlook-/, '');
        this.eventIndexMap.delete(oldEvent.externalId);
        this.eventIndexMap.delete(cleanId);
        this.eventIndexMap.delete(`outlook-${cleanId}`);
      }
    }
    
    // 添加新索引 (🗺️ 只存储完整对象用于内存查询，不持久化)
    if (event) {
      // 🔧 规范化 title 格式（避免标题闪烁）
      if (event.title) {
        event.title = EventService.normalizeTitle(event.title);
      }
      
      if (event.id) {
        this.eventIndexMap.set(event.id, event);
      }
      if (event.externalId) {
        // 🔧 同时存储 "outlook-" 前缀和纯 ID 两种格式，确保查询成功
        const cleanId = event.externalId.replace(/^outlook-/, '');
        this.eventIndexMap.set(event.externalId, event);
        this.eventIndexMap.set(cleanId, event);
        this.eventIndexMap.set(`outlook-${cleanId}`, event);
      }
    }
    
    // 🗺️ 不再触发保存，避免 localStorage 配额不足
    // IndexMap 是纯内存索引，每次启动时重建
  }

  // 🚀 [NEW] 从索引中移除事件
  private removeEventFromIndex(event: any) {
    if (event.id) {
      this.eventIndexMap.delete(event.id);
    }
    if (event.externalId) {
      // 🔧 同时移除 "outlook-" 前缀和纯 ID 两种格式
      const cleanId = event.externalId.replace(/^outlook-/, '');
      this.eventIndexMap.delete(event.externalId);
      this.eventIndexMap.delete(cleanId);
      this.eventIndexMap.delete(`outlook-${cleanId}`);
    }
    
    // 🗺️ 不再触发保存，避免 localStorage 配额不足
  }

  private async saveLocalEvents(events: any[], rebuildIndex: boolean = true) {
    // ⚠️ DEPRECATED: 不再使用 localStorage
    // 改为通过 EventService 批量更新（由 StorageManager 处理双写）
    console.warn('[ActionBasedSyncManager] saveLocalEvents() is deprecated, events are saved via EventService');
    
    // 🚀 只在需要时重建索引（批量操作时应该传 false，使用增量更新）
    if (rebuildIndex) {
      // 🔧 使用异步重建，不阻塞保存操作
      this.rebuildEventIndexMapAsync(events).catch(err => {
        console.error('❌ [IndexMap] Async rebuild failed during save:', err);
      });
      // 🔧 重建索引视为重启，重置计数器
      this.incrementalUpdateCount = 0;
      this.fullCheckCompleted = true;
    } else {
      // 🔧 增量更新计数
      this.incrementalUpdateCount++;
      
      // 🔧 [NEW] 如果增量更新超过 30 次，标记需要全量检查
      if (this.incrementalUpdateCount > 30 && this.fullCheckCompleted) {
        this.fullCheckCompleted = false; // 触发下次完整检查
      }
    }
  }

  private async updateLocalEventExternalId(localEventId: string, externalId: string, description?: string) {
    try {
      const existingEvent = await EventService.getEventById(localEventId);
      if (existingEvent) {
        const events = await EventService.getAllEvents();
        const eventIndex = events.findIndex((event: any) => event.id === localEventId);
        if (eventIndex !== -1) {
          // 🔍 检查是否有其他事件已经使用了这个 externalId（可能是迁移导致的重复）
          const duplicateIndex = events.findIndex((event: any, idx: number) => 
            idx !== eventIndex && event.externalId === externalId
          );
          
          const oldEvent = { ...events[eventIndex] };
          
          if (duplicateIndex !== -1) {
            console.warn('⚠️ [updateLocalEventExternalId] Found duplicate event with same externalId:', {
              keepingEvent: localEventId,
              removingEvent: events[duplicateIndex].id,
              externalId: externalId
            });
            
            // 🔧 [IndexMap 优化] 删除重复事件时更新索引
            const duplicateEvent = events[duplicateIndex];
            this.removeEventFromIndex(duplicateEvent);
            
            // 通过 EventService 删除重复事件（会自动保存到 StorageManager）
            await EventService.deleteEvent(events[duplicateIndex].id);
          }
          
          // 通过 EventService 更新事件（会自动保存到 StorageManager）
          const updates = {
            externalId,
            syncStatus: 'synced' as const,
            lastSyncTime: this.safeFormatDateTime(new Date()),
            description: description || existingEvent.description || ''
          };
          
          // 🔧 v2.17.2: 传递 source: 'external-sync' 触发本地字段保护
          const updatedEvent = await EventService.updateEvent(localEventId, updates, true, { source: 'external-sync' });
          
          // 🔧 [IndexMap 优化] 更新事件索引
          if (updatedEvent) {
            this.updateEventInIndex(updatedEvent, oldEvent);
          }
          
          // ✅ 架构清理：使用 eventsUpdated 代替 local-events-changed
          window.dispatchEvent(new CustomEvent('eventsUpdated', {
            detail: { 
              eventId: localEventId, 
              isUpdate: true,
              action: 'update-external-id',
              externalId, 
              description 
            }
          }));
        }
      }
    } catch (error) {
      console.error('❌ Failed to update local event external ID:', error);
    }
  }

  private async updateLocalEventCalendarId(localEventId: string, calendarId: string) {
    try {
      const existingEvent = await EventService.getEventById(localEventId);
      if (existingEvent) {
        const oldEvent = { ...existingEvent };
        
        // 通过 EventService 更新事件（会自动保存到 StorageManager）
        const updates = {
          calendarId,
          lastSyncTime: this.safeFormatDateTime(new Date())
        };
        
        // 🔧 v2.17.2: 传递 source: 'external-sync' 触发本地字段保护
        const updatedEvent = await EventService.updateEvent(localEventId, updates, true, { source: 'external-sync' });
        
        // 🔧 [IndexMap 优化] 更新事件索引
        if (updatedEvent) {
          this.updateEventInIndex(updatedEvent, oldEvent);
        }
        
        window.dispatchEvent(new CustomEvent('local-events-changed', {
          detail: { eventId: localEventId, calendarId }
        }));
      }
    } catch (error) {
      console.error('❌ Failed to update local event calendar ID:', error);
    }
  }

  private convertRemoteEventToLocal(remoteEvent: any): any {
    const cleanTitle = remoteEvent.subject || '';
    
    // 🔍 [DEBUG v2.18.8] 检查 Outlook 返回的时间字段
    console.log('[convertRemoteEventToLocal] 🔍 Outlook 原始时间字段:', {
      eventId: remoteEvent.id?.slice(-10),
      hasCreatedDateTime: !!remoteEvent.createdDateTime,
      createdDateTime: remoteEvent.createdDateTime,
      hasLastModifiedDateTime: !!remoteEvent.lastModifiedDateTime,
      lastModifiedDateTime: remoteEvent.lastModifiedDateTime
    });
    
    // ✅ [v2.18.0 架构优化] 直接获取原始 HTML，让 normalizeEvent 统一处理
    // 优势：保留 Outlook HTML 格式，避免 HTML → 纯文本 → 重新生成 HTML 的损失
    let htmlContent = remoteEvent.body?.content || 
                       remoteEvent.description || 
                       remoteEvent.bodyPreview || 
                       '';
    
    // 🔥 [v2.20.0 Outlook 深度规范化] 应用 Outlook 专属的 HTML 清洗流程
    // 优化点：
    //   1. P0: 移除 Office XML 残留标签（<o:p>, <w:sdtPr>, xmlns等）
    //   2. P0: 识别并转换 MsoList 伪列表为语义化 <ul>/<ol>
    //   3. P0: 样式白名单清洗 + 明色背景自动添加黑色文字（防止白色文字）
    //   4. P2: 空行折叠（5个连续空行 → 1个空行）
    // 注：P1 CID 图片处理需要 event.attachments 参数，暂未实现
    if (htmlContent && htmlContent.trim()) {
      htmlContent = EventService.cleanOutlookXmlTags(htmlContent);
      htmlContent = EventService.processMsoLists(htmlContent);
      htmlContent = EventService.sanitizeInlineStyles(htmlContent);
      // CID 图片处理（P1）需要在 MicrosoftCalendarService 添加 attachments 获取
      // htmlContent = EventService.processCidImages(htmlContent, remoteEvent.attachments);
    }
    
    // 🔥 [v2.21.0 CompleteMeta V2 反序列化] 尝试从 Outlook HTML 中恢复节点 ID 和元数据
    // 如果 HTML 中包含 CompleteMeta V2（hidden div），则执行三层容错匹配算法
    // 优势：
    //   1. 保留节点 ID（mention 链接不断裂）
    //   2. 恢复 mention、timestamp、bulletLevel 等元数据
    //   3. 抗修改能力：用户在 Outlook 修改段落后仍能正确匹配（90%+ 保留率）
    let deserializedData: any = null;
    if (htmlContent.includes('id="4dnote-meta"')) {
      deserializedData = EventService.deserializeEventDescription(htmlContent, remoteEvent.id);
      
      if (deserializedData) {
        console.log('[convertRemoteEventToLocal] ✅ CompleteMeta V2 反序列化成功:', {
          eventId: remoteEvent.id.slice(-10),
          nodeCount: JSON.parse(deserializedData.eventlog.slateJson).length
        });
      }
    }
    
    // 🔧 [FIX] remoteEvent.id 已经带有 'outlook-' 前缀（来自 MicrosoftCalendarService）
    // 不要重复添加前缀！同时 externalId 应该是纯 Outlook ID（不带前缀）
    const pureOutlookId = remoteEvent.id.replace(/^outlook-/, '');
    
    // ✅ [v2.18.1 架构优化] 单一职责原则：只传 description，让 normalizeEvent 统一处理
    // 数据流：Outlook HTML → description → normalizeEvent 自动生成 eventlog
    // 优势：
    //   1. 单一数据源（description）
    //   2. 逻辑集中（EventService 完全负责签名提取、eventlog 生成）
    //   3. 接口简洁（ActionBasedSyncManager 不需要知道内部细节）
    // 
    // 🔥 [v2.21.0] 如果有反序列化数据，优先使用（保留节点 ID 和元数据）
    const partialEvent = {
      id: remoteEvent.id, // 已经是 'outlook-AAMkAD...'
      title: cleanTitle,  // ✅ 传递字符串，让 normalizeTitle() 转换
      description: htmlContent,  // ✅ 传递清洗后的 HTML
      ...(deserializedData?.eventlog && { eventlog: deserializedData.eventlog }), // 🆕 如果有反序列化数据，直接使用
      startTime: this.safeFormatDateTime(remoteEvent.start?.dateTime || remoteEvent.start),
      endTime: this.safeFormatDateTime(remoteEvent.end?.dateTime || remoteEvent.end),
      isAllDay: remoteEvent.isAllDay || false,
      location: remoteEvent.location?.displayName || '',
      reminder: 0,
      // 🔥 [CRITICAL FIX v2.19.0] 总是传递 Outlook 的时间戳
      // normalizeEvent 会收集3个候选：
      //   1. 签名中的时间（extractedTimestamps.createdAt）
      //   2. Outlook 的时间（event.createdAt，即下面传的值）
      //   3. 同步时间（new Date()，作为最后回退）
      // 然后取最早的时间，确保创建时间永远不会变晚
      // 
      // ✅ [FIX] createdDateTime/lastModifiedDateTime 默认不在 Graph API 响应中
      //    使用 start.dateTime 作为回退值（事件开始时间作为创建时间的近似值）
      createdAt: this.safeFormatDateTime(
        remoteEvent.createdDateTime || 
        remoteEvent.start?.dateTime || 
        remoteEvent.start || 
        new Date()
      ),
      updatedAt: this.safeFormatDateTime(
        remoteEvent.lastModifiedDateTime || 
        remoteEvent.end?.dateTime || 
        remoteEvent.end || 
        new Date()
      ),
      externalId: pureOutlookId, // 纯 Outlook ID，不带 'outlook-' 前缀
      calendarIds: remoteEvent.calendarIds || ['microsoft'], // 🔧 使用数组格式，与类型定义保持一致
      source: 'outlook', // 🔧 设置source字段（默认值，extractCreatorFromSignature 会根据签名覆盖）
      syncStatus: 'synced',
      // ✅ [v2.18.0] fourDNoteSource 由 extractCreatorFromSignature() 从签名中提取
      // 🔥 [CRITICAL FIX] 设置默认 syncMode，避免 undefined 导致单向覆盖
      // 规则：所有从 Outlook 同步的事件默认双向同步（bidirectional-private）
      //       用户可以在 UI 中随时修改同步模式
      syncMode: 'bidirectional-private'
    };
    
    // 🔍 [DEBUG v2.18.8] 调试时间戳问题
    const extractedTimestamps = SignatureUtils.extractTimestamps(htmlContent);
    console.log('[convertRemoteEventToLocal] 🔍 时间戳候选值:', {
      eventId: remoteEvent.id?.slice(-10),
      title: cleanTitle.slice(0, 30),
      '1️⃣ 签名时间': extractedTimestamps.createdAt?.slice(0, 19),
      '2️⃣ Outlook createdDateTime': remoteEvent.createdDateTime,
      '2️⃣ 格式化后': this.safeFormatDateTime(remoteEvent.createdDateTime || new Date()).slice(0, 19),
      '3️⃣ 同步时间（当前）': new Date().toISOString().slice(0, 19),
      '🏆 应选择': '最早的时间'
    });
    
    // ✅ 通过 EventService 规范化，自动处理所有字段
    // normalizeEvent 会自动：
    //   1. normalizeTitle(title) → 生成 EventTitle 对象
    //   2. extractTimestampsFromSignature(description) → 提取创建/修改时间
    //   3. extractCreatorFromSignature(description) → 提取创建者信息
    //   4. normalizeEventLog(undefined, description) → 从 description 生成 EventLog
    //   5. maintainDescriptionSignature(eventlog.plainText) → 重新生成签名
    const normalizedEvent = EventService.normalizeEvent(partialEvent);
    
    // 🔍 诊断日志：检查 eventlog 是否正确生成
    if (!normalizedEvent.eventlog || !normalizedEvent.eventlog.slateJson || normalizedEvent.eventlog.slateJson === '[]') {
      console.warn('[convertRemoteEventToLocal] eventlog 可能为空:', {
        eventId: normalizedEvent.id.substring(0, 20),
        hasEventlog: !!normalizedEvent.eventlog,
        slateJson: normalizedEvent.eventlog?.slateJson?.substring(0, 50),
        htmlLength: htmlContent.length,
        htmlPreview: htmlContent.substring(0, 100)
      });
    }
    
    return normalizedEvent;
  }

  private cleanHtmlContent(htmlContent: string): string {
    if (!htmlContent) return '';
    
    // 🔧 改进的HTML清理逻辑
    let cleaned = htmlContent;
    
    // 1. 如果是完整的HTML文档，优先提取body内容
    if (cleaned.includes('<html>') || cleaned.includes('<body>')) {
      // 尝试提取 PlainText div 中的内容
      const plainTextMatch = cleaned.match(/<div[^>]*class[^>]*["']PlainText["'][^>]*>([\s\S]*?)<\/div>/i);
      if (plainTextMatch) {
        cleaned = plainTextMatch[1];
      } else {
        // 如果没有PlainText div，尝试提取body内容
        const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          cleaned = bodyMatch[1];
        }
      }
    }
    
    // 2. 处理 <br> 标签，将其转换为换行符
    cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
    
    // 3. 移除所有剩余的HTML标签
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    
    // 4. 处理HTML实体
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
    
    // 5. 🔧 更智能的换行符清理 - 彻底清理多余换行
    cleaned = cleaned
      .replace(/\r\n/g, '\n')           // Windows换行符转换
      .replace(/\r/g, '\n')             // Mac换行符转换
      .replace(/[ \t]+\n/g, '\n')       // 移除行尾的空格和制表符
      .replace(/\n[ \t]+/g, '\n')       // 移除行首的空格和制表符
      .replace(/\n{2,}/g, '\n')         // 🔧 将所有多个连续换行符都减少为1个
      .replace(/^[\s\n]+/, '')          // 移除开头的所有空白和换行
      .replace(/[\s\n]+$/, '')          // 移除结尾的所有空白和换行
      .trim();
    
    return cleaned;
  }

  // 🆕 提取纯净的核心内容用于比较 - 使用统一的签名工具
  private extractCoreContent(description: string): string {
    return SignatureUtils.extractCoreContent(description);
  }

  // 🔧 保留几个简化的调试方法
  public debugActionQueue(): void {
    const pending = this.actionQueue.filter(a => !a.synchronized);
    if (pending.length > 0) {
    }
  }

  public async performSyncNow(): Promise<void> {
    if (!this.syncInProgress) {
      // 🚀 使用优先级同步策略：先同步可见范围，再同步剩余
      const currentDate = this.getCurrentCalendarDate();
      const visibleStart = new Date(currentDate);
      visibleStart.setMonth(visibleStart.getMonth() - 1);
      visibleStart.setDate(1);
      visibleStart.setHours(0, 0, 0, 0);
      
      const visibleEnd = new Date(currentDate);
      visibleEnd.setMonth(visibleEnd.getMonth() + 2);
      visibleEnd.setDate(0);
      visibleEnd.setHours(23, 59, 59, 999);
      
      syncLogger.log('🚀 [Manual Sync] User triggered sync, using priority strategy');
      await this.syncVisibleDateRangeFirst(visibleStart, visibleEnd);
    }
  }

  // 公共方法
  public isActive(): boolean {
    return this.isRunning;
  }

  public getLastSyncTime(): Date {
    return this.lastSyncTime;
  }

  public getPendingActionsCount(): number {
    return this.actionQueue.filter(action => !action.synchronized).length;
  }

  public getConflictsCount(): number {
    return this.conflictQueue.length;
  }

  public async forceSync(): Promise<void> {
    if (!this.syncInProgress) {
      // 🚀 使用优先级同步策略：先同步可见范围，再同步剩余
      const currentDate = this.getCurrentCalendarDate();
      const visibleStart = new Date(currentDate);
      visibleStart.setMonth(visibleStart.getMonth() - 1);
      visibleStart.setDate(1);
      visibleStart.setHours(0, 0, 0, 0);
      
      const visibleEnd = new Date(currentDate);
      visibleEnd.setMonth(visibleEnd.getMonth() + 2);
      visibleEnd.setDate(0);
      visibleEnd.setHours(23, 59, 59, 999);
      
      syncLogger.log('🚀 [Force Sync] User triggered force sync, using priority strategy');
      await this.syncVisibleDateRangeFirst(visibleStart, visibleEnd);
    }
  }

  /**
   * 处理标签映射变化，移动相关事件到新日历
   */
  public async handleTagMappingChange(tagId: string, mapping: { calendarId: string; calendarName: string } | null): Promise<void> {
    try {
      // 获取所有本地事件
      const events = await this.getLocalEvents();
      const eventsToMove = events.filter((event: any) => event.tagId === tagId && event.id.startsWith('outlook-'));
      
      if (eventsToMove.length === 0) {
        return;
      }
      for (const event of eventsToMove) {
        if (mapping) {
          // 移动到新日历
          await this.moveEventToCalendar(event, mapping.calendarId);
        } else {
          // 如果取消映射，移动到默认日历
          // 这里可以根据需要决定是否移动到默认日历
        }
      }
    } catch (error) {
      console.error(`❌ [ActionBasedSyncManager] Failed to handle tag mapping change:`, error);
    }
  }

  /**
   * 移动事件到指定日历
   */
  private async moveEventToCalendar(event: any, targetCalendarId: string): Promise<void> {
    try {
      // 提取原始Outlook事件ID
      const outlookEventId = event.id.replace('outlook-', '');
      
      // 第一步：在目标日历创建事件
      const createResult = await this.createEventInOutlookCalendar(event, targetCalendarId);
      
      if (createResult && createResult.id) {
        // 第二步：删除原事件
        await this.deleteEventFromOutlook(outlookEventId);
        
        // 第三步：更新本地事件ID
        const updatedEvent = {
          ...event,
          id: `outlook-${createResult.id}`,
          calendarId: targetCalendarId
        };
        
        // 更新本地存储
        await this.updateLocalEvent(event.id, updatedEvent);
      } else {
        console.error(`❌ [ActionBasedSyncManager] Failed to create event in target calendar`);
      }
    } catch (error) {
      console.error(`❌ [ActionBasedSyncManager] Failed to move event:`, error);
    }
  }

  /**
   * 在指定日历中创建事件
   */
  private async createEventInOutlookCalendar(event: any, calendarId: string): Promise<any> {
    try {
      // 🔥 [v2.21.0] 使用 CompleteMeta V2 序列化 description
      // 在 description HTML 中嵌入 Base64 编码的元数据（节点 ID、mention、timestamp 等）
      // 确保 Outlook → 4DNote 往返时能恢复这些信息
      let descriptionHtml = event.description || '';
      if (event.eventlog?.slateJson) {
        try {
          descriptionHtml = EventService.serializeEventDescription(event);
          console.log('[createEventInOutlookCalendar] ✅ CompleteMeta V2 序列化成功:', {
            eventId: event.id.slice(-10),
            hasMetaDiv: descriptionHtml.includes('id="4dnote-meta"')
          });
        } catch (err) {
          console.warn('[createEventInOutlookCalendar] CompleteMeta 序列化失败，使用原始 description', err);
        }
      }
      
      const eventData = {
        subject: event.title?.simpleTitle || '',
        body: {
          contentType: 'html',
          content: descriptionHtml  // 🆕 使用序列化后的 HTML（含 Meta）
        },
        start: {
          dateTime: event.startTime,
          timeZone: 'Asia/Shanghai'
        },
        end: {
          dateTime: event.endTime,
          timeZone: 'Asia/Shanghai'
        },
        location: {
          displayName: event.location || ''
        }
      };

      const response = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.microsoftService.getAccessToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      });

      if (response.ok) {
        return await response.json();
      } else {
        console.error('Failed to create event in calendar:', await response.text());
        return null;
      }
    } catch (error) {
      console.error('Error creating event in calendar:', error);
      return null;
    }
  }

  /**
   * 从Outlook删除事件
   */
  private async deleteEventFromOutlook(eventId: string): Promise<boolean> {
    try {
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.microsoftService.getAccessToken()}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Error deleting event from Outlook:', error);
      return false;
    }
  }

  /**
   * 更新本地事件
   */
  private async updateLocalEvent(oldEventId: string, updatedEvent: any): Promise<void> {
    try {
      const oldEvent = await EventService.getEventById(oldEventId);
      
      if (!oldEvent) {
        console.warn(`⚠️ [ActionBasedSyncManager] Event not found for update: ${oldEventId}`);
        return;
      }
      
      // 如果事件ID发生了变化，删除旧事件并创建新事件
      if (oldEventId !== updatedEvent.id) {
        // 🔧 [IndexMap 优化] 删除旧事件索引
        this.removeEventFromIndex(oldEvent);
        
        // 检查新ID是否已存在
        const existingNew = await EventService.getEventById(updatedEvent.id);
        
        if (existingNew) {
          // 新ID已存在，更新现有事件
          await EventService.updateEvent(updatedEvent.id, updatedEvent, true);
          this.updateEventInIndex(updatedEvent, existingNew);
        } else {
          // 新ID不存在，创建新事件
          await EventService.createEvent(updatedEvent);
          this.updateEventInIndex(updatedEvent);
        }
        
        // 删除旧事件
        await EventService.deleteEvent(oldEventId);
        
        // 记录旧事件ID为已删除
        this.deletedEventIds.add(oldEventId);
        this.saveDeletedEventIds();
      } else {
        // ID没有变化，直接更新
        await EventService.updateEvent(oldEventId, updatedEvent, true);
        
        // 🔧 [IndexMap 优化] 更新事件索引
        this.updateEventInIndex(updatedEvent, oldEvent);
      }
      
      // 触发事件更新
      window.dispatchEvent(new CustomEvent('local-events-changed'));
    } catch (error) {
      console.error('Error updating local event:', error);
    }
  }

  // ==================== 完整性检查方法 ====================

  /**
   * 🔧 启动完整性检查调度器
   * 🔧 [FIX] 降低检查频率：从 5 秒改为 30 秒，减少对 UI 的潜在影响
   */
  private startIntegrityCheckScheduler() {
    // 🔧 [FIX] 每 30 秒尝试一次检查（低频但足够）
    this.indexIntegrityCheckInterval = setInterval(() => {
      this.tryIncrementalIntegrityCheck();
    }, 30000); // 30 秒间隔（原来是 5 秒）
      // console.log('✅ [Integrity] Scheduler started (30-second interval, <10ms per check)');
  }

  /**
   * 🔧 检查是否处于空闲状态
   * 🔧 [FIX] 空闲标准：用户 15 秒无活动（原来是 5 秒）
   */
  /**
   * 🔧 尝试执行增量完整性检查
   * 🔧 [FIX] 增强条件检查，避免在不合适的时机运行
   */
  private tryIncrementalIntegrityCheck() {
    // 🚨 [CRITICAL FIX] 条件 0: 检查 Microsoft 服务认证状态
    // 如果用户登出或掉线，绝对不能运行完整性检查
    if (this.microsoftService) {
      const isAuthenticated = this.microsoftService.isAuthenticated || 
                             (typeof this.microsoftService.getIsAuthenticated === 'function' && 
                              this.microsoftService.getIsAuthenticated());
      
      if (!isAuthenticated) {
        return;
      }
    }
    
    // 🔧 [NEW] 条件 0.5: 检查窗口是否被激活（用户正在使用应用）
    if (this.isWindowFocused) {
      return; // 窗口被激活时不运行检查，避免打断用户操作
    }
    
    // 🔧 [NEW] 条件 0.6: 检查是否有 Modal 打开（用户正在编辑）
    if (typeof document !== 'undefined') {
      const hasOpenModal = document.querySelector('.event-edit-modal-overlay') !== null ||
                          document.querySelector('.settings-modal') !== null ||
                          document.querySelector('[role="dialog"]') !== null;
      if (hasOpenModal) {
      // console.log('⏸️ [Integrity] Skipping check: Modal is open (user is editing)');
        return;
      }
    }
    
    // 条件 1: 不在同步中
    if (this.syncInProgress) {
      return;
    }

    // 条件 2: 距离上次检查至少 30 秒
    const now = Date.now();
    if (now - this.lastIntegrityCheck < 30000) {
      return;
    }
    
    // 🔧 [FIX] 条件 3: 确保没有正在进行的操作（如事件编辑、删除等）
    // 通过检查 action queue 是否稳定（2 秒内没有新操作）
    const queueAge = now - this.lastQueueModification;
    if (queueAge < 2000) {
      return; // action queue 在 2 秒内有变化，延迟检查
    }

    // 执行检查
    this.runIncrementalIntegrityCheck();
  }

  /**
   * 🔧 增量完整性检查（轻量级，< 10ms）
   * 策略：
   * - 首次启动：执行完整检查（分批，每批 < 10ms）
   * - 后续：只检查 TimeCalendar 可见范围（当前月份）
   * - 超过 30 次增量更新后：再次执行完整检查
   */
  private currentCheckIndex = 0; // 当前检查进度

  private async runIncrementalIntegrityCheck() {
    const startTime = performance.now();
    this.lastIntegrityCheck = Date.now();

    try {
      const events = await EventService.getAllEvents(); // 自动规范化 title
      if (events.length === 0) {
        return;
      }
      
      // 🔧 [NEW] 决定检查策略
      const needsFullCheck = !this.fullCheckCompleted;
      
      if (needsFullCheck) {
        // 首次启动或增量更新超过 30 次：执行完整检查（分批）
        this.runBatchedFullCheck(events, startTime);
      } else {
        // 正常情况：只检查 TimeCalendar 可见范围
        this.runQuickVisibilityCheck(events, startTime);
      }

    } catch (error) {
      console.error('❌ [Integrity] Check failed:', error);
    }
  }

  /**
   * 🔧 分批完整检查（每次 < 10ms）
   */
  private runBatchedFullCheck(events: any[], startTime: number) {
    const batchSize = 20; // 每批 20 个事件，确保 < 10ms
    const maxDuration = 10; // 最多 10ms

    const start = this.currentCheckIndex;
    const end = Math.min(start + batchSize, events.length);
    const issues: any[] = [];

    for (let i = start; i < end; i++) {
      const event = events[i];

      // 快速检查：只检查关键项
      if (!event.id) {
        issues.push({ type: 'missing-id', eventIndex: i });
        continue;
      }

      // 检查 IndexMap
      const indexedEvent = this.eventIndexMap.get(event.id);
      if (!indexedEvent) {
        this.updateEventInIndex(event); // 立即修复
      }

      // 检查时间逻辑（快速）
      if (event.startTime && event.endTime) {
        const start = new Date(event.startTime).getTime();
        const end = new Date(event.endTime).getTime();
        if (end < start) {
          issues.push({ type: 'invalid-time', eventId: event.id });
        }
      }

      // 时间控制
      const elapsed = performance.now() - startTime;
      if (elapsed > maxDuration) {
        break;
      }
    }

    this.currentCheckIndex = end;

    // 完成一轮完整检查
    if (this.currentCheckIndex >= events.length) {
      this.fullCheckCompleted = true;
      this.currentCheckIndex = 0;
      this.incrementalUpdateCount = 0;
      
      const duration = performance.now() - startTime;
      const healthScore = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 5);
      this.lastHealthScore = healthScore;
      // console.log(`✅ [Integrity] Full check completed: ${events.length} events, ${issues.length} issues, ${healthScore}/100 health (${duration.toFixed(1)}ms)`);
    }
  }

  /**
   * 🔧 快速可见性检查（只检查 TimeCalendar 当前可见范围）
   * 🔧 [FIX] 完全避免触发 UI 刷新：只做索引修复，不触发任何事件
   */
  private runQuickVisibilityCheck(events: any[], startTime: number) {
    const maxDuration = 10; // 最多 10ms

    // 🔧 只检查当前月份的事件（TimeCalendar 可见范围）
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const visibleEvents = events.filter((e: any) => {
      if (!e.startTime) return false;
      const eventDate = new Date(e.startTime);
      return eventDate >= currentMonthStart && eventDate <= currentMonthEnd;
    });
    let checked = 0;
    const issues: any[] = [];

    for (const event of visibleEvents) {
      if (!event.id) continue;

      // 检查 IndexMap 一致性
      const indexedEvent = this.eventIndexMap.get(event.id);
      if (!indexedEvent) {
        this.updateEventInIndex(event); // 立即修复（仅内存操作，不触发事件）
        checked++;
      }

      // 时间控制
      const elapsed = performance.now() - startTime;
      if (elapsed > maxDuration) {
        break;
      }
    }

    const duration = performance.now() - startTime;
    if (duration < 10) {
      // 如果还有时间，检查 IndexMap 大小
      const indexSize = this.eventIndexMap.size;
      const expectedMax = events.length * 2;
      
      if (indexSize === 0 && events.length > 0) {
        console.warn('⚠️ [Integrity] IndexMap empty, rebuilding async...');
        // 🔧 [FIX] 使用异步重建，避免阻塞主线程
        this.rebuildEventIndexMapAsync(events).catch(err => {
          console.error('❌ [Integrity] Failed to rebuild IndexMap:', err);
        });
        this.fullCheckCompleted = true;
      } else if (indexSize > expectedMax * 1.5) {
        console.warn(`⚠️ [Integrity] IndexMap too large (${indexSize} entries for ${events.length} events)`);
      }
    }

    const healthScore = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 10);
    this.lastHealthScore = healthScore;

    // 🔧 [FIX] 只在有实际问题且问题数量 > 0 时才打印日志
    if (checked > 0) {
      // console.log(`✅ [Integrity] Quick check: ${checked} fixed silently (${duration.toFixed(1)}ms)`);
    }
  }

  /**
   * 🔧 [MIGRATION] 一次性清理重复的 outlook- 前缀
   * 修复历史数据中的：
   * 1. id: 'outlook-outlook-AAMkAD...' → 'outlook-AAMkAD...'
   * 2. externalId: 'outlook-AAMkAD...' → 'AAMkAD...'
   */
  
  // 🔧 [NEW] 修复历史 pending 事件（补充到同步队列）
  private async fixOrphanedPendingEvents() {
    // 每次启动时都检查，不使用迁移标记
    try {
      const events = await EventService.getAllEvents(); // 自动规范化 title
      
      // 查找需要同步但未同步的事件：
      // 1. syncStatus 为 'pending'（统一的待同步状态，包含新建和更新）
      // 2. fourDNoteSource = true（本地创建）
      // 3. 没有 externalId（尚未同步到远程）
      // 4. syncStatus !== 'local-only'（排除本地专属事件，如运行中的 Timer）
      // 5. 有目标日历：calendarIds 不为空 或 有 tagId（可能有日历映射）
      const pendingEvents = events.filter((event: any) => {
        const needsSync = event.syncStatus === 'pending' && 
                         event.fourDNoteSource === true &&
                         !event.externalId;
        
        if (!needsSync) return false;
        
        // 检查是否有目标日历
        const hasCalendars = (event.calendarIds && event.calendarIds.length > 0) || event.calendarId;
        const hasTag = event.tagId || (event.tags && event.tags.length > 0);
        
        // 有日历或有标签（标签可能有日历映射）才需要同步
        return hasCalendars || hasTag;
      });
      
      if (pendingEvents.length === 0) {
        return;
      }
      // 检查这些事件是否已经在同步队列中
      const existingActionIds = new Set(
        this.actionQueue
          .filter(a => a.source === 'local' && !a.synchronized)
          .map(a => a.entityId)
      );
      
      let addedCount = 0;
      
      for (const event of pendingEvents) {
        // 如果事件不在同步队列中，添加它
        if (!existingActionIds.has(event.id)) {
          const action: SyncAction = {
            id: `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'create',
            entityType: 'event',
            entityId: event.id,
            timestamp: new Date(event.createdAt || event.startTime),
            source: 'local',
            data: event,
            synchronized: false,
            retryCount: 0
          };
          
          this.actionQueue.push(action);
          addedCount++;
        }
      }
      
      if (addedCount > 0) {
        this.saveActionQueue();
      } else {
      }
      
    } catch (error) {
      console.error('❌ [Fix Pending] Failed to fix orphaned pending events:', error);
    }
  }

  private async migrateOutlookPrefixes() {
    const MIGRATION_KEY = '4dnote-outlook-prefix-migration-v1';
    
    // 检查是否已经迁移过
    if (localStorage.getItem(MIGRATION_KEY) === 'completed') {
      return;
    }
    try {
      const events = await EventService.getAllEvents(); // 自动规范化 title
      let migratedCount = 0;
      
      const migratedEvents = events.map((event: any) => {
        let needsMigration = false;
        const newEvent = { ...event };
        
        // 1. 修复 id 的重复前缀：outlook-outlook- → outlook-
        if (newEvent.id?.startsWith('outlook-outlook-')) {
          newEvent.id = newEvent.id.replace(/^outlook-outlook-/, 'outlook-');
          needsMigration = true;
        }
        
        // 2. 修复 externalId 的错误前缀：outlook-AAMkAD... → AAMkAD...
        if (newEvent.externalId?.startsWith('outlook-')) {
          newEvent.externalId = newEvent.externalId.replace(/^outlook-/, '');
          needsMigration = true;
        }
        
        if (needsMigration) {
          migratedCount++;
        }
        
        return newEvent;
      });
      
      if (migratedCount > 0) {
        console.log(`✅ [Migration] Migrated ${migratedCount} events with Outlook prefix issues`);
        // ⚠️ 注意：migratedEvents 是修改后的数组，但我们不能直接批量保存
        // EventService v3.0.0 需要逐个更新事件
        // 由于这是启动时的一次性迁移，可以接受性能损耗
        for (const migratedEvent of migratedEvents) {
          const original = events.find((e: any) => e.id === migratedEvent.id);
          if (original && JSON.stringify(original) !== JSON.stringify(migratedEvent)) {
            // 有变化，需要更新
            if (original.id !== migratedEvent.id) {
              // ID 变化，使用 updateLocalEvent
              await this.updateLocalEvent(original.id, migratedEvent);
            } else {
              // 只更新字段
              await EventService.updateEvent(migratedEvent.id, migratedEvent, true);
            }
          }
        }
        
        // 重建索引
        const updatedEvents = await EventService.getAllEvents();
        this.rebuildEventIndexMapAsync(updatedEvents).catch(err => {
          console.error('❌ [Migration] Failed to rebuild IndexMap:', err);
        });
      } else {
        console.log('✅ [Migration] No events need Outlook prefix migration');
      }
      
      // 标记迁移完成
      localStorage.setItem(MIGRATION_KEY, 'completed');
    } catch (error) {
      console.error('❌ [Migration] Failed to migrate Outlook prefixes:', error);
    }
  }

  /**
   * 🔄 [MIGRATION] 迁移 localStorage 同步队列到 IndexedDB
   * 一次性迁移，完成后标记，避免重复执行
   */
  private async migrateLocalStorageToIndexedDB() {
    const MIGRATION_KEY = '4dnote-sync-queue-migration-v1';
    
    // 检查是否已经迁移过
    if (localStorage.getItem(MIGRATION_KEY) === 'completed') {
      console.log('[ActionBasedSyncManager] ✅ Sync queue already migrated to IndexedDB');
      return;
    }

    try {
      console.log('[ActionBasedSyncManager] 🔄 Starting localStorage → IndexedDB migration...');
      
      // 1. 读取 localStorage 中的旧数据
      const stored = localStorage.getItem(STORAGE_KEYS.SYNC_ACTIONS);
      if (!stored) {
        console.log('[ActionBasedSyncManager] ℹ️ No localStorage data to migrate');
        localStorage.setItem(MIGRATION_KEY, 'completed');
        return;
      }

      // 2. 解析旧数据
      const oldActions: any[] = JSON.parse(stored);
      console.log(`[ActionBasedSyncManager] Found ${oldActions.length} actions in localStorage`);

      // 3. 转换为 SyncQueueItem 格式
      const syncQueueItems: SyncQueueItem[] = oldActions.map((action: any) => ({
        id: action.id,
        operation: action.type,
        entityType: action.entityType as 'event' | 'contact' | 'tag' | 'eventlog',
        entityId: action.entityId,
        data: action.data,
        status: action.synchronized ? SyncStatus.Synced : SyncStatus.Pending,
        attempts: action.retryCount || 0,
        lastAttemptAt: action.lastAttemptTime,
        error: action.lastError,
        createdAt: action.timestamp,
        updatedAt: action.synchronizedAt || formatTimeForStorage(new Date())
      }));

      // 4. 批量保存到 IndexedDB
      await storageManager.createSyncActions(syncQueueItems);
      
      console.log(`[ActionBasedSyncManager] ✅ Migrated ${syncQueueItems.length} actions to IndexedDB`);

      // 5. 清理 localStorage（可选，保留一段时间以防回滚）
      // localStorage.removeItem(STORAGE_KEYS.SYNC_ACTIONS);
      
      // 6. 标记迁移完成
      localStorage.setItem(MIGRATION_KEY, 'completed');
      
    } catch (error) {
      console.error('[ActionBasedSyncManager] ❌ Migration failed:', error);
      // 不设置 completed 标记，下次启动时重试
    }
  }

  /**
   * 🔧 计算数据健康评分（0-100）
   */
  private calculateHealthScore(totalEvents: number, issues: any[]): number {
    if (totalEvents === 0) return 100;
    if (issues.length === 0) return 100;

    const critical = issues.filter(i => i.severity === 'critical').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const info = issues.filter(i => i.severity === 'info').length;

    // 扣分规则
    const criticalPenalty = critical * 10; // 每个严重问题扣 10 分
    const warningPenalty = warnings * 2;   // 每个警告扣 2 分
    const infoPenalty = info * 0.5;        // 每个信息扣 0.5 分

    const totalPenalty = criticalPenalty + warningPenalty + infoPenalty;
    const score = Math.max(0, 100 - totalPenalty);

    return Math.round(score);
  }
}
