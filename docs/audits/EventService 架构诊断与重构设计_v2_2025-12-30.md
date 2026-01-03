# EventService 架构诊断与重构设计 v2（Slate 富元素 + Outlook 双向同步）

**版本**：v2
**日期**：2025-12-30
**状态**：✅ 进行中（实施指导）
**取代**：`docs/audits/EventService 架构诊断与重构设计（给 Copilot 的实施指导）.md`（v1，已冻结）

**重构统一入口（实施口径唯一来源）**： [docs/refactor/REFACTOR_MASTER_PLAN_v2.22.md](../refactor/REFACTOR_MASTER_PLAN_v2.22.md)

> 本文档是 EventService/同步/Codec/富元素体系的“设计与实施指导分册”；
> 但执行顺序、术语与对外 API 命名必须与 Master Plan 对齐，避免多文档各写一套口径。

---
## 🎯 架构对齐声明（v2.22 + APP_ARCHITECTURE）

**关键架构约束**（执行时必须遵守）：

1. **ADR-001（树结构真相）**：`parentEventId` 为唯一真相，`childEventIds` 为 legacy 字段
   - ✅ 本文档设计已对齐：三层匹配只需关注 `parentEventId` 恢复

2. **状态分类法（A/B/C/D/E）**：
   - (C) 领域数据真相 → EventService/EventHub
   - (E) 持久化管线态 → 自建 pipeline
   - ⚠️ **DocumentModel/IR 不得作为新的全局状态层**

3. **Slate 编辑器正确性优先**（Epic 1）：
   - ❌ 禁止在编辑器 onChange 中调用 normalize
   - ✅ normalize 仅在写入时（save/sync）
   - ✅ 读取时轻量处理

4. **小步提交 + 可回滚**：
   - 每步改动必须独立验证
   - 不允许"大爆炸式合并"

5. **EventHub 订阅视图**（Epic 2 正在推进）：
   - UI 使用 `useEventHubEvent/useEventHubQuery`
   - 不在 UI 维护第二份真相缓存

6. **同步状态机**：
   - `syncStatus: local-only/pending/synced/failed`
   - local-only 事件不受 Meta 体积限制

**与本文档的集成点**：
- ✅ EventLogCodec 作为**内部转换层**，不暴露 IR 为全局状态
- ✅ normalize 时机：仅在 Write Path（`EventService.saveEvent/syncToOutlook`）
- ✅ 分级 Meta 与 syncStatus 集成（local-only 无限制，需同步事件受 32KB 约束）
- ✅ 数据迁移无需处理 ID 格式（v2.17 已统一 UUID）

---
## 目的

在不引入 Redux 的前提下，逐步修正 `EventService` 及其相关模块的架构问题，降低耦合与竞态，提升：

1) **事件树一致性**（`parentEventId/childEventIds/bulletLevel`）
2) **保存/同步链路可预测性**（Write-time canonical、read-time 轻量）
3) **Slate 富元素的可演进性**（Notion 级元素扩展 + 用户自定义字段）
4) **Outlook 双向同步的可用性底线**：
   - 任意远端回读内容都能被结构化加载（不崩、不丢）
   - 元素“语义还原度”允许分级，但**结构化回读**是硬约束

---

## v2 的新增问题域：Slate 富元素 × Outlook 双向同步

### 关键现实

- Outlook/Word 引擎会改写 HTML（列表、段落、样式、空行、编码），甚至可能删除/移动片段。
- 完全依赖 HTML 解析会导致“结构错配/元数据串线污染”。
- 完全依赖 Meta（把完整 Slate JSON 塞进 hidden）会导致：
  - 体积膨胀（潜在 32KB 限制风险）
  - 覆盖用户在 Outlook 的编辑（与双向同步预期冲突）

### 必须兑现的产品契约（Hard Contract）

