import React, { useState, useCallback, useMemo } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import { followCursor } from 'tippy.js';
import './TimeGap.css';

interface TimeGapProps {
  prevEventEndTime?: Date;
  nextEventStartTime?: Date;
  onCreateEvent: (suggestedStartTime: Date) => void;
  onCreateNote?: (suggestedStartTime: Date) => void;  // 添加笔记（纯 eventlog）
  onUploadAttachment?: (suggestedStartTime: Date) => void; // 上传附件
}

export const TimeGap: React.FC<TimeGapProps> = ({
  prevEventEndTime,
  nextEventStartTime,
  onCreateEvent,
  onCreateNote,
  onUploadAttachment,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const [isInMenu, setIsInMenu] = useState(false); // 🎯 跟踪鼠标是否在浮窗菜单内

  // Calculate gap duration in minutes
  const gapDuration = useMemo(() => {
    if (!prevEventEndTime || !nextEventStartTime) {
      // 如果缺少边界，假设是一整天（1440分钟）或较长时间
      return 24 * 60; // 24 hours
    }
    return (nextEventStartTime.getTime() - prevEventEndTime.getTime()) / 60000;
  }, [prevEventEndTime, nextEventStartTime]);

  // 特殊情况：如果没有前后边界（例如今天的完整时间轴），总是渲染
  const isOpenEnded = !prevEventEndTime || !nextEventStartTime;

  const snapDateToMinutes = useCallback((date: Date, minutes: number): Date => {
    const intervalMs = minutes * 60 * 1000;
    const snappedMs = Math.round(date.getTime() / intervalMs) * intervalMs;
    return new Date(snappedMs);
  }, []);

  const clampDate = useCallback((date: Date, minDate: Date, maxDate: Date): Date => {
    const clampedMs = Math.min(Math.max(date.getTime(), minDate.getTime()), maxDate.getTime());
    return new Date(clampedMs);
  }, []);

  // 背景点击不处理（让按钮处理点击）
  const handleSmartClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 不处理点击，让用户通过按钮操作
  }, []);

  // 鼠标移动时计算时间百分比
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHovered || isInMenu) return; // 🎯 在浮窗菜单内时不更新时间
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = Math.max(0, Math.min(1, y / rect.height));
    
    setHoverY(percentage);
  }, [isHovered, isInMenu]);

  // 计算鼠标位置对应的时间（15 分钟吸附）
  const calculateHoverTime = useCallback(() => {
    if (hoverY === null) return null;

    const snapMinutes = 15;
    
    if (!prevEventEndTime && !nextEventStartTime) {
      // 开放式时间轴（今天还没有事件）：从 00:00 到 23:59 根据鼠标位置计算
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayDuration = 24 * 60; // 一天的分钟数
      const rawTime = new Date(today.getTime() + dayDuration * hoverY * 60000);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      return clampDate(snapDateToMinutes(rawTime, snapMinutes), today, endOfDay);
    } else if (!prevEventEndTime && nextEventStartTime) {
      // 只有后续事件：从今天 00:00 到下一个事件的时间范围
      const today = new Date(nextEventStartTime);
      today.setHours(0, 0, 0, 0);
      const gapFromMidnight = (nextEventStartTime.getTime() - today.getTime()) / 60000;
      const rawTime = new Date(today.getTime() + gapFromMidnight * hoverY * 60000);
      return clampDate(snapDateToMinutes(rawTime, snapMinutes), today, nextEventStartTime);
    } else if (prevEventEndTime && !nextEventStartTime) {
      // 只有前一事件：从前一事件结束到今天 23:59
      const endOfDay = new Date(prevEventEndTime);
      endOfDay.setHours(23, 59, 59, 999);
      const gapToMidnight = (endOfDay.getTime() - prevEventEndTime.getTime()) / 60000;
      const rawTime = new Date(prevEventEndTime.getTime() + gapToMidnight * hoverY * 60000);
      return clampDate(snapDateToMinutes(rawTime, snapMinutes), prevEventEndTime, endOfDay);
    } else if (prevEventEndTime && nextEventStartTime) {
      // 有明确的时间间隙：从前一事件结束到下一事件开始
      const rawTime = new Date(prevEventEndTime.getTime() + gapDuration * hoverY * 60000);
      return clampDate(snapDateToMinutes(rawTime, snapMinutes), prevEventEndTime, nextEventStartTime);
    }
    
    return new Date();
  }, [hoverY, gapDuration, prevEventEndTime, nextEventStartTime, clampDate, snapDateToMinutes]);

  const hoverTime = calculateHoverTime();

  const getSuggestedStartTime = useCallback((): Date => {
    if (hoverTime) return hoverTime;

    const snapMinutes = 15;
    if (prevEventEndTime) {
      return snapDateToMinutes(new Date(prevEventEndTime), snapMinutes);
    }
    if (nextEventStartTime) {
      return snapDateToMinutes(new Date(nextEventStartTime.getTime() - 30 * 60000), snapMinutes);
    }
    return snapDateToMinutes(new Date(), snapMinutes);
  }, [hoverTime, prevEventEndTime, nextEventStartTime, snapDateToMinutes]);

  // 处理创建笔记
  const handleCreateNote = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const suggestedStart = getSuggestedStartTime();
    onCreateNote?.(suggestedStart);
  }, [getSuggestedStartTime, onCreateNote]);

  // 处理创建事件
  const handleCreateEvent = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const suggestedStart = getSuggestedStartTime();
    onCreateEvent(suggestedStart);
  }, [getSuggestedStartTime, onCreateEvent]);

  // 处理上传附件
  const handleUploadAttachment = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const suggestedStart = getSuggestedStartTime();
    onUploadAttachment?.(suggestedStart);
  }, [getSuggestedStartTime, onUploadAttachment]);

  // 格式化时间间隔显示
  const formatGapDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)}min`;
    } else if (minutes < 24 * 60) {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } else {
      const days = Math.floor(minutes / (24 * 60));
      const hours = Math.floor((minutes % (24 * 60)) / 60);
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
  };

  // 根据时长调整高度和样式
  const getGapHeight = (): number => {
    if (gapDuration < 30) return 32; // 小间隔
    if (gapDuration < 120) return 48; // 标准间隔
    return 48; // 大间隔（保持紧凑，不随时长增长）
  };

  const gapHeight = getGapHeight();
  const isSmallGap = gapDuration < 30;
  const isOvernightGap = gapDuration >= 8 * 60; // 8 小时以上

  // Don't render if gap is too small (但开放式时间轴总是渲染)
  if (!isOpenEnded && gapDuration <= 15) {
    return null;
  }

  return (
    <div
      className={`time-gap ${isHovered ? 'hovered' : ''} ${isSmallGap ? 'small' : ''}`}
      style={{ height: `${gapHeight}px` }}
      onClick={handleSmartClick}
    >
      {/* 左侧时间轴线区域 - 仅此区域可触发hover */}
      <div
        className="time-gap-axis-trigger"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={(e) => {
          // 🔧 延迟检查，给鼠标移动到浮窗的时间
          setTimeout(() => {
            if (!isInMenu) {
              setIsHovered(false);
              setHoverY(null);
            }
          }, 100);
        }}
        onMouseMove={handleMouseMove}
      >
      {/* 左侧时间轴线 - 作为 Tippy 定位锚点 */}
      <Tippy
        content={
          <div 
            className="time-gap-floating-menu"
            onMouseEnter={() => setIsInMenu(true)} // 🎯 进入浮窗时锁定时间
            onMouseLeave={() => {
              setIsInMenu(false); // 🎯 离开浮窗时恢复更新
              // 🔧 离开浮窗后也隐藏整个 hover 状态
              setTimeout(() => {
                setIsHovered(false);
                setHoverY(null);
              }, 100);
            }}
          >
            {/* 显示鼠标悬停位置的时间（顶部） */}
            {hoverTime && (
              <div className="floating-menu-time">
                {hoverTime.toLocaleTimeString('zh-CN', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            )}

            <button 
              className="floating-menu-btn note"
              onClick={handleCreateNote}
              title="添加笔记"
            >
              <span className="btn-icon">📝</span>
              <span className="btn-text">添加笔记</span>
            </button>
            <button 
              className="floating-menu-btn event"
              onClick={handleCreateEvent}
              title="添加事件"
            >
              <span className="btn-icon">📅</span>
              <span className="btn-text">添加事件</span>
            </button>
            <button 
              className="floating-menu-btn attachment"
              onClick={handleUploadAttachment}
              title="上传附件"
            >
              <span className="btn-icon">📎</span>
              <span className="btn-text">上传附件</span>
            </button>
          </div>
        }
        visible={isHovered}
        interactive={true}
        interactiveBorder={300} // 🔧 扩大交互边界，覆盖 time-gap-content 区域
        arrow={false}
        placement="right-start"
        zIndex={999} // 🔧 大幅提高 z-index，确保在所有元素上方
        appendTo={() => document.body} // 🔧 挂载到 body，避免被父容器的 z-index 限制
        popperOptions={{
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 10],
              },
            },
          ],
        }}
        theme="time-gap-menu"
        animation={false}
        duration={0}
      >
        <div className={`time-gap-axis ${isHovered ? 'active' : ''}`} />
      </Tippy>
      </div>

      {/* 中间内容区域 */}
      <div className="time-gap-content" style={{ minHeight: '24px' }}>
        {/* 使用 opacity 控制显示隐藏，保持 DOM 占位避免高度塌陷 */}
        <span 
          className="time-gap-duration"
          style={{ 
            opacity: isHovered ? 0 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {formatGapDuration(gapDuration)} 
          {isOvernightGap && ' (Overnight)'}
          {' Free'}
        </span>
      </div>
    </div>
  );
};
