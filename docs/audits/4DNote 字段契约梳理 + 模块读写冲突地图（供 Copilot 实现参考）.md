
# 4DNote 字段契约梳理 + 模块读写冲突地图（供 Copilot 实现参考）

> 范围：基于 `4DNote.txt`（仓库字段契约与写入审计）整理。目标是**先解决内部模块之间的数据读写冲突**：明确字段所有权（Single Writer）、禁止默认值注入、统一时间/标题/同步的写入边界与仲裁规则。  
> 模型前提：实体只有一个 `Event`；`Signal` 独立松耦合（建议独立存储，仅做引用/摘要）。

---

## 0. 一页结论（先给 Copilot 的执行要点）

### 0.1 当前冲突的“主因”分类（P0）
1. **默认值注入与 canonical 契约冲突**
   - 数组字段 `tags/calendarIds/todoListIds` 被多个入口写成 `[]`，与“默认保留 `undefined`”硬约束冲突，造成无意义 diff、EventHistory 噪音、同步/过滤误判。
2. **时间语义复用造成跨模块语义漂移**
   - `endTime` 在不同场景既被当“事件结束”又被当“计划完成/拖拽落位时间”；而 `dueDateTime` 又是 deadline。TimeResolver/Upcoming/TimeLog 各自用不同 anchor，导致同一事件在不同模块落位不一致。
3. **字段写入权不收敛，造成互相覆盖**
   - Storage 层强制覆盖 `updatedAt`；UI/序列化层写 `syncStatus/source/calendarIds` 默认值；EventService/TimeHub/Sync 都会触碰时间与更新时间，导致“谁才是最终真相”不明确。
4. **“分类字段”语义混载**
   - `isTimer` 等字段既表达“模块来源”又用于 subordinate（系统轨迹）过滤，导致可见性漂移。

### 0.2 三个最高优先级整改（建议先做）
- **P0-1：修复 Storage 覆盖 `updatedAt`**
  - `IndexedDBService.updateEvent()` 仅在缺失 `updatedAt` 时兜底，禁止强制覆盖。
- **P0-2：统一数组字段的 `undefined` 规则（并在写入口强制）**
  - 任一写入口（PlanSlate 序列化/TimeCalendar 创建/Plan save）禁止 `tags/calendarIds/todoListIds` 默认写 `[]`；除非用户显式清空。
- **P0-3：建立“字段 Owner + 写入仲裁”最小机制**
  - 最小化落地：在 `EventHub.updateFields` 或 `EventService.updateEvent` 增加 `writer`/`intent` 标记与校验（不必一次性重构全架构，但要能阻止越权写）。

---

## 1. 推荐的字段架构（单 Event 模型下的“域分治”）

> 目的：把“同一 Event 上太多字段被不同模块写”变成可治理的结构：每个字段域一个 Owner，其他模块只能通过 Owner 提供的命令/函数间接修改。

### 1.1 Field Domains（建议）
| Domain | 内容 | Owner（唯一写入方） | 其他模块权限 |
|---|---|---|---|
| A Identity & Classification | `id`, `deletedAt`,（建议新增）`kind`, `recordClass`, `origin` | `EventService`（create/update 入口） | 只读；通过 `create/update` 写入 |
| B Content | `title.*`, `eventlog`, `description`（同步用/派生） | `EventService.normalizeEvent` + `EventEditModal`（输入） | 只读；禁止各页面自行回写派生内容 |
| C Time Intent & Fields | `startTime/endTime/isAllDay/timeSpec` + fuzzy 字段 | `TimeHub`（意图单一真相） | 只读；TimeCalendar 作为创建入口可写初值；Sync external merge 可写 |
| D Task/Plan Semantics | `isTask/isPlan/checkType/checked/unchecked/isCompleted/dueDateTime/isDeadline` | `PlanManager/Task入口` + `EventService`（checkin 等） | 只读；禁止 EventEditModal “缺时间就强行 isTask=true” 这类注入 |
| E Sync | `syncMode/syncStatus/externalId/calendarIds/todoListIds/synced*` | `ActionBasedSyncManager` +（部分用户意图字段由 UI 写） | UI 仅可写“用户意图”（如选择 calendarIds）；状态/外部映射仅 Sync 写 |
| F Structure | `parentEventId`（真相）/ `position`（展示）/ `childEventIds`（legacy） | `Plan/EventTree` | `childEventIds` 只读或 repair；禁止当真相 |
| G System Trajectory（subordinate） | `isTimer/isTimeLog/isOutsideApp`（现状） | **建议迁移到** Telemetry/Signal（见 6） | 短期保留但必须语义单一，不得混载 |
| H Derived/Index (不可回写) | `_isDeleted/_deletedAt/_isVirtualTime/bulletLevel?` 等 | Derived/Repair 工具 | **禁止**主路径回写 |

