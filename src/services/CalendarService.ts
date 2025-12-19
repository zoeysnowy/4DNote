/**
 * CalendarService - 统一日历数据管理服务
 * 
 * @description 
 * 统一管理所有日历数据的获取、缓存、查询和更新
 * 解决之前多处分散的日历数据访问逻辑
 * 
 * @features
 * - 统一的数据源管理（localStorage + MicrosoftCalendarService）
 * - 智能缓存机制
 * - 统一的颜色和名称处理
 * - 支持多账户（Outlook/Google/iCloud）
 * - 提供简洁的查询API
 * 
 * @version 2.0.0
 * @author Zoey Gong
 */

import { Calendar, CalendarGroup, CalendarProvider, SPECIAL_CALENDAR_IDS } from '../types/calendar';
import { getCalendarColor } from '../utils/calendarColorUtils';
import { getCalendarDisplayName, getCalendarNameWithProvider } from '../utils/calendarNameUtils';

/**
 * 存储键名常量
 */
const STORAGE_KEYS = {
  CALENDARS_CACHE: '4dnote-calendars-cache',
  CALENDAR_GROUPS_CACHE: '4dnote-calendar-groups-cache',
} as const;

/**
 * CalendarService 类
 */
class CalendarServiceClass {
  private calendars: Map<string, Calendar> = new Map();
  private calendarGroups: Map<string, CalendarGroup> = new Map();
  private isInitialized: boolean = false;
  private microsoftService: any = null;

  /**
   * 初始化服务
   */
  async initialize(microsoftService?: any): Promise<void> {
    if (this.isInitialized) {
      console.log('📅 [CalendarService] Already initialized');
      return;
    }

    console.log('📅 [CalendarService] Initializing...');
    
    if (microsoftService) {
      this.microsoftService = microsoftService;
    } else {
      // 尝试从全局获取
      this.microsoftService = (window as any).microsoftCalendarService;
    }

    // 从缓存加载
    await this.loadFromCache();
    
    // 如果缓存为空，尝试从服务同步
    if (this.calendars.size === 0 && this.microsoftService) {
      await this.syncFromServices();
    }

    this.isInitialized = true;
    console.log('✅ [CalendarService] Initialized with', this.calendars.size, 'calendars');
  }

  /**
   * 从localStorage加载缓存
   */
  private async loadFromCache(): Promise<void> {
    try {
      // 加载日历列表
      const calendarsCache = localStorage.getItem(STORAGE_KEYS.CALENDARS_CACHE);
      if (calendarsCache) {
        const calendars: any[] = JSON.parse(calendarsCache);
        console.log('📅 [CalendarService] Loading', calendars.length, 'calendars from cache');
        
        calendars.forEach(cal => {
          const normalizedCalendar = this.normalizeCalendar(cal);
          this.calendars.set(normalizedCalendar.id, normalizedCalendar);
        });
      }

      // 加载日历分组
      const groupsCache = localStorage.getItem(STORAGE_KEYS.CALENDAR_GROUPS_CACHE);
      if (groupsCache) {
        const groups: any[] = JSON.parse(groupsCache);
        console.log('📅 [CalendarService] Loading', groups.length, 'calendar groups from cache');
        
        groups.forEach(group => {
          this.calendarGroups.set(group.id, group);
        });
      }
    } catch (error) {
      console.error('❌ [CalendarService] Failed to load from cache:', error);
    }
  }

  /**
   * 从各个服务同步日历数据
   */
  private async syncFromServices(): Promise<void> {
    console.log('🔄 [CalendarService] Syncing from services...');
    
    try {
      // Microsoft Calendar Service
      if (this.microsoftService && typeof this.microsoftService.getCachedCalendars === 'function') {
        const msCalendars = this.microsoftService.getCachedCalendars();
        console.log('📅 [CalendarService] Got', msCalendars.length, 'calendars from Microsoft');
        
        msCalendars.forEach((cal: any) => {
          const normalizedCalendar = this.normalizeCalendar({
            ...cal,
            provider: 'outlook'
          });
          this.calendars.set(normalizedCalendar.id, normalizedCalendar);
        });

        // 获取分组
        if (typeof this.microsoftService.getCachedCalendarGroups === 'function') {
          const msGroups = this.microsoftService.getCachedCalendarGroups();
          console.log('📅 [CalendarService] Got', msGroups.length, 'calendar groups from Microsoft');
          
          msGroups.forEach((group: any) => {
            this.calendarGroups.set(group.id, {
              ...group,
              provider: 'outlook'
            });
          });
        }
      }

      // TODO: 添加 Google Calendar Service
      // TODO: 添加 iCloud Calendar Service

      // 保存到缓存
      this.saveToCache();
    } catch (error) {
      console.error('❌ [CalendarService] Failed to sync from services:', error);
    }
  }

