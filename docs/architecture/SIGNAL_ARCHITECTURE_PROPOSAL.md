# Signal 架构设计提案（AI-Native 富文本标记管理）

> **背景**：4DNote 是 AI-native 的日程/待办/笔记应用，用户在富文本编辑器里的标记（highlight、textColor、bold、italic等）都是需要让 AI 解析和查询的"信号"。当前这些标记只存在 UI（Slate slateJson），没有后台落库到专门的 Signal 管理层。
>
> **目标**：明确"富文本格式（Format）"与"AI 可查询信号（Signal）"的架构边界，避免重复存储与语义混淆。

---

## 1. 现状分析

### 1.1 富文本标记的当前存储形态

**位置**：`EventLog.slateJson`（Slate JSON 格式）

**数据结构**：
```typescript
// src/types.ts
interface EventLog {
  slateJson: string;  // Slate JSON（包含所有富文本格式）
  html?: string;      // 渲染用（Outlook 同步）
  plainText?: string; // 搜索用（纯文本）
}

// Slate JSON 示例
[
  {
    "type": "paragraph",
    "children": [
      { "text": "普通文本" },
      { "text": "加粗重点", "bold": true },
      { "text": "红色警告", "color": "#FF0000" },
      { "text": "黄色高亮", "backgroundColor": "#FFFF00" },
      { "text": "斜体补充", "italic": true },
      { "text": "删除线", "strikethrough": true }
    ]
  }
]
```

**支持的格式标记**（来自 `src/types.ts:345-352`）：
- `bold`：粗体
- `italic`：斜体
- `underline`：下划线
- `strikethrough`：删除线
- `color`：文字颜色（9种颜色：黑/红/橙/黄/绿/蓝/紫/粉/灰）
- `backgroundColor`：背景高亮（8种颜色：红底/橙底/黄底/绿底/蓝底/紫底/粉底/灰底）
- `code`：行内代码

**现状问题**：
1. ❌ **AI 不可查询**：这些格式信息深埋在 `slateJson` 字符串里，AI/后端查询需要解析完整 JSON → 效率低 + 维护成本高。
2. ❌ **语义不明确**：同样是"黄色高亮"，用户可能表达"重点/优势/精彩"等不同意图，纯格式无法区分。
3. ❌ **无统计/聚合能力**：无法快速回答"这个事件有几个重点标记""哪些事件包含疑问标记"。
4. ✅ **Outlook 同步完整**：`eventlog.html` 包含所有格式（通过 `<strong>`、`<span style="color: #FF0000">` 等），可双向同步。

### 1.2 Title 的格式存储（对比参考）

**位置**：`Event.title.formatMap`（独立字段）

```typescript
interface EventTitle {
  fullTitle: string;           // Slate JSON（含 tag/dateMention/格式）
  colorTitle: string;          // Slate JSON（移除元素，保留格式）
  simpleTitle: string;         // 纯文本（同步用）
  formatMap?: TextFormatSegment[];  // 格式映射（用于恢复格式）
}

interface TextFormatSegment {
  text: string;
  format: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    color?: string;
    backgroundColor?: string;
  };
}
```

**设计理由**：
- `formatMap` 提取格式 → **方便 Outlook 往返时恢复样式**（Outlook 只传 `simpleTitle` 纯文本）。
- 格式本身不作为"信号"，只是表现层（Presentation）。

---

## 2. 概念区分：Format vs Signal

### 2.1 Format（格式）- 属于 Presentation Layer（表现层）

**定义**：用户对文本外观的标记（bold、color、背景色等），**主要用于视觉呈现**。

**存储位置**：
- `EventLog.slateJson`（主存储，完整 Slate JSON）
- `EventLog.html`（渲染用 + Outlook 同步）
- `Event.title.formatMap`（Title 格式恢复用）

**Owner**：UI 层（Slate 编辑器）+ EventService（序列化/反序列化）

**AI 使用方式**：
- 解析 slateJson → 提取格式信息 → 推断用户意图（如"黄色高亮可能是重点"）
- 但不应该直接依赖格式进行业务逻辑仲裁（格式可能被 Outlook 修改/丢失）

### 2.2 Signal（信号）- 属于 Domain/Semantic Layer（领域/语义层）

**定义**：用户的**显式意图标记**，具备明确语义，**AI 可直接查询/聚合/分析**。

**PRD 定义的 Signal 类型**（来自 `docs/features/Eventlog Enhanced PRD`）：

#### 2.2.1 语义标记类型（Semantic Annotation Signals）
- `HIGHLIGHT`：这是重点（我想记住/需要详细记录）
- `CONFIRM`：确认/同意（用于归纳决策）
- `QUESTION`：这是个问题/待确认点
- `ACTION_ITEM`：待办/行动项
- `ADVANTAGE`：优势/亮点
- `DISADVANTAGE`：劣势/问题
- `BRILLIANT`：精彩片段

#### 2.2.2 用户行为类型（User Behavior Signals）⭐ 新增
用户的交互行为也是重要的信号来源，用于推断用户真实意图：

**A. 显式操作行为**

- `USER_QUESTION`：用户在此处选中文本后提问（表示疑问/不理解）
  - 触发条件：选中文本 → 打开 AI Chat → 发送问题
  - 数据记录：问题内容、选中文本、提问时间
  
- `USER_COPY`：用户复制了此处文本（表示重要/有价值）
  - 触发条件：用户执行复制操作（Ctrl+C）
  - 数据记录：复制文本、复制次数、最近复制时间
  
- `AI_INSERT`：用户从 AI 卡片插入内容到正文（表示精华/确认）
  - 触发条件：从 AI 回复卡片拖拽/粘贴到 Eventlog
  - 数据记录：插入内容、来源 AI 对话 ID、插入时间
  
- `USER_EDIT`：用户在此处反复修改（表示重要/需要打磨）
  - 触发条件：同一位置 3 次以上编辑操作
  - 数据记录：编辑次数、累计修改字符数、最近编辑时间
  
- `USER_STAR`：用户手动点击"收藏"按钮（显式重点标记）
  - 触发条件：点击星标按钮
  - 数据记录：标记时间、是否有备注

**B. 时间停留行为**（Time-based Signals）⭐ 关键

- `DWELL_TIME_EVENT`：用户在某个 Event 上的停留时长（表示关注度）
  - 触发条件：Event 在可视区域内持续停留 > 5 秒
  - 数据记录：
    - `totalDwellTime`：累计停留时长（毫秒）
    - `dwellSessions`：停留会话列表（进入时间、离开时间）
    - `averageDwellTime`：平均单次停留时长
    - `maxDwellTime`：最长单次停留时长
  - 权重计算：停留 > 30 秒 → 高权重，> 2 分钟 → 极高权重
  
- `DWELL_TIME_PARAGRAPH`：用户在某个段落/文本块的停留时长（更细粒度）
  - 触发条件：通过鼠标悬停/光标位置判断焦点段落
  - 数据记录：段落级别的停留时长、revisit 次数（重复查看）
  - 用途：RAG 时提高该段落的检索优先级

- `FOCUS_TIME`：Eventlog 编辑器获得焦点的总时长（表示工作投入度）
  - 触发条件：`focus` 事件 → `blur` 事件
  - 数据记录：焦点时长、焦点会话次数、最近焦点时间
  - 用途：区分"快速浏览" vs "深度编辑"

**C. 键盘行为信号**（Keyboard Behavior Signals）⭐ 关键

- `TYPING_RHYTHM`：输入节奏变化（表示思考 vs 流畅输入）
  - 触发条件：监听 `keydown` 事件间隔
  - 数据记录：
    - `fastTypingSegments`：快速输入片段（间隔 < 200ms）
    - `slowTypingSegments`：缓慢输入片段（间隔 > 1000ms，表示思考）
    - `pauseCount`：暂停次数（> 3 秒停顿）
    - `averageTypingSpeed`：平均打字速度（字符/分钟）
  - 权重计算：缓慢输入 + 多次暂停 → 该内容需要思考 → 高权重
  
- `DELETE_REWRITE`：删除后重写行为（表示不确定/重要）
  - 触发条件：连续删除 > 5 个字符后重新输入
  - 数据记录：
    - `deleteCount`：删除次数
    - `deletedChars`：累计删除字符数
    - `rewriteCount`：重写次数
    - `deletedContent`：被删除的文本（可选，用于分析用户犹豫点）
  - 权重计算：重写次数 > 3 → 该内容很重要/难以表达 → 高权重
  
- `BACKSPACE_PATTERN`：退格键使用模式
  - 触发条件：监听 `Backspace` 键
  - 数据记录：单次退格 vs 连续退格（表示小修正 vs 大幅修改）
  - 用途：区分"打字错误"（单次退格）vs"内容修改"（连续退格）

**D. 鼠标行为信号**（Mouse Behavior Signals）⭐ 关键

- `MOUSE_HOVER`：鼠标长时间悬停（表示阅读/思考）
  - 触发条件：鼠标在某段文本上悬停 > 2 秒
  - 数据记录：
    - `hoverDuration`：悬停时长
    - `hoverCount`：悬停次数
    - `hoveredText`：悬停的文本内容
  - 权重计算：悬停 > 5 秒 → 用户在阅读/思考 → 该内容重要
  
- `SCROLL_BEHAVIOR`：滚动行为模式
  - 触发条件：监听 `scroll` 事件
  - 数据记录：
    - `scrollSpeed`：滚动速度（快速略过 vs 缓慢阅读）
    - `scrollBackCount`：向上回滚次数（重复查看）
    - `scrollPausePositions`：滚动暂停位置（可能是重点段落）
  - 权重计算：回滚查看 > 2 次 → 该位置内容重要
  
- `SELECTION_PATTERN`：文本选中行为（未复制，仅选中）
  - 触发条件：用户选中文本但未触发复制/提问
  - 数据记录：选中文本、选中次数、选中时长
  - 用途：用户可能在阅读/思考，但未明确操作 → 中等权重

**E. 综合行为模式**（Composite Behavior Patterns）

- `DEEP_WORK_SESSION`：深度工作会话（综合指标）
  - 触发条件：焦点时长 > 10 分钟 + 缓慢输入 + 多次暂停 + 少量删除重写
  - 数据记录：会话时长、输入字符数、暂停次数
  - 权重计算：深度工作产出的内容 → 极高权重（用户投入大量时间）
  
- `REVISIT_PATTERN`：重复访问模式
  - 触发条件：同一 Event 在不同时间段被多次打开/编辑
  - 数据记录：访问次数、访问时间列表、每次停留时长
  - 权重计算：重复访问 > 3 次 → 该 Event 持续重要

#### 2.2.3 AI 推断类型（AI-Inferred Signals）
AI 自动扫描推断的信号（需要用户确认）：

- `AI_HIGHLIGHT_SUGGESTED`：AI 推荐为重点（基于格式/上下文）
- `AI_QUESTION_DETECTED`：AI 检测到疑问句/不确定表达
- `AI_ACTION_DETECTED`：AI 检测到待办事项（如"需要"、"TODO"）

**存储位置**：**独立实体/独立表**（不是 Event 字段）

```typescript
// Signal 完整结构（包含行为信号）
interface Signal {
  id: string;
  eventId: string;         // 关联事件
  type: SignalType;        // 信号类型
  content: string;         // 标记的文本内容
  
  // 时间字段（存储格式："YYYY-MM-DD HH:mm:ss"，使用 formatTimeForStorage()）
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  
  // 定位信息（用于回溯到 slateJson 具体位置）
  slateNodePath?: number[];  // Slate 节点路径（如 [0, 2, 1]）
  textRange?: { start: number; end: number };  // 文本范围
  
  // 元数据
  createdBy: 'user' | 'ai' | 'system';  // 来源：用户手动/AI 自动提取/系统
  reviewedAt?: string;                  // AI 推断类信号：用户确认/拒绝时间
  reviewedBy?: 'user' | 'ai' | 'system';
  
  // AI 提取时的置信度（可选）
  confidence?: number;
  
  // 用户行为元数据（仅用于行为类型）
  behaviorMeta?: {
    // 操作统计
    actionCount?: number;           // 操作次数（如复制次数、编辑次数）
    lastActionTime?: string;        // 最近操作时间
    
    // 时间相关
    totalDwellTime?: number;        // 累计停留时长（毫秒）
    dwellSessions?: Array<{         // 停留会话列表
      startTime: string;
      endTime: string;
      duration: number;
    }>;
    averageDwellTime?: number;      // 平均单次停留时长
    maxDwellTime?: number;          // 最长单次停留时长
    
    focusDuration?: number;         // 焦点持续时长（毫秒）
    focusSessions?: number;         // 焦点会话次数
    
    // 键盘行为
    typingSpeed?: number;           // 平均打字速度（字符/分钟）
    fastTypingSegments?: number;    // 快速输入片段数
    slowTypingSegments?: number;    // 缓慢输入片段数
    pauseCount?: number;            // 暂停次数（> 3 秒）
    deleteCount?: number;           // 删除次数
    deletedChars?: number;          // 累计删除字符数
    rewriteCount?: number;          // 重写次数
    deletedContent?: string[];      // 被删除的文本片段（可选）
    
    // 鼠标行为
    hoverDuration?: number;         // 悬停时长（毫秒）
    hoverCount?: number;            // 悬停次数
    scrollSpeed?: number;           // 平均滚动速度（像素/秒）
    scrollBackCount?: number;       // 向上回滚次数
    scrollPauseCount?: number;      // 滚动暂停次数
    selectionCount?: number;        // 文本选中次数（未复制）
    
    // 关联信息
    relatedConversationId?: string; // 关联的 AI 对话 ID（AI_INSERT/USER_QUESTION）
    questionText?: string;          // 用户提问内容（USER_QUESTION）
    editCharCount?: number;         // 累计修改字符数（USER_EDIT）
    
    // 综合指标
    revisitCount?: number;          // 重复访问次数
    revisitTimes?: string[];        // 访问时间列表
    deepWorkScore?: number;         // 深度工作评分（0-100）
  };
  
  // 状态
  status: 'active' | 'confirmed' | 'rejected' | 'expired';  // AI 推断需要确认
  // 注意：Embedding/RAG 属于派生索引能力，不是 Signal 权威字段
}

type SignalType = 
  // 语义标记
  | 'highlight'      // 重点
  | 'question'       // 疑问
  | 'action_item'    // 待办
  | 'advantage'      // 优势
  | 'disadvantage'   // 劣势
  | 'brilliant'      // 精彩
  | 'confirm'        // 确认
  
  // 显式操作行为
  | 'user_question'  // 用户提问
  | 'user_copy'      // 用户复制
  | 'ai_insert'      // AI内容插入
  | 'user_edit'      // 反复编辑
  | 'user_star'      // 手动收藏
  
  // 时间停留行为
  | 'dwell_time_event'      // Event 级别停留
  | 'dwell_time_paragraph'  // 段落级别停留
  | 'focus_time'            // 编辑器焦点时长
  
  // 键盘行为
  | 'typing_rhythm'    // 输入节奏（快速 vs 缓慢）
  | 'delete_rewrite'   // 删除重写
  | 'backspace_pattern' // 退格模式
  
  // 鼠标行为
  | 'mouse_hover'      // 鼠标悬停
  | 'scroll_behavior'  // 滚动行为
  | 'selection_pattern' // 选中模式
  
  // 综合行为模式
  | 'deep_work_session' // 深度工作会话
  | 'revisit_pattern'   // 重复访问
  
  // AI推断（待确认）
  | 'ai_highlight_suggested'
  | 'ai_question_detected'
  | 'ai_action_detected';
```

