# ToastUI Calendar Simplification Audit (v2.22)

**日期**: 2026-01-03  
**范围**: TimeCalendar（ToastUI Calendar 集成）  
**目标**: 在不改变 UX 的前提下，减少“分支差异 / 误伤样式 / 重复管线”，让日历模块更符合 Refactor Master 的“单一数据源 + 派生展示”口径。

---

## 0. 背景与现状

当前 ToastUI Calendar 集成的关键入口：
- UI 主组件：`src/features/Calendar/TimeCalendar.tsx`
- React 包装层：`src/features/Calendar/components/ToastUIReactCalendar.tsx`
- 事件映射（Event → TUI EventObject）：`src/utils/calendarUtils.ts`
- 全局样式覆盖：`src/styles/calendar.css`
- 本地 vendored TUI Calendar：`src/lib/tui.calendar/apps/calendar`

### 已验证的近期问题（作为“简化动机”）
- 月视图 indicator/dot 错位并非 ToastUI DOM 分支问题，根因是 `calendar.css` 中 **过宽选择器 + !important** 误伤了普通事件：
  - 典型例：对 `default-event` 的 Task 样式重置（margin/height/padding）导致布局偏移。
  - 修复原则：**选择器必须只命中 Task 模板**（例如通过 `:has(.toastui-calendar-template-task)` 收窄）。

---

## 1. 结论（可简化点总览）

### 最优先（低风险/高收益）
1) **减少“生产 CSS 依赖 data-testid”**：把样式锚点从 `[data-testid*="..."]` 收敛到 ToastUI 自身 class 或我们可控的模板 class。
2) **删除/收敛重复的标题清理逻辑**：日历标题应统一走 `TitleResolver.resolveDisplayTitle()`；`calendarUtils.ts` 内旧的标题清理函数（若已无调用）应删除，避免下次再出现 “Untitled 回归/JSON 泄露”。
3) **将 Task 样式与普通事件样式隔离**：所有 Task 专用规则必须通过“Task 模板存在”来 gating，禁止用 calendarId/default-event 做布局分流。

### 中期（中风险/结构收益）
4) **拆分 `TimeCalendar.tsx` 的职责**：把「数据加载」「ToastUI imperative bridge」「Widget timer bridge」「设置持久化/清理」「编辑弹窗」拆成 hooks/子模块，减少 useEffect 交织。
5) **事件数据来源进一步贴近“订阅视图”**：用 `useEventHubQuery/useEventHubSnapshot` 之类的订阅式读取替代 `loadEvents + eventsUpdated 手动增量` 的双系统。

### 长期（高风险/需谨慎）
6) **简化 `ToastUIReactCalendar` 包装层的 deep-equal 与生命周期**：现在依赖自写 `isEqual` + class component + imperative diff；可考虑逐步改为 function + useEffect + 明确的 `setCalendars/setEvents` 通道（但要保住性能）。

---

## 2. 发现与证据（为什么可以简化）

### 2.1 CSS 误伤模式：过宽选择器导致“分支差异 = 布局差异”
- 当前 `src/styles/calendar.css` 中存在大量 `!important` 与跨层级选择器。
- 一旦选择器锚点选错（例如 `default-event`），就会把本应仅影响颜色的分组差异，升级为“布局/DOM 呈现差异”。

**建议口径**
- “分组只影响颜色/label，不影响布局”是硬规则。
- 因此：布局相关 CSS 只能绑定到 **事件类型（task/time/allday）** 或 **模板 class**，不能绑定到 calendarId/tagId/default。

### 2.2 标题派生路径重复：存在多套 sanitize/heuristic
- `calendarUtils.ts` 曾内置 `normalizeCalendarDisplayTitle / stripLeadingTimestamp...` 等逻辑。
- 现在日历展示标题已经统一用 `TitleResolver.resolveDisplayTitle()`（这是正确方向）。

**可简化点**
- 若 `calendarUtils.ts` 内的旧标题清理函数已无调用（或只被同文件内部旧逻辑调用），应删除。
- 标题派生只保留一个入口：`TitleResolver.resolveDisplayTitle()`。

### 2.3 `TimeCalendar.tsx` 文件过大：多职责耦合增加回归概率
- `TimeCalendar.tsx` 同时承担：
  - 日期范围计算与加载（lazy range）
  - eventsUpdated 增量更新
  - Widget 模式 localStorage bridge
  - CalendarService 初始化与 calendars 列表加载
  - settings 校验/清理/自动保存
  - ToastUI instance 操作（scrollToNow/changeView 等）
  - EventEditModalV2 状态与保存

