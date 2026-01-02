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
