# Field Contract Refactor Plan（可执行实施方案）v2.22

> 日期：2026-01-05  
> 目标：把“字段契约”从描述性文档升级为**可执行规范**：任何工程师仅依赖本文即可回答——字段是什么、谁写它、谁读它、何时更新、冲突时信谁、如何迁移与验收。
>
> 现状口径（必须一致）：请以 [docs/refactor/EVENT_FIELD_CONTRACT_EXECUTABLE.md](EVENT_FIELD_CONTRACT_EXECUTABLE.md) 为最终 contract（Single Source of Truth）。本文是**重构/落地计划**（how to implement），不是第二份 contract。

---

## 0. 范围与原则

### 0.1 In-Scope（本计划要解决什么）

P0（必须落地，直接降低冲突/噪音）：
- Storage 层越权改写：禁止覆盖 `updatedAt` 等业务字段。
- 默认值注入：数组字段 `undefined ↔ []` 循环、布尔 `undefined → false` 注入。
- 时间语义漂移：Task/Plan 允许无时间，禁止“虚拟时间注入”污染 canonical；页面必须声明时间 anchor。
- 写入边界：为写入链路引入最小的“写入来源/意图”参数，能阻止越权写。

P1（建议落地，提升一致性与可维护性）：
- 同步写入边界收敛：UI 只写 sync-intent（calendarIds/todoListIds/syncMode），syncStatus 由 Sync/Service 统一写。
- Upcoming/PlanScope 的过滤口径收敛为共享 predicate（消灭“双公式漂移”）。

P2（可选演进，取决于产品/技术债预算）：
- 分类字段收敛（减少 `isXxx` 混载）：新增最小枚举字段（见 2.2），逐步迁移 subordinate 判定。

### 0.2 Out-of-Scope（本计划明确不做）
- 不在本轮引入全新持久化实体/表结构大改（Signal 除外，另案实施）。
- 不进行大规模 UI/模块重写；本计划优先通过“写入口收敛 + normalize + 约束校验”降冲突。

### 0.3 Hard Rules（强约束，违反即 bug）

1) **Canonical vs Derived 分离**：派生值可用于显示/排序/同步映射，**不得回写**污染 `Event` 存储（除非 repair/migration 工具路径）。
2) **Single Writer（字段域所有权）**：每个字段域只有一个 Owner；其他模块要修改必须通过 Owner 提供的 API 或携带明确 intent 并通过校验。
3) **默认值策略统一**：
   - 数组字段默认保留 `undefined`，只有 `intent=user_clear` 才允许写 `[]`。
   - 布尔字段（如 `isAllDay`）允许 `undefined` 表达“不适用/未设置”，不得在 normalize 阶段强行注入 `false`。
4) **Storage 被动持久化**：Storage 层无权改写业务字段（尤其 `updatedAt/startTime/endTime/syncStatus`）。

---

## 1. 现状痛点（来自 audits 的可证据化问题）

> 这些不是“PRD 抱怨”，而是工程可复现的冲突源；修复必须带验收用例。

- P0：Storage 覆盖 `updatedAt` 导致 external-sync 的时间戳丢失 + EventHistory/SyncQueue 噪音。
- P0：数组字段 `tags/calendarIds/todoListIds` 被多个入口默认写成 `[]`，触发 `undefined ↔ []` 互转 diff。
- P0：`normalizeEvent()` 把 `isAllDay undefined -> false`，污染无时间 task/plan。
- P0：时间语义漂移（`endTime` 在不同模块被当作“结束/计划完成落位”），导致跨页面 anchor 不一致。
- P1：Upcoming 存在双过滤公式（面板 vs helper），修 bug 时易只改一处。

---

## 2. 目标数据模型（最小最优：贴合现有 app，不做过度设计）

### 2.1 Entity Overview（一页读懂）

- **Event（唯一主实体）**：用户可编辑的事件/任务/笔记都归一在 Event；其字段分为 Core/Sync/Derived/UI-only 四层（见 3.1）。
- **EventHistory（审计/回放）**：只读派生索引，不能反向驱动业务写入。
- **Signal（建议独立实体）**：系统轨迹/证据/重点信号不再用 `isXxx` 模拟；Event 仅可通过引用/摘要关联。

