# Homepage 统计 Dashboard 设计 PRD

> **版本**: v1.0  
> **创建时间**: 2025-12-15  
> **最后更新**: 2025-12-15  
> **状态**: 设计阶段  
> **依赖模块**: EventService, TagService, CalendarService, TimerCard, DailyStatsCard  
> **关联文档**:
> - [TimeVisual_PRD.md](./TimeVisual_PRD.md)
> - [PLANMANAGER_MODULE_PRD.md](./PLANMANAGER_MODULE_PRD.md)

---

## 📋 目录

- [1. 产品概述](#1-产品概述)
- [2. 页面布局设计](#2-页面布局设计)
- [3. 模块详细设计](#3-模块详细设计)
- [4. 交互设计](#4-交互设计)
- [5. 技术实现](#5-技术实现)
- [6. 实现路线图](#6-实现路线图)

---

## 1. 产品概述

### 1.1 设计目标

将 Homepage 打造为用户的**时间管理驾驶舱**，提供：
- 🎯 **快速计时**：一键开始专注工作
- 📊 **实时统计**：可视化展示时间使用情况
- 📅 **即将到来**：提醒近期重要事件
- 🔍 **多维分析**：支持标签、日历等维度切换

### 1.2 设计原则

- **信息层次清晰**：主次分明，聚焦核心功能
- **一屏展示**：关键信息无需滚动即可查看
- **快速操作**：减少点击次数，提升效率
- **灵活切换**：支持维度和时间范围的快速切换

---

## 2. 页面布局设计

### 2.1 整体布局（Grid 系统）

**核心思路**：左列为操作区（Timer + Upcoming），右列为数据区（Stats），功能分区清晰

```
┌─────────────────────────────────────────────────────────────────┐
│                         首页 - 时间管理驾驶舱                     │
└─────────────────────────────────────────────────────────────────┘
┌──────────────────────┬──────────────────────────────────────────┐
│  ① 快速计时卡片       │  ③ 统计 Dashboard (StatsPanel)           │
│  (TimerCard)         │                                          │
│  320px x 400px       │  ┌────────────────────────────────────┐  │
│                      │  │ 控制栏: [标签▼] [日历▼]            │  │
│  [选择标签]           │  │ [今天] [本周] [本月] [自定义]       │  │
│  [输入事件标题]       │  └────────────────────────────────────┘  │
│  [00:00:00]          │                                          │
│  [开始计时]           │  ┌────────────────────────────────────┐  │
│                      │  │  主视图区                           │  │
├──────────────────────┤  │  ┌──────┐                          │  │
│  ② 即将到来事件列表   │  │  │饼图  │  列表                    │  │
│  (UpcomingEventsPanel)│  │  └──────┘  ● 工作 8.5h           │  │
│  320px x auto        │  │            ● 学习 4.2h           │  │
│                      │  │            ● 娱乐 2.0h           │  │
│  [📅 即将到来的事件]  │  │                                    │  │
│  ┌────────────────┐  │  │  ─────────────────────────────    │  │
│  │ 📌 会议准备     │  │  │  趋势图/像素图/对比图              │  │
│  │ 📅 14:00       │  │  │                                    │  │
│  │ 🏷️ 工作         │  │  └────────────────────────────────────┘  │
│  └────────────────┘  │                                          │
│  ┌────────────────┐  │  Full Width x Full Height                │
│  │ 📌 项目评审     │  │  (占满右侧所有空间)                      │
│  │ ...            │  │                                          │
│  └────────────────┘  │                                          │
└──────────────────────┴──────────────────────────────────────────┘
```

### 2.2 CSS Grid 布局代码

```css
.homepage-container {
  display: grid;
  grid-template-columns: 320px 1fr;  /* 左列固定320px，右列自适应 */
  grid-template-rows: auto 1fr;      /* 第1行auto，第2行自适应 */
  gap: 20px;
  padding: 20px;
  height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
}

/* 左列：操作区 */
.timer-card { 
  grid-area: 1 / 1 / 2 / 2;  /* 第1行第1列 */
}

.upcoming-events { 
  grid-area: 2 / 1 / 3 / 2;  /* 第2行第1列 */
  overflow-y: auto;
}

/* 右列：数据区（跨2行，占满整个右侧） */
.stats-panel { 
  grid-area: 1 / 2 / 3 / 3;  /* 跨第1-2行，第2列 */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* 响应式断点 */
@media (max-width: 1200px) {
  /* 中等屏幕：改为单列，纵向排列 */
  .homepage-container {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
  }
  
  .timer-card { 
    grid-area: 1 / 1 / 2 / 2;
    max-width: 600px;
    justify-self: center;
  }
  
  .upcoming-events { 
    grid-area: 2 / 1 / 3 / 2;
    max-width: 600px;
    justify-self: center;
    max-height: 400px;
  }
  
  .stats-panel { 
    grid-area: 3 / 1 / 4 / 2;
  }
}

@media (max-width: 768px) {
  /* 小屏幕：减小边距和间距 */
  .homepage-container {
    padding: 12px;
    gap: 12px;
  }
}
```

---

## 3. 模块详细设计

### 3.1 快速计时卡片 (TimerCard) ✅ 已实现

**位置**：左列第1行，固定宽度 320px

**当前功能**：
- 显示当前计时状态
- 标签选择与标题输入
- 开始/暂停/停止/取消操作
- 开始时间编辑

**保持不变**：现有功能完整保留，宽度调整为320px以匹配UpcomingEventsPanel

---

### 3.2 即将到来事件列表 (UpcomingEventsPanel) ✅ 已实现

**位置**：左列第2行，固定宽度 320px（与TimerCard对齐）

**设计思路**：直接复用 `UpcomingEventsPanel` 组件

#### 3.2.1 组件复用方案

**方案**：直接复用 `<UpcomingEventsPanel />` 组件，无需修改

```tsx
// HomePage.tsx
import { TimerCard } from '../components/TimerCard';
import { UpcomingEventsPanel } from '../components/UpcomingEventsPanel';
import { StatsPanel } from './StatsPanel';

function HomePage() {
  return (
    <div className="homepage-container">
      {/* 左列：操作区 */}
      <div className="timer-card">
        <TimerCard />
      </div>
      
      <div className="upcoming-events">
        <UpcomingEventsPanel />
      </div>
      
      {/* 右列：数据区（跨2行） */}
      <div className="stats-panel">
        <StatsPanel />
      </div>
    </div>
  );
}
```

#### 3.2.2 布局优势

- **功能分区**：左侧操作（计时+事件），右侧分析（统计）
- **空间利用**：Stats Panel获得完整右侧垂直空间，可展示更多数据
- **视觉和谐**：TimerCard和UpcomingEventsPanel宽度接近，垂直对齐美观
- **数据优先**：统计面板占据最大面积，突出数据可视化

#### 3.2.3 样式调整

```css
/* 将TimerCard和UpcomingEventsPanel统一为320px宽 */
.homepage-container .timer-card {
  width: 320px;
}

.homepage-container .upcoming-events {
  width: 320px;
}

---

### 3.3 统计 Dashboard (StatsPanel) 🆕 核心模块

**位置**：底部，全宽 x 500px

#### 3.右列，跨2行占满整个右侧（最大化数据展示空间）

```tsx
<div className="stats-control-bar">
  {/* 左侧：维度选择 */}
  <div className="dimension-selector">
    <span className="label">统计维度:</span>
    <div className="btn-group">
      <button 
        className={`dimension-btn ${dimension === 'tags' ? 'active' : ''}`}
        onClick={() => setDimension('tags')}
      >
        🏷️ 标签
      </button>
      <button 
        className={`dimension-btn ${dimension === 'calendars' ? 'active' : ''}`}
        onClick={() => setDimension('calendars')}
      >
        📅 日历
      </button>
      <button 
        className={`dimension-btn ${dimension === 'projects' ? 'active' : ''}`}
        onClick={() => setDimension('projects')}
        disabled
      >
        📁 项目 <span className="badge">即将推出</span>
      </button>
    </div>
  </div>
  
  {/* 右侧：时间范围选择 */}
  <div className="timerange-selector">
    <span className="label">时间范围:</span>
    <div className="btn-group">
      <button 
        className={`timerange-btn ${timeRange === 'today' ? 'active' : ''}`}
        onClick={() => setTimeRange('today')}
      >
        今天
      </button>
      <button 
        className={`timerange-btn ${timeRange === 'week' ? 'active' : ''}`}
        onClick={() => setTimeRange('week')}
      >
        本周
      </button>
      <button 
        className={`timerange-btn ${timeRange === 'month' ? 'active' : ''}`}
        onClick={() => setTimeRange('month')}
      >
        本月
      </button>
      <button 
        className={`timerange-btn ${timeRange === 'custom' ? 'active' : ''}`}
        onClick={() => setTimeRange('custom')}
      >
        自定义
      </button>
    </div>
    
    {/* 自定义日期选择器（仅在选择"自定义"时显示） */}
    {timeRange === 'custom' && (
      <div className="date-picker-wrapper">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span>至</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>
    )}
  </div>
</div>
```

**样式规范**：
```css
.stats-control-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px;
  background: white;
  border-radius: 20px 20px 0 0;
  border-bottom: 1px solid #e5e7eb;
}

.dimension-selector,
.timerange-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
}

.btn-group {
  display: flex;
  gap: 8px;
}

.dimension-btn,
.timerange-btn {
  padding: 8px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: white;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dimension-btn:hover,
.timerange-btn:hover {
  border-color: #667eea;
  color: #667eea;
  background: #f5f7ff;
}

.dimension-btn.active,
.timerange-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.dimension-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

.date-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}

.date-picker-wrapper input[type="date"] {
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
}
```

---

#### 3.3.2 主视图区设计

**布局方案**：根据维度和时间范围动态切换视图

##### 方案 A：标签/日历统计视图 (dimension = 'tags' | 'calendars')

```tsx
<div className="stats-main-view">
  {/* 左侧：饼图 + 总览 */}
  <div className="chart-section">
    {/* 总览数据 */}
    <div className="stats-summary">
      <div className="summary-item">
        <div className="summary-value">{totalDuration}</div>
        <div className="summary-label">总时长</div>
      </div>
      <div className="summary-item">
        <div className="summary-value">{totalEvents}</div>
        <div className="summary-label">事件数</div>
      </div>
      <div className="summary-item">
        <div className="summary-value">{categoryCount}</div>
        <div className="summary-label">{dimension === 'tags' ? '标签数' : '日历数'}</div>
      </div>
    </div>
    
    {/* 饼图 */}
    <div className="pie-chart-container">
      <svg width="240" height="240" id="statsChart"></svg>
    </div>
  </div>
  
  {/* 右侧：详细列表 */}
  <div className="list-section">
    <div className="list-header">
      <span>排名</span>
      <span>{dimension === 'tags' ? '标签' : '日历'}</span>
      <span>时长</span>
      <span>事件数</span>
      <span>占比</span>
    </div>
    
    <div className="list-items">
      {statsData.map((item, index) => (
        <div key={item.id} className="list-item">
          <span className="rank">#{index + 1}</span>
          <div className="item-name">
            <span className="color-dot" style={{ background: item.color }}></span>
            {item.emoji && <span className="emoji">{item.emoji}</span>}
            <span>{item.name}</span>
          </div>
          <span className="duration">{formatDuration(item.duration)}</span>
          <span className="count">{item.count}</span>
          <div className="percentage-bar">
            <div 
              className="percentage-fill" 
              style={{ width: `${item.percentage}%` }}
            ></div>
            <span className="percentage-text">{item.percentage.toFixed(1)}%</span>
          </div>
        </div>
      ))}
    </div>
  </div>
</div>
```

**样式**：
```css
.stats-main-view {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 24px;
  padding: 24px;
  background: white;
  border-radius: 0 0 20px 20px;
  min-height: 400px;
}

.chart-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.stats-summary {
  display: flex;
  gap: 16px;
  width: 100%;
}

.summary-item {
  flex: 1;
  text-align: center;
  padding: 16px;
  background: #f9fafb;
  border-radius: 12px;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 4px;
}

.summary-label {
  font-size: 12px;
  color: #6b7280;
}

.pie-chart-container {
  position: relative;
  width: 240px;
  height: 240px;
}

.list-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-header {
  display: grid;
  grid-template-columns: 50px 1fr 100px 80px 150px;
  gap: 12px;
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
}

.list-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 8px;
}

.list-item {
  display: grid;
  grid-template-columns: 50px 1fr 100px 80px 150px;
  gap: 12px;
  padding: 12px 16px;
  background: #fafbfc;
  border-radius: 10px;
  align-items: center;
  transition: all 0.2s;
}

.list-item:hover {
  background: #f3f4f6;
  transform: translateX(4px);
}

.rank {
  font-size: 14px;
  font-weight: 600;
  color: #9ca3af;
}

.item-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #1f2937;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.emoji {
  font-size: 16px;
}

.duration,
.count {
  font-size: 14px;
  font-weight: 600;
  color: #667eea;
}

.percentage-bar {
  position: relative;
  width: 100%;
  height: 24px;
  background: #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
}

.percentage-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.6s ease;
}

.percentage-text {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 600;
  color: #374151;
}
```

---

##### 方案 B：趋势视图 (timeRange = 'week' | 'month')

当时间范围选择"本周"或"本月"时，自动切换到趋势视图：

```tsx
<div className="stats-main-view trend-view">
  {/* 顶部：视图切换器 */}
  <div className="view-switcher">
    <button 
      className={`view-btn ${viewType === 'line' ? 'active' : ''}`}
      onClick={() => setViewType('line')}
    >
      📈 折线图
    </button>
    <button 
      className={`view-btn ${viewType === 'bar' ? 'active' : ''}`}
      onClick={() => setViewType('bar')}
    >
      📊 柱状图
    </button>
    <button 
      className={`view-btn ${viewType === 'pixels' ? 'active' : ''}`}
      onClick={() => setViewType('pixels')}
    >
      🎨 像素块
    </button>
  </div>
  
  {/* 图表区域 */}
  <div className="trend-chart-container">
    {viewType === 'line' && <LineChart data={trendData} />}
    {viewType === 'bar' && <BarChart data={trendData} />}
    {viewType === 'pixels' && <PixelView data={trendData} />}
  </div>
  
  {/* 底部：统计摘要 */}
  <div className="trend-summary">
    <div className="summary-stat">
      <span className="stat-label">平均每天:</span>
      <span className="stat-value">{avgDuration}</span>
    </div>
    <div className="summary-stat">
      <span className="stat-label">最高峰:</span>
      <span className="stat-value">{peakDuration} ({peakDate})</span>
    </div>
    <div className="summary-stat">
      <span className="stat-label">总计:</span>
      <span className="stat-value">{totalDuration}</span>
    </div>
  </div>
</div>
```

---

##### 方案 C：多维度同时展示 (高级模式) 🔮 未来功能

支持同时选择多个维度（如"标签 + 日历"），并排展示：

```
┌────────────────┬────────────────┐
│  标签统计       │  日历统计       │
│  [饼图+列表]    │  [饼图+列表]    │
└────────────────┴────────────────┘
```

---

## 4. 交互设计

### 4.1 维度切换交互

**触发方式**：点击"维度选择"按钮

**交互流程**：
1. 用户点击"🏷️ 标签"或"📅 日历"
2. 按钮状态切换（active 样式）
3. 主视图区淡出（300ms fade-out）
4. 加载新数据
5. 主视图区淡入（300ms fade-in）
6. 更新饼图和列表

**状态管理**：
```tsx
const [dimension, setDimension] = useState<'tags' | 'calendars' | 'projects'>('tags');
const [isLoading, setIsLoading] = useState(false);

const handleDimensionChange = async (newDimension) => {
  setIsLoading(true);
  setDimension(newDimension);
  
  // 加载新数据
  const data = await loadStatsData(newDimension, timeRange);
  setStatsData(data);
  
  setIsLoading(false);
};
```

---

### 4.2 时间范围切换交互

**触发方式**：点击时间范围按钮或选择自定义日期

**交互流程**：
1. 用户点击"今天"/"本周"/"本月"/"自定义"
2. 按钮状态切换
3. 如果选择"自定义"，显示日期选择器
4. 重新加载数据
5. 更新图表

**智能视图切换**：
- **今天**：默认显示饼图 + 列表
- **本周/本月**：自动切换到趋势视图（折线图）
- **自定义**：根据日期跨度决定（≤7天显示饼图，>7天显示趋势图）

---

### 4.3 悬停交互

#### 饼图悬停
- 高亮当前扇区（opacity: 1）
- 其他扇区变暗（opacity: 0.6）
- 显示 Tooltip（名称、时长、百分比）

#### 列表项悬停
- 背景色变化
- 轻微右移（translateX: 4px）
- 显示快速操作按钮（查看详情、筛选等）

---

### 4.4 点击操作

#### 列表项点击
- **功能**：打开该标签/日历的详细统计页面
- **实现**：跳转到独立的详情 Modal 或侧边面板

#### 饼图扇区点击
- **功能**：聚焦该分类，只显示该分类的事件
- **实现**：
  1. 高亮选中扇区
  2. 列表过滤只显示该分类
  3. 底部显示"清除筛选"按钮

---

## 5. 技术实现

### 5.1 组件结构

```
HomePage
├── TimerCard (已实现)
├── UpcomingEventsPanel (简化版)
│   ├── EventCard (紧凑模式)
│   └── ViewMoreButton
└── StatsPanel (新增)
    ├── StatsControlBar
    │   ├── DimensionSelector
    │   └── TimeRangeSelector
    └── StatsMainView
        ├── ChartSection
        │   ├── StatsSummary
        │   └── PieChart / LineChart / PixelView
        └── ListSection
            ├── ListHeader
            └── ListItems
```

### 5.2 数据流

```typescript
// 1. 数据加载
const loadStatsData = async (dimension: string, timeRange: TimeRange) => {
  // 获取事件数据
  const events = await EventService.getTimelineEvents({
    startDate: getStartDate(timeRange),
    endDate: getEndDate(timeRange),
  });
  
  // 根据维度统计
  if (dimension === 'tags') {
    return calculateTagStats(events);
  } else if (dimension === 'calendars') {
    return calculateCalendarStats(events);
  }
};

// 2. 标签统计（复用 test-stats-full.html 的逻辑）
const calculateTagStats = (events: Event[]): TagStats[] => {
  const tagStatsMap = new Map();
  
  events.forEach(event => {
    const duration = getEventDuration(event);
    
    if (event.tags && event.tags.length > 0) {
      event.tags.forEach(tagId => {
        if (!tagStatsMap.has(tagId)) {
          tagStatsMap.set(tagId, {
            duration: 0,
            count: 0,
            events: []
          });
        }
        const stats = tagStatsMap.get(tagId);
        stats.duration += duration;
        stats.count += 1;
        stats.events.push(event.id);
      });
    }
  });
  
  // 转换为数组并排序
  return Array.from(tagStatsMap.entries())
    .map(([tagId, stats]) => {
      const tag = TagService.getTagById(tagId);
      return {
        id: tagId,
        name: tag?.name || tagId,
        emoji: tag?.emoji,
        color: tag?.color || '#999',
        duration: stats.duration,
        count: stats.count,
        percentage: 0 // 后续计算
      };
    })
    .sort((a, b) => b.duration - a.duration);
};

// 3. 日历统计（复用 test-stats-full.html 的逻辑）
const calculateCalendarStats = (events: Event[]): CalendarStats[] => {
  // 类似标签统计，但基于 calendarIds
  // ...
};

// 4. 趋势数据（按天分组）
const calculateTrendData = (events: Event[]): DailyStats[] => {
  const dailyMap = new Map();
  
  events.forEach(event => {
    const dateKey = event.startTime?.substring(0, 10); // YYYY-MM-DD
    if (!dateKey) return;
    
    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        duration: 0,
        count: 0
      });
    }
    
    const dayStats = dailyMap.get(dateKey);
    dayStats.duration += getEventDuration(event);
    dayStats.count += 1;
  });
  
  return Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date));
};
```

### 5.3 状态管理

```typescript
interface StatsState {
  dimension: 'tags' | 'calendars' | 'projects';
  timeRange: 'today' | 'week' | 'month' | 'custom';
  startDate?: string; // 自定义开始日期
  endDate?: string;   // 自定义结束日期
  viewType: 'line' | 'bar' | 'pixels'; // 趋势视图类型
  statsData: TagStats[] | CalendarStats[];
  trendData: DailyStats[];
  isLoading: boolean;
}

