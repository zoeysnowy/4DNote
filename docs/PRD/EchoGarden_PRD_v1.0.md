# EchoGarden (回声花园) 功能 PRD

**文档版本**: v1.0  
**创建日期**: 2026-01-04  
**最后更新**: 2026-01-04  
**架构对齐**: APP_ARCHITECTURE v1.9

---

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-01-04 |
| 产品名称 | 4DNote - EchoGarden |
| 功能定位 | 时间可视化模块 |
| 优先级 | P1 (增强功能) |
| 预计工期 | 2-3 周 |
| 架构依赖 | EventService, EventHub (Epic 2) |

---

## 🎯 架构对齐声明 (基于 APP_ARCHITECTURE v1.9)

**关键约束**：

1. **状态分类**：
   - (A) UI 临时态 → `useState` (弹窗、hover、选中状态)
   - (C) 领域数据真相 → EventService/EventHub (事件数据、emoji)
   - (D) 派生/缓存 → `useMemo` (布局计算、统计数据)

2. **EventHub 订阅视图** (Epic 2)：
   - UI 使用 `useEventHubQuery` 订阅事件数据
   - 不在组件内维护第二份事件缓存
   - 布局结果存储在组件本地 state (属于派生视图)

3. **事件查询字段契约** (基于 EVENT_FIELD_CONTRACT.md)：
   - Canonical 字段: `id`, `title`, `emoji`, `startTime`, `endTime`, `duration`, `tags`
   - 时间字段: 使用 TimeSpec 格式 (`YYYY-MM-DD HH:mm:ss`)
   - Emoji 提取优先级: `emoji` 字段 → `title` → `tags` → 默认值

4. **数据过滤条件**：
   - 时间范围: 过去 7 天 (使用 `startTime` 字段)
   - 最小时长: ≥ 30 分钟 (使用 `duration` 字段)
   - Emoji 存在性: 检查 `emoji` 字段或从 `title`/`tags` 提取

---

## 1. 产品概述

### 1.1 功能定位

**EchoGarden (回声花园)** 是 4DNote 的时间可视化模块，采用"沙漏容器"隐喻，将用户的事件记录转化为可交互的视觉花园，让时间的流逝变得可见、可感知、可回顾。

### 1.2 核心价值

- **情感连接**：将冰冷的时间数据转化为温暖的"花园"隐喻
- **成就感**：可视化时间投入，让用户看到"积累"
- **回忆杀**：点击任意 emoji，快速回顾过往事件
- **游戏化**：emoji 的生长、晃动、沉淀，增加趣味性

### 1.3 设计理念

```
时间 = 沙漏容器
今天的事件 = 上层容器（活跃区）
过去的事件 = 下层容器（沉淀区）
Emoji = 花朵/种子
时间流逝 = 沙漏效果（emoji 从上层落到下层）
```

---

## 2. 功能需求

### 2.1 核心功能列表

| 功能模块 | 优先级 | 说明 |
|---------|--------|------|
| 沙漏容器渲染 | P0 | 上下两层容器，带连接通道 |
| Emoji 散落布局 | P0 | 随机分布，避免重叠 |
| 分层逻辑 | P0 | 今天 vs 过去 7 天 |
| 点击交互 | P0 | 点击 emoji 查看事件详情 |
| 生长动画 | P1 | 新 emoji 从通道"落下" |
| 晃动动画 | P1 | idle 状态随机晃动 |
| 统计信息 | P1 | 底部显示周统计 |
| 空状态 | P1 | 无事件时的引导 |
| 加载状态 | P2 | 骨架屏 |
| 主题切换 | P3 | 预留接口（未来扩展） |

---

## 3. 详细设计

### 3.1 整体布局

```
┌─────────────────────────────────────────────┐
│  [< 返回]  EchoGarden  [设置]               │  ← Header (40px)
├─────────────────────────────────────────────┤
│                                              │
│  你的回声花园 🌱                             │  ← Title (60px)
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  ╔═══════════════════════════════╗     │ │
│  │  ║  [今天的区域]                 ║     │ │
│  │  ║                                ║     │ │  ← 上层容器 (150px)
│  │  ║  🌸 💪 📝 ☕ 🎯 💻           ║     │ │
│  │  ╚═══════════════════════════════╝     │ │
│  │         ║  ║  ║                        │ │  ← 连接通道 (30px)
│  │  ╔═══════════════════════════════╗     │ │
│  │  ║  [过去 7 天的区域]            ║     │ │
│  │  ║                                ║     │ │
│  │  ║  📚 🏃 🎵 🌸 ☕ 💪           ║     │ │  ← 下层容器 (250px)
│  │  ║  📝 🎯 💻 🍕 ⚡ 🎨           ║     │ │
│  │  ║  ...更多 emoji...             ║     │ │
│  │  ╚═══════════════════════════════╝     │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  📊 本周完成：18 个事件，累计 24 小时       │  ← Stats (60px)
│                                              │
│  [查看详情] [分享花园]                       │  ← Actions (50px)
│                                              │
└─────────────────────────────────────────────┘
   总高度：约 630px
```

---

### 3.2 数据结构

#### 3.2.1 EchoGarden 数据模型

```typescript
/**
 * EchoGarden 数据模型
 * 架构对齐: 状态分类 (C) - 从 EventService 查询
 */
interface EchoGardenData {
  // 时间范围
  dateRange: {
    start: string;        // TimeSpec: "2026-01-04 00:00:00" (7 天前)
    end: string;          // TimeSpec: "2026-01-04 23:59:59" (今天)
  };
  
  // 今天的 emoji (派生视图)
  todayEmojis: GardenEmoji[];
  
  // 过去 7 天的 emoji (派生视图)
  pastEmojis: GardenEmoji[];
  
  // 统计数据 (派生计算)
  stats: {
    totalEvents: number;      // 18
    totalHours: number;       // 24
    mostUsedEmoji: string;    // "💪"
    consecutiveDays: number;  // 7
  };
}

/**
 * 花园中的 Emoji
 * 架构对齐: 状态分类 (D) - 派生自 Event + 布局计算
 */
interface GardenEmoji {
  // 基础信息 (从 Event 映射)
  id: string;                 // "emoji-evt_123456"
  eventId: string;            // Event.id (UUID 格式)
  emoji: string;              // Event.emoji (提取自 emoji/title/tags)
  
  // 事件信息 (从 Event 字段映射)
  title: string;              // Event.title.simpleTitle
  date: string;               // 格式化 Event.startTime (YYYY-MM-DD)
  startTime: string;          // 格式化 Event.startTime (HH:mm)
  endTime: string;            // 格式化 Event.endTime (HH:mm)
  duration: number;           // Event.duration (分钟)
  
  // 布局信息（由算法计算 - 组件本地 state）
  position: {
    x: number;                // 相对于容器左侧的位置 (px)
    y: number;                // 相对于容器底部的位置 (px)
  };
  
  // 显示属性 (派生计算)
  size: number;               // 30-50 (px, 根据 duration 计算)
  opacity: number;            // 0.7-1.0 (根据日期远近计算)
  rotation: number;           // -5 到 5 (度数，增加自然感)
  
  // 状态 (派生判断)
  isNew: boolean;             // 是否是今天的事件
  layer: 'today' | 'past';    // 所在层级
}
```

