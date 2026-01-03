import React, { useEffect, useState } from 'react';
import './SyncNotification.css';

interface NotificationData {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
}

export const SyncNotification: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  useEffect(() => {
    // 监听同步失败事件
    const handleSyncFailure = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { eventTitle, retryCount, error, timestamp } = customEvent.detail;

      const notification: NotificationData = {
        id: `sync-fail-${Date.now()}`,
        type: 'warning',
        title: '事件同步失败',
        message: `事件"${eventTitle}"同步失败（已重试${retryCount}次）\n原因：${error}`,
        timestamp
      };

      setNotifications(prev => [...prev, notification]);

      // 10秒后自动移除
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 10000);
    };

    // 监听网络状态变化事件
    const handleNetworkStatus = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { status, message } = customEvent.detail;

      const notification: NotificationData = {
        id: `network-${Date.now()}`,
        type: status === 'offline' ? 'warning' : 'success',
        title: status === 'offline' ? '网络已断开' : '网络已恢复',
        message,
        timestamp: new Date()
      };

      setNotifications(prev => [...prev, notification]);

      // 5秒后自动移除
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
    };

    window.addEventListener('syncFailure', handleSyncFailure);
    window.addEventListener('networkStatusChanged', handleNetworkStatus);

    return () => {
      window.removeEventListener('syncFailure', handleSyncFailure);
      window.removeEventListener('networkStatusChanged', handleNetworkStatus);
    };
  }, []);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div className="sync-notifications-container">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`sync-notification sync-notification-${notification.type}`}
        >
          <div className="sync-notification-header">
            <span className="sync-notification-icon">
              {notification.type === 'success' && '✅'}
              {notification.type === 'warning' && '⚠️'}
              {notification.type === 'error' && '❌'}
              {notification.type === 'info' && 'ℹ️'}
            </span>
            <span className="sync-notification-title">{notification.title}</span>
            <button
              className="sync-notification-close"
              onClick={() => removeNotification(notification.id)}
              aria-label="关闭通知"
            >
              ×
            </button>
          </div>
          <div className="sync-notification-message">
            {notification.message.split('\n').map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
          <div className="sync-notification-time">
            {notification.timestamp.toLocaleTimeString('zh-CN')}
          </div>
        </div>
      ))}
    </div>
  );
};
