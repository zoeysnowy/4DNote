# TimeLog 页面 GoldenLayout 设计规格书

> **创建时间**: 2025-12-01  
> **最后更新**: 2025-12-11  
> **当前版本**: v2.0 (标签页管理已实现)  
> **Figma 设计稿**: https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=486-2661  
> **关联文档**: 
> - [GOLDENLAYOUT_IMPLEMENTATION_PLAN.md](./GOLDENLAYOUT_IMPLEMENTATION_PLAN.md)
> - [TimeLog_&_Description_PRD.md](./TimeLog_&_Description_PRD.md)
> - [LogTab PRD](../../features/TodolistPanel_for_TimeCalendar.md)

---

## ✅ 实现状态总览

### 已完成功能（v2.0）

- ✅ **标签页管理系统** - 完全实现，使用自定义方案替代 GoldenLayout
  - 单击事件卡片打开 LogTab 标签页
  - 多标签切换（时光日志 + N 个事件标签）
  - 标签关闭逻辑（自动回到时光日志）
  - 滚动位置保持（使用 CSS display 而非条件渲染）
- ✅ **内容选取面板** - ContentSelectionPanel 完全复用
  - 固定/取消固定功能
  - 搜索框（SVG 渐变边框，100% 视图清晰渲染）
  - 日期范围选择
  - 标签过滤
- ✅ **时光日志主页面**
  - 双向无限滚动（历史/未来懒加载）
  - 日期压缩/展开
  - 事件卡片完整交互
  - 今天标记自动定位
- ✅ **LogTab 事件详情页**
  - 完整的两列布局（信息区 + 编辑区）
  - 超紧凑 Figma 样式（6px 间距，12px 字体）
  - ModalSlate 编辑器集成（待迁移）
  - TOC 目录系统（结构完成，内容待提取）

### 进行中功能

- 🔄 **LogTab 编辑器迁移** - ModalSlate 需要从旧模态框迁移到 LogTab
- 🔄 **TOC 内容提取** - H1-H4 标题提取和跳转逻辑

### 待实现功能（原 GoldenLayout 特性）

- ⏳ 双击事件卡片打开独立弹窗（Electron 多窗口）
- ⏳ 拖拽面板创建浮动窗口
- ⏳ 拖拽标签创建分屏布局
- ⏳ 拖拽标签到外部创建新窗口
- ⏳ 布局配置持久化（当前仅保存标签状态）

---

## 📐 设计概览

### Figma 原始设计分析

**页面布局（总宽度: 1440px）**

