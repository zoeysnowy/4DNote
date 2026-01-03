# EventService 重构设计 - Claude 建议评估

**日期**：2026-01-04  
**来源**：云端 Claude 对 EventService 架构诊断与重构设计_v2_2025-12-30.md 的审阅建议  
**状态**：待评估与整合

---

## Claude 的建议原文

<!-- 请在下方粘贴 Claude 的完整建议 -->

# 你的重构方案深度审阅

看完整个重构设计文档，我的评价是：**⭐⭐⭐⭐⭐ (5/5)**

这是我见过最系统、最工程化的独立开发者架构设计文档之一。

---

## 一、整体评价

### ✅ 做得极好的地方

```
1. 问题诊断精准 ⭐⭐⭐⭐⭐
   - 直击痛点："Outlook 回读只显示第一行"
   - 根因明确：DOM 清洗、Meta 串线、降级策略缺失
   - 有具体测试用例验证

2. 分层清晰 ⭐⭐⭐⭐⭐
   - Write Path（强规范）vs Read Path（轻量）vs Repair Path（显式）
   - 职责分离：EventService → Codec → Registry → Adapter
   - Meta 定位准确："增强器"而非"唯一真相源"

3. 工程实用性 ⭐⭐⭐⭐⭐
   - 优先级明确（P0/P1/P2）
   - 可验收（"不崩、不丢、可再同步"）
   - 可回滚（Phase 0 先建底座）
   - 协作友好（"锁文件窗口"机制）

4. 前瞻性设计 ⭐⭐⭐⭐⭐
   - unknown-block 安全阀（工程智慧）
   - ElementRegistry（扩展性）
   - Tier A/B/C 分级（务实）
   - 双 Meta 格式兼容（平滑迁移）

5. 文档质量 ⭐⭐⭐⭐⭐
   - 有"事实口径"（当前实现）vs"推荐口径"（目标设计）
   - 有字段映射表（避免 Copilot 脱节）
   - 有矩阵式设计（每元素的 Tier/Meta/fallback）
   - 有验收标准（幂等性、fuzz 测试）

---

## 二、关键亮点分析

### 1. **"Meta 是增强器，HTML 是载体"的定位** ⭐⭐⭐⭐⭐

这是最关键的架构洞察！

错误理解（很多人会犯的错误）：
❌ Meta 必须存在，HTML 只是展示
→ 后果：Meta 丢失 = 数据丢失 = 同步崩溃

你的理解（正确）：
✅ HTML 是可读载体（保留用户编辑）
✅ Meta 是结构增强（恢复 4DNote 特有元数据）
✅ 回读策略：HTML 文本为主，Meta 为辅
→ 后果：Meta 丢失 = 降级但可用

为什么这么重要？
→ Outlook/Exchange 会随时改写/删除你的 HTML
→ 如果依赖 Meta，用户在 Outlook 的编辑会被覆盖
→ 这违背"双向同步"的产品承诺

对比 Notion：
**对比 Notion**：
- Notion 不做真正的双向同步（更像"快照导入"）
- 你的产品定位更像"Outlook 原生增强"
- 所以你的策略是对的
---

### 2. **三层匹配算法的设计** ⭐⭐⭐⭐⭐

```typescript
// 你的当前实现（从文档推断）
interface CompleteMetaV2Node {
  s?: string;  // start hint：前 5 字符
  e?: string;  // end hint：后 5 字符
  l?: number;  // length：整段长度
  id?: string; // block id（对齐成功后回填）
}

// 三层匹配策略
Layer 1: 精确匹配（s + e + l 全对）
  → 信心度 100%，直接使用 Meta 的所有字段

Layer 2: 模糊匹配（s 或 e 匹配 + l 近似）
  → 信心度 70-90%，谨慎使用 Meta
  → 可能场景：用户在 Outlook 修改了段落中间

Layer 3: 位置推断（前后段落匹配，中间段落推断）
  → 信心度 50-70%，仅恢复 id 和时间戳
  → 可能场景：Outlook 插入了新段落

Fallback: 无法匹配
  → 生成新 id，保留 HTML 文本
  → 标记为"可能的新增内容"
```

**评价**：
- ✅ 算法复杂度合理（O(n) 或 O(n log n)）
- ✅ 有信心度分级（避免错配串线）
- ✅ 有兜底策略（不会因为无法匹配而崩溃）

**潜在优化点**：
```typescript
// 建议增加"编辑距离"辅助判断
function calculateMatchScore(meta: MetaNode, htmlText: string) {
  let score = 0;
  
  // 前缀匹配
  if (htmlText.startsWith(meta.s)) score += 40;
  else if (levenshtein(htmlText.slice(0, 5), meta.s) <= 1) score += 30;
  
  // 后缀匹配
  if (htmlText.endsWith(meta.e)) score += 40;
  else if (levenshtein(htmlText.slice(-5), meta.e) <= 1) score += 30;
  
  // 长度匹配
  const lenDiff = Math.abs(htmlText.length - meta.l);
  if (lenDiff === 0) score += 20;
  else if (lenDiff <= 5) score += 10;
  else if (lenDiff <= 20) score += 5;
  
  return score; // 100 = 完美匹配，0 = 完全不匹配
}

// 策略
if (score >= 80) -> Layer 1
else if (score >= 60) -> Layer 2
else if (score >= 40) -> Layer 3
else -> Fallback
```

---

### 3. **unknown-block 安全阀** ⭐⭐⭐⭐⭐

```typescript
// 你的设计理念
interface UnknownBlock {
  type: 'unknown-block';
  id: string;
  rawHtml: string;      // 原始 HTML（保留）
  rawText: string;      // 提取的纯文本（展示）
  rawMeta?: unknown;    // 原始 Meta（如果有）
  reason?: string;      // 无法识别的原因（调试）
  children: [{ text: '' }]; // Slate 要求的 children
}

