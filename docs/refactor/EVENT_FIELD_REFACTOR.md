# Event Field Refactor（字段重构提案）

> 目标：让事件字段“逻辑清晰、类别分明、无冗余”。
>
> 本文是**重构提案**，不是现状描述；现状请以 [docs/refactor/EVENT_FIELD_CONTRACT.md](EVENT_FIELD_CONTRACT.md) 与代码为准。

---

## 0. 结论先行（你提出的口径 → 本文的目标口径）

- **删除 `type: 'todo'|'task'|'event'`**：它是历史兼容字段，混乱且不可维护；必须迁移到 `isTask` / `checkType` / 其它明确字段。
- **删除 `isDeadline`**：将“截止/开始语义”统一由 `dueDateTime`（是否存在）+ UI 规则表达，避免双字段表达同一概念。
- **弱化并最终删除 `category`**：TimeCalendar 的布局应从 `startTime/endTime/isAllDay/dueDateTime/isTask` 推导，不应依赖 `category` 这种容易漂移的字符串。
- **只保留一个来源字段（统一 `source`）**：逐步淘汰 `fourDNoteSource`，用 `source` 表达来源系统/创建者归属。
- **系统轨迹/系统行为不再用 Event 表达**：统一用 Eventlog Enhanced PRD 的 **Signal / EventLog** 模型承载。
- **`isTimeLog` 表示 “创建于 TimeLog 页面（module-origin）”**，不再表示“系统轨迹”。系统轨迹用 Signal。
- **不再引入/依赖“task-like”这类推断概念**：系统只认显式字段；历史兜底推断只允许存在于迁移阶段的兼容层，不进入长期口径。

---

## 1. 原则（硬约束）

1) **单一表达**：同一语义只能由一个 canonical 字段表达（避免 `A`/`B` 两个字段表达一个意思）。
2) **模块来源只描述“从哪来”**：例如 Plan/TimeCalendar/TimeLog 页面创建，不承担“系统事件/系统轨迹”的含义。
3) **系统行为一律从 Event 中抽离**：系统日志/轨迹/证据一律落在 Signal / EventLog 中（参照 Eventlog Enhanced PRD）。
4) **TimeCalendar 布局只基于时间语义推导**：`startTime/endTime/isAllDay/dueDateTime/isTask`，不依赖 `category/type`。
5) **checkType 保留**：它表达“是否可打钩/如何打钩”，是跨页面把事件变成 task 的能力字段，不应删。

---

## 2. 现状问题（为何必须改）

### 2.1 `type ('todo'|'task'|'event')` 的问题
- “todo”没有明确模块归属，团队成员无法形成稳定心智模型。
- 与 `isTask/isPlan/checkType` 发生语义重叠，造成“哪个字段才是权威”的长期争论。
- 目前被用于 task-like 兜底，只会让历史包袱持续扩大。

### 2.2 `isDeadline` 的问题
- 与 `dueDateTime` 表达高度重叠：一个“有截止时间的 task”，本质就是 `dueDateTime` 存在。
- 当 `isDeadline=true` 但 `dueDateTime` 为空时，语义不完整；反之亦然。

### 2.3 `category` 的问题
- `category` 是“结果”，而不是“原因”。
- 正确的 UI/布局应该从时间与任务语义推导，`category` 只会成为漂移的缓存字段。

### 2.4 `source` vs `fourDNoteSource` 的问题
- 两个字段同时存在，必然产生组合态：
  - `source='outlook'` + `fourDNoteSource=true` 等不一致形态
- 长期维护成本高：任何判断“本地创建/外部创建”必须同时考虑两个字段。

### 2.5 `isTimeLog` 的语义漂移
- 现状常把 `isTimeLog` 作为“系统事件”过滤依据，但你的目标是：
  - 系统轨迹 → Signal
  - `isTimeLog` → TimeLog 页面创建来源

---

## 3. 目标字段模型（Target Model）

### 3.1 Event（保留的核心字段）

> Event 只承载“用户可编辑的实体事件/任务”，不承载系统轨迹。

- **任务/可打钩能力**
  - `isTask?: boolean`：是否以“任务”语义对待（同步到 ToDo、任务 UI 等）。
  - `checkType?: CheckType` + `checked/unchecked`：是否可打钩/如何打钩（跨页面能力字段，保留）。

