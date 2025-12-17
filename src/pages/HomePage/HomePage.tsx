import React, { useState } from 'react';
import { TimerCard } from '../../components/TimerCard';
import UpcomingEventsPanel from '../../components/UpcomingEventsPanel';
import { DashboardGridStack, GridItem } from './DashboardGridStack';
import { TodayStatsCard } from './TodayStatsCard';
import { FocusScoreCard } from './FocusScoreCard';
import { TimeDistributionCard } from './TimeDistributionCard';
import { TimeRangeSelector, TimeRange, TimeRangeType } from './TimeRangeSelector';
import { CalendarSidebar } from './CalendarSidebar';
import { CardConfigModal, CardConfig } from './CardConfigModal';
import { ComparisonCard } from './ComparisonCard';
import './HomePage.css';

/**
 * HomePage - 时间管理驾驶舱 v3.0
 * 
 * 新功能：
 * 1. Chrome风格时间范围选择器（支持对比模式）
 * 2. 日历侧边栏（可视化选择时间范围）
 * 3. 自定义Dashboard（添加/配置卡片）
 * 4. 对比统计卡片（今日 vs 昨日）
 * 5. 拖拽布局 + 自动保存
 */
export const HomePage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRangeType>('today');
  const [currentTimeRange, setCurrentTimeRange] = useState<TimeRange>({
    type: 'today',
    label: '今日',
    startDate: new Date(),
    endDate: new Date()
  });
  const [calendarSidebarOpen, setCalendarSidebarOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [customCards, setCustomCards] = useState<CardConfig[]>([]);

  // 处理时间范围变更
  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range.type);
    setCurrentTimeRange(range);
  };

  // 处理卡片添加
  const handleAddCard = (config: CardConfig) => {
    setCustomCards([...customCards, config]);
  };

  // 定义网格项目 - 24列网格（宽度x2，高度x2）
  const gridItems: GridItem[] = [
    {
      id: 'timer',
      component: <TimerCard />,
      defaultLayout: { x: 0, y: 0, w: 6, h: 10 }  // 3列2 = 6列, 5列2 = 10行
    },
    {
      id: 'today-stats',
      component: <TodayStatsCard timeRange={currentTimeRange} />,
      defaultLayout: { x: 6, y: 0, w: 6, h: 10 }
    },
    {
      id: 'focus-score',
      component: <FocusScoreCard timeRange={currentTimeRange} />,
      defaultLayout: { x: 12, y: 0, w: 6, h: 10 }
    },
    {
      id: 'upcoming',
      component: <UpcomingEventsPanel />,
      defaultLayout: { x: 0, y: 10, w: 6, h: 20 }  // 3列2 = 6, 10列2 = 20
    },
    {
      id: 'time-distribution',
      component: <TimeDistributionCard timeRange={currentTimeRange} />,
      defaultLayout: { x: 6, y: 10, w: 18, h: 20 }  // 9列2 = 18
    },
    {
      id: 'comparison',
      component: (
        <ComparisonCard
          title="今日对比"
          timeRange={currentTimeRange}
          dimension="duration"
        />
      ),
      defaultLayout: { x: 0, y: 30, w: 24, h: 12 }  // 12列2 = 24, 6列2 = 12
    }
  ];

  // 合并自定义卡片
  const customGridItems: GridItem[] = customCards.map((config, index) => ({
    id: config.id,
    component: (
      <ComparisonCard
        title={config.title}
        timeRange={currentTimeRange}
        dimension="duration"
      />
    ),
    defaultLayout: { x: (index % 2) * 6, y: 21 + Math.floor(index / 2) * 6, w: 6, h: 6 }
  }));

  const allItems = [...gridItems, ...customGridItems];

  return (
    <div className="homepage-container">
      {/* 顶部工具栏 */}
      <div className="homepage-toolbar">
        {/* 时间范围选择器 */}
        <TimeRangeSelector
          value={timeRange}
          onChange={handleTimeRangeChange}
          showComparison={true}
        />

        {/* 操作按钮 */}
        <div className="toolbar-actions">
          <button 
            className="toolbar-btn"
            onClick={() => setCalendarSidebarOpen(true)}
            title="打开日历"
          >
            📅 日历
          </button>
          <button 
            className="toolbar-btn primary"
            onClick={() => setConfigModalOpen(true)}
            title="添加卡片"
          >
            ➕ 添加卡片
          </button>
        </div>
      </div>

      {/* Gridstack网格布局 */}
      <DashboardGridStack 
        items={allItems}
        cellHeight={80}
        columns={12}
        gap={16}
        isDraggable={true}
        isResizable={true}
      />

      {/* 日历侧边栏 */}
      <CalendarSidebar
        isOpen={calendarSidebarOpen}
        onClose={() => setCalendarSidebarOpen(false)}
        onDateSelect={handleTimeRangeChange}
      />

      {/* 卡片配置弹窗 */}
      <CardConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSave={handleAddCard}
      />
    </div>
  );
};
