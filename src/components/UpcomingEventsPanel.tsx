import React, { useState, useEffect, useMemo } from 'react';
import './UpcomingEventsPanel.css';
import { Event } from '../types';
import { 
  TimeFilter, 
  filterAndSortEvents, 
  formatCountdown,
  getTimeRange
} from '../utils/upcomingEventsHelper';
import { shouldShowCheckbox } from '../utils/eventHelpers';
import { EventService } from '../services/EventService';
import { TagService } from '../services/TagService';
import { formatRelativeDate, formatRelativeTimeDisplay } from '../utils/relativeDateFormatter';
import { formatTimeForStorage } from '../utils/timeUtils';
import { getLocationDisplayText } from '../utils/locationUtils';
import { slateNodesToHtml } from '../components/ModalSlate/serialization';

// 导入本地 SVG 图标
import TimerStartIconSvg from '../assets/icons/timer_start.svg';
import TaskGrayIconSvg from '../assets/icons/task_gray.svg';
import AttendeeIconSvg from '../assets/icons/Attendee.svg';
import LocationIconSvg from '../assets/icons/Location.svg';
import RightIconSvg from '../assets/icons/right.svg';
import HideIconSvg from '../assets/icons/hide.svg';

// 图标组件
const TimerStartIcon = ({ className }: { className?: string }) => <img src={TimerStartIconSvg} alt="Timer Start" className={className} style={{ width: '20px', height: '20px' }} />;
const TaskGrayIcon = ({ className }: { className?: string }) => <img src={TaskGrayIconSvg} alt="Task" className={className} style={{ width: '16px', height: '16px' }} />;
const AttendeeIcon = ({ className }: { className?: string }) => <img src={AttendeeIconSvg} alt="Attendee" className={className} style={{ width: '16px', height: '16px' }} />;
const LocationIcon = ({ className }: { className?: string }) => <img src={LocationIconSvg} alt="Location" className={className} style={{ width: '16px', height: '16px' }} />;
const RightIcon = ({ className }: { className?: string }) => <img src={RightIconSvg} alt="Expand" className={className} style={{ width: '16px', height: '16px' }} />;
const HideIcon = ({ className }: { className?: string }) => <img src={HideIconSvg} alt="Hide" className={className} style={{ width: '20px', height: '20px', opacity: 0.6 }} />;

interface UpcomingEventsPanelProps {
  onTimeFilterChange?: (filter: TimeFilter) => void;
  onEventClick?: (event: Event) => void; // 点击事件卡片
}