- **模块来源（module-origin flags）**
  - `isPlan?: boolean`：是否由 Plan 页面创建。
  - `isTimeCalendar?: boolean`：是否由 TimeCalendar 页面创建。
  - `isTimeLog?: boolean`：是否由 TimeLog 页面创建。（注意：不再代表系统轨迹）

- **时间语义（TimeCalendar 布局只依赖这些）**
  - `startTime/endTime/isAllDay`：日历时间（task 允许为空）。
  - `dueDateTime`：截止时间（task 语义字段）。

- **来源（统一）**
  - `source: string`：事件来源（SSOT，必须是 namespaced 形式，例如 `local:plan`、`outlook:calendar`）。

  备注：同步动作发起方不使用 `Event.source` 表达，而是使用 `SyncAction.initiator: 'local' | 'outlook'`。
  - （目标）移除 `fourDNoteSource`。

- **删除**
  - `type`（todo/task/event）
  - `isDeadline`
  - `category`（或保留为纯 derived/legacy，只读，不再作为写入字段）

### 3.2 Signal / EventLog（系统轨迹/证据）

- 系统轨迹、行为日志、证据与“重点信号”都属于 **Signal / EventLog**，不属于 Event。
- Signal 的目标 schema 以 Eventlog Enhanced PRD 为准：
  - `signal_id/signal_type/note_id/paragraph_id/created_at/audio_offset_ms/image_id/metadata`
- 目标：
  - “系统自动记录的活动轨迹”→ 落到 Signal/EventLog
  - Event 只保留用户可编辑实体（任务/日历/计划）

---

## 4. PlanManager 的目标过滤口径（按你的要求简化）

你希望的维护友好口径：

- `isPlan` 只表示“是否创建于 Plan 页面”。
- PlanManager 显示集合：
  - `isPlan===true` **并集** `checkType!==undefined && checkType!=='none'`
  - 然后再叠加时间/完成态等过滤规则

> 注：`isTimeCalendar` 是否需要并入 PlanManager 由产品决定；如果确实要并入，也应明确它是“入口并集”，而不是 task-like 兜底。

---

## 5. 迁移计划（建议分阶段，保证可回滚）

### Phase A — 只加约束、不破坏现状
- 在 Field Contract 中明确：`type/isDeadline/category/fourDNoteSource` 为 **legacy/deprecated**。
- 在新写入路径中禁止写入这些字段（或写入时立刻清理）。

### Phase B — 写入侧迁移
- 创建/编辑入口：
  - 任务：必须写 `isTask=true`；若可打钩写 `checkType`。
  - Plan 创建：写 `isPlan=true`。
  - TimeLog 页面创建：写 `isTimeLog=true`（仅 module-origin）。
  - TimeCalendar 创建：写 `isTimeCalendar=true`。

### Phase C — 读取侧去兼容
- 移除对 `event.type` 的依赖。
- 移除对 `event.category` 的依赖，完全改为时间语义推导。
- 移除对 `isDeadline` 的依赖，改用 `dueDateTime`。
- 将 `fourDNoteSource` 的判断迁移到 `source`（必要时通过签名/迁移脚本补齐 `source`）。

### Phase D — 数据迁移/清理
- 对历史数据：
  - 删除/忽略 `type/isDeadline/category/fourDNoteSource`
  - 补齐缺失的 `source`（若能从签名或 externalId 推断）

---

## 6. 风险点与验收标准

### 风险点
- 历史数据依赖：某些 UI/Sync 可能还在读 `type/category/isDeadline/fourDNoteSource`。
- 外部同步识别：`fourDNoteSource` 被广泛使用，迁移必须有严格灰度与回滚。

### 验收标准
- 新创建的事件不再写入 `type/isDeadline/category/fourDNoteSource`。
- PlanManager/TimeCalendar 的筛选逻辑只依赖目标字段集合。
- `isTimeLog` 在所有“系统事件过滤”处不再被当成系统轨迹；系统轨迹走 Signal。

---

## 7. 下一步（我建议你拍板的 4 个决策）

1) `isTimeCalendar` 是否必须并入 PlanManager 的展示域？（入口并集 vs 只在 Calendar 出现）
2) `source` 的补齐策略：是否允许 `source` 缺省视为 local？还是必须显式写？
3) Signal/EventLog 的落库形态：SQLite 表（signals/event_log）还是先放在现有存储系统的独立集合？
4) `checkType` 的产品语义边界：是否允许任意事件变成可打钩任务？（你现在的描述是“允许”，那就坚持保留并强化它）
