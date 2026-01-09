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
---

## Meta 存储策略：Simplified Hybrid（本地/云端主存 + Outlook 最小锚点）

### 核心设计决策（2026-01-09）

**问题背景**：
- 当前 Full Meta 方案将完整元数据存储在 Outlook description（10-30KB/事件），接近 32KB 限制
- 复杂事件（100+ 段落 + 自定义字段）可能超限，且隐私暴露风险高
- 同步性能受体积影响，且无法支持未来的无限自定义字段扩展

**选定方案**：**Simplified Hybrid Storage**

- **Outlook 存储**：仅存储 `rootId`（事件根节点 ID）
- **本地/云端存储**：完整的 block-level metadata（IndexedDB + Cloud Backend）
- **HTML 锚点**：多层级 fallback 策略（data-4d-id + id + class + HTML comment）

---

### 存储分层架构

```typescript
// 1. Outlook Event.description (HTML)
const outlookHtml = `
  <div data-4d-root="${eventId}">
    <p data-4d-id="${block1Id}" id="b-${block1Id}" class="p-${block1Id}">
      第一段落
      <!--4d:${block1Id}-->
    </p>
    <h2 data-4d-id="${block2Id}" id="b-${block2Id}" class="h2-${block2Id}">
      标题
      <!--4d:${block2Id}-->
    </h2>
  </div>
`;

// 2. 本地/云端存储 (IndexedDB + Cloud)
interface EventBlockStore {
  eventId: string;
  blocks: {
    [blockId: string]: {
      id: string;
      type: string;              // paragraph/heading/code-block/property...
      value?: any;               // 结构化字段的值
      bulletLevel?: number;
      level?: number;            // heading level
      createdAt: number;
      updatedAt: number;
      syncedAt?: number;         // 最后同步到云端的时间
      needsCloudSync: boolean;   // 是否需要同步到云端
    };
  };
}

// 3. 云端同步格式（简化）
interface CloudEventMeta {
  eventId: string;
  rootId: string;
  blocks: EventBlockStore['blocks'];
  lastModified: number;
  deviceId: string;              // 用于冲突检测
}
```

---

### 多锚点 Fallback 策略（应对 Outlook 改写）

**现实约束**：Outlook 不同客户端对 `data-4d-id` 的保留率差异巨大：

| 客户端 | data-4d-id 保留率 | id 属性保留率 | class 属性保留率 | HTML 注释保留率 |
|--------|-------------------|---------------|------------------|-----------------|
| Outlook Desktop | 20-40% | 60-70% | 80-90% | 50-60% |
| Outlook Web | 70-80% | 85-90% | 90-95% | 70-80% |
| Outlook Mobile | 10-20% | 40-50% | 60-70% | 30-40% |

**四层 Fallback 机制**：

```typescript
class BlockIdExtractor {
  extract(htmlElement: HTMLElement): string | null {
    // Layer 1: data-4d-id (最标准，但保留率低)
    const dataId = htmlElement.getAttribute('data-4d-id');
    if (dataId && this.validateUUID(dataId)) return dataId;
    
    // Layer 2: id 属性 (去除前缀)
    const idAttr = htmlElement.getAttribute('id');
    if (idAttr?.startsWith('b-')) {
      const extracted = idAttr.substring(2);
      if (this.validateUUID(extracted)) return extracted;
    }
    
    // Layer 3: class 属性 (去除类型前缀)
    const classAttr = htmlElement.getAttribute('class');
    const match = classAttr?.match(/(?:p|h\d|code|prop)-([a-f0-9-]{36})/);
    if (match && this.validateUUID(match[1])) return match[1];
    
    // Layer 4: HTML 注释 (扫描子节点)
    const comment = this.findCommentWithId(htmlElement);
    if (comment && this.validateUUID(comment)) return comment;
    
    // Layer 5: 无法提取 → 模糊匹配
    return null;
  }
  
  findCommentWithId(element: HTMLElement): string | null {
    for (const node of element.childNodes) {
      if (node.nodeType === Node.COMMENT_NODE) {
        const match = node.textContent?.match(/^4d:([a-f0-9-]{36})$/);
        if (match) return match[1];
      }
    }
    return null;
  }
}
```

**预期成功率**（综合四层）：
- Outlook Desktop: 85-90% (vs 单层 20-40%)
- Outlook Web: 95%+ (vs 单层 70-80%)
- Outlook Mobile: 75-85% (vs 单层 10-20%)

---

### 五层匹配策略（整合四层 Fallback + 模糊匹配）