### 2.2 分类字段收敛（可选但推荐的“最小新增字段”）

> 为什么这是“最优方案”：目前大量 `isXxx` 同时承担“来源 + 过滤”语义，导致可见性漂移；新增 1~2 个枚举字段可以显著降低 if-else 堆叠，同时不要求一次性删掉旧字段。

建议新增（P2，可分阶段上线）：
- `recordClass?: 'user' | 'system'`：是否系统轨迹/系统生成（subordinate）。
- `kind?: 'note' | 'event' | 'task'`：主分类（用于 UI 真值表与过滤统一）。

迁移策略：先写新字段但仍兼容旧字段读；旧字段逐步降权为 derived/legacy。

---

## 3. 字段分层与 Owner（Single Writer 规则）

### 3.1 Field Layers（必须明确）

- **Core（业务真相）**：用户意图与业务事实（可同步、可过滤、不可随意改写）。
- **Derived（可丢弃）**：可从 Core 计算重建（索引、展示摘要、虚拟标记）。
- **Sync（外部镜像/状态）**：外部系统映射与同步状态。
- **UI-only（临时态）**：仅存在于前端 state，严禁落库。

### 3.2 Owner Map（字段域 → 唯一写入方）

| Domain | 语义（一句话） | 字段范围（示例） | Owner（唯一写入方） | 非 Owner 写入规则 |
|---|---|---|---|
| Content | 事件内容真相（标题/正文/同步描述），由服务层 canonical 化 | `title.*`, `eventlog`, `description` | `EventService.normalizeEvent`（UI 提供输入） | 禁止回写 resolver 派生标题；UI 不维护两套正文 |
| Time | 日程发生区间与时间意图（calendar block），允许为空 | `timeSpec`, `startTime/endTime/isAllDay` | `TimeHub`（意图单一真相）+（创建入口例外） | 除创建入口/外部合并外，其他模块不得直接改时间 |
| Task/Plan | 任务/计划语义真相（可打钩/截止/完成），与 calendar block 解耦 | `isTask/isPlan/checkType/checked/unchecked/dueDateTime` | Plan/Task 入口 + `EventService`（checkin） | UI 不得“缺时间自动 isTask=true”注入 |
| Sync | 外部镜像与同步状态（Outlook/To Do 映射） | `syncStatus/externalId/synced*` | `ActionBasedSyncManager` | UI 仅写 intent（calendarIds/todoListIds/syncMode） |
| Meta | 系统元数据（创建/更新时间、来源），影响冲突仲裁 | `createdAt/updatedAt/source` | `EventService` + Sync external merge | Storage 不得覆盖；UI 不得默认注入 |
| Storage | 被动落库与查询，不拥有业务语义 | `StorageManager/IndexedDB/SQLite` | `StorageManager/IndexedDB/SQLite` | 只做被动存取，不改业务字段 |

---

## 4. 写入仲裁机制（最小落地方案）

> 目的：不大改架构也能立刻减少冲突。核心是：**每次写入必须携带 source + intent**，并在服务层做“可写字段白名单 + patch normalize”。

### 4.1 API 形态（建议落到 EventHub / EventService）

对外写入（所有页面统一）：
- `EventHub.updateFields(eventId, patch, meta)`
- `EventHub.createEvent(event, meta)`

其中 `meta` 至少包含：
- `writer`: `'plan'|'timehub'|'calendar'|'timelog'|'event-edit-modal'|'sync'|'repair'`
- `intent`: `'user_edit'|'user_clear'|'system_derive'|'external_sync'|'migration'`
- `source`: string（用于 EventHistory 与诊断，必须稳定）

### 4.2 Patch Normalize（统一入口做，避免各处自实现）

规则（必须与 [docs/refactor/EVENT_FIELD_CONTRACT.md](EVENT_FIELD_CONTRACT.md) 一致）：
- **arrays**：若 `intent !== 'user_clear'`，则把空数组 `[]` 归一化为 `undefined`（仅限约定字段集合）。
- **booleans**：`isAllDay` 等允许 `undefined`；normalize 阶段不得注入 `false`。
- **time**：禁止对 task/plan 注入虚拟时间；TimeLog/Timeline 的 anchor 只能派生计算，不回写。