**Owner**：`SignalService`（待实现，负责 CRUD + 一致性）

**AI 使用方式**：
- 直接查询：`SELECT * FROM signals WHERE eventId = ? AND type = 'question'`
- 聚合统计：`SELECT type, COUNT(*) FROM signals GROUP BY type`
- 时间窗口：`SELECT * FROM signals WHERE created_at BETWEEN ? AND ?`（用于 Granola 式"重点窗口"）

---

## 3. 完整数据流架构（Data Flow Architecture）

### 3.1 Signal 生命周期（Signal Lifecycle）

```
┌─────────────────────────────────────────────────────────────────┐
│                     Signal 数据流全景图                          │
└─────────────────────────────────────────────────────────────────┘

1️⃣ 【创建阶段】Signal Creation
   
   ┌──────────────┐
   │ 用户操作      │  → 格式标记（黄色高亮）
   │ (UI Layer)   │  → 语义标记（右键"设为重点"）
   └──────┬───────┘  → 行为触发（复制/提问/编辑）
          ↓
   ┌──────────────┐
   │ EventBus     │  → 事件：'signal:create', 'user:copy', 'user:question'
   └──────┬───────┘
          ↓
   ┌──────────────────────────────────────────────────────────────┐
   │ SignalService.createSignal()                                 │
   │  - 验证：检查 eventId 存在性、文本范围有效性                  │
   │  - 去重：同一位置/类型的 Signal 只保留最新                   │
   │  - 预处理：提取关键词、清理文本                               │
   │  - 生成 ID：使用 uuid                                        │
   └──────┬───────────────────────────────────────────────────────┘
          ↓
   ┌──────────────┐
   │ Preprocessing│  → 文本清洗（移除格式标记、HTML 标签）
   │ (预处理层)    │  → 关键词提取（NLP/正则）
   └──────┬───────┘  → 语义增强（添加上下文片段）
          ↓
   ┌──────────────────────────────────────────────────────────────┐
   │ signals 表写入                                                │
  │  - 核心数据：id, eventId, type, content, createdAt/updatedAt │
   │  - 定位信息：slateNodePath, textRange                        │
   │  - 元数据：createdBy, confidence, behaviorMeta               │
   │  - 状态：status (active/confirmed/rejected/expired)          │
   └──────┬───────────────────────────────────────────────────────┘
          ↓
   ┌──────────────┐
  │ Embedding    │  → 异步任务：调用 OpenAI/本地模型生成向量
  │ (向量化)      │  → 写入 signal_embeddings（Derived Store）
   └──────┬───────┘  → 写入向量数据库（可选，如 Pinecone/Weaviate）
          ↓
   ┌──────────────┐
   │ IndexedDB    │  ✅ Signal 创建完成
   │ / SQLite     │
   └──────────────┘

2️⃣ 【查询阶段】Signal Query & Retrieval

   ┌──────────────┐
   │ AI 请求      │  → "本周重点内容是什么？"
   │ / 用户搜索    │  → "找出所有疑问点"
   └──────┬───────┘
          ↓
   ┌──────────────────────────────────────────────────────────────┐
   │ SignalService.querySignals(filters)                          │
  │  - 时间范围：WHERE created_at BETWEEN ? AND ?                │
   │  - 类型过滤：WHERE type IN ('highlight', 'brilliant')        │
   │  - 聚合统计：GROUP BY type / COUNT(*)                        │
  │  - 向量检索：相似度搜索（通过 signal_embeddings）              │
   └──────┬───────────────────────────────────────────────────────┘
          ↓
   ┌──────────────┐
  │ 结果排序      │  → 按 createdAt/置信度/行为频次排序
   └──────┬───────┘  → 去重（同一文本的多个 Signal 合并）
          ↓
   ┌──────────────┐
   │ AI Prompt    │  → 构建上下文：[重点] 文本1 | [疑问] 文本2
   │ Construction │  → 差异化权重：重点×3、精彩×2、普通×1
   └──────┬───────┘
          ↓
   ┌──────────────┐
   │ LLM 调用     │  ✅ 生成总结/回答
   └──────────────┘

3️⃣ 【更新阶段】Signal Update

   ┌──────────────┐
   │ 用户编辑正文  │  → Eventlog slateJson 变化
   └──────┬───────┘
          ↓
   ┌──────────────────────────────────────────────────────────────┐
   │ SlateChangeListener（Slate 编辑器监听）                       │
   │  - 检测：slateNodePath 对应的节点是否被修改/删除              │
   │  - 触发：EventBus 发送 'slate:node:changed' 事件              │
   └──────┬───────────────────────────────────────────────────────┘
          ↓
   ┌──────────────────────────────────────────────────────────────┐
   │ SignalService.handleSlateChange()                            │
   │  - 策略 1：文本轻微修改（<10% 变化）→ 更新 Signal.content    │
   │  - 策略 2：文本大幅修改（>50% 变化）→ 标记 Signal 为 expired │
   │  - 策略 3：节点删除 → 删除对应的所有 Signal                   │
   └──────┬───────────────────────────────────────────────────────┘
          ↓
   ┌──────────────┐
   │ Embedding    │  → 文本变化 → 重新生成 embedding
  │ 重新生成      │  → 更新 signal_embeddings
   └──────┬───────┘
          ↓
   ┌──────────────┐
   │ signals 表   │  ✅ Signal 更新完成
   └──────────────┘

4️⃣ 【删除/过期阶段】Signal Expiration & Cleanup

   ┌──────────────┐
   │ 触发条件      │  → 用户手动删除 Signal
   │              │  → slateJson 对应节点被删除
   └──────┬───────┘  → Signal 超过 90 天未确认（AI 推断类型）
          ↓
   ┌──────────────────────────────────────────────────────────────┐
   │ SignalService.deleteSignal() / expireSignal()                │
   │  - 软删除：status = 'expired'（保留历史）                     │
   │  - 硬删除：DELETE FROM signals WHERE id = ?                  │
   └──────┬───────────────────────────────────────────────────────┘
          ↓
   ┌──────────────┐
   │ Cleanup Task │  → 定期任务：清理 90 天前的 expired Signal
   │ (定期清理)    │  → 压缩 embedding 存储
   └──────┬───────┘
          ↓
   ┌──────────────┐
   │ IndexedDB    │  ✅ Signal 删除完成
   └──────────────┘
```

### 3.2 Signal 与 Format 的双向同步

#### 3.2.1 Format → Signal（自动提取）

```typescript
// AI 扫描 slateJson，自动推荐 Signal
async function extractSignalsFromFormat(
  eventId: string,
  slateJson: string
): Promise<Signal[]> {
  const nodes = JSON.parse(slateJson);
  const signals: Signal[] = [];
  
  traverseNodes(nodes, (node, path) => {
    const now = formatTimeForStorage(new Date());
    // 规则 1：黄色高亮 → highlight 推荐
    if (node.backgroundColor === '#FFFF00') {
      signals.push({
        id: uuid(),
        eventId,
        type: 'ai_highlight_suggested',  // AI 推断，需确认
        content: node.text,
        slateNodePath: path,
        createdAt: now,
        updatedAt: now,
        createdBy: 'ai',
        confidence: 0.8,
        status: 'active',  // 待用户确认
      });
    }
    
    // 规则 2：问号/疑问词 → question 推荐
    if (node.text.includes('?') || /为什么|怎么办|不清楚/.test(node.text)) {
      signals.push({
        id: uuid(),
        eventId,
        type: 'ai_question_detected',
        content: node.text,
        slateNodePath: path,
        createdAt: now,
        updatedAt: now,
        createdBy: 'ai',
        confidence: 0.6,
        status: 'active',
      });
    }
    
    // 规则 3：TODO/需要 → action_item 推荐
    if (/TODO|需要|待办|明天/.test(node.text)) {
      signals.push({
        id: uuid(),
        eventId,
        type: 'ai_action_detected',
        content: node.text,
        slateNodePath: path,
        createdAt: now,
        updatedAt: now,
        createdBy: 'ai',
        confidence: 0.7,
        status: 'active',
      });
    }
  });
  
  return signals;
}

// 用户确认/拒绝 AI 推荐
async function confirmSignal(signalId: string): Promise<void> {
  const now = formatTimeForStorage(new Date());
  await db.signals.update(signalId, {
    status: 'confirmed',
    reviewedAt: now,
    reviewedBy: 'user',
    updatedAt: now,
  });
}

async function rejectSignal(signalId: string): Promise<void> {
  const now = formatTimeForStorage(new Date());
  await db.signals.update(signalId, {
    status: 'rejected',
    reviewedAt: now,
    reviewedBy: 'user',
    updatedAt: now,
  });
}
```

#### 3.2.2 Format → Signal（单向派生，SSOT 允许）

```typescript
/**
 * SSOT 约束：SignalService 不得写入/反向驱动 slateJson。
 * 允许路径：用户在编辑器应用格式（写入 EventLog.slateJson）后，UI/解析器可“派生创建/推荐” Signal。
 */

// 用户在编辑器应用格式（唯一写入 slateJson 的路径：EventService / 编辑器）
async function onUserAppliedFormat(eventId: string, selection: any) {
  const now = formatTimeForStorage(new Date());

  // 1) UI 写入格式（Slate）并持久化到 EventLog（EventService 负责）
  const updatedSlateJson = applyFormatInEditor(selection);
  await EventService.updateEventLog(eventId, { slateJson: updatedSlateJson });

  // 2) （可选）基于当前 selection/format 创建或推荐 Signal（Signal 独立存储）
  const { slateNodePath, content } = getSelectionInfo(selection);
  await SignalService.createSignal({
    eventId,
    type: 'highlight',
    content,
    slateNodePath,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    status: 'active',
  });
}

// 用户移除格式时：只影响 slateJson；Signal 是否删除由 UI 显式确认触发
async function onUserRemovedFormat(eventId: string, slateNodePath: number[]) {
  const relatedSignals = await SignalService.getSignalsByPath(eventId, slateNodePath);
  if (relatedSignals.length === 0) return;

  showDialog({
    title: '是否同时删除语义标记？',
    message: `此处有 ${relatedSignals.length} 个标记：${relatedSignals.map(s => s.type).join(', ')}`,
    actions: [
      { label: '保留标记', action: () => {} },
      { label: '删除标记', action: async () => {
        await Promise.all(relatedSignals.map(s => SignalService.deleteSignal(s.id)));
      }},
    ],
  });
}
```

### 3.3 用户行为信号的自动捕获（完整版）

#### 3.3.1 显式操作行为捕获

```typescript
// 监听用户复制操作
document.addEventListener('copy', async (e) => {
  const selection = window.getSelection();
  const copiedText = selection?.toString();
  
  if (!copiedText || copiedText.length < 5) return;  // 忽略短文本
  
  // 查找对应的 Event 和 Slate 节点
  const { eventId, slateNodePath } = findSlateNodeBySelection(selection);
  
  if (!eventId) return;
  
  // 创建/更新 USER_COPY Signal
  const existingSignal = await SignalService.findSignal({
    eventId,
    type: 'user_copy',
    slateNodePath,
  });
  
  if (existingSignal) {
    // 更新复制次数
        const now = formatTimeForStorage(new Date());
    await SignalService.updateSignal(existingSignal.id, {
          updatedAt: now,
      behaviorMeta: {
        actionCount: (existingSignal.behaviorMeta?.actionCount || 0) + 1,
            lastActionTime: now,
      },
    });
  } else {
    // 创建新 Signal
    const now = formatTimeForStorage(new Date());
    await SignalService.createSignal({
      eventId,
      type: 'user_copy',
      content: copiedText,
      slateNodePath,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      behaviorMeta: {
        actionCount: 1,
        lastActionTime: now,
      },
    });
  }
});

// 监听用户提问操作（从选中文本打开 AI Chat）
function onUserQuestionFromSelection(
  eventId: string,
  selectedText: string,
  questionText: string,
  conversationId: string
): void {
  const { slateNodePath } = findSlateNodeByText(eventId, selectedText);
  const now = formatTimeForStorage(new Date());
  
  SignalService.createSignal({
    eventId,
    type: 'user_question',
    content: selectedText,
    slateNodePath,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    behaviorMeta: {
      questionText,
      relatedConversationId: conversationId,
    },
  });
}

// 监听 AI 内容插入操作
function onAIContentInserted(
  targetEventId: string,
  insertedContent: string,
  sourceConversationId: string,
  insertionPath: number[]
): void {
  const now = formatTimeForStorage(new Date());
  SignalService.createSignal({
    eventId: targetEventId,
    type: 'ai_insert',
    content: insertedContent,
    slateNodePath: insertionPath,
    createdAt: now,
    updatedAt: now,
    createdBy: 'ai',
    behaviorMeta: {
      relatedConversationId: sourceConversationId,
    },
  });
}

// 监听反复编辑（debounce 合并同一位置的编辑）
let editTracker: Map<string, { count: number; charCount: number }> = new Map();

function onSlateNodeEdited(
  eventId: string,
  slateNodePath: number[],
  deltaChars: number
): void {
  const key = `${eventId}:${slateNodePath.join('-')}`;
  const existing = editTracker.get(key) || { count: 0, charCount: 0 };
  
  existing.count += 1;
  existing.charCount += Math.abs(deltaChars);
  editTracker.set(key, existing);
  
  // 3 次以上编辑 → 创建 USER_EDIT Signal
  if (existing.count >= 3) {
    const now = formatTimeForStorage(new Date());
    SignalService.createSignal({
      eventId,
      type: 'user_edit',
      content: getSlateNodeText(eventId, slateNodePath),
      slateNodePath,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      behaviorMeta: {
        actionCount: existing.count,
        editCharCount: existing.charCount,
        lastActionTime: now,
      },
    });
    
    editTracker.delete(key);  // 重置计数器
  }
}
```

#### 3.3.2 时间停留行为捕获⭐ 核心