```typescript
class HybridMatcher {
  match(htmlBlocks: HTMLElement[], localBlocks: EventBlockStore['blocks']): MatchResult[] {
    const results: MatchResult[] = [];
    
    for (const htmlBlock of htmlBlocks) {
      // Layer 1: 多锚点 ID 提取 (data-4d-id/id/class/comment)
      const extractedId = this.extractor.extract(htmlBlock);
      if (extractedId && localBlocks[extractedId]) {
        results.push({ 
          htmlBlock, 
          localBlock: localBlocks[extractedId], 
          confidence: 1.0,
          method: 'multi-anchor-exact'
        });
        continue;
      }
      
      // Layer 2: 文本锚点精确匹配 (prefix/suffix/length)
      const textAnchor = this.getTextAnchor(htmlBlock);
      const exactMatch = this.findByAnchor(textAnchor, localBlocks, 'exact');
      if (exactMatch) {
        results.push({ 
          htmlBlock, 
          localBlock: exactMatch, 
          confidence: 0.95,
          method: 'anchor-exact'
        });
        continue;
      }
      
      // Layer 3: 文本锚点模糊匹配 (Levenshtein similarity > 0.85)
      const fuzzyMatch = this.findByAnchor(textAnchor, localBlocks, 'fuzzy');
      if (fuzzyMatch) {
        results.push({ 
          htmlBlock, 
          localBlock: fuzzyMatch, 
          confidence: 0.80,
          method: 'anchor-fuzzy'
        });
        continue;
      }
      
      // Layer 4: HTML 结构匹配 (标签语义)
      const structureMatch = this.findByStructure(htmlBlock, localBlocks);
      if (structureMatch) {
        results.push({ 
          htmlBlock, 
          localBlock: structureMatch, 
          confidence: 0.60,
          method: 'structure'
        });
        continue;
      }
      
      // Layer 5: Fallback (unknown-block)
      results.push({ 
        htmlBlock, 
        localBlock: null, 
        confidence: 0.0,
        method: 'unknown-block'
      });
    }
    
    return results;
  }
}
```

---

### Cloud 同步策略：Last-Write-Wins + Debounce

```typescript
class CloudSyncService {
  private debounceMap = new Map<string, NodeJS.Timeout>();
  
  // 1. 本地编辑 → 标记需要同步
  markForSync(eventId: string, blockId: string) {
    const block = this.localStore.getBlock(eventId, blockId);
    block.needsCloudSync = true;
    block.updatedAt = Date.now();
    
    // Debounce: 3秒内无新编辑才同步
    this.scheduleSync(eventId, 3000);
  }
  
  // 2. 上传到云端
  async syncToCloud(eventId: string) {
    const localMeta = this.localStore.getEventMeta(eventId);
    const cloudMeta = await this.cloudApi.get(eventId);
    
    // Last-Write-Wins: 比较 lastModified
    if (cloudMeta && cloudMeta.lastModified > localMeta.lastModified) {
      // 云端更新 → 提示用户冲突
      return this.handleConflict(localMeta, cloudMeta);
    }
    
    // 本地更新 → 上传
    await this.cloudApi.put(eventId, {
      ...localMeta,
      lastModified: Date.now(),
      deviceId: this.deviceId,
    });
    
    // 清除同步标记
    this.clearSyncFlags(eventId);
  }
  
  // 3. 冲突处理
  handleConflict(local: CloudEventMeta, cloud: CloudEventMeta) {
    // 策略 A: 自动合并（block-level Last-Write-Wins）
    const merged = this.mergeBlocks(local.blocks, cloud.blocks);
    
    // 策略 B: 提示用户选择
    // this.showConflictDialog(local, cloud);
    
    return merged;
  }
  
  mergeBlocks(localBlocks: any, cloudBlocks: any) {
    const merged = { ...cloudBlocks };
    
    for (const [blockId, localBlock] of Object.entries(localBlocks)) {
      const cloudBlock = cloudBlocks[blockId];
      
      // 本地更新 OR 新增
      if (!cloudBlock || localBlock.updatedAt > cloudBlock.updatedAt) {
        merged[blockId] = localBlock;
      }
    }
    
    return merged;
  }
}
```

**同步时机**：
- 编辑完成 3 秒后（debounce）
- 切换事件时
- App 进入后台时
- 定期同步（每 5 分钟）

**冲突检测**：
- 比较 `lastModified` 和 `deviceId`
- Block-level Last-Write-Wins（按 `updatedAt` 合并）
- 可选：提示用户手动解决

---

### 体积对比（100 段落事件）

