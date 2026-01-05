# Event Field Contract（字段契约）

> 目的：给全 App 一个“唯一口径”的字段规则：哪些字段是 canonical（存储真相）、哪些是 derived（派生值）、谁是 owner、哪些模块允许写、哪些禁止默认值注入。
>
> 更详细的强制写入审计与风险点见本文附录：
> - [附录：字段写入审计与风险点（合并版）](#附录字段写入审计与风险点合并版)

---

## 1. 总原则（Hard Rules）

1) **Canonical vs Derived 分离**：派生值只用于排序/渲染/同步映射，不得回写污染 `Event` 存储（除非明确的 repair 工具路径）。
2) **Plan/Task 时间允许为空**：`startTime/endTime/isAllDay` 在 Task/Plan 场景允许 `undefined`，禁止把 `createdAt` 之类默认注入成“看起来有时间”。
3) **Storage 层不改写业务字段**：持久化层应被动写入 canonical 数据，不应擅自覆盖 `updatedAt/startTime/endTime/syncStatus` 等业务字段。
4) **数组字段默认保留 undefined**：`tags/calendarIds/todoListIds/attendees/...` 等字段，除非用户明确设置为空数组，否则不要为了“方便”强制写成 `[]`（避免无意义 diff 与误判变更）。

---

## 2. Canonical Schema（权威类型定义）

- 权威接口：`Event` 与 `EventTitle` 定义在 [src/types.ts](../../src/types.ts)。

---

## 3. Owner Model（谁拥有写入权）

- **UI/Feature 层（PlanSlate/TimeCalendar/EventEditModal 等）**：负责收集用户输入；不应自行补齐系统字段。
- **TimeHub**：时间意图单一真相（写 `timeSpec` 与相关时间字段），但不得为 Plan/Task 注入默认时间。
- **EventService.normalizeEvent**：canonical 化入口（兼容旧格式、结构化 title/eventlog/description、选择 createdAt/updatedAt 策略）。
- **StorageManager/存储层**：被动持久化 canonical 数据（不擅自“修正业务字段”）。
- **Sync 层（ActionBasedSyncManager）**：外部同步映射与回写（仅在 external-sync 场景写入外部字段与从远端合并回来的字段）。

---

## 4. 字段契约（核心字段）

### 4.1 Title（三层架构 v2.14）

类型：`EventTitle`（见 [src/types.ts](../../src/types.ts)）。

- `fullTitle`：Slate JSON（完整，包含标签/元素）——适合编辑器/Plan 这类需要完整结构的场景。
- `colorTitle`：Slate JSON（简化，移除 tag/dateMention 等元素，但保留格式）——适合大多数 UI 展示。
- `simpleTitle`：纯文本——用于 TimeCalendar/搜索/外部同步（Outlook subject / ToDo title）。

**契约**
- `title` 允许缺省（尤其快速输入/迁移/外部数据）。当缺省时，展示/同步标题必须由“只读派生层”（`TitleResolver`）提供。
- **允许**：仅做 shape-normalize（结构化规范化）——例如把 `title` 规范为“空对象形态/空 Slate 节点结构”，以避免上层空指针。
- **禁止**：把派生出来的“兜底标题/摘要/标签名”写回 `event.title.*` 作为 canonical（避免默认值注入）。

### 4.2 Time（时间字段 v1.8）

> 本节回答两个问题：
> 1) **时间到底怎么存（canonical）**？
> 2) **各页面到底怎么读（resolver 口径）**？

#### 4.2.1 存储格式（强制）

- 所有持久化 TimeSpec 字符串（如 `startTime/endTime/createdAt/updatedAt/dueDateTime/checked/unchecked`）必须使用本地 TimeSpec 格式：`YYYY-MM-DD HH:mm:ss`。
- 禁止在存储层写入 ISO 8601（例如 `2025-12-07T14:30:00.000Z`）。
- 规范依据：TIME_ARCHITECTURE（TimeSpec 格式标准化）。

#### 4.2.2 Canonical（存储真相）vs Derived（派生值）

- Canonical（可落库/可同步路由使用）
  - `startTime/endTime/isAllDay`：显式时间块（可为空，见下文约束）
  - `timeSpec`：用户时间意图（rawText/kind/resolved 等），由 TimeHub 维护
  - `createdAt/updatedAt`：写入链路维护
  - `dueDateTime/isDeadline`：deadline 语义（不是时间块）
  - `checked/unchecked`：签到/完成时间轨迹
- Derived（只能计算、不能回写）
  - strict-time：`timeSpec.resolved`（用于 Upcoming 等“必须严格时间”的视图）
  - derived anchor：`resolveCalendarDateRange(event).start`（用于 TimeLog/Plan Snapshot 等“允许派生锚点”的视图）
  - 任何“虚拟时间/默认时间”（如从 `createdAt` 推导出来的 startTime）

#### 4.2.3 写入权（谁能写什么）

- UI（DateTimePicker/Modal 等）
  - 只能表达“用户选择/输入”，不应自行注入默认时间。
- TimeHub（单一真相源）
  - 负责写入 `timeSpec` 并据此规范化 `startTime/endTime/isAllDay`（仅限用户显式意图）。
  - 禁止：为 Plan/Task 注入默认 `startTime/endTime`。
- EventService.normalizeEvent
  - 负责格式/兼容性 canonical 化（例如把空字符串时间视为无时间）。
- Storage 层
  - 被动持久化，不得擅自改写时间字段（尤其是把 `updatedAt` 写成 ISO）。

#### 4.2.4 读取与 Resolver 口径（每个页面必须选型）

- strict-time 视图（例如 Upcoming）：
  - **只允许使用** `timeSpec.resolved` 做过滤/排序；缺失则不展示（不得回退到 `startTime/endTime/createdAt`）。
- timeline / chronological 视图（例如 TimeLog、Plan Snapshot 的范围过滤）：
  - **允许使用** `resolveCalendarDateRange(event)` 作为 anchor（兼容 no-time / end-only task）。
  - 注意：这是派生锚点，不得回写到 `startTime/endTime`。
- deadline 视图（Plan 的过期/截止规则）：
  - 以 `dueDateTime` 为准；不得把 deadline 等价为 `endTime`（除非明确做了双写策略）。

- `startTime/endTime/isAllDay`：
  - Task/Plan：允许 `undefined`（不显示时间）。
  - Calendar 事件：必须存在（由 TimeCalendar/TimeHub/校验器保证）。
- `timeSpec`：时间意图来源（解析/模糊时间等），由 TimeHub 写入。

**契约**
- **禁止**：对 Plan/Task 进行“虚拟时间注入”（例如把 `createdAt` 当作 `startTime`）。
- **禁止**：把任何“虚拟时间（virtual time）”写回 canonical `Event` 存储；若外部同步/展示需要时间锚点，只允许在派生层或同步 payload 映射中临时计算。

### 4.3 Timestamps

- `createdAt/updatedAt`：由 canonical 写入路径维护（创建/更新入口、external-sync 合并）。
  - **createdAt 优先遵从显式传入/用户设定**（例如导入、迁移、用户选择的时间锚点）；不得在 create/update 主路径中强制覆盖成“现在”。
  - 仅当调用方未提供且无法从 canonical 来源推导（如签名/Block-Level timestamp）时，才允许兜底为当前时间。

**契约**
- Storage 层不得强制覆盖传入的 `updatedAt`（否则会破坏 external-sync 与“上层决定 updatedAt”的契约）。

### 4.4 Sync

- `syncStatus/externalId/calendarIds/todoListIds/...`：
  - UI/Plan save 可写“用户意图”字段（如选择了哪些日历）。
  - Sync 层可写 external 映射与同步状态。

---

### 4.5 Filtering & Classification（全量过滤字段口径）

> 目的：把“用于过滤/路由/展示分组”的字段一次性收敛到统一口径，避免：
> - 同一字段在不同模块语义漂移（例如把 `isTimeLog` 当作“系统事件”还是“模块来源”）；
> - 不同模块各自发明过滤规则，导致数据在 A 模块可见、在 B 模块消失。

#### 4.5.1 两类“分类字段”必须区分

1) **模块来源类（module-origin flags）**：表示“这个事件从哪个模块/入口产生”，用于 UI 分流、默认展示与快捷入口。
   - 例：`isPlan/isTimeCalendar/isTimer`。
2) **系统轨迹/记录类（system-trajectory / record）**：表示“这是系统自动产生的轨迹/记录/附属事件”，通常应从大多数用户任务视图中默认隐藏。
   - 现状：用 `isTimer/isTimeLog/isOutsideApp` 作为 *subordinate* 判定（见 `EventService.isSubordinateEvent`）。
   - 目标：后续应引入 **Signal 模型**（见下文 4.5.3）承载“信号/证据/轨迹”，避免用布尔字段混载不同语义。

> 说明：`isTimer` 在当前实现中是一个“交叉字段”——它既体现“Time 模块产生的 timer 事件”，又被 `isSubordinateEvent` 视为默认应隐藏的附属记录。

> 强约束：**任何“默认时间/虚拟时间”逻辑都必须先判定 task-like（`isPlan/isTask/type/checkType`）并排除。**

