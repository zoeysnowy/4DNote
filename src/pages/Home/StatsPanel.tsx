import React, { useState, useEffect, useMemo } from 'react';
import { StatsControlBar, StatsDimension, StatsTimeRange } from './StatsControlBar';
import { PieChartView } from './charts/PieChartView';
import { LineChartView } from './charts/LineChartView';
import { PixelView } from './charts/PixelView';
import { EventService } from '../../services/EventService';
import { TagService } from '../../services/TagService';
import { getAvailableCalendarsForSettings } from '../../utils/calendarUtils';
import { parseLocalTimeString } from '../../utils/timeUtils';
import './StatsPanel.css';

/**
 * StatsPanel - 统计数据面板
 * 完整迁移自test-stats-full.html
 * 
 * 功能：
 * 1. 维度切换（标签/日历）
 * 2. 时间范围选择（今天/本周/本月/自定义）
 * 3. 视图切换（饼图/趋势图/像素图）
 * 4. 完整数据聚合和计算
 */
export const StatsPanel: React.FC = () => {
  const [dimension, setDimension] = useState<StatsDimension>('tag');
  const [timeRange, setTimeRange] = useState<StatsTimeRange>('week');
  const [customRange, setCustomRange] = useState<[Date, Date] | null>(null);
  const [viewMode, setViewMode] = useState<'pie' | 'line' | 'pixel'>('pie');
  const [loading, setLoading] = useState(false);
  const [eventStats, setEventStats] = useState<import('../../services/storage/types').EventStats[]>([]);
  const [availableCalendars, setAvailableCalendars] = useState<Array<{id: string, name: string, color: string}>>([]);

  // 计算事件时长（毫秒）- 从 EventStats 计算
  const getEventDuration = (stats: import('../../services/storage/types').EventStats): number => {
    if (!stats.startTime || !stats.endTime) return 0;
    try {
      return parseLocalTimeString(stats.endTime).getTime() - parseLocalTimeString(stats.startTime).getTime();
    } catch {
      return 0;
    }
  };

  // 计算日期范围
  const dateRange = useMemo((): [Date, Date] => {
    if (timeRange === 'custom' && customRange) {
      return customRange;
    }

    const end = new Date();
    const start = new Date();
    
    switch (timeRange) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        break;
    }
    
    return [start, end];
  }, [timeRange, customRange]);

  // 加载可用日历列表
  useEffect(() => {
    const loadCalendars = async () => {
      const calendars = await getAvailableCalendarsForSettings();
      setAvailableCalendars(calendars);
    };
    loadCalendars();
  }, []);

  // 异步加载事件数据 - 🚀 使用优化的 EventStats 查询
  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      const perfStart = performance.now();
      
      try {
        const [startDate, endDate] = dateRange;
        
        // 转换为YYYY-MM-DD格式（EventStats查询不需要时分秒）
        const formatDate = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const statsData = await EventService.getEventStatsByDateRange(
          formatDate(startDate),
          formatDate(endDate)
        );
        
        const duration = performance.now() - perfStart;
        console.log('[StatsPanel] 📊 Loaded EventStats:', {
          dateRange: [formatDate(startDate), formatDate(endDate)],
          count: statsData.length,
          duration: `${duration.toFixed(1)}ms`,
          improvement: `${((1082 / duration) * 100).toFixed(0)}% faster than before`
        });
        
        setEventStats(statsData);
      } catch (error) {
        console.error('[StatsPanel] Failed to load event stats:', error);
        setEventStats([]);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [dateRange]);

  // 获取统计数据（标签或日历）- 🚀 使用 EventStats
  const statsData = useMemo(() => {
    if (dimension === 'tag') {
      // === 标签统计 ===
      const tagStats = new Map<string, { duration: number; count: number; color: string }>();
      
      eventStats.forEach(stats => {
        const duration = getEventDuration(stats);
        
        if (stats.tags && stats.tags.length > 0) {
          stats.tags.forEach((tagId: string) => {
            const tag = TagService.getTagById(tagId);
            if (!tag) return;
            
            const tagStat = tagStats.get(tagId) || { duration: 0, count: 0, color: tag.color || '#999' };
            tagStat.duration += duration;
            tagStat.count += 1;
            tagStats.set(tagId, tagStat);
          });
        }
      });
      
      const result = Array.from(tagStats.entries()).map(([id, stats]) => {
        const tag = TagService.getTagById(id);
        return {
          id,
          name: tag?.name || '未知标签',
          duration: stats.duration,
          count: stats.count,
          color: stats.color
        };
      }).sort((a, b) => b.duration - a.duration);
      
      console.log('[StatsPanel] Tag stats:', result);
      return result;
      
    } else {
      // === 日历统计 ===
      const calendarStats = new Map<string, { duration: number; count: number; color: string; source: string }>();
      
      eventStats.forEach(stats => {
        const duration = getEventDuration(stats);
        
        // 统计calendarIds
        if (stats.calendarIds && stats.calendarIds.length > 0) {
          stats.calendarIds.forEach((calId: string) => {
            const calendar = availableCalendars.find(c => c.id === calId);
            
            const calStat = calendarStats.get(calId) || { 
              duration: 0, 
              count: 0, 
              color: calendar?.color || '#999',
              source: stats.source || 'calendar'
            };
            calStat.duration += duration;
            calStat.count += 1;
            calendarStats.set(calId, calStat);
          });
        }
        
        // 统计没有calendarIds但有source的事件
        if ((!stats.calendarIds || stats.calendarIds.length === 0) && stats.source) {
          const sourceKey = `source:${stats.source}`;
          const calStat = calendarStats.get(sourceKey) || { 
            duration: 0, 
            count: 0, 
            color: '#999',
            source: stats.source
          };
          calStat.duration += duration;
          calStat.count += 1;
          calendarStats.set(sourceKey, calStat);
        }
      });
      
      const result = Array.from(calendarStats.entries()).map(([id, stats]) => {
        const calendar = availableCalendars.find(c => c.id === id);
        let name: string;
        
        if (stats.source && stats.source !== 'calendar') {
          // 来源类型
          const sourceNames: Record<string, string> = {
            'outlook': 'Outlook 导入',
            'google': 'Google 导入',
            'icloud': 'iCloud 导入',
            'local': '本地创建'
          };
          name = sourceNames[stats.source] || `${stats.source} 导入`;
        } else {
          // 使用日历名称
          name = calendar?.name || (id.length > 20 ? `${id.substring(0, 20)}...` : id);
        }
        
        return {
          id,
          name,
          duration: stats.duration,
          count: stats.count,
          color: calendar?.color || stats.color,
          source: stats.source
        };
      }).sort((a, b) => b.duration - a.duration);
      
      console.log('[StatsPanel] Calendar stats:', result);
      return result;
    }
  }, [dimension, eventStats, availableCalendars]);

  // 获取趋势数据（按日统计）- 🚀 使用 EventStats
  const trendData = useMemo(() => {
    const [startDate, endDate] = dateRange;
    const dailyStats = new Map<string, { duration: number; count: number }>();
    
    eventStats.forEach(stats => {
      if (!stats.startTime) return;
      const date = stats.startTime.split(' ')[0]; // 获取YYYY-MM-DD部分
      const stat = dailyStats.get(date) || { duration: 0, count: 0 };
      stat.duration += getEventDuration(stats);
      stat.count += 1;
      dailyStats.set(date, stat);
    });
    
    // 填充缺失的日期
    const days: Array<{ date: string; duration: number; count: number }> = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const stats = dailyStats.get(dateStr) || { duration: 0, count: 0 };
      days.push({ date: dateStr, ...stats });
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }, [dateRange, eventStats]);

  return (
    <div className="stats-panel">
      <StatsControlBar
        dimension={dimension}
        timeRange={timeRange}
        viewMode={viewMode}
        onDimensionChange={setDimension}
        onTimeRangeChange={setTimeRange}
        onViewModeChange={setViewMode}
        onCustomRangeChange={setCustomRange}
      />
      
      <div className="stats-view-container">
        {loading ? (
          <div className="stats-loading">加载中...</div>
        ) : (
          <>
            {viewMode === 'pie' && (
              <PieChartView 
                data={statsData} 
                dimension={dimension}
              />
            )}
            {viewMode === 'line' && (
              <LineChartView 
                data={trendData}
                dimension={dimension}
              />
            )}
            {viewMode === 'pixel' && (
              <PixelView 
                data={trendData}
                dimension={dimension}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