| 方案 | Outlook Meta 体积 | 本地存储体积 | 云端存储体积 | 隐私风险 | 扩展性 |
|------|-------------------|--------------|--------------|----------|--------|
| **Full Meta (当前)** | ~45 KB | - | - | 高（完全暴露） | 受限（32KB 上限） |
| **Simplified Hybrid (新)** | ~0.5 KB | ~30 KB | ~30 KB | 低（仅 ID） | 无限（本地无上限） |

**节省**：~44 KB / 事件（98% 体积减少）

---

### 实施优先级与风险

**优势**：
- ✅ 解决 32KB 体积限制（Outlook 仅存 rootId）
- ✅ 支持无限自定义字段扩展
- ✅ 隐私保护（Meta 不暴露给 Outlook 分享）
- ✅ 同步性能提升（体积减少 98%）
- ✅ 多设备协同（云端同步 Last-Write-Wins）

**风险**：
- ⚠️ **依赖多锚点提取成功率**（Outlook Desktop 仅 85-90%）
- ⚠️ **云端依赖**（离线场景下无法完整恢复结构化字段）
- ⚠️ **迁移复杂度**（需要将现有 Meta 迁移到本地/云端存储）
- ⚠️ **新增端到端测试**（多客户端改写场景）

**缓解措施**：
- 多锚点 Fallback（data-4d-id + id + class + comment）
- 模糊匹配兜底（Layer 3: Levenshtein similarity）
- 离线模式：允许降级为纯文本（保留 HTML）
- 分阶段迁移：先支持新事件，再逐步迁移旧事件

---
### 双向编辑策略与冲突解决

#### 核心原则

4DNote 与 Outlook 的双向同步必须明确"谁拥有编辑权"，否则会导致：
- 用户数据丢失（覆盖了用户在某一端的编辑）
- 冲突频发（两端都改了同一内容，不知道保留哪个）
- 体验混乱（用户不知道在哪里编辑什么）

#### 内容分类（Content Classification）

将事件内容分为两类，明确编辑权：

**1. 结构化字段（Structured Fields）**

**定义**：具有特定语义和格式的字段，需要精确保存其结构化信息。

**示例**：
- 自定义属性（金额、公里数、时长等）
- Tag / Contact mention
- DateMention
- 代码块的语言标记
- heading 的 level

**编辑权**：
- ✅ **4DNote 独占编辑权**
- ❌ **Outlook 只读**（或允许查看但不保存编辑）

**理由**：
- Outlook 无法理解这些字段的语义（例如"¥12.50"可能被改成"$12.50"）
- 保存结构化信息需要 Meta，而 Outlook 编辑会破坏 Meta
- 双向编辑会导致冲突难以解决（例如 4DNote 改成 15km，Outlook 改成 10km）

**同步策略**：
- Encode（4DNote → Outlook）：渲染为带"只读提示"的 HTML
  ```html
  <div data-4d-type="property" data-4d-readonly="true" style="background: #f5f5f5; padding: 4px;">
    <span>距离：5 km</span>
    <span style="color: #999; font-size: 0.9em;">（在 4DNote 中编辑）</span>
  </div>
  ```
- Decode（Outlook → 4DNote）：**完全忽略 HTML 中的值，只用 Meta**
  - Meta 存在 → 精确恢复
  - Meta 丢失 → 降级为 unknown-block（保留 raw HTML）

**2. 自由文本（Free Text）**

**定义**：纯文本内容，用户可以在任何地方编辑。

**示例**：
- paragraph 的文本内容
- heading 的标题文字（但不包括 level）
- list-item 的文本（但不包括 bulletLevel）

**编辑权**：
- ✅ **允许在 Outlook 编辑**
- ✅ **4DNote 也可以编辑**

**冲突解决**：
- 最后写入者获胜（Last Write Wins）
- 通过 `updatedAt` 时间戳判断
- 可选：检测冲突时提示用户

**同步策略**：
- Decode（Outlook → 4DNote）：**以 HTML 文本为准**（允许 Outlook 编辑）
  - 文本内容从 HTML 提取
  - Meta 仅用于结构信息（id/ts/bulletLevel 等）

#### Meta vs HTML 优先级矩阵

