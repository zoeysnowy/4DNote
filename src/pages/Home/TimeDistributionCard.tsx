import React, { useState, useEffect } from 'react';
import { DashboardCard } from './DashboardCard';
import { EventService } from '@backend/EventService';
import { getAvailableCalendarsForSettings } from '@frontend/utils/calendarUtils';
import { TimeRange } from './TimeRangeSelector';
import { parseLocalTimeString } from '@frontend/utils/timeUtils';
import './TimeDistributionCard.css';

interface DistributionItem {
  name: string;
  value: number;    // 时长（毫秒）
  percentage: number;
  color: string;
}

interface TimeDistributionCardProps {
  timeRange?: TimeRange;
}

/**
 * TimeDistributionCard - 时间分布卡片
 * 
 * 显示今日时间在不同日历/标签中的分布
 * 默认按日历维度展示，支持切换到标签维度
 */
export const TimeDistributionCard: React.FC<TimeDistributionCardProps> = ({ timeRange }) => {
  const [dimension, setDimension] = useState<'calendar' | 'tag'>('calendar');
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 格式化时长
  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // 加载时间分布数据
  useEffect(() => {
    const loadDistribution = async () => {
      setLoading(true);
      try {
        const today = new Date();
        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const todayStr = formatDate(today);
        const eventStats = await EventService.getEventTreeIndexByDateRange(todayStr, todayStr);

        if (dimension === 'calendar') {
          // 按日历维度聚合
          const calendars = await getAvailableCalendarsForSettings();
          const calendarMap = new Map<string, { time: number; color: string; name: string }>();

          eventStats.forEach(stats => {
            if (stats.startTime && stats.endTime && stats.calendarIds && stats.calendarIds.length > 0) {
              let duration = 0;
              try {
                duration = parseLocalTimeString(stats.endTime).getTime() - parseLocalTimeString(stats.startTime).getTime();
              } catch {
                return;
              }
              const calendarId = stats.calendarIds[0]; // 取第一个日历
              
              const calendar = calendars.find(c => c.id === calendarId);
              const name = calendar?.name || calendarId.slice(0, 20);
              const color = calendar?.color || '#1890ff';

              if (calendarMap.has(calendarId)) {
                calendarMap.get(calendarId)!.time += duration;
              } else {
                calendarMap.set(calendarId, { time: duration, color, name });
              }
            }
          });

          // 转换为数组并计算百分比
          const totalTime = Array.from(calendarMap.values()).reduce((sum, item) => sum + item.time, 0);
          const items: DistributionItem[] = Array.from(calendarMap.entries())
            .map(([id, data]) => ({
              name: data.name,
              value: data.time,
              percentage: totalTime > 0 ? (data.time / totalTime) * 100 : 0,
              color: data.color
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5); // 只显示前5个

          setDistribution(items);
        } else {
          // 按标签维度聚合
          const tagMap = new Map<string, number>();
          const tagColors = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1'];

          eventStats.forEach(stats => {
            if (stats.startTime && stats.endTime && stats.tags && stats.tags.length > 0) {
              let duration = 0;
              try {
                duration = parseLocalTimeString(stats.endTime).getTime() - parseLocalTimeString(stats.startTime).getTime();
              } catch {
                return;
              }
              stats.tags.forEach(tag => {
                tagMap.set(tag, (tagMap.get(tag) || 0) + duration);
              });
            }
          });

          // 转换为数组并计算百分比
          const totalTime = Array.from(tagMap.values()).reduce((sum, time) => sum + time, 0);
          const items: DistributionItem[] = Array.from(tagMap.entries())
            .map(([tag, time], index) => ({
              name: tag,
              value: time,
              percentage: totalTime > 0 ? (time / totalTime) * 100 : 0,
              color: tagColors[index % tagColors.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5); // 只显示前5个

          setDistribution(items);
        }
      } catch (error) {
        console.error('[TimeDistributionCard] Error loading distribution:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDistribution();
  }, [dimension]);

  return (
    <DashboardCard
      title="时间分布"
      icon="📈"
      loading={loading}
      heightMode="auto"
      actions={
        <div className="dimension-switch">
          <button
            className={`switch-btn ${dimension === 'calendar' ? 'active' : ''}`}
            onClick={() => setDimension('calendar')}
          >
            日历
          </button>
          <button
            className={`switch-btn ${dimension === 'tag' ? 'active' : ''}`}
            onClick={() => setDimension('tag')}
          >
            标签
          </button>
        </div>
      }
    >
      <div className="time-distribution-content">
        {distribution.length === 0 ? (
          <div className="empty-state">暂无数据</div>
        ) : (
          <div className="distribution-list">
            {distribution.map((item, index) => (
              <div key={index} className="distribution-item">
                <div className="item-header">
                  <div className="item-info">
                    <span className="item-color" style={{ backgroundColor: item.color }}></span>
                    <span className="item-name">{item.name}</span>
                  </div>
                  <span className="item-value">{formatDuration(item.value)}</span>
                </div>
                <div className="item-progress">
                  <div 
                    className="progress-bar-fill" 
                    style={{ 
                      width: `${item.percentage}%`,
                      backgroundColor: item.color
                    }}
                  />
                </div>
                <div className="item-percentage">{item.percentage.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardCard>
  );
};
