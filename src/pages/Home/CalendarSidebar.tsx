import React, { useState } from 'react';
import { TimeRange } from './TimeRangeSelector';
import './CalendarSidebar.css';

export interface CalendarSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onDateSelect: (range: TimeRange) => void;
}

/**
 * CalendarSidebar - 日历侧边栏
 * 
 * 功能：
 * 1. 显示日历视图
 * 2. 支持日期范围选择
 * 3. 选择后更新Dashboard统计区间
 * 4. 可拖拽调整宽度
 */
export const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
  isOpen,
  onClose,
  onDateSelect
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedRange, setSelectedRange] = useState<{
    start: Date | null;
    end: Date | null;
  }>({ start: null, end: null });

  // 获取当月天数
  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // 获取当月第一天是星期几
  const getFirstDayOfMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  // 生成日历数据
  const generateCalendarDays = (): Array<{
    date: Date;
    isCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    isInRange: boolean;
  }> => {
    const days = [];
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 上月末尾天数
    const prevMonthDays = getDaysInMonth(new Date(year, month - 1));
    for (let i = firstDay - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthDays - i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        isInRange: false
      });
    }

    // 当月天数
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      
      const isToday = date.getTime() === today.getTime();
      const isSelected = 
        (selectedRange.start && date.getTime() === selectedRange.start.getTime()) ||
        (selectedRange.end && date.getTime() === selectedRange.end.getTime());
      
      let isInRange = false;
      if (selectedRange.start && selectedRange.end) {
        isInRange = date >= selectedRange.start && date <= selectedRange.end;
      }

      days.push({
        date,
        isCurrentMonth: true,
        isToday,
        isSelected,
        isInRange
      });
    }

    // 下月开头天数（补齐42格）
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        isInRange: false
      });
    }

    return days;
  };

  // 处理日期点击
  const handleDateClick = (date: Date) => {
    if (!selectedRange.start || (selectedRange.start && selectedRange.end)) {
      // 开始新选择
      setSelectedRange({ start: date, end: null });
    } else {
      // 完成选择
      const start = selectedRange.start;
      const end = date;
      
      if (end < start) {
        setSelectedRange({ start: end, end: start });
        onDateSelect({
          type: 'custom',
          label: '自定义',
          startDate: end,
          endDate: start
        });
      } else {
        setSelectedRange({ start, end });
        onDateSelect({
          type: 'custom',
          label: '自定义',
          startDate: start,
          endDate: end
        });
      }
    }
  };

  // 切换月份
  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset));
  };

  // 快捷选择
  const quickSelect = (type: 'today' | 'thisWeek' | 'thisMonth') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (type) {
      case 'today':
        setSelectedRange({ start: today, end: today });
        onDateSelect({
          type: 'today',
          label: '今日',
          startDate: today,
          endDate: new Date(today.getTime() + 86400000 - 1)
        });
        break;
      case 'thisWeek':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1);
        setSelectedRange({ start: weekStart, end: today });
        onDateSelect({
          type: 'thisWeek',
          label: '本周',
          startDate: weekStart,
          endDate: now
        });
        break;
      case 'thisMonth':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        setSelectedRange({ start: monthStart, end: today });
        onDateSelect({
          type: 'thisMonth',
          label: '本月',
          startDate: monthStart,
          endDate: now
        });
        break;
    }
  };

  if (!isOpen) return null;

  const calendarDays = generateCalendarDays();
  const monthYearText = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;

  return (
    <>
      {/* 遮罩层 */}
      <div className="calendar-sidebar-overlay" onClick={onClose} />

      {/* 侧边栏 */}
      <div className="calendar-sidebar">
        {/* 头部 */}
        <div className="sidebar-header">
          <h3>📅 日历选择</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 快捷选择 */}
        <div className="quick-select">
          <button onClick={() => quickSelect('today')}>今日</button>
          <button onClick={() => quickSelect('thisWeek')}>本周</button>
          <button onClick={() => quickSelect('thisMonth')}>本月</button>
        </div>

        {/* 月份导航 */}
        <div className="month-nav">
          <button onClick={() => changeMonth(-1)}>‹</button>
          <span>{monthYearText}</span>
          <button onClick={() => changeMonth(1)}>›</button>
        </div>

        {/* 星期标题 */}
        <div className="weekday-header">
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>

        {/* 日历网格 */}
        <div className="calendar-grid">
          {calendarDays.map((day, index) => (
            <div
              key={index}
              className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${
                day.isToday ? 'today' : ''
              } ${day.isSelected ? 'selected' : ''} ${day.isInRange ? 'in-range' : ''}`}
              onClick={() => day.isCurrentMonth && handleDateClick(day.date)}
            >
              {day.date.getDate()}
            </div>
          ))}
        </div>

        {/* 选中范围提示 */}
        {selectedRange.start && (
          <div className="selected-range-info">
            <div className="range-text">
              {selectedRange.start.toLocaleDateString('zh-CN')}
              {selectedRange.end && ` - ${selectedRange.end.toLocaleDateString('zh-CN')}`}
            </div>
            <button 
              className="clear-btn"
              onClick={() => setSelectedRange({ start: null, end: null })}
            >
              清除
            </button>
          </div>
        )}
      </div>
    </>
  );
};
