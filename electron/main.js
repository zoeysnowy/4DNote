const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const http = require('http');
const url = require('url');
const { spawn } = require('child_process');
const fs = require('fs');
const windowManager = require('./windowManager');

// 🗄️ 加载 better-sqlite3（在主进程中）
let Database;
try {
  Database = require('better-sqlite3');
  console.log('✅ [Main] better-sqlite3 loaded successfully');
} catch (error) {
  console.error('❌ [Main] Failed to load better-sqlite3:', error.message);
  Database = null;
}

// 本地时间格式化函数
const formatTimeForStorage = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
};

// 简化环境检测
const isDev = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath);

// ⚠️ 开发环境：忽略证书错误（仅用于调试 Microsoft Graph API）
if (isDev) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
  console.log('⚠️ [Main] Development mode: SSL certificate validation disabled');
}

let mainWindow;
let widgetSettingsWindow = null; // Widget Settings 子窗口
let proxyProcess = null; // 存储代理服务器进程

// ========================================
// 🔍 性能监控系统
// ========================================
const performanceMonitor = {
  // IPC 调用统计
  ipcCalls: {},
  
  // 内存使用记录
  memorySnapshots: [],
  
  // CPU 使用记录
  cpuUsage: [],
  
  // 开始时间
  startTime: Date.now(),
  
  // 记录 IPC 调用
  recordIPC: function(channel, duration) {
    if (!this.ipcCalls[channel]) {
      this.ipcCalls[channel] = {
        count: 0,
        totalTime: 0,
        maxTime: 0,
        minTime: Infinity,
        avgTime: 0,
        lastCall: 0
      };
    }
    
    const stat = this.ipcCalls[channel];
    stat.count++;
    stat.totalTime += duration;
    stat.maxTime = Math.max(stat.maxTime, duration);
    stat.minTime = Math.min(stat.minTime, duration);
    stat.avgTime = stat.totalTime / stat.count;
    stat.lastCall = Date.now();
    
    // 如果调用超过100ms，打印警告
    if (duration > 100) {
      console.warn(`⚠️ [Perf] 慢速 IPC: ${channel} 耗时 ${duration}ms`);
    }
  },
  
  // 获取性能报告
  getReport: function() {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      uptime: `${(uptime / 1000).toFixed(2)}s`,
      memory: {
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`
      },
      cpu: {
        user: `${(cpuUsage.user / 1000000).toFixed(2)}s`,
        system: `${(cpuUsage.system / 1000000).toFixed(2)}s`
      },
      ipc: this.ipcCalls
    };
  },
  
  // 打印性能报告
  printReport: function() {
    const report = this.getReport();
    console.log('\n========================================');
    console.log('📊 [性能监控] 性能报告');
    console.log('========================================');
    console.log('⏱️  运行时间:', report.uptime);
    console.log('💾 内存使用:');
    console.log('   - RSS:', report.memory.rss);
    console.log('   - Heap Used:', report.memory.heapUsed);
    console.log('   - Heap Total:', report.memory.heapTotal);
    console.log('   - External:', report.memory.external);
    console.log('⚡ CPU 使用:');
    console.log('   - User:', report.cpu.user);
    console.log('   - System:', report.cpu.system);
    console.log('📡 IPC 调用统计 (Top 10):');
    
    // 按调用次数排序
    const sortedIPC = Object.entries(report.ipc)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);
    
    sortedIPC.forEach(([channel, stats]) => {
      console.log(`   ${channel}:`);
      console.log(`      调用次数: ${stats.count}`);
      console.log(`      平均耗时: ${stats.avgTime.toFixed(2)}ms`);
      console.log(`      最大耗时: ${stats.maxTime}ms`);
      console.log(`      最小耗时: ${stats.minTime === Infinity ? 0 : stats.minTime}ms`);
    });
    console.log('========================================\n');
  }
};

// 每30秒自动打印一次性能报告
setInterval(() => {
  performanceMonitor.printReport();
}, 30000);

// IPC 调用包装器，自动记录性能
function createIPCHandler(channel, handler) {
  return async (...args) => {
    const startTime = Date.now();
    try {
      const result = await handler(...args);
      const duration = Date.now() - startTime;
      performanceMonitor.recordIPC(channel, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      performanceMonitor.recordIPC(channel, duration);
      console.error(`❌ [Perf] IPC ${channel} 失败:`, error);
      throw error;
    }
  };
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // 临时禁用，用于调试
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // 支持Microsoft认证所需的功能
      partition: 'persist:main',
      // 添加调试选项
      devTools: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false, // 先隐藏，加载完成后显示
    autoHideMenuBar: !isDev // 生产环境隐藏菜单栏
  });

  // 加载应用
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  console.log('Loading URL:', startUrl);
  mainWindow.loadURL(startUrl);

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // 设置窗口管理器的主窗口引用
  windowManager.setMainWindow(mainWindow);

  // 处理窗口关闭
  mainWindow.on('closed', () => {
    // 关闭所有子窗口
    windowManager.closeAllEditors();
    mainWindow = null;
  });

  // 处理外部链接 - 为Microsoft认证优化
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Microsoft OAuth认证相关链接在应用内打开
    if (url.includes('login.microsoftonline.com') || 
        url.includes('login.live.com') || 
        url.includes('account.live.com') ||
        url.includes('oauth.live.com') ||
        url.includes('graph.microsoft.com')) {
      return { action: 'allow' };
    }
    
    // 其他外部链接用系统浏览器打开
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 处理导航事件 - 允许Microsoft认证
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // 允许localhost和Microsoft认证域名
    if (parsedUrl.hostname === 'localhost' || 
        parsedUrl.hostname.includes('microsoftonline.com') ||
        parsedUrl.hostname.includes('live.com') ||
        parsedUrl.hostname.includes('microsoft.com')) {
      return; // 允许导航
    }
    
    // 阻止其他外部导航
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  // 设置菜单
  createMenu();
}

// 创建应用菜单
function createMenu() {
  const template = [
    {
      label: '4DNote',
      submenu: [
        {
          label: '关于 4DNote',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 4DNote',
              message: '4DNote Desktop',
              detail: '智能日历和任务管理应用\n版本: 1.0.0'
            });
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: '同步',
      submenu: [
        {
          label: '立即同步',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('trigger-sync');
          }
        },
        {
          label: '同步设置',
          click: () => {
            mainWindow.webContents.send('open-sync-settings');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Electron应用事件
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // 打印最终性能报告
  console.log('\n🏁 [Perf] 应用关闭前最终性能报告:');
  performanceMonitor.printReport();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC事件处理 - 使用性能包装器
ipcMain.handle('app-version', createIPCHandler('app-version', () => {
  return app.getVersion();
}));

ipcMain.handle('app-platform', createIPCHandler('app-platform', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.versions
  };
}));

// 🪟 窗口管理 IPC
ipcMain.handle('open-event-editor', createIPCHandler('open-event-editor', (event, eventId, eventData) => {
  try {
    windowManager.openEventEditor(eventId, eventData);
    return { success: true };
  } catch (error) {
    console.error('❌ [Window] Failed to open event editor:', error);
    return { success: false, error: error.message };
  }
}));

ipcMain.handle('close-event-editor', createIPCHandler('close-event-editor', (event, eventId) => {
  try {
    windowManager.closeEventEditor(eventId);
    return { success: true };
  } catch (error) {
    console.error('❌ [Window] Failed to close event editor:', error);
    return { success: false, error: error.message };
  }
}));

ipcMain.handle('get-editor-count', createIPCHandler('get-editor-count', () => {
  return windowManager.getEditorCount();
}));

// 🔍 性能监控 IPC
ipcMain.handle('get-performance-report', createIPCHandler('get-performance-report', () => {
  return performanceMonitor.getReport();
}));

ipcMain.handle('print-performance-report', createIPCHandler('print-performance-report', () => {
  performanceMonitor.printReport();
  return { success: true };
}));

ipcMain.handle('reset-performance-stats', createIPCHandler('reset-performance-stats', () => {
  performanceMonitor.ipcCalls = {};
  performanceMonitor.startTime = Date.now();
  console.log('✅ [Perf] 性能统计已重置');
  return { success: true };
}));

ipcMain.handle('show-message-box', createIPCHandler('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
}));

ipcMain.handle('show-notification', createIPCHandler('show-notification', (event, title, body, options = {}) => {
  const { Notification } = require('electron');
  const notification = new Notification({
    title,
    body,
    ...options
  });
  notification.show();
  return true;
}));

// 🗑️ 清理存储数据（包括IndexedDB）
ipcMain.handle('clear-storage-data', createIPCHandler('clear-storage-data', async () => {
  const { session, app } = require('electron');
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    console.log('🗑️ [Main] 开始清理存储数据...');
    
    // 1. 强制关闭所有 SQLite 连接（包括断开连接前执行 PRAGMA optimize）
    console.log('📊 [Main] 关闭 SQLite 连接...');
    for (const [dbId, db] of sqliteConnections.entries()) {
      if (db && typeof db.close === 'function') {
        try {
          // 尝试执行优化（确保 WAL 文件被清空）
          try {
            db.pragma('wal_checkpoint(TRUNCATE)');
          } catch (e) {
            console.warn(`   ⚠️  WAL checkpoint 失败: ${dbId}`, e.message);
          }
          
          db.close();
          sqliteConnections.delete(dbId);
          console.log(`   ✅ 已关闭: ${dbId}`);
        } catch (err) {
          console.warn(`   ⚠️  关闭失败: ${dbId}`, err.message);
          // 强制删除连接
          sqliteConnections.delete(dbId);
        }
      }
    }
    console.log('✅ [Main] SQLite 连接已关闭');
    
    // 等待 100ms 确保文件句柄释放
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 2. 清理浏览器存储（session.clearStorageData 会正确关闭 IndexedDB 连接）
    console.log('🗑️ [Main] 清理浏览器存储数据...');
    await session.defaultSession.clearStorageData({
      storages: ['indexeddb', 'localstorage', 'cookies', 'serviceworkers', 'cachestorage']
    });
    console.log('✅ [Main] 浏览器存储数据清理完成');
    
    // 等待 200ms 确保 IndexedDB 文件句柄释放
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 3. 删除 SQLite 数据库文件
    console.log('📁 [Main] 删除 SQLite 文件...');
    
    // 需要清理的目录列表
    const pathsToClean = [
      app.getPath('userData'),
      path.join(__dirname, 'database'), // 项目目录下的 database 文件夹
    ];
    
    let totalDeleted = 0;
    for (const dirPath of pathsToClean) {
      try {
        const files = await fs.readdir(dirPath);
        const dbFiles = files.filter(file => 
          file.endsWith('.db') || 
          file.endsWith('.db-wal') || 
          file.endsWith('.db-shm')
        );
        
        for (const file of dbFiles) {
          const filePath = path.join(dirPath, file);
          try {
            await fs.unlink(filePath);
            console.log(`   ✅ 已删除: ${filePath}`);
            totalDeleted++;
          } catch (err) {
            console.warn(`   ⚠️  删除失败: ${file} - ${err.message}`);
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn(`⚠️  扫描目录失败 ${dirPath}: ${err.message}`);
        }
      }
    }
    
    if (totalDeleted > 0) {
      console.log(`✅ [Main] SQLite 数据库文件已删除 (${totalDeleted} 个文件)`);
    } else {
      console.log('ℹ️ [Main] 未找到 SQLite 数据库文件');
    }
    
    console.log('✅ [Main] 所有存储数据清理完成');
    return { success: true };
  } catch (error) {
    console.error('❌ [Main] 清理存储数据失败:', error);
    return { success: false, error: error.message };
  }
}));

// 文件操作
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('dialog:saveFile', async (event, content, defaultName = 'export.json') => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled) {
    const fs = require('fs').promises;
    try {
      await fs.writeFile(result.filePath, content, 'utf8');
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

// 系统监听相关IPC事件
ipcMain.handle('start-system-monitoring', () => {
  console.log('🔍 Starting system monitoring...');
  
  // TODO: 实现Windows程序监听
  // 这里可以集成第三方库如 active-win 来监听活动窗口
  
  return { success: true, message: 'System monitoring started' };
});

ipcMain.handle('get-active-window', async () => {
  try {
    // TODO: 实现获取当前活动窗口
    // 可以使用 active-win 包
    return { 
      title: 'Example Window', 
      process: 'example.exe',
      timestamp: formatTimeForStorage(new Date())
    };
  } catch (error) {
    console.error('Failed to get active window:', error);
    return null;
  }
});

// 应用数据存储路径
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// 🗄️ SQLite 数据库操作 IPC handlers
// 存储所有活动的数据库连接
const sqliteConnections = new Map();

ipcMain.handle('sqlite:create-database', (event, dbPath, options) => {
  try {
    if (!Database) {
      throw new Error('better-sqlite3 not available');
    }
    
    // 如果不是内存数据库，确保目录存在
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        console.log(`📁 [SQLite] Creating directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    // 合并选项，在开发环境自动启用 verbose
    const finalOptions = {
      ...(options || {}),
      verbose: isDev ? console.log : undefined
    };
    
    const db = new Database(dbPath, finalOptions);
    const dbId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sqliteConnections.set(dbId, db);
    console.log(`✅ [SQLite] Database created: ${dbId} at ${dbPath}`);
    return { success: true, dbId };
  } catch (error) {
    console.error('❌ [SQLite] Failed to create database:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sqlite:exec', (event, dbId, sql) => {
  try {
    const db = sqliteConnections.get(dbId);
    if (!db) {
      throw new Error(`Database ${dbId} not found`);
    }
    db.exec(sql);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sqlite:prepare', (event, dbId, sql) => {
  try {
    const db = sqliteConnections.get(dbId);
    if (!db) {
      throw new Error(`Database ${dbId} not found`);
    }
    const stmt = db.prepare(sql);
    const stmtId = `stmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sqliteConnections.set(stmtId, stmt);
    return { success: true, stmtId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sqlite:run', (event, stmtId, params) => {
  // 🔧 CRITICAL FIX: 清理参数中的对象类型（better-sqlite3 只接受原始类型）
  // typeof null === 'object' 在 JavaScript 中返回 true，但 SQLite 不接受 object
  const cleanedParams = params ? params.map(p => {
    // null → undefined（better-sqlite3 内部会将 undefined 转为 NULL）
    // 这避免了 typeof null === 'object' 导致的类型检查问题
    if (p === null || p === undefined) {
      return undefined;
    }
    // 原始类型直接返回
    if (typeof p !== 'object') {
      return p;
    }
    // Buffer 保持不变
    if (Buffer.isBuffer(p)) {
      return p;
    }
    // 其他对象类型序列化为 JSON
    console.warn('[Main Process] ⚠️ Converting object to JSON:', typeof p, p?.constructor?.name);
    return JSON.stringify(p);
  }) : [];

  try {
    const stmt = sqliteConnections.get(stmtId);
    if (!stmt) {
      throw new Error(`Statement ${stmtId} not found`);
    }
    
    // 🔍 Debug: Log parameters in main process
    if (params && params.length > 10) {
      console.log('[Main Process] 🔍 sqlite:run params count:', params.length);
      console.log('[Main Process] 🔍 First 5 params:', params.slice(0, 5).map((p, i) => ({
        index: i,
        type: typeof p,
        value: p === null ? 'null' : (typeof p === 'object' ? JSON.stringify(p).substring(0, 50) : p)
      })));
      console.log('[Main Process] 🔍 Last 2 params:', params.slice(-2).map((p, i) => ({
        index: params.length - 2 + i,
        type: typeof p,
        value: p === null ? 'null' : (typeof p === 'object' ? JSON.stringify(p).substring(0, 50) : p)
      })));
    }
    
    const result = stmt.run(...cleanedParams);
    return { success: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  } catch (error) {
    console.error('[Main Process] ❌ sqlite:run failed:', error.message);
    console.error('[Main Process] 📜 Error code:', error.code);
    console.error('[Main Process] 📜 Error name:', error.name);
    console.error('[Main Process] 📜 Full error:', error);
    if (params && params.length > 10) {
      console.error('[Main Process] 🔍 Original params types:', params.map((p, i) => `[${i}] ${typeof p}`));
      console.error('[Main Process] 🔍 Cleaned params types:', cleanedParams.map((p, i) => `[${i}] ${typeof p}`));
    }
    return { success: false, error: error.message, code: error.code };
  }
});

ipcMain.handle('sqlite:get', (event, stmtId, params) => {
  try {
    const stmt = sqliteConnections.get(stmtId);
    if (!stmt) {
      throw new Error(`Statement ${stmtId} not found`);
    }
    const result = stmt.get(...(params || []));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sqlite:all', (event, stmtId, params) => {
  try {
    const stmt = sqliteConnections.get(stmtId);
    if (!stmt) {
      throw new Error(`Statement ${stmtId} not found`);
    }
    const result = stmt.all(...(params || []));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sqlite:pragma', (event, dbId, pragma) => {
  try {
    const db = sqliteConnections.get(dbId);
    if (!db) {
      throw new Error(`Database ${dbId} not found`);
    }
    let result = db.pragma(pragma);
    // 如果是单个值的 pragma（如 journal_mode），提取值
    if (Array.isArray(result) && result.length === 1 && typeof result[0] === 'object') {
      const keys = Object.keys(result[0]);
      if (keys.length === 1) {
        result = result[0][keys[0]];
      }
    } else if (typeof result === 'object' && !Array.isArray(result) && result !== null) {
      const keys = Object.keys(result);
      if (keys.length === 1) {
        result = result[keys[0]];
      }
    }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sqlite:close', (event, dbId) => {
  try {
    const db = sqliteConnections.get(dbId);
    if (db && typeof db.close === 'function') {
      db.close();
      sqliteConnections.delete(dbId);
      console.log(`✅ [SQLite] Database closed: ${dbId}`);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 删除数据库文件（用于修复损坏的数据库）
ipcMain.handle('sqlite:deleteDatabase', (event, dbPath) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 安全检查：只允许删除 database 目录下的 .db 文件
    if (!dbPath.includes('database') || !dbPath.endsWith('.db')) {
      throw new Error('Invalid database path');
    }
    
    const fullPath = path.join(__dirname, '..', dbPath);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`🗑️ [SQLite] Database file deleted: ${fullPath}`);
      
      // 同时删除可能存在的 WAL 和 SHM 文件
      const walPath = fullPath + '-wal';
      const shmPath = fullPath + '-shm';
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
        console.log(`🗑️ [SQLite] WAL file deleted: ${walPath}`);
      }
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
        console.log(`🗑️ [SQLite] SHM file deleted: ${shmPath}`);
      }
      
      return { success: true };
    } else {
      return { success: true, message: 'File does not exist' };
    }
  } catch (error) {
    console.error('❌ [SQLite] Failed to delete database:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-info', () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    userDataPath: app.getPath('userData'),
    appPath: app.getAppPath()
  };
});

// Microsoft认证相关IPC处理器
ipcMain.handle('open-external-auth', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external auth URL:', error);
    return { success: false, error: error.message };
  }
});

// 使用BrowserWindow打开OAuth登录窗口 - 用户无需手动操作
ipcMain.handle('microsoft-login-window', async (event, authUrl) => {
  return new Promise((resolve, reject) => {
    let authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      title: 'Microsoft 登录',
      autoHideMenuBar: true
    });

    authWindow.loadURL(authUrl);

    // 监听URL变化，检测重定向
    authWindow.webContents.on('will-redirect', (event, url) => {
      handleAuthRedirect(url);
    });

    authWindow.webContents.on('did-navigate', (event, url) => {
      handleAuthRedirect(url);
    });

    function handleAuthRedirect(url) {
      // 检查是否是回调URL
      if (url.startsWith('http://localhost:3000/auth/callback') || 
          url.startsWith('https://login.microsoftonline.com/common/oauth2/nativeclient')) {
        
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        const error = urlObj.searchParams.get('error');
        const errorDescription = urlObj.searchParams.get('error_description');

        if (code) {
          console.log('✅ [Auth] 获取到授权码:', code);
          authWindow.close();
          resolve({ success: true, code });
        } else if (error) {
          console.error('❌ [Auth] 认证错误:', error, errorDescription);
          authWindow.close();
          reject(new Error(errorDescription || error));
        }
      }
    }

    authWindow.on('closed', () => {
      authWindow = null;
      // 如果窗口被用户关闭且未获取到code，则拒绝Promise
      reject(new Error('用户取消了登录'));
    });
  });
});

ipcMain.handle('handle-auth-callback', async (event, url) => {
  try {
    // 处理认证回调
    console.log('Auth callback received:', url);
    return { success: true, url };
  } catch (error) {
    console.error('Failed to handle auth callback:', error);
    return { success: false, error: error.message };
  }
});

// 启动本地认证服务器
let authServer = null;
// 简单的内存Token存储，用于在多个窗口之间共享认证状态
let authTokens = null; // { accessToken, refreshToken, expiresAt }
ipcMain.handle('start-auth-server', async (event, redirectUri) => {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(redirectUri);
      const port = urlObj.port || 3000;
      
      // 如果服务器已经在运行，先关闭
      if (authServer) {
        authServer.close();
      }
      
      authServer = http.createServer((req, res) => {
        const reqUrl = url.parse(req.url, true);
        
        if (reqUrl.pathname === '/auth/callback') {
          const authCode = reqUrl.query.code;
          const error = reqUrl.query.error;
          
          // 返回简单的HTML页面
          res.writeHead(200, { 'Content-Type': 'text/html' });
          
          if (authCode) {
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>✅ 认证成功!</h2>
                  <p>您可以关闭此窗口，返回应用继续使用。</p>
                  <script>
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                  </script>
                </body>
              </html>
            `);
            
            // 关闭服务器
            authServer.close();
            authServer = null;
            
            // 返回授权码
            resolve(authCode);
          } else if (error) {
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2>❌ 认证失败</h2>
                  <p>错误: ${error}</p>
                  <p>请关闭此窗口并重试。</p>
                </body>
              </html>
            `);
            
            authServer.close();
            authServer = null;
            
            reject(new Error(`认证失败: ${error}`));
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
      
      authServer.listen(port, 'localhost', () => {
        console.log(`🔐 认证服务器启动在端口 ${port}`);
      });
      
      authServer.on('error', (error) => {
        console.error('认证服务器错误:', error);
        reject(error);
      });
      
      // 超时处理
      setTimeout(() => {
        if (authServer) {
          authServer.close();
          authServer = null;
          reject(new Error('认证超时'));
        }
      }, 5 * 60 * 1000); // 5分钟超时
      
    } catch (error) {
      console.error('启动认证服务器失败:', error);
      reject(error);
    }
  });
});

// 允许渲染进程将认证令牌写入主进程（用于跨窗口共享）
ipcMain.handle('set-auth-tokens', (event, tokens) => {
  try {
    authTokens = tokens || null;
    console.log('🔐 主进程已保存认证令牌');
    return { success: true };
  } catch (error) {
    console.error('Failed to set auth tokens in main process:', error);
    return { success: false, error: error.message };
  }
});

// 渲染进程可读取主进程中保存的令牌
ipcMain.handle('get-auth-tokens', () => {
  return authTokens;
});

// 调试日志处理器
ipcMain.handle('debug-log', (event, message, data) => {
  console.log('🔧 [Renderer Debug]', message, data);
  return true;
});

// 桌面小组件控制处理器
let widgetWindow = null;

ipcMain.handle('toggle-widget', async () => {
  console.log('🪟 Toggle widget requested');
  
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    // 如果窗口存在，关闭它
    widgetWindow.close();
    widgetWindow = null;
    return { action: 'closed' };
  } else {
    // 创建新的小组件窗口
    return createWidgetWindow();
  }
});

ipcMain.handle('create-widget', () => {
  return createWidgetWindow();
});

ipcMain.handle('widget-close', () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
  }
  return { success: true };
});

// 关闭当前窗口（用于widget内部关闭按钮）
ipcMain.handle('close-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && !window.isDestroyed()) {
    window.close();
  }
  return { success: true };
});

ipcMain.handle('widget-minimize', () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.minimize();
  }
  return { success: true };
});

ipcMain.handle('widget-lock', (event, isLocked) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    // 🔒 "锁定"含义重新定义：
    // - 锁定 = 窗口置顶，始终可见（但其他窗口可以在下方操作）
    // - 解锁 = 窗口不置顶，可以被其他窗口覆盖
    // - 无论锁定与否，窗口始终可以移动和调整大小
    
    widgetWindow.setAlwaysOnTop(isLocked, 'screen-saver');
    
    // 🔗 同步设置窗口的置顶状态
    if (widgetSettingsWindow && !widgetSettingsWindow.isDestroyed()) {
      widgetSettingsWindow.setAlwaysOnTop(isLocked, 'screen-saver');
      console.log(`🔗 Settings window synced: alwaysOnTop = ${isLocked}`);
    }
    
    // 确保窗口始终可以移动（修复之前版本可能设置的限制）
    widgetWindow.setMovable(true);
    
    if (isLocked) {
      console.log('✅ Widget locked: Always on top (screen-saver level), movable and resizable');
    } else {
      console.log('✅ Widget unlocked: Normal window level, movable and resizable');
    }
  }
  return { success: true, locked: isLocked };
});

ipcMain.handle('widget-opacity', (event, opacity) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setOpacity(opacity);
  }
  return { success: true, opacity };
});

// 🎨 Widget 设置更新：从设置窗口广播Widget窗口
ipcMain.handle('widget-update-settings', (event, settings) => {
  console.log('🎨 [Main] 收到设置更新:', settings);
  
  // 广播给Widget窗口
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('widget-settings-updated', settings);
    console.log('✅ [Main] 广播设置到Widget窗口');
    
    // ❌ 不要设置窗口级别的opacity，应该在CSS中通过rgba控制
    // 窗口级opacity会影响所有内容（包括文字和控件），导致100%也看起来透明
    
    // 同步锁定状态
    if (settings.isLocked !== undefined) {
      widgetWindow.setAlwaysOnTop(settings.isLocked, 'screen-saver');
      // 同步设置窗口
      if (widgetSettingsWindow && !widgetSettingsWindow.isDestroyed()) {
        widgetSettingsWindow.setAlwaysOnTop(settings.isLocked, 'screen-saver');
      }
    }
  }
  
  return { success: true, settings };
});

// 🎯 Widget 设置窗口拖曳
ipcMain.on('widget-settings-drag', (event, { deltaX, deltaY }) => {
  if (widgetSettingsWindow && !widgetSettingsWindow.isDestroyed()) {
    const [currentX, currentY] = widgetSettingsWindow.getPosition();
    widgetSettingsWindow.setPosition(currentX + deltaX, currentY + deltaY);
  }
});

// 🎯 Widget 设置窗口拖曳结束
ipcMain.on('widget-settings-drag-end', () => {
  // 可以在这里添加任何拖曳结束后的清理逻辑
  // 目前不需要特殊处理
});

// 🔧 强制恢复 Widget 窗口的 resize 能力（应急恢复功能）
ipcMain.handle('widget-force-resizable', () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const wasResizable = widgetWindow.isResizable();
    widgetWindow.setResizable(true);
    console.log('🔧 [Main] 强制恢复 resize 能力:', { before: wasResizable, after: true });
    return { success: true, wasResizable, nowResizable: true };
  }
  return { success: false, error: 'Widget window not found' };
});

// Resize 状态控制（保留用于未来可能的功能）
let isResizing = false;

// 🔧 保存拖动开始时的初始尺寸
let dragLockSize = null;

// 性能追踪
let movePerf = { count: 0, totalTime: 0, maxTime: 0, minTime: Infinity };

ipcMain.handle('widget-move', (event, position) => {
  const startTime = Date.now();
  console.log('📨 [Main] 收到 widget-move IPC:', position);
  
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    try {
      // 获取当前位置
      const currentBounds = widgetWindow.getBounds();
      console.log('📍 [Main] 当前位置:', { x: currentBounds.x, y: currentBounds.y, w: currentBounds.width, h: currentBounds.height });
      
      // 🔧 第一次拖动时锁定尺寸
      if (!dragLockSize) {
        dragLockSize = { width: currentBounds.width, height: currentBounds.height };
        console.log('🔒 [Main] 锁定拖动尺寸:', dragLockSize);
      }
      
      // 🔧 关键修复：拖动时临时禁用resize，防止窗口自动变大
      const wasResizable = widgetWindow.isResizable();
      
      // 性能测量变量
      let setBoundsStart = 0;
      let setBoundsEnd = 0;
      
      // 🎯 使用 try-finally 确保 resize 状态一定会恢复
      try {
        widgetWindow.setResizable(false);
        
        // 🔧 只移动窗口，使用锁定的初始尺寸（不使用getBounds的尺寸）
        const newBounds = {
          x: currentBounds.x + position.x,
          y: currentBounds.y + position.y,
          width: dragLockSize.width,    // 使用锁定的初始宽度
          height: dragLockSize.height   // 使用锁定的初始高度
        };
        
        console.log('🎯 [Main] 目标位置:', { 
          x: newBounds.x, 
          y: newBounds.y, 
          deltaX: position.x,
          deltaY: position.y
        });
        
        setBoundsStart = Date.now();
        // 使用 setBounds 一次性设置，禁用动画
        widgetWindow.setBounds(newBounds, false);
        setBoundsEnd = Date.now();
      } finally {
        // 🔧 无论如何都要恢复resize状态
        widgetWindow.setResizable(wasResizable);
        console.log('✅ [Main] Resize状态已恢复:', wasResizable);
      }
      
      const resultBounds = widgetWindow.getBounds();
      const actualDelta = {
        x: resultBounds.x - currentBounds.x,
        y: resultBounds.y - currentBounds.y
      };
      
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      const setBoundsDuration = setBoundsEnd - setBoundsStart;
      
      // 更新性能统计
      movePerf.count++;
      movePerf.totalTime += totalDuration;
      movePerf.maxTime = Math.max(movePerf.maxTime, totalDuration);
      movePerf.minTime = Math.min(movePerf.minTime, totalDuration);
      
      console.log('✅ [Main] 实际移动:', { 
        position: { x: resultBounds.x, y: resultBounds.y },
        size: { w: resultBounds.width, h: resultBounds.height },
        requestedDelta: position,
        actualDelta: actualDelta,
        deltaMatch: actualDelta.x === position.x && actualDelta.y === position.y
      });
      
      console.log('⏱️ [Main] 性能:', {
        total: `${totalDuration}ms`,
        setBounds: `${setBoundsDuration}ms`,
        overhead: `${totalDuration - setBoundsDuration}ms`,
        avg: `${(movePerf.totalTime / movePerf.count).toFixed(2)}ms`,
        min: `${movePerf.minTime}ms`,
        max: `${movePerf.maxTime}ms`,
        count: movePerf.count
      });
      
      // 🔑 关键：返回实际移动距离，让渲染进程调整
      return { 
        success: true, 
        position: { x: resultBounds.x, y: resultBounds.y },
        actualDelta: actualDelta  // 📍 新增：返回实际移动距离
      };
    } catch (error) {
      console.error('❌ [Main] Failed to move widget:', error);
      return { success: false, error: error.message };
    }
  }
  console.error('❌ [Main] Window not available');
  return { success: false, error: 'Window not available' };
});

// 拖动结束时重置目标尺寸
ipcMain.handle('widget-drag-end', () => {
  console.log('🏁 [Main] 拖动结束');
  
  // 🔧 释放尺寸锁定
  if (dragLockSize) {
    console.log('🔓 [Main] 释放拖动尺寸锁定:', dragLockSize);
    dragLockSize = null;
  }
  
  // 打印性能总结
  if (movePerf.count > 0) {
    console.log('📊 [Main] 拖动性能总结:', {
      totalMoves: movePerf.count,
      avgTime: `${(movePerf.totalTime / movePerf.count).toFixed(2)}ms`,
      minTime: `${movePerf.minTime}ms`,
      maxTime: `${movePerf.maxTime}ms`,
      totalTime: `${movePerf.totalTime}ms`
    });
  }
  
  // 重置性能统计
  movePerf = { count: 0, totalTime: 0, maxTime: 0, minTime: Infinity };
  
  return { success: true };
});

// Resize 性能追踪
let resizePerf = { count: 0, totalTime: 0, maxTime: 0, minTime: Infinity };

ipcMain.handle('widget-resize', (event, size) => {
  const startTime = Date.now();
  console.log('� [Main] 收到 widget-resize IPC:', size);
  
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    try {
      const sizeBefore = widgetWindow.getSize();
      const posBefore = widgetWindow.getPosition();
      console.log('📍 [Main] Resize前状态:', { 
        size: `${sizeBefore[0]}x${sizeBefore[1]}`, 
        pos: `(${posBefore[0]}, ${posBefore[1]})` 
      });
      
      const setSizeStart = Date.now();
      // 🔧 使用 setBounds 代替 setSize，性能更好且不会触发动画
      widgetWindow.setBounds({ 
        width: size.width, 
        height: size.height 
      }, false); // animate=false 避免等待动画
      const setSizeEnd = Date.now();
      
      const setBoundsDuration = setSizeEnd - setSizeStart;
      
      // 🔍 如果setBounds耗时超过50ms，打印警告
      if (setBoundsDuration > 50) {
        console.warn('⚠️ [Main] setBounds耗时异常:', {
          duration: `${setBoundsDuration}ms`,
          requestedSize: `${size.width}x${size.height}`,
          beforeSize: `${sizeBefore[0]}x${sizeBefore[1]}`,
          sizeDelta: `+${size.width - sizeBefore[0]}x+${size.height - sizeBefore[1]}`
        });
      }
      
      const sizeAfter = widgetWindow.getSize();
      const posAfter = widgetWindow.getPosition();
      
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      const overhead = totalDuration - setBoundsDuration;
      
      // 更新性能统计
      resizePerf.count++;
      resizePerf.totalTime += totalDuration;
      resizePerf.maxTime = Math.max(resizePerf.maxTime, totalDuration);
      resizePerf.minTime = Math.min(resizePerf.minTime, totalDuration);
      
      console.log('✅ [Main] Resize完成:', {
        requested: `${size.width}x${size.height}`,
        result: `${sizeAfter[0]}x${sizeAfter[1]}`,
        position: `(${posAfter[0]}, ${posAfter[1]})`,
        sizeMatch: sizeAfter[0] === size.width && sizeAfter[1] === size.height
      });
      
      console.log('⏱️ [Main] 性能:', {
        total: `${totalDuration}ms`,
        setBounds: `${setBoundsDuration}ms`,
        overhead: `${overhead}ms`,
        avg: `${(resizePerf.totalTime / resizePerf.count).toFixed(2)}ms`,
        min: `${resizePerf.minTime}ms`,
        max: `${resizePerf.maxTime}ms`,
        count: resizePerf.count
      });
      
      return { 
        success: true, 
        size: { width: sizeAfter[0], height: sizeAfter[1] },
        duration: totalDuration
      };
    } catch (error) {
      console.error('❌ [Main] Resize失败:', error);
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, error: 'Window not available' };
});

ipcMain.handle('widget-fullscreen', (event, isFullscreen) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (isFullscreen) {
      widgetWindow.setFullScreen(true);
    } else {
      widgetWindow.setFullScreen(false);
    }
  }
  return { success: true, isFullscreen };
});

// 创建小组件窗口的函数
function createWidgetWindow() {
  try {
    widgetWindow = new BrowserWindow({
      width: 772, // 🎯 调整初始宽度为 772px，防止 controller 按多行显示
      height: 525, // 按比例增加高度 (700/400 * 300 = 525)
      frame: false, // 无边框
      titleBarStyle: 'hidden', // 🎨 隐藏标题栏（macOS）
      titleBarOverlay: false, // 🎨 禁用标题栏覆盖（Windows 11）
      thickFrame: false, // 🎨 Windows：禁用粗边框
      movable: true, // 明确设置为可移动
      alwaysOnTop: false, // 🔧 不置顶，允许其他窗口覆盖
      transparent: true, // 透明背景
      backgroundColor: '#00000000', // 完全透明的背景
      resizable: true,
      hasShadow: false, // 🔧 透明窗口禁用阴影
      skipTaskbar: false, // 在任务栏显示
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: false,
        partition: 'persist:main' // 使用与主窗口相同的分区以共享存储
      }
    });

    // 加载小组件页面 - 使用 v3 版本（完全复刻测试页）
    const widgetUrl = isDev 
      ? 'http://localhost:3000/#/widget-v3' 
      : `file://${path.join(__dirname, '../build/index.html#/widget-v3')}`;
    
    console.log('Loading widget URL (v3):', widgetUrl);
    widgetWindow.loadURL(widgetUrl);

    // 🎨 Windows 系统特殊处理：强制移除边框
    if (process.platform === 'win32') {
      // 等待窗口显示后再次确保无边框
      widgetWindow.once('ready-to-show', () => {
        try {
          // 使用 Windows 原生 API 移除边框样式
          const hwnd = widgetWindow.getNativeWindowHandle();
          if (hwnd) {
            console.log('🎨 [Windows] 应用无边框样式到窗口句柄:', hwnd);
          }
        } catch (e) {
          console.warn('⚠️ [Windows] 无法应用原生样式:', e.message);
        }
      });
    }

    // 确保窗口可移动和可调整大小（覆盖任何之前的设置）
    widgetWindow.setMovable(true);
    widgetWindow.setResizable(true);
    console.log('✅ Widget window is movable and resizable');
    
    // 🔍 诊断日志：检查窗口属性
    console.log('📊 [Main] Widget window properties:', {
      isMovable: widgetWindow.isMovable(),
      isResizable: widgetWindow.isResizable(),
      isAlwaysOnTop: widgetWindow.isAlwaysOnTop(),
      hasShadow: widgetWindow.hasShadow(),
      size: widgetWindow.getSize(),
      position: widgetWindow.getPosition()
    });

    // Resize 节流控制
    let resizeTimeout = null;

    // 监听窗口事件（用于调试原生拖动）
    widgetWindow.on('resize', () => {
      const size = widgetWindow.getSize();
      console.log('🔄 [Main] Window resize event:', `${size[0]}x${size[1]}`);
      
      // 标记正在调整大小
      isResizing = true;
      
      // 清除之前的超时
      if (resizeTimeout) clearTimeout(resizeTimeout);
      
      // 100ms 后认为 resize 结束
      resizeTimeout = setTimeout(() => {
        isResizing = false;
        console.log('✅ [Main] Resize 完成');
      }, 100);
    });

    widgetWindow.on('move', () => {
      const pos = widgetWindow.getPosition();
      console.log('🚚 [Main] Window move event:', `(${pos[0]}, ${pos[1]})`);
    });

    widgetWindow.on('moved', () => {
      const pos = widgetWindow.getPosition();
      console.log('✅ [Main] Window moved (完成):', `(${pos[0]}, ${pos[1]})`);
    });

    widgetWindow.on('will-move', () => {
      console.log('🏃 [Main] Window will-move (即将移动)');
    });

    // 开发环境下打开开发工具
    if (isDev) {
      widgetWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // 窗口关闭时清理引用
    widgetWindow.on('closed', () => {
      // 🔗 关闭关联的设置窗口
      if (widgetSettingsWindow && !widgetSettingsWindow.isDestroyed()) {
        widgetSettingsWindow.close();
      }
      widgetWindow = null;
    });

    console.log('🪟 Widget window created successfully');
    return { action: 'created', success: true };
    
  } catch (error) {
    console.error('Failed to create widget window:', error);
    return { success: false, error: error.message };
  }
}

// 🎨 创建 Widget Settings 子窗口
function createWidgetSettingsWindow() {
  if (widgetSettingsWindow && !widgetSettingsWindow.isDestroyed()) {
    widgetSettingsWindow.focus();
    return { success: true, action: 'focused' };
  }

  if (!widgetWindow || widgetWindow.isDestroyed()) {
    console.warn('Widget window not found, cannot create settings window');
    return { success: false, error: 'Widget window not found' };
  }

  try {
    // 🎯 智能定位：获取 Widget 窗口位置和屏幕尺寸
    const { screen } = require('electron');
    const widgetBounds = widgetWindow.getBounds();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const settingsWidth = 380;
    const settingsHeight = 700;
    const margin = 10;

    // 🧠 判断挂载位置：默认右侧，距离屏幕右侧 < 400px 则左侧
    const distanceToRight = screenWidth - (widgetBounds.x + widgetBounds.width);
    const mountToLeft = distanceToRight < 400;

    let settingsX, settingsY;
    if (mountToLeft) {
      // 挂载到左侧
      settingsX = widgetBounds.x - settingsWidth - margin;
      console.log(`🎯 Settings 挂载到 Widget 左侧 (距离屏幕右侧仅 ${distanceToRight}px)`);
    } else {
      // 挂载到右侧
      settingsX = widgetBounds.x + widgetBounds.width + margin;
      console.log(`🎯 Settings 挂载到 Widget 右侧 (距离屏幕右侧 ${distanceToRight}px)`);
    }

    // 垂直对齐 Widget 顶部
    settingsY = widgetBounds.y;

    // 确保不超出屏幕边界
    settingsX = Math.max(0, Math.min(settingsX, screenWidth - settingsWidth));
    settingsY = Math.max(0, Math.min(settingsY, screenHeight - settingsHeight));

    widgetSettingsWindow = new BrowserWindow({
      width: settingsWidth,
      height: settingsHeight,
      x: settingsX,
      y: settingsY,
      frame: false, // 🎨 无边框（桌面卡片样式）
      titleBarStyle: 'hidden', // 🎨 隐藏标题栏（macOS）
      titleBarOverlay: false, // 🎨 禁用标题栏覆盖（Windows 11）
      thickFrame: true, // ✅ Windows：启用粗边框以支持 resize
      transparent: true, // 🎨 透明窗口
      backgroundColor: '#00000000', // 🎨 完全透明背景
      resizable: true, // ✅ 允许调整大小
      minWidth: 320, // 🎨 最小宽度
      minHeight: 400, // 🎨 最小高度
      minimizable: false, // ❌ 禁止最小化
      maximizable: false, // ❌ 禁止最大化
      hasShadow: false, // 🎨 禁用阴影
      alwaysOnTop: false, // 🎨 默认不置顶，跟随Widget状态
      skipTaskbar: true, // ✅ 不在任务栏显示（桌面组件样式）
      parent: widgetWindow, // ✅ 关联Widget窗口
      modal: false, // ❌ 非模态（不阻止 Widget 交互）
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        partition: 'persist:main'
      }
    });

    // 加载 Settings 页面
    const settingsUrl = isDev
      ? 'http://localhost:3000/#/widget-settings'
      : `file://${path.join(__dirname, '../build/index.html#/widget-settings')}`;

    console.log('Loading Widget Settings URL:', settingsUrl);
    widgetSettingsWindow.loadURL(settingsUrl);

    // 窗口准备好后显示
    widgetSettingsWindow.once('ready-to-show', () => {
      // 🔗 同步Widget的置顶状态
      const isWidgetOnTop = widgetWindow.isAlwaysOnTop();
      widgetSettingsWindow.setAlwaysOnTop(isWidgetOnTop);
      widgetSettingsWindow.show();
      console.log('✅ Widget Settings window shown at', { x: settingsX, y: settingsY, mountToLeft, alwaysOnTop: isWidgetOnTop });
    });

    // 🔗 监听Widget移动，设置窗口跟随
    const updateSettingsPosition = () => {
      if (widgetSettingsWindow && !widgetSettingsWindow.isDestroyed() && widgetWindow && !widgetWindow.isDestroyed()) {
        const { screen } = require('electron');
        const widgetBounds = widgetWindow.getBounds();
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        
        const settingsWidth = 380;
        const settingsHeight = 700;
        const margin = 10;
        
        // 判断挂载位置
        const distanceToRight = screenWidth - (widgetBounds.x + widgetBounds.width);
        const mountToLeft = distanceToRight < 400;
        
        let settingsX, settingsY;
        if (mountToLeft) {
          settingsX = widgetBounds.x - settingsWidth - margin;
        } else {
          settingsX = widgetBounds.x + widgetBounds.width + margin;
        }
        settingsY = widgetBounds.y;
        
        // 确保不超出屏幕
        settingsX = Math.max(0, Math.min(settingsX, screenWidth - settingsWidth));
        settingsY = Math.max(0, Math.min(settingsY, screenHeight - settingsHeight));
        
        widgetSettingsWindow.setPosition(settingsX, settingsY);
      }
    };

    // Widget移动时更新设置窗口位置
    widgetWindow.on('move', updateSettingsPosition);

    // 开发环境下打开开发工具
    if (isDev) {
      widgetSettingsWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // 窗口关闭时清理引用和监听器
    widgetSettingsWindow.on('closed', () => {
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.removeListener('move', updateSettingsPosition);
      }
      widgetSettingsWindow = null;
      console.log('🚪 Widget Settings window closed');
    });

    return { success: true, action: 'created', mountToLeft };
  } catch (error) {
    console.error('Failed to create Widget Settings window:', error);
    return { success: false, error: error.message };
  }
}

// 新版小组件API处理器
ipcMain.handle('widget-toggle', async (event, type, enabled) => {
  console.log(`Widget toggle: ${type} -> ${enabled}`);
  // 这里可以根据type创建不同类型的小组件
  if (enabled) {
    return createWidgetWindow();
  } else {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.close();
      widgetWindow = null;
    }
    return { success: true, action: 'closed' };
  }
});

ipcMain.handle('widget-update-config', (event, type, config) => {
  console.log(`Widget update config: ${type}`, config);
  return { success: true, type, config };
});

ipcMain.handle('widget-set-opacity', (event, type, opacity) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setOpacity(opacity);
  }
  return { success: true, type, opacity };
});

ipcMain.handle('widget-set-always-on-top', (event, type, alwaysOnTop) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.setAlwaysOnTop(alwaysOnTop);
  }
  return { success: true, type, alwaysOnTop };
});

