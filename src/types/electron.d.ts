// Electron API 类型定义
export interface ElectronAPI {
  // 应用信息
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{
    platform: string;
    arch: string;
    version: any;
  }>;
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    userDataPath: string;
    appPath: string;
  }>;
  getUserDataPath: () => Promise<string>;

  // 系统对话框
  showMessageBox: (options: {
    type?: 'info' | 'warning' | 'error' | 'question';
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }) => Promise<{ response: number; checkboxChecked?: boolean }>;
  
  showNotification: (
    title: string, 
    body: string, 
    options?: { icon?: string; sound?: boolean }
  ) => Promise<boolean>;

  // 文件操作
  openFile: () => Promise<string | null>;
  saveFile: (content: string, defaultName?: string) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
    canceled?: boolean;
  }>;

  // 系统监听功能
  startSystemMonitoring: () => Promise<{ success: boolean; message: string }>;
  getActiveWindow: () => Promise<{
    title: string;
    process: string;
    timestamp: string;
  } | null>;

  // 调试功能
  debugLog: (message: string, data?: any) => void;

  // 事件监听
  onTriggerSync: (callback: () => void) => void;
  onOpenSyncSettings: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;

  // 环境检查
  isElectron: boolean;
  isDev: boolean;
  
  // Microsoft认证辅助
  openExternalAuth?: (url: string) => Promise<void>;
  handleAuthCallback?: (url: string) => Promise<any>;
  startAuthServer?: (redirectUri: string) => Promise<string>;
  // 令牌共享 (主进程内存存储)
  setAuthTokens?: (tokens: { accessToken: string; refreshToken?: string; expiresAt?: number } | null) => Promise<{ success: boolean }>;
  getAuthTokens?: () => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number } | null>;
  
  // 开机自启动设置
  setLoginItemSettings?: (settings: {
    openAtLogin: boolean;
    path?: string;
  }) => Promise<boolean>;
  getLoginItemSettings?: () => Promise<{
    openAtLogin: boolean;
    openAsHidden: boolean;
    wasOpenedAtLogin: boolean;
    wasOpenedAsHidden: boolean;
    restoreState: boolean;
  }>;
  
  // 桌面小组件控制 (新版)
  widget?: {
    toggle: (type: 'timer' | 'dailyStats', enabled: boolean) => void;
    updateConfig: (type: 'timer' | 'dailyStats', config: any) => void;
    setOpacity: (type: 'timer' | 'dailyStats', opacity: number) => void;
    setAlwaysOnTop: (type: 'timer' | 'dailyStats', alwaysOnTop: boolean) => void;
    close: (type: 'timer' | 'dailyStats') => void;
    getConfig: (type: 'timer' | 'dailyStats') => Promise<any>;
    savePosition: (type: 'timer' | 'dailyStats', x: number, y: number) => void;
    saveSize: (type: 'timer' | 'dailyStats', width: number, height: number) => void;
    // 🎨 Widget Settings 子窗口
    openSettings: () => Promise<{ success: boolean; action: string; mountToLeft?: boolean }>;
    closeSettings: () => Promise<{ success: boolean; action?: string; error?: string }>;
  };
  
  // 桌面悬浮窗口控制 (旧版，保留兼容性)
  createWidget: () => Promise<{ action: string; success: boolean }>;
  toggleWidget: () => Promise<{ action: string }>;
  widgetClose: () => Promise<{ success: boolean }>;
  closeWindow: () => Promise<{ success: boolean }>;
  widgetMinimize: () => Promise<{ success: boolean }>;
  widgetLock: (isLocked: boolean) => Promise<{ success: boolean; locked: boolean }>;
  widgetOpacity: (opacity: number) => Promise<{ success: boolean; opacity: number }>;
  widgetMove: (position: { x: number; y: number }) => Promise<{ 
    success: boolean; 
    position?: { x: number; y: number };
    actualDelta?: { x: number; y: number };
  }>;
  widgetResize: (size: { width: number; height: number }) => Promise<{ success: boolean; size: { width: number; height: number } }>;
  widgetFullscreen: (isFullscreen: boolean) => Promise<{ success: boolean; isFullscreen: boolean }>;
  
  // 🎨 Widget 设置同步
  widgetUpdateSettings: (settings: { bgOpacity?: number; bgColor?: string; isLocked?: boolean }) => Promise<{ success: boolean; settings: any }>;
  onWidgetSettingsUpdate: (callback: (settings: { bgOpacity?: number; bgColor?: string; isLocked?: boolean }) => void) => () => void;

  // 🪟 多窗口管理
  window?: {
    openEventEditor: (eventId: string, eventData: any) => Promise<{ success: boolean; error?: string }>;
    closeEventEditor: (eventId: string) => Promise<{ success: boolean; error?: string }>;
    getEditorCount: () => Promise<number>;
    onEventUpdated: (callback: (data: any) => void) => void;
    onEventData: (callback: (data: any) => void) => void;
  };
  
  on: (channel: string, callback: (...args: any[]) => void) => void;
  send: (channel: string, data?: any) => void;
  
  // 通用 IPC invoke（支持 AI 代理等新功能）
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

export interface ElectronConstants {
  PLATFORM: string;
  ARCH: string;
  IS_WINDOWS: boolean;
  IS_MACOS: boolean;
  IS_LINUX: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    electronConstants: ElectronConstants;
    // 简化访问（兼容性）
    electron?: ElectronAPI;
  }
}

export {};