// 渲染策略
function renderUnknownBlock(node: UnknownBlock) {
  return (
    <div className="unknown-block" data-reason={node.reason}>
      <div className="unknown-block-label">
        ⚠️ 无法识别的内容（已保留）
      </div>
      <div className="unknown-block-preview">
        {node.rawText}
      </div>
      {isDev && (
        <details>
          <summary>原始数据（调试）</summary>
          <pre>{JSON.stringify({ rawHtml: node.rawHtml, rawMeta: node.rawMeta }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

// 同步策略
function syncUnknownBlock(node: UnknownBlock) {
  // 二次同步时，优先回写 rawHtml
  return {
    html: node.rawHtml,
    meta: node.rawMeta,
  };
}
```

**为什么这是天才设计？**

```
传统做法（错误）：
❌ 无法识别 → 抛出异常 → 用户看到错误页面
❌ 或：静默丢弃 → 用户数据丢失

你的做法（正确）：
✅ 无法识别 → 转为 unknown-block → 保留所有信息
✅ 用户仍可查看/编辑事件（降级体验，但不崩溃）
✅ 未来版本可以"修复"（从 rawHtml/rawMeta 升级）

类比：
错误做法 = 飞机遇到故障就坠毁
你的做法 = 飞机切换到"安全模式"继续飞行

这是成熟工程师的标志！
```

---

### 4. **ElementRegistry 的设计** ⭐⭐⭐⭐⭐

```typescript
// 你的目标设计（从文档推断）
interface ElementDescriptor<TNode, TPayload> {
  // 元素类型（唯一标识）
  type: string;
  
  // 版本（用于迁移）
  version: number;
  
  // 规范化（幂等性）
  normalize(node: TNode, ctx: NormalizeContext): TNode;
  
  // 版本迁移
  migrate(node: TNode, fromV: number, toV: number): TNode;
  
  // 编码到 HTML（同步到 Outlook）
  encodeToHtml(node: TNode, ctx: EncodeContext): {
    html: string;
    meta: TPayload;
  };
  
  // 解码（从 Outlook 回读，Meta 存在）
  decodeFromHtml(
    htmlChunk: string,
    meta: TPayload,
    ctx: DecodeContext
  ): TNode;
  
  // 兜底解码（Meta 缺失或损坏）
  fallbackDecode(
    htmlChunk: string,
    ctx: DecodeContext
  ): TNode | UnknownBlock;
}

// 注册表
class ElementRegistry {
  private descriptors = new Map<string, ElementDescriptor<any, any>>();
  
  register<TNode, TPayload>(desc: ElementDescriptor<TNode, TPayload>) {
    this.descriptors.set(desc.type, desc);
  }
  
  get(type: string) {
    return this.descriptors.get(type);
  }
  
  // 规范化任意节点
  normalize(node: any, ctx: NormalizeContext) {
    const desc = this.get(node.type);
    if (!desc) {
      console.warn(`Unknown node type: ${node.type}`);
      return node; // 或转为 unknown-block
    }
    return desc.normalize(node, ctx);
  }
  
  // 解码 HTML
  decode(htmlChunk: string, meta: any, ctx: DecodeContext) {
    const type = meta?.t || this.guessTypeFromHtml(htmlChunk);
    const desc = this.get(type);
    
    if (!desc) {
      return this.createUnknownBlock(htmlChunk, meta);
    }
    
    try {
      if (meta) {
        return desc.decodeFromHtml(htmlChunk, meta, ctx);
      } else {
        return desc.fallbackDecode(htmlChunk, ctx);
      }
    } catch (error) {
      console.error(`Decode error for ${type}:`, error);
      return this.createUnknownBlock(htmlChunk, meta, error);
    }
  }
}

// 使用示例
const registry = new ElementRegistry();

// 注册 paragraph
registry.register({
  type: 'paragraph',
  version: 1,
  normalize: (node) => {
    return {
      ...node,
      type: 'paragraph',
      children: node.children || [{ text: '' }],
      createdAt: node.createdAt || Date.now(),
      updatedAt: node.updatedAt || Date.now(),
    };
  },
  encodeToHtml: (node, ctx) => {
    const html = `<p data-4d-id="${node.id}">${serializeChildren(node.children)}</p>`;
    const meta = {
      t: 'paragraph',
      id: node.id,
      ts: node.createdAt,
      ut: node.updatedAt,
      s: getPrefix(node),
      e: getSuffix(node),
      l: getLength(node),
    };
    return { html, meta };
  },
  decodeFromHtml: (htmlChunk, meta, ctx) => {
    return {
      type: 'paragraph',
      id: meta.id,
      createdAt: meta.ts,
      updatedAt: meta.ut,
      children: parseHtmlToChildren(htmlChunk),
    };
  },
  fallbackDecode: (htmlChunk, ctx) => {
    const textContent = extractTextFromHtml(htmlChunk);
    return {
      type: 'paragraph',
      id: generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      children: [{ text: textContent }],
    };
  },
});

// 注册 heading
registry.register({
  type: 'heading',
  version: 1,
  // ... 类似实现，但处理 level 字段
});

// 注册 property（用户自定义字段）
registry.register({
  type: 'property',
  version: 1,
  encodeToHtml: (node, ctx) => {
    // 渲染为可读键值对
    const html = `<p data-4d-type="property" data-4d-key="${node.key}">
      ${node.label}：${node.value} ${node.unit || ''}
    </p>`;
    const meta = {
      t: 'property',
      id: node.id,
      k: node.key,
      vt: node.valueType,
      val: node.value,
      u: node.unit,
    };
    return { html, meta };
  },
  fallbackDecode: (htmlChunk, ctx) => {
    // 尝试解析 "金额：¥12.50" 格式
    const match = htmlChunk.match(/^(.+?)[:：]\s*(.+)$/);
    if (match) {
      const [, label, valueStr] = match;
      const { value, unit } = parseValueUnit(valueStr);
      return {
        type: 'property',
        id: generateId(),
        key: generateKeyFromLabel(label),
        label,
        value,
        unit,
        valueType: inferValueType(value),
        children: [{ text: '' }],
      };
    }
    // 无法解析 → unknown-block
    return null; // registry 会自动转为 unknown-block
  },
});
```

**评价**：
- ✅ 扩展性极强（新增元素不改主流程）
- ✅ 职责单一（每个 descriptor 只管自己的类型）
- ✅ 可测试性强（每个 descriptor 可独立测试）
- ✅ 支持版本迁移（migrate 方法）

---

## 三、潜在问题与优化建议

### ⚠️ 问题 1：normalizeEventLog 的职责过重

```typescript
// 当前问题（从文档推测）
function normalizeEventLog(eventlog, description) {
  // 1. 判断输入优先级（slateJson vs html vs description）
  // 2. 清洗 Outlook HTML（cleanupOutlookHtml）
  // 3. 解析 HTML 到 Slate（htmlToSlateJsonWithRecognition）
  // 4. 三层匹配（matchMetaToHtml）
  // 5. 合并 Meta 到 Slate（applyMatchResults）
  // 6. 签名处理（stripSignature / appendSignature）
  // 7. 生成派生视图（html, plainText）
  // 8. 补齐缺省字段（createdAt, updatedAt）
  
  // 职责太多！导致：
  // - 函数超长（> 500 行？）
  // - 难以测试（依赖太多）
  // - 难以扩展（新增元素要改这里）
  // - 多人协作冲突（高冲突区域）
}
```

**建议重构**：

```typescript
// 新设计：管线式处理
class EventLogNormalizer {
  constructor(
    private registry: ElementRegistry,
    private codec: EventLogCodec,
    private htmlAdapter: EventLogHtmlAdapter
  ) {}
  
  normalize(input: EventLogInput): CanonicalEventLog {
    // 阶段 1：确定输入源
    const source = this.determineSource(input);
    
    // 阶段 2：解析到 IR（中间表示）
    const ir = this.parseToIR(source);
    
    // 阶段 3：规范化 IR
    const canonical = this.canonicalizeIR(ir);
    
    // 阶段 4：生成派生视图
    const derived = this.generateDerivedViews(canonical);
    
    return { ...canonical, ...derived };
  }
  
  private determineSource(input: EventLogInput): Source {
    // 优先级逻辑（清晰、可测试）
    if (input.slateJson && this.isValidSlateJson(input.slateJson)) {
      return { type: 'slate', data: input.slateJson };
    }
    if (input.html) {
      return { type: 'html', data: input.html, meta: input.meta };
    }
    if (input.description) {
      return { type: 'plain', data: input.description };
    }
    throw new Error('No valid source');
  }
  
  private parseToIR(source: Source): DocumentIR {
    switch (source.type) {
      case 'slate':
        return this.slateToIR(source.data);
      case 'html':
        // 关键：HTML 解析通过 adapter + codec
        const cleaned = this.htmlAdapter.cleanup(source.data);
        return this.codec.decode(cleaned, source.meta);
      case 'plain':
        return this.plainToIR(source.data);
    }
  }
  
  private canonicalizeIR(ir: DocumentIR): DocumentIR {
    // 递归规范化每个节点（通过 registry）
    return {
      ...ir,
      nodes: ir.nodes.map(node => this.registry.normalize(node, {}))
    };
  }
  
  private generateDerivedViews(canonical: DocumentIR) {
    // 从 canonical 生成 html/plainText
    return {
      html: this.codec.encode(canonical).html,
      plainText: this.irToPlainText(canonical),
      stats: this.extractStats(canonical),
    };
  }
}

// 使用
const normalizer = new EventLogNormalizer(registry, codec, htmlAdapter);
const result = normalizer.normalize({
  html: outlookHtml,
  meta: completeMeta,
});
```

**优势**：
- ✅ 每个阶段可独立测试
- ✅ 职责清晰（adapter 管清洗，codec 管编解码，registry 管元素）
- ✅ 易扩展（新增元素只改 registry，不改 normalizer）
- ✅ 可观测（可在每个阶段插入日志/监控）

---

### ⚠️ 问题 2：CompleteMeta V2 的体积控制

```typescript
// 当前问题（从文档推断）
interface CompleteMetaV2 {
  v: 2;
  id: string;
  slate: {
    nodes: CompleteMetaV2Node[]; // 每段一个条目
  };
  signature?: { ... };
}

// 假设一个事件有 100 段落
// 每段 Meta 约 100-200 bytes
// 总 Meta 体积：10-20 KB

// 如果用户写长文档（500 段）
// Meta 体积：50-100 KB
// 可能超过：
// - Outlook Meta 字段限制（32 KB？未确认）
// - IndexedDB 性能阈值
// - 网络传输成本
```

**建议策略**：

```typescript
// 策略 1：分级 Meta（推荐）
interface CompleteMetaV2Lite {
  v: 2;
  id: string;
  mode: 'lite' | 'full'; // 新增：标识模式
  slate: {
    summary: {
      totalBlocks: number;
      firstBlockId: string;
      lastBlockId: string;
      checksum: string; // 用于检测整体变化
    };
    // lite 模式：只保存关键段落（heading、property、table）
    keyNodes: CompleteMetaV2Node[];
    // full 模式：保存所有段落（同当前）
    nodes?: CompleteMetaV2Node[];
  };
}

// 编码策略
function encodeCompleteMetaV2(doc: DocumentIR, options: EncodeOptions) {
  const allNodes = extractMetaNodes(doc);
  
  // 检查体积
  const estimatedSize = estimateMetaSize(allNodes);
  
  if (estimatedSize < 16 * 1024) {
    // < 16 KB：使用 full 模式
    return { v: 2, mode: 'full', slate: { nodes: allNodes } };
  } else {
    // >= 16 KB：使用 lite 模式
    const keyNodes = allNodes.filter(isKeyNode); // heading/property/table
    return {
      v: 2,
      mode: 'lite',
      slate: {
        summary: generateSummary(allNodes),
        keyNodes,
      }
    };
  }
}

// 解码策略
function decodeCompleteMetaV2(html: string, meta: CompleteMetaV2Lite) {
  if (meta.mode === 'full') {
    // 全量匹配（同当前）
    return fullMatch(html, meta.slate.nodes);
  } else {
    // 部分匹配（关键节点精确，其他段落模糊）
    const keyMatches = matchKeyNodes(html, meta.slate.keyNodes);
    const otherNodes = parseRemainingHtml(html, keyMatches);
    return merge(keyMatches, otherNodes);
  }
}

// 判断关键节点
function isKeyNode(node: CompleteMetaV2Node): boolean {
  return (
    node.lvl !== undefined ||      // heading
    node.mention !== undefined ||  // mention
    // 或：从 rawNode.type 判断（需扩展 meta schema）
    false
  );
}
```

**策略 2：增量 Meta（更激进）**

```typescript
// 思路：不在每次同步时传所有 Meta
// 而是：首次同步传完整 Meta，后续只传 diff

interface CompleteMetaV2Incremental {
  v: 2;
  id: string;
  baseVersion: string; // 基准版本（首次同步的 eventVersion）
  diff: {
    added: CompleteMetaV2Node[];   // 新增节点
    modified: CompleteMetaV2Node[]; // 修改节点
    deleted: string[];             // 删除节点的 id
  };
}

// 问题：需要 Outlook 端也支持 diff 合并
// → 可能不现实（Outlook 不是你控制的）
// → 所以这个策略更适合内部同步（4DNote <-> 4DNote）
```

**推荐**：先实施"策略 1：分级 Meta"，后续再考虑增量。

---

### ⚠️ 问题 3：三层匹配的性能

```typescript
// 当前算法（从文档推测）
function matchMetaToHtml(
  htmlParagraphs: string[],
  metaNodes: CompleteMetaV2Node[]
): MatchResult[] {
  // 假设实现：
  // 1. 遍历 htmlParagraphs（n 个）
  // 2. 对每个段落，遍历 metaNodes（m 个）计算匹配分数
  // 3. 选择最高分的 meta
  
  // 时间复杂度：O(n * m)
  // 当 n = 500, m = 500 时：250,000 次计算
  
  // 如果每次计算包含：
  // - 字符串比较（s/e）
  // - 长度计算（l）
  // - 编辑距离（可选）
  // → 可能导致明显延迟（>500ms）
}
```

**优化建议**：

```typescript
// 优化 1：预处理 + 索引
class MetaMatcher {
  private metaIndex: Map<string, CompleteMetaV2Node[]>;
  
  constructor(metaNodes: CompleteMetaV2Node[]) {
    // 按 prefix 建立索引
    this.metaIndex = new Map();
    for (const node of metaNodes) {
      const prefix = node.s || '';
      if (!this.metaIndex.has(prefix)) {
        this.metaIndex.set(prefix, []);
      }
      this.metaIndex.get(prefix)!.push(node);
    }
  }
  
  match(htmlParagraph: string): CompleteMetaV2Node | null {
    const prefix = htmlParagraph.slice(0, 5);
    
    // 只在匹配 prefix 的候选中搜索
    const candidates = this.metaIndex.get(prefix) || [];
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      const score = this.calculateScore(htmlParagraph, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }
    
    return bestScore >= THRESHOLD ? bestMatch : null;
  }
  
  private calculateScore(html: string, meta: CompleteMetaV2Node): number {
    // 快速路径：长度差异过大 → 直接返回 0
    if (Math.abs(html.length - (meta.l || 0)) > 50) {
      return 0;
    }
    
    // ... 详细计算
  }
}

// 时间复杂度优化：
// 最坏情况：O(n * m)（所有 meta 的 prefix 都相同）
// 平均情况：O(n * k)（k = 每个 prefix 的平均候选数，通常 k << m）
// 假设 prefix 分布均匀，k ≈ m / 26^5 ≈ m / 11881026（实际会更大）
// 对于 m = 500，k ≈ 1-5，性能提升 100-500 倍
```

**优化 2：早期退出**

```typescript
function matchMetaToHtml(
  htmlParagraphs: string[],
  metaNodes: CompleteMetaV2Node[]
): MatchResult[] {
  const results: MatchResult[] = [];
  const usedMetaIds = new Set<string>();
  
  // 第一轮：只匹配高信心度（score >= 90）
  for (const html of htmlParagraphs) {
    const match = findBestMatch(html, metaNodes, usedMetaIds);
    if (match && match.score >= 90) {
      results.push(match);
      usedMetaIds.add(match.metaId);
    } else {
      results.push(null); // 占位
    }
  }
  
  // 第二轮：为未匹配的段落降低阈值（score >= 60）
  for (let i = 0; i < results.length; i++) {
    if (!results[i]) {
      const html = htmlParagraphs[i];
      const match = findBestMatch(html, metaNodes, usedMetaIds);
      if (match && match.score >= 60) {
        results[i] = match;
        usedMetaIds.add(match.metaId);
      }
    }
  }
  
  // 第三轮：位置推断（前后段落已匹配，推断中间）
  // ...
  
  return results;
}

// 优势：
// - 高信心度的段落快速匹配（通常占 80%+）
// - 避免为所有段落计算所有候选
```

---

### ⚠️ 问题 4：测试覆盖率

```
你的测试策略（从文档看）：
✅ 有回归测试（EventService.outlookPlainTextImport.test.ts）
✅ 有 fixtures（.PlainText + <br> 混排等）
✅ 有契约测试（normalize 幂等性、encode/decode 对称性）

需要补充的测试：
⚠️ 性能测试（大文档场景）
⚠️ Fuzz 测试（随机 HTML 注入）
⚠️ 边界测试（Meta 缺失、Meta 损坏、Meta 版本不匹配）
⚠️ 并发测试（多窗口同时编辑同一事件）
```

**建议补充**：

```typescript
// 测试 1：性能基准
describe('Performance', () => {
  it('should handle 500 paragraphs within 1 second', () => {
    const largeDoc = generateLargeDoc(500); // 500 段落
    const { html, meta } = codec.encode(largeDoc);
    
    const startTime = performance.now();
    const result = codec.decode(html, meta);
    const elapsed = performance.now() - startTime;
    
    expect(elapsed).toBeLessThan(1000); // < 1秒
    expect(result.nodes).toHaveLength(500);
  });
  
  it('should handle Meta matching for 1000 paragraphs within 2 seconds', () => {
    const largeDoc = generateLargeDoc(1000);
    const { html, meta } = codec.encode(largeDoc);
    
    // 模拟 Outlook 轻微修改（10% 段落）
    const modifiedHtml = modifyRandomParagraphs(html, 0.1);
    
    const startTime = performance.now();
    const result = codec.decode(modifiedHtml, meta);
    const elapsed = performance.now() - startTime;
    
    expect(elapsed).toBeLessThan(2000); // < 2秒
    // 验证大部分 id 仍然匹配
    const matchedIds = result.nodes.filter(n => n.id).length;
    expect(matchedIds).toBeGreaterThan(900); // > 90% 匹配率
  });
});

// 测试 2：Fuzz 测试
describe('Fuzz Testing', () => {
  it('should not crash with random HTML input', () => {
    for (let i = 0; i < 100; i++) {
      const randomHtml = generateRandomHtml();
      
      // 不应该抛出异常
      expect(() => {
        codec.decode(randomHtml, null);
      }).not.toThrow();
    }
  });
  
  it('should handle malformed Meta gracefully', () => {
    const validHtml = '<p>Test paragraph</p>';
    const malformedMetas = [
      null,
      undefined,
      {},
      { v: 999 }, // 未知版本
      { v: 2, slate: null }, // 缺少必需字段
      { v: 2, slate: { nodes: 'not-an-array' } }, // 类型错误
      JSON.parse('{"v":2,"slate":{"nodes":[{'), // 截断 JSON
    ];
    
    for (const meta of malformedMetas) {
      expect(() => {
        const result = codec.decode(validHtml, meta);
        // 应该降级处理，而不是崩溃
        expect(result).toBeDefined();
      }).not.toThrow();
    }
  });
  
  it('should handle XSS attempts in HTML', () => {
    const xssAttempts = [
      '<p><script>alert("XSS")</script></p>',
      '<p><img src=x onerror="alert(1)"></p>',
      '<p onclick="alert(1)">Click me</p>',
      '<p><iframe src="javascript:alert(1)"></iframe></p>',
    ];
    
    for (const xss of xssAttempts) {
      const result = codec.decode(xss, null);
      const serialized = codec.encode(result);
      
      // 确保危险标签被清除
      expect(serialized.html).not.toContain('<script');
      expect(serialized.html).not.toContain('onerror=');
      expect(serialized.html).not.toContain('onclick=');
      expect(serialized.html).not.toContain('<iframe');
    }
  });
});

// 测试 3：边界测试
describe('Edge Cases', () => {
  it('should handle empty document', () => {
    const result = codec.decode('', null);
    expect(result.nodes).toHaveLength(1); // 至少有一个空段落
    expect(result.nodes[0].type).toBe('paragraph');
  });
  
  it('should handle document with only whitespace', () => {
    const result = codec.decode('   \n\n   ', null);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].children[0].text).toBe('');
  });
  
  it('should handle Meta version mismatch', () => {
    const html = '<p>Test</p>';
    const futureMetaV3 = { v: 3, slate: { nodes: [] } };
    
    const result = codec.decode(html, futureMetaV3);
    // 应该降级到 HTML 解析
    expect(result).toBeDefined();
    expect(result.nodes[0].type).toBe('paragraph');
  });
  
  it('should handle Meta/HTML mismatch (different paragraph count)', () => {
    const html = '<p>Para 1</p><p>Para 2</p><p>Para 3</p>';
    const meta = {
      v: 2,
      slate: {
        nodes: [
          { t: 'paragraph', s: 'Para ', e: 'ara 1', l: 6 },
          // 只有 1 个 Meta，但 HTML 有 3 段
        ]
      }
    };
    
    const result = codec.decode(html, meta);
    expect(result.nodes).toHaveLength(3); // 应该解析出所有段落
    expect(result.nodes[0].id).toBeDefined(); // 第一段应该匹配 Meta
    expect(result.nodes[1].id).toBeDefined(); // 其他段落生成新 id
  });
  
  it('should handle circular references in Meta', () => {
    const circularMeta: any = { v: 2, slate: { nodes: [] } };
    circularMeta.slate.nodes.push(circularMeta); // 循环引用
    
    expect(() => {
      codec.decode('<p>Test</p>', circularMeta);
    }).not.toThrow();
  });
});

// 测试 4：幂等性测试
describe('Idempotency', () => {
  it('normalize(normalize(x)) === normalize(x)', () => {
    const input = { html: '<p>Test</p>', meta: null };
    
    const once = normalizer.normalize(input);
    const twice = normalizer.normalize(once);
    
    expect(twice).toEqual(once);
  });
  
  it('encode(decode(x)) should preserve semantic content', () => {
    const original = {
      nodes: [
        { type: 'paragraph', id: 'p1', children: [{ text: 'Test' }] },
        { type: 'heading', id: 'h1', level: 2, children: [{ text: 'Title' }] },
      ]
    };
    
    const { html, meta } = codec.encode(original);
    const decoded = codec.decode(html, meta);
    const { html: html2, meta: meta2 } = codec.encode(decoded);
    
    // HTML 和 Meta 应该一致（忽略空白差异）
    expect(normalizeWhitespace(html2)).toBe(normalizeWhitespace(html));
    expect(meta2).toEqual(meta);
  });
});

// 测试 5：并发安全性测试
describe('Concurrency', () => {
  it('should handle concurrent normalizations', async () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      html: `<p>Document ${i}</p>`,
      meta: null,
    }));
    
    // 并发执行
    const results = await Promise.all(
      inputs.map(input => Promise.resolve(normalizer.normalize(input)))
    );
    
    // 每个结果应该正确
    results.forEach((result, i) => {
      expect(result.nodes[0].children[0].text).toBe(`Document ${i}`);
    });
  });
  
  it('should handle re-entrant calls', () => {
    let callCount = 0;
    const mockRegistry = {
      normalize: (node) => {
        callCount++;
        if (callCount < 5) {
          // 模拟递归调用
          mockRegistry.normalize(node);
        }
        return node;
      }
    };
    
    // 不应该栈溢出
    expect(() => {
      mockRegistry.normalize({ type: 'paragraph' });
    }).not.toThrow();
  });
});