1) **可加载**：Outlook 回读后，4DNote 必须能生成一棵“合法的文档树”（即使降级）。
2) **不丢**：任何无法还原的块，至少以 `unknown-block` 形式保留 raw 信息（HTML/文本/Meta payload）。
3) **可再同步**：回读后的事件必须能再次同步出去（不会因为某块无法解析而阻塞整个事件）。
4) **语义分级**：元素的“原生还原/可编辑/统计”可以渐进增强，但不能影响 1~3。

> 结论：我们需要一个“元素注册表 + 编解码管线 + unknown-block 安全阀”的体系，让新增元素不会把同步链路弄坏。

### 2026-01-01：Outlook 多行内容丢失问题（已修复 + 后续计划）

近期线上问题（你反馈的典型现象）：
- Outlook 导入事件在 App 内只显示第一行
- 回写 Outlook 后正文被改写成多段 `<div class="PlainText">...</div>`

已落地修复（均已通过全量测试）：
- `cleanupOutlookHtml()`：`.PlainText` 提取从“只取第一条”改为“收集全部行并合并”，避免正文截断
- `htmlToSlateJsonWithRecognition()`：解析策略改为遍历 `contentElement.childNodes`，避免把容器 DIV 解析成段落节点导致“段落嵌套段落”的非法结构
- 新增回归测试：`src/services/__tests__/EventService.outlookPlainTextImport.test.ts`

#### 内容口径（North Star）

- **内部编辑/显示**：以 `event.eventlog.slateJson` 为主（结构化、可编辑）
- **对外同步（Outlook）**：以 `event.eventlog.html` 为主（尽量保留 data-*，用于回传识别）
- **搜索/预览**：以 `event.eventlog.plainText` 为缓存（不可逆，但性能友好）

> 解释：写入/同步入库时做一次 canonicalize（生成三层、清理签名等）；读取/渲染尽量只消费 canonical 字段，不在读路径做重型 HTML 清洗/解析。

#### 后续工作拆分（按优先级）

**P0（立即，1-2 天）：把“内容丢失”彻底压住**

1) **补齐 Outlook 导入 fixtures（测试驱动）**
  - `.PlainText` + `<br>` 混排
  - `.MsoNormal`（Outlook 重写 HTML 的常见类）
  - 纯文本（Graph 回传 `contentType=text`）
  - html 中包含 `&amp; &lt;` 等多层实体

2) **明确 `normalizeEventLog` 的输入契约（防止 silent data loss）**
  - `normalizeEventLog(eventlog, description)` 的优先级、早期退出条件要可预测
  - “从 description/HTML 兜底生成 slateJson”的触发条件必须明确（避免把非 JSON 字符串误当 JSON 解析导致空段落）

3) **签名规则收敛**
  - 内部视图默认不展示签名；同步到 Outlook 的内容需要签名（或可配置）
  - 统一收敛到少量函数：
    - `stripSignatureFromHtml/htmlText`
    - `appendSignatureToOutlookBody`

**P1（短期，2-5 天）：解决“回写 Outlook 后退化成 PlainText div”**

1) **梳理 MicrosoftCalendarService 的 body 写入策略**
  - 对外写入时明确 `contentType`，并优先写 `eventlog.html`
  - 避免写了不完整 HTML 或写成 text 导致 Outlook/Exchange 强制规范化为 `.PlainText` div 列表

2) **建立“回写对称性”基准**
  - App → Outlook：写 `eventlog.html`（含 data-*）
  - Outlook → App：尽最大努力从 HTML 回收 `slateJson`（精确识别优先，模糊识别兜底）
  - 底线：即使 data-* 丢失允许降级为纯文本，但不允许丢行/粘连

**P2（中期，1-2 周）：能力完善与架构减脂**

1) **MentionNode（@人员）支持**：影响回传识别完整度，应尽早补齐
2) **模糊识别增强（渐进）**：Tag / DateMention 支持更多格式，并尽量解析为标准时间
3) **HTML 适配层从 `EventService.ts` 拆出去**
  - 将 `cleanupOutlookHtml/htmlToSlateJsonWithRecognition/parseHtmlNode` 抽到独立模块（例如 `src/services/eventlog/htmlAdapter/*`）
  - `EventService` 仅做编排，降低多人并发编辑冲突

