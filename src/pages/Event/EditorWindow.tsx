import React, { useEffect, useState } from 'react';
import { EventEditModalV2 } from '@frontend/features/Event';
import { EventService } from '@backend/EventService';
import { getAvailableCalendarsForSettings } from '@frontend/utils/calendarUtils';
import type { Event } from '@frontend/types';
import './EditorWindow.css';

/**
 * 独立事件编辑器窗口页面
 * 在 Electron 多窗口环境下使用
 * 
 * URL: /event-editor/:eventId
 */
const EventEditorWindow: React.FC = () => {
  // 从 URL hash 获取 eventId
  const eventId = window.location.hash.split('/').pop() || '';
  const [event, setEvent] = useState<Event | null>(null);
  const [availableCalendars, setAvailableCalendars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载事件数据
  useEffect(() => {
    if (!eventId) return;

    const loadEventData = async () => {
      try {
        // 从 EventService 加载事件
        const eventData = await EventService.getEventById(eventId);
        if (eventData) {
          setEvent(eventData);
        }

        // 加载日历
        const calendars = await getAvailableCalendarsForSettings();
        setAvailableCalendars(calendars);

        setLoading(false);
      } catch (error) {
        console.error('Failed to load event data:', error);
        setLoading(false);
      }
    };

    loadEventData();

    // 监听来自主进程的事件数据
    if (window.electronAPI?.window?.onEventData) {
      window.electronAPI.window.onEventData((data: Event) => {
        console.log('Received event data from main process:', data);
        setEvent(data);
        setLoading(false);
      });
    }

    // 监听事件更新
    if (window.electronAPI?.window?.onEventUpdated) {
      window.electronAPI.window.onEventUpdated((data: Event) => {
        console.log('Event updated:', data);
        setEvent(data);
      });
    }
  }, [eventId]);

  // 保存事件
  const handleSave = async (updatedEvent: Event) => {
    try {
      await EventService.updateEvent(updatedEvent.id, updatedEvent);
      setEvent(updatedEvent);
      
      // 通知主窗口事件已更新
      if (window.electronAPI?.window) {
        // 这里可以添加通知逻辑
      }
    } catch (error) {
      console.error('Failed to save event:', error);
    }
  };

  // 关闭窗口
  const handleClose = () => {
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    } else {
      window.close();
    }
  };

  if (loading) {
    return (
      <div className="event-editor-window loading">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="event-editor-window error">
        <div className="error-message">
          <h2>事件不存在</h2>
          <p>无法找到 ID 为 {eventId} 的事件</p>
          <button onClick={handleClose}>关闭窗口</button>
        </div>
      </div>
    );
  }

  return (
    <div className="event-editor-window">
      <EventEditModalV2
        eventId={event?.id || null}
        isOpen={true}
        onClose={handleClose}
        onSave={handleSave}
        hierarchicalTags={[]}
      />
    </div>
  );
};

export default EventEditorWindow;