const [state, setState] = useState<StatsState>({
  dimension: 'tags',
  timeRange: 'today',
  viewType: 'line',
  statsData: [],
  trendData: [],
  isLoading: false,
});
```

### 5.4 图表复用

**直接复用 test-stats-full.html 的实现**：
- `renderPieChart()` - 饼图渲染（带圆角间隙）
- `createRoundedArcPath()` - SVG 路径生成
- `renderLineChart()` - 折线图
- `renderPixelView()` - 像素块视图

**迁移步骤**：
1. 提取图表函数到独立工具文件 `src/utils/chartUtils.ts`
2. 转换为 React 组件
3. 添加 TypeScript 类型定义

---

## 6. 实现路线图

### Phase 1: 基础布局与静态数据 (Week 1)

**任务**：
- [ ] 创建 `HomePage.tsx` 组件结构
- [ ] 实现 Grid 布局系统
- [ ] 复用并调整 `UpcomingEventsPanel` 为紧凑模式
- [ ] 创建 `StatsPanel` 骨架组件
- [ ] 使用静态数据测试布局

**验收标准**：
- 三个模块正确布局
- 响应式断点生效
- TimerCard 与 UpcomingEvents 正常显示

---

### Phase 2: 控制栏与维度切换 (Week 2)

**任务**：
- [ ] 实现 `StatsControlBar` 组件
- [ ] 维度选择器（标签/日历）
- [ ] 时间范围选择器（今天/本周/本月/自定义）
- [ ] 状态管理与数据加载逻辑
- [ ] 切换动画效果

**验收标准**：
- 点击维度按钮能切换状态
- 时间范围切换触发数据重载
- 自定义日期选择器正常工作

---

### Phase 3: 饼图 + 列表视图 (Week 3)

**任务**：
- [ ] 迁移 `renderPieChart()` 为 React 组件
- [ ] 实现 `ChartSection` (饼图 + 总览)
- [ ] 实现 `ListSection` (排名列表)
- [ ] 集成真实数据（EventService、TagService）
- [ ] 悬停、点击交互

**验收标准**：
- 饼图正确渲染（圆角、间隙、渐变）
- 列表显示 Top 10 统计
- Tooltip 悬停显示详细信息
- 点击列表项能聚焦分类

---

### Phase 4: 趋势视图 (Week 4)

**任务**：
- [ ] 迁移 `renderLineChart()` 为 React 组件
- [ ] 迁移 `renderPixelView()` 为 React 组件
- [ ] 实现视图切换器（折线图/柱状图/像素块）
- [ ] 智能视图切换逻辑
- [ ] 趋势统计摘要

**验收标准**：
- 折线图展示时间趋势
- 像素块显示15分钟粒度
- 自动在饼图和趋势图间切换

---

### Phase 5: 性能优化与打磨 (Week 5)

**任务**：
- [ ] 数据缓存机制（避免重复加载）
- [ ] 图表渲染优化（虚拟化、懒加载）
- [ ] 动画性能优化
- [ ] 错误处理与空状态
- [ ] 单元测试

**验收标准**：
- 大数据量（1000+事件）流畅渲染
- 切换维度/时间范围响应时间 < 500ms
- 无内存泄漏

---

### Phase 6: 可自定义布局 🎨 (Week 6-7)

**设计目标**：让用户自由拖拽、调整、添加/删除模块，打造个性化的Dashboard

#### 6.1 技术方案：React Grid Layout

**推荐库**：`react-grid-layout` + `react-resizable`

**核心特性**：
- ✅ 拖拽排序
- ✅ 调整大小
- ✅ 响应式布局
- ✅ 保存布局配置
- ✅ 重置为默认布局

**安装**：
```bash
npm install react-grid-layout react-resizable
```

#### 6.2 可用模块列表

用户可以从模块库中添加/删除以下模块：

| 模块名称 | 默认尺寸 | 功能描述 |
|---------|---------|---------|
| 🎯 快速计时 | 280x400px | TimerCard（必选，不可删除） |
| 📅 即将到来 | 1fr x 400px | UpcomingEventsPanel |
| 📊 统计面板 | Full Width x 500px | StatsPanel |
| 📈 趋势图表 | 600x300px | 独立的趋势图（折线/柱状） |
| 🥧 分类饼图 | 400x400px | 独立的饼图视图 |
| 📝 快速笔记 | 400x300px | 快速创建笔记的输入框 |
| 🔖 常用标签 | 300x200px | 快速访问常用标签 |
| 🎯 今日目标 | 400x300px | 今日待办事项 |
| 📆 月历视图 | 500x400px | 迷你日历 |
| ⏱️ 专注统计 | 300x250px | Pomodoro统计 |
| 🎁 回忆彩蛋 | 450x350px | 历史上的今天（30/60/90天前） |

#### 6.3 布局配置数据结构

```typescript
interface LayoutConfig {
  id: string;
  layouts: {
    lg: Layout[];  // 大屏布局
    md: Layout[];  // 中屏布局
    sm: Layout[];  // 小屏布局
  };
  modules: {
    [key: string]: {
      enabled: boolean;
      config?: any; // 模块特定配置
    };
  };
}