| 字段类型 | 写入（4DNote → Outlook） | 读取（Outlook → 4DNote） | 冲突解决 |
|---|---|---|---|
| **结构化字段** | | | |
| - 字段值 | Meta（必须） | Meta 为准，忽略 HTML | Meta wins |
| - 字段类型 | Meta（必须） | Meta 为准 | Meta wins |
| **自由文本** | | | |
| - 文本内容 | HTML（可读） | HTML 为准，Meta 仅用于 id/ts | HTML wins |
| - 段落结构 | HTML（可读） | HTML + Meta（结合） | 结构用 Meta，内容用 HTML |
| **元素类型** | | | |
| - type/level/bulletLevel | Meta（推荐） | Meta 优先，HTML 兜底 | Meta wins（降级时用 HTML） |
| **时间戳** | | | |
| - createdAt | Meta（必须） | Meta 为准 | Meta wins |
| - updatedAt | Meta（推荐） | 比较 Meta 和实际编辑时间 | 最新的 wins |

#### 实施要点

```typescript
// Decode 时的优先级判断
function decodeNode(html: string, meta: MetaNode): Node {
  const nodeType = meta?.t || inferTypeFromHtml(html);
  
  // 结构化字段：Meta 为准
  if (isStructuredField(nodeType)) {
    if (!meta || !meta.val) {
      return createUnknownBlock(html, meta);  // Meta 丢失 → 降级
    }
    return createNodeFromMeta(meta);  // ✅ 完全忽略 HTML 值
  }
  
  // 自由文本：HTML 为准
  if (isFreeText(nodeType)) {
    const textContent = extractTextFromHtml(html);
    return {
      type: nodeType,
      id: meta?.id || generateId(),
      bulletLevel: meta?.bullet || 0,  // 结构信息用 Meta
      children: [{ text: textContent }],  // ← 文本内容用 HTML
    };
  }
  
  return createUnknownBlock(html, meta);
}

function isStructuredField(type: string): boolean {
  return ['property', 'metric', 'mention', 'code-block'].includes(type);
}

function isFreeText(type: string): boolean {
  return ['paragraph', 'heading', 'list-item'].includes(type);
}
```

---
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

---

### 2026-01-09：Outlook 往返污染（“HTML 当 text 写入”）根因闭环 + 白纸重建策略

你提供的截图现象可归纳为四类“越滚越长”的污染：

1) **Slate JSON 串**（如 `[{"type":"paragraph"...}]`）被当作正文
2) **CompleteMeta Base64 串**被当作正文（长英文/数字串）
3) **签名/备注重复叠加**（多次出现“由 🔮 4DNote 最后编辑于 …”）
4) **签名里的 updatedAt 语义错误**：显示为“同步时间”而非“真实编辑时间”

#### 根因（必须写死为硬约束）

- **写出时 contentType 不匹配**：把一段“包含 HTML（甚至包含 hidden meta payload）”的内容，用 Graph `body.contentType = 'text'` 写到 Outlook。
  - 结果：Outlook/Word 引擎把标签当普通字符展示/重写，hidden 失效 → Base64/JSON 直接变成可见文本。
- **在旧污染内容上做增量追加**：下次同步又在“已经被重写且包含脏段落”的正文上继续追加签名/备注，导致文本只增不减。
- **签名更新时间用 sync time**：如果生成“最后编辑于”的时间戳使用 `now()`（同步时刻），会出现“无编辑也被标记为刚编辑”，并进一步触发重复写入。

#### 写出硬契约（Outlook Write Path）

1) **永远从 canonical 白纸重建**（White-paper rebuild）
   - 当本地存在 `event.eventlog.slateJson` 时：
     - Outlook body 必须由 `slateJson` 编码生成（HTML/文本均可，但必须是“从结构化源重建”的结果）
     - 禁止从“上一次 Outlook 回读的 description/htmlText”做拼接或增量修补后再发出
2) **contentType 与 content 必须一致**
   - 写 HTML → `body.contentType = 'html'`
   - 写纯文本 → `body.contentType = 'text'`
   - **禁止**：`contentType='text'` 但 content 实际是 HTML 字符串（这是截图污染的核心触发条件）
3) **签名幂等**
   - 若仍保留可见签名：必须 “strip → append” 或在重建时一次性渲染
   - 不允许在已含签名的正文上继续 append
4) **签名时间戳语义**
   - 签名中的 `updatedAt` 必须使用“真实编辑时间”（`Event.updatedAt` / 用户保存时间）
   - 同步过程的时间（sync timestamp）只能用于日志/同步元信息，不得进入用户可见签名

#### 入库前/入库后自检与自动清洗（非脚本，运行时闭环）

这部分是“防线没挡住时的保险丝”，目标是：**任何一次入库完成后，本地必须回到干净 canonical 状态**，下次发出从白纸重建。