#### 4.5.2 Event（现有）过滤字段清单 + 各模块行为

| 字段/字段组 | 字段类型 | 功能类型 | 语义归类 | PlanManager | TimeCalendar | TimeLog（Timeline） | Dashboard（Upcoming/面板） | EventTree | Search/Index | Sync Router | EventHistory |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `deletedAt` | Canonical | Filter | 生命周期 | **排除** | **排除** | **排除** | **排除** | **排除** | **排除** | **排除** | **记录**（delete/update 链路均可能产生日志） |
| `title`（`EventTitle`: `simpleTitle/colorTitle/fullTitle`） | Canonical | Display | 展示标题（派生口径） | **必须 `resolveDisplayTitle`**（禁直读多层字段） | **必须 `resolveDisplayTitle`** | **必须 `resolveDisplayTitle`** | **必须 `resolveDisplayTitle`**（可用 `maxLength` 控制截断） | **必须 `resolveDisplayTitle`** | 索引/召回以 `simpleTitle` 为主；展示统一 `resolveDisplayTitle` | 外部 title/subject **必须 `resolveSyncTitle`**（不回写） | **记录**（title 深比较；避免 JSON/空白层噪音） |
| `isPlan` | Canonical | Filter | 模块来源 | **纳入**（并集条件之一） | 不作为核心筛选（可显示/编辑） | **纳入**（仅显式时间；无时间排除） | 可作为“待办/计划”入口筛选 | 可显示（取决于 UI） | 影响 icon/分类 | 不决定 target（仍看 `isTask`/时间） | **记录** |
| `isTimeCalendar` | Canonical | Filter | 模块来源 | **纳入**（并集条件之一） | **核心模块**（TimeCalendar 创建/管理） | **纳入**（按时间范围） | 可作为入口筛选 | 可显示（取决于 UI） | 影响 icon/分类 | 不决定 target（仍看 `isTask`/时间） | **记录** |
| `isTask` | Canonical | Routing | 业务类型 | **隐式纳入**（多数 Plan 事件应是 task） | 可显示，但“无时间 task”需特殊处理 | **仅显式时间纳入**（无时间 task 不上时间轴） | 可能用于任务统计/筛选 | 用于任务计数/完成态 | 影响索引语义 | **决定 target=todo** | **记录** |
| `type` (`todo\|task\|event`) | Legacy | Compat | 兼容字段 | **辅助**（不要单独依赖） | 辅助 | 辅助 | 辅助 | 辅助 | 辅助 | 辅助（仅用于 task-like 兜底） | **记录**（若被写入/变更） |
| `checkType/checked/unchecked` | Canonical | Filter | 任务/签到过滤 | **纳入**（并集条件之一：`checkType!==none`） | 可显示/用于签到 UI | 非核心（不决定时间轴） | Upcoming 面板用作主过滤条件之一 | 可显示 | 可索引 | 不决定 target | **记录** |
| `isCompleted` | Canonical | Filter+Sync | 完成态 | 正常模式可隐藏（`showCompleted=false`） | 可显示 | 可显示（不作为主过滤） | 可隐藏/排序 | 影响样式/计数 | 可索引 | ToDo 同步映射字段 | **记录** |
| `dueDateTime` + `isDeadline` | Canonical | Filter+Sync | 截止语义 | 用于过期过滤（示例：>7天未完成） | 用于展示/排序 | 非核心（可展示/排序） | 用于范围过滤/倒计时 | 可显示 | 可索引 | ToDo 字段映射；不等价于 `endTime` | **记录** |
| `startTime/endTime/isAllDay` | Canonical | Filter+Sync | 时间存在性/展示 | Snapshot 模式会用 `resolveCalendarDateRange` 做范围过滤 | **核心筛选**（按日期范围、全天/时间块） | **核心筛选**（范围加载/排序/分组；Plan/Task 需显式时间） | Upcoming 按时间范围筛选（依赖 `isEventInRange`） | 用于渲染位置/时间线 | 可索引 | `start+end` 决定 calendar 可同步；**task 时间允许空** | **记录** |
| `tags` | Canonical | Filter | 标签过滤 | 非核心（Plan 里更多是结构/状态） | **核心筛选**（`visibleTags`；支持 `no-tag` 特殊选项） | **核心筛选**（hiddenTags 等） | 非核心 | 非核心 | 可索引 | 不决定 target | **记录**（tags 专用比较） |
| `category` | Legacy | Display | 兼容/展示分类 | 视产品口径 | TimeCalendar 内部会推导类别；此字段更多用于 legacy/调试 | 仅展示/调试 | 视产品口径 | 视产品口径 | 可索引 | 不决定 target | **记录** |
| `syncMode` | Canonical | Routing | 同步策略 | 仅展示/编辑 | 仅展示/编辑 | 仅展示/编辑 | 仅展示/编辑 | - | - | `receive-only` 必须不推送 | **记录**（可能由同步/设置更新） |
| `calendarIds/todoListIds` | Canonical | Sync | 同步目标选择 | Plan save/编辑可写“用户意图” | TimeCalendar 视图会用于日历筛选 | 仅展示/编辑 | - | - | - | Sync 层映射与分流 | **记录** |
| `externalId` | Canonical | Sync | 外部映射 | - | TimeCalendar 支持 `not-synced`（无 `externalId` 或无 `calendarIds`）筛选 | - | - | - | - | Sync 合并/映射写入 | **可能记录**（同步写入；非忽略字段） |
| `source/fourDNoteSource` | Canonical+Legacy | Diagnose | 来源/本地创建 | - | TimeCalendar 支持 `local-created`（`source=local` 或 `fourDNoteSource=true`）筛选 | 仅展示/诊断 | - | - | - | Sync 合并/映射写入 | `source` **记录**；`fourDNoteSource` **忽略** |
| `syncStatus` | Canonical | Sync | 同步状态 | 展示/诊断 | 展示/诊断 | 展示/诊断 | - | - | - | Sync 合并/映射写入 | **可能记录**（同步状态变化；非忽略字段） |
| `isTimer/isTimeLog/isOutsideApp` | Canonical | Filter | 系统轨迹/记录（subordinate） | **排除**（`EventService.isSubordinateEvent`） | Timer 可能参与 TimeCalendar 视图（视产品口径） | **排除**（subordinate 不上时间轴） | **排除**（面板明确排除） | **排除**（EventTree 明确排除） | 通常不作为主结果 | 通常不推送（除非专门映射） | **记录**（若发生变更） |
| `isNote` | Canonical | Filter | 快速访问/标记 | 视产品口径（一般不作为 Plan 条件） | 视产品口径 | **用于标记/批量子树操作**（TimeLog 可切换） | 视产品口径 | 视产品口径 | 可能影响 icon/召回 | 不决定 target | **记录** |
| `parentEventId/position` | Canonical | Structure | 结构与排序 | Plan 结构/缩进/排序（间接影响展示） | 非核心 | 非核心（但可用于子树相关操作） | 非核心 | **核心**（树结构与同级排序） | 非核心 | 不决定 target | `parentEventId` **记录**；`position` **忽略** |

> 说明（默认值约束）：
> - **字段类型**默认 `Canonical`（除非明确标注 `Legacy` 或 `Canonical+Legacy`）。
> - **功能类型**默认 `Filter`（本节表格的主目标是“可见性/分类/过滤口径”；若某字段主要用于同步/路由/结构，则在本列显式标注）。

> 备注（TimeLog Timeline 口径）：TimeLogPage 的时间轴列表与 `EventService.getTimelineEvents` 对齐：
> - 排除 subordinate：`isTimer/isTimeLog/isOutsideApp`；
> - 排除“无显式时间”的 `isPlan/isTask`；
> - 排序/分组使用 `resolveCalendarDateRange(event).start` 作为派生 anchor（兼容 no-time / end-only）。

> 备注（TitleResolver 口径）：任何 UI 展示标题必须统一走 `resolveDisplayTitle(event)`；任何外部同步标题必须统一走 `resolveSyncTitle(event)`；两者都属于只读派生值，**不得**回写到 `event.title.*`。

> 备注（EventHistory 列的含义）：此列表达“该字段变更是否会进入 EventHistory 的 diff/日志”，与“该字段是否参与过滤”无关；详细规则以 4.6.12 为准。

> 备注（为什么看起来“复杂”）：PlanManager 的“并集条件”本质是一个 **plan-scope（计划域）** 判定，用于兼容历史数据与不同入口：
> - `isPlan===true`：明确由 Plan 域创建/维护的任务；
> - `checkType && checkType!=='none'`：历史/部分入口只设置了 checkType（签到/任务语义），但未可靠设置 `isPlan/isTask`；
> - `isTimeCalendar===true`：TimeCalendar 创建的事件也要在 PlanManager 的某些视图中可见。
> - 然后统一排除 subordinate：`EventService.isSubordinateEvent`（`isTimer/isTimeLog/isOutsideApp`）。

> `isTask` 的判定口径（代码现状）：它是 **显式布尔字段**，但为避免 flags 丢失，部分“task-like”逻辑会用 `isPlan/type/checkType` 做兜底（例如 `normalizeEvent` 的 task-like 判定）。字段契约推荐：**创建入口应直接写 `isTask=true`（Plan/Task），不要依赖兜底推断。**

