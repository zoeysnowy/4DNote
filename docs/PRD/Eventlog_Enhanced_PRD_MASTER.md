---
title: Eventlog Enhanced — Master PRD
purpose: Development-facing, MECE integrated PRD
status: Active
last_updated: 2026-01-03
---

# Eventlog Enhanced — Master PRD（开发主文档 / MECE 整合版）

> 本文将以下分散 PRD 的内容**完整、MECE**地整合为一份“可开发实践”的主文档，并补齐原文未覆盖/冲突/可改进之处：
> - 叙事回顾 + Resonance + 分形卡片 + 全息目录 + Signal Tag
> - 增补：Daily Narrative × Granola Signals × 全交互 Takeaways 聚合
> - 补充：Granola 风格重点标注与分层整理输出
> - 相关依赖接口：RECNote（音频锚点）、智能定帧快照（截图证据链）

本文重点是“开发可执行”：明确背景、目标、范围、功能与用途；统一术语/数据结构/事件；给出管线与验收；并提供来源覆盖矩阵以便审计。


## 1. 背景与问题（Why）

### 1.1 用户痛点（来自主 PRD）
- 想写日记/笔记，但维护成本高，常常只剩“碎碎念”。
- 信息碎片化（工作/学习/生活/研究/会议混杂），难以回顾与检索。
- 情绪/困境重复出现时，传统关键词搜索无法定位相似时刻。
- 与 AI 的长对话产出很多内容，但沉淀困难，难以复用。

### 1.2 机会点（来自主 PRD + 增补）
- 以“事件（Event）+ 段落（Node）+ 卡片（Card）”为基本单元，建立可追溯（anchored）与可折叠（toggle）的知识结构。
- 通过叙事体回顾（Daily/Weekly/Monthly/Yearly）降低回顾门槛，提高阅读意愿。
- 引入 Granola 式“时间戳重点”机制，用极低成本捕捉高信息密度片段，实现“重点分明、懂我”。
- 引入 Takeaway Capture（结算层）：将每次重要交互即时结算为 micro-takeaways，日终再聚合，降低 token 成本并提升稳定性。

### 1.3 核心价值主张（来自增补 21）
- Daily Narrative 提供时间轴叙事（Timeline）。
- Signals/权重让总结重点分明（Focus）。
- 全部交互产物被结算为 takeaways（Assetization）。
- 周/月总结基于每日结算复利增长（Compounding）。


## 2. 目标、范围与非目标（What / What not）

### 2.1 目标（汇总三份 PRD）
1) 低门槛记录：段落标签 + 卡片折叠 + 事件轨道，让“碎碎念”也可长期累积。
2) 可回顾：Daily/Weekly/Monthly/Yearly 叙事体回顾。
3) 可追溯：回顾输出必须能回链到 evidence_refs（MVP 可不展示但必须存储）。
4) 重点分明：Granola 风格 focus windows + 分层输出（Key Moments 更细、Supporting Notes 更简）。
5) 可沉淀：TakeawayCandidates（micro）→ Daily Top Takeaways（macro）。
6) 可共鸣（可选）：Resonance 历史共振卡，基于“困境/心境/过程”匹配。

### 2.2 非目标（来自主 PRD + 增补风险）
- 不做 Notion 式全能数据库。
- 不做复杂权限协作/多人实时协作。
- 不承诺完全自动化正确分类（SignalTag 默认以来源即标签为准）。
- MVP 不依赖停留时长等敏感行为数据；如启用必须可关闭并有说明。

### 2.3 成功标准（Success Metrics，补全）
- 日回顾可读性：Top Takeaways 数量受控（<=7），且能覆盖当日关键结论。
- 可追溯性：Top Takeaways/Open Loops/Action Items 100% 具备 evidence_refs。
- 成本：日终聚合不需要反复全文总结（优先复用即时结算产物）。
- Granola 体验：有 HIGHLIGHT 时重点更细、无 HIGHLIGHT 时仍可用。


## 3. 目标用户与典型场景（Who / Use cases）

### 3.1 目标用户（来自增补 21）
- 工作繁忙：需要“我今天做了什么”的安心感（时间骨架）。
- 知识工作者/研究者：需要“我今天理解了什么”的认知资产。
- 深度 AI 交互用户：需要把长对话结算为可追溯的 takeaways。

