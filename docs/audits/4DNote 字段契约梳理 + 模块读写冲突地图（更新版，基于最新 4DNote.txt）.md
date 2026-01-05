
# 4DNote 字段契约梳理 + 模块读写冲突地图（更新版，供 Copilot 参考）

> 基于你最新的 `4DNote.txt`（含“硬规则 + 按模块契约 + 附录写入审计”）重新审阅与更新。  
> 目标仍然是优先解决：**内部各模块之间的数据读写冲突**（Single Writer、禁止默认值注入、统一 resolver 口径、同步与存储边界清晰）。

---

## 0. Copilot 必须先读的“硬规则”（来自最新文档，已收敛）

1. **Canonical vs Derived 分离**  
   派生值只能用于排序/渲染/同步映射，**不得回写**污染 `Event` 存储（除非明确 repair 工具路径）。

2. **Plan/Task 时间允许为空**  
   `startTime/endTime/isAllDay` 在 Task/Plan 场景允许 `undefined`，禁止把 `createdAt` 等默认注入成“看起来有时间”。

3. **Storage 层不改写业务字段**  
   存储层必须被动持久化 canonical 数据，**不得覆盖** `updatedAt/startTime/endTime/syncStatus` 等。

4. **数组字段默认保留 `undefined`**  
   `tags/calendarIds/todoListIds/attendees/...` 等：除非用户明确设置为空数组，否则不要为了“方便”写成 `[]`（避免无意义 diff 与误判）。

---

## 1. 最新文档新增/补齐的关键点（相对我上版文档的差异）

### 1.1 “Resolver 口径声明”已制度化（很重要）
你现在明确要求：**每个页面必须声明并遵守一种 Time Anchor 口径**：
- strict-time：`timeSpec.resolved`（Upcoming）
- derived anchor：`resolveCalendarDateRange()`（TimeLog、Plan Snapshot 范围过滤）
- deadline：`dueDateTime`（Plan 过期/截止）

以及 Title 统一：
- UI：`resolveDisplayTitle(event)`
- Sync：`resolveSyncTitle(event)`  
两者都是只读派生，**不得回写** `event.title.*`。

✅ 这部分建议保持为“契约硬约束”，并在代码 review checklist 强制检查。

### 1.2 更精确的“写入链路事实”与风险点
你的附录把关键冲突源讲得更具体了（这对 Copilot 很关键）：
- `IndexedDBService.updateEvent()` **强制覆盖 `updatedAt=now`**（P0 必修）
- `PlanSlate/serialization.ts` 注入默认值：`syncStatus||'local-only'`、`source||'local'`、`calendarIds||[]`（P0）
- `planManagerHelpers.buildEventForSave()` 曾出现 `tags: updatedItem.tags || []`（P0）
- `normalizeEvent()` 当前会把 `isAllDay undefined -> false`（契约偏离，P0/P1）
- TimeCalendar 的“无时间 task 拖拽”语义：**只写 `endTime=23:59:59.999`**（需要明确其语义与 resolver 行为，P1）

---

## 2. 字段域（Field Domains）与 Owner 建议（更新为贴合你现在的文档口径）

> 你现在文档实际上已经把 Owner 与职责写得更清楚了。我这里把它“合并成 Copilot 可执行的授权表”。

### Domain A — UI 输入层（只表达用户意图，不补系统字段）
- 模块：PlanSlate / TimeCalendar / TimeLog / EventEditModal
- 允许写：用户显式输入的 `title/eventlog/tags/time selection/calendarIds/syncMode...`
- 禁止写：`createdAt/updatedAt` 默认注入、`syncStatus` 的推断注入、数组默认 `[]`

### Domain B — TimeHub（时间意图单一真相）
- Owner：TimeHub
- 允许写：
  - `timeSpec`
  - `startTime/endTime/isAllDay`（仅用户显式意图下）
  - `isFuzzyDate/timeFieldState/isFuzzyTime/fuzzyTimeName`（但**应补齐类型**，见 6.2）
- 禁止写：为 Plan/Task 注入默认时间（虚拟时间）

### Domain C — EventService.normalizeEvent（canonical 化入口）
- Owner：EventService
- 允许写：
  - title 结构化、eventlog canonical 化、description（同步/签名承载）的派生与签名
  - `createdAt/updatedAt` 的选择策略（遵守“优先显式传入/外部合并”）
  - `localVersion/lastLocalChange`（但要注意其副作用，见 4.4）
- 禁止写：把任何 resolver 的派生标题/派生时间回写到 event