  /**
   * 保存到localStorage缓存
   */
  private saveToCache(): void {
    try {
      const calendarsArray = Array.from(this.calendars.values());
      localStorage.setItem(STORAGE_KEYS.CALENDARS_CACHE, JSON.stringify(calendarsArray));
      
      const groupsArray = Array.from(this.calendarGroups.values());
      localStorage.setItem(STORAGE_KEYS.CALENDAR_GROUPS_CACHE, JSON.stringify(groupsArray));
      
      console.log('💾 [CalendarService] Saved to cache:', calendarsArray.length, 'calendars');
    } catch (error) {
      console.error('❌ [CalendarService] Failed to save to cache:', error);
    }
  }

  /**
   * 规范化日历数据（统一格式）
   */
  private normalizeCalendar(raw: any): Calendar {
    return {
      id: raw.id,
      name: raw.name || raw.displayName || raw.id,
      displayName: raw.displayName || raw.name,
      color: getCalendarColor(raw),
      rawColor: raw.color,
      backgroundColor: raw.backgroundColor || raw.hexColor,
      groupId: raw.groupId || raw.calendarGroupId,
      provider: raw.provider || this.inferProvider(raw.id),
      canEdit: raw.canEdit !== false,
      isDefault: raw.isDefault || false,
      ownerEmail: raw.ownerEmail || raw.owner?.address
    };
  }

  /**
   * 从ID推断提供商
   */
  private inferProvider(id: string): CalendarProvider {
    const idLower = id.toLowerCase();
    
    if (idLower.includes('outlook') || idLower.includes('microsoft')) {
      return 'outlook';
    }
    if (idLower.includes('google')) {
      return 'google';
    }
    if (idLower.includes('icloud')) {
      return 'icloud';
    }
    
    return 'local';
  }

  // ==================== 公共API ====================

  /**
   * 获取所有日历
   * 
   * @param includeSpecial - 是否包含特殊选项（本地创建、未同步等）
   * @returns 日历列表
   */
  getCalendars(includeSpecial: boolean = false): Calendar[] {
    const calendars = Array.from(this.calendars.values());
    
    if (!includeSpecial) {
      return calendars;
    }

    // 添加特殊选项
    return [
      ...calendars,
      {
        id: SPECIAL_CALENDAR_IDS.LOCAL_CREATED,
        name: '🔮 创建自本地',
        displayName: '创建自本地',
        color: '#9c27b0',
        provider: 'local',
        canEdit: false,
        isDefault: false
      },
      {
        id: SPECIAL_CALENDAR_IDS.NOT_SYNCED,
        name: '🔄 未同步至日历',
        displayName: '未同步至日历',
        color: '#ff9800',
        provider: 'local',
        canEdit: false,
        isDefault: false
      }
    ];
  }

  /**
   * 根据ID获取日历
   * 
   * @param calendarId - 日历ID
   * @returns 日历对象或null
   */
  getCalendar(calendarId: string): Calendar | null {
    // 处理特殊ID
    if (calendarId === SPECIAL_CALENDAR_IDS.LOCAL_CREATED) {
      return {
        id: SPECIAL_CALENDAR_IDS.LOCAL_CREATED,
        name: '🔮 创建自本地',
        displayName: '创建自本地',
        color: '#9c27b0',
        provider: 'local'
      };
    }
    
    if (calendarId === SPECIAL_CALENDAR_IDS.NOT_SYNCED) {
      return {
        id: SPECIAL_CALENDAR_IDS.NOT_SYNCED,
        name: '🔄 未同步至日历',
        displayName: '未同步至日历',
        color: '#ff9800',
        provider: 'local'
      };
    }

    return this.calendars.get(calendarId) || null;
  }

  /**
   * 根据提供商获取日历列表
   * 
   * @param provider - 提供商类型
   * @returns 日历列表
   */
  getCalendarsByProvider(provider: CalendarProvider): Calendar[] {
    return Array.from(this.calendars.values())
      .filter(cal => cal.provider === provider);
  }

