
# Eventlog Enhanced PRD（补充：Granola 风格重点标注与分层整理输出）

> 本节为对既有 PRD 的增补：引入 Granola 式“时间戳驱动的重点”机制，并提供快捷键/语音提示词来降低标注成本；同时将其融入 Event/Session/Signals 分层与 Daily/Weekly 回顾输出。

---

## 13. 新增能力：Granola 风格“重点标注”与分层整理输出

### 13.1 背景与目标

**Granola 的关键体验**
- 用户在会议/记录过程中，偶尔会敲几句话或写几个点。
- 系统把这些“用户主动写下来的时间点”视为**重要锚点**（重要信息密度更高），对这些时间段进行更细粒度听写与整理。
- 用户没有记录的时间段，被视为“低优先级”，只做简要概括或跳过。
- 最终笔记呈现为“重点分明、很懂我”，且成本极低。

**我们要达成的目标**
- 在 4DNote 的音频/会话场景中：  
  用 **用户行为信号（timestamped signals）** 自动推断“重点窗口”，实现**差异化转写与差异化总结**。
- 在非会议场景（普通笔记/学习/碎碎念）中：  
  用快捷键/语音提示词让用户以极低成本“点亮重点”，并贯穿后续总结、目录过滤、Resonance。

---

## 14. 概念模型扩展：Event / Session / Signals（重点信号）

### 14.1 Session（会话）定义
Session = 一段连续记录过程（会议、学习、散步语音碎碎念），包含：
- 音频流（可选）
- 实时转写（ASR）
- 用户手动笔记输入
- Signals（重点/确认/疑问等标记）

### 14.2 Signals 类型（新增/扩展）
Signals 是用户在 Session 中发出的、具备时间戳的“意图/强调”信息，用于驱动“重点窗口”。

**建议 SignalType：**
- `HIGHLIGHT`：这是重点（我想记住/需要详细记录）
- `CONFIRM`：确认/同意（用于归纳决策）
- `QUESTION`：这是个问题/待确认点
- `ACTION_ITEM`：待办/行动项
- `OBJECTION`：反对/风险/疑虑
- `TOPIC_SHIFT`：话题切换（分段）
- `BOOKMARK`：纯书签（稍后回听）

> 这些 Signals 可映射到你既有的目录过滤（❓/🧊/✨）与 Open Loops。

### 14.3 Signal 的来源（低摩擦优先）
- **键盘快捷键（全局）**：不切换窗口即可打点
- **语音提示词（voice cue）**：比如“嗯哼”“Yes”“重点”“记一下”等
- **UI 按钮**：录音浮窗一个“⭐重点”按钮

**原则：来源即标签（Origin-based），尽量不依赖语义猜测。**

---

## 15. 用户体验设计：重点窗口（Focus Window）与“懂我”的输出

### 15.1 核心机制：重点窗口（Focus Window）
当捕获到一个 Signal（尤其是 `HIGHLIGHT`），系统在该时间戳周围定义一个窗口：
- 默认窗口：`[t - 20s, t + 60s]`（可配置）
- 若连续多次 HIGHLIGHT（例如 30 秒内 2 次），窗口合并并扩大上限（例如最大 5 分钟）
- 若出现 `TOPIC_SHIFT`，窗口可在该点强制切分段落

**输出策略：**
- **重点窗口**：更高 ASR 精度/更细粒度分段/保留更多原话、术语、数字、结论
- **非重点窗口**：更强压缩（1–2 句概括每段）、可跳过寒暄/重复内容

> 这就是 Granola 的“重点听写整理 + 非必要简要整理”。

### 15.2 Granola 级分层笔记输出（建议模板）
对一个 Session 输出一份“分层”笔记，结构如下：

1) **Executive Summary（1 屏内）**
- 3–7 条结论/决定/关键进展（强制短）

2) **Key Moments（重点片段）**
- 按时间列出 HIGHLIGHT 窗口对应的段落
- 每个片段包含：
  - 时间戳范围（例如 12:03–12:05）
  - 1 句“发生了什么”
  - 关键原话/数据（可折叠）
  - 相关 Action Items / Questions（可折叠）
  - 关联到文档内锚点（可跳转）

3) **Supporting Notes（简要背景）**
- 对非重点窗口按话题分段概括（更少字）

4) **Open Loops & Action Items**
- 自动抽取并结构化（可一键写入任务系统/你的 TODO 卡）

---

## 16. 快捷键与语音提示词：简化重点标注逻辑

### 16.1 全局快捷键（建议）
> 目标：用户在任何窗口都能打点，不需要回到 4DNote。

- `Ctrl/Cmd + Shift + H`：插入 `HIGHLIGHT`（⭐重点）
- `Ctrl/Cmd + Shift + Q`：插入 `QUESTION`（❓问题）
- `Ctrl/Cmd + Shift + A`：插入 `ACTION_ITEM`（✅待办）
- `Ctrl/Cmd + Shift + M`：插入 `TOPIC_SHIFT`（↔话题切换）
- `Ctrl/Cmd + Shift + B`：插入 `BOOKMARK`

**实现注意**
- 桌面端需要全局热键（Electron/原生）支持；Web 仅能在页面焦点内工作
- 记录热键触发时的 `session_id + timestamp + active_note_id? + context` 写入 EventLog

### 16.2 语音提示词（Voice Cues）设计
你提出的“嗯哼 / Yes”很好，但要解决两件事：
1) 这些词在自然对话中出现频率高，易误触  
2) 多语言与口音鲁棒性

**建议采用“两级体系”**
- **一级：显式触发词（低误触，推荐）**
  - “记一下”“重点”“bookmark”“question”
  - 或用户自定义关键词（建议提供 3–5 个 slot）