#### 与其他 Copilot 的冲突评估（协作约束）

- 高冲突区域：`src/services/EventService.ts`（文件巨大，容易与多条线冲突）
- 低冲突优先策略：
  - 优先新增/完善测试用例（`src/services/__tests__/...`）
  - 优先新增独立适配层模块（新文件），在 `EventService.ts` 里只做接线式小改动
- 协作约定：当需要改动 `EventService.ts` 超过 ~30 行时，先在 Execution Log 登记“锁文件窗口”，避免并发编辑

#### 验收标准（可操作）

- Outlook 多行正文导入：App 内显示行数与 Outlook 相符（允许格式差异，不允许丢行/粘连）
- App 回写 Outlook：Outlook 不应退化成“逐行 PlainText div”（或即使退化也不丢内容）
- 回传识别：data-* 存在时 Tag/DateMention 能恢复；data-* 缺失时至少保留可读文本
- 回归测试：新增的 Outlook fixtures 全部通过

---

## 总体策略：把 normalize/codec 从 God Service 中抽出来

### 核心分层（写入 canonical，读取轻量）

- **Write Path（强规范）**：所有写入都要 canonical 化：schema、版本、时间戳、签名、派生视图。
- **Read Path（弱规范）**：只做轻量转换/缺省值填充，不做重型迁移/DOM 清洗。
- **Repair Path（显式）**：迁移/重建/全量修复只能显式触发，不允许被日常编辑隐式触发。

### CompleteMeta V2 的边界（与现有架构一致）

- Meta 是**增强器**：用于保护 4DNote 特有的结构元数据（节点 id/type/时间戳/bulletLevel/元素 payload hints）。
- HTML 是**可读载体**：保留用户在 Outlook 的编辑文本。
- 回读策略：**HTML 文本为主，Meta 为结构增强**；Meta 缺失时必须可降级。

---

## 目标模块拆分（v1 的基础上补齐“富元素体系”）

> 对外仍可保留 `EventService` facade，但内部必须模块化。

### A. 事件写入管线

- `EventService`（Facade）
  - 对外 API：`create/update/delete/get/query/reparent/batchApply/flush`
  - 负责协调：storage、sync、broadcast、writeContext、treeEngine、normalizer

- `WriteContext` / `SavePipeline`
  - `stagePatch()` / `stageEvent()` / `get()` / `commit()`
  - 一次 commit：一次写库 + 一次广播 + 一次 history/stats/nodes/sync side-effects

### B. 文档模型与元素体系（新增）

- `DocumentModel`（IR - 内部转换层）
  - ⚠️ **架构约束**：IR 仅作为 EventLogCodec 内部的编解码中间格式，**不暴露为全局状态层**
  - 目标：在 HTML ↔ Slate JSON 转换时提供统一的中间表示（类似编译器 AST）
  - 对外接口仍然是 Slate JSON（与现有架构无缝对接）
  - **禁止**：UI 组件直接依赖 IR / 在 EventHub 中存储 IR

- `ElementRegistry`（元素注册表）
  - 每个元素以 descriptor 注册：
    - `normalize(node, ctx)`
    - `migrate(node, fromV, toV)`
    - `encodeToHtml(node, ctx)`
    - `decodeFromHtml(htmlChunk, meta, ctx)`
    - `fallbackDecode(htmlChunk, ctx)`（Meta 缺失/损坏时兜底）

- `DocumentNormalizer`（纯函数优先）
  - ⚠️ **调用时机约束**：仅在 Write Path 调用（`EventService.saveEvent/syncToOutlook`），**禁止在编辑器 onChange 中调用**
  - 输入：任意 Slate/IR 节点（可能来自 UI、Outlook 回读、旧数据）
  - 输出：canonical IR（或 canonical Slate JSON）
  - 不依赖 DOM，不访问全局状态
  - **架构对齐**：符合 Epic 1（Slate 编辑器单一状态源），编辑器内部状态不做 normalize