  /**
   * 获取所有日历分组
   * 
   * @returns 分组列表
   */
  getCalendarGroups(): CalendarGroup[] {
    return Array.from(this.calendarGroups.values());
  }

  /**
   * 根据分组ID获取日历列表
   * 
   * @param groupId - 分组ID
   * @returns 日历列表
   */
  getCalendarsByGroup(groupId: string): Calendar[] {
    return Array.from(this.calendars.values())
      .filter(cal => cal.groupId === groupId);
  }

  /**
   * 获取日历的显示名称
   * 
   * @param calendarId - 日历ID
   * @param options - 选项
   * @returns 显示名称
   */
  getDisplayName(calendarId: string, options?: {
    withProvider?: boolean;
    clean?: boolean;
  }): string {
    const calendar = this.getCalendar(calendarId);
    if (!calendar) {
      return '未知日历';
    }

    if (options?.withProvider) {
      return getCalendarNameWithProvider(calendar);
    }

    return getCalendarDisplayName(calendar);
  }

  /**
   * 获取日历颜色
   * 
   * @param calendarId - 日历ID
   * @returns 十六进制颜色值
   */
  getColor(calendarId: string): string {
    const calendar = this.getCalendar(calendarId);
    return calendar?.color || '#3b82f6';
  }

  /**
   * 批量获取日历信息（用于UI渲染）
   * 
   * @param calendarIds - 日历ID列表
   * @returns 日历信息列表
   */
  getBatchInfo(calendarIds: string[]): Array<{
    id: string;
    name: string;
    color: string;
    provider?: CalendarProvider;
  }> {
    return calendarIds.map(id => {
      const calendar = this.getCalendar(id);
      return {
        id,
        name: calendar ? getCalendarDisplayName(calendar) : '未知日历',
        color: calendar?.color || '#3b82f6',
        provider: calendar?.provider
      };
    });
  }

  /**
   * 搜索日历
   * 
   * @param query - 搜索关键词
   * @returns 匹配的日历列表
   */
  searchCalendars(query: string): Calendar[] {
    if (!query || query.trim() === '') {
      return this.getCalendars();
    }

    const lowerQuery = query.toLowerCase();
    return Array.from(this.calendars.values()).filter(cal => {
      const name = getCalendarDisplayName(cal).toLowerCase();
      return name.includes(lowerQuery);
    });
  }

  /**
   * 验证日历是否存在
   * 
   * @param calendarId - 日历ID
   * @returns 是否存在
   */
  exists(calendarId: string): boolean {
    // 特殊ID始终存在
    if (Object.values(SPECIAL_CALENDAR_IDS).includes(calendarId as any)) {
      return true;
    }
    
    return this.calendars.has(calendarId);
  }

  /**
   * 重新加载日历数据
   * 
   * @param force - 是否强制从服务重新同步
   */
  async reload(force: boolean = false): Promise<void> {
    console.log('🔄 [CalendarService] Reloading...');
    
    this.calendars.clear();
    this.calendarGroups.clear();
    
    if (force) {
      await this.syncFromServices();
    } else {
      await this.loadFromCache();
    }
    
    console.log('✅ [CalendarService] Reloaded:', this.calendars.size, 'calendars');
  }

  /**
   * 添加或更新日历
   * 
   * @param calendar - 日历对象
   */
  upsertCalendar(calendar: Partial<Calendar> & { id: string }): void {
    const normalized = this.normalizeCalendar(calendar);
    this.calendars.set(normalized.id, normalized);
    this.saveToCache();
  }

  /**
   * 删除日历
   * 
   * @param calendarId - 日历ID
   */
  removeCalendar(calendarId: string): void {
    this.calendars.delete(calendarId);
    this.saveToCache();
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalCalendars: number;
    byProvider: Record<string, number>;
    totalGroups: number;
  } {
    const byProvider: Record<string, number> = {};
    
    this.calendars.forEach(cal => {
      const provider = cal.provider || 'unknown';
      byProvider[provider] = (byProvider[provider] || 0) + 1;
    });

    return {
      totalCalendars: this.calendars.size,
      byProvider,
      totalGroups: this.calendarGroups.size
    };
  }
}

// 导出单例
export const CalendarService = new CalendarServiceClass();

// 导出类型供其他地方使用
export type { Calendar, CalendarGroup, CalendarProvider };