```typescript
// Intersection Observer：监听 Event 进入/离开视口
class DwellTimeTracker {
  private observer: IntersectionObserver;
  private dwellSessions: Map<string, { startTime: number; element: HTMLElement }> = new Map();
  
  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      { threshold: 0.5 }  // 至少 50% 可见才计入停留
    );
  }
  
  // 监听所有 Eventlog 元素
  observeEventlogs(eventlogElements: HTMLElement[]) {
    eventlogElements.forEach(el => {
      this.observer.observe(el);
    });
  }
  
  private async handleIntersection(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const eventId = entry.target.getAttribute('data-event-id');
      if (!eventId) continue;
      
      if (entry.isIntersecting) {
        // 进入视口 → 开始计时
        this.dwellSessions.set(eventId, {
          startTime: Date.now(),
          element: entry.target as HTMLElement,
        });
      } else {
        // 离开视口 → 结束计时
        const session = this.dwellSessions.get(eventId);
        if (!session) continue;
        
        const duration = Date.now() - session.startTime;
        
        // 只记录停留 > 5 秒的会话
        if (duration > 5000) {
          await this.recordDwellTime(eventId, session.startTime, Date.now(), duration);
        }
        
        this.dwellSessions.delete(eventId);
      }
    }
  }
  
  private async recordDwellTime(
    eventId: string,
    startTime: number,
    endTime: number,
    duration: number
  ) {
    const existing = await SignalService.findSignal({
      eventId,
      type: 'dwell_time_event',
    });
    
    if (existing) {
      // 更新累计停留时间
      const newSessions = [
        ...(existing.behaviorMeta?.dwellSessions || []),
        {
          startTime: formatTimeForStorage(new Date(startTime)),
          endTime: formatTimeForStorage(new Date(endTime)),
          duration,
        },
      ];
      
      const totalDwellTime = (existing.behaviorMeta?.totalDwellTime || 0) + duration;
      const sessionCount = newSessions.length;
      const averageDwellTime = totalDwellTime / sessionCount;
      const maxDwellTime = Math.max(
        existing.behaviorMeta?.maxDwellTime || 0,
        duration
      );
      
      await SignalService.updateSignal(existing.id, {
        updatedAt: formatTimeForStorage(new Date()),
        behaviorMeta: {
          totalDwellTime,
          dwellSessions: newSessions,
          averageDwellTime,
          maxDwellTime,
          actionCount: sessionCount,
          lastActionTime: formatTimeForStorage(new Date()),
        },
        // 停留时间越长 → 置信度越高
        confidence: Math.min(0.3 + (totalDwellTime / 120000), 1.0),  // 2分钟 = 1.0
      });
    } else {
      // 创建新 Signal
      const now = formatTimeForStorage(new Date());
      await SignalService.createSignal({
        eventId,
        type: 'dwell_time_event',
        content: '',  // Event 级别不需要具体文本
        createdAt: now,
        updatedAt: now,
        createdBy: 'user',
        behaviorMeta: {
          totalDwellTime: duration,
          dwellSessions: [{
            startTime: formatTimeForStorage(new Date(startTime)),
            endTime: formatTimeForStorage(new Date(endTime)),
            duration,
          }],
          averageDwellTime: duration,
          maxDwellTime: duration,
          actionCount: 1,
        },
        confidence: Math.min(0.3 + (duration / 120000), 1.0),
      });
    }
  }
  
  // 页面卸载时保存当前所有会话
  async flushAllSessions() {
    const promises = Array.from(this.dwellSessions.entries()).map(
      ([eventId, session]) => {
        const duration = Date.now() - session.startTime;
        if (duration > 5000) {
          return this.recordDwellTime(eventId, session.startTime, Date.now(), duration);
        }
      }
    );
    
    await Promise.all(promises);
    this.dwellSessions.clear();
  }
}

// 初始化停留时间跟踪器
const dwellTimeTracker = new DwellTimeTracker();

// 页面加载时观察所有 Eventlog
function initDwellTimeTracking() {
  const eventlogElements = document.querySelectorAll('[data-event-id]');
  dwellTimeTracker.observeEventlogs(Array.from(eventlogElements) as HTMLElement[]);
}

// 页面卸载时保存数据
window.addEventListener('beforeunload', () => {
  dwellTimeTracker.flushAllSessions();
});

// 监听编辑器焦点时长
class FocusTimeTracker {
  private focusStart: number | null = null;
  private eventId: string | null = null;
  
  onFocus(eventId: string) {
    this.eventId = eventId;
    this.focusStart = Date.now();
  }
  
  async onBlur() {
    if (!this.focusStart || !this.eventId) return;
    
    const duration = Date.now() - this.focusStart;
    
    // 焦点时长 > 10 秒才记录
    if (duration > 10000) {
      const existing = await SignalService.findSignal({
        eventId: this.eventId,
        type: 'focus_time',
      });
      
      if (existing) {
        await SignalService.updateSignal(existing.id, {
          updatedAt: formatTimeForStorage(new Date()),
          behaviorMeta: {
            focusDuration: (existing.behaviorMeta?.focusDuration || 0) + duration,
            focusSessions: (existing.behaviorMeta?.focusSessions || 0) + 1,
            lastActionTime: formatTimeForStorage(new Date()),
          },
        });
      } else {
        const now = formatTimeForStorage(new Date());
        await SignalService.createSignal({
          eventId: this.eventId,
          type: 'focus_time',
          content: '',
          createdAt: now,
          updatedAt: now,
          createdBy: 'user',
          behaviorMeta: {
            focusDuration: duration,
            focusSessions: 1,
          },
          confidence: Math.min(0.2 + (duration / 300000), 1.0),  // 5分钟 = 1.0
        });
      }
    }
    
    this.focusStart = null;
    this.eventId = null;
  }
}

const focusTimeTracker = new FocusTimeTracker();

// 绑定到 Slate 编辑器
slateEditor.on('focus', (eventId) => focusTimeTracker.onFocus(eventId));
slateEditor.on('blur', () => focusTimeTracker.onBlur());
```

#### 3.3.3 键盘行为信号捕获⭐ 核心

```typescript
// 键盘行为分析器
class KeyboardBehaviorTracker {
  private lastKeyTime: number = 0;
  private typingIntervals: number[] = [];
  private deleteSequence: { start: number; chars: number } | null = null;
  private pauseCount: number = 0;
  
  private eventId: string | null = null;
  private slateNodePath: number[] | null = null;
  
  constructor(eventId: string, slateNodePath: number[]) {
    this.eventId = eventId;
    this.slateNodePath = slateNodePath;
  }
  
  onKeyDown(e: KeyboardEvent) {
    const now = Date.now();
    
    // 记录按键间隔
    if (this.lastKeyTime > 0) {
      const interval = now - this.lastKeyTime;
      this.typingIntervals.push(interval);
      
      // 检测暂停（> 3 秒）
      if (interval > 3000) {
        this.pauseCount++;
      }
    }
    
    this.lastKeyTime = now;
    
    // 检测删除行为
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (!this.deleteSequence) {
        this.deleteSequence = { start: now, chars: 0 };
      }
      this.deleteSequence.chars++;
    } else if (this.deleteSequence) {
      // 删除序列结束 → 检查是否为"删除重写"
      if (this.deleteSequence.chars > 5) {
        this.recordDeleteRewrite(this.deleteSequence.chars);
      }
      this.deleteSequence = null;
    }
  }
  
  async flush() {
    if (this.typingIntervals.length < 10) return;  // 数据不足
    
    // 计算输入节奏统计
    const fastSegments = this.typingIntervals.filter(i => i < 200).length;
    const slowSegments = this.typingIntervals.filter(i => i > 1000).length;
    const avgInterval = this.typingIntervals.reduce((a, b) => a + b, 0) / this.typingIntervals.length;
    const typingSpeed = 60000 / avgInterval;  // 字符/分钟
    const now = formatTimeForStorage(new Date());
    await SignalService.createSignal({
      eventId: this.eventId!,
      type: 'typing_rhythm',
      content: '',
      slateNodePath: this.slateNodePath!,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      behaviorMeta: {
        typingSpeed,
        fastTypingSegments: fastSegments,
        slowTypingSegments: slowSegments,
        pauseCount: this.pauseCount,
      },
      // 缓慢输入 + 多次暂停 → 高权重（表示思考）
      confidence: Math.min(0.3 + (slowSegments * 0.05) + (this.pauseCount * 0.1), 1.0),
    });
    
    // 重置
    this.typingIntervals = [];
    this.pauseCount = 0;
  }
  
  private async recordDeleteRewrite(deletedChars: number) {
    const existing = await SignalService.findSignal({
      eventId: this.eventId!,
      type: 'delete_rewrite',
      slateNodePath: this.slateNodePath!,
    });
    
    if (existing) {
      await SignalService.updateSignal(existing.id, {
        updatedAt: formatTimeForStorage(new Date()),
        behaviorMeta: {
          deleteCount: (existing.behaviorMeta?.deleteCount || 0) + 1,
          deletedChars: (existing.behaviorMeta?.deletedChars || 0) + deletedChars,
          rewriteCount: (existing.behaviorMeta?.rewriteCount || 0) + 1,
          lastActionTime: formatTimeForStorage(new Date()),
        },
        // 重写次数越多 → 该内容越重要/难以表达
        confidence: Math.min(0.5 + (existing.behaviorMeta?.rewriteCount || 0) * 0.15, 1.0),
      });
    } else {
      const now = formatTimeForStorage(new Date());
      await SignalService.createSignal({
        eventId: this.eventId!,
        type: 'delete_rewrite',
        content: getSlateNodeText(this.eventId!, this.slateNodePath!),
        slateNodePath: this.slateNodePath!,
        createdAt: now,
        updatedAt: now,
        createdBy: 'user',
        behaviorMeta: {
          deleteCount: 1,
          deletedChars,
          rewriteCount: 1,
        },
        confidence: 0.5,
      });
    }
  }
}

// 为每个 Eventlog 创建键盘跟踪器
const keyboardTrackers = new Map<string, KeyboardBehaviorTracker>();

slateEditor.on('keydown', (e: KeyboardEvent, eventId: string, slateNodePath: number[]) => {
  const key = `${eventId}:${slateNodePath.join('-')}`;
  
  if (!keyboardTrackers.has(key)) {
    keyboardTrackers.set(key, new KeyboardBehaviorTracker(eventId, slateNodePath));
  }
  
  keyboardTrackers.get(key)!.onKeyDown(e);
});

// 定期刷新键盘行为数据（每 30 秒）
setInterval(() => {
  keyboardTrackers.forEach(tracker => tracker.flush());
}, 30000);
```

#### 3.3.4 鼠标行为信号捕获⭐ 核心

```typescript
// 鼠标悬停跟踪器
class MouseHoverTracker {
  private hoverStart: number | null = null;
  private hoveredElement: HTMLElement | null = null;
  
  onMouseEnter(element: HTMLElement, eventId: string, slateNodePath: number[]) {
    this.hoverStart = Date.now();
    this.hoveredElement = element;
    element.dataset.eventId = eventId;
    element.dataset.nodePath = JSON.stringify(slateNodePath);
  }
  
  async onMouseLeave(element: HTMLElement) {
    if (!this.hoverStart || this.hoveredElement !== element) return;
    
    const duration = Date.now() - this.hoverStart;
    
    // 悬停 > 2 秒才记录
    if (duration > 2000) {
      const eventId = element.dataset.eventId!;
      const slateNodePath = JSON.parse(element.dataset.nodePath!);
      const hoveredText = element.textContent || '';
      
      const existing = await SignalService.findSignal({
        eventId,
        type: 'mouse_hover',
        slateNodePath,
      });
      
      if (existing) {
        await SignalService.updateSignal(existing.id, {
          updatedAt: formatTimeForStorage(new Date()),
          behaviorMeta: {
            hoverDuration: (existing.behaviorMeta?.hoverDuration || 0) + duration,
            hoverCount: (existing.behaviorMeta?.hoverCount || 0) + 1,
            lastActionTime: formatTimeForStorage(new Date()),
          },
          // 悬停越久 → 权重越高
          confidence: Math.min(0.3 + (duration / 10000), 1.0),  // 10秒 = 1.0
        });
      } else {
        const now = formatTimeForStorage(new Date());
        await SignalService.createSignal({
          eventId,
          type: 'mouse_hover',
          content: hoveredText,
          slateNodePath,
          createdAt: now,
          updatedAt: now,
          createdBy: 'user',
          behaviorMeta: {
            hoverDuration: duration,
            hoverCount: 1,
          },
          confidence: Math.min(0.3 + (duration / 10000), 1.0),
        });
      }
    }
    
    this.hoverStart = null;
    this.hoveredElement = null;
  }
}

const mouseHoverTracker = new MouseHoverTracker();

// 绑定到所有文本节点
document.addEventListener('mouseenter', (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('slate-text-node')) {
    const eventId = target.closest('[data-event-id]')?.getAttribute('data-event-id');
    const slateNodePath = getSlateNodePath(target);
    if (eventId && slateNodePath) {
      mouseHoverTracker.onMouseEnter(target, eventId, slateNodePath);
    }
  }
}, true);

document.addEventListener('mouseleave', (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('slate-text-node')) {
    mouseHoverTracker.onMouseLeave(target);
  }
}, true);

// 滚动行为跟踪器
class ScrollBehaviorTracker {
  private lastScrollY: number = 0;
  private lastScrollTime: number = 0;
  private scrollBackCount: number = 0;
  private scrollPauseCount: number = 0;
  private pauseTimer: NodeJS.Timeout | null = null;
  
  onScroll(eventId: string) {
    const now = Date.now();
    const currentScrollY = window.scrollY;
    
    // 检测向上滚动（回滚）
    if (currentScrollY < this.lastScrollY - 100) {  // 向上滚动 > 100px
      this.scrollBackCount++;
    }
    
    // 计算滚动速度
    const scrollDistance = Math.abs(currentScrollY - this.lastScrollY);
    const scrollTime = now - this.lastScrollTime;
    const scrollSpeed = scrollDistance / (scrollTime / 1000);  // 像素/秒
    
    // 检测滚动暂停
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
    }
    
    this.pauseTimer = setTimeout(() => {
      this.scrollPauseCount++;
      this.recordScrollBehavior(eventId, scrollSpeed);
    }, 1000);  // 1秒不滚动 = 暂停
    
    this.lastScrollY = currentScrollY;
    this.lastScrollTime = now;
  }
  
  private async recordScrollBehavior(eventId: string, scrollSpeed: number) {
    const existing = await SignalService.findSignal({
      eventId,
      type: 'scroll_behavior',
    });
    
    if (existing) {
      await SignalService.updateSignal(existing.id, {
        updatedAt: formatTimeForStorage(new Date()),
        behaviorMeta: {
          scrollSpeed: (existing.behaviorMeta?.scrollSpeed || 0 + scrollSpeed) / 2,  // 平均速度
          scrollBackCount: (existing.behaviorMeta?.scrollBackCount || 0) + this.scrollBackCount,
          scrollPauseCount: (existing.behaviorMeta?.scrollPauseCount || 0) + this.scrollPauseCount,
          lastActionTime: formatTimeForStorage(new Date()),
        },
        // 回滚次数越多 → 该内容越重要（重复查看）
        confidence: Math.min(0.2 + (this.scrollBackCount * 0.2), 1.0),
      });
    } else {
      const now = formatTimeForStorage(new Date());
      await SignalService.createSignal({
        eventId,
        type: 'scroll_behavior',
        content: '',
        createdAt: now,
        updatedAt: now,
        createdBy: 'user',
        behaviorMeta: {
          scrollSpeed,
          scrollBackCount: this.scrollBackCount,
          scrollPauseCount: this.scrollPauseCount,
        },
        confidence: Math.min(0.2 + (this.scrollBackCount * 0.2), 1.0),
      });
    }
    
    // 重置计数器
    this.scrollBackCount = 0;
    this.scrollPauseCount = 0;
  }
}

const scrollTracker = new ScrollBehaviorTracker();

window.addEventListener('scroll', () => {
  const currentEventId = getCurrentVisibleEventId();  // 获取当前可见的主 Event
  if (currentEventId) {
    scrollTracker.onScroll(currentEventId);
  }
});
```

#### 3.3.5 综合行为模式检测

