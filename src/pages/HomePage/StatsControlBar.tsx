import React, { useState } from 'react';
import './StatsControlBar.css';

export type StatsDimension = 'tag' | 'calendar';
export type StatsTimeRange = 'today' | 'week' | 'month' | 'custom';
export type StatsViewMode = 'pie' | 'line' | 'pixel';

interface StatsControlBarProps {
  dimension: StatsDimension;
  timeRange: StatsTimeRange;
  viewMode: StatsViewMode;
  onDimensionChange: (dimension: StatsDimension) => void;
  onTimeRangeChange: (timeRange: StatsTimeRange) => void;
  onViewModeChange: (viewMode: StatsViewMode) => void;
  onCustomRangeChange: (range: [Date, Date] | null) => void;
}

export const StatsControlBar: React.FC<StatsControlBarProps> = ({
  dimension,
  timeRange,
  viewMode,
  onDimensionChange,
  onTimeRangeChange,
  onViewModeChange,
  onCustomRangeChange
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onCustomRangeChange([new Date(customStart), new Date(customEnd)]);
      onTimeRangeChange('custom');
      setShowCustomPicker(false);
    }
  };

  return (
    <div className="stats-control-bar">
      {/* 维度选择 */}
      <div className="control-group">
        <label className="control-label">维度：</label>
        <div className="button-group">
          <button
            className={`control-btn ${dimension === 'tag' ? 'active' : ''}`}
            onClick={() => onDimensionChange('tag')}
          >
            🏷️ 标签
          </button>
          <button
            className={`control-btn ${dimension === 'calendar' ? 'active' : ''}`}
            onClick={() => onDimensionChange('calendar')}
          >
            📅 日历
          </button>
        </div>
      </div>

      {/* 时间范围选择 */}
      <div className="control-group">
        <label className="control-label">时间：</label>
        <div className="button-group">
          <button
            className={`control-btn ${timeRange === 'today' ? 'active' : ''}`}
            onClick={() => onTimeRangeChange('today')}
          >
            今天
          </button>
          <button
            className={`control-btn ${timeRange === 'week' ? 'active' : ''}`}
            onClick={() => onTimeRangeChange('week')}
          >
            近7天
          </button>
          <button
            className={`control-btn ${timeRange === 'month' ? 'active' : ''}`}
            onClick={() => onTimeRangeChange('month')}
          >
            近30天
          </button>
          <button
            className={`control-btn ${timeRange === 'custom' ? 'active' : ''}`}
            onClick={() => setShowCustomPicker(!showCustomPicker)}
          >
            自定义
          </button>
        </div>
      </div>

      {/* 视图模式选择 */}
      <div className="control-group">
        <label className="control-label">视图：</label>
        <div className="button-group">
          <button
            className={`control-btn ${viewMode === 'pie' ? 'active' : ''}`}
            onClick={() => onViewModeChange('pie')}
            title="饼图视图"
          >
            📊 饼图
          </button>
          <button
            className={`control-btn ${viewMode === 'line' ? 'active' : ''}`}
            onClick={() => onViewModeChange('line')}
            title="趋势图"
          >
            📈 趋势
          </button>
          <button
            className={`control-btn ${viewMode === 'pixel' ? 'active' : ''}`}
            onClick={() => onViewModeChange('pixel')}
            title="像素视图"
          >
            🎨 像素
          </button>
        </div>
      </div>

      {/* 自定义日期选择器 */}
      {showCustomPicker && (
        <div className="custom-date-picker">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="date-input"
          />
          <span>至</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="date-input"
          />
          <button onClick={handleCustomApply} className="apply-btn">
            应用
          </button>
          <button onClick={() => setShowCustomPicker(false)} className="cancel-btn">
            取消
          </button>
        </div>
      )}
    </div>
  );
};
