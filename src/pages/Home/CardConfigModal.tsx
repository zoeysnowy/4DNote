import React, { useState } from 'react';
import { TimeRangeType } from './TimeRangeSelector';
import './CardConfigModal.css';

export type CardType = 
  | 'today-stats' 
  | 'focus-score' 
  | 'time-distribution'
  | 'comparison-chart'
  | 'tag-stats'
  | 'calendar-stats';

export type DataSource = 'all' | 'tag' | 'calendar';

export interface CardConfig {
  id: string;
  type: CardType;
  title: string;
  timeRange: TimeRangeType;
  dataSource: DataSource;
  sourceFilter?: string[]; // tag IDs or calendar IDs
  showComparison: boolean;
  comparisonDimension?: 'day' | 'week' | 'month' | 'year';
}

export interface CardConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: CardConfig) => void;
  editingCard?: CardConfig;
}

/**
 * CardConfigModal - 卡片配置弹窗
 * 
 * 功能：
 * 1. 选择卡片类型
 * 2. 设置时间范围
 * 3. 选择数据源（全部/标签/日历）
 * 4. 配置对比维度
 */
export const CardConfigModal: React.FC<CardConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingCard
}) => {
  const [config, setConfig] = useState<Partial<CardConfig>>(
    editingCard || {
      type: 'today-stats',
      title: '今日统计',
      timeRange: 'today',
      dataSource: 'all',
      showComparison: true
    }
  );

  const [availableTags] = useState<Array<{ id: string; name: string }>>([
    { id: 'work', name: '工作' },
    { id: 'study', name: '学习' },
    { id: 'health', name: '健康' },
    { id: 'life', name: '生活' }
  ]);

  const [availableCalendars] = useState<Array<{ id: string; name: string }>>([
    { id: 'cal1', name: '个人日历' },
    { id: 'cal2', name: '工作日历' },
    { id: 'cal3', name: 'Outlook日历' }
  ]);

  // 卡片类型选项
  const cardTypes: Array<{ type: CardType; label: string; icon: string; desc: string }> = [
    { type: 'today-stats', label: '今日统计', icon: '📊', desc: '显示今日总时长、完成率' },
    { type: 'focus-score', label: '专注力评分', icon: '🎯', desc: '显示专注力分数和等级' },
    { type: 'time-distribution', label: '时间分布', icon: '📈', desc: '按标签/日历显示分布' },
    { type: 'comparison-chart', label: '对比图表', icon: '📉', desc: '时间段对比分析' },
    { type: 'tag-stats', label: '标签统计', icon: '🏷️', desc: '按标签维度统计' },
    { type: 'calendar-stats', label: '日历统计', icon: '📅', desc: '按日历维度统计' }
  ];

  // 时间范围选项
  const timeRanges: Array<{ value: TimeRangeType; label: string }> = [
    { value: 'today', label: '今日' },
    { value: 'yesterday', label: '昨日' },
    { value: 'thisWeek', label: '本周' },
    { value: 'lastWeek', label: '上周' },
    { value: 'thisMonth', label: '本月' },
    { value: 'lastMonth', label: '上月' },
    { value: 'thisQuarter', label: '本季度' },
    { value: 'thisYear', label: '今年' },
    { value: 'lastYear', label: '去年' },
    { value: 'custom', label: '自定义' }
  ];

  const handleSave = () => {
    if (config.type && config.title && config.timeRange && config.dataSource) {
      onSave({
        id: editingCard?.id || `card-${Date.now()}`,
        type: config.type,
        title: config.title,
        timeRange: config.timeRange,
        dataSource: config.dataSource,
        sourceFilter: config.sourceFilter,
        showComparison: config.showComparison || false,
        comparisonDimension: config.comparisonDimension
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="card-config-modal-overlay" onClick={onClose}>
      <div className="card-config-modal" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="modal-header">
          <h2>{editingCard ? '编辑卡片' : '添加卡片'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 内容 */}
        <div className="modal-content">
          {/* 卡片类型 */}
          <div className="config-section">
            <label className="section-label">卡片类型</label>
            <div className="card-type-grid">
              {cardTypes.map(type => (
                <div
                  key={type.type}
                  className={`card-type-option ${config.type === type.type ? 'active' : ''}`}
                  onClick={() => setConfig({ ...config, type: type.type, title: type.label })}
                >
                  <div className="type-icon">{type.icon}</div>
                  <div className="type-label">{type.label}</div>
                  <div className="type-desc">{type.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 卡片标题 */}
          <div className="config-section">
            <label className="section-label">卡片标题</label>
            <input
              type="text"
              className="title-input"
              value={config.title || ''}
              onChange={e => setConfig({ ...config, title: e.target.value })}
              placeholder="输入卡片标题"
            />
          </div>

          {/* 时间范围 */}
          <div className="config-section">
            <label className="section-label">时间范围</label>
            <select
              className="select-input"
              value={config.timeRange || 'today'}
              onChange={e => setConfig({ ...config, timeRange: e.target.value as TimeRangeType })}
            >
              {timeRanges.map(range => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          {/* 数据源 */}
          <div className="config-section">
            <label className="section-label">数据源</label>
            <div className="data-source-tabs">
              <button
                className={`source-tab ${config.dataSource === 'all' ? 'active' : ''}`}
                onClick={() => setConfig({ ...config, dataSource: 'all', sourceFilter: undefined })}
              >
                全部
              </button>
              <button
                className={`source-tab ${config.dataSource === 'tag' ? 'active' : ''}`}
                onClick={() => setConfig({ ...config, dataSource: 'tag', sourceFilter: [] })}
              >
                标签
              </button>
              <button
                className={`source-tab ${config.dataSource === 'calendar' ? 'active' : ''}`}
                onClick={() => setConfig({ ...config, dataSource: 'calendar', sourceFilter: [] })}
              >
                日历
              </button>
            </div>

            {/* 标签选择 */}
            {config.dataSource === 'tag' && (
              <div className="filter-options">
                {availableTags.map(tag => (
                  <label key={tag.id} className="filter-option">
                    <input
                      type="checkbox"
                      checked={config.sourceFilter?.includes(tag.id) || false}
                      onChange={e => {
                        const current = config.sourceFilter || [];
                        const updated = e.target.checked
                          ? [...current, tag.id]
                          : current.filter(id => id !== tag.id);
                        setConfig({ ...config, sourceFilter: updated });
                      }}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
            )}

            {/* 日历选择 */}
            {config.dataSource === 'calendar' && (
              <div className="filter-options">
                {availableCalendars.map(cal => (
                  <label key={cal.id} className="filter-option">
                    <input
                      type="checkbox"
                      checked={config.sourceFilter?.includes(cal.id) || false}
                      onChange={e => {
                        const current = config.sourceFilter || [];
                        const updated = e.target.checked
                          ? [...current, cal.id]
                          : current.filter(id => id !== cal.id);
                        setConfig({ ...config, sourceFilter: updated });
                      }}
                    />
                    <span>{cal.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 对比选项 */}
          <div className="config-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.showComparison || false}
                onChange={e => setConfig({ ...config, showComparison: e.target.checked })}
              />
              <span>显示对比数据</span>
            </label>

            {config.showComparison && (
              <select
                className="select-input"
                value={config.comparisonDimension || 'day'}
                onChange={e => setConfig({ 
                  ...config, 
                  comparisonDimension: e.target.value as 'day' | 'week' | 'month' | 'year' 
                })}
              >
                <option value="day">按天对比</option>
                <option value="week">按周对比</option>
                <option value="month">按月对比</option>
                <option value="year">按年对比</option>
              </select>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="btn-save" onClick={handleSave}>
            {editingCard ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
};
