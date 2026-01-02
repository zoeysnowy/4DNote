
# Eventlog Enhanced PRD

- 产品代号：Eventlog Enhanced
- 目标：让用户“低门槛记录碎碎念”，并持续获得**可回顾、可检索、可总结、可共鸣**的成长轨迹。
- 核心能力：  
  1) Daily/Weekly/Monthly/Yearly **叙事体回顾** + **Resonance（历史共振卡）**  
  2) **无限卡片嵌套**的笔记架构 + 多卡片**集成式总结卡**  
  3) **双栏目录**：左侧“全息地图（事件轨道）”+右侧“标题地图（H1-Hn）”+ 顶部交互式过滤器  
  4) 段落级 **Signal Tag**（Body / Thought / AI_Conversation / Reference）

---

## 1. 背景与问题陈述

### 1.1 用户痛点
- 想写日记/笔记，但**维护成本高**（没精力写完整文章）。
- 信息碎片化：工作、学习、生活、研究、会议笔记混杂，难以回顾。
- 情绪/困境重复出现时，想找到过去相似时刻，但**传统关键词搜索无效**。
- 跟 AI 讨论会产生大量对话，难以沉淀为可复用的知识结构。

### 1.2 机会点
- 以“事件+段落+卡片”为基本单元，构建**可追溯**（anchored）、**可折叠**（toggle）、**可聚合**（summary）笔记体系。
- 用叙事体总结提升“愿意阅读”的动力；用 Resonance 卡提供情绪共鸣与意义建构。

---

## 2. 目标与非目标

### 2.1 目标（MVP-1 至 MVP-3）
- MVP-1：段落 Signal Tag + 事件日志 EventLog + Daily Summary（无 Resonance 或简版）+ 目录事件轨道
- MVP-2：Resonance 卡（基于轶事库/传记库的 RAG）+ 多卡片总结卡 + 目录过滤
- MVP-3：无限卡片嵌套（稳定、可用、性能可控）+ Weekly/Monthly/Yearly 总结（模式洞察）

### 2.2 非目标（明确不做）
- 不追求 Notion 式“全能数据库”。
- 不做复杂权限协作/多人实时协作（后续迭代）。
- 不做“完全自动化正确分类”，Signal Tag 默认以“来源即标签”为准。

---

## 3. 核心概念与术语

- **Note**：一篇笔记文档（富文本/块结构）。
- **Paragraph Node**：文档中的段落/块节点（最小可标记单元）。
- **Anchor**：文本范围或节点位置的锚点（可绑定卡片）。
- **Card**：可折叠的挂载内容（AI Q&A、Web Clip、Summary、Resonance 等）。
- **Nested Card**：卡片内再产生卡片（递归）。
- **Signal Tag**：段落/块的类型标签（Body/Thought/AI_Conversation/Reference）。
- **EventLog**：对用户行为与内容生成的事件记录（用于目录、回顾、检索与可追溯性）。
- **Resonance**：与用户当日心境/困境匹配的历史轶事卡片（RAG 检索+生成）。
- **Holographic Map（全息地图）**：目录左侧事件轨道（按文档滚动位置映射）。
- **Title Map（标题地图）**：目录右侧 H1-Hn 大纲列表。

---

## 4. 功能 1：Daily/Weekly/Monthly/Yearly 叙事体回顾 + Resonance

### 4.1 用户故事
- 作为用户，我想每天晚上看到一份简洁但有温度的回顾，知道：
  - 今天做了什么、学了什么、解决了什么
  - 有哪些新思考/新答案/未解决问题
  - 今天的情绪高光与低谷
- 作为用户，当我处在某种心境中，我希望看到一个“历史共振”卡片，提醒我并不孤独。

### 4.2 输出结构（建议固定模板）
**Daily Review（每日）**
1) 叙事摘要（Narrative Summary）：1–3 段，克制、具体、带叙事张力  
2) 关键收获（Key Takeaways）：要点列表  
3) 未解决问题（Open Loops）：可行动项列表（可生成 next steps）  
4) 情绪与高光（Mood & Highlights）：可选（若用户启用）  
5) Resonance 卡（可选/可开关）

**Weekly/Monthly/Yearly（周期）**
- 不重复流水账，输出：
  - 模式（Patterns）：高频主题/高频情绪/高频阻塞点
  - 进展（Progress）：关键突破
  - 风险与建议（Risks & Suggestions）
  - Resonance（可选）：匹配“阶段性困境/主题”

### 4.3 数据输入
- 该周期内所有 Notes 的内容与元数据：
  - 段落文本 + Signal Tag
  - 卡片内容（Q/A、summary、web clip）
  - EventLog（时间、类型、位置、引用关系）
- 可选：用户自评情绪（手动输入或滑块）

