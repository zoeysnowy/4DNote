
# TimeLog 页面性能诊断与优化规范（供 Copilot 实施）
> 前提：Event/Title/EventLog 均为 **Slate JSON**。  
> 目标：在**不牺牲**以下功能需求的情况下，显著提升懒加载与滚动性能。

## 0. 必须保留的功能需求（不可妥协）
1) **默认展开可阅读**：用户进入 TimeLog 后应能顺着时间轴连续浏览日志内容；不能要求逐条点击展开。  
2) **阅读态支持跳转**：tag/mention/链接等在阅读态即可点击跳转。  
3) **同一时刻仅一条处于编辑态可接受**：事实上的编辑也是如此；切换编辑对象要无感、无“锁定/必须保存/必须退出阅读态”的心理负担。  
4) **timegap 插入体验保留**：同一天内 event 之间的空白处应有 timegap，便于在任意位置插入日志；空日展开后也能通过 timegap 插入。  
5) **压缩日期（compressed date）保留**：没有内容的日期以压缩形式存在；支持点击展开某一天，并在该日通过 timegap 创建事件。

---

## 1. 当前性能问题诊断（根因）
### 1.1 “默认展开”当前等价于“挂载大量 Slate Editor”
当前实现中展开会渲染类似：
- `LogSlate`（带 toolbar、plugins、decorate、selection 等）

当一次加载 7 天、每日 3–20 条事件时，会出现几十到上百个 Slate Editor 实例常驻，导致：
- 初始化重
- React reconciliation 重
- 任何列表变更都放大成本

**结论**：最大瓶颈不是 timegap，而是“阅读态用编辑器渲染”。

### 1.2 懒加载后存在全量重算链路（越滚越慢）
常见模式（示意）：
- 合并 allEvents（数组拼接、Map 去重）
- 全量 `sort`
- 全量 `groupByDate`
- 全量生成 `timelineSegments`（含 while/day 枚举、month header 判定等）

**结论**：每次追加数据都触发全量计算，复杂度随总事件数增长。

### 1.3 压缩日期/月份头渲染与判定可能退化
若 month header/压缩段中存在：
- 对 `expandedDates` 做 `some()` 并在段内逐日枚举
会导致范围变大时出现非线性开销。

---

## 2. 总体改造策略（两条“快路径”）
1) **阅读渲染快路径**：Slate JSON → ReadOnly 渲染（非编辑器），并支持跳转。  
2) **时间轴骨架快路径**：以 **稀疏 Segments** 表示日期范围（少节点），并以 **按日索引增量维护** 避免全量重算。  
3) **编辑态仅一条**：用 `activeEditorEventId` 控制仅一个 Slate Editor 挂载，且切换无感自动 flush。

---

## 3. 阅读态渲染：用 ReadOnlyRenderer 替代 Slate Editor 常驻
### 3.1 必须达成的体验
- 默认全部事件内容“展开可读”
- 点击 tag/mention/link 可跳转
- 点击任意事件可立即进入编辑（该事件切换为 Editor），无需显式“解锁/保存/退出阅读态”

### 3.2 组件拆分
#### `EventTitleReadOnly`
- 输入：Slate JSON（title）
- 输出：轻量 React 节点（或 HTML）
- 支持点击跳转（若 title 中有 token）

#### `EventLogReadOnly`
- 输入：Slate JSON（eventLog）
- 输出：轻量 React 节点（或 HTML）
- 支持 tags/mentions/links 跳转

#### `EventLogEditor`
- 仅在 `eventId === activeEditorEventId` 时渲染
- 内部使用现有 `LogSlate`（可复用 toolbar/mention/hashtag）
- `onBlur` 或 `ESC`：自动 flush 并退回 ReadOnly
- 切换编辑对象：先 flush 当前，再 setActive 到新 eventId（无感）

### 3.3 跳转支持（建议：事件委托）
为避免每个 token 绑定闭包：
- ReadOnlyRenderer 输出带 `data-kind="tag|mention|link"`、`data-value="..."` 的元素
- 列表容器挂一个 `onClick`，通过 `event.target.closest('[data-kind]')` 统一处理跳转

### 3.4 渲染缓存（强烈建议）
#### 缓存键
- `cacheKey = eventId + ":" + semanticHash(slateJson)`  
短期可用 `updatedAt` 替代 hash；中期改 semanticHash（忽略无意义字段）。

#### 缓存值
- `titleHtml/titleNodes/titleText`
- `logHtml/logNodes/logText`