---

#### 3.2.2 数据获取逻辑

```typescript
/**
 * 从 EventService 获取 EchoGarden 数据
 * 架构对齐: 使用 EventHub 订阅 + 本地过滤/派生
 */
async function fetchEchoGardenData(): Promise<EchoGardenData> {
  const today = new Date();
  const sevenDaysAgo = subDays(today, 7);
  
  // 1. 从 EventService 查询事件 (使用 Canonical 字段)
  // 注意: 使用 TimeSpec 格式进行时间范围查询
  const startTimeSpec = format(sevenDaysAgo, 'yyyy-MM-dd 00:00:00');
  const endTimeSpec = format(today, 'yyyy-MM-dd 23:59:59');
  
  const events = await EventService.queryEvents({
    startTime: { gte: startTimeSpec },
    endTime: { lte: endTimeSpec },
  });
  
  // 2. 过滤事件 (基于字段契约)
  const filteredEvents = events.filter(event => {
    // 过滤条件
    return (
      event.duration >= 30 &&              // 至少 30 分钟
      extractEmoji(event) !== null         // 有 emoji (从 emoji/title/tags 提取)
    );
  });
  
  // 3. 转换为 GardenEmoji (派生视图)
  const gardenEmojis = filteredEvents.map(event => {
    const eventStartTime = parseTimeSpec(event.startTime); // TimeSpec → Date
    const eventEndTime = parseTimeSpec(event.endTime);
    
    return {
      id: `emoji-${event.id}`,
      eventId: event.id,
      emoji: extractEmoji(event)!,       // 提取 emoji (优先级: emoji → title → tags)
      title: event.title?.simpleTitle || event.title || '',
      date: format(eventStartTime, 'yyyy-MM-dd'),
      startTime: format(eventStartTime, 'HH:mm'),
      endTime: format(eventEndTime, 'HH:mm'),
      duration: event.duration,
      size: calculateEmojiSize(event.duration),
      opacity: calculateOpacity(eventStartTime),
      rotation: randomInt(-5, 5),
      isNew: isToday(eventStartTime),
      layer: isToday(eventStartTime) ? 'today' : 'past',
      position: { x: 0, y: 0 }, // 待计算
    } as GardenEmoji;
  });
  
  // 3. 分层
  const todayEmojis = gardenEmojis.filter(e => e.layer === 'today');
  const pastEmojis = gardenEmojis.filter(e => e.layer === 'past');
  
  // 4. 计算布局
  layoutEmojis(todayEmojis, CONTAINER_CONFIG.today);
  layoutEmojis(pastEmojis, CONTAINER_CONFIG.past);
  
  // 5. 计算统计
  const stats = {
    totalEvents: events.length,
    totalHours: sum(events.map(e => e.duration)) / 60,
    mostUsedEmoji: findMostUsed(gardenEmojis.map(e => e.emoji)),
    consecutiveDays: calculateStreak(events),
  };
  
  return {
    dateRange: {
      start: format(sevenDaysAgo, 'yyyy-MM-dd'),
      end: format(today, 'yyyy-MM-dd'),
    },
    todayEmojis,
    pastEmojis,
    stats,
  };
}
```

---

### 3.3 布局算法

#### 3.3.1 容器配置

```typescript
const CONTAINER_CONFIG = {
  today: {
    width: 335,           // 容器宽度 (px)
    height: 150,          // 容器高度 (px)
    padding: 10,          // 内边距
    maxEmojis: 20,        // 最多显示 emoji 数量
  },
  past: {
    width: 335,
    height: 250,
    padding: 10,
    maxEmojis: 50,
  },
};
```

---

#### 3.3.2 随机散落算法

```typescript
/**
 * 随机散落布局，避免 emoji 重叠
 */
function layoutEmojis(
  emojis: GardenEmoji[],
  container: typeof CONTAINER_CONFIG.today
): void {
  const { width, height, padding } = container;
  const positioned: GardenEmoji[] = [];
  
  emojis.forEach(emoji => {
    let validPosition = false;
    let attempts = 0;
    const maxAttempts = 50;
    
    while (!validPosition && attempts < maxAttempts) {
      // 随机生成位置
      emoji.position = {
        x: randomInt(
          padding + emoji.size / 2,
          width - padding - emoji.size / 2
        ),
        y: randomInt(
          padding + emoji.size / 2,
          height - padding - emoji.size / 2
        ),
      };
      
      // 检查是否与已有 emoji 重叠
      validPosition = !positioned.some(other => 
        isOverlapping(emoji, other)
      );
      
      attempts++;
    }
    
    // 如果 50 次尝试后仍未找到位置，缩小尺寸
    if (!validPosition) {
      emoji.size *= 0.8;
      emoji.position = {
        x: randomInt(padding, width - padding),
        y: randomInt(padding, height - padding),
      };
    }
    
    positioned.push(emoji);
  });
}

/**
 * 碰撞检测
 */
function isOverlapping(a: GardenEmoji, b: GardenEmoji): boolean {
  const distance = Math.sqrt(
    Math.pow(a.position.x - b.position.x, 2) +
    Math.pow(a.position.y - b.position.y, 2)
  );
  
  const minDistance = (a.size + b.size) / 2 + 5; // 5px 间距
  return distance < minDistance;
}

/**
 * 计算 emoji 大小（根据时长）
 */
function calculateEmojiSize(duration: number): number {
  // 30 分钟 = 30px
  // 60 分钟 = 40px
  // 120+ 分钟 = 50px
  return Math.min(50, Math.max(30, 30 + duration / 6));
}

/**
 * 计算透明度（越近越不透明）
 */
function calculateOpacity(date: Date): number {
  const daysAgo = differenceInDays(new Date(), date);
  // 今天 = 1.0
  // 昨天 = 0.95
  // 7 天前 = 0.7
  return Math.max(0.7, 1 - daysAgo * 0.05);
}
```

---

### 3.4 UI 组件设计

#### 3.4.1 主组件 EchoGarden.tsx