---

## 2. 模块读写冲突地图（Conflict Map）

> 说明：以下按字段组列出“谁在写、写了什么、冲突点与后果、建议 Owner/仲裁”。

### 2.1 `updatedAt`（P0 级冲突）
- **写入点（文档事实）**
  - `EventService.updateEvent()`：仅在 `logUpdate` 判定有实质变更时才更新 `updatedAt`
  - `TimeHub.setEventTime()`：会写 `updatedAt`
  - `Sync(external merge)`：可能写 `updatedAt`（远端 lastModified）
  - **`IndexedDBService.updateEvent()`：强制覆盖 `updatedAt = now`（高风险）**
- **冲突后果**
  - 外部同步写入的远端 `updatedAt` 被本地覆盖 → 同步冲突与回放不可信
  - “无实质变更”也会在存储层变成“有变更” → EventHistory/SyncQueue 噪音
- **建议**
  1. Storage 层：只在缺失 `updatedAt` 时兜底，不得覆盖。
  2. 仲裁：`updatedAt` 的最终权威应在 `EventService.normalizeEvent()`；写入层（Storage）无权更改。

### 2.2 数组字段 `tags/calendarIds/todoListIds`（P0 级冲突）
- **写入点（文档事实）**
  - Plan `buildEventForSave()`：曾出现 `tags: updatedItem.tags || []`（注入空数组风险）
  - PlanSlate `serialization.ts`：反序列化注入 `calendarIds || []`
  - TimeCalendar 创建：`tags: []`, `calendarIds: []`（默认注入）
  - EventService / History：专门处理 `undefined ↔ []` 作为噪音来源
- **冲突后果**
  - 无意义 diff：`undefined ↔ []` 互转触发 update/history
  - 过滤误判：某些逻辑把 `[]` 当作“用户已清空/已选择为空”而不是“未设置”
  - SyncStatus 推断偏移（例如 “有无 calendarIds 决定 pending/local-only”）
- **建议**
  - **硬规则统一**：除非用户明确“清空”，否则写入必须保留 `undefined`。
  - 落地策略：
    - 在 `EventService.normalizeEvent()` 或 `EventHub.updateFields()` 加 `normalizeArrays()`：将 `[]` 归一化为 `undefined`（仅对“非用户清空”来源）。
    - 对“用户清空”的 UI 操作：必须显式携带 `intent=user_clear`，允许写 `[]`。

### 2.3 时间字段 `startTime/endTime/isAllDay/timeSpec`（P0 级冲突：语义漂移）
- **写入点（文档事实）**
  - Plan 保存：从 `TimeHub.getSnapshot(id)` 覆盖 `start/end/timeSpec`
  - TimeCalendar 创建/拖拽：写 `startTime/endTime/isAllDay`；且存在“无时间 task 拖拽只写 `endTime=23:59:59.999`”
  - TimeLog 创建 note：多数无时间；TimeGap 可写 `startTime` 锚点
  - Sync outbound：可能临时补 `endTime = start + 1h`（仅 payload，不得回写）
- **冲突后果**
  - `endTime` 双重语义：Calendar 事件结束 vs task 的“计划完成时间” → 过滤与展示混乱
  - 不同页面 anchor 不一致：
    - Upcoming 用 `timeSpec.resolved`（严格）
    - TimeLog/Plan Snapshot 用 `resolveCalendarDateRange`（派生）
    - Deadline 用 `dueDateTime`
- **建议**
  1. **定义并固化三类时间语义（文档化 + 单测）**
     - `startTime/endTime`：发生区间（calendar block）
     - `dueDateTime`：截止（deadline）
     - “task 拖拽落位”若要表达“计划完成日”，应明确为：
       - 方案 A：继续写 `endTime`，但必须在 contract 写清：当 `isTask && !startTime && endTime` 表示“计划完成日锚点”，且不得当作 calendar block 同步；
       - 方案 B（更干净）：新增 `plannedAt` 或 `planAnchorDate`（仅 task），避免污染 `endTime`。
  2. **写入权归属**
     - `timeSpec` 仅 `TimeHub` 写（文档也已建议补齐类型）
     - TimeCalendar 可作为创建入口写 `start/end/isAllDay` 初值，但后续变更应通过 TimeHub（或至少同一套入口）以避免多处写。
  3. **页面声明 Time Anchor 口径（你文档已有检查项，建议提升为强制规范）**

