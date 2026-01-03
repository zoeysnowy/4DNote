
# Eventlog Enhanced PRD（增补：Daily Narrative × Granola Signals × 全交互 Takeaways 聚合）

> 本节为对既有 PRD 的增补：将 Granola 风格的“重点窗口（Signals→Focus Windows）”与 Daily/Weekly/Monthly/Yearly 叙事回顾融合；把用户与 4DNote 的全部交互产物（卡片、对话、总结、web clip）结算为可追溯的 Takeaways，并按天/周/月聚合呈现。

---

## 21. 融合目标：从“我做了什么”到“我理解了什么”

### 21.1 目标用户与核心价值
- 工作繁忙的用户：一天过得很快，想知道“今天到底做了什么”，并获得安心感（时间骨架）
- 知识工作者/研究者：想知道“今天理解了什么、有哪些结论可复用”（认知资产）
- 对 AI 深度交互用户：想把长时间 AI cowork 的讨论沉淀为若干条清晰 takeaways（结算机制）

**核心价值主张**
- Daily Narrative 提供时间轴叙事（Timeline）
- Signals/行为权重让总结“重点分明、懂我”（Focus）
- 所有交互产物被结算为 takeaways（Assetization）
- 周/月总结在“每日结算”的基础上复利增长（Compounding）

---

## 22. 统一证据模型（Evidence）：Daily Narrative 的输入

Daily/Weekly 等回顾不再直接读“整篇笔记”，而是读三类证据，提升可解释性与压缩效率。

### 22.1 Evidence Types
1) **Timeline Evidence（时间骨架）**
- 日程块（可选集成 Calendar）
- Session 时间轴（录音/会议/学习段）
- 关键时间点（Signal timestamps）

2) **Interaction Evidence（交互证据）**
- Ask AI（提问/追问）
- Card toggles（展开/折叠）
- Multi-select summarize（多卡总结）
- Web clip / 引用插入
- Tag change / Open loop mark / Action item mark

3) **Outcome Evidence（产物证据）**
- AI Answer cards（含结构化摘要）
- Summary cards（集成式总结卡）
- Resonance cards
- Web clips（含来源）
- 用户手写结论段落（Body/Thought）

### 22.2 证据与可追溯性要求
- 每条 Evidence 必须可回链到：
  - `note_id`, `node_id` 或 `card_id`
  - `event_id`（EventLog）
  - `session_id`（如适用）
- 回顾输出需保留内部 `evidence_refs`（MVP 可不展示给用户，但必须存储）

---

## 23. 新增：Takeaway Capture（交互结算层）

### 23.1 为什么需要 Takeaway Capture
若仅在每天结束时对全文总结：
- token 成本高
- 结构不稳定
- 重点不明（尤其是长对话）

因此新增“结算层”：将每次重要交互产出**micro-takeaways**，日终再聚合为**daily takeaways**。

### 23.2 新对象：TakeawayCandidate（候选收获）
> 可单独表，也可作为 `cards.meta.takeaway` 存储（建议单独表便于聚合）。

**TakeawayCandidate schema（建议）**
- `takeaway_id` (uuid)
- `user_id`
- `date` (YYYY-MM-DD, user timezone)
- `source_type`：`card` | `session` | `web_clip` | `manual`
- `source_id`：card_id/session_id/…
- `created_at`
- `text`：一句话结论（<= 200 chars）
- `topic`：可选（主题字符串或 topic_id）
- `embedding`：可选（用于聚类）
- `weight`：数值权重（见 24）
- `evidence_refs`：`[{type, id}]`（node/card/event）
- `status`：`active` | `archived` | `rejected`（用户可删）

### 23.3 触发时机（低摩擦、自动化优先）
系统在以下事件结束时自动生成 TakeawayCandidate：

1) `AI_ANSWERED` → 生成 1 条
- 由模型返回 `answer + takeaway_sentence + key_points[]`
- takeaway 作为短句写入 candidates

2) `SUMMARY_GENERATED`（多卡集成总结卡）→ 生成 3–5 条
- 从 summary 的 key points 拆分为多条 candidates
- `evidence_refs` = 输入 card_ids

3) `SESSION_ENDED`（Granola 风格）→ 生成若干条
- focus windows → Key Moments → 每个 moment 1 条 candidate（高权重）
- non-focus → Supporting Notes → 可生成 0–2 条低权重候选（可选）

4) 用户手动标记（可选）
- 在段落/卡片上点 ⭐ “Add to daily takeaways”
- 生成 `source_type=manual` candidate（权重最高）

---

## 24. 重点分明的实现：Weight Model（Signals + 行为）

### 24.1 权重来源（不依赖语义也能有效）
`weight = manual_signal + system_signal + behavior_signal + recency_signal`

- **manual_signal（强）**
  - `HIGHLIGHT`：+W1
  - `ACTION_ITEM`：+W2
  - `QUESTION`：+W3
- **system_signal（中）**
  - 来自 focus window 的 Key Moment：+W4
  - 来自 multi-card summary：+W5
- **behavior_signal（中）**
  - card 展开次数、停留时长、二次追问次数、被引用次数：+W6…
- **recency_signal（弱）**
  - 临近日终/连续出现主题：+W7（可选）

