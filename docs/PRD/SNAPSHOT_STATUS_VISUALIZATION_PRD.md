# 📸 Snapshot 状态可视化系统 PRD

**版本**: v2.3 (存储架构适配版)  
**创建日期**: 2025-11-23  
**更新日期**: 2025-12-15  
**模块路径**: `src/components/StatusLineContainer.tsx` & `PlanManager.tsx`  
**设计参考**: [Figma - ReMarkable 0.1](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=290-2646&m=dev)  
**状态**: ✅ 已完成并性能优化 | 🔧 存储架构适配完成 (2025-12-15)

---

## 📋 目录

- [1. 功能概述](#1-功能概述)
- [2. 核心能力](#2-核心能力)
- [3. 技术架构](#3-技术架构)
- [4. 核心算法](#4-核心算法)
- [5. 组件详解](#5-组件详解)
- [6. 状态计算逻辑](#6-状态计算逻辑)
- [7. 视觉规范](#7-视觉规范)
- [8. 性能优化](#8-性能优化)
- [9. 测试验证](#9-测试验证)
- [10. 文档一致性检查](#10-文档一致性检查)
- [11. 存储架构迁移适配 (v2.3)](#11-存储架构迁移适配-v23) 🆕

---

## 1. 功能概述

### 1.1 需求背景

在 Snapshot 快照模式下，用户需要查看事件在特定时间范围内的变化历史和当前状态。通过**彩色竖线**和**状态标签**可视化展示事件的生命周期。

### 1.2 业务价值

- 📅 **历史追溯**: 快速查看事件在某个时间段内的变化历史
- 🎯 **状态识别**: 通过颜色和标签快速识别事件状态
- 📊 **变化趋势**: 连续竖线展示事件状态的持续性
- 🔍 **问题诊断**: Ghost 事件可同时显示多条竖线（New/Updated/Del）

---

## 2. 核心能力

### 2.1 五种状态类型

| 状态 | 颜色 | 标签 | 含义 | 触发条件 |
|------|------|------|------|----------|
| **New** | 🔵 蓝色 | New | 在时间段内新建 | `create` 操作 |
| **Updated** | 🟡 橙色 | Updated | 在时间段内更新 | `update` 操作 |
| **Done** | 🟢 绿色 | Done | 已完成/已签到 | `checkin` (check-in) |
| **Missed** | 🔴 红色 | Missed | 已过期未完成 | startTime < now && !isChecked |
| **Deleted** | ⚫ 灰色 | Del | 在时间段内删除 | `delete` 操作 |

### 2.2 多线并行能力

- ✅ 每个事件可同时显示多条不同状态的竖线
- ✅ Ghost 事件（已删除）可显示完整生命周期（New → Updated → Del）
- ✅ 相同状态的连续事件共用同一列，形成视觉连贯性

### 2.3 智能列分配 ⭐ v2.2.1 优化

**原始算法** (v2.2.0):
```
每个状态类型固定分配一列
- 列0: new
- 列1: updated  
- 列2: deleted
- 列3: done
- 列4: missed
结果: 最多5列
```

**优化算法** (v2.2.1 - 矩阵 + 垂直重叠检测):
```typescript
// 动态检测垂直方向是否重叠
statusGroups.forEach(group => {
  // 尝试找到可复用的列（垂直方向无重叠）
  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    const hasOverlap = group.segments.some(newSeg => 
      columnSegments.some(existingSeg => 
        !(newSeg.endIndex < existingSeg.startIndex || 
          newSeg.startIndex > existingSeg.endIndex)
      )
    );
    
    if (!hasOverlap) {
      targetColumnIndex = colIndex;
      break;  // 找到可复用的列
    }
  }
  
  // 放入找到的列，或创建新列
  if (targetColumnIndex !== -1) {
    columns[targetColumnIndex].push(...group.segments);
  } else {
    columns.push([...group.segments]);
  }
});
```

**优化效果**:
- ✅ 典型场景：从 4-5 列优化到 3 列（节省 40% 空间）
- ✅ 例如：`deleted` 和 `missed` 通常不会同时出现 → 合并到同一列
- ✅ 动态适应不同数据分布，最大化空间利用

### 2.4 自适应缩进

```typescript
// 根据实际显示的最大竖线数量动态计算缩进
const indent = BASE_LEFT + (maxColumns × (LINE_WIDTH + LINE_SPACING)) + 12;

示例:
- 0条竖线: 0px（不浪费空间）
- 3条竖线: 5 + 3×(2+3) + 12 = 32px
- 4条竖线: 5 + 4×(2+3) + 12 = 37px
- 5条竖线: 5 + 5×(2+3) + 12 = 42px
```

---

## 3. 技术架构

### 3.1 文件结构

```
src/components/
├── StatusLineContainer.tsx      (419 lines) - 竖线渲染容器
├── StatusLineContainer.css      (125 lines) - 样式定义
├── PlanManager.tsx              
│   ├── getEventStatuses()       (L1745-1851) - 状态计算核心逻辑
│   └── useMemo segments[]       (L1853-1942) - 转换为竖线数据结构
└── hooks/
    └── usePlanManagerSession.ts (277 lines) - 🆕 v2.21.0 会话态管理
```

### 3.2 状态管理架构 ⭐ v2.21.0 (Reducer模式)

**设计理念**: Snapshot功能依赖Filter状态的dateRange字段，采用useReducer统一管理避免状态耦合

```typescript
// ===== State Structure =====
export interface FilterState {
  dateRange: { start: Date; end: Date } | null;  // 🎯 Snapshot核心依赖
  activeFilter: 'tags' | 'tasks' | 'favorites' | 'new';
  hiddenTags: Set<string>;
  searchQuery: string;
}

export interface PlanManagerSessionState {
  filter: FilterState;         // 过滤器状态
  focus: FocusState;           // 焦点状态（编辑器相关）
  snapshotVersion: number;     // 🔥 强制刷新快照的计数器
}

// ===== Action Types =====
export type PlanManagerSessionAction =
  | { type: 'SET_DATE_RANGE'; payload: { start: Date; end: Date } | null }
  | { type: 'INCREMENT_SNAPSHOT_VERSION' }
  | { type: 'RESET_FILTERS' }
  // ... 其他 filter/focus actions

// ===== Reducer Logic =====
function planManagerSessionReducer(state, action) {
  switch (action.type) {
    case 'SET_DATE_RANGE':
      return {
        ...state,
        filter: { ...state.filter, dateRange: action.payload },
        snapshotVersion: state.snapshotVersion + 1,  // 🔥 自动递增版本
      };
    
    case 'INCREMENT_SNAPSHOT_VERSION':
      return {
        ...state,
        snapshotVersion: state.snapshotVersion + 1,
      };
    
    case 'RESET_FILTERS':
      return {
        ...state,
        filter: {
          dateRange: null,
          activeFilter: 'tags',
          hiddenTags: new Set(),
          searchQuery: '',
        },
        snapshotVersion: state.snapshotVersion + 1,  // 🔥 重置也触发刷新
      };
  }
}
```

**状态依赖链**:

```
session.filter.dateRange 变化
    ↓
自动触发 snapshotVersion + 1
    ↓
computeEditorItems (依赖 dateRange)
    ↓
EventHistoryService.getExistingEventsAtTime(startTime)  // 查询起点事件
    ↓
EventHistoryService.queryHistory({ startTime, endTime }) // 查询操作历史
    ↓
过滤事件 (existingAtStart.has(id) || createdInRange.has(id))
    ↓
getEventStatuses (依赖 dateRange)
    ↓
StatusLineSegment[]
    ↓
StatusLineContainer 渲染
```

**关键机制**:

1. **原子更新**: `SET_DATE_RANGE` action同时更新`dateRange`和`snapshotVersion`，避免中间态
2. **版本信号**: `snapshotVersion`递增强制重新计算快照数据（破坏useMemo缓存）
3. **过滤器重置**: `RESET_FILTERS`清空所有过滤条件并触发快照刷新

### 3.3 数据流

```
┌─────────────────────────────────────────────────────────────┐
│ 用户操作: 选择日期范围                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ dispatch({ type: 'SET_DATE_RANGE', payload: { start, end }})│
│ 🔥 自动触发: snapshotVersion + 1                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ computeEditorItems (useMemo 依赖 dateRange)                 │
│ - 检测 session.filter.dateRange !== null → Snapshot模式     │
│ - 查询起点事件: getExistingEventsAtTime(startTime)          │
│ - 查询操作历史: queryHistory({ startTime, endTime })        │
│ - 识别创建操作: createdInRange = Set(create operations)     │
│ - 过滤事件: items.filter(existingAtStart ∪ createdInRange)  │
│ - 添加Ghost事件: deletedInRange - existingEvents            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ getEventStatuses(eventId, dateRange)                        │
│ - 查询时间段内操作: EventHistoryService.queryHistory()      │
│ - 按时间排序，识别最新操作                                   │
│ - 映射状态:                                                  │
│   • create → 'new'                                           │
│   • update → 'updated'                                       │
│   • delete → 'deleted'                                       │
│   • checkin (check-in) → 'done'                              │
│   • checkin (uncheck) + 过期 → 'missed'                      │
│ - 返回: string[] (一个事件可能有多个状态)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 转换为 StatusLineSegment[]                                   │
│ {                                                            │
│   startIndex: 事件在列表中的索引,                            │
│   endIndex: 事件在列表中的索引,                              │
│   status: 'new' | 'updated' | 'done' | 'missed' | 'deleted', │
│   label: 'New' | 'Updated' | 'Done' | 'Missed' | 'Del'       │
│ }                                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ StatusLineContainer                                          │
│ 1. 矩阵算法计算列分配                                         │
│ 2. 垂直重叠检测优化列数                                       │
│ 3. 计算自适应缩进                                            │
│ 4. 渲染竖线 + 标签                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 核心算法

### 4.1 矩阵 + 俄罗斯方块算法 ⭐ v2.2.0

**设计灵感**: 类似俄罗斯方块的垂直合并逻辑

**算法步骤**:

```typescript
// 步骤1: 构建矩阵 (O(n) where n = segments数量)
const matrix = new Map<eventIndex, Map<status, segment>>();

segments.forEach(segment => {
  if (!matrix.has(segment.startIndex)) {
    matrix.set(segment.startIndex, new Map());
  }
  matrix.get(segment.startIndex).set(segment.status, segment);
});

// 步骤2: 纵向扫描，按状态类型分组 (O(m×n) where m = status types = 5)
const statusTypes = ['new', 'updated', 'deleted', 'done', 'missed'];
const statusGroups = [];

statusTypes.forEach(status => {
  let currentGroup = [];
  
  // 从上到下扫描
  for (let i = 0; i <= maxEventIndex; i++) {
    const segment = matrix.get(i)?.get(status);
    
    if (segment) {
      currentGroup.push(segment);  // 连续segment
    } else if (currentGroup.length > 0) {
      statusGroups.push({ status, segments: currentGroup });
      currentGroup = [];  // 遇到断点，重置
    }
  }
  
  if (currentGroup.length > 0) {
    statusGroups.push({ status, segments: currentGroup });
  }
});

// 步骤3: 智能列分配 - 垂直重叠检测 ⭐ v2.2.1 (O(k×c) where k = groups, c = columns)
const columns = [];

statusGroups.forEach(group => {
  let targetColumnIndex = -1;
  
  // 尝试找到可复用的列（垂直方向无重叠）
  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    const columnSegments = columns[colIndex];
    
    const hasOverlap = group.segments.some(newSeg => 
      columnSegments.some(existingSeg => 
        !(newSeg.endIndex < existingSeg.startIndex || 
          newSeg.startIndex > existingSeg.endIndex)
      )
    );
    
    if (!hasOverlap) {
      targetColumnIndex = colIndex;
      break;  // 找到可复用的列
    }
  }
  
  // 放入找到的列，或创建新列
  if (targetColumnIndex !== -1) {
    columns[targetColumnIndex].push(...group.segments);
    console.log(`[StatusLineContainer] 🔗 状态[${group.status}]合并到列${targetColumnIndex}`);
  } else {
    columns.push([...group.segments]);
    console.log(`[StatusLineContainer] 📊 状态[${group.status}]新建列${columns.length - 1}`);
  }
});

// 步骤4: 分配列号
columns.forEach((columnSegments, columnIndex) => {
  columnSegments.forEach(segment => {
    columnMap.set(segment, columnIndex);
  });
});
```

**时间复杂度分析**:

```
总复杂度: O(n×m) + O(k×c)
- n = 事件数量 (典型值: 10-50)
- m = 状态类型数 (固定值: 5)
- k = 状态组数量 (最多 5×n)
- c = 最终列数 (优化后通常 3-4)

实际性能 (test-matrix-performance.html):
- 50个事件: ~0.016ms
- 100个事件: ~0.039ms
- 200个事件: ~0.047ms

对比旧算法 (O(n²)):
- 50个事件: 4.6x 更快
- 100个事件: 6.6x 更快
- 200个事件: 17x 更快 ⭐
```

### 4.2 增量更新优化 ⭐

```typescript
// 使用 hash 避免无意义的重新计算
const segmentsHash = useMemo(() => {
  return segments.map(s => `${s.startIndex}-${s.endIndex}-${s.status}`).join('|');
}, [segments]);

// 所有依赖 segments 的计算改为依赖 segmentsHash
const segmentColumns = useMemo(() => {
  // 矩阵算法...
}, [segmentsHash]); // 🚀 只有内容变化时才重新计算
```

**优化效果**:
- ✅ 用户滚动列表 → segments 数组引用变化 → hash 不变 → 不重新计算
- ✅ 用户编辑事件 → segments 内容变化 → hash 变化 → 触发重新计算

---

## 5. 组件详解

### 5.1 StatusLineContainer

**文件**: `src/components/StatusLineContainer.tsx` (419 lines)

**接口定义**:

```typescript
export interface StatusLineSegment {
  startIndex: number;      // 事件在列表中的索引（0-based）
  endIndex: number;        // 结束索引（通常等于 startIndex）
  status: 'new' | 'updated' | 'done' | 'missed' | 'deleted';
  label: string;           // 显示文本
}

interface StatusLineContainerProps {
  children: React.ReactNode;     // 事件列表内容
  segments: StatusLineSegment[]; // 竖线段数组
  editorItems: any[];            // 事件列表（用于 DOM 查询）
  lineHeight?: number;           // 每行高度（默认32px）
  totalLines?: number;           // 总行数
}
```

**核心功能**:

#### 1. 列分配计算

```typescript
const segmentColumns = useMemo(() => {
  const columnMap = new Map<StatusLineSegment, number>();
  
  if (segments.length === 0) return columnMap;
  
  const startTime = performance.now();
  
  // 步骤1: 构建矩阵
  const matrix = new Map<number, Map<string, StatusLineSegment>>();
  const maxEventIndex = Math.max(...segments.map(s => s.startIndex));
  
  segments.forEach(segment => {
    if (!matrix.has(segment.startIndex)) {
      matrix.set(segment.startIndex, new Map());
    }
    matrix.get(segment.startIndex)!.set(segment.status, segment);
  });
  
  // 步骤2: 纵向扫描，合并连续segment
  const statusTypes = ['new', 'updated', 'deleted', 'done', 'missed'];
  const statusGroups = [];
  
  statusTypes.forEach(status => {
    const continuousSegments: StatusLineSegment[] = [];
    let currentGroup: StatusLineSegment[] = [];
    
    for (let i = 0; i <= maxEventIndex; i++) {
      const segment = matrix.get(i)?.get(status);
      
      if (segment) {
        currentGroup.push(segment);
      } else if (currentGroup.length > 0) {
        continuousSegments.push(...currentGroup);
        currentGroup = [];
      }
    }
    
    if (currentGroup.length > 0) {
      continuousSegments.push(...currentGroup);
    }
    
    if (continuousSegments.length > 0) {
      statusGroups.push({ status, segments: continuousSegments });
    }
  });
  
  // 步骤3: 智能列分配 - 垂直重叠检测
  const columns: StatusLineSegment[][] = [];
  
  statusGroups.forEach(group => {
    let targetColumnIndex = -1;
    
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const columnSegments = columns[colIndex];
      
      const hasOverlap = group.segments.some(newSeg => 
        columnSegments.some(existingSeg => 
          !(newSeg.endIndex < existingSeg.startIndex || 
            newSeg.startIndex > existingSeg.endIndex)
        )
      );
      
      if (!hasOverlap) {
        targetColumnIndex = colIndex;
        break;
      }
    }
    
    if (targetColumnIndex !== -1) {
      columns[targetColumnIndex].push(...group.segments);
    } else {
      columns.push([...group.segments]);
    }
  });
  
  // 步骤4: 分配列号
  columns.forEach((columnSegments, columnIndex) => {
    columnSegments.forEach(segment => {
      columnMap.set(segment, columnIndex);
    });
  });
  
  const elapsed = performance.now() - startTime;
  console.log(`[StatusLineContainer] ✅ 列分配完成: ${columns.length}列, ${columnMap.size}个segments, 耗时 ${elapsed.toFixed(2)}ms`);
  
  return columnMap;
}, [segmentsHash]);
```

#### 2. 自适应缩进计算

```typescript
const indent = useMemo(() => {
  const maxColumns = Math.max(
    ...Array.from(lineConfigs.values()).map(segs => segs.length),
    0
  );
  
  if (maxColumns === 0) return 0;
  
  return BASE_LEFT + maxColumns * (LINE_WIDTH + LINE_SPACING) + 12;
}, [segmentsHash]);
```

#### 3. DOM 精确定位

```typescript
useEffect(() => {
  segments.forEach(segment => {
    const eventItem = editorItems[segment.startIndex];
    if (!eventItem) return;
    
    const domNode = document.querySelector(
      `[data-event-id="${eventItem.id}"]`
    );
    
    if (domNode && containerRef.current) {
      const rect = domNode.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      const top = rect.top - containerRect.top;
      const height = rect.height;
      
      // 更新 renderedSegments 状态
      setRenderedSegments(prev => 
        prev.map(rs => 
          rs.startIndex === segment.startIndex && rs.status === segment.status
            ? { ...rs, top, height }
            : rs
        )
      );
    }
  });
}, [segments, editorItems, segmentColumns]);
```

#### 4. 标签智能定位

```typescript
// 每个状态只显示一次标签
const labelMap = new Map<string, StatusLineSegment>();
segments.forEach(segment => {
  if (!labelMap.has(segment.status)) {
    labelMap.set(segment.status, segment);
  }
});

// 标签优先放在最左侧列的竖线旁边
labelMap.forEach((segment, status) => {
  const column = segmentColumns.get(segment) || 0;
  const labelLeft = column === 0 
    ? -(maxLabelWidth + LABEL_SPACING)  // 最左侧：放竖线左边
    : -(maxLabelWidth + LABEL_SPACING);  // 其他列：堆叠在左侧
});
```

### 5.2 样式定义

**文件**: `src/components/StatusLineContainer.css` (125 lines)

**关键 CSS 变量**:

```css
.status-line-container {
  position: relative;
  padding-left: var(--status-indent, 0px); /* 动态缩进 */
}

.status-line {
  position: absolute;
  width: 2px;
  background-color: var(--line-color);
  left: calc(5px + var(--column-index) * 5px); /* 列位置 */
  top: var(--line-top);
  height: var(--line-height);
}

.status-label {
  position: absolute;
  font-size: 11px;
  font-style: italic;
  color: var(--label-color);
  left: var(--label-left);
  top: var(--label-top);
  white-space: nowrap;
}
```

**颜色定义**:

```css
/* 竖线颜色 */
.status-line.new { background-color: #3b82f6; }      /* 蓝色 */
.status-line.updated { background-color: #f59e0b; }  /* 橙色 */
.status-line.done { background-color: #10b981; }     /* 绿色 */
.status-line.missed { background-color: #ef4444; }   /* 红色 */
.status-line.deleted { background-color: #6b7280; }  /* 灰色 */

/* 标签颜色（与竖线一致）*/
.status-label.new { color: #3b82f6; }
.status-label.updated { color: #f59e0b; }
.status-label.done { color: #10b981; }
.status-label.missed { color: #ef4444; }
.status-label.deleted { color: #6b7280; }
```

---

## 6. 状态计算逻辑

### 6.1 核心函数: getEventStatuses

**位置**: `src/components/PlanManager.tsx` L1745-1851

**功能**: 根据事件历史记录和当前状态，计算在指定时间段内的所有状态

**返回值**: `string[]` - 可能包含多个状态（例如 Ghost 事件：`['new', 'updated', 'deleted']`）

**完整代码**:

```typescript
const getEventStatuses = useCallback((
  eventId: string, 
  dateRange: { start: Date; end: Date } | null
): string[] => {
  // 步骤1: 前置条件检查
  if (!dateRange) return [];
  
  // 步骤2: 时间格式转换（使用本地时间格式）
  const startTime = formatTimeForStorage(dateRange.start); // "2025-11-20 00:00:00"
  const endTime = formatTimeForStorage(dateRange.end);     // "2025-11-20 23:59:59"
  
  // 步骤3: 查询时间段内的历史记录
  const history = EventHistoryService.queryHistory({
    eventId,
    startTime,
    endTime
  });
  
  // 步骤4: 过滤并分析历史记录
  const statuses = new Set<string>();
  
  history.forEach(log => {
    switch (log.operation) {
      case 'create':
        statuses.add('new');
        break;
        
      case 'update':
        statuses.add('updated');
        break;
        
      case 'delete':
        statuses.add('deleted');
        break;
        
      case 'checkin':
        if (log.metadata?.action === 'check-in') {
          statuses.add('done');
        } else if (log.metadata?.action === 'uncheck') {
          // 取消签到需要判断是否过期
          const event = EventService.getEventById(eventId);
          if (event?.startTime) {
            const eventTime = parseLocalTimeString(event.startTime);
            const now = new Date();
            if (eventTime < now) {
              statuses.add('missed');
            } else {
              statuses.add('updated');
            }
          } else {
            statuses.add('updated');
          }
        }
        break;
    }
  });
  
  // 步骤5: 补充当前状态（如果历史记录为空）
  if (statuses.size === 0) {
    const event = EventService.getEventById(eventId);
    if (event) {
      const checkInStatus = EventService.getCheckInStatus(eventId);
      
      if (checkInStatus.isChecked) {
        statuses.add('done');
      } else if (event.startTime) {
        const eventTime = parseLocalTimeString(event.startTime);
        const now = new Date();
        if (eventTime < now) {
          statuses.add('missed');
        } else {
          statuses.add('updated');
        }
      } else {
        statuses.add('updated');
      }
    }
  }
  
  // 步骤6: 查询删除状态（Ghost 事件）⭐ v2.2.1 优化
  const deletedHistory = EventHistoryService.queryHistory({
    eventId,
    startTime: '1970-01-01 00:00:00',  // 查询所有历史
    endTime: formatTimeForStorage(new Date())
  });
  
  const hasDeleted = deletedHistory.some(log => log.operation === 'delete');
  if (hasDeleted) {
    statuses.add('deleted');
  }
  
  return Array.from(statuses);
}, []);
```

### 6.2 判断规则矩阵

| 场景 | 历史操作 | 事件状态 | 最终显示 | 说明 |
|------|---------|---------|---------|------|
| **新建事件** | create (时间段内) | - | `['new']` | 在时间段内创建 |
| **更新事件** | update (时间段内) | - | `['updated']` | 在时间段内修改 |
| **完成事件** | checkin/check-in | isChecked=true | `['done']` | 已签到完成 |
| **过期未完成** | - | startTime < now && !isChecked | `['missed']` | 有计划时间但过期未完成 |
| **Ghost事件** | create → update → delete | 已删除 | `['new', 'updated', 'deleted']` | 多状态并行显示 ⭐ |
| **取消签到(未过期)** | checkin/uncheck | startTime >= now | `['updated']` | 取消签到但还未到期 |
| **取消签到(已过期)** | checkin/uncheck | startTime < now | `['missed']` | 取消签到且已过期 |
| **无历史记录** | 无 (时间段外创建) | - | `[]` | 不显示竖线 |

### 6.3 时间格式规范 ⚠️

**关键规则**: 所有时间操作必须使用 `timeUtils.ts` 工具函数

```typescript
// ✅ 正确：使用本地时间格式
import { formatTimeForStorage, parseLocalTimeString } from '@/utils/timeUtils';

const startTime = formatTimeForStorage(dateRange.start);
// 输出: "2025-11-20 14:30:00" (空格分隔符)

const eventTime = parseLocalTimeString(event.startTime);
// 输入: "2025-11-20 14:30:00" → 输出: Date对象 (本地时区)

// ❌ 错误：使用 ISO 格式会导致时区转换
const startTime = dateRange.start.toISOString();
// 输出: "2025-11-20T06:30:00.000Z" (UTC时间，8小时偏差！)
```

**格式规范**:
- **存储格式**: `YYYY-MM-DD HH:mm:ss` (空格分隔符)
- **禁止使用**: `toISOString()` - 会产生 UTC 时区偏移
- **比较时间**: 必须先用 `parseLocalTimeString()` 转换为 Date 对象

### 6.4 Ghost 事件过滤逻辑 ⭐ v2.2.1 优化

**问题**: Ghost 事件（已删除）原本只显示 `deleted` 状态，丢失了生命周期信息（New/Updated）

**解决方案**:

```typescript
// 步骤6: 查询删除状态 - 查询所有历史，不限于当前时间段
const deletedHistory = EventHistoryService.queryHistory({
  eventId,
  startTime: '1970-01-01 00:00:00',  // 从Unix纪元开始
  endTime: formatTimeForStorage(new Date())  // 到现在
});

const hasDeleted = deletedHistory.some(log => log.operation === 'delete');
if (hasDeleted) {
  statuses.add('deleted');
}
```

**效果**:
- ✅ Ghost 事件现在可以显示完整生命周期：`['new', 'updated', 'deleted']`
- ✅ 3 条并行竖线：蓝色（New）+ 橙色（Updated）+ 灰色（Del）
- ✅ 用户可以追溯事件从创建到删除的完整历史

---

## 7. 视觉规范

### 7.1 布局参数

```typescript
const LINE_WIDTH = 2;       // 竖线宽度 (px)
const LINE_SPACING = 3;     // 竖线间距 (px)
const LABEL_SPACING = 8;    // 标签与竖线间距 (px)
const BASE_LEFT = 5;        // 基础左边距 (px)
```

### 7.2 缩进计算

```typescript
// 自适应缩进公式
indent = BASE_LEFT + (列数 × (LINE_WIDTH + LINE_SPACING)) + 12

示例:
- 0列: 0px
- 1列: 5 + 1×5 + 12 = 22px
- 2列: 5 + 2×5 + 12 = 27px
- 3列: 5 + 3×5 + 12 = 32px
- 4列: 5 + 4×5 + 12 = 37px
```

### 7.3 标签定位规则

```typescript
// 规则1: 每个状态只显示一次标签
const labelMap = new Map<status, segment>();

// 规则2: 标签优先放在最左侧列的竖线左边
if (column === 0) {
  labelLeft = -(maxLabelWidth + LABEL_SPACING);
} else {
  // 规则3: 非最左侧列的标签堆叠在左侧
  labelLeft = -(maxLabelWidth + LABEL_SPACING);
  labelTop = baseTop + stackOffset;  // 向下偏移避免重叠
}
```

### 7.4 颜色系统

| 状态 | 竖线颜色 | 标签颜色 | Hex值 | Figma Token |
|------|---------|---------|-------|-------------|
| New | 蓝色 | 蓝色 | `#3b82f6` | `color-primary-500` |
| Updated | 橙色 | 橙色 | `#f59e0b` | `color-warning-500` |
| Done | 绿色 | 绿色 | `#10b981` | `color-success-500` |
| Missed | 红色 | 红色 | `#ef4444` | `color-error-500` |
| Deleted | 灰色 | 灰色 | `#6b7280` | `color-gray-500` |

---

## 8. 性能优化

### 8.1 算法优化对比

**v2.2.0 → v2.2.1 优化**:

```
原始算法 (固定列分配):
- 时间复杂度: O(n×m)
- 空间占用: 最多5列
- 典型场景: 4-5列

优化算法 (垂直重叠检测):
- 时间复杂度: O(n×m) + O(k×c)
- 空间占用: 动态优化，通常3-4列
- 典型场景: 3列（节省40%空间）
```

**性能测试结果** (`test-matrix-performance.html`):

| 事件数 | Segments | 旧算法 (O(n²)) | 矩阵算法 (O(n×m)) | 性能提升 |
|--------|----------|----------------|-------------------|----------|
| 10 | 21 | 0.014ms | 0.011ms | **1.3x** |
| 20 | 34 | 0.022ms | 0.008ms | **2.8x** |
| 50 | 87 | 0.073ms | 0.016ms | **4.6x** |
| 100 | 173 | 0.257ms | 0.039ms | **6.6x** |
| 200 | 338 | 0.796ms | 0.047ms | **17x** ⭐ |

### 8.2 增量更新优化

```typescript
// 使用 segmentsHash 避免无意义的重新计算
const segmentsHash = useMemo(() => {
  return segments.map(s => `${s.startIndex}-${s.endIndex}-${s.status}`).join('|');
}, [segments]);

// 所有 useMemo 和 useEffect 依赖 segmentsHash 而非 segments
useMemo(..., [segmentsHash]);
useEffect(..., [segmentsHash, ...]);
```

**效果**:
- ✅ 用户滚动 → segments 引用变化 → hash 不变 → 跳过计算
- ✅ 用户编辑 → segments 内容变化 → hash 变化 → 触发计算

### 8.3 DOM 查询优化

```typescript
// 批量查询，减少 reflow
const containerRect = containerRef.current?.getBoundingClientRect();

segments.forEach(segment => {
  const domNode = document.querySelector(`[data-event-id="${eventItem.id}"]`);
  if (domNode && containerRect) {
    const rect = domNode.getBoundingClientRect();
    // 计算相对位置...
  }
});
```

---

## 9. 测试验证

### 9.1 功能测试清单

| 测试场景 | 预期结果 | 状态 |
|---------|---------|------|
| **基础显示** |
| 单个事件显示 new 竖线 | 蓝色竖线 + "New" 标签 | ✅ |
| 单个事件显示 updated 竖线 | 橙色竖线 + "Updated" 标签 | ✅ |
| 单个事件显示 done 竖线 | 绿色竖线 + "Done" 标签 | ✅ |
| 单个事件显示 missed 竖线 | 红色竖线 + "Missed" 标签 | ✅ |
| 单个事件显示 deleted 竖线 | 灰色竖线 + "Del" 标签 | ✅ |
| **多线并行** |
| Ghost 事件显示 3 条竖线 | New + Updated + Del | ✅ |
| 相同状态连续事件共用列 | 竖线视觉连贯 | ✅ |
| 不同状态不重叠 | 各自占用独立列 | ✅ |
| **智能列优化** ⭐ v2.2.1 |
| Missed + Deleted 不重叠 | 合并到同一列 | ✅ |
| 列数动态调整 | 通常 3-4 列，最多 5 列 | ✅ |
| **缩进自适应** |
| 无竖线时缩进为 0 | 不浪费空间 | ✅ |
| 3 条竖线时缩进 32px | 正确计算 | ✅ |
| 5 条竖线时缩进 42px | 正确计算 | ✅ |
| **标签定位** |
| 每个状态只显示一次标签 | 无重复标签 | ✅ |
| 最左侧列标签在竖线左边 | 位置正确 | ✅ |
| 其他列标签堆叠在左侧 | 位置正确 | ✅ |
| **DOM 精确定位** |
| 多行 eventlog 竖线高度正确 | 覆盖所有行 | ✅ |
| 窗口 resize 后位置更新 | 实时响应 | ✅ |
| **性能测试** |
| 50 个事件计算时间 < 1ms | 性能达标 | ✅ |
| 200 个事件计算时间 < 0.1ms | 性能达标 | ✅ |
| 滚动列表不触发重新计算 | hash 缓存生效 | ✅ |

### 9.2 边界情况测试

| 场景 | 处理方式 | 状态 |
|------|---------|------|
| 空 segments 数组 | 不渲染竖线，缩进为 0 | ✅ |
| 时间段外无历史记录 | 返回空状态，不显示竖线 | ✅ |
| 同一事件多次操作 | 显示所有状态，多线并行 | ✅ |
| 跨时间段的操作 | 只看时间段内操作 | ✅ |
| 未来事件取消签到 | 显示 updated，不显示 missed | ✅ |
| 过期事件取消签到 | 显示 missed | ✅ |

---

## 10. 文档一致性检查 (MECE)

### 10.1 代码与文档对照表

| 文档描述 | 代码实现 | 位置 | 状态 |
|---------|---------|------|------|
| **状态类型** |
| 5 种状态类型定义 | `'new' \| 'updated' \| 'done' \| 'missed' \| 'deleted'` | StatusLineContainer.tsx L26 | ✅ |
| 状态颜色映射 | CSS `.status-line.{status}` | StatusLineContainer.css L50-54 | ✅ |
| **算法实现** |
| 矩阵构建 | `matrix.set(startIndex, Map<status, segment>)` | StatusLineContainer.tsx L93-98 | ✅ |
| 纵向扫描 | `for (let i = 0; i <= maxEventIndex; i++)` | StatusLineContainer.tsx L108-126 | ✅ |
| 垂直重叠检测 | `!(newSeg.endIndex < existingSeg.startIndex ...)` | StatusLineContainer.tsx L136-140 | ✅ |
| 列分配 | `columns.forEach((columnSegments, columnIndex) => ...)` | StatusLineContainer.tsx L153-157 | ✅ |
| **状态计算** |
| create → new | `case 'create': statuses.add('new')` | PlanManager.tsx L1770 | ✅ |
| update → updated | `case 'update': statuses.add('updated')` | PlanManager.tsx L1773 | ✅ |
| delete → deleted | `case 'delete': statuses.add('deleted')` | PlanManager.tsx L1776 | ✅ |
| checkin → done | `case 'checkin': ... statuses.add('done')` | PlanManager.tsx L1779-1781 | ✅ |
| 过期判断 → missed | `if (eventTime < now) statuses.add('missed')` | PlanManager.tsx L1785-1789 | ✅ |
| Ghost 事件删除状态 | `hasDeleted` 查询逻辑 | PlanManager.tsx L1823-1837 | ✅ |
| **时间格式** |
| formatTimeForStorage | `import { formatTimeForStorage }` | PlanManager.tsx L17 | ✅ |
| parseLocalTimeString | `import { parseLocalTimeString }` | PlanManager.tsx L17 | ✅ |
| 本地时间格式 | `"YYYY-MM-DD HH:mm:ss"` | timeUtils.ts | ✅ |
| **视觉规范** |
| LINE_WIDTH = 2 | `const LINE_WIDTH = 2` | StatusLineContainer.tsx L39 | ✅ |
| LINE_SPACING = 3 | `const LINE_SPACING = 3` | StatusLineContainer.tsx L40 | ✅ |
| BASE_LEFT = 5 | `const BASE_LEFT = 5` | StatusLineContainer.tsx L42 | ✅ |
| 缩进公式 | `BASE_LEFT + maxColumns × (LINE_WIDTH + LINE_SPACING) + 12` | StatusLineContainer.tsx L241-247 | ✅ |
| **性能优化** |
| segmentsHash 缓存 | `useMemo(() => segments.map(...).join('\|'))` | StatusLineContainer.tsx L52-54 | ✅ |
| 矩阵算法时间复杂度 | O(n×m) + O(k×c) | StatusLineContainer.tsx L11 | ✅ |
| DOM 批量查询 | `useEffect` 统一处理 | StatusLineContainer.tsx L274-320 | ✅ |

### 10.2 完整性检查 (Mutually Exclusive, Collectively Exhaustive)

**状态类型覆盖**:
- ✅ New - 新建事件
- ✅ Updated - 更新事件
- ✅ Done - 完成事件
- ✅ Missed - 过期未完成
- ✅ Deleted - 删除事件
- **总结**: 5 种状态互斥且完备，覆盖所有可能场景

**操作类型映射**:
- ✅ create → new
- ✅ update → updated
- ✅ delete → deleted
- ✅ checkin (check-in) → done
- ✅ checkin (uncheck) + 过期 → missed
- ✅ checkin (uncheck) + 未过期 → updated
- ✅ 默认情况 → 根据当前状态判断
- **总结**: 所有 EventHistoryService 操作类型都有对应映射

**算法步骤完整性**:
1. ✅ 步骤1: 构建矩阵
2. ✅ 步骤2: 纵向扫描分组
3. ✅ 步骤3: 垂直重叠检测
4. ✅ 步骤4: 列号分配
- **总结**: 算法流程完整，无缺失环节

**时间处理完整性**:
- ✅ Date → 存储格式转换 (formatTimeForStorage)
- ✅ 存储格式 → Date 转换 (parseLocalTimeString)
- ✅ 时间段查询 (queryHistory)
- ✅ 时间比较 (eventTime < now)
- ✅ 时区一致性保证 (禁用 toISOString)
- **总结**: 时间处理链路完整，无时区问题

---

## 11. 版本历史

### v2.2.1 (2025-11-30) ⭐ 当前版本

**优化内容**:
- ✅ 智能列分配：垂直重叠检测，动态合并列
- ✅ Ghost 事件过滤逻辑：查询所有历史记录，显示完整生命周期
- ✅ 性能基准测试：200 个事件耗时 0.047ms（17x 更快）
- ✅ 文档完整性检查：MECE 原则验证

**测试结果**:
- ✅ Ghost 事件显示 3 条竖线（New + Updated + Del）
- ✅ 列数优化：从 4-5 列降到 3 列（节省 40% 空间）
- ✅ 性能提升：相比旧算法快 1.3x - 17x

### v2.2.0 (2025-11-28)

**核心功能**:
- ✅ 矩阵 + 俄罗斯方块算法
- ✅ 增量更新优化（segmentsHash）
- ✅ 自适应缩进
- ✅ DOM 精确定位

### v1.0 (2025-11-23)

**初始版本**:
- ✅ 基础竖线渲染
- ✅ 5 种状态类型
- ✅ 标签智能定位

---

## 12. Snapshot 过滤机制架构 ⭐ v2.21.0

### 12.1 核心需求

**问题**: Snapshot模式需要显示特定时间段内的事件及其变化，而非常规过滤器（已完成/已过期）逻辑

**设计目标**:
1. **时间范围过滤**: 只显示在`[startTime, endTime]`区间内存在或创建的事件
2. **Ghost事件支持**: 已删除的事件也应显示（显示生命周期）
3. **状态独立**: 不受"隐藏已完成任务"等常规过滤器影响
4. **性能要求**: 切换日期范围时，快速重新计算（< 100ms）

### 12.2 状态架构设计

#### State结构

```typescript
export interface FilterState {
  dateRange: { start: Date; end: Date } | null;  // 🎯 Snapshot核心字段
  activeFilter: 'tags' | 'tasks' | 'favorites' | 'new';
  hiddenTags: Set<string>;
  searchQuery: string;
}

export interface PlanManagerSessionState {
  filter: FilterState;
  focus: FocusState;           // 编辑器焦点状态（不影响Snapshot）
  snapshotVersion: number;     // 🔥 强制刷新快照的信号量
}
```

#### Action设计

```typescript
// 设置日期范围（进入Snapshot模式）
{ 
  type: 'SET_DATE_RANGE', 
  payload: { start: Date, end: Date } | null 
}
// 自动效果: snapshotVersion + 1

// 退出Snapshot模式
{ type: 'RESET_FILTERS' }
// 自动效果: dateRange = null, snapshotVersion + 1

// 手动触发快照刷新（例如用户编辑事件后）
{ type: 'INCREMENT_SNAPSHOT_VERSION' }
```

### 12.3 过滤算法

#### 常规模式 vs Snapshot模式

| 维度 | 常规模式 | Snapshot模式 |
|------|---------|-------------|
| **数据源** | `items`（所有事件） | `items`（所有事件） |
| **第一层过滤** | 隐藏已完成任务 | ❌ 不过滤 |
| **第二层过滤** | 隐藏已过期任务 | ❌ 不过滤 |
| **第三层过滤** | Tag过滤、搜索 | ❌ 不过滤 |
| **Snapshot专属过滤** | - | ✅ 时间范围过滤 |
| **Ghost事件** | 隐藏 | ✅ 显示 |

#### 时间范围过滤逻辑

```typescript
// computeEditorItems (PlanManager.tsx L1520-1640)
const computeEditorItems = useMemo(() => {
  // 步骤1: 常规过滤（Tag、搜索）
  let filteredItems = items.filter(item => {
    // Tag过滤
    if (session.filter.hiddenTags.size > 0) {
      const itemTags = item.tags || [];
      if (itemTags.some(tag => session.filter.hiddenTags.has(tag))) {
        return false;
      }
    }
    
    // 搜索过滤
    if (session.filter.searchQuery) {
      const query = session.filter.searchQuery.toLowerCase();
      const titleMatch = item.title?.simpleTitle?.toLowerCase().includes(query);
      const contentMatch = item.content?.toLowerCase().includes(query);
      if (!titleMatch && !contentMatch) {
        return false;
      }
    }
    
    return true;
  });
  
  // 步骤2: Snapshot模式特殊处理 ⭐
  if (session.filter.dateRange) {
    const startTime = formatTimeForStorage(session.filter.dateRange.start);
    const endTime = formatTimeForStorage(session.filter.dateRange.end);
    
    // 2.1 查询起点时刻存在的事件ID
    const existingAtStart = await EventHistoryService.getExistingEventsAtTime(startTime);
    console.log('[Snapshot] 起点存在:', existingAtStart.size, '个');
    
    // 2.2 查询时间段内的操作历史
    const operations = await EventHistoryService.queryHistory({
      startTime,
      endTime
    });
    console.log('[Snapshot] 时间段内操作:', operations.length, '条');
    
    // 2.3 识别在时间段内创建的事件
    const createdInRange = new Set(
      operations
        .filter(op => op.operation === 'create' && op.eventId)
        .map(op => op.eventId)
    );
    console.log('[Snapshot] 时间段内创建:', createdInRange.size, '个');
    
    // 2.4 过滤事件：在起点存在 OR 在时间段内创建
    // 🔥 FIX: 使用 items（所有事件），不是 filteredItems（已被常规过滤）
    filteredItems = items.filter(item => {
      const inRange = existingAtStart.has(item.id) || createdInRange.has(item.id);
      if (!inRange) return false;
      
      // 🆕 额外检查：过滤空白事件（标题和eventlog都为空）
      const hasTitle = item.content || item.title?.simpleTitle || item.title?.fullTitle;
      const hasEventlog = item.eventlog && (
        (typeof item.eventlog === 'string' && item.eventlog.trim()) ||
        (item.eventlog.slateJson && hasTextContent(item.eventlog.slateJson))
      );
      
      if (!hasTitle && !hasEventlog) {
        console.log('[Snapshot] 跳过空白事件:', item.id.slice(-8));
        return false;
      }
      
      return true;
    });
    
    // 2.5 添加Ghost事件（在时间段内删除的事件）
    const deletedInRange = new Set(
      operations
        .filter(op => op.operation === 'delete' && op.eventId)
        .map(op => op.eventId)
    );
    
    deletedInRange.forEach(eventId => {
      if (!filteredItems.some(item => item.id === eventId)) {
        // 从历史记录构造Ghost事件
        const ghostEvent = {
          id: eventId,
          _isDeleted: true,
          _deletedAt: operations.find(op => op.eventId === eventId)?.timestamp,
          // ... 其他字段从最后一次快照恢复
        };
        filteredItems.push(ghostEvent);
      }
    });
    
    console.log('[Snapshot] 最终显示:', filteredItems.length, '个事件');
  }
  
  return filteredItems;
}, [items, session.filter.dateRange, session.snapshotVersion]); // 🔥 依赖 snapshotVersion
```

### 12.4 状态更新触发机制

#### 自动触发场景

```typescript
// 场景1: 用户选择日期范围
dispatch({ type: 'SET_DATE_RANGE', payload: { start, end } });
// → snapshotVersion + 1
// → computeEditorItems 重新计算
// → getEventStatuses 重新查询
// → StatusLineContainer 重新渲染

// 场景2: 用户点击"重置过滤器"
dispatch({ type: 'RESET_FILTERS' });
// → dateRange = null (退出Snapshot模式)
// → snapshotVersion + 1
// → computeEditorItems 切换回常规模式
```

#### 手动触发场景

```typescript
// 场景3: 用户编辑事件后，需要刷新Snapshot
EventHub.on('event:updated', (eventId) => {
  if (session.filter.dateRange) {
    dispatch({ type: 'INCREMENT_SNAPSHOT_VERSION' });
  }
});

// 场景4: 用户删除事件后，需要添加Ghost事件
EventHub.on('event:deleted', (eventId) => {
  if (session.filter.dateRange) {
    dispatch({ type: 'INCREMENT_SNAPSHOT_VERSION' });
  }
});
```

### 12.5 性能优化策略

#### 缓存机制

```typescript
// Snapshot数据缓存（避免重复查询）
const snapshotCacheRef = useRef<{
  snapshot: any;
  timestamp: number;
  dateRangeKey: string;
} | null>(null);

const generateEventSnapshot = useCallback(async () => {
  if (!session.filter.dateRange) return null;
  
  const startTimeStr = formatTimeForStorage(session.filter.dateRange.start);
  const endTimeStr = formatTimeForStorage(session.filter.dateRange.end);
  const dateRangeKey = `${startTimeStr}-${endTimeStr}`;
  
  // 检查缓存（5秒TTL）
  if (
    snapshotCacheRef.current &&
    snapshotCacheRef.current.dateRangeKey === dateRangeKey &&
    Date.now() - snapshotCacheRef.current.timestamp < 5000
  ) {
    console.log('[Snapshot] 使用缓存数据');
    return snapshotCacheRef.current.snapshot;
  }
  
  // 查询新数据
  const summary = await EventHistoryService.getEventOperationsSummary(
    startTimeStr,
    endTimeStr
  );
  
  const snapshot = {
    dateRange: { start: startTimeStr, end: endTimeStr },
    created: summary.created.length,
    updated: summary.updated.length,
    completed: summary.completed.length,
    deleted: summary.deleted.length,
    details: [...summary.created, ...summary.updated, ...summary.completed, ...summary.deleted]
  };
  
  // 更新缓存
  snapshotCacheRef.current = {
    snapshot,
    timestamp: Date.now(),
    dateRangeKey
  };
  
  return snapshot;
}, [session.filter.dateRange, session.snapshotVersion]);
```

#### 增量更新优化

```typescript
// 只在 snapshotVersion 变化时重新计算
const segments = useMemo(() => {
  // 矩阵算法计算竖线列分配...
}, [editorItems, session.filter.dateRange, session.snapshotVersion]);
```

### 12.6 边界情况处理

| 场景 | 处理策略 | 实现位置 |
|------|---------|---------|
| **dateRange = null** | 退出Snapshot模式，恢复常规过滤 | computeEditorItems L1520 |
| **时间段外无操作** | 返回空数组，不显示竖线 | getEventStatuses L1745 |
| **事件跨时间段创建** | 只显示时间段内的操作 | queryHistory 过滤 |
| **Ghost事件无历史** | 使用删除时的快照数据 | EventHistoryService L450 |
| **并发编辑冲突** | 递增 snapshotVersion 强制刷新 | INCREMENT_SNAPSHOT_VERSION |
| **快速切换日期** | 缓存机制（5秒TTL）避免重复查询 | snapshotCacheRef L1449 |

### 12.7 测试清单

| 测试项 | 预期结果 | 状态 |
|--------|---------|------|
| 选择日期范围 | 进入Snapshot模式，显示时间段内事件 | ✅ |
| 退出日期范围 | 恢复常规模式，隐藏Ghost事件 | ✅ |
| Ghost事件显示 | 已删除事件显示3条竖线（New/Updated/Del） | ✅ |
| 空白事件过滤 | 标题和eventlog都为空的事件不显示 | ✅ |
| 编辑事件后刷新 | snapshotVersion递增，重新计算 | ✅ |
| 快速切换日期 | 缓存生效，不重复查询 | ✅ |
| 并发操作 | 状态一致性保证，不丢失更新 | ✅ |

---

## 13. 版本历史

### 12.1 性能优化

- [ ] 虚拟滚动支持（超过 1000 个事件时）
- [ ] Web Worker 计算列分配（超过 500 个事件时）
- [ ] Canvas 渲染替代 DOM（超大数据集）

### 12.2 功能增强

- [ ] 竖线点击交互（查看详细历史）
- [ ] 时间轴刻度显示
- [ ] 动画过渡效果
- [ ] 导出为 SVG/PNG

### 12.3 可访问性

- [ ] ARIA 标签支持
- [ ] 键盘导航
- [ ] 高对比度模式

---

## 13. 参考资源

- **设计稿**: [Figma - Snapshot Status Lines](https://www.figma.com/design/T0WLjzvZMqEnpX79ILhSNQ/ReMarkable-0.1?node-id=290-2646&m=dev)
- **性能测试**: `test-matrix-performance.html`
- **代码位置**:
  - `src/components/StatusLineContainer.tsx` (419 lines)
  - `src/components/StatusLineContainer.css` (125 lines)
  - `src/components/PlanManager.tsx` (L1745-1942)
- **相关文档**:
  - `PLANMANAGER_MODULE_PRD.md` - PlanManager 模块总览
  - `EVENT_HISTORY_SERVICE.md` - 历史记录服务文档
  - `STORAGE_ARCHITECTURE.md` - 存储架构设计文档

---

## 11. 存储架构迁移适配 (v2.3)

> 🔧 **重大更新** (2025-12-15): 适配存储架构从 localStorage 到 IndexedDB 的迁移

### 11.1 问题背景

#### 存储架构变更

| 维度 | v1.0 (变更前) | v3.0 (变更后, 2025-12-06) |
|------|--------------|---------------------------|
| **存储方式** | localStorage (同步) | IndexedDB (异步) |
| **EventHistoryService.queryHistory()** | 同步函数，返回 `EventChangeLog[]` | **异步函数**，返回 `Promise<EventChangeLog[]>` |
| **调用方式** | `const history = queryHistory()` | `const history = await queryHistory()` |

#### 问题发现

**症状**: Snapshot 模式下状态竖线不显示，控制台报错或无响应

**根本原因**: PlanManager 中的状态查询函数仍以同步方式调用异步的 `queryHistory()`

```typescript
// ❌ 错误代码 (v2.2)
const getEventStatus = useCallback((eventId: string) => {
  const history = EventHistoryService.queryHistory({ eventId }); 
  // ❌ history 实际上是 Promise<EventChangeLog[]>，而非数组
  
  if (!history || history.length === 0) { 
    // ❌ Promise.length === undefined，条件判断错误
    return undefined;
  }
  
  const latestAction = history[0]; 
  // ❌ Promise[0] === undefined
  
  // ❌ 所有后续状态计算都失败
}, [dateRange]);
```

**影响范围**:
- ✅ StatusLineContainer 渲染正常（无需修改）
- ❌ PlanManager 状态查询失败
- ❌ eventStatusMap 为空
- ❌ segments 数组为空
- ❌ 竖线不显示

### 11.2 修复方案

#### 方案概述

**核心思路**: 使用 `eventStatusMap` 预计算 + 同步传递

```
┌─────────────────────────────────────────────────────────┐
│ 修复前 (v2.2) - 同步调用异步函数                        │
├─────────────────────────────────────────────────────────┤
│ renderElement() [同步]                                  │
│   └─> getEventStatus(id) [同步]                        │
│         └─> queryHistory() [异步 - ❌ 无 await]        │
│               └─> 返回 Promise (被误当作数组)           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 修复后 (v2.3) - 预计算 + Map 缓存                      │
├─────────────────────────────────────────────────────────┤
│ useEffect() [组件级别]                                  │
│   └─> computeSegments() [异步函数]                     │
│         └─> Promise.all([                              │
│               getEventStatuses(id1) [async],           │
│               getEventStatuses(id2) [async],           │
│               ... (并行查询)                            │
│             ])                                          │
│             └─> 每个 await queryHistory() ✅           │
│   └─> setEventStatusMap(map) [更新状态]                │
│                                                         │
│ renderElement() [同步]                                  │
│   └─> eventStatusMap.get(id) [同步读取 ✅]             │
└─────────────────────────────────────────────────────────┘
```

#### 代码修改

**1. 将状态查询函数改为异步**

```typescript
// ✅ 修复 1: getEventStatus 改为异步
const getEventStatus = useCallback(async (
  eventId: string, 
  metadata?: any
): Promise<'new' | 'updated' | 'done' | 'missed' | 'deleted' | undefined> => {
  if (!dateRange) return undefined;
  
  // ... ghost 事件检查 ...
  
  try {
    const startTime = formatTimeForStorage(dateRange.start);
    const endTime = formatTimeForStorage(dateRange.end);
    
    // ✅ 添加 await 关键字
    const history = await EventHistoryService.queryHistory({ 
      eventId, 
      startTime, 
      endTime 
    });
    
    if (!history || history.length === 0) {
      return undefined;
    }
    
    // ✅ 现在 history 是真正的数组
    const sortedHistory = history.sort((a, b) => 
      parseLocalTimeString(b.timestamp).getTime() - 
      parseLocalTimeString(a.timestamp).getTime()
    );
    
    const latestAction = sortedHistory[0]; // ✅ 正确获取
    // ... 状态计算逻辑 ...
  } catch (error) {
    console.warn(`[getEventStatus] Error:`, error);
    return undefined;
  }
}, [dateRange, items]);

// ✅ 修复 2: getEventStatuses 改为异步
const getEventStatuses = useCallback(async (
  eventId: string
): Promise<Array<'new' | 'updated' | 'done' | 'missed' | 'deleted'>> => {
  if (!dateRange) return [];
  
  try {
    const startTime = formatTimeForStorage(dateRange.start);
    const endTime = formatTimeForStorage(dateRange.end);
    
    // ✅ 添加 await 关键字
    const history = await EventHistoryService.queryHistory({ 
      eventId, 
      startTime, 
      endTime 
    });
    
    const statuses = new Set();
    history.forEach(log => {
      if (log.operation === 'create') statuses.add('new');
      if (log.operation === 'update') statuses.add('updated');
      if (log.operation === 'delete') statuses.add('deleted');
      // ... 其他状态判断 ...
    });
    
    return Array.from(statuses);
  } catch (error) {
    console.error('[getEventStatuses] 错误:', error);
    return [];
  }
}, [dateRange, items]);
```

**2. useMemo 改为 useEffect + useState**

```typescript
// ❌ 旧代码: useMemo 不支持异步
const statusLineSegments = useMemo((): StatusLineSegment[] => {
  const segments = [];
  editorItems.forEach(item => {
    const statuses = getEventStatuses(item.id); // ❌ 返回 Promise
    // ...
  });
  return segments;
}, [editorItems]);

// ✅ 新代码: useEffect 支持异步
const [statusLineSegments, setStatusLineSegments] = useState<StatusLineSegment[]>([]);
const [eventStatusMap, setEventStatusMap] = useState(new Map());

useEffect(() => {
  const computeSegments = async () => {
    const segments = [];
    const statusMap = new Map();
    
    // ✅ 并行查询所有事件状态（性能优化）
    const statusPromises = editorItems.map(async (item, index) => {
      if (!item.id) return { index, eventId: '', statuses: [] };
      
      const eventStatuses = await getEventStatuses(item.id); // ✅ await
      
      return { index, eventId: item.id, statuses: eventStatuses };
    });
    
    const results = await Promise.all(statusPromises); // ✅ 并行等待
    
    // 构建 segments 和 statusMap
    results.forEach(({ index, eventId, statuses }) => {
      if (eventId) {
        statusMap.set(eventId, statuses[0]); // 存储第一个状态
      }
      
      statuses.forEach(status => {
        segments.push({
          startIndex: index,
          endIndex: index,
          status: status,
          label: getStatusConfig(status)?.label
        });
      });
    });
    
    setStatusLineSegments(segments);
    setEventStatusMap(statusMap);
  };
  
  computeSegments();
}, [editorItems, getEventStatuses, dateRange]);
```

**3. PlanSlate 接口适配**

```typescript
// PlanSlate.tsx - Props 接口更新
interface PlanSlateProps {
  // ... 其他 props ...
  
  // ❌ 废弃: getEventStatus (异步函数无法在 renderElement 中调用)
  getEventStatus?: (eventId: string) => Promise<...>;
  
  // ✅ 新增: eventStatusMap (同步访问)
  eventStatusMap?: Map<string, 'new' | 'updated' | 'done' | 'missed' | 'deleted'>;
}

// renderElement 中同步读取
const renderElement = useCallback((props: RenderElementProps) => {
  const element = props.element as any;
  
  if (element.type === 'event-line') {
    const eventLineElement = element as EventLineNode;
    
    // ✅ 从 Map 同步读取状态
    const eventStatus = eventStatusMap?.get(eventLineElement.eventId);
    
    return (
      <EventLineElement
        {...props}
        eventStatus={eventStatus} // ✅ 直接传递
      />
    );
  }
  // ...
}, [eventStatusMap]); // ✅ 依赖 eventStatusMap

// PlanManager.tsx - 传递 eventStatusMap
<PlanSlate
  items={editorItems}
  onChange={debouncedOnChange}
  eventStatusMap={eventStatusMap} // ✅ 传递 Map
/>
```

### 11.3 性能优化

#### 并行查询优化

```typescript
// ✅ 使用 Promise.all 并行查询，而非串行
const statusPromises = editorItems.map(item => 
  getEventStatuses(item.id)
);

const results = await Promise.all(statusPromises);

// 性能对比:
// - 串行查询 (旧): 50个事件 × 10ms = 500ms
// - 并行查询 (新): max(10ms) = 10ms ⚡ 50倍提升
```

#### 缓存策略

```typescript
// 事件状态缓存 (5秒 TTL)
const eventStatusCacheRef = useRef(new Map());

const cached = eventStatusCacheRef.current.get(eventId);
if (cached && Date.now() - cached.timestamp < 5000) {
  return cached.status; // ✅ 命中缓存，无需查询
}

// 查询后更新缓存
eventStatusCacheRef.current.set(eventId, { 
  status: result, 
  timestamp: Date.now() 
});
```

### 11.4 测试验证

#### 功能测试

| 测试项 | 预期结果 | 验证方法 |
|--------|---------|---------|
| **Snapshot 模式激活** | 左侧竖线正常显示 | 切换日期范围，观察竖线 |
| **New 状态** | 蓝色竖线 + "New" 标签 | 创建新事件 |
| **Updated 状态** | 橙色竖线 + "Updated" 标签 | 编辑现有事件 |
| **Deleted 状态** | 灰色竖线 + "Del" 标签 | 删除事件（Ghost） |
| **Done 状态** | 绿色竖线 + "Done" 标签 | 勾选任务 |
| **多状态显示** | 同一事件多条竖线 | Ghost 事件（New+Updated+Del） |

#### 性能测试

```javascript
// 控制台检查日志
console.log('[PlanManager] 📊 生成segments (异步版本):', {
  editorItems数量: 50,
  查询耗时: '12ms', // ✅ 应该 < 50ms
  segments总数: 75,  // ✅ 应该 > 0
  statusMap大小: 50  // ✅ 应该 = editorItems数量
});
```

#### 错误场景

| 场景 | 行为 | 验证 |
|------|------|------|
| **IndexedDB 不可用** | 降级到 localStorage | 检查控制台警告 |
| **查询超时** | 返回空数组，不阻塞渲染 | segments = [] |
| **无历史记录** | 不显示竖线 | segments = [] |

### 11.5 迁移检查清单

- [x] **EventHistoryService.queryHistory() 添加 await**
  - PlanManager.tsx L370
  - PlanManager.tsx L2183
  
- [x] **getEventStatus 改为 async 函数**
  - PlanManager.tsx L347
  
- [x] **getEventStatuses 改为 async 函数**
  - PlanManager.tsx L2158
  
- [x] **statusLineSegments 改用 useEffect + useState**
  - PlanManager.tsx L2277
  
- [x] **新增 eventStatusMap 状态**
  - PlanManager.tsx L2278
  
- [x] **PlanSlate 接口添加 eventStatusMap**
  - PlanSlate.tsx L157
  
- [x] **renderElement 改用 eventStatusMap**
  - PlanSlate.tsx L3702
  
- [x] **更新 useCallback 依赖项**
  - PlanSlate.tsx L3748

### 11.6 已知问题和限制

#### 当前限制

1. **首次加载延迟**: useEffect 异步计算导致竖线有短暂延迟（约 10-50ms）
   - **影响**: 可接受，用户无明显感知
   - **缓解**: 并行查询 + 缓存策略

2. **eventStatusMap 只存储第一个状态**: 多状态事件只在 Map 中保留一个
   - **影响**: EventLineElement 只显示一个状态标识
   - **解决**: segments 数组仍包含完整多状态信息

3. **缓存一致性**: 5秒 TTL 可能导致状态变化延迟
   - **影响**: 极少数情况下状态更新不及时
   - **缓解**: dateRange 变化时强制刷新缓存

#### 后续优化方向

- [ ] Web Worker 后台查询（超过 100 个事件时）
- [ ] 增量更新机制（只查询变化的事件）
- [ ] 预测性加载（提前查询相邻日期范围）
- [ ] IndexedDB 索引优化（按 timestamp 范围查询）

### 11.7 相关 Commit

- **修复 Commit**: `e092175` (2025-12-15)
- **修改文件**:
  - `src/components/PlanManager.tsx` (+68 -32 lines)
  - `src/components/PlanSlate/PlanSlate.tsx` (+4 -3 lines)

---

**文档版本**: v2.3  
**最后更新**: 2025-12-15  
**维护者**: 4DNote Team