### 4.3 Write Domain Validation（越权即拒绝/告警）

最小实现：在 `EventService.updateEvent()` 中针对 patch 字段做白名单校验：
- `writer='storage'`：禁止写任何业务字段（只允许内部存储 API）。
- `writer='ui'`（plan/calendar/timelog/event-edit-modal）：禁止写 `updatedAt/syncStatus/externalId/synced*`。
- `writer='sync'`：禁止写 `title.*`（除非明确 external 字段映射且不回写）；禁止写派生字段。

策略选择（最优实践）：
- 开发期：`console.warn + telemetry`（先观测）
- 稳定后：`throw`（门禁）

---

## 5. 时间语义与页面 Anchor 的“决策记录”（必须写清，否则会持续漂移）

### 5.1 三类时间语义（只允许这三种口径）

1) **发生区间（calendar block）**：`startTime/endTime/isAllDay`
2) **截止（deadline）**：`dueDateTime`
3) **页面 anchor（派生、只读）**：
   - strict-time：`timeSpec.resolved`
   - derived anchor：`resolveCalendarDateRange(event)`

### 5.2 争议点：无时间 task 拖拽只写 `endTime=23:59:59.999`

这是当前代码事实，但语义需要“契约化”。给出三种方案并选型：

- 方案 A（最小改动，推荐短期）：
  - 继续允许 `isTask && !startTime && endTime` 表示“计划完成日锚点”。
  - Contract 明确：该 endTime **不是** calendar block 的结束；Sync Router 不得因此把它当 calendar event 推送。
  - TimeResolver 的 end-only 分支必须稳定（文档+测试）。

- 方案 B（改变 resolver 口径，风险中等）：
  - 扩展 `resolveCalendarDateRange` 把 `dueDateTime` 纳入 anchor（会影响 TimeLog/PlanSnapshot 落位，需要全局回归）。

- 方案 C（语义最干净，但需要迁移字段）：
  - 新增 `planAnchorDate/plannedAt`（task 专用），彻底避免污染 `endTime`。
  - Sync 处理必须明确（否则会引入新的跨端不一致）：
    - Outbound（Local → Remote）：
      - `plannedAt` **不参与** `syncRouter` 的路由判定（路由仍只看 `isTask` 与 `startTime && endTime`）。
      - 同步到 Outlook Calendar：不发送 `plannedAt`（Calendar 只认 `start/end/isAllDay`）。
      - 同步到 Microsoft To Do：默认 **不映射** `plannedAt` 到 `dueDateTime`（To Do 的 dueDateTime 是截止语义，映射会把“计划”误当“截止”）。
        - To Do 的 due date 只能来自 `dueDateTime`（deadline 真相字段）。
        - 若产品强烈要求“把 plannedAt 同步过去”，只能作为显式 feature 决策：例如写入 To Do body 的签名元数据或使用 Graph 的其他字段（需要单独 ADR + 回归），本计划默认不做。
    - Inbound（Remote → Local）：
      - 远端回流更新不写 `plannedAt`（白名单禁止 external_sync intent 修改此字段）。
      - 若该 task 是远端新建（首次 sync-in），`plannedAt` 缺失则保持 `undefined`，由用户在本地安排计划日。
    - 冲突策略（Conflict Resolution）：
      - `plannedAt` 的冲突只可能发生在“多端 4DNote 之间的本地编辑”场景；在仅依赖 Outlook/To Do 的外部同步模型下，远端不会提供该字段，因此默认采用 **本地最后编辑胜出**（由本地 storage/versioning 管控）。
  - 迁移策略（从 legacy 的 end-only task 落位迁移，避免破坏已有 To Do due 语义）：
    - 仅对满足以下特征的事件迁移：`isTask && !startTime && endTime` 且 `dueDateTime` 为空，且 `endTime` 命中“计划落位时间”模式（例如当天 23:59:59.999，由 TimeCalendar 拖拽产生）。
    - 迁移动作：
      - `plannedAt = endTime`（或仅保留日期部分，按你们的时间存储格式定义）
      - `endTime = undefined`（避免继续污染 `endTime` 的语义，并避免 To Do 同步把它当 dueDateTime）
    - 对不满足该模式的 `endTime`：保持不迁移（因为它可能代表真实 end 或历史上被当作 due 的遗留值）。

