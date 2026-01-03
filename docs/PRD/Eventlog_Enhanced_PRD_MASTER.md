# Eventlog Enhanced — Master PRD（开发主文档）

> 目的：把分散的 Eventlog Enhanced PRD 合并为一份“可直接落地开发”的主文档。
>
> 本文不是简单搬运：
> - 统一术语/对象/事件命名，消除冲突与歧义
> - 把 Daily Narrative × Granola Signals × Takeaways Capture 融合为一套证据链驱动（Evidence-driven）的生成体系
> - 对缺失部分补上工程可执行的接口契约（IDs、evidence_refs、timezone、MVP 聚类/权重、删除归档策略、隐私边界）
>

## 0. 范围与原则

### 0.1 产品愿景
让用户“低门槛记录碎碎念”，并持续获得**可回顾、可检索、可总结、可共鸣（可开关）**的成长轨迹。

### 0.2 设计原则（用于裁剪需求与解决冲突）
1) **Evidence-first（证据优先）**：任何总结/回顾/Takeaway 必须能回链到可定位的证据（note/node/card/event/session…）。
2) **Origin-based labeling（来源即标签）**：默认不依赖语义猜测做强分类；用户不标记也能用。
3) **Low friction capture（低摩擦记录）**：默认折叠卡片；Signals 用快捷键/轻入口；会话重点用时间戳。
4) **Local-first & privacy-first（本地优先/隐私优先）**：行为信号默认最小化；可选项必须可关闭。
5) **成本可控**：优先“即时轻量结算 + 日终重聚合”，避免对全文反复高成本总结。

### 0.3 非目标（本阶段明确不做）
- Notion 式数据库全能系统
- 多人协作/权限系统
- 实时、全自动、完全正确的语义分类（仅做辅助/回溯标注）
- 强依赖停留时长等敏感行为数据（MVP 不做或默认关闭）


## 1. 核心对象与术语（统一版）

> 说明：原文中“Signal Tag（段落类型）”与“Signals（会话时间戳信号）”容易混淆。本文做**强制区分**：
> - **Paragraph SignalTag**：段落/块的来源标签（Body/Thought/AI_Conversation/Reference）
> - **Session Signal**：会话里的带时间戳意图（HIGHLIGHT/QUESTION/…）用于 focus windows

### 1.1 Document Layer（文档层）
- **Note**：一篇笔记文档（ProseMirror/Tiptap JSON）。
- **Node**：文档内块节点（paragraph/heading/card 等），每个 node 必须有稳定 `node_id`。
- **Anchor**：定位信息。
  - **Block anchor（MVP 推荐）**：仅绑定到 `node_id`（最稳定）。
  - **Range anchor（可选增强）**：在 `node_id` 内附带 `{startOffset,endOffset}`（更精确但对编辑敏感）。

### 1.2 Card Layer（卡片层）
- **Card**：挂载在 Note 中的 block node（NodeView），支持折叠/展开与递归嵌套。
- **CardType（统一枚举）**：
  - `ai_answer`：Ask AI 的回答卡（含 question/answer/refs）
  - `summary`：多卡集成总结卡 / Daily Review Summary 卡
  - `resonance`：历史共振卡（可选/可关闭）
  - `reference`：Web clip/引用摘要卡
  - `session_summary`：会话分层整理输出（Executive Summary / Key Moments / Supporting Notes）

> 备注：`session_summary` 可以实现为 `summary` 的子类型（attrs.meta.kind），但对 UI/管线建议保留显式类型，减少混淆。

### 1.3 Evidence Layer（证据层，生成输入）
Daily/Weekly 不再读“整篇笔记”，而是读可解释的证据。

**Evidence Types（统一）**
1) Timeline Evidence（时间骨架）
- 日程块（可选）
- Session 时间轴（started/ended）
- 关键时间点（Signal timestamps、image_id timestamps 等）