> `isDeadline` 不是“没用”：它会影响 TimeCalendar/PlanSlate 的时间展示语义（单一时间显示“开始/截止”）以及类别推导；同时参与 ToDo/截止相关映射。

> `source` vs `fourDNoteSource` 不是完全重复（现状是冗余但有历史价值）：
> - `source`: 枚举（`local/outlook/...`），表达“事件来源系统”；
> - `fourDNoteSource`: legacy bool，表达“是否由 4DNote 创建”，并被签名/同步识别逻辑广泛使用。
> 未来可考虑以 `source` 为主、逐步弱化/迁移 `fourDNoteSource`，但在迁移完成前两者会共存。

#### 4.5.3 Signal（规划：Eventlog Enhanced 的“重点信号/证据”模型）

本项目的 PRD（Eventlog Enhanced v2.0）定义了 **Signal（重点信号）**，它是“证据/意图”的一等实体，**不是 Event 的布尔字段**：

- Signal 类型示例：`HIGHLIGHT` / `QUESTION` / `ACTION_ITEM` / `OBJECTION` / `CONFIRM` / `BOOKMARK` / `TOPIC_SHIFT`
- 典型用途：
  - 目录/大纲按 Signal 过滤（⭐/❓/✅）
  - Focus Window 生成（Signal 时间戳周边）
  - Reviews/Takeaways 的权重输入（manual_signal/system_signal/behavior_signal/...）
- EvidenceRefs 允许引用 signal：`{ type: 'signal', id: string }`

**规划 Schema（PRD 摘要）**
- `signal_id` / `signal_type`
- `note_id`（必需） / `paragraph_id`（可选）
- `created_at`（Unix ms）
- `audio_offset_ms`（可选） / `image_id`（可选）
- `metadata`（可选）

**契约建议（落地到本仓库的字段规则）**
1) Signal 作为独立实体（表/集合）存储与查询；Event 仅通过 evidence_refs 或关联 ID 引用。
2) 不要用 `isTimeLog/isOutsideApp/isTimer` 去“模拟 Signal”——这些字段当前用于 subordinate/系统轨迹过滤，语义不同。
3) 若需要在 `Event` 上做“信号索引”以便快速过滤，只允许写入 *derived* 的摘要字段（例如 `signalSummary`），不得把 Signal 细节拆散成一堆 `isXxx` 布尔回写到 Event。

---

### 4.6 Module/Page Dataflow（按模块/页面维度：创建/保存/同步/二次加载）

> 目的：把“字段从哪里来、在哪里被写、如何触发同步、刷新/二次加载如何拿到最新值”按模块收敛到一个可执行口径。
>
> 说明：这里描述的是“当前代码事实 + 契约约束”，不是理想化架构图。

#### 4.6.1 通用链路（所有页面共享）

- **创建/保存（推荐主链路）**：UI/Feature → `EventHub.createEvent/updateFields` → `EventService.createEvent/updateEvent` → `normalizeEvent()` → `StorageManager.createEvent/updateEvent`
- **删除（Soft Delete）**：UI/Feature → `EventHub.deleteEvent(id)` → `EventService.deleteEvent(id)` → `updateEvent(id, { deletedAt })`（`skipSync=true`，避免生成 UPDATE action）→ `StorageManager.updateEvent` 落库
- **删除同步（Delete → Sync）**：
  - `EventService.deleteEvent(skipSync=false)` **在满足条件时**会额外调用 `ActionBasedSyncManager.recordLocalAction('delete', 'event', eventId, null, oldEvent)` 入队（代码事实：通常要求 syncManager 已初始化，且该事件不是 `syncStatus: 'local-only'`）
  - `ActionBasedSyncManager` 在 apply 时会：
    - 把本地 `eventId` 写入持久化 tombstone 集合 `deletedEventIds`（防止队列/远端回流导致“复活”）
    - 若存在 `externalId` 且 `syncMode !== 'receive-only'`：调用远端 `deleteEvent(externalId)`
    - 若 `syncMode==='receive-only'`：只保留本地 tombstone，不推送远端删除
  - 读路径的“已删除不可见”：依赖 `EventService.getAllEvents()` / 模块过滤器排除 `deletedAt`；Snapshot/Review 例外会用 **ghost**（派生）显示“已删除痕迹”，但不得写回 canonical
  - **本地-only 删除**：若事件本身是 `syncStatus: 'local-only'`（或调用方显式 `skipSync=true`），删除仅是本地 soft-delete，不入同步队列；也不需要写入 `deletedEventIds`（因为不存在远端回流/外部合并带来的“复活风险”）
- **同步触发**：`EventService` 在本地 create/update/delete 成功后调用 `ActionBasedSyncManager.recordLocalAction()` 入队（除非 `skipSync=true`）
- **远端回写**：`ActionBasedSyncManager` 拉取远端事件后 `recordRemoteAction()` 入队，后续把远端变更合并回本地事件（写入 `externalId/syncStatus/...` 等），再经由 `EventService.updateEvent()` 落库
- **二次加载（读最新）**：页面需要避免闭包/缓存脏读时，应直接 `await EventService.getEventById(id)`（TimeCalendar 已采用）；EventHub 的同步 `getSnapshot()` 可能返回 `null`，强一致读使用 `getSnapshotAsync()`。

#### 4.6.2 Plan 页面（PlanManager / PlanSlate）

代码入口：
- 构建保存对象：[src/features/Plan/helpers/planManagerHelpers.ts](../../src/features/Plan/helpers/planManagerHelpers.ts)
- 批量保存/更新：[src/features/Plan/components/PlanManager.tsx](../../src/features/Plan/components/PlanManager.tsx)

**Title/Time 契约（本模块必须显式遵守的读写/过滤口径）**

- **Title（显示/存储/回写）**
  - 展示读：任何列表项/卡片/tooltip 的标题展示，必须使用 `resolveDisplayTitle(event)`（禁止手写 `event.title?.xxx` 拼接）。
  - 存储写：用户编辑的标题只允许写入 `event.title`（结构化 `EventTitle`），由 `EventService.normalizeTitle` 负责把 Slate/纯文本归一为 `fullTitle/colorTitle/simpleTitle`。
  - 禁止回写：
    - 禁止把 `resolveDisplayTitle/resolveSyncTitle` 的派生结果反向写回 `event.title.*`（避免默认值注入污染 diff/sync）。
    - 禁止把 `eventlog/description/tags` 的派生标题回写到 `title`。

- **Time（显示/存储/回写/过滤）**
  - 存储真相（canonical）：只认 `startTime/endTime/isAllDay/timeSpec/dueDateTime`（`timeSpec.resolved` 属于派生，不是存储真相）。
  - 写入来源：PlanSlate 保存时的时间字段必须来自 `TimeHub.getSnapshot(eventId)`（用户意图单一真相），再由 `EventService.normalizeEvent()` 做 canonical 化。
  - 过滤/排序口径：
    - 任务/截止业务：Plan 的过期/截止语义以 `dueDateTime` 为真相字段（如页面需要按截止落位，必须写清楚是否映射到 `endTime`）。
    - Snapshot/范围类视图：允许使用 `resolveCalendarDateRange(event)` 作为派生 anchor（只读），不得将 anchor 回写到 `startTime/endTime`。

**创建（Create）**
- PlanSlate 的 editor 把业务字段透传在 `updatedItem`（含 title/eventlog/tags/结构字段等）。
- 时间来源遵循“TimeHub 单一真相”：`buildEventForSave()` 会读取 `TimeHub.getSnapshot(updatedItem.id)`，并以 snapshot 的 `start/end/timeSpec` 覆盖写入。

**保存（Save / Update）**
- `buildEventForSave()` 会做“契约友好”的 undefined 保留：
  - `tags`: 只有用户明确置空且原值不是 `undefined/null` 才写 `[]`；否则尽量保持 `undefined`。
  - `isAllDay`: 只有用户显式写入时才写布尔；避免把 `undefined` 默认写成 `false`。
- Plan 的“Plan-origin / Task 语义”当前在构建时直接写入（事实）：
  - `isPlan=true`、`isTask=true`、`isTimeCalendar=false`
  - `type='todo'`（兼容字段）
  - `source='local'`、`fourDNoteSource=true`
  - `isCompleted` 默认 `false`（注意：这属于“默认值注入”，但在 Plan 作为创建入口时是可接受的；关键是不要影响非 Plan 的事件）
- 更新路径：PlanManager 在 `EventHub.updateFields()` 前会把 `updates` 里显式的 `undefined` 删除，避免“用 undefined 清空 canonical 值”。

**同步（Sync）**
- Plan 保存时会从 `tags` 里提取 `calendarIds`（TagService 的 calendarMapping）。
- `syncStatus` 的写入策略（事实）：
  - 若有 `calendarIds`：倾向写 `pending`
  - 若无 `calendarIds` 且旧值不存在：保持 `undefined`（避免注入 `local-only`）
- 同步分流由 [src/utils/syncRouter.ts](../../src/utils/syncRouter.ts) 决定：
  - `isTask===true` → To Do
  - `startTime && endTime` → Outlook Calendar
  - 无时间 → 不推送