### 3.2 核心用户故事（MECE 划分）
U1. 记录与沉淀：选中文本发起 Ask AI → 生成回答卡 → 折叠可读 → 产生 micro-takeaway。
U2. 组织与导航：双栏目录 + 全息事件轨道定位 “AI/问题/总结”。
U3. 日终回顾：基于 evidence 聚合生成 Daily Review（叙事 + takeaways + loops + actions + 可选 resonance）。
U4. 会话重点：会议/录音过程中用快捷键/语音 cue 打点 → focus windows → 会后生成分层 Session Summary。
U5. 长期复利：Weekly/Monthly/Yearly 基于每日结算聚合，输出主题/进展/阻塞/决策。


## 4. 功能总览（MECE）

> 说明：下面的功能分组满足互斥且完备（MECE），每一组都能对应到 EventLog 与数据结构。

F1. 笔记结构与卡片（Fractal Cards）
F2. 段落 SignalTag（来源即标签）
F3. 目录与导航（全息地图 + 标题地图 + 过滤器）
F4. EventLog 与 Evidence（可追溯基础设施）
F5. Takeaway Capture（交互即时结算）
F6. Reviews（Daily/Weekly/Monthly/Yearly 叙事回顾）
F7. Resonance（历史共振卡，可选）
F8. Sessions & Granola Signals（重点窗口 + 分层输出）
F9. 外部依赖接口（RECNote 音频锚点 / Snapshotting 截图证据链）


## 5. 统一术语与对象模型（Glossary / Data model overview）

> 冲突修复：原文的“Signal Tag（段落类型）”与“Signals（会话时间戳信号）”必须强制区分。

### 5.1 Document Layer（文档层）
- Note：一篇笔记文档（ProseMirror/Tiptap JSON）。
- Node：文档内块节点（paragraph/heading/card 等），每个 node 必须有稳定 node_id。
- Anchor：定位信息。
  - Block anchor（MVP 推荐）：仅绑定到 node_id。
  - Range anchor（可选增强）：node_id + start/end offset。

### 5.2 Card Layer（卡片层）
- Card：挂载在 Note 中的 block node（NodeView），支持折叠/展开与递归嵌套。
- CardType（统一枚举）：ai_answer / summary / resonance / reference / session_summary。

### 5.3 SignalTag（段落标签，来源标签）
- Body / Thought / AI_Conversation / Reference。

### 5.4 Session Signals（会话信号，带时间戳意图）
- HIGHLIGHT / CONFIRM / QUESTION / ACTION_ITEM / OBJECTION / TOPIC_SHIFT / BOOKMARK。

### 5.5 Evidence（证据输入统一模型，来自增补 22）
1) Timeline Evidence（时间骨架）
2) Interaction Evidence（交互证据）
3) Outcome Evidence（产物证据）

### 5.6 Takeaway & Review
- TakeawayCandidate：micro-takeaway（交互即时结算）。
- DailyReview：日终聚合产物。
- Weekly/Monthly/Yearly：基于每日结算复利聚合。


## 6. 功能规格（详细 / Requirements）

### F1. 笔记结构与卡片（Fractal Cards）

#### F1.1 Ask AI → AI Answer Card（来自主 PRD 功能 2）
- 选中文本 → Ask AI → 生成 ai_answer 卡片挂载在锚点位置。
- 卡片默认折叠，显示 1 行摘要；展开显示 question/answer/来源。
- 卡片内允许再次提问并生成子卡片（递归），保持父子关系可追溯。

#### F1.2 多卡集成总结卡（来自主 PRD 功能 2 + 增补 23）
- 用户多选卡片 → Summarize selection → 生成 summary 卡片。
- summary 必须记录输入 card_ids，并为每条要点提供 evidence_refs。
- summary 生成后拆分 3–5 条 TakeawayCandidate（见 F5）。

#### F1.3 性能约束（来自主 PRD 风险）
- 默认折叠惰性渲染；展开时按需加载。
- 嵌套深度可无限，但渲染层可做软限制/虚拟化。


### F2. 段落 SignalTag（来源即标签）（来自主 PRD 功能 4）

