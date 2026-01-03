import React, { useState, useEffect } from 'react';
import { icons } from '../../../assets/icons';
import { formatTimeForStorage } from '../../../utils/timeUtils';
import './TimerCard.css';

interface TimerCardProps {
  tagId?: string;
  tagName?: string;
  tagEmoji?: string;
  tagPath?: string; // 完整的标签路径，如 "#😀工作/#📝文档编辑"
  tagColor?: string; // 标签颜色（使用最底层标签的颜色）
  startTime?: number; // 当前计时周期的开始时间戳
  originalStartTime?: number; // 用户设定的真正开始时间戳
  elapsedTime?: number; // 已经过的时间（毫秒）
  isRunning?: boolean;
  eventEmoji?: string; // 用户自定义的事件emoji
  eventTitle?: string; // 用户自定义的事件标题
  onPause?: () => void;
  onStop?: () => void;
  onCancel?: () => void;
  onEdit?: () => void; // 打开编辑框（可选：只读场景可不提供）
  onStart?: () => void; // 开始计时
  onStartTimeChange?: (newStartTime: number) => void; // 修改开始时间
}

export const TimerCard: React.FC<TimerCardProps> = ({
  tagId,
  tagName,
  tagEmoji,
  tagPath,
  tagColor,
  startTime,
  originalStartTime,
  elapsedTime = 0,
  isRunning = false,
  eventEmoji,
  eventTitle,
  onPause,
  onStop,
  onCancel,
  onEdit,
  onStart,
  onStartTimeChange
}) => {
  // 初始化为 null，将在 useEffect 中设置为最新时间
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isPulsing, setIsPulsing] = useState(false);
  
  // 判断是否处于初始状态（未开始计时）
  const isIdle = !startTime;
  
  // 立即初始化 currentTime 为最新时间（在组件挂载或 startTime 变化时）
  useEffect(() => {
    setCurrentTime(Date.now());
  }, [startTime]);
  
  // 每秒更新时间
  useEffect(() => {
    if (isRunning && !isIdle) {
      // 立即更新一次，确保时间是最新的
      const now = Date.now();
      setCurrentTime(now);
      
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [isRunning, isIdle]);
  
  // 计算总时长（秒）- 使用最新的 Date.now() 而不是 state 中的 currentTime
  const now = Date.now();
  
  // 安全验证输入值
  const safeElapsedTime = (elapsedTime && !isNaN(elapsedTime) && elapsedTime >= 0) ? elapsedTime : 0;
  const safeStartTime = (startTime && !isNaN(startTime) && startTime > 0) ? startTime : now;
  
  // 🔧 [FIX] 统一计算逻辑：与 Header 保持一致
  // elapsedTime：之前累积的时长（包括暂停前的）
  // startTime：当前这轮计时的开始时间
  // now - startTime：当前这轮运行的时长
  let totalElapsed: number;
  
  if (!isIdle && isRunning) {
    // 运行中：累积时长 + 当前这轮的运行时长
    totalElapsed = safeElapsedTime + (now - safeStartTime);
  } else {
    // 暂停或未开始：只显示累积时长
    totalElapsed = safeElapsedTime;
  }
  
  // 调试：记录异常情况
  if (!isIdle && (totalElapsed < 0 || totalElapsed > 86400000 * 365)) {
    console.error('⚠️ [TimerCard] 异常的计时数据:', {
      原始elapsedTime: elapsedTime,
      安全elapsedTime: safeElapsedTime,
      原始startTime: startTime,
      安全startTime: safeStartTime,
      now,
      计算差值: now - safeStartTime,
      totalElapsed,
      startTimeDate: safeStartTime ? formatTimeForStorage(new Date(safeStartTime)) : 'invalid',
      nowDate: formatTimeForStorage(new Date(now)),
      isRunning,
      isIdle
    });
    
    // 发生异常时，使用默认值继续执行
  }
  
  // 确保总时长为正数且合理
  const safeTotalElapsed = Math.max(0, totalElapsed);
  const totalSeconds = Math.floor(safeTotalElapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  // 检测整分钟，触发脉冲效果
  useEffect(() => {
    if (isRunning && seconds === 0 && minutes > 0) {
      setIsPulsing(true);
      const timeout = setTimeout(() => setIsPulsing(false), 600);
      return () => clearTimeout(timeout);
    }
  }, [seconds, minutes, isRunning]);
  
  // 格式化显示时间
  const formatTime = () => {
    // 安全检查
    if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0) {
      console.error('❌ [TimerCard] 异常的时间值:', { 
        minutes, 
        seconds, 
        elapsedTime, 
        startTime, 
        totalElapsed: (!isIdle && isRunning && startTime) 
          ? elapsedTime + (Date.now() - startTime)
          : elapsedTime
      });
      return '--:--';
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    // 防止超大数字显示
    if (hours > 99999) {
      console.error('❌ [TimerCard] 时长超出正常范围:', { hours, minutes, seconds });
      return '99:59:59+';
    }
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // 格式化开始时间
  const formatStartTime = () => {
    if (!startTime) return '--:--';
    const date = new Date(startTime);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };
  
  // 显示的emoji和标题
  const displayEmoji = eventEmoji || tagEmoji || '⏱️';
  const displayTitle = eventTitle || tagName || '点击选择任务';
  const displayTagPath = tagPath || '未选择标签';
  
  return (
    <div className="timer-card">
      {/* Emoji图标 - 在标题上方 */}
      <div className="timer-emoji" onClick={onEdit} title="点击修改表情">
        {displayEmoji}
      </div>
      
      {/* 标题 */}
      <div className="timer-title" onClick={onEdit} title="点击编辑事件">
        {displayTitle}
      </div>
      
      {/* 标签路径 */}
      <div 
        className="timer-tags" 
        onClick={onEdit} 
        title="点击编辑标签"
        style={{ color: tagColor || '#666' }}
      >
        {displayTagPath}
      </div>
      
      {/* 按钮组 */}
      {isIdle ? (
        // 初始状态：只显示开始按钮
        <div className="timer-buttons">
          <button 
            className="timer-btn start-btn" 
            onClick={onStart}
            title="开始计时"
          >
            <img src={icons.timerColor} alt="开始" />
          </button>
        </div>
      ) : (
        // 计时中：显示暂停、停止、取消按钮
        <div className="timer-buttons">
          <button 
            className="timer-btn pause-btn" 
            onClick={onPause}
            title={isRunning ? "暂停" : "继续"}
          >
            <img src={icons.pause} alt="暂停" />
          </button>
          <button 
            className="timer-btn stop-btn" 
            onClick={onStop}
            title="停止并保存"
          >
            <img src={icons.stop} alt="停止" />
          </button>
          <button 
            className="timer-btn cancel-btn" 
            onClick={onCancel}
            title="取消计时"
          >
            <img src={icons.cancel} alt="取消" />
          </button>
        </div>
      )}
      
      {/* 计时时间 */}
      <div className={`timer-display ${isPulsing ? 'pulse' : ''}`}>
        {formatTime()}
      </div>
      
      {/* 开始时间 - 点击打开编辑modal */}
      <div className="timer-start" onClick={onEdit} title="点击编辑开始时间">
        {isIdle ? '准备开始' : `开始时间 ${formatStartTime()}`}
      </div>
    </div>
  );
};