### 4.4 Resonance（历史共振卡）
**目标**：匹配“困境/心境/过程”，不是匹配“成就”。

**检索策略**
- 建议建立“传记轶事切片库（Anecdote DB）”，每条包含：
  - person, era, topic tags, emotion tags, struggle tags
  - snippet（可引用片段，注意版权）
  - source（来源信息）
- 通过 embedding 检索 top-k + rerank（可选）：
  - Query = 当日“情绪/困境/主题”摘要向量（由模型提炼）
- 生成阶段强制“短、具体、引用来源”。

**Resonance 卡内容格式**
- 标题：`“YYYY 年的 {人物}”` 或 `{人物} · {主题}`
- 1–2 句轶事（引用/转述）
- 1 句与用户当天的连接（严格基于当天具体事件）
- 1 句可行动建议（可选）

### 4.5 边界与注意事项
- **避免油腻鸡汤**：禁止空泛赞美；必须引用用户具体事件（EventLog/段落）作为连接依据。
- **可控性**：Resonance 默认可关闭；用户可选择“更理性/更文学”的文风强度滑块（MVP 可不做滑块，做两档）。
- **版权**：传记全文 RAG 风险高。优先：
  - 公版文本（public domain）
  - 自建“短摘录+出处”或改写为“事实性转述”
  - 存储引用的最小片段并带来源

---

## 5. 功能 2：无限卡片嵌套笔记架构 + 多卡片集成式总结卡

### 5.1 用户故事
- 作为用户，我在正文里选中一个词/一句话，发起提问，AI 的回答以卡片形式**挂载在该位置**，可 toggle 展开/折叠。
- 我可以在某个 AI 卡片里再次选中内容继续提问，形成**卡中卡**。
- 我可以选中多个卡片，生成一个“集成式总结卡”（文字/知识图谱样式），并挂载在笔记某处。

### 5.2 交互与规则（建议）
- 选中文本 → 右键/浮动工具条 → `Ask AI`  
  - 结果生成 **AI 卡片**，默认折叠，显示 1 行摘要
- 卡片展开：
  - 显示：用户提问、AI 回答、引用来源（若有）、再次追问入口
- 卡片嵌套深度：
  - 允许无限，但建议 UI 上做“深度提示”与“聚焦模式”（后续）
  - 工程上设置最大渲染深度/虚拟化策略以保性能

### 5.3 多卡片总结卡
- 入口：
  - 在目录事件轨道多选，或在正文中框选多个卡片，点击 `Summarize selection`
- 输出：
  - 文字总结（MVP）
  - 可选：知识图谱样式（后续迭代；MVP 可输出 Mermaid 文本或结构化 JSON）
- 要求：
  - 必须标注来源卡片（Card IDs）
  - 生成结果作为新卡片挂载，并可继续追问（递归）

### 5.4 技术实现建议（编辑器与锚点）
**不建议 Gridstack**：Gridstack 是 dashboard grid layout，不适合“文本锚点跟随”。

推荐架构：
- 编辑器：ProseMirror/Tiptap（Node/Mark + NodeView）
- 锚点模型（两种选一或组合）：
  1) **Node anchor**：卡片附着在某个块节点下方（更稳定）  
  2) **Text range anchor**：卡片附着在文本 range（更精确，但对编辑变更敏感）
- 建议 MVP 用：**块级锚点优先 + 可选文本 range**  
  - 选中文字时，将卡片插入为“紧随该段落的子节点”，并在 meta 中记录 range 的起止偏移用于高亮

UI 定位：
- 悬挂卡片可采用 “inline block” 插入（更稳定）  
- 如需气泡/侧挂：用 `Floating UI`/`Popper` 计算位置，但要处理滚动、换行、缩放

性能：
- 卡片内容默认折叠，仅渲染摘要；展开时惰性加载全文
- 深层嵌套采用虚拟化（仅渲染可视区域/当前展开路径）

---

## 6. 功能 3：双栏目录（全息地图 + 标题地图）+ 顶部过滤器

### 6.1 目标
- 兼容传统 H1-Hn 大纲导航
- 支持快速定位：
  - 提问（❓）
  - AI 交互（✨）
  - 总结（🧊）
  - 遗留问题（红色标记）

### 6.2 UI 结构
- 目录面板分为左右两栏：
  - **左：全息地图（Holographic Map）**
    - 类似 IDE 滚动条标记：按文档纵向映射显示事件图标轨道
    - 支持点击跳转到对应位置并自动展开目标卡片
  - **右：标题地图（Title Map）**
    - 显示 H1-Hn 层级（建议默认显示到 H3，可展开）
- 顶部过滤器：
  - `[ A ] 结构`（默认开：显示 H1-Hn）
  - `[ ✨ ] AI 灵感`
  - `[ ❓ ] 遗留问题`
  - `[ 🧊 ] 总结`

