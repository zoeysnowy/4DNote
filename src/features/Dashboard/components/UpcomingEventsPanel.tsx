import React, { useState, useEffect, useMemo } from 'react';
import '../styles/UpcomingEventsPanel.css';
import { Event } from '@frontend/types';
import {
  TimeFilter,
  filterAndSortEvents,
  formatCountdown,
  getTimeRange
} from '@frontend/utils/upcomingEventsHelper';
import { shouldShowCheckbox } from '@frontend/utils/eventHelpers';
import { resolveCheckState } from '@frontend/utils/TimeResolver';
import { EventService } from '@backend/EventService';
import { TagService } from '@backend/TagService';
import { formatRelativeDate, formatRelativeTimeDisplay } from '@frontend/utils/relativeDateFormatter';
import { formatTimeForStorage, parseLocalTimeStringOrNull } from '@frontend/utils/timeUtils';
import { getLocationDisplayText } from '@frontend/utils/locationUtils';
import { slateNodesToHtml } from '@frontend/components/ModalSlate/serialization';
import { ModalSlate } from '@frontend/components/ModalSlate';
import { useEventHubSnapshot } from '@frontend/hooks/useEventHubSnapshot';

// 导入本地 SVG 图标
import TimerStartIconSvg from '@frontend/assets/icons/timer_start.svg';
import TaskGrayIconSvg from '@frontend/assets/icons/task_gray.svg';
import AttendeeIconSvg from '@frontend/assets/icons/Attendee.svg';
import LocationIconSvg from '@frontend/assets/icons/Location.svg';
import RightIconSvg from '@frontend/assets/icons/right.svg';
import HideIconSvg from '@frontend/assets/icons/hide.svg';

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

  // Epic 2 (Master Plan v2.22): subscription-backed snapshot view
  const { events: allEventsSnapshot, refresh } = useEventHubSnapshot({ enabled: isVisible });

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
    
    // ✅ 从订阅快照中过滤，而不是自行维护缓存
    const filtered = allEventsSnapshot.filter(event => {
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
      
      const eventStart = parseLocalTimeStringOrNull(event.timeSpec.resolved.start);
      if (!eventStart) return false;
      return eventStart >= start && eventStart <= end;
    });
    
    // 分离过期和未过期
    const now = currentTime.getTime();
    const upcomingEvents = filtered.filter(e => {
      const eventStart = parseLocalTimeStringOrNull(e.timeSpec!.resolved!.start);
      if (!eventStart) return false;
      return eventStart.getTime() >= now;
    });
    const expiredEvents = filtered.filter(e => {
      const eventStart = parseLocalTimeStringOrNull(e.timeSpec!.resolved!.start);
      if (!eventStart) return false;
      return eventStart.getTime() < now;
    });
    
    // 排序
    upcomingEvents.sort((a, b) => {
      const aStart = parseLocalTimeStringOrNull(a.timeSpec!.resolved!.start)?.getTime() ?? 0;
      const bStart = parseLocalTimeStringOrNull(b.timeSpec!.resolved!.start)?.getTime() ?? 0;
      return aStart - bStart;
    });
    expiredEvents.sort((a, b) => {
      const aStart = parseLocalTimeStringOrNull(a.timeSpec!.resolved!.start)?.getTime() ?? 0;
      const bStart = parseLocalTimeStringOrNull(b.timeSpec!.resolved!.start)?.getTime() ?? 0;
      return bStart - aStart;
    });
    
    return { upcoming: upcomingEvents, expired: expiredEvents };
  }, [allEventsSnapshot, activeFilter, currentTime]);

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

    // ✅ 调用 EventService 持久化（eventsUpdated 将驱动快照刷新）
    if (checked) {
      EventService.checkIn(eventId);
    } else {
      EventService.uncheck(eventId);
    }

    // 小兜底：部分写路径可能不带 eventId detail，直接拉一次快照
    void refresh();
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
      const eventDate = parseLocalTimeStringOrNull(resolvedTime.start || resolvedTime.end!);
      if (eventDate) {
        const relativeDate = formatRelativeDate(eventDate, currentTime);
        // 只有不是"今天"或"明天"时才显示
        if (relativeDate !== '今天' && relativeDate !== '明天') {
          dateDisplay = relativeDate;
        }
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
                const { isChecked } = resolveCheckState(event);
                
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
                  background: `linear-gradient(to right, #22d3ee, #3b82f6)` ,
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
          {typeof event.eventlog !== 'string' && event.eventlog?.slateJson && (
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
