
# 目标
在不破坏现有“单 Event 一个 SlateJSON、按 timestamp node 分段”的前提下，实现两类核心体验：
1) **稳定的层级与计时架构**：用户树（Plan/Library）不被 timer/session 节点污染；统计/复盘准确。
2) **Granola 级高质量整理输出**：每次 session 结束自动生成结构化、可追溯、可执行的笔记与行动项，并能跨 session 滚动总结。

---

# 现状约束（已确认）
- 每个 event 只有一个 SlateJSON 主文档（EventLog）
- EventLog 内部以 `timestamp node` 分段
  - 每次文字插入强制 apply timestamp（paragraph 归属 timestamp node）
  - 连续输入的多个 paragraph 归属同一个 timestamp node
  - 失焦超过 5 分钟自动 apply 新 timestamp node
- tag 为用户自定义、可多选、无限层级（不用于系统语义）
- 存在 `EventtreeEngine` / `EventTreeAPI` 管理层级结构
- 存在 stats 数据库表（用于统计/聚合）
- 主场景：**个人专注计时笔记** 与 **会议** 都重要；会议可选择性要求用户输入 Attendees 来辅助识别/归因

---

# Granola 做得好的点（产品与工程要点）
> 以下不是“写个 prompt”能稳定得到的效果，主要来自 **结构约束 + 管线分阶段 + 证据链 + 增量更新 + 闭环落地**。

## (G1) 固定结构化模板（UI 与输出 schema 对齐）
- 输出稳定分区：TL;DR / Key points / Decisions / Action items / Open questions
- 每条 item 有稳定 ID、置信度、引用证据
- UI 用固定卡片与列表渲染（不依赖模型排版）

## (G2) “先抽取再综合”（extract → synthesize）提高可靠性
- 先高召回抽取候选（动作/决定/问题/实体）
- 再去重归并、补全字段、生成最终 Brief
- 明显降低漏项与胡编

## (G3) 证据链（点击可回跳）是质量与信任的核心
- 每条结论必须带 1–3 条 EvidenceLink
- 可点击回到：timestamp node、转写片段、或 signals 统计
- 可设置硬规则：**无证据不输出** 或降级到“Needs review”

## (G4) 上下文卫生（只喂“本次 session”）比模型更关键
- 输入范围严格限定：本 session 的 notes/transcript/signals
- 对齐时间轴，去掉噪声块（过短、空、重复）
- 必要时只携带“父 event 的滚动总结/术语表”做轻量补充

## (G5) 可执行闭环：行动项一键落地
- Action item 一键创建子任务（user event）/加入现有任务/写入日历
- 落地后回写链接（linkedEventId）并支持状态跟踪

## (G6) 可迭代：用户编辑与反馈驱动“越用越准”
- ✅/❌ 反馈、改写、合并/拆分，作为后续生成的输入
- 采用 Artifact 版本管理与增量更新，避免“重生成把用户改动覆盖”

## (G7) 会议场景的“选择性多人识别”
- 不必强上全自动 diarization
- 允许用户输入 Attendees（姓名/昵称/角色）
- 转写时（或后处理）做“说话人候选归因”：Speaker A/B → 最可能 attendee（可手动校正）
- 输出层面：action item/decision 可标注“谁负责/谁提议”

---

# 核心设计决策（必须遵守）
## (A) 两套“父子”并存，但用系统字段隔离
- 用户规划树：`event.kind = "user"`
- 系统计时/会话：`event.kind = "session"`（内部子事件）
- 任何高频被动数据不得建为子 event；走 signals/streams + stats 聚合

## (B) Plan/Library 默认只展示用户事件树
- Plan/Library 组树时必须过滤：只包含 `kind="user"` 且 `visibility="normal"`

## (C) session 只能挂在 user 事件之下
- 禁止 `session -> session` 继续挂载（除非未来明确需求再开）
- 禁止把 `user` 事件 reparent 到 `session` 事件之下

---

# 数据模型变更
## 1) Event 顶层新增字段（你已确认放顶层）
- `kind: "user" | "session" | "inbox"`（默认 `"user"`）
- `visibility: "normal" | "hidden"`（默认 `"normal"`）

