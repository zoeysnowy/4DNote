# EventService Review & Refactor（normalizeEvent 重点审阅）

**日期**: 2025-12-28  
**范围**: 以 `EventService.normalizeEvent()` 为中心，审阅其架构合理性、代码完成度、偏差/风险点，并提出可执行的收敛与重构建议。同时核对「向 remote（Outlook）传递事件时注入隐藏元数据（Base64 meta），回传时恢复 eventID / 节点ID / timestamp 等」机制在文档与代码中的实现完整度。

---

## 1. 结论（TL;DR）

### 1.1 normalizeEvent 架构是否合理？
整体方向合理：把**标题/位置/事件日志/签名/时间戳/字段默认值与保护**集中在单一中枢做规范化，可以显著降低数据形态漂移与调用方分散补丁的风险。

但目前实现已演进得较复杂：功能“完成度高”，同时也出现了典型的“架构收口后又分叉”的问题（重复实现、链路不一致），会持续制造边界 bug（例如签名泄漏到 eventlog、重复签名、外部同步误判变更）。

### 1.2 代码完成度如何？
- **功能覆盖度**：高（大部分架构职责已落地，并且适配了 Outlook 复杂输入）
- **架构一致性**：中等偏低（文档说的职责边界与实际实现存在偏差，尤其是签名维护与元数据链路）
- **可维护性**：中等（大量条件分支与重复逻辑需要收敛）

---

## 2. normalizeEvent 对照架构职责的完成度

架构文档：见 [docs/architecture/EVENTSERVICE_ARCHITECTURE.md](../architecture/EVENTSERVICE_ARCHITECTURE.md) 的「三大规范化架构 / normalizeEvent」。

### 2.1 ✅ normalizeTitle（三层标题架构）
已实现：`normalizeEvent()` 早期调用 `normalizeTitle(event.title, event.tags)`。

### 2.2 ✅ normalizeLocation（位置对象转换）
已实现：`normalizeEvent()` 早期调用 `normalizeLocation(event.location)`。

### 2.3 ✅ normalizeEventLog（时间日志规范化，含 Outlook HTML 兼容）
已实现：
- `normalizeEvent()` 使用 `SignatureUtils.extractCoreContent(event.description)` 得到 fallbackContent
- 如 fallbackContent 是 HTML 则进行 HTML 实体解码 + DOM textContent 提取
- 调用 `normalizeEventLog(event.eventlog, fallbackContent, createdAtMs, updatedAtMs, oldEventLog)`

**风险点（重要）**：
- HTML→纯文本→解析 Slate 的链路很长，且存在“不同输入分支清理规则不一致”的历史包袱。
- 这类不一致容易导致签名文本残留进入 Slate JSON，从而在 TimeLog（eventlog 展示链路）里出现签名。

### 2.4 ⚠️ 签名维护（maintainDescriptionSignature vs SignatureUtils.addSignature）
现状：存在“**两套并存**”
- 统一工具类：`SignatureUtils`（[src/utils/signatureUtils.ts](../../src/utils/signatureUtils.ts)）
- EventService 内部逻辑：`maintainDescriptionSignature()` / `extractCoreContentFromDescription()` / `extractTimestampsFromSignature()` 等（位于 [src/services/EventService.ts](../../src/services/EventService.ts) 后段）

偏差：
- 架构文档描述 `normalizeEvent()` 调用 `maintainDescriptionSignature()`
- 实际代码中 `normalizeEvent()` 的主路径是 **直接** `SignatureUtils.addSignature(coreContent, meta)` 生成 description

风险：
- “规则更新不同步”是重复签名、签名识别失败、签名泄漏的长期根因。

### 2.5 ⚠️ Note 事件时间标准化（v2.19）
已实现：当 `!event.startTime && !event.endTime` 时设置 `startTime=createdAt, endTime=null`。

偏差点：
- 当前实现对 `isVirtualTime` 的置位更激进（只要无时间就 true）。
- 若文档语义为“仅在同步场景才标记虚拟时间”，则需要统一。

### 2.6 ✅ 条件字段设置（本地专属字段保护 / undefined 不强制覆盖）
已实现：大量使用 `...(field !== undefined ? { field: ... } : {})` 避免 `undefined → []` 误判变更。

---

## 3. 关键架构风险与建议（可执行）

### 3.1 风险 A：签名系统分叉（重复实现）
**表现**：同一概念（签名添加/识别/清理/时间戳提取）在多处实现。