```typescript
// 深度工作会话检测
class DeepWorkSessionDetector {
  async detect(eventId: string): Promise<void> {
    // 查询相关的行为 Signal
    const focusSignal = await SignalService.findSignal({
      eventId,
      type: 'focus_time',
    });
    
    const typingSignal = await SignalService.findSignal({
      eventId,
      type: 'typing_rhythm',
    });
    
    const deleteRewriteSignal = await SignalService.findSignal({
      eventId,
      type: 'delete_rewrite',
    });
    
    // 判断是否为深度工作：
    // 1. 焦点时长 > 10 分钟
    // 2. 缓慢输入片段 > 快速输入片段（思考型输入）
    // 3. 有删除重写行为（打磨内容）
    const focusDuration = focusSignal?.behaviorMeta?.focusDuration || 0;
    const slowTyping = typingSignal?.behaviorMeta?.slowTypingSegments || 0;
    const fastTyping = typingSignal?.behaviorMeta?.fastTypingSegments || 0;
    const rewriteCount = deleteRewriteSignal?.behaviorMeta?.rewriteCount || 0;
    
    if (
      focusDuration > 600000 &&  // > 10 分钟
      slowTyping > fastTyping &&
      rewriteCount > 2
    ) {
      // 计算深度工作评分（0-100）
      const deepWorkScore = Math.min(
        (focusDuration / 1800000) * 40 +  // 焦点时长占 40 分（30分钟满分）
        (slowTyping / (slowTyping + fastTyping)) * 30 +  // 缓慢输入占 30 分
        Math.min(rewriteCount * 10, 30),  // 重写次数占 30 分（3次满分）
        100
      );
      
      await SignalService.createSignal({
        eventId,
        type: 'deep_work_session',
        content: '',
        createdAt: formatTimeForStorage(new Date()),
        updatedAt: formatTimeForStorage(new Date()),
        createdBy: 'user',
        behaviorMeta: {
          focusDuration,
          deepWorkScore,
          actionCount: 1,
        },
        confidence: deepWorkScore / 100,  // 评分越高 → 置信度越高
      });
    }
  }
}

// 重复访问模式检测
class RevisitPatternDetector {
  private visitHistory: Map<string, string[]> = new Map();
  
  recordVisit(eventId: string) {
    const visits = this.visitHistory.get(eventId) || [];
    visits.push(formatTimeForStorage(new Date()));
    this.visitHistory.set(eventId, visits);
    
    // 3 次以上访问 → 创建 REVISIT_PATTERN Signal
    if (visits.length >= 3) {
      this.createRevisitSignal(eventId, visits);
    }
  }
  
  private async createRevisitSignal(eventId: string, visits: string[]) {
    await SignalService.createSignal({
      eventId,
      type: 'revisit_pattern',
      content: '',
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date()),
      createdBy: 'user',
      behaviorMeta: {
        revisitCount: visits.length,
        revisitTimes: visits,
        lastActionTime: visits[visits.length - 1],
      },
      // 重复访问次数越多 → 权重越高
      confidence: Math.min(0.4 + (visits.length * 0.15), 1.0),
    });
  }
}

const deepWorkDetector = new DeepWorkSessionDetector();
const revisitDetector = new RevisitPatternDetector();

// 每次 Event 获得焦点时记录访问
slateEditor.on('focus', (eventId) => {
  revisitDetector.recordVisit(eventId);
});

// 每次 Event 失去焦点时检测深度工作
slateEditor.on('blur', async (eventId) => {
  await deepWorkDetector.detect(eventId);
});
```
// 监听用户复制操作
document.addEventListener('copy', async (e) => {
  const selection = window.getSelection();
  const copiedText = selection?.toString();
  
  if (!copiedText || copiedText.length < 5) return;  // 忽略短文本
  
  // 查找对应的 Event 和 Slate 节点
  const { eventId, slateNodePath } = findSlateNodeBySelection(selection);
  
  if (!eventId) return;
  
  // 创建/更新 USER_COPY Signal
  const existingSignal = await SignalService.findSignal({
    eventId,
    type: 'user_copy',
    slateNodePath,
  });
  
  if (existingSignal) {
    // 更新复制次数
    await SignalService.updateSignal(existingSignal.id, {
      updatedAt: formatTimeForStorage(new Date()),
      behaviorMeta: {
        actionCount: (existingSignal.behaviorMeta?.actionCount || 0) + 1,
        lastActionTime: formatTimeForStorage(new Date()),
      },
    });
  } else {
    // 创建新 Signal
    const now = formatTimeForStorage(new Date());
    await SignalService.createSignal({
      eventId,
      type: 'user_copy',
      content: copiedText,
      slateNodePath,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      behaviorMeta: {
        actionCount: 1,
        lastActionTime: now,
      },
    });
  }
});

// 监听用户提问操作（从选中文本打开 AI Chat）
function onUserQuestionFromSelection(
  eventId: string,
  selectedText: string,
  questionText: string,
  conversationId: string
): void {
  const { slateNodePath } = findSlateNodeByText(eventId, selectedText);
  const now = formatTimeForStorage(new Date());
  
  SignalService.createSignal({
    eventId,
    type: 'user_question',
    content: selectedText,
    slateNodePath,
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    behaviorMeta: {
      questionText,
      relatedConversationId: conversationId,
    },
  });
}

// 监听 AI 内容插入操作
function onAIContentInserted(
  targetEventId: string,
  insertedContent: string,
  sourceConversationId: string,
  insertionPath: number[]
): void {
  const now = formatTimeForStorage(new Date());
  SignalService.createSignal({
    eventId: targetEventId,
    type: 'ai_insert',
    content: insertedContent,
    slateNodePath: insertionPath,
    createdAt: now,
    updatedAt: now,
    createdBy: 'ai',
    behaviorMeta: {
      relatedConversationId: sourceConversationId,
    },
  });
}

// 监听反复编辑（debounce 合并同一位置的编辑）
let editTracker: Map<string, { count: number; charCount: number }> = new Map();

function onSlateNodeEdited(
  eventId: string,
  slateNodePath: number[],
  deltaChars: number
): void {
  const key = `${eventId}:${slateNodePath.join('-')}`;
  const existing = editTracker.get(key) || { count: 0, charCount: 0 };
  
  existing.count += 1;
  existing.charCount += Math.abs(deltaChars);
  editTracker.set(key, existing);
  
  // 3 次以上编辑 → 创建 USER_EDIT Signal
  if (existing.count >= 3) {
    const now = formatTimeForStorage(new Date());
    SignalService.createSignal({
      eventId,
      type: 'user_edit',
      content: getSlateNodeText(eventId, slateNodePath),
      slateNodePath,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      behaviorMeta: {
        actionCount: existing.count,
        editCharCount: existing.charCount,
        lastActionTime: now,
      },
    });
    
    editTracker.delete(key);  // 重置计数器
  }
}
```

### 3.4 Signal 预处理与清洗（Dealing with "Dirty" Semantics）

用户维护的语义确实会是"脏"的，系统需要做智能清洗：

```typescript
// Signal 预处理管道
async function preprocessSignal(rawSignal: Partial<Signal>): Promise<Signal> {
  let cleanedSignal = { ...rawSignal };
  
  // 1️⃣ 文本清洗
  cleanedSignal.content = cleanText(rawSignal.content);
  
  // 2️⃣ 去重检测（同一位置的重复 Signal）
  const duplicates = await findDuplicateSignals(
    rawSignal.eventId,
    rawSignal.slateNodePath,
    rawSignal.type
  );
  
  if (duplicates.length > 0) {
    // 合并逻辑：保留最新，累加行为次数
    const merged = mergeDuplicateSignals(duplicates, cleanedSignal);
    return merged;
  }
  
  // 3️⃣ 语义冲突检测（同一文本有多个语义标记）
  const conflictingSignals = await findConflictingSignals(
    rawSignal.eventId,
    rawSignal.slateNodePath
  );
  
  if (conflictingSignals.length > 0) {
    // 策略：保留置信度最高/最近的标记
    cleanedSignal.confidence = resolveConflictConfidence(
      conflictingSignals,
      cleanedSignal
    );
  }
  
  // 4️⃣ 行为信号权重计算（多次复制/编辑 → 提高重要性）
  if (cleanedSignal.behaviorMeta?.actionCount > 5) {
    cleanedSignal.confidence = Math.min(
      (cleanedSignal.confidence || 0.5) + 0.2,
      1.0
    );
  }
  
  // 5️⃣ 自动类型修正（用户标错了语义）
  if (cleanedSignal.type === 'question' && !hasQuestionMarkers(cleanedSignal.content)) {
    // 疑问标记但没有问号 → 降低置信度或转为 highlight
    cleanedSignal.confidence = 0.3;
    cleanedSignal.type = 'highlight';  // 自动修正
  }
  
  return cleanedSignal as Signal;
}

// 文本清洗
function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')  // 移除 HTML 标签
    .replace(/\s+/g, ' ')     // 合并空白符
    .trim()
    .slice(0, 1000);          // 限制长度
}

// 去重检测
async function findDuplicateSignals(
  eventId: string,
  slateNodePath: number[],
  type: SignalType
): Promise<Signal[]> {
  return await db.signals
    .where({ eventId, type })
    .filter(s => 
      JSON.stringify(s.slateNodePath) === JSON.stringify(slateNodePath)
    )
    .toArray();
}

// 合并重复 Signal
function mergeDuplicateSignals(
  existing: Signal[],
  newSignal: Partial<Signal>
): Signal {
  const latest = existing.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
  
  return {
    ...latest,
    content: newSignal.content || latest.content,
    updatedAt: formatTimeForStorage(new Date()),
    behaviorMeta: {
      actionCount: (latest.behaviorMeta?.actionCount || 0) + 1,
      lastActionTime: formatTimeForStorage(new Date()),
    },
    confidence: Math.min((latest.confidence || 0.5) + 0.1, 1.0),
  };
}
```

### 3.5 Embedding 生成与存储

```typescript
// Embedding 生成服务
class EmbeddingService {
  private model = 'text-embedding-3-small';  // OpenAI 模型
  private batchSize = 100;  // 批量处理
  
  // 为单个 Signal 生成 embedding
  async generateEmbedding(signal: Signal): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: this.model,
      input: this.prepareTextForEmbedding(signal),
    });
    
    return response.data[0].embedding;
  }
  
  // 批量生成 embedding（性能优化）
  async batchGenerateEmbeddings(signals: Signal[]): Promise<Map<string, number[]>> {
    const batches = chunk(signals, this.batchSize);
    const results = new Map<string, number[]>();
    
    for (const batch of batches) {
      const texts = batch.map(s => this.prepareTextForEmbedding(s));
      const response = await openai.embeddings.create({
        model: this.model,
        input: texts,
      });
      
      batch.forEach((signal, idx) => {
        results.set(signal.id, response.data[idx].embedding);
      });
    }
    
    return results;
  }
  
  // 准备 embedding 输入文本（包含上下文）
  private prepareTextForEmbedding(signal: Signal): string {
    // 策略：Signal 内容 + 上下文（前后 50 字）+ 类型标签
    const context = this.getContextAroundSignal(signal);
    return `[${signal.type}] ${signal.content} | Context: ${context}`;
  }
  
  // 获取 Signal 周围的上下文文本
  private getContextAroundSignal(signal: Signal): string {
    const eventlog = getEventLog(signal.eventId);
    if (!eventlog) return '';
    
    const fullText = extractPlainText(eventlog.slateJson);
    const signalIndex = fullText.indexOf(signal.content);
    
    if (signalIndex === -1) return '';
    
    const start = Math.max(0, signalIndex - 50);
    const end = Math.min(fullText.length, signalIndex + signal.content.length + 50);
    
    return fullText.slice(start, end);
  }
  
  // 向量相似度搜索
  async searchSimilarSignals(
    queryText: string,
    limit: number = 10
  ): Promise<Array<{ signal: Signal; similarity: number }>> {
    // 1. 生成查询向量
    const queryEmbedding = await this.generateEmbedding({
      content: queryText,
      type: 'highlight',  // 类型不影响 embedding
    } as Signal);
    
    // 2. 通过 signal_embeddings（Derived Store）做向量检索
    const matches = await SignalEmbeddingService.searchByEmbedding(queryEmbedding, {
      topK: limit,
      threshold: 0,
    });

    // 3. 回表拿到 Signal 实体（用于构建 Prompt/展示）
    const signals = await Promise.all(matches.map(m => SignalService.getSignal(m.signalId)));
    return matches
      .map((m, idx) => ({
        signal: signals[idx],
        similarity: m.similarity,
      }))
      .filter(x => Boolean(x.signal));
  }
}