ipcMain.handle('widget-close-typed', (event, type) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
  }
  return { success: true, type };
});

ipcMain.handle('widget-get-config', async (event, type) => {
  // 返回默认配置或从存储中获取
  return {
    enabled: false,
    opacity: 0.9,
    alwaysOnTop: true,
    position: { x: 100, y: 100 },
    size: { width: 400, height: 300 }
  };
});

ipcMain.handle('widget-save-position', (event, type, x, y) => {
  console.log(`Save position for ${type}: (${x}, ${y})`);
  return { success: true, type, position: { x, y } };
});

// 🎨 Widget Settings 子窗口管理
ipcMain.handle('widget-settings-open', () => {
  return createWidgetSettingsWindow();
});

ipcMain.handle('widget-settings-close', () => {
  if (widgetSettingsWindow && !widgetSettingsWindow.isDestroyed()) {
    widgetSettingsWindow.close();
    widgetSettingsWindow = null;
    return { success: true, action: 'closed' };
  }
  return { success: false, error: 'Settings window not found' };
});

ipcMain.handle('widget-save-size', (event, type, width, height) => {
  console.log(`Save size for ${type}: ${width}x${height}`);
  return { success: true, type, size: { width, height } };
});

// 开机自启动设置
ipcMain.handle('set-login-item-settings', async (event, settings) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.openAtLogin,
      path: settings.path || process.execPath
    });
    console.log('Login item settings updated:', settings);
    return { success: true };
  } catch (error) {
    console.error('Failed to set login item settings:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-login-item-settings', async () => {
  try {
    const settings = app.getLoginItemSettings();
    console.log('Login item settings:', settings);
    return settings;
  } catch (error) {
    console.error('Failed to get login item settings:', error);
    return {
      openAtLogin: false,
      openAsHidden: false,
      wasOpenedAtLogin: false,
      wasOpenedAsHidden: false,
      restoreState: false
    };
  }
});

// ========================================
// 🚀 AI 代理服务器管理
// ========================================

// 启动 AI 代理服务器
ipcMain.handle('start-ai-proxy', async () => {
  try {
    console.log('🚀 [AI Proxy] 启动代理服务器...');
    
    // 如果已经在运行，先停止
    if (proxyProcess) {
      console.log('⚠️ [AI Proxy] 代理已在运行，先停止现有进程');
      proxyProcess.kill();
      proxyProcess = null;
    }
    
    // 获取项目根目录
    const rootDir = isDev 
      ? path.join(__dirname, '..') 
      : path.join(process.resourcesPath, '..');
    
    const proxyDir = path.join(rootDir, 'ai-proxy');
    
    console.log('📁 [AI Proxy] 代理目录:', proxyDir);
    
    // Windows 使用 cmd，Linux/Mac 使用 sh
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : 'sh';
    const args = isWindows 
      ? ['/c', 'npm', 'start'] 
      : ['-c', 'npm start'];
    
    // 启动进程
    proxyProcess = spawn(shell, args, {
      cwd: proxyDir,
      stdio: 'pipe', // 捕获输出
      detached: false,
      windowsHide: false
    });
    
    console.log('✅ [AI Proxy] 进程已启动, PID:', proxyProcess.pid);
    
    // 监听输出
    proxyProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log('[AI Proxy]', output);
      
      // 发送日志到前端
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-proxy-log', { 
          type: 'info', 
          message: output 
        });
      }
    });
    
    proxyProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      console.error('[AI Proxy Error]', output);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-proxy-log', { 
          type: 'error', 
          message: output 
        });
      }
    });
    
    proxyProcess.on('error', (error) => {
      console.error('❌ [AI Proxy] 启动失败:', error.message);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-proxy-status', { 
          running: false, 
          error: error.message 
        });
      }
    });
    
    proxyProcess.on('exit', (code, signal) => {
      console.log(`⏹️ [AI Proxy] 进程退出 (code: ${code}, signal: ${signal})`);
      proxyProcess = null;
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-proxy-status', { 
          running: false 
        });
      }
    });
    
    // 等待500ms后检查进程是否还在运行
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const isRunning = proxyProcess && !proxyProcess.killed;
    
    if (isRunning) {
      console.log('✅ [AI Proxy] 代理服务器启动成功');
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai-proxy-status', { running: true });
      }
    }
    
    return { 
      success: isRunning, 
      pid: proxyProcess?.pid,
      message: isRunning ? '代理服务器启动成功' : '启动失败，请查看控制台'
    };
    
  } catch (error) {
    console.error('❌ [AI Proxy] 启动异常:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// 停止 AI 代理服务器
ipcMain.handle('stop-ai-proxy', async () => {
  try {
    if (!proxyProcess) {
      return { success: true, message: '代理服务器未运行' };
    }
    
    console.log('⏹️ [AI Proxy] 停止代理服务器...');
    
    proxyProcess.kill('SIGTERM');
    proxyProcess = null;
    
    console.log('✅ [AI Proxy] 代理服务器已停止');
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ai-proxy-status', { running: false });
    }
    
    return { success: true, message: '代理服务器已停止' };
    
  } catch (error) {
    console.error('❌ [AI Proxy] 停止失败:', error);
    return { success: false, error: error.message };
  }
});

// 检查 AI 代理服务器状态
ipcMain.handle('check-ai-proxy-status', async () => {
  const isRunning = proxyProcess && !proxyProcess.killed;
  return { 
    running: isRunning,
    pid: proxyProcess?.pid
  };
});

// ========================================
// 📎 附件管理 IPC Handlers
// ========================================

/**
 * 获取附件存储目录
 */
function getAttachmentsDir() {
  const userDataPath = app.getPath('userData');
  const attachmentsDir = path.join(userDataPath, 'attachments');
  
  // 确保目录存在
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }
  
  return attachmentsDir;
}