interface Layout {
  i: string;           // 模块ID
  x: number;           // X坐标（网格单位）
  y: number;           // Y坐标（网格单位）
  w: number;           // 宽度（网格单位）
  h: number;           // 高度（网格单位）
  minW?: number;       // 最小宽度
  minH?: number;       // 最小高度
  static?: boolean;    // 是否固定（不可拖拽）
}

// 默认布局配置
const defaultLayoutConfig: LayoutConfig = {
  id: 'default',
  layouts: {
    lg: [
      { i: 'timer', x: 0, y: 0, w: 3, h: 4, minW: 3, minH: 4, static: true },
      { i: 'upcoming', x: 3, y: 0, w: 9, h: 4, minW: 6, minH: 4 },
      { i: 'stats', x: 0, y: 4, w: 12, h: 5, minW: 12, minH: 5 }
    ],
    md: [
      { i: 'timer', x: 0, y: 0, w: 3, h: 4, static: true },
      { i: 'upcoming', x: 3, y: 0, w: 6, h: 4 },
      { i: 'stats', x: 0, y: 4, w: 9, h: 5 }
    ],
    sm: [
      { i: 'timer', x: 0, y: 0, w: 6, h: 4 },
      { i: 'upcoming', x: 0, y: 4, w: 6, h: 4 },
      { i: 'stats', x: 0, y: 8, w: 6, h: 5 }
    ]
  },
  modules: {
    timer: { enabled: true },
    upcoming: { enabled: true },
    stats: { enabled: true }
  }
};
```

#### 6.4 布局编辑模式

**UI设计**：

```tsx
<div className="homepage-container">
  {/* 顶部工具栏（仅在编辑模式显示） */}
  {isEditMode && (
    <div className="layout-toolbar">
      <button onClick={toggleEditMode} className="btn-exit-edit">
        ✅ 完成编辑
      </button>
      <button onClick={openModuleLibrary} className="btn-add-module">
        ➕ 添加模块
      </button>
      <button onClick={resetLayout} className="btn-reset">
        🔄 重置布局
      </button>
      <button onClick={saveLayout} className="btn-save">
        💾 保存布局
      </button>
    </div>
  )}
  
  {/* React Grid Layout */}
  <GridLayout
    className="layout"
    layout={currentLayout}
    cols={{ lg: 12, md: 9, sm: 6 }}
    rowHeight={100}
    width={1200}
    isDraggable={isEditMode}
    isResizable={isEditMode}
    onLayoutChange={handleLayoutChange}
  >
    {enabledModules.map(module => (
      <div key={module.id} className="grid-item">
        {isEditMode && (
          <div className="module-controls">
            <button 
              className="btn-remove-module"
              onClick={() => removeModule(module.id)}
            >
              ❌
            </button>
            <div className="drag-handle">⋮⋮</div>
          </div>
        )}
        <ModuleRenderer moduleId={module.id} config={module.config} />
      </div>
    ))}
  </GridLayout>
  
  {/* 右下角编辑按钮（非编辑模式） */}
  {!isEditMode && (
    <button 
      className="btn-edit-layout floating"
      onClick={toggleEditMode}
    >
      ⚙️ 自定义布局
    </button>
  )}
