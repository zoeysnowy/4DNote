import React, { useState, useMemo } from 'react';
import './ContentSelectionPanel.css';

// 导入本地 SVG 图标
import SearchIconSvg from '../assets/icons/Search.svg';
import HideIconSvg from '../assets/icons/hide.svg';
import UnhideIconSvg from '../assets/icons/unhide.svg';
import DownIconSvg from '../assets/icons/down.svg';
import RightIconSvg from '../assets/icons/right.svg';
import PiechartIconSvg from '../assets/icons/piechart.svg';
import NoticeIconSvg from '../assets/icons/Notice.svg';
import PinIconSvg from '../assets/icons/Pin.svg';
import NotetreeIconSvg from '../assets/icons/Notetree.svg';

// 图标组件
const SearchIcon = ({ className }: { className?: string }) => <img src={SearchIconSvg} alt="" className={className} style={{ width: '23px', height: '23px', opacity: 0.6 }} />;
const HideIcon = ({ className }: { className?: string }) => <img src={HideIconSvg} alt="" className={className} style={{ width: '20px', height: '20px', opacity: 0.6 }} />;
const UnhideIcon = ({ className }: { className?: string }) => <img src={UnhideIconSvg} alt="" className={className} style={{ width: '20px', height: '20px', opacity: 0.6 }} />;
const DownIcon = ({ isExpanded }: { isExpanded?: boolean }) => (
  <img 
    src={DownIconSvg} 
    alt="" 
    style={{ 
      width: '20px', 
      height: '20px',
      transition: 'transform 0.2s',
      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
    }} 
  />
);
const RightIcon = ({ className }: { className?: string }) => <img src={RightIconSvg} alt="" className={className} style={{ width: '20px', height: '20px' }} />;
const UnhideSmallIcon = ({ className }: { className?: string }) => <img src={UnhideIconSvg} alt="" className={className} style={{ width: '16px', height: '16px' }} />;
const HideSmallIcon = ({ className }: { className?: string }) => <img src={HideIconSvg} alt="" className={className} style={{ width: '16px', height: '16px' }} />;
const PiechartIcon = ({ color, className }: { color?: string; className?: string }) => (
  <img src={PiechartIconSvg} alt="" className={className} style={{ width: '14px', height: '14px' }} />
);
const NoticeIcon = ({ className }: { className?: string }) => <img src={NoticeIconSvg} alt="" className={className} style={{ width: '20px', height: '20px' }} />;
const PinIcon = ({ className }: { className?: string }) => <img src={PinIconSvg} alt="" className={className} style={{ width: '16px', height: '16px' }} />;
const NotetreeIcon = ({ className }: { className?: string }) => <img src={NotetreeIconSvg} alt="" className={className} style={{ width: '16px', height: '16px' }} />;

interface TaskNode {
  id: string;
  title: string;
  tag: string;
  color: string;
  level?: number; // ✅ 标签层级，用于缩进显示
  children?: TaskNode[];
  stats?: {
    completed: number;
    total: number;
    hours: number;
  };
  isExpanded?: boolean;
  isHidden?: boolean;
  isFavorite?: boolean;
}

interface EventSnapshot {
  created: number;
  updated: number;
  completed: number;
  deleted: number;
  details: any[];
}

interface Tag {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  parentId?: string;
  level?: number;
  children?: Tag[];
}

interface ContentSelectionPanelProps {
  dateRange?: { start: Date; end: Date } | null;
  snapshot?: EventSnapshot;
  tags?: Tag[];
  hiddenTags?: Set<string>;
  onFilterChange?: (filter: 'tags' | 'tasks' | 'favorites' | 'new') => void;
  onSearchChange?: (query: string) => void;
  onDateSelect?: (date: Date) => void;
  onDateRangeChange?: (start: Date | null, end: Date | null) => void;
  onTagVisibilityChange?: (tagId: string, visible: boolean) => void;
  isPanelVisible?: boolean;
  onPanelVisibilityChange?: (visible: boolean) => void;
  pageType?: 'plan' | 'timelog'; // plan页面支持snapshot模式，timelog页面仅作为导航
}