#### F2.1 类型与默认赋值
- Body：用户键盘输入段落。
- Thought：Whisper Mode 或特定入口创建。
- AI_Conversation：Ask AI / Resonance / 系统生成段落。
- Reference：Web clip / 引用摘要 / RAG 引用块。

#### F2.2 手动修正
- gutter 图标循环切换（Body→Thought→Reference→Body）。
- 修改必须写 EventLog（SIGNALTAG_CHANGED）。

#### F2.3 AI 辅助（可选，来自主 PRD 7.3）
- 仅在 Daily Review 生成时做后台回溯标注；不强制改变前台 UI。


### F3. 目录与导航（来自主 PRD 功能 3）

#### F3.1 双栏目录结构
- 左：全息地图（Holographic Map）事件轨道
- 右：标题地图（Title Map）H1-Hn
- 顶部过滤器：结构/AI/问题/总结（可后续加 ⭐重点、🧠takeaway）

#### F3.2 行为规则
- 过滤器建议“叠加高亮”而非完全隐藏。
- 点击事件标记：滚动到 anchor；若关联卡片则自动展开。

#### F3.3 工程要点
- 事件轨道需要 anchor→DOM top 映射；变更节流更新。


### F4. EventLog 与 Evidence（可追溯基础设施，来自主 PRD 功能 8 + 增补 22）

#### F4.1 EventLog 作用
- 渲染全息地图事件轨道。
- 作为 Reviews/Takeaways 的可解释输入。
- 支持“回顾输出→证据链”调试与审计。

#### F4.2 EvidenceRefs（必须落库）
所有生成输出（takeaway/open loop/action/resonance连接句）必须携带 evidence_refs。

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


### F5. Takeaway Capture（交互即时结算层，来自增补 23）

#### F5.1 TakeawayCandidate 对象
- 存储方式：建议独立表；也可先放 cards.meta.takeaway，但会影响聚合与查询效率。

#### F5.2 触发时机（低摩擦、自动化优先）
1) AI_ANSWERED → 生成 1 条 candidate（来自 answer 的 takeaway_sentence）。
2) SUMMARY_GENERATED → 拆分 3–5 条 candidates（来自 key_points）。
3) SESSION_ENDED → focus windows 的每个 Key Moment 生成 1 条候选（高权重）。
4) 用户手动⭐ → 生成/提升 candidate（权重最高）。

#### F5.3 权重模型（来自增补 24，补足实现约束）
- weight = manual_signal + system_signal + behavior_signal + recency_signal。
- MVP 建议仅启用 manual_signal + system_signal + minimal behavior（展开次数）。


### F6. Reviews：Daily/Weekly/Monthly/Yearly（来自主 PRD 功能 1 + 增补 25/26）

#### F6.1 Daily Review 输出模板（融合版）
1) Narrative Summary（时间骨架）：按 Timeline Evidence 分镜，每段 1–3 句。
2) Top Takeaways（3–7 条，强制上限 7）：来自 candidates 聚类与排序。
3) Open Loops（问题）：来自 QUESTION signals + AI 抽取 + 用户标记。
4) Action Items（待办）：来自 ACTION_ITEM signals + summary 抽取。
5) Resonance（可选）：短、具体、有来源。

#### F6.2 Weekly/Monthly/Yearly 输出结构
- Themes / Progress / Repeated Blockers / Decisions / Next Focus。


### F7. Resonance（历史共振卡，可选，来自主 PRD 4.4）

#### F7.1 目标
匹配“困境/心境/过程”，不是匹配“成就”。

#### F7.2 检索与内容格式
- 轶事库（Anecdote DB）：每条包含人物/主题/情绪/困境标签、短摘录或事实性转述、来源信息。
- Query：由当日最高权重 takeaway 主题或最强 open loop 构建。
- 输出：1–2 句轶事 + 1 句连接（必须引用用户当日具体证据）+ 可选 1 句建议。

#### F7.3 版权与风险（必须）
- 避免存储受版权保护的长文本。
- 优先公版/授权素材；或短摘录+出处；或事实性转述。


### F8. Sessions & Granola Signals（来自 Granola 补充 + 增补融合）