> MVP 建议仅启用 manual_signal + system_signal + minimal behavior_signal（展开次数），避免隐私争议与实现成本。

### 24.2 Granola Signals 融入
- Signals 产生 focus windows
- focus windows 内的 transcript segments / key moments 自动获得高权重
- 用户未记录/未标记时段 → 默认低权重，仅简要概括

---

## 25. Daily Narrative（融合版）输出规范

### 25.1 Daily Review 模板（更新）
1) **Narrative Summary（时间骨架）**
- 以 Timeline Evidence 分镜（如：上午/下午/晚间 或会议块）
- 每段 1–3 句，避免流水账

2) **Top Takeaways（结算后收获，3–7 条）**
- 来自 TakeawayCandidates 聚类与排序
- 每条可点开查看来源（card/session/clip）

3) **Open Loops（❓）**
- 来自 QUESTION signals + AI 抽取
- 每条必须可追溯到 evidence_refs

4) **Action Items（✅）**
- 来自 ACTION_ITEM signals + summary 抽取
- 可一键转为任务（后续）

5) **Resonance（可选）**
- Resonance query 优先使用：
  - Top Takeaways 中权重最高的主题
  - 或最强 open loop 的困境描述
- 输出短、具体、有来源

### 25.2 关键约束
- **Top Takeaways 必须有上限**（默认 7）
- 每条 takeaway 必须带 `source_id`（至少一个）
- focus windows 的内容默认更细；非重点只做背景补充

---

## 26. Weekly/Monthly/Yearly：基于“每日结算”的复利聚合

### 26.1 聚合输入
- 每日的 `Top Takeaways`（或全量 candidates）
- 每日 `Open Loops / Action Items`
- 每日 `Resonance themes`（可选）

### 26.2 输出结构（建议）
- **Themes（主题）**：top topics（按聚类频次+权重）
- **Progress（进展）**：主题从 question→conclusion→action 的演化
- **Repeated Blockers（重复阻塞）**：高频 open loops
- **Decisions（决策）**：从 CONFIRM/决策型时刻抽取
- **Next Week Focus（建议）**：1–3 条

---

## 27. 目录与呈现：把 Takeaways “可导航化”

### 27.1 全息地图新增标记（可选）
- ⭐ 重点时刻（HIGHLIGHT/Key Moment）
- 🧠 Takeaway 产出点（生成 candidate 的 anchor）
- 🧊 Summary 生成点
- ❓ Open Loop

### 27.2 “Takeaways by Day” 视图（建议新入口）
- 类似日历/列表：每一天显示 3 条 takeaway 预览
- 点击进入该日 Daily Review（可展开来源卡片）
- 这是用户“兴奋感”的主要触发器（我每天都在变强）

---

## 28. 技术实现（Copilot 执行要点）

### 28.1 新增/更新事件（EventLog）
- `TAKEAWAY_CANDIDATE_CREATED`
- `TAKEAWAY_CANDIDATE_UPDATED`（重算权重/聚类）
- `DAILY_REVIEW_GENERATED`（附 evidence_refs）
- `TAKEAWAY_PINNED`（用户手动⭐）

### 28.2 生成管线（pipeline）更新

**Pipeline A：交互后即时结算（轻量）**
- On `AI_ANSWERED`：
  - LLM 输出结构化：
    - `answer_markdown`
    - `takeaway_sentence`
    - `key_points[]`
    - `open_loops[]`（可选）
  - 写入 card + 生成 TakeawayCandidate（1 条）

- On `SUMMARY_GENERATED`：
  - 从 summary 产生多条 candidates（3–5）
  - `evidence_refs = input_card_ids`

**Pipeline B：日终聚合（重）**
1) Load：当天 candidates + timeline + signals + open loops
2) Cluster：按 embedding 或主题规则聚类
3) Rank：按 weight 排序，每簇取 top-1 或 top-2
4) Compose：生成 Narrative + Top Takeaways + Open Loops + Actions + Resonance
5) Persist：写入 daily_review 记录 + summary card（挂载）

### 28.3 聚类策略（MVP 与增强）
- MVP：规则聚类（topic 字段 + 关键词）或仅按来源分组（session vs cards）
- 增强：embedding 聚类（HDBSCAN/k-means）+ rerank

### 28.4 成本与隐私
- 不必采集“停留时长”即可做出重点分明体验：  
  先依赖 signals + 生成事件（summary/ask）即可。
- 若启用行为信号（展开次数/停留时长）：
  - 在设置中明确说明
  - 支持关闭
  - 本地聚合后仅上传统计值（可选）

---

## 29. 验收标准（补充）

- 用户当天与 AI 连续对话 ≥ 20 分钟并生成多张卡片：
  - Daily Review 的 Top Takeaways 中能出现“市场信息结论”类条目
  - 且每条可追溯到具体 card_ids（点击可展开原卡片）
- 若用户在 Session 中多次 ⭐HIGHLIGHT：
  - Daily Narrative 中对应时间段更细、非重点更简
- 关闭 Resonance：
  - Daily Review 仍完整可用
- Top Takeaways 数量受控（<=7），信息密度高于正文流水回顾

