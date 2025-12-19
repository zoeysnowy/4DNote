import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MicrosoftCalendarService } from './services/MicrosoftCalendarService';
import { CalendarService } from './services/CalendarService'; // 🆕 v2.0: 统一日历服务
import { ActionBasedSyncManager } from './services/ActionBasedSyncManager';
// ❌ [REMOVED] TaskManager - 从未使用的组件
import CalendarSync from './features/Calendar/components/CalendarSync';
// import UnifiedTimeline from './components/UnifiedTimeline'; // 暂时未使用
import AppLayout, { PageType } from './components/AppLayout';
import PageContainer from './components/PageContainer';
import DesktopCalendarWidget from './pages/DesktopCalendarWidget';
import { TimerCard } from './components/TimerCard'; // 计时卡片组件
import { DailyStatsCard } from './components/DailyStatsCard'; // 今日统计卡片组件
import { HomePage } from './pages/HomePage'; // 🆕 HomePage with stats dashboard
import { TimerSession, Event } from './types';
import { formatTimeForStorage } from './utils/timeUtils';
import { getCalendarGroupColor, getAvailableCalendarsForSettings } from './utils/calendarUtils';
import { STORAGE_KEYS, CacheManager } from './constants/storage';
import { PersistentStorage, PERSISTENT_OPTIONS } from './utils/persistentStorage';
import { TagService } from './services/TagService';
import { EventService } from './services/EventService';
import { EventHub } from './services/EventHub'; // 🔧 同步导入 EventHub（避免异步挂载延迟）
import { TimeHub } from './services/TimeHub'; // 🔧 同步导入 TimeHub
import { EventEditModalV2 } from './components/EventEditModal/EventEditModalV2'; // v2 - 新版本
import SettingsModal from './components/SettingsModal';
import { SyncNotification } from './components/SyncNotification';
import './App.css';

// 🔧 暂时禁用懒加载，测试性能
import TagManager from './components/TagManager';
import TimeCalendar from './features/Calendar/TimeCalendar';
import PlanManager from './components/PlanManager';
import TimeLog from './pages/TimeLog';

import { logger } from './utils/logger';

// 🧪 导入存储测试模块（开发环境）
import './tests/test-storage-indexeddb';
import './tests/debug-storage-env';

const AppLogger = logger.module('App');
// 🚀 性能优化：生产环境禁用 AppLogger.log
if (process.env.NODE_ENV === 'production') {
  const noop = () => {};
  AppLogger.log = noop;
  AppLogger.debug = noop;
  // 保留 warn 和 error
}

// 暴露时间工具函数到全局，供控制台调试使用
if (typeof window !== 'undefined') {
  (window as any).formatTimeForStorage = formatTimeForStorage;
}

declare global {
  interface Window {
    microsoftCalendarService: MicrosoftCalendarService;
  }
}

// 在组件外部立即创建服务实例
const microsoftCalendarService = new MicrosoftCalendarService();

// 🔧 立即暴露核心服务到全局（在 ActionBasedSyncManager 初始化前）
if (typeof window !== 'undefined') {
  window.microsoftCalendarService = microsoftCalendarService;
  
  // ✅ 立即挂载 EventHub 和 TimeHub（同步挂载，避免 ActionBasedSyncManager 查找失败）
  (window as any).EventService = EventService;
  (window as any).EventHub = EventHub;
  (window as any).TimeHub = TimeHub;
  console.log('✅ [App] EventHub, TimeHub, EventService 已同步挂载到 window');
}