**建议（最小可行收敛）**：
1. 统一“签名识别/清理/添加”入口：以 `SignatureUtils` 为唯一权威实现。
2. `normalizeEvent()` / `normalizeEventLog()` / `updateEvent()` 全部只调用 `SignatureUtils`。
3. `EventService` 内部的 `maintainDescriptionSignature()` 若仍保留，应改为薄封装（内部直接委托到 `SignatureUtils`），或删除避免双轨。

### 3.2 风险 B：HTML 处理依赖 DOM（document / DOMParser）
**表现**：`normalizeEvent()`/`normalizeEventLog()` 对 HTML 做了解码与 textContent 提取。

**风险**：在非 renderer 环境（Node/Electron main、脚本/测试）可能不可用。

**建议**：
- 把 HTML 处理集中封装为一个“环境安全”的工具：
  - renderer: DOMParser/document
  - node: 采用轻量 HTML 解析器（或在 Electron main 避免调用这段）

### 3.3 风险 C：eventlog 类型兼容（string | EventLog）导致类型与分支爆炸
`EventService.ts` 当前有多处 `string | EventLog` 的兼容逻辑与类型报错（见 TS 错误）。

**建议**：
- 在“入库前”彻底消灭旧格式：normalizeEvent 输出中保证 `eventlog` 永远是 `EventLog`。
- 若需要兼容读取旧数据，只在读取入口做一次转换，不在核心业务逻辑里长期背负联合类型。

---

## 4. CompleteMeta V2（hidden div + Base64 metadata）机制：是否完整实现？

### 4.1 文档层面
- 架构文档存在完整设计：CompleteMeta 同步架构、V2 接口、Base64 编解码、三层容错匹配算法。
  - 见 [docs/architecture/EVENTSERVICE_ARCHITECTURE.md](../architecture/EVENTSERVICE_ARCHITECTURE.md) 的「CompleteMeta 同步架构」与序列化/反序列化流程。
- 另有实现状态报告：
  - [docs/architecture/COMPLETEMETA_V2_IMPLEMENTATION_STATUS.md](../architecture/COMPLETEMETA_V2_IMPLEMENTATION_STATUS.md)

⚠️ 注意：该状态报告的部分结论与当前代码不一致（报告里写“EventService.ts 不存在 Base64 编解码/threeLayerMatch”等，但代码里已存在实现）。该报告需要更新为“已实现/已集成”的真实状态。

### 4.2 代码层面（已实现与已接入）
**已实现**：
- `EventService.serializeEventDescription(event)`：生成可见 HTML + hidden div `#4dnote-meta`，并 Base64 编码 meta。
- `EventService.deserializeEventDescription(html, eventId)`：提取并解码 meta，执行三层匹配（`threeLayerMatch` + `applyMatchResults`），合并 HTML 文本与 meta 元数据，返回 `eventlog.slateJson`（保留节点 id / ts / bulletLevel / mention 等）。
- 三层匹配算法本体在 `EventService.ts` 中存在。

**已接入同步链路**：
- 同步到 Outlook（UPDATE）：`ActionBasedSyncManager` 在发出 body 前调用 `EventService.serializeEventDescription(...)`。
- 从 Outlook 回来：`convertRemoteEventToLocal` 检测到 `id="4dnote-meta"` 时调用 `deserializeEventDescription(...)` 并把 `eventlog` 直接传给 `normalizeEvent`。

### 4.3 仍存在的“完整性缺口”（与“你记得的目标”对照）
你提到的目标是：
> 给传递到 remote 的 event 添加隐藏签名/metadata（base64），返回事件里读取相关信息，比如 eventID，timestamp node 等。

现状对照：
- ✅ timestamp node / 节点ID / bulletLevel / mention：**已能恢复**（通过 meta.slate.nodes + 三层匹配合并到 slateJson）。
- ⚠️ eventID（本地数据库 eventID）闭环未打通：
  - **ID策略已明确**：本地永远使用数据库 eventID；Outlook/其他日历的 ID 走 `externalId`（以及 calendarId/syncMode 等），不能用远端 ID 覆盖本地 ID。
  - 目前 meta 中确实包含 `id` 字段（实现写的是 `meta.id = event.id`），这正好可以作为“远端往返时带回本地 eventID”的载体。
  - 但 `deserializeEventDescription()` 的返回值目前只返回 `{ eventlog, signature }`，**没有把 `meta.id`（本地 eventID）向上层返回/应用**。
  - `ActionBasedSyncManager.convertRemoteEventToLocal()` 当前会把 `partialEvent.id` 设成 `remoteEvent.id`（Outlook ID），这与“本地 ID=数据库 eventID”的策略冲突；即使有 meta，也没有利用 meta.id 来把远端事件正确关联回本地事件。