// 余弦相似度计算
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}
```

### 3.6 Signal 参与 AI 检索的完整流程（包含行为权重）

```typescript
// AI 月报生成示例（包含时间停留和键盘鼠标行为权重）
async function generateMonthlyReport(year: number, month: number): Promise<string> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  // 1️⃣ 查询时间范围内的所有 Signal
  const signals = await SignalService.querySignals({
    startTime: formatTimeForStorage(startDate),
    endTime: formatTimeForStorage(endDate),
    status: 'confirmed',  // 只查询确认的 Signal
  });
  
  // 2️⃣ 计算综合权重（基于多维度行为）
  const signalsWithWeight = signals.map(signal => {
    let weight = 1.0;  // 基础权重
    
    // 语义标记权重
    const semanticWeights: Record<string, number> = {
      'highlight': 3.0,      // 重点标记 ×3
      'brilliant': 2.5,      // 精彩片段 ×2.5
      'action_item': 2.0,    // 待办事项 ×2
      'question': 1.5,       // 疑问点 ×1.5
      'confirm': 1.5,        // 确认 ×1.5
      'advantage': 1.3,      // 优势 ×1.3
      'disadvantage': 1.3,   // 劣势 ×1.3
    };
    
    if (semanticWeights[signal.type]) {
      weight *= semanticWeights[signal.type];
    }
    
    // 时间停留权重⭐
    if (signal.type === 'dwell_time_event') {
      const dwellTime = signal.behaviorMeta?.totalDwellTime || 0;
      if (dwellTime > 120000) {  // > 2 分钟
        weight *= 3.0;  // 长时间停留 = 极度重要
      } else if (dwellTime > 60000) {  // > 1 分钟
        weight *= 2.0;
      } else if (dwellTime > 30000) {  // > 30 秒
        weight *= 1.5;
      }
      
      // 重复访问加权
      const sessions = signal.behaviorMeta?.dwellSessions?.length || 0;
      if (sessions > 3) {
        weight *= 1.5;  // 多次查看 = 持续重要
      }
    }
    
    // 焦点时长权重⭐
    if (signal.type === 'focus_time') {
      const focusDuration = signal.behaviorMeta?.focusDuration || 0;
      if (focusDuration > 600000) {  // > 10 分钟
        weight *= 3.0;  // 长时间编辑 = 极度重要
      } else if (focusDuration > 300000) {  // > 5 分钟
        weight *= 2.0;
      }
    }
    
    // 键盘行为权重⭐
    if (signal.type === 'typing_rhythm') {
      const slowSegments = signal.behaviorMeta?.slowTypingSegments || 0;
      const pauseCount = signal.behaviorMeta?.pauseCount || 0;
      
      // 缓慢输入 + 多次暂停 = 思考型内容 = 重要
      if (slowSegments > 10 && pauseCount > 5) {
        weight *= 2.5;
      } else if (slowSegments > 5) {
        weight *= 1.5;
      }
    }
    
    if (signal.type === 'delete_rewrite') {
      const rewriteCount = signal.behaviorMeta?.rewriteCount || 0;
      
      // 反复删除重写 = 打磨内容 = 重要
      if (rewriteCount > 5) {
        weight *= 2.5;
      } else if (rewriteCount > 3) {
        weight *= 2.0;
      } else if (rewriteCount > 1) {
        weight *= 1.5;
      }
    }
    
    // 鼠标行为权重⭐
    if (signal.type === 'mouse_hover') {
      const hoverDuration = signal.behaviorMeta?.hoverDuration || 0;
      const hoverCount = signal.behaviorMeta?.hoverCount || 0;
      
      // 长时间悬停 = 阅读/思考 = 重要
      if (hoverDuration > 10000 || hoverCount > 3) {  // > 10秒 或 > 3次
        weight *= 2.0;
      } else if (hoverDuration > 5000) {
        weight *= 1.5;
      }
    }
    
    if (signal.type === 'scroll_behavior') {
      const scrollBackCount = signal.behaviorMeta?.scrollBackCount || 0;
      
      // 反复回滚查看 = 重复阅读 = 重要
      if (scrollBackCount > 3) {
        weight *= 2.0;
      } else if (scrollBackCount > 1) {
        weight *= 1.5;
      }
    }
    
    // 显式操作权重
    if (signal.type === 'user_copy') {
      const copyCount = signal.behaviorMeta?.actionCount || 0;
      
      // 多次复制 = 极度重要
      if (copyCount > 3) {
        weight *= 3.0;
      } else if (copyCount > 1) {
        weight *= 2.0;
      } else {
        weight *= 1.5;
      }
    }
    
    if (signal.type === 'user_question') {
      weight *= 2.5;  // 提问 = 疑问/不理解 = 重要
    }
    
    if (signal.type === 'ai_insert') {
      weight *= 2.0;  // AI 内容插入 = 精华确认 = 重要
    }
    
    if (signal.type === 'user_star') {
      weight *= 3.0;  // 手动收藏 = 显式重要 = 极度重要
    }
    
    // 综合行为模式权重
    if (signal.type === 'deep_work_session') {
      const deepWorkScore = signal.behaviorMeta?.deepWorkScore || 0;
      weight *= 1.0 + (deepWorkScore / 50);  // 深度工作评分 → 1.0-3.0 权重
    }
    
    if (signal.type === 'revisit_pattern') {
      const revisitCount = signal.behaviorMeta?.revisitCount || 0;
      weight *= 1.0 + (revisitCount * 0.3);  // 重复访问次数 → 权重累加
    }
    
    // 置信度加权
    weight *= (signal.confidence || 0.5);
    
    return { signal, weight };
  });
  
  // 3️⃣ 按权重排序
  const sortedSignals = signalsWithWeight.sort((a, b) => b.weight - a.weight);
  
  // 4️⃣ 按类型分组（保留权重信息）
  const grouped = sortedSignals.reduce((acc, { signal, weight }) => {
    if (!acc[signal.type]) {
      acc[signal.type] = [];
    }
    acc[signal.type].push({ signal, weight });
    return acc;
  }, {} as Record<string, Array<{ signal: Signal; weight: number }>>);
  
  // 5️⃣ 构建差异化权重的 Prompt
  const promptParts: string[] = [];
  
  // 极度重要内容（权重 > 5.0）
  const extremelyImportant = sortedSignals
    .filter(({ weight }) => weight > 5.0)
    .slice(0, 10);
  
  if (extremelyImportant.length > 0) {
    promptParts.push('【极度重要】（用户投入大量时间、反复编辑、多次复制/收藏）');
    extremelyImportant.forEach(({ signal, weight }) => {
      const metadata = buildSignalMetadata(signal);
      promptParts.push(`- ${signal.content} [权重: ${weight.toFixed(1)}] ${metadata}`);
    });
  }
  
  // 重点内容（权重 3.0-5.0）
  const important = sortedSignals
    .filter(({ weight }) => weight >= 3.0 && weight < 5.0)
    .slice(0, 20);
  
  if (important.length > 0) {
    promptParts.push('\n【重点内容】（用户明确标记或长时间停留）');
    important.forEach(({ signal, weight }) => {
      const metadata = buildSignalMetadata(signal);
      promptParts.push(`- ${signal.content} [权重: ${weight.toFixed(1)}] ${metadata}`);
    });
  }
  
  // 精彩片段（brilliant 类型）
  if (grouped.brilliant?.length > 0) {
    promptParts.push('\n【精彩片段】');
    grouped.brilliant.slice(0, 10).forEach(({ signal, weight }) => {
      promptParts.push(`- ${signal.content} [权重: ${weight.toFixed(1)}]`);
    });
  }
  
  // 待办事项（action_item 类型）
  if (grouped.action_item?.length > 0) {
    promptParts.push('\n【待办事项】');
    grouped.action_item.forEach(({ signal, weight }) => {
      promptParts.push(`- ${signal.content} [权重: ${weight.toFixed(1)}]`);
    });
  }
  
  // 疑问/待确认（question 类型 + user_question 类型）
  const questions = [
    ...(grouped.question || []),
    ...(grouped.user_question || []),
  ].sort((a, b) => b.weight - a.weight);
  
  if (questions.length > 0) {
    promptParts.push('\n【疑问/待确认】（用户提问或标记为疑问）');
    questions.slice(0, 10).forEach(({ signal, weight }) => {
      const questionText = signal.behaviorMeta?.questionText;
      const content = questionText 
        ? `${signal.content} (提问: ${questionText})` 
        : signal.content;
      promptParts.push(`- ${content} [权重: ${weight.toFixed(1)}]`);
    });
  }
  
  // 6️⃣ 调用 LLM 生成总结
  const prompt = `
请根据以下带有权重标记的内容，生成 ${year} 年 ${month} 月的工作总结。
权重说明：
- 权重 > 5.0：用户投入大量时间、反复编辑、多次复制/收藏的极度重要内容
- 权重 3.0-5.0：用户明确标记或长时间停留的重点内容
- 权重 1.5-3.0：普通重要内容
权重越高的内容应该占据更多篇幅。

${promptParts.join('\n')}

要求：
1. 按重要性排序，极度重要内容优先并详细展开
2. 提炼关键主题和成果
3. 指出待解决的问题和疑问
4. 总结约 800 字
  `.trim();
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  
  return completion.choices[0].message.content || '';
}

// 构建 Signal 元数据标签（用于 Prompt）
function buildSignalMetadata(signal: Signal): string {
  const tags: string[] = [];
  
  if (signal.type === 'dwell_time_event') {
    const dwellTime = signal.behaviorMeta?.totalDwellTime || 0;
    const sessions = signal.behaviorMeta?.dwellSessions?.length || 0;
    tags.push(`停留${(dwellTime / 1000).toFixed(0)}秒`);
    if (sessions > 1) {
      tags.push(`查看${sessions}次`);
    }
  }
  
  if (signal.type === 'focus_time') {
    const focusDuration = signal.behaviorMeta?.focusDuration || 0;
    tags.push(`编辑${(focusDuration / 60000).toFixed(1)}分钟`);
  }
  
  if (signal.type === 'user_copy') {
    const copyCount = signal.behaviorMeta?.actionCount || 0;
    tags.push(`复制${copyCount}次`);
  }
  
  if (signal.type === 'delete_rewrite') {
    const rewriteCount = signal.behaviorMeta?.rewriteCount || 0;
    tags.push(`重写${rewriteCount}次`);
  }
  
  if (signal.type === 'typing_rhythm') {
    const pauseCount = signal.behaviorMeta?.pauseCount || 0;
    tags.push(`暂停思考${pauseCount}次`);
  }
  
  if (signal.type === 'scroll_behavior') {
    const scrollBackCount = signal.behaviorMeta?.scrollBackCount || 0;
    if (scrollBackCount > 0) {
      tags.push(`回滚查看${scrollBackCount}次`);
    }
  }
  
  if (signal.type === 'deep_work_session') {
    const deepWorkScore = signal.behaviorMeta?.deepWorkScore || 0;
    tags.push(`深度工作评分${deepWorkScore.toFixed(0)}`);
  }
  
  if (signal.type === 'revisit_pattern') {
    const revisitCount = signal.behaviorMeta?.revisitCount || 0;
    tags.push(`重复访问${revisitCount}次`);
  }
  
  return tags.length > 0 ? `(${tags.join(', ')})` : '';
}

// Signal 统计 API（包含行为维度）
class SignalService {
  async getSignalStats(dateRange?: { start: string; end: string }) {
    const query = db.signals.where('status').equals('confirmed');
    
    let signals = await query.toArray();
    
    if (dateRange) {
      signals = signals.filter(s => 
        s.createdAt >= dateRange.start && s.createdAt <= dateRange.end
      );
    }
    
    // 按类型统计
    const typeStats = signals.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {} as Record<SignalType, number>);
    