2) Interaction Evidence（交互证据）
- `AI_ASKED` / `AI_ANSWERED`
- `CARD_TOGGLED`
- `SUMMARY_GENERATED`
- `REFERENCE_CLIPPED`
- `SIGNALTAG_CHANGED`
- `OPEN_LOOP_MARKED` / `ACTION_ITEM_MARKED`
- `TAKEAWAY_PINNED`

3) Outcome Evidence（产物证据）
- AI Answer cards
- Summary cards（含 session_summary、daily_review）
- Resonance cards
- Web clips
- 用户手写结论段落（Body/Thought）

### 1.4 Review & Takeaway Layer（回顾与结算层）
- **TakeawayCandidate（micro-takeaway）**：交互即时结算出的“一句话收获”。
- **DailyReview（daily aggregation）**：日终把 candidates + timeline + signals 聚合成 Narrative + Top Takeaways + Open Loops + Actions + Resonance。
- **Weekly/Monthly/Yearly Review（compounding）**：基于每日结算复利聚合，产出 Themes/Progress/Repeated Blockers/Decisions/Next Focus。

### 1.5 Session Layer（会话层，可选但与 Granola 强相关）
- **Session**：一段连续记录过程（会议/学习/散步碎碎念）。
- **Session Signal**：会话内的时间戳意图（HIGHLIGHT/QUESTION/…）。
- **Focus Window**：由 HIGHLIGHT 等信号生成的重点时间窗口（用于差异化转写/总结）。
- **Transcript Segment**：转写分段（可标记 `is_focus`）。


## 2. IDs、时间与可追溯性（补全工程契约）

### 2.1 ID 规范
- `note_id`, `node_id`, `card_id`, `event_id`, `session_id`, `signal_id`, `takeaway_id` 均使用 UUID（推荐 v4/v7）。
- Snapshotting 的 `image_id` 可使用可读时间戳或 Unix ms（PRD 推荐 `YYYYMMDDHHmmssSSS`）。

### 2.2 日期与时区
- **所有聚合（日/周/月/年）必须以 user timezone 为准**。
- TakeawayCandidate 的 `date` 字段使用 `YYYY-MM-DD`（用户时区），避免跨日漂移。

### 2.3 Evidence Refs（必须落库）
所有生成输出（takeaway、open loop、action、resonance连接句）必须携带 `evidence_refs`：

```ts
type EvidenceRef =
  | { type: "note"; id: string }
  | { type: "node"; id: string }
  | { type: "card"; id: string }
  | { type: "event"; id: string }
  | { type: "session"; id: string }
  | { type: "signal"; id: string }
  | { type: "image"; id: string };
```

MVP 可以不在 UI 展示 refs，但**必须存储**以满足可解释性与调试。


## 3. 数据结构（建议 Schema，统一并补全）

### 3.1 Note / Node（ProseMirror/Tiptap）
- `paragraph` attrs：`id`, `signalTag?: SignalTag`
- `heading` attrs：`id`, `level`
- `card` attrs：`id`, `cardType`, `collapsed`, `meta`, `parentCardId?`, `anchor`（至少 `node_id`）

```ts
type SignalTag = "Body" | "Thought" | "AI_Conversation" | "Reference";

type Anchor = {
  node_id: string;
  range?: { start: number; end: number }; // 可选增强
};

type CardMeta = {
  createdByEventId?: string;
  question?: string;
  answer_markdown?: string;
  takeaway_sentence?: string;
  key_points?: string[];
  open_loops?: string[];
  sources?: Array<{ title?: string; url?: string; ref?: EvidenceRef }>; // ref 可回链
  relatedCardIds?: string[];
  evidence_refs?: EvidenceRef[];
  kind?: "multi_card" | "daily_review" | "session";
};
```

### 3.2 EventLog（统一事件模型）

```ts
type EventLog = {
  event_id: string;
  user_id: string;
  timestamp_ms: number; // 单调或系统时钟，需统一
  note_id?: string;
  anchor?: Anchor;
  event_type: string;
  payload?: Record<string, unknown>;
};
```

