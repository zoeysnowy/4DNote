const { contextBridge, ipcRenderer } = require('electron');

// 🗄️ 通过 IPC 从主进程获取 better-sqlite3
// 注意：在 Context Isolation 下，preload 无法直接 require Node.js 模块
// 解决方案：通过 ipcRenderer.invoke 从主进程获取
let BetterSqlite3 = null;

// 标记为通过 IPC 提供
const sqliteAvailableViaIPC = true;

// 安全地暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  getVersion: () => ipcRenderer.invoke('app-version'),
  getPlatform: () => ipcRenderer.invoke('app-platform'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  
  // 系统对话框
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  showNotification: (title, body, options) => ipcRenderer.invoke('show-notification', title, body, options),
  
  // 文件操作
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content, defaultName) => ipcRenderer.invoke('dialog:saveFile', content, defaultName),
  
  // 系统监听功能
  startSystemMonitoring: () => ipcRenderer.invoke('start-system-monitoring'),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  
  // 调试功能
  debugLog: (message, data) => {
    console.log('🔧 [Electron Debug]', message, data);
    ipcRenderer.invoke('debug-log', message, data);
  },
  
  // 🔍 性能监控
  performance: {
    getReport: () => ipcRenderer.invoke('get-performance-report'),
    printReport: () => ipcRenderer.invoke('print-performance-report'),
    resetStats: () => ipcRenderer.invoke('reset-performance-stats')
  },
  
  // 桌面小组件控制
  toggleWidget: () => ipcRenderer.invoke('toggle-widget'),
  createWidget: () => ipcRenderer.invoke('create-widget'),
  widgetClose: () => ipcRenderer.invoke('widget-close'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  widgetMinimize: () => ipcRenderer.invoke('widget-minimize'),
  widgetLock: (isLocked) => ipcRenderer.invoke('widget-lock', isLocked),

  // 🪟 多窗口管理
  window: {
    openEventEditor: (eventId, eventData) => ipcRenderer.invoke('open-event-editor', eventId, eventData),
    closeEventEditor: (eventId) => ipcRenderer.invoke('close-event-editor', eventId),
    getEditorCount: () => ipcRenderer.invoke('get-editor-count'),
    onEventUpdated: (callback) => {
      ipcRenderer.on('event-updated', (event, data) => callback(data));
    },
    onEventData: (callback) => {
      ipcRenderer.on('event-data', (event, data) => callback(data));
    }
  },
  widgetOpacity: (opacity) => ipcRenderer.invoke('widget-opacity', opacity),
  widgetMove: (position) => ipcRenderer.invoke('widget-move', position),
  widgetDragEnd: () => ipcRenderer.invoke('widget-drag-end'),
  widgetResize: (size) => ipcRenderer.invoke('widget-resize', size),
  widgetFullscreen: (isFullscreen) => ipcRenderer.invoke('widget-fullscreen', isFullscreen),
  widgetForceResizable: () => ipcRenderer.invoke('widget-force-resizable'),
  
  // 🎨 Widget 设置同步
  widgetUpdateSettings: (settings) => ipcRenderer.invoke('widget-update-settings', settings),
  onWidgetSettingsUpdate: (callback) => {
    const listener = (event, settings) => callback(settings);
    ipcRenderer.on('widget-settings-updated', listener);
    return () => ipcRenderer.removeListener('widget-settings-updated', listener);
  },
  
  // 新版小组件API
  widget: {
    toggle: (type, enabled) => ipcRenderer.invoke('widget-toggle', type, enabled),
    updateConfig: (type, config) => ipcRenderer.invoke('widget-update-config', type, config),
    setOpacity: (type, opacity) => ipcRenderer.invoke('widget-set-opacity', type, opacity),
    setAlwaysOnTop: (type, alwaysOnTop) => ipcRenderer.invoke('widget-set-always-on-top', type, alwaysOnTop),
    close: (type) => ipcRenderer.invoke('widget-close-typed', type),
    getConfig: (type) => ipcRenderer.invoke('widget-get-config', type),
    savePosition: (type, x, y) => ipcRenderer.invoke('widget-save-position', type, x, y),
    saveSize: (type, width, height) => ipcRenderer.invoke('widget-save-size', type, width, height),
    // 🎨 Settings 子窗口
    openSettings: () => ipcRenderer.invoke('widget-settings-open'),
    closeSettings: () => ipcRenderer.invoke('widget-settings-close')
  },
  
  // 事件监听
  on: (channel, callback) => {
    ipcRenderer.on(channel, callback);
  },
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  
  // 事件监听
  onTriggerSync: (callback) => {
    ipcRenderer.on('trigger-sync', callback);
  },
  onOpenSyncSettings: (callback) => {
    ipcRenderer.on('open-sync-settings', callback);
  },
  
  // 移除事件监听
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // 检查是否在Electron环境
  isElectron: true,
  
  // 环境信息
  isDev: process.env.NODE_ENV === 'development',
  
  // 🗄️ SQLite 支持（通过 IPC）
  sqlite: {
    available: sqliteAvailableViaIPC,
    // 创建数据库连接
    createDatabase: async (dbPath, options) => {
      const result = await ipcRenderer.invoke('sqlite:create-database', dbPath, options);
      if (!result.success) throw new Error(result.error);
      return { success: true, dbId: result.dbId };
    },
    // 执行 SQL
    exec: async (dbId, sql) => {
      const result = await ipcRenderer.invoke('sqlite:exec', dbId, sql);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    // 准备语句
    prepare: async (dbId, sql) => {
      const result = await ipcRenderer.invoke('sqlite:prepare', dbId, sql);
      if (!result.success) throw new Error(result.error);
      return result.stmtId; // 直接返回 stmtId
    },
    // 运行语句
    run: async (stmtId, params) => {
      const result = await ipcRenderer.invoke('sqlite:run', stmtId, params);
      if (!result.success) throw new Error(result.error);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    // 查询单行
    get: async (stmtId, params) => {
      const result = await ipcRenderer.invoke('sqlite:get', stmtId, params);
      if (!result.success) throw new Error(result.error);
      return result.data; // 直接返回数据
    },
    // 查询所有行
    all: async (stmtId, params) => {
      const result = await ipcRenderer.invoke('sqlite:all', stmtId, params);
      if (!result.success) throw new Error(result.error);
      return result.data; // 直接返回数据数组
    },
    // Pragma 操作
    pragma: async (dbId, pragma) => {
      const result = await ipcRenderer.invoke('sqlite:pragma', dbId, pragma);
      if (!result.success) throw new Error(result.error);
      return result.data; // 直接返回 pragma 结果
    },
    // 关闭数据库
    close: async (dbId) => {
      const result = await ipcRenderer.invoke('sqlite:close', dbId);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    // 删除数据库文件（修复损坏的数据库）
    deleteDatabase: async (dbPath) => {
      const result = await ipcRenderer.invoke('sqlite:deleteDatabase', dbPath);
      if (!result.success) throw new Error(result.error);
      return result;
    },
  },
  
  // Microsoft认证辅助
  openExternalAuth: (url) => ipcRenderer.invoke('open-external-auth', url),
  microsoftLoginWindow: (authUrl) => ipcRenderer.invoke('microsoft-login-window', authUrl),
  handleAuthCallback: (url) => ipcRenderer.invoke('handle-auth-callback', url),
  startAuthServer: (redirectUri) => ipcRenderer.invoke('start-auth-server', redirectUri),
  // 令牌共享API
  setAuthTokens: (tokens) => ipcRenderer.invoke('set-auth-tokens', tokens),
  getAuthTokens: () => ipcRenderer.invoke('get-auth-tokens'),
  
  // 开机自启动设置
  setLoginItemSettings: (settings) => ipcRenderer.invoke('set-login-item-settings', settings),
  getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
  
  // 🗑️ 清理存储数据（包括IndexedDB）
  clearStorageData: () => ipcRenderer.invoke('clear-storage-data'),
  
  // 🆕 通用 invoke 方法（用于动态调用 IPC）
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});

// 监听主进程消息
window.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 Electron preload script loaded');
  console.log('📱 Platform:', process.platform);
  console.log('🏗️ Architecture:', process.arch);
  console.log('✅ invoke 方法已暴露:', typeof window.electronAPI?.invoke === 'function');
});

// 为渲染进程提供一些有用的常量
contextBridge.exposeInMainWorld('electronConstants', {
  PLATFORM: process.platform,
  ARCH: process.arch,
  IS_WINDOWS: process.platform === 'win32',
  IS_MACOS: process.platform === 'darwin',
  IS_LINUX: process.platform === 'linux'
});