    // 按来源统计
    const sourceStats = signals.reduce((acc, s) => {
      acc[s.createdBy] = (acc[s.createdBy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 时间停留统计⭐
    const dwellTimeSignals = signals.filter(s => s.type === 'dwell_time_event');
    const totalDwellTime = dwellTimeSignals.reduce(
      (sum, s) => sum + (s.behaviorMeta?.totalDwellTime || 0),
      0
    );
    const avgDwellTime = dwellTimeSignals.length > 0 
      ? totalDwellTime / dwellTimeSignals.length 
      : 0;
    
    // 焦点时长统计⭐
    const focusTimeSignals = signals.filter(s => s.type === 'focus_time');
    const totalFocusTime = focusTimeSignals.reduce(
      (sum, s) => sum + (s.behaviorMeta?.focusDuration || 0),
      0
    );
    
    // 键盘行为统计⭐
    const deleteRewriteSignals = signals.filter(s => s.type === 'delete_rewrite');
    const totalRewriteCount = deleteRewriteSignals.reduce(
      (sum, s) => sum + (s.behaviorMeta?.rewriteCount || 0),
      0
    );
    
    // 鼠标行为统计⭐
    const hoverSignals = signals.filter(s => s.type === 'mouse_hover');
    const scrollSignals = signals.filter(s => s.type === 'scroll_behavior');
    
    // 高频 Signal（复制/编辑次数最多）
    const topBehaviorSignals = signals
      .filter(s => s.behaviorMeta?.actionCount)
      .sort((a, b) => 
        (b.behaviorMeta?.actionCount || 0) - (a.behaviorMeta?.actionCount || 0)
      )
      .slice(0, 10);
    
    // 深度工作 Event（深度工作评分最高）
    const deepWorkEvents = signals
      .filter(s => s.type === 'deep_work_session')
      .sort((a, b) => 
        (b.behaviorMeta?.deepWorkScore || 0) - (a.behaviorMeta?.deepWorkScore || 0)
      )
      .slice(0, 5);
    
    // 重复访问最多的 Event
    const topRevisitEvents = signals
      .filter(s => s.type === 'revisit_pattern')
      .sort((a, b) => 
        (b.behaviorMeta?.revisitCount || 0) - (a.behaviorMeta?.revisitCount || 0)
      )
      .slice(0, 5);
    
    return {
      total: signals.length,
      typeStats,
      sourceStats,
      
      // 时间维度
      dwellTime: {
        totalMinutes: (totalDwellTime / 60000).toFixed(1),
        avgMinutes: (avgDwellTime / 60000).toFixed(1),
        eventsWithDwell: dwellTimeSignals.length,
      },
      
      focusTime: {
        totalMinutes: (totalFocusTime / 60000).toFixed(1),
        eventsWithFocus: focusTimeSignals.length,
      },
      
      // 键盘维度
      keyboardBehavior: {
        totalRewrites: totalRewriteCount,
        eventsWithRewrite: deleteRewriteSignals.length,
      },
      
      // 鼠标维度
      mouseBehavior: {
        eventsWithHover: hoverSignals.length,
        eventsWithScroll: scrollSignals.length,
      },
      
      // 排行榜
      topBehaviorSignals,
      deepWorkEvents,
      topRevisitEvents,
    };
  }
}
```
async function generateMonthlyReport(year: number, month: number): Promise<string> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  // 1️⃣ 查询时间范围内的所有 Signal
  const signals = await SignalService.querySignals({
    startTime: formatTimeForStorage(startDate),
    endTime: formatTimeForStorage(endDate),
    status: 'confirmed',  // 只查询确认的 Signal
  });
  
  // 2️⃣ 按类型分组
  const grouped = groupBy(signals, 'type');
  
  // 3️⃣ 构建差异化权重的 Prompt
  const promptParts: string[] = [];
  
  // 重点内容（权重 ×3）
  if (grouped.highlight?.length > 0) {
    const highlights = grouped.highlight
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 20);  // 最多 20 条
    
    promptParts.push('【重点内容】（极度重要）');
    highlights.forEach(s => {
      promptParts.push(`- ${s.content} (来自 ${formatDate(s.createdAt)})`);
    });
  }
  
  // 精彩片段（权重 ×2）
  if (grouped.brilliant?.length > 0) {
    promptParts.push('\n【精彩片段】（重要）');
    grouped.brilliant.forEach(s => {
      promptParts.push(`- ${s.content}`);
    });
  }
  
  // 待办事项（权重 ×2）
  if (grouped.action_item?.length > 0) {
    promptParts.push('\n【待办事项】（重要）');
    grouped.action_item.forEach(s => {
      promptParts.push(`- ${s.content}`);
    });
  }
  
  // 疑问点（权重 ×1.5）
  if (grouped.question?.length > 0) {
    promptParts.push('\n【疑问/待确认】');
    grouped.question.forEach(s => {
      promptParts.push(`- ${s.content}`);
    });
  }
  
  // 用户行为信号（额外加权）
  const behaviorSignals = signals.filter(s => 
    ['user_copy', 'user_question', 'ai_insert', 'user_edit'].includes(s.type)
  );
  
  if (behaviorSignals.length > 0) {
    promptParts.push('\n【用户重点关注】（根据复制/提问/编辑行为推断）');
    behaviorSignals.forEach(s => {
      const actionCount = s.behaviorMeta?.actionCount || 1;
      promptParts.push(`- ${s.content} (操作 ${actionCount} 次)`);
    });
  }
  
  // 4️⃣ 调用 LLM 生成总结
  const prompt = `
请根据以下带有权重标记的内容，生成 ${year} 年 ${month} 月的工作总结。
重点内容和用户关注内容应该占据更多篇幅。

${promptParts.join('\n')}

要求：
1. 按重要性排序，重点内容优先
2. 提炼关键主题和成果
3. 指出待解决的问题和疑问
4. 总结约 500 字
  `.trim();
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  
  return completion.choices[0].message.content || '';
}

// Signal 统计 API
class SignalService {
  async getSignalStats(dateRange?: { start: string; end: string }) {
    const query = db.signals.where('status').equals('confirmed');
    
    let signals = await query.toArray();
    
    if (dateRange) {
      signals = signals.filter(s => 
        s.createdAt >= dateRange.start && s.createdAt <= dateRange.end
      );
    }
    
    // 按类型统计
    const typeStats = signals.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {} as Record<SignalType, number>);
    
    // 按来源统计
    const sourceStats = signals.reduce((acc, s) => {
      acc[s.createdBy] = (acc[s.createdBy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // 高频 Signal（复制/编辑次数最多）
    const topBehaviorSignals = signals
      .filter(s => s.behaviorMeta?.actionCount)
      .sort((a, b) => 
        (b.behaviorMeta?.actionCount || 0) - (a.behaviorMeta?.actionCount || 0)
      )
      .slice(0, 10);
    
    return {
      total: signals.length,
      typeStats,
      sourceStats,
      topBehaviorSignals,
    };
  }
}
```

---

## 4. 架构设计建议（更新版）

### 3.1 选项 A：双层架构（Format 保留 + Signal 独立提取）⭐ 推荐

**核心思路**：Format 和 Signal 各司其职，不互相干扰。

```
UI Layer（Slate 编辑器）
  ↓ 用户标记
EventLog.slateJson（格式完整存储）
  ↓ EventService normalize
EventLog.html（Outlook 同步）
  ↓ AI/用户显式标记
SignalService（独立管理）
  ↓ 写入
signals 表（独立存储）
```

**实现路径**：

1. **Format 层（现有，不变）**
   - `EventLog.slateJson` 继续存储完整 Slate JSON（包含所有 bold/color/highlight）
   - `EventLog.html` 继续用于 Outlook 同步
   - EventService 继续负责序列化/反序列化

2. **Signal 层（新增）**
   - 新建 `SignalService`：
     - `createSignal(eventId, type, content, slateNodePath)`：创建信号
     - `getSignals(eventId)`：获取事件的所有信号
     - `querySignals(filters)`：按类型/时间范围查询
     - `deleteSignal(signalId)`：删除信号
   - 新建 `signals` 表（IndexedDB/SQLite）：
     ```sql
     CREATE TABLE signals (
       id TEXT PRIMARY KEY,
       event_id TEXT NOT NULL,
       type TEXT NOT NULL,
       content TEXT NOT NULL,
       slate_node_path TEXT,  -- JSON 数组
       text_range TEXT,       -- JSON 对象
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       deleted_at TEXT,
       created_by TEXT NOT NULL,
       reviewed_at TEXT,
       reviewed_by TEXT,
       confidence REAL,
       status TEXT NOT NULL DEFAULT 'active',
       behavior_meta TEXT,    -- JSON 对象
       INDEX idx_event_signals (event_id),
       INDEX idx_signal_type (type),
       INDEX idx_signal_created_at (created_at),
       INDEX idx_signal_status (status)
     );
     ```

3. **Format → Signal 映射（可选，AI 辅助）**
   - AI 可以扫描 `slateJson`，将特定格式自动转为 Signal：
     ```typescript
     // 示例：黄色高亮 → highlight 信号
     function extractSignalsFromFormat(slateJson: string): Signal[] {
       const nodes = JSON.parse(slateJson);
       const signals: Signal[] = [];
       
       traverseNodes(nodes, (node, path) => {
         if (node.backgroundColor === '#FFFF00') {
           signals.push({
             type: 'highlight',
             content: node.text,
             slateNodePath: path,
           });
         }
       });
       
       return signals;
     }
     ```
   - **用户确认**：AI 提取的 Signal 需要用户确认（避免误判），确认后写入 `signals` 表。

4. **UI 交互层**
   - 用户标记时可以**同时**：
     - 应用格式（黄色高亮）→ 写入 slateJson
     - 显式标记信号类型（弹出菜单选择 "重点/疑问/待办"）→ 写入 signals 表
   - 或者：用户只标格式 → AI 后台扫描 → 推荐 Signal（用户确认）

**优势**：
- ✅ **Format 不丢失**：Outlook 同步往返时格式完整（通过 html）
- ✅ **Signal 可查询**：AI 直接查 signals 表，不需要解析 slateJson
- ✅ **语义明确**：同样是"黄色高亮"，用户可以标记为"重点"或"精彩"，语义不混淆
- ✅ **增量实施**：现有代码不需要大改，Signal 层可以独立迭代

**劣势**：
- ⚠️ **维护成本**：Format 和 Signal 需要保持同步（例如用户删除高亮文本时，需要同步删除对应 Signal）
- ⚠️ **存储冗余**：同一段文本可能既在 slateJson 里，又在 signals 表里

### 3.2 选项 B：Signal 优先架构（Format 从属于 Signal）

**核心思路**：用户的标记直接写成 Signal，Format 只是 Signal 的表现形式。

```
UI Layer（用户标记）
  ↓ 选择信号类型（重点/疑问/待办）
SignalService
  ↓ 写入
signals 表
  ↓ 生成格式
EventLog.slateJson（自动添加对应格式）
```

**实现路径**：
1. 用户标记时先选择 Signal 类型（如"重点"）
2. SignalService 写入 signals 表
3. SignalService 自动更新 slateJson：
   ```typescript
   function applySignalFormat(signal: Signal): void {
     // 为 "重点" 信号添加黄色高亮
     if (signal.type === 'highlight') {
       updateSlateNode(signal.slateNodePath, {
         backgroundColor: '#FFFF00'
       });
     }
   }
   ```

**优势**：
- ✅ **单一数据源**：Signal 是真相，Format 是派生（避免不一致）
- ✅ **语义优先**：用户强制思考"这是什么类型的标记"，而不是"选什么颜色"

**劣势**：
- ❌ **Outlook 兼容性差**：用户在 Outlook 里添加格式时，无法映射到 Signal（因为 Outlook 只返回 html，没有语义）
- ❌ **用户摩擦高**：每次标记都要选类型，可能影响流畅度
- ❌ **迁移成本高**：现有 slateJson 里的格式需要批量转换为 Signal

### 3.3 选项 C：混合架构（Format 兼容 + Signal 可选）

**核心思路**：保留 Format 的自由度，Signal 作为"增强标记"可选添加。

**实现路径**：
1. 用户可以"仅标格式"（快速标黄色高亮）→ 只写 slateJson
2. 用户可以"标格式 + 添加 Signal"（右键菜单：设为重点）→ 同时写 slateJson 和 signals 表
3. AI 可以扫描格式 → 推荐 Signal（用户一键确认）

**优势**：
- ✅ **用户自由**：不强制用户每次都选 Signal 类型
- ✅ **渐进增强**：Signal 层可以逐步完善，不影响现有功能

**劣势**：
- ⚠️ **语义不强制**：可能出现大量"只有格式没有 Signal"的数据 → AI 仍需解析 slateJson

---

## 4. 推荐方案：选项 A（双层架构）

**理由**：
1. **Outlook 兼容性**：4DNote 需要与 Outlook 双向同步，Format 必须保留（通过 html）。
2. **用户体验**：不强制用户每次标记都选类型，保持流畅度。
3. **AI 增强**：Signal 层作为"AI 可查询的增强索引"，逐步从 Format 自动提取 + 用户确认。

**实施路径**：

### Phase 1：Signal 基础设施（P0，预计 1-2 周）
- [ ] 定义完整 `Signal` 类型（包含行为信号；不包含 embedding）`src/types.ts`
- [ ] 创建 `signals` 表 schema（IndexedDB/SQLite）
  ```sql
  CREATE TABLE signals (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- 定位信息
    slate_node_path TEXT,  -- JSON array
    text_range TEXT,       -- JSON object
    
    -- 元数据
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    created_by TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT,
    confidence REAL,
    status TEXT DEFAULT 'active',
    
    -- 行为元数据
    behavior_meta TEXT,  -- JSON object
    
    -- 索引
    INDEX idx_event_signals (event_id),
    INDEX idx_signal_type (type),
    INDEX idx_signal_created_at (created_at),
    INDEX idx_signal_status (status)
  );
  ```

- [ ] 创建 `signal_embeddings` 表 schema（Derived Store，可重建）
  ```sql
  CREATE TABLE signal_embeddings (
    signal_id TEXT PRIMARY KEY,
    embedding_model TEXT NOT NULL,
    embedding_vector BLOB NOT NULL,
    updated_at TEXT NOT NULL,
    INDEX idx_signal_embeddings_model (embedding_model)
  );
  ```
- [ ] 实现 `SignalService` 基础 CRUD
  - `createSignal()`：创建 Signal + 预处理 + 去重
  - `getSignals(eventId)`：获取事件的所有 Signal
  - `querySignals(filters)`：按类型/时间/状态查询
  - `updateSignal()`：更新 Signal（支持合并行为次数）
  - `deleteSignal()`：删除 Signal
  - `expireSignal()`：标记为 expired
- [ ] 添加 Signal 到 SSOT（`docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md`）

### Phase 2：用户行为捕获（P1，预计 2-3 周）⭐ 核心

#### 2.1 显式操作行为（1 周）
- [ ] 实现复制监听：`document.addEventListener('copy')`
  - 创建/更新 `user_copy` Signal
  - 记录复制次数、最近复制时间
  
- [ ] 实现提问监听：从选中文本打开 AI Chat
  - 创建 `user_question` Signal
  - 记录问题内容、关联对话 ID
  
- [ ] 实现 AI 插入监听：从 AI 卡片拖拽/粘贴到 Eventlog
  - 创建 `ai_insert` Signal
  - 记录来源对话 ID
  
- [ ] 实现编辑频次监听：debounce 合并同一位置的编辑
  - 3 次以上编辑 → 创建 `user_edit` Signal
  - 记录编辑次数、累计修改字符数
  
- [ ] 实现手动收藏按钮：`user_star` Signal
  - UI：每个 Eventlog 块右上角星标按钮
  - 点击 → 创建/删除 Signal

#### 2.2 时间停留行为（4-5 天）⭐ 关键
- [ ] 实现 `DwellTimeTracker` 类
  - 使用 `IntersectionObserver` 监听 Event 进入/离开视口
  - 记录 Event 级别停留时长（> 5 秒才记录）
  - 支持多会话累计、平均停留时间、最长停留时间
  
- [ ] 实现段落级停留时长（可选，Phase 3+）
  - 通过鼠标悬停/光标位置判断焦点段落
  - 记录段落级别的停留时长
  
- [ ] 实现 `FocusTimeTracker` 类
  - 监听 Slate 编辑器 `focus`/`blur` 事件
  - 记录焦点持续时长（> 10 秒才记录）
  - 记录焦点会话次数
  
- [ ] 页面卸载时保存数据
  - `window.addEventListener('beforeunload')`
  - 刷新所有未完成的停留会话

#### 2.3 键盘行为捕获（4-5 天）⭐ 关键
- [ ] 实现 `KeyboardBehaviorTracker` 类
  - 监听 `keydown` 事件
  - 记录按键间隔（快速输入 vs 缓慢输入）
  - 检测暂停（> 3 秒停顿）
  - 计算平均打字速度
  
- [ ] 实现删除重写检测
  - 监听 `Backspace`/`Delete` 键
  - 检测连续删除 > 5 个字符
  - 记录删除次数、删除字符数、重写次数
  
- [ ] 定期刷新键盘行为数据
  - 每 30 秒刷新一次（避免数据丢失）
  - 合并同一段落的键盘行为

#### 2.4 鼠标行为捕获（3-4 天）⭐ 关键
- [ ] 实现 `MouseHoverTracker` 类
  - 监听 `mouseenter`/`mouseleave` 事件
  - 记录鼠标悬停时长（> 2 秒才记录）
  - 记录悬停次数、悬停文本
  
- [ ] 实现 `ScrollBehaviorTracker` 类
  - 监听 `scroll` 事件
  - 检测向上滚动（回滚查看）
  - 计算滚动速度（快速略过 vs 缓慢阅读）
  - 检测滚动暂停位置
  
- [ ] 实现文本选中监听（可选）
  - 监听 `selectionchange` 事件
  - 记录用户选中但未复制的文本（中等权重信号）

#### 2.5 综合行为模式检测（2-3 天）
- [ ] 实现 `DeepWorkSessionDetector` 类
  - 综合分析焦点时长、输入节奏、删除重写
  - 判断是否为深度工作会话（> 10 分钟 + 缓慢输入 + 多次暂停）
  - 计算深度工作评分（0-100）
  
- [ ] 实现 `RevisitPatternDetector` 类
  - 记录 Event 的访问历史
  - 检测重复访问（> 3 次）
  - 记录访问时间列表、访问次数

### Phase 3：UI 交互层（P1，预计 2 周）
- [ ] Slate 编辑器右键菜单：
  - "设为重点" → `highlight` Signal
  - "标记疑问" → `question` Signal
  - "设为待办" → `action_item` Signal
  - "精彩片段" → `brilliant` Signal
  
- [ ] Signal 可视化指示器：
  - Eventlog 左侧边栏显示 Signal 图标（如 ⭐🔥❓）
  - 鼠标悬停 → 显示 Signal 类型和时间
  
- [ ] Signal 管理面板：
  - 查看某个 Event 的所有 Signal
  - 编辑/删除 Signal
  - 批量确认 AI 推荐的 Signal
  
- [ ] Slate 与 Signal 的双向同步：
  - 删除格式 → 询问是否删除 Signal
  - 添加 Signal → 可选自动应用格式（用户设置）

### Phase 4：AI 自动提取与预处理（P2，预计 2 周）
- [ ] 实现 `extractSignalsFromFormat()` 扫描器
  - 规则 1：黄色高亮 → `ai_highlight_suggested`
  - 规则 2：问号/疑问词 → `ai_question_detected`
  - 规则 3：TODO/需要 → `ai_action_detected`
  
- [ ] 实现 Signal 预处理管道：
  - 文本清洗（移除 HTML、限制长度）
  - 去重检测（同一位置/类型合并）
  - 语义冲突检测（多个标记 → 保留置信度高的）
  - 行为权重计算（多次操作 → 提高置信度）
  - 自动类型修正（纠正用户标错的语义）
  
- [ ] AI 推荐面板：
  - 显示 AI 扫描到的潜在 Signal
  - 用户一键确认/拒绝/批量处理
  
- [ ] 批量扫描历史事件：
  - 后台任务：扫描过去 3 个月的 Eventlog
  - 生成 AI 推荐 → 用户确认后写入 signals 表

### Phase 5：Embedding 生成与向量检索（P2，预计 2-3 周）
- [ ] 集成 OpenAI Embedding API
  - `EmbeddingService.generateEmbedding(signal)`
  - 批量生成优化（100 个/batch）
  
- [ ] Embedding 存储策略：
  - 统一：独立向量表 `signal_embeddings`（Derived Store，可重建）
  - 可选：在 `signal_embeddings` 上构建本地 ANN 索引（如 hnswlib）
  
- [ ] 准备 embedding 输入文本：
  - Signal 内容 + 上下文（前后 50 字）+ 类型标签
  
- [ ] 向量相似度搜索：
  - `searchSimilarSignals(queryText, limit)`
  - 余弦相似度计算
  - 返回 Top-K 相似 Signal
  
- [ ] 异步 embedding 生成：
  - Signal 创建后 → 异步任务队列 → 生成 embedding
  - 避免阻塞 UI 操作

### Phase 6：Signal 与 Slate 变更的同步（P1，预计 1 周）
- [ ] 实现 `SlateChangeListener`：
  - 监听 `slateJson` 变化（通过 Slate onChange）
  - 检测节点修改/删除/移动
  
- [ ] 实现 `SignalService.handleSlateChange()`：
  - 策略 1：文本轻微修改（<10%）→ 更新 `Signal.content`
  - 策略 2：文本大幅修改（>50%）→ 标记 `status = 'expired'`
  - 策略 3：节点删除 → 删除对应的所有 Signal
  
- [ ] Embedding 重新生成：
  - 文本变化 → 标记 embedding 过期
  - 异步重新生成 embedding

### Phase 7：AI 查询/聚合/统计（P3，预计 1 周）
- [ ] `SignalService.getSignalStats(dateRange)`：
  - 按类型统计（highlight: 12, question: 5）
  - 按来源统计（user: 20, ai: 15）
  - 高频行为 Signal（复制最多、编辑最频繁）
  
- [ ] 重点窗口分析（Granola 式）：
  - 按 Signal 时间戳聚类（5 分钟窗口）
  - 找出"高密度标记区域"→ 差异化总结
  
- [ ] AI Prompt 增强：
  - 月报生成：查询 Signal → 构建差异化权重 Prompt
  - 日报生成：优先展示 `user_copy`/`user_star` Signal
  - 搜索增强：向量检索 Signal → 扩展搜索结果

### Phase 8：Signal 清理与维护（P2，预计 1 周）
- [ ] 定期清理任务（Cron Job）：
  - 删除 90 天前的 `status='expired'` Signal
  - 删除 90 天未确认的 `ai_*_suggested` Signal
  - 压缩 embedding 存储（移除低置信度的向量）
  
- [ ] Signal 完整性检查：
  - 检查 `slateNodePath` 是否仍然有效
  - 检查关联的 Event 是否存在
  - 修复孤立的 Signal

---

## 5. SSOT 约束（立即生效）

### 5.1 Format（格式）约束
- **存储位置**：`EventLog.slateJson`（主存储）+ `EventLog.html`（同步用）+ `Event.title.formatMap`（Title 专用）
- **Owner**：UI 层（Slate 编辑器）+ EventService（序列化）
- **禁止事项**：
  - ❌ 禁止将格式信息提取为 Event 的顶层字段（如 `hasHighlight: boolean`）
  - ❌ 禁止将格式作为业务逻辑的仲裁依据（格式可能在 Outlook 往返时丢失）
  - ❌ 禁止用格式模拟 Signal（如"所有黄色高亮都是重点"）

### 5.2 Signal（信号）约束
- **存储位置**：独立实体/独立表（`signals` 表），**不是 Event 字段**
- **Owner**：`SignalService`（待实现）
- **允许事项**：
  - ✅ Event 可以有 derived 字段 `signalSummary: { highlightCount: number; questionCount: number }`（只读缓存，可重建）
  - ✅ Signal 可以引用 Event：`{ eventId: string; slateNodePath: number[] }`
  - ✅ AI 可以查询 Signal 进行聚合/统计/时间窗口分析
  - ✅ Signal 可以记录用户行为（复制、提问、编辑、插入）
  - ✅ Signal 可以包含 embedding 用于向量检索
- **禁止事项**：
  - ❌ 禁止用 `Event.isXxx` 模拟 Signal（如 `isHighlighted`、`hasQuestions`）
  - ❌ 禁止将 Signal 回写为 Event 的 Core 字段（Signal 是 Derived/Index）
  - ❌ 禁止 Signal 参与 Event 的同步仲裁（Signal 不是 Event 的业务真相）
  - ❌ 禁止在前端逻辑中硬编码"颜色 → 语义"映射（应通过 SignalService）

### 5.3 用户行为 Signal 的特殊约束
- **触发条件必须明确**：每种行为 Signal 必须有清晰的触发逻辑（如"复制操作"、"3 次以上编辑"）
- **幂等性**：同一操作重复触发 → 更新计数，不创建重复 Signal
- **隐私保护**：用户行为数据仅用于本地 AI 分析，不得上传到云端（除非用户明确同意）
- **可撤销**：用户可以查看并删除任何行为 Signal

---

## 6. 关键技术决策（Technical Decisions）

### 6.1 数据库选择：IndexedDB vs SQLite

| 方案 | 优势 | 劣势 | 推荐场景 |
|------|------|------|----------|
| **IndexedDB** | • 浏览器原生支持<br>• 异步 API（不阻塞 UI）<br>• 支持索引/事务 | • API 复杂（需封装）<br>• 查询能力弱（无 SQL）<br>• 容量限制（50MB-无限制，取决于浏览器） | Web 应用 |
| **SQLite** | • 完整 SQL 支持<br>• 查询强大（JOIN/GROUP BY）<br>• 跨平台（Electron/桌面） | • 需要额外库（sql.js/better-sqlite3）<br>• 同步 API（可能阻塞） | Electron 桌面应用 |

**4DNote 推荐**：
- **Phase 1-3**：使用 IndexedDB（快速验证，Web 兼容）
- **Phase 4+**：迁移到 SQLite（Electron 环境，支持复杂查询）

**实施策略**：
```typescript
// 抽象 SignalRepository，支持多后端
interface SignalRepository {
  create(signal: Signal): Promise<void>;
  findById(id: string): Promise<Signal | null>;
  query(filters: SignalFilters): Promise<Signal[]>;
  update(id: string, updates: Partial<Signal>): Promise<void>;
  delete(id: string): Promise<void>;
}

// IndexedDB 实现
class IndexedDBSignalRepository implements SignalRepository {
  // ...
}

// SQLite 实现（未来）
class SQLiteSignalRepository implements SignalRepository {
  // ...
}

// 依赖注入
const signalRepo: SignalRepository = 
  isElectron() 
    ? new SQLiteSignalRepository() 
    : new IndexedDBSignalRepository();
```

### 6.2 Embedding 存储策略

| 方案 | 优势 | 劣势 | 成本 |
|------|------|------|------|
| **方案 A：独立向量表 + 暴力搜索** | • signals 与 embeddings 解耦<br>• 可重建 | • 查询慢（需扫描 embeddings） | 免费 |
| **方案 B：独立向量表 + ANN 索引** | • 查询快（ANN 索引）<br>• 支持大规模向量（百万级） | • 实现复杂<br>• 需要额外维护 | 免费 |
| **方案 C：云端向量数据库（Pinecone/Weaviate）** | • 性能极强<br>• 无需维护<br>• 支持分布式 | • 需要网络<br>• 隐私风险<br>• 按量付费 | $$$ |

**4DNote 推荐**：
- **Phase 5（初期）**：方案 A（独立向量表）+ 暴力搜索（Signal 数量 < 10,000）
- **Phase 5（后期）**：方案 B（本地 ANN 索引，如 hnswlib）
- **未来（企业版）**：方案 C（Pinecone/Weaviate）

**ANN 索引方案**（方案 B 实现）：
```typescript
import { HierarchicalNSW } from 'hnswlib-node';

class LocalVectorIndex {
  private index: HierarchicalNSW;
  
  constructor(dimension: number = 1536) {  // OpenAI text-embedding-3-small
    this.index = new HierarchicalNSW('cosine', dimension);
    this.index.initIndex(10000);  // 最多 10,000 个向量
  }
  
  async addSignalEmbedding(signalId: string, embedding: number[]): Promise<void> {
    const label = this.signalIdToLabel(signalId);
    this.index.addPoint(embedding, label);
  }
  
  async search(queryEmbedding: number[], k: number = 10): Promise<string[]> {
    const result = this.index.searchKnn(queryEmbedding, k);
    return result.neighbors.map(label => this.labelToSignalId(label));
  }
}
```

### 6.3 Signal 与 Slate 的耦合度

**问题**：Signal 依赖 `slateNodePath` 定位文本，但 Slate 节点可能变化（用户编辑、合并、拆分）。

**解决方案**：引入 **Stable ID** 机制

```typescript
// 方案：为每个 Slate 节点添加稳定 ID
interface SlateNodeWithId extends SlateNode {
  id?: string;  // 稳定 ID（创建时生成，不随编辑变化）
}

// Signal 同时存储 path 和 nodeId
interface Signal {
  slateNodePath?: number[];  // 快速定位（可能失效）
  slateNodeId?: string;      // 稳定定位（永久有效）
}

// 查找逻辑：优先用 nodeId，fallback 到 path
function findSlateNode(signal: Signal): SlateNode | null {
  if (signal.slateNodeId) {
    // 通过 ID 查找（遍历树）
    return findNodeById(signal.eventId, signal.slateNodeId);
  } else if (signal.slateNodePath) {
    // 通过 path 查找（可能失效）
    return getNodeAtPath(signal.eventId, signal.slateNodePath);
  }
  return null;
}
```

**实施计划**：
- Phase 1-2：仅使用 `slateNodePath`（简单，但可能失效）
- Phase 6：引入 `slateNodeId`（稳定，支持节点移动）

### 6.4 Signal 预处理：何时清洗？

| 时机 | 优势 | 劣势 |
|------|------|------|
| **创建时清洗**（Write-time） | • 查询快（已清洗）<br>• 数据一致 | • 创建慢<br>• 难以修改规则 |
| **查询时清洗**（Read-time） | • 创建快<br>• 规则灵活 | • 查询慢<br>• 重复计算 |
| **异步清洗**（Async） | • 不阻塞 UI<br>• 可批量处理 | • 短期不一致<br>• 实现复杂 |

**4DNote 推荐**：混合策略
- **轻量清洗**（Write-time）：去重、文本截断、HTML 清理
- **重型清洗**（Async）：embedding 生成、语义冲突检测、自动类型修正

```typescript
// 创建时清洗（同步，轻量）
async function createSignal(raw: Partial<Signal>): Promise<Signal> {
  const cleaned = {
    ...raw,
    content: cleanTextLight(raw.content),  // 移除 HTML、截断
  };
  
  await db.signals.add(cleaned);
  
  // 异步重型清洗
  queueAsyncCleanup(cleaned.id);
  
  return cleaned;
}

// 异步清洗（后台任务）
async function asyncCleanupSignal(signalId: string): Promise<void> {
  const signal = await db.signals.get(signalId);
  if (!signal) return;
  
  // 检测冲突
  const conflicts = await findConflictingSignals(signal);
  if (conflicts.length > 0) {
    signal.confidence = resolveConflictConfidence(conflicts, signal);
  }
  
  // 生成 embedding
  if (!signal.embedding) {
    signal.embedding = await embeddingService.generateEmbedding(signal);
  }
  
  await db.signals.update(signalId, signal);
}
```

---

## 7. 实施检查清单（更新版）

### 代码层面
- [ ] `src/types.ts`：定义 `Signal` 接口
- [ ] `src/services/SignalService.ts`：实现 Signal CRUD
- [ ] `src/services/storage/schema.ts`：添加 `signals` 表 schema
- [ ] `src/components/Slate/plugins/`：添加 Signal 标记插件

### 文档层面
- [ ] `docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md`：添加 Signal 到 Out of Scope（当前）+ 未来 Owner 约束
- [ ] `docs/architecture/SIGNAL_ARCHITECTURE.md`：Signal 设计文档（本文档）
- [ ] `docs/PRD/SIGNAL_FEATURE_PRD.md`：Signal 功能 PRD

### 测试层面
- [ ] Unit Test：SignalService CRUD
- [ ] Integration Test：Signal ↔ EventLog 同步
- [ ] E2E Test：用户标记 Signal → AI 查询

---

## 8. FAQ（更新版）

**Q1：为什么不直接用格式（如黄色高亮）代表"重点"？**

A：原因有三：
1. **语义模糊**：同样的黄色高亮，用户可能表达"重点"、"精彩"、"疑问"等不同意图。
2. **格式不可靠**：Outlook 往返时格式可能丢失/修改（如 Outlook 只支持部分颜色）。
3. **查询性能差**：需要解析完整 slateJson 字符串，无法做高效聚合（如"本周有多少重点标记"）。

Signal 提供显式语义 + 独立存储，解决这三个问题。

---

**Q2：Signal 会不会和 Format 不一致？**

A：会，而且这是**设计预期**：
- Signal 是"用户显式标记的意图"（语义层）
- Format 是"视觉表现"（表现层）

例如：用户可以删除黄色高亮但保留 Signal（表示"这段话很重要，但我不想高亮显示"），或者反过来（仅高亮，不创建 Signal）。

**处理策略**：
- 删除格式时 → 询问用户是否同时删除 Signal
- 删除 Signal 时 → 可选同时删除格式（用户设置）

---

**Q3：AI 自动提取的 Signal 会不会误判？**

A：会，因此需要**多层防护**：
1. **置信度**：AI 推荐的 Signal 带有 `confidence` 分数（0.0-1.0）
2. **状态标记**：AI 推荐默认 `status='active'`（待确认），用户确认后转为 `'confirmed'`
3. **用户审核**：UI 显示 AI 推荐列表，用户一键确认/拒绝/批量处理
4. **自动过期**：90 天未确认的 AI 推荐自动标记为 `'expired'`

**未确认的 Signal 不参与 AI 查询**（只有 `status='confirmed'` 的才用于生成总结）。

---

**Q4：Format 和 Signal 哪个优先级更高？**

A：取决于场景：
- **UI 展示**：Format 优先（用户看到的是格式）
- **AI 查询**：Signal 优先（AI 查询的是语义）
- **Outlook 同步**：Format 优先（通过 html）
- **搜索**：Signal 优先（向量检索 Signal，然后展开到 Eventlog）

---

**Q5：如果用户在 Outlook 里标了格式，怎么同步回来？**

A：两步走：
1. **格式同步**（立即）：Outlook 返回 html → EventService 解析为 slateJson → Format 保留
2. **Signal 推荐**（异步）：AI 扫描新增的 Format → 推荐 Signal → 用户确认（可选）

用户在 Outlook 里的标记**不会自动创建 Signal**（避免误判），但会生成 AI 推荐供用户审核。

---

**Q6：用户行为 Signal（复制/提问/编辑）会不会太多，导致噪音？**

A：控制策略：
1. **最小文本长度**：复制/选中的文本 < 5 个字符 → 忽略
2. **去重合并**：同一位置的重复操作 → 累加计数，不创建新 Signal
3. **权重衰减**：90 天前的行为 Signal 自动降低权重（或删除）
4. **用户可删除**：行为 Signal 在 UI 中完全透明，用户可随时查看和删除

---

**Q7：Signal 的 embedding 会占用多少存储空间？**

A：估算（OpenAI `text-embedding-3-small`）：
- 向量维度：1536
- 每个维度：4 bytes（float32）
- 单个 embedding：1536 × 4 = 6KB
- 10,000 个 Signal：6KB × 10,000 = **60MB**

**优化策略**：
- 使用更小的模型（如 384 维）→ 1.5KB/个
- 压缩存储（如量化为 int8）→ 0.75KB/个
- 定期清理低置信度/过期 Signal 的 embedding

---

**Q8：如果 Slate 节点被大幅修改，Signal 怎么办？**

A：分策略处理：
1. **轻微修改**（< 10% 字符变化）：
   - 更新 `Signal.content`
   - 重新生成 embedding
   
2. **大幅修改**（> 50% 字符变化）：
   - 标记 `status='expired'`
   - 提示用户确认是否保留/删除
   
3. **节点删除**：
   - 自动删除所有关联 Signal
   - 可选：保留在"已删除 Signal"列表（90 天后永久删除）

**检测机制**：通过 Slate `onChange` 事件 + Levenshtein 距离计算文本相似度。

---

**Q9：Signal 与 Event 的关系是什么？Event 删除时 Signal 怎么办？**

A：关系：
- Event 是"一等公民"（Core Entity）
- Signal 是"二等公民"（Derived/Index Entity）
- Signal **必须**关联一个 Event（`eventId` 外键）

**级联删除**：
- Event 被删除 → 自动删除所有关联的 Signal
- Event 被归档 → Signal 保留，但标记为 `status='archived'`（不参与 AI 查询）

**实现**：
```typescript
async function deleteEvent(eventId: string): Promise<void> {
  // 1. 删除 Event
  await db.events.delete(eventId);
  
  // 2. 级联删除 Signal
  await db.signals.where({ eventId }).delete();
  
  // 3. 清理 embedding（如果存储在独立向量表）
  await vectorIndex.deleteByEventId(eventId);
}
```

---

**Q10：用户能否自定义 Signal 类型？**

A：Phase 1-7 **不支持**（固定类型），Phase 8+ **可选支持**。

**原因**：
- 固定类型便于 AI 理解（预训练的语义）
- 自定义类型需要用户定义"颜色 → 语义"映射（复杂度高）

**未来方案**（Phase 8+）：
```typescript
interface CustomSignalType {
  id: string;
  name: string;          // 如"待确认"、"灵感"
  description: string;   // 给 AI 的语义描述
  defaultFormat?: {      // 默认格式
    color?: string;
    backgroundColor?: string;
  };
}

// 用户创建自定义类型
const customType = await SignalService.createCustomType({
  name: '灵感',
  description: '创新想法、突发奇想、需要进一步探索的概念',
  defaultFormat: { backgroundColor: '#FFD700', bold: true },
});

// 使用自定义类型
await SignalService.createSignal({
  type: customType.id,  // 'custom:灵感'
  content: '可以用 AI 自动提取会议重点',
});
```

---

**Q11：Signal 是否支持跨 Event 的关联？**

A：Phase 1-7 **不支持**，每个 Signal 只关联一个 Event。

**未来方案**（Phase 9+）：支持"Signal 组"，将多个 Event 的 Signal 关联起来：
```typescript
interface SignalGroup {
  id: string;
  name: string;          // 如"项目 A 重点集合"
  signalIds: string[];   // 关联的 Signal ID 列表
  createdAt: string;
}

// 创建 Signal 组
const group = await SignalService.createGroup({
  name: '项目 A 重点集合',
  signalIds: [signal1.id, signal2.id, signal3.id],
});

// AI 查询组
const groupSignals = await SignalService.getGroupSignals(group.id);
```

**用例**：
- 跨多天的会议笔记 → 统一查询所有"项目 A"相关的重点
- 读书笔记 → 按章节/主题分组查询

---

## 9. 参考资料（更新版）

### 代码文件
- 现有类型定义：`src/types.ts:214-230`（EventLog）、`src/types.ts:340-373`（TextFormatSegment）
- Slate 序列化：`src/utils/slateSerializer.ts`
- EventService：`src/services/EventService.ts`（Event CRUD，可参考 Signal CRUD 设计）
- IndexedDB schema：`src/services/storage/schema.ts`（可扩展 signals 表）

### 设计文档
- PRD 定义：`docs/features/Eventlog Enhanced PRD（补充：Granola 风格重点标注与分层整理输出）.md`
- 架构口径：`docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md`（Event 字段契约，Signal 需遵守相同 SSOT 原则）
- 本文档：`docs/architecture/SIGNAL_ARCHITECTURE_PROPOSAL.md`

### 外部参考
- **Granola**：会议笔记应用，通过"重点窗口"差异化总结（Signal 的时间聚类灵感来源）
- **OpenAI Embeddings**：[text-embedding-3-small](https://platform.openai.com/docs/guides/embeddings)（1536 维，性能/成本平衡）
- **hnswlib**：[hnswlib-node](https://github.com/yoshoku/hnswlib-node)（本地 ANN 索引库）
- **Slate.js**：[Slate 文档](https://docs.slatejs.org/)（富文本编辑器核心）

### 技术栈选型
- **向量数据库**（可选）：
  - [Pinecone](https://www.pinecone.io/)：云端托管，性能强（$$$）
  - [Weaviate](https://weaviate.io/)：开源，可自托管（$$）
  - [Milvus](https://milvus.io/)：开源，适合大规模（$）
  - **hnswlib-node**：本地库，轻量级（免费）✅ 推荐
  
- **文本相似度**：
  - Levenshtein 距离（编辑距离）：检测 Slate 节点变化
  - 余弦相似度（Cosine Similarity）：embedding 向量检索
  
- **NLP 库**（可选，用于关键词提取）：
  - [compromise](https://github.com/spencermountain/compromise)：轻量级英文 NLP
  - [nodejieba](https://github.com/yanyiwu/nodejieba)：中文分词

---

## 10. 附录：完整 Signal 数据流示例

### 示例：用户标记重点并提问

```typescript
// 1️⃣ 用户在 Eventlog 中选中文本并标黄色高亮
const selection = window.getSelection();
const selectedText = "需要在下周之前完成原型设计";

// Slate 编辑器应用格式
Transforms.setNodes(editor, {
  backgroundColor: '#FFFF00',
}, { at: selection });

// slateJson 更新（自动）
const updatedSlateJson = JSON.stringify(editor.children);
await EventService.updateEventLog(eventId, { slateJson: updatedSlateJson });

// 2️⃣ 用户右键选择"设为重点"
const now = formatTimeForStorage(new Date());
const signal = await SignalService.createSignal({
  eventId,
  type: 'highlight',
  content: selectedText,
  slateNodePath: [0, 2, 1],  // Slate 节点路径
  textRange: { start: 15, end: 33 },
  createdAt: now,
  updatedAt: now,
  createdBy: 'user',
  confidence: 1.0,
  status: 'confirmed',
});

// 3️⃣ 异步生成 embedding（写入 signal_embeddings Derived Store）
setTimeout(async () => {
  await SignalEmbeddingService.ensureEmbedding(signal.id);
}, 1000);

// 4️⃣ 用户继续选中相同文本并提问
function onUserOpenAIChat(selectedText: string, question: string) {
  const conversationId = uuid();
  const now = formatTimeForStorage(new Date());
  
  // 创建 USER_QUESTION Signal
  SignalService.createSignal({
    eventId,
    type: 'user_question',
    content: selectedText,
    slateNodePath: [0, 2, 1],
    createdAt: now,
    updatedAt: now,
    createdBy: 'user',
    behaviorMeta: {
      questionText: question,  // "原型设计包括哪些内容？"
      relatedConversationId: conversationId,
    },
  });
}

// 5️⃣ 一周后，AI 生成周报
const weeklySignals = await SignalService.querySignals({
  startTime: '2026-01-01 00:00:00',
  endTime: '2026-01-07 23:59:59',
  status: 'confirmed',
});

const prompt = buildWeeklyPrompt(weeklySignals);
// Prompt 示例：
// 【重点内容】（极度重要，复制1次，提问1次）
// - 需要在下周之前完成原型设计 (2026-01-06)

const summary = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }],
});

console.log(summary.choices[0].message.content);
// 输出：
// 本周重点工作：
// 1. 原型设计任务（截止下周）- 用户重点关注并提问了具体内容
// ...
```

### 示例：用户复制文本（行为 Signal）

```typescript
// 用户复制操作（浏览器事件）
document.addEventListener('copy', async (e) => {
  const selection = window.getSelection();
  const copiedText = selection?.toString();
  
  if (!copiedText || copiedText.length < 5) return;
  
  const { eventId, slateNodePath } = findSlateNodeBySelection(selection);
  if (!eventId) return;
  
  // 查找已有的 USER_COPY Signal
  const existing = await SignalService.findSignal({
    eventId,
    type: 'user_copy',
    slateNodePath,
  });
  
  if (existing) {
    // 更新复制次数
    await SignalService.updateSignal(existing.id, {
      updatedAt: formatTimeForStorage(new Date()),
      behaviorMeta: {
        actionCount: (existing.behaviorMeta?.actionCount || 0) + 1,
        lastActionTime: formatTimeForStorage(new Date()),
      },
      confidence: Math.min((existing.confidence || 0.5) + 0.1, 1.0),  // 提高置信度
    });
  } else {
    // 创建新 Signal
    const now = formatTimeForStorage(new Date());
    await SignalService.createSignal({
      eventId,
      type: 'user_copy',
      content: copiedText,
      slateNodePath,
      createdAt: now,
      updatedAt: now,
      createdBy: 'user',
      behaviorMeta: {
        actionCount: 1,
        lastActionTime: now,
      },
      confidence: 0.6,  // 初始置信度
    });
  }
});

// 月报生成时优先展示高频复制内容
const topCopied = await SignalService.querySignals({
  type: 'user_copy',
  startTime: '2026-01-01 00:00:00',
  endTime: '2026-01-31 23:59:59',
})
  .then(signals => signals
    .sort((a, b) => 
      (b.behaviorMeta?.actionCount || 0) - (a.behaviorMeta?.actionCount || 0)
    )
    .slice(0, 5)
  );

console.log(topCopied);
// [
//   { content: "需要在下周之前完成原型设计", actionCount: 5 },
//   { content: "预算控制在 10 万以内", actionCount: 3 },
//   ...
// ]
```

### 示例：Slate 节点被修改，Signal 同步更新

```typescript
// Slate onChange 事件
editor.onChange = async () => {
  const operations = editor.operations;
  
  for (const op of operations) {
    if (op.type === 'remove_text' || op.type === 'insert_text') {
      // 查找受影响的 Signal
      const affectedSignals = await SignalService.getSignalsByPath(
        eventId,
        op.path
      );
      
      for (const signal of affectedSignals) {
        const newText = getSlateNodeText(eventId, signal.slateNodePath);
        const similarity = calculateSimilarity(signal.content, newText);
        
        if (similarity > 0.9) {
          // 轻微修改 → 更新内容
          await SignalService.updateSignal(signal.id, {
            content: newText,
          });
          
          // 重新生成 embedding（异步）
          queueEmbeddingRegeneration(signal.id);
          
        } else if (similarity > 0.5) {
          // 中度修改 → 询问用户
          showConfirmDialog({
            title: '检测到内容变化',
            message: `标记"${signal.type}"的文本已修改，是否更新？`,
            actions: [
              { label: '更新', action: () => updateSignal(signal.id, newText) },
              { label: '保留原文', action: () => {} },
              { label: '删除标记', action: () => deleteSignal(signal.id) },
            ],
          });
          
        } else {
          // 大幅修改 → 标记过期
          await SignalService.updateSignal(signal.id, {
            status: 'expired',
          });
        }
      }
    }
    
    if (op.type === 'remove_node') {
      // 节点删除 → 删除所有 Signal
      const deletedSignals = await SignalService.getSignalsByPath(
        eventId,
        op.path
      );
      
      for (const signal of deletedSignals) {
        await SignalService.deleteSignal(signal.id);
      }
    }
  }
};

// 文本相似度计算（Levenshtein 距离）
function calculateSimilarity(text1: string, text2: string): number {
  const distance = levenshteinDistance(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);
  return 1 - (distance / maxLength);
}
```

---

## 11. 总结与行动计划

### Signal 架构核心价值

1. **AI 可查询**：独立 signals 表 + 索引 → O(1) 查询，无需解析 slateJson
2. **语义明确**：显式类型（highlight/question/action_item）→ AI 准确理解用户意图
3. **聚合能力**：支持统计/时间窗口/向量检索 → 生成差异化总结（Granola 风格）
4. **行为洞察**⭐：捕获时间停留、键盘节奏、鼠标行为 → 推断用户真实关注点
5. **多维度权重**⭐：综合语义标记、时间投入、交互频次 → 精准 RAG 索引
6. **可扩展**：未来支持自定义类型、跨 Event 关联、Signal 组

### 用户行为捕获的完整覆盖⭐

Signal 架构已全面覆盖用户在笔记中的关键行为数据：

| 行为维度 | 捕获指标 | Signal 类型 | 权重计算 | RAG 应用 |
|---------|---------|------------|---------|---------|
| **时间停留** | Event 停留时长<br>段落停留时长<br>编辑器焦点时长 | `dwell_time_event`<br>`dwell_time_paragraph`<br>`focus_time` | 停留 > 2分钟 ×3.0<br>焦点 > 10分钟 ×3.0 | 长时间停留的内容优先检索 |
| **键盘节奏** | 输入速度变化<br>暂停次数<br>删除重写次数 | `typing_rhythm`<br>`delete_rewrite` | 缓慢输入+多次暂停 ×2.5<br>重写 > 5次 ×2.5 | 思考型内容/打磨内容优先 |
| **鼠标行为** | 悬停时长<br>滚动回滚次数<br>选中模式 | `mouse_hover`<br>`scroll_behavior`<br>`selection_pattern` | 悬停 > 10秒 ×2.0<br>回滚 > 3次 ×2.0 | 反复查看的内容优先 |
| **显式操作** | 复制次数<br>提问次数<br>AI 插入<br>手动收藏 | `user_copy`<br>`user_question`<br>`ai_insert`<br>`user_star` | 复制 > 3次 ×3.0<br>提问 ×2.5<br>收藏 ×3.0 | 用户明确标记的重点内容 |
| **综合模式** | 深度工作评分<br>重复访问次数 | `deep_work_session`<br>`revisit_pattern` | 深度工作评分/50<br>访问次数 ×0.3 累加 | 用户投入大量时间的内容 |

### 时间和行为数据的 RAG 优势⭐

相比纯语义标记（highlight/question），时间和行为数据提供了**用户真实意图的客观证据**：

1. **无需用户主动标记**：
   - 语义标记需要用户手动选择"设为重点/疑问"
   - 时间/行为数据自动采集，无感知
   
2. **更准确的重要性判断**：
   - 用户可能忘记标记重点，但无法伪装停留时间和编辑行为
   - 深度工作 10 分钟 + 反复重写 5 次 = 极度重要（比黄色高亮更可靠）
   
3. **多维度交叉验证**：
   - 语义标记（highlight）+ 长时间停留 + 多次复制 = 确认重要
   - 仅有语义标记但无行为信号 = 可能是误标
   
4. **时间窗口聚类**（Granola 风格）：
   - 按停留时间戳聚类 Signal → 找出"高密度标记区域"
   - 深度工作会话时间段 → 该时段内容权重 ×2
   
5. **差异化总结**：
   - AI 生成月报时，极度重要内容（权重 > 5.0）详细展开
   - 普通内容（权重 < 2.0）简略提及或省略
   - 基于行为数据的权重分配比基于颜色更科学

### 数据隐私与存储

- **本地优先**：所有行为数据存储在本地 IndexedDB/SQLite，不上传云端（除非用户明确同意）
- **用户可删除**：行为 Signal 完全透明，用户可随时查看和删除
- **匿名聚合**（可选）：仅上传聚合统计（如"平均停留时长"），不上传具体内容
- **隐私设置**：用户可关闭特定行为跟踪（如鼠标悬停、键盘节奏）

### 与 Format 的关系

- **Format**（格式）：Presentation Layer，存储在 slateJson/html，Outlook 同步必需
- **Signal**（信号）：Semantic Layer，独立存储，AI 查询必需
- **双向同步**：Format → Signal（AI 推荐），Signal → Format（可选自动应用）
- **不一致允许**：Signal 和 Format 可以不匹配（例如保留 Signal 但删除格式）

### 关键技术决策

| 决策点 | 推荐方案 | 理由 |
|--------|---------|------|
| 数据库 | Phase 1-3: IndexedDB<br>Phase 4+: SQLite | Web 兼容 → 桌面性能 |
| Embedding 存储 | Phase 5 初期: BLOB<br>Phase 5 后期: hnswlib ANN | 简单验证 → 性能优化 |
| Slate 耦合 | Phase 1-2: slateNodePath<br>Phase 6: slateNodeId | 快速实现 → 稳定定位 |
| 预处理时机 | Write-time 轻量清洗<br>Async 重型清洗 | 不阻塞 UI + 数据一致 |

### 立即行动（本周）

1. ✅ **完善架构文档**（本文档）→ 包含数据流、预处理、embedding、检索、UI 修改处理
2. ⏭️ **更新 SSOT 约束**：在 `docs/architecture/EVENT_FIELD_CONTRACT_SSOT_ARCHITECTURE.md` 中添加 Signal 相关约束
3. ⏭️ **定义 Signal 类型**：在 `src/types.ts` 中添加完整接口
4. ⏭️ **创建 signals 表 schema**：在 `src/services/storage/schema.ts` 中添加表定义
5. ⏭️ **实现 SignalService 骨架**：CRUD API（暂无业务逻辑，先跑通流程）

### 下一步（1-2 周）

- Phase 1：Signal 基础设施（P0）
- Phase 2：用户行为捕获（P1）
- Phase 3：UI 交互层（P1）

### 长期规划（1-2 个月）

- Phase 4：AI 自动提取与预处理（P2）
- Phase 5：Embedding 生成与向量检索（P2）
- Phase 6：Signal 与 Slate 变更同步（P1）
- Phase 7：AI 查询/聚合/统计（P3）
- Phase 8：Signal 清理与维护（P2）

---

**本文档版本**：v2.0（完整工程实现版）  
**最后更新**：2026-01-06  
**维护者**：4DNote Architecture Team  
**状态**：🚧 架构设计阶段 → 待实施
