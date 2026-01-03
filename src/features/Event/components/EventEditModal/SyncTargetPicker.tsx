import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Event } from '@frontend/types';
import '@frontend/features/Calendar/styles/CalendarPicker.css'; // 🎨 复用 CalendarPicker 样式
import './SyncTargetPicker.css';

// 🎨 将 Microsoft 颜色名称转换为十六进制颜色（参考 CalendarMappingPicker）
const convertMicrosoftColorToHex = (colorName?: string): string => {
  const colorMap: { [key: string]: string } = {
    'lightBlue': '#5194f0',
    'lightGreen': '#42b883', 
    'lightOrange': '#ff8c42',
    'lightGray': '#9ca3af',
    'lightYellow': '#f1c40f',
    'lightTeal': '#48c9b0',
    'lightPink': '#f48fb1',
    'lightBrown': '#a0826d',
    'lightRed': '#e74c3c',
    'maxColor': '#6366f1'
  };
  
  if (!colorName) return '#3b82f6';
  return colorMap[colorName] || '#3b82f6';
};

interface SyncTargetPickerProps {
  // 用于判断是否为任务模式
  startTime?: string;
  endTime?: string;
  // 选中的 IDs
  selectedCalendarIds: string[];
  selectedTodoListIds: string[];
  // 回调函数
  onCalendarIdsChange: (calendarIds: string[]) => void;
  onTodoListIdsChange: (todoListIds: string[]) => void;
  // 服务实例
  microsoftService?: any; // Microsoft 服务实例，用于获取日历列表
  // ⚠️ 已废弃：保留用于向后兼容
  availableCalendars?: Array<{ id: string; name?: string; displayName?: string; color?: string }>;
  availableTodoLists?: Array<{ id: string; name?: string; displayName?: string; color?: string }>;
  // 可选配置
  maxSelection?: number;
  placeholder?: string;
}

/**
 * 智能同步目标选择器
 * - 有时间 (startTime && endTime) → 显示 Calendar Picker
 * - 无时间 (!startTime || !endTime) → 显示 To Do List Picker
 * - 双状态保留：切换时不丢失已选数据
 * - 完全复用 CalendarPicker 的 UI 风格
 */