/**
 * 根据日期创建子目录（年/月）
 */
function getDateBasedPath() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return path.join(String(year), month);
}

/**
 * 保存附件
 */
ipcMain.handle('attachment:save', async (event, data) => {
  const startTime = Date.now();
  
  try {
    const { id, eventId, filename, mimeType, buffer, generateThumbnail, extractText } = data;
    
    console.log('[Attachment] 保存附件:', {
      id,
      eventId,
      filename,
      mimeType,
      size: `${(buffer.length / 1024).toFixed(2)} KB`,
      generateThumbnail,
      extractText,
    });
    
    // 1. 确定存储路径（按类型分类）
    const attachmentsDir = getAttachmentsDir();
    let category = 'documents';
    if (mimeType.startsWith('image/')) category = 'images';
    else if (mimeType.startsWith('video/')) category = 'videos';
    else if (mimeType.startsWith('audio/')) category = 'audio';
    
    const dateBasedPath = getDateBasedPath();
    const targetDir = path.join(attachmentsDir, category, dateBasedPath);
    
    // 2. 创建目录
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 3. 生成唯一文件名
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);
    const uniqueFilename = `${basename}_${id}${ext}`;
    const filePath = path.join(targetDir, uniqueFilename);
    
    // 4. 保存文件
    const fileBuffer = Buffer.from(buffer);
    fs.writeFileSync(filePath, fileBuffer);
    
    console.log('[Attachment] ✅ 文件已保存:', filePath);
    
    // 5. 生成缩略图（仅图片）
    let thumbnailPath = null;
    if (category === 'images' && generateThumbnail) {
      try {
        // 注意：这里需要 sharp 库，如果没有安装则跳过
        // 可以在后续迭代中添加
        console.log('[Attachment] ⏭️ 缩略图生成跳过（需安装 sharp）');
      } catch (error) {
        console.warn('[Attachment] ⚠️ 缩略图生成失败:', error.message);
      }
    }
    
    // 6. 提取文本（图片OCR/PDF）
    if (extractText) {
      try {
        // 注意：需要 tesseract.js 或 pdf-parse，后续迭代添加
        console.log('[Attachment] ⏭️ 文本提取跳过（需安装 OCR 库）');
      } catch (error) {
        console.warn('[Attachment] ⚠️ 文本提取失败:', error.message);
      }
    }
    
    // 7. 保存到数据库（SQLite attachments 表）
    if (Database && db) {
      try {
        db.prepare(`
          INSERT INTO attachments (
            id, event_id, filename, file_size, mime_type,
            local_path, status, uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          eventId,
          filename,
          buffer.length,
          mimeType,
          path.relative(attachmentsDir, filePath),
          'local-only',
          formatTimeForStorage(new Date())
        );
        
        console.log('[Attachment] ✅ 数据库记录已创建');
      } catch (dbError) {
        console.error('[Attachment] ❌ 数据库保存失败:', dbError.message);
      }
    }
    
    const duration = Date.now() - startTime;
    performanceMonitor.recordIPC('attachment:save', duration);
    
    return {
      success: true,
      localPath: path.relative(attachmentsDir, filePath),
      fullPath: filePath,
      thumbnailPath,
      duration: `${duration}ms`,
    };
    
  } catch (error) {
    console.error('[Attachment] ❌ 保存失败:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * 获取附件完整路径
 */
ipcMain.handle('attachment:getPath', async (event, attachmentId) => {
  try {
    if (!Database || !db) {
      throw new Error('数据库未初始化');
    }
    
    const attachment = db.prepare(`
      SELECT local_path FROM attachments WHERE id = ? AND deleted_at IS NULL
    `).get(attachmentId);
    
    if (!attachment) {
      throw new Error('附件不存在');
    }
    
    const attachmentsDir = getAttachmentsDir();
    const fullPath = path.join(attachmentsDir, attachment.local_path);
    
    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      throw new Error('附件文件不存在');
    }
    
    return {
      success: true,
      path: fullPath,
    };
    
  } catch (error) {
    console.error('[Attachment] ❌ 获取路径失败:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * 获取缩略图路径
 */
ipcMain.handle('attachment:getThumbnail', async (event, attachmentId) => {
  try {
    if (!Database || !db) {
      throw new Error('数据库未初始化');
    }
    
    const attachment = db.prepare(`
      SELECT thumbnail_path FROM attachments WHERE id = ? AND deleted_at IS NULL
    `).get(attachmentId);
    
    if (!attachment || !attachment.thumbnail_path) {
      return { success: false, path: null };
    }
    
    const attachmentsDir = getAttachmentsDir();
    const fullPath = path.join(attachmentsDir, attachment.thumbnail_path);
    
    return {
      success: true,
      path: fs.existsSync(fullPath) ? fullPath : null,
    };
    
  } catch (error) {
    console.error('[Attachment] ❌ 获取缩略图失败:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * 删除附件
 */
ipcMain.handle('attachment:delete', async (event, attachmentId) => {
  try {
    if (!Database || !db) {
      throw new Error('数据库未初始化');
    }
    
    // 1. 查询附件信息
    const attachment = db.prepare(`
      SELECT local_path, thumbnail_path FROM attachments 
      WHERE id = ? AND deleted_at IS NULL
    `).get(attachmentId);
    
    if (!attachment) {
      throw new Error('附件不存在');
    }
    
    const attachmentsDir = getAttachmentsDir();
    
    // 2. 删除文件
    const filePath = path.join(attachmentsDir, attachment.local_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[Attachment] ✅ 文件已删除:', filePath);
    }
    
    // 3. 删除缩略图
    if (attachment.thumbnail_path) {
      const thumbnailPath = path.join(attachmentsDir, attachment.thumbnail_path);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
        console.log('[Attachment] ✅ 缩略图已删除');
      }
    }
    
    // 4. 更新数据库（软删除）
    db.prepare(`
      UPDATE attachments SET deleted_at = ? WHERE id = ?
    `).run(formatTimeForStorage(new Date()), attachmentId);
    
    return {
      success: true,
      message: '附件已删除',
    };
    
  } catch (error) {
    console.error('[Attachment] ❌ 删除失败:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * 获取事件的所有附件
 */
ipcMain.handle('attachment:getByEvent', async (event, eventId) => {
  try {
    if (!Database || !db) {
      throw new Error('数据库未初始化');
    }
    
    const attachments = db.prepare(`
      SELECT * FROM attachments 
      WHERE event_id = ? AND deleted_at IS NULL
      ORDER BY uploaded_at DESC
    `).all(eventId);
    
    return {
      success: true,
      attachments: attachments.map(att => ({
        id: att.id,
        filename: att.filename,
        size: att.file_size,
        mimeType: att.mime_type,
        localPath: att.local_path,
        status: att.status,
        uploadedAt: att.uploaded_at,
      })),
    };
    
  } catch (error) {
    console.error('[Attachment] ❌ 查询失败:', error.message);
    return {
      success: false,
      error: error.message,
      attachments: [],
    };
  }
});

/**
 * 打开附件（使用系统默认应用）
 */
ipcMain.handle('attachment:open', async (event, attachmentId) => {
  try {
    const result = await ipcMain.emit('attachment:getPath', event, attachmentId);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    await shell.openPath(result.path);
    
    return {
      success: true,
      message: '已打开附件',
    };
    
  } catch (error) {
    console.error('[Attachment] ❌ 打开失败:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
});

// 应用退出时清理代理进程
app.on('before-quit', () => {
  if (proxyProcess) {
    console.log('🧹 [AI Proxy] 清理代理进程...');
    proxyProcess.kill();
    proxyProcess = null;
  }
});

console.log('🚀 Electron main process started');