## 2) Timestamp node 增强字段（推荐）
在 SlateJSON 的 timestamp node 上维护：
- `timestampId: string`
- `tsStart: number`（ms）
- `tsEnd?: number`
- `sessionId?: string`（该段归属哪个 session；为空表示自由记录）

用途：
- 从 Calendar/Session 定位到对应笔记段
- 以 session 切片生成 Granola 风格 Brief（输入范围干净）

## 3) 新增：Artifact（整理产物）实体
避免污染主 EventLog，支持版本、增量与 UI 渲染。

字段建议：
- `artifactId`
- `scope: "session" | "event"`
- `targetId: string`（sessionId 或 eventId）
- `type: "brief" | "rolling_summary" | "action_items" | "qa" | "outline"`
- `contentJson`（推荐存结构化 JSON，UI 再渲染；必要时可派生 markdown）
- `createdAt`, `updatedAt`
- `modelInfo`（model/version/promptHash）
- `status: "draft" | "accepted" | "edited"`

## 4) 新增：EvidenceLink（证据链）
- `evidenceId`
- `targetArtifactId`
- `claimId`（artifact 内某条结论的稳定 ID）
- `sourceType: "eventlog_timestamp" | "transcript_chunk" | "signal"`
- `sourceRef`：
  - timestamp：`{ eventId, timestampId }`
  - transcript：`{ sessionId, chunkId, tStart, tEnd }`
  - signal：`{ signalId }`
- `quote?: string`
- `confidence: number`

## 5) Signals（新增实体，或与现有 stats 对接）
新增 append-only `signals` 存储（表或等价持久化）：
- `id`, `type`, `tsStart`, `tsEnd?`, `targetEventId`, `payload`

stats 表作为聚合层：
- 按 `targetEventId`（以及可选 `bucketStart`）存储聚合结果
- （可选）增加 `targetKind: "event" | "session"` 与 `targetId`

## 6) 会议 Attendees（选择性支持）
为 session 增加可选字段：
- `attendees?: Array<{ id?: string; name: string; aliases?: string[]; role?: string }>`
- `speakerMap?: Record<string, { attendeeName?: string; confidence: number }>`（用于 A/B 说话人到 attendee 的映射，可人工校正）

---

# EventTreeAPI / EventtreeEngine 改造
## 1) 增加过滤能力（用于不同视图 scope）
在 `EventTreeAPI.buildTree / toDFSList / getRootEvents` 等入口增加：
- `filter?: (e: Event) => boolean`（推荐）

实现方式（最小改动）：
- 进入 `buildEventTree()` 前先对 `events` 做过滤，再构建树

Plan/Library 默认过滤：
```ts
const planFilter = (e: Event) => e.kind === "user" && e.visibility !== "hidden";
```

## 2) reparent 约束（防止拖拽/tab 破坏隔离）
在 `EventTreeAPI.reparent` 前置校验：
- 若 `node.kind === "session"`：禁止出现在 Plan 的 tab/shift+tab 重排流中（或只能挂到 user 下）
- 若 `newParent.kind === "session"`：拒绝把 `kind="user"` 的节点挂入

---

# Timer → Session（内部系统流程）
## 1) Start timer
- 若目标为某个 user event：
  - 创建 session event：
    - `kind="session"`, `visibility="hidden"`
    - `parentId = userEventId`
    - `startTime = now`
    - 可选：`attendees`（会议模式）
- 设置 `activeSessionId`

## 2) Writing notes during session（仍写入父 event 的单 SlateJSON）
- 新 paragraph 仍写入父 user event 的 EventLog
- timestamp node 上写入 `sessionId = activeSessionId`
- session 开始时可强制 apply 新 timestamp node，保证切片边界清晰

## 3) Stop timer
- 更新 session：`endTime = now`, `duration`
- 异步触发：
  - stats 聚合
  - 生成 Session Brief（见下文 Granola pipeline）

## 4) 打开 Calendar 实例时的定位
- `calendarItemId -> sessionId -> 找到第一个 timestamp node(sessionId)` → 滚动定位

---

# Granola 级整理输出：Pipeline（必须实现的最小闭环）
> 关键：**固定 schema + 证据链 + 一键落地行动项**。