**二次加载（Reload / Second Load）**
- PlanManager 在“是否应该 create”时会额外 `await EventService.getEventById(id)` 防止异步创建导致重复 create。
- Plan 的列表状态更多来自本地 itemsMap/editor metadata；如需“读库真相”，仍应以 `EventService.getEventById` 为准。

#### 4.6.3 TimeCalendar 页面（时间日历）

代码入口：[src/features/Calendar/TimeCalendar.tsx](../../src/features/Calendar/TimeCalendar.tsx)

**Title/Time 契约（本模块必须显式遵守的读写/过滤口径）**

- **Title（显示/存储/回写）**
  - 展示读：日历事件块/详情标题必须使用 `resolveDisplayTitle(event)`。
  - 存储写：只通过编辑入口写 `event.title`（`EventTitle`），不允许写入派生标题。
  - 禁止回写：不得把展示标题回写 `event.title.*`；不得把 `description/eventlog` 的派生内容回写标题。

- **Time（显示/存储/回写/过滤）**
  - 存储真相（canonical）：时间块必须以 `startTime/endTime/isAllDay` 表达；如 TimeHub 同步写入 `timeSpec`，也必须视为 canonical 之一。
  - 渲染/落位：TimeCalendar 的“位置/排序”允许用 `resolveCalendarDateRange(event)` 作为派生 anchor（只读）。
  - 严格时间声明（若页面宣称 strict-time）：只能使用 `timeSpec.resolved`，且缺失则不展示；不得用 `startTime/endTime` 兜底以免跨视图可见性漂移。
  - 禁止回写：不得把派生 anchor（如 `resolveCalendarDateRange` 结果）回写到 `startTime/endTime`。

**创建（Create）**
- 用户框选时间段：立即构造 Event 并 `EventHub.createEvent(newEvent)` 先落库，再打开编辑模态框。
- 当前写入字段（事实）：
  - `startTime/endTime/isAllDay`（来自选择）
  - `tags: []`，`calendarIds: []`（表示“未选择日历/不触发同步”）
  - `syncStatus: 'local-only'`
  - `fourDNoteSource: true`
  - 注意：这里没有显式写 `isTimeCalendar=true`（如果产品希望“模块来源”可追踪，需要在契约层明确由该入口写入）。
    - ⚠️ 契约建议：TimeCalendar 的创建入口应显式写 `isTimeCalendar=true`（模块来源），否则依赖“plan-scope 并集条件”的页面（PlanManager / Upcoming Panel）可能漏召回部分日历事件。

**保存（Save / Update）**
- 拖拽/编辑通过 `EventHub.updateFields()` 增量更新：
  - 时间块事件：更新 `startTime/endTime/isAllDay/title/location` 等。
  - “无时间 task”拖拽语义（代码明确）：不写 `startTime`，只写一个“计划完成时间”到 `endTime`（设置为当天 23:59:59.999）。

**同步（Sync）**
- 新建默认 `local-only`；当用户在编辑模态框里选择标签/日历后，`syncStatus` 会被更新为 `pending`（由 EventEditModal 的逻辑决定）。
- 同步目标仍由 `syncRouter` 决定：task → todo；有完整 start+end → calendar。

**二次加载（Reload / Second Load）**
- 点击日历事件打开编辑时，TimeCalendar 会 `await EventService.getEventById(eventId)` 读取最新事件，避免闭包拿到旧对象。
- 新建事件如果用户取消，会删除刚刚创建的 event（通过 `EventHub.deleteEvent(newlyCreatedEventId)`）。

#### 4.6.4 TimeLog 页面（时间流 / 日记流）

代码入口：[src/features/TimeLog/pages/TimeLogPage.tsx](../../src/features/TimeLog/pages/TimeLogPage.tsx)

**Title/Time 契约（本模块必须显式遵守的读写/过滤口径）**

- **Title（显示/存储/回写）**
  - 展示读：Timeline 列表/分组标题必须使用 `resolveDisplayTitle(event)`。
  - 存储写：标题只写入 `event.title`（`EventTitle`）；正文只写 `eventlog`（Slate JSON 字符串），`description` 交由 normalize 派生。
  - 禁止回写：不得把 `resolveDisplayTitle` 的结果写回 `title`；不得把 `description` 写回 `eventlog`/`title`。

- **Time（显示/存储/回写/过滤）**
  - 存储真相（canonical）：`startTime/endTime/isAllDay/timeSpec`（若存在）是时间真相；TimeLog 不允许为“无时间笔记”注入默认时间来改变语义。
  - 排序/按天分组：必须使用 `resolveCalendarDateRange(event).start` 作为 anchor（派生、只读）。
  - Timeline 收录过滤（必须与代码保持一致，禁止各处自写一套）：
    - 排除 subordinate：`isTimer || isTimeLog || isOutsideApp`（或等价的 `EventService.isSubordinateEvent`）。
    - Plan/Task 若没有明确时间，不应被当作 timeline 事件收录（避免“计划/待办默认落位”污染时间流）。
    - 必须排除 `deletedAt`。
  - 禁止回写：任何派生 anchor/过滤结果不得写回 canonical 时间字段。

**创建（Create）**
- TimeGap 点击“创建事件”：构造带时间段的事件（默认 30 分钟）并先 `EventHub.createEvent()`，再打开编辑模态框。
  - `createdAt/updatedAt` 对齐到用户选择的 startTime（用于排序/显示一致性）。
- TimeLog 的“创建笔记（纯 eventlog）”路径（事实）会直接调用 `EventService.createEvent(newEvent)`（绕过 EventHub）：
  - 默认 **不写入时间字段**；若来自 TimeGap 则写一个 `startTime` 作为锚点（但仍可能无 `endTime`）。
  - 明确写 `isPlan=false/isTimeCalendar=false/isTask=false`，避免被 Plan/Calendar 过滤误收。
  - 写入一个空的 `eventlog` Slate JSON 结构作为正文容器。

**保存（Save / Update）**
- TimeLog 的 create/edit modal 保存统一走 `EventHub.updateFields()`（若数据库已有该事件），否则走 `EventHub.createEvent()`。

**同步（Sync）**
- 默认 `syncStatus: 'local-only'`；只有用户在编辑模态框中添加 `calendarIds/tags/syncMode` 才会进入可同步态。
- TimeLog 不应该通过“默认时间注入”让无时间笔记变成可同步 calendar 事件（契约硬约束）。

**二次加载（Reload / Second Load）**
- TimeLog 列表对“刚创建的 note”采用本地增量插入（避免全量 reload 导致日期范围过滤问题）。
- 再次打开编辑时，应以 `EventService.getEventById` 为准，避免 state 中缓存事件字段落后于落库结果。

**一致性注意（TimeResolver 口径）**
- TimeLog 的“排序/按天分组”使用 `resolveCalendarDateRange(event).start` 作为 anchor（兼容 no-time / end-only task）。
- 这是一种“派生时间锚点”，与其他视图可能使用的 `timeSpec.resolved`（严格时间）或 `dueDateTime`（deadline 语义）不是同一个口径。
- 因此需要把 TimeLog 归类为：**timeline/chronological 视图（允许派生 anchor）**，避免误以为它和 Upcoming（即将开始、严格时间）应该展示完全一致。

#### 4.6.5 通用编辑入口（EventEditModalV2）

代码入口：[src/features/Event/components/EventEditModal/EventEditModalV2.tsx](../../src/features/Event/components/EventEditModal/EventEditModalV2.tsx)

**创建/保存（Create/Save）**
- `handleSave()` 会统一构造 `updatedEvent` 并交给 EventHub：
  - `title`: 保存为 Slate JSON（colorTitle）；`EventService.normalizeTitle` 负责生成 `EventTitle` 三层结构。
  - `eventlog`: 保存为 Slate JSON 字符串；同时将 `description: undefined`，让 `EventService` 从 eventlog 派生并做签名（避免 UI 自己维护两套内容）。
  - 时间字段：在 UI 内做格式化/降级解析，写入 `startTime/endTime/isAllDay`。
  - 同步字段：写入 `calendarIds/syncMode/subEventConfig` 等。
- syncStatus 决策（事实）：
  - Timer 运行中强制 `local-only`
  - 有 tags 或 calendarIds 则 `pending`
  - 否则保留原值或 `local-only`

**注意（契约风险点，需要持续约束）**
- EventEditModal 当前在“更新时间不完整”时会自动把 `isTask=true`（把事件变成 task）。这属于“强语义注入”，需要与字段契约的 `checkType`/`isTask` 口径对齐，避免把纯笔记/计划误变成 task。

**二次加载（Reload / Second Load）**
- 取消（Cancel）不会调用 update，下一次打开会从 `EventService` 重新加载最新数据。

#### 4.6.6 同步模块（ActionBasedSyncManager）

代码入口：[src/services/sync/ActionBasedSyncManager.ts](../../src/services/sync/ActionBasedSyncManager.ts)

**本地变更入队（Local → Queue）**
- `recordLocalAction(create|update|delete, entityType, entityId, data, oldData)`：
  - 将动作写入队列并持久化（IndexedDB 的 syncQueue）
  - delete 时会清理同一 event 的历史待处理动作（避免对已删除事件重复 update）