### 2.4 `isAllDay` 默认注入（P0/P1）
- **事实**：审计发现 `normalizeEvent()` 会把 `undefined` 变成 `false`（契约偏离）
- **后果**：Plan/Task 无时间语义被污染为“非全天” → 触发 diff、影响展示逻辑
- **建议**
  - `isAllDay` 对 Task/Plan 允许 `undefined`，不得 normalize 成 `false`
  - 仅在字段存在时写入；或仅对 calendar 类事件兜底

### 2.5 `syncStatus` 的多方写入（P1）
- **写入点**
  - `EventService.createEvent(skipSync)`：可能强制 `local-only`
  - Plan save：根据 `calendarIds.length` 决定 pending/local-only
  - EventEditModal：根据 tags/calendarIds/timer 状态决定 pending/local-only
  - TimeCalendar 创建：默认写 `local-only`
- **冲突后果**
  - “同一事件是否可同步”被多个模块以不同规则推断
  - 默认值注入（`local-only`）使 Sync Router 诊断困难：到底用户选择了不同步，还是系统默认？
- **建议**
  - 把 `syncStatus` 拆成两层语义（至少在规则上拆开）：
    - `syncIntent`（用户意图：是否选择同步/选择哪些目标）
    - `syncStatus`（系统状态：pending/synced/error）
  - 若不想加字段：至少规定 **UI 只能写 intent（calendarIds/todoListIds/syncMode）**，`syncStatus` 由 Sync/服务层统一计算与写入。

### 2.6 `source` vs `fourDNoteSource`（P1 冗余与漂移）
- **事实**：文档承认冗余且共存；`fourDNoteSource` 被历史逻辑广泛使用且在 history diff 中被忽略
- **风险**
  - 两字段不一致会造成筛选/签名/同步识别分裂
- **建议**
  - 以 `source` 为主逐步迁移；提供兼容函数 `isLocalCreated(event)`（读两者）
  - 明确“谁写”：`normalizeEvent`/Sync 从签名提取；UI 不要随意写

### 2.7 “模块来源 flags” 与 subordinate 混载（P1->P0 视影响）
- **事实**：你文档已指出 `isTimer` 是交叉字段：既是模块来源，又被 `isSubordinateEvent` 用来默认隐藏
- **后果**
  - A 模块可见、B 模块不可见（语义漂移）
- **建议**
  - 最小化方案：引入 `recordClass: 'user'|'system'`（或 `systemRecordType`）专门表示 subordinate；`isTimer` 只剩“模块来源”或直接废弃
  - 同时把 `EventService.isSubordinateEvent` 的判定迁移到新字段上

---

## 3. “字段 Owner / 写入许可”建议表（可直接落到 Contract）

> 目标：模块冲突本质是“多写”。此表定义**唯一写入方**与允许写入的入口。

| 字段/组 | Owner（唯一写入方） | 允许写入 | 禁止写入（典型违规） |
|---|---|---|---|
| `title.*` | `EventService.normalizeTitle`（由 UI 提供输入） | EventEditModal、PlanSlate（输入），EventService（规范化） | 任意页面为显示效果回写 title；Sync 回写派生标题 |
| `eventlog` | `EventService` | UI（编辑）、EventService（canonical化） | Storage/派生层 |
| `description` | `EventService`（派生/签名/同步承载） | EventService、Sync merge（external） | UI/Feature 直接维护 description 与 eventlog 两套 |
| `startTime/endTime/isAllDay/timeSpec` | `TimeHub`（意图单一真相） | TimeHub；TimeCalendar 创建可写初值；Sync external 可写 | Plan/serialization 注入默认时间；Storage 改写 |
| `isTask/isPlan/type/checkType` | Plan/Task入口 + EventService（checkin） | Plan save、checkin API | EventEditModal 缺时间自动 isTask=true（应被限制或改为显式用户动作） |
| `tags/calendarIds/todoListIds` | UI（用户意图）+ EventService（normalize） | 显式用户操作 | 任何入口为了“方便”默认写 `[]` |
| `syncStatus/externalId/synced*` | Sync | ActionBasedSyncManager | UI/serialization 默认写入状态 |
| `createdAt` | EventService（create）+ Sync(external) | create、external merge | Storage 覆盖 |
| `updatedAt` | EventService（update）+ Sync(external) + TimeHub（时间变更） | normalize/update | Storage 强制覆盖 |

---

## 4. 冲突仲裁规则（写在 Contract 顶部，供 Copilot 编码）

### 4.1 写入必须携带 `source`（已在 EventHistory 里有 `source`，建议复用到写入）
建议在更新 API 里引入：
- `writer`: `'plan'|'timehub'|'calendar'|'timelog'|'eventEditModal'|'sync'|'storage'|'repair'`
- `intent`: `'user_edit'|'user_clear'|'system_derive'|'external_sync'|'migration'`