</div>
```

**样式**：
```css
.layout-toolbar {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.grid-item {
  position: relative;
  background: white;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.grid-item:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

/* 编辑模式下的虚线边框 */
.layout.edit-mode .grid-item {
  border: 2px dashed #667eea;
}

.module-controls {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  display: flex;
  gap: 8px;
}

.drag-handle {
  cursor: move;
  padding: 4px 8px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 6px;
  color: #667eea;
  font-size: 16px;
}

.btn-edit-layout.floating {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 50px;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  cursor: pointer;
  transition: all 0.3s;
  z-index: 1000;
}

.btn-edit-layout.floating:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.5);
}
```

#### 6.5 模块库（Module Library）

**弹出式选择界面**：

```tsx
<Modal isOpen={showModuleLibrary} onClose={closeModuleLibrary}>
  <div className="module-library">
    <h2>📦 模块库</h2>
    <p className="subtitle">选择要添加到首页的模块</p>
    
    <div className="module-grid">
      {availableModules.map(module => (
        <div 
          key={module.id} 
          className={`module-card ${isModuleEnabled(module.id) ? 'enabled' : ''}`}
        >
          <div className="module-icon">{module.icon}</div>
          <h3>{module.name}</h3>
          <p>{module.description}</p>
          <div className="module-meta">
            <span>尺寸: {module.defaultSize}</span>
          </div>
          
          {isModuleEnabled(module.id) ? (
            <button 
              className="btn-remove"
              onClick={() => removeModule(module.id)}
            >
              ✓ 已添加
            </button>
          ) : (
            <button 
              className="btn-add"
              onClick={() => addModule(module.id)}
            >
              ➕ 添加
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
</Modal>
```

#### 6.6 布局持久化

**保存到本地存储**：
```typescript
// 保存布局
const saveLayout = async (config: LayoutConfig) => {
  await PersistentStorage.setItem(
    'homepage_layout_config',
    JSON.stringify(config),
    PERSISTENT_OPTIONS
  );
  
  console.log('✅ 布局已保存');
};

// 加载布局
const loadLayout = async (): Promise<LayoutConfig> => {
  const saved = await PersistentStorage.getItem('homepage_layout_config');
  
  if (saved) {
    return JSON.parse(saved);
  }
  
  return defaultLayoutConfig;
};

// 重置为默认布局
const resetLayout = async () => {
  const confirm = window.confirm('确定要重置为默认布局吗？');
  if (!confirm) return;
  
  await PersistentStorage.removeItem('homepage_layout_config');
  setCurrentLayout(defaultLayoutConfig);
  
  console.log('🔄 布局已重置');
};
```

#### 6.7 模块配置面板

每个模块可以有自己的配置选项：

```tsx
// 例如：统计面板的配置
interface StatsPanelConfig {
  defaultDimension: 'tags' | 'calendars';
  defaultTimeRange: 'today' | 'week' | 'month';
  showSummary: boolean;
  chartType: 'pie' | 'donut' | 'bar';
}

// 配置界面
<div className="module-config-panel">
  <h4>⚙️ 统计面板设置</h4>
  
  <div className="config-item">
    <label>默认维度</label>
    <select value={config.defaultDimension} onChange={handleDimensionChange}>
      <option value="tags">标签</option>
      <option value="calendars">日历</option>
    </select>
  </div>
  
  <div className="config-item">
    <label>默认时间范围</label>
    <select value={config.defaultTimeRange} onChange={handleTimeRangeChange}>
      <option value="today">今天</option>
      <option value="week">本周</option>
      <option value="month">本月</option>
    </select>
  </div>
  
  <div className="config-item">
    <label>
      <input 
        type="checkbox" 
        checked={config.showSummary}
        onChange={handleSummaryToggle}
      />
      显示统计摘要
    </label>
  </div>
</div>
```

#### 6.8 预设布局模板

提供几种预设布局供用户快速切换：

```typescript
const layoutPresets = {
  default: {
    name: '默认布局',
    description: '平衡的三模块布局',
    thumbnail: '/assets/layout-default.png',
    config: defaultLayoutConfig
  },
  minimal: {
    name: '极简模式',
    description: '只显示计时器和统计',
    thumbnail: '/assets/layout-minimal.png',
    config: {
      modules: {
        timer: { enabled: true },
        stats: { enabled: true }
      }
    }
  },
  focus: {
    name: '专注模式',
    description: '大号计时器 + 今日目标',
    thumbnail: '/assets/layout-focus.png',
    config: {
      modules: {
        timer: { enabled: true },
        todayGoals: { enabled: true },
        focusStats: { enabled: true }
      }
    }
  },
  dashboard: {
    name: '数据驾驶舱',
    description: '多图表分析视图',
    thumbnail: '/assets/layout-dashboard.png',
    config: {
      modules: {
        stats: { enabled: true },
        trendChart: { enabled: true },
        pieChart: { enabled: true },
        calendar: { enabled: true }
      }
    }
  }
};

// 预设选择器
<div className="layout-presets">
  <h3>📐 布局模板</h3>
  <div className="preset-grid">
    {Object.entries(layoutPresets).map(([key, preset]) => (
      <div 
        key={key}
        className="preset-card"
        onClick={() => applyPreset(preset.config)}
      >
        <img src={preset.thumbnail} alt={preset.name} />
        <h4>{preset.name}</h4>
        <p>{preset.description}</p>
      </div>
    ))}
  </div>
</div>
```

#### 6.9 实现任务清单

**Phase 6A: 基础拖拽功能 (Week 6)**
- [ ] 集成 `react-grid-layout`
- [ ] 实现编辑模式切换
- [ ] 实现拖拽排序
- [ ] 实现调整大小
- [ ] 布局持久化（保存/加载）

**Phase 6B: 模块管理 (Week 7)**
- [ ] 创建模块库界面
- [ ] 实现添加/删除模块
- [ ] 开发至少8个可选模块（包括回忆彩蛋）
- [ ] 模块配置面板
- [ ] 预设布局模板

**验收标准**：
- ✅ 用户可以拖拽任意模块调整位置
- ✅ 用户可以调整模块大小（在限制范围内）
- ✅ 布局配置能正确保存和恢复
- ✅ 模块库可以添加/删除模块
- ✅ 预设模板可以一键应用
- ✅ 回忆彩蛋正确显示历史事件

---

### Phase 7: 高级功能（可选）

**任务**：
- [ ] 多维度同时展示（并排对比）
- [ ] 导出统计报告（PDF/CSV）
- [ ] 分享布局配置（生成链接）
- [ ] AI 洞察建议（基于统计数据）
- [ ] 布局云同步（跨设备同步配置）

---

## 附录

### A. 文件结构

```
src/
├── pages/
│   └── HomePage/
│       ├── HomePage.tsx          # 主组件（可自定义布局）
│       ├── HomePage.css          # 样式
│       ├── HomePageGrid.tsx      # Grid Layout 容器 🆕
│       ├── ModuleLibrary.tsx     # 模块库组件 🆕
│       ├── LayoutPresets.tsx     # 预设布局选择器 🆕
│       ├── modules/              # 可选模块 🆕
│       │   ├── TimerModule.tsx
│       │   ├── UpcomingModule.tsx
│       │   ├── StatsModule.tsx
│       │   ├── TrendChartModule.tsx
│       │   ├── PieChartModule.tsx
│       │   ├── QuickNoteModule.tsx
│       │   ├── CommonTagsModule.tsx
│       │   ├── TodayGoalsModule.tsx
│       │   ├── CalendarModule.tsx
│       │   ├── FocusStatsModule.tsx
│       │   └── MemoryEasterEggModule.tsx  🆕
│       ├── StatsPanel/
│       │   ├── StatsPanel.tsx
│       │   ├── StatsControlBar.tsx
│       │   ├── StatsMainView.tsx
│       │   ├── ChartSection.tsx
│       │   └── ListSection.tsx
│       └── UpcomingEventsPanel/
│           └── CompactEventCard.tsx
├── components/
│   ├── TimerCard.tsx             # 已实现
│   ├── DailyStatsCard.tsx        # 已实现
│   └── ModuleRenderer.tsx        # 模块渲染器 🆕
├── utils/
│   ├── chartUtils.ts             # 图表工具函数
│   ├── statsCalculator.ts        # 统计计算逻辑
│   └── layoutConfig.ts           # 布局配置管理 🆕
└── constants/
    └── moduleDefinitions.ts      # 模块定义常量 🆕
```

### B. API 接口

```typescript
// 获取统计数据
interface StatsAPI {
  // 标签统计
  getTagStats(timeRange: TimeRange): Promise<TagStats[]>;
  
  拖拽流畅度 | 60 FPS | Chrome DevTools |
| 布局保存时间 | < 100ms | Performance API |
| 内存占用 | < 80MB | Chrome DevTools（包含Grid Layout） |

### D. 依赖包清单

```json
{
  "dependencies": {
    "react-grid-layout": "^1.4.4",
    "react-resizable": "^3.0.5"
  },
  "devDependencies": {
    "@types/react-grid-layout": "^1.3.5",
    "@types/react-resizable": "^3.0.7"
  }
}
```

**CSS 导入**（在 HomePage.tsx 中）：
```tsx
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
```

### E. 回忆彩蛋模块详细设计 🎁

这是一个温馨的功能，让用户重温过去的美好时光。

#### E.1 核心功能

**时间回溯点**：
- 📅 **30天前**（1个月前的今天）
- 📅 **60天前**（2个月前的今天）
- 📅 **90天前**（3个季度前的今天）
- 📅 **180天前**（半年前的今天）
- 📅 **365天前**（去年的今天）
- 🎂 **生日/纪念日**（用户设置的特殊日期）

**展示内容**：
1. **事件**：当天创建或发生的重要事件
2. **日志**：当天写下的笔记和想法
3. **计时记录**：当天专注的时长和项目
4. **特殊时刻**：
   - 最长专注时长的事件
   - 第一次使用某个标签
   - 完成的重要任务

#### E.2 UI 设计

```tsx
<div className="memory-easter-egg-module">
  {/* 标题栏 */}
  <div className="module-header">
    <h3>🎁 回忆彩蛋</h3>
    <div className="time-selector">
      <button 
        className={selectedPeriod === 30 ? 'active' : ''}
        onClick={() => setSelectedPeriod(30)}
      >
        30天前
      </button>
      <button 
        className={selectedPeriod === 60 ? 'active' : ''}
        onClick={() => setSelectedPeriod(60)}
      >
        60天前
      </button>
      <button 
        className={selectedPeriod === 90 ? 'active' : ''}
        onClick={() => setSelectedPeriod(90)}
      >
        90天前
      </button>
    </div>
  </div>
  
  {/* 内容区 */}
  {hasMemories ? (
    <div className="memory-content">
      {/* 日期标题 */}
      <div className="memory-date">
        <span className="date-text">{formatMemoryDate(targetDate)}</span>
        <span className="days-ago">{selectedPeriod}天前</span>
      </div>
      
      {/* 回忆卡片列表 */}
      <div className="memory-cards">
        {/* 特别时刻卡片 */}
        {specialMoment && (
          <div className="memory-card special">
            <div className="card-icon">⭐</div>
            <div className="card-content">
              <div className="card-label">特别时刻</div>
              <div className="card-title">{specialMoment.title}</div>
              <div className="card-meta">
                {specialMoment.type === 'longest-focus' && (
                  <>
                    <span>专注时长: {formatDuration(specialMoment.duration)}</span>
                    <span className="tag">{specialMoment.tagName}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* 事件卡片 */}
        {events.map(event => (
          <div key={event.id} className="memory-card event">
            <div className="card-icon">
              {event.isTimer ? '⏱️' : event.eventlog ? '📝' : '📅'}
            </div>
            <div className="card-content">
              <div className="card-label">
                {event.isTimer ? '计时记录' : event.eventlog ? '日志' : '事件'}
              </div>
              <div className="card-title">{event.title?.simpleTitle}</div>
              <div className="card-meta">
                {event.startTime && (
                  <span>{formatTime(event.startTime)}</span>
                )}
                {event.tags && event.tags.length > 0 && (
                  <span className="tag">{getTagName(event.tags[0])}</span>
                )}
                {event.isTimer && event.duration && (
                  <span className="duration">
                    {formatDuration(event.duration)}
                  </span>
                )}
              </div>
              {event.eventlog && (
                <div className="card-preview">
                  {truncateText(stripHtml(event.eventlog), 80)}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* 统计摘要 */}
        <div className="memory-summary">
          <div className="summary-item">
            <span className="summary-label">事件数</span>
            <span className="summary-value">{totalEvents}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">总时长</span>
            <span className="summary-value">{formatDuration(totalDuration)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">最活跃标签</span>
            <span className="summary-value">{topTag}</span>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="empty-state">
      <div className="empty-icon">🌟</div>
      <p>那时候还没有开始使用 4DNote</p>
      <p className="hint">继续记录，创造更多美好回忆吧！</p>
    </div>
  )}
  
  {/* 底部操作 */}
  {hasMemories && (
    <div className="memory-actions">
      <button 
        className="btn-view-details"
        onClick={() => navigateToDate(targetDate)}
      >
        查看完整时间轴 →
      </button>
    </div>
  )}
</div>
```

#### E.3 样式设计

```css
.memory-easter-egg-module {
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);
  border-radius: 20px;
  padding: 20px;
  height: 100%;
  overflow: hidden;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.module-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.time-selector {
  display: flex;
  gap: 6px;
  background: white;
  padding: 4px;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.time-selector button {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.time-selector button:hover {
  background: #f3f4f6;
  color: #374151;
}

.time-selector button.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.memory-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

.memory-date {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: white;
  border-radius: 12px;
  border-left: 4px solid #667eea;
}

.date-text {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.days-ago {
  font-size: 12px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 4px 8px;
  border-radius: 6px;
}

.memory-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: white;
  border-radius: 12px;
  transition: all 0.2s;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.memory-card:hover {
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.memory-card.special {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 2px solid #fbbf24;
}

.card-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6b7280;
}

.card-meta .tag {
  padding: 2px 8px;
  background: #e5e7eb;
  border-radius: 6px;
  color: #374151;
}

.card-meta .duration {
  font-weight: 600;
  color: #667eea;
}

.card-preview {
  margin-top: 8px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.memory-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  background: white;
  border-radius: 12px;
  border: 2px dashed #e5e7eb;
}

.summary-item {
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
}

.summary-value {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #667eea;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  color: #6b7280;
  margin: 4px 0;
}

.empty-state .hint {
  font-size: 13px;
  color: #9ca3af;
}

.memory-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.btn-view-details {
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-view-details:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
```

#### E.4 数据查询逻辑

```typescript
interface MemoryData {
  targetDate: Date;
  daysAgo: number;
  events: Event[];
  specialMoment?: {
    type: 'longest-focus' | 'first-tag' | 'milestone';
    title: string;
    duration?: number;
    tagName?: string;
  };
  stats: {
    totalEvents: number;
    totalDuration: number;
    topTag: string;
  };
}

/**
 * 获取回忆数据
 */
const getMemoryData = async (daysAgo: number): Promise<MemoryData | null> => {
  // 计算目标日期（daysAgo天前）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() - daysAgo);
  
  // 构造日期范围（目标日期的整天）
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  // 查询该日期的所有事件
  const allEvents = await EventService.getTimelineEvents({
    startDate: startOfDay,
    endDate: endOfDay
  });
  
  if (allEvents.length === 0) {
    return null; // 没有回忆
  }
  
  // 过滤有意义的事件（排除系统事件）
  const meaningfulEvents = allEvents.filter(event => 
    !event.isOutsideApp && 
    (event.title?.simpleTitle || event.eventlog)
  );
  
  // 计算统计数据
  const stats = calculateMemoryStats(meaningfulEvents);
  
  // 识别特殊时刻
  const specialMoment = findSpecialMoment(meaningfulEvents, targetDate);
  
  return {
    targetDate,
    daysAgo,
    events: meaningfulEvents.slice(0, 5), // 只显示前5个
    specialMoment,
    stats
  };
};

/**
 * 计算统计数据
 */
const calculateMemoryStats = (events: Event[]) => {
  let totalDuration = 0;
  const tagCount = new Map<string, number>();
  
  events.forEach(event => {
    // 计算时长
    if (event.startTime && event.endTime) {
      const duration = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
      totalDuration += duration;
    }
    
    // 统计标签
    if (event.tags && event.tags.length > 0) {
      event.tags.forEach(tagId => {
        tagCount.set(tagId, (tagCount.get(tagId) || 0) + 1);
      });
    }
  });
  
  // 找出最活跃标签
  let topTag = '';
  let maxCount = 0;
  tagCount.forEach((count, tagId) => {
    if (count > maxCount) {
      maxCount = count;
      const tag = TagService.getTagById(tagId);
      topTag = tag?.name || tagId;
    }
  });
  
  return {
    totalEvents: events.length,
    totalDuration,
    topTag
  };
};

/**
 * 识别特殊时刻
 */
const findSpecialMoment = (events: Event[], targetDate: Date) => {
  // 1. 找出最长专注时长的事件
  let longestEvent: Event | null = null;
  let maxDuration = 0;
  
  events.filter(e => e.isTimer).forEach(event => {
    if (event.startTime && event.endTime) {
      const duration = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
      if (duration > maxDuration) {
        maxDuration = duration;
        longestEvent = event;
      }
    }
  });
  
  if (longestEvent && maxDuration > 3600000) { // 超过1小时
    const tag = longestEvent.tags?.[0] ? TagService.getTagById(longestEvent.tags[0]) : null;
    return {
      type: 'longest-focus' as const,
      title: longestEvent.title?.simpleTitle || '专注时刻',
      duration: maxDuration,
      tagName: tag?.name
    };
  }
  
  // 2. 检查是否是第一次使用某个标签
  // TODO: 实现标签首次使用检测
  
  // 3. 检查是否有里程碑事件
  // TODO: 实现里程碑检测
  
  return undefined;
};

/**
 * 格式化回忆日期
 */
const formatMemoryDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[date.getDay()];
  
  return `${year}年${month}月${day}日 ${weekday}`;
};
```

#### E.5 模块配置选项

```typescript
interface MemoryModuleConfig {
  defaultPeriod: 30 | 60 | 90 | 180 | 365; // 默认显示的时间段
  showSpecialMoments: boolean;              // 是否显示特殊时刻
  maxEventsToShow: number;                  // 最多显示事件数
  autoRefresh: boolean;                     // 是否每日自动刷新
  enabledPeriods: number[];                 // 启用的时间段选项
}

// 默认配置
const defaultConfig: MemoryModuleConfig = {
  defaultPeriod: 30,
  showSpecialMoments: true,
  maxEventsToShow: 5,
  autoRefresh: true,
  enabledPeriods: [30, 60, 90]
};
```

#### E.6 高级功能（未来扩展）

1. **AI 生成回忆摘要**
   ```
   "30天前的今天，你专注于工作标签达到4小时，
   完成了项目报告，并记录了一条关于团队协作的思考。"
   ```

2. **回忆分享**
   - 生成精美的回忆卡片图片
   - 一键分享到社交媒体

3. **回忆对比**
   - 对比今天与30天前的时间使用
   - 显示进步和变化

4. **回忆日历**
   - 标注有特殊回忆的日期
   - 点击查看该日的完整回忆

5. **年度回忆**
   - 自动生成年度总结
   - 最难忘的时刻、最常用的标签等

---

### F. 用户引导流程

**首次使用时的引导提示**：

1. **欢迎弹窗**
   ```
   🎉 欢迎使用自定义布局功能！
   
   你可以：
   • 拖拽模块调整位置
   • 调整模块大小
   • 添加/删除模块
   • 使用预设模板
   
   点击右下角的"⚙️ 自定义布局"开始吧！
   ```

2. **编辑模式提示**（首次进入编辑模式）
   ```
   💡 小提示
   
   • 拖拽模块标题栏可以移动
   • 拖拽右下角可以调整大小
   • 点击 ❌ 可以删除模块
   • 点击 ➕ 可以添加新模块
   ```

3. **保存提醒**（退出编辑模式时）
   ```
   是否保存你的布局更改？
   
   [保存] [放弃更改] [取消]
   ```
  getCalendarStats(timeRange: TimeRange): Promise<CalendarStats[]>;
  
  // 趋势数据
  getTrendData(timeRange: TimeRange, dimension: string): Promise<DailyStats[]>;
  
  // 即将到来的事件
  getUpcomingEvents(limit: number): Promise<Event[]>;
}
```

### C. 性能指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| 首屏加载时间 | < 1s | Performance API |
| 维度切换响应 | < 500ms | 用户感知测试 |
| 图表渲染时间 | < 300ms | React Profiler |
| 内存占用 | < 50MB | Chrome DevTools |

---

**文档维护**：随开发进度更新，确保设计与实现一致。