#### 缓存层
- 至少内存 LRU（按条数/字节上限）
- 可选：持久化（IndexedDB/localStorage）按需

#### 渲染调度
- 首屏：同步渲染可见部分
- 非首屏：`requestIdleCallback` 或分帧渲染，避免主线程长任务

---

## 4. 时间轴结构：Segments 稀疏化（保留 compressed date 交互）
### 4.1 Segment 类型
```ts
type DateKey = string; // YYYY-MM-DD in user timezone

type TimelineSegment =
  | { kind: "month-header"; monthKey: string }                 // YYYY-MM
  | { kind: "day"; dateKey: DateKey; empty: boolean }          // 有事件或用户展开的空日
  | { kind: "gap"; start: DateKey; end: DateKey; countDays: number }; // 无事件且未展开：一个节点代表多天
```

### 4.2 生成规则（核心）
输入：
- `loadedRange: { start: DateKey; end: DateKey }`
- `datesWithEvents: Set<DateKey>`（该日事件数 > 0）
- `expandedEmptyDates: Set<DateKey>`（用户从压缩段展开的空日）

判定：
- `isDayVisible(dateKey) = datesWithEvents.has(dateKey) || expandedEmptyDates.has(dateKey)`

输出：
- 在 `loadedRange` 内按天扫描，但**不为每一天都生成组件**：
  - 连续不可见日合并为一个 `gap` segment
  - 可见日生成 `day` segment（empty 由是否有事件决定）
- month header 插入策略：
  - 仅当下一个 segment 的首日跨月时插入 `month-header`
  - 禁止在 gap 内逐日枚举进行复杂检查（见 4.4）

### 4.3 compressed date 点击展开（保留现有功能）
对 `gap` segment：
- 点击 → 展示一个轻量“日期选择器”
  - 可做：弹出浮层列出该 gap 的日期（必要时虚拟化）
- 选中某一天 `d`：
  - `expandedEmptyDates.add(d)`
  - 重新生成 segments：原 gap 自动被切割成 `gap(before) + day(d empty) + gap(after)`

### 4.4 month header / expandedDates 判定的性能约束
禁止使用以下模式：
- 在渲染阶段对 gap 段逐日 while 枚举并对 expandedDates 做 `some()` 检查

允许的模式：
- 仅依据 segment 边界日期（start/end）判断是否插入 month header
- 若必须判断“该月是否存在 expandedEmptyDates”，应维护：
  - `expandedByMonth: Map<YYYY-MM, number>` 或 `Set<DateKey>`，O(1) 查询

---

## 5. DaySegment 内：timegap 的高性能实现（保留“事件间空白可插入”）
### 5.1 重要原则
- 不创建“空白事件”作为占位
- timegap 是 UI row（GapRow），常态渲染极轻
- hover 才出现复杂 UI，但复杂 UI 必须是**单例 overlay**（每个 DaySegment 最多一个）

### 5.2 DaySegment Row 模型
同一天内事件排序后的 ids：`[e0, e1, ... en-1]`

生成 rows：
- `GapRow(startOfDay -> e0)`
- `EventRow(e0)`
- `GapRow(e0 -> e1)`
- `EventRow(e1)`
- ...
- `GapRow(en-1 -> endOfDay)`

空日（expanded empty day）：
- 只生成一个 `GapRow(startOfDay -> endOfDay)` + 空日 header（仍可插入）

### 5.3 GapRow 的数据协议（dataset）
GapRow DOM 节点附加：
- `data-datekey="YYYY-MM-DD"`
- `data-gap-start="ISO timestamp"`
- `data-gap-end="ISO timestamp"`
- `data-before-id="..."`（可选）
- `data-after-id="..."`（可选）

### 5.4 单例 TimegapOverlay（推荐实现）
- DaySegment 容器监听 `pointermove/mousemove`
- 找到 `closest('[data-gap-start]')` 的 gap 节点
- 计算其 bounding rect，定位 overlay
- overlay 显示：
  - “+ 添加事件”
  - 时间提示（按鼠标位置映射到 gap 时间）
- overlay 点击创建事件：仅在该 `dateKey` 内创建，带初始 timeSpec

性能约束：
- hover 仅更新 DaySegment 内局部 state（当前 gapKey、鼠标 y）
- 禁止 hover 导致 timelineSegments 全量重算

---

## 6. 数据结构与懒加载：按日增量索引（支持每次 7 天加载）
### 6.1 必须避免的模式
- 每次加载更多都做：合并大数组 → Map 去重 → 全量 sort → 全量 groupByDate

