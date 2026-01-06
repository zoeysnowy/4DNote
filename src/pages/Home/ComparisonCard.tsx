import React, { useState, useEffect } from 'react';
import { DashboardCard } from './DashboardCard';
import { TimeRange } from './TimeRangeSelector';
import { EventService } from '@backend/EventService';
import { parseLocalTimeString } from '@frontend/utils/timeUtils';
import './ComparisonCard.css';

export interface ComparisonCardProps {
  title: string;
  timeRange: TimeRange;
  dimension?: 'duration' | 'count' | 'focusScore';
}

interface ComparisonData {
  current: {
    label: string;
    value: number;
    items: number;
  };
  compare?: {
    label: string;
    value: number;
    items: number;
  };
  change: {
    percentage: number;
    direction: 'up' | 'down' | 'same';
  };
}

/**
 * ComparisonCard - 对比统计卡片
 * 
 * 功能：
 * 1. 显示当前时间段的统计数据
 * 2. 与对比时间段进行对比（今日 vs 昨日）
 * 3. 显示变化趋势（百分比、箭头）
 * 4. 支持多种维度（时长/数量/专注力）
 */
export const ComparisonCard: React.FC<ComparisonCardProps> = ({
  title,
  timeRange,
  dimension = 'duration'
}) => {
  const [data, setData] = useState<ComparisonData>({
    current: { label: '', value: 0, items: 0 },
    change: { percentage: 0, direction: 'same' }
  });
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

  // 格式化数值
  const formatValue = (value: number): string => {
    switch (dimension) {
      case 'duration':
        return formatDuration(value);
      case 'count':
        return `${value}个`;
      case 'focusScore':
        return `${Math.round(value)}分`;
      default:
        return `${value}`;
    }
  };

  // 加载对比数据
  useEffect(() => {
    const loadComparisonData = async () => {
      setLoading(true);
      try {
        const getDurationMs = (stats: any): number => {
          if (!stats?.startTime || !stats?.endTime) return 0;
          try {
            return (
              parseLocalTimeString(stats.endTime).getTime() -
              parseLocalTimeString(stats.startTime).getTime()
            );
          } catch {
            return 0;
          }
        };

        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        // 加载当前时间段数据
        const currentStats = await EventService.getEventTreeIndexByDateRange(
          formatDate(timeRange.startDate),
          formatDate(timeRange.endDate)
        );

        let currentValue = 0;
        if (dimension === 'duration') {
          currentValue = currentStats.reduce((sum, stats) => {
            return sum + getDurationMs(stats);
          }, 0);
        } else if (dimension === 'count') {
          currentValue = currentStats.length;
        } else if (dimension === 'focusScore') {
          // 简化的专注力计算
          const avgDuration = currentStats.length > 0
            ? currentStats.reduce((sum, stats) => {
                return sum + getDurationMs(stats);
              }, 0) / currentStats.length / (1000 * 60)
            : 0;
          currentValue = Math.min(100, avgDuration * 0.5);
        }

        const result: ComparisonData = {
          current: {
            label: timeRange.label,
            value: currentValue,
            items: currentStats.length
          },
          change: { percentage: 0, direction: 'same' }
        };

        // 加载对比数据
        if (timeRange.compareWith) {
          const compareStats = await EventService.getEventTreeIndexByDateRange(
            formatDate(timeRange.compareWith.startDate),
            formatDate(timeRange.compareWith.endDate)
          );

          let compareValue = 0;
          if (dimension === 'duration') {
            compareValue = compareStats.reduce((sum, stats) => {
              return sum + getDurationMs(stats);
            }, 0);
          } else if (dimension === 'count') {
            compareValue = compareStats.length;
          } else if (dimension === 'focusScore') {
            const avgDuration = compareStats.length > 0
              ? compareStats.reduce((sum, stats) => {
                  return sum + getDurationMs(stats);
                }, 0) / compareStats.length / (1000 * 60)
              : 0;
            compareValue = Math.min(100, avgDuration * 0.5);
          }

          result.compare = {
            label: timeRange.compareWith.label,
            value: compareValue,
            items: compareStats.length
          };

          // 计算变化
          if (compareValue > 0) {
            const percentage = ((currentValue - compareValue) / compareValue) * 100;
            result.change = {
              percentage: Math.abs(percentage),
              direction: percentage > 0 ? 'up' : percentage < 0 ? 'down' : 'same'
            };
          }
        }

        setData(result);
      } catch (error) {
        console.error('[ComparisonCard] Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadComparisonData();
  }, [timeRange, dimension]);

  return (
    <DashboardCard
      title={title}
      icon="📊"
      loading={loading}
      heightMode="auto"
    >
      <div className="comparison-card-content">
        {/* 当前数据 */}
        <div className="comparison-section current">
          <div className="section-header">
            <span className="section-label">{data.current.label}</span>
            <span className="section-badge">当前</span>
          </div>
          <div className="section-value">{formatValue(data.current.value)}</div>
          <div className="section-meta">{data.current.items}个事件</div>
        </div>

        {/* 对比箭头和变化 */}
        {data.compare && (
          <>
            <div className="comparison-arrow">
              <div className={`arrow-indicator ${data.change.direction}`}>
                {data.change.direction === 'up' && '↑'}
                {data.change.direction === 'down' && '↓'}
                {data.change.direction === 'same' && '→'}
              </div>
              <div className={`change-percentage ${data.change.direction}`}>
                {data.change.percentage.toFixed(1)}%
              </div>
            </div>

            {/* 对比数据 */}
            <div className="comparison-section compare">
              <div className="section-header">
                <span className="section-label">{data.compare.label}</span>
                <span className="section-badge compare-badge">对比</span>
              </div>
              <div className="section-value">{formatValue(data.compare.value)}</div>
              <div className="section-meta">{data.compare.items}个事件</div>
            </div>
          </>
        )}

        {/* 进度条对比 */}
        {data.compare && (
          <div className="comparison-bars">
            <div className="bar-row">
              <div className="bar-label">当前</div>
              <div className="bar-container">
                <div 
                  className="bar-fill current"
                  style={{ 
                    width: `${Math.max(10, (data.current.value / Math.max(data.current.value, data.compare.value)) * 100)}%` 
                  }}
                />
              </div>
            </div>
            <div className="bar-row">
              <div className="bar-label">对比</div>
              <div className="bar-container">
                <div 
                  className="bar-fill compare"
                  style={{ 
                    width: `${Math.max(10, (data.compare.value / Math.max(data.current.value, data.compare.value)) * 100)}%` 
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardCard>
  );
};