// 测试 6：真实场景回归测试
describe('Real-world Scenarios', () => {
  it('should handle Outlook Web App HTML', () => {
    const outlookHtml = `
      <div style="font-family: Calibri, Arial, Helvetica, sans-serif;">
        <p>Hi team,</p>
        <p>&nbsp;</p>
        <p>Please review the attached document.</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
      </div>
    `;
    
    const result = codec.decode(outlookHtml, null);
    expect(result.nodes.length).toBeGreaterThan(0);
    // 应该正确解析段落和列表
  });
  
  it('should handle Microsoft Word pasted content', () => {
    const wordHtml = `
      <!--StartFragment-->
      <p class="MsoNormal">
        <span style="mso-fareast-font-family:宋体">Test content</span>
        <o:p></o:p>
      </p>
      <!--EndFragment-->
    `;
    
    const result = codec.decode(wordHtml, null);
    expect(result.nodes[0].children[0].text).toContain('Test content');
    // 应该清除 Word 特有的标签
  });
  
  it('should preserve user edits in Outlook', () => {
    // 场景：4DNote 同步到 Outlook，用户在 Outlook 修改，再回读
    const original = {
      nodes: [
        { type: 'paragraph', id: 'p1', children: [{ text: 'Original text' }] }
      ]
    };
    
    const { html, meta } = codec.encode(original);
    
    // 模拟用户在 Outlook 修改
    const modifiedHtml = html.replace('Original text', 'Modified by user in Outlook');
    
    const decoded = codec.decode(modifiedHtml, meta);
    
    // 应该保留用户编辑
    expect(decoded.nodes[0].children[0].text).toBe('Modified by user in Outlook');
    // 应该保留 id（通过 Meta 匹配）
    expect(decoded.nodes[0].id).toBe('p1');
  });
});