- ⚠️ meta.signature 的闭环未打通：
  - `deserializeEventDescription()` 会返回 `signature: meta?.signature`，但上游当前并未系统性地把它合并进本地事件字段（createdAt/updatedAt/source/fourDNoteSource）。
  - 结果是：metadata 虽存在，但对“时间戳稳定/来源稳定/避免误判变更”的收益被削弱。
- ⚠️ 结构化节点类型在往返中会被压扁：
  - `deserializeEventDescription()` 目前把 HTML 的 `p/h1/h2/h3/li` 全部转成 `type: 'paragraph'` 节点再做匹配；这会丢失 heading、list、以及未来更多 Slate 元素的结构信息。
  - `serializeEventDescription()` 的 meta 目前不显式记录 `node.type`（只提取 text hint + 少量字段），对未来元素扩展不友好。

因此：CompleteMeta V2 的“核心价值（恢复节点元数据）”已经落地且已接入；但“用 meta.id / meta.signature 进一步增强本地字段恢复”的部分，目前是“有数据但未完全打通”。

**建议（小步增强）**：
- 让 `deserializeEventDescription()` 返回 `meta` 的关键字段（至少 `meta.id` 与 `meta.signature`），并在 `convertRemoteEventToLocal()` 里按策略使用：
  - **本地 ID 不被覆盖**：如果 meta.id 命中本地事件（或能映射到本地事件），则用它关联更新；否则生成新的本地 eventID，并把远端 ID 落入 `externalId`。
  - 时间戳优先级建议统一为：Block-Level ts → meta.signature → Outlook fields（createdDateTime/lastModifiedDateTime）→ 本地已有值 → now（仅最后兜底）。
  - 将 meta.signature 的 createdAt/updatedAt/source/fourDNoteSource 合并进 normalizeEvent 的候选集合，避免“签名/Outlook字段/本地字段”三套不一致。

---

## 4.4 CompleteMeta 的“闭环缺口清单”（用于集中评审后再实施）

### 缺口 1：本地 eventID ↔ 远端 externalId 的映射闭环
- **目标**：本地事件永远使用数据库 eventID；Outlook 事件 ID 写入 `externalId`，同步往返时用 meta.id 把远端事件关联回本地事件。
- **现状**：`convertRemoteEventToLocal()` 会用远端 ID 覆盖本地 id，破坏本地 ID 体系。
- **建议实现策略（不改 UX）**：
  - 远端→本地：若 HTML 中有 `#4dnote-meta` 且 `meta.id` 存在，则优先按 `meta.id` 查找/更新本地事件；若找不到，则创建新本地事件并把远端 ID 记到 `externalId`。
  - 本地→远端：序列化时继续写入 `meta.id = localEvent.id`，让远端 HTML 永远携带可回流的本地 ID。

---

## 4.6 最小可实施改造 Checklist（只改闭环，不改 UX）

### 目标（复述成工程约束）
- 本地事件主键：永远是数据库 eventID（`event.id`）。
- Outlook/其他日历的事件主键：永远落到 `externalId`（以及 calendarId / syncMode），不得覆盖本地 `event.id`。
- CompleteMeta V2 的 `meta.id` 用于“远端往返后找回本地 eventID”。
- CompleteMeta V2 的 `meta.signature` 用于“createdAt/updatedAt/source/fourDNoteSource 的稳定恢复”。

### 现状证据（用于评审确认改动必要性）
- `serializeEventDescription()` 当前写入：`meta.id = event.id`，以及 `meta.signature`（createdAt/updatedAt/source/fourDNoteSource）。
- `deserializeEventDescription()` 当前：解析出 `meta`，但**只返回** `{ eventlog, signature: meta?.signature }`，没有返回 `meta.id`。
- `ActionBasedSyncManager.convertRemoteEventToLocal()` 当前：`partialEvent.id = remoteEvent.id`（形如 `outlook-...`），同时 `externalId = pureOutlookId`。
  - 这意味着：即使远端 HTML 携带 `meta.id`，也无法把事件关联回本地数据库 eventID。

### Checklist A：让反序列化返回 meta.id（闭环第 1 步）
- 修改 `EventService.deserializeEventDescription()` 返回结构：
  - 现：`{ eventlog: EventLog; signature?: any } | null`
  - 建议：`{ eventlog: EventLog; signature?: any; metaId?: string; metaVersion?: number } | null`
