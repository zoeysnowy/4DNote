import React, { useState, useEffect } from 'react';
import { formatDisplayDateTime, formatTimeForStorage } from '@frontend/utils/timeUtils';
import CalendarGroupManager from './CalendarGroupManager';

interface CalendarSyncProps {
  syncManager: any;
  microsoftService: any;
  onSettingsChange?: (settingKey: string, value: any) => void;
  onTagsUpdated?: (tags: any[]) => void;
}

const CalendarSync: React.FC<CalendarSyncProps> = ({ 
  syncManager, 
  microsoftService,
  onSettingsChange,
  onTagsUpdated
}) => {
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [showCalendarManager, setShowCalendarManager] = useState(false);

  // 检测是否在 Electron 环境
  const isElectron = typeof window !== 'undefined' && window.electronAPI;

  // 加载用户信息
  useEffect(() => {
    if (microsoftService?.isSignedIn()) {
      loadUserInfo();
    }
  }, [microsoftService]);

  // 监听认证过期事件
  useEffect(() => {
    const handleAuthExpired = (event: Event) => {
      const customEvent = event as CustomEvent;
      // 清除用户信息
      setUserInfo(null);
      
      // 显示认证过期消息
      setSyncMessage('❌ 认证已过期，请重新登录 Microsoft 账户');
      
      // 停止同步管理器
      if (syncManager && typeof syncManager.isActive === 'function' && syncManager.isActive()) {
        if (typeof syncManager.stop === 'function') {
          syncManager.stop();
        } else if (typeof syncManager.stopSync === 'function') {
          syncManager.stopSync();
        }
      }
    };

    window.addEventListener('auth-expired', handleAuthExpired);
    
    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, [syncManager]);

  const loadUserInfo = async () => {
    try {
      const info = await microsoftService.getUserInfo();
      setUserInfo(info);
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setSyncMessage('');
    
    try {
      // 🔧 Electron环境：使用窗口内认证
      if (isElectron) {
        await handleElectronAuth();
        return;
      }
      
      // Web环境：使用标准MSAL认证
      const success = await microsoftService.signIn();
      if (success) {
        await loadUserInfo();
        setSyncMessage('✅ 成功连接到 Microsoft Calendar!');
        
        // 🔧 触发全局认证状态更新事件（让 App.tsx 重新检查）
        window.dispatchEvent(new CustomEvent('auth-state-changed', { 
          detail: { isAuthenticated: true } 
        }));
        
        // 🔧 修复：检查方法是否存在再调用
        if (syncManager) {
          if (typeof syncManager.isActive === 'function' && !syncManager.isActive()) {
            if (typeof syncManager.start === 'function') {
              syncManager.start();
            }
          }
        } else {
          console.log('⚠️ [CalendarSync] syncManager 不存在，等待 App.tsx 创建');
        }
      } else {
        setSyncMessage('❌ 连接失败，请重试');
      }
    } catch (error) {
      console.error('Connection error:', error);
      setSyncMessage(`❌ 连接失败: ${error}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleElectronAuth = async () => {
    try {
      const clientId = 'cf163673-488e-44d9-83ac-0f11d90016ca';
      const redirectUri = 'https://login.microsoftonline.com/common/oauth2/nativeclient';
      const scopes = [
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Calendars.Read',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'offline_access'
      ];
      
      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${clientId}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes.join(' '))}&` +
        `response_mode=query`;
      setSyncMessage('正在打开登录窗口...');
      
      const result = await (window as any).electronAPI.microsoftLoginWindow(authUrl);
      
      if (!result.success) {
        throw new Error(result.error || '登录失败');
      }
      setSyncMessage('登录成功，正在获取访问令牌...');
      
      // 用授权码交换访问令牌
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          scope: scopes.join(' '),
          code: result.code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      
      if (!tokenResponse.ok) {
        throw new Error('获取访问令牌失败');
      }
      
      const tokens = await tokenResponse.json();
      const expiresAt = Date.now() + (tokens.expires_in * 1000);

      // ✅ 令牌持久化由 service 负责（IndexedDB metadata），UI 不直接写 localStorage
      if (microsoftService && typeof (microsoftService as any).setAuthTokens === 'function') {
        await (microsoftService as any).setAuthTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt
        });
      }
      
      // 同步到Electron主进程
      if ((window as any).electronAPI.setAuthTokens) {
        await (window as any).electronAPI.setAuthTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt
        });
      }
      
      setSyncMessage('✅ 认证成功！正在加载数据...');
      
      // 加载用户信息
      await loadUserInfo();
      
      // 启动同步
      if (syncManager) {
        if (typeof syncManager.isActive === 'function' && !syncManager.isActive()) {
          if (typeof syncManager.start === 'function') {
            syncManager.start();
          }
        }
      }
      
      setSyncMessage('✅ 成功连接到 Microsoft Calendar!');
      
      setTimeout(() => {
        setSyncMessage('');
      }, 3000);
      
    } catch (error: any) {
      console.error('❌ [Electron] 认证失败:', error);
      setSyncMessage(`❌ 认证失败: ${error.message || error}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      // 🔧 修复：检查方法是否存在再调用
      if (syncManager) {
        if (typeof syncManager.isActive === 'function' && syncManager.isActive()) {
          if (typeof syncManager.stop === 'function') {
            syncManager.stop();
          } else if (typeof syncManager.stopSync === 'function') {
            syncManager.stopSync(); // 兼容性支持
          }
        }
      }
      
      await microsoftService.signOut();
      setUserInfo(null);
      setSyncMessage('已断开 Microsoft Calendar 连接');
    } catch (error) {
      console.error('Disconnect error:', error);
      setSyncMessage(`断开连接失败: ${error}`);
    }
  };

  const handleForceSync = async () => {
    // 🔧 优先检查登录状态
    if (!microsoftService?.isSignedIn()) {
      setSyncMessage('❌ 请先连接 Microsoft Calendar（登录状态已过期或未登录）');
      return;
    }

    try {
      setSyncMessage('🔄 正在同步...');
      
      // 🔧 方案1：如果 syncManager 存在，优先使用
      if (syncManager && typeof syncManager.forceSync === 'function') {
        console.log('🔍 [CalendarSync] 使用 syncManager.forceSync()');
        await syncManager.forceSync();
        setSyncMessage('✅ 手动同步完成!');
        return;
      }
      
      // 🔧 方案2：如果 syncManager 不存在，直接调用 microsoftService 同步
      console.log('🔍 [CalendarSync] syncManager 不可用，使用 microsoftService 直接同步');
      
      // 获取日历ID（优先使用选中的，否则获取所有日历）
      let calendarId = microsoftService.getSelectedCalendarId();
      
      if (!calendarId) {
        // 如果没有选中的日历，获取日历列表并使用第一个
        console.log('🔍 [CalendarSync] 没有选中的日历，获取日历列表...');
        const calendars = await microsoftService.getAllCalendars();
        if (calendars && calendars.length > 0) {
          calendarId = calendars[0].id;
          console.log('🔍 [CalendarSync] 使用第一个日历:', calendars[0].name);
        } else {
          setSyncMessage('❌ 未找到任何日历');
          return;
        }
      }
      
      // 简单同步：拉取最近的日历事件
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1); // 最近1个月
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 未来1个月
      
      const remoteEvents = await microsoftService.getEventsFromCalendar(calendarId, startDate, endDate);
      console.log(`✅ [CalendarSync] 获取到 ${remoteEvents.length} 个远程事件:`, remoteEvents);
      
      // 🔧 简化版同步：仅显示获取到的事件信息，不写入本地
      // 如果需要完整同步功能，请等待 syncManager 初始化
      if (remoteEvents.length > 0) {
        const eventTitles = remoteEvents.slice(0, 5).map((e: any) => e.subject || e.title).join(', ');
        setSyncMessage(`✅ 获取到 ${remoteEvents.length} 个远程事件（前5个: ${eventTitles}${remoteEvents.length > 5 ? '...' : ''}）\n\n⚠️ 注意：这是简化版同步，仅拉取事件不写入本地。完整双向同步需要等待 SyncManager 初始化。`);
      } else {
        setSyncMessage('✅ 同步完成！当前日历为空。');
      }
      
    } catch (error) {
      console.error('Sync error:', error);
      setSyncMessage(`❌ 同步失败: ${error}`);
    }
  };

  // 🔧 安全的方法调用辅助函数
  const safeCall = (obj: any, method: string, ...args: any[]) => {
    if (obj && typeof obj[method] === 'function') {
      try {
        return obj[method](...args);
      } catch (error) {
        console.error(`Error calling ${method}:`, error);
        return false;
      }
    }
    return false;
  };

  // 🔧 安全获取同步状态
  const getSyncStatus = () => {
    if (!syncManager) return { isActive: false, lastSync: 'N/A' };
    
    const isActive = safeCall(syncManager, 'isActive') || false;
    let lastSync = 'N/A';
    
    try {
      if (typeof syncManager.getLastSyncTime === 'function') {
        const lastSyncTime = syncManager.getLastSyncTime();
        lastSync = lastSyncTime instanceof Date ? lastSyncTime.toLocaleString() : String(lastSyncTime);
      }
    } catch (error) {
      console.error('Error getting last sync time:', error);
    }
    
    return { isActive, lastSync };
  };

  const syncStatus = getSyncStatus();

  return (
    <div className="calendar-sync">
      <div className="sync-header">
        <h3>🔄 智能日历同步</h3>
        <div className="connected-count">
          {microsoftService?.isSignedIn() ? (
            <span className="status connected">已连接</span>
          ) : (
            <span className="status disconnected">未连接</span>
          )}
        </div>
      </div>

      {/* 同步消息 */}
      {syncMessage && (
        <div className={`sync-message ${syncMessage.includes('✅') ? 'success' : 'error'}`}>
          <p>{syncMessage}</p>
          <small>时间: {formatDisplayDateTime(formatTimeForStorage(new Date()))}</small>
        </div>
      )}

      {/* Microsoft Calendar 连接 */}
      <div className="providers-list">
        <div className="provider-item">
          <div className="provider-info">
            <div className="provider-icon">📅</div>
            <div className="provider-details">
              <h4>Microsoft Outlook Calendar</h4>
              <p>同步日程安排和计时记录</p>
              <div className={`status ${microsoftService?.isSignedIn() ? 'connected' : 'disconnected'}`}>
                {microsoftService?.isSignedIn() ? '已连接' : '未连接'}
              </div>
              {userInfo && (
                <div className="user-info" style={{ marginTop: '8px', fontSize: '0.85rem', color: '#666' }}>
                  <div>👤 {userInfo.displayName}</div>
                  <div style={{ marginTop: '2px' }}>📧 {userInfo.mail || userInfo.userPrincipalName}</div>
                </div>
              )}
            </div>
          </div>
          
          <div className="provider-actions" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            {!microsoftService?.isSignedIn() ? (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="btn btn-connect"
              >
                {isConnecting ? '连接中...' : '连接'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleForceSync}
                  className="btn btn-sync"
                  style={{ minWidth: '90px' }}
                >
                  立即同步
                </button>
                <button
                  onClick={() => setShowCalendarManager(true)}
                  className="btn btn-calendar-manage"
                  style={{ minWidth: '90px' }}
                >
                  📅 日历管理
                </button>
                <button
                  onClick={handleDisconnect}
                  className="btn btn-disconnect"
                  style={{ minWidth: '90px' }}
                >
                  断开连接
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 同步状态显示 */}
      {syncManager && (
        <div className={`real-time-sync-status ${syncStatus.isActive ? 'active' : 'inactive'}`}>
          <span>
            {syncStatus.isActive ? 
              '🔄 智能同步已启用 (每20秒执行冲突解决同步)' : 
              '⏸️ 智能同步已暂停'
            }
          </span>
          <button
            className={`sync-toggle-btn ${syncStatus.isActive ? 'stop' : ''}`}
            onClick={() => {
              if (syncStatus.isActive) {
                // 🔧 修复：安全调用 stop 方法
                if (safeCall(syncManager, 'stop')) {
                  setSyncMessage('智能同步已暂停');
                } else if (safeCall(syncManager, 'stopSync')) {
                  setSyncMessage('智能同步已暂停');
                } else {
                  setSyncMessage('❌ 无法停止同步');
                }
              } else {
                // 🔧 修复：安全调用 start 方法
                if (safeCall(syncManager, 'start')) {
                  setSyncMessage('智能同步已启动');
                } else if (safeCall(syncManager, 'startSync')) {
                  setSyncMessage('智能同步已启动');
                } else {
                  setSyncMessage('❌ 无法启动同步');
                }
              }
            }}
          >
            {syncStatus.isActive ? '暂停同步' : '启动同步'}
          </button>
        </div>
      )}

      {/* 同步信息说明 */}
      <div className="sync-info">
        <h4>🔬 智能同步机制说明</h4>
        <ul>
          <li>📥 <strong>第1步</strong>：从 Outlook 获取全量数据同步到缓存</li>
          <li>📝 <strong>第2步</strong>：将本地期间内的修改合并到缓存</li>
          <li>💾 <strong>第3步</strong>：用缓存数据更新本地存储</li>
          <li>📤 <strong>第4步</strong>：将缓存变更同步到 Outlook</li>
          <li>⚡ <strong>冲突解决</strong>：本地修改优先，避免数据丢失</li>
          <li>🕒 <strong>版本控制</strong>：基于时间戳的智能冲突检测</li>
        </ul>
      </div>

      {/* 调试信息 */}
      {syncManager && (
        <div className="sync-debug" style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
          <h4>🔍 同步状态</h4>
          <p>同步模式: 智能冲突解决</p>
          <p>运行状态: {syncStatus.isActive ? '运行中' : '已停止'}</p>
          <p>最后同步: {syncStatus.lastSync}</p>
          <p>同步间隔: 20秒</p>
          <small>请打开浏览器控制台查看详细的4步同步日志</small>
          
          {/* 🔧 调试信息：显示可用方法 */}
          <details style={{ marginTop: '10px' }}>
            <summary style={{ cursor: 'pointer', color: '#007bff' }}>📋 调试：可用方法</summary>
            <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#6c757d' }}>
              {syncManager && Object.getOwnPropertyNames(Object.getPrototypeOf(syncManager))
                .filter(name => typeof syncManager[name] === 'function')
                .map(method => (
                  <div key={method}>✅ {method}()</div>
                ))
              }
            </div>
          </details>
        </div>
      )}

      {/* 日历分组管理器 */}
      <CalendarGroupManager
        microsoftService={microsoftService}
        isOpen={showCalendarManager}
        onClose={() => setShowCalendarManager(false)}
      />
    </div>
  );
};

export default CalendarSync;