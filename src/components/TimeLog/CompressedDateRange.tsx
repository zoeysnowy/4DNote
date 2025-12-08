/**
 * CompressedDateRange Component - 压缩日期范围组件
 * 
 * 显示连续的空白日期（没有事件的日期），横向排列节省纵向空间
 * 类似日历月视图的紧凑显示
 * 
 * @author Zoey
 * @date 2025-12-06
 */

import React from 'react';
import './CompressedDateRange.css';

interface CompressedDateRangeProps {
  /** 起始日期 */
  startDate: Date;
  /** 结束日期 */
  endDate: Date;
  /** 点击日期的回调 */
  onDateClick?: (date: Date) => void;
}

export const CompressedDateRange: React.FC<CompressedDateRangeProps> = ({
  startDate,
  endDate,
  onDateClick,
}) => {
  // 生成日期范围内的所有日期
  const generateDateRange = (): Date[] => {
    const dates: Date[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  };

  // 按月分组日期
  const groupByMonth = (dates: Date[]): Map<string, Date[]> => {
    const groups = new Map<string, Date[]>();
    
    dates.forEach(date => {
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      if (!groups.has(monthKey)) {
        groups.set(monthKey, []);
      }
      groups.get(monthKey)!.push(date);
    });
    
    return groups;
  };

  const dates = generateDateRange();
  const monthGroups = groupByMonth(dates);

  // 格式化月份标题
  const formatMonthTitle = (year: number, month: number) => {
    return `${year}.${month}`;
  };

  // 获取星期几的简称
  const getWeekdayName = (date: Date): string => {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return weekdays[date.getDay()];
  };

  return (
    <div className="compressed-date-range">
      {Array.from(monthGroups.entries()).map(([monthKey, monthDates]) => {
        const firstDate = monthDates[0];
        const year = firstDate.getFullYear();
        const month = firstDate.getMonth() + 1;

        return (
          <div key={monthKey} className="compressed-month-group">
            {/* 日期网格 - 月份标题已在外层TimeLog显示 */}
            <div className="compressed-dates-grid">
              {monthDates.map((date, index) => {
                const day = date.getDate();
                const weekday = getWeekdayName(date);
                const dayOfWeek = date.getDay();
                const isToday = 
                  date.getFullYear() === new Date().getFullYear() &&
                  date.getMonth() === new Date().getMonth() &&
                  date.getDate() === new Date().getDate();

                // 在周一（dayOfWeek === 1）前添加周分隔线
                const showWeekSeparator = dayOfWeek === 1 && index > 0;

                return (
                  <React.Fragment key={index}>
                    {showWeekSeparator && <div className="week-separator" />}
                    <button
                      className={`compressed-date-cell ${isToday ? 'is-today' : ''}`}
                      onClick={(e) => {
                        console.log('🖱️ [CompressedDateRange] Button clicked:', date, 'onDateClick exists:', !!onDateClick);
                        e.stopPropagation();
                        onDateClick?.(date);
                      }}
                      title={`${year}年${month}月${day}日（周${weekday}）`}
                    >
                      <span className="date-weekday">{weekday}</span>
                      <span className="date-day">{day}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
