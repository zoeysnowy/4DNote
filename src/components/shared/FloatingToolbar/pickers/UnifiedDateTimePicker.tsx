import React, { useState, useRef, useEffect } from 'react';
import { Button, Space } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import 'dayjs/locale/zh-cn';
import './UnifiedDateTimePicker.css';
import { useEventTime } from '@frontend/hooks/useEventTime';
import { formatTimeForStorage, parseLocalTimeString } from '@frontend/utils/timeUtils';
import { dbg, warn, error } from '@frontend/utils/debugLogger';
import { SearchIcon } from './icons/Search';
import { TaskGrayIcon } from './icons/TaskGray';
import { TaskColorIcon } from './icons/TaskColor';
import { parseNaturalLanguage } from '@frontend/utils/naturalLanguageTimeDictionary';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.locale('zh-cn');

interface UnifiedDateTimePickerProps {
  onSelect?: (start: string | null, end: string | null) => void;
  onClose?: () => void;
  onApplied?: (startIso: string, endIso?: string, allDay?: boolean, userInputText?: string) => void; // TimeHub 模式：写入成功后回调（外层可插入可视化标记/保存其它字段），新增 userInputText 参数
  eventId?: string;         // 可选：绑定事件ID时，将通过 TimeHub 读写
  useTimeHub?: boolean;     // 可选：默认 false，置为 true 时启用 TimeHub
  initialStart?: string | Date; // 当没有 eventId 或 TimeHub 尚未返回时的初始值
  initialEnd?: string | Date;
  initialText?: string;     // 🆕 用户在 @ 后输入的初始文本（如 "明天"），作为自然语言输入框的初始值
  onSearchChange?: (text: string, parsed: { start?: Date; end?: Date } | null) => void; // 🆕 搜索框变化时的回调，用于实时更新父组件的解析结果
}

// 自定义时间列选择器
const TimeColumn: React.FC<{
  type: 'hour' | 'minute';
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  scrollTrigger?: number; // 外部触发器，用于强制重新滚动
}> = ({ type, value, onChange, disabled, scrollTrigger }) => {
  const max = type === 'hour' ? 23 : 59;
  const items = Array.from({ length: max + 1 }, (_, i) => i);
  
  const columnRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const cellHeightRef = useRef<number>(21.6); // 默认值，会动态更新
  
  // 动态获取CSS中实际的cell高度
  useEffect(() => {
    if (contentRef.current) {
      const firstCell = contentRef.current.querySelector('.time-cell');
      if (firstCell) {
        const computedHeight = window.getComputedStyle(firstCell).height;
        cellHeightRef.current = parseFloat(computedHeight);
      }
    }
  }, []); // 只在组件挂载时获取一次
  
  // 当值改变时，滚动到中间组的对应位置
  useEffect(() => {
    if (columnRef.current && contentRef.current) {
      // 确保DOM已经渲染，使用requestAnimationFrame延迟到下一帧
      requestAnimationFrame(() => {
        if (!columnRef.current || !contentRef.current) return;
        
        // 动态读取当前的cell高度（以防CSS还未应用）
        const firstCell = contentRef.current.querySelector('.time-cell');
        if (firstCell) {
          const computedHeight = window.getComputedStyle(firstCell).height;
          const parsedHeight = parseFloat(computedHeight);
          if (!isNaN(parsedHeight)) {
            cellHeightRef.current = parsedHeight;
          }
        }
        
        const cellHeight = cellHeightRef.current;
        const containerHeight = columnRef.current.clientHeight;
        
        
        // 验证值是否有效
        if (!cellHeight || !containerHeight || isNaN(cellHeight) || isNaN(containerHeight)) {
          console.warn(`⚠️ [TimeColumn] ${type} invalid dimensions, skipping scroll`);
          return;
        }
        
        // 计算滚动到中间组的位置
        // 每组有 (max + 2) 个项（包括 -- 和 0 到 max）
        const groupSize = max + 2;
        
        let selectedIndex;
        if (value === null) {
          // -- 在每组的第一个位置，滚动到中间组的 --
          selectedIndex = groupSize;
        } else {
          // 数字在 -- 之后，+1 是 -- 的位置，再 + value
          selectedIndex = groupSize + 1 + value;
        }
        
        // 计算滚动位置，让选中项在距离顶部约1/3的位置，这样4个列的选中值会在同一水平线上
        const offsetFromTop = containerHeight * 0.3; // 距离顶部30%的位置
        const scrollTop = selectedIndex * cellHeight - offsetFromTop;
        
        
        isScrollingRef.current = true;
        columnRef.current.scrollTo({
          top: Math.max(0, scrollTop),
          behavior: 'smooth'
        });
        
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 300);
      });
    }
  }, [value, max, type, scrollTrigger]); // 添加scrollTrigger依赖，使其变化时也触发滚动
  
  // 处理无限滚动：当滚动到边界时，跳转回中间组
  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    
    const handleScroll = () => {
      if (isScrollingRef.current) return;
      
      const cellHeight = cellHeightRef.current; // 使用动态获取的高度
      const groupSize = max + 2;
      const groupHeight = groupSize * cellHeight;
      const scrollTop = column.scrollTop;
      const scrollHeight = column.scrollHeight;
      const clientHeight = column.clientHeight;
      
      // 如果滚动到接近顶部（第1组），跳转到第2组相同位置
      if (scrollTop < groupHeight * 0.5) {
        isScrollingRef.current = true;
        column.scrollTop = scrollTop + groupHeight;
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 50);
      }
      // 如果滚动到接近底部（第3组），跳转到第2组相同位置
      else if (scrollTop > scrollHeight - clientHeight - groupHeight * 0.5) {
        isScrollingRef.current = true;
        column.scrollTop = scrollTop - groupHeight;
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 50);
      }
    };
    
    column.addEventListener('scroll', handleScroll);
    return () => column.removeEventListener('scroll', handleScroll);
  }, [max]);
  
  const handleChange = (item: number | null) => {
    if (!disabled) {
      onChange(item);
    }
  };
  
  // 渲染一组：-- + 0~max
  const renderGroup = (groupIndex: number) => {
    return (
      <React.Fragment key={`group-${groupIndex}`}>
        {/* -- 选项 */}
        <div
          className={`time-cell no-select ${value === null ? 'selected' : ''}`}
          onClick={() => handleChange(null)}
        >
          --
        </div>
        {/* 数字选项 */}
        {items.map(item => (
          <div
            key={`${groupIndex}-${item}`}
            className={`time-cell ${item === value ? 'selected' : ''}`}
            onClick={() => handleChange(item)}
          >
            {item.toString().padStart(2, '0')}
          </div>
        ))}
      </React.Fragment>
    );
  };
  
  
  return (
    <div className={`time-column ${disabled ? 'disabled' : ''}`} ref={columnRef}>
      <div className="time-column-content" ref={contentRef}>
        {/* 渲染3组循环 */}
        {renderGroup(0)}
        {renderGroup(1)}
        {renderGroup(2)}
      </div>
    </div>
  );
};

