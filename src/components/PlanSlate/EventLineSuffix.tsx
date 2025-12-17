/**
 * EventLineSuffix - 事件行后缀渲染器
 * 
 * 渲染 TimeDisplay + More 图标
 */

import React from 'react';
import { EventLineNode } from './types';
import { useEventTime } from '../../hooks/useEventTime';
import { formatRelativeTimeDisplay } from '../../utils/relativeDateFormatter';
import Tippy from '@tippyjs/react';
import TimeHoverCard from '../TimeHoverCard';
import { icons } from '../../assets/icons';
import { EventService } from '../../services/EventService';

export interface EventLineSuffixProps {
  element: EventLineNode;
  onTimeClick: (eventId: string, anchor: HTMLElement) => void;
  onMoreClick: (eventId: string) => void;
}

export const EventLineSuffix: React.FC<EventLineSuffixProps> = React.memo(({ element, onTimeClick, onMoreClick }) => {
  const metadata = element.metadata || {};
  const eventTime = useEventTime(element.eventId);
  
  // 🆕 获取事件的 isDeadline 信息
  const event = React.useMemo(() => {
    if (!element.eventId) return null;
    return EventService.getEventById(element.eventId);
  }, [element.eventId]);
  
  const isDeadline = event?.isDeadline || false;
  
  // 时间显示逻辑
  const [showHoverCard, setShowHoverCard] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  const startTime = (eventTime.start && eventTime.start !== '') ? new Date(eventTime.start) : (metadata.startTime ? new Date(metadata.startTime) : null);
  const dueDateTime = metadata.dueDateTime ? new Date(metadata.dueDateTime) : null;
  
  const startTimeStr = (eventTime.start && eventTime.start !== '') ? eventTime.start : (metadata.startTime || null);
  const endTimeStr = (eventTime.end && eventTime.end !== '') ? eventTime.end : (metadata.endTime || null);
  const dueDateTimeStr = metadata.dueDateTime || null;
  const isAllDay = eventTime.timeSpec?.allDay ?? metadata.isAllDay;
  
  // 格式化时间显示（v2.8.2: 移除了 displayHint 参数）
  const relativeTimeDisplay = startTime || dueDateTime 
    ? formatRelativeTimeDisplay(startTimeStr, endTimeStr, isAllDay ?? false, dueDateTimeStr)
    : null;
  
  // 🆕 判断时间类型并设置标签和颜色
  let timeLabel = null;
  let timeLabelColor = '#6b7280';
  
  // 检查是否为模糊日期范围（如"本周末"、"下周"等）
  const isFuzzyDateRange = relativeTimeDisplay && (
    relativeTimeDisplay.includes('周末') ||
    relativeTimeDisplay.includes('周中') ||
    relativeTimeDisplay.includes('工作日') ||
    /^(本|下|上|这|next|last)\s*(周|week)/i.test(relativeTimeDisplay)
  );
  
  if (isFuzzyDateRange) {
    // 模糊日期范围不显示标签，避免"本周末 结束"这种语义错误
    timeLabel = null;
  } else if (startTimeStr && endTimeStr && startTimeStr !== endTimeStr) {
    // 明确时间段：显示"结束"
    timeLabel = '结束';
    timeLabelColor = '#4b5563'; // 深灰色
  } else if (startTimeStr && (!endTimeStr || startTimeStr === endTimeStr)) {
    // 单一时间：根据 isDeadline 显示"开始"或"截止"
    if (isDeadline) {
      timeLabel = '截止';
      timeLabelColor = '#dc2626'; // 深红色
    } else {
      timeLabel = '开始';
      timeLabelColor = '#10b981'; // 绿色
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: '14px', justifyContent: 'flex-end' }}>
      {/* 时间显示 */}
      {relativeTimeDisplay && (
        <Tippy
          content={
            <TimeHoverCard
              startTime={startTimeStr}
              endTime={endTimeStr}
              dueDateTime={dueDateTimeStr}
              isAllDay={isAllDay ?? false}
              onEditClick={() => {
                setShowHoverCard(false);
                if (containerRef.current && element.eventId) {
                  onTimeClick(element.eventId, containerRef.current);
                }
              }}
              onMouseEnter={() => setShowHoverCard(true)}
              onMouseLeave={() => setShowHoverCard(false)}
            />
          }
          visible={showHoverCard}
          placement="bottom-start"
          interactive={true}
          arrow={false}
          appendTo={() => document.body}
          onClickOutside={() => setShowHoverCard(false)}
        >
          <div 
            ref={containerRef}
            style={{ display: 'inline-block' }}
            onMouseEnter={() => setShowHoverCard(true)}
            onMouseLeave={() => setShowHoverCard(false)}
          >
            <span
              style={{ color: '#6b7280', whiteSpace: 'nowrap', cursor: 'pointer' }}
              onClick={() => {
                if (containerRef.current && element.eventId) {
                  onTimeClick(element.eventId, containerRef.current);
                }
              }}
            >
              {relativeTimeDisplay}
              {timeLabel && (
                <span style={{ color: timeLabelColor, marginLeft: '4px', fontWeight: 500 }}>
                  {timeLabel}
                </span>
              )}
            </span>
          </div>
        </Tippy>
      )}
      
      {/* More 图标 */}
      <img
        src={icons.more}
        alt="更多"
        onClick={(e) => {
          e.stopPropagation();
          if (element.eventId) {
            onMoreClick(element.eventId);
          }
        }}
        style={{
          width: 14,
          height: 14,
          cursor: 'pointer',
          opacity: 0.4,
          marginLeft: 4,
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLImageElement).style.opacity = '0.8';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLImageElement).style.opacity = '0.4';
        }}
      />
    </div>
  );
});