const ContentSelectionPanel: React.FC<ContentSelectionPanelProps> = ({
  dateRange,
  snapshot,
  tags = [],
  hiddenTags = new Set(),
  onFilterChange,
  onSearchChange,
  onDateSelect,
  onDateRangeChange,
  onTagVisibilityChange,
  isPanelVisible = true,
  onPanelVisibilityChange,
  pageType = 'plan', // 默认为plan页面
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'tags' | 'tasks' | 'favorites' | 'new'>('tags');
  const [selectedDate, setSelectedDate] = useState(dateRange?.start || new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date(2025, 10, 1)); // November 2025
  
  // Section 折叠状态 - 匹配Figma设计稿状态
  const [isDateSectionExpanded, setIsDateSectionExpanded] = useState(true);
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
  const [isTagSectionExpanded, setIsTagSectionExpanded] = useState(true);
  const [isEventSectionExpanded, setIsEventSectionExpanded] = useState(false);
  
  // 日期范围选择状态
  const [rangeStart, setRangeStart] = useState<Date | null>(dateRange?.start || null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(dateRange?.end || null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  
  // 标签节点展开/收起状态
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  // 🆕 v2.19: 重要笔记状态
  const [noteEvents, setNoteEvents] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // 🆕 v2.19: 加载重要笔记
  React.useEffect(() => {
    const loadNoteEvents = async () => {
      if (!isEventSectionExpanded) return;
      
      setLoadingNotes(true);
      try {
        const { EventService } = await import('../services/EventService');
        const allEvents = await EventService.getAllEvents();
        const notes = allEvents.filter(e => e.isNote === true);
        setNoteEvents(notes);
      } catch (error) {
        console.error('❌ [ContentPanel] 加载重要笔记失败:', error);
      } finally {
        setLoadingNotes(false);
      }
    };

    loadNoteEvents();
  }, [isEventSectionExpanded]);

  // 🆕 v2.19: 处理点击笔记
  const handleNoteClick = (eventId: string) => {
    sessionStorage.setItem('4dnote-navigate-to-event', eventId);
    window.location.hash = '#/timelog';
  };

  // 🆕 v2.19: 获取事件标题
  const getEventTitle = (event: any): string => {
    if (typeof event.title === 'object' && event.title !== null) {
      return event.title.simpleTitle || event.title.fullTitle || '未命名笔记';
    }
    return event.title || '未命名笔记';
  };

  // 基于真实标签数据构建任务树
  const taskTree = useMemo(() => {
    // 首先创建所有节点的映射
    const nodeMap = new Map<string, TaskNode>();
    
    tags.forEach(tag => {
      const isHidden = hiddenTags.has(tag.id);
      // 默认展开所有父标签，除非在expandedNodes中明确标记为收起
      const hasChildren = tags.some(t => t.parentId === tag.id);
      const isExpanded = hasChildren ? !expandedNodes.has(tag.id) : true;
      
      nodeMap.set(tag.id, {
        id: tag.id,
        title: `${tag.emoji || '#'}${tag.name}`,
        tag: tag.name,
        color: tag.color || '#6b7280',
        isExpanded,
        isHidden,
        level: tag.level || 0,
        children: [], // 初始化空的children数组
        stats: {
          completed: snapshot?.details?.filter((log: any) => 
            log.operation === 'update' && 
            log.changes?.some((change: any) => 
              change.field === 'isCompleted' && 
              change.after === true
            ) &&
            log.after?.tags?.includes(tag.id)
          ).length || 0,
          total: snapshot?.details?.filter((log: any) => 
            (log.operation === 'create' || log.operation === 'update') &&
            (log.after?.tags?.includes(tag.id) || log.before?.tags?.includes(tag.id))
          ).length || 0,
          hours: 0
        }
      });
    });
    
    // 构建树形结构
    const rootNodes: TaskNode[] = [];
    
    tags.forEach(tag => {
      const node = nodeMap.get(tag.id);
      if (!node) return;
      
      if (tag.parentId) {
        // 有父节点，添加到父节点的children中
        const parent = nodeMap.get(tag.parentId);
        if (parent && parent.children) {
          parent.children.push(node);
        } else {
          // 父节点不存在，当作根节点
          rootNodes.push(node);
        }
      } else {
        // 没有父节点，是根节点
        rootNodes.push(node);
      }
    });
    
    return rootNodes;
  }, [tags, hiddenTags, snapshot, expandedNodes]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    onSearchChange?.(query);
  };

  const handleFilterChange = (filter: 'tags' | 'tasks' | 'favorites' | 'new') => {
    setActiveFilter(filter);
    onFilterChange?.(filter);
  };

  const handleDateSelect = (date: Date) => {
    if (!isSelecting || !rangeStart) {
      // 开始选择范围
      setRangeStart(date);
      setRangeEnd(null);
      setIsSelecting(true);
      setSelectedDate(date);
    } else {
      // 完成范围选择
      const start = rangeStart < date ? rangeStart : date;
      const end = rangeStart < date ? date : rangeStart;
      setRangeStart(start);
      setRangeEnd(end);
      setIsSelecting(false);
      setHoverDate(null);
      
      // 通知父组件日期范围改变
      onDateRangeChange?.(start, end);
    }
  };
  
  const handleDateHover = (date: Date) => {
    if (isSelecting && rangeStart) {
      setHoverDate(date);
    }
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    // 今日日期判断
    const today = new Date();
    const isToday = (date: Date) => {
      return date.getFullYear() === today.getFullYear() &&
             date.getMonth() === today.getMonth() &&
             date.getDate() === today.getDate();
    };

    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = new Array(startingDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      weeks.push(week);
    }

    return (
      <div className="calendar-container">
        <div className="calendar-header">
          <button className="calendar-nav-btn" onClick={handlePrevMonth}>
            ‹
          </button>
          <div className="calendar-title">
            {year}年 {month + 1}月
          </div>
          <button className="calendar-nav-btn" onClick={handleNextMonth}>
            ›
          </button>
        </div>
        <div className="calendar-weekdays">
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
        </div>
        
        {isSelecting && (
          <div className="selection-hint">
            点击结束日期完成范围选择
          </div>
        )}
        
        <div className="calendar-days">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="calendar-week">
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className={`calendar-day ${
                    day === null ? 'calendar-day-empty' : ''
                  } ${
                    day && isToday(new Date(year, month, day))
                      ? 'calendar-day-today'
                      : ''
                  } ${
                    day && isDateInRange(new Date(year, month, day))
                      ? 'calendar-day-in-range'
                      : ''
                  } ${
                    day && isDateRangeEnd(new Date(year, month, day))
                      ? 'calendar-day-range-end'
                      : ''
                  } ${
                    day && isDateRangeStart(new Date(year, month, day))
                      ? 'calendar-day-range-start'
                      : ''
                  }`}
                  onClick={() => day && handleDateSelect(new Date(year, month, day))}
                  onMouseEnter={() => day && handleDateHover(new Date(year, month, day))}
                >
                  {day}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTaskNode = (node: TaskNode) => {
    const hasChildren = node.children && node.children.length > 0;
    // ✅ 使用标签的 level 字段计算缩进（仅针对标签文本，不影响统计元素）
    const level = node.level || 0;
    const indent = level * 16; // 每级增加16px缩进（匹配Figma设计）
    
    return (
      <div key={node.id} className={`task-node task-node-depth-${level}`}>
        <div className="task-node-row">
          {/* 左侧：toggle按钮 */}
          {hasChildren ? (
            <button 
              className="task-expand-btn"
              onClick={() => toggleTaskNode(node.id)}
              style={{ marginLeft: `${indent}px` }}
            >
              <img 
                src={DownIconSvg} 
                alt="" 
                style={{ 
                  width: '12px', 
                  height: '12px',
                  transition: 'transform 0.2s',
                  transform: node.isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
                }} 
              />
            </button>
          ) : (
            <div className="task-expand-spacer" style={{ marginLeft: `${indent}px` }} />
          )}
          
          {/* 收藏图标 */}
          {node.isFavorite && (
            <span className="task-icon task-icon-favorite">⭐</span>
          )}
          
          {/* 任务标题 - 左侧 */}
          <div className="task-title" style={{ color: node.color }}>
            {node.title}
          </div>
          
          {/* 右侧：hide/unhide按钮 */}
          <div className="task-visibility-container">
            {node.isHidden ? (
              <button 
                className="task-visibility-btn task-visibility-btn-visible"
                onClick={() => onTagVisibilityChange?.(node.id, true)}
                title="显示此标签的事件"
              >
                <HideSmallIcon className="task-icon task-icon-hidden" />
              </button>
            ) : (
              <button 
                className="task-visibility-btn task-visibility-btn-hidden"
                onClick={() => onTagVisibilityChange?.(node.id, false)}
                title="隐藏此标签的事件"
              >
                <UnhideSmallIcon className="task-icon task-icon-visible" />
              </button>
            )}
          </div>
          
          {/* 统计信息 - 右侦 */}
          {node.stats && (
            <div className="task-stats">
              <div className="task-stats-top">
                <div className="task-stats-left">
                  <PiechartIcon className="task-pie-chart" color={node.color} />
                  <span className="task-progress-text">
                    {node.stats.completed}/{node.stats.total}
                  </span>
                </div>
                <span className="task-hours">{node.stats.hours}h</span>
              </div>
              <div className="task-time-bar">
                <div
                  className={`task-time-fill ${
                    node.color.includes('#a589e6') || node.color.includes('#8b5cf6') || node.color.includes('purple') 
                      ? 'purple' 
                      : node.color.includes('#3b82f6') || node.color.includes('blue')
                      ? 'blue'
                      : node.color.includes('#10b981') || node.color.includes('green')
                      ? 'green'
                      : ''
                  }`}
                  style={{
                    width: `${node.stats.total > 0 ? (node.stats.completed / node.stats.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* 子任务 */}
        {node.isExpanded && hasChildren && (
          <div className="task-children">
            {node.children?.map((child) => renderTaskNode(child))}
          </div>
        )}
      </div>
    );
  };

  const toggleTaskNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        // 当前是收起状态，点击后展开（从Set中移除）
        newSet.delete(nodeId);
      } else {
        // 当前是展开状态，点击后收起（添加到Set中）
        newSet.add(nodeId);
      }
      return newSet;
    });
  };
  
  // 日期范围判断辅助函数
  const isDateInRange = (date: Date): boolean => {
    if (!rangeStart) return false;
    
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    
    if (rangeEnd) {
      // 已完成选择，显示确定的范围
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      return compareDate >= start && compareDate <= end;
    } else if (isSelecting && hoverDate) {
      // 选择中，显示预览范围
      const start = rangeStart < hoverDate ? rangeStart : hoverDate;
      const end = rangeStart < hoverDate ? hoverDate : rangeStart;
      const startTime = new Date(start);
      const endTime = new Date(end);
      startTime.setHours(0, 0, 0, 0);
      endTime.setHours(0, 0, 0, 0);
      return compareDate >= startTime && compareDate <= endTime;
    } else {
      // 只选择了起始日期
      const start = new Date(rangeStart);
      start.setHours(0, 0, 0, 0);
      return compareDate.getTime() === start.getTime();
    }
  };
  
  const isDateRangeStart = (date: Date): boolean => {
    if (!rangeStart) return false;
    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate.getTime() === start.getTime();
  };
  
  const isDateRangeEnd = (date: Date): boolean => {
    if (!rangeEnd) return false;
    const end = new Date(rangeEnd);
    end.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate.getTime() === end.getTime();
  };

  const handleExitSnapshot = () => {
    // 清除日期范围选择，回到普通模式
    setRangeStart(null);
    setRangeEnd(null);
    setIsSelecting(false);
    setHoverDate(null);
    // 通知父组件清除日期范围（回到当天此刻的计划清单，不显示 snapshot 竖线）
    onDateRangeChange?.(null, null);
  };

  // 判断是否在 snapshot 模式：有 dateRange 或者正在选择日期
  const isInSnapshotMode = dateRange !== null && dateRange !== undefined;

  return (
    <div className={`content-selection-panel ${isPanelVisible ? 'pinned' : 'unpinned'}`}>
      {/* Pin按钮 */}
      <button 
        className="panel-pin-btn" 
        onClick={() => onPanelVisibilityChange?.(!isPanelVisible)}
        title={isPanelVisible ? "取消固定侧边栏" : "固定侧边栏"}
      >
        <PinIcon />
      </button>

      {/* Search Section - 独立搜索区域 */}
      <div className="search-section">
        <div className="search-input-wrapper-enhanced">
          {/* SVG 渐变边框 - 完美对称 */}
          <svg className="search-border-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="searchBorderGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            <rect 
              className="search-border-rect"
              x="1" y="1" 
              rx="20"
              ry="20"
              fill="none" 
              stroke="rgba(255, 255, 255, 0.5)" 
              strokeWidth="2"
            />
          </svg>
          <SearchIcon className="search-icon" />
          <input
            type="text"
            className="search-input-enhanced"
            placeholder='输入"上个月没完成的任务"试试'
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {/* 日期选择 Section */}
      <div className={`collapsible-section ${!isDateSectionExpanded ? 'collapsed' : ''}`}>
        <div 
          className="section-header-simple" 
          onClick={() => setIsDateSectionExpanded(!isDateSectionExpanded)}
        >
          <h3 className="section-title">日期选择</h3>
          <button className={`panel-toggle-btn ${isDateSectionExpanded ? 'expanded' : ''}`}>
            <RightIcon />
          </button>
        </div>
        <div className="collapsible-content">
          {/* Snapshot模式提示 - 仅在plan页面显示 */}
          {pageType === 'plan' && isInSnapshotMode && (
            <div className="snapshot-mode-banner">
              <div className="snapshot-mode-text">
                <span className="snapshot-icon">📸</span>
                <span>Snapshot Review 模式</span>
              </div>
              <button 
                className="exit-snapshot-btn"
                onClick={handleExitSnapshot}
                title="返回当前时间线"
              >
                退出Review
              </button>
            </div>
          )}
          
          {/* Calendar */}
          {renderCalendar()}
        </div>
      </div>

      {/* 标签选择 Section */}
      <div className={`collapsible-section ${!isTagSectionExpanded ? 'collapsed' : ''}`}>
        <div 
          className="section-header-simple" 
          onClick={() => setIsTagSectionExpanded(!isTagSectionExpanded)}
        >
          <h3 className="section-title">标签选择</h3>
          <button className={`panel-toggle-btn ${isTagSectionExpanded ? 'expanded' : ''}`}>
            <DownIcon isExpanded={isTagSectionExpanded} />
          </button>
        </div>
        <div className="collapsible-content">
          {/* Task Tree */}
          <div className="task-tree">
            {taskTree.map((node: TaskNode) => renderTaskNode(node))}
          </div>
        </div>
      </div>

      {/* 事件选择 Section - 🆕 v2.19: 显示重要笔记 (isNote=true) */}
      <div className={`collapsible-section ${!isEventSectionExpanded ? 'collapsed' : ''}`}>
        <div 
          className="section-header-simple" 
          onClick={() => setIsEventSectionExpanded(!isEventSectionExpanded)}
        >
          <h3 className="section-title">
            事件选择 {noteEvents.length > 0 && `(${noteEvents.length})`}
          </h3>
          <button className={`panel-toggle-btn ${isEventSectionExpanded ? 'expanded' : ''}`}>
            <RightIcon />
          </button>
        </div>
        <div className="collapsible-content">
          {loadingNotes ? (
            <div style={{ padding: '12px', color: '#9ca3af', fontSize: '14px' }}>
              加载中...
            </div>
          ) : noteEvents.length === 0 ? (
            <div style={{ padding: '12px', color: '#9ca3af', fontSize: '14px' }}>
              暂无重要笔记
              <br />
              <span style={{ fontSize: '13px', marginTop: '4px', display: 'block' }}>
                在 TimeLog 中点击标题旁的 <NotetreeIcon /> 图标标记事件为重要笔记
              </span>
            </div>
          ) : (
            <div className="note-list">
              {noteEvents.map(event => (
                <div 
                  key={event.id}
                  className="note-item"
                  onClick={() => handleNoteClick(event.id)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: '#374151',
                    borderRadius: '4px',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <NotetreeIcon />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getEventTitle(event)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 日历选择 Section - 展示日历账户分组 */}
      <div className={`collapsible-section ${!isCalendarExpanded ? 'collapsed' : ''}`}>
        <div 
          className="section-header-simple" 
          onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
        >
          <h3 className="section-title">日历选择</h3>
          <button className={`panel-toggle-btn ${isCalendarExpanded ? 'expanded' : ''}`}>
            <RightIcon />
          </button>
        </div>
        <div className="collapsible-content">
          {/* TODO: 根据日历账户数量显示：
               - 单账户：直接显示日历列表
               - 多账户：显示 Outlook/Google/iCloud 标签页 */}
          <div className="calendar-accounts-container">
            <p className="placeholder-text">日历账户列表</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentSelectionPanel;
