/**
 * Event Tab Manager
 *
 * Chrome 风格的多标签页编辑器，用于同时编辑多个事件
 * 支持拖拽排序、关闭标签、切换标签
 *
 * @author Zoey Gong
 */

import React, { useCallback, useState } from 'react';
import './EventTabManager.css';
import type { Event } from '@frontend/types';
import { EventEditModalV2 } from '@frontend/features/Event/components/EventEditModal/EventEditModalV2';

export interface EventTab {
  id: string;
  event: Event;
  isDirty: boolean; // 是否有未保存的更改
}

interface EventTabManagerProps {
  initialTabs?: EventTab[];
  onClose?: () => void;
  availableTags?: any[];
  availableCalendars?: any[];
}

export const EventTabManager: React.FC<EventTabManagerProps> = ({
  initialTabs = [],
  onClose,
  availableTags = [],
  availableCalendars = [],
}) => {
  const [tabs, setTabs] = useState<EventTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialTabs.length > 0 ? initialTabs[0].id : null,
  );

  // 添加新标签页
  const addTab = useCallback((event: Event) => {
    const newTab: EventTab = {
      id: event.id,
      event,
      isDirty: false,
    };

    setTabs((prev) => {
      // 如果标签页已存在，直接激活
      const exists = prev.find((t) => t.id === event.id);
      if (exists) {
        setActiveTabId(event.id);
        return prev;
      }

      // 添加新标签页
      const newTabs = [...prev, newTab];
      setActiveTabId(event.id);
      return newTabs;
    });
  }, []);

  // 关闭标签页
  const closeTab = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }

      setTabs((prev) => {
        const index = prev.findIndex((t) => t.id === tabId);
        if (index === -1) return prev;

        const tab = prev[index];

        // 如果有未保存的更改，提示用户
        if (tab.isDirty) {
          const confirm = window.confirm('此标签页有未保存的更改，确定要关闭吗？');
          if (!confirm) return prev;
        }

        const newTabs = prev.filter((t) => t.id !== tabId);

        // 如果关闭的是当前激活的标签页，切换到相邻标签页
        if (activeTabId === tabId) {
          if (newTabs.length === 0) {
            setActiveTabId(null);
            onClose?.();
          } else if (index > 0) {
            setActiveTabId(newTabs[index - 1].id);
          } else {
            setActiveTabId(newTabs[0].id);
          }
        }

        return newTabs;
      });
    },
    [activeTabId, onClose],
  );

  // 切换标签页
  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // 更新事件数据
  const updateEvent = useCallback((tabId: string, updatedEvent: Event) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, event: updatedEvent, isDirty: true } : tab)),
    );
  }, []);

  // 标记为已保存
  const markSaved = useCallback((tabId: string) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, isDirty: false } : tab)));
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  console.log('🔍 [EventTabManager] Render state:', {
    tabsCount: tabs.length,
    activeTabId,
    activeTab: activeTab
      ? {
          id: activeTab.id,
          eventId: activeTab.event?.id,
          eventTitle: activeTab.event?.title?.simpleTitle,
        }
      : null,
  });

  return (
    <div className="event-tab-manager">
      {/* Tab Header */}
      <div className="tab-header-container">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px 0 8px',
          }}
        >
          <div className="tab-header" style={{ flex: 1, padding: '0 0 0 0' }}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`chrome-tab ${activeTabId === tab.id ? 'chrome-tab-active' : 'chrome-tab-inactive'}`}
                onClick={() => switchTab(tab.id)}
              >
                <span className="tab-emoji">{tab.event.emoji || '📝'}</span>
                <span className="tab-title">
                  {tab.event.title?.simpleTitle || '未命名事件'}
                  {tab.isDirty && <span className="tab-dirty-indicator">*</span>}
                </span>
                <button className="tab-close-btn" onClick={(e) => closeTab(tab.id, e)} title="关闭">
                  ×
                </button>
              </div>
            ))}
          </div>
          {/* Global close button */}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '24px',
                color: '#666',
                cursor: 'pointer',
                padding: '4px 8px',
                marginLeft: '8px',
              }}
              title="关闭标签页管理器"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab ? (
          <EventEditModalV2
            eventId={activeTab.event.id}
            isOpen={true}
            onClose={() => closeTab(activeTab.id)}
            onSave={(updatedEvent) => {
              updateEvent(activeTab.id, updatedEvent);
              markSaved(activeTab.id);
            }}
            hierarchicalTags={[]}
          />
        ) : (
          <div className="tab-empty-state">
            <p>没有打开的标签页</p>
            <p className="tab-empty-hint">点击事件卡片的标签页按钮打开编辑器</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventTabManager;