```typescript
import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './EchoGarden.css';

interface EchoGardenProps {
  onEventClick?: (eventId: string) => void;
}

export const EchoGarden: React.FC<EchoGardenProps> = ({ onEventClick }) => {
  // 状态分类 (A) - UI 临时态
  const [loading, setLoading] = useState(true);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  
  // 状态分类 (C) - 领域数据真相 (从 EventService 查询)
  const [data, setData] = useState<EchoGardenData | null>(null);
  
  // 1. 加载数据 (订阅 EventHub - Epic 2 集成点)
  useEffect(() => {
    loadData();
    
    // TODO: Epic 2 实现后，订阅 EventHub 更新
    // const unsubscribe = EventHub.subscribe('eventsChanged', loadData);
    // return unsubscribe;
  }, []);
  
  async function loadData() {
    setLoading(true);
    try {
      const gardenData = await fetchEchoGardenData();
      setData(gardenData);
    } catch (error) {
      console.error('Failed to load EchoGarden data:', error);
    } finally {
      setLoading(false);
    }
  }
  
  // 2. 空状态
  if (loading) {
    return <EchoGardenLoading />;
  }
  
  if (!data || (data.todayEmojis.length === 0 && data.pastEmojis.length === 0)) {
    return <EchoGardenEmpty onCreateEvent={() => {/* TODO: 导航到创建事件 */}} />;
  }
  
  // 3. 正常渲染
  return (
    <div className="echo-garden">
      {/* Header */}
      <div className="echo-garden-header">
        <button className="back-button" onClick={() => window.history.back()}>
          ← 返回
        </button>
        <h1>EchoGarden</h1>
        <button className="settings-button">⚙️</button>
      </div>
      
      {/* Title */}
      <div className="echo-garden-title">
        <h2>你的回声花园 🌱</h2>
        <p className="subtitle">倾听时间的回声</p>
      </div>
      
      {/* 容器 */}
      <div className="echo-garden-container">
        {/* 上层容器（今天）*/}
        <GardenContainer
          label="今天"
          emojis={data.todayEmojis}
          config={CONTAINER_CONFIG.today}
          onEmojiClick={(id) => {
            setSelectedEmoji(id);
            const emoji = data.todayEmojis.find(e => e.id === id);
            if (emoji) onEventClick?.(emoji.eventId);
          }}
        />
        
        {/* 连接通道 */}
        <div className="connection-channel">
          <div className="channel-line" />
          <div className="channel-line" />
          <div className="channel-line" />
        </div>
        
        {/* 下层容器（过去 7 天）*/}
        <GardenContainer
          label="过去 7 天"
          emojis={data.pastEmojis}
          config={CONTAINER_CONFIG.past}
          onEmojiClick={(id) => {
            setSelectedEmoji(id);
            const emoji = data.pastEmojis.find(e => e.id === id);
            if (emoji) onEventClick?.(emoji.eventId);
          }}
        />
      </div>
      
      {/* 统计 */}
      <div className="echo-garden-stats">
        <div className="stat-item">
          <span className="stat-value">{data.stats.totalEvents}</span>
          <span className="stat-label">个事件</span>
        </div>
        <div className="stat-divider">·</div>
        <div className="stat-item">
          <span className="stat-value">{data.stats.totalHours.toFixed(1)}</span>
          <span className="stat-label">小时</span>
        </div>
        <div className="stat-divider">·</div>
        <div className="stat-item">
          <span className="stat-value">{data.stats.mostUsedEmoji}</span>
          <span className="stat-label">最常用</span>
        </div>
      </div>
      
      {/* 操作按钮 */}
      <div className="echo-garden-actions">
        <button className="action-button secondary">
          查看详情
        </button>
        <button className="action-button primary">
          分享花园 📤
        </button>
      </div>
      
      {/* 事件详情弹窗 */}
      <AnimatePresence>
        {selectedEmoji && (
          <EventDetailModal
            eventId={data.todayEmojis.concat(data.pastEmojis)
              .find(e => e.id === selectedEmoji)?.eventId || ''}
            onClose={() => setSelectedEmoji(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
```

---

#### 3.4.2 容器组件 GardenContainer.tsx

```typescript
import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface GardenContainerProps {
  label: string;
  emojis: GardenEmoji[];
  config: typeof CONTAINER_CONFIG.today;
  onEmojiClick: (id: string) => void;
}

export const GardenContainer: React.FC<GardenContainerProps> = ({
  label,
  emojis,
  config,
  onEmojiClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 启动空闲动画
  useEffect(() => {
    const animator = new IdleAnimator(containerRef.current);
    animator.start();
    
    return () => animator.stop();
  }, [emojis]);
  
  return (
    <div className="garden-container" ref={containerRef}>
      {/* 容器边框 */}
      <div 
        className="container-border"
        style={{
          width: config.width,
          height: config.height,
        }}
      >
        {/* 标签 */}
        <div className="container-label">{label}</div>
        
        {/* Emoji 层 */}
        <div className="emoji-layer">
          {emojis.map(emoji => (
            <EmojiComponent
              key={emoji.id}
              emoji={emoji}
              onClick={() => onEmojiClick(emoji.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
```

---

#### 3.4.3 Emoji 组件 EmojiComponent.tsx

```typescript
interface EmojiComponentProps {
  emoji: GardenEmoji;
  onClick: () => void;
}

export const EmojiComponent: React.FC<EmojiComponentProps> = ({
  emoji,
  onClick,
}) => {
  return (
    <motion.div
      className="garden-emoji"
      data-emoji-id={emoji.id}
      style={{
        position: 'absolute',
        left: emoji.position.x,
        bottom: emoji.position.y,
        fontSize: emoji.size,
        opacity: emoji.opacity,
        transform: `rotate(${emoji.rotation}deg)`,
      }}
      // 入场动画
      initial={emoji.isNew ? { 
        scale: 0, 
        y: -100,
        opacity: 0,
      } : {
        scale: 1,
        y: 0,
        opacity: emoji.opacity,
      }}
      animate={{ 
        scale: 1,
        y: 0,
        opacity: emoji.opacity,
      }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20,
        delay: emoji.isNew ? Math.random() * 0.3 : 0,
      }}
      // 悬停效果
      whileHover={{ 
        scale: 1.2,
        zIndex: 10,
      }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
    >
      {emoji.emoji}
      
      {/* 回声波纹（悬停时显示）*/}
      <div className="echo-ripple" />
    </motion.div>
  );
};
```

---

### 3.5 动画设计

#### 3.5.1 空闲晃动动画

```typescript
/**
 * 空闲动画控制器
 */
class IdleAnimator {
  private container: HTMLElement | null;
  private intervalId: number | null = null;
  
  constructor(container: HTMLElement | null) {
    this.container = container;
  }
  
  start() {
    if (!this.container) return;
    
    // 每 5-10 秒触发一次
    this.intervalId = window.setInterval(() => {
      this.wiggleRandomEmojis();
    }, randomInt(5000, 10000));
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
  
  private wiggleRandomEmojis() {
    if (!this.container) return;
    
    const emojis = this.container.querySelectorAll('.garden-emoji');
    const count = Math.min(5, emojis.length);
    const selected = pickRandom(Array.from(emojis), count);
    
    selected.forEach((emoji) => {
      emoji.classList.add('wiggle');
      
      // 600ms 后移除动画类
      setTimeout(() => {
        emoji.classList.remove('wiggle');
      }, 600);
    });
  }
}
```

---

#### 3.5.2 生长动画（新 emoji 添加时）

```typescript
// 在 EmojiComponent 中已实现
// 通过 framer-motion 的 initial/animate 属性

// 效果：
// 1. 从连接通道位置（y: -100）落下
// 2. 从小到大（scale: 0 → 1）
// 3. 淡入（opacity: 0 → 1）
// 4. 有弹性（spring 动画）
```

---

#### 3.5.3 点击回声动画

```typescript
// CSS 实现
// 点击时，播放声波扩散效果
```

---

### 3.6 CSS 样式

#### 3.6.1 EchoGarden.css

