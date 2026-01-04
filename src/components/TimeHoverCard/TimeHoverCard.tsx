/**
 * TimeHoverCard - 时间悬浮卡片组件
 * 
 * 基于 Figma 设计稿（节点 323-840, 323-951, 323-959）
 * 显示完整的日期信息、倒计时/已过期状态、修改按钮
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import React from 'react';
import { formatFullDate, formatCountdown } from '@frontend/utils/relativeDateFormatter';
import { icons } from '@frontend/assets/icons';
import './TimeHoverCard.css';

export interface TimeHoverCardProps {
  /** 开始时间 */
  startTime?: string | null;
  /** 结束时间 */
  endTime?: string | null;
  /** 截止日期 */
  dueDateTime?: string | null;
  /** 是否全天事件 */
  isAllDay?: boolean;
  /** 修改按钮点击回调 */
  onEditClick?: (e?: React.MouseEvent<HTMLElement>) => void;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 鼠标进入回调 */
  onMouseEnter?: () => void;
  /** 鼠标离开回调 */
  onMouseLeave?: () => void;
}

/**
 * TimeHoverCard 组件
 * 
 * 根据不同状态显示：
 * 1. 未来事件：显示倒计时（渐变色）
 * 2. 过期事件：显示已过期（红色）
 * 3. 全天/无时间：只显示日期和修改按钮
 */
const TimeHoverCard: React.FC<TimeHoverCardProps> = ({
  startTime,
  endTime,
  dueDateTime,
  isAllDay,
  onEditClick,
  style,
  onMouseEnter,
  onMouseLeave
}) => {
  const now = new Date();
  
  // 确定主要日期（优先使用开始时间，其次是截止日期）
  const primaryDate = startTime || dueDateTime;
  
  if (!primaryDate) {
    return null; // 没有日期信息，不显示卡片
  }
  
  const targetDate = new Date(primaryDate);
  
  // 格式化完整日期
  const fullDateStr = formatFullDate(targetDate);
  
  // 计算倒计时/已过期（仅对有明确时间的事件）
  const countdown = !isAllDay && startTime 
    ? formatCountdown(targetDate, now)
    : null;
  
  return (
    <div 
      className="time-hover-card" 
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 第一行：日历图标 + 完整日期 */}
      <div className="time-hover-card__date">
        <img src={icons.datetime} alt="datetime" className="time-hover-card__icon" />
        <span>{fullDateStr}</span>
      </div>
      
      {/* 第二行：倒计时/已过期状态（左对齐） + 修改按钮（右对齐） */}
      <div className="time-hover-card__footer">
        {/* 左侧：倒计时/已过期状态（可选） */}
        {countdown && (
          <div 
            className={`time-hover-card__countdown ${
              countdown.isOverdue ? 'time-hover-card__countdown--overdue' : ''
            }`}
          >
            {countdown.text}
          </div>
        )}
        
        {/* 右侧：修改按钮 */}
        {onEditClick && (
          <button 
            className="time-hover-card__edit-btn"
            onClick={onEditClick}
          >
            修改
          </button>
        )}
      </div>
    </div>
  );
};

export default TimeHoverCard;