- **Pre-ingest sanitize（入库前清洗）**：Outlook → App 时，在生成/更新 `eventlog` 前先做清洗：
  - 移除 `#4dnote-meta`（无论其以 DOM 存在还是被剥标签后以文本泄漏）
  - 过滤可解码为 4DNote meta JSON 的 Base64 token（避免进入 paragraph）
  - 移除/识别并剥离历史签名块，提取 core content
- **Post-ingest verify/repair（入库后自检/修复）**：落库后做一次轻量检测：
  - 若发现 `plainText/html` 中出现“Base64 meta / Slate JSON 串 / 重复签名模式”，则：
    - 重建派生字段（`eventlog.html/plainText`）
    - 必要时标记事件进入 Repair 队列（可控地触发一次“重写 Outlook”以覆盖旧污染）

#### 验收口径（与 5 次同步循环对齐）

- 同一事件连续 5 次：本地 `eventlog` 不应发生无意义变化（id/ts 不漂移；plainText 不增长）
- Outlook 正文：不出现 Base64/Slate JSON 作为可见正文；签名最多一份；签名时间与真实编辑时间一致

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
  - 对外写入时明确 `contentType`，并优先写 `eventlog.html`（来自 `eventlog.slateJson` 的白纸重建）
  - 禁止 HTML 当 text 写入；否则会触发“标签剥离 + Base64/JSON 变可见正文 + 签名重复堆叠”
  - 避免写了不完整 HTML 导致 Outlook/Exchange 强制规范化为 `.PlainText` div 列表

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
**Meta 分级策略（体积控制）**

> ⚠️ **架构变更提醒**（2026-01-09）：随着 Simplified Hybrid Storage 的引入，Meta 分级策略的意义已发生变化：
> - **Outlook Meta**：仅存储 `rootId`（~0.5 KB），无需分级压缩
> - **本地/云端 Meta**：无体积限制，可存储完整元数据
> - 以下策略仅适用于过渡期（Full Meta → Hybrid 迁移过程中）

为避免 Meta 超过 32KB 限制（Outlook 同步时），需要对 Meta 字段进行分级：

```typescript
// Meta 分级策略
const metaTiers = {
  // Tier 1: 锚点必需字段（总是保存）
  tier1_Anchor: {
    fields: ['id', 's', 'e', 'l'],
    maxSize: '~50 bytes/block',
    reason: '三层匹配必需，缺失会导致对齐失败',
    policy: {
      localOnly: '总是保存',
      needSync: '总是保存',
    },
  },
  
  // Tier 2: 类型恢复字段（通常必需）⚠️ 不能随便丢
  tier2_Recovery: {
    fields: ['t', 'lvl', 'bullet', 'ts', 'ut'],
    maxSize: '~30 bytes/block',
    reason: '元素类型恢复必需，丢失会导致 heading → paragraph 等降级',
    policy: {
      localOnly: '总是保存',
      needSync: '总是保存（除非体积极端紧张）',
    },
    note: 'HTML 可能被 Outlook 改写，不能依赖 HTML 推断类型',
  },
  
  // Tier 3: 增强字段（可选）
  tier3_Enhancement: {
    fields: ['mention.targetId', 'property.payload', 'hints'],
    maxSize: '~100-200 bytes/block',
    reason: '增强体验，但可从 HTML 模糊推断或降级',
    policy: {
      localOnly: '总是保存',
      needSync: '根据剩余空间决定',
    },
    compression: [
      '如果接近 32KB，先丢弃 Tier 3',
      '如果还不够，压缩 s/e（5字符 → 3字符）',
      '如果还不够，报错提示用户简化内容',
    ],
  },
};

// 动态压缩实现
class MetaEncoder {
  encode(slateJson: Node[], syncStatus: string): string {
    const meta = this.buildMeta(slateJson, syncStatus);
    const metaStr = JSON.stringify(meta);
    
    // local-only 事件无限制
    if (syncStatus === 'local-only' || metaStr.length <= 32 * 1024) {
      return metaStr;
    }
    
    // 需要同步且接近上限 → 启动压缩
    return this.compressMeta(meta);
  }
  
  compressMeta(meta: CompleteMetaV2): string {
    // 1. 丢弃 Tier 3（增强字段）
    const tier2Meta = this.dropTier3(meta);
    if (JSON.stringify(tier2Meta).length < 32 * 1024) {
      console.warn('Meta 接近上限，已丢弃增强字段（mention payload 等）');
      return JSON.stringify(tier2Meta);
    }
    
    // 2. 压缩锚点（5字符 → 3字符）
    const compressedMeta = this.compressAnchors(tier2Meta);
    if (JSON.stringify(compressedMeta).length < 32 * 1024) {
      console.warn('Meta 接近上限，已压缩锚点长度');
      return JSON.stringify(compressedMeta);
    }
    
    // 3. 仍然超限 → 报错
    throw new Error(
      'Event 内容过于复杂，Meta 超过 32KB 限制。建议拆分为多个事件或减少段落数。'
    );
  }
  
  dropTier3(meta: CompleteMetaV2): CompleteMetaV2 {
    return {
      ...meta,
      slate: {
        nodes: meta.slate.nodes.map(node => ({
          id: node.id,
          s: node.s,
          e: node.e,
          l: node.l,
          ts: node.ts,
          ut: node.ut,
          lvl: node.lvl,
          bullet: node.bullet,
          // ❌ 丢弃 mention、property.payload 等 Tier 3 字段
        })),
      },
    };
  }
  
  compressAnchors(meta: CompleteMetaV2): CompleteMetaV2 {
    return {
      ...meta,
      slate: {
        nodes: meta.slate.nodes.map(node => ({
          ...node,
          s: node.s?.substring(0, 3),  // 5 → 3 字符
          e: node.e?.substring(0, 3),
        })),
      },
    };
  }
}
```