```
┌─────────┬──────────────┬──────────────────────────────────┬────────────┐
│ Left    │ Content      │ Main Timeline                    │ Right FAB  │
│ Sidebar │ Selection    │ 时光日志                          │ (Floating) │
│ 96px    │ 342px        │ 905px                            │ 80px       │
├─────────┼──────────────┼──────────────────────────────────┼────────────┤
│ ┌─────┐ │ 内容选取 👁️  │ 时光日志                          │ ⊕ 记录此刻  │
│ │LOGO │ │              │                                  │           │
│ └─────┘ │ 🔍 输入"去年  │ 2025.10.18（周六）                │ 🎤 语音记录 │
│         │   今天"、    │ ┌─────────────────────────────┐  │           │
│ 首页    │   "上周专注" │ │ 10:00 ━━━━━━━━━ 12:00       │  │ 🖼️ 图片    │
│         │              │ │ 🎙️ 议程讨论                  │  │           │
│ [时光]  │ 📅 2025年10月│ │ #👜工作 #🧐文档编辑          │  │ 🎵 音频    │
│ (active)│ 日 一 二 ... │ │ 👥 Zoey Gong; Jenny Wong...  │  │           │
│         │ 1  2  3  ... │ │ 📍 静安嘉里中心2座F38...      │  │ 🎬 视频    │
│ 日志    │              │ │ ─────────────────────────── │  │           │
│         │ ⚡ 标签/事项/ │ │ 太强了！居然直接成稿了，那现  │  │ 📄 文档    │
│ 标签    │   收藏/New   │ │ 在就只要做些检查了...        │  │           │
│         │              │ │ 2025-10-19 10:21:18         │  │ 📦 项目    │
│ 计划    │ 👁️ #🔮Remark │ └─────────────────────────────┘  │           │
│         │    able开发  │                                  │ 🔖 网页收藏 │
│ 追踪    │    ■■■□ 3/7  │ 10:00 ━━━━━━━━━ 12:00           │           │
│         │    12h       │ 🎓 准备演讲稿                     │ 📤 导出    │
│ 同步    │              │ #👜工作 #🧐文档编辑               │           │
│         │ 👁️ #🔮PRD   │ 📝 创建于12h前，距离ddl还有2h30min│           │
│         │    文档      │ 🔗 上级任务：Project Ace...      │           │
│         │    ■■□□ 3/7  │ ─────────────────────────────── │           │
│         │    6h        │ 处理完了一些出差的logistics...   │           │
│         │              │                                  │           │
│         │ 👁️ #🔮码     │ 📅 2025 年 10 月                 │           │
│         │    代码      │ 日 一 二 三 四 五 六              │           │
│         │    ■□□□ 3/7  │ 19 20 21 22 23 24 25 26         │           │
│         │    3h        │ 27 28 29 30 31  1  2  3 ...     │           │
│         │              │                                  │           │
│         │ 显示全部     │ 📅 2025 年 11 月                 │           │
│         │              │  1  2  3  4  5  6  7  8 ...     │           │
│         │              │                                  │           │
│         │              │ 2025.11.12（周三）               │           │
└─────────┴──────────────┴──────────────────────────────────┴────────────┘
│ 最后同步：2025-10-13 00:28:43  更新事件3个  ☁️iCloud 📧Outlook 📧Google    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 设计系统规格

### 1. 颜色系统（✅ 已实现）

```css
/* 主题色 - 已应用于搜索框边框、标签页等 */
--primary-gradient: linear-gradient(to right, #a855f7, #3b82f6);
--primary-purple: #a855f7;
--primary-blue: #3b82f6;

/* 背景色 */
--bg-gray-100: #f3f4f6;
--bg-white: #ffffff;
--bg-white-opacity-80: rgba(255, 255, 255, 0.8);
--bg-white-opacity-30: rgba(255, 255, 255, 0.3);

/* 文字色 */
--text-gray-900: #111827;
--text-gray-800: #1f2937;
--text-gray-700: #374151;
--text-gray-600: #4b5563;
--text-gray-500: #6b7075;
--text-gray-400: #9ca3af;
--text-gray-300: #d1d5db;
--text-gray-200: #e5e7eb;
--text-white: #ffffff;

/* 标签色 */
--tag-work: #a855f7;         /* #👜工作 */
--tag-document: #3b82f6;     /* #🧐文档编辑 */
--tag-client-tencent: #fb923c; /* #🧐腾讯 */
--tag-code: #10b981;         /* #🔮码代码 */
--tag-prd: #3b82f6;          /* #🔮PRD文档 */
--tag-dev: #a855f7;          /* #🔮Remarkable开发 */

/* 状态色 */
--status-success: #10b981;
--status-warning: #f59e0b;
--status-error: #ef4444;
--status-info: #3b82f6;

/* 边框色 */
--border-gray-100: #f3f4f6;
--border-gray-200: #e5e7eb;
--border-gray-200-opacity-50: rgba(229, 231, 235, 0.5);
```

### 2. 字体系统

```css
/* 字体家族 */
--font-sans: 'Inter', 'Microsoft YaHei', 'Noto Sans SC', 'Noto Sans JP', sans-serif;
--font-mono: 'Roboto Mono', 'Consolas', monospace;

/* 字号 */
--text-xs: 10px;    /* 时间标记 */
--text-sm: 12px;    /* 次要文字、标签 */
--text-base: 14px;  /* 正文 */
--text-lg: 16px;    /* 次级标题 */
--text-xl: 18px;    /* 主标题 */
--text-2xl: 30px;   /* Logo */
--text-3xl: 36px;   /* 日期大号 */

/* 字重 */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* 行高 */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

### 3. 间距系统

```css
/* Spacing Scale (8px 基准) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;

/* 组件内边距 */
--padding-card: 20px;
--padding-panel: 20px;
--padding-button: 8px 16px;
```

### 4. 圆角系统

```css
--radius-sm: 2px;    /* 标签 */
--radius-md: 5px;    /* 日历日期 */
--radius-lg: 8px;    /* 按钮 */
--radius-xl: 10px;   /* 事件卡片 */
--radius-2xl: 12px;  /* 导航按钮 */
--radius-3xl: 20px;  /* 主面板 */
--radius-full: 9999px; /* 圆形头像、进度条 */
```

### 5. 阴影系统

```css
/* Elevation Shadows */
--shadow-sm: 0px 1px 2px 0px rgba(0, 0, 0, 0.05);
--shadow-md: 0px 4px 6px 0px rgba(0, 0, 0, 0.1), 
             0px 10px 15px 0px rgba(0, 0, 0, 0.1);
--shadow-lg: 0px 10px 10px 32px rgba(0, 0, 0, 0.1);
--shadow-xl: -1px 2px 10px 0px rgba(156, 163, 175, 0.12),
              1px 1px 5px 0px rgba(0, 0, 0, 0.05);

/* Inner Shadow */
--shadow-inset: inset 1px 1px 2px 0px #ffffff;

/* Card Shadow */
--shadow-card: 0px 4px 10px rgba(0, 0, 0, 0.25);
```

---

## 📏 组件规格

### 事件卡片 (Event Card)

**尺寸**:
- 宽度: 100% (容器宽度 - 40px padding)
- 高度: 自适应 (最小 188px)
- 外边距: 12px bottom
- 内边距: 20px
- 边框: 1px solid rgba(229, 231, 235, 0.5)
- 圆角: 10px

**布局结构**:
```tsx
<div className="event-card">
  <div className="event-time-range">
    {/* 10:00 ━━━━━━━━━ 12:00 */}
    <span>10:00</span>
    <div className="time-arrow">━━━━━</div>
    <span>12:00</span>
    <span className="duration-badge">2h30min</span>
  </div>
  
  <div className="event-header">
    <span className="emoji">🎙️</span>
    <h3>议程讨论</h3>
    <span className="sync-indicator">☁️</span>
  </div>
  
  <div className="event-tags">
    <span className="tag work">#👜工作</span>
    <span className="tag doc">#🧐文档编辑</span>
  </div>
  
  <div className="event-meta">
    <div className="attendees">👥 Zoey Gong; Jenny Wong; Cindy Cai</div>
    <div className="location">📍 静安嘉里中心2座F38，RM工作室，5号会议室</div>
  </div>
  
  <div className="event-description">
    太强了！居然直接成稿了，那现在就只要做些检查了...
  </div>
  
  <div className="event-footer">
    <span className="timestamp">2025-10-19 10:21:18</span>
    <div className="actions">
      <button>⭐</button>
      <button>⚙️</button>
      <button>⏱️</button>
      <button>➕</button>
    </div>
  </div>
</div>
```

### 内容选取面板 (Content Selection Panel)

**尺寸**:
- 宽度: 342px
- 高度: 845px
- 背景: white
- 圆角: 20px
- 阴影: 0px 4px 10px rgba(0, 0, 0, 0.25)

**组件结构**:
```tsx
<div className="content-selection-panel">
  <div className="panel-header">
    <h2>内容选取</h2>
    <button className="hide-btn">👁️</button>
  </div>
  
  <div className="search-box">
    <input placeholder="输入"去年今天"、"上周专注"试试" />
  </div>
  
  <div className="calendar-widget">
    {/* 月份日历 */}
  </div>
  
  <div className="filter-tabs">
    <button className="active">标签</button>
    <button>事项</button>
    <button>收藏</button>
    <button>New</button>
  </div>
  
  <div className="tag-list">
    <div className="tag-item">
      <span className="visibility">👁️</span>
      <span className="tag-name">#🔮Remarkable开发</span>
      <div className="progress-bar">
        <div className="filled" style="width: 43%"></div>
      </div>
      <span className="stats">3/7</span>
      <span className="time">12h</span>
      <button className="expand">▼</button>
    </div>
    {/* 子标签（展开时显示） */}
    <div className="tag-children">
      <div className="tag-item sub">
        <span>#🔮PRD文档</span>
        <div className="progress-bar"><div style="width: 30%"></div></div>
        <span>3/7</span>
        <span>6h</span>
      </div>
      <div className="tag-item sub">
        <span>#🔮码代码</span>
        <div className="progress-bar"><div style="width: 15%"></div></div>
        <span>3/7</span>
        <span>3h</span>
      </div>
    </div>
  </div>
  
  <button className="show-all">显示全部</button>
</div>
```

### 右侧浮动按钮 (Floating Action Buttons)

**尺寸**:
- 宽度: 80px (含标签文字)
- 每个按钮: 48x48px
- 间距: 12px vertical
- 圆角: 10px
- 背景: rgba(255, 255, 255, 0.3)
- 玻璃态: blur(15px)

**组件结构**:
```tsx
<div className="right-fab-container">
  <div className="fab-item">
    <button className="fab-button">
      <span className="icon">⊕</span>
    </button>
    <span className="fab-label">记录此刻</span>
  </div>
  
  <div className="fab-item">
    <button className="fab-button">
      <span className="icon">🎤</span>
    </button>
    <span className="fab-label">语音记录</span>
  </div>
  
  {/* ... 其他按钮 */}
</div>
```

---

## 🔄 GoldenLayout 集成方案

### 默认布局配置

```typescript
export const DEFAULT_TIMELOG_LAYOUT: LayoutConfig = {
  settings: {
    showPopoutIcon: true,       // 显示弹出图标
    showMaximiseIcon: true,     // 显示最大化图标
    showCloseIcon: true,        // 显示关闭图标（内容选取面板可关闭）
    constrainDragToContainer: false, // 允许拖拽到外部创建弹窗
  },
  dimensions: {
    borderWidth: 5,
    minItemHeight: 200,
    minItemWidth: 300,
    headerHeight: 32,
    dragProxyWidth: 300,
    dragProxyHeight: 200,
  },
  content: [{
    type: 'row',
    content: [
      // 左侧：内容选取面板（可拖拽、可关闭）
      {
        type: 'component',
        componentName: 'contentSelectionPanel',
        componentState: {
          defaultView: 'tags', // 默认显示标签视图
        },
        title: '内容选取',
        isClosable: true,
        width: 25.45, // 342 / 1344 ≈ 25.45%
      },
      
      // 右侧：时光日志主区域（标签容器）
      {
        type: 'stack',
        isClosable: false,
        activeItemIndex: 0,
        content: [{
          type: 'component',
          componentName: 'timelineView',
          componentState: {
            date: new Date().toISOString().split('T')[0],
            viewMode: 'daily', // daily | weekly | monthly
          },
          title: '时光日志',
          isClosable: false, // 主视图不可关闭
        }],
        width: 67.33, // 905 / 1344 ≈ 67.33%
      }
    ]
  }]
};
```

### 交互行为映射（v2.0 实现状态）

| 用户操作 | 触发事件 | 当前实现 | 视觉反馈 | 状态 |
|---------|---------|---------|---------|------|
| 单击事件卡片 | `handleOpenInTab` | 在主 stack 中打开新标签或激活已有标签 | 标签高亮、内容切换 | ✅ 已实现 |
| 双击事件卡片 | `openEventPopup` | ~~创建独立弹出窗口~~ (待实现) | 新窗口动画弹出 | ⏳ 待实现 |
| 切换标签页 | `setActiveTabId` | 使用 CSS display 切换，保持滚动位置 | 平滑切换，无重载 | ✅ 已实现 |
| 关闭标签 | 标签关闭按钮 | 移除事件，自动切换到时光日志 | 标签消失动画 | ✅ 已实现 |
| 拖拽内容选取面板标题 | ~~GoldenLayout 内置~~ | 固定/取消固定按钮 | Pin 图标切换 | ✅ 已实现（简化版） |
| 点击"×"关闭内容选取 | ~~GoldenLayout 内置~~ | 取消固定收起面板 | 平滑收起动画 | ✅ 已实现 |
| 拖拽标签到边缘 | ~~GoldenLayout 内置~~ | ~~创建分屏布局~~ | ~~蓝色占位区域显示~~ | ⏳ 待实现 |
| 拖拽标签到外部 | ~~GoldenLayout 内置~~ | ~~创建浏览器新窗口~~ | ~~弹窗打开~~ | ⏳ 待实现 |
| Ctrl+S | 自定义快捷键 | LogTab 自动保存 | Toast 提示"保存成功" | ✅ 已实现 |
| 标签内容变化 | Slate onChange | 实时保存到 EventService | 无需标记未保存 | ✅ 已实现 |

### 标签页管理实现（v2.0）

#### 状态管理

```typescript
// src/pages/TimeLog.tsx - 当前实现
const [showTabManager, setShowTabManager] = useState(false);
const [tabManagerEvents, setTabManagerEvents] = useState<Event[]>([]);
const [activeTabId, setActiveTabId] = useState<string>('timelog'); // 'timelog' 或事件ID

// 打开标签逻辑
const handleOpenInTab = useCallback(async (event: Event) => {
  console.log('🏷️ [TimeLog] handleOpenInTab called:', event.id);
  
  // Electron 环境尝试打开新窗口（可选）
  if (supportsMultiWindow()) {
    const success = await openEventInWindow(event);
    if (success) return;
  }
  
  // Web 环境或窗口打开失败，使用标签页管理器
  setTabManagerEvents(prev => {
    const exists = prev.find(e => e.id === event.id);
    if (exists) return prev;
    return [...prev, event];
  });
  setShowTabManager(true);
  setActiveTabId(event.id); // 激活新打开的标签
}, []);
```

#### 关键技术决策

1. **CSS Display 替代条件渲染**
   ```tsx
   {/* 时光日志列表 - 使用 CSS 隐藏而非条件渲染，保留滚动状态 */}
   <div 
     className="timelog-events-list" 
     ref={timelineContainerRef}
     style={{ display: activeTabId === 'timelog' ? 'block' : 'none' }}
   >
   
   {/* LogTab 事件详情页面 - 使用 CSS 隐藏，而非条件渲染 */}
   <div 
     className="timelog-tab-content"
     style={{ display: activeTabId !== 'timelog' ? 'flex' : 'none' }}
   >
   ```
   **优势**: DOM 保留，滚动位置自动保持，无需手动保存/恢复

2. **边框渲染优化**
   - 搜索框使用 SVG `<rect>` 绘制渐变边框
   - 避免 CSS mask 和伪元素导致的亚像素渲染问题
   - 100% 视图下完美清晰（20px 圆角）

3. **无限滚动懒加载**
   - 初始加载：今天前后 45 天
   - 向上滚动 <100px：触发历史加载（-30 天）
   - 向下滚动 <400px：触发未来加载（+30 天）
   - 使用 ref 避免闭包问题

---

## 🚀 实施步骤（v2.0 更新）

### ✅ Step 1: 准备 CSS 变量（已完成）

已创建完整的设计系统文件：
- `src/pages/TimeLog.css` - 时光日志主页样式
- `src/pages/LogTab.css` - LogTab 事件详情样式
- `src/components/ContentSelectionPanel.css` - 内容选取面板样式

### ✅ Step 2: 实现固定布局（已完成）

已实现 Figma 的固定 3 列布局：
- ✅ Left Sidebar (60px) - AppLayout 左侧导航
- ✅ Content Selection Panel (335px) - 可固定/取消固定
- ✅ Main Timeline (动态宽度) - 时光日志主区域
- ✅ Right FAB (GlassIconBar) - 浮动操作按钮

### 🔄 Step 3: 标签页管理（已完成简化版）

**决策变更**: 使用自定义标签页系统替代 GoldenLayout
- ✅ 标签栏渲染（时光日志 + 事件标签）
- ✅ 标签切换（setActiveTabId）
- ✅ 标签关闭（自动回到时光日志）
- ✅ CSS Display 保持滚动位置
- ⏳ 待实现：GoldenLayout 拖拽功能（可选）

### 🔄 Step 4: LogTab 编辑器集成（进行中）

1. ✅ LogTab 两列布局（信息区 + 编辑区）
2. ✅ 超紧凑 Figma 样式（6px 间距，12px 字体）
3. ✅ TOC 目录窗口结构（pin/unpin, menu）
4. 🔄 ModalSlate 迁移到 eventlog-section
5. ⏳ TOC 内容提取（H1-H4 标题）
6. ⏳ TOC 跳转功能

### ⏳ Step 5: 高级交互（待实现）

1. ⏳ 双击事件卡片打开 Electron 窗口
2. ⏳ 拖拽面板创建浮动窗口
3. ⏳ 拖拽标签创建分屏
4. ⏳ 布局持久化

---

## ✅ 验收标准（v2.0 更新）

### 已达成标准

- ✅ 视觉 100% 还原 Figma 设计（LogTab 超紧凑布局）
- ✅ 单击事件卡片打开标签页
- ✅ 支持多标签同时打开（无上限）
- ✅ 标签关闭逻辑完善（自动回到主页）
- ✅ 滚动位置保持（CSS display 方案）
- ✅ 60fps 流畅渲染（Chrome DevTools 验证）
- ✅ 搜索框渐变边框 100% 清晰（SVG rect 方案）

### 待验收标准

- ⏳ 内容选取面板可拖拽成浮动窗口
- ⏳ 双击事件卡片打开弹窗
- ⏳ 拖拽标签创建分屏视图
- ⏳ 拖拽标签到外部创建独立窗口
- ⏳ 标签关闭前提示保存未保存内容（当前实时保存）
- ⏳ 布局配置持久化（刷新后恢复）
- ⏳ 无内存泄漏（10 分钟压测后 Heap Size 增长 <5MB）

---

## 📝 技术债务与优化建议

### 当前技术债务

1. **ModalSlate 迁移** - 需要从旧模态框结构迁移到 LogTab
2. **TOC 内容提取** - 需要解析 Slate 节点提取 H1-H4 标题
3. **布局持久化** - 当前未保存标签状态，刷新后丢失

### 性能优化建议

1. **虚拟滚动** - 事件列表超过 500 个时考虑虚拟化
2. **标签页内存管理** - 超过 10 个标签时卸载不活跃的 DOM
3. **懒加载优化** - 当前 45 天范围可能过大，考虑改为 30 天

### 架构改进建议

1. **Zustand 状态管理** - 当前使用 useState，考虑引入 Zustand 统一管理
2. **ErrorBoundary** - 为每个标签页添加错误边界，防止单个标签崩溃影响整体
3. **单元测试** - 添加标签页管理、滚动位置保持等核心逻辑的测试

---

## 📚 参考资源

- [GoldenLayout v2 文档](https://golden-layout.github.io/golden-layout/)
- [React 18 createRoot API](https://react.dev/reference/react-dom/client/createRoot)
- [Slate.js 编辑器](https://docs.slatejs.org/)
- [Figma 设计规范导出](https://www.figma.com/community/plugin/731176732337510831)
