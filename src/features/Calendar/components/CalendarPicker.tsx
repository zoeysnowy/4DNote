import React, { useState, useRef, useEffect } from 'react';
import '@frontend/features/Calendar/styles/CalendarPicker.css';

interface Calendar {
  id: string;
  name?: string;
  displayName?: string;
  color?: string;
  description?: string;
}

interface CalendarPickerProps {
  availableCalendars: Calendar[];
  selectedCalendarIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  placeholder?: string;
  maxSelection?: number;
  className?: string;
}

/**
 * 优雅的日历选择组件 - 类似于标签picker的设计
 */
export const CalendarPicker: React.FC<CalendarPickerProps> = ({
  availableCalendars = [],
  selectedCalendarIds = [],
  onSelectionChange,
  placeholder = "选择日历...",
  maxSelection = 5,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 过滤日历列表
  const filteredCalendars = availableCalendars.filter(calendar => {
    const name = calendar.name || calendar.displayName || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // 获取选中的日历
  const selectedCalendars = availableCalendars.filter(calendar => 
    selectedCalendarIds.includes(calendar.id)
  );

  const toggleCalendar = (calendarId: string) => {
    const isSelected = selectedCalendarIds.includes(calendarId);
    let newSelection: string[];

    if (isSelected) {
      newSelection = selectedCalendarIds.filter(id => id !== calendarId);
    } else {
      if (selectedCalendarIds.length >= maxSelection) {
        return;
      }
      newSelection = [...selectedCalendarIds, calendarId];
    }

    onSelectionChange(newSelection);
  };

  // 移除选中的日历
  const removeCalendar = (calendarId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedCalendarIds.filter(id => id !== calendarId);
    onSelectionChange(newSelection);
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

  // 获取日历显示名称
  const getCalendarName = (calendar: Calendar) => {
    return calendar.name || calendar.displayName || `日历 ${calendar.id.slice(-8)}`;
  };

  const getCalendarColor = (calendar: Calendar) => {
    return calendar.color || '#3498db';
  };

  return (
    <div className={`calendar-picker ${className}`} ref={dropdownRef}>
      {/* 已选日历 + 搜索框合并（类似 TagPicker） */}
      <div 
        className="selected-calendars-with-search"
        onClick={() => setIsOpen(true)}
      >
        {selectedCalendars.map(calendar => (
          <span 
            key={calendar.id}
            className="calendar-chip"
            style={{ 
              borderColor: getCalendarColor(calendar),
              color: getCalendarColor(calendar)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span 
              className="calendar-chip-dot"
              style={{ backgroundColor: getCalendarColor(calendar) }}
            ></span>
            {getCalendarName(calendar)}
            <button
              type="button"
              onClick={(e) => removeCalendar(calendar.id, e)}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="calendar-search-inline"
          placeholder={selectedCalendars.length === 0 ? "选择日历..." : "搜索..."}
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
            <span className="calendar-dropdown-title">选择日历</span>
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

          <div className="calendar-dropdown-list">{filteredCalendars.length > 0 ? (
                filteredCalendars.map(calendar => {
                  const isSelected = selectedCalendarIds.includes(calendar.id);
                  const isDisabled = !isSelected && selectedCalendarIds.length >= maxSelection;

                  return (
                    <label
                      key={calendar.id}
                      className={`filter-item calendar-item ${isDisabled ? 'disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => !isDisabled && toggleCalendar(calendar.id)}
                        disabled={isDisabled}
                      />
                      <div className="calendar-content">
                        {/* 颜色圆点 */}
                        <span 
                          className="calendar-dot" 
                          style={{ backgroundColor: getCalendarColor(calendar) }}
                        ></span>
                        
                        {/* 日历名称 */}
                        <span className="calendar-name">{getCalendarName(calendar)}</span>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="no-calendars">没有找到匹配的日历</div>
              )}
          </div>
        </div>
      )}
    </div>
  );
};