### 6.3 行为规则
- 过滤器是“叠加高亮”而非“完全隐藏”（建议）
  - 例如开启 ✨：标题地图仍可见但淡化，事件轨道高亮 AI 事件
- 点击事件图标：
  - 滚动至锚点
  - 若是卡片事件：自动展开该卡片
- “遗留问题”来源：
  - 用户显式标记为 Unsolved
  - 或 AI 在总结中抽取并生成 Open Loop 列表（可确认后入库）

### 6.4 技术实现建议
- 目录与事件轨道依赖：
  - 文档解析器生成 outline（H1-Hn）+ 块位置索引
  - EventLog 记录每个事件关联的 anchor position（节点 id + offset）
- 位置映射：
  - 需要从编辑器获得每个 anchor 的 DOM rect/top
  - 将 top 映射到 0..1 的比例，渲染到轨道高度
- 更新策略：
  - 文档变更时节流更新（throttle），避免每次 keypress 重算全量布局
  - 事件轨道可采用增量更新（只更新受影响段落范围）

---

## 7. 功能 4：Signal Tag（段落节点标签）

### 7.1 Tag 类型与默认赋值规则（来源即标签）
**Type A: 正文（Body）**  
- 来源：用户直接键盘输入创建段落  
- 样式：标准字体  
- Tag：`Body`

**Type B: 思考/碎碎念（Thought）**  
- 来源：Whisper Mode（语音输入）或特定快捷入口（Cmd+Shift+M）  
- 样式：淡紫色左边线/浅灰底/轻手写体（可选）  
- Tag：`Thought`

**Type C: AI 交流（AI_Conversation）**  
- 来源：Resonance Card / Ask AI / 卡片追问生成  
- 样式：卡片边框  
- Tag：`AI_Conversation`（系统生成，100%）

**Type D: 网络摘要（Reference）**  
- 来源：浏览器剪藏/粘贴时识别为网页摘要，或 RAG 引用块  
- 样式：Blockquote + 来源链接  
- Tag：`Reference`

### 7.2 为什么要做 Signal Tag
- 目录过滤、全息地图事件分类
- 总结时的加权：例如 Daily Summary 更重视 Thought/AI/Reference 的“新信息密度”
- 搜索/Resonance 检索 Query 的构建
- 未来可做“人生资产负债表”（知识/情绪/行动/阻塞）

### 7.3 AI 辅助（可选，建议延后）
- **不实时改 UI，不强制用户修正**
- 在 Daily Review 生成时做“后台追溯标注（retroactive tagging）”
- 前台仅在用户开启“显示标签高亮”时可见

### 7.4 用户手动标记（降摩擦策略）
- 提供极轻入口：
  - 段落左侧 gutter 一个小图标（点击循环切换 Body→Thought→Reference→Body）
  - 快捷键（例如 `Cmd+Alt+1/2/3/4`）
- 默认不要求用户标记；不标记也能完整使用核心功能

---

## 8. EventLog：统一事件模型（用于目录/回顾/追溯）

### 8.1 事件类型（建议）
- `NOTE_CREATED`
- `PARAGRAPH_CREATED`
- `TAG_ASSIGNED`（含自动/手动来源）
- `AI_ASKED`（用户提问）
- `AI_ANSWERED`
- `CARD_CREATED`（含类型：AI/Reference/Summary/Resonance）
- `CARD_TOGGLED`
- `SUMMARY_GENERATED`（daily/weekly/…）
- `OPEN_LOOP_MARKED`（用户/AI）
- `REFERENCE_CLIPPED`

### 8.2 事件字段（建议最小集合）
- `event_id` (uuid)
- `user_id`
- `note_id`
- `timestamp`
- `event_type`
- `anchor`：
  - `node_id`（段落/卡片节点 id）
  - `range`（可选：startOffset/endOffset）
- `payload`：
  - card_id / tag / model / tokens / source_url 等

### 8.3 用途
- 生成全息地图事件轨道
- 生成回顾输入（按时间/按主题聚合）
- 可解释性：回顾中的结论可回溯到具体事件/段落

---

## 9. 技术方案（供 Copilot 实施）

### 9.1 前端架构建议
- 编辑器：Tiptap（ProseMirror）
- 文档存储：JSON（ProseMirror schema）
- 卡片：作为 NodeView（block node），支持 children（递归）
- 目录：
  - Outline parser：扫描 doc 中 heading nodes
  - Event track renderer：基于 EventLog + anchor position mapping
- 弹出/定位：Floating UI（仅在需要悬浮气泡时）