- **二级：弱信号词（高频词，仅作加权，不作为硬触发）**
  - “嗯哼”“对”“Yes”“Exactly”
  - 用于提高“当前句子是结论/确认”的概率，但**不直接生成重点窗口**

**语音 cue 的工程实现（两种）**
- A) **音频关键词唤醒（KWS）**：本地关键词检出（低延迟，不依赖大模型）
- B) **ASR 后文本匹配**：等转写结果出来后在文本上检测触发词（实现快但延迟更高）

**推荐 MVP：ASR 后文本匹配 + 显式触发词**（简单且稳定），弱信号后续再做。

---

## 17. 技术实现方案（重点窗口 + 差异化转写/总结）

### 17.1 数据结构扩展

**sessions**
- `session_id`
- `user_id`
- `started_at`, `ended_at`
- `source`（meeting / study / walk / etc）
- `audio_uri`（可选）
- `asr_provider`, `language`
- `created_note_id`（会话输出挂载到哪个 note）

**signals**
- `signal_id`
- `session_id`
- `timestamp_ms`
- `type`（HIGHLIGHT/QUESTION/...）
- `source`（hotkey/voice/ui）
- `payload`（可选：短注释、当前 app、窗口标题等）

**transcript_segments**
- `segment_id`
- `session_id`
- `start_ms`, `end_ms`
- `text`
- `speaker`（可选）
- `confidence`
- `is_focus`（是否落在重点窗口内）
- `derived_topics`（可选）

### 17.2 重点窗口生成算法（可 Copilot 实现）
输入：signals（HIGHLIGHT 等）  
输出：focus_windows（合并后的时间区间集合）

伪逻辑：
1) 对每个 `HIGHLIGHT` 生成基础窗口 `[t-pre, t+post]`
2) 按时间排序，若相邻窗口间隔 `< merge_gap_ms` 则合并
3) 若窗口长度超上限则截断（或按规则拆分）
4) 标记每个 transcript segment 是否落入任何窗口

参数建议（可配置）：
- `pre_ms = 20000`
- `post_ms = 60000`
- `merge_gap_ms = 15000`
- `max_window_ms = 300000`

### 17.3 差异化转写（ASR）策略
理想状态：对重点窗口使用更高质量设置（更高采样、更严格标点、保留 filler words/术语）。

现实可行的两阶段方案：
- **阶段 1：全量粗转写（low cost）**  
  对整段音频快速得到分段文本。
- **阶段 2：重点窗口精转写（high quality）**  
  对 focus_windows 对应音频片段二次转写（更高成本但片段短）。
- 合并：用精转写覆盖粗转写对应区间。

> 这样成本可控，体验接近 Granola。

### 17.4 差异化总结（Summarization）策略
将 transcript 分为 focus 与 non-focus 两组：
- focus：保留更多细节、数字、术语、决策语句；输出 Key Moments
- non-focus：按话题聚类后输出 Supporting Notes（强压缩）

**Prompt/约束建议**
- 强制输出结构化 JSON（供 UI 渲染），字段包含 `time_range`, `moment_summary`, `quotes`, `actions`, `questions`, `sources`
- 对 non-focus 限制字数与信息密度（例如每 5 分钟最多 2 句）

---

## 18. 与既有功能的集成点

### 18.1 目录（全息地图）事件轨道
- 在 Holographic Map 中新增轨道标记：
  - ⭐ HIGHLIGHT
  - ❓ QUESTION
  - ✅ ACTION_ITEM
- 过滤器可扩展（MVP 可先复用现有 ❓）
  - `[ ⭐ ] 重点`（可后续加入）

### 18.2 Signal Tag 的自动赋值
- 会话输出笔记中：
  - Key Moments 段落：默认 `Reference` 或 `AI_Conversation`（取决于是否 AI 生成），并附带时间戳
  - Supporting Notes：`AI_Conversation`
  - 用户在会话中手打的内容：`Body` 或 `Thought`（按入口）
- Signals 本身写入 EventLog（用于回顾、追溯与检索）

### 18.3 Daily/Weekly 回顾增强
- Daily Review 输入中加入“今日 Sessions 的重点窗口摘要”：
  - 将 Key Moments 作为当天 “高光证据”
  - 将 non-focus 简要摘要作为背景
- Resonance 的 query 构建可以加入：
  - 今日多次 HIGHLIGHT 周边的情绪/困境词（更像“用户真实在意的点”）

---

## 19. 风险与质量策略

### 19.1 误触与噪声
- 显式语音触发词优先；“嗯哼/Yes”等只做弱信号加权
- 为每个 Signal 提供“撤销/删除”（5 秒内 Undo 或在时间轴上删）
- 允许用户自定义触发词与关闭弱信号识别

### 19.2 可靠性与延迟
- MVP 允许重点窗口在会后生成（异步），不强求实时精转写
- UI 明确标注：重点片段正在“增强整理中…”，完成后刷新卡片

### 19.3 成本控制
- 二次精转写只针对 focus_windows（通常占比很小）
- 总结模型按层级使用：  
  non-focus 用更便宜模型、focus 用更强模型（或同模型不同预算）

---

## 20. 验收标准（补充）

- 当用户在 Session 中触发 ≥1 次 HIGHLIGHT：
  - 输出笔记中必须出现 Key Moments 区块
  - Key Moments 的内容明显更细（包含术语/数字/明确结论），Supporting Notes 明显更短
- 当用户不触发任何 HIGHLIGHT：
  - 输出仍可用：生成一份均匀压缩的摘要，并提示“可用 ⭐ 标注重点以获得更懂你的整理”
- 快捷键触发：
  - 在任意窗口触发后，signals 表中出现对应记录，且时间戳与 Session 对齐（误差 < 500ms 或按音频帧对齐策略定义）

