# Field Contract Repo-Wide Audit (2025-12-31)

> 基准：以 [docs/refactor/EVENT_FIELD_CONTRACT.md](../refactor/EVENT_FIELD_CONTRACT.md) 为唯一契约（Hard Rules + 字段逐条约定）。
>
> 目标：全量扫描 app 内所有“可能写回 canonical Event”的路径，找出违反契约（或高风险偏离）的点，并给出可执行修复清单。

## 结论摘要

- **已修复**：存储层对 `updatedAt` 的强制覆盖（IndexedDB 写入层不再覆盖）。
- **已修复**：`normalizeEvent()` 不再把 `isAllDay` 从 `undefined` 默认注入为 `false`。
- **高风险写入点（需确认调用链后决定修复策略）**：若 UI/Plan 临时态将 `tags/calendarIds/todoListIds/childEventIds` 默认成空数组并写回，会把“缺失/未设置”变成“显式空数组”，破坏 optional-array 语义。

## 审计范围与方法

- 范围：`src/**`（重点：EventService / StorageManager / IndexedDBService / SQLiteService / PlanSlate / PlanManager / LogTab / Sync）。
- 方法：
  - 搜索违约模式：`childEventIds` 依赖、`isAllDay || false`、`tags || [] / calendarIds || []`、`startTime/endTime` 回退 `createdAt`、`updatedAt` 自动覆盖。
  - 对命中点进行“是否写回 canonical”的判断：
    - **写回**：最终进入 `StorageManager.createEvent/updateEvent` 的对象。
    - **不写回**：仅 UI state / 仅派生排序 / 仅索引/缓存表（EventTreeIndex）。

## Findings

### F1 — Storage 覆盖 updatedAt（Resolved）

Hard Rule：Storage 不得覆盖业务字段（尤其是 `updatedAt`）。