- 返回值填充：
  - `metaId = meta?.id`（仅当 `meta.v === 2` 且 `meta.id` 为字符串时）。
  - 保持现有 `signature: meta?.signature` 不变。

### Checklist B：远端→本地时不覆盖本地 event.id（闭环第 2 步）
- 修改 `ActionBasedSyncManager.convertRemoteEventToLocal()` 的 id 策略：
  - 当 `deserializedData?.metaId` 存在时：
    - `partialEvent.id = deserializedData.metaId`（把它当作“本地 eventID”传给 normalizeEvent）。
  - 当 `deserializedData?.metaId` 不存在时：
    - **不要**用 `remoteEvent.id` 覆盖本地 id。
    - 选择其一（评审决定）：
      - 方案 1（推荐）：`partialEvent.id = undefined`（让后续 create 路径生成本地 eventID）；同时 `externalId = pureOutlookId`。
      - 方案 2：显式生成本地 eventID（由专门的 id 工具/数据库层生成），并填入 `partialEvent.id`。
- 保持 `externalId = pureOutlookId` 继续作为“远端事件标识”。

### Checklist C：把 meta.signature 纳入统一字段恢复（闭环第 3 步）
- 在 `convertRemoteEventToLocal()` 构造 `partialEvent` 时：
  - 将 `deserializedData.signature` 以“候选元数据”形式传入 normalizeEvent（可选字段，不强行覆盖）。
  - 由 normalizeEvent 统一决策：Block-level ts → meta.signature → Outlook fields → 本地字段 → now。
- 这一步的关键是：避免当前链路里“签名提取（HTML文本）/Outlook字段/meta.signature”三套来源互相打架。

### Checklist D：防止重复映射/脏写（闭环的安全阀）
- 当 `externalId` 已在本地存在且绑定到另一个 eventID 时：
  - 明确冲突策略（评审决定）：
    - 优先 `metaId`（因为它代表“作者的本地 eventID”），还是
    - 优先 `externalId`（因为它代表“远端唯一标识”），还是
    - 做一次冲突修复（写入审计日志/冲突记录）。
- 将该策略写入同步层注释与审计文档，避免后续维护人员“修一个 bug 引入另一个 bug”。

### 缺口 2：meta.signature 未纳入统一的时间戳/来源决策
- **目标**：让 createdAt/updatedAt/source/fourDNoteSource 的稳定性最大化，减少外部同步造成的误判变更。
- **现状**：meta.signature 存在但上游未系统消费。
- **建议**：把 meta.signature 作为 normalizeEvent 的“候选来源”之一，统一走同一套候选与 min/max 规则。

### 缺口 3：V2 反序列化导致结构降级（paragraph 化）
- **目标**：Outlook 往返后尽量恢复本地 Slate 结构（heading/list 等），而不仅仅恢复 ID/ts。
- **现状**：从 HTML 提取节点时统一做成 `paragraph`，结构信息丢失。
- **建议**：
  - 优先使用既有的 HTML→Slate 识别器（如 `htmlToSlateJsonWithRecognition`）产出“带结构的 Slate 节点”，再在此基础上应用 matchResults 把 meta 的 id/ts/bullet/mention 回填。
  - meta 侧补充 `t`（node.type）字段或等价信息，作为匹配与回填时的约束条件。

### 缺口 4：未来 Slate 元素扩展（toggle title / 表格 / 图片 / 语音等）缺少可持续的转换与 meta 维护机制
- **目标**：新增元素不需要到处打补丁；只要注册 serializer/deserializer，即可本地/远端双向稳定。
- **现状**：`serializeEventDescription()` 以“提取 textContent”作为 hint 的核心，非文本节点容易变成“无锚点”。
- **建议方向**：
  - 引入“元素适配器注册表”（按 node.type 分发）：
    - `toHtml(node)`：本地 Slate → 可见 HTML
    - `toMeta(node)`：本地 Slate → meta 节点（包含 type + anchor/hint + 必要字段，如图片 hash/cid、表格维度等）
    - `fromHtml(domNode)`：HTML → Slate 节点（或复用现有识别器）
  - 对非文本节点的 anchor：
    - 表格：使用“单元格文本的 canonical 串 + hash”
    - 图片/语音：使用附件的稳定标识（contentHash / cid / attachmentId）
    - toggle：使用 title 文本作为 hint
  - 让 threeLayerMatch 支持“多维锚点”（文本 hint + type + hash），避免纯文本缺失时完全失配。

