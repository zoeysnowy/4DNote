/**
 * Electron 窗口管理器
 * 管理多个事件编辑器窗口
 */
const { BrowserWindow } = require('electron');
const path = require('path');

class WindowManager {
  constructor() {
    // 存储所有打开的编辑器窗口 { eventId: BrowserWindow }
    this.editorWindows = new Map();
    this.mainWindow = null;
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }

  /**
   * 创建或激活事件编辑器窗口
   * @param {string} eventId - 事件 ID
   * @param {object} eventData - 事件数据
   */
  openEventEditor(eventId, eventData) {
    // 如果窗口已存在，激活它
    if (this.editorWindows.has(eventId)) {
      const existingWindow = this.editorWindows.get(eventId);
      if (!existingWindow.isDestroyed()) {
        existingWindow.focus();
        return existingWindow;
      } else {
        // 窗口已销毁，从 Map 中移除
        this.editorWindows.delete(eventId);
      }
    }

    // 创建新窗口
    const editorWindow = new BrowserWindow({
      width: 800,
      height: 600,
      parent: this.mainWindow, // 设置父窗口
      modal: false, // 非模态窗口
      title: `编辑事件 - ${eventData.title || '未命名'}`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      backgroundColor: '#ffffff',
      show: false, // 先不显示，等加载完再显示
    });

    // 加载事件编辑器页面
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      editorWindow.loadURL(`http://localhost:5173/event-editor/${eventId}`);
    } else {
      editorWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: `/event-editor/${eventId}`
      });
    }

    // 窗口准备好后显示
    editorWindow.once('ready-to-show', () => {
      editorWindow.show();
      // 发送事件数据到渲染进程
      editorWindow.webContents.send('event-data', eventData);
    });

    // 窗口关闭时清理
    editorWindow.on('closed', () => {
      this.editorWindows.delete(eventId);
    });

    // 保存到 Map
    this.editorWindows.set(eventId, editorWindow);

    return editorWindow;
  }

  /**
   * 关闭指定事件的编辑器窗口
   */
  closeEventEditor(eventId) {
    const window = this.editorWindows.get(eventId);
    if (window && !window.isDestroyed()) {
      window.close();
    }
    this.editorWindows.delete(eventId);
  }

  /**
   * 关闭所有编辑器窗口
   */
  closeAllEditors() {
    for (const [eventId, window] of this.editorWindows.entries()) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
    this.editorWindows.clear();
  }

  /**
   * 获取所有打开的编辑器窗口数量
   */
  getEditorCount() {
    return this.editorWindows.size;
  }

  /**
   * 通知所有编辑器窗口事件已更新
   */
  notifyEventUpdate(eventId, updatedData) {
    const window = this.editorWindows.get(eventId);
    if (window && !window.isDestroyed()) {
      window.webContents.send('event-updated', updatedData);
    }
  }

  /**
   * 广播事件更新到主窗口
   */
  broadcastToMain(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

module.exports = new WindowManager();
