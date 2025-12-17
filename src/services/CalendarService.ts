/**
 * CalendarService - 日历元数据服务
 * 从localStorage加载日历信息（名称、颜色）
 * 与test-stats-full.html保持一致
 */

interface Calendar {
  id: string;
  name: string;
  color: string;
  hexColor?: string;
  backgroundColor?: string;
}

class CalendarServiceClass {
  private calendars: Map<string, Calendar> = new Map();
  
  constructor() {
    this.loadCalendars();
  }
  
  /**
   * 从localStorage加载日历缓存
   */
  private loadCalendars() {
    try {
      // 从localStorage加载日历缓存
      const cacheStr = localStorage.getItem('4dnote-calendars-cache');
      if (cacheStr) {
        const calendars: Calendar[] = JSON.parse(cacheStr);
        console.log('📅 [CalendarService] 加载日历缓存:', calendars.length, '个');
        calendars.forEach(cal => {
          this.calendars.set(cal.id, {
            id: cal.id,
            name: cal.name || cal.id.substring(0, 20),
            color: cal.hexColor || cal.color || cal.backgroundColor || this.getCalendarColor(cal.id, 'calendar')
          });
        });
      }
      
      // 尝试从window.microsoftCalendarService获取
      const msService = (window as any).microsoftCalendarService;
      if (msService?.calendars && msService.calendars.length > 0) {
        console.log('📅 [CalendarService] 从 MicrosoftCalendarService 加载日历:', msService.calendars.length, '个');
        msService.calendars.forEach((cal: any) => {
          this.calendars.set(cal.id, {
            id: cal.id,
            name: cal.name || cal.id.substring(0, 20),
            color: cal.hexColor || cal.color || this.getCalendarColor(cal.id, 'outlook')
          });
        });
      }
      
      console.log('✅ [CalendarService] 日历缓存加载完成:', this.calendars.size, '个日历');
    } catch (error) {
      console.warn('⚠️ [CalendarService] 加载日历缓存失败:', error);
    }
  }
  
  /**
   * 获取日历信息
   */
  getCalendarById(calendarId: string): { id: string; name: string; color: string } | null {
    if (this.calendars.has(calendarId)) {
      return this.calendars.get(calendarId)!;
    }
    
    // 如果缓存中没有，返回默认值
    return {
      id: calendarId,
      name: this.getDefaultName(calendarId),
      color: this.getCalendarColor(calendarId, 'calendar')
    };
  }
  
  /**
   * 获取默认日历名称
   */
  private getDefaultName(calendarId: string): string {
    if (calendarId.startsWith('outlook-')) {
      return 'Outlook 日历';
    }
    if (calendarId.startsWith('google-')) {
      return 'Google 日历';
    }
    if (calendarId.startsWith('icloud-')) {
      return 'iCloud 日历';
    }
    if (calendarId.length > 40) {
      return calendarId.substring(0, 30) + '...';
    }
    return calendarId;
  }
  
  /**
   * 获取日历颜色
   */
  private getCalendarColor(id: string, source?: string): string {
    if (source === 'outlook') return '#0078d4';
    if (source === 'google') return '#ea4335';
    if (source === 'local') return '#7b1fa2';
    
    // 根据ID生成颜色
    const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }
  
  /**
   * 获取source类型（用于badge显示）
   */
  getSourceType(calendarId: string): string {
    if (calendarId.startsWith('outlook-')) return 'outlook';
    if (calendarId.startsWith('google-')) return 'google';
    if (calendarId.startsWith('icloud-')) return 'icloud';
    return 'calendar';
  }
}

export const calendarService = new CalendarServiceClass();
