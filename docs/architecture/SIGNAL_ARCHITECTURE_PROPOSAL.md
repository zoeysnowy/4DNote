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
- `HIGHLIGHT`：这是重点（我想记住/需要详细记录）
- `CONFIRM`：确认/同意（用于归纳决策）
- `QUESTION`：这是个问题/待确认点
- `ACTION_ITEM`：待办/行动项
- `ADVANTAGE`：优势/亮点
- `DISADVANTAGE`：劣势/问题
- `BRILLIANT`：精彩片段

**存储位置**：**独立实体/独立表**（不是 Event 字段）
```typescript
// 建议结构
interface Signal {
  id: string;
  eventId: string;         // 关联事件
  type: SignalType;        // 信号类型
  content: string;         // 标记的文本内容
  timestamp: string;       // 标记时间（用于"重点窗口"）
  
  // 定位信息（用于回溯到 slateJson 具体位置）
  slateNodePath?: number[];  // Slate 节点路径（如 [0, 2, 1]）
  textRange?: { start: number; end: number };  // 文本范围
  
  // 元数据
  createdAt: string;
  createdBy: '4dnote' | 'ai' | 'user';  // 来源：用户手动/AI 自动提取
  
  // AI 提取时的置信度（可选）
  confidence?: number;
}

type SignalType = 
  | 'highlight'      // 重点
  | 'question'       // 疑问
  | 'action_item'    // 待办
  | 'advantage'      // 优势
  | 'disadvantage'   // 劣势
  | 'brilliant'      // 精彩
  | 'confirm';       // 确认
```

**Owner**：`SignalService`（待实现，负责 CRUD + 一致性）

**AI 使用方式**：
- 直接查询：`SELECT * FROM signals WHERE eventId = ? AND type = 'question'`
- 聚合统计：`SELECT type, COUNT(*) FROM signals GROUP BY type`
- 时间窗口：`SELECT * FROM signals WHERE timestamp BETWEEN ? AND ?`（用于 Granola 式"重点窗口"）

---

## 3. 架构设计建议

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
       timestamp TEXT NOT NULL,
       slate_node_path TEXT,  -- JSON 数组
       text_range TEXT,       -- JSON 对象
       created_at TEXT NOT NULL,
       created_by TEXT NOT NULL,
       confidence REAL,
       INDEX idx_event_signals (event_id),
       INDEX idx_signal_type (type),
       INDEX idx_signal_time (timestamp)
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

### Phase 1：Signal 基础设施（P0）
- [ ] 定义 `Signal` 类型（`src/types.ts`）
- [ ] 创建 `signals` 表（IndexedDB/SQLite schema）
- [ ] 实现 `SignalService`（CRUD API）
- [ ] 添加 Signal 到 SSOT（`docs/refactor/EVENT_FIELD_CONTRACT_EXECUTABLE.md`）

### Phase 2：UI 交互层（P1）
- [ ] Slate 编辑器：右键菜单"设为重点/疑问/待办"
- [ ] Signal 标记时同步更新 slateJson 格式（可选）
- [ ] Signal 管理面板：查看/编辑/删除事件的所有 Signal

### Phase 3：AI 自动提取（P2）
- [ ] 实现 `extractSignalsFromFormat(slateJson)` 扫描器
- [ ] AI 推荐 Signal（用户一键确认）
- [ ] 批量扫描历史事件 → 生成 Signal 索引

### Phase 4：AI 查询/聚合（P3）
- [ ] Signal 统计：`getSignalStats(dateRange)` → "本周有 12 个重点、5 个疑问"
- [ ] 重点窗口：按 Signal 时间戳聚类 → Granola 式"差异化总结"
- [ ] AI Prompt 增强：查询 Signal → 生成更精准的 Daily/Weekly 总结

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
- **禁止事项**：
  - ❌ 禁止用 `Event.isXxx` 模拟 Signal（如 `isHighlighted`、`hasQuestions`）
  - ❌ 禁止将 Signal 回写为 Event 的 Core 字段（Signal 是 Derived/Index）
  - ❌ 禁止 Signal 参与 Event 的同步仲裁（Signal 不是 Event 的业务真相）

---

## 6. 实施检查清单

### 代码层面
- [ ] `src/types.ts`：定义 `Signal` 接口
- [ ] `src/services/SignalService.ts`：实现 Signal CRUD
- [ ] `src/services/storage/schema.ts`：添加 `signals` 表 schema
- [ ] `src/components/Slate/plugins/`：添加 Signal 标记插件

### 文档层面
- [ ] `docs/refactor/EVENT_FIELD_CONTRACT_EXECUTABLE.md`：添加 Signal 到 Out of Scope（当前）+ 未来 Owner 约束
- [ ] `docs/architecture/SIGNAL_ARCHITECTURE.md`：Signal 设计文档（本文档）
- [ ] `docs/PRD/SIGNAL_FEATURE_PRD.md`：Signal 功能 PRD

### 测试层面
- [ ] Unit Test：SignalService CRUD
- [ ] Integration Test：Signal ↔ EventLog 同步
- [ ] E2E Test：用户标记 Signal → AI 查询

---

## 7. FAQ

**Q1：为什么不直接用格式（如黄色高亮）代表"重点"？**
A：格式可能在 Outlook 往返时丢失/修改；且同样的格式可能表达不同意图（用户自己也不一定记得"黄色 = 重点"还是"精彩"）。Signal 提供显式语义，更可靠。

**Q2：Signal 会不会和 Format 不一致？**
A：可能。但 Signal 是"用户显式标记的意图"，Format 是"视觉表现"；即使不一致也不是 Bug。例如用户可以删除黄色高亮但保留 Signal（表示"这段话很重要，但我不想高亮显示"）。

**Q3：AI 自动提取的 Signal 会不会误判？**
A：会。因此需要"用户确认"机制：AI 推荐 → 用户一键确认 → 写入 signals 表。未确认的推荐不参与 AI 查询。

**Q4：Format 和 Signal 哪个优先级更高？**
A：
- **UI 展示**：Format 优先（用户看到的是格式）
- **AI 查询**：Signal 优先（AI 查询的是语义）
- **Outlook 同步**：Format 优先（通过 html）

**Q5：如果用户在 Outlook 里标了格式，怎么同步回来？**
A：
1. Outlook 返回 html → EventService 解析为 slateJson → Format 保留
2. AI 扫描新增的 Format → 推荐 Signal → 用户确认（可选）

---

## 8. 参考资料

- 现有类型定义：`src/types.ts:214-230`（EventLog）、`src/types.ts:340-373`（TextFormatSegment）
- Slate 序列化：`src/utils/slateSerializer.ts`
- PRD 定义：`docs/features/Eventlog Enhanced PRD（补充：Granola 风格重点标注与分层整理输出）.md`
- 架构口径：`docs/refactor/EVENT_FIELD_CONTRACT_EXECUTABLE.md`
