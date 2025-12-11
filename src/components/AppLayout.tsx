import React from 'react';
import './AppLayout.css';
import { icons } from '../assets/icons';
import { formatTimeForStorage } from '../utils/timeUtils';
import PanelIconSvg from '../assets/icons/Panel.svg';

// 页面类型定义
export type PageType = 'home' | 'timecalendar' | 'timelog' | 'tag' | 'plan' | 'sync' | 'ai-demo';

interface AppLayoutProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
  children: React.ReactNode;
  globalTimer?: {
    isRunning: boolean;
    tagId: string;
    tagName: string;
    tagEmoji?: string;
    tagColor?: string;
    startTime: number;
    elapsedTime: number;
    isPaused: boolean;
    eventTitle?: string; // ✅ 事件标题（优先级高于tag Name）
  } | null;
  onTimerClick?: () => void;
  onSettingsClick?: () => void;
  isPanelVisible?: boolean;
  onPanelToggle?: () => void;
}

// Header 组件
interface HeaderProps {
  globalTimer?: {
    isRunning: boolean;
    tagId: string;
    tagName: string;
    tagEmoji?: string;
    tagColor?: string;
    startTime: number;
    elapsedTime: number;
    isPaused: boolean;
    eventTitle?: string; // ✅ 事件标题（优先级高于 tagName）
  } | null;
  onTimerClick?: () => void;
  onSettingsClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ globalTimer, onTimerClick, onSettingsClick }) => {
  
  // 格式化计时器显示
  const formatTimerDisplay = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    // 如果没有到小时，只显示 MM:SS
    if (hours === 0) {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // 到小时了显示 HH:MM:SS
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // 计算当前显示时间
  const getCurrentElapsed = () => {
    if (!globalTimer) return 0;
    if (globalTimer.isRunning) {
      return globalTimer.elapsedTime + (Date.now() - globalTimer.startTime);
    }
    return globalTimer.elapsedTime;
  };
  return (
    <header className="app-header">
      <div className="header-content">
        {/* 右侧工具栏 */}
        <div className="header-tools">
          {/* 全局计时器显示 - 紧凑两行布局 */}
          {globalTimer && (
            <div 
              className={`global-timer-compact ${globalTimer.isRunning ? 'running' : 'paused'}`}
              onClick={onTimerClick}
            >
              {/* 第一行：标签或标题（使用标签颜色） */}
              <div 
                className="timer-tag-line"
                style={{ 
                  color: globalTimer.tagColor || '#8b5cf6'
                }}
              >
                {globalTimer.tagEmoji ? `${globalTimer.tagEmoji} ` : ''}
                {/* ✅ 优先显示 eventTitle，如果没有则显示 tagName */}
                {globalTimer.eventTitle || globalTimer.tagName}
              </div>
              
              {/* 第二行：计时（使用首页timer渐变色） */}
              <div 
                className="timer-time-line"
              >
                {formatTimerDisplay(getCurrentElapsed())}
              </div>
            </div>
          )}

          {/* 通知 */}
          <div className="notification-btn">
            <img 
              src={icons.notification} 
              alt="Notification"
              width="24"
              height="24"
            />
          </div>

          {/* 设置 */}
          <div className="setting-btn" onClick={onSettingsClick} style={{ cursor: 'pointer' }}>
            <img 
              src={icons.setting} 
              alt="Settings"
              width="24"
              height="24"
            />
          </div>

          {/* 用户头像 */}
          <div className="user-profile">
            <span>ZG</span>
          </div>
        </div>
      </div>
    </header>
  );
};

// Sidebar 导航组件
interface SidebarProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
  onPanelToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange, onPanelToggle }) => {
  const menuItems = [
    { id: 'home' as PageType, label: '首页', icon: 'home' },
    { id: 'timecalendar' as PageType, label: '时光', icon: 'time' },
    { id: 'timelog' as PageType, label: '日志', icon: 'log' },
    { id: 'tag' as PageType, label: '标签', icon: 'tag' },
    { id: 'plan' as PageType, label: '计划', icon: 'plan' },
    { id: 'sync' as PageType, label: '同步', icon: 'sync' },
    { id: 'ai-demo' as PageType, label: 'AI Demo', icon: 'ai-demo' }
  ];

  // 处理导航点击
  const handleNavClick = (pageId: PageType, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      onPageChange(pageId);
    } catch (error) {
      console.error('[Sidebar] Error calling onPageChange:', error);
    }
  };

  // 原生事件处理作为备用方案
  const handleNativeClick = (pageId: PageType) => {
    return (event: any) => {
      if (typeof onPageChange === 'function') {
        onPageChange(pageId);
      } else {
        console.error('[Sidebar] onPageChange is not a function:', typeof onPageChange);
      }
    };
  };

  return (
    <aside className="app-sidebar">
      {/* Panel 呼出按钮 */}
      <button className="sidebar-panel-toggle" onClick={onPanelToggle}>
        <img src={PanelIconSvg} alt="Panel" width="24" height="24" />
      </button>
      
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={(e) => handleNavClick(item.id, e)}
            onTouchStart={handleNativeClick(item.id)}
            style={{ 
              pointerEvents: 'auto',
              userSelect: 'none',
              WebkitUserSelect: 'none'
            }}
            data-page={item.id}
            tabIndex={0}
            role="button"
            aria-label={`切换到${item.label}页面`}
          >
            <div className="nav-icon">
              <img 
                src={icons[item.icon as keyof typeof icons]} 
                alt={item.label}
                width="20"
                height="20"
                draggable={false}
                style={{ pointerEvents: 'none' }}
              />
            </div>
            <span className="nav-label" style={{ pointerEvents: 'none' }}>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

// 底部状态栏组件  
const StatusBar: React.FC = () => {
  const [syncStatus, setSyncStatus] = React.useState({
    lastSync: null as Date | null,
    updatedEvents: 0,
    isConnected: false, // 默认未连接
    isSyncing: false,
    // 📊 详细同步统计
    syncFailed: 0,
    calendarCreated: 0,
    syncSuccess: 0
  });
  
  // 🔧 [FIX] 使用 ref 避免状态更新导致的重渲染
  const statusTextRef = React.useRef<HTMLSpanElement>(null);
  const lastUpdateRef = React.useRef<number>(0);

  // 🔧 [FIX] 优化：只在需要时加载初始状态（仅一次）
  React.useEffect(() => {
    const savedSyncTime = localStorage.getItem('lastSyncTime');
    const savedEventCount = localStorage.getItem('lastSyncEventCount');
    const savedSyncStats = localStorage.getItem('syncStats');
    const isAuthenticated = localStorage.getItem('4dnote-outlook-authenticated') === 'true';
    
    // 📊 解析同步统计信息
    let syncStats = { syncFailed: 0, calendarCreated: 0, syncSuccess: 0 };
    if (savedSyncStats) {
      try {
        syncStats = JSON.parse(savedSyncStats);
      } catch (e) {
        console.error('Failed to parse sync stats:', e);
      }
    }
    
    if (savedSyncTime) {
      setSyncStatus({
        lastSync: new Date(savedSyncTime),
        updatedEvents: savedEventCount ? parseInt(savedEventCount) : 0,
        isConnected: isAuthenticated, // 🔧 从 localStorage 读取实际认证状态
        isSyncing: false,
        ...syncStats
      });
    } else {
      // 没有同步记录，但仍需要设置认证状态
      setSyncStatus(prev => ({
        ...prev,
        isConnected: isAuthenticated,
        ...syncStats
      }));
    }
    
    // 监听同步完成事件，更新状态栏时间
    const handleSyncCompleted = (event: any) => {
      const { timestamp } = event.detail;
      
      // 更新localStorage（使用本地时间格式）
      localStorage.setItem('lastSyncTime', formatTimeForStorage(timestamp));
      
      // 📊 重新读取同步统计信息
      let syncStats = { syncFailed: 0, calendarCreated: 0, syncSuccess: 0 };
      const savedSyncStats = localStorage.getItem('syncStats');
      if (savedSyncStats) {
        try {
          syncStats = JSON.parse(savedSyncStats);
        } catch (e) {
          console.error('Failed to parse sync stats on sync complete:', e);
        }
      }
      
      // 更新状态
      setSyncStatus(prev => ({
        ...prev,
        lastSync: timestamp,
        isSyncing: false,
        isConnected: true, // 🔧 同步成功说明已连接
        ...syncStats
      }));
    };
    
    window.addEventListener('action-sync-completed', handleSyncCompleted);
    
    // 监听认证过期事件
    const handleAuthExpired = (event: any) => {
      console.error('🔴 [StatusBar] Auth expired event received:', event.detail);
      setSyncStatus(prev => ({
        ...prev,
        isConnected: false
      }));
      
      // 显示通知
      if (event.detail?.message) {
        alert(event.detail.message);
      }
    };
    
    window.addEventListener('auth-expired', handleAuthExpired);
    
    // 🔧 [NEW] 监听日历降级事件
    const handleCalendarFallback = (event: any) => {
      console.warn('📅 [StatusBar] Calendar fallback event received:', event.detail);
      const { eventTitle, invalidCalendarId, fallbackCalendarId, message } = event.detail;
      
      // 显示通知
      if (message) {
        alert(`⚠️ ${message}\n\n原因：目标日历 ${invalidCalendarId.substring(0, 20)}... 不存在或不可访问`);
      }
    };
    
    window.addEventListener('calendarFallback', handleCalendarFallback);
    
    return () => {
      window.removeEventListener('action-sync-completed', handleSyncCompleted);
      window.removeEventListener('auth-expired', handleAuthExpired);
      window.removeEventListener('calendarFallback', handleCalendarFallback);
    };
  }, []); // 空依赖，只运行一次

  // 格式化同步状态：使用 useMemo 缓存，避免每次渲染都计算
  const formatSyncStatus = React.useCallback((
    lastSync: Date | null, 
    updatedEvents: number, 
    isSyncing: boolean,
    syncFailed: number,
    calendarCreated: number,
    syncSuccess: number
  ) => {
    if (isSyncing) {
      return "正在同步...";
    }
    
    if (!lastSync) {
      return "尚未同步";
    }
    
    const now = Date.now();
    const syncTime = lastSync.getTime();
    const diffInMinutes = Math.floor((now - syncTime) / (1000 * 60));
    
    // 🎨 保留原有的详细格式
    const timeStr = lastSync.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // 📊 构建详细同步日志
    const logs: string[] = [];
    if (syncFailed > 0) {
      logs.push(`${syncFailed}个事项同步至日历失败❌`);
    }
    if (calendarCreated > 0) {
      logs.push(`新增日历事项${calendarCreated}个💌`);
    }
    if (syncSuccess > 0) {
      logs.push(`${syncSuccess}个事项成功同步至日历✅`);
    }
    
    const logStr = logs.length > 0 ? ` ${logs.join('，')}` : '';
    
    if (diffInMinutes < 1) {
      return `最后同步：${timeStr}${logStr}`;
    } else if (diffInMinutes < 60) {
      return `最后同步：${timeStr} (${diffInMinutes}分钟前)${logStr}`;
    } else {
      const hours = Math.floor(diffInMinutes / 60);
      return `最后同步：${timeStr} (${hours}小时前)${logStr}`;
    }
  }, []);

  // 🔧 初始文本
  const initialText = React.useMemo(() => {
    return formatSyncStatus(
      syncStatus.lastSync, 
      syncStatus.updatedEvents, 
      syncStatus.isSyncing,
      syncStatus.syncFailed,
      syncStatus.calendarCreated,
      syncStatus.syncSuccess
    );
  }, [syncStatus, formatSyncStatus]);

  // 🔧 [PERF] 使用 DOM 直接更新文本，避免 React 重渲染
  // 每 30 秒更新一次显示文本（不触发组件重渲染）
  React.useEffect(() => {
    if (!syncStatus.lastSync || syncStatus.isSyncing) return;
    
    const updateText = () => {
      if (!statusTextRef.current) return;
      
      const now = Date.now();
      // 🔧 限流：至少 30 秒更新一次
      if (now - lastUpdateRef.current < 30000) return;
      
      lastUpdateRef.current = now;
      const newText = formatSyncStatus(
        syncStatus.lastSync, 
        syncStatus.updatedEvents, 
        syncStatus.isSyncing,
        syncStatus.syncFailed,
        syncStatus.calendarCreated,
        syncStatus.syncSuccess
      );
      
      // 直接更新 DOM，不触发 React 重渲染
      if (statusTextRef.current.textContent !== newText) {
        statusTextRef.current.textContent = newText;
      }
    };
    
    // 每 30 秒更新一次
    const intervalId = setInterval(updateText, 30000);
    
    // 立即更新一次（以防启动时就过了很久）
    updateText();
    
    return () => clearInterval(intervalId);
  }, [syncStatus.lastSync, syncStatus.updatedEvents, syncStatus.isSyncing, syncStatus.syncFailed, syncStatus.calendarCreated, syncStatus.syncSuccess, formatSyncStatus]);

  return (
    <footer className="app-statusbar">
      <div className="status-content">
        <div className="sync-status">
          <img src={icons.sync} alt="Sync" className="sync-icon" />
          <span className="status-text" ref={statusTextRef}>
            {initialText}
          </span>
        </div>
        <div className="connection-indicators">
          <div className="outlook-connection">
            <img src={icons.outlook} alt="Outlook" className="outlook-icon" />
            <div className={`status-dot ${syncStatus.isConnected ? 'connected' : 'disconnected'}`}></div>
          </div>
        </div>
      </div>
    </footer>
  );
};

// 主应用布局组件
const AppLayout: React.FC<AppLayoutProps> = ({ 
  currentPage, 
  onPageChange, 
  children, 
  globalTimer, 
  onTimerClick,
  onSettingsClick,
  isPanelVisible,
  onPanelToggle
}) => {
  return (
    <div className="app-layout">
      {/* Header */}
      <Header 
        globalTimer={globalTimer} 
        onTimerClick={onTimerClick}
        onSettingsClick={onSettingsClick}
      />
      
      {/* 侧边导航栏 */}
      <Sidebar 
        currentPage={currentPage} 
        onPageChange={onPageChange}
        onPanelToggle={onPanelToggle}
      />
      
      {/* 主内容区 */}
      <main className="app-main">
        {children}
      </main>
      
      {/* 底部状态栏 */}
      <StatusBar />
    </div>
  );
};

export default AppLayout;