- `EventLogCodec`（编解码）
  - `encode(eventlog, options?) -> { html, meta }`
    - options 包含 `syncStatus`（用于分级 Meta 策略）
  - `decode({ html, meta }) -> eventlog`
  - 负责三层匹配、锚点对齐、降级策略（unknown-block）
  - **EventHub 集成**：decode 完成后触发 `eventlogNormalized` 事件，UI 通过 `useEventlogVersion()` 订阅更新（类似 `tagsVersion` 机制）

- `UnknownBlockHandler`（安全阀）
  - 任何无法识别/无法可靠恢复的块 → `unknown-block`
  - 必须保留：raw html/text + meta payload（如有）+ stable id。

### C. Outlook HTML 适配（从 EventService 剥离）

- `EventLogHtmlAdapter`
  - 负责 DOM 清洗、MsoList 处理、样式白名单、空行去噪、CID 图片处理等。
  - 提供可替换实现（浏览器实现 / Node 测试实现）。

### D. 派生视图（从文档生成）

- `DerivedViews`
  - 从 canonical 文档生成：`plainText/html/stats/indexes`
  - 统计（计时、金额、公里数等）应从结构化节点派生，而不是从 HTML 解析。

---

## “所有元素都可结构化回读”的工程定义

### 结构化回读的最低标准

- 回读后必须得到一棵节点树：节点有 `type`，结构合法，可渲染。
- 允许出现：`unknown-block`、`html-block`、`paragraph` 降级节点。
- 允许语义退化，但不允许：
  - app 由于某元素崩溃
  - 同步阻塞
  - 内容丢失

### 元素能力分级（影响“还原度”，不影响“可回读”）

- Tier A（强还原）：Meta 存在时可接近 100% 还原；Meta 缺失也能较好解析
  - 例：heading、code-block、mention、property/metric
- Tier B（可读优先）：HTML 可读可编辑；回读尽力还原，失败则降级但不丢
  - 例：table（复杂编辑场景）、嵌套列表、复杂 block
- Tier C（本地特性）：Outlook 仅展示摘要/链接；回读落为 unknown-block 或只读节点
  - 例：复杂统计面板、交互式组件

---

## 用户自定义字段（金额/公里数等）的推荐方案

### 目标

- 支持大量自定义字段，但不让元素类型爆炸。

### 设计

- 使用单一元素：`property` / `metric`
  - 节点结构固定：`{ type:'property', key, value, valueType, unit?, ... }`
- 字段定义由 `PropertyDefinitionRegistry` 管理（可本地配置/同步）：
  - `key/label/type/unit/precision/aggregation`

### 同步策略

- Outlook HTML：渲染为可读键值对（例如：`金额：¥12.50`、`跑步：5.0 km`）
- CompleteMeta V2：保存结构化 payload（key/value/unit/version/hints）
- 回读：
  - Meta 在 → 精准恢复
  - Meta 不在 → 尝试从文本模板解析，失败则降级为 paragraph（同时保留 raw）

---

## 元素能力矩阵（可直接给 Copilot 实施的清单）

本节定义：**每种元素最少需要什么 Meta 字段、回读顺序、fallbackDecode 行为、以及 Tier 目标**。

> 目标：新增元素时只需要“注册 descriptor + 按矩阵补齐能力 + 写契约测试”，不需要改 `EventService.normalizeEvent/normalizeEventLog` 主流程。

### A. 全元素通用契约（所有 block 都必须满足）

**Node 最小结构（canonical）**