**EventLog 的职责边界**
- 记录“用户交互/系统生成”的事实
- 为目录轨道、回顾聚合、调试溯源提供依据
- 不作为业务状态唯一来源（状态建议仍落到 cards/notes/takeaways 表）

### 3.3 TakeawayCandidate（结算层对象）

```ts
type TakeawayCandidate = {
  takeaway_id: string;
  user_id: string;
  date: string; // YYYY-MM-DD in user timezone
  created_at_ms: number;
  source_type: "card" | "session" | "web_clip" | "manual";
  source_id: string;
  text: string; // <= 200 chars（建议 UI 约束）
  topic?: string;
  embedding?: number[]; // 可选
  weight: number;
  evidence_refs: EvidenceRef[];
  status: "active" | "archived" | "rejected";
};
```

### 3.4 Session / Signal / Transcript（会话层，可选）

```ts
type Session = {
  session_id: string;
  user_id: string;
  started_at_ms: number;
  ended_at_ms?: number;
  source?: "meeting" | "study" | "walk" | string;
  created_note_id?: string;
  audio_uri?: string;
  asr_provider?: string;
  language?: string;
};

type SessionSignal = {
  signal_id: string;
  session_id: string;
  timestamp_ms: number;
  type:
    | "HIGHLIGHT"
    | "CONFIRM"
    | "QUESTION"
    | "ACTION_ITEM"
    | "OBJECTION"
    | "TOPIC_SHIFT"
    | "BOOKMARK";
  source: "hotkey" | "voice" | "ui";
  payload?: Record<string, unknown>;
};

type TranscriptSegment = {
  segment_id: string;
  session_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  speaker?: string;
  confidence?: number;
  is_focus?: boolean;
};
```

### 3.5 外部依赖（接口纳入而非全量合并）
- **RECNote**：提供 `audioAnchor`（block 级 offsetMs），用于回放定位与 Timeline Evidence。
- **Intelligent Snapshotting**：提供 `image_id`、`highlight_id` 与 OCR 证据链 refs（EvidenceRef.type = "image"）。


## 4. Event Types（统一枚举 + 冲突修复）

> 原文存在“Summary 生成”“Daily Review 生成”“Takeaway 生成”等事件分散命名。本文统一为：
> - **事实事件**（用户或系统行为）进入 EventLog
> - **产物对象**（card/takeaway/review）落到业务表，同时写一条对应事件

### 4.1 Note / Node
- `NOTE_CREATED`
- `NOTE_UPDATED`（可选，避免过量；建议只记录关键变更）
- `PARAGRAPH_CREATED`

### 4.2 SignalTag（段落来源标签）
- `SIGNALTAG_ASSIGNED`（自动）
- `SIGNALTAG_CHANGED`（手动）

### 4.3 Cards
- `CARD_CREATED`（payload: card_id, cardType）
- `CARD_TOGGLED`（payload: card_id, collapsed->expanded）
- `REFERENCE_CLIPPED`（payload: url, card_id）

### 4.4 AI / Summary
- `AI_ASKED`（payload: question, model?）
- `AI_ANSWERED`（payload: card_id, model?, tokens?）
- `SUMMARY_GENERATED`（payload: summary_card_id, input_card_ids[]）

### 4.5 Open Loops / Actions
- `OPEN_LOOP_MARKED`（payload: ref, text, source=manual|ai）
- `ACTION_ITEM_MARKED`

### 4.6 Takeaways & Reviews
- `TAKEAWAY_CANDIDATE_CREATED`
- `TAKEAWAY_CANDIDATE_UPDATED`（权重/聚类/编辑）
- `TAKEAWAY_PINNED`
- `DAILY_REVIEW_GENERATED`（payload: review_id, date）
- `WEEKLY_REVIEW_GENERATED` / `MONTHLY_REVIEW_GENERATED` / `YEARLY_REVIEW_GENERATED`