// 时间选择器组件
const TimeSelector: React.FC<{
  value: { hour: number; minute: number } | null;
  onChange: (time: { hour: number; minute: number } | null) => void;
  title: string;
  disabled?: boolean;
}> = ({ value, onChange, title, disabled }) => {
  const handleHourChange = (hour: number | null) => {
    if (hour === null) {
      onChange(null);
    } else {
      onChange({ hour, minute: value?.minute ?? 0 });
    }
  };

  const handleMinuteChange = (minute: number | null) => {
    if (minute === null) {
      onChange(null);
    } else {
      onChange({ hour: value?.hour ?? 0, minute });
    }
  };

  return (
    <div className={`time-selector ${disabled ? 'disabled' : ''}`}>
      {title && <div className="time-selector-header">{title}</div>}
      <div className="time-columns">
        <TimeColumn
          type="hour"
          value={value?.hour ?? null}
          onChange={handleHourChange}
          disabled={disabled}
        />
        <div className="time-separator">:</div>
        <TimeColumn
          type="minute"
          value={value?.minute ?? null}
          onChange={handleMinuteChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

// 计算时长显示
const calculateDuration = (start: Dayjs, end: Dayjs) => {
  const diffMinutes = end.diff(start, 'minute');
  const days = Math.floor(diffMinutes / (24 * 60));
  const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) {
    if (hours > 0 && minutes > 0) {
      return `${days}D${hours}h${minutes}min`;
    } else if (hours > 0) {
      return `${days}D${hours}h`;
    } else if (minutes > 0) {
      return `${days}D${minutes}min`;
    } else {
      return `${days}D`;
    }
  } else if (hours > 0) {
    if (minutes > 0) {
      return `${hours}h${minutes}min`;
    } else {
      return `${hours}h`;
    }
  } else {
    return `${minutes}min`;
  }
};

const UnifiedDateTimePicker: React.FC<UnifiedDateTimePickerProps> = ({
  onSelect,
  onClose,
  onApplied,
  eventId,
  useTimeHub = false,
  initialStart,
  initialEnd,
  initialText = '', // 🆕 接收用户在 @ 后输入的初始文本
  onSearchChange,   // 🆕 搜索框变化回调
}) => {
  // Hooks must be called unconditionally; useEventTime gracefully handles undefined eventId
  const eventTime = useEventTime(eventId);
  // 默认选择今天的日期
  const [selectedDates, setSelectedDates] = useState<{start: Dayjs | null, end: Dayjs | null}>({
    start: dayjs(),
    end: dayjs()
  });
  const [startTime, setStartTime] = useState<{ hour: number; minute: number } | null>(null);
  const [endTime, setEndTime] = useState<{ hour: number; minute: number } | null>(null);
  const [hoverDate, setHoverDate] = useState<Dayjs | null>(null);
  const [isSelecting, setIsSelecting] = useState<'start' | 'end' | null>(null);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [isEditingMonth, setIsEditingMonth] = useState(false);
  const [editYear, setEditYear] = useState(dayjs().year().toString());
  const [editMonth, setEditMonth] = useState((dayjs().month() + 1).toString());
  const [selectedQuickBtn, setSelectedQuickBtn] = useState<string | null>(null);
  const [scrollTrigger, setScrollTrigger] = useState<number>(0); // 用于强制重新滚动
  
  // 新增: chrono 搜索框和全天按钮状态
  const [searchInput, setSearchInput] = useState(initialText); // 🔧 使用 initialText 作为初始值
  const [allDay, setAllDay] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // 🆕 v1.1: displayHint 状态（保存用户原始输入的模糊时间）
  const [displayHint, setDisplayHint] = useState<string | null>(null);
  
  // 🆕 v2.7: 模糊时间段状态
  const [fuzzyTimeName, setFuzzyTimeName] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const editContainerRef = useRef<HTMLDivElement>(null);
  
  // 🆕 v2.9: 组件挂载时自动聚焦到自然语言输入框
  useEffect(() => {
    // 延迟聚焦，确保 DOM 已完全渲染
    const timer = setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        dbg('picker', '🎯 自动聚焦到自然语言输入框');
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 当绑定了事件且存在已保存时间时，用其初始化本地选择状态；否则尝试使用初始值
  useEffect(() => {
    if (!eventTime || eventTime.loading) return;
    
    // 🔧 修复：使用 parseLocalTimeString 解析已存储的时间字符串，避免 dayjs 直接解析触发时区转换
    // 原因：eventTime.start/end 是 'YYYY-MM-DD HH:mm:ss' 格式（本地时间，空格分隔）
    // parseLocalTimeString 会手动构造 Date 对象（new Date(y,m,d,h,min,s)），绕过 ISO 8601 解析器
    const start = eventTime.start ? dayjs(parseLocalTimeString(eventTime.start)) : null;
    const end = eventTime.end ? dayjs(parseLocalTimeString(eventTime.end)) : null;
    
    dbg('picker', '🔄 从 TimeHub 快照初始化 Picker', { 
      eventId, 
      快照start: eventTime.start, 
      快照end: eventTime.end, 
      loading: eventTime.loading,
      timeFieldState: eventTime.timeFieldState,
      解析后的start: start?.format('YYYY-MM-DD HH:mm'),
      解析后的end: end?.format('YYYY-MM-DD HH:mm'),
      是否有endTime: !!eventTime.end
    });
    if (start) {
      // 🔧 v2.9: 日期选择器需要 end 来高亮范围，如果没有 end 就用 start
      // 但时间状态由 timeFieldState 恢复，不受影响
      setSelectedDates({ start, end: end || start });
      
      // 🆕 v2.7.4: 直接使用 timeFieldState 中存储的实际值（避免从 ISO 解析时间）
      const savedFieldState = eventTime.timeFieldState;
      if (savedFieldState) {
        const [startHour, startMinute, endHour, endMinute] = savedFieldState;
        setStartTime(startHour !== null && startMinute !== null 
          ? { hour: startHour, minute: startMinute } 
          : null);
        setEndTime(endHour !== null && endMinute !== null 
          ? { hour: endHour, minute: endMinute } 
          : null);
        dbg('picker', '✅ Picker 状态已更新（从 timeFieldState 恢复）', { 
          timeFieldState: savedFieldState,
          startTime: startHour !== null ? { hour: startHour, minute: startMinute } : null,
          endTime: endHour !== null ? { hour: endHour, minute: endMinute } : null
        });
      } else {
        // 降级：如果没有 timeFieldState，根据时间是否为 00:00 判断
        const hasSpecificStart = start.hour() !== 0 || start.minute() !== 0;
        const hasSpecificEnd = end ? (end.hour() !== 0 || end.minute() !== 0) : false;
        setStartTime(hasSpecificStart ? { hour: start.hour(), minute: start.minute() } : null);
        setEndTime(end && hasSpecificEnd ? { hour: end.hour(), minute: end.minute() } : null);
        dbg('picker', '⚠️ 降级：使用时间判断（无 timeFieldState）', { 
          startTime: hasSpecificStart ? { hour: start.hour(), minute: start.minute() } : null,
          endTime: end && hasSpecificEnd ? { hour: end.hour(), minute: end.minute() } : null
        });
      }
    }
  }, [eventTime?.start, eventTime?.end, eventTime?.loading, eventTime?.timeFieldState]);

  // 若 TimeHub 尚无快照，且提供了 initialStart/initialEnd，则用其初始化（用于无 eventId 或延迟场景）
  useEffect(() => {
    if (eventTime && (eventTime.start || eventTime.end)) return; // 已有 TimeHub 数据
    if (!initialStart) return; // 无初始值
    
    // 🆕 v2.8: 使用统一的时间解析函数，正确处理 undefined endTime
    const start = dayjs(typeof initialStart === 'string' ? parseLocalTimeString(initialStart) : initialStart);
    const end = initialEnd
      ? dayjs(typeof initialEnd === 'string' ? parseLocalTimeString(initialEnd) : initialEnd)
      : null;
    
    dbg('picker', '🔄 使用 initialStart/initialEnd 初始化 Picker (无TimeHub快照)', { 
      eventId, 
      initialStart, 
      initialEnd,
      解析后的start: start?.format('YYYY-MM-DD HH:mm'),
      解析后的end: end?.format('YYYY-MM-DD HH:mm'),
      是否有initialEnd: !!initialEnd
    });
    // 🔧 v2.9: 日期选择器需要 end 来高亮范围，如果没有 end 就用 start
    setSelectedDates({ start, end: end || start });
    const hasSpecificStart = start.hour() !== 0 || start.minute() !== 0;
    const hasSpecificEnd = end ? (end.hour() !== 0 || end.minute() !== 0) : false;
    setStartTime(hasSpecificStart ? { hour: start.hour(), minute: start.minute() } : null);
    setEndTime(end && hasSpecificEnd ? { hour: end.hour(), minute: end.minute() } : null);  // ✅ 如果没有 end，设置为 null
    // 重置滚动以对齐选中项
    setScrollTrigger((x) => x + 1);
  }, [eventId, initialStart, initialEnd]);

  // 监听点击编辑区域外退出编辑模式
  useEffect(() => {
    if (!isEditingMonth) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (editContainerRef.current && !editContainerRef.current.contains(target)) {
        setIsEditingMonth(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditingMonth]);

  // 全局点击监听器 - 用于诊断（可以在调试完成后移除）
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInside = containerRef.current?.contains(target);
      const className = typeof target.className === 'string' ? target.className : '';
    };

    document.addEventListener('click', handleGlobalClick, true);
    return () => document.removeEventListener('click', handleGlobalClick, true);
  }, []);

  // 生成日历网格
  const generateCalendar = () => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    
    // 🔧 修复：按周一作为一周开始（符合中国习惯和time.config.ts配置）
    // dayjs的day(): 0=周日, 1=周一, 2=周二, ..., 6=周六
    const startDay = startOfMonth.day(); // 当月1号是星期几
    const endDay = endOfMonth.day();     // 当月最后一天是星期几
    
    // 计算需要往前推几天到达本周一（或上周一）
    // 如果1号是周日(0)，往前推6天到上周一；如果是周一(1)，不推；如果是周二(2)，往前推1天
    const daysToStartMonday = startDay === 0 ? 6 : startDay - 1;
    const startOfWeek = startOfMonth.subtract(daysToStartMonday, 'day');
    
    // 计算需要往后推几天到达本周日（或下周日）
    // 如果最后一天是周日(0)，不推；如果是周一(1)，往后推6天；如果是周六(6)，往后推1天
    const daysToEndSunday = endDay === 0 ? 0 : 7 - endDay;
    const endOfWeek = endOfMonth.add(daysToEndSunday, 'day');

    const days = [];
    let current = startOfWeek;

    while (current.isBefore(endOfWeek) || current.isSame(endOfWeek, 'day')) {
      days.push(current);
      current = current.add(1, 'day');
    }

    return days;
  };

  const handleDateClick = (date: Dayjs) => {
    setSelectedQuickBtn(null); // 清除快捷按钮选中状态
    setDisplayHint(null); // 🆕 v1.1: 手动选择日期时清除 displayHint
    
    // 🔧 修复：确保 dayjs 对象使用本地时间，避免 UTC 转换
    // 通过重新创建 dayjs 对象（只保留日期部分），确保时区正确
    const localDate = dayjs(date.format('YYYY-MM-DD'));
    dbg('picker', '👆 用户点击日历日期', { 
      原始date: date.format('YYYY-MM-DD HH:mm:ss'),
      本地化date: localDate.format('YYYY-MM-DD HH:mm:ss'),
      是否相同: date.isSame(localDate, 'day')
    });
    
    if (!selectedDates.start || (selectedDates.start && selectedDates.end)) {
      // 开始新的选择
      dbg('picker', '👆 用户点击日历: 开始选择', { 选择日期: localDate.format('YYYY-MM-DD') });
      setSelectedDates({ start: localDate, end: null });
      setIsSelecting('end');
    } else if (selectedDates.start && !selectedDates.end) {
      // 选择结束日期
      if (localDate.isBefore(selectedDates.start)) {
        dbg('picker', '👆 用户点击日历: 完成选择（反向范围）', { 
          开始日期: localDate.format('YYYY-MM-DD'), 
          结束日期: selectedDates.start.format('YYYY-MM-DD') 
        });
        setSelectedDates({ start: localDate, end: selectedDates.start });
      } else {
        dbg('picker', '👆 用户点击日历: 完成选择', { 
          开始日期: selectedDates.start.format('YYYY-MM-DD'), 
          结束日期: localDate.format('YYYY-MM-DD') 
        });
        setSelectedDates({ start: selectedDates.start, end: localDate });
      }
      setIsSelecting(null);
      
      // 🆕 v1.2: 如果选择的是具体某一天且没有设置时间，自动勾选全天
      const isSingleDay = selectedDates.start.isSame(localDate, 'day');
      const hasNoTime = !startTime && !endTime;
      if (isSingleDay && hasNoTime) {
        dbg('picker', '✅ 自动勾选全天: 具体某一天 + 无时间');
        setAllDay(true);
      }
    }
  };

  const isInRange = (date: Dayjs) => {
    if (!selectedDates.start) return false;
    if (!selectedDates.end && !hoverDate) {
      const result = date.isSame(selectedDates.start, 'day');
      if (result) {
        dbg('picker', '📅 日历高亮选中日期', {
          date日期: date.format('YYYY-MM-DD'),
          date星期: ['日', '一', '二', '三', '四', '五', '六'][date.day()],
          selectedStart: selectedDates.start.format('YYYY-MM-DD'),
          selectedStart星期: ['日', '一', '二', '三', '四', '五', '六'][selectedDates.start.day()],
          是否相同: result
        });
      }
      return result;
    }
    
    const end = selectedDates.end || hoverDate;
    if (!end) return false;

    const rangeStart = selectedDates.start.isBefore(end) ? selectedDates.start : end;
    const rangeEnd = selectedDates.start.isBefore(end) ? end : selectedDates.start;

    return date.isSameOrAfter(rangeStart, 'day') && date.isSameOrBefore(rangeEnd, 'day');
  };

  const isRangeStart = (date: Dayjs) => {
    if (!selectedDates.start) return false;
    if (!selectedDates.end && !hoverDate) return date.isSame(selectedDates.start, 'day');
    
    const end = selectedDates.end || hoverDate;
    if (!end) return false;

    return date.isSame(selectedDates.start.isBefore(end) ? selectedDates.start : end, 'day');
  };

  const isRangeEnd = (date: Dayjs) => {
    if (!selectedDates.start) return false;
    if (!selectedDates.end && !hoverDate) return false;
    
    const end = selectedDates.end || hoverDate;
    if (!end) return false;

    return date.isSame(selectedDates.start.isBefore(end) ? end : selectedDates.start, 'day');
  };

  const handleQuickSelect = (days: number) => {
    const end = dayjs();
    const start = end.subtract(days, 'day');
    setSelectedDates({ start, end });
    setStartTime({ hour: 0, minute: 0 });
    setEndTime({ hour: 23, minute: 59 });
  };

  const handlePrevMonth = () => {
    setCurrentMonth(currentMonth.subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentMonth(currentMonth.add(1, 'month'));
  };

  const handleToday = () => {
    setCurrentMonth(dayjs());
  };

  const handleMonthClick = () => {
    setIsEditingMonth(true);
    setEditYear(currentMonth.year().toString());
    setEditMonth((currentMonth.month() + 1).toString());
  };

  const handleYearChange = (value: string) => {
    setEditYear(value);
    const year = parseInt(value);
    const month = parseInt(editMonth);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      setCurrentMonth(dayjs().year(year).month(month - 1));
    }
  };

  const handleMonthChange = (value: string) => {
    setEditMonth(value);
    const year = parseInt(editYear);
    const month = parseInt(value);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      setCurrentMonth(dayjs().year(year).month(month - 1));
    }
  };

  const handleApply = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    dbg('picker', '🚀 handleApply 被调用', { 
      useTimeHub, 
      eventId,
      条件判断: `useTimeHub=${useTimeHub} && eventId=${eventId} => ${useTimeHub && eventId}`
    });
    
    // 只在点击确定时才调用 onSelect
    if (selectedDates.start) {
      const startDateTime = startTime 
        ? selectedDates.start.hour(startTime.hour).minute(startTime.minute).second(0).millisecond(0)
        : selectedDates.start.startOf('day');
        
      // 🔧 修复：只有用户明确设置 endTime 时才计算 endDateTime
      // - 如果有 endTime：使用 selectedDates.end + endTime
      // - 如果没有 endTime：endDateTime = null（不是 startDateTime）
      // - 全天事件：endDateTime = startDateTime
      let endDateTime: Dayjs | null = null;
      
      if (endTime) {
        // 用户明确设置了结束时间
        endDateTime = (selectedDates.end || selectedDates.start)
          .hour(endTime.hour).minute(endTime.minute).second(0).millisecond(0);
      } else if (allDay) {
        // 全天事件，end = start
        endDateTime = startDateTime;
      } else if (selectedDates.end && !selectedDates.start.isSame(selectedDates.end, 'day')) {
        // 多日范围且无结束时间，使用 end 日期的开始
        endDateTime = selectedDates.end.startOf('day');
      }
      // 否则 endDateTime 保持 null（精确开始时间）
      
      dbg('picker', '🎯 UnifiedDateTimePicker 点击确定', {
        选择的日期: { 
          start: selectedDates.start?.format('YYYY-MM-DD'), 
          end: selectedDates.end?.format('YYYY-MM-DD') 
        },
        选择的时间: { startTime, endTime },
        快捷按钮: selectedQuickBtn,
        计算后的DateTime: {
          start: startDateTime.format('YYYY-MM-DD HH:mm:ss'),
          end: endDateTime ? endDateTime.format('YYYY-MM-DD HH:mm:ss') : 'null (精确开始时间)',
        },
        转换为Date对象: {
          start: startDateTime.toDate(),
          end: endDateTime ? endDateTime.toDate() : null,
        },
        Date对象的时间: {
          startHours: startDateTime.toDate().getHours(),
          startMinutes: startDateTime.toDate().getMinutes(),
          endHours: endDateTime ? endDateTime.toDate().getHours() : null,
          endMinutes: endDateTime ? endDateTime.toDate().getMinutes() : null,
        }
      });
      
      // 如果启用 TimeHub，则写入统一时间服务
      if (useTimeHub && eventId) {
        // 🔧 修复时区问题：直接使用 dayjs.format() 而不是 .toDate()
        // 原因：.toDate() 会触发 UTC 转换，导致日期错位（如"下周五"变成周四）
        const startIso = startDateTime.format('YYYY-MM-DD HH:mm:ss');
        // 🔥 修复：只有 endDateTime 存在时才设置 end，否则传 undefined
        const endIso = endDateTime ? endDateTime.format('YYYY-MM-DD HH:mm:ss') : undefined;
        // 🔧 使用组件的 allDay 状态，而不是自动推断
        const allDaySelected = allDay;
        // 🆕 v1.1: 如果有 displayHint 且用户勾选了全天，添加"全天"后缀
        const finalDisplayHint = displayHint && allDaySelected ? `${displayHint} 全天` : displayHint;
        
        // 🆕 v2.7.4: timeFieldState 存储实际的时间值 [startHour, startMinute, endHour, endMinute]
        // 🔧 修复：只有用户明确设置 endTime 时才保存，否则为 null
        const timeFieldState: [number | null, number | null, number | null, number | null] = [
          startTime?.hour ?? null,
          startTime?.minute ?? null,
          endTime?.hour ?? null,  // 只有用户设置了 endTime 才不为 null
          endTime?.minute ?? null
        ];
        
        const isFuzzyDate = !!displayHint;  // 🆕 v2.6: 有 displayHint 就是模糊日期
        const isFuzzyTime = !!fuzzyTimeName; // 🆕 v2.7: 有 fuzzyTimeName 就是模糊时间段
        
        dbg('picker', '📝 准备写入 TimeHub', { 
          eventId, 
          startIso, 
          endIso, 
          allDaySelected,
          timeFieldState,
          isFuzzyDate,
          isFuzzyTime,
          fuzzyTimeName
        });
        // 写入后触发 onApplied，供外层插入可视化及保存其它字段
        try {
          const { TimeHub } = await import('@backend/TimeHub');
          await TimeHub.setEventTime(eventId, {
            start: startIso,
            end: endIso,
            kind: startIso !== endIso ? 'range' : 'fixed',
            allDay: allDaySelected,
            source: 'picker',
            isFuzzyDate,         // 🆕 v2.6
            timeFieldState,      // 🆕 v2.6
            isFuzzyTime,         // 🆕 v2.7
            fuzzyTimeName: fuzzyTimeName || undefined,  // 🆕 v2.7
            // displayHint 已移除，使用动态计算
          });
          dbg('picker', '✅ TimeHub 写入成功，准备调用 onApplied', { eventId });
          onApplied?.(startIso, endIso, allDaySelected, searchInput); // 🔧 传递完整的用户输入文本
        } catch (err) {
          error('picker', '❌ TimeHub 写入失败', { eventId, error: err });
        }
      } else if (useTimeHub && !eventId) {
        // TimeHub 模式但没有 eventId：先回调 onApplied，让外层创建 Event 并写入 TimeHub
        // 🔧 修复时区问题：直接使用 dayjs.format()
        const startIso = startDateTime.format('YYYY-MM-DD HH:mm:ss');
        const endIso = endDateTime ? endDateTime.format('YYYY-MM-DD HH:mm:ss') : undefined;
        // 🔧 使用组件的 allDay 状态
        const allDaySelected = allDay;
        dbg('picker', '🆕 TimeHub 模式但没有 eventId，先调用 onApplied', { startIso, endIso, allDaySelected });
        onApplied?.(startIso, endIso, allDaySelected, searchInput); // 🔧 传递完整的用户输入文本
      } else {
        // 保持向后兼容的回调
        const startStr = startDateTime.format('YYYY-MM-DD HH:mm');
        const endStr = endDateTime ? endDateTime.format('YYYY-MM-DD HH:mm') : startStr;
        dbg('picker', '📝 使用旧回调 onSelect (非TimeHub模式)', { startStr, endStr, useTimeHub, eventId });
        onSelect?.(startStr, endStr);
      }
    }
    
    onClose?.();
  };

  const handleCancel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedDates({ start: dayjs(), end: dayjs() });
    setStartTime(null);
    setEndTime(null);
    dbg('picker', 'Cancel picker');
    onSelect?.(null, null);
    onClose?.();
  };

  // 🆕 document 级别的键盘事件监听（仅当 Picker 内部有焦点时）
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 检查 Picker 是否可见
      if (!containerRef.current) return;
      
      // 🔧 如果事件来自 input/textarea，不拦截（让输入框自己处理）
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      // 🔧 v2.9: 改进焦点检测逻辑
      // 1. 如果焦点在 Picker 内部元素 → 处理
      // 2. 如果焦点在 body，但最近一次点击/blur 在 Picker 内部 → 也处理
      const activeElement = document.activeElement;
      const isInPicker = activeElement && containerRef.current.contains(activeElement);
      const isFocusOnBody = !activeElement || activeElement.tagName === 'BODY';
      
      // 如果焦点在 Picker 外部（且不是 body），不处理
      if (!isInPicker && !isFocusOnBody) {
        return;
      }
      
      // 🔧 如果焦点在 body，检查是否最近有交互在 Picker 内
      if (isFocusOnBody) {
        // 检查最近一次点击是否在 Picker 内
        const lastClickedElement = e.target as HTMLElement;
        const wasClickInPicker = lastClickedElement && containerRef.current.contains(lastClickedElement);
        
        // 检查 searchInput 是否有内容（说明用户在使用）
        const hasSearchInput = searchInput.trim().length > 0;
        
        // 只有在用户明确与 Picker 交互时才处理
        if (!wasClickInPicker && !hasSearchInput) {
          return;
        }
      }
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        dbg('picker', '⌨️ Picker 内 Enter 键触发 handleApply');
        handleApply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dbg('picker', '⌨️ Picker 内 Escape 键触发 handleCancel');
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [handleApply, handleCancel, searchInput]); // 🔧 v2.9: 添加 searchInput 依赖

  // 生成预览内容
  const renderPreviewContent = () => {
    const hasStartDate = selectedDates.start;
    
    if (!hasStartDate) {
      return {
        startDateTime: '未选择',
        endDateTime: '时间',
        duration: null,
        dayDiff: 0,
        isCrossDay: false
      };
    }
    
    const startDate = selectedDates.start!;
    const endDate = selectedDates.end || startDate;
    
    // 检查是否通过快捷按钮选择且未手动调整
    const isQuickBtnSelection = selectedQuickBtn !== null;
    
    // 格式化基础日期（周几）
    const dateStr = startDate.format('YYYY-MM-DD（ddd）');
    
    // 情况0: 开始和结束时间都为 null
    if (!startTime && !endTime) {
      // 如果选择了多天（跨日期）
      if (!startDate.isSame(endDate, 'day')) {
        const dayDiff = endDate.diff(startDate, 'day') + 1; // +1 因为包含首尾两天
        const endDateStr = endDate.format('YYYY-MM-DD（ddd）');
        return {
          startDateTime: dateStr,
          endDateTime: endDateStr,
          duration: `${dayDiff}d`, // 显示实际天数（包含首尾）
          dayDiff,
          isCrossDay: false // 不显示角标，因为已经显示了完整的结束日期
        };
      }
      // 单天，没有选择时间 = 全天
      return {
        startDateTime: dateStr,
        endDateTime: '全天',
        duration: null,
        dayDiff: 0,
        isCrossDay: false
      };
    }
    
    // 情况1: 通过快捷按钮选择（上午/下午/晚上）且未手动调整
    // 🆕 v2.8.3: 也支持通过自然语言输入模糊时间段（fuzzyTimeName）
    const isFuzzyTimeSelection = isQuickBtnSelection && (selectedQuickBtn === 'morning' || selectedQuickBtn === 'afternoon' || selectedQuickBtn === 'evening');
    const hasFuzzyTimeName = fuzzyTimeName && (fuzzyTimeName === '上午' || fuzzyTimeName === '下午' || fuzzyTimeName === '晚上' || fuzzyTimeName === 'morning' || fuzzyTimeName === 'afternoon' || fuzzyTimeName === 'evening');
    
    if (isFuzzyTimeSelection || hasFuzzyTimeName) {
      // 优先使用 fuzzyTimeName，其次使用 selectedQuickBtn
      const timeLabel = fuzzyTimeName || 
        (selectedQuickBtn === 'morning' ? '上午' : selectedQuickBtn === 'afternoon' ? '下午' : '晚上');
      return {
        startDateTime: dateStr,
        endDateTime: timeLabel,
        duration: null,
        dayDiff: 0,
        isCrossDay: false
      };
    }
    
    // 情况2: 开始时间为 null（只选择了结束时间）
    if (!startTime && endTime) {
      const endStr = endDate.hour(endTime.hour).minute(endTime.minute).format('HH:mm');
      return {
        startDateTime: dateStr,
        endDateTime: `${endStr}前`,
        duration: null,
        dayDiff: 0,
        isCrossDay: false
      };
    }
    
    // 情况3: 结束时间为 null（只选择了开始时间）
    if (startTime && !endTime) {
      const startStr = startDate.hour(startTime.hour).minute(startTime.minute).format('HH:mm');
      return {
        startDateTime: dateStr,
        endDateTime: `${startStr}后`,
        duration: null,
        dayDiff: 0,
        isCrossDay: false
      };
    }
    
    // 情况4: 用户自主选择了开始+结束时间（默认行为）
    const start = startTime ? startDate.hour(startTime.hour).minute(startTime.minute) : startDate.hour(0).minute(0);
    const end = endTime ? endDate.hour(endTime.hour).minute(endTime.minute) : endDate.hour(23).minute(59);
    
    // 计算时长
    const diffMinutes = end.diff(start, 'minute');
    const days = Math.floor(diffMinutes / (24 * 60));
    const hours = Math.floor((diffMinutes % (24 * 60)) / 60);
    const minutes = diffMinutes % 60;
    
    let durationText = '';
    if (days > 0) {
      // 超过24小时，显示天数
      if (hours > 0 && minutes > 0) {
        durationText = `${days}d${hours}h${minutes}m`;
      } else if (hours > 0) {
        durationText = `${days}d${hours}h`;
      } else if (minutes > 0) {
        durationText = `${days}d${minutes}m`;
      } else {
        durationText = `${days}d`;
      }
    } else if (hours > 0) {
      // 小于24小时
      if (minutes > 0) {
        durationText = `${hours}h${minutes}m`;
      } else {
        durationText = `${hours}h`;
      }
    } else {
      // 只有分钟
      durationText = `${minutes}m`;
    }
    
    // 检查是否跨天
    const dayDiff = end.diff(start, 'day');
    const isCrossDay = dayDiff > 0;
    
    // 格式化显示文本
    const startStr = start.format('YYYY-MM-DD（ddd）HH:mm');
    const endStr = end.format('HH:mm');
    
    return {
      startDateTime: startStr,
      endDateTime: endStr,
      duration: durationText,
      dayDiff,
      isCrossDay
    };
  };

  // 快捷选择：明天
  // 快捷选择：明天
  const handleSelectTomorrow = () => {
    const tomorrow = dayjs().add(1, 'day');
    dbg('picker', '👆 用户点击快捷按钮: 明天', { 选择的日期: tomorrow.format('YYYY-MM-DD') });
    setSelectedDates({ start: tomorrow, end: tomorrow });
    setStartTime(null);
    setEndTime(null);
    setSelectedQuickBtn('tomorrow');
    setCurrentMonth(tomorrow); // 切换到明天所在的月份
    setAllDay(false); // 🆕 v1.2: 快捷按钮不自动勾选全天（模糊日期）
    setDisplayHint('明天'); // 🆕 v1.1: 保存 displayHint
  };

  // 快捷选择：本周
  const handleSelectThisWeek = () => {
    const start = dayjs().startOf('week');
    const end = dayjs().endOf('week');
    dbg('picker', '👆 用户点击快捷按钮: 本周', { 
      开始日期: start.format('YYYY-MM-DD'), 
      结束日期: end.format('YYYY-MM-DD') 
    });
    setSelectedDates({ start, end });
    setStartTime(null);
    setEndTime(null);
    setSelectedQuickBtn('thisWeek');
    setCurrentMonth(start); // 切换到本周开始的月份
    setAllDay(false); // 🆕 v1.2: 快捷按钮不自动勾选全天（模糊日期）
    setDisplayHint('本周'); // 🆕 v1.1: 保存 displayHint
  };

  // 快捷选择：下周
  const handleSelectNextWeek = () => {
    const start = dayjs().add(1, 'week').startOf('week');
    const end = dayjs().add(1, 'week').endOf('week');
    dbg('picker', '👆 用户点击快捷按钮: 下周', { 
      开始日期: start.format('YYYY-MM-DD'), 
      结束日期: end.format('YYYY-MM-DD') 
    });
    setSelectedDates({ start, end });
    setStartTime(null);
    setEndTime(null);
    setSelectedQuickBtn('nextWeek');
    setCurrentMonth(start); // 切换到下周开始的月份
    setAllDay(false); // 🆕 v1.2: 快捷按钮不自动勾选全天（模糊日期）
    setDisplayHint('下周'); // 🆕 v1.1: 保存 displayHint
  };

  // 快捷选择：上午（保留已选日期，设置 06:00 - 12:00）
  const handleSelectMorning = () => {
    const targetDate = selectedDates.start || dayjs();
    dbg('picker', '👆 用户点击快捷按钮: 上午', { 
      目标日期: targetDate.format('YYYY-MM-DD'),
      时间范围: '06:00 - 12:00'
    });
    setSelectedDates({ start: targetDate, end: targetDate });
    setStartTime({ hour: 6, minute: 0 });
    setEndTime({ hour: 12, minute: 0 });
    setSelectedQuickBtn('morning');
    setFuzzyTimeName('上午'); // 🆕 v2.7.2: 设置模糊时间名称，用于 isFuzzyTime 判断
    setCurrentMonth(targetDate); // 确保当前月份可见
    setScrollTrigger(prev => prev + 1); // 触发强制滚动
  };

  // 快捷选择：下午（保留已选日期，设置 12:00 - 18:00）
  const handleSelectAfternoon = () => {
    const targetDate = selectedDates.start || dayjs();
    dbg('picker', '👆 用户点击快捷按钮: 下午', { 
      目标日期: targetDate.format('YYYY-MM-DD'),
      时间范围: '12:00 - 18:00'
    });
    setSelectedDates({ start: targetDate, end: targetDate });
    setStartTime({ hour: 12, minute: 0 });
    setEndTime({ hour: 18, minute: 0 });
    setSelectedQuickBtn('afternoon');
    setFuzzyTimeName('下午'); // 🆕 v2.7.2: 设置模糊时间名称，用于 isFuzzyTime 判断
    setCurrentMonth(targetDate); // 确保当前月份可见
    setScrollTrigger(prev => prev + 1); // 触发强制滚动
  };

  // 快捷选择：晚上（保留已选日期，设置 18:00 - 22:00）
  const handleSelectEvening = () => {
    const targetDate = selectedDates.start || dayjs();
    dbg('picker', '👆 用户点击快捷按钮: 晚上', { 
      目标日期: targetDate.format('YYYY-MM-DD'),
      时间范围: '18:00 - 22:00'
    });
    setSelectedDates({ start: targetDate, end: targetDate });
    setStartTime({ hour: 18, minute: 0 });
    setEndTime({ hour: 22, minute: 0 });
    setSelectedQuickBtn('evening');
    setFuzzyTimeName('晚上'); // 🆕 v2.7.2: 设置模糊时间名称，用于 isFuzzyTime 判断
    setCurrentMonth(targetDate); // 确保当前月份可见
    setScrollTrigger(prev => prev + 1); // 触发强制滚动
  };

  // 新增: chrono 自然语言解析 + 自定义词典
  const handleSearchBlur = () => {
    if (!searchInput.trim()) {
      dbg('picker', '🔍 搜索输入为空，跳过解析');
      return;
    }
    
    dbg('picker', '🔍 开始解析自然语言', { input: searchInput });
    
    try {
      // 🆕 v2.7.1: 优先使用自定义词典（处理"中午12点"等组合）
      const customParsed = parseNaturalLanguage(searchInput);
      
      if (customParsed.matched) {
        dbg('picker', '🎯 自定义词典匹配成功', customParsed);
        
        // 情况1: 精确时间点（如"大后天"、"月底"、"eom"）
        if (customParsed.pointInTime) {
          const point = customParsed.pointInTime;
          
          dbg('picker', '🎯 设置精确时间点到 selectedDates', {
            原始date对象: point.date,
            format结果: point.date.format('YYYY-MM-DD HH:mm:ss'),
            valueOf: point.date.valueOf(),
            星期几: point.date.day(),
            星期名: ['日', '一', '二', '三', '四', '五', '六'][point.date.day()]
          });
          
          setSelectedDates({
            start: point.date,
            end: point.date
          });
          
          // displayHint 已移除，使用动态计算
          
          setFuzzyTimeName(null);
          
          dbg('picker', '✅ 精确时间点解析完成', {
            date: point.date.format('YYYY-MM-DD')
          });
          
          setScrollTrigger(prev => prev + 1);
          setSelectedQuickBtn(null);
          setCurrentMonth(point.date);
          
          // 🔧 修复：如果同时有 timePeriod（如"下周三9点"），继续处理时间部分
          if (customParsed.timePeriod) {
            // 直接跳到时间段处理逻辑，不要 return
          } else {
            return;
          }
        }
        
        // 情况2: 日期范围 ± 时间段（如"周末"、"周末上午"、"下周二中午12点"）
        if (customParsed.dateRange) {
          setSelectedDates({
            start: customParsed.dateRange.start,
            end: customParsed.dateRange.end
          });
          
          // displayHint 已移除，使用动态计算
          
          setCurrentMonth(customParsed.dateRange.start);
        }
        
        // 设置时间段
        if (customParsed.timePeriod) {
          // 🆕 v2.7.4: 根据 timeType 决定设置哪个时间字段
          const timeType = customParsed.timePeriod.timeType || customParsed.timeType || 'start';
          
          dbg('picker', '🔧 准备设置时间段', {
            timePeriod: customParsed.timePeriod,
            timeType: timeType,
            isFuzzyTime: customParsed.timePeriod.isFuzzyTime
          });
          
          if (timeType === 'due') {
            // 截止时间：只设置结束时间
            setStartTime(null);
            setEndTime({
              hour: customParsed.timePeriod.endHour,  // 🔧 修复：使用 endHour 而非 startHour
              minute: customParsed.timePeriod.endMinute
            });
            setFuzzyTimeName(null);
            dbg('picker', '⏰ 识别为截止时间（只设置结束时间）', { 
              timePeriod: customParsed.timePeriod.name,
              endTime: `${customParsed.timePeriod.endHour}:${customParsed.timePeriod.endMinute}`,
              keywords: '截止/ddl/deadline/due/最晚/不晚于'
            });
          } else if (customParsed.timePeriod.isFuzzyTime) {
            // 模糊时间段：设置开始和结束时间
            setStartTime({
              hour: customParsed.timePeriod.startHour,
              minute: customParsed.timePeriod.startMinute
            });
            setEndTime({
              hour: customParsed.timePeriod.endHour,
              minute: customParsed.timePeriod.endMinute
            });
            setFuzzyTimeName(customParsed.timePeriod.name);
            dbg('picker', '⏰ 识别为模糊时间段（设置开始和结束时间）', { 
              timePeriod: customParsed.timePeriod.name,
              startTime: `${customParsed.timePeriod.startHour}:${customParsed.timePeriod.startMinute}`,
              endTime: `${customParsed.timePeriod.endHour}:${customParsed.timePeriod.endMinute}`
            });
          } else {
            // 精确开始时间：只设置开始时间
            setStartTime({
              hour: customParsed.timePeriod.startHour,
              minute: customParsed.timePeriod.startMinute
            });
            setEndTime(null);
            setFuzzyTimeName(null);
            dbg('picker', '⏰ 识别为精确开始时间（只设置开始时间）', { 
              timePeriod: customParsed.timePeriod.name,
              startTime: `${customParsed.timePeriod.startHour}:${customParsed.timePeriod.startMinute}`
            });
          }
          
          setAllDay(false);
        } else {
          // 没有时间段，清除时间
          setStartTime(null);
          setEndTime(null);
          setFuzzyTimeName(null);
        }
        
        setScrollTrigger(prev => prev + 1);
        setSelectedQuickBtn(null);
        return;
      }
      
      // 无法识别的输入
      warn('picker', '⚠️ 无法解析该输入', { input: searchInput });
    } catch (err) {
      error('picker', '❌ 解析异常', { input: searchInput, error: err });
    }
  };

  // 新增: 全天按钮切换
  const toggleAllDay = () => {
    const newAllDay = !allDay;
    setAllDay(newAllDay);
    
    if (newAllDay) {
      // 切换到全天：清除时间（isAllDay 字段会记录全天状态）
      setStartTime(null);
      setEndTime(null);
      dbg('picker', '🌅 切换到全天模式（时间设置为 null）');
    } else {
      // 🆕 v2.8.3: 取消全天：不自动设置任何时间，保持 null
      // 理由：是否勾选全天和时间无关，只要没有输入时间，都按 null 处理
      // 用户可以自己决定是否需要设置时间
      dbg('picker', '⏰ 取消全天模式（时间保持 null，等待用户输入）');
      // 不修改 startTime 和 endTime，保持当前状态
    }
    setSelectedQuickBtn(null);
  };

  return (
    <div 
      ref={containerRef} 
      className="unified-datetime-picker"
    >
      {/* 顶部预览区域 */}
      <div className="picker-preview-header">
        <div className="preview-time-display">
          <span className="preview-start-time">{renderPreviewContent().startDateTime}</span>
          <div className="preview-arrow-section">
            {renderPreviewContent().duration && (
              <>
                <span className="duration-text">{renderPreviewContent().duration}</span>
                <svg className="arrow-icon" width="52" height="9" viewBox="0 0 52 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M51.3889 4.43908C51.6037 4.2243 51.6037 3.87606 51.3889 3.66127L47.8887 0.161088C47.6739 -0.0537006 47.3257 -0.0537006 47.1109 0.161088C46.8961 0.375876 46.8961 0.724117 47.1109 0.938905L50.2222 4.05018L47.1109 7.16144C46.8961 7.37623 46.8961 7.72447 47.1109 7.93926C47.3257 8.15405 47.6739 8.15405 47.8887 7.93926L51.3889 4.43908ZM0 4.05017L-4.80825e-08 4.60017L51 4.60018L51 4.05018L51 3.50018L4.80825e-08 3.50017L0 4.05017Z" fill="url(#paint0_linear_262_790)"/>
                  <defs>
                    <linearGradient id="paint0_linear_262_790" x1="-4.37114e-08" y1="4.55017" x2="51" y2="4.55018" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#22D3EE"/>
                      <stop offset="1" stopColor="#3B82F6"/>
                    </linearGradient>
                  </defs>
                </svg>
              </>
            )}
          </div>
          <span className="preview-end-time">
            {renderPreviewContent().endDateTime}
            {renderPreviewContent().isCrossDay && (
              <span className="cross-day-badge">+{renderPreviewContent().dayDiff}</span>
            )}
          </span>
        </div>
      </div>

      {/* 新增: chrono 搜索框和全天按钮 */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <SearchIcon />
          <input
            ref={searchInputRef}
            className="search-input"
            type="text"
            placeholder="输入'明天下午3点'试试"
            value={searchInput}
            onChange={(e) => {
              const newText = e.target.value;
              setSearchInput(newText);
              
              // 🆕 实时解析并通知父组件
              if (onSearchChange && newText.trim().length > 0) {
                const parsed = parseNaturalLanguage(newText);
                if (parsed && parsed.matched) {
                  // 提取开始和结束时间
                  let start: Date | undefined;
                  let end: Date | undefined;
                  
                  if (parsed.dateRange && parsed.timePeriod) {
                    const baseDate = parsed.dateRange.start.toDate();
                    start = new Date(baseDate);
                    start.setHours(parsed.timePeriod.startHour, parsed.timePeriod.startMinute, 0, 0);
                    
                    if (parsed.timePeriod.endHour > 0 || parsed.timePeriod.endMinute > 0) {
                      end = new Date(baseDate);
                      end.setHours(parsed.timePeriod.endHour, parsed.timePeriod.endMinute, 0, 0);
                    }
                  } else if (parsed.dateRange) {
                    start = parsed.dateRange.start.toDate();
                    end = parsed.dateRange.end?.toDate();
                  } else if (parsed.pointInTime) {
                    start = parsed.pointInTime.date.toDate();
                  } else if (parsed.timePeriod) {
                    const baseDate = new Date();
                    baseDate.setHours(parsed.timePeriod.startHour, parsed.timePeriod.startMinute, 0, 0);
                    start = baseDate;
                    
                    if (parsed.timePeriod.endHour > 0 || parsed.timePeriod.endMinute > 0) {
                      const endDate = new Date();
                      endDate.setHours(parsed.timePeriod.endHour, parsed.timePeriod.endMinute, 0, 0);
                      end = endDate;
                    }
                  }
                  
                  onSearchChange(newText, { start, end });
                } else {
                  onSearchChange(newText, null);
                }
              } else if (onSearchChange) {
                onSearchChange(newText, null);
              }
            }}
            onBlur={handleSearchBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // 🔧 v2.9: 第一次 Enter 解析并显示预览，失焦后允许再次 Enter 确认
                handleSearchBlur();
                e.currentTarget.blur(); // 失焦以便下次 Enter 触发全局确认
                e.preventDefault(); // 防止表单提交
              }
            }}
          />
        </div>
        <button 
          className={`all-day-button ${allDay ? 'active' : ''}`}
          onClick={toggleAllDay}
        >
          {allDay ? (
            <TaskColorIcon className="all-day-icon" />
          ) : (
            <div className="all-day-checkbox"></div>
          )}
          <span>全天</span>
        </button>
      </div>

      <div className="main-content">
        {/* 左侧日历 */}
        <div className="calendar-section">
          {/* 日历上方的快捷按钮 */}
          <div className="quick-buttons-container calendar-quick-buttons">
            <button 
              className={`quick-btn ${selectedQuickBtn === 'tomorrow' ? 'selected' : ''}`} 
              onClick={handleSelectTomorrow}
            >
              明天
            </button>
            <button 
              className={`quick-btn ${selectedQuickBtn === 'thisWeek' ? 'selected' : ''}`} 
              onClick={handleSelectThisWeek}
            >
              本周
            </button>
            <button 
              className={`quick-btn ${selectedQuickBtn === 'nextWeek' ? 'selected' : ''}`} 
              onClick={handleSelectNextWeek}
            >
              下周
            </button>
          </div>
          
          <div className="calendar-header">
            <button className="month-nav-btn" onClick={handlePrevMonth}>‹</button>
            <div className="month-year-container" ref={editContainerRef}>
              {isEditingMonth ? (
                <>
                  <input
                    type="number"
                    className="month-edit-input year-input"
                    value={editYear}
                    onChange={(e) => handleYearChange(e.target.value)}
                    autoFocus
                    min="1900"
                    max="2100"
                  />
                  <span className="month-edit-separator">年</span>
                  <input
                    type="number"
                    className="month-edit-input month-input"
                    value={editMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    min="1"
                    max="12"
                  />
                  <span className="month-edit-separator">月</span>
                </>
              ) : (
                <span className="month-year" onClick={handleMonthClick}>
                  {currentMonth.format('YYYY年 MM月')}
                </span>
              )}
            </div>
            <button className="month-nav-btn" onClick={handleNextMonth}>›</button>
          </div>
          
          <div className="calendar-grid">
            <div className="weekdays">
              {['一', '二', '三', '四', '五', '六', '日'].map(day => (
                <div key={day} className="weekday">{day}</div>
              ))}
            </div>
            
            <div className="dates">
              {generateCalendar().map(date => (
                <div
                  key={date.format('YYYY-MM-DD')}
                  className={`
                    date-cell 
                    ${date.month() !== currentMonth.month() ? 'other-month' : ''}
                    ${date.isSame(dayjs(), 'day') ? 'today' : ''}
                    ${isInRange(date) ? 'in-range' : ''}
                    ${isRangeStart(date) ? 'range-start' : ''}
                    ${isRangeEnd(date) ? 'range-end' : ''}
                  `}
                  onClick={() => handleDateClick(date)}
                  onMouseEnter={() => setHoverDate(date)}
                  onMouseLeave={() => setHoverDate(null)}
                >
                  {date.date()}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧时间选择 */}
        <div className="time-section">
          {/* 时间选择器上方的快捷按钮 */}
          <div className="quick-buttons-container time-quick-buttons">
            <button 
              className={`quick-btn ${selectedQuickBtn === 'morning' ? 'selected' : ''}`} 
              onClick={handleSelectMorning}
            >
              上午
            </button>
            <button 
              className={`quick-btn ${selectedQuickBtn === 'afternoon' ? 'selected' : ''}`} 
              onClick={handleSelectAfternoon}
            >
              下午
            </button>
            <button 
              className={`quick-btn ${selectedQuickBtn === 'evening' ? 'selected' : ''}`} 
              onClick={handleSelectEvening}
            >
              晚上
            </button>
          </div>
          
          {/* 大标题：开始时间 | 结束时间 */}
          <div className="time-main-titles">
            <div className="time-main-title">开始时间</div>
            <div className="time-main-title">结束时间</div>
          </div>

          {/* 4列时间选择器 */}
          <div className="time-columns-container">
            <TimeColumn
              type="hour"
              value={startTime?.hour ?? null}
              onChange={(hour) => {
                setSelectedQuickBtn(null); // 手动调整时清除快捷按钮状态
                setFuzzyTimeName(null); // 🆕 v2.7.2: 手动调整时清除模糊时间名称
                if (hour === null) {
                  setStartTime(null);
                } else {
                  setStartTime({ hour, minute: startTime?.minute ?? 0 });
                  setAllDay(false); // 🆕 v1.2: 设置具体时间时自动取消全天
                }
              }}
              disabled={false}
              scrollTrigger={scrollTrigger}
            />
            <TimeColumn
              type="minute"
              value={startTime?.minute ?? null}
              onChange={(minute) => {
                setSelectedQuickBtn(null); // 手动调整时清除快捷按钮状态
                setFuzzyTimeName(null); // 🆕 v2.7.2: 手动调整时清除模糊时间名称
                if (minute === null) {
                  setStartTime(null);
                } else {
                  setStartTime({ hour: startTime?.hour ?? 0, minute });
                  setAllDay(false); // 🆕 v1.2: 设置具体时间时自动取消全天
                }
              }}
              disabled={false}
              scrollTrigger={scrollTrigger}
            />
            <TimeColumn
              type="hour"
              value={endTime?.hour ?? null}
              onChange={(hour) => {
                setSelectedQuickBtn(null); // 手动调整时清除快捷按钮状态
                setFuzzyTimeName(null); // 🆕 v2.7.2: 手动调整时清除模糊时间名称
                if (hour === null) {
                  setEndTime(null);
                } else {
                  setEndTime({ hour, minute: endTime?.minute ?? 0 });
                  setAllDay(false); // 🆕 v1.2: 设置具体时间时自动取消全天
                }
              }}
              disabled={false}
              scrollTrigger={scrollTrigger}
            />
            <TimeColumn
              type="minute"
              value={endTime?.minute ?? null}
              onChange={(minute) => {
                setSelectedQuickBtn(null); // 手动调整时清除快捷按钮状态
                setFuzzyTimeName(null); // 🆕 v2.7.2: 手动调整时清除模糊时间名称
                if (minute === null) {
                  setEndTime(null);
                } else {
                  setEndTime({ hour: endTime?.hour ?? 0, minute });
                  setAllDay(false); // 🆕 v1.2: 设置具体时间时自动取消全天
                }
              }}
              disabled={false}
              scrollTrigger={scrollTrigger}
            />
          </div>
        </div>
      </div>

      <div className="action-buttons">
        <Space>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" onClick={handleApply}>确定</Button>
        </Space>
      </div>
    </div>
  );
};

export default UnifiedDateTimePicker;