**路由（Queue → Remote Target）**
- 同步目标由 [src/utils/syncRouter.ts](../../src/utils/syncRouter.ts) 决定：
  - `syncMode='receive-only'`：不推送
  - `isTask===true`：推送 ToDo
  - `startTime && endTime`：推送 Outlook Calendar
  - 否则不推送

**Title/Time 契约（Sync 必须遵守的读写/过滤口径）**

- **Title（外部字段映射）**
  - 外部 subject/title：必须使用 `resolveSyncTitle(event)`（只读派生）。
  - 禁止回写：Sync 过程中不得把 `resolveSyncTitle` 的结果写回 `event.title.*`（即使远端要求纯文本，也只能在映射层转换）。

- **Time（外部字段映射）**
  - 同步路由只允许依赖 canonical：`isTask/startTime/endTime/syncMode`（严禁依赖 `resolveCalendarDateRange` 等派生 anchor）。
  - 映射到远端日历时，只允许使用 canonical `startTime/endTime/isAllDay`（以及必要的时区/format 转换），不得“补齐/注入默认时间”来满足路由条件。
  - 远端回流合并写入本地：只允许写入“远端真相字段”（如 `externalId`、必要的 `startTime/endTime/isAllDay/updatedAt` 等），不得写入 UI 派生字段。

**远端拉取与回写（Remote → Local）**
- 远端拉取按“逐日历拉取”实现，确保每个远端事件带准确的 `calendarId`；随后根据 `externalId/IndexMap` 匹配本地事件。
- 远端变更会转换为 `recordRemoteAction(create|update|delete)` 入队，然后合并回本地事件（写入/更新 `externalId/syncStatus/updatedAt/...` 等），最终仍通过 `EventService.updateEvent()` 落库并触发 UI 更新。

#### 4.6.7 存储层（StorageManager）

代码入口：[src/services/storage/StorageManager.ts](../../src/services/storage/StorageManager.ts)

- `initialize()`：IndexedDB 必需；Electron 环境可启用 SQLite。
- `queryEvents()`：
  - 单 ID 查询优先命中 LRU cache（避免频繁读库）
  - 结果会缓存回内存
- **契约硬约束**：StorageManager 只做被动持久化与查询，不得擅自改写业务字段（尤其是 `updatedAt/startTime/endTime/syncStatus`）。

#### 4.6.8 Plan Snapshot（Review 模式）

代码入口：
- Snapshot 过滤口径封装：[src/features/Plan/helpers/planManagerFilters.ts](../../src/features/Plan/helpers/planManagerFilters.ts)
- Snapshot 数据/ghost 组装（核心）：[src/features/Plan/components/PlanManager.tsx](../../src/features/Plan/components/PlanManager.tsx)
- 历史服务：[src/services/EventHistoryService.ts](../../src/services/EventHistoryService.ts)

**模式定义（Mode）**
- `mode: 'normal' | 'snapshot'`（见 `shouldShowInPlanManager()`）。
- Snapshot 模式的时间范围来自 UI 的日期范围选择（通常由 ContentSelectionPanel 驱动）。

**创建/保存（Create/Save）**
- Snapshot 模式本身不引入新写路径：用户编辑仍走 Plan 的正常保存链路（`EventHub.updateFields` → `EventService.updateEvent`）。

**二次加载/组装（Reload / Assemble for Review）**
- Snapshot 的“列表内容”不是简单 `events.filter(dateRange)`：PlanManager 会从 `EventHistoryService` 得到两个集合并合成：
  - `existingAtStart = getExistingEventsAtTime(startTime)`：起点时刻“已存在”的事件集合
  - `createdInRange`：时间段内 `operation==='create'` 的 eventId 集合
  - 最终展示集合：`existingAtStart ∪ createdInRange`（并对“完全空白事件”做过滤）

**删除字段走向（Delete Field in Snapshot）**
- 常规视图：`deletedAt` 一律视为“不可见”（`shouldShowInPlanManager()` 首行直接排除）。
- Snapshot/Review 的“删除痕迹”通过 **ghost 事件**实现：
  - 从 `EventHistoryService.queryHistory({ startTime, endTime })` 拿到 `operation==='delete'` 且 `before` 存在的记录
  - 满足“起点存在或范围内创建”的删除才会被纳入（避免无关 tombstone 噪音）
  - 以 `before` 为基底 push 一个派生对象：`{ ...before, _isDeleted: true, _deletedAt: log.timestamp }`
  - 这些 `_isDeleted/_deletedAt` 是 **UI 派生字段**：不得写回 `Event` canonical；也不应影响 Sync Router

**过滤约束（Contract）**
- ghost 事件仍会走一组“plan-scope 过滤”以减少噪音：
  - `checkType` 必须有效且不为 `'none'`
  - 排除 subordinate（`EventService.isSubordinateEvent`）
  - 受 `hiddenTags` 影响

#### 4.6.9 Dashboard（Upcoming Panel / UpcomingEventsPanel）

代码入口：[src/features/Dashboard/components/UpcomingEventsPanel.tsx](../../src/features/Dashboard/components/UpcomingEventsPanel.tsx)

**数据来源（Read）**
- 面板不自己“全量加载 + 缓存维护”，而是订阅式拿快照：`useEventHubSnapshot({ enabled })`。
- 事件范围筛选使用 `timeSpec.resolved`（TIME_ARCHITECTURE）：没有 `timeSpec.resolved` 的事件直接不展示。

**Title/Time 契约（本模块必须显式遵守的读写/过滤口径）**

- **Title（显示/存储/回写）**
  - 展示读：列表项标题必须使用 `resolveDisplayTitle(event)`；禁止直接读 `event.title.*` 拼装。
  - 禁止回写：不得把展示标题写回 `event.title.*`。

- **Time（显示/存储/回写/过滤）**
  - 严格时间：Upcoming 必须只使用 `timeSpec.resolved` 作为“显示/排序/过滤”的唯一口径；缺失则不展示。
  - 禁止兜底：不得改用 `startTime/endTime/createdAt` 兜底（否则会与 TimeLog/PlanSnapshot 的派生 anchor 口径混淆）。
  - 禁止回写：不得把 `timeSpec.resolved` 或任何派生时间结果回写到 canonical 时间字段。

**过滤口径（Filter）**
- 并集条件（面板内实现）：`isPlan===true` OR (`checkType && checkType!=='none'`) OR `isTimeCalendar===true`
- 排除 subordinate（面板内显式排除）：`isTimer===true || isOutsideApp===true || isTimeLog===true`
- 时间范围：按 `getTimeRange(activeFilter, now)`，并对 `timeSpec.resolved.start` 做区间筛选
- `deletedAt`：契约口径应排除（通常由上游事件快照/`getAllEvents` 已过滤）；如未来切换为 includeDeleted 快照，面板必须显式排除 `deletedAt`

**一致性检查（避免口径漂移）**
- 当前仓库同时存在两套“Upcoming 事件过滤公式”：
  - 面板内（订阅快照 + plan-scope 并集条件 + subordinate 排除 + `timeSpec.resolved` 时间范围）
  - `upcomingEventsHelper.filterAndSortEvents()`（偏 `checkType` 单条件 + 时间范围 + subordinate 排除）
- 建议收敛到单一的 `plan-scope` 过滤函数（可复用 Plan 的 `shouldShowInPlanManager` / 抽出 shared predicate），并让 helper 与面板共用，避免未来修 bug 时只改一处导致“同一事件在不同入口可见性不一致”。

**写入（Write）**
- 面板的 checkbox 直接调用 `EventService.checkIn/uncheck(eventId)`（不是 `EventHub.updateFields`）。
- 写入结果依赖订阅驱动刷新；有兜底 `refresh()`（避免部分写路径不触发快照更新）。

#### 4.6.10 TimeVisual（状态竖线 / StatusLine）

代码入口：
- 竖线容器组件：[src/components/shared/StatusLineContainer.tsx](../../src/components/shared/StatusLineContainer.tsx)
- 状态计算与 segments 生成：[src/features/Plan/components/PlanManager.tsx](../../src/features/Plan/components/PlanManager.tsx)
- 日期范围选择（驱动 Snapshot/竖线范围）：[src/components/ContentSelectionPanel.tsx](../../src/components/ContentSelectionPanel.tsx)

**定位（What it is）**
- TimeVisual 是一个“按时间范围回放”的可视化层：把 `EventHistoryService` 的操作历史（create/update/checkin/delete）映射为每个事件行的多个状态段（segments），由 `StatusLineContainer` 统一渲染“多列并行竖线”。

**数据来源与生命周期（Read/Compute）**
- PlanManager 会并行查询 editorItems 内每个事件的状态：`getEventStatuses(eventId)` → `EventHistoryService.queryHistory({ eventId, startTime, endTime })`。
- Snapshot ghost（`_isDeleted`）会强制加入 `deleted` 状态（即使该 eventId 在 history 里没有 delete 记录），作为“Review 显示策略”。

#### 4.6.11 Cross-Module Consistency Checks（跨模块冲突检查清单）

> 目的：把“类似 TimeResolver 使用口径冲突”的问题制度化检查，避免只看字段写入点却漏掉“派生/过滤口径漂移”。