const UpcomingEventsPanel: React.FC<UpcomingEventsPanelProps> = ({ 
  onTimeFilterChange,
  onEventClick
}) => {
  const [activeFilter, setActiveFilter] = useState<TimeFilter>('today');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isVisible, setIsVisible] = useState(true);
  const [showExpired, setShowExpired] = useState(false); // 是否展开过期事件
  // ✅ 性能优化：使用缓存，避免每次都全量加载
  const [allEventsCache, setAllEventsCache] = useState<Event[]>([]); // 事件缓存

  // ✅ 从 EventService 加载所有事件（只在组件挂载时执行一次）
  useEffect(() => {
    // 初始加载：只执行一次
    const loadInitialEvents = async () => {
      const initialEvents = await EventService.getAllEvents();
      console.log('🔍 [UpcomingEventsPanel] 初始加载事件缓存:', {
        count: initialEvents.length
      });
      setAllEventsCache(initialEvents);
    };
    
    loadInitialEvents();

    // ✅ 监听 eventsUpdated 增量更新缓存
    const handleEventsUpdated = async (e: any) => {
      const { eventId, isNewEvent, isDeleted } = e.detail || {};
      
      if (!eventId) {
        // 没有 eventId，fallback 到全量重载
        console.log('[UpcomingEventsPanel] 无 eventId，全量重载缓存');
        const allEvents = await EventService.getAllEvents();
        setAllEventsCache(allEvents);
        return;
      }
      
      console.log('[UpcomingEventsPanel] 收到 eventsUpdated 事件，增量更新缓存:', {
        eventId: eventId.slice(-8),
        isNewEvent,
        isDeleted
      });
      
      // ✅ 增量更新缓存
      if (isDeleted) {
        // 事件被删除
        setAllEventsCache(prev => prev.filter(e => e.id !== eventId));
      } else {
        // 获取最新的事件数据
        const updatedEvent = await EventService.getEventById(eventId);
        
        if (!updatedEvent) {
          // 事件不存在，从缓存中移除
          setAllEventsCache(prev => prev.filter(e => e.id !== eventId));
        } else if (isNewEvent) {
          // 新事件，添加到列表
          setAllEventsCache(prev => [...prev, updatedEvent]);
        } else {
          // 更新现有事件
          setAllEventsCache(prev => {
            const existingIndex = prev.findIndex(e => e.id === eventId);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = updatedEvent;
              return updated;
            } else {
              // 事件不在缓存中，添加
              return [...prev, updatedEvent];
            }
          });
        }
      }
    };

    window.addEventListener('eventsUpdated', handleEventsUpdated as EventListener);

    return () => {
      window.removeEventListener('eventsUpdated', handleEventsUpdated);
    };
  }, []); // ✅ 空依赖，只初始化一次

  // ✅ 智能更新 currentTime：只在必要时更新
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // ✅ 筛选和排序事件（从缓存中过滤，而不是重新加载）
  const { upcoming, expired } = useMemo(() => {
    const { start, end } = getTimeRange(activeFilter, currentTime);
    
    // ✅ 从缓存中过滤，而不是重新加载
    const filtered = allEventsCache.filter(event => {
      // 三步过滤公式
      // 1. 并集条件
      const matchesInclusionCriteria = 
        event.isPlan === true || 
        (event.checkType && event.checkType !== 'none') ||
        event.isTimeCalendar === true;
      
      if (!matchesInclusionCriteria) return false;
      
      // 2. 排除系统事件
      if (event.isTimer === true || event.isOutsideApp === true || event.isTimeLog === true) {
        return false;
      }
      
      // 3. 时间范围过滤
      if (!event.timeSpec?.resolved) return false;
      
      const eventStart = new Date(event.timeSpec.resolved.start);
      return eventStart >= start && eventStart <= end;
    });
    
    // 分离过期和未过期
    const now = currentTime.getTime();
    const upcomingEvents = filtered.filter(e => {
      const eventStart = new Date(e.timeSpec!.resolved!.start);
      return eventStart.getTime() >= now;
    });
    const expiredEvents = filtered.filter(e => {
      const eventStart = new Date(e.timeSpec!.resolved!.start);
      return eventStart.getTime() < now;
    });
    
    // 排序
    upcomingEvents.sort((a, b) => 
      new Date(a.timeSpec!.resolved!.start).getTime() - 
      new Date(b.timeSpec!.resolved!.start).getTime()
    );
    expiredEvents.sort((a, b) => 
      new Date(b.timeSpec!.resolved!.start).getTime() - 
      new Date(a.timeSpec!.resolved!.start).getTime()
    );
    
    return { upcoming: upcomingEvents, expired: expiredEvents };
  }, [allEventsCache, activeFilter, currentTime]);

  const handleFilterChange = (filter: TimeFilter) => {
    setActiveFilter(filter);
    onTimeFilterChange?.(filter);
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const toggleExpiredSection = () => {
    setShowExpired(!showExpired);
  };

  const handleCheckboxChange = (eventId: string, checked: boolean) => {
    console.log('[UpcomingEventsPanel] handleCheckboxChange:', { eventId: eventId.slice(-10), checked });
    
    // ✅ 1. 立即更新本地 UI（乐观更新）
    setAllEvents(prev => {
      const updated = prev.map(e => {
        if (e.id === eventId) {
          // 更新本地 checked/unchecked 数组
          const timestamp = new Date().toISOString();
          if (checked) {
            return { ...e, checked: [...(e.checked || []), timestamp] };
          } else {
            return { ...e, unchecked: [...(e.unchecked || []), timestamp] };
          }
        }
        return e;
      });
      return updated;
    });
    
    // ✅ 2. 调用 EventService 持久化
    if (checked) {
      EventService.checkIn(eventId);
    } else {
      EventService.uncheck(eventId);
    }
    
    // ✅ 3. EventService.dispatchEventUpdate 会触发 eventsUpdated 事件
    //    useEffect 监听器会重新加载，确保和 localStorage 同步
  };

  const handleEventClick = (event: Event) => {
    onEventClick?.(event);
  };

  const renderEventCard = (event: Event) => {
    // ✅ 符合 TIME_ARCHITECTURE：强制使用 timeSpec.resolved
    if (!event.timeSpec?.resolved) {
      return null; // 没有 timeSpec 的事件不显示
    }
    
    const resolvedTime = event.timeSpec.resolved;
    const isAllDay = event.timeSpec.allDay ?? false;
    
    // 使用 formatRelativeTimeDisplay 格式化时间显示
    const timeLabel = formatRelativeTimeDisplay(
      resolvedTime.start,
      resolvedTime.end,
      isAllDay
    );
    
    const countdown = formatCountdown(event, currentTime);
    const isExpired = !countdown; // 过期事件没有倒计时
    
    // 获取第一个标签的信息
    const primaryTagId = event.tags && event.tags.length > 0 ? event.tags[0] : null;
    const primaryTag = primaryTagId ? TagService.getTagById(primaryTagId) : null;
    const tagColor = primaryTag?.color || event.color || '#6b7280';
    const tagEmoji = primaryTag?.emoji;
    const tagName = primaryTag?.name;
    
    // ✅ 使用 colorTitle（富文本），转换为 HTML 显示（保留粗体、颜色等格式）
    const displayTitle = useMemo(() => {
      if (!event.title?.colorTitle) return event.title?.simpleTitle || '';
      try {
        const nodes = JSON.parse(event.title.colorTitle);
        return slateNodesToHtml(nodes);
      } catch (error) {
        console.warn('解析 colorTitle 失败:', error);
        return event.title.simpleTitle || '';
      }
    }, [event.title]);
    
    // 计算是否需要显示日期（仅过期事件需要）
    let dateDisplay: string | undefined;
    if (isExpired && (resolvedTime.start || resolvedTime.end)) {
      const eventDate = new Date(resolvedTime.start || resolvedTime.end!);
      const relativeDate = formatRelativeDate(eventDate, currentTime);
      // 只有不是"今天"或"明天"时才显示
      if (relativeDate !== '今天' && relativeDate !== '明天') {
        dateDisplay = relativeDate;
      }
    }

    return (
      <div 
        key={event.id} 
        className="event-card"
        onClick={() => handleEventClick(event)}
      >
        {/* Action Indicator Line - 使用标签颜色 */}
        <div
          className="event-indicator-line"
          style={{ backgroundColor: tagColor }}
        />

        <div className="event-card-content">
          {/* 第一行: checkbox? + title | 时间icon + 时间 */}
          <div className="event-row-1">
            <div className="event-header">
              {shouldShowCheckbox(event) && (() => {
                // ✅ 直接从 event 对象计算 checked 状态，不调用 EventService
                const lastChecked = event.checked && event.checked.length > 0 
                  ? event.checked[event.checked.length - 1] 
                  : null;
                const lastUnchecked = event.unchecked && event.unchecked.length > 0 
                  ? event.unchecked[event.unchecked.length - 1] 
                  : null;
                
                // 比较最后的时间戳
                const isChecked = lastChecked && (!lastUnchecked || lastChecked > lastUnchecked);
                
                return (
                  <div className="event-checkbox">
                    <input 
                      type="checkbox" 
                      checked={!!isChecked} 
                      onChange={(e) => {
                        e.stopPropagation(); // 阻止触发卡片点击
                        handleCheckboxChange(event.id, e.target.checked);
                      }}
                    />
                  </div>
                );
              })()}
              <h4 
                className="event-title"
                dangerouslySetInnerHTML={{ __html: displayTitle }}
              />
            </div>
            {timeLabel && (
              <div className="event-time-info">
                <TimerStartIcon />
                <span className="event-time-label">{timeLabel}</span>
              </div>
            )}
          </div>

          {/* 第二行: 标签 | 倒计时/日期 */}
          <div className="event-row-2">
            {tagName && (
              <div className="event-tag" style={{ color: tagColor }}>
                #{tagEmoji ? `${tagEmoji} ` : ''}{tagName}
              </div>
            )}
            {countdown && (
              <div
                className="event-countdown"
                style={{
                  background: `linear-gradient(to right, #22d3ee, #3b82f6)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {countdown}
              </div>
            )}
            {dateDisplay && (
              <div className="event-date">
                {dateDisplay}
              </div>
            )}
          </div>

          {/* Event Attendees */}
          {event.attendees && (
            <div className="event-attendees">
              <AttendeeIcon className="event-attendees-icon" />
              <span className="event-attendees-text">
                {event.attendees.join('; ')}
              </span>
            </div>
          )}

          {/* Event Location */}
          {event.location && (
            <div className="event-location">
              <LocationIcon className="event-location-icon" />
              <span className="event-location-text">
                {getLocationDisplayText(event.location)}
              </span>
            </div>
          )}

          {/* Event Log Preview */}
          {event.eventlog?.slateJson && (
            <div className="event-log-preview">
              <RightIcon className="event-log-expand-icon" />
              <div className="event-log-text">
                <ModalSlate
                  content={event.eventlog.slateJson}
                  parentEventId={event.id}
                  onChange={() => {}} // 只读，不处理变化
                  readOnly={true}
                  enableTimestamp={false}
                  placeholder=""
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="upcoming-events-panel">
      {/* Section Header - 完全匹配计划清单结构 */}
      <div className="section-header">
        <div className="title-indicator" />
        <h3>即将到来</h3>
        <button className="panel-toggle-btn" onClick={toggleVisibility}>
          <HideIcon />
        </button>
      </div>

      {/* Time Filter Buttons */}
      <div className="filter-buttons">
        <button
          className={`filter-btn ${activeFilter === 'today' ? 'filter-btn-active' : ''}`}
          onClick={() => handleFilterChange('today')}
        >
          今天
        </button>
        <button
          className={`filter-btn ${activeFilter === 'tomorrow' ? 'filter-btn-active' : ''}`}
          onClick={() => handleFilterChange('tomorrow')}
        >
          明天
        </button>
        <button
          className={`filter-btn ${activeFilter === 'week' ? 'filter-btn-active' : ''}`}
          onClick={() => handleFilterChange('week')}
        >
          本周
        </button>
        <button
          className={`filter-btn ${activeFilter === 'nextWeek' ? 'filter-btn-active' : ''}`}
          onClick={() => handleFilterChange('nextWeek')}
        >
          下周
        </button>
        <button
          className={`filter-btn ${activeFilter === 'all' ? 'filter-btn-active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          全部
        </button>
      </div>

      {/* Event Cards */}
      <div className="event-list">
        {/* 即将开始的事件 */}
        {upcoming.map((event) => renderEventCard(event))}

        {/* 过期事件分隔符 */}
        {expired.length > 0 && (
          <div className="expired-divider" onClick={toggleExpiredSection}>
            <div className="expired-divider-line" />
            <span className="expired-label">
              已过期 ({expired.length})
            </span>
            <RightIcon 
              className={`expired-expand-icon ${showExpired ? 'expanded' : ''}`}
            />
          </div>
        )}

        {/* 已过期的事件（可展开/收缩） */}
        {showExpired && expired.map((event) => renderEventCard(event))}
      </div>
    </div>
  );
};

export default UpcomingEventsPanel;