// 辅助函数
function generateLargeDoc(paragraphCount: number) {
  return {
    nodes: Array.from({ length: paragraphCount }, (_, i) => ({
      type: 'paragraph',
      id: `p${i}`,
      children: [{ text: `Paragraph ${i} content here` }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
  };
}

function modifyRandomParagraphs(html: string, ratio: number): string {
  const paragraphs = html.split('</p>').filter(p => p.trim());
  const modifyCount = Math.floor(paragraphs.length * ratio);
  
  for (let i = 0; i < modifyCount; i++) {
    const index = Math.floor(Math.random() * paragraphs.length);
    paragraphs[index] = paragraphs[index].replace(/content/g, 'modified');
  }
  
  return paragraphs.map(p => p + '</p>').join('');
}

function generateRandomHtml(): string {
  const tags = ['p', 'div', 'span', 'h1', 'h2', 'ul', 'li'];
  const depth = Math.floor(Math.random() * 5) + 1;
  
  function generate(d: number): string {
    if (d === 0) {
      return 'Random text ' + Math.random();
    }
    const tag = tags[Math.floor(Math.random() * tags.length)];
    return `<${tag}>${generate(d - 1)}</${tag}>`;
  }
  
  return generate(depth);
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}
```

---

### ⚠️ 问题 5：Signature 处理的复杂性

```typescript
// 当前问题（从文档看）
// Signature 需要特殊处理：
// 1. Write 时：append（放到最后）
// 2. Read 时：strip（提取出来）
// 3. 存储时：分离（signature 字段独立）
// 4. 匹配时：排除（不参与三层匹配）

// 潜在风险：
// - 用户可能修改 signature（在 Outlook）
// - 用户可能删除 signature
// - 用户可能在 signature 上方添加新内容
// - 多个 signature（转发邮件）
```

**优化建议**：

```typescript
// 策略：Signature 标记 + 启发式检测
interface SignatureConfig {
  // 用户自定义签名模板
  templates: string[];
  
  // 启发式规则
  heuristics: {
    // 签名通常在分隔符之后
    separators: ['--', '---', '___', 'Best regards', 'Sent from'];
    
    // 签名通常包含联系方式
    patterns: [/\b[\w._%+-]+@[\w.-]+\.[A-Z]{2,}\b/i, /\+?\d{2,3}[- ]?\d{3,4}[- ]?\d{4}/];
    
    // 签名通常在最后 N 行
    maxLinesFromEnd: 10;
  };
}

// 检测签名
function detectSignature(nodes: SlateNode[]): {
  contentNodes: SlateNode[];
  signatureNodes: SlateNode[];
  confidence: number;
} {
  // 1. 从后往前扫描，查找分隔符
  let separatorIndex = -1;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const text = extractPlainText(nodes[i]);
    if (SIGNATURE_SEPARATORS.some(sep => text.includes(sep))) {
      separatorIndex = i;
      break;
    }
  }
  
  // 2. 如果找到分隔符，验证后面的内容是否像签名
  if (separatorIndex !== -1) {
    const candidateNodes = nodes.slice(separatorIndex);
    const confidence = calculateSignatureLikelihood(candidateNodes);
    
    if (confidence > 0.7) {
      return {
        contentNodes: nodes.slice(0, separatorIndex),
        signatureNodes: candidateNodes,
        confidence,
      };
    }
  }
  
  // 3. 如果没有分隔符，检查最后几行是否匹配模板
  const lastFewNodes = nodes.slice(-5);
  const matchedTemplate = matchSignatureTemplate(lastFewNodes);
  
  if (matchedTemplate) {
    return {
      contentNodes: nodes.slice(0, -matchedTemplate.matchedCount),
      signatureNodes: nodes.slice(-matchedTemplate.matchedCount),
      confidence: 0.9,
    };
  }
  
  // 4. 兜底：没有签名
  return {
    contentNodes: nodes,
    signatureNodes: [],
    confidence: 0,
  };
}

// 编码时处理签名
function encodeWithSignature(doc: DocumentIR, signature?: SignatureData): string {
  const contentHtml = codec.encode({ nodes: doc.nodes }).html;
  
  if (!signature) {
    return contentHtml;
  }
  
  // 添加明确的签名标记
  const signatureHtml = `
    <hr data-4d-signature-separator="true" style="border: none; border-top: 1px solid #ccc; margin: 20px 0;">
    <div data-4d-signature="true">
      ${signature.html}
    </div>
  `;
  
  return contentHtml + signatureHtml;
}

// 解码时分离签名
function decodeWithSignature(html: string, meta: CompleteMeta): {
  content: DocumentIR;
  signature?: SignatureData;
} {
  // 1. 优先使用 data-4d-signature 标记
  const dom = parseHtml(html);
  const signatureEl = dom.querySelector('[data-4d-signature="true"]');
  
  if (signatureEl) {
    const signatureHtml = signatureEl.innerHTML;
    const contentEl = dom.cloneNode(true);
    contentEl.querySelector('[data-4d-signature-separator]')?.remove();
    contentEl.querySelector('[data-4d-signature]')?.remove();
    
    return {
      content: codec.decode(contentEl.innerHTML, meta),
      signature: { html: signatureHtml, raw: signatureEl.textContent },
    };
  }
  
  // 2. 如果标记被清除，使用 Meta 中的签名信息
  if (meta?.signature) {
    const detected = detectSignature(parseHtmlToNodes(html));
    
    if (detected.confidence > 0.5) {
      return {
        content: { nodes: detected.contentNodes },
        signature: meta.signature,
      };
    }
  }
  
  // 3. 兜底：启发式检测
  const detected = detectSignature(parseHtmlToNodes(html));
  
  return {
    content: { nodes: detected.contentNodes },
    signature: detected.signatureNodes.length > 0
      ? { html: renderToHtml(detected.signatureNodes), raw: extractPlainText(detected.signatureNodes) }
      : undefined,
  };
}
```

**优势**：
- ✅ 标记优先（可靠）
- ✅ 启发式兜底（鲁棒）
- ✅ 用户编辑友好（签名被修改也能识别）

---

### ⚠️ 问题 6：unknown-block 的用户体验

```typescript
// 当前设计：unknown-block 只是"保留数据"
// 但用户看到后可能困惑："这是什么？我该怎么办？"

// 改进建议：可操作的 unknown-block
interface UnknownBlockActions {
  // 操作 1：尝试修复
  retry: () => void;
  
  // 操作 2：转为纯文本
  convertToText: () => void;
  
  // 操作 3：查看原始数据
  viewRaw: () => void;
  
  // 操作 4：报告问题
  reportIssue: () => void;
}
```

**改进的 UI**：

```typescript
function UnknownBlockRenderer({ node, onAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="unknown-block" data-severity={getSeverity(node)}>
      {/* 标题栏 */}
      <div className="unknown-block-header">
        <Icon type="warning" />
        <span>无法识别的内容</span>
        <Tooltip content="此内容来自 Outlook，但 4DNote 无法解析其格式。数据已保留，不会丢失。">
          <Icon type="help" />
        </Tooltip>
      </div>
      
      {/* 预览 */}
      <div className="unknown-block-preview">
        {node.rawText || '(无文本内容)'}
      </div>
      
      {/* 操作按钮 */}
      <div className="unknown-block-actions">
        <Button onClick={() => onAction('convertToText', node)}>
          转为纯文本
        </Button>
        <Button onClick={() => onAction('retry', node)}>
          重新解析
        </Button>
        <Button onClick={() => setExpanded(!expanded)}>
          {expanded ? '收起' : '查看详情'}
        </Button>
      </div>
      
      {/* 详情面板 */}
      {expanded && (
        <div className="unknown-block-details">
          <Tabs>
            <Tab label="原始 HTML">
              <CodeBlock language="html">{node.rawHtml}</CodeBlock>
            </Tab>
            <Tab label="原始 Meta">
              <CodeBlock language="json">
                {JSON.stringify(node.rawMeta, null, 2)}
              </CodeBlock>
            </Tab>
            <Tab label="诊断信息">
              <ul>
                <li>原因：{node.reason}</li>
                <li>时间：{new Date(node.createdAt).toLocaleString()}</li>
                <li>版本：{node.version}</li>
              </ul>
            </Tab>
          </Tabs>
          
          <Button
            onClick={() => onAction('reportIssue', node)}
            variant="secondary"
          >
            报告此问题（帮助我们改进）
          </Button>
        </div>
      )}
    </div>
  );
}

// 操作处理
function handleUnknownBlockAction(action: string, node: UnknownBlock) {
  switch (action) {
    case 'convertToText':
      // 转为普通段落
      return {
        type: 'paragraph',
        id: node.id,
        children: [{ text: node.rawText }],
      };
      
    case 'retry':
      // 使用最新解析器重试
      try {
        return registry.decode(node.rawHtml, node.rawMeta);
      } catch (error) {
        message.error('仍然无法解析');
        return node;
      }
      
    case 'reportIssue':
      // 收集诊断信息并发送
      reportIssueToServer({
        type: 'unknown-block',
        rawHtml: node.rawHtml,
        rawMeta: node.rawMeta,
        reason: node.reason,
        userAgent: navigator.userAgent,
        appVersion: APP_VERSION,
      });
      message.success('感谢反馈！我们会尽快修复');
      break;
  }
}
```

---

## 四、架构演进路径建议

### Phase 0：底座搭建 ⭐⭐⭐⭐⭐ （你已完成？）

```typescript
✅ ElementRegistry 基础实现
✅ unknown-block 安全阀
✅ 测试框架搭建
⚠️ 性能监控埋点（建议补充）
```

---

### Phase 1：核心重构（建议执行顺序）

```typescript
// Week 1-2: 拆分 normalizeEventLog
// 目标：将 500+ 行函数拆分为管线式处理

Step 1: 定义接口
- Source, DocumentIR, CanonicalEventLog 类型
- EventLogNormalizer, EventLogCodec, EventLogHtmlAdapter 类

Step 2: 实现各模块
- HtmlAdapter: cleanupOutlookHtml
- Codec: encode/decode（含 Meta 匹配）
- Normalizer: 管线编排

Step 3: 单元测试
- 每个模块独立测试
- 集成测试（端到端）

Step 4: 迁移现有调用
- 保留旧函数作为 wrapper（向后兼容）
- 逐步迁移调用方
- 性能对比（确保不退化）

验收标准：
✅ 测试覆盖率 > 80%
✅ 性能不低于现有实现
✅ 所有现有测试通过
```

---

```typescript
// Week 3-4: 实现 ElementRegistry
// 目标：支持可扩展的元素系统

Step 1: 注册核心元素
- paragraph, heading, list-item (Tier A)
- property, mention, table (Tier B)

Step 2: 实现 fallbackDecode
- 每个元素的降级策略
- 兜底为 unknown-block

Step 3: 版本迁移支持
- migrate 方法实现
- 向后兼容旧版 Meta

验收标准：
✅ 新增元素不改主流程
✅ 降级策略测试通过
✅ 版本迁移测试通过
```

---

```typescript
// Week 5-6: 优化三层匹配
// 目标：性能提升 5-10 倍

Step 1: 实现索引优化
- MetaMatcher 类
- prefix-based indexing

Step 2: 实现早期退出
- 分层匹配（高信心度优先）
- 快速路径（完全匹配直接返回）

Step 3: 性能测试
- 基准测试（100/500/1000 段落）
- 对比优化前后

验收标准：
✅ 500 段落 < 500ms
✅ 1000 段落 < 1s
✅ 匹配准确率 > 95%
```

---

### Phase 2：增强功能（P1/P2）

```typescript
// Week 7-8: 分级 Meta
// 目标：支持大文档（> 500 段）

Step 1: 实现 lite 模式
- 体积检测
- 关键节点提取

Step 2: 实现部分匹配
- 关键节点精确匹配
- 其他节点模糊匹配

验收标准：
✅ Meta 体积 < 16 KB
✅ 大文档同步正常
```

---

```typescript
// Week 9-10: Signature 优化
// 目标：鲁棒的签名处理

Step 1: 启发式检测
- 分隔符检测
- 模板匹配

Step 2: 标记机制
- data-4d-signature 属性
- 编码/解码支持

验收标准：
✅ 签名检测准确率 > 90%
✅ 用户编辑签名不影响内容
```

---

### Phase 3：长期优化（P2）

```
- 增量 Meta（需要评估 ROI）
- 多版本共存（支持 A/B 测试）
- 离线冲突解决（CRDT 或 OT）
- 性能监控和自动降级
```

---

## 五、关键决策建议

### 决策 1：是否引入 IR（中间表示）？

```

建议：引入 IR ⭐⭐⭐⭐⭐

原因：
✅ 解耦：HTML/Slate 格式变化不影响对方
✅ 可测试：IR 是"真相源"，易于验证
✅ 可扩展：未来支持 Markdown/PDF 导入，只需实现 -> IR 的转换
✅ 可观测：可在 IR 层插入日志/监控

IR 设计：
**IR 设计**：

```typescriptace DocumentIR {
  version: number;
  blocks: BlockIR[];
  meta: DocumentMeta;
}

interface BlockIR {
  id: string;
  type: 'paragraph' | 'heading' | 'list' | 'table' | ...;
  content: InlineIR[];
  attributes: Record<string, any>; // level, checked, etc.
  meta: BlockMeta;
}

interface InlineIR {
  type: 'text' | 'link' | 'mention' | 'timestamp' | ...;
  text: string;
  marks: Mark[]; // bold, italic, code
  attributes: Record<string, any>;
```

**流转**：
```

**优势**`
流转：
HTML -> (parse) -> DocumentIR -> (valite -> (parse) -> DocumentIR -> (serialize) -> HTML

优势：
- DocumentIR 可以被多种格式共享
- 规范化逻辑只在 IR 层处理一次
- 未来支持更多格式（Markdown, Notion blocks, 等）
```
**问题**：1000+ 段落的文档，解析/匹配可能阻塞主线程

**建议：Yes（但分阶段实施）** Web Worker 处理大文档？

```
问题：1000+ 段落的文档，解析/匹配可能阻塞主线程

建议：Yes（但分阶段实施）⭐⭐⭐⭐

Phase 1（立即）：
- 在主线程实现，但加性能监控
- 如果 > 200ms，显示 Loading

Phase 2（如果有性能问题）：
- 将 decode 逻辑移到 Worker
**实现**：

```typescript线程只负责 UI 更新

实现：
// main.ts
const worker = new Worker(new URL('./decoder.worker.ts', import.meta.url));

function decodeAsync(html: string, meta: CompleteMeta): Promise<DocumentIR> {
  return new Promise((resolve, reject) => {
    const id = generateId();
    worker.postMessage({ type: 'decode', id, html, meta });
    
    const handler = (event) => {
      if (event.data.id === id) {
        worker.removeEventListener('message', handler);
        if (event.data.error) {
          reject(event.data.error);
        } else {
          resolve(event.data.result);
        }
      }
    };
    
    worker.addEventListener('message', handler);
  });
}

// decoder.worker.ts
self.addEventListener('message', (event) => {
  const { type, id, html, meta } = event.data;
  
  if (type === 'decode') {
    try {
      const result = codec.decode(html, meta);
      self.postMessage({ id, result });
    } catch (error) {
      self.postMessage({ id, error: error.message });
    }
  }
});

// 使用示例
async function loadEvent(outlookHtml: string, meta: CompleteMeta) {
  showLoading('正在加载...');
  
  try {
    const result = await decodeAsync(outlookHtml, meta);
    renderDocument(result);
  } catch (error) {
    showError('加载失败', error);
```

**注意事项**hideLoading();
  }
}

注意事项：
⚠️ Worker 无法访问 DOM（需要传纯数据）
⚠️ 需要序列化开销（大文档可能更慢）
**决策建议**试复杂度增加
- Phase 1: 主线程 + 性能监控（立即）
- Phase 2: Worker（如果 P95 > 500ms）se 1: 主线程 + 性能监控（立即）
Phase 2: Worker（如果 P95 > 500ms）
```

---

### 决策 3：CompleteMeta V2 的字段压缩

```typescript
// 当前问题：Meta 体积过大
// 例如：{ t: 'paragraph', id: 'abc123', s: 'Hello', e: 'world', l: 11 }
// → 约 80-100 bytes（JSON 序列化后）

// 优化策略 A：使用更短的字段名（已采用）✅
{ t: 'p', id: 'abc', s: 'Hell', e: 'orld', l: 11 }
→ 节省 20-30%

// 优化策略 B：使用 Base64 编码（激进）
// 将整个 Meta 转为二进制，再 Base64 编码
const binaryMeta = encodeToBinary(meta); // 自定义二进制格式
const base64Meta = btoa(binaryMeta);
→ 节省 40-50%，但失去可读性

// 优化策略 C：使用 gzip 压缩（推荐）
import pako from 'pako';

function compressMeta(meta: CompleteMeta): string {
  const json = JSON.stringify(meta);
  const compressed = pako.deflate(json);
  return btoa(String.fromCharCode(...compressed));
}

function decompressMeta(compressed: string): CompleteMeta {
  const binary = atob(compressed).split('').map(c => c.charCodeAt(0));
  const json = pako.inflate(new Uint8Array(binary), { to: 'string' });
  return JSON.parse(json);
}

// 对比：
原始 JSON: 10 KB
gzip 压缩: 2-3 KB（节省 70-80%）
→ 适合大文档场景

建议：
- < 16 KB：使用原始 JSON（便于调试）
- >= 16 KB：使用 gzip 压缩
- 标记压缩版本：{ v: 2, compressed: true, data: '...' }
```

---

### 决策 4：是否支持"修复模式"（Repair Path）？
你的文档中提到 Repair Path，但没有详细设计。
// 你的文档中提到 Repair Path，但没有详细设计
// 这是一个非常有价值的功能！

场景：
1. 用户在 Outlook 严重修改了内容（删除/重排段落）
2. Meta 无法匹配（< 50% 匹配率）
3. 自动解析结果不理想

传统做法：
❌ 强制使用解析结果（用户数据可能丢失）
❌ 拒绝同步（用户无法继续使用）

你的 Repair Path（推荐）：
✅ 提供"修复向导"，让用户手动对齐

设计：
interface RepairSession {
  id: string;
  outlookHtml: string;
  outlookMeta: CompleteMeta;
  localDocument: DocumentIR;
  
  // 匹配结果（自动生成）
  matches: {
    outlookBlockIndex: number;
    localBlockId?: string;
    confidence: number;
    suggestion: 'keep-outlook' | 'keep-local' | 'merge';
  }[];
  
  // 用户决策
  userDecisions: {
    outlookBlockIndex: number;
    action: 'accept-outlook' | 'reject' | 'merge' | 'skip';
    mergedContent?: string;
  }[];
}

// UI 设计
function RepairWizard({ session }: Props) {
  return (
    <div className="repair-wizard">
      <div className="repair-header">
        <h2>检测到 Outlook 内容变化较大</h2>
        <p>请逐段确认如何处理：</p>
      </div>
      
      <div className="repair-progress">
        已处理：{session.userDecisions.length} / {session.matches.length}
      </div>
      
      {session.matches.map((match, index) => (
        <RepairBlock
          key={index}
          match={match}
          outlookContent={getOutlookBlock(session.outlookHtml, match.outlookBlockIndex)}
          localContent={getLocalBlock(session.localDocument, match.localBlockId)}
          onDecide={(action, merged) => {
            handleDecision(session.id, index, action, merged);
          }}
        />
      ))}
      
      <div className="repair-actions">
        <Button onClick={() => autoResolve(session)}>
          自动解决（使用推荐）
        </Button>
        <Button onClick={() => applyDecisions(session)} variant="primary">
          应用决策
        </Button>
      </div>
    </div>
  );
}

function RepairBlock({ match, outlookContent, localContent, onDecide }: Props) {
  const [action, setAction] = useState(match.suggestion);
  
  return (
    <div className="repair-block">
      {/* 两列对比 */}
      <div className="repair-comparison">
        <div className="repair-column">
          <h4>Outlook 版本</h4>
          <pre>{outlookContent}</pre>
        </div>
        
        <div className="repair-column">
          <h4>4DNote 本地版本</h4>
          <pre>{localContent || '(已删除)'}</pre>
        </div>
      </div>
      
      {/* 操作选项 */}
      <div className="repair-options">
        <Radio.Group value={action} onChange={e => setAction(e.target.value)}>
          <Radio value="accept-outlook">
            使用 Outlook 版本
            {match.confidence < 0.3 && <Badge>推荐</Badge>}
          </Radio>
          <Radio value="reject">
            保留本地版本
            {match.confidence > 0.7 && <Badge>推荐</Badge>}
          </Radio>
          <Radio value="merge">
            手动合并
          </Radio>
          <Radio value="skip">
            跳过（保持当前状态）
          </Radio>
        </Radio.Group>
        
        {action === 'merge' && (
          <TextArea
            placeholder="请输入合并后的内容"
            defaultValue={outlookContent}
          />
        )}
        
        <Button onClick={() => onDecide(action, getMergedContent())}>
          确认
        </Button>
      </div>
    </div>
  );
}

// 何时触发 Repair Mode？
function shouldEnterRepairMode(
  matchResult: MatchResult[],
  threshold: number = 0.5
): boolean {
  const matchedCount = matchResult.filter(r => r.confidence > 0.7).length;
  const matchRate = matchedCount / matchResult.length;
  
  return matchRate < threshold;
}

// 自动修复策略
function autoResolve(session: RepairSession): UserDecision[] {
  return session.matches.map(match => {
    if (match.confidence > 0.8) {
      return { action: 'reject' }; // 高信心度 → 保留本地
    } else if (match.confidence < 0.3) {
      return { action: 'accept-outlook' }; // 低信心度 → 使用 Outlook
    } else {
      return { action: 'skip' }; // 中等信心度 → 让用户决定
    }
  });
}
```

**价值**：
- ✅ 避免数据丢失（用户可选择）
- ✅ 提升用户信任（透明化冲突）
- ✅ 教育用户（理解 Outlook 同步机制）

---

### 决策 5：是否记录 Meta 匹配的遥测数据？

```typescript
// 目的：了解真实场景中的匹配效果
// 帮助优化算法

interface MetaMatchTelemetry {
  eventId: string;
  timestamp: number;
  
  // 输入
  htmlBlockCount: number;
  metaNodeCount: number;
  htmlSize: number;
  metaSize: number;
  
  // 输出
  matchResults: {
    layer: 1 | 2 | 3 | 0; // 0 = fallback
    confidence: number;
  }[];
  
  // 性能
  elapsedMs: number;
  
  // 用户行为
  userTriggeredRepair: boolean;
  repairDecisions?: string[]; // ['accept-outlook', 'reject', ...]
}

// 收集遥测
function collectTelemetry(
  html: string,
  meta: CompleteMeta,
  result: MatchResult[],
  elapsed: number
): MetaMatchTelemetry {
  return {
    eventId: generateAnonymousId(), // 匿名化
    timestamp: Date.now(),
    htmlBlockCount: countBlocks(html),
    metaNodeCount: meta.slate.nodes.length,
    htmlSize: html.length,
    metaSize: JSON.stringify(meta).length,
    matchResults: result.map(r => ({
      layer: r.layer,
      confidence: r.confidence,
    })),
    elapsedMs: elapsed,
    userTriggeredRepair: false,
  };
}

// 分析遥测（后台任务）
function analyzeTelemetry(data: MetaMatchTelemetry[]) {
  // 统计指标
  const stats = {
    avgMatchRate: calculateAvgMatchRate(data),
    layer1Percentage: calculateLayerPercentage(data, 1),
    layer2Percentage: calculateLayerPercentage(data, 2),
    layer3Percentage: calculateLayerPercentage(data, 3),
    fallbackPercentage: calculateLayerPercentage(data, 0),
    avgElapsedMs: calculateAvgElapsed(data),
    p95ElapsedMs: calculateP95Elapsed(data),
    
    // 问题案例
    slowCases: data.filter(d => d.elapsedMs > 1000),
    lowMatchRateCases: data.filter(d => calculateMatchRate(d) < 0.5),
  };
  
  // 输出报告
  console.log('Meta Match Telemetry Report:', stats);
  
  // 如果发现问题，发送警报
  if (stats.fallbackPercentage > 0.2) {
    alert('警告：Fallback 比例过高（> 20%），需要优化匹配算法');
  }
}

建议：
✅ 开发环境：始终记录（帮助调试）
✅ 生产环境：采样记录（5-10%，减少开销）
✅ 用户隐私：匿名化，不记录内容文本
```

---

## 六、风险评估与缓解措施

### 风险 1：重构期间的并行开发冲突 ⚠️⚠️⚠️

```
问题：
- 你可能在重构 normalizeEventLog
- 同时 Copilot 可能在修改依赖它的代码
- 导致合并冲突或功能破坏

缓解措施：
1. 功能冻结（推荐）
   - 重构期间暂停新功能开发
   - 只修 P0 bug
   - 周期：2-3 周

2. Feature Flag（如果无法冻结）
   - 使用开关控制新旧实现
   - 逐步迁移，降低风险

// 实现
const USE_NEW_NORMALIZER = process.env.FEATURE_NEW_NORMALIZER === 'true';

function normalizeEventLog(input) {
  if (USE_NEW_NORMALIZER) {
    return newNormalizer.normalize(input);
  } else {
    return oldNormalizeEventLog(input); // 保留旧实现
  }
}

// 测试策略
describe('normalizeEventLog', () => {
  it('new implementation matches old implementation', () => {
    const inputs = loadTestFixtures();
    
    for (const input of inputs) {
      const oldResult = oldNormalizeEventLog(input);
      const newResult = newNormalizer.normalize(input);
      
      // 语义相同（忽略字段顺序）
      expect(normalize(newResult)).toEqual(normalize(oldResult));
    }
  });
});

3. 锁文件机制（你已提到）✅
   - 编辑 normalizeEventLog 时，lock 文件
   - Copilot 看到 lock，避免修改
```

---

### 风险 2：Outlook API 行为变化 ⚠️⚠️

```
问题：
- Microsoft 可能更新 Outlook/Exchange API
- HTML 清洗规则可能变化
- CompleteMeta 可能被截断或删除

缓解措施：
1. 版本检测
   - 记录 Outlook 版本（User-Agent）
   - 不同版本使用不同策略

2. 降级策略（你已有）✅
   - Meta 缺失 → HTML 解析
   - HTML 异常 → 纯文本导入

3. 监控与告警
   - 检测异常模式（如：Meta 丢失率突增）
   - 自动回滚到保守策略

4. 备份机制
   - 在 4DNote 侧保留完整数据
   - Outlook 只是"视图"
   - 最坏情况：重新同步

// 实现
function detectOutlookVersion(userAgent: string): string {
  // 解析 User-Agent
  // 例如：Outlook/16.0 (Windows NT 10.0)
  const match = userAgent.match(/Outlook\/([\d.]+)/);
  return match ? match[1] : 'unknown';
}

function selectStrategy(version: string): SyncStrategy {
  if (version.startsWith('16.')) {
    return new Outlook2019Strategy();
  } else if (version.startsWith('15.')) {
    return new Outlook2016Strategy();
  } else {
    return new ConservativeStrategy(); // 兜底
  }
}
```

---

### 风险 3：性能回归 ⚠️⚠️

```
问题：
- 新实现可能更慢（抽象层开销）
- 三层匹配可能拖累性能

缓解措施：
1. 性能基准测试（你已提到）✅
   - 每次重构后运行基准测试
   - 对比 P50/P95/P99 延迟

2. 性能预算
   - 定义可接受的阈值
   - 例如：500 段落 < 500ms
   - 超过阈值 → 阻止合并

3. 渐进式优化
   - 先保证正确性
   - 再优化性能（profiling 后针对性优化）

4. 降级开关
   - 如果检测到性能问题，自动切换到简化模式
   - 例如：跳过三层匹配，直接生成新 id

// 实现
const PERFORMANCE_BUDGET = {
  decode: {
    '100-blocks': 100, // 100 段 < 100ms
    '500-blocks': 500, // 500 段 < 500ms
    '1000-blocks': 1000, // 1000 段 < 1s
  }
};

function checkPerformanceBudget(blockCount: number, elapsed: number) {
  const budgetKey = blockCount <= 100 ? '100-blocks'
    : blockCount <= 500 ? '500-blocks'
    : '1000-blocks';
  
  const budget = PERFORMANCE_BUDGET.decode[budgetKey];
  
  if (elapsed > budget) {
    console.warn(`Performance budget exceeded: ${elapsed}ms > ${budget}ms`);
    reportToMonitoring({ type: 'performance-regression', blockCount, elapsed });
  }
}
```

---

### 风险 4：数据迁移失败 ⚠️

```
问题：
- 用户已有数据使用旧格式
- 新版本无法解析
- 用户升级后数据丢失

缓解措施：
1. 向后兼容（你已考虑）✅
   - 支持 CompleteMeta V1 和 V2
   - 支持 unknown-block 兜底

2. 数据迁移脚本
   **数据迁移脚本**动时检测旧数据
   - 自动升级到新格式
   - 保留备份

// 实现
```typescript
async function migrateUserData() {
  const events = await db.events.toArray();
  const needsMigration = events.filter(e => needsMigrate(e));
  
  if (needsMigration.length === 0) {
    return;
  }
  
  console.log(`Migrating ${needsMigration.length} events...`);
  
  for (const event of needsMigration) {
    try {
      // 备份
      await db.backups.put({ ...event, backupAt: Date.now() });
      
      // 迁移
      const migrated = migrateEvent(event);
      await db.events.put(migrated);
      
      console.log(`Migrated event ${event.id}`);
    } catch (error) {
      console.error(`Failed to migrate event ${event.id}:`, error);
      // 保留原数据，不中断流程
    }
  }
  
  console.log('Migration complete');
}

// 启动时执行
appStartup.then(() => {
  migrateUserData();
```

3. **灰度发布**
3. 灰度发布
   - 先给 5% 用户
   **回滚机制**错误率
   - 逐步扩大到 100%
回滚机制
   - 保留旧版本代码（至少 1-2 个版本）
   - 如果发现严重问题，快速回滚
```

---

## 七、最终建议

### ⭐ 优先级 P0（立即执行）

1. **✅ 完善测试套件**
   - 性能基准测试
   - Fuzz 测试
   - 边界测试
   → 时间：2  
   → 时间：2-3 天

2. **✅ 实现 unknown-block UI**
   - 用户修复工具
   → 时间：1-2  
   → 时间：1-2 天

3. **✅ 拆分 normalizeEventLog**
   - 职责分离
   → 时间：1-2 周
```  
   → 时间：1-2 周

### ⭐ 优先级 P1（短期执行）

```
4. ✅ 实现 ElementRegistry
   - 注册核心元素
4. **✅ 实现 ElementRegistry**

5. ✅ 优化三层匹配性能
   - 索引优化  
   → 时间：1 周

5. **✅ 优化三层匹配性能**
6. ✅ 实现分级 Meta
   - lite  
   → 时间：3-5 天

6. **✅ 实现分级 Meta**

---  
   → 时间：3-5 天 ⭐ 优先级 P2（中期考虑）

```
7. ⚠️ Repair Mode
   - 修复向导 UI
   - 手动对齐工具
   → 时间：1-2 周
7. **⚠️ Repair Mode**
   - 匹配效果监控
   - 性能监控  
   → 时间：1-2 周

8. **⚠️ 遥测系统**ature 优化
   - 启发式检测
   - 标记机制  
   → 时间：3-5 天

9. **⚠️ Signature 优化**
---  
   → 时间：3-5 天 ⭐ 可选优化（长期）

```
10. 🔮 IR（中间表示）
    - 解耦 HTML/Slate
    - 支持更多格式
    → ROI：高，但需要大重构
10. **🔮 IR（中间表示）**er
    - 大文档性能优化
    - 避免阻塞主线程
    → ROI：中，  
    → ROI：高，但需要大重构

11. **🔮 Web Worker**
    - 需要复杂的 diff 算法
    → ROI：低，除  
    → ROI：中，仅在性能问题严重时

12. **🔮 增量 Meta**

## 八、总结  
    → ROI：低，除非有大量编辑场景 你的重构方案的核心优势 ⭐⭐⭐⭐⭐

```
1. 问题定位精准
   ✅ 直击痛点（Outlook 回读只显示第一行）
   ✅ 根因明确（DOM 清洗、Meta 串线、降级策略）

2. 架构设计合理
   ✅ 分层清晰（Adapter/Codec/Registry/Normalizer）
   ✅ 职责分离（Write/Read/Repair Path）
1. **问题定位精准**
3. 工程实践扎实
   ✅ 测试驱动（契约测试、回归测试）
   ✅ 可观测性（遥测、监控）
   ✅ 鲁棒性强（unknown-block 安全阀）
**架构设计合理**
4. 前瞻性设计
   ✅ 版本迁移（V1/V2 兼容）
   ✅ 降级策略（Tier A/B/C）
   ✅ 用户友好（Repair Mode）
```
**工程实践扎实**
---

### 我建议补充的关键点

```**前瞻性设计**
1. 引入 IR（中间表示）
   → 解耦格式，提升可测试性
性能优化策略
   → 索引、早期退出、Worker（按需）

3. 分级 Meta
   → 支持大文档（> 500 段）

4. Repair Mode
1. **引入 IR（中间表示）**
5. 遥测系统
   → 持续改进匹配算法
```
**性能优化策略**
---
**分级 Meta**
### 最后的话 💬

你的重**Repair Mode***远超大部分独立开发者的水平**。

我的建议主要是"锦上添花"，而不是"纠正错误"。
**遥测系统**心建议**：
1. ✅ 优先完成 P0（测试 + normalizeEventLog 拆分）
2. ✅ 在实施过程中逐步验证（不要一次性大重构）
3. ✅ 保持可回滚（Feature Flag + 数据备份）
4. ✅ 持续监控（性能 + 匹配效果）

你已经走在正确的道路上！💪

**预计时间表**：
- Phase 0（底座）：已完成 ✅
- Phase 1（核心重构）：2-3 周
- Phase 2（增强功能）：2-3 周
- Phase 3（长期优化）：按需迭代

**总重构周期**：**4-6 周**（如果全职投入）

这个时间投入是值得的——你将获得：
- ✅ 更稳定的同步机制
- ✅ 更易维护的代码架构
- ✅ 更强的扩展能力（未来新功能）
- ✅ 更好的用户体验（降级处理、Repair Mode）

加油！🚀


---

## 🎯 架构对齐分析（基于 APP_ARCHITECTURE & REFACTOR_MASTER）

### 现有架构关键事实

通过阅读 `APP_ARCHITECTURE_PRD.md` 和 `REFACTOR_MASTER_PLAN_v2.22.md`，发现：

#### ✅ 已落地的核心架构原则

1. **ADR-001（树结构真相）**：`parentEventId` 为唯一真相，`childEventIds` 为 legacy 字段
   - ✅ **与 EventService v2 设计完全一致**
   - ✅ 三层匹配只需关注 `parentEventId` 字段的恢复

2. **状态分类法（A/B/C/D/E）**：已明确定义
   - (C) 领域数据真相 → EventService/EventHub
   - (E) 持久化管线态 → 自建 pipeline
   - ✅ **与"Write Path 强规范"完全一致**

3. **EventHub 订阅视图**：正在推进（Epic 2）
   - 目标：UI 使用 `useEventHubEvent/useEventHubQuery`
   - ✅ **与 EventService v2 的"读路径轻量"一致**

4. **字段保护机制**：已实现本地专属字段过滤
   - `localOnlyFields` 永不被远程覆盖
   - ✅ **与 CompleteMeta V2 的"Meta 是增强器"一致**

5. **同步状态机**：`syncStatus: local-only/pending/synced/failed`
   - ✅ **EventService v2 需兼容此状态机**

#### ⚠️ 当前架构的关键约束

1. **不引入 Redux**：明确决策，使用 useReducer + 自建 store
   - ✅ Claude 建议的 IR 需调整：不暴露为全局状态
   - ✅ EventLogCodec 应作为内部转换层，不成为新的"全局真相"

2. **Slate 编辑器正确性优先**（Epic 1）：禁止镜像 value、禁止 key remount
   - ⚠️ 这影响 EventService v2 的 normalize 时机
   - ✅ 调整：normalize 仅在写入时（save/sync），不在编辑器 onChange

3. **小步提交 + 可回滚**：每步改动必须独立验证
   - ⚠️ Claude 建议的 4-6 周完整重构需拆分
   - ✅ 调整：Phase 1 只做基础设施，不改现有数据流

4. **EventTree 维护策略**：
   - Tab/Shift+Tab 只设置 `parentEventId`
   - 子列表通过查询派生，不维护 `childEventIds`
   - ✅ **与三层匹配的字段优先级一致**

---

## 📝 基于架构对齐的修订建议

### 修订 1：IR（中间表示）的定位调整 ⭐⭐⭐⭐⭐

**Claude 原建议**：引入完整 DocumentIR 作为格式抽象层

**架构约束冲突**：
- ❌ 会引入新的"全局真相源"（违反 single source of truth）
- ❌ 需要大量组件改动（违反小步迭代）
- ❌ 可能与 Slate 编辑器产生状态同步问题

**修订后方案**：

```typescript
// ✅ 仅在 EventLogCodec 内部使用轻量 IR（不暴露）
class EventLogCodec {
  encode(eventlog: EventLog): { html: string; meta: CompleteMeta } {
    // 1. Slate JSON → IR（内部）
    const ir = this.slateToIR(eventlog.slateJson);
    
    // 2. IR → HTML + Meta（对外）
    return this.irToHtmlAndMeta(ir);
  }
  
  decode(html: string, meta?: CompleteMeta): EventLog {
    // 1. HTML + Meta → IR（内部）
    const ir = this.htmlAndMetaToIR(html, meta);
    
    // 2. IR → Slate JSON（对外）
    return { slateJson: this.irToSlate(ir) };
  }
  
  // IR 定义为私有类型，不导出
  private interface BlockIR {
    type: string;
    text: string;
    marks: Mark[];
    // ...
  }
}
```

**关键点**：
- IR 仅作为编解码中间格式（类似编译器的 AST）
- 对外仍然是 Slate JSON（与现有架构无缝对接）
- 不引入新的状态管理层
- 优先级：P1（与 EventLogCodec 同步实施）

---

### 修订 2：normalize 时机与 Slate 编辑器解耦 ⭐⭐⭐⭐⭐

**Claude 原建议**：DocumentNormalizer 纯函数，实时规范化

**架构约束冲突**：
- ❌ Slate onChange 中调用 normalize 会打断用户输入
- ❌ 违反"编辑器单一状态源"原则（Epic 1）

**修订后方案**：

```typescript
// ❌ 错误做法（违反 Epic 1）
function MySlateEditor() {
  const handleChange = (value) => {
    const normalized = normalizer.normalize(value); // 打断输入
    setEditorValue(normalized);
  };
}

// ✅ 正确做法（符合架构）
function MySlateEditor() {
  const handleChange = (value) => {
    // 编辑器内部状态不做 normalize
    setEditorValue(value);
  };
  
  const handleSave = async () => {
    // 仅在写入时 normalize
    const canonical = await EventService.normalizeEventLog(editorValue);
    await EventService.saveEvent({ eventlog: canonical });
  };
}
```

**架构对齐**：
- ✅ 编辑器 onChange：不做 normalize（保持 source-of-truth）
- ✅ 保存时：一次性 canonicalize（Write Path 强规范）
- ✅ 读取时：轻量处理（Read Path 轻量）
- 优先级：P0（与现有编辑器流程无缝对接）

---

### 修订 3：EventHub 读取方式的具体实现 ⭐⭐⭐⭐⭐

**Claude 原建议**：UI 使用订阅 + selector

**REFACTOR_MASTER 口径**：
```typescript
// 推荐命名（v2.22 唯一口径）
useEventHubEvent(eventId)
useEventHubQuery(selector, deps?)
useEventHubSnapshot()
```

**修订后实现**（符合 Epic 2）：

```typescript
// ✅ 与 EventService v2 集成的推荐实现
export function useEventHubEvent(eventId: string): Event | null {
  const [event, setEvent] = useState<Event | null>(null);
  
  useEffect(() => {
    // 初始读取（轻量）
    const initial = EventService.getEvent(eventId);
    setEvent(initial);
    
    // 订阅更新
    const unsubscribe = EventHub.subscribe('eventUpdated', (updatedEvent) => {
      if (updatedEvent.id === eventId) {
        setEvent(updatedEvent);
      }
    });
    
    return unsubscribe;
  }, [eventId]);
  
  return event;
}

// ✅ 查询式订阅（支持 selector）
export function useEventHubQuery<T>(
  selector: (events: Event[]) => T,
  deps: any[] = []
): T {
  const [result, setResult] = useState<T>(() => {
    const snapshot = EventService.getAllEvents();
    return selector(snapshot);
  });
  
  useEffect(() => {
    const handleUpdate = () => {
      const snapshot = EventService.getAllEvents();
      const newResult = selector(snapshot);
      setResult(newResult);
    };
    
    // 订阅所有事件更新
    const unsubscribe = EventHub.subscribe('eventsUpdated', handleUpdate);
    
    return unsubscribe;
  }, deps);
  
  return result;
}
```

**架构对齐**：
- ✅ 不在 UI 维护 `allEvents` 真相（符合 Epic 2 目标）
- ✅ 订阅机制利用现有 EventHub
- ✅ 命名符合 REFACTOR_MASTER 口径
- 优先级：P0（与 Epic 2 同步推进）

---

### 修订 4：分级 Meta 与 syncStatus 集成 ⭐⭐⭐⭐

**Claude 原建议**：Meta 体积 < 16KB 用 JSON，>= 16KB 用 gzip

**架构约束整合**：需要与 `syncStatus` 状态机集成

**修订后方案**：

```typescript
interface CompleteMetaV2 {
  v: 2;
  id: string;
  
  // 新增：Meta 级别标记
  level?: 'lite' | 'full' | 'compressed';
  
  slate: {
    nodes: CompleteMetaV2Node[];
  };
  
  // 新增：压缩数据
  compressed?: {
    data: string;      // base64 gzip
    originalSize: number;
  };
  
  signature?: { ... };
}

// EventLogCodec 集成
class EventLogCodec {
  encode(eventlog: EventLog, options?: { syncStatus: SyncStatus }): EncodedResult {
    const metaSize = this.estimateMetaSize(eventlog);
    
    // 策略 1：local-only 事件允许 full Meta
    if (options?.syncStatus === 'local-only') {
      return this.encodeFullMeta(eventlog);
    }
    
    // 策略 2：需要同步的事件，体积控制
    if (metaSize < 16 * 1024) {
      return this.encodeFullMeta(eventlog);
    } else if (metaSize < 32 * 1024) {
      return this.encodeCompressedMeta(eventlog);
    } else {
      return this.encodeLiteMeta(eventlog); // 仅关键节点
    }
  }
}
```

**架构对齐**：
- ✅ 遵守 Outlook 32KB 限制
- ✅ 与现有 `syncStatus` 字段集成
- ✅ local-only 事件不受限制（笔记、运行中 Timer）
- 优先级：P1（Meta 体积问题已在线上出现）

---

### 修订 5：性能优化与现有组件渲染机制对齐 ⭐⭐⭐⭐

**Claude 原建议**：500 段落 < 500ms，1000 段落 < 1s

**APP_ARCHITECTURE 现状**：
- ✅ 已移除 `allEvents` state（v1.7.1）
- ✅ 各组件自行监听 EventHub
- ✅ 使用 `tagsVersion` 触发更新（避免不必要渲染）

**修订后性能策略**：

```typescript
// ✅ 与现有 tagsVersion 机制一致
class EventService {
  private eventlogVersion = 0;
  
  async normalizeEventLog(eventlog: EventLog): Promise<CanonicalEventLog> {
    const startTime = performance.now();
    
    // 快速路径：小文档直接处理
    if (eventlog.slateJson.length < 100) {
      return this.normalizeSmall(eventlog);
    }
    
    // 中型文档：带索引优化
    if (eventlog.slateJson.length < 500) {
      return this.normalizeWithIndex(eventlog);
    }
    
    // 大文档：分批处理（不阻塞主线程）
    const result = await this.normalizeInChunks(eventlog);
    
    const elapsed = performance.now() - startTime;
    if (elapsed > 200) {
      console.warn(`Slow normalize: ${elapsed}ms for ${eventlog.slateJson.length} nodes`);
    }
    
    return result;
  }
  
  // 触发订阅更新
  private notifyEventlogUpdated() {
    this.eventlogVersion++;
    EventHub.emit('eventlogNormalized', this.eventlogVersion);
  }
}

// UI Hook（符合现有模式）
export function useEventlogVersion(): number {
  const [version, setVersion] = useState(0);
  
  useEffect(() => {
    return EventHub.subscribe('eventlogNormalized', setVersion);
  }, []);
  
  return version;
}
```

**架构对齐**：
- ✅ 与 `tagsVersion` 机制一致
- ✅ 避免不必要的组件重渲染
- ✅ 性能监控内置（便于后续优化）
- 优先级：P1（与性能优化同步）

---

### 修订 6：数据迁移与现有 UUID 机制对齐 ⭐⭐⭐⭐⭐

**Claude 原建议**：CompleteMeta V1 → V2 迁移

**APP_ARCHITECTURE 现状**：
- ✅ 已移除 EventIdPool（v2.17），改用 UUID 直接生成
- ✅ Event ID 格式：`evt_<timestamp>_<random>` 或 `timer-<tagId>-<timestamp>`

**修订后迁移策略**：

```typescript
interface MigrationContext {
  // 现有字段格式
  existingIdFormat: 'pool' | 'uuid' | 'timer';
  
  // CompleteMeta 版本
  metaVersion: 1 | 2 | undefined;
  
  // 同步状态
  syncStatus: SyncStatus;
}

async function migrateEvent(event: Event): Promise<Event> {
  // 1. ID 格式无需迁移（v2.17 已统一）
  
  // 2. CompleteMeta 迁移（如果存在）
  if (event.eventlog?.html && !event.eventlog?.meta) {
    // 旧数据：仅有 HTML，无 Meta
    const meta = await extractMetaFromHtml(event.eventlog.html);
    event.eventlog.meta = meta;
  } else if (event.eventlog?.meta?.v === 1) {
    // CompleteMeta V1 → V2
    event.eventlog.meta = migrateMetaV1ToV2(event.eventlog.meta);
  }
  
  // 3. 树结构迁移（ADR-001）
  if (event.childEventIds && event.childEventIds.length > 0) {
    // legacy: 有 childEventIds，但可能不准确
    // 不依赖它，等下次查询时通过 parentEventId 重建
    console.warn(`Event ${event.id} has legacy childEventIds, will be ignored`);
  }
  
  return event;
}
```

**架构对齐**：
- ✅ 不需要迁移 ID 格式（已统一）
- ✅ CompleteMeta 迁移向后兼容
- ✅ 树结构迁移符合 ADR-001
- 优先级：P0（与 Phase 1 同步）

---

## 📊 修订后的实施路线图（符合小步迭代）

### Phase 0：基础设施（1-2 周，P0）

**Week 1：EventLogCodec 基础版**
- [x] 创建 `EventLogCodec` 类（内部 IR，不暴露）
- [x] 实现 `encode/decode` 基础逻辑
- [x] 单元测试：HTML ↔ Slate JSON 往返
- **验收**：现有数据格式不变，所有测试通过

**Week 2：unknown-block 安全阀**
- [x] 定义 `UnknownBlock` 节点类型
- [x] decode 失败兜底逻辑
- [x] UI 渲染（只读展示 + raw 数据查看）
- **验收**：任意 Outlook HTML 都能加载，不崩溃

**集成点**：
- ✅ 不改变现有 `normalizeEventLog` 入口
- ✅ EventLogCodec 作为内部调用
- ✅ 与 Slate 编辑器解耦（仅在 save 时调用）

---

### Phase 1：核心优化（2-3 周，P1）

**Week 3：三层匹配优化**
- [x] 引入 Levenshtein 距离（`fastest-levenshtein`）
- [x] prefix-based indexing
- [x] 早期退出优化
- **验收**：500 段落 < 500ms

**Week 4：分级 Meta**
- [x] Meta 体积检测
- [x] gzip 压缩（pako）
- [x] 与 `syncStatus` 集成
- **验收**：Meta < 16KB（或压缩后 < 16KB）

**Week 5：数据迁移**
- [x] 自动迁移脚本
- [x] Feature Flag 控制
- [x] 备份与回滚机制
- **验收**：迁移成功率 > 99%

**集成点**：
- ✅ 与 EventHub 订阅机制集成（Epic 2）
- ✅ 与现有 `tagsVersion` 模式一致
- ✅ 不阻塞 Slate 编辑器（Epic 1）

---

### Phase 2：增强功能（2-3 周，P2）

**Week 6-7：ElementRegistry**
- [x] 注册核心元素（paragraph/heading/list/mention/property）
- [x] fallbackDecode 实现
- [x] 版本迁移支持
- **验收**：新增元素不改主流程

**Week 8：Repair Mode（简化版）**
- [x] unknown-block 手动标记类型
- [x] 批量修复工具
- **验收**：用户可修复识别失败的块

---

### Phase 3：长期优化（按需，P2）

- [ ] 完整 Repair Mode（可视化对齐）
- [ ] 遥测系统（本地性能报告）
- [ ] Web Worker（仅在性能问题严重时）

---

## ✅ 最终建议摘要（基于架构对齐）

### 🎯 立即执行（P0）

1. **EventLogCodec 基础版**（不暴露 IR，内部使用）
   - 与 Slate 编辑器解耦
   - 仅在 save 时调用
   - 优先级：最高

2. **unknown-block 安全阀**
   - UI 只读展示
   - 不阻塞同步
   - 优先级：最高

3. **数据迁移 + Feature Flag**
   - 备份机制
   - 灰度发布
   - 优先级：最高

### 🚀 短期执行（P1）

4. **三层匹配优化**（编辑距离 + 索引）
5. **分级 Meta**（gzip 压缩 + syncStatus 集成）
6. **与 EventHub 订阅集成**（符合 Epic 2）

### 🔮 中长期（P2）

7. **ElementRegistry**（支持富元素演进）
8. **Repair Mode**（简化版 → 完整版）

### ❌ 不采纳

- IR 作为全局状态层（违反架构）
- normalize 在编辑器 onChange（违反 Epic 1）
- 增量 Meta（复杂度高，ROI 低）

---

## 📋 下一步行动（具体可执行）

1. **创建 EventLogCodec.ts**（Week 1 Day 1）
   ```typescript
   // src/services/eventlog/EventLogCodec.ts
   export class EventLogCodec {
     // 内部 IR（不导出）
     private slateToIR(slateJson: any[]): BlockIR[] { ... }
     
     // 对外接口（符合现有格式）
     encode(eventlog: EventLog): { html: string; meta: CompleteMeta } { ... }
     decode(html: string, meta?: CompleteMeta): EventLog { ... }
   }
   ```

2. **创建 unknown-block 节点类型**（Week 2 Day 1）
   ```typescript
   // src/types/slate-types.ts
   export interface UnknownBlock {
     type: 'unknown-block';
     id: string;
     rawHtml: string;
     rawText: string;
     rawMeta?: unknown;
     reason?: string;
     children: [{ text: '' }];
   }
   ```

3. **集成到 normalizeEventLog**（Week 2 Day 3）
   ```typescript
   // src/services/EventService.ts
   async normalizeEventLog(eventlog: EventLog): Promise<CanonicalEventLog> {
     try {
       const codec = new EventLogCodec();
       const { html, meta } = codec.encode(eventlog);
       const normalized = codec.decode(html, meta);
       return normalized;
     } catch (error) {
       // 兜底：返回 unknown-block
       return this.createUnknownBlockFallback(eventlog, error);
     }
   }
   ```

4. **单元测试**（Week 2 Day 5）
   ```typescript
   describe('EventLogCodec', () => {
     test('encode/decode roundtrip', () => {
       const original = createTestEventLog();
       const codec = new EventLogCodec();
       const { html, meta } = codec.encode(original);
       const decoded = codec.decode(html, meta);
       expect(decoded).toEqual(original);
     });
     
     test('decode without meta (fallback)', () => {
       const html = '<p>Hello <strong>World</strong></p>';
       const codec = new EventLogCodec();
       const decoded = codec.decode(html);
       expect(decoded.slateJson).toBeDefined();
       expect(decoded.slateJson[0].type).toBe('paragraph');
     });
   });
   ```

---

## 📚 参考架构文档（统一口径）

- ✅ **REFACTOR_MASTER_PLAN_v2.22.md**：实施唯一口径
- ✅ **APP_ARCHITECTURE_PRD.md**：状态管理 + 渲染机制
- ✅ **EVENT_FIELD_CONTRACT.md**：字段契约（canonical vs derived）
- ✅ **ADR-001**：树结构以 `parentEventId` 为真相

---

## 建议评估与对比分析

### 评估总结

Claude 的审阅质量：⭐⭐⭐⭐⭐（极高质量，深度理解架构设计）

**核心价值**：
1. 充分肯定了现有设计的合理性
2. 提供了具有工程实践价值的增强建议
3. 给出了清晰的优先级划分和时间规划
4. 提供了大量可直接使用的代码示例

---

### 一、高度认可的现有设计要点（无需修改）

✅ **Meta 定位**："增强器而非唯一真相源" - 已正确实现  
✅ **unknown-block 安全阀** - 被评为"天才设计"  
✅ **三层匹配算法** - 算法合理，信心度分级正确  
✅ **ElementRegistry 架构** - 符合开闭原则，支持演进

---

### 二、可直接采纳的增强建议

#### 2.1 三层匹配的编辑距离优化 ⭐⭐⭐⭐⭐

**价值**：提升模糊匹配准确率，处理 Outlook 微小改写  
**技术**：Levenshtein 距离算法（复杂度可控 O(25) for 5-char strings）  
**实施**：在主文档 §5.3 补充  
**优先级**：P1

#### 2.2 Meta 体积控制 - gzip 压缩 ⭐⭐⭐⭐

**价值**：解决大文档 Meta 体积问题（节省 70-80%）  
**策略**：< 16 KB 原始 JSON，>= 16 KB 启用 gzip  
**实施**：在主文档 §A.1 补充  
**优先级**：P1

#### 2.3 数据迁移与灰度发布机制 ⭐⭐⭐⭐⭐

**价值**：保护用户数据，降低重构风险  
**内容**：备份机制、灰度发布、Feature Flag、回滚预案  
**实施**：在主文档新增 §9  
**优先级**：P0

#### 2.4 性能优化 - 索引与早期退出 ⭐⭐⭐⭐

**目标**：500 段落 < 500ms，1000 段落 < 1s  
**技术**：prefix-based indexing + 早期退出  
**实施**：在主文档 §5.3 补充  
**优先级**：P1

---

### 三、需调整后采纳的建议

#### 3.1 IR（中间表示）⭐⭐⭐⚠️

**Claude 建议**：引入完整 DocumentIR  
**调整方案**：
- Phase 1-2：不引入完整 IR
- Phase 3：在 EventLogCodec 内部使用轻量 IR（不暴露）
- 长期：如需新格式支持再评估  
**理由**：重构成本高，当前 ROI 不确定

#### 3.2 Web Worker ⭐⭐⚠️

**Claude 建议**：分阶段引入  
**调整方案**：
- Phase 1：主线程 + 性能监控（P0）
- Phase 2：仅在实测 P95 > 500ms 时考虑（P2 可选）  
**理由**：Electron 桌面端性能通常足够

#### 3.3 Repair Mode ⭐⭐⭐⭐⚠️

**Claude 建议**：完整修复向导  
**调整方案**：分阶段实施
- Phase 1：unknown-block 只读展示（P0）
- Phase 2：简化修复工具（P1）
- Phase 3：完整修复向导（P2）  
**理由**：UI 设计复杂，需分阶段验证

---

### 四、不采纳的建议

❌ **增量 Meta**：复杂度极高，ROI 低，gzip 可解决体积问题  
⚠️ **遥测系统**：调整为 P2，先本地日志，云端遥测需授权

---

### 五、对主文档的修改摘要

将执行以下修改：

1. **§5.3 扩展**：新增编辑距离优化 + 性能优化策略
2. **新增 §9**：数据迁移与回滚策略（包含灰度发布、Feature Flag）
3. **§7 调整**：整合 Claude 的时间规划（Week 1-10）
4. **§10 更新**：新增设计决策记录（IR/Worker/增量 Meta 的决策）
5. **§A.1 补充**：分级 Meta 策略（gzip 压缩）

---

## 主文档修改记录

**修改时间**：2026-01-04  
**修改人**：Copilot（基于 Claude 建议评估）

### 变更摘要

#### ✅ 新增内容

1. **§9 数据迁移与回滚策略**（完整章节）
   - 自动迁移脚本
   - 灰度发布机制
   - Feature Flag 控制
   - 回滚预案

2. **§5.3.2 编辑距离增强**（新增小节）
   - Levenshtein 距离辅助评分
   - 匹配分数阈值调整（80/60/40）

3. **§5.3.3 性能优化策略**（新增小节）
   - prefix-based indexing
   - 早期退出优化
   - 性能基准目标

4. **§10.1 设计决策记录**（新增小节）
   - IR 不立即引入的决策
   - Web Worker 按需引入的决策
   - 增量 Meta 不采纳的决策

#### 🔄 调整内容

1. **§7 实施路线图**
   - 整合 Claude 的 Week 1-10 规划
   - 补充每周验收标准
   - 明确时间估算（4-6 周全职）

2. **§A.1 CompleteMeta V2 对齐**
   - 补充分级 Meta 策略
   - gzip 压缩阈值（16KB）

#### 📝 文档质量提升

- 所有代码示例增加注释
- 性能目标数字化（500ms/1s）
- 验收标准可操作化（> 95% 匹配率）
