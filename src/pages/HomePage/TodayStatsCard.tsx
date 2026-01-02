import React, { useState, useEffect } from 'react';
import { DashboardCard } from './DashboardCard';
import { EventService } from '../../services/EventService';
import { TimeRange } from './TimeRangeSelector';
import { parseLocalTimeString } from '../../utils/timeUtils';
import './TodayStatsCard.css';

interface TodayStats {
  totalTime: number;        // 总时长（毫秒）
  plannedTime: number;      // 计划时长
  actualTime: number;       // 实际时长
  completedEvents: number;  // 完成事件数
  ongoingEvents: number;    // 进行中事件数
  completionRate: number;   // 完成率
}

interface TodayStatsCardProps {
  timeRange?: TimeRange;
}

/**
 * TodayStatsCard - 今日统计卡片
 * 
 * 显示内容：
 * 1. 今日总时长
 * 2. 计划时长 vs 实际时长
 * 3. 完成事件数
 * 4. 完成率
 */
export const TodayStatsCard: React.FC<TodayStatsCardProps> = ({ timeRange }) => {
  const [stats, setStats] = useState<TodayStats>({
    totalTime: 0,
    plannedTime: 0,
    actualTime: 0,
    completedEvents: 0,
    ongoingEvents: 0,
    completionRate: 0
  });
  const [loading, setLoading] = useState(true);

  // 格式化时长（毫秒转为 小时:分钟）
  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // 加载统计数据
  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        // 使用timeRange参数，如果没有则使用今天
        const startDate = timeRange?.startDate || new Date();
        const endDate = timeRange?.endDate || new Date();
        
        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const startDateStr = formatDate(startDate);
        const endDateStr = formatDate(endDate);
        const eventStats = await EventService.getEventStatsByDateRange(startDateStr, endDateStr);

        // 计算统计数据
        let totalTime = 0;
        let completedEvents = 0;
        let ongoingEvents = 0;

        eventStats.forEach(stats => {
          if (stats.startTime && stats.endTime) {
            try {
              const duration =
                parseLocalTimeString(stats.endTime).getTime() -
                parseLocalTimeString(stats.startTime).getTime();
              totalTime += duration;

              // 简单判断：如果结束时间在未来，则为进行中
              if (parseLocalTimeString(stats.endTime).getTime() > Date.now()) {
                ongoingEvents++;
              } else {
                completedEvents++;
              }
            } catch {
              // ignore invalid time values
            }
          }
        });

        const completionRate = eventStats.length > 0 
          ? (completedEvents / eventStats.length) * 100 
          : 0;

        setStats({
          totalTime,
          plannedTime: totalTime, // TODO: 从Plan获取计划时长
          actualTime: totalTime,  // TODO: 从TimeLog获取实际时长
          completedEvents,
          ongoingEvents,
          completionRate
        });
      } catch (error) {
        console.error('[TodayStatsCard] Error loading stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();

    // 每分钟刷新一次
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, [timeRange]);  // 监听timeRange变化

  return (
    <DashboardCard
      title="今日统计"
      icon="📊"
      loading={loading}
      heightMode="compact"
    >
      <div className="today-stats-content">
        {/* 主要指标 */}
        <div className="today-stats-primary">
          <div className="stat-value-large">{formatDuration(stats.totalTime)}</div>
          <div className="stat-label">今日总时长</div>
        </div>

        {/* 次要指标 */}
        <div className="today-stats-secondary">
          <div className="stat-item">
            <div className="stat-value">{stats.completedEvents}</div>
            <div className="stat-label">已完成</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.ongoingEvents}</div>
            <div className="stat-label">进行中</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.completionRate.toFixed(0)}%</div>
            <div className="stat-label">完成率</div>
          </div>
        </div>

        {/* 进度条 */}
        <div className="today-stats-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
        </div>
      </div>
    </DashboardCard>
  );
};
