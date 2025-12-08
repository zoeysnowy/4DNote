/**
 * 环境检测工具
 * 检测是否在 Electron 环境中运行
 */

/**
 * 检测是否在 Electron 环境中
 */
export const isElectron = (): boolean => {
  // 方法1: 检查 electronAPI
  if (typeof window !== 'undefined' && window.electronAPI) {
    return true;
  }

  // 方法2: 检查 process (Electron preload 暴露的)
  if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
    return true;
  }

  // 方法3: 检查 userAgent
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    return navigator.userAgent.toLowerCase().includes('electron');
  }

  return false;
};

/**
 * 检测是否支持多窗口功能
 */
export const supportsMultiWindow = (): boolean => {
  return isElectron() && 
         typeof window !== 'undefined' && 
         window.electronAPI?.window?.openEventEditor !== undefined;
};

/**
 * 在 Electron 中打开事件编辑器窗口
 */
export const openEventInWindow = async (eventId: string, eventData: any): Promise<boolean> => {
  if (!supportsMultiWindow()) {
    console.warn('Multi-window not supported in current environment');
    return false;
  }

  try {
    const result = await window.electronAPI.window.openEventEditor(eventId, eventData);
    return result?.success ?? false;
  } catch (error) {
    console.error('Failed to open event editor window:', error);
    return false;
  }
};

/**
 * 关闭事件编辑器窗口
 */
export const closeEventWindow = async (eventId: string): Promise<boolean> => {
  if (!supportsMultiWindow()) {
    return false;
  }

  try {
    const result = await window.electronAPI.window.closeEventEditor(eventId);
    return result?.success ?? false;
  } catch (error) {
    console.error('Failed to close event editor window:', error);
    return false;
  }
};

/**
 * 获取打开的编辑器窗口数量
 */
export const getEditorWindowCount = async (): Promise<number> => {
  if (!supportsMultiWindow()) {
    return 0;
  }

  try {
    return await window.electronAPI.window.getEditorCount();
  } catch (error) {
    console.error('Failed to get editor window count:', error);
    return 0;
  }
};