**默认选型（建议）**：先落地方案 A（最小改动 + 可测 + 立刻降冲突），并在 P2 评估是否切换到 C。

---

## 5.3 Field Cards（本计划新增/争议字段必须先定义含义）

> 你指出的问题很关键：如果没有 Field Card，团队无法达成稳定心智模型。
> 本节把“plannedAt 到底是什么”写成可执行规范；后续新增字段也必须照此格式补齐。

### Field Card：`plannedAt`（Task 计划落位时间）

- 字段名：`plannedAt`
- 类型：`string | undefined`（存储格式与现有 time storage 一致：`YYYY-MM-DD HH:mm:ss`，允许只表达日期时固定为当天 `23:59:59.999` 或统一归一到 `00:00:00`，二者必须在实现中选一并测试）
- 层级：Core（任务规划真相；但不参与外部 sync 语义）
- 语义（一句话）：**任务/计划在 4DNote 内部“计划在哪一天做”的落位锚点**，不是截止（deadline），也不是日历事件发生区间。
- 适用对象：仅 `isTask===true` 的事件（必要时也允许 `isPlan===true` 的计划项，但必须在写入入口显式声明）
- Owner/Writer（唯一写入方）：Plan/Task 入口（PlanManager / TimeCalendar 的“拖拽落位”动作）通过统一写入链路（建议走 `EventHub.updateFields(..., { writer, intent })`）
- Readers（消费方）：
  - TimeCalendar（任务在日历上的“计划日”显示/落位，仅当任务无 `startTime` 时）
  - TimeLog/PlanSnapshot 的 derived anchor（若未来从方案 A 迁移到方案 C）
- 写入时机：
  - 用户显式“规划/拖拽到某一天”时写入
  - 用户清空计划日时（显式动作）清空该字段
- 默认值策略：`undefined`（没有计划日就不写；禁止系统自动注入）
- 不变量（Invariants）：
  - 若 `plannedAt` 存在，则该事件必须是 task-like（`isTask===true`），否则属于非法状态（应告警/修复）。
  - `plannedAt` 存在 **不等价于** `dueDateTime` 存在；两者可以同时存在，但语义不同。
  - `plannedAt` 不应触发 `syncRouter` 把事件当 calendar event（是否同步仍只看 `isTask`、`startTime && endTime`）。
- 冲突策略（Conflict Resolution）：
  - `external_sync` 意图下，远端回流禁止写入 `plannedAt`（白名单拒绝），因此远端不会覆盖本地计划日。
  - 本地多入口同时编辑时，以 `updatedAt`/localVersion 的既有仲裁为准（本计划 Phase 0 会修复 Storage 覆盖 updatedAt，确保仲裁可信）。
- 同步策略（Sync）：
  - Outbound：不映射到 Outlook Calendar；不映射到 To Do 的 `dueDateTime`（避免把计划误当截止）。
  - Inbound：不从远端生成/更新 `plannedAt`。
- 兼容与迁移（Deprecation/Migration）：
  - legacy：`isTask && !startTime && endTime` 被用作“计划落位”。
  - 迁移（可选）：将符合“计划落位模式”的 `endTime` 转写到 `plannedAt` 后清空 `endTime`，避免 To Do 同步把 endTime 当 due。

### Field Card：`dueDateTime`（Task 截止时间）

- 语义（一句话）：任务的截止时间（deadline），用于过期/提醒/同步到 To Do。
- 与 `plannedAt` 的关系：`dueDateTime` 是“必须完成的时间点”；`plannedAt` 是“计划哪天做”。允许二者同时存在。
- 同步策略（Sync）：To Do 的 `dueDateTime` 只能映射自本字段（或明确的 external_sync 回流）。

---

## 6. 分阶段实施（按收益排序，可直接拆任务）

### Phase 0（P0，本周内，必须做）