### 9.2 ProseMirror Schema（建议节点）
- `doc`
- `paragraph`（attrs: `id`, `signalTag`）
- `heading`（attrs: `level`, `id`）
- `blockquote`（Reference）
- `card`（attrs: `id`, `cardType`, `collapsed`, `meta`）
  - cardType：`ai` | `summary` | `resonance` | `reference`
  - meta：`question`, `answer`, `sources`, `relatedCardIds`, `createdByEventId` 等
- `card_container`（可选，用于组织嵌套结构）

### 9.3 后端与数据
- 表/集合建议：
  - `notes`：note_id, user_id, doc_json, created_at, updated_at
  - `cards`：card_id, note_id, type, content, collapsed, parent_card_id?, anchor_node_id, created_at
  - `events`：EventLog
  - `summaries`：周期总结产物（含引用 card_ids / node_ids）
  - `anecdotes`：Resonance 轶事库（含 embedding）
- 检索：
  - 向量索引：anecdotes（Resonance）
  - 可选：notes/cads 的向量索引（未来做语义搜索）

### 9.4 生成流程（pipeline）
**Daily Summary**
1) Gather：当天相关 notes + events + cards（按时间窗口）  
2) Normalize：按 Signal Tag 分桶 + 提取 open loops 候选  
3) Summarize：生成叙事摘要 + takeaways + open loops + mood（可选）  
4) Resonance：
   - 生成“心境 query”（短文本）
   - 向量检索 anecdotes top-k
   - 生成 resonance card（含 source）
5) Persist：写入 summaries + events + card（挂载到指定 note 或 Daily Review note）

**多卡片集成式总结**
1) 输入：selectedCardIds  
2) 取内容：cards content + 可选上下文（父段落）  
3) 生成：summary（严格引用映射）  
4) 落地：创建 summary card + event

### 9.5 Prompt/约束建议（关键）
- 叙事摘要必须包含“具体事实锚点”：引用至少 N 个 event/node 的短描述（内部引用，不一定给用户展示）
- 禁止空泛夸赞词（amazing, great, inspiring）除非有具体依据
- Resonance 连接句必须包含用户当天一个具体事件（如“你在下午调试 X”）
- 所有生成内容必须附带结构化输出（JSON + 可渲染文本），便于 UI 展示与追溯

---

## 10. 风险与注意事项

### 10.1 可用性风险（用户觉得繁琐）
- 通过“来源即标签”避免强迫标记
- 默认折叠卡片，保证正文可读
- 目录过滤默认不改变结构，只做高亮

### 10.2 性能风险（无限嵌套）
- 折叠惰性渲染
- 设定软限制：例如展开路径深度超过 N 时提示进入“聚焦模式”（后续）
- 节流 layout 计算（目录轨道）

### 10.3 版权与合规（Resonance）
- 避免直接存储受版权保护的长文本
- 采用公版/授权/短摘录+出处/事实性转述
- UI 显示来源与免责声明

### 10.4 可信与可解释性
- 回顾/总结提供“查看依据（Sources）”能力（MVP 可先在卡片 meta 保存）
- AI 错误分类不影响显示（后台 tag）

---

## 11. 验收标准（示例）

### 11.1 Daily Summary + Resonance
- 给定一天的多条笔记与卡片：
  - 系统能生成 Daily Review，并可挂载为一张 Summary 卡
  - Resonance 卡能显示来源字段，内容不超过指定长度
  - “未解决问题”至少能从用户问句/未完成项中抽取 3 条（若存在）

### 11.2 卡片嵌套与多卡片总结
- 用户在正文选中内容提问：
  - 生成 AI 卡片并正确锚定
  - 可 toggle 展开/折叠
- 在 AI 卡片内再次提问：
  - 生成子卡片，并保持父子关系可追溯
- 多选卡片总结：
  - 生成 summary card，引用列表包含所有输入卡片 ID

### 11.3 双栏目录 + 过滤器
- H1-Hn 正常渲染与跳转
- 开启 ✨ / ❓ / 🧊：
  - 事件轨道高亮对应事件
  - 点击事件标记可跳转并展开目标

### 11.4 Signal Tag
- 通过不同入口创建段落，signalTag 自动正确赋值
- 用户通过 gutter/快捷键修改 tag，EventLog 记录变更

---

## 12. 里程碑建议（实施顺序）

1) 基础编辑器（Tiptap）+ 段落 id + H1-Hn  
2) Card Node（AI card）+ 锚定（块级）+ toggle  
3) EventLog + 全息地图轨道（先做最小标记）  
4) Signal Tag（来源即标签）+ 目录过滤  
5) Daily Summary 生成与挂载（无 Resonance 或简版）  
6) 多卡片集成式总结卡  
7) Resonance：轶事库 + 向量检索 + 卡片生成  
8) Weekly/Monthly/Yearly 模式洞察

