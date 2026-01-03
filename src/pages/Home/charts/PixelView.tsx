import React from 'react';
import './PixelView.css';

interface TrendData {
  date: string;
  duration: number;
  count: number;
}

interface PixelViewProps {
  data: TrendData[];
  dimension: 'tag' | 'calendar';
}

/**
 * PixelView - 像素热力图
 * 类似 GitHub contributions 的热力图展示
 */
export const PixelView: React.FC<PixelViewProps> = ({ data, dimension }) => {
  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  const getIntensity = (duration: number, maxDuration: number): string => {
    if (duration === 0) return 'level-0';
    const ratio = duration / maxDuration;
    if (ratio < 0.25) return 'level-1';
    if (ratio < 0.5) return 'level-2';
    if (ratio < 0.75) return 'level-3';
    return 'level-4';
  };

  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🎨</div>
        <p>暂无数据</p>
      </div>
    );
  }

  const maxDuration = Math.max(...data.map(d => d.duration), 1);

  // 按周组织数据
  const weeks: TrendData[][] = [];
  let currentWeek: TrendData[] = [];
  
  data.forEach((item, index) => {
    currentWeek.push(item);
    if (currentWeek.length === 7 || index === data.length - 1) {
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  });

  return (
    <div className="pixel-view">
      <h3 className="chart-title">
        <span>🎨</span> 活动热力图
      </h3>
      
      <div className="pixel-container">
        <div className="pixel-grid">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="pixel-week">
              {week.map((day) => (
                <div
                  key={day.date}
                  className={`pixel-day ${getIntensity(day.duration, maxDuration)}`}
                  title={`${day.date}: ${formatDuration(day.duration)} (${day.count}个事件)`}
                >
                  <span className="pixel-date">{formatDate(day.date)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 图例 */}
        <div className="pixel-legend">
          <span className="legend-label">活跃度：</span>
          <div className="legend-scale">
            <div className="legend-item level-0" title="无活动"></div>
            <div className="legend-item level-1" title="低"></div>
            <div className="legend-item level-2" title="中"></div>
            <div className="legend-item level-3" title="高"></div>
            <div className="legend-item level-4" title="很高"></div>
          </div>
        </div>
      </div>

      {/* 统计摘要 */}
      <div className="pixel-summary">
        <div className="summary-item">
          <span className="summary-label">总时长</span>
          <span className="summary-value">
            {formatDuration(data.reduce((sum, d) => sum + d.duration, 0))}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">总事件</span>
          <span className="summary-value">
            {data.reduce((sum, d) => sum + d.count, 0)} 个
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">平均每天</span>
          <span className="summary-value">
            {formatDuration(
              data.reduce((sum, d) => sum + d.duration, 0) / data.length
            )}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">最高</span>
          <span className="summary-value">
            {formatDuration(maxDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};