**Resolver 覆盖表（按模块/视图必须显式选型）**

| 模块/视图 | UI Title（展示） | Sync Title（外部） | Time Anchor（排序/过滤） |
|---|---|---|---|
| PlanManager / PlanSlate | `resolveDisplayTitle` | - | 业务规则混合：任务/截止看 `dueDateTime`；Snapshot 范围类视图用 `resolveCalendarDateRange` |
| TimeCalendar | `resolveDisplayTitle` | - | TimeCalendar 渲染/排序允许用 `resolveCalendarDateRange`；若宣称 strict-time 则必须用 `timeSpec.resolved` |
| TimeLog（Timeline） | `resolveDisplayTitle` | - | `resolveCalendarDateRange`（派生 anchor；允许 no-time/end-only） |
| Dashboard Upcoming | `resolveDisplayTitle` | - | strict-time：`timeSpec.resolved`（缺失则不展示） |
| EventTree（树） | `resolveDisplayTitle` | - | 不负责时间 anchor；仅消费 canonical 时间做展示（如有） |
| Sync（ActionBasedSyncManager） | - | `resolveSyncTitle` | 路由/同步不允许用派生时间注入；如需要“日期落位”只能用派生计算（不回写字段） |

**检查 1：每个页面必须声明并遵守 1 种 Time Anchor 口径**
- 严格时间口径：仅使用 `timeSpec.resolved`（例如 Upcoming 倒计时/即将开始）
- 派生锚点口径：使用 `resolveCalendarDateRange()`（例如 TimeLog 排序/按天分组、Plan Snapshot 范围过滤）
- Deadline 口径：使用 `dueDateTime`（例如 Plan 的“过期/截止”业务规则）
- 要求：同一页面不要“过滤用 A、排序用 B”混搭；如果必须混搭，必须写清楚“为什么”。

**检查 2：task-like 事件的 flags 必须保证（否则派生锚点会漂移）**
- `resolveCalendarDateRange()` 的 task-date-only 分支依赖 `isTask && !startTime`。
- 若某类事件是 task-like 但 `isTask` 丢失，则会走 time-based 分支，并可能落到 `createdAt(now)` 的 time-of-day，造成：
  - TimeLog/TimeCalendar/Plan Snapshot 的日期落位与 Plan 视图的任务语义不一致
- 结论：创建入口必须直接写 `isTask=true`（Plan/Task），normalize 的兜底推断只能当救急。

**检查 3：deadline-only 事件的落位语义是否一致（最容易漏）**
- Plan 的过期过滤依赖 `dueDateTime`；但当前 `resolveTaskAnchorTimestamp/resolveCalendarDateRange` **不考虑 `dueDateTime`**。
- 这意味着：一个“只有 `dueDateTime`、没有 `startTime/endTime`”的任务，可能在 Plan 被视为“有明确截止”，但在 TimeLog（按 `resolveCalendarDateRange`）仍按 `createdAt` 落位。
- 若产品希望 deadline-only 任务在 TimeLog/Calendar 按截止日落位，需要：
  - 要么在写入侧把 deadline 写入 `endTime`（计划完成时间）并保持 `dueDateTime` 仅做 deadline 展示/过滤
  - 要么扩展 TimeResolver，把 `dueDateTime` 纳入派生 anchor（需要显式决策，避免行为变化）

**检查 4：TimeHub 空字符串清空语义必须全局一致**
- Plan 当前把 `''` 视为 `undefined`（避免 `Date('')`/错误显示）。
- 任何读取 `startTime/endTime` 的页面都必须把空字符串当作“无时间”，否则会出现：
  - 显示上有时间但排序/过滤把它当无时间（或反之）

**检查 5：TIME_ARCHITECTURE 与 legacy 字段的边界**
- 若页面宣称遵守 TIME_ARCHITECTURE（如 Upcoming），则必须满足：
  - 数据来源保证 `timeSpec.resolved` 可用（或明确“缺失则不显示”）
  - 不允许改用 `startTime/endTime/createdAt` 偷偷兜底，否则会导致跨视图可见性不一致且难以调试。

**检查 6：每个页面必须声明并遵守 1 种 Title Resolver 口径（展示 vs 同步）**
- 展示标题（UI list/card/tooltip）：必须统一使用 `resolveDisplayTitle(event)`（默认偏好 `colorTitle`，并具备 tags/eventlog/fallback 的兜底策略）。
- 同步标题（外部 subject/title）：必须统一使用 `resolveSyncTitle(event)`（严格偏好 `simpleTitle`，必要时 tags/eventlog/fallback 兜底；不回写）。
- 禁止：页面内手写 `event.title?.simpleTitle || event.title?.colorTitle || event.title?.fullTitle` 作为展示口径。
  - 原因：`colorTitle/fullTitle` 可能是 Slate JSON 或历史/损坏形态，直接展示会出现“泄露 JSON/时间戳 divider/HTML 标签”等问题；同时不同页面写法不同会导致标题显示不一致。
- 要求：列表/面板的截断策略必须集中（例如统一由 resolver 的 `maxLength` 控制），不要每个页面各自 `slice(0, N)`。
- 要求：任何“从 tags/eventlog 派生出来的标题”都必须是只读派生值，**不得**回写到 `event.title.*`（避免默认值注入导致 Sync/冲突检测被污染）。

**契约约束（Contract）**
- 竖线状态（segments / statusMap）全部是 **派生数据**：
  - 不得写回 `Event` canonical（不写入 `status`/`isDeleted`/`bulletLevel` 等作为真相）
  - 不得参与 Sync Router 决策（同步分流仍只看 canonical 字段：`syncMode/isTask/startTime/endTime` 等）
- UI 可以为了性能做缓存（例如 segments hash / matrix 算法），但缓存不得反向污染存储层。

#### 4.6.12 EventHistory（事件变更历史 / 版本日志）

代码入口：[src/services/EventHistoryService.ts](../../src/services/EventHistoryService.ts)

> 定位：EventHistory 是一套**审计/回放/派生索引**能力。
> - 主要用途：Plan Snapshot / TimeVisual 复盘、诊断变更来源、临时ID映射追踪、以及“是否存在于某时刻”的推导。
> - 强约束：它不是 `Event` 的真相来源，不能反向驱动业务写入逻辑。

**存储与 Schema（Write/Store）**
- 存储后端通过 `StorageManager.createEventHistory()` 写入（IndexedDB + 可选 SQLite 双写，取决于环境）。
- 数据形态（见 [src/types/eventHistory.ts](../../src/types/eventHistory.ts)）：
  - `id` / `eventId` / `operation: 'create'|'update'|'delete'|'checkin'` / `timestamp`
  - `source: string`（变更来源）
  - `before?: Partial<Event>` / `after?: Partial<Event>`（快照）
  - `changes?: ChangeDetail[]`（字段差异摘要）
  - `metadata?: Record<string, any>`（扩展：如 bestSnapshot、删除上下文）
  - `tempIdMapping?`（`line-xxx → event_xxx` 的映射追踪）

**写入入口（Where logs are produced）**
- Create：`EventService.createEvent()` 在写入成功后调用 `EventHistoryService.logCreate(finalEvent, source)`（会跳过池化占位事件）。
- Update：`EventService.updateEvent()` 在 normalize 后调用 `EventHistoryService.logUpdate(eventId, beforeNormalized, afterNormalized, source)`。
  - 关键联动：`updateEvent` 只有在 `logUpdate` 判定“有实质变更”时才更新 `updatedAt`，避免 `updatedAt → description签名 → history噪音` 的链式爆炸。
- Delete：`EventService.deleteEvent()` 软删除后，按“是否曾经非空”决定是否写 delete history；若写入则使用 `logDeleteWithSnapshot(event, bestSnapshot, source)` 把 bestSnapshot 放入 `metadata.bestSnapshot`。
- Checkin/Uncheck：`EventService.checkIn/uncheck()` 会写 `operation='checkin'` 的日志（注意：当前 title 兜底仍用 `simpleTitle || 'Untitled Event'`，这属于 UI/日志展示层，不应回写 Event）。
- TempId：创建时若发生临时ID解析，会额外 `recordTempIdMapping(tempId, realId)`。

**版本/变更判定规则（Diff / “为什么会爆炸”）**
> 这里的“版本”指 EventHistory 的“是否记录一条 update”，不是 `Event` schema 的版本号。

- `logUpdate` 只有在 `extractChanges(before, afterPatch)` 返回非空时才记录。
- `extractChanges` 的关键策略（代码事实）：
  - 只遍历 `after` 中出现的字段（`Object.keys(after)`），避免把“patch 未包含的字段”误判为被删除。
  - 忽略字段（不计入变化）：`updatedAt/position/fourDNoteSource/_isVirtualTime/localVersion/lastLocalChange/lastSyncTime` 等。
  - `title`：走专用深比较（防止结构化 title 误判）。
  - `tags`：规范化后比较（避免 `undefined ↔ []` 噪音）。
  - `description`：直接跳过（视为 `eventlog` 的派生 + 外部同步字段）。
  - `eventlog`：用 `countBlockLevelParagraphs()`（Block-Level paragraph 数量）判断变化；这会带来一个契约风险：
    - 内容变更但 block 数不变 → 可能漏记；
    - 结构/序列化差异导致 block 数变 → 可能产生噪音。