export const SyncTargetPicker: React.FC<SyncTargetPickerProps> = ({
  startTime,
  endTime,
  selectedCalendarIds,
  selectedTodoListIds,
  onCalendarIdsChange,
  onTodoListIdsChange,
  microsoftService,
  availableCalendars: propCalendars,
  availableTodoLists: propTodoLists,
  maxSelection = 5,
  placeholder
}) => {
  // 🎯 判断当前是任务还是事件
  const isTask = useMemo(() => {
    return !startTime || !endTime;
  }, [startTime, endTime]);

  // 🔄 双状态保留
  const [calendarIds, setCalendarIds] = useState<string[]>(selectedCalendarIds || []);
  const [todoListIds, setTodoListIds] = useState<string[]>(selectedTodoListIds || []);

  // 🗓️ 日历列表状态（从服务获取）
  const [availableCalendars, setAvailableCalendars] = useState<Array<{ id: string; name?: string; displayName?: string; color?: string }>>([]);
  const [availableTodoLists, setAvailableTodoLists] = useState<Array<{ id: string; name?: string; displayName?: string; color?: string }>>([]);
  const [loading, setLoading] = useState(false);

  // 🔄 从 microsoftService 加载日历列表（参考 CalendarMappingPicker 的实现）
  const loadCalendars = useCallback(async () => {
    console.log('📅 SyncTargetPicker - loadCalendars 开始执行', {
      hasPropCalendars: !!(propCalendars && propCalendars.length > 0),
      hasPropTodoLists: !!(propTodoLists && propTodoLists.length > 0),
      hasMicrosoftService: !!microsoftService,
      hasGetCachedCalendars: !!(microsoftService && typeof microsoftService.getCachedCalendars === 'function'),
      hasGetCachedTodoLists: !!(microsoftService && typeof microsoftService.getCachedTodoLists === 'function')
    });

    // 🔧 统一管理 loading 状态
    setLoading(true);

    try {
      // === 加载日历 ===
      // 如果传入了 prop，优先使用
      if (propCalendars && propCalendars.length > 0) {
        console.log('📅 SyncTargetPicker - 使用传入的 propCalendars:', propCalendars.length);
        setAvailableCalendars(propCalendars);
      } else if (microsoftService && typeof microsoftService.getCachedCalendars === 'function') {
        // 如果有 microsoftService，从缓存或远程获取
        try {
          // 优先从缓存获取
          const cachedCalendars = microsoftService.getCachedCalendars();
          console.log('📅 SyncTargetPicker - getCachedCalendars 返回:', cachedCalendars?.length || 0);
          
          if (cachedCalendars && cachedCalendars.length > 0) {
            const mappedCalendars = cachedCalendars.map((cal: any) => ({
              id: cal.id,
              name: cal.name,
              displayName: cal.name,
              color: convertMicrosoftColorToHex(cal.color) // 🎨 转换颜色名称为十六进制
            }));
            setAvailableCalendars(mappedCalendars);
            console.log('📅 SyncTargetPicker - 从缓存加载日历:', mappedCalendars.length, mappedCalendars.slice(0, 2));
          } else {
            // 缓存为空，尝试从远程获取
            console.log('📅 SyncTargetPicker - 缓存为空，尝试从远程获取...');
            try {
              const { calendars } = await microsoftService.getAllCalendarData();
              const mappedCalendars = calendars.map((cal: any) => ({
                id: cal.id,
                name: cal.name,
                displayName: cal.name,
                color: convertMicrosoftColorToHex(cal.color) // 🎨 转换颜色名称为十六进制
              }));
              setAvailableCalendars(mappedCalendars);
              console.log('📅 SyncTargetPicker - 从远程加载日历:', mappedCalendars.length);
            } catch (error) {
              console.warn('📅 SyncTargetPicker - 远程获取失败，使用空列表:', error);
              setAvailableCalendars([]);
            }
          }
        } catch (error) {
          console.error('📅 SyncTargetPicker - 加载日历出错:', error);
          setAvailableCalendars([]);
        }
      } else {
        console.warn('📅 SyncTargetPicker - 没有 microsoftService 或缺少 getCachedCalendars 方法');
        setAvailableCalendars([]);
      }

      // === 加载 To Do Lists ===
      if (propTodoLists && propTodoLists.length > 0) {
        console.log('📋 SyncTargetPicker - 使用传入的 propTodoLists:', propTodoLists.length);
        setAvailableTodoLists(propTodoLists);
      } else if (microsoftService && typeof microsoftService.getCachedTodoLists === 'function') {
        try {
          // 优先从缓存获取
          const cachedTodoLists = microsoftService.getCachedTodoLists();
          console.log('📋 SyncTargetPicker - getCachedTodoLists 返回:', cachedTodoLists?.length || 0);
          
          if (cachedTodoLists && cachedTodoLists.length > 0) {
            const mappedTodoLists = cachedTodoLists.map((list: any) => ({
              id: list.id,
              name: list.displayName || list.name,
              displayName: list.displayName || list.name,
              color: '#3b82f6' // To Do Lists 默认蓝色
            }));
            setAvailableTodoLists(mappedTodoLists);
            console.log('📋 SyncTargetPicker - 从缓存加载待办列表:', mappedTodoLists.length);
          } else {
            // 缓存为空，尝试从远程获取
            console.log('📋 SyncTargetPicker - 缓存为空，尝试从远程获取...');
            try {
              const { todoLists } = await microsoftService.getAllTodoListData();
              const mappedTodoLists = todoLists.map((list: any) => ({
                id: list.id,
                name: list.displayName || list.name,
                displayName: list.displayName || list.name,
                color: '#3b82f6'
              }));
              setAvailableTodoLists(mappedTodoLists);
              console.log('📋 SyncTargetPicker - 从远程加载待办列表:', mappedTodoLists.length);
            } catch (error) {
              console.warn('📋 SyncTargetPicker - 远程获取失败，使用空列表:', error);
              setAvailableTodoLists([]);
            }
          }
        } catch (error) {
          console.error('📅 SyncTargetPicker - 加载待办列表出错:', error);
          setAvailableTodoLists([]);
        }
      } else {
        console.warn('📋 SyncTargetPicker - 没有 microsoftService 或缺少 getCachedTodoLists 方法');
        setAvailableTodoLists([]);
      }
    } finally {
      // 🔧 统一在最后关闭 loading
      setLoading(false);
    }
  }, [microsoftService, propCalendars, propTodoLists]); // 依赖稳定的引用

  // 组件 mount 时加载日历，并在 microsoftService 可用时重新加载
  useEffect(() => {
    // 🔧 只有在 microsoftService 存在或有 prop 数据时才加载
    if (microsoftService || propCalendars || propTodoLists) {
      console.log('🔄 SyncTargetPicker - useEffect 触发 loadCalendars', {
        hasMicrosoftService: !!microsoftService,
        hasPropCalendars: !!(propCalendars && propCalendars.length > 0),
        hasPropTodoLists: !!(propTodoLists && propTodoLists.length > 0)
      });
      loadCalendars();
    } else {
      console.warn('⚠️ SyncTargetPicker - useEffect 跳过 loadCalendars（条件不满足）');
    }
  }, [loadCalendars, microsoftService]); // 🔧 添加 microsoftService 作为显式依赖

  // 🔄 同步外部 props 到内部状态（当打开已有事件时）
  // 🔧 [FIX] 只在数组真正不同时才更新，避免循环渲染
  useEffect(() => {
    const propsChanged = JSON.stringify(selectedCalendarIds) !== JSON.stringify(calendarIds);
    if (propsChanged) {
      setCalendarIds(selectedCalendarIds || []);
    }
  }, [selectedCalendarIds]);

  useEffect(() => {
    const propsChanged = JSON.stringify(selectedTodoListIds) !== JSON.stringify(todoListIds);
    if (propsChanged) {
      setTodoListIds(selectedTodoListIds || []);
    }
  }, [selectedTodoListIds]);

  // UI 状态
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 🔧 [FIX] 移除会导致循环渲染的 useEffect
  // 改为在状态改变时直接调用回调函数
  
  // 获取当前激活的列表和选中的 IDs
  const activeItems = isTask ? availableTodoLists : availableCalendars;
  const activeSelectedIds = isTask ? todoListIds : calendarIds;
  const activeSetSelectedIds = isTask ? setTodoListIds : setCalendarIds;

  // 🐛 DEBUG: 输出可用的日历/任务列表（仅在组件挂载和 isTask 改变时）
  useEffect(() => {
    console.log('🎯 SyncTargetPicker Mode Change:', {
      isTask,
      availableCalendarsCount: availableCalendars.length,
      availableTodoListsCount: availableTodoLists.length,
      selectedCalendarIds: calendarIds,
      selectedTodoListIds: todoListIds
    });
  }, [isTask]); // 🔧 只在模式切换时触发

  // 过滤列表
  const filteredItems = activeItems.filter(item => {
    const name = item.name || item.displayName || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // 获取选中的项
  const selectedItems = activeItems.filter(item => 
    activeSelectedIds.includes(item.id)
  );

  // 切换选择
  const toggleItem = (itemId: string) => {
    const isSelected = activeSelectedIds.includes(itemId);
    let newSelection: string[];

    if (isSelected) {
      newSelection = activeSelectedIds.filter(id => id !== itemId);
    } else {
      if (activeSelectedIds.length >= maxSelection) {
        return;
      }
      newSelection = [...activeSelectedIds, itemId];
    }

    // 🔧 [FIX] 直接更新状态并调用回调，避免 useEffect 循环
    activeSetSelectedIds(newSelection);
    
    // 立即通知父组件
    if (isTask) {
      onTodoListIdsChange(newSelection);
    } else {
      onCalendarIdsChange(newSelection);
    }
  };

  // 移除选中的项
  const removeItem = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = activeSelectedIds.filter(id => id !== itemId);
    
    // 🔧 [FIX] 直接更新状态并调用回调，避免 useEffect 循环
    activeSetSelectedIds(newSelection);
    
    // 立即通知父组件
    if (isTask) {
      onTodoListIdsChange(newSelection);
    } else {
      onCalendarIdsChange(newSelection);
    }
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 获取显示名称
  const getItemName = (item: any) => {
    return item.name || item.displayName || `${isTask ? '列表' : '日历'} ${item.id.slice(-8)}`;
  };

  // 获取颜色
  const getItemColor = (item: any) => {
    return item.color || (isTask ? '#10b981' : '#3b82f6');
  };

  // 动态 placeholder
  const effectivePlaceholder = placeholder || (isTask ? '选择任务列表...' : '选择日历...');

  return (
    <div className="sync-target-picker-wrapper">
      {/* 🎨 状态切换提示 */}
      {isTask && calendarIds.length > 0 && (
        <div className="sync-switch-hint">
          � 检测到已选择 {calendarIds.length} 个日历，添加时间后将同步到日历
        </div>
      )}
      {!isTask && todoListIds.length > 0 && (
        <div className="sync-switch-hint">
          💡 检测到已选择 {todoListIds.length} 个任务列表，删除时间后将同步到任务列表
        </div>
      )}

      {/* 完全复用 CalendarPicker 样式 */}
      <div className="calendar-picker" ref={dropdownRef}>
        {/* 已选项 + 搜索框合并 */}
        <div 
          className="selected-calendars-with-search"
          onClick={() => setIsOpen(true)}
        >
          {selectedItems.map(item => (
            <span 
              key={item.id}
              className="calendar-chip"
              style={{ 
                borderColor: getItemColor(item),
                color: getItemColor(item)
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span 
                className="calendar-chip-dot"
                style={{ backgroundColor: getItemColor(item) }}
              ></span>
              {getItemName(item)}
              <button
                type="button"
                onClick={(e) => removeItem(item.id, e)}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            className="calendar-search-inline"
            placeholder={selectedItems.length === 0 ? effectivePlaceholder : "搜索..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* 下拉列表 */}
        {isOpen && (
          <div className="calendar-dropdown">
            <div className="calendar-dropdown-header">
              <span className="calendar-dropdown-title">
                {isTask ? '选择任务列表' : '选择日历'}
              </span>
              <button
                type="button"
                className="calendar-dropdown-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  setSearchQuery('');
                }}
              >
                ✕
              </button>
            </div>

            <div className="calendar-dropdown-list">
              {filteredItems.length > 0 ? (
                filteredItems.map(item => {
                  const isSelected = activeSelectedIds.includes(item.id);
                  const isDisabled = !isSelected && activeSelectedIds.length >= maxSelection;

                  return (
                    <label
                      key={item.id}
                      className={`filter-item calendar-item ${isDisabled ? 'disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => !isDisabled && toggleItem(item.id)}
                        disabled={isDisabled}
                      />
                      <div className="calendar-content">
                        {/* 颜色圆点 */}
                        <span 
                          className="calendar-dot" 
                          style={{ backgroundColor: getItemColor(item) }}
                        ></span>
                        
                        {/* 名称 */}
                        <span className="calendar-name">{getItemName(item)}</span>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="no-calendars">
                  {isTask ? '没有找到匹配的任务列表' : '没有找到匹配的日历'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 🔍 Debug 信息（开发模式） */}
      {process.env.NODE_ENV === 'development' && (
        <details className="sync-debug-info">
          <summary>调试信息</summary>
          <pre>
            {JSON.stringify({
              isTask,
              hasTime: !!(startTime && endTime),
              calendarIds,
              todoListIds,
              activeMode: isTask ? 'todo' : 'calendar'
            }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
};