### Domain D — Sync（ActionBasedSyncManager）
- Owner：Sync
- 允许写：
  - `externalId/syncStatus/synced*` 等外部映射字段
  - external-sync 合并回来的 `createdAt/updatedAt/startTime/endTime/isAllDay`（仅在 external-sync intent）
- 禁止写：
  - 把 `resolveSyncTitle` 写回 `event.title.*`
  - outbound payload 的“临时补 endTime=start+1h”写回本地（你文档已明确）

### Domain E — Storage（StorageManager/IndexedDB/SQLite）
- Owner：Storage
- **只允许**被动落库
- **明确禁止**：覆盖 `updatedAt`（P0）

---

## 3. 模块读写冲突地图（Conflict Map 审核，更新版）

> 这里把“冲突 → 证据（来自最新文档）→ 后果 → 修复建议”一次性写清。

### 3.1 P0：`IndexedDBService.updateEvent()` 覆盖 `updatedAt`
- **证据**：附录 A4.5 / A3 “⚠️ 风险点：Storage 层强制覆盖 updatedAt”
- **后果**
  - 破坏 external-sync 合并的远端 `updatedAt`
  - 把“无实质变更”变成“有变更”，引发 EventHistory/SyncQueue 噪音
- **修复（硬要求）**
  - Storage 层：仅当传入缺失 `updatedAt` 时兜底；否则保留传入值  
  - 并加测试：external-sync 写入指定 updatedAt 不应被覆盖

### 3.2 P0：PlanSlate `serialization.ts` 默认值注入（`source/syncStatus/calendarIds`）
- **证据**：附录 A4.3
- **后果**
  - `undefined ↔ []`/默认枚举互转，导致无意义 diff
  - `syncStatus` 被 UI “猜”出来，与 Sync/EventService 的逻辑冲突
- **修复建议**
  - 反序列化只做 shape-normalize（避免空指针），**不要**注入业务默认值
  - 需要默认值时，交给 create 入口或 normalize（并区分 intent）

### 3.3 P0：Plan 保存 `tags/calendarIds` 的 `[]` 注入风险
- **证据**：附录 A4.3 提到 `tags: updatedItem.tags || []`
- **后果**
  - tags diff 噪音；calendarIds 推断 syncStatus 的规则被误触发
- **修复建议**
  - buildEventForSave 严格遵守你文档已经写出的策略：除非用户明确清空，否则保持 `undefined`

### 3.4 P0/P1：`normalizeEvent()` 把 `isAllDay undefined -> false`
- **证据**：4.2.3 / A3 `isAllDay` 审计项
- **后果**
  - Task/Plan 的“无时间语义”被污染为“非全天”
  - 引发 update diff（尤其在多个入口互相打开/保存时）
- **修复建议**
  - 对 Task/Plan：`isAllDay` 允许 `undefined`，normalize 不得强制设为 `false`
  - 仅当字段存在或 `kind=calendar-event`（若你未来引入 kind）时才兜底

### 3.5 P1：EventEditModal 的 `syncStatus` 推断与 “Timer 强制 local-only”
- **证据**：4.6.5
- **后果**
  - `syncStatus` 同时被 UI、Plan、Sync 写入，且规则不一致
- **修复建议（不一定要加字段，但要加“写入意图”）**
  - UI 只写用户意图字段：`calendarIds/tags/syncMode/subEventConfig`
  - `syncStatus` 由 EventService/Sync 在同一处统一推断与写入
  - 如果暂时不能重构：至少在 update API 里传 `intent`（例如 `user_edit`），并限制 UI 不得覆盖 `syncStatus`（除非用户点了“启用同步/禁用同步”这种显式动作）

### 3.6 P1：TimeCalendar “无时间 task 拖拽只写 endTime=23:59:59.999” 的语义决策
- **证据**：4.6.3
- **冲突点**
  - Plan 的 deadline 真相是 `dueDateTime`；TimeLog anchor 用 `resolveCalendarDateRange`；TimeCalendar 又把 endTime 当“计划完成日”
- **你文档已提出检查项（4.6.?? 检查 3）**
  - 目前 `resolveCalendarDateRange` **不考虑** `dueDateTime`
- **建议把它提升为“明确决策（ADR）”**
  - 方案 A：保持现状：拖拽写 `endTime` 仅作为“计划完成日锚点”，并明确 resolver 的 end-only task 分支语义
  - 方案 B：把 `dueDateTime` 纳入 `resolveCalendarDateRange`（会改变 TimeLog/PlanSnapshot 行为，需要全局评估）
  - 方案 C：新增 `plannedEndDate`（仅 task）替代滥用 `endTime`（更干净但需要迁移）

