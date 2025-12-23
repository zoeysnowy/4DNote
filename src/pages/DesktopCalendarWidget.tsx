/**
 * DesktopCalendarWidget - Electron 桌面窗口页面（全屏模式）
 * 完全复刻 DesktopCalendarWidgetV3 的样式和透明度逻辑
 * 但布局适配 Electron 全屏窗口（不使用 position: fixed�?
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import TimeCalendar from '../features/Calendar/TimeCalendar'; // Calendar 模块
import { MicrosoftCalendarService } from '../services/MicrosoftCalendarService';
import { ActionBasedSyncManager } from '../services/ActionBasedSyncManager';
import { logger } from '../utils/logger';
import '../features/Calendar/styles/DesktopCalendarWidget.css'; // Desktop Widget 样式
import SyncIcon from '../assets/icons/Sync.svg';
import OutlookIcon from '../assets/icons/Outlook.svg';

const widgetLogger = logger.module('Widget');

// �?修复：移除过度优化的memo，让TimeCalendar正常响应内部数据变化
// TimeCalendar内部使用useState和useEffect管理数据，应该允许正常重渲染
// 原memo逻辑会阻止响应localStorage和事件监听器的数据更�?
const MemoizedTimeCalendar = TimeCalendar;

interface CustomCSSProperties extends React.CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag';
}

const DesktopCalendarWidget: React.FC = () => {
  // 生成或读取唯一�?Widget ID
  const [widgetId] = useState(() => {
    // 1. 尝试�?URL 参数读取
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('widgetId');
    if (urlId) {
      return urlId;
    }
    
    // 2. 尝试�?localStorage 读取
    const savedId = localStorage.getItem('4dnote-widget-instance-id');
    if (savedId) {
      return savedId;
    }
    
    // 3. 生成新的 ID 并保�?
    const newId = `widget-${Date.now()}`;
    localStorage.setItem('4dnote-widget-instance-id', newId);
    return newId;
  });

  // 生成唯一的存�?key
  const storageKey = `remarkable-widget-settings-${widgetId}`;
  
  // 🔧 Widget 不应该有自己的服务实例，只使用全局实例
  const [microsoftService, setMicrosoftService] = useState<any>(null);
  
  // 🔧 持续检查全局服务，直到主应用初始化完�?
  useEffect(() => {
    const checkGlobalService = () => {
      if (typeof window !== 'undefined' && (window as any).microsoftCalendarService) {
        const globalService = (window as any).microsoftCalendarService;
        widgetLogger.log('�?[Widget] 找到全局 microsoftCalendarService');
        setMicrosoftService(globalService);
        return true; // 找到�?
      }
      widgetLogger.log('�?[Widget] 等待全局 microsoftCalendarService...');
      return false; // 还没找到
    };
    
    // 立即检查一�?
    if (checkGlobalService()) {
      return; // 如果找到了就不需要后续检�?
    }
    
    // 每秒检查一次，直到找到为止
    const intervalId = setInterval(() => {
      if (checkGlobalService()) {
        clearInterval(intervalId);
      }
    }, 1000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []); // 空依赖数组，只在挂载时执行一�?
  
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [updatedEventCount, setUpdatedEventCount] = useState(0); // 🔧 追踪同步更新的事件数�?
  const [isAuthenticated, setIsAuthenticated] = useState(false); // 🔧 追踪认证状�?
  
  // 📊 详细同步统计
  const [syncStats, setSyncStats] = useState({
    syncFailed: 0,
    calendarCreated: 0,
    syncSuccess: 0
  });
  
  const [isLocked, setIsLocked] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null); // 定时器引�?

  // 样式控制 - 简化版：只控制日历背景
  // 使用 lazy initialization 确保在首次渲染前就加载设�?
  const [bgOpacity, setBgOpacity] = useState(() => {
    const savedSettings = localStorage.getItem('desktop-calendar-widget-settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        const opacity = settings.bgOpacity !== undefined ? settings.bgOpacity : 0.95;
        return opacity;
      } catch (e) {
        widgetLogger.error('Failed to parse widget settings for opacity', e);
      }
    }
    return 0.95;
  });
  
  const [bgColor, setBgColor] = useState(() => {
    const savedSettings = localStorage.getItem('desktop-calendar-widget-settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        const color = settings.bgColor || '#ffffff';
        return color;
      } catch (e) {
        widgetLogger.error('Failed to parse widget settings for color', e);
      }
    }
    return '#ffffff';
  });

  // 自适应颜色计算函数
  const getAdaptiveColors = useMemo(() => {
    const r = parseInt(bgColor.slice(1,3), 16);
    const g = parseInt(bgColor.slice(3,5), 16);
    const b = parseInt(bgColor.slice(5,7), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const isDark = luminance < 128;
    
    return {
      isDark,
      textPrimary: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.87)',
      textSecondary: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
      iconFilter: isDark ? 'brightness(1.2)' : 'none',
      buttonBg: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      buttonHoverBg: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
    };
  }, [bgColor]);

  const widgetRef = useRef<HTMLDivElement>(null);
  
  // 调整大小状�?
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number; edge: string } | null>(null);
  const resizeThrottleRef = useRef<number>(0); // 节流用的时间�?
  
  // Resize 性能追踪
  const resizePerfRef = useRef({ count: 0, totalTime: 0, maxTime: 0, minTime: Infinity });
  const lastResizeTimeRef = useRef<number>(0);
  const resizeIpcBusyRef = useRef<boolean>(false); // IPC忙碌标志
  
  // 拖动状�?- 恢复自定义拖动实�?
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragThrottleRef = useRef<number>(0);
  
  // 性能追踪
  const perfRef = useRef<{
    moveCount: number;
    totalTime: number;
    maxTime: number;
    minTime: number;
  }>({ moveCount: 0, totalTime: 0, maxTime: 0, minTime: Infinity });
  
  // �?新增：IPC忙碌标志和delta累积
  const ipcBusyRef = useRef<boolean>(false);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const sentMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // 追踪已发送的总移动量
  
  // 调整大小光标悬停状态（保持3秒）
  const [isResizeHovering, setIsResizeHovering] = useState(false);
  const resizeHoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  // �?localStorage 读取锁定状态并同步到主进程
  useEffect(() => {
    const savedSettings = localStorage.getItem('desktop-calendar-widget-settings');
    
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        const locked = settings.isLocked || false;
        
        setIsLocked(locked);
        
        // 同步锁定状态到 Electron 主进�?
        if (window.electronAPI?.widgetLock) {
          window.electronAPI.widgetLock(locked).catch((error: Error) => {
            widgetLogger.error('Failed to sync lock state:', error);
          });
        }
      } catch (e) {
        widgetLogger.error('Failed to parse widget settings for lock state', e);
      }
    } else {
      // 确保主进程也是解锁状�?
      if (window.electronAPI?.widgetLock) {
        window.electronAPI.widgetLock(false);
      }
    }
  }, []);

  // 保存设置（防抖）
  useEffect(() => {
    const t = setTimeout(() => {
      const settings = { bgOpacity, bgColor, isLocked };
      localStorage.setItem('desktop-calendar-widget-settings', JSON.stringify(settings));
    }, 500);
    return () => clearTimeout(t);
  }, [bgOpacity, bgColor, isLocked]);

  // 🔔 监听 Widget Settings 窗口的更新（通过 IPC 消息）
  useEffect(() => {
    if (!window.electronAPI?.onWidgetSettingsUpdate) {
      widgetLogger.warn('⚠️ [Widget] IPC 通信不可用');
      return;
    }

    const removeListener = window.electronAPI.onWidgetSettingsUpdate((settings: any) => {
      widgetLogger.log('🎨 [Widget] 收到设置更新:', settings);
      if (settings.bgOpacity !== undefined) {
        console.log('🔹 [Widget] 设置透明度:', settings.bgOpacity, '原值:', bgOpacity);
        setBgOpacity(settings.bgOpacity);
      }
      if (settings.bgColor) {
        console.log('🔹 [Widget] 设置颜色:', settings.bgColor, '原值:', bgColor);
        setBgColor(settings.bgColor);
      }
      if (settings.isLocked !== undefined) {
        console.log('🔹 [Widget] 设置锁定:', settings.isLocked, '原值:', isLocked);
        setIsLocked(settings.isLocked);
      }
    });

    return removeListener;
  }, []);

  // 初始�?widget-mode 样式
  useEffect(() => {
    widgetLogger.log('🎨 [Renderer] DesktopCalendarWidget mounted');
    widgetLogger.log('🔍 [Renderer] 检�?electronAPI:', {
      hasElectronAPI: !!window.electronAPI,
      hasWidgetMove: !!window.electronAPI?.widgetMove
    });
    
    document.body.classList.add('widget-mode');
    document.body.style.backgroundColor = 'transparent';
    document.body.style.overflow = 'hidden'; // ✅ 恢复 hidden，避免滚动条
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    
    // ✅ v2.21.1: 使用 queueMicrotask 替代 setTimeout(0)
    queueMicrotask(() => {
      const dragBar = document.querySelector('.drag-bar') as HTMLElement;
      if (dragBar) {
        const computedStyle = window.getComputedStyle(dragBar);
        widgetLogger.log('�?[Renderer] Drag bar found:', {
          element: dragBar,
          webkitAppRegion: computedStyle.getPropertyValue('-webkit-app-region'),
          pointerEvents: computedStyle.pointerEvents,
          cursor: computedStyle.cursor,
          position: computedStyle.position,
          zIndex: computedStyle.zIndex,
          width: computedStyle.width,
          height: computedStyle.height
        });
      } else {
        widgetLogger.error('�?[Renderer] Drag bar NOT found!');
      }
    }, 500);
    
    return () => {
      document.body.classList.remove('widget-mode');
      document.body.style.backgroundColor = '';
      document.body.style.overflow = '';
      document.body.style.margin = '';
      document.body.style.padding = '';
    };
  }, []);

  // 🔄 使用全局同步管理器，确保与主应用数据一�?
  useEffect(() => {
    const checkAuthAndInitSync = () => {
      // 🔧 只使�?localStorage 中的认证状态（主应用会更新这个标记�?
      const storedAuthState = localStorage.getItem('4dnote-outlook-authenticated') === 'true';
      
      widgetLogger.log('🔍 [Widget] 检查认证状�?', {
        storedAuthState,
        hasMicrosoftService: !!microsoftService
      });
      
      // 更新认证状�?
      setIsAuthenticated(storedAuthState);
      
      // 🔧 �?Electron 环境中，Widget 和主应用是独立的 window 对象
      // 不需要尝试获取全局 syncManager，直接从 localStorage 读取即可
    };
    
    // 只有�?microsoftService 存在时才检�?
    if (microsoftService) {
      checkAuthAndInitSync();
    } else {
      widgetLogger.log('�?[Widget] 等待 microsoftService 初始�?..');
    }
    
    // 🔧 监听 localStorage 变化（实时响应主应用的认证状态更新）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === '4dnote-outlook-authenticated') {
        widgetLogger.log('🔔 [Widget] 检测到认证状态变�?', e.newValue);
        checkAuthAndInitSync();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // 定期检查认证状态（�?0秒）
    const authCheckInterval = setInterval(checkAuthAndInitSync, 30000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(authCheckInterval);
    };
  }, [microsoftService]);

  // 🔄 定期更新 lastSyncTime �?updatedEventCount（只�?localStorage 读取�?
  useEffect(() => {
    const updateSyncStatus = () => {
      try {
        // 🔧 �?localStorage 读取同步时间（Electron 窗口间通信方式�?
        const storedTime = localStorage.getItem('lastSyncTime');
        if (storedTime) {
          try {
            const parsedTime = new Date(storedTime);
            if (!isNaN(parsedTime.getTime())) {
              widgetLogger.log('🕐 [Widget] �?localStorage 读取同步时间:', parsedTime.toLocaleString('zh-CN'));
              setLastSyncTime(parsedTime);
            }
          } catch (parseError) {
            widgetLogger.error('❌ [Widget] 解析同步时间失败:', parseError);
          }
        } else {
          widgetLogger.log('⚠️ [Widget] localStorage 中暂无同步时间');
        }

        // 🔧 �?localStorage 读取更新事件数量
        const storedEventCount = localStorage.getItem('lastSyncEventCount');
        if (storedEventCount) {
          const count = parseInt(storedEventCount, 10);
          if (!isNaN(count)) {
            widgetLogger.log('📊 [Widget] �?localStorage 读取事件数量:', count);
            setUpdatedEventCount(count);
          }
        }
        
        // 📊 �?localStorage 读取同步统计信息
        const storedSyncStats = localStorage.getItem('syncStats');
        if (storedSyncStats) {
          try {
            const stats = JSON.parse(storedSyncStats);
            widgetLogger.log('📊 [Widget] �?localStorage 读取同步统计:', stats);
            setSyncStats(stats);
          } catch (e) {
            widgetLogger.error('�?[Widget] 解析同步统计失败:', e);
          }
        }
      } catch (error) {
        widgetLogger.error('�?[Widget] 获取同步状态失�?', error);
      }
    };
    
    // 立即更新一�?
    widgetLogger.log('🔄 [Widget] 开始监听同步状态更�?..');
    updateSyncStatus();
    
    // 监听 localStorage 变化（实时响应主应用的同步完成）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'lastSyncTime' || e.key === 'lastSyncEventCount' || e.key === 'syncStats') {
        widgetLogger.log('🔔 [Widget] 检测到同步状态变�?', e.key, '=', e.newValue);
        updateSyncStatus();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // �?0秒轮询一次（兜底�?
    const syncStatusInterval = setInterval(updateSyncStatus, 10000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(syncStatusInterval);
    };
  }, []); // 🔧 不依赖任何状态，只依�?localStorage

  // 移除控制栏自动显示逻辑，不再需�?
  // useEffect(() => {
  //   const handleMouseMove = (e: MouseEvent) => {
  //     const isNearTop = e.clientY <= 10;
  //     if (isNearTop) {
  //       setShowControls(true);
  //       if (hideTimerRef.current) {
  //         clearTimeout(hideTimerRef.current);
  //       }
  //       hideTimerRef.current = setTimeout(() => {
  //         setShowControls(false);
  //       }, 5000);
  //     }
  //   };
  //   window.addEventListener('mousemove', handleMouseMove);
  //   return () => {
  //     window.removeEventListener('mousemove', handleMouseMove);
  //     if (hideTimerRef.current) {
  //       clearTimeout(hideTimerRef.current);
  //     }
  //   };
  // }, []);

  // 动态注�?CSS 控制日历内部元素透明�?
  // 移除错误的动态CSS注入逻辑
  // calendar.css 中的静态样式已经足够，不需要动态覆�?
  // bgOpacity 只应该影�?TimeCalendar �?backgroundColor，不应该影响内部元素

  // 锁定切换（调�?Electron API�?- 使用 useCallback 优化
  const handleLockToggle = useCallback(async (newLockState?: boolean) => {
    const targetState = newLockState !== undefined ? newLockState : !isLocked;
    widgetLogger.log('🔄 handleLockToggle called:', { current: isLocked, target: targetState });
    
    setIsLocked(targetState);
    
    if (window.electronAPI?.widgetLock) {
      try {
        const result = await window.electronAPI.widgetLock(targetState);
        widgetLogger.log('�?Widget lock state changed:', { locked: targetState, result });
      } catch (error) {
        widgetLogger.error('�?Failed to set widget lock:', error);
      }
    } else {
      widgetLogger.warn('⚠️ electronAPI.widgetLock not available');
    }
  }, [isLocked]);

  // 调整大小处理
  const handleResizeStart = useCallback((edge: string, e: React.MouseEvent) => {
    widgetLogger.log('🎯 [Resize] handleResizeStart 被调�?', { edge, isLocked });
    if (isLocked) {
      widgetLogger.log('�?[Resize] �?isLocked 阻止');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    
    widgetLogger.log('�?[Resize] 开始调整大�?', edge);
    setIsResizing(true);
    const bounds = widgetRef.current?.getBoundingClientRect();
    if (bounds) {
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: bounds.width,
        height: bounds.height,
        edge
      };
      widgetLogger.log('📐 [Resize] 初始尺寸:', { width: bounds.width, height: bounds.height });
    }
  }, [isLocked]);

  // 调整大小手柄悬停处理（保�?秒）
  const handleResizeHover = useCallback(() => {
    setIsResizeHovering(true);
    
    // 清除之前的计时器
    if (resizeHoverTimerRef.current) {
      clearTimeout(resizeHoverTimerRef.current);
    }
    
    // 🎯 2秒后隐藏（满�?至少维持2�?的要求）
    resizeHoverTimerRef.current = setTimeout(() => {
      setIsResizeHovering(false);
    }, 2000);
  }, []);

  const handleResizeLeave = useCallback(() => {
    // 不立即隐藏，等待计时�?
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeStartRef.current) return;
    
    const startTime = Date.now();
    const timeSinceLastResize = lastResizeTimeRef.current ? startTime - lastResizeTimeRef.current : 0;
    lastResizeTimeRef.current = startTime;
    
    const { x, y, width, height, edge } = resizeStartRef.current;
    const deltaX = e.clientX - x;
    const deltaY = e.clientY - y;
    
    let newWidth = width;
    let newHeight = height;
    
    if (edge.includes('right')) newWidth = width + deltaX;
    if (edge.includes('left')) newWidth = width - deltaX;
    if (edge.includes('bottom')) newHeight = height + deltaY;
    if (edge.includes('top')) newHeight = height - deltaY;
    
    // 最小尺寸限�?
    newWidth = Math.max(400, newWidth);
    newHeight = Math.max(300, newHeight);
    
    // 🔧 激进的节流：拖动中�?00ms最多更新一次（减少渲染次数�?
    const now = Date.now();
    if (now - resizeThrottleRef.current < 100) {
      // 静默跳过，不打印日志
      return;
    }
    resizeThrottleRef.current = now;
    
    // 🔧 如果上一个resize IPC还在处理中，跳过本次请求
    if (resizeIpcBusyRef.current) {
      return;
    }
    
    // 调用Electron API调整窗口大小
    if (window.electronAPI?.widgetResize) {
      resizeIpcBusyRef.current = true; // 标记忙碌
      const ipcStart = Date.now();
      window.electronAPI.widgetResize({ width: Math.round(newWidth), height: Math.round(newHeight) })
        .then((result: any) => {
          resizeIpcBusyRef.current = false; // 重置忙碌标志
          const ipcEnd = Date.now();
          const ipcDuration = ipcEnd - ipcStart;
          
          // 更新性能统计
          resizePerfRef.current.count++;
          resizePerfRef.current.totalTime += ipcDuration;
          resizePerfRef.current.maxTime = Math.max(resizePerfRef.current.maxTime, ipcDuration);
          resizePerfRef.current.minTime = Math.min(resizePerfRef.current.minTime, ipcDuration);
        })
        .catch((error: any) => {
          resizeIpcBusyRef.current = false; // 出错也要重置
          widgetLogger.error('�?[Renderer] widgetResize 失败:', error);
        });
    }
  }, [isResizing]); // 移除 isDragging 依赖

  const handleResizeEnd = useCallback(async (event?: MouseEvent) => {
    widgetLogger.log('🏁 [Resize] handleResizeEnd 被调�?', { isResizing, hasEvent: !!event });
    if (!isResizing) {
      widgetLogger.log('⚠️ [Resize] isResizing=false, 跳过结束逻辑');
      return;
    }
    
    widgetLogger.log('�?[Resize] 结束 resize');
    
    // 如果有event，立即应用最终尺�?
    if (event && resizeStartRef.current) {
      const deltaX = event.clientX - resizeStartRef.current.x;
      const deltaY = event.clientY - resizeStartRef.current.y;
      const newWidth = Math.max(400, resizeStartRef.current.width + deltaX);
      const newHeight = Math.max(300, resizeStartRef.current.height + deltaY);
      
      widgetLogger.log('📐 [Resize] 应用最终尺�?', { newWidth, newHeight });
      
      // 强制应用最终尺�?
      try {
        await window.electronAPI.widgetResize({
          width: newWidth,
          height: newHeight
        });
      } catch (error) {
        widgetLogger.error('�?应用最终尺寸失�?', error);
      }
    }
    
    // 重置IPC忙碌标志
    resizeIpcBusyRef.current = false;
    
    // 重置性能统计
    resizePerfRef.current = { count: 0, totalTime: 0, maxTime: 0, minTime: Infinity };
    lastResizeTimeRef.current = 0;
    
    setIsResizing(false);
    resizeStartRef.current = null;
    widgetLogger.log('�?[Resize] 状态已重置');
  }, [isResizing]);

  // 监听鼠标移动和释�?
  useEffect(() => {
    if (isResizing) {
      widgetLogger.log('👂 [Resize] 添加 mousemove 和 mouseup 监听器');
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        widgetLogger.log('🔇 [Resize] 移除 mousemove 和 mouseup 监听器');
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // 拖动处理 - 简化版，依赖主进程的尺寸恢复机�?
  // ===== 拖动相关逻辑 - 自定义拖动实�?=====
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isLocked || isResizing) {
      widgetLogger.log('🚫 [Renderer] 拖动被阻�?', { isLocked, isResizing });
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // 重置性能统计
    perfRef.current = { moveCount: 0, totalTime: 0, maxTime: 0, minTime: Infinity };
    
    widgetLogger.log('🎬 [Renderer] 开始拖�?', { screenX: e.screenX, screenY: e.screenY });
    setIsDragging(true);
    dragStartRef.current = {
      x: e.screenX,
      y: e.screenY
    };
  }, [isLocked, isResizing]);

  const handleDragMove = useCallback(async (e: MouseEvent) => {
    if (!isDragging || !dragStartRef.current || isResizing) {
      return;
    }
    
    const now = Date.now();
    const timeSinceLastMove = now - dragThrottleRef.current;
    
    e.preventDefault();
    e.stopPropagation();
    
    // 🔧 计算相对于拖动起始点的总移动量
    const totalMoveX = e.screenX - dragStartRef.current.x;
    const totalMoveY = e.screenY - dragStartRef.current.y;
    
    // 🔧 计算还未发送的增量 = 总移动量 - 已发送量
    const deltaX = totalMoveX - sentMoveRef.current.x;
    const deltaY = totalMoveY - sentMoveRef.current.y;
    
    // �?关键优化：累积delta,避免IPC请求排队
    if (!pendingMoveRef.current) {
      pendingMoveRef.current = { x: 0, y: 0 };
    }
    pendingMoveRef.current.x += deltaX;
    pendingMoveRef.current.y += deltaY;
    
    // 更新已计算的总移动量（包括pending�?
    sentMoveRef.current.x = totalMoveX;
    sentMoveRef.current.y = totalMoveY;
    
    widgetLogger.log('🚚 [Renderer] 拖动�?', { 
      currentScreen: { x: e.screenX, y: e.screenY },
      totalMove: { x: totalMoveX, y: totalMoveY },
      delta: { x: deltaX, y: deltaY },
      pending: pendingMoveRef.current,
      timeSinceLastMove: `${timeSinceLastMove}ms`,
      fps: Math.round(1000 / timeSinceLastMove),
      ipcBusy: ipcBusyRef.current
    });
    
    // �?关键优化：如果上一个IPC还在处理,跳过本次发�?
    if (ipcBusyRef.current) {
      widgetLogger.log('⏭️ [Renderer] IPC忙碌�?跳过本次请求');
      dragThrottleRef.current = now;
      return;
    }
    
    // �?节流：至少等�?6ms (60fps)
    if (now - dragThrottleRef.current < 16) {
      return;
    }
    dragThrottleRef.current = now;
    
    // 🚀 发送累积的delta
    const moveX = pendingMoveRef.current.x;
    const moveY = pendingMoveRef.current.y;
    
    if (Math.abs(moveX) > 0 || Math.abs(moveY) > 0) {
      pendingMoveRef.current = { x: 0, y: 0 }; // 重置累积
      
      if (window.electronAPI?.widgetMove) {
        try {
          const ipcStartTime = performance.now();
          ipcBusyRef.current = true; // 标记IPC忙碌
          
          // �?不等待返回，立即发送下一个移�?
          window.electronAPI.widgetMove({ x: moveX, y: moveY }).then((result) => {
            const ipcEndTime = performance.now();
            const ipcDuration = ipcEndTime - ipcStartTime;
            ipcBusyRef.current = false; // 释放标志
            
            // 更新性能统计
            perfRef.current.moveCount++;
            perfRef.current.totalTime += ipcDuration;
            perfRef.current.maxTime = Math.max(perfRef.current.maxTime, ipcDuration);
            perfRef.current.minTime = Math.min(perfRef.current.minTime, ipcDuration);
            
            const avgTime = perfRef.current.totalTime / perfRef.current.moveCount;
            
            widgetLogger.log('�?[Renderer] widgetMove 完成:', {
              sent: { x: moveX, y: moveY },
              result,
              duration: `${ipcDuration.toFixed(2)}ms`,
              avg: `${avgTime.toFixed(2)}ms`,
              min: `${perfRef.current.minTime.toFixed(2)}ms`,
              max: `${perfRef.current.maxTime.toFixed(2)}ms`,
              count: perfRef.current.moveCount
            });
          }).catch((error) => {
            widgetLogger.error('�?[Renderer] widgetMove 失败:', error);
            ipcBusyRef.current = false; // 出错时也要释�?
          });
          
        } catch (error) {
          widgetLogger.error('�?[Renderer] widgetMove 异常:', error);
          ipcBusyRef.current = false;
        }
      } else {
        widgetLogger.error('❌ [Renderer] widgetMove API 不存在');
      }
    }
  }, [isDragging, isResizing]);

  const handleDragEnd = useCallback(() => {
    widgetLogger.log('🏁 [Renderer] 拖动结束');
    
    // 打印性能总结
    if (perfRef.current.moveCount > 0) {
      const avgTime = perfRef.current.totalTime / perfRef.current.moveCount;
      widgetLogger.log('📊 [Renderer] 拖动性能总结:', {
        totalMoves: perfRef.current.moveCount,
        avgIpcTime: `${avgTime.toFixed(2)}ms`,
        minIpcTime: `${perfRef.current.minTime.toFixed(2)}ms`,
        maxIpcTime: `${perfRef.current.maxTime.toFixed(2)}ms`,
        totalTime: `${perfRef.current.totalTime.toFixed(2)}ms`,
        avgFps: Math.round(1000 / (avgTime + 32)) // 32ms是节流时�?
      });
    }
    
    setIsDragging(false);
    dragStartRef.current = null;
    
    // 🔧 重置所有ref状�?
    ipcBusyRef.current = false;
    pendingMoveRef.current = null;
    sentMoveRef.current = { x: 0, y: 0 };
    
    // �?重置IPC状�?
    ipcBusyRef.current = false;
    pendingMoveRef.current = null;
    
    // 通知主进程拖动结束，重置目标尺寸
    if ((window.electronAPI as any)?.widgetDragEnd) {
      (window.electronAPI as any).widgetDragEnd().catch((err: Error) => {
        widgetLogger.error('�?[Renderer] widgetDragEnd 失败:', err);
      });
    }
  }, []);

  // 监听拖动
  useEffect(() => {
    if (isDragging) {
      widgetLogger.log('👂 [Renderer] 开始监�?mousemove �?mouseup');
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        widgetLogger.log('🔇 [Renderer] 停止监听 mousemove �?mouseup');
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);


  // color->rgba
  const bgColorRgba = (() => {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
  })();

  // 最外层容器样式 - 透明容器
  const widgetStyle: CustomCSSProperties = {
    width: '100vw',
    height: '100vh',
    backgroundColor: 'transparent', // 容器透明，让 Electron 窗口背景透过
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden', // ✅ 恢复 hidden，避免内容溢出
    cursor: 'default',
    userSelect: 'none',
    position: 'relative', // 🎯 为 resize handles 提供定位上下文
    transition: 'opacity 0.2s ease', // 只保留透明度过渡，移除缩放动画
    WebkitAppRegion: 'no-drag' // 默认不可拖动，只有拖动条可以拖动
  };

  // 渲染时输出状态（调试用）
  // widgetLogger.log('🎨 [Render] Widget状�?', { isLocked, isDragging, isResizing, showControls });

  return (
    <div
      ref={widgetRef}
      className="desktop-calendar-widget"
      style={{
        ...widgetStyle,
        // 🎨 设置CSS变量供子元素使用
        ['--adaptive-text-primary' as any]: getAdaptiveColors.textPrimary,
        ['--adaptive-text-secondary' as any]: getAdaptiveColors.textSecondary,
        ['--adaptive-icon-filter' as any]: getAdaptiveColors.iconFilter,
      }}
    >
      {/* 调整大小时的全屏遮罩�?*/}
      {isResizing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          cursor: 'default',
          pointerEvents: 'none' // 不阻止鼠标事件传�?
        }} />
      )}
      
      {/* 不需要拖动遮罩层 - window 级别的监听器足够�?*/}

      {/* 顶部拖动�?- 自定义拖动实�?*/}
      {!isLocked && (
        <div
          className="drag-bar"
          data-testid="widget-drag-bar"
          style={{
            position: 'absolute',
            top: '0px', // 🎯 紧贴顶部边缘
            left: '8px',
            right: '8px',
            width: 'calc(100% - 16px)',
            height: '10px',
            zIndex: 10000,
            cursor: isDragging ? 'grabbing' : 'grab',
            backgroundColor: showControls ? 'rgba(100, 150, 255, 0.5)' : 'rgba(100, 150, 255, 0.25)', // 🎯 固定蓝色，半透明
            backdropFilter: showControls ? 'blur(8px)' : 'blur(3px)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            transition: 'all 0.15s ease',
            boxShadow: showControls ? '0 2px 8px rgba(100, 150, 255, 0.3)' : 'none',
            pointerEvents: 'auto'
          }}
          onMouseEnter={(e) => {
            e.stopPropagation();
            setShowControls(true);
          }}
          onMouseLeave={(e) => {
            e.stopPropagation();
            setShowControls(false);
          }}
          onMouseDown={handleDragStart}
        >
          {/* 拖动条提示文�?*/}
          <span style={{
            fontSize: '9px',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.95)',
            letterSpacing: '1.5px',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            opacity: showControls ? 1 : 0.6,
            transition: 'opacity 0.15s ease'
          }}
          >
            ⋮⋮
          </span>
        </div>
      )}

      {/* 调整大小手柄 - 只保留底部和侧边 */}
      {!isLocked && (
        <>
          <div className="resize-handle-bottom" onMouseDown={(e) => handleResizeStart('bottom', e)} onMouseEnter={handleResizeHover} onMouseLeave={handleResizeLeave} />
          <div className="resize-handle-left" onMouseDown={(e) => handleResizeStart('left', e)} onMouseEnter={handleResizeHover} onMouseLeave={handleResizeLeave} />
          <div className="resize-handle-right" onMouseDown={(e) => handleResizeStart('right', e)} onMouseEnter={handleResizeHover} onMouseLeave={handleResizeLeave} />
          <div className="resize-handle-bottomleft" onMouseDown={(e) => handleResizeStart('bottomleft', e)} onMouseEnter={handleResizeHover} onMouseLeave={handleResizeLeave} />
          <div className="resize-handle-bottomright" onMouseDown={(e) => handleResizeStart('bottomright', e)} onMouseEnter={handleResizeHover} onMouseLeave={handleResizeLeave} />
        </>
      )}

      {/* 主要内容容器 - 使用 flexbox 布局 */}
      <div 
        style={{ 
          flex: 1, 
          marginTop: '14px', // 🎯 drag-bar (0px + 10px height) + 4px 间距 = 14px
          marginBottom: '0',
          position: 'relative', 
          overflow: 'hidden', // ✅ 恢复 hidden，避免溢出
          pointerEvents: 'auto',
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          flexDirection: 'column'
        } as CustomCSSProperties} 
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 日历主体区域 */}
        <div style={{ flex: 1, overflow: 'hidden' }}> {/* ✅ 恢复 hidden */}
          <MemoizedTimeCalendar
            microsoftService={microsoftService}
            lastSyncTime={lastSyncTime}
            isWidgetMode={true}
            storageKey={storageKey} // 🔧 使用唯一的存储key
            className="desktop-calendar-inner"
            style={useMemo(() => ({ 
              height: '100%', 
              border: 'none', 
              borderRadius: '0 0 12px 12px', 
              background: 'transparent',
            }), [])}
            calendarBackgroundColor={bgColor}
            calendarOpacity={bgOpacity}
            onWidgetOpacityChange={setBgOpacity}
            onWidgetColorChange={setBgColor}
            onWidgetLockToggle={handleLockToggle}
            widgetLocked={isLocked}
          />
        </div>

        {/* 📊 Widget 专属状态栏 - 正常布局，底部固�?*/}
        <div 
          style={{
            flexShrink: 0,
            margin: '4px 8px 4px 8px', // 🎯 统一间距：上�?4px，左�?8px
            background: `rgba(${parseInt(bgColor.slice(1,3), 16)}, ${parseInt(bgColor.slice(3,5), 16)}, ${parseInt(bgColor.slice(5,7), 16)}, ${bgOpacity * 0.8})`, // 🎯 �?controller 一致：bgOpacity * 0.8
            backdropFilter: 'blur(3px)', // 🎯 �?controller 一致：blur(3px)
            borderRadius: '20px', // 🎨 四个角都有圆角，独立卡片设计
            border: 'none',
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: getAdaptiveColors.textSecondary,
            cursor: 'default',
            // @ts-ignore - Electron specific property
            WebkitAppRegion: 'no-drag',
            // @ts-ignore - Electron specific property  
            appRegion: 'no-drag',
            pointerEvents: 'auto' // �?正常接收鼠标事件，resize handles 通过�?z-index 覆盖
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src={SyncIcon} alt="Sync" style={{ 
              width: 16, 
              height: 16,
              filter: getAdaptiveColors.iconFilter
            }} />
            <span>
              {lastSyncTime ? (
                <>
                  最后同步：<strong style={{ 
                    color: getAdaptiveColors.textPrimary
                  }}>
                    {lastSyncTime.toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </strong>
                  {/* 📊 详细同步日志 */}
                  {(() => {
                    const logs: string[] = [];
                    if (syncStats.syncFailed > 0) {
                      logs.push(`${syncStats.syncFailed}个事项同步至日历失败❌`);
                    }
                    if (syncStats.calendarCreated > 0) {
                      logs.push(`新增日历事项${syncStats.calendarCreated}个💌`);
                    }
                    if (syncStats.syncSuccess > 0) {
                      logs.push(`${syncStats.syncSuccess}个事项成功同步至日历✅`);
                    }
                    return logs.length > 0 ? <> {logs.join('，')}</> : null;
                  })()}
                </>
              ) : '正在同步...'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src={OutlookIcon} alt="Outlook" style={{ 
              width: 16, 
              height: 16,
              filter: getAdaptiveColors.iconFilter
            }} />
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isAuthenticated ? '#4ade80' : '#ef4444',
                boxShadow: isAuthenticated
                  ? '0 0 8px rgba(74, 222, 128, 0.6)'
                  : '0 0 8px rgba(239, 68, 68, 0.6)',
                transition: 'all 0.3s ease'
              }}
              title={isAuthenticated ? '已连接' : '未连接'}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopCalendarWidget;