- `type`: string（元素类型）
- `id`: string（稳定 ID，Meta 在则优先使用 Meta 的 id）
- `children`: Slate 规范 children（即使是 void 节点，也需要可渲染的 children 兜底）
- `createdAt/updatedAt`: number（block-level timestamp；无法获得时允许缺省，但写入 canonical 时必须补齐）

**Meta 最小字段（CompleteMeta V2 / Meta-Comment 的“每块”条目）**

- `t`: block type（例如 `paragraph/heading/code-block/table/...`）
- `id`: block id（稳定锚点，避免错配串线）
- `v`: element schema version（用于迁移）
- `ts`: createdAt（ms 或可转 TimeSpec 的时间）
- `uts`: updatedAt（ms 或可转 TimeSpec 的时间）
- `h`: anchor hint（用于三层匹配；建议保存 5~12 字符的前缀 + 长度信息）
  - 推荐：`h = { p: prefix5, s: suffix5, len }`（prefix/suffix 可选，len 必选）
- `pl`: 结构提示（可选但推荐）
  - 例：`bulletLevel/listType/indent` 等（Outlook 会改写列表结构，Meta 可辅助恢复）

---

### A.1 与当前 CompleteMeta V2 实现对齐（事实口径）

上面的 `t/v/h/pl/uts` 属于“推荐的抽象字段命名”，便于未来做 `ElementRegistry + EventLogCodec` 的统一 schema。

但**你们当前仓库已经落地的 CompleteMeta V2（`EventService.serializeEventDescription/deserializeEventDescription`）使用的是另一套字段名**；为了避免 Copilot 施工时“文档与代码脱节”，这里给出**当前实现的 TS 合约 + 映射表 + 匹配算法输入输出**。

#### 1) 当前实现的 Meta 结构（TS 风格）

```ts
/**
 * 当前仓库的 CompleteMeta V2（事实口径）
 * - 写入：EventService.serializeEventDescription
 * - 回读：EventService.deserializeEventDescription
 */
export interface CompleteMetaV2 {
  v: 2;
  /** eventId（注意：不是 blockId） */
  id: string;
  slate: {
    /** 与段落序一致的“每块”元信息（用于三层匹配与 merge） */
    nodes: CompleteMetaV2Node[];
  };
  signature?: {
    createdAt?: number;
    updatedAt?: number;
    fourDNoteSource?: string;
    source?: string;
  };
}

export interface CompleteMetaV2Node {
  /** blockId（稳定锚点；用于 merge 回 Slate 节点） */
  id?: string;

  /** V2 锚点三元组：prefix/suffix/length（用于三层匹配） */
  s?: string; // start hint：前 5 字符
  e?: string; // end hint：后 5 字符
  l?: number; // length：整段长度

  /** block-level timestamps */
  ts?: number; // createdAt
  ut?: number; // updatedAt

  /** heading level / bulletLevel（用于结构提示与 merge） */
  lvl?: number;
  bullet?: number;

  /** inline mention 的最小 payload（当前实现只保存第一个 mention） */
  mention?: {
    type: string;
    targetId?: string;
    targetName?: string;
    targetDate?: string;
    displayText?: string;
  };
}
```

#### 2) “推荐抽象字段”到“当前实现字段”的映射

| 推荐抽象字段（文档口径） | 当前实现字段（代码口径） | 备注 |
|---|---|---|
| `id`（block id） | `metaNode.id` | ✅ 已实现 |
| `ts`（createdAt） | `metaNode.ts` | ✅ 已实现 |
| `uts`（updatedAt） | `metaNode.ut` | ✅ 字段名是 `ut` |
| `h = { p, s, len }` | `s/e/l` | ✅ 已实现：prefix5/suffix5/len |
| `pl.level` | `lvl` | ✅ 已实现（但目前 decode 端默认都产出 paragraph） |
| `pl.bulletLevel` | `bullet` | ✅ 已实现（同上） |
| `t`（block type） | （缺失） | ⚠️ 当前 metaNode 不存 type；回读端默认生成 `paragraph` |
| 其他元素 payload | （缺失） | ⚠️ 富元素要落地需扩展 meta schema |