**体积估算**：
- 普通事件（20 段落）：Tier 1 + Tier 2 ≈ 1.6 KB（安全）
- 复杂事件（50 段落 + 自定义字段）：Tier 1 + Tier 2 ≈ 4 KB，Tier 3 可能 +10 KB（需要压缩）
- 极端事件（100+ 段落）：可能需要拆分事件

**策略总结**：
- ✅ Tier 1（锚点）：永远保留
- ⚠️ Tier 2（类型）：通常保留，极端情况可考虑丢弃部分时间戳
- 🔄 Tier 3（增强）：根据剩余空间动态决定
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

#### 3) 三层匹配策略增强（加入模糊匹配层）

**当前实现的三层匹配**：
- Layer 1: Meta 精确匹配（`s/e/l` 完全相同）
- Layer 2: HTML 结构匹配（基于标签语义）
- Layer 3: fallback 降级

**问题**：Outlook 会改写 HTML，导致锚点失效

常见改写场景：
- 段落合并：`<p>第一段</p><p>第二段</p>` → `<div class="PlainText">第一段<br>第二段</div>`
- 空行插入：`<p>内容</p>` → `<p>&nbsp;</p><p>内容</p><p>&nbsp;</p>`
- 列表改写：`<ul><li>项目</li></ul>` → `<p style="mso-list:...">• 项目</p>`
- 实体化：`¥12.50` → `&yen;12.50`

这些改写会导致 Layer 1 精确匹配失败，成功率可能只有 60-70%。

**改进方案**：引入模糊匹配层（五层匹配）⭐

> ⚠️ **架构对齐**（2026-01-09）：此五层匹配策略与 Simplified Hybrid Storage 的五层匹配策略互补：
> - **此处的四层**：Layer 1 精确 → Layer 2 模糊 → Layer 3 结构 → Layer 4 兜底（基于文本锚点的传统方案）
> - **Hybrid 的五层**：Layer 1 多锚点ID → Layer 2 文本精确 → Layer 3 文本模糊 → Layer 4 结构 → Layer 5 兜底（优先 ID，文本兜底）
> - 最终实施时应统一为 Hybrid 方案的五层匹配

```typescript
// 改进后的四层匹配
const improvedMatching = {
  layer1_Exact: {
    condition: 'prefix/suffix/length 完全匹配',
    confidence: 1.0,
    successRate: '60-70%（Outlook 改写频繁）',
  },
  
  layer2_Fuzzy: {  // ⭐ 新增
    condition: '文本相似度 > 0.85（容忍 Outlook 改写）',
    confidence: 0.8,
    successRate: '85-95%（大幅提升）',
    
    algorithm: {
      step1: '去除噪音（空白、&nbsp;、HTML 实体等）',
      step2: '计算 Levenshtein 编辑距离',
      step3: '相似度 = 1 - (距离 / max(len1, len2))',
      step4: '相似度 > 0.85 认为匹配成功',
    },
  },
  
  layer3_Structure: {
    condition: 'HTML 标签语义匹配',
    confidence: 0.6,
    successRate: '95%+（HTML 标签通常保留）',
  },
  
  layer4_Fallback: {
    condition: 'unknown-block 兜底',
    confidence: 0.0,
    successRate: '100%（必定成功）',
  },
};

// 实现示例
class FuzzyMatcher {
  match(metaNode: MetaNode, htmlText: string): number {
    // 1. 清洗文本
    const metaText = this.cleanText(metaNode.s + metaNode.e);
    const cleanHtml = this.cleanText(htmlText);
    
    // 2. 计算相似度
    const similarity = this.levenshteinSimilarity(metaText, cleanHtml);
    
    return similarity > 0.85 ? similarity : 0;
  }
  
  cleanText(text: string): string {
    return text
      .replace(/\s+/g, '')  // 去除所有空白
      .replace(/&nbsp;/gi, '')
      .replace(/&yen;/gi, '¥')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .toLowerCase();
  }
  
  levenshteinSimilarity(a: string, b: string): number {
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : (1 - distance / maxLen);
  }
  
  levenshteinDistance(a: string, b: string): number {
    // 标准 Levenshtein 算法实现（略）
    // 参考：https://en.wikipedia.org/wiki/Levenshtein_distance
  }
}
```