这种结构使得：
- 任意一个分支（例如 widget-only）都可能意外影响主程序逻辑。
- 很难保证“颜色分支不影响布局”的规则不被破坏。

---

## 3. 建议的简化方案（按风险分级）

## 3.1 低风险（推荐立刻做）

### (A) 移除对 data-testid 的生产样式依赖
- 目标：避免测试标识改变导致生产样式崩。
- 做法：
  - 对 Task 样式只绑定：
    - `.toastui-calendar-template-task`（模板 class）
    - 或 ToastUI 自带的 task 类（如 `.toastui-calendar-weekday-event-dot-task`）
  - 不再用 `[data-testid*="default-event"]` 做布局/间距控制。

### (B) 删除 `calendarUtils.ts` 中重复/不可达的标题清理函数（在确认无引用后）
候选函数（需确认无外部引用）：
- `normalizeCalendarDisplayTitle`
- `stripLeadingTimestampBlocksForCalendar`
- `extractPlainTextFromSlateJsonForCalendar`
- `tryExtractSlateTextFromUnknownString`

保留：
- `resolveDisplayTitle`（来自 `TitleResolver`）作为唯一展示口径。

### (C) 将“Task 样式”规则全部通过模板 gating
- 规则：只要涉及 margin/padding/height/top/line-height 等布局属性，就必须 gated。
- 推荐 gating：`:has(.toastui-calendar-template-task)` 或模板渲染时加的确定性 class。

---

## 3.2 中风险（结构改良，建议分 PR 做）

### (D) 拆分 `TimeCalendar.tsx`（不改 UI 行为）
建议拆为 4~6 个 hooks：
- `useCalendarRangeEvents(currentDate, view)`：只负责 date range → events（读 EventService 或订阅）
- `useCalendarSettings(storageKey)`：只负责 settings load/save/validate
- `useCalendarCalendars(microsoftService, tags)`：只负责 calendars 列表与 CalendarService readiness
- `useWidgetTimerBridge(isWidgetMode)`：只负责 timer bridge & trigger
- `useCalendarEditModal()`：只负责 editingEvent/showModal/newlyCreatedEventId

收益：
- 降低 useEffect 互相踩踏与依赖错误。
- 便于 enforce “widget-only 逻辑不影响主程序”。

### (E) 事件更新路径收敛为单一策略
目前同时存在：
- `loadEvents()`（range 批量拉取）
- `eventsUpdated` 增量更新（按 eventId 更新/删除）

建议：
- 保留一种作为主策略：
  - 若继续使用 eventsUpdated：将 range loader 仅作为 cold-start/视图切换；其余都走增量。
  - 或者切到订阅视图：TimeCalendar 只订阅 “当前可见范围” 的 events selector。

---

## 3.3 高风险（长期方向，先写小实验再决定）

### (F) 简化 `ToastUIReactCalendar` wrapper
当前 wrapper 特点：
- class component
- 自写 deep-equal `isEqual`
- `shouldComponentUpdate` 永远 `return false`，完全依赖 imperative side-effect

风险：
- 这一层是性能关键路径，贸然改动容易导致“全量 clear/create”抖动。

建议演进：
- 先做“收敛 API”而不是重写：
  - 明确提供 `updateCalendars`、`updateEvents`、`changeView` 这几类方法
  - 外层保证传入 props 已 memo 化（减少 deep-equal 需求）

---

## 4. 验收标准（简化不改 UX）

- 月视图：同一类型事件（time/task）在不同 calendarId/tagId 下 **布局一致**（只颜色不同）。
- 标题：不泄露 Slate JSON / timestamp 片段；无标题事件仍能稳定显示（不触发布局崩坏）。
- 刷新：tag calendars 颜色/分组不丢失。
- 性能：事件更新不出现明显全量闪烁（尤其 month view）。

---

## 5. 建议的落地顺序（最小化回归）

1) CSS：全面清点 `data-testid` 选择器与 `!important`，把“布局规则”全部改为模板 gating。
2) calendarUtils：删除无引用标题清理函数（并加一次全局搜索确认）。
3) TimeCalendar：抽 `useCalendarSettings` 与 `useWidgetTimerBridge`（先拆最独立的）。
4) 再决定是否切订阅视图（`useEventHubQuery`）来替代 range loader。