### 4.7 Session Signals
- `SESSION_STARTED` / `SESSION_ENDED`
- `SESSION_SIGNAL_CREATED`（payload: signal_id, type）


## 5. UX 输出规范（统一模板）

### 5.1 Daily Review（融合版）
**输出块（推荐固定顺序）**
1) Narrative Summary（时间骨架）
- 以 Timeline Evidence 分镜（上午/下午/晚间 或会议块）
- 每段 1–3 句，避免流水账

2) Top Takeaways（3–7 条，强制上限 7）
- 来自 TakeawayCandidates 聚类与排序
- 每条必须有 `source_id` + `evidence_refs`

3) Open Loops（❓）
- 来自 QUESTION signals + AI 抽取 + 用户手动
- 每条必须可追溯到 evidence_refs

4) Action Items（✅）
- 来自 ACTION_ITEM signals + summary 抽取

5) Resonance（可选/可关闭）
- Query 优先使用：最高权重 takeaway 主题 或 最强 open loop 的困境描述
- 输出短、具体、有来源；禁止鸡汤化

### 5.2 Weekly/Monthly/Yearly（复利聚合）
- Themes（主题）：按“聚类频次 + 权重”
- Progress（进展）：question→conclusion→action 的演化
- Repeated Blockers（重复阻塞）：高频 open loops
- Decisions（决策）：来自 CONFIRM / 决策型时刻
- Next Focus（建议）：1–3 条

### 5.3 Session Summary（Granola 分层输出）
1) Executive Summary（3–7 条）
2) Key Moments（重点片段）
- 每条含时间范围、moment summary、quotes（可折叠）、actions/questions
3) Supporting Notes（非重点强压缩背景）
4) Open Loops & Action Items


## 6. 生成管线（Pipeline，端到端可落地）

### 6.1 Pipeline A：交互后即时结算（轻量）
目标：把高价值交互即时结算为 micro-takeaways，避免日终全文总结。

**A1. On `AI_ANSWERED`**
- LLM 返回结构化：
  - `answer_markdown`
  - `takeaway_sentence`（1 条）
  - `key_points[]`
  - `open_loops[]`（可选）
- 写入 `ai_answer` card
- 创建 1 条 `TakeawayCandidate`（source_type=card）
- 写入 EventLog：`AI_ANSWERED`、`TAKEAWAY_CANDIDATE_CREATED`

**A2. On `SUMMARY_GENERATED`（多卡集成总结）**
- 从 summary 的 key points 拆分 3–5 条 candidates
- `evidence_refs` 包含输入 card_ids（以及必要的 note/node/event）

**A3. 用户手动⭐（可选）**
- `TAKEAWAY_PINNED` → 生成/提升 candidate（source_type=manual，权重最高）

### 6.2 Pipeline B：Session 重点窗口（Granola）
**B1. Focus windows 生成**
- 默认参数（可配置）：
  - `pre_ms = 20000`
  - `post_ms = 60000`
  - `merge_gap_ms = 15000`
  - `max_window_ms = 300000`
- 只用 `HIGHLIGHT` 作为硬触发（QUESTION/ACTION_ITEM 可作为加权但不必生成窗口，避免噪声）

**B2. 差异化转写**
- 阶段 1：全量粗转写（低成本）
- 阶段 2：对 focus windows 二次精转写（高质量）
- 合并：精转写覆盖粗转写对应区间

**B3. 差异化总结**
- focus → Key Moments（细）
- non-focus → Supporting Notes（强压缩）
- 输出 `session_summary` card，并为每个 Key Moment 生成 TakeawayCandidate（高权重）

### 6.3 Pipeline C：日终聚合（重）
1) Load：当天 candidates + timeline + signals + open loops/actions
2) Cluster（MVP）：
- 优先规则：同 topic 字段 / 关键词规则（或仅按来源 card vs session 分组）
- 增强：embedding + 聚类（HDBSCAN/k-means）
3) Rank：
- `weight` 排序；每簇取 top-1（最多 top-2）
- 强制总数 <= 7
4) Compose：生成 Daily Review 五段式输出
5) Persist：写入 daily_review 记录 + 创建 `summary` card（kind=daily_review）并挂载