1) 修复 Storage 覆盖 `updatedAt`
- 修改点：`IndexedDBService.updateEvent()`（或等价存储写入口）
- 规则：仅当传入缺失 `updatedAt` 时兜底；否则保留传入值。
- 验收：external-sync 写入指定 updatedAt 不被覆盖；无实质变更不应产生额外 history 噪音。

2) 数组字段默认值注入治理
- 修改点：所有 create/save 入口（Plan/TimeCalendar/serialization/EventEditModal）
- 规则：除 `intent=user_clear` 外，禁止写 `[]`；统一归一化为 `undefined`。
- 验收：`undefined ↔ []` 不再触发无意义 diff。

3) `isAllDay` 默认注入修复
- 修改点：`EventService.normalizeEvent()`
- 规则：保留 `undefined`；仅对明确 calendar 事件或字段存在时保留布尔。
- 验收：Task/Plan 重开编辑不再被写成 `false`。

4) 写入元数据最小落地（source/intent/writer）
- 修改点：`EventHub.updateFields/createEvent` 与 `EventService.updateEvent/createEvent`
- 规则：没有 meta 的旧调用先提供默认值（兼容期），但新增调用必须显式传。
- 验收：日志可观测；越权写有告警。

### Phase 1（P1，两周内）

5) SyncStatus 写入边界收敛
- UI 仅写 intent 字段：`calendarIds/todoListIds/syncMode`；
- `syncStatus` 由 Sync/Service 统一推断/写入。

6) 过滤口径收敛
- 提取共享 predicate：
  - `isSubordinate(event)`
  - `shouldShowInPlanScope(event)`
  - `strictTimePredicate(event)`
- Upcoming 面板与 helper 必须复用同一实现。

### Phase 2（P2，持续演进）

7) 分类字段收敛（可选）
- 新增 `recordClass/kind`，迁移 subordinate 判定从 `isTimer/isOutsideApp/isTimeLog` 转移。

8) 类型补齐与 internal/derived 字段契约化
- `bulletLevel/_isVirtualTime/isFuzzy*` 等应在类型层明确：是否持久化、owner、写入边界。

---

## 7. 测试与验收（必须可自动化/可复现）

### 7.1 必须新增/补齐的测试用例

- Storage 不覆盖 updatedAt：
  - 写入 patch 含 `updatedAt=固定值`，落库后仍为固定值。
- 数组归一化：
  - 非 `user_clear`：`calendarIds: []` → normalize 后为 `undefined`。
  - `user_clear`：`calendarIds: []` 保留为空数组。
- isAllDay 不注入：
  - task/plan 未设置 isAllDay，保存/重开仍为 `undefined`。
- 时间注入禁令：
  - `isTask=true` 且无时间，不得被 normalize 注入 `startTime`。

### 7.2 验收清单（PR 合并门禁建议）

- 新增字段必须补齐：Field Card（见附录 A）+ Owner + Conflict Policy + Migration。
- 新增写入口必须提供 `writer/intent/source`。
- 任何页面必须声明其 Time Anchor（strict/derived/deadline）并复用共享 predicate。

---

## 附录 A：Field Card 模板（强制格式）

> 新增/重构字段必须填写此卡片（放到 [docs/refactor/EVENT_FIELD_CONTRACT.md](EVENT_FIELD_CONTRACT.md) 里对应字段章节）。

- 字段名：
- 类型：
- 层级：Core / Derived / Sync / UI-only
- 语义（一句话）：
- 适用对象：
- Owner/Writer（唯一写入方）：
- Readers（消费方）：
- 写入时机：
- 默认值策略：
- 不变量（Invariants）：
- 冲突策略（Conflict Resolution）：
- 兼容与迁移（Deprecation/Migration）：

---

## 附录 B：关键字段卡片（建议优先补齐的 8 个）

> 这些字段是目前冲突最集中的地方，建议先把卡片补齐并绑定测试。

- `updatedAt`
- `tags`
- `calendarIds`
- `todoListIds`
- `startTime/endTime/isAllDay`
- `timeSpec`
- `dueDateTime`
- `syncStatus/syncMode/externalId`