**可靠性与清理（Retention / Cleanup）**
- `saveLog()` 当前是 fire-and-forget：写库失败只打日志，调用方不可感知；若 `StorageManager` 尚未初始化，日志会直接丢弃（典型“漏记”来源）。
- 内置自动清理：`startPeriodicCleanup()`（每小时）+ `autoCleanup()`（删除无意义变更/删除 backfill）；并提供 `healthCheck()` 统计来源分布与清理建议。

**契约约束（Contract）**
- EventHistory 的 `before/after/changes/metadata` 全部视为 **派生/审计数据**：
  - 禁止把 history 回放结果写回 `Event` canonical（除非明确的 repair/迁移工具路径）。
  - 禁止业务逻辑把“history 是否存在/是否记录到”当作必然成立的条件（因为初始化窗口期/写入失败会导致缺失）。
- `source` 必须可控且稳定：
  - 调用方必须传入可追踪的来源（例如 `user-edit/outlook-sync/batch-import/backfill-from-timestamp`）；否则按字符串自由发挥会导致诊断困难。
  - 若某类来源属于“同步回流/内部修复”，应在契约层默认 **不作为用户变更历史** 使用（否则容易造成 history 爆量）。
- EventHistory 的比较规则必须与字段契约对齐：
  - `description` 不作为业务真相字段，因此不应成为 history 的核心触发字段。
  - `tags` 的 `undefined ↔ []` 互转属于契约明确禁止的“默认值注入”，若出现应优先修复写入侧而不是靠清理补救。

---

## 5. 推荐的“字段规则入口”

- **规则定义（本文）**：字段契约 + hard rules。
- **审计与风险清单**：见本文附录（已合并，避免来回跳转）。
- **时间字段规范（各模块 PRD 也有引用）**：例如 [docs/PRD/TIME_PICKER_AND_DISPLAY_PRD.md](../PRD/TIME_PICKER_AND_DISPLAY_PRD.md)

---

## 附录：字段写入审计与风险点（合并版）

> 说明：以下内容原本是独立的“写入审计”文档；为了避免每个文档几十行还要跳转，这里将其并入字段契约。
>
> 范围：本地编辑链路 + Plan/TimeHub + Storage + 同步（ActionBasedSyncManager）+ 派生层。

> 口径说明：本附录是“对照代码的写入审计 + 风险点清单”，不是第二份字段契约。
> - 若与上文（第 1～5 节）的字段契约出现不一致：以上文为准，并应把附录修正到一致。

---

### A1. Canonical Schema（审计引用）

- Canonical 定义：见 [src/types.ts](../../src/types.ts) 中的 `export interface Event`。
- 注意：代码中存在少量“未被类型声明但实际使用”的字段（例如 `_isVirtualTime`、`bulletLevel`）。本审计把它们视为 **internal/legacy**，并给出约束建议。

---

### A2. 分层所有权（Owner Model / 审计引用）

#### A2.1 写入层级

- **UI/Feature 层（PlanSlate/TimeCalendar/EventEditModal）**
  - 负责收集用户输入（title/eventlog/tags/time intent）
  - 不应自行“补齐系统字段”（createdAt/updatedAt/syncStatus 等），除非该模块就是“创建入口”。

- **TimeHub（时间意图单一真相）**
  - 负责：`timeSpec` 与 `startTime/endTime/isAllDay` 的“用户意图”写入
  - 不负责：把没有时间的 Task/Plan 注入默认时间

- **EventService.normalizeEvent（canonical 化入口）**
  - 负责：title 结构化、eventlog/description（含签名）、createdAt/updatedAt 选择策略、兼容字段清理
  - **必须遵守**：读取路径轻量，写入路径 canonical。

- **Storage 层（StorageManager/IndexedDBService/SQLiteService）**
  - 目标：被动持久化 canonical 数据
  - **不应**：擅自改写业务字段（特别是 `updatedAt`、time 字段、sync 字段）

- **Sync 层（ActionBasedSyncManager）**
  - 负责：把本地 Event 映射到远端（Outlook/To Do），以及把远端变更合并回本地
  - 可写字段：`externalId`、`syncStatus`、`synced*` 映射字段，以及来自远端的 `createdAt/updatedAt/startTime/endTime`（仅 external-sync 场景）

- **派生层（EventNodeService / Stats / History）**
  - 只读 Event；生成派生表（Nodes/Stats/History），不得反向写回 canonical Event（除非明确的 repair 工具路径）。

---

### A3. 字段审计表（对照代码写入点）

> 说明：下面的“必要/可选”指 **canonical 存储形态**（写入后应满足）。

#### A3.1 Identity & Core

| 字段 | 必要 | Owner | 允许写入 | 规则/备注 |
|---|---:|---|---|---|
| `id` | 必要 | EventService | create 入口 | 若无/非法：`EventService.createEvent()` 会生成 UUID。 |
| `title` (`EventTitle`) | 可选 | UI + EventService | UI + EventService | **允许缺省**（尤其 Plan/快速输入/外部数据）。若需要避免空指针，可做 shape-normalize（把 `title` 规范为“空对象/空 Slate 结构”）；但不应为了“显示效果”把派生标题写回存储。 |
| `eventlog` | 可选 | EventService | UI + EventService | 可为 `string`(legacy) 或 `EventLog`；写入前应 canonical 化为对象。 |
| `description` | 可选 | EventService | EventService | **仅用于同步与签名承载**（Outlook/ToDo 映射等）；应从 `eventlog` 派生并加签名。**App 内渲染/展示禁止依赖该字段**（展示应走 title/eventlog 的派生层）。 |

##### A3.1.1 派生标题（Derived Title）策略：用于 TimeCalendar / EventTree 渲染与同步

> 目的：在 `title` 缺省时提供稳定的“展示/同步标题”，但**不把派生结果写回 Event 存储**，避免字段被“默认值注入”污染。

> 口径：以下为“建议默认实现”（可按产品需要调整），不是字段契约的硬编码细节；唯一硬约束是：派生标题必须只读计算且不得回写 `Event.title`。

**规则（当 `event.title?.simpleTitle` 为空或缺省时）：**
1) **优先使用标签作为标题**：
   - 若 `event.tags` 有值：取“第一个可展示标签”的 label 作为标题。
   - label 获取建议做成可注入依赖：UI 层用 TagService 把 tagId → tagName；Sync 层若拿不到映射则退化使用原始 tag 字符串。
2) **其次使用 eventlog 内容摘要**：
   - 从 eventlog 提取纯文本（把换行符 `\n` 变为空格，合并多空格）。
  - 取前 N 个字符作为摘要（默认 N=10）；若原文长度 > N，追加省略号 `…`。

**推荐落点（架构）：**
- 提供纯函数/无副作用的 `TitleResolver`（例如 `resolveDisplayTitle()` / `resolveSyncTitle()`）。
  - deps: `{ getTagLabel?: (tag: string) => string | undefined }`
  - 由 TimeCalendar、EventTree、Sync（subject/title）等统一调用。
- **不要保留/依赖“虚拟标题”这类旧式 API**：派生标题必须是“只读计算”，不应回写 canonical `Event.title`。统一改用 `src/utils/TitleResolver.ts` 的纯函数（展示：`resolveDisplayTitle`；同步：`resolveSyncTitle`）。

#### A3.2 Time（Plan/Task vs Calendar vs Note）

| 字段 | 必要 | Owner | 允许写入 | 规则/备注 |
|---|---:|---|---|---|
| `startTime` / `endTime` | 条件必需 | TimeHub + EventService | TimeHub、TimeCalendar、Sync | **Task/Plan：允许 undefined/空**；**Calendar 事件：必需**（由 `validateEventTime()` 约束）。 |
| `isAllDay` | 可选 | TimeHub | TimeHub、Sync | **契约口径**：Task/Plan 允许 `undefined`（不应被默认填成 `false`）。**审计发现**：`normalizeEvent()` 当前会把 `undefined` 变成 `false`，属于“默认值注入/契约偏离”；整改目标是仅在字段存在时写入。 |
| `timeSpec` | 可选 | TimeHub | TimeHub | 作为“意图+解析”来源；原则上由 TimeHub 写入。 |
| `dueDateTime` | 可选 | UI/Plan/Task | UI、Sync | ToDo/Task 语义字段，和 `endTime` 不等价。 |
| `displayHint` | 可选 | UI | UI | 仅展示提示；不要参与强制时间计算。 |
| `isFuzzyDate` / `timeFieldState` / `isFuzzyTime` / `fuzzyTimeName` | 可选 | TimeHub | TimeHub | 这些字段目前在 TimeHub 通过 `(updated as any)` 写入；建议补齐类型声明并明确“仅 TimeHub 写”。 |

**历史反例（审计发现，必须持续避免）：Plan/Task 被注入虚拟时间**
- 背景：曾出现为了“无时间的 note-like 事件”提供时间锚点，而把 `createdAt` 注入到 `startTime` 并标记为虚拟时间的做法。
- 字段契约口径：**虚拟时间不得写回 canonical `Event` 存储**；如外部同步/展示需要时间锚点，只允许在派生层或同步 payload 映射中临时计算。
- 最低保障：任何可能产生 `startTime = createdAt` 的逻辑都必须排除 Plan/Task（例如基于 `isPlan/isTask/type/checkType` 的 task-like 判定）。