```css
/* ==================== 整体布局 ==================== */
.echo-garden {
  width: 100%;
  max-width: 375px;
  margin: 0 auto;
  padding: 0;
  background: linear-gradient(to bottom, #fafafa, #ffffff);
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ==================== Header ==================== */
.echo-garden-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.back-button,
.settings-button {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  padding: 8px;
  color: #666;
}

.echo-garden-header h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ==================== Title ==================== */
.echo-garden-title {
  text-align: center;
  padding: 24px 20px 16px;
}

.echo-garden-title h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px;
  color: #333;
}

.echo-garden-title .subtitle {
  font-size: 14px;
  color: #999;
  margin: 0;
}

/* ==================== 容器 ==================== */
.echo-garden-container {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.garden-container {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

.container-border {
  position: relative;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  background: linear-gradient(to bottom, #ffffff, #f9f9f9);
  box-shadow: 
    inset 0 2px 4px rgba(0, 0, 0, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.05);
}

.container-label {
  position: absolute;
  top: 8px;
  left: 12px;
  font-size: 12px;
  color: #999;
  font-weight: 500;
  z-index: 1;
}

.emoji-layer {
  position: relative;
  width: 100%;
  height: 100%;
}

/* ==================== 连接通道 ==================== */
.connection-channel {
  width: 60px;
  height: 30px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  position: relative;
  z-index: 0;
}

.channel-line {
  width: 2px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    #e0e0e0,
    transparent
  );
}

/* ==================== Emoji ==================== */
.garden-emoji {
  position: absolute;
  cursor: pointer;
  user-select: none;
  transition: filter 0.2s;
  will-change: transform;
  z-index: 1;
}

.garden-emoji:hover {
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15));
}

/* 晃动动画 */
@keyframes wiggle {
  0%, 100% { 
    transform: rotate(var(--rotation, 0deg)) translateX(0); 
  }
  25% { 
    transform: rotate(calc(var(--rotation, 0deg) - 5deg)) translateX(-2px); 
  }
  75% { 
    transform: rotate(calc(var(--rotation, 0deg) + 5deg)) translateX(2px); 
  }
}

.garden-emoji.wiggle {
  animation: wiggle 0.6s ease-in-out;
}

/* 回声波纹 */
.echo-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid currentColor;
  opacity: 0;
  pointer-events: none;
}

.garden-emoji:hover .echo-ripple {
  animation: ripple 1s ease-out infinite;
}

@keyframes ripple {
  0% {
    opacity: 0.6;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2);
  }
}

/* ==================== 统计 ==================== */
.echo-garden-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 24px 20px;
  font-size: 14px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #333;
}

.stat-label {
  font-size: 12px;
  color: #999;
}

.stat-divider {
  color: #ddd;
  font-size: 16px;
}

/* ==================== 操作按钮 ==================== */
.echo-garden-actions {
  display: flex;
  gap: 12px;
  padding: 0 20px 32px;
}


.action-button {
  flex: 1;
  padding: 14px 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.action-button.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.action-button.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}

.action-button.primary:active {
  transform: translateY(0);
}

.action-button.secondary {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.action-button.secondary:hover {
  background: #f5f7ff;
}

/* ==================== 空状态 ==================== */
.echo-garden-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  text-align: center;
  min-height: 60vh;
}

.empty-illustration {
  font-size: 80px;
  margin-bottom: 24px;
  opacity: 0.6;
}

.empty-message h3 {
  font-size: 20px;
  color: #333;
  margin: 0 0 8px;
}

.empty-message p {
  font-size: 14px;
  color: #999;
  margin: 0 0 32px;
}

.empty-action-button {
  padding: 14px 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 24px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.empty-action-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.empty-tips {
  margin-top: 40px;
  padding: 20px;
  background: #f8f9ff;
  border-radius: 12px;
  text-align: left;
}

.empty-tips h4 {
  font-size: 14px;
  color: #667eea;
  margin: 0 0 12px;
}

.empty-tips ul {
  margin: 0;
  padding-left: 20px;
}

.empty-tips li {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  line-height: 1.5;
}

/* ==================== 加载状态 ==================== */
.echo-garden-loading {
  padding: 40px 20px;
  text-align: center;
}

.loading-text {
  font-size: 14px;
  color: #999;
  margin-top: 16px;
}

.skeleton-container {
  width: 335px;
  height: 150px;
  margin: 20px auto;
  border: 2px solid #f0f0f0;
  border-radius: 12px;
  background: #fafafa;
  position: relative;
  overflow: hidden;
}

.skeleton-emoji {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ==================== 事件详情弹窗 ==================== */
.event-detail-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.event-detail-modal {
  background: white;
  border-radius: 16px;
  padding: 24px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}

.modal-emoji {
  font-size: 48px;
  flex-shrink: 0;
}

.modal-title-group {
  flex: 1;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #333;
  margin: 0 0 8px;
}

.modal-time {
  font-size: 14px;
  color: #999;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.modal-close:hover {
  background: #f0f0f0;
}

.modal-content {
  margin-bottom: 20px;
}

.modal-section {
  margin-bottom: 16px;
}

.modal-section-title {
  font-size: 12px;
  color: #999;
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.modal-section-content {
  font-size: 15px;
  color: #333;
  line-height: 1.6;
}

.modal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modal-tag {
  padding: 6px 12px;
  background: #f0f0f0;
  border-radius: 16px;
  font-size: 13px;
  color: #666;
}

.modal-actions {
  display: flex;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
}

.modal-action-button {
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.modal-action-button.primary {
  background: #667eea;
  color: white;
}

.modal-action-button.secondary {
  background: #f0f0f0;
  color: #666;
}

/* ==================== 响应式 ==================== */
@media (max-width: 375px) {
  .echo-garden {
    max-width: 100%;
  }
  
  .container-border {
    width: 100% !important;
  }
  
  .echo-garden-actions {
    flex-direction: column;
  }
  
  .action-button {
    width: 100%;
  }
}

/* ==================== 深色模式（预留）==================== */
@media (prefers-color-scheme: dark) {
  .echo-garden {
    background: linear-gradient(to bottom, #1a1a1a, #0f0f0f);
  }
  
  .container-border {
    background: linear-gradient(to bottom, #2a2a2a, #1f1f1f);
    border-color: #3a3a3a;
  }
  
  .echo-garden-title h2,
  .stat-value,
  .modal-title,
  .modal-section-content {
    color: #f0f0f0;
  }
  
  .subtitle,
  .stat-label,
  .modal-time,
  .modal-section-title {
    color: #999;
  }
}
```

---

### 3.7 空状态组件

#### 3.7.1 EchoGardenEmpty.tsx

```typescript
import React from 'react';

interface EchoGardenEmptyProps {
  onCreateEvent: () => void;
}

export const EchoGardenEmpty: React.FC<EchoGardenEmptyProps> = ({ 
  onCreateEvent 
}) => {
  return (
    <div className="echo-garden-empty">
      {/* 插画 */}
      <div className="empty-illustration">
        🌱
      </div>
      
      {/* 提示文案 */}
      <div className="empty-message">
        <h3>你的回声花园还很安静</h3>
        <p>开始记录第一个事件，让花园生长起来吧！</p>
      </div>
      
      {/* 操作按钮 */}
      <button 
        className="empty-action-button"
        onClick={onCreateEvent}
      >
        创建事件 →
      </button>
      
      {/* 小贴士 */}
      <div className="empty-tips">
        <h4>💡 小贴士</h4>
        <ul>
          <li>在事件标题或标签中添加 emoji，会在花园中显示</li>
          <li>事件时长超过 30 分钟才会出现在花园中</li>
          <li>每天的事件会先显示在上层容器，随后沉淀到下层</li>
          <li>点击任意 emoji，可以回顾那一刻的详细记录</li>
        </ul>
      </div>
    </div>
  );
};
```