**预期效果**：
- Layer 1 精确匹配：60-70% 成功率
- Layer 1 + Layer 2 模糊匹配：85-95% 成功率（提升 15-25%）
- Layer 3 结构匹配：95%+ 成功率
- Layer 4 兜底：100% 成功率（降级为 unknown-block）

**匹配成功后的 merge 输出**：`applyMatchResults()` 会把 `id/ts/ut/lvl/bullet/mention` 合并回最终 Slate 节点：
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
### Phase 2：抽离 EventLogCodec + HtmlAdapter + LocalBlockStore（P1）

1) 从 `EventService` 抽 `EventLogHtmlAdapter`（DOM 清洗、Outlook 特化）。
2) 抽 `EventLogCodec`（encode/decode、五层匹配、锚点对齐）。
3) **新增 `LocalBlockStore`**（IndexedDB 存储 block-level metadata）。
4) **新增 `CloudSyncService`**（云端同步、Last-Write-Wins、冲突检测）。
5) `EventService` 仅编排：写入前调用 codec/normalizer/blockStore，存储与广播不直接处理 DOM。
6) **架构对齐**：
   - ⚠️ IR 仅在 codec 内部使用，**不暴露为全局状态层**
   - encode 时根据 `syncStatus` 决定 Meta 策略：
     - **local-only**：完整 Meta 存本地，Outlook 仅 rootId
     - **needSync**：Outlook 仅 rootId，本地完整 Meta + 云端同步
   - 对外接口仍然是 Slate JSON（与现有架构无缝对接）

### Phase 3：契约测试与 fuzz（P1）

- 元素契约测试（每新增元素必须过）：
  1) `normalize(normalize(x)) == normalize(x)`（幂等）
  2) `decode(encode(x)) ~= x`（允许版本迁移差异）
  3) Meta 缺失/破损时：仍能 decode 成合法树（unknown-block）
- Outlook 噪音注入 fuzz：模拟 MsoList、空行、样式污染、段落删除/插入/乱序。
- **多锚点提取测试**：
  - 模拟 Outlook Desktop/Web/Mobile 的 data-4d-id 丢失场景
  - 验证 id/class/comment fallback 机制
  - 验证五层匹配的成功率（目标：Desktop 85%+, Web 95%+, Mobile 75%+）
- **云端同步测试**：
  - 多设备并发编辑 → Last-Write-Wins 合并
  - 离线编辑 → 重新联网后同步
  - 冲突检测与解决

### Phase 4：数据迁移与兼容（P1）

- **迁移策略**：渐进式，先支持新事件，再迁移旧事件
  1) **新事件**：直接使用 Simplified Hybrid Storage
  2) **旧事件（首次回读）**：
     - 从 Outlook Meta 提取 block metadata → 存入 LocalBlockStore
     - 下次同步时改用 Simplified Hybrid 格式
  3) **批量迁移工具**（可选）：后台逐步迁移历史事件
- **回退机制**：保留 Full Meta 读取能力（兼容旧格式）
- **验证**：确保迁移前后事件内容一致（文本/结构/metadata）

### Phase 5：新增 Notion 级元素（P2）

按 Tier A→B 顺序实现：
- **Week 1-2**: heading（目录可由派生视图生成，不必写回 storage）
- **Week 3-4**: code-block
- **Week 5-6**: property/metric（用户自定义字段）
- **Week 7-8**: table（先只读或有限编辑，保证可回读）

每个元素都需要：
- 实现 `normalize + encodeToHtml + decodeFromHtml + fallbackDecode`
- block metadata 定义（存入 LocalBlockStore）
- 通过契约测试
- 不破坏现有同步功能

