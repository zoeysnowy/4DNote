import React, { useState } from 'react';
import './TimeRangeSelector.css';

export type TimeRangeType = 
  | 'today' 
  | 'yesterday' 
  | 'thisWeek' 
  | 'lastWeek' 
  | 'thisMonth' 
  | 'lastMonth' 
  | 'thisQuarter'
  | 'thisYear' 
  | 'lastYear' 
  | 'custom';

export interface TimeRange {
  type: TimeRangeType;
  label: string;
  startDate: Date;
  endDate: Date;
  compareWith?: {
    label: string;
    startDate: Date;
    endDate: Date;
  };
}

export interface TimeRangeSelectorProps {
  value: TimeRangeType;
  onChange: (range: TimeRange) => void;
  showComparison?: boolean;
  savedRanges?: Array<{ label: string; startDate: Date; endDate: Date }>;
}

interface RangeOption {
  value: TimeRangeType;
  label: string;
  icon: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: 'today', label: '今日', icon: '📅' },
  { value: 'yesterday', label: '昨天', icon: '⏮' },
  { value: 'thisWeek', label: '本周', icon: '📆' },
  { value: 'lastWeek', label: '上周', icon: '⏮' },
  { value: 'thisMonth', label: '本月', icon: '📊' },
  { value: 'lastMonth', label: '上月', icon: '⏮' },
  { value: 'thisQuarter', label: '本季度', icon: '📈' },
  { value: 'thisYear', label: '今年', icon: '🎯' },
  { value: 'lastYear', label: '去年', icon: '⏮' },
  { value: 'custom', label: '自定义', icon: '⚙️' }
];

/**
 * TimeRangeSelector - 时间范围选择器（胶囊风格）
 * 
 * 功能：
 * 1. 支持预设时间范围（今日/昨日、本周/上周、本月/上月等）
 * 2. 支持自定义时间范围（可保存记忆）
 * 3. 支持对比模式（今日 vs 昨日）
 * 4. 胶囊风格设计（来自 tab-design-test.html 方案一）
 */