## (P0) buildSessionContextBlocks(sessionId)
输入范围严格限定为本 session：
- notes：筛选 `timestampNode.sessionId === sessionId`
- transcript：筛选 `transcript.sessionId === sessionId`（如有）
- signals/stats：时间窗内聚合（可选）

输出统一块：
```ts
type ContextBlock =
  | { kind: "note"; id: string; ts: number; text: string; ref: { eventId: string; timestampId: string } }
  | { kind: "transcript"; id: string; tsStart: number; tsEnd: number; text: string; ref: { sessionId: string; chunkId: string } }
  | { kind: "signal"; id: string; tsStart: number; tsEnd?: number; summary: string; ref: { signalId: string } };
```

## (P0) generateSessionBrief(sessionId)（固定 schema）
两阶段（可两次调用模型，或一次调用但明确分段输出）：

1) Extract（高召回）
- 抽取候选：action/decision/question/key point/entity
- 每条带 sourceRefs（ContextBlock.id 列表）

2) Synthesize（高精度）
- 去重归并、补齐字段（owner/due/priority）
- 生成稳定 `claimId`
- 为每条 claim 选择 1–3 个 sourceRefs 作为证据

最终 brief JSON：
```json
{
  "tldr": ["..."],
  "key_points": [{"id":"kp_...", "text":"...", "confidence":0.78}],
  "decisions": [{"id":"dc_...", "text":"...", "confidence":0.66}],
  "action_items": [{"id":"ai_...", "text":"...", "owner":null, "due":null, "priority":"medium", "confidence":0.72}],
  "open_questions": [{"id":"q_...", "text":"...", "confidence":0.6}]
}
```

写入：
- Artifact(scope="session", type="brief", status="draft")
- EvidenceLink：每条 claim 至少 1 条

## (P0) UI：Session Brief 展示与证据回跳
- 在 session 详情页显示 brief（卡片/列表）
- 每条 claim 有“证据”按钮→展开引用→点击跳转到 timestamp node / 播放 transcript 片段

## (P0) UI：Action item 一键落地
- “创建为子任务（user event）/加入现有任务/加入日历”
- 落地后写回 `linkedEventId`（在 Artifact 内或单独表）并显示状态

---

# Granola 进阶：Rolling Summary（P1）
对父 `kind="user"` 维护滚动总结：
- 基于最近 N 次 session brief 增量更新（不要每次喂全部历史原文）
- 输出同样带 claimId 与 EvidenceLink（可指向 session brief 的 claim 或原文）

Artifact：
- scope="event", type="rolling_summary"

---

# 会议增强（不强制 diarization 的可交付方案）
## Attendees 辅助识别（P1）
- 会议模式允许用户输入 Attendees（name/aliases/role）
- 转写 chunk（若有 speaker 标签 A/B/C）：
  - 用 aliases + 近邻上下文做“候选归因”
  - UI 提供“把 Speaker A 设为 张三”校正
- 输出时：
  - action items 尽量填 owner（若不确定，owner=null 并提示待确认）
  - decisions 可标注“谁确认/谁提出”（如能从证据推断）

---

# 迁移方案（不破坏老数据）
1) 为所有旧 event 补默认：
- `kind="user"`, `visibility="normal"`
2) 历史 timer 子 event（若存在）：
- 设置为 `kind="session"`, `visibility="hidden"`
3) 老 SlateJSON timestamp nodes：
- 不强制补 `sessionId`，允许为空

---

# 验收标准（Definition of Done）
## 架构侧
- Plan/Library：只显示 `kind="user"`；session 不进入树/DFS
- timer：每次计时产生一个 session event（hidden），并能定位到对应 session 的笔记段

## Granola 体验侧（最小可用）
- session stop 后自动生成 Session Brief（draft）
- brief 分区清晰、结构稳定
- 每条结论可点击证据回跳（至少回到 timestamp node）
- action items 可一键创建子任务并回链

---

# 实施顺序（建议）
(1) Event schema 增加 `kind/visibility` + 迁移  
(2) Plan/Library 构树入口加入过滤（立刻止血）  
(3) session 写入与 timestampNode.sessionId 标记  
(4) Artifact/EvidenceLink 存储 + Session Brief 生成（P0 Granola）  
(5) 证据回跳 + action items 一键落地  
(6) Rolling Summary（P1）  
(7) Attendees 辅助识别（P1，会议增强）  