### 4.2 仲裁优先级（建议默认）
1. `intent=external_sync` 仅可写 Sync 域 + 远端真相字段（按明确白名单）
2. `intent=user_edit` 覆盖 `intent=system_derive`
3. `intent=user_clear` 允许写空数组 `[]`，否则数组空值应归一化为 `undefined`
4. `storage` 永远不允许改写业务字段（违反即 bug）

---

## 5. 具体可执行整改清单（按收益排序）

### P0（强烈建议本周内）
1. **修复 `IndexedDBService.updateEvent()` 覆盖 `updatedAt`**
   - 仅在 `updatedAt` 缺失时兜底；否则保留传入值
2. **移除/禁止 PlanSlate 序列化默认值注入**
   - `calendarIds || []`、`source || 'local'`、`syncStatus || 'local-only'` 这类逻辑必须收敛到“创建入口”或 normalize，并区分 intent
3. **统一数组字段 `undefined` 策略**
   - 在 `normalizeEvent()` 加 `normalizeArrayField(field, { intent })`，避免 `undefined ↔ []` 循环
4. **修复 `normalizeEvent()` 对 `isAllDay` 的默认注入**
   - 保留 `undefined`（对 task/plan）；仅对 calendar 事件兜底

### P1（两周内）
5. **把 `syncStatus` 的写入边界收敛**
   - UI 只写 `calendarIds/todoListIds/syncMode`；`syncStatus` 由 Sync/Service 统一更新
6. **时间语义决策：处理“无时间 task 拖拽写 endTime”**
   - 明确写入语义并写入 contract；必要时引入新字段避免污染 `endTime`
7. **引入 `recordClass/systemRecordType`，迁移 subordinate 判定**
   - `EventService.isSubordinateEvent` 改看新字段；`isTimer/isTimeLog/isOutsideApp` 去语义混载

### P2（持续演进）
8. **补齐类型缺口字段（如 `bulletLevel`, `_isVirtualTime`）并标注 internal/derived**
9. **将“推导写回”（linkedEventIds/backlinks 等）迁移到 repair 工具路径**

---

## 6. Signal 的落地建议（与你当前“Event + Signal 松耦合”一致）

### 6.1 存储原则
- Signal 独立表/集合：`signal_id, signal_type, event_id, created_at, audio_offset_ms?, image_id?, metadata?`
- Event 侧：
  - 可选 `signalSummary`（Derived，用于快速过滤/徽标）
  - 或在读取层 join（不回写拆散成 `isXxx`）

### 6.2 禁止事项
- 禁止用 `isTimer/isOutsideApp/isTimeLog` 去模拟 signal（你文档也明确了语义不同）

---

## 7. Copilot 实施提示（建议直接生成的代码/检查点）

### 7.1 最小化“写入审计”实现（不重构也能降冲突）
- 在 `EventHub.updateFields()` 增加参数：
  - `updateFields(eventId, patch, { writer, intent, source })`
- 在 `EventService.updateEvent()`：
  - 校验 `writer` 是否有权写 patch 中的字段（白名单映射）
  - 统一做 `normalizeEventPatch(patch, { intent })`
    - arrays: `[] -> undefined`（除非 `intent=user_clear`）
    - isAllDay: 保留 undefined
    - forbid: Storage 不可写 updatedAt
- 单元测试：
  - “Storage 写入覆盖 updatedAt”应失败
  - “serialization 注入 calendarIds=[]”在非 user_clear 下应被归一化为 undefined

### 7.2 过滤口径收敛（避免可见性漂移）
- 提取 shared predicate：
  - `shouldShowInPlanScope(event)`
  - `isSubordinate(event)`（迁移到 recordClass/systemRecordType）
  - 页面必须声明使用的 time anchor：`timeSpec.resolved` vs `resolveCalendarDateRange` vs `dueDateTime`

---

## 8. 附：从你现有文档中确认的“已知风险点”清单（便于追踪）
- Storage 覆盖 `updatedAt`（已明确）
- `normalizeEvent()` 把 `isAllDay undefined -> false`（契约偏离）
- PlanSlate 序列化注入 `syncStatus/source/calendarIds` 默认值（与契约冲突）
- TimeCalendar 创建默认写 `tags:[] calendarIds:[] syncStatus:local-only`（与“数组 undefined”策略冲突）
- EventEditModal “时间不完整就自动 isTask=true”属于强语义注入（易误伤 note-like/plan-like）

---

## 9. 结语：本文件如何使用
- **作为 Copilot 参考**：实现字段写入审计（writer/intent + 白名单）、修复 P0 冲突点、收敛数组/时间/updatedAt 规则。
- **作为团队契约**：新增字段或新增写入口前，必须补充：
  - 字段 Owner
  - intent/仲裁规则
  - 默认值策略（尤其数组、布尔、时间）