function App() {
  // 🔧 确认组件渲染
  console.log('🔍 [App] Component rendering...');
  
  // 🔧 初始化缓存管理和标签系统
  useEffect(() => {
    const initializeApp = async () => {
      console.log('🚀 [App] Initializing application...');
      
      // 缓存管理
      CacheManager.checkAndClearOldCache();
      
      // 🔥 v3.0.0: 初始化 StorageManager（IndexedDB + SQLite）
      console.log('📦 [App] Initializing StorageManager...');
      try {
        const { storageManager } = await import('./services/storage/StorageManager');
        await storageManager.initialize();
        console.log('✅ [App] StorageManager initialized');
        
        // 🔧 暴露到全局，供调试和迁移脚本使用
        if (typeof window !== 'undefined') {
          (window as any).storageManagerInstance = storageManager;
        }
        
        // 🔥 v3.1.0: 初始化 EventHistoryService（SQLite）
        console.log('📚 [App] Initializing EventHistoryService...');
        const { EventHistoryService } = await import('./services/EventHistoryService');
        await EventHistoryService.initialize(storageManager);
        console.log('✅ [App] EventHistoryService initialized');
        
        // 🔄 数据迁移：localStorage → StorageManager
        const { needsMigration, migrateFromLocalStorage } = await import('./utils/dataMigration');
        const shouldMigrate = await needsMigration();
        
        if (shouldMigrate) {
          console.log('🔄 [App] Starting data migration...');
          const migrationResult = await migrateFromLocalStorage();
          
          if (migrationResult.success) {
            console.log('✅ [App] Migration completed:', {
              migratedCount: migrationResult.migratedCount,
              duration: `${migrationResult.duration}ms`
            });
          } else {
            console.error('❌ [App] Migration failed:', {
              failedCount: migrationResult.failedCount,
              errors: migrationResult.errors
            });
            // 迁移失败不阻止应用启动，继续使用 localStorage 作为降级方案
          }
        } else {
          console.log('ℹ️  [App] No migration needed');
        }
        
        // 🚀 [PERFORMANCE] 一次性迁移：Event → EventStats
        console.log('📊 [App] Checking EventStats migration...');
        await storageManager.migrateToEventStats();
      } catch (error) {
        console.error('❌ [App] StorageManager initialization failed:', error);
        // 初始化失败不阻止应用启动，会降级到 localStorage
      }
      
      // 初始化标签系统（独立于日历连接）
      console.log('🏷️  [App] Starting TagService initialization...');
      await TagService.initialize();
      console.log('✅ [App] TagService initialized');
      
      // 🆕 v2.0: 初始化 CalendarService
      console.log('📅 [App] Initializing CalendarService...');
      await CalendarService.initialize(microsoftCalendarService);
      console.log('✅ [App] CalendarService initialized');
      
      // 🔧 初始化完成后加载标签供编辑使用
      loadAvailableTagsForEdit();
      
      // 🔍 初始化 Unified Mention 搜索索引
      console.log('🔍 [App] Initializing Unified Mention search index...');
      try {
        const { unifiedSearchIndex } = await import('./services/search/UnifiedSearchIndex');
        await unifiedSearchIndex.initialize();
        console.log('✅ [App] Search index initialized');
        
        // 暴露到全局以便调试和PlanSlate使用
        if (typeof window !== 'undefined') {
          (window as any).unifiedSearchIndex = unifiedSearchIndex;
        }
      } catch (err) {
        console.error('❌ [App] Search index initialization failed:', err);
      }
      
      // 🎯 UUID 迁移完成 (v2.17)
      // 不再需要 EventIdPool 初始化，ID 生成器直接使用 UUID v4
      console.log('✅ [App] Using UUID v4 for event ID generation (no pool needed)');
      
      // 🧪 动态加载 SQLite 测试模块（仅 Electron 环境）
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        import('./tests/test-storage-sqlite').catch(err => {
          console.warn('⚠️  SQLite tests not available:', err);
        });
      }
      
      // 🆕 v1.8.1: EventLog 数据迁移已完成，不需要重复执行
      
      // 暴露调试工具到全局
      if (typeof window !== 'undefined') {
        const cacheObject = {
          clear: () => {
            AppLogger.warn('⚠️ 使用 FourDNoteCache.clearOnlyRuntime() 清除运行时缓存，或 FourDNoteCache.clearAll() 清除所有数据');
          },
          clearOnlyRuntime: CacheManager.clearAllCache,
          clearAll: () => {
            CacheManager.clearAllCache();
            PersistentStorage.clear(PERSISTENT_OPTIONS.TAGS);
            AppLogger.log('🧹 所有数据已清除，包括持久化存储');
          },
          info: CacheManager.getCacheInfo,
          version: () => localStorage.getItem('4dnote-storage-version'),
          // 新增持久化存储调试工具
          persistent: {
            info: () => PersistentStorage.getStorageInfo(PERSISTENT_OPTIONS.TAGS),
            getTags: () => PersistentStorage.getItem(STORAGE_KEYS.HIERARCHICAL_TAGS, PERSISTENT_OPTIONS.TAGS),
            setTags: (tags: any) => PersistentStorage.setItem(STORAGE_KEYS.HIERARCHICAL_TAGS, tags, PERSISTENT_OPTIONS.TAGS),
            clear: () => PersistentStorage.clear(PERSISTENT_OPTIONS.TAGS),
            getAllKeys: () => PersistentStorage.getAllKeys(PERSISTENT_OPTIONS.TAGS)
          },
          // 标签服务调试工具
          tags: {
            service: TagService,
            reinitialize: () => TagService.reinitialize(),
            getTags: () => TagService.getTags(),
            getFlatTags: () => TagService.getFlatTags()
          }
        };
        
        // 挂载 FourDNoteCache 到 window
        (window as any).FourDNoteCache = cacheObject;
        console.log('✅ [App] FourDNoteCache 已挂载到 window');
        
        // 🧪 EventHub/TimeHub/EventService 已在组件外部同步挂载
        // 这里只需异步加载 ContactService 和 StorageManager
        console.log('🧪 [App] Exposing async global objects for testing...');
        import('./services/ContactService').then(({ ContactService }) => {
          (window as any).ContactService = ContactService;
        });
        import('./services/storage/StorageManager').then(({ storageManager }) => {
          (window as any).storageManager = storageManager;
          (window as any).StorageManager = storageManager; // 大写版本（兼容性）
        });
        (window as any).TagService = TagService; // 已经导入
        (window as any).ActionBasedSyncManager = ActionBasedSyncManager; // 已经导入
      }
    };

    initializeApp();
  }, []);

  // 监听TagService的变化
  useEffect(() => {
    const handleTagsUpdate = () => {
      loadAvailableTagsForEdit();
      // 🔧 [PERFORMANCE FIX] 触发 hierarchicalTags 更新
      setTagsVersion(v => v + 1);
      AppLogger.log('🏷️ [App] TagService updated, incrementing tagsVersion');
    };

    TagService.addListener(handleTagsUpdate);
    
    // 如果TagService已经初始化，立即加载标签
    if (TagService.isInitialized()) {
      loadAvailableTagsForEdit();
      // 🛡️ 初始化时不需要触发setTagsVersion，会在真正有标签变化时触发
      AppLogger.log('🏷️ [App] TagService already initialized, loading tags');
    }

    return () => {
      TagService.removeListener(handleTagsUpdate);
    };
  }, []);

  // 基础状态
  // ❌ [REMOVED] seconds, isActive, taskName, currentTask - 旧的计时器状态，已被 globalTimer 替代
  // ❌ [REMOVED] timerSessions - 旧的会话记录，从未使用
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  // ❌ [REMOVED] intervalRef - 旧的计时器 interval，已不再使用

  // 服务和同步管理器状态
  const [syncManager, setSyncManager] = useState<any>(() => {
    console.log('🔍 [App] syncManager state initializing...');
    return null;
  });
  const [microsoftService] = useState<any>(() => {
    console.log('🔍 [App] microsoftService state initializing...');
    return microsoftCalendarService;
  });
  const [lastAuthState, setLastAuthState] = useState(() => {
    const isAuth = microsoftCalendarService?.isSignedIn() || false;
    console.log('🔍 [App] lastAuthState initializing:', isAuth);
    return isAuth;
  });
  
  // ✨ 防止重复创建 SyncManager（React 严格模式会导致 useEffect 执行两次）
  const syncManagerCreationRef = useRef(false);

  // 🔧 调试：监控 syncManager 变化
  useEffect(() => {
    console.log('🔍 [App] syncManager changed useEffect:', {
      hasSyncManager: !!syncManager,
      type: typeof syncManager,
      hasForceSync: syncManager ? typeof syncManager.forceSync : 'N/A',
      keys: syncManager ? Object.keys(syncManager).slice(0, 10) : 'null'
    });
  }, [syncManager]);

  // 编辑相关状态
  const [editingEventId, setEditingEventId] = useState('');
  const [editingEventTitle, setEditingEventTitle] = useState('');
  const [editingEventDescription, setEditingEventDescription] = useState('');
  const [editingEventTagIds, setEditingEventTagIds] = useState<string[]>([]);
  const [availableTagsForEdit, setAvailableTagsForEdit] = useState<any[]>([]);
  const [showEventEditModal, setShowEventEditModal] = useState(false);

  // 全局计时器状态
  const [globalTimer, setGlobalTimer] = useState<{
    isRunning: boolean;
    tagId: string; // 🔧 向后兼容：保留第一个标签ID
    tagIds: string[]; // 🆕 完整的标签数组，支持多标签统计
    tagName: string;
    tagEmoji?: string; // 标签emoji
    tagColor?: string; // 标签颜色
    startTime: number; // 当前计时周期的开始时间:（用于计算当前运行时长）
    originalStartTime: number; // 真正的开始时间:（用户设置或初始开始时间:）
    elapsedTime: number;
    isPaused: boolean;
    eventEmoji?: string; // 用户自定义事件emoji
    eventTitle?: string; // 用户自定义事件标题
    eventId?: string; // 🔧 [BUG FIX] Timer 事件的真实ID
    parentEventId?: string; // 🆕 Issue #12: 关联的父事件 ID（Timer 子事件关联到的父事件）
  } | null>(null);

  // 标签数据状态 - 用版本号触发 hierarchicalTags 更新
  // 🔧 [PERFORMANCE FIX] 移除冗余的 appTags state，直接使用 TagService
  const [tagsVersion, setTagsVersion] = useState(0);

  // 处理标签变化的回调函数 (从 FigmaTagManager)
  const handleTagsChange = useCallback((newTags: any[]) => {
    AppLogger.log('🏷️ [App] Received tags update from FigmaTagManager:', newTags.length);
    
    // 同步更新TagService
    if (newTags.length > 0) {
      try {
        // 转换格式以匹配TagService期望的HierarchicalTag接口
        const hierarchicalTags = newTags.map(tag => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          emoji: tag.emoji,
          level: tag.level, // 🔧 保留层级信息
          parentId: tag.parentId,
          calendarMapping: tag.calendarMapping
        }));
        
        TagService.updateTags(hierarchicalTags);
        // 🔧 更新版本号触发 hierarchicalTags 重新计算
        setTagsVersion(v => v + 1);
        AppLogger.log('✅ [App] Successfully synced tags to TagService');
      } catch (error) {
        AppLogger.error('❌ [App] Failed to sync tags to TagService:', error);
      }
    }
  }, []);

  // ❌ [REMOVED] allEvents state - 不再由 App.tsx 维护
  // 原因：违反增量更新架构，各组件应自己监听 eventsUpdated
  // - DailyStatsCard 已自己监听
  // - PlanManager 应自己监听（而非通过 props 接收）

  // 🔧 [PERFORMANCE FIX] 缓存层级标签，避免每次渲染时重新调用 TagService.getTags()
  // 现在只依赖 tagsVersion，TagService.getTags() 返回稳定引用
  const hierarchicalTags = useMemo(() => {
    return TagService.getTags();
  }, [tagsVersion]); // 只在 TagService 更新时重新获取

  // 🔧 [PERFORMANCE FIX] 缓存可用日历列表，避免每次渲染创建新数组
  const availableCalendars = useMemo(() => {
    return getAvailableCalendarsForSettings();
  }, []); // 空依赖，日历列表应该是相对稳定的

  // ❌ [REMOVED] loadEvents useEffect - 不再全局监听 eventsUpdated
  // 原因：各组件自己监听，避免 App 不必要的重渲染
  // 详见架构文档: docs/architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md § 1.2.1

  // 计时器编辑模态框状态
  const [timerEditModal, setTimerEditModal] = useState<{
    isOpen: boolean;
    event: Event | null;
  }>({
    isOpen: false,
    event: null
  });

  // 应用设置状✅
  const [appSettings, setAppSettings] = useState({
    selectedCalendarIds: [] as string[], // 更新为数组格式
    calendarGroups: [] as any[],
    hierarchicalTags: [] as any[],
    syncConfig: {},
    lastUpdated: '',
    theme: 'light'
  });

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // 页面状态管✅
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  
  // Panel可见性状态
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  
  // 🔧 优化：移除不必要的依赖，避免频繁重新创建函数
  const handlePageChange = useCallback((page: PageType) => {
    const startTime = performance.now();
    AppLogger.log(`📄 [App] Page change requested: ${currentPage} -> ${page}`);
    
    // Electron环境下的额外调试
    if (window.electronAPI?.debugLog) {
      window.electronAPI.debugLog('App page change', {
        from: currentPage,
        to: page,
        timestamp: formatTimeForStorage(new Date())
      });
    }
    
    setCurrentPage(page);
    
    // 性能监控
    requestAnimationFrame(() => {
      const duration = performance.now() - startTime;
      AppLogger.log(`📄 [App] Page state updated to: ${page} (${duration.toFixed(2)}ms)`);
      
      if (duration > 100) {
        AppLogger.warn(`⚠️ [App] 页面切换耗时过长: ${duration.toFixed(2)}ms`);
      }
    });
  }, []); // 🔧 移除 currentPage 依赖

  // 设置模态框状✅
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // UnifiedTimeline引用 (暂时移除，等待后续实✅
  // const unifiedTimelineRef = useRef<UnifiedTimelineRef>(null);

  // 设置管理函数
  const loadAppSettings = () => {
    try {
      const settings = localStorage.getItem('4dnote-settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        setAppSettings(prev => ({ ...prev, ...parsed }));
      }
    } catch (error) {
      AppLogger.warn('设置加载失败:', error);
    }
    setSettingsLoaded(true);
  };

  const saveAppSettings = (newSettings: Partial<typeof appSettings>) => {
    const updated = { ...appSettings, ...newSettings, lastUpdated: formatTimeForStorage(new Date()) };
    setAppSettings(updated);
    localStorage.setItem('4dnote-settings', JSON.stringify(updated));
  };

  // 加载可编辑标签列✅
  const loadAvailableTagsForEdit = () => {
    const flatTags = TagService.getFlatTags();
    setAvailableTagsForEdit(flatTags);
  };

  // 🔧 Issue #12: 支持从任何事件启动关联的计时器
  // 全局计时器管理函数
  /**
   * 启动计时器
   * 
   * Timer 生命周期：
   * 1. START: 立即创建 eventId 和初始事件 (syncStatus: 'local-only')
   * 2. RUNNING: 每30秒自动保存，更新同一个事件 (syncStatus 保持 'local-only')
   * 3. STOP: 计算最终时长，更新事件状态为 'pending' 以触发同步
   * 
   * 🆕 独立 Timer 二次计时自动升级机制：
   * - 检测独立 Timer 事件（isTimer=true + 无 parentEventId + 有 timerLogs）
   * - 自动创建父事件，继承所有元数据
   * - 将原 Timer 转为子事件
   * - 为父事件启动新 Timer
   * 
   * @param tagIds - 标签ID数组（可选，支持无标签计时）
   * @param eventIdOrParentId - 事件ID或父事件ID（可选）
   *   - 如果是已存在的独立 Timer → 自动升级为父子结构
   *   - 如果是普通事件 → 作为 parentEventId 使用
   */
  const handleTimerStart = async (tagIds?: string | string[], eventIdOrParentId?: string) => {
    // 支持旧版单个 tagId 参数的兼容性，也支持空标签
    const tagIdArray = tagIds ? (Array.isArray(tagIds) ? tagIds : [tagIds]) : [];
    
    // 🆕 检测是否为独立 Timer 的二次计时（自动升级机制）
    let parentEventId = eventIdOrParentId;
    if (eventIdOrParentId) {
      // 从 EventService 读取单个事件（自动规范化 title）
      const existingEvent = await EventService.getEventById(eventIdOrParentId);
      
      // 检测条件：isTimer=true + 无 parentEventId + 有 childEventIds（说明已完成至少一次计时）
      if (existingEvent && 
          existingEvent.isTimer === true && 
          !existingEvent.parentEventId && 
          existingEvent.childEventIds && 
          existingEvent.childEventIds.length > 0) {
        
        AppLogger.log('🔄 [Timer] 检测到独立 Timer 二次计时，自动升级为父子结构', {
          timerId: existingEvent.id,
          childEventsCount: existingEvent.childEventIds.length
        });
        
        // Step 1: 创建父事件（继承原 Timer 的所有元数据）
        const parentEvent: Event = {
          id: `parent-${Date.now()}`,
          title: existingEvent.title || { simpleTitle: '计时事件', fullTitle: undefined, colorTitle: undefined },
          description: existingEvent.description,
          emoji: existingEvent.emoji,
          tags: existingEvent.tags || [],
          color: existingEvent.color,
          source: 'local',
          isTimer: false,           // ✅ 不再是 Timer
          isTimeCalendar: true,     // 标记为 TimeCalendar 创建
          childEventIds: [existingEvent.id], // 将原 Timer 作为第一个子事件
          createdAt: existingEvent.createdAt,
          updatedAt: formatTimeForStorage(new Date()),
          syncStatus: 'pending' as const,
          fourDNoteSource: true,
          // 继承其他元数据
          calendarIds: existingEvent.calendarIds,
          location: existingEvent.location,
          organizer: existingEvent.organizer,
          attendees: existingEvent.attendees,
          notes: existingEvent.notes,
          priority: existingEvent.priority,
          eventlog: existingEvent.eventlog
        };
        
        // Step 2: 将原 Timer 转为子事件
        await EventService.updateEvent(existingEvent.id, {
          parentEventId: parentEvent.id,
          updatedAt: formatTimeForStorage(new Date())
        } as Partial<Event>);
        
        // Step 3: 保存父事件
        const createResult = await EventService.createEvent(parentEvent, true);
        if (!createResult.success) {
          AppLogger.error('❌ [Timer] 创建父事件失败:', createResult.error);
          return;
        }
        
        AppLogger.log('✅ [Timer] 升级完成，父事件已创建:', {
          parentId: parentEvent.id,
          originalTimerId: existingEvent.id
        });
        
        // Step 4: 使用父事件 ID 作为新 Timer 的 parentEventId
        parentEventId = parentEvent.id;
      }
    }
    
    // 🆕 支持无标签计时：如果没有标签，使用默认值
    let tag = null;
    if (tagIdArray.length > 0) {
      tag = TagService.getFlatTags().find(t => t.id === tagIdArray[0]);
      if (!tag) {
        AppLogger.warn('标签未找到，使用无标签计时', tagIdArray[0]);
      }
    }

    AppLogger.log('🏷️ [Timer] 开始计时', tag ? {
      id: tag.id,
      name: tag.name,
      emoji: tag.emoji,
      color: tag.color,
      parentEventId
    } : {
      noTag: true,
      parentEventId
    });

      const startTime = Date.now();
      const startDate = new Date(startTime);
      
      // ✅ 立即生成固定 eventId（整个计时过程保持不变）
      const timerEventId = `timer-${tagIdArray[0] || 'notag'}-${startTime}`;
      
      // 🔧 如果有父事件，继承父事件的元数据
      let parentEvent = null;
      if (parentEventId) {
        parentEvent = await EventService.getEventById(parentEventId);
        console.log('🔗 [Timer Start] 读取父事件元数据:', {
          parentEventId,
          found: !!parentEvent,
          title: parentEvent?.title,
          tags: parentEvent?.tags,
          calendarIds: parentEvent?.calendarIds,
          syncMode: parentEvent?.syncMode,
          eventlog: parentEvent?.eventlog
        });
      } else {
        console.log('⚠️ [Timer Start] 没有 parentEventId');
      }
      
      // ✅ 立即创建初始事件（syncStatus: 'local-only'，运行中不同步）
      // 🔧 Timer 作为系统性子事件，应从 parentEvent.subEventConfig 继承配置
      const initialEvent: Event = {
        id: timerEventId,
        title: parentEvent?.title || { simpleTitle: '计时中的事件' },
        emoji: parentEvent?.emoji,
        startTime: formatTimeForStorage(startDate),
        endTime: formatTimeForStorage(startDate), // 结束时更新
        tags: parentEvent?.tags || tagIdArray,
        // ✅ 系统性子事件：从 subEventConfig 继承（fallback 到父事件配置）
        calendarIds: parentEvent?.subEventConfig?.calendarIds || parentEvent?.calendarIds || ((tag as any)?.calendarId ? [(tag as any).calendarId] : []),
        syncMode: parentEvent?.subEventConfig?.syncMode || parentEvent?.syncMode,
        location: parentEvent?.location || '',
        description: parentEvent?.description || '计时中的事件',
        eventlog: parentEvent?.eventlog,
        organizer: parentEvent?.organizer,
        attendees: parentEvent?.attendees,
        isAllDay: false,
        createdAt: formatTimeForStorage(startDate),
        updatedAt: formatTimeForStorage(startDate),
        syncStatus: 'local-only', // ✅ 运行中不同步
        fourDNoteSource: true,
        isTimer: true,
        parentEventId
      };
      
      // 立即保存初始事件
      EventService.createEvent(initialEvent, true).then(result => {
        if (result.success) {
          AppLogger.log('✅ [Timer Start] Initial event created:', timerEventId);
        } else {
          AppLogger.error('❌ [Timer Start] Failed to create initial event:', result.error);
        }
      });
      
      const timerState = {
        isRunning: true,
        tagId: tagIdArray[0] || '', // 向后兼容：第一个标签ID
        tagIds: tagIdArray, // 完整的标签数组（可能为空）
        tagName: tag?.name || '未分类',
        tagEmoji: tag?.emoji || '⏱️',
        tagColor: tag?.color || '#9CA3AF',
        startTime: startTime,
        originalStartTime: startTime,
        elapsedTime: 0,
        isPaused: false,
        parentEventId,
        eventId: timerEventId, // ✅ 保存固定 eventId
        eventTitle: parentEvent?.title?.simpleTitle || (typeof parentEvent?.title === 'string' ? parentEvent.title : '') || '' // ✅ 继承父事件标题
      };
      console.log('🎯 [Timer Start] timerState 初始化:', {
        eventId: timerState.eventId,
        eventTitle: timerState.eventTitle,
        'parentEvent.title': parentEvent?.title,
        'parentEvent.title type': typeof parentEvent?.title
      });
      setGlobalTimer(timerState);
      // 💾 持久化到 localStorage，供 Widget 读取
      localStorage.setItem('4dnote-global-timer', JSON.stringify(timerState));
      AppLogger.log('✅ 开始计时', tag?.name || '未分类', parentEventId ? `(关联事件: ${parentEventId})` : '');
  };

  const handleTimerPause = () => {
    if (!globalTimer) return;

    const currentElapsed = globalTimer.elapsedTime + (Date.now() - globalTimer.startTime);
    
    const timerState = {
      ...globalTimer,
      isRunning: false,
      isPaused: true,
      elapsedTime: currentElapsed
    };
    setGlobalTimer(timerState);
    // 💾 持久化暂停状✅
    localStorage.setItem('4dnote-global-timer', JSON.stringify(timerState));

    AppLogger.log('⏸️ 暂停计时');
  };

  const handleTimerResume = () => {
    if (!globalTimer) return;

    const timerState = {
      ...globalTimer,
      isRunning: true,
      isPaused: false,
      startTime: Date.now()
    };
    setGlobalTimer(timerState);
    // 💾 持久化恢复状✅
    localStorage.setItem('4dnote-global-timer', JSON.stringify(timerState));

    AppLogger.log('▶️ 继续计时');
  };

  const handleTimerCancel = () => {
    if (!globalTimer) return;
    
    if (window.confirm('确定要取消计时吗？当前计时将不会被保存在')) {
      AppLogger.log('❌ 取消计时');
      
      // 🔧 使用 EventService 删除 Timer 事件
      try {
        // 使用保存的 eventId，如果没有则跳过删除（说明还未创建事件）
        const timerEventId = globalTimer.eventId;
        
        // 使用 EventService 删除事件（skipSync=true 因为这是取消操作，不需要同步删除）
        if (timerEventId) {
          EventService.deleteEvent(timerEventId, true).then(result => {
            if (result.success) {
              AppLogger.log('❌ [Timer Cancel] Event deleted via EventService:', timerEventId);
            } else {
              AppLogger.error('❌ [Timer Cancel] EventService deletion failed:', result.error);
            }
          });
        }
      } catch (error) {
        AppLogger.error('❌ [Timer Cancel] Failed to delete event:', error);
      }
      
      setGlobalTimer(null);
      // 💾 清除 localStorage 中的 timer 状✅
      localStorage.removeItem('4dnote-global-timer');
    }
  };

  const handleStartTimeChange = (newStartTime: number) => {
    if (!globalTimer) return;
    
    // 验证时间:戳有效✅
    if (!newStartTime || isNaN(newStartTime) || newStartTime <= 0) {
      AppLogger.error('🔧 [App] 无效的开始时间:戳:', newStartTime);
      return;
    }
    
    const now = Date.now();
    
    // 🔧 关键修复：使✅originalStartTime 而不✅startTime
    const oldOriginalStartTime = globalTimer.originalStartTime || globalTimer.startTime;
    
    // 计算用户想要的时间:差
    // 如果提前开始时间:（newStartTime < oldOriginalStartTime），应该增加已计时时✅
    // 如果推迟开始时间:（newStartTime > oldOriginalStartTime），应该减少已计时时✅
    const timeDiff = oldOriginalStartTime - newStartTime; // 正数=提前开始（增加时长），负数=延后开始（减少时长）
    
    AppLogger.log('🔧 [App] 修改开始时间:', {
      旧原始开始时间: new Date(oldOriginalStartTime).toLocaleString(),
      新开始时间: new Date(newStartTime).toLocaleString(),
      时间差毫秒: timeDiff,
      时间差分钟: Math.round(timeDiff / 60000),
      当前elapsedTime毫秒: globalTimer.elapsedTime,
      当前elapsedTime分钟: Math.round(globalTimer.elapsedTime / 60000),
      isRunning: globalTimer.isRunning
    });
    
    if (globalTimer.isRunning) {
      // 计时中：需要考虑当前运行时长
      const currentRunningTime = now - globalTimer.startTime; // 当前这轮运行的时✅
      const totalElapsed = globalTimer.elapsedTime + currentRunningTime; // 总已用时✅
      
      // 调整后的总时长= 原总时长+ 时间:✅
      const adjustedTotalElapsed = Math.max(0, totalElapsed + timeDiff);
      
      // 重新设置计时器，更新 originalStartTime ✅elapsedTime
      setGlobalTimer({
        ...globalTimer,
        startTime: now, // 重置为当前时间:（用于下次计算运行时长✅
        originalStartTime: newStartTime, // 更新真正的开始时✅
        elapsedTime: adjustedTotalElapsed // 调整后的已用时长
      });
      
      AppLogger.log('🔧 [App] 计时中修改结果', {
        当前运行时长毫秒: currentRunningTime,
        原总时长毫秒: totalElapsed,
        调整后总时长毫秒: adjustedTotalElapsed,
        调整后总时长分钟: Math.round(adjustedTotalElapsed / 60000)
      });
    } else {
      // 暂停中：直接调整 elapsedTime ✅originalStartTime
      const adjustedElapsedTime = Math.max(0, globalTimer.elapsedTime + timeDiff);
      
      setGlobalTimer({
        ...globalTimer,
        originalStartTime: newStartTime, // 更新真正的开始时✅
        elapsedTime: adjustedElapsedTime
      });
      
      AppLogger.log('🔧 [App] 暂停中修改结果', {
        旧elapsedTime毫秒: globalTimer.elapsedTime,
        调整后elapsedTime毫秒: adjustedElapsedTime,
        旧elapsedTime分钟: Math.round(globalTimer.elapsedTime / 60000),
        调整后elapsedTime分钟: Math.round(adjustedElapsedTime / 60000)
      });
    }
  };

  const handleTimerStop = async () => {
    if (!globalTimer) return;

    const totalElapsed = globalTimer.elapsedTime + 
      (globalTimer.isRunning ? (Date.now() - globalTimer.startTime) : 0);

    const endTime = new Date();
    const startTime = new Date(globalTimer.originalStartTime || globalTimer.startTime);
    
    AppLogger.log('⏹️ 停止计时，总时长', totalElapsed, 'ms');
    AppLogger.log('⏹️ 计时器信息', {
      tagIds: globalTimer.tagIds,
      tagName: globalTimer.tagName,
      startTime: startTime,
      endTime: endTime,
      duration: totalElapsed,
      parentEventId: globalTimer.parentEventId // 🆕 关联的父事件 ID
    });

    // 🎯 自动创建日历事件
    try {
      // 🆕 支持无标签计时：如果没有标签，使用默认值
      let tag = null;
      if (globalTimer.tagIds && globalTimer.tagIds.length > 0) {
        tag = TagService.getFlatTags().find(t => t.id === globalTimer.tagIds[0]);
        if (!tag) {
          AppLogger.warn('标签未找到，使用默认值创建事件', globalTimer.tagIds[0]);
        }
      }

      // 🔧 [BUG FIX] 必须使用 globalTimer.eventId，否则会创建重复事件
      if (!globalTimer.eventId) {
        AppLogger.error('💾 [Timer Stop] globalTimer.eventId is missing! Cannot save event.');
        return;
      }
      const timerEventId = globalTimer.eventId;
      
      // 🔧 [BUG FIX] 读取现有事件，保留用户的 description 和 location
      const existingEvent = await EventService.getEventById(timerEventId);
      
      // 🆕 [FEATURE] 自动生成标题：如果用户既没有标题也没有标签，生成默认标题
      let eventTitle: string;
      let eventEmoji: string;
      
      const hasUserTitle = globalTimer.eventTitle && globalTimer.eventTitle.trim();
      const hasUserTags = globalTimer.tagIds && globalTimer.tagIds.length > 0;
      
      if (!hasUserTitle && !hasUserTags) {
        // 用户没有输入任何内容 → 生成默认标题 "专注计时2025-11-16 13:35:44"
        // 🔧 使用 formatTimeForStorage 确保时间格式一致
        const timeStr = formatTimeForStorage(startTime); // "2025-11-16 13:35:44"
        eventTitle = `专注计时${timeStr}`;
        eventEmoji = '⏱️';
      } else {
        // 用户有输入 → 使用用户的标题或标签名称
        eventTitle = globalTimer.eventTitle || (tag?.emoji ? `${tag.emoji} ${tag.name}` : globalTimer.tagName);
        eventEmoji = globalTimer.eventEmoji || tag?.emoji || '⏱️';
      }
      
      // 🔧 [BUG FIX] 生成计时签名，但不覆盖用户的 description
      const timerSignature = `[⏱️ 计时 ${Math.floor(totalElapsed / 60000)} 分钟]`;
      let finalDescription = existingEvent?.description || '';
      
      // 如果 description 已经有计时签名，更新签名；否则追加签名
      if (finalDescription.includes('[⏱️ 计时')) {
        // 替换旧签名为新签名
        finalDescription = finalDescription.replace(/\[⏱️ 计时 \d+ 分钟\]/, timerSignature);
      } else if (finalDescription && finalDescription !== '计时中的事件' && finalDescription !== '计时事件（已自动保存）') {
        // 用户有自定义内容，追加签名
        finalDescription = finalDescription + '\n' + timerSignature;
      } else {
        // 没有用户内容，使用签名作为默认内容
        finalDescription = timerSignature;
      }
      
      // 🔧 如果有父事件，继承父事件的最新元数据
      let currentParentEvent = null;
      if (globalTimer.parentEventId) {
        currentParentEvent = await EventService.getEventById(globalTimer.parentEventId);
        console.log('🔗 [Timer Stop] 读取父事件最新元数据:', {
          parentEventId: globalTimer.parentEventId,
          found: !!currentParentEvent,
          title: currentParentEvent?.title,
          tags: currentParentEvent?.tags,
          calendarIds: currentParentEvent?.calendarIds,
          syncMode: currentParentEvent?.syncMode,
          eventlog: currentParentEvent?.eventlog
        });
      } else {
        console.log('⚠️ [Timer Stop] globalTimer 没有 parentEventId');
      }
      
      // 🔧 复用同一个 eventId，更新状态为 pending 以触发同步
      // 🔧 Timer 作为系统性子事件，应从 currentParentEvent.subEventConfig 继承配置
      const finalEvent: Event = {
        id: timerEventId, // ✅ 复用启动时创建的 ID
        title: currentParentEvent?.title || { simpleTitle: eventTitle }, // ✅ 继承父事件标题
        emoji: currentParentEvent?.emoji || eventEmoji,
        startTime: formatTimeForStorage(startTime),
        endTime: formatTimeForStorage(new Date(startTime.getTime() + totalElapsed)),
        tags: currentParentEvent?.tags || globalTimer.tagIds || [],
        // ✅ 系统性子事件：从 subEventConfig 继承（fallback 到父事件配置）
        calendarIds: currentParentEvent?.subEventConfig?.calendarIds || currentParentEvent?.calendarIds || ((tag as any)?.calendarId ? [(tag as any).calendarId] : []),
        syncMode: currentParentEvent?.subEventConfig?.syncMode || currentParentEvent?.syncMode,
        location: currentParentEvent?.location || existingEvent?.location || '',
        description: finalDescription,
        eventlog: currentParentEvent?.eventlog || existingEvent?.eventlog,
        organizer: currentParentEvent?.organizer,
        attendees: currentParentEvent?.attendees,
        isAllDay: false,
        fourDNoteSource: true,
        syncStatus: 'pending' as const, // ✅ Timer 停止后改为 pending，触发同步
        isTimer: true,
        parentEventId: globalTimer.parentEventId,
        createdAt: existingEvent?.createdAt || formatTimeForStorage(startTime),
        updatedAt: formatTimeForStorage(new Date())
      };

      // 🔧 Issue #10 修复：如果是 Plan Item，只更新 duration，不覆盖 startTime/endTime
      // 如果存在已有事件且标记为 isPlan，则只更新特定字段
      const updateData: Partial<Event> = existingEvent?.isPlan ? {
        // Plan Item：只更新 duration 和描述，保留原有的计划时间
        description: finalDescription,
        syncStatus: 'pending' as const,
        isTimer: true, // ✅ 保留 isTimer 标记（子事件）
        parentEventId: globalTimer.parentEventId, // ✅ 保留父事件关联
        updatedAt: formatTimeForStorage(new Date())
      } : finalEvent; // Timer 事件：更新完整数据

      // 🔧 使用 EventService 统一管理事件创建和同步
      AppLogger.log('💾 [Timer Stop] Using EventService to create/update event', {
        isPlan: existingEvent?.isPlan,
        updateFields: Object.keys(updateData),
        parentEventId: globalTimer.parentEventId,
        existingIsTimer: existingEvent?.isTimer,
        updateDataIsTimer: (updateData as any).isTimer
      });
      const result = await EventService.updateEvent(timerEventId, updateData as Event);
      
      if (result.success) {
        AppLogger.log('💾 [Timer Stop] Event saved via EventService:', timerEventId);
        
        // 🆕 Issue #12: 更新父事件的 childEventIds
        if (globalTimer.parentEventId) {
          const parentEvent = await EventService.getEventById(globalTimer.parentEventId);
          console.log('📝 [Timer Stop] 准备更新父事件 childEventIds:', {
            parentEventId: globalTimer.parentEventId,
            parentEventFound: !!parentEvent,
            currentChildEventIds: parentEvent?.childEventIds,
            timerEventId,
            hasParentEventId: !!globalTimer.parentEventId,
            globalTimer
          });
          if (parentEvent) {
            // 🔧 避免重复添加：检查 timerEventId 是否已存在
            const currentChildEventIds = parentEvent.childEventIds || [];
            if (currentChildEventIds.includes(timerEventId)) {
              console.log('⚠️ [Timer Stop] timerEventId 已存在于 childEventIds，跳过添加:', timerEventId);
            } else {
              const updatedChildEventIds = [...currentChildEventIds, timerEventId];
              console.log('📝 [Timer Stop] 调用 EventService.updateEvent 前:', {
                parentId: globalTimer.parentEventId,
                oldChildEventIds: parentEvent.childEventIds,
                newChildEventIds: updatedChildEventIds,
                updatePayload: {
                  childEventIds: updatedChildEventIds,
                  updatedAt: formatTimeForStorage(new Date())
                }
              });
            
              const updateResult = await EventService.updateEvent(globalTimer.parentEventId, {
                childEventIds: updatedChildEventIds,
                updatedAt: formatTimeForStorage(new Date())
              } as Partial<Event>);
              
              console.log('📝 [Timer Stop] EventService.updateEvent 返回:', updateResult);
              
              // 验证更新是否成功
              const verifyParent = await EventService.getEventById(globalTimer.parentEventId);
              console.log('✅ [Timer Stop] 验证父事件 childEventIds:', {
                parentId: globalTimer.parentEventId,
                childEventIds: verifyParent?.childEventIds,
                updateSuccessful: updateResult.success,
                expectedCount: updatedChildEventIds.length,
                actualCount: verifyParent?.childEventIds?.length || 0
              });
            }
          } else {
            console.error('❌ [Timer Stop] 找不到父事件:', globalTimer.parentEventId);
          }
        } else {
          console.log('⚠️ [Timer Stop] 没有 parentEventId，跳过 childEventIds 更新');
        }
        
        // ✅ 不需要手动 setAllEvents，storage 监听器会自动更新
        // EventService.updateEvent 内部会触发 storage 变化事件
      } else {
        AppLogger.error('💾 [Timer Stop] EventService failed:', result.error);
      }

      // ✅立即切换到时间页面
      setCurrentPage('time');
    } catch (error) {
      AppLogger.error('💾 [Timer Stop] 保存事件失败:', error);
    }
    
    // 清除计时器状态
    setGlobalTimer(null);
    // 💾 清除 localStorage 中的 timer 状态
    localStorage.removeItem('4dnote-global-timer');
  };

  // 打开计时器事件编辑框
  const handleTimerEdit = async () => {
    // 🔧 [PERFORMANCE FIX] 移除不必要的 appTags 检查
    // TagService 已经初始化，直接使用即可
    
    // 🔧 [BUG FIX] 只允许编辑已存在的Timer，不创建临时event
    if (!globalTimer) {
      // 如果没有运行中的Timer，打开空的编辑框让用户选择tag
      const now = new Date();
      const tempEvent: Event = {
        id: '', // 🔧 使用空ID，表示这是新Timer
        title: { simpleTitle: '' },
        startTime: formatTimeForStorage(now),
        endTime: formatTimeForStorage(new Date(now.getTime() + 3600000)), // 默认1小时
        tags: [],
        description: '',
        isAllDay: false,
        fourDNoteSource: true,
        isTimer: true,
        createdAt: formatTimeForStorage(new Date()),
        updatedAt: formatTimeForStorage(new Date())
      };

      setTimerEditModal({
        isOpen: true,
        event: tempEvent
      });
      return;
    }

    // 如果有计时器，使用当前计时器信息
    const tag = TagService.getFlatTags().find(t => t.id === globalTimer.tagIds[0]);

    // 创建临时事件对象供编辑
    const totalElapsed = globalTimer.elapsedTime + 
      (globalTimer.isRunning ? (Date.now() - globalTimer.startTime) : 0);
    const endTime = new Date();
    const startTime = new Date(globalTimer.originalStartTime || globalTimer.startTime);
    
    // 🔧 [BUG FIX] 必须使用 globalTimer.eventId，否则会创建重复事件
    if (!globalTimer.eventId) {
      AppLogger.error('💾 [Timer Edit] globalTimer.eventId is missing! Cannot save event.');
      return;
    }
    const timerEventId = globalTimer.eventId;
    
    // 🔧 [BUG FIX] 从 EventService 读取现有事件，保留 description 和其他字段
    const existingEvent = await EventService.getEventById(timerEventId);

    const tempEvent: Event = {
      id: timerEventId,
      title: { simpleTitle: globalTimer.eventTitle || (tag?.name || '') }, // ✅ 只传 simpleTitle
      startTime: formatTimeForStorage(startTime),
      endTime: formatTimeForStorage(endTime),
      tags: globalTimer.tagIds, // 使用完整的标签数组
      description: existingEvent?.description || '', // 🔧 保留用户输入的 description
      location: existingEvent?.location || '', // 🔧 保留 location
      isAllDay: false,
      fourDNoteSource: true,
      isTimer: true,
      syncStatus: 'local-only', // 🔧 [BUG FIX] 运行中的 Timer 标记为 local-only
      createdAt: existingEvent?.createdAt || formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    };

    setTimerEditModal({
      isOpen: true,
      event: tempEvent
    });
  };

  // 保存计时器事件编✅
  const handleTimerEditSave = async (updatedEvent: Event) => {
    // 提取emoji（使用Array.from正确处理多字节字符）
    const titleChars = Array.from(updatedEvent.title?.simpleTitle || '');
    const firstChar = titleChars.length > 0 ? titleChars[0] : '';
    
    // 🔧 如果没有计时器，创建新的计时✅
    if (!globalTimer) {
      // 必须选择至少一个标✅
      if (!updatedEvent.tags || updatedEvent.tags.length === 0) {
        alert('请至少选择一个标签');
        return;
      }

      const tagId = updatedEvent.tags[0];
      const tag = TagService.getFlatTags().find(t => t.id === tagId);
      
      if (!tag) {
        alert('标签不存在');
        return;
      }

      // 确定计时起始时间
      // 🔧 [BUG FIX] 默认使用点击确定时的当前时间
      const confirmTime = new Date(); // 用户点击确定的时刻
      
      // ✅ v1.8: 处理 startTime 可能为 undefined
      const eventStartTime = updatedEvent.startTime 
        ? new Date(updatedEvent.startTime) 
        : confirmTime;
      
      const timeDiff = Math.abs(confirmTime.getTime() - eventStartTime.getTime());
      const useEventTime = timeDiff > 60000; // 超过1分钟认为用户手动修改了时间
      
      // 如果用户手动修改了开始时间，使用用户设置的时间；否则使用点击确定时的时间
      const finalStartTime = useEventTime ? eventStartTime : confirmTime;
      const timerStartTime = finalStartTime.getTime();

      AppLogger.log('🔧 [Timer Init] Determining start time:', {
        eventStartTime: formatTimeForStorage(eventStartTime),
        confirmTime: formatTimeForStorage(confirmTime),
        timeDiff: `${(timeDiff / 1000).toFixed(1)}s`,
        useEventTime,
        finalStartTime: formatTimeForStorage(finalStartTime)
      });

      // 🔧 [关键修复] 使用真实事件ID，与 useEffect 中的ID保持一致
      const realTimerEventId = `timer-${tagId}-${finalStartTime.getTime()}`;
      
      // 🔧 使用 EventService 创建真实事件（使用真实ID），防止重复
      const eventTitle = updatedEvent.title || { simpleTitle: tag.emoji ? `${tag.emoji} ${tag.name}` : tag.name };
      const timerEvent: Event = {
        id: realTimerEventId, // 使用真实ID
        title: eventTitle,
        startTime: formatTimeForStorage(finalStartTime),
        endTime: formatTimeForStorage(confirmTime), // 初始结束时间为点击确定的时间
        tags: [tagId], // 使用标签数组
        calendarIds: (tag as any).calendarId ? [(tag as any).calendarId] : [], // 转换为数组格式
        location: '',
        description: '计时中的事件',
        isAllDay: false,
        createdAt: formatTimeForStorage(finalStartTime),
        updatedAt: formatTimeForStorage(confirmTime),
        syncStatus: 'local-only', // 运行中不同步
        fourDNoteSource: true,
        isTimer: true
      };

      // 使用 EventService 创建事件（skipSync=true，运行中不同步）
      const result = await EventService.createEvent(timerEvent, true);
      if (result.success) {
        AppLogger.log('🔧 [Timer Init] Event created via EventService:', realTimerEventId);
      } else {
        AppLogger.error('🔧 [Timer Init] EventService failed:', result.error);
      }

      // 创建新的计时器（支持多标签）
      setGlobalTimer({
        isRunning: true,
        tagId: (updatedEvent.tags || [tagId])[0], // 🔧 向后兼容：第一个标签ID
        tagIds: updatedEvent.tags || [tagId], // 🆕 完整的标签数组
        tagName: tag.name, // 保留第一个标签的名称用于显示
        tagEmoji: tag.emoji, // 保留第一个标签的emoji用于显示
        tagColor: tag.color, // 保留第一个标签的颜色用于显示
        startTime: timerStartTime,
        originalStartTime: timerStartTime, // 使用最终确定的开始时间
        elapsedTime: 0,
        isPaused: false,
        eventEmoji: firstChar,
        eventTitle: updatedEvent.title?.simpleTitle || tag.name,
        eventId: realTimerEventId // 🔧 [BUG FIX] 保存事件ID，供 handleTimerEdit 使用
      });

      setTimerEditModal({
        isOpen: false,
        event: null
      });
      
      AppLogger.log('✅开始新计时:', updatedEvent.title || tag.name);
      return;
    }

    // 更新现有计时器中的自定义内容（支持多标签）
    const possibleEmoji = firstChar && firstChar.length > 0 ? firstChar : globalTimer.eventEmoji;
    
    // 检查标签是否改变
    const tagsChanged = updatedEvent.tags && 
      (updatedEvent.tags.length !== globalTimer.tagIds.length || 
       !updatedEvent.tags.every((tag, index) => tag === globalTimer.tagIds[index]));
    
    setGlobalTimer({
      ...globalTimer,
      eventTitle: updatedEvent.title?.simpleTitle || '',
      eventEmoji: possibleEmoji,
      // 如果标签改变了，更新标签数组及第一个标签的显示信息
      ...(tagsChanged ? (() => {
        const newTag = TagService.getFlatTags().find(t => t.id === updatedEvent.tags![0]);
        return {
          tagId: updatedEvent.tags![0], // 🔧 向后兼容：第一个标签ID
          tagIds: updatedEvent.tags!, // 🆕 完整的标签数组
          tagName: newTag?.name || globalTimer.tagName,
          tagEmoji: newTag?.emoji || globalTimer.tagEmoji,
          tagColor: newTag?.color || globalTimer.tagColor
        };
      })() : {})
    });

    // 🔧 [BUG FIX] 立即保存用户编辑的字段 (使用 EventService 以支持 eventlog 自动转换)
    if (globalTimer.eventId) {
      try {
        // ✅ 使用 EventService.updateEvent 以触发 eventlog → EventLog 对象转换
        await EventService.updateEvent(globalTimer.eventId, {
          description: updatedEvent.description,
          eventlog: updatedEvent.eventlog,  // EventService 会自动转换 Slate JSON → EventLog 对象
          location: updatedEvent.location,
          title: updatedEvent.title,
        }, true); // skipSync = true
        
        AppLogger.log('💾 [Timer Edit] Saved user edits via EventService:', {
          eventId: globalTimer.eventId,
          hasEventlog: !!updatedEvent.eventlog,
          eventlogType: typeof updatedEvent.eventlog,
          eventlogPreview: typeof updatedEvent.eventlog === 'string' 
            ? updatedEvent.eventlog.substring(0, 50)
            : JSON.stringify(updatedEvent.eventlog).substring(0, 50),
          location: updatedEvent.location
        });
      } catch (error) {
        AppLogger.error('💾 [Timer Edit] Failed to save user edits:', error);
      }
    }

    setTimerEditModal({
      isOpen: false,
      event: null
    });
  };

  // 初始化效✅
  useEffect(() => {
    loadAppSettings();
    // ✅ loadAvailableTagsForEdit 已移至 TagService 初始化后调用（App 初始化 useEffect）
  }, []);

  // ✅ Timer 自动保存：运行中每30秒更新同一个事件（syncStatus: 'local-only'）
  useEffect(() => {
    if (!globalTimer || !globalTimer.isRunning || globalTimer.isPaused) {
      return;
    }

    const saveTimerEvent = async () => {
      try {
        let tag = null;
        if (globalTimer.tagIds && globalTimer.tagIds.length > 0) {
          tag = TagService.getFlatTags().find(t => t.id === globalTimer.tagIds[0]);
        }

        const now = Date.now();
        const totalElapsed = globalTimer.elapsedTime + (now - globalTimer.startTime);
        const startTime = new Date(globalTimer.originalStartTime || globalTimer.startTime);
        const endTime = new Date(startTime.getTime() + totalElapsed);

        // ✅ 使用固定的 eventId（handleTimerStart 时创建）
        if (!globalTimer.eventId) {
          AppLogger.error('💾 [Timer] globalTimer.eventId is missing! Cannot save event.');
          return;
        }
        const timerEventId = globalTimer.eventId;
        
        const eventTitle = globalTimer.eventTitle || (tag?.emoji ? `${tag.emoji} ${tag.name}` : globalTimer.tagName);
        
        // 读取现有事件，保留用户编辑的字段（description、location、eventlog）
        const existingEvent = await EventService.getEventById(timerEventId);
        
        const timerEvent: Event = {
          id: timerEventId, // ✅ 固定 ID，整个运行过程不变
          title: { simpleTitle: eventTitle }, // ✅ 只传 simpleTitle
          startTime: formatTimeForStorage(startTime),
          endTime: formatTimeForStorage(endTime),
          location: existingEvent?.location || '',
          description: existingEvent?.description || '计时中的事件',
          eventlog: existingEvent?.eventlog,  // ✅ 保留用户编辑的 eventlog
          tags: globalTimer.tagIds,
          calendarIds: tag && (tag as any).calendarId ? [(tag as any).calendarId] : [],
          isAllDay: false,
          createdAt: existingEvent?.createdAt || formatTimeForStorage(startTime),
          updatedAt: formatTimeForStorage(new Date()),
          syncStatus: 'local-only', // ✅ 运行中保持 local-only，不触发同步
          fourDNoteSource: true,
          isTimer: true
        };

        // ✅ 使用 EventService 更新事件（已迁移到 StorageManager，existingEvent 已在上面加载）
        if (!existingEvent) {
          await EventService.createEvent(timerEvent, true); // skipSync=true 避免同步运行中的 Timer
          AppLogger.log('💾 [Timer Auto-save] Created timer event:', timerEventId);
        } else {
          await EventService.updateEvent(timerEventId, timerEvent, true); // skipSync=true
          AppLogger.log('🔄 [Timer Auto-save] Updated timer event:', timerEventId);
        }
        
        // 🔇 运行中静默保存，StorageManager 已处理持久化
      } catch (error) {
        AppLogger.error('💾 [Timer] Failed to save timer event:', error);
      }
    };

    // 立即保存一✅
    saveTimerEvent();

    // 🔧 ✅0秒保存一次（降低频率，减少性能影响✅
    const saveInterval = setInterval(saveTimerEvent, 30000);

    // 清理函数
    return () => {
      clearInterval(saveInterval);
    };
  }, [globalTimer]);

  // 🔧 [NEW] 断点保护 - 页面关闭/刷新时保✅Timer
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (globalTimer && globalTimer.isRunning && !globalTimer.isPaused) {
        // 保存最后一次状态
        try {
          // 🆕 支持无标签计时
          let tag = null;
          if (globalTimer.tagIds && globalTimer.tagIds.length > 0) {
            tag = TagService.getFlatTags().find(t => t.id === globalTimer.tagIds[0]);
          }

          const now = Date.now();
          const totalElapsed = globalTimer.elapsedTime + (now - globalTimer.startTime);
          const startTime = new Date(globalTimer.originalStartTime || globalTimer.startTime);
          const endTime = new Date(startTime.getTime() + totalElapsed);
          
          // 🔧 [BUG FIX] 必须使用 globalTimer.eventId，否则会创建重复事件
          if (!globalTimer.eventId) {
            AppLogger.error('💾 [Page Switch] globalTimer.eventId is missing! Cannot save event.');
            return;
          }
          const timerEventId = globalTimer.eventId;
          
          const eventTitle = globalTimer.eventTitle || (tag?.emoji ? `${tag.emoji} ${tag.name}` : globalTimer.tagName);
          
          // ⚠️ beforeunload 必须同步执行，使用 EventService 的同步保存（StorageManager 会在下次启动时同步）
          // 创建事件对象（新事件）
          const timerEvent: Event = {
            id: timerEventId,
            title: { simpleTitle: eventTitle }, // 保存时移除"[专注中]"标记
            startTime: formatTimeForStorage(startTime),
            endTime: formatTimeForStorage(endTime),
            location: '',
            description: '计时事件（已自动保存）',
            tags: globalTimer.tagIds, // 使用完整的标签数组
            calendarIds: tag && (tag as any).calendarId ? [(tag as any).calendarId] : [], // 转换为数组格式，无标签时为空数组
            isAllDay: false,
            createdAt: formatTimeForStorage(startTime),
            updatedAt: formatTimeForStorage(new Date()),
            syncStatus: 'local-only', // 🔧 [BUG FIX] 页面刷新时仍保持local-only，不同步运行中的Timer
            fourDNoteSource: true
          };

          // ⚠️ 使用 localStorage 直接保存（因为 beforeunload 不支持 async）
          // StorageManager 会在下次应用启动时读取并迁移到 IndexedDB
          try {
            const rawEvents = localStorage.getItem(STORAGE_KEYS.EVENTS);
            const events: Event[] = rawEvents ? JSON.parse(rawEvents) : [];
            const eventIndex = events.findIndex(e => e.id === timerEventId);
            
            if (eventIndex === -1) {
              events.push(timerEvent);
            } else {
              events[eventIndex] = timerEvent;
            }
            
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
            AppLogger.log('💾 [Timer] Saved timer event before unload (sync):', timerEventId);
          } catch (lsError) {
            AppLogger.error('💾 [Timer] localStorage save failed:', lsError);
          }
        } catch (error) {
          AppLogger.error('💾 [Timer] Failed to save on unload:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [globalTimer]);

  // ❌ [REMOVED] formatTime() - 从未使用的函数
  // ❌ [REMOVED] getTodayTotalTime() - 从未使用的函数

  // ==================== Plan 相关事件管理 ====================
  
  // 🔧 Plan页面直接使用Event，通过isPlan标记过滤
  // 不再需要单独的PlanItem状态
  
  // 保存 Plan Event
  const handleSavePlanItem = useCallback(async (item: Event) => {
    // 标记为 Plan 事件
    const planEvent: Event = {
      ...item,
      isPlan: true,
      updatedAt: formatTimeForStorage(new Date()),
    };
    
    // 🔧 [BUG FIX] 空行（刚点击graytext创建的行）不保存到EventService
    // 只保存到本地状态（items数组），等用户输入内容后再真正创建event
    if (!item.title || !item.title.simpleTitle?.trim()) {
      // 空标题，只更新本地状态，不调用EventService
      AppLogger.log('⏭️ [App] 跳过空行保存（等待用户输入）', item.id);
      return;
    }
    
    // 🔧 [BUG FIX] 检查事件是否已存在，新事件用 createEvent，已有事件用 updateEvent
    // 🆕 传递来源信息，防止循环更新
    const existingEvent = await EventService.getEventById(item.id);
    const sourceOptions = {
      originComponent: 'PlanManager' as const,
      source: 'user-edit' as const
    };
    
    const result = existingEvent 
      ? await EventService.updateEvent(item.id, planEvent, false, sourceOptions)
      : await EventService.createEvent(planEvent, false, sourceOptions);
    
    if (result.success) {
      // ✅ 不需要手动刷新 - EventService 已触发 eventsUpdated 事件
      // App.tsx 的 useEffect 会监听该事件并增量更新 allEvents
      AppLogger.log('💾 [App] 保存 Plan 事件', item.title);
    } else {
      AppLogger.error('❌ [App] 保存 Plan 事件失败', result.error);
    }
  }, []);

  // 删除 Plan Event
  const handleDeletePlanItem = useCallback(async (id: string) => {
    const result = await EventService.deleteEvent(id);
    if (result.success) {
      // ✅ 不需要手动刷新 - EventService 已触发 eventsUpdated 事件
      AppLogger.log('🗑️ [App] 删除 Plan 事件', id);
    } else {
      AppLogger.error('❌ [App] 删除 Plan 事件失败', result.error);
    }
  }, []);

  // 创建 UnifiedTimeline Event
  const handleCreateEvent = useCallback(async (event: Event) => {
    const result = await EventService.createEvent(event);
    if (result.success) {
      // ✅ 不需要手动刷新 - EventService 已触发 eventsUpdated 事件
      AppLogger.log('🔧 [App] Event created via EventService:', event.title);
    } else {
      AppLogger.error('🔧 [App] EventService failed:', result.error);
    }
  }, []);

  // 更新 UnifiedTimeline Event
  const handleUpdateEvent = useCallback(async (eventId: string, updates: Partial<Event>) => {
    // 🔧 [BUG FIX] 检查事件是否存在，不存在则创建
    const existingEvent = await EventService.getEventById(eventId);
    const result = existingEvent
      ? await EventService.updateEvent(eventId, updates)
      : await EventService.createEvent({ ...updates, id: eventId } as Event);
    
    if (result.success) {
      // ✅ 不需要手动刷新 - EventService 已触发 eventsUpdated 事件
      AppLogger.log('🔧 [App] Event updated via EventService:', eventId);
    } else {
      AppLogger.error('🔧 [App] EventService failed:', result.error);
    }
  }, []);

  // ==================== End Plan 管理 ====================

  // ❌ [REMOVED] stopTimer, startTimer, pauseTimer - 旧的计时器系统已被 globalTimer 替代
  // ❌ [REMOVED] 计时器 useEffect - 旧的 setInterval 逻辑已不再使用

  // 全局计时器效✅- 强制UI更新以显示实时时✅
  useEffect(() => {
    let updateInterval: NodeJS.Timeout | null = null;
    
    if (globalTimer?.isRunning) {
      // 每秒强制更新一次以显示实时时间:
      updateInterval = setInterval(() => {
        // 触发重新渲染
        setGlobalTimer(prev => prev ? { ...prev } : null);
      }, 1000);
    }

    return () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  }, [globalTimer?.isRunning]);

  // ❌ [REMOVED] 加载历史会话 - timerSessions 已移除

  // 监听认证状态变化并初始化同步管理器
  useEffect(() => {
    // 🔧 [FIX] 不要在依赖数组中调用函数，会导致每次渲染都触发
    const currentAuthState = microsoftService?.isSignedIn() || false;
    
    console.log('🔍 [App] Auth check useEffect triggered:', {
      currentAuthState,
      lastAuthState,
      hasSyncManager: !!syncManager,
      microsoftServiceExists: !!microsoftService,
      isSignedInMethod: typeof microsoftService?.isSignedIn,
    });
    
    // 🔧 额外调试：直接检查 microsoftService 的内部状态
    if (microsoftService) {
      console.log('🔍 [App] microsoftService 内部状态:', {
        isAuthenticated: (microsoftService as any).isAuthenticated,
        hasAccessToken: !!(microsoftService as any).accessToken,
        simulationMode: (microsoftService as any).simulationMode,
      });
    }
    
    // 💾 同步认证状态到 localStorage（供 Widget 读取）
    try {
      localStorage.setItem('4dnote-outlook-authenticated', currentAuthState.toString());
      AppLogger.log('💾 [AUTH] Saved auth status to localStorage:', currentAuthState);
    } catch (error) {
      AppLogger.error('❌ [AUTH] Failed to save auth status:', error);
    }
    
    // 🔧 修复：无论状态是否变化，只要已登录且没有 syncManager，就初始化
    if (currentAuthState && !syncManager) {
      // ✨ 防止 React 严格模式下重复创建
      if (syncManagerCreationRef.current) {
        console.log('⏭️ [App] SyncManager 正在创建中，跳过重复创建');
        return;
      }
      
      syncManagerCreationRef.current = true;
      AppLogger.log('🚀 用户已登录，初始化同步管理器...');
      
      // 使用立即执行的异步函数（useEffect 不能直接是 async）
      (async () => {
        try {
          console.log('🔍 [App] 开始创建 ActionBasedSyncManager...');
          const newSyncManager = new ActionBasedSyncManager(microsoftService);
          console.log('🔍 [App] ActionBasedSyncManager 创建成功:', newSyncManager);
          console.log('🔍 [App] forceSync 方法:', typeof newSyncManager.forceSync);
          
          // 🔧 初始化 EventService（在 setSyncManager 之前）
          EventService.initialize(newSyncManager);
          
          // 🧹 检查并清理历史记录（防止 localStorage 溢出）
          const { EventHistoryService } = await import('./services/EventHistoryService');
          EventHistoryService.checkAndCleanup();
          
          // 启动同步管理器（会延迟5秒后执行首次同步）
          newSyncManager.start();
          AppLogger.log('✅ 同步管理器初始化成功（首次同步延迟5秒）');
          AppLogger.log('✅ EventService 初始化成功');
          
          // 暴露到全局用于调试
          if (typeof window !== 'undefined') {
            (window as any).syncManager = newSyncManager;
            console.log('🔍 [App] syncManager 已暴露到 window.syncManager');
          }
          
          // ✅ 最后设置 syncManager（触发 useEffect 重新执行，但此时已有 syncManager，会跳过创建）
          // ⚠️ 注意：不要在这里重置 syncManagerCreationRef.current，应该在 cleanup 中重置
          setSyncManager(newSyncManager);
        } catch (error) {
          AppLogger.error('❌ 同步管理器初始化失败:', error);
          console.error('❌ [App] 详细错误:', error);
          syncManagerCreationRef.current = false; // 重置标志以便重试
        }
      })();
    } else if (!currentAuthState && syncManager) {
      // 用户登出，停止同步管理器
      AppLogger.log('⏸️ 用户已登出，停止同步管理器...');
      syncManager.stop();
      setSyncManager(null);
    } else if (currentAuthState && syncManager && !syncManagerCreationRef.current) {
      // 🔧 [HMR FIX] HMR 后 syncManager 引用变化，重新初始化 EventService
      // 注意：只在非创建期间执行（避免重复初始化）
      console.log('🔍 [App] HMR detected, re-initializing EventService with existing syncManager...');
      EventService.initialize(syncManager);
      console.log('✅ [App] EventService re-initialized after HMR');
    } else {
      console.log('🔍 [App] 跳过初始化:', {
        hasAuth: currentAuthState,
        hasSyncManager: !!syncManager,
        isCreating: syncManagerCreationRef.current
      });
    }
    
    // 更新 lastAuthState
    if (currentAuthState !== lastAuthState) {
      setLastAuthState(currentAuthState);
    }
    
    // ✨ Cleanup: 组件卸载时停止 SyncManager
    return () => {
      // 🔧 [STRICT MODE FIX] 只在真正停止 SyncManager 时重置标志位
      // 避免 React 严格模式双重渲染时误重置导致创建多个实例
      if (syncManager && typeof syncManager.stop === 'function') {
        console.log('🧹 [App] Cleaning up SyncManager on unmount');
        syncManager.stop();
        syncManagerCreationRef.current = false; // 只在停止时重置
      }
    };
  }, [microsoftService, lastAuthState, syncManager]);  // 🔧 [HMR FIX] 保留 syncManager 依赖，但通过标志位避免重复创建

  // 🔐 监听全局认证状态变化事件（登录成功后触发）
  useEffect(() => {
    const handleAuthChange = (event: globalThis.Event) => {
      const customEvent = event as CustomEvent;
      const { isAuthenticated } = customEvent.detail;
      
      console.log('🔍 [App] auth-state-changed event:', isAuthenticated);
      
      if (isAuthenticated && !syncManager) {
        // 强制更新 lastAuthState，触发上面的 useEffect
        setLastAuthState(prev => !prev); // 切换状态强制触发
        setTimeout(() => setLastAuthState(isAuthenticated), 0);
      }
    };
    
    window.addEventListener('auth-state-changed', handleAuthChange);
    return () => window.removeEventListener('auth-state-changed', handleAuthChange);
  }, [syncManager]);

  // 🔄 定期更新 lastSyncTime（与 DesktopCalendarWidget 保持一致）
  useEffect(() => {
    if (!syncManager) return;
    
    const updateSyncTime = () => {
      try {
        const time = syncManager.getLastSyncTime?.();
        if (time) {
          setLastSyncTime(time);
        }
      } catch (error) {
        AppLogger.error('🔧 [App] 获取同步时间:失败:', error);
      }
    };
    
    // 立即更新一✅
    updateSyncTime();
    
    // ✅0秒更新一✅
    const syncTimeInterval = setInterval(updateSyncTime, 10000);
    
    return () => clearInterval(syncTimeInterval);
  }, [syncManager]);

  // 保存事件更改
  const saveEventChanges = async () => {
    if (!editingEventId) return;
    
    try {
      // 这里应该调用事件更新API
      AppLogger.log('保存事件更改:', {
        id: editingEventId,
        title: editingEventTitle,
        description: editingEventDescription,
        tagIds: editingEventTagIds
      });
      
      setShowEventEditModal(false);
    } catch (error) {
      AppLogger.error('保存事件失败:', error);
    }
  };

  // 处理设置变化的回✅
  const handleSettingsChange = (settingKey: string, value: any) => {
    saveAppSettings({ [settingKey]: value });
  };

  // ❌ [REMOVED] getCurrentTimerSeconds() - 未使用的函数，globalTimer 已提供完整的时间信息

  // 获取层级标签的完整路径（例如✅Parent/#Child✅
  // 🚀 [OPTIMIZED] 使用 useCallback 缓存标签路径计算函数
  const getHierarchicalTagPath = useCallback((tagId: string): string => {
    const flatTags = TagService.getFlatTags();
    const tag = flatTags.find(t => t.id === tagId);
    
    if (!tag) return '';
    
    // 🔧 [PERFORMANCE] 仅在 DEV 模式输出调试日志
    if (process.env.NODE_ENV === 'development') {
      AppLogger.log('🏷️[getHierarchicalTagPath] Tag info:', {
        tagId,
        tagName: tag.name,
        emoji: tag.emoji,
        parentId: tag.parentId,
        level: (tag as any).level,
        allTags: flatTags.map(t => ({ 
          id: t.id, 
          name: t.name, 
          parentId: t.parentId,
          level: (t as any).level 
        }))
      });
    }
    
    // 构建层级路径，包含emoji
    const pathParts: { emoji?: string; name: string }[] = [];
    let currentTag = tag;
    
    while (currentTag) {
      pathParts.unshift({
        emoji: currentTag.emoji,
        name: currentTag.name
      });
      
      if (process.env.NODE_ENV === 'development') {
        AppLogger.log('🔗 [getHierarchicalTagPath] Processing tag:', {
          id: currentTag.id,
          name: currentTag.name,
          emoji: currentTag.emoji,
          parentId: currentTag.parentId,
          pathSoFar: pathParts.map(p => `${p.emoji}${p.name}`).join('/')
        });
      }
      
      if (currentTag.parentId) {
        const parentTag = flatTags.find(t => t.id === currentTag.parentId) as any;
        if (parentTag) {
          if (process.env.NODE_ENV === 'development') {
            AppLogger.log('🔗 [getHierarchicalTagPath] Found parent:', {
              parentId: parentTag.id,
              parentName: parentTag.name,
              parentEmoji: parentTag.emoji
            });
          }
          currentTag = parentTag;
        } else {
          if (process.env.NODE_ENV === 'development') {
            AppLogger.warn('⚠️ [getHierarchicalTagPath] Parent not found:', currentTag.parentId);
          }
          break;
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          AppLogger.log('🔚 [getHierarchicalTagPath] No parent, stopping');
        }
        break;
      }
    }
    
    const result = pathParts.map(part => `#${part.emoji || ''}${part.name}`).join('/');
    if (process.env.NODE_ENV === 'development') {
      AppLogger.log('🔗 [getHierarchicalTagPath] Final path:', result);
    }
    return result;
  }, []); // 🔧 空依赖数组，TagService.getFlatTags() 总是返回最新数据
  
  // 🚀 [NEW] 缓存当前 Timer 的标签路径，只在 tagIds 变化时重新计算
  const timerTagPath = useMemo(() => {
    if (!globalTimer?.tagIds || globalTimer.tagIds.length === 0) return undefined;
    return getHierarchicalTagPath(globalTimer.tagIds[0]);
  }, [globalTimer?.tagIds, getHierarchicalTagPath]);
  
  // 🚀 [NEW] 缓存当前 Timer 的标签颜色
  const timerTagColor = useMemo(() => {
    if (!globalTimer?.tagIds || globalTimer.tagIds.length === 0) return undefined;
    const flatTags = TagService.getFlatTags();
    const tag = flatTags.find(t => t.id === globalTimer.tagIds[0]);
    return tag?.color || '#3b82f6';
  }, [globalTimer?.tagIds]);
  
  // 🚀 [NEW] 缓存当前 Timer 的标签 Emoji
  const timerTagEmoji = useMemo(() => {
    if (!globalTimer?.tagIds || globalTimer.tagIds.length === 0) return undefined;
    const tag = TagService.getFlatTags().find(t => t.id === globalTimer.tagIds[0]);
    return tag?.emoji || '⏱️';
  }, [globalTimer?.tagIds]);
  
  // 获取最底层标签的颜✅
  const getBottomTagColor = (tagId: string): string => {
    const flatTags = TagService.getFlatTags();
    const tag = flatTags.find(t => t.id === tagId);
    return tag?.color || '#3b82f6';
  };

  // 🔧 页面渲染函数 - 使用 useMemo 优化性能
  const renderCurrentPage = useMemo(() => {
    AppLogger.log(`🎨 [App] Rendering page: ${currentPage}`);
    const renderStart = performance.now();
    
    let content;
    switch (currentPage) {
      case 'home':
        content = (
          <HomePage />
        );
        break;

      case 'timecalendar':
        content = (
          <PageContainer title="时光" subtitle="时光日志与我的日历" className="time-calendar">
            <TimeCalendar 
              microsoftService={microsoftService}
              syncManager={syncManager}
              lastSyncTime={lastSyncTime}
              availableTags={hierarchicalTags}
              globalTimer={globalTimer}
              onTimerStart={handleTimerStart}
              onTimerPause={handleTimerPause}
              onTimerResume={handleTimerResume}
              onTimerStop={handleTimerStop}
              onTimerCancel={handleTimerCancel}
            />
          </PageContainer>
        );
        break;

      case 'timelog':
        content = <TimeLog isPanelVisible={isPanelVisible} onPanelVisibilityChange={setIsPanelVisible} />;
        break;

      case 'tag':
        content = (
          <PageContainer title="标签" subtitle="标签管理与专注表盘配置" className="tag-management">
            <div className="tag-management-layout">
              {/* 左侧标签设置区域 */}
              <div className="tag-setting-section">
                <div className="section-header">
                  <div className="title-indicator"></div>
                  <h3>标签管理</h3>
                </div>
                
                <div className="tag-management-hint">
                  <p>子标签删除，事件默认使用父标签及其映射的日历</p>
                  <p>父标签删除，事件默认同步至原先日历</p>
                </div>

                {/* TagManager 组件 - 使用 emoji-mart 的新版本 */}
                <TagManager 
                  microsoftService={microsoftService}
                  globalTimer={globalTimer}
                  onTimerStart={handleTimerStart}
                  onTimerPause={handleTimerPause}
                  onTimerResume={handleTimerResume}
                  onTimerStop={handleTimerStop}
                  onTagsChange={handleTagsChange}
                />
              </div>

              {/* 右侧专注表盘配置区域 */}
              <div className="focus-setting-section">
                <div className="section-header">
                  <div className="title-indicator"></div>
                  <h3>配置专注表盘</h3>
                </div>
                
                <div className="focus-hint">
                  <p>点击表盘拖曳标签编辑</p>
                  <p>在时✅gt;&gt;专注面板享用</p>
                </div>

                <div className="focus-dials">
                  <div className="dial-item">
                    <span>🧐开学啦</span>
                  </div>
                  <div className="dial-item">
                    <span>😍假期假期</span>
                  </div>
                  <div className="dial-item">
                    <span>🐶实习狗</span>
                  </div>
                  <div className="dial-item add-dial">
                    <span>➕点击添加</span>
                  </div>
                </div>
              </div>
            </div>
          </PageContainer>
        );
        break;

      case 'plan':
        // ❌ [REMOVED] filteredPlanItems 计算 - PlanManager 自己管理
        // PlanManager 现在自己监听 eventsUpdated，不需要通过 props 接收 items
        
        content = (
          <PlanManager
            isPanelVisible={isPanelVisible}
            onPanelVisibilityChange={setIsPanelVisible}
            availableTags={availableTagsForEdit.map(t => t.name)}
            microsoftService={microsoftService} // 🆕 传递 Microsoft 服务，支持 To Do Lists
          />
        );
        break;

      case 'sync':
        content = (
          <PageContainer title="同步" subtitle="日历同步设置与状态">
            <CalendarSync 
              microsoftService={microsoftService}
              syncManager={syncManager}
              onSettingsChange={handleSettingsChange}
            />
          </PageContainer>
        );
        break;

      case 'ai-demo':
        // 懒加载 AIDemo 组件
        const AIDemo = React.lazy(() => import('./components/AIDemo.tsx'));
        content = (
          <React.Suspense fallback={<PageContainer title="AI Demo"><div>加载中...</div></PageContainer>}>
            <AIDemo />
          </React.Suspense>
        );
        break;
        
      case 'ai-demo-v2':
        // 懒加载 AIDemoV2 组件
        const AIDemoV2 = React.lazy(() => import('./components/AIDemoV2.tsx'));
        content = (
          <React.Suspense fallback={<PageContainer title="AI Demo V2"><div>加载中...</div></PageContainer>}>
            <AIDemoV2 />
          </React.Suspense>
        );
        break;

      case 'rag-demo':
        // 懒加载 RAGDemo 组件
        const RAGDemo = React.lazy(() => import('./components/RAGDemo.tsx'));
        content = (
          <React.Suspense fallback={<PageContainer title="RAG Demo"><div>加载中...</div></PageContainer>}>
            <RAGDemo />
          </React.Suspense>
        );
        break;

      default:
        content = (
          <PageContainer title="首页">
            <div>未找到页面</div>
          </PageContainer>
        );
    }
    
    // 性能监控
    const renderDuration = performance.now() - renderStart;
    AppLogger.log(`🔧 [App] Page "${currentPage}" rendered in ${renderDuration.toFixed(2)}ms`);
    
    if (renderDuration > 100) {
      AppLogger.warn(`⚠️ [App] Page "${currentPage}" took too long: ${renderDuration.toFixed(2)}ms`);
    }
    
    return content;
  }, [
    currentPage,
    globalTimer,
    // ❌ [REMOVED] allEvents - 各组件自己监听 eventsUpdated
    microsoftService,
    syncManager,
    lastSyncTime,
    availableTagsForEdit,
    tagsVersion,  // 🔧 [PERFORMANCE FIX] 使用 tagsVersion 代替 appTags
    showEventEditModal,
    handleTimerPause,
    handleTimerResume,
    handleTimerStop,
    handleTagsChange,
    handleSettingsChange
  ]); // 🔧 关键依赖项

  return (
      <AppLayout 
        currentPage={currentPage} 
        onPageChange={handlePageChange}
        onSettingsClick={() => setShowSettingsModal(true)}
        globalTimer={globalTimer}
        onTimerClick={() => setCurrentPage('home')}
        isPanelVisible={isPanelVisible}
        onPanelToggle={() => setIsPanelVisible(!isPanelVisible)}
      >
      {renderCurrentPage}

      {/* 同步通知组件 */}
      <SyncNotification />

      {/* 设置模态框 */}
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={() => setShowSettingsModal(false)} 
      />

      {/* 计时器事件编辑模态框 - 使用 EventEditModalV2 */}
      {timerEditModal.isOpen && timerEditModal.event && (
        <EventEditModalV2
          eventId={timerEditModal.event.id}
          isOpen={timerEditModal.isOpen}
          onClose={() => setTimerEditModal({ isOpen: false, event: null })}
          onSave={handleTimerEditSave}
          hierarchicalTags={hierarchicalTags}
          onStartTimeChange={handleStartTimeChange}
          globalTimer={globalTimer}
        />
      )}

      {/* 事件编辑模态框 */}
      {showEventEditModal && (
        <div className="edit-modal-overlay">
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>编辑事件</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <label>标题:</label>
              <input
                type="text"
                value={editingEventTitle}
                onChange={(e) => setEditingEventTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label>描述:</label>
              <textarea
                value={editingEventDescription}
                onChange={(e) => setEditingEventDescription(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label>标签:</label>
              <select
                multiple
                value={editingEventTagIds}
                onChange={(e) => setEditingEventTagIds(Array.from(e.target.selectedOptions, option => option.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  minHeight: '80px'
                }}
              >
                {availableTagsForEdit.map(tag => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEventEditModal(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={saveEventChanges}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  backgroundColor: '#007acc',
                  color: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// 导出主应用或悬浮窗口页面
export default function AppWrapper() {
  // 检查是否为悬浮窗口模式
  const isWidgetMode = window.location.hash === '#/widget-v3';
  const isWidgetSettings = window.location.hash === '#/widget-settings';
  
  // 如果是 Widget Settings 模式，渲染设置页面
  if (isWidgetSettings) {
    // 动态导入 WidgetSettings 组件
    const WidgetSettings = React.lazy(() => import('./pages/WidgetSettings'));
    return (
      <React.Suspense fallback={<div>Loading...</div>}>
        <WidgetSettings />
      </React.Suspense>
    );
  }
  
  // 如果是悬浮窗口模式，渲染桌面日历组件
  if (isWidgetMode) {
    return <DesktopCalendarWidget />;
  }
  
  // 否则渲染完整应用
  return <App />;
}