---

### 3.8 加载状态组件

#### 3.8.1 EchoGardenLoading.tsx

```typescript
import React from 'react';

export const EchoGardenLoading: React.FC = () => {
  return (
    <div className="echo-garden-loading">
      {/* 骨架屏 - 上层容器 */}
      <div className="skeleton-container">
        {[...Array(8)].map((_, i) => (
          <div
            key={`today-${i}`}
            className="skeleton-emoji"
            style={{
              left: Math.random() * 280 + 20,
              bottom: Math.random() * 100 + 20,
              animationDelay: `${Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
      
      {/* 连接通道 */}
      <div className="connection-channel">
        <div className="channel-line" />
        <div className="channel-line" />
        <div className="channel-line" />
      </div>
      
      {/* 骨架屏 - 下层容器 */}
      <div className="skeleton-container" style={{ height: 250 }}>
        {[...Array(15)].map((_, i) => (
          <div
            key={`past-${i}`}
            className="skeleton-emoji"
            style={{
              left: Math.random() * 280 + 20,
              bottom: Math.random() * 200 + 20,
              animationDelay: `${Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
      
      <div className="loading-text">
        正在培育你的回声花园...
      </div>
    </div>
  );
};
```

---

### 3.9 事件详情弹窗

#### 3.9.1 EventDetailModal.tsx

```typescript
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface EventDetailModalProps {
  eventId: string;
  onClose: () => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  eventId,
  onClose,
}) => {
  const [event, setEvent] = useState<Event | null>(null);
  
  useEffect(() => {
    loadEvent();
  }, [eventId]);
  
  async function loadEvent() {
    const data = await db.events.get(eventId);
    setEvent(data);
  }
  
  if (!event) {
    return null;
  }
  
  return (
    <motion.div
      className="event-detail-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="event-detail-modal"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-emoji">
            {extractEmoji(event)}
          </div>
          <div className="modal-title-group">
            <h3 className="modal-title">{event.title}</h3>
            <p className="modal-time">
              {formatDate(event.startTime, 'MM月dd日 HH:mm')} - 
              {formatDate(event.endTime, 'HH:mm')}
              <span style={{ color: '#667eea', marginLeft: 8 }}>
                ({event.duration}分钟)
              </span>
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        
        {/* Content */}
        <div className="modal-content">
          {event.description && (
            <div className="modal-section">
              <div className="modal-section-title">描述</div>
              <div className="modal-section-content">
                {event.description}
              </div>
            </div>
          )}
          
          {event.tags && event.tags.length > 0 && (
            <div className="modal-section">
              <div className="modal-section-title">标签</div>
              <div className="modal-tags">
                {event.tags.map(tag => (
                  <span key={tag} className="modal-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {event.location && (
            <div className="modal-section">
              <div className="modal-section-title">地点</div>
              <div className="modal-section-content">
                📍 {event.location}
              </div>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="modal-actions">
          <button 
            className="modal-action-button secondary"
            onClick={() => {
              // TODO: 实现编辑功能
              console.log('Edit event:', eventId);
            }}
          >
            编辑
          </button>
          <button 
            className="modal-action-button primary"
            onClick={() => {
              // TODO: 跳转到事件详情页
              window.location.href = `/events/${eventId}`;
            }}
          >
            查看完整记录
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
```

---

## 4. 技术实现细节

### 4.1 依赖库

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "framer-motion": "^10.16.0",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

---

### 4.2 工具函数

#### 4.2.1 utils/emoji.ts

```typescript
/**
 * 从 Event 对象提取 emoji
 * 架构对齐: 基于字段契约优先级
 */
export function extractEmoji(event: Event): string | null {
  // 1. 优先从 emoji 字段 (Canonical 字段)
  if (event.emoji) {
    return event.emoji;
  }
  
  // 2. 从标题提取 (title 可能是 string 或 { simpleTitle: string })
  const titleText = typeof event.title === 'string' 
    ? event.title 
    : event.title?.simpleTitle || '';
  
  const titleEmoji = extractEmojiFromText(titleText);
  if (titleEmoji) return titleEmoji;
  
  // 3. 从标签提取
  if (event.tags && Array.isArray(event.tags)) {
    for (const tag of event.tags) {
      const tagEmoji = extractEmojiFromText(tag);
      if (tagEmoji) return tagEmoji;
    }
  }
  
  // 4. 返回 null (调用方决定默认值)
  return null;
}

/**
 * 从文本中提取第一个 emoji
 */
function extractEmojiFromText(text: string): string | null {
  if (!text) return null;
  
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const match = text.match(emojiRegex);
  return match ? match[0] : null;
}

/**
 * 检查文本是否包含 emoji
 */
export function hasEmoji(text: string): boolean {
  return extractEmojiFromText(text) !== null;
}

/**
 * TimeSpec 解析工具 (架构对齐: TIME_ARCHITECTURE)
 */
export function parseTimeSpec(timeSpec: string): Date {
  // TimeSpec 格式: "YYYY-MM-DD HH:mm:ss"
  return new Date(timeSpec.replace(' ', 'T'));
}
```

---

#### 4.2.2 utils/random.ts

```typescript
/**
 * 生成随机整数 [min, max]
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从数组中随机选择 n 个元素
 */
export function pickRandom<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * 随机颜色（未来主题系统使用）
 */
export function randomColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
  ];
  return colors[randomInt(0, colors.length - 1)];
}
```

---

### 4.3 性能优化

#### 4.3.1 布局缓存

```typescript
import { useMemo } from 'react';

// 在 EchoGarden 组件中使用 useMemo 缓存布局结果
const layoutedData = useMemo(() => {
  if (!data) return null;
  
  // 深拷贝（避免修改原数据）
  const todayEmojis = JSON.parse(JSON.stringify(data.todayEmojis));
  const pastEmojis = JSON.parse(JSON.stringify(data.pastEmojis));
  
  // 计算布局
  layoutEmojis(todayEmojis, CONTAINER_CONFIG.today);
  layoutEmojis(pastEmojis, CONTAINER_CONFIG.past);
  
  return {
    ...data,
    todayEmojis,
    pastEmojis,
  };
}, [data]); // 只有 data 变化时才重新计算
```

---

#### 4.3.2 动画性能

```typescript
// 使用 CSS Transform（GPU 加速）而非 position
// ✅ 好的做法（在 framer-motion 中已实现）
<motion.div
  style={{
    transform: `translate(${x}px, ${y}px)`,
    willChange: 'transform', // 提示浏览器优化
  }}
/>

// ❌ 避免（会触发 reflow）
<motion.div
  style={{
    left: x,
    top: y,
  }}
/>
```

---

#### 4.3.3 虚拟化（如果 emoji 超过 100 个）

```typescript
// 可选：如果用户有大量历史数据
import { useVirtualizer } from '@tanstack/react-virtual';

// 只渲染可见区域的 emoji
const virtualizer = useVirtualizer({
  count: pastEmojis.length,
  getScrollElement: () => containerRef.current,
  estimateSize: () => 40,
  overscan: 5,
});
```

---

## 5. 测试计划

### 5.1 单元测试

```typescript
// tests/layout.test.ts
describe('layoutEmojis', () => {
  it('should place emojis without overlap', () => {
    const emojis: GardenEmoji[] = generateMockEmojis(20);
    layoutEmojis(emojis, CONTAINER_CONFIG.today);
    
    // 检查是否有重叠
    for (let i = 0; i < emojis.length; i++) {
      for (let j = i + 1; j < emojis.length; j++) {
        expect(isOverlapping(emojis[i], emojis[j])).toBe(false);
      }
    }
  });
  
  it('should place all emojis within container', () => {
    const emojis: GardenEmoji[] = generateMockEmojis(20);
    const container = CONTAINER_CONFIG.today;
    layoutEmojis(emojis, container);
    
    emojis.forEach(emoji => {
      expect(emoji.position.x).toBeGreaterThanOrEqual(0);
      expect(emoji.position.x).toBeLessThanOrEqual(container.width);
      expect(emoji.position.y).toBeGreaterThanOrEqual(0);
      expect(emoji.position.y).toBeLessThanOrEqual(container.height);
    });
  });
});
```

---

### 5.2 集成测试

```typescript
// tests/EchoGarden.test.tsx
describe('EchoGarden', () => {
  it('should render empty state when no events', async () => {
    const { getByText } = render(<EchoGarden />);
    await waitFor(() => {
      expect(getByText('你的回声花园还很安静')).toBeInTheDocument();
    });
  });
  
  it('should render emojis when events exist', async () => {
    const mockData = generateMockData();
    jest.spyOn(global, 'fetchEchoGardenData').mockResolvedValue(mockData);
    
    const { container } = render(<EchoGarden />);
    await waitFor(() => {
      const emojis = container.querySelectorAll('.garden-emoji');
      expect(emojis.length).toBeGreaterThan(0);
    });
  });
  
  it('should open modal when emoji clicked', async () => {
    const mockData = generateMockData();
    const { container, getByText } = render(<EchoGarden />);
    
    const firstEmoji = container.querySelector('.garden-emoji');
    fireEvent.click(firstEmoji);
    
    await waitFor(() => {
      expect(getByText('查看完整记录')).toBeInTheDocument();
    });
  });
});
```

---

### 5.3 视觉回归测试

```typescript
// tests/visual.test.ts
import { test, expect } from '@playwright/test';

test('EchoGarden visual regression', async ({ page }) => {
  await page.goto('/echo-garden');
  
  // 等待动画完成
  await page.waitForTimeout(1000);
  
  // 截图对比
  await expect(page).toHaveScreenshot('echo-garden.png', {
    maxDiffPixels: 100,
  });
});
```

---

## 6. 数据埋点

### 6.1 关键指标

```typescript
// analytics.ts
export const trackEchoGarden = {
  // 页面访问
  pageView: () => {
    analytics.track('EchoGarden_PageView', {
      timestamp: Date.now(),
    });
  },
  
  // 停留时长
  timeSpent: (duration: number) => {
    analytics.track('EchoGarden_TimeSpent', {
      duration, // 秒
    });
  },
  
  // Emoji 点击
  emojiClick: (emoji: GardenEmoji) => {
    analytics.track('EchoGarden_EmojiClick', {
      emojiId: emoji.id,
      emoji: emoji.emoji,
      layer: emoji.layer,
      duration: emoji.duration,
    });
  },
  
  // 分享
  share: (method: 'native' | 'download') => {
    analytics.track('EchoGarden_Share', {
      method,
    });
  },
  
  // 空状态 CTA 点击
  emptyActionClick: () => {
    analytics.track('EchoGarden_EmptyAction_Click');
  },
};
```

---

## 7. 发布计划

### 7.1 Phase 1: MVP（Week 1-2）

**目标：核心功能可用**

- [x] 数据结构设计
- [x] 布局算法实现
- [x] 基础 UI 组件
- [x] 点击交互
- [x] 空/加载状态
- [ ] 基础动画（生长、晃动）

**验收标准：**
- 能正确展示过去 7 天的事件
- emoji 布局无重叠
- 点击可查看事件详情
- 空状态有引导

---

### 7.2 Phase 2: 优化（Week 3）

**目标：体验流畅**

- [ ] 性能优化（缓存、GPU 加速）
- [ ] 动画打磨（回声波纹）
- [ ] 细节调整（透明度、旋转）
- [ ] 响应式适配
- [ ] 暗色模式

**验收标准：**
- 100+ emoji 流畅运行
- 动画自然不卡顿
- 各尺寸设备正常显示

---

### 7.3 Phase 3: 扩展（Future）

**目标：游戏化增强**

- [ ] 成就系统
- [ ] 时间胶囊
- [ ] 分享功能
- [ ] 主题切换
- [ ] 音效

---

## 8. 风险与对策

| 风险 | 影响 | 概率 | 对策 |
|-----|------|------|------|
| emoji 过多导致性能问题 | 高 | 中 | 限制最多 50 个，虚拟化，Canvas 渲染 |
| 布局算法找不到位置 | 中 | 低 | 缩小 emoji 尺寸，放宽间距要求 |
| 用户没有 emoji 数据 | 高 | 高 | 空状态引导，自动识别文本 emoji |
| 跨浏览器兼容性 | 中 | 中 | 使用 Polyfill，降级方案 |
| 动画卡顿 | 中 | 中 | 使用 CSS Transform，减少动画复杂度 |

---

## 9. 附录

### 9.1 完整文件结构

```
src/
├── components/
│   └── EchoGarden/
│       ├── index.tsx                 # 导出
│       ├── EchoGarden.tsx            # 主组件
│       ├── GardenContainer.tsx       # 容器组件
│       ├── EmojiComponent.tsx        # Emoji 组件
│       ├── EchoGardenEmpty.tsx       # 空状态
│       ├── EchoGardenLoading.tsx     # 加载状态
│       ├── EventDetailModal.tsx      # 事件详情弹窗
│       ├── EchoGarden.css            # 样式
│       └── types.ts                  # 类型定义
│
├── utils/
│   ├── emoji.ts                      # Emoji 工具
│   ├── random.ts                     # 随机数工具
│   ├── layout.ts                     # 布局算法
│   └── analytics.ts                  # 埋点
│
├── hooks/
│   └── useEchoGarden.ts              # 自定义 Hook
│
└── tests/
    ├── layout.test.ts
    ├── EchoGarden.test.tsx
    └── visual.test.ts
```

---

### 9.2 快速开始（供 Copilot 使用）

**步骤 1：安装依赖**
```bash
npm install framer-motion date-fns
npm install -D @types/react
```

**步骤 2：创建文件**
```bash
mkdir -p src/components/EchoGarden
mkdir -p src/utils
touch src/components/EchoGarden/EchoGarden.tsx
touch src/components/EchoGarden/EchoGarden.css
touch src/utils/layout.ts
```

**步骤 3：复制代码**
将上述代码复制到对应文件


**步骤 4：集成到路由**
```typescript
// App.tsx
import { EchoGarden } from './components/EchoGarden';

<Route path="/echo-garden" element={<EchoGarden />} />
```

**步骤 5：启动开发服务器**
```bash
npm run dev
```

---

### 9.3 示例数据生成器

```typescript
// utils/mockData.ts
/**
 * 生成测试数据（供开发调试使用）
 */
export function generateMockData(): EchoGardenData {
  const today = new Date();
  const todayEmojis: GardenEmoji[] = [];
  const pastEmojis: GardenEmoji[] = [];
  
  // 今天的事件
  const todayEmojiList = ['💪', '📝', '☕', '🎯', '💻', '🎵'];
  todayEmojiList.forEach((emoji, i) => {
    todayEmojis.push({
      id: `today-${i}`,
      eventId: `event-today-${i}`,
      emoji,
      title: `今天的任务 ${i + 1}`,
      date: format(today, 'yyyy-MM-dd'),
      startTime: format(addHours(today, i), 'HH:mm'),
      endTime: format(addHours(today, i + 1), 'HH:mm'),
      duration: 60,
      size: randomInt(30, 50),
      opacity: 1,
      rotation: randomInt(-5, 5),
      isNew: true,
      layer: 'today',
      position: { x: 0, y: 0 },
    });
  });
  
  // 过去 7 天的事件
  const pastEmojiList = [
    '📚', '🏃', '🎵', '🌸', '☕', '💪',
    '📝', '🎯', '💻', '🍕', '⚡', '🎨',
    '🌟', '🔥', '🎮', '📱', '✈️', '🎬'
  ];
  
  for (let day = 1; day <= 7; day++) {
    const date = subDays(today, day);
    const count = randomInt(2, 4); // 每天 2-4 个事件
    
    for (let i = 0; i < count; i++) {
      const emoji = pastEmojiList[randomInt(0, pastEmojiList.length - 1)];
      pastEmojis.push({
        id: `past-${day}-${i}`,
        eventId: `event-past-${day}-${i}`,
        emoji,
        title: `任务 Day ${day}-${i + 1}`,
        date: format(date, 'yyyy-MM-dd'),
        startTime: format(addHours(date, i * 2), 'HH:mm'),
        endTime: format(addHours(date, i * 2 + 1), 'HH:mm'),
        duration: randomInt(30, 120),
        size: randomInt(30, 50),
        opacity: Math.max(0.7, 1 - day * 0.05),
        rotation: randomInt(-5, 5),
        isNew: false,
        layer: 'past',
        position: { x: 0, y: 0 },
      });
    }
  }
  
  // 计算统计
  const totalEvents = todayEmojis.length + pastEmojis.length;
  const totalHours = (
    todayEmojis.reduce((sum, e) => sum + e.duration, 0) +
    pastEmojis.reduce((sum, e) => sum + e.duration, 0)
  ) / 60;
  
  const emojiCount: { [key: string]: number } = {};
  [...todayEmojis, ...pastEmojis].forEach(e => {
    emojiCount[e.emoji] = (emojiCount[e.emoji] || 0) + 1;
  });
  const mostUsedEmoji = Object.keys(emojiCount).reduce((a, b) => 
    emojiCount[a] > emojiCount[b] ? a : b
  );
  
  return {
    dateRange: {
      start: format(subDays(today, 7), 'yyyy-MM-dd'),
      end: format(today, 'yyyy-MM-dd'),
    },
    todayEmojis,
    pastEmojis,
    stats: {
      totalEvents,
      totalHours,
      mostUsedEmoji,
      consecutiveDays: 7,
    },
  };
}
```

---

### 9.4 类型定义文件

```typescript
// components/EchoGarden/types.ts

/**
 * EchoGarden 数据结构
 */
export interface EchoGardenData {
  dateRange: {
    start: string;
    end: string;
  };
  todayEmojis: GardenEmoji[];
  pastEmojis: GardenEmoji[];
  stats: GardenStats;
}

/**
 * 花园中的 Emoji
 */
export interface GardenEmoji {
  id: string;
  eventId: string;
  emoji: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  position: {
    x: number;
    y: number;
  };
  size: number;
  opacity: number;
  rotation: number;
  isNew: boolean;
  layer: 'today' | 'past';
}

/**
 * 统计信息
 */
export interface GardenStats {
  totalEvents: number;
  totalHours: number;
  mostUsedEmoji: string;
  consecutiveDays: number;
}

/**
 * 容器配置
 */
export interface ContainerConfig {
  width: number;
  height: number;
  padding: number;
  maxEmojis: number;
}

/**
 * 事件数据（从数据库读取）
 */
export interface Event {
  id: string;
  title: string;
  emoji?: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  tags?: string[];
  location?: string;
}
```

---

### 9.5 布局算法完整实现

```typescript
// utils/layout.ts
import { GardenEmoji, ContainerConfig } from '../components/EchoGarden/types';
import { randomInt } from './random';

/**
 * 布局算法配置
 */
export const CONTAINER_CONFIG = {
  today: {
    width: 335,
    height: 150,
    padding: 10,
    maxEmojis: 20,
  },
  past: {
    width: 335,
    height: 250,
    padding: 10,
    maxEmojis: 50,
  },
} as const;

/**
 * 主布局函数
 */
export function layoutEmojis(
  emojis: GardenEmoji[],
  container: ContainerConfig
): void {
  // 1. 限制数量
  const limitedEmojis = emojis.slice(0, container.maxEmojis);
  
  // 2. 按时长排序（大的先放）
  limitedEmojis.sort((a, b) => b.duration - a.duration);
  
  // 3. 已放置的 emoji
  const positioned: GardenEmoji[] = [];
  
  // 4. 逐个放置
  limitedEmojis.forEach(emoji => {
    const position = findValidPosition(emoji, positioned, container);
    emoji.position = position;
    positioned.push(emoji);
  });
  
  // 5. 更新原数组
  emojis.forEach((emoji, i) => {
    if (i < limitedEmojis.length) {
      emoji.position = limitedEmojis[i].position;
    }
  });
}

/**
 * 找到有效位置
 */
function findValidPosition(
  emoji: GardenEmoji,
  positioned: GardenEmoji[],
  container: ContainerConfig
): { x: number; y: number } {
  const { width, height, padding } = container;
  const maxAttempts = 100;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = randomInt(
      padding + emoji.size / 2,
      width - padding - emoji.size / 2
    );
    const y = randomInt(
      padding + emoji.size / 2,
      height - padding - emoji.size / 2
    );
    
    const candidate = { x, y };
    
    // 检查是否与已有 emoji 重叠
    const hasCollision = positioned.some(other =>
      isColliding(
        { ...emoji, position: candidate },
        other
      )
    );
    
    if (!hasCollision) {
      return candidate;
    }
  }
  
  // 如果找不到位置，缩小尺寸并放在随机位置
  console.warn(`Failed to find position for emoji ${emoji.id}, shrinking...`);
  emoji.size *= 0.8;
  
  return {
    x: randomInt(padding, width - padding),
    y: randomInt(padding, height - padding),
  };
}

/**
 * 碰撞检测
 */
export function isColliding(a: GardenEmoji, b: GardenEmoji): boolean {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  const minDistance = (a.size + b.size) / 2 + 5; // 5px 间距
  
  return distance < minDistance;
}

/**
 * 计算 emoji 大小
 */
export function calculateEmojiSize(duration: number): number {
  // 30 分钟 = 30px
  // 60 分钟 = 40px
  // 120+ 分钟 = 50px
  return Math.min(50, Math.max(30, 30 + duration / 6));
}

/**
 * 计算透明度
 */
export function calculateOpacity(date: Date): number {
  const now = new Date();
  const daysAgo = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // 今天 = 1.0
  // 昨天 = 0.95
  // 7 天前 = 0.7
  return Math.max(0.7, 1 - daysAgo * 0.05);
}

/**
 * 优化布局（减少重叠区域）
 * 使用力导向算法
 */
export function optimizeLayout(
  emojis: GardenEmoji[],
  container: ContainerConfig,
  iterations: number = 10
): void {
  for (let iter = 0; iter < iterations; iter++) {
    emojis.forEach((emoji, i) => {
      let fx = 0;
      let fy = 0;
      
      // 计算斥力（避免重叠）
      emojis.forEach((other, j) => {
        if (i === j) return;
        
        const dx = emoji.position.x - other.position.x;
        const dy = emoji.position.y - other.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < (emoji.size + other.size) / 2 + 10) {
          const force = 2 / (distance + 1);
          fx += (dx / distance) * force;
          fy += (dy / distance) * force;
        }
      });
      
      // 计算引力（保持在容器内）
      const centerX = container.width / 2;
      const centerY = container.height / 2;
      const dcx = centerX - emoji.position.x;
      const dcy = centerY - emoji.position.y;
      
      fx += dcx * 0.01;
      fy += dcy * 0.01;
      
      // 更新位置
      emoji.position.x += fx;
      emoji.position.y += fy;
      
      // 边界约束
      emoji.position.x = Math.max(
        container.padding + emoji.size / 2,
        Math.min(
          container.width - container.padding - emoji.size / 2,
          emoji.position.x
        )
      );
      emoji.position.y = Math.max(
        container.padding + emoji.size / 2,
        Math.min(
          container.height - container.padding - emoji.size / 2,
          emoji.position.y
        )
      );
    });
  }
}
```

---

### 9.6 自定义 Hook

```typescript
// hooks/useEchoGarden.ts
import { useState, useEffect, useCallback } from 'react';
import { EchoGardenData } from '../components/EchoGarden/types';
import { fetchEchoGardenData } from '../utils/data';

export function useEchoGarden() {
  const [data, setData] = useState<EchoGardenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchEchoGardenData();
      setData(result);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load EchoGarden data:', err);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  return {
    data,
    loading,
    error,
    reload: loadData,
  };
}
```

---

## 10. 部署与监控

### 10.1 部署清单

```bash
# 1. 构建生产版本
npm run build

# 2. 运行测试
npm run test

# 3. 检查打包大小
npm run analyze

# 4. 部署到服务器
npm run deploy
```

---

### 10.2 性能监控

```typescript
// 监控关键指标
const performanceObserver = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log('Performance:', {
      name: entry.name,
      duration: entry.duration,
      startTime: entry.startTime,
    });
    
    // 上报到分析服务
    analytics.track('Performance_Metric', {
      metric: entry.name,
      duration: entry.duration,
    });
  });
});

performanceObserver.observe({ 
  entryTypes: ['measure', 'navigation'] 
});

// 标记关键时刻
performance.mark('echogarden-start');
// ... 渲染代码 ...
performance.mark('echogarden-end');
performance.measure('echogarden-render', 'echogarden-start', 'echogarden-end');
```

---

### 10.3 错误监控

```typescript
// utils/errorTracking.ts
export function setupErrorTracking() {
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // 上报错误
    analytics.track('Error', {
      message: event.error?.message,
      stack: event.error?.stack,
      filename: event.filename,
      lineno: event.lineno,
    });
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    
    analytics.track('UnhandledRejection', {
      reason: event.reason,
    });
  });
}
```

---

## 11. FAQ

### 11.1 开发相关

**Q: 为什么选择 framer-motion 而不是原生 CSS 动画？**

A: framer-motion 提供了更好的声明式 API 和复杂动画编排能力。对于 EchoGarden 的生长动画、晃动动画、模态框动画，framer-motion 可以大幅简化代码。

---

**Q: 如果 emoji 数量超过 100 个怎么办？**

A: 
1. 限制显示最近 50 个
2. 实现虚拟滚动
3. 考虑使用 Canvas 渲染（性能更好）

---

**Q: 如何处理没有 emoji 的事件？**

A:
1. 优先从事件的 `emoji` 字段读取
2. 从标题中提取 emoji
3. 从标签中提取 emoji
4. 使用默认 emoji `📝`

---

### 11.2 用户相关

**Q: 用户的花园数据会丢失吗？**

A: 不会。所有数据都存储在本地 IndexedDB 中，只要不清空浏览器数据，花园就会一直存在。

---

**Q: 可以分享我的花园吗？**

A: 可以。Phase 3 会实现截图分享功能，支持保存为图片或分享链接。

---

**Q: 为什么今天的事件没有出现在花园里？**

A: 需要满足以下条件：
1. 事件时长 ≥ 30 分钟
2. 事件包含 emoji（标题、标签或 emoji 字段）
3. 事件已结束（未来事件不显示）

---

## 12. 总结

这份 PRD 包含了 **EchoGarden（回声花园）** 功能的完整设计和实现细节：

### ✅ 已完成

1. **功能定位与核心价值**
2. **数据结构设计**（类型定义、数据模型）
3. **UI 组件设计**（6 个核心组件）
4. **布局算法**（随机散落 + 碰撞检测）
5. **动画系统**（生长、晃动、回声波纹）
6. **CSS 样式**（包含响应式和深色模式）
7. **工具函数**（emoji 提取、随机数、布局优化）
8. **性能优化方案**（缓存、GPU 加速、虚拟化）
9. **测试计划**（单元测试、集成测试、视觉回归）
10. **数据埋点方案**
11. **发布计划**（3 个阶段）
12. **风险对策**

---

### 📦 交付物

这份 PRD 可以直接交给 **GitHub Copilot** 或任何开发者，包含了从零到一实现 EchoGarden 所需的全部信息：

- ✅ 完整的代码示例
- ✅ 详细的技术规范
- ✅ 清晰的实现步骤
- ✅ 完善的测试方案
- ✅ 可扩展的架构设计

---

### 🚀 下一步

1. **创建 GitHub Issue**，复制这份 PRD
2. **让 Copilot 生成代码**，逐个组件实现
3. **迭代优化**，根据实际效果调整参数
4. **用户测试**，收集反馈并改进

---

**祝你的 EchoGarden 开发顺利！🌸**

如果需要我帮你生成 Markdown 文件，或者需要进一步优化某个细节，随时告诉我！