#### 3) 这些字段如何进入“三层匹配”与 merge（当前实现）

- **Layer 1/2/3 的匹配输入**：只依赖 `s/e/l`（用 HTML 段落的 `textContent` 计算出 `htmlStart/htmlEnd/htmlLength` 去比对/打分）。
- **匹配成功后的 merge 输出**：`applyMatchResults()` 会把 `id/ts/ut/lvl/bullet/mention` 合并回最终 Slate 节点：
  - `id -> node.id`
  - `ts -> node.createdAt`
  - `ut -> node.updatedAt`
  - `lvl -> node.level`
  - `bullet -> node.bulletLevel`
  - `mention -> node.children[0].mention`

> 关键点：当前实现的三层匹配**不关心元素类型**，只做“段落级对齐 + 元数据回填”。
> 所以要支持 Notion 级富元素，必须让 `metaNode` 承载 `t + payload`，并且 `decodeFromHtml` 不再固定产出 paragraph。

---

### A.2 `MetaNodeV2`（推荐的稳定契约，面向 ElementRegistry/Codec）

下面是“推荐的抽象接口”（未来用于 `ElementRegistry + EventLogCodec`）：字段命名与语义尽量稳定，方便在不修改主流程的情况下新增元素。

```ts
/**
 * 推荐的“每块 meta 条目”稳定契约（抽象口径）
 * - 目标：支持富元素（t + payload）且可做三层匹配（h）
 * - 注意：这是未来 codec 的目标形态；当前实现尚未完整落地
 */
export interface MetaNodeV2 {
  /** block type（paragraph/heading/code-block/table/mention/property/...） */
  t: string;

  /** block id（稳定锚点） */
  id: string;

  /** element schema version（用于迁移） */
  v: number;

  /** block-level timestamps */
  ts?: number;
  ut?: number;

  /** 三层匹配锚点（建议 prefix/suffix/len；len 强烈建议必填） */
  h: {
    p?: string; // prefix
    s?: string; // suffix
    len: number;
  };

  /** 结构提示（可选）：帮助恢复层级/列表缩进等 */
  pl?: {
    lvl?: number;
    bullet?: number;
    listType?: 'bullet' | 'number';
    indent?: number;
  };

  /** 元素 payload（可选）：由 ElementRegistry 的 descriptor 定义其结构与版本迁移 */
  payload?: unknown;
}
```

建议实现策略：decode 端同时兼容两种形态：

1) **现有形态**：`{ id?, s?, e?, l?, ts?, ut?, lvl?, bullet?, mention? }`
2) **推荐形态**：`MetaNodeV2`

这样可以先把 codec/registry 引入而不要求一次性迁移所有历史数据。

**回读优先级（强制统一）**

1) `Meta 精确匹配`：Meta 节点与 HTML 段落通过三层匹配对齐（你们现有 V2 逻辑）
2) `HTML 语义解析`：基于标签语义（h1/pre/table/li/...) 解析结构
3) `纯文本降级`：无法识别结构时，转为 paragraph / unknown-block

**统一安全阀（强制统一）**

- 任意元素 decode 失败：不得抛致命异常；必须返回 `unknown-block`（保留 raw html/text + meta payload）。

---

### B. 元素矩阵（Tier / Meta 最小集合 / fallbackDecode 规则）

> 说明：
> - “Meta 最小集合”指该元素除通用字段外还需要的 payload。
> - “fallbackDecode”指 Meta 缺失/损坏或对齐失败时的兜底解析。