## 7. Weight Model（补全可执行的 MVP 版本）

### 7.1 权重公式
```text
weight = manual_signal + system_signal + behavior_signal + recency_signal
```

### 7.2 MVP 推荐开关
- **启用**：manual_signal + system_signal + minimal behavior（card 展开次数）
- **默认关闭**：停留时长、窗口标题采集等敏感项

### 7.3 建议权重（给实现的默认值，后续可调参）
> 这里不写绝对数值 W1..W7，避免早期过度调参；实现上用 config 常量。
- manual_signal：pinned/highlight/action/question 明显高于其他来源
- system_signal：summary 生成、focus window key moment 次之
- behavior_signal：展开次数仅作 tie-breaker（同主题里微调）
- recency_signal：弱（仅在日内主题重复时小幅加成）


## 8. 目录（全息地图 + 标题地图）与过滤器

### 8.1 双栏目录结构
- 左：Holographic Map（事件轨道）
- 右：Title Map（H1-Hn 大纲）
- 顶部过滤器：结构/AI/问题/总结（以及可选：⭐重点/🧠takeaway）

### 8.2 交互规则（统一）
- 过滤器建议为“叠加高亮”而非完全隐藏（保结构感）
- 点击事件标记：滚动至 anchor；若关联 card → 自动展开
- 遗留问题来源：
  - 用户显式标记
  - 或 AI 在总结中抽取（需可确认后入库，避免污染）

### 8.3 位置映射工程要点
- 需要从编辑器获得 anchor 对应 DOM top
- 映射到 0..1 比例渲染轨道
- 文档变化节流/增量更新，避免每次 keypress 重算


## 9. SignalTag（段落标签）统一规则

### 9.1 类型与默认赋值
- `Body`：用户键盘输入
- `Thought`：Whisper Mode 或特定入口/快捷键
- `AI_Conversation`：Ask AI / Resonance / 系统生成内容
- `Reference`：web clip / 引用摘要 / RAG 引用块

### 9.2 手动修正入口（MVP）
- 段落左侧 gutter 图标循环切换（Body→Thought→Reference→Body）
- 快捷键：可选

### 9.3 回溯标注（可选增强）
- Daily Review 生成时做后台辅助 tagging
- 不强制改变前台显示；仅在用户开启“显示标签高亮”时可见


## 10. Resonance（历史共振）— 合规与质量补强

### 10.1 目标对齐
匹配“困境/心境/过程”，不是匹配“成就”。

### 10.2 版权与合规（必须遵守）
- 避免存储受版权保护的长文本
- 优先：公版文本 / 授权素材 / 短摘录+出处 / 事实性转述
- 输出必须带来源字段（可点击查看出处）

### 10.3 质量约束（防鸡汤化）
- 连接句必须引用当天一个具体证据（event/node/card）
- 禁止空泛赞美与套路句
- 输出短、具体；有证据链


## 11. 与 RECNote / Snapshotting 的集成点（接口契约）

### 11.1 RECNote（音频锚点）
- 编辑器 block meta 注入：`audioAnchor { recordingId, offsetMs }`
- 点击 block 可 seek 音频回放
- Daily Narrative 的 Timeline Evidence 可包含：录音段、关键 anchor 点

### 11.2 Snapshotting（图片证据链）
- `image_id` 作为 EvidenceRef（type=image）
- HighlightRecord 绑定 `audio_offset_ms` + `image_id`
- 生成 bullet 纪要时，每条要点必须带 `[ref: image {image_id}]`


## 12. MVP 分期（可执行里程碑）