---

## 4.5 TimeCalendar 新建事件后 eventlog 变成空段落 JSON 的问题（疑似可解释但体验上是 bug）

### 现象
- 你观察到“eventlog 虽然是空的，但会变成：`[{"type":"paragraph","children":[{"text":""}]}]`”。

### 初步定位（基于现有实现）
- `normalizeEventLog()` 在 `eventlogInput` 为空、`fallbackDescription` 也为空时，会走 `return this.convertSlateJsonToEventLog('[]')`。
- 而 `convertSlateJsonToEventLog()` 内部会调用 `jsonToSlateNodes(normalizedSlateJson)`，并把结果 `JSON.stringify(slateNodes)` 写回 `eventlog.slateJson`。
- 关键证据：`EventService` 实际 import 的是 `../components/ModalSlate/serialization` 里的 `jsonToSlateNodes`；该实现**明确规定**：当输入解析为数组且 `length === 0` 时，返回一个默认空段落（`[{ type:'paragraph', children:[{text:''}] }]`）。
- 因此链路很清晰：`convertSlateJsonToEventLog('[]')` → `jsonToSlateNodes('[]')` 返回默认空段落 → `eventlog.slateJson` 变成“空段落 JSON”。

### 为什么这不一定是 CompleteMeta 的问题
- CompleteMeta V2 只在同步到/从 Outlook 的 HTML 往返场景参与。
- 该现象发生在本地 TimeCalendar + EditModal 创建事件后，更像是“本地 eventlog 规范化/编辑器初始化约束”导致。

### 为什么仍然应该当成 bug/待改进项
- 数据层（存储）与 UI 层（编辑器 state）的约束混在一起：
  - 存储层想表达“无日志”时，应能保持为 `[]`（语义清晰）。
  - UI 层打开编辑器时，可以在内存里补一个空 paragraph 作为初始 state。
- 否则会造成：
  - Debug/审计时误以为有一条空日志
  - 一些 diff/同步逻辑被空段落污染（hash/版本/变更检测）

### 建议改进（先写进评审清单，后续再实施）
- 明确 eventlog 的“存储语义”与“编辑器语义”：
  - 存储语义允许 `[]`
  - 编辑器语义在渲染/编辑时补默认节点
- 在 TimeLog/TimeCalendar 展示层把“单空段落且无时间戳/无内容”的情况视为“空”。
- 为 `jsonToSlateNodes([])` 的行为写一个单元测试，明确是否应该保留空数组还是补默认 paragraph。

### 相关风险：项目中存在两份 `jsonToSlateNodes`（可能导致入口行为不一致）
- `src/components/ModalSlate/serialization.ts`：空数组/空输入 → **返回默认空段落**（更偏“编辑器 state”语义）。
- `src/components/SlateCore/serialization/jsonSerializer.ts`：JSON 字符串解析后若是数组则**原样返回**（`[]` 会保留 `[]`，更偏“存储语义”）。
- `EventService` 当前使用的是前者，这会把“存储语义”隐式改写成“编辑器语义”。建议后续重构时统一这两者的职责边界，避免不同入口产生不同 eventlog 形态。

---

## 5. 建议的重构路线（分三步，尽量不动 UX）

1) **收敛签名系统**（最高优先级）
- 让签名添加/清理只走 `SignatureUtils`
- 删除或薄封装 `maintainDescriptionSignature` 相关重复实现

2) **收敛 HTML 处理与环境依赖**
- 把 HTML→text 的逻辑抽成单一工具函数，并保证非 DOM 环境安全

3) **收敛 eventlog 类型**
- 核心路径中禁止 `string | EventLog`
- 只在读取旧数据入口做一次迁移/修复

---

## 6. 附：现状事实指针（方便快速定位）

- `normalizeEvent()` 主实现：
  - [src/services/EventService.ts](../../src/services/EventService.ts)
- CompleteMeta V2：
  - `serializeEventDescription` / `deserializeEventDescription` / `threeLayerMatch` / `applyMatchResults`
  - [src/services/EventService.ts](../../src/services/EventService.ts)
- 同步接入点（UPDATE / convertRemoteEventToLocal）：
  - [src/services/ActionBasedSyncManager.ts](../../src/services/ActionBasedSyncManager.ts)
- CompleteMeta 类型：
  - [src/types/CompleteMeta.ts](../../src/types/CompleteMeta.ts)