### 6.2 推荐数据结构
```ts
type EventId = string;

interface TimeLogIndex {
  eventsById: Map<EventId, Event>;
  idsByDate: Map<DateKey, EventId[]>;     // 每日有序（按开始时间/创建时间）
  datesWithEvents: Set<DateKey>;
  loadedStart: DateKey;
  loadedEnd: DateKey;
}
```

### 6.3 增量合并算法（加载 7 天）
输入：`newEvents: Event[]`
- 对每个 event：
  - upsert `eventsById`
  - 计算 dateKey（按用户时区）
  - 插入 `idsByDate[dateKey]`
    - 若当日数组不存在则创建
    - 插入策略：
      - 简化版：push 后仅对该日 sort
      - 最优版：二分插入（按 timestamp）
  - 更新 `datesWithEvents.add(dateKey)`

更新 `loadedStart/loadedEnd`

### 6.4 UI 选择器（避免全量 re-render）
React state 建议只存轻量信息（比如 loadedRange、expandedEmptyDates、activeEditorEventId），大 Map 用 ref + selector：
- DaySegment 通过 `dateKey` 只订阅该日的 ids 列表
- EventRow 通过 id 拿 event（可 memo）

---

## 7. 编辑态管理（仅一条 Editor，切换无感）
### 7.1 状态
- `activeEditorEventId: string | null`

### 7.2 切换策略
- 点击某条 EventRow：
  - 若当前有 activeEditor 且不同：
    - flush 当前 editor（debounced flush 立即执行）
  - setActiveEditorEventId(newId)

### 7.3 退出策略
- `onBlur`：flush 并 setActiveEditorEventId(null)
- `ESC`：flush 并退出（或可选不 flush，但默认 flush）
- 不显示“保存键”作为强依赖；保存应自动进行

---

## 8. 验收指标（必须通过）
1) 默认进入 TimeLog：7 天范围内所有事件日志可直接阅读（无需点开）。  
2) 阅读态 tag/mention/link 点击可跳转（不进入编辑也能跳）。  
3) 任意事件点击即可进入编辑；切换编辑对象无感，不提示“锁定/必须保存”。  
4) 任意同日相邻事件之间存在 timegap；hover/点击可在该处创建事件。  
5) compressed date：无事件的日期以压缩段展示；点击后可展开某一天并通过 timegap 创建事件。  
6) 性能：加载更多 7 天时滚动不卡顿；随着总加载天数增加，不出现明显“越滚越慢”。

---

## 9. 实施顺序（建议按优先级）
### Phase 1（止血：保持体验前提下立刻变快）
1) 引入 `EventTitleReadOnly`、`EventLogReadOnly`：默认展开使用 ReadOnlyRenderer  
2) 引入 `activeEditorEventId`：仅一条挂载 Slate Editor，切换自动 flush  
3) 跳转事件委托：阅读态点击可跳转

### Phase 2（结构性优化：消除越滚越慢）
4) 用 `TimeLogIndex` 替代全量数组合并/全量 sort/group  
5) timelineSegments 改为稀疏 Segments（day/gap/month-header），保持 compressed date 交互

### Phase 3（精修）
6) ReadOnly 渲染缓存（semanticHash + LRU，必要时 idle/分帧）  
7) timegap overlay 单例化（若当前 gap 已经较轻可延后）

---

## 10. Copilot 任务拆解（可直接执行）
- [ ] 新增 `renderSlateReadOnly(titleNodes|logNodes) -> ReactNode|HTML`，支持 tag/mention/link 输出 dataset  
- [ ] 新增 `TimeLogReadOnlyRow`：默认渲染 title/log ReadOnly；点击切换到 Editor  
- [ ] 修改 TimeLog：移除 `expandedLogs = all` 逻辑，改用 `activeEditorEventId` 控制 editor 挂载  
- [ ] 增加点击事件委托处理跳转（tag/mention/link）  
- [ ] 重构懒加载合并：`eventsByIdRef + idsByDateRef + datesWithEventsRef` 增量更新  
- [ ] 实现 `buildTimelineSegments(loadedRange, datesWithEvents, expandedEmptyDates)` 输出稀疏 segments  
- [ ] 实现 `GapSegment` 的“选择日期展开”交互：将选中日期加入 `expandedEmptyDates`  
- [ ] DaySegment：生成 `GapRow/EventRow` 列表；可选实现单例 `TimegapOverlay`（或确保现有 timegap 只在 hover 渲染且不触发全局重算）