### 3.7 P1：`localVersion` 与 `lastLocalChange` 的“必变更”副作用
- **证据**：A3 审计：normalizeEvent 会 `localVersion +1`、写 `lastLocalChange=now`
- **风险**
  - 若任何 patch 都导致它们变更，则会扩大“轻微写入→必然变更”的半径
- **建议**
  - 明确这两个字段是否属于：
    - “写入流水号”（允许每次 update 变）
    - 还是“实质变更才变”（应与 logUpdate 的判定对齐）
  - 并把它们在 EventHistory 的忽略字段与 Sync 决策中明确排除（避免放大）

---

## 4. 过滤/可见性冲突：你最新表格已经覆盖，但需要“再收敛一步”

你现在的字段表非常有价值（按模块列出纳入/排除），但 Copilot 还需要一个“强制入口”：

### 4.1 建议新增一个共享谓词层（避免两套 upcoming 过滤公式）
- **证据**：4.6.10 “同时存在两套 Upcoming 过滤公式”
- **建议**
  - 抽出 `planScopePredicate(event)` + `excludeSubordinate(event)` + `strictTimePredicate(event)` 等纯函数
  - 面板和 helper 必须复用同一套函数

---

## 5. 写入仲裁（为“模块冲突”提供最小工程落点）

你现在文档已经把“谁该写什么”写清楚了，但要真正减少冲突，需要最小的“写入意图/来源”传递。

### 5.1 建议所有写入 API 至少带这两个参数（Copilot 可直接加）
- `source`：`'plan'|'timehub'|'calendar'|'timelog'|'event-edit-modal'|'sync'|'repair'`
- `intent`：`'user_edit'|'user_clear'|'system_derive'|'external_sync'|'migration'`

### 5.2 最关键的两条仲裁规则（先落地）
1. **数组归一化**：除非 `intent=user_clear`，否则 `[]` 应归一化为 `undefined`
2. **写域校验**：Storage 永远不允许改写业务字段；UI 不允许写 `updatedAt/syncStatus`（除非显式动作）

---

## 6. 文档仍建议补齐/修订的点（你新增内容里也提到了）

### 6.1 类型缺口字段需要“契约化”
- **证据**：附录明确提到 `bulletLevel`、`_isVirtualTime` 等未在 `Event` interface 声明
- **建议**
  - 要么补齐到 `src/types.ts` 并标注 `internal/derived`
  - 要么彻底禁止持久化（尤其 `_isVirtualTime` 你文档已建议“不应持久化到 Storage”）

### 6.2 TimeHub 写入的 fuzzy 字段建议正式入类型
- **证据**：A3 `isFuzzyDate/timeFieldState/...` 通过 `(updated as any)` 写入
- **建议**
  - 补齐类型 + 标注 Owner=TimeHub + 禁止其他模块写

---

## 7. Signal（与你“Event 单实体 + Signal 松耦合”的方向一致）
你最新文档对 Signal 的定位已经很清晰：**一等实体**，不要拆成 `isXxx` 回写到 Event。建议保持：
- Signal 独立存储
- Event 可有 derived `signalSummary`（可选）
- EvidenceRefs 引用 signal `{ type:'signal', id }`

---

## 8. P0 行动清单（从最新文档对齐后的最终版）

1. 修复 `IndexedDBService.updateEvent()`：不再强制覆盖 `updatedAt`
2. 移除 PlanSlate `serialization.ts` 的默认值注入：`calendarIds||[]/syncStatus||.../source||...`
3. 修复/审计 Plan save 中 `tags/calendarIds` 的 `[]` 注入（确保只有 user_clear 才能写空数组）
4. 修复 `normalizeEvent()` 对 `isAllDay` 的默认注入（Task/Plan 保留 `undefined`）
5. 抽取并复用 Upcoming 过滤函数（消灭双公式漂移）

---

## 9. 给 Copilot 的实现提示（可直接转任务）
- 给 `EventHub.updateFields()` / `EventService.updateEvent()` 增加 `{ source, intent }`
- 在 normalize 阶段加 `normalizeArrays(patch, intent)` 与 `validateWriteDomain(source, patch)`
- 增加单测：
  - external-sync 写入 updatedAt 不被 storage 覆盖
  - 非 user_clear 时 `calendarIds: []` 会被归一化为 `undefined`
  - Task/Plan 的 `isAllDay` 可以是 `undefined` 且保存/重开不会变成 `false`