### MVP-1（基础可用）
- Tiptap 基础编辑器 + node_id + H1-Hn
- Card Node（AI Answer）+ block anchor + toggle
- SignalTag（来源即标签）+ 手动切换
- EventLog 最小集 + 全息地图轨道（最小标记）
- Daily Review（无 Resonance 或简版）

### MVP-2（结算与聚合增强）
- TakeawayCandidate（A 管线）
- 多卡集成总结卡（生成 3–5 candidates）
- Daily Review（Top Takeaways 上限 7、可追溯）
- Resonance（可选/可关闭）

### MVP-3（Granola & 复利）
- Session + Signals + Focus Windows + Session Summary
- Weekly/Monthly/Yearly 基于每日结算聚合
- 目录新增（可选）⭐重点、🧠takeaway 产出点标记


## 13. 验收标准（统一版，可直接写测试用例）

### 13.1 可追溯性
- Daily Review 的每条 Top Takeaway/Open Loop/Action Item 都能回链到至少 1 个 evidence_ref

### 13.2 AI 深交互日
- 用户当天与 AI 连续对话 ≥ 20 分钟并生成多张卡片：
  - Daily Review Top Takeaways 出现“结论类条目”
  - 点击可展开对应 card_ids
  - Top Takeaways 总数 <= 7

### 13.3 Granola 重点窗口
- Session 中触发 ≥ 1 次 HIGHLIGHT：
  - 会后输出包含 Key Moments
  - Key Moments 明显更细；Supporting Notes 明显更短
- 不触发任何 HIGHLIGHT：
  - 输出仍可用，且提示“可用 ⭐ 标注重点以获得更懂你的整理”

### 13.4 目录轨道与过滤
- H1-Hn 可跳转
- 开启 ✨/❓/🧊：
  - 事件轨道高亮对应事件
  - 点击可跳转并展开目标卡片

### 13.5 SignalTag
- 不同入口创建段落，SignalTag 自动正确
- gutter/快捷键修改 tag，EventLog 记录变更


## 14. 开发清单（建议按任务拆解）

### 14.1 数据与契约
- 定义 EvidenceRef/Anchor/SignalTag/CardType 枚举
- 定义 EventLog schema 与事件写入规则
- 定义 TakeawayCandidate 表与状态机（active/archived/rejected）
- 定义 DailyReview 持久化结构（含 evidence_refs）

### 14.2 编辑器与卡片
- Card NodeView（折叠惰性渲染）
- 卡片嵌套父子关系（parent_card_id 或 tree path）
- 选中文本 → Ask AI → 插入 card（block anchor MVP）

### 14.3 目录与轨道
- outline parser（H1-Hn）
- anchor->DOM top 映射与节流更新
- 事件轨道渲染 + 点击跳转 + 自动展开

### 14.4 管线
- Pipeline A（AI_ANSWERED / SUMMARY_GENERATED → candidates）
- Pipeline C（日终聚合：cluster/rank/compose/persist）
- Pipeline B（可选：session focus windows + session summary）

### 14.5 Resonance（可选）
- Anecdote DB（短摘录/事实性转述 + 来源）
- Query 构建与检索
- 生成与安全约束


## 15. 原始来源（溯源链接）
- Eventlog Enhanced PRD（主）：docs/features/Eventlog Enhanced PRD（叙事回顾+Resonance+分形卡片+全息目录+Signal Tag）.md
- 增补：Daily Narrative × Granola Signals × Takeaways：docs/features/Eventlog Enhanced PRD（增补：Daily Narrative × Granola Signals × 全交互 Takeaways 聚合）.md
- 补充：Granola 风格重点标注：docs/features/Eventlog Enhanced PRD（补充：Granola 风格重点标注与分层整理输出）.md
- 相关依赖：RECNote：docs/features/PRD_ RECNote - Intelligent Audio Sync Module.md
- 相关依赖：智能定帧快照：docs/features/PRD 增补：智能定帧快照（会议截图 + 本地录音回溯 + OCR 证据链笔记）.md