---

## 里程碑时间线（小步迭代，调整为现实预期）

> ⚠️ **时间线调整说明**（2026-01-09）：
> - 原计划 6-7 周（过于乐观）
> - 调整为 **12-14 周**（考虑 LocalBlockStore/CloudSync 实现 + 数据迁移 + 多端测试）

| Phase | 目标 | 时长 | 验收标准 |
|---|---|---|---|
| Phase 0 | 永不崩底座 | 1 周 | Outlook 回读不崩、unknown-block 机制 |
| Phase 1 | 元素注册机制 | 1-2 周 | registry 驱动 normalize、EventHub 集成 |
| Phase 2 | Hybrid Storage 实现 | 3-4 周 | LocalBlockStore/CloudSync/五层匹配/多锚点提取 |
| Phase 3 | 契约测试 + 多端验证 | 2 周 | 幂等性、encode/decode 往返、fuzz 测试、多客户端测试 |
| Phase 4 | 数据迁移与兼容 | 1-2 周 | 新旧格式兼容、渐进式迁移、回退机制 |
| Phase 5 | 富元素扩展 | 4-5 周 | heading/code/property/table 逐步上线 |

**总时长**：**12-14 周**（每 1-2 周一个可验证里程碑）

**关键里程碑**：
- Week 4: LocalBlockStore + 多锚点提取可用
- Week 8: CloudSync + 五层匹配可用
- Week 10: 数据迁移完成，新旧格式兼容
- Week 14: 所有 Tier A 元素（heading/code/property）上线

---

## 验收标准（v2 增补 + Hybrid Storage）

### 基础能力（Hard Requirements）

1) 任意 Outlook 回读内容都能生成合法文档树（不崩、不丢）。
2) 未识别元素统一落为 `unknown-block` 并保留 raw 信息，可再次同步。
3) 新增元素不需要修改 `normalizeEvent()` 主流程：只需注册 descriptor + 测试用例。
4) 重型 DOM 清洗不在 `EventService` 内部直接发生（通过 adapter）。
5) 读路径不触发重型迁移（迁移只在写入或 repair 显式触发）。

### Hybrid Storage 能力（Simplified Hybrid）

6) **多锚点提取成功率**：
   - Outlook Desktop: ≥ 85%
   - Outlook Web: ≥ 95%
   - Outlook Mobile: ≥ 75%
   - 测试方法：模拟 data-4d-id 丢失，验证 id/class/comment fallback

7) **五层匹配成功率**：
   - Layer 1（多锚点ID）+ Layer 2（文本精确）：≥ 90%
   - Layer 1-3（含文本模糊）：≥ 95%
   - Layer 1-4（含结构匹配）：≥ 98%
   - Layer 5（unknown-block）：100%（必定成功）

8) **云端同步可靠性**：
   - 多设备并发编辑：block-level Last-Write-Wins 正确合并
   - 离线编辑后联网：3 秒内完成同步（debounce）
   - 冲突检测：提示用户或自动合并（无数据丢失）

9) **数据迁移完整性**：
   - 新旧格式兼容：Full Meta 事件可正常读取
   - 迁移后一致性：文本/结构/metadata 与迁移前完全一致
   - 回退能力：可回退到 Full Meta 方案（不丢数据）

10) **体积与性能**：
    - Outlook Meta 体积：≤ 1 KB / 事件（vs 当前 10-30 KB）
    - 同步性能提升：≥ 3x（体积减少 98%）
    - 本地存储：无上限（支持无限自定义字段）

---

## 给 Copilot 的一句话指令（v2 + Hybrid Storage）

请不要在 `EventService.normalizeEvent/normalizeEventLog` 中继续堆 `if/else` 来支持新元素。优先实现：

1. **架构重构**：`ElementRegistry + DocumentNormalizer + EventLogCodec + UnknownBlockHandler`
2. **Hybrid Storage**：`LocalBlockStore + CloudSyncService + MultiAnchorExtractor + HybridMatcher`
3. **Outlook 适配**：将 DOM 清洗抽到 `EventLogHtmlAdapter`
4. **安全保障**：所有新元素必须提供 `decode + fallbackDecode`，保证回读永不崩且不丢

**核心原则**：
- Outlook 仅存 `rootId`（~0.5 KB）
- 本地/云端存完整 block metadata（无限制）
- 多锚点 fallback（data-4d-id → id → class → comment）
- 五层匹配策略（ID 精确 → 文本精确 → 文本模糊 → 结构 → unknown-block）
- Last-Write-Wins 云端同步（block-level 合并）
