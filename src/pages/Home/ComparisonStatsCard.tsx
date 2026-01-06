import React, { useState, useEffect } from 'react';
import { DashboardCard } from './DashboardCard';
import { TimeRangeSelector, TimeRange, TimeRangeType } from './TimeRangeSelector';
import { EventService } from '@backend/EventService';
import { parseLocalTimeString } from '@frontend/utils/timeUtils';
import './ComparisonStatsCard.css';

interface ComparisonData {
  current: {
    totalTime: number;
    eventCount: number;
    avgDuration: number;
  };
  previous?: {
    totalTime: number;
    eventCount: number;
    avgDuration: number;
  };
  change?: {
    timePercent: number;
    countPercent: number;
    avgPercent: number;
  };
}

/**
 * ComparisonStatsCard - 对比统计卡片
 * 
 * 功能：
 * 1. 集成TimeRangeSelector胶囊风格时间选择
 * 2. 支持对比模式（今日 vs 昨日、本周 vs 上周等）
 * 3. 显示变化趋势（上升/下降百分比）
 * 4. 可视化对比图表
 */
export const ComparisonStatsCard: React.FC = () => {
  const [selectedRange, setSelectedRange] = useState<TimeRangeType>('today');
  const [currentRange, setCurrentRange] = useState<TimeRange | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
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

  // 加载统计数据
  useEffect(() => {
    if (!currentRange) return;

    const loadStats = async () => {
      setLoading(true);
      try {
        // 加载当前时期数据
        const currentData = await loadPeriodData(currentRange.startDate, currentRange.endDate);

        // 如果有对比时期，加载对比数据
        let previousData = null;
        let change = null;

        if (currentRange.compareWith) {
          previousData = await loadPeriodData(
            currentRange.compareWith.startDate,
            currentRange.compareWith.endDate
          );

          // 计算变化百分比
          change = {
            timePercent: calculateChange(currentData.totalTime, previousData.totalTime),
            countPercent: calculateChange(currentData.eventCount, previousData.eventCount),
            avgPercent: calculateChange(currentData.avgDuration, previousData.avgDuration)
          };
        }

        setComparisonData({
          current: currentData,
          previous: previousData || undefined,
          change: change || undefined
        });
      } catch (error) {
        console.error('[ComparisonStatsCard] Error loading stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [currentRange]);

  // 加载时期数据
  const loadPeriodData = async (startDate: Date, endDate: Date) => {
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const eventStats = await EventService.getEventTreeIndexByDateRange(
      formatDate(startDate),
      formatDate(endDate)
    );

    let totalTime = 0;
    let eventCount = eventStats.length;

    eventStats.forEach(stats => {
      if (stats.startTime && stats.endTime) {
        try {
          const duration =
            parseLocalTimeString(stats.endTime).getTime() -
            parseLocalTimeString(stats.startTime).getTime();
          totalTime += duration;
        } catch {
          // ignore invalid time values
        }
      }
    });

    const avgDuration = eventCount > 0 ? totalTime / eventCount : 0;

    return { totalTime, eventCount, avgDuration };
  };

  // 计算变化百分比
  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  // 获取变化指示器
  const getChangeIndicator = (percent: number) => {
    if (Math.abs(percent) < 1) {
      return { icon: '➡️', color: '#999', text: '持平' };
    } else if (percent > 0) {
      return { icon: '📈', color: '#52c41a', text: `+${percent.toFixed(1)}%` };
    } else {
      return { icon: '📉', color: '#ff4d4f', text: `${percent.toFixed(1)}%` };
    }
  };

  return (
    <DashboardCard
      title="统计对比"
      icon="📊"
      loading={loading}
      heightMode="auto"
    >
      <div className="comparison-stats-content">
        {/* 时间范围选择器 */}
        <TimeRangeSelector
          value={selectedRange}
          onChange={(range) => {
            setSelectedRange(range.type);
            setCurrentRange(range);
          }}
          showComparison={true}
        />

        {/* 统计数据展示 */}
        {comparisonData && (
          <div className="stats-comparison">
            {/* 总时长对比 */}
            <div className="stat-comparison-item">
              <div className="stat-label">总时长</div>
              <div className="stat-current">{formatDuration(comparisonData.current.totalTime)}</div>
              {comparisonData.previous && comparisonData.change && (
                <div className="stat-change" style={{ color: getChangeIndicator(comparisonData.change.timePercent).color }}>
                  <span className="change-icon">{getChangeIndicator(comparisonData.change.timePercent).icon}</span>
                  <span className="change-text">{getChangeIndicator(comparisonData.change.timePercent).text}</span>
                </div>
              )}
              {comparisonData.previous && (
                <div className="stat-previous">上期: {formatDuration(comparisonData.previous.totalTime)}</div>
              )}
            </div>

            {/* 事件数量对比 */}
            <div className="stat-comparison-item">
              <div className="stat-label">事件数量</div>
              <div className="stat-current">{comparisonData.current.eventCount}</div>
              {comparisonData.previous && comparisonData.change && (
                <div className="stat-change" style={{ color: getChangeIndicator(comparisonData.change.countPercent).color }}>
                  <span className="change-icon">{getChangeIndicator(comparisonData.change.countPercent).icon}</span>
                  <span className="change-text">{getChangeIndicator(comparisonData.change.countPercent).text}</span>
                </div>
              )}
              {comparisonData.previous && (
                <div className="stat-previous">上期: {comparisonData.previous.eventCount}</div>
              )}
            </div>

            {/* 平均时长对比 */}
            <div className="stat-comparison-item">
              <div className="stat-label">平均时长</div>
              <div className="stat-current">{formatDuration(comparisonData.current.avgDuration)}</div>
              {comparisonData.previous && comparisonData.change && (
                <div className="stat-change" style={{ color: getChangeIndicator(comparisonData.change.avgPercent).color }}>
                  <span className="change-icon">{getChangeIndicator(comparisonData.change.avgPercent).icon}</span>
                  <span className="change-text">{getChangeIndicator(comparisonData.change.avgPercent).text}</span>
                </div>
              )}
              {comparisonData.previous && (
                <div className="stat-previous">上期: {formatDuration(comparisonData.previous.avgDuration)}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardCard>
  );
};