| 元素 | Tier 目标 | Meta 最小集合（除通用字段） | Outlook HTML（可读表示） | decodeFromHtml（Meta 缺失时） | fallbackDecode（最后兜底） |
|---|---|---|---|---|---|
| paragraph | A | 无 | `<p>...</p>` | 解析 `<p>`/普通文本为 paragraph | 纯文本 → paragraph（保留换行） |
| heading(level=1..6) | A | `lvl`（1..6） | `<h1..h6>` | 优先用 `<h1..h6>` 识别 level；若 Outlook 改写成粗体段落，则尝试从文本前缀/样式猜测 | 降级为 paragraph（可在 text 前加 `#` 作为可读提示，或仅保留文本） |
| code-block | A | `lang?`（可选） | `<pre><code class="language-...">...</code></pre>` | 解析 `<pre><code>`；保留原始 code 文本；lang 尝试从 class 推断 | 降级为 paragraph（保留 ``` 包裹的文本或直接保留纯文本） |
| list-item / list-container | B | `listType`（bullet/number）+ `indent/bulletLevel`（可选） | `<ul>/<ol>/<li>` 或 MsoList 伪列表 | 解析 `<ul>/<ol>/<li>`；若为 MsoList，走 HtmlAdapter 先转换 | 降级为 paragraph（可在文本前加 `- ` 或 `1. ` 的可读前缀） |
| mention（UnifiedMention） | A | `m`（mention payload：kind/id/label） + `r`（可选：range hint） | `<span data-4d-mention="...">@xxx</span>`（可读） | 解析 `@` 前缀/`data-*` 属性；若仅剩纯文本则保留为 text（允许 inline 降级） | inline 全部降级为纯文本（禁止把未知 mention meta 套到别的文本上） |
| property / metric（用户自定义字段） | A | `k`(key) + `vt`(valueType) + `val`(value) + `u?`(unit) | `金额：¥12.50` / `跑步：5 km`（可读键值对） | 模板解析：`label: value unit` / `label：value unit`（可配置 locale）；解析失败不阻塞 | 降级为 paragraph，并保留 raw（后续可 repair 升级） |
| table（结构化表格） | B | `cols`（列数）+ `grid?`（可选：cell ids/跨度） | `<table><tr><td>...</td></tr>...</table>` | 解析 `<table>` 为 table nodes；优先保留 cell 文本；结构复杂则只读 | 降级为 unknown-block（保留整个 table html） |
| attachment / image | B | `att`（attachment id/url/filename/mime） | `<img>` / `<a href>` | 解析 `<img src>`/链接；CID 图片通过 HtmlAdapter 解 cid → 本地 url | 降级为 paragraph（链接文本）或 unknown-block（保留 raw） |
| unknown-block（安全阀） | A（必备） | `rawHtml/rawText` + `rawMeta?` | 原样或摘要 | 永远成功：用于承接 decode 失败/未知类型 | N/A（自身就是 fallback） |

---

### C. “不会把同步弄坏”的强制性实现细则（Copilot Checklist）

1) **每个新元素必须实现**：`normalize + encodeToHtml + decodeFromHtml + fallbackDecode`。
2) **decodeFromHtml 不得依赖全局状态**（TagService/ContactService 等只能在更高层编排）。
3) **inline 元素容错策略**：宁愿降级为纯文本，也不要错配套用 meta（防串线污染）。
4) **unknown-block 必须可再同步**：二次同步时，优先回写 `rawHtml`（或回写可读文本 + meta）。
5) **体积控制**：Meta payload 只存“锚点 + 结构提示 + 少量字段”。
   - 禁止把完整 Slate JSON 作为默认策略塞进 Meta（只允许作为 repair/调试或极少数场景）。

---

## 实施计划（按最小侵入、可回滚、可验证）

### Phase 0：建立“永不崩”的回读底座（P0）

1) 引入 `unknown-block` 节点类型（或等价机制）：任何无法识别块都可落地。
2) 在 Outlook 回读路径中，保证：
   - decode 失败不抛出致命异常
   - 事件仍可保存/打开/再次同步

### Phase 1：ElementRegistry + DocumentNormalizer（P0）

1) 建 `ElementRegistry`（先覆盖现有元素：paragraph/list/timestamp-divider/mention/attachments 等）。
2) 将 `normalizeEventLog()` 的“识别分支”改为 registry 驱动。
3) 以最小改动保持现有数据格式兼容（Slate JSON 仍可作为主存）。4) **架构对齐**：
   - ⚠️ normalize 仅在 Write Path 调用（saveEvent/syncToOutlook），**禁止在编辑器 onChange 中调用**
   - 与 EventHub 订阅模式集成（触发 `eventlogNormalized` 事件，UI 通过 `useEventlogVersion()` 订阅）
### Phase 2：抽离 EventLogCodec + HtmlAdapter（P1）

1) 从 `EventService` 抽 `EventLogHtmlAdapter`（DOM 清洗、Outlook 特化）。
2) 抽 `EventLogCodec`（encode/decode、三层匹配、锚点对齐）。
3) `EventService` 仅编排：写入前调用 codec/normalizer，存储与广播不直接处理 DOM。
4) **架构对齐**：
   - ⚠️ IR 仅在 codec 内部使用，**不暴露为全局状态层**
   - encode 时根据 `syncStatus` 决定 Meta 策略（local-only 无限制，需同步受 32KB 约束）
   - 对外接口仍然是 Slate JSON（与现有架构无缝对接）

### Phase 3：契约测试与 fuzz（P1）

- 元素契约测试（每新增元素必须过）：
  1) `normalize(normalize(x)) == normalize(x)`（幂等）
  2) `decode(encode(x)) ~= x`（允许版本迁移差异）
  3) Meta 缺失/破损时：仍能 decode 成合法树（unknown-block）
- Outlook 噪音注入 fuzz：模拟 MsoList、空行、样式污染、段落删除/插入/乱序。

### Phase 4：新增 Notion 级元素（P2）

按 Tier A→B 顺序实现：
- **Week 1**: heading（目录可由派生视图生成，不必写回 storage）
- **Week 2**: code-block
- **Week 3**: property/metric（用户自定义字段）
- **Week 4**: table（先只读或有限编辑，保证可回读）

每个元素都需要：
- 实现 `normalize + encodeToHtml + decodeFromHtml + fallbackDecode`
- 通过契约测试
- 不破坏现有同步功能

---

## 里程碑时间线（小步迭代）

| Phase | 目标 | 时长 | 验收标准 |
|---|---|---|---|
| Phase 0 | 永不崩底座 | 1 周 | Outlook 回读不崩、unknown-block 机制 |
| Phase 1 | 元素注册机制 | 1 周 | registry 驱动 normalize、EventHub 集成 |
| Phase 2 | 解耦 Codec | 1 周 | DOM 清洗抽离、分级 Meta 支持 |
| Phase 3 | 契约测试 | 1 周 | 幂等性、encode/decode 往返、fuzz 测试 |
| Phase 4 | 富元素扩展 | 2-3 周 | heading/code/property/table 逐步上线 |

**总时长**：6-7 周（每周一个可验证里程碑）

---

## 验收标准（v2 增补）

1) 任意 Outlook 回读内容都能生成合法文档树（不崩、不丢）。
2) 未识别元素统一落为 `unknown-block` 并保留 raw 信息，可再次同步。
3) 新增元素不需要修改 `normalizeEvent()` 主流程：只需注册 descriptor + 测试用例。
4) 重型 DOM 清洗不在 `EventService` 内部直接发生（通过 adapter）。
5) 读路径不触发重型迁移（迁移只在写入或 repair 显式触发）。

---

## 给 Copilot 的一句话指令（v2）

请不要在 `EventService.normalizeEvent/normalizeEventLog` 中继续堆 `if/else` 来支持新元素。优先实现：`ElementRegistry + DocumentNormalizer + EventLogCodec + UnknownBlockHandler`，并将 Outlook 的 DOM 清洗抽到 `EventLogHtmlAdapter`。所有新元素必须提供 `decode + fallbackDecode`，保证回读永不崩且不丢。