export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  value,
  onChange,
  showComparison = true,
  savedRanges = []
}) => {
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // 计算时间范围
  const calculateRange = (type: TimeRangeType): TimeRange => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (type) {
      case 'today':
        return {
          type: 'today',
          label: '今日',
          startDate: today,
          endDate: new Date(today.getTime() + 86400000 - 1),
          compareWith: showComparison ? {
            label: 'vs 昨日',
            startDate: new Date(today.getTime() - 86400000),
            endDate: new Date(today.getTime() - 1)
          } : undefined
        };

      case 'yesterday':
        const yesterday = new Date(today.getTime() - 86400000);
        return {
          type: 'yesterday',
          label: '昨日',
          startDate: yesterday,
          endDate: new Date(today.getTime() - 1),
          compareWith: showComparison ? {
            label: 'vs 前日',
            startDate: new Date(yesterday.getTime() - 86400000),
            endDate: new Date(yesterday.getTime() - 1)
          } : undefined
        };

      case 'thisWeek':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // 周一
        return {
          type: 'thisWeek',
          label: '本周',
          startDate: weekStart,
          endDate: new Date(now),
          compareWith: showComparison ? {
            label: 'vs 上周',
            startDate: new Date(weekStart.getTime() - 7 * 86400000),
            endDate: new Date(weekStart.getTime() - 1)
          } : undefined
        };

      case 'lastWeek':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() + 1 - 7);
        const lastWeekEnd = new Date(lastWeekStart.getTime() + 7 * 86400000 - 1);
        return {
          type: 'lastWeek',
          label: '上周',
          startDate: lastWeekStart,
          endDate: lastWeekEnd,
          compareWith: showComparison ? {
            label: 'vs 前周',
            startDate: new Date(lastWeekStart.getTime() - 7 * 86400000),
            endDate: new Date(lastWeekStart.getTime() - 1)
          } : undefined
        };

      case 'thisMonth':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          type: 'thisMonth',
          label: '本月',
          startDate: monthStart,
          endDate: new Date(now),
          compareWith: showComparison ? {
            label: 'vs 上月',
            startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            endDate: new Date(monthStart.getTime() - 1)
          } : undefined
        };

      case 'lastMonth':
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return {
          type: 'lastMonth',
          label: '上月',
          startDate: lastMonthStart,
          endDate: lastMonthEnd,
          compareWith: showComparison ? {
            label: 'vs 前月',
            startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
            endDate: new Date(lastMonthStart.getTime() - 1)
          } : undefined
        };

      case 'thisQuarter':
        const quarter = Math.floor(now.getMonth() / 3);
        const quarterStart = new Date(now.getFullYear(), quarter * 3, 1);
        return {
          type: 'thisQuarter',
          label: '本季度',
          startDate: quarterStart,
          endDate: new Date(now),
          compareWith: showComparison ? {
            label: 'vs 上季度',
            startDate: new Date(now.getFullYear(), (quarter - 1) * 3, 1),
            endDate: new Date(quarterStart.getTime() - 1)
          } : undefined
        };

      case 'thisYear':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return {
          type: 'thisYear',
          label: '今年',
          startDate: yearStart,
          endDate: new Date(now),
          compareWith: showComparison ? {
            label: 'vs 去年',
            startDate: new Date(now.getFullYear() - 1, 0, 1),
            endDate: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
          } : undefined
        };

      case 'lastYear':
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
        return {
          type: 'lastYear',
          label: '去年',
          startDate: lastYearStart,
          endDate: lastYearEnd
        };

      default:
        return {
          type: 'today',
          label: '今日',
          startDate: today,
          endDate: new Date(today.getTime() + 86400000 - 1)
        };
    }
  };

  // 前进/后退时间范围
  const navigateRange = (type: TimeRangeType, direction: 'prev' | 'next') => {
    const now = new Date();
    const current = calculateRange(type);
    let newRange: TimeRange;

    switch (type) {
      case 'today':
        const offset = direction === 'prev' ? -1 : 1;
        const targetDate = new Date(current.startDate);
        targetDate.setDate(targetDate.getDate() + offset);
        newRange = {
          type: 'today',
          label: direction === 'prev' ? '昨天' : '明天',
          startDate: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
          endDate: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59)
        };
        break;

      case 'thisWeek':
        const weekOffset = direction === 'prev' ? -7 : 7;
        const targetWeekDate = new Date(current.startDate);
        targetWeekDate.setDate(targetWeekDate.getDate() + weekOffset);
        const weekStart = new Date(targetWeekDate);
        weekStart.setDate(targetWeekDate.getDate() - targetWeekDate.getDay() + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59);
        newRange = {
          type: 'thisWeek',
          label: direction === 'prev' ? '上周' : '下周',
          startDate: weekStart,
          endDate: weekEnd
        };
        break;

      case 'thisMonth':
        const targetMonth = new Date(current.startDate);
        if (direction === 'prev') {
          targetMonth.setMonth(targetMonth.getMonth() - 1);
        } else {
          targetMonth.setMonth(targetMonth.getMonth() + 1);
        }
        const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
        const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59);
        newRange = {
          type: 'thisMonth',
          label: direction === 'prev' ? '上月' : '下月',
          startDate: monthStart,
          endDate: monthEnd
        };
        break;

      case 'thisQuarter':
        const currentQuarter = Math.floor(current.startDate.getMonth() / 3);
        const targetQuarter = direction === 'prev' ? currentQuarter - 1 : currentQuarter + 1;
        let year = current.startDate.getFullYear();
        let quarter = targetQuarter;
        
        if (quarter < 0) { quarter = 3; year--; }
        if (quarter > 3) { quarter = 0; year++; }
        
        const quarterStart = new Date(year, quarter * 3, 1);
        const quarterEnd = new Date(year, quarter * 3 + 3, 0, 23, 59, 59);
        newRange = {
          type: 'thisQuarter',
          label: direction === 'prev' ? '上季度' : '下季度',
          startDate: quarterStart,
          endDate: quarterEnd
        };
        break;

      case 'thisYear':
        const targetYear = current.startDate.getFullYear() + (direction === 'prev' ? -1 : 1);
        const yearStart = new Date(targetYear, 0, 1);
        const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59);
        newRange = {
          type: 'thisYear',
          label: direction === 'prev' ? '去年' : '明年',
          startDate: yearStart,
          endDate: yearEnd
        };
        break;

      default:
        return;
    }

    onChange(newRange);
  };

  // 标签页配置
  const tabs: Array<{ type: TimeRangeType; label: string; icon?: string }> = [
    { type: 'today', label: '今日', icon: '📅' },
    { type: 'thisWeek', label: '本周', icon: '📊' },
    { type: 'thisMonth', label: '本月', icon: '📈' },
    { type: 'thisQuarter', label: '本季度', icon: '📉' },
    { type: 'thisYear', label: '今年', icon: '🎯' },
    { type: 'custom', label: '自定义', icon: '⚙️' }
  ];

  const handleTabClick = (type: TimeRangeType) => {
    if (type === 'custom') {
      setCustomModalOpen(true);
    } else {
      const range = calculateRange(type);
      onChange(range);
    }
  };

  const handleCustomSubmit = () => {
    if (customStart && customEnd) {
      const range: TimeRange = {
        type: 'custom',
        label: '自定义',
        startDate: new Date(customStart),
        endDate: new Date(customEnd)
      };
      onChange(range);
      setCustomModalOpen(false);
      
      // TODO: 保存到 savedRanges
    }
  };

  return (
    <div className="time-range-selector">
      {/* 对比模式开关 */}
      {showComparison && value !== 'custom' && (
        <div className="comparison-toggle">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={comparisonMode}
              onChange={(e) => setComparisonMode(e.target.checked)}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">对比模式</span>
          </label>
          {comparisonMode && calculateRange(value).compareWith && (
            <span className="comparison-hint">
              {calculateRange(value).label} vs {calculateRange(value).compareWith!.label}
            </span>
          )}
        </div>
      )}

      {/* 胶囊风格标签页（集成导航箭头）*/}
      <div className="capsule-container">
        {tabs.map(option => (
          <div key={option.type} className="capsule-wrapper">
            {/* 左箭头（后退）- 仅对非自定义按钮显示 */}
            {option.type !== 'custom' && (
              <button
                className="nav-arrow nav-prev"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateRange(option.type, 'prev');
                }}
                title={`前一${option.label.slice(1)}`}
              >
                ‹
              </button>
            )}
            
            {/* 主按钮 */}
            <button
              className={`capsule-tab ${value === option.type ? 'active' : ''} ${option.type === 'custom' ? 'no-arrows' : ''}`}
              onClick={() => handleTabClick(option.type)}
            >
              <span className="tab-icon">{option.icon}</span>
              <span>{option.label}</span>
            </button>
            
            {/* 右箭头（前进）- 仅对非自定义按钮显示 */}
            {option.type !== 'custom' && (
              <button
                className="nav-arrow nav-next"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateRange(option.type, 'next');
                }}
                title={`后一${option.label.slice(1)}`}
              >
                ›
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 自定义范围弹窗 */}
      {customModalOpen && (
        <div className="custom-modal-overlay" onClick={() => setCustomModalOpen(false)}>
          <div className="custom-modal" onClick={e => e.stopPropagation()}>
            <h3>自定义时间范围</h3>
            <div className="date-inputs">
              <div className="input-group">
                <label>开始日期</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>结束日期</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setCustomModalOpen(false)}>
                取消
              </button>
              <button className="btn-submit" onClick={handleCustomSubmit}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