- 证据（修复前）：IndexedDB 的 `updateEvent()` 无条件把 `updatedAt` 写成“现在”。
  - 位置：[src/services/storage/IndexedDBService.ts](../../src/services/storage/IndexedDBService.ts#L525-L542)
  - 现状：
    - `const updatedEvent = { ...existingEvent, ...updates, updatedAt: formatTimeForStorage(new Date()) }`
    - 这会覆盖：
      - 上层显式传入的 `updates.updatedAt`
      - 以及「用户设置时间优先」等策略在应用层计算出的时间戳

影响面：
- 破坏 `updatedAt` 的“caller/user 优先”语义，导致：
  - 同步差异判断（本地/远端）不可信
  - EventHistory/变更检测抖动
  - 可能出现“保存一次，updatedAt 反复跳动”的链式副作用

已实施修复：
- IndexedDBService.updateEvent 不再改写 `updatedAt`（完全尊重应用层传入/已有值）。
- 若需要“存储写入时间”，应使用单独字段（如 `_dbUpdatedAt`）或在 EventTreeIndex/SyncQueue 里记录；不要污染 canonical Event。
- 参考 SQLite 的实现：允许使用 `updates.updatedAt`，否则才 fallback。
  - 位置：[src/services/storage/SQLiteService.ts](../../src/services/storage/SQLiteService.ts#L918-L923)

---

### F2 — isAllDay 默认注入（Resolved）

契约要求：可选字段必须保持可选；不得把 `undefined` 变成默认值写回（除非明确“规范化允许”）。

- 证据（修复前）：`normalizeEvent()` 强制 `isAllDay: event.isAllDay || false`。
  - 位置：[src/services/EventService.ts](../../src/services/EventService.ts#L3558-L3568)

为什么算问题：
- `event.isAllDay` 缺失时会写回 `false`，导致 canonical 数据从“未知/未设置”变成“显式 false”。
- 会放大“同步/旧数据/草稿”场景的差异：远端没传 isAllDay → 本地落库变成 false → 下次 diff 认为本地改动。

已实施修复：
- `normalizeEvent()` 不再注入默认值；当 `isAllDay` 缺失时保持 `undefined`。

---

### F3 — UI Draft 默认空数组/childEventIds（Resolved）

契约要求：可选数组字段不要默认 `[]` 写回；ADR-001 要求不维护 `childEventIds` 作为结构真相。

- 证据：LogTab 的 formData 初始化把多个字段默认成空数组，并且 `childEventIds: []` 固定写死。
  - 位置：[src/pages/LogTab.tsx](../../src/pages/LogTab.tsx#L389-L420)
  - 以及新建默认值：[src/pages/LogTab.tsx](../../src/pages/LogTab.tsx#L488-L520)

风险解释：
- 如果“保存/更新”路径把 formData 直接作为 updates 写回（尤其是 `tags/calendarIds/childEventIds`），会把：
  - `undefined` → `[]`
  - `childEventIds` → `[]`（显式写回 legacy 字段）

已确认并修复：
- LogTab 的 `handleSave` 通过 `EventHub.createEvent/updateFields` 写回 canonical Event；此前会把 UI 的 `[]/false` 默认值与 `childEventIds: []` 一并写回。
- 已在写入边界实现“contract-safe”持久化：
  - `tags/calendarIds/attendees`：当原值为 `undefined` 且 UI 为空数组时不写回（保留可选性）；若原值存在且用户清空则允许写回 `[]`。
  - `isAllDay`：当原值为 `undefined` 且 UI 为 `false` 时不写回（避免默认注入）；从 `true → false` 会写回。
  - `childEventIds`：创建/更新时一律剔除，避免写回 legacy 字段。
  - `eventlog/description`：仅当 eventlog 变化时写回，并将 `description` 置为 `undefined` 触发再生成。

修复位置：
- [src/pages/LogTab.tsx](../../src/pages/LogTab.tsx)

建议：
- UI state 可以用 `[]`，但写回 canonical 时应做“稀疏更新（sparse updates）”：
  - 如果原值为 `undefined` 且用户没有显式编辑，不要写入 `[]`。
  - `childEventIds` 一律不写回（除非 repair tool）。

---

### F4 — PlanSlate/PlanManager 默认值写回风险（Resolved）

- 证据（修复前）：PlanSlate 反序列化把多个字段设默认值：
  - `isAllDay: metadata.isAllDay ?? false`
  - `calendarIds: metadata.calendarIds || []`
  - `todoListIds: metadata.todoListIds || []`
  - `source: metadata.source || 'local'`
  - `syncStatus: metadata.syncStatus || 'local-only'`
  - `fourDNoteSource: metadata.fourDNoteSource ?? true`
  - 位置：[src/components/PlanSlate/serialization.ts](../../src/components/PlanSlate/serialization.ts#L516-L570)

- 修复：
  - PlanSlate 反序列化不再默认注入 `isAllDay=false`，保持 `undefined`。
  - PlanManager 多处 `EventHub.updateFields(updatedItem)` 已改为“只写必要字段 + compact undefined + 删除 legacy 字段”，避免 UI 默认值写回。
  - `setEventTime()` 不再默认传 `allDay=false` 给 EventHub（仅在调用方显式提供时才传）。

说明：
- 如果这些字段只存在于 PlanItem/UI 层，不写回 Event storage，则属于“UI 默认值”，可接受。
- 但如果 Plan 保存时把这些字段带回 canonical Event，就会违反 Hard Rule 的“默认值注入禁令”。

建议：
- 明确区分：
  - PlanItem/UI 层默认值（可用）
  - 写回 Event 层 updates（必须保持稀疏，避免注入）

---

### F5 — createdAt 作为无时间 Task 的日历显示回退（Risk: UX Ghost-Time）

- 证据：日历转换对无时间 Task 使用 `createdAt` 的日期，并强制设为 `00:00`。
  - 位置：[src/utils/calendarUtils.ts](../../src/utils/calendarUtils.ts#L165-L187)

判定：
- 该逻辑目前看是“派生展示”，不直接写回 storage；因此不算契约违约。
- 但它会在日历视图上形成“看起来像有时间（00:00）”的体验风险，与“Plan/Task 时间应保持可选”方向有张力。

建议：
- 明确 UI 展示层的策略：无时间 task 是否应进入 TimeCalendar；若必须显示，应使用 all-day / milestone 风格而不是隐式 00:00。

---

### F6 — createdAt 回退用于排序（Pass: Derived Only / OK）

- 证据：排序时使用 `startTime ?? createdAt`。
  - 位置：[src/services/EventService.ts](../../src/services/EventService.ts#L5055-L5060)

判定：
- 仅排序派生，不写回 canonical；符合“derived 仅用于展示/排序”的允许范围。

## Checklist（下一步可执行清单）

- [x] 修复 IndexedDB 写入层覆盖 `updatedAt`（对齐 SQLite 的策略）。见：[src/services/storage/IndexedDBService.ts](../../src/services/storage/IndexedDBService.ts#L525-L542)
- [x] 修复 `normalizeEvent()` 的 `isAllDay` 默认注入（保持 `undefined` 不注入）。见：[src/services/EventService.ts](../../src/services/EventService.ts#L3558-L3568)
- [x] 确认 LogTab 是否仍是主写入路径；若是，补齐“稀疏 updates”策略，避免把 UI `[]` 写回。见：[src/pages/LogTab.tsx](../../src/pages/LogTab.tsx#L389-L420)
- [x] 修复 PlanSlate/PlanManager 写回链路的默认值泄漏：PlanSlate `isAllDay` 保持可选；PlanManager 写回做稀疏更新（不把 `[]/false/''` 作为默认写回）。
  - PlanSlate：见 [src/components/PlanSlate/serialization.ts](../../src/components/PlanSlate/serialization.ts)
  - PlanManager：见 [src/components/PlanManager.tsx](../../src/components/PlanManager.tsx)
  - 时间统一入口：见 [src/utils/timeManager.ts](../../src/utils/timeManager.ts)
- [ ] 决定无时间 Task 是否应进入日历视图；如进入，避免隐式 00:00 的“伪时间”。见：[src/utils/calendarUtils.ts](../../src/utils/calendarUtils.ts#L165-L187)

## 最小回归测试结果

- ✅ 通过：`src/services/EventTree/TreeEngine.test.ts`
- ⚠️ 仍失败（与本次修复无关）：`src/services/__tests__/EventService.bidirectionalLinks.test.ts` 在 Node 环境缺少 `window`/`indexedDB`

## 附：与 ADR-001 的一致性快检

- PlanSlate 明确删除 `childEventIds`（避免第二真相源）：
  - 位置：[src/components/PlanSlate/serialization.ts](../../src/components/PlanSlate/serialization.ts#L504-L510)
- 代码库仍存在 `childEventIds` 字段与测试，但多处注释已标注 legacy-only。

