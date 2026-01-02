// 4DNote 应用的 localStorage 键名常量
export const STORAGE_KEYS = {
  // 应用设置
  SETTINGS: '4dnote-settings',
  
  // 事件相关
  EVENT_TAGS: '4dnote-event-tags',
  HIERARCHICAL_TAGS: '4dnote-hierarchical-tags',
  
  // 计时相关
  TIMER_SESSIONS: '4dnote-timer-sessions',
  
  // 任务相关
  TASKS: '4dnote-tasks',
  
  // 🗑️ PLAN_ITEMS 已废弃：Plan 功能直接使用 Event（通过 isPlan 标记）
  // PLAN_ITEMS: '4dnote-plan-items', // 已删除，迁移到 Event
  
  // 日历缓存相关
  CALENDAR_GROUPS_CACHE: '4dnote-calendar-groups-cache',
  CALENDARS_CACHE: '4dnote-calendars-cache',
  CALENDAR_SYNC_META: '4dnote-calendar-sync-meta',
  
  // To Do Lists 缓存相关
  TODO_LISTS_CACHE: '4dnote-todolists-cache',
  
  // 标签相关（TagManager）
  TAGS: '4dnote_tags',
  CHECKIN_COUNTS: '4dnote_checkin_counts',
  
  // 同步相关
  SYNC_ACTIONS: '4dnote-sync-actions',
  SYNC_CONFLICTS: '4dnote-sync-conflicts',
  SYNC_CONFIG: '4dnote-sync-config',
  SYNC_CACHE: '4dnote-sync-cache',
} as const;

// 版本控制，用于检测缓存更新
export const STORAGE_VERSION = {
  CURRENT: '1.0.0',
  KEY: '4dnote-storage-version'
} as const;

// 缓存管理工具
export class CacheManager {
  static checkAndClearOldCache(): void {
    const currentVersion = localStorage.getItem(STORAGE_VERSION.KEY);
    
    // 🔧 只在版本真正不同时才清理，避免每次启动都清理
    if (currentVersion === null) {
      // 第一次运行，设置版本号但不清理
      localStorage.setItem(STORAGE_VERSION.KEY, STORAGE_VERSION.CURRENT);
      return;
    }
    
    if (currentVersion !== STORAGE_VERSION.CURRENT) {
      
      // 只清理旧的 meaningful- 前缀的缓存
      const oldKeys = [
        'meaningful-settings',
        'meaningful-events', 
        'meaningful-event-tags',
        'meaningful-timer-sessions',
        'meaningful-tasks',
        'meaningful-sync-actions',
        'meaningful-sync-conflicts',
        'meaningful-sync-config',
        'meaningful-sync-cache'
      ];
      
      oldKeys.forEach(key => {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
        }
      });
      
      // 设置新版本号
      localStorage.setItem(STORAGE_VERSION.KEY, STORAGE_VERSION.CURRENT);
    } else {
    }
  }
  
  static clearAllCache(): void {
    
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    
    // 不清除开发环境的持久化存储
    // 保护开发环境的持久化存储键 4dnote-dev-persistent-*
    
    localStorage.removeItem(STORAGE_VERSION.KEY);
  }
  
  static getCacheInfo(): Record<string, any> {
    const info: Record<string, any> = {};
    
    Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
      const data = localStorage.getItem(key);
      info[name] = data ? JSON.parse(data) : null;
    });
    
    return info;
  }
}