#### F8.1 Signals 类型与来源
- Signals：HIGHLIGHT/QUESTION/ACTION_ITEM/…（带 timestamp）。
- 来源：全局快捷键 / 语音提示词 / UI 按钮。

#### F8.2 Focus Windows 生成（来自补充 17.2）
- 默认窗口：[t-20s, t+60s]；相邻窗口 gap < 15s 合并；最大 5min。
- TOPIC_SHIFT 可强制切段。

#### F8.3 分层输出（Session Summary）
- Executive Summary（3–7 条）
- Key Moments（重点片段，带时间范围 + quotes/actions/questions）
- Supporting Notes（非重点强压缩）
- Open Loops & Action Items


### F9. 外部依赖接口（RECNote / Snapshotting）

#### F9.1 RECNote（来自 RECNote PRD 2.2）
- 编辑器 block meta 注入 audioAnchor：recordingId + offsetMs。
- 点击 block 可 seek 音频回放；可作为 Timeline Evidence。

#### F9.2 智能定帧快照（来自 Snapshotting PRD）
- 不录屏，只在变化时截图；每条要点可引用 image_id。
- highlight 必须绑定 audio_offset_ms + image_id。
- OCR 作为 Outcome Evidence，并保持 image_id 可回链。


## 7. 数据结构与事件（统一枚举）

### 7.1 ID、时间与时区（补全）
- note_id/node_id/card_id/event_id/session_id/signal_id/takeaway_id：UUID（推荐 v4/v7）。
- image_id：推荐可读时间戳（YYYYMMDDHHmmssSSS）或 Unix ms。
- 所有日/周/月聚合必须以 user timezone 为准；TakeawayCandidate.date 使用 YYYY-MM-DD。

### 7.2 EventLog（字段最小集合，来自主 PRD 8.2）
```ts
type EventLog = {
  event_id: string;
  user_id: string;
  timestamp_ms: number;
  note_id?: string;
  anchor?: { node_id: string; range?: { start: number; end: number } };
  event_type: string;
  payload?: Record<string, unknown>;
};
```

### 7.3 事件类型（合并与命名冲突修复）
- NOTE_CREATED / PARAGRAPH_CREATED
- SIGNALTAG_ASSIGNED / SIGNALTAG_CHANGED
- AI_ASKED / AI_ANSWERED
- CARD_CREATED / CARD_TOGGLED / REFERENCE_CLIPPED
- SUMMARY_GENERATED
- OPEN_LOOP_MARKED / ACTION_ITEM_MARKED
- TAKEAWAY_CANDIDATE_CREATED / TAKEAWAY_CANDIDATE_UPDATED / TAKEAWAY_PINNED
- DAILY_REVIEW_GENERATED / WEEKLY_REVIEW_GENERATED / MONTHLY_REVIEW_GENERATED / YEARLY_REVIEW_GENERATED
- SESSION_STARTED / SESSION_ENDED / SESSION_SIGNAL_CREATED


## 8. 生成管线（Pipelines，来自主 PRD 9.4 + 增补 28）

### 8.1 Pipeline A：交互后即时结算（轻量）
- On AI_ANSWERED：写入 card + 生成 1 条 TakeawayCandidate。
- On SUMMARY_GENERATED：拆分 3–5 条 candidates，evidence_refs=输入 card_ids。

### 8.2 Pipeline B：Session 重点窗口与分层输出
- Focus windows → 标记 transcript segments → 生成 session_summary。
- Key Moments 生成高权重 candidates。

### 8.3 Pipeline C：日终聚合（重）
1) Load：当天 candidates + timeline + signals + open loops/actions。
2) Cluster：MVP 用规则聚类（topic/关键词/来源分组）；增强用 embedding 聚类。
3) Rank：按 weight，每簇取 top-1（最多 top-2），强制总数<=7。
4) Compose：生成 Daily Review 五段式。
5) Persist：写入 daily_review 记录 + summary card（kind=daily_review）。


## 9. 验收标准（汇总并增强）

### 9.1 可追溯性（硬标准）
- Daily Review 中每条 Top Takeaway/Open Loop/Action Item 都有 evidence_refs（至少 1 条）。

