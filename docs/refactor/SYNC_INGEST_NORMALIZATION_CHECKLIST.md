# Sync Ingest SSOT Normalization Checklist

目标：把“同步入库时的字段清洗/默认值”集中到 `EventService.normalizeEvent()`，避免在各处散落 `||` / `??` 兜底造成语义漂移（尤其是 `checkType`/Plan 误混入）。

## 原则

- **只归一化 canonical 字段**；不引入/不持久化任何 derived flags（例如 isTask/isPlan/isTimeCalendar）。
- **避免把缺失字段强行写成空数组**：只有当字段在输入里“存在”（不为 `undefined`）时才补默认/清洗，减少 `undefined → []` 导致的 EventHistory 噪音。
- **例外：`checkType`** 作为任务能力的 canonical 入口，入库时必须稳定（`undefined` 统一视为 `'none'`）。

## 归一化清单（写入前）

### 1) `checkType`
- **输入风险**：同步/旧数据可能是 `undefined` 或非法值。
- **canonical**：只允许 `'none' | 'once' | 'recurring'`，其余一律归一为 `'none'`。
- **原因**：任何 `checkType !== 'none'` 若未处理 `undefined`，会把同步事件误判为任务 → Plan 混入。

### 2) `externalId`
- **输入风险**：前后空格、历史 `outlook-` 前缀、空字符串。
- **canonical**：
  - `trim()`
  - `outlook-xxx` → `xxx`（统一存储为裸 Outlook ID）
  - `''` → `undefined`
- **兼容**：ActionBasedSyncManager 仍可能遇到旧数据带前缀；入库会自动剥离。

### 3) `syncMode`
- **输入风险**：包含空格、空字符串。
- **canonical**：string → `trim()`；空串归一为 `undefined`。

### 4) String[] 形态字段（仅字段存在时）
适用字段：
- `tags`
- `calendarIds`
- `todoListIds`
- `checked`
- `unchecked`

归一化规则：
- 如果是 `string[]`：过滤非 string 项，对每项 `trim()`，去掉空串。
- 如果是 `string`：`trim()` 后转为单元素数组（空串 → `[]`）。
- 其他类型：归一为 `[]`（仅在字段“存在”时才会写入）。

### 5) `subEventConfig`（若存在）
- `subEventConfig.calendarIds`：按 String[] 规则归一化
- `subEventConfig.syncMode`：按 syncMode 规则归一化

## 已落地位置

- `EventService.normalizeEvent()`：集中执行上述归一化。
- `ActionBasedSyncManager`：Outlook Calendar 创建/迁移写回 `externalId` 时不再强制加 `outlook-` 前缀（与 canonical 保持一致）。

## 后续建议（不在本次变更范围）

- 全仓继续排查 `checkType || 'once'` 仅允许出现在**本地 Plan 创建路径**，避免同步入库路径再次引入默认 `'once'`。
- 逐步把历史 `externalId` 前缀依赖逻辑收敛为“兼容读 + canonical 写”。