#### A3.3 Timestamps & Versioning

| 字段 | 必要 | Owner | 允许写入 | 规则/备注 |
|---|---:|---|---|---|
| `createdAt` | 必要 | EventService | create 入口、Sync(external) | `normalizeEvent()` 选择策略：Block-level → 签名 → 传入；取最早值。 |
| `updatedAt` | 必要 | EventService | update 入口、TimeHub、Sync(external) | `normalizeEvent()` 选择策略：Block-level/签名/传入；取最新值。 |
| `lastLocalChange` | 可选 | EventService | EventService | 当前 normalizeEvent 会写 `lastLocalChange = now`。建议明确这是“本地写入流水号时间”。 |
| `localVersion` | 可选 | EventService | EventService | 当前 normalizeEvent 会 `+1`。注意：这会导致“任何 update 都必定变更”。 |

**⚠️ 风险点：Storage 层强制覆盖 updatedAt**
- `IndexedDBService.updateEvent()` 当前会无视传入的 `updatedAt`，强制 `updatedAt = now`。
- 这会破坏“上层决定 updatedAt”的契约，并导致：
  - external-sync 想写入远端 `lastModifiedDateTime` 时被本地时间覆盖
  - 一些“无实质变更”的写入在存储层仍变成“有变更”
- 建议：存储层只在缺失 `updatedAt` 时兜底，而不是强制覆盖。

#### A3.4 Sync & Source

| 字段 | 必要 | Owner | 允许写入 | 规则/备注 |
|---|---:|---|---|---|
| `source` | 可选 | EventService/Sync | Sync、EventService | `normalizeEvent()` 会尝试从签名提取；UI 不要随意写。 |
| `fourDNoteSource` | 可选 | EventService/Sync | create 入口、Sync | 同上：优先从签名提取；用于区分本地 vs Outlook 创建。 |
| `syncStatus` | 可选 | EventService/Sync | EventService、PlanManagerHelpers、Sync | `createEvent(skipSync)` 会强制 `local-only`；Plan save 根据 `calendarIds` 决定 pending/local-only。 |
| `externalId` | 可选 | Sync | Sync | 用于远端实体 ID（Outlook/To Do）。 |
| `calendarIds` / `todoListIds` | 可选 | UI/Plan | UI、Plan save、Sync | **注意默认值注入**：PlanSlate/Plan save 常把 `calendarIds` 变成 `[]`，但 EventService 倾向保留 undefined 以避免误判变更。 |
| `syncedPlanCalendars` / `syncedActualCalendars` | 可选 | Sync | Sync | 多日历映射；仅 sync 写入。 |
| `syncedPlanEventId` / `syncedActualEventId` / `syncedOutlookEventId` | legacy | Sync | Sync | deprecated：应逐步迁移到多日历映射数组。 |

#### A3.5 Tree & Relations

| 字段 | 必要 | Owner | 允许写入 | 规则/备注 |
|---|---:|---|---|---|
| `parentEventId` | 可选 | EventTree/Plan | Plan reparent、EventService | ADR-001：结构真相来自 child.parentEventId。 |
| `childEventIds` | 可选 | legacy | 避免主路径写 | ADR-001/v2.22+：**不再自动维护**，也不得作为结构/正确性/排序真相。当前 PlanSlate/Plan save 仍可能对其做 **legacy 透传/序列化清理**（例如过滤 placeholder/空数组），但不应在主路径产生或更新“权威 child 列表”；应逐步收敛到仅依赖 `parentEventId`。 |
| `linkedEventIds` | 可选 | UI/Eventlog | EventService(从 eventlog) | 双向链接由 mention 推导；建议把“推导写回”移到显式 repair。 |
| `backlinks` | 只读 | Repair/Derived | Repair 工具 | 文档注明“自动计算”；不应在 UI/edit 主路径直接写。 |

> ⚠️ 类型缺口：代码里存在 `bulletLevel` 字段（PlanSlate metadata 持久化、排序/缩进用），但 `Event` 接口未声明。建议把它纳入 `Event` 明确定义，或者彻底收敛到 TreeEngine view 层。

#### A3.6 Plan/Task UI 字段

| 字段 | 必要 | Owner | 允许写入 | 规则/备注 |
|---|---:|---|---|---|
| `isTask` / `isPlan` | 可选 | Plan/Task | Plan save | Plan/Task 的根标识。**任何“虚拟时间/默认时间”逻辑都必须优先检查它们。** |
| `type` (`todo|task|event`) | 可选 | Plan/compat | Plan save | 用于兼容旧逻辑；不要单独依赖该字段判定时间规则。 |
| `checkType` / `checked` / `unchecked` | 可选 | Task/checkin | UI/Task | `checkType !== 'none'` 会被 normalizeEvent 用作 task-like 判定（避免 flags 丢失）。 |
| `priority` / `isCompleted` / `notes` / `emoji` / `color` / `mode` | 可选 | UI | UI | 不应由 normalizeEvent/Storage 强制写默认值。 |

#### A3.7 Internal / Debug / Migration

| 字段 | 必要 | Owner | 允许写入 | 规则/备注 |
|---|---:|---|---|---|
| `_isTempId` / `_originalTempId` | 可选 | EventService | EventService | 临时 ID 追踪与替换（EventHistory 相关）。 |
| `_isVirtualTime` | internal | EventService | EventService | 当前未在 `Event` 接口声明；仅内部/签名辅助，**不应持久化到 Storage**。 |

---

### A4. 关键写入点清单（哪里在“强制填充/改写字段”）

#### A4.1 EventService

- `normalizeEvent()`
  - title/eventlog/description/canonical 时间戳/虚拟时间标记
  - Plan/Task 虚拟时间 guard（已加）
- `createEvent()`
  - `createdAt/updatedAt` 兜底（优先保留调用方显式传入）
  - `syncStatus`: `skipSync ? 'local-only' : (event.syncStatus || 'pending')`
- `convertEventToStorageEvent()`
  - 生成 `eventlog.html/plainText`（当缺失字段且存在 `slateJson`）

#### A4.2 TimeHub

- `setEventTime()` / `setTimerWindow()`
  - 写 `startTime/endTime/isAllDay/updatedAt/timeSpec`，并额外写模糊字段（`isFuzzyDate/timeFieldState/isFuzzyTime/fuzzyTimeName`）。

#### A4.3 Plan 相关

- `src/utils/planManagerHelpers.ts` 的 `buildEventForSave()`
  - 强制设置：`isPlan=true/isTask=true/fourDNoteSource=true/source='local'`
  - `syncStatus` 由 `calendarIds.length` 决定（pending vs local-only）
  - `tags: updatedItem.tags || []`（会注入空数组，可能导致“误判变更”）

- `src/components/PlanSlate/serialization.ts`
  - 反序列化会注入默认值：例如 `syncStatus || 'local-only'`、`source || 'local'`、`calendarIds || []`
  - 这与 `normalizeEvent()` 的“仅当字段存在时才写数组”的策略相冲突，容易制造 diff。

#### A4.4 Sync

- `ActionBasedSyncManager`
  - Note 事件：通过 `description` 是否含 `📝 笔记由` 判定虚拟时间，并临时补 `endTime = start + 1h` 用于 Outlook create（**仅用于 outbound payload**，不得写回本地 Event、不得落盘）。
  - external-sync merge 时可能写 `createdAt/updatedAt/startTime/endTime/syncStatus`。

#### A4.5 Storage

- `IndexedDBService.updateEvent()`
  - 强制覆盖 `updatedAt = now`（建议整改）。

---

### A5. 与第 1 节一致的硬约束摘要

> 说明：本节是第 1 节（Hard Rules）的复述，便于架构文档/实现文档引用；若出现不一致，以第 1 节为准。

1) **Plan/Task 默认不显示时间**：除非用户明确设置；任何“虚拟时间”都必须排除 `isPlan/isTask/type/checkType` 的 task-like。
2) **写入 canonical，读取轻量**：重型转换（HTML/DOM）只允许在写入前规范化阶段发生。
3) **Storage 不改写业务字段**：尤其是 `updatedAt/startTime/endTime/syncStatus`。
4) **数组字段默认保留 undefined**：除非用户明确设置为空数组；避免无意义 diff（tags/calendarIds/attendees/checked/unchecked）。
5) **派生数据只写派生表**：Nodes/Stats/History 不反向污染 Event。

---

### A6. 后续行动清单（按收益排序）

- [ ] 修复 `IndexedDBService.updateEvent()`：仅在缺失 `updatedAt` 时兜底，不要强制覆盖。
- [ ] 收敛 PlanSlate/Plan save 的默认值注入：`calendarIds/tags/syncStatus/source` 尽量保留 undefined。
- [ ] 给 `Event` 接口补齐实际使用字段：至少 `bulletLevel`、`_isVirtualTime`（若继续存在），并标注 internal/derived。
- [ ] 把“签名/DOM 处理”从 EventService 核心路径拆到 adapter（与架构文档一致）。