### 9.2 AI 深交互日（来自增补 29）
- 当天与 AI 连续对话 ≥ 20 分钟并生成多张卡片：
  - Top Takeaways 出现结论类条目
  - 每条可追溯到 card_ids
  - Top Takeaways 总数<=7

### 9.3 Granola 重点窗口（来自补充 20）
- 触发 ≥1 次 HIGHLIGHT：输出包含 Key Moments，且明显更细；Supporting Notes 更短。
- 0 次 HIGHLIGHT：输出仍可用，并提示可用 ⭐ 标注重点。

### 9.4 目录与过滤（来自主 PRD 11.3）
- H1-Hn 渲染与跳转正确。
- 开启 ✨/❓/🧊：事件轨道高亮；点击可跳转并展开。

### 9.5 SignalTag（来自主 PRD 11.4）
- 不同入口创建段落自动赋值；手动切换写入 EventLog。


## 10. 里程碑（与原文一致，结构化重述）

MVP-1
1) 基础编辑器（Tiptap）+ 段落 id + H1-Hn
2) AI card + 块级锚定 + toggle
3) EventLog + 全息地图轨道（最小标记）
4) SignalTag（来源即标签）+ 目录过滤
5) Daily Review（无 Resonance 或简版）

MVP-2
6) 多卡集成总结卡 + TakeawayCandidate（即时结算）
7) Resonance（轶事库 + 向量检索 + 卡片生成，可开关）

MVP-3
8) Session + Signals + Focus Windows + 分层 Session Summary
9) Weekly/Monthly/Yearly（模式洞察）


## 11. 来源覆盖矩阵（确保 MECE 整合）

> 目的：逐条证明“分散 PRD 的内容都被纳入主文档”。

### 11.1 Eventlog Enhanced PRD（叙事回顾+Resonance+分形卡片+全息目录+Signal Tag）
- 背景/问题/机会点 → 本文 1.1/1.2
- Daily/Weekly/Monthly/Yearly + Resonance → 本文 F6/F7
- 分形卡片 + 多卡总结卡 → 本文 F1
- 双栏目录 + 过滤器 + 全息地图 → 本文 F3
- SignalTag（段落标签）→ 本文 F2
- EventLog（事件模型/字段/用途）→ 本文 F4 + 7.2/7.3
- 风险/验收/里程碑 → 本文 9/10

### 11.2 增补：Daily Narrative × Granola Signals × 全交互 Takeaways 聚合
- Evidence Types + 可追溯要求 → 本文 5.5 + F4.2
- TakeawayCandidate schema + 触发时机 → 本文 F5
- Weight Model → 本文 F5.3
- Daily Review 融合模板 + 约束（<=7）→ 本文 F6.1 + 9.2
- Weekly/Monthly/Yearly 基于每日结算复利 → 本文 F6.2
- 新事件类型（TAKEAWAY/DAILY_REVIEW）→ 本文 7.3
- 聚类策略（MVP vs 增强）→ 本文 8.3

### 11.3 补充：Granola 风格重点标注与分层整理输出
- Session/Signals 概念模型 → 本文 5.4 + F8
- 快捷键/语音 cues 设计与误触策略 → 本文 F8.1
- Focus Windows 算法与参数 → 本文 F8.2
- 差异化转写/总结与分层输出模板 → 本文 F8.3 + 8.2
- 目录轨道新增标记与集成点 → 本文 F3 + F8
- 验收标准（有/无 HIGHLIGHT）→ 本文 9.3

### 11.4 相关依赖（接口）
- RECNote 音频锚点 → 本文 F9.1
- 智能定帧快照（image_id 证据链）→ 本文 F9.2


## 12. 原始来源链接（溯源）
- 主 PRD：../features/Eventlog Enhanced PRD（叙事回顾+Resonance+分形卡片+全息目录+Signal Tag）.md
- 增补：../features/Eventlog Enhanced PRD（增补：Daily Narrative × Granola Signals × 全交互 Takeaways 聚合）.md
- Granola 补充：../features/Eventlog Enhanced PRD（补充：Granola 风格重点标注与分层整理输出）.md
- 依赖：../features/PRD_ RECNote - Intelligent Audio Sync Module.md
- 依赖：../features/PRD 增补：智能定帧快照（会议截图 + 本地录音回溯 + OCR 证据链笔记）.md

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
