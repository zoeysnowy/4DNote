/**
 * Calendar Settings Panel - 日历设置面板
 * 
 * 功能：
 * 1. 事件透明度调整
 * 2. 标签筛选
 * 3. 日历分组筛选
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import React, { useState, useEffect, useRef } from 'react';
import '@frontend/features/Calendar/styles/CalendarSettingsPanel.css';
import '@frontend/features/Calendar/styles/CalendarPicker.css'; // 🎨 导入 CalendarPicker 样式以保持日历列表一致性

import { CalendarPicker } from './CalendarPicker';
import { HierarchicalTagPicker } from '@frontend/components/shared';

export interface CalendarSettings {
  eventOpacity: number; // 0-100
  visibleTags: string[]; // 显示的标签ID列表
  visibleCalendars: string[]; // 显示的日历ID列表
  showDeadline?: boolean; // 是否显示Deadline
  showTask?: boolean; // 是否显示Task
  showAllDay?: boolean; // 是否显示AllDay
  deadlineHeight?: number; // Deadline高度
  taskHeight?: number; // Task高度
  allDayHeight?: number; // AllDay高度
}

interface CalendarSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CalendarSettings;
  onSettingsChange: (settings: CalendarSettings) => void;
  availableTags: Array<{id: string; name: string; color: string; emoji?: string; level?: number; calendarId?: string}>;
  availableCalendars: Array<{id: string; name: string; color?: string}>;
  // Widget 模式专用
  isWidgetMode?: boolean;
  widgetOpacity?: number; // 0-1
  widgetColor?: string;
  widgetLocked?: boolean;
  onWidgetOpacityChange?: (opacity: number) => void;
  onWidgetColorChange?: (color: string) => void;
  onWidgetLockToggle?: (locked: boolean) => void;
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
}

const CalendarSettingsPanel: React.FC<CalendarSettingsPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  availableTags,
  availableCalendars,
  isWidgetMode = false,
  widgetOpacity = 1,
  widgetColor = '#ffffff',
  widgetLocked = false,
  onWidgetOpacityChange,
  onWidgetColorChange,
  onWidgetLockToggle,
  onHeaderMouseDown
}) => {
  const [localSettings, setLocalSettings] = useState<CalendarSettings>(settings);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // 🔧 动态计算初始位置：基于"设置"按钮的位置
  const getInitialPosition = () => {
    if (typeof window === 'undefined') return { x: 1588, y: 180 };
    
    // 🎯 尝试找到"设置"按钮
    const settingsButton = Array.from(document.querySelectorAll('.toastui-calendar-nav-button'))
      .find(btn => btn.textContent?.includes('设置')) as HTMLElement;
    
    if (settingsButton) {
      const rect = settingsButton.getBoundingClientRect();
      return {
        x: rect.left, // 对齐按钮左侧
        y: rect.bottom + 8 // 按钮下方 8px
      };
    }
    
    // 回退方案：尝试获取 time-calendar-container 的位置
    const calendarContainer = document.querySelector('.time-calendar-container');
    if (calendarContainer) {
      const rect = calendarContainer.getBoundingClientRect();
      return {
        x: rect.right - 332, // 面板宽度312px + 20px边距
        y: rect.top + 40 // 容器顶部 + 一点间距（考虑toolbar高度）
      };
    }
    
    // 最终回退：使用窗口尺寸
    return {
      x: window.innerWidth - 332,
      y: 180
    };
  };
  
  const [position, setPosition] = useState(getInitialPosition);

  // 🔧 每次打开时重新计算位置
  useEffect(() => {
    if (isOpen) {
      setPosition(getInitialPosition());
    }
  }, [isOpen]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // 自动全选所有可用日历（用户登录后）
  useEffect(() => {
    if (isOpen && availableCalendars.length > 0) {
      // 如果当前没有选中任何日历，自动全选
      if (localSettings.visibleCalendars.length === 0) {
        const allCalendarIds = availableCalendars.map(c => c.id);
        const newSettings = { ...localSettings, visibleCalendars: allCalendarIds };
        setLocalSettings(newSettings);
        onSettingsChange(newSettings);
      } else {
        // 如果有新增的日历（用户新登录了账号），自动勾选新日历
        const currentIds = new Set(localSettings.visibleCalendars);
        const newCalendarIds = availableCalendars
          .map(c => c.id)
          .filter(id => !currentIds.has(id));
        
        if (newCalendarIds.length > 0) {
          const updatedCalendarIds = [...localSettings.visibleCalendars, ...newCalendarIds];
          const newSettings = { ...localSettings, visibleCalendars: updatedCalendarIds };
          setLocalSettings(newSettings);
          onSettingsChange(newSettings);
        }
      }
    }
  }, [isOpen, availableCalendars]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // 拖动功能
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.close-btn')) return; // 不影响关闭按钮
    
    const panel = panelRef.current;
    if (!panel) return;
    
    const rect = panel.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setLocalSettings(prev => ({ ...prev, eventOpacity: value }));
  };

  const handleOpacityChangeEnd = () => {
    onSettingsChange(localSettings);
  };

  const handleTagToggle = (tagId: string) => {
    const isRemoving = localSettings.visibleTags.includes(tagId);
    const newVisibleTags = isRemoving
      ? localSettings.visibleTags.filter(id => id !== tagId)
      : [...localSettings.visibleTags, tagId];
    
    let newVisibleCalendars = [...localSettings.visibleCalendars];
    
    if (!isRemoving && tagId !== 'no-tag') {
      const tag = availableTags.find(t => t.id === tagId);
      if (tag && tag.calendarId && !newVisibleCalendars.includes(tag.calendarId)) {
        newVisibleCalendars.push(tag.calendarId);
      }
    }
    
    const newSettings = { 
      ...localSettings, 
      visibleTags: newVisibleTags,
      visibleCalendars: newVisibleCalendars
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleTagSelectionChange = (selectedIds: string[]) => {
    const prevSelected = localSettings.visibleTags;
    const addedIds = selectedIds.filter(id => !prevSelected.includes(id));

    let newVisibleCalendars = [...localSettings.visibleCalendars];
    for (const tagId of addedIds) {
      if (tagId === 'no-tag') continue;
      const tag = availableTags.find(t => t.id === tagId);
      if (tag?.calendarId && !newVisibleCalendars.includes(tag.calendarId)) {
        newVisibleCalendars.push(tag.calendarId);
      }
    }

    const newSettings = {
      ...localSettings,
      visibleTags: selectedIds,
      visibleCalendars: newVisibleCalendars,
    };

    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleCalendarToggle = (calendarId: string) => {
    const isRemoving = localSettings.visibleCalendars.includes(calendarId);
    const newVisibleCalendars = isRemoving
      ? localSettings.visibleCalendars.filter(id => id !== calendarId)
      : [...localSettings.visibleCalendars, calendarId];
    
    let newVisibleTags = [...localSettings.visibleTags];
    
    if (isRemoving && !['local-created', 'not-synced'].includes(calendarId)) {
      const tagsToRemove = availableTags
        .filter(tag => tag.calendarId === calendarId)
        .map(tag => tag.id);
      
      if (tagsToRemove.length > 0) {
        newVisibleTags = newVisibleTags.filter(id => !tagsToRemove.includes(id));
      }
    }
    
    const newSettings = { 
      ...localSettings, 
      visibleTags: newVisibleTags,
      visibleCalendars: newVisibleCalendars
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleCalendarSelectionChange = (selectedIds: string[]) => {
    const prevSelected = localSettings.visibleCalendars;
    const removedIds = prevSelected.filter(id => !selectedIds.includes(id));

    let newVisibleTags = [...localSettings.visibleTags];
    for (const calendarId of removedIds) {
      if (['local-created', 'not-synced'].includes(calendarId)) continue;

      const tagsToRemove = availableTags
        .filter(tag => tag.calendarId === calendarId)
        .map(tag => tag.id);

      if (tagsToRemove.length > 0) {
        newVisibleTags = newVisibleTags.filter(id => !tagsToRemove.includes(id));
      }
    }

    const newSettings = {
      ...localSettings,
      visibleTags: newVisibleTags,
      visibleCalendars: selectedIds,
    };

    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleSelectAllTags = () => {
    const newSettings = { 
      ...localSettings, 
      visibleTags: availableTags.map(t => t.id) 
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleDeselectAllTags = () => {
    const newSettings = { ...localSettings, visibleTags: [] };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleSelectAllCalendars = () => {
    const newSettings = { 
      ...localSettings, 
      visibleCalendars: availableCalendars.map(c => c.id) 
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleDeselectAllCalendars = () => {
    const newSettings = { ...localSettings, visibleCalendars: [] };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleCategoryToggle = (category: 'deadline' | 'task' | 'allDay') => {
    const key = category === 'deadline' ? 'showDeadline' : 
                category === 'task' ? 'showTask' : 'showAllDay';
    const newSettings = { ...localSettings, [key]: !localSettings[key] };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleHeightChange = (category: 'deadline' | 'task' | 'allDay', height: number) => {
    const key = category === 'deadline' ? 'deadlineHeight' : 
                category === 'task' ? 'taskHeight' : 'allDayHeight';
    const newSettings = { ...localSettings, [key]: height };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleShowAll = () => {
    const newSettings = {
      ...localSettings,
      visibleTags: [],
      visibleCalendars: []
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  // 🖱️ 拖拽功能（仅普通模式）
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isWidgetMode) return; // Widget模式不允许拖拽
    
    e.preventDefault();
    const panel = (e.target as HTMLElement).closest('.calendar-settings-panel') as HTMLElement;
    if (!panel) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = panel.offsetLeft;
    const startTop = panel.offsetTop;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      panel.style.left = `${startLeft + deltaX}px`;
      panel.style.top = `${startTop + deltaY}px`;
      panel.style.position = 'absolute';
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!isOpen) return null;

  // 🎨 渲染设置内容（Widget 模式和普通模式共用）
  const renderSettingsContent = () => (
    <div className="settings-content" onMouseDown={(e) => e.stopPropagation()}>
      {/* 🖥️ Widget 模式专用控件 */}
      {isWidgetMode && (
        <>
          {/* Widget 透明度调整 */}
          <div className="settings-section compact-section">
            <div className="compact-slider-row">
              <span className="slider-label">🪟 组件透明度</span>
              <div className="slider-track-wrapper">
                <div 
                  className="slider-track-fill" 
                  style={{ width: `${widgetOpacity * 100}%` }}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={widgetOpacity * 100}
                  onChange={(e) => {
                    const newOpacity = parseInt(e.target.value) / 100;
                    onWidgetOpacityChange?.(newOpacity);
                  }}
                  className="inline-slider with-track"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
              <span className="slider-value">{Math.round(widgetOpacity * 100)}%</span>
            </div>
          </div>

          {/* Widget 背景颜色 */}
          <div className="settings-section compact-section">
            <div className="compact-slider-row">
              <span className="slider-label">🎨 背景颜色</span>
              <input
                type="color"
                value={widgetColor}
                onChange={(e) => onWidgetColorChange?.(e.target.value)}
                className="widget-color-input"
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Widget 锁定位置 */}
          <div className="settings-section compact-section">
            <div className="compact-slider-row">
              <span className="slider-label">📌 置顶显示</span>
              <label 
                className="widget-lock-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <input
                  type="checkbox"
                  checked={widgetLocked}
                  onChange={(e) => {
                    e.stopPropagation();
                    onWidgetLockToggle?.(e.target.checked);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
                <span className="widget-lock-text">
                  {widgetLocked ? '已置顶' : '未置顶'}
                </span>
              </label>
            </div>
          </div>
        </>
      )}

      {/* 透明度调整 */}
      <div className="settings-section compact-section">
        <div className="compact-slider-row">
          <span className="slider-label">🎨 事件透明度</span>
          <div className="slider-track-wrapper">
            <div 
              className="slider-track-fill" 
              style={{ width: `${(localSettings.eventOpacity - 20) / 0.8}%` }}
            />
            <input
              type="range"
              min="20"
              max="100"
              value={localSettings.eventOpacity}
              onChange={handleOpacityChange}
              onMouseUp={handleOpacityChangeEnd}
              onTouchEnd={handleOpacityChangeEnd}
              className="inline-slider with-track"
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <span className="slider-value">{localSettings.eventOpacity}%</span>
        </div>
      </div>

      {/* 事件类型显示设置 */}
      <div className="settings-section compact-section">
        <div className="section-title">
          <span>📋 事件类型显示</span>
        </div>
        <div className="category-settings-compact">
          {/* Deadline */}
          <div className="compact-category-row">
            <label className="category-checkbox">
              <input
                type="checkbox"
                checked={localSettings.showDeadline !== false}
                onChange={() => handleCategoryToggle('deadline')}
              />
              <span>🎯 Deadline</span>
            </label>
            {localSettings.showDeadline !== false && (
              <>
                <div className="slider-track-wrapper compact">
                  <div 
                    className="slider-track-fill" 
                    style={{ width: `${((localSettings.deadlineHeight || 24) / 300) * 100}%` }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="300"
                    value={localSettings.deadlineHeight || 24}
                    onChange={(e) => handleHeightChange('deadline', Number(e.target.value))}
                    className="inline-slider compact with-track"
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                </div>
                <span className="slider-value compact">{localSettings.deadlineHeight || 24}px</span>
              </>
            )}
          </div>

          {/* Task */}
          <div className="compact-category-row">
            <label className="category-checkbox">
              <input
                type="checkbox"
                checked={localSettings.showTask !== false}
                onChange={() => handleCategoryToggle('task')}
              />
              <span>✅ Task</span>
            </label>
            {localSettings.showTask !== false && (
              <>
                <div className="slider-track-wrapper compact">
                  <div 
                    className="slider-track-fill" 
                    style={{ width: `${((localSettings.taskHeight || 24) / 300) * 100}%` }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="300"
                    value={localSettings.taskHeight || 24}
                    onChange={(e) => handleHeightChange('task', Number(e.target.value))}
                    className="inline-slider compact with-track"
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                </div>
                <span className="slider-value compact">{localSettings.taskHeight || 24}px</span>
              </>
            )}
          </div>

          {/* All Day */}
          <div className="compact-category-row">
                <label className="category-checkbox">
                  <input
                    type="checkbox"
                    checked={localSettings.showAllDay !== false}
                    onChange={() => handleCategoryToggle('allDay')}
                  />
                  <span>📅 All Day</span>
                </label>
                {localSettings.showAllDay !== false && (
                  <>
                    <div className="slider-track-wrapper compact">
                      <div 
                        className="slider-track-fill" 
                        style={{ width: `${((localSettings.allDayHeight || 24) / 300) * 100}%` }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="300"
                        value={localSettings.allDayHeight || 24}
                        onChange={(e) => handleHeightChange('allDay', Number(e.target.value))}
                        className="inline-slider compact with-track"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <span className="slider-value compact">{localSettings.allDayHeight || 24}px</span>
                  </>
                )}
              </div>
            </div>
          </div>

      {/* 标签筛选 */}
      <div className="settings-section">
        <div className="section-title">
          <span>🏷️ 显示标签 {localSettings.visibleTags.length === 0 && <span className="settings-hint">(全部)</span>}</span>
          <div className="section-actions">
            <button onClick={handleSelectAllTags} className="action-btn">全选</button>
            <button onClick={handleDeselectAllTags} className="action-btn">清空</button>
          </div>
        </div>
        <HierarchicalTagPicker
          availableTags={availableTags}
          selectedTagIds={localSettings.visibleTags}
          onSelectionChange={handleTagSelectionChange}
          multiple={true}
          searchable={false}
          showSelectedChips={false}
          showBulkActions={false}
          mode="inline"
          className="calendar-settings-tag-picker"
        />
      </div>

      {/* 日历分组筛选 */}
      <div className="settings-section">
        <div className="section-title">
          <span>📅 显示日历</span>
          <div className="section-actions">
            <button onClick={handleSelectAllCalendars} className="action-btn">全选</button>
            <button onClick={handleDeselectAllCalendars} className="action-btn">清空</button>
          </div>
        </div>
        <CalendarPicker
          availableCalendars={availableCalendars}
          selectedCalendarIds={localSettings.visibleCalendars}
          onSelectionChange={handleCalendarSelectionChange}
          maxSelection={Number.MAX_SAFE_INTEGER}
          mode="list"
          listClassName="filter-list calendar-filter-list"
        />
      </div>
    </div>
  );  // 🖥️ Widget 模式：不需要 overlay 包裹
  if (isWidgetMode) {
    return (
      <div className="calendar-settings-panel widget-mode">
        <div 
          className="settings-header"
          onMouseDown={onHeaderMouseDown}
        >
          <h3>⚙️ Widget 设置</h3>
          <button 
            className="close-button" 
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
          >
            ✕
          </button>
        </div>
        {renderSettingsContent()}
      </div>
    );
  }

  // 📅 普通模式：带 overlay 包裹（主应用中）
  return (
    <div className="calendar-settings-overlay" onClick={onClose}>
      <div 
        className="calendar-settings-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="settings-header"
          onMouseDown={handleMouseDown}
        >
          <h3>⚙️ 日历设置</h3>
          <button 
            className="close-button" 
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
          >
            ✕
          </button>
        </div>
        {renderSettingsContent()}
      </div>
    </div>
  );
};

export default CalendarSettingsPanel;

